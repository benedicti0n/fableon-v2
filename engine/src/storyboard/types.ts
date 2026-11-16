// Storyboard v1 runtime types (the JSON Schema in schema/storyboard.schema.json is the contract; these are the
// TypeScript shapes the interpreter consumes).
import type { Pose, PropK, SpecialK } from "../people";
import type { Expr } from "../toon";

export type Anchor =
  | { line: number; word: string; nth?: number; offset?: number }
  | { frame: number; offset?: number }
  | { end: true; offset?: number }
  | { shot: true; offset?: number };
export type Point = [number, number, number] | { at: string; d: [number, number, number]; screen?: [number, number, number] };
export type Animated = number | { keys: [Anchor, number][]; ease?: "linear" | "smooth" | "glide" | "step" };

export type PathMotion = {
  type: "path"; keys: [Anchor, Point][]; ease?: "linear" | "smooth" | "glide" | "step";
  walk?: { rate: number; offset?: number }; bob?: { amp: number; freq: number };
};
export type BallisticMotion = {
  type: "ballistic"; at: Anchor; v: [number, number, number]; a: [number, number, number];
  floorY?: number; spin?: number;
};
export type Motion = PathMotion | BallisticMotion;

export type Push = { from: Anchor; rate?: number; punch?: number; punchAt?: Anchor };
export type CamKey = {
  at: Anchor; cut?: boolean; dur?: number; type: "dolly" | "fixed" | "tilt";
  pos: Point; look: Point; fov: number; roll?: number; push?: Push; lookTo?: Point; tiltDur?: number;
};
export type DofEntry = { at: Anchor; cInf: number; dur?: number; focus?: Point | null };
export type Talk = { base: Expr; rate?: number };
export type Appear = { at: Anchor; pop?: number; stagger?: number };
export type Visible = { from: Anchor; to: Anchor };
export type Beat = {
  at: Anchor; params?: Record<string, unknown>; scale?: number; mirror?: boolean; noBlob?: boolean; blobScale?: number;
  yaw?: number | null; pose?: Pose; expr?: Expr; prop?: PropK; facing?: -1 | 0 | 1; look?: number; seated?: boolean;
  headTilt?: number; tilt?: number; talk?: Talk | null; appear?: Appear | null; visible?: Visible | null;
};
export type Actor = {
  who: string; id?: string; special?: SpecialK | null; params?: Record<string, unknown>; pos?: Point; motion?: Motion;
  animate?: Record<string, Animated>; scale?: number; mirror?: boolean;
  noBlob?: boolean; blobScale?: number; yaw?: number | null; pose?: Pose; expr?: Expr; prop?: PropK; facing?: -1 | 0 | 1;
  look?: number; seated?: boolean; headTilt?: number; tilt?: number; talk?: Talk | null; appear?: Appear | null;
  visible?: Visible | null; beats?: Beat[];
};
export type Sparkle = {
  kind: "sparkle"; id?: string; motion?: Motion; at: Anchor; pos: Point; size?: number; count?: number; offsets?: [number, number, number][];
  pop?: { stagger?: number }; twinkle?: { freq: number; depth: number };
};
export type Halo = { kind: "halo"; id?: string; motion?: Motion; at: Anchor; pos: Point; size?: number; pop?: number; color?: string; card?: "soft" | "glow" | "cut" | "fire" };
export type Knot = { kind: "knot"; id?: string; motion?: Motion; at: Anchor; pos: Point; size?: number; pop?: number; bob?: number };
export type Sweat = { kind: "sweat"; id?: string; motion?: Motion; at: Anchor; pos: Point; count?: number; rate?: number; spread?: number; drop?: number; size?: number };
export type Heart = { kind: "heart"; id?: string; motion?: Motion; at: Anchor; pos: Point; size?: number; pop?: number; bob?: { amp: number; freq: number } };
export type Petals = { kind: "petals"; id?: string; motion?: Motion; at: Anchor; pos: Point; count?: number; spread?: number };
export type Puff = { kind: "puff"; id?: string; motion?: Motion; at: Anchor; pos: Point; size?: number; dur?: number };
export type Arrow = { kind: "arrow"; id?: string; motion?: Motion; at: Anchor; toAt: Anchor; from: Point; to: Point; size?: [number, number]; rot?: number };
export type Stars = { kind: "stars"; id?: string; motion?: Motion; at: Anchor; pos: Point; size?: [number, number]; period?: number; dur?: number };
export type Emblem = { kind: "emblem"; id?: string; at: Anchor; pos: Point; variant: "wheel" | "wind" | "bolt" | "horse"; size?: number; pop?: number; bob?: number; until?: Anchor };
export type Effect = Sparkle | Halo | Knot | Sweat | Heart | Petals | Puff | Arrow | Stars | Emblem;
export type PagesAction = { piece: "pages"; height?: Animated };
export type BoatAction = { piece: "boat"; id?: string; motion: Motion; yaw?: number; roll?: number; rollBob?: { amp: number; freq: number } };
export type SetAction = PagesAction | BoatAction;
export type Shot = {
  id: string; start: Anchor; legacy?: boolean; light: "day" | "golden" | "night" | "deep"; sets: string[];
  sun?: { az: number; el: number }; camera?: CamKey[]; dof?: DofEntry[]; actors?: Actor[]; fx?: Effect[]; set?: SetAction[];
};
export type CastEntry = { spec: string | Record<string, unknown>; seed: number };
export type Storyboard = {
  version: 1; fps: number; tailFrames: number; flash?: Anchor; crossfade: number;
  points?: Record<string, Point>; cast?: Record<string, CastEntry>; kicks?: { at: Anchor; amp: number }[];
  shots: Shot[];
};
