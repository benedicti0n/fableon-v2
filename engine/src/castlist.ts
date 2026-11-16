// The cast: [name, Spec, default Opts]. Our own designs (story facts from the Adi Parva; looks are ours).
import { Spec, Opts, SKINS, GOLD } from "./people";
type Entry = [string, Spec, Opts];
const W = "#f6efdc";
export const C: Record<string, Spec> = {
  vyasa: { skin: SKINS.dark, build: "elder", top: null, lower: "#e8a33a", drape: "#d9772b", head: "bun", hairCol: "#eeeae4", beard: "#eeeae4", beardLong: true, necklace: "#7a4b2a", tilak: "#f4f1ea" },
  shantanu: { skin: SKINS.wheat, build: "stout", top: null, lower: "#f2e6c4", border: GOLD, drape: "#3f5fb5", head: "crown", moustache: "#3a2418", necklace: GOLD, earrings: GOLD },
  satyavati: { skin: SKINS.brown, build: "slim", top: "#e0565a", sari: "#2f8a8a", border: "#f2c230", head: "long", hairCol: "#1e1418", flower: "#fff2c8", earrings: GOLD },
  fisher: { skin: SKINS.tan, build: "stout", top: null, lower: "#e9e2cf", head: "turban", turbanCol: "#d8402e", moustache: "#eeeae4", beard: null },
  devavrata: { skin: SKINS.light, build: "adult", top: null, lower: "#f2e6c4", border: GOLD, drape: "#c8342e", head: "crownSmall", hairCol: "#2a1a1e", necklace: GOLD, earrings: GOLD },
  bhishmaOld: { skin: SKINS.light, build: "elder", top: null, lower: "#f6f2e8", border: GOLD, drape: "#c8342e", head: "crownSmall", hairCol: "#f2f0ea", beard: "#f2f0ea", beardLong: true, necklace: GOLD },
  dhritarashtra: { skin: SKINS.wheat, build: "stout", top: null, lower: "#f2e6c4", border: GOLD, drape: "#7a3f9a", head: "crown", blind: true, moustache: "#2a1a1e", necklace: GOLD },
  pandu: { skin: SKINS.fair, build: "adult", top: null, lower: "#f2e6c4", border: GOLD, drape: "#2f8a5a", head: "crown", moustache: "#3a2418", necklace: GOLD },
  kunti: { skin: SKINS.wheat, build: "slim", top: "#c8342e", sari: "#6a4fb5", border: GOLD, head: "long", hairCol: "#1e1418", earrings: GOLD, necklace: GOLD },
  madri: { skin: SKINS.light, build: "slim", top: "#f2c230", sari: "#3f9a6a", border: GOLD, head: "long", hairCol: "#1e1418", earrings: GOLD },
  gandhari: { skin: SKINS.light, build: "slim", top: "#f2c230", sari: "#b5344a", border: GOLD, head: "long", hairCol: "#1e1418", blindfold: "#f6efdc", earrings: GOLD, belly: 0 },
  // the Pandavas as kids and as young men (the colours stay with each brother)
  yudhi: { skin: SKINS.wheat, build: "adult", top: null, lower: W, border: GOLD, drape: "#e8b53a", head: "hair", hairCol: "#2a1a1e", necklace: GOLD },
  bhima: { skin: SKINS.tan, build: "big", top: null, lower: W, border: GOLD, drape: "#c8342e", head: "hair", hairCol: "#2a1a1e", moustache: "#2a1a1e" },
  arjuna: { skin: SKINS.brown, build: "adult", top: null, lower: W, border: GOLD, drape: "#3f6fb5", head: "hair", hairCol: "#2a1a1e" },
  nakula: { skin: SKINS.light, build: "slim", top: null, lower: W, border: GOLD, drape: "#2f8a5a", head: "hair", hairCol: "#2a1a1e" },
  sahadeva: { skin: SKINS.light, build: "slim", top: null, lower: W, border: GOLD, drape: "#e07a2e", head: "hair", hairCol: "#2a1a1e" },
  duryodhana: { skin: SKINS.wheat, build: "stout", top: null, lower: "#f2e6c4", border: GOLD, drape: "#7a3f9a", head: "crownSmall", moustache: "#2a1a1e", necklace: GOLD },
  draupadi: { skin: SKINS.brown, build: "slim", top: "#f2c230", sari: "#d8343c", border: GOLD, head: "long", hairCol: "#1e1418", flower: "#fff2c8", earrings: GOLD, necklace: GOLD },
  king1: { skin: SKINS.wheat, build: "stout", top: null, lower: "#f2e6c4", border: GOLD, drape: "#2f6fb5", head: "turban", turbanCol: "#f2c230", moustache: "#2a1a1e", necklace: GOLD },
  king2: { skin: SKINS.light, build: "adult", top: null, lower: "#f2e6c4", border: GOLD, drape: "#2f8a5a", head: "crown", moustache: "#3a2418", necklace: GOLD },
  sage: { skin: SKINS.tan, build: "elder", top: null, lower: "#e8a33a", head: "bun", hairCol: "#6a6a72", beard: "#8a8a92", beardLong: false, tilak: "#f4f1ea" },
  priest: { skin: SKINS.brown, build: "adult", top: null, lower: W, drape: "#f2deb0", head: "topknot", hairCol: "#2a1a1e" },
};
const kid = (s: Spec): Spec => ({ ...s, build: "kid", moustache: null, beard: null, necklace: null, head: s.head === "crownSmall" || s.head === "crown" ? "hair" : s.head });
export const KIDS = {
  yudhi: kid(C.yudhi), bhima: { ...kid(C.bhima), build: "kid" as const }, arjuna: kid(C.arjuna), nakula: kid(C.nakula), sahadeva: kid(C.sahadeva),
  duryodhana: kid(C.duryodhana), duhshala: { skin: SKINS.wheat, build: "kid" as const, top: "#f2c230", sari: "#7a3f9a", border: GOLD, head: "long" as const, hairCol: "#1e1418" },
};
export const KAURAVA = (i: number): Spec => {
  const drapes = ["#7a3f9a", "#5a3f8a", "#8a3f6a", "#6a4f9a", "#4a3f7a"], skins = [SKINS.wheat, SKINS.tan, SKINS.light, SKINS.wheat];
  return { skin: skins[i % 4], build: "kid", top: null, lower: "#f2e6c4", drape: drapes[i % 5], head: "hair", hairCol: "#2a1a1e" };
};
export const CAST: Entry[] = [
  ...Object.entries(C).map(([n, s]) => [n, s, { pose: "stand" }] as Entry),
  ["kid bhima", KIDS.bhima, { pose: "shake", t: 0.3, expr: "grin" }],
  ["kid duryo", KIDS.duryodhana, { pose: "offer", prop: "laddu", expr: "smile", facing: 1 }],
  ["duhshala", KIDS.duhshala, { pose: "armsUp", expr: "grin" }],
  ["arjuna aim", C.arjuna, { pose: "aim", prop: "bowDrawn", facing: -1, expr: "stern" }],
  ["kunti pray", C.kunti, { pose: "pray", expr: "smile_closed" }],
  ["devavrata vow", C.devavrata, { pose: "vow", expr: "stern" }],
  ["gandhari preg", { ...C.gandhari, belly: 1 }, { pose: "belly", expr: "nervous" }],
  ["king flat", C.king1, { pose: "armsUp", expr: "dazed" }],
  ["bhima flex", C.bhima, { pose: "flex", expr: "grin", prop: null }],
  ["sit vyasa", C.vyasa, { pose: "sit", expr: "smile" }],
];
