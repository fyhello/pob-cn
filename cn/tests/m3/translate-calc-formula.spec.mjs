import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const trans = JSON.parse(readFileSync('cn/generated/web-data/translations.json', 'utf8'));
const CALC_TERMS_DICT = trans.terms || {};
const CALC_EXACT_PHRASES = trans.terms || {};
const GEM_NAME_MAPPINGS = trans.terms || {};

const BUILDUPS = {
  'HeavyStun': '眩晕积蓄',
  'Heavy Stun': '眩晕积蓄',
  'Freeze': '冻结积蓄',
  'Shock': '感电积蓄',
  'Ignite': '点燃积蓄',
  'Chill': '冰缓积蓄',
  'Bleed': '流血积蓄',
  'Poison': '中毒积蓄',
  'Electrocute': '电击积蓄',
  'Pin': '钉刺积蓄',
  'Immobilisation': '定身积蓄'
};

function translateAilmentBuildup(ailment) {
  return BUILDUPS[ailment] || `${ailment}积蓄`;
}

function translateAilmentName(name) {
  const map = {
    'Shock': '感电',
    'Ignite': '点燃',
    'Freeze': '冻结',
    'Chill': '冰缓',
    'Bleed': '流血',
    'Poison': '中毒',
    'Electrocute': '电击',
    'HeavyStun': '眩晕',
    'Heavy Stun': '眩晕'
  };
  return map[name] || name;
}

const ALL_DICT = { ...CALC_TERMS_DICT, ...CALC_EXACT_PHRASES };

const SORTED_CALC_TERMS = Object.entries(ALL_DICT)
  .filter(([k]) => k.length > 1 && !['to', 'as', 's', 'm', 'ms', 'x'].includes(k.toLowerCase()))
  .sort((a, b) => b[0].length - a[0].length);

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function translateCalcFormulaLine(line) {
  if (!line || typeof line !== 'string') return '';
  let res = line.trim();
  if (!res) return '';

  if (GEM_NAME_MAPPINGS[res]) return GEM_NAME_MAPPINGS[res];
  const directClean = res.replace(/^Skill:\s*/i, '').replace(/^Item:\s*/i, '').trim();
  if (GEM_NAME_MAPPINGS[directClean]) return GEM_NAME_MAPPINGS[directClean];

  res = res.replace(/\^[0-9A-Fa-f]/g, '').replace(/\^x[0-9A-Fa-f]{6}/g, '').trim();

  // 1. 【第 1 优先级】：官方整句长模板与动态模板正则匹配
  res = res.replace(/Ailment mode:\s*Average Damage\s*\(can be changed in the Configuration tab\)/gi, '异常计算模式: 平均伤害 (可在【配置】选项卡修改)');
  res = res.replace(/Ailment mode:\s*Crits Only\s*\(can be changed in the Configuration tab\)/gi, '异常计算模式: 仅限暴击 (可在【配置】选项卡修改)');
  res = res.replace(/Ailment mode:\s*(.+?)\s*\(can be changed in the Configuration tab\)/gi, '异常计算模式: $1 (可在【配置】选项卡修改)');
  
  res = res.replace(/If hitting constantly,\s*your average strongest ailment currently achieves\s*([\d\.]+%?)\s*of its max damage/gi, '若持续击中，你平均最强的异常状态目前能达到其最大伤害的 $1');
  res = res.replace(/The percentage of your max stacks that are applied on average if you are attacking constantly/gi, '在持续攻击状态下，平均能施加的最大层数比例');
  res = res.replace(/Uses a weighted average formula when stack potential is over 100%/gi, '当堆叠潜力超过 100% 时使用加权平均公式计算');
  res = res.replace(/This is the average roll of an ailment affecting the enemy if you are constantly attacking/gi, '这是在持续攻击情况下，影响敌人的异常状态的平均伤害期望');
  
  res = res.replace(/Total base DPS per\s+([a-zA-Z\s]+):/gi, (m, p1) => `每 ${translateAilmentName(p1.trim())} 基础每秒伤害:`);
  
  res = res.replace(/Regular Hit\s+(Heavy\s*Stun|Freeze|Shock|Ignite|Chill|Bleed|Poison|Electrocute|Pin|Immobilisation)\s+buildup/gi, (m, p1) => `常规击中 ${translateAilmentBuildup(p1)}`);
  res = res.replace(/Crit\s+(Heavy\s*Stun|Freeze|Shock|Ignite|Chill|Bleed|Poison|Electrocute|Pin|Immobilisation)\s+buildup/gi, (m, p1) => `暴击 ${translateAilmentBuildup(p1)}`);
  res = res.replace(/Average\s+(Heavy\s*Stun|Freeze|Shock|Ignite|Chill|Bleed|Poison|Electrocute|Pin|Immobilisation)\s+buildup/gi, (m, p1) => `平均 ${translateAilmentBuildup(p1)}`);
  
  res = res.replace(/Enemy poise:\s*(\d+)/gi, '敌人韧性值: $1');
  res = res.replace(/Enemy level:\s*(\d+)/gi, '敌人等级: $1');
  res = res.replace(/Enemy resistance:\s*(\d+%?)/gi, '敌人抗性: $1');
  res = res.replace(/Effective DPS modifier:/gi, '有效秒伤修正倍率:');
  res = res.replace(/Effective DoT Multiplier:/gi, '有效持续伤害倍率:');
  res = res.replace(/Effective resistance:/gi, '有效抗性:');
  res = res.replace(/Combined chance:/gi, '综合触发几率:');
  
  res = res.replace(/\(can be overridden in the Configuration tab\)/gi, '(可在【配置】选项卡修改)');
  res = res.replace(/\(overridden from the Configuration tab\)/gi, '(已在【配置】选项卡修改)');
  res = res.replace(/\(chance from non-crits?\)/gi, '(非暴击触发贡献)');
  res = res.replace(/\(chance from crits?\)/gi, '(暴击触发贡献)');
  res = res.replace(/\(resistance\)/gi, '(抗性减免)');
  res = res.replace(/\(penetration\)/gi, '(抗性穿透)');
  res = res.replace(/\(Duration \/ Attack Time\)/gi, '(持续时间 / 攻击耗时)');
  res = res.replace(/\(Duration \/ Cast Time\)/gi, '(持续时间 / 施法耗时)');
  res = res.replace(/\(Duration \/ max\(Cooldown, Cast Time\)\)/gi, '(持续时间 / max(冷却时间, 施法耗时))');
  res = res.replace(/\(max number of stacks\)/gi, '(最大层数上限)');
  res = res.replace(/\(number of stacks\)/gi, '(堆叠层数)');
  res = res.replace(/\(chance to apply\)/gi, '(施加几率)');
  res = res.replace(/\(chance to hit\)/gi, '(命中几率)');
  res = res.replace(/\(damage from weapon\)/gi, '(来自武器的基础伤害)');
  res = res.replace(/\(damage from skill\)/gi, '(来自技能石的基础伤害)');
  res = res.replace(/\(damage from main hand\)/gi, '(来自主手的基础伤害)');
  res = res.replace(/\(damage from off hand\)/gi, '(来自副手的基础伤害)');
  res = res.replace(/\(damage from non-crits?\)/gi, '(非暴击伤害)');
  res = res.replace(/\(damage from crits?\)/gi, '(暴击伤害)');
  res = res.replace(/\(total damage\)/gi, '(总伤害)');
  res = res.replace(/\(base damage\)/gi, '(基础伤害)');
  res = res.replace(/\(increased\/reduced\)/gi, '(提高/降低加成)');
  res = res.replace(/\(more\/less\)/gi, '(更多/更少乘区)');
  res = res.replace(/\(effective DPS modifier\)/gi, '(有效秒伤修正倍率)');
  res = res.replace(/\(source damage\)/gi, '(基础伤害来源)');
  res = res.replace(/\(source damage from non-crits?\)/gi, '(非暴击基础伤害来源)');
  res = res.replace(/\(source damage from crits?\)/gi, '(暴击基础伤害来源)');
  res = res.replace(/\(portion of instances created by non-crits?\)/gi, '(非暴击生成实例占比)');
  res = res.replace(/\(portion of instances created by crits?\)/gi, '(暴击生成实例占比)');
  res = res.replace(/\(portion of instances created by main hand\)/gi, '(主手生成实例占比)');
  res = res.replace(/\(portion of instances created by off hand\)/gi, '(副手生成实例占比)');
  res = res.replace(/\(portion of damage from non-crits?\)/gi, '(非暴击伤害占比)');
  res = res.replace(/\(portion of damage from crits?\)/gi, '(暴击伤害占比)');

  // 2. 【第 2 优先级】：完全精准匹配
  if (ALL_DICT[res]) return ALL_DICT[res];

  // 3. 【第 3 优先级】：按长度降序词典正则安全替换
  for (const [k, v] of SORTED_CALC_TERMS) {
    if (new RegExp(escapeRegExp(k), 'i').test(res)) {
      const regex = /^[a-zA-Z0-9_]+$/.test(k) 
        ? new RegExp(`\\b${escapeRegExp(k)}\\b`, 'gi')
        : new RegExp(escapeRegExp(k), 'gi');
      res = res.replace(regex, v);
    }
  }

  // 4. 【第 4 优先级】：基础单词与单位收尾
  res = res.replace(/\bper second\b/gi, '每秒');
  res = res.replace(/\bper minute\b/gi, '每分');
  res = res.replace(/\btotal damage\b/gi, '总伤害');
  res = res.replace(/\bbase damage\b/gi, '基础伤害');
  res = res.replace(/\bhit damage\b/gi, '击中伤害');
  res = res.replace(/\bdamage\b/gi, '伤害');
  res = res.replace(/\btotal\b/gi, '总计');
  res = res.replace(/\bbase\b/gi, '基础');
  res = res.replace(/\bto\b/gi, '至');
  res = res.replace(/\bas\b/gi, '为');

  return res;
}

describe('Strict Formula Translation Integrity', () => {
  it('correctly translates user 4 latest screenshot batches: full breakdown sentences, ailments and roll averages', () => {
    // 截图 1 & 3: Ailments & Roll averages
    assert.strictEqual(translateCalcFormulaLine('Ail. Thresh.'), '异常状态门槛');
    assert.strictEqual(translateCalcFormulaLine('Enemy Ail. Thresh.'), '敌人异常状态门槛');
    assert.strictEqual(translateCalcFormulaLine('Max Ignite Stacks'), '最大点燃层数');
    assert.strictEqual(translateCalcFormulaLine('Stack Potential'), '堆叠潜力');
    assert.strictEqual(translateCalcFormulaLine('Average Ignite Roll'), '平均点燃伤害期望');
    assert.strictEqual(translateCalcFormulaLine('Chance to Ignite'), '点燃几率');
    assert.strictEqual(translateCalcFormulaLine('Chance to Shock'), '感电几率');
    assert.strictEqual(translateCalcFormulaLine('Source Lightning'), '闪电伤害来源');
    assert.strictEqual(translateCalcFormulaLine('Source Cold'), '冰霜伤害来源');
    assert.strictEqual(translateCalcFormulaLine('Source Fire'), '火焰伤害来源');
    assert.strictEqual(translateCalcFormulaLine('Source Chaos'), '混沌伤害来源');
    assert.strictEqual(translateCalcFormulaLine('Effective DPS Mod'), '有效DPS修正');
    assert.strictEqual(translateCalcFormulaLine('Dmg. of All Ignites'), '全部点燃总伤害');

    // 截图 2 & 4: 推导长句与注释
    assert.strictEqual(translateCalcFormulaLine('Non-Crit Dmg Derivation:'), '非暴击伤害推导:');
    assert.strictEqual(translateCalcFormulaLine('Crit Dmg Derivation:'), '暴击伤害推导:');
    assert.strictEqual(translateCalcFormulaLine('Damage from Non-crits:'), '来自非暴击的伤害:');
    assert.strictEqual(translateCalcFormulaLine('Damage from Crits:'), '来自暴击的伤害:');
    assert.strictEqual(
      translateCalcFormulaLine('min combined sources + (max combined sources - min combined sources) * average roll'),
      '最小来源总和 + (最大来源总和 - 最小来源总和) * 平均Roll点'
    );
    assert.strictEqual(
      translateCalcFormulaLine('This is the average roll of an ailment affecting the enemy if you are constantly attacking'),
      '这是在持续攻击情况下，影响敌人的异常状态的平均伤害期望'
    );
    assert.strictEqual(
      translateCalcFormulaLine('Uses a weighted average formula when stack potential is over 100%'),
      '当堆叠潜力超过 100% 时使用加权平均公式计算'
    );
    assert.strictEqual(
      translateCalcFormulaLine('Average Roll:'),
      '平均伤害期望:'
    );
    assert.strictEqual(
      translateCalcFormulaLine('182376.9 ^8(source damage from non-crits)'),
      '182376.9 (非暴击基础伤害来源)'
    );
    assert.strictEqual(
      translateCalcFormulaLine('x 0.008 ^8(portion of instances created by non-crits)'),
      'x 0.008 (非暴击生成实例占比)'
    );

    // 积蓄度与速度
    assert.strictEqual(translateCalcFormulaLine('Avg: 0.3%'), '平均: 0.3%');
    assert.strictEqual(translateCalcFormulaLine('Crit Min: 2.2%'), '暴击最小: 2.2%');
    assert.strictEqual(translateCalcFormulaLine('Crit Max: 3.3%'), '暴击最大: 3.3%');
    assert.strictEqual(translateCalcFormulaLine('Crit Avg: 2.7%'), '暴击平均: 2.7%');
    assert.strictEqual(translateCalcFormulaLine('More Cast Speed'), '施法速度更多');
    assert.strictEqual(translateCalcFormulaLine('More施法速度'), '施法速度更多');
    assert.strictEqual(translateCalcFormulaLine('= 0.72 casts per second'), '= 0.72 每秒施法次数');
  });
});
