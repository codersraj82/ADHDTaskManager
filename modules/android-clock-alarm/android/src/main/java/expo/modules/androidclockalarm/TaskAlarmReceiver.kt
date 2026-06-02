package expo.modules.androidclockalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class TaskAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val payload = TaskAlarmPayload.fromIntent(intent) ?: return
    TaskAlarmStore.save(context, payload)
    TaskAlarmNotificationHelper.show(context, payload)
  }
}
