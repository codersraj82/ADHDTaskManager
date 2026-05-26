import { parseStoredDateTime } from "./formatDateTime";

const SOFT_REMINDER_ACTIONS = new Set([
  "snooze_10",
  "snooze_30",
  "move_gently",
  "make_smaller",
]);

const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const isFlagEnabled = (value) => value === true || value === 1;

const isDeletedOrArchived = (task) =>
  isFlagEnabled(task?.deleted) ||
  isFlagEnabled(task?.isDeleted) ||
  isFlagEnabled(task?.archived) ||
  isFlagEnabled(task?.isArchived);

const parseReminderHistory = (history) => {
  if (Array.isArray(history)) return history.filter(Boolean);
  if (typeof history !== "string" || !history.trim()) return [];

  try {
    const parsed = JSON.parse(history);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
};

const hasMinimumVersion = (task) =>
  typeof task?.minimumVersion === "string" && task.minimumVersion.trim().length > 0;

const getEffectiveSnoozeCount = (task) => {
  if (task?.reminderSnoozeCount !== undefined && task?.reminderSnoozeCount !== null) {
    return toNumber(task.reminderSnoozeCount);
  }
  return toNumber(task?.snoozeCount);
};

const hasPastScheduledTime = (task, now) => {
  const scheduled = parseStoredDateTime(task?.scheduledTime);
  if (!scheduled) return false;
  return scheduled.getTime() < now.getTime();
};

const getIncompleteSubtaskCount = (task) => {
  const subtasks = Array.isArray(task?.subtasks) ? task.subtasks : [];
  return subtasks.reduce((count, subtask) => {
    if (!subtask || subtask.completed) return count;
    return count + 1;
  }, 0);
};

const hasRecentSoftActions = (task) => {
  const history = parseReminderHistory(task?.reminderActionHistory);
  if (history.length < 3) return false;

  const lastThreeActions = history
    .slice(-3)
    .map((entry) => (typeof entry?.action === "string" ? entry.action : ""))
    .filter(Boolean);

  if (lastThreeActions.length < 3) return false;
  const softActionCount = lastThreeActions.reduce(
    (count, action) => (SOFT_REMINDER_ACTIONS.has(action) ? count + 1 : count),
    0
  );
  return softActionCount >= 2;
};

const toLevel = (score) => {
  if (score <= 2) return "none";
  if (score <= 5) return "light";
  return "heavy";
};

export const getTaskAvoidanceSignal = (task, now = new Date()) => {
  if (!task || task.completed || isDeletedOrArchived(task)) {
    return { score: 0, reasons: [], level: "none" };
  }

  const reasonKeys = [];
  let score = 0;

  const effectiveSnoozeCount = getEffectiveSnoozeCount(task);
  if (effectiveSnoozeCount > 0) {
    score += Math.min(effectiveSnoozeCount * 2, 6);
    reasonKeys.push("repeated_snooze");
  }

  const moveGentlyCount = toNumber(task.reminderMoveGentlyCount);
  if (moveGentlyCount > 0) {
    score += Math.min(moveGentlyCount * 2, 4);
    reasonKeys.push("moved_gently");
  }

  const rescheduleCount = toNumber(task.rescheduleCount);
  if (rescheduleCount > 0) {
    score += Math.min(rescheduleCount * 2, 4);
    reasonKeys.push("rescheduled");
  }

  const stuckCount = toNumber(task.stuckCount);
  if (stuckCount > 0) {
    score += Math.min(stuckCount * 3, 6);
    reasonKeys.push("stuck_pressed");
  }

  const makeSmallerCount = toNumber(task.reminderMakeSmallerCount);
  if (makeSmallerCount > 0) {
    score += Math.min(makeSmallerCount, 2);
    reasonKeys.push("made_smaller");
  }

  const openedWithoutCompletionCount = toNumber(task.openedWithoutCompletionCount);
  if (openedWithoutCompletionCount > 0) {
    score += Math.min(openedWithoutCompletionCount, 3);
    reasonKeys.push("opened_without_completion");
  }

  if (hasPastScheduledTime(task, now)) {
    score += 2;
    reasonKeys.push("overdue_pending");
  }

  if (getIncompleteSubtaskCount(task) >= 5) {
    score += 1;
    reasonKeys.push("many_incomplete_subtasks");
  }

  if (hasRecentSoftActions(task)) {
    score += 2;
    reasonKeys.push("repeated_soft_actions");
  }

  if (!hasMinimumVersion(task) && score >= 4) {
    score += 1;
    reasonKeys.push("missing_minimum_version");
  }

  return {
    score,
    reasons: reasonKeys,
    level: toLevel(score),
  };
};

export const isTaskFeelingHeavy = (task) =>
  getTaskAvoidanceSignal(task).level === "heavy";

export const getAvoidanceReasonText = (signal) => {
  const reasons = Array.isArray(signal?.reasons) ? signal.reasons : [];

  if (!reasons.length) {
    return "This task may be feeling heavy.";
  }

  if (reasons.includes("overdue_pending")) {
    return "This may need a better time.";
  }

  if (reasons.includes("many_incomplete_subtasks")) {
    return "There may be too many steps visible right now.";
  }

  if (reasons.includes("repeated_snooze")) {
    return "This reminder has been snoozed a few times.";
  }

  if (
    reasons.includes("repeated_soft_actions") ||
    reasons.includes("moved_gently")
  ) {
    return "This may need a softer start.";
  }

  if (reasons.includes("missing_minimum_version")) {
    return "A smaller version may help.";
  }

  return "This task may be feeling heavy.";
};
