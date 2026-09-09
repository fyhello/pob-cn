import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

import { translationInputIds as fixedIds } from './native-translations.mjs';
const craftingIds = ['upstream.crafting.runes', 'upstream.crafting.essences', 'upstream.crafting.item-mods', 'upstream.crafting.jewel-mods', 'upstream.crafting.item-bases', 'crafting.slot-tag-map', 'crafting.seed.zh-CN'];
const required = ['id', 'path', 'stage', 'consumer_id', 'consumer_target', 'consumer_owner', 'field_mapping', 'input_schema', 'output_schema', 'minimum_record_count', 'id_coverage_rule', 'source_ids'];
const safe = path => typeof path === 'string' && path.length > 0 && !isAbsolute(path) && !/^[a-z]:/i.test(path) && !path.includes('\\') && !path.split('/').includes('..');
const requireStage = options => { if (!options?.stage) throw new Error('stage is required'); };

export function validateContentContract(contract, sourceLock, options) {
  requireStage(options);
  if (!contract || !Array.isArray(contract.outputs)) throw new Error('invalid content contract');
  for (const output of contract.outputs) for (const key of required) if (!(key in output)) throw new Error(`contract field missing: ${key}`);
  const outputs = (contract.outputs ?? []).filter(output => output.stage === options.stage);
  if (options.stage === 'M2-2' && outputs.length !== 0) throw new Error('M2-2 has no generated translation output; use M8 web.translation');
  if (options.stage === 'M8' && outputs.length !== 3) throw new Error('M8 必须包含简中、繁中及覆盖报告三个产物');
  if (options.stage === 'M2-3' && outputs.length !== 2) throw new Error('M2-3 must contain exactly two crafting outputs');
  if (options.stage === 'M3' && outputs.length !== 6) throw new Error('M3 must contain exactly six web seed outputs');
  const seen = new Set(); const locked = new Set((sourceLock.inputs ?? []).map(input => input.id));
  for (const output of outputs) {
    const m23 = options.stage === 'M2-3';
    const m3 = options.stage === 'M3';
    const m8 = options.stage === 'M8';
    if ((!m23 && !m3 && !m8) || (m23 && !['web.crafting', 'web.crafting-authority-v2'].includes(output.id)) || (m3 && !output.id.startsWith('web.legacy.')) || (m8 && !['web.translation', 'web.translation.zh-TW', 'web.translation-report'].includes(output.id))) throw new Error('unexpected contract output for stage');
    if (seen.has(output.path)) throw new Error(`duplicate contract output: ${output.path}`); seen.add(output.path);
    if (!safe(output.path) || !safe(output.consumer_target) || !output.consumer_id || !output.consumer_owner) throw new Error('invalid consumer or output path');
    if (!Number.isInteger(output.minimum_record_count) || output.minimum_record_count <= 0) throw new Error('minimum record count must be positive');
    if (!output.field_mapping || typeof output.field_mapping !== 'object' || !Object.keys(output.field_mapping).length || !output.input_schema || !Object.keys(output.input_schema).length || !output.output_schema || !Object.keys(output.output_schema).length) throw new Error('undefined schema or field mapping');
    if (!output.id_coverage_rule || !['native_snapshot_compilation', 'exact_crafting_authority_ids', 'exact_crafting_authority_structure', 'exact_legacy_seed'].includes(output.id_coverage_rule.type)) throw new Error('undefined coverage rule');
    for (const id of output.source_ids) if (!locked.has(id)) throw new Error(`unlocked input id: ${id}`);
    if (m8 && JSON.stringify(output.source_ids) !== JSON.stringify(fixedIds)) throw new Error('M8 source ids must be the three fixed input ids');
    if (m23 && JSON.stringify(output.source_ids) !== JSON.stringify(craftingIds)) throw new Error('M2-3 source ids must be the six crafting input ids');
    if (m3 && (output.source_ids.length !== 1 || !output.source_ids[0].startsWith('legacy.web.'))) throw new Error('M3 source ids must be one approved web seed');
    if (m8 && output.id_coverage_rule.type !== 'native_snapshot_compilation') throw new Error('翻译覆盖必须从锁定原生快照编译得出');
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
