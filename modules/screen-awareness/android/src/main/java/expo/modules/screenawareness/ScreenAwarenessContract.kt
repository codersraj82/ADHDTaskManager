package expo.modules.screenawareness

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
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
  const val EXTRA_THRESHOLD_MINUTES = "extra_threshold_minutes"

  const val POLL_INTERVAL_MS = 12_000L
  const val SNOOZE_DURATION_MS = 10 * 60_000L
  val SUPPORTED_THRESHOLDS = listOf(20, 30, 45, 60)
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
  val vibrationEnabled: Boolean = false
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
    "vibrationEnabled" to vibrationEnabled
  )
}

internal data class ScreenSessionState(
  var active: Boolean = false,
  var sessionId: String = "",
  var startedAtWallMs: Long = 0L,
  var accumulatedInteractiveMs: Long = 0L,
  var lastInteractiveElapsedMs: Long? = null,
  var lastNonInteractiveElapsedMs: Long? = null,
  var bootReferenceWallMs: Long = 0L,
  var triggeredThresholds: MutableSet<Int> = mutableSetOf(),
  var snoozeUntilElapsedMs: Long? = null,
  var snoozedThresholdMinutes: Int? = null,
  var currentForegroundPackage: String? = null,
  var breakSuggestedAtWallMs: Long? = null
) {
  fun toMap(nowElapsedMs: Long): Map<String, Any?> {
    val liveDelta = lastInteractiveElapsedMs
      ?.let { (nowElapsedMs - it).coerceAtLeast(0L) }
      ?: 0L
    return mapOf(
      "active" to active,
      "sessionId" to sessionId.takeIf { it.isNotBlank() },
      "startedAt" to startedAtWallMs.takeIf { it > 0L },
      "activeDurationMs" to (accumulatedInteractiveMs + liveDelta),
      "screenInteractive" to (lastInteractiveElapsedMs != null),
      "lastNonInteractiveElapsedMs" to lastNonInteractiveElapsedMs,
      "thresholdsTriggered" to triggeredThresholds.sorted(),
      "snoozed" to ((snoozeUntilElapsedMs ?: 0L) > nowElapsedMs),
      "snoozeRemainingMs" to ((snoozeUntilElapsedMs ?: nowElapsedMs) - nowElapsedMs)
        .coerceAtLeast(0L),
      "currentForegroundPackage" to currentForegroundPackage,
      "breakSuggestedAt" to breakSuggestedAtWallMs
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
  private const val KEY_SESSION = "current_session"
  private const val KEY_HISTORY = "session_history"
  private const val KEY_WARNING_HISTORY = "warning_history"
  private const val MAX_SESSION_RECORDS = 400
  private const val MAX_WARNING_RECORDS = 1_000

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
      vibrationEnabled = prefs.getBoolean(KEY_VIBRATION_ENABLED, false)
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
  fun updateSettings(
    context: Context,
    values: Map<String, Any?>
  ): ScreenAwarenessSettings {
    val current = getSettings(context)
    val breakMinutes = values.intValue("breakResetMinutes")
      ?.coerceIn(1, 180)
      ?: current.breakResetMinutes
    val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    prefs.edit()
      .putBoolean("threshold_20", values.booleanValue("threshold20Enabled") ?: current.threshold20Enabled)
      .putBoolean("threshold_30", values.booleanValue("threshold30Enabled") ?: current.threshold30Enabled)
      .putBoolean("threshold_45", values.booleanValue("threshold45Enabled") ?: current.threshold45Enabled)
      .putBoolean("threshold_60", values.booleanValue("threshold60Enabled") ?: current.threshold60Enabled)
      .putInt(KEY_BREAK_RESET_MINUTES, breakMinutes)
      .putBoolean(KEY_SHOW_OVERLAY, values.booleanValue("showOverlay") ?: current.showOverlay)
      .putBoolean(KEY_SHOW_NOTIFICATION, values.booleanValue("showNotification") ?: current.showNotification)
      .putBoolean(KEY_SOUND_ENABLED, values.booleanValue("soundEnabled") ?: current.soundEnabled)
      .putBoolean(KEY_VIBRATION_ENABLED, values.booleanValue("vibrationEnabled") ?: current.vibrationEnabled)
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
        thresholdsJson.optInt(index).takeIf { it in ScreenAwarenessContract.SUPPORTED_THRESHOLDS }
          ?.let(triggered::add)
      }
      ScreenSessionState(
        active = json.optBoolean("active", false),
        sessionId = json.optString("sessionId", ""),
        startedAtWallMs = json.optLong("startedAtWallMs", 0L),
        accumulatedInteractiveMs = json.optLong("accumulatedInteractiveMs", 0L)
          .coerceAtLeast(0L),
        lastInteractiveElapsedMs = json.optLong("lastInteractiveElapsedMs", -1L)
          .takeIf { it >= 0L },
        lastNonInteractiveElapsedMs = json.optLong("lastNonInteractiveElapsedMs", -1L)
          .takeIf { it >= 0L },
        bootReferenceWallMs = json.optLong("bootReferenceWallMs", 0L),
        triggeredThresholds = triggered,
        snoozeUntilElapsedMs = json.optLong("snoozeUntilElapsedMs", -1L)
          .takeIf { it >= 0L },
        snoozedThresholdMinutes = json.optInt("snoozedThresholdMinutes", -1)
          .takeIf { it > 0 },
        currentForegroundPackage = json.optString("currentForegroundPackage", "")
          .takeIf { it.isNotBlank() },
        breakSuggestedAtWallMs = json.optLong("breakSuggestedAtWallMs", -1L)
          .takeIf { it > 0L }
      )
    } catch (_: Exception) {
      null
    }
  }

  @Synchronized
  fun saveSession(context: Context, state: ScreenSessionState) {
    val json = JSONObject().apply {
      put("active", state.active)
      put("sessionId", state.sessionId)
      put("startedAtWallMs", state.startedAtWallMs)
      put("accumulatedInteractiveMs", state.accumulatedInteractiveMs)
      put("lastInteractiveElapsedMs", state.lastInteractiveElapsedMs ?: -1L)
      put("lastNonInteractiveElapsedMs", state.lastNonInteractiveElapsedMs ?: -1L)
      put("bootReferenceWallMs", state.bootReferenceWallMs)
      put("triggeredThresholds", JSONArray(state.triggeredThresholds.sorted()))
      put("snoozeUntilElapsedMs", state.snoozeUntilElapsedMs ?: -1L)
      put("snoozedThresholdMinutes", state.snoozedThresholdMinutes ?: -1)
      put("currentForegroundPackage", state.currentForegroundPackage ?: "")
      put("breakSuggestedAtWallMs", state.breakSuggestedAtWallMs ?: -1L)
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
    endedAtWallMs: Long
  ) {
    if (!state.active || state.startedAtWallMs <= 0L || state.accumulatedInteractiveMs < 1_000L) {
      return
    }
    val history = readArray(context, KEY_HISTORY)
    history.put(JSONObject().apply {
      put("sessionId", state.sessionId)
      put("startTime", state.startedAtWallMs)
      put("endTime", endedAtWallMs)
      put("activeDurationMs", state.accumulatedInteractiveMs)
      put("longestContinuousDurationMs", state.accumulatedInteractiveMs)
      put("thresholdsTriggered", JSONArray(state.triggeredThresholds.sorted()))
    })
    writeTrimmedArray(context, KEY_HISTORY, history, MAX_SESSION_RECORDS)
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
  fun getFinishedSessions(context: Context): List<JSONObject> =
    readArray(context, KEY_HISTORY).toObjectList()

  @Synchronized
  fun getWarnings(context: Context): List<JSONObject> =
    readArray(context, KEY_WARNING_HISTORY).toObjectList()

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
    for (index in 0 until length()) {
      optJSONObject(index)?.let(::add)
    }
  }
}

internal fun newScreenSession(nowWallMs: Long, nowElapsedMs: Long): ScreenSessionState =
  ScreenSessionState(
    active = true,
    sessionId = "screen-${nowWallMs}-${UUID.randomUUID().toString().take(8)}",
    startedAtWallMs = nowWallMs,
    lastInteractiveElapsedMs = nowElapsedMs,
    bootReferenceWallMs = nowWallMs - nowElapsedMs
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
