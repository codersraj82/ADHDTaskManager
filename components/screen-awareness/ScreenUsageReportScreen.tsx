import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ContinuousScreenSession,
  DailyScreenSessionSummary,
  getCurrentContinuousSession,
  getScreenUsageReport,
  openUsageAccessSettings,
  ScreenUsageApp,
  ScreenUsageReport,
} from "../../services/screenAwareness";
import ScreenAwarenessShell from "./ScreenAwarenessShell";
import ScreenPatternInsightsSection from "./ScreenPatternInsightsSection";

type RangeKey = "today" | "7days" | "30days";
type SessionFilter = "all" | "30" | "45" | "60";

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
  const [selectedSession, setSelectedSession] = useState<ContinuousScreenSession | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>("all");
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
  const [activeSession, setActiveSession] = useState<ContinuousScreenSession | null>(null);

  const loadReport = useCallback(async (nextRange: RangeKey) => {
    setLoading(true);
    const next = await getScreenUsageReport(nextRange);
    setReport(next);
    setActiveSession(next.continuousSessions?.activeSession || null);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      void loadReport(range);
      const poll = setInterval(() => {
        void getCurrentContinuousSession().then((session) => {
          if (mounted) setActiveSession(session);
        });
      }, 30_000);
      return () => {
        mounted = false;
        clearInterval(poll);
      };
    }, [loadReport, range])
  );

  const summary = report?.summary;
  const apps = report?.apps || [];
  const largestUsage = apps[0]?.durationMs || 1;
  const continuous = report?.continuousSessions;
  const filteredSessions = useMemo(() => {
    const minimumMinutes = sessionFilter === "all" ? 0 : Number(sessionFilter);
    return (continuous?.sessions || []).filter(
      (session) => session.activeDurationMs >= minimumMinutes * 60_000
    );
  }, [continuous?.sessions, sessionFilter]);
  const filteredDaily = useMemo(
    () => buildDailySummaries(filteredSessions),
    [filteredSessions]
  );

  const changeRange = (nextRange: RangeKey) => {
    if (nextRange === range) return;
    setRange(nextRange);
    setSelectedApp(null);
    setSelectedSession(null);
    setSelectedDay(null);
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
            Screen Awareness needs Android Usage Access to build continuous screen-session history. No messages or screen content are read.
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

          {continuous ? (
            <>
              <ContinuousSessionsSection
                range={range}
                activeSession={activeSession}
                sessions={filteredSessions}
                dailySummaries={filteredDaily}
                filter={sessionFilter}
                expandedDates={expandedDates}
                migrationMessage={continuous.migrationMessage}
                onFilterChange={setSessionFilter}
                onToggleDate={(date) =>
                  setExpandedDates((current) => ({ ...current, [date]: !current[date] }))
                }
                onSelectSession={setSelectedSession}
                onSelectDay={setSelectedDay}
              />
              <ScreenPatternInsightsSection
                enabled={continuous.insightsSettings?.patternInsightsEnabled ?? true}
                range={range}
                sessions={continuous.sessions}
                reEntrySupport={continuous.reEntrySupport}
              />
            </>
          ) : null}

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
      <SessionDetailModal session={selectedSession} onClose={() => setSelectedSession(null)} />
      <DaySessionModal
        date={selectedDay}
        sessions={filteredSessions.filter((session) => session.sessionDateLocal === selectedDay)}
        onClose={() => setSelectedDay(null)}
        onSelectSession={(session) => {
          setSelectedDay(null);
          setSelectedSession(session);
        }}
      />
    </ScreenAwarenessShell>
  );
}

function ContinuousSessionsSection({
  range,
  activeSession,
  sessions,
  dailySummaries,
  filter,
  expandedDates,
  migrationMessage,
  onFilterChange,
  onToggleDate,
  onSelectSession,
  onSelectDay,
}: {
  range: RangeKey;
  activeSession: ContinuousScreenSession | null;
  sessions: ContinuousScreenSession[];
  dailySummaries: DailyScreenSessionSummary[];
  filter: SessionFilter;
  expandedDates: Record<string, boolean>;
  migrationMessage: string;
  onFilterChange: (filter: SessionFilter) => void;
  onToggleDate: (date: string) => void;
  onSelectSession: (session: ContinuousScreenSession) => void;
  onSelectDay: (date: string) => void;
}) {
  const durations = sessions.map((session) => session.activeDurationMs);
  const longest = Math.max(0, ...durations);
  const average = durations.length
    ? durations.reduce((total, value) => total + value, 0) / durations.length
    : 0;
  const over45 = durations.filter((duration) => duration >= 45 * 60_000).length;

  return (
    <View className="mb-6">
      <View className="flex-row items-end justify-between mb-3">
        <View className="flex-1 pr-3">
          <Text className="text-[#E8F4F4] text-lg font-black">Continuous Screen Sessions</Text>
          <Text className="text-[#9FB5B5] text-xs leading-5 mt-1">
            Short locks pause a session; a meaningful break ends it.
          </Text>
        </View>
        <Text className="text-[#66B9B9] text-[10px] font-black uppercase tracking-widest">
          30 days
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
        {([
          ["all", "All"],
          ["30", "30+ min"],
          ["45", "45+ min"],
          ["60", "60+ min"],
        ] as [SessionFilter, string][]).map(([key, label]) => {
          const selected = filter === key;
          return (
            <TouchableOpacity
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onFilterChange(key)}
              activeOpacity={0.84}
              className={`min-h-11 px-4 mr-2 rounded-full border items-center justify-center ${
                selected
                  ? "bg-[#66b9b9] border-[#66b9b9]"
                  : "bg-[#123131]/55 border-[#337a7a]/40"
              }`}
            >
              <Text className={`text-xs font-black ${selected ? "text-[#061414]" : "text-[#9FB5B5]"}`}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {activeSession ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Open active screen session details"
          activeOpacity={0.84}
          onPress={() => onSelectSession(activeSession)}
          className="bg-[#163838]/85 border border-[#66b9b9]/55 rounded-3xl p-4 mb-3"
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <View className="w-2.5 h-2.5 rounded-full bg-[#7DFFB3] mr-2" />
              <Text className="text-[#7DFFB3] text-xs font-black uppercase tracking-widest">
                Active now
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color="#66B9B9" />
          </View>
          <Text className="text-[#E8F4F4] text-base font-black mt-3">
            {formatSessionClock(activeSession.startTime)} — Now
          </Text>
          <Text className="text-[#66B9B9] text-2xl font-black mt-1">
            {formatDuration(activeSession.activeDurationMs)} active
          </Text>
          <Text className="text-[#9FB5B5] text-xs mt-2">
            {activeSession.currentForegroundApp?.appName || activeSession.topApp?.appName || "Other"}
            {activeSession.screenInteractive === false ? " · Screen paused" : " · On screen"}
          </Text>
        </TouchableOpacity>
      ) : null}

      <View className="flex-row mb-2">
        <MiniMetric label="Sessions" value={String(sessions.length)} />
        <View className="w-2" />
        <MiniMetric label="Average" value={formatDuration(average)} />
      </View>
      <View className="flex-row mb-3">
        <MiniMetric label="Longest" value={formatDuration(longest)} />
        <View className="w-2" />
        <MiniMetric label="45+ min" value={String(over45)} />
      </View>

      {range !== "today" && dailySummaries.length ? (
        <DailyTrend summaries={dailySummaries} />
      ) : null}

      {!sessions.length ? (
        <View className="bg-[#123131]/50 border border-[#337a7a]/25 rounded-3xl p-5">
          <Text className="text-[#E8F4F4] font-black">
            {filter === "all" ? "No completed screen sessions yet." : "No sessions match this filter."}
          </Text>
          <Text className="text-[#9FB5B5] text-sm leading-6 mt-2">
            {filter === "all"
              ? "Continuous sessions will appear here after Screen Awareness detects a meaningful screen break."
              : "Try a shorter duration filter to see more sessions."}
          </Text>
          <Text className="text-[#6F9292] text-xs leading-5 mt-3">{migrationMessage}</Text>
        </View>
      ) : null}

      {range === "today"
        ? sessions.map((session) => (
            <SessionRow
              key={session.sessionId}
              session={session}
              maxDuration={longest}
              onPress={() => onSelectSession(session)}
            />
          ))
        : null}

      {range === "7days"
        ? dailySummaries.map((day) => {
            const expanded = Boolean(expandedDates[day.date]);
            const daySessions = sessions.filter((session) => session.sessionDateLocal === day.date);
            return (
              <View
                key={day.date}
                className="bg-[#123131]/45 border border-[#337a7a]/25 rounded-3xl mb-3 overflow-hidden"
              >
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  activeOpacity={0.84}
                  onPress={() => onToggleDate(day.date)}
                  className="min-h-14 px-4 py-3 flex-row items-center"
                >
                  <View className="flex-1">
                    <Text className="text-[#E8F4F4] font-black">{formatDay(day.date)}</Text>
                    <Text className="text-[#9FB5B5] text-xs mt-1">
                      {day.sessionCount} {day.sessionCount === 1 ? "session" : "sessions"} · {formatDuration(day.totalDurationMs)} active · Longest {formatDuration(day.longestDurationMs)}
                    </Text>
                  </View>
                  <Feather name={expanded ? "chevron-up" : "chevron-down"} size={18} color="#66B9B9" />
                </TouchableOpacity>
                {expanded ? (
                  <View className="px-3 pb-1">
                    {daySessions.map((session) => (
                      <SessionRow
                        key={session.sessionId}
                        session={session}
                        maxDuration={longest}
                        onPress={() => onSelectSession(session)}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })
        : null}

      {range === "30days"
        ? dailySummaries.map((day) => (
            <TouchableOpacity
              key={day.date}
              accessibilityRole="button"
              accessibilityLabel={`Open sessions for ${formatDay(day.date)}`}
              activeOpacity={0.84}
              onPress={() => onSelectDay(day.date)}
              className="bg-[#123131]/55 border border-[#337a7a]/30 rounded-2xl p-4 mb-3"
            >
              <View className="flex-row items-center">
                <View className="flex-1">
                  <Text className="text-[#E8F4F4] font-black">{formatDay(day.date)}</Text>
                  <Text className="text-[#9FB5B5] text-xs mt-1">
                    {day.sessionCount} {day.sessionCount === 1 ? "session" : "sessions"} · {formatDuration(day.totalDurationMs)} active
                  </Text>
                </View>
                <View className="items-end mr-2">
                  <Text className="text-[#66B9B9] text-xs font-black">Longest</Text>
                  <Text className="text-[#E8F4F4] text-sm font-black mt-0.5">
                    {formatDuration(day.longestDurationMs)}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color="#66B9B9" />
              </View>
            </TouchableOpacity>
          ))
        : null}

      {sessions.length ? (
        <View className="bg-[#061414]/60 border border-[#337a7a]/20 rounded-2xl p-4 mt-1">
          <Text className="text-[#66B9B9] text-[10px] font-black uppercase tracking-widest">
            Pattern
          </Text>
          <Text className="text-[#9FB5B5] text-xs leading-5 mt-2">
            Your longest session in this view was {formatDuration(longest)}. {over45} {over45 === 1 ? "session lasted" : "sessions lasted"} 45 minutes or longer.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 bg-[#061414]/60 border border-[#337a7a]/20 rounded-2xl px-3 py-3">
      <Text className="text-[#9FB5B5] text-[9px] font-black uppercase tracking-widest">{label}</Text>
      <Text className="text-[#E8F4F4] text-base font-black mt-1">{value}</Text>
    </View>
  );
}

function SessionRow({
  session,
  maxDuration,
  onPress,
}: {
  session: ContinuousScreenSession;
  maxDuration: number;
  onPress: () => void;
}) {
  const appCount = session.appUsageBreakdown?.length || 0;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Open screen session from ${formatSessionClock(session.startTime)}`}
      activeOpacity={0.84}
      onPress={onPress}
      className="bg-[#123131]/60 border border-[#337a7a]/30 rounded-2xl p-4 mb-3"
    >
      <View className="flex-row items-center">
        <View className="flex-1">
          <Text className="text-[#E8F4F4] font-black">
            {formatSessionClock(session.startTime)} — {formatSessionClock(session.endTime || session.startTime)}
          </Text>
          <Text className="text-[#66B9B9] text-sm font-black mt-1">
            {formatDuration(session.activeDurationMs)} active
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color="#66B9B9" />
      </View>
      <Text className="text-[#9FB5B5] text-xs mt-2">
        {session.topApp?.appName || "Other"}
        {session.topApp?.durationMs ? ` · ${formatDuration(session.topApp.durationMs)}` : ""}
        {` · ${appCount} ${appCount === 1 ? "app" : "apps"}`}
        {session.pauseDurationMs > 0 ? ` · ${formatDuration(session.pauseDurationMs)} paused` : ""}
      </Text>
      <View className="h-2 rounded-full bg-[#061414]/75 overflow-hidden mt-3">
        <View
          className="h-full rounded-full bg-[#66b9b9]"
          style={{ width: `${Math.max(4, maxDuration ? session.activeDurationMs / maxDuration * 100 : 0)}%` }}
        />
      </View>
    </TouchableOpacity>
  );
}

function DailyTrend({ summaries }: { summaries: DailyScreenSessionSummary[] }) {
  const chronological = [...summaries].reverse();
  const maxAverage = Math.max(1, ...chronological.map((day) => day.averageDurationMs));
  return (
    <View className="bg-[#123131]/45 border border-[#337a7a]/25 rounded-2xl p-4 mb-3">
      <Text className="text-[#E8F4F4] text-sm font-black mb-3">Average session trend</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View
          className="h-20 flex-row items-end"
          style={{ width: Math.max(280, chronological.length * 28) }}
        >
          {chronological.map((day) => (
            <View key={day.date} className="flex-1 items-center mx-0.5">
              <View
                className="w-full max-w-5 rounded-t-md bg-[#66b9b9]"
                style={{ height: Math.max(3, day.averageDurationMs / maxAverage * 58) }}
              />
              <Text className="text-[#6F9292] text-[8px] font-bold mt-1" numberOfLines={1}>
                {formatShortDay(day.date)}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function SessionDetailModal({
  session,
  onClose,
}: {
  session: ContinuousScreenSession | null;
  onClose: () => void;
}) {
  const maxAppDuration = Math.max(
    1,
    ...(session?.appUsageBreakdown || []).map((app) => app.durationMs)
  );
  return (
    <Modal visible={Boolean(session)} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-[#061414]/85">
        <View className="bg-[#0B1F1F] border-t border-[#66b9b9]/35 rounded-t-[30px] max-h-[88%]">
          <View className="flex-row items-center px-5 pt-5 pb-3">
            <View className="flex-1">
              <Text className="text-[#E8F4F4] text-lg font-black">
                {session?.active ? "Active screen session" : "Screen session details"}
              </Text>
              <Text className="text-[#9FB5B5] text-xs mt-1">
                {session ? formatDay(session.sessionDateLocal) : ""}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close screen session details"
              onPress={onClose}
              className="min-h-11 px-4 rounded-full bg-[#123131] border border-[#337a7a]/35 items-center justify-center"
            >
              <Text className="text-[#66B9B9] font-black">Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
            <Text className="text-[#E8F4F4] text-base font-black mt-2">
              {session ? formatSessionClock(session.startTime) : ""} — {session?.active ? "Now" : formatSessionClock(session?.endTime || 0)}
            </Text>
            <View className="flex-row mt-4">
              <MiniMetric label="Active" value={formatDuration(session?.activeDurationMs || 0)} />
              <View className="w-2" />
              <MiniMetric label="Elapsed" value={formatDuration(session?.elapsedSpanMs || 0)} />
            </View>
            {(session?.pauseDurationMs || 0) > 0 ? (
              <Text className="text-[#9FB5B5] text-xs mt-3">
                Includes {formatDuration(session?.pauseDurationMs || 0)} of short screen-off pauses.
              </Text>
            ) : null}

            <Text className="text-[#E8F4F4] font-black mt-5 mb-3">Apps during this session</Text>
            {session?.appUsageBreakdown?.map((app) => (
              <View key={app.packageName} className="mb-3">
                <View className="flex-row justify-between mb-1.5">
                  <Text className="text-[#9FB5B5] text-xs font-bold flex-1 pr-3" numberOfLines={1}>
                    {app.appName}
                  </Text>
                  <Text className="text-[#E8F4F4] text-xs font-black">
                    {formatDuration(app.durationMs)}
                  </Text>
                </View>
                <View className="h-2 rounded-full bg-[#061414]/75 overflow-hidden">
                  <View
                    className="h-full rounded-full bg-[#66b9b9]"
                    style={{ width: `${Math.max(3, app.durationMs / maxAppDuration * 100)}%` }}
                  />
                </View>
              </View>
            ))}
            {!session?.appUsageBreakdown?.length ? (
              <Text className="text-[#9FB5B5] text-sm">App-level time is not available for this session.</Text>
            ) : null}

            <Text className="text-[#E8F4F4] font-black mt-4 mb-2">Awareness reminders</Text>
            {session?.thresholdsTriggered?.length ? (
              <Text className="text-[#9FB5B5] text-sm leading-6">
                Fired at {[...session.thresholdsTriggered].sort((a, b) => a - b).map((value) => `${value} min`).join(", ")}.
                {session.warningCount > session.thresholdsTriggered.length
                  ? ` ${session.warningCount - session.thresholdsTriggered.length} snooze follow-up reminder${session.warningCount - session.thresholdsTriggered.length === 1 ? "" : "s"}.`
                  : ""}
              </Text>
            ) : (
              <Text className="text-[#9FB5B5] text-sm">No awareness reminders fired.</Text>
            )}

            <View className="bg-[#123131]/55 border border-[#337a7a]/25 rounded-2xl p-4 mt-5">
              <Text className="text-[#E8F4F4] text-sm font-black">
                {session ? sessionEndCopy(session) : ""}
              </Text>
              {!session?.active ? (
                <Text className="text-[#9FB5B5] text-xs leading-5 mt-2">
                  A meaningful break is {session?.meaningfulBreakMinutes || 5} minutes with the screen off.
                </Text>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DaySessionModal({
  date,
  sessions,
  onClose,
  onSelectSession,
}: {
  date: string | null;
  sessions: ContinuousScreenSession[];
  onClose: () => void;
  onSelectSession: (session: ContinuousScreenSession) => void;
}) {
  const longest = Math.max(0, ...sessions.map((session) => session.activeDurationMs));
  return (
    <Modal visible={Boolean(date)} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-[#061414]/85">
        <View className="bg-[#0B1F1F] border-t border-[#66b9b9]/35 rounded-t-[30px] max-h-[82%] px-5 pt-5 pb-7">
          <View className="flex-row items-center mb-4">
            <View className="flex-1">
              <Text className="text-[#E8F4F4] text-lg font-black">{date ? formatDay(date) : ""}</Text>
              <Text className="text-[#9FB5B5] text-xs mt-1">
                {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close day session details"
              onPress={onClose}
              className="min-h-11 px-4 rounded-full bg-[#123131] border border-[#337a7a]/35 items-center justify-center"
            >
              <Text className="text-[#66B9B9] font-black">Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView>
            {sessions.map((session) => (
              <SessionRow
                key={session.sessionId}
                session={session}
                maxDuration={longest}
                onPress={() => onSelectSession(session)}
              />
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
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
  if (milliseconds > 0 && totalMinutes === 0) return "<1m";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function formatDay(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatShortDay(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
}

function formatSessionClock(timestamp: number): string {
  const date = new Date(timestamp);
  if (!timestamp || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function buildDailySummaries(
  sessions: ContinuousScreenSession[]
): DailyScreenSessionSummary[] {
  const grouped = new Map<string, ContinuousScreenSession[]>();
  sessions.forEach((session) => {
    const current = grouped.get(session.sessionDateLocal) || [];
    current.push(session);
    grouped.set(session.sessionDateLocal, current);
  });
  return [...grouped.entries()]
    .map(([date, daySessions]) => {
      const durations = daySessions.map((session) => session.activeDurationMs);
      const totalDurationMs = durations.reduce((total, value) => total + value, 0);
      return {
        date,
        sessionCount: daySessions.length,
        totalDurationMs,
        averageDurationMs: durations.length ? totalDurationMs / durations.length : 0,
        longestDurationMs: Math.max(0, ...durations),
        over30Count: durations.filter((value) => value >= 30 * 60_000).length,
        over45Count: durations.filter((value) => value >= 45 * 60_000).length,
        over60Count: durations.filter((value) => value >= 60 * 60_000).length,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function sessionEndCopy(session: ContinuousScreenSession): string {
  if (session.active) return "This session is still active.";
  if (session.endReason === "FEATURE_DISABLED") {
    return "This session ended when Screen Awareness was turned off.";
  }
  if (session.endReason === "DEVICE_REBOOT") {
    return "This session ended safely during a device restart.";
  }
  return "This session ended after a meaningful screen-off break.";
}
