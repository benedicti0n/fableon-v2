// Where everything is (metres, y up). The river runs along x; the palace is on the north bank (+z), the fisher
// village, the hermitage, the forests and the new city on the south bank (-z). The snake kingdom is a separate set
// far away (it is "under" the river only in the story).
export type V3 = [number, number, number];
export const G = 1.5;            // bank height above the river bed reference
export const RIVER_Z = 18;       // water between z = -18 and 18 (sloping banks to +-22)
export const WATER_Y = 0.25;
export const PAL: V3 = [0, G, 42];        // palace courtyard centre (courtyard z 24..64)
export const VIL: V3 = [0, G, -34];       // fisher village centre
export const HERM: V3 = [-150, G, -70];   // Vyasa's hermitage (hut centre)
export const DEER: V3 = [150, G, -80];    // Pandu's clearing
export const LAC: V3 = [-160, G, 70];     // the lacquer house (Varanavata)
export const ARENA: V3 = [170, G, 70];    // Draupadi's contest (pole at the centre)
export const CITY: V3 = [40, G, -190];    // the clearing where Indraprastha rises
export const NAGA: V3 = [0, G, 600];      // the snake kingdom floor
