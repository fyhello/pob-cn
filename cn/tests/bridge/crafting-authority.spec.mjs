import assert from 'node:assert/strict';
import test from 'node:test';

import { createCraftDraftValidator } from '../../bridge/crafting-authority.mjs';

function fixtureAuthority() {
  const makeMods = (kind, count) => Array.from({ length: count }, (_, index) => ({
    id: `${kind}${index + 1}`,
    type: kind === 'Prefix' ? 'Prefix' : 'Suffix',
    group: `${kind}Group${index + 1}`,
    required_item_level: 1,
    lines: [`${kind} ${index + 1}`],
    spawn_weights: [{ tag: 'test', weight: 1 }],
  }));
  const limits = (prefixes, suffixes) => ({ normal: { prefixes, suffixes }, corrupted: { prefixes, suffixes } });
  return {
    schema_version: 2,
    item_bases: [
      { id: 'Absent Amulet', type: 'Amulet', tags: ['test'], required_item_level: 1, socket_limit: 0, affix_limits: limits(2, 2) },
      { id: 'Penumbra Amulet', type: 'Amulet', tags: ['test'], required_item_level: 1, socket_limit: 0, affix_limits: limits(5, 1) },
      { id: 'Diamond', type: 'Jewel', tags: ['test'], required_item_level: 1, socket_limit: 0, affix_limits: limits(2, 2) },
      { id: 'Murderous Eye Jewel', type: 'Jewel', tags: ['test'], required_item_level: 1, socket_limit: 0, affix_limits: { normal: { prefixes: 2, suffixes: 2 }, corrupted: { prefixes: 3, suffixes: 3 } } },
    ],
    item_mods: [...makeMods('Prefix', 5), ...makeMods('Suffix', 3)],
    essences: [{ id: 'Unused', mods: [] }],
  };
}

function draft(baseName, prefixCount, suffixCount, corrupted = false) {
  const affixes = (kind, count) => Array.from({ length: count }, (_, index) => ({ id: `${kind}${index + 1}`, roll: 0.5 }));
  return {
    rarity: 'RARE',
    baseName,
    itemLevel: 100,
    corrupted,
    prefixes: affixes('Prefix', prefixCount),
    suffixes: affixes('Suffix', suffixCount),
  };
}

test('craft draft validation honors independent official base capacities and corrupt abyss jewels', () => {
  const validate = createCraftDraftValidator(fixtureAuthority());
  assert.equal(validate(draft('Absent Amulet', 2, 2)), null);
  assert.equal(validate(draft('Absent Amulet', 3, 0))?.code, 'POB_CRAFT_AFFIX_COUNT_INVALID');
  assert.equal(validate(draft('Penumbra Amulet', 5, 1)), null);
  assert.equal(validate(draft('Penumbra Amulet', 5, 2))?.code, 'POB_CRAFT_AFFIX_COUNT_INVALID');
  assert.equal(validate(draft('Diamond', 2, 2)), null);
  assert.equal(validate(draft('Diamond', 3, 0))?.code, 'POB_CRAFT_AFFIX_COUNT_INVALID');
  assert.equal(validate(draft('Murderous Eye Jewel', 3, 3))?.code, 'POB_CRAFT_AFFIX_COUNT_INVALID');
  assert.equal(validate(draft('Murderous Eye Jewel', 3, 3, true)), null);
});
