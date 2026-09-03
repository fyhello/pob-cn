import { requireCompleteManifest } from '../m3/manifest-entry-gate.mjs';
import { PoBCoreEngine } from './engine.mjs';

export async function startBridge(repoRoot, options) {
  await requireCompleteManifest(repoRoot);
  if (!options) return;
  const engine = new PoBCoreEngine(options);
  await engine.start();
  return engine;
}
