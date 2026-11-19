import * as React from 'react';

const inline = (s: string) => {
  const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p.startsWith('`') && p.endsWith('`') ? <code key={i} className="rounded bg-white/10 px-1 py-0.5 text-[.9em]">{p.slice(1, -1)}</code> : <React.Fragment key={i}>{p}</React.Fragment>);
};

/** Small, safe Markdown preview for briefs and QA notes; no raw HTML and no external renderer. */
export function Markdown({ source, className }: { source: string; className?: string }) {
  const lines = source.replace(/\r/g, '').split('\n');
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) { out.push(<ul key={`u${out.length}`} className="my-2 list-disc space-y-1 pl-5">{list.map((x, i) => <li key={i}>{inline(x)}</li>)}</ul>); list = []; } };
  lines.forEach((line, i) => {
    const t = line.trim();
    if (/^[-*]\s+/.test(t)) { list.push(t.replace(/^[-*]\s+/, '')); return; }
    flush();
    if (!t) { out.push(<div key={i} className="h-2" />); return; }
    if (t.startsWith('### ')) out.push(<h4 key={i} className="mt-3 text-sm font-semibold">{inline(t.slice(4))}</h4>);
    else if (t.startsWith('## ')) out.push(<h3 key={i} className="mt-4 text-base font-semibold">{inline(t.slice(3))}</h3>);
    else if (t.startsWith('# ')) out.push(<h2 key={i} className="mt-2 text-lg font-semibold">{inline(t.slice(2))}</h2>);
    else out.push(<p key={i} className="my-1.5 text-sm leading-6">{inline(t)}</p>);
  });
  flush();
  return <div className={className}>{out}</div>;
}
