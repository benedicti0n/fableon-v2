// Pure pose framing envelopes; no DOM or engine imports so tests and tools can use them directly.
export type FrameMeasure = { description?: string; standing: number; seated: number; eye: number; eyeSeated: number; head: number; halfWidth: number };

export const POSE_MEASURES: Record<string, { standing: number; seated: number; eye: number; eyeSeated: number; head: number; halfWidth: number }> = {
  kneel: { standing: 0.72, seated: 0.72, eye: 0.62, eyeSeated: 0.62, head: 1, halfWidth: 0.78 },
  pranam: { standing: 0.62, seated: 0.62, eye: 0.5, eyeSeated: 0.5, head: 0.95, halfWidth: 0.85 },
  lie: { standing: 0.36, seated: 0.36, eye: 0.26, eyeSeated: 0.26, head: 0.8, halfWidth: 1.9 },
  fallen: { standing: 0.3, seated: 0.3, eye: 0.22, eyeSeated: 0.22, head: 0.8, halfWidth: 1.9 },
  sleep: { standing: 0.3, seated: 0.3, eye: 0.2, eyeSeated: 0.2, head: 0.8, halfWidth: 1.9 },
  strike: { standing: 1, seated: 1, eye: 1, eyeSeated: 1, head: 1, halfWidth: 1.25 },
  guard: { standing: 1, seated: 1, eye: 1, eyeSeated: 1, head: 1, halfWidth: 0.95 },
  blowConch: { standing: 1, seated: 1, eye: 1, eyeSeated: 1, head: 1, halfWidth: 0.9 },
  drive: { standing: 0.9, seated: 0.9, eye: 0.78, eyeSeated: 0.78, head: 1, halfWidth: 1.05 },
  ride: { standing: 0.9, seated: 0.9, eye: 0.78, eyeSeated: 0.78, head: 1, halfWidth: 1.2 },
  dance: { standing: 1, seated: 1, eye: 1, eyeSeated: 1, head: 1, halfWidth: 1.15 },
  weep: { standing: 1, seated: 1, eye: 1, eyeSeated: 1, head: 1, halfWidth: 0.9 },
  lift: { standing: 1, seated: 1, eye: 1, eyeSeated: 1, head: 1, halfWidth: 1.15 },
};

export function poseMeasure<T extends FrameMeasure>(pose: string, base: T): T {
  const p = POSE_MEASURES[pose];
  if (!p) return base;
  return { ...base, standing: base.standing * p.standing, seated: base.seated * p.seated, eye: base.eye * p.eye, eyeSeated: base.eyeSeated * p.eyeSeated, head: base.head * p.head, halfWidth: base.halfWidth * p.halfWidth };
}
