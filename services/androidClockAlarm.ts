import { Platform } from "react-native";
import { requireNativeModule } from "expo-modules-core";
import { parseStoredDateTime } from "../utils/formatDateTime";

export type ClockAlarmResult = {
  success: boolean;
  launched?: boolean;
  errorCode?: string;
  message?: string;
};

export type ClockAlarmTaskOptions = {
  reminderDate?: Date | string;
  skipUi?: boolean;
  source?: "taskReminder" | "editTask" | "reschedule" | "manual";
};

type ClockAlarmNativeModule = {
  canUseClockAlarm(): boolean | Promise<boolean>;
  setClockAlarm(options: {
    hour: number;
    minutes: number;
    message: string;
    skipUi?: boolean;
  }): Promise<ClockAlarmResult>;
  openAlarmClockFallback(): Promise<ClockAlarmResult>;
};

type TaskLike = {
  title?: string | null;
  scheduledTime?: string | null;
  reminderDate?: string | Date | null;
};

let cachedNativeModule: ClockAlarmNativeModule | null | undefined;

const UNSUPPORTED_RESULT: ClockAlarmResult = {
  success: false,
  errorCode: "UNSUPPORTED_PLATFORM",
  message: "Phone alarms are only available on Android.",
};

const MODULE_UNAVAILABLE_RESULT: ClockAlarmResult = {
  success: false,
  errorCode: "CLOCK_APP_UNAVAILABLE",
  message: "Phone alarm could not be opened on this device.",
};

const normalizeResult = (result: ClockAlarmResult | null | undefined): ClockAlarmResult => {
  if (!result || typeof result.success !== "boolean") {
    return {
      success: false,
      errorCode: "UNKNOWN_ERROR",
      message: "Unable to open phone alarm.",
    };
  }
  return {
    success: result.success,
    launched: result.launched,
    errorCode: result.errorCode,
    message: result.message,
  };
};

const getNativeModule = (): ClockAlarmNativeModule | null => {
  if (Platform.OS !== "android") return null;
  if (cachedNativeModule !== undefined) return cachedNativeModule;
  try {
    cachedNativeModule = requireNativeModule<ClockAlarmNativeModule>("AndroidClockAlarm");
  } catch (_error) {
    cachedNativeModule = null;
  }
  return cachedNativeModule;
};

const resolveReminderDate = (
  task: TaskLike,
  options: ClockAlarmTaskOptions = {}
): Date | null => {
  const value =
    options.reminderDate ?? task?.scheduledTime ?? task?.reminderDate ?? null;
  return parseStoredDateTime(value);
};

const buildAlarmMessage = (task: TaskLike): string => {
  const safeTitle = typeof task?.title === "string" ? task.title.trim() : "";
  return safeTitle ? `Task: ${safeTitle}` : "Task reminder";
};

export const canUseClockAlarm = async (): Promise<boolean> => {
  const nativeModule = getNativeModule();
  if (!nativeModule) return false;

  try {
    const result = await Promise.resolve(nativeModule.canUseClockAlarm());
    return Boolean(result);
  } catch (_error) {
    return false;
  }
};

export const setClockAlarmForTask = async (
  task: TaskLike,
  options: ClockAlarmTaskOptions = {}
): Promise<ClockAlarmResult> => {
  if (Platform.OS !== "android") return UNSUPPORTED_RESULT;

  const nativeModule = getNativeModule();
  if (!nativeModule) return MODULE_UNAVAILABLE_RESULT;

  const reminderDate = resolveReminderDate(task, options);
  if (!reminderDate) {
    return {
      success: false,
      errorCode: "INVALID_TIME",
      message: "Add a task time first to use phone alarm.",
    };
  }

  try {
    const result = await nativeModule.setClockAlarm({
      hour: reminderDate.getHours(),
      minutes: reminderDate.getMinutes(),
      message: buildAlarmMessage(task),
      skipUi: options.skipUi ?? false,
    });
    return normalizeResult(result);
  } catch (_error) {
    return {
      success: false,
      errorCode: "INTENT_FAILED",
      message: "Phone alarm could not be opened on this device.",
    };
  }
};

export const openAlarmClockFallback = async (): Promise<ClockAlarmResult> => {
  if (Platform.OS !== "android") return UNSUPPORTED_RESULT;

  const nativeModule = getNativeModule();
  if (!nativeModule) return MODULE_UNAVAILABLE_RESULT;

  try {
    const result = await nativeModule.openAlarmClockFallback();
    return normalizeResult(result);
  } catch (_error) {
    return {
      success: false,
      errorCode: "INTENT_FAILED",
      message: "Phone alarm could not be opened on this device.",
    };
  }
};
