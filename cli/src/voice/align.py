#!/usr/bin/env python3
"""Local forced aligner for a known script and a rendered voice take.

Primary method: torchaudio MMS_FA (CTC) over uroman-romanised script words. The model emits at 50 Hz; the word
boundary is the first/last frame of its letters. A small frame-centre calibration (40 ms start and end) is applied;
it was measured on the Savitri ElevenLabs take against the character alignment (see docs/reports/phase-3e.md).

Fallback: Whisper word timestamps, matched to the script words with a dynamic-programming edit alignment.

Output: JSON {"words":[{w,a,b,line}], "method": "...", "warnings": [...]}. The caller keeps its provider timings when
this script fails; it never invents words.
"""
import argparse
import difflib
import json
import math
import sys
import unicodedata


def clean_token(text):
    """Trim punctuation around a script word but keep letters, marks, digits, apostrophes and hyphens."""
    out = []
    for ch in text:
        if ch.isalnum() or ch in "'-" or unicodedata.category(ch).startswith("M") or ch in "\u200d\u200c":
            out.append(ch)
    return "".join(out)


def script_words(path):
    data = json.load(open(path, encoding="utf-8"))
    words = []
    for line in data.get("lines", []):
        for token in str(line.get("text", "")).split():
            cleaned = clean_token(token)
            if cleaned:
                words.append({"w": token.strip("।,.;!?\"'“”‘’()[]{}"), "key": cleaned, "line": line.get("n", 0)})
    return words


def romanize(words, warnings):
    try:
        from uroman import Uroman

        u = Uroman()
        for w in words:
            w["roman"] = u.romanize_string(w["key"])
    except Exception as exc:  # pragma: no cover - optional dependency
        warnings.append(f"uroman unavailable ({exc}); using a built-in Devanagari transliteration")
        table = {
            "अ": "a", "आ": "aa", "इ": "i", "ई": "ii", "उ": "u", "ऊ": "uu", "ऋ": "ri", "ए": "e", "ऐ": "ai",
            "ओ": "o", "औ": "au", "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh",
            "ज": "j", "झ": "jh", "ञ": "n", "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t",
            "थ": "th", "द": "d", "ध": "dh", "न": "n", "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
            "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh", "ष": "sh", "स": "s", "ह": "h", "ळ": "l",
            "क़": "q", "ख़": "kh", "ग़": "g", "ज़": "z", "ड़": "r", "ढ़": "rh", "फ़": "f", "य़": "y",
            "ा": "aa", "ि": "i", "ी": "ii", "ु": "u", "ू": "uu", "ृ": "ri", "े": "e", "ै": "ai", "ो": "o",
            "ौ": "au", "ं": "n", "ँ": "n", "ः": "h", "्": "", "़": "",
        }
        for w in words:
            w["roman"] = "".join(table.get(ch, "") for ch in w["key"])


def norm_romanian(text):
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return "".join(ch for ch in text.lower() if "a" <= ch <= "z" or ch == "'")


def load_wave(path, sample_rate):
    import soundfile as sf
    import torch
    import torchaudio

    raw, sr = sf.read(path, dtype="float32", always_2d=True)
    wave = torch.from_numpy(raw.mean(axis=1, keepdims=True).T.copy())
    if sr != sample_rate:
        wave = torchaudio.functional.resample(wave, sr, sample_rate)
    return wave


def mms_align(wav_path, words, warnings):
    import torch
    import torch.nn.functional as F
    from torchaudio.pipelines import MMS_FA as bundle

    labels = bundle.get_labels()
    label_to_index = {c: i for i, c in enumerate(labels)}
    targets, spans = [], []
    for w in words:
        tokens = [label_to_index[c] for c in norm_romanian(w.get("roman", "")) if c in label_to_index and c != "-"]
        if not tokens:
            warnings.append(f"no MMS tokens for \"{w['key']}\"; interpolated")
            spans.append(None)
            continue
        spans.append((len(targets), len(targets) + len(tokens)))
        targets.extend(tokens)
    if not targets:
        raise ValueError("MMS aligner has no targets")

    wave = load_wave(wav_path, bundle.sample_rate)
    model = bundle.get_model()
    with torch.inference_mode():
        emissions, _ = model(wave)
    log_probs = F.log_softmax(emissions, dim=-1)
    aligned, _scores = torchaudio_forced_align(log_probs, torch.tensor([targets]), blank=0)
    path = aligned[0].tolist()
    # forced_align returns the frame -> label path; group equal labels and map them back to target indices.
    frame_target, ti, last = [], 0, -1
    for label in path:
        if label == 0:
            frame_target.append(-1)
            last = -1
            continue
        if label == last:
            frame_target.append(max(0, ti - 1))
            continue
        if ti < len(targets) and targets[ti] == label:
            frame_target.append(ti)
            ti += 1
        else:
            k = ti
            while k < len(targets) and targets[k] != label:
                k += 1
            frame_target.append(k if k < len(targets) else -1)
            ti = k + 1
        last = label
    seconds_per_frame = wave.shape[1] / emissions.shape[1] / bundle.sample_rate
    start_cal, end_cal = 0.040, 0.040
    for w, span in zip(words, spans):
        if span is None:
            w["a"] = w["b"] = None
            continue
        a, b = span
        frames = [i for i, t in enumerate(frame_target) if a <= t < b]
        if not frames:
            w["a"] = w["b"] = None
            continue
        w["a"] = max(0.0, min(frames) * seconds_per_frame - start_cal)
        w["b"] = max(w["a"] + 0.02, (max(frames) + 1) * seconds_per_frame - end_cal)
    return "mms-fa"


def torchaudio_forced_align(log_probs, targets, blank=0):
    import torchaudio

    return torchaudio.functional.forced_align(log_probs, targets, blank=blank)


def whisper_align(wav_path, words, warnings):
    import whisper

    model = whisper.load_model("base")
    result = model.transcribe(wav_path, language="hi", word_timestamps=True, initial_prompt=" ".join(w["key"] for w in words[:20]))
    heard = []
    for segment in result.get("segments", []):
        for item in segment.get("words", []):
            key = norm_romanian(item.get("word", ""))
            if key:
                heard.append({"key": key, "a": float(item["start"]), "b": float(item["end"])})
    if not heard:
        raise ValueError("Whisper returned no word timestamps")
    # The heard words may merge/split script words; match on romanised similarity.
    n, m = len(heard), len(words)
    gap = 0.8
    inf = float("inf")
    dp = [[inf] * (m + 1) for _ in range(n + 1)]
    back = [[None] * (m + 1) for _ in range(n + 1)]
    dp[0][0] = 0.0

    def sim(a, b):
        return difflib.SequenceMatcher(None, a, b).ratio()

    for i in range(n + 1):
        for j in range(m + 1):
            cur = dp[i][j]
            if cur == inf:
                continue
            if i < n and j < m:
                cost = cur + (0.0 if heard[i]["key"] == norm_romanian(words[j].get("roman", "")) else 1 - sim(heard[i]["key"], norm_romanian(words[j].get("roman", ""))))
                if cost < dp[i + 1][j + 1]:
                    dp[i + 1][j + 1], back[i + 1][j + 1] = cost, ("pair", i, j)
            if i < n and cur + gap < dp[i + 1][j]:
                dp[i + 1][j], back[i + 1][j] = cur + gap, ("skip_heard", i, j)
            if j < m and cur + gap < dp[i][j + 1]:
                dp[i][j + 1], back[i][j + 1] = cur + gap, ("skip_word", i, j)
    i, j, pairs = n, m, []
    while i or j:
        op, pi, pj = back[i][j]
        if op == "pair":
            pairs.append((pi, pj))
            i, j = pi, pj
        elif op == "skip_heard":
            i, j = pi, pj
        else:
            i, j = pi, pj
    pairs.reverse()
    for h, w in pairs:
        words[w]["a"], words[w]["b"] = heard[h]["a"], heard[h]["b"]
    matched = {w for _, w in pairs}
    warnings.append(f"Whisper matched {len(matched)}/{len(words)} words; unmatched times interpolated")
    return "whisper"


def fill_gaps(words, duration):
    for i, w in enumerate(words):
        if w.get("a") is not None:
            continue
        p = i - 1
        while p >= 0 and words[p].get("a") is None:
            p -= 1
        n = i + 1
        while n < len(words) and words[n].get("a") is None:
            n += 1
        lo = words[p]["b"] if p >= 0 else 0.0
        hi = words[n]["a"] if n < len(words) else duration
        count = n - p - 1
        k = i - p - 1
        span = max(0.02, (hi - lo) / max(1, count))
        w["a"] = lo + k * span
        w["b"] = min(hi, w["a"] + span * 0.8)
    for i, w in enumerate(words):
        if i and w["a"] < words[i - 1]["b"] - 0.001:
            w["a"] = words[i - 1]["b"]
        if w["b"] <= w["a"]:
            w["b"] = w["a"] + 0.02


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--wav", required=True)
    parser.add_argument("--script", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--method", default="auto", choices=["auto", "mms", "whisper"])
    args = parser.parse_args()
    words = script_words(args.script)
    if not words:
        raise SystemExit("align: the script has no words")
    warnings = []
    romanize(words, warnings)
    method = args.method
    try:
        if method in ("auto", "mms"):
            used = mms_align(args.wav, words, warnings)
        else:
            used = whisper_align(args.wav, words, warnings)
    except Exception as exc:
        if method == "mms":
            raise
        warnings.append(f"MMS aligner failed ({type(exc).__name__}: {exc}); trying Whisper")
        used = whisper_align(args.wav, words, warnings)
    try:
        import soundfile as sf

        duration = sf.info(args.wav).duration
    except Exception:
        duration = max(w.get("b") or 0 for w in words)
    fill_gaps(words, duration)
    out = [{"w": w["key"], "a": round(w["a"], 3), "b": round(w["b"], 3), "line": w["line"]} for w in words]
    json.dump({"words": out, "method": used, "warnings": warnings}, open(args.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"align: {len(out)} words via {used}" + (f" ({len(warnings)} warning(s))" if warnings else ""), file=sys.stderr)


if __name__ == "__main__":
    main()
