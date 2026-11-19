import * as React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cancelJob, getJobs, getProject, runOp, splitProjects, type Job } from '../api/client';
import { Badge, Button, IconButton, Progress, StatusBadge } from './ui';

export const STAGE_ROUTES = [
  { key: 'brief', label: 'Brief' }, { key: 'research', label: 'Research' }, { key: 'script', label: 'Script' },
  { key: 'voice', label: 'Voice' }, { key: 'cast', label: 'Cast' }, { key: 'shotplan', label: 'Shot plan' },
  { key: 'board', label: 'Board' }, { key: 'animatic', label: 'Animatic' },
];

export function LeftRail() {
  const q = useQuery({ queryKey: ['projects'], queryFn: listProjects, staleTime: 15000 });
  const nav = useNavigate();
  return <aside className="flex w-[236px] shrink-0 flex-col border-r border-studio-line bg-studio-panel/60">
    <div className="flex items-center gap-2 px-4 py-4"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-studio-amber text-sm font-bold text-studio-bg">F</div><div><div className="text-sm font-semibold tracking-wide">Fableon</div><div className="text-[10px] uppercase tracking-[.18em] text-studio-faint">studio</div></div></div>
    <div className="px-3"><Button variant="primary" size="sm" className="w-full" onClick={() => nav('/?new=1')}>+ New project</Button></div>
    <div className="mt-4 flex-1 overflow-auto px-2">
      <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[.16em] text-studio-faint">Projects</div>
      {q.isLoading ? <div className="px-2 py-2 text-xs text-studio-muted">Loading…</div> : null}
      {(() => { const { work, fixtures } = splitProjects(q.data?.projects ?? []); return [...work, ...fixtures]; })().map((p) => <NavLink key={`${p.source}:${p.id}`} to={`/p/${encodeURIComponent(p.id)}/brief`} className={({ isActive }) => `mb-0.5 flex items-center gap-2 rounded-md px-2.5 py-2 text-xs ${isActive ? 'bg-studio-amber/10 text-studio-text' : 'text-studio-muted hover:bg-white/5 hover:text-studio-text'}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${p.readOnly ? 'bg-studio-teal' : 'bg-studio-amber'}`} /><span className="min-w-0 flex-1 truncate">{p.title}</span>{p.readOnly ? <span className="text-[9px] uppercase text-studio-faint">fix</span> : null}
      </NavLink>)}
    </div>
    <div className="border-t border-studio-line p-2"><NavLink to="/settings" className={({ isActive }) => `block rounded-md px-2.5 py-2 text-xs ${isActive ? 'bg-studio-amber/10 text-studio-text' : 'text-studio-muted hover:bg-white/5 hover:text-studio-text'}`}>Settings &amp; usage</NavLink></div>
  </aside>;
}

function listProjects() {
  return fetch('/api/projects', { credentials: 'same-origin' }).then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<{ projects: Array<{ id: string; title: string; readOnly: boolean; source: string }> }>; });
}

export function Stepper({ project, current }: { project: string; current: string }) {
  const q = useQuery({ queryKey: ['project', project], queryFn: () => getProject(project), staleTime: 5000 });
  const status = new Map((q.data?.stages ?? []).map((s) => [s.stage, s.status]));
  return <nav aria-label="Stage progress" className="flex min-w-0 items-center gap-0.5 overflow-x-auto pb-1">
    {STAGE_ROUTES.map((s, i) => {
      const st = s.key === 'shotplan' ? status.get('shotplan') ?? status.get('board') : status.get(s.key) ?? 'missing';
      const active = current === s.key || (current === 'board' && s.key === 'board');
      return <React.Fragment key={s.key}><NavLink to={`/p/${encodeURIComponent(project)}/${s.key}`} aria-current={active ? 'step' : undefined} className={`group flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] ${active ? 'bg-studio-amber/10 text-studio-text' : 'text-studio-muted hover:bg-white/5 hover:text-studio-text'}`}>
        <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${st === 'approved' ? 'border-studio-green/50 text-studio-green' : active ? 'border-studio-amber text-studio-amber' : 'border-studio-line text-studio-faint'}`}>{st === 'approved' ? '✓' : i + 1}</span><span>{s.label}</span>
        <span className={`h-1.5 w-1.5 rounded-full ${st === 'approved' ? 'bg-studio-green' : st === 'running' ? 'animate-pulse-soft bg-studio-blue' : st === 'failed' ? 'bg-studio-red' : st === 'stale' || st === 'edited' ? 'bg-studio-amber' : 'bg-studio-faint/60'}`} title={st} />
      </NavLink>{i < STAGE_ROUTES.length - 1 ? <span className="px-0.5 text-studio-faint/40">›</span> : null}</React.Fragment>;
    })}
  </nav>;
}

export function ActivityPanel({ project, open, onToggle }: { project: string; open: boolean; onToggle: () => void }) {
  const qc = useQueryClient();
  const [selected, setSelected] = React.useState<Job | null>(null);
  const q = useQuery({ queryKey: ['jobs', project], queryFn: () => getJobs(project), refetchInterval: 1800 });
  const cancel = useMutation({ mutationFn: cancelJob, onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs', project] }) });
  const resume = useMutation({ mutationFn: (j: Job) => runOp(project, j.op, { ...(j.args as Record<string, unknown>), project: undefined }), onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs', project] }) });
  const jobs = q.data?.jobs ?? [];
  const active = jobs.filter((j) => j.status === 'running' || j.status === 'queued');
  if (!open) return <button aria-label="Open activity" onClick={onToggle} className="fixed right-3 top-3 z-20 rounded-lg border border-studio-line bg-studio-panel/95 px-3 py-2 text-xs text-studio-muted shadow-xl">Activity{active.length ? ` · ${active.length}` : ''}</button>;
  return <aside className="flex w-[330px] shrink-0 flex-col border-l border-studio-line bg-studio-panel/55">
    <div className="flex items-center justify-between border-b border-studio-line px-3 py-3"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-studio-muted">Activity {active.length ? <Badge tone="blue">{active.length} live</Badge> : null}</div><IconButton aria-label="Collapse activity" onClick={onToggle}>×</IconButton></div>
    <div className="flex-1 overflow-auto p-2">
      {!jobs.length ? <div className="px-2 py-6 text-center text-xs text-studio-muted">Jobs appear here while stages run.</div> : null}
      {jobs.slice(0, 20).map((j) => <button key={j.id} onClick={() => setSelected(j)} className="mb-1 block w-full rounded-lg border border-transparent px-2.5 py-2 text-left hover:border-studio-line hover:bg-white/[.03]">
        <div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-medium text-studio-text">{j.op}</span><StatusBadge status={j.status} /></div>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-studio-muted"><span>{j.progress?.step ?? 'queued'}</span>{j.progress?.total ? <span>{j.progress.done}/{j.progress.total}</span> : null}{j.progress?.etaMs ? <span>ETA {Math.round(j.progress.etaMs / 1000)}s</span> : null}</div>
        {j.status === 'running' || j.status === 'queued' ? <Progress className="mt-1.5" done={j.progress?.done} total={j.progress?.total} /> : null}
        {j.status === 'running' && <div className="mt-1 flex justify-end"><span onClick={(e) => { e.stopPropagation(); cancel.mutate(j.id); }} className="text-[10px] text-studio-red hover:underline">Cancel</span></div>}
        {j.status === 'interrupted' && j.resumable ? <div className="mt-1 flex justify-end"><span onClick={(e) => { e.stopPropagation(); resume.mutate(j); }} className="text-[10px] text-studio-amber hover:underline">Resume</span></div> : null}
      </button>)}
    </div>
    {selected ? <div className="border-t border-studio-line p-3"><div className="mb-2 flex items-center justify-between"><div className="text-xs font-semibold">{selected.op}</div><IconButton aria-label="Close job details" onClick={() => setSelected(null)}>×</IconButton></div><div className="mb-1 flex gap-2"><StatusBadge status={selected.status} />{selected.error ? <span className="truncate text-[10px] text-studio-red">{selected.error}</span> : null}</div><pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded bg-studio-bg p-2 text-[10px] leading-4 text-studio-muted">{selected.logTail ?? 'No log tail yet.'}</pre></div> : null}
  </aside>;
}
