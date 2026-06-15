package expo.modules.androidclockalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class FocusActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    val sessionId = intent.getStringExtra(FocusLockScreenContract.EXTRA_SESSION_ID)
      ?: FocusLockScreenSession.fromIntent(intent)?.sessionId
      ?: FocusLockScreenStore.get(context)?.sessionId
      ?: return

    when (action) {
      FocusLockScreenContract.ACTION_STOP_FOCUS_SESSION -> {
        FocusLockScreenController.requestStopFromNative(context, sessionId)
      }

      FocusLockScreenContract.ACTION_COMPLETE_FOCUS_SESSION -> {
        FocusLockScreenController.complete(
          context = context,
          sessionId = sessionId,
          notify = true,
          readAloud = true
        )
      }

      FocusLockScreenContract.ACTION_DISMISS_FOCUS_COMPLETION -> {
        FocusNotificationHelper.dismissCompletion(context, sessionId)
      }
    }
  }
}
