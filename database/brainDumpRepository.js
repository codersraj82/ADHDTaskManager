import { db } from "./db";
import {
  BRAIN_DUMP_CAPTURE_TYPES,
  BRAIN_DUMP_DELETE_UNDO_MS,
  BRAIN_DUMP_STATUSES,
  isBrainDumpContentValid,
  normalizeBrainDumpText,
} from "../utils/brainDumpHelpers.mjs";

const VALID_CAPTURE_TYPES = new Set(Object.values(BRAIN_DUMP_CAPTURE_TYPES));
const VALID_STATUSES = new Set(Object.values(BRAIN_DUMP_STATUSES));

const nowIso = () => new Date().toISOString();
const nullableText = (value) => {
  const normalized = normalizeBrainDumpText(value);
  return normalized || null;
};
const nullableIdentifier = (value) => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
};
const nullableNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

export const ensureBrainDumpTable = () => {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS brain_dumps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      captureType TEXT NOT NULL DEFAULT 'text',
      text TEXT,
      transcript TEXT,
      mediaUri TEXT,
      mimeType TEXT,
      fileName TEXT,
      fileSize INTEGER,
      audioDurationMs INTEGER,
      videoDurationMs INTEGER,
      width INTEGER,
      height INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'thought',
      convertedTaskId INTEGER,
      convertedReminderId TEXT,
      reminderScheduledAt TEXT,
      isArchived INTEGER NOT NULL DEFAULT 0,
      deletedAt TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_brain_dumps_created_at
      ON brain_dumps(createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_brain_dumps_status
      ON brain_dumps(status, deletedAt);
  `);

  const columns = db
    .getAllSync("PRAGMA table_info(brain_dumps)")
    .map((column) => column.name);
  if (!columns.includes("reminderScheduledAt")) {
    db.execSync("ALTER TABLE brain_dumps ADD COLUMN reminderScheduledAt TEXT;");
  }
};

const normalizeRow = (row) =>
  row
    ? {
        ...row,
        id: Number(row.id),
        fileSize: nullableNumber(row.fileSize),
        audioDurationMs: nullableNumber(row.audioDurationMs),
        videoDurationMs: nullableNumber(row.videoDurationMs),
        width: nullableNumber(row.width),
        height: nullableNumber(row.height),
        convertedTaskId: nullableNumber(row.convertedTaskId),
        convertedReminderId: nullableIdentifier(row.convertedReminderId),
        isArchived: Number(row.isArchived || 0) === 1,
      }
    : null;

export const listBrainDumps = ({ includeArchived = false } = {}) => {
  ensureBrainDumpTable();
  const rows = db.getAllSync(
    `SELECT * FROM brain_dumps
     WHERE deletedAt IS NULL ${includeArchived ? "" : "AND isArchived = 0"}
     ORDER BY datetime(createdAt) DESC, id DESC`
  );
  return rows.map(normalizeRow);
};

export const getBrainDumpById = (id, { includeDeleted = false } = {}) => {
  ensureBrainDumpTable();
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return null;
  const row = db.getFirstSync(
    `SELECT * FROM brain_dumps WHERE id = ? ${includeDeleted ? "" : "AND deletedAt IS NULL"}`,
    [numericId]
  );
  return normalizeRow(row);
};

const normalizePayload = (input = {}, existing = null) => {
  const captureType = VALID_CAPTURE_TYPES.has(input.captureType)
    ? input.captureType
    : existing?.captureType || BRAIN_DUMP_CAPTURE_TYPES.TEXT;
  const status = VALID_STATUSES.has(input.status)
    ? input.status
    : existing?.status || BRAIN_DUMP_STATUSES.THOUGHT;

  return {
    captureType,
    text: nullableText(input.text),
    transcript: nullableText(input.transcript),
    mediaUri: nullableText(input.mediaUri),
    mimeType: nullableText(input.mimeType),
    fileName: nullableText(input.fileName),
    fileSize: nullableNumber(input.fileSize),
    audioDurationMs: nullableNumber(input.audioDurationMs),
    videoDurationMs: nullableNumber(input.videoDurationMs),
    width: nullableNumber(input.width),
    height: nullableNumber(input.height),
    status,
    convertedTaskId: nullableNumber(input.convertedTaskId),
    convertedReminderId: nullableIdentifier(input.convertedReminderId),
    reminderScheduledAt: nullableText(input.reminderScheduledAt),
    isArchived: input.isArchived === true,
  };
};

export const createBrainDump = (input = {}) => {
  ensureBrainDumpTable();
  const payload = normalizePayload(input);
  if (!isBrainDumpContentValid(payload)) throw new Error("BRAIN_DUMP_EMPTY");
  const timestamp = nowIso();
  const result = db.runSync(
    `INSERT INTO brain_dumps (
      captureType, text, transcript, mediaUri, mimeType, fileName, fileSize,
      audioDurationMs, videoDurationMs, width, height, createdAt, updatedAt,
      status, convertedTaskId, convertedReminderId, reminderScheduledAt,
      isArchived, deletedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      payload.captureType,
      payload.text,
      payload.transcript,
      payload.mediaUri,
      payload.mimeType,
      payload.fileName,
      payload.fileSize,
      payload.audioDurationMs,
      payload.videoDurationMs,
      payload.width,
      payload.height,
      timestamp,
      timestamp,
      payload.status,
      payload.convertedTaskId,
      payload.convertedReminderId,
      payload.reminderScheduledAt,
      payload.isArchived ? 1 : 0,
    ]
  );
  return getBrainDumpById(result.lastInsertRowId);
};

export const updateBrainDump = (id, input = {}) => {
  ensureBrainDumpTable();
  const existing = getBrainDumpById(id, { includeDeleted: true });
  if (!existing) throw new Error("BRAIN_DUMP_NOT_FOUND");
  const payload = normalizePayload({ ...existing, ...input }, existing);
  if (!isBrainDumpContentValid(payload)) throw new Error("BRAIN_DUMP_EMPTY");

  db.runSync(
    `UPDATE brain_dumps SET
      captureType = ?, text = ?, transcript = ?, mediaUri = ?, mimeType = ?,
      fileName = ?, fileSize = ?, audioDurationMs = ?, videoDurationMs = ?,
      width = ?, height = ?, updatedAt = ?, status = ?, convertedTaskId = ?,
      convertedReminderId = ?, reminderScheduledAt = ?, isArchived = ? WHERE id = ?`,
    [
      payload.captureType,
      payload.text,
      payload.transcript,
      payload.mediaUri,
      payload.mimeType,
      payload.fileName,
      payload.fileSize,
      payload.audioDurationMs,
      payload.videoDurationMs,
      payload.width,
      payload.height,
      nowIso(),
      payload.status,
      payload.convertedTaskId,
      payload.convertedReminderId,
      payload.reminderScheduledAt,
      payload.isArchived ? 1 : 0,
      Number(id),
    ]
  );
  return getBrainDumpById(id, { includeDeleted: true });
};

export const markBrainDumpConverted = (id, conversionType, relationId) => {
  const isReminder = conversionType === "reminder";
  return updateBrainDump(id, {
    status: isReminder
      ? BRAIN_DUMP_STATUSES.CONVERTED_REMINDER
      : BRAIN_DUMP_STATUSES.CONVERTED_TASK,
    ...(isReminder
      ? { convertedReminderId: relationId }
      : { convertedTaskId: relationId }),
  });
};

export const markBrainDumpReminderScheduled = (
  id,
  notificationId,
  scheduledAt
) =>
  updateBrainDump(id, {
    status: BRAIN_DUMP_STATUSES.CONVERTED_REMINDER,
    convertedReminderId: notificationId,
    reminderScheduledAt: scheduledAt,
  });

export const clearBrainDumpReminder = (id) => {
  const item = getBrainDumpById(id, { includeDeleted: true });
  if (!item) return null;
  return updateBrainDump(id, {
    status:
      item.status === BRAIN_DUMP_STATUSES.CONVERTED_REMINDER
        ? item.convertedTaskId
          ? BRAIN_DUMP_STATUSES.CONVERTED_TASK
          : BRAIN_DUMP_STATUSES.THOUGHT
        : item.status,
    convertedReminderId: null,
    reminderScheduledAt: null,
  });
};

export const keepBrainDumpAsThought = (id) =>
  updateBrainDump(id, {
    status: BRAIN_DUMP_STATUSES.THOUGHT,
  });

export const softDeleteBrainDump = (id) => {
  ensureBrainDumpTable();
  db.runSync("UPDATE brain_dumps SET deletedAt = ?, updatedAt = ? WHERE id = ?", [
    nowIso(),
    nowIso(),
    Number(id),
  ]);
  return getBrainDumpById(id, { includeDeleted: true });
};

export const restoreBrainDump = (id) => {
  ensureBrainDumpTable();
  db.runSync("UPDATE brain_dumps SET deletedAt = NULL, updatedAt = ? WHERE id = ?", [
    nowIso(),
    Number(id),
  ]);
  return getBrainDumpById(id);
};

export const permanentlyDeleteBrainDumpRecord = (id) => {
  ensureBrainDumpTable();
  const existing = getBrainDumpById(id, { includeDeleted: true });
  if (existing) db.runSync("DELETE FROM brain_dumps WHERE id = ?", [Number(id)]);
  return existing;
};

export const listExpiredDeletedBrainDumps = (now = Date.now()) => {
  ensureBrainDumpTable();
  return db
    .getAllSync("SELECT * FROM brain_dumps WHERE deletedAt IS NOT NULL")
    .map(normalizeRow)
    .filter((item) => {
      const deletedAt = Date.parse(item.deletedAt || "");
      return Number.isFinite(deletedAt) && now - deletedAt >= BRAIN_DUMP_DELETE_UNDO_MS;
    });
};

export const getBrainDumpThoughtCount = () => {
  ensureBrainDumpTable();
  const row = db.getFirstSync(
    "SELECT COUNT(*) AS count FROM brain_dumps WHERE deletedAt IS NULL AND isArchived = 0 AND status = ?",
    [BRAIN_DUMP_STATUSES.THOUGHT]
  );
  return Number(row?.count || 0);
};
