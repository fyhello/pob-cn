import { requireCompleteManifest } from '../m3/manifest-entry-gate.mjs';

export async function packageRelease(repoRoot, { dryRun = true } = {}) {
  const manifest = await requireCompleteManifest(repoRoot);
  return { dryRun, manifest: manifest.completeness, outputCount: manifest.outputs.length };
}
