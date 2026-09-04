import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('Strict Single Dictionary Gate: Only one unified translations.json allowed and zero inline dictionaries', async (t) => {
  // 1. Verify single source of truth dictionary exists
  const transPath = 'cn/generated/web-data/translations.json';
  const transContent = readFileSync(transPath, 'utf8');
  const trans = JSON.parse(transContent);

  assert.ok(trans.schema_version, 'translations.json must have schema_version');
  assert.ok(trans.items && Object.keys(trans.items).length > 5000, 'translations.json must have full items');
  assert.ok(trans.terms && Object.keys(trans.terms).length > 5000, 'translations.json must have full terms');
  assert.ok(trans.ui && Object.keys(trans.ui).length > 0, 'translations.json must have ui domain');
  const luaLoader = readFileSync('cn/lua/i18n/loader.lua', 'utf8');
  assert.match(luaLoader, /generated\/web-data\/translations\.json/, 'Lua i18n must load the unified JSON dictionary');
  assert.doesNotMatch(luaLoader, /translations\.lua/, 'Lua i18n must not load a generated Lua dictionary');
  assert.equal(existsSync('cn/generated/lua-i18n/translations.lua'), false, 'generated Lua dictionary must not be maintained');
  const calcPanel = readFileSync('cn/web/src/components/CalcsPanel.vue', 'utf8');
  assert.match(calcPanel, /translateSourceType\s*\}/, 'calculation sources must use the shared source-type translator');
  assert.doesNotMatch(calcPanel, /function\s+translateSourceType\s*\(/, 'source-type translations must not be hardcoded in the calculation panel');
  const nodeTypeLabel = calcPanel.match(/function\s+getNodeTypeLabel\([\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(nodeTypeLabel, /translateWebText\(source\)/, 'node type labels must use the shared dictionary translator');
  assert.doesNotMatch(nodeTypeLabel, /switch\s*\(/, 'node type labels must not use a hardcoded translation switch');

  // 2. Strict Terminology checks
  // Sapphire MUST be '蓝宝石' and NEVER '蓝玉'
  assert.equal(trans.terms['Sapphire'], '蓝宝石', 'Sapphire must translate to 蓝宝石');
  assert.equal(trans.terms['Jewel Socket'], '珠宝插槽', 'Jewel Socket must translate to 珠宝插槽');
  assert.equal(trans.terms['Heartbreaking'], '心悸', 'Heartbreaking must translate to 心悸');
  assert.equal(trans.terms['Critical Strike Multiplier'], '暴击伤害倍率', 'Critical Strike Multiplier must translate to 暴击伤害倍率');
  assert.equal(trans.terms.BASE, '基础', 'BASE must translate through the unified dictionary');
  assert.equal(trans.terms.INC, '提高', 'INC must translate through the unified dictionary');
  assert.equal(trans.terms.MORE, '总增', 'MORE must translate through the unified dictionary');

  const expectedDefenceTerms = {
    'Damage Avoidance': '伤害避免',
    'Other Defences': '其他防御',
    'Other Avoidance': '其他规避',
    'Stun Duration': '晕眩持续时间',
    'Other Ailment Defences': '其他异常状态防御',
    'Damaging Hits': '伤害性击中',
    'Maximum Hit Taken': '最大承受击中',
    'Effective "Health" Pool': '有效生命池',
    'Enemy Degens': '敌方持续伤害',
    'Recoup and Hit Taken Over Time': '伤害吸纳与击中伤害延时结算',
    'Dots and Build Degens': '持续伤害与构筑自损',
    'Skill types': '技能类型',
    'Notes': '备注',
    'Source Name': '来源名称',
  };
  for (const [key, value] of Object.entries(expectedDefenceTerms)) {
    assert.equal(trans.terms[key], value, `terms domain must contain official defence UI term ${key}: ${value}`);
  }

  // 槽位
  const expectedSlots = {
    'Weapon 1': '主手武器',
    'Weapon 2': '副手/盾牌',
    'Helmet': '头盔',
    'Body Armour': '胸甲',
    'Gloves': '手套',
    'Boots': '鞋子',
    'Amulet': '项链',
    'Ring 1': '左戒',
    'Ring 2': '右戒',
    'Belt': '腰带',
  };
  for (const [k, v] of Object.entries(expectedSlots)) {
    assert.equal(trans.terms[k], v, `terms domain must contain slot ${k}: ${v}`);
    assert.equal(trans.ui[k], v, `ui domain must contain slot ${k}: ${v}`);
  }

  // 装备类别与别名
  const expectedCategories = {
    'One Hand Axe': '单手斧',
    'One Hand Axes': '单手斧',
    'One Hand Mace': '单手锤',
    'One Hand Maces': '单手锤',
    'One Hand Sword': '单手剑',
    'One Hand Swords': '单手剑',
    'Two Hand Axe': '双手斧',
    'Two Hand Axes': '双手斧',
    'Two Hand Mace': '双手锤',
    'Two Hand Maces': '双手锤',
    'Two Hand Sword': '双手剑',
    'Two Hand Swords': '双手剑',
    'Warstaff': '战杖',
    'Warstaves': '战杖',
    'TrapTool': '陷阱工具',
    'Trap Tool': '陷阱工具',
  };
  for (const [k, v] of Object.entries(expectedCategories)) {
    assert.equal(trans.terms[k], v, `terms domain must contain category ${k}: ${v}`);
    assert.equal(trans.items[k], v, `items domain must contain category ${k}: ${v}`);
  }

  // 异常状态与积蓄
  const expectedAilments = {
    'Freeze': '冻结',
    'Freeze Buildup': '冻结积蓄',
    'Shock': '感电',
    'Shock Buildup': '感电积蓄',
    'Ignite': '点燃',
    'Ignite Buildup': '点燃积蓄',
    'Chill': '冰缓',
    'Chill Buildup': '冰缓积蓄',
    'Bleed': '流血',
    'Bleed Buildup': '流血积蓄',
    'Poison': '中毒',
    'Poison Buildup': '中毒积蓄',
    'Heavy Stun': '强力眩晕',
    'Heavy Stun Buildup': '眩晕积蓄',
    'Electrocute': '电击',
    'Electrocute Buildup': '电击积蓄',
    'Pin': '钉刺',
    'Pin Buildup': '钉刺积蓄',
    'Immobilisation': '定身',
    'Immobilisation Buildup': '定身积蓄',
  };
  for (const [k, v] of Object.entries(expectedAilments)) {
    assert.equal(trans.terms[k], v, `terms domain must contain ailment ${k}: ${v}`);
  }

  // 催化剂名称（双向全称与简称）
  const expectedCatalysts = {
    'Flesh': '生命',
    'Flesh Catalyst': '生命催化剂',
    'Neural': '魔力',
    'Neural Catalyst': '魔力催化剂',
    'Carapace': '防御',
    'Carapace Catalyst': '防御催化剂',
    'Uul-Netol': '物理',
    'UulNetol': '物理',
    'Uul-Netol Catalyst': '物理催化剂',
    'Xoph': '火焰',
    'Xoph Catalyst': '火焰催化剂',
    'Tul': '冰霜',
    'Tul Catalyst': '冰霜催化剂',
    'Esh': '闪电',
    'Esh Catalyst': '闪电催化剂',
    'Chayula': '混沌',
    'Chayula Catalyst': '混沌催化剂',
    'Reaver': '攻击',
    'Reaver Catalyst': '攻击催化剂',
    'Sibilant': '施法',
    'Sibilant Catalyst': '施法催化剂',
    'Skittering': '速度',
    'Skittering Catalyst': '速度催化剂',
    'Adaptive': '全属性',
    'Adaptive Catalyst': '全属性催化剂',
    'Necrotic': '召唤',
    'Necrotic Catalyst': '召唤催化剂',
  };
  for (const [k, v] of Object.entries(expectedCatalysts)) {
    assert.equal(trans.terms[k], v, `terms domain must contain catalyst ${k}: ${v}`);
  }

  // 3. Scan all web source files for forbidden private dictionary definitions
  function scanDir(dir) {
    const files = [];
    for (const item of readdirSync(dir)) {
      const full = join(dir, item);
      if (item === 'node_modules' || item === 'dist' || item === '.git') continue;
      const st = statSync(full);
      if (st.isDirectory()) {
        files.push(...scanDir(full));
      } else if (/\.(vue|ts|js)$/.test(item) && !item.endsWith('.d.ts')) {
        files.push(full);
      }
    }
    return files;
  }

  const srcFiles = scanDir('cn/web/src');
  const forbiddenPatterns = [
    /CALC_TERMS_DICT\s*[:=]/,
    /GEM_NAME_MAPPINGS\s*[:=]/,
    /CALC_EXACT_PHRASES\s*[:=]/,
    /const\s+[A-Z0-9_]+_DICT\s*[:=]/,
    /const\s+[A-Z0-9_]+_MAPPINGS\s*[:=]/,
    /const\s+itemTypeDictionaryAliases\b/,
    /const\s+slotNames\b\s*[:=]/,
  ];

  for (const file of srcFiles) {
    const content = readFileSync(file, 'utf8');
    for (const pattern of forbiddenPatterns) {
      assert.ok(
        !pattern.test(content),
        `Violation of GEMINI.md Rule 6: Private inline dictionary detected in ${file} matching ${pattern}`
      );
    }
  }
});
