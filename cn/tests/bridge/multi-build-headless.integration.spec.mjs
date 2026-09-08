import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import test from 'node:test';
import { PoBCoreEngine } from '../../bridge/engine.mjs';
import { BuildSessions } from '../../bridge/build-sessions.mjs';
import { LibraryStore } from '../../bridge/library-store.mjs';
import { createBridgeHttpServer } from '../../bridge/http-server.mjs';

const root = resolve(import.meta.dirname, '../../..');
const runtime = resolve(root, 'Builds/luajit', process.platform === 'win32' ? 'luajit.exe' : 'luajit');

test('真实双核心：独立编辑、共享存档冲突、物品复制与穿戴事务', { skip: !existsSync(runtime), timeout: 180_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pob-multi-build-test-'));
  const library = await new LibraryStore(join(directory, 'library')).start();
  const sessions = new BuildSessions({ createEngine: async id => {
    const coreDir = await mkdtemp(join(directory, `${id}-`));
    await mkdir(join(coreDir, 'Builds'));
    await mkdir(join(coreDir, 'files'));
    const engine = new PoBCoreEngine({ command: runtime, args: [join(root, 'cn/bridge/calc_server.lua')], cwd: join(root, 'src'), env: { ...process.env, POB_CN_SESSION_DIR: coreDir, LUA_PATH: '../runtime/lua/?.lua;../runtime/lua/?/init.lua;;' }, startupTimeoutMs: 30_000, requestTimeoutMs: 30_000 });
    await engine.start();
    return engine;
  } });
  const server = createBridgeHttpServer(sessions, { library });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const api = async (id, path, payload = {}, expectedSuccess = true) => {
    const response = await fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(id ? { 'X-Pob-Session': id } : {}) }, body: JSON.stringify(payload) });
    const body = await response.json();
    assert.equal(body.success, expectedSuccess, JSON.stringify(body.error));
    return body;
  };
  try {
    await api(null, '/api/calculate', {}, false);
    const a = (await api(null, '/api/sessions')).sessionId;
    const b = (await api(null, '/api/sessions')).sessionId;
    let stateA = await api(a, '/api/new', { name: '验证 A' });
    let stateB = await api(b, '/api/new', { name: '验证 B' });
    assert.notEqual(sessions.get(a).engine.child.pid, sessions.get(b).engine.child.pid);
    const commit = async (id, state, changes) => (await api(id, '/api/build/commit', { code: state.code, expectedRevision: state.revision, projectionScope: 'tree', changes })).data;
    for (let round = 0; round < 3; round++) {
      stateA = await commit(a, stateA, { level: 25 + round });
      stateB = await commit(b, stateB, { level: 70 + round });
      assert.equal(stateA.build.characterLevel, 25 + round);
      assert.equal(stateB.build.characterLevel, 70 + round);
      assert.notEqual((await api(a, '/api/calculate')).output.Life, (await api(b, '/api/calculate')).output.Life);
    }
    const crafted = await api(a, '/api/items/commit', { code: stateA.code, expectedRevision: stateA.revision, action: 'create', draft: { baseName: 'Crimson Amulet', rarity: 'RARE', itemLevel: 82, prefixes: [], suffixes: [] } });
    stateA = crafted.data;
    const sourceId = stateA.item.id;
    const before = await api(a, '/api/export', { code: stateA.code, version: stateA.revision });
    const pooled = (await api(a, '/api/library/items/copy', { expectedRevision: stateA.revision, itemId: sourceId })).data;
    assert.equal(pooled.item.tooltip, undefined);
    const after = await api(a, '/api/export', { code: stateA.code, version: stateA.revision });
    assert.equal(after.code, before.code);
    const firstCopy = await api(b, '/api/items/from-pool', { id: pooled.id, code: stateB.code, expectedRevision: stateB.revision, projectionScope: 'items', target: null });
    stateB = firstCopy.data;
    const copiedId = stateB.item.id;
    const failed = await api(b, '/api/items/from-pool', { id: pooled.id, code: stateB.code, expectedRevision: stateB.revision, projectionScope: 'items', target: { itemSetId: 1, slotName: 'Helmet' } }, false);
    assert.ok(failed.error);
    const unchanged = await api(b, '/api/build/projection', { code: stateB.code, expectedRevision: stateB.revision, projectionScope: 'items' });
    assert.equal(unchanged.data.build.itemLibrary.length, 1);
    const equipped = await api(b, '/api/items/from-pool', { id: pooled.id, code: stateB.code, expectedRevision: stateB.revision, projectionScope: 'items', target: { itemSetId: 1, slotName: 'Amulet' } });
    stateB = equipped.data;
    assert.notEqual(stateB.item.id, copiedId);
    assert.equal(stateB.build.itemLibrary.length, 2);
    assert.equal(stateB.build.equippedItems.Amulet.id, stateB.item.id);
    const removed = await api(b, '/api/items/remove', { code: stateB.code, expectedRevision: stateB.revision, itemId: copiedId, projectionScope: 'items' });
    stateB = removed.data;
    assert.equal(stateB.build.itemLibrary.length, 1);
    const source = await api(a, '/api/build/projection', { code: stateA.code, expectedRevision: stateA.revision, projectionScope: 'items' });
    assert.equal(source.data.build.itemLibrary[0].id, sourceId);
    assert.equal((await library.list('items')).length, 1);
    const saved = (await api(a, '/api/library/builds/save', { name: '共享存档', expectedRevision: stateA.revision })).data;
    await api(b, '/api/import', { code: saved.code });
    stateB = { code: saved.code, revision: 1 };
    stateA = await commit(a, stateA, { level: 40 });
    await api(a, '/api/library/builds/save', { id: saved.id, expectedVersion: saved.version, name: '共享存档', expectedRevision: stateA.revision });
    stateB = await commit(b, stateB, { level: 80 });
    const conflict = await api(b, '/api/library/builds/save', { id: saved.id, expectedVersion: saved.version, name: '共享存档', expectedRevision: stateB.revision }, false);
    assert.equal(conflict.error.code, 'POB_LIBRARY_CONFLICT');
    assert.equal((await library.read('builds', saved.id)).version, 2);
    await api(b, '/api/library/builds/save', { name: '另存副本', expectedRevision: stateB.revision });
    assert.equal((await library.list('builds')).length, 2);
    const wandOptions = (await api(a, '/api/crafting/options', { code: stateA.code, expectedRevision: stateA.revision, action: 'create', baseName: 'Acrid Wand', rarity: 'RARE', itemLevel: 82, draft: {} })).data;
    const rune = wandOptions.runeCapabilities.allowed.find(value => value !== 'None');
    assert.ok(rune);
    const absentOptions = (await api(a, '/api/crafting/options', { code: stateA.code, expectedRevision: stateA.revision, action: 'create', baseName: 'Absent Amulet', rarity: 'RARE', itemLevel: 82, draft: {} })).data;
    const drafts = [
      { baseName: 'Acrid Wand', socketCount: 3, runes: [rune, rune, rune], prefixes: [{ id: 'ChaosDamagePrefixOnWeapon8', roll: 0.37 }], suffixes: [] },
      { baseName: 'Absent Amulet', variant: 1, implicitRanges: [{ index: absentOptions.implicitRanges[0].index, roll: 0.5 }], prefixes: [], suffixes: [] },
      { baseName: 'Amethyst Ring', catalyst: 8, catalystQuality: 20, prefixes: [], suffixes: [] },
      { baseName: 'Acrid Wand', corrupted: true, prefixes: [], suffixes: [] },
      { baseName: 'Ruby', prefixes: [], suffixes: [] },
    ];
    for (const draft of drafts) {
      stateA = (await api(a, '/api/items/commit', { code: stateA.code, expectedRevision: stateA.revision, action: 'create', draft: { rarity: 'RARE', itemLevel: 82, ...draft } })).data;
      const originalCode = (await api(a, '/api/export', { code: stateA.code, version: stateA.revision })).code;
      const entry = (await api(a, '/api/library/items/copy', { expectedRevision: stateA.revision, itemId: stateA.item.id })).data;
      const preview = await api(b, '/api/items/pool-preview', { id: entry.id, code: stateB.code, expectedRevision: stateB.revision });
      for (const socket of preview.data.validTargetSlots.jewels) {
        assert.ok(stateB.build.allocNodes.includes(socket.nodeId), '公共池只能列出当前已分配的珠宝槽');
      }
      assert.equal((await api(a, '/api/export', { code: stateA.code, version: stateA.revision })).code, originalCode, `${draft.baseName} 复制不能更改来源文档`);
      stateB = (await api(b, '/api/items/from-pool', { id: entry.id, code: stateB.code, expectedRevision: stateB.revision, projectionScope: 'items' })).data;
      const copied = (await api(b, '/api/library/items/copy', { expectedRevision: stateB.revision, itemId: stateB.item.id })).data;
      assert.equal(copied.raw, entry.raw, `${draft.baseName} 官方物品文本往返必须完全一致`);
      for (const field of ['base', 'rarity', 'quality', 'variant', 'itemLevel', 'corrupted', 'socketCount', 'runes', 'catalyst', 'catalystQuality', 'displayLines']) {
        assert.deepEqual(copied.item[field], entry.item[field], `${draft.baseName}.${field}`);
      }
    }
  } finally {
    server.close();
    await sessions.shutdown();
    await library.close();
    await rm(directory, { recursive: true, force: true });
  }
});
