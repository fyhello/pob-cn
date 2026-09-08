import assert from 'node:assert/strict';
import test from 'node:test';
import { BuildSessions } from '../../bridge/build-sessions.mjs';

test('独立会话懒启动，分别排队，关闭等待已接收请求完成', async () => {
  let created = 0;
  const closed = [];
  const sessions = new BuildSessions({ createEngine: async id => { created++; return { request: async () => ({ success: true }), close: async () => closed.push(id) }; } });
  try {
    const a = await sessions.create();
    const b = await sessions.create();
    assert.notEqual(a, b);
    assert.equal(created, 0);
    let release;
    const first = sessions.run(a, () => new Promise(resolve => { release = resolve; }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(await sessions.run(b, () => 'B'), 'B');
    const second = sessions.run(a, () => 'A2');
    const closing = sessions.close(a);
    assert.equal(closed.length, 0);
    await assert.rejects(sessions.run(a, () => '不应执行'), /已结束/);
    release('A1');
    assert.equal(await first, 'A1');
    assert.equal(await second, 'A2');
    await closing;
    assert.deepEqual(closed, [a]);
  } finally { await sessions.shutdown(); }
});

test('核心失败只恢复最近确认的官方 XML，不重放失败修改', async () => {
  const calls = [];
  let generation = 0;
  const sessions = new BuildSessions({ createEngine: async () => {
    generation++;
    return { request: async message => { calls.push(message); return { success: true }; }, close: async () => {} };
  } });
  try {
    const id = await sessions.create();
    await sessions.run(id, session => { session.document = { fingerprint: '<PathOfBuilding2/>', revision: 4 }; });
    await assert.rejects(sessions.run(id, () => { throw new Error('计算失败'); }), /计算失败/);
    await sessions.run(id, session => assert.equal(session.document.revision, 4));
    assert.equal(generation, 2);
    assert.deepEqual(calls, [{ action: 'loadXMLForMutation', xml: '<PathOfBuilding2/>', name: '' }]);
  } finally { await sessions.shutdown(); }
});

test('会话上限和闲置回收不终止正在执行的请求', async () => {
  let now = 0;
  const sessions = new BuildSessions({ maxSessions: 1, idleMs: 100, now: () => now, createEngine: async () => ({ close: async () => {} }) });
  try {
    const id = await sessions.create();
    await assert.rejects(sessions.create(), /上限/);
    let release;
    const running = sessions.run(id, () => new Promise(resolve => { release = resolve; }));
    await new Promise(resolve => setImmediate(resolve));
    now = 200;
    await sessions.reap();
    assert.equal(sessions.sessions.size, 1);
    release();
    await running;
    now = 400;
    await sessions.reap();
    assert.equal(sessions.sessions.size, 0);
    assert.throws(() => sessions.get(id), /已结束/);
  } finally { await sessions.shutdown(); }
});
