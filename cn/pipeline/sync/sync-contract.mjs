import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const commit = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const requiredTools = ['tools/upstream-builder/update.py', 'tools/upstream-builder/build.py', 'tools/build-all.mjs'];

function requireText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value;
}

export function validateExternalEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object') throw new Error('external evidence is required');
  const schema = evidence.schema;
  if (!schema || !requireText(schema.path, 'schema.path') || !hash(schema.sha256) || !Number.isInteger(schema.schema_version) || schema.schema_version < 1) throw new Error('schema identity is incomplete');
  if (schema.fallback_used !== false) throw new Error('schema fallback is forbidden; a manually locked schema identity is required');
  if (!evidence.client_versions || !requireText(evidence.client_versions.cn, 'client_versions.cn') || !requireText(evidence.client_versions.intl, 'client_versions.intl')) throw new Error('client versions are required');
  if (!evidence.tool_sha256 || requiredTools.some(path => !hash(evidence.tool_sha256[path])) || Object.keys(evidence.tool_sha256).length !== requiredTools.length) throw new Error('external tool hashes are incomplete');
  if (!evidence.delivery || evidence.delivery.command !== 'npm run build:dict' || evidence.delivery.exit_code !== 0) throw new Error('final dictionary build evidence is required');
  return evidence;
}

function lockedOverrides(sourceLock) {
  const ids = ['override.zh-CN.terms', 'override.zh-CN.glossary'];
  const inputs = sourceLock?.inputs;
  if (!Array.isArray(inputs)) throw new Error('source lock inputs are incomplete');
  const overrides = ids.map(id => inputs.find(input => input.id === id));
  if (overrides.some(input => !input || input.stage !== 'M2-2' || !hash(input.sha256))) throw new Error('locked override hashes are incomplete');
  return Object.fromEntries(overrides.map(input => [input.id, { path: input.path, sha256: input.sha256 }]));
}

export function buildCompatibilityReport({ versionLock, sourceLock, externalEvidence, upstreamCommit, candidateBranch }) {
  validateExternalEvidence(externalEvidence);
  if (!versionLock?.upstream || !commit(versionLock.upstream.commit) || !requireText(versionLock.upstream.default_branch, 'upstream.default_branch')) throw new Error('version lock upstream identity is incomplete');
  if (!commit(upstreamCommit) || !/^sync\/upstream-[a-f0-9]{12}$/.test(candidateBranch)) throw new Error('candidate upstream identity is invalid');
  const dictionary = versionLock.content_versions?.dictionary;
  if (!dictionary?.artifact?.sha256 || !dictionary.payload?.uncompressed_sha256 || !dictionary.schema?.path || !dictionary.schema?.sha256 || !dictionary.schema?.schema_version) throw new Error('locked dictionary identity is incomplete');
  return {
    schema_version: 1,
    status: 'candidate_requires_manual_review',
    candidate: { branch: candidateBranch, upstream_commit: upstreamCommit, base_locked_commit: versionLock.upstream.commit },
    upstream: { url: versionLock.upstream.url, default_branch: versionLock.upstream.default_branch },
    external: { client_versions: externalEvidence.client_versions, tool_sha256: externalEvidence.tool_sha256, schema: externalEvidence.schema, delivery: externalEvidence.delivery },
    locked_dictionary: {
      gzip_sha256: dictionary.artifact.sha256,
      gzip_size_bytes: dictionary.artifact.size_bytes,
      payload_sha256: dictionary.payload.uncompressed_sha256,
      payload_size_bytes: dictionary.payload.uncompressed_size_bytes,
      top_level_domain_counts: dictionary.payload.top_level_domain_counts,
      schema: { path: dictionary.schema.path, sha256: dictionary.schema.sha256, schema_version: dictionary.schema.schema_version },
      overrides: lockedOverrides(sourceLock),
    },
    import: { attempted: false, conclusion: 'No gzip or lock replacement is permitted by this candidate-branch command.' },
    commands: [
      { command: `git fetch upstream ${versionLock.upstream.default_branch}`, exit_code: 0 },
      { command: `git branch ${candidateBranch} ${upstreamCommit}`, exit_code: 0 },
    ],
  };
}

async function main() {
  const [mode, versionPath, evidencePath, upstreamCommit, candidateBranch] = process.argv.slice(2);
  if (mode !== 'report') throw new Error('usage: sync-contract.mjs report <version-lock> <external-evidence> <upstream-commit> <candidate-branch>');
  const versionLock = JSON.parse(await readFile(versionPath, 'utf8'));
  const sourceLock = JSON.parse(await readFile(resolve(dirname(versionPath), 'content-source-lock.json'), 'utf8'));
  const externalEvidence = JSON.parse(await readFile(evidencePath, 'utf8'));
  process.stdout.write(`${JSON.stringify(buildCompatibilityReport({ versionLock, sourceLock, externalEvidence, upstreamCommit, candidateBranch }), null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
