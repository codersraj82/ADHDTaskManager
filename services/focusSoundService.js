import { createAudioPlayer, setAudioModeAsync } from "expo-audio";

const SESSION_BEEP_SOURCE = require("../assets/sounds/focus_session_beep.mp3");
const REMINDER_BEEP_SOURCE = require("../assets/sounds/focus_reminder_beep.mp3");

const SESSION_VOLUME = 0.22;
const REMINDER_VOLUME = 0.17;
const MINIMUM_REPLAY_GAP_MS = 750;

let players = null;
let preloadPromise = null;
let playbackGeneration = 0;
let lastPlaybackAt = {
  session: 0,
  reminder: 0,
};

const pauseAndRewind = async (player) => {
  if (!player) return;
  try {
    player.pause();
    await player.seekTo(0);
  } catch {
    // Sound cleanup must never interrupt focus-state cleanup.
  }
};

export const preloadFocusBeeps = async () => {
  if (players) return true;
  if (preloadPromise) return preloadPromise;

  preloadPromise = (async () => {
    try {
      await setAudioModeAsync({
        playsInSilentMode: false,
        interruptionMode: "mixWithOthers",
      });

      const session = createAudioPlayer(SESSION_BEEP_SOURCE);
      const reminder = createAudioPlayer(REMINDER_BEEP_SOURCE);
      session.volume = SESSION_VOLUME;
      reminder.volume = REMINDER_VOLUME;
      players = { session, reminder };
      return true;
    } catch (error) {
      console.log("Focus sound preload error:", error);
      return false;
    } finally {
      preloadPromise = null;
    }
  })();

  return preloadPromise;
};

const playFocusBeep = async (kind) => {
  const requestedGeneration = playbackGeneration;
  const isReady = await preloadFocusBeeps();
  if (!isReady || requestedGeneration !== playbackGeneration || !players) {
    return false;
  }

  const player = players[kind];
  const now = Date.now();
  if (
    !player ||
    player.playing ||
    now - lastPlaybackAt[kind] < MINIMUM_REPLAY_GAP_MS
  ) {
    return false;
  }

  try {
    await pauseAndRewind(kind === "session" ? players.reminder : players.session);
    if (requestedGeneration !== playbackGeneration) return false;

    await player.seekTo(0);
    if (requestedGeneration !== playbackGeneration) return false;

    lastPlaybackAt[kind] = now;
    player.play();
    return true;
  } catch (error) {
    console.log(`Focus ${kind} beep error:`, error);
    return false;
  }
};

export const playFocusSessionBeep = () => playFocusBeep("session");

export const playFocusReminderBeep = () => playFocusBeep("reminder");

export const stopFocusBeeps = async () => {
  playbackGeneration += 1;
  if (!players) return;
  await Promise.all([
    pauseAndRewind(players.session),
    pauseAndRewind(players.reminder),
  ]);
};

export const unloadFocusBeeps = async () => {
  await stopFocusBeeps();
  if (preloadPromise) {
    await preloadPromise;
  }
  const loadedPlayers = players;
  players = null;
  lastPlaybackAt = { session: 0, reminder: 0 };

  if (!loadedPlayers) return;
  try {
    loadedPlayers.session.remove();
    loadedPlayers.reminder.remove();
  } catch {
    // Players may already be released during native teardown.
  }
};
