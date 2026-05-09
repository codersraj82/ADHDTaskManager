import { Stack } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { initDB } from "../database/db";
import '../global.css';

// 1. Root Handler: This makes the popup show while you are using the app
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  useEffect(() => {
    initDB();

    async function setupNotifications() {
  try {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();

    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } =
        await Notifications.requestPermissionsAsync();

      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("❌ Notification permission denied");
      return;
    }

    console.log("✅ Notification permission granted");

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(
        "adhd-alarms",
        {
          name: "ADHD Task Reminders",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#FFD700",
          sound: "default",
          lockscreenVisibility:
            Notifications.AndroidNotificationVisibility.PUBLIC,
          bypassDnd: true,
        }
      );

      console.log("✅ Notification channel created");
    }
  } catch (e) {
    console.log("🚨 Notification Setup Error:", e);
  }
}

    setupNotifications();
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}