import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {
  normalizeTaskViewMode,
  readTaskViewPreference,
  TASK_VIEW_MODE_SETTING_KEY,
} from "../utils/taskViewPreference.mjs";
import { isTaskDueToday } from "../utils/taskCategoryHelpers.mjs";

const appSource = readFileSync(
  new URL("../app/(tabs)/index.tsx", import.meta.url),
  "utf8"
);
const sourceFile = ts.createSourceFile(
  "index.tsx", appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX
);
const variables = new Map();
const calls = [];
const visit = (node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    variables.set(node.name.text, node);
  }
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    calls.push(node);
  }
  ts.forEachChild(node, visit);
};
visit(sourceFile);

const saveSetting = variables.get("saveSetting");
const handleViewChange = variables.get("handleTaskViewChange");
assert.ok(saveSetting && handleViewChange, "Use the actual existing settings writer and view handler");
const setterCalls = calls.filter((node) => node.expression.text === "setTaskViewMode");
assert.equal(setterCalls.length, 1, "No startup, task, focus, or navigation code changes the view");
assert.ok(
  setterCalls[0].pos >= handleViewChange.pos && setterCalls[0].end <= handleViewChange.end,
  "The only view setter is inside the user-selection handler"
);
assert.equal(
  calls.filter((node) => node.expression.text === "handleTaskViewChange").length,
  1,
  "Only the view selector invokes the preference writer"
);
assert.match(appSource, /onPress=\{\(\) => handleTaskViewChange\(viewOption\.key\)\}/);
assert.match(
  appSource,
  /\[taskViewMode, setTaskViewMode\]\s*=\s*useState\(\(\)\s*=>\s*readTaskViewPreference\(db\)/,
  "Restore synchronously in the lazy initializer, before normal rendering"
);

const settingsSchema = appSource.match(
  /CREATE TABLE IF NOT EXISTS app_settings\s*\([\s\S]*?\);/
)?.[0];
const taskSchema = appSource.match(
  /CREATE TABLE IF NOT EXISTS tasks\s*\([\s\S]*?\);/
)?.[0];
assert.ok(settingsSchema && taskSchema);

const adaptDatabase = (database) => ({
  getFirstSync: (sql, values = []) => database.prepare(sql).get(...values) || null,
  runSync: (sql, values = []) => database.prepare(sql).run(...values),
});

// Execute the real screen handler and its existing saveSetting callback rather
// than duplicating the preference-save implementation in the test.
const createSelector = (database) => {
  const adapter = adaptDatabase(database);
  let selectedView = readTaskViewPreference(adapter);
  let writes = 0;
  const warnings = [];
  const context = {
    db: {
      ...adapter,
      runSync: (...args) => {
        writes += 1;
        return adapter.runSync(...args);
      },
    },
    useCallback: (callback) => callback,
    normalizeTaskViewMode,
    TASK_VIEW_MODE_SETTING_KEY,
    setTaskViewMode: (value) => { selectedView = value; },
    console: { log: (...args) => warnings.push(args) },
  };
  runInNewContext(
    `const saveSetting = ${saveSetting.initializer.getText(sourceFile)};
     const handleTaskViewChange = ${handleViewChange.initializer.getText(sourceFile)};
     globalThis.selectView = handleTaskViewChange;`,
    context
  );
  return {
    select: context.selectView,
    view: () => selectedView,
    writes: () => writes,
    warnings,
    adapter: context.db,
  };
};

assert.equal(normalizeTaskViewMode("category"), "category");
assert.equal(normalizeTaskViewMode("block"), "block");
for (const value of [undefined, null, "", "Category", "BLOCK", "old-view", 0, {}, []]) {
  assert.equal(normalizeTaskViewMode(value), "block", "Invalid saved values fall back safely");
}
const emptyDatabase = new DatabaseSync(":memory:");
assert.equal(readTaskViewPreference(adaptDatabase(emptyDatabase)), "block");
assert.equal(
  emptyDatabase.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().length,
  0,
  "First-use reads do not create or migrate storage"
);
emptyDatabase.close();

const memoryDatabase = new DatabaseSync(":memory:");
try {
  memoryDatabase.exec(settingsSchema + taskSchema);
  memoryDatabase.prepare(
    "INSERT INTO tasks (title, category, isPinned, completed, scheduledTime) VALUES (?, ?, ?, ?, ?)"
  ).run("Existing task", "IMPORTANT", 1, 0, "2026-09-14 09:00 AM");
  const settingsInsert = memoryDatabase.prepare(
    "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)"
  );
  settingsInsert.run("voiceMuted", "true");
  settingsInsert.run("focusTimerState", '{"activeTaskId":1}');
  const originalTasks = memoryDatabase.prepare("SELECT * FROM tasks").all();
  const originalSettings = memoryDatabase.prepare("SELECT * FROM app_settings ORDER BY key").all();
  const selector = createSelector(memoryDatabase);
  assert.equal(selector.view(), "block", "First use defaults to Block");
  assert.equal(selector.writes(), 0, "Initialization does not persist a default");

  selector.select("category");
  assert.equal(selector.view(), "category");
  assert.equal(selector.writes(), 1, "Selection persists immediately, without a debounce");
  assert.equal(readTaskViewPreference(selector.adapter), "category");
  assert.equal(createSelector(memoryDatabase).view(), "category", "Screen remount restores Category");
  assert.equal(selector.writes(), 1, "Repeated reads and remounts never write preferences");
  selector.select("block");
  assert.equal(createSelector(memoryDatabase).view(), "block", "Screen remount restores Block");
  selector.select("category");
  assert.equal(selector.view(), "category", "Last user choice wins");

  assert.deepEqual(memoryDatabase.prepare("SELECT * FROM tasks").all(), originalTasks);
  assert.deepEqual(
    memoryDatabase.prepare("SELECT * FROM app_settings WHERE key != ? ORDER BY key")
      .all(TASK_VIEW_MODE_SETTING_KEY),
    originalSettings,
    "No other setting, including focus or voice state, is changed"
  );
  const savedTask = originalTasks[0];
  assert.equal(isTaskDueToday(savedTask, new Date(2026, 8, 13)), false);
  assert.equal(isTaskDueToday(savedTask, new Date(2026, 8, 14)), true);
  assert.equal(readTaskViewPreference(selector.adapter), "category", "Derived date changes do not change the view");

  for (const value of ["invalid", "", null]) {
    settingsInsert.run(TASK_VIEW_MODE_SETTING_KEY, value);
    assert.equal(readTaskViewPreference(selector.adapter), "block");
    assert.equal(selector.writes(), 3, "Corrupted-value fallback is read-only");
  }
  selector.adapter.runSync = () => { throw new Error("Simulated unavailable storage"); };
  assert.doesNotThrow(() => selector.select("category"));
  assert.equal(selector.view(), "category", "Storage failure does not crash or reject the user's in-session choice");
  assert.equal(selector.warnings.length, 1);
} finally {
  memoryDatabase.close();
}

const persistencePath = join(tmpdir(), `task-view-${randomUUID()}.db`);
let persistentDatabase;
try {
  persistentDatabase = new DatabaseSync(persistencePath);
  persistentDatabase.exec(settingsSchema);
  createSelector(persistentDatabase).select("category");
  persistentDatabase.close();
  persistentDatabase = new DatabaseSync(persistencePath);
  assert.equal(createSelector(persistentDatabase).view(), "category", "Category survives a database close/reopen");
  createSelector(persistentDatabase).select("block");
  persistentDatabase.close();
  persistentDatabase = new DatabaseSync(persistencePath);
  assert.equal(createSelector(persistentDatabase).view(), "block", "Block survives a database close/reopen");
} finally {
  persistentDatabase?.close();
  unlinkSync(persistencePath);
}

console.log("Task view preference validation passed.");
