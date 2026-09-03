import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('../../web/node_modules/typescript');
const contractPath = new URL('../../web/src/stores/importContract.ts', import.meta.url);

async function loadContract() {
  const source = await readFile(contractPath, 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(javascript, { exports: module.exports, module });
  return module.exports;
}

test('import contract preserves the structured bridge error for the modal', async () => {
  const { resolveImportOutcome } = await loadContract();
  const outcome = resolveImportOutcome(true, {
    success: false,
    error: { code: 'POB_IMPORT_PROJECTION_UNSUPPORTED', message: 'multiple item sets are not supported' },
  });
  assert.equal(outcome.success, false);
  assert.equal(outcome.error.code, 'POB_IMPORT_PROJECTION_UNSUPPORTED');
  assert.equal(outcome.error.message, 'multiple item sets are not supported');
});

test('import contract refuses a successful response without an applicable data projection', async () => {
  const { resolveImportOutcome } = await loadContract();
  const outcome = resolveImportOutcome(true, { success: true, output: { Life: 1 } });
  assert.equal(outcome.success, false);
  assert.equal(outcome.error.code, 'POB_IMPORT_CONTRACT_INVALID');
  assert.equal(outcome.error.message, 'PoB 核心未返回可应用的导入数据。');
});
