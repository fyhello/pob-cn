import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = relative => readFile(new URL(relative, import.meta.url), 'utf8');

test('configuration screen does not present unbound official Config toggles as editable', async () => {
  const config = await source('../../web/src/components/ConfigPanel.vue');
  assert.match(config, /store\.config/);
});

test('skills screen exposes only imported groups and official outputs', async () => {
  const skills = await source('../../web/src/components/SkillsPanel.vue');
  assert.match(skills, /官方核心未提供/);
  assert.match(skills, /store\.socketGroups/);
  for (const unsupportedEntry of ['openGemSelector', 'getDefaultDamageTypes']) {
    assert.doesNotMatch(skills, new RegExp(unsupportedEntry));
  }
  for (const fabricatedDefault of ['?? 150', '|| 150', '|| 30', '|| 50', '|| 8', 'percent: 100']) {
    assert.equal(skills.includes(fabricatedDefault), false, `must not fabricate ${fabricatedDefault}`);
  }
});

test('calculation screen renders unavailable official values instead of numeric fallbacks', async () => {
  const calcs = await source('../../web/src/components/CalcsPanel.vue');
  assert.match(calcs, /官方核心未提供/);
  for (const fabricatedDefault of ['CritMultiplier || 100', 'HitChance || 100', 'TotalSpirit || 100', '>0<']) {
    assert.equal(calcs.includes(fabricatedDefault), false, `must not fabricate ${fabricatedDefault}`);
  }
});
