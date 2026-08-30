package expo.modules.screenawareness

import android.content.Context
import android.os.SystemClock
import org.json.JSONObject

internal data class ScreenAwarenessWarning(
  val thresholdMinutes: Int,
  val followUp: Boolean = false
)

internal class ScreenAwarenessSessionTracker(context: Context) {
  private val appContext = context.applicationContext
  private var state: ScreenSessionState

  init {
    val nowWall = System.currentTimeMillis()
    val nowElapsed = SystemClock.elapsedRealtime()
    val restored = ScreenAwarenessStore.getSession(appContext)
    state = if (restored != null && isSameBoot(restored, nowWall, nowElapsed)) {
      restored
    } else {
      ScreenAwarenessStore.clearSession(appContext)
      ScreenSessionState()
    }
  }

  @Synchronized
  fun onServiceStarted(interactive: Boolean) {
    val nowWall = System.currentTimeMillis()
    val nowElapsed = SystemClock.elapsedRealtime()
    if (!state.active && interactive) {
      state = newScreenSession(nowWall, nowElapsed)
    } else if (state.active && interactive) {
      resumeOrResetAfterBreak(nowWall, nowElapsed)
    } else if (state.active && state.lastNonInteractiveElapsedMs == null) {
      settleInteractiveTime(nowElapsed)
      state.lastInteractiveElapsedMs = null
      state.lastNonInteractiveElapsedMs = nowElapsed
    }
    persist()
  }

  @Synchronized
  fun onScreenOff() {
    if (!state.active) return
    val nowElapsed = SystemClock.elapsedRealtime()
    settleInteractiveTime(nowElapsed)
    state.lastInteractiveElapsedMs = null
    if (state.lastNonInteractiveElapsedMs == null) {
      state.lastNonInteractiveElapsedMs = nowElapsed
    }
    persist()
  }

  @Synchronized
  fun onScreenOn(): Boolean {
    val nowWall = System.currentTimeMillis()
    val nowElapsed = SystemClock.elapsedRealtime()
    val reset = if (!state.active) {
      state = newScreenSession(nowWall, nowElapsed)
      true
    } else {
      resumeOrResetAfterBreak(nowWall, nowElapsed)
    }
    persist()
    return reset
  }

  @Synchronized
  fun tick(interactive: Boolean): ScreenAwarenessWarning? {
    if (!interactive) {
      onScreenOff()
      return null
    }

    val nowWall = System.currentTimeMillis()
    val nowElapsed = SystemClock.elapsedRealtime()
    if (!state.active) {
      state = newScreenSession(nowWall, nowElapsed)
    } else if (state.lastInteractiveElapsedMs == null) {
      resumeOrResetAfterBreak(nowWall, nowElapsed)
    }
    settleInteractiveTime(nowElapsed)

    val settings = ScreenAwarenessStore.getSettings(appContext)
    val snoozeUntil = state.snoozeUntilElapsedMs
    if (snoozeUntil != null) {
      if (snoozeUntil > nowElapsed) {
        persist()
        return null
      }
      val snoozedThreshold = state.snoozedThresholdMinutes
      state.snoozeUntilElapsedMs = null
      state.snoozedThresholdMinutes = null
      persist()
      if (snoozedThreshold != null && !isActiveFocusSession()) {
        ScreenAwarenessStore.recordWarning(appContext, snoozedThreshold, nowWall)
        return ScreenAwarenessWarning(snoozedThreshold, followUp = true)
      }
    }

    if (isActiveFocusSession()) {
      persist()
      return null
    }

    val activeMinutes = state.accumulatedInteractiveMs / 60_000L
    val reached = settings.enabledThresholds()
      .filter { it.toLong() <= activeMinutes && it !in state.triggeredThresholds }
    val threshold = reached.maxOrNull()
    if (threshold != null) {
      state.triggeredThresholds.addAll(reached)
      persist()
      ScreenAwarenessStore.recordWarning(appContext, threshold, nowWall)
      return ScreenAwarenessWarning(threshold)
    }

    persist()
    return null
  }

  @Synchronized
  fun updateForegroundPackage(packageName: String?) {
    if (state.currentForegroundPackage == packageName) return
    state.currentForegroundPackage = packageName
    persist()
  }

  @Synchronized
  fun applyAction(action: String, thresholdMinutes: Int) {
    when (action) {
      ScreenAwarenessContract.ACTION_SNOOZE -> {
        state.snoozeUntilElapsedMs =
          SystemClock.elapsedRealtime() + ScreenAwarenessContract.SNOOZE_DURATION_MS
        state.snoozedThresholdMinutes = thresholdMinutes
      }
      ScreenAwarenessContract.ACTION_TAKE_BREAK -> {
        state.snoozeUntilElapsedMs = null
        state.snoozedThresholdMinutes = null
        state.breakSuggestedAtWallMs = System.currentTimeMillis()
      }
      ScreenAwarenessContract.ACTION_CONTINUE -> {
        state.snoozeUntilElapsedMs = null
        state.snoozedThresholdMinutes = null
      }
    }
    persist()
  }

  @Synchronized
  fun finishForDisable() {
    val nowElapsed = SystemClock.elapsedRealtime()
    settleInteractiveTime(nowElapsed)
    ScreenAwarenessStore.recordFinishedSession(appContext, state, System.currentTimeMillis())
    state = ScreenSessionState()
    ScreenAwarenessStore.clearSession(appContext)
  }

  @Synchronized
  fun snapshot(): Map<String, Any?> = state.toMap(SystemClock.elapsedRealtime())

  private fun resumeOrResetAfterBreak(nowWall: Long, nowElapsed: Long): Boolean {
    val nonInteractiveAt = state.lastNonInteractiveElapsedMs
    if (nonInteractiveAt != null) {
      val breakMs = (nowElapsed - nonInteractiveAt).coerceAtLeast(0L)
      val resetAfterMs = ScreenAwarenessStore.getSettings(appContext)
        .breakResetMinutes * 60_000L
      if (breakMs >= resetAfterMs) {
        ScreenAwarenessStore.recordFinishedSession(appContext, state, nowWall)
        state = newScreenSession(nowWall, nowElapsed)
        return true
      }
    }
    state.lastNonInteractiveElapsedMs = null
    state.lastInteractiveElapsedMs = nowElapsed
    return false
  }

  private fun settleInteractiveTime(nowElapsed: Long) {
    val previous = state.lastInteractiveElapsedMs ?: return
    val delta = (nowElapsed - previous).coerceAtLeast(0L)
    state.accumulatedInteractiveMs += delta
    state.lastInteractiveElapsedMs = nowElapsed
  }

  private fun persist() {
    if (state.active) ScreenAwarenessStore.saveSession(appContext, state)
  }

  private fun isActiveFocusSession(): Boolean {
    return try {
      val raw = appContext
        .getSharedPreferences("focus_lock_screen_store_v1", Context.MODE_PRIVATE)
        .getString("current_session", null)
        ?: return false
      val json = JSONObject(raw)
      json.optString("extra_focus_status") == "active" &&
        json.optLong("extra_focus_expected_end_at_millis", 0L) > System.currentTimeMillis()
    } catch (_: Exception) {
      false
    }
  }
}
