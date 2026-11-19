# Fableon director guide

A **board** (`board.json`) is the compact film plan a model writes. `fableon compile --project <dir>` expands it into
the v1 render `storyboard.json`; the engine only reads the compiled file. Follow the project schema.

## Anchors

| string | meaning |
|---|---|
| `13.deer` | word `deer` on line 13, 2 frames before the cut |
| `13.deer#1+0.4s` | second occurrence, 12 frames after it |
| `12.यम` / `12.यम#1+0.3s` | Unicode word, and its second occurrence 9 frames after |
| `12:4` / `12:4+0.3s` | 5th word of line 12 (0-based), and 9 frames after |
| `shot+1.2s` / `shot-10f` | relative to this shot's start |
| `end+4f` | relative to the last word |

## Cast, marks, rows, ride, face

Declare reusable actors in `cast` (`{"kunti":{"spec":"C.kunti"}}`) and groups in `groups`. Place by marks:
`"at":"village.front"`, `{"mark":"palace.courtyard","nudge":[0,0,1]}`, or `{"on":"arjuna","attach":"handL"}`. `row`
expands a group around a mark (`spacing`, `curve`, `facing`). `do:[[anchor,{pose,expr,…}]]` are beats; `says` talks
between anchors; `enter`/`exit` set visibility; `appear` pops in; `offscreen:true` suppresses the entrance checks.
`"face":"deer"` turns the body/eyes and aims the prop at that target; `over` faces the `on` subject automatically.
`"ride":"boat"` makes feet follow a moving set piece (`nudge`); do not duplicate the boat path.

## Camera grammar

```jsonc
{ "at":"13.deer", "size":"medium", "on":["deer"], "angle":"eye", "side":"front", "move":"push" }
```

- `size`: `close` (head), `medium` (waist), `full` (body), `wide` (subject plus surroundings),
  `establishing` (set bounds), `insert` (a prop or mark).
- `angle`: `eye`, `low`, `high`, `overhead`; `side`: `front`, `left`, `right`, `frontLeft`, `frontRight` relative to
  the subject mark's `view`.
- `move`: `push` (default), `hold`, `glide`, `follow` (moving id), `crane`, `tiltUp`, `tiltDown`, `pan`, `reveal`.
- `full`/`wide`/`establishing` keys ground the lowest actor's feet at about 78 % from the top; measured frames warn
  `floating subjects` when feet are above 65 %.
- `over:"pandu"` puts Pandu in the lower third while `on` is upper. Compile requires the over head to be 18–30 % of
  frame and at least 1.8× the `on` subject's head; the solver moves the camera, never the actors. Prefer `with` for a
  two-shot when the marks cannot make that split.
- `with:["deer"]` names context that must be in frame (mark, set piece, fx or actor). An actor id wins over a
  same-named mark. The solver includes it or fails `cannot frame`.
- `to:"arena.target"` with `tiltUp`/`tiltDown`/`pan` starts on `on` and moves the look to the target.
- `reaction:true` marks a deliberate off-screen cutaway; a key with no subjects says `"scenery":true`.

## Direction grammar (Phase 3D)

`scene` groups by place+time; `transition` is crossfade (6-8 f), flash (4 f) or cut (max 2). `punch` 0.6 %/f, `impact`
7 f kick, `drama` 4-5° roll, `reveal` pull-back, `foreground` catalog mark, `ease:"burst"` 8-10 f. `moves` gives
walk/run paths; `follow` needs one. DOF 25-40 %, foreground 25-40 % of keys, low heights for full/wide.

## Light and look (Phase 3F)

Set `look.mood` on every shot; all shots in a scene share it. The code builds the rig from the mood.

| mood | use for | rig |
|---|---|---|
| `warm-side` | dialogue, the safe default | side key 100–120°, lit faces, warm/violet split, medium glow, no haze |
| `golden-glow` | wonder, reunion, golden hour | 3/4-back key el 7–12°, warm key, violet shadows, haze, high glow |
| `dusk` | endings, thresholds | very low orange sun, purple sky, high glow, long shadows |
| `night-moon` | night, death, dream | cool moon key, warm card tint, practicals, low haze/glow |
| `noon` | harsh midday only | warm/cool split, short shadows |

Per-shot overrides: `shafts`, `sun`, `halo`, `glow`, `rim`, `grade`. `project.look.featureRim` is a dark-skin eye/mouth
readability aid and is **off** by default; never lighten skin. Characters are flat-lit: the mood key/sky/grade applies
to the world only; no rim, glow, bloom or mood grade on characters. The background may glow; the character must not.

`fableon lookcheck` measures world pixels outside the character mask: warm/cool split, glow share (luma > 0.9),
mean/std/p2/p98, face brightness. Targets live in `cli/src/look.js`; `flat light <scene>` / `dark face <id>` are
advisory — explain or fix with light, not skin.

Foreground: the allocator picks a catalog mark near the lens for ~1/3 of keys. A prop covering >10 % of a subject is
re-picked or dropped (`foreground overlap`); never use an actor's standing mark or a building/location as foreground.

## Size bands and insert fill

`head` is head-box height / frame; `body` is head-to-feet / frame; the solver targets the reference medians.

| size | what you see | band / target | reference |
|---|---|---|---|
| close | head and shoulders/chest | head 25–60 %, target 26 % | S14 sage f1302 |
| medium | waist up | head 12–42 %, target 16 % | S38 Agni f3468 |
| full | whole figure, feet in frame | body 30–85 %, target 34 % | S14 Kunti/Pandu f1349 |
| wide | whole figures plus surroundings | body 15–50 %, others ≥10 % | L16 f1591 |
| establishing | the set, figures small | subjects ≥5 % | S27 arena f2516 |
| insert | a prop or mark fills the frame | fill 55–90 %, target 72.5 % | S27 bow f2638 |

A group that cannot reach the floor fails `group too wide for a vertical frame`; split, pan, curve or reduce spacing.
`insert` fits the mark's world box in both directions, so a long prop reads without a `fov` override.

## Editing rules

`fableon frames` (measured) enforces these on semantic board keys; hand-written v1 keys get warnings:

| finding | rule | fix |
|---|---|---|
| `jump cut` | same primary/size with <30° side/angle change | merge, change size, or move >=30° |
| `key too short` | a key under 18 frames (0.6 s) | merge or hold longer |
| `first key late` | the first key is after the shot start | start on the first key |
| `glide with cut` | `glide`/`crane` with `cut:true` | remove the cut or use push |
| `action off-screen` | a beat while a non-subject covers <4 % | keep it on screen or mark the beat `offscreen:true` |
| `flat wide` | one background id >55 % of a wide/establishing frame | change angle/side (high often helps) or size |

## Measured errors and fixes

| finding | measured rule | fix |
|---|---|---|
| `subject hidden` | visible <60 % | move it into frame or remove it from `on`; `over` is exempt |
| `subject too small/large` | primary outside its band; others below the floor | change size or move the mark |
| `face too small` | head <6 % while talking or within 0.5 s of an expression beat | move closer, use a larger size, or put the beat in a readable key |
| `over not foreground` | over head outside 18–30 % or distance >0.60 of the subject | move it closer, resize the head, or use `with` |
| `tangent` | a thin world silhouette (h/w >=4) touches a head | move the object/actor or change side/angle |
| `blocker <id>` | non-subject nearer than the subject and >12 % frame, or >25 % overlap (>1 % area) | change side/angle, move it, or split |
| `context missing <id>` | `with` object <2 % area or <40 % visible | widen, choose a nearer mark, or add it to `on` |
| `merge <a>/<b>` | over and subject head boxes overlap >10 % of the smaller | move them to opposite thirds |
| `foreground overlap` | a foreground mark covers >10 % of a subject | re-pick another mark or drop it; never put an actor/building/location in `foreground` |
| `speaker off-screen` | a talker <4 % for ≥1 s | keep the speaker on screen or mark `reaction:true` |

`frames.json` is written at `<project>/frames.json`; every finding has a one-line fix. Ambient effects and mark proxies are exempt from blockers.

## Shot plan

`shotplan.json` covers every line in order; a long line may split into two shots with the same line. Starts strictly
increase, shots are 1.2–6 s (8 s only with `hold`), average 2.5–4 s, keys >=0.6 s. Open the film and every new place
on a wide/establishing landmark in `mustShow`; the board turns it into the first key's `with`.
