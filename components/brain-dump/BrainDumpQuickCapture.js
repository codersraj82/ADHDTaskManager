import { Feather } from "@expo/vector-icons";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, Keyboard, Modal, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Image,
  KeyboardAvoidingView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "../common/ThemedPrimitives";
import { createBrainDump, updateBrainDump } from "../../database/brainDumpRepository";
import {
  persistBrainDumpMedia,
  readBrainDumpVideoDurationMs,
  removeBrainDumpMedia,
  removeTemporaryBrainDumpMedia,
} from "../../services/brainDumpMediaService";
import {
  BRAIN_DUMP_CAPTURE_TYPES,
  BRAIN_DUMP_MAX_VIDEO_DURATION_SECONDS,
  formatBrainDumpDuration,
  isBrainDumpContentValid,
  isBrainDumpVideoDurationAllowed,
} from "../../utils/brainDumpHelpers.mjs";
import BrainDumpAudioPlayer from "./BrainDumpAudioPlayer";
import BrainDumpVideoPlayer from "./BrainDumpVideoPlayer";

const getAssetFileName = (asset, type) => {
  if (asset?.fileName) return asset.fileName;
  const uriName = String(asset?.uri || "")
    .split(/[?#]/)[0]
    .split("/")
    .filter(Boolean)
    .pop();
  if (uriName && uriName.includes(".")) {
    try {
      return decodeURIComponent(uriName);
    } catch {
      return uriName;
    }
  }
  const extension = type === "photo" ? "jpg" : type === "video" ? "mp4" : "m4a";
  return `brain_dump_${type}_${Date.now()}.${extension}`;
};

const toDraftFromItem = (item) =>
  item?.mediaUri
    ? {
        uri: item.mediaUri,
        fileName: item.fileName,
        mimeType: item.mimeType,
        fileSize: item.fileSize,
        width: item.width,
        height: item.height,
        duration:
          item.captureType === BRAIN_DUMP_CAPTURE_TYPES.VOICE
            ? item.audioDurationMs
            : item.videoDurationMs,
        type: item.captureType,
        persisted: true,
      }
    : null;

export default function BrainDumpQuickCapture({
  visible,
  editingItem = null,
  onClose,
  onSaved,
}) {
  const insets = useSafeAreaInsets();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);
  const [text, setText] = useState("");
  const [mediaDraft, setMediaDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mediaLaunching, setMediaLaunching] = useState(false);
  const closingRef = useRef(false);
  const currentDraftRef = useRef(null);
  const stopRecordingRef = useRef(null);
  const busyRef = useRef(false);
  const mediaLaunchingRef = useRef(false);
  const recordingStartRef = useRef(false);
  const recordingStopRef = useRef(false);

  useEffect(() => {
    currentDraftRef.current = mediaDraft;
  }, [mediaDraft]);

  useEffect(() => {
    if (!visible) return;
    closingRef.current = false;
    setText(editingItem?.text || editingItem?.transcript || "");
    setMediaDraft(toDraftFromItem(editingItem));
    setBusy(false);
    setMediaLaunching(false);
    busyRef.current = false;
    mediaLaunchingRef.current = false;
    recordingStartRef.current = false;
    recordingStopRef.current = false;
  }, [editingItem, visible]);

  const hasValidContent = useMemo(
    () => isBrainDumpContentValid({ text, mediaUri: mediaDraft?.uri }),
    [mediaDraft?.uri, text]
  );

  const discardTemporaryDraft = async (draft = currentDraftRef.current) => {
    if (draft?.uri && !draft.persisted) {
      await removeTemporaryBrainDumpMedia(draft.uri);
    }
  };

  const stopRecording = async ({ keep = true } = {}) => {
    if (recordingStopRef.current) return null;
    if (!recorderState.isRecording && !recorder.isRecording) return null;
    recordingStopRef.current = true;
    try {
      await recorder.stop();
      const uri = recorder.uri || recorder.getStatus()?.url;
      const duration = Number(
        recorder.getStatus()?.durationMillis || recorderState.durationMillis || 0
      );
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (!uri) throw new Error("VOICE_FILE_MISSING");
      if (!keep || closingRef.current) {
        await removeTemporaryBrainDumpMedia(uri);
        return null;
      }
      const nextDraft = {
        uri,
        fileName: getAssetFileName(null, "voice"),
        mimeType: "audio/mp4",
        fileSize: null,
        duration,
        type: BRAIN_DUMP_CAPTURE_TYPES.VOICE,
        persisted: false,
      };
      await discardTemporaryDraft();
      setMediaDraft(nextDraft);
      return nextDraft;
    } catch {
      Alert.alert("Voice capture", "The recording could not be finished. You can still type your thought.");
      return null;
    } finally {
      recordingStopRef.current = false;
    }
  };
  stopRecordingRef.current = stopRecording;

  useEffect(() => {
    if (!visible) return undefined;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active" && recorder.isRecording) {
        void stopRecordingRef.current?.({ keep: true });
      }
    });
    return () => subscription.remove();
  }, [recorder, visible]);

  const startRecording = async () => {
    if (
      busyRef.current ||
      mediaLaunchingRef.current ||
      recordingStartRef.current ||
      recorderState.isRecording
    ) return;
    recordingStartRef.current = true;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Voice capture",
          "Microphone permission is needed for voice capture. You can still type your thought."
        );
        return;
      }
      await discardTemporaryDraft();
      setMediaDraft(null);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      void Haptics.selectionAsync();
    } catch {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(
        () => null
      );
      Alert.alert("Voice capture", "Recording could not start. You can still type your thought.");
    } finally {
      recordingStartRef.current = false;
    }
  };

  const replaceDraft = async (draft) => {
    await discardTemporaryDraft();
    setMediaDraft(draft);
  };

  const requestPhoto = async (source) => {
    if (mediaLaunchingRef.current || busyRef.current) return;
    mediaLaunchingRef.current = true;
    setMediaLaunching(true);
    try {
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert("Photo capture", "Camera permission is needed to take a photo.");
          return;
        }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert("Photo capture", "Photo access is needed to choose a photo.");
          return;
        }
      }

      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ["images"],
              allowsEditing: false,
              quality: 0.78,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              allowsEditing: false,
              quality: 0.78,
            });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) throw new Error("PHOTO_MISSING");
      await replaceDraft({
        uri: asset.uri,
        fileName: getAssetFileName(asset, "photo"),
        mimeType: asset.mimeType || "image/jpeg",
        fileSize: asset.fileSize || null,
        width: asset.width || null,
        height: asset.height || null,
        duration: null,
        type: BRAIN_DUMP_CAPTURE_TYPES.PHOTO,
        persisted: false,
      });
    } catch {
      Alert.alert("Photo capture", "The photo could not be added. Your other capture options are still available.");
    } finally {
      mediaLaunchingRef.current = false;
      setMediaLaunching(false);
    }
  };

  const openPhotoChoices = () => {
    Keyboard.dismiss();
    Alert.alert("Add a photo", "Choose the easiest option.", [
      { text: "Take Photo", onPress: () => void requestPhoto("camera") },
      { text: "Choose from Device", onPress: () => void requestPhoto("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const requestVideo = async (source) => {
    if (mediaLaunchingRef.current || busyRef.current) return;
    mediaLaunchingRef.current = true;
    setMediaLaunching(true);
    try {
      if (source === "camera") {
        const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
        if (!cameraPermission.granted) {
          Alert.alert("Video capture", "Camera permission is needed to record a video.");
          return;
        }
        const microphonePermission = await requestRecordingPermissionsAsync();
        if (!microphonePermission.granted) {
          Alert.alert(
            "Video capture",
            "Microphone permission is needed for video sound. You can choose an existing video or use another capture method."
          );
          return;
        }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert("Video capture", "Media access is needed to choose a video.");
          return;
        }
      }

      const options = {
        mediaTypes: ["videos"],
        allowsEditing: false,
        videoMaxDuration: BRAIN_DUMP_MAX_VIDEO_DURATION_SECONDS,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      };
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) throw new Error("VIDEO_MISSING");
      const verifiedDuration =
        Number(asset.duration) > 0
          ? Number(asset.duration)
          : await readBrainDumpVideoDurationMs(asset.uri);
      if (!verifiedDuration) {
        Alert.alert(
          "Short video",
          "The video duration could not be checked. Please choose or record another video."
        );
        return;
      }
      if (!isBrainDumpVideoDurationAllowed(verifiedDuration)) {
        Alert.alert(
          "Short video",
          `Brain Dump videos can be up to ${BRAIN_DUMP_MAX_VIDEO_DURATION_SECONDS} seconds.`
        );
        return;
      }
      await replaceDraft({
        uri: asset.uri,
        fileName: getAssetFileName(asset, "video"),
        mimeType: asset.mimeType || "video/mp4",
        fileSize: asset.fileSize || null,
        width: asset.width || null,
        height: asset.height || null,
        duration: verifiedDuration,
        type: BRAIN_DUMP_CAPTURE_TYPES.VIDEO,
        persisted: false,
      });
    } catch {
      Alert.alert("Video capture", "The video could not be added. Your thought is still here.");
    } finally {
      mediaLaunchingRef.current = false;
      setMediaLaunching(false);
    }
  };

  const openVideoChoices = () => {
    Keyboard.dismiss();
    Alert.alert(
      "Add a short video",
      `Up to ${BRAIN_DUMP_MAX_VIDEO_DURATION_SECONDS} seconds.`,
      [
        { text: "Record Video", onPress: () => void requestVideo("camera") },
        { text: "Choose from Device", onPress: () => void requestVideo("library") },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const handleRemoveMedia = async () => {
    await discardTemporaryDraft();
    setMediaDraft(null);
  };

  const handleClose = async () => {
    if (busyRef.current) return;
    closingRef.current = true;
    if (recorderState.isRecording || recorder.isRecording) {
      await stopRecording({ keep: false });
    }
    await discardTemporaryDraft();
    setMediaDraft(null);
    setText("");
    onClose?.();
  };

  const handleSave = async () => {
    if (
      !hasValidContent ||
      busyRef.current ||
      mediaLaunchingRef.current ||
      recorderState.isRecording
    ) return;
    busyRef.current = true;
    setBusy(true);
    let persistedCopy = null;
    const oldItem = editingItem;
    try {
      if (mediaDraft?.uri && !mediaDraft.persisted) {
        persistedCopy = await persistBrainDumpMedia(mediaDraft, mediaDraft.type);
      }

      const finalMediaUri = persistedCopy?.mediaUri || mediaDraft?.uri || null;
      const captureType = finalMediaUri
        ? mediaDraft?.type || oldItem?.captureType || BRAIN_DUMP_CAPTURE_TYPES.PHOTO
        : BRAIN_DUMP_CAPTURE_TYPES.TEXT;
      const payload = {
        captureType,
        text,
        transcript: oldItem?.transcript || null,
        mediaUri: finalMediaUri,
        mimeType: persistedCopy?.mimeType || mediaDraft?.mimeType || null,
        fileName: persistedCopy?.fileName || mediaDraft?.fileName || null,
        fileSize: persistedCopy?.fileSize || mediaDraft?.fileSize || null,
        audioDurationMs:
          captureType === BRAIN_DUMP_CAPTURE_TYPES.VOICE
            ? Number(mediaDraft?.duration || oldItem?.audioDurationMs || 0) || null
            : null,
        videoDurationMs:
          captureType === BRAIN_DUMP_CAPTURE_TYPES.VIDEO
            ? Number(mediaDraft?.duration || oldItem?.videoDurationMs || 0) || null
            : null,
        width: mediaDraft?.width || null,
        height: mediaDraft?.height || null,
      };

      const saved = oldItem?.id
        ? updateBrainDump(oldItem.id, payload)
        : createBrainDump(payload);

      if (oldItem?.mediaUri && oldItem.mediaUri !== saved.mediaUri) {
        await removeBrainDumpMedia(oldItem);
      }
      if (mediaDraft?.uri && !mediaDraft.persisted) {
        await removeTemporaryBrainDumpMedia(mediaDraft.uri);
      }

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMediaDraft(null);
      setText("");
      onSaved?.(saved);
      onClose?.();
    } catch (error) {
      if (persistedCopy?.mediaUri) {
        await removeBrainDumpMedia({ mediaUri: persistedCopy.mediaUri });
      }
      const message =
        error?.message === "BRAIN_DUMP_EMPTY"
          ? "Add a few words or one media capture before saving."
          : "Your thought could not be saved yet. Please try again.";
      Alert.alert("Brain Dump", message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const recording = recorderState.isRecording || recorder.isRecording;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => void handleClose()}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View className="flex-1 justify-end bg-[#061414]/90">
          <View
            className="max-h-[92%] bg-[#0B1F1F] rounded-t-[36px] border-t border-[#66b9b9]/35"
            style={{ paddingBottom: Math.max(insets.bottom, 10) }}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: 22, paddingBottom: 26 }}
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-4">
                  <Text className="text-[#E8F4F4] text-2xl font-black">Brain Dump</Text>
                  <Text className="text-[#9FB5B5] text-sm mt-1">
                    Get it out. You can sort it later.
                  </Text>
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Close Brain Dump"
                  onPress={() => void handleClose()}
                  className="w-10 h-10 rounded-full border border-[#337a7a]/40 bg-[#123131]/75 items-center justify-center"
                >
                  <Feather name="x" size={18} color="#9FB5B5" />
                </TouchableOpacity>
              </View>

              {recording ? (
                <View className="mt-5 rounded-3xl border border-[#66b9b9]/40 bg-[#061414]/55 p-5 items-center">
                  <View className="w-3 h-3 rounded-full bg-[#FF7B7B] mb-3" />
                  <Text className="text-[#E8F4F4] font-black text-lg">I&apos;m listening...</Text>
                  <Text className="text-[#66b9b9] font-black text-2xl mt-2">
                    {formatBrainDumpDuration(recorderState.durationMillis)}
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Finish voice recording"
                    onPress={() => void stopRecording()}
                    className="mt-4 rounded-full bg-[#66b9b9] px-5 py-3"
                  >
                    <Text className="text-[#061414] font-black uppercase tracking-widest text-xs">
                      Finish
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text className="text-[#E8F4F4] font-black text-sm mt-5 mb-2">
                    What&apos;s on your mind?
                  </Text>
                  <TextInput
                    autoFocus={!editingItem}
                    accessibilityLabel="Brain Dump text"
                    placeholder="Type anything..."
                    placeholderTextColor="#738B8B"
                    value={text}
                    onChangeText={setText}
                    multiline
                    textAlignVertical="top"
                    className="min-h-[116px] bg-[#061414]/50 text-[#E8F4F4] p-4 rounded-2xl border border-[#337a7a]/35 text-base"
                  />

                  <View className="flex-row flex-wrap mt-3">
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Record voice thought"
                      disabled={mediaLaunching || busy}
                      onPress={() => void startRecording()}
                      className="flex-row items-center mr-2 mb-2 px-3.5 py-2.5 rounded-full border border-[#66b9b9]/35 bg-[#123131]/65"
                    >
                      <Feather name="mic" size={14} color="#66b9b9" />
                      <Text className="text-[#E8F4F4] text-xs font-black ml-2">Voice</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Take or choose photo"
                      disabled={mediaLaunching || busy}
                      onPress={openPhotoChoices}
                      className="flex-row items-center mr-2 mb-2 px-3.5 py-2.5 rounded-full border border-[#66b9b9]/35 bg-[#123131]/65"
                    >
                      <Feather name="camera" size={14} color="#66b9b9" />
                      <Text className="text-[#E8F4F4] text-xs font-black ml-2">Photo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Record or choose short video"
                      accessibilityHint={`Videos can be up to ${BRAIN_DUMP_MAX_VIDEO_DURATION_SECONDS} seconds`}
                      disabled={mediaLaunching || busy}
                      onPress={openVideoChoices}
                      className="flex-row items-center mb-2 px-3.5 py-2.5 rounded-full border border-[#66b9b9]/35 bg-[#123131]/65"
                    >
                      <Feather name="video" size={14} color="#66b9b9" />
                      <Text className="text-[#E8F4F4] text-xs font-black ml-2">Video</Text>
                    </TouchableOpacity>
                  </View>

                  {mediaDraft ? (
                    <View className="mt-3 rounded-2xl border border-[#66b9b9]/30 bg-[#123131]/40 p-3">
                      {mediaDraft.type === BRAIN_DUMP_CAPTURE_TYPES.PHOTO ? (
                        <Image
                          source={{ uri: mediaDraft.uri }}
                          accessibilityLabel="Selected Brain Dump photo"
                          resizeMode="cover"
                          className="w-full h-44 rounded-xl bg-[#061414]"
                        />
                      ) : null}
                      {mediaDraft.type === BRAIN_DUMP_CAPTURE_TYPES.VOICE ? (
                        <BrainDumpAudioPlayer uri={mediaDraft.uri} durationMs={mediaDraft.duration} />
                      ) : null}
                      {mediaDraft.type === BRAIN_DUMP_CAPTURE_TYPES.VIDEO ? (
                        <BrainDumpVideoPlayer uri={mediaDraft.uri} height={190} />
                      ) : null}
                      <View className="flex-row items-center justify-between mt-3">
                        <Text className="text-[#9FB5B5] text-[11px] font-bold flex-1">
                          {mediaDraft.type === BRAIN_DUMP_CAPTURE_TYPES.VIDEO
                            ? `Short video • ${formatBrainDumpDuration(mediaDraft.duration)}`
                            : mediaDraft.type === BRAIN_DUMP_CAPTURE_TYPES.VOICE
                              ? `Voice thought • ${formatBrainDumpDuration(mediaDraft.duration)}`
                              : "Photo ready"}
                        </Text>
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel="Remove selected media"
                          onPress={() => void handleRemoveMedia()}
                          className="px-3 py-2 rounded-full border border-[#FF7B7B]/35 bg-[#FF7B7B]/10"
                        >
                          <Text className="text-[#FF7B7B] text-[10px] font-black uppercase">Remove</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}
                </>
              )}

              <Text className="text-[#9FB5B5] text-[11px] mt-4">
                {new Date().toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Save thought"
                disabled={!hasValidContent || busy || recording}
                onPress={() => void handleSave()}
                className={`mt-4 p-4 rounded-2xl border ${
                  hasValidContent && !busy && !recording
                    ? "bg-[#66b9b9] border-[#99bdbd]/60"
                    : "bg-[#123131]/65 border-[#337a7a]/35"
                }`}
              >
                <Text
                  className={`text-center font-black uppercase tracking-widest text-sm ${
                    hasValidContent && !busy && !recording ? "text-[#061414]" : "text-[#9FB5B5]"
                  }`}
                >
                  {busy ? "Saving..." : editingItem ? "Save changes" : "Save thought"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
