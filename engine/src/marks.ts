// Semantic set metadata: the named marks the authoring compiler places actors on, the set's default viewing
// direction (`front`, degrees, 0 = +z) and its establishing box (`bounds`, world metres).
import { ARENA, CITY, DEER, G, HERM, LAC, NAGA, PAL, VIL } from "./places";

export type Mark = { name: string; pos: [number, number, number]; facing: number; description: string; view?: number; context?: string };
export type SetInfo = { front: number; bounds: { min: [number, number, number]; max: [number, number, number] }; marks: Mark[] };

const at = (p: readonly [number, number, number], d: [number, number, number]): [number, number, number] => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
const m = (name: string, pos: [number, number, number], facing: number, description: string): Mark => ({ name, pos, facing, description });

const MARK_VIEWS: Record<string, number> = {
  "palace.courtyard": 177,
  "palace.cy": 177,
  "palace.ghat": 172,
  "palace.jars": 29,
  "palace.mango": 178,
  "palace.tree": 178,
  "palace.plate": 5,
  "palace.boat": 180,
  "village.front": -4,
  "village.hut": 2,
  "village.hutDoor": 2,
  "village.door": 80,
  "village.boats": 180,
  "village.palms": 180,
  "hermitage.mat": 138,
  "hermitage.desk": -148,
  "hermitage.hut": 154,
  "hermitage.banyan": 180,
  "hermitage.clearing": 180,
  "deer.clearing": 175,
  "deer.pandu": 173,
  "deer.deer": -9,
  "deer.kunti": 160,
  "deer.sage": -9,
  "lac.door": 180,
  "lac.hall": 172,
  "lac.tunnel": -174,
  "lac.stage": -2,
  "lac.house": -2,
  "arena.dais": 170,
  "arena.bow": 166,
  "arena.bowstand": 166,
  "arena.pole": 166,
  "arena.target": 172,
  "arena.seats": 180,
  "arena.kingsLeft": 180,
  "arena.kingsRight": 180,
  "arena.floor": 180,
  "city.clearing": 176,
  "city.agni": 0,
  "city.stumps": 177,
  "city.forest": 180,
  "city.palace": 9,
  "naga.floor": 176,
  "naga.court": 176,
  "naga.throne": 180
};

export const SET_INFO: Record<string, SetInfo> = {
  palace: {
    front: 180,
    bounds: { min: [-32, G - 0.4, 20], max: [32, 26, 84] },
    marks: [
      m("courtyard", at(PAL, [0, 0.12, 0]), 180, "Centre of the palace courtyard."),
      m("cy", at(PAL, [0, 0.12, 0]), 180, "Palace courtyard stage point used by the fixture."),
      m("ghat", [0, 1.62, 24.6], 180, "Top of the ghat steps down to the river."),
      m("jars", at(PAL, [-7.2, 0.12, 9]), 180, "Origin of the 101-jar grid in the arcade."),
      m("mango", at(PAL, [-14, 0.12, 4]), 180, "The mango tree in the courtyard."),
      m("tree", at(PAL, [-14, 0.12, 4]), 180, "The mango tree in the courtyard."),
      m("plate", at(PAL, [0, 0.12, 4.2]), 180, "The plate of sweets by the river."),
      m("boat", [3.2, 0.25, 9.5], 180, "The boat mooring on the palace river bank."),
    ],
  },
  village: {
    front: 180,
    bounds: { min: [-45, 0, -65], max: [45, 14, 0] },
    marks: [
      m("front", at(VIL, [0, 0, 9.5]), 180, "Village front on the sand, facing the river."),
      m("hut", at(VIL, [1, 0, -6.4]), 180, "Kunti's hut doorway."),
      m("hutDoor", at(VIL, [1, 0, -6.4]), 180, "Kunti's hut doorway."),
      m("door", at(VIL, [1, 0, -3.2]), 180, "Standing spot outside Kunti's hut."),
      m("boats", at(VIL, [-7, 0, 14]), 180, "The boats pulled up on the sand."),
      m("palms", at(VIL, [6, 0, -1]), 180, "Palm cluster at the village centre."),
    ],
  },
  hermitage: {
    front: 180,
    bounds: { min: [-175, 0, -100], max: [-125, 16, -45] },
    marks: [
      m("mat", at(HERM, [-1.15, 0.33, -0.25]), 180, "Vyasa's reed mat under the open hut."),
      m("desk", at(HERM, [0.75, 0.33, 0.15]), 180, "Ganesha's writing desk and palm leaves."),
      m("hut", at(HERM, [0, 0, 0]), 180, "Centre of the open hermitage hut."),
      m("banyan", at(HERM, [-5, 0, 6]), 180, "The banyan tree beside the hut."),
      m("clearing", at(HERM, [0, 0, 10]), 180, "Open forest clearing in front of the hut."),
    ],
  },
  deer: {
    front: 0,
    bounds: { min: [120, 0, -120], max: [185, 18, -45] },
    marks: [
      m("clearing", at(DEER, [0, 0, 0]), 0, "Centre of Pandu's forest clearing."),
      m("pandu", at(DEER, [-2.4, 0, 3.5]), 0, "Pandu's aiming spot at the clearing edge."),
      m("deer", at(DEER, [2.2, 0, -4.5]), 0, "The stag's grazing mark."),
      m("kunti", at(DEER, [-3.4, 0, 4.4]), 0, "Kunti waiting behind Pandu."),
      m("sage", at(DEER, [2.2, 0, -4.5]), 0, "The sage at the deer mark after the transformation."),
    ],
  },
  lac: {
    front: 180,
    bounds: { min: [-175, 0, 55], max: [-145, 12, 95] },
    marks: [
      m("door", at(LAC, [0, 0, -4.6]), 180, "The lacquer house door."),
      m("hall", at(LAC, [-3.2, 0, -7.5]), 180, "The dark hall inside the house."),
      m("tunnel", at(LAC, [3, 0, -13]), 180, "The escape tunnel mouth behind the house."),
      m("stage", at(LAC, [0, 0, 0]), 180, "The centre of the lacquer house."),
      m("house", at(LAC, [0, 0, 0]), 180, "The lacquer house building."),
    ],
  },
  arena: {
    front: 180,
    bounds: { min: [140, 0, 45], max: [205, 20, 100] },
    marks: [
      m("dais", at(ARENA, [0, 1, 11]), 180, "Draupadi's dais at the back of the arena."),
      m("bow", at(ARENA, [-6, 0.15, -4]), 180, "The giant bow on its stand."),
      m("bowstand", at(ARENA, [-6, 0.9, -4]), 180, "The giant bow and its stand."),
      m("pole", at(ARENA, [0, 0, 0]), 180, "The target pole at the arena centre."),
      m("target", at(ARENA, [0, 17.4, 0]), 180, "The target at the top of the contest pole."),
      m("seats", at(ARENA, [-21, 0.6, 0]), 180, "The kings' stepped seats under the side canopy."),
      m("kingsLeft", at(ARENA, [-21, 0.6, 0]), 180, "Left bank of seated kings."),
      m("kingsRight", at(ARENA, [21, 0.6, 0]), 180, "Right bank of seated kings."),
      m("floor", at(ARENA, [0, 0.15, -4]), 180, "Open arena floor between the bow and the pole."),
    ],
  },
  city: {
    front: 180,
    bounds: { min: [0, 0, -260], max: [85, 25, -125] },
    marks: [
      m("clearing", at(CITY, [0, 0, -8]), 180, "The clearing where the city rises."),
      m("agni", at(CITY, [0, 0, 8]), 180, "Agni's mark in front of the rising city."),
      m("stumps", at(CITY, [0, 0, -6]), 180, "The felled stumps in the clearing."),
      m("forest", at(CITY, [0, 0, -30]), 180, "The edge of the Khandava forest."),
      m("palace", at(CITY, [0, 0, 6]), 180, "The rising palace of Indraprastha."),
    ],
  },
  naga: {
    front: 180,
    bounds: { min: [-50, 0, 550], max: [50, 12, 650] },
    marks: [
      m("floor", at(NAGA, [0, 0.4, 4]), 180, "The naga court floor."),
      m("court", at(NAGA, [0, 0.4, 4]), 180, "The ring of pale pillars in the naga palace."),
      m("throne", at(NAGA, [0, 0.4, 10]), 180, "The naga king's end of the court."),
    ],
  },
};

// The first derivation (median camera heading near the mark) put two cameras behind the burning set.
const MARK_VIEW_OVERRIDES: Record<string, number> = { "city.agni": 172, "lac.house": 180 };
for (const [set, info] of Object.entries(SET_INFO)) for (const mark of info.marks) mark.view = MARK_VIEW_OVERRIDES[`${set}.${mark.name}`] ?? MARK_VIEWS[`${set}.${mark.name}`] ?? mark.facing;
for (const [set, info] of Object.entries(SET_INFO)) for (const mark of info.marks) {
  if (set === 'palace' && (mark.name === 'tree' || mark.name === 'mango')) mark.context = 'world:palace.mango canopy';
}
