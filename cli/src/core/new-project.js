// Create a new pipeline project from a topic.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { validate, writeJsonArtifact } from './artifacts.js';

export function newProject(dirArg, { topic, seconds = 90, voice = 'am_michael', language = 'en' }) {
  if (!topic || !String(topic).trim()) throw new Error('new needs --topic "..."');
  const dir = resolve(dirArg);
  if (existsSync(dir) && readdirSync(dir).length) throw new Error(`${dir} already exists and is not empty`);
  mkdirSync(dir, { recursive: true });
  const id = basename(dir).replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() || 'project';
  const title = String(topic).split(/[:.]/)[0].slice(0, 80).trim() || id;
  const project = {
    version: 1, id, title, topic: String(topic), seconds: Number(seconds), language,
    voice: language === 'hi'
      ? {
        provider: 'elevenlabs', model: 'eleven_multilingual_v2', voiceId: null, language: 'hi',
        settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 },
        tones: {
          deadpan: { stability: 0.85, style: 0, speed: 1 },
          'mock-serious': { stability: 0.6, style: 0.15, speed: 1 },
          'matter-of-fact': { stability: 0.7, style: 0.05, speed: 1 },
          warm: { stability: 0.45, style: 0.1, speed: 1 },
          excited: { stability: 0.3, style: 0.35, speed: 1.05 },
          tense: { stability: 0.5, style: 0.2, speed: 1 },
          awe: { stability: 0.55, style: 0.15, speed: 0.95 },
          whisper: { stability: 0.7, style: 0.05, speed: 0.95 },
        },
        maxCharsPerRun: 10000,
      }
      : { engine: 'kokoro', voice, speed: 1.35, language: 'en' },
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
