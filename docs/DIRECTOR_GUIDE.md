# Fableon director guide

A **board** (`board.json`) is the compact film plan a model writes. `fableon compile --project <dir>` expands it into
the v1 render `storyboard.json`; the engine only reads the compiled file. Write JSON that follows the project schema
from `fableon schema --project <dir>`. Numbers are metres and seconds; angles are degrees.

## Anchors

Use narration words:

| string | meaning |
|---|---|
| `13.deer` | word `deer` on line 13, 2 frames before the cut |
| `13.deer#1+0.4s` | second occurrence, 12 frames after it |
| `shot+1.2s` / `shot-10f` | relative to this shot's start |
| `end+4f` | relative to the last word |


## Cast, marks, rows, ride

Declare reusable actors in `cast` (`{"kunti":{"spec":"C.kunti"}}`), optional `variant:"priest"`, and groups in
`groups` (`{"brothers":["yudhi","bhima",...]}`). Place actors by set marks: `"at":"village.front"`,
`{"mark":"palace.courtyard","nudge":[0,0,1]}`, or an attachment `{"on":"arjuna","attach":"handL"}`.
A `row` expands a group around a mark (`row`, `at`, `spacing`, `curve`, `facing`). Marks/set faces come from
`schema/catalog.json`.

Actor sugar: `says:[start,end]` talks between anchors; `do:[[anchor,{pose,expr,…}]]` are beats; `enter`/`exit` set
visibility; `appear` pops in. A listed camera subject must be visible at the key start.

`"ride":"boat"` makes an actor's feet follow a moving set piece, plus `"nudge":[x,y,z]`; do not duplicate the boat path
on the actor. A camera may `follow` the actor (or a moving set-piece id). S5 uses this for Satyavati's boat.

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
- `over:"pandu"` puts Pandu's head in the lower-left/right third while `on` is framed behind him at its band. Do not
  list the foreground actor in `on`. The over actor must face the subject, never the lens.
- `with:["palace.tree"]` names context that must be in frame but is not the subject (mark, set-piece id, fx id or
  actor id). The solver includes it; if impossible it fails `cannot frame <id> at size <size>`.
- `third:"left"|"right"` offsets the look point for look room.
- `to:"arena.target"` with `tiltUp`/`tiltDown`/`pan` starts on `on` and moves the look to the target. With `reveal`,
  the camera glides out over `glide` seconds.
- `reaction:true` marks a deliberate off-screen cutaway and suppresses the speaker warning.
- `fov` overrides the size's default lens; use it for a wide-angle prop insert (`S27` bow, fov 75).
- A key with no subjects must say `"scenery":true` (establishing, transition, fire/effect-only).

Defaults: fov close 37 / medium 39 / full 41 / wide 45 / establishing 48 / insert 35; push rates 0.003 / 0.0025 /
0.0022 / 0.002 / 0.0018 / 0.0025; DOF 13 / 11 / 8 / 0 / 0 / 11. Close/medium place the eyes at 40 % from the top.

## Size bands

Sizes are **screen targets**, not "fit". Measurements are head-box height / frame height (`head`) or top of head to
feet / frame height (`body`). The bands below are calibrated to the hand-tuned reference film (38 acted keys); the
solver aims the primary subject at the band centre.

| size | metric | band | solver target |
|---|---|---:|---:|
| close | head | 25–60 % | 42.5 % |
| medium | head | 12–42 % | 27 % |
| full | body | 30–85 % | 57.5 % |
| wide | body, primary | 15–50 % | 32.5 % |
| wide | body, other listed subjects | ≥ 10 % | — |
| establishing | body, listed subjects | ≥ 5 % | set bounds |
| insert | target box | 30–85 % | prop box |

`fableon frames` reports a semantic key's primary outside its band as `subject too small/large`. A key whose subjects
cannot all reach the floor inside a 9:16 frame fails at compile time with
`group too wide for a vertical frame (<width> m)`; split the key, pan, curve the row or reduce spacing — the solver
never shrinks silently.

## What the measured checks mean

`fableon frames` renders a flat object-ID coverage pass at 180×320, then checks the settle frame, the key middle and
end-2, plus every 12 frames in long keys. Semantic board keys produce **errors**; hand-written v1 keys produce the
same findings as **warnings**. Findings are written to `frames.json` with a one-line fix.

| finding | measured rule | fix |
|---|---|---|
| `subject hidden <id>` | visible fraction < 60 % | move it into frame or remove it from `on`; `over` is exempt |
| `subject too small/large <id>` | primary outside its band; others below the floor | change size one step or move the mark |
| `head cut <id>` | head box crosses top/left/right (bottom only for close with chin inside) | raise/lower the camera or widen the size |
| `blocker <id>` | non-subject nearer than the subject and >12 % of frame, or >25 % overlap with the primary (>1 % area) | change side/angle, move/split the blocker, or make it a subject |
| `context missing <id>` | a `with` item covers <2 % or is <40 % visible | widen the size, choose a nearer mark, or add it to `on` |
| `speaker off-screen <id>` | a talking actor covers <4 % for ≥1 s | keep the speaker on screen or mark the key `reaction:true` |
| `eye line` (warning) | close/medium eyes outside 30–50 % from the top | adjust `look`/angle |

Ambient effect kinds (`halo`, `fire`, `smoke`, `burst`, `splash`, `petals`, `puff`, `stars`) and mark proxies are
exempt from blockers. The `over` actor is exempt while it stays in its corner. The speaker rule is a warning; use `reaction:true` for a deliberate cutaway.

## Mark views

Every catalog mark carries `view`: the camera heading that puts the set's characteristic background behind the
subject. `side` is relative to this view. Corrections after measurement: `lac.house` 180°, `city.agni` 172°.

## Workflow

```bash
npx fableon compile --project P
npx fableon validate --deep --project P
npx fableon frames --project P                       # measured; --fast for the old analytic path
npx fableon review --project P --compare fixtures/adi-parva --coverage --split --out review/
```

`review` samples the **settle** frame and key end-2, one row per camera key (never a crossfade), and writes the
compiled / comparison / coverage columns plus `review.json`. `--split` writes one image per shot under the output
directory, each at most 1600 px tall. Compile again; the storyboard must be byte-identical.

## Worked examples (12-shot fixture)

Two-plane opening, close sage, Kunti reaction (S14):

```jsonc
{ "at":"13.Pandu",   "size":"wide",   "on":["deer"],  "over":"pandu", "side":"left", "move":"push" },
{ "at":"13.secretly","size":"close",  "on":["sage"],  "move":"hold",  "cut":true },
{ "at":"13.and",     "size":"medium", "on":["kunti"], "move":"push",  "cut":true }
```

Ghat medium, then follow Satyavati on the boat (S5):

```jsonc
{ "at":"4.Our",         "size":"medium", "on":["shantanu"],  "move":"push" },
{ "at":"4.fisherman's", "size":"medium", "on":["satyavati"], "move":"follow", "cut":true }
```

Mango tree context and falling kids (S22):

```jsonc
{ "at":"21.Bhima",      "size":"wide", "on":["kidBhima"], "with":["palace.tree"], "move":"push" },
{ "at":"21.shaking+1s", "size":"wide", "on":["kidBhima","kaurava1","kaurava2"], "cut":true }
```

Burning forest at night (S38):

```jsonc
"fx": [{ "kind":"fire", "id":"forestFire", "at":"35.The", "pos":"city.forest", "spots":[...] }],
"camera": [{ "at":"35.fire", "size":"wide", "on":["agni"], "with":["forestFire"], "fov":60, "move":"push" }]
```

The fire fx needs an `id` to be context.
