import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { PoBCoreEngine } from '../../bridge/engine.mjs';

const root = resolve(import.meta.dirname, '../../..');
const runtime = resolve(root, 'Builds/luajit', process.platform === 'win32' ? 'luajit.exe' : 'luajit');

test('真实官方核心的批量投影跳过浮窗，按需浮窗和制作内容保持完整', { skip: !existsSync(runtime) }, async t => {
  const directory = await mkdtemp(resolve(tmpdir(), 'pob-tooltip-test-'));
  await mkdir(resolve(directory, 'Builds'));
  await mkdir(resolve(directory, 'files'));
  const engine = new PoBCoreEngine({
    command: runtime,
    args: [resolve(root, 'cn/tests/bridge/helpers/tooltip-probe.lua')],
    cwd: resolve(root, 'src'),
    env: { ...process.env, POB_CN_SESSION_DIR: directory, LUA_PATH: '../runtime/lua/?.lua;../runtime/lua/?/init.lua;;', POB_CN_REVIEW_ADAPTER: resolve(root, 'cn/lua/real-calc-adapter.lua') },
    startupTimeoutMs: 30000,
    requestTimeoutMs: 30000,
  });
  t.after(async () => { await engine.close(); await rm(directory, { recursive: true, force: true }); });
  await engine.start();
  const request = async message => {
    const result = await engine.request(message);
    assert.equal(result.success, true, JSON.stringify(result.error));
    return result;
  };
  const assertNoBatchTooltip = result => {
    assert.equal(result.review.tooltip ?? 0, 0);
    assert.equal(result.review.comparison ?? 0, 0);
    for (const item of (result.data.build ?? result.data).itemLibrary) {
      assert.equal(item.tooltip, undefined);
      assert.ok(item.displayLines.length > 0);
      assert.ok(item.validTargetSlots);
    }
  };
  const draft = { baseName: 'Crimson Amulet', rarity: 'RARE', itemLevel: 82, prefixes: [], suffixes: [] };
  const preview = await request({ action: 'craftPreview', operation: 'create', draft });
  assert.ok(preview.data.item.tooltip.header);
  assert.ok(Array.isArray(preview.data.item.tooltip.bodyLines));
  const created = await request({ action: 'craftCommit', operation: 'create', draft });
  const itemId = created.data.item.id;
  assert.ok(created.data.item.tooltip.header);
  assert.equal(created.data.build.itemLibrary[0].tooltip, undefined);

  const imported = await request({ action: 'loadXML', xml: created.data.xml });
  assertNoBatchTooltip(imported);
  for (const projectionScope of ['tree', 'items', 'skills', 'calcs', 'config']) {
    const projected = await request({ action: 'projectCurrentBuild', projectionScope });
    assertNoBatchTooltip(projected);
    assert.equal(projected.review.buildOutput, 1);
    assert.equal(Boolean(projected.data.build.skillBreakdown), ['skills', 'calcs'].includes(projectionScope));
  }

  const { reviewCandidates } = await request({ action: 'getStats' });
  assert.ok(reviewCandidates.length > 0);
  for (const allocate of [true, false]) {
    const changed = await request({ action: 'commitBuildChanges', changes: { passiveNode: { nodeId: reviewCandidates[0].id, allocate } }, projectionScope: 'tree' });
    assertNoBatchTooltip(changed);
    assert.equal(changed.data.build.allocNodes.includes(reviewCandidates[0].id), allocate);
  }

  const skills = await request({ action: 'commitSkillChange', skillSetId: 1, operation: 'addGroup', label: 'Spark', projectionScope: 'skills' });
  assertNoBatchTooltip(skills);
  const groupIndex = skills.data.build.socketGroups.length;
  const gem = await request({ action: 'commitSkillChange', skillSetId: 1, operation: 'addGem', groupIndex, patch: { nameSpec: 'Spark', level: 10 }, projectionScope: 'skills' });
  assertNoBatchTooltip(gem);
  const changedGem = await request({ action: 'commitSkillChange', skillSetId: 1, operation: 'setGem', groupIndex, gemIndex: 1, patch: { level: 11 }, projectionScope: 'skills' });
  assertNoBatchTooltip(changedGem);
  assert.equal(changedGem.data.build.socketGroups[groupIndex - 1].gems[0].level, 11);
  assert.ok(changedGem.data.build.skillBreakdown.dynamicSubSections);
  const full = await request({ action: 'projectCurrentBuild', projectionScope: 'full' });
  assert.deepEqual(changedGem.data.build.skillBreakdown, full.data.build.skillBreakdown);
  assert.deepEqual(changedGem.data.output, full.data.output);

  const equipped = await request({ action: 'assignOfficialItem', target: { itemSetId: 1, slotName: 'Amulet' }, itemId, projectionScope: 'items' });
  assert.equal(equipped.review.tooltip, 1);
  assert.ok(equipped.data.item.tooltip.header);
  assert.equal(equipped.data.build.itemLibrary[0].tooltip, undefined);
  const beforeHover = await request({ action: 'exportXML' });
  const beforeOutput = equipped.data.output;
  const hovered = await request({ action: 'projectOfficialItemTooltip', itemId });
  assert.equal(hovered.review.tooltip, 1);
  assert.equal(hovered.review.buildOutput ?? 0, 0);
  assert.ok(hovered.review.comparison > 0);
  assert.deepEqual(hovered.data.tooltip, equipped.data.item.tooltip);
  const afterHover = await request({ action: 'exportXML' });
  assert.equal(afterHover.data.xml, beforeHover.data.xml);
  const projected = await request({ action: 'projectCurrentBuild', projectionScope: 'items' });
  assertNoBatchTooltip(projected);
  assert.deepEqual(projected.data.output, beforeOutput);
  const removed = await request({ action: 'assignOfficialItem', target: { itemSetId: 1, slotName: 'Amulet' }, projectionScope: 'items' });
  assertNoBatchTooltip(removed);
  assert.equal(removed.data.build.equippedItems.Amulet, undefined);
});
