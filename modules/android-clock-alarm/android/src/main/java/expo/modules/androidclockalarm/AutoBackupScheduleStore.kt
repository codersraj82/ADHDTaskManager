package expo.modules.androidclockalarm

import android.content.Context
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

internal data class AutoBackupSchedule(
  val enabled: Boolean,
  val backupTime: String,
  val backupType: String,
  val nextRunAt: Long
)

internal object AutoBackupScheduleStore {
  private const val PREFS = "auto_backup_schedule_v1"
  private const val KEY_ENABLED = "enabled"
  private const val KEY_TIME = "backup_time"
  private const val KEY_TYPE = "backup_type"
  private const val KEY_NEXT_RUN = "next_run_at"
  private const val KEY_LAST_TRIGGER_DATE = "last_trigger_date"

  fun save(context: Context, schedule: AutoBackupSchedule) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putBoolean(KEY_ENABLED, schedule.enabled)
      .putString(KEY_TIME, schedule.backupTime)
      .putString(KEY_TYPE, schedule.backupType)
      .putLong(KEY_NEXT_RUN, schedule.nextRunAt)
      .apply()
  }

  fun get(context: Context): AutoBackupSchedule {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    return AutoBackupSchedule(
      enabled = prefs.getBoolean(KEY_ENABLED, false),
      backupTime = prefs.getString(KEY_TIME, "00:00") ?: "00:00",
      backupType = prefs.getString(KEY_TYPE, "minimum") ?: "minimum",
      nextRunAt = prefs.getLong(KEY_NEXT_RUN, 0L)
    )
  }

  fun clear(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putBoolean(KEY_ENABLED, false)
      .putLong(KEY_NEXT_RUN, 0L)
      .remove(KEY_LAST_TRIGGER_DATE)
      .apply()
  }

  @Synchronized
  fun markTriggeredIfNewDay(context: Context, now: Long = System.currentTimeMillis()): Boolean {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val date = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(now))
    if (prefs.getString(KEY_LAST_TRIGGER_DATE, "") == date) return false
    return prefs.edit().putString(KEY_LAST_TRIGGER_DATE, date).commit()
  }
}
