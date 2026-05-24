import * as Notifications from "expo-notifications";
import {
  FOCUS_COMPLETION_AFFIRMATIONS,
  TASK_COMPLETION_AFFIRMATIONS,
} from "../utils/affirmations";
import { getRandomAffirmation } from "../utils/getRandomAffirmation";

const DEFAULT_CHANNEL_ID = "adhd-alarms";
export const TASK_REMINDER_ACTIONS_CATEGORY_ID = "TASK_REMINDER_ACTIONS";
export const TASK_REMINDER_ACTION_IDS = Object.freeze({
  START_NOW: "START_NOW",
  SNOOZE_10: "SNOOZE_10",
  SNOOZE_30: "SNOOZE_30",
  MOVE_GENTLY: "MOVE_GENTLY",
  MAKE_SMALLER: "MAKE_SMALLER",
});

let hasRegisteredTaskReminderActions = false;

const getTaskLabel = (taskTitle = "") => {
  const safeTitle = typeof taskTitle === "string" ? taskTitle.trim() : "";
  return safeTitle || "Focus Session";
};

const baseAndroidConfig = {
  channelId: DEFAULT_CHANNEL_ID,
  pressAction: { id: "default" },
};

export const registerTaskReminderActions = async () => {
  if (hasRegisteredTaskReminderActions) return true;

  try {
    await Notifications.setNotificationCategoryAsync(
      TASK_REMINDER_ACTIONS_CATEGORY_ID,
      [
        {
          identifier: TASK_REMINDER_ACTION_IDS.START_NOW,
          buttonTitle: "Start now",
          options: { opensAppToForeground: true },
        },
        {
          identifier: TASK_REMINDER_ACTION_IDS.SNOOZE_10,
          buttonTitle: "Snooze 10",
          options: { opensAppToForeground: false },
        },
        {
          identifier: TASK_REMINDER_ACTION_IDS.SNOOZE_30,
          buttonTitle: "Snooze 30",
          options: { opensAppToForeground: false },
        },
        {
          identifier: TASK_REMINDER_ACTION_IDS.MOVE_GENTLY,
          buttonTitle: "Move gently",
          options: { opensAppToForeground: true },
        },
        {
          identifier: TASK_REMINDER_ACTION_IDS.MAKE_SMALLER,
          buttonTitle: "Make smaller",
          options: { opensAppToForeground: true },
        },
      ]
    );
    hasRegisteredTaskReminderActions = true;
    return true;
  } catch (error) {
    console.log("Task reminder category registration error:", error);
    return false;
  }
};

export const scheduleFocusCompletionNotification = async ({
  taskTitle,
  taskId = null,
  sectionId = null,
  category = null,
  endTimestamp,
}) => {
  if (!endTimestamp) return null;

  const reminderDate = new Date(endTimestamp);
  if (Number.isNaN(reminderDate.getTime())) return null;

  const label = getTaskLabel(taskTitle);
  const message = getRandomAffirmation(FOCUS_COMPLETION_AFFIRMATIONS);

  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: `⏱ ${label}`,
        body: `${message} (${label})`,
        sound: "default",
        data: {
          type: "focus-session-complete",
          taskId,
          sectionId: sectionId || category || null,
          category: category || sectionId || null,
          taskTitle: label,
        },
        android: baseAndroidConfig,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminderDate,
      },
    });
  } catch (error) {
    console.log("Focus completion notification error:", error);
    return null;
  }
};

export const sendTaskCompletionNotification = async ({ taskTitle }) => {
  const label = getTaskLabel(taskTitle);
  const message = getRandomAffirmation(TASK_COMPLETION_AFFIRMATIONS);

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `✅ ${label}`,
        body: `${message} (${label})`,
        sound: "default",
        data: {
          type: "task-complete",
          taskTitle: label,
        },
        android: baseAndroidConfig,
      },
      trigger: null,
    });
  } catch (error) {
    console.log("Task completion notification error:", error);
  }
};

export const cancelNotificationById = async (notificationId) => {
  if (!notificationId) return;

  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (error) {
    // Ignore cancel errors for already-fired notifications.
  }
};
