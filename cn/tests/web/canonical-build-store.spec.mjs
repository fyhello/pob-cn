import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const storePath = new URL('../../web/src/stores/buildStore.ts', import.meta.url);

async function loadStore(fetch, { useRealPinia = false } = {}) {
  const source = await readFile(storePath, 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const storage = new Map();
  const identity = value => value;
  const pinia = useRealPinia ? require('pinia') : null;
  let nextSessionId = 0;
  const sessionFetch = (url, init) => {
    if (url === '/api/sessions') return Promise.resolve({ ok: true, json: async () => ({ success: true, sessionId: `test-${++nextSessionId}` }) });
    if (url === '/api/sessions/close') return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
    return fetch(url, init);
  };
  const bridgeModule = { exports: {} };
  const bridgeSource = ts.transpileModule(await readFile(new URL('../../web/src/api/bridgeClient.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(bridgeSource, { exports: bridgeModule.exports, module: bridgeModule, fetch: sessionFetch, Error, Object });
  const localRequire = id => {
    if (id === 'pinia') return pinia ?? { defineStore: (storeId, options) => () => {
      const store = { ...options.state(), $id: storeId };
      store.$reset = () => Object.assign(store, options.state());
      for (const [name, action] of Object.entries(options.actions)) store[name] = action.bind(store);
      return store;
    } };
    if (id === './importContract') return {
      resolveImportOutcome: (httpOk, payload) => httpOk && payload?.success === true && payload.data
        ? { success: true, data: payload.data }
        : { success: false, error: payload?.error ?? { code: 'TEST_IMPORT_FAILED', message: 'test import failed' } },
    };
    if (id === '../utils/webTranslation') return {
      localizeImportedBuild: identity,
      localizeImportedItem: identity,
      localizeImportedSocketGroups: identity,
    };
    if (id === '../api/bridgeClient') return bridgeModule.exports;
    throw new Error(`Unexpected import: ${id}`);
  };
  vm.runInNewContext(javascript, {
    exports: module.exports, module, require: localRequire, fetch, console, Set, Map, Object, Array, Number, String, Error, Math,
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  });
  if (pinia) pinia.setActivePinia(pinia.createPinia());
  const store = module.exports.useBuildStore();
  store.sessionId = 'test-initial';
  store.__testStorage = storage;
  return store;
}

for (const outcome of ['success', 'failure']) test(`切换 BD 后拒绝旧修改的${outcome}响应，取消旧队列且不回滚新天赋`, async () => {
  for (let round = 0; round < 3; round++) {
    let release;
    const mutations = [];
    const response = value => ({ ok: true, json: async () => value });
    const store = await loadStore(async (url, request) => {
      const payload = JSON.parse(request.body);
      if (url === '/api/import') return response({ success: true, data: {
        buildName: payload.code, characterLevel: payload.code === 'A' ? 25 : 70,
        allocNodes: payload.code === 'A' ? [1] : [99], output: { Life: payload.code === 'A' ? 384 : 935 },
      } });
      mutations.push(payload);
      return new Promise(resolve => { release = () => resolve(response(outcome === 'success'
        ? { success: true, data: { sourceRevision: 1, revision: 2, code: 'A2', build: { characterLevel: 26, allocNodes: [1, 2], output: { Life: 400 } } } }
        : { success: false, error: { code: 'INJECTED', message: '验证失败' } })); });
    }, { useRealPinia: true });
    await store.importBuildFromCode('A');
    const first = store.toggleNode(2);
    const queued = store.setLevel(30);
    await new Promise(resolve => setImmediate(resolve));
    await store.importBuildFromCode('B');
    const currentSession = store.sessionId;
    release();
    assert.equal((await first).success, false);
    assert.equal((await queued).error.code, 'POB_DOCUMENT_CHANGED');
    assert.equal(mutations.length, 1);
    assert.equal(store.sessionId, currentSession);
    assert.equal(store.canonicalBuild.code, 'B');
    assert.equal(store.characterLevel, 70);
    assert.equal(store.stats.Life, 935);
    assert.deepEqual([...store.allocatedNodes], [99]);
    assert.equal(store.isCalculating, false);
    assert.equal(store.lastCalculationError, null);
  }
});

test('传奇保存排队期间文档更新后拒绝旧预览草稿', async () => {
  let release;
  const requests = [];
  const store = await loadStore(async (url, init) => {
    const payload = JSON.parse(init.body);
    requests.push({ url, payload });
    if (url === '/api/build/commit') return new Promise(resolve => { release = () => resolve({ ok: true, json: async () => ({ success: true, data: { sourceRevision: 1, revision: 2, code: 'new', build: { characterLevel: 2, output: { Life: 30 } } } }) }); });
    throw new Error('旧传奇草稿不应发送到核心');
  }, { useRealPinia: true });
  store.canonicalBuild = { code: 'old', version: 1 };
  const change = store.setLevel(2);
  const queued = store.commitOfficialCraft('create', null, { kind: 'unique', templateId: '官方模板' });
  await new Promise(resolve => setImmediate(resolve));
  release();
  assert.equal((await change).success, true);
  assert.equal((await queued).error.code, 'POB_DOCUMENT_CHANGED');
  assert.equal(requests.length, 1);
  assert.equal(store.canonicalBuild.code, 'new');
});

test('当前文档的修改失败显示错误，且不改动官方文档与数值', async () => {
  for (const outcome of ['response', 'network']) {
    const store = await loadStore(async url => {
      if (url === '/api/import') return { ok: true, json: async () => ({ success: true, data: { characterLevel: 40, output: { Life: 500 } } }) };
      if (outcome === 'network') throw new Error('测试断开连接');
      return { ok: false, json: async () => ({ success: false, error: { code: 'POB_SESSION_UNAVAILABLE', message: '测试会话已关闭' } }) };
    });
    await store.importBuildFromCode('A');
    const result = await store.setLevel(50);
    assert.equal(result.success, false);
    assert.deepEqual(store.lastCalculationError, result.error);
    assert.equal(store.characterLevel, 40);
    assert.equal(store.stats.Life, 500);
    assert.equal(store.canonicalBuild.code, 'A');
    assert.equal(store.isCalculating, false);
  }
});

test('跨 BD 同版本同 ID 的浮窗响应失效，新导入清理旧明细', async () => {
  let release;
  const response = value => ({ ok: true, json: async () => value });
  const store = await loadStore(async (url, request) => {
    const payload = JSON.parse(request.body);
    if (url === '/api/import') return response({ success: true, data: {
      buildName: payload.code, output: { Life: 100 },
      ...(payload.code === 'A' ? { skillBreakdown: { previous: true }, config: { previous: true } } : {}),
    } });
    return new Promise(resolve => { release = () => resolve(response({ success: true, data: { itemId: 1, sourceRevision: 1, revision: 1, tooltip: { name: 'A' } } })); });
  });
  await store.importBuildFromCode('A');
  const tooltip = store.getOfficialItemTooltip(1);
  await new Promise(resolve => setImmediate(resolve));
  await store.importBuildFromCode('B');
  release();
  assert.equal((await tooltip).success, false);
  assert.equal(store.skillBreakdown, null);
  assert.equal(store.config, null);
  assert.equal(store.projectionVersions.calcs, 0);
});

test('导入返回坏投影时保留原文档、会话和可恢复草稿', async () => {
  const response = value => ({ ok: true, json: async () => value });
  const store = await loadStore(async (_url, request) => {
    const { code } = JSON.parse(request.body);
    return response({ success: true, data: code === 'A' ? { buildName: 'A', output: { Life: 100 } } : { equippedItems: { Amulet: { name: '缺少 ID' } } } });
  });
  await store.importBuildFromCode('A');
  const session = store.sessionId;
  const before = store.__testStorage.get('pob_nextgen_build_state');
  assert.equal((await store.importBuildFromCode('B')).success, false);
  assert.equal(store.sessionId, session);
  assert.equal(store.canonicalBuild.code, 'A');
  assert.equal(store.__testStorage.get('pob_nextgen_build_state'), before);
});

test('a level edit commits a new canonical PoB document instead of retaining a local calculation', async () => {
  const calls = [];
  const response = body => ({ ok: true, json: async () => body });
  const store = await loadStore(async (url, request) => {
    const payload = JSON.parse(request.body);
    calls.push({ url, payload });
    if (url === '/api/import') return response({ success: true, data: {
      buildName: 'fixture', characterLevel: 90, output: { Life: 100 },
      loadouts: { active: { specId: 1, itemSetId: 1, skillSetId: 1, configSetId: 1 } },
    } });
    return response({ success: true, data: {
      sourceRevision: 1, revision: 2, code: 'level-91-code',
      build: { buildName: 'fixture', characterLevel: 91, output: { Life: 101 }, loadouts: { active: { specId: 1, itemSetId: 1, skillSetId: 1, configSetId: 1 } } },
    } });
  });

  await store.importBuildFromCode('<PathOfBuilding2><Build /></PathOfBuilding2>');
  const committed = await store.setLevel(91);

  assert.equal(committed.success, true);
  assert.equal(store.canonicalBuild.code, 'level-91-code');
  assert.equal(store.canonicalBuild.version, 2);
  assert.equal(store.characterLevel, 91);
  assert.equal(store.hasUnsavedLocalEdits, false);
  assert.deepEqual(calls.at(-1), { url: '/api/build/commit', payload: {
    code: '<PathOfBuilding2><Build /></PathOfBuilding2>', expectedRevision: 1, projectionScope: 'tree', changes: { level: 91 },
  } });
});

test('a scoped official projection preserves stale detail until the current version is requested', async () => {
  const response = body => ({ ok: true, json: async () => body });
  const store = await loadStore(async (url) => {
    if (url === '/api/import') return response({ success: true, data: {
      buildName: 'fixture', characterLevel: 90, output: { Life: 100 },
      skillBreakdown: { dpsPipeline: { totalDPS: 100 } },
      loadouts: { active: { specId: 1, itemSetId: 1, skillSetId: 1, configSetId: 1 } },
    } });
    return response({ success: true, data: {
      sourceRevision: 1, revision: 2, code: 'level-91-code',
      build: {
        buildName: 'fixture', characterLevel: 91, output: { Life: 101 },
        loadouts: { active: { specId: 1, itemSetId: 1, skillSetId: 1, configSetId: 1 } },
      },
    } });
  });

  await store.importBuildFromCode('<PathOfBuilding2><Build /></PathOfBuilding2>');
  assert.equal(store.skillBreakdown.dpsPipeline.totalDPS, 100);
  const committed = await store.setLevel(91);
  assert.equal(committed.success, true);
  assert.equal(store.skillBreakdown.dpsPipeline.totalDPS, 100);
  assert.equal(store.projectionVersions.calcs, 1);
  assert.equal(store.canonicalBuild.version, 2);
});

for (const tab of ['CALCS', 'SKILLS']) test(`打开 ${tab} 前补取当前版本的官方计算明细`, async () => {
  const calls = [];
  const response = body => ({ ok: true, json: async () => body });
  const store = await loadStore(async (url, request) => {
    const payload = JSON.parse(request.body);
    calls.push({ url, payload });
    if (url === '/api/import') return response({ success: true, data: {
      buildName: 'fixture', output: { Life: 100 }, skillBreakdown: { dpsPipeline: { totalDPS: 100 } },
    } });
    if (url === '/api/build/commit') return response({ success: true, data: {
      sourceRevision: 1, revision: 2, code: 'level-91-code',
      build: { buildName: 'fixture', characterLevel: 91, output: { Life: 101 } },
    } });
    if (url === '/api/build/projection') return response({ success: true, data: {
      sourceRevision: 2, revision: 2,
      build: { output: { Life: 101 }, skillBreakdown: { dpsPipeline: { totalDPS: 200 } } },
    } });
    throw new Error(`Unexpected URL: ${url}`);
  });

  await store.importBuildFromCode('initial-code');
  await store.setLevel(91);
  assert.equal(store.activeTab, 'TREE');
  assert.equal(store.projectionVersions.calcs, 1);

  const activated = await store.activateTab(tab);
  assert.equal(activated, true);
  assert.equal(store.activeTab, tab);
  assert.equal(store.skillBreakdown.dpsPipeline.totalDPS, 200);
  assert.equal(store.projectionVersions.calcs, 2);
  assert.deepEqual(calls.at(-1), {
    url: '/api/build/projection',
    payload: { code: 'level-91-code', expectedRevision: 2, projectionScope: 'calcs' },
  });
});

test('技能页修改同步更新官方数值和内嵌明细，无需重复请求', async () => {
  const calls = [];
  const response = body => ({ ok: true, json: async () => body });
  const store = await loadStore(async (url, request) => {
    const payload = JSON.parse(request.body);
    calls.push({ url, payload });
    assert.equal(url, '/api/skills/commit');
    return response({ success: true, data: {
      sourceRevision: 1, revision: 2, code: 'skill-code',
      build: { output: { TotalDPS: 200 }, skillBreakdown: { dpsPipeline: { totalDPS: 200 } } },
    } });
  });
  store.applyOfficialProjection({
    output: { TotalDPS: 100 }, skillBreakdown: { dpsPipeline: { totalDPS: 100 } },
    loadouts: { active: { skillSetId: 1 } },
  }, { code: 'initial-code', version: 1 });
  assert.equal(await store.activateTab('SKILLS'), true);
  assert.equal((await store.commitOfficialSkillChange('setGem', { groupIndex: 1, gemIndex: 1, patch: { level: 11 } })).success, true);
  assert.equal(store.stats.TotalDPS, 200);
  assert.equal(store.skillBreakdown.dpsPipeline.totalDPS, 200);
  assert.equal(store.projectionVersions.calcs, 2);
  assert.equal(await store.activateTab('SKILLS'), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.projectionScope, 'skills');
});

for (const failure of ['missing', 'stale', 'network']) test(`页面明细补取失败保持原页面与数据：${failure}`, async () => {
  const store = await loadStore(async () => {
    if (failure === 'network') throw new Error('test projection unavailable');
    return { ok: true, json: async () => ({ success: true, data: {
      sourceRevision: failure === 'stale' ? 1 : 2, revision: failure === 'stale' ? 1 : 2,
      build: { output: { TotalDPS: 999 } },
    } }) };
  });
  store.applyOfficialProjection({ output: { TotalDPS: 100 }, skillBreakdown: { dpsPipeline: { totalDPS: 100 } } }, { code: 'old-code', version: 1 });
  store.canonicalBuild = { code: 'current-code', version: 2 };
  assert.equal(await store.activateTab('SKILLS'), false);
  assert.equal(store.activeTab, 'TREE');
  assert.equal(store.stats.TotalDPS, 100);
  assert.equal(store.skillBreakdown.dpsPipeline.totalDPS, 100);
  assert.equal(store.canonicalBuild.version, 2);
  assert.ok(store.lastCalculationError);
  assert.equal(store.isCalculating, false);
});

test('已经在技能页时也会刷新过期明细，迟到响应不能覆盖新文档', async () => {
  let respond;
  const store = await loadStore(() => new Promise(resolve => { respond = resolve; }));
  store.applyOfficialProjection({ output: { TotalDPS: 100 } }, { code: 'old-code', version: 1 });
  store.activeTab = 'SKILLS';
  const pending = store.activateTab('SKILLS');
  assert.equal(typeof respond, 'function');
  store.applyOfficialProjection({ output: { TotalDPS: 200 }, skillBreakdown: { dpsPipeline: { totalDPS: 200 } } }, { code: 'new-code', version: 1 });
  respond({ ok: true, json: async () => ({ success: true, data: {
    sourceRevision: 1, revision: 1,
    build: { output: { TotalDPS: 100 }, skillBreakdown: { dpsPipeline: { totalDPS: 100 } } },
  } }) });
  assert.equal(await pending, false);
  assert.equal(store.canonicalBuild.code, 'new-code');
  assert.equal(store.stats.TotalDPS, 200);
  assert.equal(store.skillBreakdown.dpsPipeline.totalDPS, 200);
  assert.equal(store.lastCalculationError.code, 'POB_DOCUMENT_CHANGED');
});

test('canonical reload replaces a stale stored projection before equipment actions need loadout ids', async () => {
  const calls = [];
  const response = body => ({ ok: true, json: async () => body });
  const officialBuild = {
    buildName: 'fixture', characterLevel: 90,
    itemLibrary: [{ id: 7, name: 'Official Wand' }],
    equippedItems: { 'Weapon 1': { id: 7, name: 'Official Wand' } },
    output: { Life: 900 },
    loadouts: { active: { specId: 2, itemSetId: 4, skillSetId: 6, configSetId: 8 } },
  };
  const store = await loadStore(async (url, request) => {
    const payload = JSON.parse(request.body);
    calls.push({ url, payload });
    if (url === '/api/import') return response({ success: true, data: officialBuild });
    return response({ success: true, output: { Life: 901 } });
  });

  await store.importBuildFromCode('initial-code');
  store.loadouts = null;
  store.itemLibrary = [];
  store.equippedSlots = {};
  store.bridgeCanonicalVersion = 0;
  store.hasUnsavedLocalEdits = false;

  await store.recalculate();

  assert.deepEqual(store.loadouts.active, { specId: 2, itemSetId: 4, skillSetId: 6, configSetId: 8 });
  assert.equal(store.equippedSlots['Weapon 1'], 7);
  assert.equal(store.itemLibrary[0].id, 7);
  assert.deepEqual(calls.filter(call => call.url === '/api/import'), [
    { url: '/api/import', payload: { code: 'initial-code' } },
    { url: '/api/import', payload: { code: 'initial-code', name: 'fixture' } },
  ]);
  assert.equal(calls.some(call => call.url === '/api/calculate'), false);
});

test('legacy browser projections without a canonical document cannot restore fabricated stats or skills', async () => {
  const store = await loadStore(async () => ({ ok: true, json: async () => ({ success: true, output: { Life: 1 } }) }));
  store.__testStorage.set('pob_nextgen_build_state', JSON.stringify({
    stats: { Life: 999999 },
    socketGroups: [{ label: 'fabricated', gems: [{ name: 'Fabricated skill' }] }],
    equippedSlots: { 'Weapon 1': 'fabricated-item' },
    hasUnsavedLocalEdits: true,
  }));

  store.loadFromStorage();

  assert.equal(store.stats.Life, 0);
  assert.equal(store.socketGroups.length, 0);
  assert.equal(Object.keys(store.equippedSlots).length, 0);
  assert.equal(store.canonicalBuild, null);
  assert.equal(store.hasUnsavedLocalEdits, false);
});

test('official loadout switching atomically applies the returned projection and canonical revision', async () => {
  const calls = [];
  const response = body => ({ ok: true, json: async () => body });
  const store = await loadStore(async (url, request) => {
    const payload = JSON.parse(request.body);
    calls.push({ url, payload });
    if (url === '/api/import') return response({ success: true, data: {
      buildName: 'fixture', characterLevel: 90, itemLibrary: [{ id: 1, name: 'Default Wand' }],
      equippedItems: { 'Weapon 1': { id: 1, name: 'Default Wand' } }, output: { Life: 100 },
      loadouts: { active: { specId: 1, itemSetId: 10, skillSetId: 30, configSetId: 50 } },
    } });
    return response({ success: true, data: {
      sourceRevision: 1, revision: 2, code: 'switched-code', output: { Life: 200 },
      build: {
        buildName: 'fixture', characterLevel: 90, itemLibrary: [{ id: 2, name: 'Boss Wand' }],
        equippedItems: { 'Weapon 1': { id: 2, name: 'Boss Wand' } }, output: { Life: 200 },
        loadouts: { active: { specId: 2, itemSetId: 20, skillSetId: 40, configSetId: 50 } },
      },
    } });
  });

  await store.importBuildFromCode('initial-code');
  const switched = await store.selectOfficialLoadout({ specId: 2, itemSetId: 20, skillSetId: 40, configSetId: 50 });

  assert.equal(switched.success, true);
  assert.deepEqual(calls.at(-1), {
    url: '/api/loadouts/select',
    payload: { code: 'initial-code', expectedRevision: 1, selection: { specId: 2, itemSetId: 20, skillSetId: 40, configSetId: 50 } },
  });
  assert.equal(store.canonicalBuild.code, 'switched-code');
  assert.equal(store.canonicalBuild.version, 2);
  assert.equal(store.hasUnsavedLocalEdits, false);
  assert.equal(store.equippedSlots['Weapon 1'], 2);
  assert.equal(store.itemLibrary.length, 1);
  assert.equal(store.stats.Life, 200);
  assert.deepEqual(store.loadouts.active, { specId: 2, itemSetId: 20, skillSetId: 40, configSetId: 50 });
});

test('craft preview leaves canonical state untouched and commit accepts only the returned official build', async () => {
  const calls = [];
  const response = body => ({ ok: true, json: async () => body });
  const store = await loadStore(async (url, request) => {
    const payload = JSON.parse(request.body);
    calls.push({ url, payload });
    if (url === '/api/import') return response({ success: true, data: { buildName: 'fixture', itemLibrary: [], output: { Life: 100 } } });
    if (url === '/api/items/preview') return response({ success: true, data: { item: { id: 8, name: 'Preview Item' }, output: { Life: 150 }, sourceRevision: 1, canonicalRevision: 1 } });
    return response({ success: true, data: {
      sourceRevision: 1, canonicalRevision: 1, revision: 2, code: 'crafted-code', item: { id: 9, name: 'Crafted Item' },
      build: { buildName: 'fixture', itemLibrary: [{ id: 9, name: 'Crafted Item' }], equippedItems: { 'Weapon 1': { id: 9, name: 'Crafted Item' } }, output: { Life: 180 } },
    } });
  });
  const target = { itemSetId: 1, slotName: 'Weapon 1' };
  const draft = { baseName: 'Crimson Amulet', rarity: 'RARE', itemLevel: 82, prefixes: [], suffixes: [] };

  await store.importBuildFromCode('initial-code');
  const preview = await store.previewOfficialCraft('edit', target, draft, 1);
  assert.equal(preview.success, true);
  assert.equal(store.canonicalBuild.code, 'initial-code');
  assert.equal(store.canonicalBuild.version, 1);
  const committed = await store.commitOfficialCraft('edit', target, draft, 1);
  assert.equal(committed.success, true);
  assert.equal(store.canonicalBuild.code, 'crafted-code');
  assert.equal(store.canonicalBuild.version, 2);
  assert.equal(store.equippedSlots['Weapon 1'], 9);
  assert.deepEqual(calls.at(-2), { url: '/api/items/preview', payload: { code: 'initial-code', expectedRevision: 1, action: 'edit', sourceItemId: 1, target, draft } });
  assert.deepEqual(calls.at(-1), { url: '/api/items/commit', payload: { code: 'initial-code', expectedRevision: 1, action: 'edit', sourceItemId: 1, target, draft } });
});

test('official item assignment atomically replaces state from the canonical transaction response', async () => {
  const calls = [];
  const response = body => ({ ok: true, json: async () => body });
  const store = await loadStore(async (url, request) => {
    const payload = JSON.parse(request.body);
    calls.push({ url, payload });
    if (url === '/api/import') return response({ success: true, data: {
      buildName: 'fixture', characterLevel: 90, itemLibrary: [{ id: 1, name: 'Starter Wand' }],
      equippedItems: { 'Weapon 1': { id: 1, name: 'Starter Wand' } }, output: { Life: 100 },
    } });
    return response({ success: true, data: {
      sourceRevision: 1, revision: 2, code: 'assigned-code', output: { Life: 250 },
      build: {
        buildName: 'fixture', characterLevel: 90, itemLibrary: [{ id: 2, name: 'Official Boss Wand' }],
        equippedItems: { 'Weapon 1': { id: 2, name: 'Official Boss Wand' } }, output: { Life: 250 },
      },
    } });
  });
  const target = { itemSetId: 2, slotName: 'Weapon 1' };

  await store.importBuildFromCode('initial-code');
  const committed = await store.commitOfficialItemAssignment(target, 2);

  assert.equal(committed.success, true);
  assert.deepEqual(calls.at(-1), {
    url: '/api/items/assign',
    payload: { code: 'initial-code', expectedRevision: 1, target, itemId: 2, projectionScope: 'tree' },
  });
  assert.equal(store.canonicalBuild.code, 'assigned-code');
  assert.equal(store.canonicalBuild.version, 2);
  assert.equal(store.hasUnsavedLocalEdits, false);
  assert.equal(store.equippedSlots['Weapon 1'], 2);
  assert.equal(store.itemLibrary.length, 1);
  assert.equal(store.stats.Life, 250);
});

test('importing a new build code resets canonical build revision to 1 regardless of previous version', async () => {
  const calls = [];
  const response = body => ({ ok: true, json: async () => body });
  const store = await loadStore(async (url, request) => {
    const payload = JSON.parse(request.body);
    calls.push({ url, payload });
    if (url === '/api/import') return response({ success: true, revision: 1, action: 'loadXML', data: {
      buildName: payload.code.includes('second') ? 'Second Build' : 'First Build',
      characterLevel: 90,
      output: { Life: 100 },
    } });
    if (url === '/api/build/commit') return response({ success: true, data: {
      sourceRevision: payload.expectedRevision,
      revision: payload.expectedRevision + 1,
      code: 'committed-code',
      build: { buildName: 'First Build', characterLevel: payload.changes.level, output: { Life: 100 } },
    } });
    return response({ success: true, data: {} });
  });

  await store.importBuildFromCode('first-code');
  assert.equal(store.canonicalBuild.version, 1);
  assert.equal(store.bridgeCanonicalVersion, 1);

  await store.setLevel(91);
  assert.equal(store.canonicalBuild.version, 2);
  assert.equal(store.bridgeCanonicalVersion, 2);

  // Import a second build - must reset revision to 1, not 3
  await store.importBuildFromCode('second-code');
  assert.equal(store.canonicalBuild.version, 1);
  assert.equal(store.canonicalBuild.code, 'second-code');
  assert.equal(store.bridgeCanonicalVersion, 1);
  assert.equal(store.buildName, 'Second Build');
});

test('ensureCanonicalBuildLoaded resets canonicalBuild version and bridgeCanonicalVersion to 1 when restoring', async () => {
  const calls = [];
  const response = body => ({ ok: true, json: async () => body });
  const store = await loadStore(async (url, request) => {
    const payload = JSON.parse(request.body);
    calls.push({ url, payload });
    if (url === '/api/import') return response({ success: true, revision: 1, action: 'loadXML', data: {
      buildName: 'Restored Build', characterLevel: 90, output: { Life: 500 },
      loadouts: { active: { specId: 1, itemSetId: 1, skillSetId: 1, configSetId: 1 } },
    } });
    if (url === '/api/build/commit') return response({ success: true, data: {
      sourceRevision: payload.expectedRevision,
      revision: payload.expectedRevision + 1,
      code: 'committed-after-restore',
      build: { buildName: 'Restored Build', characterLevel: payload.changes.level, output: { Life: 505 }, loadouts: { active: { specId: 1, itemSetId: 1, skillSetId: 1, configSetId: 1 } } },
    } });
    return response({ success: true, data: {} });
  });

  // Simulate loading from storage where canonicalBuild had an older higher version (e.g. 5)
  store.canonicalBuild = { version: 5, code: 'stored-code' };
  store.bridgeCanonicalVersion = 0; // bridge session lost/restarted

  const loaded = await store.ensureCanonicalBuildLoaded();
  assert.equal(loaded, true);
  assert.equal(store.canonicalBuild.version, 1);
  assert.equal(store.canonicalBuild.code, 'stored-code');
  assert.equal(store.bridgeCanonicalVersion, 1);

  // Subsequent commit should use expectedRevision: 1 and bump to 2
  const committed = await store.setLevel(92);
  assert.equal(committed.success, true);
  assert.equal(store.canonicalBuild.version, 2);
  assert.equal(store.canonicalBuild.code, 'committed-after-restore');
  assert.deepEqual(calls.at(-1), {
    url: '/api/build/commit',
    payload: { code: 'stored-code', expectedRevision: 1, projectionScope: 'tree', changes: { level: 92 } },
  });
});

test('rapid passive-tree clicks commit in order against the latest canonical revision', async () => {
  const pending = [];
  const commitPayloads = [];
  const allocatedNodes = new Set();
  const response = body => ({ ok: true, json: async () => body });
  const commitResponse = payload => {
    const sourceRevision = payload.expectedRevision;
    const revision = sourceRevision + 1;
    const change = payload.changes.passiveNode;
    if (change.allocate) allocatedNodes.add(change.nodeId);
    else allocatedNodes.delete(change.nodeId);
    return response({ success: true, data: {
      sourceRevision, revision, code: `node-code-${revision}`,
      build: { allocNodes: [...allocatedNodes], output: { Life: revision } },
    } });
  };
  const store = await loadStore(async (url, request) => {
    const payload = JSON.parse(request.body);
    if (url === '/api/import') return response({ success: true, data: {
      buildName: 'fixture', allocNodes: [], output: { Life: 1 },
    } });
    commitPayloads.push(payload);
    return await new Promise(resolve => pending.push({ payload, resolve }));
  }, { useRealPinia: true });

  await store.importBuildFromCode('initial-code');
  const first = store.toggleNode(101);
  store.passiveAllocationMode = 1;
  const second = store.toggleNode(102);
  store.passiveAllocationMode = 2;
  const third = store.toggleNode(103);
  store.passiveAllocationMode = 0;
  const flush = async () => {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  };

  // Only the first request starts immediately; later clicks wait for its
  // official projection and therefore use revision 2, then revision 3.
  await flush();
  assert.equal(pending.length, 1);
  pending.shift().resolve(commitResponse(commitPayloads[0]));
  await first;
  await flush();
  assert.equal(pending.length, 1);
  pending.shift().resolve(commitResponse(commitPayloads[1]));
  await second;
  await flush();
  assert.equal(pending.length, 1);
  pending.shift().resolve(commitResponse(commitPayloads[2]));

  const results = await Promise.all([first, second, third]);
  assert.equal(results.every(result => result.success), true);
  assert.deepEqual([...store.allocatedNodes], [101, 102, 103]);
  assert.equal(store.canonicalBuild.version, 4);
  assert.deepEqual(commitPayloads.map(payload => ({
    expectedRevision: payload.expectedRevision,
    passiveNode: payload.changes.passiveNode,
    projectionScope: payload.projectionScope,
  })), [
    { expectedRevision: 1, passiveNode: { nodeId: 101, allocate: true, allocMode: 0 }, projectionScope: 'tree' },
    { expectedRevision: 2, passiveNode: { nodeId: 102, allocate: true, allocMode: 1 }, projectionScope: 'tree' },
    { expectedRevision: 3, passiveNode: { nodeId: 103, allocate: true, allocMode: 2 }, projectionScope: 'tree' },
  ]);
});

test('rapid equipment assignments commit in order against the latest canonical revision', async () => {
  const pending = [];
  const commitPayloads = [];
  const response = body => ({ ok: true, json: async () => body });
  const commitResponse = payload => {
    const sourceRevision = payload.expectedRevision;
    const revision = sourceRevision + 1;
    const itemId = payload.itemId;
    return response({ success: true, data: {
      sourceRevision, revision, code: `item-code-${revision}`,
      build: {
        itemLibrary: [{ id: itemId, name: `Official Item ${itemId}` }],
        equippedItems: { 'Weapon 1': { id: itemId, name: `Official Item ${itemId}` } },
        loadouts: { active: { specId: 1, itemSetId: 1, skillSetId: 1, configSetId: 1 } },
        output: { Life: revision },
      },
    } });
  };
  const store = await loadStore(async (url, request) => {
    const payload = JSON.parse(request.body);
    if (url === '/api/import') return response({ success: true, data: {
      buildName: 'fixture', itemLibrary: [{ id: 1, name: 'Starter Item' }],
      equippedItems: { 'Weapon 1': { id: 1, name: 'Starter Item' } },
      loadouts: { active: { specId: 1, itemSetId: 1, skillSetId: 1, configSetId: 1 } },
      output: { Life: 1 },
    } });
    commitPayloads.push(payload);
    return await new Promise(resolve => pending.push({ payload, resolve }));
  });

  await store.importBuildFromCode('initial-code');
  const target = { itemSetId: 1, slotName: 'Weapon 1' };
  const first = store.commitOfficialItemAssignment(target, 2);
  const second = store.commitOfficialItemAssignment(target, 3);
  const flush = async () => {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  };

  await flush();
  assert.equal(pending.length, 1);
  pending.shift().resolve(commitResponse(commitPayloads[0]));
  await first;
  await flush();
  assert.equal(pending.length, 1);
  pending.shift().resolve(commitResponse(commitPayloads[1]));
  await second;

  assert.equal((await Promise.all([first, second])).every(result => result.success), true);
  assert.equal(store.canonicalBuild.version, 3);
  assert.equal(store.equippedSlots['Weapon 1'], 3);
  assert.deepEqual(commitPayloads.map(payload => ({
    expectedRevision: payload.expectedRevision,
    itemId: payload.itemId,
  })), [
    { expectedRevision: 1, itemId: 2 },
    { expectedRevision: 2, itemId: 3 },
  ]);
});

test('rapid skill changes commit in order against the latest canonical revision', async () => {
  const pending = [];
  const commitPayloads = [];
  const response = body => ({ ok: true, json: async () => body });
  const commitResponse = payload => {
    const sourceRevision = payload.expectedRevision;
    const revision = sourceRevision + 1;
    return response({ success: true, data: {
      sourceRevision, revision, code: `skill-code-${revision}`,
      build: {
        socketGroups: [{ label: payload.operation, gems: [] }],
        loadouts: { active: { specId: 1, itemSetId: 1, skillSetId: 1, configSetId: 1 } },
        output: { Life: revision },
      },
    } });
  };
  const store = await loadStore(async (url, request) => {
    const payload = JSON.parse(request.body);
    if (url === '/api/import') return response({ success: true, data: {
      buildName: 'fixture', socketGroups: [],
      loadouts: { active: { specId: 1, itemSetId: 1, skillSetId: 1, configSetId: 1 } },
      output: { Life: 1 },
    } });
    commitPayloads.push(payload);
    return await new Promise(resolve => pending.push({ payload, resolve }));
  });

  await store.importBuildFromCode('initial-code');
  const first = store.commitOfficialSkillChange('setMain', { groupIndex: 1 });
  const second = store.commitOfficialSkillChange('setGroup', { groupIndex: 2 });
  const flush = async () => {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  };

  await flush();
  assert.equal(pending.length, 1);
  pending.shift().resolve(commitResponse(commitPayloads[0]));
  await first;
  await flush();
  assert.equal(pending.length, 1);
  pending.shift().resolve(commitResponse(commitPayloads[1]));
  await second;

  assert.equal((await Promise.all([first, second])).every(result => result.success), true);
  assert.equal(store.canonicalBuild.version, 3);
  assert.deepEqual(commitPayloads.map(payload => ({
    expectedRevision: payload.expectedRevision,
    operation: payload.operation,
  })), [
    { expectedRevision: 1, operation: 'setMain' },
    { expectedRevision: 2, operation: 'setGroup' },
  ]);
});
