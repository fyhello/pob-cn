import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadLocalizer } from '../helpers/web-localizer.mjs';

test('锁定语言包覆盖传奇身份、生成式词条、匿名参数和独立繁中术语', async () => {
  const translation = await loadLocalizer();
  const item = { title: 'Amor Mandragora', base: 'Changeling Talisman', rarity: 'UNIQUE' };
  assert.equal(translation.translateWebItemLine('Adds 18 to 25 Physical Damage', { item }), '附加 18 - 25 物理伤害');
  assert.equal(translation.translateWebItemLine('74% increased Spirit', { item: { base: 'Rattling Sceptre' } }), '该装备精魂提高 74%');
  assert.equal(translation.translateWebItemLine('Small Passive Skills in Radius also grant +3% to Chaos Resistance'), '范围内的小型天赋同时提供 混沌抗性 +3%');
  assert.equal(translation.translateWebItemLine('Weapon Range: 1.2 metres'), '武器范围：1.2 米');
  assert.equal(translation.translateWebItemLine('Ezomyte Quarterstaff'), '艾兹麦节杖');
  assert.equal(translation.translateWebText('Runes of Aldur'), '奥杜尔秘符');
  assert.equal(translation.translateWebItemLine('+3 to Level of all Wolf Pack Skills'), '所有 狼群 技能等级 +3');
  assert.equal(translation.translateWebItemLine('+0.4 metres to Melee Strike Range if you\'ve dealt a Projectile Attack Hit in the past eight seconds'), '若过去八秒内使用投射物攻击击中，+0.4 米近战打击范围');
  await translation.setTranslationLocale('zh-TW');
  assert.equal(translation.translateWebItemLine('+3 to Level of all Wolf Pack Skills'), '全部 召喚惡狼 技能等級 +3');
  assert.equal(translation.translateWebItemLine('Ezomyte Quarterstaff'), '艾茲麥細杖');
  assert.equal(translation.translateWebText('Runes of Aldur'), '阿德爾的符文');
  await translation.setTranslationLocale('zh-CN');
  const rows = translation.localizeWebItemRows(['Nature respects the strong', 'And paints the snow red', 'With the blood of the weak'], [false, false, false],
    { item: { title: "Alpha's Howl", base: 'Armoured Cap', rarity: 'UNIQUE' } });
  assert.equal(rows.length, 1);
  assert.match(rows[0].translated, /自然滋养着强悍的灵魂/);
  assert.equal(rows[0].unsupported, false);
});

test('官方正文投影在珠宝卡片中保留每条原文与支持状态，不被旧空数组遮蔽', async () => {
  const { localizeImportedItem } = await loadLocalizer();
  const original = { name: 'Spirit Spark', rarity: 'RARE', base: 'Sapphire', raw: 'canonical',
    rawLines: [], lines: [], displayLines: ['+12 to maximum Life', null, 'Unknown Experimental Affix'], displayLineUnsupported: [false, false, true] };
  const item = localizeImportedItem(original);
  assert.equal(item.displayRows.length, 2);
  assert.equal(item.lines_cn.length, 2);
  assert.equal(item.displayRows[1].raw, 'Unknown Experimental Affix');
  assert.equal(item.displayRows[1].unsupported, true);
  assert.equal(item.raw, 'canonical');
  assert.deepEqual(original.rawLines, []);
});

test('物品预览整段背景翻译保留原文与不生效状态', async () => {
  const { localizeWebItemRows } = await loadLocalizer();
  const flavour = ['The Unblinking Eye did not cower and wail.', 'They stood against the end.'];
  const lines = ['Unknown Experimental Affix', ...flavour, '60% increased Runic Ward'];
  const rows = localizeWebItemRows(lines, [true, false, false, true]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].raw, lines[0]);
  assert.equal(rows[0].unsupported, true);
  assert.equal(rows[1].raw, flavour.join('\n'));
  assert.equal(rows[1].translated, '凝望之眼绝不会退缩，\n他们傲立至最后一刻。');
  assert.equal(rows[1].unsupported, false);
  assert.equal(rows[2].translated, '符文结界提高 60%');
  assert.equal(rows[2].unsupported, true);
  const mixed = localizeWebItemRows(flavour, [false, true]);
  assert.equal(mixed.length, 2, '不同支持状态禁止合并');
  assert.equal(mixed[0].raw, flavour[0]);
  assert.equal(mixed[1].unsupported, true);
});

test('官方动态需求行、孔位和范围珠宝只搬运原始参数', async () => {
  const { translateWebItemLine: translate, translateWebItemType, translateCalcFormulaLine } = await loadLocalizer();
  for (const [raw, expected] of [
    ['Requires Level 65, 41 Str, 41 Dex, 41 Int', '需求：等级 65，41 力量，41 敏捷，41 智慧'],
    ['Requires Level 65, 41 Str', '需求：等级 65，41 力量'],
    ['Requires: 41 Intelligence', '需求：41 智慧'],
    ['Sockets: S S S S', '插槽：S S S S'],
    ['Sockets: J J', '插槽：J J'],
    ['Passives in Radius of Chaos Inoculation can be Allocated\nwithout being connected to your tree', '异灵之体范围内的天赋可以在\n未连结至天赋树的情况下配置'],
  ]) assert.equal(translate(raw), expected, raw);
  assert.equal(translateWebItemType('Warstaff'), '节杖');
  assert.equal(translateCalcFormulaLine('Life:'), '生命：');
  assert.equal(translateCalcFormulaLine('Crit Bifurcates'), '分叉暴击');
  assert.equal(translate('Requires Level 65, Experimental 100'), 'Requires Level 65, Experimental 100');
});

test('普通与传奇预览、物品浮窗共用支持状态分组入口', async () => {
  for (const name of ['ItemCraftingStudio', 'UniqueItemCraftingPanel']) {
    const source = await readFile(new URL(`../../web/src/components/${name}.vue`, import.meta.url), 'utf8');
    assert.match(source, /<ItemDisplayLines :lines="[^\"]+\.tooltip\.bodyLines" :unsupported="[^\"]+\.tooltip\.bodyLineUnsupported"/);
  }
  const source = await readFile(new URL('../../web/src/components/ItemDisplayLines.vue', import.meta.url), 'utf8');
  assert.match(source, /localizeWebItemRows\(props\.lines, props\.unsupported, \{ item: props\.item, items: store\.itemLibrary \}\)/);
});

test('原生稀有名称和魔法命名顺序按物品语境翻译，自定义名保持不变', async () => {
  const { translateWebItemName: name, translateCalcSourceName, localizeImportedItem, setTranslationLocale } = await loadLocalizer();
  const item = { id: 7, name: 'Empyrean Corona', title: 'Empyrean Corona', base: 'Kamasan Tiara', rarity: 'RARE', crafted: false };
  assert.equal(name('Ghoul Spire', { item }), '活尸 术涡');
  assert.equal(name(item.name, { item }), '苍空 阳光之冠');
  assert.equal(name('Ghoul Experimental', { item }), 'Ghoul Experimental');
  assert.equal(name('Ghoul Spire'), 'Ghoul Spire', '无物品语境不组合普通词项');
  assert.equal(localizeImportedItem({ ...item, crafted: true }).name_cn, item.name);
  assert.equal(localizeImportedItem({ ...item, name: 'Unknown Experimental Name' }).name_cn, 'Unknown Experimental Name');
  assert.equal(translateCalcSourceName({ sourceName: 'Empyrean Corona, Kamasan Tiara', sourceType: 'Item' }, item), '苍空 阳光之冠, 卡马萨冠冕');
  assert.equal(name("Clinician's Stone Charm of the Copious", { item: { rarity: 'MAGIC', base: 'Stone Charm' } }), '临床师的 丰富之 磐石咒符');
  await setTranslationLocale('zh-TW');
  assert.notEqual(name('Ghoul Spire', { item }), '活尸 术涡');
});

test('装备等价原生标点冲突经审核解决，原文及不生效状态仍一一对应', async () => {
  const { localizeWebItemRows, translateWebText } = await loadLocalizer();
  const raw = '18% increased Armour, Evasion and Energy Shield';
  const rows = localizeWebItemRows([raw, 'Unknown Experimental Affix'], [false, true]);
  assert.equal(rows[0].translated, '护甲、闪避和能量护盾提高 18%');
  assert.equal(rows[0].raw, raw);
  assert.equal(rows[0].unsupported, false);
  assert.equal(rows[1].unsupported, true);
  assert.equal(translateWebText(raw), raw, '未指定物品显示语境时仍保留未消歧原文');
});
