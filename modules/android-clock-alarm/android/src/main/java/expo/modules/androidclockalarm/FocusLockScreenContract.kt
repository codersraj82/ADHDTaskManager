package expo.modules.androidclockalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

internal data class FocusLockScreenSession(
  val sessionId: String,
  val taskId: String?,
  val taskTitle: String,
  val startedAtMillis: Long,
  val expectedEndAtMillis: Long,
  val durationMinutes: Int,
  val readAloudOnComplete: Boolean,
  val status: String = FocusLockScreenContract.STATUS_ACTIVE,
  val completionNotifiedAtMillis: Long? = null
) {
  val totalMillis: Long
    get() = (expectedEndAtMillis - startedAtMillis).coerceAtLeast(1L)

  fun putExtras(intent: Intent): Intent {
    intent.putExtra(FocusLockScreenContract.EXTRA_SESSION_ID, sessionId)
    intent.putExtra(FocusLockScreenContract.EXTRA_TASK_ID, taskId)
    intent.putExtra(FocusLockScreenContract.EXTRA_TASK_TITLE, taskTitle)
    intent.putExtra(FocusLockScreenContract.EXTRA_STARTED_AT_MILLIS, startedAtMillis)
    intent.putExtra(FocusLockScreenContract.EXTRA_EXPECTED_END_AT_MILLIS, expectedEndAtMillis)
    intent.putExtra(FocusLockScreenContract.EXTRA_DURATION_MINUTES, durationMinutes)
    intent.putExtra(FocusLockScreenContract.EXTRA_READ_ALOUD_ON_COMPLETE, readAloudOnComplete)
    intent.putExtra(FocusLockScreenContract.EXTRA_STATUS, status)
    completionNotifiedAtMillis?.let {
      intent.putExtra(FocusLockScreenContract.EXTRA_COMPLETION_NOTIFIED_AT_MILLIS, it)
    }
    return intent
  }

  fun toMap(): Map<String, Any?> = mapOf(
    "success" to true,
    "sessionId" to sessionId,
    "taskId" to taskId,
    "taskTitle" to taskTitle,
    "startedAtMillis" to startedAtMillis,
    "expectedEndAtMillis" to expectedEndAtMillis,
    "durationMinutes" to durationMinutes,
    "readAloudOnComplete" to readAloudOnComplete,
    "status" to status,
    "completionNotifiedAtMillis" to completionNotifiedAtMillis
  )

  companion object {
    fun fromIntent(intent: Intent?): FocusLockScreenSession? {
      if (intent == null) return null
      val sessionId = sanitizeSessionId(
        intent.getStringExtra(FocusLockScreenContract.EXTRA_SESSION_ID)
      ) ?: return null
      val startedAtMillis = intent.getLongExtra(
        FocusLockScreenContract.EXTRA_STARTED_AT_MILLIS,
        -1L
      )
      val expectedEndAtMillis = intent.getLongExtra(
        FocusLockScreenContract.EXTRA_EXPECTED_END_AT_MILLIS,
        -1L
      )
      if (startedAtMillis <= 0L || expectedEndAtMillis <= startedAtMillis) return null

      val completionNotifiedAtMillis = intent.getLongExtra(
        FocusLockScreenContract.EXTRA_COMPLETION_NOTIFIED_AT_MILLIS,
        -1L
      ).takeIf { it > 0L }

      return FocusLockScreenSession(
        sessionId = sessionId,
        taskId = sanitizeNullableId(intent.getStringExtra(FocusLockScreenContract.EXTRA_TASK_ID)),
        taskTitle = sanitizeFocusTaskTitle(
          intent.getStringExtra(FocusLockScreenContract.EXTRA_TASK_TITLE)
        ),
        startedAtMillis = startedAtMillis,
        expectedEndAtMillis = expectedEndAtMillis,
        durationMinutes = intent.getIntExtra(
          FocusLockScreenContract.EXTRA_DURATION_MINUTES,
          1
        ).coerceAtLeast(1),
        readAloudOnComplete = intent.getBooleanExtra(
          FocusLockScreenContract.EXTRA_READ_ALOUD_ON_COMPLETE,
          false
        ),
        status = sanitizeStatus(
          intent.getStringExtra(FocusLockScreenContract.EXTRA_STATUS)
        ),
        completionNotifiedAtMillis = completionNotifiedAtMillis
      )
    }

    fun fromOptions(options: Map<String, Any?>): FocusLockScreenSession? {
      val sessionId = sanitizeSessionId(options["sessionId"] as? String) ?: return null
      val startedAtMillis = parseTimestampMillis(
        options["startedAtMillis"] ?: options["startedAt"]
      ) ?: return null
      val expectedEndAtMillis = parseTimestampMillis(
        options["expectedEndAtMillis"] ?: options["expectedEndAt"]
      ) ?: return null
      if (expectedEndAtMillis <= startedAtMillis) return null

      val durationMinutes = options["durationMinutes"].toIntSafely()
        ?: (((expectedEndAtMillis - startedAtMillis) / 60_000L).toInt()).coerceAtLeast(1)

      return FocusLockScreenSession(
        sessionId = sessionId,
        taskId = sanitizeNullableId(options["taskId"]?.toString()),
        taskTitle = sanitizeFocusTaskTitle(options["taskTitle"] as? String),
        startedAtMillis = startedAtMillis,
        expectedEndAtMillis = expectedEndAtMillis,
        durationMinutes = durationMinutes.coerceAtLeast(1),
        readAloudOnComplete = options["readAloudOnComplete"] as? Boolean ?: false,
        status = sanitizeStatus(options["status"] as? String),
        completionNotifiedAtMillis = parseTimestampMillis(
          options["completionNotifiedAtMillis"] ?: options["completionNotifiedAt"]
        )
      )
    }
  }
}

internal object FocusLockScreenContract {
  const val FOCUS_CHANNEL_ID = "adhd_focus_lock_screen"
  const val FOCUS_CHANNEL_NAME = "Active focus"
  const val FOCUS_CHANNEL_DESCRIPTION =
    "Ongoing focus timer shown on the lock screen when Android allows it."
  const val COMPLETION_CHANNEL_ID = "adhd_focus_complete"
  const val COMPLETION_CHANNEL_NAME = "Focus completion"
  const val COMPLETION_CHANNEL_DESCRIPTION = "Gentle completion notices for focus sessions."

  const val ACTION_START_FOCUS_SESSION =
    "expo.modules.androidclockalarm.ACTION_START_FOCUS_SESSION"
  const val ACTION_UPDATE_FOCUS_SESSION =
    "expo.modules.androidclockalarm.ACTION_UPDATE_FOCUS_SESSION"
  const val ACTION_STOP_FOCUS_SESSION =
    "expo.modules.androidclockalarm.ACTION_STOP_FOCUS_SESSION"
  const val ACTION_STOP_FOCUS_SESSION_FROM_JS =
    "expo.modules.androidclockalarm.ACTION_STOP_FOCUS_SESSION_FROM_JS"
  const val ACTION_COMPLETE_FOCUS_SESSION =
    "expo.modules.androidclockalarm.ACTION_COMPLETE_FOCUS_SESSION"
  const val ACTION_SHOW_FOCUS_SESSION =
    "expo.modules.androidclockalarm.ACTION_SHOW_FOCUS_SESSION"
  const val ACTION_DISMISS_FOCUS_COMPLETION =
    "expo.modules.androidclockalarm.ACTION_DISMISS_FOCUS_COMPLETION"
  const val ACTION_CLOSE_FOCUS_ACTIVITY =
    "expo.modules.androidclockalarm.ACTION_CLOSE_FOCUS_ACTIVITY"

  const val STATUS_ACTIVE = "active"
  const val STATUS_PAUSED = "paused"
  const val STATUS_COMPLETED = "completed"
  const val STATUS_STOPPED = "stopped"

  const val EXTRA_SESSION_ID = "extra_focus_session_id"
  const val EXTRA_TASK_ID = "extra_focus_task_id"
  const val EXTRA_TASK_TITLE = "extra_focus_task_title"
  const val EXTRA_STARTED_AT_MILLIS = "extra_focus_started_at_millis"
  const val EXTRA_EXPECTED_END_AT_MILLIS = "extra_focus_expected_end_at_millis"
  const val EXTRA_DURATION_MINUTES = "extra_focus_duration_minutes"
  const val EXTRA_READ_ALOUD_ON_COMPLETE = "extra_focus_read_aloud_on_complete"
  const val EXTRA_STATUS = "extra_focus_status"
  const val EXTRA_COMPLETION_NOTIFIED_AT_MILLIS =
    "extra_focus_completion_notified_at_millis"

  const val ONGOING_NOTIFICATION_ID = 244_201

  fun completionNotificationId(sessionId: String): Int {
    val hash = sessionId.hashCode() and 0x7fffffff
    return 300_000 + (hash % 600_000)
  }

  fun sessionRequestCode(sessionId: String, offset: Int = 0): Int {
    return ((sessionId.hashCode() and 0x7fffffff) + offset) and 0x7fffffff
  }
}

internal object FocusLockScreenStore {
  private const val PREF_NAME = "focus_lock_screen_store_v1"
  private const val KEY_CURRENT_SESSION = "current_session"

  fun save(context: Context, session: FocusLockScreenSession) {
    val json = JSONObject().apply {
      put(FocusLockScreenContract.EXTRA_SESSION_ID, session.sessionId)
      put(FocusLockScreenContract.EXTRA_TASK_ID, session.taskId)
      put(FocusLockScreenContract.EXTRA_TASK_TITLE, session.taskTitle)
      put(FocusLockScreenContract.EXTRA_STARTED_AT_MILLIS, session.startedAtMillis)
      put(FocusLockScreenContract.EXTRA_EXPECTED_END_AT_MILLIS, session.expectedEndAtMillis)
      put(FocusLockScreenContract.EXTRA_DURATION_MINUTES, session.durationMinutes)
      put(FocusLockScreenContract.EXTRA_READ_ALOUD_ON_COMPLETE, session.readAloudOnComplete)
      put(FocusLockScreenContract.EXTRA_STATUS, session.status)
      session.completionNotifiedAtMillis?.let {
        put(FocusLockScreenContract.EXTRA_COMPLETION_NOTIFIED_AT_MILLIS, it)
      }
    }

    context
      .getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_CURRENT_SESSION, json.toString())
      .apply()
  }

  fun get(context: Context): FocusLockScreenSession? {
    val raw = context
      .getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
      .getString(KEY_CURRENT_SESSION, null)
      ?: return null

    return try {
      val json = JSONObject(raw)
      val sessionId = sanitizeSessionId(
        json.optString(FocusLockScreenContract.EXTRA_SESSION_ID)
      ) ?: return null
      val startedAtMillis = json.optLong(
        FocusLockScreenContract.EXTRA_STARTED_AT_MILLIS,
        -1L
      )
      val expectedEndAtMillis = json.optLong(
        FocusLockScreenContract.EXTRA_EXPECTED_END_AT_MILLIS,
        -1L
      )
      if (startedAtMillis <= 0L || expectedEndAtMillis <= startedAtMillis) return null

      FocusLockScreenSession(
        sessionId = sessionId,
        taskId = sanitizeNullableId(
          json.optString(FocusLockScreenContract.EXTRA_TASK_ID)
        ),
        taskTitle = sanitizeFocusTaskTitle(
          json.optString(FocusLockScreenContract.EXTRA_TASK_TITLE)
        ),
        startedAtMillis = startedAtMillis,
        expectedEndAtMillis = expectedEndAtMillis,
        durationMinutes = json.optInt(
          FocusLockScreenContract.EXTRA_DURATION_MINUTES,
          1
        ).coerceAtLeast(1),
        readAloudOnComplete = json.optBoolean(
          FocusLockScreenContract.EXTRA_READ_ALOUD_ON_COMPLETE,
          false
        ),
        status = sanitizeStatus(
          json.optString(FocusLockScreenContract.EXTRA_STATUS)
        ),
        completionNotifiedAtMillis = json.optLong(
          FocusLockScreenContract.EXTRA_COMPLETION_NOTIFIED_AT_MILLIS,
          -1L
        ).takeIf { it > 0L }
      )
    } catch (_: Exception) {
      null
    }
  }

  fun remove(context: Context) {
    context
      .getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
      .edit()
      .remove(KEY_CURRENT_SESSION)
      .apply()
  }
}

internal object FocusLockScreenLaunchGate {
  private const val PREF_NAME = "focus_lock_screen_launch_gate_v1"
  private const val KEY_SUPPRESS_UNTIL = "suppress_show_until_ms"

  fun suppressTemporarily(context: Context, durationMs: Long = 45_000L) {
    context
      .getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
      .edit()
      .putLong(KEY_SUPPRESS_UNTIL, System.currentTimeMillis() + durationMs.coerceAtLeast(1_000L))
      .apply()
  }

  fun isSuppressed(context: Context): Boolean {
    val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    val suppressUntil = prefs.getLong(KEY_SUPPRESS_UNTIL, 0L)
    if (suppressUntil <= System.currentTimeMillis()) {
      if (suppressUntil > 0L) {
        prefs.edit().remove(KEY_SUPPRESS_UNTIL).apply()
      }
      return false
    }
    return true
  }
}

internal object FocusLockScreenScheduler {
  fun scheduleCompletion(context: Context, session: FocusLockScreenSession) {
    val triggerAt = session.expectedEndAtMillis
    if (triggerAt <= System.currentTimeMillis()) return

    val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return
    val pendingIntent = buildCompletionPendingIntent(context, session, true) ?: return

    try {
      when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.M -> {
          alarmManager.setExactAndAllowWhileIdle(
            AlarmManager.RTC_WAKEUP,
            triggerAt,
            pendingIntent
          )
        }
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT -> {
          alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
        }
        else -> alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
      }
    } catch (_: SecurityException) {
      try {
        alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
      } catch (_: Exception) {
        // The foreground service ticker remains as a fallback.
      }
    } catch (_: Exception) {
      // The foreground service ticker remains as a fallback.
    }
  }

  fun cancelCompletion(context: Context, sessionId: String) {
    val pendingIntent = buildCompletionPendingIntentById(context, sessionId, false) ?: return
    val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return
    try {
      alarmManager.cancel(pendingIntent)
      pendingIntent.cancel()
    } catch (_: Exception) {
      // No-op for already-fired or unavailable alarms.
    }
  }

  private fun buildCompletionPendingIntent(
    context: Context,
    session: FocusLockScreenSession,
    createIfMissing: Boolean
  ): PendingIntent? {
    val intent = Intent(context, FocusActionReceiver::class.java).apply {
      action = FocusLockScreenContract.ACTION_COMPLETE_FOCUS_SESSION
      session.putExtras(this)
    }
    return PendingIntent.getBroadcast(
      context,
      FocusLockScreenContract.sessionRequestCode(session.sessionId, 51),
      intent,
      pendingIntentFlags(createIfMissing)
    )
  }

  private fun buildCompletionPendingIntentById(
    context: Context,
    sessionId: String,
    createIfMissing: Boolean
  ): PendingIntent? {
    val intent = Intent(context, FocusActionReceiver::class.java).apply {
      action = FocusLockScreenContract.ACTION_COMPLETE_FOCUS_SESSION
      putExtra(FocusLockScreenContract.EXTRA_SESSION_ID, sessionId)
    }
    return PendingIntent.getBroadcast(
      context,
      FocusLockScreenContract.sessionRequestCode(sessionId, 51),
      intent,
      pendingIntentFlags(createIfMissing)
    )
  }

  private fun pendingIntentFlags(createIfMissing: Boolean): Int {
    var flags = if (createIfMissing) {
      PendingIntent.FLAG_UPDATE_CURRENT
    } else {
      PendingIntent.FLAG_NO_CREATE
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags = flags or PendingIntent.FLAG_IMMUTABLE
    }
    return flags
  }
}

internal fun sanitizeSessionId(raw: String?): String? {
  val trimmed = raw?.trim().orEmpty()
  if (trimmed.isEmpty()) return null
  return if (trimmed.length <= 128) trimmed else trimmed.substring(0, 128)
}

internal fun sanitizeNullableId(raw: String?): String? {
  val trimmed = raw?.trim().orEmpty()
  if (trimmed.isEmpty()) return null
  return if (trimmed.length <= 96) trimmed else trimmed.substring(0, 96)
}

internal fun sanitizeFocusTaskTitle(raw: String?): String {
  val trimmed = raw
    ?.replace(Regex("\\s+"), " ")
    ?.trim()
    .orEmpty()
  val fallback = if (trimmed.isNotEmpty()) trimmed else "Focus Session"
  return if (fallback.length <= 120) fallback else fallback.substring(0, 120)
}

internal fun sanitizeStatus(raw: String?): String {
  return when (raw?.trim()?.lowercase(Locale.US)) {
    FocusLockScreenContract.STATUS_PAUSED -> FocusLockScreenContract.STATUS_PAUSED
    FocusLockScreenContract.STATUS_COMPLETED -> FocusLockScreenContract.STATUS_COMPLETED
    FocusLockScreenContract.STATUS_STOPPED -> FocusLockScreenContract.STATUS_STOPPED
    else -> FocusLockScreenContract.STATUS_ACTIVE
  }
}

internal fun parseTimestampMillis(raw: Any?): Long? {
  return when (raw) {
    is Long -> raw.takeIf { it > 0L }
    is Int -> raw.toLong().takeIf { it > 0L }
    is Double -> raw.toLong().takeIf { it > 0L }
    is Float -> raw.toLong().takeIf { it > 0L }
    is String -> parseTimestampString(raw)
    else -> null
  }
}

private fun parseTimestampString(raw: String): Long? {
  val trimmed = raw.trim()
  if (trimmed.isEmpty()) return null
  trimmed.toLongOrNull()?.let { return it.takeIf { value -> value > 0L } }

  val patterns = listOf(
    "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
    "yyyy-MM-dd'T'HH:mm:ss'Z'",
    "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
    "yyyy-MM-dd'T'HH:mm:ssXXX"
  )
  return patterns.firstNotNullOfOrNull { pattern ->
    try {
      SimpleDateFormat(pattern, Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
      }.parse(trimmed)?.time
    } catch (_: Exception) {
      null
    }
  }?.takeIf { it > 0L }
}

internal fun Any?.toIntSafely(): Int? {
  return when (this) {
    is Int -> this
    is Long -> this.toInt()
    is Float -> this.toInt()
    is Double -> this.toInt()
    is String -> this.toIntOrNull()
    else -> null
  }
}
