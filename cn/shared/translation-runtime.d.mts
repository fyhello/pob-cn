export type TranslationDomain = 'items' | 'stats' | 'tooltip' | 'ui' | 'terms';
export type TranslationEntity = { table: string; id: string; field: string; element?: number };
export type TranslationItem = { name?: string; title?: string; base?: string; rarity?: string; crafted?: boolean };
export type TranslationContext = { domains?: TranslationDomain[]; entity?: TranslationEntity; scope?: 'item-type' | 'item-display' | 'item-variant' | 'passive' | 'skill' | 'pob'; item?: TranslationItem };
export function normalizeTranslationText(value: unknown): string;
export function createTranslationRuntime(payload: unknown): {
  known(value: string, domains?: TranslationDomain[], entity?: TranslationEntity): string | undefined;
  translate(value: string, context?: TranslationContext): string;
  whole(value: string, context?: TranslationContext, multilineOnly?: boolean): string | undefined;
  itemName(value: string, rarity: string, base?: string): string | undefined;
  hasUntranslated(value: string): boolean;
  startsWrapped(value: string): boolean;
  missing(): Record<string, unknown>[];
  clearMissing(): void;
  locale: string;
  revision: string;
};
