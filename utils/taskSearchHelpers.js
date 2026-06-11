import { parseStoredDateTime } from "./formatDateTime";
import {
  getDisplayFileName,
  normalizeTaskAttachments,
} from "./taskAttachmentHelpers";

const normalizeText = (value = "") =>
  String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const hasText = (value) => typeof value === "string" && value.trim().length > 0;

const toTimestamp = (value) => {
  const parsed = parseStoredDateTime(value);
  const timestamp = parsed?.getTime?.();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const getLatestCompletionHistoryTimestamp = (task) => {
  const rawHistory = task?.completionHistory;
  const history = Array.isArray(rawHistory)
    ? rawHistory
    : typeof rawHistory === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(rawHistory || "[]");
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];

  return history.reduce((latest, entry) => {
    const candidate =
      typeof entry === "string"
        ? toTimestamp(entry)
        : toTimestamp(entry?.completedAt || entry?.date || entry?.at);
    return Math.max(latest, candidate);
  }, 0);
};

const getTaskSearchTimestamp = (task) => {
  if (task?.completed) {
    return (
      toTimestamp(task.completedAt) ||
      getLatestCompletionHistoryTimestamp(task) ||
      toTimestamp(task.updatedAt) ||
      toTimestamp(task.createdAt)
    );
  }

  return (
    toTimestamp(task?.updatedAt) ||
    toTimestamp(task?.createdAt) ||
    toTimestamp(task?.scheduledTime) ||
    toTimestamp(task?.dueDate) ||
    toTimestamp(task?.reminderDate)
  );
};

const getOrderedSubsequenceScore = (query, candidate) => {
  if (!query || !candidate) return 0;

  let queryIndex = 0;
  let firstMatch = -1;
  let lastMatch = -1;

  for (let index = 0; index < candidate.length && queryIndex < query.length; index += 1) {
    if (candidate[index] !== query[queryIndex]) continue;
    if (firstMatch === -1) firstMatch = index;
    lastMatch = index;
    queryIndex += 1;
  }

  if (queryIndex !== query.length) return 0;

  const span = Math.max(1, lastMatch - firstMatch + 1);
  const compactness = Math.max(0, query.length / span);
  return 30 + Math.round(compactness * 15);
};

const scoreTitle = (query, title) => {
  if (!query || !title) return 0;
  if (title === query) return 100;
  if (title.startsWith(query)) return 80;
  if (title.includes(query)) return 60;
  if (title.split(" ").some((word) => word.startsWith(query))) return 50;
  return getOrderedSubsequenceScore(query, title);
};

const scoreSecondaryField = (query, value, containsScore = 15) => {
  const normalized = normalizeText(value);
  if (!query || !normalized) return 0;
  if (normalized.includes(query)) return containsScore;
  const sequenceScore = getOrderedSubsequenceScore(query, normalized);
  return sequenceScore ? Math.min(containsScore - 2, sequenceScore) : 0;
};

const getAttachmentName = (task) => {
  const attachments = normalizeTaskAttachments(task);
  if (attachments.length) {
    return attachments.map((attachment) => getDisplayFileName(attachment)).join(" ");
  }

  const attachment = String(task?.attachment || "").trim();
  if (!attachment) return "";
  const parts = attachment.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || attachment;
};

const getSubtaskText = (task) =>
  Array.isArray(task?.subtasks)
    ? task.subtasks
        .map((subtask) => subtask?.title || "")
        .filter(Boolean)
        .join(" ")
    : "";

const getMatchReason = (field) => {
  switch (field) {
    case "title":
      return "Matched title";
    case "details":
      return "Matched note";
    case "subtasks":
      return "Matched subtask";
    case "firstAction":
      return "Matched first step";
    case "minimumVersion":
      return "Matched tiny version";
    case "attachment":
      return "Matched attachment";
    case "metadata":
      return "Matched task info";
    case "status":
      return "Matched status";
    default:
      return "Matched task";
  }
};

export const searchTasks = (tasks, query, options = {}) => {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];

  const limit = Math.max(1, Math.min(Number(options?.limit) || 20, 50));
  const safeTasks = Array.isArray(tasks) ? tasks.filter(Boolean) : [];

  return safeTasks
    .map((task) => {
      const title = normalizeText(task?.title);
      const status = task?.completed ? "completed" : "pending";
      const scores = [
        { field: "title", score: scoreTitle(normalizedQuery, title) },
        {
          field: "details",
          score: scoreSecondaryField(normalizedQuery, task?.details, 20),
        },
        {
          field: "subtasks",
          score: scoreSecondaryField(normalizedQuery, getSubtaskText(task), 15),
        },
        {
          field: "firstAction",
          score: scoreSecondaryField(normalizedQuery, task?.firstAction, 15),
        },
        {
          field: "minimumVersion",
          score: scoreSecondaryField(normalizedQuery, task?.minimumVersion, 15),
        },
        {
          field: "attachment",
          score: scoreSecondaryField(normalizedQuery, getAttachmentName(task), 10),
        },
        {
          field: "metadata",
          score: scoreSecondaryField(
            normalizedQuery,
            [
              task?.section,
              task?.category,
              task?.taskContext,
              task?.energyRequired,
              task?.focusRequired,
            ]
              .filter(hasText)
              .join(" "),
            8
          ),
        },
        {
          field: "status",
          score: normalizeText(status).includes(normalizedQuery) ? 5 : 0,
        },
      ];

      const matchedScores = scores.filter((entry) => entry.score > 0);
      if (!matchedScores.length) return null;

      const matchScore = matchedScores.reduce(
        (total, entry) => total + entry.score,
        0
      );
      const matchedFields = matchedScores.map((entry) => entry.field);
      const bestField = [...matchedScores].sort((a, b) => b.score - a.score)[0]?.field;

      return {
        task,
        status,
        matchScore,
        matchedFields,
        reason: getMatchReason(bestField),
        timestamp: getTaskSearchTimestamp(task),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
      if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
      return String(a.task?.title || "").localeCompare(String(b.task?.title || ""));
    })
    .slice(0, limit);
};
