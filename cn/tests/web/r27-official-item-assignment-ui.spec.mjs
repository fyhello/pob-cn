import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = relative => readFile(new URL(relative, import.meta.url), 'utf8');
const forbiddenStoreWrites = /store\.(?:equipItem|unequipSlot|socketJewel|unsocketJewel|addItem|removeItem)\b/;

test('item assignment UI has no local item write path', async () => {
  const [itemsPanel, passiveTree] = await Promise.all([
    source('../../web/src/components/ItemsPanel.vue'),
    source('../../web/src/components/PassiveTreeCanvas.vue'),
  ]);

  for (const component of [itemsPanel, passiveTree]) {
    assert.doesNotMatch(component, forbiddenStoreWrites);
    assert.match(component, /store\.commitOfficialItemAssignment\(/);
  }
  assert.doesNotMatch(itemsPanel, /\b(?:smartEquipItem|addUniqueToLibraryAndEquip|addBaseToLibraryAndEquip)\b/);
});

test('item assignment targets use the active canonical loadout', async () => {
  const [itemsPanel, passiveTree] = await Promise.all([
    source('../../web/src/components/ItemsPanel.vue'),
    source('../../web/src/components/PassiveTreeCanvas.vue'),
  ]);

  assert.match(itemsPanel, /itemSetId:\s*active\.itemSetId/);
  assert.match(itemsPanel, /specId:\s*active\.specId/);
  assert.match(passiveTree, /specId:\s*active\.specId/);
});

test('item pickers render and submit only Lua validTargetSlots', async () => {
  const itemsPanel = await source('../../web/src/components/ItemsPanel.vue');

  // Equipment and equipment-jewel targets must come from the official
  // projection; an item without that projection is never treated as valid.
  assert.match(itemsPanel, /const official = item\.validTargetSlots/);
  assert.match(itemsPanel, /function getItemValidEquipmentJewelSlots/);
  assert.match(itemsPanel, /official\.equipmentJewels/);
  assert.match(itemsPanel, /function getItemValidJewelTargets/);
  assert.match(itemsPanel, /official\.jewels/);
  assert.match(itemsPanel, /getItemValidJewelTargets\(item\)\.some\(target => target\.nodeId === nodeId\)/);
  assert.match(itemsPanel, /for \(const target of jewelTargets\) labels\.push\(`星盘插槽 #\$\{target\.nodeId\}`\)/);
  assert.match(itemsPanel, /class="flex-1 min-w-0 truncate mr-2"/);
  assert.match(itemsPanel, /max-w-\[9rem\].*truncate/);
  assert.match(itemsPanel, /const translated = translateWebText\(s\)/);
  assert.match(itemsPanel, /translateWebText\('Jewel Socket'\)/);
  assert.doesNotMatch(itemsPanel, /slotPickerModal\.value\.isJewel\)\s*\{\s*return store\.itemLibrary\.filter\(i => isJewelItem\(i\)\)/);
  assert.doesNotMatch(itemsPanel, /slots\.length === 0\) return isJewelItem\(item\)/);
  assert.doesNotMatch(itemsPanel, /activeJewelSockets\.value\[0\]\.id/);
});
