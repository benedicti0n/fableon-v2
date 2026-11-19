# Final cue-driven mix: voice unchanged, music +3 dB against a bed 12 LU under voice (ducked 4 dB), SFX -6 dB,
# master -14 LUFS and true peak <= -1.3 dBTP, exact cues.duration.
import json
import os
import numpy as np
from scipy import signal
from scipy.ndimage import minimum_filter1d, uniform_filter1d
from dsp import SR, ns, dbg, lp, read_wav, write_wav, integrated, momentary_max, true_peak, norm_to
import cues_score
import cues_sfx

PROJECT = os.environ.get("PROJECT_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "fixtures", "adi-parva"))
CUES = json.load(open(os.path.join(PROJECT, "cues.json")))
WORDS = json.load(open(os.path.join(PROJECT, "words.json")))
N = ns(float(CUES["duration"]))
OUT = os.path.join(PROJECT, "audio")
os.makedirs(OUT, exist_ok=True)

MIX = CUES.get("mix") or {}
v, sr = read_wav(os.path.join(PROJECT, "voice.wav"))
v = signal.resample_poly(v[0], 2, 1) if sr == 24000 else v[0]
voice = np.zeros((2, N))
voice[:, : min(N, len(v))] = v[:N]
Lv, Lvm = integrated(voice), momentary_max(voice)

music, _ = cues_score.render()
music = music[:, :N]
sfx = cues_sfx.render()[:, :N]

# speech mask: duck 4 dB under speech (40 ms attack / 250 ms release) so the bed sits 9 LU under the voice
duck = np.ones(N)
for a, b in [(w["a"], w["b"]) for w in WORDS]:
    duck[ns(a): ns(b)] = dbg(float(MIX.get("duckDb", -4)))
duck = lp(np.minimum(duck, 1.0), 4.0, 1)
music = norm_to(music * duck[None, :], Lv - 12 + 3, "integrated") * dbg(float(MIX.get("musicDb", 0)))
sfx = norm_to(sfx, Lvm, "momentary") * dbg(-6 + float(MIX.get("sfxDb", 0)))

mix = voice + music + sfx
mix = norm_to(mix, -14.0, "integrated")
for _ in range(3):
    up = np.abs(signal.resample_poly(mix, 4, 1, axis=-1)).max(axis=0).reshape(-1, 4).max(axis=1)[:N]
    need = np.minimum(1.0, dbg(-1.3) / np.maximum(up, 1e-9))
    g = minimum_filter1d(need, ns(0.005), origin=0)
    g = minimum_filter1d(g, ns(0.04))
    g = uniform_filter1d(g, ns(0.002))
    mix = mix * g[None, :]
print(f"mix {integrated(mix):.1f} LUFS, TP {true_peak(mix):.2f} dBTP, music {integrated(music):.1f}, voice {Lv:.1f}, len {mix.shape[1] / SR:.3f}s")
write_wav(os.path.join(OUT, "mix.wav"), mix)
write_wav(os.path.join(OUT, "stem_music.wav"), music)
write_wav(os.path.join(OUT, "stem_sfx.wav"), sfx)
write_wav(os.path.join(OUT, "stem_voice.wav"), voice)
