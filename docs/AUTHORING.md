# Authoring format (`board.json`)

`board.json` is the compact format a director model or the future UI writes. `fableon compile --project <dir>` expands
it into the v1 render storyboard (`storyboard.json`) and validates the result. The v1 format remains the renderer's only
contract; `board.json` is never read by the engine.

The compiler is deterministic: the same `board.json`, `words.json` and `schema/catalog.json` produce byte-identical
storyboard JSON. The JSON Schema is `schema/authoring.schema.json`.

## Top level

```jsonc
{
  "version": 1,
  "fps": 30,
  "tailFrames": 36,
  "crossfade": 10,
  "flash": "1.Vyasa-2f",
  "cast": {
    "kunti": { "spec": "C.kunti" },
    "arjuna": { "spec": "C.arjuna", "variant": "priest", "seed": 33 }
  },
  "groups": { "brothers": ["yudhi", "bhima", "arjuna", "nakula", "sahadeva"] },
  "shots": []
}
```

Cast entries may use a catalog spec (`C.<name>`, `KIDS.<name>`), an inline spec object, an optional `variant`
(`"priest"` applies the priest-disguise transform), and an optional seed. Without a seed the compiler derives one from
a stable hash of the cast id. A `group` entry (or a top-level `groups` list) can be used wherever a row/list of actors is
allowed.

## Anchors

Strings, with the legacy default of 2 frames before a spoken word:

| String | v1 anchor |
|---|---|
| `13.deer` | `{ line: 13, word: "deer", offset: -2 }` |
| `13.deer#1+0.4s` | second `deer` on line 13, 12 frames after the word |
| `13.deer-2f` | 2 frames before the word |
| `shot+1.2s` | 36 frames after the shot start |
| `end+4f` | 4 frames after the last word |
| `f90` | absolute frame 90 (discouraged) |

An explicit suffix replaces the plain `-2f` default. Durations and rates are seconds; angles are degrees.

## Points and marks

A point is one of:

```jsonc
[32, 1.5, -20]                                  // world metres
"village.front"                                 // a set mark from schema/catalog.json
{ "mark": "village.hut", "nudge": [0, 0, 0.3] } // mark + offset
{ "on": "kingFlat", "attach": "head", "d": [0, 0.48, 0] } // actor attachment
```

The first part of a dotted mark is the set. A bare mark is looked up in the shot's `sets`. Marks carry a default
facing; sets carry `front` and `bounds`.

## Shots and actors

```jsonc
{
  "id": "L5",
  "start": "5.Her",
  "light": "day",
  "sets": ["village"],
  "actors": [
    "kunti",
    { "cast": "fisher", "at": "village.front", "pose": "demand", "facing": "camera" }
  ],
  "rows": [
    { "row": ["brothers"], "at": "village.front", "spacing": 0.8, "curve": 0.15, "facing": "camera" }
  ],
  "fx": [],
  "set": []
}
```

Actor sugar:

- `"says": ["13.deer", "13.die"]` starts a talk cycle at the first anchor and returns to the actor's expression at
  the second.
- `"do": [["14.chant", { "pose": "pray", "expr": "smile_closed" }]]` adds timed overrides (beats).
- `"enter": "13.deer"`, `"exit": "14.die"` set visibility.
- `"appear": "16.Five"` (or `{ "at": "...", "stagger": 0.1 }`) pops the actor in; stagger is seconds.
- `"facing": "camera" | "left" | "right" | degrees`; degrees become a yaw.
- `"at"`/`"nudge"` place an actor by mark; `"pos"` accepts any point; `"motion"` accepts path/ballistic with the same
  string anchors.

A row expands left-to-right around the mark. `spacing` is metres between actors; `curve` is the chevron/arc depth
(0.15 gives the fixture's 0/.15/.3 offsets at 0.8 m spacing). `facing: "camera"` is the default.

## Effects, crowds and set pieces

Effects use the v1 kinds. `at` is an anchor; `pos` is a point (mark, world point or attachment). `dur` and `period` are
seconds in the board and frames in v1. `until`, `from`, `toAt` and `visible` anchors use strings.

Set pieces pass through with string anchors and seconds converted to frames where v1 is frame-based. Crowd layouts and
set-piece grids accept points and marks.

## Partial boards and previews

A board may set `"partial": true`; then every shot must have an explicit `"end"` anchor (e.g. `"end": "shot+2.4s"`).
The compiler writes the v1 shot `end`, so the selected ranges do not stretch across omitted shots.

- `fableon stills --project <dir> --shots S14,S27 --frames start,mid,end` renders only those ranges.
- `fableon render --project <dir> --shots S14,S27` renders only those clips.
- `fableon review --project <dir> --compare <fixture> --shots … --out sheet.jpg` writes the labelled side-by-side sheet
  (compiled left of each pair, comparison right; start/mid/end per shot).

## Measured composition checks (F3)

`fableon frames` (default) renders an object-ID coverage pass for every checked key and writes `frames.json` beside the
board. Each key lists checked frames, size, primary subject height/visibility/head box/eye line, blockers, context
items, errors and warnings; each finding carries a one-line fix hint. Use `--fast` for the old analytic path.

Settle frames are the first safe frame after a cut/glide/tilt; mid and end-2 follow, plus every 12 frames in long keys.
Checks are `subject hidden`, `subject too small/large` (size bands), `head cut`, `blocker`, `context missing`, the
speaker-off-screen warning and the measured eye-line warning. Semantic board keys are errors; hand-written v1 keys are
warnings. `with` context and `reaction` cutaways are part of the key contract.

## Strict schemas and model cards

`schema/authoring.schema.json` is closed: every effect kind, set piece, crowd, motion, animate value, special params
and camera form has its own definition. The only open object is the explicit `raw` escape hatch.

`fableon schema --project <dir> [--out file]` writes a per-project schema with enums for this board's cast ids and
groups, poses, expressions, props, specials, sets, lights, marks, effect variants and line numbers in anchor strings.
When the board has no `raw`, the per-project schema closes `raw` completely. This is the structured-output contract for
Phase 3.

`fableon catalog-card [--out file]` prints a compact plain-text catalog (sets/marks, poses, expressions, props,
specials with params, effects with key params, set pieces and measured sizes) under 12 KB for director prompts.

## Escape hatch

A shot, actor or effect may carry a `"raw": { …v1 fields… }` object. It is merged after the compiled fields and is
validated as v1 by `fableon validate`. Raw is intended for fields the authoring layer does not yet express; the
compiler reports the number of raw escapes.

Camera keys in this commit (F3) are explicit v1 keys through raw:

```jsonc
"camera": [{ "raw": { "at": "6.Problem", "type": "dolly", "pos": {...}, "look": {...}, "fov": 40 } }]
```

The semantic camera solver is added in F4 and documented below when enabled.

## Semantic camera keys (F4 solver)

```jsonc
{
  "at": "5.Her",
  "cut": true,
  "size": "close",
  "on": ["kunti"],
  "angle": "eye",
  "side": "front",
  "move": "push",
  "punch": "5.king",
  "roll": 4,
  "glide": 0.8
}
```

`size` is `close`, `medium`, `full`, `wide`, `establishing` or `insert`. `on` lists cast/moving ids or one mark.
`angle` is `eye`, `low`, `high` or `overhead`; `side` is `front`, `left`, `right`, `frontLeft` or `frontRight`
relative to the set's `front`; `move` is `push`, `hold`, `glide`, `tiltUp`, `tiltDown`, `follow` or `crane`.

Constants as implemented (`cli/src/solver.js`):

| size | default fov | coverage | push rate | DOF |
|---|---:|---|---:|---:|
| close | 37 | 2.4 head heights | 0.003 | 13 |
| medium | 39 | 0.62 standing heights | 0.0025 | 11 |
| full | 41 | 1.12 standing heights | 0.0022 | 8 |
| wide | 45 | subject box + 30 % | 0.002 | 0 |
| establishing | 48 | set bounds | 0.0018 | 0 |
| insert | 35 | 0.8 m around the mark | 0.0025 | 11 |

- Both frame directions fit: horizontal fov = `2·atan(tan(vfov/2)·9/16)`; distance is the larger of the vertical and
  horizontal fits.
- Eye line: close/medium eye height at 40 % from the top (the look point is `span·0.10` below the eyes).
- Angles: eye = subject eye height; low = 45 % of body height; high = 2.5-4 m above; overhead = 8 m above.
- `hold` settles at rate 0.0015. `punch` adds 0.006 over 30 frames at that anchor. `glide`/`crane` use a 0.8 s key
  transition; `tiltUp`/`tiltDown` compile to a v1 tilt key.
- Subjects must be visible at the key start. A key frames the union of a moving subject's positions sampled every 6
  frames over its active span. An invisible subject is a compile error; `"later": ["kunti"]` waits for its first
  visible frame inside the key (use rarely). Effects with an id (e.g. pigeon) are subjects too and use their catalog
  `measure` entry.
- `follow` requires a moving id and compiles camera `pos`/`look` as Points relative to that id.
- Occlusion: rays to every subject's head and chest are sampled against the set's keep-out volumes. The fallback order
  is camera yaw `+15`, `-15`, `+30`, `-30`; then raise 1 m; then move 15 % closer and widen fov to keep coverage. A
  camera inside a volume is treated as blocked. If all fail: `no clear view of <id> at <anchor>`.
#### Size bands and context (F4)

Sizes are screen targets: close head 40-60 %, medium head 26-42 %, full body 50-85 %, wide primary 15-50 % (others
>=10 %), establishing listed subjects >=5 %, insert target 30-85 %. The solver centres the primary subject in its band.

`"with": ["palace.tree"]` adds context that must be in frame; `"ride": "boat"` makes an actor's feet follow a moving set
piece (plus `nudge`), so the boat path is not duplicated. `"reaction": true` marks a deliberate off-screen cutaway.
Marks carry a derived `view` heading; `side` is relative to it.

## Validator contract (F3)

`fableon frames` / `validate --deep` fail on: a listed subject invisible for more than six checked frames; an
unmarked key with no subjects (`"scenery": true` is the explicit intent for establishing, transition or effect-only
keys); a subject head not fully in frame or projected height > 3x frame; a visible non-subject actor/special/effect
card that covers > 30 % of the frame while in front of the primary subject, or is closer than 1.2 m. Deliberate
over-shoulder foreground (`over`, or a card whose centre is in a lower side corner) is exempt. Full fixture data only
adds `subjects`, `later`, and `scenery`.

### Composition grammar (F2)

- `"over": "<id>"` places that actor's head/shoulder large in the lower front corner (left/right per `side`) while
  `"on"` is framed by `size` behind it. The camera sits behind and beside the over actor; the over actor is exempt from
  the foreground-blocker check.
- `"third": "left" | "right"` offsets the look point by one sixth of the coverage width so the primary subject sits on
  a vertical third (look room).
- `"to": "<id or mark>"` with `move: "tiltUp" | "tiltDown" | "pan"` becomes a v1 tilt key whose `lookTo` is the target's
  eye (or mark position); `move: "reveal"` compiles to two keys: the start framing at the key anchor and the target
  framing at `glide` seconds later, with the v1 glide transition.
- `size: "insert"` on a mark/prop frames the mark tightly (0.8 m). New marks: `arena.bowstand`, `arena.target`,
  `palace.tree`, `lac.house`, `village.hutDoor`, `city.palace` (plus the existing prop marks).
- Occlusion fallback applies to all of these.
- The solver writes `type`, `pos`, `look`, `fov`, `roll`, `push`/`tilt`, the default DOF entry and `subjects` on the
  v1 camera key.
