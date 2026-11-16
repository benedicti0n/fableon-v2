# Phase 2B — Port the remaining 29 shots, upgrade the contract, delete the legacy path

## Goal
At the end of this phase the whole Adi Parva film is described by fixtures/adi-parva/storyboard.json alone: every shot is non-legacy, story.ts is no longer used at runtime, the words timeline is no longer compiled into the engine, and QA no longer needs the fixture pop allowlist. The custom choreography of the prototype becomes GENERAL, reusable storyboard building blocks (motions, generators, effects, set pieces, specials) that a model will later be able to use for any story.

## Architect decisions on the Phase 2A open questions (apply them)
1. Specials not yet implemented: every catalog entry gets "status": "implemented" | "planned". The validator rejects planned entries with "not implemented yet". By the end of this phase all specials are implemented.
2. Time-based behaviour: add a shot-relative anchor { "shot": true, "offset": n } = the current shot's start frame + n frames. Use it instead of absolute { "frame": n } for anything that should move when the narration is re-voiced (e.g. the L1 palm-leaf stack ramp). Absolute frames stay allowed but should be rare.
3. Strict "f > A(...)" comparisons in story.ts are expressed as inclusive anchors with "offset": +1. Document this convention in STORYBOARD_SCHEMA.md.
4. Specials get TYPED params: the schema uses one params schema per special (oneOf keyed on "special"), additionalProperties false. Ganesha: write, writeSpeed (rename of writeRate), puzzled, down, look, pen, ear, expr. Others as they are implemented (agni, deer, naga, baby, pot, flat).
5. Defaults visible to models: set-level defaults (e.g. hermitage sun az 115 / el 18) and set-piece defaults (pages height 0.3) move into schema/catalog.json; the interpreter reads them from the catalog instead of hard-coding them.
6. Shot starts: every shot start becomes a word anchor again (the original K(line, word) = offset -2), except the first shot which stays { "frame": 0 }. A test asserts that each start resolves to exactly the same frame as before.
7. The fixture pop allowlist is removed (F10) and the legacy path is deleted (F11).

## Ground ruler this phase
- MOVE CODE, DO NOT REWRITE MATH. Every formula a ported shot uses must be the exact formula story.ts uses today (hashes hh(i, s), pop(), talk(), lidAt(), clamp/ease shapes, card keys, tiers, culling distances, fx canvas sizes). When a formula becomes a general building block, the building block must reproduce the legacy numbers exactly for the fixture's parameters.
- PARITY IS CUMULATIVE: from F2 on, every commit runs the parity test over ALL non-legacy shots ported so far (not only the new ones). Limit: MAD <= 0.5 (0-255 grayscale, full 540x960). The 9 reference stills and the audio tests stay green.
- Parity frames: keep the 2A rule (a, a+1, middle, b-1, every anchor frame inside the shot and the frame after it), but raise the cap to 16 frames for shots with crowds, falls, fires or jars (L18, L19, L20, L21, L25, L26, L35).
- GENERAL, NOT FIXTURE-NAMED: building blocks are named by what they do (path, ballistic, crowd, fire spots…), never by a character or a shot. The only story-specific things in the storyboard are its data values.
- Every feature that adds or changes a building block updates schema/storyboard.schema.json, schema/catalog.json (with a one-line description per entry for future models) and docs/STORYBOARD_SCHEMA.md in the same commit.
- Exact JSON field names are yours to choose, consistent with the existing contract. Prefer small, composable building blocks over many special cases.

## The building blocks to add (introduce each in the first feature that needs it)
Motion (any actor or effect can use them; each moving thing can have an "id" so Points and cameras can follow it):
- path: keys [[Anchor, Point], …] with ease (linear | smooth | glide | step), clamped before/after; optional walk phase { "rate": cycles per second, "offset": 0..1 } (walk/run/sneak legs); optional bob { "amp", "freq" } on y.
- ballistic: from an anchor, position = p0 + v·u + a·u² (u = seconds since the anchor), optional floorY (stop there), optional spin (radians per second). Covers falling kids, flying lids and the pigeon.
- screen-relative offsets in Point: "screen": [right, up, forward] metres along the CURRENT camera's axes (needed for effects placed relative to the camera, e.g. the sparkle on Arjuna's bowstring and the stars at the flat king's head).
- animated spec fields: an actor may animate numeric Spec fields (e.g. belly) with an Animated number.

Generators (expand into many actors deterministically, with the legacy hash hh(i, salt)):
- crowd: count, spec generator (e.g. kaurava), seedBase, layout (grid: origin Point, cols, dx, dz, rowShift, xStart; or explicit list of Points), "first" overrides (e.g. index 0 uses another spec), and per-member variation chosen by hash: pick { salt, below, a, b } and range { salt, min, span } for pose / expr / scale; facing; seated; noBlob.
Effects (unlit cards; keep each legacy canvas size and pool key including the time step):
- heart, emblem (wheel | wind | bolt | horse), puff, stars, arrow (from/to Points over an anchor window, or a motion), splash, bubbles (rising column: count, area, speed, size), burst, petals (the legacy petals() helper), fire (spots: explicit list of [dx,dy,dz,size] relative to a Point, or a world-derived source such as the city treetops — resolved lazily because the world is built after the storyboard loads), smoke (rising), pigeon (with a motion), mango, sweat, lump, halo with card kind glow | soft | fire (fire = fog-free tinted card).
Set pieces:
- pages (height Animated), boat (motion + roll), jars (grid count appearing over an anchor window, lid pops with ballistic lids flying away from the camera, and the "kids pop out of jars" behaviour as a parameterised part of this piece: pop window, hash salt, per-index overrides with their own anchors and specs, rise/sink heights, scale, cull distance), wheel (spin rate, stop at anchor), city (rise between anchors with glide), ladduPlate (visible, position, scale), nectar (pots disappearing over a drink window), bigBow (wobble at an anchor).
Specials (actors with "special"): agni (t-quantised flames, burp Animated, blink), deer (graze, expr, mirror, wide card), naga (col, king, sway), baby (wrap colour, skin), pot (the jarShape card), flat (a person drawn lying down: spec, expr, pose; wide card) — all with typed params, same card keys and tiers as the legacy code.

## Features (one commit each, in this order)

### F1  feat(schema): contract upgrades from the 2A review
Decisions 1-6: catalog status + validator rejection of planned entries; shot-relative anchors; offset +1 convention documented; typed Ganesha params (writeSpeed replaces writeRate); catalog defaults (hermitage sun, pages height) read by the interpreter; all shot starts back to word anchors with a test that every start resolves to the same frame as before; the L1 pages ramp rewritten with shot-relative anchors. Parity of the 10 shots stays 0.000.

### F2  feat(storyboard): motion building blocks
path (+ walk phase, bob), ballistic, moving-target ids followable by Points and camera keys, screen-relative Point offsets, animated spec fields. Add unit tests for the motion math (no shot ported yet in this commit).

### F3  feat(fixture): port the hermitage shots
The opening hook (frame 0: Ganesha writing, Vyasa talking, pages ramp from 0.05), L3 (knotty verse: puzzled Ganesha, knot effect with bob, Vyasa drinks), L33c (Ganesha's deal: sweat drops, pages 1.3), L36 (grandfather: Ganesha shock, pen dropped, END-anchored last key, pages 1.4).

### F4  feat(fixture): port the river, flowers, crane and short montage shots
L4 (boat set piece with motion and roll, Satyavati riding it, camera key following the boat, heart effect), L9 (petals), L11 (old Bhishma, fixed crane key with dur 40 and its DOF ramp), L33 (Bhishma's vow CU), the L33 Kunti shot.

### F5  feat(fixture): port the deer and the gods
L13 (deer special with graze/shock, the swap to the sage at "secretly" with the puff, arrow flight, stars, Pandu aiming mirrored, Kunti appearing at the last cut), L15 (three emblems then two horse emblems with pop and bob, babies popping in).

### F6  feat(fixture): port the jars, the crowd and the tree
L17 (Gandhari's belly animated, lump effect, laddu plate), L18 + L19 (jars set piece: grid appearing, lid pops, 101 kids popping out with the legacy hash timing, Duryodhana first, the sister on "one", cull distance), L20 (5 Pandava kids + 100-member crowd generator), L21 (Bhima shaking, kids in the tree falling with ballistic motion and landing, mangos falling).

### F7  feat(fixture): port the river poisoning, the snake kingdom and the lacquer house
L22 (offer → dust beat, Bhima visible until "throws", splash), L23 (Bhima sinking via path, drink/flex beats, nagas with sway, bubbles, burst, nectar pots), L24 (walk-in paths with walk phase, lamp halos), L25 (worker rising from the tunnel, Bhima's torch throw, fire spots on the house, fire halo, smoke, the sneak-off paths).

### F8  feat(fixture): port the contest
L26 (Draupadi with garland, seated kings as a crowd, king at the bow, brothers walking across with paths, wheel spinning, tilt camera up the pole), L27 (king shaking, flat special with stars at his head via screen offset, seated kings' reactions, bow wobble), L28 (Arjuna aiming mirrored, sparkle on the string via screen offset, arrow flying up, burst, arrow stuck, wheel stopping on "mark").

### F9  feat(fixture): port the homecoming, the city and the fire god
L29 (running paths, shout), L30 (Kunti stirring, pot special), L31 (Kunti's shock with the pot, then the row of six with petals), L32 (pigeon with ballistic motion, camera key looking at the pigeon, Kunti's beats), L34 (row of seven, dust, city rise), L35 (treetop fires from the world-derived source, fire halo, Agni special with burp).
After F9 the fixture has zero legacy shots.

### F10  feat(qa): planned events from the storyboard
The engine exports planned events for QA: camera cuts (as today) plus "intended jumps" — any frame where a beat swaps a special or the actor drawn, an actor appears/disappears, or a beat is explicitly marked "jump": true. The CLI writes them to events.json; QA subtracts them (±1 frame) and the hard-coded fixture allowlist (1249, 2152, 2715) is deleted. The preview run must report 0 unexplained pops without any allowlist.

### F11  refactor(engine): delete the legacy path
FIRST, while legacy still exists: render one golden frame per shot (its middle frame) in legacy mode at 270x480, save them as fixtures/adi-parva/golden/shot_XX.jpg (JPEG quality 92; small files), and make a test that compares the storyboard render of those frames against them (MAD <= 1.0). THEN delete: story.ts at runtime (keep nothing that imports it), the "legacy" field in the schema, the hybrid lookup, the compiled-in words.json, and the CLI "legacy words" gate. The engine now renders any project from its own storyboard.json + words.json. The parity test against legacy is replaced by the golden-frame test.

### F12  test: full-film acceptance on the storyboard-only engine
Run `fableon all --project work/adi --quality preview --workers 2` and `fableon all --project work/adi-final --quality final --workers 2` from a fresh `fableon init`. Both must pass QA with 0 unexplained pops and no allowlist. Add the times to docs/BENCHMARKS.md.

### F13  docs(report): phase 2B report
docs/reports/phase-2b.md per docs/REPORT_TEMPLATE.md, including: the cumulative parity table per shot (frames and max MAD) from F9, the golden-frame table from F11, QA summaries of both runs, the final list of building blocks (with one line each), the size of storyboard.json, and everything that was awkward to express (this list drives Phase 2C).

## Acceptance (paste the evidence in the report)
1. Before F11: parity over all 39 shots, every frame MAD <= 0.5.
2. After F11: golden-frame test (39 frames, MAD <= 1.0), 9 reference stills, audio tests, validator tests all pass in npm test.
3. `fableon validate` passes; the storyboard has no "legacy" field anywhere; story.ts is not imported by the engine.
4. Preview and final films: 3639 frames, 121.300 s, QA PASS, 0 unexplained pops, no allowlist in the code.
5. `git log --oneline` shows the Step 0 docs commit followed by F1-F13 in order.

## Out of scope
Semantic cameras / framing solver / in-frame validator (Phase 2C), any AI/LLM calls, server, frontend, new looks or new sets. If a shot cannot be ported with parity after two honest attempts, leave it legacy, carry on with the others, and explain exactly why in the report (F11 then waits for that shot).
