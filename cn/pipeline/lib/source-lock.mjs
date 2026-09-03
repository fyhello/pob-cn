import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';

const dictionaryId = 'dictionary.ninja-poe2.poe2-runtime-gzip';
const fixedM22 = [dictionaryId, 'override.zh-CN.terms', 'override.zh-CN.glossary'];
const dictionaryPath = 'cn/pipeline/sources/dictionary/ninja-poe2/poe2.json.gz';
const sourceLockPath = 'cn/config/content-source-lock.json';
const versionLockPath = 'cn/config/version-lock.json';
const dictionaryDomains = ['items', 'stats', 'tooltip', 'ui', 'terms'];
const hash = value => createHash('sha256').update(value).digest('hex');
const posix = value => value.split(sep).join('/');
const requireStage = options => { if (!options?.stage) throw new Error('stage is required'); };

function safePath(path) {
  if (typeof path !== 'string' || !path || isAbsolute(path) || /^[a-z]:/i.test(path) || path.includes('\\') || path.split('/').includes('..')) throw new Error('input path must be repository-relative POSIX path without traversal or backslash');
  if (path.startsWith('cn/generated/')) throw new Error('generated paths cannot be inputs');
  if (/(^|\/)poe[12]\.json$/i.test(path)) throw new Error('bare JSON dictionary inputs are forbidden');
  if (/POB-cn|ninja-poe2/i.test(path) && path !== dictionaryPath) throw new Error('external or legacy path is forbidden');
  return path;
}

async function checkedFile(repoRoot, path) {
  safePath(path);
  const root = await realpath(repoRoot);
  const target = resolve(root, path);
  const actual = await realpath(target);
  if (actual !== root && !actual.startsWith(`${root}${sep}`)) throw new Error(`input path escapes repository through symlink: ${path}`);
  if ((await lstat(target)).isSymbolicLink()) throw new Error(`symbolic link inputs are forbidden: ${path}`);
  return readFile(target);
}

function validHash(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

function validateBuildEvidence(evidence) {
  if (!evidence || typeof evidence.generated_at !== 'string' || !evidence.generated_at || !evidence.tool_sha256 || typeof evidence.tool_sha256 !== 'object' || Array.isArray(evidence.tool_sha256)) throw new Error('dictionary build evidence is incomplete');
  const tools = Object.entries(evidence.tool_sha256);
  if (tools.length !== 3 || tools.some(([path, digest]) => !path || !validHash(digest))) throw new Error('dictionary build evidence must lock exactly three tool hashes');
}

function validateDictionaryMetadata(input, versionDictionary) {
  if (input.id !== dictionaryId || input.path !== dictionaryPath || !validHash(input.sha256) || input.format !== 'gzip-json') throw new Error('dictionary lock identity mismatch');
  if (!input.artifact || !Number.isInteger(input.artifact.size_bytes) || input.artifact.size_bytes <= 0 || typeof input.artifact.source_mtime_local !== 'string' || !input.artifact.source_mtime_local) throw new Error('dictionary artifact lock mismatch');
  if (!input.payload || !validHash(input.payload.uncompressed_sha256) || !Number.isInteger(input.payload.uncompressed_size_bytes) || input.payload.uncompressed_size_bytes <= 0 || !input.payload.top_level_domain_counts || dictionaryDomains.some(domain => !Number.isInteger(input.payload.top_level_domain_counts[domain]) || input.payload.top_level_domain_counts[domain] < 0)) throw new Error('dictionary payload lock mismatch');
  if (!input.schema || typeof input.schema.path !== 'string' || !input.schema.path || !validHash(input.schema.sha256) || !Number.isInteger(input.schema.schema_version)) throw new Error('dictionary schema lock mismatch');
  validateBuildEvidence(input.build_evidence);
  if (!input.compatibility_report || input.compatibility_report.path !== reportPath(input.sha256) || !validHash(input.compatibility_report.sha256)) throw new Error('dictionary compatibility report lock mismatch');
  if (!versionDictionary || versionDictionary.source_id !== dictionaryId || !same(versionDictionary.artifact && { sha256: versionDictionary.artifact.sha256, size_bytes: versionDictionary.artifact.size_bytes, source_mtime_local: versionDictionary.artifact.source_mtime_local }, { sha256: input.sha256, ...input.artifact }) || !same(versionDictionary.payload && { uncompressed_sha256: versionDictionary.payload.uncompressed_sha256, uncompressed_size_bytes: versionDictionary.payload.uncompressed_size_bytes, top_level_domain_counts: versionDictionary.payload.top_level_domain_counts }, input.payload) || versionDictionary.payload?.format !== input.format || !same(versionDictionary.schema && { path: versionDictionary.schema.path, sha256: versionDictionary.schema.sha256, schema_version: versionDictionary.schema.schema_version }, input.schema) || !same(versionDictionary.build_evidence, input.build_evidence) || !same(versionDictionary.compatibility_report, input.compatibility_report)) throw new Error('version lock dictionary fields do not match source lock');
}

async function versionAndSnapshot(repoRoot, input) {
  const version = JSON.parse(await readFile(resolve(repoRoot, versionLockPath), 'utf8'));
  const reference = input.upstream_snapshot;
  if (!reference || reference.path !== 'cn/config/upstream-content-snapshot.json' || !reference.sha256 || !reference.upstream_commit || !reference.source_tree_sha256 || !reference.file_count) throw new Error('complete upstream snapshot reference is required');
  const bytes = await checkedFile(repoRoot, reference.path);
  if (hash(bytes) !== reference.sha256) throw new Error('upstream snapshot hash mismatch');
  const snapshot = JSON.parse(bytes);
  if (snapshot.upstream_commit !== reference.upstream_commit || snapshot.source_tree_sha256 !== reference.source_tree_sha256 || snapshot.file_count !== reference.file_count || !Array.isArray(snapshot.files) || snapshot.files.length !== snapshot.file_count || !snapshot.files.every(file => file.upstream_blob_oid && file.upstream_content_sha256)) throw new Error('upstream snapshot is incomplete or lineage does not match');
  if (version.upstream?.commit !== snapshot.upstream_commit) throw new Error('version lock upstream commit does not match snapshot');
  return version;
}

async function loadVerifiedUpstreamSnapshot(repoRoot, input) {
  const reference = input.upstream_snapshot;
  if (!reference || reference.path !== 'cn/config/upstream-content-snapshot.json' || !reference.sha256 || !reference.upstream_commit || !reference.source_tree_sha256 || !reference.file_count) throw new Error('complete upstream snapshot reference is required');
  const bytes = await checkedFile(repoRoot, reference.path);
  if (hash(bytes) !== reference.sha256) throw new Error('upstream snapshot hash mismatch');
  const snapshot = JSON.parse(bytes);
  if (snapshot.upstream_commit !== reference.upstream_commit || snapshot.source_tree_sha256 !== reference.source_tree_sha256 || snapshot.file_count !== reference.file_count || !Array.isArray(snapshot.files) || snapshot.files.length !== snapshot.file_count || !snapshot.files.every(file => file.upstream_blob_oid && file.upstream_content_sha256)) throw new Error('upstream snapshot is incomplete or lineage does not match');
  return snapshot;
}

async function validateUpstreamCollection(repoRoot, input) {
  if (input.kind !== 'UPSTREAM_COLLECTION' || input.format !== 'lua-directory') throw new Error('crafting upstream collection is invalid');
  const snapshot = await loadVerifiedUpstreamSnapshot(repoRoot, input);
  const prefix = `${input.path}/`;
  const files = snapshot.files
    .filter(file => file.path.startsWith(prefix) && file.path.endsWith('.lua'))
    .map(file => ({ path: file.path, sha256: file.upstream_content_sha256 }))
    .sort((left, right) => left.path.localeCompare(right.path));
  if (!files.length) throw new Error('crafting upstream collection has no snapshot files');
  const collectionHash = hash(`${files.map(file => `${file.path}:${file.sha256}`).join('\n')}\n`);
  if (collectionHash !== input.sha256) throw new Error('crafting upstream collection hash does not match snapshot');
  for (const file of files) {
    const contents = await checkedFile(repoRoot, file.path);
    if (hash(contents) !== file.sha256) throw new Error(`upstream collection file hash mismatch: ${file.path}`);
  }
  return files;
}

export async function validateSourceLock(lock, repoRoot, options = {}) {
  const selectedStage = options.stage;
  if (!lock || lock.schema_version !== 1 || !Array.isArray(lock.inputs)) throw new Error('invalid source lock');
  const m22 = lock.inputs.filter(input => input.stage === 'M2-2');
  if (m22.length !== fixedM22.length || JSON.stringify(m22.map(input => input.id).sort()) !== JSON.stringify([...fixedM22].sort())) throw new Error('M2-2 source lock must contain exactly the three fixed input ids');
  const inputs = selectedStage ? lock.inputs.filter(input => input.stage === selectedStage) : lock.inputs;
  if (selectedStage === 'M2-3' && inputs.length !== 7) throw new Error('M2-3 source lock must contain exactly seven crafting inputs');
  if (selectedStage === 'M3' && inputs.length !== 6) throw new Error('M3 source lock must contain exactly six approved web seed inputs');
  const allPaths = new Set(); const allIds = new Set();
  for (const input of inputs) {
    if (!input.id || !input.kind || !input.stage || !input.sha256 || !input.format || !input.language || !input.provenance) throw new Error('source lock input has missing required fields');
    if (allIds.has(input.id) || allPaths.has(input.path)) throw new Error('duplicate source lock id or path');
    allIds.add(input.id); allPaths.add(input.path); safePath(input.path);
    if (input.kind === 'UPSTREAM_COLLECTION') {
      input.collection_files = await validateUpstreamCollection(repoRoot, input);
    } else {
      const contents = await checkedFile(repoRoot, input.path);
      if (hash(contents) !== input.sha256) throw new Error(`input hash mismatch: ${input.path}`);
    }
  }
  const dictionary = m22.find(input => input.id === dictionaryId);
  const version = await versionAndSnapshot(repoRoot, dictionary);
  validateDictionaryMetadata(dictionary, version.content_versions?.dictionary);
  let report;
  try { report = await checkedFile(repoRoot, dictionary.compatibility_report.path); }
  catch { throw new Error('dictionary compatibility report is missing or unsafe'); }
  if (hash(report) !== dictionary.compatibility_report.sha256) throw new Error('dictionary compatibility report hash mismatch');
  if (selectedStage === 'M2-3') {
    const expected = ['upstream.crafting.runes', 'upstream.crafting.essences', 'upstream.crafting.item-mods', 'upstream.crafting.jewel-mods', 'upstream.crafting.item-bases', 'crafting.slot-tag-map', 'crafting.seed.zh-CN'];
    if (JSON.stringify(inputs.map(value => value.id).sort()) !== JSON.stringify(expected.sort())) throw new Error('M2-3 crafting input ids are invalid');
    for (const entry of inputs.filter(value => value.id.startsWith('upstream.crafting.') && value.id !== 'upstream.crafting.item-bases')) {
      if (entry.kind !== 'UPSTREAM' || !entry.upstream_snapshot || entry.upstream_snapshot.path !== 'cn/config/upstream-content-snapshot.json') throw new Error('crafting upstream authority is not linked to the locked snapshot');
      const snapshot = await loadVerifiedUpstreamSnapshot(repoRoot, entry);
      const source = snapshot.files.find(file => file.path === entry.path);
      if (!source || source.upstream_content_sha256 !== entry.sha256 || entry.upstream_snapshot.upstream_content_sha256 !== entry.sha256) throw new Error('crafting upstream source is not pinned to its snapshot content');
    }
    const bases = inputs.find(value => value.id === 'upstream.crafting.item-bases');
    if (!bases || bases.kind !== 'UPSTREAM_COLLECTION' || !bases.upstream_snapshot || bases.upstream_snapshot.path !== 'cn/config/upstream-content-snapshot.json' || !Array.isArray(bases.collection_files)) throw new Error('crafting item bases are not pinned to the locked snapshot');
    for (const entry of inputs.filter(value => value.id.startsWith('crafting.'))) if (entry.kind !== 'CN_SOURCE' || entry.format !== 'json') throw new Error('crafting CN source is invalid');
  }
  if (selectedStage === 'M3') {
    const expected = ['legacy.web.affixes', 'legacy.web.bases', 'legacy.web.gems', 'legacy.web.tree', 'legacy.web.uniques', 'legacy.web.crafting'];
    if (JSON.stringify(inputs.map(value => value.id).sort()) !== JSON.stringify(expected.sort())) throw new Error('M3 web seed input ids are invalid');
    for (const entry of inputs) if (entry.kind !== 'LEGACY_SEED' || entry.format !== 'json') throw new Error('M3 web seed input is invalid');
  }
  return selectedStage ? inputs : lock.inputs;
}

export async function loadLockedInputs(repoRoot, options) {
  requireStage(options);
  const lock = JSON.parse(await readFile(resolve(repoRoot, sourceLockPath), 'utf8'));
  const inputs = await validateSourceLock(lock, repoRoot, { stage: options.stage });
  return inputs.map(input => Object.freeze({ ...input, absolute_path: resolve(repoRoot, input.path) }));
}

export function assertLockedInputPath(lock, relativePath) {
  safePath(relativePath);
  const input = (lock.inputs ?? []).find(entry => entry.path === relativePath);
  if (!input) throw new Error(`input path is not registered: ${relativePath}`);
  return input;
}

function reportPath(gzipSha256) { return `docs/architecture/compatibility/dictionary/${gzipSha256}.md`; }
function evidenceReport(evidence) {
  const tools = Object.entries(evidence.build_evidence.tool_sha256).map(([path, digest]) => `- tool_sha256: \`${path}\` = \`${digest}\``).join('\n');
  const counts = dictionaryDomains.map(domain => `${domain}=${evidence.payload.top_level_domain_counts[domain]}`).join(', ');
  return `# 词典兼容性记录\n\n- source_id: \`${dictionaryId}\`\n- gzip_sha256: \`${evidence.artifact.sha256}\`\n- payload_sha256: \`${evidence.payload.uncompressed_sha256}\`\n- schema: \`${evidence.schema.path}\` (v${evidence.schema.schema_version}, \`${evidence.schema.sha256}\`)\n- domains: ${counts}\n- external_generated_at: \`${evidence.build_evidence.generated_at}\`\n${tools}\n- result: imported from an explicitly supplied final gzip after full validation\n`;
}

function requireExternalEvidence(externalEvidence) {
  const evidence = { artifact: externalEvidence?.artifact, payload: externalEvidence?.payload, schema: externalEvidence?.schema, build_evidence: externalEvidence?.build_evidence };
  if (!evidence.artifact || !evidence.payload || !evidence.schema || !evidence.build_evidence) throw new Error('complete external evidence is required');
  if (!validHash(evidence.artifact.sha256) || !Number.isInteger(evidence.artifact.size_bytes) || evidence.artifact.size_bytes <= 0 || typeof evidence.artifact.source_mtime_local !== 'string' || !evidence.artifact.source_mtime_local) throw new Error('external evidence artifact metadata is invalid');
  if (!validHash(evidence.payload.uncompressed_sha256) || !Number.isInteger(evidence.payload.uncompressed_size_bytes) || evidence.payload.uncompressed_size_bytes <= 0 || !evidence.payload.top_level_domain_counts || dictionaryDomains.some(domain => !Number.isInteger(evidence.payload.top_level_domain_counts[domain]) || evidence.payload.top_level_domain_counts[domain] < 0)) throw new Error('external evidence payload metadata is invalid');
  if (typeof evidence.schema.path !== 'string' || !evidence.schema.path || !validHash(evidence.schema.sha256) || !Number.isInteger(evidence.schema.schema_version)) throw new Error('external evidence schema metadata is invalid');
  validateBuildEvidence(evidence.build_evidence);
  return evidence;
}

async function verifyCandidate(artifactPath, evidence) {
  if (!artifactPath || !artifactPath.endsWith('.json.gz')) throw new Error('dictionary artifact path is not an approved final gzip candidate');
  const gzip = await readFile(artifactPath);
  if (gzip.length !== evidence.artifact.size_bytes || hash(gzip) !== evidence.artifact.sha256) throw new Error('dictionary artifact hash or size mismatch');
  let payload; try { payload = gunzipSync(gzip); } catch { throw new Error('dictionary gzip cannot be decompressed'); }
  if (payload.length !== evidence.payload.uncompressed_size_bytes || hash(payload) !== evidence.payload.uncompressed_sha256) throw new Error('dictionary payload hash or size mismatch');
  let json; try { json = JSON.parse(payload.toString('utf8')); } catch { throw new Error('dictionary payload is not JSON'); }
  const counts = Object.fromEntries(dictionaryDomains.map(key => [key, Object.keys(json[key] ?? {}).length]));
  if (!same(counts, evidence.payload.top_level_domain_counts)) throw new Error('dictionary domain counts mismatch');
  return gzip;
}

async function snapshot(paths) {
  return Promise.all(paths.map(async path => ({ path, exists: existsSync(path), contents: existsSync(path) ? await readFile(path) : null })));
}
async function restore(entries) {
  for (const entry of entries) {
    if (entry.exists) { await mkdir(resolve(entry.path, '..'), { recursive: true }); await writeFile(entry.path, entry.contents); }
    else await rm(entry.path, { force: true });
  }
}
async function atomicWrite(path, contents) {
  await mkdir(resolve(path, '..'), { recursive: true });
  const temporary = `${path}.m2-txn-${process.pid}-${Date.now()}`;
  await writeFile(temporary, contents); await rename(temporary, path);
}

export async function importNinjaPoe2Dictionary({ repoRoot, artifactPath, externalEvidence = {} }) {
  const root = resolve(repoRoot);
  const evidence = requireExternalEvidence(externalEvidence);
  const compatibilityReport = Buffer.from(evidenceReport(evidence));
  const report = { path: reportPath(evidence.artifact.sha256), sha256: hash(compatibilityReport) };
  const targets = [dictionaryPath, sourceLockPath, versionLockPath, report.path].map(path => resolve(root, path));
  const before = await snapshot(targets);
  const temporary = await mkdtemp(join(tmpdir(), 'pob-cn-dictionary-import-'));
  const fault = point => { if (externalEvidence.faultAt === point) throw new Error(`injected importer failure: ${point}`); };
  try {
    const gzip = await verifyCandidate(artifactPath, evidence); fault('candidate-gzip-write');
    const termsPath = resolve(root, 'cn/pipeline/overrides/zh-CN/terms.json');
    const glossaryPath = resolve(root, 'cn/pipeline/overrides/zh-CN/glossary.json');
    const version = JSON.parse(await readFile(resolve(root, versionLockPath), 'utf8'));
    const upstream = JSON.parse(await readFile(resolve(root, 'cn/config/upstream-content-snapshot.json'), 'utf8'));
    const sourceLock = { schema_version: 1, inputs: [
      { id: dictionaryId, kind: 'dictionary', stage: 'M2-2', path: dictionaryPath, sha256: evidence.artifact.sha256, format: 'gzip-json', language: 'zh-CN', provenance: { source: 'ninja-poe2-final-runtime-gzip', reviewed: true }, artifact: { size_bytes: evidence.artifact.size_bytes, source_mtime_local: evidence.artifact.source_mtime_local }, payload: evidence.payload, schema: evidence.schema, build_evidence: evidence.build_evidence, compatibility_report: report, upstream_snapshot: { path: 'cn/config/upstream-content-snapshot.json', sha256: hash(await readFile(resolve(root, 'cn/config/upstream-content-snapshot.json'))), upstream_commit: upstream.upstream_commit, source_tree_sha256: upstream.source_tree_sha256, file_count: upstream.file_count } },
      { id: 'override.zh-CN.terms', kind: 'override', stage: 'M2-2', path: 'cn/pipeline/overrides/zh-CN/terms.json', sha256: hash(await readFile(termsPath)), format: 'json', language: 'zh-CN', provenance: { reviewed: false, review_status: 'pending' } },
      { id: 'override.zh-CN.glossary', kind: 'override', stage: 'M2-2', path: 'cn/pipeline/overrides/zh-CN/glossary.json', sha256: hash(await readFile(glossaryPath)), format: 'json', language: 'zh-CN', provenance: { reviewed: false, review_status: 'pending' } },
    ] };
    const nextVersion = structuredClone(version);
    nextVersion.content_versions.dictionary = { status: 'LOCKED', version: null, source_commit: null, source_id: dictionaryId, artifact: { in_repository: true, ...evidence.artifact }, payload: { format: 'gzip-json', ...evidence.payload }, schema: { status: 'VENDORED_SCHEMA_IDENTIFIED', schema_version: evidence.schema.schema_version, schema_url: null, path: evidence.schema.path, sha256: evidence.schema.sha256 }, build_evidence: evidence.build_evidence, compatibility_report: report };
    await writeFile(join(temporary, 'poe2.json.gz'), gzip); fault('candidate-lock-write');
    await writeFile(join(temporary, 'content-source-lock.json'), `${JSON.stringify(sourceLock, null, 2)}\n`); fault('candidate-version-write');
    await writeFile(join(temporary, 'version-lock.json'), `${JSON.stringify(nextVersion, null, 2)}\n`); fault('candidate-report-write');
    const entries = [
      [targets[0], await readFile(join(temporary, 'poe2.json.gz')), 'commit-gzip'],
      [targets[1], await readFile(join(temporary, 'content-source-lock.json')), 'commit-lock'],
      [targets[2], await readFile(join(temporary, 'version-lock.json')), 'commit-version'],
      [targets[3], compatibilityReport, 'commit-report'],
    ];
    for (const [path, contents, point] of entries) { fault(point); await atomicWrite(path, contents); }
    return { source_id: dictionaryId, path: dictionaryPath, sha256: evidence.artifact.sha256, report_path: report.path };
  } catch (error) { await restore(before); throw error; }
  finally { await rm(temporary, { recursive: true, force: true }); }
}
