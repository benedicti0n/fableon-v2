// Typed API access. The schema is generated from server/openapi.json; screens use this client and never hand-write URLs
// for their data model. File/peaks/list/timeline helpers are small typed wrappers over the same same-origin API.
import createClient from 'openapi-fetch';
import type { paths, components } from './schema';

export const client = createClient<paths>({ credentials: 'same-origin' });

export type Project = components['schemas']['project.schema'];
export type Event = components['schemas']['event.schema'];

export class ApiError extends Error {
  code: string;
  status: number;
  details: Record<string, unknown>;
  constructor(message: string, code = 'INTERNAL', status = 500, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const unwrap = async <T>(result: { data?: T; error?: unknown; response: Response }): Promise<T> => {
  if (result.response.ok && result.data !== undefined) return result.data;
  const e = (result.error ?? {}) as { error?: string; code?: string; details?: Record<string, unknown> };
  throw new ApiError(e.error ?? `HTTP ${result.response.status}`, e.code ?? 'INTERNAL', result.response.status, e.details ?? {});
};

export async function json<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(path, { credentials: 'same-origin', ...init, headers: { ...(init.body && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : {}), ...(init.headers ?? {}) } });
  const text = await r.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) {
    const e = (data ?? {}) as { error?: string; code?: string; details?: Record<string, unknown> };
    throw new ApiError(e.error ?? `HTTP ${r.status}`, e.code ?? 'INTERNAL', r.status, e.details ?? {});
  }
  return data as T;
}

export const text = async (path: string): Promise<string> => {
  const r = await fetch(path, { credentials: 'same-origin' });
  if (!r.ok) throw new ApiError(`HTTP ${r.status}`, 'NOT_FOUND', r.status);
  return r.text();
};

export const fileUrl = (project: string, path: string) => `/api/projects/${encodeURIComponent(project)}/files/${path.split('/').map(encodeURIComponent).join('/')}`;

export type StageRow = { stage: string; status: string; approved: string; lastRun: string; tokens: string; cost: string; usage?: Record<string, unknown> | null; error?: string | null };
export type Job = { id: string; project: string; op: string; args: Record<string, unknown>; status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'interrupted'; createdAt: string; startedAt?: string | null; finishedAt?: string | null; progress?: { step?: string; done?: number; total?: number; etaMs?: number; message?: string }; error?: string | null; resumable?: boolean; logTail?: string };
export type TimelineKey = { index: number; at: string; start: number; end: number; startFrame: number; endFrame: number; size: string | null; move: string; angle: string; side: string; subjects: string[]; marks: string[]; punch: boolean; impact: boolean; drama: boolean; reveal: boolean; cut: boolean; foreground: string | null };
export type TimelineScene = { id: string; start: number; end: number; startFrame: number; endFrame: number; light: string | null; mood: string | null; sets: string[]; transition: { type?: string; frames?: number } | null; keys: TimelineKey[]; needsHuman: boolean; findings: string[] };
export type Timeline = { project: string; fps: number; duration: number; scenes: TimelineScene[]; script: Array<{ n: number; beat: string | null; text: string; gloss: string | null; facts: string[]; delivery: Record<string, unknown> | null; look: Record<string, unknown> | null; words: Array<{ w: string; a: number; b: number }>; start: number; end: number }>; needsHuman: Array<{ id: string; findings: string[] }> };
export type Peaks = { path: string; hash: string; sampleRate: number; duration: number; buckets: number; peaks: Array<{ min: number; max: number }>; cached?: boolean };
export type FileEntry = { path: string; name: string; size: number; mtime: string; type: string; url: string };
export type Estimate = { op: string; project: string; provider: string | null; calls: number; characters: number; cachedCharacters: number; usd: number; inr?: number; frameCount?: number; seconds?: number; notes: string[] };

export const getProject = (id: string) => json<{ id: string; readOnly: boolean; source: string; project: Project; stages: StageRow[]; todos: string[]; craft: Array<{ n: number; note: string }>; usage: { calls: number; cached: number; promptTokens: number; completionTokens: number; costUsd: number } }>(`/api/projects/${encodeURIComponent(id)}`);
export const getStages = (id: string) => json<{ id: string; stages: StageRow[]; todos: string[]; craft: Array<{ n: number; note: string }> }>(`/api/projects/${encodeURIComponent(id)}/stages`);
export const getTimeline = (id: string) => json<Timeline>(`/api/projects/${encodeURIComponent(id)}/timeline`);
export const getPeaks = (id: string, path = 'voice.wav', buckets = 1200) => json<Peaks>(`/api/projects/${encodeURIComponent(id)}/peaks?path=${encodeURIComponent(path)}&buckets=${buckets}`);
export const getList = (id: string, dir: string) => json<{ dir: string; files: FileEntry[] }>(`/api/projects/${encodeURIComponent(id)}/list?dir=${encodeURIComponent(dir)}`);
export const getJobs = (project?: string) => json<{ jobs: Job[] }>(`/api/jobs${project ? `?project=${encodeURIComponent(project)}` : ''}`);
export const getJob = (id: string) => json<Job>(`/api/jobs/${encodeURIComponent(id)}`);
export const estimate = (id: string, op: string, args: Record<string, unknown> = {}) => json<Estimate>(`/api/projects/${encodeURIComponent(id)}/estimate`, { method: 'POST', body: JSON.stringify({ op, args }) });
export const runOp = (id: string, op: string, args: Record<string, unknown> = {}) => json<Job>(`/api/projects/${encodeURIComponent(id)}/ops/${encodeURIComponent(op)}`, { method: 'POST', body: JSON.stringify(args) });
export const runStages = (id: string, args: Record<string, unknown> = {}) => json<Job>(`/api/projects/${encodeURIComponent(id)}/run`, { method: 'POST', body: JSON.stringify(args) });
export const approveStage = (id: string, stage: string, override?: string) => json<{ stage: string; hash: string; status: string }>(`/api/projects/${encodeURIComponent(id)}/stages/${encodeURIComponent(stage)}/approve`, { method: 'POST', body: JSON.stringify(override ? { override } : {}) });
export const notes = (id: string, stage: string, body: string) => json<{ stage: string; notes: number }>(`/api/projects/${encodeURIComponent(id)}/stages/${encodeURIComponent(stage)}/notes`, { method: 'POST', body: JSON.stringify({ text: body }) });
export const putFile = (id: string, path: string, body: unknown) => json<{ path: string; stage: string | null; status: string }>(`/api/projects/${encodeURIComponent(id)}/files/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'PUT', body: typeof body === 'string' ? body : JSON.stringify(body), headers: typeof body === 'string' ? { 'content-type': 'text/plain' } : undefined });
export const patchProject = (id: string, patch: Record<string, unknown>) => json<unknown>(`/api/projects/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const cancelJob = (id: string) => json<Job>(`/api/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: '{}' });

export type Voices = { providers: Array<{ name: string; configured: boolean; model: string; speakers: Array<string | { id?: string; name?: string }> }>; cached: Array<{ project: string; auditions: string[] }>; credit: { elevenlabs?: { plan?: string; used?: number; limit?: number; remaining?: number; reset?: string; available?: boolean; note?: string }; sarvam?: { budgetInr?: number; note?: string } } };
export const getVoices = () => json<Voices>('/api/voices');
export const getKeys = () => json<Record<string, 'set' | 'unset'>>('/api/settings/keys');

export async function waitJob(id: string, timeoutMs = 30 * 60 * 1000): Promise<Job> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const j = await getJob(id);
    if (['done', 'failed', 'cancelled', 'interrupted'].includes(j.status)) return j;
    await new Promise((r) => setTimeout(r, 900));
  }
  throw new ApiError('Timed out waiting for the job', 'STAGE_FAILED', 504);
}

/** A work copy shadows the read-only fixture with the same id, because the API addresses projects by id alone. */
export function splitProjects<T extends { id: string; source: string }>(projects: T[]) {
  const work = projects.filter((p) => p.source === 'work');
  const workIds = new Set(work.map((p) => p.id));
  return { work, fixtures: projects.filter((p) => p.source === 'fixture' && !workIds.has(p.id)) };
}

export type FinalPlanSegment = { shot: string; scene: string; frames: number; cached: boolean; reason: string | null; file: string; hash: string; lookHash?: string };
export type FinalPlan = { project: string; engine: string; quality: string; size: string; totalFrames: number; framesToRender: number; audioOnly: boolean; assembleOnly: boolean; estMinutes: number; diskNeedMB: number; segments: FinalPlanSegment[]; transitions: Array<{ index: number; type: string; frames: number; at: number; start: number; end: number; file: string; cached: boolean; reason: string | null }> };
export const getFinalPlan = (id: string) => json<FinalPlan>(`/api/projects/${encodeURIComponent(id)}/final/plan`);

export type Channel = { name: string; footer?: string; links?: string[]; hashtags?: string[]; category?: string; madeForKids?: boolean };
export const getChannel = () => json<Channel>('/api/settings/channel');
export const putChannel = (data: Channel) => json<Channel>('/api/settings/channel', { method: 'PUT', body: JSON.stringify(data) });
export const getOverview = () => json<{ projects: Array<{ id: string; title: string; readOnly: boolean; source: string; cover: string | null; stages: StageRow[]; usage: { costUsd: number; calls: number; cached: number }; project: { seconds: number; language: string; published?: { platform: string; url: string; publishedAt: string } | null; tags?: string[] } }> }>('/api/projects/overview');
export const getExports = (id: string) => json<{ exports: Array<{ name: string; path: string }> }>(`/api/projects/${encodeURIComponent(id)}/exports`);
export const openExport = (id: string, path: string) => json<{ path: string; opened: boolean }>(`/api/projects/${encodeURIComponent(id)}/exports/open`, { method: 'POST', body: JSON.stringify({ path }) });
export const recomposeCover = (id: string, selection: Record<string, unknown>) => json<{ cover: string; candidate: string }>(`/api/projects/${encodeURIComponent(id)}/publish/cover`, { method: 'POST', body: JSON.stringify({ selection }) });
export const overridePublish = (id: string, reason: string) => json<{ project: string; reason: string }>(`/api/projects/${encodeURIComponent(id)}/publish/override`, { method: 'POST', body: JSON.stringify({ reason }) });
export const markPublished = (id: string, body: { platform: string; url: string; publishedAt: string }) => json<unknown>(`/api/projects/${encodeURIComponent(id)}/published`, { method: 'POST', body: JSON.stringify(body) });
