export const FOCUS_TIMER_STATE_KEY = "focusTimerState";

const clampToWholeSeconds = (value) => {
  if (!Number.isFinite(Number(value))) return 0;
  return Math.max(0, Math.floor(Number(value)));
};

export const buildTimerSession = ({
  durationSeconds,
  elapsedSeconds = 0,
  nowTimestamp = Date.now(),
}) => {
  const safeDuration = clampToWholeSeconds(durationSeconds);
  const safeElapsed = Math.min(clampToWholeSeconds(elapsedSeconds), safeDuration);
  const startTimestamp = nowTimestamp - safeElapsed * 1000;
  const endTimestamp = startTimestamp + safeDuration * 1000;

  return {
    startTimestamp,
    endTimestamp,
    durationSeconds: safeDuration,
    elapsedSeconds: safeElapsed,
  };
};

export const getElapsedSecondsFromTimestamp = ({
  startTimestamp,
  nowTimestamp = Date.now(),
  maxDurationSeconds,
}) => {
  if (!startTimestamp) return 0;
  const elapsedSeconds = clampToWholeSeconds((nowTimestamp - startTimestamp) / 1000);
  if (!Number.isFinite(Number(maxDurationSeconds))) return elapsedSeconds;
  return Math.min(elapsedSeconds, clampToWholeSeconds(maxDurationSeconds));
};

export const getRemainingSecondsFromTimestamp = ({
  endTimestamp,
  nowTimestamp = Date.now(),
}) => {
  if (!endTimestamp) return 0;
  return clampToWholeSeconds((endTimestamp - nowTimestamp) / 1000);
};

export const serializeTimerState = (state) => {
  try {
    return JSON.stringify({
      activeTaskId: state?.activeTaskId ?? null,
      focusTime: clampToWholeSeconds(state?.focusTime ?? 0),
      currentDuration: clampToWholeSeconds(state?.currentDuration ?? 0),
      isTimerRunning: Boolean(state?.isTimerRunning),
      isFocusCompleted: Boolean(state?.isFocusCompleted),
      focusStartTimestamp: state?.focusStartTimestamp || null,
      focusEndTimestamp: state?.focusEndTimestamp || null,
      persistedAt: Date.now(),
    });
  } catch (error) {
    return JSON.stringify({
      activeTaskId: null,
      focusTime: 0,
      currentDuration: 0,
      isTimerRunning: false,
      isFocusCompleted: false,
      focusStartTimestamp: null,
      focusEndTimestamp: null,
      persistedAt: Date.now(),
    });
  }
};

export const deserializeTimerState = (value) => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      activeTaskId: parsed.activeTaskId ?? null,
      focusTime: clampToWholeSeconds(parsed.focusTime ?? 0),
      currentDuration: clampToWholeSeconds(parsed.currentDuration ?? 0),
      isTimerRunning: Boolean(parsed.isTimerRunning),
      isFocusCompleted: Boolean(parsed.isFocusCompleted),
      focusStartTimestamp: parsed.focusStartTimestamp || null,
      focusEndTimestamp: parsed.focusEndTimestamp || null,
    };
  } catch (error) {
    return null;
  }
};
