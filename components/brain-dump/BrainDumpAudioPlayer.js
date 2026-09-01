import { Feather } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useCallback } from "react";
import { Text, TouchableOpacity, View } from "../common/ThemedPrimitives";
import { formatBrainDumpDuration } from "../../utils/brainDumpHelpers.mjs";

export default function BrainDumpAudioPlayer({ uri, durationMs = 0, compact = false }) {
  const player = useAudioPlayer(uri || null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);

  const togglePlayback = useCallback(async () => {
    if (!uri) return;
    try {
      if (status.playing) {
        player.pause();
        return;
      }
      if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration)) {
        await player.seekTo(0);
      }
      player.play();
    } catch {
      // The parent keeps the thought usable even if its media is unavailable.
    }
  }, [player, status.currentTime, status.didJustFinish, status.duration, status.playing, uri]);

  const effectiveDuration =
    status.duration > 0 ? status.duration * 1000 : Number(durationMs || 0);
  const position = Math.max(0, Number(status.currentTime || 0) * 1000);
  const progress = effectiveDuration > 0 ? Math.min(1, position / effectiveDuration) : 0;

  return (
    <View className={`rounded-2xl border border-[#337a7a]/35 bg-[#061414]/45 ${compact ? "p-2.5" : "p-3"}`}>
      <View className="flex-row items-center">
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={status.playing ? "Pause voice thought" : "Play voice thought"}
          onPress={togglePlayback}
          className="w-10 h-10 rounded-full bg-[#123131] border border-[#66b9b9]/45 items-center justify-center"
        >
          <Feather name={status.playing ? "pause" : "play"} size={15} color="#66b9b9" />
        </TouchableOpacity>
        <View className="flex-1 ml-3">
          <Text className="text-[#E8F4F4] text-xs font-black">Voice thought</Text>
          <Text className="text-[#9FB5B5] text-[10px] mt-0.5">
            {formatBrainDumpDuration(position)} / {formatBrainDumpDuration(effectiveDuration)}
          </Text>
          <View className="h-1 rounded-full bg-[#123131] mt-2 overflow-hidden">
            <View
              className="h-1 rounded-full bg-[#66b9b9]"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </View>
        </View>
      </View>
    </View>
  );
}
