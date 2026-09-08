import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { PoBCoreEngine } from '../../bridge/engine.mjs';

class FakeProcess extends EventEmitter {
  constructor() {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.stdin = { writes: [], write: value => this.stdin.writes.push(value) };
    this.killed = false;
  }

  kill() {
    this.killed = true;
    this.emit('exit', 0, null);
  }
}

function startReady(engine, child) {
  const starting = engine.start();
  child.stdout.emit('data', Buffer.from('POB_JSON:{"event":"ready"}\n'));
  return starting;
}

test('routes JSON replies and times out stalled requests', async () => {
  const child = new FakeProcess();
  const engine = new PoBCoreEngine({ spawn: () => child, requestTimeoutMs: 10 });
  await startReady(engine, child);

  const reply = engine.request({ action: 'calculate' }, { timeoutMs: 50 });
  child.stdout.emit('data', Buffer.from('POB_JSON:{"success":true,"action":"calculate","total":42}\n'));
  assert.deepEqual(await reply, { success: true, action: 'calculate', total: 42 });
  await assert.rejects(engine.request({ action: 'stalled' }), /timed out/i);
  await engine.close();
});

test('序列化或写入失败不会占用后续请求的响应', async t => {
  const child = new FakeProcess();
  const engine = new PoBCoreEngine({ spawn: () => child, requestTimeoutMs: 100 });
  t.after(() => engine.close());
  await startReady(engine, child);
  const circular = { action: 'calculate' };
  circular.self = circular;
  await assert.rejects(engine.request(circular), /circular/i);
  assert.equal(child.stdin.writes.length, 0);
  const write = child.stdin.write;
  child.stdin.write = () => { throw new Error('test write failed'); };
  await assert.rejects(engine.request({ action: 'calculate' }), /test write failed/);
  child.stdin.write = write;
  const reply = engine.request({ action: 'calculate' });
  child.stdout.emit('data', Buffer.from('POB_JSON:{"success":true,"total":43}\n'));
  assert.deepEqual(await reply, { success: true, total: 43 });
});

test('rejects pending requests on an unexpected exit and can restart', async () => {
  const first = new FakeProcess();
  const second = new FakeProcess();
  const children = [first, second];
  const engine = new PoBCoreEngine({ spawn: () => children.shift(), requestTimeoutMs: 50 });
  await startReady(engine, first);
  const pending = engine.request({ action: 'calculate' });
  first.emit('exit', 1, null);
  await assert.rejects(pending, /exited/i);

  await startReady(engine, second);
  await engine.close();
});

test('passes a configured Lua module path to the bridge child', async () => {
  const child = new FakeProcess();
  let spawnOptions;
  const engine = new PoBCoreEngine({ env: { LUA_PATH: '../runtime/lua/?.lua;;' }, spawn: (_command, _args, options) => { spawnOptions = options; return child; } });
  await startReady(engine, child);
  assert.equal(spawnOptions.env.LUA_PATH, '../runtime/lua/?.lua;;');
  await engine.close();
});

test('超时后的迟到响应与旧进程错误不能污染新核心', async () => {
  const first = new FakeProcess();
  const second = new FakeProcess();
  const children = [first, second];
  const engine = new PoBCoreEngine({ spawn: () => children.shift(), requestTimeoutMs: 10 });
  await startReady(engine, first);
  const a = engine.request({ action: 'A' });
  const b = engine.request({ action: 'B' });
  const failures = await Promise.allSettled([a, b]);
  assert.ok(failures.every(result => result.status === 'rejected'));
  assert.equal(first.killed, true);
  assert.throws(() => engine.request({ action: 'C' }), /not ready/);
  await startReady(engine, second);
  const c = engine.request({ action: 'C' }, { timeoutMs: 1000 });
  first.stdout.emit('data', Buffer.from('POB_JSON:{"success":true,"action":"A"}\n'));
  first.emit('error', new Error('旧进程错误'));
  second.stdout.emit('data', Buffer.from('POB_JSON:{"success":true,"action":"C"}\n'));
  assert.equal((await c).action, 'C');
  await engine.close();
});

test('启动同步失败后可重新启动，启动期间关闭会拒绝等待者', async () => {
  const child = new FakeProcess();
  let calls = 0;
  const engine = new PoBCoreEngine({ spawn: () => { if (++calls === 1) throw new Error('启动失败'); return child; } });
  await assert.rejects(engine.start(), /启动失败/);
  const starting = engine.start();
  const rejected = assert.rejects(starting, /closed/);
  await engine.close();
  await rejected;
});

test('中文响应跨字节分块仍完整，损坏协议失败关闭', async () => {
  const child = new FakeProcess();
  const engine = new PoBCoreEngine({ spawn: () => child });
  await startReady(engine, child);
  const pending = engine.request({ action: '中文' });
  const bytes = Buffer.from('POB_JSON:{"success":true,"name":"中文"}\n');
  for (const byte of bytes) child.stdout.emit('data', Buffer.from([byte]));
  assert.equal((await pending).name, '中文');
  const broken = engine.request({ action: '损坏响应' });
  child.stdout.emit('data', Buffer.from('POB_JSON:{broken}\n'));
  await assert.rejects(broken, /invalid JSON/);
  assert.equal(child.killed, true);
  await engine.close();
});
