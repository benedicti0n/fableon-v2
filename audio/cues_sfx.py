# Cue-driven SFX: deterministic renders for the eight kinds the sound stage emits.
import json
import os
import numpy as np
from dsp import SR, TAU, ns, tt, rng, lp, hp, bp, phase, pan, place, fades, modal, colored
import instruments as I

PROJECT = os.environ.get("PROJECT_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "fixtures", "adi-parva"))
CUES = json.load(open(os.path.join(PROJECT, "cues.json")))
WORDS = json.load(open(os.path.join(PROJECT, "words.json")))
PLAN = json.load(open(os.path.join(PROJECT, "shotplan.json"))) if os.path.exists(os.path.join(PROJECT, "shotplan.json")) else {"shots": []}
DUR = float(CUES["duration"])
N = ns(DUR)
R = rng(4041)
bus = np.zeros((2, N))
amb_bus = np.zeros((2, N))


def m2f(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


def anchor(a):
    if a.startswith("f"):
        return int(a[1:]) / 30.0
    line, k = (int(x) for x in a.split(":"))
    hits = [w for w in WORDS if w["line"] == line]
    return hits[k]["a"] if k < len(hits) else 0.0


def whoosh(dur=0.45, up=True, bright=1.0):
    t = tt(dur)
    u = np.clip(t / dur, 0, 1)
    u = u if up else 1 - u
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    n = colored(len(t), R, -1.0)
    return (bp(n, 250, 1400) * (1 - u) + bp(n, 1300, 7000) * u) * e * 1.5 * bright


def thud(dur=0.35):
    t = tt(dur)
    return np.sin(phase(70 * (1 + 0.8 * np.exp(-t / 0.03)))) * np.exp(-t / 0.09) + lp(R.standard_normal(len(t)), 500) * np.exp(-t / 0.02) * 0.6


def poof():
    t = tt(0.35)
    return lp(R.standard_normal(len(t)), 260) * np.exp(-t / 0.09) * (1 - np.exp(-t / 0.005)) * 1.4 + thud() * 0.4


def pop():
    t = tt(0.14)
    return np.sin(phase(600 * (1 + 1.5 * np.exp(-t / 0.012)))) * np.exp(-t / 0.04) * 0.9


def shimmer():
    out = np.zeros(ns(0.9))
    for i in range(6):
        x = I.glock(2400 + 700 * R.uniform(), 0.4, R)
        k = ns(i * 0.06)
        out[k:k + len(x)] += x[: len(out) - k]
    return out


def steps():
    out = np.zeros(ns(1.0))
    t = 0.0
    for i in range(4):
        x = bp(R.standard_normal(ns(0.05)), 500, 2500) * np.exp(-tt(0.05) / 0.012) * 0.5
        k = ns(t)
        out[k:k + len(x)] += x[: len(out) - k]
        t += 0.22
    return out


def arrow():
    a = whoosh(0.28, up=True, bright=1.2)
    b = np.zeros(ns(0.22))
    b[: len(thud(0.22))] = thud(0.22) * 0.8
    return np.concatenate([a, b])


def flash_hit():
    a = whoosh(0.2, up=True, bright=1.4)
    b = I.cymbal(0.5, R, dur=1.1, bright=1.2)
    out = np.zeros(max(len(a), len(b)))
    out[: len(a)] += a
    out[: len(b)] += b
    return out


GEN = {"poof": poof, "shimmer": shimmer, "thud": thud, "whoosh": whoosh, "flashHit": flash_hit, "pop": pop, "arrow": arrow, "steps": steps}
PAN = {"poof": 0.0, "shimmer": 0.2, "thud": -0.1, "whoosh": 0.15, "flashHit": 0.0, "pop": 0.1, "arrow": 0.18, "steps": -0.15}
for cue in CUES.get("sfx", []):
    if cue.get("muted"):
        continue
    fn = GEN.get(cue["kind"])
    if not fn:
        continue
    old = R
    if cue.get("seed") is not None:
        R = rng(int(cue["seed"]))
    x = fn()
    R = old
    gain = 10 ** (float(cue.get("gainDb", 0)) / 20)
    place(bus, pan(x, PAN.get(cue["kind"], 0.0)), anchor(cue["at"]), 0.9 * gain)


def render():
    return bus[:, :N]


def scene_span(scene):
    shots = [s for s in PLAN.get("shots", []) if s.get("scene") == scene]
    if not shots:
        return 0.0, DUR
    a = anchor(shots[0]["start"])
    lines = {n for s in shots for n in s.get("lines", [])}
    ends = [w["b"] for w in WORDS if w["line"] in lines]
    b = max(ends) if ends else DUR
    return a, min(DUR, b + 0.15)


def ambience(kind, dur):
    n = ns(dur)
    t = tt(dur)
    if kind == "birds":
        n0 = colored(n, R, -0.5)
        return bp(n0, 1800, 6500) * (0.3 + 0.7 * (np.sin(TAU * 3.1 * t) ** 2)) * 0.8
    if kind == "wind":
        return lp(colored(n, R, -1.0), 900) * (0.5 + 0.5 * np.sin(TAU * 0.13 * t)) * 0.5
    if kind == "water":
        return bp(colored(n, R, -0.7), 300, 3000) * 0.45
    if kind == "night-insects":
        pulse = (np.sin(TAU * 5.5 * t) > 0.7).astype(float)
        return bp(colored(n, R, -0.2), 3200, 7000) * pulse * 0.45
    if kind == "fire":
        return (lp(colored(n, R, -0.2), 1200) * 0.35 + bp(colored(n, R, 0.2), 800, 5000) * 0.18)
    if kind == "village":
        return (lp(colored(n, R, -1.0), 500) * 0.28 + bp(colored(n, R, -0.4), 1200, 4000) * 0.08)
    if kind == "court-murmur":
        return lp(colored(n, R, -1.0), 700) * 0.3
    return np.zeros(n)


for sec in CUES.get("music", []):
    kind = sec.get("ambience")
    if not kind:
        continue
    a, b = scene_span(sec["scene"])
    if b <= a:
        continue
    t = a
    while t < b:
        dur = min(4.0, b - t)
        x = ambience(kind, dur)
        k = ns(t)
        m = min(len(x), N - k)
        if m > 0:
            amb_bus[:, k:k + m] += pan(x[:m], 0.0)[:, :m] if x.ndim == 1 else x[:, :m]
        t += dur


def render_ambience():
    gain = 10 ** (float((CUES.get("mix") or {}).get("ambienceDb", 0)) / 20)
    return amb_bus[:, :N] * gain
