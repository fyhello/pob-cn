interface BuildOwner {
  sessionId: string;
  documentEpoch: number;
  canonicalBuild: { code: string; version: number } | null;
}

export const staleDocumentError = { code: 'POB_DOCUMENT_CHANGED', message: '当前 BD 已切换或更新，旧操作已失效。' };

export function bridgeFetch(sessionId: string, path: string, init: RequestInit = {}) {
  if (!sessionId) throw new Error('当前网页尚未打开计算会话。');
  return fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers, 'X-Pob-Session': sessionId } });
}

export async function createBuildSession(): Promise<string> {
  const response = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const context = `POST /api/sessions，HTTP ${response.status}`;
  if (response.status === 404 || response.status === 405) {
    throw new Error(`当前网页连接的后端不支持独立计算会话，请检查前端代理地址和后端版本（${context}）。`);
  }
  let result;
  try { result = await response.json(); }
  catch (error) {
    throw new Error(`计算服务返回了无效的 JSON 响应（${context}）。`, { cause: error });
  }
  if (!response.ok || result?.success !== true || typeof result.sessionId !== 'string' || !result.sessionId) {
    const message = typeof result?.error === 'string' ? result.error : result?.error?.message;
    throw new Error(`${typeof message === 'string' && message ? message : '计算服务未返回有效的独立会话'}（${context}）。`);
  }
  return result.sessionId;
}

export async function closeBuildSession(sessionId: string) {
  if (!sessionId) return;
  const response = await bridgeFetch(sessionId, '/api/sessions/close', { method: 'POST', body: '{}' });
  if (!response.ok) throw new Error('旧计算会话未能正常关闭，将由闲置回收处理。');
}

export async function requestForBuild(owner: BuildOwner, path: string, init: RequestInit) {
  const { sessionId, documentEpoch, canonicalBuild } = owner;
  const response = await bridgeFetch(sessionId, path, init);
  return {
    ok: response.ok,
    status: response.status,
    json: async () => {
      const result = await response.json();
      if (owner.sessionId !== sessionId || owner.documentEpoch !== documentEpoch
        || owner.canonicalBuild?.code !== canonicalBuild?.code || owner.canonicalBuild?.version !== canonicalBuild?.version) {
        throw Object.assign(new Error(staleDocumentError.message), staleDocumentError);
      }
      return result;
    },
  };
}
