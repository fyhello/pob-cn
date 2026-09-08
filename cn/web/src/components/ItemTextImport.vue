<template>
  <section class="item-text-panel" aria-labelledby="item-text-title">
    <header class="border-b border-white/10 px-4 py-3">
      <h2 id="item-text-title" class="flex items-center gap-2 text-base text-poe-gold"><ClipboardPaste :size="18" />粘贴导入装备</h2>
    </header>
    <div class="item-text-body space-y-3 p-4">
      <textarea v-model="raw" aria-label="游戏或 PoB 装备文本" placeholder="游戏或 PoB 装备文本" :disabled="busy" class="h-28 min-h-24 max-h-48 w-full resize-y rounded border border-white/20 bg-black/30 p-3 font-mono text-xs text-gray-200" spellcheck="false"></textarea>
      <p v-if="error" role="alert" class="break-words text-sm text-red-300">{{ error }}</p>
      <p v-else-if="notice" role="status" class="text-sm text-emerald-300">{{ notice }}</p>
      <button :disabled="!raw.trim() || busy || store.isCalculating" class="btn-primary flex items-center gap-2 text-xs disabled:opacity-40" @click="loadPreview"><Search :size="16" />{{ busy ? '处理中...' : '预览' }}</button>
      <section v-if="preview" class="space-y-3 border-t border-white/10 pt-3">
        <h3 class="break-words text-sm text-poe-gold">{{ translateWebText(preview.name || preview.base || '') }}</h3>
        <div class="max-h-56 space-y-1 overflow-y-auto text-xs leading-relaxed text-gray-300">
          <ItemDisplayLines :lines="preview.displayLines ?? []" :unsupported="preview.displayLineUnsupported" />
        </div>
        <div v-if="preview.unparsedLines?.length" role="alert" class="space-y-1 border-t border-red-400/30 pt-3 text-xs text-red-300">
          <p>高亮词缀尚未被当前 PoB 核心完整支持，导入后不生效，不参与计算；原文会保留。</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button :disabled="!canImport" class="btn-primary flex items-center gap-2 text-xs disabled:opacity-40" @click="commit(false)"><Plus :size="16" />加入当前流派</button>
          <select v-model="targetKey" aria-label="导入穿戴槽位" :disabled="!canImport" class="min-w-0 max-w-full rounded border border-white/20 bg-[#202124] p-2 text-xs">
            <option value="">选择穿戴槽位</option>
            <option v-for="target in targets" :key="target.key" :value="target.key">{{ target.label }}</option>
          </select>
          <button :disabled="!canImport || !targetKey" class="btn-primary flex items-center gap-2 text-xs disabled:opacity-40" @click="commit(true)"><Check :size="16" />加入并穿戴</button>
        </div>
      </section>
      <div v-else class="flex min-h-28 items-center justify-center border-t border-white/10 text-xs text-gray-500">暂无物品预览</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { Check, ClipboardPaste, Plus, Search } from 'lucide-vue-next';
import { useBuildStore } from '../stores/buildStore';
import { requestForBuild } from '../api/bridgeClient';
import { translateWebText } from '../utils/webTranslation';
import ItemDisplayLines from './ItemDisplayLines.vue';

const store = useBuildStore();
const raw = ref('');
const error = ref('');
const notice = ref('');
const busy = ref(false);
const preview = ref<Record<string, any> | null>(null);
const targetKey = ref('');
let requestId = 0;
const canImport = computed(() => Boolean(preview.value) && !busy.value && !store.isCalculating);
const targets = computed(() => {
  const active = store.loadouts?.active;
  if (!active || !preview.value) return [];
  const result: Array<{ key: string; label: string; value: Record<string, unknown> }> = [];
  for (const slotName of preview.value.validTargetSlots?.equipment ?? []) {
    result.push({ key: `equipment:${slotName}`, label: translateWebText(slotName), value: { itemSetId: active.itemSetId, slotName } });
  }
  for (const socket of preview.value.validTargetSlots?.jewels ?? []) {
    result.push({ key: `jewel:${socket.nodeId}`, label: `${translateWebText('Jewel Socket')} #${socket.nodeId}`, value: { kind: 'jewel', specId: active.specId, nodeId: socket.nodeId } });
  }
  return result;
});
function invalidate() {
  requestId++;
  preview.value = null;
  targetKey.value = '';
  error.value = '';
  notice.value = '';
}
async function loadPreview() {
  if (busy.value || store.isCalculating || !raw.value.trim()) return;
  invalidate();
  const current = requestId;
  const document = store.canonicalBuild;
  if (!document) return;
  busy.value = true;
  error.value = '';
  try {
    const response = await requestForBuild(store, '/api/items/text-preview', { method: 'POST', body: JSON.stringify({ code: document.code, expectedRevision: document.version, raw: raw.value }) });
    const result = await response.json();
    if (current !== requestId) return;
    if (!response.ok || result.success !== true) throw new Error(result.error?.message ?? '官方物品预览失败。');
    if (result.data?.sourceRevision !== document.version) throw new Error('物品预览版本不一致，请重新预览。');
    preview.value = result.data;
  } catch (cause) { if (current === requestId) error.value = cause instanceof Error ? cause.message : '预览失败。'; }
  finally { busy.value = false; }
}
async function commit(equip: boolean) {
  if (!canImport.value) return;
  const target = equip ? targets.value.find(entry => entry.key === targetKey.value)?.value : undefined;
  if (equip && !target) return;
  const hasUnsupported = Boolean(preview.value?.unparsedLines?.length);
  busy.value = true;
  error.value = '';
  try {
    const result = await store.commitCanonicalMutation('/api/items/from-text', { raw: raw.value, target }, 'POB_ITEM_TEXT_IMPORT_FAILED', '官方物品文本导入失败。');
    if (result.success) {
      raw.value = '';
      invalidate();
      notice.value = equip ? '已加入当前 BD 并穿戴' : '已加入当前 BD';
      if (hasUnsupported) notice.value += '；未支持词缀已保留并标记为不生效，不参与计算。';
    }
    else error.value = result.error?.message ?? '导入失败。';
  } finally { busy.value = false; }
}
watch([raw, () => store.canonicalBuild?.version, () => store.sessionId], invalidate, { flush: 'sync' });
onUnmounted(invalidate);
</script>

<style scoped>
.item-text-panel { min-width: 0; overflow: hidden; border: 1px solid #454649; border-radius: 6px; background: #18191b; color: #eee; }
.item-text-body { max-height: 540px; overflow-y: auto; }
</style>
