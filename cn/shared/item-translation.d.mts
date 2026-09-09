import type { createTranslationRuntime, TranslationContext } from './translation-runtime.mjs';
type Runtime = ReturnType<typeof createTranslationRuntime>;
export function cleanItemText(value: string): string;
export function itemLinePrefix(value: string): { label: string; content: string } | undefined;
export function localizeItemLines(current: Runtime, lines: string[], context?: TranslationContext, translateLine?: (raw: string) => string): Array<{ raw: string; translated: string }>;
export function localizeItemRows(current: Runtime, lines: string[], unsupported?: boolean[], context?: TranslationContext, translateLine?: (raw: string) => string): Array<{ raw: string; translated: string; unsupported: boolean }>;
