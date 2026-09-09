import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { parseArgs } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
async function statFiles(directory) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await statFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.lua')) paths.push(relative(join(root, 'src'), path).replaceAll('\\', '/'));
  }
  return paths.sort();
}

export async function exportTranslationCorpus({ lua, output }) {
  if (!lua || !output) throw new Error('必须提供 --lua 和 --output');
  const session = await mkdtemp(join(tmpdir(), 'pob-translation-corpus-'));
  await mkdir(join(session, 'files'));
  await mkdir(join(session, 'Builds'));
  const paths = await statFiles(join(root, 'src/Data/StatDescriptions'));
  const list = join(session, 'source-files.json');
  await writeFile(list, JSON.stringify(paths));
  const result = spawnSync(resolve(lua), ['-'], {
    cwd: join(root, 'src'), input: "dofile('../cn/pipeline/lua/translation-corpus.lua')", encoding: 'utf8', windowsHide: true,
    env: { ...process.env, LUA_PATH: '../runtime/lua/?.lua;../runtime/lua/?/init.lua;;', POB_CN_SESSION_DIR: session, POB_CN_TRANSLATION_FILES: list },
    timeout: 1200000, maxBuffer: 128 * 1024 * 1024,
  });
  const start = result.stdout?.indexOf('TRANSLATION_CORPUS:');
  if (result.error || result.status !== 0 || start < 0) throw new Error(`官方核心语料导出失败：${result.error?.message || result.stderr || result.stdout}`);
  const corpus = JSON.parse(result.stdout.slice(start + 'TRANSLATION_CORPUS:'.length));
  // 补采未挂在 CalcSections 声明上的明细文本。原始格式串单列为内部格式，
  // 实际展开结果由上面的隔离流派投影采集，不能把格式串命中算作页面翻译成功。
  const breakdownSources = ['src/Classes/CalcBreakdownControl.lua', 'src/Modules/CalcBreakdown.lua', 'src/Modules/CalcOffence.lua', 'src/Modules/CalcDefence.lua'];
  for (const path of breakdownSources) {
    const source = await readFile(join(root, path), 'utf8');
    for (const [index, line] of source.split(/\r?\n/).entries()) {
      if (!/label\s*=|s_format\(|t_insert\(breakdown|breakdown\.[\w.]+\s*=/.test(line)) continue;
      for (const match of line.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
        const text = match[1].replace(/\\([nrt"\\])/g, (_, character) => ({ n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\' })[character]);
        if (/[A-Za-z]/.test(text)) corpus.rows.push({ category: 'calc_format', id: `${path}:${index + 1}:${match.index}`, field: 'text', text });
      }
    }
  }
  corpus.rows.sort((a, b) => [a.category, a.id, a.field].join('\0').localeCompare([b.category, b.id, b.field].join('\0'), 'en'));
  corpus.upstream_commit = JSON.parse(await readFile(join(root, 'cn/config/version-lock.json'))).upstream.commit;
  corpus.sources = [];
  const sourcePaths = [...await statFiles(join(root, 'src/Data')), ...await statFiles(join(root, 'src/TreeData'))].map(path => `src/${path}`);
  sourcePaths.push('src/Modules/ConfigOptions.lua', 'src/Modules/CalcSections.lua', 'src/Modules/BuildDisplayStats.lua', ...breakdownSources);
  sourcePaths.push('src/Classes/ItemsTab.lua', 'src/Classes/Item.lua');
  const collectors = ['cn/pipeline/export-translation-corpus.mjs', 'cn/pipeline/lua/translation-corpus.lua', 'cn/pipeline/lua/translation-breakdown.lua'];
  corpus.collectors = [];
  for (const path of collectors) corpus.collectors.push({ path, sha256: createHash('sha256').update(await readFile(join(root, path))).digest('hex') });
  for (const path of sourcePaths) corpus.sources.push({ path, sha256: createHash('sha256').update(await readFile(join(root, path))).digest('hex') });
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(resolve(output), gzipSync(Buffer.from(`${JSON.stringify(corpus)}\n`), { level: 9 }));
  return { rows: corpus.rows.length, stat_forms: corpus.stats.length, deferred: corpus.deferred, diagnostics: session };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { lua: { type: 'string' }, output: { type: 'string' } } });
  exportTranslationCorpus(values).then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
}
