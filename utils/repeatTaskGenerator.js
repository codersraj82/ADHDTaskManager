import { formatSqliteDateTime, parseStoredDateTime } from "./formatDateTime.js";
import {
  MONTHLY_REPEAT_TYPES,
  REPEAT_TYPES,
  getDayOfMonth,
  getMonthAndDay,
  normalizeMonthlyType,
  normalizeRepeatType,
  normalizeTaskRepeatSettings,
  parseRepeatDays,
  validateCustomRepeat,
} from "./repeatTaskHelpers.js";

const cloneDate = (date) =>
  new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds()
  );

const copyTime = (target, source) => {
  target.setHours(
    source.getHours(),
    source.getMinutes(),
    source.getSeconds(),
    source.getMilliseconds()
  );
  return target;
};

const daysInMonth = (year, monthIndex) =>
  new Date(year, monthIndex + 1, 0).getDate();

const clampDay = (year, monthIndex, day) =>
  Math.max(1, Math.min(day, daysInMonth(year, monthIndex)));

const getBaseDate = (task, now = new Date()) => {
  const parsed = parseStoredDateTime(task?.scheduledTime);
  return parsed ? cloneDate(parsed) : cloneDate(now);
};

const getNextDailyDate = (baseDate) => {
  const next = cloneDate(baseDate);
  next.setDate(next.getDate() + 1);
  return next;
};

const getNextWeeklyDate = (baseDate, repeatDays) => {
  const selectedDays = parseRepeatDays(repeatDays);
  const allowedDays = selectedDays.length ? selectedDays : [baseDate.getDay()];

  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = cloneDate(baseDate);
    candidate.setDate(candidate.getDate() + offset);
    if (allowedDays.includes(candidate.getDay())) {
      return candidate;
    }
  }

  const fallback = cloneDate(baseDate);
  fallback.setDate(fallback.getDate() + 7);
  return fallback;
};

const getNextMonthlyDate = (
  baseDate,
  repeatMonthlyType,
  repeatCustomDate,
  monthInterval = 1
) => {
  const monthlyType = normalizeMonthlyType(repeatMonthlyType);
  const safeInterval = Math.max(1, Math.floor(Number(monthInterval) || 1));
  const targetMonthStart = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth() + safeInterval,
    1
  );
  const targetYear = targetMonthStart.getFullYear();
  const targetMonth = targetMonthStart.getMonth();

  if (monthlyType === MONTHLY_REPEAT_TYPES.FIRST) {
    return copyTime(new Date(targetYear, targetMonth, 1), baseDate);
  }

  if (monthlyType === MONTHLY_REPEAT_TYPES.LAST) {
    const day = daysInMonth(targetYear, targetMonth);
    return copyTime(new Date(targetYear, targetMonth, day), baseDate);
  }

  const day = getDayOfMonth(repeatCustomDate, baseDate.getDate());
  const safeDay = clampDay(targetYear, targetMonth, day);
  return copyTime(new Date(targetYear, targetMonth, safeDay), baseDate);
};

const getNextYearlyDate = (
  baseDate,
  repeatYearlyDate,
  yearInterval = 1
) => {
  const year = baseDate.getFullYear();
  const { month, day } = getMonthAndDay(repeatYearlyDate, baseDate);
  const safeInterval = Math.max(1, Math.floor(Number(yearInterval) || 1));

  const candidateDay = clampDay(year, month, day);
  let candidate = copyTime(new Date(year, month, candidateDay), baseDate);

  if (candidate.getTime() <= baseDate.getTime()) {
    const nextYear = year + safeInterval;
    const nextDay = clampDay(nextYear, month, day);
    candidate = copyTime(new Date(nextYear, month, nextDay), baseDate);
  }

  return candidate;
};

const getNextCustomDate = (baseDate, interval, unit, task) => {
  const next = cloneDate(baseDate);

  switch (unit) {
    case "minutes":
      next.setMinutes(next.getMinutes() + interval);
      return next;
    case "hours":
      next.setHours(next.getHours() + interval);
      return next;
    case "days":
      next.setDate(next.getDate() + interval);
      return next;
    case "weeks":
      next.setDate(next.getDate() + interval * 7);
      return next;
    case "months":
      return getNextMonthlyDate(
        baseDate,
        MONTHLY_REPEAT_TYPES.CUSTOM,
        task?.repeatCustomDate || task?.scheduledTime || baseDate,
        interval
      );
    case "years":
      return getNextYearlyDate(
        baseDate,
        task?.repeatYearlyDate || task?.scheduledTime || baseDate,
        interval
      );
    default:
      return null;
  }
};

const isValidDate = (date) =>
  date instanceof Date && !Number.isNaN(date.getTime());

export const getNextRecurringDate = (task, now = new Date()) => {
  const repeatType = normalizeRepeatType(task?.repeatType);
  if (repeatType === REPEAT_TYPES.NONE) return null;

  const baseDate = getBaseDate(task, now);
  const customRepeat =
    repeatType === REPEAT_TYPES.CUSTOM
      ? validateCustomRepeat(task?.repeatInterval, task?.repeatUnit)
      : null;
  if (customRepeat && !customRepeat.valid) return null;

  const stepToNextDate = (fromDate) => {
    switch (repeatType) {
      case REPEAT_TYPES.DAILY:
        return getNextDailyDate(fromDate);
      case REPEAT_TYPES.WEEKLY:
        return getNextWeeklyDate(fromDate, task?.repeatDays);
      case REPEAT_TYPES.MONTHLY:
        return getNextMonthlyDate(
          fromDate,
          task?.repeatMonthlyType,
          task?.repeatCustomDate
        );
      case REPEAT_TYPES.YEARLY:
        return getNextYearlyDate(fromDate, task?.repeatYearlyDate);
      case REPEAT_TYPES.CUSTOM:
        return getNextCustomDate(
          fromDate,
          customRepeat.interval,
          customRepeat.unit,
          task
        );
      default:
        return null;
    }
  };

  // Ensure the generated occurrence is always in the future,
  // even when the current task was completed late.
  const nowTime = now.getTime();
  if (
    repeatType === REPEAT_TYPES.CUSTOM &&
    (customRepeat.unit === "minutes" || customRepeat.unit === "hours")
  ) {
    const unitMilliseconds =
      customRepeat.unit === "minutes" ? 60 * 1000 : 60 * 60 * 1000;
    const intervalMilliseconds = customRepeat.interval * unitMilliseconds;
    const elapsedMilliseconds = Math.max(0, nowTime - baseDate.getTime());
    const intervalsToAdvance = Math.floor(
      elapsedMilliseconds / intervalMilliseconds
    ) + 1;
    const candidate = new Date(
      baseDate.getTime() + intervalsToAdvance * intervalMilliseconds
    );
    return isValidDate(candidate) ? candidate : null;
  }

  let candidate = stepToNextDate(baseDate);
  let guard = 0;
  const maxIterations = 2000;

  while (
    isValidDate(candidate) &&
    candidate.getTime() <= nowTime &&
    guard < maxIterations
  ) {
    candidate = stepToNextDate(candidate);
    guard += 1;
  }

  if (repeatType === REPEAT_TYPES.CUSTOM) {
    return isValidDate(candidate) && candidate.getTime() > nowTime
      ? candidate
      : null;
  }

  return candidate;
};

export const buildNextRecurringTask = (task, now = new Date()) => {
  const nextDate = getNextRecurringDate(task, now);
  if (!nextDate) return null;

  const scheduledTime = formatSqliteDateTime(nextDate);
  const repeatSettings = normalizeTaskRepeatSettings(task);
  const sourceAnchor = formatSqliteDateTime(getBaseDate(task, now));
  const repeatCustomDate =
    repeatSettings.repeatType === REPEAT_TYPES.CUSTOM &&
    repeatSettings.repeatUnit === "months"
      ? repeatSettings.repeatCustomDate || sourceAnchor
      : repeatSettings.repeatCustomDate;
  const repeatYearlyDate =
    repeatSettings.repeatType === REPEAT_TYPES.CUSTOM &&
    repeatSettings.repeatUnit === "years"
      ? repeatSettings.repeatYearlyDate || sourceAnchor
      : repeatSettings.repeatYearlyDate;
  const subtasks = Array.isArray(task?.subtasks)
    ? task.subtasks.map((subtask) => ({
        ...subtask,
        completed: false,
      }))
    : [];

  return {
    ...task,
    completed: false,
    completedAt: null,
    isPinned: false,
    scheduledTime,
    repeatInterval: repeatSettings.repeatInterval,
    repeatUnit: repeatSettings.repeatUnit,
    repeatCustomDate,
    repeatYearlyDate,
    subtasks,
    notificationId: [],
  };
};

export const buildDailyRecurringTaskForDate = (task, targetDate = new Date()) => {
  const repeatType = normalizeRepeatType(task?.repeatType);
  if (repeatType !== REPEAT_TYPES.DAILY) return null;

  const baseDate = getBaseDate(task, targetDate);
  const parsedTargetDate = parseStoredDateTime(targetDate);
  if (!parsedTargetDate) return null;

  const occurrenceDate = copyTime(
    new Date(
      parsedTargetDate.getFullYear(),
      parsedTargetDate.getMonth(),
      parsedTargetDate.getDate()
    ),
    baseDate
  );
  const scheduledTime = formatSqliteDateTime(occurrenceDate);
  const subtasks = Array.isArray(task?.subtasks)
    ? task.subtasks.map((subtask) => ({
        ...subtask,
        completed: false,
      }))
    : [];

  return {
    ...task,
    completed: false,
    completedAt: null,
    isPinned: false,
    scheduledTime,
    subtasks,
    notificationId: [],
  };
};
