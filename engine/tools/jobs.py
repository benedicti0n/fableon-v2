# split the film into per-shot clips and deal them to N workers (balanced by frame count)
# usage: python3 engine/jobs.py out/adi/shots.json out/adi/final N
import json, sys, os
shots = json.load(open(sys.argv[1])); out = sys.argv[2]; n = int(sys.argv[3])
os.makedirs(out, exist_ok=True)
segs = [[a, b, f"{out}/seg_{i:02d}.mp4"] for i, a, b, *_ in shots]
load = [0] * n; lists = [[] for _ in range(n)]
for s in sorted(segs, key=lambda s: -(s[1] - s[0])):
    k = load.index(min(load)); lists[k].append(s); load[k] += s[1] - s[0]
for k in range(n):
    json.dump(sorted(lists[k]), open(f"{out}/jobs_{k}.json", "w"))
print("frames per worker", load)
