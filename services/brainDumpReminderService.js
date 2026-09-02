import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export const BRAIN_DUMP_REMINDER_TYPE = "brainDumpReminder";
const BRAIN_DUMP_REMINDER_CHANNEL_ID = "brain-dump-reminders";

const ensurePermission = async () => {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === "granted") return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === "granted";
};

const ensureAndroidChannel = async () => {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(
    BRAIN_DUMP_REMINDER_CHANNEL_ID,
    {
      name: "Brain Dump Reminders",
      description: "Gentle reminders for thoughts saved in Brain Dump.",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 120, 180],
      lightColor: "#66B9B9",
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    }
  );
};

export const scheduleBrainDumpReminder = async ({ brainDumpId, date }) => {
  const numericId = Number(brainDumpId);
  const reminderDate = date instanceof Date ? date : new Date(date);

  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw new Error("BRAIN_DUMP_REMINDER_INVALID_ID");
  }
  if (
    Number.isNaN(reminderDate.getTime()) ||
    reminderDate.getTime() <= Date.now()
  ) {
    throw new Error("BRAIN_DUMP_REMINDER_TIME_PASSED");
  }
  if (!(await ensurePermission())) {
    throw new Error("BRAIN_DUMP_REMINDER_PERMISSION_DENIED");
  }

  await ensureAndroidChannel();
  return Notifications.scheduleNotificationAsync({
    content: {
      title: "A gentle thought reminder",
      body: "Your saved thought is here when you are ready.",
      sound: "default",
      data: {
        type: BRAIN_DUMP_REMINDER_TYPE,
        brainDumpId: numericId,
      },
      android: {
        channelId: BRAIN_DUMP_REMINDER_CHANNEL_ID,
        pressAction: { id: "default" },
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminderDate,
      channelId: BRAIN_DUMP_REMINDER_CHANNEL_ID,
    },
  });
};

export const cancelBrainDumpReminder = async (notificationId) => {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(
      String(notificationId)
    );
  } catch {
    // A delivered or already-cancelled reminder no longer needs cleanup.
  }
};
