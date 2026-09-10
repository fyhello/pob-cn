import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { decodeBuildCode } from '../../bridge/http-server.mjs';

const root = resolve(import.meta.dirname, '../../..');
const runtime = join(root, 'Builds/luajit', process.platform === 'win32' ? 'luajit.exe' : 'luajit');

test('升华切换与官方结果一致，保留分组天赋，保存重开和失败回滚完整', { skip: !existsSync(runtime), timeout: 180_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'pob-ascendancy-test-'));
  try {
    await mkdir(join(directory, 'Builds'));
    await mkdir(join(directory, 'files'));
    const args = [join(root, 'cn/tests/bridge/helpers/passive-ascendancy-regression.lua')];
    if (process.env.POB_CN_TEST_BUILD) {
      const saved = JSON.parse(await readFile(process.env.POB_CN_TEST_BUILD, 'utf8'));
      const xml = join(directory, 'import.xml');
      await writeFile(xml, decodeBuildCode(saved.code), 'utf8');
      args.push(xml);
    }
    const output = await new Promise((accept, reject) => {
      const child = spawn(runtime, args, { cwd: join(root, 'src'), windowsHide: true,
        env: { ...process.env, POB_CN_SESSION_DIR: directory, LUA_PATH: '../runtime/lua/?.lua;../runtime/lua/?/init.lua;;' },
        signal: AbortSignal.timeout(170_000) });
      let stdout = '', stderr = '';
      child.stdout.on('data', data => { stdout += data; });
      child.stderr.on('data', data => { stderr += data; });
      child.on('error', reject);
      child.on('close', code => accept({ code, stdout, stderr }));
    });
    assert.equal(output.code, 0, `${output.stdout}\n${output.stderr}`);
    assert.match(output.stdout, /PASSIVE_ASCENDANCY_OK/);
    t.diagnostic(output.stdout.match(/PASSIVE_ASCENDANCY_OK[^\r\n]*/)[0]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
