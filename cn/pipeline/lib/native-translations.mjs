import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { displayGameText } from './game-text.mjs';
import { createTranslationRuntime } from '../../shared/translation-runtime.mjs';
import { compileItemTranslations } from './item-translations.mjs';
import { localizeItemRows } from '../../shared/item-translation.mjs';

export const translationInputIds = ['translation.game', 'translation.core', 'translation.reviewed'];
export const translationDomains = ['items', 'stats', 'tooltip', 'ui', 'terms'];
export const translationOutputs = { 'zh-CN': 'cn/generated/web-data/translations.json', 'zh-TW': 'cn/generated/web-data/translations.zh-TW.json' };
export const normalizeText = value => displayGameText(value).replace(/\^x[\da-fA-F]{6}|\^[\da-fA-F]/g, '').replace(/\r\n/g, '\n').trim();
const comparable = value => normalizeText(value).replace(/\s+/g, ' ');
const hash = value => createHash('sha256').update(value).digest('hex');
const groupKey = ids => JSON.stringify(ids);
const entityKey = row => JSON.stringify([row.table, row.id, row.field, row.element || 0]);
const ordered = record => Object.fromEntries(Object.entries(record).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));

function domainFor(row) {
  if (row.table === 'Words') return 'items';
  if ((row.table === 'KeywordPopups' && row.field === 'Term') || row.table === 'SupportGemFamily') return 'terms';
  if (row.table === 'BaseItemTypes' && row.field === 'Name') return 'items';
  if (row.table === 'Mods' && row.field === 'Name') return 'items';
  if (row.table === 'ItemClasses' && /Name/.test(row.field)) return 'items';
  if (row.table === 'PassiveSkills' && row.field === 'Name') return 'terms';
  if (['ClientStrings', 'ClientStrings2', 'CharacterPanelStats'].includes(row.table)) return 'ui';
  return /Name$/.test(row.field) ? 'terms' : 'tooltip';
}

function coreLimits(limits) {
  return limits.map(([a, b]) => a === '!' ? `!${b}` : a === b ? `${a}` : `${a}|${b}`).join(' ');
}

function specialSignature(value) {
  return value.replace(/\bcanonical_line\b/g, '').trim().replace(/\s+/g, ' ');
}

function coreSpecial(description) {
  return Object.keys(description).filter(key => /^\d+$/.test(key)).sort((a, b) => Number(a) - Number(b))
    .map(key => description[key]).filter(entry => entry.k !== 'canonical_line').map(entry => `${entry.k} ${entry.v}`).join(' ');
}

function formats(text) {
  const parameters = {};
  for (const match of text.matchAll(/\{(\d+)(:[^}]+)?\}/g)) (parameters[match[1]] ||= []).push(match[2] || '');
  return ordered(Object.fromEntries(Object.entries(parameters).map(([id, values]) => [id, values.sort()])));
}

export function compileNativeTranslations(game, core, reviewed) {
  if (game.schema_version !== 1 || core.schema_version !== 1 || reviewed.schema_version !== 1) throw new Error('翻译来源 schema 版本不支持');
  if (game.upstream_commit !== core.upstream_commit) throw new Error('游戏候选与核心语料版本不同');
  if (!Array.isArray(reviewed.entries) || !Array.isArray(reviewed.rules) || !Array.isArray(reviewed.aliases)) throw new Error('审核译文结构无效');
  for (const rows of [game.texts, game.stats, reviewed.entries, reviewed.rules, reviewed.aliases]) {
    if (!Array.isArray(rows) || rows.some(row => !['zh-CN', 'zh-TW'].includes(row.locale))) throw new Error('翻译条目的语言标识无效');
  }
  for (const recovered of reviewed.recoveredArtifactEntries || []) {
    if (!reviewed.entries.some(entry => entry.locale === recovered.locale && entry.domain === recovered.domain && entry.source === recovered.source)) throw new Error(`仅产物词条未迁回来源：${recovered.source}`);
  }
  const report = { conflicts: [], rejectedTemplates: [], missingCoreSources: [], resolutions: [], unmappedEntities: [], recoveredArtifactEntries: reviewed.recoveredArtifactEntries || [], deferred: core.deferred, provenance: {} };
  const packages = {};
  const coreGroups = new Map();
  for (const row of core.stats) {
    const key = groupKey(row.stats);
    if (!coreGroups.has(key)) coreGroups.set(key, []);
    coreGroups.get(key).push(row);
  }
  for (const locale of ['zh-CN', 'zh-TW']) {
    const candidates = new Map(), entities = {}, entitySources = {}, entityContexts = {}, contexts = { 'item-type': {}, 'item-display': {}, 'item-variant': {}, passive: {}, skill: {}, pob: {} }, blocked = new Set(), blockedEntities = new Set();
    const put = (domain, source, translated, evidence, override = false) => {
      source = normalizeText(source); translated = normalizeText(translated);
      if (!source || !translated || !translationDomains.includes(domain)) throw new Error('翻译条目为空或语境无效');
      const key = `${domain}\0${source}`;
      const previous = candidates.get(key);
      if (blocked.has(key) && !override) return;
      if (previous && previous.translated !== translated) {
        if (!override) {
          report.conflicts.push({ locale, domain, source, values: [previous, { translated, evidence }] });
          candidates.delete(key); blocked.add(key); return;
        }
        report.resolutions.push({ locale, domain, source, before: previous.translated, translated, evidence });
      }
      if (override) blocked.delete(key);
      candidates.set(key, { translated, evidence });
    };
    const sourceRows = game.texts.filter(row => row.locale === locale);
    const namedEntities = new Set(sourceRows.filter(row => row.table !== 'Mods' && (row.table !== 'Words' || row.nameRole === 'unique')).map(row => normalizeText(row.en)));
    const textsByEnglish = new Map();
    for (const row of sourceRows) {
      if (!/[\u3400-\u9fff]/.test(row.translated) && !(row.table === 'ClientStrings' && /^MagicName(?:Prefix|Suffix|PrefixSuffix)$/.test(row.id))) continue;
      const key = entityKey(row);
      if (entities[key] && entities[key] !== normalizeText(row.translated)) {
        report.conflicts.push({ locale, entity: key, reason: 'duplicate-entity-identity', values: [entities[key], normalizeText(row.translated)] });
        delete entities[key]; delete entitySources[key]; blockedEntities.add(key);
      }
      if (!blockedEntities.has(key)) {
        entities[key] = normalizeText(row.translated); entitySources[key] = normalizeText(row.en);
        if (row.context) entityContexts[key] = { ...row.context, nameRole: row.nameRole, original: row.en };
      }
      const english = comparable(row.en);
      if (!english) {
        report.unmappedEntities.push({ locale, entity: key, reason: 'empty-original' });
        continue;
      }
      if (!textsByEnglish.has(english)) textsByEnglish.set(english, []);
      textsByEnglish.get(english).push(row);
      if ((row.table !== 'Mods' || !namedEntities.has(normalizeText(row.en))) && (row.table !== 'Words' || row.nameRole === 'unique')) put(domainFor(row), row.en, row.translated, { kind: 'game', table: row.table, id: row.id, field: row.field, row: row.row });
    }
    for (const type of new Set(core.rows.filter(row => row.category === 'base_type').map(row => row.text))) {
      const id = type.replaceAll(' ', '');
      const matches = sourceRows.filter(row => row.table === 'ItemClasses' && row.field === 'Name' && row.id.replaceAll(' ', '') === id);
      if (matches.length === 1) contexts['item-type'][type] = normalizeText(matches[0].translated);
    }
    for (const row of core.rows) {
      if (!['gem_name', 'flavour_text', 'skill_description', 'unique_name', 'base_name', 'passive_name', 'skill_name'].includes(row.category)) continue;
      const sources = textsByEnglish.get(comparable(row.text)) || [];
      const domain = /name$/.test(row.category) ? row.category === 'passive_name' || row.category === 'skill_name' ? 'terms' : 'items' : 'tooltip';
      const matches = sources.filter(source => row.category === 'gem_name' ? source.table === 'BaseItemTypes' && (!row.gameId || source.id === row.gameId) : row.category === 'passive_name' ? source.table === 'PassiveSkills' && source.field === 'Name' : row.category === 'unique_name' ? source.table === 'Words' && source.nameRole === 'unique' : row.category === 'flavour_text' ? source.table === 'FlavourText' && source.id === row.id : true);
      const values = new Set(matches.map(source => normalizeText(source.translated)));
      if (values.size === 1) {
        const evidence = { kind: 'game', table: matches[0].table, id: matches[0].id, field: matches[0].field };
        if (row.category === 'passive_name') {
          contexts.passive[row.text] = [...values][0];
          report.provenance[JSON.stringify([locale, 'passive', row.text])] = evidence;
        }
        put(domain, row.text, [...values][0], evidence);
      }
      else if (!matches.length) report.missingCoreSources.push({ locale, category: row.category, id: row.id, text: row.text });
    }
    for (const row of core.rows.filter(row => row.category === 'unique_variant' && row.id === 'Megalomaniac, Diamond')) {
      if (contexts.passive[row.text]) {
        contexts['item-variant'][row.text] = contexts.passive[row.text];
        report.provenance[JSON.stringify([locale, 'item-variant', row.text])] = report.provenance[JSON.stringify([locale, 'passive', row.text])];
      }
    }
    const matchedForms = new Set();
    const nativeForms = new Map(), includes = new Map();
    for (const block of game.stats.filter(row => row.locale === locale)) {
      includes.set(block.path.toLowerCase(), (block.includes || []).map(path => path.toLowerCase()));
      const officialForms = coreGroups.get(groupKey(block.stats));
      if (!officialForms) continue;
      if (block.duplicates?.length) {
        report.rejectedTemplates.push({ locale, path: block.path, line: block.line, reason: 'duplicate-language-section', stats: block.stats });
        continue;
      }
      for (const official of officialForms) {
        const descriptor = official.description;
        // 无编号参数只在单一 stat、单一占位时具有唯一身份；不推断多参数的隐式顺序。
        const anonymous = /\{(:[^}]+)?\}/g;
        const canonical = text => normalizeText(text).replace(anonymous, (_, format = '') => `{0${format}}`);
        if ([descriptor.text, ...block.english.map(form => form.text), ...block.translated.map(form => form.text)].some(text =>
          /\{(:[^}]+)?\}/.test(text) && (block.stats.length !== 1 || [...text.matchAll(/\{(?:\d+)?(?::[^}]+)?\}/g)].length !== 1))) {
          report.rejectedTemplates.push({ locale, path: block.path, stats: block.stats, text: descriptor.text, reason: 'ambiguous-implicit-parameter' });
          continue;
        }
        const enForms = block.english.filter(form => comparable(form.text) === comparable(descriptor.text) && form.limits.join(' ') === coreLimits(descriptor.limit) && specialSignature(form.special) === coreSpecial(descriptor));
        for (const english of enForms) {
          const compatible = block.translated.filter(form => form.limits.join(' ') === english.limits.join(' ') && form.flags.join(' ') === english.flags.join(' ') && specialSignature(form.special) === specialSignature(english.special) && JSON.stringify(formats(canonical(form.text))) === JSON.stringify(formats(canonical(english.text))));
          const exact = compatible.filter(form => JSON.stringify(formats(form.text)) === JSON.stringify(formats(english.text)));
          const localized = exact.length ? exact : compatible;
          const distinct = new Set(localized.map(form => normalizeText(form.text)));
          if (distinct.size !== 1) {
            report.rejectedTemplates.push({ locale, path: block.path, line: english.line, stats: block.stats, text: descriptor.text, reason: distinct.size ? 'ambiguous-language-form' : 'condition-format-or-transform-mismatch' });
            continue;
          }
          const translated = [...distinct][0];
          const proof = { kind: 'game-stat', path: block.path, line: english.line, stats: block.stats, limits: english.limits, flags: english.flags, parameters: formats(canonical(english.text)), special: english.special, core: { file: official.file, index: official.index, form: official.form },
            ...(canonical(english.text) !== normalizeText(english.text) ? { parameterNormalization: 'single-stat-implicit-zero' } : {}) };
          if (exact.length) put('stats', descriptor.text, translated, proof);
          const path = block.path.toLowerCase();
          if (!nativeForms.has(path)) nativeForms.set(path, new Map());
          const key = JSON.stringify([block.line, block.stats, english.limits, english.flags, english.special, comparable(descriptor.text)]);
          const existing = nativeForms.get(path).get(key);
          if (existing && existing.translated !== translated) throw new Error(`同一原生词缀身份存在不同译文：${locale}/${path}/${key}`);
          nativeForms.get(path).set(key, { source: normalizeText(descriptor.text), translated, evidence: proof, ...(!exact.length ? { itemOnly: true } : {}) });
          matchedForms.add(`${official.file}:${official.index}:${official.form}`);
        }
      }
    }
    // CSD 的 include 是官方语境继承。按属性组覆盖继承项，再检查同一显示语境的文字冲突。
    // 不能把技能、天赋和装备的同名描述提前压成一个全局英文键。
    function inheritedForms(path, visited = new Set(), includeItemOnly = false) {
      if (visited.has(path)) throw new Error(`原生词缀 include 循环：${path}`);
      const nextVisited = new Set([...visited, path]), forms = new Map();
      for (const parent of includes.get(path) || []) for (const [key, form] of inheritedForms(parent, nextVisited, includeItemOnly)) forms.set(key, form);
      const own = new Map([...(nativeForms.get(path) || [])].filter(([, form]) => includeItemOnly || !form.itemOnly));
      const overridden = new Set([...own.values()].map(form => groupKey(form.evidence.stats)));
      for (const [key, form] of forms) if (overridden.has(groupKey(form.evidence.stats))) forms.delete(key);
      for (const [key, form] of own) forms.set(key, form);
      return forms;
    }
    for (const [context, file] of Object.entries({ 'item-display': 'stat_descriptions', passive: 'passive_skill_stat_descriptions', skill: 'skill_stat_descriptions' })) {
      const choices = new Map();
      for (const original of inheritedForms(`data/statdescriptions/${file}.csd`, new Set(), context === 'item-display').values()) {
        // 当前只修复物品显示；通用及技能、天赋语境保留各自原始模板身份。
        const form = context === 'item-display' ? { ...original,
          source: original.source.replace(/\{(:[^}]+)?\}/g, (_, format = '') => `{0${format}}`),
          translated: original.translated.replace(/\{(:[^}]+)?\}/g, (_, format = '') => `{0${format}}`),
        } : original;
        if (!choices.has(form.source)) choices.set(form.source, []);
        choices.get(form.source).push(form);
      }
      for (const [source, forms] of choices) {
        if (new Set(forms.map(form => form.translated)).size !== 1) {
          report.conflicts.push({ locale, context, source, reason: 'ambiguous-context-stat', values: forms });
          continue;
        }
        contexts[context][source] = forms[0].translated;
        report.provenance[JSON.stringify([locale, context, source])] = { kind: 'game-stat-context', forms: forms.map(form => form.evidence) };
      }
    }
    const itemScopes = compileItemTranslations({ core, sourceRows, nativeForms, contexts, reviewed, report, locale, normalize: normalizeText });
    const aliasKeys = new Set();
    for (const alias of reviewed.aliases.filter(row => row.locale === locale)) {
      if (!alias.reason) throw new Error('别名必须说明核验依据');
      const identity = JSON.stringify([alias.context || alias.domain, alias.source]);
      if (aliasKeys.has(identity)) throw new Error(`重复审核别名：${locale}/${identity}`);
      aliasKeys.add(identity);
      const key = JSON.stringify([alias.table, alias.id, alias.field, alias.element || 0]);
      const translated = entities[key];
      if (!translated) throw new Error(`别名缺少已锁定原生来源：${alias.source}`);
      if (alias.context) {
        if (!contexts[alias.context]) throw new Error('别名语境无效');
        contexts[alias.context][alias.source] = translated;
        report.provenance[JSON.stringify([locale, alias.context, alias.source])] = { kind: 'reviewed-alias', entity: key, reason: alias.reason };
      } else put(alias.domain, alias.source, translated, { kind: 'reviewed-alias', entity: key, reason: alias.reason }, true);
    }
    const reviewedKeys = new Set();
    for (const entry of reviewed.entries.filter(row => row.locale === locale)) {
      const key = `${entry.context || entry.domain}\0${normalizeText(entry.source)}`;
      if (reviewedKeys.has(key)) throw new Error(`重复审核译文：${locale}/${key}`);
      reviewedKeys.add(key);
      if (!entry.evidence?.kind || !entry.translated?.trim()) throw new Error('审核译文缺少来源或内容');
      if (entry.evidence.kind === 'reviewed-equivalent-game-text') {
        const forms = [...nativeForms.values()].flatMap(forms => [...forms.values()]).filter(form => form.source === normalizeText(entry.source));
        if (!entry.evidence.stats?.length || entry.evidence.stats.some(id => !forms.some(form => form.evidence.stats.includes(id)))
          || !forms.some(form => form.translated === normalizeText(entry.translated))) throw new Error(`等价审核译文缺少匹配的原生保真证据：${locale}/${entry.source}`);
      }
      if (entry.context) {
        if (!contexts[entry.context]) throw new Error('审核译文语境无效');
        contexts[entry.context][normalizeText(entry.source)] = normalizeText(entry.translated);
        report.provenance[JSON.stringify([locale, entry.context, normalizeText(entry.source)])] = { kind: 'reviewed-pob', evidence: entry.evidence };
        continue;
      }
      const native = candidates.get(key);
      if (native && (native.evidence.kind.startsWith('game') || native.evidence.kind === 'reviewed-alias')) {
        if (native.translated !== normalizeText(entry.translated)) report.resolutions.push({ locale, domain: entry.domain, source: entry.source, before: entry.translated, translated: native.translated, reason: 'native-game-text-authority' });
        continue;
      }
      if (blocked.has(key)) throw new Error(`审核译文不能覆盖有歧义的游戏文本，请提供实体映射：${locale}/${key}`);
      put(entry.domain, entry.source, entry.translated, { kind: 'reviewed-pob', evidence: entry.evidence });
    }
    const ruleKeys = new Set();
    const rules = reviewed.rules.filter(row => row.locale === locale).map(rule => {
      if (!rule.evidence?.kind || !rule.replacement || !rule.pattern) throw new Error('翻译模板缺少审核依据');
      if (rule.evidence.kind === 'game-composition') {
        const key = JSON.stringify([rule.evidence.table, rule.evidence.id, rule.evidence.field, 0]);
        if (!entities[key] || entities[key].replace('{0}', '$1') !== rule.replacement
          || entitySources[key].split('{0}').length !== 2 || !new RegExp(rule.pattern).test(entitySources[key].replace('{0}', '12')))
          throw new Error(`包装句式与原生来源不符：${locale}/${rule.evidence.id}`);
      }
      if (rule.scope && !contexts[rule.scope]) throw new Error('翻译模板语境无效');
      const key = JSON.stringify([rule.scope || '', rule.pattern, rule.flags || '']);
      if (ruleKeys.has(key)) throw new Error(`重复审核模板：${locale}/${key}`);
      ruleKeys.add(key);
      new RegExp(rule.pattern, rule.flags);
      return { pattern: rule.pattern, flags: rule.flags, replacement: rule.replacement, parameters: rule.parameters || {}, ...(rule.scope ? { scope: rule.scope } : {}) };
    });
    const domains = Object.fromEntries(translationDomains.map(domain => [domain, {}]));
    for (const [key, value] of candidates) {
      const [domain, source] = key.split('\0'); domains[domain][source] = value.translated;
      report.provenance[JSON.stringify([locale, domain, source])] = value.evidence;
    }
    packages[locale] = { schema_version: 3, locale, revision: '', ...Object.fromEntries(translationDomains.map(domain => [domain, ordered(domains[domain])])), entities: ordered(entities), entitySources: ordered(entitySources), entityContexts: ordered(entityContexts), contexts, rules,
      itemScopes, comparisonLabels: [...new Set(core.rows.filter(row => row.category === 'display_stat' && row.field === 'label').map(row => normalizeText(row.text)))].sort() };
    packages[locale].revision = hash(JSON.stringify(packages[locale]));
    report[locale] = { entries: candidates.size, verifiedStatForms: matchedForms.size, totalStatForms: core.stats.length, entities: Object.keys(entities).length, rules: rules.length };
  }
  return { packages, report };
}

export async function validateNativeProvenance(root, game, core) {
  if (game.schema?.sha256 !== hash(await readFile(resolve(root, 'cn/pipeline/schemas/game-text-tables.json')))) throw new Error('原生资源解析 schema 哈希不符');
  const tools = JSON.parse(await readFile(resolve(root, 'cn/pipeline/schemas/game-text-tools.json')));
  if (game.tool?.release !== tools.release || JSON.stringify(ordered(game.tool?.files || {})) !== JSON.stringify(ordered(tools.files))) throw new Error('原生资源提取工具来源或哈希不符');
  for (const source of [game, core]) {
    if (!Array.isArray(source.sources) || !source.sources.length || source.sources.some(row => !row.path || !/^[a-f0-9]{64}$/.test(row.sha256))) throw new Error('原生来源资源清单不完整');
    const keys = source.sources.map(row => `${row.client || ''}:${row.path}`);
    if (new Set(keys).size !== keys.length) throw new Error('原生来源资源清单有重复键');
  }
}

export async function loadNativeTranslationSources(root, inputs) {
  const values = {};
  for (const input of inputs) {
    const bytes = await readFile(resolve(root, input.path));
    if (hash(bytes) !== input.sha256) throw new Error(`词典来源哈希不匹配：${input.id}`);
    values[input.id] = JSON.parse(input.format === 'gzip-json' ? gunzipSync(bytes) : bytes);
  }
  if (translationInputIds.some(id => !values[id])) throw new Error('缺少锁定的原生翻译来源');
  const version = JSON.parse(await readFile(resolve(root, 'cn/config/version-lock.json')));
  const game = values['translation.game'], core = values['translation.core'];
  if (game.upstream_commit !== version.upstream.commit || core.upstream_commit !== version.upstream.commit) throw new Error('原生词典的 PoB 版本已过期');
  await validateNativeProvenance(root, game, core);
  const reviewHash = version.content_versions.translations?.review_sha256;
  if (!/^[a-f0-9]{64}$/.test(reviewHash) || inputs.some(input => input.provenance.reviewed_report_sha256 !== reviewHash)) throw new Error('翻译审核记录与来源锁定不一致');
  const reviewBytes = gunzipSync(await readFile(resolve(root, `cn/pipeline/sources/translations/reviews/${reviewHash}.json.gz`)));
  if (hash(reviewBytes) !== reviewHash) throw new Error('翻译审核记录哈希不符');
  const review = JSON.parse(reviewBytes);
  for (const input of inputs) if (review.input_sha256[input.id.slice('translation.'.length)] !== input.sha256) throw new Error('翻译审核记录与来源内容不一致');
  const compiled = compileNativeTranslations(values['translation.game'], values['translation.core'], values['translation.reviewed']);
  const failures = Object.values(compiled.packages).flatMap(pack => auditTranslationRegressions(null, pack, { rows: [] }, values['translation.reviewed'].requiredDisplays));
  if (failures.length) throw new Error(`正式词典存在 ${failures.length} 条必验显示缺译，生成已阻止：${failures[0].source}`);
  return compiled;
}

export function auditTranslationCoverage(packages, core) {
  const report = {};
  for (const [locale, payload] of Object.entries(packages)) {
    const runtime = createTranslationRuntime(payload), categories = {}, missing = [];
    const itemGroups = new Map(), auditRows = [];
    for (const row of core.rows) {
      if (row.category !== 'unique_display') { auditRows.push(row); continue; }
      if (!itemGroups.has(row.id)) itemGroups.set(row.id, []);
      itemGroups.get(row.id).push(row);
    }
    for (const group of itemGroups.values()) {
      group.sort((a, b) => Number(a.field) - Number(b.field));
      const localized = localizeItemRows(runtime, group.map(row => row.text), group.map(row => row.unsupported === true), { domains: ['stats', 'tooltip', 'terms', 'ui', 'items'], ...group[0].context });
      for (const [index, row] of localized.entries()) auditRows.push({ ...group[0], field: String(index), text: row.raw, unsupported: row.unsupported, localizedDisplay: row.translated });
    }
    for (const row of auditRows) {
      const text = normalizeText(row.text).replace(/\{(?:range|variant|tags):[^}]*\}|\{(?:rune|enchant|corrupted)\}/g, '').trim();
      const domain = /name$/.test(row.category) || row.category === 'unique_base' ? ['items', 'terms'] : /mod|stat|implicit/.test(row.category) ? ['stats', 'tooltip', 'terms', 'ui'] : ['terms', 'ui', 'tooltip', 'items', 'stats'];
      const translated = row.localizedDisplay ?? runtime.translate(text, { domains: domain, ...displayContext(row) });
      const category = categories[row.category] ||= { total: 0, translated: 0, original: 0, nonText: 0, internalFormat: 0, allowedAbbreviation: 0, partial: 0 };
      category.total++;
      if (!/[A-Za-z]/.test(text)) category.nonText++;
      else if (/\{(?:\d+:)?(?:mod|output|multi|color):|%[.\d]*[dsf]/.test(text) || row.category === 'gem_tag' && ['grants_active_skill', 'stages'].includes(text)) category.internalFormat++;
      else if (!runtime.hasUntranslated(text) && translated === text) category.allowedAbbreviation++;
      else if (translated !== text && !runtime.hasUntranslated(translated.replace(/\{\d+(?::[^}]+)?\}/g, ''))) category.translated++;
      else {
        if (translated !== text) category.partial++;
        else category.original++;
        missing.push({ category: row.category, id: row.id, field: row.field, text, ...(row.context ? { context: row.context } : {}),
          ...(row.category === 'unique_display' ? { unsupported: row.unsupported === true } : {}),
          ...(translated !== text ? { display: translated } : {}), reason: translated !== text ? 'remaining-original-fragment' : /\{\d|\bDNT\b|\bPLACEHOLDER\b/.test(text) ? 'internal-format-or-unmatched-template' : 'unmatched-original' });
      }
    }
    report[locale] = { categories, missing };
  }
  return report;
}

function displayContext(row) {
  if (row.context) return row.context;
  if (row.category === 'craft_affix_name') return { entity: { table: 'Mods', id: row.id.slice(row.id.indexOf('.') + 1), field: 'Name' } };
  if (row.category === 'passive_name') return { scope: 'passive' };
  if (row.category === 'unique_variant') return { scope: 'item-variant' };
  if (row.category === 'passive_stat') return { scope: 'passive' };
  if (row.category === 'skill_description') return { scope: 'skill' };
  if (/^calc_/.test(row.category)) return { scope: 'pob' };
  if (row.category === 'base_type') return { scope: 'item-type' };
  if (/unique_mod|unique_display|unique_range|unique_source|craft_mod|base_implicit|item_display/.test(row.category)) return { scope: 'item-display' };
  return {};
}

export function auditTranslationRegressions(previous, next, core, required = [], exceptions = []) {
  const before = previous?.schema_version === 3 ? createTranslationRuntime(previous) : null;
  const after = createTranslationRuntime(next), failures = [], checked = new Set();
  const complete = (runtime, text) => !runtime.hasUntranslated(text.replace(/\{\d+(?::[^}]+)?\}/g, ''));
  for (const row of [...core.rows, ...required.filter(row => row.locale === next.locale).map(row => ({ ...row, required: true, text: row.source }))]) {
    const source = normalizeText(row.text).replace(/\{(?:range|variant|tags):[^}]*\}|\{(?:rune|enchant|corrupted)\}/g, '').trim();
    if (!source || /%[.\d]*[dsf]/.test(source) || row.category === 'calc_format') continue;
    const context = displayContext(row), key = JSON.stringify([source, context, row.kind]);
    if (!row.required && checked.has(key)) continue;
    checked.add(key);
    const display = runtime => row.kind === 'item-name' ? runtime.itemName(source, context.item?.rarity, context.item?.base) || runtime.translate(source, context) : runtime.translate(source, context);
    const previousText = before ? display(before) : source, text = display(after);
    if (!complete(after, text) && (row.required || before && complete(before, previousText) && previousText !== source)) {
      const exception = !row.required && exceptions.find(entry => entry.locale === next.locale && entry.source === source && entry.before === previousText && entry.upstream_commit === core.upstream_commit
        && JSON.stringify(entry.context || {}) === JSON.stringify(context) && entry.reason && entry.evidence?.kind);
      failures.push({ locale: next.locale, source, context, before: previousText, after: text, reason: row.required ? 'required-display-untranslated' : 'supported-display-regressed', ...(exception ? { reviewedException: exception } : {}) });
    }
  }
  return failures;
}
