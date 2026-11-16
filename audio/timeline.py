# Picture timeline for the sound (read-only mirror of src/videos/adi/story.ts): word anchors from voice/words.json,
# the shot list exported by the engine (audio/shots.json), and every on-screen event the sound must hit.
import json, os
import numpy as np

PROJECT = os.environ.get("PROJECT_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "fixtures", "adi-parva"))
FPS = 30
WORDS = json.load(open(os.path.join(PROJECT, "words.json")))
SHOTS = json.load(open(os.path.join(PROJECT, "shots.json")))  # [id, a, b, light, sets] (exported by `engine/scripts/render.cjs list`)
END_F = round(WORDS[-1]["b"] * FPS)
TOTAL = END_F + 36            # same as story.ts
DUR = TOTAL / FPS


def _norm(s):
    return "".join(c for c in s.lower() if c.isalpha() or c == "'")


def A(line, word, nth=0):
    """time (s) where `word` of script line `line` starts (frame-quantised like story.ts)"""
    c = [w for w in WORDS if w["line"] == line and _norm(w["w"]) == _norm(word)]
    return max(0, round(c[nth]["a"] * FPS)) / FPS


def K(line, word, nth=0):
    return max(0.0, A(line, word, nth) - 2 / FPS)


def line_start(line):
    return min(w["a"] for w in WORDS if w["line"] == line)


def hh(i, s=0):
    v = np.sin(i * 127.1 + s * 311.7) * 43758.5453
    return v - np.floor(v)


# speech activity (for ducking): word spans merged across small gaps
SPEECH = []
for w in WORDS:
    a, b = max(0.0, w["a"]), w["b"]
    if SPEECH and a - SPEECH[-1][1] < 0.25:
        SPEECH[-1][1] = max(SPEECH[-1][1], b)
    else:
        SPEECH.append([a, b])

SHOT_START = {s[0]: s[1] / FPS for s in SHOTS}
CUTS = [s[1] / FPS for s in SHOTS[1:]]
LIGHT_AT = [(s[1] / FPS, s[2] / FPS, s[3], s[4]) for s in SHOTS]
FLASH = K(1, "Vyasa")
