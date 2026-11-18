#!/usr/bin/env python3
"""Measured look check per scene: warm/cool split, glowing highlights, luma stats, face brightness and crowding."""
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

TARGETS = {
    "golden-glow": {"split": 0.35, "glow": (0.01, 0.06), "mean": (0.43, 0.54), "std": (0.21, 0.29), "p2": (0.03, 0.11), "p98": (0.90, 1.0)},
    "warm-side": {"split": 0.25, "glow": (0.005, 0.04), "mean": (0.43, 0.54), "std": (0.20, 0.29), "p2": (0.03, 0.11), "p98": (0.88, 1.0)},
    "dusk": {"split": 0.35, "glow": (0.01, 0.06), "mean": (0.40, 0.52), "std": (0.21, 0.30), "p2": (0.02, 0.10), "p98": (0.88, 1.0)},
    "night-moon": {"split": 0.15, "glow": (0.005, 0.04), "mean": (0.30, 0.45), "std": (0.18, 0.28), "p2": (0.01, 0.08), "p98": (0.80, 1.0)},
    "noon": {"split": 0.15, "glow": (0.002, 0.03), "mean": (0.45, 0.56), "std": (0.19, 0.29), "p2": (0.03, 0.11), "p98": (0.90, 1.0)},
}
LIGHT_MOOD = {"day": "warm-side", "golden": "golden-glow", "night": "night-moon", "deep": "dusk"}
INK = np.array([36, 23, 38], np.float32)


def frame_at(video, frame, out):
    t = max(0, frame) / 30.0
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", video, "-ss", f"{t:.3f}", "-frames:v", "1", out], check=True)
    return np.asarray(Image.open(out).convert("RGB"), dtype=np.float32) / 255.0


def head_luma(img, box):
    h, w, _ = img.shape
    x0 = max(0, int(box["x0"] * w)); x1 = min(w, int(box["x1"] * w) + 1)
    y0 = max(0, int(box["y0"] * h)); y1 = min(h, int(box["y1"] * h) + 1)
    if x1 <= x0 or y1 <= y0: return None
    p = img[y0:y1, x0:x1]
    return float(np.mean(0.2126 * p[..., 0] + 0.7152 * p[..., 1] + 0.0722 * p[..., 2]))


def metrics(img, head_box=None):
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    ink = np.linalg.norm(img * 255.0 - INK, axis=-1) < 42
    non = ~ink
    rb = r - b
    vals = luma[non]
    if len(vals) > 50:
        hi = np.quantile(vals, 0.85); lo = np.quantile(vals, 0.15)
        bright = rb[non][vals >= hi]; dark = rb[non][vals <= lo]
        split = float(np.mean(bright) - np.mean(dark))
    else:
        split = 0.0
    glow = float(np.mean(luma > 0.9))
    return {
        "split": round(split, 3), "glow": round(glow, 4),
        "mean": round(float(np.mean(luma)), 3), "std": round(float(np.std(luma)), 3),
        "p2": round(float(np.percentile(luma, 2)), 3), "p98": round(float(np.percentile(luma, 98)), 3),
        "face": round(head_luma(img, head_box), 3) if head_box else None,
    }


def main():
    project, video = sys.argv[1], sys.argv[2]
    frames = json.load(open(os.path.join(project, "frames.json")))
    meta = json.load(open(os.path.join(project, "qa_meta.json")))
    board = json.load(open(os.path.join(project, "board.json")))
    shots = meta.get("shots", [])
    first_a = shots[0]["a"] if shots else 0
    rows = frames.get("rows", frames.get("keys", []))
    by_shot = {}
    for row in rows:
        by_shot.setdefault(row.get("shot"), []).append(row)
    out = []
    warnings = []
    occurrence = {}
    tmp = tempfile.mkdtemp(prefix="fableon-look-")
    try:
        for i, bs in enumerate(board.get("shots", [])):
            ms = shots[i] if i < len(shots) else None
            if not ms: continue
            id = bs.get("id")
            occurrence[id] = occurrence.get(id, 0) + 1
            candidates = by_shot.get(id, [])
            if len(candidates) < occurrence[id]: continue
            # choose ~1 s into the scene, after any flash; the first key row can be before the cut or inside the flash
            target = (ms.get("a", -2) if ms else -2) + 30
            group = candidates[(occurrence[id] - 1) * max(1, len(candidates) // max(1, sum(1 for b in board.get("shots", []) if b.get("id") == id))):]
            row = min(group, key=lambda r: abs(r.get("frame", target) - target)) if group else candidates[occurrence[id] - 1]
            if row is None: continue
            mood = (bs.get("look") or {}).get("mood") or LIGHT_MOOD.get(bs.get("light"), "warm-side")
            fr = max(0, int(row.get("frame", ms["a"])) - first_a)
            path = os.path.join(tmp, f"{i}.png")
            img = frame_at(video, fr, path)
            primary = row.get("primary")
            subj = next((s for s in row.get("subjects", []) if s.get("id") == primary), None)
            m = metrics(img, subj.get("headBox") if subj else None)
            t = TARGETS.get(mood, TARGETS["warm-side"])
            issues = []
            if m["split"] < t["split"]: issues.append(f"split {m['split']:.2f} < {t['split']:.2f}")
            if not (t["glow"][0] <= m["glow"] <= t["glow"][1]): issues.append(f"glow {m['glow'] * 100:.1f}% outside {t['glow'][0] * 100:.1f}-{t['glow'][1] * 100:.1f}%")
            for k in ("mean", "std", "p2", "p98"):
                if not (t[k][0] <= m[k] <= t[k][1]): issues.append(f"{k} {m[k]:.2f} outside {t[k][0]:.2f}-{t[k][1]:.2f}")
            if m["face"] is not None and m["face"] < m["mean"] - 0.12: issues.append(f"face {m['face']:.2f} vs frame {m['mean']:.2f}")
            if issues: warnings.append(f"flat light {id}: " + "; ".join(issues))
            # crowded: head-box overlap of two subjects > 30% of the smaller box
            people = [s for s in row.get("subjects", []) if s.get("headBox")]
            for a in range(len(people)):
                for b in range(a + 1, len(people)):
                    A, B = people[a]["headBox"], people[b]["headBox"]
                    w = max(0, min(A["x1"], B["x1"]) - max(A["x0"], B["x0"])); h = max(0, min(A["y1"], B["y1"]) - max(A["y0"], B["y0"]))
                    area = w * h; small = min((A["x1"] - A["x0"]) * (A["y1"] - A["y0"]), (B["x1"] - B["x0"]) * (B["y1"] - B["y0"]))
                    if small > 0 and area / small > 0.30:
                        warnings.append(f"crowded {people[a]['id']}/{people[b]['id']} at {id}")
            out.append({"scene": id, "mood": mood, "frame": fr, "metrics": m, "issues": issues, "primary": primary})
    finally:
        for f in os.listdir(tmp):
            os.unlink(os.path.join(tmp, f))
        os.rmdir(tmp)
    md = ["# Measured look check", "", f"- video: `{os.path.basename(video)}`", f"- targets: {json.dumps(TARGETS)}", "", "| scene | mood | split | glow | mean | std | p2 | p98 | face | issues |", "|---|---|---:|---:|---:|---:|---:|---:|---:|---|", *[f"| {r['scene']} | {r['mood']} | {r['metrics']['split']:.2f} | {r['metrics']['glow'] * 100:.1f}% | {r['metrics']['mean']:.2f} | {r['metrics']['std']:.2f} | {r['metrics']['p2']:.2f} | {r['metrics']['p98']:.2f} | {(r['metrics']['face'] or 0):.2f} | {'; '.join(r['issues']) or 'ok'} |" for r in out], "", "## Warnings", "", *([f"- {w}" for w in warnings] or ["- none"]), ""]
    json.dump({"video": video, "scenes": out, "warnings": warnings}, open(os.path.join(project, "look-qa.json"), "w"), indent=1)
    open(os.path.join(project, "look-qa.md"), "w").write("\n".join(md))
    print("\n".join(md[:10]))
    if warnings: print(f"look: {len(warnings)} warning(s)")


if __name__ == "__main__":
    main()
