import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { LibraryStore } from '../../bridge/library-store.mjs';

test('共享存档原子保存、重启持久化、并发版本冲突与删除保护', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pob-library-test-'));
  let store = await new LibraryStore(directory).start();
  try {
    const first = await store.save('builds', { name: '存档 A', code: '<PathOfBuilding2/>' });
    const competing = await Promise.allSettled([
      store.save('builds', { id: first.id, expectedVersion: 1, name: '网页 A', code: '<PathOfBuilding2>A</PathOfBuilding2>' }),
      store.save('builds', { id: first.id, expectedVersion: 1, name: '网页 B', code: '<PathOfBuilding2>B</PathOfBuilding2>' }),
    ]);
    assert.equal(competing.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(competing.find(result => result.status === 'rejected').reason.code, 'POB_LIBRARY_CONFLICT');
    await assert.rejects(store.remove('builds', first.id, 1), /更新/);
    await assert.rejects(new LibraryStore(directory).start(), /另一个服务/);
    const bytes = await readFile(store.path('builds', first.id));
    assert.notEqual(bytes.subarray(0, 3).toString('hex'), 'efbbbf');
    assert.deepEqual((await readdir(join(directory, 'builds'))), [`${first.id}.json`]);
    await store.close();
    store = await new LibraryStore(directory).start();
    assert.equal((await store.read('builds', first.id)).name, '网页 A');
    assert.equal((await store.list('builds'))[0].code, undefined);
    await store.remove('builds', first.id, 2);
    assert.equal((await store.list('builds')).length, 0);
    await assert.rejects(store.read('builds', first.id), /已被删除/);
    assert.throws(() => store.path('builds', '../../escape'), /无效/);
    await assert.rejects(store.save('builds', { name: '', code: 'x' }), /名称/);
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }); }
});
