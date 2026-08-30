package expo.modules.screenawareness

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class ScreenAwarenessActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    if (
      action != ScreenAwarenessContract.ACTION_TAKE_BREAK &&
      action != ScreenAwarenessContract.ACTION_SNOOZE &&
      action != ScreenAwarenessContract.ACTION_CONTINUE
    ) return
    val threshold = intent.getIntExtra(ScreenAwarenessContract.EXTRA_THRESHOLD_MINUTES, 20)
    ScreenAwarenessForegroundService.dispatchAction(context.applicationContext, action, threshold)
  }
}
