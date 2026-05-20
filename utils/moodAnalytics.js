import {
  getMoodMeta,
  getMoodScore,
  getMoodTypeFromAverageScore,
  MOOD_OPTIONS,
} from "./moodHelpers";

const DAY_MS = 24 * 60 * 60 * 1000;

const toStartOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const toDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const createDistribution = () =>
  MOOD_OPTIONS.reduce((acc, mood) => {
    acc[mood.type] = 0;
    return acc;
  }, {});

export const buildMoodDistribution = (rows = []) => {
  const distribution = createDistribution();
  rows.forEach((row) => {
    if (!row?.moodType || !distribution[row.moodType] && distribution[row.moodType] !== 0) return;
    distribution[row.moodType] += 1;
  });
  return distribution;
};

export const buildMoodSummary = (rows = []) => {
  const distribution = buildMoodDistribution(rows);
  let scoreTotal = 0;
  let scoreCount = 0;

  rows.forEach((row) => {
    const score = getMoodScore(row?.moodType);
    if (score === null) return;
    scoreTotal += score;
    scoreCount += 1;
  });

  const averageScore = scoreCount ? scoreTotal / scoreCount : null;
  const averageMoodType = getMoodTypeFromAverageScore(averageScore);

  let mostFrequentMoodType = null;
  let mostFrequentCount = 0;
  Object.entries(distribution).forEach(([type, count]) => {
    if (count > mostFrequentCount) {
      mostFrequentMoodType = type;
      mostFrequentCount = count;
    }
  });

  return {
    totalEntries: rows.length,
    averageScore,
    averageMoodType,
    averageMoodMeta: getMoodMeta(averageMoodType),
    mostFrequentMoodType,
    mostFrequentMoodMeta: getMoodMeta(mostFrequentMoodType),
    distribution,
  };
};

export const getRowsForLastDays = (rows = [], days = 7, now = new Date()) => {
  const end = toStartOfDay(now).getTime() + DAY_MS - 1;
  const start = end - (days - 1) * DAY_MS;
  return rows.filter((row) => {
    const rowDate = toDate(row?.date || row?.createdAt);
    if (!rowDate) return false;
    const time = rowDate.getTime();
    return time >= start && time <= end;
  });
};

export const getRowsForCurrentMonth = (rows = [], now = new Date()) =>
  rows.filter((row) => {
    const rowDate = toDate(row?.date || row?.createdAt);
    if (!rowDate) return false;
    return (
      rowDate.getFullYear() === now.getFullYear() &&
      rowDate.getMonth() === now.getMonth()
    );
  });

export const getRowsForCurrentYear = (rows = [], now = new Date()) =>
  rows.filter((row) => {
    const rowDate = toDate(row?.date || row?.createdAt);
    if (!rowDate) return false;
    return rowDate.getFullYear() === now.getFullYear();
  });

export const buildMonthlyMoodCalendar = (rows = [], now = new Date()) => {
  const byDate = new Map();
  rows.forEach((row) => {
    if (!row?.date) return;
    byDate.set(row.date, row);
  });

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const result = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), day);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const row = byDate.get(key) || null;
    result.push({
      day,
      key,
      moodType: row?.moodType || null,
      moodMeta: getMoodMeta(row?.moodType),
    });
  }
  return result;
};

export const buildYearlyByMonth = (rows = [], now = new Date()) => {
  const bucket = Array.from({ length: 12 }, (_, month) => ({
    month,
    rows: [],
  }));

  rows.forEach((row) => {
    const rowDate = toDate(row?.date || row?.createdAt);
    if (!rowDate || rowDate.getFullYear() !== now.getFullYear()) return;
    bucket[rowDate.getMonth()].rows.push(row);
  });

  return bucket.map((item) => ({
    month: item.month,
    summary: buildMoodSummary(item.rows),
  }));
};

