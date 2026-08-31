package expo.modules.screenawareness

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import kotlin.math.abs

internal object ScreenAwarenessContract {
  const val STATUS_CHANNEL_ID = "screen_awareness_status"
  const val STATUS_CHANNEL_NAME = "Screen Awareness"
  const val WARNING_CHANNEL_QUIET = "screen_awareness_reminders_quiet"
  const val WARNING_CHANNEL_VIBRATION = "screen_awareness_reminders_vibration"
  const val WARNING_CHANNEL_SOUND = "screen_awareness_reminders_sound"
  const val WARNING_CHANNEL_SOUND_VIBRATION = "screen_awareness_reminders_sound_vibration"
  const val STATUS_NOTIFICATION_ID = 458_100
  const val WARNING_NOTIFICATION_ID = 458_101

  const val ACTION_NOTIFICATION = "expo.modules.screenawareness.ACTION_NOTIFICATION"
  const val ACTION_TAKE_BREAK = "expo.modules.screenawareness.ACTION_TAKE_BREAK"
  const val ACTION_SNOOZE = "expo.modules.screenawareness.ACTION_SNOOZE"
  const val ACTION_CONTINUE = "expo.modules.screenawareness.ACTION_CONTINUE"
  const val ACTION_REENTRY_CONTINUE = "expo.modules.screenawareness.ACTION_REENTRY_CONTINUE"
  const val ACTION_RETURN_CURRENT_TASK = "expo.modules.screenawareness.ACTION_RETURN_CURRENT_TASK"
  const val ACTION_HELP_ME_START = "expo.modules.screenawareness.ACTION_HELP_ME_START"
  const val ACTION_QUICK_WIN = "expo.modules.screenawareness.ACTION_QUICK_WIN"
  const val ACTION_ENERGY_MATCH = "expo.modules.screenawareness.ACTION_ENERGY_MATCH"
  const val EXTRA_THRESHOLD_MINUTES = "extra_threshold_minutes"

  const val POLL_INTERVAL_MS = 12_000L
  const val SNOOZE_DURATION_MS = 10 * 60_000L
  const val SESSION_SCHEMA_VERSION = 2
  const val SESSION_RETENTION_DAYS = 30
  const val UNKNOWN_APP_PACKAGE = "__screen_awareness_other__"
  const val MAX_REASONABLE_SESSION_MS = 24 * 60 * 60_000L
  val SUPPORTED_THRESHOLDS = listOf(20, 30, 45, 60)
  val SUPPORTED_REENTRY_THRESHOLDS = listOf(30, 45, 60)
}

internal object ScreenSessionEndReason {
  const val MEANINGFUL_BREAK = "MEANINGFUL_BREAK"
  const val FEATURE_DISABLED = "FEATURE_DISABLED"
  const val DEVICE_REBOOT = "DEVICE_REBOOT"
}

internal data class ScreenAwarenessSettings(
  val enabled: Boolean = false,
  val threshold20Enabled: Boolean = true,
  val threshold30Enabled: Boolean = true,
  val threshold45Enabled: Boolean = true,
  val threshold60Enabled: Boolean = true,
  val breakResetMinutes: Int = 5,
  val showOverlay: Boolean = true,
  val showNotification: Boolean = true,
  val soundEnabled: Boolean = false,
  val vibrationEnabled: Boolean = false,
  val patternInsightsEnabled: Boolean = true,
  val reEntryEnabled: Boolean = false,
  val showCurrentTaskInReminder: Boolean = false,
  val reEntryThresholdMinutes: Int = 45
) {
  fun enabledThresholds(): List<Int> = buildList {
    if (threshold20Enabled) add(20)
    if (threshold30Enabled) add(30)
    if (threshold45Enabled) add(45)
    if (threshold60Enabled) add(60)
  }

  fun toMap(): Map<String, Any> = mapOf(
    "enabled" to enabled,
    "threshold20Enabled" to threshold20Enabled,
    "threshold30Enabled" to threshold30Enabled,
    "threshold45Enabled" to threshold45Enabled,
    "threshold60Enabled" to threshold60Enabled,
    "breakResetMinutes" to breakResetMinutes,
    "showOverlay" to showOverlay,
    "showNotification" to showNotification,
    "soundEnabled" to soundEnabled,
    "vibrationEnabled" to vibrationEnabled,
    "patternInsightsEnabled" to patternInsightsEnabled,
    "reEntryEnabled" to reEntryEnabled,
    "showCurrentTaskInReminder" to showCurrentTaskInReminder,
    "reEntryThresholdMinutes" to reEntryThresholdMinutes
  )
}

internal data class ScreenWarningEvent(
  val thresholdMinutes: Int,
  val timestampWallMs: Long,
  val followUp: Boolean
) {
  fun toMap(): Map<String, Any> = mapOf(
    "thresholdMinutes" to thresholdMinutes,
    "timestamp" to timestampWallMs,
    "followUp" to followUp
  )
}

internal data class ScreenSessionState(
  var schemaVersion: Int = ScreenAwarenessContract.SESSION_SCHEMA_VERSION,
  var active: Boolean = false,
  var sessionId: String = "",
  var startedAtWallMs: Long = 0L,
  var accumulatedInteractiveMs: Long = 0L,
  var accumulatedPauseMs: Long = 0L,
  var lastInteractiveElapsedMs: Long? = null,
  var lastInteractiveWallMs: Long? = null,
  var lastNonInteractiveElapsedMs: Long? = null,
  var lastNonInteractiveWallMs: Long? = null,
  var lastActiveWallMs: Long = 0L,
  var bootReferenceWallMs: Long = 0L,
  var triggeredThresholds: MutableSet<Int> = mutableSetOf(),
  var warningEvents: MutableList<ScreenWarningEvent> = mutableListOf(),
  var snoozeUntilElapsedMs: Long? = null,
  var snoozedThresholdMinutes: Int? = null,
  var currentForegroundPackage: String? = null,
  var appUsageMs: MutableMap<String, Long> = mutableMapOf(),
  var breakSuggestedAtWallMs: Long? = null,
  var meaningfulBreakMinutesAtStart: Int = 5
) {
  fun toMap(nowElapsedMs: Long): Map<String, Any?> {
    val liveDelta = lastInteractiveElapsedMs
      ?.let { (nowElapsedMs - it).coerceIn(0L, ScreenAwarenessContract.MAX_REASONABLE_SESSION_MS) }
      ?: 0L
    val liveActiveDuration = (accumulatedInteractiveMs + liveDelta)
      .coerceIn(0L, ScreenAwarenessContract.MAX_REASONABLE_SESSION_MS)
    val liveAppUsage = appUsageMs.toMutableMap()
    if (liveDelta > 0L) {
      currentForegroundPackage?.let { packageName ->
        liveAppUsage[packageName] = (liveAppUsage[packageName] ?: 0L) + liveDelta
      }
    }
    return mapOf(
      "schemaVersion" to schemaVersion,
      "active" to active,
      "sessionId" to sessionId.takeIf { it.isNotBlank() },
      "startedAt" to startedAtWallMs.takeIf { it > 0L },
      "endedAt" to null,
      "activeDurationMs" to liveActiveDuration,
      "elapsedSpanMs" to (liveActiveDuration + accumulatedPauseMs)
        .coerceAtMost(ScreenAwarenessContract.MAX_REASONABLE_SESSION_MS),
      "pauseDurationMs" to accumulatedPauseMs,
      "screenInteractive" to (lastInteractiveElapsedMs != null),
      "lastActiveAt" to lastActiveWallMs.takeIf { it > 0L },
      "thresholdsTriggered" to warningEvents
        .filterNot { it.followUp }
        .map { it.thresholdMinutes }
        .distinct()
        .sorted(),
      "warningCount" to warningEvents.size,
      "warningEvents" to warningEvents.map(ScreenWarningEvent::toMap),
      "snoozed" to ((snoozeUntilElapsedMs ?: 0L) > nowElapsedMs),
      "snoozeRemainingMs" to ((snoozeUntilElapsedMs ?: nowElapsedMs) - nowElapsedMs)
        .coerceAtLeast(0L),
      "currentForegroundPackage" to currentForegroundPackage,
      "appUsageBreakdown" to liveAppUsage.entries
        .filter { it.value > 0L }
        .sortedByDescending { it.value }
        .map { mapOf("packageName" to it.key, "durationMs" to it.value) },
      "breakSuggestedAt" to breakSuggestedAtWallMs,
      "meaningfulBreakMinutes" to meaningfulBreakMinutesAtStart,
      "completedNormally" to false,
      "endReason" to null
    )
  }
}

internal object ScreenAwarenessStore {
  private const val PREF_NAME = "screen_awareness_settings_v1"
  private const val KEY_ENABLED = "enabled"
  private const val KEY_THRESHOLD_20 = "threshold_20"
  private const val KEY_THRESHOLD_30 = "threshold_30"
  private const val KEY_THRESHOLD_45 = "threshold_45"
  private const val KEY_THRESHOLD_60 = "threshold_60"
  private const val KEY_BREAK_RESET_MINUTES = "break_reset_minutes"
  private const val KEY_SHOW_OVERLAY = "show_overlay"
  private const val KEY_SHOW_NOTIFICATION = "show_notification"
  private const val KEY_SOUND_ENABLED = "sound_enabled"
  private const val KEY_VIBRATION_ENABLED = "vibration_enabled"
  private const val KEY_PATTERN_INSIGHTS_ENABLED = "pattern_insights_enabled_v3"
  private const val KEY_REENTRY_ENABLED = "reentry_enabled_v3"
  private const val KEY_SHOW_CURRENT_TASK = "show_current_task_v3"
  private const val KEY_REENTRY_THRESHOLD = "reentry_threshold_v3"
  private const val KEY_SESSION = "current_session"
  private const val KEY_HISTORY = "session_history"
  private const val KEY_WARNING_HISTORY = "warning_history"
  private const val MAX_SESSION_RECORDS = 1_500
  private const val MAX_WARNING_RECORDS = 2_000

  @Synchronized
  fun getSettings(context: Context): ScreenAwarenessSettings {
    val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    return ScreenAwarenessSettings(
      enabled = prefs.getBoolean(KEY_ENABLED, false),
      threshold20Enabled = prefs.getBoolean(KEY_THRESHOLD_20, true),
      threshold30Enabled = prefs.getBoolean(KEY_THRESHOLD_30, true),
      threshold45Enabled = prefs.getBoolean(KEY_THRESHOLD_45, true),
      threshold60Enabled = prefs.getBoolean(KEY_THRESHOLD_60, true),
      breakResetMinutes = prefs.getInt(KEY_BREAK_RESET_MINUTES, 5).coerceIn(1, 180),
      showOverlay = prefs.getBoolean(KEY_SHOW_OVERLAY, true),
      showNotification = prefs.getBoolean(KEY_SHOW_NOTIFICATION, true),
      soundEnabled = prefs.getBoolean(KEY_SOUND_ENABLED, false),
      vibrationEnabled = prefs.getBoolean(KEY_VIBRATION_ENABLED, false),
      patternInsightsEnabled = prefs.getBoolean(KEY_PATTERN_INSIGHTS_ENABLED, true),
      reEntryEnabled = prefs.getBoolean(KEY_REENTRY_ENABLED, false),
      showCurrentTaskInReminder = prefs.getBoolean(KEY_SHOW_CURRENT_TASK, false),
      reEntryThresholdMinutes = prefs.getInt(KEY_REENTRY_THRESHOLD, 45)
        .takeIf { it in ScreenAwarenessContract.SUPPORTED_REENTRY_THRESHOLDS }
        ?: 45
    )
  }

  @Synchronized
  fun setEnabled(context: Context, enabled: Boolean): ScreenAwarenessSettings {
    context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(KEY_ENABLED, enabled)
      .apply()
    return getSettings(context)
  }

  @Synchronized
  fun updateSettings(context: Context, values: Map<String, Any?>): ScreenAwarenessSettings {
    val current = getSettings(context)
    val breakMinutes = values.intValue("breakResetMinutes")
      ?.coerceIn(1, 180)
      ?: current.breakResetMinutes
    val reEntryThreshold = values.intValue("reEntryThresholdMinutes")
      ?.takeIf { it in ScreenAwarenessContract.SUPPORTED_REENTRY_THRESHOLDS }
      ?: current.reEntryThresholdMinutes
    context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(KEY_THRESHOLD_20, values.booleanValue("threshold20Enabled") ?: current.threshold20Enabled)
      .putBoolean(KEY_THRESHOLD_30, values.booleanValue("threshold30Enabled") ?: current.threshold30Enabled)
      .putBoolean(KEY_THRESHOLD_45, values.booleanValue("threshold45Enabled") ?: current.threshold45Enabled)
      .putBoolean(KEY_THRESHOLD_60, values.booleanValue("threshold60Enabled") ?: current.threshold60Enabled)
      .putInt(KEY_BREAK_RESET_MINUTES, breakMinutes)
      .putBoolean(KEY_SHOW_OVERLAY, values.booleanValue("showOverlay") ?: current.showOverlay)
      .putBoolean(KEY_SHOW_NOTIFICATION, values.booleanValue("showNotification") ?: current.showNotification)
      .putBoolean(KEY_SOUND_ENABLED, values.booleanValue("soundEnabled") ?: current.soundEnabled)
      .putBoolean(KEY_VIBRATION_ENABLED, values.booleanValue("vibrationEnabled") ?: current.vibrationEnabled)
      .putBoolean(
        KEY_PATTERN_INSIGHTS_ENABLED,
        values.booleanValue("patternInsightsEnabled") ?: current.patternInsightsEnabled
      )
      .putBoolean(KEY_REENTRY_ENABLED, values.booleanValue("reEntryEnabled") ?: current.reEntryEnabled)
      .putBoolean(
        KEY_SHOW_CURRENT_TASK,
        values.booleanValue("showCurrentTaskInReminder") ?: current.showCurrentTaskInReminder
      )
      .putInt(KEY_REENTRY_THRESHOLD, reEntryThreshold)
      .apply()
    return getSettings(context)
  }

  @Synchronized
  fun getSession(context: Context): ScreenSessionState? {
    val raw = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
      .getString(KEY_SESSION, null)
      ?: return null
    return try {
      val json = JSONObject(raw)
      val thresholdsJson = json.optJSONArray("triggeredThresholds") ?: JSONArray()
      val triggered = mutableSetOf<Int>()
      for (index in 0 until thresholdsJson.length()) {
        thresholdsJson.optInt(index)
          .takeIf { it in ScreenAwarenessContract.SUPPORTED_THRESHOLDS }
          ?.let(triggered::add)
      }

      val warnings = mutableListOf<ScreenWarningEvent>()
      val warningsJson = json.optJSONArray("warningEvents") ?: JSONArray()
      for (index in 0 until warningsJson.length()) {
        val item = warningsJson.optJSONObject(index) ?: continue
        val threshold = item.optInt("thresholdMinutes", -1)
        if (threshold !in ScreenAwarenessContract.SUPPORTED_THRESHOLDS) continue
        warnings.add(
          ScreenWarningEvent(
            thresholdMinutes = threshold,
            timestampWallMs = item.optLong("timestampWallMs", 0L),
            followUp = item.optBoolean("followUp", false)
          )
        )
      }

      val appUsage = mutableMapOf<String, Long>()
      val appUsageJson = json.optJSONObject("appUsageMs") ?: JSONObject()
      val keys = appUsageJson.keys()
      while (keys.hasNext()) {
        val packageName = keys.next()
        val duration = appUsageJson.optLong(packageName, 0L).coerceAtLeast(0L)
        if (duration > 0L) appUsage[packageName] = duration
      }

      val startedAt = json.optLong("startedAtWallMs", 0L)
      val accumulated = json.optLong("accumulatedInteractiveMs", 0L).coerceAtLeast(0L)
      ScreenSessionState(
        schemaVersion = json.optInt("schemaVersion", 1),
        active = json.optBoolean("active", false),
        sessionId = json.optString("sessionId", ""),
        startedAtWallMs = startedAt,
        accumulatedInteractiveMs = accumulated,
        accumulatedPauseMs = json.optLong("accumulatedPauseMs", 0L).coerceAtLeast(0L),
        lastInteractiveElapsedMs = json.optLong("lastInteractiveElapsedMs", -1L).takeIf { it >= 0L },
        lastInteractiveWallMs = json.optLong("lastInteractiveWallMs", -1L).takeIf { it > 0L },
        lastNonInteractiveElapsedMs = json.optLong("lastNonInteractiveElapsedMs", -1L).takeIf { it >= 0L },
        lastNonInteractiveWallMs = json.optLong("lastNonInteractiveWallMs", -1L).takeIf { it > 0L },
        lastActiveWallMs = json.optLong("lastActiveWallMs", startedAt + accumulated).coerceAtLeast(startedAt),
        bootReferenceWallMs = json.optLong("bootReferenceWallMs", 0L),
        triggeredThresholds = triggered,
        warningEvents = warnings,
        snoozeUntilElapsedMs = json.optLong("snoozeUntilElapsedMs", -1L).takeIf { it >= 0L },
        snoozedThresholdMinutes = json.optInt("snoozedThresholdMinutes", -1).takeIf { it > 0 },
        currentForegroundPackage = json.optString("currentForegroundPackage", "").takeIf { it.isNotBlank() },
        appUsageMs = appUsage,
        breakSuggestedAtWallMs = json.optLong("breakSuggestedAtWallMs", -1L).takeIf { it > 0L },
        meaningfulBreakMinutesAtStart = json.optInt(
          "meaningfulBreakMinutesAtStart",
          getSettings(context).breakResetMinutes
        ).coerceIn(1, 180)
      )
    } catch (_: Exception) {
      null
    }
  }

  @Synchronized
  fun saveSession(context: Context, state: ScreenSessionState) {
    val warningEvents = JSONArray().apply {
      state.warningEvents.forEach { event ->
        put(JSONObject().apply {
          put("thresholdMinutes", event.thresholdMinutes)
          put("timestampWallMs", event.timestampWallMs)
          put("followUp", event.followUp)
        })
      }
    }
    val appUsage = JSONObject().apply {
      state.appUsageMs.forEach { (packageName, durationMs) ->
        if (durationMs > 0L) put(packageName, durationMs)
      }
    }
    val json = JSONObject().apply {
      put("schemaVersion", ScreenAwarenessContract.SESSION_SCHEMA_VERSION)
      put("active", state.active)
      put("sessionId", state.sessionId)
      put("startedAtWallMs", state.startedAtWallMs)
      put("accumulatedInteractiveMs", state.accumulatedInteractiveMs)
      put("accumulatedPauseMs", state.accumulatedPauseMs)
      put("lastInteractiveElapsedMs", state.lastInteractiveElapsedMs ?: -1L)
      put("lastInteractiveWallMs", state.lastInteractiveWallMs ?: -1L)
      put("lastNonInteractiveElapsedMs", state.lastNonInteractiveElapsedMs ?: -1L)
      put("lastNonInteractiveWallMs", state.lastNonInteractiveWallMs ?: -1L)
      put("lastActiveWallMs", state.lastActiveWallMs)
      put("bootReferenceWallMs", state.bootReferenceWallMs)
      put("triggeredThresholds", JSONArray(state.triggeredThresholds.sorted()))
      put("warningEvents", warningEvents)
      put("snoozeUntilElapsedMs", state.snoozeUntilElapsedMs ?: -1L)
      put("snoozedThresholdMinutes", state.snoozedThresholdMinutes ?: -1)
      put("currentForegroundPackage", state.currentForegroundPackage ?: "")
      put("appUsageMs", appUsage)
      put("breakSuggestedAtWallMs", state.breakSuggestedAtWallMs ?: -1L)
      put("meaningfulBreakMinutesAtStart", state.meaningfulBreakMinutesAtStart)
    }
    context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_SESSION, json.toString())
      .apply()
  }

  @Synchronized
  fun clearSession(context: Context) {
    context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
      .edit()
      .remove(KEY_SESSION)
      .apply()
  }

  @Synchronized
  fun recordFinishedSession(
    context: Context,
    state: ScreenSessionState,
    endedAtWallMs: Long,
    endReason: String,
    completedNormally: Boolean,
    meaningfulBreakMinutes: Int = state.meaningfulBreakMinutesAtStart
  ) {
    if (!state.active || state.startedAtWallMs <= 0L || state.accumulatedInteractiveMs < 1_000L) return

    val activeDuration = state.accumulatedInteractiveMs
      .coerceIn(0L, ScreenAwarenessContract.MAX_REASONABLE_SESSION_MS)
    val pauseDuration = state.accumulatedPauseMs
      .coerceIn(0L, ScreenAwarenessContract.MAX_REASONABLE_SESSION_MS - activeDuration)
    val elapsedSpan = (activeDuration + pauseDuration)
      .coerceIn(activeDuration, ScreenAwarenessContract.MAX_REASONABLE_SESSION_MS)
    val expectedWallEnd = state.startedAtWallMs + elapsedSpan
    val safeWallEnd = endedAtWallMs.takeIf {
      it >= state.startedAtWallMs &&
        it - state.startedAtWallMs <= ScreenAwarenessContract.MAX_REASONABLE_SESSION_MS
    } ?: expectedWallEnd

    val history = readArray(context, KEY_HISTORY)
    for (index in 0 until history.length()) {
      if (history.optJSONObject(index)?.optString("sessionId") == state.sessionId) return
    }

    val completeAppUsage = state.appUsageMs.toMutableMap()
    val appUsageBreakdown = JSONArray().apply {
      completeAppUsage.entries
        .filter { it.value > 0L }
        .sortedByDescending { it.value }
        .forEach { (packageName, durationMs) ->
          put(JSONObject().apply {
            put("packageName", packageName)
            put("durationMs", durationMs.coerceAtMost(activeDuration))
          })
        }
    }
    val topApp = completeAppUsage.entries.filter { it.value > 0L }.maxByOrNull { it.value }

    history.put(JSONObject().apply {
      put("schemaVersion", ScreenAwarenessContract.SESSION_SCHEMA_VERSION)
      put("sessionId", state.sessionId)
      put("startTime", state.startedAtWallMs)
      put("endTime", safeWallEnd)
      put("activeDurationMs", activeDuration)
      put("elapsedSpanMs", elapsedSpan)
      put("pauseDurationMs", pauseDuration)
      put(
        "thresholdsTriggered",
        JSONArray(
          state.warningEvents
            .filterNot { it.followUp }
            .map { it.thresholdMinutes }
            .distinct()
            .sorted()
        )
      )
      put("warningCount", state.warningEvents.size)
      put("warningEvents", JSONArray().apply {
        state.warningEvents.forEach { event ->
          put(JSONObject().apply {
            put("thresholdMinutes", event.thresholdMinutes)
            put("timestamp", event.timestampWallMs)
            put("followUp", event.followUp)
          })
        }
      })
      put("longestForegroundAppPackage", topApp?.key ?: JSONObject.NULL)
      put("longestForegroundAppDurationMs", topApp?.value ?: 0L)
      put("appUsageBreakdown", appUsageBreakdown)
      put("sessionDateLocal", localDateKey(state.startedAtWallMs))
      put("completedNormally", completedNormally)
      put("endReason", endReason)
      put("meaningfulBreakMinutes", meaningfulBreakMinutes.coerceIn(1, 180))
      put("longestContinuousDurationMs", activeDuration)
    })
    writeTrimmedArray(context, KEY_HISTORY, history, MAX_SESSION_RECORDS)
    purgeOldHistory(context, System.currentTimeMillis())
  }

  @Synchronized
  fun recordWarning(context: Context, thresholdMinutes: Int, nowWallMs: Long) {
    val history = readArray(context, KEY_WARNING_HISTORY)
    history.put(JSONObject().apply {
      put("timestamp", nowWallMs)
      put("thresholdMinutes", thresholdMinutes)
    })
    writeTrimmedArray(context, KEY_WARNING_HISTORY, history, MAX_WARNING_RECORDS)
  }

  @Synchronized
  fun getVersion2FinishedSessions(context: Context): List<JSONObject> =
    readArray(context, KEY_HISTORY)
      .toObjectList()
      .filter { it.optInt("schemaVersion", 1) >= ScreenAwarenessContract.SESSION_SCHEMA_VERSION }

  @Synchronized
  fun getWarnings(context: Context): List<JSONObject> =
    readArray(context, KEY_WARNING_HISTORY).toObjectList()

  @Synchronized
  fun clearContinuousSessionHistory(context: Context) {
    context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
      .edit()
      .remove(KEY_HISTORY)
      .remove(KEY_WARNING_HISTORY)
      .apply()
    ScreenAwarenessReEntryManager.clearHistory(context)
  }

  @Synchronized
  fun purgeOldHistory(context: Context, nowWallMs: Long) {
    val cutoff = nowWallMs - ScreenAwarenessContract.SESSION_RETENTION_DAYS * 24L * 60L * 60_000L
    val sessions = JSONArray().apply {
      readArray(context, KEY_HISTORY).toObjectList().forEach { item ->
        if (item.optLong("startTime", 0L) >= cutoff) put(item)
      }
    }
    val warnings = JSONArray().apply {
      readArray(context, KEY_WARNING_HISTORY).toObjectList().forEach { item ->
        if (item.optLong("timestamp", 0L) >= cutoff) put(item)
      }
    }
    context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_HISTORY, sessions.toString())
      .putString(KEY_WARNING_HISTORY, warnings.toString())
      .apply()
  }

  private fun readArray(context: Context, key: String): JSONArray {
    val raw = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
      .getString(key, null)
      ?: return JSONArray()
    return try {
      JSONArray(raw)
    } catch (_: Exception) {
      JSONArray()
    }
  }

  private fun writeTrimmedArray(context: Context, key: String, source: JSONArray, max: Int) {
    val trimmed = JSONArray()
    val firstIndex = (source.length() - max).coerceAtLeast(0)
    for (index in firstIndex until source.length()) {
      source.optJSONObject(index)?.let(trimmed::put)
    }
    context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(key, trimmed.toString())
      .apply()
  }

  private fun JSONArray.toObjectList(): List<JSONObject> = buildList {
    for (index in 0 until length()) optJSONObject(index)?.let(::add)
  }

  private fun localDateKey(wallMs: Long): String =
    SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date(wallMs))
}

internal fun newScreenSession(
  nowWallMs: Long,
  nowElapsedMs: Long,
  meaningfulBreakMinutes: Int
): ScreenSessionState = ScreenSessionState(
  schemaVersion = ScreenAwarenessContract.SESSION_SCHEMA_VERSION,
  active = true,
  sessionId = "screen-${nowWallMs}-${UUID.randomUUID().toString().take(8)}",
  startedAtWallMs = nowWallMs,
  lastInteractiveElapsedMs = nowElapsedMs,
  lastInteractiveWallMs = nowWallMs,
  lastActiveWallMs = nowWallMs,
  bootReferenceWallMs = nowWallMs - nowElapsedMs,
  meaningfulBreakMinutesAtStart = meaningfulBreakMinutes.coerceIn(1, 180)
)

internal fun isSameBoot(state: ScreenSessionState, nowWallMs: Long, nowElapsedMs: Long): Boolean {
  if (state.bootReferenceWallMs <= 0L) return false
  return abs(state.bootReferenceWallMs - (nowWallMs - nowElapsedMs)) < 60_000L
}

private fun Map<String, Any?>.booleanValue(key: String): Boolean? = this[key] as? Boolean

private fun Map<String, Any?>.intValue(key: String): Int? = when (val value = this[key]) {
  is Int -> value
  is Long -> value.toInt()
  is Double -> value.toInt()
  is Float -> value.toInt()
  is String -> value.toIntOrNull()
  else -> null
}
