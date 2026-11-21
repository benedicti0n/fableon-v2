import * as React from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/noto-sans-devanagari/400.css';
import '@fontsource/noto-sans-devanagari/600.css';
import './styles.css';
import { useQueryClient } from '@tanstack/react-query';
import { changeStyle, getProject, getStyles } from './api/client';
import { ActivityPanel, LeftRail, Stepper } from './components/layout';
import { Badge } from './components/ui';
import { useEvents } from './hooks/useEvents';

const Projects = React.lazy(() => import('./screens/Projects'));
const Settings = React.lazy(() => import('./screens/Settings'));
const Brief = React.lazy(() => import('./screens/Brief'));
const Research = React.lazy(() => import('./screens/Research'));
const Script = React.lazy(() => import('./screens/Script'));
const Voice = React.lazy(() => import('./screens/Voice'));
const Cast = React.lazy(() => import('./screens/Cast'));
const Board = React.lazy(() => import('./screens/Board'));
const Animatic = React.lazy(() => import('./screens/Animatic'));
const Finish = React.lazy(() => import('./screens/Finish'));
const Publish = React.lazy(() => import('./screens/Publish'));
const Queue = React.lazy(() => import('./screens/Queue'));
const Presets = React.lazy(() => import('./screens/Presets'));
const Costs = React.lazy(() => import('./screens/Costs'));
const Catalog = React.lazy(() => import('./screens/Catalog'));

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } });

function ProjectFrame({ children }: { children: React.ReactNode }) {
  const { id = '' } = useParams();
  const q = useQueryClient();
  const loc = useLocation();
  const [activity, setActivity] = React.useState(true);
  const [budgetAlert, setBudgetAlert] = React.useState<string | null>(null);
  const current = loc.pathname.split('/').pop() ?? 'brief';
  const project = useQuery({ queryKey: ['project', id], queryFn: () => getProject(id), enabled: !!id });
  const styles = useQuery({ queryKey: ['styles'], queryFn: getStyles });
  const [styleError, setStyleError] = React.useState<string | null>(null);
  const styleMut = useMutation({
    mutationFn: ({ next, confirm }: { next: string; confirm: boolean }) => changeStyle(id, next, confirm),
    onSuccess: () => { setStyleError(null); q.invalidateQueries({ queryKey: ['project', id] }); q.invalidateQueries({ queryKey: ['stages', id] }); q.invalidateQueries({ queryKey: ['jobs', id] }); q.invalidateQueries({ queryKey: ['overview'] }); },
    onError: (e: Error) => setStyleError(e.message),
  });
  const pickStyle = (next: string) => {
    const current = project.data?.project.style ?? 'toon3d';
    if (!next || next === current) return;
    const castApproved = project.data?.stages.find((s) => s.stage === 'cast')?.status === 'approved';
    if (castApproved && !window.confirm('Changing the style re-runs cast, shot plan, board and animatic (estimate $0.02-$0.10). The old outputs stay in history. Continue?')) return;
    styleMut.mutate({ next, confirm: !!castApproved });
  };
  useEvents(id, (e) => {
    if (e.type === 'budget') { setBudgetAlert(e.message ?? 'A budget threshold was crossed.'); q.invalidateQueries({ queryKey: ['costs'] }); }
    if (e.type === 'queue') { q.invalidateQueries({ queryKey: ['queue'] }); return; }
    if (e.type === 'progress') { q.invalidateQueries({ queryKey: ['jobs', id] }); return; }
    if (e.type === 'status' || (e.type === 'job' && ['done', 'failed', 'cancelled', 'interrupted'].includes(e.status ?? ''))) {
      q.invalidateQueries({ queryKey: ['project', id] }); q.invalidateQueries({ queryKey: ['stages', id] }); q.invalidateQueries({ queryKey: ['jobs', id] });
      q.invalidateQueries({ queryKey: ['file', id] }); q.invalidateQueries({ queryKey: ['final-plan', id] }); q.invalidateQueries({ queryKey: ['timeline', id] }); q.invalidateQueries({ queryKey: ['peaks', id] }); q.invalidateQueries({ queryKey: ['list', id] }); q.invalidateQueries({ queryKey: ['projects'] });
    }
    if (e.type === 'job' && (e.status === 'queued' || e.status === 'running')) q.invalidateQueries({ queryKey: ['jobs', id] });
  });
  React.useEffect(() => { const f = () => { if (id) { q.invalidateQueries({ queryKey: ['project', id] }); q.invalidateQueries({ queryKey: ['stages', id] }); } }; window.addEventListener('focus', f); return () => window.removeEventListener('focus', f); }, [id, q]);
  return <div className="flex h-full min-w-0 flex-1">
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="border-b border-studio-line bg-studio-panel/40 px-5 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-base font-semibold">{project.data?.project.title ?? id}</h1>{project.data?.readOnly ? <Badge tone="teal">fixture · read-only</Badge> : null}</div><div className="mt-0.5 text-[11px] text-studio-muted">{project.data?.project.topic} · {project.data?.project.seconds}s · {project.data?.project.language.toUpperCase()}</div></div>
          <div className="shrink-0 text-right text-[10px] leading-4 text-studio-muted">{project.data && !project.data.readOnly ? <label className="mb-1 flex items-center justify-end gap-1"><span className="uppercase tracking-wide">style</span><select aria-label="Style" className="rounded border border-studio-line bg-studio-bg px-1.5 py-0.5 text-[10px] text-studio-text" value={project.data.project.style ?? 'toon3d'} onChange={(e) => pickStyle(e.target.value)}>{(styles.data?.styles ?? []).filter((s) => s.status === 'ready' && !s.testOnly).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label> : null}{styleError ? <div role="alert" className="max-w-52 text-studio-red">{styleError}</div> : null}{project.data?.usage ? <div>${Number(project.data.usage.costUsd ?? 0).toFixed(4)} logged</div> : null}{project.data?.usage ? <div>{project.data.usage.calls} live / {project.data.usage.cached} cached</div> : null}</div>
        </div>
        <div className="mt-3"><Stepper project={id} current={current} /></div>
      </header>
      {budgetAlert ? <div role="alert" className="flex items-center justify-between border-b border-studio-amber/40 bg-studio-amber/10 px-5 py-2 text-xs text-studio-amber"><span>Budget: {budgetAlert}</span><button onClick={() => setBudgetAlert(null)} className="text-studio-muted hover:text-studio-text">Dismiss</button></div> : null}
      <main className="min-h-0 flex-1 overflow-auto px-5 py-5">{children}</main>
    </div>
    <ActivityPanel project={id} open={activity} onToggle={() => setActivity((v) => !v)} />
  </div>;
}

function App() {
  return <BrowserRouter><React.Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-studio-muted">Loading studio…</div>}><Routes>
    <Route path="/" element={<div className="flex h-full"><LeftRail /><main className="min-w-0 flex-1 overflow-auto px-6 py-6"><Projects /></main></div>} />
    <Route path="/queue" element={<div className="flex h-full"><LeftRail /><main className="min-w-0 flex-1 overflow-auto px-6 py-6"><Queue /></main></div>} />
    <Route path="/costs" element={<div className="flex h-full"><LeftRail /><main className="min-w-0 flex-1 overflow-auto px-6 py-6"><Costs /></main></div>} />
    <Route path="/presets" element={<div className="flex h-full"><LeftRail /><main className="min-w-0 flex-1 overflow-auto px-6 py-6"><Presets /></main></div>} />
    <Route path="/catalog" element={<div className="flex h-full"><LeftRail /><main className="min-w-0 flex-1 overflow-auto px-6 py-6"><Catalog /></main></div>} />
    <Route path="/settings" element={<div className="flex h-full"><LeftRail /><main className="min-w-0 flex-1 overflow-auto px-6 py-6"><Settings /></main></div>} />
    <Route path="/p/:id" element={<Navigate to="brief" replace />} />
    {['brief', 'research', 'script', 'voice', 'cast', 'shotplan', 'board', 'animatic', 'finish', 'publish'].map((stage) => <Route key={stage} path={`/p/:id/${stage}`} element={<ProjectFrame>{stage === 'brief' ? <Brief /> : stage === 'research' ? <Research /> : stage === 'script' ? <Script /> : stage === 'voice' ? <Voice /> : stage === 'cast' ? <Cast /> : stage === 'publish' ? <Publish /> : stage === 'finish' ? <Finish /> : stage === 'board' || stage === 'shotplan' ? <Board /> : <Animatic />}</ProjectFrame>} />)}
    <Route path="*" element={<div className="p-10 text-studio-muted">Not found.</div>} />
  </Routes></React.Suspense></BrowserRouter>;
}

export default function Root() { return <QueryClientProvider client={qc}><App /></QueryClientProvider>; }
