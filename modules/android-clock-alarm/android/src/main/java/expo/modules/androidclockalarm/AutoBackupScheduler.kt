package expo.modules.androidclockalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import java.util.Calendar
import java.util.Locale

internal data class AutoBackupScheduleResult(
  val success: Boolean,
  val schedulerStatus: String,
  val nextRunAt: Long = 0L,
  val errorCode: String? = null,
  val message: String? = null
)

internal object AutoBackupScheduler {
  fun normalizeTime(value: String?): String? {
    val match = Regex("^(\\d{2}):(\\d{2})$").matchEntire(value?.trim().orEmpty())
      ?: return null
    val hour = match.groupValues[1].toIntOrNull() ?: return null
    val minute = match.groupValues[2].toIntOrNull() ?: return null
    if (hour !in 0..23 || minute !in 0..59) return null
    return "%02d:%02d".format(Locale.US, hour, minute)
  }

  fun nextRunAt(backupTime: String, now: Long = System.currentTimeMillis()): Long {
    val parts = backupTime.split(":")
    val calendar = Calendar.getInstance().apply {
      timeInMillis = now
      set(Calendar.HOUR_OF_DAY, parts[0].toInt())
      set(Calendar.MINUTE, parts[1].toInt())
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
      if (timeInMillis <= now) add(Calendar.DAY_OF_YEAR, 1)
    }
    return calendar.timeInMillis
  }

  fun schedule(context: Context, rawTime: String?, rawType: String?): AutoBackupScheduleResult {
    val backupTime = normalizeTime(rawTime) ?: return AutoBackupScheduleResult(
      success = false,
      schedulerStatus = "failed",
      errorCode = "INVALID_TIME",
      message = "Choose a valid automatic backup time."
    )
    val backupType = if (rawType == "full") "full" else "minimum"
    val nextRunAt = nextRunAt(backupTime)
    val alarmManager = context.getSystemService(AlarmManager::class.java)
      ?: return AutoBackupScheduleResult(
        success = false,
        schedulerStatus = "failed",
        errorCode = "SCHEDULE_FAILED",
        message = "Android backup scheduling is unavailable."
      )

    cancelAlarmOnly(context)
    val pendingIntent = pendingIntent(context, create = true) ?: return AutoBackupScheduleResult(
      success = false,
      schedulerStatus = "failed",
      errorCode = "SCHEDULE_FAILED",
      message = "Automatic backup could not be scheduled."
    )
    val canExact = TaskAlarmScheduler.canScheduleExactAlarms(context)
    return try {
      when {
        canExact && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ->
          alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextRunAt, pendingIntent)
        canExact && Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT ->
          alarmManager.setExact(AlarmManager.RTC_WAKEUP, nextRunAt, pendingIntent)
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ->
          alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextRunAt, pendingIntent)
        else -> alarmManager.set(AlarmManager.RTC_WAKEUP, nextRunAt, pendingIntent)
      }
      AutoBackupScheduleStore.save(
        context,
        AutoBackupSchedule(true, backupTime, backupType, nextRunAt)
      )
      AutoBackupScheduleResult(
        success = true,
        schedulerStatus = if (canExact) "scheduled" else "permission_needed",
        nextRunAt = nextRunAt,
        errorCode = if (canExact) null else "EXACT_ALARM_PERMISSION_REQUIRED",
        message = if (canExact) {
          "Automatic backup scheduled."
        } else {
          "Automatic backup is scheduled approximately. Allow exact alarms for precise timing."
        }
      )
    } catch (_: Exception) {
      AutoBackupScheduleResult(
        success = false,
        schedulerStatus = "failed",
        errorCode = "SCHEDULE_FAILED",
        message = "Automatic backup could not be scheduled."
      )
    }
  }

  fun cancel(context: Context): Boolean {
    val cancelled = cancelAlarmOnly(context)
    AutoBackupScheduleStore.clear(context)
    return cancelled
  }

  fun status(context: Context): AutoBackupScheduleResult {
    val stored = AutoBackupScheduleStore.get(context)
    if (!stored.enabled) {
      return AutoBackupScheduleResult(true, "not_scheduled", message = "Automatic backup is off.")
    }
    val exists = pendingIntent(context, create = false) != null
    val future = stored.nextRunAt > System.currentTimeMillis()
    if (!exists || !future) {
      return AutoBackupScheduleResult(
        true,
        "not_scheduled",
        nextRunAt = stored.nextRunAt,
        message = "Automatic backup needs to be rescheduled."
      )
    }
    val canExact = TaskAlarmScheduler.canScheduleExactAlarms(context)
    return AutoBackupScheduleResult(
      true,
      if (canExact) "scheduled" else "permission_needed",
      stored.nextRunAt,
      if (canExact) null else "EXACT_ALARM_PERMISSION_REQUIRED",
      if (canExact) "Automatic backup is scheduled." else "Exact timing permission is needed."
    )
  }

  private fun cancelAlarmOnly(context: Context): Boolean {
    val pendingIntent = pendingIntent(context, create = false) ?: return false
    return try {
      context.getSystemService(AlarmManager::class.java)?.cancel(pendingIntent)
      pendingIntent.cancel()
      true
    } catch (_: Exception) {
      false
    }
  }

  private fun pendingIntent(context: Context, create: Boolean): PendingIntent? {
    val intent = Intent(context, AutoBackupReceiver::class.java).apply {
      action = AutoBackupContract.ACTION_RUN
    }
    var flags = if (create) PendingIntent.FLAG_UPDATE_CURRENT else PendingIntent.FLAG_NO_CREATE
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags = flags or PendingIntent.FLAG_IMMUTABLE
    return PendingIntent.getBroadcast(context, AutoBackupContract.REQUEST_CODE, intent, flags)
  }
}
