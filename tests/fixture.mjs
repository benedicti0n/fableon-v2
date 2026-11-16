// The director example must keep the reference shot's light and sun at the same start anchor.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';

export function runFixtureMatch() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const director = JSON.parse(readFileSync(join(ROOT, 'fixtures', 'adi-parva-authoring', 'storyboard.json'), 'utf8'));
  const fixture = JSON.parse(readFileSync(join(ROOT, 'fixtures', 'adi-parva', 'storyboard.json'), 'utf8'));
  ok('director has 12 shots', director.shots.length === 12, String(director.shots.length));
  for (const shot of director.shots) {
    const ref = fixture.shots.find((s) => s.id === shot.id);
    ok(`${shot.id} exists in fixture`, !!ref, 'missing');
    if (!ref) continue;
    ok(`${shot.id} same start`, JSON.stringify(shot.start) === JSON.stringify(ref.start), `${JSON.stringify(shot.start)} vs ${JSON.stringify(ref.start)}`);
    ok(`${shot.id} light`, (shot.light ?? 'day') === (ref.light ?? 'day'), `${shot.light} vs ${ref.light}`);
    ok(`${shot.id} sun`, JSON.stringify(shot.sun ?? null) === JSON.stringify(ref.sun ?? null), `${JSON.stringify(shot.sun)} vs ${JSON.stringify(ref.sun)}`);
  }
  return { ok: errors.length === 0, errors, checks };
}
