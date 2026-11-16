# Storyboard v1 — the contract between the director (human or model) and the renderer

A project's `storyboard.json` + `words.json` fully describe the film. The engine builds the same `ShotDef[]` objects that `engine/src/story.ts` builds by hand today (`world.ts` / `main.ts` do not change). Phase 2A/2B use explicit numbers (positions, camera points) so the Adi Parva timeline can be ported exactly; Phase 2C adds a semantic layer ("medium shot on X") that a framing solver compiles down to this v1 format.

The JSON Schema (`schema/storyboard.schema.json`) is the single source of truth: the CLI validates with it, and Phase 3 passes it to models as a structured-output schema. Anything not described here is not allowed (`additionalProperties: false`).

## Common types

### Anchor (a frame on the narration timeline)
```jsonc
{ "line": 13, "word": "deer" }                          // start frame of that word: max(0, round(a * fps))
{ "line": 1, "word": "Vyasa", "nth": 1, "offset": -2 }  // nth occurrence in the line (default 0); offset in frames (default 0)
{ "frame": 90 }                                         // absolute frame (use sparingly)
{ "end": true, "offset": 4 }                            // END = round(last word end * fps), plus offset
{ "shot": true, "offset": 24 }                          // current shot's start frame + 24 (in-shot only)
```
Word matching: lower-case, keep only letters and apostrophes (same `norm()` as story.ts). `K(line, word)` in story.ts is `{ "line": ..., "word": ..., "offset": -2 }`. A strict `f > A(...)` comparison becomes an inclusive anchor with `"offset": +1`. Prefer word anchors; use `"shot"` for time-based ramps that must move when the narration is re-voiced, and `"frame"` rarely.

### Point (a world position, metres)
```jsonc
[x, y, z]                                   // absolute
{ "at": "HERM", "d": [-1.15, 0.33, -0.25] } // relative to a named place (places.ts / catalog) or another named point
{ "at": "boat", "d": [0.8, 1.5, -4.2] }     // relative to a MOVING target (registered by a set action or an actor path)
{ "at": "AR", "d": [0, 1.35, -0.15], "screen": [0.45, 0, 0] } // + right/up/forward metres along the current camera axes
```

Named points can also be declared once per storyboard in "points" (e.g. "VY": {"at": "HERM", "d": [...]}) and reused.

### Motion (actors, effects and set pieces)
```jsonc
{ "type": "path", "keys": [[Anchor, Point], …], "ease": "linear", "walk": { "rate": 1.8, "offset": 0.3 }, "bob": { "amp": 0.05, "freq": 2 } }
{ "type": "ballistic", "at": Anchor, "v": [vx, vy, vz], "a": [ax, ay, az], "floorY": 0.4, "spin": 9 }
```
Path keys are clamped before/after; `walk.rate` is cycles per second and sets the actor's walk phase; `bob` adds `amp·sin(2π·freq·t)` on y. Ballistic position is `p0 + v·u + a·u²` with `u` seconds since `at` (p0 comes from the actor/effect `pos`), optionally clamped to `floorY` and spun. Any actor/effect/set piece with an `"id"` becomes a moving target that Points and camera keys can follow (`{"at": "pigeon"}`).

### Animated number
```jsonc
0.3                                                                                // constant
{ "keys": [[{ "frame": 90 }, 0.3], [{ "frame": 180 }, 0.4]], "ease": "linear" }    // clamped before/after
```
ease: linear | smooth (smoothstep) | glide (smootherstep) | step.

## Top level
```jsonc
{
  "version": 1,
  "fps": 30,
  "tailFrames": 36,                                         // TOTAL = END + tailFrames
  "flash": { "line": 1, "word": "Vyasa", "offset": -2 },   // optional 4-frame white flash (an Anchor)
  "crossfade": 10,                                          // frames, applied when consecutive shots differ in light
  "points": { "VY": { "at": "HERM", "d": [-1.15, 0.33, -0.25] } },
  "cast": { "vyasa": { "spec": "vyasa", "seed": 1 } },      // spec = castlist key (C.*, KIDS.*) or inline Spec object;
                                                            // seed = the identity number story.ts passes to who() (blink timing)
  "kicks": [{ "at": { "line": 8, "word": "vows" }, "amp": 0.6 }],
  "shots": [ /* Shot */ ]
}
```

## Shot
```jsonc
{
  "id": "L1",                         // unique; the script line it starts on is a good id
  "start": { "line": 1, "word": "Vyasa", "offset": -2 },    // first shot: { "frame": 0 }
  "legacy": false,                    // true = use the hand-written ShotDef from story.ts (migration only)
  "light": "golden",                  // day | golden | night | deep
  "sets": ["hermitage"],
  "sun": { "az": 115, "el": 18 },     // optional; default: hermitage shots get az 115 / el 18 (current rule), else the preset
  "camera": [ /* CamKey, in time order */ ],
  "dof": [{ "at": { "line": 1, "word": "Vyasa", "offset": -2 }, "cInf": 0 },
          { "at": { "line": 1, "word": "condition", "offset": -2 }, "cInf": 12, "dur": 0, "focus": null }],
  "actors": [ /* Actor */ ],
  "fx": [ /* Effect */ ],
  "set": [ /* SetAction */ ]
}
```
A shot runs from its `start` to the next shot's `start` (the last one to TOTAL). Shot starts are word anchors (`K(line, word)`), except the first shot which is `{ "frame": 0 }`.

## CamKey (the bridge short's camera grammar)
```jsonc
{
  "at": Anchor,                       // first key = shot start
  "cut": true,                        // hard cut; otherwise a glide of `dur` frames (default 24, smootherstep) from the previous key
  "dur": 24,
  "type": "dolly",                    // dolly | fixed | tilt
  "pos": Point, "look": Point, "fov": 40, "roll": 0,          // roll in radians
  "push": { "from": Anchor, "rate": 0.0025, "punch": 0.006, "punchAt": Anchor }   // dolly only (story.ts pushK / dolly)
  // tilt only: "lookTo": Point, "tiltDur": 26   (look glides from `look` to `lookTo` over tiltDur frames from `at`)
}
```
dolly: the camera slides toward `look` by pushK(f, push.from, push.rate) * pushK(f, punchAt, 0, punch, 30), exactly as story.ts dolly(). fixed: constant pos/look/fov/roll. Points may follow moving targets (e.g. {"at": "pigeon"}). Impact kicks (`kicks`) are applied on top, as kickCam does today.

## Actor
```jsonc
{
  "who": "vyasa",                     // cast id
  "id": null,                         // optional moving-target id (Point {"at": id} follows it)
  "special": null,                    // null = person(); or "ganesha" | "agni" | "deer" | "naga" | "baby" | "pot" | "flat"
  "params": {},                       // typed per special (see Catalog); ganesha: write, writeSpeed, puzzled, down, look, pen, ear, expr
  "pos": Point,                       // feet position; ballistic motion starts here
  "motion": null,                     // path or ballistic (see Motion)
  "animate": {},                      // numeric Spec fields animated over time, e.g. { "belly": Animated }
  "scale": 1, "mirror": false, "noBlob": false, "blobScale": 1, "yaw": null,
  "pose": "talk", "expr": "smile", "prop": null, "facing": 0, "look": 0, "seated": true, "headTilt": 0, "tilt": 0,
  "talk": null,                       // { "base": "smile", "rate": 1 } -> expr cycles grin/base/relief_open/base/grin/smile (story.ts talk())
  "appear": null,                     // { "at": Anchor, "pop": 0.18, "stagger": 0 } -> scale pops in (story.ts pop()); scale 0 before
  "visible": null,                    // { "from": Anchor, "to": Anchor }
  "beats": [                          // state changes, in time order; each overrides any field above from its frame on
    { "at": { "line": 1, "word": "never", "offset": -2 }, "talk": { "base": "nervous", "rate": 1.6 } }
  ]
}
```

## Effect (unlit cards; implemented kinds are sparkle, halo, knot, sweat, heart and petals)
```jsonc
{ "kind": "sparkle", "id": null, "motion": null, "at": Anchor, "pos": Point, "size": 0.35, "count": 4, "offsets": [[dx, dy, dz]], "pop": { "stagger": 0.12 }, "twinkle": { "freq": 9, "depth": 0.2 } }
{ "kind": "halo", "at": Anchor, "pos": Point, "size": 2.8, "pop": 0.4, "color": "#fff0a0", "card": "soft" }
{ "kind": "knot", "at": Anchor, "pos": Point, "size": 0.55, "pop": 0.18, "bob": 0.05 }
{ "kind": "sweat", "at": Anchor, "pos": Point, "count": 3, "rate": 0.8, "spread": 0.1, "drop": 0.5, "size": 0.12 }
{ "kind": "heart", "at": Anchor, "pos": Point, "size": 0.8, "pop": 0.18, "bob": { "amp": 0.1, "freq": 0.95 } }
{ "kind": "petals", "at": Anchor, "pos": Point, "count": 70, "spread": 7 }
// 2B adds: emblem(wheel|wind|bolt|horse), puff, stars, arrow(from,to), splash, bubbles, burst, fire(spots|treetops), smoke, pigeon(path), mango, lump ...
```

## SetAction (dynamic set pieces)
```jsonc
{ "piece": "pages", "height": 0.3 }   // Animated number; default 0.3 from schema/catalog.json defaults
{ "piece": "boat", "id": "boat",      // moving-target id; Points/cameras can follow it
  "motion": { "type": "path", … },    // path/ballistic (see Motion)
  "yaw": 0.15, "roll": 0, "rollBob": { "amp": 0.02, "freq": 0.318 } }
// 2B adds: jars(appear window, lid pops), wheel(spin, stopAt), city(rise), ladduPlate, nectar(drink window), bigBow(wobble)
```

## Rules the validator enforces (CLI `fableon validate`)
- Schema-valid; every who, spec, set, place, pose, expression, prop, effect kind and set piece exists in the catalog.
- Catalog entries are `{ name, status, description }`; entries with `"status": "planned"` are rejected with “not
  implemented yet”.
- Special `params` are typed by `special` (`additionalProperties: false`), so models cannot invent parameters.
- Set defaults (`defaults.sunBySet.hermitage`, `defaults.setPieces.pages.height`) live in `schema/catalog.json`; the
  interpreter reads them instead of hard-coding them.
- Every word anchor exists in words.json; shot starts strictly increase; camera keys and beats are in time order.
- `"shot": true` anchors are only valid inside a shot.
- Phase 2C adds: every actor named in a camera key's subjects is inside the frame at that key.
