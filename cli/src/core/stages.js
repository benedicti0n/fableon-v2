// Stage dependency graph for Phase 3A. The GUI/server can reuse this registry.
import { BRIEF, RESEARCH, SCRIPT, SCRIPT_HI, FACTCHECK, CAST, SHOTPLAN } from '../stages/prompts.js';

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
    name: 'cast', version: 1, deps: ['script'], prompt: CAST,
    inputs: ['script.json', 'research/facts.json', 'cast.notes.json'], extraInputs: ['schema/catalog.json'], projectKeys: ['language'],
    outputs: ['cast.json', 'assets.todo.json', 'cast/cast-sheet.jpg'],
  },
  {
    name: 'voice', version: 1, deps: ['factcheck'], prompt: '',
    inputs: ['SCRIPT.md', 'script.json', 'pronunciations.json', 'research/facts.json'], projectKeys: ['seconds', 'voice'],
    outputs: ['voice.wav', 'words.json'],
  },
  {
    name: 'shotplan', version: 1, deps: ['voice', 'cast'], prompt: SHOTPLAN,
    inputs: ['script.json', 'words.json', 'cast.json', 'assets.todo.json', 'shotplan.notes.json'],
    extraInputs: ['schema/catalog.json', 'schema/shotplan.schema.json', 'docs/DIRECTOR_GUIDE.md', 'prompts/director-craft.md'],
    projectKeys: ['language', 'seconds'],
    outputs: ['shotplan.json', 'shotplan.md'],
  },
  {
    name: 'board', version: 1, deps: ['shotplan'], prompt: '',
    inputs: ['shotplan.json', 'script.json', 'words.json', 'cast.json', 'assets.todo.json'],
    extraInputs: ['schema/catalog.json', 'schema/authoring.schema.json', 'docs/DIRECTOR_GUIDE.md', 'prompts/director-craft.md'],
    projectKeys: ['language', 'seconds'],
    outputs: ['board.json', 'board.review.json', 'storyboard.json'],
  },
  {
    name: 'animatic', version: 1, deps: ['board', 'voice'], prompt: '',
    inputs: ['storyboard.json', 'words.json', 'voice.wav', 'board.json'],
    projectKeys: ['seconds', 'voice'],
    outputs: ['animatic-qa.md'],
  },
];

export const stageByName = (name) => STAGES.find((s) => s.name === name);
export const stageOrder = (name) => STAGES.findIndex((s) => s.name === name);
