# Render one 1.5 s SFX preview with a chosen seed and gain, without touching the project's mix.
import json, os, sys, tempfile
import numpy as np
from dsp import SR, ns, write_wav, rng

kind, seed, gain_db, out = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
tmp = tempfile.mkdtemp(prefix="fableon-sfx-preview-")
json.dump({"version": 1, "duration": 1.5, "music": [], "stingers": [], "sfx": []}, open(os.path.join(tmp, "cues.json"), "w"))
json.dump([], open(os.path.join(tmp, "words.json"), "w"))
os.environ["PROJECT_DIR"] = tmp
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cues_sfx
fn = cues_sfx.GEN.get(kind)
if not fn:
    raise SystemExit(f"unknown sfx kind {kind}")
cues_sfx.R = rng(seed)
x = np.asarray(fn(), float)
x = x[: ns(1.5)]
if len(x) < ns(1.5):
    x = np.pad(x, (0, ns(1.5) - len(x)))
x = x * (10 ** (gain_db / 20))
os.makedirs(os.path.dirname(out), exist_ok=True)
write_wav(out, np.vstack([x, x]))
print(json.dumps({"kind": kind, "seed": seed, "gainDb": gain_db, "file": out, "seconds": 1.5}))
