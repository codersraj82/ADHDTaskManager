import { parseStoredDateTime } from "./formatDateTime";

export const SECTION_ORDER = ["Morning", "Work", "Evening"];

const toTimestamp = (value) => {
  const parsed = parseStoredDateTime(value);
  if (!parsed) return null;
  return parsed.getTime();
};

const compareByTimeThenId = (a, b) => {
  const aTime = toTimestamp(a.scheduledTime) ?? Number.POSITIVE_INFINITY;
  const bTime = toTimestamp(b.scheduledTime) ?? Number.POSITIVE_INFINITY;

  if (aTime !== bTime) return aTime - bTime;
  return (a.id ?? 0) - (b.id ?? 0);
};

export const getNearestUpcomingSection = (tasks, now = new Date()) => {
  const nowTime = now.getTime();
  const pendingTasks = tasks.filter((task) => !task.completed);

  if (!pendingTasks.length) return null;

  const futureTasks = pendingTasks
    .filter((task) => {
      const timestamp = toTimestamp(task.scheduledTime);
      return timestamp !== null && timestamp >= nowTime;
    })
    .sort(compareByTimeThenId);

  if (futureTasks.length) {
    return futureTasks[0].section;
  }

  const fallback = [...pendingTasks].sort(compareByTimeThenId)[0];
  return fallback?.section ?? null;
};

