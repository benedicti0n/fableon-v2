import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { approveStage, fileUrl, getFinalPlan, getList, getPeaks, getProject, getTimeline, json, putFile, runOp, text } from '../api/client';
import { Badge, Button, DialogShell, ErrorNotice, Field, inputClass, Panel, SelectBox, Spinner, StatusBadge, stageFrame } from '../components/ui';
import { EstimateDialog } from '../components/EstimateDialog';
import { Markdown } from '../lib/markdown';
import { RangeEditor } from '../components/RangeEditor';
import { LOOK_NEUTRAL, cleanLook } from '../lib/look';

type LookEntry = { mood?: string; exposure?: number; warmth?: number; glow?: number; haze?: number; shafts?: 'off' | 'soft' | 'strong'; vignette?: number };
type Look = { version: 1; scenes: Record<string, LookEntry> };
type Cue = { kind: string; at: string; note?: string; gainDb?: number; seed?: number; muted?: boolean };
type Music = { scene: string; mood: string; tempo: number; intensity: number; instruments: string[]; gainDb?: number; muted?: boolean; ambience?: string };
type Cues = { version: 1; duration?: number; music: Music[]; stingers: Cue[]; sfx: Cue[]; mix?: Record<string, number> };
const LOOK_DEFAULT: Look = { version: 1, scenes: {} };
const CUES_DEFAULT: Cues = { version: 1, music: [], stingers: [], sfx: [], mix: {} };
const MOODS = ['warm-side', 'golden-glow', 'dusk', 'night-moon', 'noon'];
const MOOD_COLOR: Record<string, string> = { 'warm-side': '#f5a524', 'golden-glow': '#fb923c', dusk: '#c084fc', 'night-moon': '#60a5fa', noon: '#2dd4bf' };
const SFX_KINDS = ['poof', 'shimmer', 'thud', 'whoosh', 'flashHit', 'pop', 'arrow', 'steps'];

const anchorSeconds = (at: string, words: Array<{ line: number; index: number; a: number; b: number }>) => {
  if (at?.startsWith('f')) return Number(at.slice(1)) / 30;
  const [line, k] = String(at).split(':').map(Number);
  return words.find((w) => w.line === line && w.index === k)?.a ?? 0;
};
const nearestAnchor = (seconds: number, words: Array<{ line: number; index: number; a: number; b: number }>, frame = false) => frame ? `f${Math.max(0, Math.round(seconds * 30))}` : (() => {
  let best = words[0];
  for (const w of words) if (Math.abs(w.a - seconds) < Math.abs((best?.a ?? 0) - seconds)) best = w;
  return best ? `${best.line}:${best.index}` : 'f0';
})();

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void }) {
  return <label className="block"><span className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-studio-faint"><span>{label}</span><span className="font-mono text-studio-muted">{value.toFixed(2)}</span></span><input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1.5 w-full accent-studio-amber" /></label>;
}

export default function Finish() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const project = useQuery({ queryKey: ['project', id], queryFn: () => getProject(id) });
  const timelineQ = useQuery({ queryKey: ['timeline', id], queryFn: () => getTimeline(id) });
  const lookQ = useQuery({ queryKey: ['file', id, 'look.json'], queryFn: () => json<Look>(fileUrl(id, 'look.json')).catch(() => LOOK_DEFAULT) });
  const cuesQ = useQuery({ queryKey: ['file', id, 'cues.json'], queryFn: () => json<Cues>(fileUrl(id, 'cues.json')).catch(() => CUES_DEFAULT) });
  const voicePeaksQ = useQuery({ queryKey: ['peaks', id, 'voice.wav'], queryFn: () => getPeaks(id, 'voice.wav', 700).catch(() => null) });
  const mixPeaksQ = useQuery({ queryKey: ['peaks', id, 'audio/mix.wav'], queryFn: () => getPeaks(id, 'audio/mix.wav', 700).catch(() => null) });
  const planQ = useQuery({ queryKey: ['final-plan', id], queryFn: () => getFinalPlan(id), retry: false });
  const qaQ = useQuery({ queryKey: ['file', id, 'final-qa.md'], queryFn: () => text(fileUrl(id, 'final-qa.md')).catch(() => '') });
  const stillsQ = useQuery({ queryKey: ['list', id, 'stills'], queryFn: () => getList(id, 'stills').catch(() => ({ dir: 'stills', files: [] })) });
  const [look, setLook] = React.useState<Look>(LOOK_DEFAULT);
  const [cues, setCues] = React.useState<Cues>(CUES_DEFAULT);
  const [error, setError] = React.useState<unknown>(null);
  const [preview, setPreview] = React.useState<{ scene: string; frame: number } | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewScene, setPreviewScene] = React.useState<string | null>(null);
  const [copyOpen, setCopyOpen] = React.useState(false);
  const [copyFrom, setCopyFrom] = React.useState('');
  const [copyTo, setCopyTo] = React.useState('');
  const [selected, setSelected] = React.useState<{ lane: 'music' | 'stinger' | 'sfx'; index: number } | null>(null);
  const [renderOpen, setRenderOpen] = React.useState(false);
  const [mixOpen, setMixOpen] = React.useState(false);
  const [drag, setDrag] = React.useState<number | null>(null);
  const [audioPreview, setAudioPreview] = React.useState('');
  const [ab, setAb] = React.useState(false);
  const [hasPrev, setHasPrev] = React.useState(false);
  const laneRef = React.useRef<HTMLDivElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  React.useEffect(() => { if (lookQ.data) setLook(lookQ.data); }, [lookQ.data]);
  React.useEffect(() => { if (cuesQ.data) setCues(cuesQ.data); }, [cuesQ.data]);
  React.useEffect(() => { fetch(fileUrl(id, 'final.prev.mp4'), { method: 'HEAD', credentials: 'same-origin' }).then((r) => setHasPrev(r.ok)).catch(() => setHasPrev(false)); }, [id, planQ.data?.framesToRender]);
  React.useEffect(() => { if (!preview) return; const t = setTimeout(() => setPreview(null), 12000); return () => clearTimeout(t); }, [preview]);
  const timeline = timelineQ.data;
  const words = React.useMemo(() => (timeline?.script ?? []).flatMap((l) => l.words.map((w, index) => ({ line: l.n, index, a: w.a, b: w.b, w: w.w }))), [timeline]);
  const duration = timeline?.duration ?? cues.duration ?? 1;
  const finalStage = project.data?.stages.find((s) => s.stage === 'final');
  const soundStage = project.data?.stages.find((s) => s.stage === 'sound');
  const readOnly = !!project.data?.readOnly;
  const sceneList = timeline?.scenes ?? [];
  const saveLook = useMutation({ mutationFn: () => putFile(id, 'look.json', cleanLook(look)), onSuccess: () => { qc.invalidateQueries({ queryKey: ['file', id, 'look.json'] }); qc.invalidateQueries({ queryKey: ['final-plan', id] }); qc.invalidateQueries({ queryKey: ['project', id] }); }, onError: setError });
  const saveCues = useMutation({ mutationFn: () => putFile(id, 'cues.json', cues), onSuccess: () => { qc.invalidateQueries({ queryKey: ['file', id, 'cues.json'] }); qc.invalidateQueries({ queryKey: ['project', id] }); }, onError: setError });
  const previewCue = useMutation({ mutationFn: (c: Cue) => runOp(id, 'sfx-preview', { kind: c.kind, seed: c.seed ?? 1, gainDb: c.gainDb ?? 0 }), onSuccess: (job) => setAudioPreview(`${fileUrl(id, `qa/previews/${(selected?.lane === 'sfx' ? cues.sfx[selected.index]?.kind : 'thud')}-${cues.sfx[selected?.index ?? 0]?.seed ?? 1}.wav`)}?t=${Date.now()}`), onError: setError });
  const approveSound = useMutation({ mutationFn: () => approveStage(id, 'sound'), onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id] }), onError: setError });
  const approve = useMutation({ mutationFn: () => approveStage(id, 'final'), onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id] }), onError: setError });
  const saveBoth = async () => { try { await saveLook.mutateAsync(); await saveCues.mutateAsync(); return true; } catch { return false; } };
  const saveSound = async () => { try { await saveCues.mutateAsync(); return true; } catch { return false; } };
  const setScene = (scene: string, key: keyof LookEntry, value: LookEntry[keyof LookEntry]) => setLook({ ...look, scenes: { ...look.scenes, [scene]: { ...(look.scenes[scene] ?? {}), [key]: value } } });
  const resetScene = (scene: string) => { const next = { ...look.scenes }; delete next[scene]; setLook({ ...look, scenes: next }); };
  const updateCue = (lane: 'music' | 'stinger' | 'sfx', index: number, patch: Record<string, unknown>) => {
    const next = structuredClone(cues) as Cues & Record<string, unknown>;
    (next[lane] as Array<Record<string, unknown>>)[index] = { ...(next[lane] as Array<Record<string, unknown>>)[index], ...patch };
    setCues(next);
  };
  const addSfx = (e: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration;
    const cue: Cue = { kind: 'thud', at: nearestAnchor(t, words, e.altKey), gainDb: 0, seed: 1 };
    const next = { ...cues, sfx: [...cues.sfx, cue].sort((a, b) => anchorSeconds(a.at, words) - anchorSeconds(b.at, words)) };
    setCues(next); setSelected({ lane: 'sfx', index: next.sfx.indexOf(cue) });
  };
  const moveSfx = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag === null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration;
    updateCue('sfx', drag, { at: nearestAnchor(t, words, e.altKey) });
  };
  const onMarkerKey = (e: React.KeyboardEvent) => {
    if (!selected || selected.lane !== 'sfx') return;
    const cue = cues.sfx[selected.index]; if (!cue) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); setCues({ ...cues, sfx: cues.sfx.filter((_, i) => i !== selected.index) }); setSelected(null); return; }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const at = anchorSeconds(cue.at, words);
    const step = e.shiftKey ? 1 / 30 : null;
    const sorted = [...words].sort((a, b) => a.a - b.a);
    const next = step !== null ? at + (e.key === 'ArrowLeft' ? -step : step) : (() => { const i = sorted.findIndex((w) => w.a >= at - 0.001); return sorted[Math.max(0, Math.min(sorted.length - 1, i + (e.key === 'ArrowLeft' ? -1 : 1)))].a; })();
    updateCue('sfx', selected.index, { at: nearestAnchor(Math.max(0, Math.min(duration, next)), words, step !== null) });
  };
  const pending = !!preview && !stillsQ.data?.files.some((f) => f.name === `look-${preview.scene}-after-${preview.frame}.jpg`);
  React.useEffect(() => { if (!preview) return; const t = setInterval(() => qc.invalidateQueries({ queryKey: ['list', id, 'stills'] }), 1200); return () => clearInterval(t); }, [preview, id, qc]);
  if (timelineQ.isLoading || project.isLoading || lookQ.isLoading || cuesQ.isLoading) return <div className="flex items-center gap-2 text-sm text-studio-muted"><Spinner /> Loading finish…</div>;
  if (!timeline) return <div className="mx-auto max-w-3xl"><ErrorNotice error={timelineQ.error ?? new Error('timeline unavailable')} /></div>;
  const previewFile = preview ? (name: string) => fileUrl(id, `stills/look-${preview.scene}-${name}-${preview.frame}.jpg`) : null;
  const selectedCue = selected?.lane === 'sfx' ? cues.sfx[selected.index] : selected?.lane === 'stinger' ? cues.stingers[selected.index] : null;
  const selectedMusic = selected?.lane === 'music' ? cues.music[selected.index] : null;
  return <div className={stageFrame + ' space-y-4'} onKeyDown={onMarkerKey} tabIndex={-1}>
    <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[.18em] text-studio-amber">Stage 9</div><h1 className="mt-1 text-xl font-semibold">Finish</h1><p className="mt-1 text-sm text-studio-muted">Look and sound on the world, then render only what changed.</p></div><div className="flex items-center gap-2">{finalStage ? <StatusBadge status={finalStage.status} /> : null}<Button onClick={async () => { if (await saveBoth()) setRenderOpen(true); }} disabled={readOnly || pending}>Render final</Button><Button variant="primary" onClick={() => approve.mutate()} disabled={readOnly || finalStage?.status === 'approved'}>{finalStage?.status === 'approved' ? 'Approved · picture lock' : 'Approve final'}</Button></div></div>
    {error ? <ErrorNotice error={error} onDismiss={() => setError(null)} /> : null}
    <div className="rounded-lg border border-studio-amber/25 bg-studio-amber/5 px-3 py-2 text-xs text-studio-amber">Characters are never lit or glowed; these controls change the world only.</div>

    <Panel className="p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-semibold">Look</h2><div className="text-[11px] text-studio-muted">Per-scene finishing overrides. Missing values keep the planned look.</div></div><div className="flex gap-2"><Button size="sm" onClick={() => setCopyOpen(true)} disabled={readOnly}>Copy to scenes…</Button><Button size="sm" variant="primary" onClick={() => saveLook.mutate()} disabled={readOnly || saveLook.isPending}>{saveLook.isPending ? 'Saving…' : 'Save look'}</Button></div></div>
      <div className="grid gap-3 lg:grid-cols-2">{sceneList.map((scene) => {
        const e = look.scenes[scene.id] ?? {};
        const mid = Math.round((scene.start + scene.end) * 15);
        return <div key={scene.id} className="rounded-lg border border-studio-line bg-studio-bg/35 p-3"><div className="flex items-start justify-between gap-2"><div><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: MOOD_COLOR[scene.mood ?? ''] ?? '#6b7280' }} /><span className="text-xs font-semibold">{scene.id}</span><Badge tone="neutral">{scene.mood ?? 'no mood'}</Badge></div><div className="mt-0.5 text-[10px] text-studio-muted">{scene.start.toFixed(1)}–{scene.end.toFixed(1)}s · {(scene.end - scene.start).toFixed(1)}s</div></div><img src={fileUrl(id, `stills/f_${mid}.jpg`)} alt="" className="h-12 w-20 rounded object-cover" onError={(ev) => { ev.currentTarget.style.display = 'none'; }} /></div>
          <div className="mt-3 grid grid-cols-2 gap-2"><Field label="Finishing mood"><SelectBox ariaLabel={`${scene.id} mood`} value={e.mood ?? scene.mood ?? 'warm-side'} onValueChange={(v) => setScene(scene.id, 'mood', v)} items={MOODS.map((m) => ({ value: m, label: m }))} /></Field><Field label="Shafts"><SelectBox ariaLabel={`${scene.id} shafts`} value={e.shafts ?? LOOK_NEUTRAL.shafts} onValueChange={(v) => setScene(scene.id, 'shafts', v as LookEntry['shafts'])} items={[{ value: 'off', label: 'Off' }, { value: 'soft', label: 'Soft' }, { value: 'strong', label: 'Strong' }]} /></Field></div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2"><Slider label="Exposure" value={e.exposure ?? LOOK_NEUTRAL.exposure} min={-0.5} max={0.5} step={0.01} onChange={(v) => setScene(scene.id, 'exposure', v)} /><Slider label="Warmth" value={e.warmth ?? LOOK_NEUTRAL.warmth} min={-1} max={1} step={0.01} onChange={(v) => setScene(scene.id, 'warmth', v)} /><Slider label="Glow" value={e.glow ?? LOOK_NEUTRAL.glow} min={0} max={1.5} step={0.01} onChange={(v) => setScene(scene.id, 'glow', v)} /><Slider label="Haze" value={e.haze ?? LOOK_NEUTRAL.haze} min={0} max={1.5} step={0.01} onChange={(v) => setScene(scene.id, 'haze', v)} /><Slider label="Vignette" value={e.vignette ?? LOOK_NEUTRAL.vignette} min={0} max={1.5} step={0.01} onChange={(v) => setScene(scene.id, 'vignette', v)} /></div>
          <div className="mt-2 flex items-center justify-between"><Button size="sm" variant="ghost" onClick={() => resetScene(scene.id)} disabled={readOnly}>Reset to mood</Button><Button size="sm" onClick={() => { setPreviewScene(scene.id); setPreview({ scene: scene.id, frame: mid }); setPreviewOpen(true); }} disabled={readOnly}>Preview</Button></div>
          {pending && preview?.scene === scene.id ? <div className="mt-1 text-[10px] text-studio-amber">Rendering preview…</div> : null}
          {preview?.scene === scene.id && previewFile && stillsQ.data?.files.some((f) => f.name === `look-${scene.id}-after-${mid}.jpg`) ? <div className="relative mt-2 max-h-60 overflow-hidden rounded border border-studio-line"><img src={previewFile('before')} alt="Before" className="block max-h-60 w-full object-cover" /><img src={previewFile('after')} alt="After" className="absolute inset-0 block max-h-60 w-full object-cover" style={{ clipPath: 'inset(0 0 0 45%)' }} /><input aria-label="Before/after wipe" type="range" min={0} max={100} defaultValue={55} onChange={(ev) => { const el = ev.currentTarget.previousElementSibling as HTMLImageElement | null; if (el) el.style.clipPath = `inset(0 0 0 ${ev.currentTarget.value}%)`; }} className="absolute bottom-1 left-2 right-2 w-[calc(100%-1rem)] accent-studio-amber" /></div> : null}
        </div>;
      })}</div>
    </Panel>

    <Panel className="p-4"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><div className="flex items-center gap-2"><h2 className="text-sm font-semibold">Sound</h2>{soundStage ? <StatusBadge status={soundStage.status} /> : null}</div><div className="text-[11px] text-studio-muted">Click the SFX lane to add; Alt-click places on a frame. Drag markers, or select and use ←/→ and Delete.</div></div><div className="flex gap-2"><Button size="sm" onClick={() => saveCues.mutate()} disabled={readOnly || saveCues.isPending}>{saveCues.isPending ? 'Saving…' : 'Save cues'}</Button><Button size="sm" onClick={async () => { if (await saveSound()) setMixOpen(true); }} disabled={readOnly}>Rebuild mix</Button>{soundStage && soundStage.status !== 'approved' ? <Button size="sm" variant="primary" onClick={() => approveSound.mutate()} disabled={readOnly || approveSound.isPending}>{approveSound.isPending ? 'Approving…' : 'Approve sound'}</Button> : null}</div></div>
      <div className="text-[10px] text-studio-amber">Re-running the Sound stage replaces these cue edits. Rebuild mix keeps them.</div>
      <div className="mt-3 select-none" ref={laneRef}>
        <div className="relative h-16 overflow-hidden rounded border border-studio-line bg-studio-bg">{(voicePeaksQ.data?.peaks ?? []).map((p, i) => <div key={i} className="absolute bottom-0 w-px bg-studio-muted/50" style={{ left: `${(i / Math.max(1, (voicePeaksQ.data?.peaks.length ?? 1))) * 100}%`, height: `${Math.max(3, Math.abs(p.max) * 100)}%` }} />)}<div className="absolute left-1 top-1 text-[9px] text-studio-faint">voice</div></div>
        <div className="relative mt-1 h-8 rounded border border-studio-line bg-studio-panel/50">{cues.music.map((m, i) => { const s = timeline.scenes.find((x) => x.id === m.scene); if (!s) return null; return <button key={m.scene} onClick={() => setSelected({ lane: 'music', index: i })} className={`absolute inset-y-0 overflow-hidden border-l px-1 text-left text-[9px] ${m.muted ? 'opacity-35' : ''} ${selected?.lane === 'music' && selected.index === i ? 'ring-1 ring-inset ring-studio-amber' : ''}`} style={{ left: `${(s.start / duration) * 100}%`, width: `${Math.max(1, ((s.end - s.start) / duration) * 100)}%`, background: `${MOOD_COLOR[s.mood ?? ''] ?? '#3a4658'}33` }} title={`${m.scene} · ${m.mood} · ${m.tempo} bpm`}>{m.scene}</button>; })}<div className="absolute left-1 top-0 text-[9px] text-studio-faint">music</div></div>
        <div className="relative mt-1 h-6 rounded border border-studio-line bg-studio-panel/50">{cues.music.filter((m) => m.ambience).map((m, i) => { const s = timeline.scenes.find((x) => x.id === m.scene); if (!s) return null; return <button key={`amb-${m.scene}`} onClick={() => setSelected({ lane: 'music', index: cues.music.indexOf(m) })} className="absolute inset-y-0 overflow-hidden border-l bg-studio-teal/20 px-1 text-left text-[8px] text-studio-teal" style={{ left: `${(s.start / duration) * 100}%`, width: `${Math.max(1, ((s.end - s.start) / duration) * 100)}%` }} title={`${m.scene} · ${m.ambience}`}>{m.ambience}</button>; })}<div className="pointer-events-none absolute left-1 top-0 text-[9px] text-studio-faint">ambience</div></div>
        <div className="relative mt-1 h-7 rounded border border-studio-line bg-studio-panel/50">{cues.stingers.map((s, i) => <button key={`${s.kind}-${i}`} onClick={() => setSelected({ lane: 'stinger', index: i })} className={`absolute top-1 h-4 -translate-x-1/2 rounded bg-studio-violet/70 px-1 text-[8px] text-studio-bg ${s.muted ? 'opacity-35' : ''}`} style={{ left: `${(anchorSeconds(s.at, words) / duration) * 100}%` }} title={`${s.kind} ${s.at}`}>{s.kind}</button>)}<div className="absolute left-1 top-0 text-[9px] text-studio-faint">stingers</div></div>
        <div className="relative mt-1 h-9 cursor-crosshair rounded border border-studio-line bg-studio-panel/50" onClick={addSfx} onPointerMove={moveSfx} onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)}>{cues.sfx.map((s, i) => <button key={`${s.kind}-${s.at}-${i}`} onPointerDown={(e) => { e.stopPropagation(); setDrag(i); setSelected({ lane: 'sfx', index: i }); }} onClick={(e) => e.stopPropagation()} className={`absolute top-1 h-5 -translate-x-1/2 rounded px-1 text-[8px] ${s.muted ? 'bg-studio-faint/30' : 'bg-studio-teal/70'} text-studio-bg ${selected?.lane === 'sfx' && selected.index === i ? 'ring-2 ring-studio-amber' : ''}`} style={{ left: `${(anchorSeconds(s.at, words) / duration) * 100}%` }} title={`${s.kind} ${s.at}`}>{s.kind}</button>)}<div className="pointer-events-none absolute left-1 top-0 text-[9px] text-studio-faint">sfx</div></div>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="grid grid-cols-2 gap-x-3 gap-y-2"><Slider label="Music" value={cues.mix?.musicDb ?? 0} min={-12} max={6} step={0.5} onChange={(v) => setCues({ ...cues, mix: { ...cues.mix, musicDb: v } })} /><Slider label="SFX" value={cues.mix?.sfxDb ?? 0} min={-12} max={6} step={0.5} onChange={(v) => setCues({ ...cues, mix: { ...cues.mix, sfxDb: v } })} /><Slider label="Stingers" value={cues.mix?.stingerDb ?? 0} min={-12} max={6} step={0.5} onChange={(v) => setCues({ ...cues, mix: { ...cues.mix, stingerDb: v } })} /><Slider label="Ambience" value={cues.mix?.ambienceDb ?? 0} min={-12} max={6} step={0.5} onChange={(v) => setCues({ ...cues, mix: { ...cues.mix, ambienceDb: v } })} /><Slider label="Ducking" value={cues.mix?.duckDb ?? -4} min={-12} max={0} step={0.5} onChange={(v) => setCues({ ...cues, mix: { ...cues.mix, duckDb: v } })} /></div>
        <div className="rounded-lg border border-studio-line bg-studio-bg/35 p-2">{selectedMusic ? <><div className="flex items-center justify-between"><span className="text-xs font-medium">{selectedMusic.scene}</span><Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Close</Button></div><div className="mt-1 text-[10px] text-studio-muted">{selectedMusic.mood} · {selectedMusic.tempo} bpm · {selectedMusic.intensity} · {selectedMusic.instruments.join(', ')}</div><div className="mt-2 flex items-center gap-2"><label className="flex items-center gap-1 text-[10px]"><input type="checkbox" checked={!!selectedMusic.muted} onChange={(e) => updateCue('music', selected!.index, { muted: e.target.checked })} /> mute</label><label className="flex items-center gap-1 text-[10px]">gain <input type="number" className={inputClass + ' w-20 py-1 text-xs'} value={selectedMusic.gainDb ?? 0} onChange={(e) => updateCue('music', selected!.index, { gainDb: Number(e.target.value) })} /> dB</label><div className="mt-1 text-[10px]"><span className="mr-1 text-studio-faint">ambience</span><select aria-label="Ambience" className={inputClass + ' inline-block w-32 py-1 text-[10px]'} value={selectedMusic.ambience ?? ''} onChange={(e) => updateCue('music', selected!.index, { ambience: e.target.value || undefined })}><option value="">none</option>{['birds','wind','village','water','night-insects','fire','court-murmur'].map((a) => <option key={a} value={a}>{a}</option>)}</select></div></div></> : selectedCue ? <><div className="flex items-center justify-between"><span className="text-xs font-medium">{selected?.lane === 'sfx' ? 'SFX' : 'Stinger'} · {selectedCue.kind}</span><Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Close</Button></div>{selected?.lane === 'sfx' ? <div className="mt-2 space-y-2"><Field label="Kind"><SelectBox ariaLabel="SFX kind" value={selectedCue.kind} onValueChange={(v) => updateCue('sfx', selected.index, { kind: v })} items={SFX_KINDS.map((k) => ({ value: k, label: k }))} /></Field><div className="grid grid-cols-2 gap-2"><Field label="Gain dB"><input type="number" className={inputClass} value={selectedCue.gainDb ?? 0} onChange={(e) => updateCue('sfx', selected.index, { gainDb: Number(e.target.value) })} /></Field><Field label="Seed"><input type="number" className={inputClass} value={selectedCue.seed ?? 1} onChange={(e) => updateCue('sfx', selected.index, { seed: Number(e.target.value) })} /></Field></div><Field label="Note"><input className={inputClass} value={selectedCue.note ?? ''} onChange={(e) => updateCue('sfx', selected.index, { note: e.target.value })} /></Field><div className="flex gap-2"><Button size="sm" onClick={() => updateCue('sfx', selected.index, { seed: Math.floor(Math.random() * 99999) })}>Vary</Button><Button size="sm" onClick={() => previewCue.mutate(selectedCue)} disabled={previewCue.isPending}>Preview</Button><Button size="sm" variant="danger" onClick={() => { setCues({ ...cues, sfx: cues.sfx.filter((_, i) => i !== selected.index) }); setSelected(null); }}>Delete</Button></div>{audioPreview ? <audio controls src={audioPreview} className="mt-1 h-8 w-full" /> : null}</div> : <div className="mt-2 text-[10px] text-studio-muted">Stinger at {selectedCue.at}. Gain {selectedCue.gainDb ?? 0} dB · muted {String(!!selectedCue.muted)}</div>}</> : <div className="text-[11px] text-studio-muted">Select a music section, stinger or SFX marker to edit it.</div>}</div>
      </div>
      <div className="mt-3 flex items-center gap-2"><audio controls src={fileUrl(id, 'audio/mix.wav')} className="h-9 flex-1" /><span className="text-[10px] text-studio-muted">{mixPeaksQ.data ? `${mixPeaksQ.data.duration.toFixed(1)}s mix` : 'no mix.wav'}</span></div>
    </Panel>

    <Panel className="p-4"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-semibold">Render</h2><div className="text-[11px] text-studio-muted">Cached segments are reused; only dirty shots and their transition composites render.</div></div><div className="flex items-center gap-2"><Badge tone={planQ.data?.framesToRender ? 'amber' : 'green'}>{planQ.data ? `${planQ.data.framesToRender} frames to render` : 'plan unavailable'}</Badge><Button size="sm" onClick={() => qc.invalidateQueries({ queryKey: ['final-plan', id] })}>Refresh plan</Button></div></div>
      {planQ.data ? <><div className="flex h-9 overflow-hidden rounded border border-studio-line bg-studio-bg">{planQ.data.segments.map((s) => <div key={s.shot} title={`${s.shot}: ${s.cached ? 'cached' : s.reason}`} className={`flex items-center justify-center overflow-hidden border-r border-studio-bg/60 text-[8px] ${s.cached ? 'bg-white/10 text-studio-faint' : 'bg-studio-amber/70 text-studio-bg'}`} style={{ width: `${Math.max(1, (s.frames / Math.max(1, planQ.data!.totalFrames)) * 100)}%` }}>{s.shot}</div>)}</div><div className="mt-2 flex flex-wrap gap-3 text-[10px] text-studio-muted"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-white/20" /> cached</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-studio-amber" /> {planQ.data.framesToRender ? `dirty · ${planQ.data.framesToRender} frames · ${planQ.data.estMinutes} min · ${planQ.data.diskNeedMB} MB` : 'all shot segments cached'}</span><span>{planQ.data.totalFrames} total frames · {planQ.data.audioOnly ? 'audio-only re-mux' : planQ.data.size}</span></div>{planQ.data.framesToRender ? <div className="mt-2 flex flex-wrap gap-1">{planQ.data.segments.filter((s) => !s.cached).map((s) => <Badge key={s.shot} tone="amber">{s.shot} · {s.reason}</Badge>)}</div> : null}</> : <div className="text-xs text-studio-muted">{planQ.error ? `Plan needs an animatic: ${String((planQ.error as Error).message)}` : 'Loading plan…'}</div>}
      <div className="mt-3 grid gap-3 lg:grid-cols-[1.4fr_1fr]"><div className="relative overflow-hidden rounded-lg bg-black"><video ref={videoRef} src={fileUrl(id, ab && hasPrev ? 'final.prev.mp4' : 'final.mp4')} controls playsInline className="max-h-[62vh] w-full" /><div className="absolute inset-x-0 bottom-9 h-4">{timeline.scenes.map((s) => <button key={s.id} aria-label={`Jump to ${s.id}`} title={s.id} onClick={() => { if (videoRef.current) { videoRef.current.currentTime = s.start; videoRef.current.play(); } }} className="absolute bottom-0 h-2 rounded-sm bg-studio-teal/60 hover:bg-studio-amber" style={{ left: `${(s.start / duration) * 100}%`, width: `${Math.max(0.5, ((s.end - s.start) / duration) * 100)}%` }} />)}</div></div><div className="space-y-2"><div className="flex gap-2"><Button size="sm" variant={ab ? 'primary' : 'secondary'} disabled={!hasPrev} onClick={() => setAb((v) => !v)}>{ab && hasPrev ? 'B · previous' : 'A · current'}</Button><Button size="sm" onClick={async () => { if (await saveBoth()) setRenderOpen(true); }} disabled={readOnly}>Render final</Button></div><div className="max-h-52 overflow-auto rounded border border-studio-line bg-studio-bg/30 p-2">{qaQ.data ? <Markdown source={qaQ.data} /> : <div className="text-[11px] text-studio-muted">No final QA yet.</div>}</div></div></div>
    </Panel>

    <RangeEditor project={id} duration={duration} words={words} disabled={readOnly} />

    <EstimateDialog open={previewOpen} onOpenChange={(v) => { setPreviewOpen(false); if (!v) setPreviewScene(null); }} project={id} op="stills" args={{ shots: previewScene ?? undefined, frames: preview ? String(preview.frame) : undefined, quality: 'preview', look: previewScene ? { version: 1, scenes: { [previewScene]: look.scenes[previewScene] ?? {} } } : undefined, tag: previewScene ? `look-${previewScene}-` : undefined, compare: true }} title="Preview the finishing look" onConfirmed={() => { qc.invalidateQueries({ queryKey: ['list', id, 'stills'] }); setPreviewOpen(false); }} />
    <EstimateDialog open={renderOpen} onOpenChange={setRenderOpen} project={id} op="final" args={{}} title="Render final" onConfirmed={() => { qc.invalidateQueries({ queryKey: ['final-plan', id] }); qc.invalidateQueries({ queryKey: ['project', id] }); qc.invalidateQueries({ queryKey: ['file', id, 'final-qa.md'] }); }} />
    <EstimateDialog open={mixOpen} onOpenChange={setMixOpen} project={id} op="audio" args={{}} title="Rebuild the mix" onConfirmed={() => { qc.invalidateQueries({ queryKey: ['file', id, 'audio/mix.wav'] }); qc.invalidateQueries({ queryKey: ['peaks', id, 'audio/mix.wav'] }); qc.invalidateQueries({ queryKey: ['final-plan', id] }); }} />
    <DialogShell open={copyOpen} onOpenChange={setCopyOpen} title="Copy a finishing look" description="Copy one scene's overrides to another scene." footer={<><Button variant="ghost" onClick={() => setCopyOpen(false)}>Cancel</Button><Button variant="primary" disabled={!copyFrom || !copyTo || copyFrom === copyTo} onClick={() => { setLook({ ...look, scenes: { ...look.scenes, [copyTo]: structuredClone(look.scenes[copyFrom] ?? {}) } }); setCopyOpen(false); }}>Copy</Button></>}><div className="grid gap-3 sm:grid-cols-2"><Field label="From"><SelectBox ariaLabel="Copy from scene" value={copyFrom} onValueChange={setCopyFrom} items={sceneList.map((s) => ({ value: s.id, label: s.id }))} /></Field><Field label="To"><SelectBox ariaLabel="Copy to scene" value={copyTo} onValueChange={setCopyTo} items={sceneList.map((s) => ({ value: s.id, label: s.id }))} /></Field></div></DialogShell>
  </div>;
}
