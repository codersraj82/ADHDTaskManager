package expo.modules.androidclockalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import com.facebook.react.HeadlessJsTaskService

class AutoBackupReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action != AutoBackupContract.ACTION_RUN) return
    val stored = AutoBackupScheduleStore.get(context)
    if (!stored.enabled) return

    AutoBackupScheduler.schedule(context, stored.backupTime, stored.backupType)
    if (!AutoBackupScheduleStore.markTriggeredIfNewDay(context)) return

    val serviceIntent = Intent(context, AutoBackupHeadlessService::class.java).apply {
      action = AutoBackupContract.ACTION_RUN
      putExtra(AutoBackupContract.EXTRA_BACKUP_TIME, stored.backupTime)
      putExtra(AutoBackupContract.EXTRA_BACKUP_TYPE, stored.backupType)
      putExtra(AutoBackupContract.EXTRA_SCHEDULED_AT, stored.nextRunAt)
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(serviceIntent)
      } else {
        context.startService(serviceIntent)
      }
      HeadlessJsTaskService.acquireWakeLockNow(context)
    } catch (_: Exception) {
      // The next daily alarm is already scheduled. JS records execution failures when started.
    }
  }
}
