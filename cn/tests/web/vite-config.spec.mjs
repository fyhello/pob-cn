import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const directory = fileURLToPath(new URL('../../web/', import.meta.url));
const source = ts.transpileModule(await readFile(new URL('../../web/vite.config.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

test('前端代理遵循环境变量、本机配置、默认值优先级，业务与健康检查使用同一目标', () => {
  for (const [environment, local, expected] of [
    [{}, {}, 'http://127.0.0.1:3002'],
    [{}, { POB_CN_BRIDGE_TARGET: 'http://127.0.0.1:3004' }, 'http://127.0.0.1:3004'],
    [{ POB_CN_BRIDGE_TARGET: 'http://127.0.0.1:3999' }, { POB_CN_BRIDGE_TARGET: 'http://127.0.0.1:3004' }, 'http://127.0.0.1:3999'],
  ]) {
    const module = { exports: {} };
    vm.runInNewContext(source, {
      exports: module.exports, module, __dirname: directory, process: { env: environment },
      require: id => {
        if (id === '@vitejs/plugin-vue') return () => ({});
        if (id === 'vite') return {
          defineConfig: value => value,
          loadEnv: (mode, root, prefix) => {
            assert.equal(mode, 'development');
            assert.equal(root, directory);
            assert.equal(prefix, 'POB_CN_');
            return local;
          },
        };
        return require(id);
      },
    });
    const config = module.exports.default({ mode: 'development' });
    assert.equal(config.server.proxy['/api'], expected);
    assert.equal(config.server.proxy['/health'], expected);
  }
});
