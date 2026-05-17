import * as Speech from "expo-speech";

let preferredVoiceIdentifier = null;

const resolvePreferredVoiceIdentifier = async () => {
  if (preferredVoiceIdentifier) return preferredVoiceIdentifier;

  try {
    const voices = await Speech.getAvailableVoicesAsync();
    if (!Array.isArray(voices) || !voices.length) return null;

    const englishVoices = voices.filter((voice) =>
      String(voice.language || "")
        .toLowerCase()
        .startsWith("en")
    );
    const candidates = englishVoices.length ? englishVoices : voices;
    const sorted = [...candidates].sort((a, b) => {
      const aQuality = Number(a.quality ?? 0);
      const bQuality = Number(b.quality ?? 0);
      return bQuality - aQuality;
    });
    preferredVoiceIdentifier = sorted[0]?.identifier || null;
    return preferredVoiceIdentifier;
  } catch (error) {
    return null;
  }
};

export const stopEncouragement = async () => {
  try {
    const isSpeaking = await Speech.isSpeakingAsync();
    if (isSpeaking) {
      await Speech.stop();
    }
  } catch (error) {
    // Avoid blocking UI for speech cleanup failures.
  }
};

export const speakEncouragement = async ({ message, muted = false }) => {
  if (muted || !message) return false;

  try {
    await stopEncouragement();
    const voiceIdentifier = await resolvePreferredVoiceIdentifier();
    Speech.speak(message, {
      language: "en-US",
      rate: 0.92,
      pitch: 0.98,
      voice: voiceIdentifier || undefined,
    });
    return true;
  } catch (error) {
    console.log("Speech playback error:", error);
    return false;
  }
};
