import type {
  ContinuousScreenSession,
  ScreenReEntrySummary,
} from "../services/screenAwareness";

export type ScreenInsightConfidence = "emerging" | "repeated" | "strong";

export type ScreenInsight = {
  id: string;
  type: "time_pattern" | "app_pattern" | "warning_break" | "re_entry" | "duration_comparison" | "session_rhythm";
  title: string;
  description: string;
  confidenceLevel: ScreenInsightConfidence;
  supportingMetric: string;
  explanation: string;
  priority: number;
};

export type ScreenTimeBucketKey =
  | "morning"
  | "afternoon"
  | "evening"
  | "late_evening"
  | "night";

export type ScreenTimeBucketSummary = {
  key: ScreenTimeBucketKey;
  label: string;
  sessionCount: number;
  averageDurationMs: number;
  longestDurationMs: number;
  over30Count: number;
  over45Count: number;
  over60Count: number;
};

export type ScreenPatternAnalysis = {
  insights: ScreenInsight[];
  timeBuckets: ScreenTimeBucketSummary[];
  longSessions: {
    over30Count: number;
    over45Count: number;
    over60Count: number;
  };
  rhythm: {
    sessionCount: number;
    averageDurationMs: number;
    longestDurationMs: number;
    meaningfulBreakCount: number;
    averageBreakMs: number | null;
  };
  warningResponse: {
    threshold45WarningCount: number;
    meaningfulBreakWithin10MinutesCount: number;
  };
  hasEnoughPatternHistory: boolean;
};

const MINUTE = 60_000;
const LONG_SESSION_MS = 45 * MINUTE;
const WARNING_BREAK_WINDOW_MS = 10 * MINUTE;

const BUCKETS: {
  key: ScreenTimeBucketKey;
  label: string;
  includes: (hour: number) => boolean;
}[] = [
  { key: "morning", label: "Morning", includes: (hour) => hour >= 5 && hour < 12 },
  { key: "afternoon", label: "Afternoon", includes: (hour) => hour >= 12 && hour < 17 },
  { key: "evening", label: "Evening", includes: (hour) => hour >= 17 && hour < 21 },
  { key: "late_evening", label: "Late evening", includes: (hour) => hour >= 21 },
  { key: "night", label: "Night", includes: (hour) => hour < 5 },
];

const average = (values: number[]) =>
  values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;

const confidenceFor = (
  occurrences: number,
  distinctDays: number,
  share: number
): ScreenInsightConfidence => {
  if (occurrences >= 5 && distinctDays >= 3 && share >= 0.7) return "strong";
  if (occurrences >= 5 || (occurrences >= 4 && distinctDays >= 3)) return "repeated";
  return "emerging";
};

const bucketFor = (timestamp: number) => {
  const hour = new Date(timestamp).getHours();
  return BUCKETS.find((bucket) => bucket.includes(hour)) || BUCKETS[4];
};

const localDateKey = (timestamp: number) => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatClock = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

const dominantAppFor = (session: ContinuousScreenSession) => {
  const top = session.topApp || [...(session.appUsageBreakdown || [])]
    .sort((a, b) => b.durationMs - a.durationMs)[0];
  if (!top || !session.activeDurationMs) return null;
  if (top.appName === "Other" || top.durationMs / session.activeDurationMs < 0.3) return null;
  return top;
};

const buildTimeBuckets = (
  sessions: ContinuousScreenSession[]
): ScreenTimeBucketSummary[] =>
  BUCKETS.map((bucket) => {
    const bucketSessions = sessions.filter(
      (session) => bucketFor(session.startTime).key === bucket.key
    );
    const durations = bucketSessions.map((session) => session.activeDurationMs);
    return {
      key: bucket.key,
      label: bucket.label,
      sessionCount: bucketSessions.length,
      averageDurationMs: average(durations),
      longestDurationMs: Math.max(0, ...durations),
      over30Count: durations.filter((duration) => duration >= 30 * MINUTE).length,
      over45Count: durations.filter((duration) => duration >= 45 * MINUTE).length,
      over60Count: durations.filter((duration) => duration >= 60 * MINUTE).length,
    };
  });

const getStartWindow = (timestamp: number) => {
  const date = new Date(timestamp);
  const minuteOfDay = date.getHours() * 60 + date.getMinutes();
  return Math.floor(minuteOfDay / 90);
};

const formatStartWindow = (slot: number, referenceTimestamp: number) => {
  const startMinutes = slot * 90;
  const endMinutes = Math.min(24 * 60 - 1, startMinutes + 89);
  const reference = new Date(referenceTimestamp);
  const start = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate(),
    Math.floor(startMinutes / 60),
    startMinutes % 60
  );
  const end = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate(),
    Math.floor(endMinutes / 60),
    endMinutes % 60
  );
  return `${formatClock(start.getTime())}–${formatClock(end.getTime())}`;
};

export function analyzeScreenPatterns(
  sessions: ContinuousScreenSession[],
  reEntrySupport?: ScreenReEntrySummary | null
): ScreenPatternAnalysis {
  const completed = (sessions || [])
    .filter((session) => !session.active && session.startTime > 0)
    .sort((a, b) => a.startTime - b.startTime);
  const durations = completed.map((session) => session.activeDurationMs);
  const longSessions = completed.filter(
    (session) => session.activeDurationMs >= LONG_SESSION_MS
  );
  const candidates: ScreenInsight[] = [];

  if (longSessions.length >= 3) {
    const byBucket = new Map<ScreenTimeBucketKey, ContinuousScreenSession[]>();
    const byWindow = new Map<number, ContinuousScreenSession[]>();
    longSessions.forEach((session) => {
      const bucket = bucketFor(session.startTime).key;
      byBucket.set(bucket, [...(byBucket.get(bucket) || []), session]);
      const window = getStartWindow(session.startTime);
      byWindow.set(window, [...(byWindow.get(window) || []), session]);
    });
    const leadingBucket = [...byBucket.entries()].sort(
      (a, b) => b[1].length - a[1].length
    )[0];
    const leadingWindow = [...byWindow.entries()].sort(
      (a, b) => b[1].length - a[1].length
    )[0];
    const bucketCount = leadingBucket?.[1].length || 0;
    const bucketShare = bucketCount / longSessions.length;
    const bucketDays = new Set(
      (leadingBucket?.[1] || []).map((session) => localDateKey(session.startTime))
    ).size;

    if (leadingBucket && bucketCount >= 3 && bucketShare >= 0.6 && bucketDays >= 2) {
      const label = BUCKETS.find((bucket) => bucket.key === leadingBucket[0])?.label || "Time";
      const windowCount = leadingWindow?.[1].length || 0;
      const windowShare = windowCount / longSessions.length;
      const windowDays = new Set(
        (leadingWindow?.[1] || []).map((session) => localDateKey(session.startTime))
      ).size;
      const hasRepeatedWindow =
        leadingWindow && windowCount >= 3 && windowShare >= 0.6 && windowDays >= 2;
      const description = hasRepeatedWindow
        ? `${windowCount} of your ${longSessions.length} sessions lasting 45 minutes or more started around ${formatStartWindow(leadingWindow[0], leadingWindow[1][0].startTime)}.`
        : `${bucketCount} of your ${longSessions.length} sessions lasting 45 minutes or more started in the ${label.toLowerCase()}.`;
      const metric = `${hasRepeatedWindow ? windowCount : bucketCount} of ${longSessions.length} longer sessions`;
      candidates.push({
        id: "long-session-time-pattern",
        type: "time_pattern",
        title: `${label} pattern`,
        description,
        confidenceLevel: confidenceFor(bucketCount, bucketDays, bucketShare),
        supportingMetric: metric,
        explanation: `${metric} shared the same ${hasRepeatedWindow ? "90-minute start window" : "time-of-day bucket"} across ${bucketDays} different days.`,
        priority: 1,
      });
    }
  }

  if (longSessions.length >= 3) {
    const dominantApps = longSessions
      .map((session) => ({ session, app: dominantAppFor(session) }))
      .filter(
        (entry): entry is {
          session: ContinuousScreenSession;
          app: NonNullable<ReturnType<typeof dominantAppFor>>;
        } => Boolean(entry.app)
      );
    const appGroups = new Map<string, typeof dominantApps>();
    dominantApps.forEach((entry) => {
      const key = `${entry.app.packageName}:${entry.app.appName}`;
      appGroups.set(key, [...(appGroups.get(key) || []), entry]);
    });
    const leading = [...appGroups.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    const appCount = leading?.[1].length || 0;
    const share = appCount / longSessions.length;
    if (leading && appCount >= 3 && share >= 0.5) {
      const appName = leading[1][0].app.appName;
      const appDays = new Set(
        leading[1].map(({ session }) => localDateKey(session.startTime))
      ).size;
      const averageDominantSessionMinutes = Math.round(
        average(leading[1].map(({ session }) => session.activeDurationMs)) / MINUTE
      );
      candidates.push({
        id: `long-session-app-${leading[1][0].app.packageName}`,
        type: "app_pattern",
        title: "Common app",
        description: `${appName} was the dominant app in ${appCount} of your ${longSessions.length} longer sessions.`,
        confidenceLevel: confidenceFor(appCount, appDays, share),
        supportingMetric: `${appCount} of ${longSessions.length} longer sessions · ${averageDominantSessionMinutes} min average`,
        explanation: `An app counts as dominant only when it has the largest foreground duration and at least 30% of that session's active time. Those ${appCount} sessions averaged ${averageDominantSessionMinutes} minutes.`,
        priority: 2,
      });
    }
  }

  const threshold45Warnings = completed.flatMap((session) =>
    (session.warningEvents || [])
      .filter((event) => event.thresholdMinutes === 45 && !event.followUp)
      .map((event) => ({ session, event }))
  );
  const warningBreaks = threshold45Warnings.filter(({ session, event }) => {
    if (
      !session.completedNormally ||
      session.endReason !== "MEANINGFUL_BREAK" ||
      !session.endTime
    ) return false;
    const meaningfulBreakMs = Math.max(1, session.meaningfulBreakMinutes || 5) * MINUTE;
    const breakConfirmedAt = session.endTime + meaningfulBreakMs;
    const delay = breakConfirmedAt - event.timestamp;
    return delay >= 0 && delay <= WARNING_BREAK_WINDOW_MS;
  }).length;
  if (threshold45Warnings.length >= 4 && warningBreaks / threshold45Warnings.length >= 0.5) {
    candidates.push({
      id: "warning-break-response",
      type: "warning_break",
      title: "Screen-break pattern",
      description: `The 45-minute reminder was followed by a meaningful screen break in ${warningBreaks} of ${threshold45Warnings.length} recent sessions.`,
      confidenceLevel: confidenceFor(
        warningBreaks,
        new Set(threshold45Warnings.map(({ session }) => session.sessionDateLocal)).size,
        warningBreaks / threshold45Warnings.length
      ),
      supportingMetric: `${warningBreaks} actual breaks after ${threshold45Warnings.length} reminders`,
      explanation: "A response counts only when the screen became inactive and reached the configured meaningful-break duration within 10 minutes of the reminder.",
      priority: 3,
    });
  }

  const reEntryCount = reEntrySupport
    ? reEntrySupport.returnedToCurrentTask +
      reEntrySupport.usedHelpMeStart +
      reEntrySupport.usedQuickWin +
      reEntrySupport.usedEnergyMatch
    : 0;
  if (reEntrySupport && reEntryCount >= 3) {
    candidates.push({
      id: "re-entry-support-use",
      type: "re_entry",
      title: "Re-entry support",
      description: `You used a Screen Awareness check-in to open a task or task suggestion ${reEntryCount} times.`,
      confidenceLevel: reEntryCount >= 5 ? "repeated" : "emerging",
      supportingMetric: `${reEntryCount} re-entry actions opened`,
      explanation: "This counts Return to Current Task, Help Me Start, Quick Win, and Energy Matching actions that the Task Manager successfully received.",
      priority: 4,
    });
  }

  const morningSessions = completed.filter(
    (session) => bucketFor(session.startTime).key === "morning"
  );
  const laterSessions = completed.filter((session) =>
    ["evening", "late_evening"].includes(bucketFor(session.startTime).key)
  );
  const morningAverage = average(morningSessions.map((session) => session.activeDurationMs));
  const laterAverage = average(laterSessions.map((session) => session.activeDurationMs));
  if (
    morningSessions.length >= 3 &&
    laterSessions.length >= 3 &&
    laterAverage >= morningAverage + 15 * MINUTE
  ) {
    candidates.push({
      id: "morning-evening-duration-comparison",
      type: "duration_comparison",
      title: "Session timing",
      description: "Your evening screen sessions tended to run longer than your morning sessions in this period.",
      confidenceLevel: "repeated",
      supportingMetric: `${Math.round(morningAverage / MINUTE)} min morning · ${Math.round(laterAverage / MINUTE)} min evening`,
      explanation: `This comparison uses ${morningSessions.length} morning sessions and ${laterSessions.length} evening or late-evening sessions. The averages differ by at least 15 minutes.`,
      priority: 5,
    });
  }

  const under30Count = completed.filter(
    (session) => session.activeDurationMs < 30 * MINUTE
  ).length;
  if (completed.length >= 3 && under30Count / completed.length >= 0.6) {
    candidates.push({
      id: "mostly-under-thirty",
      type: "session_rhythm",
      title: "Session rhythm",
      description: `Most sessions in this view were under 30 minutes.`,
      confidenceLevel: completed.length >= 5 ? "repeated" : "emerging",
      supportingMetric: `${under30Count} of ${completed.length} sessions`,
      explanation: "This is a descriptive duration count, not a goal or a judgment about how the phone was used.",
      priority: 6,
    });
  }

  const gaps = completed.slice(1).map((session, index) => {
    const previous = completed[index];
    return session.startTime - (previous.endTime || previous.startTime);
  }).filter((gap) => gap >= 0 && gap <= 24 * 60 * MINUTE);

  return {
    insights: candidates.sort((a, b) => a.priority - b.priority).slice(0, 5),
    timeBuckets: buildTimeBuckets(completed),
    longSessions: {
      over30Count: durations.filter((duration) => duration >= 30 * MINUTE).length,
      over45Count: longSessions.length,
      over60Count: durations.filter((duration) => duration >= 60 * MINUTE).length,
    },
    rhythm: {
      sessionCount: completed.length,
      averageDurationMs: average(durations),
      longestDurationMs: Math.max(0, ...durations),
      meaningfulBreakCount: completed.filter(
        (session) => session.completedNormally && session.endReason === "MEANINGFUL_BREAK"
      ).length,
      averageBreakMs: gaps.length ? average(gaps) : null,
    },
    warningResponse: {
      threshold45WarningCount: threshold45Warnings.length,
      meaningfulBreakWithin10MinutesCount: warningBreaks,
    },
    hasEnoughPatternHistory: completed.length >= 3,
  };
}
