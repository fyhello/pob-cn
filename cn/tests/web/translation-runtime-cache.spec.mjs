import assert from 'node:assert/strict';
import test from 'node:test';
import { createTranslationRuntime } from '../../shared/translation-runtime.mjs';
import { localizeItemRows } from '../../shared/item-translation.mjs';

function languagePack(locale = 'zh-CN', revision = 'test-1', entries = {}) {
  return { schema_version: 3, locale, revision, terms: {}, ui: {}, items: {}, stats: {}, tooltip: {},
    contexts: { 'item-display': entries } };
}

test('整段匹配缓存成功与失败，不改变换行匹配和不生效分组', t => {
  const runtime = createTranslationRuntime(languagePack('zh-CN', 'test-1', {
    'First {0} line\nSecond line': '第一行 {0}\n第二行',
    'Single {0} template': '单条 {0}',
  }));
  const originalExec = RegExp.prototype.exec;
  const calls = t.mock.method(RegExp.prototype, 'exec', function (value) { return originalExec.call(this, value); });
  for (const raw of ['First 12 line\nSecond line', 'First 12 line\nUnknown']) {
    const first = runtime.whole(raw, { scope: 'item-display' });
    const count = calls.mock.calls.filter(call => String(call.this).startsWith('/^First')).length;
    assert.equal(runtime.whole(raw, { scope: 'item-display' }), first);
    assert.equal(calls.mock.calls.filter(call => String(call.this).startsWith('/^First')).length, count);
  }
  assert.equal(runtime.whole('Single 12\ntemplate', { scope: 'item-display' }), '单条 12');
  assert.deepEqual(localizeItemRows(runtime, ['First 12 line', 'Second line'], [true, true]), [
    { raw: 'First 12 line\nSecond line', translated: '第一行 12\n第二行', unsupported: true },
  ]);
  assert.equal(localizeItemRows(runtime, ['First 12 line', 'Second line'], [true, false]).length, 2);
});

test('显示缓存使用有效语境，保留物品词缀、背景及实体身份隔离', () => {
  const pack = languagePack();
  pack.itemScopes = { bases: { Wand: ['local'], Ring: ['global'] }, uniques: { '["One","Wand"]': ['flavour'] } };
  pack.contexts.local = { 'Value {0}': '局部 {0}' };
  pack.contexts.global = { 'Value {0}': '全局 {0}' };
  pack.contexts.flavour = { 'Same story': '特定背景' };
  const runtime = createTranslationRuntime(pack);
  for (const method of ['whole', 'translate']) {
    assert.equal(runtime[method]('Value 12', { scope: 'item-display', item: { base: 'Wand', title: 'A' } }), '局部 12');
    assert.equal(runtime[method]('Value 12', { scope: 'item-display', item: { base: 'Ring', title: 'A' } }), '全局 12');
    assert.equal(runtime[method]('Same story', { scope: 'item-display', item: { base: 'Wand', title: 'One', rarity: 'UNIQUE' } }), '特定背景');
    assert.notEqual(runtime[method]('Same story', { scope: 'item-display', item: { base: 'Wand', title: 'Two', rarity: 'UNIQUE' } }), '特定背景');
    assert.notEqual(runtime[method]('Value 12', { scope: 'item-display', entity: { table: 'Unknown', id: 'x', field: 'Text' }, item: { base: 'Wand' } }), '局部 12');
  }
});

test('多行起始检测缓存命中和未命中，等价格式不重复扫描', t => {
  const runtime = createTranslationRuntime(languagePack('zh-CN', 'test-1', {
    'First line\nSecond line': '第一行\n第二行',
    '{0}% increased Damage\nwhile affected by {1}': '伤害提高 {0}%\n受到 {1} 影响时',
  }));
  const originalTest = RegExp.prototype.test;
  const calls = t.mock.method(RegExp.prototype, 'test', function (value) { return originalTest.call(this, value); });
  for (const [line, expected] of [['First line', true], ['-12% increased Damage', true], ['(10-20)% increased Damage', true], ['Unknown original text', false]]) {
    assert.equal(runtime.startsWrapped(line), expected);
    const previous = calls.mock.callCount();
    assert.equal(runtime.startsWrapped(`^xFFFFFF  ${line}  `), expected);
    assert.equal(runtime.startsWrapped(line), expected);
    assert.equal(calls.mock.callCount(), previous, '同一规范化输入不能再次扫描模板');
  }
  assert.equal(runtime.startsWrapped('First line with extra text'), false, '必须完整匹配起始行');
  assert.equal(runtime.startsWrapped('First line\nSecond line'), false);
});

test('多行缓存按语言包和版本隔离，不把旧模板命中带到新包', () => {
  const original = createTranslationRuntime(languagePack('zh-CN', 'test-1', { 'First line\nSecond line': '第一行\n第二行' }));
  const traditional = createTranslationRuntime(languagePack('zh-TW', 'test-1'));
  const revised = createTranslationRuntime(languagePack('zh-CN', 'test-2'));
  assert.equal(original.startsWrapped('First line'), true);
  assert.equal(traditional.startsWrapped('First line'), false);
  assert.equal(revised.startsWrapped('First line'), false);
  assert.equal(original.startsWrapped('First line'), true);
});

test('多行缓存达到上限后淘汰旧输入，重新匹配结果保持一致', t => {
  const runtime = createTranslationRuntime(languagePack('zh-CN', 'test-1', { 'First line\nSecond line': '第一行\n第二行' }));
  assert.equal(runtime.startsWrapped('First line'), true);
  for (let index = 0; index < 8192; index++) assert.equal(runtime.startsWrapped(`Unknown ${index}`), false);
  const originalTest = RegExp.prototype.test;
  const calls = t.mock.method(RegExp.prototype, 'test', function (value) { return originalTest.call(this, value); });
  assert.equal(runtime.startsWrapped('First line'), true);
  assert.ok(calls.mock.callCount() > 0, '超出容量后旧输入需要重新匹配');
  const previous = calls.mock.callCount();
  assert.equal(runtime.startsWrapped('First line'), true);
  assert.equal(calls.mock.callCount(), previous);
});
