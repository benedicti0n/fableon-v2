import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { approveStage, fileUrl, getProject, json } from '../api/client';
import { Badge, Button, DialogShell, ErrorNotice, Field, inputClass, Panel, Spinner, StatusBadge } from '../components/ui';
import { EstimateDialog } from '../components/EstimateDialog';

type Character = { id: string; name: string; spec?: Record<string, unknown>; cast?: string; mustHave?: string[]; notes?: string; scale?: number };
type Cast = { characters: Character[] };
type Assets = { assets: Array<{ id?: string; kind?: string; name?: string; standIn?: string; reason?: string }> };

const swatches = (spec: Record<string, unknown> = {}) => ['skin', 'top', 'lower', 'sari', 'drape', 'hairCol', 'crownCol', 'border'].map((k) => [k, spec[k]] as const).filter(([, v]) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)).slice(0, 6);

export default function Cast() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const project = useQuery({ queryKey: ['project', id], queryFn: () => getProject(id) });
  const castQ = useQuery({ queryKey: ['file', id, 'cast.json'], queryFn: () => json<Cast>(fileUrl(id, 'cast.json')).catch(() => ({ characters: [] })) });
  const assetsQ = useQuery({ queryKey: ['file', id, 'assets.todo.json'], queryFn: () => json<Assets>(fileUrl(id, 'assets.todo.json')).catch(() => ({ assets: [] })) });
  const [error, setError] = React.useState<unknown>(null);
  const [notes, setNotes] = React.useState('');
  const [notesOpen, setNotesOpen] = React.useState(false);
  const [estimateOpen, setEstimateOpen] = React.useState(false);
  const readOnly = !!project.data?.readOnly;
  const stage = project.data?.stages.find((s) => s.stage === 'cast');
  const approve = useMutation({ mutationFn: () => approveStage(id, 'cast'), onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id] }), onError: setError });
  const characters = castQ.data?.characters ?? [];
  return <div className="mx-auto max-w-5xl space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[.18em] text-studio-amber">Stage 5</div><h1 className="mt-1 text-xl font-semibold">Cast</h1><p className="mt-1 text-sm text-studio-muted">Design the characters, verify the sheet and fill asset gaps before the shot plan.</p></div><div className="flex items-center gap-2">{stage ? <StatusBadge status={stage.status} /> : null}<Button onClick={() => setEstimateOpen(true)} disabled={readOnly}>Re-run cast</Button><Button variant="primary" onClick={() => approve.mutate()} disabled={readOnly || stage?.status === 'approved'}>{stage?.status === 'approved' ? 'Approved' : 'Approve'}</Button></div></div>
    {error ? <ErrorNotice error={error} onDismiss={() => setError(null)} /> : null}
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      <Panel className="overflow-hidden p-3"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Cast sheet</h2><Badge tone="neutral">{characters.length} characters</Badge></div>{castQ.isLoading ? <div className="flex h-64 items-center justify-center"><Spinner /></div> : <img src={fileUrl(id, 'cast/cast-sheet.jpg')} alt="Cast sheet" className="w-full rounded-lg border border-studio-line bg-studio-bg object-contain" />}</Panel>
      <Panel className="p-4"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Characters</h2><Button size="sm" variant="ghost" onClick={() => setNotesOpen(true)} disabled={readOnly}>Notes / re-run</Button></div><div className="max-h-[440px] space-y-2 overflow-auto pr-1">{characters.map((c) => <div key={c.id} className="rounded-lg border border-studio-line bg-studio-bg/35 p-2.5"><div className="flex items-start justify-between gap-2"><div><div className="text-xs font-semibold">{c.name} <span className="font-normal text-studio-faint">({c.id})</span></div><div className="mt-0.5 text-[10px] text-studio-muted">{c.cast ?? 'inline spec'} · scale {c.scale ?? 1}</div></div><div className="flex gap-1">{(c.mustHave ?? []).map((m) => <Badge key={m} tone="violet">{m}</Badge>)}</div></div><div className="mt-2 flex flex-wrap gap-1">{swatches(c.spec).map(([k, v]) => <span key={k} title={`${k} ${v}`} className="flex items-center gap-1 rounded bg-white/[.04] px-1.5 py-0.5 text-[9px] text-studio-muted"><span className="h-2.5 w-2.5 rounded-sm border border-white/20" style={{ background: String(v) }} />{k}</span>)}</div>{c.notes ? <div className="mt-1.5 text-[10px] text-studio-muted">{c.notes}</div> : null}</div>)}</div></Panel>
    </div>
    <Panel className="p-4"><h2 className="mb-2 text-sm font-semibold">Asset gaps</h2>{!assetsQ.data?.assets.length ? <div className="text-xs text-studio-muted">No gaps reported.</div> : <div className="grid gap-2 sm:grid-cols-2">{(assetsQ.data?.assets ?? []).map((a, i) => <div key={i} className="rounded-lg border border-studio-line bg-studio-bg/35 p-2 text-xs"><div className="flex items-center justify-between"><span className="font-medium">{a.name ?? a.id ?? 'asset'}</span><Badge tone="amber">{a.standIn ?? 'no stand-in'}</Badge></div><div className="mt-1 text-[10px] text-studio-muted">{a.reason ?? a.kind ?? ''}</div></div>)}</div>}</Panel>
    <DialogShell open={notesOpen} onOpenChange={setNotesOpen} title="Director notes for the cast" description="Only the named characters should change; the cast stage keeps the rest." footer={<><Button variant="ghost" onClick={() => setNotesOpen(false)}>Cancel</Button><Button variant="primary" disabled={!notes.trim()} onClick={() => { setNotesOpen(false); setEstimateOpen(true); }}>Continue to estimate</Button></>}><Field label="Notes"><textarea className={inputClass} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Make Bakasura broader; keep the brahmin thin." /></Field></DialogShell>
    <EstimateDialog open={estimateOpen} onOpenChange={setEstimateOpen} project={id} op="cast" args={{ notes }} title="Re-run cast" onConfirmed={() => { qc.invalidateQueries({ queryKey: ['project', id] }); qc.invalidateQueries({ queryKey: ['file', id, 'cast.json'] }); qc.invalidateQueries({ queryKey: ['file', id, 'assets.todo.json'] }); }} />
  </div>;
}
