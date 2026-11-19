import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, DialogShell, Empty, ErrorNotice, Field, inputClass, Panel, SelectBox } from '../components/ui';
import { json, splitProjects } from '../api/client';

type P = { id: string; title: string; path: string; readOnly: boolean; source: string; updatedAt: string };
const list = () => json<{ projects: P[] }>('/api/projects');
const create = (body: Record<string, unknown>) => json<{ id: string; project: { title: string } }>('/api/projects', { method: 'POST', body: JSON.stringify(body) });
const archive = (id: string) => json<{ archived: string }>(`/api/projects/${encodeURIComponent(id)}/archive`, { method: 'POST', body: '{}' });

export default function Projects() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [topic, setTopic] = React.useState('');
  const [seconds, setSeconds] = React.useState('90');
  const [language, setLanguage] = React.useState('hi');
  const [voice, setVoice] = React.useState('sarvam');
  const [error, setError] = React.useState<unknown>(null);
  const q = useQuery({ queryKey: ['projects'], queryFn: list });
  const m = useMutation({ mutationFn: create, onSuccess: (p) => { qc.invalidateQueries({ queryKey: ['projects'] }); setParams({}); nav(`/p/${encodeURIComponent(p.id)}/brief`); }, onError: setError });
  const a = useMutation({ mutationFn: archive, onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }), onError: setError });
  const open = params.get('new') === '1';
  const projects = q.data?.projects ?? [];
  const { work, fixtures } = splitProjects(projects);
  const submit = (e: React.FormEvent) => { e.preventDefault(); setError(null); m.mutate({ topic, seconds: Number(seconds), language, voice }); };
  return <div className="mx-auto max-w-5xl">
    <div className="flex items-end justify-between"><div><div className="text-[10px] font-semibold uppercase tracking-[.2em] text-studio-amber">Studio</div><h1 className="mt-1 text-2xl font-semibold">Projects</h1><p className="mt-1 text-sm text-studio-muted">Local films, from a brief to an animatic.</p></div><Button variant="primary" onClick={() => setParams({ new: '1' })}>+ New project</Button></div>
    {error ? <div className="mt-4"><ErrorNotice error={error} onDismiss={() => setError(null)} /></div> : null}
    <h2 className="mb-2 mt-8 text-xs font-semibold uppercase tracking-[.16em] text-studio-faint">Work</h2>
    {q.isLoading ? <div className="h-28 rounded-xl border border-studio-line bg-studio-panel shimmer" /> : !work.length ? <Empty title="No work projects yet" body="Create a project from a topic, then add a source and run the brief." action={<Button variant="primary" onClick={() => setParams({ new: '1' })}>Create project</Button>} /> : <div className="grid gap-3 sm:grid-cols-2">{work.map((p) => <Panel key={p.id} className="group p-4 hover:border-studio-amber/35"><button className="block w-full text-left" onClick={() => nav(`/p/${encodeURIComponent(p.id)}/brief`)}><div className="flex items-start justify-between gap-3"><div className="text-sm font-semibold">{p.title}</div><span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-studio-muted">{p.id}</span></div><div className="mt-1 text-xs text-studio-muted">Updated {new Date(p.updatedAt).toLocaleString()}</div></button><div className="mt-3 flex items-center justify-between border-t border-studio-line pt-3"><span className="text-[10px] uppercase tracking-wide text-studio-faint">work</span><Button size="sm" variant="ghost" onClick={() => { if (confirm(`Archive ${p.title}? It moves to work/.archive.`)) a.mutate(p.id); }}>Archive</Button></div></Panel>)}</div>}
    <h2 className="mb-2 mt-10 text-xs font-semibold uppercase tracking-[.16em] text-studio-faint">Fixtures · read-only</h2>
    <div className="grid gap-3 sm:grid-cols-2">{fixtures.map((p) => <Panel key={p.id} className="p-4"><button className="block w-full text-left" onClick={() => nav(`/p/${encodeURIComponent(p.id)}/brief`)}><div className="flex items-start justify-between gap-3"><div className="text-sm font-semibold">{p.title}</div><span className="rounded bg-studio-teal/10 px-1.5 py-0.5 text-[10px] text-studio-teal">fixture</span></div><div className="mt-1 text-xs text-studio-muted">Browse the reference films without changing them.</div></button></Panel>)}</div>
    <DialogShell open={open} onOpenChange={(v) => !v && setParams({})} title="New project" description="The brief and source material come next. Scripts and narration stay in the project language." footer={<><Button variant="ghost" onClick={() => setParams({})}>Cancel</Button><Button variant="primary" onClick={submit} disabled={m.isPending || !topic.trim()}>{m.isPending ? 'Creating…' : 'Create project'}</Button></>}>
      <form onSubmit={submit} className="grid gap-4"><Field label="Topic"><input className={inputClass} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Savitri and Satyavan: the princess who out-argued Death" autoFocus /></Field><div className="grid grid-cols-2 gap-3"><Field label="Seconds"><input className={inputClass} type="number" min={10} max={600} value={seconds} onChange={(e) => setSeconds(e.target.value)} /></Field><Field label="Language"><SelectBox ariaLabel="Language" value={language} onValueChange={setLanguage} items={[{ value: 'hi', label: 'Hindi' }, { value: 'en', label: 'English' }]} /></Field></div><Field label="Voice provider" hint="The voice can be changed later on the Voice screen."><SelectBox ariaLabel="Voice provider" value={voice} onValueChange={setVoice} items={[{ value: 'sarvam', label: 'Sarvam (Hindi)' }, { value: 'elevenlabs', label: 'ElevenLabs' }, { value: 'kokoro', label: 'Kokoro (English)' }]} /></Field></form>
    </DialogShell>
  </div>;
}
