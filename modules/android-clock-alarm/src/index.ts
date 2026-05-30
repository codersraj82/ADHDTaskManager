import { requireNativeModule } from "expo-modules-core";

export type SetClockAlarmOptions = {
  hour: number;
  minutes: number;
  message: string;
  skipUi?: boolean;
};

export type ClockAlarmResult = {
  success: boolean;
  launched?: boolean;
  errorCode?: string;
  message?: string;
};

type AndroidClockAlarmModuleType = {
  canUseClockAlarm(): boolean | Promise<boolean>;
  setClockAlarm(options: SetClockAlarmOptions): Promise<ClockAlarmResult>;
  openAlarmClockFallback(): Promise<ClockAlarmResult>;
};

export default requireNativeModule<AndroidClockAlarmModuleType>("AndroidClockAlarm");
