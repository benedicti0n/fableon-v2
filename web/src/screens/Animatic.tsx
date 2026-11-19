import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { approveStage, fileUrl, getProject, getTimeline, runOp, text, waitJob } from '../api/client';
import { Badge, Button, ErrorNotice, Field, inputClass, Panel, Spinner, StatusBadge, stageFrame } from '../components/ui';
import { Markdown } from '../lib/markdown';

export default function Animatic() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const project = useQuery({ queryKey: ['project', id], queryFn: () => getProject(id) });
  const timelineQ = useQuery({ queryKey: ['timeline', id], queryFn: () => getTimeline(id) });
  const qaQ = useQuery({ queryKey: ['file', id, 'animatic-qa.md'], queryFn: () => text(fileUrl(id, 'animatic-qa.md')).catch(() => '') });
  const video = React.useRef<HTMLVideoElement>(null);
  const [time, setTime] = React.useState(0);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState<unknown>(null);
  const readOnly = !!project.data?.readOnly;
  const scene = timelineQ.data?.scenes.find((s) => s.id === selected) ?? timelineQ.data?.scenes.find((s) => time >= s.start && time < s.end);
  const stage = project.data?.stages.find((s) => s.stage === 'animatic');
  const rerun = useMutation({ mutationFn: async () => { const b = await runOp(id, 'board', { shot: scene?.id, notes: note, force: true }); const done = await waitJob(b.id); if (done.status !== 'done') throw new Error(done.error ?? 'board re-run failed'); return runOp(id, 'animatic', {}); }, onSuccess: () => { setNote(''); qc.invalidateQueries({ queryKey: ['project', id] }); qc.invalidateQueries({ queryKey: ['timeline', id] }); qc.invalidateQueries({ queryKey: ['file', id, 'animatic-qa.md'] }); }, onError: setError });
  const approve = useMutation({ mutationFn: () => approveStage(id, 'animatic'), onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id] }), onError: setError });
  if (timelineQ.isLoading || !timelineQ.data) return <div className="flex items-center gap-2 text-sm text-studio-muted"><Spinner /> Loading animatic…</div>;
  const tl = timelineQ.data;
  const dur = tl.duration;
  const verdict = /Verdict:\s*(PASS|FAIL)/i.exec(qaQ.data ?? '')?.[1]?.toUpperCase();
  const warnings = (qaQ.data ?? '').split('\n').filter((l) => /warning|fail|unexplained|flat light|dark face/i.test(l) && !l.includes('##')).slice(0, 12);
  return <div className={stageFrame + ' space-y-4'}>
    <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[.18em] text-studio-amber">Stage 7</div><h1 className="mt-1 text-xl font-semibold">Animatic</h1><p className="mt-1 text-sm text-studio-muted">Watch the cut, jump to a shot, and send notes back to one shot.</p></div><div className="flex items-center gap-2">{stage ? <StatusBadge status={stage.status} /> : null}<Button onClick={() => { video.current?.play(); }}>Play</Button><Button variant="primary" onClick={() => approve.mutate()} disabled={readOnly || stage?.status === 'approved'}>{stage?.status === 'approved' ? 'Approved' : 'Approve animatic'}</Button></div></div>
    {error ? <ErrorNotice error={error} onDismiss={() => setError(null)} /> : null}
    <div className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
      <Panel className="p-3"><div className="relative overflow-hidden rounded-lg bg-black"><video ref={video} src={fileUrl(id, 'animatic.mp4')} controls playsInline className="mx-auto max-h-[68vh] w-auto max-w-full" onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)} /><div className="absolute inset-x-0 bottom-9 hidden h-6 sm:block">{tl.scenes.map((s) => <button key={s.id} aria-label={`Jump to ${s.id}`} title={s.id} onClick={() => { if (video.current) { video.current.currentTime = s.start; video.current.play(); } }} className="absolute bottom-0 h-2 rounded-sm bg-studio-teal/60 hover:bg-studio-amber" style={{ left: `${(s.start / dur) * 100}%`, width: `${Math.max(.4, ((s.end - s.start) / dur) * 100)}%` }} />)}</div></div><div className="mt-2 flex items-center justify-between text-[10px] text-studio-muted"><span className="font-mono">{time.toFixed(2)}s / {dur.toFixed(2)}s</span><span>{tl.scenes.length} shots · 1440×2560 target</span></div><div className="mt-3 flex flex-wrap gap-1">{tl.scenes.map((s) => <button key={s.id} onClick={() => { setSelected(s.id); if (video.current) video.current.currentTime = s.start; }} className={`rounded border px-1.5 py-0.5 text-[10px] ${scene?.id === s.id ? 'border-studio-amber/60 bg-studio-amber/10 text-studio-amber' : 'border-studio-line text-studio-muted hover:text-studio-text'}`}>{s.id}</button>)}</div></Panel>
      <div className="space-y-4"><Panel className="p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">QA</h2>{verdict ? <Badge tone={verdict === 'PASS' ? 'green' : 'red'}>{verdict}</Badge> : <Badge tone="neutral">not run</Badge>}</div>{qaQ.data ? <div className="mt-2 max-h-52 overflow-auto"><Markdown source={qaQ.data} /></div> : <div className="mt-2 text-xs text-studio-muted">Run the animatic to write animatic-qa.md.</div>}{warnings.length ? <ul className="mt-2 space-y-1 text-[10px] text-studio-amber">{warnings.map((w, i) => <li key={i}>• {w.replace(/^- /, '').slice(0, 180)}</li>)}</ul> : null}</Panel>
        <Panel className="p-4"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Shot note</h2>{scene ? <Badge tone="neutral">{scene.id}</Badge> : null}</div><Field label="What should change in this shot?"><textarea className={inputClass} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Hold the close-up two beats longer." /></Field><Button className="mt-2 w-full" variant="primary" disabled={!scene || !note.trim() || rerun.isPending || readOnly} onClick={() => rerun.mutate()}>{rerun.isPending ? 'Queueing…' : 'Save & re-render shot'}</Button><div className="mt-1 text-[10px] text-studio-muted">Queues the board shot re-run, then the animatic. Segments that exist are reused.</div></Panel>
      </div>
    </div>
  </div>;
}
