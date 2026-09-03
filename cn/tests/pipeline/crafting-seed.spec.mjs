import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { buildCraftingAuthority, validateCraftingSeed } from '../../pipeline/lib/crafting-authority.mjs';
import { loadLockedInputs } from '../../pipeline/lib/source-lock.mjs';

const repoRoot = resolve(new URL('../../..', import.meta.url).pathname.slice(1));

test('rejects crafting data without a reviewed seed', () => {
  assert.throws(() => validateCraftingSeed({ schema_version: 1 }), /crafting seed missing/);
});

test('requires seed identifiers to match locked authority', () => {
  const lockedInputs = [
    { id: 'upstream.crafting.runes', path: 'src/Data/ModRunes.lua', sha256: 'a'.repeat(64) },
    { id: 'upstream.crafting.essences', path: 'src/Data/Essence.lua', sha256: 'b'.repeat(64) },
    { id: 'upstream.crafting.item-mods', path: 'src/Data/ModItem.lua', sha256: 'c'.repeat(64) },
    { id: 'upstream.crafting.jewel-mods', path: 'src/Data/ModJewel.lua', sha256: 'f'.repeat(64) },
    { id: 'upstream.crafting.item-bases', path: 'src/Data/Bases', sha256: 'd'.repeat(64), collection_files: [{ path: 'src/Data/Bases/test.lua', sha256: 'e'.repeat(64) }] },
  ];
  const contents = {
    'upstream.crafting.runes': '\t["Rune"] = {',
    'upstream.crafting.essences': '\t["Essence"] = { name = "Essence of Testing", type = "Life", tierLevel = 1, mods = { ["Ring"] = "Life1", }, }',
    'upstream.crafting.item-mods': '\t["Life1"] = { type = "Prefix", "+(1-2) to maximum Life", statOrder = { 1 }, level = 1, group = "Life", weightKey = { "ring" }, weightVal = { 1 }, }',
    'upstream.crafting.jewel-mods': '\t["JewelLife1"] = { type = "Prefix", "+(3-5) to maximum Life", statOrder = { 1 }, level = 1, group = "JewelLife", weightKey = { "jewel" }, weightVal = { 1 }, }',
    'upstream.crafting.item-bases': 'itemBases["Test Ring"] = { type = "Ring", tags = { ring = true, default = true, }, req = { level = 1, }, }\nitemBases["Test Ring"] = { type = "Ring", tags = { ring = true, default = true, replacement = true, }, req = { level = 2, }, }\nitemBases["Test Abyss Jewel"] = { type = "Jewel", subType = "Abyss", tags = { jewel = true, }, req = { level = 1, }, }',
  };
  const authority = buildCraftingAuthority(lockedInputs, input => contents[input.id]);
  assert.deepEqual(authority.itemMods.find(mod => mod.id === 'Life1').value_ranges, [{ line_index: 0, min: 1, max: 2 }]);
  assert.equal(authority.itemMods.find(mod => mod.id === 'JewelLife1').source_path, 'src/Data/ModJewel.lua');
  assert.deepEqual(authority.essences, [{
    id: 'Essence',
    text: 'Essence of Testing',
    name: 'Essence of Testing',
    type: 'Life',
    tier_level: 1,
    mods: [{ base_type: 'Ring', mod_id: 'Life1', mod_type: 'Prefix', group: 'Life', lines: ['+(1-2) to maximum Life'] }],
    source_path: 'src/Data/Essence.lua',
    source_sha256: 'b'.repeat(64),
    source_locator: 'src/Data/Essence.lua#Essence',
  }]);
  const testRing = authority.itemBases.find(base => base.id === 'Test Ring');
  const testAbyssJewel = authority.itemBases.find(base => base.id === 'Test Abyss Jewel');
  assert.deepEqual(testRing.tags, ['default', 'replacement', 'ring']);
  assert.equal(testRing.required_item_level, 2);
  assert.deepEqual(testRing.affix_limits, { normal: { prefixes: 3, suffixes: 3 }, corrupted: { prefixes: 3, suffixes: 3 } });
  assert.deepEqual(testAbyssJewel.affix_limits, { normal: { prefixes: 2, suffixes: 2 }, corrupted: { prefixes: 3, suffixes: 3 } });
  assert.throws(() => validateCraftingSeed({ schema_version: 1, reviewed_at_utc_plus_8: '2026-08-27T00:00:00+08:00', reviewed_by: 'test', runes: [], essences: [], slotTagMap: [] }, authority, { entries: [] }), /must not be empty|runes/);
});

test('builds item authority from the locked upstream modifier and base sources', async () => {
  const inputs = await loadLockedInputs(repoRoot, { stage: 'M2-3' });
  const authority = buildCraftingAuthority(inputs, input => readFileSync(resolve(repoRoot, input.path), 'utf8'));
  const fireResistance = authority.itemMods.find(mod => mod.id === 'FireResist1');
  const jewelAccuracy = authority.itemMods.find(mod => mod.id === 'JewelAccuracy');
  const crimsonAmulet = authority.itemBases.find(base => base.id === 'Crimson Amulet');
  const absentAmulet = authority.itemBases.find(base => base.id === 'Absent Amulet');
  const penumbraAmulet = authority.itemBases.find(base => base.id === 'Penumbra Amulet');
  const lifeFlask = authority.itemBases.find(base => base.id === 'Colossal Life Flask');
  const calmLeg = authority.itemBases.find(base => base.id === 'Calm Leg');
  assert.deepEqual(fireResistance.value_ranges, [{ line_index: 0, min: 6, max: 10 }]);
  assert.equal(fireResistance.source_sha256, inputs.find(input => input.id === 'upstream.crafting.item-mods').sha256);
  assert.equal(jewelAccuracy.source_path, 'src/Data/ModJewel.lua');
  assert.deepEqual(jewelAccuracy.spawn_weights, [{ tag: 'dexjewel', weight: 1 }, { tag: 'jewel', weight: 0 }]);
  assert.deepEqual(crimsonAmulet.tags, ['amulet', 'default']);
  assert.equal(crimsonAmulet.source_path, 'src/Data/Bases/amulet.lua');
  assert.deepEqual(absentAmulet.affix_limits, { normal: { prefixes: 2, suffixes: 2 }, corrupted: { prefixes: 2, suffixes: 2 } });
  assert.deepEqual(penumbraAmulet.affix_limits, { normal: { prefixes: 5, suffixes: 1 }, corrupted: { prefixes: 5, suffixes: 1 } });
  assert.deepEqual(lifeFlask.allowed_rarities, ['NORMAL', 'MAGIC']);
  assert.equal(lifeFlask.corruptible, false);
  assert.deepEqual(lifeFlask.rarity_affix_limits.MAGIC.normal, { prefixes: 1, suffixes: 1 });
  assert.deepEqual(calmLeg.allowed_rarities, ['NORMAL']);
  assert.equal(calmLeg.corruptible, false);
  assert.deepEqual(calmLeg.rarity_affix_limits.NORMAL.normal, { prefixes: 0, suffixes: 0 });
});
