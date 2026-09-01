import assert from "node:assert/strict";
import {
  BRAIN_DUMP_MAX_VIDEO_DURATION_SECONDS,
  formatBrainDumpDuration,
  getBrainDumpTaskPrefill,
  getBrainDumpTimeGroup,
  groupBrainDumpsByTime,
  isBrainDumpContentValid,
  isBrainDumpVideoDurationAllowed,
} from "../utils/brainDumpHelpers.mjs";

assert.equal(isBrainDumpContentValid({ text: "  call the office  " }), true);
assert.equal(isBrainDumpContentValid({ mediaUri: "file:///thought.jpg" }), true);
assert.equal(isBrainDumpContentValid({ text: "   ", mediaUri: "" }), false);

assert.deepEqual(getBrainDumpTaskPrefill({ text: "Call the office tomorrow" }), {
  title: "Call the office tomorrow",
  details: "",
});

const longThought =
  "Prepare the monthly cable report. Include the maintenance notes and ask Sam about the missing readings.";
assert.deepEqual(getBrainDumpTaskPrefill({ text: longThought }), {
  title: "Prepare the monthly cable report.",
  details: longThought,
});

assert.equal(formatBrainDumpDuration(65_000), "1:05");
assert.equal(
  isBrainDumpVideoDurationAllowed(BRAIN_DUMP_MAX_VIDEO_DURATION_SECONDS * 1000),
  true
);
assert.equal(
  isBrainDumpVideoDurationAllowed((BRAIN_DUMP_MAX_VIDEO_DURATION_SECONDS + 1) * 1000),
  false
);

const now = new Date("2026-09-01T18:00:00");
assert.equal(getBrainDumpTimeGroup("2026-09-01T10:00:00", now), "TODAY");
assert.equal(getBrainDumpTimeGroup("2026-08-31T10:00:00", now), "YESTERDAY");
assert.equal(getBrainDumpTimeGroup("2026-08-28T10:00:00", now), "THIS WEEK");
assert.equal(getBrainDumpTimeGroup("2026-08-01T10:00:00", now), "EARLIER");

assert.deepEqual(
  groupBrainDumpsByTime(
    [
      { id: 1, createdAt: "2026-09-01T10:00:00" },
      { id: 2, createdAt: "2026-08-31T10:00:00" },
    ],
    now
  ).map((section) => section.title),
  ["TODAY", "YESTERDAY"]
);

console.log("Brain Dump helper validation passed.");
