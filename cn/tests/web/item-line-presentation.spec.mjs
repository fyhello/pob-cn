import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { loadLocalizer } from '../helpers/web-localizer.mjs';

const ts = createRequire(import.meta.url)('typescript');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(await readFile(new URL('../../web/src/utils/itemLinePresentation.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module, exports: module.exports });
const { presentItemRows } = module.exports;
const rows = (...lines) => lines.map(raw => ({ raw, translated: raw, unsupported: false }));
const kinds = result => Array.from(result, row => row.kind);

test('只对官方比较区的前导正负数着色，不重新计算数值或判断收益', () => {
  const input = rows('+34 to maximum Mana', '-10% to Fire Resistance',
    'Equipping this item in Amulet will give you:\n(replacing Foo)\nPlayer:',
    '+1,234.50 Average Hit (+12.3%)', '-1.25 Mana Cost (+2.5%)', '+0 Mana Cost (-4.0%)',
    'Minion:', '-98,765.4 Total DPS inc. DoT (-6.5%)',
    'Unrelated item text', '+34 to maximum Mana');
  const before = structuredClone(input);
  const result = presentItemRows(input, { tooltip: true });
  assert.deepEqual(kinds(result), ['content', 'content', 'comparison-heading', 'positive', 'negative', 'positive', 'comparison-actor', 'negative', 'content', 'content']);
  assert.deepEqual(Array.from(result, ({ raw, translated, unsupported }) => ({ raw, translated, unsupported })), before);
  assert.deepEqual(input, before);
  assert.equal(result[0].presentationClass, '');
  assert.equal(result[3].presentationClass, 'text-green-400');
  assert.equal(result[4].presentationClass, 'text-red-400');
});

test('装备两槽、卸装、药剂和护符比较各自形成区段', () => {
  for (const heading of ['Equipping This Item in Ring 1 will give you:', 'Equipping this item in Ring 2 will give you:',
    'Removing this item from Weapon 1 will give you:', 'Activating this flask will give you:',
    'Deactivating this flask will give you:', 'Activating this charm will give you:', 'Deactivating this charm will give you:']) {
    const input = rows(heading, '+1 Life', 'Removing this item from Body Armour will give you:', 'Player:', '-2 Life');
    assert.deepEqual(kinds(presentItemRows(input, { tooltip: true })), ['comparison-heading', 'positive', 'comparison-heading', 'comparison-actor', 'negative']);
  }
  assert.deepEqual(kinds(presentItemRows(rows('Equipping this item in Ring 1 will give you: extra text', '+1 Life'), { tooltip: true })), ['content', 'content']);
});

test('只隐藏网页未实现的完整桌面提示，保留其他提示和不生效原文', () => {
  const hints = rows('Tip: Hold Shift to display a tooltip for the granted skill.',
    'Tip: Hold Shift to display a tooltip for the granted skills.',
    'Tip: Shift to display a tooltip for the granted Skill.',
    'Tip: Press Ctrl+D to enable the display of stat differences.',
    'Tip: Press Ctrl+D to disable the display of stat differences.');
  const other = rows('Tip: Other official information.', 'Grants Skill: Fireball');
  const unsupported = { ...hints[0], unsupported: true };
  assert.deepEqual(Array.from(presentItemRows([...hints, ...other, unsupported], { tooltip: true }), row => row.raw), [...other, unsupported].map(row => row.raw));
  assert.equal(presentItemRows([unsupported], { tooltip: true })[0].unsupported, true);
  assert.equal(presentItemRows(hints).length, hints.length, '完整显示投影的用户标题不得被过滤');
});

test('腐化色需要官方状态，完整物品投影只有末尾状态行标红', () => {
  const input = rows('Corrupted', 'Gold Ring', '+34 to maximum Mana', 'Corrupted');
  assert.deepEqual(kinds(presentItemRows(input, { item: { corrupted: true } })), ['content', 'content', 'content', 'corrupted']);
  assert.deepEqual(kinds(presentItemRows(input, { item: { corrupted: false } })), ['content', 'content', 'content', 'content']);
  const double = presentItemRows(rows('Twice Corrupted', 'Official flavour text'), { tooltip: true, item: { doubleCorrupted: true } });
  assert.deepEqual(kinds(double), ['corrupted', 'content']);
  assert.equal(double[0].presentationClass, 'text-[#dd0022] font-semibold');
  assert.deepEqual(kinds(presentItemRows([{ raw: 'Corrupted', translated: 'Corrupted', unsupported: true }], { tooltip: true, item: { corrupted: true } })), ['content']);
});

test('显示装饰位于多行翻译之后，简繁切换不改变原文身份和不生效标记', async () => {
  const translation = await loadLocalizer();
  const raw = ['The Unblinking Eye did not cower and wail.', 'They stood against the end.', 'Unknown Experimental Affix',
    'Corrupted', 'Equipping this item in Body Armour will give you:', '+1,234.5 Average Hit (+12.3%)', '+41 Intelligence Required'];
  for (const locale of ['zh-CN', 'zh-TW']) {
    await translation.setTranslationLocale(locale);
    const localized = translation.localizeWebItemRows(raw, [false, false, true, false, false, false]);
    const result = presentItemRows(localized, { tooltip: true, item: { corrupted: true } });
    assert.deepEqual(Array.from(result, row => [row.raw, row.translated, row.unsupported]), Array.from(localized, row => [row.raw, row.translated, row.unsupported]));
    assert.equal(result[0].raw, raw.slice(0, 2).join('\n'));
    assert.equal(result[1].unsupported, true);
    assert.equal(result[1].presentationClass, '');
    assert.equal(result[2].kind, 'corrupted');
    assert.equal(result.at(-1).kind, 'positive');
    if (locale === 'zh-CN') assert.equal(result.at(-1).translated, '需要 +41 智慧', '译文可以换序，颜色仍按官方原文前导符号');
  }
});
