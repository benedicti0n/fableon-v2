// Pure pose framing envelopes; no DOM or engine imports so tests and tools can use them directly.
import MEASURES from '../../schema/pose-measures.json';

export type FrameMeasure = { description?: string; standing: number; seated: number; eye: number; eyeSeated: number; head: number; halfWidth: number };

export const POSE_MEASURES = MEASURES as Record<string, { standing: number; seated: number; eye: number; eyeSeated: number; head: number; halfWidth: number }>;

export function poseMeasure<T extends FrameMeasure>(pose: string, base: T): T {
  const p = POSE_MEASURES[pose];
  if (!p) return base;
  return { ...base, standing: base.standing * p.standing, seated: base.seated * p.seated, eye: base.eye * p.eye, eyeSeated: base.eyeSeated * p.eyeSeated, head: base.head * p.head, halfWidth: base.halfWidth * p.halfWidth };
}
