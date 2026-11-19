import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiError, estimate, runOp, type Estimate } from '../api/client';
import { Button, DialogShell, ErrorNotice, Spinner } from './ui';

export function EstimateDialog({ open, onOpenChange, project, op, args, title, onConfirmed }: {
  open: boolean; onOpenChange: (v: boolean) => void; project: string; op: string; args: Record<string, unknown>;
  title: string; onConfirmed?: () => void;
}) {
  const [data, setData] = React.useState<Estimate | null>(null);
  const [error, setError] = React.useState<unknown>(null);
  const [budget, setBudget] = React.useState<ApiError | null>(null);
  React.useEffect(() => {
    if (!open) { setData(null); setError(null); setBudget(null); return; }
    let live = true;
    estimate(project, op, args).then((e) => { if (live) setData(e); }).catch((e) => { if (live) setError(e); });
    return () => { live = false; };
  }, [open, project, op, JSON.stringify(args)]);
  const run = useMutation({ mutationFn: (confirm: boolean) => runOp(project, op, confirm ? { ...args, confirmBudget: true } : args), onSuccess: () => { onOpenChange(false); onConfirmed?.(); }, onError: (e) => { if (e instanceof ApiError && e.code === 'BUDGET_EXCEEDED') setBudget(e); else setError(e); } });
  const paid = (data?.usd ?? 0) > 0 || (data?.characters ?? 0) > 0;
  return <DialogShell open={open} onOpenChange={onOpenChange} title={title} description="Review the estimate before spending or starting a long local render." footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>{budget ? <Button variant="danger" onClick={() => run.mutate(true)} disabled={run.isPending}>{run.isPending ? 'Starting…' : 'Confirm budget override'}</Button> : <Button variant="primary" onClick={() => run.mutate(false)} disabled={!data || run.isPending || !!error}>{run.isPending ? 'Starting…' : paid ? 'Confirm and run' : 'Run'}</Button>}</>}>
    {error ? <ErrorNotice error={error} /> : !data ? <div className="flex items-center gap-2 text-sm text-studio-muted"><Spinner /> Estimating…</div> : <>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-lg bg-white/[.03] p-2"><div className="text-[10px] text-studio-faint">Provider</div><div className="mt-0.5 font-medium">{data.provider ?? 'local'}</div></div>
        <div className="rounded-lg bg-white/[.03] p-2"><div className="text-[10px] text-studio-faint">Calls</div><div className="mt-0.5 font-mono">{data.calls}</div></div>
        <div className="rounded-lg bg-white/[.03] p-2"><div className="text-[10px] text-studio-faint">Characters</div><div className="mt-0.5 font-mono">{data.characters}{data.cachedCharacters ? ` (${data.cachedCharacters} cached)` : ''}</div></div>
        <div className="rounded-lg bg-white/[.03] p-2"><div className="text-[10px] text-studio-faint">Estimate</div><div className="mt-0.5 font-mono">${data.usd.toFixed(4)}{data.inr ? ` / ₹${data.inr}` : ''}</div></div>
      </div>
      {data.frameCount ? <div className="mt-2 rounded-lg bg-white/[.03] p-2 text-xs text-studio-muted">{data.frameCount} frames · about {data.seconds}s on this Mac. Existing segments are skipped.</div> : null}
      <ul className="mt-3 space-y-1 text-xs leading-5 text-studio-muted">{data.notes.map((n, i) => <li key={i}>• {n}</li>)}</ul>
      {budget ? <div className="mt-3"><ErrorNotice error={budget} /></div> : null}
      {paid ? <p className="mt-3 text-[11px] text-studio-amber">This will call a paid provider. Confirm only if the estimate is expected.</p> : null}
    </>}
  </DialogShell>;
}
