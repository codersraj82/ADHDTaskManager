import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
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
const KDF_ITERATIONS = 210000;
const KEY_BYTES = 32;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const BACKUP_MIME_TYPE = "application/octet-stream";

const BACKUP_SETTING_KEYS = {
  autoEnabled: "backup.autoEnabled",
  autoType: "backup.autoType",
  lastAutoBackupAt: "backup.lastAutoBackupAt",
  lastAutoBackupDate: "backup.lastAutoBackupDate",
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

const todayKey = () => new Date().toISOString().slice(0, 10);

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

const ensureDirectoryAsync = async (dir) => {
  if (!dir) return;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => null);
};

const getBackupDirectory = (mode = "manual") => {
  const base = `${FileSystem.documentDirectory}${BACKUP_DIR_NAME}/`;
  if (mode === "auto") return `${base}${AUTO_BACKUP_DIR_NAME}/`;
  if (mode === "preRestore") return `${base}pre-restore/`;
  return `${base}manual/`;
};

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

export const getBackupSettings = async () => {
  const settings = getSettingsMap();
  return {
    autoEnabled: settings[BACKUP_SETTING_KEYS.autoEnabled] === "true",
    autoType:
      settings[BACKUP_SETTING_KEYS.autoType] === "full" ? "full" : "minimum",
    lastAutoBackupAt: settings[BACKUP_SETTING_KEYS.lastAutoBackupAt] || "",
    lastAutoBackupDate: settings[BACKUP_SETTING_KEYS.lastAutoBackupDate] || "",
  };
};

export const saveBackupSettings = async (settings = {}) => {
  if (typeof settings.autoEnabled === "boolean") {
    saveSetting(BACKUP_SETTING_KEYS.autoEnabled, settings.autoEnabled ? "true" : "false");
  }
  if (settings.autoType === "minimum" || settings.autoType === "full") {
    saveSetting(BACKUP_SETTING_KEYS.autoType, settings.autoType);
  }
  if (typeof settings.lastAutoBackupAt === "string") {
    saveSetting(BACKUP_SETTING_KEYS.lastAutoBackupAt, settings.lastAutoBackupAt);
  }
  if (typeof settings.lastAutoBackupDate === "string") {
    saveSetting(BACKUP_SETTING_KEYS.lastAutoBackupDate, settings.lastAutoBackupDate);
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

const encryptPayload = async (payload, email) => {
  if (!validateBackupEmail(email)) {
    return {
      success: false,
      errorCode: "INVALID_EMAIL",
      message: "Enter a valid email ID for backup encryption.",
    };
  }

  const salt = await Crypto.getRandomBytesAsync(SALT_BYTES);
  const iv = await Crypto.getRandomBytesAsync(IV_BYTES);
  const saltBase64 = bytesToBase64(salt);
  const ivBase64 = bytesToBase64(iv);
  const normalizedEmail = normalizeEmail(email);
  const key = await deriveBackupKey(normalizedEmail, salt);
  const plaintext = utf8ToBytes(JSON.stringify(payload));
  const ciphertext = gcm(key, iv).encrypt(plaintext);

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

const buildBackupTables = async (backupType) => {
  const tables = TABLES.reduce((acc, table) => {
    acc[table] = getTableRows(table);
    return acc;
  }, {});

  const attachmentFiles = {};
  let attachmentCount = 0;
  let skippedAttachments = 0;

  tables.tasks = await Promise.all(
    (tables.tasks || []).map(async (taskRow) => {
      const normalized = normalizeTaskAttachments(taskRow);

      if (backupType !== "full") {
        return {
          ...taskRow,
          attachment: "",
          attachments: "[]",
        };
      }

      const backedUpAttachments = [];
      for (const attachment of normalized) {
        const filePayload = await readAttachmentBase64(attachment);
        if (!filePayload?.base64) {
          skippedAttachments += 1;
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
      }

      return {
        ...taskRow,
        attachment: getPrimaryAttachmentUri(backedUpAttachments),
        attachments: JSON.stringify(backedUpAttachments),
      };
    })
  );

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

  if (!validateBackupEmail(email)) {
    return {
      success: false,
      errorCode: "INVALID_EMAIL",
      message: "Enter a valid email ID for backup encryption.",
    };
  }

  try {
    const backupData = await buildBackupTables(type);
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
    const encrypted = await encryptPayload(payload, email);
    if (!encrypted.success) return encrypted;

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
    await ensureDirectoryAsync(directory);
    const fileName = getBackupFileName(type, mode);
    const path = `${directory}${fileName}`;

    await FileSystem.writeAsStringAsync(path, JSON.stringify(envelope), {
      encoding: FileSystem.EncodingType.UTF8,
    });

    if (mode === "auto") {
      await saveBackupSettings({
        lastAutoBackupAt: createdAt,
        lastAutoBackupDate: todayKey(),
      });
      await cleanupOldBackups(directory, 2);
    }

    return {
      success: true,
      path,
      uri: path,
      fileName,
      manifest: envelopeManifest,
      counts: backupData.counts,
      message: "Backup created.",
    };
  } catch (error) {
    return {
      success: false,
      errorCode: "BACKUP_CREATE_FAILED",
      message: "Could not create backup on this device.",
      error,
    };
  }
};

export const exportBackup = async (backupPath, fileName = "") => {
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
    const contents = await FileSystem.readAsStringAsync(backupPath, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    if (Platform.OS === "android" && FileSystem.StorageAccessFramework) {
      const permissions =
        await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

      if (!permissions?.granted) {
        return {
          success: false,
          cancelled: true,
          errorCode: "EXPORT_CANCELLED",
          message: "Export cancelled.",
        };
      }

      const targetUri = await FileSystem.StorageAccessFramework.createFileAsync(
        permissions.directoryUri,
        exportName,
        BACKUP_MIME_TYPE
      );
      await FileSystem.StorageAccessFramework.writeAsStringAsync(targetUri, contents, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      return {
        success: true,
        uri: targetUri,
        fileName: exportName,
        message: "Backup exported.",
      };
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(backupPath, {
        mimeType: BACKUP_MIME_TYPE,
        dialogTitle: "Export backup",
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

export const importBackup = async (fileUri, email) => {
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

    return {
      success: true,
      manifest: decrypted.manifest,
      payload: decrypted.payload,
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
  if (!importedBackup?.payload?.data?.tables) {
    return {
      success: false,
      errorCode: "INVALID_BACKUP",
      message: "This backup file is not supported.",
    };
  }

  try {
    let safetyBackup = null;
    if (options.email && validateBackupEmail(options.email)) {
      safetyBackup = await createBackup({
        type: "full",
        mode: "preRestore",
        email: options.email,
      });
    }

    const payload = importedBackup.payload;
    const backupType = payload.manifest?.backupType === "full" ? "full" : "minimum";
    const tables = { ...payload.data.tables };
    const preparedTasks = await prepareTaskRowsForRestore(
      tables.tasks,
      payload.data.attachments || {},
      backupType
    );

    tables.tasks = preparedTasks.rows;
    replaceTables(tables);

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

    backupFiles
      .sort((a, b) => b.modifiedTime - a.modifiedTime)
      .slice(Math.max(0, keepCount))
      .forEach((file) => {
        void FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => null);
      });
  } catch {
    // Cleanup should never block backup creation.
  }
};

export const createAutoBackupIfNeeded = async (options = {}) => {
  const settings = await getBackupSettings();
  if (!settings.autoEnabled) return null;
  if (settings.lastAutoBackupDate === todayKey()) return null;

  if (!validateBackupEmail(options.email)) {
    return {
      success: false,
      errorCode: "INVALID_EMAIL",
      message: "Enter a valid email ID for backup encryption.",
    };
  }

  return createBackup({
    type: settings.autoType,
    mode: "auto",
    email: options.email,
  });
};

export const getBackupSummaryText = (summary = {}) => {
  const created = summary.createdAt
    ? new Date(summary.createdAt).toLocaleString()
    : "Unknown";

  return [
    `Type: ${summary.backupType === "full" ? "Full backup" : "Minimum backup"}`,
    `Created: ${created}`,
    `Tasks: ${summary.tasks || 0}`,
    `Attachments: ${summary.attachments || 0}`,
    `Skipped attachments: ${summary.skippedAttachments || 0}`,
    `Version: ${summary.backupVersion || BACKUP_VERSION}`,
  ].join("\n");
};
