export const TASK_CATEGORIES = Object.freeze({
  URGENT: "URGENT",
  IMPORTANT: "IMPORTANT",
  BORING: "BORING",
  LOVABLE: "LOVABLE",
  UNCATEGORIZED: "UNCATEGORIZED",
});

export const DERIVED_DUE_DATE_CATEGORY = "DUE_DATE";

export const TASK_CATEGORY_OPTIONS = Object.freeze([
  { key: TASK_CATEGORIES.URGENT, label: "Urgent" },
  { key: TASK_CATEGORIES.IMPORTANT, label: "Important" },
  { key: TASK_CATEGORIES.BORING, label: "Boring" },
  { key: TASK_CATEGORIES.LOVABLE, label: "Lovable" },
  { key: TASK_CATEGORIES.UNCATEGORIZED, label: "Uncategorized" },
]);

export const CATEGORY_VIEW_CONFIG = Object.freeze([
  {
    key: TASK_CATEGORIES.URGENT,
    title: "Urgent",
    icon: "alert-circle",
    accentColor: "#D98989",
    surfaceClass: "bg-[#211818]",
    headerClass: "bg-[#342020]/95",
    footer: "One clear step is enough right now. ❤️",
    empty: "No urgent tasks here. 🌿",
  },
  {
    key: DERIVED_DUE_DATE_CATEGORY,
    title: "Due-Date",
    icon: "calendar",
    accentColor: "#D9A441",
    surfaceClass: "bg-[#211D16]",
    headerClass: "bg-[#342B1D]/95",
    footer: "Today is enough — choose the next small step. 📅",
    empty: "Nothing is due today. 📅",
  },
  {
    key: TASK_CATEGORIES.IMPORTANT,
    title: "Important",
    icon: "star",
    accentColor: "#FFD166",
    surfaceClass: "bg-[#211F17]",
    headerClass: "bg-[#34301D]/95",
    footer: "What matters can move forward one step at a time. ⭐",
    empty: "Nothing marked important yet. ⭐",
  },
  {
    key: TASK_CATEGORIES.BORING,
    title: "Boring",
    icon: "minus-circle",
    accentColor: "#9FB5B5",
    surfaceClass: "bg-[#171D1D]",
    headerClass: "bg-[#222C2C]/95",
    footer: "A tiny start counts — even when it's boring. 🌱",
    empty: "Nothing boring waiting here. ✨",
  },
  {
    key: TASK_CATEGORIES.LOVABLE,
    title: "Lovable",
    icon: "heart",
    accentColor: "#D99ABA",
    surfaceClass: "bg-[#21191E]",
    headerClass: "bg-[#34232D]/95",
    footer: "Enjoy the momentum this task gives you. 💗",
    empty: "No lovable tasks here yet. 💗",
  },
  {
    key: TASK_CATEGORIES.UNCATEGORIZED,
    title: "Uncategorized",
    icon: "inbox",
    accentColor: "#66B9B9",
    surfaceClass: "bg-[#0B1F1F]",
    headerClass: "bg-[#123131]/90",
    footer: "No need to organize everything at once. 🧺",
    empty: "Everything has a place for now. 🧺",
  },
]);

const MANUAL_CATEGORY_SET = new Set(Object.values(TASK_CATEGORIES));

export const normalizeTaskCategory = (value) => {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  return MANUAL_CATEGORY_SET.has(normalized)
    ? normalized
    : TASK_CATEGORIES.UNCATEGORIZED;
};

const isValidDate = (value) =>
  value instanceof Date && !Number.isNaN(value.getTime());

// The app passes its canonical parseStoredDateTime helper. This fallback keeps
// these pure helpers usable in validation scripts without changing app storage.
const parseFallbackDateTime = (value) => {
  if (!value) return null;
  if (isValidDate(value)) return new Date(value);

  const raw = String(value).trim().replace(/\s+/g, " ");
  const match = raw.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?:\s*(AM|PM))?)?$/i
  );

  if (match) {
    const [, yearValue, monthValue, dayValue, hourValue = "0", minuteValue = "0", period] = match;
    const year = Number(yearValue);
    const monthIndex = Number(monthValue) - 1;
    const day = Number(dayValue);
    const minute = Number(minuteValue);
    let hour = Number(hourValue);

    if (period) {
      if (hour < 1 || hour > 12) return null;
      if (period.toUpperCase() === "PM" && hour !== 12) hour += 12;
      if (period.toUpperCase() === "AM" && hour === 12) hour = 0;
    }

    const parsed = new Date(year, monthIndex, day, hour, minute, 0, 0);
    return isValidDate(parsed) &&
      parsed.getFullYear() === year &&
      parsed.getMonth() === monthIndex &&
      parsed.getDate() === day
      ? parsed
      : null;
  }

  const parsed = new Date(raw);
  return isValidDate(parsed) ? parsed : null;
};

const parseTaskDate = (value, parseDateTime) => {
  const parsed =
    typeof parseDateTime === "function"
      ? parseDateTime(value)
      : parseFallbackDateTime(value);
  return isValidDate(parsed) ? parsed : null;
};

const getDayBounds = (now = new Date()) => {
  const safeNow = isValidDate(now) ? now : new Date();
  const start = new Date(
    safeNow.getFullYear(),
    safeNow.getMonth(),
    safeNow.getDate()
  ).getTime();
  return { start, end: start + 24 * 60 * 60 * 1000 - 1 };
};

const isEarlyRecurringPreview = (task) =>
  task?.isEarlyRecurringPreview === true ||
  task?.displayMode === "earlyRecurringPreview";

const isDeletedOrArchived = (task) =>
  task?.deleted === true ||
  task?.deleted === 1 ||
  task?.isDeleted === true ||
  task?.isDeleted === 1 ||
  task?.archived === true ||
  task?.archived === 1 ||
  task?.isArchived === true ||
  task?.isArchived === 1;

const toTimestamp = (value, parseDateTime) =>
  parseTaskDate(value, parseDateTime)?.getTime() ?? null;

export const isTaskDueToday = (task, now = new Date(), parseDateTime) => {
  const scheduledTime = toTimestamp(task?.scheduledTime, parseDateTime);
  if (scheduledTime === null) return false;
  const { start, end } = getDayBounds(now);
  return scheduledTime >= start && scheduledTime <= end;
};

export const isTaskVisibleInCategoryView = (
  task,
  now = new Date(),
  parseDateTime
) => {
  if (!task || isDeletedOrArchived(task)) return false;
  if (isEarlyRecurringPreview(task) || !task.completed) return true;

  const completedAt = toTimestamp(task.completedAt, parseDateTime);
  if (completedAt === null) return false;
  const { start, end } = getDayBounds(now);
  return completedAt >= start && completedAt <= end;
};

const stableEntries = (tasks, parseDateTime) =>
  (Array.isArray(tasks) ? tasks : []).map((task, index) => ({
    task,
    index,
    scheduledTime: toTimestamp(task?.scheduledTime, parseDateTime),
  }));

export const sortManualCategoryTasks = (
  tasks,
  now = new Date(),
  parseDateTime
) => {
  const { start } = getDayBounds(now);

  return stableEntries(tasks, parseDateTime)
    .sort((a, b) => {
      const rank = (entry) => {
        if (entry.scheduledTime === null) return 1;
        return entry.scheduledTime >= start ? 0 : 2;
      };
      const aRank = rank(a);
      const bRank = rank(b);
      if (aRank !== bRank) return aRank - bRank;

      if (aRank === 0 && a.scheduledTime !== b.scheduledTime) {
        return a.scheduledTime - b.scheduledTime;
      }
      if (aRank === 2 && a.scheduledTime !== b.scheduledTime) {
        return b.scheduledTime - a.scheduledTime;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.task);
};

export const sortDueDateTasks = (tasks, parseDateTime) =>
  stableEntries(tasks, parseDateTime)
    .sort((a, b) => {
      const aTime = a.scheduledTime ?? Number.POSITIVE_INFINITY;
      const bTime = b.scheduledTime ?? Number.POSITIVE_INFINITY;
      return aTime !== bTime ? aTime - bTime : a.index - b.index;
    })
    .map((entry) => entry.task);

export const buildCategoryTaskGroups = (
  tasks,
  now = new Date(),
  parseDateTime
) => {
  const groups = CATEGORY_VIEW_CONFIG.reduce((result, category) => {
    result[category.key] = [];
    return result;
  }, {});

  const visibleTasks = (Array.isArray(tasks) ? tasks : []).filter((task) =>
    isTaskVisibleInCategoryView(task, now, parseDateTime)
  );

  visibleTasks.forEach((task) => {
    groups[normalizeTaskCategory(task.category)].push(task);
    if (isTaskDueToday(task, now, parseDateTime)) {
      groups[DERIVED_DUE_DATE_CATEGORY].push(task);
    }
  });

  Object.values(TASK_CATEGORIES).forEach((category) => {
    groups[category] = sortManualCategoryTasks(
      groups[category],
      now,
      parseDateTime
    );
  });
  groups[DERIVED_DUE_DATE_CATEGORY] = sortDueDateTasks(
    groups[DERIVED_DUE_DATE_CATEGORY],
    parseDateTime
  );

  return groups;
};

export const getCategoryHeaderStats = (
  tasks,
  now = new Date(),
  parseDateTime
) => {
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  let pendingCount = 0;
  let todayPendingCount = 0;
  let todayCompletedCount = 0;

  safeTasks.forEach((task) => {
    if (isEarlyRecurringPreview(task)) return;

    if (!task.completed) {
      pendingCount += 1;
      if (isTaskDueToday(task, now, parseDateTime)) {
        todayPendingCount += 1;
      }
      return;
    }

    const completedAt = toTimestamp(task.completedAt, parseDateTime);
    const { start, end } = getDayBounds(now);
    if (completedAt !== null && completedAt >= start && completedAt <= end) {
      todayCompletedCount += 1;
    }
  });

  return {
    pendingCount,
    todayPendingCount,
    todayCompletedCount,
    nearestUpcomingTaskTitle: null,
  };
};
