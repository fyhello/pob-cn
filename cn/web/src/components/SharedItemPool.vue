<template>
  <component :is="embedded ? 'section' : 'dialog'" ref="container" aria-labelledby="pool-title" :class="embedded ? 'pool-embedded' : 'pool-dialog'" @cancel.prevent="library.showPool = false">
    <header class="flex items-center justify-between gap-3 border-b border-white/15 p-4">
      <h2 id="pool-title" class="flex items-center gap-2 text-base font-semibold"><Archive :size="18" class="text-sky-300" />公共物品池</h2>
      <button v-if="!embedded" title="关闭" aria-label="关闭公共物品池" class="p-1 text-gray-400 hover:text-white" @click="library.showPool = false"><X :size="20" /></button>
    </header>
    <div class="flex items-center gap-3 border-b border-white/10 px-4 py-3">
      <Search :size="16" class="shrink-0 text-gray-400" /><input ref="searchInput" v-model="query" aria-label="搜索公共物品" placeholder="搜索公共物品" class="min-w-0 flex-1 bg-transparent text-sm outline-none" :autofocus="!embedded" />
      <button title="刷新公共物品池" aria-label="刷新公共物品池" class="p-1 text-gray-400 hover:text-white" @click="library.refresh('items')"><RefreshCw :size="16" /></button>
    </div>
    <p v-if="library.error || previewError" role="alert" class="break-words px-4 py-3 text-sm text-red-300">{{ library.error || previewError }}</p>
    <p v-else-if="library.notice" role="status" class="px-4 py-2 text-sm text-emerald-300">{{ library.notice }}</p>
    <div class="pool-body">
      <ul class="min-h-0 overflow-y-auto divide-y divide-white/10">
        <li v-for="entry in filtered" :key="entry.id" class="flex items-center gap-1 px-3 py-3" :class="selectedId === entry.id ? 'bg-white/10' : ''">
          <button class="min-w-0 flex-1 py-1 text-left" @click="selectedId = entry.id">
            <span class="block break-words text-sm text-poe-gold">{{ translateWebText(entry.name) }}</span>
            <span class="mt-1 block text-xs text-gray-500">{{ translateWebText(entry.item?.base || '') }}</span>
          </button>
          <button title="重命名物品" aria-label="重命名物品" :disabled="library.busy" class="p-2 text-gray-400 hover:text-white" @click="library.rename('items', entry)"><Pencil :size="15" /></button>
          <button title="删除公共物品" aria-label="删除公共物品" :disabled="library.busy" class="p-2 text-gray-400 hover:text-red-300" @click="library.remove('items', entry)"><Trash2 :size="15" /></button>
        </li>
        <li v-if="!filtered.length" class="px-4 py-12 text-center text-sm text-gray-500">{{ query ? '没有匹配的物品' : '公共物品池为空' }}</li>
      </ul>
      <section class="pool-detail min-h-0 overflow-y-auto border-l border-white/10 p-4">
        <template v-if="selected">
          <h3 class="break-words text-base font-medium text-poe-gold">{{ translateWebText(selected.name) }}</h3>
          <div class="my-3 space-y-1 border-y border-white/10 py-3 text-xs leading-relaxed text-gray-300">
            <ItemDisplayLines :lines="displayItem?.displayLines ?? []" :unsupported="displayItem?.displayLineUnsupported" />
          </div>
          <div v-if="store.sessionId" class="space-y-4">
            <button :disabled="library.busy || store.isCalculating" class="btn-primary flex items-center gap-2 disabled:opacity-40" @click="library.useItem(selected.id, null)"><Plus :size="16" />加入当前流派</button>
            <div class="flex flex-wrap gap-2">
              <select v-model="targetKey" aria-label="穿戴槽位" class="min-w-0 max-w-full rounded border border-white/20 bg-[#202124] px-2 py-2 text-xs" :disabled="!preview || previewBusy || library.busy || store.isCalculating">
                <option value="">{{ previewBusy ? '正在读取槽位...' : preview ? '选择穿戴槽位' : '槽位待刷新' }}</option>
                <option v-for="target in targets" :key="target.key" :value="target.key">{{ target.label }}</option>
              </select>
              <button title="刷新穿戴槽位" aria-label="刷新穿戴槽位" :disabled="previewBusy || library.busy || store.isCalculating" class="p-2 text-gray-400 hover:text-white disabled:opacity-40" @click="loadPreview"><RefreshCw :size="16" /></button>
              <button :disabled="!targetKey || library.busy || previewBusy || store.isCalculating" class="btn-primary flex items-center gap-2 disabled:opacity-40" @click="equip"><Check :size="16" />加入并穿戴</button>
            </div>
          </div>
        </template>
        <p v-else class="py-8 text-center text-sm text-gray-500">未选择物品</p>
      </section>
    </div>
  </component>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { Archive, Check, Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-vue-next';
import { useLibraryStore } from '../stores/libraryStore';
import { useBuildStore } from '../stores/buildStore';
import { requestForBuild } from '../api/bridgeClient';
import { translateWebText } from '../utils/webTranslation';
import ItemDisplayLines from './ItemDisplayLines.vue';

const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false });
const library = useLibraryStore();
const store = useBuildStore();
const container = ref<HTMLElement>();
const searchInput = ref<HTMLInputElement>();
const query = ref('');
const selectedId = ref('');
const targetKey = ref('');
const preview = ref<Record<string, any> | null>(null);
const previewBusy = ref(false);
const previewError = ref('');
let requestId = 0;
const filtered = computed(() => library.items.filter(entry => `${entry.name} ${translateWebText(entry.name)} ${translateWebText(entry.item?.base || '')}`.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())));
const selected = computed(() => library.items.find(entry => entry.id === selectedId.value));
const displayItem = computed(() => preview.value ?? selected.value?.item);
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
  previewError.value = '';
  previewBusy.value = false;
}

async function loadPreview() {
  if (previewBusy.value || store.isCalculating) return;
  invalidate();
  const current = requestId;
  if (!selected.value || !store.sessionId || !store.canonicalBuild) return;
  previewBusy.value = true;
  try {
    const response = await requestForBuild(store, '/api/items/pool-preview', { method: 'POST', body: JSON.stringify({ id: selected.value.id, code: store.canonicalBuild?.code, expectedRevision: store.canonicalBuild?.version }) });
    const result = await response.json();
    if (!response.ok || result.success !== true) throw new Error(result.error?.message ?? '无法读取官方物品槽位。');
    if (current === requestId) preview.value = result.data;
  } catch (error) { if (current === requestId) previewError.value = error instanceof Error ? error.message : '读取失败。'; }
  finally { if (current === requestId) previewBusy.value = false; }
}

async function equip() {
  const target = targets.value.find(entry => entry.key === targetKey.value);
  if (selected.value && target) await library.useItem(selected.value.id, target.value);
}

function focusPool() {
  if (!props.embedded || !library.showPool) return;
  container.value?.scrollIntoView({ block: 'nearest' });
  searchInput.value?.focus({ preventScroll: true });
  library.showPool = false;
}

// 常驻面板只作废旧槽位，BD 更新不能触发额外的官方预览计算。
watch([selectedId, () => selected.value?.version, () => store.sessionId, () => store.canonicalBuild?.version], invalidate, { flush: 'sync' });
watch(selectedId, loadPreview);
watch(() => library.showPool, focusPool, { flush: 'post' });
onMounted(() => {
  if (!props.embedded) (container.value as HTMLDialogElement)?.showModal();
  focusPool();
  void library.refresh('items');
});
onUnmounted(invalidate);
</script>

<style scoped>
.pool-dialog { width: min(920px, calc(100% - 24px)); max-height: calc(100dvh - 32px); margin: auto; padding: 0; border: 1px solid #454649; border-radius: 6px; background: #18191b; color: #eee; }
.pool-dialog::backdrop { background: #0009; }
.pool-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); height: min(560px, 65dvh); }
.pool-embedded { display: flex; flex-direction: column; height: 340px; overflow: hidden; border: 1px solid #454649; border-radius: 6px; background: #18191b; color: #eee; }
.pool-embedded > :not(.pool-body) { flex-shrink: 0; }
.pool-embedded .pool-body { flex: 1; min-height: 0; height: auto; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(72px, 1fr) minmax(0, 1.4fr); }
.pool-embedded .pool-detail { border-left: 0; border-top: 1px solid #ffffff1a; }
@media (max-width: 600px) { .pool-body { grid-template-columns: minmax(0, 1fr); height: auto; max-height: 70dvh; overflow-y: auto; } .pool-body > ul { max-height: 240px; } .pool-body > section { border-left: 0; border-top: 1px solid #ffffff1a; overflow: visible; } }
.pool-embedded .pool-body > section { overflow-y: auto; }
</style>
