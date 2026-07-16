package expo.modules.androidclockalarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat

internal object AutoBackupNotificationHelper {
  private const val DEFAULT_NOTIFICATION_ICON_META_DATA =
    "expo.modules.notifications.default_notification_icon"

  fun running(context: Context): Notification {
    ensureChannel(context)
    return NotificationCompat.Builder(context, AutoBackupContract.CHANNEL_ID)
      .setSmallIcon(smallIcon(context))
      .setContentTitle("Creating backup")
      .setContentText("Automatic backup is running.")
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setOngoing(true)
      .setSilent(true)
      .build()
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(AutoBackupContract.CHANNEL_ID) != null) return
    manager.createNotificationChannel(
      NotificationChannel(
        AutoBackupContract.CHANNEL_ID,
        "Backup status",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "Quiet status while an automatic backup is running."
        setSound(null, null)
        enableVibration(false)
      }
    )
  }

  private fun smallIcon(context: Context): Int {
    return try {
      val info = context.packageManager.getApplicationInfo(
        context.packageName,
        PackageManager.GET_META_DATA
      )
      info.metaData?.getInt(DEFAULT_NOTIFICATION_ICON_META_DATA, 0)
        ?.takeIf { it != 0 } ?: context.applicationInfo.icon
    } catch (_: Exception) {
      context.applicationInfo.icon
    }
  }
}
