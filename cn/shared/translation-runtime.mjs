const domains = ['terms', 'ui', 'items', 'stats', 'tooltip'];
const numeric = '(?:[+-]?\\(\\s*[+-]?|[+-]?)\\d+(?:[.,]\\d+)*(?:\\s*(?:-|to)\\s*[+-]?\\d+(?:[.,]\\d+)*)?%?(?:\\s*\\))?';
const placeholder = /\{(\d+)(:[^}]+)?\}/g;
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const normalizeTranslationText = value => String(value ?? '').replace(/\^x[\da-fA-F]{6}|\^[\da-fA-F]/g, '').replace(/\[([^\[\]]+)\]/g, (_, text) => text.split('|').at(-1)).replace(/\\n/g, '\n').trim();
const comparable = value => normalizeTranslationText(value).replace(/\s+/g, ' ');

function compileTemplate(source, numericOnly) {
  const parameters = [];
  let expression = '^', cursor = 0;
  for (const match of source.matchAll(placeholder)) {
    expression += escape(source.slice(cursor, match.index)).replace(/\s+/g, '\\s+');
    expression += `(${numericOnly || match[2] ? numeric : '.+?'})`;
    parameters.push(match[1]); cursor = match.index + match[0].length;
  }
  expression += escape(source.slice(cursor)).replace(/\s+/g, '\\s+');
  return { expression: new RegExp(`${expression}$`, 'i'), parameters };
}

function applyTemplate(entry, match, known) {
  const values = new Map();
  for (const [index, id] of entry.parameters.entries()) {
    const value = match[index + 1];
    if (values.has(id) && values.get(id) !== value) return undefined;
    values.set(id, value);
  }
  if ([...entry.translated.matchAll(placeholder)].some(match => !values.has(match[1]))) return undefined;
  for (const [id, value] of values) {
    if (new RegExp(`^${numeric}$`).test(value)) continue;
    // 文本参数必须完整命中词项，不能把任意英文句子吞成一个参数。
    const translated = known(value);
    if (!translated) return undefined;
    values.set(id, translated);
  }
  return entry.translated.replace(placeholder, (_, id) => values.get(id));
}

// 浏览器与离线覆盖检查使用同一纯显示实现；参数仅按身份搬运，不求值。
export function createTranslationRuntime(payload) {
  if (payload.schema_version !== 3 || !['zh-CN', 'zh-TW'].includes(payload.locale) || !payload.revision) throw new Error('语言包版本或语言标识无效');
  const indexes = new Map(), templates = new Map(), wrappedTemplates = new Map(), wrapped = [], wrappedCache = new Map(), wholeCache = new Map(), cache = new Map(), missing = new Map();
  const rules = (payload.rules || []).map(rule => ({ ...rule, expression: new RegExp(rule.pattern, rule.flags) }));
  const allowed = new Set(payload.allowedTokens || ['PoB', 'POB', 'DPS', 'DoT', 'AoE', 'ES', 'PvP', 'PvE', 'Shift', 'Ctrl', 'x', 's', 'm', 'ms', 'max', 'min', 'I', 'II', 'III', 'IV', 'S', 'J']);
  const hasUntranslated = text => (text.match(/[A-Za-z][A-Za-z0-9_']*/g) || []).some(word => !allowed.has(word));
  for (const domain of [...domains, ...Object.keys(payload.contexts || {}).map(scope => `@${scope}`)]) {
    const entries = domain.startsWith('@') ? payload.contexts[domain.slice(1)] : payload[domain];
    if (!entries || typeof entries !== 'object') throw new Error(`语言包缺少语境：${domain}`);
    const exact = new Map(), blocked = new Set();
    for (const [raw, translated] of Object.entries(entries)) {
      const source = comparable(raw), key = source.toLowerCase();
      if (!blocked.has(key)) {
        if (exact.has(key) && exact.get(key) !== translated) { exact.delete(key); blocked.add(key); }
        else exact.set(key, translated);
      }
      if (raw.includes('\n')) wrapped.push(compileTemplate(comparable(raw.split('\n')[0]), domain === 'stats').expression);
      if (!/\{\d+(?::[^}]+)?\}/.test(source)) continue;
      const words = source.match(/[A-Za-z]{3,}/g) || [];
      const anchor = words.sort((a, b) => b.length - a.length)[0]?.toLowerCase();
      if (!anchor) continue;
      const candidates = templates.get(`${domain}:${anchor}`) || [];
      const entry = { source, translated, literals: source.split(/\{\d+(?::[^}]+)?\}/).filter(Boolean).map(text => text.toLowerCase()),
        numericOnly: ['stats', '@item-display', '@passive', '@skill'].includes(domain) };
      candidates.push(entry);
      templates.set(`${domain}:${anchor}`, candidates);
      if (raw.includes('\n')) {
        const multiline = wrappedTemplates.get(`${domain}:${anchor}`) || [];
        multiline.push(entry);
        wrappedTemplates.set(`${domain}:${anchor}`, multiline);
      }
    }
    indexes.set(domain, exact);
  }
  const remember = (source, context, reason) => {
    if (!hasUntranslated(source)) return;
    const key = JSON.stringify([context, source]);
    if (missing.size < 8192 && !missing.has(key)) missing.set(key, { locale: payload.locale, revision: payload.revision, source, context, reason });
  };
  function known(value, selected = domains, entity) {
    const source = comparable(value);
    if (entity) {
      const key = JSON.stringify([entity.table, entity.id, entity.field, entity.element || 0]);
      const entry = payload.entities?.[key];
      if (entry && comparable(payload.entitySources?.[key]) === source) return entry;
      remember(source, { entity }, entry ? 'entity-original-mismatch' : 'missing-entity');
      return undefined;
    }
    for (const domain of selected) {
      const exact = indexes.get(domain)?.get(source.toLowerCase());
      if (exact) return exact;
    }
    return undefined;
  }
  function template(value, selected, multilineOnly = false) {
    const lower = value.toLowerCase();
    const available = multilineOnly ? wrappedTemplates : templates;
    for (const domain of selected) {
      const candidates = new Set();
      for (const word of value.match(/[A-Za-z]{3,}/g) || []) {
        for (const entry of available.get(`${domain}:${word.toLowerCase()}`) || []) candidates.add(entry);
      }
      const results = new Set();
      for (const entry of candidates) {
        if (entry.literals.some(literal => !lower.includes(literal))) continue;
        if (!entry.expression) Object.assign(entry, compileTemplate(entry.source, entry.numericOnly));
        const match = entry.expression.exec(value);
        if (!match) continue;
        const translated = applyTemplate(entry, match, value => known(value, selected));
        if (translated) results.add(translated);
      }
      if (results.size > 1) { remember(value, { domains: selected }, 'ambiguous-template'); return undefined; }
      if (results.size === 1) return [...results][0];
    }
    return undefined;
  }
  function translate(value, context = {}, depth = 0) {
    const source = normalizeTranslationText(value);
    if (!source) return '';
    const selected = selectedDomains(context, source);
    const key = JSON.stringify([selected, context.entity, /\(replacing /i.test(source) ? context.item : undefined, source]);
    if (cache.has(key)) return cache.get(key);
    let result = known(source, selected, context.entity);
    if (!result && !context.entity && /[:?]$/.test(source)) {
      const label = known(source.slice(0, -1), selected);
      if (label) result = label + source.slice(-1);
    }
    if (!result && !context.entity) result = template(comparable(source), selected);
    if (!result && !context.entity && depth < 3) {
      let candidate = source;
      const preservedNames = [];
      for (const rule of rules) {
        if (rule.scope && rule.scope !== context.scope) continue;
        rule.expression.lastIndex = 0;
        candidate = candidate.replace(rule.expression, (...args) => {
          const values = args.slice(1, -2);
          for (const [id, domain] of Object.entries(rule.parameters || {})) {
            const index = Number(id) - 1;
            if (values[index] === undefined) continue;
            if (domain === 'comparison-stat') {
              if (!payload.comparisonLabels?.includes(values[index])) return args[0];
              const label = translate(values[index], { scope: 'pob' }, depth + 1);
              if (hasUntranslated(label)) return args[0];
              values[index] = label;
              continue;
            }
            if (domain === 'item-name') {
              const item = context.item;
              const original = values[index];
              values[index] = original.split(',').map(part => {
                const name = part.trim();
                if (item?.crafted && name === item.title) { preservedNames.push(name); return name; }
                const translated = known(name, ['items']) || (item ? itemName(name, item.rarity, item.base) : undefined);
                if (translated) return translated;
                remember(name, { scope: 'item-display' }, 'unmatched-item-name');
                preservedNames.push(name);
                return name;
              }).join(', ');
              continue;
            }
            values[index] = translate(values[index], { domains: domain === 'items' || domain === 'item-type' ? ['items'] : domains, scope: domain === 'item-type' ? 'item-type' : context.scope, ...(context.item ? { item: context.item } : {}) }, depth + 1);
          }
          return rule.replacement.replace(/\$(\d+)/g, (_, id) => values[Number(id) - 1] ?? '');
        });
      }
      const checked = preservedNames.reduce((text, name) => text.replaceAll(name, ''), candidate);
      if (candidate !== source && !hasUntranslated(checked)) result = candidate;
      if (!result && source.includes('\n')) {
        const translated = source.split('\n').map(line => translate(line, context, depth + 1)).join('\n');
        if (translated !== source) result = translated;
      }
    }
    if (!result) { result = source; remember(source, context, 'unmatched'); }
    if (cache.size >= 8192) cache.delete(cache.keys().next().value);
    cache.set(key, result);
    return result;
  }
  const whole = (value, context = {}, multilineOnly = false) => {
    const selected = selectedDomains(context, value);
    const key = JSON.stringify([selected, context.entity, multilineOnly, comparable(value)]);
    if (wholeCache.has(key)) return wholeCache.get(key);
    const result = known(value, selected, context.entity) || (!context.entity ? template(comparable(value), selected, multilineOnly) : undefined);
    // 合并候选包含大量重复的未命中；只缓存显示匹配，不缓存官方计算。
    if (wholeCache.size >= 8192) wholeCache.delete(wholeCache.keys().next().value);
    wholeCache.set(key, result);
    return result;
  };
  function selectedDomains(context, value) {
    const selected = context.scope ? [`@${context.scope}`, ...(context.domains || domains)] : context.domains || domains;
    if (context.scope !== 'item-display' || !context.item?.base) return selected;
    const item = context.item, scopes = payload.itemScopes;
    const specific = ['UNIQUE', 'RELIC'].includes(item.rarity) ? (scopes?.uniques?.[JSON.stringify([item.title, item.base])] || [])
      .filter(scope => indexes.get('@' + scope)?.has(comparable(value).toLowerCase())) : [];
    return [...specific, ...(scopes?.bases?.[item.base] || [])].map(scope => '@' + scope).concat(selected, '@item-type');
  }
  let nameParts;
  function itemName(value, rarity, base) {
    if (!['RARE', 'MAGIC'].includes(rarity)) return undefined;
    if (!nameParts) {
      nameParts = { prefix: new Map(), suffix: new Map(), mods: new Map() };
      for (const [key, translated] of Object.entries(payload.entities || {})) {
        const [table, , field] = JSON.parse(key);
        const source = payload.entitySources[key];
        const role = payload.entityContexts?.[key]?.nameRole;
        // 只组合原生物品命名角色，怪物和宝箱的同名词项不混入物品名称。
        const group = table === 'Words' && field === 'Text2' && ['prefix', 'suffix'].includes(role) ? role : table === 'Mods' && field === 'Name' ? 'mods' : undefined;
        if (!group || !source) continue;
        const entries = nameParts[group];
        if (!entries.has(source)) entries.set(source, translated);
        else if (entries.get(source) !== translated) entries.set(source, null);
      }
    }
    if (rarity === 'RARE') {
      const matches = new Set();
      for (const match of value.matchAll(/ /g)) {
        const prefix = nameParts.prefix.get(value.slice(0, match.index));
        const suffix = nameParts.suffix.get(value.slice(match.index + 1));
        if (prefix && suffix) matches.add(`${prefix} ${suffix}`);
      }
      return matches.size === 1 ? [...matches][0] : undefined;
    }
    if (!base) return undefined;
    const offset = value.indexOf(base);
    if (offset < 0 || value.indexOf(base, offset + base.length) >= 0) return undefined;
    const prefix = value.slice(0, offset).trim(), suffix = value.slice(offset + base.length).trim();
    if (!prefix && !suffix) return known(base, ['items']);
    const parts = [known(base, ['items']), prefix ? nameParts.mods.get(prefix) : '', suffix ? nameParts.mods.get(suffix) : ''];
    if (!parts[0] || prefix && !parts[1] || suffix && !parts[2]) return undefined;
    const id = prefix && suffix ? 'MagicNamePrefixSuffix' : prefix ? 'MagicNamePrefix' : 'MagicNameSuffix';
    const original = prefix && suffix ? '{1} {0} {2}' : prefix ? '{1} {0}' : '{0} {1}';
    const key = JSON.stringify(['ClientStrings', id, 'Text', 0]);
    if (payload.entities?.[key] && payload.entitySources?.[key] !== original) return undefined;
    const format = payload.entities?.[key] || original;
    const values = prefix ? parts : [parts[0], parts[2]];
    return format.replace(placeholder, (_, id) => values[Number(id)] ?? '');
  }
  function startsWrapped(value) {
    const source = comparable(value);
    if (wrappedCache.has(source)) return wrappedCache.get(source);
    const result = wrapped.some(expression => expression.test(source));
    // 与语言包实例同生共灭；未命中也缓存，避免每次显示重复扫描全部多行模板。
    if (wrappedCache.size >= 8192) wrappedCache.delete(wrappedCache.keys().next().value);
    wrappedCache.set(source, result);
    return result;
  }
  return { known, translate, whole, hasUntranslated, startsWrapped,
    itemName,
    missing: () => [...missing.values()], clearMissing: () => missing.clear(), locale: payload.locale, revision: payload.revision };
}
