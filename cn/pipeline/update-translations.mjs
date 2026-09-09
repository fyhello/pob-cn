import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { parseArgs } from 'node:util';
import { compileNativeTranslations, validateNativeProvenance, auditTranslationCoverage, auditTranslationRegressions, translationDomains, translationInputIds, translationOutputs } from './lib/native-translations.mjs';
import { writeFileTransaction } from './lib/file-transaction.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const lockPath = 'cn/config/content-source-lock.json';
const reviewedPath = 'cn/pipeline/sources/translations/reviewed.json';

async function readCandidate(root, candidate) {
  const gameBytes = await readFile(resolve(candidate, 'game-text.json.gz'));
  const coreBytes = await readFile(resolve(candidate, 'core-corpus.json.gz'));
  const reviewedBytes = await readFile(resolve(root, reviewedPath));
  const manifest = JSON.parse(await readFile(resolve(candidate, 'candidate.json')));
  const payload = gunzipSync(gameBytes);
  if (manifest.sha256 !== hash(gameBytes) || manifest.payload_sha256 !== hash(payload)) throw new Error('候选游戏快照哈希错误');
  const game = JSON.parse(payload), core = JSON.parse(gunzipSync(coreBytes)), reviewed = JSON.parse(reviewedBytes);
  const version = JSON.parse(await readFile(resolve(root, 'cn/config/version-lock.json')));
  if (game.upstream_commit !== version.upstream.commit || core.upstream_commit !== version.upstream.commit) throw new Error('候选 PoB 版本过期');
  await validateNativeProvenance(root, game, core);
  for (const source of core.sources) {
    if (!source.path.startsWith('src/') || source.path.includes('..') || hash(await readFile(resolve(root, source.path))) !== source.sha256) throw new Error(`核心语料来源已变化：${source.path}`);
  }
  for (const source of core.collectors || []) {
    if (!['cn/pipeline/export-translation-corpus.mjs', 'cn/pipeline/lua/translation-corpus.lua', 'cn/pipeline/lua/translation-breakdown.lua'].includes(source.path)
      || hash(await readFile(resolve(root, source.path))) !== source.sha256) throw new Error(`语料采集器已变化：${source.path}`);
  }
  for (const source of game.collectors || []) {
    if (!['cn/pipeline/collect-game-translations.mjs', 'cn/pipeline/lib/game-text.mjs'].includes(source.path)
      || hash(await readFile(resolve(root, source.path))) !== source.sha256) throw new Error(`游戏文本采集器已变化：${source.path}`);
  }
  const compiled = compileNativeTranslations(game, core, reviewed);
  return { gameBytes, coreBytes, reviewedBytes, game, core, reviewed, compiled };
}

export async function reviewTranslationCandidate({ repoRoot = defaultRoot, candidate }) {
  const root = resolve(repoRoot), input = await readCandidate(root, candidate);
  const changes = {}, previousHashes = {}, regressions = [];
  const itemCoverage = auditTranslationCoverage(input.compiled.packages, { ...input.core, rows: input.core.rows.filter(row => /^unique_|^flavour_/.test(row.category)) });
  for (const [locale, path] of Object.entries(translationOutputs)) {
    let previous = {};
    try { const bytes = await readFile(resolve(root, path)); previous = JSON.parse(bytes); previousHashes[locale] = hash(bytes); } catch (error) { if (error.code !== 'ENOENT') throw error; previousHashes[locale] = null; }
    changes[locale] = { added: [], removed: [], changed: [] };
    const next = input.compiled.packages[locale];
    // 实际浮窗先按与网页相同的多行和支持状态边界合并，不能把已译整段误判成孤立行缺译。
    const regressionCorpus = { ...input.core, rows: [
      ...input.core.rows.filter(row => row.category !== 'unique_display'),
      ...itemCoverage[locale].missing.filter(row => row.category === 'unique_display'),
    ] };
    regressions.push(...auditTranslationRegressions(previous, next, regressionCorpus, input.reviewed.requiredDisplays, input.reviewed.regressionExceptions));
    for (const domain of translationDomains) {
      for (const [source, text] of Object.entries(next[domain])) {
        if (!Object.hasOwn(previous[domain] || {}, source)) changes[locale].added.push({ domain, source, text });
        else if (previous[domain][source] !== text) changes[locale].changed.push({ domain, source, before: previous[domain][source], text });
      }
      for (const source of Object.keys(previous[domain] || {})) if (!Object.hasOwn(next[domain], source)) changes[locale].removed.push({ domain, source });
    }
    for (const context of ['entities', 'entitySources', 'entityContexts', 'contexts', 'rules', 'itemScopes', 'comparisonLabels']) {
      if (JSON.stringify(previous[context]) !== JSON.stringify(next[context])) changes[locale][context] = { before: previous[context] || null, after: next[context] };
    }
  }
  const report = { schema_version: 1, upstream_commit: input.core.upstream_commit,
    source_lock_sha256: hash(await readFile(resolve(root, lockPath))),
    version_lock_sha256: hash(await readFile(resolve(root, 'cn/config/version-lock.json'))),
    previous_package_sha256: previousHashes,
    input_sha256: { game: hash(input.gameBytes), core: hash(input.coreBytes), reviewed: hash(input.reviewedBytes) },
    changes, validation: { ...input.compiled.report, uniqueCoverage: input.core.uniqueCoverage, itemCoverage, regressions } };
  return { report, sha256: hash(json(report)) };
}

export async function acceptTranslationCandidate({ repoRoot = defaultRoot, candidate, review, acknowledgement }) {
  const root = resolve(repoRoot);
  const reviewedReport = await readFile(resolve(review));
  if (hash(reviewedReport) !== acknowledgement) throw new Error('必须确认完整差异审核文件的 SHA-256');
  const fresh = await reviewTranslationCandidate({ repoRoot: root, candidate });
  if (fresh.sha256 !== acknowledgement) throw new Error('审核后来源、正式词典或锁定记录已变化，请重新审核');
  const blocked = fresh.report.validation.regressions.filter(entry => !entry.reviewedException);
  if (blocked.length) throw new Error(`候选存在 ${blocked.length} 条显示回退或必验缺译，不能接受快照`);
  const input = await readCandidate(root, candidate);
  const lock = JSON.parse(await readFile(resolve(root, lockPath)));
  const versionPath = 'cn/config/version-lock.json';
  const version = JSON.parse(await readFile(resolve(root, versionPath)));
  if (hash(input.gameBytes) !== fresh.report.input_sha256.game || hash(input.coreBytes) !== fresh.report.input_sha256.core || hash(input.reviewedBytes) !== fresh.report.input_sha256.reviewed
    || hash(await readFile(resolve(root, lockPath))) !== fresh.report.source_lock_sha256 || hash(await readFile(resolve(root, versionPath))) !== fresh.report.version_lock_sha256) throw new Error('接受期间来源或锁定记录已变化，请重新审核');
  const snapshots = [
    { id: translationInputIds[0], path: `cn/pipeline/sources/translations/snapshots/game-${hash(input.gameBytes)}.json.gz`, contents: input.gameBytes, format: 'gzip-json' },
    { id: translationInputIds[1], path: `cn/pipeline/sources/translations/snapshots/core-${hash(input.coreBytes)}.json.gz`, contents: input.coreBytes, format: 'gzip-json' },
    { id: translationInputIds[2], path: reviewedPath, contents: input.reviewedBytes, format: 'json' },
  ];
  const inputs = snapshots.map(({ id, path, contents, format }) => ({ id, path, sha256: hash(contents), format,
    kind: id === 'translation.reviewed' ? 'CN_SOURCE' : 'NATIVE_SNAPSHOT', stage: 'I18N', language: 'zh-CN,zh-TW',
    provenance: { source: id, upstream_commit: input.core.upstream_commit, reviewed_report_sha256: acknowledgement } }));
  lock.inputs = [...lock.inputs.filter(entry => !translationInputIds.includes(entry.id)), ...inputs];
  version.content_versions.translations = { schema_version: 3, source_ids: translationInputIds, review_sha256: acknowledgement,
    upstream_commit: input.core.upstream_commit, locales: ['zh-CN', 'zh-TW'] };
  const reviewPath = `cn/pipeline/sources/translations/reviews/${acknowledgement}.json.gz`;
  await writeFileTransaction(root, [
    ...snapshots.filter(entry => entry.id !== 'translation.reviewed'),
    { path: reviewPath, contents: gzipSync(reviewedReport, { level: 9 }) },
    { path: lockPath, contents: json(lock) }, { path: versionPath, contents: json(version) },
  ]);
  return { accepted: inputs.map(({ id, path, sha256 }) => ({ id, path, sha256 })), review: reviewPath,
    next: 'node cn/pipeline/generate-content.mjs' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { candidate: { type: 'string' }, output: { type: 'string' }, review: { type: 'string' }, 'ack-sha256': { type: 'string' } } });
  (async () => {
    if (!values.candidate) throw new Error('必须提供 --candidate');
    if (positionals[0] === 'review') {
      if (!values.output) throw new Error('审核必须提供 --output');
      const result = await reviewTranslationCandidate(values);
      await mkdir(dirname(resolve(values.output)), { recursive: true });
      await writeFile(resolve(values.output), json(result.report));
      return { sha256: result.sha256, output: values.output, counts: Object.fromEntries(Object.entries(result.report.changes).map(([locale, changes]) => [locale, Object.fromEntries(Object.entries(changes).map(([kind, rows]) => [kind, rows.length]))])) };
    }
    if (positionals[0] === 'accept') return acceptTranslationCandidate({ ...values, acknowledgement: values['ack-sha256'] });
    throw new Error('用法：update-translations.mjs review|accept --candidate <目录>');
  })().then(result => process.stdout.write(json(result))).catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
}
