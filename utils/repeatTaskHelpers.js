import { parseStoredDateTime } from "./formatDateTime.js";

export const REPEAT_TYPES = {
  NONE: "none",
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  YEARLY: "yearly",
  CUSTOM: "custom",
};

export const CUSTOM_REPEAT_UNITS = Object.freeze([
  "minutes",
  "hours",
  "days",
  "weeks",
  "months",
  "years",
]);

export const CUSTOM_REPEAT_UNIT_OPTIONS = Object.freeze([
  { label: "Minutes", value: "minutes" },
  { label: "Hours", value: "hours" },
  { label: "Days", value: "days" },
  { label: "Weeks", value: "weeks" },
  { label: "Months", value: "months" },
  { label: "Years", value: "years" },
]);

export const MAX_CUSTOM_REPEAT_INTERVAL = 100000;

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

export const normalizeCustomRepeatUnit = (value) => {
  const next = String(value || "").trim().toLowerCase();
  return CUSTOM_REPEAT_UNITS.includes(next) ? next : "";
};

export const normalizeCustomRepeatInterval = (value) => {
  const rawValue =
    typeof value === "number" ? String(value) : String(value || "").trim();
  if (!/^\d+$/.test(rawValue)) return 0;

  const interval = Number(rawValue);
  return Number.isSafeInteger(interval) &&
    interval > 0 &&
    interval <= MAX_CUSTOM_REPEAT_INTERVAL
    ? interval
    : 0;
};

export const validateCustomRepeat = (intervalValue, unitValue) => {
  const rawValue =
    typeof intervalValue === "number"
      ? String(intervalValue)
      : String(intervalValue || "").trim();

  if (!rawValue) {
    return {
      valid: false,
      message: "Enter a valid repeat interval.",
      interval: null,
      unit: normalizeCustomRepeatUnit(unitValue),
    };
  }

  if (!/^\d+$/.test(rawValue)) {
    return {
      valid: false,
      message: "Enter a whole number.",
      interval: null,
      unit: normalizeCustomRepeatUnit(unitValue),
    };
  }

  const interval = Number(rawValue);
  const unit = normalizeCustomRepeatUnit(unitValue);

  if (!Number.isSafeInteger(interval)) {
    return {
      valid: false,
      message: "Enter a valid repeat interval.",
      interval: null,
      unit,
    };
  }

  if (interval > MAX_CUSTOM_REPEAT_INTERVAL) {
    return {
      valid: false,
      message: "Enter a smaller repeat interval.",
      interval: null,
      unit,
    };
  }

  if (!unit) {
    return {
      valid: false,
      message: "Choose a repeat period.",
      interval,
      unit: "",
    };
  }

  if (unit === "minutes" && interval < 5) {
    return {
      valid: false,
      message: "Minimum custom repeat interval is 5 minutes.",
      interval,
      unit,
    };
  }

  if (unit !== "minutes" && interval < 2) {
    return {
      valid: false,
      message: `Minimum custom repeat interval is 2 ${unit}.`,
      interval,
      unit,
    };
  }

  return {
    valid: true,
    message: "",
    interval,
    unit,
  };
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

export const normalizeTaskRepeatSettings = (task) => {
  const repeatType = normalizeRepeatType(task?.repeatType);
  const isCustom = repeatType === REPEAT_TYPES.CUSTOM;

  return {
    repeatType,
    repeatDays: parseRepeatDays(task?.repeatDays),
    repeatMonthlyType: normalizeMonthlyType(task?.repeatMonthlyType),
    repeatCustomDate: task?.repeatCustomDate || "",
    repeatYearlyDate: task?.repeatYearlyDate || "",
    repeatInterval: isCustom
      ? normalizeCustomRepeatInterval(task?.repeatInterval)
      : 0,
    repeatUnit: isCustom ? normalizeCustomRepeatUnit(task?.repeatUnit) : "",
    repeatGroupId: task?.repeatGroupId || "",
  };
};
