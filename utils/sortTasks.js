import { parseStoredDateTime } from "./formatDateTime";

const toStartOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const toEndOfDay = (date) => toStartOfDay(date) + 24 * 60 * 60 * 1000 - 1;

const toTimestamp = (value) => {
  const parsed = parseStoredDateTime(value);
  if (!parsed) return null;
  return parsed.getTime();
};

const isScheduledForToday = (task, nowTime) => {
  const timestamp = toTimestamp(task.scheduledTime);
  if (timestamp === null) return true;

  const startOfToday = toStartOfDay(new Date(nowTime));
  const endOfToday = toEndOfDay(new Date(nowTime));
  return timestamp >= startOfToday && timestamp <= endOfToday;
};

const getPendingPriority = (task, nowTime) => {
  const timestamp = toTimestamp(task.scheduledTime);
  if (timestamp === null) return 2; // Unscheduled tasks come after scheduled ones.
  if (timestamp >= nowTime) return 0; // Upcoming and future tasks first.
  return 1; // Overdue tasks after future tasks.
};

const comparePendingTasks = (a, b, nowTime) => {
  const aPriority = getPendingPriority(a, nowTime);
  const bPriority = getPendingPriority(b, nowTime);
  if (aPriority !== bPriority) return aPriority - bPriority;

  const aTime = toTimestamp(a.scheduledTime) ?? Number.POSITIVE_INFINITY;
  const bTime = toTimestamp(b.scheduledTime) ?? Number.POSITIVE_INFINITY;
  if (aTime !== bTime) return aTime - bTime;

  return (a.id ?? 0) - (b.id ?? 0);
};

const compareCompletedTasks = (a, b) => {
  const aTime = toTimestamp(a.scheduledTime) ?? Number.POSITIVE_INFINITY;
  const bTime = toTimestamp(b.scheduledTime) ?? Number.POSITIVE_INFINITY;
  if (aTime !== bTime) return aTime - bTime;

  return (a.id ?? 0) - (b.id ?? 0);
};

export const sortTasksForSection = (tasks, section, now = new Date()) => {
  const nowTime = now.getTime();
  const sectionTasks = tasks.filter((task) => task.section === section);

  const pendingTasks = [];
  const completedTodayTasks = [];

  sectionTasks.forEach((task) => {
    if (!task.completed) {
      pendingTasks.push(task);
      return;
    }

    if (isScheduledForToday(task, nowTime)) {
      completedTodayTasks.push(task);
    }
  });

  pendingTasks.sort((a, b) => comparePendingTasks(a, b, nowTime));
  completedTodayTasks.sort(compareCompletedTasks);

  return [...pendingTasks, ...completedTodayTasks];
};

export const getPendingTaskCount = (tasks, section) =>
  tasks.reduce((count, task) => {
    if (task.section !== section || task.completed) return count;
    return count + 1;
  }, 0);

