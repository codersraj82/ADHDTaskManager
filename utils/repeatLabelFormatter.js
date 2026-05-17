import { parseStoredDateTime } from "./formatDateTime";
import {
  MONTHLY_REPEAT_TYPES,
  REPEAT_TYPES,
  normalizeMonthlyType,
  normalizeRepeatType,
  parseRepeatDays,
} from "./repeatTaskHelpers";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const toOrdinal = (day) => {
  const value = Number(day);
  if (!Number.isFinite(value) || value < 1 || value > 31) return "";
  const rounded = Math.floor(value);

  if (rounded % 100 >= 11 && rounded % 100 <= 13) {
    return `${rounded}th`;
  }

  switch (rounded % 10) {
    case 1:
      return `${rounded}st`;
    case 2:
      return `${rounded}nd`;
    case 3:
      return `${rounded}rd`;
    default:
      return `${rounded}th`;
  }
};

const getFirstValidDate = (...values) => {
  for (const value of values) {
    const parsed = parseStoredDateTime(value);
    if (parsed) return parsed;
  }
  return null;
};

export const formatRepeatLabel = (task) => {
  const repeatType = normalizeRepeatType(task?.repeatType);
  if (repeatType === REPEAT_TYPES.NONE) return "";

  if (repeatType === REPEAT_TYPES.DAILY) {
    return "Daily";
  }

  if (repeatType === REPEAT_TYPES.WEEKLY) {
    const weekdays = parseRepeatDays(task?.repeatDays)
      .map((day) => WEEKDAY_SHORT[day])
      .filter(Boolean);

    return weekdays.length ? `Every ${weekdays.join(", ")}` : "Weekly";
  }

  if (repeatType === REPEAT_TYPES.MONTHLY) {
    const monthlyType = normalizeMonthlyType(task?.repeatMonthlyType);

    if (monthlyType === MONTHLY_REPEAT_TYPES.FIRST) {
      return "Monthly - 1st day";
    }

    if (monthlyType === MONTHLY_REPEAT_TYPES.LAST) {
      return "Monthly - Last day";
    }

    const customDate = getFirstValidDate(
      task?.repeatCustomDate,
      task?.scheduledTime
    );
    if (!customDate) return "Monthly";

    const dayLabel = toOrdinal(customDate.getDate());
    return dayLabel ? `Monthly - ${dayLabel}` : "Monthly";
  }

  if (repeatType === REPEAT_TYPES.YEARLY) {
    const yearlyDate = getFirstValidDate(
      task?.repeatYearlyDate,
      task?.scheduledTime
    );
    if (!yearlyDate) return "Every year";

    return `Every year - ${yearlyDate.getDate()} ${
      MONTH_SHORT[yearlyDate.getMonth()]
    }`;
  }

  return "Custom Repeat";
};
