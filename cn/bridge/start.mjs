import { requireCompleteManifest } from '../m3/manifest-entry-gate.mjs';
import { PoBCoreEngine } from './engine.mjs';

export async function startBridge(repoRoot, options) {
  await requireCompleteManifest(repoRoot);
  if (!options) return;
  const engine = new PoBCoreEngine(options);
  try { await engine.start(); }
  catch (error) {
    try { await engine.close(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], 'PoB 核心启动失败，且清理进程失败。'); }
    throw error;
  }
  return engine;
}
