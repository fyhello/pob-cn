import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createBridgeHttpServer, decodeBuildCode } from '../../bridge/http-server.mjs';

async function request(server, path, payload) {
  const port = server.address().port;
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: payload === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload) });
  return { status: response.status, body: await response.json() };
}

test('bridge HTTP service returns the engine import data projection unchanged', async t => {
  const calls = [];
  const projection = { buildName: 'fixture', className: 'Sorceress', characterLevel: 90, allocNodes: [1], output: { Life: 1234 } };
  const server = createBridgeHttpServer({ request: async request => { calls.push(request); return { success: true, data: projection }; } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const imported = await request(server, '/api/import', { code: '<PathOfBuilding2/>', name: 'fixture' });
  const calculated = await request(server, '/api/calculate', {});
  assert.equal(imported.status, 200);
  assert.equal(imported.body.success, true);
  assert.equal(imported.body.revision, 1);
  assert.equal(imported.body.action, 'loadXML');
  assert.deepEqual(imported.body.data, projection);
  assert.equal(calculated.body.data.output.Life, 1234);
  assert.deepEqual(calls, [{ action: 'loadXML', xml: '<PathOfBuilding2/>', name: 'fixture' }, { action: 'calculate' }]);
});

test('build, skill, and config mutations reload the caller XML and only accept official committed documents', async t => {
  const calls = [];
  const server = createBridgeHttpServer({ request: async request => {
    calls.push(request);
    if (request.action === 'loadXML') return { success: true, data: {} };
    return { success: true, data: { xml: `<PathOfBuilding2><Build action="${request.action}" /></PathOfBuilding2>`, build: { output: { Life: 222 }, loadouts: { active: { configSetId: 4, skillSetId: 3 } } }, output: { Life: 222 } } };
  } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const code = '<PathOfBuilding2><Build canonical="true" /></PathOfBuilding2>';
  const base = { code, expectedRevision: 9 };
  const build = await request(server, '/api/build/commit', { ...base, changes: { level: 91 } });
  const skill = await request(server, '/api/skills/commit', { code: build.body.data.code, expectedRevision: build.body.data.revision, skillSetId: 3, operation: 'setMain', groupIndex: 1 });
  const config = await request(server, '/api/config/commit', { code: skill.body.data.code, expectedRevision: skill.body.data.revision, configSetId: 4, variable: 'conditionMoving', value: true });
  const rejectedCalculate = await request(server, '/api/calculate', { level: 91 });
  for (const [index, response] of [build, skill, config].entries()) {
    assert.equal(response.status, 200);
    assert.equal(response.body.data.sourceRevision, 9 + index);
    assert.equal(response.body.data.revision, 10 + index);
    assert.match(decodeBuildCode(response.body.data.code), /action="commit/);
  }
  assert.equal(rejectedCalculate.status, 400);
  assert.equal(rejectedCalculate.body.error.code, 'POB_CANONICAL_WRITE_REQUIRED');
  assert.deepEqual(calls, [
    { action: 'loadXML', xml: code, name: '' }, { action: 'commitBuildChanges', changes: { level: 91 }, canonicalXML: code, name: '' },
    { action: 'commitSkillChange', skillSetId: 3, operation: 'setMain', groupIndex: 1, gemIndex: undefined, patch: undefined, label: undefined, canonicalXML: decodeBuildCode(build.body.data.code), name: '' },
    { action: 'commitConfigChange', configSetId: 4, variable: 'conditionMoving', value: true, canonicalXML: decodeBuildCode(skill.body.data.code), name: '' },
  ]);
});

test('bridge HTTP service fails closed for malformed build codes', () => {
  assert.throws(() => decodeBuildCode('not a build'), /not XML|compressed/);
});

test('bridge HTTP service exports the requested canonical XML, not an older bridge build', async t => {
  const calls = [];
  const server = createBridgeHttpServer({ request: async request => {
    calls.push(request);
    if (request.action === 'loadXML') return { success: true, action: 'loadXML', data: { buildName: 'canonical fixture' } };
    return { success: true, action: 'exportXML', data: { xml: '<PathOfBuilding2><Skills canonical="true" /></PathOfBuilding2>' } };
  } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const canonicalXml = '<PathOfBuilding2><Build target="canonical" /></PathOfBuilding2>';
  const imported = await request(server, '/api/import', { code: canonicalXml });
  const exported = await request(server, '/api/export', { code: canonicalXml, version: 1 });
  const exportedXml = decodeBuildCode(exported.body.code);
  const reimported = await request(server, '/api/import', { code: exportedXml });
  assert.equal(imported.status, 200);
  assert.equal(imported.body.success, true);
  assert.equal(exported.status, 200);
  assert.equal(exported.body.format, 'pob-share-code');
  assert.equal(exported.body.sourceVersion, 1);
  assert.equal(exportedXml, '<PathOfBuilding2><Skills canonical="true" /></PathOfBuilding2>');
  assert.equal(reimported.status, 200);
  assert.equal(reimported.body.success, true);
  assert.deepEqual(calls, [
    { action: 'loadXML', xml: canonicalXml, name: '' },
    { action: 'exportXML' },
    { action: 'loadXML', xml: exportedXml, name: '' },
  ]);
});

test('craft endpoints reload the caller canonical document and only commit returns a new revision', async t => {
  const calls = [];
  const server = createBridgeHttpServer({ request: async request => {
    calls.push(request);
    if (request.action === 'loadXML') return { success: true, data: {} };
    if (request.action === 'craftPreview') return { success: true, data: { item: { id: 7 }, output: { Life: 100 } } };
    return { success: true, data: { item: { id: 8 }, output: { Life: 200 }, xml: '<PathOfBuilding2><Items committed="true" /></PathOfBuilding2>' } };
  } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const payload = { code: '<PathOfBuilding2><Items canonical="true" /></PathOfBuilding2>', expectedRevision: 4, action: 'edit', sourceItemId: 7, target: { itemSetId: 1, slotName: 'Weapon 1' }, draft: { baseName: 'Crimson Amulet', rarity: 'RARE', itemLevel: 82, prefixes: [], suffixes: [] } };
  const preview = await request(server, '/api/items/preview', payload);
  const committed = await request(server, '/api/items/commit', payload);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.data.sourceRevision, 4);
  assert.equal(preview.body.data.revision, undefined);
  assert.equal(committed.status, 200);
  assert.equal(committed.body.data.revision, 5);
  assert.match(decodeBuildCode(committed.body.data.code), /committed="true"/);
  assert.deepEqual(calls, [
    { action: 'loadXML', xml: payload.code, name: '' },
    { action: 'craftPreview', operation: 'edit', target: payload.target, draft: payload.draft, name: '', sourceItemId: 7 },
    { action: 'craftCommit', operation: 'edit', target: payload.target, draft: payload.draft, name: '', sourceItemId: 7 },
  ]);
});

test('craft commits serialize the bridge session and reject a stale queued draft', async t => {
  const calls = [];
  let releaseFirstCommit;
  let firstCommitStarted;
  const firstCommitReady = new Promise(resolve => { firstCommitStarted = resolve; });
  const server = createBridgeHttpServer({ request: async engineRequest => {
    calls.push(engineRequest);
    if (engineRequest.action === 'loadXML') return { success: true, data: {} };
    if (engineRequest.action === 'craftCommit') {
      firstCommitStarted();
      await new Promise(resolve => { releaseFirstCommit = resolve; });
      return { success: true, data: { item: { id: 8 }, output: { Life: 200 }, xml: '<PathOfBuilding2><Items committed="true" /></PathOfBuilding2>' } };
    }
    throw new Error(`unexpected engine action ${engineRequest.action}`);
  } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const payload = { code: '<PathOfBuilding2><Items canonical="true" /></PathOfBuilding2>', expectedRevision: 4, action: 'create', draft: { baseName: 'Crimson Amulet', rarity: 'RARE', itemLevel: 82, prefixes: [], suffixes: [] } };
  const first = request(server, '/api/items/commit', payload);
  await firstCommitReady;
  const second = request(server, '/api/items/commit', payload);
  releaseFirstCommit();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.status, 200);
  assert.equal(firstResult.body.data.revision, 5);
  assert.equal(secondResult.status, 409);
  assert.equal(secondResult.body.error.code, 'POB_CANONICAL_REVISION_CONFLICT');
  assert.deepEqual(calls.map(call => call.action), ['loadXML', 'craftCommit']);
});

test('crafting options reload the canonical document and return only the Lua engine projection', async t => {
  const calls = [];
  const server = createBridgeHttpServer({ request: async request => {
    calls.push(request);
    if (request.action === 'loadXML') return { success: true, data: {} };
    return { success: true, data: { prefixes: [{ id: 'Life1' }], suffixes: [], essences: [], affixLimits: { prefixes: 1, suffixes: 1 }, corruptible: true } };
  } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const payload = { code: '<PathOfBuilding2><Items canonical="true" /></PathOfBuilding2>', expectedRevision: 4, baseName: 'Crimson Amulet', rarity: 'RARE', itemLevel: 82, corrupted: false };
  const response = await request(server, '/api/crafting/options', payload);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data.prefixes, [{ id: 'Life1' }]);
  assert.equal(response.body.data.sourceRevision, 4);
  assert.deepEqual(calls, [
    { action: 'loadXML', xml: payload.code, name: '' },
    { action: 'craftOptions', baseName: 'Crimson Amulet', rarity: 'RARE', itemLevel: 82, corrupted: false, draft: undefined, canonicalRevision: 4 },
  ]);
});

test('crafting options accept browser-normalized XML line endings for the active revision', async t => {
  const calls = [];
  const server = createBridgeHttpServer({ request: async request => {
    calls.push(request);
    if (request.action === 'loadXML') return { success: true, data: {} };
    return { success: true, data: { prefixes: [], suffixes: [], essences: [], affixLimits: { prefixes: 3, suffixes: 3 }, corruptible: true } };
  } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const importedCode = '<PathOfBuilding2>\r\n<Items canonical="true" />\r\n</PathOfBuilding2>';
  const browserCode = importedCode.replaceAll('\r\n', '\n');
  const imported = await request(server, '/api/import', { code: importedCode });
  const options = await request(server, '/api/crafting/options', { code: browserCode, expectedRevision: 1, baseName: 'Acrid Wand', rarity: 'RARE', itemLevel: 50, corrupted: false });
  assert.equal(imported.status, 200);
  assert.equal(options.status, 200);
  assert.equal(options.body.success, true);
  assert.deepEqual(calls, [
    { action: 'loadXML', xml: importedCode, name: '' },
    { action: 'craftOptions', baseName: 'Acrid Wand', rarity: 'RARE', itemLevel: 50, corrupted: false, draft: undefined, canonicalRevision: 1 },
  ]);
});

test('official item assignment reloads canonical XML and commits only the returned official document', async t => {
  const calls = [];
  const server = createBridgeHttpServer({ request: async request => {
    calls.push(request);
    if (request.action === 'loadXML') return { success: true, data: {} };
    const cleared = request.itemId === null;
    return {
      success: true,
      data: {
        item: cleared ? null : { id: request.itemId, name: 'Official Wand' },
        output: { Life: cleared ? 100 : 200 },
        build: { buildName: 'fixture', itemLibrary: [], equippedItems: {}, output: { Life: cleared ? 100 : 200 } },
        xml: `<PathOfBuilding2><Items assigned="${cleared ? 'clear' : request.itemId}" /></PathOfBuilding2>`,
      },
    };
  } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const target = { itemSetId: 2, slotName: 'Weapon 1' };
  const payload = { code: '<PathOfBuilding2><Items canonical="true" /></PathOfBuilding2>', expectedRevision: 7, target, itemId: 12 };
  const assigned = await request(server, '/api/items/assign', payload);
  const cleared = await request(server, '/api/items/assign', { code: assigned.body.data.code, expectedRevision: assigned.body.data.revision, target, itemId: null });
  assert.equal(assigned.status, 200);
  assert.equal(assigned.body.action, 'assignOfficialItem');
  assert.equal(assigned.body.data.sourceRevision, 7);
  assert.equal(assigned.body.data.revision, 8);
  assert.match(decodeBuildCode(assigned.body.data.code), /assigned="12"/);
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.data.sourceRevision, 8);
  assert.equal(cleared.body.data.revision, 9);
  assert.match(decodeBuildCode(cleared.body.data.code), /assigned="clear"/);
  assert.deepEqual(calls, [
    { action: 'loadXML', xml: payload.code, name: '' },
    { action: 'assignOfficialItem', target, itemId: 12, canonicalXML: payload.code, name: '' },
    { action: 'assignOfficialItem', target, itemId: null, canonicalXML: decodeBuildCode(assigned.body.data.code), name: '' },
  ]);
});

test('official item removal reloads canonical XML and commits only the returned official document', async t => {
  const calls = [];
  const server = createBridgeHttpServer({ request: async request => {
    calls.push(request);
    if (request.action === 'loadXML') return { success: true, data: {} };
    return { success: true, data: { removedItemId: 12, output: { Life: 100 }, build: { buildName: 'fixture', itemLibrary: [], equippedItems: {}, output: { Life: 100 } }, xml: '<PathOfBuilding2><Items removed="12" /></PathOfBuilding2>' } };
  } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const payload = { code: '<PathOfBuilding2><Items canonical="true" /></PathOfBuilding2>', expectedRevision: 7, itemId: 12 };
  const removed = await request(server, '/api/items/remove', payload);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.action, 'deleteOfficialItem');
  assert.equal(removed.body.data.sourceRevision, 7);
  assert.equal(removed.body.data.revision, 8);
  assert.match(decodeBuildCode(removed.body.data.code), /removed="12"/);
  assert.deepEqual(calls, [
    { action: 'loadXML', xml: payload.code, name: '' },
    { action: 'deleteOfficialItem', itemId: 12, canonicalXML: payload.code, name: '' },
  ]);
});

test('loadout selection reloads canonical XML and returns the official switched document', async t => {
  const calls = [];
  const server = createBridgeHttpServer({ request: async request => {
    calls.push(request);
    if (request.action === 'loadXML') return { success: true, data: {} };
    return { success: true, data: { xml: '<PathOfBuilding2><Build loadout="boss" /></PathOfBuilding2>', build: { loadouts: { active: { specId: 2, itemSetId: 20, skillSetId: 40, configSetId: 50 } } }, output: { Life: 200 } } };
  } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const payload = { code: '<PathOfBuilding2><Build loadout="default" /></PathOfBuilding2>', expectedRevision: 6, selection: { specId: 2, itemSetId: 20, skillSetId: 40, configSetId: 50 } };
  const response = await request(server, '/api/loadouts/select', payload);
  assert.equal(response.status, 200);
  assert.equal(response.body.data.sourceRevision, 6);
  assert.equal(response.body.data.revision, 7);
  assert.match(decodeBuildCode(response.body.data.code), /loadout="boss"/);
  assert.deepEqual(calls, [
    { action: 'loadXML', xml: payload.code, name: '' },
    { action: 'selectLoadout', selection: payload.selection, canonicalXML: payload.code, name: '' },
  ]);
});

test('craft endpoints return Lua validation failures without a duplicate bridge rule layer', async t => {
  const calls = [];
  const server = createBridgeHttpServer({ request: async request => {
    calls.push(request);
    if (request.action === 'craftPreview') {
      return { success: false, error: { code: 'POB_CRAFT_AFFIX_TYPE_INVALID', api: 'draft.prefixes[0].id', message: '官方 PoB 拒绝该前缀。' } };
    }
    return { success: true, data: {} };
  } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const payload = {
    code: '<PathOfBuilding2><Items canonical="true" /></PathOfBuilding2>', expectedRevision: 4, action: 'edit', sourceItemId: 7, target: { itemSetId: 1, slotName: 'Weapon 1' },
    draft: { baseName: 'Crimson Amulet', rarity: 'RARE', itemLevel: 82, prefixes: [{ id: 'FireResist1', roll: 0.5 }], suffixes: [] },
  };
  const response = await request(server, '/api/items/preview', payload);
  assert.equal(response.status, 422);
  assert.equal(response.body.error.code, 'POB_CRAFT_AFFIX_TYPE_INVALID');
  assert.equal(response.body.error.api, 'draft.prefixes[0].id');
  assert.deepEqual(calls, [
    { action: 'loadXML', xml: payload.code, name: '' },
    { action: 'craftPreview', operation: 'edit', target: payload.target, draft: payload.draft, name: '', sourceItemId: 7 },
  ]);
});

test('craft endpoints pass structural drafts to the Lua core unchanged', async t => {
  const calls = [];
  const server = createBridgeHttpServer({ request: async request => {
    calls.push(request);
    if (request.action === 'craftPreview') {
      return { success: false, error: { code: 'POB_CRAFT_AFFIX_COUNT_INVALID', api: 'draft.prefixes', message: '官方 PoB 限制珠宝前缀数量。' } };
    }
    return { success: true, data: {} };
  } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const payload = {
    code: '<PathOfBuilding2><Items canonical="true" /></PathOfBuilding2>', expectedRevision: 4, action: 'create',
    draft: {
      baseName: 'Diamond', rarity: 'RARE', itemLevel: 100,
      prefixes: [{ id: 'JewelAccuracy', roll: 0.5 }, { id: 'JewelAilmentEffect', roll: 0.5 }, { id: 'JewelAreaofEffect', roll: 0.5 }],
      suffixes: [],
    },
  };
  const response = await request(server, '/api/items/preview', payload);
  assert.equal(response.status, 422);
  assert.equal(response.body.error.code, 'POB_CRAFT_AFFIX_COUNT_INVALID');
  assert.equal(response.body.error.api, 'draft.prefixes');
  assert.deepEqual(calls, [
    { action: 'loadXML', xml: payload.code, name: '' },
    { action: 'craftPreview', operation: 'create', target: undefined, draft: payload.draft, name: '' },
  ]);
});
