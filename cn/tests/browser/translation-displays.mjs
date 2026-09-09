import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// 使用独立浏览器页面和测试服务导入存档副本，所有操作仍经过真实界面与官方核心。
export async function verifyTranslationDisplays(page, origin, fixturePath, evidence) {
  const fileBefore = await readFile(fixturePath);
  const fixture = JSON.parse(fileBefore);
  await page.goto(origin);
  await page.getByRole('button', { name: '导入流派', exact: true }).click();
  await page.getByLabel('PoB 分享代码或 XML').fill(fixture.canonicalBuild?.code ?? fixture.code);
  await page.getByLabel('存档名称', { exact: true }).fill('翻译入口隔离验证');
  await page.getByRole('button', { name: '导入并保存', exact: true }).click();
  await page.getByTestId('spirit-value').waitFor();
  const state = () => page.evaluate(() => {
    const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('build');
    return { code: store.canonicalBuild.code, version: store.canonicalBuild.version, stats: { ...store.stats }, session: store.sessionId,
      items: store.itemLibrary.map(({ id, raw }) => ({ id, raw })) };
  });
  const before = await state(), requests = [];
  const count = request => { if (request.url().includes('/api/') && !request.url().endsWith('/heartbeat')) requests.push(new URL(request.url()).pathname); };
  page.on('request', count);
  await page.getByRole('button', { name: '技能与宝石', exact: true }).click();
  await page.getByTestId('calcs-mana-cost').click();
  const primary = page.getByTestId('calcs-primary-detail');
  await primary.waitFor();
  const costText = await primary.innerText();
  assert.doesNotMatch(costText, /cost multiplier|additional mana cost|increased\/reduced mana cost|more\/less mana cost|paid for with life/);
  assert.match(costText, /消耗/);
  assert.doesNotMatch(costText.replace(/\bPoB\b/g, ''), /[A-Za-z]{2,}/);
  await page.screenshot({ path: join(evidence, '实际流派-完整消耗公式.png'), fullPage: true });

  await page.keyboard.press('Escape');
  await page.getByTestId('calcs-other-effects').click();
  const rows = page.getByTestId('calcs-detail-row');
  assert.ok(await rows.count() > 0);
  let checkedSource = false;
  for (let index = 0; index < await rows.count(); index++) {
    await rows.nth(index).click();
    const source = page.locator('[data-testid="calcs-source-row"][data-source-kind="item"]').first();
    if (!await source.count()) continue;
    const id = await source.getAttribute('data-source-id');
    const requestCount = requests.filter(path => path === '/api/items/tooltip').length;
    await source.hover();
    const tooltip = page.getByTestId('official-item-tooltip');
    await tooltip.waitFor();
    await tooltip.getByRole('status').waitFor({ state: 'detached' });
    assert.equal(await tooltip.getByRole('alert').count(), 0, await tooltip.innerText());
    const text = await tooltip.innerText();
    assert.doesNotMatch(text, /暂无官方物品显示数据|没有官方显示词条/);
    assert.doesNotMatch(text, /Equipping this item|Removing this item|Presence Radius|\(replacing /);
    assert.doesNotMatch(text.replace(/Ctrl\+D|\b(?:PoB|DPS|DoT|AoE|ES)\b/g, ''), /[A-Za-z]{2,}/);
    assert.doesNotMatch(await page.getByTestId('calcs-secondary-detail').innerText(), /\bPresenceArea\b/);
    assert.ok(text.split('\n').length > 3);
    assert.equal(requests.filter(path => path === '/api/items/tooltip').length, requestCount + 1);
    await page.screenshot({ path: join(evidence, `实际流派-计算来源物品-${id}.png`), fullPage: true });
    await primary.getByRole('heading').first().hover();
    await source.hover();
    await tooltip.waitFor();
    assert.equal(requests.filter(path => path === '/api/items/tooltip').length, requestCount + 1, '重复悬停必须复用缓存');
    checkedSource = true;
    break;
  }
  assert.ok(checkedSource, '必须实际悬停至少一项官方物品来源，不能以没有找到入口跳过');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: '天赋树', exact: true }).click();
  await page.getByTitle('重置视角', { exact: true }).click();
  const canvas = page.locator('canvas');
  await canvas.waitFor();
  const tree = JSON.parse(await readFile(new URL('../../generated/web-data/tree_0_5.json', import.meta.url)));
  const positions = await page.evaluate(tree => {
    const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('build');
    const canvas = document.querySelector('canvas'), box = canvas.getBoundingClientRect();
    return tree.nodes.filter(node => store.socketedJewels[node.id]).map(node => ({ id: node.id,
      x: box.left + canvas.width / 2 + node.x * 0.085, y: box.top + canvas.height / 2 + node.y * 0.085,
      visible: box.left + canvas.width / 2 + node.x * 0.085 > box.left + 20 && box.left + canvas.width / 2 + node.x * 0.085 < box.right - 20 && box.top + canvas.height / 2 + node.y * 0.085 > box.top + 100 && box.top + canvas.height / 2 + node.y * 0.085 < box.bottom - 30 }));
  }, tree);
  const jewel = positions.find(node => node.visible);
  assert.ok(jewel, '隔离流派需要具有可见的已镶嵌珠宝');
  await page.mouse.move(jewel.x, jewel.y);
  const jewelDetail = page.getByTestId('socketed-jewel-detail');
  await jewelDetail.waitFor();
  const jewelText = await jewelDetail.innerText();
  assert.ok(jewelText.split('\n').length > 4, '珠宝卡片必须含实际词条正文');
  assert.doesNotMatch(jewelText, /Spirit Spark|increased Totem Placement|Regenerate .+maximum Life/);
  assert.doesNotMatch(jewelText, /[A-Za-z]{2,}/);
  await page.screenshot({ path: join(evidence, '实际流派-天赋珠宝正文.png'), fullPage: true });

  await page.getByRole('button', { name: '生存与防御', exact: true }).click();
  await page.getByText('有效移动速度', { exact: true }).click();
  const defence = page.getByTestId('defence-detail');
  await defence.waitFor();
  assert.doesNotMatch(await defence.innerText(), /\bMovementSpeed\b/);
  await page.screenshot({ path: join(evidence, '实际流派-移动速度来源.png'), fullPage: true });
  const languageRequests = requests.length;
  await page.evaluate(async () => (await import('/src/utils/webTranslation.ts')).setTranslationLocale('zh-TW'));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(async () => (await import('/src/utils/webTranslation.ts')).setTranslationLocale('zh-CN'));
  assert.equal(requests.length, languageRequests, '语言变化不得发起业务请求');
  assert.deepEqual(await state(), before, '显示检查不得修改计算结果、保存文档和物品');
  assert.deepEqual(await readFile(fixturePath), fileBefore, '用户原存档保持不变');
  page.off('request', count);
  return { actualBuild: true, sourceTooltip: true, jewelBody: true, costFormula: true, defenceSource: true, requests, unchanged: true };
}
