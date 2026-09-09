import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import * as filesystem from 'node:fs/promises';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { readDatStrings, pairTableTexts, parseCsd } from '../../pipeline/lib/game-text.mjs';
import { compileNativeTranslations, auditTranslationCoverage, auditTranslationRegressions } from '../../pipeline/lib/native-translations.mjs';
import { reviewTranslationCandidate, acceptTranslationCandidate } from '../../pipeline/update-translations.mjs';
import { createTranslationRuntime } from '../../shared/translation-runtime.mjs';
import { writeFileTransaction } from '../../pipeline/lib/file-transaction.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const encode = value => Buffer.from(JSON.stringify(value));
const reviewed = () => ({ schema_version: 1, entries: [], rules: [], aliases: [] });
const text = (locale, id, en, translated) => ({ table: 'BaseItemTypes', field: 'Name', element: 0, row: 0, locale, id, en, translated });
function inputs() {
  const game = { schema_version: 1, upstream_commit: 'a'.repeat(40), texts: [text('zh-CN', 'wand', 'Dueling Wand', '决斗法杖'), text('zh-TW', 'wand', 'Dueling Wand', '單挑法杖')], stats: [] };
  const core = { schema_version: 1, upstream_commit: game.upstream_commit, rows: [], stats: [], deferred: [] };
  return { game, core, reviewed: reviewed() };
}
function statInputs() {
  const source = inputs();
  const english = 'Gain {0:+d} Life and {1}% Mana';
  source.core.stats = [{ file: 'stat.lua', index: 1, form: 1, stats: ['life', 'mana'], description: { text: english, limit: [['#', '#'], ['#', '#']] } }];
  source.game.stats = [{ locale: 'zh-CN', path: 'stat.csd', line: 1, stats: ['life', 'mana'], english: [{ text: english, limits: ['#', '#'], flags: [], special: '', line: 2 }], translated: [{ text: '获得 {1}% 魔力和 {0:+d} 生命', limits: ['#', '#'], flags: [], special: '', line: 4 }] }];
  return source;
}
const compile = input => compileNativeTranslations(input.game, input.core, input.reviewed);

test('单属性匿名格式锁定到参数零，数值与单位变换不由前端执行', () => {
  const source = statInputs(), raw = '{:+d} metres to Strike Range';
  source.core.stats[0].stats = ['range'];
  source.core.stats[0].description = { text: raw, limit: [['#', '#']], 1: { k: 'divide_by_ten', v: 1 } };
  const form = source.game.stats[0];
  form.path = 'data/statdescriptions/stat_descriptions.csd';
  form.stats = ['range'];
  form.english = [{ text: raw, limits: ['#'], flags: [], special: 'divide_by_ten 1', line: 1 }];
  form.translated = [{ ...form.english[0], text: '打击范围 {:+d} 米' }];
  const compiled = compile(source), runtime = createTranslationRuntime(compiled.packages['zh-CN']);
  assert.equal(runtime.translate('+0.4 metres to Strike Range', { scope: 'item-display' }), '打击范围 +0.4 米');
  assert.equal(runtime.translate('+(0.2-0.5) metres to Strike Range', { scope: 'item-display' }), '打击范围 +(0.2-0.5) 米');
  assert.equal(runtime.translate('+0.4 metres to Strike Range'), '+0.4 metres to Strike Range');
  form.translated[0].special = 'divide_by_one_hundred 1';
  assert.deepEqual(compile(source).packages['zh-CN'].stats, {});
  form.translated[0].special = 'divide_by_ten 1';
  form.stats.push('other'); source.core.stats[0].stats = [...form.stats];
  assert.ok(compile(source).report.rejectedTemplates.some(row => row.reason === 'ambiguous-implicit-parameter'));
});

test('实际预览覆盖使用整段与支持状态边界，存量缺口保留物品和原文证据', () => {
  const source = inputs();
  source.reviewed.entries = [{ locale: 'zh-CN', context: 'item-display', source: 'First line\nSecond line', translated: '完整词缀', evidence: { kind: 'test' } }];
  const context = { scope: 'item-display', item: { title: 'Unique', base: 'Base', rarity: 'UNIQUE' } };
  source.core.rows = ['First line', 'Second line', 'Unresolved text'].map((text, i) => ({ category: 'unique_display', id: 'preview', field: String(i), text, context, unsupported: true }));
  const coverage = auditTranslationCoverage(compile(source).packages, source.core)['zh-CN'];
  assert.equal(coverage.categories.unique_display.total, 2);
  assert.equal(coverage.categories.unique_display.translated, 1);
  assert.deepEqual(coverage.missing.map(row => [row.text, row.context, row.unsupported]), [['Unresolved text', context, true]]);
  source.core.rows[1].unsupported = false;
  const split = auditTranslationCoverage(compile(source).packages, source.core)['zh-CN'];
  assert.equal(split.categories.unique_display.total, 3);
  assert.equal(split.categories.unique_display.translated, 0);
});

test('物品匿名格式兼容不覆盖其他语境中已匹配的明确编号模板', () => {
  const source = statInputs(), raw = 'Gain {0} Life';
  source.core.stats[0].stats = ['life'];
  source.core.stats[0].description = { text: raw, limit: [['#', '#']] };
  const form = source.game.stats[0];
  form.path = 'data/statdescriptions/stat_descriptions.csd';
  form.stats = ['life'];
  form.english = [{ text: raw, limits: ['#'], flags: [], special: '', line: 1 }];
  form.translated = [{ ...form.english[0], text: '获得 {0} 生命' }, { ...form.english[0], text: '取得 {} 点生命' }];
  let pack = compile(source).packages['zh-CN'];
  assert.equal(createTranslationRuntime(pack).translate('Gain 12 Life'), '获得 12 生命');
  form.translated.shift();
  pack = compile(source).packages['zh-CN'];
  assert.deepEqual(pack.stats, {});
  const runtime = createTranslationRuntime(pack);
  assert.equal(runtime.translate('Gain 12 Life'), 'Gain 12 Life');
  assert.equal(runtime.translate('Gain 12 Life', { scope: 'passive' }), 'Gain 12 Life');
  assert.equal(runtime.translate('Gain 12 Life', { scope: 'item-display' }), '取得 12 点生命');
});

test('Words 原生哈希和命名角色区分同名物品前后半及怪物名称', () => {
  const schema = { name: 'Words', identityField: 'HASH32', contextFields: ['Wordlist', 'Text'], nameRoles: { 1: 'prefix', 2: 'suffix' } };
  const original = { count: 4, columns: { HASH32: [10, 11, 12, 13], Wordlist: [1, 2, 3, 2], Text: ['Spirit', 'Spirit', 'Spirit', ' Spark'], Text2: ['Spirit', ' Spirit', 'Spirit', ' Spark'] } };
  const localized = { count: 4, columns: { ...original.columns, Text2: ['精魂', ' 万灵', '其他角色名', ' 夜星'] } };
  const source = inputs();
  source.game.texts = pairTableTexts(original, localized, schema, 'zh-CN');
  assert.equal(source.game.texts[1].en, ' Spirit', '保留原始空格，不把显示清理当作身份');
  const result = compile(source), runtime = createTranslationRuntime(result.packages['zh-CN']);
  assert.equal(result.report.conflicts.length, 0);
  assert.equal(runtime.itemName('Spirit Spark', 'RARE', 'Sapphire'), '精魂 夜星');
  assert.equal(runtime.itemName('Spirit Spirit', 'RARE', 'Sapphire'), '精魂 万灵');
  assert.equal(runtime.translate('Spirit'), 'Spirit', '名称片段不污染普通术语域');
  original.columns.HASH32[3] = 10;
  assert.throws(() => pairTableTexts(original, localized, schema, 'zh-CN'), /重复/);
});

test('词缀按官方 include 继承和属性身份分语境，同语境真正歧义仍拒绝', () => {
  const source = statInputs();
  const general = source.game.stats[0];
  general.path = 'data/statdescriptions/stat_descriptions.csd';
  const skill = structuredClone(general);
  skill.path = 'data/statdescriptions/skill_stat_descriptions.csd';
  skill.includes = [general.path];
  skill.translated[0].text = '魔力 {1}% 和生命 {0:+d}';
  source.game.stats.push(skill);
  source.game.stats.push({ locale: 'zh-CN', path: 'data/statdescriptions/passive_skill_stat_descriptions.csd', stats: [], includes: [general.path] });
  let runtime = createTranslationRuntime(compile(source).packages['zh-CN']);
  assert.equal(runtime.translate('Gain +12 Life and 3.5% Mana', { scope: 'item-display' }), '获得 3.5% 魔力和 +12 生命');
  assert.equal(runtime.translate('Gain +12 Life and 3.5% Mana', { scope: 'passive' }), '获得 3.5% 魔力和 +12 生命');
  assert.equal(runtime.translate('Gain +12 Life and 3.5% Mana', { scope: 'skill' }), '魔力 3.5% 和生命 +12');
  assert.equal(runtime.translate('Gain +12 Life and 3.5% Mana'), 'Gain +12 Life and 3.5% Mana');
  const ambiguous = structuredClone(general);
  ambiguous.stats = ['other_life', 'other_mana'];
  ambiguous.translated[0].text = '其他机制 {0:+d} 和 {1}%';
  source.game.stats.push(ambiguous);
  source.core.stats.push({ ...source.core.stats[0], stats: ambiguous.stats });
  runtime = createTranslationRuntime(compile(source).packages['zh-CN']);
  assert.equal(runtime.translate('Gain +12 Life and 3.5% Mana', { scope: 'item-display' }), 'Gain +12 Life and 3.5% Mana');
});

test('已支持显示退回英文或必验入口缺译时产生阻断记录，措辞修正不误报', () => {
  const source = inputs(), previous = compile(source).packages['zh-CN'];
  source.core.rows = [{ category: 'base_name', text: 'Dueling Wand' }];
  const next = structuredClone(previous); next.items = {}; next.entities = {};
  assert.equal(auditTranslationRegressions(previous, next, source.core)[0].reason, 'supported-display-regressed');
  next.items['Dueling Wand'] = '决斗法杖';
  assert.equal(auditTranslationRegressions(previous, next, source.core).length, 0);
  assert.equal(auditTranslationRegressions(previous, next, source.core, [{ locale: 'zh-CN', source: 'Unknown Required Display' }])[0].reason, 'required-display-untranslated');
});

test('显示模板按语境隔离，冒号标签、规则递归和上下文模板共用索引', () => {
  const source = inputs();
  source.reviewed.entries.push({ locale: 'zh-CN', context: 'pob', source: 'Life Regeneration', translated: '生命再生', evidence: { kind: 'test' } });
  source.reviewed.entries.push({ locale: 'zh-CN', context: 'item-display', source: '{0}% Armour', translated: '护甲 {0}%', evidence: { kind: 'test' } });
  source.reviewed.rules.push({ locale: 'zh-CN', scope: 'pob', pattern: '^(.+): (\\d+)$', replacement: '$1：$2', parameters: { 1: 'terms' }, evidence: { kind: 'test' } });
  const runtime = createTranslationRuntime(compile(source).packages['zh-CN']);
  assert.equal(runtime.translate('Life Regeneration:', { scope: 'pob' }), '生命再生:');
  assert.equal(runtime.translate('Life Regeneration: 7', { scope: 'pob' }), '生命再生：7');
  assert.equal(runtime.translate('Life Regeneration: 7'), 'Life Regeneration: 7');
  assert.equal(runtime.translate('18% Armour', { scope: 'item-display' }), '护甲 18%');
  assert.equal(runtime.whole('18% Armour', { scope: 'item-display' }), '护甲 18%');
  assert.equal(runtime.translate('18% Armour'), '18% Armour');
  source.reviewed.rules[0].scope = 'unknown';
  assert.throws(() => compile(source), /语境无效/);
});

test('简繁按同一实体身份独立保存，不做汉字转换或跨客户端按行拼接', () => {
  const result = compile(inputs());
  assert.equal(result.packages['zh-CN'].items['Dueling Wand'], '决斗法杖');
  assert.equal(result.packages['zh-TW'].items['Dueling Wand'], '單挑法杖');
  assert.notEqual(result.packages['zh-CN'].revision, result.packages['zh-TW'].revision);
  const table = { name: 'Test' };
  assert.throws(() => pairTableTexts({ count: 2, columns: { Id: ['a', 'b'] } }, { count: 2, columns: { Id: ['b', 'a'] } }, table, 'zh-CN'), /ID 顺序/);
  assert.throws(() => pairTableTexts({ count: 1 }, { count: 2 }, table, 'zh-CN'), /行数/);
});

test('装备显示按官方底材能力选择原生属性身份，未知底材和普通文字不猜测', () => {
  const source = inputs();
  const raw = '{0}% increased Spirit';
  source.core.itemBases = { Sceptre: { spirit: true }, Amulet: { spirit: false } };
  for (const [id, translated] of [['local_spirit_+%', '该装备精魂提高 {0}%'], ['spirit_+%', '精魂提高 {0}%']]) {
    source.core.stats.push({ file: 'stat.lua', index: 1, form: 1, stats: [id], description: { text: raw, limit: [['1', '#']] } });
    source.game.stats.push({ locale: 'zh-CN', path: 'data/statdescriptions/stat_descriptions.csd', line: source.game.stats.length + 1, stats: [id],
      english: [{ text: raw, limits: ['1|#'], flags: [], special: '', line: 1 }], translated: [{ text: translated, limits: ['1|#'], flags: [], special: '', line: 2 }] });
    source.game.stats.push({ ...structuredClone(source.game.stats.at(-1)), locale: 'zh-TW' });
  }
  source.reviewed.itemStatSelections = [{ source: raw, property: 'spirit', local: ['local_spirit_+%'], global: ['spirit_+%'], evidence: { path: 'src/Classes/Item.lua' } }];
  const runtime = createTranslationRuntime(compile(source).packages['zh-CN']);
  assert.equal(runtime.translate('74% increased Spirit', { scope: 'item-display', item: { base: 'Sceptre' } }), '该装备精魂提高 74%');
  assert.equal(runtime.translate('74% increased Spirit', { scope: 'item-display', item: { base: 'Amulet' } }), '精魂提高 74%');
  assert.equal(runtime.translate('74% increased Spirit', { scope: 'item-display', item: { base: 'Unknown' } }), '74% increased Spirit');
  assert.equal(runtime.translate('74% increased Spirit', { scope: 'pob', item: { base: 'Sceptre' } }), '74% increased Spirit');
  source.reviewed.itemStatSelections[0].local = ['invented'];
  assert.throws(() => compile(source), /保真验证/);
});

test('同原文背景按官方传奇和底材身份选择，不污染通用词典或历史原文', () => {
  const source = inputs(), raw = 'Line one\nLine two';
  source.game.texts = ['one', 'two'].map(id => ({ ...text('zh-CN', id, raw, id === 'one' ? '背景甲。' : '背景乙。'), table: 'FlavourText', field: 'Text' }));
  source.core.rows = [{ category: 'flavour_name', id: 'two', text: 'Unique' }, { category: 'flavour_text', id: 'two', text: raw },
    { category: 'unique_display', text: raw, context: { item: { title: 'Unique', base: 'Base' } } }];
  const runtime = createTranslationRuntime(compile(source).packages['zh-CN']);
  assert.equal(runtime.translate(raw, { scope: 'item-display', item: { title: 'Unique', base: 'Base', rarity: 'UNIQUE' } }), '背景乙。');
  assert.equal(runtime.translate(raw), raw);
  assert.equal(runtime.translate(raw, { scope: 'item-display', item: { title: 'Unique', base: 'Other', rarity: 'UNIQUE' } }), raw);
  assert.equal(runtime.translate('Old line one\nOld line two', { scope: 'item-display', item: { title: 'Unique', base: 'Base', rarity: 'UNIQUE' } }), 'Old line one\nOld line two');
});

test('有序属性身份、参数换序、正负数和范围只搬运官方显示字符串', () => {
  const runtime = createTranslationRuntime(compile(statInputs()).packages['zh-CN']);
  assert.equal(runtime.translate('Gain +12 Life and 3.5% Mana'), '获得 3.5% 魔力和 +12 生命');
  assert.equal(runtime.translate('Gain -12 Life and -3% Mana'), '获得 -3% 魔力和 -12 生命');
  assert.equal(runtime.translate('Gain +(12-24) Life and (3-5)% Mana'), '获得 (3-5)% 魔力和 +(12-24) 生命');
  assert.equal(runtime.translate('Gain +1,234.50 Life and 0.00% Mana'), '获得 0.00% 魔力和 +1,234.50 生命');
});

test('参数身份、条件、格式或单位变换不一致的词缀不得发布', () => {
  for (const mutate of [
    source => { source.game.stats[0].stats.reverse(); },
    source => { source.game.stats[0].translated[0].limits[0] = '1|#'; },
    source => { source.game.stats[0].translated[0].special = 'divide_by_one_hundred 1'; },
    source => { source.game.stats[0].translated[0].text = '获得 {0}% 魔力和 {1} 生命'; },
    source => { source.game.stats[0].duplicates = [{ language: 'Simplified Chinese', forms: [] }]; },
  ]) {
    const source = statInputs(); mutate(source);
    const result = compile(source);
    assert.deepEqual(result.packages['zh-CN'].stats, {});
    assert.equal(result.report['zh-CN'].verifiedStatForms, 0);
  }
});

test('同名异义只可按实体取值，缺少身份或原文已变时保留原文', () => {
  const source = inputs();
  source.game.texts = [text('zh-CN', 'one', 'Twin', '甲'), text('zh-CN', 'two', 'Twin', '乙')];
  const compiled = compile(source), runtime = createTranslationRuntime(compiled.packages['zh-CN']);
  assert.equal(runtime.translate('Twin'), 'Twin');
  assert.equal(runtime.translate('Twin', { entity: { table: 'BaseItemTypes', id: 'two', field: 'Name' } }), '乙');
  assert.equal(runtime.translate('Old Twin', { entity: { table: 'BaseItemTypes', id: 'two', field: 'Name' } }), 'Old Twin');
  assert.equal(compiled.report.conflicts.length, 1);
});

test('未知长句不得用已知单词拼成混合译文，缺译记录可观察', () => {
  const source = inputs();
  source.reviewed.entries.push({ locale: 'zh-CN', domain: 'terms', source: 'Damage', translated: '伤害', evidence: { kind: 'test' } });
  source.reviewed.entries.push({ locale: 'zh-CN', domain: 'ui', source: '{0} Life', translated: '{0} 点生命', evidence: { kind: 'test' } });
  const runtime = createTranslationRuntime(compile(source).packages['zh-CN']);
  assert.equal(runtime.translate('Experimental Damage Behaviour'), 'Experimental Damage Behaviour');
  assert.ok(runtime.missing().some(entry => entry.source === 'Experimental Damage Behaviour'));
  assert.equal(runtime.translate('Regenerate (1-2)% of maximum Life'), 'Regenerate (1-2)% of maximum Life');
  assert.equal(runtime.translate('100 Life'), '100 点生命');
  assert.equal(runtime.whole('Dueling Wand\nUnknown'), undefined);
});

test('同一参数重复出现时校验全部格式与次数，不能只保留最后一个', () => {
  const source = statInputs();
  source.core.stats[0].description.text = '{0} Life and {0:+d} Mana';
  source.game.stats[0].english[0].text = source.core.stats[0].description.text;
  source.game.stats[0].translated[0].text = '{0:+d} 生命和 {0:+d} 魔力';
  assert.deepEqual(compile(source).packages['zh-CN'].stats, {});
});

test('正式写入中途失败恢复已有文件，清理错误不能掩盖根因', async t => {
  const root = await mkdtemp(join(tmpdir(), 'pob-translation-transaction-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'first.json'), 'before');
  let calls = 0;
  await assert.rejects(writeFileTransaction(root, [{ path: 'first.json', contents: 'after' }, { path: 'second.json', contents: 'new' }], {
    ...filesystem, rename: async (...args) => { if (++calls === 2) throw new Error('测试提交失败'); return filesystem.rename(...args); },
    rm: async (...args) => { await filesystem.rm(...args); throw new Error('测试清理失败'); },
  }), error => error instanceof AggregateError && error.errors[0].message === '测试提交失败');
  assert.equal(await readFile(join(root, 'first.json'), 'utf8'), 'before');
  await assert.rejects(readFile(join(root, 'second.json')), { code: 'ENOENT' });
});

test('重复审核键、遗漏来源和版本不符不能静默通过', () => {
  const source = inputs();
  source.reviewed.entries = [{ locale: 'zh-CN', domain: 'ui', source: 'Test', translated: '测试', evidence: { kind: 'test' } }];
  source.reviewed.entries.push(source.reviewed.entries[0]);
  assert.throws(() => compile(source), /重复/);
  source.reviewed.entries.pop(); delete source.reviewed.entries[0].evidence;
  assert.throws(() => compile(source), /来源/);
  source.core.upstream_commit = 'b'.repeat(40);
  assert.throws(() => compile(source), /版本/);
});

test('CSD 保留条件、有序 ID、转换、重复语言段并检查行数', () => {
  assert.equal(parseCsd('description\n1 %_chance_to_gain_frenzy_charge_on_mine_detonated_targeting_an_enemy\n1\n# "Value {0}"').blocks[0].stats[0], '%_chance_to_gain_frenzy_charge_on_mine_detonated_targeting_an_enemy');
  const source = 'description\n2 first second\n1\n# 1|# "Value {1}% {0}" negate 1\nlang "Simplified Chinese"\n1\n# 1|# "数值 {0} {1}%" negate 1\nlang "Simplified Chinese"\n1\n# 1|# "另一行 {0} {1}%" negate 1';
  const block = parseCsd(source).blocks[0];
  assert.deepEqual(block.stats, ['first', 'second']);
  assert.deepEqual(block.sections.English[0].limits, ['#', '1|#']);
  assert.equal(block.sections.English[0].special, 'negate 1');
  assert.equal(block.duplicates.length, 1);
  assert.throws(() => parseCsd(source.replace('2 first second', '3 first second')), /属性 ID|缺少/);
  assert.throws(() => parseCsd('description\n1 first\n2\n# "Only one"'), /行数/);
});

test('datc64 拒绝错位 schema 和无效字符串指针', () => {
  const schema = { name: 'Tiny', columns: [{ name: 'Id', type: 'string' }] };
  const bytes = Buffer.alloc(4 + 8 + 8 + 4);
  bytes.writeUInt32LE(1, 0); bytes.writeBigUInt64LE(8n, 4); bytes.fill(0xbb, 12, 20); bytes.write('A', 20, 'utf16le');
  assert.deepEqual(readDatStrings(bytes, schema).columns.Id, ['A']);
  assert.throws(() => readDatStrings(bytes, { ...schema, columns: [...schema.columns, { name: 'extra', type: 'i32' }] }), /schema/);
  bytes.writeBigUInt64LE(999n, 4);
  assert.throws(() => readDatStrings(bytes, schema), /偏移/);
});

async function candidateFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'pob-native-translation-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = inputs(), candidate = join(root, 'candidate');
  const put = async (path, value) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), Buffer.isBuffer(value) ? value : encode(value)); };
  await put('src/source.lua', Buffer.from('return {}'));
  await put('cn/pipeline/schemas/game-text-tables.json', { schema_version: 1 });
  input.game.tool = { release: 'test-release', files: { 'test.exe': 'a'.repeat(64) } };
  await put('cn/pipeline/schemas/game-text-tools.json', input.game.tool);
  input.game.schema = { sha256: hash(await readFile(join(root, 'cn/pipeline/schemas/game-text-tables.json'))) };
  input.game.sources = [{ client: 'cn', path: 'game.datc64', sha256: 'c'.repeat(64) }];
  input.core.sources = [{ path: 'src/source.lua', sha256: hash(Buffer.from('return {}')) }];
  const payload = encode(input.game), gzip = gzipSync(payload);
  await put('candidate/game-text.json.gz', gzip);
  await put('candidate/core-corpus.json.gz', gzipSync(encode(input.core)));
  await put('candidate/candidate.json', { sha256: hash(gzip), payload_sha256: hash(payload) });
  await put('cn/pipeline/sources/translations/reviewed.json', input.reviewed);
  await put('cn/config/version-lock.json', { upstream: { commit: input.core.upstream_commit }, content_versions: { crafting: { sentinel: true } } });
  await put('cn/config/content-source-lock.json', { schema_version: 1, inputs: [{ id: 'crafting.sentinel', stage: 'M2-3', sha256: 'd'.repeat(64) }] });
  return { root, candidate, put };
}

test('接受快照必须对应完整差异审核，失败不改锁定与正式产物', async t => {
  const { root, candidate, put } = await candidateFixture(t);
  const before = await readFile(join(root, 'cn/config/content-source-lock.json'));
  const review = await reviewTranslationCandidate({ repoRoot: root, candidate });
  await put('review.json', Buffer.from(JSON.stringify(review.report, null, 2) + '\n'));
  await assert.rejects(acceptTranslationCandidate({ repoRoot: root, candidate, review: join(root, 'review.json'), acknowledgement: 'bad' }), /确认/);
  assert.deepEqual(await readFile(join(root, 'cn/config/content-source-lock.json')), before);
  await acceptTranslationCandidate({ repoRoot: root, candidate, review: join(root, 'review.json'), acknowledgement: review.sha256 });
  const lock = JSON.parse(await readFile(join(root, 'cn/config/content-source-lock.json')));
  assert.deepEqual(lock.inputs[0], JSON.parse(before).inputs[0]);
  assert.equal(lock.inputs.length, 4);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'cn/config/version-lock.json'))).content_versions.crafting, { sentinel: true });
  await assert.rejects(acceptTranslationCandidate({ repoRoot: root, candidate, review: join(root, 'review.json'), acknowledgement: review.sha256 }), /已变化/);
});

test('即使确认报告哈希，必验显示缺译仍阻止接受且不更新任何正式锁', async t => {
  const { root, candidate, put } = await candidateFixture(t);
  const input = reviewed();
  input.requiredDisplays = [{ locale: 'zh-CN', source: 'Missing Required Display' }];
  await put('cn/pipeline/sources/translations/reviewed.json', input);
  const before = await readFile(join(root, 'cn/config/content-source-lock.json'));
  const review = await reviewTranslationCandidate({ repoRoot: root, candidate });
  await put('review.json', Buffer.from(JSON.stringify(review.report, null, 2) + '\n'));
  await assert.rejects(acceptTranslationCandidate({ repoRoot: root, candidate, review: join(root, 'review.json'), acknowledgement: review.sha256 }), /不能接受/);
  assert.deepEqual(await readFile(join(root, 'cn/config/content-source-lock.json')), before);
});
