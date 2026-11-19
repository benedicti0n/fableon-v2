import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { approveStage, fileUrl, getPeaks, getProject, getTimeline, json, putFile } from '../api/client';
import { Badge, Button, DialogShell, ErrorNotice, Field, inputClass, Panel, SelectBox, Spinner, StatusBadge } from '../components/ui';
import { EstimateDialog } from '../components/EstimateDialog';

type PlanKey = Record<string, unknown> & { at?: string };
type PlanShot = { id: string; scene?: string; mood?: string; keys?: PlanKey[] };
type Plan = { shots: PlanShot[] };
type Review = { shots?: Array<{ id: string; needsHuman?: boolean; findings?: string[] }>; film?: { errors?: string[] } };
const MOODS = ['warm-side', 'golden-glow', 'dusk', 'night-moon', 'noon'];
const MOOD_COLOR: Record<string, string> = { 'warm-side': '#f5a524', 'golden-glow': '#fb923c', dusk: '#c084fc', 'night-moon': '#60a5fa', noon: '#2dd4bf' };

export default function Board() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const project = useQuery({ queryKey: ['project', id], queryFn: () => getProject(id) });
  const timelineQ = useQuery({ queryKey: ['timeline', id], queryFn: () => getTimeline(id) });
  const peaksQ = useQuery({ queryKey: ['peaks', id, 'voice.wav'], queryFn: () => getPeaks(id, 'voice.wav', 700).catch(() => null) });
  const planQ = useQuery({ queryKey: ['file', id, 'shotplan.json'], queryFn: () => json<Plan>(fileUrl(id, 'shotplan.json')) });
  const reviewQ = useQuery({ queryKey: ['file', id, 'board.review.json'], queryFn: () => json<Review>(fileUrl(id, 'board.review.json')).catch(() => ({ shots: [], film: {} })) });
  const [error, setError] = React.useState<unknown>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [estimate, setEstimate] = React.useState<{ op: string; args: Record<string, unknown>; title: string } | null>(null);
  const readOnly = !!project.data?.readOnly;
  const tl = timelineQ.data;
  const stage = project.data?.stages.find((s) => s.stage === 'shotplan');
  const boardStage = project.data?.stages.find((s) => s.stage === 'board');
  const scene = tl?.scenes.find((s) => s.id === selected) ?? tl?.scenes[0];
  const findings = new Map((reviewQ.data?.shots ?? []).map((r) => [r.id, r]));
  const filmErrors = ((reviewQ.data as Review | undefined)?.film?.errors ?? []) as string[];
  const savePlan = useMutation({ mutationFn: (plan: Plan) => putFile(id, 'shotplan.json', plan), onSuccess: () => { qc.invalidateQueries({ queryKey: ['file', id, 'shotplan.json'] }); qc.invalidateQueries({ queryKey: ['project', id] }); }, onError: setError });
  const approve = useMutation({ mutationFn: (stage: string) => approveStage(id, stage), onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id] }), onError: setError });
  const setMood = (mood: string) => {
    if (!planQ.data || !scene) return;
    const plan = structuredClone(planQ.data);
    for (const s of plan.shots) if (s.scene === scene.id || (!s.scene && s.id === scene.id)) s.mood = mood;
    savePlan.mutate(plan);
  };
  if (timelineQ.isLoading || project.isLoading || !tl) return <div className="flex items-center gap-2 text-sm text-studio-muted"><Spinner /> Loading timeline…</div>;
  const pct = (s: number) => `${Math.max(0, Math.min(100, (s / tl.duration) * 100))}%`;
  const bars = peaksQ.data?.peaks ?? [];
  return <div className="mx-auto max-w-6xl space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[.18em] text-studio-amber">Stage 6</div><h1 className="mt-1 text-xl font-semibold">Shot plan &amp; board</h1><p className="mt-1 text-sm text-studio-muted">Shape the scenes over the voice, then let the deterministic board compile and measure.</p></div><div className="flex items-center gap-2">{stage ? <StatusBadge status={stage.status} /> : null}<Button onClick={() => setEstimate({ op: 'board', args: { force: true }, title: 'Run the board' })} disabled={readOnly}>Run board</Button><Button variant="primary" onClick={() => approve.mutate('shotplan')} disabled={readOnly || stage?.status === 'approved'}>{stage?.status === 'approved' ? 'Shot plan approved' : 'Approve shot plan'}</Button>{boardStage && boardStage.status !== 'approved' ? <Button onClick={() => approve.mutate('board')} disabled={readOnly}>Approve board</Button> : null}</div></div>
    {error ? <ErrorNotice error={error} onDismiss={() => setError(null)} /> : null}
    <Panel className="p-3"><div className="relative h-28 overflow-hidden rounded-lg border border-studio-line bg-studio-bg">
      {bars.length ? <div className="absolute inset-0 flex items-center gap-[1px] px-1 opacity-55">{bars.map((p, i) => <div key={i} className="min-w-[1px] flex-1 rounded-sm bg-studio-muted" style={{ height: `${Math.max(2, Math.min(100, Math.abs(p.max) * 100))}%` }} />)}</div> : null}
      {tl.scenes.map((s) => <button key={s.id} onClick={() => setSelected(s.id)} className={`absolute inset-y-0 border-l ${selected === s.id ? 'z-10 bg-white/[.07] ring-1 ring-inset ring-studio-amber/60' : 'hover:bg-white/[.04]'}`} style={{ left: pct(s.start), width: `calc(${pct(s.end)} - ${pct(s.start)})` }} title={`${s.id} · ${s.mood ?? s.light}`} aria-label={`Scene ${s.id}`}>
        <span className="absolute left-1 top-1 max-w-full truncate rounded px-1 py-0.5 text-[9px] font-medium" style={{ color: MOOD_COLOR[s.mood ?? ''] ?? '#a3a9b6', background: '#0f1115bb' }}>{s.id}</span>
        {s.keys.map((k) => <span key={k.index} className="absolute bottom-1 h-3 w-px bg-white/20" style={{ left: `${((k.start - s.start) / Math.max(.001, s.end - s.start)) * 100}%` }} />)}
        <span className="absolute bottom-0 left-0 right-0 h-1" style={{ background: MOOD_COLOR[s.mood ?? ''] ?? '#3a4658' }} />
      </button>)}
    </div><div className="mt-1 flex justify-between text-[10px] text-studio-faint"><span>0s</span><span>{tl.duration.toFixed(1)}s</span></div></Panel>
    <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
      <Panel className="p-4"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Scene</h2>{scene ? <Badge tone="neutral">{scene.light ?? 'light'} · {scene.transition?.type ?? 'cut'}</Badge> : null}</div>{scene ? <><div className="text-xs font-medium">{scene.id}</div><div className="mt-0.5 text-[10px] text-studio-muted">{(scene.sets ?? []).join('+')} · {(scene.end - scene.start).toFixed(2)}s</div><label className="mt-3 block text-[10px] font-medium uppercase tracking-wide text-studio-faint">Mood</label><div className="mt-1"><SelectBox ariaLabel="Scene mood" value={scene.mood ?? 'warm-side'} onValueChange={setMood} items={MOODS.map((m) => ({ value: m, label: m }))} /></div><div className="mt-3 flex flex-wrap gap-1">{scene.keys.map((k) => <Badge key={k.index} tone={k.punch ? 'amber' : k.impact ? 'red' : 'neutral'}>{k.size ?? '—'} {k.move}{k.punch ? ' · punch' : ''}{k.impact ? ' · impact' : ''}</Badge>)}</div><div className="mt-3 flex gap-2"><Button size="sm" onClick={() => { setSelected(scene.id); setEstimate({ op: 'stills', args: { shots: scene.id, frames: 'mid', quality: 'preview' }, title: 'Render a shot thumbnail' }); }} disabled={readOnly}>Thumbnail</Button><Button size="sm" variant="ghost" onClick={() => setNoteOpen(true)} disabled={readOnly}>Shot note</Button><Button size="sm" variant="ghost" onClick={() => setEstimate({ op: 'lookdev', args: {}, title: 'Render the look-dev sheet' })} disabled={readOnly}>Look-dev</Button></div><img key={`${scene.id}-${Math.round((scene.start + scene.end) * 15)}`} src={fileUrl(id, `stills/f_${Math.round((scene.start + scene.end) * 15)}.jpg`)} alt={`Thumbnail for ${scene.id}`} className="mt-3 max-h-40 rounded-lg border border-studio-line bg-studio-bg object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />{findings.get(scene.id)?.needsHuman ? <div className="mt-3 rounded-lg border border-studio-red/30 bg-studio-red/5 p-2 text-[11px] text-studio-red"><div className="font-medium">Needs human</div>{(findings.get(scene.id)?.findings ?? []).slice(0, 4).map((f, i) => <div key={i} className="text-studio-muted">• {f}</div>)}</div> : <div className="mt-3"><Badge tone="green">board clean</Badge></div>}</> : null}</Panel>
      <Panel className="p-4"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Shots</h2><Badge tone="neutral">{tl.scenes.length} scenes</Badge></div><div className="max-h-[430px] overflow-auto"><table className="w-full text-left text-[11px]"><thead className="text-[9px] uppercase tracking-wide text-studio-faint"><tr><th className="pb-1">scene</th><th className="pb-1">time</th><th className="pb-1">keys</th><th className="pb-1">findings</th></tr></thead><tbody>{tl.scenes.map((s) => <tr key={s.id} onClick={() => setSelected(s.id)} className={`cursor-pointer border-t border-studio-line/60 ${selected === s.id ? 'bg-studio-amber/5' : 'hover:bg-white/[.03]'}`}><td className="py-1.5"><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: MOOD_COLOR[s.mood ?? ''] ?? '#6b7280' }} />{s.id}</td><td className="font-mono text-[10px] text-studio-muted">{s.start.toFixed(1)}–{s.end.toFixed(1)}s</td><td className="text-studio-muted">{s.keys.length}</td><td>{findings.get(s.id)?.needsHuman ? <Badge tone="red">needs human</Badge> : <Badge tone="green">ok</Badge>}</td></tr>)}</tbody></table></div></Panel>
    </div>
    <Panel className="p-4"><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Board review</h2><div className="mt-0.5 text-[11px] text-studio-muted">{filmErrors.length ? `${filmErrors.length} film error(s)` : 'Film check clean'}</div></div><Button size="sm" variant="ghost" onClick={() => setEstimate({ op: 'board', args: { force: true }, title: 'Run the board' })} disabled={readOnly}>Re-run board</Button></div>{(reviewQ.data?.shots ?? []).filter((s) => s.needsHuman).slice(0, 6).map((s) => <div key={s.id} className="mt-2 rounded border border-studio-line bg-studio-bg/35 px-2 py-1.5 text-[11px]"><span className="font-medium text-studio-red">{s.id}</span><span className="text-studio-muted"> · {(s.findings ?? []).join('; ')}</span></div>)}</Panel>
    <DialogShell open={noteOpen} onOpenChange={setNoteOpen} title={`Shot note · ${scene?.id ?? ''}`} description="The note is passed to the board re-run for this shot; the other shots stay as they are." footer={<><Button variant="ghost" onClick={() => setNoteOpen(false)}>Cancel</Button><Button variant="primary" disabled={!note.trim()} onClick={() => { setNoteOpen(false); setEstimate({ op: 'board', args: { shot: scene?.id, notes: note, force: true }, title: 'Re-run this shot' }); }}>Continue to estimate</Button></>}><Field label="Note"><textarea className={inputClass} rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Hold the close-up on Bakasura for two more beats." /></Field></DialogShell>
    {estimate ? <EstimateDialog open onOpenChange={(v) => !v && setEstimate(null)} project={id} op={estimate.op} args={estimate.args} title={estimate.title} onConfirmed={() => { qc.invalidateQueries({ queryKey: ['project', id] }); qc.invalidateQueries({ queryKey: ['timeline', id] }); qc.invalidateQueries({ queryKey: ['file', id, 'board.review.json'] }); qc.invalidateQueries({ queryKey: ['list', id, 'stills'] }); }} /> : null}
  </div>;
}
