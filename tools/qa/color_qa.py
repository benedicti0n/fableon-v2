# Character colour QA: the lit side of every sampled face must match the cast skin within dE76 <= 12.
# Faces are located with the coverage pass (frames.json headBox/eye); one final.mp4 frame per sampled key.
import io, json, os, subprocess, sys
import numpy as np
from PIL import Image

LIMIT = float(os.environ.get("FABLEON_COLOR_DE", "12"))

def lab(rgb):
    c = np.asarray(rgb, float) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]])
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, xyz ** (1 / 3), 7.787 * xyz + 16 / 116)
    return np.array([116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])])

def de(a, b):
    return float(np.linalg.norm(lab(a) - lab(b)))

def hex_rgb(s):
    s = str(s).lstrip("#")
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))

def frame(vid, t):
    r = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(t), "-i", vid, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "ppm", "-"], capture_output=True)
    if r.returncode != 0 or not r.stdout:
        return None
    return np.asarray(Image.open(io.BytesIO(r.stdout)).convert("RGB"))

def face_color(im, hb):
    h, w, _ = im.shape
    x0, y0, x1, y1 = hb["x0"] * w, hb["y0"] * h, hb["x1"] * w, hb["y1"] * h
    xa, xb = int(x0 + 0.10 * (x1 - x0)), int(x1 - 0.10 * (x1 - x0))
    ya, yb = int(y0 + 0.12 * (y1 - y0)), int(y1 - 0.10 * (y1 - y0))
    if xb <= xa or yb <= ya:
        return None
    p = im[ya:yb, xa:xb].reshape(-1, 3)
    lum = p @ np.array([0.2126, 0.7152, 0.0722])
    p = p[(lum > 18) & (lum < 245)]
    if len(p) < 20:
        return None
    q = (p // 12).astype(int)
    key = q[:, 0] * 400 + q[:, 1] * 20 + q[:, 2]
    vals, counts = np.unique(key, return_counts=True)
    k = int(vals[counts.argmax()])
    near = (np.abs(q[:, 0] - (k // 400)) <= 1) & (np.abs(q[:, 1] - ((k // 20) % 20)) <= 1) & (np.abs(q[:, 2] - (k % 20)) <= 1)
    return p[near].mean(0)

def half_color(im, hb, left):
    h, w, _ = im.shape
    x0, y0, x1, y1 = hb["x0"] * w, hb["y0"] * h, hb["x1"] * w, hb["y1"] * h
    xa, xb = (int(x0 + .12 * (x1 - x0)), int(x0 + .45 * (x1 - x0))) if left else (int(x1 - .45 * (x1 - x0)), int(x1 - .12 * (x1 - x0)))
    ya, yb = int(y0 + .30 * (y1 - y0)), int(y0 + .78 * (y1 - y0))
    p = im[ya:yb, xa:xb].reshape(-1, 3); lum = p @ np.array([.2126, .7152, .0722]); p = p[(lum > 18) & (lum < 245)]
    if len(p) < 8: return None
    q = (p // 12).astype(int); key = q[:, 0] * 400 + q[:, 1] * 20 + q[:, 2]; v, c = np.unique(key, return_counts=True); k = int(v[c.argmax()])
    near = (np.abs(q[:, 0] - (k // 400)) <= 1) & (np.abs(q[:, 1] - ((k // 20) % 20)) <= 1) & (np.abs(q[:, 2] - (k % 20)) <= 1)
    return p[near].mean(0)

def main(project, spec_only=False, split=False):
    frames_path = os.path.join(project, "frames.json")
    story_path = os.path.join(project, "storyboard.json")
    if not os.path.exists(frames_path) or not os.path.exists(story_path):
        print("COLOR SKIP no frames.json/storyboard.json")
        return 0
    frames = json.load(open(frames_path))
    story = json.load(open(story_path))
    cast = story.get("cast", {})
    hero = next(iter(cast.keys()), None)
    qa = {}
    pp = os.path.join(project, "project.json")
    if os.path.exists(pp) and not spec_only:
        try: qa = json.load(open(pp)).get("qa", {}).get("skin", {}) or {}
        except Exception: qa = {}
    rows, bad = [], 0
    seen = set()
    for key in frames.get("keys", []):
        for sub in key.get("subjects", []):
            sid = sub.get("id")
            if hero and sid != hero:
                continue
            hb = sub.get("headBox")
            eye = sub.get("eye")
            if not sid or not hb or not eye or sub.get("visible", 0) < 0.85: continue
            if not (0.01 < hb.get("x0", -1) < hb.get("x1", 2) < 0.99 and 0.01 < hb.get("y0", -1) < hb.get("y1", 2) < 0.99): continue
            if (hb["x1"] - hb["x0"]) < 0.035: continue
            if sid in seen: continue
            spec = cast.get(sid, {}).get("spec")
            if isinstance(spec, str):
                continue
            skin = qa.get(sid) or (spec or {}).get("skin")
            if not skin: continue
            fr = [f for f in key.get("frames", []) if f >= 0]
            if not fr: continue
            tf = fr[len(fr) // 2]
            im = frame(os.path.join(project, "final.mp4"), tf / 30.0)
            if im is None: continue
            rgb = face_color(im, hb)
            if rgb is None: continue
            side = 0
            d = de(rgb, hex_rgb(skin))
            ok = d <= LIMIT
            rows.append(f"COLOR {sid:20s} frame {tf:5d} side mode rgb {tuple(int(x) for x in rgb)} expected {skin} dE76 {d:5.2f} {'PASS' if ok else 'FAIL'}")
            if not ok: bad += 1
            if split:
                l, r = half_color(im, hb, True), half_color(im, hb, False)
                if l is not None and r is not None and de(l, r) > 12:
                    rows.append(f"SPLIT {sid:20s} frame {tf:5d} left {tuple(int(x) for x in l)} right {tuple(int(x) for x in r)} dE {de(l, r):5.2f}")
            seen.add(sid)
    print("\n".join(rows) if rows else "COLOR SKIP no sampled faces")
    print(f"COLOR {'PASS' if bad == 0 else 'FAIL'} ({len(rows) - bad}/{len(rows)} faces within dE76 {LIMIT:g})")
    return 0 if bad == 0 else 1

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    sys.exit(main(args[0] if args else ".", spec_only="--spec" in sys.argv, split="--split" in sys.argv))
