// Library stage runner. The CLI/server only renders events; this module writes the run log.
import { EventEmitter } from 'node:events';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { allStatuses, approve, loadState, recordStage, saveState, statusOf } from './state.js';
import { STAGES, stageByName, stageOrder } from './stages.js';
const STAGE_MODULE = { brief: 'brief.js', research: 'research.js', script: 'script.js', factcheck: 'factcheck.js', cast: 'cast.js', voice: 'voice.js', shotplan: 'shotplan.js' };

export class PipelineRunner extends EventEmitter {
  constructor(projectDir, project, opts = {}) {
    super();
    this.projectDir = projectDir;
    this.project = project;
    this.opts = opts;
    this.abort = opts.signal ?? null;
    this.logFile = join(projectDir, 'logs', `run-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
    mkdirSync(join(projectDir, 'logs'), { recursive: true });
    this.router = opts.router ?? null;
  }

  log(message) {
    const line = `${new Date().toISOString()} ${message}`;
    appendFileSync(this.logFile, line + '\n');
    this.emit('log', { message, line });
  }

  async run() {
    if (!this.router) {
      const { ModelRouter } = await import('../models/router.js');
      this.router = new ModelRouter(this.projectDir, this.project, { noCache: this.opts.noCache, signal: this.abort });
    }
    const to = this.opts.to ?? 'voice';
    const toIndex = stageOrder(to);
    if (toIndex < 0) throw new Error(`unknown --to stage "${to}" (choose ${STAGES.map((s) => s.name).join(', ')})`);
    const only = this.opts.only ?? null;
    const autopilot = this.opts.autopilot ?? !!this.project.autopilot;
    const force = !!this.opts.force;
    for (const stage of STAGES.slice(0, toIndex + 1)) {
      if (only && stage.name !== only) continue;
      if (this.abort?.aborted) throw new Error('cancelled');
      const status = statusOf(this.projectDir, this.project, stage);
      const shouldRun = force || ['missing', 'stale', 'failed'].includes(status.status) || (status.status === 'edited' && force);
      if (!shouldRun) { this.emit('skip', { stage: stage.name, status: status.status }); continue; }
      if (status.status === 'edited' && !force) throw new Error(`${stage.name} has hand-edited output; review it, approve it, or rerun with --force`);
      if (!autopilot) {
        for (const dep of stage.deps) {
          const ds = statusOf(this.projectDir, this.project, stageByName(dep));
          if (!ds.approved) throw new Error(`${stage.name} is waiting for ${dep} approval (${ds.status}); review ${this.projectDir} and run: fableon approve --project ${this.projectDir} --stage ${dep}`);
        }
      }
      await this.runStage(stage, { autopilot, fit: this.opts.fit !== false, cachedOnly: !!this.opts.cachedOnly, status });
    }
    this.emit('done', { projectDir: this.projectDir, log: this.logFile });
    return { ok: true, log: this.logFile };
  }

  async runStage(stage, { autopilot, fit, cachedOnly, status }) {
    const t0 = Date.now();
    this.log(`stage ${stage.name} start (${status.status})`);
    this.emit('progress', { stage: stage.name, status: 'running', progress: 0, message: `running ${stage.name}` });
    recordStage(this.projectDir, this.project, stage.name, { status: 'running' });
    try {
      let result;
      const mod = await import(`../stages/${STAGE_MODULE[stage.name]}`);
      const fn = mod[`run${stage.name[0].toUpperCase()}${stage.name.slice(1)}`];
      if (stage.name === 'voice') result = await fn({ projectDir: this.projectDir, project: this.project, fit, cachedOnly });
      else result = await fn({ projectDir: this.projectDir, project: this.project, router: this.router, autopilot });
      if (stage.name === 'factcheck') this.log(`factcheck reviewed ${result.reviewed ?? 0} line(s); factual flags ${result.failures?.length ?? 0}; craft weak ${result.craft?.length ?? 0}`);
      if (stage.name === 'cast') this.log(`cast ${result.characters ?? 0} character(s), ${result.assets ?? 0} asset gap(s); sheet ${result.sheet}`);
      if (stage.name === 'shotplan') this.log(`shotplan ${result.shots ?? 0} shot(s), average ${result.average ?? '?'} s, span ${result.span ?? '?'}`);
      if (stage.name === 'factcheck' && result.failures?.length) {
        if (!autopilot) {
          recordStage(this.projectDir, this.project, stage.name, { status: 'failed', error: 'fact-check needs revision' });
          throw new Error(`fact-check failed:\n${result.failures.map((f) => `  line ${f.n}: ${f.verdict}${f.craft === 'weak' ? ' / craft weak' : ''} — ${f.note} (${f.fix})`).join('\n')}\nReview ${join(this.projectDir, 'script.review.json')} and revise the script.`);
        }
        let failures = result.failures;
        let previousReview = result.review;
        for (let round = 1; round <= 2 && failures.length; round++) {
          this.log(`factcheck revise round ${round}: ${failures.map((f) => f.n).join(',')}`);
          const scriptMod = await import('../stages/script.js');
          const rev = await scriptMod.reviseScript({ projectDir: this.projectDir, project: this.project, router: this.router, failures });
          const scriptState = loadState(this.projectDir);
          if (scriptState.stages.script) scriptState.stages.script.usage = this.router.stageUsage('script');
          saveState(this.projectDir, scriptState);
          if (!rev.changed) throw new Error(`fact-check revision made no change:\n${failures.map((f) => `  line ${f.n}: ${f.verdict}${f.craft === 'weak' ? ' / craft weak' : ''} — ${f.note}`).join('\n')}`);
          const fcMod = await import('../stages/factcheck.js');
          result = await fcMod.runFactcheck({ projectDir: this.projectDir, project: this.project, router: this.router });
          const verdicts = (review) => JSON.stringify((review?.lines ?? []).map((l) => [l.n, l.verdict, l.craft ?? 'ok', l.facts ?? [], l.note]));
          if (verdicts(previousReview) === verdicts(result.review)) throw new Error(`fact-check verdicts did not change after revision:\n${result.failures.map((f) => `  line ${f.n}: ${f.verdict}${f.craft === 'weak' ? ' / craft weak' : ''} — ${f.note}`).join('\n')}`);
          previousReview = result.review;
          failures = result.failures;
        }
        if (failures.length) {
          recordStage(this.projectDir, this.project, stage.name, { status: 'failed', error: 'fact-check still failing after 2 revisions' });
          throw new Error(`fact-check still failing after 2 revisions:\n${failures.map((f) => `  line ${f.n}: ${f.verdict}${f.craft === 'weak' ? ' / craft weak' : ''} — ${f.note}`).join('\n')}`);
        }
      }
      const usage = stage.name === 'voice' ? result.usage ?? null : this.router.stageUsage(stage.name);
      if (result?.warnings?.length) for (const w of result.warnings.slice(0, 20)) this.log(`${stage.name} warning: ${w}`);
      if (result?.normalizer?.count) this.log(`normalizer: ${result.normalizer.count} intervention(s): ${result.normalizer.lines.join('; ')}`);
      if (result?.fit?.steps?.length) this.log(`voice fit: ${result.fit.steps.map((s) => s.step).join(' -> ')}`);
      recordStage(this.projectDir, this.project, stage.name, { status: 'fresh', usage });
      const ms = Date.now() - t0;
      this.log(`stage ${stage.name} done ${ms}ms`);
      this.emit('complete', { stage: stage.name, status: 'fresh', ms, usage, message: `${stage.name} complete` });
      return result;
    } catch (e) {
      recordStage(this.projectDir, this.project, stage.name, { status: 'failed', error: e.message });
      this.log(`stage ${stage.name} failed: ${e.message}`);
      this.emit('failed', { stage: stage.name, status: 'failed', error: e.message });
      throw e;
    }
  }
}
