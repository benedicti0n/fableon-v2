import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { approveStage, fileUrl, getProject, json, putFile } from '../api/client';
import { Badge, Button, DialogShell, ErrorNotice, Field, inputClass, Panel, Spinner, StatusBadge } from '../components/ui';
import { EstimateDialog } from '../components/EstimateDialog';

type Line = { n: number; text: string; gloss?: string; beat?: string; facts?: string[]; delivery?: { tone?: string; pauses?: Array<{ after: string; s: number }>; emphasis?: string[] }; look?: Record<string, unknown> };
type Script = { lines: Line[]; names?: Array<{ word: string }>; wps?: number };
type Fact = { id: string; claim: string; sources?: Array<{ source: string; quote: string }> };
type Review = { lines: Array<{ n: number; verdict?: string; craft?: string; note?: string; confirmed?: boolean }> };

const wordCount = (s: string) => String(s).split(/\s+/).filter(Boolean).length;

export default function Script() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const project = useQuery({ queryKey: ['project', id], queryFn: () => getProject(id) });
  const scriptQ = useQuery({ queryKey: ['file', id, 'script.json'], queryFn: () => json<Script>(fileUrl(id, 'script.json')) });
  const factsQ = useQuery({ queryKey: ['file', id, 'research/facts.json'], queryFn: () => json<{ facts: Fact[] }>(fileUrl(id, 'research/facts.json')) });
  const reviewQ = useQuery({ queryKey: ['file', id, 'script.review.json'], queryFn: () => json<Review>(fileUrl(id, 'script.review.json')).catch(() => ({ lines: [] })) });
  const [draft, setDraft] = React.useState<Script | null>(null);
  const [selected, setSelected] = React.useState<number[]>([]);
  const [note, setNote] = React.useState('');
  const [regenOpen, setRegenOpen] = React.useState(false);
  const [factOpen, setFactOpen] = React.useState(false);
  const [overrideOpen, setOverrideOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<unknown>(null);
  React.useEffect(() => { if (scriptQ.data) setDraft(structuredClone(scriptQ.data)); }, [scriptQ.data]);
  const stage = project.data?.stages.find((s) => s.stage === 'script');
  const fc = project.data?.stages.find((s) => s.stage === 'factcheck');
  const readOnly = !!project.data?.readOnly;
  const save = useMutation({ mutationFn: () => putFile(id, 'script.json', draft), onSuccess: () => { qc.invalidateQueries({ queryKey: ['project', id] }); qc.invalidateQueries({ queryKey: ['file', id, 'script.json'] }); }, onError: setError });
  const approve = useMutation({ mutationFn: () => approveStage(id, 'script'), onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id] }), onError: setError });
  const override = useMutation({ mutationFn: () => approveStage(id, 'factcheck', reason), onSuccess: () => { setOverrideOpen(false); qc.invalidateQueries({ queryKey: ['project', id] }); }, onError: setError });
  const facts = new Map((factsQ.data?.facts ?? []).map((f) => [f.id, f]));
  const review = new Map((reviewQ.data?.lines ?? []).map((l) => [l.n, l]));
  const lines = draft?.lines ?? [];
  const words = lines.reduce((n, l) => n + wordCount(l.text), 0);
  const rate = (project.data?.project.voice as { rate?: { delivered?: { wordsPerSecond?: number }; wordsPerSecond?: number } } | undefined)?.rate;
  const target = Math.round((project.data?.project.seconds ?? 0) * (rate?.delivered?.wordsPerSecond ?? rate?.wordsPerSecond ?? 0));
  if (scriptQ.isLoading || project.isLoading || !draft) return <div className="flex items-center gap-2 text-sm text-studio-muted"><Spinner /> Loading script…</div>;
  const toggle = (n: number) => setSelected((v) => v.includes(n) ? v.filter((x) => x !== n) : [...v, n]);
  return <div className="mx-auto max-w-6xl space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[.18em] text-studio-amber">Stage 3</div><h1 className="mt-1 text-xl font-semibold">Script</h1><p className="mt-1 text-sm text-studio-muted">Edit a line, regenerate selected lines with a note, then fact-check.</p></div><div className="flex flex-wrap items-center gap-2">{stage ? <StatusBadge status={stage.status} /> : null}<Button onClick={() => save.mutate()} disabled={readOnly || save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button><Button onClick={() => setFactOpen(true)} disabled={readOnly}>Fact-check</Button><Button variant="primary" onClick={() => approve.mutate()} disabled={readOnly || stage?.status === 'approved'}>{stage?.status === 'approved' ? 'Approved' : 'Approve'}</Button></div></div>
    {error ? <ErrorNotice error={error} onDismiss={() => setError(null)} /> : null}
    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><div className="rounded-lg border border-studio-line bg-studio-panel p-2.5"><div className="text-[10px] text-studio-faint">Words</div><div className="mt-0.5 font-mono text-lg">{words}</div><div className="text-[10px] text-studio-muted">budget ~{target || '—'}</div></div><div className="rounded-lg border border-studio-line bg-studio-panel p-2.5"><div className="text-[10px] text-studio-faint">Fact-check</div><div className="mt-1 flex items-center gap-1.5">{fc ? <StatusBadge status={fc.status} /> : '—'}{fc?.status !== 'approved' ? <Button size="sm" variant="ghost" onClick={() => setOverrideOpen(true)}>Override</Button> : null}</div></div><div className="rounded-lg border border-studio-line bg-studio-panel p-2.5"><div className="text-[10px] text-studio-faint">Pronunciation TODOs</div><div className="mt-1 truncate text-[11px] text-studio-muted">{project.data?.todos.join(' · ') || 'none'}</div></div><div className="rounded-lg border border-studio-line bg-studio-panel p-2.5"><div className="text-[10px] text-studio-faint">Craft notes</div><div className="mt-1 truncate text-[11px] text-studio-muted">{project.data?.craft.map((c) => `L${c.n}`).join(', ') || 'none'}</div></div></div>
    {selected.length ? <div className="flex items-center gap-2 rounded-lg border border-studio-amber/25 bg-studio-amber/5 p-2"><span className="text-xs text-studio-amber">{selected.length} selected</span><input className={inputClass + ' flex-1 py-1.5 text-xs'} placeholder="Director note for the rewrite…" value={note} onChange={(e) => setNote(e.target.value)} /><Button size="sm" variant="primary" onClick={() => setRegenOpen(true)} disabled={!note.trim()}>Regenerate with note</Button></div> : null}
    <Panel className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[860px] border-collapse text-left text-xs"><thead className="bg-studio-raised/60 text-[10px] uppercase tracking-wide text-studio-faint"><tr><th className="w-8 px-2 py-2"></th><th className="w-8 px-2 py-2">#</th><th className="w-20 px-2 py-2">Beat</th><th className="px-2 py-2">Line</th><th className="px-2 py-2">Gloss / look</th><th className="w-28 px-2 py-2">Facts</th><th className="w-24 px-2 py-2">Check</th></tr></thead><tbody>{lines.map((l) => { const r = review.get(l.n); return <tr key={l.n} className="border-t border-studio-line/60 align-top hover:bg-white/[.02]"><td className="px-2 py-2"><input type="checkbox" aria-label={`Select line ${l.n}`} checked={selected.includes(l.n)} onChange={() => toggle(l.n)} disabled={readOnly} /></td><td className="px-2 py-2 font-mono text-studio-faint">{l.n}</td><td className="px-2 py-2"><Badge tone={l.beat === 'hook' ? 'amber' : l.beat === 'payoff' ? 'teal' : 'neutral'}>{l.beat ?? '—'}</Badge></td><td className="px-2 py-2"><textarea aria-label={`Line ${l.n}`} className="deva min-h-[3.2rem] w-full resize-y rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] leading-6 focus:border-studio-amber/50" value={l.text} readOnly={readOnly} onChange={(e) => { const next = structuredClone(draft); next.lines.find((x) => x.n === l.n)!.text = e.target.value; setDraft(next); }} /><div className="mt-1 flex flex-wrap gap-1">{(l.delivery?.emphasis ?? []).map((x) => <Badge key={x} tone="violet">stress {x}</Badge>)}{(l.delivery?.pauses ?? []).map((p, i) => <Badge key={i} tone="blue">pause {p.after} {p.s}s</Badge>)}</div></td><td className="px-2 py-2 text-[11px] leading-4 text-studio-muted"><div>{l.gloss ?? '—'}</div><div className="mt-1 text-studio-faint">{String((l.look as { set?: string; who?: string[] } | undefined)?.set ?? '')} {(l.look as { who?: string[] } | undefined)?.who?.join('+') ?? ''}</div></td><td className="px-2 py-2"><div className="flex flex-wrap gap-1">{(l.facts ?? []).map((fid) => { const f = facts.get(fid); return <span key={fid} title={f ? `${f.claim}\n${(f.sources ?? []).map((s) => s.quote).join('\n')}` : fid}><Badge tone={f ? 'teal' : 'red'}>{fid}</Badge></span>; })}</div></td><td className="px-2 py-2"><div className="flex flex-col gap-1">{r?.verdict ? <Badge tone={r.verdict === 'ok' ? 'green' : 'red'}>{r.verdict}</Badge> : <span className="text-[10px] text-studio-faint">—</span>}{r?.craft === 'weak' ? <Badge tone="amber">craft weak</Badge> : null}</div></td></tr>; })}</tbody></table></div></Panel>
    <EstimateDialog open={regenOpen} onOpenChange={setRegenOpen} project={id} op="script-lines" args={{ lines: selected, notes: note }} title="Regenerate selected lines" onConfirmed={() => { qc.invalidateQueries({ queryKey: ['project', id] }); qc.invalidateQueries({ queryKey: ['file', id, 'script.json'] }); qc.invalidateQueries({ queryKey: ['file', id, 'script.review.json'] }); setSelected([]); setNote(''); }} />
    <EstimateDialog open={factOpen} onOpenChange={setFactOpen} project={id} op="run" args={{ to: 'factcheck', only: 'factcheck', force: true }} title="Run fact-check" onConfirmed={() => { qc.invalidateQueries({ queryKey: ['project', id] }); qc.invalidateQueries({ queryKey: ['file', id, 'script.review.json'] }); }} />
    <DialogShell open={overrideOpen} onOpenChange={setOverrideOpen} title="Override fact-check" description="Accept the currently flagged factual lines. A reason is required and stored in script.review.json." footer={<><Button variant="ghost" onClick={() => setOverrideOpen(false)}>Cancel</Button><Button variant="danger" disabled={!reason.trim() || override.isPending} onClick={() => override.mutate()}>{override.isPending ? 'Recording…' : 'Record override'}</Button></>}><Field label="Reason"><textarea className={inputClass} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field></DialogShell>
  </div>;
}
