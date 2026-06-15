package expo.modules.androidclockalarm

import android.app.KeyguardManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager

class FocusLockScreenService : Service() {
  companion object {
    private const val AUTO_LOCK_FIRST_ATTEMPT_DELAY_MS = 650L
    private const val AUTO_LOCK_SECOND_ATTEMPT_DELAY_MS = 1_800L
    private const val LOCK_STATE_CHECK_INTERVAL_MS = 5_000L
  }

  private val handler = Handler(Looper.getMainLooper())
  private var screenReceiver: BroadcastReceiver? = null
  private var activeSessionId: String? = null

  private val completionTicker = object : Runnable {
    override fun run() {
      val session = FocusLockScreenStore.get(applicationContext)
      if (
        session == null ||
        session.status != FocusLockScreenContract.STATUS_ACTIVE ||
        session.sessionId != activeSessionId
      ) {
        stopSelf()
        return
      }

      val remainingMillis = session.expectedEndAtMillis - System.currentTimeMillis()
      if (remainingMillis <= 0L) {
        FocusLockScreenController.complete(
          context = applicationContext,
          sessionId = session.sessionId,
          notify = true,
          readAloud = true
        )
        return
      }

      showActivityIfLocked(session)
      handler.postDelayed(
        this,
        remainingMillis.coerceIn(1_000L, LOCK_STATE_CHECK_INTERVAL_MS)
      )
    }
  }

  override fun onCreate() {
    super.onCreate()
    registerScreenReceiver()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      FocusLockScreenContract.ACTION_STOP_FOCUS_SESSION_FROM_JS -> {
        val sessionId = intent.getStringExtra(FocusLockScreenContract.EXTRA_SESSION_ID)
          ?: activeSessionId
          ?: return START_NOT_STICKY
        FocusLockScreenController.stopFromJs(applicationContext, sessionId)
        return START_NOT_STICKY
      }

      FocusLockScreenContract.ACTION_STOP_FOCUS_SESSION -> {
        val sessionId = intent.getStringExtra(FocusLockScreenContract.EXTRA_SESSION_ID)
          ?: activeSessionId
          ?: return START_NOT_STICKY
        FocusLockScreenController.requestStopFromNative(applicationContext, sessionId)
        return START_NOT_STICKY
      }

      FocusLockScreenContract.ACTION_COMPLETE_FOCUS_SESSION -> {
        val sessionId = intent.getStringExtra(FocusLockScreenContract.EXTRA_SESSION_ID)
          ?: activeSessionId
          ?: return START_NOT_STICKY
        FocusLockScreenController.complete(
          context = applicationContext,
          sessionId = sessionId,
          notify = true,
          readAloud = true
        )
        return START_NOT_STICKY
      }

      else -> {
        val session = FocusLockScreenSession.fromIntent(intent)
          ?: FocusLockScreenStore.get(applicationContext)
          ?: return START_NOT_STICKY
        startOrUpdateForeground(session)
      }
    }

    return START_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    unregisterScreenReceiver()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun startOrUpdateForeground(session: FocusLockScreenSession) {
    activeSessionId = session.sessionId
    FocusNotificationHelper.ensureChannels(applicationContext)
    val notification = FocusNotificationHelper.buildOngoingNotification(applicationContext, session)

    try {
      startForeground(FocusLockScreenContract.ONGOING_NOTIFICATION_ID, notification)
    } catch (_: Exception) {
      FocusNotificationHelper.showOngoing(applicationContext, session)
    }

    handler.removeCallbacks(completionTicker)
    completionTicker.run()
    showActivityIfLocked(session)
  }

  private fun registerScreenReceiver() {
    if (screenReceiver != null) return

    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent?) {
        val session = FocusLockScreenStore.get(context) ?: return
        if (session.status != FocusLockScreenContract.STATUS_ACTIVE) return

        when (intent?.action) {
          Intent.ACTION_SCREEN_OFF -> scheduleAutoLockFocusView(session)
          Intent.ACTION_SCREEN_ON -> showActivityIfLocked(
            session = session,
            refreshFullScreenNotification = true
          )
        }
      }
    }
    screenReceiver = receiver

    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_SCREEN_OFF)
      addAction(Intent.ACTION_SCREEN_ON)
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
    try {
      unregisterReceiver(receiver)
    } catch (_: Exception) {
      // Receiver may already be unregistered.
    } finally {
      screenReceiver = null
    }
  }

  private fun scheduleAutoLockFocusView(session: FocusLockScreenSession) {
    if (FocusLockScreenLaunchGate.isSuppressed(applicationContext)) return

    FocusNotificationHelper.showOngoing(applicationContext, session)
    scheduleAutoLockFocusViewAttempt(session.sessionId, AUTO_LOCK_FIRST_ATTEMPT_DELAY_MS)
    scheduleAutoLockFocusViewAttempt(session.sessionId, AUTO_LOCK_SECOND_ATTEMPT_DELAY_MS)
  }

  private fun scheduleAutoLockFocusViewAttempt(sessionId: String, delayMs: Long) {
    handler.postDelayed(
      {
        val latestSession = FocusLockScreenStore.get(applicationContext) ?: return@postDelayed
        if (
          latestSession.sessionId != sessionId ||
          latestSession.status != FocusLockScreenContract.STATUS_ACTIVE
        ) {
          return@postDelayed
        }

        showActivityIfLocked(
          session = latestSession,
          refreshFullScreenNotification = true
        )
      },
      delayMs
    )
  }

  private fun showActivityIfLocked(
    session: FocusLockScreenSession,
    refreshFullScreenNotification: Boolean = false
  ) {
    if (FocusLockScreenLaunchGate.isSuppressed(applicationContext)) return

    val keyguardManager = getSystemService(KeyguardManager::class.java)
    val powerManager = getSystemService(PowerManager::class.java)
    val isLocked = keyguardManager?.isKeyguardLocked == true
    val isScreenOff = powerManager?.isInteractive == false
    if (!isLocked && !isScreenOff) return

    if (refreshFullScreenNotification) {
      FocusNotificationHelper.showOngoing(applicationContext, session)
    }

    try {
      startActivity(FocusNotificationHelper.buildShowFocusIntent(applicationContext, session))
    } catch (_: Exception) {
      // Android may restrict full-screen activity launches; the notification remains.
    }
  }
}
