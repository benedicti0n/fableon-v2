#!/usr/bin/env python3
"""Voice QA: silence, pause guard, fragment-final pitch falls, clipping, bandwidth, lead-in and tail.

Usage: voice_qa.py <project-dir>
Writes <project>/voice-qa.json and <project>/voice-qa.md. Exit code 1 when a hard voice check fails.
"""
import json
import os
import sys

import numpy as np
from scipy import signal

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "audio"))
from dsp import integrated, read_wav, true_peak  # noqa: E402

AUX_POST = {"हुए", "है", "हैं", "था", "थी", "थे", "गया", "गई", "गए", "दिए", "दी", "दिया", "लिए", "का", "की", "के", "को", "में", "से", "ने", "पर"}
DET_INT = {"कोई", "बहुत", "एक", "हर", "यह", "वह", "इस", "उस"}
SILENCE_DB = -60.0
PAUSE_DB = -45.0
MIN_PAUSE = 0.12
MAX_SILENCE_SHARE = 0.08
MAX_LEAD = 0.10
MAX_TAIL = 0.30
MAX_TP = -1.5


def clean(w):
    return str(w).strip("।,.;!?\"'“”‘’()[]{}")


def quiet_seconds(x, sr, db=SILENCE_DB):
    frame = max(1, int(0.01 * sr))
    n = len(x) // frame
    rms = np.sqrt(np.mean(x[: n * frame].reshape(n, frame) ** 2, axis=1) + 1e-12)
    quiet = 20 * np.log10(rms + 1e-12) < db
    return float(np.sum(quiet) * 0.01)


def digital_zero_runs(x, sr):
    frame = max(1, int(0.01 * sr))
    n = len(x) // frame
    zero = np.all(np.abs(x[: n * frame].reshape(n, frame)) < 1e-9, axis=1)
    runs, start = [], None
    for i, q in enumerate(zero):
        if q and start is None:
            start = i
        elif not q and start is not None:
            runs.append((start, i))
            start = None
    if start is not None:
        runs.append((start, n))
    return [(round(a * 0.01, 3), round(b * 0.01, 3)) for a, b in runs if b - a >= 2]


def find_pauses(x, sr, db=PAUSE_DB):
    frame = max(1, int(0.01 * sr))
    n = len(x) // frame
    rms = np.sqrt(np.mean(x[: n * frame].reshape(n, frame) ** 2, axis=1) + 1e-12)
    quiet = 20 * np.log10(rms + 1e-12) < db
    runs, start = [], None
    for i, q in enumerate(quiet):
        if q and start is None:
            start = i
        elif not q and start is not None:
            runs.append((start, i))
            start = None
    if start is not None:
        runs.append((start, n))
    merged = []
    for a, b in runs:
        if merged and (a - merged[-1][1]) * 0.01 < 0.05:
            merged[-1] = (merged[-1][0], b)
        else:
            merged.append((a, b))
    return [{"start": round(a * 0.01, 3), "end": round(b * 0.01, 3), "seconds": round((b - a) * 0.01, 3)} for a, b in merged if (b - a) * 0.01 >= MIN_PAUSE]


def f0_frame(x, sr, lo=60, hi=400):
    if len(x) < 8:
        return None
    x = x - np.mean(x)
    if np.sqrt(np.mean(x * x)) < 1e-4:
        return None
    ac = np.fft.irfft(np.abs(np.fft.rfft(x, 2 * len(x))) ** 2)[: len(x)]
    if ac[0] <= 0:
        return None
    ac = ac / ac[0]
    a, b = int(sr / hi), int(sr / lo)
    if b >= len(ac):
        return None
    lag = a + int(np.argmax(ac[a:b]))
    return sr / lag if ac[lag] > 0.30 else None


def line_falls(x, sr, words, pauses):
    by_line = {}
    for w in words:
        by_line.setdefault(w["line"], []).append(w)
    lines = {}
    for n, ws in by_line.items():
        f0s = []
        for w in ws:
            a, b = int(w["a"] * sr), int(w["b"] * sr)
            for i in range(a, max(a, b - int(0.04 * sr)), int(0.01 * sr)):
                seg = x[i : i + int(0.04 * sr)]
                if len(seg) < int(0.02 * sr):
                    continue
                f = f0_frame(seg, sr)
                if f:
                    f0s.append(f)
        if f0s:
            lines[n] = float(np.median(f0s))
    falls = []
    for p in pauses:
        before = [w for w in words if w["b"] <= p["start"] + 0.01]
        after = [w for w in words if w["a"] >= p["end"] - 0.01]
        if not before or not after:
            continue
        b, a = before[-1], after[0]
        seg = x[max(0, int((p["start"] - 0.20) * sr)) : int(p["start"] * sr)]
        f0s = []
        for i in range(0, max(0, len(seg) - int(0.04 * sr)), int(0.01 * sr)):
            part = seg[i : i + int(0.04 * sr)]
            if len(part) < int(0.02 * sr):
                continue
            f = f0_frame(part, sr)
            if f:
                f0s.append(f)
        fall = bool(f0s and lines.get(b["line"]) and float(np.median(f0s)) < 0.85 * lines[b["line"]])
        falls.append({"pause": p["start"], "line": b["line"], "before": b["w"], "after": a["w"], "intraLine": b["line"] == a["line"], "fall": fall})
    return falls


def main():
    project = os.path.abspath(sys.argv[1])
    wav = os.path.join(project, "voice.wav")
    words_path = os.path.join(project, "words.json")
    if not os.path.exists(wav) or not os.path.exists(words_path):
        raise SystemExit("voice_qa: voice.wav and words.json are required")
    x, sr = read_wav(wav)
    x = x.mean(axis=0)
    words = json.load(open(words_path, encoding="utf-8"))
    duration = len(x) / sr
    pauses = find_pauses(x, sr, PAUSE_DB)
    silence = quiet_seconds(x, sr)
    perceptual = quiet_seconds(x, sr, PAUSE_DB)
    zeros = digital_zero_runs(x, sr)
    by_start = sorted(words, key=lambda w: w["a"])
    for p in pauses:
        mid = (p["start"] + p["end"]) / 2
        before = [w for w in by_start if w["b"] <= mid + 0.01]
        after = [w for w in by_start if w["a"] >= mid - 0.01]
        p["before"] = clean(before[-1]["w"]) if before else ""
        p["after"] = clean(after[0]["w"]) if after else ""
        p["guard"] = p["after"] in AUX_POST or p["before"] in DET_INT
    deliberate = [p for p in pauses if p["seconds"] >= 0.45]
    guard = [p for p in pauses if p["guard"]]
    clipped = int(np.sum(np.abs(x) >= 0.999999))
    tp = float(true_peak(x.reshape(1, -1)))
    # 99.9 % spectral-energy rolloff on a mono copy; a 24 kHz take cannot exceed 12 kHz.
    spec = np.abs(np.fft.rfft(x - np.mean(x)))
    freqs = np.fft.rfftfreq(len(x), 1 / sr)
    cum = np.cumsum(spec * spec)
    bandwidth = float(freqs[min(len(freqs) - 1, int(np.searchsorted(cum, 0.999 * cum[-1])))])
    lead = float(min(w["a"] for w in words))
    tail = float(duration - max(w["b"] for w in words))
    falls = line_falls(x, sr, words, pauses)
    intra = [f for f in falls if f["intraLine"]]
    errors = []
    warnings = []
    if silence / duration > MAX_SILENCE_SHARE: errors.append(f"silence {silence / duration * 100:.1f}% exceeds 8%")
    if zeros: errors.append(f"{len(zeros)} digital-zero run(s)")
    if clipped: errors.append(f"{clipped} clipped samples")
    if tp > MAX_TP: errors.append(f"true peak {tp:.2f} dBTP exceeds {MAX_TP:.1f}")
    if lead > MAX_LEAD: errors.append(f"lead-in {lead:.3f}s exceeds 0.1s")
    if tail > MAX_TAIL: errors.append(f"tail {tail:.3f}s exceeds 0.3s")
    if len(deliberate) > 3: errors.append(f"{len(deliberate)} deliberate pauses; at most 3")
    if guard: errors.append(f"{len(guard)} pause(s) break the Hindi guard")
    if intra and any(f["fall"] for f in intra): warnings.append(f"{sum(1 for f in intra if f['fall'])} natural intra-line pitch fall(s)")
    if perceptual / duration > MAX_SILENCE_SHARE: warnings.append(f"perceptual pauses {perceptual / duration * 100:.1f}% (natural prosody; digital silence is {silence / duration * 100:.1f}%)")
    if bandwidth < 15000: warnings.append(f"bandwidth {bandwidth:.0f} Hz is below 15 kHz")
    result = {
        "sampleRate": sr,
        "duration": round(duration, 3),
        "lufs": round(float(integrated(x.reshape(1, -1))), 2),
        "truePeak": round(tp, 2),
        "clippedSamples": clipped,
        "bandwidthHz": round(bandwidth, 1),
        "leadIn": round(lead, 3),
        "tail": round(tail, 3),
        "silenceSeconds": round(silence, 3),
        "silenceShare": round(silence / duration, 4),
        "perceptualSilenceShare": round(perceptual / duration, 4),
        "digitalZeroRuns": zeros,
        "pauseCount": len(pauses),
        "deliberatePauses": len(deliberate),
        "guardViolations": len(guard),
        "fragmentFinalFalls": sum(1 for f in intra if f["fall"]),
        "lineFinalFalls": sum(1 for f in falls if not f["intraLine"] and f["fall"]),
        "pauses": pauses,
        "errors": errors,
        "warnings": warnings,
        "ok": not errors,
    }
    json.dump(result, open(os.path.join(project, "voice-qa.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    md = [
        "# Voice QA",
        "",
        f"- file: `voice.wav`, {sr} Hz, {duration:.3f} s",
        f"- {result['lufs']:.2f} LUFS, true peak {tp:.2f} dBTP, {clipped} clipped sample(s)",
        f"- bandwidth (99.9% energy): {bandwidth:.0f} Hz",
        f"- lead-in {lead:.3f} s, tail after last word {tail:.3f} s",
        f"- digital silence (<{SILENCE_DB:.0f} dBFS): {silence:.2f} s ({silence / duration * 100:.1f}%); {len(zeros)} digital-zero runs",
        f"- perceptual pauses (<{PAUSE_DB:.0f} dBFS): {perceptual:.2f} s ({perceptual / duration * 100:.1f}%), {len(pauses)} pauses",
        f"- deliberate pauses (>=0.45 s): {len(deliberate)}; guard violations: {len(guard)}",
        f"- fragment-final pitch falls: {result['fragmentFinalFalls']}; line-final falls (natural): {result['lineFinalFalls']}",
        "",
        f"Verdict: {'PASS' if result['ok'] else 'FAIL'}",
        "",
        *[f"- ERROR: {e}" for e in errors],
        *[f"- WARN: {w}" for w in warnings],
        "",
        "| pause | before | after | seconds | guard |",
        "|---|---|---|---:|---|",
        *[f"| {p['start']:.2f} | {p['before']} | {p['after']} | {p['seconds']:.2f} | {'FAIL' if p['guard'] else 'ok'} |" for p in pauses],
        "",
    ]
    open(os.path.join(project, "voice-qa.md"), "w", encoding="utf-8").write("\n".join(md))
    print("\n".join(md[:12]))
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
