import { Buffer } from "node:buffer";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import lamejs from "@breezystack/lamejs";

const SAMPLE_RATE = 44_100;
const MP3_BIT_RATE_KBPS = 64;
const MP3_BLOCK_SIZE = 1_152;
const MAX_AMPLITUDE = 0.16;
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIRECTORY = resolve(SCRIPT_DIRECTORY, "../assets/sounds");
const ANDROID_RAW_DIRECTORY = resolve(
  SCRIPT_DIRECTORY,
  "../modules/android-clock-alarm/android/src/main/res/raw"
);

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

const getEnvelope = (timeSeconds, durationSeconds) => {
  const attack = clamp(timeSeconds / 0.025, 0, 1);
  const release = clamp((durationSeconds - timeSeconds) / 0.08, 0, 1);
  return Math.min(attack, release);
};

const buildTone = ({ durationSeconds, frequencyAtTime }) => {
  const sampleCount = Math.ceil(durationSeconds * SAMPLE_RATE);
  const samples = new Int16Array(sampleCount);

  for (let index = 0; index < sampleCount; index += 1) {
    const timeSeconds = index / SAMPLE_RATE;
    const frequency = frequencyAtTime(timeSeconds);
    if (!frequency) continue;

    const envelope = getEnvelope(timeSeconds, durationSeconds);
    const primary = Math.sin(2 * Math.PI * frequency * timeSeconds);
    const softHarmonic =
      0.12 * Math.sin(2 * Math.PI * frequency * 2 * timeSeconds);
    const normalized = (primary + softHarmonic) / 1.12;
    samples[index] = Math.round(
      normalized * envelope * MAX_AMPLITUDE * 32_767
    );
  }

  return samples;
};

const encodeMp3 = (samples) => {
  const encoder = new lamejs.Mp3Encoder(1, SAMPLE_RATE, MP3_BIT_RATE_KBPS);
  const chunks = [];

  for (let offset = 0; offset < samples.length; offset += MP3_BLOCK_SIZE) {
    const encoded = encoder.encodeBuffer(
      samples.subarray(offset, offset + MP3_BLOCK_SIZE)
    );
    if (encoded.length) chunks.push(Buffer.from(encoded));
  }

  const finalChunk = encoder.flush();
  if (finalChunk.length) chunks.push(Buffer.from(finalChunk));
  return Buffer.concat(chunks);
};

const writeTone = (fileName, options) => {
  const encodedTone = encodeMp3(buildTone(options));
  const outputPath = resolve(OUTPUT_DIRECTORY, fileName);
  const androidRawPath = resolve(ANDROID_RAW_DIRECTORY, fileName);
  rmSync(outputPath, { force: true });
  rmSync(androidRawPath, { force: true });
  writeFileSync(outputPath, encodedTone);
  writeFileSync(androidRawPath, encodedTone);
  return outputPath;
};

mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
mkdirSync(ANDROID_RAW_DIRECTORY, { recursive: true });

const sessionPath = writeTone("focus_session_beep.mp3", {
  durationSeconds: 0.64,
  frequencyAtTime: (timeSeconds) => {
    if (timeSeconds < 0.27) return 660;
    if (timeSeconds < 0.32) return 0;
    if (timeSeconds < 0.6) return 880;
    return 0;
  },
});

const reminderPath = writeTone("focus_reminder_beep.mp3", {
  durationSeconds: 0.3,
  frequencyAtTime: (timeSeconds) => (timeSeconds < 0.27 ? 520 : 0),
});

console.log(`Created ${sessionPath}`);
console.log(`Created ${reminderPath}`);
