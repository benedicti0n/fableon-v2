// Publishing package stage: validated metadata, fact flags, cover candidates, sidecar SRT and copy-ready sheet.
import { runPublish } from '../publish.js';

export async function runPublishStage({ projectDir, project, router, progress = null }) {
  return runPublish({ projectDir, project, router, progress });
}
