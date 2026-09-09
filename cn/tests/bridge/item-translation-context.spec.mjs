import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../../..');
const lua = join(root, 'Builds/luajit', process.platform === 'win32' ? 'luajit.exe' : 'luajit');
test('显示语境中的局部与全局选择对应官方已解析修正的实际去向', { skip: !existsSync(lua) }, async () => {
  const session = await mkdtemp(join(tmpdir(), 'pob-item-translation-'));
  try {
    await mkdir(join(session, 'Builds')); await mkdir(join(session, 'files'));
    const result = spawnSync(lua, [join(root, 'cn/tests/bridge/helpers/item-translation-context.lua')], { cwd: join(root, 'src'), windowsHide: true, encoding: 'utf8', timeout: 120000,
      env: { ...process.env, POB_CN_SESSION_DIR: session, LUA_PATH: '../runtime/lua/?.lua;../runtime/lua/?/init.lua;;' } });
    assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
    assert.match(result.stdout, /ITEM_TRANSLATION_CONTEXT_OK 3/);
  } finally { await rm(session, { recursive: true, force: true }); }
});
