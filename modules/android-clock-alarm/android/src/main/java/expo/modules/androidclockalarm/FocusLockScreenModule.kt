package expo.modules.androidclockalarm

import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class FocusLockScreenModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FocusLockScreen")

    Events(
      "focusLockScreenCompleted",
      "focusLockScreenStopped",
      "focusLockScreenOpenApp"
    )

    Function("canUseFocusLockScreen") {
      appContext.reactContext != null
    }

    AsyncFunction("startFocusLockScreenSession") { options: Map<String, Any?> ->
      val context = appContext.reactContext
        ?: return@AsyncFunction errorResult(
          errorCode = "NATIVE_MODULE_UNAVAILABLE",
          message = "Native focus lock-screen context is unavailable."
        )
      val session = FocusLockScreenSession.fromOptions(options)
        ?: return@AsyncFunction errorResult(
          errorCode = "INVALID_SESSION",
          message = "A valid focus session with start and end timestamps is required."
        )
      FocusLockScreenController.start(context, session)
    }

    AsyncFunction("updateFocusLockScreenSession") { options: Map<String, Any?> ->
      val context = appContext.reactContext
        ?: return@AsyncFunction errorResult(
          errorCode = "NATIVE_MODULE_UNAVAILABLE",
          message = "Native focus lock-screen context is unavailable."
        )
      val session = FocusLockScreenSession.fromOptions(options)
        ?: return@AsyncFunction errorResult(
          errorCode = "INVALID_SESSION",
          message = "A valid focus session with start and end timestamps is required."
        )
      FocusLockScreenController.update(context, session)
    }

    AsyncFunction("stopFocusLockScreenSession") { sessionId: String ->
      val context = appContext.reactContext
        ?: return@AsyncFunction errorResult(
          errorCode = "NATIVE_MODULE_UNAVAILABLE",
          message = "Native focus lock-screen context is unavailable.",
          sessionId = sessionId
        )
      val sanitizedSessionId = sanitizeSessionId(sessionId)
        ?: return@AsyncFunction errorResult(
          errorCode = "INVALID_SESSION",
          message = "A valid focus session ID is required."
        )
      FocusLockScreenController.stopFromJs(context, sanitizedSessionId)
    }

    AsyncFunction("completeFocusLockScreenSession") { sessionId: String ->
      val context = appContext.reactContext
        ?: return@AsyncFunction errorResult(
          errorCode = "NATIVE_MODULE_UNAVAILABLE",
          message = "Native focus lock-screen context is unavailable.",
          sessionId = sessionId
        )
      val sanitizedSessionId = sanitizeSessionId(sessionId)
        ?: return@AsyncFunction errorResult(
          errorCode = "INVALID_SESSION",
          message = "A valid focus session ID is required."
        )
      FocusLockScreenController.complete(
        context = context,
        sessionId = sanitizedSessionId,
        notify = true,
        readAloud = false
      )
    }

    AsyncFunction("openFocusLockScreen") { sessionId: String ->
      val context = appContext.reactContext
        ?: return@AsyncFunction errorResult(
          errorCode = "NATIVE_MODULE_UNAVAILABLE",
          message = "Native focus lock-screen context is unavailable.",
          sessionId = sessionId
        )
      val sanitizedSessionId = sanitizeSessionId(sessionId)
        ?: return@AsyncFunction errorResult(
          errorCode = "INVALID_SESSION",
          message = "A valid focus session ID is required."
        )
      FocusLockScreenController.openActivity(context, sanitizedSessionId)
    }

    AsyncFunction("getCurrentFocusLockScreenSession") {
      val context = appContext.reactContext
        ?: return@AsyncFunction errorResult(
          errorCode = "NATIVE_MODULE_UNAVAILABLE",
          message = "Native focus lock-screen context is unavailable."
        )
      FocusLockScreenController.currentStatus(context)
    }

    AsyncFunction("openFocusLockScreenApp") { sessionId: String ->
      val context = appContext.reactContext
        ?: return@AsyncFunction errorResult(
          errorCode = "NATIVE_MODULE_UNAVAILABLE",
          message = "Native focus lock-screen context is unavailable.",
          sessionId = sessionId
        )
      val session = FocusLockScreenStore.get(context)
        ?: return@AsyncFunction errorResult(
          errorCode = "SESSION_NOT_FOUND",
          message = "No active focus lock-screen session was found.",
          sessionId = sessionId
        )
      val intent = FocusNotificationHelper.buildOpenAppIntent(context, session)
      try {
        appContext.currentActivity?.startActivity(intent) ?: run {
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          context.startActivity(intent)
        }
        mapOf(
          "success" to true,
          "sessionId" to session.sessionId,
          "message" to "Opened app for focus session."
        )
      } catch (_: Exception) {
        errorResult(
          errorCode = "OPEN_FAILED",
          message = "Android could not open the app for this focus session.",
          sessionId = session.sessionId
        )
      }
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
