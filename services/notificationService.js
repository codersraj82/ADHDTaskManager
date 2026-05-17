import * as Notifications from "expo-notifications";
import {
  FOCUS_COMPLETION_AFFIRMATIONS,
  TASK_COMPLETION_AFFIRMATIONS,
} from "../utils/affirmations";
import { getRandomAffirmation } from "../utils/getRandomAffirmation";

const DEFAULT_CHANNEL_ID = "adhd-alarms";

const getTaskLabel = (taskTitle = "") => {
  const safeTitle = typeof taskTitle === "string" ? taskTitle.trim() : "";
  return safeTitle || "Focus Session";
};

const baseAndroidConfig = {
  channelId: DEFAULT_CHANNEL_ID,
  pressAction: { id: "default" },
};

export const scheduleFocusCompletionNotification = async ({
  taskTitle,
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
