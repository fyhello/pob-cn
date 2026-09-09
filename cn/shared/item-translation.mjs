import { normalizeTranslationText } from './translation-runtime.mjs';

export function cleanItemText(value) {
  return normalizeTranslationText(value).replace(/\{(?:corrupted|enchant|rune|tags:[^}]+|variant:[^}]+|range:[^}]+)\}/gi, '')
    .replace(/\(Not supported in PoB yet\)/gi, '').trim();
}

export function itemLinePrefix(value) {
  const match = value.match(/^(Runes?|Bonded):\s*([\s\S]+)$/i);
  return match ? { label: /^runes?$/i.test(match[1]) ? 'Runes' : match[1], content: match[2] } : undefined;
}

export function localizeItemLines(current, rawLines, context = {}, translateLine) {
  const result = [], options = { scope: 'item-display', ...context };
  const single = translateLine || (raw => {
    const value = cleanItemText(raw), prefix = itemLinePrefix(value);
    return prefix ? current.translate(prefix.label, options) + '：' + current.translate(prefix.content, options) : current.translate(value, options);
  });
  for (let index = 0; index < rawLines.length; index++) {
    let raw = rawLines[index], combined;
    const first = cleanItemText(raw), prefix = itemLinePrefix(first);
    if (current.startsWrapped(prefix?.content || first)) {
      let candidate = raw;
      for (let next = index + 1; next < Math.min(rawLines.length, index + 8); next++) {
        const line = prefix ? itemLinePrefix(cleanItemText(rawLines[next]))?.content || rawLines[next] : rawLines[next];
        candidate += '\n' + line;
        const cleaned = cleanItemText(candidate);
        const translated = current.whole(itemLinePrefix(cleaned)?.content || cleaned, options, true);
        if (!translated) continue;
        combined = prefix ? current.translate(prefix.label, options) + '：' + translated : translated;
        raw = rawLines.slice(index, next + 1).join('\n'); index = next; break;
      }
    }
    result.push({ raw, translated: combined || single(raw) });
  }
  return result;
}

export function localizeItemRows(current, rawLines, unsupported = [], context = {}, translateLine) {
  const groups = [];
  rawLines.forEach((line, index) => {
    const inactive = unsupported[index] === true, previous = groups.at(-1);
    if (previous && previous.unsupported === inactive) previous.lines.push(line);
    else groups.push({ lines: [line], unsupported: inactive });
  });
  return groups.flatMap(group => localizeItemLines(current, group.lines, context, translateLine).map(line => ({ ...line, unsupported: group.unsupported })));
}
