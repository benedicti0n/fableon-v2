# Synthesized sound effects for the Adi Parva short (own synthesis, no samples), each anchored to the picture through
# timeline.py: stylus scratches, whooshes on the big cuts, pops, a sparkle, the crown's ting, timpani on the vow,
# petals, an arrow, a dust poof, the magic pings of the gods, a comic bonk, 101 clay jars and their lids, leaves and
# landings, the river splash, bubbles and gulps, a power-up, night crickets, fire, a crowd, the bow's thwack, footsteps,
# wing flaps, the "oops" bloop, a rising city, Agni's burp, and the dropped stylus. Ambience beds per place.
import numpy as np
from dsp import SR, TAU, ns, tt, rng, lp, hp, bp, colored, smooth_noise, fades, phase, modal, pan, st, place, widen, norm_to, curve, reson
import instruments as I
import timeline as T

N = ns(T.DUR + 1.0)
R = rng(2026)
bus = {k: np.zeros((2, N)) for k in ("hit", "amb")}
A, K, L = T.A, T.K, T.line_start


def mixin(base, x, at=0.0):
    """base += x starting at `at` seconds (different lengths are fine)"""
    k = ns(at)
    m = min(len(x), len(base) - k)
    if m > 0:
        base[k:k + m] += x[:m]
    return base


def add(x, t, gain_db=0.0, p=0.0, kind="hit"):
    x = np.asarray(x, float)
    place(bus[kind], pan(x, p) if x.ndim == 1 else x, t, 10 ** (gain_db / 20))


# ---------------------------------------------------------------- generators
def whoosh(dur=0.5, up=True, r=R):
    t = tt(dur)
    u = np.clip(t / dur, 0, 1)
    u = u if up else 1 - u
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    n = colored(len(t), r, -1.0)
    return (bp(n, 250, 1400) * (1 - u) + bp(n, 1400, 7000) * u) * e * 1.6


def scratch(r=R):
    t = tt(0.09)
    return bp(r.standard_normal(len(t)), 2500, 8000) * np.exp(-t / 0.03) * (1 - np.exp(-t / 0.004)) * 0.5


def pop(f=600, r=R):
    t = tt(0.12)
    return np.sin(phase(f * (1 + 1.5 * np.exp(-t / 0.012)))) * np.exp(-t / 0.035) * 0.9


def clay(f=420, r=R):
    return mixin(modal(0.25, [(f, 1.0, 0.05), (f * 2.3, 0.5, 0.03), (f * 3.9, 0.25, 0.02)], r), 0.3 * pop(f * 1.4, r))


def ting(f=2400, r=R):
    return modal(1.4, [(f, 1.0, 0.5), (f * 2.76, 0.5, 0.25), (f * 5.4, 0.25, 0.12)], r) * 0.6


def sparkle(n=6, r=R):
    out = np.zeros(ns(1.2))
    for i in range(n):
        x = ting(2600 + 900 * r.uniform(), r) * 0.5
        k = ns(i * 0.07)
        out[k:k + len(x)] += x[: len(out) - k]
    return out


def thud(f=70, r=R, dur=0.35):
    t = tt(dur)
    return (np.sin(phase(f * (1 + 0.8 * np.exp(-t / 0.03)))) * np.exp(-t / 0.09) + lp(r.standard_normal(len(t)), 500) * np.exp(-t / 0.02) * 0.6)


def boing(f=180, r=R):
    t = tt(0.6)
    g = 1 + 0.6 * np.sin(TAU * 9 * t) * np.exp(-t / 0.2)
    return np.sin(phase(f * g)) * np.exp(-t / 0.25) * 0.8


def splash(r=R, dur=1.4):
    t = tt(dur)
    body = bp(colored(len(t), r, -0.5), 300, 6000) * np.exp(-t / 0.35) * (1 - np.exp(-t / 0.01))
    drops = np.zeros_like(t)
    for i in range(40):
        k = ns(0.05 + r.uniform() ** 1.5 * (dur - 0.2))
        x = modal(0.06, [(900 + 1800 * r.uniform(), 1.0, 0.012)], r) * r.uniform(0.2, 0.6)
        drops[k:k + len(x)] += x[: len(drops) - k]
    return mixin(body * 1.3 + drops, thud(55, r, 0.4) * 0.6)


def bubbles(dur, rate=6, r=R):
    out = np.zeros(ns(dur))
    t = 0.0
    while t < dur - 0.2:
        f = 400 + 900 * r.uniform()
        x = np.sin(phase(f * (1 + 0.5 * tt(0.08) / 0.08))) * np.exp(-tt(0.08) / 0.03) * 0.35
        k = ns(t); out[k:k + len(x)] += x[: len(out) - k]
        t += r.exponential(1 / rate)
    return out


def gulp(r=R):
    t = tt(0.22)
    f = 180 + 120 * np.exp(-t / 0.05)
    return lp(np.sign(np.sin(phase(f))) * 0.4, 900) * np.exp(-t / 0.07) * (1 - np.exp(-t / 0.01))


def crickets(dur, r=R):
    t = tt(dur)
    y = np.zeros_like(t)
    for f0, rate, ph in [(4300, 2.1, 0.0), (4700, 1.7, 0.4), (3900, 2.6, 0.7)]:
        gate = (np.sin(TAU * rate * t + ph * 6) > 0.3) * (np.sin(TAU * 32 * t) > 0)
        y += np.sin(TAU * f0 * t) * lp(gate.astype(float), 200) * 0.12
    return y


def fire(dur, r=R):
    t = tt(dur)
    roar = lp(colored(len(t), r, -1.6), 700) * 0.8 * (0.8 + 0.2 * smooth_noise(len(t), r, 2))
    crack = np.zeros_like(t)
    for _ in range(int(dur * 14)):
        k = ns(r.uniform(0, dur - 0.05)); x = bp(r.standard_normal(ns(0.03)), 1500, 7000) * np.exp(-tt(0.03) / 0.006) * r.uniform(0.3, 1.0)
        crack[k:k + len(x)] += x[: len(crack) - k]
    return roar + crack


def crowd(dur, r=R, excite=None):
    """murmur from many band-passed noise voices with syllable-rate amplitude"""
    t = tt(dur)
    y = np.zeros_like(t)
    for i in range(10):
        v = bp(r.standard_normal(len(t)), 300 + 80 * i, 900 + 150 * i) * (0.5 + 0.5 * smooth_noise(len(t), r, 3 + i % 4)) ** 2
        y += v * 0.25
    if excite is not None:
        y *= excite(t)
    return y


def steps(dur, rate, r=R, f=900):
    out = np.zeros(ns(dur))
    k = 0.0
    while k < dur - 0.05:
        x = bp(r.standard_normal(ns(0.05)), f * 0.5, f * 3) * np.exp(-tt(0.05) / 0.012) * r.uniform(0.5, 1.0)
        i = ns(k); out[i:i + len(x)] += x[: len(out) - i]
        k += 1 / rate * r.uniform(0.85, 1.15)
    return out


def flap(r=R):
    t = tt(0.12)
    return bp(r.standard_normal(len(t)), 300, 2500) * np.sin(np.pi * t / 0.12) ** 2 * 0.8


def burp(r=R, dur=0.75):
    t = tt(dur)
    f0 = 95 - 25 * t / dur + 6 * smooth_noise(len(t), r, 18)
    ph = phase(f0)
    src = (np.sin(ph) > 0.6).astype(float) + 0.3 * r.standard_normal(len(t)) * 0.2
    y = reson(src, 420, 4) + 0.7 * reson(src, 900, 6) + 0.3 * reson(src, 2200, 8)
    env = np.clip(t / 0.03, 0, 1) * np.clip((dur - t) / 0.2, 0, 1) * (0.8 + 0.2 * np.sin(TAU * 7 * t))
    return lp(y, 3000) * env * 0.12


def rumble(dur, r=R):
    t = tt(dur)
    return lp(colored(len(t), r, -2.0), 160) * np.sin(np.pi * np.clip(t / dur, 0, 1)) * 1.5


def magic(dur=1.4, r=R, up=True):
    t = tt(dur)
    y = np.zeros_like(t)
    for k, m in enumerate([0, 4, 7, 12, 16]):
        f = I.m2f(74 + m)
        y += np.sin(TAU * f * t + k) * np.exp(-((t - 0.12 * k) / 0.3) ** 2) * 0.3
    sp = sparkle(5, r)[: len(y)]
    y[: len(sp)] += 0.4 * sp
    return y


def birds(dur, r=R):
    out = np.zeros(ns(dur))
    t = 0.3
    while t < dur - 0.5:
        n = r.integers(2, 5)
        for j in range(n):
            d = 0.07
            tt_ = tt(d)
            f = 3200 + 1200 * r.uniform() + 1500 * np.sin(np.pi * tt_ / d)
            x = np.sin(phase(f)) * np.sin(np.pi * tt_ / d) * 0.12
            k = ns(t + j * 0.11); out[k:k + len(x)] += x[: len(out) - k]
        t += r.uniform(1.0, 2.8)
    return out


def water_bed(dur, r=R):
    t = tt(dur)
    return bp(colored(len(t), r, -1.0), 200, 1800) * (0.6 + 0.4 * smooth_noise(len(t), r, 0.7)) * 0.6


# ---------------------------------------------------------------- the cue sheet
def build():
    # --- ambience beds by place (follow the shot list) ---
    for a, b, light, sets in T.LIGHT_AT:
        d = b - a + 0.3
        if "naga" in sets:
            add(lp(colored(ns(d), R, -2.0), 400) * 0.5, a, -8, kind="amb"); add(bubbles(d, 5), a, -6, kind="amb")
        elif light == "night":
            add(crickets(d), a, -14, kind="amb")
        elif "village" in sets or "palace" in sets:
            add(water_bed(d), a, -16, kind="amb"); add(birds(d), a, -10, R.uniform(-0.6, 0.6), kind="amb")
        elif "arena" in sets:
            add(crowd(d), a, -12, kind="amb")
        else:
            add(birds(d), a, -9, R.uniform(-0.6, 0.6), kind="amb")
    # --- whooshes on the place changes (centred on the cut) ---
    prev = None
    for a, b, light, sets in T.LIGHT_AT:
        if prev and (sets != prev[0] or light != prev[1]):
            add(whoosh(0.5, True), a - 0.25, -6, 0.0)
        prev = (sets, light)
    add(whoosh(0.4), T.FLASH - 0.2, -4); add(sparkle(4), T.FLASH, -8)
    # --- 0-3: the scribe ---
    t = 0.05
    while t < K(1, "Vyasa"):
        add(scratch(), t, -10, 0.2); t += 0.21 + 0.06 * R.uniform()
    t = K(1, "Vyasa")
    while t < K(1, "condition"):
        add(scratch(), t, -14, 0.2); t += 0.3 + 0.1 * R.uniform()
    add(ting(1800), A(1, "condition"), -12); add(ting(2400), A(2, "counter"), -12)
    add(boing(160), A(3, "knotty"), -6)
    add(scratch(), A(3, "drop"), -16)
    # --- 4-11: Shantanu, Devavrata, Bhishma ---
    add(pop(900), A(4, "falling"), -8); add(ting(3000), A(4, "falling") + 0.05, -14)
    add(sparkle(6), A(6, "perfect"), -8)
    add(ting(2100), A(7, "throne"), -8)
    add(I.timpani(73, 0.9, R), A(8, "vows"), -4); add(whoosh(0.35, False), A(8, "vows") - 0.15, -10)
    add(magic(1.6), A(9, "rain"), -8); add(sparkle(10), A(9, "flowers"), -10); add(ting(1600), A(9, "Bhishma"), -8)
    add(magic(1.2), A(10, "gift"), -10)
    add(whoosh(1.2, False), A(11, "see"), -10)
    # --- 13-16: deer, curse, gods, twins ---
    add(whoosh(0.3), A(13, "shoots"), -6); add(thud(140, R, 0.2), A(13, "deer"), -6); add(bp(colored(ns(0.6), R, -1), 300, 3000) * np.exp(-tt(0.6) / 0.15), A(13, "secretly"), -6)
    add(I.timpani(55, 0.8, R), A(13, "die"), -6)
    add(magic(1.8), A(14, "chant"), -7)
    for w in ("calls", "three", "gods"):
        add(ting(1500 + 400 * ("calls", "three", "gods").index(w)), A(15, w), -7); add(pop(700), A(15, w) + 0.2, -12)
    add(ting(2500), A(15, "second"), -9); add(ting(2800), A(15, "second") + 0.17, -9)
    add(pop(1000), A(15, "twins") + 0.07, -8); add(pop(1200), A(15, "twins") + 0.2, -8)
    for i in range(5):
        add(pop(800 + 90 * i), A(16, "Five") + i * 0.08, -10)
    # --- 17-21: lump, jars, kids, tree ---
    add(boing(110), A(17, "lump"), -6); add(thud(90), A(17, "lump"), -6)
    a, b = A(18, "hundred"), A(18, "pieces") + 0.4
    for i in range(101):
        add(clay(380 + 120 * R.uniform()), a + (b - a) * (i / 101) ** 1.0, -16, R.uniform(-0.7, 0.7))
    out_t, kau_t = A(19, "Out"), A(19, "Kauravas") + 0.33
    for i in range(101):
        tp = A(19, "sister") if i == 6 else out_t if i == 3 else out_t + T.hh(i, 7) * (kau_t - out_t)
        add(pop(500 + 600 * R.uniform()), tp, -12 if i not in (3, 6) else -6, R.uniform(-0.8, 0.8))
    add(whoosh(1.2, True), A(20, "one") - 0.1, -9)
    sh = A(21, "shaking")
    add(lp(colored(ns(2.4), R, -0.5), 4000) * (0.5 + 0.5 * np.sin(TAU * 7 * tt(2.4))) * 0.5, sh, -10)
    for i, h in enumerate([4.0, 4.3, 5.0, 3.5, 3.6, 4.8]):
        land = sh + 0.25 + i * 0.13 + np.sqrt(max(0.0, h - 0.38) / 4.9)
        add(thud(80 + 20 * i), land, -8, (i - 2.5) * 0.2)
    # --- 22-23: river, snake kingdom ---
    add(whoosh(0.4), A(22, "throws"), -8); add(splash(), A(22, "river") - 0.1, -2)
    add(whoosh(1.5, False), A(23, "sinks"), -10)
    for i in range(8):
        add(gulp(), A(23, "drinks") + i * (A(23, "nectar") + 0.2 - A(23, "drinks")) / 8, -8)
    add(magic(1.4), A(23, "stronger") - 0.1, -6); add(thud(60), A(23, "stronger"), -6)
    # --- 24-25: the lacquer house ---
    add(ting(1900), A(24, "lacquer"), -12); add(rumble(1.6), A(24, "burn") - 0.2, -6)
    for i in range(4):
        add(thud(160, R, 0.15), A(25, "tunnel") + 0.25 * i, -12)
    add(whoosh(0.6, True), A(25, "torch"), -4); add(fire(T.DUR - A(25, "torch"))[: ns(L(26) - A(25, "torch") + 0.2)], A(25, "torch"), -6)
    add(steps(1.8, 3.2, R, 1500) * 0.6, A(25, "sneak"), -10)
    # --- 26-28: the contest ---
    add(lp(colored(ns(1.0), R, -1.5), 300) * np.exp(-tt(1.0) / 0.4), A(26, "monster"), -6)  # the bow's creak / weight
    add(whoosh(0.9, True), A(26, "hit"), -8)
    add(I.timpani(98, 0.6, R), A(27, "fail"), -10)
    add(boing(140), A(27, "thrown"), -4); add(thud(70), A(27, "thrown") + 0.05, -4)
    add(crowd(2.0, R, lambda t: 1 + 2.5 * np.exp(-t / 0.6)), A(27, "flat"), -6)
    add(whoosh(0.25, True), A(28, "blink"), -6); add(whoosh(0.35, True), A(28, "hits"), -6)
    add(thud(300, R, 0.15), A(28, "mark") + 0.07, -4); add(ting(2200), A(28, "mark") + 0.07, -6)
    add(crowd(2.2, R, lambda t: 1 + 3.5 * np.exp(-t / 0.8)), A(28, "mark") + 0.1, -4)
    # --- 29-33: home ---
    add(steps(1.2, 7, R, 700), L(29), -8)
    add(boing(260), A(31, "stand") - 0.1, -12)
    add(sparkle(8), A(31, "married"), -8)
    for i in range(6):
        add(flap(), A(32, "sent") + 0.13 * i, -8, 0.3)
    add(np.sin(phase(600 * np.exp(-tt(0.5) / 0.25) + 150)) * np.exp(-tt(0.5) / 0.2) * 0.5, A(32, "unsend"), -8)
    for w, l in (("Bhishma's", 33), ("Kunti's", 33), ("even", 33)):
        add(whoosh(0.3), A(l, w) - 0.15, -12)
    # --- 34-35: city, fire, burp ---
    add(rumble(1.5), A(34, "build"), -4); add(magic(1.4), A(34, "city"), -8)
    add(fire(A(36, "Oh") - L(35) + 0.3), L(35), -4)
    add(burp(), A(35, "ghee") + 0.05, -4)
    # --- 36: the reveal ---
    add(boing(300), A(36, "grandfather"), -8); add(clay(900), A(36, "grandfather") + 0.25, -10)
    add(magic(1.8), T.END_F / 30, -10)


def render():
    build()
    return bus["hit"] + bus["amb"], bus


if __name__ == "__main__":
    from dsp import write_wav
    m, b = render()
    write_wav("sfx.wav", m * 0.5 / max(1e-9, np.abs(m).max()))
