import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = relative => readFile(new URL(relative, import.meta.url), 'utf8');

test('removes arbitrary item text and legacy local crafted-item writes', async () => {
  const [panel, store] = await Promise.all([
    source('../../web/src/components/ItemsPanel.vue'),
    source('../../web/src/stores/buildStore.ts'),
  ]);
  for (const forbidden of ['openCustomItemModal', 'saveCustomItem', 'customModal', '粘贴装备文本', 'rawText']) {
    assert.doesNotMatch(panel, new RegExp(forbidden));
  }
  assert.doesNotMatch(store, /saveCraftedItem/);
});

test('removes the unused legacy local crafting modal', async () => {
  await assert.rejects(readFile(new URL('../../web/src/components/ItemCraftingModal.vue', import.meta.url), 'utf8'));
});
