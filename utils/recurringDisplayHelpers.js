import { parseStoredDateTime } from "./formatDateTime";
import {
  REPEAT_TYPES,
  normalizeRepeatType,
} from "./repeatTaskHelpers";

export const EARLY_RECURRING_PREVIEW_MODE = "earlyRecurringPreview";
export const EARLY_RECURRING_PREVIEW_TAG = "Tomorrow";

const EARLY_PREVIEW_REPEAT_TYPES = new Set([
  REPEAT_TYPES.WEEKLY,
  REPEAT_TYPES.MONTHLY,
  REPEAT_TYPES.YEARLY,
]);

const isValidDate = (date) =>
  date instanceof Date && !Number.isNaN(date.getTime());

const parseLocalDateKey = (value = "") => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, monthIndex, day, 0, 0, 0, 0);

  if (
    !isValidDate(parsed) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== monthIndex ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
};

const coerceDate = (value = new Date()) => {
  if (isValidDate(value)) return new Date(value);
  if (typeof value === "string") {
    return parseLocalDateKey(value) || parseStoredDateTime(value);
  }
  return parseStoredDateTime(value);
};

export const toLocalDateKey = (value = new Date()) => {
  const date = coerceDate(value);
  if (!isValidDate(date)) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const addDaysLocal = (value = new Date(), days = 0) => {
  const date = coerceDate(value);
  if (!isValidDate(date)) return "";

  const next = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds()
  );
  next.setDate(next.getDate() + Number(days || 0));
  return toLocalDateKey(next);
};

export const getRecurringTaskDisplayInfo = (task, viewDate = new Date()) => {
  const repeatType = normalizeRepeatType(task?.repeatType);

  if (repeatType === REPEAT_TYPES.NONE) {
    return {
      shouldShow: true,
      isScheduledToday: false,
      isEarlyRecurringPreview: false,
      occurrenceDate: null,
    };
  }

  const viewDateKey = toLocalDateKey(viewDate);
  const tomorrowDateKey = addDaysLocal(viewDateKey, 1);
  const occurrenceDateKey = toLocalDateKey(task?.scheduledTime);

  if (!viewDateKey || !occurrenceDateKey) {
    return {
      shouldShow: true,
      isScheduledToday: false,
      isEarlyRecurringPreview: false,
      occurrenceDate: occurrenceDateKey || null,
    };
  }

  if (occurrenceDateKey < viewDateKey) {
    return {
      shouldShow: true,
      isScheduledToday: false,
      isEarlyRecurringPreview: false,
      occurrenceDate: occurrenceDateKey,
    };
  }

  if (occurrenceDateKey === viewDateKey) {
    return {
      shouldShow: true,
      isScheduledToday: true,
      isEarlyRecurringPreview: false,
      occurrenceDate: occurrenceDateKey,
    };
  }

  if (task?.completed) {
    return {
      shouldShow: false,
      isScheduledToday: false,
      isEarlyRecurringPreview: false,
      occurrenceDate: occurrenceDateKey,
    };
  }

  const canShowEarlyPreview = EARLY_PREVIEW_REPEAT_TYPES.has(repeatType);
  const isEarlyRecurringPreview =
    canShowEarlyPreview && occurrenceDateKey === tomorrowDateKey;

  return {
    shouldShow: isEarlyRecurringPreview,
    isScheduledToday: false,
    isEarlyRecurringPreview,
    occurrenceDate: occurrenceDateKey,
    earlyTag: isEarlyRecurringPreview ? EARLY_RECURRING_PREVIEW_TAG : undefined,
  };
};

export const buildRecurringDisplayTasksForDate = (
  tasks = [],
  viewDate = new Date()
) => {
  if (!Array.isArray(tasks)) return [];

  return tasks.reduce((displayTasks, task) => {
    if (!task) return displayTasks;

    const repeatType = normalizeRepeatType(task.repeatType);
    if (repeatType === REPEAT_TYPES.NONE) {
      displayTasks.push(task);
      return displayTasks;
    }

    const displayInfo = getRecurringTaskDisplayInfo(task, viewDate);
    if (!displayInfo.shouldShow) return displayTasks;

    if (!displayInfo.isEarlyRecurringPreview) {
      displayTasks.push(task);
      return displayTasks;
    }

    displayTasks.push({
      ...task,
      displayKey: `${task.id}-early-${displayInfo.occurrenceDate}`,
      displayMode: EARLY_RECURRING_PREVIEW_MODE,
      occurrenceDate: displayInfo.occurrenceDate,
      isEarlyRecurringPreview: true,
      earlyPreviewForDate: displayInfo.occurrenceDate,
      earlyTag: displayInfo.earlyTag || EARLY_RECURRING_PREVIEW_TAG,
    });

    return displayTasks;
  }, []);
};
