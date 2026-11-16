# Original score for the Adi Parva short (own synthesis, no samples): a tanpura-like drone (Pa-Sa-Sa-Sa cycle with
# jawari buzz), a plucked-string lead (sitar-like: bright partials, a small upward slide on each note), a bansuri-like
# flute (breathy sine with vibrato and slides), a tabla-like keherwa groove (dayan "na/tin", bayan "ge" with its pitch
# bend, dry "ke"), music-box sparkles on the magic beats and timpani on the impacts. Key of D (Sa = D), 100 bpm.
# Sections follow the story beats (timeline.py anchors), and the arrangement thins out under dense narration.
import numpy as np
from dsp import SR, TAU, ns, tt, rng, lp, hp, bp, colored, fades, phase, modal, pan, st, place, widen, make_ir, convolve_st, dbg, write_wav, norm_to
import instruments as I
import timeline as T

N = ns(T.DUR + 1.0)
BEAT = 0.6
R = rng(108)
SA = 50  # MIDI of Sa (D3)
MAJ = [0, 2, 4, 5, 7, 9, 11]      # bilawal
KAFI = [0, 2, 3, 5, 7, 9, 10]     # kafi (darker: night / fire)


def deg(d, scale=MAJ, base=SA + 12):
    o, k = divmod(d, 7)
    return base + 12 * o + scale[k]


# ---------------------------------------------------------------- instruments
def tanpura_note(f, dur=3.2, vel=0.5, r=None):
    r = r or R
    t = tt(dur)
    y = np.zeros_like(t)
    for k in range(1, 22):
        # jawari: the upper partials swell a little after the pluck, then die
        a = (1 / k ** 0.9) * (1 + 1.2 * (k > 4) * np.exp(-((t - 0.25) / 0.35) ** 2))
        y += a * np.exp(-t / (2.2 / (1 + 0.08 * k))) * np.sin(TAU * f * k * (1 + 1.5e-4 * k) * t + r.uniform(0, TAU))
    y = lp(y, 3200)
    return fades(y * vel * (1 - np.exp(-t / 0.004)) / 6, 0.002, 0.4)


def sitar(f, dur=0.7, vel=0.6, r=None, slide=0.6):
    r = r or R
    t = tt(dur + 0.6)
    # meend: start a little below and slide into the note
    g = 2 ** ((-slide * np.exp(-t / 0.05)) / 12)
    ph = phase(f * g)
    y = np.zeros_like(t)
    for k in range(1, 26):
        a = (1 / k ** 0.75) * (0.6 + 0.4 * np.cos(k * 0.9))
        y += a * np.exp(-t / (0.9 / (1 + 0.12 * k))) * np.sin(k * ph + r.uniform(0, TAU))
    y += 0.25 * bp(r.standard_normal(len(t)), 2500, 6000) * np.exp(-t / 0.01)
    y = lp(y, 5200)
    return fades(y * vel * (1 - np.exp(-t / 0.0015)) / 5, 0.0005, 0.15)


def flute(f, dur, vel=0.55, r=None, slide=0.0):
    r = r or R
    n = ns(dur + 0.12)
    t = np.arange(n) / SR
    vib = 1 + 0.006 * np.sin(TAU * 5.2 * t) * np.clip((t - 0.25) / 0.3, 0, 1)
    g = 2 ** ((slide * np.exp(-t / 0.08)) / 12)
    ph = phase(f * vib * g)
    y = np.sin(ph) + 0.22 * np.sin(2 * ph) + 0.06 * np.sin(3 * ph)
    breath = bp(r.standard_normal(n), 1200, 5000) * 0.09
    env = np.clip(t / 0.06, 0, 1) * np.clip((dur + 0.12 - t) / 0.12, 0, 1)
    return (y + breath) * env * vel * 0.5


def dayan(kind="na", vel=0.6, r=None):
    r = r or R
    f0 = I.m2f(SA + 12)  # tuned to Sa
    if kind == "na":
        y = modal(0.5, [(f0, 1.0, 0.12), (f0 * 2, 0.6, 0.09), (f0 * 3, 0.45, 0.07), (f0 * 4, 0.3, 0.05), (f0 * 5.2, 0.2, 0.03)], r)
    elif kind == "tin":
        y = modal(0.6, [(f0, 0.5, 0.25), (f0 * 2, 0.8, 0.2), (f0 * 3, 0.3, 0.12)], r) * 0.7
    else:  # ke / ti: dry slap
        t = tt(0.08)
        y = bp(r.standard_normal(len(t)), 900, 4000) * np.exp(-t / 0.012) * 1.4
    return fades(y * vel, 0.0005, 0.02)


def bayan(vel=0.6, r=None, bend=1.0):
    r = r or R
    t = tt(0.7)
    f = 82 * (1 + 0.35 * bend * np.exp(-t / 0.09))  # the "ge" pitch swoop
    y = np.sin(phase(f)) * np.exp(-t / 0.28) + 0.4 * np.sin(2 * phase(f)) * np.exp(-t / 0.12)
    y += lp(r.standard_normal(len(t)), 300) * np.exp(-t / 0.01) * 0.6
    return fades(y * vel, 0.001, 0.05)


# ---------------------------------------------------------------- arrangement
mus = {k: np.zeros((2, N)) for k in ("drone", "lead", "flute", "tabla", "fx")}


def drone(t0, t1, vel=0.42, scale_dark=False):
    seq = [SA - 5, SA, SA, SA - 12]  # Pa (A2), Sa, Sa, Sa (D2)
    t, i = t0, 0
    while t < t1:
        m = seq[i % 4]
        place(mus["drone"], pan(tanpura_note(I.m2f(m), 3.4, vel, R), [-0.3, 0.1, 0.2, -0.1][i % 4]), t)
        t += 0.95; i += 1


def keherwa(t0, t1, vel=0.5, sparse=False):
    """8-beat keherwa: Dha Ge Na Ti | Na Ke Dhi Na (8th notes at 100 bpm)"""
    step = BEAT / 2
    pat = [("dha", 1.0), ("ge", 0.6), ("na", 0.7), ("ti", 0.5), ("na", 0.7), ("ke", 0.5), ("dhi", 0.9), ("na", 0.6)]
    t, i = t0, 0
    while t < t1:
        k, v = pat[i % 8]
        if not (sparse and i % 2):
            v *= vel * (0.92 + 0.16 * T.hh(i, 4))
            if k in ("dha", "dhi"):
                place(mus["tabla"], pan(dayan("na" if k == "dha" else "tin", v, R), 0.15), t)
                place(mus["tabla"], pan(bayan(v * 0.9, R), -0.15), t)
            elif k == "ge":
                place(mus["tabla"], pan(bayan(v, R, 1.4), -0.15), t)
            elif k in ("na", "tin"):
                place(mus["tabla"], pan(dayan("na", v, R), 0.15), t)
            else:
                place(mus["tabla"], pan(dayan("ke", v, R), 0.25), t)
        t += step; i += 1


def phrase(notes, t0, inst="sitar", vel=0.6, scale=MAJ, base=SA + 12, p=0.0):
    """notes: (degree or None, beats) ... on the beat grid from t0"""
    t = t0
    for d, b in notes:
        if d is not None:
            f = I.m2f(deg(d, scale, base))
            if inst == "sitar":
                place(mus["lead"], pan(sitar(f, b * BEAT, vel, R), p), t)
            elif inst == "flute":
                place(mus["flute"], pan(flute(f, b * BEAT * 0.95, vel, R, slide=-0.7 if b >= 1 else 0.0), p), t)
            elif inst == "box":
                place(mus["fx"], pan(I.musicbox(f * 2, vel, R), p), t)
        t += b * BEAT
    return t


HOOK = [(0, .5), (2, .5), (4, .5), (5, .5), (4, .5), (2, .5), (1, .5), (0, 1.5)]          # Sa Ga Pa Dha Pa Ga Re Sa
HOOK2 = [(4, .5), (5, .5), (7, .5), (6, .5), (5, .5), (4, .5), (2, 1.0), (None, 1.0)]
FL_A = [(4, 1), (5, 1), (7, 2), (6, 1), (5, 1), (4, 2)]                                          # Pa Dha Sa' Ni Dha Pa
FL_B = [(2, 1), (4, 1), (5, 1.5), (4, .5), (2, 1), (1, 1), (0, 2)]
DARK = [(0, 1), (2, 1), (3, 2), (2, 1), (0, 1), (-2, 2)]                                         # kafi, low


def build():
    t_end = T.DUR
    L = T.line_start
    # drone all the way, softer under the night / underwater stretch
    drone(0.0, t_end - 0.5, 0.42)
    # 0. hook: plucked theme twice, light tabla (sparse under the dense opening narration)
    keherwa(0.25, L(4) - 0.2, 0.42, sparse=True)
    t = phrase(HOOK, 0.3, vel=0.55, p=0.2)
    t = phrase(HOOK2, t, vel=0.5, p=0.2)
    phrase(HOOK, L(3) + 0.3, vel=0.45, p=0.2)
    # 1. Shantanu / Bhishma: flute over drone + soft keherwa
    keherwa(L(4), L(12) - 0.3, 0.38, sparse=True)
    t = phrase(FL_A, L(4) + 0.2, "flute", 0.5, p=-0.2)
    t = phrase(FL_B, t + 0.6, "flute", 0.45, p=-0.2)
    phrase(FL_A, L(9) + 0.3, "flute", 0.55, p=-0.2)
    phrase(FL_B, L(10) + 0.6, "flute", 0.42, p=-0.2)
    # 2. Pandu / Kunti: plucked variation
    keherwa(L(12), L(17) - 0.2, 0.4)
    phrase(HOOK2, L(12) + 0.2, vel=0.45, p=0.2)
    phrase(HOOK, L(14) + 0.2, vel=0.45, p=0.2)
    phrase([(7, .5), (9, .5), (11, 1)], L(16), "box", 0.5)
    # 3. jars / cousins / tree: bouncy, full groove
    keherwa(L(17), L(23) - 0.2, 0.5)
    phrase(HOOK, L(18) + 0.2, vel=0.5, p=0.2)
    phrase(HOOK2, L(20), vel=0.5, p=0.2)
    phrase(HOOK, L(21) + 0.4, vel=0.5, p=0.2)
    # 4. snake kingdom: drone + music box, no tabla
    phrase([(4, 1), (7, 1), (9, 1), (7, 1), (11, 2)], L(23) + 0.2, "box", 0.45)
    # 5. lac house (night): dark kafi line, low plucks, bayan pulse
    t = L(24)
    while t < L(26) - 0.3:
        place(mus["tabla"], pan(bayan(0.55, R, 0.6), -0.1), t); t += BEAT * 2
    phrase(DARK, L(24) + 0.2, "sitar", 0.5, KAFI, SA, p=0.1)
    phrase(DARK, L(25) + 0.2, "flute", 0.4, KAFI, SA + 12, p=-0.2)
    # 6. the contest: driving groove, flute theme, arrival on "mark"
    keherwa(L(26), L(29) - 0.1, 0.6)
    phrase(FL_A, L(26) + 0.2, "flute", 0.55, p=-0.2)
    phrase(FL_B, L(27) + 0.1, "flute", 0.5, p=-0.2)
    # 7. home / share it / the pigeon: light plucks, comic
    keherwa(L(29), L(34) - 0.2, 0.42, sparse=True)
    phrase(HOOK, L(29) + 0.1, vel=0.5, p=0.2)
    phrase(HOOK2, L(31) + 0.2, vel=0.45, p=0.2)
    phrase([(0, .5), (None, .5), (-1, .5), (None, .5), (-3, 1)], T.A(32, "unsend"), "sitar", 0.5)  # a falling "oops"
    phrase(FL_B, L(33) + 0.2, "flute", 0.45, p=-0.2)
    # 8. city + Khandava fire: big flute over full groove, then kafi under the fire
    keherwa(L(34), L(35) - 0.1, 0.55)
    phrase(FL_A, L(34) + 0.1, "flute", 0.6, p=-0.2)
    t = L(35)
    while t < L(36) - 0.2:
        place(mus["tabla"], pan(bayan(0.6, R, 0.8), -0.1), t); place(mus["tabla"], pan(dayan("ke", 0.4, R), 0.2), t + BEAT); t += BEAT * 2
    phrase(DARK, L(35) + 0.2, "sitar", 0.55, KAFI, SA, p=0.1)
    # 9. back home with Vyasa: the hook, then the ending chord
    keherwa(L(36), T.END_F / 30 - 0.3, 0.38, sparse=True)
    phrase(HOOK, L(36) + 0.1, vel=0.55, p=0.2)
    end = T.END_F / 30 + 0.05
    for k, d in enumerate([0, 4, 7]):
        place(mus["lead"], pan(sitar(I.m2f(deg(d)), 1.6, 0.55, R), 0.2 - 0.2 * k), end + 0.04 * k)
    place(mus["fx"], pan(I.musicbox(I.m2f(deg(7)) * 2, 0.6, R), 0), end + 0.1)


def render():
    build()
    ir = make_ir(1.3, 7, hf=0.6)
    out = {}
    for k, x in mus.items():
        wet = convolve_st(x, ir)[:, : x.shape[1]]
        out[k] = x + {"drone": 0.25, "lead": 0.22, "flute": 0.3, "tabla": 0.12, "fx": 0.35}[k] * wet
    # balance inside the band (LU against each other)
    gains = {"drone": -9.0, "lead": -2.0, "flute": -3.0, "tabla": -4.0, "fx": -5.0}
    mix = np.zeros((2, N))
    for k, x in out.items():
        mix += norm_to(x, -20.0 + gains[k], "integrated") if np.abs(x).max() > 0 else x
    return mix, out


if __name__ == "__main__":
    m, parts = render()
    write_wav("music.wav", m * 0.5 / max(1e-9, np.abs(m).max()))
    print("music", m.shape[1] / SR, "s")
