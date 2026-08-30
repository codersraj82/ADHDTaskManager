import { Platform } from "react-native";
import { requireNativeModule } from "expo-modules-core";

export type ScreenAwarenessSettings = {
  enabled: boolean;
  threshold20Enabled: boolean;
  threshold30Enabled: boolean;
  threshold45Enabled: boolean;
  threshold60Enabled: boolean;
  breakResetMinutes: number;
  showOverlay: boolean;
  showNotification: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
};

export type ScreenAwarenessPermissions = {
  usageAccessGranted: boolean;
  overlayGranted: boolean;
  notificationsAllowed: boolean;
};

export type ScreenAwarenessStatus = {
  success: boolean;
  settings?: ScreenAwarenessSettings;
  permissions?: ScreenAwarenessPermissions;
  monitoringActive?: boolean;
  status?:
    | "stopped"
    | "usage_access_required"
    | "waiting_to_start"
    | "active"
    | "active_without_popup_access"
    | "active_without_notification_access"
    | "active_without_reminder_access";
  currentSession?: {
    active?: boolean;
    activeDurationMs?: number;
    currentForegroundPackage?: string | null;
  } | null;
  errorCode?: string;
  message?: string;
};

export type ScreenUsageApp = {
  packageName: string;
  appName: string;
  iconDataUrl?: string | null;
  durationMs: number;
  percentage: number;
  dailyUsage: { date: string; durationMs: number }[];
};

export type ScreenUsageReport = {
  success: boolean;
  range?: "today" | "7days" | "30days";
  startTime?: number;
  endTime?: number;
  summary?: {
    totalScreenMs: number;
    longestContinuousSessionMs: number;
    sessionCount: number;
    warningCount: number;
  };
  apps?: ScreenUsageApp[];
  errorCode?: string;
  message?: string;
};

type ScreenAwarenessNativeModule = {
  getScreenAwarenessStatus(): Promise<ScreenAwarenessStatus>;
  setScreenAwarenessEnabled(enabled: boolean): Promise<ScreenAwarenessStatus>;
  updateScreenAwarenessSettings(
    settings: Partial<ScreenAwarenessSettings>
  ): Promise<ScreenAwarenessStatus>;
  openUsageAccessSettings(): Promise<{ success: boolean }>;
  openOverlaySettings(): Promise<{ success: boolean }>;
  openNotificationSettings(): Promise<{ success: boolean }>;
  getCurrentContinuousSession(): Promise<{
    success: boolean;
    session?: ScreenAwarenessStatus["currentSession"];
  }>;
  getUsageReport(range: string): Promise<ScreenUsageReport>;
};

let cachedModule: ScreenAwarenessNativeModule | null | undefined;

const unsupportedStatus = (): ScreenAwarenessStatus => ({
  success: false,
  errorCode:
    Platform.OS === "android" ? "NATIVE_MODULE_UNAVAILABLE" : "UNSUPPORTED_PLATFORM",
  message:
    Platform.OS === "android"
      ? "Screen Awareness requires a new native Android build."
      : "Screen Awareness is currently available on Android.",
});

const getModule = (): ScreenAwarenessNativeModule | null => {
  if (Platform.OS !== "android") return null;
  if (cachedModule !== undefined) return cachedModule;
  try {
    cachedModule = requireNativeModule<ScreenAwarenessNativeModule>("ScreenAwareness");
  } catch {
    cachedModule = null;
  }
  return cachedModule;
};

export const getScreenAwarenessStatus = async (): Promise<ScreenAwarenessStatus> => {
  const module = getModule();
  if (!module) return unsupportedStatus();
  try {
    return await module.getScreenAwarenessStatus();
  } catch {
    return unsupportedStatus();
  }
};

export const setScreenAwarenessEnabled = async (
  enabled: boolean
): Promise<ScreenAwarenessStatus> => {
  const module = getModule();
  if (!module) return unsupportedStatus();
  try {
    return await module.setScreenAwarenessEnabled(enabled);
  } catch {
    return unsupportedStatus();
  }
};

export const updateScreenAwarenessSettings = async (
  settings: Partial<ScreenAwarenessSettings>
): Promise<ScreenAwarenessStatus> => {
  const module = getModule();
  if (!module) return unsupportedStatus();
  try {
    return await module.updateScreenAwarenessSettings(settings);
  } catch {
    return unsupportedStatus();
  }
};

export const openUsageAccessSettings = async () => {
  const module = getModule();
  return module ? module.openUsageAccessSettings() : { success: false };
};

export const openOverlaySettings = async () => {
  const module = getModule();
  return module ? module.openOverlaySettings() : { success: false };
};

export const openScreenAwarenessNotificationSettings = async () => {
  const module = getModule();
  return module ? module.openNotificationSettings() : { success: false };
};

export const getScreenUsageReport = async (
  range: "today" | "7days" | "30days"
): Promise<ScreenUsageReport> => {
  const module = getModule();
  if (!module) return unsupportedStatus();
  try {
    return await module.getUsageReport(range);
  } catch {
    return {
      ...unsupportedStatus(),
      message: "Screen usage could not be loaded right now.",
    };
  }
};
