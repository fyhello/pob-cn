import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../../..');
const runtime = resolve(root, 'Builds/luajit', process.platform === 'win32' ? 'luajit.exe' : 'luajit');

test('真实官方语料：截图羁绊的未支持判定、部分解析、变体与暗金重载', { skip: !existsSync(runtime), timeout: 120_000 }, () => {
  const result = spawnSync(runtime, [resolve(root, 'cn/tests/bridge/helpers/item-modifier-regression.lua')], { cwd: resolve(root, 'src'), encoding: 'utf8', timeout: 110_000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stderr}\n${result.stdout}`);
  const summary = JSON.parse(result.stdout.match(/MODIFIER_REGRESSION:(.+)/)?.[1] ?? 'null');
  assert.ok(summary?.bonded > 200);
  assert.equal(summary.supported + summary.unsupported, summary.bonded);
  console.log('真实语料验收：', summary);
});
