import type { LocalizedWebItemLine } from './webTranslation';

type ItemRow = LocalizedWebItemLine & { unsupported?: boolean };
type PresentationContext = {
  item?: { corrupted?: boolean; doubleCorrupted?: boolean };
  tooltip?: boolean;
};
type LineKind = 'content' | 'corrupted' | 'comparison-heading' | 'comparison-actor' | 'positive' | 'negative';

const classes: Record<LineKind, string> = {
  content: '',
  corrupted: 'text-[#dd0022] font-semibold',
  'comparison-heading': 'border-t border-white/15 pt-2 mt-2 text-gray-300 font-semibold',
  'comparison-actor': 'text-gray-300 font-semibold',
  positive: 'text-green-400',
  negative: 'text-red-400',
};

const desktopHints = new Set([
  'Tip: Hold Shift to display a tooltip for the granted skill.',
  'Tip: Hold Shift to display a tooltip for the granted skills.',
  'Tip: Shift to display a tooltip for the granted Skill.',
  'Tip: Press Ctrl+D to enable the display of stat differences.',
  'Tip: Press Ctrl+D to disable the display of stat differences.',
]);
const comparisonHeading = /^(?:(?:Equipping this item in|Removing this item from) .+|(?:Activating|Deactivating) this (?:flask|charm)) will give you:$/i;

// 在翻译合并多行之后只附加显示语义，保留官方文本、数值和不生效状态的对应关系。
export function presentItemRows(rows: readonly ItemRow[], context: PresentationContext = {}) {
  let comparing = false;
  const result: (ItemRow & { kind: LineKind; presentationClass: string })[] = [];
  for (const [index, row] of rows.entries()) {
    const raw = row.raw.trim();
    if (context.tooltip && !row.unsupported && desktopHints.has(raw)) continue;

    let kind: LineKind = 'content';
    if (context.tooltip && !row.unsupported && comparisonHeading.test(raw.split('\n')[0].trim())) {
      kind = 'comparison-heading';
      comparing = true;
    } else if (comparing && !row.unsupported && /^(?:Player|Minion):$/i.test(raw)) {
      kind = 'comparison-actor';
    } else if (comparing && !row.unsupported && /^[+-]\d/.test(raw)) {
      kind = raw.startsWith('+') ? 'positive' : 'negative';
    } else {
      comparing = false;
      // 完整 displayLines 含用户标题；只有末尾状态行可以是腐化标签。
      const statusPosition = context.tooltip || index === rows.length - 1;
      const corruptionLabel = context.item?.doubleCorrupted ? 'Twice Corrupted'
        : context.item?.corrupted ? 'Corrupted' : undefined;
      if (statusPosition && !row.unsupported && raw === corruptionLabel) kind = 'corrupted';
    }
    result.push({ ...row, kind, presentationClass: classes[kind] });
  }
  return result;
}
