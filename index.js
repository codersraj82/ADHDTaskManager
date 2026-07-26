import { AppRegistry, Platform } from "react-native";
import { initDB } from "./database/db";
import {
  runScheduledAutoBackup,
  saveBackupSettings,
} from "./services/backupService";

if (Platform.OS === "android") {
  AppRegistry.registerHeadlessTask("ADHDTaskManagerAutoBackup", () => async () => {
    try {
      initDB();
      return await runScheduledAutoBackup();
    } catch (error) {
      await saveBackupSettings({
        lastAutoBackupStatus: "failed",
        lastAutoBackupError:
          "Scheduled automatic backup stopped before it could finish.",
      }).catch(() => null);
      throw error;
    }
  });
}

// Keep Expo Router as the UI root while this file remains the shared native entry.
require("expo-router/entry");
