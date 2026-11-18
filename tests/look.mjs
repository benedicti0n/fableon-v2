// Look rule tests: mood vocabulary, calibration targets and the dark-skin feature-rim threshold.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';
import { MOODS, MOOD_TARGETS, contrastAgainstInk, needsFeatureRim } from '../cli/src/look.js';

export function runLookTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const catalog = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8'));
  const adi = JSON.parse(readFileSync(join(ROOT, 'fixtures', 'adi-parva', 'storyboard.json'), 'utf8'));
  const specSkin = (spec) => {
    if (spec && typeof spec === 'object' && spec.skin) return spec.skin;
    if (typeof spec !== 'string') return null;
    const [group, ...rest] = spec.split('.');
    return (catalog.cast?.[group] ?? []).find((x) => x.name === rest.join('.'))?.spec?.skin ?? null;
  };
  const adiSkins = [...new Set(Object.values(adi.cast ?? {}).map((c) => specSkin(c.spec)).filter(Boolean))];
  ok('look moods', MOODS.length === 5 && MOODS.includes('golden-glow') && MOODS.includes('night-moon'), MOODS.join(','));
  ok('look targets calibrated', MOOD_TARGETS['golden-glow'].split >= 0.35 && MOOD_TARGETS['warm-side'].split >= 0.25, JSON.stringify(MOOD_TARGETS['golden-glow']));
  ok('Adi skins above the feature-rim threshold', adiSkins.every((s) => !needsFeatureRim(s)), adiSkins.filter((s) => needsFeatureRim(s)).join(','));
  ok('Bhima needs the feature rim', needsFeatureRim('#3e2a1a') && contrastAgainstInk('#3e2a1a') < 2.2, String(contrastAgainstInk('#3e2a1a')));
  ok('Bakasura redesign does not need it', !needsFeatureRim('#523f6b') && contrastAgainstInk('#523f6b') >= 2.2, String(contrastAgainstInk('#523f6b')));
  ok('light skin does not need it', !needsFeatureRim('#ffe2c2'), String(contrastAgainstInk('#ffe2c2')));
  return { ok: errors.length === 0, errors, checks };
}
