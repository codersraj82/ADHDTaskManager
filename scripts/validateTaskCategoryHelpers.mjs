import assert from "node:assert/strict";
import {
  buildCategoryTaskGroups,
  DERIVED_DUE_DATE_CATEGORY,
  getCategoryHeaderStats,
  isTaskDueToday,
  normalizeTaskCategory,
  sortManualCategoryTasks,
  TASK_CATEGORIES,
} from "../utils/taskCategoryHelpers.mjs";

const now = new Date(2026, 8, 12, 14, 0, 0, 0);
const task = (id, category, scheduledTime = "", extra = {}) => ({
  id,
  title: `Task ${id}`,
  category,
  scheduledTime,
  completed: false,
  ...extra,
});

assert.equal(normalizeTaskCategory(null), TASK_CATEGORIES.UNCATEGORIZED);
assert.equal(normalizeTaskCategory("lovable"), TASK_CATEGORIES.LOVABLE);
assert.equal(normalizeTaskCategory("DUE_DATE"), TASK_CATEGORIES.UNCATEGORIZED);

const urgentToday = task(1, "URGENT", "2026-09-12 09:00 AM");
const groups = buildCategoryTaskGroups(
  [
    urgentToday,
    task(2, "IMPORTANT", "2026-09-13 09:00 AM"),
    task(3, "BORING", "2026-09-11 09:00 AM"),
    task(4, "LOVABLE", ""),
    task(5, null, ""),
  ],
  now
);

assert.equal(groups[TASK_CATEGORIES.URGENT][0], urgentToday);
assert.equal(groups[DERIVED_DUE_DATE_CATEGORY][0], urgentToday);
assert.deepEqual(
  groups[DERIVED_DUE_DATE_CATEGORY].map((item) => item.id),
  [1]
);
assert.deepEqual(
  groups[TASK_CATEGORIES.UNCATEGORIZED].map((item) => item.id),
  [5]
);

const sorted = sortManualCategoryTasks(
  [
    task(1, "URGENT", "2026-09-10 08:00 AM"),
    task(2, "URGENT", ""),
    task(3, "URGENT", "2026-09-13 10:00 AM"),
    task(4, "URGENT", "2026-09-12 09:00 AM"),
    task(5, "URGENT", ""),
    task(6, "URGENT", "2026-09-11 08:00 AM"),
  ],
  now
);
assert.deepEqual(
  sorted.map((item) => item.id),
  [4, 3, 2, 5, 6, 1]
);

assert.equal(isTaskDueToday(task(1, "URGENT", "2026-09-12 11:59 PM"), now), true);
assert.equal(isTaskDueToday(task(2, "URGENT", "2026-09-13 12:00 AM"), now), false);
assert.equal(isTaskDueToday(task(3, "URGENT", ""), now), false);

const visibilityGroups = buildCategoryTaskGroups(
  [
    task(10, "IMPORTANT", "", {
      completed: true,
      completedAt: "2026-09-12 10:00 AM",
    }),
    task(11, "IMPORTANT", "", {
      completed: true,
      completedAt: "2026-09-11 10:00 AM",
    }),
  ],
  now
);
assert.deepEqual(
  visibilityGroups[TASK_CATEGORIES.IMPORTANT].map((item) => item.id),
  [10]
);

const stats = getCategoryHeaderStats(
  [
    urgentToday,
    task(20, "URGENT", "2026-09-13 09:00 AM"),
    task(21, "URGENT", "2026-09-12 10:00 AM", {
      completed: true,
      completedAt: "2026-09-12 10:30 AM",
    }),
  ],
  now
);
assert.deepEqual(stats, {
  pendingCount: 2,
  todayPendingCount: 1,
  todayCompletedCount: 1,
  nearestUpcomingTaskTitle: null,
});

console.log("Task category helper validation passed.");
