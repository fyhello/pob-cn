import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { createServer } from 'vite';
import { startBridge } from '../../bridge/start.mjs';
import { BuildSessions } from '../../bridge/build-sessions.mjs';
import { LibraryStore } from '../../bridge/library-store.mjs';
import { createBridgeHttpServer } from '../../bridge/http-server.mjs';

const root = resolve(import.meta.dirname, '../../..');
process.chdir(join(root, 'cn/web'));
const evidence = await mkdtemp(join(tmpdir(), 'pob-weapon-browser-'));
const playwright = await import(process.env.POB_CN_PLAYWRIGHT_PATH ? pathToFileURL(process.env.POB_CN_PLAYWRIGHT_PATH).href : 'playwright');
const { chromium } = playwright.default ?? playwright;
const library = await new LibraryStore(join(evidence, 'library')).start();
const sessions = new BuildSessions({ createEngine: async () => {
  const directory = await mkdtemp(join(evidence, 'core-'));
  await mkdir(join(directory, 'Builds'));
  await mkdir(join(directory, 'files'));
  return startBridge(root, { command: join(root, 'Builds/luajit', process.platform === 'win32' ? 'luajit.exe' : 'luajit'), args: [join(root, 'cn/bridge/calc_server.lua')], cwd: join(root, 'src'), env: { ...process.env, POB_CN_SESSION_DIR: directory, LUA_PATH: '../runtime/lua/?.lua;../runtime/lua/?/init.lua;;' }, startupTimeoutMs: 30_000, requestTimeoutMs: 30_000 });
} });
const bridge = createBridgeHttpServer(sessions, { library });
bridge.listen(0, '127.0.0.1');
await once(bridge, 'listening');
const target = `http://127.0.0.1:${bridge.address().port}`;
const vite = await createServer({ root: join(root, 'cn/web'), configFile: join(root, 'cn/web/vite.config.ts'), server: { host: '127.0.0.1', port: 0, proxy: { '/api': target, '/health': target } } });
await vite.listen();
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.POB_CN_BROWSER ? { executablePath: process.env.POB_CN_BROWSER } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
const errors = [];
const measurements = [];
const previewRequests = { pool: 0, text: 0 };
const a = await context.newPage();
const b = await context.newPage();
a.on('request', request => {
  const path = new URL(request.url()).pathname;
  if (path === '/api/items/pool-preview') previewRequests.pool++;
  if (path === '/api/items/text-preview') previewRequests.text++;
});
for (const page of [a, b]) {
  page.setDefaultTimeout(30_000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
}
async function state(page) {
  return page.evaluate(() => {
    const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('build');
    return { code: store.canonicalBuild?.code, version: store.canonicalBuild?.version, session: store.sessionId, modes: { ...store.allocationModes }, stats: { ...store.stats }, items: store.itemLibrary.length, error: store.lastCalculationError?.message };
  });
}
async function settle(page, version) {
  await page.waitForFunction(old => {
    const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('build');
    return store.canonicalBuild && !store.isCalculating && !store.isOpening && store.canonicalBuild.version !== old;
  }, version);
  const result = await state(page);
  assert.ok(!result.error, result.error);
  await page.getByTestId('spirit-value').waitFor();
  assert.equal((await page.getByTestId('spirit-value').textContent()).trim(), `${result.stats.SpiritUnreserved ?? ''} / ${result.stats.Spirit ?? ''}`);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return result;
}
async function action(page, name, work) {
  await page.bringToFront();
  const previous = await state(page);
  let requests = 0;
  const count = request => { if (new URL(request.url()).pathname === '/api/build/commit') requests++; };
  page.on('request', count);
  const started = performance.now();
  await work();
  const result = await settle(page, previous.version);
  page.off('request', count);
  measurements.push({ operation: name, visibleMs: Math.round(performance.now() - started), requests });
  return result;
}
async function clickNode(id, mode) {
  await a.getByRole('group', { name: '天赋分配模式' }).getByRole('button', { name: mode === 0 ? '公用' : mode === 1 ? 'I' : 'II', exact: true }).click();
  const point = await a.locator('canvas').evaluate((canvas, id) => {
    const setup = canvas.__vueParentComponent.setupState;
    const node = setup.allNodes.find(node => node.id === id);
    setup.view.scale = 0.22;
    setup.view.x = -node.x * setup.view.scale;
    setup.view.y = -node.y * setup.view.scale;
    setup.drawCanvas();
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, id);
  const result = await action(a, `天赋模式 ${mode}`, async () => { await a.mouse.move(point.x, point.y); await a.mouse.click(point.x, point.y); });
  assert.equal(result.modes[id], mode);
}
async function shot(name) { await a.screenshot({ path: join(evidence, `${name}.png`), fullPage: true }); }
try {
  console.log(`浏览器验收证据：${evidence}`);
  for (const [page, name] of [[a, '分组 A'], [b, '分组 B']]) {
    await page.goto(origin);
    await page.getByLabel('存档名称', { exact: true }).fill(name);
    await page.getByRole('button', { name: '新建', exact: true }).click();
    await settle(page);
  }
  const independent = await state(b);
  await a.bringToFront();
  await a.locator('canvas').waitFor();
  for (const [id, mode] of [[56651, 0], [35324, 0], [35660, 1], [18548, 1], [28992, 2]]) await clickNode(id, mode);
  assert.equal((await state(b)).code, independent.code);
  await a.getByTitle('重置视角', { exact: true }).click();
  await a.getByTitle('放大', { exact: true }).click();
  await a.getByTitle('缩小', { exact: true }).click();
  const colors = await a.locator('canvas').evaluate(canvas => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let red = 0, green = 0, visible = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const [r, g, b] = pixels.slice(i, i + 3);
      if (r > 140 && g < r * 0.75 && b < r * 0.8) red++;
      if (g > 120 && r < g * 0.7 && b < g * 0.9) green++;
      if (Math.max(r, g, b) > 35) visible++;
    }
    return { red, green, visible };
  });
  assert.ok(colors.red > 5 && colors.green > 5 && colors.visible > 1000, JSON.stringify(colors));
  await shot('天赋分组-桌面');
  const treeState = await state(a);
  await a.reload();
  await settle(a);
  assert.deepEqual((await state(a)).modes, treeState.modes);
  await a.getByRole('button', { name: '装备与物品', exact: true }).click();
  await action(a, '切换武器组 II', () => a.getByRole('group', { name: '武器组切换' }).getByRole('button', { name: 'II', exact: true }).click());
  const importPanel = a.getByRole('region', { name: '粘贴导入装备', exact: true });
  const pool = a.getByRole('region', { name: '公共物品池', exact: true });
  await importPanel.waitFor();
  await pool.waitFor();
  assert.deepEqual(previewRequests, { pool: 0, text: 0 }, '常驻面板挂载不能自动发预览请求');
  assert.equal(await a.getByRole('button', { name: '粘贴导入', exact: true }).count(), 0);
  await a.getByRole('button', { name: '公共物品池', exact: true }).click();
  await pool.getByLabel('搜索公共物品').evaluate(element => { if (document.activeElement !== element) throw new Error('公共池入口未聚焦内嵌区域'); });
  assert.equal(await a.getByRole('dialog').count(), 0, '装备页不能再挂载第二个公共池实例');
  const screenshotLine = 'Bonded: Break Armour on Critical Hit with Spells equal to 12% of Physical Damage dealt';
  const raw = `Rarity: RARE\nTest Sceptre\nRattling Sceptre\nItem Level: 82\n+100 to Spirit\n{enchant}{rune}${screenshotLine}\nBonded: Minions deal 20% increased Damage\nBonded: +50 to maximum Runic Ward\nUnsupported test modifier`;
  await importPanel.getByLabel('游戏或 PoB 装备文本').fill(raw.replace('Test Sceptre', '验收权杖'));
  await importPanel.getByRole('button', { name: '预览', exact: true }).click();
  await importPanel.getByText(/当前官方核心不支持这段装备文本中的中文或特殊字符/).waitFor();
  await importPanel.getByLabel('游戏或 PoB 装备文本').fill(raw);
  await importPanel.getByRole('button', { name: '预览', exact: true }).click();
  await importPanel.getByText('高亮词缀尚未被当前 PoB 核心完整支持，导入后不生效，不参与计算；原文会保留。', { exact: true }).waitFor();
  assert.equal(await importPanel.getByRole('button', { name: '加入当前流派', exact: true }).isDisabled(), false);
  assert.equal(await importPanel.locator('[data-unsupported="true"]').count(), 4);
  await importPanel.locator('[data-unsupported="true"]').filter({ hasText: '法术暴击' }).getByText('（不生效）', { exact: true }).waitFor();
  assert.ok((await importPanel.locator('[data-unsupported="true"]').allTextContents()).every(text => text.includes('（不生效）')));
  await importPanel.getByLabel('游戏或 PoB 装备文本').fill(raw);
  // 延后交付真实官方响应，在它返回页面之前修改 BD，检查旧预览不能复活。
  let releaseText;
  let textReady;
  let textDelivered;
  const textGate = new Promise(resolve => { releaseText = resolve; });
  const textResponse = new Promise(resolve => { textReady = resolve; });
  const textDelivery = new Promise(resolve => { textDelivered = resolve; });
  const holdText = async route => {
    const response = await route.fetch();
    textReady();
    await textGate;
    await route.fulfill({ response });
    textDelivered();
  };
  await a.route('**/api/items/text-preview', holdText);
  await importPanel.getByRole('button', { name: '预览', exact: true }).click();
  await textResponse;
  assert.equal(await importPanel.getByRole('button', { name: '处理中...', exact: true }).isDisabled(), true);
  await action(a, '预览期间切换武器组 I', () => a.getByRole('group', { name: '武器组切换' }).getByRole('button', { name: 'I', exact: true }).click());
  releaseText();
  await textDelivery;
  await importPanel.getByRole('button', { name: '预览', exact: true }).waitFor();
  assert.equal(await importPanel.getByRole('button', { name: '加入当前流派', exact: true }).count(), 0);
  assert.equal(await importPanel.getByLabel('游戏或 PoB 装备文本').inputValue(), raw);
  await a.unroute('**/api/items/text-preview', holdText);
  await action(a, '恢复武器组 II', () => a.getByRole('group', { name: '武器组切换' }).getByRole('button', { name: 'II', exact: true }).click());
  await importPanel.getByRole('button', { name: '预览', exact: true }).click();
  await importPanel.getByRole('button', { name: '加入当前流派', exact: true }).waitFor();
  await importPanel.getByLabel('导入穿戴槽位').selectOption('equipment:Weapon 1 Swap');
  for (const width of [1920, 1440, 1024]) {
    await a.setViewportSize({ width, height: 1080 });
    await importPanel.scrollIntoViewIfNeeded();
    await shot(`装备常驻预览-${width}`);
    for (const panel of [pool, importPanel]) assert.equal(await panel.evaluate(element => element.scrollWidth <= element.clientWidth), true);
    assert.equal(await a.locator('.items-panel').evaluate(element => element.scrollWidth <= element.clientWidth), true);
    if (width === 1920) {
      const columns = await a.locator('.items-grid > div').evaluateAll(elements => elements.map(element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right }; }));
      assert.equal(columns.length, 3);
      assert.ok(columns.every(column => column.y === columns[0].y));
      assert.ok(columns[0].right <= columns[1].x && columns[1].right <= columns[2].x);
      const top = await pool.boundingBox();
      const bottom = await importPanel.boundingBox();
      assert.ok(top.y + top.height <= bottom.y && top.x === bottom.x);
    }
  }
  await a.setViewportSize({ width: 1440, height: 960 });
  const beforeImport = await state(a);
  await importPanel.getByRole('button', { name: '加入并穿戴', exact: true }).click();
  const imported = await settle(a, beforeImport.version);
  await importPanel.getByText('已加入当前 BD 并穿戴；未支持词缀已保留并标记为不生效，不参与计算。', { exact: true }).waitFor();
  assert.equal(await importPanel.getByLabel('游戏或 PoB 装备文本').inputValue(), '');
  assert.equal(await importPanel.getByRole('button', { name: '加入并穿戴', exact: true }).count(), 0);
  assert.equal(imported.items, beforeImport.items + 1);
  assert.ok(imported.stats.Spirit > 0);
  await a.getByTitle('卸下此装备 (保留在流派物品库中)', { exact: true }).first().locator('..').locator('..').hover();
  const hoverMarks = a.locator('[class*="z-[9999]"] [data-unsupported="true"]');
  await hoverMarks.first().waitFor();
  assert.equal(await hoverMarks.count(), 4, '装备浮窗必须保留逐行未支持状态');
  await hoverMarks.filter({ hasText: '法术暴击' }).getByText('（不生效）', { exact: true }).waitFor();
  await shot('导入后装备浮窗-未支持词缀');
  await a.mouse.move(0, 0);
  await a.getByRole('button', { name: '复制到公共物品池', exact: true }).first().click();
  await pool.getByRole('listitem').getByRole('button').first().click();
  await pool.getByLabel('穿戴槽位', { exact: true }).locator('option').nth(1).waitFor({ state: 'attached' });
  assert.equal(await pool.locator('[data-unsupported="true"]').count(), 4);
  await pool.locator('[data-unsupported="true"]').filter({ hasText: '法术暴击' }).getByText('（不生效）', { exact: true }).waitFor();
  assert.equal((await state(a)).code, imported.code, '复制到公共池不能改变来源 BD');
  const requestsBeforeSwitch = { ...previewRequests };
  for (let round = 0; round < 3; round++) {
    const first = await action(a, '切换武器组 I', () => a.getByRole('group', { name: '武器组切换' }).getByRole('button', { name: 'I', exact: true }).click());
    assert.equal(first.stats.Spirit, beforeImport.stats.Spirit);
    const second = await action(a, '切换武器组 II', () => a.getByRole('group', { name: '武器组切换' }).getByRole('button', { name: 'II', exact: true }).click());
    assert.equal(second.stats.Spirit, imported.stats.Spirit);
    assert.equal((await state(b)).code, independent.code);
  }
  assert.deepEqual(previewRequests, requestsBeforeSwitch, '连续 BD 更新不能自动触发源码或公共池预览');
  assert.equal(await pool.getByLabel('穿戴槽位', { exact: true }).isDisabled(), true);
  assert.equal(await pool.getByRole('button', { name: '加入并穿戴', exact: true }).isDisabled(), true);
  let releasePool;
  let poolReady;
  let poolDelivered;
  const poolGate = new Promise(resolve => { releasePool = resolve; });
  const poolResponse = new Promise(resolve => { poolReady = resolve; });
  const poolDelivery = new Promise(resolve => { poolDelivered = resolve; });
  const holdPool = async route => {
    const response = await route.fetch();
    poolReady();
    await poolGate;
    await route.fulfill({ response });
    poolDelivered();
  };
  await a.route('**/api/items/pool-preview', holdPool);
  await pool.getByRole('button', { name: '刷新穿戴槽位', exact: true }).click();
  await poolResponse;
  await action(a, '公共池预览期间切换武器组 I', () => a.getByRole('group', { name: '武器组切换' }).getByRole('button', { name: 'I', exact: true }).click());
  releasePool();
  await poolDelivery;
  await pool.getByRole('button', { name: '刷新穿戴槽位', exact: true }).click({ trial: true });
  await a.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await pool.getByLabel('穿戴槽位', { exact: true }).isDisabled(), true);
  assert.equal(await pool.getByLabel('穿戴槽位', { exact: true }).locator('option').count(), 1, '迟到公共池响应不能恢复旧武器组槽位');
  await a.unroute('**/api/items/pool-preview', holdPool);
  assert.equal(previewRequests.pool, requestsBeforeSwitch.pool + 1);
  await action(a, '公共池预览后恢复武器组 II', () => a.getByRole('group', { name: '武器组切换' }).getByRole('button', { name: 'II', exact: true }).click());
  await pool.getByRole('button', { name: '刷新穿戴槽位', exact: true }).click();
  await pool.getByLabel('穿戴槽位', { exact: true }).selectOption('equipment:Weapon 1 Swap');
  assert.equal(previewRequests.pool, requestsBeforeSwitch.pool + 2);
  await shot('第二组装备与精魂-桌面');
  await b.getByRole('button', { name: '装备与物品', exact: true }).click();
  const poolB = b.getByRole('region', { name: '公共物品池', exact: true });
  await poolB.getByRole('listitem').getByRole('button').first().click();
  await poolB.locator('[data-unsupported="true"]').first().waitFor();
  assert.equal(await poolB.locator('[data-unsupported="true"]').count(), 4);
  await poolB.locator('[data-unsupported="true"]').filter({ hasText: '法术暴击' }).getByText('（不生效）', { exact: true }).waitFor();
  await poolB.getByRole('button', { name: '加入当前流派', exact: true }).click();
  const addedB = await settle(b, independent.version);
  assert.equal(addedB.items, independent.items + 1);
  assert.equal((await state(a)).code, imported.code);
  await poolB.getByRole('button', { name: '刷新穿戴槽位', exact: true }).click();
  await poolB.getByLabel('穿戴槽位', { exact: true }).selectOption('equipment:Weapon 1');
  await poolB.getByRole('button', { name: '加入并穿戴', exact: true }).click();
  const equippedB = await settle(b, addedB.version);
  assert.equal(equippedB.items, addedB.items + 1);
  assert.ok(equippedB.stats.Spirit > 0);
  assert.equal((await state(a)).code, imported.code);
  assert.equal((await library.list('items')).length, 1);
  // 单独挂载真实展示组件，覆盖窄屏和多行翻译，不改变现有整页布局。
  const componentPage = await context.newPage();
  await componentPage.setViewportSize({ width: 390, height: 844 });
  await componentPage.goto(origin);
  await componentPage.locator('#app').waitFor();
  await componentPage.evaluate(async () => {
    const { createApp, h } = await import('/node_modules/.vite/deps/vue.js');
    const { default: ItemDisplayLines } = await import('/src/components/ItemDisplayLines.vue');
    const { default: PoEItemTooltip } = await import('/src/components/PoEItemTooltip.vue');
    const root = document.querySelector('#app');
    root.__vue_app__.unmount();
    const lines = [
      'Bonded: 36% chance when collecting an Elemental Infusion to gain an',
      'Bonded: additional Elemental Infusion of the same type',
      '+20 to maximum Life', '+20 to maximum Life',
      'Unrecognised'.repeat(18),
    ];
    createApp({ render: () => h('section', { style: 'margin:12px;padding:12px;color:#eee;background:#18191b;font-size:12px', 'data-testid': 'modifier-fixture' }, [
      h(ItemDisplayLines, { lines, unsupported: [true, true, false, true, true] }),
      h(PoEItemTooltip, { item: { rarity: 'RARE', tooltip: { header: { title: 'Test' }, bodyLines: ['', '+20 to maximum Life', '+20 to maximum Life'], bodyLineUnsupported: [false, false, true] } }, isVisible: true, mouseX: 14, mouseY: 540 }),
    ]) }).mount(root);
  });
  const fixture = componentPage.getByTestId('modifier-fixture');
  assert.equal(await fixture.locator(':scope > p').count(), 4, '同状态的多行翻译应合并');
  assert.equal(await fixture.locator(':scope > p > [data-unsupported="true"]').count(), 3);
  assert.equal(await fixture.locator(':scope > p').nth(1).locator('[data-unsupported]').count(), 0, '同文不等于同状态');
  assert.equal(await fixture.locator('[class*="z-[9999]"] [data-unsupported="true"]').count(), 1, '过滤空行不能使浮窗状态错位');
  assert.equal(await fixture.evaluate(element => element.scrollWidth <= element.clientWidth), true);
  assert.equal(await fixture.locator(':scope > p').evaluateAll(elements => elements.every(element => element.scrollWidth <= element.clientWidth)), true);
  await componentPage.screenshot({ path: join(evidence, '词缀状态组件-390.png'), fullPage: true });
  await componentPage.close();
  assert.deepEqual(errors, []);
  assert.ok(measurements.every(entry => entry.requests === 1));
  await writeFile(join(evidence, 'results.json'), JSON.stringify({ success: true, colors, measurements, previewRequests, errors }, null, 2), 'utf8');
  console.log(JSON.stringify({ success: true, colors, measurements, previewRequests, errors }, null, 2));
} catch (error) {
  await shot('失败现场');
  throw error;
} finally {
  await browser.close();
  await vite.close();
  bridge.close();
  await sessions.shutdown();
  await library.close();
}
