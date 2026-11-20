import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { acceptRange, getRanges, rangeTakeUrl, revertRange, runOp, waitJob } from '../api/client';
import { Badge, Button, Field, inputClass, Panel, SelectBox } from './ui';

type Word = { line: number; index: number; a: number; b: number; w?: string };
type Props = { project: string; duration: number; words: Word[]; disabled?: boolean };

const snapStart = (t: number, words: Word[]) => [...words].sort((a, b) => Math.abs(a.a - t) - Math.abs(b.a - t))[0]?.a ?? t;
const snapEnd = (t: number, words: Word[]) => [...words].sort((a, b) => Math.abs(a.b - t) - Math.abs(b.b - t))[0]?.b ?? t;
const time = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function RangeEditor({ project, duration, words, disabled = false }: Props) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['ranges', project], queryFn: () => getRanges(project) });
  const [from, setFrom] = React.useState(() => Math.max(0, Math.min(duration - 5, 10)));
  const [to, setTo] = React.useState(() => Math.max(5, Math.min(duration, 15)));
  const [note, setNote] = React.useState('');
  const [count, setCount] = React.useState('2');
  const [edges, setEdges] = React.useState('match');
  const [drag, setDrag] = React.useState<number | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const track = React.useRef<HTMLDivElement>(null);

  const at = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (!r) return 0;
    return Math.max(0, Math.min(duration, ((clientX - r.left) / r.width) * duration));
  };
  const select = (a: number, b: number) => {
    const lo = snapStart(Math.min(a, b), words), hi = snapEnd(Math.max(a, b), words);
    setFrom(Math.max(0, Math.min(lo, duration - 1)));
    setTo(Math.min(duration, Math.max(hi, lo + 1)));
  };
  const wordsInRange = words.filter((w) => w.b > from && w.a < to);
  const rangeWords = React.useMemo(() => {
    const byLine = new Map<number, number>();
    for (const w of words) if (w.b > from && w.a < to) byLine.set(w.line, (byLine.get(w.line) ?? 0) + 1);
    return [...byLine.entries()].sort((a, b) => a[0] - b[0]);
  }, [from, to, words]);

  const generate = useMutation({
    mutationFn: async () => {
      const job = await runOp(project, 'ranges', { from, to, note, count: Number(count), edges });
      const done = await waitJob(job.id, 20 * 60 * 1000);
      if (done.status !== 'done') throw new Error(done.error ?? 'range take failed');
      return done;
    },
    onSuccess: () => { setMessage('Takes ready.'); qc.invalidateQueries({ queryKey: ['ranges', project] }); },
    onError: (e: Error) => setMessage(e.message),
  });
  const accept = useMutation({
    mutationFn: async ({ takeId, rangeId }: { takeId: string; rangeId: string }) => {
      const r = await acceptRange(project, takeId, rangeId);
      setMessage(`Accepted take; re-rendering the board and animatic${r.cuesChanged ? ' (sound cues updated)' : ''}.`);
      void waitJob(r.job.id, 30 * 60 * 1000);
      return r;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ranges', project] }); qc.invalidateQueries({ queryKey: ['project', project] }); qc.invalidateQueries({ queryKey: ['timeline', project] }); },
    onError: (e: Error) => setMessage(e.message),
  });
  const revert = useMutation({
    mutationFn: async () => { const r = await revertRange(project); setMessage('Reverted the last range edit; re-running the board and animatic.'); void waitJob(r.job.id, 30 * 60 * 1000); return r; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ranges', project] }); qc.invalidateQueries({ queryKey: ['project', project] }); qc.invalidateQueries({ queryKey: ['timeline', project] }); },
    onError: (e: Error) => setMessage(e.message),
  });

  const status = q.data;
  return <Panel className="p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-semibold">Regenerate this part</h2><p className="mt-0.5 text-[11px] text-studio-muted">Select 1–20 s on the bar. Edges match the current film by default; everything outside the range stays put.</p></div><Badge tone="neutral">{q.data?.accepted.length ?? 0} accepted · {q.data?.history.length ?? 0} edit(s)</Badge></div>
    <div ref={track} className="relative mt-3 h-12 cursor-crosshair overflow-hidden rounded border border-studio-line bg-studio-bg/60" onPointerDown={(e) => { setDrag(at(e.clientX)); select(at(e.clientX), at(e.clientX) + 0.4); }} onPointerMove={(e) => { if (drag === null) return; select(drag, at(e.clientX)); }} onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)}>
      {words.filter((w, i) => i % 2 === 0).map((w, i) => <span key={`${w.line}:${w.index}:${i}`} className="absolute top-1 h-1 w-px bg-studio-line" style={{ left: `${(w.a / Math.max(0.1, duration)) * 100}%` }} />)}
      <div className="absolute inset-y-1 rounded bg-studio-amber/25 ring-1 ring-studio-amber/60" style={{ left: `${(from / Math.max(0.1, duration)) * 100}%`, width: `${Math.max(0.6, ((to - from) / Math.max(0.1, duration)) * 100)}%` }} />
      <div className="absolute bottom-1 left-1 text-[9px] text-studio-faint">{time(from)} → {time(to)} · {(to - from).toFixed(1)} s</div>
    </div>
    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-studio-muted"><span>{rangeWords.length ? `lines ${rangeWords.map(([n, c]) => `${n} (${c}w)`).join(', ')}` : 'no words in range'}</span><span className="min-w-0 flex-1 truncate text-studio-faint">{wordsInRange.slice(0, 24).map((w) => w.w).join(' ')}</span><Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>{open ? 'Hide' : 'Regenerate this part'}</Button></div>
    {open ? <div className="mt-3 grid gap-3 rounded-lg border border-studio-line bg-studio-bg/40 p-3 sm:grid-cols-2">
      <Field label="From (snaps to a word)"><input className={inputClass} type="number" min={0} max={duration} step="0.1" value={from.toFixed(1)} onChange={(e) => select(Number(e.target.value), to)} /></Field>
      <Field label="To (snaps to a word)"><input className={inputClass} type="number" min={0} max={duration} step="0.1" value={to.toFixed(1)} onChange={(e) => select(from, Number(e.target.value))} /></Field>
      <Field label="Director note (optional)"><input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Make the reaction land later…" /></Field>
      <div className="grid grid-cols-2 gap-2"><Field label="Takes"><SelectBox ariaLabel="Takes" value={count} onValueChange={setCount} items={[{ value: '1', label: '1 take' }, { value: '2', label: '2 takes' }, { value: '3', label: '3 takes' }]} /></Field><Field label="Edges"><SelectBox ariaLabel="Edges" value={edges} onValueChange={setEdges} items={[{ value: 'match', label: 'match (no jump)' }, { value: 'cut', label: 'cut at edges' }]} /></Field></div>
      <div className="sm:col-span-2 flex items-center justify-between"><span className="text-[10px] text-studio-muted">Local preview render; no provider call. A take re-renders only this range plus one second on each side.</span><Button variant="primary" disabled={disabled || generate.isPending || to - from < 1 || to - from > 20} onClick={() => generate.mutate()}>{generate.isPending ? 'Rendering takes…' : 'Generate takes'}</Button></div>
    </div> : null}
    {message ? <div className="mt-2 text-[11px] text-studio-amber">{message}</div> : null}
    {q.data?.ranges.slice(-3).reverse().map((r) => <div key={r.id} className="mt-3 rounded-lg border border-studio-line p-2"><div className="mb-1 flex items-center justify-between text-[10px] text-studio-muted"><span>{r.edges} · {r.words || `${r.from.toFixed(1)}–${r.to.toFixed(1)}s`} · {r.note || 'no note'}</span><span className="font-mono">{r.takes.length} take(s)</span></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{r.takes.map((t) => <div key={t.id} className="rounded border border-studio-line bg-black/30 p-1"><video src={rangeTakeUrl(project, t.id)} controls loop playsInline className="aspect-[9/16] max-h-72 w-full bg-black object-contain" /><div className="mt-1 flex items-center justify-between gap-1"><span className="truncate text-[9px] text-studio-muted">take {t.index}</span><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setMessage('Current version kept.')}>Keep current</Button><Button size="sm" variant="primary" disabled={accept.isPending || disabled} onClick={() => accept.mutate({ takeId: t.id, rangeId: r.id })}>Use this take</Button></div></div></div>)}</div></div>)}
    {status?.accepted.length ? <div className="mt-3 flex items-center justify-between text-[10px] text-studio-muted"><span>{status.accepted.length} accepted range edit(s); board is ready for review.</span><Button size="sm" variant="ghost" disabled={revert.isPending || disabled} onClick={() => revert.mutate()}>Revert last edit</Button></div> : null}
  </Panel>;
}
