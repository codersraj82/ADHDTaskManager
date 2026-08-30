package expo.modules.screenawareness

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class ScreenAwarenessBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    if (!ScreenAwarenessStore.getSettings(context).enabled) return

    // Android may reject a background FGS start on some versions/OEMs. The
    // controller catches that restriction; enabled state remains persisted so
    // the next user-opened status check can resume monitoring legally.
    ScreenAwarenessController.ensureRunning(context.applicationContext)
  }
}
