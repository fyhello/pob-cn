import { requireCompleteManifest } from '../m3/manifest-entry-gate.mjs';
import { importBuildEnvelope } from '../bridge/build-codec.mjs';

export async function importBuild(repoRoot, payload) {
  await requireCompleteManifest(repoRoot);
  return payload === undefined ? undefined : importBuildEnvelope(payload);
}
