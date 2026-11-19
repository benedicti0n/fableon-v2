import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { approveStage, fileUrl, getProject, json, putFile, text } from '../api/client';
import { Button, ErrorNotice, Panel, Spinner, StatusBadge } from '../components/ui';
import { EstimateDialog } from '../components/EstimateDialog';
import { Markdown } from '../lib/markdown';

export default function Brief() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const project = useQuery({ queryKey: ['project', id], queryFn: () => getProject(id) });
  const file = useQuery({ queryKey: ['file', id, 'brief.md'], queryFn: () => text(fileUrl(id, 'brief.md')) });
  const [draft, setDraft] = React.useState('');
  const [tab, setTab] = React.useState<'edit' | 'preview'>('edit');
  const [error, setError] = React.useState<unknown>(null);
  const [estimateOpen, setEstimateOpen] = React.useState(false);
  React.useEffect(() => { if (file.data !== undefined) setDraft(file.data); }, [file.data]);
  const stage = project.data?.stages.find((s) => s.stage === 'brief');
  const readOnly = !!project.data?.readOnly;
  const save = useMutation({ mutationFn: () => putFile(id, 'brief.md', draft), onSuccess: () => qc.invalidateQueries({ queryKey: ['file', id, 'brief.md'] }), onError: setError });
  const approve = useMutation({ mutationFn: () => approveStage(id, 'brief'), onSuccess: () => { qc.invalidateQueries({ queryKey: ['project', id] }); }, onError: setError });
  if (file.isLoading || project.isLoading) return <div className="flex items-center gap-2 text-sm text-studio-muted"><Spinner /> Loading brief…</div>;
  return <div className="mx-auto max-w-4xl space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[.18em] text-studio-amber">Stage 1</div><h1 className="mt-1 text-xl font-semibold">Brief</h1><p className="mt-1 text-sm text-studio-muted">The film's audience, angle, must-haves and avoid list.</p></div><div className="flex items-center gap-2">{stage ? <StatusBadge status={stage.status} /> : null}<Button onClick={() => save.mutate()} disabled={readOnly || save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button><Button variant="primary" onClick={() => approve.mutate()} disabled={readOnly || stage?.status === 'approved'}>{stage?.status === 'approved' ? 'Approved' : 'Approve'}</Button></div></div>
    {error ? <ErrorNotice error={error} onDismiss={() => setError(null)} /> : null}
    <Panel className="overflow-hidden"><div className="flex items-center justify-between border-b border-studio-line px-3 py-2"><div className="flex gap-1"><button className={`rounded px-2 py-1 text-xs ${tab === 'edit' ? 'bg-white/10 text-studio-text' : 'text-studio-muted hover:text-studio-text'}`} onClick={() => setTab('edit')}>Edit</button><button className={`rounded px-2 py-1 text-xs ${tab === 'preview' ? 'bg-white/10 text-studio-text' : 'text-studio-muted hover:text-studio-text'}`} onClick={() => setTab('preview')}>Preview</button></div><Button size="sm" variant="ghost" onClick={() => setEstimateOpen(true)} disabled={readOnly}>Draft with AI</Button></div>{tab === 'edit' ? <textarea aria-label="Brief markdown" className="min-h-[480px] w-full resize-y bg-studio-bg/50 p-4 font-mono text-[13px] leading-6 text-studio-text outline-none" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} readOnly={readOnly} /> : <div className="min-h-[480px] p-5"><Markdown source={draft} /></div>}</Panel>
    <EstimateDialog open={estimateOpen} onOpenChange={setEstimateOpen} project={id} op="run" args={{ to: 'brief', only: 'brief', force: true }} title="Draft the brief with AI" onConfirmed={() => { qc.invalidateQueries({ queryKey: ['project', id] }); qc.invalidateQueries({ queryKey: ['file', id, 'brief.md'] }); }} />
  </div>;
}
