import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import type { PropsWithChildren, ReactNode } from "react";
import { ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Props = PropsWithChildren<{
  title: string;
  subtitle: string;
  rightAction?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}>;

export default function ScreenAwarenessShell({
  title,
  subtitle,
  children,
  rightAction,
  refreshing = false,
  onRefresh,
}: Props) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#061414" }} edges={["top", "bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor="#061414" />
      <View className="flex-row items-center px-5 py-4 border-b border-[#66b9b9]/25 bg-[#061414]">
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Go back"
          activeOpacity={0.82}
          onPress={() => router.back()}
          className="w-11 h-11 rounded-2xl bg-[#123131]/80 border border-[#66b9b9]/30 items-center justify-center mr-3"
        >
          <Feather name="arrow-left" size={20} color="#66B9B9" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-[#E8F4F4] text-xl font-black">{title}</Text>
          <Text className="text-[#9FB5B5] text-xs mt-0.5">{subtitle}</Text>
        </View>
        {rightAction}
      </View>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingTop: 18, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={undefined}
      >
        {onRefresh ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Refresh screen awareness status"
            activeOpacity={0.82}
            disabled={refreshing}
            onPress={onRefresh}
            className="self-end mb-3 px-3 py-1.5 rounded-full border border-[#337a7a]/35 bg-[#123131]/60"
          >
            <Text className="text-[#66B9B9] text-[10px] font-black uppercase tracking-widest">
              {refreshing ? "Checking..." : "Refresh"}
            </Text>
          </TouchableOpacity>
        ) : null}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
