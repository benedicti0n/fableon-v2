// Deal shots to N workers, balanced by frame count (port of engine/tools/jobs.py).
export function balance(segments, workers) {
  const n = Math.max(1, workers | 0);
  const load = Array(n).fill(0);
  const lists = Array.from({ length: n }, () => []);
  for (const s of [...segments].sort((a, b) => b[1] - b[0] - (a[1] - a[0]))) {
    const k = load.indexOf(Math.min(...load));
    lists[k].push(s);
    load[k] += s[1] - s[0];
  }
  return { lists, load };
}
