import * as FileSystem from "expo-file-system/legacy";
import { createVideoPlayer } from "expo-video";
import {
  copyAttachmentToAppStorage,
  getAttachmentFileUri,
  removeAttachmentFileIfAppOwned,
  validateAttachmentFile,
} from "../utils/taskAttachmentHelpers";

const extensionForType = (captureType) => {
  if (captureType === "voice") return "m4a";
  if (captureType === "photo") return "jpg";
  if (captureType === "video") return "mp4";
  return "bin";
};

const defaultMimeForType = (captureType) => {
  if (captureType === "voice") return "audio/mp4";
  if (captureType === "photo") return "image/jpeg";
  if (captureType === "video") return "video/mp4";
  return "application/octet-stream";
};

export const persistBrainDumpMedia = async (asset = {}, captureType) => {
  if (!asset?.uri) throw new Error("BRAIN_DUMP_MEDIA_MISSING");
  const extension = extensionForType(captureType);
  const attachment = await copyAttachmentToAppStorage({
    ...asset,
    name:
      asset.fileName ||
      asset.name ||
      `brain_dump_${captureType}_${Date.now()}.${extension}`,
    fileName:
      asset.fileName ||
      asset.name ||
      `brain_dump_${captureType}_${Date.now()}.${extension}`,
    mimeType: asset.mimeType || defaultMimeForType(captureType),
  });

  return {
    mediaUri: getAttachmentFileUri(attachment),
    mimeType: attachment.mimeType || asset.mimeType || defaultMimeForType(captureType),
    fileName: attachment.name,
    fileSize: Number(attachment.size || asset.fileSize || 0) || null,
    attachment,
  };
};

export const copyBrainDumpMediaToTaskAttachment = async (item = {}) => {
  if (!item.mediaUri) return null;
  return copyAttachmentToAppStorage({
    uri: item.mediaUri,
    name:
      item.fileName ||
      `brain_dump_${item.captureType || "media"}_${item.id || Date.now()}.${extensionForType(
        item.captureType
      )}`,
    fileName: item.fileName,
    mimeType: item.mimeType || defaultMimeForType(item.captureType),
    size: item.fileSize,
  });
};

export const removeBrainDumpMedia = async (item = {}) => {
  if (!item.mediaUri) return { success: true, fileDeleted: false };
  return removeAttachmentFileIfAppOwned({
    uri: item.mediaUri,
    localUri: item.mediaUri,
    isAppOwned: true,
  });
};

export const isBrainDumpMediaAvailable = async (item = {}) => {
  if (!item.mediaUri) return false;
  const result = await validateAttachmentFile({
    uri: item.mediaUri,
    localUri: item.mediaUri,
    name: item.fileName,
    mimeType: item.mimeType,
    isAppOwned: true,
  });
  return Boolean(result?.success);
};

export const removeTemporaryBrainDumpMedia = async (uri) => {
  if (!uri || !FileSystem.cacheDirectory || !uri.startsWith(FileSystem.cacheDirectory)) {
    return;
  }
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => null);
};

export const readBrainDumpVideoDurationMs = async (uri, timeoutMs = 6_000) => {
  if (!uri) return null;

  return new Promise((resolve) => {
    let settled = false;
    let sourceSubscription = null;
    let statusSubscription = null;
    let timeout = null;
    let player = null;

    const finish = (durationSeconds = null) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      sourceSubscription?.remove?.();
      statusSubscription?.remove?.();
      try {
        player?.release?.();
      } catch {
        // Metadata probing must not affect the selected file.
      }
      const duration = Number(durationSeconds);
      resolve(Number.isFinite(duration) && duration > 0 ? duration * 1000 : null);
    };

    try {
      player = createVideoPlayer(uri);
      if (Number(player.duration) > 0) {
        finish(player.duration);
        return;
      }
      sourceSubscription = player.addListener("sourceLoad", (event) => {
        finish(event?.duration);
      });
      statusSubscription = player.addListener("statusChange", (event) => {
        if (event?.status === "error") finish(null);
      });
      timeout = setTimeout(() => finish(player?.duration), timeoutMs);
    } catch {
      finish(null);
    }
  });
};

export const purgeExpiredBrainDumpMedia = async (expiredItems, removeRecord) => {
  for (const item of Array.isArray(expiredItems) ? expiredItems : []) {
    await removeBrainDumpMedia(item);
    removeRecord(item.id);
  }
};
