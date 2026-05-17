import { parseStoredDateTime } from "./formatDateTime";

export const REPEAT_TYPES = {
  NONE: "none",
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  YEARLY: "yearly",
};

export const MONTHLY_REPEAT_TYPES = {
  FIRST: "first",
  LAST: "last",
  CUSTOM: "custom",
};

export const WEEKDAY_OPTIONS = [
  { key: 0, label: "Sun" },
  { key: 1, label: "Mon" },
  { key: 2, label: "Tue" },
  { key: 3, label: "Wed" },
  { key: 4, label: "Thu" },
  { key: 5, label: "Fri" },
  { key: 6, label: "Sat" },
];

export const normalizeRepeatType = (value) => {
  if (!value) return REPEAT_TYPES.NONE;
  const next = String(value).toLowerCase();
  return Object.values(REPEAT_TYPES).includes(next)
    ? next
    : REPEAT_TYPES.NONE;
};

export const normalizeMonthlyType = (value) => {
  if (!value) return MONTHLY_REPEAT_TYPES.FIRST;
  const next = String(value).toLowerCase();
  return Object.values(MONTHLY_REPEAT_TYPES).includes(next)
    ? next
    : MONTHLY_REPEAT_TYPES.FIRST;
};

export const parseRepeatDays = (value) => {
  if (!value) return [];
  const source = Array.isArray(value)
    ? value
    : (() => {
        try {
          return JSON.parse(value);
        } catch (error) {
          return [];
        }
      })();

  if (!Array.isArray(source)) return [];

  return [...new Set(source.map((day) => Number(day)).filter((day) => day >= 0 && day <= 6))].sort(
    (a, b) => a - b
  );
};

export const serializeRepeatDays = (days) =>
  JSON.stringify(parseRepeatDays(days));

export const isRepeatingTask = (task) =>
  normalizeRepeatType(task?.repeatType) !== REPEAT_TYPES.NONE;

export const createRepeatGroupId = () =>
  `repeat_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;

export const getDateFromValue = (value) => parseStoredDateTime(value);

export const getDayOfMonth = (value, fallback = 1) => {
  const parsed = parseStoredDateTime(value);
  if (parsed) return parsed.getDate();

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 31) {
    return Math.floor(numeric);
  }
  return fallback;
};

export const getMonthAndDay = (value, fallbackDate = new Date()) => {
  const parsed = parseStoredDateTime(value);
  if (parsed) {
    return {
      month: parsed.getMonth(),
      day: parsed.getDate(),
    };
  }

  return {
    month: fallbackDate.getMonth(),
    day: fallbackDate.getDate(),
  };
};

export const normalizeTaskRepeatSettings = (task) => ({
  repeatType: normalizeRepeatType(task?.repeatType),
  repeatDays: parseRepeatDays(task?.repeatDays),
  repeatMonthlyType: normalizeMonthlyType(task?.repeatMonthlyType),
  repeatCustomDate: task?.repeatCustomDate || "",
  repeatYearlyDate: task?.repeatYearlyDate || "",
  repeatGroupId: task?.repeatGroupId || "",
});
