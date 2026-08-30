package expo.modules.screenawareness

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build

internal object ScreenAwarenessNotificationHelper {
  fun buildStatusNotification(context: Context, usageAccessGranted: Boolean): Notification {
    createChannels(context)
    val message = if (usageAccessGranted) {
      "Continuous screen-time support is running."
    } else {
      "Usage Access is needed before monitoring can continue."
    }
    return builder(context, ScreenAwarenessContract.STATUS_CHANNEL_ID)
      .setSmallIcon(resolveSmallIcon(context))
      .setContentTitle("Screen awareness active")
      .setContentText(message)
      .setStyle(Notification.BigTextStyle().bigText(message))
      .setContentIntent(openAppPendingIntent(context, reports = false))
      .setOngoing(true)
      .setCategory(Notification.CATEGORY_SERVICE)
      .setShowWhen(false)
      .build()
  }

  fun showWarning(
    context: Context,
    thresholdMinutes: Int,
    settings: ScreenAwarenessSettings,
    followUp: Boolean
  ) {
    if (!settings.showNotification || !ScreenAwarenessAccess.notificationsAllowed(context)) return
    createChannels(context)
    val copy = ScreenAwarenessCopy.forThreshold(thresholdMinutes, followUp)
    val notification = builder(context, warningChannelId(settings))
      .setSmallIcon(resolveSmallIcon(context))
      .setColor(Color.parseColor("#66B9B9"))
      .setContentTitle("$thresholdMinutes min continuous screen time")
      .setContentText(copy.notificationBody)
      .setStyle(Notification.BigTextStyle().bigText(copy.notificationBody))
      .setContentIntent(openAppPendingIntent(context, reports = false))
      .setAutoCancel(true)
      .setCategory(Notification.CATEGORY_REMINDER)
      .addAction(
        0,
        "Take a break",
        actionPendingIntent(context, ScreenAwarenessContract.ACTION_TAKE_BREAK, thresholdMinutes, 1)
      )
      .addAction(
        0,
        "Remind 10 min",
        actionPendingIntent(context, ScreenAwarenessContract.ACTION_SNOOZE, thresholdMinutes, 2)
      )
      .addAction(
        0,
        "Continue",
        actionPendingIntent(context, ScreenAwarenessContract.ACTION_CONTINUE, thresholdMinutes, 3)
      )
      .build()
    context.getSystemService(NotificationManager::class.java)?.notify(
      ScreenAwarenessContract.WARNING_NOTIFICATION_ID,
      notification
    )
  }

  fun cancelWarning(context: Context) {
    context.getSystemService(NotificationManager::class.java)
      ?.cancel(ScreenAwarenessContract.WARNING_NOTIFICATION_ID)
  }

  fun cancelAll(context: Context) {
    context.getSystemService(NotificationManager::class.java)?.apply {
      cancel(ScreenAwarenessContract.STATUS_NOTIFICATION_ID)
      cancel(ScreenAwarenessContract.WARNING_NOTIFICATION_ID)
    }
  }

  private fun createChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return

    val status = NotificationChannel(
      ScreenAwarenessContract.STATUS_CHANNEL_ID,
      ScreenAwarenessContract.STATUS_CHANNEL_NAME,
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Quiet status for user-enabled screen-time awareness."
      setSound(null, null)
      enableVibration(false)
      setShowBadge(false)
    }
    manager.createNotificationChannel(status)

    createWarningChannel(manager, ScreenAwarenessContract.WARNING_CHANNEL_QUIET, false, false)
    createWarningChannel(manager, ScreenAwarenessContract.WARNING_CHANNEL_VIBRATION, false, true)
    createWarningChannel(manager, ScreenAwarenessContract.WARNING_CHANNEL_SOUND, true, false)
    createWarningChannel(manager, ScreenAwarenessContract.WARNING_CHANNEL_SOUND_VIBRATION, true, true)
  }

  private fun createWarningChannel(
    manager: NotificationManager,
    id: String,
    sound: Boolean,
    vibration: Boolean
  ) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      id,
      "Screen Awareness reminders",
      NotificationManager.IMPORTANCE_DEFAULT
    ).apply {
      description = "Supportive continuous screen-time reminders."
      enableVibration(vibration)
      if (vibration) vibrationPattern = longArrayOf(0L, 100L, 90L, 120L)
      if (sound) {
        setSound(
          RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        )
      } else {
        setSound(null, null)
      }
    }
    manager.createNotificationChannel(channel)
  }

  private fun warningChannelId(settings: ScreenAwarenessSettings): String = when {
    settings.soundEnabled && settings.vibrationEnabled ->
      ScreenAwarenessContract.WARNING_CHANNEL_SOUND_VIBRATION
    settings.soundEnabled -> ScreenAwarenessContract.WARNING_CHANNEL_SOUND
    settings.vibrationEnabled -> ScreenAwarenessContract.WARNING_CHANNEL_VIBRATION
    else -> ScreenAwarenessContract.WARNING_CHANNEL_QUIET
  }

  private fun actionPendingIntent(
    context: Context,
    action: String,
    thresholdMinutes: Int,
    offset: Int
  ): PendingIntent {
    val intent = Intent(context, ScreenAwarenessActionReceiver::class.java).apply {
      this.action = action
      putExtra(ScreenAwarenessContract.EXTRA_THRESHOLD_MINUTES, thresholdMinutes)
    }
    return PendingIntent.getBroadcast(
      context,
      458_200 + thresholdMinutes * 10 + offset,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag()
    )
  }

  private fun openAppPendingIntent(context: Context, reports: Boolean): PendingIntent {
    val route = if (reports) "screen-usage" else "screen-awareness"
    val intent = Intent(
      Intent.ACTION_VIEW,
      Uri.parse("adhdtaskmanager:///$route")
    ).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    return PendingIntent.getActivity(
      context,
      if (reports) 458_302 else 458_301,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag()
    )
  }

  private fun builder(context: Context, channelId: String): Notification.Builder =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, channelId)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(context)
    }

  private fun immutableFlag(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0

  private fun resolveSmallIcon(context: Context): Int {
    val icon = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (icon != 0) icon else android.R.drawable.ic_dialog_info
  }
}

internal data class ScreenAwarenessCopy(
  val title: String,
  val body: String,
  val primaryAction: String,
  val notificationBody: String
) {
  companion object {
    fun forThreshold(minutes: Int, followUp: Boolean = false): ScreenAwarenessCopy {
      if (followUp) {
        return ScreenAwarenessCopy(
          title = "A gentle reminder",
          body = "Your screen session is still active. Would a short reset help now?",
          primaryAction = "Take a short break",
          notificationBody = "Your screen session is still active. A short reset may help."
        )
      }
      return when (minutes) {
        30 -> ScreenAwarenessCopy(
          "A short reset may help",
          "You've had about 30 minutes of continuous screen time. A 2-minute pause can make it easier to return intentionally.",
          "Take 2 min",
          "A short reset may help your attention."
        )
        45 -> ScreenAwarenessCopy(
          "Give your attention a reset",
          "You've been on your screen continuously for about 45 minutes. Want a short pause before continuing?",
          "Take 2 min",
          "A short pause may help you return intentionally."
        )
        60 -> ScreenAwarenessCopy(
          "One hour of continuous screen time",
          "Your eyes and attention may appreciate a short reset. No pressure — just a quick check-in.",
          "Take a break",
          "Your eyes and attention may appreciate a short reset."
        )
        else -> ScreenAwarenessCopy(
          "Quick screen check-in",
          "You've been actively using your phone for about 20 minutes. Still intentional?",
          "Take a short break",
          "A gentle check-in can help you stay intentional."
        )
      }
    }
  }
}
