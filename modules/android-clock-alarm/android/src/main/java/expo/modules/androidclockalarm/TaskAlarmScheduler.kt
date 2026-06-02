package expo.modules.androidclockalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

internal data class AlarmScheduleResult(
  val success: Boolean,
  val errorCode: String? = null,
  val message: String? = null
)

internal object TaskAlarmScheduler {
  fun canScheduleExactAlarms(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return false
    return alarmManager.canScheduleExactAlarms()
  }

  fun schedule(context: Context, payload: TaskAlarmPayload): AlarmScheduleResult {
    if (payload.triggerAtMillis <= System.currentTimeMillis()) {
      return AlarmScheduleResult(
        success = false,
        errorCode = "INVALID_TIME",
        message = "Trigger time must be in the future."
      )
    }

    if (!canScheduleExactAlarms(context)) {
      return AlarmScheduleResult(
        success = false,
        errorCode = "EXACT_ALARM_PERMISSION_REQUIRED",
        message = "Allow exact alarms in Android settings."
      )
    }

    val alarmManager = context.getSystemService(AlarmManager::class.java)
      ?: return AlarmScheduleResult(
        success = false,
        errorCode = "SCHEDULE_FAILED",
        message = "Android alarm service is unavailable."
      )

    val pendingIntent = buildAlarmPendingIntent(
      context = context,
      payload = payload,
      mutable = false
    ) ?: return AlarmScheduleResult(
      success = false,
      errorCode = "SCHEDULE_FAILED",
      message = "Strong alarm could not be scheduled."
    )

    return try {
      when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.M -> {
          alarmManager.setExactAndAllowWhileIdle(
            AlarmManager.RTC_WAKEUP,
            payload.triggerAtMillis,
            pendingIntent
          )
        }

        Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT -> {
          alarmManager.setExact(
            AlarmManager.RTC_WAKEUP,
            payload.triggerAtMillis,
            pendingIntent
          )
        }

        else -> {
          alarmManager.set(
            AlarmManager.RTC_WAKEUP,
            payload.triggerAtMillis,
            pendingIntent
          )
        }
      }

      TaskAlarmStore.save(context, payload)
      AlarmScheduleResult(success = true)
    } catch (_: SecurityException) {
      AlarmScheduleResult(
        success = false,
        errorCode = "EXACT_ALARM_PERMISSION_REQUIRED",
        message = "Allow exact alarms in Android settings."
      )
    } catch (_: Exception) {
      AlarmScheduleResult(
        success = false,
        errorCode = "SCHEDULE_FAILED",
        message = "Strong alarm could not be scheduled."
      )
    }
  }

  fun cancel(context: Context, alarmId: String): Boolean {
    val pendingIntent = buildAlarmPendingIntentById(
      context = context,
      alarmId = alarmId,
      mutable = false,
      createIfMissing = false
    ) ?: return false

    val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return false
    return try {
      alarmManager.cancel(pendingIntent)
      pendingIntent.cancel()
      true
    } catch (_: Exception) {
      false
    }
  }

  fun buildAlarmPendingIntent(
    context: Context,
    payload: TaskAlarmPayload,
    mutable: Boolean,
    createIfMissing: Boolean = true
  ): PendingIntent? {
    val intent = Intent(context, TaskAlarmReceiver::class.java).apply {
      action = TaskAlarmContract.ACTION_TRIGGER_TASK_ALARM
      putExtra(TaskAlarmContract.EXTRA_ALARM_ID, payload.alarmId)
      putExtra(TaskAlarmContract.EXTRA_TASK_ID, payload.taskId)
      putExtra(TaskAlarmContract.EXTRA_TITLE, payload.title)
      putExtra(TaskAlarmContract.EXTRA_MESSAGE, payload.message)
      putExtra(TaskAlarmContract.EXTRA_TRIGGER_AT_MILLIS, payload.triggerAtMillis)
      putExtra(TaskAlarmContract.EXTRA_SNOOZE_MINUTES, payload.snoozeMinutes)
      putExtra(TaskAlarmContract.EXTRA_SOUND, payload.sound)
      putExtra(TaskAlarmContract.EXTRA_VIBRATE, payload.vibrate)
      putExtra(TaskAlarmContract.EXTRA_FULL_SCREEN, payload.fullScreen)
    }

    val requestCode = TaskAlarmContract.alarmRequestCode(payload.alarmId)
    val flags = buildPendingIntentFlags(
      mutable = mutable,
      updateCurrent = createIfMissing,
      createIfMissing = createIfMissing
    )

    return PendingIntent.getBroadcast(
      context,
      requestCode,
      intent,
      flags
    )
  }

  private fun buildAlarmPendingIntentById(
    context: Context,
    alarmId: String,
    mutable: Boolean,
    createIfMissing: Boolean
  ): PendingIntent? {
    val intent = Intent(context, TaskAlarmReceiver::class.java).apply {
      action = TaskAlarmContract.ACTION_TRIGGER_TASK_ALARM
      putExtra(TaskAlarmContract.EXTRA_ALARM_ID, alarmId)
    }
    val flags = buildPendingIntentFlags(
      mutable = mutable,
      updateCurrent = createIfMissing,
      createIfMissing = createIfMissing
    )
    return PendingIntent.getBroadcast(
      context,
      TaskAlarmContract.alarmRequestCode(alarmId),
      intent,
      flags
    )
  }

  private fun buildPendingIntentFlags(
    mutable: Boolean,
    updateCurrent: Boolean,
    createIfMissing: Boolean
  ): Int {
    var flags = if (updateCurrent) PendingIntent.FLAG_UPDATE_CURRENT else PendingIntent.FLAG_NO_CREATE
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags = flags or if (mutable) PendingIntent.FLAG_MUTABLE else PendingIntent.FLAG_IMMUTABLE
    }
    if (!createIfMissing) {
      flags = flags and PendingIntent.FLAG_UPDATE_CURRENT.inv()
      flags = flags or PendingIntent.FLAG_NO_CREATE
    }
    return flags
  }
}
