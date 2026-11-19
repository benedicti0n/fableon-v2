import * as React from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/noto-sans-devanagari/400.css';
import '@fontsource/noto-sans-devanagari/600.css';
import './styles.css';
import { useQueryClient } from '@tanstack/react-query';
import { getProject } from './api/client';
import { ActivityPanel, LeftRail, Stepper } from './components/layout';
import { Badge } from './components/ui';
import { useEvents } from './hooks/useEvents';
import Projects from './screens/Projects';
import Settings from './screens/Settings';
import Brief from './screens/Brief';
import Research from './screens/Research';
import Script from './screens/Script';
import Voice from './screens/Voice';
import Cast from './screens/Cast';
import Board from './screens/Board';
import Animatic from './screens/Animatic';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } });

function ProjectFrame({ children }: { children: React.ReactNode }) {
  const { id = '' } = useParams();
  const q = useQueryClient();
  const loc = useLocation();
  const [activity, setActivity] = React.useState(true);
  const current = loc.pathname.split('/').pop() ?? 'brief';
  const project = useQuery({ queryKey: ['project', id], queryFn: () => getProject(id), enabled: !!id });
  useEvents(id, (e) => {
    if (e.type === 'progress') { q.invalidateQueries({ queryKey: ['jobs', id] }); return; }
    if (e.type === 'status' || (e.type === 'job' && ['done', 'failed', 'cancelled', 'interrupted'].includes(e.status ?? ''))) {
      q.invalidateQueries({ queryKey: ['project', id] }); q.invalidateQueries({ queryKey: ['stages', id] }); q.invalidateQueries({ queryKey: ['jobs', id] });
      q.invalidateQueries({ queryKey: ['file', id] }); q.invalidateQueries({ queryKey: ['timeline', id] }); q.invalidateQueries({ queryKey: ['peaks', id] }); q.invalidateQueries({ queryKey: ['list', id] }); q.invalidateQueries({ queryKey: ['projects'] });
    }
    if (e.type === 'job' && (e.status === 'queued' || e.status === 'running')) q.invalidateQueries({ queryKey: ['jobs', id] });
  });
  React.useEffect(() => { const f = () => { if (id) { q.invalidateQueries({ queryKey: ['project', id] }); q.invalidateQueries({ queryKey: ['stages', id] }); } }; window.addEventListener('focus', f); return () => window.removeEventListener('focus', f); }, [id, q]);
  return <div className="flex h-full min-w-0 flex-1">
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="border-b border-studio-line bg-studio-panel/40 px-5 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-base font-semibold">{project.data?.project.title ?? id}</h1>{project.data?.readOnly ? <Badge tone="teal">fixture · read-only</Badge> : null}</div><div className="mt-0.5 text-[11px] text-studio-muted">{project.data?.project.topic} · {project.data?.project.seconds}s · {project.data?.project.language.toUpperCase()}</div></div>
          {project.data?.usage ? <div className="shrink-0 text-right text-[10px] leading-4 text-studio-muted"><div>${Number(project.data.usage.costUsd ?? 0).toFixed(4)} logged</div><div>{project.data.usage.calls} live / {project.data.usage.cached} cached</div></div> : null}
        </div>
        <div className="mt-3"><Stepper project={id} current={current} /></div>
      </header>
      <main className="min-h-0 flex-1 overflow-auto px-5 py-5">{children}</main>
    </div>
    <ActivityPanel project={id} open={activity} onToggle={() => setActivity((v) => !v)} />
  </div>;
}

function App() {
  return <BrowserRouter><Routes>
    <Route path="/" element={<div className="flex h-full"><LeftRail /><main className="min-w-0 flex-1 overflow-auto px-6 py-6"><Projects /></main></div>} />
    <Route path="/settings" element={<div className="flex h-full"><LeftRail /><main className="min-w-0 flex-1 overflow-auto px-6 py-6"><Settings /></main></div>} />
    <Route path="/p/:id" element={<Navigate to="brief" replace />} />
    {['brief', 'research', 'script', 'voice', 'cast', 'shotplan', 'board', 'animatic'].map((stage) => <Route key={stage} path={`/p/:id/${stage}`} element={<ProjectFrame>{stage === 'brief' ? <Brief /> : stage === 'research' ? <Research /> : stage === 'script' ? <Script /> : stage === 'voice' ? <Voice /> : stage === 'cast' ? <Cast /> : stage === 'board' || stage === 'shotplan' ? <Board /> : <Animatic />}</ProjectFrame>} />)}
    <Route path="*" element={<div className="p-10 text-studio-muted">Not found.</div>} />
  </Routes></BrowserRouter>;
}

export default function Root() { return <QueryClientProvider client={qc}><App /></QueryClientProvider>; }
