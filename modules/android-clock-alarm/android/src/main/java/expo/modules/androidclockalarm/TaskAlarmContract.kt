package expo.modules.androidclockalarm

import android.content.Context
import android.content.Intent
import org.json.JSONObject

internal data class TaskAlarmPayload(
  val alarmId: String,
  val taskId: String,
  val title: String,
  val message: String,
  val triggerAtMillis: Long,
  val snoozeMinutes: Int = 5,
  val sound: Boolean = true,
  val vibrate: Boolean = true,
  val fullScreen: Boolean = false
) {
  companion object {
    fun fromIntent(intent: Intent?): TaskAlarmPayload? {
      if (intent == null) return null
      val alarmId = intent.getStringExtra(TaskAlarmContract.EXTRA_ALARM_ID)?.trim().orEmpty()
      val taskId = intent.getStringExtra(TaskAlarmContract.EXTRA_TASK_ID)?.trim().orEmpty()
      if (alarmId.isEmpty() || taskId.isEmpty()) return null

      val triggerAtMillis = intent.getLongExtra(
        TaskAlarmContract.EXTRA_TRIGGER_AT_MILLIS,
        -1L
      )
      if (triggerAtMillis <= 0L) return null

      val title = sanitizeAlarmTitle(intent.getStringExtra(TaskAlarmContract.EXTRA_TITLE))
      val message = sanitizeAlarmMessage(intent.getStringExtra(TaskAlarmContract.EXTRA_MESSAGE))
      val snoozeMinutes = (intent.getIntExtra(TaskAlarmContract.EXTRA_SNOOZE_MINUTES, 5))
        .coerceIn(1, 60)
      val sound = intent.getBooleanExtra(TaskAlarmContract.EXTRA_SOUND, true)
      val vibrate = intent.getBooleanExtra(TaskAlarmContract.EXTRA_VIBRATE, true)
      val fullScreen = intent.getBooleanExtra(TaskAlarmContract.EXTRA_FULL_SCREEN, false)

      return TaskAlarmPayload(
        alarmId = alarmId,
        taskId = taskId,
        title = title,
        message = message,
        triggerAtMillis = triggerAtMillis,
        snoozeMinutes = snoozeMinutes,
        sound = sound,
        vibrate = vibrate,
        fullScreen = fullScreen
      )
    }
  }
}

internal object TaskAlarmContract {
  const val NOTIFICATION_CHANNEL_ID = "adhd_strong_alarm"
  const val NOTIFICATION_CHANNEL_NAME = "Strong task alarms"
  const val NOTIFICATION_CHANNEL_DESCRIPTION =
    "Alarm-style reminders for important ADHD tasks."

  const val ACTION_TRIGGER_TASK_ALARM = "expo.modules.androidclockalarm.ACTION_TRIGGER_TASK_ALARM"
  const val ACTION_STOP_TASK_ALARM = "expo.modules.androidclockalarm.ACTION_STOP_TASK_ALARM"
  const val ACTION_SNOOZE_TASK_ALARM = "expo.modules.androidclockalarm.ACTION_SNOOZE_TASK_ALARM"

  const val EXTRA_ALARM_ID = "extra_alarm_id"
  const val EXTRA_TASK_ID = "extra_task_id"
  const val EXTRA_TITLE = "extra_title"
  const val EXTRA_MESSAGE = "extra_message"
  const val EXTRA_TRIGGER_AT_MILLIS = "extra_trigger_at_millis"
  const val EXTRA_SNOOZE_MINUTES = "extra_snooze_minutes"
  const val EXTRA_SOUND = "extra_sound"
  const val EXTRA_VIBRATE = "extra_vibrate"
  const val EXTRA_FULL_SCREEN = "extra_full_screen"

  fun alarmRequestCode(alarmId: String): Int {
    return (alarmId.hashCode() and 0x7fffffff)
  }

  fun alarmNotificationId(alarmId: String): Int {
    val hash = alarmRequestCode(alarmId)
    return 100_000 + (hash % 800_000)
  }
}

internal object TaskAlarmStore {
  private const val PREF_NAME = "task_alarm_store_v1"
  private const val KEY_PREFIX = "alarm:"

  private fun key(alarmId: String): String = "$KEY_PREFIX$alarmId"

  fun save(context: Context, payload: TaskAlarmPayload) {
    val json = JSONObject().apply {
      put(TaskAlarmContract.EXTRA_ALARM_ID, payload.alarmId)
      put(TaskAlarmContract.EXTRA_TASK_ID, payload.taskId)
      put(TaskAlarmContract.EXTRA_TITLE, payload.title)
      put(TaskAlarmContract.EXTRA_MESSAGE, payload.message)
      put(TaskAlarmContract.EXTRA_TRIGGER_AT_MILLIS, payload.triggerAtMillis)
      put(TaskAlarmContract.EXTRA_SNOOZE_MINUTES, payload.snoozeMinutes)
      put(TaskAlarmContract.EXTRA_SOUND, payload.sound)
      put(TaskAlarmContract.EXTRA_VIBRATE, payload.vibrate)
      put(TaskAlarmContract.EXTRA_FULL_SCREEN, payload.fullScreen)
    }

    context
      .getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(key(payload.alarmId), json.toString())
      .apply()
  }

  fun get(context: Context, alarmId: String): TaskAlarmPayload? {
    val raw = context
      .getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
      .getString(key(alarmId), null)
      ?: return null

    return try {
      val json = JSONObject(raw)
      val parsedAlarmId = json.optString(TaskAlarmContract.EXTRA_ALARM_ID).trim()
      val parsedTaskId = json.optString(TaskAlarmContract.EXTRA_TASK_ID).trim()
      val triggerAtMillis = json.optLong(TaskAlarmContract.EXTRA_TRIGGER_AT_MILLIS, -1L)

      if (parsedAlarmId.isEmpty() || parsedTaskId.isEmpty() || triggerAtMillis <= 0L) {
        return null
      }

      TaskAlarmPayload(
        alarmId = parsedAlarmId,
        taskId = parsedTaskId,
        title = sanitizeAlarmTitle(json.optString(TaskAlarmContract.EXTRA_TITLE)),
        message = sanitizeAlarmMessage(json.optString(TaskAlarmContract.EXTRA_MESSAGE)),
        triggerAtMillis = triggerAtMillis,
        snoozeMinutes = json.optInt(TaskAlarmContract.EXTRA_SNOOZE_MINUTES, 5).coerceIn(1, 60),
        sound = json.optBoolean(TaskAlarmContract.EXTRA_SOUND, true),
        vibrate = json.optBoolean(TaskAlarmContract.EXTRA_VIBRATE, true),
        fullScreen = json.optBoolean(TaskAlarmContract.EXTRA_FULL_SCREEN, false)
      )
    } catch (_: Exception) {
      null
    }
  }

  fun remove(context: Context, alarmId: String) {
    context
      .getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
      .edit()
      .remove(key(alarmId))
      .apply()
  }
}

internal fun sanitizeAlarmTitle(rawTitle: String?): String {
  val trimmed = rawTitle?.trim().orEmpty()
  val fallback = if (trimmed.isNotEmpty()) trimmed else "Task reminder"
  return if (fallback.length <= 120) fallback else fallback.substring(0, 120)
}

internal fun sanitizeAlarmMessage(rawMessage: String?): String {
  val trimmed = rawMessage?.trim().orEmpty()
  val fallback = if (trimmed.isNotEmpty()) trimmed else "Start with one small step."
  return if (fallback.length <= 180) fallback else fallback.substring(0, 180)
}
