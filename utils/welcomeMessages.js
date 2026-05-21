import { WELCOME_VOICE_MESSAGES } from "./affirmations";
import { getRandomAffirmation } from "./getRandomAffirmation";

export const pickWelcomeMessage = (previousMessage = "") =>
  getRandomAffirmation(WELCOME_VOICE_MESSAGES, {
    previous:
      typeof previousMessage === "string" ? previousMessage.trim() : "",
  }) || "Welcome back. Let's take one task at a time.";
