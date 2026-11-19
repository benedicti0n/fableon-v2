import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import WaveSurfer from 'wavesurfer.js';
import { approveStage, fileUrl, getKeys, getList, getPeaks, getProject, getVoices, json, patchProject, putFile, runOp, text } from '../api/client';
import { Badge, Button, Empty, ErrorNotice, Field, inputClass, Panel, SelectBox, Spinner, StatusBadge, stageFrame } from '../components/ui';
import { EstimateDialog } from '../components/EstimateDialog';
import { Markdown } from '../lib/markdown';

type Word = { w: string; a: number; b: number; line: number };
type ProjectVoice = { provider?: string; engine?: string; model?: string; voiceId?: string; voice?: string; pace?: number; fit?: string; settings?: Record<string, unknown>; rate?: { delivered?: { wordsPerSecond?: number } } };
const PROVIDERS = [{ value: 'sarvam', label: 'Sarvam' }, { value: 'elevenlabs', label: 'ElevenLabs' }, { value: 'kokoro', label: 'Kokoro (English)' }];

export default function Voice() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const project = useQuery({ queryKey: ['project', id], queryFn: () => getProject(id) });
  const wordsQ = useQuery({ queryKey: ['file', id, 'words.json'], queryFn: () => json<Word[]>(fileUrl(id, 'words.json')).catch(() => []) });
  const pronQ = useQuery({ queryKey: ['file', id, 'pronunciations.json'], queryFn: () => json<Record<string, string | { sayAs: string }>>(fileUrl(id, 'pronunciations.json')).catch(() => ({})) });
  const qaQ = useQuery({ queryKey: ['file', id, 'voice-qa.md'], queryFn: () => text(fileUrl(id, 'voice-qa.md')).catch(() => '') });
  const voicesQ = useQuery({ queryKey: ['voices'], queryFn: getVoices });
  const keysQ = useQuery({ queryKey: ['settings', 'keys'], queryFn: getKeys });
  const auditionsQ = useQuery({ queryKey: ['list', id, 'voice/auditions'], queryFn: () => getList(id, 'voice/auditions').catch(() => ({ dir: '', files: [] })) });
  const paceQ = useQuery({ queryKey: ['list', id, 'voice/pace'], queryFn: () => getList(id, 'voice/pace').catch(() => ({ dir: '', files: [] })) });
  const peaksQ = useQuery({ queryKey: ['peaks', id, 'voice.wav'], queryFn: () => getPeaks(id, 'voice.wav', 420).catch(() => null) });
  const [error, setError] = React.useState<unknown>(null);
  const [estimateOpen, setEstimateOpen] = React.useState(false);
  const [voice, setVoice] = React.useState<ProjectVoice>({});
  const [pronDraft, setPronDraft] = React.useState<Record<string, string | { sayAs: string }>>({});
  const [newWord, setNewWord] = React.useState('');
  const [newSay, setNewSay] = React.useState('');
  const [container, setContainer] = React.useState<HTMLDivElement | null>(null);
  const ws = React.useRef<WaveSurfer | null>(null);
  const [time, setTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [activeLine, setActiveLine] = React.useState<number | null>(null);
  const loop = React.useRef<{ start: number; end: number } | null>(null);
  React.useEffect(() => { if (project.data) setVoice((project.data.project.voice ?? {}) as ProjectVoice); }, [project.data?.project.id]);
  React.useEffect(() => { if (pronQ.data) setPronDraft(pronQ.data); }, [pronQ.data]);
  React.useEffect(() => {
    if (!container || !peaksQ.data) return;
    const values = peaksQ.data.peaks.map((p) => Math.max(Math.abs(p.min), Math.abs(p.max)));
    const w = WaveSurfer.create({ container, height: 86, waveColor: '#3a4658', progressColor: '#f5a524', cursorColor: '#e7e9ee', barWidth: 2, barGap: 1, barRadius: 1, normalize: true });
    w.load(fileUrl(id, 'voice.wav'), [values], peaksQ.data.duration).catch(() => {});
    w.on('ready', () => setDuration(w.getDuration()));
    w.on('timeupdate', (t) => { setTime(t); if (loop.current && t >= loop.current.end) { w.setTime(loop.current.start); w.play(); } });
    ws.current = w;
    return () => { try { w.destroy(); } catch { /* ignore */ } ws.current = null; };
  }, [container, peaksQ.data?.hash, id]);
  const words = wordsQ.data ?? [];
    const byLine = new Map<number, Word[]>();
  for (const w of words) { if (!byLine.has(w.line)) byLine.set(w.line, []); byLine.get(w.line)!.push(w); }
  const active = words.find((w) => time >= w.a && time < w.b);
  const stage = project.data?.stages.find((s) => s.stage === 'voice');
  const readOnly = !!project.data?.readOnly;
  const currentProvider = voice.provider ?? voice.engine ?? 'sarvam';
  const provider = voicesQ.data?.providers.find((p) => p.name === currentProvider);
  const saveVoice = useMutation({ mutationFn: () => patchProject(id, { voice }), onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id] }), onError: setError });
  const savePron = useMutation({ mutationFn: () => putFile(id, 'pronunciations.json', pronDraft), onSuccess: () => { qc.invalidateQueries({ queryKey: ['file', id, 'pronunciations.json'] }); qc.invalidateQueries({ queryKey: ['project', id] }); }, onError: setError });
  const approve = useMutation({ mutationFn: () => approveStage(id, 'voice'), onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id] }), onError: setError });
  const choosePace = useMutation({ mutationFn: (pace: number) => runOp(id, 'voice-pace', { choose: pace }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['project', id] }); qc.invalidateQueries({ queryKey: ['file', id, 'voice.wav'] }); }, onError: setError });
  const credit = voicesQ.data?.credit;
  return <div className={stageFrame + ' space-y-4'}>
    <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[.18em] text-studio-amber">Stage 4</div><h1 className="mt-1 text-xl font-semibold">Voice</h1><p className="mt-1 text-sm text-studio-muted">Cast the narration, hear every word against the timeline, and approve.</p></div><div className="flex items-center gap-2">{stage ? <StatusBadge status={stage.status} /> : null}<Button variant="primary" onClick={() => setEstimateOpen(true)} disabled={readOnly}>Run voice</Button><Button onClick={() => approve.mutate()} disabled={readOnly || stage?.status === 'approved'}>{stage?.status === 'approved' ? 'Approved' : 'Approve'}</Button></div></div>
    {error ? <ErrorNotice error={error} onDismiss={() => setError(null)} /> : null}
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <Panel className="p-4"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Cast &amp; settings</h2><Badge tone={keysQ.data?.[currentProvider === 'sarvam' ? 'SARVAM_API_KEY' : 'ELEVENLABS_API_KEY'] === 'set' ? 'green' : 'neutral'}>{currentProvider === 'sarvam' ? 'Sarvam key' : currentProvider === 'elevenlabs' ? 'ElevenLabs key' : 'local'}</Badge></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Provider"><SelectBox ariaLabel="Voice provider" value={currentProvider} onValueChange={(v) => setVoice({ ...voice, provider: v, engine: undefined })} items={PROVIDERS} /></Field><Field label="Model"><input className={inputClass} value={voice.model ?? ''} onChange={(e) => setVoice({ ...voice, model: e.target.value })} placeholder={currentProvider === 'sarvam' ? 'bulbul:v4-flash' : 'eleven_multilingual_v2'} /></Field><Field label="Voice"><SelectBox ariaLabel="Voice" value={String(voice.voiceId ?? voice.voice ?? '')} onValueChange={(v) => setVoice({ ...voice, voiceId: v })} placeholder="Account voice…" items={(provider?.speakers ?? []).map((s) => typeof s === 'string' ? { value: s, label: s } : { value: s.id ?? s.name ?? '', label: s.name ?? s.id ?? '' })} /></Field><Field label="Pace"><input className={inputClass} type="number" step="0.05" min={0.5} max={2} value={voice.pace ?? 1.1} onChange={(e) => setVoice({ ...voice, pace: Number(e.target.value) })} /></Field><Field label="Fit"><SelectBox ariaLabel="Fit" value={voice.fit ?? 'natural'} onValueChange={(v) => setVoice({ ...voice, fit: v })} items={[{ value: 'natural', label: 'Natural (±12%)' }, { value: 'exact', label: 'Exact target' }]} /></Field><div className="flex items-end"><Button className="w-full" onClick={() => saveVoice.mutate()} disabled={readOnly || saveVoice.isPending}>{saveVoice.isPending ? 'Saving…' : 'Save voice settings'}</Button></div></div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]"><div className="rounded bg-white/[.03] p-2"><div className="text-[10px] text-studio-faint">Delivered rate</div><div className="mt-0.5 font-mono">{voice.rate?.delivered?.wordsPerSecond ?? '—'} w/s</div></div><div className="rounded bg-white/[.03] p-2"><div className="text-[10px] text-studio-faint">ElevenLabs credit</div><div className="mt-0.5 font-mono">{credit?.elevenlabs?.remaining ?? '—'}</div></div><div className="rounded bg-white/[.03] p-2"><div className="text-[10px] text-studio-faint">Sarvam budget</div><div className="mt-0.5 font-mono">₹{credit?.sarvam?.budgetInr ?? 200}</div></div></div>
      </Panel>
      <Panel className="p-4"><h2 className="mb-2 text-sm font-semibold">Voice QA</h2>{qaQ.data ? <div className="max-h-64 overflow-auto"><Markdown source={qaQ.data} /></div> : <Empty title="No voice QA yet" body="Run voice to write voice-qa.md." />}</Panel>
    </div>
    <Panel className="p-4"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Waveform &amp; word timeline</h2><div className="flex items-center gap-2 text-[10px] text-studio-muted"><span className="font-mono">{time.toFixed(2)}s / {duration.toFixed(2)}s</span>{loop.current ? <Button size="sm" variant="ghost" onClick={() => { loop.current = null; setActiveLine(null); }}>Clear loop</Button> : null}</div></div>{peaksQ.isLoading ? <div className="h-24 rounded bg-studio-bg shimmer" /> : !peaksQ.data ? <Empty title="No voice.wav yet" body="Run voice to generate the narration." /> : <><div ref={setContainer} className="overflow-hidden rounded-lg bg-studio-bg" aria-label="Voice waveform" /><div className="mt-3 max-h-64 space-y-1 overflow-auto">{Array.from(byLine.entries()).map(([n, lineWords]) => <div key={n} className={`rounded-lg border px-2 py-1.5 ${activeLine === n ? 'border-studio-amber/40 bg-studio-amber/5' : 'border-transparent hover:bg-white/[.03]'}`}><div className="flex items-start gap-2"><span className="w-5 shrink-0 pt-0.5 font-mono text-[10px] text-studio-faint">{n}</span><p className="deva flex-1 text-[13px] leading-6">{lineWords.map((w) => <button key={`${w.a}-${w.w}`} onClick={() => { ws.current?.setTime(w.a); ws.current?.play(); }} className={`rounded px-0.5 ${active?.w === w.w && active.a === w.a ? 'bg-studio-amber text-studio-bg' : 'hover:bg-white/10'}`} title={`${w.a.toFixed(2)}–${w.b.toFixed(2)}s`}>{w.w} </button>)}</p><div className="flex shrink-0 gap-1"><Button size="sm" variant="ghost" onClick={() => { ws.current?.setTime(lineWords[0].a); ws.current?.play(); setActiveLine(n); }}>Play line</Button><Button size="sm" variant="ghost" onClick={() => { loop.current = { start: lineWords[0].a, end: lineWords[lineWords.length - 1].b }; setActiveLine(n); ws.current?.setTime(lineWords[0].a); ws.current?.play(); }}>Loop</Button></div></div></div>)}</div></>}</Panel>
    <div className="grid gap-4 lg:grid-cols-2"><Panel className="p-4"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Pronunciations</h2><Button size="sm" onClick={() => savePron.mutate()} disabled={readOnly || savePron.isPending}>Save</Button></div><p className="mb-2 text-[11px] text-studio-muted">`sayAs` is sent to the provider; words.json keeps the script spelling.</p><div className="max-h-52 space-y-1 overflow-auto">{Object.entries(pronDraft).map(([word, entry]) => <div key={word} className="flex items-center gap-2"><span className="w-28 truncate text-xs">{word}</span><input className={inputClass + ' flex-1 py-1 text-xs'} aria-label={`${word} say as`} value={typeof entry === 'string' ? entry : entry.sayAs} onChange={(e) => setPronDraft({ ...pronDraft, [word]: { sayAs: e.target.value } })} /></div>)}</div><div className="mt-2 flex gap-1"><input className={inputClass + ' py-1 text-xs'} placeholder="word" value={newWord} onChange={(e) => setNewWord(e.target.value)} /><input className={inputClass + ' py-1 text-xs'} placeholder="say as" value={newSay} onChange={(e) => setNewSay(e.target.value)} /><Button size="sm" onClick={() => { if (newWord && newSay) { setPronDraft({ ...pronDraft, [newWord]: { sayAs: newSay } }); setNewWord(''); setNewSay(''); } }}>Add</Button></div></Panel>
      <Panel className="p-4"><h2 className="mb-2 text-sm font-semibold">Auditions &amp; pace variants</h2><div className="space-y-1">{paceQ.data?.files.filter((f) => /\.(wav|mp3)$/i.test(f.name)).map((f) => <div key={f.path} className="flex items-center gap-2 rounded bg-white/[.03] p-1.5 text-[11px]"><span className="w-14 shrink-0 font-mono">{f.name}</span><audio controls preload="none" src={f.url} className="h-8 flex-1" /><Button size="sm" onClick={() => { const m = /([0-9.]+)\.(wav|mp3)$/i.exec(f.name); if (m) choosePace.mutate(Number(m[1])); }}>Use</Button></div>)}{!paceQ.data?.files.length ? <div className="text-[11px] text-studio-muted">No pace variants yet.</div> : null}</div><div className="mt-3 space-y-1">{auditionsQ.data?.files.filter((f) => /\.(wav|mp3)$/i.test(f.name)).map((f) => <div key={f.path} className="flex items-center gap-2 rounded bg-white/[.03] p-1.5 text-[11px]"><span className="min-w-0 flex-1 truncate">{f.name}</span><audio controls preload="none" src={f.url} className="h-8 w-40" /></div>)}</div></Panel></div>
    <EstimateDialog open={estimateOpen} onOpenChange={setEstimateOpen} project={id} op="run" args={{ to: 'voice', only: 'voice', force: true }} title="Run voice" onConfirmed={() => { qc.invalidateQueries({ queryKey: ['project', id] }); qc.invalidateQueries({ queryKey: ['file', id, 'words.json'] }); qc.invalidateQueries({ queryKey: ['file', id, 'voice-qa.md'] }); qc.invalidateQueries({ queryKey: ['peaks', id, 'voice.wav'] }); }} />
  </div>;
}
