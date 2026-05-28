import { parseStoredDateTime } from "./formatDateTime";
import { getTaskAvoidanceSignal, isTaskFeelingHeavy } from "./taskSupportSignals";

export const ENERGY_TASK_FILTERS = Object.freeze([
  { key: "lowEnergy", label: "Low energy" },
  { key: "quickWin", label: "Quick win" },
  { key: "bestNow", label: "Best now" },
  { key: "important", label: "Important" },
  { key: "needsFocus", label: "Needs focus" },
  { key: "canDoAnywhere", label: "Can do anywhere" },
  { key: "feelingHeavy", label: "Feeling heavy" },
  { key: "todayOnly", label: "Today only" },
]);

export const ENERGY_FILTER_EMPTY_MESSAGES = Object.freeze({
  lowEnergy: "No low-energy tasks found. You can make one task smaller.",
  quickWin: "No quick wins right now. Try adding a first small action.",
  bestNow: "No best-now matches yet. Choose what fits your capacity.",
  important: "No important tasks waiting.",
  needsFocus: "No deep-focus tasks right now.",
  canDoAnywhere: "No anywhere tasks yet.",
  feelingHeavy: "No heavy tasks detected. That is okay.",
  todayOnly: "No tasks scheduled for today.",
});

const SHORT_DURATION_LIMIT = 10;
const LOW_ENERGY_DURATION_LIMIT = 5;
const NEEDS_FOCUS_DURATION_MIN = 25;
const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const hasText = (value) => typeof value === "string" && value.trim().length > 0;

const normalize = (value) => String(value || "").trim().toLowerCase();

const isFlagEnabled = (value) => value === true || value === 1;

const isDeletedOrArchived = (task) =>
  isFlagEnabled(task?.deleted) ||
  isFlagEnabled(task?.isDeleted) ||
  isFlagEnabled(task?.archived) ||
  isFlagEnabled(task?.isArchived);

const toTaskTimestamp = (value) => {
  const parsed = parseStoredDateTime(value);
  if (!parsed) return null;
  const timestamp = parsed.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const getDayBounds = (now = new Date()) => {
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const end = start + 24 * 60 * 60 * 1000 - 1;
  return { start, end };
};

const hasFirstAction = (task) => hasText(task?.firstAction);

const hasMinimumVersion = (task) => hasText(task?.minimumVersion);

const isHighPriority = (task) => normalize(task?.priority) === "high";

const getMoodBucket = (moodType) => {
  const normalized = normalize(moodType);
  if (normalized === "frustrated" || normalized === "sad") return "low";
  if (normalized === "happy" || normalized === "very_happy") return "high";
  return "neutral";
};

const getEstimatedMinutes = (task) => {
  const rawValue = task?.estimatedMinutes ?? task?.estimateMinutes;
  if (rawValue === undefined || rawValue === null || rawValue === "") return null;
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
};

const getEnergyRequired = (task) => {
  const normalized = normalize(task?.energyRequired || task?.energy);
  if (!normalized) return "";
  if (normalized === "high_energy" || normalized === "high-energy") return "high";
  if (normalized === "very_high" || normalized === "very-high") return "high";
  if (normalized === "low_energy" || normalized === "low-energy") return "low";
  return normalized;
};

const getFocusRequired = (task) => normalize(task?.focusRequired || task?.focusNeed);

const getTaskContext = (task) => normalize(task?.taskContext || task?.context);

const getEffectiveSnoozeCount = (task) => {
  if (
    task?.reminderSnoozeCount !== undefined &&
    task?.reminderSnoozeCount !== null
  ) {
    return toNumber(task.reminderSnoozeCount);
  }
  return toNumber(task?.snoozeCount);
};

const getIncompleteSubtaskCountSafe = (task) => {
  const subtasks = Array.isArray(task?.subtasks) ? task.subtasks : [];
  return subtasks.reduce((count, subtask) => {
    if (!subtask || subtask.completed) return count;
    return count + 1;
  }, 0);
};

const getSupportSignal = (task, now, taskSupportSignalById = null) => {
  const taskId = task?.id;
  if (
    taskSupportSignalById &&
    taskId !== null &&
    taskId !== undefined &&
    taskSupportSignalById[taskId]
  ) {
    return taskSupportSignalById[taskId];
  }

  return getTaskAvoidanceSignal(task, now);
};

const getFallbackHeavinessScore = (task) =>
  getEffectiveSnoozeCount(task) +
  toNumber(task?.rescheduleCount) +
  toNumber(task?.reminderMoveGentlyCount);

const getPrimaryTaskTimestamp = (task) =>
  toTaskTimestamp(task?.scheduledTime) ?? toTaskTimestamp(task?.dueDate);

const getDueSoonRank = (task, now) => {
  const nowTs = now.getTime();
  const timestamp = getPrimaryTaskTimestamp(task);

  if (timestamp === null) return 4;
  if (timestamp < nowTs) return 0;
  if (isTodayTask(task, now)) return 1;
  if (timestamp <= nowTs + DUE_SOON_WINDOW_MS) return 2;
  return 3;
};

const hasDueSoonOrOverdue = (task, now) => getDueSoonRank(task, now) <= 2;

const isOverdueTask = (task, now) => getDueSoonRank(task, now) === 0;

const toStableTaskId = (task) => {
  const numeric = Number(task?.id);
  return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
};

const compareWithNullLast = (a, b) => {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
};

const toFilterEntry = (task, index, now, options = {}) => {
  const signal = getSupportSignal(task, now, options.taskSupportSignalById);
  const fallbackHeavinessScore = getFallbackHeavinessScore(task);
  const isHeavy =
    signal?.level === "heavy" ||
    (signal?.level ? false : isTaskFeelingHeavy(task)) ||
    fallbackHeavinessScore >= 3;

  return {
    task,
    index,
    id: toStableTaskId(task),
    estimatedMinutes: getEstimatedMinutes(task),
    incompleteSubtasks: getIncompleteSubtaskCountSafe(task),
    hasFirstAction: hasFirstAction(task),
    hasMinimumVersion: hasMinimumVersion(task),
    energyRequired: getEnergyRequired(task),
    focusRequired: getFocusRequired(task),
    taskContext: getTaskContext(task),
    isPinned: Boolean(task?.isPinned),
    isHighPriority: isHighPriority(task),
    isToday: isTodayTask(task, now),
    isOverdue: isOverdueTask(task, now),
    dueSoonRank: getDueSoonRank(task, now),
    primaryTimestamp: getPrimaryTaskTimestamp(task),
    supportSignal: signal,
    heavinessScore: Math.max(toNumber(signal?.score), fallbackHeavinessScore),
    isHeavy,
  };
};

export const isTaskPending = (task) =>
  Boolean(task && !task.completed && !isDeletedOrArchived(task));

export const getIncompleteSubtaskCount = (task) => getIncompleteSubtaskCountSafe(task);

export const isTodayTask = (task, now = new Date()) => {
  if (!task) return false;
  const { start, end } = getDayBounds(now);
  const scheduledTimestamp = toTaskTimestamp(task?.scheduledTime);
  const dueTimestamp = toTaskTimestamp(task?.dueDate);
  const createdTimestamp = toTaskTimestamp(task?.createdAt);

  const isScheduledForToday =
    scheduledTimestamp !== null &&
    scheduledTimestamp >= start &&
    scheduledTimestamp <= end;
  const isDueToday =
    dueTimestamp !== null && dueTimestamp >= start && dueTimestamp <= end;
  const isCreatedTodayWithoutSchedule =
    scheduledTimestamp === null &&
    createdTimestamp !== null &&
    createdTimestamp >= start &&
    createdTimestamp <= end;

  return isScheduledForToday || isDueToday || isCreatedTodayWithoutSchedule;
};

export const isLowEnergyTask = (task) => {
  if (!isTaskPending(task)) return false;
  const estimatedMinutes = getEstimatedMinutes(task);
  const energyRequired = getEnergyRequired(task);
  const focusRequired = getFocusRequired(task);

  return (
    energyRequired === "low" ||
    (estimatedMinutes !== null && estimatedMinutes <= LOW_ENERGY_DURATION_LIMIT) ||
    focusRequired === "light"
  );
};

export const isQuickWinTask = (
  task,
  now = new Date(),
  options = {}
) => {
  if (!isTaskPending(task)) return false;

  const entry = toFilterEntry(task, 0, now, options);
  const isLowEnergy =
    entry.energyRequired === "low" ||
    entry.focusRequired === "light";
  const isShort =
    entry.estimatedMinutes !== null &&
    entry.estimatedMinutes <= SHORT_DURATION_LIMIT;

  if (!isLowEnergy || !isShort) return false;
  if (entry.isHeavy) return false;

  return true;
};

const isBestNowEntry = (entry, moodType) => {
  if (!entry) return false;
  const moodBucket = getMoodBucket(moodType);
  const isLowEnergy =
    entry.energyRequired === "low" ||
    entry.focusRequired === "light" ||
    (entry.estimatedMinutes !== null &&
      entry.estimatedMinutes <= LOW_ENERGY_DURATION_LIMIT);
  const isShort =
    entry.estimatedMinutes !== null &&
    entry.estimatedMinutes <= SHORT_DURATION_LIMIT;
  const isNeedsFocus =
    entry.focusRequired === "deep" ||
    entry.energyRequired === "high" ||
    (entry.estimatedMinutes !== null &&
      entry.estimatedMinutes >= NEEDS_FOCUS_DURATION_MIN);
  const isImportantSignal =
    entry.isPinned || entry.isHighPriority || entry.isToday || entry.dueSoonRank <= 2;

  if (moodBucket === "low") {
    return isLowEnergy && isShort && !entry.isHeavy;
  }

  if (moodBucket === "high") {
    return (isNeedsFocus || isImportantSignal) && !entry.isHeavy;
  }

  return (isLowEnergy || isImportantSignal) && !entry.isHeavy;
};

export const isBestNowTask = (
  task,
  now = new Date(),
  options = {}
) => {
  if (!isTaskPending(task)) return false;
  const entry = toFilterEntry(task, 0, now, options);
  return isBestNowEntry(entry, options?.moodType);
};

export const isImportantTask = (task, now = new Date()) => {
  if (!isTaskPending(task)) return false;
  return (
    Boolean(task?.isPinned) ||
    isHighPriority(task) ||
    isTodayTask(task, now) ||
    isOverdueTask(task, now) ||
    hasDueSoonOrOverdue(task, now)
  );
};

export const isNeedsFocusTask = (task) => {
  if (!isTaskPending(task)) return false;
  const estimatedMinutes = getEstimatedMinutes(task);
  const energyRequired = getEnergyRequired(task);
  const focusRequired = getFocusRequired(task);

  return (
    focusRequired === "deep" ||
    energyRequired === "high" ||
    (estimatedMinutes !== null && estimatedMinutes >= NEEDS_FOCUS_DURATION_MIN)
  );
};

export const isCanDoAnywhereTask = (task) =>
  isTaskPending(task) && getTaskContext(task) === "anywhere";

export const isFeelingHeavyTask = (
  task,
  now = new Date(),
  options = {}
) => {
  if (!isTaskPending(task)) return false;
  const entry = toFilterEntry(task, 0, now, options);
  return entry.isHeavy;
};

export const doesTaskMatchEnergyFilter = (
  task,
  filter,
  now = new Date(),
  options = {}
) => {
  if (!filter) return isTaskPending(task);

  switch (filter) {
    case "lowEnergy":
      return isLowEnergyTask(task);
    case "quickWin":
      return isQuickWinTask(task, now, options);
    case "bestNow":
      return isBestNowTask(task, now, options);
    case "important":
      return isImportantTask(task, now);
    case "needsFocus":
      return isNeedsFocusTask(task);
    case "canDoAnywhere":
      return isCanDoAnywhereTask(task);
    case "feelingHeavy":
      return isFeelingHeavyTask(task, now, options);
    case "todayOnly":
      return isTaskPending(task) && isTodayTask(task, now);
    default:
      return isTaskPending(task);
  }
};

const compareByStableOrder = (a, b) => {
  if (a.id !== b.id) return a.id - b.id;
  return a.index - b.index;
};

const sortLowEnergy = (a, b) => {
  const durationCompare = compareWithNullLast(a.estimatedMinutes, b.estimatedMinutes);
  if (durationCompare !== 0) return durationCompare;

  if (a.energyRequired === "low" && b.energyRequired !== "low") return -1;
  if (a.energyRequired !== "low" && b.energyRequired === "low") return 1;

  if (a.focusRequired === "light" && b.focusRequired !== "light") return -1;
  if (a.focusRequired !== "light" && b.focusRequired === "light") return 1;

  if (a.dueSoonRank !== b.dueSoonRank) return a.dueSoonRank - b.dueSoonRank;
  return compareByStableOrder(a, b);
};

const sortQuickWin = (a, b) => {
  const durationCompare = compareWithNullLast(a.estimatedMinutes, b.estimatedMinutes);
  if (durationCompare !== 0) return durationCompare;

  if (a.incompleteSubtasks !== b.incompleteSubtasks) {
    return a.incompleteSubtasks - b.incompleteSubtasks;
  }

  if (a.hasFirstAction !== b.hasFirstAction) {
    return a.hasFirstAction ? -1 : 1;
  }

  if (a.hasMinimumVersion !== b.hasMinimumVersion) {
    return a.hasMinimumVersion ? -1 : 1;
  }

  if (a.dueSoonRank !== b.dueSoonRank) return a.dueSoonRank - b.dueSoonRank;
  return compareByStableOrder(a, b);
};

const getBestNowRank = (entry, moodType) => {
  const moodBucket = getMoodBucket(moodType);
  const isLowEnergy =
    entry.energyRequired === "low" ||
    entry.focusRequired === "light" ||
    (entry.estimatedMinutes !== null &&
      entry.estimatedMinutes <= LOW_ENERGY_DURATION_LIMIT);
  const isShort =
    entry.estimatedMinutes !== null &&
    entry.estimatedMinutes <= SHORT_DURATION_LIMIT;
  const isNeedsFocus =
    entry.focusRequired === "deep" ||
    entry.energyRequired === "high" ||
    (entry.estimatedMinutes !== null &&
      entry.estimatedMinutes >= NEEDS_FOCUS_DURATION_MIN);
  const isImportantSignal =
    entry.isPinned || entry.isHighPriority || entry.isToday || entry.dueSoonRank <= 2;

  if (moodBucket === "low") {
    if (isLowEnergy && isShort && !entry.isHeavy) return 0;
    if (isLowEnergy && !entry.isHeavy) return 1;
    if (!entry.isHeavy && isImportantSignal) return 2;
    return 3;
  }

  if (moodBucket === "high") {
    if (isNeedsFocus && !entry.isHeavy) return 0;
    if (isImportantSignal && !entry.isHeavy) return 1;
    if (!entry.isHeavy) return 2;
    return 3;
  }

  if ((isLowEnergy || isImportantSignal) && !entry.isHeavy) return 0;
  if (!entry.isHeavy && isShort) return 1;
  return 2;
};

const sortBestNow = (a, b, options = {}) => {
  const aRank = getBestNowRank(a, options?.moodType);
  const bRank = getBestNowRank(b, options?.moodType);
  if (aRank !== bRank) return aRank - bRank;

  if (a.dueSoonRank !== b.dueSoonRank) return a.dueSoonRank - b.dueSoonRank;

  const durationCompare = compareWithNullLast(a.estimatedMinutes, b.estimatedMinutes);
  if (durationCompare !== 0) return durationCompare;

  if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
  if (a.isHighPriority !== b.isHighPriority) return a.isHighPriority ? -1 : 1;
  return compareByStableOrder(a, b);
};

const sortImportant = (a, b) => {
  if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
  if (a.isHighPriority !== b.isHighPriority) return a.isHighPriority ? -1 : 1;

  const aDueNow = a.isOverdue || a.isToday;
  const bDueNow = b.isOverdue || b.isToday;
  if (aDueNow !== bDueNow) return aDueNow ? -1 : 1;

  if (a.dueSoonRank !== b.dueSoonRank) return a.dueSoonRank - b.dueSoonRank;
  return compareByStableOrder(a, b);
};

const sortNeedsFocus = (a, b) => {
  const aHighSignal = a.isPinned || a.isHighPriority;
  const bHighSignal = b.isPinned || b.isHighPriority;
  if (aHighSignal !== bHighSignal) return aHighSignal ? -1 : 1;

  if (a.dueSoonRank !== b.dueSoonRank) return a.dueSoonRank - b.dueSoonRank;

  if (a.focusRequired === "deep" && b.focusRequired !== "deep") return -1;
  if (a.focusRequired !== "deep" && b.focusRequired === "deep") return 1;

  const durationCompare = compareWithNullLast(b.estimatedMinutes, a.estimatedMinutes);
  if (durationCompare !== 0) return durationCompare;
  return compareByStableOrder(a, b);
};

const sortCanDoAnywhere = (a, b) => {
  if (a.isToday !== b.isToday) return a.isToday ? -1 : 1;

  const durationCompare = compareWithNullLast(a.estimatedMinutes, b.estimatedMinutes);
  if (durationCompare !== 0) return durationCompare;

  if (a.dueSoonRank !== b.dueSoonRank) return a.dueSoonRank - b.dueSoonRank;
  return compareByStableOrder(a, b);
};

const sortFeelingHeavy = (a, b) => {
  if (a.heavinessScore !== b.heavinessScore) {
    return b.heavinessScore - a.heavinessScore;
  }

  const aDueNow = a.isOverdue || a.isToday;
  const bDueNow = b.isOverdue || b.isToday;
  if (aDueNow !== bDueNow) return aDueNow ? -1 : 1;

  if (a.hasMinimumVersion !== b.hasMinimumVersion) {
    return a.hasMinimumVersion ? -1 : 1;
  }

  if (a.hasFirstAction !== b.hasFirstAction) {
    return a.hasFirstAction ? -1 : 1;
  }

  return compareByStableOrder(a, b);
};

const sortTodayOnly = (a, b) => {
  const aTime = a.primaryTimestamp;
  const bTime = b.primaryTimestamp;
  const timeCompare = compareWithNullLast(aTime, bTime);
  if (timeCompare !== 0) return timeCompare;

  if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
  if (a.isHighPriority !== b.isHighPriority) return a.isHighPriority ? -1 : 1;
  return compareByStableOrder(a, b);
};

const matchesEntryForFilter = (entry, filter, options = {}) => {
  if (!entry || !isTaskPending(entry.task)) return false;

  switch (filter) {
    case "lowEnergy":
      return (
        entry.energyRequired === "low" ||
        (entry.estimatedMinutes !== null &&
          entry.estimatedMinutes <= LOW_ENERGY_DURATION_LIMIT) ||
        entry.focusRequired === "light"
      );
    case "quickWin": {
      const isLowEnergy =
        entry.energyRequired === "low" ||
        entry.focusRequired === "light";
      const isShort =
        entry.estimatedMinutes !== null &&
        entry.estimatedMinutes <= SHORT_DURATION_LIMIT;
      if (!isLowEnergy || !isShort) return false;
      if (entry.isHeavy) return false;
      return true;
    }
    case "bestNow":
      return isBestNowEntry(entry, options?.moodType);
    case "important":
      return (
        entry.isPinned ||
        entry.isHighPriority ||
        entry.isToday ||
        entry.isOverdue ||
        entry.dueSoonRank <= 2
      );
    case "needsFocus":
      return (
        entry.focusRequired === "deep" ||
        entry.energyRequired === "high" ||
        (entry.estimatedMinutes !== null &&
          entry.estimatedMinutes >= NEEDS_FOCUS_DURATION_MIN)
      );
    case "canDoAnywhere":
      return entry.taskContext === "anywhere";
    case "feelingHeavy":
      return entry.isHeavy;
    case "todayOnly":
      return entry.isToday;
    default:
      return true;
  }
};

const sortEntriesForFilter = (entries, filter, options = {}) => {
  if (filter === "todayOnly" && options.keepInputOrderForTodayOnly) {
    return entries;
  }

  const sorted = [...entries];
  switch (filter) {
    case "lowEnergy":
      sorted.sort(sortLowEnergy);
      break;
    case "quickWin":
      sorted.sort(sortQuickWin);
      break;
    case "bestNow":
      sorted.sort((a, b) => sortBestNow(a, b, options));
      break;
    case "important":
      sorted.sort(sortImportant);
      break;
    case "needsFocus":
      sorted.sort(sortNeedsFocus);
      break;
    case "canDoAnywhere":
      sorted.sort(sortCanDoAnywhere);
      break;
    case "feelingHeavy":
      sorted.sort(sortFeelingHeavy);
      break;
    case "todayOnly":
      sorted.sort(sortTodayOnly);
      break;
    default:
      sorted.sort(compareByStableOrder);
      break;
  }
  return sorted;
};

export const filterTasksByEnergyFilter = (
  tasks,
  filter,
  now = new Date(),
  options = {}
) => {
  const safeTasks = Array.isArray(tasks) ? tasks.filter(Boolean) : [];
  if (!safeTasks.length) return [];

  const matchingEntries = safeTasks
    .map((task, index) => toFilterEntry(task, index, now, options))
    .filter((entry) => matchesEntryForFilter(entry, filter, options));

  const sortedEntries = sortEntriesForFilter(matchingEntries, filter, options);
  return sortedEntries.map((entry) => entry.task);
};
