import translationPayload from '../../../generated/web-data/translations.json';

type TranslationDomain = 'items' | 'stats' | 'tooltip' | 'ui' | 'terms';
type TranslationPayload = {
  schema_version: number;
  items?: Record<string, string>;
  stats?: Record<string, string>;
  tooltip?: Record<string, string>;
  ui?: Record<string, string>;
  terms: Record<string, string>;
};

type TemplateEntry = {
  source: string;
  translated: string;
  expression?: RegExp;
  placeholders?: string[];
};

type WrappedTemplatePrefix = {
  source: string;
  expression?: RegExp;
};

export type LocalizedWebItemLine = {
  raw: string;
  translated: string;
};

const translations = translationPayload as TranslationPayload;
const itemNameDomains: TranslationDomain[] = ['items', 'terms', 'ui', 'tooltip', 'stats'];
const itemLineDomains: TranslationDomain[] = ['stats', 'tooltip', 'terms', 'items', 'ui'];
const genericDomains: TranslationDomain[] = ['terms', 'ui', 'items', 'stats', 'tooltip'];
const templateIndex = new Map<string, TemplateEntry[]>();
const wrappedTemplateIndex = new Map<string, WrappedTemplatePrefix[]>();
const templateNumber = '(?:\\(\\s*)?[+-]?\\d+(?:\\.\\d+)?(?:\\s*(?:-|to)\\s*[+-]?\\d+(?:\\.\\d+)?)?%?(?:\\s*\\))?';
const templateUnsignedNumber = '(?:\\(\\s*)?\\d+(?:\\.\\d+)?(?:\\s*(?:-|to)\\s*\\d+(?:\\.\\d+)?)?%?(?:\\s*\\))?';
const itemLineTranslationCache = new Map<string, string>();
const caseInsensitiveTerms = new Map<TranslationDomain, Map<string, string>>();


function domainTerms(domain: TranslationDomain): Record<string, string> {
  return translations[domain] ?? {};
}

function lowerEnglish(value: string): string {
  return value.toLocaleLowerCase('en-US');
}

function domainCaseInsensitiveTerms(domain: TranslationDomain): Map<string, string> {
  const existing = caseInsensitiveTerms.get(domain);
  if (existing) return existing;
  const indexed = new Map<string, string>();
  for (const [source, translated] of Object.entries(domainTerms(domain))) {
    indexed.set(lowerEnglish(source), translated);
  }
  caseInsensitiveTerms.set(domain, indexed);
  return indexed;
}

export function translateKnownTerm(value: string, domains: TranslationDomain[] = genericDomains): string | undefined {
  for (const domain of domains) {
    const translated = domainTerms(domain)[value] ?? domainCaseInsensitiveTerms(domain).get(lowerEnglish(value));
    if (typeof translated === 'string' && translated) return translated;
  }
  return undefined;
}

// 运行时统一词汇哈希索引（动态从 translations.json 生成，绝不硬编码私有字典）
let _combinedTermMap: Map<string, string> | null = null;
function getCombinedTermMap(): Map<string, string> {
  if (!_combinedTermMap) {
    const map = new Map<string, string>();
    for (const d of [translations.terms, translations.items, translations.stats, translations.ui]) {
      if (d) {
        for (const [k, v] of Object.entries(d)) {
          if (k && v && typeof v === 'string') {
            const lowerKey = k.toLowerCase().trim();
            if (!map.has(lowerKey)) {
              map.set(lowerKey, v);
            }
          }
        }
      }
    }
    _combinedTermMap = map;
  }
  return _combinedTermMap;
}

function lookupPhrase(phrase: string): string | undefined {
  const map = getCombinedTermMap();
  return map.get(phrase.toLowerCase().trim());
}

function hasChineseChar(str: string): boolean {
  return /[\u4e00-\u9fa5]/.test(str);
}

function appendPiece(prev: string, next: string): string {
  if (!prev) return next;
  if (!next) return prev;
  const lastChar = prev.slice(-1);
  const firstChar = next.slice(0, 1);
  if (hasChineseChar(lastChar) || hasChineseChar(firstChar)) {
    return prev + next;
  }
  return prev + ' ' + next;
}

function translateTokensInText(text: string): string {
  return text.replace(/[A-Za-z0-9_\.]+(?:\s+[A-Za-z0-9_\.]+)*/g, (match) => {
    // 优先完整匹配
    const directFull = lookupPhrase(match);
    if (directFull) return directFull;

    const words = match.split(/\s+/);
    let result = '';
    let i = 0;
    while (i < words.length) {
      let matched = false;
      // 贪婪最长匹配：优先匹配长短语（最多 6 词），逐步缩减至单词
      for (let len = Math.min(words.length - i, 6); len >= 1; len--) {
        const sub = words.slice(i, i + len).join(' ');
        const trans = lookupPhrase(sub);
        if (trans) {
          result = appendPiece(result, trans);
          i += len;
          matched = true;
          break;
        }
      }
      if (!matched) {
        result = appendPiece(result, words[i]);
        i++;
      }
    }
    return result;
  });
}

export function translateSourceType(sourceType?: string): string {
  const source = typeof sourceType === 'string' ? sourceType.trim() : '';
  return source ? (translateKnownTerm(source, genericDomains) ?? '') : '';
}

function translateAilmentName(name: string): string {
  const n = name.trim();
  return translateKnownTerm(n) || translateWebText(n) || n;
}

function translateAilmentBuildup(ailment: string): string {
  const clean = ailment.trim();
  const directBuildup = translateKnownTerm(clean + ' Buildup') || translateKnownTerm(clean + ' buildup') || translateWebText(clean + ' Buildup');
  if (directBuildup && directBuildup !== clean + ' Buildup') return directBuildup;

  const base = translateKnownTerm(clean) || translateWebText(clean);
  if (base && base !== clean) {
    return base.includes('积蓄') ? base : base + '积蓄';
  }
  return clean + ' 积蓄';
}

const formulaTranslationCache = new Map<string, string>();
const MAX_CACHE_SIZE = 8192;

export function translateCalcFormulaLine(line: string): string {
  if (!line || typeof line !== 'string') return '';
  let res = line.trim();

  // 1. 去除 PoB 官方所有颜色代码
  res = res.replace(/\^[0-9A-Fa-f]/g, '').replace(/\^x[0-9A-Fa-f]{6}/g, '').trim();

  // 2. 特殊前缀与复合来源处理
  if (res.startsWith('Item:')) {
    const itemMatch = res.match(/^Item:(?:\d+:)?(.+)$/);
    if (itemMatch) {
      const fullItemName = itemMatch[1].trim();
      const parts = fullItemName.split(',').map(p => p.trim());
      const translatedParts = parts.map(p => translateWebItemName(p) || translateWebText(p));
      return translatedParts.join('，');
    }
  }
  if (res.startsWith('Tree:') || res.startsWith('Node:')) {
    const nodeMatch = res.match(/^(?:Tree|Node):(\d+)$/);
    if (nodeMatch) return `天赋节点 #${nodeMatch[1]}`;
  }
  if (res.startsWith('Skill:')) {
    const rawSkill = res.replace('Skill:', '').trim();
    return translateKnownTerm(rawSkill) || translateWebText(rawSkill);
  }
  if (res.startsWith('Mastery:')) {
    return `专精: ${translateWebText(res.replace('Mastery:', '').trim())}`;
  }
  if (res.startsWith('Pantheon:')) {
    return `万神殿: ${translateWebText(res.replace('Pantheon:', '').trim())}`;
  }
  if (res.startsWith('Keystone:')) {
    return `核心天赋: ${translateWebText(res.replace('Keystone:', '').trim())}`;
  }
  if (res.startsWith('Ascendancy:')) {
    return `升华天赋: ${translateWebText(res.replace('Ascendancy:', '').trim())}`;
  }
  if (res.startsWith('Bandit:')) {
    return `盗贼加成: ${translateWebText(res.replace('Bandit:', '').trim())}`;
  }
  const cached = formulaTranslationCache.get(line);
  if (cached !== undefined) return cached;

  const result = _doTranslateCalcFormulaLine(line);
  if (formulaTranslationCache.size >= MAX_CACHE_SIZE) {
    const firstKey = formulaTranslationCache.keys().next().value;
    if (firstKey) formulaTranslationCache.delete(firstKey);
  }
  formulaTranslationCache.set(line, result);
  return result;
}

function _doTranslateCalcFormulaLine(line: string): string {
  if (!line) return '';
  let res = line.trim();

  // 1. 【第 1 优先级：官方长句与完整推导整句精准匹配】（绝对保护长句绝不提前流入分词层被撕碎！）
  const directMatch = translateKnownTerm(res);
  if (directMatch) return directMatch;

  // 官方复合长推导模板（含动态参数正则捕获）
  res = res.replace(/The percentage of your max stacks that are applied on average if you are attacking constantly/gi, '在持续攻击状态下，平均能施加的最大层数比例');
  res = res.replace(/This is the average roll of an ailment affecting the enemy if you are constantly attacking/gi, '这是在持续攻击情况下，影响敌人的异常状态的平均伤害期望');
  res = res.replace(/Uses a weighted average formula when stack potential is over 100%/gi, '当堆叠潜力超过 100% 时使用加权平均公式计算');
  res = res.replace(/If hitting constantly,\s*your average strongest ailment currently achieves\s*(.+?)\s*of its max damage/gi, '若持续击中，你平均最强的异常状态目前能达到其最大伤害的 $1');
  res = res.replace(/min combined sources \+ \(max combined sources - min combined sources\) \* average roll/gi, '最小来源总和 + (最大来源总和 - 最小来源总和) * 平均Roll点');
  res = res.replace(/Non-Crit Dmg Derivation:/gi, '非暴击伤害推导:');
  res = res.replace(/Crit Dmg Derivation:/gi, '暴击伤害推导:');
  res = res.replace(/Damage from Non-crits:/gi, '来自非暴击的伤害:');
  res = res.replace(/Damage from Crits:/gi, '来自暴击的伤害:');
  res = res.replace(/Chance on Non-crit:\s*(\d+%?)/gi, '非暴击时几率: $1');
  res = res.replace(/Chance on Crit:\s*(\d+%?)/gi, '暴击时几率: $1');
  res = res.replace(/Total base DPS per (.+?):/gi, (m, p1) => `每 ${translateKnownTerm(p1) || p1} 基础秒伤:`);
  res = res.replace(/Average DPS for all (.+?):/gi, (m, p1) => {
    const rawAil = p1.trim().replace(/s$/i, '');
    const cnAil = translateKnownTerm(rawAil) || translateKnownTerm(p1.trim()) || p1.trim();
    return `全部 ${cnAil} 平均秒伤:`;
  });
  res = res.replace(/Portion of total damage:\s*(\d+%?)/gi, '总伤害占比: $1');
  res = res.replace(/rounded up to nearest server tick/gi, '向上取整至最近的服务器 Tick 周期');
  res = res.replace(/Note: Your hit chance can exceed 100\\nExcess values are shown as \(\+x%\)/gi, '注意：你的命中率可以超过 100%\n超出部分显示为 (+x%)');
  
  // 官方 Buildup 积蓄度与速度推导模版
  res = res.replace(/= ([\d\.]+) casts per second/gi, '= $1 次/秒');
  res = res.replace(/= ([\d\.]+) attacks per second/gi, '= $1 次/秒');
  res = res.replace(/^Crit Min:\s*/gi, '暴击最小: ');
  res = res.replace(/^Crit Max:\s*/gi, '暴击最大: ');
  res = res.replace(/^Crit Avg:\s*/gi, '暴击平均: ');
  res = res.replace(/^Avg:\s*/gi, '平均: ');
  res = res.replace(/^Min:\s*/gi, '最小: ');
  res = res.replace(/^Max:\s*/gi, '最大: ');
  res = res.replace(/Regular Hit (\w+) buildup/gi, (m, p1) => `常规击中 ${translateKnownTerm(p1) || p1} 积蓄`);
  res = res.replace(/Crit (\w+) buildup/gi, (m, p1) => `暴击 ${translateKnownTerm(p1) || p1} 积蓄`);
  res = res.replace(/Average (\w+) buildup/gi, (m, p1) => `平均 ${translateKnownTerm(p1) || p1} 积蓄`);
  res = res.replace(/^More施法速度/gi, '施法速度更多');
  res = res.replace(/^More攻击速度/gi, '攻击速度更多');

  // 2. 【第 2 优先级：括号内官方注释与推导提示整句标准化替换】
  res = res.replace(/NOTE: Having any energy shield when the hit occurs grants 50% chance to avoid stun\.?/gi, '提示：受击时拥有任意能量护盾提供 50% 避免眩晕几率。');
  res = res.replace(/POB only applies this modifier when ES > Total incoming damage\.?/gi, 'PoB 仅在能量护盾大于总受击伤害时应用此修正。');
  res = res.replace(/^Cannot be Stunned$/gi, '无法被眩晕 (免疫眩晕)');
  res = res.replace(/maximum survivable enemy damage/gi, '最大可承受敌人伤害');
  res = res.replace(/enemy attack\/cast time/gi, '敌人攻击/施法间隔');
  res = res.replace(/(\d+(?:\.\d+)?)\s+incoming damage/gi, '承受 $1 敌人伤害');
  res = res.replace(/Total Effective Dot Pool:\s*(\d+)/gi, '持续伤害总有效生命池: $1');
  res = res.replace(/Total Pool:\s*(\d+)/gi, '总有效生命池: $1');
  res = res.replace(/Non-bypassed Energy Shield:\s*(\d+)/gi, '未穿透能量护盾: $1');
  res = res.replace(/Reduction from Armour:\s*([\d\.]+%?)/gi, '来自护甲的减免: $1');
  res = res.replace(/Dot Damage Taken modifier:\s*([\d\.]+)/gi, '承受持续伤害修正: $1');
  res = res.replace(/Final Chaos Damage taken:/gi, '最终承受混沌伤害:');
  res = res.replace(/Final Cold Damage taken:/gi, '最终承受冰霜伤害:');
  res = res.replace(/Final Fire Damage taken:/gi, '最终承受火焰伤害:');
  res = res.replace(/Final Lightning Damage taken:/gi, '最终承受闪电伤害:');
  res = res.replace(/Final Physical Damage taken:/gi, '最终承受物理伤害:');
  res = res.replace(/Such a hit would drain the following resources:/gi, '承受该次击中将消耗以下资源:');
  res = res.replace(/This part of the hit drains the following resources:/gi, '该部分击中消耗以下资源:');
  res = res.replace(/Maximum hit is calculated in reverse -/gi, '最大承受击中伤害采用反向推导计算 -');
  res = res.replace(/from health pools, via damage reductions, to the max hit:/gi, '从生命池经减免推算至最大承受击中:');

  res = res.replace(/\(base presence radius\)/gi, '(基础在场半径)');
  res = res.replace(/\(base surrounded radius\)/gi, '(基础包围判定半径)');
  res = res.replace(/\(effective presence radius\)/gi, '(有效在场范围)');
  res = res.replace(/\(effective surrounded radius\)/gi, '(有效包围判定范围)');
  res = res.replace(/\(square root of presence area modifier\)/gi, '(在场面积修正开方)');
  res = res.replace(/\(square root of surrounded area modifier\)/gi, '(包围面积修正开方)');
  res = res.replace(/\(square root of area of effect modifier\)/gi, '(范围面积修正开方)');
  res = res.replace(/\(base radius\)/gi, '(基础半径)');
  res = res.replace(/\(chance for block to fail\)/gi, '(格挡未触发几率)');
  res = res.replace(/\(block effect\)/gi, '(格挡减伤效果)');
  res = res.replace(/\(of damage taken from an Average hit\)/gi, '(单次均伤承受比例)');
  res = res.replace(/\(of damage from an Average hit\)/gi, '(单次均伤承受比例)');
  res = res.replace(/\(chance for evasion to fail\)/gi, '(闪避未触发几率)');
  res = res.replace(/\(chance to be hit by an Average hit\)/gi, '(被单次均伤击中几率)');
  res = res.replace(/\(Number of mitigated hits\)/gi, '(减免后可承受击数)');
  res = res.replace(/\(Chance to even be hit\)/gi, '(实际受击几率)');
  res = res.replace(/\(chance to even be hit\)/gi, '(实际受击几率)');
  res = res.replace(/\(total average number of hits you can take\)/gi, '(可承受总受击次数)');
  res = res.replace(/\(total incoming damage\)/gi, '(承受敌人总伤害)');
  res = res.replace(/\(total damage you can take\)/gi, '(可承受总伤害量)');
  res = res.replace(/\(total time it would take to die\)/gi, '(存活时间)');
  res = res.replace(/\(effective movement speed modifier\)/gi, '(有效移动速度修正)');
  res = res.replace(/\(movement speed modifier\)/gi, '(移动速度修正)');
  res = res.replace(/\(movement speed penalty\)/gi, '(移动速度惩罚)');
  res = res.replace(/\(movement speed while casting\)/gi, '(施法时移动速度)');
  res = res.replace(/\(movement speed penalty from using skill\)/gi, '(技能移速惩罚)');
  res = res.replace(/\(base from Life\)/gi, '(来自生命的基础值)');
  res = res.replace(/\(base from Tree\)/gi, '(来自天赋的基础值)');
  res = res.replace(/\(base from Item\)/gi, '(来自装备的基础值)');
  res = res.replace(/\(base from items\)/gi, '(来自装备的基础值)');
  res = res.replace(/\(base from Armours\)/gi, '(来自护甲装备的基础值)');
  res = res.replace(/\(Base from Armours\)/gi, '(来自护甲装备的基础值)');
  res = res.replace(/\(Base from Gear\)/gi, '(来自装备的基础值)');
  res = res.replace(/\(Global Base\)/gi, '(全域基础值)');
  res = res.replace(/\(increased threshold\)/gi, '(提高门槛)');
  res = res.replace(/\(stun multiplier\)/gi, '(眩晕倍率)');
  res = res.replace(/\(effective enemy stun damage\)/gi, '(敌人有效眩晕伤害)');
  res = res.replace(/\(stun threshold\)/gi, '(眩晕门槛)');
  res = res.replace(/\(1 - chance to avoid stun\)/gi, '(1 - 避免眩晕几率)');
  res = res.replace(/\(degen\)/gi, '(持续扣血/秒降)');
  res = res.replace(/\(mana cost efficiency\)/gi, '(魔力消耗效率)');
  res = res.replace(/\(used pool\)/gi, '(消耗生命池)');
  res = res.replace(/\(average hit\)/gi, '(单次均伤)');
  res = res.replace(/\(cast rate\)/gi, '(施法速率)');
  res = res.replace(/\(cast speed\)/gi, '(施法速度)');
  res = res.replace(/\(crit chance\)/gi, '(暴击几率)');
  res = res.replace(/\(modifiers to damage taken\)/gi, '(承受伤害修正)');
  res = res.replace(/\(modifiers to enemy damage\)/gi, '(敌人伤害修正)');
  res = res.replace(/\(enemy crit effect\)/gi, '(敌人暴击效果)');
  res = res.replace(/\(level from gem\)/gi, '(来自技能石等级)');
  res = res.replace(/\(level from items\)/gi, '(来自装备等级)');
  res = res.replace(/\(level from corruption\)/gi, '(来自腐化等级)');
  res = res.replace(/\((?:can be changed in|can be overridden in) the Configuration tab\)/gi, '(可在【配置】选项卡修改)');
  res = res.replace(/\(overridden from the Configuration tab\)/gi, '(已在【配置】选项卡修改)');
  res = res.replace(/\(damage gained from other damage types\)/gi, '(来自其他伤害类型的附加伤害)');
  res = res.replace(/\(source damage from non-crits?\)/gi, '(非暴击基础伤害来源)');
  res = res.replace(/\(source damage from crits?\)/gi, '(暴击基础伤害来源)');
  res = res.replace(/\(portion of instances created by non-crits?\)/gi, '(非暴击生成实例占比)');
  res = res.replace(/\(portion of instances created by crits?\)/gi, '(暴击生成实例占比)');
  res = res.replace(/\(portion of instances created by main hand\)/gi, '(主手生成实例占比)');
  res = res.replace(/\(portion of instances created by off hand\)/gi, '(副手生成实例占比)');
  res = res.replace(/\(portion of damage from non-crits?\)/gi, '(非暴击伤害占比)');
  res = res.replace(/\(portion of damage from crits?\)/gi, '(暴击伤害占比)');
  res = res.replace(/\(inflicting as though dealing more damage\)/gi, '(造成伤害时视作造成更多伤害)');
  res = res.replace(/\(ailment deals (\d+%) per second\)/gi, '(异常状态每秒造成 $1)');
  res = res.replace(/\(ailment magnitude effect\)/gi, '(异常状态强度效果)');
  res = res.replace(/\(base damage per second\)/gi, '(基础每秒伤害)');
  res = res.replace(/\(ailment effect modifier\)/gi, '(异常状态效果修正)');
  res = res.replace(/\(rate modifier\)/gi, '(频率修正倍率)');
  res = res.replace(/\(avg ailment stacks\)/gi, '(平均异常状态层数)');
  res = res.replace(/\(delay modifier\)/gi, '(延迟修正倍率)');
  res = res.replace(/\(activation modifier\)/gi, '(激活修正倍率)');
  res = res.replace(/\(Base Timing\)/gi, '(基础时间轴)');
  res = res.replace(/\(effect modifiers?\)/gi, '(效果修正)');
  res = res.replace(/\(Base Revival Time\)/gi, '(基础复活时间)');
  res = res.replace(/\(increased\/reduced cooldown recovery\)/gi, '(冷却回复速度提高/降低)');
  res = res.replace(/\(WarcryMaxHit Override\)/gi, '(战吼最大击中覆盖)');
  res = res.replace(/\(override\)/gi, '(手动覆盖)');
  res = res.replace(/\(base value\)/gi, '(基础数值)');
  res = res.replace(/\(increased\/reduced\)/gi, '(提高/降低加成)');
  res = res.replace(/\(more\/less\)/gi, '(更多/更少乘区)');
  res = res.replace(/\(effective DPS modifier\)/gi, '(有效秒伤修正倍率)');
  res = res.replace(/\(source damage\)/gi, '(基础伤害来源)');
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
  res = res.replace(/\(total damage\)/gi, '(总伤害)');
  res = res.replace(/\(base damage\)/gi, '(基础伤害)');

  // 3. 【第 3 优先级：官方标准属性与前缀批量替换】
  res = res.replace(/Ailment\s+mode:\s*(.+?)(?=\s*\(|$)/gi, (m, p1) => {
    const p1Trim = p1.trim();
    const modeCn = p1Trim.toLowerCase().includes('crit') ? '暴击' : p1Trim.toLowerCase().includes('average') ? '平均伤害' : translateKnownTerm(p1Trim) || p1Trim;
    return `异常计算模式: ${modeCn}`;
  });
  res = res.replace(/Shock\s+mode:\s*(.+?)(?=\s*\(|$)/gi, (m, p1) => {
    const p1Trim = p1.trim();
    const modeCn = p1Trim.toLowerCase().includes('crit') ? '暴击' : p1Trim.toLowerCase().includes('average') ? '平均伤害' : translateKnownTerm(p1Trim) || p1Trim;
    return `感电效果模式: ${modeCn}`;
  });

  res = res.replace(/Regular\s+Hit\s+(Heavy\s*Stun|Freeze|Shock|Ignite|Chill|Bleed|Poison|Electrocute|Pin|Immobilisation)\s+buildup/gi, (m, p1) => `常规击中 ${translateAilmentBuildup(p1)}`);
  res = res.replace(/Crit\s+(Heavy\s*Stun|Freeze|Shock|Ignite|Chill|Bleed|Poison|Electrocute|Pin|Immobilisation)\s+buildup/gi, (m, p1) => `暴击 ${translateAilmentBuildup(p1)}`);
  res = res.replace(/Average\s+(Heavy\s*Stun|Freeze|Shock|Ignite|Chill|Bleed|Poison|Electrocute|Pin|Immobilisation)\s+buildup/gi, (m, p1) => `平均 ${translateAilmentBuildup(p1)}`);

  res = res.replace(/Enemy poise:\s*(\d+)/gi, '敌人韧性值: $1');
  res = res.replace(/Enemy level:\s*(\d+)/gi, '敌人等级: $1');
  res = res.replace(/Enemy resistance:\s*(\d+%?)/gi, '敌人抗性: $1');
  res = res.replace(/Effective DPS modifier:/gi, '有效秒伤修正倍率:');
  res = res.replace(/Effective DoT Multiplier:/gi, '有效持续伤害倍率:');
  res = res.replace(/Effective resistance:/gi, '有效抗性:');
  res = res.replace(/Combined chance:/gi, '综合触发几率:');
  res = res.replace(/Average Roll:/gi, '平均Roll点:');

  // 4. 【第 4 优先级：极速 O(1) Token 最长短语分词哈希匹配（智能 0 空格中文无缝连接）】
  res = translateTokensInText(res);

  // 5. 【第 5 优先级：基础单词与单位收尾】
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
  res = res.replace(/(\d+(?:\.\d+)?)\s*ms\b/gi, '$1 毫秒');
  res = res.replace(/(\d+(?:\.\d+)?)\s*s\b/gi, '$1 秒');
  res = res.replace(/(\d+(?:\.\d+)?)\s*m\b/gi, '$1 米');
  res = res.replace(/\bx\s*(\d+(?:\.\d+)?)/gi, 'x $1');

  return res;
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function asRecord(value: unknown): Record<string, any> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function addTemplate(source: string, translated: string) {
  const newline = source.indexOf('\n');
  if (newline >= 0) {
    const firstLine = source.slice(0, newline);
    const firstLineAnchor = (firstLine.match(/[A-Za-z]{3,}/g) ?? []).sort((left, right) => right.length - left.length)[0]?.toLowerCase();
    if (firstLineAnchor) {
      const wrappedEntries = wrappedTemplateIndex.get(firstLineAnchor) ?? [];
      if (!wrappedEntries.some(entry => entry.source === firstLine)) wrappedEntries.push({ source: firstLine });
      wrappedTemplateIndex.set(firstLineAnchor, wrappedEntries);
    }
  }

  if (!/(?:#|\{\d*\})/.test(source)) return;
  const anchor = (source.match(/[A-Za-z]{3,}/g) ?? []).sort((left, right) => right.length - left.length)[0]?.toLowerCase();
  if (!anchor) return;
  const entries = templateIndex.get(anchor) ?? [];
  if (!entries.some(entry => entry.source === source)) entries.push({ source, translated });
  templateIndex.set(anchor, entries);
}

for (const domain of itemLineDomains) {
  for (const [source, translated] of Object.entries(domainTerms(domain))) addTemplate(source, translated);
}

function compileTemplate(source: string): { expression: RegExp; placeholders: string[] } {
  let expression = '^';
  const placeholders: string[] = [];
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '#') {
      const hasExplicitSign = index > 0 && (source[index - 1] === '+' || source[index - 1] === '-');
      expression += `(${hasExplicitSign ? templateUnsignedNumber : templateNumber})`;
      placeholders.push('#');
      continue;
    }
    const placeholder = source.slice(index).match(/^\{(\d*)\}/);
    if (placeholder) {
      expression += '(.+?)';
      placeholders.push(placeholder[0]);
      index += placeholder[0].length - 1;
    } else {
      expression += escapeRegExp(source[index]);
    }
  }
  return { expression: new RegExp(`${expression}$`, 'i'), placeholders };
}

function applyTemplateTranslation(entry: TemplateEntry, match: RegExpMatchArray): string {
  const numbered = new Map<string, string>();
  const anonymous: string[] = [];
  const numeric: string[] = [];
  for (let index = 0; index < (entry.placeholders?.length ?? 0); index++) {
    const placeholder = entry.placeholders![index];
    const value = translateWebItemLine(match[index + 1] ?? placeholder);
    if (placeholder === '#') numeric.push(value);
    else if (placeholder === '{}') anonymous.push(value);
    else if (!numbered.has(placeholder)) numbered.set(placeholder, value);
  }
  let numericIndex = 0;
  let anonymousIndex = 0;
  return entry.translated.replace(/#|\{(\d*)\}/g, (placeholder) => {
    if (placeholder === '#') return numeric[numericIndex++] ?? placeholder;
    if (placeholder === '{}') return anonymous[anonymousIndex++] ?? anonymous[0] ?? placeholder;
    return numbered.get(placeholder) ?? anonymous[0] ?? placeholder;
  });
}

function translateTemplate(value: string): string | undefined {
  const candidates = new Set<TemplateEntry>();
  for (const word of value.match(/[A-Za-z]{3,}/g) ?? []) {
    for (const entry of templateIndex.get(word.toLowerCase()) ?? []) candidates.add(entry);
  }
  for (const entry of candidates) {
    if (!entry.expression || !entry.placeholders) {
      const compiled = compileTemplate(entry.source);
      entry.expression = compiled.expression;
      entry.placeholders = compiled.placeholders;
    }
    const match = value.match(entry.expression);
    if (!match) continue;
    return applyTemplateTranslation(entry, match);
  }
  return undefined;
}

function cleanItemLine(value: string): string {
  return value
    .replace(/\{(?:corrupted|enchant|rune|tags:[^}]+|variant:[^}]+|range:[^}]+)\}/gi, '')
    .replace(/\(Not supported in PoB yet\)/gi, '')
    .trim();
}

type ItemLinePrefix = {
  label: string;
  content: string;
};

function itemLinePrefix(value: string): ItemLinePrefix | undefined {
  const match = value.match(/^(Runes?|Bonded):\s*([\s\S]+)$/i);
  if (!match) return undefined;
  const source = /^runes?$/i.test(match[1]) ? 'Runes' : match[1];
  return {
    label: translateKnownTerm(source, itemLineDomains) ?? source,
    content: match[2],
  };
}

function knownItemLineTranslation(value: string): string | undefined {
  const cleaned = cleanItemLine(value);
  if (!cleaned) return undefined;
  const content = itemLinePrefix(cleaned)?.content ?? cleaned;
  return translateKnownTerm(content, itemLineDomains) ?? translateTemplate(content);
}

function startsWrappedTemplate(value: string): boolean {
  const content = itemLinePrefix(cleanItemLine(value))?.content ?? cleanItemLine(value);
  for (const word of content.match(/[A-Za-z]{3,}/g) ?? []) {
    for (const entry of wrappedTemplateIndex.get(word.toLowerCase()) ?? []) {
      entry.expression ??= compileTemplate(entry.source).expression;
      if (entry.expression.test(content)) return true;
    }
  }
  return false;
}

function translateComposed(value: string, domains: TranslationDomain[]): string {
  const exact = translateKnownTerm(value, domains);
  if (exact) return exact;

  const matches = [...value.matchAll(/[A-Za-z][A-Za-z0-9'’-]*/g)];
  if (!matches.length) return value;
  let cursor = 0;
  let changed = false;
  let result = '';
  for (let index = 0; index < matches.length;) {
    let replacement: string | undefined;
    let end = index;
    for (let candidateEnd = Math.min(matches.length, index + 8); candidateEnd > index; candidateEnd--) {
      const phrase = matches.slice(index, candidateEnd).map(match => match[0]).join(' ');
      const translated = translateKnownTerm(phrase, domains);
      if (translated) {
        replacement = translated;
        end = candidateEnd - 1;
        break;
      }
    }
    if (!replacement) {
      index++;
      continue;
    }
    const startOffset = matches[index].index ?? 0;
    const endOffset = (matches[end].index ?? 0) + matches[end][0].length;
    const gap = value.slice(cursor, startOffset);
    result += (changed && /^\s+$/.test(gap) ? '' : gap) + replacement;
    cursor = endOffset;
    index = end + 1;
    changed = true;
  }
  return changed ? result + value.slice(cursor) : value;
}

export function translateWebText(value: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return '';
  const translated = translateComposed(value, genericDomains);
  if (translated !== value) return translated;
  return typeof translateCalcFormulaLine === 'function' ? translateCalcFormulaLine(value) : translated;
}

export function translateWebItemName(value: string): string {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  // 1. 精确整句匹配
  const exact = translateKnownTerm(trimmed, itemNameDomains);
  if (exact) return exact;

  // 2. 辅助宝石汇总格式：11 Strength Support Gems / 10 Dexterity Support Gems
  const supportMatch = trimmed.match(/^(\d+)\s+(Strength|Dexterity|Intelligence)\s+Support\s+Gems?$/i);
  if (supportMatch) {
    const num = supportMatch[1];
    const attr = supportMatch[2].toLowerCase();
    const attrCn = attr === 'strength' ? '力量' : attr === 'dexterity' ? '敏捷' : '智慧';
    return `${num} 个${attrCn}辅助宝石`;
  }
  const genericSupportMatch = trimmed.match(/^(\d+)\s+Support\s+Gems?$/i);
  if (genericSupportMatch) {
    return `${genericSupportMatch[1]} 个辅助宝石`;
  }

  // 3. 技能石带等级品质格式：Purity of Lightning 20/0 / Ball Lightning 19/20
  const gemLevelMatch = trimmed.match(/^(.+?)\s+(\d+\/\d+)$/);
  if (gemLevelMatch) {
    const gemName = gemLevelMatch[1].trim();
    const levelQual = gemLevelMatch[2];
    const translatedGem = translateKnownTerm(gemName, itemNameDomains) || translateWebText(gemName);
    return `${translatedGem} ${levelQual}`;
  }

  // 4. 复合装备名称：Svalinn, Runemastered Crucible Tower Shield
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map(p => p.trim());
    const translatedParts = parts.map(p => {
      const trans = translateKnownTerm(p, itemNameDomains) || translateWebText(p);
      return trans || p;
    });
    return translatedParts.join(', ');
  }

  return translateComposed(trimmed, itemNameDomains);
}

export function translateWebItemType(value: string): string {
  return translateKnownTerm(value, itemNameDomains) || translateWebItemName(value);
}

export function translateRuneName(value: string): string {
  return translateWebItemName(value);
}

function translateSubject(value: string): string {
  return translateComposed(value, itemLineDomains);
}

export function translateWebItemLine(value: string): string {
  const cached = itemLineTranslationCache.get(value);
  if (cached !== undefined) return cached;

  const cleaned = cleanItemLine(value);
  if (!cleaned) return '';

  const prefix = itemLinePrefix(cleaned);
  const content = prefix?.content ?? cleaned;
  const exact = translateKnownTerm(content, itemLineDomains);
  const templated = exact ? undefined : translateTemplate(content);
  let translated = exact ?? templated;

  if (prefix) translated = `${prefix.label}：${translated ?? translateSubject(content)}`;

  if (!translated) {
    const sourceMatch = content.match(/^Source:\s*(.+)$/i);
    if (sourceMatch) {
      let sourceBody = sourceMatch[1]
        .replace(/Drops from\s+/i, '掉落自 ')
        .replace(/\s+in\s+/i, '（')
        .replace(/unique\{([^}]+)\}/g, '传奇【$1】')
        .replace(/normal\{([^}]+)\}/g, '【$1】');
      if (sourceBody.includes('（')) sourceBody += '）';
      translated = `来源部位：${translateSubject(sourceBody)}`;
    }
  }

  if (!translated) {
    const limited = content.match(/^Limited to:\s*(\d+)$/i);
    if (limited) translated = `限装备：${limited[1]}`;
  }

  if (!translated) {
    const radius = content.match(/^Radius:\s*(.+)$/i);
    if (radius) translated = `${translateKnownTerm('Radius:', itemLineDomains) ?? '范围：'}${translateSubject(radius[1])}`;
  }

  if (!translated) {
    const allocated = content.match(/^Allocates\s+(.+)$/i);
    if (allocated) translated = `配置天赋：${translateSubject(allocated[1])}`;
  }

  if (!translated) {
    const quality = content.match(/^Quality:\s*([+-]?\d+(?:\.\d+)?)%?$/i);
    if (quality) translated = `品质：+${quality[1]}%`;
  }

  if (!translated) {
    const requirements = content.match(/^Requires\s+(.+)$/i);
    if (requirements) translated = `需求：${translateSubject(requirements[1])}`;
  }

  if (!translated) {
    const addedDamage = content.match(/^Adds\s+([+-]?\d+(?:\.\d+)?)\s+to\s+([+-]?\d+(?:\.\d+)?)\s+(.+)$/i);
    if (addedDamage) translated = `附加 ${addedDamage[1]} 至 ${addedDamage[2]} ${translateSubject(addedDamage[3])}`;
  }

  if (!translated) {
    const extraDamage = content.match(/^Gain\s+([+-]?\d+(?:\.\d+)?%)\s+of\s+Damage\s+as\s+(.+)$/i);
    if (extraDamage) translated = `获得 ${extraDamage[1]} 伤害作为${translateSubject(extraDamage[2])}`;
  }

  if (!translated) {
    const socketedStat = content.match(/^Socketed Skills have\s+([+-]?\d+(?:\.\d+)?%?)\s+to\s+(.+)$/i);
    if (socketedStat) translated = `${translateSubject('Socketed Skills')}的${translateSubject(socketedStat[2])} ${socketedStat[1].startsWith('+') ? '' : '+'}${socketedStat[1]}`;
  }

  if (!translated) {
    const subjectIncrease = content.match(/^(.+?)\s+have\s+(\(?[+-]?\d+(?:\.\d+)?(?:-[+-]?\d+(?:\.\d+)?)?\)?%?)\s+(increased|reduced)\s+(.+)$/i);
    if (subjectIncrease) translated = `${translateSubject(subjectIncrease[1])}的${translateSubject(subjectIncrease[4])}${subjectIncrease[3].toLowerCase() === 'increased' ? '提高' : '降低'} ${subjectIncrease[2]}`;
  }

  if (!translated) {
    const increased = content.match(/^([+-]?\d+(?:\.\d+)?%)\s+(increased|reduced)\s+(.+)$/i);
    if (increased) translated = `${translateSubject(increased[3])}${increased[2].toLowerCase() === 'increased' ? '提高' : '降低'} ${increased[1]}`;
  }

  if (!translated) {
    const maximum = content.match(/^([+-]?\d+(?:\.\d+)?%?)\s+to\s+(maximum\s+)?(.+)$/i);
    if (maximum) translated = `${maximum[1]} ${maximum[2] ? '最大' : ''}${translateSubject(maximum[3])}`;
  }

  if (!translated) {
    const grantedSkill = content.match(/^Grants Skill:\s*Level\s+(\d+)\s+(.+)$/i);
    if (grantedSkill) translated = `获得技能：${grantedSkill[1]} 级${translateSubject(grantedSkill[2])}`;
  }

  if (!translated) {
    const labelValue = content.match(/^([^:]+):\s*(.+)$/);
    if (labelValue) translated = `${translateSubject(labelValue[1])}：${translateSubject(labelValue[2])}`;
  }

  translated ??= translateSubject(content);
  if (itemLineTranslationCache.size >= 4096) itemLineTranslationCache.clear();
  itemLineTranslationCache.set(value, translated);
  return translated;
}

export function localizeWebItemLines(rawLines: string[]): LocalizedWebItemLine[] {
  const result: LocalizedWebItemLine[] = [];
  for (let index = 0; index < rawLines.length; index++) {
    let raw = rawLines[index];
    let end = index;
    if (startsWrappedTemplate(raw)) {
      let candidate = raw;
      const prefix = itemLinePrefix(cleanItemLine(raw));
      for (let next = index + 1; next < Math.min(rawLines.length, index + 4); next++) {
        const continuation = prefix ? itemLinePrefix(cleanItemLine(rawLines[next]))?.content ?? rawLines[next] : rawLines[next];
        candidate = `${candidate}\n${continuation}`;
        if (!knownItemLineTranslation(candidate)) {
          continue;
        }
        raw = candidate;
        end = next;
        break;
      }
    }
    result.push({ raw, translated: translateWebItemLine(raw) });
    index = end;
  }
  return result;
}

export function translateWebItemLines(rawLines: string[]): string[] {
  return localizeWebItemLines(rawLines).map(line => line.translated);
}

export function localizeImportedItem(value: unknown): Record<string, any> {
  const item = asRecord(value);
  if (!item) return value as Record<string, any>;
  const rawLines = Array.isArray(item.rawLines)
    ? item.rawLines.filter((line: unknown): line is string => typeof line === 'string')
    : Array.isArray(item.lines)
      ? item.lines.filter((line: unknown): line is string => typeof line === 'string')
      : [];
  const name = asText(item.name);
  const base = asText(item.base);

  return {
    ...item,
    rawLines,
    lines: Array.isArray(item.lines) ? item.lines : rawLines,
    ...(name ? { name_cn: translateWebItemName(name) } : {}),
    ...(base ? { base_cn: translateWebItemName(base) } : {}),
    lines_cn: translateWebItemLines(rawLines),
  };
}

export function localizeImportedGem(value: unknown): Record<string, any> {
  const gem = asRecord(value);
  if (!gem) return value as Record<string, any>;
  const displayName = asText(gem.name) ?? asText(gem.nameSpec);
  return {
    ...gem,
    ...(displayName ? { name_cn: translateWebItemName(displayName) } : {}),
  };
}

export function localizeImportedSocketGroups(value: unknown): Record<string, any>[] {
  if (!Array.isArray(value)) return [];
  return value.map(group => {
    const source = asRecord(group);
    if (!source) return group as Record<string, any>;
    const label = asText(source.label) ?? asText(source.displayLabel);
    return {
      ...source,
      ...(label ? { label_cn: translateWebItemName(label) } : {}),
      gems: Array.isArray(source.gems) ? source.gems.map(localizeImportedGem) : source.gems,
    };
  });
}

function localizeItemRecord(value: unknown, itemsById: Map<string, Record<string, any>>): Record<string, any> {
  const item = asRecord(value);
  if (!item) return value as Record<string, any>;
  const key = item.id === undefined || item.id === null ? undefined : String(item.id);
  return key && itemsById.has(key) ? itemsById.get(key)! : localizeImportedItem(item);
}

export function localizeImportedBuild(value: Record<string, unknown>): Record<string, any> {
  const itemLibrary = Array.isArray(value.itemLibrary) ? value.itemLibrary.map(localizeImportedItem) : [];
  const itemsById = new Map(itemLibrary
    .filter(item => item.id !== undefined && item.id !== null)
    .map(item => [String(item.id), item]));
  const localizeItemMap = (items: unknown) => {
    const source = asRecord(items);
    if (!source) return items;
    return Object.fromEntries(Object.entries(source).map(([key, item]) => [key, localizeItemRecord(item, itemsById)]));
  };

  return {
    ...value,
    itemLibrary,
    equippedItems: localizeItemMap(value.equippedItems),
    socketedJewels: localizeItemMap(value.socketedJewels),
    socketGroups: localizeImportedSocketGroups(value.socketGroups),
  };
}

export function translateVariantName(name: string): string {
  if (!name) return '';
  const trimmed = name.trim();
  const direct = translateKnownTerm(trimmed) || translateWebText(trimmed);
  if (direct && direct !== trimmed) return direct;

  const preMatch = trimmed.match(/^Pre\s+(\d+\.\d+\.\d+[a-zA-Z]?\.?)$/i);
  if (preMatch) {
    return `历史版本 (${preMatch[1].replace(/\.$/, '')} 补丁前)`;
  }

  if (/^Current$/i.test(trimmed)) {
    return '当前最新版 (0.5 赛季)';
  }

  return translateWebItemLine(trimmed);
}
