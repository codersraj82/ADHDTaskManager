package expo.modules.androidclockalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class TaskAlarmActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    val alarmId = intent.getStringExtra(TaskAlarmContract.EXTRA_ALARM_ID)?.trim().orEmpty()
    if (alarmId.isEmpty()) return

    when (action) {
      TaskAlarmContract.ACTION_STOP_TASK_ALARM -> {
        TaskAlarmNotificationHelper.cancel(context, alarmId)
        TaskAlarmStore.remove(context, alarmId)
      }

      TaskAlarmContract.ACTION_SNOOZE_TASK_ALARM -> {
        TaskAlarmNotificationHelper.cancel(context, alarmId)

        val currentPayload = TaskAlarmPayload.fromIntent(intent)
          ?: TaskAlarmStore.get(context, alarmId)
          ?: return
        val snoozeMinutes = intent.getIntExtra(
          TaskAlarmContract.EXTRA_SNOOZE_MINUTES,
          currentPayload.snoozeMinutes
        ).coerceIn(1, 60)

        val nextPayload = currentPayload.copy(
          triggerAtMillis = System.currentTimeMillis() + snoozeMinutes * 60_000L,
          snoozeMinutes = snoozeMinutes
        )
        TaskAlarmScheduler.schedule(context, nextPayload)
      }
    }
  }
}
