import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const modulePath = new URL('../../web/src/utils/webTranslation.ts', import.meta.url);
const moduleRequire = createRequire(modulePath);
const ts = moduleRequire('typescript');

export async function loadLocalizer() {
  const source = await readFile(modulePath, 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(javascript, { exports: module.exports, module, require: moduleRequire });
  return module.exports;
}
