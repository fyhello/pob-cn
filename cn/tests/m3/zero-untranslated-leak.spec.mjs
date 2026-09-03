import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function getAllFiles(dir, exts = ['.vue']) {
  let results = [];
  const list = readdirSync(dir);
  for (const file of list) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist' && file !== '.git') {
        results = results.concat(getAllFiles(filePath, exts));
      }
    } else {
      if (exts.some(ext => file.endsWith(ext))) {
        results.push(filePath);
      }
    }
  }
  return results;
}

describe('Zero Untranslated English Gate', () => {
  const knownLegal = new Set([
    'DPS', 'PvP', 'MH', 'OH', 'EHP', 'DoT', 'PoB', 'XML', 'ID', 'UI', 'OK', 'API', 'VS', 'VS.',
    'NextGen'
  ]);

  it('All Vue templates contain zero un-translated English brackets or phrases', () => {
    const files = getAllFiles('cn/web/src');
    const leaks = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const tm = content.match(/<template>([\s\S]*?)<\/template>/);
      if (!tm) continue;

      const template = tm[1];
      const textMatches = template.matchAll(/>([^<>{}\n]+)</g);
      for (const m of textMatches) {
        const text = m[1].trim();
        if (!text) continue;
        const words = text.replace(/[^a-zA-Z]/g, ' ').split(/\s+/).filter(w => w.length >= 2 && !knownLegal.has(w));
        if (words.length > 0 && !text.includes('lucide') && !text.includes('font-')) {
          leaks.push({ file, text, words });
        }
      }
    }

    assert.strictEqual(leaks.length, 0, `Found untranslated English in templates: ${JSON.stringify(leaks, null, 2)}`);
  });
});
