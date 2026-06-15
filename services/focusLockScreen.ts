import { Platform } from "react-native";
import { requireNativeModule } from "expo-modules-core";

export type FocusLockScreenResult = {
  success: boolean;
  sessionId?: string | null;
  completed?: boolean;
  completionNotifiedAtMillis?: number | null;
  errorCode?: string;
  message?: string;
};

export type FocusLockScreenSessionStatus = FocusLockScreenResult & {
  taskId?: string | null;
  taskTitle?: string | null;
  startedAtMillis?: number | null;
  expectedEndAtMillis?: number | null;
  durationMinutes?: number | null;
  readAloudOnComplete?: boolean;
  status?: "active" | "paused" | "completed" | "stopped" | null;
};

export type FocusLockScreenOptions = {
  sessionId: string;
  taskId?: string | number | null;
  taskTitle?: string | null;
  startedAt: string | number;
  expectedEndAt: string | number;
  durationMinutes: number;
  readAloudOnComplete?: boolean;
  status?: "active" | "paused" | "completed" | "stopped";
};

type FocusLockScreenNativeModule = {
  canUseFocusLockScreen(): boolean | Promise<boolean>;
  startFocusLockScreenSession(
    options: FocusLockScreenOptions
  ): Promise<FocusLockScreenResult>;
  updateFocusLockScreenSession(
    options: FocusLockScreenOptions
  ): Promise<FocusLockScreenResult>;
  stopFocusLockScreenSession(sessionId: string): Promise<FocusLockScreenResult>;
  completeFocusLockScreenSession(sessionId: string): Promise<FocusLockScreenResult>;
  openFocusLockScreen(sessionId: string): Promise<FocusLockScreenResult>;
  getCurrentFocusLockScreenSession(): Promise<FocusLockScreenSessionStatus>;
};

let cachedNativeModule: FocusLockScreenNativeModule | null | undefined;

const UNSUPPORTED_RESULT: FocusLockScreenResult = {
  success: false,
  errorCode: "UNSUPPORTED_PLATFORM",
  message: "Focus lock-screen view is only available on Android.",
};

const MODULE_UNAVAILABLE_RESULT: FocusLockScreenResult = {
  success: false,
  errorCode: "NATIVE_MODULE_UNAVAILABLE",
  message: "Focus lock-screen module is unavailable in this build.",
};

const getNativeModule = (): FocusLockScreenNativeModule | null => {
  if (Platform.OS !== "android") return null;
  if (cachedNativeModule !== undefined) return cachedNativeModule;
  try {
    cachedNativeModule =
      requireNativeModule<FocusLockScreenNativeModule>("FocusLockScreen");
  } catch {
    cachedNativeModule = null;
  }
  return cachedNativeModule;
};

const normalizeResult = (
  result: FocusLockScreenResult | null | undefined
): FocusLockScreenResult => {
  if (!result || typeof result.success !== "boolean") {
    return {
      success: false,
      errorCode: "UNKNOWN_ERROR",
      message: "Focus lock-screen request failed.",
    };
  }
  return result;
};

const normalizeStatus = (
  result: FocusLockScreenSessionStatus | null | undefined
): FocusLockScreenSessionStatus => {
  if (!result || typeof result.success !== "boolean") {
    return {
      success: false,
      errorCode: "UNKNOWN_ERROR",
      message: "Focus lock-screen status request failed.",
    };
  }
  return result;
};

export const buildFocusLockScreenSessionId = ({
  taskId,
  startedAt,
}: {
  taskId?: string | number | null;
  startedAt: string | number;
}): string => {
  const safeTaskId = String(taskId ?? "task")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 48) || "task";
  const safeStartedAt = String(startedAt)
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 48);
  return `focus-${safeTaskId}-${safeStartedAt || Date.now()}`;
};

export const canUseFocusLockScreen = async (): Promise<boolean> => {
  const nativeModule = getNativeModule();
  if (!nativeModule) return false;

  try {
    return Boolean(await Promise.resolve(nativeModule.canUseFocusLockScreen()));
  } catch {
    return false;
  }
};

export const startFocusLockScreenSession = async (
  options: FocusLockScreenOptions
): Promise<FocusLockScreenResult> => {
  const nativeModule = getNativeModule();
  if (Platform.OS !== "android") return UNSUPPORTED_RESULT;
  if (!nativeModule) return MODULE_UNAVAILABLE_RESULT;

  try {
    return normalizeResult(await nativeModule.startFocusLockScreenSession(options));
  } catch {
    return {
      success: false,
      sessionId: options.sessionId,
      errorCode: "START_FAILED",
      message: "Focus lock-screen session could not start.",
    };
  }
};

export const updateFocusLockScreenSession = async (
  options: FocusLockScreenOptions
): Promise<FocusLockScreenResult> => {
  const nativeModule = getNativeModule();
  if (Platform.OS !== "android") return UNSUPPORTED_RESULT;
  if (!nativeModule) return MODULE_UNAVAILABLE_RESULT;

  try {
    return normalizeResult(await nativeModule.updateFocusLockScreenSession(options));
  } catch {
    return {
      success: false,
      sessionId: options.sessionId,
      errorCode: "UPDATE_FAILED",
      message: "Focus lock-screen session could not update.",
    };
  }
};

export const stopFocusLockScreenSession = async (
  sessionId?: string | null
): Promise<FocusLockScreenResult> => {
  if (!sessionId) return { success: true, sessionId: null };
  const nativeModule = getNativeModule();
  if (Platform.OS !== "android") return UNSUPPORTED_RESULT;
  if (!nativeModule) return MODULE_UNAVAILABLE_RESULT;

  try {
    return normalizeResult(await nativeModule.stopFocusLockScreenSession(sessionId));
  } catch {
    return {
      success: false,
      sessionId,
      errorCode: "STOP_FAILED",
      message: "Focus lock-screen session could not stop.",
    };
  }
};

export const completeFocusLockScreenSession = async (
  sessionId?: string | null
): Promise<FocusLockScreenResult> => {
  if (!sessionId) return { success: true, sessionId: null };
  const nativeModule = getNativeModule();
  if (Platform.OS !== "android") return UNSUPPORTED_RESULT;
  if (!nativeModule) return MODULE_UNAVAILABLE_RESULT;

  try {
    return normalizeResult(
      await nativeModule.completeFocusLockScreenSession(sessionId)
    );
  } catch {
    return {
      success: false,
      sessionId,
      errorCode: "COMPLETE_FAILED",
      message: "Focus lock-screen session could not complete.",
    };
  }
};

export const openFocusLockScreen = async (
  sessionId?: string | null
): Promise<FocusLockScreenResult> => {
  if (!sessionId) return { success: false, sessionId: null };
  const nativeModule = getNativeModule();
  if (Platform.OS !== "android") return UNSUPPORTED_RESULT;
  if (!nativeModule) return MODULE_UNAVAILABLE_RESULT;

  try {
    return normalizeResult(await nativeModule.openFocusLockScreen(sessionId));
  } catch {
    return {
      success: false,
      sessionId,
      errorCode: "OPEN_FAILED",
      message: "Focus lock-screen view could not open.",
    };
  }
};

export const getCurrentFocusLockScreenSession =
  async (): Promise<FocusLockScreenSessionStatus> => {
    const nativeModule = getNativeModule();
    if (Platform.OS !== "android") return { ...UNSUPPORTED_RESULT, status: null };
    if (!nativeModule) return { ...MODULE_UNAVAILABLE_RESULT, status: null };

    try {
      return normalizeStatus(await nativeModule.getCurrentFocusLockScreenSession());
    } catch {
      return {
        success: false,
        status: null,
        errorCode: "STATUS_FAILED",
        message: "Focus lock-screen status could not be read.",
      };
    }
  };
