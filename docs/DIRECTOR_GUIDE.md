# Fableon director guide

A **board** (`board.json`) is the compact film plan a model writes. `fableon compile --project <dir>` expands it into
the v1 render `storyboard.json`; the engine only reads the compiled file. Write JSON that follows the project schema
from `fableon schema --project <dir>`. Numbers are metres and seconds; angles are degrees.

## Anchors

Use narration words, never absolute time:

| string | meaning |
|---|---|
| `13.deer` | word `deer` on line 13, 2 frames before the cut |
| `13.deer#1+0.4s` | second occurrence, 12 frames after it |
| `shot+1.2s` / `shot-10f` | relative to this shot's start |
| `end+4f` | relative to the last word |
| `f90` | absolute frame (avoid) |

An explicit suffix replaces the default `-2f`. A shot has `start`; a `partial` board also has `end` on every shot.

## Cast, marks, rows

Declare reusable actors in `cast` (`{"kunti":{"spec":"C.kunti"}}`), optional `variant:"priest"`, and groups in
`groups` (`{"brothers":["yudhi","bhima","arjuna","nakula","sahadeva"]}`). Place actors by set marks:
`"at":"village.front"`, `{"mark":"palace.courtyard","nudge":[0,0,1]}`, or an attachment
`{"on":"arjuna","attach":"handL"}`. A `row` expands a group around a mark (`row`, `at`, `spacing`, `curve`, `facing`).
Marks and set faces come from `schema/catalog.json`; `fableon catalog-card` lists them.

Actor sugar: `says:[start,end]` talks between anchors; `do:[[anchor,{pose,expr,…}]]` are beats; `enter`/`exit` set
visibility; `appear` pops in. A listed camera subject must be visible at the key start. Effects use the v1 kinds;
`dur`/`period` are seconds, and `at`/`until`/`from`/`toAt` use anchors.

## Camera grammar

```jsonc
{ "at":"13.deer", "size":"medium", "on":["deer"], "angle":"eye", "side":"front", "move":"push" }
```

- `size`: `close` (head/shoulders), `medium` (waist up), `full` (whole body), `wide` (all named subjects),
  `establishing` (set bounds), `insert` (a prop or mark).
- `angle`: `eye`, `low`, `high`, `overhead`; `side`: `front`, `left`, `right`, `frontLeft`, `frontRight` relative to
  the set's default face.
- `move`: `push` (default dolly), `hold` (slow creep), `glide` (key transition), `follow` (moving id), `crane`,
  `tiltUp`, `tiltDown`, `pan`, `reveal`.
- `over:"pandu"` on a key puts Pandu's head/shoulder in a lower front corner while `on` is framed behind him. Use it
  for over-the-shoulder dialogue; do not list the foreground actor in `on`.
- `third:"left"|"right"` puts the primary subject on a vertical third for look room.
- `to:"arena.target"` with `tiltUp`/`tiltDown`/`pan` starts on `on` and moves the look to the target. With
  `reveal`, the whole camera glides out to the target over `glide` seconds.
- `size:"insert"` on `arena.bowstand`, `arena.target`, `palace.jars`, `lac.tunnel`, etc. frames the prop tightly.
- A key with no subjects must say `"scenery":true` (establishing, transition, fire/effect-only).

Defaults: fov close 37 / medium 39 / full 41 / wide 45 / establishing 48 / insert 35; push rates 0.003 / 0.0025 /
0.0022 / 0.002 / 0.0018 / 0.0025; DOF 13 / 11 / 8 / 0 / 0 / 11. Close/medium place the eyes at 40 % from the top. The
solver fits both frame directions, adds a safe-area margin, and tries occlusion fallbacks around the subject.

## Validator: what to fix

`fableon validate --deep` and `fableon frames`:

- **subject X is not visible** — the key names an actor that enters later, has exited, or appears later. Move the key
  or remove the subject; use `"later":["x"]` only when it enters inside this key.
- **empty key** — add the real subjects or `"scenery":true`.
- **subject too close X** — head is not fully in frame or the box is >3× frame height: use `full`/`wide`, raise the
  angle, or move the subject mark.
- **foreground blocker X** — a non-subject actor/effect fills the frame in front: make it a subject, add `over`, or
  choose a cleaner angle/side.
- **safe area / blocked** — adjust size/side/marks until the validator is clean.

## Worked examples (from the 12-shot fixture)

Over-shoulder (S14):

```jsonc
{ "at":"13.Pandu", "size":"wide", "on":["deer"], "over":"pandu", "side":"left", "move":"push" }
```

Tilt to the target and insert the bow stand (S27):

```jsonc
{ "at":"26.target", "size":"wide", "on":["arena.floor"], "to":"arena.target",
  "move":"tiltUp", "glide":1.0, "scenery":true },
{ "at":"26.monster", "size":"insert", "on":["arena.bowstand"], "scenery":true, "cut":true }
```

Workflow: `fableon compile --project P` → `fableon validate --deep --project P` → `fableon frames --project P` →
`fableon review --project P --compare fixtures/adi-parva --shots … --out sheet.jpg`. Compile again; the output must be
byte-identical.
