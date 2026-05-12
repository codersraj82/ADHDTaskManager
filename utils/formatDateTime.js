const MONTH_INDEX = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

export const pad2 = (value) => String(value).padStart(2, "0");

export const isValidDate = (date) =>
  date instanceof Date && !Number.isNaN(date.getTime());

export const toTimeInputParts = (value) => {
  const date = parseStoredDateTime(value) || new Date();
  const period = date.getHours() >= 12 ? "PM" : "AM";
  const hour12 = date.getHours() % 12 || 12;

  return {
    hour: pad2(hour12),
    minute: pad2(date.getMinutes()),
    period,
  };
};

export const applyTimePartsToDate = (value, parts) => {
  const baseDate = parseStoredDateTime(value) || new Date();
  const nextDate = new Date(baseDate);

  let hour = Number(parts.hour);
  const minute = Number(parts.minute);

  if (!Number.isFinite(hour) || hour < 1) hour = 12;
  if (hour > 12) hour = 12;

  let hour24 = hour % 12;
  if (parts.period === "PM") hour24 += 12;

  nextDate.setHours(hour24, Number.isFinite(minute) ? minute : 0, 0, 0);
  return nextDate;
};

export const formatSqliteDateTime = (value) => {
  const date = parseStoredDateTime(value);
  if (!date) return "";

  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const { hour, minute, period } = toTimeInputParts(date);

  return `${year}-${month}-${day} ${hour}:${minute} ${period}`;
};

export const parseStoredDateTime = (value) => {
  if (!value) return null;
  if (isValidDate(value)) return new Date(value);

  const raw = String(value).trim().replace(/\s+/g, " ");
  if (!raw) return null;

  const sqliteMatch = raw.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?:\s*(AM|PM))?)?$/i
  );

  if (sqliteMatch) {
    const [, year, month, day, hourValue = "0", minuteValue = "0", period] =
      sqliteMatch;
    let hour = Number(hourValue);
    const minute = Number(minuteValue);
    const monthNumber = Number(month);
    const dayNumber = Number(day);

    if (monthNumber < 1 || monthNumber > 12) return null;
    if (dayNumber < 1 || dayNumber > 31) return null;
    if (minute < 0 || minute > 59) return null;
    if (period && (hour < 1 || hour > 12)) return null;
    if (!period && (hour < 0 || hour > 23)) return null;

    if (period) {
      const meridiem = period.toUpperCase();
      if (meridiem === "PM" && hour !== 12) hour += 12;
      if (meridiem === "AM" && hour === 12) hour = 0;
    }

    const date = new Date(
      Number(year),
      monthNumber - 1,
      dayNumber,
      hour,
      minute,
      0,
      0
    );

    if (
      !isValidDate(date) ||
      date.getFullYear() !== Number(year) ||
      date.getMonth() !== monthNumber - 1 ||
      date.getDate() !== dayNumber
    ) {
      return null;
    }

    return date;
  }

  const legacyMatch = raw.match(
    /^(\d{1,2})-([A-Z]{3})-(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i
  );

  if (legacyMatch) {
    const [, day, monthName, year, hourValue, minuteValue, period] = legacyMatch;
    const month = MONTH_INDEX[monthName.toUpperCase()];
    if (month === undefined) return null;

    let hour = Number(hourValue);
    const minute = Number(minuteValue);
    const dayNumber = Number(day);

    if (dayNumber < 1 || dayNumber > 31) return null;
    if (minute < 0 || minute > 59) return null;
    if (hour < 1 || hour > 12) return null;

    if (period.toUpperCase() === "PM" && hour !== 12) hour += 12;
    if (period.toUpperCase() === "AM" && hour === 12) hour = 0;

    const date = new Date(
      Number(year),
      month,
      dayNumber,
      hour,
      minute,
      0,
      0
    );

    if (
      !isValidDate(date) ||
      date.getFullYear() !== Number(year) ||
      date.getMonth() !== month ||
      date.getDate() !== dayNumber
    ) {
      return null;
    }

    return date;
  }

  const fallback = new Date(raw);
  return isValidDate(fallback) ? fallback : null;
};

export const formatDateTimeForDisplay = (value) => {
  const date = parseStoredDateTime(value);
  if (!date) return "";

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatDateForPickerLabel = (value) => {
  const date = parseStoredDateTime(value);
  if (!date) return "Select date";

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};
