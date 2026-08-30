package expo.modules.screenawareness

import android.content.Context
import android.content.Intent
import android.os.Build

internal object ScreenAwarenessController {
  fun ensureRunning(context: Context): Boolean {
    val appContext = context.applicationContext
    val settings = ScreenAwarenessStore.getSettings(appContext)
    if (!settings.enabled || !ScreenAwarenessAccess.hasUsageAccess(appContext)) return false
    if (ScreenAwarenessForegroundService.isRunning()) return true

    val intent = Intent(appContext, ScreenAwarenessForegroundService::class.java)
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        appContext.startForegroundService(intent)
      } else {
        appContext.startService(intent)
      }
      true
    } catch (_: Exception) {
      false
    }
  }

  fun disable(context: Context) {
    val appContext = context.applicationContext
    ScreenAwarenessStore.setEnabled(appContext, false)
    ScreenAwarenessOverlayManager.remove()
    ScreenAwarenessNotificationHelper.cancelAll(appContext)
    try {
      appContext.stopService(Intent(appContext, ScreenAwarenessForegroundService::class.java))
    } catch (_: Exception) {
      // Service may already be stopped.
    }
    if (!ScreenAwarenessForegroundService.isRunning()) {
      ScreenAwarenessSessionTracker(appContext).finishForDisable()
    }
  }
}
