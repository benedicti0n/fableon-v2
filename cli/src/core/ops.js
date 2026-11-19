// One operations registry for the CLI and the Phase 4 server. Each op maps to a CLI command and a JSON-schema arg shape.
const str = { type: 'string' };
const bool = { type: 'boolean' };
const num = { type: 'number' };
const obj = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, required });
const proj = { project: str };

export const OPS = [
  {
    name: 'run', description: 'run pipeline stages in dependency order', kind: 'stage', heavy: true, cancellable: true,
    argsSchema: obj({ ...proj, to: str, only: str, force: bool, autopilot: bool, noCache: bool, fit: str, cachedOnly: bool }, ['project']),
    outputs: ['storyboard.json', 'script.json', 'voice.wav'],
  },
  {
    name: 'approve', description: 'approve one stage output', kind: 'stage', heavy: false, cancellable: false,
    argsSchema: obj({ ...proj, stage: str, override: str }, ['project', 'stage']),
    outputs: ['.fableon/state.json'],
  },
  {
    name: 'cast', description: 'design the cast and render the cast sheet', kind: 'stage', heavy: true, cancellable: true,
    argsSchema: obj({ ...proj, notes: str }, ['project']), outputs: ['cast.json', 'cast/cast-sheet.jpg'],
  },
  {
    name: 'shotplan', description: 'write the shot plan', kind: 'stage', heavy: true, cancellable: true,
    argsSchema: obj({ ...proj, notes: str }, ['project']), outputs: ['shotplan.json', 'shotplan.md'],
  },
  {
    name: 'board', description: 'write and repair the authoring board', kind: 'stage', heavy: true, cancellable: true,
    argsSchema: obj({ ...proj, notes: str, shot: str }, ['project']), outputs: ['board.json', 'board.review.json', 'storyboard.json'],
  },
  {
    name: 'script-lines', description: 'rewrite only selected script lines with director notes', kind: 'stage', heavy: true, cancellable: true,
    argsSchema: obj({ ...proj, lines: { type: 'array', items: { type: 'integer', minimum: 0 }, minItems: 1 }, notes: str, force: bool, noCache: bool }, ['project', 'lines']),
    outputs: ['script.json', 'SCRIPT.md'],
  },
  {
    name: 'render', description: 'render all shot segments', kind: 'job', heavy: true, cancellable: true,
    argsSchema: obj({ ...proj, quality: str, workers: num, shots: str }, ['project']), outputs: ['render/seg_*.mp4'],
  },
  {
    name: 'audio', description: 'synthesize score, SFX and the final mix', kind: 'job', heavy: true, cancellable: true,
    argsSchema: obj({ ...proj }, ['project']), outputs: ['audio/mix.wav'],
  },
  {
    name: 'assemble', description: 'concatenate segments and mux the mix', kind: 'job', heavy: true, cancellable: true,
    argsSchema: obj({ ...proj }, ['project']), outputs: ['final.mp4'],
  },
  {
    name: 'qa', description: 'run short_qa and the look check', kind: 'job', heavy: true, cancellable: true,
    argsSchema: obj({ ...proj }, ['project']), outputs: ['qa/summary.md'],
  },
  {
    name: 'animatic', description: 'render the preview animatic and run QA', kind: 'job', heavy: true, cancellable: true,
    argsSchema: obj({ ...proj }, ['project']), outputs: ['animatic.mp4', 'animatic-qa.md'],
  },
  {
    name: 'final', description: 'partial final render -> assemble -> QA -> lookcheck', kind: 'stage', heavy: true, cancellable: true,
    argsSchema: obj({ ...proj, workers: num }, ['project']), outputs: ['final.mp4', 'final-qa.md', 'render/final/manifest.json'],
  },
  {
    name: 'lookdev', description: 'render the look-dev sheet', kind: 'job', heavy: true, cancellable: true,
    argsSchema: obj({ ...proj, out: str }, ['project']), outputs: ['docs/reports/phase-3f/lookdev-*.jpg'],
  },
  {
    name: 'lookcheck', description: 'measure the world look per scene', kind: 'job', heavy: true, cancellable: true,
    argsSchema: obj({ ...proj, video: str }, ['project']), outputs: ['look-qa.md'],
  },
  {
    name: 'review', description: 'write a side-by-side review sheet', kind: 'job', heavy: false, cancellable: true,
    argsSchema: obj({ ...proj, compare: str, shots: str, out: str, coverage: bool, split: bool }, ['project']), outputs: ['review.jpg'],
  },
  {
    name: 'stills', description: 'render selected frames as stills', kind: 'job', heavy: true, cancellable: true,
    argsSchema: obj({ ...proj, frames: str, shots: str, quality: str, look: { type: 'object' } }, ['project']), outputs: ['stills/'],
  },
  {
    name: 'voice-audition', description: 'audition provider voices', kind: 'job', heavy: true, cancellable: true,
    argsSchema: obj({ ...proj, voices: num, models: str, round: num }, ['project']), outputs: ['voice/auditions/auditions.md'],
  },
  {
    name: 'voice-pace', description: 'rebuild or choose a voice pace', kind: 'job', heavy: false, cancellable: true,
    argsSchema: obj({ ...proj, paces: str, choose: str }, ['project']), outputs: ['voice/pace/pace.md'],
  },
  {
    name: 'voice-budget', description: 'read the voice credit meter', kind: 'job', heavy: false, cancellable: false,
    argsSchema: obj({}), outputs: [],
  },
  {
    name: 'clean', description: 'remove regenerable files', kind: 'job', heavy: false, cancellable: false,
    argsSchema: obj({ ...proj, dryRun: bool }), outputs: [],
  },
  {
    name: 'usage', description: 'aggregate provider usage and balances', kind: 'job', heavy: false, cancellable: false,
    argsSchema: obj({ since: str, json: bool }), outputs: [],
  },
  {
    name: 'models-check', description: 'check a provider model and JSON mode', kind: 'job', heavy: false, cancellable: true,
    argsSchema: obj({ provider: str, model: str, baseUrl: str, keyEnv: str }, ['provider']), outputs: [],
  },
  {
    name: 'models-catalog', description: 'refresh the OpenRouter model catalog', kind: 'job', heavy: false, cancellable: true,
    argsSchema: obj({ provider: str }, ['provider']), outputs: ['models.catalog.json'],
  },
  {
    name: 'doctor', description: 'check the local toolchain', kind: 'job', heavy: false, cancellable: false,
    argsSchema: obj({}), outputs: [],
  },
  // Test-only fake heavy job: lets the integration tests exercise the queue/cancel path with no Chromium or network.
  {
    name: 'mock-sleep', description: 'test-only heavy sleep', kind: 'job', heavy: true, cancellable: true,
    argsSchema: obj({ ms: num }, ['ms']), outputs: [], testOnly: true,
  },
];

export const opByName = (name) => OPS.find((o) => o.name === name) ?? null;

export function opArgv(name, args = {}) {
  const op = opByName(name);
  if (!op) throw new Error(`unknown op "${name}"`);
  const p = args.project;
  const addProject = (rest) => (p ? ['--project', p, ...rest] : rest);
  switch (name) {
    case 'run': return ['run', ...addProject([...(args.to ? ['--to', args.to] : []), ...(args.only ? ['--only', args.only] : []), ...(args.force ? ['--force'] : []), ...(args.autopilot ? ['--autopilot'] : []), ...(args.noCache ? ['--no-cache'] : []), ...(args.fit ? ['--fit', args.fit] : []), ...(args.cachedOnly ? ['--cached-only'] : [])])];
    case 'approve': return ['approve', ...addProject(['--stage', args.stage, ...(args.override ? ['--override', args.override] : [])])];
    case 'script-lines': return ['script-lines', ...addProject(['--lines', (args.lines ?? []).join(','), ...(args.notes ? ['--notes', args.notes] : []), ...(args.force ? ['--force'] : []), ...(args.noCache ? ['--no-cache'] : [])])];
    case 'cast': return ['cast', ...addProject([...(args.notes ? ['--notes', args.notes] : [])])];
    case 'shotplan': return ['shotplan', ...addProject([...(args.notes ? ['--notes', args.notes] : [])])];
    case 'board': return ['board', ...addProject([...(args.shot ? ['--shot', args.shot] : []), ...(args.notes ? ['--notes', args.notes] : [])])];
    case 'render': return ['render', ...addProject(['--quality', args.quality ?? 'preview', '--workers', String(args.workers ?? 2), ...(args.shots ? ['--shots', args.shots] : [])])];
    case 'audio': return ['audio', ...addProject([])];
    case 'assemble': return ['assemble', ...addProject([])];
    case 'qa': return ['qa', ...addProject([])];
    case 'animatic': return ['run', ...addProject(['--to', 'animatic', '--only', 'animatic', '--force'])];
    case 'final': return ['run', ...addProject(['--to', 'final', '--only', 'final', '--force'])];
    case 'lookdev': return ['lookdev', ...addProject([...(args.out ? ['--out', args.out] : [])])];
    case 'lookcheck': return ['lookcheck', ...addProject([...(args.video ? ['--video', args.video] : [])])];
    case 'review': return ['review', ...addProject([...(args.compare ? ['--compare', args.compare] : []), ...(args.shots ? ['--shots', args.shots] : []), ...(args.out ? ['--out', args.out] : []), ...(args.coverage ? ['--coverage'] : []), ...(args.split ? ['--split'] : [])])];
    case 'stills': return ['stills', ...addProject([...(args.frames ? ['--frames', args.frames] : []), ...(args.shots ? ['--shots', args.shots] : []), ...(args.quality ? ['--quality', args.quality] : []), ...(args.look ? ['--look', typeof args.look === 'string' ? args.look : JSON.stringify(args.look)] : [])])];
    case 'voice-audition': return ['voice', 'audition', ...addProject([...(args.voices != null ? ['--voices', String(args.voices)] : []), ...(args.models ? ['--models', args.models] : []), ...(args.round != null ? ['--round', String(args.round)] : [])])];
    case 'voice-pace': return ['voice', 'pace', ...addProject([...(args.paces ? ['--paces', args.paces] : []), ...(args.choose != null ? ['--choose', String(args.choose)] : [])])];
    case 'voice-budget': return ['voice', 'budget'];
    case 'clean': return ['clean', ...(p ? ['--project', p] : []), ...(args.dryRun ? ['--dry-run'] : [])];
    case 'usage': return ['usage', ...(args.since ? ['--since', args.since] : []), ...(args.json ? ['--json'] : [])];
    case 'models-check': return ['models', 'check', '--provider', args.provider, ...(args.model ? ['--model', args.model] : []), ...(args.baseUrl ? ['--base-url', args.baseUrl] : []), ...(args.keyEnv ? ['--key-env', args.keyEnv] : [])];
    case 'models-catalog': return ['models', 'catalog', '--provider', args.provider];
    case 'doctor': return ['doctor'];
    case 'mock-sleep': return ['mock-sleep', '--ms', String(args.ms ?? 1000)];
    default: throw new Error(`op "${name}" has no argv mapping`);
  }
}

export function listOps() {
  return OPS.map(({ argv, ...o }) => o);
}
