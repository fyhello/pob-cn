import { assertManifestCompleteFromRepo } from '../pipeline/lib/manifest-validator.mjs';

export async function requireCompleteManifest(repoRoot) {
  return assertManifestCompleteFromRepo(repoRoot);
}
