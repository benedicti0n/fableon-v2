// Create a new pipeline project from a topic.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { validate, writeJsonArtifact } from './artifacts.js';

export function newProject(dirArg, { topic, seconds = 90, voice = 'am_michael' }) {
  if (!topic || !String(topic).trim()) throw new Error('new needs --topic "..."');
  const dir = resolve(dirArg);
  if (existsSync(dir) && readdirSync(dir).length) throw new Error(`${dir} already exists and is not empty`);
  mkdirSync(dir, { recursive: true });
  const id = basename(dir).replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() || 'project';
  const title = String(topic).split(/[:.]/)[0].slice(0, 80).trim() || id;
  const project = {
    version: 1, id, title, topic: String(topic), seconds: Number(seconds), language: 'en',
    voice: { engine: 'kokoro', voice, speed: 1.35 },
    research: { web: false, maxSources: 8 },
    models: { default: { provider: 'deepseek', model: null } },
    autopilot: false,
  };
  validate('project', project);
  writeJsonArtifact(dir, 'init', 'project.json', project, 'project');
  const brief = `# Brief — ${title}\n\n<!-- fableon:brief-template -->\nTopic: ${project.topic}\nTarget length: ${project.seconds} seconds\nAudience: curious adults scrolling a vertical feed\nTone: deadpan, witty, like the reference film\n\n## Angle / hooks\n- (the brief stage will fill this in)\n\n## Must include\n- (the brief stage will fill this in)\n\n## Avoid\n- generic listicle narration, on-screen text, claims without a source\n`;
  writeFileSync(join(dir, 'brief.md'), brief);
  mkdirSync(join(dir, 'research', 'sources'), { recursive: true });
  writeFileSync(join(dir, 'pronunciations.json'), '{}\n');
  for (const d of ['.fableon/cache', '.fableon/history', 'logs']) mkdirSync(join(dir, d), { recursive: true });
  return { dir, project };
}
