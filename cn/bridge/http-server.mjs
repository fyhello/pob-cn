import http from 'node:http';
import { deflateSync, inflateRawSync, inflateSync, unzipSync } from 'node:zlib';

const maxBodyBytes = 2 * 1024 * 1024;

function send(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let size = 0; const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new Error('request body is too large');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw new Error('request body must be JSON'); }
}

export function decodeBuildCode(value) {
  const source = typeof value === 'string' ? value.trim() : '';
  if (!source) throw new Error('build code is required');
  if (source.startsWith('<')) return source;
  const normalized = source.replace(/[^A-Za-z0-9+/_-]/g, '').replaceAll('-', '+').replaceAll('_', '/');
  const bytes = Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='), 'base64');
  for (const decompress of [inflateSync, inflateRawSync, unzipSync]) {
    try { return decompress(bytes).toString('utf8'); } catch { /* try next codec */ }
  }
  throw new Error('build code is not XML or a supported compressed payload');
}

export function encodeBuildCode(xml) {
  if (typeof xml !== 'string' || !xml.trim().startsWith('<')) throw new Error('build XML is required');
  return deflateSync(Buffer.from(xml, 'utf8'), { level: 9 })
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function canonicalXmlFingerprint(code) {
  return decodeBuildCode(code).replace(/\r\n?/gu, '\n');
}

export function createBridgeHttpServer(engine) {
  if (!engine || typeof engine.request !== 'function') throw new Error('a ready bridge engine is required');
  let activeSession = { fingerprint: null, revision: null };
  let sessionQueue = Promise.resolve();

  function runInSession(work) {
    const next = sessionQueue.then(work, work);
    sessionQueue = next.catch(() => undefined);
    return next;
  }

  async function ensureLoaded(code, revision, name = '') {
    const fingerprint = canonicalXmlFingerprint(code);
    if (activeSession.fingerprint !== null || activeSession.revision !== null) {
      if (activeSession.fingerprint === fingerprint && activeSession.revision === revision) {
        return { success: true, fromCache: true };
      }
      return {
        success: false,
        error: {
          code: 'POB_CANONICAL_REVISION_CONFLICT',
          message: '当前 PoB 文档已更新，请刷新后再执行操作。',
        },
      };
    }
    if (activeSession.fingerprint === fingerprint && activeSession.revision === revision) {
      return { success: true, fromCache: true };
    }
    const xml = decodeBuildCode(code);
    const loaded = await engine.request({ action: 'loadXML', xml, name });
    if (loaded?.success) {
      activeSession = { fingerprint, revision };
    } else {
      activeSession = { fingerprint: null, revision: null };
    }
    return loaded;
  }

  return http.createServer(async (request, response) => {
    if (request.method === 'OPTIONS') { response.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' }); response.end(); return; }
    if (request.method === 'GET' && request.url === '/health') return send(response, 200, { ready: true });
    try {
      return await runInSession(async () => {
        if (request.method === 'GET' && request.url === '/api/stats') return send(response, 200, await engine.request({ action: 'getStats' }));
        const payload = await readJson(request);
      if (request.method === 'POST' && request.url === '/api/import') {
        const canonicalXML = decodeBuildCode(payload.code);
        const imported = await engine.request({ action: 'loadXML', xml: canonicalXML, name: payload.name ?? '' });
        if (imported?.success) {
          activeSession = { fingerprint: canonicalXmlFingerprint(payload.code), revision: 1 };
          return send(response, 200, { success: true, revision: 1, action: 'loadXML', data: imported.data });
        } else {
          activeSession = { fingerprint: null, revision: null };
          return send(response, 200, imported);
        }
      }
      if (request.method === 'POST' && request.url === '/api/export') {
        const sourceVersion = Number.isInteger(payload.version) && payload.version > 0 ? payload.version : null;
        if (!sourceVersion) return send(response, 400, { success: false, error: { code: 'POB_CANONICAL_VERSION_REQUIRED', message: '缺少当前 PoB 文档版本，已拒绝导出。' } });
        const loaded = await ensureLoaded(payload.code, sourceVersion, payload.name ?? '');
        if (!loaded?.success) return send(response, 422, { success: false, error: loaded?.error ?? { code: 'POB_CANONICAL_LOAD_FAILED', message: '当前 PoB 文档无法由官方核心重新载入。' } });
        const result = await engine.request({ action: 'exportXML' });
        if (!result?.success || typeof result?.data?.xml !== 'string') throw new Error(result?.error?.message ?? result?.error ?? 'official PoB XML export failed');
        return send(response, 200, { success: true, code: encodeBuildCode(result.data.xml), format: 'pob-share-code', sourceVersion });
      }
      if (request.method === 'POST' && request.url === '/api/loadouts/select') {
        const expectedRevision = Number.isInteger(payload.expectedRevision) && payload.expectedRevision > 0 ? payload.expectedRevision : null;
        if (!expectedRevision) return send(response, 400, { success: false, error: { code: 'POB_LOADOUT_REVISION_REQUIRED', message: '缺少当前 PoB 文档版本，已拒绝切换 Loadout。' } });
        const canonicalXML = decodeBuildCode(payload.code);
        const loaded = await ensureLoaded(payload.code, expectedRevision, payload.name ?? '');
        if (!loaded?.success) return send(response, 422, { success: false, error: loaded?.error ?? { code: 'POB_CANONICAL_LOAD_FAILED', message: '当前 PoB 文档无法由官方核心重新载入。' } });
        const result = await engine.request({ action: 'selectLoadout', selection: payload.selection, canonicalXML, name: payload.name ?? '' });
        if (!result?.success || typeof result?.data?.xml !== 'string') {
          activeSession = { fingerprint: null, revision: null };
          return send(response, 422, result?.success ? { success: false, error: { code: 'POB_LOADOUT_XML_MISSING', message: '官方 PoB 未返回切换后的文档。' } } : result);
        }
        const nextCode = encodeBuildCode(result.data.xml);
        activeSession = { fingerprint: canonicalXmlFingerprint(nextCode), revision: expectedRevision + 1 };
        const data = { ...result.data, code: nextCode, sourceRevision: expectedRevision, revision: expectedRevision + 1 };
        delete data.xml;
        return send(response, 200, { success: true, action: 'selectLoadout', data });
      }
      if (request.method === 'POST' && request.url === '/api/items/assign') {
        const expectedRevision = Number.isInteger(payload.expectedRevision) && payload.expectedRevision > 0 ? payload.expectedRevision : null;
        if (!expectedRevision) return send(response, 400, { success: false, error: { code: 'POB_ITEM_ASSIGNMENT_REVISION_REQUIRED', message: '缺少当前 PoB 文档版本，已拒绝物品分配。' } });
        if (!Object.hasOwn(payload, 'itemId') || (payload.itemId !== null && !Number.isInteger(payload.itemId))) {
          return send(response, 400, { success: false, error: { code: 'POB_ITEM_ASSIGNMENT_ITEM_ID_REQUIRED', path: 'itemId', message: '物品 ID 必须是官方物品库中的整数，或使用空值卸下物品。' } });
        }
        const canonicalXML = decodeBuildCode(payload.code);
        const loaded = await ensureLoaded(payload.code, expectedRevision, payload.name ?? '');
        if (!loaded?.success) return send(response, 422, { success: false, error: loaded?.error ?? { code: 'POB_CANONICAL_LOAD_FAILED', message: '当前 PoB 文档无法由官方核心重新载入。' } });
        const result = await engine.request({ action: 'assignOfficialItem', target: payload.target, itemId: payload.itemId, canonicalXML, name: payload.name ?? '' });
        if (!result?.success || typeof result?.data?.xml !== 'string') {
          activeSession = { fingerprint: null, revision: null };
          return send(response, 422, result?.success ? { success: false, error: { code: 'POB_ITEM_ASSIGNMENT_XML_MISSING', message: '官方 PoB 未返回物品分配后的文档。' } } : result);
        }
        const nextCode = encodeBuildCode(result.data.xml);
        activeSession = { fingerprint: canonicalXmlFingerprint(nextCode), revision: expectedRevision + 1 };
        const data = { ...result.data, code: nextCode, sourceRevision: expectedRevision, revision: expectedRevision + 1 };
        delete data.xml;
        return send(response, 200, { success: true, action: 'assignOfficialItem', data });
      }
      if (request.method === 'POST' && request.url === '/api/items/remove') {
        const expectedRevision = Number.isInteger(payload.expectedRevision) && payload.expectedRevision > 0 ? payload.expectedRevision : null;
        if (!expectedRevision) return send(response, 400, { success: false, error: { code: 'POB_ITEM_DELETE_REVISION_REQUIRED', message: '缺少当前 PoB 文档版本，已拒绝删除物品。' } });
        if (!Number.isInteger(payload.itemId) || payload.itemId <= 0) return send(response, 400, { success: false, error: { code: 'POB_ITEM_DELETE_ITEM_ID_REQUIRED', path: 'itemId', message: '物品 ID 必须是当前官方物品库中的正整数。' } });
        const canonicalXML = decodeBuildCode(payload.code);
        const loaded = await ensureLoaded(payload.code, expectedRevision, payload.name ?? '');
        if (!loaded?.success) return send(response, 422, { success: false, error: loaded?.error ?? { code: 'POB_CANONICAL_LOAD_FAILED', message: '当前 PoB 文档无法由官方核心重新载入。' } });
        const result = await engine.request({ action: 'deleteOfficialItem', itemId: payload.itemId, canonicalXML, name: payload.name ?? '' });
        if (!result?.success || typeof result?.data?.xml !== 'string') {
          activeSession = { fingerprint: null, revision: null };
          return send(response, 422, result?.success ? { success: false, error: { code: 'POB_ITEM_DELETE_XML_MISSING', message: '官方 PoB 未返回删除后的文档。' } } : result);
        }
        const nextCode = encodeBuildCode(result.data.xml);
        activeSession = { fingerprint: canonicalXmlFingerprint(nextCode), revision: expectedRevision + 1 };
        const data = { ...result.data, code: nextCode, sourceRevision: expectedRevision, revision: expectedRevision + 1 };
        delete data.xml;
        return send(response, 200, { success: true, action: 'deleteOfficialItem', data });
      }
      if (request.method === 'POST' && request.url === '/api/build/commit') {
        const expectedRevision = Number.isInteger(payload.expectedRevision) && payload.expectedRevision > 0 ? payload.expectedRevision : null;
        if (!expectedRevision) return send(response, 400, { success: false, error: { code: 'POB_BUILD_REVISION_REQUIRED', message: '缺少当前 PoB 文档版本，已拒绝构建修改。' } });
        if (!payload.changes || typeof payload.changes !== 'object' || Array.isArray(payload.changes)) return send(response, 400, { success: false, error: { code: 'POB_BUILD_CHANGE_REQUIRED', message: '必须提供官方可保存的构建修改。' } });
        const canonicalXML = decodeBuildCode(payload.code);
        const loaded = await ensureLoaded(payload.code, expectedRevision, payload.name ?? '');
        if (!loaded?.success) return send(response, 422, { success: false, error: loaded?.error ?? { code: 'POB_CANONICAL_LOAD_FAILED', message: '当前 PoB 文档无法由官方核心重新载入。' } });
        const result = await engine.request({ action: 'commitBuildChanges', changes: payload.changes, canonicalXML, name: payload.name ?? '' });
        if (!result?.success || typeof result?.data?.xml !== 'string') {
          activeSession = { fingerprint: null, revision: null };
          return send(response, 422, result?.success ? { success: false, error: { code: 'POB_BUILD_XML_MISSING', message: '官方 PoB 未返回构建修改后的文档。' } } : result);
        }
        const nextCode = encodeBuildCode(result.data.xml);
        activeSession = { fingerprint: canonicalXmlFingerprint(nextCode), revision: expectedRevision + 1 };
        const data = { ...result.data, code: nextCode, sourceRevision: expectedRevision, revision: expectedRevision + 1 };
        delete data.xml;
        return send(response, 200, { success: true, action: 'commitBuildChanges', data });
      }
      if (request.method === 'POST' && request.url === '/api/config/commit') {
        const expectedRevision = Number.isInteger(payload.expectedRevision) && payload.expectedRevision > 0 ? payload.expectedRevision : null;
        if (!expectedRevision) return send(response, 400, { success: false, error: { code: 'POB_CONFIG_REVISION_REQUIRED', message: '缺少当前 PoB 文档版本，已拒绝战斗配置修改。' } });
        const canonicalXML = decodeBuildCode(payload.code);
        const loaded = await ensureLoaded(payload.code, expectedRevision, payload.name ?? '');
        if (!loaded?.success) return send(response, 422, { success: false, error: loaded?.error ?? { code: 'POB_CANONICAL_LOAD_FAILED', message: '当前 PoB 文档无法由官方核心重新载入。' } });
        const result = await engine.request({ action: 'commitConfigChange', configSetId: payload.configSetId, variable: payload.variable, value: payload.value, canonicalXML, name: payload.name ?? '' });
        if (!result?.success || typeof result?.data?.xml !== 'string') {
          activeSession = { fingerprint: null, revision: null };
          return send(response, 422, result?.success ? { success: false, error: { code: 'POB_CONFIG_XML_MISSING', message: '官方 PoB 未返回战斗配置修改后的文档。' } } : result);
        }
        const nextCode = encodeBuildCode(result.data.xml);
        activeSession = { fingerprint: canonicalXmlFingerprint(nextCode), revision: expectedRevision + 1 };
        const data = { ...result.data, code: nextCode, sourceRevision: expectedRevision, revision: expectedRevision + 1 };
        delete data.xml;
        return send(response, 200, { success: true, action: 'commitConfigChange', data });
      }
      if (request.method === 'POST' && request.url === '/api/skills/commit') {
        const expectedRevision = Number.isInteger(payload.expectedRevision) && payload.expectedRevision > 0 ? payload.expectedRevision : null;
        if (!expectedRevision) return send(response, 400, { success: false, error: { code: 'POB_SKILL_REVISION_REQUIRED', message: '缺少当前 PoB 文档版本，已拒绝技能修改。' } });
        const canonicalXML = decodeBuildCode(payload.code);
        const loaded = await ensureLoaded(payload.code, expectedRevision, payload.name ?? '');
        if (!loaded?.success) return send(response, 422, { success: false, error: loaded?.error ?? { code: 'POB_CANONICAL_LOAD_FAILED', message: '当前 PoB 文档无法由官方核心重新载入。' } });
        const result = await engine.request({ action: 'commitSkillChange', skillSetId: payload.skillSetId, operation: payload.operation, groupIndex: payload.groupIndex, gemIndex: payload.gemIndex, patch: payload.patch, label: payload.label, canonicalXML, name: payload.name ?? '' });
        if (!result?.success || typeof result?.data?.xml !== 'string') {
          activeSession = { fingerprint: null, revision: null };
          return send(response, 422, result?.success ? { success: false, error: { code: 'POB_SKILL_XML_MISSING', message: '官方 PoB 未返回技能修改后的文档。' } } : result);
        }
        const nextCode = encodeBuildCode(result.data.xml);
        activeSession = { fingerprint: canonicalXmlFingerprint(nextCode), revision: expectedRevision + 1 };
        const data = { ...result.data, code: nextCode, sourceRevision: expectedRevision, revision: expectedRevision + 1 };
        delete data.xml;
        return send(response, 200, { success: true, action: 'commitSkillChange', data });
      }
      if (request.method === 'POST' && (request.url === '/api/items/preview' || request.url === '/api/items/commit')) {
        const expectedRevision = Number.isInteger(payload.expectedRevision) && payload.expectedRevision > 0 ? payload.expectedRevision : null;
        if (!expectedRevision) return send(response, 400, { success: false, error: { code: 'POB_CRAFT_REVISION_REQUIRED', message: '缺少当前 PoB 文档版本，已拒绝制作操作。' } });
        const operation = payload.action;
        if (!['create', 'edit', 'duplicate'].includes(operation)) return send(response, 400, { success: false, error: { code: 'POB_CRAFT_OPERATION_REQUIRED', path: 'action', message: '必须明确指定 create、edit 或 duplicate 操作。' } });
        if (operation !== 'create' && (!Number.isInteger(payload.sourceItemId) || payload.sourceItemId <= 0)) {
          return send(response, 400, { success: false, error: { code: 'POB_CRAFT_SOURCE_ITEM_REQUIRED', path: 'sourceItemId', message: '编辑或复制官方物品必须指定 sourceItemId。' } });
        }
        const loaded = await ensureLoaded(payload.code, expectedRevision, payload.name ?? '');
        if (!loaded?.success) {
          const conflict = loaded?.error?.code === 'POB_CANONICAL_REVISION_CONFLICT';
          return send(response, conflict ? 409 : 422, { success: false, error: loaded?.error ?? { code: 'POB_CANONICAL_LOAD_FAILED', message: '当前 PoB 文档无法由官方核心重新载入。' } });
        }
        const action = request.url.endsWith('/preview') ? 'craftPreview' : 'craftCommit';
        // The Lua craft entrypoint requires the explicit semantic operation
        // (create/edit/duplicate).  Always forward it; omitting it for
        // `create` makes an otherwise valid request fail closed.
        const craftRequest = { action, operation, target: payload.target, draft: payload.draft, name: payload.name ?? '' };
        if (Number.isInteger(payload.sourceItemId)) craftRequest.sourceItemId = payload.sourceItemId;
        const result = await engine.request(craftRequest);
        if (!result?.success) return send(response, 422, result);
        const responseData = { ...result.data, sourceRevision: expectedRevision, canonicalRevision: expectedRevision };
        if (action === 'craftCommit') {
          const nextCode = encodeBuildCode(result.data.xml);
          activeSession = { fingerprint: canonicalXmlFingerprint(nextCode), revision: expectedRevision + 1 };
          responseData.code = nextCode;
          responseData.revision = expectedRevision + 1;
          delete responseData.xml;
        }
        return send(response, 200, { success: true, action, data: responseData });
      }
      if (request.method === 'POST' && request.url === '/api/crafting/options') {
        const expectedRevision = Number.isInteger(payload.expectedRevision) && payload.expectedRevision > 0 ? payload.expectedRevision : null;
        if (!expectedRevision) return send(response, 400, { success: false, error: { code: 'POB_CRAFT_REVISION_REQUIRED', message: '缺少当前 PoB 文档版本，无法读取官方制作选项。' } });
        const loaded = await ensureLoaded(payload.code, expectedRevision, payload.name ?? '');
        if (!loaded?.success) return send(response, 422, { success: false, error: loaded?.error ?? { code: 'POB_CANONICAL_LOAD_FAILED', message: '当前 PoB 文档无法由官方核心重新载入。' } });
        const optionsRequest = { action: 'craftOptions', baseName: payload.baseName, itemLevel: payload.itemLevel, rarity: payload.rarity, corrupted: payload.corrupted === true, draft: payload.draft, canonicalRevision: expectedRevision };
        if (typeof payload.action === 'string') optionsRequest.actionMode = payload.action;
        if (Number.isInteger(payload.sourceItemId)) optionsRequest.sourceItemId = payload.sourceItemId;
        const result = await engine.request(optionsRequest);
        if (!result?.success) return send(response, 422, result);
        return send(response, 200, { success: true, action: 'craftOptions', canonicalRevision: expectedRevision, data: { ...result.data, sourceRevision: expectedRevision, canonicalRevision: expectedRevision } });
      }
      if (request.method === 'POST' && request.url === '/api/crafting/catalog') {
        const expectedRevision = Number.isInteger(payload.expectedRevision) && payload.expectedRevision > 0 ? payload.expectedRevision : null;
        if (!expectedRevision) return send(response, 400, { success: false, error: { code: 'POB_CRAFT_REVISION_REQUIRED', message: '缺少当前 PoB 文档版本，无法读取官方制作目录。' } });
        const loaded = await ensureLoaded(payload.code, expectedRevision, payload.name ?? '');
        if (!loaded?.success) return send(response, 422, { success: false, error: loaded?.error ?? { code: 'POB_CANONICAL_LOAD_FAILED', message: '当前 PoB 文档无法由官方核心重新载入。' } });
        const result = await engine.request({ action: 'craftCatalog', query: payload.query });
        if (!result?.success) return send(response, 422, result);
        return send(response, 200, { success: true, action: 'craftCatalog', canonicalRevision: expectedRevision, data: { ...result.data, sourceRevision: expectedRevision, canonicalRevision: expectedRevision } });
      }
      if (request.method === 'POST' && request.url === '/api/calculate') {
        const inputKeys = ['level', 'allocNodes', 'className', 'socketGroups', 'mainSocketGroup', 'calcsSkillGroup', 'buffMode'];
        if (inputKeys.some(key => payload[key] !== undefined)) return send(response, 400, { success: false, error: { code: 'POB_CANONICAL_WRITE_REQUIRED', message: '构建、技能和战斗状态修改必须通过官方 XML 提交接口。' } });
        return send(response, 200, await engine.request({ action: 'calculate' }));
      }
      return send(response, 404, { success: false, error: 'route not found' });
      });
    } catch (error) {
      return send(response, 400, { success: false, error: error.message });
    }
  });
}
