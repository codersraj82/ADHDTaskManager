import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseStoredDateTime } from "../utils/formatDateTime.js";
import {
  CUSTOM_REPEAT_UNITS,
  REPEAT_TYPES,
  normalizeTaskRepeatSettings,
  validateCustomRepeat,
} from "../utils/repeatTaskHelpers.js";
import {
  buildNextRecurringTask,
  getNextRecurringDate,
} from "../utils/repeatTaskGenerator.js";
import { formatRepeatLabel } from "../utils/repeatLabelFormatter.js";

const makeDate = (year, monthIndex, day, hour = 9, minute = 0) =>
  new Date(year, monthIndex, day, hour, minute, 0, 0);

const task = (repeatType, scheduledTime, extra = {}) => ({
  id: 1,
  title: "Recurring task",
  repeatType,
  scheduledTime,
  repeatDays: [],
  repeatMonthlyType: "",
  repeatCustomDate: "",
  repeatYearlyDate: "",
  repeatInterval: 0,
  repeatUnit: "",
  ...extra,
});

const assertDate = (actual, expected, message) => {
  assert.ok(actual instanceof Date && !Number.isNaN(actual.getTime()), message);
  assert.deepEqual(
    [
      actual.getFullYear(),
      actual.getMonth(),
      actual.getDate(),
      actual.getHours(),
      actual.getMinutes(),
    ],
    expected,
    message
  );
};

assert.deepEqual(CUSTOM_REPEAT_UNITS, [
  "minutes",
  "hours",
  "days",
  "weeks",
  "months",
  "years",
]);

for (const interval of [0, 1, 2, 3, 4]) {
  const result = validateCustomRepeat(interval, "minutes");
  assert.equal(result.valid, false);
  assert.equal(result.message, "Minimum custom repeat interval is 5 minutes.");
}
for (const interval of [5, 6, 10, 15, 30, 60]) {
  assert.equal(validateCustomRepeat(interval, "minutes").valid, true);
}

for (const unit of ["hours", "days", "weeks", "months", "years"]) {
  for (const interval of [0, 1]) {
    const result = validateCustomRepeat(interval, unit);
    assert.equal(result.valid, false);
    assert.equal(
      result.message,
      `Minimum custom repeat interval is 2 ${unit}.`
    );
  }
  for (const interval of [2, 3, 6, 12]) {
    assert.equal(validateCustomRepeat(interval, unit).valid, true);
  }
}

for (const invalidValue of ["", -1, -5, 1.5, 2.5, "abc", "12abc", "!@#"]) {
  assert.equal(validateCustomRepeat(invalidValue, "minutes").valid, false);
}
assert.equal(validateCustomRepeat(100001, "days").valid, false);
assert.equal(validateCustomRepeat(5, "invalid").valid, false);

const customCases = [
  {
    unit: "minutes",
    interval: 5,
    base: makeDate(2026, 8, 12, 10, 0),
    expected: [2026, 8, 12, 10, 5],
  },
  {
    unit: "hours",
    interval: 3,
    base: makeDate(2026, 8, 12, 10, 0),
    expected: [2026, 8, 12, 13, 0],
  },
  {
    unit: "days",
    interval: 2,
    base: makeDate(2026, 8, 12, 8, 0),
    expected: [2026, 8, 14, 8, 0],
  },
  {
    unit: "weeks",
    interval: 3,
    base: makeDate(2026, 8, 12, 18, 30),
    expected: [2026, 9, 3, 18, 30],
  },
  {
    unit: "months",
    interval: 2,
    base: makeDate(2026, 8, 12, 9, 0),
    expected: [2026, 10, 12, 9, 0],
  },
  {
    unit: "years",
    interval: 2,
    base: makeDate(2026, 8, 12, 9, 0),
    expected: [2028, 8, 12, 9, 0],
  },
];

customCases.forEach(({ unit, interval, base, expected }) => {
  const next = getNextRecurringDate(
    task(REPEAT_TYPES.CUSTOM, base, {
      repeatInterval: interval,
      repeatUnit: unit,
    }),
    base
  );
  assertDate(next, expected, `Custom ${unit} recurrence`);
});

const january31Task = task(REPEAT_TYPES.CUSTOM, makeDate(2027, 0, 31, 8, 15), {
  repeatInterval: 2,
  repeatUnit: "months",
});
const marchTask = buildNextRecurringTask(
  january31Task,
  makeDate(2027, 0, 31, 8, 15)
);
assert.equal(marchTask.repeatCustomDate, "2027-01-31 08:15 AM");
assertDate(
  getNextRecurringDate(january31Task, makeDate(2027, 0, 31, 8, 15)),
  [2027, 2, 31, 8, 15],
  "January month-end"
);
assertDate(
  getNextRecurringDate(marchTask, makeDate(2027, 2, 31, 8, 15)),
  [2027, 4, 31, 8, 15],
  "Month-end anchor survives generated occurrences"
);

let clampedMonthTask = task(REPEAT_TYPES.CUSTOM, makeDate(2026, 11, 31), {
  repeatInterval: 2,
  repeatUnit: "months",
});
for (const expected of [
  [2027, 1, 28, 9, 0],
  [2027, 3, 30, 9, 0],
  [2027, 5, 30, 9, 0],
  [2027, 7, 31, 9, 0],
]) {
  clampedMonthTask = buildNextRecurringTask(
    clampedMonthTask,
    parseStoredDateTime(clampedMonthTask.scheduledTime)
  );
  assertDate(
    parseStoredDateTime(clampedMonthTask.scheduledTime),
    expected,
    "Original day returns after shorter months"
  );
}

const leapTask = task(REPEAT_TYPES.CUSTOM, makeDate(2028, 1, 29, 7, 30), {
  repeatInterval: 2,
  repeatUnit: "years",
});
const nonLeapTask = buildNextRecurringTask(
  leapTask,
  makeDate(2028, 1, 29, 7, 30)
);
assert.equal(nonLeapTask.repeatYearlyDate, "2028-02-29 07:30 AM");
assertDate(
  getNextRecurringDate(leapTask, makeDate(2028, 1, 29, 7, 30)),
  [2030, 1, 28, 7, 30],
  "Leap-day fallback"
);
assertDate(
  getNextRecurringDate(nonLeapTask, makeDate(2030, 1, 28, 7, 30)),
  [2032, 1, 29, 7, 30],
  "Leap-day anchor survives generated occurrences"
);

for (const [base, expected] of [
  [makeDate(2028, 1, 29, 9, 0), [2028, 3, 29, 9, 0]],
  [makeDate(2026, 3, 30, 9, 0), [2026, 5, 30, 9, 0]],
  [makeDate(2026, 7, 31, 9, 0), [2026, 9, 31, 9, 0]],
  [makeDate(2026, 11, 31, 9, 0), [2027, 1, 28, 9, 0]],
]) {
  assertDate(
    getNextRecurringDate(
      task(REPEAT_TYPES.CUSTOM, base, {
        repeatInterval: 2,
        repeatUnit: "months",
      }),
      base
    ),
    expected,
    "Calendar-aware custom months"
  );
}

assertDate(
  getNextRecurringDate(
    task(REPEAT_TYPES.CUSTOM, makeDate(2026, 0, 1, 10, 0), {
      repeatInterval: 5,
      repeatUnit: "minutes",
    }),
    makeDate(2026, 8, 12, 10, 0)
  ),
  [2026, 8, 12, 10, 5],
  "Minute catch-up skips old occurrences without a long loop"
);

const existingRepeatCases = [
  [
    task(REPEAT_TYPES.DAILY, makeDate(2026, 8, 12, 9, 0)),
    [2026, 8, 13, 9, 0],
  ],
  [
    task(REPEAT_TYPES.WEEKLY, makeDate(2026, 8, 12, 9, 0), {
      repeatDays: [1],
    }),
    [2026, 8, 14, 9, 0],
  ],
  [
    task(REPEAT_TYPES.MONTHLY, makeDate(2026, 8, 12, 9, 0), {
      repeatMonthlyType: "first",
    }),
    [2026, 9, 1, 9, 0],
  ],
  [
    task(REPEAT_TYPES.YEARLY, makeDate(2026, 8, 12, 9, 0), {
      repeatYearlyDate: makeDate(2026, 8, 12, 9, 0),
    }),
    [2027, 8, 12, 9, 0],
  ],
  [
    task(REPEAT_TYPES.MONTHLY, makeDate(2026, 0, 31, 9, 0), {
      repeatMonthlyType: "last",
    }),
    [2026, 1, 28, 9, 0],
  ],
  [
    task(REPEAT_TYPES.MONTHLY, makeDate(2026, 0, 31, 9, 0), {
      repeatMonthlyType: "custom",
      repeatCustomDate: makeDate(2026, 0, 31, 9, 0),
    }),
    [2026, 1, 28, 9, 0],
  ],
  [
    task(REPEAT_TYPES.YEARLY, makeDate(2028, 1, 29, 9, 0), {
      repeatYearlyDate: makeDate(2028, 1, 29, 9, 0),
    }),
    [2029, 1, 28, 9, 0],
  ],
];

existingRepeatCases.forEach(([existingTask, expected]) => {
  const base = new Date(existingTask.scheduledTime);
  assertDate(
    getNextRecurringDate(existingTask, base),
    expected,
    `${existingTask.repeatType} regression`
  );
});

assert.equal(
  formatRepeatLabel(
    task(REPEAT_TYPES.CUSTOM, makeDate(2026, 8, 12), {
      repeatInterval: 5,
      repeatUnit: "minutes",
    })
  ),
  "Every 5 Minutes"
);
assert.equal(
  formatRepeatLabel(
    task(REPEAT_TYPES.CUSTOM, makeDate(2026, 8, 12), {
      repeatInterval: 3,
      repeatUnit: "months",
    })
  ),
  "Every 3 Months"
);

assert.deepEqual(
  normalizeTaskRepeatSettings({ repeatType: REPEAT_TYPES.DAILY }),
  {
    repeatType: REPEAT_TYPES.DAILY,
    repeatDays: [],
    repeatMonthlyType: "first",
    repeatCustomDate: "",
    repeatYearlyDate: "",
    repeatInterval: 0,
    repeatUnit: "",
    repeatGroupId: "",
  }
);
assert.equal(
  normalizeTaskRepeatSettings({
    repeatType: REPEAT_TYPES.CUSTOM,
    repeatInterval: 2,
    repeatUnit: "hours",
  }).repeatInterval,
  2
);
assert.equal(
  normalizeTaskRepeatSettings({
    repeatType: REPEAT_TYPES.DAILY,
    repeatInterval: 5,
    repeatUnit: "minutes",
  }).repeatInterval,
  0,
  "Existing repeat types ignore stale custom fields"
);
assert.equal(
  getNextRecurringDate(
    task(REPEAT_TYPES.CUSTOM, makeDate(2026, 8, 12), {
      repeatInterval: 4,
      repeatUnit: "minutes",
    }),
    makeDate(2026, 8, 12)
  ),
  null
);

const appSource = readFileSync(
  new URL("../app/(tabs)/index.tsx", import.meta.url),
  "utf8"
);
const schema = appSource.match(
  /CREATE TABLE IF NOT EXISTS tasks\s*\([\s\S]*?\);/
)?.[0];
assert.ok(schema, "Existing task schema is available");

const countBindings = (source, arrayStart) => {
  let bracketDepth = 1;
  let parenthesisDepth = 0;
  let braceDepth = 0;
  let quote = "";
  let segment = "";
  const segments = [];

  for (let index = arrayStart + 1; index < source.length; index += 1) {
    const character = source[index];
    segment += character;

    if (quote) {
      if (character === "\\") {
        segment += source[index + 1] || "";
        index += 1;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }

    if (["'", '"', "`"].includes(character)) {
      quote = character;
    } else if (character === "(") {
      parenthesisDepth += 1;
    } else if (character === ")") {
      parenthesisDepth -= 1;
    } else if (character === "{") {
      braceDepth += 1;
    } else if (character === "}") {
      braceDepth -= 1;
    } else if (character === "[") {
      bracketDepth += 1;
    } else if (character === "]") {
      bracketDepth -= 1;
      if (bracketDepth === 0) {
        const finalSegment = segment.slice(0, -1).trim();
        if (finalSegment) segments.push(finalSegment);
        return segments.length;
      }
    } else if (
      character === "," &&
      bracketDepth === 1 &&
      parenthesisDepth === 0 &&
      braceDepth === 0
    ) {
      const completeSegment = segment.slice(0, -1).trim();
      if (completeSegment) segments.push(completeSegment);
      segment = "";
    }
  }

  throw new Error("Task SQL binding array did not close");
};

const memoryDatabase = new DatabaseSync(":memory:");
memoryDatabase.exec(schema);
const insertStatements = [
  ...appSource.matchAll(/`(INSERT INTO tasks[\s\S]*?)`\s*,\s*\[/g),
];
assert.ok(insertStatements.length >= 5, "All existing task insert paths are checked");

const valuesForColumn = (column) => ({
  title: "Custom interval task",
  section: "Work",
  completed: 0,
  repeatType: "custom",
  repeatInterval: 5,
  repeatUnit: "minutes",
  scheduledTime: "2026-09-12 10:00 AM",
  category: "IMPORTANT",
}[column] ?? null);

for (const [index, match] of insertStatements.entries()) {
  const sql = match[1];
  const columns = sql.match(/INSERT INTO tasks\s*\(([\s\S]*?)\)/)[1]
    .split(",")
    .map((column) => column.trim());
  const placeholders = (sql.match(/\?/g) || []).length;
  const sourceLine = appSource.slice(0, match.index).split("\n").length;
  assert.equal(
    placeholders,
    columns.length,
    `Task INSERT column/placeholder counts at line ${sourceLine}`
  );
  assert.equal(
    countBindings(appSource, match.index + match[0].length - 1),
    placeholders,
    `Task INSERT binding counts at line ${sourceLine}`
  );

  const values = columns.map((column) =>
    column === "id" ? 1000 + index : valuesForColumn(column)
  );
  memoryDatabase.prepare(sql).run(...values);
}

const savedCustomTask = memoryDatabase.prepare(
  "SELECT * FROM tasks WHERE repeatInterval = 5 AND repeatUnit = 'minutes' LIMIT 1"
).get();
assert.ok(savedCustomTask, "Custom recurrence persists in SQLite");
assert.equal(normalizeTaskRepeatSettings(savedCustomTask).repeatInterval, 5);
assert.equal(formatRepeatLabel(savedCustomTask), "Every 5 Minutes");

const editStatement = appSource.match(
  /`(UPDATE tasks\s+SET title[\s\S]*?)`\s*,\s*\[/
);
assert.ok(editStatement, "Existing edit-scope UPDATE is available");
const editFields = [...editStatement[1].matchAll(/(\w+)\s*=\s*\?/g)]
  .map((match) => match[1]);
const editValues = editFields.map((field) =>
  field === "id"
    ? savedCustomTask.id
    : field === "repeatInterval"
      ? 2
      : field === "repeatUnit"
        ? "hours"
        : valuesForColumn(field)
);
assert.equal(
  countBindings(appSource, editStatement.index + editStatement[0].length - 1),
  editValues.length,
  "Task UPDATE binding counts"
);
memoryDatabase.prepare(editStatement[1]).run(...editValues);
assert.equal(
  formatRepeatLabel(memoryDatabase.prepare("SELECT * FROM tasks WHERE id = ?")
    .get(savedCustomTask.id)),
  "Every 2 Hours",
  "Custom recurrence updates using the existing edit-scope SQL"
);
memoryDatabase.close();

const legacyDatabase = new DatabaseSync(":memory:");
legacyDatabase.exec(
  "CREATE TABLE tasks (id INTEGER PRIMARY KEY, repeatType TEXT);" +
  "INSERT INTO tasks (id, repeatType) VALUES (1, 'daily');" +
  "ALTER TABLE tasks ADD COLUMN repeatInterval INTEGER DEFAULT 0;" +
  "ALTER TABLE tasks ADD COLUMN repeatUnit TEXT DEFAULT '';"
);
assert.deepEqual(
  { ...legacyDatabase.prepare("SELECT * FROM tasks WHERE id = 1").get() },
  { id: 1, repeatType: "daily", repeatInterval: 0, repeatUnit: "" },
  "Additive migration keeps existing tasks unchanged"
);
legacyDatabase.close();

const persistencePath = join(tmpdir(), `custom-repeat-${randomUUID()}.db`);
let persistentDatabase;
try {
  persistentDatabase = new DatabaseSync(persistencePath);
  persistentDatabase.exec(schema);
  const insert = persistentDatabase.prepare(
    "INSERT INTO tasks (title, repeatType, repeatInterval, repeatUnit) VALUES (?, ?, ?, ?)"
  );
  for (const unit of CUSTOM_REPEAT_UNITS) {
    const interval = unit === "minutes" ? 5 : 2;
    insert.run("Saved custom recurrence", "custom", interval, unit);
  }
  persistentDatabase.close();
  persistentDatabase = new DatabaseSync(persistencePath);
  const reopenedTasks = persistentDatabase.prepare("SELECT * FROM tasks ORDER BY id").all();
  assert.equal(reopenedTasks.length, 6);
  reopenedTasks.forEach((savedTask, index) => {
    const unit = CUSTOM_REPEAT_UNITS[index];
    const interval = unit === "minutes" ? 5 : 2;
    const restored = normalizeTaskRepeatSettings(savedTask);
    assert.equal(restored.repeatInterval, interval, "Interval survives database reopen");
    assert.equal(restored.repeatUnit, unit, "Unit survives database reopen");
    const label = unit[0].toUpperCase() + unit.slice(1);
    assert.equal(formatRepeatLabel(savedTask), `Every ${interval} ${label}`);
  });
} finally {
  persistentDatabase?.close();
  unlinkSync(persistencePath);
}

console.log("Custom repeat validation passed.");
