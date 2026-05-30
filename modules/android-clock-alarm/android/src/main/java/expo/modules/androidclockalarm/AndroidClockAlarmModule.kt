package expo.modules.androidclockalarm

import android.content.ActivityNotFoundException
import android.content.Intent
import android.provider.AlarmClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AndroidClockAlarmModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AndroidClockAlarm")

    Function("canUseClockAlarm") {
      val context = appContext.reactContext ?: return@Function false
      val intent = Intent(AlarmClock.ACTION_SET_ALARM)
      intent.resolveActivity(context.packageManager) != null
    }

    AsyncFunction("setClockAlarm") { options: Map<String, Any?> ->
      val hour = options["hour"].toIntSafely()
      val minutes = options["minutes"].toIntSafely()
      val message = sanitizeMessage(options["message"] as? String)
      val skipUi = options["skipUi"] as? Boolean ?: false

      if (hour == null || minutes == null || hour !in 0..23 || minutes !in 0..59) {
        return@AsyncFunction errorResult(
          errorCode = "INVALID_TIME",
          message = "Hour must be 0-23 and minutes must be 0-59."
        )
      }

      val intent = Intent(AlarmClock.ACTION_SET_ALARM).apply {
        putExtra(AlarmClock.EXTRA_HOUR, hour)
        putExtra(AlarmClock.EXTRA_MINUTES, minutes)
        putExtra(AlarmClock.EXTRA_MESSAGE, message)
        putExtra(AlarmClock.EXTRA_SKIP_UI, skipUi)
      }

      launchIntent(intent)
    }

    AsyncFunction("openAlarmClockFallback") {
      val context = appContext.reactContext
        ?: return@AsyncFunction errorResult(
          errorCode = "NO_ACTIVITY",
          message = "No active context to open Clock app."
        )

      val showAlarmsIntent = Intent(AlarmClock.ACTION_SHOW_ALARMS)
      if (showAlarmsIntent.resolveActivity(context.packageManager) != null) {
        return@AsyncFunction launchIntent(showAlarmsIntent)
      }

      val setAlarmIntent = Intent(AlarmClock.ACTION_SET_ALARM)
      launchIntent(setAlarmIntent)
    }
  }

  private fun launchIntent(intent: Intent): Map<String, Any?> {
    val context = appContext.reactContext
      ?: return errorResult(
        errorCode = "NO_ACTIVITY",
        message = "No active context to open Clock app."
      )

    if (intent.resolveActivity(context.packageManager) == null) {
      return errorResult(
        errorCode = "CLOCK_APP_UNAVAILABLE",
        message = "No compatible Clock app is available on this device."
      )
    }

    return try {
      val activity = appContext.currentActivity
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
      successResult("Clock alarm intent launched.")
    } catch (_: ActivityNotFoundException) {
      errorResult(
        errorCode = "CLOCK_APP_UNAVAILABLE",
        message = "No compatible Clock app is available on this device."
      )
    } catch (_: SecurityException) {
      errorResult(
        errorCode = "PERMISSION_DENIED",
        message = "Permission denied while opening Clock app."
      )
    } catch (_: IllegalStateException) {
      errorResult(
        errorCode = "NO_ACTIVITY",
        message = "No active context to open Clock app."
      )
    } catch (_: Exception) {
      errorResult(
        errorCode = "INTENT_FAILED",
        message = "Unable to launch Clock alarm intent."
      )
    }
  }

  private fun sanitizeMessage(rawMessage: String?): String {
    val trimmed = rawMessage?.trim().orEmpty()
    val fallback = if (trimmed.isNotEmpty()) trimmed else "Task reminder"
    return if (fallback.length <= 120) fallback else fallback.substring(0, 120)
  }

  private fun Any?.toIntSafely(): Int? {
    return when (this) {
      is Int -> this
      is Long -> this.toInt()
      is Float -> this.toInt()
      is Double -> this.toInt()
      is String -> this.toIntOrNull()
      else -> null
    }
  }

  private fun successResult(message: String): Map<String, Any?> {
    return mapOf(
      "success" to true,
      "launched" to true,
      "message" to message
    )
  }

  private fun errorResult(errorCode: String, message: String): Map<String, Any?> {
    return mapOf(
      "success" to false,
      "launched" to false,
      "errorCode" to errorCode,
      "message" to message
    )
  }
}
