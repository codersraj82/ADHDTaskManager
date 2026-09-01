import { useVideoPlayer, VideoView } from "expo-video";
import { View } from "../common/ThemedPrimitives";

export default function BrainDumpVideoPlayer({ uri, height = 230 }) {
  const player = useVideoPlayer(uri || null, (instance) => {
    instance.loop = false;
  });

  return (
    <View className="overflow-hidden rounded-2xl border border-[#337a7a]/35 bg-black">
      <VideoView
        player={player}
        nativeControls
        contentFit="contain"
        allowsFullscreen
        style={{ width: "100%", height }}
      />
    </View>
  );
}
