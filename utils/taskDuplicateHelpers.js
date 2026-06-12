import { REPEAT_TYPES } from "./repeatTaskHelpers";

const defaultSubtaskId = (index = 0) =>
  Date.now() + index + Math.floor(Math.random() * 100000);

const cloneAttachments = (attachments = []) =>
  (Array.isArray(attachments) ? attachments : []).map((attachment) => ({
    ...attachment,
  }));

const resetSubtasks = (subtasks = [], generateSubtaskId = defaultSubtaskId) =>
  (Array.isArray(subtasks) ? subtasks : []).map((subtask, index) => ({
    ...subtask,
    id: generateSubtaskId(index),
    completed: false,
    isCompleted: false,
    completedAt: null,
    doneAt: null,
  }));

export const createTaskDuplicateFromCompleted = (task, options = {}) => {
  if (!task || !task.completed) return null;

  const createdAt =
    typeof options.createdAt === "string" && options.createdAt.trim()
      ? options.createdAt
      : new Date().toISOString();
  const scheduledTime =
    typeof options.scheduledTime === "string" ? options.scheduledTime : "";
  const attachments = cloneAttachments(
    Array.isArray(options.attachments) ? options.attachments : task.attachments
  );
  const subtasks = resetSubtasks(task.subtasks, options.generateSubtaskId);

  return {
    ...task,
    id: options.id ?? undefined,
    title: task.title || "Task",
    completed: false,
    isCompleted: false,
    status: "pending",
    completedAt: null,
    completedOn: null,
    completionDate: null,
    doneAt: null,
    createdAt,
    updatedAt: createdAt,
    scheduledTime,
    notificationId: [],
    notificationIds: [],
    reminderNotificationIds: [],
    scheduledNotificationIds: [],
    alarmId: "",
    strongAlarmId: "",
    strongAlarmScheduledAt: "",
    strongAlarmSnoozeMinutes: Number(task.strongAlarmSnoozeMinutes || 5) || 5,
    lastStrongAlarmResult: null,
    usePhoneAlarm: false,
    useStrongAlarm: false,
    snoozeCount: 0,
    lastSnoozedAt: "",
    reminderOpenCount: 0,
    reminderStartNowCount: 0,
    reminderSnoozeCount: 0,
    reminderMoveGentlyCount: 0,
    reminderMakeSmallerCount: 0,
    reminderActionHistory: [],
    lastReminderAction: "",
    lastReminderActionAt: "",
    rescheduleCount: 0,
    lastRescheduledAt: "",
    focusSessionIds: [],
    focusCompletedAt: null,
    completedFocusSessionId: null,
    archived: false,
    deleted: false,
    isPinned: false,
    pinned: false,
    repeatType: REPEAT_TYPES.NONE,
    repeatDays: [],
    repeatMonthlyType: "",
    repeatCustomDate: "",
    repeatYearlyDate: "",
    repeatGroupId: "",
    attachment: options.primaryAttachmentUri || "",
    attachments,
    subtasks,
    moodType: "",
    startAssistUsedCount: 0,
    lastStartAssistAt: "",
    stuckCount: 0,
    lastStuckAt: "",
  };
};
