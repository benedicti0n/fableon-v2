// Export the runtime catalog to schema/catalog.json. Lists live in the engine sources (single source of truth); status
// and descriptions are added here so the validator and future models see what is implemented.
import { build } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const src = join(root, 'engine', 'src');
const out = join(root, 'schema', 'catalog.json');
const dist = join(root, 'engine', 'dist');

const entry = `
import { POSES, PROPS, SPECIALS } from "./people";
import { EXPRS } from "./toon";
import { LIGHTS_NAMES } from "./lights";
import { PLACES } from "./places";
import { SET_NAMES } from "./sets";
import { C, KIDS } from "./castlist";
const e = (name, description, status = "implemented") => ({ name, status, description });
const sets = ${JSON.stringify({
  palace: "Hastinapura palace courtyard, arcades, ghat and mango trees.",
  village: "Fisher village on the south bank: huts, sand, palms, boats.",
  hermitage: "Vyasa's forest hermitage: banyan, open hut, writing desk and palm leaves.",
  deer: "Pandu's forest clearing.",
  lac: "The lacquer house at Varanavata and its tunnel.",
  arena: "The Panchala contest arena, bow stand, target pole and wheel.",
  city: "The clearing where Indraprastha rises, with the Khandava forest.",
  naga: "The snake kingdom under the river.",
})};
const setDesc = ${JSON.stringify({
  palace: "Hastinapura palace courtyard, arcades, ghat and mango trees.",
  village: "Fisher village on the south bank: huts, sand, palms, boats.",
  hermitage: "Vyasa's forest hermitage: banyan, open hut, writing desk and palm leaves.",
  deer: "Pandu's forest clearing.",
  lac: "The lacquer house at Varanavata and its tunnel.",
  arena: "The Panchala contest arena, bow stand, target pole and wheel.",
  city: "The clearing where Indraprastha rises, with the Khandava forest.",
  naga: "The snake kingdom under the river.",
})};
const specials = ${JSON.stringify({
  ganesha: "Ganesha writing at the desk; elephant head, trunk, pen and palm leaves.",
  agni: "The fire god: red skin, flame hair, round belly he holds when full.",
  deer: "Stag in side view (wide card); graze, shock and walk phase.",
  naga: "Coiled cobra with a hood; optional king crown and sway.",
  baby: "Swaddled baby bundle (baby card).",
  pot: "Cooking pot drawn with jarShape (body card).",
  flat: "A person drawn lying flat on a wide card (knocked-down kings).",
})};
const plannedSpecial = new Set();
const effects = ${JSON.stringify({
  sparkle: "Four-point star card; per-index pop and optional twinkle.",
  halo: "Soft radial glow; card kind soft, glow or fire.",
  knot: "A tangled knot drawn as a line; bob on y.",
  heart: "Heart card for falling in love or affection.",
  emblem: "God emblem card: wheel, wind, bolt or horse.",
  puff: "Dust puff; also the sage transformation.",
  stars: "Four stars circling a point.",
  arrow: "Arrow card travelling from one Point to another.",
  splash: "Water splash crown on an 800x800 card.",
  bubbles: "Rising bubble column.",
  burst: "Impact burst of rays on a 500x500 card.",
  petals: "Falling flower petals around a box.",
  fire: "Flickering fire on a 512x512 card, fog-free.",
  smoke: "Rising smoke puffs.",
  pigeon: "Flying pigeon carrying a scroll.",
  mango: "Mango card.",
  sweat: "Sweat drop.",
  lump: "The lump of flesh card.",
  pigeon: "Flying pigeon carrying a scroll.",
  dust: "One-shot rising dust/smoke puff.",
})};
const fStatus = new Set(["sparkle", "halo", "knot", "sweat", "heart", "petals", "puff", "arrow", "stars", "emblem", "lump", "mango", "splash", "bubbles", "burst", "fire", "smoke", "pigeon", "dust"]);
const pieces = ${JSON.stringify({
  pages: "Palm-leaf stack growing at the writing desk.",
  boat: "Satyavati's boat on the river; motion and roll.",
  jars: "101 ghee jars and lids; lids pop, kids climb out.",
  wheel: "The contest wheel; spins and can stop at an anchor.",
  city: "Indraprastha rising from the ground.",
  ladduPlate: "The plate of sweets in the palace.",
  nectar: "Eight nectar pots that disappear while Bhima drinks.",
  bigBow: "The giant contest bow; wobbles on impact.",
})};
const pStatus = new Set(["pages", "boat", "jars", "ladduPlate", "nectar", "wheel", "bigBow", "city"]);
const poses = ${JSON.stringify({
  stand: "Standing, arms by the sides.", walk: "Walking cycle.", run: "Running cycle.", sit: "Seated cross-legged.",
  point: "One arm pointing.", vow: "Hand raised in a vow.", pray: "Palms together.", shout: "Hands cupped at the mouth.",
  armsUp: "Both arms raised.", shrug: "Shoulders and palms up.", fold: "Arms folded.", bless: "One hand raised in blessing.",
  present: "Arm presenting something.", hold: "Both hands holding an object.", belly: "Hands on the belly.",
  drink: "Hand raised to the mouth.", flex: "Arm flexed.", aim: "Drawing a bow.", shake: "Shaking something.",
  wave: "One hand waving.", talk: "Talking gesture.", sneak: "Sneaking cycle.", stir: "Stirring a pot.",
  offer: "Offering with an open hand.", dust: "Dusting off the hands.", chop: "Chopping with an axe.",
  carry: "Carrying an object.", throw: "Throwing.", hips: "Hands on the hips.", think: "Thinking hand at the chin.",
  grab: "Reaching to grab.",
})};
const exprs = ${JSON.stringify({
  neutral: "Deadpan.", stern: "Angry brows.", grin: "Open grin.", laugh: "Laugh with tongue.", whistle: "Whistling.",
  nervous: "Nervous, sweat drop.", shock: "Shock, wide eyes.", relief: "Relief, eyes closed smiling.", relief_open: "Relief with open grin.",
  dazed: "Dazed spiral eyes.", pained: "Pained teeth.", smile: "Small smile.", smile_closed: "Eyes closed smile.", lick: "Licking lips.",
})};
const props = ${JSON.stringify({
  bow: "Bow held in one hand.", bowDrawn: "Bow drawn with an arrow.", mace: "Mace.", spear: "Spear.", net: "Fishing net.",
  oar: "Boat oar.", laddu: "Sweet laddu.", garland: "Flower garland.", crown: "Hand-held crown.", jar: "Grey pot.",
  axe: "Axe.", torch: "Burning torch.", mango: "Mango.", ladle: "Cooking ladle.", scroll: "Rolled message.",
  bigbow: "The giant contest bow.",
})};
const lights = ${JSON.stringify({ day: "Daylight.", golden: "Golden-hour side/back light.", night: "Firelight key with moonlit shade.", deep: "Snake-kingdom deep light." })};
const defaults = ${JSON.stringify({
  sunBySet: { hermitage: { az: 115, el: 18 } },
  setPieces: { pages: { height: 0.3 } },
})};
export default {
  places: PLACES,
  sets: SET_NAMES.map((n) => e(n, setDesc[n])),
  cast: { C: Object.keys(C).map((n) => ({ ...e(n, "Cast spec C." + n), spec: C[n] })), KIDS: Object.keys(KIDS).map((n) => ({ ...e(n, "Kid cast spec KIDS." + n), spec: KIDS[n] })), KAURAVA: { name: "KAURAVA", status: "implemented", description: "Kaurava kid spec generator by index.", generator: true } },
  poses: POSES.map((n) => e(n, poses[n])),
  expressions: EXPRS.map((n) => e(n, exprs[n])),
  props: PROPS.map((n) => e(n, props[n])),
  specials: SPECIALS.map((n) => e(n, specials[n], plannedSpecial.has(n) ? "planned" : "implemented")),
  effects: Object.keys(effects).map((n) => e(n, effects[n], fStatus.has(n) ? "implemented" : "planned")),
  setPieces: Object.keys(pieces).map((n) => e(n, pieces[n], pStatus.has(n) ? "implemented" : "planned")),
  lights: LIGHTS_NAMES.map((n) => e(n, lights[n])),
  defaults,
};
`;

const bundle = join(dist, 'catalog-export.mjs');
mkdirSync(dist, { recursive: true });
try {
  await build({
    stdin: { contents: entry, resolveDir: src, loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'warning',
    external: ['three', 'three/*'],
  });
  const mod = await import(pathToFileURL(bundle).href);
  const catalog = mod.default;
  const runtimePath = join(root, 'schema', 'catalog.runtime.json');
  const previous = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
  if (existsSync(runtimePath)) {
    const runtime = JSON.parse(readFileSync(runtimePath, 'utf8'));
    for (const set of catalog.sets) {
      const info = runtime.sets?.[set.name];
      if (info) Object.assign(set, { front: info.front, bounds: info.bounds, marks: info.marks });
    }
    catalog.keepout = runtime.keepout ?? {};
    catalog.measure = runtime.measure ?? {};
  } else if (previous?.keepout) {
    for (const set of catalog.sets) {
      const old = previous.sets?.find((s) => s.name === set.name);
      if (old) Object.assign(set, { front: old.front, bounds: old.bounds, marks: old.marks });
    }
    catalog.keepout = previous.keepout;
    catalog.measure = previous.measure;
  }
  writeFileSync(out, JSON.stringify(catalog, null, 2) + '\n');
  console.log(`catalog: wrote ${out}`);
} finally {
  rmSync(bundle, { force: true });
}
