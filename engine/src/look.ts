// Deterministic lighting rigs for a scene mood. The model chooses the mood; these are the calibrated values the
// renderer uses. A look block is opt-in: a storyboard with no look keeps the legacy per-time-of-day preset bit-for-bit.
import { LIGHTS, LOOK, LightPreset, WorldLook } from "./lights";

export const MOODS = ["golden-glow", "warm-side", "dusk", "night-moon", "noon"] as const;
export type Mood = (typeof MOODS)[number];

export type Look = {
  mood: Mood;
  shafts?: boolean;
  sun?: boolean;
  halo?: boolean;
  glow?: number;
  rim?: number;
  fill?: number;
  grade?: string;
};

export type MoodRig = {
  light: LightPreset;
  world: WorldLook;
  sun: boolean;
  shafts: boolean;
  fill: number;
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
      lit: [1.68, 0.8, 0.26], shade: [0.14, 0.13, 0.40], lift: [0.05, 0.06, 0.19],
      sunCol: "#ffb066", sunI: 5.8, sky: "#e8c8c0", ground: "#7a5a60", hemiI: 0.5,
      charTint: [1.0, 0.88, 0.72], charShade: 0.95, charGrad: 0.12, bodyGrad: 0.22, sideTint: [0.72, 0.7, 1.0],
      fog: "#efb489", fogNear: 42, fogFar: 380, sunDisc: "#ffcf9e",
    }),
    world: world(LOOK.golden, { sat: 1.14 }),
    sun: true, shafts: true, fill: 0.28,
    glow: { threshold: 0.7, intensity: 0.26, tint: "#ffd0a0", radius: 24 },
    rim: { intensity: 0.25, color: "#ffc070" },
    grade: "goldenGlow",
  },
  "warm-side": {
    light: light(LIGHTS.day, {
      az: 110, el: 28,
      lit: [1.56, 1.16, 0.9], shade: [0.24, 0.2, 0.38], lift: [0.05, 0.05, 0.12],
      sunCol: "#ffd09a", sunI: 5.4, sky: "#b8c8ea", ground: "#7a6a5e", hemiI: 0.22,
      charTint: [1.0, 0.9, 0.78], charShade: 0.86, charGrad: 0.13, bodyGrad: 0.27, sideTint: [0.72, 0.76, 1.0],
      fog: "#aebde0", fogNear: 35, fogFar: 340,
    }),
    world: world(LOOK.golden, { sat: 1.1 }),
    sun: true, shafts: false, fill: 0.08,
    glow: { threshold: 0.68, intensity: 0.18, tint: "#ffd8b0", radius: 20 },
    rim: { intensity: 0.2, color: "#ffc578" },
    grade: "warmSide",
  },
  dusk: {
    light: light(LIGHTS.golden, {
      az: 158, el: 3,
      lit: [1.72, 0.58, 0.22], shade: [0.15, 0.1, 0.34], lift: [0.05, 0.05, 0.18],
      sunCol: "#ff9a4a", sunI: 7.0, sky: "#8a6f9e", ground: "#624458", hemiI: 0.4,
      charTint: [1.0, 0.8, 0.62], charShade: 0.95, charGrad: 0.14, bodyGrad: 0.26, sideTint: [0.62, 0.6, 1.0],
      fog: "#c98a96", fogNear: 35, fogFar: 320, sunDisc: "#ffb070",
    }),
    world: world(LOOK.golden, {
      sky: { c: ["#ffc080", "#e89a7c", "#b87a94", "#7a5a96", "#4a3c76"], e: [0, 4, 10, 20, 40] },
      sat: 1.14,
    }),
    sun: true, shafts: true, fill: 0.28,
    glow: { threshold: 0.7, intensity: 0.28, tint: "#ffb070", radius: 26 },
    rim: { intensity: 0.3, color: "#ffb060" },
    grade: "dusk",
  },
  "night-moon": {
    light: light(LIGHTS.night, {
      az: 55, el: 32,
      lit: [0.5, 0.56, 0.82], shade: [0.1, 0.12, 0.3], lift: [0.03, 0.05, 0.16],
      sunCol: "#d4dcff", sunI: 5.8, sky: "#4a5aa0", ground: "#382848", hemiI: 0.72,
      charTint: [1.0, 0.88, 0.76], charShade: 0.9, charGrad: 0.12, bodyGrad: 0.28, sideTint: [0.8, 0.82, 1.0],
      fog: "#323a70", fogNear: 30, fogFar: 300, sunDisc: "#e8efff",
    }),
    world: world(LOOK.night, { sat: 0.85 }),
    sun: true, shafts: false, fill: 0.2,
    glow: { threshold: 0.62, intensity: 0.2, tint: "#c8d8ff", radius: 24 },
    rim: { intensity: 0.25, color: "#ffc27a" },
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
    sun: false, shafts: false, fill: 0.02,
    glow: { threshold: 0.72, intensity: 0.06, tint: "#fff0d0", radius: 16 },
    rim: { intensity: 0.1, color: "#ffd8a0" },
    grade: "noon",
  },
};

export const moodRig = (mood: Mood | undefined | null): MoodRig | null => (mood && MOOD_RIG[mood]) || null;
