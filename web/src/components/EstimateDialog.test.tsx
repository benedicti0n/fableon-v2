import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EstimateDialog } from './EstimateDialog';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrap = (node: React.ReactNode) => <QueryClientProvider client={qc}>{node}</QueryClientProvider>;

const estimate = {
  op: 'run', project: 'demo', provider: 'sarvam', calls: 3, characters: 120, cachedCharacters: 0,
  usd: 0.0027, inr: 0.24, notes: ['120 characters across 3 call(s).'], frameCount: 0, seconds: 0,
};

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('EstimateDialog', () => {
  it('shows the estimate before a paid run', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/estimate')) return response(estimate);
      return response({ id: 'job_1', op: 'run', status: 'queued' }, 202);
    });
    vi.stubGlobal('fetch', fetchMock);
    const onOpenChange = vi.fn();
    render(wrap(<EstimateDialog open onOpenChange={onOpenChange} project="demo" op="run" args={{ to: 'voice' }} title="Run voice" />));
    expect(await screen.findByText(/0\.0027/)).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText(/paid provider/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm and run' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const runCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/ops/run'));
    expect(runCall).toBeTruthy();
    expect(JSON.parse(String(runCall![1]?.body))).toEqual({ to: 'voice' });
  });

  it('requires a second confirmation when the budget is exceeded', async () => {
    let runs = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/estimate')) return response({ ...estimate, usd: 0, characters: 0 });
      runs++;
      if (runs === 1) return response({ error: 'budget exceeded', code: 'BUDGET_EXCEEDED', details: { usd: 1, budgetUsd: 0 } }, 402);
      return response({ id: 'job_2', op: 'run', status: 'queued' }, 202);
    });
    vi.stubGlobal('fetch', fetchMock);
    const onOpenChange = vi.fn();
    render(wrap(<EstimateDialog open onOpenChange={onOpenChange} project="demo" op="run" args={{ to: 'voice' }} title="Run voice" />));
    await screen.findByRole('button', { name: 'Run' });
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByRole('button', { name: 'Confirm budget override' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm budget override' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const bodies = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/ops/run')).map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual({ to: 'voice', confirmBudget: true });
  });
});
