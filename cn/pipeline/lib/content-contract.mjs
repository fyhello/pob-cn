import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

const fixedIds = ['dictionary.ninja-poe2.poe2-runtime-gzip', 'override.zh-CN.terms', 'override.zh-CN.glossary'];
const craftingIds = ['upstream.crafting.runes', 'upstream.crafting.essences', 'upstream.crafting.item-mods', 'upstream.crafting.jewel-mods', 'upstream.crafting.item-bases', 'crafting.slot-tag-map', 'crafting.seed.zh-CN'];
const webTranslationDomains = ['items', 'stats', 'tooltip', 'ui', 'terms'];
const required = ['id', 'path', 'stage', 'consumer_id', 'consumer_target', 'consumer_owner', 'field_mapping', 'input_schema', 'output_schema', 'minimum_record_count', 'id_coverage_rule', 'source_ids'];
const safe = path => typeof path === 'string' && path.length > 0 && !isAbsolute(path) && !/^[a-z]:/i.test(path) && !path.includes('\\') && !path.split('/').includes('..');
const requireStage = options => { if (!options?.stage) throw new Error('stage is required'); };

export function validateContentContract(contract, sourceLock, options) {
  requireStage(options);
  if (!contract || !Array.isArray(contract.outputs)) throw new Error('invalid content contract');
  for (const output of contract.outputs) for (const key of required) if (!(key in output)) throw new Error(`contract field missing: ${key}`);
  const outputs = (contract.outputs ?? []).filter(output => output.stage === options.stage);
  if (options.stage === 'M2-2' && outputs.length !== 0) throw new Error('M2-2 has no generated translation output; use M8 web.translation');
  if (options.stage === 'M8' && outputs.length !== 1) throw new Error('M8 must contain exactly one output');
  if (options.stage === 'M2-3' && outputs.length !== 2) throw new Error('M2-3 must contain exactly two crafting outputs');
  if (options.stage === 'M3' && outputs.length !== 6) throw new Error('M3 must contain exactly six web seed outputs');
  const seen = new Set(); const locked = new Set((sourceLock.inputs ?? []).map(input => input.id));
  for (const output of outputs) {
    const m23 = options.stage === 'M2-3';
    const m3 = options.stage === 'M3';
    const m8 = options.stage === 'M8';
    if ((!m23 && !m3 && !m8) || (m23 && !['web.crafting', 'web.crafting-authority-v2'].includes(output.id)) || (m3 && !output.id.startsWith('web.legacy.')) || (m8 && output.id !== 'web.translation')) throw new Error('unexpected contract output for stage');
    if (seen.has(output.path)) throw new Error(`duplicate contract output: ${output.path}`); seen.add(output.path);
    if (!safe(output.path) || !safe(output.consumer_target) || !output.consumer_id || !output.consumer_owner) throw new Error('invalid consumer or output path');
    if (!Number.isInteger(output.minimum_record_count) || output.minimum_record_count <= 0) throw new Error('minimum record count must be positive');
    if (!output.field_mapping || typeof output.field_mapping !== 'object' || !Object.keys(output.field_mapping).length || !output.input_schema || !Object.keys(output.input_schema).length || !output.output_schema || !Object.keys(output.output_schema).length) throw new Error('undefined schema or field mapping');
    if (!output.id_coverage_rule || !['exact_locked_translation_ids_with_allowlist', 'exact_locked_translation_domains_with_allowlist', 'exact_crafting_authority_ids', 'exact_crafting_authority_structure', 'exact_legacy_seed'].includes(output.id_coverage_rule.type)) throw new Error('undefined coverage rule');
    for (const id of output.source_ids) if (!locked.has(id)) throw new Error(`unlocked input id: ${id}`);
    if (m8 && JSON.stringify(output.source_ids) !== JSON.stringify(fixedIds)) throw new Error('M8 source ids must be the three fixed input ids');
    if (m23 && JSON.stringify(output.source_ids) !== JSON.stringify(craftingIds)) throw new Error('M2-3 source ids must be the six crafting input ids');
    if (m3 && (output.source_ids.length !== 1 || !output.source_ids[0].startsWith('legacy.web.'))) throw new Error('M3 source ids must be one approved web seed');
    const dictionary = (sourceLock.inputs ?? []).find(input => input.id === fixedIds[0]);
    const lockedCounts = dictionary?.payload?.top_level_domain_counts;
    if (m8 && lockedCounts !== undefined) {
      const expectedCount = webTranslationDomains.reduce((sum, domain) => sum + lockedCounts[domain], 0);
      const rule = output.id_coverage_rule;
      if (output.minimum_record_count !== expectedCount || rule.type !== 'exact_locked_translation_domains_with_allowlist' || rule.source_id !== fixedIds[0] || JSON.stringify(rule.domains) !== JSON.stringify(webTranslationDomains) || JSON.stringify(rule.expected_counts) !== JSON.stringify(Object.fromEntries(webTranslationDomains.map(domain => [domain, lockedCounts[domain]]))) || !rule.allowlist || webTranslationDomains.some(domain => !Array.isArray(rule.allowlist[domain]))) throw new Error('web translation coverage rule is not reproducible from locked dictionary input');
    }
  }
  return outputs;
}

export async function loadContentContract(repoRoot, options) {
  requireStage(options);
  const contract = JSON.parse(await readFile(resolve(repoRoot, 'cn/config/content-contract.json'), 'utf8'));
  const lock = JSON.parse(await readFile(resolve(repoRoot, 'cn/config/content-source-lock.json'), 'utf8'));
  return validateContentContract(contract, lock, options);
}

export function validateGeneratedOutput(output, contract, lockedInputs, options) {
  requireStage(options);
  const selected = validateContentContract(contract, { inputs: lockedInputs }, options);
  const expected = selected.find(entry => entry.id === output.id && entry.path === output.path);
  if (!expected) throw new Error('generated output is not declared for this stage');
  if (!Number.isInteger(output.record_count) || output.record_count < expected.minimum_record_count) throw new Error('generated output record count is below contract');
  if (JSON.stringify(output.input_ids) !== JSON.stringify(expected.source_ids)) throw new Error('generated output source IDs do not match contract');
  return expected;
}
