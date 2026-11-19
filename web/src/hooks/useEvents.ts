import { useEffect, useRef } from 'react';
import type { Event } from '../api/client';

type Handler = (event: Event) => void;
const TERMINAL = new Set(['done', 'failed', 'cancelled', 'interrupted']);

/** One per-project event stream: WebSocket with backoff, SSE fallback, terminal de-duplication. */
export function useEvents(project: string | undefined, onEvent: Handler) {
  const handler = useRef(onEvent);
  handler.current = onEvent;
  useEffect(() => {
    if (!project) return;
    let closed = false, ws: WebSocket | null = null, es: EventSource | null = null;
    let attempt = 0, timer: number | undefined;
    const seen = new Set<string>();
    const emit = (e: Event) => {
      if (e.type === 'job' && e.job && e.status && TERMINAL.has(e.status)) {
        const key = `${e.job}:${e.status}`;
        if (seen.has(key)) return;
        seen.add(key);
      }
      handler.current(e);
    };
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const openWs = () => {
      if (closed) return;
      ws = new WebSocket(`${protocol}//${location.host}/api/events?project=${encodeURIComponent(project)}`);
      ws.onopen = () => { attempt = 0; };
      ws.onmessage = (m) => { try { emit(JSON.parse(m.data)); } catch { /* ignore */ } };
      ws.onerror = () => { try { ws?.close(); } catch { /* ignore */ } };
      ws.onclose = () => {
        ws = null;
        if (closed) return;
        attempt++;
        if (attempt >= 3 && !es) openSse();
        const delay = Math.min(10000, 500 * 2 ** Math.min(attempt, 5)) + Math.random() * 250;
        timer = window.setTimeout(openWs, delay);
      };
    };
    const openSse = () => {
      if (closed) return;
      es = new EventSource(`/api/events/sse?project=${encodeURIComponent(project)}`);
      es.onmessage = (m) => { try { emit(JSON.parse(m.data)); } catch { /* ignore */ } };
      es.onerror = () => { try { es?.close(); } catch { /* ignore */ } es = null; };
    };
    openWs();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      try { ws?.close(); } catch { /* ignore */ }
      try { es?.close(); } catch { /* ignore */ }
    };
  }, [project]);
}
