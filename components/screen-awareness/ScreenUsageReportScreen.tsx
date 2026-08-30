import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  getScreenUsageReport,
  openUsageAccessSettings,
  ScreenUsageApp,
  ScreenUsageReport,
} from "../../services/screenAwareness";
import ScreenAwarenessShell from "./ScreenAwarenessShell";

type RangeKey = "today" | "7days" | "30days";

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7days", label: "7 Days" },
  { key: "30days", label: "30 Days" },
];

export default function ScreenUsageReportScreen() {
  const [range, setRange] = useState<RangeKey>("today");
  const [report, setReport] = useState<ScreenUsageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<ScreenUsageApp | null>(null);

  const loadReport = useCallback(async (nextRange: RangeKey = range) => {
    setLoading(true);
    const next = await getScreenUsageReport(nextRange);
    setReport(next);
    setLoading(false);
  }, [range]);

  useFocusEffect(
    useCallback(() => {
      void loadReport(range);
    }, [loadReport, range])
  );

  const summary = report?.summary;
  const apps = report?.apps || [];
  const largestUsage = apps[0]?.durationMs || 1;

  const changeRange = (nextRange: RangeKey) => {
    if (nextRange === range) return;
    setRange(nextRange);
    setSelectedApp(null);
    void loadReport(nextRange);
  };

  return (
    <ScreenAwarenessShell
      title="Screen Usage"
      subtitle="Useful patterns, without judgment."
      refreshing={loading}
      onRefresh={() => void loadReport(range)}
    >
      <View className="flex-row bg-[#123131]/55 border border-[#337a7a]/30 rounded-2xl p-1 mb-5">
        {RANGE_OPTIONS.map((option) => {
          const selected = range === option.key;
          return (
            <TouchableOpacity
              key={option.key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              activeOpacity={0.84}
              onPress={() => changeRange(option.key)}
              className={`flex-1 py-2.5 rounded-xl items-center ${selected ? "bg-[#66b9b9]" : ""}`}
            >
              <Text className={`text-xs font-black ${selected ? "text-[#061414]" : "text-[#9FB5B5]"}`}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading && !report ? (
        <View className="items-center py-16">
          <ActivityIndicator color="#66B9B9" size="large" />
          <Text className="text-[#9FB5B5] text-sm mt-4">Building your local usage picture...</Text>
        </View>
      ) : null}

      {!loading && report?.errorCode === "USAGE_ACCESS_REQUIRED" ? (
        <View className="bg-[#123131]/60 border border-[#D9A441]/40 rounded-3xl p-5">
          <View className="w-12 h-12 rounded-2xl bg-[#D9A441]/15 items-center justify-center mb-3">
            <Feather name="bar-chart-2" size={22} color="#FFD166" />
          </View>
          <Text className="text-[#E8F4F4] text-lg font-black">Usage Access Required</Text>
          <Text className="text-[#9FB5B5] text-sm leading-6 mt-2">
            Allow Android Usage Access to see your screen-time report. No messages or screen content are read.
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.86}
            onPress={() => void openUsageAccessSettings()}
            className="bg-[#66b9b9] rounded-2xl py-3.5 px-4 mt-4"
          >
            <Text className="text-[#061414] text-center font-black uppercase tracking-widest text-xs">
              Grant Usage Access
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!loading && report && !report.success && report.errorCode !== "USAGE_ACCESS_REQUIRED" ? (
        <View className="bg-[#2A2218]/70 border border-[#D9A441]/35 rounded-3xl p-4">
          <Text className="text-[#FFD166] font-black">Report unavailable</Text>
          <Text className="text-[#E8F4F4] text-sm mt-2">
            {report.message || "Screen usage could not be loaded right now."}
          </Text>
        </View>
      ) : null}

      {report?.success && summary ? (
        <>
          <View className="flex-row mb-2">
            <SummaryCard label="Total Screen Time" value={formatDuration(summary.totalScreenMs)} />
            <View className="w-2" />
            <SummaryCard
              label="Longest Session"
              value={formatDuration(summary.longestContinuousSessionMs)}
            />
          </View>
          <View className="flex-row mb-5">
            <SummaryCard label="Continuous Sessions" value={String(summary.sessionCount)} />
            <View className="w-2" />
            <SummaryCard label="Awareness Reminders" value={String(summary.warningCount)} />
          </View>

          <View className="flex-row items-end justify-between mb-3">
            <View>
              <Text className="text-[#E8F4F4] text-lg font-black">Most Used Apps</Text>
              <Text className="text-[#9FB5B5] text-xs mt-1">Android-reported foreground time</Text>
            </View>
            <Text className="text-[#66B9B9] text-[10px] font-black uppercase tracking-widest">
              Local only
            </Text>
          </View>

          {apps.length === 0 ? (
            <View className="bg-[#123131]/60 border border-[#337a7a]/30 rounded-3xl p-5">
              <Text className="text-[#E8F4F4] text-lg font-black">No screen-time data yet</Text>
              <Text className="text-[#9FB5B5] text-sm leading-6 mt-2">
                Screen Awareness will begin building your usage picture as you use your phone.
              </Text>
            </View>
          ) : (
            apps.map((app, index) => (
              <TouchableOpacity
                key={app.packageName}
                accessibilityRole="button"
                accessibilityLabel={`Open usage details for ${app.appName}`}
                activeOpacity={0.84}
                onPress={() => setSelectedApp(app)}
                className="bg-[#123131]/60 border border-[#337a7a]/30 rounded-2xl p-4 mb-3"
              >
                <View className="flex-row items-center">
                  <Text className="text-[#66B9B9] text-xs font-black w-6">{index + 1}</Text>
                  <AppIcon app={app} />
                  <View className="flex-1 ml-3">
                    <Text numberOfLines={1} className="text-[#E8F4F4] font-black">
                      {app.appName}
                    </Text>
                    <Text numberOfLines={1} className="text-[#6F9292] text-[10px] mt-0.5">
                      {app.packageName}
                    </Text>
                  </View>
                  <View className="items-end ml-3">
                    <Text className="text-[#E8F4F4] text-sm font-black">
                      {formatDuration(app.durationMs)}
                    </Text>
                    <Text className="text-[#66B9B9] text-[10px] font-bold">
                      {Math.round(app.percentage)}%
                    </Text>
                  </View>
                </View>
                <View className="h-2.5 rounded-full bg-[#061414]/75 overflow-hidden mt-3 border border-[#337a7a]/20">
                  <View
                    className="h-full rounded-full bg-[#66b9b9]"
                    style={{ width: `${Math.max(4, Math.min(100, app.durationMs / largestUsage * 100))}%` }}
                  />
                </View>
              </TouchableOpacity>
            ))
          )}
        </>
      ) : null}

      <View className="mt-4 bg-[#061414]/65 border border-[#337a7a]/25 rounded-3xl p-4">
        <Text className="text-[#E8F4F4] font-black">Your usage information stays on this device.</Text>
        <Text className="text-[#9FB5B5] text-xs leading-5 mt-2">
          Reports use Android&apos;s local app-level usage statistics. They never include messages, URLs, typing, or screen contents.
        </Text>
      </View>

      <AppDetailModal app={selectedApp} range={range} onClose={() => setSelectedApp(null)} />
    </ScreenAwarenessShell>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 bg-[#123131]/60 border border-[#337a7a]/30 rounded-2xl p-4">
      <Text className="text-[#9FB5B5] text-[10px] font-black uppercase tracking-widest">{label}</Text>
      <Text className="text-[#66B9B9] text-xl font-black mt-2">{value}</Text>
    </View>
  );
}

function AppIcon({ app }: { app: ScreenUsageApp }) {
  if (app.iconDataUrl) {
    return <Image source={{ uri: app.iconDataUrl }} className="w-10 h-10 rounded-xl" />;
  }
  return (
    <View className="w-10 h-10 rounded-xl bg-[#66b9b9]/15 border border-[#66b9b9]/25 items-center justify-center">
      <Feather name="smartphone" size={18} color="#66B9B9" />
    </View>
  );
}

function AppDetailModal({
  app,
  range,
  onClose,
}: {
  app: ScreenUsageApp | null;
  range: RangeKey;
  onClose: () => void;
}) {
  const maxDaily = useMemo(
    () => Math.max(1, ...(app?.dailyUsage || []).map((day) => day.durationMs)),
    [app]
  );
  return (
    <Modal visible={Boolean(app)} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-[#061414]/85">
        <View className="bg-[#0B1F1F] border-t border-[#66b9b9]/35 rounded-t-[30px] px-5 pt-5 pb-8 max-h-[82%]">
          <View className="flex-row items-center mb-4">
            {app ? <AppIcon app={app} /> : null}
            <View className="flex-1 ml-3">
              <Text className="text-[#E8F4F4] text-lg font-black">{app?.appName}</Text>
              <Text className="text-[#9FB5B5] text-xs mt-0.5">
                {RANGE_OPTIONS.find((option) => option.key === range)?.label} usage
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close app usage details"
              onPress={onClose}
              className="px-4 py-2 rounded-full bg-[#123131] border border-[#337a7a]/35"
            >
              <Text className="text-[#66B9B9] font-black">Close</Text>
            </TouchableOpacity>
          </View>

          <View className="flex-row mb-5">
            <SummaryCard label="Usage" value={formatDuration(app?.durationMs || 0)} />
            <View className="w-2" />
            <SummaryCard label="Share" value={`${Math.round(app?.percentage || 0)}%`} />
          </View>

          <Text className="text-[#E8F4F4] font-black mb-3">Daily usage history</Text>
          {app?.dailyUsage?.map((day) => (
            <View key={day.date} className="mb-3">
              <View className="flex-row justify-between mb-1.5">
                <Text className="text-[#9FB5B5] text-xs font-bold">{formatDay(day.date)}</Text>
                <Text className="text-[#E8F4F4] text-xs font-black">{formatDuration(day.durationMs)}</Text>
              </View>
              <View className="h-2 rounded-full bg-[#061414]/75 overflow-hidden">
                <View
                  className="h-full rounded-full bg-[#66b9b9]"
                  style={{ width: `${Math.max(day.durationMs > 0 ? 4 : 0, day.durationMs / maxDaily * 100)}%` }}
                />
              </View>
            </View>
          ))}
          {!app?.dailyUsage?.length ? (
            <Text className="text-[#9FB5B5] text-sm">No daily history is available for this range.</Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.round(Number(milliseconds || 0) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function formatDay(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
