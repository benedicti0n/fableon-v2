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

## Escape hatch

A shot, actor or effect may carry a `"raw": { …v1 fields… }` object. It is merged after the compiled fields and is
validated as v1 by `fableon validate`. Raw is intended for fields the authoring layer does not yet express; the
compiler reports the number of raw escapes.

Camera keys in this commit (F3) are explicit v1 keys through raw:

```jsonc
"camera": [{ "raw": { "at": "6.Problem", "type": "dolly", "pos": {...}, "look": {...}, "fov": 40 } }]
```

The semantic camera solver is added in F4 and documented below when enabled.
