import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, unlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { diffBusinessSnapshots, formatBusinessSnapshotDiff, snapshotBusinessTree } from '../../pipeline/lib/repository-snapshot.mjs';
import { assertGeneratedOnlyBusinessChanges } from '../../pipeline/lib/ownership.mjs';

const ownership = { local_excludes: ['.git/**', 'node_modules/**', '**/*.tmp'] };
const contract = { outputs: [{ id: 'web.translation', path: 'cn/generated/web-data/translations.json', stage: 'M8' }] };
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' });

async function initializeGit(root) {
  git(root, 'init');
  await writeFile(join(root, '.gitignore'), 'ignored.txt\n');
}

test('snapshots the complete unignored business tree with true tracked and untracked files', async t => {
  const root = await mkdtemp(join(tmpdir(), 'pob-cn-snapshot-')); t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'src'), { recursive: true }); await mkdir(join(root, 'node_modules'), { recursive: true });
  await initializeGit(root); await writeFile(join(root, 'src/tracked.lua'), 'old'); await writeFile(join(root, 'untracked.txt'), 'new'); await writeFile(join(root, 'ignored.txt'), 'ignore'); await writeFile(join(root, 'node_modules/local.js'), 'local'); await writeFile(join(root, 'temp.tmp'), 'tmp');
  git(root, 'add', '.gitignore', 'src/tracked.lua');
  const snapshot = await snapshotBusinessTree(root, ownership);
  assert.deepEqual(snapshot.files.map(file => file.path).sort(), ['.gitignore', 'src/tracked.lua', 'untracked.txt']);
  assert.deepEqual(Object.fromEntries(snapshot.files.map(file => [file.path, file.state])), { '.gitignore': 'tracked', 'src/tracked.lua': 'tracked', 'untracked.txt': 'untracked' });
});

test('diff classifies real Git tracked additions, modifications, deletions and untracked files', async t => {
  const root = await mkdtemp(join(tmpdir(), 'pob-cn-snapshot-')); t.after(() => rm(root, { recursive: true, force: true }));
  await initializeGit(root); await writeFile(join(root, 'changed.txt'), 'old'); await writeFile(join(root, 'deleted.txt'), 'gone'); git(root, 'add', '.gitignore', 'changed.txt', 'deleted.txt');
  const before = await snapshotBusinessTree(root, ownership);
  await writeFile(join(root, 'changed.txt'), 'new'); await unlink(join(root, 'deleted.txt')); await writeFile(join(root, 'added.txt'), 'add'); await writeFile(join(root, 'untracked.txt'), 'new'); git(root, 'add', 'added.txt');
  const after = await snapshotBusinessTree(root, ownership);
  const diff = diffBusinessSnapshots(before, after);
  assert.deepEqual(diff.modified.map(change => change.path), ['changed.txt']); assert.deepEqual(diff.deleted.map(change => change.path), ['deleted.txt']); assert.deepEqual(diff.added.map(change => change.path), ['added.txt']); assert.deepEqual(diff.untracked.map(change => change.path), ['untracked.txt']); assert.match(formatBusinessSnapshotDiff(diff), /changed.txt.*modified/s);
});

test('generated-only assertion rejects every non-contract business diff type', () => {
  const owned = { generated_rules: [{ output: 'cn/generated/web-data/**', producer: 'node cn/pipeline/generate-content.mjs' }] };
  for (const type of ['added', 'modified', 'deleted', 'untracked']) {
    const diff = { added: [], modified: [], deleted: [], untracked: [] }; diff[type].push({ path: 'src/business.lua' });
    assert.throws(() => assertGeneratedOnlyBusinessChanges(diff, owned, contract, { stage: 'M8' }), /business|generated|contract/);
  }
});
