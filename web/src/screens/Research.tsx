import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { approveStage, fileUrl, getList, getProject, json, patchProject, text } from '../api/client';
import { Badge, Button, Empty, ErrorNotice, Panel, Spinner, StatusBadge } from '../components/ui';
import { EstimateDialog } from '../components/EstimateDialog';

type Fact = { id: string; claim: string; kind?: string; supports?: string; verified?: boolean; sources?: Array<{ source: string; quote: string }> };
type Facts = { facts: Fact[] };
type Source = { id: string; title: string; kind: string; path?: string; url?: string; chars?: number; retrievedAt?: string };

export default function Research() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const project = useQuery({ queryKey: ['project', id], queryFn: () => getProject(id) });
  const facts = useQuery({ queryKey: ['file', id, 'research/facts.json'], queryFn: () => json<Facts>(fileUrl(id, 'research/facts.json')) });
  const sources = useQuery({ queryKey: ['file', id, 'research/sources.json'], queryFn: () => json<{ sources: Source[] }>(fileUrl(id, 'research/sources.json')) });
  const files = useQuery({ queryKey: ['list', id, 'research/sources'], queryFn: () => getList(id, 'research/sources') });
  const keys = useQuery({ queryKey: ['settings', 'keys'], queryFn: () => json<Record<string, 'set' | 'unset'>>('/api/settings/keys') });
  const [error, setError] = React.useState<unknown>(null);
  const [estimateOpen, setEstimateOpen] = React.useState(false);
  const [onlyUsable, setOnlyUsable] = React.useState(true);
  const readOnly = !!project.data?.readOnly;
  const stage = project.data?.stages.find((s) => s.stage === 'research');
  const upload = useMutation({ mutationFn: async (fs: FileList | File[]) => { for (const f of Array.from(fs)) { const form = new FormData(); form.append('file', f); await json(`/api/projects/${encodeURIComponent(id)}/sources`, { method: 'POST', body: form }); } }, onSuccess: () => { qc.invalidateQueries({ queryKey: ['list', id, 'research/sources'] }); qc.invalidateQueries({ queryKey: ['project', id] }); }, onError: setError });
  const web = useMutation({ mutationFn: (on: boolean) => patchProject(id, { research: { ...(project.data?.project.research ?? {}), web: on } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id] }), onError: setError });
  const approve = useMutation({ mutationFn: () => approveStage(id, 'research'), onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id] }), onError: setError });
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); if (!readOnly && e.dataTransfer.files.length) upload.mutate(e.dataTransfer.files); };
  const rows = (facts.data?.facts ?? []).filter((f) => !onlyUsable || f.verified !== false);
  return <div className="mx-auto max-w-5xl space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[.18em] text-studio-amber">Stage 2</div><h1 className="mt-1 text-xl font-semibold">Research</h1><p className="mt-1 text-sm text-studio-muted">Upload source material, then extract only quotes you can verify.</p></div><div className="flex items-center gap-2">{stage ? <StatusBadge status={stage.status} /> : null}<Button variant="primary" onClick={() => setEstimateOpen(true)} disabled={readOnly}>Run research</Button><Button onClick={() => approve.mutate()} disabled={readOnly || stage?.status === 'approved'}>{stage?.status === 'approved' ? 'Approved' : 'Approve'}</Button></div></div>
    {error ? <ErrorNotice error={error} onDismiss={() => setError(null)} /> : null}
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      <Panel className="p-4"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Sources</h2><Badge tone="neutral">{sources.data?.sources.length ?? 0} indexed</Badge></div>
        <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop} className="rounded-lg border border-dashed border-studio-line bg-studio-bg/40 p-4 text-center"><div className="text-xs text-studio-muted">Drop .md, .txt or .html here, or</div><label className="mt-2 inline-flex cursor-pointer rounded-md border border-studio-line px-3 py-1.5 text-xs text-studio-text hover:border-studio-amber/50">Choose files<input type="file" className="sr-only" accept=".md,.txt,.html" multiple disabled={readOnly} onChange={(e) => e.target.files && upload.mutate(e.target.files)} /></label>{upload.isPending ? <div className="mt-2 text-[11px] text-studio-amber">Uploading…</div> : null}</div>
        <ul className="mt-3 space-y-1.5">{(files.data?.files ?? []).map((f) => <li key={f.path} className="flex items-center justify-between rounded bg-white/[.03] px-2 py-1.5 text-[11px]"><span className="truncate text-studio-text">{f.name}</span><span className="text-studio-faint">{(f.size / 1024).toFixed(1)} KB</span></li>)}</ul>
        <div className="mt-4 flex items-center justify-between border-t border-studio-line pt-3"><div><div className="text-xs font-medium">Web search</div><div className="text-[10px] text-studio-muted">TAVILY_API_KEY: {keys.data?.TAVILY_API_KEY === 'set' ? 'set' : 'unset'}</div></div><button role="switch" aria-checked={!!project.data?.project.research?.web} aria-label="Web search" disabled={readOnly} onClick={() => web.mutate(!project.data?.project.research?.web)} className={`relative h-5 w-9 rounded-full transition ${project.data?.project.research?.web ? 'bg-studio-amber' : 'bg-studio-line'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${project.data?.project.research?.web ? 'left-4' : 'left-0.5'}`} /></button></div>
      </Panel>
      <Panel className="p-4"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Facts</h2><label className="flex items-center gap-1.5 text-[10px] text-studio-muted"><input type="checkbox" checked={onlyUsable} onChange={(e) => setOnlyUsable(e.target.checked)} /> usable only</label></div>
        {facts.isLoading ? <div className="flex items-center gap-2 text-xs text-studio-muted"><Spinner /> Loading facts…</div> : !rows.length ? <Empty title="No facts yet" body="Run research after uploading at least one source." /> : <div className="max-h-[460px] space-y-2 overflow-auto pr-1">{rows.map((f) => <div key={f.id} className="rounded-lg border border-studio-line bg-studio-bg/35 p-2.5"><div className="flex items-start justify-between gap-2"><div className="text-xs leading-5">{f.claim}</div><Badge tone={f.verified === false ? 'red' : 'green'}>{f.verified === false ? 'unusable' : 'verified'}</Badge></div><div className="mt-1 text-[10px] text-studio-faint">{(f.sources ?? []).map((s) => `${s.source}: “${s.quote}”`).join(' · ')}</div></div>)}</div>}
      </Panel>
    </div>
    <EstimateDialog open={estimateOpen} onOpenChange={setEstimateOpen} project={id} op="run" args={{ to: 'research', only: 'research', force: true }} title="Run research" onConfirmed={() => { qc.invalidateQueries({ queryKey: ['project', id] }); qc.invalidateQueries({ queryKey: ['file', id, 'research/facts.json'] }); qc.invalidateQueries({ queryKey: ['file', id, 'research/sources.json'] }); }} />
  </div>;
}
