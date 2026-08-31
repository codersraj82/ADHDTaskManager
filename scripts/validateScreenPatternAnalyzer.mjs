import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../utils/screenPatternAnalyzer.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const analyzerModule = { exports: {} };
new Function("exports", "module", "require", compiled)(
  analyzerModule.exports,
  analyzerModule,
  require
);
const { analyzeScreenPatterns } = analyzerModule.exports;

const MINUTE = 60_000;
const at = (day, hour, minute = 0) => new Date(2026, 7, day, hour, minute).getTime();

function session({
  day,
  hour,
  minute = 0,
  durationMinutes,
  appName = "Mixed",
  packageName = "example.mixed",
  dominantShare = 0.2,
  warningEvents = [],
  endTime,
  completedNormally = true,
  endReason = "MEANINGFUL_BREAK",
  meaningfulBreakMinutes = 5,
}) {
  const startTime = at(day, hour, minute);
  const activeDurationMs = durationMinutes * MINUTE;
  return {
    schemaVersion: 2,
    active: false,
    sessionId: `session-${day}-${hour}-${minute}-${appName}`,
    startTime,
    endTime: endTime ?? startTime + activeDurationMs,
    activeDurationMs,
    elapsedSpanMs: activeDurationMs,
    pauseDurationMs: 0,
    thresholdsTriggered: warningEvents.map((event) => event.thresholdMinutes),
    warningCount: warningEvents.length,
    warningEvents,
    appUsageBreakdown: [
      {
        packageName,
        appName,
        durationMs: activeDurationMs * dominantShare,
      },
    ],
    topApp: {
      packageName,
      appName,
      durationMs: activeDurationMs * dominantShare,
    },
    sessionDateLocal: `2026-08-${String(day).padStart(2, "0")}`,
    meaningfulBreakMinutes,
    completedNormally,
    endReason,
  };
}

const eveningPattern = analyzeScreenPatterns([
  session({ day: 3, hour: 21, minute: 10, durationMinutes: 50 }),
  session({ day: 5, hour: 21, minute: 25, durationMinutes: 50 }),
  session({ day: 7, hour: 21, minute: 5, durationMinutes: 65 }),
  session({ day: 8, hour: 14, durationMinutes: 20 }),
]);
assert.ok(eveningPattern.insights.some((insight) => insight.type === "time_pattern"));

const insufficient = analyzeScreenPatterns([
  session({ day: 3, hour: 21, durationMinutes: 60 }),
]);
assert.equal(insufficient.insights.some((insight) => insight.type === "time_pattern"), false);

const commonApp = analyzeScreenPatterns([
  session({ day: 3, hour: 18, durationMinutes: 50, appName: "YouTube", packageName: "youtube", dominantShare: 0.7 }),
  session({ day: 4, hour: 18, durationMinutes: 55, appName: "YouTube", packageName: "youtube", dominantShare: 0.7 }),
  session({ day: 5, hour: 18, durationMinutes: 60, appName: "YouTube", packageName: "youtube", dominantShare: 0.7 }),
  session({ day: 6, hour: 18, durationMinutes: 50, appName: "Chrome", packageName: "chrome", dominantShare: 0.7 }),
]);
assert.ok(commonApp.insights.some((insight) => insight.type === "app_pattern"));

const mixedApps = analyzeScreenPatterns([
  session({ day: 3, hour: 18, durationMinutes: 50, appName: "App A", packageName: "a", dominantShare: 0.7 }),
  session({ day: 4, hour: 18, durationMinutes: 50, appName: "App B", packageName: "b", dominantShare: 0.7 }),
  session({ day: 5, hour: 18, durationMinutes: 50, appName: "App C", packageName: "c", dominantShare: 0.7 }),
  session({ day: 6, hour: 18, durationMinutes: 50, appName: "App D", packageName: "d", dominantShare: 0.7 }),
]);
assert.equal(mixedApps.insights.some((insight) => insight.type === "app_pattern"), false);

const warningSessions = Array.from({ length: 6 }, (_, index) => {
  const startTime = at(10 + index, 12);
  const warningAt = startTime + 45 * MINUTE;
  const actualBreak = index < 4;
  return session({
    day: 10 + index,
    hour: 12,
    durationMinutes: 46,
    warningEvents: [{ thresholdMinutes: 45, timestamp: warningAt, followUp: false }],
    endTime: actualBreak ? warningAt + MINUTE : warningAt + 10 * MINUTE,
  });
});
const breakPattern = analyzeScreenPatterns(warningSessions);
assert.equal(breakPattern.warningResponse.meaningfulBreakWithin10MinutesCount, 4);
assert.ok(breakPattern.insights.some((insight) => insight.type === "warning_break"));

const buttonOnlySessions = Array.from({ length: 4 }, (_, index) => {
  const startTime = at(20 + index, 12);
  return session({
    day: 20 + index,
    hour: 12,
    durationMinutes: 50,
    warningEvents: [{ thresholdMinutes: 45, timestamp: startTime + 45 * MINUTE, followUp: false }],
    completedNormally: false,
    endReason: "FEATURE_DISABLED",
  });
});
const buttonOnly = analyzeScreenPatterns(buttonOnlySessions);
assert.equal(buttonOnly.warningResponse.meaningfulBreakWithin10MinutesCount, 0);
assert.equal(buttonOnly.insights.some((insight) => insight.type === "warning_break"), false);

console.log("Screen pattern analyzer validation passed (6 scenarios).");
