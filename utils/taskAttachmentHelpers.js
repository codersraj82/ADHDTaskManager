import { Linking, Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Sharing from "expo-sharing";

export const MAX_TASK_ATTACHMENTS = 10;

const ATTACHMENT_DIR_NAME = "task-attachments";
const SAVED_ATTACHMENT_DIR_NAME = "saved-attachments";

const EXTENSION_MIME_MAP = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  rtf: "application/rtf",
  zip: "application/zip",
  bin: "application/octet-stream",
};

const MIME_EXTENSION_MAP = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
  "application/json": "json",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/rtf": "rtf",
  "application/zip": "zip",
  "application/octet-stream": "bin",
};

const GENERIC_MIME_TYPES = new Set([
  "application/octet-stream",
  "application/unknown",
  "binary/octet-stream",
  "*/*",
]);

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "heic", "heif"]);
const SPREADSHEET_EXTENSIONS = new Set(["xls", "xlsx", "csv", "ods"]);
const WORD_EXTENSIONS = new Set(["doc", "docx", "odt"]);
const PRESENTATION_EXTENSIONS = new Set(["ppt", "pptx", "odp"]);
const TEXT_EXTENSIONS = new Set(["txt", "md", "rtf", "json", "csv"]);
const ARCHIVE_EXTENSIONS = new Set(["zip", "rar", "7z", "tar", "gz"]);
const TEXT_PREVIEW_MAX_BYTES = 250 * 1024;
const ANDROID_ACTION_VIEW = "android.intent.action.VIEW";
const ANDROID_FLAG_GRANT_READ_URI_PERMISSION = 1;

const nowId = () =>
  `att-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const getSafeString = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizeExtension = (extension = "") =>
  getSafeString(extension).replace(/^\.+/, "").toLowerCase();

const getExtensionFromMimeType = (mimeType = "") =>
  MIME_EXTENSION_MAP[getSafeString(mimeType).toLowerCase()] || "";

const isUsableMimeType = (mimeType = "") => {
  const normalizedMime = getSafeString(mimeType).toLowerCase();
  return Boolean(
    normalizedMime &&
      normalizedMime.includes("/") &&
      !GENERIC_MIME_TYPES.has(normalizedMime)
  );
};

export const getMimeTypeFromExtension = (extension = "") =>
  EXTENSION_MIME_MAP[normalizeExtension(extension)] || "application/octet-stream";

const getBestMimeType = (extension = "", providedMimeType = "") => {
  const normalizedExtension = normalizeExtension(extension);
  const normalizedMime = getSafeString(providedMimeType).toLowerCase();
  const mimeExtension = getExtensionFromMimeType(normalizedMime);

  if (
    isUsableMimeType(normalizedMime) &&
    (!normalizedExtension || !mimeExtension || mimeExtension === normalizedExtension)
  ) {
    return normalizedMime;
  }

  return getMimeTypeFromExtension(normalizedExtension);
};

const stripInternalAttachmentPrefix = (fileName = "") => {
  const name = getSafeString(fileName);
  const stripped = name.replace(/^att-\d+(?:-[a-z0-9]+)?-/i, "");
  return stripped || name;
};

const ensureFileNameHasExtension = (
  fileName = "",
  extension = "",
  fallbackBase = "attachment"
) => {
  const normalizedExtension = normalizeExtension(extension);
  const rawName = stripInternalAttachmentPrefix(fileName) || fallbackBase;
  const currentExtension = getFileExtension(rawName);

  if (!normalizedExtension || currentExtension) return rawName;
  return `${rawName}.${normalizedExtension}`;
};

const isAppOwnedAttachmentUri = (uri = "") => {
  const safeUri = getSafeString(uri);
  const documentDirectory = FileSystem.documentDirectory || "";

  return Boolean(
    safeUri &&
      documentDirectory &&
      safeUri.startsWith(documentDirectory) &&
      (safeUri.includes(`/${ATTACHMENT_DIR_NAME}/`) ||
        safeUri.includes(`/${SAVED_ATTACHMENT_DIR_NAME}/`))
  );
};

const parseAttachmentJson = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getNameFromUri = (uri) => {
  const cleanUri = getSafeString(uri).split("?")[0].split("#")[0];
  if (!cleanUri) return "";

  const parts = cleanUri.split(/[\\/]/).filter(Boolean);
  const lastPart = parts[parts.length - 1] || "";

  try {
    return decodeURIComponent(lastPart);
  } catch {
    return lastPart;
  }
};

export const getFileExtension = (fileName = "", mimeType = "") => {
  const cleanName = getSafeString(fileName).split("?")[0].split("#")[0];
  const lastDot = cleanName.lastIndexOf(".");
  if (lastDot > 0 && lastDot < cleanName.length - 1) {
    return normalizeExtension(cleanName.slice(lastDot + 1));
  }

  return getExtensionFromMimeType(mimeType);
};

export const sanitizeFileNameForStorage = (fileName = "attachment_file") => {
  const cleaned = getSafeString(fileName)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "attachment_file";
};

export const ensureUniqueFileName = (fileName, existingNames = []) => {
  const safeName = sanitizeFileNameForStorage(fileName);
  const existing = new Set(
    (Array.isArray(existingNames) ? existingNames : [])
      .filter(Boolean)
      .map((name) => String(name).toLowerCase())
  );

  if (!existing.has(safeName.toLowerCase())) return safeName;

  const dotIndex = safeName.lastIndexOf(".");
  const base = dotIndex > 0 ? safeName.slice(0, dotIndex) : safeName;
  const ext = dotIndex > 0 ? safeName.slice(dotIndex) : "";
  let counter = 2;
  let nextName = `${base} (${counter})${ext}`;

  while (existing.has(nextName.toLowerCase())) {
    counter += 1;
    nextName = `${base} (${counter})${ext}`;
  }

  return nextName;
};

export const getSafeInternalFileName = (originalName = "", idOrTimestamp = nowId()) => {
  const displayName = getDisplayFileName({ name: originalName });
  const extension = getFileExtension(displayName) || "bin";
  const dotIndex = displayName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? displayName.slice(0, dotIndex) : displayName;
  const safeBase = sanitizeFileNameForStorage(baseName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${sanitizeFileNameForStorage(idOrTimestamp)}-${safeBase || "attachment"}.${extension}`;
};

export const getDisplayFileName = (attachment = {}) => {
  const rawName =
    getSafeString(attachment.name) ||
    getSafeString(attachment.fileName) ||
    getSafeString(attachment.attachmentName) ||
    getNameFromUri(attachment.originalUri || attachment.localUri || attachment.uri);
  const displayName = stripInternalAttachmentPrefix(rawName);
  const extension =
    getFileExtension(displayName) ||
    normalizeExtension(attachment.extension) ||
    getExtensionFromMimeType(attachment.mimeType || attachment.type);

  if (displayName) {
    return ensureFileNameHasExtension(displayName, extension);
  }

  return extension ? `attachment.${extension}` : "attachment.bin";
};

const normalizeAttachment = (attachment = {}, fallback = {}) => {
  const localUri = getSafeString(attachment.localUri || fallback.localUri);
  const uri =
    localUri ||
    getSafeString(attachment.uri) ||
    getSafeString(attachment.originalUri) ||
    getSafeString(fallback.uri);

  if (!uri) return null;

  const rawDisplayName = getDisplayFileName({
    ...fallback,
    ...attachment,
    uri,
  });
  const extension = getFileExtension(
    rawDisplayName,
    attachment.mimeType || fallback.mimeType
  ) ||
    normalizeExtension(attachment.extension || fallback.extension) ||
    getExtensionFromMimeType(
      attachment.mimeType || fallback.mimeType || attachment.type || fallback.type
    ) ||
    "bin";
  const name = ensureFileNameHasExtension(rawDisplayName, extension);
  const mimeType = getBestMimeType(
    extension,
    attachment.mimeType || fallback.mimeType || attachment.type || fallback.type
  );
  const isAppOwned =
    (attachment.isAppOwned === true && isAppOwnedAttachmentUri(uri)) ||
    isAppOwnedAttachmentUri(localUri) ||
    isAppOwnedAttachmentUri(uri);

  return {
    id: getSafeString(attachment.id) || nowId(),
    name,
    uri,
    mimeType,
    size: Number.isFinite(Number(attachment.size ?? fallback.size))
      ? Number(attachment.size ?? fallback.size)
      : undefined,
    extension: extension || undefined,
    addedAt: getSafeString(attachment.addedAt) || new Date().toISOString(),
    isAppOwned,
    localUri: localUri || (isAppOwned ? uri : undefined),
    originalUri:
      getSafeString(attachment.originalUri || fallback.originalUri) ||
      (!isAppOwned ? uri : undefined),
  };
};

export const normalizeTaskAttachments = (task = {}) => {
  const parsedAttachments = parseAttachmentJson(task.attachments)
    .map((attachment) => normalizeAttachment(attachment))
    .filter(Boolean);

  if (parsedAttachments.length) return parsedAttachments;

  const legacyUri =
    getSafeString(task.attachmentUri) ||
    getSafeString(task.fileUri) ||
    getSafeString(task.attachment);

  if (!legacyUri) return [];

  const legacyName =
    getSafeString(task.attachmentName) ||
    getSafeString(task.fileName) ||
    getNameFromUri(legacyUri);

  const legacyAttachment = normalizeAttachment({
    id: "legacy-attachment",
    name: legacyName,
    uri: legacyUri,
    originalUri: legacyUri,
    mimeType: task.mimeType || task.attachmentMimeType,
    addedAt: task.createdAt || new Date().toISOString(),
    isAppOwned: false,
  });

  return legacyAttachment ? [legacyAttachment] : [];
};

export const serializeTaskAttachments = (attachments = []) =>
  JSON.stringify(
    (Array.isArray(attachments) ? attachments : [])
      .map((attachment) => normalizeAttachment(attachment))
      .filter(Boolean)
  );

export const getAttachmentFileUri = (attachment = {}) =>
  getSafeString(attachment.localUri) || getSafeString(attachment.uri);

export const getPrimaryAttachmentUri = (attachments = []) => {
  const normalized = Array.isArray(attachments) ? attachments : [];
  return normalized.length ? getAttachmentFileUri(normalized[0]) : "";
};

export const getAttachmentIcon = (attachment = {}) => {
  const extension = getFileExtension(getDisplayFileName(attachment), attachment.mimeType);
  const mimeType = getSafeString(attachment.mimeType).toLowerCase();

  if (mimeType.startsWith("image/") || IMAGE_EXTENSIONS.has(extension)) return "image";
  if (extension === "pdf" || mimeType === "application/pdf") return "file-text";
  if (SPREADSHEET_EXTENSIONS.has(extension)) return "grid";
  if (WORD_EXTENSIONS.has(extension)) return "file-text";
  if (PRESENTATION_EXTENSIONS.has(extension)) return "monitor";
  if (TEXT_EXTENSIONS.has(extension) || mimeType.startsWith("text/")) return "file-text";
  return "paperclip";
};

export const getAttachmentKind = (attachment = {}) => {
  const displayName = getDisplayFileName(attachment);
  const extension = getFileExtension(displayName, attachment.mimeType);
  const mimeType = getSafeString(attachment.mimeType).toLowerCase();

  if (mimeType.startsWith("image/") || IMAGE_EXTENSIONS.has(extension)) return "image";
  if (extension === "pdf" || mimeType === "application/pdf") return "pdf";
  if (extension === "csv" || mimeType === "text/csv") return "text";
  if (SPREADSHEET_EXTENSIONS.has(extension)) return "spreadsheet";
  if (WORD_EXTENSIONS.has(extension)) return "word";
  if (PRESENTATION_EXTENSIONS.has(extension)) return "presentation";
  if (TEXT_EXTENSIONS.has(extension) || mimeType.startsWith("text/")) return "text";
  if (ARCHIVE_EXTENSIONS.has(extension)) return "archive";
  return "unknown";
};

export const getAttachmentMimeType = (attachment = {}) => {
  const extension =
    getFileExtension(getDisplayFileName(attachment)) ||
    normalizeExtension(attachment.extension);
  return getBestMimeType(extension, attachment.mimeType || attachment.type);
};

export const getAttachmentViewerType = (attachment = {}) => {
  if (getAttachmentKind(attachment) === "image") return "image";
  return null;
};

export const getAttachmentTypeLabel = (attachment = {}) => {
  const kind = getAttachmentKind(attachment);
  const extension = getFileExtension(
    getDisplayFileName(attachment),
    attachment.mimeType
  );

  if (kind === "image") return "Image";
  if (kind === "pdf") return "PDF document";
  if (kind === "word") return "Word document";
  if (extension === "csv") return "CSV file";
  if (kind === "spreadsheet") {
    return "Spreadsheet";
  }
  if (kind === "presentation") return "Presentation";
  if (kind === "text") return "Text file";
  if (kind === "archive") return "Archive";
  return extension ? `${extension.toUpperCase()} file` : "Unknown file";
};

export const isDuplicateAttachment = (attachments = [], candidate = {}) => {
  const candidateName = getDisplayFileName(candidate).toLowerCase();
  const candidateSize = Number(candidate.size || 0);
  const candidateUri = getSafeString(candidate.originalUri || candidate.uri);

  return (Array.isArray(attachments) ? attachments : []).some((attachment) => {
    const attachmentName = getDisplayFileName(attachment).toLowerCase();
    const attachmentSize = Number(attachment.size || 0);
    const attachmentUri = getSafeString(
      attachment.originalUri || attachment.uri || attachment.localUri
    );

    return (
      attachmentName === candidateName &&
      attachmentSize === candidateSize &&
      (!candidateUri || !attachmentUri || attachmentUri === candidateUri)
    );
  });
};

export const copyAttachmentToAppStorage = async (fileAsset = {}) => {
  const sourceUri = getSafeString(fileAsset.uri);
  if (!sourceUri) {
    throw new Error("ATTACHMENT_MISSING_URI");
  }

  const id = nowId();
  const sourceName =
    getSafeString(fileAsset.name) ||
    getSafeString(fileAsset.fileName) ||
    getNameFromUri(sourceUri);
  const sourceExtension =
    getFileExtension(sourceName) ||
    getExtensionFromMimeType(fileAsset.mimeType || fileAsset.type) ||
    "bin";
  const mimeType = getBestMimeType(
    sourceExtension,
    fileAsset.mimeType || fileAsset.type
  );
  const displayName = ensureFileNameHasExtension(
    sourceName || `attachment-${Date.now()}`,
    sourceExtension,
    `attachment-${Date.now()}`
  );
  const storageName = ensureUniqueFileName(getSafeInternalFileName(displayName, id));
  const attachmentDir = new Directory(Paths.document, ATTACHMENT_DIR_NAME);
  attachmentDir.create({ intermediates: true, idempotent: true });

  const destinationFile = new File(attachmentDir, storageName);
  await FileSystem.copyAsync({
    from: sourceUri,
    to: destinationFile.uri,
  });

  let copiedSize = Number(fileAsset.size || 0) || undefined;
  try {
    const info = await FileSystem.getInfoAsync(destinationFile.uri);
    if (!info?.exists) {
      throw new Error("ATTACHMENT_COPY_MISSING");
    }

    if (Number.isFinite(Number(info.size))) {
      copiedSize = Number(info.size);
    }

    if (!copiedSize || copiedSize <= 0) {
      await FileSystem.deleteAsync(destinationFile.uri, { idempotent: true });
      throw new Error("ATTACHMENT_EMPTY_FILE");
    }
  } catch (error) {
    if (error?.message === "ATTACHMENT_EMPTY_FILE") {
      throw error;
    }
    await FileSystem.deleteAsync(destinationFile.uri, { idempotent: true }).catch(
      () => null
    );
    throw new Error("ATTACHMENT_COPY_FAILED");
  }

  return normalizeAttachment({
    id,
    name: displayName,
    uri: destinationFile.uri,
    localUri: destinationFile.uri,
    originalUri: sourceUri,
    mimeType,
    size: copiedSize,
    extension: sourceExtension,
    addedAt: new Date().toISOString(),
    isAppOwned: true,
  });
};

export const removeAttachmentFileIfAppOwned = async (attachment = {}) => {
  const uri = getAttachmentFileUri(attachment);
  const isOwned = isAppOwnedAttachmentUri(uri);

  if (!uri || !isOwned) {
    return { success: true, fileDeleted: false };
  }

  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    return { success: true, fileDeleted: true };
  } catch (error) {
    return {
      success: false,
      fileDeleted: false,
      errorCode: "FILE_DELETE_FAILED",
      message: error?.message || "Could not delete this attachment.",
    };
  }
};

export const removeAttachmentFromTask = (task = {}, attachmentId = "") => {
  const nextAttachments = normalizeTaskAttachments(task).filter(
    (attachment) => attachment.id !== attachmentId
  );
  return {
    ...task,
    attachments: nextAttachments,
    attachment: getPrimaryAttachmentUri(nextAttachments),
  };
};

const getOpenFailureMessage = (kind) => {
  if (kind === "pdf") {
    return "No app found to open this file. You can try Download.";
  }

  if (["word", "spreadsheet", "presentation"].includes(kind)) {
    return "No app found to open this file. You can try Download.";
  }

  return "This attachment could not be opened. It may be missing or damaged.";
};

export const validateAttachmentFile = async (attachment = {}) => {
  const normalizedAttachment = normalizeAttachment(attachment);
  const uri = normalizedAttachment ? getAttachmentFileUri(normalizedAttachment) : "";
  if (!uri) {
    return {
      success: false,
      errorCode: "FILE_NOT_FOUND",
      message: "This attachment could not be opened. It may be missing or damaged.",
    };
  }

  const displayName = getDisplayFileName(normalizedAttachment);
  const extension =
    getFileExtension(displayName, normalizedAttachment.mimeType) ||
    normalizeExtension(normalizedAttachment.extension) ||
    "bin";
  const mimeType = getBestMimeType(extension, normalizedAttachment.mimeType);

  try {
    const info = uri.startsWith("file://")
      ? await FileSystem.getInfoAsync(uri)
      : null;

    if (uri.startsWith("file://") && info?.exists === false) {
      return {
        success: false,
        errorCode: "FILE_NOT_FOUND",
        message: "This attachment could not be opened. It may be missing or damaged.",
      };
    }

    const resolvedSize = Number.isFinite(Number(info?.size))
      ? Number(info.size)
      : Number(normalizedAttachment.size || 0);

    if (uri.startsWith("file://") && (!resolvedSize || resolvedSize <= 0)) {
      return {
        success: false,
        errorCode: "EMPTY_FILE",
        message: "This attachment could not be opened. It may be missing or damaged.",
      };
    }

    return {
      success: true,
      attachment: {
        ...normalizedAttachment,
        name: displayName,
        extension,
        mimeType,
        size: resolvedSize || normalizedAttachment.size,
      },
      uri,
      name: displayName,
      extension,
      mimeType,
      size: resolvedSize || normalizedAttachment.size,
    };
  } catch (error) {
    if (uri.startsWith("content://") || uri.startsWith("http://") || uri.startsWith("https://")) {
      return {
        success: true,
        attachment: {
          ...normalizedAttachment,
          name: displayName,
          extension,
          mimeType,
        },
        uri,
        name: displayName,
        extension,
        mimeType,
        size: normalizedAttachment.size,
      };
    }

    return {
      success: false,
      errorCode: "INVALID_FILE",
      message: "This attachment could not be opened. It may be missing or damaged.",
      error,
    };
  }
};

export const ensureAttachmentAccessible = validateAttachmentFile;

const openUriWithLinking = async (uri = "") => {
  if (Platform.OS === "android" && uri.startsWith("file://")) {
    const contentUri = await FileSystem.getContentUriAsync(uri);
    await Linking.openURL(contentUri);
    return;
  }

  await Linking.openURL(uri);
};

const copyAttachmentToShareCache = async (accessible = {}) => {
  const cacheDir = new Directory(Paths.cache, "open-attachments");
  cacheDir.create({ intermediates: true, idempotent: true });

  const targetFile = new File(
    cacheDir,
    ensureUniqueFileName(accessible.name || "attachment.bin")
  );

  await FileSystem.deleteAsync(targetFile.uri, { idempotent: true }).catch(
    () => null
  );
  await FileSystem.copyAsync({
    from: accessible.uri,
    to: targetFile.uri,
  });

  const info = await FileSystem.getInfoAsync(targetFile.uri);
  if (!info?.exists || !Number(info.size)) {
    await FileSystem.deleteAsync(targetFile.uri, { idempotent: true }).catch(
      () => null
    );
    throw new Error("SHARE_COPY_FAILED");
  }

  return targetFile.uri;
};

const openAndroidFileWithIntent = async (accessible = {}) => {
  const fileUri = accessible.uri.startsWith("file://")
    ? await copyAttachmentToShareCache(accessible)
    : accessible.uri;
  const contentUri = fileUri.startsWith("file://")
    ? await FileSystem.getContentUriAsync(fileUri)
    : fileUri;

  await IntentLauncher.startActivityAsync(ANDROID_ACTION_VIEW, {
    data: contentUri,
    type: accessible.mimeType || "application/octet-stream",
    flags: ANDROID_FLAG_GRANT_READ_URI_PERMISSION,
  });
};

export const openDocumentExternally = async (attachment = {}) => {
  const kind = getAttachmentKind(attachment);
  const accessible = await validateAttachmentFile(attachment);
  if (!accessible.success) return accessible;

  try {
    if (Platform.OS === "android") {
      await openAndroidFileWithIntent(accessible);
      return {
        success: true,
        opened: true,
        copied: accessible.uri.startsWith("file://"),
      };
    }

    const { uri, mimeType, name } = accessible;
    if (uri.startsWith("file://")) {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        return {
          success: false,
          errorCode: "NO_VIEWER_AVAILABLE",
          message: getOpenFailureMessage(kind),
        };
      }

      const shareUri = await copyAttachmentToShareCache(accessible);
      await Sharing.shareAsync(shareUri, {
        mimeType,
        dialogTitle: `Open ${name}`,
      });
      return { success: true, shared: true, copied: true };
    }

    await openUriWithLinking(uri);
    return { success: true, opened: true };
  } catch (error) {
    return {
      success: false,
      errorCode: "OPEN_FAILED",
      message: getOpenFailureMessage(kind),
      error,
    };
  }
};

export const openAttachmentExternally = openDocumentExternally;

export const shareAttachment = async (attachment = {}) => {
  const accessible = await validateAttachmentFile(attachment);
  if (!accessible.success) return accessible;

  try {
    if (accessible.uri.startsWith("file://")) {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        return {
          success: false,
          errorCode: "NO_VIEWER_AVAILABLE",
          message: "No app found to open this file. You can try Download.",
        };
      }

      const shareUri = await copyAttachmentToShareCache(accessible);
      await Sharing.shareAsync(shareUri, {
        mimeType: accessible.mimeType,
        dialogTitle: `Open ${accessible.name}`,
      });
      return { success: true, shared: true, copied: true };
    }

    await openUriWithLinking(accessible.uri);
    return { success: true, opened: true };
  } catch (error) {
    return {
      success: false,
      errorCode: "SHARE_FAILED",
      message: "No app found to open this file. You can try Download.",
      error,
    };
  }
};

export const openTaskAttachment = async (attachment = {}, options = {}) => {
  const kind = getAttachmentKind(attachment);
  const viewerType = getAttachmentViewerType(attachment);

  if (viewerType && typeof options.openViewer === "function") {
    const accessible = await validateAttachmentFile(attachment);
    if (!accessible.success) return accessible;

    options.openViewer({
      uri: accessible.uri,
      type: viewerType,
      name: accessible.name,
      attachment: accessible.attachment,
    });
    return { success: true, opened: true };
  }

  if (kind === "text" && typeof options.openTextViewer === "function") {
    const accessible = await validateAttachmentFile(attachment);
    if (!accessible.success) return accessible;

    const size = Number(accessible.size || attachment.size || 0);
    if (!size || size <= TEXT_PREVIEW_MAX_BYTES) {
      try {
        const text = await FileSystem.readAsStringAsync(accessible.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        options.openTextViewer({
          uri: accessible.uri,
          type: "text",
          name: accessible.name,
          content: text,
          attachment: accessible.attachment,
        });
        return { success: true, opened: true };
      } catch {
        // Fall through to external open.
      }
    }
  }

  const externalResult = await openDocumentExternally(attachment);
  if (externalResult.success) return externalResult;

  const shareResult = await shareAttachment(attachment);
  if (shareResult.success) return shareResult;

  return externalResult;
};

const getDownloadMimeType = (attachment = {}) =>
  getAttachmentMimeType(attachment);

const copyAttachmentToAppSavedFolder = async (attachment = {}) => {
  const accessible = await validateAttachmentFile(attachment);
  if (!accessible.success) {
    throw new Error(accessible.errorCode || "ATTACHMENT_NOT_ACCESSIBLE");
  }

  const sourceUri = accessible.uri;
  const displayName = accessible.name;
  const savedDir = new Directory(Paths.document, SAVED_ATTACHMENT_DIR_NAME);
  savedDir.create({ intermediates: true, idempotent: true });

  const targetFile = new File(savedDir, ensureUniqueFileName(displayName));
  await FileSystem.copyAsync({
    from: sourceUri,
    to: targetFile.uri,
  });

  const info = await FileSystem.getInfoAsync(targetFile.uri);
  if (!info?.exists || !Number(info.size)) {
    await FileSystem.deleteAsync(targetFile.uri, { idempotent: true }).catch(
      () => null
    );
    throw new Error("SAVE_EMPTY_FILE");
  }

  return targetFile.uri;
};

export const downloadTaskAttachment = async (attachment = {}) => {
  const accessible = await validateAttachmentFile(attachment);
  if (!accessible.success) {
    return {
      success: false,
      errorCode: accessible.errorCode || "FILE_NOT_FOUND",
      message: "Could not save this attachment on this device.",
    };
  }

  const sourceUri = accessible.uri;
  const displayName = accessible.name;
  const mimeType = accessible.mimeType || getDownloadMimeType(accessible.attachment);

  if (Platform.OS === "android" && FileSystem.StorageAccessFramework) {
    try {
      const permissions =
        await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

      if (!permissions?.granted) {
        return {
          success: false,
          cancelled: true,
          errorCode: "DOWNLOAD_CANCELLED",
          message: "Download cancelled.",
        };
      }

      const targetUri = await FileSystem.StorageAccessFramework.createFileAsync(
        permissions.directoryUri,
        displayName,
        mimeType
      );
      const fileContents = await FileSystem.readAsStringAsync(sourceUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await FileSystem.StorageAccessFramework.writeAsStringAsync(
        targetUri,
        fileContents,
        { encoding: FileSystem.EncodingType.Base64 }
      );

      return {
        success: true,
        uri: targetUri,
        message: "Attachment saved.",
      };
    } catch (error) {
      return {
        success: false,
        errorCode: "SAVE_FAILED",
        message: "Could not save this attachment on this device.",
        error,
      };
    }
  }

  try {
    const uri = await copyAttachmentToAppSavedFolder(attachment);
    return {
      success: true,
      uri,
      message: "Attachment saved.",
    };
  } catch (error) {
    return {
      success: false,
      errorCode: "SAVE_FAILED",
      message: "Could not save this attachment on this device.",
      error,
    };
  }
};
