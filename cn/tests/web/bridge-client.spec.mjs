import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = ts.transpileModule(await readFile(new URL('../../web/src/api/bridgeClient.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function client(fetch) {
  const module = { exports: {} };
  vm.runInNewContext(source, { exports: module.exports, module, fetch, Error, Object });
  return module.exports;
}

function response(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

test('创建会话只发一次请求并返回后端会话 ID', async () => {
  const calls = [];
  const api = client(async (path, init) => {
    calls.push({ path, method: init.method, body: init.body });
    return response(201, { success: true, sessionId: 'server-session' });
  });
  assert.equal(await api.createBuildSession(), 'server-session');
  assert.deepEqual(calls, [{ path: '/api/sessions', method: 'POST', body: '{}' }]);
});

for (const status of [404, 405]) test(`旧后端或错误代理明确报告接口不匹配：HTTP ${status}`, async () => {
  for (const body of [JSON.stringify({ success: false, error: 'route not found' }), '<html>Not Found</html>']) {
    const api = client(async () => new Response(body, { status }));
    await assert.rejects(api.createBuildSession(), error => {
      assert.match(error.message, /后端不支持独立计算会话/);
      assert.ok(error.message.includes(`POST /api/sessions，HTTP ${status}`));
      return true;
    });
  }
});

test('保留后端字符串和结构化错误，附带接口和 HTTP 状态', async () => {
  for (const error of ['核心启动失败', { code: 'POB_SESSION_LIMIT', message: '已达到会话上限' }]) {
    const api = client(async () => response(503, { success: false, error }));
    const expected = typeof error === 'string' ? error : error.message;
    await assert.rejects(api.createBuildSession(), failure => {
      assert.ok(failure.message.includes(expected));
      assert.ok(failure.message.includes('HTTP 503'));
      return true;
    });
  }
});

test('非 JSON 响应保留解析原因并显示接口上下文', async () => {
  for (const status of [200, 502]) {
    const api = client(async () => new Response('<html>Bad Gateway</html>', { status }));
    await assert.rejects(api.createBuildSession(), error => {
      assert.match(error.message, /无效的 JSON 响应/);
      assert.ok(error.message.includes(`HTTP ${status}`));
      assert.equal(error.cause.name, 'SyntaxError');
      return true;
    });
  }
});

test('无效成功响应不得产生虚假会话', async () => {
  for (const body of [null, {}, { success: true }, { success: true, sessionId: '' }, { success: true, sessionId: 7 }]) {
    const api = client(async () => response(200, body));
    await assert.rejects(api.createBuildSession(), /未返回有效的独立会话/);
  }
});

test('网络失败原样抛出且不自动重试创建会话', async () => {
  const failure = new TypeError('测试网络断开');
  let calls = 0;
  const api = client(async () => { calls++; throw failure; });
  await assert.rejects(api.createBuildSession(), error => error === failure);
  assert.equal(calls, 1);
});
