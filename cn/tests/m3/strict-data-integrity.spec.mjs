import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const repoRoot = new URL('../../..', import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '');

test('Strict Data Integrity: CalcsPanel.vue contains zero fake math formulas and zero mock numbers', async () => {
  const panelPath = join(repoRoot, 'cn', 'web', 'src', 'components', 'CalcsPanel.vue');
  const content = await readFile(panelPath, 'utf8');

  // 断言 1：严禁包含任何历史遗留的假常数 mock
  assert.equal(/inc:\s*113/.test(content), false, 'CalcsPanel.vue must NOT contain hardcoded inc: 113');
  assert.equal(/more:\s*1\.0,\s*effMult:\s*0\.5/.test(content), false, 'CalcsPanel.vue must NOT contain hardcoded mock element properties');

  // 断言 2：严禁包含自编的伪连乘公式栏 (Base * Inc * More * Crit)
  assert.equal(/基础点伤均值.*提高加成.*更多乘区.*暴击期望倍率/.test(content), false, 'CalcsPanel.vue must NOT contain fabricated multi-tier multiplication banner');

  // 断言 3：视口安全盒模型与 popoverMaxHeight 必须存在
  assert.ok(content.includes('popoverMaxHeight'), 'CalcsPanel.vue must enforce popoverMaxHeight viewport clamp');
});

test('Strict Data Integrity: calculation adapter compatibility projection is a passthrough', async () => {
  const adapterPath = join(repoRoot, 'cn', 'lua', 'real-calc-adapter.lua');
  const content = await readFile(adapterPath, 'utf8');
  const start = content.indexOf('local function projectDpsPipeline');
  const end = content.indexOf('local function projectConfig', start);
  assert.ok(start >= 0 && end > start, 'adapter calculation projection boundaries must exist');
  const projection = content.slice(start, end);
  assert.doesNotMatch(projection, /:(?:Sum|More|Combine)\(/, 'calculation projection must not derive values through ModStore');
  assert.doesNotMatch(projection, /or\s+(?:150|100|4\.0|1\.0)/, 'calculation projection must not insert non-zero defaults');
  assert.doesNotMatch(projection, /提高伤害倍率|更多伤害乘区|基础范围|基础在场半径/, 'calculation projection must not invent breakdown text');
  assert.match(projection, /combinedDPS\s*=\s*out\.CombinedDPS/, 'Combined DPS must remain a direct official output field');
  assert.match(projection, /manaCostPerSecond\s*=\s*out\.ManaCostPerSecond/, 'mana cost per second must remain a direct official output field');
});

test('Strict Data Integrity: source projection does not invent a modifier type', async () => {
  const adapterPath = join(repoRoot, 'cn', 'lua', 'real-calc-adapter.lua');
  const content = await readFile(adapterPath, 'utf8');
  const start = content.indexOf('local function projectModSources');
  const end = content.indexOf('local function projectDpsPipeline', start);
  assert.ok(start >= 0 && end > start, 'source projection boundaries must exist');
  const projection = content.slice(start, end);
  assert.doesNotMatch(projection, /stringValue\(mod\.type,\s*"BASE"\)/, 'a missing official modifier type must remain absent');
});

test('Strict Data Integrity: presentation never substitutes a different stat or an invented non-zero value', async () => {
  const [calcs, defences, sideStats, store] = await Promise.all([
    readFile(join(repoRoot, 'cn', 'web', 'src', 'components', 'CalcsPanel.vue'), 'utf8'),
    readFile(join(repoRoot, 'cn', 'web', 'src', 'components', 'DefencesPanel.vue'), 'utf8'),
    readFile(join(repoRoot, 'cn', 'web', 'src', 'components', 'SideStats.vue'), 'utf8'),
    readFile(join(repoRoot, 'cn', 'web', 'src', 'stores', 'buildStore.ts'), 'utf8'),
  ]);

  assert.doesNotMatch(defences, /\|\|\s*(?:965|386|4246|2124\.93|1)(?!\d|\.)/, 'defence values must not use non-zero numeric fallbacks');
  assert.doesNotMatch(defences, /EffectiveMovementSpeedMod\s*\|\|\s*output\.MovementSpeedMod/, 'effective movement speed must never fall back to base movement speed');
  assert.doesNotMatch(defences, /PhysicalDotEHP\s*\|\|\s*output\.PhysicalTotalHitPool/, 'dot EHP must never fall back to a hit pool');
  assert.doesNotMatch(defences, /EffectiveBlockChance\s*\|\|\s*output\.BlockChance/, 'effective block must never fall back to base block');
  assert.doesNotMatch(defences, /totalEnemyDamageIn\s*\|\|\s*output\.totalEnemyDamage/, 'incoming damage must never fall back to a different total');
  assert.doesNotMatch(defences, /(?:PhysicalDamageReduction|(?:Fire|Cold|Lightning|Chaos)ResistOverCap|AttackDodgeChance|SpellDodgeChance|DeflectChance)\s*\|\|\s*0/, 'absent defence fields must not be rendered as zero');
  assert.doesNotMatch(defences, /sources\.length\s*:\s*1|游戏底层默认基准设定|机制基础/, 'defence sources must only render rows returned by PoB Tabulate');
  assert.doesNotMatch(defences, /function\s+(?:getSourceTypeLabel|getModStatLabel|formatOfficialSourceValue)\s*\(/, 'defence sources must not contain a private translator or value interpreter');
  assert.doesNotMatch(defences, /\.slice\(0,\s*3\)/, 'defence source lines must not be truncated');
  assert.match(defences, /translateSourceType/, 'defence source types must use the shared dictionary translator');
  assert.doesNotMatch(defences, /return\s+(?:80|30);/, 'range display must not invent a radius when the official value is absent');
  assert.doesNotMatch(sideStats, /\|\|\s*100\b/, 'side statistics must not use a 100% fallback');
  assert.doesNotMatch(calcs, /hitDPS:\s*pipe\?\.hitDPS\s*\?\?\s*stats\?\.HitDPS\s*\?\?\s*stats\?\.TotalDPS/, 'hit DPS must not fall back to total DPS');
  assert.doesNotMatch(calcs, /Enemy(?:Fire|Cold|Lightning|Chaos)Resist\s*\?\?\s*stats\?\.(?:Fire|Cold|Lightning|Chaos)Resist/, 'enemy resistance must not fall back to player resistance');
  assert.doesNotMatch(store, /this\.stats\s*=\s*\{\s*\.\.\.this\.stats\s*,\s*\.\.\.nextOutput\s*\}/, 'a newer official output must replace, not merge with, prior statistics');
});

test('Strict Data Integrity: GEMINI.md exists in root with 5 strict rules', async () => {
  const geminiPath = join(repoRoot, 'GEMINI.md');
  const content = await readFile(geminiPath, 'utf8');
  assert.ok(content.includes('绝对零前端运算'), 'GEMINI.md must contain rule 1');
  assert.ok(content.includes('绝对零假数据/常数兜底'), 'GEMINI.md must contain rule 2');
  assert.ok(content.includes('Lua 适配层 100% 纯透传契约'), 'GEMINI.md must contain rule 3');
});
