# Narration for the Adi Parva short: Kokoro TTS, one voice, one steady speed, one sentence per line of SCRIPT.md.
# Writes voice/voice.wav (24 kHz mono) and voice/words.json: [{"w": word, "a": start_s, "b": end_s, "line": i}, ...].
# Sanskrit names get explicit phonemes (misaki US alphabet) so they are never dropped or guessed.
# usage: PROJECT_DIR=<dir> python voice/make_voice.py [speed] [voice]
#   reads <dir>/SCRIPT.md (## Script section) and <dir>/pronunciations.json, writes <dir>/voice.wav + <dir>/words.json
import json, os, re, sys, numpy as np, soundfile as sf
from kokoro import KPipeline

SPEED = float(sys.argv[1]) if len(sys.argv) > 1 else 1.2
VOICE = sys.argv[2] if len(sys.argv) > 2 else "am_michael"
SR = 24000
PROJECT = os.environ.get("PROJECT_DIR", ".")
PRON = json.load(open(os.path.join(PROJECT, "pronunciations.json"), encoding="utf-8")) if os.path.exists(os.path.join(PROJECT, "pronunciations.json")) else {}
# pause after each line (s): the reference voice barely pauses; a little more at beat changes
GAP = 0.06
BEAT_GAP = 0.26

src = open(os.path.join(PROJECT, "SCRIPT.md"), encoding="utf-8").read()
lines = [l.strip() for l in re.search(r"## Script[^\n]*\n(.*?)\n## ", src, re.S).group(1).splitlines() if l.strip()]
BEATS = {4, 12, 17, 20, 24, 26, 29, 32, 34, 36}  # line indices that open a new beat (longer pause before)

def marked(line: str) -> str:
    def sub(m):
        w = m.group(0)
        return f"[{w}](/{PRON[w]}/)" if w in PRON else w
    return re.sub(r"[A-Z][a-z]+(?:'s)?", sub, line)

pipe = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
out, words, t = [], [], 0.0
for i, line in enumerate(lines):
    if i in BEATS and out:
        out.append(np.zeros(int((BEAT_GAP - GAP) * SR), np.float32)); t += BEAT_GAP - GAP
    chunk, toks = [], []
    for r in pipe(marked(line), voice=VOICE, speed=SPEED):
        base = sum(len(c) for c in chunk) / SR
        chunk.append(r.audio.numpy().astype(np.float32))
        for tk in r.tokens or []:
            if tk.start_ts is None or not re.search(r"[A-Za-z0-9]", tk.text):
                continue
            toks.append((tk.text, base + tk.start_ts, base + tk.end_ts))
    a = np.concatenate(chunk)
    # trim leading/trailing silence of the line (keeps a 40 ms margin), shift word times accordingly
    env = np.abs(a) > 0.01
    i0 = max(0, int(np.argmax(env)) - int(0.04 * SR)); i1 = min(len(a), len(a) - int(np.argmax(env[::-1])) + int(0.04 * SR))
    a = a[i0:i1]
    for w, s0, s1 in toks:
        words.append({"w": w, "a": round(t + s0 - i0 / SR, 3), "b": round(t + s1 - i0 / SR, 3), "line": i})
    out.append(a); t += len(a) / SR
    out.append(np.zeros(int(GAP * SR), np.float32)); t += GAP
    print(f"{i:2d} {t:6.2f}s  {line[:70]}", flush=True)
audio = np.concatenate(out)
sf.write(os.path.join(PROJECT, "voice.wav"), audio, SR)
json.dump(words, open(os.path.join(PROJECT, "words.json"), "w"), indent=0)
n = sum(len(l.split()) for l in lines)
print(f"total {len(audio) / SR:.2f}s, {n} words, {n / (len(audio) / SR):.2f} w/s, speed {SPEED}, voice {VOICE}")
