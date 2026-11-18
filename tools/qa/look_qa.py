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
    # World-only targets (outside the coverage charMask); calibrated on the Adi film's world pixels.
    "golden-glow": {"split": 0.35, "glow": (0.005, 0.06), "mean": (0.32, 0.55), "std": (0.14, 0.30), "p2": (0.05, 0.25), "p98": (0.75, 1.0)},
    "warm-side": {"split": 0.05, "glow": (0.0, 0.06), "mean": (0.30, 0.65), "std": (0.12, 0.30), "p2": (0.05, 0.35), "p98": (0.70, 1.0)},
    "dusk": {"split": 0.35, "glow": (0.003, 0.06), "mean": (0.25, 0.52), "std": (0.12, 0.30), "p2": (0.03, 0.20), "p98": (0.70, 1.0)},
    "night-moon": {"split": 0.03, "glow": (0.0, 0.02), "mean": (0.12, 0.40), "std": (0.07, 0.22), "p2": (0.02, 0.15), "p98": (0.25, 0.80)},
    "noon": {"split": 0.05, "glow": (0.0, 0.04), "mean": (0.35, 0.65), "std": (0.12, 0.30), "p2": (0.04, 0.30), "p98": (0.75, 1.0)},
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


def load_mask(project, frame, img):
    path = os.path.join(project, "look-masks.json")
    if not os.path.exists(path):
        return None
    try:
        masks = json.load(open(path))
    except Exception:
        return None
    m = next((x for x in masks if int(x.get("frame", -1)) == int(frame)), None)
    if not m or not os.path.exists(m.get("file", "")):
        return None
    pal = np.asarray(Image.open(m["file"]).convert("RGB"))
    mask = np.zeros(pal.shape[:2], dtype=bool)
    for a in m.get("actors", []):
        c = a.get("color") or []
        if len(c) != 3:
            continue
        mask |= (np.abs(pal[..., 0].astype(int) - int(c[0])) <= 2) & (np.abs(pal[..., 1].astype(int) - int(c[1])) <= 2) & (np.abs(pal[..., 2].astype(int) - int(c[2])) <= 2)
    if not mask.any():
        return None
    h, w = img.shape[:2]
    up = Image.fromarray((mask.astype(np.uint8) * 255)).resize((w, h), Image.NEAREST)
    return np.asarray(up) > 127


def metrics(img, head_box=None, char_mask=None):
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    ink = np.linalg.norm(img * 255.0 - INK, axis=-1) < 42
    non = ~ink
    world = non if char_mask is None else (non & ~char_mask)
    if not world.any(): world = non
    rb = r - b
    vals = luma[world]
    if len(vals) > 50:
        hi = np.quantile(vals, 0.85); lo = np.quantile(vals, 0.15)
        bright = rb[world][vals >= hi]; dark = rb[world][vals <= lo]
        split = float(np.mean(bright) - np.mean(dark))
    else:
        split = 0.0
    glow = float(np.mean(vals > 0.9))
    return {
        "split": round(split, 3), "glow": round(glow, 4),
        "mean": round(float(np.mean(vals)), 3), "std": round(float(np.std(vals)), 3),
        "p2": round(float(np.percentile(vals, 2)), 3), "p98": round(float(np.percentile(vals, 98)), 3),
        "face": round(head_luma(img, head_box), 3) if head_box else None,
    }


def main():
    project, video = sys.argv[1], sys.argv[2]
    masks_arg = sys.argv[3] if len(sys.argv) > 3 else None
    if masks_arg:
        os.environ["FABLEON_LOOK_MASKS"] = masks_arg
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
            mood = (bs.get("look") or {}).get("mood") or LIGHT_MOOD.get(bs.get("light"), "warm-side")
            a, b = int(ms.get("a", 0)), int(ms.get("b", 1))
            # three samples across the scene (not the cut/flash at either edge); median = scene metric
            lo, hi = a + 15, max(a + 16, b - 3)
            sample_frames = sorted({int(round(lo + (hi - lo) * q)) for q in (0.3, 0.55, 0.8)})
            samples, people_rows = [], []
            for k, sf in enumerate(sample_frames):
                path = os.path.join(tmp, f"{i}-{k}.png")
                img = frame_at(video, max(0, sf - first_a), path)
                scene_rows = [r for r in by_shot.get(id, []) if a <= int(r.get("frame", -1)) < b]
                row = min(scene_rows, key=lambda r: abs(int(r.get("frame", 0)) - sf)) if scene_rows else None
                primary = row.get("primary") if row else None
                subj = next((s for s in (row.get("subjects", []) if row else []) if s.get("id") == primary), None)
                m = metrics(img, subj.get("headBox") if subj else None, load_mask(project, sf, img))
                samples.append({"frame": sf, "metrics": m, "primary": primary})
                if row: people_rows.append(row)
            if not samples: continue
            keys = ("split", "glow", "mean", "std", "p2", "p98")
            merged = {k: round(float(np.median([x["metrics"][k] for x in samples])), 3) for k in keys}
            faces = [x["metrics"]["face"] for x in samples if x["metrics"]["face"] is not None]
            merged["face"] = round(float(np.median(faces)), 3) if faces else None
            m = merged
            primary = next((x["primary"] for x in samples if x["primary"]), None)
            t = TARGETS.get(mood, TARGETS["warm-side"])
            issues = []
            if m["split"] < t["split"]: issues.append(f"split {m['split']:.2f} < {t['split']:.2f}")
            if not (t["glow"][0] <= m["glow"] <= t["glow"][1]): issues.append(f"glow {m['glow'] * 100:.1f}% outside {t['glow'][0] * 100:.1f}-{t['glow'][1] * 100:.1f}%")
            for k in ("mean", "std", "p2", "p98"):
                if not (t[k][0] <= m[k] <= t[k][1]): issues.append(f"{k} {m[k]:.2f} outside {t[k][0]:.2f}-{t[k][1]:.2f}")
            if m["face"] is not None and m["face"] < 0.30 and m["face"] < m["mean"] - 0.12: issues.append(f"face {m['face']:.2f} vs frame {m['mean']:.2f}")
            if issues: warnings.append(f"flat light {id}: " + "; ".join(issues))
            # crowded: head-box overlap of two subjects > 30% of the smaller box, on any sample
            seen_pairs = set()
            for row in people_rows:
                people = [s for s in row.get("subjects", []) if s.get("headBox")]
                for x in range(len(people)):
                    for y in range(x + 1, len(people)):
                        A, B = people[x]["headBox"], people[y]["headBox"]
                        w = max(0, min(A["x1"], B["x1"]) - max(A["x0"], B["x0"])); h = max(0, min(A["y1"], B["y1"]) - max(A["y0"], B["y0"]))
                        area = w * h; small = min((A["x1"] - A["x0"]) * (A["y1"] - A["y0"]), (B["x1"] - B["x0"]) * (B["y1"] - B["y0"]))
                        pair = tuple(sorted((people[x]["id"], people[y]["id"])))
                        if small > 0 and area / small > 0.30 and pair not in seen_pairs:
                            seen_pairs.add(pair)
                            warnings.append(f"crowded {pair[0]}/{pair[1]} at {id}")
            out.append({"scene": id, "mood": mood, "frame": sample_frames[len(sample_frames)//2], "frames": sample_frames, "metrics": m, "samples": samples, "issues": issues, "primary": primary})
    finally:
        for f in os.listdir(tmp):
            os.unlink(os.path.join(tmp, f))
        os.rmdir(tmp)
    md = ["# Measured look check", "", f"- video: `{os.path.basename(video)}`", f"- targets: {json.dumps(TARGETS)}", "- glow: share of luma > 0.9 outside the character mask", "", "| scene | mood | split | glow | mean | std | p2 | p98 | face | issues |", "|---|---|---:|---:|---:|---:|---:|---:|---:|---|", *[f"| {r['scene']} | {r['mood']} | {r['metrics']['split']:.2f} | {r['metrics']['glow'] * 100:.1f}% | {r['metrics']['mean']:.2f} | {r['metrics']['std']:.2f} | {r['metrics']['p2']:.2f} | {r['metrics']['p98']:.2f} | {(r['metrics']['face'] or 0):.2f} | {'; '.join(r['issues']) or 'ok'} |" for r in out], "", "## Warnings", "", *([f"- {w}" for w in warnings] or ["- none"]), ""]
    json.dump({"video": video, "scenes": out, "warnings": warnings}, open(os.path.join(project, "look-qa.json"), "w"), indent=1)
    open(os.path.join(project, "look-qa.md"), "w").write("\n".join(md))
    print("\n".join(md[:10]))
    if warnings: print(f"look: {len(warnings)} warning(s)")


if __name__ == "__main__":
    main()
