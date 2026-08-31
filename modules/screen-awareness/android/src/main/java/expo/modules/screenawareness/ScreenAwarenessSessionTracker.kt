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
    state = when {
      restored == null -> ScreenSessionState()
      isSameBoot(restored, nowWall, nowElapsed) -> restored.apply {
        schemaVersion = ScreenAwarenessContract.SESSION_SCHEMA_VERSION
      }
      else -> {
        ScreenAwarenessStore.recordFinishedSession(
          appContext,
          restored,
          restored.lastActiveWallMs.coerceAtLeast(restored.startedAtWallMs),
          ScreenSessionEndReason.DEVICE_REBOOT,
          completedNormally = false
        )
        ScreenAwarenessStore.clearSession(appContext)
        ScreenSessionState()
      }
    }
  }

  @Synchronized
  fun onServiceStarted(interactive: Boolean) {
    val nowWall = System.currentTimeMillis()
    val nowElapsed = SystemClock.elapsedRealtime()
    val settings = ScreenAwarenessStore.getSettings(appContext)
    if (!state.active && interactive) {
      state = newScreenSession(nowWall, nowElapsed, settings.breakResetMinutes)
    } else if (state.active && interactive) {
      resumeOrResetAfterBreak(nowWall, nowElapsed)
    } else if (state.active && state.lastNonInteractiveElapsedMs == null) {
      // Android may recreate the service after killing the process. The exact screen-off
      // instant is unknowable then, so treat unobserved time as a conservative pause.
      val unknownGapMs = (nowWall - state.lastActiveWallMs)
        .coerceIn(0L, ScreenAwarenessContract.MAX_REASONABLE_SESSION_MS)
      state.lastInteractiveElapsedMs = null
      state.lastInteractiveWallMs = null
      state.lastNonInteractiveElapsedMs = (nowElapsed - unknownGapMs).coerceAtLeast(0L)
      state.lastNonInteractiveWallMs = (nowWall - unknownGapMs).coerceAtLeast(state.startedAtWallMs)
      state.currentForegroundPackage = null
    }
    persist()
  }

  @Synchronized
  fun onScreenOff() {
    if (!state.active) return
    val nowWall = System.currentTimeMillis()
    val nowElapsed = SystemClock.elapsedRealtime()
    settleInteractiveTime(nowWall, nowElapsed)
    state.lastInteractiveElapsedMs = null
    state.lastInteractiveWallMs = null
    if (state.lastNonInteractiveElapsedMs == null) {
      state.lastNonInteractiveElapsedMs = nowElapsed
      state.lastNonInteractiveWallMs = nowWall
    }
    state.currentForegroundPackage = null
    persist()
  }

  @Synchronized
  fun onScreenOn(): Boolean {
    val nowWall = System.currentTimeMillis()
    val nowElapsed = SystemClock.elapsedRealtime()
    val reset = if (!state.active) {
      state = newScreenSession(
        nowWall,
        nowElapsed,
        ScreenAwarenessStore.getSettings(appContext).breakResetMinutes
      )
      true
    } else {
      resumeOrResetAfterBreak(nowWall, nowElapsed)
    }
    persist()
    return reset
  }

  @Synchronized
  fun millisecondsUntilMeaningfulBreak(): Long? {
    if (!state.active) return null
    val nonInteractiveAt = state.lastNonInteractiveElapsedMs ?: return null
    val resetAfterMs = ScreenAwarenessStore.getSettings(appContext).breakResetMinutes * 60_000L
    return (resetAfterMs - (SystemClock.elapsedRealtime() - nonInteractiveAt)).coerceAtLeast(0L)
  }

  @Synchronized
  fun finalizeMeaningfulBreakIfDue(): Boolean {
    if (!state.active) return false
    val nonInteractiveAt = state.lastNonInteractiveElapsedMs ?: return false
    val nowElapsed = SystemClock.elapsedRealtime()
    val settings = ScreenAwarenessStore.getSettings(appContext)
    if (nowElapsed - nonInteractiveAt < settings.breakResetMinutes * 60_000L) return false
    finishMeaningfulBreak(settings.breakResetMinutes)
    return true
  }

  @Synchronized
  fun tick(
    interactive: Boolean,
    observedForegroundPackage: String?,
    appObservationAvailable: Boolean,
    allowWarnings: Boolean
  ): ScreenAwarenessWarning? {
    if (!interactive) {
      onScreenOff()
      return null
    }

    val nowWall = System.currentTimeMillis()
    val nowElapsed = SystemClock.elapsedRealtime()
    if (!state.active) {
      state = newScreenSession(
        nowWall,
        nowElapsed,
        ScreenAwarenessStore.getSettings(appContext).breakResetMinutes
      )
    } else if (state.lastInteractiveElapsedMs == null) {
      resumeOrResetAfterBreak(nowWall, nowElapsed)
    }

    // Credit the interval to the package seen during the preceding poll, then retain
    // the latest package for the next interval. This avoids overlapping app time.
    settleInteractiveTime(nowWall, nowElapsed)
    if (appObservationAvailable) {
      if (!observedForegroundPackage.isNullOrBlank()) {
        state.currentForegroundPackage = observedForegroundPackage
      }
    } else {
      state.currentForegroundPackage = null
    }

    if (!allowWarnings) {
      persist()
      return null
    }

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
      if (snoozedThreshold != null && !isActiveFocusSession()) {
        recordWarningEvent(snoozedThreshold, nowWall, followUp = true)
        persist()
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
      recordWarningEvent(threshold, nowWall, followUp = false)
      persist()
      ScreenAwarenessStore.recordWarning(appContext, threshold, nowWall)
      return ScreenAwarenessWarning(threshold)
    }

    persist()
    return null
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
    if (!state.active) {
      ScreenAwarenessStore.clearSession(appContext)
      return
    }
    val nowWall = System.currentTimeMillis()
    if (state.lastInteractiveElapsedMs != null) {
      settleInteractiveTime(nowWall, SystemClock.elapsedRealtime())
    }
    val endedAt = if (state.lastNonInteractiveWallMs != null) {
      state.lastActiveWallMs
    } else {
      nowWall
    }
    ScreenAwarenessStore.recordFinishedSession(
      appContext,
      state,
      endedAt,
      ScreenSessionEndReason.FEATURE_DISABLED,
      completedNormally = false
    )
    state = ScreenSessionState()
    ScreenAwarenessStore.clearSession(appContext)
  }

  @Synchronized
  fun snapshot(): Map<String, Any?> = state.toMap(SystemClock.elapsedRealtime())

  private fun resumeOrResetAfterBreak(nowWall: Long, nowElapsed: Long): Boolean {
    val nonInteractiveAt = state.lastNonInteractiveElapsedMs
    if (nonInteractiveAt != null) {
      val breakMs = (nowElapsed - nonInteractiveAt).coerceAtLeast(0L)
      val settings = ScreenAwarenessStore.getSettings(appContext)
      val resetAfterMs = settings.breakResetMinutes * 60_000L
      if (breakMs >= resetAfterMs) {
        finishMeaningfulBreak(settings.breakResetMinutes)
        state = newScreenSession(nowWall, nowElapsed, settings.breakResetMinutes)
        return true
      }
      state.accumulatedPauseMs = (state.accumulatedPauseMs + breakMs)
        .coerceAtMost(ScreenAwarenessContract.MAX_REASONABLE_SESSION_MS)
    }
    state.lastNonInteractiveElapsedMs = null
    state.lastNonInteractiveWallMs = null
    state.lastInteractiveElapsedMs = nowElapsed
    state.lastInteractiveWallMs = nowWall
    state.currentForegroundPackage = null
    return false
  }

  private fun finishMeaningfulBreak(meaningfulBreakMinutes: Int) {
    val endedAt = (state.lastNonInteractiveWallMs ?: state.lastActiveWallMs)
      .coerceAtLeast(state.startedAtWallMs)
    ScreenAwarenessStore.recordFinishedSession(
      appContext,
      state,
      endedAt,
      ScreenSessionEndReason.MEANINGFUL_BREAK,
      completedNormally = true,
      meaningfulBreakMinutes = meaningfulBreakMinutes
    )
    state = ScreenSessionState()
    ScreenAwarenessStore.clearSession(appContext)
  }

  private fun settleInteractiveTime(nowWall: Long, nowElapsed: Long) {
    val previous = state.lastInteractiveElapsedMs ?: return
    val remaining = (ScreenAwarenessContract.MAX_REASONABLE_SESSION_MS -
      state.accumulatedInteractiveMs).coerceAtLeast(0L)
    val delta = (nowElapsed - previous).coerceIn(0L, remaining)
    if (delta > 0L) {
      state.accumulatedInteractiveMs += delta
      val packageName = state.currentForegroundPackage
        ?: ScreenAwarenessContract.UNKNOWN_APP_PACKAGE
      state.appUsageMs[packageName] = (state.appUsageMs[packageName] ?: 0L) + delta
      state.lastActiveWallMs = nowWall
    }
    state.lastInteractiveElapsedMs = nowElapsed
    state.lastInteractiveWallMs = nowWall
  }

  private fun recordWarningEvent(thresholdMinutes: Int, nowWall: Long, followUp: Boolean) {
    state.warningEvents.add(
      ScreenWarningEvent(
        thresholdMinutes = thresholdMinutes,
        timestampWallMs = nowWall,
        followUp = followUp
      )
    )
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
