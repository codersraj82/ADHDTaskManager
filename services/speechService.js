import * as Speech from "expo-speech";

let preferredVoiceIdentifier = null;
let lastSpokenMessage = "";
let lastSpokenAt = 0;

const MALE_HINTS = [
  "male",
  "man",
  "david",
  "daniel",
  "matthew",
  "thomas",
  "alex",
  "ryan",
  "aaron",
  "fred",
  "guy",
];

const FEMALE_HINTS = [
  "female",
  "woman",
  "samantha",
  "victoria",
  "karen",
  "allison",
  "ava",
  "siri",
  "kathy",
  "tessa",
  "serena",
];

const toVoiceTag = (voice = {}) =>
  `${voice.name || ""} ${voice.identifier || ""} ${voice.gender || ""}`.toLowerCase();

const normalizeSpeechText = (input = "") =>
  String(input)
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, " ")
    .replace(/[^\x20-\x7E]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s([,.!?;:])/g, "$1")
    .trim();

const getVoiceScore = (voice = {}) => {
  let score = 0;
  const tag = toVoiceTag(voice);
  const quality = Number(voice.quality ?? 0);

  if (String(voice.language || "").toLowerCase().startsWith("en")) score += 1200;
  score += quality * 100;

  if (voice.networkConnectionRequired === false) score += 120;
  if (voice.notInstalled) score -= 300;

  if (MALE_HINTS.some((hint) => tag.includes(hint))) score += 260;
  if (FEMALE_HINTS.some((hint) => tag.includes(hint))) score -= 180;

  return score;
};

const resolvePreferredVoiceIdentifier = async () => {
  if (preferredVoiceIdentifier) return preferredVoiceIdentifier;

  try {
    const voices = await Speech.getAvailableVoicesAsync();
    if (!Array.isArray(voices) || !voices.length) return null;

    const sorted = [...voices].sort((a, b) => getVoiceScore(b) - getVoiceScore(a));
    preferredVoiceIdentifier = sorted[0]?.identifier || null;
    return preferredVoiceIdentifier;
  } catch (error) {
    return null;
  }
};

export const stopEncouragement = async () => {
  try {
    const isSpeaking = await Speech.isSpeakingAsync();
    if (isSpeaking) await Speech.stop();
  } catch (error) {
    // Keep UI stable even if speech stop fails.
  }
};

export const speakEncouragement = async ({
  message,
  muted = false,
  minGapMs = 3800,
}) => {
  if (muted || !message) return false;

  const normalizedMessage = normalizeSpeechText(message);
  if (!normalizedMessage) return false;

  const now = Date.now();
  if (
    normalizedMessage === lastSpokenMessage &&
    now - lastSpokenAt < Math.max(0, minGapMs)
  ) {
    return false;
  }

  try {
    await stopEncouragement();
    const voiceIdentifier = await resolvePreferredVoiceIdentifier();

    Speech.speak(normalizedMessage, {
      language: "en-US",
      rate: 0.86,
      pitch: 0.9,
      volume: 0.82,
      voice: voiceIdentifier || undefined,
    });

    lastSpokenMessage = normalizedMessage;
    lastSpokenAt = now;
    return true;
  } catch (error) {
    console.log("Speech playback error:", error);
    return false;
  }
};
