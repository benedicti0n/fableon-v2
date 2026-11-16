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
- `"facing": "camera" | "left" | "right" | degrees`; degrees become a yaw. Prefer `face` (below) for screen direction.
- `"face": "deer"` (actor id, mark or fx id) resolves per camera key into `facing`/`look`/`mirror` so the body/eyes and aim props point at the target; a cut to the other side flips it. It is also valid inside a `do` beat. `over` uses it automatically on the `on` subject.
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
- `fableon review --project <dir> --compare <fixture> --coverage --split --out <dir>` writes one row per camera key
  (settle frame and key end-2, never a crossfade) with compiled / comparison / coverage columns, `review.json`, and
  one `--split` image per shot at most 1600 px tall.

## Measured composition checks

`fableon frames` (default) renders an object-ID coverage pass for every checked key and writes `frames.json` beside the
board. Each key lists checked frames, size, primary subject height/visibility/head box/eye line, blockers, context
items, errors and warnings; each finding carries a one-line fix hint. Use `--fast` for the old analytic path.

Settle frames are the first safe frame after a cut/glide/tilt; mid and end-2 follow, plus every 12 frames in long keys.
Checks include `subject hidden` (<60 % visible), `subject too small/large` (screen bands), `edge` (4 % side/2 % top
head margin, silhouette top includes headwear), `head cut`, `blocker` (>12 % frame or >25 % overlap with the primary
and at least 1 % area), `context missing`, `looks away`, `merge`, `edge intruder`, the editing rules below, the
speaker-off-screen warning and the measured eye-line warning. Semantic board keys are errors; hand-written v1 keys are
warnings. Ambient effect kinds and mark proxies are exempt from blockers; the `over` actor is exempt in its corner.

Editing rules: `jump cut` (same primary/size and <30 degrees side/angle), `key too short` (<18 frames), `first key late`
(the first key must be at the shot start; a subject entering within 0.5 s counts as present), `glide with cut` (compile
error), `action off-screen` (a non-subject beat/enter/exit/appear under 4 %; mark `"offscreen": true`), and `flat wide`
(a single wall/ground/water/sky >55 % in a wide/establishing frame).

`frames.json` is written once at `<project>/frames.json` (never `qa/`). It contains `coverageMs`, `keys[]` (shot, key, anchor, size,
primary, checked frames, subject summaries, errors, warnings) and flat `errors`/`warnings`/`rows` arrays. Every finding
has `code`, `subject`, `message` and a one-line `fix`; this is the Phase 3 repair-loop input.

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

## Semantic camera keys

```jsonc
{
  "at": "5.Her",
  "cut": true,
  "size": "medium",
  "on": ["kunti"],
  "with": ["palace.tree"],
  "angle": "eye",
  "side": "front",
  "move": "push",
  "fov": 45,
  "reaction": false,
  "punch": "5.king",
  "roll": 4,
  "glide": 0.8
}
```

`size` is `close`, `medium`, `full`, `wide`, `establishing` or `insert`. `on` lists cast/moving ids or one mark.
`angle` is `eye`, `low`, `high` or `overhead`; `side` is `front`, `left`, `right`, `frontLeft` or `frontRight`
relative to the subject mark's `view`; `move` is `push`, `hold`, `glide`, `tiltUp`, `tiltDown`, `follow` or `crane`.
`fov` overrides the size's default lens. `reaction: true` marks a deliberate off-screen cutaway (speaker warning
suppressed). `with` is context that must be in frame but is not a subject:

```jsonc
{ "at": "21.Bhima", "size": "wide", "on": ["kidBhima"], "with": ["palace.tree"] }
```

A `with` item may be a mark, set-piece id, effect id or actor id. The solver frames a mark's world `box` while keeping
the primary in its band; if impossible it fails `cannot frame <with> at size <size>`. Context coverage uses the mark's
own `ids` (e.g. mango trunk + canopy), not a proxy alias. A fire effect must carry an `id` (e.g. `"forestFire"`).

### Screen targets (calibrated)

Sizes are **screen targets**, not a request to fit. `head` is the head-box height / frame height; `body` is the top of
the head to the feet / frame height. The solver aims the primary subject at the band centre; other listed subjects
only need the floor.

| size | metric | band | floor | centre |
|---|---|---:|---:|---:|
| close | head | 25–60 % | 25 % | 26.2 % |
| medium | head | 12–42 % | 12 % | 15.8 % |
| full | body | 30–85 % | 30 % | 33.8 % |
| wide | body, primary | 15–50 % | 15 % | 23.8 % |
| wide | body, other subjects | — | 10 % | — |
| establishing | body, listed subjects | ≥ 5 % | 5 % | set bounds |
| insert | fill | 55–90 % | 55 % | 72.5 % |

The targets are the reference film's per-class medians; the floors were calibrated against its acted keys (the original
synthetic floors rejected all six close and 8/9 medium keys). If the key's subjects cannot all reach the floor inside 9:16, compile
fails with `group too wide for a vertical frame (<width> m)`; split the key, pan, curve the row or reduce spacing. The
solver never shrinks silently.

### Two-plane over, thirds, targets

- `"over": "<id>"` puts that actor's head fully in the lower-left/right third (per `side`), head height 18–30 %, facing
  the `on` subject; the subject sits in the opposite upper third at its band. Both heads stay in the safe area. The over
  actor is exempt from hidden/blocker checks while it stays in its corner. Do not list it in `on`.
- `"third": "left" | "right"` offsets the look point by one sixth of the coverage width (look room).
- `"to": "<id or mark>"` with `move: "tiltUp" | "tiltDown" | "pan"` becomes a v1 tilt key whose `lookTo` is the target's
  eye (or mark position); `move: "reveal"` compiles to two keys: the start framing at the anchor and the target framing
  at `glide` seconds later.
- `size: "insert"` frames a mark's world `box` by fill (55-90 %); a long flat prop like the 5.2 m bow fits without a
  `fov` override. Mark boxes exist for `palace.tree`, `arena.bow`, `arena.pole`, `lac.house`, `city.forest` and related
  marks.
- The solver writes `type`, `pos`, `look`, `fov`, `roll`, `push`/`tilt`, the default DOF entry and `subjects` on the
  v1 camera key.

### Ride and follow

`"ride": "boat"` on an actor makes its feet follow the moving set piece, offset by `nudge`; this replaces a duplicated
actor path (S5). The actor's id becomes a moving target, so a camera key `"move":"follow"` on it tracks the boat. A
camera may also follow a moving set-piece id directly. A `ride` target without a motion is a compile error.

### Mark views

Every catalog mark has `view`: the camera heading that puts the set's characteristic background behind the subject.
It was derived as the median heading of fixture camera keys whose look point is within 4 m of the mark, with two
measured corrections (`lac.house` 180°, `city.agni` 172°). `side` is relative to this view; the full table is in the
Phase 2E report (`docs/reports/phase-2e.md`).

### Occlusion and validation

- Both frame directions fit: horizontal fov = `2·atan(tan(vfov/2)·9/16)`; distance is the larger of the vertical and
  horizontal fits, plus a safe-area margin. Eye line: close/medium eyes at 40 % from the top.
- Angles: eye = subject eye height; low = 45 % of body height; high = 2.5–4 m above; overhead = 8 m above.
- `hold` settles at rate 0.0015. `punch` adds 0.006 over 30 frames at that anchor. `glide`/`crane` use a 0.8 s key
  transition; `tiltUp`/`tiltDown` compile to a v1 tilt key.
- Subjects must be visible at the key start. A key frames the union of a moving subject's positions sampled every 6
  frames over its active span. An invisible subject is a compile error; `"later": ["kunti"]` waits for its first
  visible frame inside the key (use rarely). Effects with an id (e.g. pigeon) are subjects too and use their catalog
  `measure` entry.
- Occlusion: rays to every subject's head and chest are sampled against the set's keep-out volumes. The fallback order
  is camera yaw `+15`, `-15`, `+30`, `-30`; then raise 1 m; then move 15 % closer and widen fov to keep coverage. A
  camera inside a volume is treated as blocked. If all fail: `no clear view of <id> at <anchor>`.
- `fableon frames` / `validate --deep` are the measured contract: size bands, hidden subjects, head cuts, blockers,
  `with` context, the speaker rule and eye line. Each finding carries a fix hint in `frames.json`.
