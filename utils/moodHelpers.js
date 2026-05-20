export const MOOD_TYPES = {
  VERY_HAPPY: "very_happy",
  HAPPY: "happy",
  NEUTRAL: "neutral",
  SAD: "sad",
  FRUSTRATED: "frustrated",
};

export const MOOD_OPTIONS = [
  { type: MOOD_TYPES.VERY_HAPPY, emoji: "😁", label: "Very Happy", score: 5 },
  { type: MOOD_TYPES.HAPPY, emoji: "🙂", label: "Happy", score: 4 },
  { type: MOOD_TYPES.NEUTRAL, emoji: "😐", label: "Neutral", score: 3 },
  { type: MOOD_TYPES.SAD, emoji: "😟", label: "Sad", score: 2 },
  { type: MOOD_TYPES.FRUSTRATED, emoji: "😣", label: "Frustrated", score: 1 },
];

const MOOD_MAP = MOOD_OPTIONS.reduce((acc, option) => {
  acc[option.type] = option;
  return acc;
}, {});

const MOOD_BUCKETS = {
  [MOOD_TYPES.VERY_HAPPY]: "happy",
  [MOOD_TYPES.HAPPY]: "happy",
  [MOOD_TYPES.NEUTRAL]: "neutral",
  [MOOD_TYPES.SAD]: "sad",
  [MOOD_TYPES.FRUSTRATED]: "frustrated",
};

export const MOOD_AFFIRMATIONS = {
  daily: {
    happy: [
      "🚀 You are building amazing momentum today.",
      "✨ Your consistency is shining through.",
      "🌟 Great energy today — keep flowing gently.",
    ],
    neutral: [
      "🌱 Steady days still create progress.",
      "✨ Quiet momentum is still real momentum.",
      "🧠 You are moving forward at your own pace.",
    ],
    sad: [
      "🌿 Difficult days still count.",
      "✨ Small progress still matters today.",
      "🧠 Be kind to yourself while moving forward.",
    ],
    frustrated: [
      "☕ Pause. Breathe. You are still trying.",
      "🌙 Frustration does not erase progress.",
      "🧠 One difficult moment does not define your day.",
    ],
  },
  task: {
    happy: [
      "✨ You handled this well.",
      "🚀 Nice follow-through on this one.",
      "🌟 That effort created momentum.",
    ],
    neutral: [
      "🌱 One step at a time still works.",
      "🧠 Steady progress is good progress.",
      "✨ You kept moving — that matters.",
    ],
    sad: [
      "🌿 This effort still counts.",
      "🫶 You showed up for yourself here.",
      "✨ Gentle progress is enough right now.",
    ],
    frustrated: [
      "☕ You stayed with it through a hard moment.",
      "🌙 A hard task can still be a real win.",
      "🧠 Breathe — you are still building progress.",
    ],
  },
  weekly: [
    "🌱 You kept showing up this week, even on difficult days.",
    "✨ Your awareness this week is meaningful progress.",
    "🧠 You stayed engaged with yourself this week.",
  ],
  monthly: [
    "✨ Your emotional awareness is growing gently over time.",
    "🌿 You kept returning to yourself this month.",
    "🧭 You are learning your rhythm, one day at a time.",
  ],
  yearly: [
    "🌙 Every season mattered. You kept moving forward.",
    "✨ Your long-term consistency tells a powerful story.",
    "🌱 You kept coming back to progress across the year.",
  ],
  heavier_days: [
    "🌙 Today felt heavy. Even small effort counts.",
    "☕ You have been carrying a lot lately. Gentle progress still matters.",
    "🫶 You are doing your best, and that is enough for now.",
  ],
};

const hashString = (value = "") => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

export const getMoodMeta = (moodType) => MOOD_MAP[moodType] || null;

export const isValidMoodType = (moodType) => Boolean(MOOD_MAP[moodType]);

export const getMoodScore = (moodType) => MOOD_MAP[moodType]?.score ?? null;

export const getMoodBucket = (moodType) =>
  MOOD_BUCKETS[moodType] || "neutral";

export const getMoodTypeFromAverageScore = (score) => {
  if (!Number.isFinite(score)) return null;
  if (score >= 4.5) return MOOD_TYPES.VERY_HAPPY;
  if (score >= 3.5) return MOOD_TYPES.HAPPY;
  if (score >= 2.5) return MOOD_TYPES.NEUTRAL;
  if (score >= 1.5) return MOOD_TYPES.SAD;
  return MOOD_TYPES.FRUSTRATED;
};

export const pickAffirmation = (list = [], seed = "") => {
  if (!Array.isArray(list) || !list.length) return "";
  const idx = hashString(seed) % list.length;
  return list[idx];
};

export const pickMoodAffirmation = ({
  context = "daily",
  moodType = MOOD_TYPES.NEUTRAL,
  seed = "",
  isHeavierDay = false,
}) => {
  if (context === "weekly" || context === "monthly" || context === "yearly") {
    return pickAffirmation(MOOD_AFFIRMATIONS[context], `${context}:${seed}`);
  }

  if (context === "daily" && isHeavierDay) {
    return pickAffirmation(MOOD_AFFIRMATIONS.heavier_days, `heavier:${seed}`);
  }

  const bucket = getMoodBucket(moodType);
  const source = MOOD_AFFIRMATIONS[context]?.[bucket] || MOOD_AFFIRMATIONS.daily.neutral;
  return pickAffirmation(source, `${context}:${bucket}:${seed}`);
};

export const getDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

