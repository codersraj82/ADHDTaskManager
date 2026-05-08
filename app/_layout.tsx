import { Stack } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { initDB } from "../database/db";

// 1. Tell the app HOW to handle notifications when it is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  useEffect(() => {
    // Initialize Database
    initDB();

    // 2. Setup Notifications and Permissions
    async function setupNotifications() {
      // Request permission
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.log('Notification permissions not granted');
        return;
      }

      // 3. Setup the Android Channel (Mandatory for Android 8+)
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }
    }

    setupNotifications();
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}