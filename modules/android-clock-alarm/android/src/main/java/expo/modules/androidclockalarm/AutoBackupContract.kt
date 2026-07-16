package expo.modules.androidclockalarm

internal object AutoBackupContract {
  const val ACTION_RUN = "expo.modules.androidclockalarm.ACTION_RUN_AUTO_BACKUP"
  const val HEADLESS_TASK_NAME = "ADHDTaskManagerAutoBackup"
  const val REQUEST_CODE = 724_001
  const val NOTIFICATION_ID = 724_002
  const val CHANNEL_ID = "adhd_backup_status"
  const val EXTRA_BACKUP_TIME = "backupTime"
  const val EXTRA_BACKUP_TYPE = "backupType"
  const val EXTRA_SCHEDULED_AT = "scheduledAt"
}
