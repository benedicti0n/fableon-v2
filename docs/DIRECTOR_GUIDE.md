# Fableon director guide

A **board** (`board.json`) is the compact film plan a model writes. `fableon compile --project <dir>` expands it into
the v1 render `storyboard.json`; the engine only reads the compiled file. Write JSON that follows the project schema
from `fableon schema --project <dir>`.

## Anchors

Use narration words:

| string | meaning |
|---|---|
| `13.deer` | word `deer` on line 13, 2 frames before the cut |
| `13.deer#1+0.4s` | second occurrence, 12 frames after it |
| `shot+1.2s` / `shot-10f` | relative to this shot's start |
| `end+4f` | relative to the last word |

## Cast, marks, rows, ride, face

Declare reusable actors in `cast` (`{"kunti":{"spec":"C.kunti"}}`), optional `variant:"priest"`, and groups in
`groups` (`{"brothers":["yudhi","bhima",...]}`). Place actors by set marks: `"at":"village.front"`,
`{"mark":"palace.courtyard","nudge":[0,0,1]}`, or an attachment `{"on":"arjuna","attach":"handL"}`.
A `row` expands a group around a mark (`row`, `at`, `spacing`, `curve`, `facing`).

Actor sugar: `says:[start,end]` talks between anchors; `do:[[anchor,{pose,expr,…}]]` are beats; `enter`/`exit` set
visibility; `appear` pops in. `"face":"deer"` (an actor id, mark or fx id) makes the compiler turn the body/eyes and aim
the prop toward that target **under each camera key**; a cut to the other side flips it. It is also valid inside a
`do` beat. `over` uses this automatically to face the `on` subject.

`"ride":"boat"` makes an actor's feet follow a moving set piece, plus `"nudge":[x,y,z]`; do not duplicate the boat path
on the actor.

## Camera grammar

```jsonc
{ "at":"13.deer", "size":"medium", "on":["deer"], "angle":"eye", "side":"front", "move":"push" }
```

- `size`: `close` (head/shoulders), `medium` (waist up), `full` (whole body), `wide` (subject plus surroundings),
  `establishing` (set bounds), `insert` (a prop or mark).
- `angle`: `eye`, `low`, `high`, `overhead`; `side`: `front`, `left`, `right`, `frontLeft`, `frontRight` relative to
  the subject mark's `view`.
- `move`: `push` (default dolly), `hold` (slow creep), `glide` (key transition), `follow` (moving id), `crane`,
  `tiltUp`, `tiltDown`, `pan`, `reveal`.
- `over:"pandu"` puts Pandu's head in the lower-left/right third while `on` is framed in the opposite upper part at its
  band. Do not list the foreground actor in `on`; it faces the subject automatically.
- `with:["palace.tree"]` names context that must be in frame but is not the subject (mark, set-piece id, fx id or actor
  id). The solver includes it; if impossible it fails `cannot frame <id> at size <size>`.
- `to:"arena.target"` with `tiltUp`/`tiltDown`/`pan` starts on `on` and moves the look to the target.
- `reaction:true` marks a deliberate off-screen cutaway and suppresses the speaker warning.
- A key with no subjects says `"scenery":true` (establishing, transition, fire/effect-only).

## Size bands and insert fill

Sizes are **screen targets**. `head` is the head-box height / frame; `body` is top of head to feet / frame.
The solver aims the primary subject at the class median measured from the reference film.

| size | metric | band | target |
|---|---|---:|---:|
| close | head | 25–60 % | 26 % |
| medium | head | 12–42 % | 16 % |
| full | body | 30–85 % | 34 % |
| wide | body, primary | 15–50 % | 24 % |
| wide | body, other listed subjects | ≥ 10 % | — |
| establishing | body, listed subjects | ≥ 5 % | set bounds |
| insert | fill = max(width/frame, height/frame) | 55–90 % | 72.5 % |

A group that cannot reach the floor inside 9:16 fails with `group too wide for a vertical frame (<width> m)`; split,
pan, curve the row or reduce spacing — never shrink silently. `insert` fits the mark's world box in both
directions, so a long flat prop (the 5.2 m bow) reads as a bow without a `fov` override. Mark boxes exist for
`palace.tree`, `arena.bow`, `arena.pole`, `lac.house`, `city.forest` and related marks.

## Editing rules

`fableon frames` (measured) enforces these on semantic board keys; hand-written v1 keys get warnings:

| finding | rule | fix |
|---|---|---|
| `jump cut` | consecutive keys keep the same primary at the same size with <30° side/angle change | merge, change size a step, or move >=30° |
| `key too short` | a key under 18 frames (0.6 s) | merge into a neighbour or hold longer |
| `first key late` | the first camera key is after the shot start | start the shot on its first key; a subject entering within 0.5 s counts as present |
| `glide with cut` | `move:"glide"`/`crane` or a `glide` value with `cut:true` | remove the cut or use push |
| `action off-screen` | a pose/expr/prop/enter/exit/appear beat while a non-subject covers <4 % | keep it on screen or mark the beat `offscreen:true` |
| `flat wide` | a wide/establishing frame has one background id (wall/ground/water/sky) >55 % | add `with` context, change side/angle, or change size |

Sampling: static settle/mid/end-2; moving start/mid/end (`tiltUp`, `pan`, `glide`, `follow`, `crane`, `reveal`).

## Measured errors and fixes

| finding | measured rule | fix |
|---|---|---|
| `subject hidden` | visible fraction <60 % | move it into frame or remove it from `on`; `over` is exempt |
| `subject too small/large` | primary outside its band; others below the floor | change size a step or move the mark |
| `edge <id>` | head crosses the 4 % side / 2 % top margin | move the head inside the margins |
| `head cut <id>` | head box crosses the frame edge (silhouette top includes hair/crown/bun) | raise/lower/widen |
| `blocker <id>` | non-subject nearer than the subject and >12 % frame, or >25 % overlap (>1 % area) | change side/angle, move the blocker, or split |
| `context missing <id>` | `with` object <2 % area or <40 % visible | widen the size, choose a nearer mark, or add it to `on` |
| `looks away <id>` | a `face`/`over` actor aims away from its target | fix `face` or the staging |
| `merge <a>/<b>` | the over and subject head boxes overlap >10 % of the smaller | move them to opposite thirds |
| `edge intruder <id>` | a non-subject is cut by an edge and <50 % visible | keep it out of frame or hide it |
| `speaker off-screen` | a talker <4 % for ≥1 s | keep the speaker on screen or mark `reaction:true` |
| `eye line` | close/medium eyes outside 30–50 % from the top | adjust look/angle |

`frames.json` is written only at `<project>/frames.json`; every finding has a one-line fix. Ambient effects and mark
proxies are exempt from blockers; the over actor is exempt while in its corner.

## Workflow and examples

```bash
npx fableon compile --project P
npx fableon validate --deep --project P
npx fableon frames --project P                       # measured; --fast is the old analytic path
npx fableon review --project P --compare fixtures/adi-parva --coverage --split --out review/
```

`review` samples the same frames, one row per key (never a crossfade), and writes compiled / comparison / coverage
columns plus `review.json` and one image per shot.

Two-plane S14 (Pandu faces the deer), close sage, shock on Pandu:

```jsonc
{ "at":"13.Pandu",   "size":"wide",   "on":["deer"], "over":"pandu", "side":"right", "move":"push" },
{ "at":"13.secretly","size":"close",  "on":["sage"], "move":"hold", "cut":true },
{ "at":"13.The",     "size":"medium", "on":["pandu"], "move":"push", "cut":true }
```

One L5 fisher key (no jump cut), first-key-at-start L16, arena + insert + tilt S27:

```jsonc
{ "at":"5.Her",            "size":"medium", "on":["fisher"], "move":"push" },
{ "at":"16.Five",          "size":"wide",   "on":["bro0","bro1","bro2","bro3","bro4"], "move":"push" },
{ "at":"26.In",            "size":"wide",   "on":["arena.floor"], "scenery":true, "move":"push" },
{ "at":"26.monster+0.3s",  "size":"insert", "on":["arena.bow"], "scenery":true, "cut":true },
{ "at":"26.target",        "size":"wide",   "on":["arena.floor"], "to":"arena.target", "move":"tiltUp", "cut":true, "scenery":true }
```

