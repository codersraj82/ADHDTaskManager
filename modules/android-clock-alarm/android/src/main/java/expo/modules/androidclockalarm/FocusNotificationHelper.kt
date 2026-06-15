package expo.modules.androidclockalarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import java.util.Locale

internal object FocusNotificationHelper {
  private const val DEFAULT_NOTIFICATION_ICON_META_DATA =
    "expo.modules.notifications.default_notification_icon"
  private const val NOTIFICATION_ICON_RESOURCE_NAME = "notification_icon"

  fun buildOngoingNotification(context: Context, session: FocusLockScreenSession): Notification {
    ensureChannels(context)

    val openAppIntent = buildOpenAppPendingIntent(context, session, 1)
    val showFocusIntent = buildShowFocusPendingIntent(context, session, 2)
    val stopIntent = buildStopPendingIntent(context, session, 3)

    return NotificationCompat.Builder(context, FocusLockScreenContract.FOCUS_CHANNEL_ID)
      .setSmallIcon(notificationSmallIconResource(context))
      .setContentTitle("Focus session active")
      .setContentText("Working on: ${session.taskTitle}")
      .setSubText(formatRemainingText(session.expectedEndAtMillis - System.currentTimeMillis()))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setContentIntent(openAppIntent)
      .setFullScreenIntent(showFocusIntent, true)
      .addAction(0, "Open app", openAppIntent)
      .addAction(0, "Show focus", showFocusIntent)
      .addAction(0, "Stop", stopIntent)
      .build()
  }

  fun showOngoing(context: Context, session: FocusLockScreenSession) {
    ensureChannels(context)
    NotificationManagerCompat.from(context).notify(
      FocusLockScreenContract.ONGOING_NOTIFICATION_ID,
      buildOngoingNotification(context, session)
    )
  }

  fun cancelOngoing(context: Context) {
    NotificationManagerCompat.from(context).cancel(
      FocusLockScreenContract.ONGOING_NOTIFICATION_ID
    )
  }

  fun showCompletion(context: Context, session: FocusLockScreenSession) {
    ensureChannels(context)

    val openAppIntent = buildOpenAppPendingIntent(context, session, 11)
    val doneIntent = buildDismissCompletionPendingIntent(context, session, 12)

    val builder = NotificationCompat.Builder(context, FocusLockScreenContract.COMPLETION_CHANNEL_ID)
      .setSmallIcon(notificationSmallIconResource(context))
      .setContentTitle("Focus complete")
      .setContentText("Good work. Take a gentle break.")
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setAutoCancel(true)
      .setContentIntent(openAppIntent)
      .addAction(0, "Open app", openAppIntent)
      .addAction(0, "Done", doneIntent)

    NotificationManagerCompat.from(context).notify(
      FocusLockScreenContract.completionNotificationId(session.sessionId),
      builder.build()
    )
  }

  fun dismissCompletion(context: Context, sessionId: String) {
    NotificationManagerCompat.from(context).cancel(
      FocusLockScreenContract.completionNotificationId(sessionId)
    )
  }

  fun buildShowFocusIntent(context: Context, session: FocusLockScreenSession): Intent {
    return Intent(context, FocusLockScreenActivity::class.java).apply {
      action = FocusLockScreenContract.ACTION_SHOW_FOCUS_SESSION
      addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_SINGLE_TOP or
          Intent.FLAG_ACTIVITY_CLEAR_TOP
      )
      session.putExtras(this)
    }
  }

  fun buildOpenAppIntent(context: Context, session: FocusLockScreenSession): Intent {
    val taskId = session.taskId
    if (!taskId.isNullOrBlank()) {
      val uri = Uri.parse(
        "adhdtaskmanager://task?taskId=${Uri.encode(taskId)}" +
          "&taskTitle=${Uri.encode(session.taskTitle)}" +
          "&source=${Uri.encode("focus_lock_screen")}" +
          "&focusSessionId=${Uri.encode(session.sessionId)}"
      )
      return Intent(Intent.ACTION_VIEW, uri).apply {
        setPackage(context.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      }
    }

    return context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    } ?: Intent(Intent.ACTION_MAIN).apply {
      setPackage(context.packageName)
      addCategory(Intent.CATEGORY_LAUNCHER)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
  }

  fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val notificationManager = context.getSystemService(NotificationManager::class.java)
      ?: return

    if (notificationManager.getNotificationChannel(FocusLockScreenContract.FOCUS_CHANNEL_ID) == null) {
      val focusChannel = NotificationChannel(
        FocusLockScreenContract.FOCUS_CHANNEL_ID,
        FocusLockScreenContract.FOCUS_CHANNEL_NAME,
        NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = FocusLockScreenContract.FOCUS_CHANNEL_DESCRIPTION
        setSound(null, null)
        enableVibration(false)
        lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
      }
      notificationManager.createNotificationChannel(focusChannel)
    }

    if (notificationManager.getNotificationChannel(FocusLockScreenContract.COMPLETION_CHANNEL_ID) == null) {
      val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
      val audioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
      val completionChannel = NotificationChannel(
        FocusLockScreenContract.COMPLETION_CHANNEL_ID,
        FocusLockScreenContract.COMPLETION_CHANNEL_NAME,
        NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = FocusLockScreenContract.COMPLETION_CHANNEL_DESCRIPTION
        lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
        setSound(soundUri, audioAttributes)
      }
      notificationManager.createNotificationChannel(completionChannel)
    }
  }

  private fun buildShowFocusPendingIntent(
    context: Context,
    session: FocusLockScreenSession,
    requestCodeOffset: Int
  ): PendingIntent {
    return PendingIntent.getActivity(
      context,
      FocusLockScreenContract.sessionRequestCode(session.sessionId, requestCodeOffset),
      buildShowFocusIntent(context, session),
      pendingIntentFlags()
    )
  }

  private fun buildOpenAppPendingIntent(
    context: Context,
    session: FocusLockScreenSession,
    requestCodeOffset: Int
  ): PendingIntent {
    return PendingIntent.getActivity(
      context,
      FocusLockScreenContract.sessionRequestCode(session.sessionId, requestCodeOffset),
      buildOpenAppIntent(context, session),
      pendingIntentFlags()
    )
  }

  private fun buildStopPendingIntent(
    context: Context,
    session: FocusLockScreenSession,
    requestCodeOffset: Int
  ): PendingIntent {
    val intent = Intent(context, FocusActionReceiver::class.java).apply {
      action = FocusLockScreenContract.ACTION_STOP_FOCUS_SESSION
      session.putExtras(this)
    }
    return PendingIntent.getBroadcast(
      context,
      FocusLockScreenContract.sessionRequestCode(session.sessionId, requestCodeOffset),
      intent,
      pendingIntentFlags()
    )
  }

  private fun buildDismissCompletionPendingIntent(
    context: Context,
    session: FocusLockScreenSession,
    requestCodeOffset: Int
  ): PendingIntent {
    val intent = Intent(context, FocusActionReceiver::class.java).apply {
      action = FocusLockScreenContract.ACTION_DISMISS_FOCUS_COMPLETION
      putExtra(FocusLockScreenContract.EXTRA_SESSION_ID, session.sessionId)
    }
    return PendingIntent.getBroadcast(
      context,
      FocusLockScreenContract.sessionRequestCode(session.sessionId, requestCodeOffset),
      intent,
      pendingIntentFlags()
    )
  }

  private fun notificationSmallIconResource(context: Context): Int {
    val configuredExpoIcon = readConfiguredExpoNotificationIcon(context)
    if (configuredExpoIcon != 0) return configuredExpoIcon

    val generatedDrawableIcon = context.resources.getIdentifier(
      NOTIFICATION_ICON_RESOURCE_NAME,
      "drawable",
      context.packageName
    )
    if (generatedDrawableIcon != 0) return generatedDrawableIcon

    val generatedMipmapIcon = context.resources.getIdentifier(
      NOTIFICATION_ICON_RESOURCE_NAME,
      "mipmap",
      context.packageName
    )
    if (generatedMipmapIcon != 0) return generatedMipmapIcon

    return context.applicationInfo.icon
  }

  @Suppress("DEPRECATION")
  private fun readConfiguredExpoNotificationIcon(context: Context): Int {
    return try {
      val applicationInfo = context.packageManager.getApplicationInfo(
        context.packageName,
        PackageManager.GET_META_DATA
      )
      val metadata = applicationInfo.metaData
      if (metadata?.containsKey(DEFAULT_NOTIFICATION_ICON_META_DATA) == true) {
        metadata.getInt(DEFAULT_NOTIFICATION_ICON_META_DATA)
      } else {
        0
      }
    } catch (_: Exception) {
      0
    }
  }

  private fun pendingIntentFlags(): Int {
    var flags = PendingIntent.FLAG_UPDATE_CURRENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags = flags or PendingIntent.FLAG_IMMUTABLE
    }
    return flags
  }
}

internal object FocusCompletionSpeaker {
  private var activeTts: TextToSpeech? = null

  fun speak(context: Context, session: FocusLockScreenSession) {
    val message = buildCompletionSpeechMessage(session.taskTitle)
    if (message.isBlank()) return

    try {
      activeTts?.stop()
      activeTts?.shutdown()
    } catch (_: Exception) {
      // Continue with a fresh TTS instance.
    }

    var textToSpeech: TextToSpeech? = null
    textToSpeech = TextToSpeech(context.applicationContext) { status ->
      val tts = textToSpeech ?: return@TextToSpeech
      if (status != TextToSpeech.SUCCESS) {
        shutdownQuietly(tts)
        return@TextToSpeech
      }

      try {
        tts.language = Locale.US
        tts.setSpeechRate(0.88f)
        tts.setPitch(0.92f)
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
          override fun onStart(utteranceId: String?) = Unit
          override fun onDone(utteranceId: String?) {
            shutdownQuietly(tts)
          }

          @Deprecated("Deprecated in Java")
          override fun onError(utteranceId: String?) {
            shutdownQuietly(tts)
          }
        })
        activeTts = tts
        tts.speak(
          message,
          TextToSpeech.QUEUE_FLUSH,
          null,
          "focus-complete-${session.sessionId}"
        )
      } catch (_: Exception) {
        shutdownQuietly(tts)
      }
    }
  }

  private fun buildCompletionSpeechMessage(taskTitle: String): String {
    val cleanTitle = taskTitle.replace(Regex("\\s+"), " ").trim()
    return if (
      cleanTitle.isNotEmpty() &&
      cleanTitle.length <= 60 &&
      !cleanTitle.equals("Focus Session", ignoreCase = true)
    ) {
      "Focus complete for $cleanTitle. Good work."
    } else {
      "Focus session complete. Good work. Take a gentle break."
    }
  }

  private fun shutdownQuietly(tts: TextToSpeech) {
    try {
      tts.stop()
      tts.shutdown()
    } catch (_: Exception) {
      // TTS cleanup should never affect completion handling.
    } finally {
      if (activeTts === tts) {
        activeTts = null
      }
    }
  }
}

internal fun formatRemainingText(remainingMillis: Long): String {
  val totalSeconds = (remainingMillis.coerceAtLeast(0L) / 1000L).toInt()
  val hours = totalSeconds / 3600
  val minutes = (totalSeconds % 3600) / 60
  val seconds = totalSeconds % 60
  return if (hours > 0) {
    String.format(Locale.US, "%d:%02d:%02d remaining", hours, minutes, seconds)
  } else {
    String.format(Locale.US, "%d:%02d remaining", minutes, seconds)
  }
}
