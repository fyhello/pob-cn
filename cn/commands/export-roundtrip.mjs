import { requireCompleteManifest } from '../m3/manifest-entry-gate.mjs';
import { exportBuildEnvelope, parseExportedBuild } from '../bridge/build-codec.mjs';

export async function exportBuildRoundTrip(repoRoot, build) {
  await requireCompleteManifest(repoRoot);
  return build === undefined ? undefined : parseExportedBuild(exportBuildEnvelope(build));
}
