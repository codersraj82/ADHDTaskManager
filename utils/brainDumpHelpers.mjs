export const BRAIN_DUMP_CAPTURE_TYPES = Object.freeze({
  TEXT: "text",
  VOICE: "voice",
  PHOTO: "photo",
  VIDEO: "video",
});

export const BRAIN_DUMP_STATUSES = Object.freeze({
  THOUGHT: "thought",
  CONVERTED_TASK: "converted_task",
  CONVERTED_REMINDER: "converted_reminder",
});

export const BRAIN_DUMP_MAX_VIDEO_DURATION_SECONDS = 60;
export const BRAIN_DUMP_DELETE_UNDO_MS = 10_000;

export const normalizeBrainDumpText = (value) =>
  typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : "";

export const getBrainDumpDisplayText = (item = {}) =>
  normalizeBrainDumpText(item.text) || normalizeBrainDumpText(item.transcript);

export const getBrainDumpTaskPrefill = (item = {}) => {
  const fullText = getBrainDumpDisplayText(item);
  if (!fullText) return { title: "", details: "" };

  const firstLine = fullText.split("\n").find((line) => line.trim())?.trim() || fullText;
  const firstSentence = firstLine.match(/^(.{1,90}?[.!?])(?:\s|$)/)?.[1];
  const titleSource = firstSentence || firstLine;
  const title =
    titleSource.length <= 90
      ? titleSource
      : `${titleSource.slice(0, 87).trimEnd()}...`;
  const needsDetails = fullText !== title || fullText.length > 90 || fullText.includes("\n");

  return {
    title,
    details: needsDetails ? fullText : "",
  };
};

export const isBrainDumpContentValid = ({ text, transcript, mediaUri } = {}) =>
  Boolean(
    normalizeBrainDumpText(text) ||
      normalizeBrainDumpText(transcript) ||
      (typeof mediaUri === "string" && mediaUri.trim())
  );

export const isBrainDumpVideoDurationAllowed = (durationMs) => {
  const duration = Number(durationMs);
  return (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration <= BRAIN_DUMP_MAX_VIDEO_DURATION_SECONDS * 1000
  );
};

export const formatBrainDumpDuration = (durationMs) => {
  const totalSeconds = Math.max(0, Math.round(Number(durationMs || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const startOfLocalDay = (date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

export const getBrainDumpTimeGroup = (createdAt, now = new Date()) => {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return "EARLIER";

  const todayStart = startOfLocalDay(now);
  const createdStart = startOfLocalDay(created);
  const differenceDays = Math.round(
    (todayStart.getTime() - createdStart.getTime()) / 86_400_000
  );

  if (differenceDays <= 0) return "TODAY";
  if (differenceDays === 1) return "YESTERDAY";
  if (differenceDays <= 7) return "THIS WEEK";
  return "EARLIER";
};

export const groupBrainDumpsByTime = (items = [], now = new Date()) => {
  const order = ["TODAY", "YESTERDAY", "THIS WEEK", "EARLIER"];
  const groups = new Map(order.map((title) => [title, []]));

  for (const item of Array.isArray(items) ? items : []) {
    groups.get(getBrainDumpTimeGroup(item?.createdAt, now))?.push(item);
  }

  return order
    .map((title) => ({ title, data: groups.get(title) || [] }))
    .filter((section) => section.data.length > 0);
};
