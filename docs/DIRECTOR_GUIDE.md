# Fableon director guide

A **board** (`board.json`) is the compact film plan a model writes. `fableon compile --project <dir>` expands it into
the v1 render `storyboard.json`; the engine only reads the compiled file. Follow the project schema.

## Anchors

Use narration words:

| string | meaning |
|---|---|
| `13.deer` | word `deer` on line 13, 2 frames before the cut |
| `13.deer#1+0.4s` | second occurrence, 12 frames after it |
| `12.यम` / `12.यम#1+0.3s` | Unicode word, and its second occurrence 9 frames after |
| `12:4` / `12:4+0.3s` | 5th word of line 12 (0-based), and 9 frames after |
| `shot+1.2s` / `shot-10f` | relative to this shot's start |
| `end+4f` | relative to the last word |

## Cast, marks, rows, ride, face

Declare reusable actors in `cast` (`{"kunti":{"spec":"C.kunti"}}`), optional `variant:"priest"`, and groups in
`groups` (`{"brothers":["yudhi","bhima",...]}`). Place actors by marks: `"at":"village.front"`,
`{"mark":"palace.courtyard","nudge":[0,0,1]}`, or `{"on":"arjuna","attach":"handL"}`. A `row` expands a group around a
mark (`row`, `at`, `spacing`, `curve`, `facing`).

`do:[[anchor,{pose,expr,…}]]` are beats; `says:[start,end]` talks between anchors; `enter`/`exit` set visibility;
`appear` pops in with optional `stagger`; actor-level `offscreen:true` suppresses the entrance/action checks.
`"face":"deer"` (actor, mark or fx id) turns the body/eyes and aims the prop at that target under each camera key; a
cut to the other side flips it. It also works inside a beat. `over` faces the `on` subject automatically.

`"ride":"boat"` makes an actor's feet follow a moving set piece, plus `"nudge":[x,y,z]`; do not duplicate the boat path.

## Camera grammar

```jsonc
{ "at":"13.deer", "size":"medium", "on":["deer"], "angle":"eye", "side":"front", "move":"push" }
```

- `size`: `close` (head), `medium` (waist), `full` (body), `wide` (subject plus surroundings),
  `establishing` (set bounds), `insert` (a prop or mark).
- `angle`: `eye`, `low`, `high`, `overhead`; `side`: `front`, `left`, `right`, `frontLeft`, `frontRight` relative to
  the subject mark's `view`.
- `move`: `push` (default), `hold` (slow creep), `glide`, `follow` (moving id), `crane`, `tiltUp`, `tiltDown`, `pan`,
  `reveal`.
- `full`/`wide`/`establishing` keys ground the lowest actor's feet at about 78 % from the top; measured frames warn
  `floating subjects` when feet are above 65 %.
- `over:"pandu"` puts Pandu in the lower third while `on` is upper. Compile requires the over head to be 18–30 % of
  frame and at least 1.8× the `on` subject's head. The solver moves the camera on the over→subject line to the lens and
  distance that achieve it; it never moves the actors. Prefer `with` for a two-shot when the marks cannot make that
  split.
- `with:["deer"]` names context that must be in frame (mark, set piece, fx or actor). An actor id wins over a
  same-named mark, so this follows the stag, not `deer.deer`. The solver includes it or fails `cannot frame`.
- `to:"arena.target"` with `tiltUp`/`tiltDown`/`pan` starts on `on` and moves the look to the target.
- `reaction:true` marks a deliberate off-screen cutaway (suppresses the speaker warning).
- A key with no subjects says `"scenery":true`.

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

A group that cannot reach the floor fails `group too wide for a vertical frame`; split, pan, curve or reduce
spacing. `insert` fits the mark's world box in both directions, so a long prop reads without a `fov` override.

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

Sampling: static settle/mid/end-2; moving start/mid/end.

## Measured errors and fixes

| finding | measured rule | fix |
|---|---|---|
| `subject hidden` | visible <60 % | move it into frame or remove it from `on`; `over` is exempt |
| `subject too small/large` | primary outside its band; others below the floor | change size or move the mark |
| `cut subject` | a full/wide/establishing actor silhouette crosses the 4 % side margin | widen, move it inside, or split |
| `edge <id>` | head crosses the 4 % side / 2 % top margin | move the head inside |
| `head cut <id>` | head box crosses the frame edge (hair/crown/bun counts) | raise/lower/widen |
| `face too small` | head <6 % while talking or within 0.5 s of an expression beat in the same key | move closer, use a larger size, or put the beat in a readable key |
| `entrance off-screen` | enter/exit/appear <3 % of frame | keep it on screen or mark the actor `offscreen:true` |
| `over not foreground` | over head outside 18–30 % or distance >0.60 of the subject | move it closer, resize the head, or use `with` |
| `tangent` | a thin world silhouette (h/w >=4) touches a head | move the object/actor or change side/angle |
| `blocker <id>` | non-subject nearer than the subject and >12 % frame, or >25 % overlap (>1 % area) | change side/angle, move it, or split |
| `context missing <id>` | `with` object <2 % area or <40 % visible | widen, choose a nearer mark, or add it to `on` |
| `looks away <id>` | an aiming `face`/`over` actor points away from its target | fix `face` or the staging |
| `merge <a>/<b>` | over and subject head boxes overlap >10 % of the smaller | move them to opposite thirds |
| `edge intruder <id>` | a non-subject is cut by an edge and <50 % visible | keep it out of frame or hide it |
| `speaker off-screen` | a talker <4 % for ≥1 s | keep the speaker on screen or mark `reaction:true` |
| `eye line` | close/medium eyes outside 30–50 % from the top | adjust look/angle |

The entrance floor is 3 %, not 4 %: a five-person wide group at the calibrated wide target projects about 3.9 % per
brother. `frames.json` is written at `<project>/frames.json`; every finding has a one-line fix. Ambient effects and
mark proxies are exempt from blockers; the over actor is exempt from hidden while in its corner.

## Shot plan

`shotplan.json` covers every line in order; a long line may split into two shots with the same line and different
starts. Starts strictly increase, shots are 1.2–6 s (8 s only with `hold`), average 2.5–4 s, and keys last >=0.6 s.
The first shot and every new place open on a wide/establishing key with a landmark in `mustShow`; the board writer
turns `mustShow` into the first key's `with`.

## Workflow and examples

```bash
npx fableon compile --project P
npx fableon validate --deep --project P
npx fableon frames --project P                       # measured; --fast is the old analytic path
npx fableon review --project P --compare fixtures/adi-parva --coverage --split --out review/
```

