import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadContentContract, validateContentContract, validateGeneratedOutput } from '../../pipeline/lib/content-contract.mjs';

const ids = ['dictionary.ninja-poe2.poe2-runtime-gzip', 'override.zh-CN.terms', 'override.zh-CN.glossary'];
const sourceLock = { inputs: ids.map(id => ({ id, stage: 'M2-2' })) };
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const validContract = () => ({ schema_version: 1, outputs: [{ id: 'web.translation', path: 'cn/generated/web-data/translations.json', stage: 'M8', consumer_id: 'web.import-display-localizer', consumer_target: 'cn/web/src/utils/webTranslation.ts', consumer_owner: 'M8', field_mapping: { translation_id: { target: 'JSON object key' }, zh_CN: { target: 'JSON object value' } }, input_schema: { dictionary: 'gzip-json', overrides: 'json' }, output_schema: { format: 'json-object' }, minimum_record_count: 1, id_coverage_rule: { type: 'exact_locked_translation_domains_with_allowlist', source_id: ids[0], domains: ['items', 'stats', 'tooltip', 'ui', 'terms'], expected_counts: { items: 1, stats: 1, tooltip: 1, ui: 1, terms: 1 }, allowlist: { items: [], stats: [], tooltip: [], ui: [], terms: [] } }, source_ids: ids }] });

test('rejects a contract output whose source input is not locked', () => {
  const contract = validContract(); contract.outputs[0].source_ids = [ids[0], 'unlocked.input'];
  assert.throws(() => validateContentContract(contract, sourceLock, { stage: 'M8' }), /unlocked input id/);
});

test('requires every common contract field and only web.translation for M8', () => {
  const required = ['id', 'path', 'stage', 'consumer_id', 'consumer_target', 'consumer_owner', 'field_mapping', 'input_schema', 'output_schema', 'minimum_record_count', 'id_coverage_rule', 'source_ids'];
  for (const field of required) { const contract = validContract(); delete contract.outputs[0][field]; assert.throws(() => validateContentContract(contract, sourceLock, { stage: 'M8' }), new RegExp(field)); }
  const extra = validContract(); extra.outputs.push({ ...extra.outputs[0], id: 'crafting.future', path: 'cn/generated/web-data/future.json' });
  assert.throws(() => validateContentContract(extra, sourceLock, { stage: 'M8' }), /web.translation|M8/);
});

test('rejects duplicate, invalid consumer/output, nonpositive counts and undefined schemas', () => {
  for (const mutate of [v => v.outputs.push(structuredClone(v.outputs[0])), v => { v.outputs[0].consumer_target = '../escape.lua'; }, v => { v.outputs[0].consumer_owner = ''; }, v => { v.outputs[0].minimum_record_count = 0; }, v => { v.outputs[0].input_schema = {}; }, v => { v.outputs[0].id_coverage_rule = { type: '*' }; }]) {
    const contract = validContract(); mutate(contract); assert.throws(() => validateContentContract(contract, sourceLock, { stage: 'M8' }));
  }
});

test('validates generated output against the selected stage and exact source IDs', () => {
  const contract = validContract(); validateContentContract(contract, sourceLock, { stage: 'M8' });
  assert.doesNotThrow(() => validateGeneratedOutput({ id: 'web.translation', path: 'cn/generated/web-data/translations.json', record_count: 1, input_ids: ids }, contract, sourceLock.inputs, { stage: 'M8' }));
  assert.throws(() => validateGeneratedOutput({ id: 'web.translation', path: 'cn/generated/web-data/translations.json', record_count: 0, input_ids: ids }, contract, sourceLock.inputs, { stage: 'M8' }), /record count/);
});

test('requires stage for loading and validation', async () => {
  assert.throws(() => validateContentContract(validContract(), sourceLock, {}), /stage is required/);
  await assert.rejects(loadContentContract(process.cwd(), {}), /stage is required/);
});

test('checked-in schema and contract load as the single M8 web.translation contract', async () => {
  const schema = JSON.parse(await readFile(new URL('../../pipeline/schemas/content-contract.schema.json', import.meta.url)));
  assert.deepEqual(schema.properties.outputs.items.required, ['id', 'path', 'stage', 'consumer_id', 'consumer_target', 'consumer_owner', 'field_mapping', 'input_schema', 'output_schema', 'minimum_record_count', 'id_coverage_rule', 'source_ids']);
  assert.deepEqual(schema.properties.outputs.items.properties.stage.enum, ['M2-2', 'M2-3', 'M3', 'M8']);
  const outputs = await loadContentContract(repoRoot, { stage: 'M8' });
  assert.deepEqual(outputs.map(output => output.id), ['web.translation']);
  assert.equal(outputs[0].path, 'cn/generated/web-data/translations.json');
});

test('checked-in M8 web translation contract consumes every locked dictionary domain', async () => {
  const outputs = await loadContentContract(repoRoot, { stage: 'M8' });
  assert.deepEqual(outputs.map(output => output.id), ['web.translation']);
  assert.equal(outputs[0].path, 'cn/generated/web-data/translations.json');
  assert.equal(outputs[0].consumer_target, 'cn/web/src/utils/webTranslation.ts');
  assert.equal(outputs[0].minimum_record_count, 70227);
  assert.deepEqual(outputs[0].source_ids, ids);
  assert.deepEqual(outputs[0].id_coverage_rule, {
    type: 'exact_locked_translation_domains_with_allowlist', source_id: ids[0],
    domains: ['items', 'stats', 'tooltip', 'ui', 'terms'],
    expected_counts: { items: 13609, stats: 29358, tooltip: 2592, ui: 499, terms: 24169 },
    allowlist: { items: [], stats: [], tooltip: [], ui: [], terms: [] },
  });
});
