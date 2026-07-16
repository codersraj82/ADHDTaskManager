package expo.modules.androidclockalarm

import android.content.Intent
import android.os.Build
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class AutoBackupHeadlessService : HeadlessJsTaskService() {
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startForeground(
      AutoBackupContract.NOTIFICATION_ID,
      AutoBackupNotificationHelper.running(this)
    )
    return super.onStartCommand(intent, flags, startId)
  }

  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    if (intent?.action != AutoBackupContract.ACTION_RUN) return null
    val data = com.facebook.react.bridge.Arguments.createMap().apply {
      putString(
        AutoBackupContract.EXTRA_BACKUP_TIME,
        intent.getStringExtra(AutoBackupContract.EXTRA_BACKUP_TIME) ?: "00:00"
      )
      putString(
        AutoBackupContract.EXTRA_BACKUP_TYPE,
        intent.getStringExtra(AutoBackupContract.EXTRA_BACKUP_TYPE) ?: "minimum"
      )
      putDouble(
        AutoBackupContract.EXTRA_SCHEDULED_AT,
        intent.getLongExtra(AutoBackupContract.EXTRA_SCHEDULED_AT, 0L).toDouble()
      )
    }
    return HeadlessJsTaskConfig(
      AutoBackupContract.HEADLESS_TASK_NAME,
      data,
      5 * 60 * 1000L,
      false
    )
  }

  override fun onDestroy() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    super.onDestroy()
  }
}
