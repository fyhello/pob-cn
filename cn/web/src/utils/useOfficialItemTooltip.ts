import { onScopeDispose, shallowRef, watch } from 'vue';

type TooltipStore = {
  sessionId: string | null;
  documentEpoch: number;
  canonicalBuild: { version: number } | null;
  getOfficialItemTooltip(itemId: number): Promise<{ success: boolean; data?: { tooltip: Record<string, any> }; error?: { message: string } }>;
};

// 只按当前悬停加载官方浮窗；同一组件至多一个在途请求，队列只保留最后一次悬停。
export function useOfficialItemTooltip(store: TooltipStore, item: () => any, visible: () => boolean) {
  const tooltip = shallowRef<Record<string, any> | null>(null);
  const loading = shallowRef(false);
  const error = shallowRef('');
  const cache = new Map<number, Record<string, any>>();
  const identity = () => JSON.stringify([store.sessionId, store.documentEpoch, store.canonicalBuild?.version]);
  let documentKey = identity(), generation = 0, active = false;
  let pending: { id: number; documentKey: string; generation: number } | null = null;

  async function drain() {
    if (active) return;
    active = true;
    try {
      while (pending) {
        const request = pending;
        pending = null;
        try {
          const cached = cache.get(request.id);
          const result = cached ? { success: true, data: { tooltip: cached } } : await store.getOfficialItemTooltip(request.id);
          if (request.documentKey !== identity()) continue;
          const official = result.data?.tooltip;
          const valid = result.success && typeof official?.header?.title === 'string' && Array.isArray(official?.bodyLines) && official.bodyLines.every((line: unknown) => typeof line === 'string');
          if (valid && official) cache.set(request.id, official);
          if (request.generation !== generation) continue;
          if (valid && official) tooltip.value = official;
          else error.value = result.error?.message || 'Official item display could not be loaded.';
        } catch (cause) {
          if (request.generation === generation && request.documentKey === identity()) {
            error.value = cause instanceof Error ? cause.message : 'Official item display could not be loaded.';
          }
        } finally {
          if (request.generation === generation) loading.value = false;
        }
      }
    } finally {
      active = false;
    }
  }

  watch([identity, () => item()?.id, () => item()?.tooltip, visible], () => {
    generation++;
    pending = null;
    tooltip.value = null;
    loading.value = false;
    error.value = '';
    const currentDocument = identity();
    if (documentKey !== currentDocument) { cache.clear(); documentKey = currentDocument; }
    if (!visible() || !item()) return;
    if (item().tooltip) { tooltip.value = item().tooltip; return; }
    const id = Number(item().id);
    if (!Number.isInteger(id) || id <= 0 || !store.canonicalBuild) {
      error.value = 'Official item display is unavailable for this item.';
      return;
    }
    const cached = cache.get(id);
    if (cached) { tooltip.value = cached; return; }
    loading.value = true;
    pending = { id, documentKey, generation };
    void drain();
  }, { immediate: true, flush: 'sync' });

  onScopeDispose(() => { generation++; pending = null; cache.clear(); });
  return { tooltip, loading, error };
}
