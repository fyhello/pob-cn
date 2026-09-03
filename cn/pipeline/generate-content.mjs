import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { loadContentContract, validateGeneratedOutput } from './lib/content-contract.mjs';
import { assertManifestComplete, validateManifest } from './lib/manifest-validator.mjs';
import { assertGeneratedPath, loadPipelineOwnership } from './lib/ownership.mjs';
import { loadLockedInputs } from './lib/source-lock.mjs';
import { buildCraftingAuthorityV2, loadAndValidateCraftingSeed } from './lib/crafting-authority.mjs';

const command = 'node cn/pipeline/generate-content.mjs';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const translationIds = ['dictionary.ninja-poe2.poe2-runtime-gzip', 'override.zh-CN.terms', 'override.zh-CN.glossary'];
const webTranslationDomains = ['items', 'stats', 'tooltip', 'ui', 'terms'];
const craftingIds = ['upstream.crafting.runes', 'upstream.crafting.essences', 'upstream.crafting.item-mods', 'upstream.crafting.jewel-mods', 'upstream.crafting.item-bases', 'crafting.slot-tag-map', 'crafting.seed.zh-CN'];
const webTranslationPath = 'cn/generated/web-data/translations.json'; const craftingPath = 'cn/generated/web-data/crafting.json'; const craftingAuthorityPath = 'cn/generated/web-data/crafting-authority-v2.json'; const manifestPath = 'cn/generated/manifest.json';

function parseOverride(contents, id) { const value = JSON.parse(contents); if (value.schema_version !== 1 || value.source_id !== id || !value.entries) throw new Error(`invalid override: ${id}`); return value.entries; }
function collectDomain(dictionary, domain, overrides, allowlist) { const source = dictionary[domain] ?? {}; const values = new Map(); const untranslated = []; for (const [id, entry] of Object.entries(source)) { const text = overrides?.[id] ?? entry?.['zh-CN'] ?? entry?.translation; if (!text?.trim()) { if (!allowlist.includes(id)) untranslated.push(id); } else values.set(id, text); } for (const [id, text] of Object.entries(overrides ?? {})) { if (Object.hasOwn(source, id)) continue; if (!text?.trim()) { if (!allowlist.includes(id)) untranslated.push(id); } else values.set(id, text); } if (untranslated.length) throw new Error(`untranslated locked ${domain} terms not in reviewed allowlist: ${untranslated.join(', ')}`); return { values, untranslated }; }
function collectWebTranslations(dictionary, terms, glossary, allowlists) { const domains = {}; const untranslated = []; const overrides = { ...terms, ...glossary }; for (const domain of webTranslationDomains) { const result = collectDomain(dictionary, domain, overrides, allowlists[domain]); domains[domain] = result.values; untranslated.push(...result.untranslated.map(id => `${domain}:${id}`)); } return { domains, untranslated }; }
function serializeWebTranslations(domains) { return `${JSON.stringify({ schema_version: 2, ...Object.fromEntries(webTranslationDomains.map(domain => [domain, Object.fromEntries([...domains[domain].entries()].sort(([a], [b]) => a.localeCompare(b)))])) }, null, 2)}\n`; }
async function write(root, path, contents, ownership, contracts) { assertGeneratedPath(path, ownership); if (path !== manifestPath && !contracts.some(contract => contract.path === path)) throw new Error(`write target is not a contract output: ${path}`); await mkdir(dirname(resolve(root, path)), { recursive: true }); await writeFile(resolve(root, path), contents); }

export async function generateContent(repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')) {
  const root = resolve(repoRoot); const ownership = await loadPipelineOwnership(root);
  const translationInputs = await loadLockedInputs(root, { stage: 'M2-2' }); const craftingInputs = await loadLockedInputs(root, { stage: 'M2-3' });
  const webInputs = await loadLockedInputs(root, { stage: 'M3' });
  const webTranslationContract = await loadContentContract(root, { stage: 'M8' }); const craftingContract = await loadContentContract(root, { stage: 'M2-3' }); const webContract = await loadContentContract(root, { stage: 'M3' }); const contracts = [...webTranslationContract, ...craftingContract, ...webContract];
  const byId = new Map(translationInputs.map(value => [value.id, value])); const dictionary = byId.get(translationIds[0]);
  const dictionaryPayload = JSON.parse(gunzipSync(await readFile(dictionary.absolute_path)));
  const terms = parseOverride(await readFile(byId.get(translationIds[1]).absolute_path, 'utf8'), translationIds[1]); const glossary = parseOverride(await readFile(byId.get(translationIds[2]).absolute_path, 'utf8'), translationIds[2]);
  const webTranslations = collectWebTranslations(dictionaryPayload, terms, glossary, webTranslationContract[0].id_coverage_rule.allowlist);
  const webTranslationCount = webTranslationDomains.reduce((sum, domain) => sum + webTranslations.domains[domain].size, 0);
  if (webTranslationCount < webTranslationContract[0].id_coverage_rule.domains.reduce((sum, domain) => sum + webTranslationContract[0].id_coverage_rule.expected_counts[domain], 0)) throw new Error('web translation coverage is below the locked dictionary minimum');
  const webTranslationJson = serializeWebTranslations(webTranslations.domains); validateGeneratedOutput({ id: 'web.translation', path: webTranslationPath, record_count: webTranslationCount, input_ids: translationIds }, { outputs: webTranslationContract }, translationInputs, { stage: 'M8' });
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
  await write(root, webTranslationPath, webTranslationJson, ownership, contracts); await write(root, craftingPath, craftingJson, ownership, contracts); await write(root, craftingAuthorityPath, craftingAuthorityJson, ownership, contracts);
  for (const output of webOutputs) await write(root, output.path, output.contents, ownership, contracts);
  const version = JSON.parse(await readFile(resolve(root, 'cn/config/version-lock.json'), 'utf8'));
  const manifest = { schema_version: 1, completeness: 'complete', generator: { command, version: 6 }, upstream: { commit: version.upstream.commit }, dictionary: { gzip_sha256: dictionary.sha256, payload_sha256: dictionary.payload.uncompressed_sha256, schema_path: dictionary.schema.path, schema_sha256: dictionary.schema.sha256, schema_version: dictionary.schema.schema_version }, inputs: [...translationInputs, ...craftingInputs, ...webInputs].map(({ id, path, sha256 }) => ({ id, path, sha256 })), outputs: [{ id: 'web.translation', path: webTranslationPath, sha256: sha256(webTranslationJson), input_ids: translationIds, record_count: webTranslationCount }, { id: 'web.crafting', path: craftingPath, sha256: sha256(craftingJson), input_ids: craftingIds, record_count: craftingCount }, { id: 'web.crafting-authority-v2', path: craftingAuthorityPath, sha256: sha256(craftingAuthorityJson), input_ids: craftingIds, record_count: craftingAuthorityCount }, ...webOutputs.map(({ contents, ...output }) => output)], untranslated: { count: webTranslations.untranslated.length, allowlist: webTranslationContract[0].id_coverage_rule.allowlist }, crafting: { seed_sha256: craftingInputs.find(value => value.id === 'crafting.seed.zh-CN').sha256, slot_tag_map_sha256: craftingInputs.find(value => value.id === 'crafting.slot-tag-map').sha256, item_mods_sha256: craftingInputs.find(value => value.id === 'upstream.crafting.item-mods').sha256, jewel_mods_sha256: craftingInputs.find(value => value.id === 'upstream.crafting.jewel-mods').sha256, item_bases_sha256: craftingInputs.find(value => value.id === 'upstream.crafting.item-bases').sha256, reviewed_at_utc_plus_8: seed.reviewed_at_utc_plus_8, coverage: { runes: { authority: authority.runes.length, seed: seed.runes.length, missing: 0, unknown: 0 }, essences: { authority: authority.essences.length, seed: seed.essences.length, missing: 0, unknown: 0 }, itemMods: { authority: authority.itemMods.length }, itemBases: { authority: authority.itemBases.length }, slotTagMap: { authority: slotTagMap.entries.length, seed: seed.slotTagMap.length, missing: 0, unknown: 0 } } } };
  validateManifest(manifest); assertManifestComplete(manifest, manifestPath); await write(root, manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, ownership, contracts); return { manifest, written_paths: [webTranslationPath, craftingPath, craftingAuthorityPath, ...webOutputs.map(output => output.path), manifestPath] };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) generateContent().catch(error => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
