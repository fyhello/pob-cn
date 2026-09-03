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
