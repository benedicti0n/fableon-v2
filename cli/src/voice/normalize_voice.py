#!/usr/bin/env python3
"""Normalize a voice take to -16 LUFS integrated with a -1.5 dBTP ceiling, without changing timing.

Used by the voice stage for Sarvam takes (48 kHz native). Writes the same path and prints one JSON line with the
before/after loudness, true peak, clipped-sample count and sample rate.
"""
import json
import os
import sys

import numpy as np
from scipy import signal
from scipy.ndimage import minimum_filter1d, uniform_filter1d

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "audio"))
from dsp import SR, dbg, integrated, ns, read_wav, true_peak, write_wav  # noqa: E402

TARGET_LUFS = -16.0
TARGET_TP = -1.5


def limit(v, target_tp=TARGET_TP):
    for _ in range(3):
        up = np.abs(signal.resample_poly(v, 4, 1, axis=-1)).max(axis=0).reshape(-1, 4).max(axis=1)[: v.shape[1]]
        need = np.minimum(1.0, dbg(target_tp - 0.15) / np.maximum(up, 1e-9))
        g = minimum_filter1d(need, ns(0.005), origin=0)
        g = minimum_filter1d(g, ns(0.04))
        g = uniform_filter1d(g, ns(0.002))
        v = v * g[None, :]
    return v


def main():
    path = sys.argv[1]
    x, sr = read_wav(path)
    before_lufs, before_tp = integrated(x), true_peak(x)
    if sr != SR:
        x = signal.resample_poly(x, SR, sr, axis=-1)
        sr = SR
    x = x * dbg(TARGET_LUFS - integrated(x))
    x = limit(x)
    if abs(integrated(x) - TARGET_LUFS) > 0.15:
        x = x * dbg(TARGET_LUFS - integrated(x))
        x = limit(x)
    x = np.clip(x, -1.0, 1.0)
    clipped = int(np.sum(np.abs(x) >= 0.999999))
    write_wav(path, x)
    print(json.dumps({
        "path": path,
        "sampleRate": sr,
        "beforeLufs": round(float(before_lufs), 2),
        "beforeTruePeak": round(float(before_tp), 2),
        "afterLufs": round(float(integrated(x)), 2),
        "afterTruePeak": round(float(true_peak(x)), 2),
        "clippedSamples": clipped,
    }))


if __name__ == "__main__":
    main()
