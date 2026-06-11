import { Linking, Platform, Share } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";

export const MAX_TASK_ATTACHMENTS = 10;

const ATTACHMENT_DIR_NAME = "task-attachments";
const SAVED_ATTACHMENT_DIR_NAME = "saved-attachments";

const MIME_EXTENSION_MAP = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
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
};

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "heic", "heif"]);
const SPREADSHEET_EXTENSIONS = new Set(["xls", "xlsx", "csv", "ods"]);
const WORD_EXTENSIONS = new Set(["doc", "docx", "odt"]);
const PRESENTATION_EXTENSIONS = new Set(["ppt", "pptx", "odp"]);
const TEXT_EXTENSIONS = new Set(["txt", "md", "rtf", "json", "csv"]);
const ARCHIVE_EXTENSIONS = new Set(["zip", "rar", "7z", "tar", "gz"]);
const TEXT_PREVIEW_MAX_BYTES = 250 * 1024;

const nowId = () =>
  `att-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const getSafeString = (value) =>
  typeof value === "string" ? value.trim() : "";

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
    return cleanName.slice(lastDot + 1).toLowerCase();
  }

  const normalizedMime = getSafeString(mimeType).toLowerCase();
  return MIME_EXTENSION_MAP[normalizedMime] || "";
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

export const getDisplayFileName = (attachment = {}) => {
  const rawName =
    getSafeString(attachment.name) ||
    getSafeString(attachment.fileName) ||
    getSafeString(attachment.attachmentName) ||
    getNameFromUri(attachment.originalUri || attachment.localUri || attachment.uri);
  const extension = getFileExtension(rawName, attachment.mimeType || attachment.type);

  if (rawName) {
    if (extension && !rawName.toLowerCase().endsWith(`.${extension}`)) {
      return `${rawName}.${extension}`;
    }
    return rawName;
  }

  return extension ? `attachment.${extension}` : "attachment_file";
};

const normalizeAttachment = (attachment = {}, fallback = {}) => {
  const uri =
    getSafeString(attachment.uri) ||
    getSafeString(attachment.localUri) ||
    getSafeString(attachment.originalUri) ||
    getSafeString(fallback.uri);

  if (!uri) return null;

  const name = getDisplayFileName({
    ...fallback,
    ...attachment,
    uri,
  });
  const extension = getFileExtension(
    attachment.extension ? `file.${attachment.extension}` : name,
    attachment.mimeType || fallback.mimeType
  );
  const localUri = getSafeString(attachment.localUri);
  const isAppOwned =
    attachment.isAppOwned === true ||
    Boolean(localUri && FileSystem.documentDirectory && localUri.startsWith(FileSystem.documentDirectory));

  return {
    id: getSafeString(attachment.id) || nowId(),
    name,
    uri,
    mimeType: getSafeString(attachment.mimeType || fallback.mimeType) || undefined,
    size: Number.isFinite(Number(attachment.size ?? fallback.size))
      ? Number(attachment.size ?? fallback.size)
      : undefined,
    extension: extension || undefined,
    addedAt: getSafeString(attachment.addedAt) || new Date().toISOString(),
    isAppOwned,
    localUri: localUri || undefined,
    originalUri: getSafeString(attachment.originalUri || fallback.originalUri) || undefined,
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
  if (SPREADSHEET_EXTENSIONS.has(extension)) return "spreadsheet";
  if (WORD_EXTENSIONS.has(extension)) return "word";
  if (PRESENTATION_EXTENSIONS.has(extension)) return "presentation";
  if (TEXT_EXTENSIONS.has(extension) || mimeType.startsWith("text/")) return "text";
  if (ARCHIVE_EXTENSIONS.has(extension)) return "archive";
  return "unknown";
};

export const getAttachmentMimeType = (attachment = {}) => {
  const mimeType = getSafeString(attachment.mimeType);
  if (mimeType) return mimeType;

  const extension = getFileExtension(getDisplayFileName(attachment));
  const matchedMime = Object.entries(MIME_EXTENSION_MAP).find(
    ([, mappedExtension]) => mappedExtension === extension
  );

  return matchedMime?.[0] || "application/octet-stream";
};

export const getAttachmentViewerType = (attachment = {}) => {
  if (getAttachmentKind(attachment) === "image") return "image";
  return null;
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
  const displayName = getDisplayFileName(fileAsset);
  const extension = getFileExtension(displayName, fileAsset.mimeType);
  const storageName = ensureUniqueFileName(
    `${id}-${sanitizeFileNameForStorage(displayName)}`
  );
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
    if (info?.exists && Number.isFinite(Number(info.size))) {
      copiedSize = Number(info.size);
    }
  } catch {
    // Size is optional.
  }

  return normalizeAttachment({
    id,
    name: displayName,
    uri: destinationFile.uri,
    localUri: destinationFile.uri,
    originalUri: sourceUri,
    mimeType: fileAsset.mimeType,
    size: copiedSize,
    extension,
    addedAt: new Date().toISOString(),
    isAppOwned: true,
  });
};

export const removeAttachmentFileIfAppOwned = async (attachment = {}) => {
  const uri = getAttachmentFileUri(attachment);
  const documentDirectory = FileSystem.documentDirectory || "";
  const isOwned =
    attachment.isAppOwned === true ||
    Boolean(uri && documentDirectory && uri.startsWith(documentDirectory));

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
    return "Could not open this PDF on this device. You can try Download.";
  }

  if (["word", "spreadsheet", "presentation"].includes(kind)) {
    return "No app found to open this file. You can try Download.";
  }

  return "This file could not be opened on this device.";
};

export const ensureAttachmentAccessible = async (attachment = {}) => {
  const uri = getAttachmentFileUri(attachment);
  if (!uri) {
    return {
      success: false,
      errorCode: "ATTACHMENT_NOT_FOUND",
      message: "This attachment file is missing. It may have been moved or removed.",
    };
  }

  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (uri.startsWith("file://") && info?.exists === false) {
      return {
        success: false,
        errorCode: "FILE_NOT_FOUND",
        message: "This attachment file is missing. It may have been moved or removed.",
      };
    }

    return {
      success: true,
      attachment,
      uri,
      size: Number.isFinite(Number(info?.size)) ? Number(info.size) : attachment.size,
    };
  } catch (error) {
    if (uri.startsWith("content://") || uri.startsWith("http://") || uri.startsWith("https://")) {
      return { success: true, attachment, uri, size: attachment.size };
    }

    return {
      success: false,
      errorCode: "FILE_NOT_ACCESSIBLE",
      message: "This file is no longer accessible. Try adding it again.",
      error,
    };
  }
};

export const openAttachmentExternally = async (attachment = {}) => {
  const kind = getAttachmentKind(attachment);
  const accessible = await ensureAttachmentAccessible(attachment);
  if (!accessible.success) return accessible;

  const uri = accessible.uri;
  try {
    let openUri = uri;
    if (Platform.OS === "android" && uri.startsWith("file://")) {
      openUri = await FileSystem.getContentUriAsync(uri);
    }

    await Linking.openURL(openUri);
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

export const shareAttachment = async (attachment = {}) => {
  const accessible = await ensureAttachmentAccessible(attachment);
  if (!accessible.success) return accessible;

  try {
    let shareUrl = accessible.uri;
    if (Platform.OS === "android" && shareUrl.startsWith("file://")) {
      shareUrl = await FileSystem.getContentUriAsync(shareUrl);
    }

    await Share.share({
      title: getDisplayFileName(attachment),
      message: getDisplayFileName(attachment),
      url: shareUrl,
    });

    return { success: true, shared: true };
  } catch (error) {
    return {
      success: false,
      errorCode: "SHARE_FAILED",
      message: "This file could not be opened on this device.",
      error,
    };
  }
};

export const openTaskAttachment = async (attachment = {}, options = {}) => {
  const kind = getAttachmentKind(attachment);
  const viewerType = getAttachmentViewerType(attachment);

  if (viewerType && typeof options.openViewer === "function") {
    const accessible = await ensureAttachmentAccessible(attachment);
    if (!accessible.success) return accessible;

    options.openViewer({
      uri: accessible.uri,
      type: viewerType,
      name: getDisplayFileName(attachment),
      attachment,
    });
    return { success: true, opened: true };
  }

  if (kind === "text" && typeof options.openTextViewer === "function") {
    const accessible = await ensureAttachmentAccessible(attachment);
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
          name: getDisplayFileName(attachment),
          content: text,
          attachment,
        });
        return { success: true, opened: true };
      } catch {
        // Fall through to external open.
      }
    }
  }

  const externalResult = await openAttachmentExternally(attachment);
  if (externalResult.success) return externalResult;

  const shareResult = await shareAttachment(attachment);
  if (shareResult.success) return shareResult;

  return externalResult;
};

const getDownloadMimeType = (attachment = {}) =>
  getAttachmentMimeType(attachment);

const copyAttachmentToAppSavedFolder = async (attachment = {}) => {
  const sourceUri = getAttachmentFileUri(attachment);
  const displayName = getDisplayFileName(attachment);
  const savedDir = new Directory(Paths.document, SAVED_ATTACHMENT_DIR_NAME);
  savedDir.create({ intermediates: true, idempotent: true });

  const targetFile = new File(savedDir, ensureUniqueFileName(displayName));
  await FileSystem.copyAsync({
    from: sourceUri,
    to: targetFile.uri,
  });
  return targetFile.uri;
};

export const downloadTaskAttachment = async (attachment = {}) => {
  const sourceUri = getAttachmentFileUri(attachment);
  if (!sourceUri) {
    return {
      success: false,
      errorCode: "ATTACHMENT_NOT_FOUND",
      message: "Could not save this attachment on this device.",
    };
  }

  try {
    const info = await FileSystem.getInfoAsync(sourceUri);
    if (sourceUri.startsWith("file://") && info && info.exists === false) {
      return {
        success: false,
        errorCode: "ATTACHMENT_NOT_FOUND",
        message: "Could not save this attachment on this device.",
      };
    }
  } catch {
    // Content URIs may not expose normal file info; try the copy path below.
  }

  const displayName = getDisplayFileName(attachment);
  const mimeType = getDownloadMimeType(attachment);

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
