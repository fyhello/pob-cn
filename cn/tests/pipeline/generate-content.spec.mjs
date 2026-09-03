import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, readdir, rm, mkdtemp, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { loadContentContract } from '../../pipeline/lib/content-contract.mjs';
import { generateContent } from '../../pipeline/generate-content.mjs';
import { loadPipelineOwnership, assertGeneratedOnlyBusinessChanges } from '../../pipeline/lib/ownership.mjs';
import { diffBusinessSnapshots, formatBusinessSnapshotDiff, snapshotBusinessTree } from '../../pipeline/lib/repository-snapshot.mjs';
import { assertManifestComplete, assertManifestCompleteFromRepo, validateManifest } from '../../pipeline/lib/manifest-validator.mjs';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const fixtureFiles = [
  'cn/config/content-source-lock.json', 'cn/config/content-contract.json', 'cn/config/version-lock.json',
  'cn/config/pipeline-ownership.json', 'cn/config/ownership.yml', 'cn/config/upstream-content-snapshot.json',
  'cn/pipeline/sources/dictionary/ninja-poe2/poe2.json.gz', 'cn/pipeline/overrides/zh-CN/terms.json',
  'cn/pipeline/overrides/zh-CN/glossary.json',
  'cn/pipeline/sources/crafting/slot-tag-map.zh-CN.json', 'cn/pipeline/sources/crafting/seed.zh-CN.json',
  'cn/pipeline/sources/web/legacy-seed/affixes.json', 'cn/pipeline/sources/web/legacy-seed/bases.json',
  'cn/pipeline/sources/web/legacy-seed/gems.json', 'cn/pipeline/sources/web/legacy-seed/tree_0_5.json',
  'cn/pipeline/sources/web/legacy-seed/uniques.json', 'cn/pipeline/sources/web/legacy-seed/craftingData.json',
  'src/Data/ModRunes.lua', 'src/Data/Essence.lua', 'src/Data/ModItem.lua', 'src/Data/ModJewel.lua',
  'docs/architecture/compatibility/dictionary/2af6460f94ef0fc6ef9826e7ca8b06f485013b4828993e0480391b9138bcc779.md',
];

async function makeFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'pob-cn-m2-2-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const inputs = [...fixtureFiles, ...(await readdir(join(repoRoot, 'src/Data/Bases'))).filter(name => name.endsWith('.lua')).map(name => `src/Data/Bases/${name}`)];
  for (const path of inputs) {
    const target = join(root, path);
    await mkdir(join(target, '..'), { recursive: true });
    await copyFile(join(repoRoot, path), target);
  }
  return root;
}

test('writes only the complete M2-2 contract set and is byte-stable on the second run', async t => {
  const fixtureRoot = await makeFixture(t);
  const ownership = await loadPipelineOwnership(fixtureRoot);
  const contract = await loadContentContract(fixtureRoot, { stage: 'M2-2' });
  const before = await snapshotBusinessTree(fixtureRoot, ownership);
  const firstResult = await generateContent(fixtureRoot);
  const first = await snapshotBusinessTree(fixtureRoot, ownership);
  const firstDiff = diffBusinessSnapshots(before, first);
  const craftingContract = await loadContentContract(fixtureRoot, { stage: 'M2-3' });
  const webTranslationContract = await loadContentContract(fixtureRoot, { stage: 'M8' });
  const webContract = await loadContentContract(fixtureRoot, { stage: 'M3' });
  const allGenerated = [...contract, ...webTranslationContract, ...craftingContract, ...webContract, { id: 'manifest', path: 'cn/generated/manifest.json', stage: 'M3' }].map(value => ({ ...value, stage: 'M3' }));
  assert.doesNotThrow(() => assertGeneratedOnlyBusinessChanges(firstDiff, ownership, { outputs: allGenerated }, { stage: 'M3' }));
  assert.deepEqual(firstResult.written_paths.sort(), [
    'cn/generated/manifest.json', 'cn/generated/web-data/affixes.json',
    'cn/generated/web-data/bases.json', 'cn/generated/web-data/crafting-authority-v2.json', 'cn/generated/web-data/crafting-legacy.json', 'cn/generated/web-data/crafting.json',
    'cn/generated/web-data/gems.json', 'cn/generated/web-data/translations.json', 'cn/generated/web-data/tree_0_5.json', 'cn/generated/web-data/uniques.json',
  ]);
  const secondResult = await generateContent(fixtureRoot);
  const second = await snapshotBusinessTree(fixtureRoot, ownership);
  assert.equal(formatBusinessSnapshotDiff(diffBusinessSnapshots(first, second)), '');
  assert.deepEqual(secondResult.written_paths.sort(), firstResult.written_paths.sort());
});

test('emits a complete manifest with locked crafting provenance and no unreviewed translation gap', async t => {
  const fixtureRoot = await makeFixture(t);
  await generateContent(fixtureRoot);
  const manifest = JSON.parse(await readFile(join(fixtureRoot, 'cn/generated/manifest.json'), 'utf8'));
  assert.equal(manifest.completeness, 'complete');
  assert.equal(manifest.outputs.length, 9);
  assert.equal(manifest.outputs.find(output => output.id === 'web.crafting-authority-v2').record_count > 2800, true);
  assert.equal(manifest.outputs[0].id, 'web.translation');
  assert.equal(manifest.untranslated.count, 0);
  assert.doesNotThrow(() => validateManifest(manifest));
  assert.doesNotThrow(() => assertManifestComplete(manifest, 'cn/generated/manifest.json'));
  await assert.doesNotReject(assertManifestCompleteFromRepo(fixtureRoot));
});

test('rejects an untranslated override that is outside the reviewed allowlist', async t => {
  const fixtureRoot = await makeFixture(t);
  const overridePath = join(fixtureRoot, 'cn/pipeline/overrides/zh-CN/terms.json');
  const dictionary = JSON.parse(await readFile(join(fixtureRoot, 'cn/config/content-source-lock.json'), 'utf8'));
  const firstId = 'Rewarded an Exile\'s Hood Microtransaction!\r\nPress K to Equip';
  const override = JSON.parse(await readFile(overridePath, 'utf8'));
  override.entries[firstId] = '';
  const contents = `${JSON.stringify(override, null, 2)}\n`;
  await writeFile(overridePath, contents);
  dictionary.inputs.find(input => input.id === 'override.zh-CN.terms').sha256 = createHash('sha256').update(contents).digest('hex');
  await writeFile(join(fixtureRoot, 'cn/config/content-source-lock.json'), `${JSON.stringify(dictionary, null, 2)}\n`);
  await assert.rejects(generateContent(fixtureRoot), /untranslated|override translation is invalid/);
});
