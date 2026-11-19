# Original cue-driven score: tanpura drone, sitar-like plucks, flute, tabla, music box and stingers.
# Reads cues.json + words.json + shotplan.json; writes one stereo bed of exactly cues.duration seconds.
import json
import os
import numpy as np
from dsp import SR, TAU, ns, tt, rng, lp, bp, phase, modal, pan, place, fades, norm_to
import instruments as I

PROJECT = os.environ.get("PROJECT_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "fixtures", "adi-parva"))
CUES = json.load(open(os.path.join(PROJECT, "cues.json")))
WORDS = json.load(open(os.path.join(PROJECT, "words.json")))
PLAN = json.load(open(os.path.join(PROJECT, "shotplan.json")))
DUR = float(CUES["duration"])
N = ns(DUR)
R = rng(3017)
SA = 50
MAJ = [0, 2, 4, 5, 7, 9, 11]
KAFI = [0, 2, 3, 5, 7, 9, 10]
MOODS = {"calm": (MAJ, 0.9), "warm": (MAJ, 1.0), "tense": (KAFI, 1.2), "dark": (KAFI, 0.8), "wonder": (MAJ, 0.8), "triumph": (MAJ, 1.25)}


def m2f(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


def deg(d, scale):
    o, k = divmod(d, 7)
    return SA + 12 * o + scale[k]


def anchor(a: str) -> float:
    if a.startswith("f"):
        return int(a[1:]) / 30.0
    line, k = (int(x) for x in a.split(":"))
    hits = [w for w in WORDS if w["line"] == line]
    return hits[k]["a"] if k < len(hits) else (hits[-1]["b"] if hits else 0.0)


def scene_span(scene: str):
    shots = [s for s in PLAN.get("shots", []) if s.get("scene") == scene]
    if not shots:
        return 0.0, DUR
    a = anchor(shots[0]["start"])
    lines = {n for s in shots for n in s.get("lines", [])}
    ends = [w["b"] for w in WORDS if w["line"] in lines]
    b = max(ends) if ends else DUR
    return a, min(DUR, b + 0.15)


def tanpura(f, dur, vel, r):
    t = tt(dur)
    y = np.zeros_like(t)
    for k in range(1, 20):
        a = (1 / k ** 0.9) * (1 + 1.1 * (k > 4) * np.exp(-((t - 0.22) / 0.35) ** 2))
        y += a * np.exp(-t / (2.2 / (1 + 0.08 * k))) * np.sin(TAU * f * k * (1 + 1.5e-4 * k) * t + r.uniform(0, TAU))
    return fades(lp(y, 3000) * vel / 6, 0.002, 0.35)


def flute(f, dur, vel, r, slide=0.0):
    n = ns(dur + 0.1)
    t = np.arange(n) / SR
    vib = 1 + 0.006 * np.sin(TAU * 5.2 * t) * np.clip((t - 0.2) / 0.25, 0, 1)
    g = 2 ** ((slide * np.exp(-t / 0.07)) / 12)
    ph = phase(f * vib * g)
    y = np.sin(ph) + 0.2 * np.sin(2 * ph) + 0.05 * np.sin(3 * ph)
    breath = bp(r.standard_normal(n), 1200, 5000) * 0.08
    env = np.clip(t / 0.05, 0, 1) * np.clip((dur + 0.1 - t) / 0.1, 0, 1)
    return (y + breath) * env * vel * 0.45


def dayan(f, vel, r):
    return modal(0.4, [(f, 1.0, 0.10), (f * 2, 0.55, 0.07), (f * 3.1, 0.3, 0.05)], r) * vel * 0.65


def bayan(vel, r):
    t = tt(0.55)
    f = 82 * (1 + 0.35 * np.exp(-t / 0.08))
    y = np.sin(phase(f)) * np.exp(-t / 0.25) + 0.35 * np.sin(2 * phase(f)) * np.exp(-t / 0.1)
    return fades(y * vel * 0.8, 0.001, 0.04)


def tabla(t0, t1, tempo, vel, scale, r, sparse=False):
    step = 60 / tempo / 2
    t = t0
    i = 0
    pat = ["dha", "ge", "na", "ti", "na", "ke", "dhi", "na"]
    while t < t1:
        k = pat[i % 8]
        if not (sparse and i % 2):
            if k in ("dha", "dhi"):
                place(score["tabla"], pan(dayan(m2f(deg(0, scale)), vel, r), 0.15), t)
                place(score["tabla"], pan(bayan(vel * 0.8, r), -0.15), t)
            elif k == "ge":
                place(score["tabla"], pan(bayan(vel, r), -0.15), t)
            elif k in ("na", "ti"):
                place(score["tabla"], pan(dayan(m2f(deg(0, scale)), vel * 0.7, r), 0.18), t)
            else:
                place(score["tabla"], pan(dayan(m2f(deg(2, scale)), vel * 0.45, r), 0.22), t)
        t += step
        i += 1


music = np.zeros((2, N))
score = {"drone": np.zeros((2, N)), "lead": np.zeros((2, N)), "flute": np.zeros((2, N)), "tabla": np.zeros((2, N)), "fx": np.zeros((2, N))}


CUR_GAIN = 1.0


def add(bus, x, at, p=0.0, gain=1.0):
    y = pan(x, p) if np.asarray(x).ndim == 1 else x
    place(bus, y * gain * CUR_GAIN, at)


for sec in CUES.get("music", []):
    if sec.get("muted"):
        continue
    CUR_GAIN = 10 ** (float(sec.get("gainDb", 0)) / 20)
    a, b = scene_span(sec["scene"])
    if b <= a:
        continue
    scale, mood_gain = MOODS.get(sec.get("mood"), (MAJ, 1.0))
    tempo = float(sec.get("tempo", 100))
    intensity = float(sec.get("intensity", 0.5))
    inst = set(sec.get("instruments", []))
    vel = (0.35 + 0.5 * intensity) * mood_gain
    if "tanpura" in inst:
        t = a
        seq = [SA - 5, SA, SA, SA - 12]
        i = 0
        while t < b:
            add(score["drone"], tanpura(m2f(seq[i % 4]), min(3.6, b - t + 0.2), 0.42 * vel, R), t, [-0.3, 0.1, 0.2, -0.1][i % 4])
            t += 0.95
            i += 1
    if "pad" in inst:
        t = a
        while t < b:
            n = ns(min(4.0, b - t + 0.4))
            tt_ = np.arange(n) / SR
            f = m2f(SA - 12)
            x = (np.sin(TAU * f * tt_) + 0.4 * np.sin(TAU * f * 1.5 * tt_)) * np.clip(tt_ / 0.8, 0, 1) * np.clip((n / SR - tt_) / 0.8, 0, 1)
            add(score["drone"], x * 0.08 * vel, t)
            t += 3.2
    if "sitar" in inst:
        t = a + (60 / tempo) * 0.5
        i = 0
        while t < b:
            if i % 2 == 0:
                add(score["lead"], I.pluck(m2f(deg([0, 2, 4, 5, 4, 2][i % 6], scale)), 0.5 * vel, R, dur=0.8, bright=0.65), t, 0.18)
            t += 60 / tempo
            i += 1
    if "flute" in inst:
        t = a + (60 / tempo) * 2
        i = 0
        while t < b - 0.6:
            d = min(1.2, b - t)
            add(score["flute"], flute(m2f(deg([4, 5, 7, 6, 5, 4, 2, 0][i % 8], scale)), d, 0.42 * vel, R, slide=-0.5 if i % 3 == 0 else 0), t, -0.2)
            t += (60 / tempo) * 2
            i += 1
    if "tabla" in inst:
        tabla(a + 0.15, b - 0.1, tempo, 0.42 * vel, scale, R, sparse=intensity < 0.5)
    if "musicbox" in inst:
        t = a + (60 / tempo) * 3
        i = 0
        while t < b - 0.2:
            add(score["fx"], I.musicbox(m2f(deg([4, 7, 9, 7][i % 4], scale) + 12), 0.32 * vel, R), t, -0.25)
            t += (60 / tempo) * 4
            i += 1
    if "glock" in inst:
        t = a + (60 / tempo) * 2
        while t < b - 0.2:
            add(score["fx"], I.glock(m2f(deg(4, scale) + 12), 0.22 * vel, R), t, 0.2)
            t += (60 / tempo) * 4
    if "timpani" in inst:
        t = a + 0.2
        while t < b - 0.4:
            add(score["fx"], I.timpani(m2f(SA - 12), 0.35 * vel, R), t, 0.0)
            t += (60 / tempo) * 4
    CUR_GAIN = 1.0

# stingers: short, story-shaped motifs at the model's anchors
STING = {
    "hook": ([0, 2, 4, 7], 0.55, "sitar"),
    "mystery": ([4, 3, 2, 0], 0.42, "box"),
    "payoff": ([0, 4, 7, 12], 0.5, "glock"),
}
STING_GAIN = 10 ** (float((CUES.get("mix") or {}).get("stingerDb", 0)) / 20)
CUR_GAIN = STING_GAIN
for s in CUES.get("stingers", []):
    if s.get("muted"):
        continue
    t = anchor(s["at"])
    if t >= DUR:
        continue
    notes, vel, kind = STING.get(s["kind"], STING["hook"])
    for i, d in enumerate(notes):
        at = t + i * 0.16
        if at >= DUR:
            break
        f = m2f(deg(d, MAJ) + 12)
        if kind == "sitar":
            add(score["lead"], I.pluck(f, vel, R, dur=0.7, bright=0.65), at, 0.15)
        elif kind == "box":
            add(score["fx"], I.musicbox(f * 2, vel, R), at, -0.2)
        else:
            add(score["fx"], I.glock(f, vel, R), at, 0.2)
    if s["kind"] == "hook":
        add(score["tabla"], pan(bayan(0.5, R), 0), t)
    if s["kind"] == "payoff":
        add(score["fx"], I.timpani(m2f(SA - 12), 0.45, R), t)
CUR_GAIN = 1.0

music = score["drone"] + score["lead"] + score["flute"] + score["tabla"] + score["fx"]


def render():
    return music[:, :N], score
