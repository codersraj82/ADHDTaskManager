import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import * as Sharing from "expo-sharing";
import { gcm } from "@noble/ciphers/aes.js";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import * as base64js from "base64-js";

import { db } from "../database/db";
import {
  getAttachmentFileUri,
  getAttachmentMimeType,
  getDisplayFileName,
  getFileExtension,
  getPrimaryAttachmentUri,
  getSafeInternalFileName,
  normalizeTaskAttachments,
} from "../utils/taskAttachmentHelpers";

const BACKUP_VERSION = 1;
const BACKUP_EXTENSION = "adhtmbak";
const BACKUP_KIND = "ADHDTaskManagerEncryptedBackup";
const APP_NAME = "ADHDTaskManager";
const ATTACHMENT_DIR_NAME = "task-attachments";
const BACKUP_DIR_NAME = "backups";
const AUTO_BACKUP_DIR_NAME = "auto";
const MANUAL_BACKUP_DIR_NAME = "manual";
const MONTHLY_BACKUP_DIR_NAME = "monthly";
const YEARLY_BACKUP_DIR_NAME = "yearly";
const PRE_RESTORE_BACKUP_DIR_NAME = "pre-restore";
const BACKUP_INDEX_FILE_NAME = "backup-index.json";
const BACKUP_TEMP_DIR_NAME = "tmp";
const EXTERNAL_BACKUP_DIR_NAME = "ADHDTaskManager Backups";
const AUTO_BACKUP_EMAIL_SECURE_KEY = "adhdTaskManager.autoBackupEmail";
const KDF_ITERATIONS = 210000;
const KEY_BYTES = 32;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const BACKUP_MIME_TYPE = "application/octet-stream";

const BACKUP_SETTING_KEYS = {
  autoEnabled: "backup.autoEnabled",
  autoType: "backup.autoType",
  autoTime: "backup.autoTime",
  lastAutoBackupAt: "backup.lastAutoBackupAt",
  lastAutoBackupDate: "backup.lastAutoBackupDate",
  lastAutoBackupStatus: "backup.lastAutoBackupStatus",
  lastAutoBackupError: "backup.lastAutoBackupError",
  nextAutoBackupAt: "backup.nextAutoBackupAt",
  schedulerStatus: "backup.schedulerStatus",
  externalParentDirectoryUri: "backup.externalParentDirectoryUri",
  externalDirectoryUri: "backup.externalDirectoryUri",
};

let backupInProgress = false;
let activeBackupSource = "";
let restoreInProgress = false;
const MINIMUM_BACKUP_TIMEOUT_MS = 60 * 1000;
const FULL_BACKUP_TIMEOUT_MS = 5 * 60 * 1000;
const ATTACHMENT_BATCH_SIZE = 5;

const yieldToUI = () => new Promise((resolve) => setTimeout(resolve, 0));
const debugBackup = (event, details = {}) => {
  if (globalThis.__DEV__) {
    console.info(`[backup] ${event}`, details);
  }
};

class BackupFlowError extends Error {
  constructor(errorCode, message) {
    super(message);
    this.name = "BackupFlowError";
    this.errorCode = errorCode;
  }
}

const assertBackupCanContinue = (cancelToken, deadline) => {
  if (cancelToken?.cancelled) {
    throw new BackupFlowError("BACKUP_CANCELLED", "Backup cancelled.");
  }
  if (Date.now() > deadline) {
    if (cancelToken) cancelToken.cancelled = true;
    throw new BackupFlowError(
      "BACKUP_TIMEOUT",
      "Backup took too long and was stopped. Please try again."
    );
  }
};

const TABLES = [
  "tasks",
  "section_settings",
  "app_settings",
  "app_profile",
  "daily_stats",
  "special_tasks",
  "daily_moods",
];

const safeString = (value) => (typeof value === "string" ? value.trim() : "");

const localDateKey = (date = new Date()) => {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const todayKey = () => localDateKey();

const timestampForFile = () =>
  new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);

const normalizeEmail = (email = "") => safeString(email).toLowerCase();

export const validateBackupEmail = (email = "") =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));

export const validateBackupEmailPair = (email = "", confirmEmail = "") => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedConfirm = normalizeEmail(confirmEmail);

  if (!validateBackupEmail(normalizedEmail)) {
    return {
      success: false,
      errorCode: "INVALID_EMAIL",
      message: "Enter a valid email ID for backup encryption.",
    };
  }

  if (normalizedEmail !== normalizedConfirm) {
    return {
      success: false,
      errorCode: "EMAIL_MISMATCH",
      message: "Email IDs do not match.",
    };
  }

  return { success: true, email: normalizedEmail };
};

const bytesToBase64 = (bytes) => base64js.fromByteArray(bytes);
const base64ToBytes = (text) => base64js.toByteArray(text);

const utf8BytesToString = (bytes) => {
  let output = "";
  let index = 0;

  while (index < bytes.length) {
    const first = bytes[index++];
    if (first < 0x80) {
      output += String.fromCharCode(first);
      continue;
    }

    if (first >= 0xc0 && first < 0xe0) {
      const second = bytes[index++] & 0x3f;
      output += String.fromCharCode(((first & 0x1f) << 6) | second);
      continue;
    }

    if (first >= 0xe0 && first < 0xf0) {
      const second = bytes[index++] & 0x3f;
      const third = bytes[index++] & 0x3f;
      output += String.fromCharCode(
        ((first & 0x0f) << 12) | (second << 6) | third
      );
      continue;
    }

    const second = bytes[index++] & 0x3f;
    const third = bytes[index++] & 0x3f;
    const fourth = bytes[index++] & 0x3f;
    const codePoint =
      ((first & 0x07) << 18) | (second << 12) | (third << 6) | fourth;
    const adjusted = codePoint - 0x10000;
    output += String.fromCharCode(
      0xd800 + (adjusted >> 10),
      0xdc00 + (adjusted & 0x3ff)
    );
  }

  return output;
};

const parseJson = (value, fallback = null) => {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value.trim()) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const emitBackupProgress = (onProgress, progress = {}) => {
  if (typeof onProgress !== "function") return;

  try {
    onProgress({
      step: progress.step || "preparing",
      message: progress.message || progress.detail || progress.label || "",
      percent: Math.min(Math.max(Number(progress.percent || 0), 0), 100),
      label: progress.label || "",
      detail: progress.detail || "",
      current:
        typeof progress.current === "number" ? progress.current : undefined,
      total: typeof progress.total === "number" ? progress.total : undefined,
    });
  } catch {
    // Progress callbacks are UI-only and should never block backup work.
  }
};

const createProgressMapper =
  (onProgress, startPercent = 0, endPercent = 100, defaults = {}) =>
  (progress = {}) => {
    const rawPercent = Math.min(
      Math.max(Number(progress.percent || 0), 0),
      100
    );
    const range = Math.max(Number(endPercent) - Number(startPercent), 0);
    emitBackupProgress(onProgress, {
      percent: Number(startPercent) + (rawPercent / 100) * range,
      label: progress.label || defaults.label || "Working on backup",
      detail: progress.detail || defaults.detail || "Keep the app open for a moment.",
    });
  };

const ensureDirectoryAsync = async (dir) => {
  if (!dir) {
    throw new BackupFlowError(
      "BACKUP_FOLDER_UNAVAILABLE",
      "The app backup folder is unavailable on this device."
    );
  }

  const existing = await FileSystem.getInfoAsync(dir).catch(() => null);
  let created = false;
  if (!existing?.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    created = true;
  }

  const verified = await FileSystem.getInfoAsync(dir).catch(() => null);
  if (!verified?.exists || verified.isDirectory === false) {
    throw new BackupFlowError(
      "BACKUP_FOLDER_CREATE_FAILED",
      "The app could not create its backup folder."
    );
  }

  return { uri: dir, created };
};

const getBackupBaseDirectory = () => `${FileSystem.documentDirectory}${BACKUP_DIR_NAME}/`;

const getBackupDirectory = (mode = "manual") => {
  const base = `${FileSystem.documentDirectory}${BACKUP_DIR_NAME}/`;
  if (mode === "auto") return `${base}${AUTO_BACKUP_DIR_NAME}/`;
  if (mode === "monthly") return `${base}${MONTHLY_BACKUP_DIR_NAME}/`;
  if (mode === "yearly") return `${base}${YEARLY_BACKUP_DIR_NAME}/`;
  if (mode === "preRestore") return `${base}${PRE_RESTORE_BACKUP_DIR_NAME}/`;
  return `${base}${MANUAL_BACKUP_DIR_NAME}/`;
};

const getBackupIndexPath = () => `${getBackupBaseDirectory()}${BACKUP_INDEX_FILE_NAME}`;
const getBackupTempDirectory = () =>
  `${getBackupBaseDirectory()}${BACKUP_TEMP_DIR_NAME}/`;

const getBackupSourceFromMode = (mode = "manual") => {
  if (mode === "auto") return "auto";
  if (mode === "monthly") return "monthly";
  if (mode === "yearly") return "yearly";
  if (mode === "preRestore") return "preRestore";
  return "manual";
};

const BACKUP_SOURCE_DIRECTORIES = Object.freeze([
  { source: "auto", dir: getBackupDirectory("auto") },
  { source: "manual", dir: getBackupDirectory("manual") },
  { source: "monthly", dir: getBackupDirectory("monthly") },
  { source: "yearly", dir: getBackupDirectory("yearly") },
  { source: "preRestore", dir: getBackupDirectory("preRestore") },
]);

const getBackupFileName = (type = "minimum", mode = "manual") => {
  const normalizedType = type === "full" ? "full" : "minimum";
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  if (mode === "auto") {
    return `auto-${year}-${month}-${day}-${normalizedType}.${BACKUP_EXTENSION}`;
  }

  if (mode === "monthly") {
    return `${APP_NAME}_Backup_${year}-${month}_${normalizedType}.${BACKUP_EXTENSION}`;
  }

  if (mode === "yearly") {
    return `${APP_NAME}_Backup_${year}_${normalizedType}.${BACKUP_EXTENSION}`;
  }

  if (mode === "preRestore") {
    return `pre-restore-${timestampForFile()}-${normalizedType}.${BACKUP_EXTENSION}`;
  }

  return `${APP_NAME}_Backup_${year}-${month}-${day}_${normalizedType}.${BACKUP_EXTENSION}`;
};

const getBackupId = (path = "") =>
  bytesToHex(sha256(utf8ToBytes(`backup-index:${path}`))).slice(0, 24);

const isAppOwnedBackupPath = (path = "") =>
  typeof path === "string" && path.startsWith(getBackupBaseDirectory());

const readBackupIndex = async () => {
  try {
    const path = getBackupIndexPath();
    const info = await FileSystem.getInfoAsync(path).catch(() => null);
    if (!info?.exists) return [];

    const contents = await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const parsed = JSON.parse(contents);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeBackupIndex = async (items = []) => {
  await ensureDirectoryAsync(getBackupBaseDirectory());
  await FileSystem.writeAsStringAsync(
    getBackupIndexPath(),
    JSON.stringify(items, null, 2),
    { encoding: FileSystem.EncodingType.UTF8 }
  );
};

const normalizeBackupIndexItem = (item = {}) => ({
  id: safeString(item.id) || getBackupId(item.path || item.name || String(Date.now())),
  name: safeString(item.name) || "Backup",
  path: safeString(item.path),
  backupType: item.backupType === "full" ? "full" : "minimum",
  source:
    item.source === "auto" ||
    item.source === "manual" ||
    item.source === "monthly" ||
    item.source === "yearly" ||
    item.source === "preRestore"
      ? item.source
      : "manual",
  createdAt: safeString(item.createdAt) || "",
  size: Number(item.size || 0),
  taskCount: Number(item.taskCount || 0),
  attachmentCount: Number(item.attachmentCount || 0),
  skippedAttachmentCount: Number(item.skippedAttachmentCount || 0),
  encrypted: item.encrypted !== false,
  status:
    item.status === "missing" || item.status === "error"
      ? item.status
      : "ready",
});

const buildBackupIndexItem = async ({
  path,
  fileName,
  manifest,
  source,
  status = "ready",
}) => {
  const info = path ? await FileSystem.getInfoAsync(path).catch(() => null) : null;
  const counts = manifest?.counts || {};

  return normalizeBackupIndexItem({
    id: getBackupId(path || fileName || ""),
    name: safeString(fileName) || path?.split("/").filter(Boolean).pop() || "Backup",
    path,
    backupType: manifest?.backupType === "full" ? "full" : "minimum",
    source,
    createdAt: manifest?.createdAt || "",
    size: Number(info?.size || 0),
    taskCount: Number(counts.tasks || 0),
    attachmentCount: Number(counts.attachments || 0),
    skippedAttachmentCount: Number(counts.skippedAttachments || 0),
    encrypted: manifest?.encrypted !== false,
    status,
  });
};

const readBackupManifestFromPath = async (path) => {
  try {
    const contents = await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const envelope = JSON.parse(contents);

    if (
      envelope?.kind !== BACKUP_KIND ||
      envelope?.manifest?.appName !== APP_NAME ||
      envelope?.manifest?.backupVersion !== BACKUP_VERSION
    ) {
      return null;
    }

    return envelope.manifest;
  } catch {
    return null;
  }
};

const upsertBackupIndexItem = async (item) => {
  const nextItem = normalizeBackupIndexItem(item);
  const existing = await readBackupIndex();
  const merged = [
    nextItem,
    ...existing.filter((backup) => backup.id !== nextItem.id),
  ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  await writeBackupIndex(merged);
  return nextItem;
};

const getSettingsRows = () => {
  try {
    return db.getAllSync("SELECT key, value FROM app_settings") || [];
  } catch {
    return [];
  }
};

const getSettingsMap = () =>
  getSettingsRows().reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});

const saveSetting = (key, value) => {
  db.runSync("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", [
    key,
    String(value),
  ]);
};

const removeSetting = (key) => {
  db.runSync("DELETE FROM app_settings WHERE key = ?", [key]);
};

const getAutoBackupEmail = async () => {
  try {
    const storedEmail = await SecureStore.getItemAsync(AUTO_BACKUP_EMAIL_SECURE_KEY);
    return normalizeEmail(storedEmail || "");
  } catch {
    return "";
  }
};

export const saveAutoBackupEmail = async (email = "") => {
  const normalizedEmail = normalizeEmail(email);
  if (!validateBackupEmail(normalizedEmail)) {
    return {
      success: false,
      errorCode: "INVALID_EMAIL",
      message: "Enter a valid email ID.",
    };
  }

  try {
    await SecureStore.setItemAsync(AUTO_BACKUP_EMAIL_SECURE_KEY, normalizedEmail);
    return { success: true };
  } catch {
    return {
      success: false,
      errorCode: "ENCRYPTION_UNAVAILABLE",
      message: "Auto backup needs secure storage for the backup email.",
    };
  }
};

export const clearAutoBackupEmail = async () => {
  try {
    await SecureStore.deleteItemAsync(AUTO_BACKUP_EMAIL_SECURE_KEY);
  } catch {
    // Removing a remembered email should not block disabling auto backup.
  }
};

const normalizeSafUriForComparison = (uri = "") => {
  const value = safeString(uri);
  if (!value) return "";

  try {
    return decodeURIComponent(value).replace(/[\\/]+$/, "").toLowerCase();
  } catch {
    return value.replace(/[\\/]+$/, "").toLowerCase();
  }
};

const isExternalBackupDirectoryUri = (uri = "") => {
  const normalizedUri = normalizeSafUriForComparison(uri);
  const normalizedName = EXTERNAL_BACKUP_DIR_NAME.toLowerCase();
  return (
    normalizedUri.endsWith(`/${normalizedName}`) ||
    normalizedUri.endsWith(`:${normalizedName}`)
  );
};

const getSafFileName = (uri = "") => {
  const normalizedUri = normalizeSafUriForComparison(uri);
  return normalizedUri.split("/").filter(Boolean).pop() || "";
};

const readSafDirectory = async (directoryUri = "") => {
  if (
    Platform.OS !== "android" ||
    !FileSystem.StorageAccessFramework ||
    !safeString(directoryUri)
  ) {
    return null;
  }

  try {
    const entries =
      await FileSystem.StorageAccessFramework.readDirectoryAsync(directoryUri);
    return Array.isArray(entries) ? entries : [];
  } catch {
    return null;
  }
};

const resolveExternalBackupDirectory = async (parentDirectoryUri = "") => {
  const parentUri = safeString(parentDirectoryUri);
  const parentEntries = await readSafDirectory(parentUri);
  if (!parentUri || parentEntries === null) {
    return {
      success: false,
      errorCode: "BACKUP_FOLDER_PERMISSION_REQUIRED",
      message: "Choose a folder and allow access before creating backups.",
    };
  }

  if (isExternalBackupDirectoryUri(parentUri)) {
    return {
      success: true,
      parentDirectoryUri: parentUri,
      directoryUri: parentUri,
      folderCreated: false,
    };
  }

  const existingDirectoryUri = parentEntries.find((uri) =>
    isExternalBackupDirectoryUri(uri)
  );
  if (existingDirectoryUri && (await readSafDirectory(existingDirectoryUri)) !== null) {
    return {
      success: true,
      parentDirectoryUri: parentUri,
      directoryUri: existingDirectoryUri,
      folderCreated: false,
    };
  }

  try {
    const directoryUri =
      await FileSystem.StorageAccessFramework.makeDirectoryAsync(
        parentUri,
        EXTERNAL_BACKUP_DIR_NAME
      );
    if ((await readSafDirectory(directoryUri)) === null) {
      throw new Error("Created backup folder could not be opened.");
    }
    return {
      success: true,
      parentDirectoryUri: parentUri,
      directoryUri,
      folderCreated: true,
    };
  } catch {
    const refreshedEntries = await readSafDirectory(parentUri);
    const recreatedDirectoryUri = refreshedEntries?.find((uri) =>
      isExternalBackupDirectoryUri(uri)
    );
    if (
      recreatedDirectoryUri &&
      (await readSafDirectory(recreatedDirectoryUri)) !== null
    ) {
      return {
        success: true,
        parentDirectoryUri: parentUri,
        directoryUri: recreatedDirectoryUri,
        folderCreated: false,
      };
    }

    return {
      success: false,
      errorCode: "BACKUP_FOLDER_CREATE_FAILED",
      message: `Could not create the ${EXTERNAL_BACKUP_DIR_NAME} folder.`,
    };
  }
};

const rememberExternalBackupDirectory = ({
  parentDirectoryUri = "",
  directoryUri = "",
} = {}) => {
  saveSetting(
    BACKUP_SETTING_KEYS.externalParentDirectoryUri,
    safeString(parentDirectoryUri)
  );
  saveSetting(BACKUP_SETTING_KEYS.externalDirectoryUri, safeString(directoryUri));
};

export const getBackupFolderAccess = async () => {
  if (Platform.OS !== "android" || !FileSystem.StorageAccessFramework) {
    return {
      success: true,
      permissionRequired: false,
      folderName: EXTERNAL_BACKUP_DIR_NAME,
    };
  }

  const settings = getSettingsMap();
  const storedDirectoryUri = safeString(
    settings[BACKUP_SETTING_KEYS.externalDirectoryUri]
  );
  if (
    storedDirectoryUri &&
    (await readSafDirectory(storedDirectoryUri)) !== null
  ) {
    return {
      success: true,
      permissionRequired: false,
      directoryUri: storedDirectoryUri,
      parentDirectoryUri: safeString(
        settings[BACKUP_SETTING_KEYS.externalParentDirectoryUri]
      ),
      folderName: EXTERNAL_BACKUP_DIR_NAME,
      folderCreated: false,
    };
  }

  const storedParentDirectoryUri = safeString(
    settings[BACKUP_SETTING_KEYS.externalParentDirectoryUri]
  );
  if (storedParentDirectoryUri) {
    const repaired = await resolveExternalBackupDirectory(storedParentDirectoryUri);
    if (repaired.success) {
      rememberExternalBackupDirectory(repaired);
      return {
        ...repaired,
        permissionRequired: false,
        folderName: EXTERNAL_BACKUP_DIR_NAME,
      };
    }
  }

  if (storedDirectoryUri) {
    removeSetting(BACKUP_SETTING_KEYS.externalDirectoryUri);
  }
  return {
    success: false,
    permissionRequired: true,
    errorCode: "BACKUP_FOLDER_PERMISSION_REQUIRED",
    folderName: EXTERNAL_BACKUP_DIR_NAME,
    message: "Choose a folder and allow access before creating backups.",
  };
};

export const requestBackupFolderAccess = async () => {
  const currentAccess = await getBackupFolderAccess();
  if (currentAccess.success || Platform.OS !== "android") return currentAccess;

  if (!FileSystem.StorageAccessFramework) {
    return {
      success: false,
      errorCode: "BACKUP_FOLDER_UNAVAILABLE",
      message: "Folder access is not available on this Android device.",
    };
  }

  try {
    const settings = getSettingsMap();
    const initialDirectoryUri =
      safeString(settings[BACKUP_SETTING_KEYS.externalParentDirectoryUri]) ||
      FileSystem.StorageAccessFramework.getUriForDirectoryInRoot(
        EXTERNAL_BACKUP_DIR_NAME
      );
    const permissions =
      await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
        initialDirectoryUri
      );

    if (!permissions?.granted || !permissions.directoryUri) {
      return {
        success: false,
        cancelled: true,
        permissionRequired: true,
        errorCode: "BACKUP_FOLDER_PERMISSION_DENIED",
        folderName: EXTERNAL_BACKUP_DIR_NAME,
        message: "Backup folder access was not granted.",
      };
    }

    const resolved = await resolveExternalBackupDirectory(
      permissions.directoryUri
    );
    if (!resolved.success) return resolved;

    rememberExternalBackupDirectory(resolved);
    return {
      ...resolved,
      permissionRequested: true,
      permissionRequired: false,
      folderName: EXTERNAL_BACKUP_DIR_NAME,
      message: resolved.folderCreated
        ? `${EXTERNAL_BACKUP_DIR_NAME} was created and folder access was granted.`
        : `${EXTERNAL_BACKUP_DIR_NAME} is ready for backups.`,
    };
  } catch {
    return {
      success: false,
      permissionRequired: true,
      errorCode: "BACKUP_FOLDER_PERMISSION_FAILED",
      folderName: EXTERNAL_BACKUP_DIR_NAME,
      message: "Could not prepare the backup folder on this device.",
    };
  }
};

export const getBackupSettings = async () => {
  const settings = getSettingsMap();
  const autoBackupEmailConfigured = validateBackupEmail(await getAutoBackupEmail());
  const storedExternalDirectoryUri = safeString(
    settings[BACKUP_SETTING_KEYS.externalDirectoryUri]
  );
  const backupFolderConfigured =
    Platform.OS !== "android" ||
    !FileSystem.StorageAccessFramework ||
    Boolean(
      storedExternalDirectoryUri &&
        (await readSafDirectory(storedExternalDirectoryUri)) !== null
    );
  const autoEnabled = settings[BACKUP_SETTING_KEYS.autoEnabled] === "true";
  const autoType =
    settings[BACKUP_SETTING_KEYS.autoType] === "full" ? "full" : "minimum";
  const autoTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(
    settings[BACKUP_SETTING_KEYS.autoTime] || ""
  )
    ? settings[BACKUP_SETTING_KEYS.autoTime]
    : "00:00";
  return {
    enabled: autoEnabled,
    backupType: autoType,
    backupTime: autoTime,
    autoEnabled,
    autoType,
    autoTime,
    lastAutoBackupAt: settings[BACKUP_SETTING_KEYS.lastAutoBackupAt] || "",
    lastAutoBackupDate: settings[BACKUP_SETTING_KEYS.lastAutoBackupDate] || "",
    lastAutoBackupStatus:
      settings[BACKUP_SETTING_KEYS.lastAutoBackupStatus] || "",
    lastAutoBackupError: settings[BACKUP_SETTING_KEYS.lastAutoBackupError] || "",
    nextAutoBackupAt: settings[BACKUP_SETTING_KEYS.nextAutoBackupAt] || "",
    schedulerStatus:
      settings[BACKUP_SETTING_KEYS.schedulerStatus] || "not_scheduled",
    autoBackupEmailConfigured,
    backupFolderConfigured,
    backupFolderName: EXTERNAL_BACKUP_DIR_NAME,
  };
};

export const saveBackupSettings = async (settings = {}) => {
  if (typeof settings.autoEnabled === "boolean") {
    saveSetting(BACKUP_SETTING_KEYS.autoEnabled, settings.autoEnabled ? "true" : "false");
  }
  if (settings.autoType === "minimum" || settings.autoType === "full") {
    saveSetting(BACKUP_SETTING_KEYS.autoType, settings.autoType);
  }
  const requestedTime = settings.autoTime || settings.backupTime || "";
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(requestedTime)) {
    saveSetting(BACKUP_SETTING_KEYS.autoTime, requestedTime);
  }
  if (typeof settings.lastAutoBackupAt === "string") {
    saveSetting(BACKUP_SETTING_KEYS.lastAutoBackupAt, settings.lastAutoBackupAt);
  }
  if (typeof settings.lastAutoBackupDate === "string") {
    saveSetting(BACKUP_SETTING_KEYS.lastAutoBackupDate, settings.lastAutoBackupDate);
  }
  if (
    settings.lastAutoBackupStatus === "success" ||
    settings.lastAutoBackupStatus === "failed" ||
    settings.lastAutoBackupStatus === "skipped" ||
    settings.lastAutoBackupStatus === ""
  ) {
    saveSetting(
      BACKUP_SETTING_KEYS.lastAutoBackupStatus,
      settings.lastAutoBackupStatus
    );
  }
  if (typeof settings.lastAutoBackupError === "string") {
    if (settings.lastAutoBackupError) {
      saveSetting(
        BACKUP_SETTING_KEYS.lastAutoBackupError,
        settings.lastAutoBackupError
      );
    } else {
      removeSetting(BACKUP_SETTING_KEYS.lastAutoBackupError);
    }
  }
  if (typeof settings.nextAutoBackupAt === "string") {
    saveSetting(BACKUP_SETTING_KEYS.nextAutoBackupAt, settings.nextAutoBackupAt);
  }
  if (
    settings.schedulerStatus === "scheduled" ||
    settings.schedulerStatus === "not_scheduled" ||
    settings.schedulerStatus === "permission_needed" ||
    settings.schedulerStatus === "failed"
  ) {
    saveSetting(BACKUP_SETTING_KEYS.schedulerStatus, settings.schedulerStatus);
  }

  return getBackupSettings();
};

const getTableRows = (table) => {
  try {
    return db.getAllSync(`SELECT * FROM ${table}`) || [];
  } catch {
    return [];
  }
};

const getTableColumns = (table) => {
  try {
    return (db.getAllSync(`PRAGMA table_info(${table})`) || []).map((row) => row.name);
  } catch {
    return [];
  }
};

const makeEmailFingerprint = (email, saltBase64) => {
  const bytes = sha256(utf8ToBytes(`${APP_NAME}:email-fingerprint:${saltBase64}:${email}`));
  return bytesToHex(bytes);
};

const deriveBackupKey = async (email, saltBytes, iterations = KDF_ITERATIONS) =>
  pbkdf2Async(sha256, normalizeEmail(email), saltBytes, {
    c: Number(iterations) || KDF_ITERATIONS,
    dkLen: KEY_BYTES,
    asyncTick: 20,
  });

const encryptPayload = async (payload, email, cancelToken, deadline) => {
  if (!validateBackupEmail(email)) {
    return {
      success: false,
      errorCode: "INVALID_EMAIL",
      message: "Enter a valid email ID for backup encryption.",
    };
  }

  try {
    const salt = await Crypto.getRandomBytesAsync(SALT_BYTES);
    const iv = await Crypto.getRandomBytesAsync(IV_BYTES);
    const saltBase64 = bytesToBase64(salt);
    const ivBase64 = bytesToBase64(iv);
    const normalizedEmail = normalizeEmail(email);
    const key = await deriveBackupKey(normalizedEmail, salt);
    assertBackupCanContinue(cancelToken, deadline);
    await yieldToUI();
    const plaintext = utf8ToBytes(JSON.stringify(payload));
    assertBackupCanContinue(cancelToken, deadline);
    await yieldToUI();
    const ciphertext = gcm(key, iv).encrypt(plaintext);
    assertBackupCanContinue(cancelToken, deadline);

    return {
      success: true,
      ciphertext: bytesToBase64(ciphertext),
      encryption: {
        algorithm: "AES-256-GCM",
        kdf: "PBKDF2-HMAC-SHA256",
        iterations: KDF_ITERATIONS,
        salt: saltBase64,
        iv: ivBase64,
        emailFingerprint: makeEmailFingerprint(normalizedEmail, saltBase64),
      },
    };
  } catch (error) {
    if (error?.errorCode) throw error;
    throw new BackupFlowError(
      "ENCRYPTION_FAILED",
      "Backup could not be protected. Please try again."
    );
  }
};

const decryptPayload = async (envelope, email) => {
  try {
    const manifest = envelope?.manifest || {};
    const encryption = manifest?.encryption || {};
    const normalizedEmail = normalizeEmail(email);
    const fingerprint = makeEmailFingerprint(normalizedEmail, encryption.salt || "");

    if (!validateBackupEmail(normalizedEmail) || fingerprint !== encryption.emailFingerprint) {
      return {
        success: false,
        errorCode: "WRONG_EMAIL",
        message: "Could not unlock this backup. Please check the email ID used for backup.",
      };
    }

    const salt = base64ToBytes(encryption.salt || "");
    const iv = base64ToBytes(encryption.iv || "");
    const key = await deriveBackupKey(normalizedEmail, salt, encryption.iterations);
    const decrypted = gcm(key, iv).decrypt(base64ToBytes(envelope.ciphertext || ""));
    const payload = JSON.parse(utf8BytesToString(decrypted));

    if (!payload?.manifest || payload.manifest.backupVersion !== BACKUP_VERSION) {
      return {
        success: false,
        errorCode: "INVALID_BACKUP",
        message: "This backup file is not supported.",
      };
    }

    return { success: true, manifest, payload };
  } catch {
    return {
      success: false,
      errorCode: "DECRYPT_FAILED",
      message: "Could not unlock this backup. Please check the email ID used for backup.",
    };
  }
};

const readAttachmentBase64 = async (attachment) => {
  const uri = getAttachmentFileUri(attachment);
  if (!uri) return null;

  try {
    const info = uri.startsWith("file://") ? await FileSystem.getInfoAsync(uri) : null;
    if (uri.startsWith("file://") && (!info?.exists || !Number(info.size))) {
      return null;
    }

    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return base64 ? { base64, size: Number(info?.size || attachment.size || 0) } : null;
  } catch {
    return null;
  }
};

const buildBackupTables = async (
  backupType,
  { onProgress, cancelToken, deadline } = {}
) => {
  const tables = {};
  for (let tableIndex = 0; tableIndex < TABLES.length; tableIndex += 1) {
    assertBackupCanContinue(cancelToken, deadline);
    const table = TABLES[tableIndex];
    tables[table] = getTableRows(table);
    emitBackupProgress(onProgress, {
      step: table === "tasks" ? "collecting_tasks" : "collecting_settings",
      percent: 18 + ((tableIndex + 1) / TABLES.length) * 7,
      label: table === "tasks" ? "Collecting tasks" : "Collecting app settings",
      detail: "Creating a safe snapshot of your app data.",
      current: tableIndex + 1,
      total: TABLES.length,
    });
    await yieldToUI();
  }

  const attachmentFiles = {};
  let attachmentCount = 0;
  let skippedAttachments = 0;

  const taskRows = tables.tasks || [];
  const totalAttachments =
    backupType === "full"
      ? taskRows.reduce(
          (count, row) => count + normalizeTaskAttachments(row).length,
          0
        )
      : 0;
  let processedAttachments = 0;
  const backedUpTaskRows = [];

  for (
    let taskIndex = 0;
    taskIndex < taskRows.length;
    taskIndex += ATTACHMENT_BATCH_SIZE
  ) {
    assertBackupCanContinue(cancelToken, deadline);
    const batch = taskRows.slice(taskIndex, taskIndex + ATTACHMENT_BATCH_SIZE);
    for (const taskRow of batch) {
      const normalized = normalizeTaskAttachments(taskRow);

      if (backupType !== "full") {
        backedUpTaskRows.push({
          ...taskRow,
          attachment: "",
          attachments: "[]",
        });
        continue;
      }

      const backedUpAttachments = [];
      for (const attachment of normalized) {
        assertBackupCanContinue(cancelToken, deadline);
        const filePayload = await readAttachmentBase64(attachment);
        processedAttachments += 1;
        if (!filePayload?.base64) {
          skippedAttachments += 1;
          emitBackupProgress(onProgress, {
            step: "collecting_attachments",
            percent: 25 + (processedAttachments / Math.max(totalAttachments, 1)) * 25,
            label: "Adding attachments",
            detail: `Processing attachment ${processedAttachments} of ${totalAttachments}.`,
            current: processedAttachments,
            total: totalAttachments,
          });
          await yieldToUI();
          continue;
        }

        const backupFileId =
          safeString(attachment.id) ||
          `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const displayName = getDisplayFileName(attachment);
        const extension = getFileExtension(displayName, attachment.mimeType);
        const mimeType = getAttachmentMimeType(attachment);

        attachmentFiles[backupFileId] = {
          id: backupFileId,
          name: displayName,
          extension,
          mimeType,
          size: filePayload.size || attachment.size || 0,
          base64: filePayload.base64,
        };

        backedUpAttachments.push({
          ...attachment,
          name: displayName,
          mimeType,
          extension,
          size: filePayload.size || attachment.size,
          uri: `backup://${backupFileId}`,
          localUri: `backup://${backupFileId}`,
          originalUri: undefined,
          backupFileId,
          isAppOwned: true,
        });
        attachmentCount += 1;
        emitBackupProgress(onProgress, {
          step: "collecting_attachments",
          percent: 25 + (processedAttachments / Math.max(totalAttachments, 1)) * 25,
          label: "Adding attachments",
          detail: `Processing attachment ${processedAttachments} of ${totalAttachments}.`,
          current: processedAttachments,
          total: totalAttachments,
        });
        await yieldToUI();
      }

      backedUpTaskRows.push({
        ...taskRow,
        attachment: getPrimaryAttachmentUri(backedUpAttachments),
        attachments: JSON.stringify(backedUpAttachments),
      });
    }
    await yieldToUI();
  }
  tables.tasks = backedUpTaskRows;

  return {
    tables,
    attachmentFiles,
    counts: {
      tasks: tables.tasks.length,
      attachments: attachmentCount,
      skippedAttachments,
    },
  };
};

export const createBackup = async (options = {}) => {
  const type = options.type === "full" ? "full" : "minimum";
  const mode = options.mode || "manual";
  const email = normalizeEmail(options.email);
  const onProgress = options.onProgress;
  const cancelToken = options.cancelToken || { cancelled: false };
  const startedAt = Date.now();
  const timeoutMs = Math.max(
    1000,
    Number(options.timeoutMs) ||
      (type === "full" ? FULL_BACKUP_TIMEOUT_MS : MINIMUM_BACKUP_TIMEOUT_MS)
  );
  const deadline = startedAt + timeoutMs;
  let tempPath = "";

  if (backupInProgress) {
    return {
      success: false,
      errorCode: "BACKUP_ALREADY_RUNNING",
      message: "A backup is already running.",
      source: getBackupSourceFromMode(mode),
      activeSource: activeBackupSource,
    };
  }

  emitBackupProgress(onProgress, {
    step: "checking_email",
    percent: 5,
    label: "Preparing backup",
    detail: "Checking backup email.",
  });

  if (!validateBackupEmail(email)) {
    return {
      success: false,
      errorCode: "INVALID_EMAIL",
      message: "Enter a valid email ID for backup encryption.",
    };
  }

  backupInProgress = true;
  activeBackupSource = getBackupSourceFromMode(mode);
  debugBackup("started", {
    backupType: type,
    source: activeBackupSource,
  });
  try {
    assertBackupCanContinue(cancelToken, deadline);
    await yieldToUI();
    emitBackupProgress(onProgress, {
      step: "collecting_tasks",
      percent: 18,
      label: "Preparing backup",
      detail: "Collecting app data.",
    });
    const backupData = await buildBackupTables(type, {
      onProgress,
      cancelToken,
      deadline,
    });
    debugBackup("snapshot ready", {
      backupType: type,
      source: activeBackupSource,
      taskCount: backupData.counts.tasks,
      attachmentCount: backupData.counts.attachments,
      skippedAttachmentCount: backupData.counts.skippedAttachments,
      durationMs: Date.now() - startedAt,
    });
    const createdAt = new Date().toISOString();
    const manifest = {
      appName: APP_NAME,
      backupVersion: BACKUP_VERSION,
      backupType: type,
      createdAt,
      encrypted: true,
      encryption: {
        algorithm: "AES-256-GCM",
        kdf: "PBKDF2-HMAC-SHA256",
        salt: "",
        iv: "",
        emailFingerprint: "",
      },
      counts: backupData.counts,
    };

    const payload = {
      manifest,
      data: {
        tables: backupData.tables,
        attachments: backupData.attachmentFiles,
      },
    };
    emitBackupProgress(onProgress, {
      step: "encrypting",
      percent: 50,
      label: "Encrypting backup",
      detail: "Protecting the backup file.",
    });
    await yieldToUI();
    const encrypted = await encryptPayload(payload, email, cancelToken, deadline);
    if (!encrypted.success) return encrypted;
    assertBackupCanContinue(cancelToken, deadline);

    const envelopeManifest = {
      ...manifest,
      encryption: encrypted.encryption,
    };
    const envelope = {
      kind: BACKUP_KIND,
      manifest: envelopeManifest,
      ciphertext: encrypted.ciphertext,
    };

    const directory = getBackupDirectory(mode);
    emitBackupProgress(onProgress, {
      step: "writing_file",
      percent: 72,
      label: "Saving backup",
      detail: "Creating app-owned backup file.",
    });
    await ensureDirectoryAsync(directory);
    await ensureDirectoryAsync(getBackupTempDirectory());
    const fileName = getBackupFileName(type, mode);
    const path = `${directory}${fileName}`;
    tempPath = `${getBackupTempDirectory()}backup-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.tmp`;

    await yieldToUI();
    await FileSystem.writeAsStringAsync(tempPath, JSON.stringify(envelope), {
      encoding: FileSystem.EncodingType.UTF8,
    });
    assertBackupCanContinue(cancelToken, deadline);
    const tempInfo = await FileSystem.getInfoAsync(tempPath).catch(() => null);
    if (!tempInfo?.exists || !Number(tempInfo.size)) {
      throw new BackupFlowError("FILE_WRITE_FAILED", "Backup file could not be saved.");
    }
    await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => null);
    await FileSystem.moveAsync({ from: tempPath, to: path });
    tempPath = "";
    const finalInfo = await FileSystem.getInfoAsync(path).catch(() => null);
    if (!finalInfo?.exists || !Number(finalInfo.size)) {
      throw new BackupFlowError("FILE_WRITE_FAILED", "Backup file could not be saved.");
    }

    emitBackupProgress(onProgress, {
      step: "updating_index",
      percent: 86,
      label: "Updating backup list",
      detail: "Saving backup details.",
    });
    let indexItem = null;
    let indexWarning = "";
    try {
      indexItem = await buildBackupIndexItem({
        path,
        fileName,
        manifest: envelopeManifest,
        source: getBackupSourceFromMode(mode),
      });
      await upsertBackupIndexItem(indexItem);
    } catch {
      indexItem = null;
      indexWarning = "Backup was created, but the backup list could not be updated.";
    }

    if (mode === "auto") {
      emitBackupProgress(onProgress, {
        step: "cleanup",
        percent: 94,
        label: "Cleaning old backups",
        detail: "Keeping the latest automatic backups.",
      });
      await saveBackupSettings({
        lastAutoBackupAt: createdAt,
        lastAutoBackupDate: todayKey(),
        lastAutoBackupStatus: "success",
        lastAutoBackupError: "",
      });
      await cleanupOldBackups(directory, 2);
    }

    emitBackupProgress(onProgress, {
      step: "complete",
      percent: 100,
      label: "Backup ready",
      detail: "Backup created.",
    });
    debugBackup("complete", {
      backupType: type,
      source: getBackupSourceFromMode(mode),
      taskCount: backupData.counts.tasks,
      attachmentCount: backupData.counts.attachments,
      skippedAttachmentCount: backupData.counts.skippedAttachments,
      size: Number(finalInfo.size),
      durationMs: Date.now() - startedAt,
      warningCode: indexWarning ? "INDEX_UPDATE_FAILED" : "",
    });

    return {
      success: true,
      path,
      uri: path,
      fileName,
      manifest: envelopeManifest,
      counts: backupData.counts,
      indexItem,
      errorCode: indexWarning ? "INDEX_UPDATE_FAILED" : undefined,
      message:
        indexWarning ||
        (backupData.counts.skippedAttachments > 0
          ? "Backup created. Some missing attachments were skipped."
          : "Backup created successfully."),
      backupPath: path,
      backupName: fileName,
      backupType: type,
      source: getBackupSourceFromMode(mode),
      taskCount: backupData.counts.tasks,
      attachmentCount: backupData.counts.attachments,
      skippedAttachmentCount: backupData.counts.skippedAttachments,
      size: Number(finalInfo.size),
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const errorCode = error?.errorCode || "UNKNOWN_ERROR";
    debugBackup("failed", {
      backupType: type,
      source: getBackupSourceFromMode(mode),
      errorCode,
      durationMs: Date.now() - startedAt,
    });
    return {
      success: false,
      cancelled: errorCode === "BACKUP_CANCELLED",
      errorCode,
      message:
        error?.message || "Backup could not be created. Please try again.",
      backupType: type,
      source: getBackupSourceFromMode(mode),
      durationMs: Date.now() - startedAt,
      error,
    };
  } finally {
    if (tempPath) {
      emitBackupProgress(onProgress, {
        step: "cleanup",
        percent: 96,
        label: "Cleaning temporary files",
        detail: "Removing unfinished backup data.",
      });
      await FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => null);
    }
    backupInProgress = false;
    activeBackupSource = "";
  }
};

const cleanupOldExternalAutoBackups = async (directoryUri, keepCount = 2) => {
  if (Platform.OS !== "android" || !FileSystem.StorageAccessFramework) return;

  const entries = await readSafDirectory(directoryUri);
  if (entries === null) return;

  const oldBackupUris = entries
    .filter((uri) => {
      const name = getSafFileName(uri);
      return name.startsWith("auto-") && name.endsWith(`.${BACKUP_EXTENSION}`);
    })
    .sort((left, right) => getSafFileName(right).localeCompare(getSafFileName(left)))
    .slice(Math.max(0, keepCount));

  for (const uri of oldBackupUris) {
    await FileSystem.StorageAccessFramework.deleteAsync(uri, {
      idempotent: true,
    }).catch(() => null);
  }
};

export const exportBackup = async (backupPath, fileName = "", options = {}) => {
  const onProgress = options.onProgress;
  emitBackupProgress(onProgress, {
    percent: 8,
    label: "Exporting backup",
    detail: "Checking backup file.",
  });

  if (!backupPath) {
    return {
      success: false,
      errorCode: "FILE_NOT_FOUND",
      message: "Could not export backup on this device.",
    };
  }

  try {
    const info = await FileSystem.getInfoAsync(backupPath);
    if (!info?.exists) {
      return {
        success: false,
        errorCode: "FILE_NOT_FOUND",
        message: "Could not export backup on this device.",
      };
    }

    const exportName =
      safeString(fileName) || backupPath.split("/").filter(Boolean).pop() || getBackupFileName();
    emitBackupProgress(onProgress, {
      percent: 28,
      label: "Exporting backup",
      detail: "Reading backup file.",
    });
    const contents = await FileSystem.readAsStringAsync(backupPath, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    if (Platform.OS === "android" && FileSystem.StorageAccessFramework) {
      emitBackupProgress(onProgress, {
        percent: 48,
        label: "Exporting backup",
        detail: "Preparing the backup folder.",
      });
      const folderAccess =
        options.requestFolderPermission === false
          ? await getBackupFolderAccess()
          : await requestBackupFolderAccess();

      if (!folderAccess?.success || !folderAccess.directoryUri) {
        return {
          success: false,
          cancelled: Boolean(folderAccess?.cancelled),
          errorCode:
            folderAccess?.errorCode || "BACKUP_FOLDER_PERMISSION_REQUIRED",
          message:
            folderAccess?.message ||
            "Backup folder permission is needed before exporting.",
        };
      }

      const targetUri = await FileSystem.StorageAccessFramework.createFileAsync(
        folderAccess.directoryUri,
        exportName,
        BACKUP_MIME_TYPE
      );
      emitBackupProgress(onProgress, {
        percent: 78,
        label: "Exporting backup",
        detail: "Writing backup file.",
      });
      await FileSystem.StorageAccessFramework.writeAsStringAsync(targetUri, contents, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (options.cleanupAutoBackups) {
        await cleanupOldExternalAutoBackups(folderAccess.directoryUri, 2);
      }

      emitBackupProgress(onProgress, {
        percent: 100,
        label: "Export complete",
        detail: "Backup exported.",
      });

      return {
        success: true,
        uri: targetUri,
        fileName: exportName,
        directoryUri: folderAccess.directoryUri,
        folderCreated: Boolean(folderAccess.folderCreated),
        folderName: EXTERNAL_BACKUP_DIR_NAME,
        message: `Backup saved in ${EXTERNAL_BACKUP_DIR_NAME}.`,
      };
    }

    if (await Sharing.isAvailableAsync()) {
      emitBackupProgress(onProgress, {
        percent: 78,
        label: "Exporting backup",
        detail: "Opening share sheet.",
      });
      await Sharing.shareAsync(backupPath, {
        mimeType: BACKUP_MIME_TYPE,
        dialogTitle: "Export backup",
      });
      emitBackupProgress(onProgress, {
        percent: 100,
        label: "Export complete",
        detail: "Backup exported.",
      });
      return {
        success: true,
        uri: backupPath,
        fileName: exportName,
        message: "Backup exported.",
      };
    }

    return {
      success: false,
      errorCode: "EXPORT_FAILED",
      message: "Could not export backup on this device.",
    };
  } catch (error) {
    return {
      success: false,
      errorCode: "EXPORT_FAILED",
      message: "Could not export backup on this device.",
      error,
    };
  }
};

export const importBackup = async (fileUri, email, options = {}) => {
  const onProgress = options.onProgress;
  emitBackupProgress(onProgress, {
    percent: 8,
    label: "Importing backup",
    detail: "Opening backup file.",
  });

  if (!fileUri) {
    return {
      success: false,
      errorCode: "IMPORT_CANCELLED",
      message: "Import cancelled.",
    };
  }

  try {
    const contents = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    emitBackupProgress(onProgress, {
      percent: 28,
      label: "Importing backup",
      detail: "Checking backup format.",
    });
    const envelope = JSON.parse(contents);

    if (
      envelope?.kind !== BACKUP_KIND ||
      envelope?.manifest?.appName !== APP_NAME ||
      envelope?.manifest?.backupVersion !== BACKUP_VERSION ||
      envelope?.manifest?.encrypted !== true ||
      !envelope?.ciphertext
    ) {
      return {
        success: false,
        errorCode: "INVALID_BACKUP",
        message: "This backup file is not supported.",
      };
    }

    emitBackupProgress(onProgress, {
      percent: 52,
      label: "Unlocking backup",
      detail: "Checking the backup email.",
    });
    const decrypted = await decryptPayload(envelope, email);
    if (!decrypted.success) return decrypted;

    const tables = decrypted.payload?.data?.tables || {};
    if (!Array.isArray(tables.tasks)) {
      return {
        success: false,
        errorCode: "INVALID_BACKUP",
        message: "This backup file is not supported.",
      };
    }

    emitBackupProgress(onProgress, {
      percent: 74,
      label: "Importing backup",
      detail: "Preparing restore summary.",
    });
    let storedPath = isAppOwnedBackupPath(fileUri) ? fileUri : "";
    if (!storedPath && fileUri.startsWith("file://")) {
      try {
        const manualDir = getBackupDirectory("manual");
        await ensureDirectoryAsync(manualDir);
        const fileName = `imported-${timestampForFile()}-${
          decrypted.manifest.backupType === "full" ? "full" : "minimum"
        }.${BACKUP_EXTENSION}`;
        storedPath = `${manualDir}${fileName}`;
        await FileSystem.copyAsync({ from: fileUri, to: storedPath });
        const indexItem = await buildBackupIndexItem({
          path: storedPath,
          fileName,
          manifest: decrypted.manifest,
          source: "manual",
        });
        await upsertBackupIndexItem(indexItem);
      } catch {
        storedPath = "";
      }
    }

    emitBackupProgress(onProgress, {
      percent: 100,
      label: "Backup unlocked",
      detail: "Restore summary is ready.",
    });

    return {
      success: true,
      manifest: decrypted.manifest,
      payload: decrypted.payload,
      path: storedPath || fileUri,
      summary: {
        backupType: decrypted.manifest.backupType,
        createdAt: decrypted.manifest.createdAt,
        backupVersion: decrypted.manifest.backupVersion,
        tasks: decrypted.manifest.counts?.tasks || tables.tasks.length,
        attachments: decrypted.manifest.counts?.attachments || 0,
        skippedAttachments: decrypted.manifest.counts?.skippedAttachments || 0,
      },
    };
  } catch (error) {
    return {
      success: false,
      errorCode: "INVALID_BACKUP",
      message: "This backup file is not supported.",
      error,
    };
  }
};

export const refreshBackupIndex = async () => {
  const existing = (await readBackupIndex()).map(normalizeBackupIndexItem);
  const scannedItems = [];
  const scannedIds = new Set();

  await ensureDirectoryAsync(getBackupBaseDirectory());

  for (const { source, dir } of BACKUP_SOURCE_DIRECTORIES) {
    await ensureDirectoryAsync(dir);
    const entries = await FileSystem.readDirectoryAsync(dir).catch(() => []);

    for (const name of entries) {
      if (!name.endsWith(`.${BACKUP_EXTENSION}`)) continue;

      const path = `${dir}${name}`;
      const manifest = await readBackupManifestFromPath(path);
      const item = await buildBackupIndexItem({
        path,
        fileName: name,
        manifest: manifest || {},
        source,
        status: manifest ? "ready" : "error",
      });
      scannedItems.push(item);
      scannedIds.add(item.id);
    }
  }

  for (const item of existing) {
    if (!item.path || scannedIds.has(item.id)) continue;
    if (!isAppOwnedBackupPath(item.path)) continue;

    const info = await FileSystem.getInfoAsync(item.path).catch(() => null);
    if (!info?.exists) {
      scannedItems.push(
        normalizeBackupIndexItem({
          ...item,
          status: "missing",
        })
      );
    }
  }

  const sorted = scannedItems.sort((a, b) => {
    const byDate = new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    if (byDate !== 0) return byDate;
    return String(b.name).localeCompare(String(a.name));
  });

  await writeBackupIndex(sorted);
  return sorted;
};

export const listBackups = async () => refreshBackupIndex();

export const exportBackupFromPath = async (backupPath, fileName = "", options = {}) =>
  exportBackup(backupPath, fileName, options);

export const deleteBackupById = async (id) => {
  const backups = await readBackupIndex();
  const backup = backups.find((item) => item.id === id);

  if (!backup?.path || !isAppOwnedBackupPath(backup.path)) {
    return {
      success: false,
      errorCode: "FILE_NOT_FOUND",
      message: "Could not delete this backup.",
    };
  }

  try {
    await FileSystem.deleteAsync(backup.path, { idempotent: true });
    const nextIndex = backups.filter((item) => item.id !== id);
    await writeBackupIndex(nextIndex);

    return {
      success: true,
      message: "Backup deleted.",
    };
  } catch (error) {
    return {
      success: false,
      errorCode: "DELETE_FAILED",
      message: "Could not delete this backup.",
      error,
    };
  }
};

const getUniqueAttachmentPath = async (fileName, seed) => {
  const attachmentDir = `${FileSystem.documentDirectory}${ATTACHMENT_DIR_NAME}/`;
  await ensureDirectoryAsync(attachmentDir);

  const safeName = getSafeInternalFileName(fileName || "attachment.bin", seed);
  const dotIndex = safeName.lastIndexOf(".");
  const base = dotIndex > 0 ? safeName.slice(0, dotIndex) : safeName;
  const ext = dotIndex > 0 ? safeName.slice(dotIndex) : "";

  let candidate = `${attachmentDir}${safeName}`;
  let counter = 2;
  while ((await FileSystem.getInfoAsync(candidate).catch(() => null))?.exists) {
    candidate = `${attachmentDir}${base}-${counter}${ext}`;
    counter += 1;
  }

  return candidate;
};

const restoreAttachmentFilesForTask = async (taskRow, attachmentFiles = {}) => {
  const backupAttachments = parseJson(taskRow.attachments, []);
  if (!Array.isArray(backupAttachments) || !backupAttachments.length) {
    return { row: { ...taskRow, attachment: "", attachments: "[]" }, skipped: 0 };
  }

  const restoredAttachments = [];
  let skipped = 0;

  for (const attachment of backupAttachments) {
    const fileRecord = attachmentFiles[attachment.backupFileId];
    if (!fileRecord?.base64) {
      skipped += 1;
      continue;
    }

    try {
      const displayName = getDisplayFileName({
        ...attachment,
        name: attachment.name || fileRecord.name,
        mimeType: attachment.mimeType || fileRecord.mimeType,
      });
      const targetUri = await getUniqueAttachmentPath(
        displayName,
        `restored-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      );
      await FileSystem.writeAsStringAsync(targetUri, fileRecord.base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const info = await FileSystem.getInfoAsync(targetUri);
      if (!info?.exists || !Number(info.size)) {
        await FileSystem.deleteAsync(targetUri, { idempotent: true }).catch(() => null);
        skipped += 1;
        continue;
      }

      const rest = { ...attachment };
      delete rest.backupFileId;
      restoredAttachments.push({
        ...rest,
        name: displayName,
        uri: targetUri,
        localUri: targetUri,
        originalUri: undefined,
        mimeType: attachment.mimeType || fileRecord.mimeType,
        extension: attachment.extension || fileRecord.extension,
        size: Number(info.size),
        isAppOwned: true,
      });
    } catch {
      skipped += 1;
    }
  }

  return {
    row: {
      ...taskRow,
      attachment: getPrimaryAttachmentUri(restoredAttachments),
      attachments: JSON.stringify(restoredAttachments),
    },
    skipped,
  };
};

const prepareTaskRowsForRestore = async (tasks = [], attachmentFiles = {}, backupType = "minimum") => {
  const restoredRows = [];
  let skippedAttachments = 0;

  for (const taskRow of Array.isArray(tasks) ? tasks : []) {
    let nextRow = {
      ...taskRow,
      notificationId: "[]",
      strongAlarmId: "",
      strongAlarmScheduledAt: null,
      lastStrongAlarmResult: "",
    };

    if (backupType === "full") {
      const restored = await restoreAttachmentFilesForTask(nextRow, attachmentFiles);
      nextRow = restored.row;
      skippedAttachments += restored.skipped;
    } else {
      nextRow.attachment = "";
      nextRow.attachments = "[]";
    }

    restoredRows.push(nextRow);
  }

  return { rows: restoredRows, skippedAttachments };
};

const insertRows = (table, rows = []) => {
  const columns = getTableColumns(table);
  if (!columns.length) return;

  for (const row of rows) {
    const usableColumns = columns.filter((column) => row[column] !== undefined);
    if (!usableColumns.length) continue;

    const placeholders = usableColumns.map(() => "?").join(", ");
    const values = usableColumns.map((column) => {
      const value = row[column];
      if (Array.isArray(value) || (value && typeof value === "object")) {
        return JSON.stringify(value);
      }
      return value;
    });

    db.runSync(
      `INSERT INTO ${table} (${usableColumns.join(", ")}) VALUES (${placeholders})`,
      values
    );
  }
};

const replaceTables = (tables = {}) => {
  db.execSync("BEGIN TRANSACTION;");
  try {
    for (const table of TABLES) {
      db.execSync(`DELETE FROM ${table};`);
    }

    for (const table of TABLES) {
      insertRows(table, Array.isArray(tables[table]) ? tables[table] : []);
    }

    db.execSync("COMMIT;");
  } catch (error) {
    db.execSync("ROLLBACK;");
    throw error;
  }
};

export const restoreBackup = async (importedBackup, options = {}) => {
  const onProgress = options.onProgress;

  emitBackupProgress(onProgress, {
    percent: 5,
    label: "Restoring backup",
    detail: "Checking backup data.",
  });

  if (!importedBackup?.payload?.data?.tables) {
    return {
      success: false,
      errorCode: "INVALID_BACKUP",
      message: "This backup file is not supported.",
    };
  }

  restoreInProgress = true;
  try {
    let safetyBackup = null;
    if (options.email && validateBackupEmail(options.email)) {
      emitBackupProgress(onProgress, {
        percent: 12,
        label: "Creating safety backup",
        detail: "Protecting your current app data first.",
      });
      safetyBackup = await createBackup({
        type: "full",
        mode: "preRestore",
        email: options.email,
        onProgress: createProgressMapper(onProgress, 12, 42, {
          label: "Creating safety backup",
          detail: "Protecting your current app data first.",
        }),
      });
    }

    const payload = importedBackup.payload;
    const backupType = payload.manifest?.backupType === "full" ? "full" : "minimum";
    const tables = { ...payload.data.tables };
    emitBackupProgress(onProgress, {
      percent: 50,
      label: "Preparing restore",
      detail: "Preparing restored tasks and attachments.",
    });
    const preparedTasks = await prepareTaskRowsForRestore(
      tables.tasks,
      payload.data.attachments || {},
      backupType
    );

    tables.tasks = preparedTasks.rows;
    emitBackupProgress(onProgress, {
      percent: 76,
      label: "Restoring backup",
      detail: "Replacing app data.",
    });
    replaceTables(tables);
    emitBackupProgress(onProgress, {
      percent: 100,
      label: "Restore ready",
      detail: "Restored data is in place.",
    });

    return {
      success: true,
      restored: true,
      safetyBackupPath: safetyBackup?.success ? safetyBackup.path : "",
      skippedAttachments:
        Number(payload.manifest?.counts?.skippedAttachments || 0) +
        Number(preparedTasks.skippedAttachments || 0),
      message: "Backup restored.",
    };
  } catch (error) {
    return {
      success: false,
      errorCode: "RESTORE_FAILED",
      message: "Could not restore this backup.",
      error,
    };
  } finally {
    restoreInProgress = false;
  }
};

export const cleanupOldBackups = async (folder, keepCount = 2) => {
  try {
    const entries = await FileSystem.readDirectoryAsync(folder);
    const backupFiles = [];

    for (const name of entries) {
      if (!name.endsWith(`.${BACKUP_EXTENSION}`)) continue;
      const uri = `${folder}${name}`;
      const info = await FileSystem.getInfoAsync(uri).catch(() => null);
      if (info?.exists) {
        backupFiles.push({ uri, name, modifiedTime: Number(info.modificationTime || 0) });
      }
    }

    const removed = backupFiles
      .sort((a, b) => b.modifiedTime - a.modifiedTime)
      .slice(Math.max(0, keepCount));

    for (const file of removed) {
      await FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => null);
    }

    if (removed.length > 0) {
      const removedUris = new Set(removed.map((file) => file.uri));
      const index = await readBackupIndex();
      await writeBackupIndex(index.filter((item) => !removedUris.has(item.path)));
    }
  } catch {
    // Cleanup should never block backup creation.
  }
};

const findAutoBackupForToday = async () => {
  const folder = getBackupDirectory("auto");
  await ensureDirectoryAsync(folder);
  const entries = await FileSystem.readDirectoryAsync(folder).catch(() => []);
  const today = todayKey();

  return entries.find(
    (name) =>
      name.startsWith(`auto-${today}-`) && name.endsWith(`.${BACKUP_EXTENSION}`)
  );
};

export const createAutoBackupIfNeeded = async (options = {}) => {
  if (backupInProgress || restoreInProgress) {
    return {
      success: false,
      skipped: true,
      reason: "BACKUP_ALREADY_RUNNING",
      errorCode: "BACKUP_ALREADY_RUNNING",
      message: "Auto backup is already running.",
    };
  }

  const settings = await getBackupSettings();
  if (!settings.autoEnabled) {
    return {
      success: true,
      skipped: true,
      reason: "AUTO_BACKUP_DISABLED",
      errorCode: "AUTO_BACKUP_DISABLED",
      message: "Daily auto backup is off.",
    };
  }

  if (options.dataReady === false) {
    return {
      success: false,
      skipped: true,
      reason: "DATA_NOT_READY",
      errorCode: "DATA_NOT_READY",
      message: "App data is not ready yet.",
    };
  }

  const today = todayKey();
  if (settings.lastAutoBackupDate === today || (await findAutoBackupForToday())) {
    await saveBackupSettings({
      lastAutoBackupStatus: "skipped",
      lastAutoBackupError: "",
    });
    return {
      success: true,
      skipped: true,
      reason: "ALREADY_BACKED_UP_TODAY",
      errorCode: "ALREADY_BACKED_UP_TODAY",
      message: "Auto backup already exists for today.",
    };
  }

  const email = normalizeEmail(options.email || (await getAutoBackupEmail()));
  if (!validateBackupEmail(email)) {
    await saveBackupSettings({
      lastAutoBackupStatus: "failed",
      lastAutoBackupError: "Auto backup needs setup.",
    });
    return {
      success: false,
      errorCode: "EMAIL_NOT_CONFIGURED",
      message: "Auto backup needs setup.",
    };
  }

  if (Platform.OS === "android" && FileSystem.StorageAccessFramework) {
    // A headless scheduled task cannot open Android's folder picker. Permission is
    // therefore collected while the user enables auto backup and only reused here.
    const folderAccess = await getBackupFolderAccess();
    if (!folderAccess?.success || !folderAccess.directoryUri) {
      const folderMessage =
        folderAccess?.message ||
        "Automatic backup needs permission to use the backup folder.";
      await saveBackupSettings({
        lastAutoBackupStatus: "failed",
        lastAutoBackupError: folderMessage,
      });
      return {
        success: false,
        errorCode:
          folderAccess?.errorCode || "BACKUP_FOLDER_PERMISSION_REQUIRED",
        message: folderMessage,
      };
    }
  }

  try {
    const result = await createBackup({
      type: settings.autoType,
      mode: "auto",
      email,
      onProgress: options.onProgress,
      cancelToken: options.cancelToken,
    });

    if (!result?.success) {
      await saveBackupSettings({
        lastAutoBackupStatus: "failed",
        lastAutoBackupError:
          result?.message || "Last auto backup could not be created.",
      });
      return {
        success: false,
        errorCode: result?.errorCode || "BACKUP_CREATE_FAILED",
        message: result?.message || "Last auto backup could not be created.",
      };
    }

    let externalBackupUri = "";
    if (Platform.OS === "android" && FileSystem.StorageAccessFramework) {
      const exportResult = await exportBackup(result.path, result.fileName, {
        requestFolderPermission: false,
        cleanupAutoBackups: true,
      });
      if (!exportResult?.success) {
        const folderMessage =
          exportResult?.message ||
          "Automatic backup needs permission to use the backup folder.";
        await saveBackupSettings({
          lastAutoBackupStatus: "failed",
          lastAutoBackupError: folderMessage,
        });
        return {
          success: false,
          backupCreatedInsideApp: true,
          backupPath: result.path,
          backupName: result.fileName,
          errorCode:
            exportResult?.errorCode || "BACKUP_FOLDER_PERMISSION_REQUIRED",
          message: folderMessage,
        };
      }
      externalBackupUri = exportResult.uri || "";
    }

    await refreshBackupIndex();
    return {
      success: true,
      backupPath: result.path,
      backupName: result.fileName,
      externalBackupUri,
      message:
        Platform.OS === "android"
          ? `Auto backup saved in ${EXTERNAL_BACKUP_DIR_NAME}.`
          : "Auto backup created.",
    };
  } catch {
    await saveBackupSettings({
      lastAutoBackupStatus: "failed",
      lastAutoBackupError: "Last auto backup could not be created.",
    });
    return {
      success: false,
      errorCode: "UNKNOWN_ERROR",
      message: "Last auto backup could not be created.",
    };
  } finally {
    // createBackup owns and always releases the shared creation lock.
  }
};

export const runScheduledAutoBackup = async () => {
  const result = await createAutoBackupIfNeeded({ dataReady: true });
  if (!result?.success && !result?.skipped) {
    await saveBackupSettings({
      lastAutoBackupStatus: "failed",
      lastAutoBackupError:
        result?.message || "Scheduled automatic backup could not be created.",
    });
  }
  return result;
};

export const restoreBackupFromPath = async (path, email, options = {}) => {
  if (!path) {
    return {
      success: false,
      errorCode: "FILE_NOT_FOUND",
      message: "Could not open this backup.",
    };
  }

  const imported = await importBackup(path, email, options);
  if (!imported?.success) return imported;

  const index = await readBackupIndex();
  const indexed = index.find((item) => item.path === path);

  return {
    ...imported,
    summary: {
      ...imported.summary,
      name:
        indexed?.name ||
        path.split("/").filter(Boolean).pop() ||
        "Backup",
      source: indexed?.source || "manual",
    },
  };
};

export const getBackupSummaryText = (summary = {}) => {
  const created = summary.createdAt
    ? new Date(summary.createdAt).toLocaleString()
    : "Unknown";

  return [
    summary.name ? `Name: ${summary.name}` : "",
    `Type: ${summary.backupType === "full" ? "Full backup" : "Minimum backup"}`,
    summary.source
      ? `Source: ${
          summary.source === "preRestore"
            ? "Pre-restore"
            : `${String(summary.source).slice(0, 1).toUpperCase()}${String(
                summary.source
              ).slice(1)}`
        }`
      : "",
    `Created: ${created}`,
    `Tasks: ${summary.tasks || 0}`,
    `Attachments: ${summary.attachments || 0}`,
    `Skipped attachments: ${summary.skippedAttachments || 0}`,
    `Version: ${summary.backupVersion || BACKUP_VERSION}`,
  ]
    .filter(Boolean)
    .join("\n");
};
