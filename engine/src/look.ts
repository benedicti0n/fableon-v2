// Deterministic lighting rigs for a scene mood. The model chooses the mood; these are the calibrated values the
// renderer uses. A look block is opt-in: a storyboard with no look keeps the legacy per-time-of-day preset bit-for-bit.
import { LIGHTS, LOOK, LightPreset, WorldLook } from "./lights";

export const MOODS = ["golden-glow", "warm-side", "dusk", "night-moon", "noon"] as const;
export type Mood = (typeof MOODS)[number];

export type Look = {
  mood: Mood;
  shafts?: boolean;
  sun?: boolean;
  glow?: number;
  rim?: number;
  grade?: string;
};

export type MoodRig = {
  light: LightPreset;
  world: WorldLook;
  sun: boolean;
  shafts: boolean;
  glow: { threshold: number; intensity: number; tint: string; radius: number };
  rim: { intensity: number; color: string };
  grade: string;
};

const light = (base: LightPreset, o: Partial<LightPreset>): LightPreset => ({ ...base, ...o });
const world = (base: WorldLook, o: Partial<WorldLook> = {}): WorldLook => ({ ...base, ...o, sky: o.sky ?? base.sky, water: o.water ?? base.water, cloud: o.cloud === undefined ? base.cloud : o.cloud });

// The sky/water palettes are the bridge short's measured on-screen colours; the light values are the two-tone
// calibration from lighting.md. Warm key + violet-blue shadow is the house look; every mood keeps a warm/cool split.
export const MOOD_RIG: Record<Mood, MoodRig> = {
  "golden-glow": {
    light: light(LIGHTS.golden, {
      az: 145, el: 10,
      lit: [1.62, 0.78, 0.3], shade: [0.17, 0.14, 0.34], lift: [0.05, 0.06, 0.19],
      sunCol: "#ffb066", sunI: 5.8, sky: "#e8c8c0", ground: "#7a5a60", hemiI: 0.4,
      charTint: [1.0, 0.83, 0.68], charShade: 0.9, charGrad: 0.12, bodyGrad: 0.26, sideTint: [0.78, 0.72, 0.98],
      fog: "#efb489", fogNear: 42, fogFar: 380, sunDisc: "#ffcf9e",
    }),
    world: world(LOOK.golden, { sat: 1.14 }),
    sun: true, shafts: true,
    glow: { threshold: 0.75, intensity: 0.19, tint: "#ffd0a0", radius: 22 },
    rim: { intensity: 1.0, color: "#ffb45c" },
    grade: "goldenGlow",
  },
  "warm-side": {
    light: light(LIGHTS.day, {
      az: 110, el: 28,
      lit: [1.56, 1.16, 0.9], shade: [0.24, 0.2, 0.38], lift: [0.05, 0.05, 0.12],
      sunCol: "#ffd7a8", sunI: 4.2, sky: "#d8e2fa", ground: "#b49a78", hemiI: 0.5,
      charTint: [1.0, 0.9, 0.8], charShade: 0.88, charGrad: 0.1, bodyGrad: 0.23, sideTint: [0.82, 0.84, 1.0],
      fog: "#c9d6ea", fogNear: 35, fogFar: 340,
    }),
    world: world(LOOK.golden, { sat: 1.08 }),
    sun: true, shafts: false,
    glow: { threshold: 0.75, intensity: 0.11, tint: "#ffd8b0", radius: 18 },
    rim: { intensity: 0.72, color: "#ffc078" },
    grade: "warmSide",
  },
  dusk: {
    light: light(LIGHTS.golden, {
      az: 158, el: 3,
      lit: [1.72, 0.58, 0.22], shade: [0.16, 0.1, 0.3], lift: [0.05, 0.05, 0.18],
      sunCol: "#ff8a3c", sunI: 5.4, sky: "#7a5f92", ground: "#5a3a50", hemiI: 0.32,
      charTint: [1.0, 0.72, 0.48], charShade: 0.82, charGrad: 0.14, bodyGrad: 0.3, sideTint: [0.62, 0.58, 0.96],
      fog: "#c47a8a", fogNear: 35, fogFar: 300, sunDisc: "#ffb070",
    }),
    world: world(LOOK.golden, {
      sky: { c: ["#ffb070", "#e88a72", "#b06a86", "#6e4f8c", "#3e3468"], e: [0, 4, 10, 20, 40] },
      sat: 1.12,
    }),
    sun: true, shafts: true,
    glow: { threshold: 0.75, intensity: 0.22, tint: "#ffb070", radius: 24 },
    rim: { intensity: 0.9, color: "#ffa050" },
    grade: "dusk",
  },
  "night-moon": {
    light: light(LIGHTS.night, {
      az: 55, el: 32,
      lit: [0.5, 0.56, 0.82], shade: [0.1, 0.12, 0.3], lift: [0.03, 0.05, 0.16],
      sunCol: "#b8c8ff", sunI: 3.2, sky: "#304080", ground: "#201830", hemiI: 0.28,
      charTint: [1.0, 0.84, 0.7], charShade: 0.7, charGrad: 0.12, bodyGrad: 0.28, sideTint: [0.7, 0.72, 0.98],
      fog: "#1f2550", fogNear: 30, fogFar: 260,
    }),
    world: world(LOOK.night, { sat: 0.7 }),
    sun: false, shafts: false,
    glow: { threshold: 0.75, intensity: 0.08, tint: "#bcd2ff", radius: 18 },
    rim: { intensity: 0.55, color: "#ffc27a" },
    grade: "nightMoon",
  },
  noon: {
    light: light(LIGHTS.day, {
      az: 75, el: 55,
      lit: [1.66, 1.56, 1.36], shade: [0.28, 0.26, 0.4], lift: [0.05, 0.05, 0.08],
      sunCol: "#fff3e0", sunI: 3.3, sky: "#dcecff", ground: "#b49a78", hemiI: 0.62,
      charTint: [1.0, 0.94, 0.9], charShade: 0.88, charGrad: 0.08, bodyGrad: 0.2, sideTint: [0.9, 0.9, 0.98],
      fog: "#c4d6ec", fogNear: 25, fogFar: 320,
    }),
    world: world(LOOK.day, { sat: 1.04 }),
    sun: false, shafts: false,
    glow: { threshold: 0.75, intensity: 0.05, tint: "#fff0d0", radius: 14 },
    rim: { intensity: 0.25, color: "#ffd8a0" },
    grade: "noon",
  },
};

export const moodRig = (mood: Mood | undefined | null): MoodRig | null => (mood && MOOD_RIG[mood]) || null;
