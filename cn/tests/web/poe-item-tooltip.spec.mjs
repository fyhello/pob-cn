import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = relative => readFile(new URL(relative, import.meta.url), 'utf8');
const modulePath = new URL('../../web/src/utils/webTranslation.ts', import.meta.url);
const testRequire = createRequire(import.meta.url);
const moduleRequire = createRequire(modulePath);
const ts = testRequire('typescript');

async function loadLocalizer() {
  const sourceText = await readFile(modulePath, 'utf8');
  const javascript = ts.transpileModule(sourceText, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(javascript, { exports: module.exports, module, require: moduleRequire });
  return module.exports;
}

test('item tooltip renders the official structured tooltip projection through the shared translator', async () => {
  const tooltip = await source('../../web/src/components/PoEItemTooltip.vue');

  assert.match(tooltip, /const header = item\?\.tooltip\?\.header/);
  assert.match(tooltip, /Array\.isArray\(item\?\.tooltip\?\.bodyLines\)/);
  assert.match(tooltip, /item\.tooltip\.bodyLines\.filter/);
  assert.match(tooltip, /\.map\(\(line(?:: string)?\) => translateWebItemLine\(line\)\)/);
  assert.match(tooltip, /v-for="\(line, index\) in parsed\.bodyLines"/);
  assert.match(tooltip, /function officialTooltipTitle\(item: any, title: unknown\): string/);
  assert.match(tooltip, /headerTitle: officialTooltipTitle\(item, header\?\.title\)/);
  assert.match(tooltip, /headerBase: typeof header\?\.base === 'string' \? translateWebItemLine\(header\.base\) : ''/);
  assert.match(tooltip, /暂无官方物品显示数据/);
  assert.match(tooltip, /translateWebItemLine/);

  // Canonical raw text, legacy display rows, and hand-built stat parsing are
  // not a hover-tooltip display API.
  assert.doesNotMatch(tooltip, /item\.(?:raw|rawLines|lines|displayLines)\b/);
  assert.doesNotMatch(tooltip, /localizeWebItemLines/);
  assert.doesNotMatch(tooltip, /parseInt|parseFloat|Number\(/);
  assert.doesNotMatch(tooltip, /(?:Quality|Sockets|Armour|Evasion|EnergyShield|LevelReq).*?match\(/s);
});

test('item tooltip rarity comes only from the official item projection', async () => {
  const tooltip = await source('../../web/src/components/PoEItemTooltip.vue');

  assert.match(tooltip, /typeof item\.rarity === 'string' && item\.rarity/);
  assert.match(tooltip, /: 'NORMAL'/);
  assert.doesNotMatch(tooltip, /item\.(?:raw|rawLines|lines|displayLines)\b/);
  assert.doesNotMatch(tooltip, /item\.name[^\n]*match\(/);
});

test('official tooltip runtime text and dynamic values are covered by the generated dictionary', async () => {
  const translations = JSON.parse(await source('../../generated/web-data/translations.json'));
  const tooltipTerms = [
    ['Tip: Hold Shift to display a tooltip for the granted skill.', '提示：按住 Shift 可显示所授予技能的提示信息。'],
    ['Tip: Hold Shift to display a tooltip for the granted skills.', '提示：按住 Shift 可显示所授予技能的提示信息。'],
    ['Tip: Shift to display a tooltip for the granted Skill.', '提示：按住 Shift 可显示所授予技能的提示信息。'],
    ['Tip: Press Ctrl+D to disable the display of stat differences.', '提示：按 Ctrl+D 可关闭属性差异显示。'],
    ['Equipping this item in {1} will give you:', '装备此物品至{1}将获得：'],
    ['Equipping This Item in {1} will give you:', '装备此物品至{1}将获得：'],
    ['Intelligence Required', '智慧需求'],
    ['+# Intelligence Required', '需要 +# 智慧'],
  ];
  const domains = ['items', 'stats', 'tooltip', 'ui', 'terms'];

  for (const [value, expected] of tooltipTerms) {
    const translated = domains.map(domain => translations[domain]?.[value]).find(Boolean);
    assert.equal(translated, expected, `official tooltip value ${value} must resolve through translations.json`);
  }
});

test('official comparison rows keep PoB numeric formatting while translating dynamic labels and headers', async () => {
  const { translateWebItemLine } = await loadLocalizer();
  assert.equal(translateWebItemLine('+1,234.5 Average Hit (+12.3%)'), '+1,234.5 平均击中（+12.3%）');
  assert.equal(translateWebItemLine('+1,234.56 Hit Rate (+12.3%)'), '+1,234.56 击中率（+12.3%）');
  assert.equal(translateWebItemLine('+123 Crit Multiplier (+4.0%)'), '+123 暴击伤害倍率（+4.0%）');
  assert.equal(translateWebItemLine('+12,345.6 Hit DPS (+7.8%)'), '+12,345.6 击中秒伤（+7.8%）');
  assert.equal(translateWebItemLine('+98,765.4 Total DPS inc. DoT (+6.5%)'), '+98,765.4 包含持续伤害的总秒伤（+6.5%）');
  assert.equal(translateWebItemLine('+123 Mana Cost (-4.0%)'), '+123 魔力消耗（-4.0%）');
  assert.equal(translateWebItemLine('+1.25 Mana per second (+2.5%)'), '+1.25 每秒魔力（+2.5%）');
  assert.equal(translateWebItemLine('+1.25 Mana Cost per second (+2.5%)'), '+1.25 每秒魔力消耗（+2.5%）');
  assert.equal(translateWebItemLine('Equipping this item in Amulet will give you:\n(replacing Foo)'), '装备此物品至项链将获得：\n（替换Foo）');
  assert.equal(translateWebItemLine('Equipping This Item in Amulet will give you:\n(replacing Foo)'), '装备此物品至项链将获得：\n（替换Foo）');
});

test('custom item titles stay verbatim while ordinary official headers remain translatable', async () => {
  const tooltip = await source('../../web/src/components/PoEItemTooltip.vue');
  const studio = await source('../../web/src/components/ItemCraftingStudio.vue');

  assert.match(tooltip, /if \(item\?\.rarity === 'RARE' && item\?\.crafted === true && typeof item\?\.title === 'string' && item\.title\.length > 0\) return item\.title;/);
  assert.match(studio, /function officialTooltipTitle\(item: any\): string/);
  assert.match(studio, /if \(item\?\.rarity === 'RARE' && item\?\.crafted === true && typeof item\?\.title === 'string' && item\.title\.length > 0\) return item\.title;/);
});
