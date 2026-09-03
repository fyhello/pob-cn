import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const modulePath = new URL('../../web/src/utils/webTranslation.ts', import.meta.url);
const testRequire = createRequire(import.meta.url);
const moduleRequire = createRequire(modulePath);
const ts = testRequire('typescript');

async function loadLocalizer() {
  const source = await readFile(modulePath, 'utf8');
  const javascript = ts.transpileModule(source, {
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

test('real PoB import projection localizes names, gems, and generated numeric item lines', async () => {
  const { localizeImportedBuild, translateWebItemLine, translateWebItemLines, translateWebItemName } = await loadLocalizer();
  const imported = localizeImportedBuild({
    itemLibrary: [{
      id: 17,
      name: 'Svalinn',
      base: 'Runemastered Crucible Tower Shield',
      rawLines: ['Svalinn', 'Runemastered Crucible Tower Shield', '60% increased Runic Ward'],
    }],
    equippedItems: {
      'Weapon 2': { id: 17, name: 'Svalinn', base: 'Runemastered Crucible Tower Shield' },
    },
    socketGroups: [{
      gems: [{ name: 'Cast on Elemental Ailment', nameSpec: 'Cast on Elemental Ailment', level: 20 }],
    }],
  });

  const item = imported.itemLibrary[0];
  assert.equal(item.name, 'Svalinn');
  assert.equal(item.name_cn, '斯瓦林');
  assert.equal(item.base, 'Runemastered Crucible Tower Shield');
  assert.equal(item.base_cn, '符文师匠熔铸塔盾');
  assert.equal(item.lines_cn[2], '符文结界提高 60%');
  assert.equal(imported.equippedItems['Weapon 2'].name_cn, '斯瓦林');

  const gem = imported.socketGroups[0].gems[0];
  assert.equal(gem.name, 'Cast on Elemental Ailment');
  assert.equal(gem.nameSpec, 'Cast on Elemental Ailment');
  assert.equal(gem.name_cn, '元素异常状态时施放');
  assert.match(translateWebItemLine('Adds 12 to 24 Fire Damage'), /12.*24.*火焰/);
  assert.match(translateWebItemLine('Gain 18% of Damage as Extra Fire Damage'), /18%.*火焰/);
  assert.match(translateWebItemLine('Socketed Skills have +12% to Critical Strike Multiplier'), /暴击.*12%/);
  assert.match(translateWebItemLine('60% increased Runic Ward'), /符文结界.*60%/);
  assert.equal(translateWebItemLine('Tempest Bells are destroyed after an additional (4-5) Hits'), '风雷钟在受到 (4-5) 次额外击中后被摧毁');
  assert.equal(translateWebItemLine('(39-47)% increased Cast Speed'), '施法速度提高 (39-47)%');
  assert.equal(translateWebItemLine('Rune: 36% chance when collecting an Elemental Infusion to gain an additional Elemental Infusion of the same type'), '符文：收集元素灌注时有 36% 的几率 额外获得一个同类型的元素灌注');
  assert.equal(translateWebItemLine('Rune: +3% to all maximum Elemental Resistances while on full Runic Ward'), '符文：符文结界全满时，所有元素抗性上限 +3%');
  assert.equal(translateWebItemLine('Rune: Archon recovery period expires 90% faster'), '符文：执政官间隔期的消减速度加快 90%');
  assert.deepEqual([...translateWebItemLines([
    '{enchant}{rune}Bonded: 36% chance when collecting an Elemental Infusion to gain an',
    '{enchant}{rune}Bonded: additional Elemental Infusion of the same type',
    '{enchant}{rune}Bonded: +3% to all Maximum Elemental Resistances while on full Runic Ward',
    '{enchant}{rune}Bonded: Archon recovery period expires 90% faster',
    '{enchant}{rune}Bonded: Break Armour on Critical Hit with Spells equal to 36% of Physical Damage dealt',
    '{enchant}{rune}Bonded: Leeches 3% of maximum Life when you Cast a Spell',
  ])], [
    '羁绊：收集元素灌注时有 36% 的几率\n额外获得一个同类型的元素灌注',
    '羁绊：符文结界全满时，所有元素抗性上限 +3%',
    '羁绊：执政官间隔期的消减速度加快 90%',
    '羁绊：法术暴击会粉碎护甲，相当于造成物理伤害的 36%',
    '羁绊：当你施放法术时，获得生命上限 3% 的生命偷取',
  ]);
  assert.deepEqual([...translateWebItemLines([
    'Radius: Small',
    'Limited to: 1',
    'Passives in Radius of Chaos Inoculation can be Allocated',
    'without being connected to your tree',
    'Radius: Very Large',
    'Notable Passive Skills in Radius also grant 6% increased Critical Hit Chance',
    'Notable Passive Skills in Radius also grant 6% increased Critical Hit Chance for Spells',
    'Notable Passive Skills in Radius also grant 8% increased Magnitude of Damaging Ailments you inflict with Critical Hits',
  ])], [
    '范围：小',
    '限装备：1',
    '异灵之体范围内的天赋可以在\n未连结至天赋树的情况下配置',
    '范围：极大',
    '范围内的核心天赋同时提供 暴击率提高 6%',
    '范围内的核心天赋同时提供 法术暴击率提高 6%',
    '范围内的核心天赋同时提供 你的暴击造成的伤害性异常状态强度提高 8%',
  ]);
  assert.equal(translateWebItemName('Rune Mitts'), '奇术护手');
  assert.equal(translateWebItemName('Absent Amulet'), '失神项链');
  assert.equal(translateWebItemName('Cast on Block, Ball Lightning'), '格挡时施放, 天雷之珠');
  assert.equal(translateWebItemLine('Unknown Experimental Affix'), '未知 Experimental Affix');
});
