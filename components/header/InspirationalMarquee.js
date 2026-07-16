import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from "react-native";

const BAR_HEIGHT = 36;
const GAP = 80;
const SPEED_PX_PER_SECOND = 24;

export default function InspirationalMarquee({ text, style }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const animationRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const shouldScroll = !reduceMotion && textWidth > containerWidth - 6;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion
    );
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  useEffect(() => {
    animationRef.current?.stop();
    translateX.setValue(0);
    if (!shouldScroll) return undefined;

    const distance = textWidth + GAP;
    const duration = Math.max(12000, (distance / SPEED_PX_PER_SECOND) * 1000);
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(900),
        Animated.timing(translateX, {
          toValue: -distance,
          duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    animationRef.current = animation;
    animation.start();
    return () => animation.stop();
  }, [shouldScroll, text, textWidth, translateX]);

  useEffect(() => setTextWidth(0), [text]);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={text}
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
      style={[styles.container, style]}
    >
      {shouldScroll ? (
        <Animated.View style={[styles.track, { transform: [{ translateX }] }]}> 
          <Text numberOfLines={1} style={styles.text}>{text}</Text>
          <View style={{ width: GAP }} />
          <Text numberOfLines={1} style={styles.text}>{text}</Text>
        </Animated.View>
      ) : (
        <Text numberOfLines={1} ellipsizeMode="tail" style={styles.staticText}>
          {text}
        </Text>
      )}
      <Text
        numberOfLines={1}
        pointerEvents="none"
        onLayout={(event) => setTextWidth(event.nativeEvent.layout.width)}
        style={styles.measureText}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: BAR_HEIGHT,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    overflow: "hidden",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(102,185,185,0.25)",
    backgroundColor: "rgba(18,49,49,0.6)",
    paddingHorizontal: 12,
  },
  track: { flexDirection: "row", alignItems: "center", flexShrink: 0 },
  text: { color: "#E8F4F4", fontSize: 13, fontWeight: "700", lineHeight: 20, flexShrink: 0 },
  staticText: { color: "#E8F4F4", fontSize: 13, fontWeight: "700", lineHeight: 20 },
  measureText: { position: "absolute", opacity: 0, left: 0, top: 0, fontSize: 13, fontWeight: "700", lineHeight: 20 },
});
