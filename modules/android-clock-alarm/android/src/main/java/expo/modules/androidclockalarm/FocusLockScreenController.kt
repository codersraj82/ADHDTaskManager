package expo.modules.androidclockalarm

import android.content.Context
import android.content.Intent
import android.os.Build

internal object FocusLockScreenController {
  fun start(context: Context, session: FocusLockScreenSession): Map<String, Any?> {
    if (session.expectedEndAtMillis <= System.currentTimeMillis()) {
      return errorResult(
        errorCode = "INVALID_TIME",
        message = "Focus session end time must be in the future.",
        sessionId = session.sessionId
      )
    }

    val appContext = context.applicationContext
    val activeSession = session.copy(status = FocusLockScreenContract.STATUS_ACTIVE)
    FocusLockScreenStore.save(appContext, activeSession)
    FocusLockScreenScheduler.scheduleCompletion(appContext, activeSession)

    val serviceIntent = Intent(appContext, FocusLockScreenService::class.java).apply {
      action = FocusLockScreenContract.ACTION_START_FOCUS_SESSION
      activeSession.putExtras(this)
    }
    startServiceSafely(appContext, serviceIntent)

    return mapOf(
      "success" to true,
      "sessionId" to activeSession.sessionId,
      "message" to "Focus lock-screen session started."
    )
  }

  fun update(context: Context, session: FocusLockScreenSession): Map<String, Any?> {
    if (session.expectedEndAtMillis <= System.currentTimeMillis()) {
      complete(
        context = context,
        sessionId = session.sessionId,
        notify = true,
        readAloud = session.readAloudOnComplete
      )
      return mapOf(
        "success" to true,
        "sessionId" to session.sessionId,
        "message" to "Focus session already reached completion."
      )
    }

    val appContext = context.applicationContext
    val activeSession = session.copy(status = FocusLockScreenContract.STATUS_ACTIVE)
    FocusLockScreenStore.save(appContext, activeSession)
    FocusLockScreenScheduler.cancelCompletion(appContext, activeSession.sessionId)
    FocusLockScreenScheduler.scheduleCompletion(appContext, activeSession)

    val serviceIntent = Intent(appContext, FocusLockScreenService::class.java).apply {
      action = FocusLockScreenContract.ACTION_UPDATE_FOCUS_SESSION
      activeSession.putExtras(this)
    }
    startServiceSafely(appContext, serviceIntent)

    return mapOf(
      "success" to true,
      "sessionId" to activeSession.sessionId,
      "message" to "Focus lock-screen session updated."
    )
  }

  fun stopFromJs(context: Context, sessionId: String): Map<String, Any?> {
    val appContext = context.applicationContext
    FocusLockScreenScheduler.cancelCompletion(appContext, sessionId)
    FocusNotificationHelper.cancelOngoing(appContext)
    FocusLockScreenStore.remove(appContext)
    sendCloseActivityBroadcast(appContext, sessionId)
    stopServiceSafely(appContext)
    return mapOf(
      "success" to true,
      "sessionId" to sessionId,
      "message" to "Focus lock-screen session stopped."
    )
  }

  fun requestStopFromNative(context: Context, sessionId: String): Map<String, Any?> {
    val appContext = context.applicationContext
    val storedSession = FocusLockScreenStore.get(appContext)
    val stoppedSession = if (storedSession?.sessionId == sessionId) {
      storedSession.copy(status = FocusLockScreenContract.STATUS_STOPPED)
    } else {
      FocusLockScreenSession(
        sessionId = sessionId,
        taskId = null,
        taskTitle = "Focus Session",
        startedAtMillis = System.currentTimeMillis(),
        expectedEndAtMillis = System.currentTimeMillis() + 1L,
        durationMinutes = 1,
        readAloudOnComplete = false,
        status = FocusLockScreenContract.STATUS_STOPPED
      )
    }

    FocusLockScreenStore.save(appContext, stoppedSession)
    FocusLockScreenScheduler.cancelCompletion(appContext, sessionId)
    FocusNotificationHelper.cancelOngoing(appContext)
    sendCloseActivityBroadcast(appContext, sessionId)
    stopServiceSafely(appContext)

    return mapOf(
      "success" to true,
      "sessionId" to sessionId,
      "message" to "Focus stop requested."
    )
  }

  fun complete(
    context: Context,
    sessionId: String,
    notify: Boolean,
    readAloud: Boolean
  ): Map<String, Any?> {
    val appContext = context.applicationContext
    val storedSession = FocusLockScreenStore.get(appContext)
    val session = if (storedSession?.sessionId == sessionId) {
      storedSession
    } else {
      return errorResult(
        errorCode = "SESSION_NOT_FOUND",
        message = "No active focus lock-screen session was found.",
        sessionId = sessionId
      )
    }

    val wasAlreadyNotified = session.completionNotifiedAtMillis != null
    val completedSession = session.copy(
      status = FocusLockScreenContract.STATUS_COMPLETED,
      completionNotifiedAtMillis = session.completionNotifiedAtMillis ?: System.currentTimeMillis()
    )

    FocusLockScreenStore.save(appContext, completedSession)
    FocusLockScreenScheduler.cancelCompletion(appContext, completedSession.sessionId)
    FocusNotificationHelper.cancelOngoing(appContext)

    if (!wasAlreadyNotified) {
      if (notify) {
        FocusNotificationHelper.showCompletion(appContext, completedSession)
      }
      if (readAloud && completedSession.readAloudOnComplete) {
        FocusCompletionSpeaker.speak(appContext, completedSession)
      }
    }

    sendCloseActivityBroadcast(appContext, completedSession.sessionId)
    stopServiceSafely(appContext)

    return mapOf(
      "success" to true,
      "sessionId" to completedSession.sessionId,
      "completed" to true,
      "completionNotifiedAtMillis" to completedSession.completionNotifiedAtMillis,
      "message" to "Focus session completed."
    )
  }

  fun openActivity(context: Context, sessionId: String): Map<String, Any?> {
    val appContext = context.applicationContext
    val session = FocusLockScreenStore.get(appContext)
      ?: return errorResult(
        errorCode = "SESSION_NOT_FOUND",
        message = "No active focus lock-screen session was found.",
        sessionId = sessionId
      )
    if (session.sessionId != sessionId) {
      return errorResult(
        errorCode = "SESSION_NOT_FOUND",
        message = "No matching focus lock-screen session was found.",
        sessionId = sessionId
      )
    }

    return try {
      appContext.startActivity(FocusNotificationHelper.buildShowFocusIntent(appContext, session))
      mapOf(
        "success" to true,
        "sessionId" to session.sessionId,
        "message" to "Focus lock-screen activity opened."
      )
    } catch (_: Exception) {
      errorResult(
        errorCode = "OPEN_FAILED",
        message = "Android did not allow opening the focus lock-screen activity.",
        sessionId = sessionId
      )
    }
  }

  fun currentStatus(context: Context): Map<String, Any?> {
    val session = FocusLockScreenStore.get(context.applicationContext)
      ?: return mapOf(
        "success" to true,
        "sessionId" to null,
        "status" to null
      )
    return session.toMap()
  }

  fun sendCloseActivityBroadcast(context: Context, sessionId: String) {
    val intent = Intent(FocusLockScreenContract.ACTION_CLOSE_FOCUS_ACTIVITY).apply {
      setPackage(context.packageName)
      putExtra(FocusLockScreenContract.EXTRA_SESSION_ID, sessionId)
    }
    context.sendBroadcast(intent)
  }

  fun startServiceSafely(context: Context, intent: Intent) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    } catch (_: Exception) {
      val session = FocusLockScreenSession.fromIntent(intent)
        ?: FocusLockScreenStore.get(context)
        ?: return
      FocusNotificationHelper.showOngoing(context, session)
    }
  }

  private fun stopServiceSafely(context: Context) {
    try {
      context.stopService(Intent(context, FocusLockScreenService::class.java))
    } catch (_: Exception) {
      // Service may already be stopped.
    }
  }

  private fun errorResult(
    errorCode: String,
    message: String,
    sessionId: String? = null
  ): Map<String, Any?> {
    return mapOf(
      "success" to false,
      "sessionId" to sessionId,
      "errorCode" to errorCode,
      "message" to message
    )
  }
}
