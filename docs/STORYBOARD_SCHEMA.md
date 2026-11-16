# Storyboard schema (draft — finalized in Phase 2)

The storyboard is the contract between the director model and the renderer. The model writes only this JSON and may
only use names that exist in the catalog. Code validates it (schema, catalog names, word anchors, shot order, in-frame
check) and feeds errors back to the model.

```jsonc
{
  "version": 1,
  "fps": 30,
  "cast": {                                   // who appears, built from catalog outfits/specs
    "kunti": { "base": "woman", "outfit": { "sari": "#6a4fb5", "top": "#c8342e", "border": "gold", "head": "long" } },
    "ganesha": { "special": "ganesha", "mirror": true }
  },
  "shots": [
    {
      "id": "s14",
      "start": { "line": 14, "word": "Conveniently" },   // cut lands 2 frames before this word
      "set": "forest.clearing",                         // catalog set + named spot
      "light": "day",                                    // day | golden | night | deep (+ optional sun override)
      "camera": [
        { "at": { "line": 14, "word": "Conveniently" }, "shot": "medium", "on": ["kunti", "pandu"], "angle": "eye", "move": "push" },
        { "at": { "line": 14, "word": "chant" }, "shot": "close", "on": ["kunti"], "move": "glide", "roll": 4 }
      ],
      "dof": "medium",                                   // off | soft | medium | strong
      "cast": [
        { "who": "kunti", "mark": "A", "pose": "stand", "expr": "smile",
          "beats": [{ "at": { "line": 14, "word": "chant" }, "pose": "pray", "expr": "smile_closed" }] },
        { "who": "pandu", "mark": "B", "pose": "stand", "expr": "nervous", "facing": "kunti",
          "beats": [{ "at": { "line": 14, "word": "sons" }, "expr": "grin" }] }
      ],
      "fx": [{ "kind": "halo", "on": "kunti", "at": { "line": 14, "word": "chant" } }],
      "sfx": [{ "kind": "magic", "at": { "line": 14, "word": "chant" } }],
      "music": "playful",
      "transition": "cut"                                // cut | crossfade | flash
    }
  ]
}
```

Catalog entries (examples): sets `palace.courtyard`, `palace.ghat`, `village.front`, `village.hut`, `hermitage.hut`,
`forest.clearing`, `lac.house`, `arena.dais`, `arena.pole`, `city.clearing`, `naga.floor`; actions `walk_to`, `run_to`,
`pop_from(container)`, `fall_from(height)`, `throw(target)`, `rise_from_ground`, `appear(puff)`, `shake(target)`,
`lie_flat`; fx `petals`, `sparkle`, `halo`, `emblem(name)`, `fire(spots)`, `splash`, `bubbles`, `stars`, `burst`,
`pigeon`; sfx `whoosh`, `pop`, `clay`, `ting`, `thud`, `boing`, `splash`, `gulp`, `fire`, `crowd`, `flap`, `burp`, …
