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
import { verifyTranslationDisplays } from './translation-displays.mjs';
import { verifyUniqueCorruption } from './unique-corruption.mjs';
import { verifyCorruptionDisplay, verifyNoDesktopHints, verifyStoredItemPresentation } from './item-presentation.mjs';

const root = resolve(import.meta.dirname, '../../..');
process.chdir(join(root, 'cn/web'));
const evidence = await mkdtemp(join(tmpdir(), 'pob-unique-browser-'));
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
const a = await context.newPage(), b = await context.newPage();
const errors = [], measurements = [], languageChecks = [];
for (const page of [a, b]) {
  page.setDefaultTimeout(30_000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', async response => { if (response.status() >= 400 && response.url().includes('/api/')) console.log('接口失败', await response.text()); });
}
async function state(page) {
  return page.evaluate(() => {
    const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('build');
    return { session: store.sessionId, version: store.canonicalBuild?.version, code: store.canonicalBuild?.code, items: JSON.parse(JSON.stringify(store.itemLibrary)), stats: { ...store.stats } };
  });
}
async function settle(page, previous) {
  await page.waitForFunction(previous => {
    const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('build');
    return store.canonicalBuild && store.canonicalBuild.version !== previous && !store.isOpening && !store.isCalculating;
  }, previous);
  await page.getByTestId('spirit-value').waitFor();
  const value = await state(page);
  assert.equal((await page.getByTestId('spirit-value').textContent()).trim(), `${value.stats.SpiritUnreserved ?? ''} / ${value.stats.Spirit ?? ''}`);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return value;
}
const panel = () => a.getByTestId('unique-crafting');
async function ready() {
  await panel().getByTestId('unique-preview').waitFor();
  await panel().getByRole('button', { name: '官方预览', exact: true }).click({ trial: true });
}
async function open() {
  await a.getByRole('button', { name: /装备与珠宝制作工坊/ }).click();
  await a.getByRole('button', { name: '传奇制作', exact: true }).click();
  await panel().getByLabel('官方传奇目录').locator('option').first().waitFor({ state: 'attached' });
}
async function choose(id) {
  await panel().getByLabel('搜索传奇').fill('');
  await panel().getByLabel('传奇类别').selectOption('');
  await panel().getByLabel('官方传奇目录').selectOption(id);
  await ready();
}
async function save() {
  await a.bringToFront();
  const button = panel().getByRole('button', { name: /保存到物品库|保存并穿戴|保存修改/ });
  await button.click({ trial: true });
  const previous = await state(a);
  const start = performance.now();
  await button.click();
  await panel().waitFor({ state: 'detached' });
  const next = await settle(a, previous.version);
  measurements.push({ operation: '保存传奇至浏览器显示', milliseconds: Math.round(performance.now() - start) });
  return next;
}

async function assertLocaleIsolation(label) {
  const before = await state(a), requests = [];
  const count = request => { if (request.url().includes('/api/') && !request.url().endsWith('/sessions/heartbeat')) requests.push(request.url()); };
  a.on('request', count);
  try {
    const terms = await a.evaluate(async () => {
      const translation = await import('/src/utils/webTranslation.ts');
      await translation.setTranslationLocale('zh-TW');
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return [translation.translateWebItemName('Dueling Wand'), translation.translateWebItemName('Efficiency I'), translation.translateWebItemType('Warstaff')];
    });
    assert.deepEqual(terms, ['單挑法杖', '效率 I', '細杖']);
    const after = await state(a);
    for (const key of ['session', 'version', 'code', 'stats']) assert.deepEqual(after[key], before[key], `${label}切换显示语言不能改变 ${key}`);
    assert.deepEqual(after.items.map(item => [item.id, item.raw]), before.items.map(item => [item.id, item.raw]));
    assert.equal(await b.evaluate(async () => (await import('/src/utils/webTranslation.ts')).getTranslationLocale()), 'zh-CN');
    await a.evaluate(async () => {
      await (await import('/src/utils/webTranslation.ts')).setTranslationLocale('zh-CN');
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    assert.deepEqual(requests, [], '语言变化不得请求核心或保存数据');
    languageChecks.push({ view: label, requests: requests.length, unchanged: true });
  } finally { a.off('request', count); }
}
try {
  console.log(`传奇浏览器验收证据：${evidence}`);
  for (const [page, name] of [[a, '传奇验证 A'], [b, '传奇验证 B']]) {
    await page.goto(origin);
    await page.getByLabel('存档名称', { exact: true }).fill(name);
    await page.getByRole('button', { name: '新建', exact: true }).click();
    await settle(page);
    await page.getByRole('button', { name: '装备与物品', exact: true }).click();
  }
  const unchanged = await state(b);
  await open();
  assert.equal(await panel().getByLabel('官方传奇目录').locator('option').count(), 443);
  const corruptionChecks = await verifyUniqueCorruption({ page: a, panel, choose, ready, state, evidence });
  console.log('腐化浏览器验收：', JSON.stringify(corruptionChecks));
  for (const [id, expected, forbidden] of [
    ["Alpha's Howl, Armoured Cap", /自然滋养着强悍的灵魂/, /Nature respects|snow red|blood of the weak/],
    ['Amor Mandragora, Changeling Talisman', /艾兹麦魔符/, /Ezomyte|Weapon Range|Adds .* Physical Damage/],
    ["Apep's Supremacy, Voodoo Focus", /瓦尔法器/, /Vaal Focus/],
  ]) {
    await choose(id);
    const text = await panel().getByTestId('unique-preview').innerText();
    await verifyNoDesktopHints(panel().getByTestId('unique-preview'));
    assert.match(text, expected); assert.doesNotMatch(text, forbidden);
    if (id.startsWith('Amor')) {
      assert.match(text, /武器范围：1\.2 米/);
      assert.match(text, /附加 18 - 25 物理伤害/);
      assert.match(text, /不生效/);
    }
    await a.screenshot({ path: join(evidence, `传奇漏译-${id.split(',')[0]}.png`), fullPage: true });
  }
  await choose('Against the Darkness, Time-Lost Diamond');
  const chaosOption = await panel().getByLabel('选项 1', { exact: true }).locator('option').evaluateAll(options => options.find(option => /Chaos Resistance|混沌抗性/.test(option.textContent))?.value);
  assert.ok(chaosOption, '必须覆盖截图中的混沌抗性选项');
  await panel().getByLabel('选项 1', { exact: true }).selectOption(chaosOption); await ready();
  assert.match(await panel().getByTestId('unique-preview').innerText(), /范围内的小型天赋同时提供.*混沌抗性/);
  assert.doesNotMatch(await panel().innerText(), /Small Passive Skills|Source: Drops/);
  await assertLocaleIsolation('传奇身份和动态句式');
  await choose('Megalomaniac, Diamond');
  assert.equal(await panel().getByLabel('选项 1', { exact: true }).locator('option').count(), 874);
  await panel().getByLabel('搜索选项 1', { exact: true }).fill('Attack');
  assert.ok(await panel().getByLabel('选项 1', { exact: true }).locator('option').count() < 874);
  await choose('Mageblood, Utility Belt');
  for (let index = 1; index <= 4; index++) {
    await panel().getByLabel(`选项 ${index}`, { exact: true }).selectOption('1');
    await ready();
  }
  await panel().getByRole('tab', { name: 'PoB 源码', exact: true }).click();
  await panel().locator('pre').getByText(/Selected Alt Variant Three: 1/).waitFor();
  await panel().getByRole('tab', { name: '物品预览', exact: true }).click();
  // 延迟真实官方响应，确保后来选中的物品不会被旧模板覆盖。
  let release, announce, delivered;
  const gate = new Promise(resolve => { release = resolve; });
  const fetched = new Promise(resolve => { announce = resolve; });
  const delivery = new Promise(resolve => { delivered = resolve; });
  const hold = async route => { const response = await route.fetch(); announce(); await gate; await route.fulfill({ response }); delivered(); };
  await a.route('**/api/crafting/options', hold, { times: 1 });
  await panel().getByLabel('官方传奇目录').selectOption('Seeing Stars, Marching Mace');
  await fetched;
  await panel().getByLabel('官方传奇目录').selectOption('Morior Invictus, Grand Regalia');
  await ready();
  const latest = await panel().getByTestId('unique-preview').textContent();
  release();
  await delivery;
  await a.unroute('**/api/crafting/options', hold);
  await a.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await panel().getByTestId('unique-preview').textContent(), latest);
  const slider = panel().locator('input[type=range]').first();
  let optionsRequests = 0, calcRequests = 0;
  const count = request => { if (request.url().endsWith('/api/crafting/options')) optionsRequests++; if (request.url().endsWith('/api/items/preview')) calcRequests++; };
  a.on('request', count);
  await slider.evaluate(element => { for (const value of ['0.1', '0.3', '0.7', '1']) { element.value = value; element.dispatchEvent(new Event('input', { bubbles: true })); } });
  await ready();
  a.off('request', count);
  assert.equal(optionsRequests, 1);
  assert.equal(calcRequests, 0);
  const translatedPreview = await panel().getByTestId('unique-preview').innerText();
  assert.match(translatedPreview, /凝望之眼绝不会退缩/);
  assert.match(translatedPreview, /插槽：S S S S/);
  assert.match(translatedPreview, /需求：等级 65/);
  assert.doesNotMatch(translatedPreview, /The Unblinking Eye|Requires Level|Sockets:/);
  await assertLocaleIsolation('传奇制作');
  for (const width of [1440, 390]) {
    await a.setViewportSize({ width, height: 960 });
    assert.equal(await panel().evaluate(element => element.scrollWidth <= element.clientWidth), true);
    await a.screenshot({ path: join(evidence, `传奇制作-${width}.png`), fullPage: true });
  }
  await a.setViewportSize({ width: 1440, height: 960 });
  await panel().getByTestId('unique-corruption').getByRole('checkbox', { name: '腐化成品' }).check();
  await ready();
  await panel().getByTestId('unique-corruption').getByRole('slider', { name: /^腐化倍率 / }).first().evaluate(element => { element.value = '1'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  await ready();
  await verifyCorruptionDisplay(panel().getByTestId('unique-preview'));
  await panel().getByLabel('保存目标').selectOption('equipment:Body Armour');
  assert.equal(await panel().getByRole('button', { name: '保存并穿戴', exact: true }).isDisabled(), true);
  await panel().getByRole('button', { name: '官方预览', exact: true }).click();
  const first = await save();
  assert.equal(first.items.length, 1);
  assert.equal(first.items[0].rarity, 'UNIQUE');
  assert.match(first.items[0].raw, /\{corruptedRange:1\.22\}/);
  assert.equal((await state(b)).code, unchanged.code);
  await a.getByTitle('编辑传奇物品', { exact: true }).first().click();
  await ready();
  assert.equal(await panel().getByTestId('unique-corruption').getByRole('checkbox', { name: '腐化成品' }).isDisabled(), true);
  assert.equal(await a.getByRole('button', { name: '普通制作', exact: true }).isDisabled(), true);
  await panel().getByText('品质', { exact: true }).locator('input').fill('11');
  await panel().getByText('品质', { exact: true }).locator('input').press('Tab');
  await ready();
  await panel().getByRole('button', { name: '官方预览', exact: true }).click();
  const edited = await save();
  assert.equal(edited.items.length, 1);
  assert.equal(edited.items[0].id, first.items[0].id);
  assert.equal(edited.items[0].quality, 11);
  await a.getByRole('button', { name: '复制到公共物品池', exact: true }).first().click();
  const poolA = a.getByRole('region', { name: '公共物品池', exact: true });
  await poolA.getByText('已复制到公共物品池', { exact: true }).waitFor();
  assert.equal((await state(a)).code, edited.code);
  await b.reload();
  await settle(b);
  await b.getByRole('button', { name: '装备与物品', exact: true }).click();
  const poolB = b.getByRole('region', { name: '公共物品池', exact: true });
  await poolB.getByRole('listitem').getByRole('button').first().click();
  await verifyCorruptionDisplay(poolB);
  await poolB.getByRole('button', { name: '加入当前流派', exact: true }).click();
  const copied = await settle(b, unchanged.version);
  assert.equal(copied.items[0].raw, edited.items[0].raw);
  assert.equal((await state(a)).code, edited.code);
  await a.reload();
  await settle(a);
  assert.equal((await state(a)).items[0].raw, edited.items[0].raw);
  const itemPresentationChecks = await verifyStoredItemPresentation({ a, b, state, evidence });
  for (const [tab, heading] of [['生存与防御', '全维度生存与防御计算大盘'], ['战斗状态配置', '战斗条件与状态']]) {
    await a.getByRole('button', { name: tab, exact: true }).click();
    await a.getByRole('heading', { name: heading }).waitFor();
    if (tab === '生存与防御') {
      await a.getByText('生命池', { exact: true }).click();
      const detail = a.getByTestId('defence-detail');
      await detail.waitFor();
      assert.doesNotMatch(await detail.innerText(), /\bLifeRegen|\bLife Regeneration|\(base\)|\bper second\b|\bfalse\b/);
      await assertLocaleIsolation('生命池二级明细');
      await a.screenshot({ path: join(evidence, '生命池-二级明细.png'), fullPage: true });
      await detail.getByRole('button', { name: '关闭明细', exact: true }).click();
    }
    await assertLocaleIsolation(tab);
    await a.screenshot({ path: join(evidence, `${tab}-简中.png`), fullPage: true });
  }
  await a.getByRole('button', { name: '技能与宝石', exact: true }).click();
  await a.getByText('金字塔中层：击中秒伤与单次击中伤害核心拆解', { exact: true }).waitFor();
  let previousSkill = await state(a);
  await a.getByRole('button', { name: '新建技能组', exact: true }).click();
  await settle(a, previousSkill.version);
  await a.getByRole('button', { name: /新技能组.*空技能组/ }).click();
  await a.locator('select').filter({ has: a.locator('option').filter({ hasText: '选择要插入插槽的宝石...' }) }).selectOption('Ice Nova');
  previousSkill = await state(a);
  await a.getByRole('button', { name: '插入宝石', exact: true }).click();
  await settle(a, previousSkill.version);
  const mainSkill = a.getByRole('button', { name: '设为主技能', exact: true });
  if (await mainSkill.count() && await mainSkill.isEnabled()) {
    previousSkill = await state(a);
    await mainSkill.click();
    await settle(a, previousSkill.version);
  }
  await a.getByText('① 各元素击中伤害构成', { exact: true }).click();
  await a.getByRole('button', { name: /^[1-9][\d,.]* 至 [\d,.]+ ▶$/ }).first().click();
  const damageDetail = a.getByTestId('calcs-secondary-detail');
  await damageDetail.waitFor();
  const damageText = await damageDetail.innerText();
  assert.match(damageText, /来自技能石的基础伤害/);
  assert.match(damageText, /转换所得伤害/);
  assert.doesNotMatch(damageText, /\bto\b|damage from|Converted Damage|Inc\/red|More\/less|\bfalse\b/);
  await assertLocaleIsolation('冰霜伤害二级明细');
  await a.screenshot({ path: join(evidence, '冰霜伤害-二级明细.png'), fullPage: true });
  await assertLocaleIsolation('技能与伤害');
  await a.screenshot({ path: join(evidence, '技能与伤害-简中.png'), fullPage: true });
  await a.getByRole('button', { name: '装备与物品', exact: true }).click();
  await a.getByRole('button', { name: /装备与珠宝制作工坊/ }).click();
  const ordinaryPreview = a.getByRole('button', { name: /官方预览/ });
  await ordinaryPreview.click({ trial: true });
  await ordinaryPreview.click();
  await a.getByRole('button', { name: /保存到物品库/ }).click({ trial: true });
  await verifyNoDesktopHints(a.locator('[data-item-line-kind]').locator('..').first());
  await assertLocaleIsolation('普通制作');
  await a.screenshot({ path: join(evidence, '普通制作-简中.png'), fullPage: true });
  let actualBuildDisplayCheck;
  if (process.env.POB_CN_TRANSLATION_FIXTURE) {
    const displayPage = await context.newPage();
    displayPage.setDefaultTimeout(30_000);
    displayPage.on('pageerror', error => errors.push(error.message));
    try {
      actualBuildDisplayCheck = await verifyTranslationDisplays(displayPage, origin, process.env.POB_CN_TRANSLATION_FIXTURE, evidence);
    } catch (error) {
      await displayPage.screenshot({ path: join(evidence, '实际流派-失败现场.png'), fullPage: true });
      throw error;
    } finally { await displayPage.close(); }
  }
  assert.deepEqual(errors, []);
  await writeFile(join(evidence, 'results.json'), JSON.stringify({ success: true, measurements, corruptionChecks, itemPresentationChecks, optionsRequests, calcRequests, languageChecks, actualBuildDisplayCheck, errors }, null, 2), 'utf8');
  console.log(JSON.stringify({ success: true, measurements, corruptionChecks, itemPresentationChecks, optionsRequests, calcRequests, languageChecks, actualBuildDisplayCheck, errors }, null, 2));
} catch (error) {
  await a.screenshot({ path: join(evidence, '失败现场.png'), fullPage: true });
  throw error;
} finally {
  await browser.close();
  await vite.close();
  bridge.close();
  await sessions.shutdown();
  await library.close();
}
