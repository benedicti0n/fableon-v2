// Storyboard v1 runtime types (the JSON Schema in schema/storyboard.schema.json is the contract; these are the
// TypeScript shapes the interpreter consumes).
import type { Pose, PropK, SpecialK } from "../people";
import type { Expr } from "../toon";

export type Anchor =
  | { line: number; word: string; nth?: number; offset?: number }
  | { frame: number; offset?: number }
  | { end: true; offset?: number }
  | { shot: true; offset?: number };
export type Point = [number, number, number] | { at: string; d: [number, number, number] };
export type Animated = number | { keys: [Anchor, number][]; ease?: "linear" | "smooth" | "glide" | "step" };

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
  who: string; special?: SpecialK | null; params?: Record<string, unknown>; pos?: Point; scale?: number; mirror?: boolean;
  noBlob?: boolean; blobScale?: number; yaw?: number | null; pose?: Pose; expr?: Expr; prop?: PropK; facing?: -1 | 0 | 1;
  look?: number; seated?: boolean; headTilt?: number; tilt?: number; talk?: Talk | null; appear?: Appear | null;
  visible?: Visible | null; beats?: Beat[];
};
export type Sparkle = {
  kind: "sparkle"; at: Anchor; pos: Point; size?: number; count?: number; offsets?: [number, number, number][];
  pop?: { stagger?: number }; twinkle?: { freq: number; depth: number };
};
export type Halo = { kind: "halo"; at: Anchor; pos: Point; size?: number; pop?: number; color?: string; card?: "soft" | "glow" | "cut" };
export type Knot = { kind: "knot"; at: Anchor; pos: Point; size?: number; pop?: number; bob?: number };
export type Effect = Sparkle | Halo | Knot;
export type SetAction = { piece: "pages"; height?: Animated };
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
