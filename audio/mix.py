# Final mix for the Adi Parva short. House rule (skill): voice unchanged, music +3 dB, SFX -6 dB against the standard
# bed levels (music bed at voice -12 LU -> -9 LU, ducked 4 dB under speech; SFX events at voice-peak level -> -6 dB,
# ambience at voice -22 LU -> -28). Master: -14 LUFS integrated, true peak <= -1 dBTP, 48 kHz, exact picture length.
import os
import numpy as np
from scipy import signal
from dsp import SR, ns, read_wav, write_wav, integrated, momentary_max, true_peak, norm_to, dbg, st, lp
import timeline as T
import score, sfx

N = ns(T.DUR)
OUT = os.path.join(T.PROJECT, "audio"); os.makedirs(OUT, exist_ok=True)
v, sr = read_wav(os.path.join(T.PROJECT, "voice.wav"))
v = signal.resample_poly(v[0], 2, 1) if sr == 24000 else v[0]
voice = np.zeros((2, N)); voice[:, : min(N, len(v))] = v[: N]
Lv, Lvm = integrated(voice), momentary_max(voice)
print(f"voice {Lv:.1f} LUFS int, {Lvm:.1f} max momentary, {len(v) / SR:.2f}s")

music, _ = score.render()
music = music[:, :N]
# ducking: -4 dB while the narrator speaks (40 ms attack, 250 ms release)
duck = np.ones(N)
for a, b in T.SPEECH:
    duck[ns(a): ns(b)] = dbg(-4)
duck = lp(np.minimum(duck, 1.0), 4.0, 1)
music = norm_to(music * duck[None, :], Lv - 12 + 3, "integrated")  # bed sits 9 LU under the voice after ducking

_, bus = sfx.render()
hits = norm_to(bus["hit"][:, :N], Lvm, "momentary") * dbg(-6)
amb = norm_to(bus["amb"][:, :N], Lv - 22, "integrated") * dbg(-6)

mix = voice + music + hits + amb
mix = norm_to(mix, -14.0, "integrated")
# true-peak ceiling -1 dBTP: look-ahead brick-wall limiter (5 ms window min of the needed gain, 2 ms smoothing,
# 80 ms release), measured on 4x oversampled peaks; two passes
from scipy.ndimage import minimum_filter1d, uniform_filter1d
for _ in range(3):
    up = np.abs(signal.resample_poly(mix, 4, 1, axis=-1)).max(axis=0).reshape(-1, 4).max(axis=1)[:N]
    need = np.minimum(1.0, dbg(-1.3) / np.maximum(up, 1e-9))
    g = minimum_filter1d(need, ns(0.005), origin=0)
    g = minimum_filter1d(g, ns(0.04))
    g = uniform_filter1d(g, ns(0.002))
    mix = mix * g[None, :]
print(f"mix {integrated(mix):.1f} LUFS, TP {true_peak(mix):.2f} dBTP, music {integrated(music):.1f}, voice {Lv:.1f}, len {mix.shape[1] / SR:.3f}s")
write_wav(os.path.join(OUT, "mix.wav"), mix)
write_wav(os.path.join(OUT, "stem_music.wav"), music); write_wav(os.path.join(OUT, "stem_sfx.wav"), hits + amb); write_wav(os.path.join(OUT, "stem_voice.wav"), voice)
