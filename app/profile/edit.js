import { Feather } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { db, initDB } from "../../database/db";

const MAX_TAGLINE = 60;
const DEFAULT_PROFILE = { name: "", profileImage: "", tagline: "", vibe: "🌿", onboardingComplete: false };
const VIBES = [
  ["💪", "Strong"], ["🌿", "Calm"], ["⚡", "Energetic"],
  ["🧠", "Focused"], ["🌊", "Balanced"],
];

const normalize = (row = {}) => ({
  ...DEFAULT_PROFILE,
  ...row,
  tagline: String(row.tagline || "").replace(/\s+/g, " ").trim().slice(0, MAX_TAGLINE),
  onboardingComplete: row.onboardingComplete === 1 || row.onboardingComplete === true,
});

const profileDirectory = () => `${FileSystem.documentDirectory || ""}profile/`;
const isOwnedImage = (uri) => Boolean(uri && uri.startsWith(profileDirectory()));

export default function ProfileEditScreen() {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [vibe, setVibe] = useState("🌿");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    initDB();
    const row = db.getFirstSync("SELECT * FROM app_profile WHERE id = 1");
    const next = normalize(row || DEFAULT_PROFILE);
    setProfile(next);
    setName(next.name);
    setTagline(next.tagline);
    setVibe(next.vibe);
  }, []);

  const saveRow = (next) => {
    const value = normalize(next);
    db.runSync(
      `INSERT OR REPLACE INTO app_profile
       (id, name, profileImage, profilePhotoUpdatedAt, tagline, vibe, onboardingComplete, updatedAt)
       VALUES (1, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [value.name, value.profileImage, value.profilePhotoUpdatedAt || "", value.tagline,
        value.vibe, value.onboardingComplete ? 1 : 0]
    );
    setProfile(value);
    return value;
  };

  const dismissThen = (action, delay = 80) => {
    Keyboard.dismiss();
    setTimeout(action, delay);
  };

  const copyIntoApp = async (sourceUri) => {
    const directory = profileDirectory();
    if (!directory) throw new Error("Profile directory unavailable");
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true }).catch(() => null);
    const destination = `${directory}avatar-${Date.now()}.jpg`;
    await FileSystem.copyAsync({ from: sourceUri, to: destination });
    return destination;
  };

  const replaceImage = async (sourceUri) => {
    const oldUri = profile.profileImage;
    const nextUri = await copyIntoApp(sourceUri);
    saveRow({ ...profile, profileImage: nextUri, profilePhotoUpdatedAt: new Date().toISOString() });
    if (oldUri !== nextUri && isOwnedImage(oldUri)) {
      await FileSystem.deleteAsync(oldUri, { idempotent: true }).catch(() => null);
    }
  };

  const choosePhoto = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return Alert.alert("Profile photo", "Permission is needed to choose a photo.");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.[0]?.uri) await replaceImage(result.assets[0].uri);
    } catch (error) {
      console.log("Profile image update failed:", error);
      Alert.alert("Profile photo", "Could not save profile photo. Please try again.");
    } finally { setBusy(false); }
  };

  const cropExisting = async () => {
    if (!profile.profileImage || busy) return;
    setBusy(true);
    try {
      const source = await new Promise((resolve, reject) => Image.getSize(
        profile.profileImage,
        (width, height) => resolve({ width, height }), reject
      ));
      const size = Math.min(source.width, source.height);
      const result = await manipulateAsync(profile.profileImage, [{ crop: {
        originX: Math.round((source.width - size) / 2),
        originY: Math.round((source.height - size) / 2), width: size, height: size,
      }}], { compress: 0.82, format: SaveFormat.JPEG });
      await replaceImage(result.uri);
    } catch (error) {
      console.log("Profile crop failed:", error);
      Alert.alert("Crop photo", "Could not crop this photo. Please try again.");
    } finally { setBusy(false); }
  };

  const removePhoto = () => Alert.alert("Remove profile photo?", "Your photo will be removed from this app.", [
    { text: "Cancel", style: "cancel" },
    { text: "Remove", style: "destructive", onPress: async () => {
      const oldUri = profile.profileImage;
      saveRow({ ...profile, profileImage: "", profilePhotoUpdatedAt: new Date().toISOString() });
      if (isOwnedImage(oldUri)) await FileSystem.deleteAsync(oldUri, { idempotent: true }).catch(() => null);
    }},
  ]);

  const save = () => {
    const cleanTagline = tagline.replace(/\s+/g, " ").trim();
    saveRow({ ...profile, name: name.trim() || profile.name || "Friend", tagline: cleanTagline,
      vibe: vibe || "🌿", onboardingComplete: true });
    router.back();
  };

  const Action = ({ icon, label, onPress, danger }) => (
    <TouchableOpacity disabled={busy} onPress={() => dismissThen(onPress)} style={[styles.action, danger && styles.danger, busy && styles.disabled]}>
      <Feather name={icon} size={16} color={danger ? "#FFB3B3" : "#66b9b9"} />
      <Text style={[styles.actionText, danger && { color: "#FFB3B3" }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityLabel="Back" onPress={() => dismissThen(() => router.back(), 0)} style={styles.back}>
          <Feather name="arrow-left" size={20} color="#E8F4F4" />
        </TouchableOpacity>
        <Text accessibilityRole="header" style={styles.title}>Edit profile</Text>
        <View style={styles.back} />
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + 120 }]}
        >
          <View style={styles.avatar}>
            {profile.profileImage ? <Image source={{ uri: profile.profileImage }} style={styles.image} /> : <Text style={styles.emoji}>{vibe}</Text>}
          </View>
          <View style={styles.actions}>
            <Action icon="image" label={profile.profileImage ? "Change photo" : "Add photo"} onPress={choosePhoto} />
            {profile.profileImage ? <Action icon="crop" label="Crop photo" onPress={cropExisting} /> : null}
            {profile.profileImage ? <Action icon="trash-2" label="Remove photo" onPress={removePhoto} danger /> : null}
          </View>

          <Text style={styles.label}>Name</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor="#6F8989" style={styles.input} returnKeyType="next" />
          <View style={styles.labelRow}><Text style={styles.label}>Personal tagline</Text><Text style={styles.count}>{tagline.length}/{MAX_TAGLINE}</Text></View>
          <TextInput value={tagline} onChangeText={setTagline} maxLength={MAX_TAGLINE} placeholder="One small step at a time" placeholderTextColor="#6F8989" style={styles.input} returnKeyType="done" />
          <Text style={styles.label}>Your focus vibe</Text>
          <View style={styles.vibes}>{VIBES.map(([emoji, label]) => (
            <TouchableOpacity key={emoji} onPress={() => dismissThen(() => setVibe(emoji), 0)} style={[styles.chip, vibe === emoji && styles.chipActive]}>
              <Text style={[styles.chipText, vibe === emoji && styles.chipTextActive]}>{emoji} {label}</Text>
            </TouchableOpacity>
          ))}</View>
          <TouchableOpacity disabled={busy} onPress={() => dismissThen(save, 0)} style={[styles.save, busy && styles.disabled]}>
            <Text style={styles.saveText}>{busy ? "Working..." : "Save profile"}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => dismissThen(() => router.back(), 0)} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, safe: { flex: 1, backgroundColor: "#061414" },
  header: { height: 62, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "rgba(102,185,185,.25)" },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }, title: { color: "#E8F4F4", fontSize: 20, fontWeight: "900" },
  content: { padding: 20 }, avatar: { width: 112, height: 112, borderRadius: 56, alignSelf: "center", backgroundColor: "#123131", borderWidth: 2, borderColor: "rgba(102,185,185,.5)", overflow: "hidden", alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%" }, emoji: { fontSize: 42 }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center", marginVertical: 22 },
  action: { minWidth: "45%", height: 48, borderRadius: 16, borderWidth: 1, borderColor: "rgba(102,185,185,.3)", backgroundColor: "rgba(18,49,49,.8)", flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  danger: { borderColor: "rgba(255,138,138,.35)", backgroundColor: "rgba(47,23,23,.85)" }, actionText: { color: "#66b9b9", marginLeft: 8, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, label: { color: "#66b9b9", fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8, marginTop: 8 }, count: { color: "#9FB5B5", fontSize: 11, fontWeight: "700" },
  input: { color: "#E8F4F4", backgroundColor: "rgba(18,49,49,.55)", borderWidth: 1, borderColor: "rgba(102,185,185,.25)", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14, fontWeight: "600", marginBottom: 16 },
  vibes: { flexDirection: "row", flexWrap: "wrap", marginBottom: 16 }, chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20, marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: "rgba(51,122,122,.35)", backgroundColor: "rgba(18,49,49,.7)" }, chipActive: { backgroundColor: "#66b9b9", borderColor: "#66b9b9" }, chipText: { color: "#E8F4F4", fontSize: 12, fontWeight: "700" }, chipTextActive: { color: "#061414" },
  save: { backgroundColor: "#66b9b9", padding: 16, borderRadius: 16, marginTop: 8 }, saveText: { color: "#061414", textAlign: "center", fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.2 }, cancel: { padding: 15, marginTop: 8 }, cancelText: { color: "#9FB5B5", textAlign: "center", fontWeight: "800" }, disabled: { opacity: .55 },
});
