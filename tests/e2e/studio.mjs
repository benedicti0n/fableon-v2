// End-to-end studio journey against a temp server and the mock providers.
// Run with: npm run web:e2e  (builds web/dist first).
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pw from '../../engine/node_modules/playwright/index.js';
import { ROOT } from '../../cli/src/env.js';
import { createServer } from '../../server/src/server.js';

const { chromium } = pw;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, label, timeout = 45000) => {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e; }
    await sleep(150);
  }
  throw new Error(`timed out waiting for ${label}: ${last?.message ?? last}`);
};

const root = mkdtempSync(join(tmpdir(), 'fableon-e2e-'));
process.env.FABLEON_MOCK_DIR = join(ROOT, 'tests', 'fixtures', 'llm');
const token = 'e2e-studio-token';
let app, browser;
try {
  ({ app } = await createServer({ root, token, port: 0 }));
  await app.listen({ host: '127.0.0.1', port: 0 });
  const port = app.server.address().port;
  app.fableonAuthPort?.(port);
  const base = `http://127.0.0.1:${port}`;

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  const badRequests = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('requestfailed', (r) => { const why = r.failure()?.errorText ?? ''; if (/voice\.wav|animatic\.mp4/.test(r.url()) || why === 'net::ERR_ABORTED') return; badRequests.push(`${r.url()} ${why}`); });

  // Bootstrap: the token becomes an HttpOnly cookie and disappears from the URL.
  await page.goto(`${base}/?token=${encodeURIComponent(token)}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Projects' }).waitFor();
  assert.equal(page.url(), `${base}/`, 'token URL must redirect to /');
  const stored = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
  assert.deepEqual(stored, { local: [], session: [] }, 'no token or app state in storage');
  const cookie = (await context.cookies()).find((c) => c.name === 'fableon_token');
  assert.ok(cookie?.httpOnly, 'HttpOnly cookie is set');
  const csp = (await context.request.get(`${base}/`)).headers()['content-security-policy'] ?? '';
  assert.match(csp, /default-src 'self'/, 'CSP is served with the app');

  // Create a project through the dialog.
  await page.getByRole('button', { name: '+ New project' }).first().click();
  const create = page.getByRole('dialog');
  await create.getByLabel('Topic').fill('The Moon Cheese E2E');
  await create.getByLabel('Seconds').fill('20');
  await create.getByRole('combobox', { name: 'Language' }).click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await create.getByRole('combobox', { name: 'Voice provider' }).click();
  await page.getByRole('option', { name: 'Kokoro (English)' }).click();
  await create.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/p\/the-moon-cheese-e2e\/brief/);
  const id = 'the-moon-cheese-e2e';
  const projectUrl = `${base}/p/${id}`;
  // A delivered-rate hint keeps the mock script inside the English word budget for 20 s.
  await page.evaluate(async (pid) => {
    const d = await (await fetch(`/api/projects/${pid}`)).json();
    const voice = { ...d.project.voice, rate: { wordsPerSecond: 4.4 } };
    const r = await fetch(`/api/projects/${pid}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ voice, models: { default: { provider: 'mock', model: 'mock-v1' } } }) });
    if (!r.ok) throw new Error(`voice rate PATCH failed: ${r.status}`);
  }, id);

  // Brief: approve the template so research can run.
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.getByRole('button', { name: 'Approved', exact: true }).waitFor();

  // Research: upload a source, run it with the mock model, approve the facts.
  await page.goto(`${projectUrl}/research`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type=file]').setInputFiles(join(ROOT, 'tests', 'fixtures', 'pipeline', 'mini', 'sources', 'moon.md'));
  await page.getByText('moon.md').waitFor();
  await page.getByRole('button', { name: 'Run research' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm and run' }).click();
  await page.getByText(/green cheese/).first().waitFor({ timeout: 45000 });
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.getByRole('button', { name: 'Approved', exact: true }).waitFor();

  // Script: generate the first draft, edit a line, then regenerate another with a note.
  await page.goto(`${projectUrl}/script`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Generate script' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm and run' }).click();
  const editBox = page.getByRole('textbox', { name: 'Line 0' });
  await editBox.waitFor({ timeout: 45000 });
  await editBox.fill('The moon was a wheel of green cheese.');
  const saved = page.waitForResponse((r) => r.url().endsWith('/files/script.json') && r.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  assert.equal((await saved).status(), 200, 'script line PUT succeeds');
  await page.getByRole('checkbox', { name: 'Select line 1' }).check();
  await page.getByPlaceholder('Director note for the rewrite…').fill('add a lantern to the climb');
  await page.getByRole('button', { name: 'Regenerate with note' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm and run' }).click();
  await waitFor(async () => (await page.getByRole('textbox', { name: 'Line 1' }).inputValue()).includes('lantern'), 'rewritten line 1');

  // A live job in the Activity panel: start the fake heavy op, watch it run, cancel it.
  const slow = await page.evaluate(async (pid) => (await fetch(`/api/projects/${pid}/ops/mock-sleep`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ms: 5000 }) })).json(), id);
  await page.getByText('mock-sleep').first().waitFor({ timeout: 15000 });
  await page.getByText('Running', { exact: true }).first().waitFor({ timeout: 15000 });
  await page.getByText('Cancel', { exact: true }).first().click();
  await waitFor(async () => {
    const j = await page.evaluate(async (job) => (await fetch(`/api/jobs/${job}`)).json(), slow.id);
    return j.status === 'cancelled';
  }, 'cancelled mock-sleep');

  // Mock voice: patch the provider and autopilot so the voice stage needs no external key or approval.
  await page.evaluate(async (pid) => {
    const r = await fetch(`/api/projects/${pid}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ voice: { provider: 'mock', language: 'en', align: false, fit: 'exact', rate: { wordsPerSecond: 4.4 } }, autopilot: true }) });
    if (!r.ok) throw new Error(`PATCH failed: ${r.status}`);
  }, id);
  await page.goto(`${projectUrl}/voice`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Run voice' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm and run' }).click();
  await page.getByRole('button', { name: 'Play line' }).first().waitFor({ timeout: 45000 });
  await page.locator('canvas').first().waitFor({ timeout: 15000 });

  // Cast, shot plan and board through the op endpoints (the same jobs their CLI commands run).
  for (const op of ['cast', 'shotplan', 'board']) {
    const job = await page.evaluate(async ({ pid, name }) => (await fetch(`/api/projects/${pid}/ops/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) })).json(), { pid: id, name: op });
    assert.ok(job.id, `${op} job queued`);
    await waitFor(async () => {
      const j = await page.evaluate(async (jobId) => (await fetch(`/api/jobs/${jobId}`)).json(), job.id);
      if (j.status === 'failed' || j.status === 'cancelled') throw new Error(`${op} job ${j.status}: ${j.error}`);
      return j.status === 'done';
    }, `${op} job done`, 120000);
  }

  // Timeline: every shot is on the board; a per-shot note opens the re-run estimate.
  await page.goto(`${projectUrl}/board`, { waitUntil: 'domcontentloaded' });
  const timeline = await page.evaluate(async (pid) => (await fetch(`/api/projects/${pid}/timeline`)).json(), id);
  assert.ok(timeline.scenes?.length >= 1, 'timeline has scenes');
  await page.getByText(timeline.scenes[0].id, { exact: true }).first().waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Shot note' }).click();
  await page.getByRole('dialog').getByLabel('Note').fill('Hold the landmark for two more beats.');
  await page.getByRole('dialog').getByRole('button', { name: 'Continue to estimate' }).click();
  const noteDialog = page.getByRole('dialog');
  await noteDialog.getByText('Re-run this shot').waitFor();
  await noteDialog.getByRole('button', { name: 'Cancel' }).click();

  // Animatic page opens with the shot markers from the timeline.
  await page.goto(`${projectUrl}/animatic`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Animatic' }).waitFor();
  assert.ok(await page.getByRole('button', { name: /^Jump to / }).count() >= 1, 'shot markers render');

  // No token in any storage or URL after bootstrap.
  assert.ok(!page.url().includes('token'), 'token never returns to the URL');
  const after = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage), url: location.href }));
  assert.deepEqual(after.local, []);
  assert.deepEqual(after.session, []);
  assert.ok(!after.url.includes('token'));
  assert.deepEqual(pageErrors, [], 'no uncaught page errors');
  assert.deepEqual(badRequests, [], 'no unexpected failed requests');

  console.log(`PASS studio e2e  project=${id}  url=${base}`);
  console.log('PASS token bootstrap  cookie HttpOnly  no storage  CSP active');
  console.log('PASS create → brief → research → script edit → script-lines → voice → timeline note → animatic');
  console.log('PASS live activity  mock-sleep running and cancelled');
} finally {
  try { await browser?.close(); } catch { /* closed */ }
  try { await app?.close(); } catch { /* closed */ }
  rmSync(root, { recursive: true, force: true });
}
