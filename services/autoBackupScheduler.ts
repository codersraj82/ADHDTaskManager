import { Platform } from "react-native";
import AndroidClockAlarm from "../modules/android-clock-alarm/src";

export type AutoBackupSchedulerStatus =
  | "scheduled"
  | "not_scheduled"
  | "permission_needed"
  | "failed";

export type AutoBackupScheduleResult = {
  success: boolean;
  scheduled?: boolean;
  cancelled?: boolean;
  schedulerStatus: AutoBackupSchedulerStatus;
  nextRunAt?: number;
  errorCode?: string;
  message?: string;
};

const unavailable = (): AutoBackupScheduleResult => ({
  success: false,
  schedulerStatus: "failed",
  errorCode: "UNSUPPORTED_PLATFORM",
  message: "Scheduled automatic backup is available on Android builds.",
});

export const scheduleAutoBackup = async (options: {
  backupTime: string;
  backupType: "minimum" | "full";
}): Promise<AutoBackupScheduleResult> => {
  if (Platform.OS !== "android") return unavailable();
  return AndroidClockAlarm.scheduleAutoBackup(options) as Promise<AutoBackupScheduleResult>;
};

export const cancelAutoBackup = async (): Promise<AutoBackupScheduleResult> => {
  if (Platform.OS !== "android") return unavailable();
  return AndroidClockAlarm.cancelAutoBackup() as Promise<AutoBackupScheduleResult>;
};

export const getAutoBackupScheduleStatus = async (): Promise<AutoBackupScheduleResult> => {
  if (Platform.OS !== "android") return unavailable();
  return AndroidClockAlarm.getAutoBackupScheduleStatus() as Promise<AutoBackupScheduleResult>;
};
