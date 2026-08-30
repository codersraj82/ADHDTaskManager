package expo.modules.screenawareness

import android.Manifest
import android.app.AppOpsManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings

internal object ScreenAwarenessAccess {
  fun hasUsageAccess(context: Context): Boolean {
    val appOps = context.getSystemService(AppOpsManager::class.java) ?: return false
    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      appOps.unsafeCheckOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS,
        context.applicationInfo.uid,
        context.packageName
      )
    } else {
      @Suppress("DEPRECATION")
      appOps.checkOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS,
        context.applicationInfo.uid,
        context.packageName
      )
    }
    return mode == AppOpsManager.MODE_ALLOWED
  }

  fun canDrawOverlays(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)

  fun notificationsAllowed(context: Context): Boolean {
    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
      android.content.pm.PackageManager.PERMISSION_GRANTED
    ) return false
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      context.getSystemService(NotificationManager::class.java)?.areNotificationsEnabled() != false
    } else {
      true
    }
  }

  fun openUsageAccessSettings(context: Context): Boolean = openSettings(
    context,
    Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
  )

  fun openOverlaySettings(context: Context): Boolean = openSettings(
    context,
    Intent(
      Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
      Uri.parse("package:${context.packageName}")
    )
  )

  fun openNotificationSettings(context: Context): Boolean {
    val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
        putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
      }
    } else {
      Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = Uri.parse("package:${context.packageName}")
      }
    }
    return openSettings(context, intent)
  }

  private fun openSettings(context: Context, intent: Intent): Boolean {
    return try {
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      true
    } catch (_: Exception) {
      false
    }
  }
}
