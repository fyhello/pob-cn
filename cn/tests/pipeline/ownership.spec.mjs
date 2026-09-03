import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { assertGeneratedOnlyBusinessChanges, assertGeneratedPath, loadPipelineOwnership } from '../../pipeline/lib/ownership.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const writer = 'node cn/pipeline/generate-content.mjs';
const rules = [
  { output: 'cn/generated/web-data/**', producer: writer },
  { output: 'cn/generated/manifest.json', producer: writer },
];
const localExcludes = ['.worktrees/**', 'Settings.xml', '**/imgui.ini', 'Builds/**', 'node_modules/**', 'tools/last_imported_build.xml', '**/*.cfg', '**/*.exe', '**/*.dll', '.git/**', '**/*.tmp', '**/*.temp', '**/.DS_Store'];
async function makeRepo() {
  const root = await mkdtemp(join(tmpdir(), 'pob-cn-ownership-'));
  const yaml = 'not parsed by this module\n';
  await mkdir(join(root, 'cn/config'), { recursive: true }); await writeFile(join(root, 'cn/config/ownership.yml'), yaml);
  await writeFile(join(root, 'cn/config/pipeline-ownership.json'), `${JSON.stringify({ schema_version: 1, ownership_yml_path: 'cn/config/ownership.yml', ownership_yml_sha256: hash(yaml), generated_rules: rules, local_excludes: localExcludes })}\n`);
  return root;
}
const contract = { outputs: [{ id: 'web.translation', path: 'cn/generated/web-data/translations.json', stage: 'M8' }, { id: 'manifest', path: 'cn/generated/manifest.json', stage: 'M8' }] };

test('loads the narrow ownership projection without parsing YAML', async t => {
  const root = await makeRepo(); t.after(() => rm(root, { recursive: true, force: true }));
  const ownership = await loadPipelineOwnership(root);
  assert.deepEqual(ownership.generated_rules, rules);
  assert.equal(assertGeneratedPath('cn/generated/web-data/translations.json', ownership).producer, writer);
});

test('rejects ownership YAML hash/path, producer and generated-rule projection errors', async t => {
  const root = await makeRepo(); t.after(() => rm(root, { recursive: true, force: true }));
  const configPath = join(root, 'cn/config/pipeline-ownership.json');
  const original = JSON.parse(await (await import('node:fs/promises')).readFile(configPath));
  for (const mutate of [v => { v.ownership_yml_path = '/abs.yml'; }, v => { v.ownership_yml_sha256 = '0'.repeat(64); }, v => { v.generated_rules[0].producer = 'other'; }, v => { v.generated_rules.pop(); }, v => { v.generated_rules.push({ output: 'cn/generated/extra/**', producer: writer }); }]) {
    const value = structuredClone(original); mutate(value); await writeFile(configPath, JSON.stringify(value));
    await assert.rejects(loadPipelineOwnership(root), /ownership|producer|projection|path/);
  }
});

test('allows only the M8 contract generated paths and rejects business-tree overreach', async t => {
  const root = await makeRepo(); t.after(() => rm(root, { recursive: true, force: true }));
  const ownership = await loadPipelineOwnership(root);
  assert.doesNotThrow(() => assertGeneratedOnlyBusinessChanges({ added: ['cn/generated/web-data/translations.json', 'cn/generated/manifest.json'], modified: [], deleted: [], untracked: [] }, ownership, contract, { stage: 'M8' }));
  for (const path of ['src/Modules/Main.lua', 'cn/generated/lua-i18n/translations.lua', 'cn/pipeline/input.json']) {
    assert.throws(() => assertGeneratedOnlyBusinessChanges({ added: [path], modified: [], deleted: [], untracked: [] }, ownership, contract, { stage: 'M8' }), /generated|contract|business/);
  }
  assert.throws(() => assertGeneratedOnlyBusinessChanges({ added: [], modified: [], deleted: [], untracked: [] }, ownership, contract, {}), /stage is required/);
});
