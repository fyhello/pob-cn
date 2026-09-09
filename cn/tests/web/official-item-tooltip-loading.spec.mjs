import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const path = new URL('../../web/src/utils/useOfficialItemTooltip.ts', import.meta.url);
const require = createRequire(path);
const { effectScope, reactive, shallowRef } = require('vue');
const ts = require('typescript');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(await readFile(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module, exports: module.exports, require });
const { useOfficialItemTooltip } = module.exports;
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(t) {
  const requests = [];
  const store = reactive({ sessionId: 'first', documentEpoch: 1, canonicalBuild: { version: 1 },
    getOfficialItemTooltip(id) { return new Promise(resolve => requests.push({ id, resolve })); } });
  const item = shallowRef(null), visible = shallowRef(false), scope = effectScope();
  const state = scope.run(() => useOfficialItemTooltip(store, () => item.value, () => visible.value));
  t.after(() => scope.stop());
  const hover = id => { item.value = { id }; visible.value = true; };
  const finish = (index, text) => requests[index].resolve({ success: true, data: { tooltip: { header: { title: text }, bodyLines: [text] } } });
  return { store, item, visible, requests, state, hover, finish };
}

test('官方浮窗仅悬停读取，合并快速悬停并复用本版本结果', async t => {
  const f = fixture(t);
  assert.equal(f.requests.length, 0);
  f.hover(1); f.hover(2); f.hover(3);
  assert.equal(f.requests.length, 1);
  assert.equal(f.state.loading.value, true);
  f.finish(0, 'first'); await tick();
  assert.equal(f.state.tooltip.value, null, '迟到响应不能显示成另一个物品');
  assert.deepEqual(f.requests.map(r => r.id), [1, 3]);
  f.finish(1, 'third'); await tick();
  assert.equal(f.state.tooltip.value.bodyLines[0], 'third');
  f.visible.value = false; f.hover(3);
  assert.equal(f.requests.length, 2);
  assert.equal(f.state.tooltip.value.bodyLines[0], 'third');
});

test('会话或文档变化拒绝旧结果，离开悬停不显示迟到浮窗', async t => {
  const f = fixture(t);
  f.hover(1); f.visible.value = false;
  f.store.sessionId = 'second'; f.hover(1);
  f.finish(0, 'old session'); await tick();
  assert.equal(f.state.tooltip.value, null);
  assert.equal(f.requests.length, 2);
  f.finish(1, 'new session'); await tick();
  assert.equal(f.state.tooltip.value.bodyLines[0], 'new session');
  f.store.canonicalBuild.version = 2;
  assert.equal(f.state.tooltip.value, null);
  assert.equal(f.requests.length, 3);
  f.visible.value = false; f.finish(2, 'after leave'); await tick();
  assert.equal(f.state.tooltip.value, null);
});

test('加载失败保持可见且可重试，已有官方预览不发请求', async t => {
  const f = fixture(t);
  f.hover(1);
  f.requests[0].resolve({ success: false, error: { message: '官方会话已过期' } }); await tick();
  assert.equal(f.state.loading.value, false);
  assert.equal(f.state.error.value, '官方会话已过期');
  f.visible.value = false; f.hover(1);
  assert.equal(f.requests.length, 2);
  f.finish(1, 'retry'); await tick();
  f.item.value = { tooltip: { bodyLines: [] } };
  assert.equal(f.requests.length, 2);
  assert.equal(f.state.error.value, '');
  assert.equal(f.state.tooltip.value.bodyLines.length, 0, '成功返回空正文与加载失败有区别');
});

test('缺失正文协议不能伪装成官方空物品，也不能进入缓存', async t => {
  const f = fixture(t);
  f.hover(1);
  f.requests[0].resolve({ success: true, data: { tooltip: {} } }); await tick();
  assert.ok(f.state.error.value);
  assert.equal(f.state.tooltip.value, null);
  f.visible.value = false; f.hover(1);
  assert.equal(f.requests.length, 2);
});
