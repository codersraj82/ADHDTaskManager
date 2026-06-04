import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const hasStartSmallSupport = (task) =>
  (typeof task?.minimumVersion === "string" && task.minimumVersion.trim().length > 0) ||
  (typeof task?.firstAction === "string" && task.firstAction.trim().length > 0);

export default function OverwhelmModeSheet({
  visible,
  suggestions = [],
  onClose,
  onGoToTask,
  onStartTwoMinutes,
  onStartSmall,
  onMakeSmaller,
  onMoveGently,
  moodMessage = "",
}) {
  const insets = useSafeAreaInsets();
  const safeSuggestions = Array.isArray(suggestions) ? suggestions.slice(0, 3) : [];
  const hasSuggestions = safeSuggestions.length > 0;

  return (
    <Modal
      visible={Boolean(visible)}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable
          onPress={onClose}
          className="absolute inset-0 bg-[#061414]/95"
          accessibilityLabel="Close Overwhelm Mode"
        />

        <View className="max-h-[84%] bg-[#0B1F1F] rounded-t-[34px] border-t border-[#66b9b9]/35 shadow-2xl shadow-[#66b9b9]/20">
          <View className="items-center pt-3">
            <View className="w-14 h-1.5 rounded-full bg-[#337a7a]/70" />
          </View>

          <View className="px-5 pt-2 pb-4 border-b border-[#66b9b9]/25 flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <Text
                accessibilityRole="header"
                className="text-[#E8F4F4] text-xl font-black"
              >
                {"Let's make this lighter."}
              </Text>
              <Text className="text-[#9FB5B5] text-xs font-semibold mt-1">
                You do not need to do everything right now. Pick one small next step.
              </Text>
              <Text className="text-[#66b9b9] text-[11px] font-bold mt-2">
                Choose one. Not all.
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.82}
              onPress={onClose}
              className="bg-[#123131]/80 border border-[#66b9b9]/30 rounded-full px-3 py-2"
              accessibilityLabel="Close Overwhelm Mode"
            >
              <Text className="text-[#66b9b9] text-[10px] font-black uppercase tracking-widest">
                Close
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: Math.max(insets.bottom, 10) + 18,
            }}
            keyboardShouldPersistTaps="handled"
          >
            {moodMessage ? (
              <View className="mb-3 p-3 rounded-2xl border border-[#66b9b9]/20 bg-[#123131]/55">
                <Text className="text-[#9FB5B5] text-xs font-semibold">{moodMessage}</Text>
              </View>
            ) : null}

            {!hasSuggestions ? (
              <View className="px-2 py-8 items-center">
                <Text className="text-[#E8F4F4] text-lg font-black">
                  Nothing urgent is waiting.
                </Text>
                <Text className="text-[#9FB5B5] text-sm font-semibold mt-2 text-center">
                  You can take a small reset or add one tiny task.
                </Text>
                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={onClose}
                  className="mt-4 px-4 py-2 rounded-full border border-[#66b9b9]/35 bg-[#123131]/70"
                >
                  <Text className="text-[#66b9b9] text-[11px] font-black uppercase tracking-widest">
                    Close
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              safeSuggestions.map((suggestion) => {
                const task = suggestion?.task;
                if (!task) return null;
                const canStartSmall = hasStartSmallSupport(task);

                return (
                  <View
                    key={`${suggestion.type}-${task.id}`}
                    className="mb-3 p-3 rounded-2xl border border-[#66b9b9]/30 bg-[#123131]/70"
                    accessible
                    accessibilityLabel={`${suggestion.label}: ${task.title || "Task"}`}
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="text-[#66b9b9] text-[10px] font-black uppercase tracking-widest">
                        {suggestion.label}
                      </Text>
                      <Feather name="chevron-right" size={14} color="#66b9b9" />
                    </View>

                    <Text className="text-[#E8F4F4] text-sm font-black mt-1" numberOfLines={2}>
                      {task.title || "Task"}
                    </Text>

                    <Text className="text-[#9FB5B5] text-[11px] font-semibold mt-1.5">
                      {suggestion.reason}
                    </Text>

                    {task.minimumVersion ? (
                      <Text className="text-[#D9A441] text-[10px] font-bold mt-2">
                        Small version: {task.minimumVersion}
                      </Text>
                    ) : null}

                    {task.firstAction ? (
                      <Text className="text-[#B6C26E] text-[10px] font-bold mt-1">
                        Start here: {task.firstAction}
                      </Text>
                    ) : null}

                    <View className="flex-row flex-wrap mt-2">
                      <TouchableOpacity
                        activeOpacity={0.82}
                        onPress={() => onGoToTask?.(task.id)}
                        className="mr-2 mb-2 px-3 py-1.5 rounded-full border border-[#66b9b9]/40 bg-[#123131]/80"
                      >
                        <Text className="text-[#66b9b9] text-[10px] font-black uppercase tracking-widest">
                          Go to Task
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.82}
                        onPress={() => onStartTwoMinutes?.(task)}
                        className="mr-2 mb-2 px-3 py-1.5 rounded-full border border-[#66b9b9]/40 bg-[#123131]/80"
                      >
                        <Text className="text-[#66b9b9] text-[10px] font-black uppercase tracking-widest">
                          Start 2 Min
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View className="flex-row flex-wrap">
                      {canStartSmall ? (
                        <TouchableOpacity
                          activeOpacity={0.82}
                          onPress={() => onStartSmall?.(task)}
                          className="mr-2 mb-2 px-3 py-1.5 rounded-full border border-[#B6C26E]/45 bg-[#182419]/80"
                        >
                          <Text className="text-[#B6C26E] text-[10px] font-black uppercase tracking-widest">
                            Start Small
                          </Text>
                        </TouchableOpacity>
                      ) : null}

                      <TouchableOpacity
                        activeOpacity={0.82}
                        onPress={() => onMakeSmaller?.(task)}
                        className="mr-2 mb-2 px-3 py-1.5 rounded-full border border-[#D9A441]/45 bg-[#2A2218]/80"
                      >
                        <Text className="text-[#D9A441] text-[10px] font-black uppercase tracking-widest">
                          Make Smaller
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.82}
                        onPress={() => onMoveGently?.(task)}
                        className="mr-2 mb-2 px-3 py-1.5 rounded-full border border-[#66b9b9]/35 bg-[#123131]/70"
                      >
                        <Text className="text-[#9FB5B5] text-[10px] font-black uppercase tracking-widest">
                          Move Gently
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
