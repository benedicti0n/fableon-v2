// Live event fan-out for WebSocket and SSE clients.
export class EventHub {
  constructor() { this.clients = new Set(); }
  add(client, project = null) {
    const c = { ...client, project };
    this.clients.add(c);
    return () => this.clients.delete(c);
  }
  broadcast(event) {
    const text = JSON.stringify(event);
    for (const c of [...this.clients]) {
      if (c.project && event.project && c.project !== event.project) continue;
      try {
        if (c.kind === 'ws') c.socket.send(text);
        else c.res.write(`data: ${text}\n\n`);
      } catch { this.clients.delete(c); }
    }
  }
  close() { for (const c of this.clients) { try { c.kind === 'ws' ? c.socket.close() : c.res.end(); } catch { /* ignore */ } } this.clients.clear(); }
}
