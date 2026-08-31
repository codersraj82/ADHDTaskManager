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
  currentSession?: ContinuousScreenSession | null;
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

export type ScreenSessionAppUsage = {
  packageName: string;
  appName: string;
  durationMs: number;
};

export type ScreenSessionWarning = {
  thresholdMinutes: number;
  timestamp: number;
  followUp: boolean;
};

export type ContinuousScreenSession = {
  schemaVersion: number;
  active: boolean;
  sessionId: string;
  startTime: number;
  endTime?: number | null;
  activeDurationMs: number;
  elapsedSpanMs: number;
  pauseDurationMs: number;
  screenInteractive?: boolean;
  currentForegroundPackage?: string | null;
  currentForegroundApp?: Pick<ScreenSessionAppUsage, "packageName" | "appName"> | null;
  thresholdsTriggered: number[];
  warningCount: number;
  warningEvents: ScreenSessionWarning[];
  appUsageBreakdown: ScreenSessionAppUsage[];
  topApp?: ScreenSessionAppUsage | null;
  sessionDateLocal: string;
  meaningfulBreakMinutes: number;
  completedNormally: boolean;
  endReason?: "MEANINGFUL_BREAK" | "FEATURE_DISABLED" | "DEVICE_REBOOT" | string | null;
};

export type DailyScreenSessionSummary = {
  date: string;
  sessionCount: number;
  totalDurationMs: number;
  averageDurationMs: number;
  longestDurationMs: number;
  over30Count: number;
  over45Count: number;
  over60Count: number;
};

export type ContinuousSessionReport = {
  schemaVersion: number;
  retentionDays: number;
  migrationMessage: string;
  summary: {
    totalSessions: number;
    totalDurationMs: number;
    averageDurationMs: number;
    longestDurationMs: number;
    over30Count: number;
    over45Count: number;
    over60Count: number;
  };
  activeSession?: ContinuousScreenSession | null;
  sessions: ContinuousScreenSession[];
  dailySummaries: DailyScreenSessionSummary[];
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
  continuousSessions?: ContinuousSessionReport;
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
    session?: ContinuousScreenSession | null;
  }>;
  clearContinuousSessionHistory(): Promise<{
    success: boolean;
    retentionDays?: number;
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

export const getCurrentContinuousSession = async (): Promise<ContinuousScreenSession | null> => {
  const module = getModule();
  if (!module) return null;
  try {
    const result = await module.getCurrentContinuousSession();
    return result.success ? result.session || null : null;
  } catch {
    return null;
  }
};

export const clearScreenUsageHistory = async (): Promise<{ success: boolean }> => {
  const module = getModule();
  if (!module) return { success: false };
  try {
    return await module.clearContinuousSessionHistory();
  } catch {
    return { success: false };
  }
};
