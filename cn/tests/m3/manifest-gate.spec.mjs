import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const sourceRoot = new URL('../../..', import.meta.url);
const entries = [
  ['bridge startup', '../../bridge/start.mjs', 'startBridge'],
  ['web build/typecheck', '../../web/build.mjs', 'buildWeb'],
  ['build import', '../../commands/import.mjs', 'importBuild'],
  ['build export round-trip', '../../commands/export-roundtrip.mjs', 'exportBuildRoundTrip'],
  ['publish/package', '../../commands/package.mjs', 'packageRelease'],
];

const excludedFixtureCopyDirectories = new Set(['node_modules', '.git', '.worktrees']);

function shouldCopyFixturePath(path) {
  return !path.split(/[\\/]+/).some(segment => excludedFixtureCopyDirectories.has(segment));
}

async function fixture(completeness) {
  let root;
  try {
    root = await mkdtemp(join(tmpdir(), 'pob-cn-m3-gate-'));
    await cp(sourceRoot, root, { recursive: true, filter: shouldCopyFixturePath });
    const manifestPath = join(root, 'cn', 'generated', 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.completeness = completeness;
    if (completeness !== 'complete') {
      manifest.outputs = manifest.outputs.filter(output => output.id !== 'web.crafting');
      delete manifest.crafting;
    }
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return root;
  } catch (error) {
    if (root) {
      await rm(root, { recursive: true, force: true });
    }
    throw error;
  }
}

test('M3 fixture copy excludes repository metadata, dependencies, and worktrees', () => {
  assert.equal(shouldCopyFixturePath('C:\\repo\\.worktrees\\child\\cn\\generated\\manifest.json'), false);
  assert.equal(shouldCopyFixturePath('/repo/.worktrees/child/cn/generated/manifest.json'), false);
  assert.equal(shouldCopyFixturePath('/repo/.git/config'), false);
  assert.equal(shouldCopyFixturePath('/repo/node_modules/package/index.mjs'), false);
  assert.equal(shouldCopyFixturePath('/repo/cn/generated/manifest.json'), true);
});

test('all M3 entrypoints reject a partial manifest and allow a complete manifest', async () => {
  let partialRoot;
  let completeRoot;
  try {
    partialRoot = await fixture('partial_crafting_seed_pending');
    completeRoot = await fixture('complete');
    for (const [label, modulePath, exportName] of entries) {
      const partialModule = await import(`${pathToFileURL(join(partialRoot, 'cn', modulePath.slice(6))).href}?fixture=partial`);
      await assert.rejects(partialModule[exportName](partialRoot), new RegExp(`cn/generated/manifest\\.json.*partial_crafting_seed_pending.*crafting seed pending`, 'i'), label);
      const completeModule = await import(`${pathToFileURL(join(completeRoot, 'cn', modulePath.slice(6))).href}?fixture=complete`);
      await assert.doesNotReject(completeModule[exportName](completeRoot), label);
    }
  } finally {
    await Promise.all([
      partialRoot && rm(partialRoot, { recursive: true, force: true }),
      completeRoot && rm(completeRoot, { recursive: true, force: true }),
    ]);
  }
});

test('all M3 entrypoints share the single manifest validator gate', async () => {
  const gate = await readFile(new URL('../../m3/manifest-entry-gate.mjs', import.meta.url), 'utf8');
  assert.match(gate, /assertManifestCompleteFromRepo/);
  for (const [label, modulePath] of entries) {
    const entry = await readFile(new URL(modulePath, import.meta.url), 'utf8');
    assert.match(entry, /requireCompleteManifest/, label);
    assert.doesNotMatch(entry, /completeness\s*!==|partial_crafting_seed_pending/, label);
  }
});
