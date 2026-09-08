import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { enqueueCanonicalMutation, useBuildStore } from './buildStore';
import { requestForBuild } from '../api/bridgeClient';

export interface LibraryEntry {
  id: string;
  version: number;
  name: string;
  updatedAt: string;
  code?: string;
  item?: Record<string, any>;
}

async function libraryRequest(path: string, payload?: Record<string, unknown>) {
  const response = await fetch(`/api/library/${path}`, {
    method: payload ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const result = await response.json();
  if (!response.ok || result.success !== true) throw new Error(result.error?.message ?? '存档库请求失败。');
  return result.data;
}

export const useLibraryStore = defineStore('library', () => {
  const build = useBuildStore();
  const builds = ref<LibraryEntry[]>([]);
  const items = ref<LibraryEntry[]>([]);
  const busy = ref(false);
  const error = ref('');
  const notice = ref('');
  const showPool = ref(false);
  const dirty = computed(() => Boolean(build.canonicalBuild && (!build.savedBuild
    || build.savedBuild.code !== build.canonicalBuild.code || build.savedBuild.name !== build.buildName)));

  async function perform(work: () => Promise<void>) {
    if (busy.value) return false;
    busy.value = true;
    error.value = '';
    notice.value = '';
    try { await work(); return true; }
    catch (reason) { error.value = reason instanceof Error ? reason.message : '存档操作失败。'; return false; }
    finally { busy.value = false; }
  }

  async function refresh(kind: 'builds' | 'items' = 'builds') {
    try {
      const entries = await libraryRequest(kind);
      if (kind === 'builds') builds.value = entries;
      else items.value = entries;
    } catch (reason) { error.value = reason instanceof Error ? reason.message : '无法读取列表。'; }
  }

  function confirmDiscard() {
    return (!dirty.value && !build.isCalculating) || window.confirm('当前 BD 尚未保存或仍在计算。是否放弃当前网页的修改？');
  }

  async function openSaved(id: string) {
    if (!confirmDiscard()) return false;
    return perform(async () => {
      const entry = await libraryRequest(`builds/${id}`) as LibraryEntry;
      if (!entry.code) throw new Error('存档缺少官方 PoB 文档。');
      const result = await build.openDocument(entry.code, entry.name);
      if (!result.success) throw new Error(result.error.message);
      build.savedBuild = { id: entry.id, version: entry.version, code: build.canonicalBuild!.code, name: entry.name };
      build.buildName = entry.name;
      build.saveToStorage();
    });
  }

  async function saveNow(name: string, asNew: boolean) {
    const result = await enqueueCanonicalMutation(build, async () => {
      const document = build.canonicalBuild;
      if (!document) return { success: false, error: { code: 'POB_DOCUMENT_MISSING', message: '请先打开或新建 BD。' } };
      const saved = asNew ? null : build.savedBuild;
      const previousName = build.buildName;
      const response = await requestForBuild(build, '/api/library/builds/save', {
        method: 'POST', body: JSON.stringify({ id: saved?.id, expectedVersion: saved?.version, expectedRevision: document.version, name }),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) return result;
      if (result.sourceRevision !== document.version) throw new Error('保存响应的文档版本不匹配。');
      build.savedBuild = { id: result.data.id, version: result.data.version, code: document.code, name };
      if (build.buildName === previousName) build.buildName = name;
      build.saveToStorage();
      return result;
    });
    if (!result.success) throw new Error(result.error?.message ?? '保存失败。');
    notice.value = '已保存';
    await refresh();
  }

  async function save(asNew = false) {
    let name = build.buildName.trim();
    if (asNew) {
      const entered = window.prompt('另存为', name);
      if (entered === null) return false;
      name = entered.trim();
    }
    return perform(() => saveNow(name, asNew));
  }

  async function create(name: string, code?: string) {
    if (!confirmDiscard()) return false;
    return perform(async () => {
      if (!name.trim()) throw new Error('请输入存档名称。');
      const result = await build.openDocument(code, name.trim());
      if (!result.success) throw new Error(result.error.message);
      await saveNow(name.trim(), true);
    });
  }

  async function rename(kind: 'builds' | 'items', entry: LibraryEntry) {
    const name = window.prompt('重命名', entry.name);
    if (name === null) return;
    await perform(async () => {
      await libraryRequest(`${kind}/rename`, { id: entry.id, expectedVersion: entry.version, name });
      await refresh(kind);
    });
  }

  async function remove(kind: 'builds' | 'items', entry: LibraryEntry) {
    if (!window.confirm(`确认删除“${entry.name}”？`)) return;
    await perform(async () => {
      await libraryRequest(`${kind}/delete`, { id: entry.id, expectedVersion: entry.version });
      await refresh(kind);
    });
  }

  function returnToLibrary() {
    if (busy.value || build.isOpening || !confirmDiscard()) return;
    build.closeDocument();
    error.value = '';
    notice.value = '';
    void refresh();
  }

  async function copyItem(itemId: number) {
    return perform(async () => {
      const result = await enqueueCanonicalMutation(build, async () => {
        const response = await requestForBuild(build, '/api/library/items/copy', {
          method: 'POST', body: JSON.stringify({ itemId, expectedRevision: build.canonicalBuild?.version }),
        });
        const result = await response.json();
        if (!response.ok || result.success !== true) throw new Error(result.error?.message ?? '复制物品失败。');
        return result;
      });
      if (!result.success) throw new Error(result.error?.message ?? '复制物品失败。');
      notice.value = '已复制到公共物品池';
      await refresh('items');
    });
  }

  async function useItem(id: string, target: Record<string, unknown> | null) {
    return perform(async () => {
      const result = await build.commitCanonicalMutation('/api/items/from-pool', { id, target }, 'POB_SHARED_ITEM_FAILED', '公共物品未能加入当前 BD。');
      if (!result.success) throw new Error(result.error?.message ?? '物品复制失败。');
      notice.value = target ? '已加入当前 BD 并穿戴' : '已加入当前 BD';
    });
  }

  async function restoreCurrent() {
    return perform(async () => {
      const code = build.canonicalBuild?.code;
      if (!code) throw new Error('当前网页没有可恢复的官方文档。');
      const saved = build.savedBuild;
      const result = await build.openDocument(code, build.buildName);
      if (!result.success) throw new Error(result.error.message);
      build.savedBuild = saved;
      build.saveToStorage();
    });
  }

  return { builds, items, busy, error, notice, showPool, dirty, refresh, openSaved, save, create, rename, remove, returnToLibrary, copyItem, useItem, restoreCurrent, confirmDiscard };
});
