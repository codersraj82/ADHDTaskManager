import { Platform } from "react-native";
import { requireNativeModule } from "expo-modules-core";
import { parseStoredDateTime } from "../utils/formatDateTime";

export type AlarmErrorCode =
  | "UNSUPPORTED_PLATFORM"
  | "NATIVE_MODULE_UNAVAILABLE"
  | "INVALID_TIME"
  | "EXACT_ALARM_PERMISSION_REQUIRED"
  | "SCHEDULE_FAILED"
  | "CANCEL_FAILED"
  | "ALARM_NOT_FOUND"
  | "UNKNOWN_ERROR";

export type AlarmResult = {
  success: boolean;
  scheduled?: boolean;
  cancelled?: boolean;
  openedSettings?: boolean;
  launched?: boolean;
  alarmId?: string;
  errorCode?: AlarmErrorCode | string;
  message?: string;
};

export type ScheduleTaskAlarmOptions = {
  alarmId: string;
  taskId: string;
  title: string;
  message?: string;
  triggerAtMillis: number;
  snoozeMinutes?: number;
  sound?: boolean;
  vibrate?: boolean;
  fullScreen?: boolean;
};

export type StrongAlarmTaskOptions = {
  alarmId?: string;
  reminderDate?: Date | string;
  snoozeMinutes?: number;
  message?: string;
  sound?: boolean;
  vibrate?: boolean;
  fullScreen?: boolean;
};

type StrongAlarmNativeModule = {
  canUseStrongAlarm(): boolean | Promise<boolean>;
  canScheduleExactAlarms(): boolean | Promise<boolean>;
  openExactAlarmSettings(): Promise<AlarmResult>;
  scheduleTaskAlarm(options: ScheduleTaskAlarmOptions): Promise<AlarmResult>;
  cancelTaskAlarm(alarmId: string): Promise<AlarmResult>;
  snoozeTaskAlarm(alarmId: string, minutes: number): Promise<AlarmResult>;
  stopActiveAlarm(alarmId: string): Promise<AlarmResult>;

  // Legacy external Clock APIs kept for compatibility.
  canUseClockAlarm?: () => boolean | Promise<boolean>;
  setClockAlarm?: (options: {
    hour: number;
    minutes: number;
    message: string;
    skipUi?: boolean;
  }) => Promise<AlarmResult>;
  openAlarmClockFallback?: () => Promise<AlarmResult>;
};

type TaskLike = {
  id?: number | string | null;
  title?: string | null;
  scheduledTime?: string | null;
  reminderDate?: string | Date | null;
  strongAlarmId?: string | null;
  strongAlarmSnoozeMinutes?: number | null;
};

let cachedNativeModule: StrongAlarmNativeModule | null | undefined;

const UNSUPPORTED_RESULT: AlarmResult = {
  success: false,
  errorCode: "UNSUPPORTED_PLATFORM",
  message: "Strong alarms are only available on Android.",
};

const MODULE_UNAVAILABLE_RESULT: AlarmResult = {
  success: false,
  errorCode: "NATIVE_MODULE_UNAVAILABLE",
  message: "Strong alarm module is unavailable in this build.",
};

const normalizeResult = (result: AlarmResult | null | undefined): AlarmResult => {
  if (!result || typeof result.success !== "boolean") {
    return {
      success: false,
      errorCode: "UNKNOWN_ERROR",
      message: "Strong alarm request failed.",
    };
  }
  return {
    success: result.success,
    scheduled: result.scheduled,
    cancelled: result.cancelled,
    openedSettings: result.openedSettings,
    launched: result.launched,
    alarmId: result.alarmId,
    errorCode: result.errorCode,
    message: result.message,
  };
};

const getNativeModule = (): StrongAlarmNativeModule | null => {
  if (Platform.OS !== "android") return null;
  if (cachedNativeModule !== undefined) return cachedNativeModule;
  try {
    cachedNativeModule = requireNativeModule<StrongAlarmNativeModule>("AndroidClockAlarm");
  } catch {
    cachedNativeModule = null;
  }
  return cachedNativeModule;
};

const resolveReminderDate = (
  task: TaskLike,
  options: StrongAlarmTaskOptions = {}
): Date | null => {
  const value = options.reminderDate ?? task?.scheduledTime ?? task?.reminderDate ?? null;
  return parseStoredDateTime(value);
};

const resolveTaskId = (task: TaskLike): string | null => {
  const rawId = task?.id;
  if (typeof rawId === "number" && Number.isFinite(rawId)) {
    return String(rawId);
  }
  if (typeof rawId === "string" && rawId.trim()) {
    return rawId.trim();
  }
  return null;
};

const buildAlarmTitle = (task: TaskLike): string => {
  const title = typeof task?.title === "string" ? task.title.trim() : "";
  return title || "Task reminder";
};

const buildAlarmId = (task: TaskLike, triggerAtMillis: number, explicitAlarmId?: string): string => {
  const requested = typeof explicitAlarmId === "string" ? explicitAlarmId.trim() : "";
  if (requested) return requested.slice(0, 96);

  const existing = typeof task?.strongAlarmId === "string" ? task.strongAlarmId.trim() : "";
  if (existing) return existing.slice(0, 96);

  const taskId = resolveTaskId(task) || "task";
  return `task-${taskId}-${triggerAtMillis}`;
};

const clampSnoozeMinutes = (value: number | null | undefined): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 5;
  return Math.max(1, Math.min(60, Math.round(parsed)));
};

export const canUseStrongAlarm = async (): Promise<boolean> => {
  const nativeModule = getNativeModule();
  if (!nativeModule) return false;

  try {
    const result = await Promise.resolve(nativeModule.canUseStrongAlarm());
    return Boolean(result);
  } catch {
    return false;
  }
};

export const canScheduleExactAlarms = async (): Promise<boolean> => {
  const nativeModule = getNativeModule();
  if (!nativeModule) return false;

  try {
    const result = await Promise.resolve(nativeModule.canScheduleExactAlarms());
    return Boolean(result);
  } catch {
    return false;
  }
};

export const openExactAlarmSettings = async (): Promise<AlarmResult> => {
  if (Platform.OS !== "android") return UNSUPPORTED_RESULT;
  const nativeModule = getNativeModule();
  if (!nativeModule) return MODULE_UNAVAILABLE_RESULT;

  try {
    return normalizeResult(await nativeModule.openExactAlarmSettings());
  } catch {
    return {
      success: false,
      errorCode: "UNKNOWN_ERROR",
      message: "Unable to open Android alarm settings.",
    };
  }
};

export const scheduleStrongAlarmForTask = async (
  task: TaskLike,
  options: StrongAlarmTaskOptions = {}
): Promise<AlarmResult> => {
  if (Platform.OS !== "android") return UNSUPPORTED_RESULT;
  const nativeModule = getNativeModule();
  if (!nativeModule) return MODULE_UNAVAILABLE_RESULT;

  const taskId = resolveTaskId(task);
  if (!taskId) {
    return {
      success: false,
      errorCode: "SCHEDULE_FAILED",
      message: "Task ID is required for strong alarms.",
    };
  }

  const reminderDate = resolveReminderDate(task, options);
  if (!reminderDate) {
    return {
      success: false,
      errorCode: "INVALID_TIME",
      message: "Add a task time first to use a strong alarm.",
    };
  }

  const triggerAtMillis = reminderDate.getTime();
  if (!Number.isFinite(triggerAtMillis) || triggerAtMillis <= Date.now()) {
    return {
      success: false,
      errorCode: "INVALID_TIME",
      message: "Strong alarms need a future reminder time.",
    };
  }

  const title = buildAlarmTitle(task);
  const alarmId = buildAlarmId(task, triggerAtMillis, options.alarmId);

  const payload: ScheduleTaskAlarmOptions = {
    alarmId,
    taskId,
    title,
    message: options.message || "Start with one small step.",
    triggerAtMillis,
    snoozeMinutes: clampSnoozeMinutes(
      options.snoozeMinutes ?? task?.strongAlarmSnoozeMinutes ?? 5
    ),
    sound: options.sound ?? true,
    vibrate: options.vibrate ?? true,
    fullScreen: options.fullScreen ?? false,
  };

  try {
    return normalizeResult(await nativeModule.scheduleTaskAlarm(payload));
  } catch {
    return {
      success: false,
      alarmId,
      errorCode: "SCHEDULE_FAILED",
      message: "Strong alarm could not be scheduled on this device.",
    };
  }
};

export const cancelStrongAlarmForTask = async (
  taskOrAlarmId: string | TaskLike | null | undefined
): Promise<AlarmResult> => {
  if (Platform.OS !== "android") return UNSUPPORTED_RESULT;
  const nativeModule = getNativeModule();
  if (!nativeModule) return MODULE_UNAVAILABLE_RESULT;

  const alarmId =
    typeof taskOrAlarmId === "string"
      ? taskOrAlarmId.trim()
      : typeof taskOrAlarmId?.strongAlarmId === "string"
        ? taskOrAlarmId.strongAlarmId.trim()
        : "";

  if (!alarmId) {
    return {
      success: false,
      errorCode: "ALARM_NOT_FOUND",
      message: "No strong alarm is linked to this task.",
    };
  }

  try {
    return normalizeResult(await nativeModule.cancelTaskAlarm(alarmId));
  } catch {
    return {
      success: false,
      alarmId,
      errorCode: "CANCEL_FAILED",
      message: "Strong alarm could not be cancelled.",
    };
  }
};

export const snoozeStrongAlarm = async (
  alarmId: string,
  minutes = 5
): Promise<AlarmResult> => {
  if (Platform.OS !== "android") return UNSUPPORTED_RESULT;
  const nativeModule = getNativeModule();
  if (!nativeModule) return MODULE_UNAVAILABLE_RESULT;

  const normalizedAlarmId = typeof alarmId === "string" ? alarmId.trim() : "";
  if (!normalizedAlarmId) {
    return {
      success: false,
      errorCode: "ALARM_NOT_FOUND",
      message: "No strong alarm is linked to this task.",
    };
  }

  try {
    return normalizeResult(
      await nativeModule.snoozeTaskAlarm(
        normalizedAlarmId,
        clampSnoozeMinutes(minutes)
      )
    );
  } catch {
    return {
      success: false,
      alarmId: normalizedAlarmId,
      errorCode: "SCHEDULE_FAILED",
      message: "Strong alarm could not be snoozed.",
    };
  }
};

export const stopStrongAlarm = async (alarmId: string): Promise<AlarmResult> => {
  if (Platform.OS !== "android") return UNSUPPORTED_RESULT;
  const nativeModule = getNativeModule();
  if (!nativeModule) return MODULE_UNAVAILABLE_RESULT;

  const normalizedAlarmId = typeof alarmId === "string" ? alarmId.trim() : "";
  if (!normalizedAlarmId) {
    return {
      success: false,
      errorCode: "ALARM_NOT_FOUND",
      message: "No strong alarm is linked to this task.",
    };
  }

  try {
    return normalizeResult(await nativeModule.stopActiveAlarm(normalizedAlarmId));
  } catch {
    return {
      success: false,
      alarmId: normalizedAlarmId,
      errorCode: "UNKNOWN_ERROR",
      message: "Strong alarm could not be stopped.",
    };
  }
};

// Legacy helpers kept to avoid breaking existing imports.
export const canUseClockAlarm = canUseStrongAlarm;

export const setClockAlarmForTask = async (
  task: TaskLike,
  options: StrongAlarmTaskOptions = {}
): Promise<AlarmResult> => {
  return scheduleStrongAlarmForTask(task, options);
};

export const openAlarmClockFallback = async (): Promise<AlarmResult> => {
  return openExactAlarmSettings();
};
