package expo.modules.androidclockalarm

import android.app.AlarmManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.AlarmClock
import android.provider.Settings
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
      val message = sanitizeAlarmTitle(options["message"] as? String)
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

    Function("canUseStrongAlarm") {
      val context = appContext.reactContext ?: return@Function false
      context.getSystemService(AlarmManager::class.java) != null
    }

    Function("canScheduleExactAlarms") {
      val context = appContext.reactContext ?: return@Function false
      TaskAlarmScheduler.canScheduleExactAlarms(context)
    }

    AsyncFunction("openExactAlarmSettings") {
      openExactAlarmSettings()
    }

    AsyncFunction("scheduleTaskAlarm") { options: Map<String, Any?> ->
      scheduleTaskAlarm(options)
    }

    AsyncFunction("cancelTaskAlarm") { alarmId: String ->
      cancelTaskAlarm(alarmId)
    }

    AsyncFunction("snoozeTaskAlarm") { alarmId: String, minutes: Int ->
      snoozeTaskAlarm(alarmId, minutes)
    }

    AsyncFunction("stopActiveAlarm") { alarmId: String ->
      stopActiveAlarm(alarmId)
    }
  }

  private fun scheduleTaskAlarm(options: Map<String, Any?>): Map<String, Any?> {
    val context = appContext.reactContext
      ?: return errorResult(
        errorCode = "NATIVE_MODULE_UNAVAILABLE",
        message = "Native alarm context is unavailable."
      )

    val alarmId = sanitizeAlarmId(options["alarmId"] as? String)
      ?: return errorResult(
        errorCode = "ALARM_NOT_FOUND",
        message = "A valid alarm ID is required."
      )
    val taskId = sanitizeTaskId(options["taskId"])
      ?: return errorResult(
        errorCode = "SCHEDULE_FAILED",
        message = "A valid task ID is required."
      )
    val title = sanitizeAlarmTitle(options["title"] as? String)
    val message = sanitizeAlarmMessage(options["message"] as? String)
    val triggerAtMillis = options["triggerAtMillis"].toLongSafely()
      ?: return errorResult(
        errorCode = "INVALID_TIME",
        message = "Trigger time is required."
      )

    val now = System.currentTimeMillis()
    if (triggerAtMillis <= now) {
      return errorResult(
        errorCode = "INVALID_TIME",
        message = "Trigger time must be in the future."
      )
    }

    val snoozeMinutes = normalizeSnoozeMinutes(options["snoozeMinutes"].toIntSafely())
    val payload = TaskAlarmPayload(
      alarmId = alarmId,
      taskId = taskId,
      title = title,
      message = message,
      triggerAtMillis = triggerAtMillis,
      snoozeMinutes = snoozeMinutes,
      sound = options["sound"] as? Boolean ?: true,
      vibrate = options["vibrate"] as? Boolean ?: true,
      fullScreen = options["fullScreen"] as? Boolean ?: false
    )

    val result = TaskAlarmScheduler.schedule(context, payload)
    if (!result.success) {
      return errorResult(
        errorCode = result.errorCode ?: "SCHEDULE_FAILED",
        message = result.message ?: "Strong alarm could not be scheduled.",
        alarmId = payload.alarmId
      )
    }

    return mapOf(
      "success" to true,
      "scheduled" to true,
      "alarmId" to payload.alarmId,
      "message" to "Strong alarm scheduled."
    )
  }

  private fun cancelTaskAlarm(rawAlarmId: String?): Map<String, Any?> {
    val context = appContext.reactContext
      ?: return errorResult(
        errorCode = "NATIVE_MODULE_UNAVAILABLE",
        message = "Native alarm context is unavailable."
      )
    val alarmId = sanitizeAlarmId(rawAlarmId)
      ?: return errorResult(
        errorCode = "ALARM_NOT_FOUND",
        message = "A valid alarm ID is required."
      )

    val wasStored = TaskAlarmStore.get(context, alarmId) != null
    val cancelled = TaskAlarmScheduler.cancel(context, alarmId)
    TaskAlarmNotificationHelper.cancel(context, alarmId)
    TaskAlarmStore.remove(context, alarmId)

    if (!wasStored && !cancelled) {
      return errorResult(
        errorCode = "ALARM_NOT_FOUND",
        message = "No matching strong alarm was found.",
        alarmId = alarmId
      )
    }

    return mapOf(
      "success" to true,
      "cancelled" to true,
      "alarmId" to alarmId,
      "message" to "Strong alarm cancelled."
    )
  }

  private fun snoozeTaskAlarm(rawAlarmId: String?, rawMinutes: Int?): Map<String, Any?> {
    val context = appContext.reactContext
      ?: return errorResult(
        errorCode = "NATIVE_MODULE_UNAVAILABLE",
        message = "Native alarm context is unavailable."
      )
    val alarmId = sanitizeAlarmId(rawAlarmId)
      ?: return errorResult(
        errorCode = "ALARM_NOT_FOUND",
        message = "A valid alarm ID is required."
      )
    val stored = TaskAlarmStore.get(context, alarmId)
      ?: return errorResult(
        errorCode = "ALARM_NOT_FOUND",
        message = "No matching strong alarm was found.",
        alarmId = alarmId
      )

    val snoozeMinutes = normalizeSnoozeMinutes(rawMinutes)
    val nextPayload = stored.copy(
      triggerAtMillis = System.currentTimeMillis() + snoozeMinutes * 60_000L,
      snoozeMinutes = snoozeMinutes
    )

    val result = TaskAlarmScheduler.schedule(context, nextPayload)
    if (!result.success) {
      return errorResult(
        errorCode = result.errorCode ?: "SCHEDULE_FAILED",
        message = result.message ?: "Strong alarm could not be snoozed.",
        alarmId = alarmId
      )
    }

    TaskAlarmNotificationHelper.cancel(context, alarmId)
    return mapOf(
      "success" to true,
      "scheduled" to true,
      "alarmId" to alarmId,
      "message" to "Strong alarm snoozed."
    )
  }

  private fun stopActiveAlarm(rawAlarmId: String?): Map<String, Any?> {
    val context = appContext.reactContext
      ?: return errorResult(
        errorCode = "NATIVE_MODULE_UNAVAILABLE",
        message = "Native alarm context is unavailable."
      )
    val alarmId = sanitizeAlarmId(rawAlarmId)
      ?: return errorResult(
        errorCode = "ALARM_NOT_FOUND",
        message = "A valid alarm ID is required."
      )

    TaskAlarmNotificationHelper.cancel(context, alarmId)
    return mapOf(
      "success" to true,
      "alarmId" to alarmId,
      "message" to "Strong alarm stopped."
    )
  }

  private fun openExactAlarmSettings(): Map<String, Any?> {
    val context = appContext.reactContext
      ?: return errorResult(
        errorCode = "NATIVE_MODULE_UNAVAILABLE",
        message = "Native alarm context is unavailable."
      )

    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      return mapOf(
        "success" to true,
        "openedSettings" to false,
        "message" to "Exact alarm settings are not required on this Android version."
      )
    }

    val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
      data = Uri.parse("package:${context.packageName}")
    }
    if (intent.resolveActivity(context.packageManager) != null) {
      return launchSettingsIntent(intent)
    }

    val fallbackIntent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
      data = Uri.parse("package:${context.packageName}")
    }
    return launchSettingsIntent(fallbackIntent)
  }

  private fun launchSettingsIntent(intent: Intent): Map<String, Any?> {
    val context = appContext.reactContext
      ?: return errorResult(
        errorCode = "NATIVE_MODULE_UNAVAILABLE",
        message = "Native alarm context is unavailable."
      )

    return try {
      val activity = appContext.currentActivity
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
      mapOf(
        "success" to true,
        "openedSettings" to true,
        "message" to "Opened Android alarm settings."
      )
    } catch (_: ActivityNotFoundException) {
      errorResult(
        errorCode = "UNSUPPORTED_PLATFORM",
        message = "Android alarm settings are unavailable on this device."
      )
    } catch (_: SecurityException) {
      errorResult(
        errorCode = "UNKNOWN_ERROR",
        message = "Permission denied while opening Android alarm settings."
      )
    } catch (_: IllegalStateException) {
      errorResult(
        errorCode = "NATIVE_MODULE_UNAVAILABLE",
        message = "No active context to open Android alarm settings."
      )
    } catch (_: Exception) {
      errorResult(
        errorCode = "UNKNOWN_ERROR",
        message = "Unable to open Android alarm settings."
      )
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
      mapOf(
        "success" to true,
        "launched" to true,
        "message" to "Clock alarm intent launched."
      )
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

  private fun sanitizeAlarmId(raw: String?): String? {
    val trimmed = raw?.trim().orEmpty()
    if (trimmed.isEmpty()) return null
    return if (trimmed.length <= 96) trimmed else trimmed.substring(0, 96)
  }

  private fun sanitizeTaskId(raw: Any?): String? {
    val normalized = raw?.toString()?.trim().orEmpty()
    if (normalized.isEmpty()) return null
    return if (normalized.length <= 64) normalized else normalized.substring(0, 64)
  }

  private fun normalizeSnoozeMinutes(value: Int?): Int {
    val normalized = value ?: 5
    return normalized.coerceIn(1, 60)
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

  private fun Any?.toLongSafely(): Long? {
    return when (this) {
      is Int -> this.toLong()
      is Long -> this
      is Float -> this.toLong()
      is Double -> this.toLong()
      is String -> this.toLongOrNull()
      else -> null
    }
  }

  private fun errorResult(
    errorCode: String,
    message: String,
    alarmId: String? = null
  ): Map<String, Any?> {
    return mapOf(
      "success" to false,
      "scheduled" to false,
      "cancelled" to false,
      "alarmId" to alarmId,
      "errorCode" to errorCode,
      "message" to message
    )
  }
}
