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
