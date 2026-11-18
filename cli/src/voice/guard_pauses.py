#!/usr/bin/env python3
"""Remove pauses that break the Hindi guard (before an auxiliary/postposition or after a determiner/intensifier).

Usage: guard_pauses.py <voice.wav> <words.json>
Edits the WAV in place, shifts the word times and prints one JSON line. Only runs for the final aligned take.
"""
import json
import os
import sys

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "audio"))
from dsp import read_wav, write_wav  # noqa: E402

AUX_POST = {"हुए", "है", "हैं", "था", "थी", "थे", "गया", "गई", "गए", "दिए", "दी", "दिया", "लिए", "का", "की", "के", "को", "में", "से", "ने", "पर"}
DET_INT = {"कोई", "बहुत", "एक", "हर", "यह", "वह", "इस", "उस"}
THRESHOLD = 10 ** (-45 / 20)
KEEP = 0.03


def clean(w):
    return str(w).strip("।,.;!?\"'“”‘’()[]{}")


def main():
    wav, words_path = sys.argv[1], sys.argv[2]
    x, sr = read_wav(wav)
    mono = x.mean(axis=0)
    frame = max(1, int(0.01 * sr))
    n = len(mono) // frame
    rms = np.sqrt(np.mean(mono[: n * frame].reshape(n, frame) ** 2, axis=1) + 1e-12)
    quiet = 20 * np.log10(rms + 1e-12) < -45
    runs, start = [], None
    for i, q in enumerate(quiet):
        if q and start is None:
            start = i
        elif not q and start is not None:
            runs.append((start * frame, i * frame))
            start = None
    if start is not None:
        runs.append((start * frame, n * frame))
    merged = []
    for a, b in runs:
        if merged and a - merged[-1][1] < int(0.05 * sr):
            merged[-1] = (merged[-1][0], b)
        else:
            merged.append((a, b))
    runs = merged
    words = json.load(open(words_path, encoding="utf-8"))
    cuts = []
    for a, b in sorted(runs, reverse=True):
        if b - a < int(0.12 * sr):
            continue
        mid = (a + b) / 2 / sr
        before = [w for w in words if w["b"] <= mid + 0.01]
        after = [w for w in words if w["a"] >= mid - 0.01]
        if not before or not after:
            continue
        prev, nxt = clean(before[-1]["w"]), clean(after[0]["w"])
        if nxt not in AUX_POST and prev not in DET_INT:
            continue
        keep = int(KEEP * sr)
        cut_start, cut_end = a + keep, b
        if cut_end - cut_start < int(0.02 * sr):
            continue
        m = min(int(0.01 * sr), cut_start, cut_end, x.shape[1] - cut_end)
        out = np.concatenate([x[:, : cut_start - m], (x[:, cut_start - m : cut_start] * (1 - np.linspace(0, 1, m)) + x[:, cut_end : cut_end + m] * np.linspace(0, 1, m)), x[:, cut_end + m :]], axis=1) if m > 0 else np.concatenate([x[:, :cut_start], x[:, cut_end:]], axis=1)
        x = out
        removed = (cut_end - cut_start) / sr
        for w in words:
            if w["a"] >= cut_start / sr:
                w["a"] = round(max(0, w["a"] - removed), 3)
                w["b"] = round(max(0, w["b"] - removed), 3)
        cuts.append({"before": prev, "after": nxt, "start": round(a / sr, 3), "removed": round(removed, 3)})
    write_wav(wav, x)
    json.dump(words, open(words_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps({"cuts": len(cuts), "removed": round(sum(c["removed"] for c in cuts), 3), "details": cuts[:12]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
