import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { createServer } from 'vite';
import { startBridge } from '../../bridge/start.mjs';
import { BuildSessions } from '../../bridge/build-sessions.mjs';
import { LibraryStore } from '../../bridge/library-store.mjs';
import { createBridgeHttpServer } from '../../bridge/http-server.mjs';

const root = resolve(import.meta.dirname, '../../..');
process.chdir(join(root, 'cn/web'));
const evidence = await mkdtemp(join(tmpdir(), 'pob-multi-browser-'));
const playwright = await import(process.env.POB_CN_PLAYWRIGHT_PATH ? pathToFileURL(process.env.POB_CN_PLAYWRIGHT_PATH).href : 'playwright');
const { chromium } = playwright.default ?? playwright;
const library = await new LibraryStore(join(evidence, 'library')).start();
let startedCores = 0;
const sessions = new BuildSessions({ createEngine: async () => {
  const directory = await mkdtemp(join(evidence, 'core-'));
  await mkdir(join(directory, 'Builds'));
  await mkdir(join(directory, 'files'));
  const engine = await startBridge(root, {
    command: join(root, 'Builds/luajit', process.platform === 'win32' ? 'luajit.exe' : 'luajit'),
    args: [join(root, 'cn/bridge/calc_server.lua')], cwd: join(root, 'src'),
    env: { ...process.env, POB_CN_SESSION_DIR: directory, LUA_PATH: '../runtime/lua/?.lua;../runtime/lua/?/init.lua;;' },
    startupTimeoutMs: 30_000, requestTimeoutMs: 30_000,
  });
  startedCores++;
  return engine;
} });
const bridge = createBridgeHttpServer(sessions, { library });
bridge.listen(0, '127.0.0.1');
await once(bridge, 'listening');
const target = `http://127.0.0.1:${bridge.address().port}`;
const vite = await createServer({ root: join(root, 'cn/web'), configFile: join(root, 'cn/web/vite.config.ts'), server: {
  host: '127.0.0.1', port: 0, strictPort: false, proxy: { '/api': target, '/health': target },
} });
await vite.listen();
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
const secondVite = await createServer({ root: join(root, 'cn/web'), configFile: join(root, 'cn/web/vite.config.ts'), server: {
  host: '127.0.0.1', port: 0, strictPort: false, proxy: { '/api': target, '/health': target },
} });
await secondVite.listen();
const secondOrigin = `http://127.0.0.1:${secondVite.httpServer.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.POB_CN_BROWSER ? { executablePath: process.env.POB_CN_BROWSER } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
const errors = [];
const measurements = [];
let currentPage;

async function page(entry = origin) {
  const value = await context.newPage();
  value.setDefaultTimeout(30_000);
  value.on('pageerror', error => errors.push(error.message));
  value.on('requestfailed', request => console.log('网络请求失败：', request.url(), request.failure()?.errorText));
  value.on('response', async response => {
    if (new URL(response.url()).pathname.startsWith('/api/') && response.status() >= 400) {
      console.log('接口返回失败：', new URL(response.url()).pathname, await response.text());
    }
  });
  value.on('dialog', dialog => dialog.accept(dialog.type() === 'prompt' ? '验收 B 副本' : undefined));
  await value.goto(entry);
  await value.getByRole('heading', { name: '新建存档' }).waitFor();
  currentPage = value;
  return value;
}

async function state(value) {
  return value.evaluate(async () => {
    const stores = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s;
    const store = stores.get('build');
    const library = stores.get('library');
    return { session: store.sessionId, version: store.canonicalBuild?.version, code: store.canonicalBuild?.code,
      name: store.buildName, level: store.characterLevel, stats: { ...store.stats }, nodes: [...store.allocatedNodes],
      items: store.itemLibrary.map(item => ({ id: item.id, name: item.name, raw: item.raw })),
      equipment: { ...store.equippedSlots }, skills: JSON.parse(JSON.stringify(store.socketGroups)),
      busy: store.isCalculating || library.busy, error: library.error || store.lastCalculationError?.message,
      saved: store.savedBuild, dirty: library.dirty };
  });
}

async function settled(value, oldVersion) {
  await value.waitForFunction(old => {
    const stores = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia?._s;
    const store = stores?.get('build');
    const library = stores?.get('library');
    if (!store || !library) return false;
    return !!store.sessionId && !store.isCalculating && !store.isOpening && !library.busy && (old === undefined || store.canonicalBuild?.version !== old);
  }, oldVersion);
  const next = await state(value);
  assert.ok(!next.error, next.error);
  await value.getByRole('spinbutton').first().waitFor();
  assert.equal(await value.getByRole('spinbutton').first().inputValue(), String(next.level));
  await value.getByText(`${next.stats.Life} / ${next.stats.Life}`, { exact: true }).waitFor();
  await value.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return next;
}

async function level(value, next) {
  currentPage = value;
  await value.bringToFront();
  const before = await state(value);
  const started = performance.now();
  await value.getByRole('spinbutton').first().fill(String(next));
  await value.getByRole('spinbutton').first().press('Tab');
  const result = await settled(value, before.version);
  assert.equal(result.level, next);
  measurements.push({ operation: '等级修改至浏览器数值绘制', milliseconds: Math.round(performance.now() - started) });
  return result;
}

async function screenshot(value, name) {
  await value.screenshot({ path: join(evidence, `${name}.png`), fullPage: true });
  assert.equal(await value.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name} 横向溢出`);
}

try {
  console.log(`浏览器验收证据：${evidence}`);
  const a = await page();
  assert.equal(sessions.sessions.size, 0);
  assert.equal(startedCores, 0);
  await screenshot(a, '选择页-桌面');
  if (process.env.POB_CN_BROWSER_FIXTURE) {
    const fixture = JSON.parse(await readFile(process.env.POB_CN_BROWSER_FIXTURE, 'utf8'));
    await a.getByRole('button', { name: '导入流派', exact: true }).click();
    await a.getByLabel('PoB 分享代码或 XML').fill(fixture.canonicalBuild?.code ?? fixture.code);
  }
  await a.getByLabel('存档名称', { exact: true }).fill('验收 A');
  await a.route('**/api/sessions', route => route.fulfill({
    status: 404, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'route not found' }),
  }), { times: 1 });
  await a.getByRole('button', { name: process.env.POB_CN_BROWSER_FIXTURE ? '导入并保存' : '新建', exact: true }).click();
  await a.getByText(/后端不支持独立计算会话/).waitFor();
  assert.equal(await a.getByLabel('存档名称', { exact: true }).inputValue(), '验收 A');
  assert.equal(sessions.sessions.size, 0);
  assert.equal(startedCores, 0);
  console.log('通过：旧后端 404 显示接口不匹配，保留表单且不产生虚假会话。');
  await a.getByRole('button', { name: process.env.POB_CN_BROWSER_FIXTURE ? '导入并保存' : '新建', exact: true }).click();
  let stateA = await settled(a);
  assert.equal(stateA.name, '验收 A');
  assert.equal(stateA.dirty, false);
  const b = await page(secondOrigin);
  await b.getByRole('button').filter({ hasText: '验收 A' }).click();
  let stateB = await settled(b);
  assert.notEqual(stateA.session, stateB.session);
  assert.notEqual(sessions.get(stateA.session).engine.child.pid, sessions.get(stateB.session).engine.child.pid);
  for (let round = 0; round < 3; round++) {
    stateA = await level(a, 90 + round);
    assert.equal((await state(b)).code, stateB.code);
    stateB = await level(b, 70 + round);
    assert.equal((await state(a)).code, stateA.code);
  }
  console.log('通过：两个不同前端入口连接同一后端，同存档打开为独立核心，三轮修改互不影响且浏览器数值更新。');
  await a.getByRole('button', { name: '保存存档', exact: true }).click();
  await settled(a);
  await b.getByRole('button', { name: '保存存档', exact: true }).click();
  await b.getByText('此存档已在另一网页中更新，请另存或重新载入，不能直接覆盖。', { exact: true }).waitFor();
  assert.equal((await state(b)).code, stateB.code);
  await b.getByRole('button', { name: '另存为', exact: true }).first().click();
  stateB = await settled(b);
  assert.equal(stateB.name, '验收 B 副本');
  assert.equal((await library.list('builds')).length, 2);
  await a.reload();
  stateA = await settled(a);
  assert.equal(stateA.level, 92);
  assert.equal(stateA.name, '验收 A');
  assert.equal((await state(b)).name, '验收 B 副本');
  console.log('通过：保存冲突不会覆盖，另存成功，刷新恢复本页草稿。');

  if (process.env.POB_CN_BROWSER_FIXTURE) {
    currentPage = a;
    await a.bringToFront();
    await a.locator('canvas').waitFor();
    const point = await a.locator('canvas').evaluate(canvas => {
      const setup = canvas.__vueParentComponent.setupState;
      const rect = canvas.getBoundingClientRect();
      return setup.allNodes.filter(node => setup.store.allocatedNodes.has(node.id) && node.type !== 'Socket' && !node.ascendancyName)
        .map(node => ({ id: node.id, x: rect.left + rect.width / 2 + setup.view.x + node.x * setup.view.scale, y: rect.top + rect.height / 2 + setup.view.y + node.y * setup.view.scale }))
        .find(point => point.x > rect.left + 40 && point.x < rect.right - 40 && point.y > rect.top + 100 && point.y < rect.bottom - 40);
    });
    assert.ok(point, '需要可点击的已分配天赋节点');
    for (let round = 0; round < 3; round++) {
      const before = await state(a);
      const started = performance.now();
      await a.mouse.move(point.x, point.y);
      await a.mouse.click(point.x, point.y);
      stateA = await settled(a, before.version);
      assert.notEqual(stateA.nodes.includes(point.id), before.nodes.includes(point.id));
      assert.equal((await state(b)).code, stateB.code);
      measurements.push({ operation: '天赋点击至浏览器数值绘制', milliseconds: Math.round(performance.now() - started) });
    }
    await a.getByRole('button', { name: '技能与宝石', exact: true }).click();
    await a.locator('main input[type=number][min="1"]').first().waitFor();
    for (let round = 0; round < 3; round++) {
      const before = await state(a);
      const gem = a.locator('main input[type=number][min="1"]').first();
      const old = Number(await gem.inputValue());
      const started = performance.now();
      await gem.fill(String(old > 1 ? old - 1 : old + 1));
      await gem.press('Tab');
      stateA = await settled(a, before.version);
      assert.notDeepEqual(stateA.skills, before.skills);
      assert.equal((await state(b)).code, stateB.code);
      measurements.push({ operation: '技能等级修改至浏览器数值绘制', milliseconds: Math.round(performance.now() - started) });
    }
    await a.getByRole('button', { name: '装备与物品', exact: true }).click();
    for (let round = 0; round < 3; round++) {
      const before = await state(a);
      const started = performance.now();
      await a.getByTitle('卸下此装备 (保留在流派物品库中)', { exact: true }).first().click();
      stateA = await settled(a, before.version);
      assert.notDeepEqual(stateA.equipment, before.equipment);
      assert.equal((await state(b)).code, stateB.code);
      measurements.push({ operation: '卸下装备至浏览器数值绘制', milliseconds: Math.round(performance.now() - started) });
    }
    console.log('通过：天赋、技能、装备各三轮真实页面操作，另一页面的官方文档保持不变。');
  }

  if (stateA.items.length) {
    currentPage = a;
    await a.getByRole('button', { name: '装备与物品', exact: true }).click();
    await a.getByRole('button', { name: '复制到公共物品池', exact: true }).first().click();
    await a.getByRole('region', { name: '公共物品池', exact: true }).getByText('已复制到公共物品池', { exact: true }).waitFor();
    assert.equal((await state(a)).code, stateA.code);
    assert.equal((await library.list('items')).length, 1);
    const source = (await library.list('items'))[0];
    currentPage = b;
    await b.bringToFront();
    await b.getByRole('button', { name: '天赋树', exact: true }).click();
    await b.getByRole('button', { name: '公共物品池', exact: true }).click();
    const pool = b.getByRole('dialog');
    await pool.locator('li button').first().click();
    assert.equal(await pool.locator('section p').count(), source.item.displayLines.length, '公共池必须完整展示官方物品行');
    await pool.getByRole('button', { name: '加入当前流派', exact: true }).click();
    await pool.getByText('已加入当前 BD', { exact: true }).waitFor();
    const added = await state(b);
    assert.equal(added.items.length, stateB.items.length + 1);
    assert.equal((await state(a)).code, stateA.code);
    await pool.getByRole('button', { name: '刷新穿戴槽位', exact: true }).click();
    await b.getByLabel('穿戴槽位', { exact: true }).locator('option').nth(1).waitFor({ state: 'attached' });
    const slot = await b.getByLabel('穿戴槽位', { exact: true }).locator('option').nth(1).getAttribute('value');
    await b.getByLabel('穿戴槽位', { exact: true }).selectOption(slot);
    await pool.getByRole('button', { name: '加入并穿戴', exact: true }).click();
    await pool.getByText('已加入当前 BD 并穿戴', { exact: true }).waitFor();
    stateB = await state(b);
    assert.equal(stateB.items.length, added.items.length + 1);
    assert.equal((await state(a)).code, stateA.code);
    await screenshot(b, '公共物品池-桌面');
    await b.setViewportSize({ width: 390, height: 844 });
    await screenshot(b, '公共物品池-移动');
    await b.setViewportSize({ width: 1440, height: 960 });
    await pool.getByRole('button', { name: '删除公共物品', exact: true }).click();
    await pool.getByText('公共物品池为空', { exact: true }).waitFor();
    assert.equal((await state(a)).code, stateA.code);
    assert.equal((await state(b)).code, stateB.code);
    await pool.getByRole('button', { name: '关闭公共物品池' }).click();
    console.log(`通过：公共物品复制、加入、穿戴、删除不改动来源与其他副本（${source.id}）。`);
  }

  currentPage = a;
  await a.bringToFront();
  await a.getByRole('button', { name: '天赋树', exact: true }).click();
  await a.locator('canvas').waitFor();
  await a.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas || canvas.width < 400 || canvas.height < 200) return false;
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let visible = 0;
    for (let i = 0; i < data.length; i += 4) if (Math.max(data[i], data[i + 1], data[i + 2]) > 35) visible++;
    return visible > 1000;
  });
  const pixels = await a.locator('canvas').evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let visible = 0;
    for (let i = 0; i < data.length; i += 4) if (Math.max(data[i], data[i + 1], data[i + 2]) > 35) visible++;
    return visible;
  });
  assert.ok(pixels > 1000, `天赋画布有效像素不足：${pixels}`);
  await screenshot(a, '工作区-桌面');
  currentPage = b;
  await b.bringToFront();
  const beforeRecovery = await state(b);
  await sessions.close(beforeRecovery.session);
  await b.getByRole('spinbutton').first().fill('60');
  await b.getByRole('spinbutton').first().press('Tab');
  await b.getByRole('button', { name: '恢复当前草稿', exact: true }).waitFor();
  assert.equal((await state(b)).code, beforeRecovery.code);
  assert.equal((await state(a)).code, stateA.code);
  await b.getByRole('button', { name: '恢复当前草稿', exact: true }).click();
  const recovered = await settled(b);
  assert.notEqual(recovered.session, beforeRecovery.session);
  assert.equal(recovered.code, beforeRecovery.code);
  assert.equal(recovered.name, beforeRecovery.name);
  assert.equal(recovered.dirty, beforeRecovery.dirty);
  console.log('通过：会话丢失时错误可见，恢复保留本页已确认草稿且不影响另一页面。');
  const c = await page();
  assert.equal((await state(c)).session, '');
  const draft = await a.evaluate(() => sessionStorage.getItem('pob_nextgen_build_state'));
  await c.evaluate(draft => sessionStorage.setItem('pob_nextgen_build_state', draft), draft);
  await c.goto(`${origin}/?copied=1`);
  await c.getByRole('heading', { name: '新建存档' }).waitFor();
  assert.equal((await state(c)).session, '');
  await c.reload();
  await c.getByRole('heading', { name: '新建存档' }).waitFor();
  assert.equal((await state(c)).session, '');
  await c.setViewportSize({ width: 390, height: 844 });
  await screenshot(c, '选择页-移动');
  console.log('通过：新页面不继承文档、空选择页刷新不加载核心、天赋画布非空。');
  assert.deepEqual(errors, []);
  await writeFile(join(evidence, 'results.json'), JSON.stringify({ success: true, startedCores, measurements, canvasPixels: pixels, pageErrors: errors }, null, 2), 'utf8');
} catch (error) {
  if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: join(evidence, '失败现场.png'), fullPage: true });
  await writeFile(join(evidence, 'failure.json'), JSON.stringify({ error: error.stack, pageErrors: errors, measurements }, null, 2), 'utf8');
  throw error;
} finally {
  await browser.close();
  await secondVite.close();
  await vite.close();
  bridge.close();
  await sessions.shutdown();
  await library.close();
}
