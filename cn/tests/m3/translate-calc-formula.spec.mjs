import assert from 'node:assert/strict';
import test from 'node:test';
import { loadLocalizer } from '../helpers/web-localizer.mjs';
import { readFile } from 'node:fs/promises';
import { createTranslationRuntime } from '../../shared/translation-runtime.mjs';

test('完整消耗结构覆盖全部官方资源类型，参数符号和精度原样保留', async () => {
  const { translateCalcFormulaLine: translate } = await loadLocalizer();
  const runtime = createTranslationRuntime(JSON.parse(await readFile('cn/generated/web-data/translations.json')));
  const numericTokens = text => text.match(/[+-]?\d[\d,.]*%?/g);
  const lines = ['x 1.3200 (cost multiplier)', 'x 0.92 (8% paid for with life)', '4.00s (base duration)', 'x 1.09 (duration modifier)', 'x 0.08 (mana cost conversion)'];
  for (const resource of ['mana', 'life', 'ES', 'soul', 'rage', 'mana/s', 'life/s', 'ES/s']) {
    lines.push(`12.30% (base ${resource} cost)`, `+ 162 (additional ${resource} cost)`, `x 1.35 (increased/reduced ${resource} cost)`,
      `x 2.00 (more/less ${resource} cost)`, `/ 1.25 (${resource} cost efficiency)`, `-15 (total ${resource} cost)`);
  }
  for (const source of lines) {
    const display = translate(source);
    assert.notEqual(display, source, source);
    assert.equal(runtime.hasUntranslated(display), false, display);
    assert.deepEqual(numericTokens(display), numericTokens(source), source);
  }
  assert.equal(translate('x 1.35 (experimental mana rule)'), 'x 1.35 (experimental mana rule)');
});

test('装备对比覆盖官方完整标签目录，替换名称按实际物品身份显示', async () => {
  const localizer = await loadLocalizer();
  const payload = JSON.parse(await readFile('cn/generated/web-data/translations.json'));
  const runtime = createTranslationRuntime(payload);
  assert.ok(payload.comparisonLabels.length > 100);
  for (const label of payload.comparisonLabels) {
    for (const prefix of ['+1,234.50', '-0.05%', '+0']) {
      const source = `${prefix} ${label} (-0.5%)`, display = localizer.translateWebItemLine(source);
      assert.equal(runtime.hasUntranslated(display), false, source);
      assert.ok(display.startsWith(prefix + ' '), source);
      assert.ok(display.endsWith('（-0.5%）'), source);
    }
  }
  const officialFormats = await readFile('src/Modules/BuildDisplayStats.lua', 'utf8');
  const unitLabels = [...officialFormats.matchAll(/label = "([^"]+)".*?fmt = "([^"]+)"/g)]
    .map(([, label, format]) => ({ label, unit: format.match(/[ms]$/)?.[0] })).filter(row => row.unit);
  assert.deepEqual([...new Set(unitLabels.map(row => row.unit))].sort(), ['m', 's']);
  for (const { label, unit } of unitLabels) {
    const prefix = `-0.050${unit}`, source = `${prefix} ${label} (-0.5%)`;
    const display = localizer.translateWebItemLine(source);
    assert.equal(runtime.hasUntranslated(display), false, source);
    assert.deepEqual(display.match(/[+-]?\d[\d,.]*%?/g), source.match(/[+-]?\d[\d,.]*%?/g), source);
    assert.ok(display.includes(unit === 'm' ? '米' : '秒'), source);
    assert.ok(display.endsWith('（-0.5%）'), source);
  }
  const item = { id: 19, title: 'Armageddon Turn', name: 'Armageddon Turn, Emerald Ring', base: 'Emerald Ring', rarity: 'RARE' };
  const display = localizer.translateWebItemLine('(replacing Armageddon Turn, Emerald Ring)', { items: [item] });
  assert.equal(runtime.hasUntranslated(display), false, display);
  assert.equal(localizer.translateWebItemLine('(replacing My Custom Ring)', { items: [{ title: 'My Custom Ring', name: 'My Custom Ring', rarity: 'RARE', crafted: true }] }), '（替换 My Custom Ring）');
  assert.equal(localizer.translateWebItemLine('+12 Unknown Experimental Stat (+3.0%)'), '+12 Unknown Experimental Stat (+3.0%)');
  for (const locale of ['zh-CN', 'zh-TW']) {
    await localizer.setTranslationLocale(locale);
    for (const source of ['Equipping this item in Socket #2 will give you:', 'Removing this item from Socket #3 will give you:']) {
      const display = localizer.translateWebItemLine(source);
      assert.equal(runtime.hasUntranslated(display), false, display);
      assert.equal(display.match(/#\d+/)?.[0], source.match(/#\d+/)?.[0]);
    }
    for (const source of ['PresenceArea', 'ManaCost']) assert.equal(runtime.hasUntranslated(localizer.translateCalcFormulaLine(source)), false);
  }
});

test('天赋和装备语境分开使用原生词缀，简繁同名实体及固定参数不混淆', async () => {
  const l = await loadLocalizer();
  assert.equal(l.localizePassiveNode({ name: 'Ruin', type: 'Socket', stats: ['25% increased Totem Placement speed', 'Regenerate 0.5% of maximum Life per second', '25% reduced Armour, Evasion and Energy Shield'] }).stats_cn.join('\n'), '你的图腾放置速度提高 25%\n生命每秒再生 0.5%\n护甲、闪避和能量护盾降低 25%');
  assert.equal(l.translateWebItemName('Spirit Spark', { item: { rarity: 'RARE', base: 'Sapphire' } }), '精魂 夜星');
  assert.equal(l.translateVariantName('Shield'), '能量护盾');
  await l.setTranslationLocale('zh-TW');
  assert.equal(l.translateWebItemLine('+1 to Level of all Cold Skills', { scope: 'passive' }), '全部冰冷技能等級+1');
  assert.equal(l.translateWebItemName('Spirit Spark', { item: { rarity: 'RARE', base: 'Sapphire' } }), '精魂 電球');
});

test('公式翻译测试执行实际前端模块，保留原始参数与运算符', async () => {
  const { translateCalcFormulaLine: translate } = await loadLocalizer();
  for (const [source, expected] of [
    ['Ail. Thresh.', '异常状态门槛'], ['Enemy Ail. Thresh.', '敌人异常状态门槛'],
    ['Max Ignite Stacks', '最大点燃层数'], ['Stack Potential', '堆叠潜力'],
    ['Chance to Ignite', '点燃几率'], ['Chance to Shock', '感电几率'],
    ['Source Lightning', '闪电伤害来源'], ['Source Cold', '冰霜伤害来源'],
    ['Source Fire', '火焰伤害来源'], ['Source Chaos', '混沌伤害来源'],
    ['182376.9 ^8(source damage from non-crits)', '182376.9 (非暴击基础伤害来源)'],
    ['x 0.008 ^8(portion of instances created by non-crits)', 'x 0.008 (非暴击生成实例占比)'],
    ['Physical:', '物理：'], ['Unknown Experimental Formula', 'Unknown Experimental Formula'],
    ['330 to 495 (damage from skill)', '330 至 495 (来自技能石的基础伤害)'],
    ['3042 to 4562 (total damage)', '3042 至 4562 (总伤害)'],
    ['1521 (base)', '1521 (基础)'], ['73.5 per second', '73.5 每秒'],
    ['Life Regeneration:', '生命再生：'], ['LifeRegen', '固定生命再生'],
    ['Inc/red', '提高／降低'], ['More/less', '总增／总降'],
    ['Converted Damage', '转换所得伤害'],
    ['DamageGainAsCold', '获得额外冰霜伤害（基于所有伤害）'],
    ['ElementalDamageGainAsCold', '获得额外冰霜伤害（基于元素伤害）'],
  ]) assert.equal(translate(source), expected, source);
  for (const source of ['123.00 x (1 + 0.007)', '-1.50 + 2.500 / 100', 'min(0.000, 12.20)']) assert.equal(translate(source), source);
});

test('明细表空值遵循 Lua 显示语义，数字范围与未知字段不会被静默放行', async () => {
  const { translateCalcCell: cell, translateWebText, translateCalcFormulaLine, getMissingTranslations } = await loadLocalizer();
  assert.equal(cell(false, 'convSrc'), '');
  assert.equal(cell(null, 'base'), '');
  assert.equal(cell(0, 'base'), '0');
  assert.equal(cell('0.00', 'total'), '0.00');
  assert.equal(cell('1.20 to 2.500', 'base'), '1.20 至 2.500');
  assert.equal(translateWebText('1 to 2'), '1 to 2', '数值范围规则仅用于官方明细语境');
  const unknown = '330 to 495 (experimental damage mode)';
  assert.equal(translateCalcFormulaLine(unknown), unknown);
  assert.ok(getMissingTranslations().some(row => row.source === unknown));
});

test('语言变化只重做显示投影，原始字段、物品身份与数字不变', async () => {
  const localizer = await loadLocalizer();
  const raw = { itemLibrary: [{ id: 7, name: 'Dueling Wand', base: 'Dueling Wand', rawLines: ['60% increased Runic Ward'] }], socketGroups: [{ gems: [{ name: 'Efficiency I' }] }] };
  const before = JSON.stringify(raw), display = localizer.localizeImportedBuild(raw);
  assert.equal(display.itemLibrary[0].name_cn, '决斗法杖');
  assert.equal(display.socketGroups[0].gems[0].name_cn, '效能 I');
  await localizer.setTranslationLocale('zh-TW');
  assert.equal(display.itemLibrary[0].name_cn, '單挑法杖');
  assert.equal(display.socketGroups[0].gems[0].name_cn, '效率 I');
  assert.equal(display.itemLibrary[0].id, 7);
  assert.equal(JSON.stringify(raw), before);
  await assert.rejects(localizer.setTranslationLocale('invalid'), /不支持/);
  assert.equal(localizer.getTranslationLocale(), 'zh-TW');
  assert.equal(localizer.translateWebText('Flask 1'), '藥劑 1');
  assert.equal(localizer.translateWebText('Charm 3'), '護符 3');
  await localizer.setTranslationLocale('zh-CN');
  assert.equal(localizer.translateWebText('Flask 2'), '药剂 2');
  assert.equal(localizer.translateWebText('Charm 1'), '咒符 1');
  assert.equal(display.itemLibrary[0].name_cn, '决斗法杖');
});
