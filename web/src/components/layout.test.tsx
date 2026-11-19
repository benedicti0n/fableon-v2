import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Stepper } from './layout';
import { ErrorNotice, StatusBadge } from './ui';
import { ApiError } from '../api/client';

const project = {
  id: 'demo', readOnly: false, source: 'work',
  project: { title: 'Demo', topic: 'Demo', seconds: 20, language: 'en', voice: {} },
  stages: [
    { stage: 'brief', status: 'approved' }, { stage: 'research', status: 'fresh' }, { stage: 'script', status: 'stale' },
    { stage: 'voice', status: 'running' }, { stage: 'cast', status: 'failed' }, { stage: 'shotplan', status: 'approved' },
    { stage: 'board', status: 'missing' }, { stage: 'animatic', status: 'missing' },
  ],
  todos: [], craft: [], usage: { calls: 0, cached: 0, promptTokens: 0, completionTokens: 0, costUsd: 0 },
};

function renderWithProviders(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={['/p/demo/brief']}>{node}</MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(project), { status: 200, headers: { 'content-type': 'application/json' } })));
});

describe('status stepper', () => {
  it('renders every stage and the live statuses from the API', async () => {
    renderWithProviders(<Stepper project="demo" current="brief" />);
    for (const label of ['Brief', 'Research', 'Script', 'Voice', 'Cast', 'Shot plan', 'Board', 'Animatic']) expect(screen.getByText(label)).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTitle('approved').length).toBeGreaterThan(0));
    expect(screen.getByTitle('running')).toBeInTheDocument();
    expect(screen.getByTitle('failed')).toBeInTheDocument();
    expect(screen.getByText('Shot plan')).toBeInTheDocument();
    expect(screen.getByText('Board')).toBeInTheDocument();
  });
});

describe('status badges', () => {
  it('uses the approved lock and the running animation', () => {
    const { rerender } = render(<StatusBadge status="approved" />);
    expect(screen.getByText(/Approved/)).toBeInTheDocument();
    expect(screen.getByText(/🔒/)).toBeInTheDocument();
    rerender(<StatusBadge status="running" />);
    expect(screen.getByText(/Running/)).toBeInTheDocument();
    expect(document.querySelector('.animate-pulse-soft')).toBeTruthy();
  });
});

describe('error mapping', () => {
  it.each([
    ['WAITING_APPROVAL', /Approve the dependency first/],
    ['APPROVED_LOCKED', /Approved and locked/],
    ['PROJECT_LOCKED', /Another job is writing this project/],
    ['BUDGET_EXCEEDED', /exceed the budget/],
  ])('maps %s to a next action', (code, message) => {
    render(<ErrorNotice error={new ApiError('server detail', code, 409)} />);
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('alert')).toHaveTextContent('server detail');
  });
});
