package expo.modules.screenawareness

import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager

class ScreenAwarenessForegroundService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private lateinit var tracker: ScreenAwarenessSessionTracker
  private var screenReceiver: BroadcastReceiver? = null
  private var lastStatusUsageAccess: Boolean? = null

  private val tickRunnable = object : Runnable {
    override fun run() {
      if (!ScreenAwarenessStore.getSettings(applicationContext).enabled) {
        stopSelf()
        return
      }
      val interactive = isScreenInteractive()
      val usageGranted = ScreenAwarenessAccess.hasUsageAccess(applicationContext)
      updateStatusNotification(usageGranted)

      if (interactive && usageGranted) {
        tracker.updateForegroundPackage(
          ScreenAwarenessUsageRepository.getRecentForegroundPackage(applicationContext)
        )
        tracker.tick(interactive = true)?.let(::showWarning)
      } else if (!interactive) {
        tracker.onScreenOff()
      }

      if (interactive || !usageGranted) {
        handler.postDelayed(this, ScreenAwarenessContract.POLL_INTERVAL_MS)
      }
    }
  }

  override fun onCreate() {
    super.onCreate()
    tracker = ScreenAwarenessSessionTracker(applicationContext)
    activeInstance = this
    registerScreenReceiver()
    val usageGranted = ScreenAwarenessAccess.hasUsageAccess(applicationContext)
    startAsForeground(usageGranted)
    tracker.onServiceStarted(isScreenInteractive())
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (!ScreenAwarenessStore.getSettings(applicationContext).enabled) {
      stopSelf()
      return START_NOT_STICKY
    }
    handler.removeCallbacks(tickRunnable)
    tickRunnable.run()
    return START_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    unregisterScreenReceiver()
    ScreenAwarenessOverlayManager.remove()
    if (activeInstance === this) activeInstance = null
    if (!ScreenAwarenessStore.getSettings(applicationContext).enabled) {
      tracker.finishForDisable()
      ScreenAwarenessNotificationHelper.cancelAll(applicationContext)
    }
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun showWarning(warning: ScreenAwarenessWarning) {
    val settings = ScreenAwarenessStore.getSettings(applicationContext)
    val overlayShown = if (settings.showOverlay) {
      ScreenAwarenessOverlayManager.show(
        applicationContext,
        warning.thresholdMinutes,
        warning.followUp
      )
    } else {
      false
    }
    val notificationSettings = if (settings.showOverlay && !overlayShown) {
      settings.copy(showNotification = true)
    } else {
      settings
    }
    ScreenAwarenessNotificationHelper.showWarning(
      applicationContext,
      warning.thresholdMinutes,
      notificationSettings,
      warning.followUp
    )
  }

  private fun handleAction(action: String, thresholdMinutes: Int) {
    tracker.applyAction(action, thresholdMinutes)
    ScreenAwarenessOverlayManager.remove()
    ScreenAwarenessNotificationHelper.cancelWarning(applicationContext)
  }

  private fun registerScreenReceiver() {
    if (screenReceiver != null) return
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        when (intent?.action) {
          Intent.ACTION_SCREEN_OFF -> {
            handler.removeCallbacks(tickRunnable)
            tracker.onScreenOff()
            ScreenAwarenessOverlayManager.remove()
          }
          Intent.ACTION_SCREEN_ON, Intent.ACTION_USER_PRESENT -> {
            val reset = tracker.onScreenOn()
            if (reset) {
              ScreenAwarenessNotificationHelper.cancelWarning(applicationContext)
            }
            handler.removeCallbacks(tickRunnable)
            tickRunnable.run()
          }
        }
      }
    }
    screenReceiver = receiver
    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_SCREEN_ON)
      addAction(Intent.ACTION_SCREEN_OFF)
      addAction(Intent.ACTION_USER_PRESENT)
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        @Suppress("DEPRECATION")
        registerReceiver(receiver, filter)
      }
    } catch (_: Exception) {
      screenReceiver = null
    }
  }

  private fun unregisterScreenReceiver() {
    val receiver = screenReceiver ?: return
    screenReceiver = null
    try {
      unregisterReceiver(receiver)
    } catch (_: Exception) {
      // Receiver may already have been removed during process teardown.
    }
  }

  private fun startAsForeground(usageGranted: Boolean) {
    val notification = ScreenAwarenessNotificationHelper.buildStatusNotification(
      applicationContext,
      usageGranted
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(
        ScreenAwarenessContract.STATUS_NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
      )
    } else {
      startForeground(ScreenAwarenessContract.STATUS_NOTIFICATION_ID, notification)
    }
    lastStatusUsageAccess = usageGranted
  }

  private fun updateStatusNotification(usageGranted: Boolean) {
    if (lastStatusUsageAccess == usageGranted) return
    lastStatusUsageAccess = usageGranted
    val notification = ScreenAwarenessNotificationHelper.buildStatusNotification(
      applicationContext,
      usageGranted
    )
    getSystemService(android.app.NotificationManager::class.java)?.notify(
      ScreenAwarenessContract.STATUS_NOTIFICATION_ID,
      notification
    )
  }

  private fun isScreenInteractive(): Boolean =
    getSystemService(PowerManager::class.java)?.isInteractive == true

  companion object {
    @Volatile
    private var activeInstance: ScreenAwarenessForegroundService? = null

    fun isRunning(): Boolean = activeInstance != null

    fun dispatchAction(context: Context, action: String, thresholdMinutes: Int) {
      val safeThreshold = thresholdMinutes.takeIf {
        it in ScreenAwarenessContract.SUPPORTED_THRESHOLDS
      } ?: 20
      val service = activeInstance
      if (service != null) {
        service.handler.post { service.handleAction(action, safeThreshold) }
      } else {
        ScreenAwarenessSessionTracker(context.applicationContext)
          .applyAction(action, safeThreshold)
        ScreenAwarenessOverlayManager.remove()
        ScreenAwarenessNotificationHelper.cancelWarning(context.applicationContext)
        ScreenAwarenessController.ensureRunning(context.applicationContext)
      }
    }
  }
}
