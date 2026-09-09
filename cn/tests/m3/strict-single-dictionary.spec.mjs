import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createTranslationRuntime } from '../../shared/translation-runtime.mjs';

test('词典按语言和语境唯一，游戏专名来自独立原文', () => {
  const cn = JSON.parse(readFileSync('cn/generated/web-data/translations.json'));
  const tw = JSON.parse(readFileSync('cn/generated/web-data/translations.zh-TW.json'));
  for (const [locale, dictionary] of [['zh-CN', cn], ['zh-TW', tw]]) {
    assert.equal(dictionary.schema_version, 3);
    assert.equal(dictionary.locale, locale);
    assert.match(dictionary.revision, /^[a-f0-9]{64}$/);
    for (const domain of ['items', 'terms', 'stats', 'tooltip', 'ui']) assert.ok(Object.keys(dictionary[domain]).length > 0);
    assert.ok(Object.keys(dictionary.entities).length > 40000);
  }
  const simplified = createTranslationRuntime(cn), traditional = createTranslationRuntime(tw);
  for (const [source, simplifiedText, traditionalText] of [
    ['Dueling Wand', '决斗法杖', '單挑法杖'], ['Efficiency I', '效能 I', '效率 I'], ['Sapphire', '蓝玉', '藍寶石'],
  ]) {
    assert.equal(simplified.translate(source, { domains: ['items'] }), simplifiedText);
    assert.equal(traditional.translate(source, { domains: ['items'] }), traditionalText);
  }
  assert.equal(simplified.translate('Heartbreaking'), '心伤');
  assert.equal(simplified.translate('Pin'), '定身');
  assert.equal(simplified.translate('Electrocute'), '触电');
  assert.equal(simplified.translate('Weapon 1'), '主手武器');
  assert.equal(simplified.translate('Weapon 2'), '副手/盾牌');
  assert.equal(simplified.translate('Charm', { scope: 'item-type' }), '咒符');
  assert.equal(simplified.translate('Warstaff', { scope: 'item-type' }), '节杖');
  assert.equal(simplified.translate('Critical Strike Multiplier'), '暴击伤害倍率');
  const report = JSON.parse(readFileSync('cn/generated/web-data/translations-report.json'));
  assert.equal(report.recoveredArtifactEntries.length, 43);
  for (const recovered of report.recoveredArtifactEntries) assert.ok(report.provenance[JSON.stringify([recovered.locale, recovered.domain, recovered.source])]);
});

test('业务层只使用共享翻译入口，不维护第二份私有译文', () => {
  const loader = readFileSync('cn/lua/i18n/loader.lua', 'utf8');
  assert.ok(loader.includes('generated/web-data/translations.json'));
  assert.ok(loader.includes('translations.zh-TW.json'));
  assert.equal(existsSync('cn/generated/lua-i18n/translations.lua'), false);
  const web = readFileSync('cn/web/src/utils/webTranslation.ts', 'utf8');
  assert.ok(web.includes("import('../../../generated/web-data/translations.zh-TW.json')"));
  assert.doesNotMatch(web, /replace\([^\n]*[\u3400-\u9fff]/);
  const panel = readFileSync('cn/web/src/components/CalcsPanel.vue', 'utf8');
  assert.match(panel, /translateSourceType\s*\}/);
  assert.doesNotMatch(panel, /function\s+translateSourceType\s*\(/);
  const forbidden = [/CALC_TERMS_DICT\s*[:=]/, /GEM_NAME_MAPPINGS\s*[:=]/, /CALC_EXACT_PHRASES\s*[:=]/,
    /const\s+[A-Z0-9_]+_DICT\s*[:=]/, /const\s+[A-Z0-9_]+_MAPPINGS\s*[:=]/,
    /const\s+itemTypeDictionaryAliases\b/, /const\s+slotNames\b\s*[:=]/];
  for (const entry of readdirSync('cn/web/src', { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.(vue|ts|js)$/.test(entry.name) || entry.name.endsWith('.d.ts')) continue;
    const path = join(entry.parentPath, entry.name), source = readFileSync(path, 'utf8');
    for (const pattern of forbidden) assert.doesNotMatch(source, pattern, path);
  }
});
