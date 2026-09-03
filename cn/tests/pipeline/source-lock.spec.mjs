import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import test from 'node:test';
import {
  assertLockedInputPath,
  importNinjaPoe2Dictionary,
  loadLockedInputs,
  validateSourceLock,
} from '../../pipeline/lib/source-lock.mjs';

const dictionaryId = 'dictionary.ninja-poe2.poe2-runtime-gzip';
const inputIds = [dictionaryId, 'override.zh-CN.terms', 'override.zh-CN.glossary'];
const sha256 = value => createHash('sha256').update(value).digest('hex');
const controlledArtifact = fileURLToPath(new URL('../../pipeline/sources/dictionary/ninja-poe2/poe2.json.gz', import.meta.url));
const controlledRepoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const schema = { path: 'tools/upstream-builder/poe2dict/vendor/schema.min.json', sha256: '0d0844dd3a049cb806cb9be6299e6427c86a8c48f355f3fe878100fe254d8688', schema_version: 7 };
const buildEvidence = { generated_at: '2026-08-23T23:39:16.649746+08:00', tool_sha256: { 'tools/upstream-builder/update.py': 'd916bfaf7ff906ed6235d766bb6ed3f99e151f7bd8bfaf9ce634dd89c91f3653', 'tools/upstream-builder/build.py': 'bef358cae73bad0d569fb0cb930a8dab9415ce1fca76500c155f8b930b877e7e', 'tools/build-all.mjs': 'c4501bcaadcd4e73d87c29e8398879ccf95285c40f26c0b8718f10f7cf0c38d9' } };
const sourceMtimeLocal = '2026-08-24 19:27:47';

async function writeJson(path, value) {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function evidenceFor(gzip, overrides = {}) {
  const payload = gunzipSync(gzip); const json = JSON.parse(payload.toString('utf8'));
  return {
    artifact: { sha256: sha256(gzip), size_bytes: gzip.length, source_mtime_local: overrides.source_mtime_local ?? sourceMtimeLocal },
    payload: { uncompressed_sha256: sha256(payload), uncompressed_size_bytes: payload.length, top_level_domain_counts: Object.fromEntries(['items', 'stats', 'tooltip', 'ui', 'terms'].map(key => [key, Object.keys(json[key] ?? {}).length])) },
    schema: overrides.schema ?? schema,
    build_evidence: overrides.build_evidence ?? buildEvidence,
  };
}

function fixtureReport(evidence) { return `fixture compatibility report ${evidence.artifact.sha256}\n`; }

async function makeRepo() {
  const root = await mkdtemp(join(tmpdir(), 'pob-cn-source-lock-'));
  const dictionary = await readFile(controlledArtifact); const evidence = evidenceFor(dictionary);
  const dictionaryPath = join(root, 'cn/pipeline/sources/dictionary/ninja-poe2/poe2.json.gz');
  await mkdir(join(root, 'cn/pipeline/sources/dictionary/ninja-poe2'), { recursive: true });
  await writeFile(dictionaryPath, dictionary);
  await writeJson(join(root, 'cn/pipeline/overrides/zh-CN/terms.json'), { reviewed: false, entries: {} });
  await writeJson(join(root, 'cn/pipeline/overrides/zh-CN/glossary.json'), { reviewed: false, entries: {} });
  const termsHash = sha256(await readFile(join(root, 'cn/pipeline/overrides/zh-CN/terms.json')));
  const glossaryHash = sha256(await readFile(join(root, 'cn/pipeline/overrides/zh-CN/glossary.json')));
  const snapshot = { schema_version: 1, upstream_commit: 'a'.repeat(40), source_tree_sha256: 'b'.repeat(64), file_count: 1, files: [{ path: 'README.md', upstream_blob_oid: 'c'.repeat(40), upstream_content_sha256: 'd'.repeat(64) }] };
  await writeJson(join(root, 'cn/config/upstream-content-snapshot.json'), snapshot);
  const reportPath = `docs/architecture/compatibility/dictionary/${evidence.artifact.sha256}.md`;
  const report = Buffer.from(fixtureReport(evidence)); await mkdir(join(root, 'docs/architecture/compatibility/dictionary'), { recursive: true }); await writeFile(join(root, reportPath), report);
  const compatibility_report = { path: reportPath, sha256: sha256(report) };
  await writeJson(join(root, 'cn/config/version-lock.json'), { upstream: { commit: snapshot.upstream_commit }, content_versions: { dictionary: { source_id: dictionaryId, artifact: { in_repository: true, ...evidence.artifact }, payload: { format: 'gzip-json', ...evidence.payload }, schema: { status: 'VENDORED_SCHEMA_IDENTIFIED', ...evidence.schema }, build_evidence: evidence.build_evidence, compatibility_report } } });
  const lock = {
    schema_version: 1,
    inputs: inputIds.map((id, index) => ({
      id, kind: index === 0 ? 'dictionary' : 'override', stage: 'M2-2',
      path: index === 0 ? 'cn/pipeline/sources/dictionary/ninja-poe2/poe2.json.gz' : `cn/pipeline/overrides/zh-CN/${index === 1 ? 'terms' : 'glossary'}.json`,
      sha256: index === 0 ? sha256(dictionary) : index === 1 ? termsHash : glossaryHash,
      format: index === 0 ? 'gzip-json' : 'json', language: 'zh-CN', provenance: { reviewed: false },
      ...(index === 0 ? { artifact: evidence.artifact, payload: evidence.payload, schema: evidence.schema, build_evidence: evidence.build_evidence, compatibility_report, upstream_snapshot: { path: 'cn/config/upstream-content-snapshot.json', sha256: '', upstream_commit: snapshot.upstream_commit, source_tree_sha256: snapshot.source_tree_sha256, file_count: snapshot.file_count } } : {}),
    })),
  };
  lock.inputs[0].upstream_snapshot.sha256 = sha256(await readFile(join(root, 'cn/config/upstream-content-snapshot.json')));
  await writeJson(join(root, 'cn/config/content-source-lock.json'), lock);
  return { root, lock, dictionary, evidence };
}

test('rejects an input path that escapes the repository root', async t => {
  const { root, lock } = await makeRepo(); t.after(() => rm(root, { recursive: true, force: true }));
  lock.inputs[0].path = '../legacy/poe2.json.gz';
  await assert.rejects(validateSourceLock(lock, root), /repository-relative/);
});

test('rejects absolute, drive, generated, bare JSON, symlink-like and duplicate source paths', async t => {
  const { root, lock } = await makeRepo(); t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of ['/tmp/poe2.json.gz', 'C:/data/poe2.json.gz', 'cn/generated/a.json', 'cn/pipeline/sources/poe2.json', 'cn/pipeline/sources/poe1.json', 'cn\\..\\legacy\\poe2.json.gz']) {
    const invalid = structuredClone(lock); invalid.inputs[0].path = path;
    await assert.rejects(validateSourceLock(invalid, root), /repository-relative|generated|bare JSON|backslash/);
  }
  const duplicate = structuredClone(lock); duplicate.inputs[1].path = duplicate.inputs[2].path;
  await assert.rejects(validateSourceLock(duplicate, root), /duplicate/);
});

test('rejects a source symlink whose resolved target leaves the repository', async t => {
  const { root, lock } = await makeRepo(); t.after(() => rm(root, { recursive: true, force: true }));
  const dictionaryPath = join(root, lock.inputs[0].path);
  await rm(dictionaryPath);
  try { await symlink(controlledArtifact, dictionaryPath); } catch (error) {
    if (error.code === 'EPERM') { t.skip('Windows symlink creation is disabled for this account'); return; }
    throw error;
  }
  await assert.rejects(validateSourceLock(lock, root), /symlink|escapes/);
});

test('rejects every independently drifting dictionary field between source and version locks', async t => {
  const { root, lock } = await makeRepo(); t.after(() => rm(root, { recursive: true, force: true }));
  const versionPath = join(root, 'cn/config/version-lock.json'); const version = JSON.parse(await readFile(versionPath, 'utf8'));
  const mutate = [
    [v => { v.content_versions.dictionary.artifact.sha256 = '0'.repeat(64); }, /dictionary fields/],
    [v => { v.content_versions.dictionary.artifact.size_bytes++; }, /dictionary fields/],
    [v => { v.content_versions.dictionary.payload.uncompressed_sha256 = '0'.repeat(64); }, /dictionary fields/],
    [v => { v.content_versions.dictionary.payload.uncompressed_size_bytes++; }, /dictionary fields/],
    ...['items', 'stats', 'tooltip', 'ui', 'terms'].map(domain => [v => { v.content_versions.dictionary.payload.top_level_domain_counts[domain]++; }, /dictionary fields/]),
    [v => { v.content_versions.dictionary.schema.path = 'other/schema.json'; }, /dictionary fields/],
    [v => { v.content_versions.dictionary.schema.sha256 = '0'.repeat(64); }, /dictionary fields/],
    [v => { v.content_versions.dictionary.schema.schema_version++; }, /dictionary fields/],
    [v => { v.content_versions.dictionary.artifact.source_mtime_local = 'future'; }, /dictionary fields/],
    [v => { v.content_versions.dictionary.build_evidence.generated_at = 'future'; }, /dictionary fields/],
    ...Object.keys(buildEvidence.tool_sha256).map(tool => [v => { v.content_versions.dictionary.build_evidence.tool_sha256[tool] = '0'.repeat(64); }, /dictionary fields/]),
  ];
  for (const [change, message] of mutate) { const changed = structuredClone(version); change(changed); await writeJson(versionPath, changed); await assert.rejects(validateSourceLock(lock, root), message); }
});

test('loadLockedInputs rejects missing or altered locked compatibility reports', async t => {
  const { root, lock } = await makeRepo(); t.after(() => rm(root, { recursive: true, force: true }));
  const report = join(root, lock.inputs[0].compatibility_report.path);
  await rm(report); await assert.rejects(loadLockedInputs(root, { stage: 'M2-2' }), /compatibility report/);
  await writeFile(report, 'altered'); await assert.rejects(loadLockedInputs(root, { stage: 'M2-2' }), /compatibility report/);
});

test('rejects mismatched hash, missing complete snapshot and M2-2 entries beyond its three fixed IDs', async t => {
  const { root, lock } = await makeRepo(); t.after(() => rm(root, { recursive: true, force: true }));
  const mismatch = structuredClone(lock); mismatch.inputs[0].sha256 = '0'.repeat(64);
  await assert.rejects(validateSourceLock(mismatch, root), /hash/);
  const noSnapshot = structuredClone(lock); delete noSnapshot.inputs[0].upstream_snapshot;
  await assert.rejects(validateSourceLock(noSnapshot, root), /upstream snapshot/);
  const unexpected = structuredClone(lock); unexpected.inputs.push({ ...structuredClone(lock.inputs[1]), id: 'crafting.not-allowed', path: 'cn/pipeline/overrides/zh-CN/other.json' });
  await assert.rejects(validateSourceLock(unexpected, root), /M2-2.*three fixed input ids/);
});

test('M2-2 selection never returns a separately registered M2-3 input', async t => {
  const { root, lock } = await makeRepo(); t.after(() => rm(root, { recursive: true, force: true }));
  lock.inputs.push({ id: 'crafting.future', kind: 'crafting', stage: 'M2-3', path: 'cn/pipeline/sources/crafting/future.json', sha256: 'f'.repeat(64), format: 'json', language: 'zh-CN', provenance: {} });
  await writeJson(join(root, 'cn/config/content-source-lock.json'), lock);
  const inputs = await loadLockedInputs(root, { stage: 'M2-2' });
  assert.deepEqual(inputs.map(input => input.id), inputIds);
  await assert.rejects(loadLockedInputs(root, {}), /stage is required/);
});

test('assertLockedInputPath rejects unregistered input and upstream reads', async t => {
  const { root, lock } = await makeRepo(); t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(assertLockedInputPath(lock, 'cn/pipeline/overrides/zh-CN/terms.json').id, 'override.zh-CN.terms');
  assert.throws(() => assertLockedInputPath(lock, 'src/Modules/Main.lua'), /not registered|upstream/);
});

test('importer rolls every controlled target back when fault injection interrupts a transaction', async t => {
  for (const faultAt of ['candidate-gzip-write', 'candidate-lock-write', 'candidate-version-write', 'candidate-report-write', 'commit-gzip', 'commit-lock', 'commit-version', 'commit-report']) {
    const { root } = await makeRepo(); t.after(() => rm(root, { recursive: true, force: true }));
    const paths = ['cn/pipeline/sources/dictionary/ninja-poe2/poe2.json.gz', 'cn/config/content-source-lock.json', 'cn/config/version-lock.json', 'docs/architecture/compatibility/dictionary/2af6460f94ef0fc6ef9826e7ca8b06f485013b4828993e0480391b9138bcc779.md'];
    const capture = async () => Promise.all(paths.map(async path => { try { return [path, sha256(await readFile(join(root, path)))]; } catch { return [path, null]; } }));
    const before = await capture();
    const artifact = await readFile(controlledArtifact); await assert.rejects(importNinjaPoe2Dictionary({ repoRoot: root, artifactPath: controlledArtifact, externalEvidence: { ...evidenceFor(artifact), faultAt } }), /injected/);
    assert.deepEqual(await capture(), before, faultAt);
  }
});

test('checked-in dictionary preserves the current fixed identity and complete evidence', async () => {
  const sourceLock = JSON.parse(await readFile(join(controlledRepoRoot, 'cn/config/content-source-lock.json'), 'utf8'));
  const dictionary = sourceLock.inputs.find(input => input.id === dictionaryId);
  assert.deepEqual(dictionary.artifact, { size_bytes: 2558745, source_mtime_local: sourceMtimeLocal });
  assert.equal(dictionary.sha256, '2af6460f94ef0fc6ef9826e7ca8b06f485013b4828993e0480391b9138bcc779');
  assert.deepEqual(dictionary.payload, { uncompressed_sha256: '18f613924fe3a8092bc00194ff1082309484c454773f76566674db1feba4057a', uncompressed_size_bytes: 12205433, top_level_domain_counts: { items: 13609, stats: 29358, tooltip: 2592, ui: 499, terms: 24169 } });
  assert.deepEqual(dictionary.schema, schema); assert.deepEqual(dictionary.build_evidence, buildEvidence);
  await assert.doesNotReject(validateSourceLock(sourceLock, controlledRepoRoot));
});

test('importer installs an explicitly evidenced gzip and only the three M2-2 locked inputs', async t => {
  const { root } = await makeRepo(); t.after(() => rm(root, { recursive: true, force: true }));
  const artifact = await readFile(controlledArtifact); await importNinjaPoe2Dictionary({ repoRoot: root, artifactPath: controlledArtifact, externalEvidence: evidenceFor(artifact) });
  assert.deepEqual((await loadLockedInputs(root, { stage: 'M2-2' })).map(input => input.id), inputIds);
});

test('importer rejects missing or internally inconsistent external evidence', async t => {
  const { root } = await makeRepo(); t.after(() => rm(root, { recursive: true, force: true }));
  const artifact = await readFile(controlledArtifact); const evidence = evidenceFor(artifact);
  await assert.rejects(importNinjaPoe2Dictionary({ repoRoot: root, artifactPath: controlledArtifact }), /external evidence/);
  evidence.artifact.sha256 = '0'.repeat(64);
  await assert.rejects(importNinjaPoe2Dictionary({ repoRoot: root, artifactPath: controlledArtifact, externalEvidence: evidence }), /hash or size/);
});

test('importer accepts a different fully evidenced candidate and locks its artifact-named report', async t => {
  const { root, dictionary } = await makeRepo(); t.after(() => rm(root, { recursive: true, force: true }));
  const json = JSON.parse(gunzipSync(dictionary).toString('utf8')); const key = Object.keys(json.terms)[0]; json.terms[key] = `${json.terms[key]} updated`;
  const candidate = gzipSync(Buffer.from(JSON.stringify(json))); const candidatePath = join(root, 'candidate.json.gz'); await writeFile(candidatePath, candidate);
  const evidence = evidenceFor(candidate, { source_mtime_local: '2026-08-27 12:00:00' });
  const result = await importNinjaPoe2Dictionary({ repoRoot: root, artifactPath: candidatePath, externalEvidence: evidence });
  assert.equal(result.sha256, evidence.artifact.sha256); assert.equal(result.report_path, `docs/architecture/compatibility/dictionary/${evidence.artifact.sha256}.md`);
  const lock = JSON.parse(await readFile(join(root, 'cn/config/content-source-lock.json'), 'utf8'));
  assert.equal(lock.inputs[0].sha256, evidence.artifact.sha256); assert.deepEqual(lock.inputs[0].artifact, { size_bytes: evidence.artifact.size_bytes, source_mtime_local: evidence.artifact.source_mtime_local }); assert.equal(lock.inputs[0].compatibility_report.path, result.report_path);
  assert.deepEqual((await loadLockedInputs(root, { stage: 'M2-2' })).map(input => input.id), inputIds);
});
