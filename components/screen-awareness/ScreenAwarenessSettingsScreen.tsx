import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  AppState,
  Platform,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  getScreenAwarenessStatus,
  openOverlaySettings,
  openScreenAwarenessNotificationSettings,
  openUsageAccessSettings,
  ScreenAwarenessSettings,
  ScreenAwarenessStatus,
  setScreenAwarenessEnabled,
  updateScreenAwarenessSettings,
} from "../../services/screenAwareness";
import ScreenAwarenessShell from "./ScreenAwarenessShell";

const COLORS = {
  background: "#061414",
  card: "#123131",
  accent: "#66B9B9",
  text: "#E8F4F4",
  muted: "#9FB5B5",
  success: "#7DFFB3",
  warning: "#FFD166",
};

const DEFAULT_SETTINGS: ScreenAwarenessSettings = {
  enabled: false,
  threshold20Enabled: true,
  threshold30Enabled: true,
  threshold45Enabled: true,
  threshold60Enabled: true,
  breakResetMinutes: 5,
  showOverlay: true,
  showNotification: true,
  soundEnabled: false,
  vibrationEnabled: false,
};

export default function ScreenAwarenessSettingsScreen() {
  const [status, setStatus] = useState<ScreenAwarenessStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customResetVisible, setCustomResetVisible] = useState(false);
  const [customResetMinutes, setCustomResetMinutes] = useState("5");

  const settings = status?.settings || DEFAULT_SETTINGS;
  const permissions = status?.permissions;

  const refresh = useCallback(async () => {
    setLoading(true);
    const next = await getScreenAwarenessStatus();
    setStatus(next);
    if (next.settings?.breakResetMinutes) {
      setCustomResetMinutes(String(next.settings.breakResetMinutes));
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const statusCopy = useMemo(() => {
    if (!status?.success) return status?.message || "Screen Awareness is unavailable.";
    if (!settings.enabled) return "Monitoring stopped";
    if (!permissions?.usageAccessGranted) return "Setup needed — Usage Access is required";
    if (status.monitoringActive && !permissions?.overlayGranted) {
      return "Monitoring active — popup permission missing";
    }
    if (status.monitoringActive && !permissions?.notificationsAllowed) {
      return "Monitoring active — notification permission missing";
    }
    if (status.monitoringActive) return "Monitoring active";
    return "Ready to resume monitoring";
  }, [permissions, settings.enabled, status]);

  const statusColor = status?.monitoringActive
    ? COLORS.success
    : settings.enabled
      ? COLORS.warning
      : COLORS.muted;

  const toggleEnabled = async (enabled: boolean) => {
    if (saving) return;
    setSaving(true);
    const next = await setScreenAwarenessEnabled(enabled);
    setStatus(next);
    setSaving(false);
  };

  const savePatch = async (patch: Partial<ScreenAwarenessSettings>) => {
    if (saving) return;
    setSaving(true);
    const next = await updateScreenAwarenessSettings(patch);
    setStatus(next);
    setSaving(false);
  };

  const requestNotifications = async () => {
    if (Platform.OS !== "android") return;
    const result = await Notifications.requestPermissionsAsync();
    if (result.status !== "granted") {
      await openScreenAwarenessNotificationSettings();
    }
    await refresh();
  };

  const applyCustomReset = () => {
    const minutes = Number(customResetMinutes.trim());
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) {
      Alert.alert(
        "Reset time",
        "Enter a screen-inactive reset time between 1 and 180 minutes."
      );
      return;
    }
    setCustomResetVisible(false);
    void savePatch({ breakResetMinutes: minutes });
  };

  const permissionRows = [
    {
      key: "usage",
      title: "Usage Access",
      description: "Calculates screen time and most-used apps. No screen content is read.",
      granted: Boolean(permissions?.usageAccessGranted),
      actionLabel: "Grant Usage Access",
      action: openUsageAccessSettings,
    },
    {
      key: "overlay",
      title: "Display Over Other Apps",
      description: "Shows the gentle check-in above the app you are using.",
      granted: Boolean(permissions?.overlayGranted),
      actionLabel: "Allow Display Over Apps",
      action: openOverlaySettings,
    },
    {
      key: "notifications",
      title: "Notifications",
      description: "Shows reminders while Task Manager is in the background.",
      granted: Boolean(permissions?.notificationsAllowed),
      actionLabel: "Allow Notifications",
      action: requestNotifications,
    },
  ];

  const thresholds: {
    minutes: number;
    key: keyof ScreenAwarenessSettings;
  }[] = [
    { minutes: 20, key: "threshold20Enabled" },
    { minutes: 30, key: "threshold30Enabled" },
    { minutes: 45, key: "threshold45Enabled" },
    { minutes: 60, key: "threshold60Enabled" },
  ];

  return (
    <ScreenAwarenessShell
      title="Screen-Time Awareness"
      subtitle="Gentle reminders for intentional phone use."
      refreshing={loading}
      onRefresh={() => void refresh()}
    >
      {!status?.success ? (
        <View className="bg-[#2A2218]/75 border border-[#D9A441]/40 rounded-3xl p-4 mb-4">
          <Text className="text-[#FFD166] font-black">Native Android build required</Text>
          <Text className="text-[#E8F4F4] text-sm leading-5 mt-2">
            {status?.message || "Build and install the Android app to use this feature."}
          </Text>
        </View>
      ) : null}

      <View className="bg-[#123131]/65 border border-[#66b9b9]/30 rounded-3xl p-4 mb-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-4">
            <Text className="text-[#E8F4F4] text-lg font-black">Screen Awareness</Text>
            <Text style={{ color: statusColor }} className="text-xs font-bold mt-1">
              {loading ? "Checking status..." : statusCopy}
            </Text>
          </View>
          <Switch
            accessibilityLabel="Screen Awareness"
            value={settings.enabled}
            disabled={saving || !status?.success}
            onValueChange={(value) => void toggleEnabled(value)}
            trackColor={{ false: "#274747", true: "#337A7A" }}
            thumbColor={settings.enabled ? COLORS.text : COLORS.muted}
          />
        </View>
        <Text className="text-[#9FB5B5] text-sm leading-5 mt-3">
          Get a calm check-in when continuous phone use becomes longer than you intended.
        </Text>
      </View>

      <SectionTitle title="Required Access" subtitle="Android keeps each permission under your control." />
      {permissionRows.map((item) => (
        <TouchableOpacity
          key={item.key}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}, ${item.granted ? "granted" : "required"}`}
          activeOpacity={item.granted ? 1 : 0.84}
          onPress={() => {
            if (!item.granted) void item.action();
          }}
          className="bg-[#123131]/60 border border-[#337a7a]/30 rounded-2xl p-4 mb-2.5"
        >
          <View className="flex-row items-center">
            <View className="flex-1 pr-3">
              <Text className="text-[#E8F4F4] font-black">{item.title}</Text>
              <Text className="text-[#9FB5B5] text-xs leading-5 mt-1">{item.description}</Text>
            </View>
            <Text
              style={{ color: item.granted ? COLORS.success : COLORS.warning }}
              className="text-xs font-black"
            >
              {item.granted ? "✓ Granted" : "! Required"}
            </Text>
          </View>
          {!item.granted ? (
            <Text className="text-[#66B9B9] text-[10px] font-black uppercase tracking-widest mt-3">
              {item.actionLabel}  ›
            </Text>
          ) : null}
        </TouchableOpacity>
      ))}

      <SectionTitle title="Remind Me After" subtitle="Each enabled threshold appears once per continuous session." />
      <View className="bg-[#123131]/60 border border-[#337a7a]/30 rounded-3xl px-4 mb-4">
        {thresholds.map((item, index) => (
          <SettingSwitchRow
            key={item.minutes}
            label={`${item.minutes} minutes`}
            value={Boolean(settings[item.key])}
            disabled={saving}
            last={index === thresholds.length - 1}
            onChange={(value) => void savePatch({ [item.key]: value })}
          />
        ))}
      </View>

      <SectionTitle
        title="Continuous Session Reset"
        subtitle="A quick lock pauses the timer. A meaningful screen-off break starts a fresh session."
      />
      <View className="bg-[#123131]/60 border border-[#337a7a]/30 rounded-3xl p-4 mb-4">
        <Text className="text-[#E8F4F4] font-bold mb-3">Reset after screen is inactive for</Text>
        <View className="flex-row flex-wrap">
          {[2, 5, 10].map((minutes) => {
            const selected = settings.breakResetMinutes === minutes && !customResetVisible;
            return (
              <TouchableOpacity
                key={minutes}
                activeOpacity={0.82}
                disabled={saving}
                onPress={() => {
                  setCustomResetVisible(false);
                  void savePatch({ breakResetMinutes: minutes });
                }}
                className={`px-4 py-2 rounded-full border mr-2 mb-2 ${
                  selected
                    ? "bg-[#66b9b9] border-[#66b9b9]"
                    : "bg-[#061414]/55 border-[#337a7a]/40"
                }`}
              >
                <Text className={`text-xs font-black ${selected ? "text-[#061414]" : "text-[#9FB5B5]"}`}>
                  {minutes} min
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            activeOpacity={0.82}
            onPress={() => setCustomResetVisible(true)}
            className={`px-4 py-2 rounded-full border mb-2 ${
              customResetVisible || ![2, 5, 10].includes(settings.breakResetMinutes)
                ? "bg-[#66b9b9] border-[#66b9b9]"
                : "bg-[#061414]/55 border-[#337a7a]/40"
            }`}
          >
            <Text
              className={`text-xs font-black ${
                customResetVisible || ![2, 5, 10].includes(settings.breakResetMinutes)
                  ? "text-[#061414]"
                  : "text-[#9FB5B5]"
              }`}
            >
              Custom
            </Text>
          </TouchableOpacity>
        </View>
        {customResetVisible ? (
          <View className="flex-row items-center mt-2">
            <TextInput
              accessibilityLabel="Custom inactive reset minutes"
              value={customResetMinutes}
              onChangeText={(value) => setCustomResetMinutes(value.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              maxLength={3}
              placeholder="Minutes"
              placeholderTextColor="#6F9292"
              className="flex-1 h-12 px-4 rounded-2xl bg-[#061414]/70 border border-[#66b9b9]/30 text-[#E8F4F4] font-bold mr-2"
            />
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.84}
              onPress={applyCustomReset}
              className="h-12 px-4 rounded-2xl bg-[#66b9b9] items-center justify-center"
            >
              <Text className="text-[#061414] text-xs font-black uppercase">Apply</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <Text className="text-[#66B9B9] text-xs font-bold mt-2">
          Current: {settings.breakResetMinutes} minutes
        </Text>
      </View>

      <SectionTitle title="Reminder Behaviour" subtitle="Quiet by default, with choices you can change anytime." />
      <View className="bg-[#123131]/60 border border-[#337a7a]/30 rounded-3xl px-4 mb-4">
        <SettingSwitchRow
          label="Show popup over other apps"
          value={settings.showOverlay}
          disabled={saving}
          onChange={(value) => void savePatch({ showOverlay: value })}
        />
        <SettingSwitchRow
          label="Show notification"
          value={settings.showNotification}
          disabled={saving}
          onChange={(value) => void savePatch({ showNotification: value })}
        />
        <SettingSwitchRow
          label="Sound"
          value={settings.soundEnabled}
          disabled={saving}
          onChange={(value) => void savePatch({ soundEnabled: value })}
        />
        <SettingSwitchRow
          label="Vibration"
          value={settings.vibrationEnabled}
          disabled={saving}
          last
          onChange={(value) => void savePatch({ vibrationEnabled: value })}
        />
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Open Screen Usage Reports"
        activeOpacity={0.86}
        onPress={() => router.push("/screen-usage" as never)}
        className="flex-row items-center bg-[#66b9b9]/15 border border-[#66b9b9]/45 rounded-3xl p-4 mb-4"
      >
        <View className="w-11 h-11 rounded-2xl bg-[#66b9b9]/20 items-center justify-center mr-3">
          <Feather name="bar-chart-2" size={20} color="#66B9B9" />
        </View>
        <View className="flex-1">
          <Text className="text-[#E8F4F4] font-black">Screen Usage Reports</Text>
          <Text className="text-[#9FB5B5] text-xs mt-1">See total time and your most-used apps.</Text>
        </View>
        <Text className="text-[#66B9B9] text-xl font-black">›</Text>
      </TouchableOpacity>

      <View className="bg-[#061414]/65 border border-[#337a7a]/25 rounded-3xl p-4">
        <Text className="text-[#E8F4F4] font-black">Your usage data stays on this device.</Text>
        <Text className="text-[#9FB5B5] text-xs leading-5 mt-2">
          Android&apos;s local usage statistics are used to calculate screen time. Screen Awareness does not read messages, typed text, photos, passwords, URLs, or screen content.
        </Text>
      </View>
    </ScreenAwarenessShell>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View className="mb-3 mt-1">
      <Text className="text-[#E8F4F4] text-base font-black">{title}</Text>
      <Text className="text-[#9FB5B5] text-xs leading-5 mt-1">{subtitle}</Text>
    </View>
  );
}

function SettingSwitchRow({
  label,
  value,
  disabled,
  last = false,
  onChange,
}: {
  label: string;
  value: boolean;
  disabled?: boolean;
  last?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View className={`flex-row items-center justify-between py-3.5 ${last ? "" : "border-b border-[#337a7a]/20"}`}>
      <Text className="text-[#E8F4F4] text-sm font-bold flex-1 pr-3">{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: "#274747", true: "#337A7A" }}
        thumbColor={value ? COLORS.text : COLORS.muted}
      />
    </View>
  );
}
