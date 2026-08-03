package expo.modules.androidclockalarm

import android.app.ActivityManager
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
    private const val REMINDER_INTERVAL_MS = 120_000L
    private const val REMINDER_BOUNDARY_GRACE_MS = 7_500L
    private const val REMINDER_END_BUFFER_MS = 10_000L
    private const val WAKE_LOCK_END_BUFFER_MS = 30_000L
  }

  private val handler = Handler(Looper.getMainLooper())
  private var screenReceiver: BroadcastReceiver? = null
  private var activeSessionId: String? = null
  private var reminderSessionId: String? = null
  private var lastReminderBoundaryMs: Long? = null
  private var sessionWakeLock: PowerManager.WakeLock? = null

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

      val nowMillis = System.currentTimeMillis()
      val remainingMillis = session.expectedEndAtMillis - nowMillis
      if (remainingMillis <= 0L) {
        FocusLockScreenController.complete(
          context = applicationContext,
          sessionId = session.sessionId,
          notify = true,
          readAloud = true
        )
        return
      }

      playReminderIfDue(session, nowMillis, remainingMillis)
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
    releaseSessionWakeLock()
    unregisterScreenReceiver()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun startOrUpdateForeground(session: FocusLockScreenSession) {
    activeSessionId = session.sessionId
    if (reminderSessionId != session.sessionId) {
      reminderSessionId = session.sessionId
      lastReminderBoundaryMs = null
    }
    acquireSessionWakeLock(session)
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
    if (!session.showLockScreen) return
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
    if (!session.showLockScreen) return
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

  private fun playReminderIfDue(
    session: FocusLockScreenSession,
    nowMillis: Long,
    remainingMillis: Long
  ) {
    if (remainingMillis <= REMINDER_END_BUFFER_MS) return

    val elapsedMillis = (nowMillis - session.startedAtMillis)
      .coerceIn(0L, session.totalMillis)
    val reminderBoundaryMs =
      (elapsedMillis / REMINDER_INTERVAL_MS) * REMINDER_INTERVAL_MS
    val millisecondsPastBoundary = elapsedMillis - reminderBoundaryMs
    val isNearBoundary = millisecondsPastBoundary <= REMINDER_BOUNDARY_GRACE_MS
    if (
      reminderBoundaryMs <= 0L ||
      !isNearBoundary ||
      lastReminderBoundaryMs == reminderBoundaryMs
    ) {
      return
    }

    lastReminderBoundaryMs = reminderBoundaryMs
    if (isAppVisiblyActive()) return
    FocusSoundPlayer.playReminder(applicationContext)
  }

  private fun isAppVisiblyActive(): Boolean {
    val powerManager = getSystemService(PowerManager::class.java)
    if (powerManager?.isInteractive != true) return false

    val keyguardManager = getSystemService(KeyguardManager::class.java)
    if (keyguardManager?.isKeyguardLocked == true) return false

    val processInfo = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(processInfo)
    return processInfo.importance ==
      ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
  }

  private fun acquireSessionWakeLock(session: FocusLockScreenSession) {
    val remainingMillis = session.expectedEndAtMillis - System.currentTimeMillis()
    if (remainingMillis <= 0L) return

    releaseSessionWakeLock()
    try {
      val powerManager = getSystemService(PowerManager::class.java) ?: return
      sessionWakeLock = powerManager.newWakeLock(
        PowerManager.PARTIAL_WAKE_LOCK,
        "$packageName:focus-session-timer"
      ).apply {
        setReferenceCounted(false)
        acquire(remainingMillis + WAKE_LOCK_END_BUFFER_MS)
      }
    } catch (_: Exception) {
      sessionWakeLock = null
    }
  }

  private fun releaseSessionWakeLock() {
    val wakeLock = sessionWakeLock
    sessionWakeLock = null
    if (wakeLock?.isHeld != true) return
    try {
      wakeLock.release()
    } catch (_: Exception) {
      // The timeout may have released the wake lock already.
    }
  }
}
