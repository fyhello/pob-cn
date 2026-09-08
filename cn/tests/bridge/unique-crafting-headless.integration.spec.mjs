import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../../..');
const runtime = join(root, 'Builds/luajit', process.platform === 'win32' ? 'luajit.exe' : 'luajit');

test('传奇制作：全官方目录、变体调值、原物品保真与事务回滚', { skip: !existsSync(runtime), timeout: 480_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'pob-unique-test-'));
  try {
    await mkdir(join(directory, 'Builds'));
    await mkdir(join(directory, 'files'));
    const output = await new Promise((accept, reject) => {
      const child = spawn(runtime, [join(root, 'cn/tests/bridge/helpers/unique-crafting-regression.lua')], {
        cwd: join(root, 'src'), windowsHide: true,
        env: { ...process.env, POB_CN_SESSION_DIR: directory, LUA_PATH: '../runtime/lua/?.lua;../runtime/lua/?/init.lua;;' },
        signal: AbortSignal.timeout(470_000),
      });
      let stdout = '', stderr = '';
      child.stdout.on('data', data => { stdout += data; });
      child.stderr.on('data', data => { stderr += data; });
      child.on('error', reject);
      child.on('close', code => accept({ code, stdout, stderr }));
    });
    assert.equal(output.code, 0, `${output.stdout}\n${output.stderr}`);
    assert.match(output.stdout, /UNIQUE_CRAFT_OK/);
    t.diagnostic(output.stdout.match(/UNIQUE_CRAFT_OK[^\r\n]*/)[0]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
