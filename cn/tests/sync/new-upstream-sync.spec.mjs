import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { buildCompatibilityReport, validateExternalEvidence } from '../../pipeline/sync/sync-contract.mjs';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const dictionaryPaths = ['cn/pipeline/sources/dictionary/ninja-poe2/poe2.json.gz', 'cn/config/content-source-lock.json', 'cn/config/version-lock.json'];

async function evidence() {
  const version = JSON.parse(await readFile(join(repoRoot, 'cn/config/version-lock.json'), 'utf8'));
  return {
    client_versions: { cn: '0.5.0.1', intl: '0.5.0.1' },
    schema: { path: version.content_versions.dictionary.schema.path, sha256: version.content_versions.dictionary.schema.sha256, schema_version: version.content_versions.dictionary.schema.schema_version, fallback_used: false },
    tool_sha256: version.content_versions.dictionary.build_evidence.tool_sha256,
    delivery: { command: 'npm run build:dict', exit_code: 0 },
  };
}

async function sourceLock() {
  return JSON.parse(await readFile(join(repoRoot, 'cn/config/content-source-lock.json'), 'utf8'));
}

test('builds a complete candidate report for a simulated upstream SHA without an import', async () => {
  const version = JSON.parse(await readFile(join(repoRoot, 'cn/config/version-lock.json'), 'utf8'));
  const report = buildCompatibilityReport({ versionLock: version, sourceLock: await sourceLock(), externalEvidence: await evidence(), upstreamCommit: '1'.repeat(40), candidateBranch: 'sync/upstream-111111111111' });
  assert.equal(report.candidate.branch, 'sync/upstream-111111111111');
  assert.equal(report.candidate.upstream_commit, '1'.repeat(40));
  assert.equal(report.external.delivery.command, 'npm run build:dict');
  assert.equal(report.locked_dictionary.gzip_sha256, version.content_versions.dictionary.artifact.sha256);
  assert.match(report.locked_dictionary.overrides['override.zh-CN.terms'].sha256, /^[a-f0-9]{64}$/);
  assert.match(report.locked_dictionary.overrides['override.zh-CN.glossary'].sha256, /^[a-f0-9]{64}$/);
  assert.equal(report.import.attempted, false);
  assert.match(report.import.conclusion, /No gzip or lock replacement/);
});

test('fails closed on missing schema identity before Git fetch and leaves controlled data unchanged', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'pob-cn-m4-evidence-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const invalid = await evidence(); delete invalid.schema.sha256;
  const evidencePath = join(directory, 'invalid-evidence.json'); await writeFile(evidencePath, `${JSON.stringify(invalid)}\n`);
  const before = await Promise.all(dictionaryPaths.map(async path => [path, sha256(await readFile(join(repoRoot, path)))]));
  const script = join(repoRoot, 'cn/pipeline/sync/new-upstream-sync.ps1');
  const result = spawnSync('pwsh', ['-NoProfile', '-File', script, '-RepoRoot', repoRoot, '-ExternalEvidencePath', evidencePath], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /schema identity|external evidence/i);
  assert.deepEqual(await Promise.all(dictionaryPaths.map(async path => [path, sha256(await readFile(join(repoRoot, path)))])), before);
});

test('rejects remote schema fallback and incomplete tool evidence', async () => {
  const fallback = await evidence(); fallback.schema.fallback_used = true;
  assert.throws(() => validateExternalEvidence(fallback), /fallback/);
  const tools = await evidence(); delete tools.tool_sha256['tools/build-all.mjs'];
  assert.throws(() => validateExternalEvidence(tools), /tool hashes/);
});
