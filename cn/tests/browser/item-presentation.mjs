import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';

export async function verifyCorruptionDisplay(container) {
  const row = container.locator('[data-item-line-kind="corrupted"]');
  await row.waitFor();
  assert.match(await row.innerText(), /腐化|汙染/);
  assert.equal(await row.evaluate(element => getComputedStyle(element).color), 'rgb(221, 0, 34)');
}

export async function verifyNoDesktopHints(container) {
  assert.doesNotMatch(await container.innerText(), /Ctrl\+D|Shift/);
}

// 复用真实核心创建的两份物品：A 已穿戴，B 闲置时同时产生防御提升和移动速度降低。
export async function verifyStoredItemPresentation({ a, b, state, evidence }) {
  const checks = [];
  for (const [page, label] of [[a, '已穿戴'], [b, '未穿戴']]) {
    await page.bringToFront();
    await page.getByRole('button', { name: '装备与物品', exact: true }).click();
    await page.getByRole('heading', { name: '粘贴导入装备', exact: true }).hover();
    const before = await state(page), requests = [];
    const count = request => { if (request.url().includes('/api/') && !request.url().endsWith('/heartbeat')) requests.push(new URL(request.url()).pathname); };
    page.on('request', count);
    try {
      const response = page.waitForResponse(response => response.url().endsWith('/api/items/tooltip'));
      const item = page.getByTitle('编辑传奇物品', { exact: true }).first();
      const started = performance.now();
      await item.hover();
      const official = (await (await response).json()).data.tooltip;
      await writeFile(join(evidence, `物品显示-${label}-官方响应.json`), JSON.stringify(official, null, 2), 'utf8');
      const tooltip = page.getByTestId('official-item-tooltip');
      await tooltip.waitFor();
      await tooltip.getByRole('status').waitFor({ state: 'detached' });
      assert.equal(await tooltip.getByRole('alert').count(), 0);
      await verifyCorruptionDisplay(tooltip);
      await verifyNoDesktopHints(tooltip);
      if (page === b) {
        for (const [kind, color] of [['positive', 'rgb(74, 222, 128)'], ['negative', 'rgb(248, 113, 113)']]) {
          const differences = tooltip.locator(`[data-item-line-kind="${kind}"]`);
          assert.ok(await differences.count() > 0, `真实官方物品必须产生 ${kind} 比较`);
          for (const row of await differences.all()) {
            assert.equal(await row.evaluate(element => getComputedStyle(element).color), color);
          }
        }
        const heading = tooltip.locator('[data-item-line-kind="comparison-heading"]').first();
        assert.equal(await heading.evaluate(element => getComputedStyle(element).borderTopWidth), '1px');
        assert.equal(await heading.evaluate(element => getComputedStyle(element).color), 'rgb(209, 213, 219)');
      }
      const expected = await page.evaluate(async official => {
        const { localizeWebItemRows } = await import('/src/utils/webTranslation.ts');
        const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('build');
        return localizeWebItemRows(official.bodyLines, official.bodyLineUnsupported, { item: store.itemLibrary[0], items: store.itemLibrary })
          .filter(row => /^[+-]\d/.test(row.raw)).map(row => row.translated);
      }, official);
      const rendered = await tooltip.innerText();
      for (const line of expected) assert.ok(rendered.includes(line), `必须保留官方原值和完整译文：${line}`);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const displayedMs = Math.round(performance.now() - started);
      await page.screenshot({ path: join(evidence, `物品显示-${label}.png`), fullPage: true });
      await page.getByRole('heading', { name: '粘贴导入装备', exact: true }).hover();
      await item.hover();
      await tooltip.locator('[data-item-line-kind="corrupted"]').waitFor();
      await page.evaluate(async () => (await import('/src/utils/webTranslation.ts')).setTranslationLocale('zh-TW'));
      await verifyCorruptionDisplay(tooltip);
      await page.evaluate(async () => (await import('/src/utils/webTranslation.ts')).setTranslationLocale('zh-CN'));
      assert.deepEqual(requests, ['/api/items/tooltip'], '重复悬停和语言变更不能增加请求');
      assert.deepEqual(await state(page), before, '物品显示不得改变会话、存档或官方结果');
      checks.push({ view: label, displayedMs, tooltipRequests: requests.length, officialValuesPreserved: true,
        comparisonRows: await tooltip.locator('[data-item-line-kind="positive"], [data-item-line-kind="negative"]').count() });
    } finally { page.off('request', count); }
  }
  await b.getByRole('heading', { name: '粘贴导入装备', exact: true }).hover();
  const beforeImport = await state(b);
  const importer = b.getByRole('region', { name: '粘贴导入装备', exact: true });
  await importer.getByLabel('游戏或 PoB 装备文本').fill(beforeImport.items[0].raw);
  await importer.getByRole('button', { name: '预览', exact: true }).click();
  await verifyCorruptionDisplay(importer);
  assert.deepEqual(await state(b), beforeImport, '文本预览不得更改存档');
  await b.screenshot({ path: join(evidence, '物品显示-文本导入与公共池.png'), fullPage: true });
  return checks;
}
