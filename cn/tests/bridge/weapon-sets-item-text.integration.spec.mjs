import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import test from 'node:test';
import { PoBCoreEngine } from '../../bridge/engine.mjs';
import { BuildSessions } from '../../bridge/build-sessions.mjs';
import { LibraryStore } from '../../bridge/library-store.mjs';
import { createBridgeHttpServer, decodeBuildCode } from '../../bridge/http-server.mjs';

const root = resolve(import.meta.dirname, '../../..');
const runtime = join(root, 'Builds/luajit', process.platform === 'win32' ? 'luajit.exe' : 'luajit');

test('真实核心：武器切换、分组天赋保存、公用路径限制和物品文本事务', { skip: !existsSync(runtime), timeout: 180_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pob-weapon-text-test-'));
  const library = await new LibraryStore(join(directory, 'library')).start();
  const sessions = new BuildSessions({ createEngine: async () => {
    const coreDir = await mkdtemp(join(directory, 'core-'));
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
  const api = async (id, path, payload = {}, success = true) => {
    const response = await fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(id ? { 'X-Pob-Session': id } : {}) }, body: JSON.stringify(payload) });
    const result = await response.json();
    assert.equal(result.success, success, JSON.stringify(result.error));
    return result;
  };
  try {
    const a = (await api(null, '/api/sessions')).sessionId;
    const b = (await api(null, '/api/sessions')).sessionId;
    let state = await api(a, '/api/new');
    const untouched = await api(b, '/api/new');
    const payload = () => ({ code: state.code, expectedRevision: state.revision, projectionScope: 'tree' });
    const change = async changes => { state = (await api(a, '/api/build/commit', { ...payload(), changes })).data; return state; };
    const node = (nodeId, allocMode, allocate = true) => change({ passiveNode: { nodeId, allocMode, allocate } });
    for (const id of [56651, 35324]) await node(id, 0);
    await node(35660, 1);
    await node(18548, 1);
    await node(28992, 2);
    assert.equal(state.build.allocationModes['35660'], 1);
    assert.equal(state.build.allocationModes['18548'], 1);
    assert.equal(state.build.allocationModes['28992'], 2);
    assert.ok(state.build.passiveCounts.weaponSet1 > 0);
    assert.ok(state.build.passiveCounts.weaponSet2 > 0);
    assert.match(decodeBuildCode(state.code), /WeaponSet1/);
    assert.match(decodeBuildCode(state.code), /WeaponSet2/);
    const saved = (await api(a, '/api/library/builds/save', { name: '分组验收', expectedRevision: state.revision })).data;
    const restored = await api(b, '/api/import', { code: saved.code });
    assert.deepEqual(restored.data.allocationModes, state.build.allocationModes);
    assert.deepEqual(restored.data.passiveCounts, state.build.passiveCounts);
    await api(b, '/api/import', { code: untouched.code });
    const tree = JSON.parse(await readFile(join(root, 'cn/generated/web-data/tree_0_5.json'), 'utf8'));
    const socket = Object.values(tree.nodes).find(entry => entry.type === 'Socket');
    assert.ok(socket);
    await api(a, '/api/build/commit', { ...payload(), changes: { passiveNode: { nodeId: Number(socket.id), allocate: true, allocMode: 1 } } }, false);
    await api(a, '/api/build/commit', { ...payload(), changes: { passiveNode: { nodeId: 18548, allocate: true, allocMode: 3 } } }, false);
    await node(28992, 0, false);
    await node(28992, 0);
    assert.equal(state.build.allocationModes['18548'], 0, '官方公用路径提升不能保留武器分组');
    assert.equal(state.build.allocationModes['35660'], 0);
    await change({ weaponSet: 2 });
    const raw = 'Rarity: RARE\nTest Sceptre\nRattling Sceptre\nItem Level: 82\n+100 to Spirit';
    const unsupportedLanguage = await api(a, '/api/items/text-preview', { ...payload(), raw: raw.replace('Test Sceptre', '验收武器') }, false);
    assert.equal(unsupportedLanguage.error.code, 'POB_ITEM_TEXT_LANGUAGE_UNSUPPORTED');
    const gameText = `Item Class: Spears
Rarity: Rare
Brood Edge
Jagged Spear
--------
Physical Damage: 33-61
Elemental Damage: 39-62 (fire), 9-14 (cold)
Critical Hit Chance: 8.70% (augmented)
Attacks per Second: 1.74 (augmented)
--------
Requires: Level 59, 33 Str, 81 (unmet) Dex
--------
Item Level: 76
--------
Bleeding you inflict deals Damage 11% faster (implicit)
--------
Grants Skill: Spear Throw
--------
Adds 39 to 62 Fire Damage
Adds 9 to 14 Cold Damage
+2.7% to Critical Hit Chance
16% increased Attack Speed
+22 to Dexterity`;
    const gamePreview = (await api(a, '/api/items/text-preview', { ...payload(), raw: gameText })).data;
    assert.deepEqual(gamePreview.unparsedLines, []);
    assert.equal(gamePreview.base, 'Jagged Spear');
    assert.equal(gamePreview.implicitModLines.length, 2);
    const preview = (await api(a, '/api/items/text-preview', { ...payload(), raw })).data;
    assert.deepEqual(preview.unparsedLines, []);
    assert.ok(preview.validTargetSlots.equipment.includes('Weapon 1 Swap'));
    const importItem = async (text, target) => { state = (await api(a, '/api/items/from-text', { ...payload(), raw: text, target, projectionScope: 'items' })).data; };
    await importItem(raw, { itemSetId: 1, slotName: 'Weapon 1 Swap' });
    const itemId = state.item.id;
    const supportedSpirit = state.output.Spirit;
    await change({ weaponSet: 1 });
    const firstSpirit = state.output.Spirit;
    for (let round = 0; round < 3; round++) {
      await change({ weaponSet: 2 });
      assert.ok(state.build.loadouts.equipmentSlots.includes('Weapon 1 Swap'));
      assert.ok(!state.build.loadouts.equipmentSlots.includes('Weapon 1'));
      assert.equal(state.build.equippedItems['Weapon 1 Swap'].id, itemId);
      assert.ok(state.output.Spirit > firstSpirit);
      assert.equal(state.build.output.Spirit, state.output.Spirit);
      assert.equal(typeof state.output.SpiritUnreserved, 'number');
      assert.equal(typeof state.output.SpiritUnreservedPercent, 'number');
      const reloaded = await api(b, '/api/import', { code: state.code });
      assert.equal(reloaded.data.loadouts.itemSets[0].useSecondWeaponSet, true);
      assert.equal(reloaded.data.output.Spirit, state.output.Spirit);
      await change({ weaponSet: 1 });
      assert.equal(state.output.Spirit, firstSpirit);
    }
    const screenshotLine = 'Bonded: Break Armour on Critical Hit with Spells equal to 12% of Physical Damage dealt';
    const badRaw = `${raw}\n{enchant}{rune}${screenshotLine}\nThis modifier is not supported by PoB`;
    const invalidPreview = (await api(a, '/api/items/text-preview', { ...payload(), raw: badRaw })).data;
    assert.ok(invalidPreview.unparsedLines.includes('This modifier is not supported by PoB'));
    assert.ok(invalidPreview.unparsedLines.includes(screenshotLine));
    assert.equal(invalidPreview.displayLineUnsupported[invalidPreview.displayLines.findIndex(line => line.startsWith(screenshotLine))], true);
    assert.equal(invalidPreview.displayLineUnsupported[invalidPreview.displayLines.findIndex(line => line.startsWith('This modifier is not supported by PoB'))], true);
    await importItem(badRaw, { itemSetId: 1, slotName: 'Weapon 1 Swap' });
    assert.ok(state.item.raw.includes('This modifier is not supported by PoB'));
    assert.ok(state.item.raw.includes(screenshotLine));
    assert.equal(state.item.tooltip.bodyLineUnsupported[state.item.tooltip.bodyLines.findIndex(line => line.startsWith(screenshotLine))], true);
    assert.equal(state.item.tooltip.bodyLineUnsupported[state.item.tooltip.bodyLines.findIndex(line => line.startsWith('This modifier is not supported by PoB'))], true);
    assert.equal(state.output.Spirit, firstSpirit, '未启用的武器组不能影响当前数值');
    await change({ weaponSet: 2 });
    const withUnsupportedSpirit = state.output.Spirit;
    assert.equal(withUnsupportedSpirit, supportedSpirit, '未支持词缀不能改变受支持属性的计算结果');
    const savedUnsupported = (await api(a, '/api/library/builds/save', { name: '未支持词缀验收', expectedRevision: state.revision })).data;
    const restoredItem = await api(b, '/api/import', { code: savedUnsupported.code });
    assert.equal(restoredItem.data.output.Spirit, withUnsupportedSpirit);
    assert.deepEqual(restoredItem.data.equippedItems['Weapon 1 Swap'].unparsedLines, invalidPreview.unparsedLines);
    const restoredTooltip = (await api(b, '/api/items/tooltip', { expectedRevision: restoredItem.revision, itemId: restoredItem.data.equippedItems['Weapon 1 Swap'].id })).data.tooltip;
    assert.equal(restoredTooltip.bodyLineUnsupported[restoredTooltip.bodyLines.findIndex(line => line.startsWith(screenshotLine))], true);
    const before = state.code;
    await api(a, '/api/items/from-text', { ...payload(), raw, target: { itemSetId: 1, slotName: 'Helmet' } }, false);
    await api(a, '/api/items/text-preview', { ...payload(), raw: '' }, false);
    await api(a, '/api/items/text-preview', { ...payload(), raw: 'x'.repeat(65537) }, false);
    const projection = (await api(a, '/api/build/projection', { ...payload(), projectionScope: 'items' })).data;
    assert.equal(projection.build.itemLibrary.length, state.build.itemLibrary.length);
    assert.deepEqual(projection.build.equippedItems, state.build.equippedItems);
    assert.deepEqual(projection.build.allocationModes, state.build.allocationModes);
    assert.equal(state.code, before);
    assert.equal((await library.list('items')).length, 0, '文本导入不得经由公共池中转');
    await importItem(raw);
    assert.notEqual(state.item.id, itemId);
    assert.equal(state.build.itemLibrary.length, 3);
    await api(b, '/api/import', { code: untouched.code });
    let reserved = (await api(b, '/api/skills/commit', { code: untouched.code, expectedRevision: 1, skillSetId: 1, operation: 'addGroup', label: '精魂保留验证', projectionScope: 'tree' })).data;
    reserved = (await api(b, '/api/skills/commit', { code: reserved.code, expectedRevision: reserved.revision, skillSetId: 1, operation: 'addGem', groupIndex: reserved.build.socketGroups.length, patch: { nameSpec: 'Arctic Armour', level: 1 }, projectionScope: 'tree' })).data;
    reserved = (await api(b, '/api/config/commit', { code: reserved.code, expectedRevision: reserved.revision, configSetId: 1, variable: 'customMods', value: '-100 to Spirit', projectionScope: 'tree' })).data;
    assert.ok(reserved.output.SpiritUnreserved < 0, `核心精魂不足的负数必须原样保留：${reserved.output.Spirit}/${reserved.output.SpiritUnreserved}`);
    assert.equal(reserved.build.output.SpiritUnreserved, reserved.output.SpiritUnreserved);
  } finally {
    server.close();
    await sessions.shutdown();
    await library.close();
    await rm(directory, { recursive: true, force: true });
  }
});
