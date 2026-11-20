import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, DialogShell, Empty, ErrorNotice, Field, inputClass, Panel, SelectBox } from '../components/ui';
import { getOverview, getStyles, json, patchProject } from '../api/client';

type P = {
  id: string; title: string; readOnly: boolean; source: string; cover: string | null;
  stages: Array<{ stage: string; status: string }>; usage: { costUsd: number; calls: number; cached: number };
  project: { seconds: number; language: string; published?: { platform: string; url: string; publishedAt: string } | null; tags?: string[] };
};
const create = (body: Record<string, unknown>) => json<{ id: string; project: { title: string } }>('/api/projects', { method: 'POST', body: JSON.stringify(body) });
const archive = (id: string) => json<{ archived: string }>(`/api/projects/${encodeURIComponent(id)}/archive`, { method: 'POST', body: '{}' });
const STAGE_KEYS = ['brief', 'research', 'script', 'voice', 'cast', 'shotplan', 'board', 'animatic', 'final', 'publish'];
const DOT: Record<string, string> = { approved: 'bg-studio-green', running: 'animate-pulse-soft bg-studio-blue', failed: 'bg-studio-red', stale: 'bg-studio-amber', edited: 'bg-studio-violet', fresh: 'bg-studio-green/60', missing: 'bg-white/10' };

function statusOf(p: P) {
  if (p.project.published) return { label: 'Published', tone: 'teal' as const };
  if (p.stages.some((s) => s.status === 'running')) return { label: 'Rendering', tone: 'blue' as const };
  if (p.stages.find((s) => s.stage === 'publish')?.status === 'approved' || p.stages.find((s) => s.stage === 'final')?.status === 'approved') return { label: 'Ready to publish', tone: 'green' as const };
  if (p.stages.some((s) => s.status === 'failed')) return { label: 'Needs attention', tone: 'red' as const };
  if (p.stages.some((s) => s.status === 'approved')) return { label: 'Waiting for you', tone: 'amber' as const };
  return { label: 'In progress', tone: 'neutral' as const };
}

export default function Projects() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [topic, setTopic] = React.useState('');
  const [seconds, setSeconds] = React.useState('90');
  const [language, setLanguage] = React.useState('hi');
  const [voice, setVoice] = React.useState('sarvam');
  const [style, setStyle] = React.useState('toon3d');
  const [error, setError] = React.useState<unknown>(null);
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState('all');
  const [hideTests, setHideTests] = React.useState(true);
  const [selected, setSelected] = React.useState<string[]>([]);
  const q = useQuery({ queryKey: ['overview'], queryFn: getOverview });
  const styles = useQuery({ queryKey: ['styles'], queryFn: getStyles });
  const readyStyles = (styles.data?.styles ?? []).filter((s) => s.status === 'ready' && !s.testOnly);
  const chosenStyle = readyStyles.find((s) => s.id === style);
  const m = useMutation({ mutationFn: create, onSuccess: (p) => { qc.invalidateQueries({ queryKey: ['overview'] }); setParams({}); nav(`/p/${encodeURIComponent(p.id)}/brief`); }, onError: setError });
  const a = useMutation({ mutationFn: archive, onSuccess: () => qc.invalidateQueries({ queryKey: ['overview'] }), onError: setError });
  const markTest = useMutation({ mutationFn: ({ id, test }: { id: string; test: boolean }) => patchProject(id, { tags: test ? ['test'] : [] }), onSuccess: () => qc.invalidateQueries({ queryKey: ['overview'] }), onError: setError });
  const open = params.get('new') === '1';
  const projects = q.data?.projects ?? [];
  const work = projects.filter((p) => p.source === 'work');
  const fixtures = projects.filter((p) => p.source === 'fixture');
  const visible = (list: P[]) => list.filter((p) => {
    if (search && !`${p.title} ${p.id}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter !== 'all' && statusOf(p).label.toLowerCase().replace(/\s+/g, '-') !== filter) return false;
    if (hideTests && p.project.tags?.includes('test')) return false;
    return true;
  });
  const submit = (e: React.FormEvent) => { e.preventDefault(); setError(null); m.mutate({ topic, seconds: Number(seconds), language, voice, style }); };
  const bulkArchive = async () => { for (const id of selected) await a.mutateAsync(id); setSelected([]); };
  return <div className="mx-auto max-w-6xl">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[.2em] text-studio-amber">Studio</div><h1 className="mt-1 text-2xl font-semibold">Projects</h1><p className="mt-1 text-sm text-studio-muted">Local films, from a brief to a publishable package.</p></div><Button variant="primary" onClick={() => setParams({ new: '1' })}>+ New project</Button></div>
    {error ? <div className="mt-4"><ErrorNotice error={error} onDismiss={() => setError(null)} /></div> : null}
    <div className="mt-5 flex flex-wrap items-end gap-2"><label className="min-w-52 flex-1"><span className="mb-1 block text-[10px] uppercase tracking-wide text-studio-faint">Search</span><input className={inputClass} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Title or id…" /></label><label className="w-44"><span className="mb-1 block text-[10px] uppercase tracking-wide text-studio-faint">Status</span><SelectBox ariaLabel="Project status filter" value={filter} onValueChange={setFilter} items={[{ value: 'all', label: 'All' }, { value: 'in-progress', label: 'In progress' }, { value: 'waiting-for-you', label: 'Waiting for you' }, { value: 'rendering', label: 'Rendering' }, { value: 'ready-to-publish', label: 'Ready to publish' }, { value: 'published', label: 'Published' }]} /></label><label className="flex items-center gap-2 pb-2 text-xs text-studio-muted"><input type="checkbox" checked={hideTests} onChange={(e) => setHideTests(e.target.checked)} /> Hide test projects</label>{selected.length ? <Button size="sm" variant="danger" className="mb-1" onClick={bulkArchive}>Archive {selected.length}</Button> : null}</div>
    <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-[.16em] text-studio-faint">Work</h2>
    {q.isLoading ? <div className="h-36 rounded-xl border border-studio-line bg-studio-panel shimmer" /> : !visible(work).length ? <Empty title="No matching work projects" body={work.length ? 'Change the search or filters.' : 'Create a project from a topic, then add a source and run the brief.'} action={!work.length ? <Button variant="primary" onClick={() => setParams({ new: '1' })}>Create project</Button> : undefined} /> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visible(work).map((p) => { const s = statusOf(p); return <Panel key={p.id} className="group overflow-hidden"><button className="block w-full text-left" onClick={() => nav(`/p/${encodeURIComponent(p.id)}/brief`)}><div className="relative aspect-[16/9] overflow-hidden bg-studio-bg">{p.cover ? <img src={p.cover} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-[.2em] text-studio-faint">no cover yet</div>}<span className="absolute left-2 top-2"><Badge tone={s.tone}>{s.label}</Badge></span></div><div className="p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-semibold">{p.title}</div><div className="text-[10px] text-studio-faint">{p.id} · {p.project.seconds}s · {p.project.language.toUpperCase()}</div></div><input type="checkbox" aria-label={`Select ${p.id}`} checked={selected.includes(p.id)} onClick={(e) => e.stopPropagation()} onChange={(e) => setSelected((v) => e.target.checked ? [...v, p.id] : v.filter((x) => x !== p.id))} /></div><div className="mt-3 flex items-center gap-1">{STAGE_KEYS.map((k) => <span key={k} title={`${k}: ${p.stages.find((s) => s.stage === k)?.status ?? 'missing'}`} className={`h-1.5 flex-1 rounded-full ${DOT[p.stages.find((s) => s.stage === k)?.status ?? 'missing'] ?? 'bg-white/10'}`} />)}</div><div className="mt-2 flex items-center justify-between text-[10px] text-studio-muted"><span>${Number(p.usage?.costUsd ?? 0).toFixed(2)} spent</span><span>{p.source}</span></div></div></button><div className="flex justify-end gap-1 border-t border-studio-line px-3 py-2"><Button size="sm" variant="ghost" onClick={() => markTest.mutate({ id: p.id, test: !p.project.tags?.includes('test') })}>{p.project.tags?.includes('test') ? 'Unmark test' : 'Mark as test'}</Button><Button size="sm" variant="ghost" onClick={() => { if (confirm(`Archive ${p.title}?`)) a.mutate(p.id); }}>Archive</Button></div></Panel>; })}</div>}
    <h2 className="mb-2 mt-8 text-xs font-semibold uppercase tracking-[.16em] text-studio-faint">Fixtures · read-only</h2>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{fixtures.map((p) => <Panel key={p.id} className="overflow-hidden"><button className="block w-full text-left" onClick={() => nav(`/p/${encodeURIComponent(p.id)}/brief`)}><div className="relative aspect-[16/9] bg-studio-bg">{p.cover ? <img src={p.cover} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-[.2em] text-studio-faint">fixture</div>}<span className="absolute left-2 top-2"><Badge tone="teal">fixture</Badge></span></div><div className="p-3"><div className="truncate text-sm font-semibold">{p.title}</div><div className="text-[10px] text-studio-faint">{p.id} · {p.project.seconds}s</div></div></button></Panel>)}</div>
    <DialogShell open={open} onOpenChange={(v) => !v && setParams({})} title="New project" description="The brief and source material come next. Scripts and narration stay in the project language." footer={<><Button variant="ghost" onClick={() => setParams({})}>Cancel</Button><Button variant="primary" onClick={submit} disabled={m.isPending || !topic.trim()}>{m.isPending ? 'Creating…' : 'Create project'}</Button></>}>
      <form onSubmit={submit} className="grid gap-4"><Field label="Topic"><input className={inputClass} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Savitri and Satyavan: the princess who out-argued Death" autoFocus /></Field><div className="grid grid-cols-2 gap-3"><Field label="Seconds"><input className={inputClass} type="number" min={10} max={600} value={seconds} onChange={(e) => setSeconds(e.target.value)} /></Field><Field label="Language"><SelectBox ariaLabel="Language" value={language} onValueChange={setLanguage} items={[{ value: 'hi', label: 'Hindi' }, { value: 'en', label: 'English' }]} /></Field></div><Field label="Voice provider" hint="The voice can be changed later on the Voice screen."><SelectBox ariaLabel="Voice provider" value={voice} onValueChange={setVoice} items={[{ value: 'sarvam', label: 'Sarvam (Hindi)' }, { value: 'elevenlabs', label: 'ElevenLabs' }, { value: 'kokoro', label: 'Kokoro (English)' }]} /></Field><Field label="Style" hint="The pack changes the picture, never the shared script, voice, sound or publish pipeline. It can be changed freely until the cast is approved."><div className="flex items-center gap-3"><div className="min-w-0 flex-1"><SelectBox ariaLabel="Style" value={style} onValueChange={setStyle} items={readyStyles.length ? readyStyles.map((s) => ({ value: s.id, label: s.name })) : [{ value: 'toon3d', label: '2D cartoon cards in a 3D world' }]} /></div>{chosenStyle?.sample ? <img src={chosenStyle.sample} alt="" className="h-14 w-9 rounded border border-studio-line object-cover" /> : null}</div></Field></form>
    </DialogShell>
  </div>;
}
