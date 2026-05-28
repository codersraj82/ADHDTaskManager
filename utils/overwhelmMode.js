import { parseStoredDateTime } from "./formatDateTime";
import { getTaskAvoidanceSignal, isTaskFeelingHeavy } from "./taskSupportSignals";

export const OVERWHELM_SUGGESTION_TYPES = Object.freeze({
  QUICK_WIN: "quickWin",
  IMPORTANT: "important",
  FEELING_HEAVY: "feelingHeavy",
});

const OVERWHELM_LABELS = Object.freeze({
  [OVERWHELM_SUGGESTION_TYPES.QUICK_WIN]: "Quick win",
  [OVERWHELM_SUGGESTION_TYPES.IMPORTANT]: "Important",
  [OVERWHELM_SUGGESTION_TYPES.FEELING_HEAVY]: "Feeling heavy",
});

const OVERWHELM_REASONS = Object.freeze({
  [OVERWHELM_SUGGESTION_TYPES.QUICK_WIN]: "Small and doable.",
  [OVERWHELM_SUGGESTION_TYPES.IMPORTANT]: "This one may matter today.",
  [OVERWHELM_SUGGESTION_TYPES.FEELING_HEAVY]:
    "This may need a softer restart.",
});

const isFlagEnabled = (value) => value === true || value === 1;

const isDeletedOrArchived = (task) =>
  isFlagEnabled(task?.deleted) ||
  isFlagEnabled(task?.isDeleted) ||
  isFlagEnabled(task?.archived) ||
  isFlagEnabled(task?.isArchived);

const toIdKey = (task) => {
  if (!task || task.id === null || task.id === undefined) return "";
  return String(task.id);
};

const toIdNumeric = (task) => {
  const numeric = Number(task?.id);
  return Number.isFinite(numeric) ? numeric : Number.POSITIVE_INFINITY;
};

const getIncompleteSubtaskCount = (task) => {
  const subtasks = Array.isArray(task?.subtasks) ? task.subtasks : [];
  return subtasks.reduce((count, subtask) => {
    if (!subtask || subtask.completed) return count;
    return count + 1;
  }, 0);
};

const hasFirstAction = (task) =>
  typeof task?.firstAction === "string" && task.firstAction.trim().length > 0;

const hasMinimumVersion = (task) =>
  typeof task?.minimumVersion === "string" &&
  task.minimumVersion.trim().length > 0;

const normalize = (value) => String(value || "").trim().toLowerCase();

const getFocusRequired = (task) => normalize(task?.focusRequired || task?.focusNeed);

const getTaskContext = (task) => normalize(task?.taskContext || task?.context);

const hasLowEstimatedMinutes = (task) => {
  const minutes = Number(task?.estimatedMinutes ?? task?.estimateMinutes);
  return Number.isFinite(minutes) && minutes > 0 && minutes <= 10;
};

const isHighEnergy = (task) => {
  const energy = normalize(task?.energyRequired || task?.energy);
  return (
    energy === "high" ||
    energy === "high_energy" ||
    energy === "high-energy" ||
    energy === "very_high" ||
    energy === "very-high"
  );
};

const isHighPriority = (task) =>
  String(task?.priority || "").trim().toLowerCase() === "high";

const getScheduledTimestamp = (task) => {
  const parsed = parseStoredDateTime(task?.scheduledTime);
  if (!parsed) return null;
  const ts = parsed.getTime();
  return Number.isFinite(ts) ? ts : null;
};

const isScheduledToday = (timestamp, now) => {
  if (!Number.isFinite(timestamp)) return false;
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const end = start + 24 * 60 * 60 * 1000 - 1;
  return timestamp >= start && timestamp <= end;
};

const getEffectiveSnoozeCount = (task) => {
  if (task?.reminderSnoozeCount !== undefined && task?.reminderSnoozeCount !== null) {
    const snooze = Number(task.reminderSnoozeCount);
    return Number.isFinite(snooze) ? snooze : 0;
  }
  const snooze = Number(task?.snoozeCount);
  return Number.isFinite(snooze) ? snooze : 0;
};

const toPendingEntries = (tasks, now) => {
  const safeTasks = Array.isArray(tasks) ? tasks.filter(Boolean) : [];
  return safeTasks
    .filter((task) => !task.completed && !isDeletedOrArchived(task))
    .map((task) => {
      const signal = getTaskAvoidanceSignal(task, now);
      const scheduledTimestamp = getScheduledTimestamp(task);
      return {
        task,
        signal,
        scheduledTimestamp,
        incompleteSubtasks: getIncompleteSubtaskCount(task),
      };
    });
};

const sortByStableId = (a, b) => toIdNumeric(a.task) - toIdNumeric(b.task);

const getAvailableEntries = (entries, usedKeys) =>
  entries.filter((entry) => {
    const key = toIdKey(entry.task);
    return key && !usedKeys.has(key);
  });

const pickQuickWinEntry = (entries, usedKeys, now) => {
  const available = getAvailableEntries(entries, usedKeys);
  if (!available.length) return null;

  const nonHeavy = available
    .filter((entry) => entry.signal.level !== "heavy")
    .sort((a, b) => {
      const aToday = isScheduledToday(a.scheduledTimestamp, now) ? 1 : 0;
      const bToday = isScheduledToday(b.scheduledTimestamp, now) ? 1 : 0;
      if (aToday !== bToday) return bToday - aToday;

      const aLowEstimate = hasLowEstimatedMinutes(a.task) ? 1 : 0;
      const bLowEstimate = hasLowEstimatedMinutes(b.task) ? 1 : 0;
      if (aLowEstimate !== bLowEstimate) return bLowEstimate - aLowEstimate;

      const aLightFocus = getFocusRequired(a.task) === "light" ? 1 : 0;
      const bLightFocus = getFocusRequired(b.task) === "light" ? 1 : 0;
      if (aLightFocus !== bLightFocus) return bLightFocus - aLightFocus;

      const aAnywhere = getTaskContext(a.task) === "anywhere" ? 1 : 0;
      const bAnywhere = getTaskContext(b.task) === "anywhere" ? 1 : 0;
      if (aAnywhere !== bAnywhere) return bAnywhere - aAnywhere;

      if (a.incompleteSubtasks !== b.incompleteSubtasks) {
        return a.incompleteSubtasks - b.incompleteSubtasks;
      }

      const aEasyStart = hasFirstAction(a.task) || hasMinimumVersion(a.task) ? 1 : 0;
      const bEasyStart = hasFirstAction(b.task) || hasMinimumVersion(b.task) ? 1 : 0;
      if (aEasyStart !== bEasyStart) return bEasyStart - aEasyStart;

      const aHighEnergy = isHighEnergy(a.task) ? 1 : 0;
      const bHighEnergy = isHighEnergy(b.task) ? 1 : 0;
      if (aHighEnergy !== bHighEnergy) return aHighEnergy - bHighEnergy;

      if (a.signal.score !== b.signal.score) return a.signal.score - b.signal.score;
      return sortByStableId(a, b);
    });

  if (nonHeavy.length) return nonHeavy[0];

  const withFirstAction = available
    .filter((entry) => hasFirstAction(entry.task))
    .sort(sortByStableId);
  if (withFirstAction.length) return withFirstAction[0];

  const withMinimumVersion = available
    .filter((entry) => hasMinimumVersion(entry.task))
    .sort(sortByStableId);
  if (withMinimumVersion.length) return withMinimumVersion[0];

  return [...available].sort(sortByStableId)[0] || null;
};

const pickImportantEntry = (entries, usedKeys, now) => {
  const available = getAvailableEntries(entries, usedKeys);
  if (!available.length) return null;
  const nowTs = now.getTime();

  const nearestScheduled = available
    .filter((entry) => Number.isFinite(entry.scheduledTimestamp))
    .sort((a, b) => {
      const aFuture = a.scheduledTimestamp >= nowTs ? 1 : 0;
      const bFuture = b.scheduledTimestamp >= nowTs ? 1 : 0;
      if (aFuture !== bFuture) return bFuture - aFuture;

      const aDistance = Math.abs(a.scheduledTimestamp - nowTs);
      const bDistance = Math.abs(b.scheduledTimestamp - nowTs);
      if (aDistance !== bDistance) return aDistance - bDistance;
      return sortByStableId(a, b);
    });
  if (nearestScheduled.length) return nearestScheduled[0];

  const pinned = available
    .filter((entry) => Boolean(entry.task?.isPinned))
    .sort(sortByStableId);
  if (pinned.length) return pinned[0];

  const highPriority = available
    .filter((entry) => isHighPriority(entry.task))
    .sort(sortByStableId);
  if (highPriority.length) return highPriority[0];

  return [...available].sort(sortByStableId)[0] || null;
};

const pickHeavyEntry = (entries, usedKeys, now) => {
  const available = getAvailableEntries(entries, usedKeys);
  if (!available.length) return null;
  const nowTs = now.getTime();

  const byHeavinessSort = (a, b) => {
    if (a.signal.score !== b.signal.score) return b.signal.score - a.signal.score;

    const aOverdue =
      Number.isFinite(a.scheduledTimestamp) && a.scheduledTimestamp < nowTs ? 1 : 0;
    const bOverdue =
      Number.isFinite(b.scheduledTimestamp) && b.scheduledTimestamp < nowTs ? 1 : 0;
    if (aOverdue !== bOverdue) return bOverdue - aOverdue;

    const aSnoozeReschedule =
      getEffectiveSnoozeCount(a.task) + Number(a.task?.rescheduleCount || 0);
    const bSnoozeReschedule =
      getEffectiveSnoozeCount(b.task) + Number(b.task?.rescheduleCount || 0);
    if (aSnoozeReschedule !== bSnoozeReschedule) {
      return bSnoozeReschedule - aSnoozeReschedule;
    }

    return sortByStableId(a, b);
  };

  const heavyLevel = available
    .filter(
      (entry) => isTaskFeelingHeavy(entry.task) || entry.signal.level === "heavy"
    )
    .sort(byHeavinessSort);
  if (heavyLevel.length) return heavyLevel[0];

  const highestScore = [...available].sort(byHeavinessSort);
  if (highestScore.length && highestScore[0].signal.score > 0) {
    return highestScore[0];
  }

  const overdue = available
    .filter(
      (entry) =>
        Number.isFinite(entry.scheduledTimestamp) && entry.scheduledTimestamp < nowTs
    )
    .sort(byHeavinessSort);
  if (overdue.length) return overdue[0];

  const highSnoozeReschedule = [...available]
    .filter(
      (entry) =>
        getEffectiveSnoozeCount(entry.task) > 0 ||
        Number(entry.task?.rescheduleCount || 0) > 0
    )
    .sort(byHeavinessSort);
  if (highSnoozeReschedule.length) return highSnoozeReschedule[0];

  return null;
};

const toSuggestion = (entry, type) => {
  if (!entry?.task) return null;
  return {
    type,
    label: OVERWHELM_LABELS[type] || "Suggestion",
    task: entry.task,
    reason: OVERWHELM_REASONS[type] || "Pick one small step.",
  };
};

export const getOverwhelmSuggestions = (tasks, now = new Date()) => {
  const entries = toPendingEntries(tasks, now);
  if (!entries.length) return [];

  const usedKeys = new Set();
  const suggestions = [];

  const addSuggestion = (entry, type) => {
    const key = toIdKey(entry?.task);
    if (!key || usedKeys.has(key)) return;
    const suggestion = toSuggestion(entry, type);
    if (!suggestion) return;
    suggestions.push(suggestion);
    usedKeys.add(key);
  };

  addSuggestion(
    pickQuickWinEntry(entries, usedKeys, now),
    OVERWHELM_SUGGESTION_TYPES.QUICK_WIN
  );
  addSuggestion(
    pickImportantEntry(entries, usedKeys, now),
    OVERWHELM_SUGGESTION_TYPES.IMPORTANT
  );
  addSuggestion(
    pickHeavyEntry(entries, usedKeys, now),
    OVERWHELM_SUGGESTION_TYPES.FEELING_HEAVY
  );

  return suggestions.slice(0, 3);
};
