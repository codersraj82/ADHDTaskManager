import { parseStoredDateTime } from "./formatDateTime";
import { SECTION_ORDER } from "./sectionHelpers";

const isBooleanFlagEnabled = (value) => value === true || value === 1;

const isDeletedOrArchived = (task) =>
  isBooleanFlagEnabled(task?.deleted) ||
  isBooleanFlagEnabled(task?.isDeleted) ||
  isBooleanFlagEnabled(task?.archived) ||
  isBooleanFlagEnabled(task?.isArchived);

const toTimestamp = (value) => {
  const parsed = parseStoredDateTime(value);
  if (!parsed) return null;
  return parsed.getTime();
};

const compareByTimeThenId = (a, b) => {
  if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
  return (a.task?.id || 0) - (b.task?.id || 0);
};

const toNumericTaskId = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeSectionName = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed === "Pinned") return "Pinned";
  return SECTION_ORDER.includes(trimmed) ? trimmed : null;
};

export const extractTaskNavigationPayload = (data = {}) => {
  if (!data || typeof data !== "object") return null;

  const taskId = toNumericTaskId(
    data.taskId ?? data.taskID ?? data.id ?? data.task_id
  );
  if (!taskId) return null;

  const sectionId = normalizeSectionName(
    data.sectionId ?? data.section ?? data.category ?? data.sectionName
  );
  const taskTitleRaw = data.taskTitle ?? data.title;
  const taskTitle =
    typeof taskTitleRaw === "string" && taskTitleRaw.trim()
      ? taskTitleRaw.trim()
      : null;

  return {
    taskId,
    sectionId,
    taskTitle,
  };
};

export const buildTaskReminderPayload = ({ task, type, minutesBefore = 0 }) => {
  const taskId = toNumericTaskId(task?.id ?? task?.taskId);
  const sectionName = normalizeSectionName(
    task?.isPinned ? "Pinned" : task?.section ?? task?.sectionId
  );
  const taskTitle =
    typeof task?.title === "string" && task.title.trim()
      ? task.title.trim()
      : "Task";
  const reminderOffsetMinutes = Number(minutesBefore) || 0;
  const scheduledFor = task?.scheduledTime || "";
  const scheduledTaskDate = parseStoredDateTime(scheduledFor);
  const scheduledAt =
    scheduledTaskDate &&
    !Number.isNaN(scheduledTaskDate.getTime() - reminderOffsetMinutes * 60000)
      ? new Date(
          scheduledTaskDate.getTime() - reminderOffsetMinutes * 60000
        ).toISOString()
      : "";

  return {
    type,
    taskId,
    sectionId: sectionName,
    category: sectionName,
    taskTitle,
    minutesBefore,
    reminderOffsetMinutes,
    scheduledFor,
    scheduledAt,
  };
};

export const findBestCurrentTask = (
  tasks = [],
  { activeTaskId = null, now = new Date() } = {}
) => {
  if (!Array.isArray(tasks) || !tasks.length) return null;

  const actionableTasks = tasks.filter(
    (task) => task && !task.completed && !isDeletedOrArchived(task)
  );
  if (!actionableTasks.length) return null;

  if (activeTaskId !== null && activeTaskId !== undefined) {
    const activeTask = actionableTasks.find((task) => task.id === activeTaskId);
    if (activeTask) {
      return {
        task: activeTask,
        reason: "active-task",
        taskId: activeTask.id,
        sectionId: activeTask.isPinned ? "Pinned" : activeTask.section || null,
        scheduledTime: activeTask.scheduledTime || "",
      };
    }
  }

  const nowTime = now.getTime();
  const dayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000 - 1;

  const scheduledActionableTasks = actionableTasks
    .map((task) => ({
      task,
      timestamp: toTimestamp(task.scheduledTime),
    }))
    .filter((entry) => Number.isFinite(entry.timestamp));

  const todaysUpcomingTask = scheduledActionableTasks
    .filter(
      (entry) => entry.timestamp >= nowTime && entry.timestamp >= dayStart && entry.timestamp <= dayEnd
    )
    .sort(compareByTimeThenId)[0];

  if (todaysUpcomingTask) {
    const target = todaysUpcomingTask.task;
    return {
      task: target,
      reason: "today-upcoming",
      taskId: target.id,
      sectionId: target.isPinned ? "Pinned" : target.section || null,
      scheduledTime: target.scheduledTime || "",
    };
  }

  const nearestFutureTask = scheduledActionableTasks
    .filter((entry) => entry.timestamp >= nowTime)
    .sort(compareByTimeThenId)[0];

  if (!nearestFutureTask) return null;

  const target = nearestFutureTask.task;
  return {
    task: target,
    reason: "future-upcoming",
    taskId: target.id,
    sectionId: target.isPinned ? "Pinned" : target.section || null,
    scheduledTime: target.scheduledTime || "",
  };
};
