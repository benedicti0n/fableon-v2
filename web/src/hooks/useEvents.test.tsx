import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEvents } from './useEvents';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  onopen: null | (() => void) = null;
  onmessage: null | ((m: { data: string }) => void) = null;
  onerror: null | (() => void) = null;
  onclose: null | (() => void) = null;
  constructor(url: string) { this.url = url; FakeWebSocket.instances.push(this); }
  close() { this.onclose?.(); }
  open() { this.onopen?.(); }
  message(event: unknown) { this.onmessage?.({ data: JSON.stringify(event) }); }
  serverClose() { this.onclose?.(); }
}

const terminal = (status = 'done') => ({ type: 'job', job: 'job_1', status, project: 'demo' });

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
  vi.stubGlobal('EventSource', class { close() {} } as unknown as typeof EventSource);
  vi.spyOn(Math, 'random').mockReturnValue(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useEvents', () => {
  it('de-duplicates terminal (job, status) events', () => {
    const seen = vi.fn();
    renderHook(() => useEvents('demo', seen));
    const ws = FakeWebSocket.instances[0];
    act(() => {
      ws.open();
      ws.message(terminal('done'));
      ws.message(terminal('done'));
      ws.message(terminal('failed'));
    });
    expect(seen).toHaveBeenCalledTimes(2);
    expect(seen.mock.calls.map(([e]) => e.status)).toEqual(['done', 'failed']);
  });

  it('reconnects with backoff after the socket closes', () => {
    renderHook(() => useEvents('demo', () => {}));
    expect(FakeWebSocket.instances).toHaveLength(1);
    act(() => { FakeWebSocket.instances[0].serverClose(); });
    expect(FakeWebSocket.instances).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(1200); });
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[1].url).toContain('/api/events?project=demo');
  });

  it('opens one stream per project and closes it on unmount', () => {
    const { unmount } = renderHook(() => useEvents('demo', () => {}));
    const ws = FakeWebSocket.instances[0];
    const close = vi.spyOn(ws, 'close');
    unmount();
    expect(close).toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
