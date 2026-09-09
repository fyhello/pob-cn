import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { inflateSync } from 'node:zlib';
import { createServer } from 'vite';
import { startBridge } from '../../bridge/start.mjs';
import { BuildSessions } from '../../bridge/build-sessions.mjs';
import { LibraryStore } from '../../bridge/library-store.mjs';
import { createBridgeHttpServer } from '../../bridge/http-server.mjs';

// 探针与旧源码只进入隔离测试服务；正常页面不加载计时、旧实现或测试存档。
const root = resolve(import.meta.dirname, '../../..');
process.chdir(join(root, 'cn/web'));
const fixturePath = process.env.POB_CN_BROWSER_FIXTURE;
assert.ok(fixturePath, '请通过 POB_CN_BROWSER_FIXTURE 指定真实 BD 的 JSON 存档');
const fixtureBefore = await readFile(fixturePath);
const fixture = JSON.parse(fixtureBefore);
const code = fixture.canonicalBuild?.code ?? fixture.code;
assert.ok(code, '存档缺少官方分享代码');
const evidence = await mkdtemp(join(tmpdir(), 'pob-translation-performance-'));
const baseline = process.env.POB_CN_PERF_BASELINE_DIR;
const dictionaryUpdate = process.env.POB_CN_PERF_DICTIONARY_UPDATE === '1';
const playwright = await import(process.env.POB_CN_PLAYWRIGHT_PATH ? pathToFileURL(process.env.POB_CN_PLAYWRIGHT_PATH).href : 'playwright');
const { chromium } = playwright.default ?? playwright;
const browser = await chromium.launch({ headless: true, ...(process.env.POB_CN_BROWSER ? { executablePath: process.env.POB_CN_BROWSER } : {}) });
const results = [];

async function state(page, display = false) {
  return page.evaluate(display => {
    const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('build');
    return { version: store.canonicalBuild?.version, code: store.canonicalBuild?.code, stats: { ...store.stats },
      nodes: [...store.allocatedNodes].sort((a, b) => a - b), modes: { ...store.allocationModes },
      slots: { ...store.equippedSlots }, jewels: { ...store.socketedJewels },
      items: store.itemLibrary.map(item => ({ id: item.id, raw: item.raw, ...(display ? { name: item.name_cn, rows: item.displayRows } : {}) })),
      error: store.lastCalculationError?.message };
  }, display);
}

async function idle(page) {
  await page.waitForFunction(() => {
    const store = document.querySelector('#app').__vue_app__?.config.globalProperties.$pinia._s.get('build');
    return store?.canonicalBuild && !store.isOpening && !store.isCalculating;
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal((await state(page)).error, undefined);
}

async function installProbe(page) {
  await page.evaluate(() => {
    const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('build');
    const side = document.querySelector('[data-testid="spirit-value"]').closest('aside');
    const format = side.__vueParentComponent.setupState.formatNumber;
    if (typeof format !== 'function') throw new Error('找不到侧栏实际使用的数值格式化函数');
    const cells = () => Object.fromEntries(['总输出秒伤', '单次击中伤害', '生命', '魔力'].map(label => {
      const node = [...side.querySelectorAll('span')].find(node => node.textContent === label);
      if (!node?.nextElementSibling) throw new Error('找不到侧栏数值：' + label);
      return [label, node.nextElementSibling.textContent.trim()];
    }));
    const probe = window.__pobPerformance = { active: null, cells };
    for (const type of ['mousedown', 'click', 'change']) document.addEventListener(type, event => {
      const row = probe.active;
      if (row && row.eventType === type && row.inputAt === undefined && event.isTrusted) row.inputAt = performance.now();
    }, true);
    const originalFetch = window.fetch;
    window.fetch = async function (input, init) {
      const path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname;
      const row = probe.active;
      if (row && path.startsWith('/api/') && !path.endsWith('/heartbeat')) row.requests.push(path);
      if (row && path === row.path) row.requestAt = performance.now();
      const response = await originalFetch.call(this, input, init);
      if (row && path === row.path) {
        row.responseAt = performance.now();
        const json = response.json.bind(response);
        response.json = async () => { const value = await json(); row.jsonAt = performance.now(); return value; };
      }
      return response;
    };
    store.$onAction(({ name, after }) => {
      const row = probe.active;
      if (!row || name !== 'applyOfficialProjection') return;
      row.applyAt = performance.now();
      after(() => { row.appliedAt = performance.now(); });
    });
    const check = () => {
      const row = probe.active;
      if (!row || row.domAt !== undefined || row.appliedAt === undefined || store.isCalculating || store.canonicalBuild.version <= row.version) return;
      const expected = { '总输出秒伤': format(store.stats.TotalDPS), '单次击中伤害': format(store.stats.AverageDamage),
        '生命': `${store.stats.Life || 0} / ${store.stats.Life || 0}`, '魔力': `${store.stats.Mana || 0} / ${store.stats.Mana || 0}` };
      const shown = cells();
      if (!Object.keys(expected).every(key => expected[key] === shown[key])) return;
      if (!Object.keys(shown).some(key => shown[key] !== row.before[key])) return;
      row.domAt = performance.now();
      row.shown = shown;
      requestAnimationFrame(() => requestAnimationFrame(() => { row.paintedAt = performance.now(); }));
    };
    new MutationObserver(check).observe(side, { subtree: true, childList: true, characterData: true });
  });
}

async function measure(page, phase, kind, round, direction, eventType, path, work, engineRecords) {
  const start = await state(page);
  const engineOffset = engineRecords.length;
  await page.evaluate(({ kind, round, direction, eventType, path, version }) => {
    const probe = window.__pobPerformance;
    probe.active = { kind, round, direction, eventType, path, version, before: probe.cells(), requests: [] };
  }, { kind, round, direction, eventType, path, version: start.version });
  await work();
  await page.waitForFunction(() => window.__pobPerformance.active.paintedAt !== undefined || document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('build').lastCalculationError);
  const current = await state(page);
  assert.equal(current.error, undefined);
  assert.equal(current.version, start.version + 1, '每个输入必须只提交一次真实修改');
  const timing = await page.evaluate(() => {
    const p = window.__pobPerformance.active;
    for (const key of ['inputAt', 'requestAt', 'responseAt', 'jsonAt', 'applyAt', 'appliedAt', 'domAt', 'paintedAt']) if (!Number.isFinite(p[key])) throw new Error('缺少实际阶段时间：' + key);
    return { eventToRequestMs: p.requestAt - p.inputAt, requestToJsonMs: p.jsonAt - p.requestAt,
      projectionMs: p.appliedAt - p.applyAt, jsonToDomMs: p.domAt - p.jsonAt,
      domMs: p.domAt - p.inputAt, visibleMs: p.paintedAt - p.inputAt, requests: p.requests, shown: p.shown };
  });
  const mutations = timing.requests.filter(path => ['/api/build/commit', '/api/skills/commit', '/api/items/assign'].includes(path));
  assert.deepEqual(mutations, [path]);
  const core = engineRecords.slice(engineOffset).filter(row => ['commitBuildChanges', 'commitSkillChange', 'assignOfficialItem'].includes(row.action));
  assert.equal(core.length, 1, '每次修改只进入一次对应官方事务');
  assert.equal(core[0].counts.buildOutput, 1, '必须执行真实官方计算且不重复计算');
  assert.equal(inflateSync(Buffer.from(current.code, 'base64url')).toString('utf8'), core[0].xml, '浏览器保存文档必须逐字透传官方 XML');
  const row = { phase, kind, round, direction, ...timing, coreRoundTripMs: core[0].ms, coreCounts: core[0].counts,
    state: current, xml: core[0].xml };
  if (round === 1 || round === 5) {
    await page.screenshot({ path: join(evidence, `${phase}-${kind}-${round}-${direction}.png`), fullPage: true });
    row.screenshotUpperMs = await page.evaluate(() => performance.now() - window.__pobPerformance.active.inputAt);
  }
  await page.evaluate(() => { window.__pobPerformance.active = null; });
  console.log(JSON.stringify({ phase, kind, round, direction, visibleMs: Math.round(row.visibleMs), projectionMs: Math.round(row.projectionMs) }));
  return row;
}

async function runPhase(phase) {
  const directory = join(evidence, phase);
  await mkdir(directory);
  const library = await new LibraryStore(join(directory, 'library')).start();
  const engineRecords = [];
  const sessions = new BuildSessions({ createEngine: async () => {
    const sessionDirectory = await mkdtemp(join(directory, 'core-'));
    await mkdir(join(sessionDirectory, 'Builds')); await mkdir(join(sessionDirectory, 'files'));
    const engine = await startBridge(root, { command: join(root, 'Builds/luajit', process.platform === 'win32' ? 'luajit.exe' : 'luajit'),
      args: [join(root, 'cn/tests/bridge/helpers/tooltip-probe.lua')], cwd: join(root, 'src'),
      env: { ...process.env, POB_CN_SESSION_DIR: sessionDirectory, POB_CN_REVIEW_ADAPTER: join(root, 'cn/lua/real-calc-adapter.lua'), LUA_PATH: '../runtime/lua/?.lua;../runtime/lua/?/init.lua;;' }, startupTimeoutMs: 30_000, requestTimeoutMs: 30_000 });
    const request = engine.request.bind(engine);
    engine.request = async input => {
      const start = performance.now(), result = await request(input);
      engineRecords.push({ action: input.action, ms: performance.now() - start, counts: result.review || {}, xml: result.data?.xml });
      return result;
    };
    return engine;
  } });
  const bridge = createBridgeHttpServer(sessions, { library });
  bridge.listen(0, '127.0.0.1'); await once(bridge, 'listening');
  const target = `http://127.0.0.1:${bridge.address().port}`;
  const overrides = phase === '修复前' ? new Map(await Promise.all([
    ['cn/web/src/stores/buildStore.ts', 'buildStore.ts'], ['cn/shared/translation-runtime.mjs', 'translation-runtime.mjs'],
    ...(dictionaryUpdate ? [['cn/web/src/utils/webTranslation.ts', 'webTranslation.ts'],
      ['cn/generated/web-data/translations.json', 'translations.json'], ['cn/generated/web-data/translations.zh-TW.json', 'translations.zh-TW.json']] : []),
  ].map(async ([file, name]) => [join(root, file).replaceAll('\\', '/'), await readFile(join(baseline, name), 'utf8')]))) : new Map();
  const vite = await createServer({ root: join(root, 'cn/web'), configFile: join(root, 'cn/web/vite.config.ts'), cacheDir: join(directory, 'vite-cache'),
    plugins: [{ name: 'isolated-performance-baseline', enforce: 'pre', transform(_source, id) { return overrides.get(id.split('?')[0].replaceAll('\\', '/')); } }],
    server: { host: '127.0.0.1', port: 0, proxy: { '/api': target, '/health': target } } });
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  const errors = [], records = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(origin);
    await page.getByRole('button', { name: '导入流派', exact: true }).click();
    await page.getByLabel('PoB 分享代码或 XML').fill(code);
    await page.getByLabel('存档名称', { exact: true }).fill('翻译性能隔离验证');
    await page.getByRole('button', { name: '导入并保存', exact: true }).click();
    await page.getByTestId('spirit-value').waitFor(); await idle(page);
    const layout = await page.locator('canvas').boundingBox();
    assert.ok(layout && layout.y + layout.height <= 1001 && layout.width > 500, '测试页面必须加载真实布局，画布完整位于视口内');
    await installProbe(page);
    const initial = await state(page);
    const candidate = await page.evaluate(async () => {
      const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('build');
      const response = await fetch('/api/stats', { headers: { 'X-Pob-Session': store.sessionId } });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error('无法读取官方可分配节点');
      return result.reviewCandidates.find(node => (node.stats || []).some(line => /^\d+% increased (?:Spell Damage|maximum Life|maximum Mana)$/.test(line)));
    });
    assert.ok(candidate, '真实 BD 需要相邻的伤害、生命或魔力节点以核验数值实际变化');
    const point = await page.locator('canvas').evaluate((canvas, id) => {
      const setup = canvas.__vueParentComponent.setupState, node = setup.allNodes.find(node => node.id === id);
      setup.view.scale = 0.22; setup.view.x = -node.x * setup.view.scale; setup.view.y = -node.y * setup.view.scale; setup.drawCanvas();
      const box = canvas.getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    }, candidate.id);
    for (let round = 1; round <= 5; round++) for (const direction of ['分配', '取消']) {
      records.push(await measure(page, phase, '天赋', round, direction, 'mousedown', '/api/build/commit', async () => {
        await page.mouse.move(point.x, point.y); await page.mouse.click(point.x, point.y);
      }, engineRecords));
      assert.equal((await state(page)).nodes.includes(candidate.id), direction === '分配');
    }
    assert.deepEqual((await state(page)).stats, initial.stats);
    await page.getByRole('button', { name: '技能与宝石', exact: true }).click(); await idle(page);
    await page.locator('main aside').getByRole('button').filter({ hasText: '主输出' }).click(); await idle(page);
    const skill = await page.evaluate(() => {
      const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('build');
      const group = store.socketGroups[store.selectedCalculationSkillIndex], name = store.skillBreakdown?.dpsPipeline?.skillName;
      const index = group.gems.findIndex(gem => gem.name === name);
      if (!group.editable || index < 0 || group.gems[index].level <= 1) throw new Error('官方当前伤害技能必须对应可编辑且等级大于 1 的宝石：' + name);
      return { name, index, level: group.gems[index].level };
    });
    const levelInput = page.locator('main aside section input[type="number"][min="1"]').nth(skill.index);
    for (let round = 1; round <= 5; round++) for (const direction of ['降低等级', '恢复等级']) {
      const level = direction === '降低等级' ? skill.level - 1 : skill.level;
      records.push(await measure(page, phase, '技能', round, direction, 'change', '/api/skills/commit', async () => {
        await levelInput.fill(String(level)); await levelInput.press('Tab');
      }, engineRecords));
      assert.equal(await levelInput.inputValue(), String(level));
    }
    await page.getByRole('button', { name: '装备与物品', exact: true }).click(); await idle(page);
    const amuletName = await page.evaluate(() => {
      const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('build');
      if (!store.equippedItems.Amulet) throw new Error('真实 BD 需要已装备项链');
      return store.equippedItems.Amulet.name_cn;
    });
    const slot = page.locator('.items-panel div.group').filter({ has: page.locator('svg[aria-label="项链"]') });
    for (let round = 1; round <= 5; round++) {
      records.push(await measure(page, phase, '装备', round, '卸下', 'click', '/api/items/assign', () => slot.getByTitle('卸下此装备 (保留在流派物品库中)', { exact: true }).click(), engineRecords));
      await slot.getByTitle('打开可选装备选择框', { exact: true }).click();
      const picker = page.locator('.fixed').filter({ has: page.getByRole('heading', { name: '选择装备：项链', exact: true }) });
      const itemRow = picker.locator('div.group').filter({ has: page.getByText(amuletName, { exact: true }) });
      records.push(await measure(page, phase, '装备', round, '装回', 'click', '/api/items/assign', () => itemRow.getByRole('button', { name: '穿戴', exact: true }).click(), engineRecords));
    }
    const final = await state(page, true);
    assert.deepEqual(final.stats, initial.stats);
    assert.deepEqual(final.nodes, initial.nodes);
    assert.deepEqual(final.slots, initial.slots);
    assert.deepEqual(final.items.map(({ id, raw }) => ({ id, raw })), initial.items);
    await page.getByRole('button', { name: '保存存档', exact: true }).click(); await idle(page);
    await page.reload(); await page.getByTestId('spirit-value').waitFor(); await idle(page);
    const reopened = await state(page, true);
    assert.equal(reopened.code, final.code, '保存重开不得改变官方文档');
    assert.deepEqual(reopened.stats, final.stats);
    assert.deepEqual(reopened.items, final.items);
    assert.deepEqual(errors, []);
    return { phase, candidate, skill, records, initial, final, reopened, errors };
  } catch (error) {
    await page.screenshot({ path: join(evidence, `${phase}-失败现场.png`), fullPage: true });
    await writeFile(join(directory, 'partial.json'), JSON.stringify({ records, errors, current: await state(page), probe: await page.evaluate(() => window.__pobPerformance?.active), error: error.message }, null, 2), 'utf8');
    throw error;
  } finally {
    await context.close(); await vite.close(); bridge.close(); await sessions.shutdown(); await library.close();
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

try {
  console.log(`翻译性能验收证据：${evidence}`);
  for (const phase of baseline ? ['修复前', '修复后'] : ['修复后']) results.push(await runPhase(phase));
  if (baseline) {
    const [before, after] = results;
    assert.equal(before.records.length, after.records.length);
    for (const [index, row] of before.records.entries()) {
      const actual = after.records[index];
      assert.deepEqual([...actual.requests].sort(), [...row.requests].sort(), `${row.kind} ${row.round} ${row.direction} 的接口请求次数必须与修复前相同`);
      for (const key of ['stats', 'nodes', 'modes', 'slots', 'jewels', 'items']) assert.deepEqual(actual.state[key], row.state[key], `${row.kind} ${row.round} ${row.direction} 的 ${key} 必须与修复前相同`);
      assert.equal(typeof row.xml, 'string'); assert.equal(typeof actual.xml, 'string');
    }
    if (dictionaryUpdate) {
      const originalLines = item => ({ id: item.id, raw: item.raw, name: item.name, rows: item.rows.flatMap(row => row.raw.split('\n').map(raw => ({ raw, unsupported: row.unsupported }))) });
      assert.deepEqual(after.final.items.map(originalLines), before.final.items.map(originalLines), '补译允许改变显示文字，但原文、物品身份和不生效状态必须不变');
      for (const kind of ['天赋', '技能', '装备']) {
        const a = after.records.filter(row => row.kind === kind), b = before.records.filter(row => row.kind === kind);
        assert.ok(median(a.map(row => row.jsonToDomMs)) <= Math.max(100, median(b.map(row => row.jsonToDomMs)) + 30), `${kind}显示投影不得出现秒级回归`);
        assert.ok(median(a.map(row => row.visibleMs)) <= Math.max(300, median(b.map(row => row.visibleMs)) * 1.35 + 80), `${kind}端到端耗时不得显著回归`);
      }
    } else {
      assert.deepEqual(after.final.items, before.final.items, '全部物品译文和不生效状态必须保持一致');
      for (const kind of ['天赋', '技能', '装备']) assert.ok(median(after.records.filter(row => row.kind === kind).map(row => row.visibleMs)) < median(before.records.filter(row => row.kind === kind).map(row => row.visibleMs)) / 2, `${kind}必须实际消除主要延迟`);
    }
  }
  assert.deepEqual(await readFile(fixturePath), fixtureBefore, '用户原始存档必须字节不变');
  const summary = results.flatMap(({ phase, records }) => ['天赋', '技能', '装备'].map(kind => {
    const rows = records.filter(row => row.kind === kind);
    return { phase, kind, samples: rows.length, medianVisibleMs: median(rows.map(row => row.visibleMs)),
      minVisibleMs: Math.min(...rows.map(row => row.visibleMs)), maxVisibleMs: Math.max(...rows.map(row => row.visibleMs)),
      medianRequestToJsonMs: median(rows.map(row => row.requestToJsonMs)), medianProjectionMs: median(rows.map(row => row.projectionMs)),
      medianJsonToDomMs: median(rows.map(row => row.jsonToDomMs)), mutationRequests: rows.length };
  }));
  await writeFile(join(evidence, 'results.json'), JSON.stringify({ success: true, summary, results }, null, 2), 'utf8');
  console.log(JSON.stringify({ success: true, summary }, null, 2));
} finally { await browser.close(); }
