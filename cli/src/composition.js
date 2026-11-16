// Composition thresholds for measured coverage checks. Keep every value here with its intent.
export const BANDS = {
  // Calibrated against the 38 keyed, acted shots of fixtures/adi-parva: the hand-tuned house style
  // labels many medium shots at 12-29 % head and full shots at 35-72 % body, so the synthetic
  // starting floors (40/26/50) rejected most of the reference film. Close keeps 60 % as its ceiling.
  close: { metric: 'head', min: 0.25, max: 0.60, floor: 0.25 },       // head box / frame
  medium: { metric: 'head', min: 0.12, max: 0.42, floor: 0.12 },      // head box / frame
  full: { metric: 'body', min: 0.30, max: 0.85, floor: 0.30 },        // head-to-feet / frame
  wide: { metric: 'body', min: 0.15, max: 0.50, floor: 0.10 },        // primary 15-50, other >=10
  establishing: { metric: 'body', min: 0.05, max: 2.00, floor: 0.05 },
  insert: { metric: 'body', min: 0.30, max: 0.85, floor: 0.30 },
};
export const HIDDEN_FRACTION = 0.60;      // subject visible pixels / solo pixels
export const CONTEXT_AREA = 0.02;         // `with` item minimum frame area
export const CONTEXT_VISIBLE = 0.40;      // `with` item minimum visible fraction
export const BLOCKER_AREA = 0.12;         // non-subject nearer than subject, frame area
export const BLOCKER_OVERLAP = 0.25;      // non-subject overlap with primary box
export const BLOCKER_MIN_AREA = 0.01;     // ignore tiny fx (an arrow) when only the overlap test fires
export const SPEAKER_AREA = 0.04;         // talking actor minimum frame area
export const SPEAKER_SECONDS = 1;         // talk duration before the warning
export const EYE_MIN = 0.30, EYE_MAX = 0.50;
export const EDGE_X = 0.04;               // side margin for a head region (4 %)
export const EDGE_TOP = 0.02;             // top margin for a head region (2 %)
export const EDGE_INTRUDER_AREA = 0.01;   // non-subject cut by an edge, minimum frame area
export const EDGE_INTRUDER_VISIBLE = 0.50; // ... and less than half of its solo silhouette visible
export const MERGE_OVERLAP = 0.10;        // over actor box overlap / smaller box
export const LOOK_AWAY_TOL = 0.02;        // screen-u difference before a gaze counts as sideways

const MOVING = new Set(['tiltUp', 'tiltDown', 'pan', 'reveal', 'glide', 'follow', 'crane']);
export const isMovingKey = (k) => MOVING.has(k.move) || k.type === 'tilt' || k.dur !== undefined || k.push?.rate === 0;
export const SETTLE_CUT = 6;              // frames after a cut before measuring
export const SAMPLE_EVERY = 12;           // extra samples in long keys
export const AMBIENT_EFFECTS = new Set(['halo', 'fire', 'smoke', 'burst', 'splash', 'petals', 'puff', 'stars']);
export const FIX = {
  hidden: 'move the subject into frame or remove it from this key',
  tooSmall: 'increase the size one step or move the camera closer',
  tooLarge: 'decrease the size one step or move the camera back',
  headCut: 'raise/lower the camera or widen the size until the head is inside',
  blocker: 'change side/angle, move the blocker, or split the key',
  context: 'add the context item to `with` framing or choose a wider size',
  speaker: 'keep the speaker on screen or mark the key `reaction: true`',
  eye: 'adjust the look/angle to put the eyes near 40 % from the top',
  edge: 'move the head inside the 4 % side / 2 % top margins',
  edgeIntruder: 'keep the background actor out of the frame edge or hide it',
  looksAway: 'set `face` so the actor/prop points at its target',
  merge: 'move the over actor and subject to opposite thirds',
};
export const inferSize = (fov = 40) => fov <= 38 ? 'close' : fov <= 40 ? 'medium' : fov <= 43 ? 'full' : fov <= 47 ? 'wide' : 'establishing';
