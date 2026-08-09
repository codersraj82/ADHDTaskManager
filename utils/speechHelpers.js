import {
  FOCUS_COMPLETION_VOICE_AFFIRMATIONS,
  TASK_COMPLETION_VOICE_AFFIRMATIONS,
} from "./affirmations";
import { getRandomAffirmation } from "./getRandomAffirmation";

const cleanTaskTitle = (title) => {
  if (!title || typeof title !== "string") return "";
  return title.trim();
};

export const buildFocusCompletionSpeechMessage = () => {
  const base = getRandomAffirmation(FOCUS_COMPLETION_VOICE_AFFIRMATIONS);
  return `${base} Focus session completed.`;
};

export const buildTaskCompletionSpeechMessage = (taskTitle = "") => {
  const base = getRandomAffirmation(TASK_COMPLETION_VOICE_AFFIRMATIONS);
  const cleanTitle = cleanTaskTitle(taskTitle);
  if (!cleanTitle) return base;
  return `${base} Nice work on ${cleanTitle}.`;
};
