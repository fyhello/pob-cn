import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { sessionError } from './build-sessions.mjs';

const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const kinds = new Set(['builds', 'items']);

export class LibraryStore {
  constructor(directory) {
    this.directory = directory;
    this.tail = Promise.resolve();
  }

  async start() {
    await mkdir(this.directory, { recursive: true });
    const lockPath = join(this.directory, '.writer.lock');
    try {
      this.lock = await open(lockPath, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = JSON.parse(await readFile(lockPath, 'utf8'));
      if (!Number.isInteger(owner.pid) || owner.pid <= 0) throw new Error('存档库写入锁无效，需要人工检查。');
      try { process.kill(owner.pid, 0); }
      catch (probe) {
        if (probe.code !== 'ESRCH') throw probe;
        await unlink(lockPath);
        this.lock = await open(lockPath, 'wx');
      }
      if (!this.lock) throw new Error('存档库已被另一个服务使用，请勿同时启动多个写入服务。');
    }
    await this.lock.writeFile(JSON.stringify({ pid: process.pid }), 'utf8');
    await this.lock.sync();
    for (const kind of kinds) await mkdir(join(this.directory, kind), { recursive: true });
    return this;
  }

  path(kind, id) {
    if (!kinds.has(kind) || !validId.test(id)) throw sessionError('POB_LIBRARY_ID_INVALID', '存档或物品标识无效。', 400);
    return join(this.directory, kind, `${id}.json`);
  }

  async read(kind, id) {
    try {
      const value = JSON.parse(await readFile(this.path(kind, id), 'utf8'));
      if (value.id !== id || !Number.isInteger(value.version) || value.version < 1 || typeof value.name !== 'string'
        || typeof value[kind === 'builds' ? 'code' : 'raw'] !== 'string') throw new Error('条目字段不完整');
      return value;
    } catch (error) {
      if (error.code === 'ENOENT') throw sessionError('POB_LIBRARY_NOT_FOUND', '该存档或物品已被删除。', 404);
      throw error;
    }
  }

  async list(kind) {
    if (!kinds.has(kind)) throw sessionError('POB_LIBRARY_KIND_INVALID', '物品库类型无效。', 400);
    const entries = [];
    for (const name of await readdir(join(this.directory, kind))) {
      if (!name.endsWith('.json')) continue;
      const entry = await this.read(kind, name.slice(0, -5));
      const { code, raw, ...summary } = entry;
      entries.push(summary);
    }
    return entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  write(work) {
    if (!this.lock || this.closing) throw new Error('存档库尚未取得写入锁。');
    const task = this.tail.then(work);
    this.tail = task.catch(() => undefined);
    return task;
  }

  save(kind, { id, expectedVersion, name, ...content }) {
    return this.write(async () => {
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) throw sessionError('POB_LIBRARY_NAME_INVALID', '名称必须为 1 至 120 个字符。', 400);
      const previous = id ? await this.read(kind, id) : null;
      if (previous && previous.version !== expectedVersion) throw sessionError('POB_LIBRARY_CONFLICT', '此存档已在另一网页中更新，请另存或重新载入，不能直接覆盖。');
      const key = kind === 'builds' ? 'code' : 'raw';
      const body = content[key] ?? previous?.[key];
      if (typeof body !== 'string' || !body.trim() || Buffer.byteLength(body) > 2 * 1024 * 1024) throw sessionError('POB_LIBRARY_CONTENT_INVALID', '存档内容为空或超出大小限制。', 400);
      const now = new Date().toISOString();
      const entry = { id: previous?.id ?? randomUUID(), version: (previous?.version ?? 0) + 1, name: name.trim(), createdAt: previous?.createdAt ?? now, updatedAt: now, [key]: body };
      if (kind === 'items') entry.item = content.item ?? previous?.item;
      const path = this.path(kind, entry.id);
      const temporary = `${path}.${randomUUID()}.tmp`;
      const file = await open(temporary, 'wx');
      try {
        await file.writeFile(JSON.stringify(entry), 'utf8');
        await file.sync();
      } finally { await file.close(); }
      try { await rename(temporary, path); }
      catch (error) {
        await unlink(temporary);
        throw error;
      }
      return entry;
    });
  }

  remove(kind, id, expectedVersion) {
    return this.write(async () => {
      const current = await this.read(kind, id);
      if (current.version !== expectedVersion) throw sessionError('POB_LIBRARY_CONFLICT', '条目已在另一网页更新，请刷新列表后再删除。');
      await unlink(this.path(kind, id));
    });
  }

  async close() {
    this.closing = true;
    await this.tail;
    if (this.lock) {
      await this.lock.close();
      this.lock = null;
      await unlink(join(this.directory, '.writer.lock'));
    }
  }
}
