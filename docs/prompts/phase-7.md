# Phase 7 — Catalog growth: the rest of the Mahabharata

## User decisions
- The daily shorts will cover the rest of the Mahabharata (Sabha Parva → Svargarohana Parva) over the next months. Build the catalog for those stories first; other story worlds come later.
- Phase 7 opens with the deferred Phase 6 checkpoint 2: one real daily short through the queue on the existing sets.
- Data decides the build order: a census of the planned episodes against the catalog. The user approves the build list.
- Kurukshetra (battlefield, armies, formations such as the chakravyuwar camp, night battle) is Phase 8, the heaviest set. Phase 7 builds the kit it will need (armour, conches, horses, the chariot, mounts) and the most-used non-war sets.
- House style unchanged:
  - flat 2D cartoon cards with ink outlines in a painted 3D toon world;
  - characters flat-lit and never glowed;
  - no captions;
  - Hindi narration with the Sarvam voice.

## Ground rules
- npm test green before every commit (golden <= 1.0, Adi audio unchanged). New regression test: 3 final-quality stills each from fixtures/savitri-hi and fixtures/bakasura-hi, max diff <= 1.0, proving the two 9/10 films are unchanged by every engine change.
- Every catalog addition is optional and additive: existing specs, boards and storyboards render identically.
- Respectful iconography: deities, sages and heroes follow tradition (see the presets in F4 and docs/CONTENT_GUIDE.md). The deadpan humour targets situations, never a deity or a faith.
- Sensitive scenes follow the content guide: implied, never graphic; no blood, gore or nudity; for Draupadi in the assembly the miracle is shown, not the assault.
- Performance on the 8 GB M1:
  - sets load lazily (only the sets a board uses);
  - every new set stays within a per-set budget measured from the existing eight (triangles, draw calls, texture MB, render s/frame at 1440×2560).
- Licences:
  - everything is drawn or modelled in code: no downloaded models, textures or sound samples;
  - source text only from the public-domain K. M. Ganguli translation.
- Keys, privacy, estimates before paid work, approvals and locks as in Phase 6.

## Features (one commit each, in this order)

### F1  fix: phase 6 gaps
- Publish fact pass: a real call on the factcheck routing; keep the token-overlap check as a fast pre-filter. Unsupported claims block as before.
- Hashtags:
  - Hindi projects include at least 2 Devanagari hashtags (e.g. #महाभारत #भीम).
  - The app's name is never a hashtag unless it is the channel name in the channel profile (#fableon appeared in the Bakasura package).
- madeForKids and alteredContent always carry a real reason ("None" was accepted).
- Finish → Look: HAZE shows 0.00 where its neutral value is 1.00 (×). Unset controls show their neutral values, and saving an untouched card writes nothing for it. Test it.
- Projects: films with a final show "No cover yet". Fallback order: publish/cover.jpg → a steady frame grabbed from final.mp4 → a board still → an animatic frame → placeholder.
- Ambience: the mix block's ambienceDb is stored but unused.
  - Add an optional ambience bed per music section: music[].ambience is one of a small synthesized set (birds, wind, village, water, night-insects, fire, court-murmur).
  - Add an ambience lane in Finish → Sound, and honour ambienceDb.
  - Absent fields keep today's mix byte-identical.
- Queue hard stops: dedicated tests for QA failure, fact flags, DISK_LOW, provider exhaustion after fallbacks, and the 100 % budget pause.
- `fableon studio`: one command that rebuilds web/dist when stale, serves, and opens the browser.
- work/the-house-of-lac and work/the-house-of-lac-2 exist. If they are test leftovers, tag them as test; if the user started one, keep it for checkpoint A.

### USER CHECKPOINT A (after F1) — a real daily short (the deferred Phase 6 checkpoint 2)
Ask the user for the topic. Suggest: the house of lac (lac set), Bhima in the Naga realm (naga), Karna at the tournament (arena). Put its Ganguli section in library/ (download only with the user's OK).
Run `daily-short-hi` from the queue: script gate → animatic gate → publish. Record per stage: wall time, machine minutes, spend vs estimate. Also record the export folder and export-qa. Fix small issues (fix commits); list the rest.

### F2  feat(catalog): episode census
- Source library: the Ganguli translation of Sabha → Svargarohana in library/ganguli/, as plain text per section.
  - Prefer Project Gutenberg's plain-text volumes if available. Otherwise use sacred-texts.com politely: <= 1 request/second, cached, generic user agent, no personal data.
  - Ask the user before downloading.
  - Record sources and licence in library/SOURCES.md.
- docs/catalog/episodes.json, built from the starting list below:
  - map each episode to its Ganguli sections by searching the text;
  - split long episodes into 2–3 shorts;
  - add missing well-known episodes, marked `added`;
  - record popular details that are absent from Ganguli in `notInSource` (the script must not use them).
  The starting list:
  - Sabha: Maya builds the assembly hall; Bhima and Jarasandha; Shishupala's hundred insults; Duryodhana in the hall of illusions; the dice game; Draupadi in the assembly; Bhima's vows; the second game and the exile.
  - Vana: the akshaya patra and Durvasa's visit; Arjuna and the Kirata; Arjuna in Indra's heaven; Bhima meets Hanuman; the Saugandhika lotus; Nahusha the python; Jayadratha's abduction of Draupadi; Karna gives away his armour; the Yaksha's questions; Nala and Damayanti.
  - Virata: the weapons in the shami tree; Bhima the cook and the wrestler Jimuta; Kichaka; Brihannala, Uttara and the cattle raid.
  - Udyoga: Arjuna and Duryodhana at Krishna's bedside; Shalya won over by hospitality; Amba's vow; Krishna's peace mission and the cosmic form; Kunti and Karna; Krishna's offer to Karna.
  - Bhishma: the conches; the Gita and the cosmic form; Yudhishthira asks the elders' blessings; Krishna takes up the wheel; Bhishma's fall and the bed of arrows.
  - Drona: Abhimanyu in the chakravyuha; Jayadratha and the false sunset; Ghatotkacha's night and Karna's spear; "Ashwatthama is dead".
  - Karna: Bhima and Dushasana; Karna's wheel.
  - Shalya: Duryodhana in the lake; the mace duel.
  - Sauptika: the owl and the crows, the night raid; Ashwatthama's gem.
  - Stri: Dhritarashtra and the iron Bhima; Gandhari's curse.
  - Shanti/Anushasana: Bhishma's teachings from the bed of arrows.
  - Ashvamedhika: Arjuna and Babruvahana; the half-golden mongoose.
  - Ashramavasika: the elders' last forest.
  - Mausala: Samba and the iron pestle; the end of the Yadavas; Krishna and the hunter Jara; Dwarka and the sea.
  - Mahaprasthanika: the great journey and the dog.
  - Svargarohana: Yudhishthira's last test.
  - Stageable now (mark `adi`): Janamejaya's snake sacrifice; Bhima in the Naga realm; the birth of the Kauravas; Drona and the ball in the well; the bird's eye test; Ekalavya; Karna at the tournament; the house of lac; Hidimba; Draupadi's swayamvara; Arjuna and Ulupi; Arjuna and Subhadra; the Khandava forest fire; Parikshit and Takshaka; Shakuntala and Dushyanta.
- New op `inventory` {episodes}: model op routed to deepseek-flash, output validated by schema/inventory.schema.json; estimate first; cached; logged in the ledger.
  - Input: each episode's section text, <= 30k tokens (longer sections summarised first).
  - Output:
    - places with time of day;
    - characters: kind (human|divine|demon|sage|animal|hybrid), traits as Spec-like fields, mustHave iconography;
    - animals, vehicles, props, actions, effects, crowd size, sounds;
    - sensitive moments with a suggested treatment.
- Deterministic matcher against schema/catalog.json and the engine Spec fields, with a synonyms file. Each need is have | spec (buildable from Spec fields) | standIn | missing.
- Coverage: an episode is stageable when every place, every speaking or mustShow character, and every mustShow prop, animal or vehicle is have, spec or an acceptable stand-in.
- Build list: greedy, ranking items by episodes unlocked per effort point (set 8, vehicle 5, special/animal 3, pose/prop/effect/Spec field 1).
- docs/catalog/census.md:
  - the episode table: stageable now? missing items;
  - a matrix summary;
  - the proposed build list with the episodes each item unlocks;
  - the expected Phase 7 list below, confirmed or corrected.
- Studio: a read-only Catalog screen.
  - Sets with look-dev thumbnails; contact sheets of characters, specials, props and poses (a `catalog-sheets` local op, cached).
  - The census with a "stageable now" filter. Each stageable episode has "New from preset", prefilled with the topic and its library sections.
- Expected outcome to confirm or correct:
  - the kit (F4–F5);
  - the royal assembly hall (the dice game, Virata's court, the peace mission, Dhritarashtra and Sanjaya);
  - the Himalayan mountainside (the Kirata, Hanuman, the Saugandhika lotus, the great journey);
  - the forest lake (the Yaksha, Duryodhana in the lake, the lotus lake);
  - runner-up: the Dwarka coast;
  - Kurukshetra → Phase 8.

### USER CHECKPOINT B (after F2)
Show census.md and the Catalog screen. The user approves the episode list, the treatments of sensitive moments, and the build list. Build only what they approve.

### F3  feat(engine): set modules, lazy loading and the catalog guide
- One module per set (engine/src/sets/<name>.ts) on kit/paint/ink. Move the eight existing sets unchanged; golden and fixture stills stay identical.
- A registry with each set's metadata: place, bounds, marks, keepout, sun defaults, ambience default, budget. Build only the sets the board or storyboard uses.
- Per-set budget, measured from the existing eight: max triangles, draw calls, texture MB, render s/frame at 1440×2560 on this M1. `fableon catalog check` enforces it and checks:
  - marks reachable by the solver;
  - keepout sanity;
  - every mark framable at close, medium and wide.
- Interior sets: map the five moods to interior light (window shafts by day, warm lamps with cool windows at night) through the existing world-only look rig.
- Prompt cards: a one-line index of every set, special, prop and pose, plus full cards only for the project's candidate sets (chosen at the cast stage). Prompt sizes stay within today's budgets (DIRECTOR_GUIDE <= 8 KB, craft <= 3 KB).
- docs/CATALOG_GUIDE.md:
  - how to add a set, a Spec field, a pose, a prop, a special, an effect or a sound;
  - the checks each must pass and the review sheet;
  - the readability lessons from docs/LESSONS.md (desaturated albedos; flat chajja, not bread-roll hoods; shikhara or pavilion roofs, never onion domes; …).
- docs/CONTENT_GUIDE.md: iconography rules and treatments for sensitive scenes:
  - the assembly: reactions, Draupadi's prayer, the endless glowing cloth; the pulling is never shown;
  - Kichaka: shadows, a thud, the aftermath;
  - the Dushasana vow: off-screen, with reactions;
  - deaths: fallen pose, arrows as effect lines, no wounds;
  - the Yadava ending: grass, pestle and dust.

### F4  feat(cast): character kit
- New optional Spec fields (people.ts + cast.schema), all drawn in the ink style:
  - armour: breastplate colour, with a golden `kavacha` variant for Karna;
  - quiver;
  - head types: helmet, jata (matted locks with a topknot: sages, Shiva), loose (unbound long hair: Draupadi after the vow), featherCrown (crown with a peacock feather: Krishna);
  - gem (forehead: Ashwatthama), snake (around the neck: Shiva), crescent;
  - armlets/bangles, ash marks;
  - lowerPattern: plain | tiger | bark.
- Poses, with measures: kneel, pranam (bow to touch feet), lie, fallen, sleep, strike (two-hand swing), guard, blowConch, drive (seated with reins), ride, dance, weep, lift.
- Expressions: angry, sad, smirk, determined, sleepy.
- Props: conch, flute, chakra, sword, shield, dice, trident, lotus, bowl (akshaya patra), pestle, plough, umbrella (chhatra), chamara, banner with emblem (hanuman | snake | palm | …).
- Iconography presets in schema/catalog.json `iconography`, each a Spec + mustHave; the cast stage prefers them. Krishna (dark-blue skin, featherCrown, yellow dhoti, flute), Balarama, Shiva, Shiva as Kirata, Indra, Surya, Drona, Karna (kavacha and earrings), Shakuni, Ashwatthama, Dhritarashtra, Gandhari, Vidura, Sanjaya, Bhishma (old).
- Review sheet: every new field on 3 skins × 3 builds, and all presets in a row. Commit it to docs/reports/phase-7/kit-sheet.jpg and STOP for the user's review before F5.

### F5  feat(cast): animals, vehicles and mounts
- Specials: hand-drawn cards with walk/run cycles where they move, measures and framing boxes. Horse, elephant, cow (+ calf), dog, monkey (with a Hanuman preset: old, long tail, mace), crane, boar, mongoose (half-golden variant), swan, owl, crow, python.
- Chariot:
  - a card composite: body, spinning wheels, 2 or 4 horses with a gallop phase, a banner with an emblem;
  - seats for a charioteer (pose drive) and a warrior;
  - wheel spin follows the motion path;
  - a `wheelStuck` variant (Karna).
- Mounts: any character can ride or drive a horse, elephant or chariot at a seat offset. The framing solver treats the mount and its riders as one subject; the validator checks seats and sizes.
- Effects (world-only light where they glow):
  - chakra spin, conch rings, divine light for the cosmic form;
  - the endless cloth: unrolling glowing cloth that never shows the body.
- Tests: measures, solver framing of mounted subjects, golden and fixture stills unchanged. Add a review sheet with the F4 sheet.

### F6–F8  feat(set): the approved sets, one commit each
Each set includes:
- the module, named marks, keepout, bounds, sun defaults per light, and an ambience default;
- at least one set piece (e.g. dice board and throne, the lotus pond);
- a look-dev sheet: 5 moods × 3 framings;
- `catalog check` within budget, and the prompt card;
- a 10-second hand-authored test board that uses the new kit (and mounts where relevant), rendered as an animatic plus 3 final-quality stills.
STOP after each set's look-dev sheet and stills. The user approves or gives notes (they may get a second opinion); apply the notes before the next set.
Expected sets (confirm at checkpoint B):
- sabha: a royal assembly hall interior: pillared hall, raised throne dais, side galleries, dice board and cushions at the centre, high windows with light shafts, hanging lamps. Variants by banner and colour for Hastinapura, Virata and Indraprastha (the hall of illusions with its reflective pool floor).
- mountain: Himalayan slopes: snow peaks, rocky ledges, pines, a banana grove, a narrow path (Hanuman's tail), a cave mouth.
- lake: a forest lake: lotus pond, reeds, a shore clearing, a stone ghat, a cheap water reflection (painted or a low-res mirrored pass, within budget).

### F9  feat(sound): sounds for the new world
- New synthesized SFX kinds (no samples): conch, hooves (walk/gallop), clash (metal), creak (chariot), trumpet (elephant), crowd-murmur, wind-gust.
- New instrument: nagara (kettle drum).
- No-repeat rule: consecutive effects of the same kind get different seeds automatically.
- The cue schema stays additive; previews in Finish; Adi and fixture audio byte-identical.

### F10  feat(director): prompts and checks for the new catalog
- The cast stage maps traits to the new Spec fields and the iconography presets.
- The shot planner uses mounts and the new poses, props and sets.
- CONTENT_GUIDE treatments are in the prompts, and the validator enforces the checkable ones (e.g. endless-cloth framing rules, no wound effects).
- Keep the guide size budgets.
- Re-run the census matcher: report stageable episodes before and after Phase 7.

### USER CHECKPOINT C (after F10) — a real short on a new set
The user picks a census episode that uses a new set and the kit. Suggestions: the Yaksha's questions (lake, crane), Bhima meets Hanuman (mountain, monkey), the dice game (sabha, dice). Run `daily-short-hi` through the queue. Record the user's rating and notes; fix small issues (fix commits).

### F11  test and docs
- Tests:
  - set modules and lazy loading;
  - catalog check;
  - new Spec fields, poses, props and specials (measures);
  - mounts in the solver;
  - inventory schema and matcher with mock;
  - census coverage;
  - SFX determinism and no-repeat.
- Screenshots and sheets in docs/reports/phase-7/: Catalog screen, census, kit sheet, animals/chariot sheet, each set's look-dev sheet, the checkpoint shorts' covers.
- Docs:
  - CATALOG_GUIDE.md, CONTENT_GUIDE.md;
  - API.md, UI.md;
  - ROADMAP.md: Phase 8 Kurukshetra (battlefield, armies, formations, camp, night battle); then 16:9 long-form; later other story worlds, direct upload, a sample SFX library with a licence ledger.
- docs/reports/phase-7.md per the template.

## Acceptance (paste the evidence in the report)
1. npm test green: golden <= 1.0, Adi audio unchanged, fixture stills <= 1.0, catalog check passes for every set.
2. Checkpoint A: the daily short exported with export-qa PASS, and the per-stage time/spend vs estimate table.
3. Census: episodes.json mapped to Ganguli sections; census.md with the build list the user approved; stageable episodes before vs after.
4. Kit, animals, chariot and mounts: review sheets approved; measures and solver tests.
5. Each new set: look-dev sheet approved by the user, within budget, test board animatic and stills, lookcheck results.
6. Checkpoint C: the short rated by the user.
7. No downloaded art or sound; library sources recorded; keys and CSP unchanged.
8. `git log --oneline` shows Step 0, then F1–F11 in order (fix commits after the checkpoints).

## Out of scope
- Kurukshetra (battlefield, armies, formations, war camp, night battle): Phase 8;
- other story worlds;
- 16:9 long-form;
- direct upload;
- a desktop wrapper;
- sample-based sound libraries.

=====================================================================
PHASE 7 AMENDMENT 1 — style packs and part regeneration
=====================================================================

Context: the user wants (1) to choose the animation style per project from a dropdown, because future films may use a different Claude skill with a very different art style, and (2) to select any part of a finished animatic or final (e.g. 1:10–1:15), regenerate only that part, and have it stitched back in place.

Order of work:
1. Finish the checkpoint A fix already decided (frozen spans and pops: diagnose, fix the cause, re-render, QA pass, STOP at the animatic gate for the user). Part regeneration reuses that code path, so the fix comes first.
2. Append this amendment verbatim to docs/prompts/phase-7.md and commit: docs: phase 7 amendment 1
3. Implement F2 and F3 below. The original F2–F11 become F4–F13, unchanged except where noted at the end.

### F2  feat(core): style packs
A Claude skill is instructions for an agent, not code Fableon runs. Today's look is the cartoon-3d-short skill ported into the engine. Make that port a pluggable "style pack", so a new skill becomes a new pack (a one-time porting job) without touching the shared pipeline. Fableon never runs a Claude skill per film.
- Contract: docs/STYLES.md + schema/style.schema.json. A pack declares:
  - id, name, description, version, source (skill name, URL, licence), formats (9:16 now), sample frames;
  - its implementations of the style-specific stages: cast, shotplan, board (its own board schema), render (segment renderer with quality presets), stills, lookdev, the Finish look controls it supports, and measures for its validator;
  - its catalog, prompt cards (within today's size budgets), director guide and craft notes;
  - optional overrides: the script craft formula (default: today's formula), the sound palette (SFX kinds, instruments), the QA profile (frozen-span limit, pop rules, look targets — a limited-animation style may legitimately hold frames).
- Shared and unchanged for every style: brief, research, script (unless overridden), fact-check, voice, the sound mix, segment cache and assembly, publish, export, queue, presets, costs.
- Register today's look as the first pack, `toon3d` ("2D cartoon cards in a 3D world", from cartoon-3d-short), through an adapter over the existing engine. Do not move engine files. Golden, Adi audio and fixture stills stay identical.
- Project and preset field `style`:
  - default toon3d; existing projects migrate to toon3d;
  - a Style dropdown (ready packs, each with a sample frame) in the New project dialog, the presets, and the project header;
  - the style changes freely until the cast stage is approved. After that, "Change style" re-runs from cast, with history kept (estimate first, confirm), never silently.
- Add a style from a skill: Settings → Styles → "Add from a skill folder" (or a git URL the user gives).
  - Copy the skill into styles/_incoming/<name>/. Never copy reference media marked private or study-only; record the licence.
  - Write styles/<id>/PORTING.md: what the skill does at each stage, what maps to the contract, what's missing, and the porting tasks.
  - The pack shows as "not ready" in the dropdown until `fableon style check <id>` passes: a test board renders at preview and final quality; the QA profile, catalog check and prompt-size budgets pass.
- Engine build ids, segment caches and QA are per style.
- Tests:
  - the contract check on toon3d;
  - project/preset migration;
  - a minimal test-only pack (flat colour cards) that proves a second pack can run brief → final through the shared pipeline.

### F3  feat(edit): regenerate part of a film
Select a time range on the animatic or final, generate alternative takes for just that range, preview them in context, pick one, and stitch it in. Everything outside the range stays frame-identical.
- Range: from/to snap to word boundaries (hold Alt for frames); 1–20 s (longer ranges: use the per-shot note). A range may cross shot boundaries.
- Takes: POST /api/projects/:id/ranges {from, to, note?, count 1–3, edges: "match" | "cut"} starts a job (estimate first: the planner call plus local render time) that does the following.
  - Re-plan only the range with the routed shot planner: the note if given, plus the original intent. Without a note, make variations by choosing different solver/allocator options and seeds: camera size/move/angle, subject emphasis, character actions, poses, expressions, props, fx. Sets, scene, mood, narration and timing never change.
  - Compile a board patch confined to the range:
    - edges "match" (default): pin the camera and character states at the in and out frames to the current film (pinned keys; interpolation must never cross a pinned key), so there is no jump;
    - edges "cut": the range becomes its own shot with cuts at its edges, subject to the editing rules (no jump cuts, keys >= 0.6 s).
  - Validate the patch: the board validator plus a static-span check (no span without camera or subject motion longer than the style's frozen limit).
  - Render each take at animatic quality for [from − 1 s, to + 1 s] only.
- UI on Animatic and on Finish → Render:
  - drag on the scrubber to select, with handles and the Hindi words shown under the range;
  - a "Regenerate this part" drawer: note, number of takes, edges;
  - takes play as looping players next to the current version, with A/B in context;
  - "Use this take" or "Keep current";
  - every take is kept in a per-range history with revert.
- Accepting a take:
  - writes the board patch with history; the board becomes `edited`, and the animatic gate needs the user's approval again;
  - re-renders only the range in the animatic: extend the Phase 6 segment cache to the animatic, with sub-shot segments split at the range edges;
  - the final plan then shows only that range dirty;
  - if the take moves an action that has a sound effect, update those cues and rebuild the mix (audio only).
- Guarantees, each tested:
  - frames outside the range are byte-identical before and after (frame hashes), in both the animatic and the final;
  - QA (frozen, pops) runs on the stitched range ± 1 s;
  - voice and narration timing are untouched.
- Tests: pinned-edge interpolation, the sub-shot segment split and cache reuse, the cut-edge editing rules, frame identity outside the range, take history and revert.

### Changes to the rest of Phase 7
- The census inventory stays style-independent. The matcher and the build list run against the chosen style's catalog (toon3d for now).
- Checkpoint B also asks the user: build the new sets in toon3d now, or wait for a new style pack?
- Acceptance additions:
  - toon3d passes `fableon style check`;
  - the test pack runs end to end;
  - on work/karna-at-the-tournament (after checkpoint A), one ~5 s part is replaced by a chosen take, with frame identity outside the range proven and only that range re-rendered in the final.
