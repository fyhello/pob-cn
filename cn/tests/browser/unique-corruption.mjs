import assert from 'node:assert/strict';
import { join } from 'node:path';

export async function verifyUniqueCorruption({ page, panel, choose, ready, state, evidence }) {
  // 双窗口用例最后打开的是另一页；性能口径使用用户正在操作的前台页，避免后台绘制节流。
  await page.bringToFront();
  const original = await state(page), requests = [];
  const count = request => { if (request.url().endsWith('/api/items/preview')) requests.push(request.url()); };
  page.on('request', count);
  const section = () => panel().getByTestId('unique-corruption');
  async function raw() {
    await panel().getByRole('tab', { name: 'PoB 源码', exact: true }).click();
    const text = await panel().locator('pre').innerText();
    await panel().getByRole('tab', { name: '物品预览', exact: true }).click();
    return text;
  }
  const ids = await panel().getByLabel('官方传奇目录').locator('option').evaluateAll(options => options.map(option => option.value));
  const bootId = ids.find(id => id.startsWith('Wanderlust,'));
  assert.ok(bootId);
  try {
    await choose(bootId);
    await section().getByRole('checkbox', { name: '腐化成品' }).check(); await ready();
    await section().getByLabel('腐化词缀 1', { exact: true }).selectOption('CorruptionMovementVelocity1'); await ready();
    assert.equal(await section().getByLabel('腐化词缀 2', { exact: true }).locator('option[value="CorruptionMovementVelocity1"]').count(), 0);
    const slider = section().getByLabel('腐化词缀调值 1', { exact: true });
    const timing = await slider.evaluate(element => new Promise(resolve => {
      const root = element.closest('[data-testid="unique-crafting"]');
      const started = performance.now();
      let updating = false;
      const observer = new MutationObserver(() => {
        const preview = root.querySelector('[data-testid="unique-preview"]');
        if (!preview) updating = true;
        if (updating && preview) {
          observer.disconnect();
          requestAnimationFrame(() => requestAnimationFrame(() => {
            const request = performance.getEntriesByType('resource').filter(entry => entry.name.endsWith('/api/crafting/options')).at(-1);
            resolve({ displayedMs: Math.round(performance.now() - started), optionsRequestMs: request ? Math.round(request.duration) : null, responseToPaintMs: request ? Math.round(performance.now() - request.responseEnd) : null });
          }));
        }
      });
      observer.observe(root, { childList: true, subtree: true });
      element.value = '1'; element.dispatchEvent(new Event('input', { bubbles: true }));
    }));
    await ready();
    assert.match(await raw(), /Corrupted/);
    assert.match(await raw(), /\{range:1\}.*\(3-5\)% increased Movement Speed/);
    assert.doesNotMatch(await section().getByLabel('腐化词缀 1', { exact: true }).innerText(), /increased Movement Speed/);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 960 });
      assert.equal(await panel().evaluate(element => element.scrollWidth <= element.clientWidth), true);
      await page.screenshot({ path: join(evidence, `传奇腐化-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 960 });
    await choose('Mageblood, Utility Belt');
    await section().getByRole('checkbox', { name: '腐化成品' }).check(); await ready();
    assert.equal(await section().getByLabel('腐化词缀 1', { exact: true }).locator('option[value="CorruptionMovementVelocity1"]').count(), 0);
    await choose('Against the Darkness, Time-Lost Diamond');
    await section().getByRole('checkbox', { name: '腐化成品' }).check(); await ready();
    assert.equal(await section().getByLabel('腐化词缀 1', { exact: true }).locator('option').count(), 12);
    for (const suffix of ['Flask', 'Charm']) {
      const id = ids.find(id => id.endsWith(suffix)); assert.ok(id);
      await choose(id);
      assert.equal(await section().getByRole('checkbox', { name: '腐化成品' }).isDisabled(), true);
    }
    await choose('Glimpse of Chaos, Tribal Mask');
    await section().getByRole('checkbox', { name: '腐化成品' }).check(); await ready();
    assert.equal(await section().getByLabel('腐化来源', { exact: true }).inputValue(), 'Glimpse of Chaos');
    assert.equal(await section().getByLabel('腐化词缀 8', { exact: true }).count(), 1);
    await choose('Morior Invictus, Grand Regalia');
    await section().getByRole('checkbox', { name: '腐化成品' }).check(); await ready();
    const multiplier = section().getByRole('slider', { name: /^腐化倍率 / }).first();
    await multiplier.evaluate(element => { element.value = '1'; element.dispatchEvent(new Event('input', { bubbles: true })); }); await ready();
    assert.match(await raw(), /\{corruptedRange:1\.22\}/);
    await multiplier.evaluate(element => { element.value = '0.5'; element.dispatchEvent(new Event('input', { bubbles: true })); }); await ready();
    assert.doesNotMatch(await raw(), /\{corruptedRange:/);
    await panel().getByLabel('选项 1', { exact: true }).selectOption('1'); await ready();
    assert.equal(await section().getByRole('checkbox', { name: '腐化成品' }).isChecked(), false);
    const after = await state(page);
    for (const key of ['session', 'version', 'code', 'stats', 'items']) assert.deepEqual(after[key], original[key], `腐化选项预览改变 ${key}`);
    assert.deepEqual(requests, [], '自动腐化预览不能运行整 BD 计算');
    return { ...timing, automaticCalculationRequests: requests.length, eligibility: true, ranges: true, preserved: true };
  } finally { page.off('request', count); }
}
