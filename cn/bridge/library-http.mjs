import { sessionError } from './build-sessions.mjs';

export async function handleLibraryRequest(request, payload, { library, sessions, encodeBuildCode }) {
  const match = /^\/api\/library\/(builds|items)(?:\/([^/?]+))?$/u.exec(request.url);
  if (!match) throw sessionError('POB_LIBRARY_ROUTE_UNKNOWN', '存档库接口不存在。', 404);
  const [, kind, action] = match;
  if (request.method === 'GET') {
    return { success: true, data: action ? await library.read(kind, action) : await library.list(kind) };
  }
  if (request.method !== 'POST') throw sessionError('POB_LIBRARY_METHOD_INVALID', '请求方式无效。', 405);
  if (action === 'rename') {
    return { success: true, data: await library.save(kind, { id: payload.id, expectedVersion: payload.expectedVersion, name: payload.name }) };
  }
  if (action === 'delete') {
    await library.remove(kind, payload.id, payload.expectedVersion);
    return { success: true };
  }
  const sessionId = request.headers['x-pob-session'];
  return sessions.run(sessionId, async session => {
    if (session.document.revision === null || session.document.revision !== payload.expectedRevision) {
      throw sessionError('POB_CANONICAL_REVISION_CONFLICT', '当前文档版本已变化，请等待操作完成后重试。');
    }
    if (kind === 'builds' && action === 'save') {
      const code = encodeBuildCode(session.document.fingerprint);
      const entry = await library.save(kind, { id: payload.id, expectedVersion: payload.expectedVersion, name: payload.name, code });
      return { success: true, data: entry, sourceRevision: session.document.revision };
    }
    if (kind === 'items' && action === 'copy') {
      const copied = await session.engine.request({ action: 'exportSharedItem', itemId: payload.itemId });
      if (!copied?.success) return copied;
      const entry = await library.save(kind, { name: payload.name ?? copied.data.item.name, raw: copied.data.raw, item: copied.data.item });
      return { success: true, data: entry };
    }
    throw sessionError('POB_LIBRARY_ROUTE_UNKNOWN', '存档库接口不存在。', 404);
  });
}
