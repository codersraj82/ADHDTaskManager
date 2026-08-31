import { Feather } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";
import type {
  ContinuousScreenSession,
  ScreenReEntrySummary,
} from "../../services/screenAwareness";
import {
  analyzeScreenPatterns,
  ScreenInsight,
} from "../../utils/screenPatternAnalyzer";

type Props = {
  enabled: boolean;
  range: "today" | "7days" | "30days";
  sessions: ContinuousScreenSession[];
  reEntrySupport?: ScreenReEntrySummary | null;
};

const RANGE_LABELS = {
  today: "Today",
  "7days": "Last 7 days",
  "30days": "Last 30 days",
};

export default function ScreenPatternInsightsSection({
  enabled,
  range,
  sessions,
  reEntrySupport,
}: Props) {
  const [explainedInsight, setExplainedInsight] = useState<ScreenInsight | null>(null);
  const analysis = useMemo(
    () => analyzeScreenPatterns(sessions, reEntrySupport),
    [reEntrySupport, sessions]
  );
  const nonEmptyBuckets = analysis.timeBuckets.filter((bucket) => bucket.sessionCount > 0);
  const reEntryTotal = reEntrySupport
    ? reEntrySupport.returnedToCurrentTask +
      reEntrySupport.usedHelpMeStart +
      reEntrySupport.usedQuickWin +
      reEntrySupport.usedEnergyMatch
    : 0;

  return (
    <View className="mb-6">
      <View className="flex-row items-end justify-between mb-3">
        <View className="flex-1 pr-3">
          <Text className="text-[#E8F4F4] text-lg font-black">Insights</Text>
          <Text className="text-[#9FB5B5] text-xs leading-5 mt-1">
            Local, explainable observations about when screen sessions happen.
          </Text>
        </View>
        <Text className="text-[#66B9B9] text-[10px] font-black uppercase tracking-widest">
          {RANGE_LABELS[range]}
        </Text>
      </View>

      {!enabled ? (
        <View className="bg-[#123131]/50 border border-[#337a7a]/25 rounded-3xl p-5">
          <Text className="text-[#E8F4F4] font-black">Screen pattern insights are off</Text>
          <Text className="text-[#9FB5B5] text-sm leading-6 mt-2">
            You can enable local pattern observations in Screen-Time Awareness settings.
          </Text>
        </View>
      ) : (
        <>
          <View className="flex-row mb-2">
            <InsightMetric label="30+ min" value={String(analysis.longSessions.over30Count)} />
            <View className="w-2" />
            <InsightMetric label="45+ min" value={String(analysis.longSessions.over45Count)} />
            <View className="w-2" />
            <InsightMetric label="60+ min" value={String(analysis.longSessions.over60Count)} />
          </View>

          <View className="bg-[#123131]/50 border border-[#337a7a]/25 rounded-2xl p-4 mb-3">
            <Text className="text-[#66B9B9] text-[10px] font-black uppercase tracking-widest">
              Screen session rhythm
            </Text>
            <Text className="text-[#E8F4F4] text-sm font-black mt-2">
              {analysis.rhythm.sessionCount} {analysis.rhythm.sessionCount === 1 ? "session" : "sessions"} · {formatDuration(analysis.rhythm.averageDurationMs)} average
            </Text>
            <Text className="text-[#9FB5B5] text-xs leading-5 mt-1">
              Longest {formatDuration(analysis.rhythm.longestDurationMs)} · {analysis.rhythm.meaningfulBreakCount} meaningful {analysis.rhythm.meaningfulBreakCount === 1 ? "break" : "breaks"}
              {analysis.rhythm.averageBreakMs !== null
                ? ` · ${formatDuration(analysis.rhythm.averageBreakMs)} average between sessions`
                : ""}
            </Text>
          </View>

          {nonEmptyBuckets.length ? (
            <View className="mb-3">
              <Text className="text-[#E8F4F4] text-sm font-black mb-2">Time of day</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {nonEmptyBuckets.map((bucket) => (
                  <View
                    key={bucket.key}
                    className="w-36 bg-[#061414]/60 border border-[#337a7a]/25 rounded-2xl p-3 mr-2"
                  >
                    <Text className="text-[#E8F4F4] text-xs font-black">{bucket.label}</Text>
                    <Text className="text-[#66B9B9] text-sm font-black mt-1">
                      {formatDuration(bucket.averageDurationMs)} avg
                    </Text>
                    <Text className="text-[#9FB5B5] text-[10px] mt-1">
                      {bucket.sessionCount} {bucket.sessionCount === 1 ? "session" : "sessions"} · {bucket.over45Count} at 45+
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {!analysis.hasEnoughPatternHistory || !analysis.insights.length ? (
            <View className="bg-[#123131]/50 border border-[#337a7a]/25 rounded-3xl p-5 mb-3">
              <Text className="text-[#E8F4F4] font-black">Your patterns will appear here</Text>
              <Text className="text-[#9FB5B5] text-sm leading-6 mt-2">
                Screen Awareness needs a few continuous sessions across different times before it can identify useful patterns.
              </Text>
              <Text className="text-[#66B9B9] text-xs leading-5 mt-3">
                Nothing is uploaded — analysis happens on this device.
              </Text>
            </View>
          ) : (
            <View className="mb-1">
              <Text className="text-[#E8F4F4] text-sm font-black mb-2">My screen patterns</Text>
              {analysis.insights.map((insight) => (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  onExplain={() => setExplainedInsight(insight)}
                />
              ))}
            </View>
          )}

          {reEntrySupport && (reEntryTotal > 0 || reEntrySupport.continuedIntentionally > 0) ? (
            <View className="bg-[#123131]/50 border border-[#337a7a]/25 rounded-2xl p-4 mt-2">
              <Text className="text-[#E8F4F4] text-sm font-black">Re-Entry Support</Text>
              <Text className="text-[#9FB5B5] text-xs mt-1 mb-3">
                Optional choices opened from longer-session check-ins.
              </Text>
              <ReEntryRow label="Returned to Current Task" value={reEntrySupport.returnedToCurrentTask} />
              <ReEntryRow label="Used Help Me Start" value={reEntrySupport.usedHelpMeStart} />
              <ReEntryRow label="Used Quick Win" value={reEntrySupport.usedQuickWin} />
              <ReEntryRow label="Used task matching" value={reEntrySupport.usedEnergyMatch} />
              <ReEntryRow label="Continued intentionally" value={reEntrySupport.continuedIntentionally} last />
            </View>
          ) : null}
        </>
      )}

      <InsightExplanationModal
        insight={explainedInsight}
        onClose={() => setExplainedInsight(null)}
      />
    </View>
  );
}

function InsightMetric({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 bg-[#061414]/60 border border-[#337a7a]/20 rounded-2xl px-3 py-3">
      <Text className="text-[#9FB5B5] text-[9px] font-black uppercase tracking-widest">{label}</Text>
      <Text className="text-[#66B9B9] text-lg font-black mt-1">{value}</Text>
    </View>
  );
}

function InsightCard({ insight, onExplain }: { insight: ScreenInsight; onExplain: () => void }) {
  return (
    <View className="bg-[#123131]/55 border border-[#337a7a]/30 rounded-2xl p-4 mb-3">
      <View className="flex-row items-center">
        <View className="w-9 h-9 rounded-xl bg-[#66b9b9]/15 items-center justify-center mr-3">
          <Feather name={iconForInsight(insight)} size={17} color="#66B9B9" />
        </View>
        <View className="flex-1">
          <Text className="text-[#E8F4F4] font-black">{insight.title}</Text>
          <Text className="text-[#66B9B9] text-[10px] font-bold mt-0.5">
            {confidenceCopy(insight.confidenceLevel)}
          </Text>
        </View>
      </View>
      <Text className="text-[#CDE7E7] text-sm leading-6 mt-3">{insight.description}</Text>
      <Text className="text-[#9FB5B5] text-xs font-bold mt-2">{insight.supportingMetric}</Text>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`Why am I seeing ${insight.title}`}
        activeOpacity={0.82}
        onPress={onExplain}
        className="self-start min-h-11 justify-center mt-1"
      >
        <Text className="text-[#66B9B9] text-xs font-black">Why this?</Text>
      </TouchableOpacity>
    </View>
  );
}

function ReEntryRow({ label, value, last = false }: { label: string; value: number; last?: boolean }) {
  return (
    <View className={`flex-row items-center justify-between py-2 ${last ? "" : "border-b border-[#337a7a]/15"}`}>
      <Text className="text-[#9FB5B5] text-xs font-bold flex-1 pr-3">{label}</Text>
      <Text className="text-[#E8F4F4] text-sm font-black">{value}</Text>
    </View>
  );
}

function InsightExplanationModal({
  insight,
  onClose,
}: {
  insight: ScreenInsight | null;
  onClose: () => void;
}) {
  return (
    <Modal visible={Boolean(insight)} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-center bg-[#061414]/90 px-5">
        <View className="bg-[#0B1F1F] border border-[#66b9b9]/35 rounded-[28px] p-5">
          <View className="flex-row items-start">
            <View className="flex-1 pr-3">
              <Text className="text-[#66B9B9] text-[10px] font-black uppercase tracking-widest">
                Why this?
              </Text>
              <Text className="text-[#E8F4F4] text-lg font-black mt-2">{insight?.title}</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close insight explanation"
              onPress={onClose}
              className="min-h-11 px-4 rounded-full bg-[#123131] border border-[#337a7a]/35 items-center justify-center"
            >
              <Text className="text-[#66B9B9] font-black">Close</Text>
            </TouchableOpacity>
          </View>
          <Text className="text-[#CDE7E7] text-sm leading-6 mt-4">{insight?.explanation}</Text>
          <View className="bg-[#061414]/60 rounded-2xl p-3 mt-4">
            <Text className="text-[#9FB5B5] text-xs font-bold">{insight?.supportingMetric}</Text>
          </View>
          <Text className="text-[#6F9292] text-xs leading-5 mt-4">
            This deterministic observation is calculated from locally stored continuous sessions. It is not a diagnosis or a score.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function iconForInsight(insight: ScreenInsight): keyof typeof Feather.glyphMap {
  if (insight.type === "app_pattern") return "smartphone";
  if (insight.type === "warning_break") return "pause-circle";
  if (insight.type === "re_entry") return "corner-up-left";
  if (insight.type === "time_pattern") return "clock";
  return "activity";
}

function confidenceCopy(confidence: ScreenInsight["confidenceLevel"]) {
  if (confidence === "strong") return "A clear repeated pattern";
  if (confidence === "repeated") return "A repeated pattern";
  return "A pattern may be forming";
}

function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.round(Number(milliseconds || 0) / 60_000));
  if (milliseconds > 0 && totalMinutes === 0) return "<1m";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}
