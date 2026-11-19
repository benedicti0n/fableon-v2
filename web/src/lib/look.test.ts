import { describe, expect, it } from 'vitest';
import { LOOK_NEUTRAL, cleanLook } from './look';

describe('finishing look defaults', () => {
  it('uses 1.00 as the neutral haze and glow multiplier', () => {
    expect(LOOK_NEUTRAL.haze).toBe(1);
    expect(LOOK_NEUTRAL.glow).toBe(1);
    expect(LOOK_NEUTRAL.exposure).toBe(0);
  });
  it('does not write untouched scene cards', () => {
    const look = cleanLook({ version: 1, scenes: { empty: {}, saved: { exposure: 0.2 } } });
    expect(look.scenes).toEqual({ saved: { exposure: 0.2 } });
  });
});
