import { requireNativeModule } from "expo-modules-core";

export type AlarmResult = {
  success: boolean;
  scheduled?: boolean;
  cancelled?: boolean;
  openedSettings?: boolean;
  launched?: boolean;
  alarmId?: string;
  errorCode?: string;
  message?: string;
  schedulerStatus?: "scheduled" | "not_scheduled" | "permission_needed" | "failed";
  nextRunAt?: number;
};

export type SetClockAlarmOptions = {
  hour: number;
  minutes: number;
  message: string;
  skipUi?: boolean;
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

export type AndroidClockAlarmModuleType = {
  // Legacy external Clock app bridge.
  canUseClockAlarm(): boolean | Promise<boolean>;
  setClockAlarm(options: SetClockAlarmOptions): Promise<AlarmResult>;
  openAlarmClockFallback(): Promise<AlarmResult>;

  // Internal strong-alarm engine.
  canUseStrongAlarm(): boolean | Promise<boolean>;
  canScheduleExactAlarms(): boolean | Promise<boolean>;
  openExactAlarmSettings(): Promise<AlarmResult>;
  scheduleAutoBackup(options: {
    backupTime: string;
    backupType: "minimum" | "full";
  }): Promise<AlarmResult>;
  cancelAutoBackup(): Promise<AlarmResult>;
  getAutoBackupScheduleStatus(): Promise<AlarmResult>;
  scheduleTaskAlarm(options: ScheduleTaskAlarmOptions): Promise<AlarmResult>;
  cancelTaskAlarm(alarmId: string): Promise<AlarmResult>;
  snoozeTaskAlarm(alarmId: string, minutes: number): Promise<AlarmResult>;
  stopActiveAlarm(alarmId: string): Promise<AlarmResult>;
};

export default requireNativeModule<AndroidClockAlarmModuleType>("AndroidClockAlarm");
