import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { startBridge } from '../../bridge/start.mjs';

class FakeProcess extends EventEmitter {
  constructor() {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.stdin = { write() {} };
  }
  kill() { this.emit('exit', 0, null); }
}

test('starts a configured engine only after the complete manifest gate', async () => {
  const child = new FakeProcess();
  let notifySpawn;
  const spawned = new Promise(resolve => { notifySpawn = resolve; });
  const starting = startBridge(process.cwd(), { command: 'lua', args: ['cn/bridge/calc_server.lua'], spawn: () => { notifySpawn(); return child; } });
  await spawned;
  child.stdout.emit('data', Buffer.from('POB_JSON:{"event":"ready"}\n'));
  const engine = await starting;
  assert.equal(engine.ready, true);
  await engine.close();
});

test('启动失败等待进程完全退出后才向调用方返回', async () => {
  const child = new FakeProcess();
  let killed = false;
  child.kill = () => { killed = true; setTimeout(() => child.emit('exit', 1, null), 15); };
  let exited = false;
  child.on('exit', () => { exited = true; });
  await assert.rejects(startBridge(process.cwd(), { command: 'lua', startupTimeoutMs: 5, spawn: () => child }), /startup timed out/);
  assert.equal(killed, true);
  assert.equal(exited, true);
});
