import { parseStoredDateTime } from "./formatDateTime";

const toStartOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const toEndOfDay = (date) => toStartOfDay(date) + 24 * 60 * 60 * 1000 - 1;

const toTimestamp = (value) => {
  const parsed = parseStoredDateTime(value);
  if (!parsed) return null;
  return parsed.getTime();
};

const isTimestampInToday = (timestamp, nowTime) => {
  if (timestamp === null) return false;
  const startOfToday = toStartOfDay(new Date(nowTime));
  const endOfToday = toEndOfDay(new Date(nowTime));
  return timestamp >= startOfToday && timestamp <= endOfToday;
};

const getCompletedTimestamp = (task) => toTimestamp(task.completedAt);

const wasCompletedToday = (task, nowTime) => {
  const completedTimestamp = getCompletedTimestamp(task);
  return isTimestampInToday(completedTimestamp, nowTime);
};

const getTaskId = (task) => task.id ?? 0;

const isEarlyRecurringPreviewTask = (task) =>
  task?.isEarlyRecurringPreview === true ||
  task?.displayMode === "earlyRecurringPreview";

const compareAscendingByScheduledTime = (a, b) => {
  const aTime = a.scheduledTime ?? Number.POSITIVE_INFINITY;
  const bTime = b.scheduledTime ?? Number.POSITIVE_INFINITY;
  if (aTime !== bTime) return aTime - bTime;
  return getTaskId(a.task) - getTaskId(b.task);
};

const compareEarlyPreviewTasks = (a, b) => {
  const aTime = a.scheduledTime ?? Number.POSITIVE_INFINITY;
  const bTime = b.scheduledTime ?? Number.POSITIVE_INFINITY;
  if (aTime !== bTime) return aTime - bTime;

  const titleCompare = String(a.task?.title || "").localeCompare(
    String(b.task?.title || "")
  );
  if (titleCompare !== 0) return titleCompare;

  const aCreatedTime = toTimestamp(a.task?.createdAt) ?? Number.POSITIVE_INFINITY;
  const bCreatedTime = toTimestamp(b.task?.createdAt) ?? Number.POSITIVE_INFINITY;
  if (aCreatedTime !== bCreatedTime) return aCreatedTime - bCreatedTime;

  return getTaskId(a.task) - getTaskId(b.task);
};

const comparePastPendingTasks = (a, b) => {
  const aTime = a.scheduledTime ?? Number.NEGATIVE_INFINITY;
  const bTime = b.scheduledTime ?? Number.NEGATIVE_INFINITY;
  if (aTime !== bTime) return bTime - aTime;
  return getTaskId(a.task) - getTaskId(b.task);
};

const compareCompletedTasks = (a, b) => {
  const aTime = a.completedTime ?? a.scheduledTime ?? Number.POSITIVE_INFINITY;
  const bTime = b.completedTime ?? b.scheduledTime ?? Number.POSITIVE_INFINITY;
  if (aTime !== bTime) return aTime - bTime;
  return getTaskId(a.task) - getTaskId(b.task);
};

const mapTaskEntries = (tasks) =>
  tasks.map((task) => ({
    task,
    scheduledTime: toTimestamp(task.scheduledTime),
    completedTime: getCompletedTimestamp(task),
  }));

const sortPendingTaskEntries = (entries, nowTime) => {
  const nowDate = new Date(nowTime);
  const startOfToday = toStartOfDay(nowDate);
  const endOfToday = toEndOfDay(nowDate);

  const todayPending = [];
  const futurePending = [];
  const pastPending = [];

  entries.forEach((entry) => {
    const { scheduledTime } = entry;
    if (scheduledTime === null) {
      futurePending.push(entry);
      return;
    }

    if (scheduledTime >= startOfToday && scheduledTime <= endOfToday) {
      todayPending.push(entry);
      return;
    }

    if (scheduledTime > endOfToday) {
      futurePending.push(entry);
      return;
    }

    pastPending.push(entry);
  });

  todayPending.sort(compareAscendingByScheduledTime);
  futurePending.sort(compareAscendingByScheduledTime);
  pastPending.sort(comparePastPendingTasks);

  return [...todayPending, ...futurePending, ...pastPending].map(
    (entry) => entry.task
  );
};

export const sortSectionTasks = (tasks, section, now = new Date()) => {
  const nowTime = now.getTime();
  const sectionEntries = mapTaskEntries(
    tasks.filter((task) => task.section === section && !task.isPinned)
  );

  const pendingEntries = [];
  const earlyPreviewEntries = [];
  const completedTodayEntries = [];

  sectionEntries.forEach((entry) => {
    if (isEarlyRecurringPreviewTask(entry.task)) {
      earlyPreviewEntries.push(entry);
      return;
    }

    if (!entry.task.completed) {
      pendingEntries.push(entry);
      return;
    }

    if (wasCompletedToday(entry.task, nowTime)) {
      completedTodayEntries.push(entry);
    }
  });

  const sortedPendingTasks = sortPendingTaskEntries(pendingEntries, nowTime);
  const sortedCompletedTasks = completedTodayEntries
    .sort(compareCompletedTasks)
    .map((entry) => entry.task);
  const sortedEarlyPreviewTasks = earlyPreviewEntries
    .sort(compareEarlyPreviewTasks)
    .map((entry) => entry.task);

  return [...sortedPendingTasks, ...sortedCompletedTasks, ...sortedEarlyPreviewTasks];
};

export const sortTasksForSection = sortSectionTasks;

export const getPendingTaskCount = (tasks, section) =>
  tasks.reduce((count, task) => {
    if (
      task.section !== section ||
      task.completed ||
      task.isPinned ||
      isEarlyRecurringPreviewTask(task)
    ) {
      return count;
    }
    return count + 1;
  }, 0);

export const sortPinnedTasks = (tasks, now = new Date()) => {
  const pinnedEntries = mapTaskEntries(
    tasks.filter(
      (task) =>
        task.isPinned && !task.completed && !isEarlyRecurringPreviewTask(task)
    )
  );
  const earlyPreviewEntries = mapTaskEntries(
    tasks.filter(
      (task) =>
        task.isPinned && !task.completed && isEarlyRecurringPreviewTask(task)
    )
  );
  return [
    ...sortPendingTaskEntries(pinnedEntries, now.getTime()),
    ...earlyPreviewEntries.sort(compareEarlyPreviewTasks).map((entry) => entry.task),
  ];
};
