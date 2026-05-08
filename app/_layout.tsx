import { Stack } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { initDB } from "../database/db";

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
      // 2. Request Permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') return;

      // 3. Create the Channel with a specific ID
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('adhd-alarms', {
          name: 'ADHD Task Reminders',
          importance: Notifications.AndroidImportance.MAX, // Force it to pop up
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FFD700',
          sound: 'default', // Essential for standalone
        });
      }
    }

    setupNotifications();
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}