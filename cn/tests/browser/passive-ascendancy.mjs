import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { createServer } from 'vite';
import { startBridge } from '../../bridge/start.mjs';
import { BuildSessions } from '../../bridge/build-sessions.mjs';
import { LibraryStore } from '../../bridge/library-store.mjs';
import { createBridgeHttpServer } from '../../bridge/http-server.mjs';

// POB_CN_TEST_BUILD 可指定一个已保存的驱炎使 BD；原文件只读，保存和操作均在临时库中。
const root = resolve(import.meta.dirname, '../../..');
process.chdir(join(root, 'cn/web'));
const evidence = await mkdtemp(join(tmpdir(), 'pob-ascendancy-browser-'));
const source = process.env.POB_CN_TEST_BUILD ? await readFile(process.env.POB_CN_TEST_BUILD, 'utf8') : null;
const code = source ? JSON.parse(source).code : null;
const playwright = await import(process.env.POB_CN_PLAYWRIGHT_PATH ? pathToFileURL(process.env.POB_CN_PLAYWRIGHT_PATH).href : 'playwright');
const { chromium } = playwright.default ?? playwright;
const library = await new LibraryStore(join(evidence, 'library')).start();
const sessions = new BuildSessions({ createEngine: async () => {
  const directory = await mkdtemp(join(evidence, 'core-'));
  await mkdir(join(directory, 'Builds'));
  await mkdir(join(directory, 'files'));
  return startBridge(root, { command: join(root, 'Builds/luajit', process.platform === 'win32' ? 'luajit.exe' : 'luajit'), args: [join(root, 'cn/bridge/calc_server.lua')], cwd: join(root, 'src'),
    env: { ...process.env, POB_CN_SESSION_DIR: directory, LUA_PATH: '../runtime/lua/?.lua;../runtime/lua/?/init.lua;;' }, startupTimeoutMs: 30_000, requestTimeoutMs: 30_000 });
} });
const bridge = createBridgeHttpServer(sessions, { library });
bridge.listen(0, '127.0.0.1');
await once(bridge, 'listening');
const target = `http://127.0.0.1:${bridge.address().port}`;
const vite = await createServer({ root: join(root, 'cn/web'), configFile: join(root, 'cn/web/vite.config.ts'), server: { host: '127.0.0.1', port: 0, proxy: { '/api': target, '/health': target } } });
await vite.listen();
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.POB_CN_BROWSER ? { executablePath: process.env.POB_CN_BROWSER } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const a = await context.newPage(), b = await context.newPage();
const errors = [], measurements = [], queuedCommits = [];
for (const page of [a, b]) {
  page.setDefaultTimeout(30_000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
}
async function state(page) {
  return page.evaluate(() => {
    const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('build');
    return { code: store.canonicalBuild?.code, version: store.canonicalBuild?.version, session: store.sessionId,
      ascendancy: store.ascendancyName, nodes: [...store.allocatedNodes].sort((a, b) => a - b), modes: { ...store.allocationModes },
      stats: { ...store.stats }, error: store.lastCalculationError };
  });
}
async function settle(page, version) {
  await page.waitForFunction(previous => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const store = pinia._s.get('build');
    return store.canonicalBuild && store.canonicalBuild.version !== previous && !store.isCalculating && !store.isOpening && !pinia._s.get('library').busy;
  }, version);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const value = await state(page);
  assert.equal(value.error, null, JSON.stringify(value.error));
  return value;
}
async function point(page, id) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    return canvas && canvas.clientWidth > 300 && canvas.width === Math.floor(canvas.clientWidth * window.devicePixelRatio)
      && canvas.height === Math.floor(canvas.clientHeight * window.devicePixelRatio);
  });
  return page.locator('canvas').evaluate((canvas, id) => {
    const setup = canvas.__vueParentComponent.setupState;
    const node = setup.allNodes.find(node => node.id === id);
    if (!node) throw new Error(`缺少测试节点 ${id}`);
    setup.view.scale = 0.22;
    setup.view.x = -node.x * setup.view.scale;
    setup.view.y = -node.y * setup.view.scale;
    setup.drawCanvas();
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, id);
}
async function click(page, id, expected, mode = 0) {
  await page.bringToFront();
  await page.getByRole('group', { name: '天赋分配模式' }).getByRole('button', { name: ['公用', 'I', 'II'][mode], exact: true }).click();
  const position = await point(page, id), before = await state(page);
  const requests = [];
  const count = request => { if (request.url().includes('/api/') && !request.url().endsWith('/heartbeat')) requests.push(new URL(request.url()).pathname); };
  page.on('request', count);
  const started = performance.now();
  await page.mouse.move(position.x, position.y);
  await page.mouse.click(position.x, position.y);
  const value = await settle(page, before.version);
  assert.equal(value.ascendancy, expected);
  const header = page.getByTestId('character-ascendancy');
  assert.match(await header.innerText(), expected === 'Infernalist' ? /驱炎使/ : /命源法师/);
  assert.ok(value.nodes.includes(id));
  assert.equal(requests.filter(path => path === '/api/build/commit').length, 1, JSON.stringify(requests));
  assert.ok(!requests.includes('/api/calculate'), JSON.stringify(requests));
  page.off('request', count);
  measurements.push({ nodeId: id, mode, ascendancy: expected, visibleMs: Math.round(performance.now() - started), requests });
  return value;
}
try {
  console.log(`升华浏览器验收：${evidence}`);
  for (const [page, name] of [[a, '升华测试 A'], [b, '升华测试 B']]) {
    await page.goto(origin);
    await page.getByLabel('存档名称', { exact: true }).fill(name);
    if (code) {
      await page.getByRole('button', { name: '导入流派', exact: true }).click();
      await page.getByLabel('PoB 分享代码或 XML', { exact: true }).fill(code);
    }
    await page.getByRole('button', { name: code ? '导入并保存' : '新建', exact: true }).click();
    await settle(page);
    if (!code) {
      const changed = await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('build').setClassName('Infernalist'));
      assert.ok(changed.success, JSON.stringify(changed.error));
      await page.locator('canvas').waitFor();
      await click(page, 17754, 'Infernalist');
    }
  }
  const untouched = await state(b);
  assert.notEqual((await state(a)).session, untouched.session);
  const tree = JSON.parse(await readFile(join(root, 'cn/generated/web-data/tree_0_5.json'), 'utf8'));
  const byId = new Map(Object.values(tree.nodes).map(node => [node.id, node]));
  const regular = value => value.nodes.filter(id => !byId.get(id)?.ascendancyName).map(id => [id, value.modes[id] ?? 0]);
  const originalRegular = regular(await state(a));
  for (let round = 0; round < 3; round++) {
    for (const [id, name] of [[59822, 'Blood Mage'], [17754, 'Infernalist'], [8415, 'Blood Mage'], [32699, 'Infernalist']]) {
      const value = await click(a, id, name, round);
      assert.deepEqual(regular(value), originalRegular);
      assert.ok(value.nodes.every(nodeId => !byId.get(nodeId)?.ascendancyName || byId.get(nodeId).ascendancyName === name), '残留旧升华节点');
    }
  }
  assert.deepEqual(await state(b), untouched);
  const secondProjection = await b.evaluate(async untouched => {
    const response = await fetch('/api/build/projection', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pob-Session': untouched.session }, body: JSON.stringify({ code: untouched.code, expectedRevision: untouched.version, projectionScope: 'tree' }) });
    return response.json();
  }, untouched);
  assert.ok(secondProjection.success);
  assert.equal(secondProjection.data.build.ascendancyName, untouched.ascendancy);
  assert.deepEqual(secondProjection.data.output, untouched.stats);
  const saved = await click(a, 8415, 'Blood Mage');
  await a.getByRole('button', { name: '保存存档', exact: true }).click();
  await a.getByText('已保存', { exact: true }).first().waitFor();
  await a.getByRole('button', { name: '返回存档库', exact: true }).click();
  await a.getByRole('button', { name: /^升华测试 A/ }).click();
  const restored = await settle(a);
  assert.equal(restored.ascendancy, 'Blood Mage');
  assert.deepEqual(restored.nodes, saved.nodes);
  assert.deepEqual(restored.modes, saved.modes);
  assert.deepEqual(restored.stats, saved.stats);
  // 以实际画布点击验证错误可见，失败后乐观分配和规范文档均恢复。
  const foreign = byId.get(7120);
  assert.ok(foreign);
  assert.equal(foreign.ascendancyName, 'Witchhunter');
  const pos = await point(a, foreign.id);
  const response = a.waitForResponse(response => new URL(response.url()).pathname === '/api/build/commit');
  await a.mouse.move(pos.x, pos.y); await a.mouse.click(pos.x, pos.y);
  assert.equal((await (await response).json()).success, false);
  await a.getByText(/该升华不属于当前基础职业/).first().waitFor();
  const failed = await state(a);
  assert.equal(failed.code, restored.code);
  assert.equal(failed.version, restored.version);
  assert.deepEqual(failed.nodes, restored.nodes);
  assert.deepEqual(failed.stats, restored.stats);
  await a.screenshot({ path: join(evidence, '跨职业明确提示.png'), fullPage: true });
  await click(a, 17754, 'Infernalist');
  const beforeBurst = await state(a);
  const capture = response => {
    if (new URL(response.url()).pathname === '/api/build/commit') queuedCommits.push(response.json());
  };
  a.on('response', capture);
  for (const id of [59822, 32699, 8415]) {
    const position = await point(a, id);
    await a.mouse.move(position.x, position.y); await a.mouse.click(position.x, position.y);
  }
  await a.waitForFunction(version => {
    const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('build');
    return store.canonicalBuild?.version === version && !store.isCalculating;
  }, beforeBurst.version + 3);
  a.off('response', capture);
  const commits = await Promise.all(queuedCommits);
  assert.equal(commits.length, 3);
  for (const [index, result] of commits.entries()) {
    assert.ok(result.success, JSON.stringify(result.error));
    assert.equal(result.data.sourceRevision, beforeBurst.version + index);
    assert.equal(result.data.revision, beforeBurst.version + index + 1);
  }
  const burst = await settle(a, beforeBurst.version);
  assert.equal(burst.ascendancy, 'Blood Mage');
  assert.ok(burst.nodes.includes(8415) && !burst.nodes.includes(17754));
  assert.deepEqual(regular(burst), originalRegular);
  assert.deepEqual(await state(b), untouched);
  await a.screenshot({ path: join(evidence, '升华切换完成.png'), fullPage: true });
  assert.deepEqual(errors, []);
  if (source) assert.equal(await readFile(process.env.POB_CN_TEST_BUILD, 'utf8'), source, '用户原始存档被修改');
  await writeFile(join(evidence, 'results.json'), JSON.stringify({ measurements, errors, isolation: true, reopen: true, rollback: true, queuedCommits: commits.length }, null, 2), 'utf8');
  console.log(JSON.stringify({ measurements, errors }));
} finally {
  await browser.close();
  await vite.close();
  bridge.close();
  await sessions.shutdown();
  await library.close();
}
