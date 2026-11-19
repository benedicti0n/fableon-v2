// Final picture: per-shot cached segments, transition composites, assembly, QA and lookcheck.
import { renderFinal } from '../final.js';

export async function runFinal({ projectDir, progress = null }) {
  return renderFinal(projectDir, { progress });
}
