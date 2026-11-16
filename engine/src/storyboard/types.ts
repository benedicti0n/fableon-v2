// Storyboard v1 runtime types (the JSON Schema in schema/storyboard.schema.json is the contract; these are the
// TypeScript shapes the interpreter consumes).
import type { Pose, PropK, SpecialK } from "../people";
import type { Expr } from "../toon";

export type Anchor =
  | { line: number; word: string; nth?: number; offset?: number }
  | { frame: number; offset?: number }
  | { end: true; offset?: number }
  | { shot: true; offset?: number };
export type Attach = "head" | "eyes" | "crown" | "chest" | "feet" | "handL" | "handR" | "prop";
export type Point = [number, number, number] | { at: string; d: [number, number, number]; screen?: [number, number, number] } | { actor: string; attach: Attach; d: [number, number, number] };
export type Animated = number | { keys: [Anchor, number][]; ease?: "linear" | "smooth" | "glide" | "step" };

export type PathMotion = {
  type: "path"; keys: [Anchor, Point][]; ease?: "linear" | "smooth" | "glide" | "step";
  walk?: { rate: number; offset?: number }; bob?: { amp: number; freq: number };
};
export type BallisticMotion = {
  type: "ballistic"; at: Anchor; v: [number, number, number]; a: [number, number, number];
  floorY?: number; spin?: number; delay?: number;
};
export type Motion = PathMotion | BallisticMotion;

export type Push = { from: Anchor; rate?: number; punch?: number; punchAt?: Anchor };
export type CamKey = {
  at: Anchor; cut?: boolean; dur?: number; type: "dolly" | "fixed" | "tilt";
  pos: Point; look: Point; fov: number; roll?: number; push?: Push; lookTo?: Point; tiltDur?: number; subjects?: string[]; later?: string[]; over?: string; scenery?: boolean; semantic?: boolean; size?: "close" | "medium" | "full" | "wide" | "establishing" | "insert"; with?: string[]; reaction?: boolean;
};
export type DofEntry = { at: Anchor; cInf: number; dur?: number; focus?: Point | null };
export type Talk = { base: Expr; rate?: number };
export type Appear = { at: Anchor; pop?: number; stagger?: number };
export type Visible = { from: Anchor; to: Anchor };
export type Beat = {
  at: Anchor; jump?: boolean; params?: Record<string, unknown>; scale?: number; mirror?: boolean; noBlob?: boolean; blobScale?: number;
  yaw?: number | null; pose?: Pose; expr?: Expr; prop?: PropK; facing?: -1 | 0 | 1; look?: number; seated?: boolean;
  headTilt?: number; tilt?: number; talk?: Talk | null; appear?: Appear | null; visible?: Visible | null;
};
export type Actor = {
  who: string; id?: string; view?: number; ride?: string; rideOffset?: [number, number, number]; special?: SpecialK | null; params?: Record<string, unknown>; pos?: Point; motion?: Motion;
  animate?: Record<string, Animated>; scale?: number; mirror?: boolean;
  noBlob?: boolean; blobScale?: number; yaw?: number | null; pose?: Pose; expr?: Expr; prop?: PropK; facing?: -1 | 0 | 1;
  look?: number; seated?: boolean; headTilt?: number; tilt?: number; talk?: Talk | null; appear?: Appear | null;
  visible?: Visible | null; beats?: Beat[];
};
export type Sparkle = {
  kind: "sparkle"; id?: string; motion?: Motion; at: Anchor; pos: Point; size?: number; count?: number; offsets?: [number, number, number][];
  pop?: { stagger?: number }; twinkle?: { freq: number; depth: number }; until?: Anchor; static?: boolean; card?: "cut" | "soft" | "glow" | "fire";
};
export type Halo = { kind: "halo"; id?: string; motion?: Motion; at: Anchor; pos: Point; size?: number; height?: number; pop?: number; color?: string; card?: "soft" | "glow" | "cut" | "fire"; peak?: number; visible?: { from: Anchor; to: Anchor } };
export type Knot = { kind: "knot"; id?: string; motion?: Motion; at: Anchor; pos: Point; size?: number; pop?: number; bob?: number };
export type Sweat = { kind: "sweat"; id?: string; motion?: Motion; at: Anchor; pos: Point; count?: number; rate?: number; spread?: number; drop?: number; size?: number };
export type Heart = { kind: "heart"; id?: string; motion?: Motion; at: Anchor; pos: Point; size?: number; pop?: number; bob?: { amp: number; freq: number } };
export type Petals = { kind: "petals"; id?: string; motion?: Motion; at: Anchor; pos: Point; count?: number; spread?: number };
export type Puff = { kind: "puff"; id?: string; motion?: Motion; at: Anchor; pos: Point; size?: number; dur?: number };
export type Arrow = { kind: "arrow"; id?: string; motion?: Motion; at: Anchor; toAt: Anchor; from: Point; to: Point; size?: [number, number]; rot?: number; stuck?: boolean };
export type Stars = { kind: "stars"; id?: string; motion?: Motion; at: Anchor; pos: Point; size?: [number, number]; period?: number; dur?: number; from?: Anchor };
export type Emblem = { kind: "emblem"; id?: string; at: Anchor; pos: Point; variant: "wheel" | "wind" | "bolt" | "horse"; size?: number; pop?: number; bob?: number; until?: Anchor };
export type Lump = { kind: "lump"; id?: string; motion?: Motion; at: Anchor; pos: Point; size?: number; pop?: number };
export type Mango = { kind: "mango"; id?: string; at: Anchor; pos: Point; motion: Motion; size?: number; until?: Anchor; rotOffset?: number };
export type Splash = { kind: "splash"; id?: string; at: Anchor; pos: Point; dur?: number; size?: [number, number] };
export type Bubbles = { kind: "bubbles"; id?: string; at: Anchor; pos: Point; count?: number; area?: [number, number]; offset?: [number, number, number]; rise?: number; rate?: number; size?: [number, number]; saltX?: number; saltZ?: number; saltPhase?: number; saltSize?: number; jitter?: number };
export type Burst = { kind: "burst"; id?: string; at: Anchor; pos: Point; size?: number; pop?: number; color?: string; phase?: number };
export type Fire = { kind: "fire"; id?: string; at: Anchor; pos: Point; spots?: [number, number, number, number][]; source?: "cityTreetops"; filter?: { zAfter?: number; radius?: number }; yLift?: number; sizeLift?: number; spread?: number; pop?: number; hashSalt?: number; visible?: { from: Anchor; to: Anchor } };
export type Smoke = { kind: "smoke"; id?: string; at: Anchor; pos: Point; count?: number; area?: [number, number]; offset?: [number, number, number]; rise?: number; rate?: number; size?: [number, number]; saltX?: number; saltZ?: number; saltPhase?: number; saltSize?: number; jitter?: number };
export type Pigeon = { kind: "pigeon"; id?: string; at: Anchor; pos: Point; motion: Motion; size?: number };
export type Dust = { kind: "dust"; id?: string; at: Anchor; pos: Point; dur?: number; rise?: number; size?: [number, number]; seed?: number; delay?: number };
export type Effect = Sparkle | Halo | Knot | Sweat | Heart | Petals | Puff | Arrow | Stars | Emblem | Lump | Mango | Splash | Bubbles | Burst | Fire | Smoke | Pigeon | Dust;
export type PagesAction = { piece: "pages"; height?: Animated };
export type BoatAction = { piece: "boat"; id?: string; motion: Motion; yaw?: number; roll?: number; rollBob?: { amp: number; freq: number } };
export type JarOverride = { index: number; at: Anchor; who?: string; expr?: Expr };
export type JarsAction = {
  piece: "jars"; id?: string; grid: { origin: Point; cols: number; dx: number; dz: number; rowShift?: number }; count: number;
  appear?: { from: Anchor; to: Anchor };
  lids?: { mode?: "stay" | "pop"; since?: Anchor; windowEnd?: Anchor; hashSalt?: number; overrides?: JarOverride[]; velocity?: [number, number, number]; spin?: number; cullY?: number };
  kids?: { since?: Anchor; windowEnd?: Anchor; hashSalt?: number; overrides?: JarOverride[]; seedBase?: number; cullDistance?: number; sink?: number; rise?: number; scale?: number; pose?: Pose; expr?: Expr; noBlob?: boolean; generator?: "kaurava" };
};
export type LadduAction = { piece: "ladduPlate"; at: Anchor; pos: Point; scale?: [number, number, number] };
export type NectarAction = { piece: "nectar"; id?: string; since: Anchor; to: Anchor; origin: Point; count?: number; radius?: [number, number]; y?: number; zOffset?: number; scale?: number; angleStart?: number; angleSpan?: number };
export type CityAction = { piece: "city"; from: Anchor; to: Anchor };
export type WheelAction = { piece: "wheel"; spin?: number; stopAt?: Anchor };
export type BigBowAction = { piece: "bigBow"; at: Anchor; dur?: number; amp?: number; rate?: number };
export type SetAction = PagesAction | BoatAction | JarsAction | LadduAction | NectarAction | WheelAction | BigBowAction | CityAction;
export type Pick<T> = { salt: number; below: number; a: T; b: T };
export type Crowd = {
  count: number; seedBase: number; generator?: "kaurava"; cast?: string[];
  layout: { grid?: { origin: Point; cols: number; dx: number; dz: number; rowShift?: number; xStart?: number }; points?: Point[] };
  first?: { index: number; who: string };
  pose?: Pose | Pick<Pose>; expr?: Expr | Pick<Expr>; scale?: number | { salt: number; min: number; span: number };
  facing?: -1 | 0 | 1; seated?: boolean; noBlob?: boolean;
};
export type Shot = {
  id: string; start: Anchor; end?: Anchor; light: "day" | "golden" | "night" | "deep"; sets: string[];
  sun?: { az: number; el: number }; camera?: CamKey[]; dof?: DofEntry[]; actors?: Actor[]; crowds?: Crowd[]; fx?: Effect[]; set?: SetAction[];
};
export type CastEntry = { spec: string | Record<string, unknown>; seed: number };
export type Storyboard = {
  version: 1; fps: number; tailFrames: number; flash?: Anchor; crossfade: number;
  points?: Record<string, Point>; cast?: Record<string, CastEntry>; kicks?: { at: Anchor; amp: number }[];
  shots: Shot[];
};
