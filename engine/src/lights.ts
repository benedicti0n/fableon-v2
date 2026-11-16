// Light presets per time of day / place. The sun is CAMERA-RELATIVE and frozen per shot (world.ts update()):
// az = degrees from the shot camera's forward axis (0 = straight ahead = backlight, +90 = screen right,
// 180 = behind camera), el = elevation. lit/shade/lift are LINEAR RGB multipliers for shade.ts (may exceed 1).
// day + golden are the bridge short's final values; night (firelight key + moonlit blue shade) and deep (the snake
// kingdom under the river) are new, built on the same two-tone model.
type C3 = [number, number, number];
export type LightName = "day" | "golden" | "night" | "deep";
export type LightPreset = {
  az: number; el: number;
  lit: C3; shade: C3; lift: C3; lambert: number; sideK: number; term: number;      // world two-tone (shade.ts)
  charTint: C3; charShade: number; charGrad: number; bodyGrad: number; sideTint: C3; // character cards (cast.ts)
  blob: C3; actorShadow: boolean;                                                    // contact blobs / card shadows
  fog: string; fogNear: number; fogFar: number; sunDisc: string;
  sunCol: string; sunI: number; sky: string; ground: string; hemiI: number;
  bias: number; normalBias: number;
};
export const LIGHTS: Record<LightName, LightPreset> = {
  day: {
    az: 75, el: 48,
    lit: [1.58, 1.5, 1.33], shade: [0.3, 0.29, 0.36], lift: [0.06, 0.05, 0.07], lambert: 0.35, sideK: 0.84, term: 0.2,
    charTint: [1.0, 0.94, 0.92], charShade: 0.86, charGrad: 0.07, bodyGrad: 0.2, sideTint: [0.92, 0.90, 0.96],
    blob: [0.62, 0.58, 0.58], actorShadow: false,
    fog: "#c4d6ec", fogNear: 25, fogFar: 320, sunDisc: "#000000",
    sunCol: "#fff3e0", sunI: 2.8, sky: "#dcecff", ground: "#b49a78", hemiI: 0.55,
    bias: -0.00025, normalBias: 0.015,
  },
  golden: {
    az: 105, el: 9,
    lit: [1.5, 0.68, 0.24], shade: [0.15, 0.15, 0.3], lift: [0.04, 0.06, 0.17], lambert: 0.35, sideK: 0.82, term: 0.07,
    charTint: [1.0, 0.88, 0.76], charShade: 0.88, charGrad: 0.1, bodyGrad: 0.25, sideTint: [0.85, 0.80, 0.95],
    blob: [0.75, 0.74, 0.9], actorShadow: true,
    fog: "#efb489", fogNear: 50, fogFar: 380, sunDisc: "#ffcf9e",
    sunCol: "#ffab5e", sunI: 5.5, sky: "#d8b0b8", ground: "#8a6a60", hemiI: 0.5,
    bias: -0.0006, normalBias: 0.03,
  },
  // firelight from a low warm source, everything else in moonlit indigo (shadows violet-blue, never black)
  night: {
    az: 35, el: 14,
    lit: [0.42, 0.48, 0.78], shade: [0.1, 0.11, 0.26], lift: [0.03, 0.05, 0.16], lambert: 0.45, sideK: 0.8, term: 0.12,
    charTint: [1.0, 0.84, 0.7], charShade: 0.7, charGrad: 0.12, bodyGrad: 0.28, sideTint: [0.7, 0.72, 0.98],
    blob: [0.6, 0.6, 0.8], actorShadow: true,
    fog: "#1f2550", fogNear: 30, fogFar: 260, sunDisc: "#000000",
    sunCol: "#b8c8ff", sunI: 3.0, sky: "#304080", ground: "#201830", hemiI: 0.3,
    bias: -0.0005, normalBias: 0.03,
  },
  // under the river: cyan key from the surface above, deep teal shade, teal fog
  deep: {
    az: 150, el: 70,
    lit: [0.62, 1.2, 1.25], shade: [0.08, 0.2, 0.32], lift: [0.03, 0.08, 0.14], lambert: 0.4, sideK: 0.85, term: 0.25,
    charTint: [0.78, 0.98, 1.0], charShade: 0.78, charGrad: 0.08, bodyGrad: 0.2, sideTint: [0.7, 0.85, 1.0],
    blob: [0.55, 0.7, 0.75], actorShadow: false,
    fog: "#0f5a6e", fogNear: 6, fogFar: 70, sunDisc: "#000000",
    sunCol: "#bff6ff", sunI: 2.4, sky: "#5fd0e0", ground: "#103040", hemiI: 0.4,
    bias: -0.0004, normalBias: 0.02,
  },
};

/** world-only look per light (sky stops by elevation in degrees, river colours, cloud palette). All colours are
 *  ON-SCREEN targets under the PBR-Neutral tone map; world.ts pre-inverts the tone map (shade.ts untone). */
export type WorldLook = {
  sky: { c: string[]; e: number[] };
  water: { near: string; mid: string; far: string; crest: string; trough: string; glint: string; shade: C3 };
  bounce: C3; sat: number;
  cloud: { lit: string; mid: string; shade: string } | null;
  stars?: boolean;
};
export const LOOK: Record<LightName, WorldLook> = {
  day: {
    sky: { c: ["#c4d6ec", "#9cbfea", "#6a9fe0", "#4f8cdb", "#3373cc"], e: [0, 3, 8, 16, 40] },
    water: { near: "#3aa6a8", mid: "#2a8aa6", far: "#2a6496", crest: "#8fe0e0", trough: "#1a5a78", glint: "#ffffff", shade: [0.5, 0.56, 0.72] },
    cloud: { lit: "#fbf8f1", mid: "#e1e5f3", shade: "#c3cbe9" },
    bounce: [0, 0, 0], sat: 1.08,
  },
  golden: {
    sky: { c: ["#ffc47c", "#f7ae78", "#e8967c", "#c4848e", "#8a6f8a"], e: [0, 4, 10, 20, 40] },
    water: { near: "#1e3a6e", mid: "#355f96", far: "#d4a48e", crest: "#d9a088", trough: "#16294f", glint: "#ffe2b0", shade: [0.42, 0.46, 0.72] },
    cloud: { lit: "#ffd2a8", mid: "#f2a08f", shade: "#a98fc4" },
    bounce: [0.04, 0.02, 0.0], sat: 1.1,
  },
  night: {
    sky: { c: ["#2a2f66", "#232a5c", "#1b2150", "#151a42", "#0e1233"], e: [0, 4, 10, 20, 45] },
    water: { near: "#141c40", mid: "#1c2a58", far: "#2a3266", crest: "#ff9c55", trough: "#0c1230", glint: "#ffc070", shade: [0.4, 0.42, 0.7] },
    cloud: null, stars: true,
    bounce: [0.05, 0.02, 0.0], sat: 0.62,
  },
  deep: {
    sky: { c: ["#0f5a6e", "#147086", "#1b8aa0", "#2aa6b8", "#5fd0e0"], e: [-10, 5, 20, 40, 80] },
    water: { near: "#0f5a6e", mid: "#0f5a6e", far: "#0f5a6e", crest: "#5fd0e0", trough: "#0a3a4a", glint: "#bff6ff", shade: [0.5, 0.6, 0.7] },
    cloud: null,
    bounce: [0, 0.02, 0.03], sat: 1.1,
  },
};
