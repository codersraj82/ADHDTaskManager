package expo.modules.androidclockalarm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

internal object TaskAlarmNotificationHelper {
  private const val DEFAULT_SNOOZE_MINUTES = 5

  fun show(context: Context, payload: TaskAlarmPayload) {
    ensureNotificationChannel(context)

    val openTaskIntent = buildOpenTaskPendingIntent(
      context = context,
      payload = payload,
      alarmAction = "open_task",
      requestCodeOffset = 1
    )
    val startTwoMinutesIntent = buildOpenTaskPendingIntent(
      context = context,
      payload = payload,
      alarmAction = "start_2_min",
      requestCodeOffset = 2
    )
    val stopIntent = buildActionPendingIntent(
      context = context,
      payload = payload,
      action = TaskAlarmContract.ACTION_STOP_TASK_ALARM,
      requestCodeOffset = 3
    )
    val snoozeIntent = buildActionPendingIntent(
      context = context,
      payload = payload,
      action = TaskAlarmContract.ACTION_SNOOZE_TASK_ALARM,
      requestCodeOffset = 4
    )

    val vibrationPattern = longArrayOf(0, 450, 250, 450, 250, 450)
    val builder = NotificationCompat.Builder(context, TaskAlarmContract.NOTIFICATION_CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setContentTitle("Task alarm")
      .setContentText(payload.title)
      .setSubText(payload.message)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setAutoCancel(true)
      .setContentIntent(openTaskIntent)
      .setFullScreenIntent(openTaskIntent, payload.fullScreen)
      .addAction(0, "Stop", stopIntent)
      .addAction(0, "Snooze 5 min", snoozeIntent)
      .addAction(0, "Open task", openTaskIntent)
      .addAction(0, "Start 2 min", startTwoMinutesIntent)

    if (payload.vibrate) {
      builder.setVibrate(vibrationPattern)
    }
    if (payload.sound) {
      builder.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))
    } else {
      builder.setSilent(true)
    }

    NotificationManagerCompat.from(context).notify(
      TaskAlarmContract.alarmNotificationId(payload.alarmId),
      builder.build()
    )
  }

  fun cancel(context: Context, alarmId: String) {
    NotificationManagerCompat.from(context).cancel(
      TaskAlarmContract.alarmNotificationId(alarmId)
    )
  }

  private fun ensureNotificationChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val notificationManager = context.getSystemService(NotificationManager::class.java)
      ?: return
    val existingChannel =
      notificationManager.getNotificationChannel(TaskAlarmContract.NOTIFICATION_CHANNEL_ID)
    if (existingChannel != null) return

    val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
    val audioAttributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ALARM)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()

    val channel = NotificationChannel(
      TaskAlarmContract.NOTIFICATION_CHANNEL_ID,
      TaskAlarmContract.NOTIFICATION_CHANNEL_NAME,
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = TaskAlarmContract.NOTIFICATION_CHANNEL_DESCRIPTION
      enableLights(true)
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 450, 250, 450, 250, 450)
      lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
      setSound(soundUri, audioAttributes)
    }

    notificationManager.createNotificationChannel(channel)
  }

  private fun buildActionPendingIntent(
    context: Context,
    payload: TaskAlarmPayload,
    action: String,
    requestCodeOffset: Int
  ): PendingIntent {
    val intent = Intent(context, TaskAlarmActionReceiver::class.java).apply {
      this.action = action
      putExtra(TaskAlarmContract.EXTRA_ALARM_ID, payload.alarmId)
      putExtra(TaskAlarmContract.EXTRA_TASK_ID, payload.taskId)
      putExtra(TaskAlarmContract.EXTRA_TITLE, payload.title)
      putExtra(TaskAlarmContract.EXTRA_MESSAGE, payload.message)
      putExtra(TaskAlarmContract.EXTRA_TRIGGER_AT_MILLIS, payload.triggerAtMillis)
      putExtra(
        TaskAlarmContract.EXTRA_SNOOZE_MINUTES,
        payload.snoozeMinutes.takeIf { it > 0 } ?: DEFAULT_SNOOZE_MINUTES
      )
      putExtra(TaskAlarmContract.EXTRA_SOUND, payload.sound)
      putExtra(TaskAlarmContract.EXTRA_VIBRATE, payload.vibrate)
      putExtra(TaskAlarmContract.EXTRA_FULL_SCREEN, payload.fullScreen)
    }

    return PendingIntent.getBroadcast(
      context,
      TaskAlarmContract.alarmRequestCode(payload.alarmId) + requestCodeOffset,
      intent,
      pendingIntentFlags()
    )
  }

  private fun buildOpenTaskPendingIntent(
    context: Context,
    payload: TaskAlarmPayload,
    alarmAction: String,
    requestCodeOffset: Int
  ): PendingIntent {
    val encodedTaskTitle = Uri.encode(payload.title)
    val uri = Uri.parse(
      "adhdtaskmanager://task?taskId=${Uri.encode(payload.taskId)}" +
        "&taskTitle=$encodedTaskTitle" +
        "&alarmId=${Uri.encode(payload.alarmId)}" +
        "&alarmAction=${Uri.encode(alarmAction)}"
    )

    val intent = Intent(Intent.ACTION_VIEW, uri).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }

    return PendingIntent.getActivity(
      context,
      TaskAlarmContract.alarmRequestCode(payload.alarmId) + requestCodeOffset,
      intent,
      pendingIntentFlags()
    )
  }

  private fun pendingIntentFlags(): Int {
    var flags = PendingIntent.FLAG_UPDATE_CURRENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags = flags or PendingIntent.FLAG_IMMUTABLE
    }
    return flags
  }
}
