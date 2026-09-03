import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('../../web/node_modules/typescript');
const storePath = new URL('../../web/src/stores/buildStore.ts', import.meta.url);

async function loadStore(fetch) {
  const source = await readFile(storePath, 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const storage = new Map();
  const identity = value => value;
  const localRequire = id => {
    if (id === 'pinia') return { defineStore: (_id, options) => () => {
      const store = options.state();
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
    throw new Error(`Unexpected import: ${id}`);
  };
  vm.runInNewContext(javascript, {
    exports: module.exports, module, require: localRequire, fetch, console, Set, Map, Object, Array, Number, String, Error, Math,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  });
  const store = module.exports.useBuildStore();
  store.__testStorage = storage;
  return store;
}

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
    code: '<PathOfBuilding2><Build /></PathOfBuilding2>', expectedRevision: 1, changes: { level: 91 },
  } });
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
    { url: '/api/import', payload: { code: 'initial-code' } },
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
    payload: { code: 'initial-code', expectedRevision: 1, target, itemId: 2 },
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
    payload: { code: 'stored-code', expectedRevision: 1, changes: { level: 92 } },
  });
});

test('rapid passive-tree clicks commit in order against the latest canonical revision', async () => {
  const pending = [];
  const commitPayloads = [];
  const response = body => ({ ok: true, json: async () => body });
  const commitResponse = payload => {
    const sourceRevision = payload.expectedRevision;
    const revision = sourceRevision + 1;
    const allocNodes = payload.changes.allocNodes;
    return response({ success: true, data: {
      sourceRevision, revision, code: `node-code-${revision}`,
      build: { allocNodes, output: { Life: revision } },
    } });
  };
  const store = await loadStore(async (url, request) => {
    const payload = JSON.parse(request.body);
    if (url === '/api/import') return response({ success: true, data: {
      buildName: 'fixture', allocNodes: [], output: { Life: 1 },
    } });
    commitPayloads.push(payload);
    return await new Promise(resolve => pending.push({ payload, resolve }));
  });

  await store.importBuildFromCode('initial-code');
  const first = store.toggleNode(101);
  const second = store.toggleNode(102);
  const third = store.toggleNode(103);
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
    allocNodes: payload.changes.allocNodes,
  })), [
    { expectedRevision: 1, allocNodes: [101] },
    { expectedRevision: 2, allocNodes: [101, 102] },
    { expectedRevision: 3, allocNodes: [101, 102, 103] },
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
