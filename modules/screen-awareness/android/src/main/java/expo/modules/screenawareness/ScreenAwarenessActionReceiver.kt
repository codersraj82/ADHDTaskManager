package expo.modules.screenawareness

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class ScreenAwarenessActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    val threshold = intent.getIntExtra(ScreenAwarenessContract.EXTRA_THRESHOLD_MINUTES, 20)
    when (action) {
      ScreenAwarenessContract.ACTION_TAKE_BREAK,
      ScreenAwarenessContract.ACTION_SNOOZE,
      ScreenAwarenessContract.ACTION_CONTINUE ->
        ScreenAwarenessForegroundService.dispatchAction(context.applicationContext, action, threshold)
      ScreenAwarenessContract.ACTION_REENTRY_CONTINUE,
      ScreenAwarenessContract.ACTION_RETURN_CURRENT_TASK,
      ScreenAwarenessContract.ACTION_HELP_ME_START,
      ScreenAwarenessContract.ACTION_QUICK_WIN,
      ScreenAwarenessContract.ACTION_ENERGY_MATCH ->
        ScreenAwarenessForegroundService.dispatchReEntryAction(
          context.applicationContext,
          action,
          threshold
        )
      else -> return
    }
  }
}
