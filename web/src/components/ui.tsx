import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import { ApiError } from '../api/client';

export const cn = (...x: Array<string | false | null | undefined>) => x.filter(Boolean).join(' ');
export const stageFrame = 'mx-auto max-w-6xl';

export function Button({ variant = 'secondary', size = 'md', className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' }) {
  const v = variant === 'primary' ? 'bg-studio-amber text-studio-bg hover:brightness-110 font-semibold'
    : variant === 'danger' ? 'bg-studio-red/15 text-studio-red border border-studio-red/30 hover:bg-studio-red/25'
      : variant === 'ghost' ? 'text-studio-muted hover:text-studio-text hover:bg-white/5'
        : 'bg-studio-raised text-studio-text border border-studio-line hover:border-studio-amber/50 hover:bg-[#222936]';
  return <button className={cn('inline-flex items-center justify-center gap-2 rounded-md transition disabled:opacity-45 disabled:pointer-events-none', v, size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm', className)} {...props} />;
}

export function IconButton({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn('inline-flex h-8 w-8 items-center justify-center rounded-md text-studio-muted hover:bg-white/5 hover:text-studio-text', className)} {...props} />;
}

export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn('rounded-xl border border-studio-line/80 bg-studio-panel', className)}>{children}</section>;
}

export function Badge({ children, tone = 'neutral', className }: { children: React.ReactNode; tone?: 'neutral' | 'amber' | 'green' | 'red' | 'blue' | 'violet' | 'teal'; className?: string }) {
  const t = { neutral: 'bg-white/5 text-studio-muted border-studio-line', amber: 'bg-studio-amber/10 text-studio-amber border-studio-amber/25', green: 'bg-studio-green/10 text-studio-green border-studio-green/25', red: 'bg-studio-red/10 text-studio-red border-studio-red/25', blue: 'bg-studio-blue/10 text-studio-blue border-studio-blue/25', violet: 'bg-studio-violet/10 text-studio-violet border-studio-violet/25', teal: 'bg-studio-teal/10 text-studio-teal border-studio-teal/25' }[tone];
  return <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide', t, className)}>{children}</span>;
}

const STATUS: Record<string, { label: string; tone: 'neutral' | 'amber' | 'green' | 'red' | 'blue' | 'violet' | 'teal'; icon?: string }> = {
  missing: { label: 'Missing', tone: 'neutral' }, running: { label: 'Running', tone: 'blue' }, fresh: { label: 'Fresh', tone: 'green' },
  stale: { label: 'Stale', tone: 'amber' }, edited: { label: 'Edited', tone: 'violet' }, approved: { label: 'Approved', tone: 'green', icon: '🔒' },
  failed: { label: 'Failed', tone: 'red' }, queued: { label: 'Queued', tone: 'neutral' }, done: { label: 'Done', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'amber' }, interrupted: { label: 'Interrupted', tone: 'red' },
};
export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: 'neutral' as const };
  return <Badge tone={s.tone}><span className={cn('h-1.5 w-1.5 rounded-full', s.tone === 'green' ? 'bg-studio-green' : s.tone === 'amber' ? 'bg-studio-amber' : s.tone === 'red' ? 'bg-studio-red' : s.tone === 'blue' ? 'bg-studio-blue' : s.tone === 'violet' ? 'bg-studio-violet' : 'bg-studio-muted', status === 'running' && 'animate-pulse-soft')} />{s.icon ? `${s.icon} ` : ''}{s.label}</Badge>;
}

export function Spinner({ className }: { className?: string }) { return <span className={cn('inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent', className)} aria-hidden />; }

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return <label className={cn('block', className)}><span className="mb-1.5 block text-xs font-medium text-studio-muted">{label}</span>{children}{hint ? <span className="mt-1 block text-[11px] text-studio-faint">{hint}</span> : null}</label>;
}

export const inputClass = 'w-full rounded-md border border-studio-line bg-studio-bg px-3 py-2 text-sm text-studio-text placeholder:text-studio-faint focus:border-studio-amber/60';

export function DialogShell({ open, onOpenChange, title, description, children, footer, wide = false }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-40 bg-black/65 backdrop-blur-[2px]" /><Dialog.Content className={cn('fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[min(94vw,var(--w))] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl border border-studio-line bg-studio-panel p-5 shadow-2xl', wide ? '[--w:760px]' : '[--w:500px]')}><div className="flex items-start justify-between gap-4"><div><Dialog.Title className="text-base font-semibold text-studio-text">{title}</Dialog.Title>{description ? <Dialog.Description className="mt-1 text-xs leading-5 text-studio-muted">{description}</Dialog.Description> : null}</div><Dialog.Close asChild><IconButton aria-label="Close">✕</IconButton></Dialog.Close></div><div className="mt-4">{children}</div>{footer ? <div className="mt-5 flex justify-end gap-2 border-t border-studio-line pt-4">{footer}</div> : null}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export function SelectBox({ value, onValueChange, items, placeholder, ariaLabel }: { value: string; onValueChange: (v: string) => void; items: Array<{ value: string; label: string; disabled?: boolean }>; placeholder?: string; ariaLabel: string }) {
  return <Select.Root value={value} onValueChange={onValueChange}><Select.Trigger aria-label={ariaLabel} className={cn(inputClass, 'flex items-center justify-between gap-2 text-left')}><Select.Value placeholder={placeholder ?? 'Select…'} /><Select.Icon className="text-studio-faint">⌄</Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" sideOffset={4} className="z-[60] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-auto rounded-lg border border-studio-line bg-studio-raised p-1 shadow-2xl"><Select.Viewport>{items.map((i) => <Select.Item key={i.value} value={i.value} disabled={i.disabled} className="cursor-pointer rounded px-3 py-2 text-sm text-studio-text outline-none data-[highlighted]:bg-studio-amber/15 data-[disabled]:opacity-40"><Select.ItemText>{i.label}</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root>;
}

export function ErrorNotice({ error, onDismiss }: { error: unknown; onDismiss?: () => void }) {
  const e = error instanceof ApiError ? error : null;
  const code = e?.code ?? 'INTERNAL';
  const messages: Record<string, string> = {
    WAITING_APPROVAL: 'Approve the dependency first.', EDITED_OUTPUT: 'This output was edited. Review it, then re-run with force.',
    APPROVED_LOCKED: 'Approved and locked. Re-run with an explicit force to unlock it.', PROJECT_LOCKED: 'Another job is writing this project.',
    BUDGET_EXCEEDED: 'This would exceed the budget. Confirm explicitly to continue.', VALIDATION: 'The file does not match its schema.',
    NOT_FOUND: 'That item was not found.', CANCELLED: 'The job was cancelled.', BAD_REQUEST: 'The request was rejected.',
  };
  return <div role="alert" className="rounded-lg border border-studio-red/35 bg-studio-red/10 px-3 py-2.5 text-sm text-studio-text"><div className="flex items-start justify-between gap-3"><div><div className="font-medium text-studio-red">{messages[code] ?? 'Something went wrong.'}</div><div className="mt-0.5 text-xs text-studio-muted">{e?.message ?? String(error)}</div></div>{onDismiss ? <button className="text-xs text-studio-muted hover:text-studio-text" onClick={onDismiss}>Dismiss</button> : null}</div></div>;
}

export function Progress({ done = 0, total = 0, className }: { done?: number; total?: number; className?: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return <div className={cn('h-1.5 overflow-hidden rounded-full bg-white/5', className)}><div className="h-full rounded-full bg-studio-amber transition-all" style={{ width: `${pct}%` }} /></div>;
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-studio-line px-6 py-10 text-center"><div className="text-sm font-medium text-studio-text">{title}</div>{body ? <div className="mt-1 max-w-md text-xs leading-5 text-studio-muted">{body}</div> : null}{action ? <div className="mt-3">{action}</div> : null}</div>;
}
