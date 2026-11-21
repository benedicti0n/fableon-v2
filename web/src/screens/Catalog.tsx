import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Badge, Button } from '../components/ui';

type CatalogData = {
  catalog: { sets?: Array<{ name: string; description?: string }>; iconography?: unknown[]; specials?: unknown[]; props?: unknown[]; poses?: unknown[]; effects?: unknown[] };
  episodes: { episodes: Array<{ id: string; title: string; book: number }> };
  census: { rows: Array<{ id: string; title: string; book: number; stageable: boolean; missing: string[]; sections?: string[] | null; parts?: number }>; build: Array<{ key: string; effort: number; touching?: string[]; unlock?: string[] }>; matrix: Record<string, { have: number; spec: number; missing: number }> };
  sheets: string[];
};

const load = () => fetch('/api/catalog', { credentials: 'same-origin' }).then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<CatalogData>; });

export default function Catalog() {
  const q = useQuery({ queryKey: ['catalog'], queryFn: load, staleTime: 30000 });
  const nav = useNavigate();
  const [only, setOnly] = React.useState(false);
  const [qtext, setQtext] = React.useState('');
  const [creating, setCreating] = React.useState<string | null>(null);
  const data = q.data;
  const rows = (data?.census.rows ?? []).filter((r) => (!only || r.stageable) && (!qtext || `${r.id} ${r.title}`.toLowerCase().includes(qtext.toLowerCase())));
  const newFrom = async (r: { id: string; title: string; book: number; sections?: string[] | null }) => {
    setCreating(r.id);
    try {
      const res = await fetch('/api/projects', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: r.id, topic: `${r.title} — Ganguli Book ${r.book}${r.sections ? `, sections ${r.sections.join('–')}` : ''}`, seconds: 90, language: 'hi' }) });
      if (!res.ok) throw new Error(await res.text());
      nav(`/p/${encodeURIComponent(r.id)}/brief`);
    } catch (e) { window.alert(`Could not create the project: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setCreating(null); }
  };
  if (q.isLoading) return <div className="text-sm text-studio-muted">Loading catalog…</div>;
  if (q.error) return <div className="text-sm text-studio-red">Catalog failed: {q.error.message}</div>;
  const c = data!.catalog;
  return <div className="mx-auto max-w-6xl space-y-7">
    <header className="flex items-end justify-between gap-4">
      <div><h1 className="text-xl font-semibold">Catalog &amp; census</h1><p className="mt-1 text-xs text-studio-muted">Read-only view of the kit, the episode inventory and the proposed build list.</p></div>
      <div className="flex gap-2 text-[11px]"><Badge tone="teal">{c.sets?.length ?? 0} sets</Badge><Badge tone="amber">{c.specials?.length ?? 0} specials</Badge><Badge tone="blue">{data!.census.rows.filter((r) => r.stageable).length} stageable</Badge></div>
    </header>
    <section>
      <h2 className="mb-2 text-sm font-semibold">Sets</h2>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {(c.sets ?? []).map((s) => <div key={s.name} className="rounded-lg border border-studio-line bg-studio-panel/40 p-3"><div className="text-xs font-semibold">{s.name}</div><div className="mt-1 line-clamp-2 text-[10px] text-studio-muted">{s.description ?? 'Catalog set'}</div></div>)}
      </div>
    </section>
    <section className="flex flex-wrap gap-2">
      {(data!.sheets ?? []).map((s) => <a key={s} href={`/${s}`} target="_blank" rel="noreferrer" className="rounded-md border border-studio-line px-3 py-1.5 text-xs text-studio-muted hover:text-studio-text">Open {s.split('/').pop()}</a>)}
    </section>
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">Episodes</h2><div className="flex items-center gap-3 text-xs"><input value={qtext} onChange={(e) => setQtext(e.target.value)} placeholder="filter episodes" className="w-52 rounded border border-studio-line bg-studio-bg px-2 py-1 text-xs" /><label className="flex items-center gap-1.5"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> stageable now</label></div></div>
      <div className="overflow-auto rounded-lg border border-studio-line"><table className="w-full text-left text-xs"><thead className="bg-studio-panel/60 text-[10px] uppercase tracking-wide text-studio-muted"><tr><th className="px-3 py-2">episode</th><th className="px-3 py-2">book</th><th className="px-3 py-2">stageable</th><th className="px-3 py-2">missing</th><th className="px-3 py-2"></th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.id} className="border-t border-studio-line/60"><td className="px-3 py-2"><div className="font-medium text-studio-text">{r.title}</div><div className="font-mono text-[9px] text-studio-faint">{r.id}</div></td><td className="px-3 py-2 text-studio-muted">{r.book}</td><td className="px-3 py-2">{r.stageable ? <Badge tone="green">yes</Badge> : <span className="text-studio-muted">no</span>}</td><td className="max-w-md px-3 py-2 text-[10px] text-studio-muted">{r.missing.length ? r.missing.slice(0, 8).join(', ') + (r.missing.length > 8 ? ` +${r.missing.length - 8}` : '') : '—'}</td><td className="px-3 py-2 text-right">{r.stageable ? <Button size="sm" variant="secondary" disabled={creating === r.id} onClick={() => newFrom(r)}>{creating === r.id ? 'Creating…' : 'New from preset'}</Button> : null}</td></tr>)}
      </tbody></table></div>
    </section>
    <section>
      <h2 className="mb-2 text-sm font-semibold">Proposed build list</h2>
      <div className="overflow-auto rounded-lg border border-studio-line"><table className="w-full text-left text-xs"><thead className="bg-studio-panel/60 text-[10px] uppercase tracking-wide text-studio-muted"><tr><th className="px-3 py-2">item</th><th className="px-3 py-2">effort</th><th className="px-3 py-2">episodes</th></tr></thead><tbody>
        {(data!.census.build ?? []).slice(0, 16).map((b) => <tr key={b.key} className="border-t border-studio-line/60"><td className="px-3 py-2 font-mono text-[10px]">{b.key}</td><td className="px-3 py-2">{b.effort}</td><td className="px-3 py-2 text-[10px] text-studio-muted">{(b.unlock?.length ? b.unlock : b.touching ?? []).slice(0, 10).join(', ') || '—'}</td></tr>)}
      </tbody></table></div>
    </section>
  </div>;
}
