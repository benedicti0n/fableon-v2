// Look vocabulary shared by the CLI (look-dev, look check, tests). The renderer has the same mood rigs in
// engine/src/look.ts; this module is the contract and the calibration targets.
export const MOODS = ["golden-glow", "warm-side", "dusk", "night-moon", "noon"];

/** Calibrated on the Adi golden/day/night frames (see docs/reports/phase-3f.md): the Adi medians are
 *  day split 0.04 / glow 6.3% / mean 0.57 / std 0.24 / p2 0.03 / p98 0.93;
 *  golden split 0.56 / glow 0% / mean 0.37 / std 0.22 / p2 0.02 / p98 0.76;
 *  night split 0.31 / glow 0% / mean 0.14 / std 0.14 / p2 0.02 / p98 0.64.
 *  The ranges below keep the STYLE_BIBLE's mean 0.43-0.54 as the centre but accept bright open fields, forest
 *  shade and moonlit nights that the Adi film also contains. */
export const MOOD_TARGETS = {
  // World-only targets (characters are excluded by the coverage charMask). Calibrated against the Adi film's
  // world pixels: golden split 0.69/glow 0/mean 0.39/std 0.17/p2 0.17/p98 0.76; day split -0.19/0.1%/0.54/0.14/
  // 0.27/0.87; night split -0.23/0/0.15/0.07/0.08/0.27. The F3 whole-frame table included the characters' ink and
  // lit/shadow sides, which is why this table is lower for warm-side/night.
  "golden-glow": { split: 0.35, glow: [0.005, 0.06], mean: [0.32, 0.55], std: [0.14, 0.30], p2: [0.05, 0.25], p98: [0.75, 1.0] },
  "warm-side": { split: 0.05, glow: [0.0, 0.06], mean: [0.30, 0.65], std: [0.12, 0.30], p2: [0.05, 0.35], p98: [0.70, 1.0] },
  dusk: { split: 0.35, glow: [0.003, 0.06], mean: [0.25, 0.52], std: [0.12, 0.30], p2: [0.03, 0.20], p98: [0.70, 1.0] },
  "night-moon": { split: 0.03, glow: [0.0, 0.02], mean: [0.12, 0.40], std: [0.07, 0.22], p2: [0.02, 0.15], p98: [0.25, 0.80] },
  noon: { split: 0.05, glow: [0.0, 0.04], mean: [0.35, 0.65], std: [0.12, 0.30], p2: [0.04, 0.30], p98: [0.75, 1.0] },
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
