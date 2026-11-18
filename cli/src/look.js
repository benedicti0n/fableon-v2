// Look vocabulary shared by the CLI (look-dev, look check, tests). The renderer has the same mood rigs in
// engine/src/look.ts; this module is the contract and the calibration targets.
export const MOODS = ["golden-glow", "warm-side", "dusk", "night-moon", "noon"];

/** Calibrated on the Adi golden/night frames and the STYLE_BIBLE (mean/std/p2/p98 in display luma 0..1). */
export const MOOD_TARGETS = {
  "golden-glow": { split: 0.35, glow: [0.01, 0.06], mean: [0.43, 0.54], std: [0.21, 0.29], p2: [0.03, 0.11], p98: [0.90, 1.0] },
  "warm-side": { split: 0.25, glow: [0.005, 0.04], mean: [0.43, 0.54], std: [0.20, 0.29], p2: [0.03, 0.11], p98: [0.88, 1.0] },
  dusk: { split: 0.35, glow: [0.01, 0.06], mean: [0.40, 0.52], std: [0.21, 0.30], p2: [0.02, 0.10], p98: [0.88, 1.0] },
  "night-moon": { split: 0.15, glow: [0.005, 0.04], mean: [0.30, 0.45], std: [0.18, 0.28], p2: [0.01, 0.08], p98: [0.80, 1.0] },
  noon: { split: 0.15, glow: [0.002, 0.03], mean: [0.45, 0.56], std: [0.19, 0.29], p2: [0.03, 0.11], p98: [0.90, 1.0] },
};

const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => { const n = parseInt(String(hex).replace("#", ""), 16); return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
const INK = "#241726";
/** Contrast of a skin colour against the plum ink; the 3C warning threshold is 2.2. */
export const contrastAgainstInk = (skin) => (lum(skin) + 0.05) / 0.05;
export const needsFeatureRim = (skin) => contrastAgainstInk(skin) < 2.2;

/** A scene's mood defaults from its time of day when the planner did not choose one. */
export const moodForLight = (light, fallback = "warm-side") => (
  light === "golden" ? "golden-glow" : light === "night" ? "night-moon" : light === "deep" ? "dusk" : fallback
);
