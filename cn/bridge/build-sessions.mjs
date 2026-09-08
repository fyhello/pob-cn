import { randomUUID } from 'node:crypto';

export function sessionError(code, message, status = 409) {
  return Object.assign(new Error(message), { code, status });
}

export class BuildSessions {
  constructor({ createEngine, maxSessions = 8, idleMs = 180_000, now = Date.now }) {
    this.createEngine = createEngine;
    this.maxSessions = maxSessions;
    this.idleMs = idleMs;
    this.now = now;
    this.sessions = new Map();
    this.timer = setInterval(() => {
      void this.reap().catch(error => console.error('PoB 会话回收失败：', error));
    }, Math.min(idleMs, 30_000));
    this.timer.unref();
  }

  async create() {
    if (this.closed) throw sessionError('POB_SERVICE_CLOSING', 'PoB 服务正在关闭。', 503);
    if (this.sessions.size >= this.maxSessions) throw sessionError('POB_SESSION_LIMIT', `已达到 ${this.maxSessions} 个计算会话上限，请先关闭不用的网页。`, 429);
    const id = randomUUID();
    const session = { id, engine: null, document: { fingerprint: null, revision: null }, tail: Promise.resolve(), pending: 0, touchedAt: this.now(), closing: false };
    this.sessions.set(id, session);
    return id;
  }

  get(id) {
    const session = typeof id === 'string' && this.sessions.get(id);
    if (!session || session.closing) throw sessionError('POB_SESSION_UNAVAILABLE', '当前网页的计算会话已结束，请恢复当前草稿或重新选择存档。');
    session.touchedAt = this.now();
    return session;
  }

  async run(id, work) {
    const session = this.get(id);
    session.pending++;
    const task = session.tail.then(async () => {
      if (session.engine?.ready === false) await this.invalidate(session);
      if (!session.engine) {
        session.engine = await this.createEngine(id);
        if (session.document.fingerprint !== null) {
          const restored = await session.engine.request({ action: 'loadXMLForMutation', xml: session.document.fingerprint, name: '' });
          if (!restored?.success) throw sessionError('POB_SESSION_RESTORE_FAILED', restored?.error?.message ?? '官方 PoB 无法恢复最近确认的文档。', 503);
        }
      }
      const result = await work(session);
      if (session.needsRestore) {
        session.needsRestore = false;
        await this.invalidate(session);
      }
      return result;
    }).catch(async error => {
      await this.invalidate(session);
      throw error;
    }).finally(() => {
      session.pending--;
      session.touchedAt = this.now();
    });
    session.tail = task.catch(() => undefined);
    return task;
  }

  async invalidate(session) {
    const engine = session.engine;
    session.engine = null;
    if (engine) await engine.close();
  }

  async close(id) {
    const session = this.sessions.get(id);
    if (!session) return;
    if (session.closing) return session.closing;
    session.closing = (async () => {
      await session.tail;
      await this.invalidate(session);
      this.sessions.delete(id);
    })();
    return session.closing;
  }

  async reap() {
    for (const session of this.sessions.values()) {
      if (!session.pending && this.now() - session.touchedAt >= this.idleMs) await this.close(session.id);
    }
  }

  async shutdown() {
    this.closed = true;
    clearInterval(this.timer);
    for (const id of this.sessions.keys()) await this.close(id);
  }
}
