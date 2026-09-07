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
