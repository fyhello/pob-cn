import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { loadNativeTranslationSources, translationInputIds as translationIds, translationOutputs, auditTranslationCoverage } from './lib/native-translations.mjs';
import { writeFileTransaction } from './lib/file-transaction.mjs';
import { loadContentContract, validateGeneratedOutput } from './lib/content-contract.mjs';
import { assertManifestComplete, validateManifest } from './lib/manifest-validator.mjs';
import { assertGeneratedPath, loadPipelineOwnership } from './lib/ownership.mjs';
import { loadLockedInputs } from './lib/source-lock.mjs';
import { buildCraftingAuthorityV2, loadAndValidateCraftingSeed } from './lib/crafting-authority.mjs';

const command = 'node cn/pipeline/generate-content.mjs';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const craftingIds = ['upstream.crafting.runes', 'upstream.crafting.essences', 'upstream.crafting.item-mods', 'upstream.crafting.jewel-mods', 'upstream.crafting.item-bases', 'crafting.slot-tag-map', 'crafting.seed.zh-CN'];
const craftingPath = 'cn/generated/web-data/crafting.json'; const craftingAuthorityPath = 'cn/generated/web-data/crafting-authority-v2.json'; const manifestPath = 'cn/generated/manifest.json';

export async function generateContent(repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')) {
  const root = resolve(repoRoot); const ownership = await loadPipelineOwnership(root);
  const translationInputs = await loadLockedInputs(root, { stage: 'I18N' }); const craftingInputs = await loadLockedInputs(root, { stage: 'M2-3' });
  const webInputs = await loadLockedInputs(root, { stage: 'M3' });
  const webTranslationContract = await loadContentContract(root, { stage: 'M8' }); const craftingContract = await loadContentContract(root, { stage: 'M2-3' }); const webContract = await loadContentContract(root, { stage: 'M3' }); const contracts = [...webTranslationContract, ...craftingContract, ...webContract];
  const native = await loadNativeTranslationSources(root, translationInputs);
  const core = JSON.parse(gunzipSync(await readFile(translationInputs.find(input => input.id === 'translation.core').absolute_path)));
  native.report.schema_version = 1;
  native.report.coverage = auditTranslationCoverage(native.packages, core);
  const translationRecords = Object.entries(translationOutputs).map(([locale, path]) => ({
    id: locale === 'zh-CN' ? 'web.translation' : 'web.translation.zh-TW', path, input_ids: translationIds,
    record_count: native.report[locale].entries, contents: JSON.stringify(native.packages[locale], null, 2) + '\n',
  }));
  translationRecords.push({ id: 'web.translation-report', path: 'cn/generated/web-data/translations-report.json',
    input_ids: translationIds, record_count: core.rows.length, contents: JSON.stringify(native.report, null, 2) + '\n' });
  for (const output of translationRecords) {
    const contract = validateGeneratedOutput(output, { outputs: webTranslationContract }, translationInputs, { stage: 'M8' });
    const rule = contract.id_coverage_rule;
    if (rule.locale && native.report[rule.locale].verifiedStatForms < rule.minimum_verified_stat_forms) throw new Error('通过保真校验的词缀格式低于合同门槛');
    output.sha256 = sha256(output.contents);
  }
  const { seed, authority, slotTagMap } = await loadAndValidateCraftingSeed(root, craftingInputs);
  const crafting = { schema_version: 1, runes: [...seed.runes].sort((a, b) => a.id.localeCompare(b.id)), essences: [...seed.essences].sort((a, b) => a.id.localeCompare(b.id)), slotTagMap: [...seed.slotTagMap].sort((a, b) => a.id.localeCompare(b.id)) }; const craftingJson = `${JSON.stringify(crafting, null, 2)}\n`; const craftingCount = seed.runes.length + seed.essences.length + seed.slotTagMap.length;
  validateGeneratedOutput({ id: 'web.crafting', path: craftingPath, record_count: craftingCount, input_ids: craftingIds }, { outputs: craftingContract }, craftingInputs, { stage: 'M2-3' });
  const craftingAuthority = buildCraftingAuthorityV2(authority); const craftingAuthorityJson = `${JSON.stringify(craftingAuthority, null, 2)}\n`; const craftingAuthorityCount = authority.itemBases.length + authority.itemMods.length + authority.runes.length + authority.essences.length;
  validateGeneratedOutput({ id: 'web.crafting-authority-v2', path: craftingAuthorityPath, record_count: craftingAuthorityCount, input_ids: craftingIds }, { outputs: craftingContract }, craftingInputs, { stage: 'M2-3' });
  const webOutputs = [];
  for (const input of webInputs) {
    const contract = webContract.find(value => value.source_ids[0] === input.id);
    const payload = JSON.parse(await readFile(input.absolute_path, 'utf8'));
    const contents = `${JSON.stringify(payload, null, 2)}\n`;
    const recordCount = Array.isArray(payload) ? payload.length : Object.keys(payload).length;
    validateGeneratedOutput({ id: contract.id, path: contract.path, record_count: recordCount, input_ids: [input.id] }, { outputs: webContract }, webInputs, { stage: 'M3' });
    webOutputs.push({ id: contract.id, path: contract.path, sha256: sha256(contents), input_ids: [input.id], record_count: recordCount, contents });
  }
  const version = JSON.parse(await readFile(resolve(root, 'cn/config/version-lock.json'), 'utf8'));
  const manifest = { schema_version: 1, completeness: 'complete', generator: { command, version: 7 }, upstream: { commit: version.upstream.commit }, dictionary: { kind: 'native-clients', schema_version: 3, game_sha256: translationInputs.find(input => input.id === 'translation.game').sha256, core_sha256: translationInputs.find(input => input.id === 'translation.core').sha256, reviewed_sha256: translationInputs.find(input => input.id === 'translation.reviewed').sha256, schema_sha256: sha256(await readFile(resolve(root, 'cn/pipeline/schemas/game-text-tables.json'))) }, inputs: [...translationInputs, ...craftingInputs, ...webInputs].map(({ id, path, sha256 }) => ({ id, path, sha256 })), outputs: [...translationRecords.map(({ contents, ...output }) => output), { id: 'web.crafting', path: craftingPath, sha256: sha256(craftingJson), input_ids: craftingIds, record_count: craftingCount }, { id: 'web.crafting-authority-v2', path: craftingAuthorityPath, sha256: sha256(craftingAuthorityJson), input_ids: craftingIds, record_count: craftingAuthorityCount }, ...webOutputs.map(({ contents, ...output }) => output)], untranslated: { count: native.report.coverage['zh-CN'].missing.length, allowlist: [], report_path: 'cn/generated/web-data/translations-report.json' }, crafting: { seed_sha256: craftingInputs.find(value => value.id === 'crafting.seed.zh-CN').sha256, slot_tag_map_sha256: craftingInputs.find(value => value.id === 'crafting.slot-tag-map').sha256, item_mods_sha256: craftingInputs.find(value => value.id === 'upstream.crafting.item-mods').sha256, jewel_mods_sha256: craftingInputs.find(value => value.id === 'upstream.crafting.jewel-mods').sha256, item_bases_sha256: craftingInputs.find(value => value.id === 'upstream.crafting.item-bases').sha256, reviewed_at_utc_plus_8: seed.reviewed_at_utc_plus_8, coverage: { runes: { authority: authority.runes.length, seed: seed.runes.length, missing: 0, unknown: 0 }, essences: { authority: authority.essences.length, seed: seed.essences.length, missing: 0, unknown: 0 }, itemMods: { authority: authority.itemMods.length }, itemBases: { authority: authority.itemBases.length }, slotTagMap: { authority: slotTagMap.entries.length, seed: seed.slotTagMap.length, missing: 0, unknown: 0 } } } };
  validateManifest(manifest); assertManifestComplete(manifest, manifestPath);
  const outputs = [...translationRecords, { path: craftingPath, contents: craftingJson }, { path: craftingAuthorityPath, contents: craftingAuthorityJson },
    ...webOutputs, { path: manifestPath, contents: JSON.stringify(manifest, null, 2) + '\n' }];
  for (const output of outputs) {
    assertGeneratedPath(output.path, ownership);
    if (output.path !== manifestPath && !contracts.some(contract => contract.path === output.path)) throw new Error('生成目标不在合同中：' + output.path);
  }
  await writeFileTransaction(root, outputs);
  return { manifest, written_paths: outputs.map(output => output.path) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) generateContent().catch(error => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
