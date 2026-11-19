import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Script from './Script';

const project = {
  id: 'demo', readOnly: false, source: 'work',
  project: { title: 'Demo', topic: 'Demo', seconds: 20, language: 'en', voice: { rate: { delivered: { wordsPerSecond: 4 } } } },
  stages: [
    { stage: 'brief', status: 'approved' }, { stage: 'research', status: 'approved' }, { stage: 'script', status: 'fresh' },
    { stage: 'factcheck', status: 'stale' }, { stage: 'voice', status: 'missing' }, { stage: 'cast', status: 'missing' },
    { stage: 'shotplan', status: 'missing' }, { stage: 'board', status: 'missing' }, { stage: 'animatic', status: 'missing' },
  ],
  todos: [], craft: [], usage: { calls: 0, cached: 0, promptTokens: 0, completionTokens: 0, costUsd: 0 },
};

const script = {
  version: 1,
  lines: [
    { n: 0, text: 'The moon was green cheese.', gloss: 'A strange claim.', beat: 'hook', facts: ['F1'], look: { set: 'village', who: ['mira'], note: 'Mira looks up.' }, delivery: { tone: 'deadpan', pauses: [], emphasis: ['cheese'] } },
    { n: 1, text: 'The village polished it every spring.', gloss: 'They kept it clean.', beat: 'setting', facts: ['F1'], look: { set: 'village', who: ['mira'], note: 'The village gathers.' } },
  ],
};

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function renderScript() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={['/p/demo/script']}><Routes><Route path="/p/:id/script" element={<Script />} /></Routes></MemoryRouter></QueryClientProvider>);
}

afterEach(() => vi.unstubAllGlobals());

describe('script line edit', () => {
  it('saves the edited line through PUT script.json', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith('/files/script.json') && init?.method === 'PUT') return response({ path: 'script.json', stage: 'script', status: 'edited' });
      if (path.endsWith('/files/script.json')) return response(script);
      if (path.endsWith('/files/research/facts.json')) return response({ facts: [{ id: 'F1', claim: 'The moon is cheese.', sources: [{ source: 'S1', quote: 'green cheese' }] }] });
      if (path.endsWith('/files/script.review.json')) return response({ lines: [] });
      if (path.endsWith('/api/projects/demo')) return response(project);
      return response({ error: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderScript();
    const line = await screen.findByLabelText('Line 0');
    await userEvent.clear(line);
    await userEvent.type(line, 'The moon was a wheel of cheese.');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/files/script.json') && init?.method === 'PUT');
      expect(put).toBeTruthy();
      const body = JSON.parse(String(put![1]?.body));
      expect(body.lines[0].text).toBe('The moon was a wheel of cheese.');
    });
  });
});
