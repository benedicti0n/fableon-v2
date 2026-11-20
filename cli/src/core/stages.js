// Stage dependency graph for Phase 3A. The GUI/server can reuse this registry.
import { BRIEF, RESEARCH, SCRIPT, SCRIPT_HI, FACTCHECK, PERFORMANCE, CAST, SHOTPLAN, SOUND, PUBLISH } from '../stages/prompts.js';

export const STAGES = [
  {
    name: 'brief', version: 1, deps: [], prompt: BRIEF,
    inputs: [], projectKeys: ['title', 'topic', 'seconds', 'language', 'voice'],
    outputs: ['brief.md'],
  },
  {
    name: 'research', version: 1, deps: ['brief'], prompt: RESEARCH,
    inputs: ['brief.md', 'research/sources/*'], projectKeys: ['topic', 'research'],
    outputs: ['research/sources.json', 'research/facts.json'],
  },
  {
    name: 'script', version: 1, deps: ['research'], prompt: SCRIPT + '\n' + SCRIPT_HI,
    inputs: ['brief.md', 'research/facts.json'], extraInputs: ['schema/catalog.json'], projectKeys: ['seconds', 'language'],
    outputs: ['script.json', 'SCRIPT.md'],
  },
  {
    name: 'factcheck', version: 1, deps: ['script'], prompt: FACTCHECK,
    inputs: ['script.json', 'research/facts.json'], projectKeys: ['seconds'],
    outputs: ['script.review.json'],
  },
  {
    name: 'performance', version: 1, deps: ['factcheck'], prompt: PERFORMANCE,
    inputs: ['script.json', 'script.review.json'], projectKeys: ['seconds', 'language'],
    outputs: ['performance.json', 'performance.md'],
  },
  {
    name: 'cast', version: 1, deps: ['script'], prompt: CAST,
    inputs: ['script.json', 'research/facts.json', 'cast.notes.json'], extraInputs: ['schema/catalog.json'], projectKeys: ['language', 'style'],
    outputs: ['cast.json', 'assets.todo.json', 'cast/cast-sheet.jpg'],
  },
  {
    name: 'voice', version: 1, deps: ['factcheck', 'performance'], prompt: '',
    inputs: ['SCRIPT.md', 'script.json', 'pronunciations.json', 'research/facts.json'], projectKeys: ['seconds', 'voice'],
    outputs: ['voice.wav', 'words.json'],
  },
  {
    name: 'shotplan', version: 1, deps: ['voice', 'cast'], prompt: SHOTPLAN,
    inputs: ['script.json', 'words.json', 'cast.json', 'assets.todo.json', 'shotplan.notes.json'],
    extraInputs: ['schema/catalog.json', 'schema/shotplan.schema.json', 'docs/DIRECTOR_GUIDE.md', 'prompts/director-craft.md'],
    projectKeys: ['language', 'seconds', 'style'],
    outputs: ['shotplan.json', 'shotplan.md'],
  },
  {
    name: 'board', version: 1, deps: ['shotplan'], prompt: '',
    inputs: ['shotplan.json', 'script.json', 'words.json', 'cast.json', 'assets.todo.json'],
    extraInputs: ['schema/catalog.json', 'schema/authoring.schema.json', 'docs/DIRECTOR_GUIDE.md', 'prompts/director-craft.md'],
    projectKeys: ['language', 'seconds', 'style'],
    outputs: ['board.json', 'board.review.json', 'storyboard.json'],
  },
  {
    name: 'sound', version: 1, deps: ['board', 'voice'], prompt: SOUND,
    inputs: ['script.json', 'shotplan.json', 'board.json', 'words.json', 'voice.wav'],
    extraInputs: ['schema/cues.schema.json'],
    projectKeys: ['seconds', 'voice'],
    outputs: ['cues.json', 'cues.md', 'audio/mix.wav', 'audio/stem_music.wav', 'audio/stem_sfx.wav', 'audio/stem_voice.wav'],
  },
  {
    name: 'animatic', version: 1, deps: ['sound', 'board', 'voice'], prompt: '',
    inputs: ['storyboard.json', 'words.json', 'voice.wav', 'audio/mix.wav', 'board.json'],
    projectKeys: ['seconds', 'voice', 'style'],
    outputs: ['animatic-qa.md'],
  },
  {
    name: 'final', version: 1, deps: ['animatic', 'sound'], prompt: '',
    inputs: ['board.json', 'storyboard.json', 'shots.json', 'look.json', 'cues.json', 'audio/mix.wav', 'voice.wav', 'words.json'],
    projectKeys: ['seconds', 'language', 'style'],
    outputs: ['final.mp4', 'final-qa.md', 'render/final/manifest.json'],
  },
  {
    name: 'publish', version: 1, deps: ['final'], prompt: PUBLISH,
    inputs: ['final.mp4', 'script.json', 'research/facts.json'],
    projectKeys: ['seconds', 'language', 'voice'],
    outputs: ['publish/publish.json', 'publish/cover.jpg', 'publish/subtitles.hi.srt'],
  },
];

export const stageByName = (name) => STAGES.find((s) => s.name === name);
export const stageOrder = (name) => STAGES.findIndex((s) => s.name === name);
