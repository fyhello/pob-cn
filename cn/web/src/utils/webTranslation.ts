import { shallowRef } from 'vue';
import { cleanItemText, itemLinePrefix, localizeItemLines, localizeItemRows } from '../../../shared/item-translation.mjs';
import translationPayload from '../../../generated/web-data/translations.json';
import { createTranslationRuntime, normalizeTranslationText, type TranslationContext, type TranslationDomain } from '../../../shared/translation-runtime.mjs';

export type TranslationLocale = 'zh-CN' | 'zh-TW';
export type WebTranslationContext = TranslationContext & { locale?: TranslationLocale; items?: NonNullable<TranslationContext['item']>[] };
export type LocalizedWebItemLine = { raw: string; translated: string };

const localeState = shallowRef<TranslationLocale>('zh-CN');
const runtimes = new Map<TranslationLocale, ReturnType<typeof createTranslationRuntime>>();
const loading = new Map<TranslationLocale, Promise<void>>();
const genericDomains: TranslationDomain[] = ['terms', 'ui', 'items', 'stats', 'tooltip'];
const nameDomains: TranslationDomain[] = ['items', 'terms'];
const lineDomains: TranslationDomain[] = ['stats', 'tooltip', 'terms', 'ui', 'items'];
let localeRequest = 0;

// 同语言的索引随包版本创建；初次打开不解析繁中包。
function runtime(locale = localeState.value) {
  let current = runtimes.get(locale);
  if (!current && locale === 'zh-CN') {
    current = createTranslationRuntime(translationPayload);
    runtimes.set(locale, current);
  }
  if (!current) throw new Error('语言包尚未加载：' + locale);
  return current;
}

export function getTranslationLocale(): TranslationLocale { return localeState.value; }

export async function loadTranslationLocale(locale: TranslationLocale): Promise<void> {
  if (!['zh-CN', 'zh-TW'].includes(locale)) throw new Error('不支持的显示语言：' + locale);
  if (locale === 'zh-CN') { runtime(locale); return; }
  if (runtimes.has(locale)) return;
  if (!loading.has(locale)) {
    const request = import('../../../generated/web-data/translations.zh-TW.json')
      .then(module => { runtimes.set(locale, createTranslationRuntime(module.default)); })
      .finally(() => { loading.delete(locale); });
    loading.set(locale, request);
  }
  await loading.get(locale);
}

export async function setTranslationLocale(locale: TranslationLocale): Promise<void> {
  const request = ++localeRequest;
  await loadTranslationLocale(locale);
  if (request === localeRequest) localeState.value = locale;
}

export function getMissingTranslations(locale = localeState.value) { return runtime(locale).missing(); }
export function clearMissingTranslations(locale = localeState.value) { runtime(locale).clearMissing(); }

export function translateKnownTerm(value: string, domains: TranslationDomain[] = genericDomains, context: WebTranslationContext = {}): string | undefined {
  return runtime(context.locale).known(value, context.domains || domains, context.entity);
}

export function translateWebText(value: string, context: WebTranslationContext = {}): string {
  const { locale, item, items, ...options } = context;
  const replacing = value?.match(/\(replacing (.+)\)/i)?.[1];
  const referencedItem = replacing ? (items || [item]).find(candidate => candidate && (candidate.name === replacing || `${candidate.title}, ${candidate.base}` === replacing)) : undefined;
  // 缓存仅含本行实际引用的物品身份，不把整份物品库序列化到每一条翻译键中。
  return runtime(locale).translate(value, { ...options, ...(referencedItem ? { item: {
    name: referencedItem.name, title: referencedItem.title, base: referencedItem.base, rarity: referencedItem.rarity, crafted: referencedItem.crafted,
  } } : options.scope === 'item-display' && item?.base ? { item: { title: item.title, base: item.base, rarity: item.rarity } } : {}) });
}

export function translateSourceType(sourceType?: string): string {
  return sourceType ? translateWebText(sourceType) : '';
}

export function translateWebItemName(value: string, context: WebTranslationContext = {}): string {
  const source = normalizeTranslationText(value);
  if (context.item?.rarity === 'RARE' && context.item.crafted && context.item.title === source) return source;
  const options = { ...context, domains: context.domains || nameDomains };
  const direct = translateKnownTerm(source, nameDomains, options);
  if (direct) return direct;
  if (context.entity) return source;
  const gemLevel = source.match(/^(.+?)\s+(\d+\/\d+)$/);
  if (gemLevel) return translateWebItemName(gemLevel[1], context) + ' ' + gemLevel[2];
  if (source.includes(',')) return source.split(',').map(part => translateWebItemName(part.trim(), context)).join(', ');
  if (context.item?.rarity) {
    const composed = runtime(context.locale).itemName(source, context.item.rarity, context.item.base);
    if (composed) return composed;
  }
  return translateWebText(source, options);
}

export function translateWebItemType(value: string, context: WebTranslationContext = {}): string {
  return translateWebText(value, { ...context, domains: nameDomains, scope: 'item-type' });
}

export function translateRuneName(value: string, context: WebTranslationContext = {}): string {
  return translateWebItemName(value, context);
}

const cleanItemLine = cleanItemText;

export function translateWebItemLine(value: string, context: WebTranslationContext = {}): string {
  const cleaned = cleanItemLine(value);
  if (context.item && [context.item.name, context.item.title, context.item.base].includes(cleaned)) return translateWebItemName(cleaned, context);
  const prefix = itemLinePrefix(cleaned);
  const options = { scope: 'item-display' as const, ...context, domains: context.domains || lineDomains };
  if (prefix) return translateWebText(prefix.label, options) + '：' + translateWebText(prefix.content, options);
  return translateWebText(cleaned, options);
}

export function translateCalcFormulaLine(value: string, context: WebTranslationContext = {}): string {
  const source = normalizeTranslationText(value);
  const item = source.match(/^Item:(?:\d+:)?(.+)$/);
  if (item) return translateWebItemName(item[1], context);
  const skill = source.match(/^Skill:\s*(.+)$/);
  if (skill) return translateWebItemName(skill[1], context);
  return translateWebText(source, { ...context, scope: 'pob' });
}

export function translateCalcCell(value: unknown, key: string, items: Record<string, any>[] = []): string {
  // Lua 明细表将 false/nil 当作空单元格；0 仍是有效的官方结果。
  if (value === false || value == null) return '';
  if (['sourceLabel', 'sourceName', 'skillName', 'name'].includes(key)) {
    const item = items.find(item => value === item.name || value === `${item.title}, ${item.base}`);
    return translateWebItemName(String(value), { item });
  }
  return translateCalcFormulaLine(String(value));
}

export function translateCalcSourceName(source: { sourceName?: string; source?: string; sourceType?: string }, item?: Record<string, any>): string {
  const raw = source.sourceName || source.source || '';
  return ['Item', 'Jewel', 'Skill'].includes(source.sourceType || '')
    ? translateWebItemName(raw, { item }) : translateCalcFormulaLine(raw);
}

export function translateVariantName(value: string, context: WebTranslationContext = {}): string {
  return translateWebItemLine(value, { ...context, scope: 'item-variant' });
}

export function localizeWebItemLines(rawLines: string[], context: WebTranslationContext = {}): LocalizedWebItemLine[] {
  return localizeItemLines(runtime(context.locale), rawLines, { scope: 'item-display', ...context, domains: lineDomains }, raw => translateWebItemLine(raw, context));
}

export function translateWebItemLines(rawLines: string[], context: WebTranslationContext = {}): string[] {
  return localizeWebItemLines(rawLines, context).map(line => line.translated);
}

export function localizeWebItemRows(rawLines: string[], unsupported: boolean[] = [], context: WebTranslationContext = {}) {
  return localizeItemRows(runtime(context.locale), rawLines, unsupported, { scope: 'item-display', ...context, domains: lineDomains }, raw => translateWebItemLine(raw, context));
}

function asRecord(value: unknown): Record<string, any> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : undefined;
}

// 只生成显示 getter，不改变源字段；Vue 读取时订阅语言，不触发核心事务。
function displayFields<T extends Record<string, any>>(value: T, fields: Record<string, () => unknown>): T {
  for (const [key, get] of Object.entries(fields)) Object.defineProperty(value, key, { enumerable: true, configurable: true, get });
  return value;
}

export function localizeImportedItem(value: unknown): Record<string, any> {
  const item = asRecord(value);
  if (!item) return value as Record<string, any>;
  const official = Array.isArray(item.displayLines);
  const source = official ? item.displayLines : Array.isArray(item.rawLines) ? item.rawLines : Array.isArray(item.lines) ? item.lines : [];
  // 先把正文和支持状态按官方行号配对，再筛选，避免空行导致标记错位。
  const rows = source.map((line: unknown, index: number) => ({ line, unsupported: official && item.displayLineUnsupported?.[index] === true }))
    .filter((row: { line: unknown }) => typeof row.line === 'string');
  const rawLines = rows.map((row: { line: string }) => row.line);
  const result: Record<string, any> = { ...item, rawLines: Array.isArray(item.rawLines) ? item.rawLines : rawLines, lines: Array.isArray(item.lines) ? item.lines : rawLines };
  return displayFields(result, {
    name_cn: () => translateWebItemName(result.name, { item: result }),
    base_cn: () => translateWebItemName(result.base),
    displayRows: () => localizeWebItemRows(rawLines, rows.map((row: { unsupported: boolean }) => row.unsupported), { item: result }),
    lines_cn: () => result.displayRows.map((row: LocalizedWebItemLine) => row.translated),
  });
}

export function localizeImportedGem(value: unknown): Record<string, any> {
  const gem = asRecord(value);
  if (!gem) return value as Record<string, any>;
  const result = { ...gem };
  return displayFields(result, { name_cn: () => translateWebItemName(result.name || result.nameSpec || '', result.gameId
    ? { entity: { table: 'BaseItemTypes', id: result.gameId, field: 'Name' } } : {}) });
}

export function localizePassiveNode<T extends Record<string, any>>(value: T): T {
  const result = { ...value };
  return displayFields(result, {
    name_cn: () => translateWebText(result.name, { domains: ['terms'], scope: 'passive' }),
    type_cn: () => translateSourceType(result.type),
    stats_cn: () => translateWebItemLines(result.stats || [], { scope: 'passive' }),
  });
}

export function localizeImportedSocketGroups(value: unknown): Record<string, any>[] {
  if (!Array.isArray(value)) return [];
  return value.map(group => {
    const source = asRecord(group);
    if (!source) return group as Record<string, any>;
    const result: Record<string, any> = { ...source, gems: Array.isArray(source.gems) ? source.gems.map(localizeImportedGem) : source.gems };
    return displayFields(result, { label_cn: () => translateWebItemName(result.label || result.displayLabel || '') });
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
  const itemsById = new Map(itemLibrary.filter(item => item.id !== undefined && item.id !== null).map(item => [String(item.id), item]));
  const localizeItemMap = (items: unknown) => {
    const source = asRecord(items);
    return source ? Object.fromEntries(Object.entries(source).map(([key, item]) => [key, localizeItemRecord(item, itemsById)])) : items;
  };
  return { ...value, itemLibrary, equippedItems: localizeItemMap(value.equippedItems),
    socketedJewels: localizeItemMap(value.socketedJewels), socketGroups: localizeImportedSocketGroups(value.socketGroups) };
}
