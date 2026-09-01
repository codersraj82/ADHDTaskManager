import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, Modal, SectionList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getBrainDumpById,
  keepBrainDumpAsThought,
  listBrainDumps,
  listExpiredDeletedBrainDumps,
  permanentlyDeleteBrainDumpRecord,
  restoreBrainDump,
  softDeleteBrainDump,
} from "../../database/brainDumpRepository";
import {
  isBrainDumpMediaAvailable,
  purgeExpiredBrainDumpMedia,
  removeBrainDumpMedia,
} from "../../services/brainDumpMediaService";
import {
  BRAIN_DUMP_CAPTURE_TYPES,
  BRAIN_DUMP_DELETE_UNDO_MS,
  BRAIN_DUMP_STATUSES,
  formatBrainDumpDuration,
  getBrainDumpDisplayText,
  groupBrainDumpsByTime,
} from "../../utils/brainDumpHelpers.mjs";
import {
  Image,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "../common/ThemedPrimitives";
import BrainDumpAudioPlayer from "./BrainDumpAudioPlayer";
import BrainDumpQuickCapture from "./BrainDumpQuickCapture";
import BrainDumpVideoPlayer from "./BrainDumpVideoPlayer";

const FILTERS = [
  { key: "all", label: "All" },
  { key: BRAIN_DUMP_STATUSES.THOUGHT, label: "Thoughts" },
  { key: BRAIN_DUMP_STATUSES.CONVERTED_TASK, label: "Tasks" },
  { key: BRAIN_DUMP_STATUSES.CONVERTED_REMINDER, label: "Reminders" },
];

const CAPTURE_META = {
  [BRAIN_DUMP_CAPTURE_TYPES.TEXT]: { icon: "edit-3", label: "Text thought" },
  [BRAIN_DUMP_CAPTURE_TYPES.VOICE]: { icon: "mic", label: "Voice thought" },
  [BRAIN_DUMP_CAPTURE_TYPES.PHOTO]: { icon: "camera", label: "Photo thought" },
  [BRAIN_DUMP_CAPTURE_TYPES.VIDEO]: { icon: "video", label: "Video thought" },
};

const statusCopy = (status) => {
  if (status === BRAIN_DUMP_STATUSES.CONVERTED_TASK) return "Task created";
  if (status === BRAIN_DUMP_STATUSES.CONVERTED_REMINDER) return "Reminder set";
  return "Kept as thought";
};

const formatCapturedAt = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Captured locally";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default function BrainDumpScreen() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [captureVisible, setCaptureVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [actionItem, setActionItem] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [missingMediaIds, setMissingMediaIds] = useState(() => new Set());
  const [pendingDelete, setPendingDelete] = useState(null);
  const deleteTimerRef = useRef(null);

  const loadItems = useCallback(async () => {
    try {
      const expired = listExpiredDeletedBrainDumps();
      if (expired.length) {
        await purgeExpiredBrainDumpMedia(expired, permanentlyDeleteBrainDumpRecord);
      }
      setItems(listBrainDumps());
    } catch {
      Alert.alert("Brain Dump", "Your saved thoughts could not be loaded yet.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadItems();
      return () => {
        if (deleteTimerRef.current) {
          clearTimeout(deleteTimerRef.current);
          deleteTimerRef.current = null;
        }
      };
    }, [loadItems])
  );

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== "all" && item.status !== filter) return false;
      if (!normalizedQuery) return true;
      return [item.text, item.transcript, item.fileName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    });
  }, [filter, items, query]);

  const sections = useMemo(() => groupBrainDumpsByTime(visibleItems), [visibleItems]);

  const finalizeDelete = useCallback(async (item) => {
    if (!item?.id) return;
    const latest = getBrainDumpById(item.id, { includeDeleted: true });
    if (!latest?.deletedAt) return;
    await removeBrainDumpMedia(latest);
    permanentlyDeleteBrainDumpRecord(latest.id);
  }, []);

  const deleteItem = useCallback(
    (item) => {
      Alert.alert(
        "Delete this thought?",
        "You can undo for a few seconds. A task or reminder already created from it will stay available.",
        [
          { text: "Keep thought", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              if (pendingDelete) await finalizeDelete(pendingDelete);
              if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
              const deleted = softDeleteBrainDump(item.id);
              setItems((current) => current.filter((candidate) => candidate.id !== item.id));
              setPendingDelete(deleted);
              deleteTimerRef.current = setTimeout(() => {
                void finalizeDelete(deleted);
                setPendingDelete((current) => (current?.id === deleted.id ? null : current));
                deleteTimerRef.current = null;
              }, BRAIN_DUMP_DELETE_UNDO_MS);
            },
          },
        ]
      );
    },
    [finalizeDelete, pendingDelete]
  );

  const undoDelete = useCallback(() => {
    if (!pendingDelete) return;
    if (deleteTimerRef.current) {
      clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = null;
    }
    const restored = restoreBrainDump(pendingDelete.id);
    setPendingDelete(null);
    if (restored) setItems(listBrainDumps());
  }, [pendingDelete]);

  const openMedia = useCallback(async (item) => {
    if (!item?.mediaUri) return;
    const available = await isBrainDumpMediaAvailable(item);
    if (!available) {
      setMissingMediaIds((current) => new Set([...current, item.id]));
      Alert.alert("Media unavailable", "The note and actions for this thought are still available.");
      return;
    }
    setViewer(item);
  }, []);

  const startConversion = useCallback((item, action) => {
    const relationId =
      action === "reminder" ? item.convertedReminderId : item.convertedTaskId;
    const alreadyConverted = Boolean(relationId);

    router.replace({
      pathname: "/(tabs)",
      params: alreadyConverted && relationId
        ? { brainDumpViewTaskId: String(relationId) }
        : { brainDumpId: String(item.id), brainDumpAction: action },
    });
  }, []);

  const showMore = useCallback((item) => setActionItem(item), []);

  const renderMedia = (item) => {
    if (!item.mediaUri || missingMediaIds.has(item.id)) {
      return item.mediaUri ? (
        <View className="mt-3 rounded-xl border border-[#FFD166]/30 bg-[#2A2218]/55 p-3">
          <Text className="text-[#FFD166] text-xs font-bold">Media unavailable</Text>
        </View>
      ) : null;
    }

    if (item.captureType === BRAIN_DUMP_CAPTURE_TYPES.PHOTO) {
      return (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="View Brain Dump photo"
          onPress={() => void openMedia(item)}
          className="mt-3"
        >
          <Image
            source={{ uri: item.mediaUri }}
            resizeMode="cover"
            onError={() =>
              setMissingMediaIds((current) => new Set([...current, item.id]))
            }
            className="w-full h-44 rounded-xl bg-[#061414]"
          />
        </TouchableOpacity>
      );
    }

    if (item.captureType === BRAIN_DUMP_CAPTURE_TYPES.VOICE) {
      return (
        <View className="mt-3">
          <BrainDumpAudioPlayer
            compact
            uri={item.mediaUri}
            durationMs={item.audioDurationMs}
          />
        </View>
      );
    }

    if (item.captureType === BRAIN_DUMP_CAPTURE_TYPES.VIDEO) {
      return (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Play Brain Dump video"
          onPress={() => void openMedia(item)}
          className="mt-3 h-36 rounded-xl border border-[#337a7a]/35 bg-[#061414]/70 items-center justify-center"
        >
          <View className="w-12 h-12 rounded-full border border-[#66b9b9]/45 bg-[#123131] items-center justify-center">
            <Feather name="play" size={18} color="#66b9b9" />
          </View>
          <Text className="text-[#9FB5B5] text-[11px] font-bold mt-2">
            Short video • {formatBrainDumpDuration(item.videoDurationMs)}
          </Text>
        </TouchableOpacity>
      );
    }
    return null;
  };

  const renderItem = ({ item }) => {
    const meta = CAPTURE_META[item.captureType] || CAPTURE_META.text;
    const displayText = getBrainDumpDisplayText(item);
    const isTask = item.status === BRAIN_DUMP_STATUSES.CONVERTED_TASK;
    const isReminder = item.status === BRAIN_DUMP_STATUSES.CONVERTED_REMINDER;

    return (
      <View className="mx-4 mb-3 rounded-3xl border border-[#337a7a]/30 bg-[#0B1F1F] p-4">
        <View className="flex-row items-start justify-between">
          <View className="flex-row items-center flex-1 pr-3">
            <View className="w-9 h-9 rounded-full bg-[#123131] border border-[#66b9b9]/30 items-center justify-center">
              <Feather name={meta.icon} size={15} color="#66b9b9" />
            </View>
            <View className="flex-1 ml-3">
              <Text className="text-[#E8F4F4] text-xs font-black">{meta.label}</Text>
              <Text className="text-[#9FB5B5] text-[10px] mt-0.5">
                {formatCapturedAt(item.createdAt)}
                {item.captureType === "voice" && item.audioDurationMs
                  ? ` • ${formatBrainDumpDuration(item.audioDurationMs)}`
                  : ""}
              </Text>
            </View>
          </View>
          <Text
            className={`text-[9px] font-black uppercase tracking-widest ${
              item.status === BRAIN_DUMP_STATUSES.THOUGHT
                ? "text-[#9FB5B5]"
                : "text-[#7DFFB3]"
            }`}
          >
            {statusCopy(item.status)}
          </Text>
        </View>

        {displayText ? (
          <Text className="text-[#E8F4F4] text-sm leading-5 mt-3">{displayText}</Text>
        ) : null}
        {renderMedia(item)}

        <View className="flex-row mt-4">
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={isTask ? "View created task" : "Convert thought to task"}
            onPress={() => startConversion(item, "task")}
            className="flex-1 mr-2 rounded-full border border-[#66b9b9]/40 bg-[#123131]/70 py-2.5 items-center"
          >
            <Text className="text-[#66b9b9] text-[10px] font-black uppercase tracking-widest">
              {isTask ? "View Task" : "Task"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={isReminder ? "View created reminder" : "Set reminder from thought"}
            onPress={() => startConversion(item, "reminder")}
            className="flex-1 mr-2 rounded-full border border-[#66b9b9]/40 bg-[#123131]/70 py-2.5 items-center"
          >
            <Text className="text-[#66b9b9] text-[10px] font-black uppercase tracking-widest">
              {isReminder ? "View Reminder" : "Reminder"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="More Brain Dump actions"
            onPress={() => showMore(item)}
            className="w-11 rounded-full border border-[#337a7a]/40 bg-[#123131]/60 items-center justify-center"
          >
            <Feather name="more-horizontal" size={17} color="#9FB5B5" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-[#061414]" style={{ paddingTop: Math.max(insets.top, 10) }}>
      <View className="px-4 pt-2 pb-3 border-b border-[#337a7a]/25 bg-[#0B1F1F]">
        <View className="flex-row items-center">
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full border border-[#337a7a]/35 bg-[#123131]/70 items-center justify-center"
          >
            <Feather name="arrow-left" size={18} color="#66b9b9" />
          </TouchableOpacity>
          <View className="flex-1 ml-3">
            <Text className="text-[#E8F4F4] text-2xl font-black">Brain Dump</Text>
            <Text className="text-[#9FB5B5] text-xs mt-0.5">
              A place to get things out of your head.
            </Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Capture a thought"
            onPress={() => {
              setEditingItem(null);
              setCaptureVisible(true);
            }}
            className="flex-row items-center rounded-full bg-[#66b9b9] px-3.5 py-2.5"
          >
            <Feather name="plus" size={15} color="#061414" />
            <Text className="text-[#061414] text-[10px] font-black uppercase tracking-widest ml-1.5">
              Capture
            </Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row items-center mt-3 rounded-2xl border border-[#337a7a]/30 bg-[#061414]/55 px-3">
          <Feather name="search" size={15} color="#9FB5B5" />
          <TextInput
            accessibilityLabel="Search brain dumps"
            placeholder="Search brain dumps"
            placeholderTextColor="#738B8B"
            value={query}
            onChangeText={setQuery}
            className="flex-1 text-[#E8F4F4] py-3 px-2 text-sm"
          />
        </View>
        <View className="flex-row flex-wrap mt-2">
          {FILTERS.map((option) => (
            <TouchableOpacity
              key={option.key}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === option.key }}
              onPress={() => setFilter(option.key)}
              className={`mr-2 mt-1 rounded-full px-3 py-2 border ${
                filter === option.key
                  ? "bg-[#66b9b9] border-[#66b9b9]"
                  : "bg-[#123131]/60 border-[#337a7a]/35"
              }`}
            >
              <Text
                className={`text-[10px] font-black uppercase tracking-widest ${
                  filter === option.key ? "text-[#061414]" : "text-[#9FB5B5]"
                }`}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <View className="bg-[#061414] px-4 pt-5 pb-2">
            <Text className="text-[#9FB5B5] text-[10px] font-black uppercase tracking-[2px]">
              {section.title}
            </Text>
          </View>
        )}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 12) + (pendingDelete ? 82 : 24),
          flexGrow: sections.length ? undefined : 1,
        }}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center px-9 py-16">
            <View className="w-16 h-16 rounded-full border border-[#66b9b9]/35 bg-[#123131]/60 items-center justify-center">
              <Feather name="inbox" size={26} color="#66b9b9" />
            </View>
            <Text className="text-[#E8F4F4] text-xl font-black mt-5 text-center">
              {query || filter !== "all" ? "Nothing matches right now" : "Nothing here yet"}
            </Text>
            <Text className="text-[#9FB5B5] text-sm text-center mt-2 leading-5">
              {query || filter !== "all"
                ? "Try another search or filter. Nothing needs pressure."
                : "When something pops into your head, capture it before it disappears."}
            </Text>
            {!query && filter === "all" ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Capture a thought"
                onPress={() => setCaptureVisible(true)}
                className="mt-5 rounded-full bg-[#66b9b9] px-5 py-3"
              >
                <Text className="text-[#061414] text-xs font-black uppercase tracking-widest">
                  Capture a thought
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
      />

      {pendingDelete ? (
        <View
          className="absolute left-4 right-4 rounded-2xl border border-[#66b9b9]/35 bg-[#123131] p-3 flex-row items-center"
          style={{ bottom: Math.max(insets.bottom, 10) + 8 }}
        >
          <Text className="text-[#E8F4F4] text-xs font-bold flex-1">Thought deleted</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Undo thought deletion"
            onPress={undoDelete}
            className="rounded-full border border-[#66b9b9]/45 px-3 py-2"
          >
            <Text className="text-[#66b9b9] text-[10px] font-black uppercase tracking-widest">
              Undo
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <BrainDumpQuickCapture
        visible={captureVisible}
        editingItem={editingItem}
        onClose={() => {
          setCaptureVisible(false);
          setEditingItem(null);
        }}
        onSaved={() => void loadItems()}
      />

      <Modal
        visible={Boolean(actionItem)}
        transparent
        animationType="fade"
        onRequestClose={() => setActionItem(null)}
      >
        <View className="flex-1 bg-[#061414]/92 justify-end">
          <View
            className="rounded-t-[32px] border-t border-[#66b9b9]/35 bg-[#0B1F1F] p-5"
            style={{ paddingBottom: Math.max(insets.bottom, 12) + 12 }}
          >
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-1 pr-3">
                <Text className="text-[#E8F4F4] text-lg font-black">Thought options</Text>
                <Text className="text-[#9FB5B5] text-xs mt-1">
                  Nothing needs organizing right now.
                </Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Close thought options"
                onPress={() => setActionItem(null)}
                className="w-10 h-10 rounded-full border border-[#337a7a]/35 bg-[#123131] items-center justify-center"
              >
                <Feather name="x" size={17} color="#9FB5B5" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Edit Brain Dump thought"
              onPress={() => {
                const item = actionItem;
                setActionItem(null);
                setEditingItem(item);
                setCaptureVisible(true);
              }}
              className="flex-row items-center rounded-2xl border border-[#337a7a]/30 bg-[#123131]/60 p-3.5 mb-2"
            >
              <Feather name="edit-3" size={15} color="#66b9b9" />
              <Text className="text-[#E8F4F4] text-sm font-bold ml-3">Edit</Text>
            </TouchableOpacity>

            {actionItem?.mediaUri ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Open Brain Dump media"
                onPress={() => {
                  const item = actionItem;
                  setActionItem(null);
                  void openMedia(item);
                }}
                className="flex-row items-center rounded-2xl border border-[#337a7a]/30 bg-[#123131]/60 p-3.5 mb-2"
              >
                <Feather name="play" size={15} color="#66b9b9" />
                <Text className="text-[#E8F4F4] text-sm font-bold ml-3">
                  {actionItem.captureType === BRAIN_DUMP_CAPTURE_TYPES.PHOTO
                    ? "View Photo"
                    : "Play Media"}
                </Text>
              </TouchableOpacity>
            ) : null}

            {actionItem?.status !== BRAIN_DUMP_STATUSES.THOUGHT ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Keep as thought"
                onPress={() => {
                  keepBrainDumpAsThought(actionItem.id);
                  setActionItem(null);
                  void loadItems();
                }}
                className="flex-row items-center rounded-2xl border border-[#337a7a]/30 bg-[#123131]/60 p-3.5 mb-2"
              >
                <Feather name="bookmark" size={15} color="#66b9b9" />
                <Text className="text-[#E8F4F4] text-sm font-bold ml-3">Keep as thought</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Delete Brain Dump thought"
              onPress={() => {
                const item = actionItem;
                setActionItem(null);
                deleteItem(item);
              }}
              className="flex-row items-center rounded-2xl border border-[#FF7B7B]/30 bg-[#FF7B7B]/10 p-3.5"
            >
              <Feather name="trash-2" size={15} color="#FF7B7B" />
              <Text className="text-[#FF7B7B] text-sm font-bold ml-3">Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(viewer)} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <View className="flex-1 bg-[#061414]/98 justify-center px-4" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Close media viewer"
            onPress={() => setViewer(null)}
            className="self-end w-11 h-11 rounded-full border border-[#337a7a]/40 bg-[#123131] items-center justify-center mb-3"
          >
            <Feather name="x" size={19} color="#E8F4F4" />
          </TouchableOpacity>
          {viewer?.captureType === BRAIN_DUMP_CAPTURE_TYPES.PHOTO ? (
            <Image
              source={{ uri: viewer.mediaUri }}
              resizeMode="contain"
              accessibilityLabel="Brain Dump photo"
              className="w-full h-[72%] rounded-2xl bg-black"
            />
          ) : null}
          {viewer?.captureType === BRAIN_DUMP_CAPTURE_TYPES.VIDEO ? (
            <BrainDumpVideoPlayer uri={viewer.mediaUri} height={360} />
          ) : null}
          {viewer?.captureType === BRAIN_DUMP_CAPTURE_TYPES.VOICE ? (
            <BrainDumpAudioPlayer uri={viewer.mediaUri} durationMs={viewer.audioDurationMs} />
          ) : null}
          {getBrainDumpDisplayText(viewer || {}) ? (
            <Text className="text-[#E8F4F4] text-sm mt-4 px-1">
              {getBrainDumpDisplayText(viewer)}
            </Text>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}
