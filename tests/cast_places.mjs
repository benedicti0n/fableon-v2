// Place mentions are never cast; people and beings are.
import { isPlaceMention } from '../cli/src/stages/cast.js';

export function runCastPlaceTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  ok('village is a place', isPlaceMention({ role: 'the village' }) && isPlaceMention({ name: 'Ekachakra', role: 'the town' }), 'village');
  ok('forest is a place', isPlaceMention({ role: 'the forest' }), 'forest');
  ok('mother is a person', !isPlaceMention({ role: 'the mother' }), 'mother');
  ok('demon is a being', !isPlaceMention({ role: 'the hungry demon' }), 'demon');
  return { ok: errors.length === 0, errors, checks };
}
