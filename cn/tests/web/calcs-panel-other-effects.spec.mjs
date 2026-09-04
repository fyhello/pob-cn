import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = relative => readFile(new URL(relative, import.meta.url), 'utf8');

test('技能伤害面板的其他效果卡片只绑定官方原始分区', async () => {
  const [panel, calcSections] = await Promise.all([
    source('../../web/src/components/CalcsPanel.vue'),
    source('../../../src/Modules/CalcSections.lua'),
  ]);

  assert.match(calcSections, /\{ 1, "MiscEffects", 1,[\s\S]*?label = "Other Effects"/, 'PoB 官方必须定义 Other Effects 分区');
  assert.match(panel, /onCardMouseEnter\('otherEffects', \$event\)/);
  assert.match(panel, /subSectionKey: 'Other Effects'/);
  assert.match(panel, /translateWebText\('Other Effects'\)/);
  assert.match(panel, /activeCardKey !== 'otherEffects'/, '其他效果不得伪装为单一最终计算值');
  assert.doesNotMatch(panel, /\b(?:multipliers|incDamage|moreDamage|multiplierSources)\b/, '已移除的伪乘区字段不得回流');
});

test('其他效果卡片的新增官方行名只来自唯一词典', async () => {
  const translations = JSON.parse(await source('../../generated/web-data/translations.json'));
  const expectedTerms = {
    'Other Effects': '其他效果',
    'Chance to Daze': '昏迷几率',
    'Chance to Rearm': '重新部署几率',
    'Enemy ES Recovery': '敌人能量护盾回复',
    'Enemy Life Recovery': '敌人生命回复',
    'Enemy Mana Recovery': '敌人魔力回复',
    'IIR for Magic Mobs': '魔法怪物物品稀有度',
    'IIQ for Normal Mobs': '普通怪物物品数量',
    'Inc. Item Quantity': '提高物品数量',
    'Inc. Item Rarity': '提高物品稀有度',
    'Inc. Quiver Effect': '提高箭袋效果',
    'Knockback Chance': '击退几率',
    'Knockback Dist.': '击退距离',
    'MH K.B. Chance': '主手击退几率',
    'MH K.B. Dist.': '主手击退距离',
    'MH Stun Duration': '主手眩晕持续时间',
    'MH Stun Threshold': '主手眩晕阈值',
    'MS While Casting': '施法时移动速度',
    'OH K.B. Chance': '副手击退几率',
    'OH K.B. Dist.': '副手击退距离',
    'OH Stun Duration': '副手眩晕持续时间',
    'OH Stun Threshold': '副手眩晕阈值',
    'Presence Mod': '在场修正',
    'Presence Radius': '在场半径',
    'Surrounded Mod': '被包围修正',
    'Surrounded Radius': '被包围半径',
  };

  for (const [sourceText, translated] of Object.entries(expectedTerms)) {
    assert.equal(translations.terms[sourceText], translated, `${sourceText} 必须由唯一词典翻译`);
  }
});
