import { Stack } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { initDB } from "../database/db";
import { registerTaskReminderActions } from "../services/notificationService";
import "../global.css";

// Root handler for in-app notification behavior.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  useEffect(() => {
    initDB();

    const setupNotifications = async () => {
      try {
        const { status: existingStatus } =
          await Notifications.getPermissionsAsync();

        let finalStatus = existingStatus;

        if (existingStatus !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== "granted") {
          console.log("Notification permission denied");
          return;
        }

        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("adhd-alarms", {
            name: "ADHD Task Reminders",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#FFD700",
            sound: "default",
            lockscreenVisibility:
              Notifications.AndroidNotificationVisibility.PUBLIC,
            bypassDnd: true,
          });
        }

        await registerTaskReminderActions();
      } catch (error) {
        console.log("Notification setup error:", error);
      }
    };

    void setupNotifications();
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
