import "expo-router/entry";
import { AppRegistry, Platform } from "react-native";
import { runScheduledAutoBackup } from "./services/backupService";

if (Platform.OS === "android") {
  AppRegistry.registerHeadlessTask("ADHDTaskManagerAutoBackup", () => async () => {
    await runScheduledAutoBackup();
  });
}
