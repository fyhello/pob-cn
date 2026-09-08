<template>
  <div class="unique-panel flex min-h-0 flex-1 flex-col" data-testid="unique-crafting">
    <main class="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_380px]">
      <section class="min-w-0 space-y-4 p-5 lg:border-r lg:border-white/10">
        <div v-if="sourceItemId" class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <span class="text-sm text-amber-300">{{ translateWebItemName(itemToEdit?.title || itemToEdit?.name || '') }}</span>
          <label class="flex items-center gap-2 text-xs"><input v-model="duplicate" type="checkbox" :disabled="busy" />另存副本</label>
        </div>
        <div v-else class="space-y-2">
          <div class="grid grid-cols-[minmax(0,1fr)_140px] gap-2">
            <label class="relative min-w-0"><Search class="absolute left-2 top-2 h-4 w-4 text-gray-400" /><input v-model="search" aria-label="搜索传奇" placeholder="搜索传奇" class="unique-input pl-8" /></label>
            <select v-model="category" aria-label="传奇类别" class="unique-input"><option value="">全部类别</option><option v-for="type in categories" :key="type" :value="type">{{ translateWebItemType(type) }}</option></select>
          </div>
          <select v-model="templateId" size="7" aria-label="官方传奇目录" class="unique-input h-40" :disabled="catalogLoading || busy">
            <option v-for="entry in filteredCatalog" :key="entry.id" :value="entry.id">{{ translateWebItemName(entry.name) }} · {{ translateWebItemName(entry.baseName) }}</option>
          </select>
          <p v-if="catalogLoading" role="status" class="text-xs text-gray-400">正在读取传奇目录...</p>
          <p v-else-if="!filteredCatalog.length" class="text-xs text-gray-400">没有匹配的传奇</p>
          <p v-if="selectedTemplate?.source" class="break-words text-xs text-gray-400">{{ translateWebItemLine(`Source: ${selectedTemplate.source}`) }}</p>
          <p v-if="selectedTemplate?.league" class="break-words text-xs text-gray-400">{{ translateWebText(selectedTemplate.league) }}</p>
        </div>

        <fieldset v-if="options" :disabled="busy" class="min-w-0 space-y-4">
          <div class="flex flex-wrap gap-2 border-b border-white/10 pb-3 text-xs"><span class="text-gray-400">底材</span><span class="text-amber-200">{{ translateWebItemName(options.item.base) }}</span></div>
          <div v-for="(variant, index) in options.variants" :key="variant.field" class="space-y-1">
            <label :for="variant.field" class="text-xs text-gray-300">选项 {{ index + 1 }}</label>
            <input v-if="options.variantList.length > 20" v-model="variantSearch[variant.field]" :aria-label="`搜索选项 ${index + 1}`" placeholder="筛选选项" class="unique-input" />
            <select :id="variant.field" :value="variants[variant.field] ?? variant.value" class="unique-input" @change="setVariant(variant.field, $event)">
              <option v-for="entry in variantChoices(variant.field, variant.value)" :key="entry.id" :value="entry.id">{{ translateWebItemLine(entry.label) }}</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <label v-if="options.quality.canSet" class="space-y-1 text-xs">品质<input type="number" :value="draft.quality ?? options.quality.value" :min="options.quality.min" :max="options.quality.max" class="unique-input" @change="setNumber('quality', $event)" /></label>
            <label v-if="options.socketCount.canSet" class="space-y-1 text-xs">符文孔<input type="number" :value="draft.socketCount ?? options.socketCount.value" :min="options.socketCount.min" :max="options.socketCount.max" class="unique-input" @change="setNumber('socketCount', $event, true)" /></label>
            <label v-if="options.catalyst.canSet" class="space-y-1 text-xs">催化剂<select :value="draft.catalyst ?? options.catalyst.value" class="unique-input" @change="setNumber('catalyst', $event)"><option v-for="entry in options.catalyst.allowed" :key="entry.id" :value="entry.id">{{ translateWebText(entry.name) }}</option></select></label>
            <label v-if="options.catalyst.quality.canSet" class="space-y-1 text-xs">催化剂品质<input type="number" :value="draft.catalystQuality ?? options.catalyst.quality.value" :min="options.catalyst.quality.min" :max="options.catalyst.quality.max" class="unique-input" @change="setNumber('catalystQuality', $event)" /></label>
          </div>
          <div v-for="(rune, index) in options.runes" :key="index" class="space-y-1 text-xs">
            <label :for="`unique-rune-${index}`">符文 {{ index + 1 }}</label>
            <select :id="`unique-rune-${index}`" :value="draft.runes?.[index] ?? rune" class="unique-input" @change="setRune(index, $event)">
              <option v-if="!options.runeCapabilities.allowed.includes(rune)" :value="rune">{{ translateRuneName(rune) }}</option>
              <option v-for="name in options.runeCapabilities.allowed" :key="name" :value="name">{{ translateRuneName(name) }}</option>
            </select>
          </div>
          <div v-for="range in options.ranges" :key="range.id" class="space-y-2 border-t border-white/10 pt-3">
            <label :for="range.id" class="block break-words text-xs leading-relaxed text-indigo-200">{{ translateWebItemLine(range.line) }}</label>
            <div class="flex items-center gap-3"><input :id="range.id" type="range" min="0" max="1" step="0.001" :value="rangeValue(range)" class="h-5 min-w-0 flex-1 accent-amber-400" @input="setRoll(range.id, $event)" /><input type="number" min="0" max="1" step="0.001" :value="rangeValue(range)" :aria-label="`词条范围 ${range.id}`" class="unique-input w-24" @change="setRoll(range.id, $event)" /></div>
          </div>
          <p v-if="sourceItemId && !options.ranges.length && !options.variants.length" class="text-xs text-gray-400">当前物品没有可调范围或变体元数据，原词缀保持不变。</p>
          <label class="block space-y-1 border-t border-white/10 pt-3 text-xs">保存目标<select v-model="targetKey" class="unique-input"><option value="">仅保存到物品库</option><option v-for="slot in targets" :key="slot.key" :value="slot.key">{{ slot.label }}</option></select></label>
        </fieldset>
        <p v-if="error" role="alert" class="break-words rounded border border-rose-700/60 bg-rose-950/30 p-3 text-xs text-rose-200">{{ error }}</p>
      </section>

      <aside class="min-w-0 space-y-3 bg-black/30 p-4">
        <div class="flex items-center justify-between border-b border-white/10 pb-2">
          <div class="flex gap-3 text-xs" role="tablist"><button role="tab" :aria-selected="!showRaw" :class="!showRaw ? 'text-amber-300' : 'text-gray-400'" @click="showRaw = false">物品预览</button><button role="tab" :aria-selected="showRaw" :class="showRaw ? 'text-amber-300' : 'text-gray-400'" @click="showRaw = true">PoB 源码</button></div>
          <button :disabled="!currentItem" title="复制 PoB 源码" aria-label="复制 PoB 源码" class="p-1 text-gray-300" @click="copyRaw"><Clipboard class="h-4 w-4" /></button>
        </div>
        <p v-if="optionsLoading" role="status" class="text-xs text-gray-400">正在更新预览...</p>
        <p v-if="copied" role="status" class="text-xs text-emerald-300">已复制源码</p>
        <pre v-if="showRaw && currentItem" class="max-h-[55vh] overflow-auto whitespace-pre-wrap break-words text-xs text-amber-100">{{ currentItem.raw }}</pre>
        <div v-else-if="currentItem?.tooltip?.header" class="rounded border border-amber-500/40 bg-black/50 p-3 text-xs" data-testid="unique-preview">
          <div class="border-b border-amber-500/30 pb-2 text-center"><div class="font-semibold text-amber-300">{{ translateWebItemName(currentItem.tooltip.header.title) }}</div><div class="mt-1 text-gray-300">{{ translateWebItemLine(currentItem.tooltip.header.base || '') }}</div></div>
          <div class="space-y-1 pt-2 leading-relaxed text-indigo-200"><div v-for="(line, index) in currentItem.tooltip.bodyLines" :key="index" class="break-words"><ItemModifierLine :text="translateWebItemLine(line)" :unsupported="currentItem.tooltip.bodyLineUnsupported?.[index] === true" /></div></div>
        </div>
        <p v-else class="py-6 text-center text-xs text-gray-400">请选择传奇</p>
      </aside>
    </main>
    <footer class="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 bg-black/50 px-5 py-3">
      <button class="unique-button" @click="emit('close')">取消</button>
      <button class="unique-button text-cyan-200" :disabled="!canPreview || busy" @click="preview"><Search class="h-4 w-4" />{{ busy ? '处理中...' : '官方预览' }}</button>
      <button class="unique-button border-amber-500/40 bg-amber-700/70 text-white" :disabled="!canSave || busy" @click="commit"><Save class="h-4 w-4" />{{ sourceItemId && !duplicate ? '保存修改' : target ? '保存并穿戴' : '保存到物品库' }}</button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { Clipboard, Save, Search } from 'lucide-vue-next';
import { useBuildStore } from '../stores/buildStore';
import { translateRuneName, translateWebItemLine, translateWebItemName, translateWebItemType, translateWebText } from '../utils/webTranslation';
import ItemModifierLine from './ItemModifierLine.vue';

type Target = { kind: 'equipment'; itemSetId: number; slotName: string } | { kind: 'jewel'; specId: number; nodeId: number };
type Draft = { kind: 'unique'; templateId?: string; variants?: Record<string, number>; ranges?: Array<{ id: string; roll: number }>; rangeBasis?: string; quality?: number; socketCount?: number; catalyst?: number; catalystQuality?: number; runes?: string[] };
type Numeric = { canSet: boolean; value?: number; min: number; max: number };
type Range = { id: string; line: string; roll: number };
type CatalogEntry = { id: string; name: string; baseName: string; type: string; source?: string; league?: string };
type Options = { item: any; variants: Array<{ field: string; value: number }>; variantList: string[]; ranges: Range[]; rangeBasis: string; quality: Numeric; socketCount: Numeric; catalyst: { canSet: boolean; value: number; allowed: Array<{ id: number; name: string }>; quality: Numeric }; runes: string[]; runeCapabilities: { allowed: string[] }; validTargetSlots: { equipment: string[]; jewels: Array<{ nodeId: number; slotName: string }> } };
const props = defineProps<{ itemToEdit?: any; initialCategory?: string; initialTarget?: Target | null }>();
const emit = defineEmits<{ close: []; created: [itemId: number] }>();
const store = useBuildStore();
const catalog = ref<CatalogEntry[]>([]);
const catalogLoading = ref(false);
const templateId = ref('');
const search = ref('');
const category = ref(props.initialCategory || '');
const duplicate = ref(false);
const draft = ref<Draft>({ kind: 'unique' });
const options = ref<Options | null>(null);
const optionsLoading = ref(false);
const variantSearch = reactive<Record<string, string>>({});
const error = ref('');
const busy = ref(false);
const showRaw = ref(false);
const copied = ref(false);
const targetKey = ref('');
const previewKey = ref('');
const optionsKey = ref('');
const sourceItemId = computed(() => {
  const value = Number(props.itemToEdit?.id);
  return Number.isInteger(value) && value > 0 ? value : undefined;
});
const operation = computed(() => sourceItemId.value ? duplicate.value ? 'duplicate' : 'edit' : 'create');
const variants = computed(() => draft.value.variants ?? {});
const categories = computed(() => [...new Set(catalog.value.map(entry => entry.type))].sort());
const selectedTemplate = computed(() => catalog.value.find(entry => entry.id === templateId.value));
const filteredCatalog = computed(() => {
  const query = search.value.trim().toLowerCase();
  return catalog.value.filter(entry => (!category.value || entry.type === category.value) && (!query || `${entry.id} ${translateWebItemName(entry.name)} ${translateWebItemName(entry.baseName)}`.toLowerCase().includes(query)));
});
const documentKey = computed(() => JSON.stringify([store.sessionId, store.documentEpoch, store.canonicalBuild?.version]));
const draftKey = computed(() => JSON.stringify([documentKey.value, sourceItemId.value, draft.value]));
const targets = computed<Array<{ key: string; label: string; value: Target }>>(() => {
  const result: Array<{ key: string; label: string; value: Target }> = [];
  const active = store.loadouts?.active;
  if (active && Number.isInteger(active.itemSetId)) for (const slotName of options.value?.validTargetSlots.equipment ?? []) result.push({ key: `equipment:${slotName}`, label: translateWebText(slotName), value: { kind: 'equipment', itemSetId: active.itemSetId, slotName } });
  if (active && Number.isInteger(active.specId)) for (const slot of options.value?.validTargetSlots.jewels ?? []) result.push({ key: `jewel:${slot.nodeId}`, label: `${translateWebText(slot.slotName)} #${slot.nodeId}`, value: { kind: 'jewel', specId: active.specId, nodeId: slot.nodeId } });
  return result;
});
const target = computed(() => targets.value.find(entry => entry.key === targetKey.value)?.value ?? null);
const requestKey = computed(() => JSON.stringify([draftKey.value, operation.value, target.value]));
const currentItem = computed(() => optionsKey.value === draftKey.value ? options.value?.item : null);
const canPreview = computed(() => Boolean(currentItem.value && !optionsLoading.value));
const canSave = computed(() => canPreview.value && previewKey.value === requestKey.value);
let requestSequence = 0;
let disposed = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let initialTargetPending = true;

function variantChoices(field: string, current: number) {
  const query = (variantSearch[field] || '').trim().toLowerCase();
  return (options.value?.variantList ?? []).map((label, index) => ({ id: index + 1, label })).filter(entry => entry.id === (variants.value[field] ?? current) || !query || `${entry.label} ${translateWebItemLine(entry.label)}`.toLowerCase().includes(query));
}
function clearRanges() { delete draft.value.ranges; delete draft.value.rangeBasis; }
function setVariant(field: string, event: Event) {
  clearRanges();
  draft.value.variants = { ...variants.value, [field]: Number((event.target as HTMLSelectElement).value) };
  delete draft.value.runes;
}
function setNumber(field: 'quality' | 'socketCount' | 'catalyst' | 'catalystQuality', event: Event, structural = false) {
  if (structural) { clearRanges(); delete draft.value.runes; }
  if (field === 'catalyst') delete draft.value.catalystQuality;
  draft.value[field] = Number((event.target as HTMLInputElement).value);
}
function setRune(index: number, event: Event) {
  clearRanges();
  const runes = [...(draft.value.runes ?? options.value?.runes ?? [])];
  runes[index] = (event.target as HTMLSelectElement).value;
  draft.value.runes = runes;
}
function rangeValue(range: Range) { return draft.value.ranges?.find(entry => entry.id === range.id)?.roll ?? range.roll; }
function setRoll(id: string, event: Event) {
  if (!options.value) return;
  const ranges = options.value.ranges.map(range => ({ id: range.id, roll: rangeValue(range) }));
  const changed = ranges.find(range => range.id === id);
  if (changed) changed.roll = Number((event.target as HTMLInputElement).value);
  draft.value.rangeBasis = options.value.rangeBasis;
  draft.value.ranges = ranges;
}
async function refreshOptions() {
  if (disposed || (!sourceItemId.value && !draft.value.templateId)) return;
  const sequence = ++requestSequence;
  const key = draftKey.value;
  optionsLoading.value = true;
  const result = await store.getOfficialCraftOptions({ action: operation.value, sourceItemId: sourceItemId.value, draft: JSON.parse(JSON.stringify(draft.value)) });
  if (disposed || sequence !== requestSequence || key !== draftKey.value) return;
  optionsLoading.value = false;
  if (!result.success || !result.data?.item?.tooltip) { error.value = result.error?.message || '官方传奇预览不可用'; return; }
  const value = result.data;
  options.value = { ...value, variants: Array.isArray(value.variants) ? value.variants : [], variantList: Array.isArray(value.variantList) ? value.variantList : [], ranges: Array.isArray(value.ranges) ? value.ranges : [], runes: Array.isArray(value.runes) ? value.runes : [], runeCapabilities: { ...value.runeCapabilities, allowed: Array.isArray(value.runeCapabilities?.allowed) ? value.runeCapabilities.allowed : [] }, validTargetSlots: { equipment: Array.isArray(value.validTargetSlots?.equipment) ? value.validTargetSlots.equipment : [], jewels: Array.isArray(value.validTargetSlots?.jewels) ? value.validTargetSlots.jewels : [] } } as Options;
  if (targetKey.value && !targets.value.some(entry => entry.key === targetKey.value)) targetKey.value = '';
  if (initialTargetPending) {
    initialTargetPending = false;
    const wanted = props.initialTarget;
    const key = wanted?.kind === 'jewel' ? `jewel:${wanted.nodeId}` : wanted ? `equipment:${wanted.slotName}` : '';
    targetKey.value = targets.value.some(entry => entry.key === key) ? key : '';
  }
  optionsKey.value = key;
  error.value = '';
  if (!target.value && operation.value !== 'edit') previewKey.value = requestKey.value;
}
function scheduleOptions() {
  if (timer) clearTimeout(timer);
  optionsKey.value = '';
  previewKey.value = '';
  optionsLoading.value = Boolean(sourceItemId.value || draft.value.templateId);
  timer = setTimeout(() => { timer = undefined; void refreshOptions(); }, 120);
}
async function preview() {
  if (!canPreview.value || busy.value) return;
  const key = requestKey.value;
  busy.value = true;
  try {
    const result = await store.previewOfficialCraft(operation.value, target.value, JSON.parse(JSON.stringify(draft.value)), sourceItemId.value);
    if (disposed || key !== requestKey.value) return;
    if (!result.success || !result.data?.item) throw new Error(result.error?.message || '官方传奇计算预览失败');
    options.value!.item = result.data.item;
    previewKey.value = key;
    error.value = '';
  } catch (issue) { if (!disposed) error.value = issue instanceof Error ? issue.message : '官方预览失败'; }
  finally { busy.value = false; }
}
async function commit() {
  if (!canSave.value || busy.value) return;
  busy.value = true;
  try {
    const result = await store.commitOfficialCraft(operation.value, target.value, JSON.parse(JSON.stringify(draft.value)), sourceItemId.value);
    if (!result.success || !result.data?.item) throw new Error(result.error?.message || '传奇保存失败');
    emit('created', result.data.item.id);
    emit('close');
  } catch (issue) { error.value = issue instanceof Error ? issue.message : '传奇保存失败'; }
  finally { busy.value = false; }
}
async function copyRaw() {
  if (!currentItem.value) return;
  try { await navigator.clipboard.writeText(currentItem.value.raw); copied.value = true; }
  catch (issue) { error.value = issue instanceof Error ? issue.message : '复制源码失败'; }
}
watch(templateId, value => {
  draft.value = { kind: 'unique', templateId: value };
  options.value = null;
  for (const field of Object.keys(variantSearch)) delete variantSearch[field];
});
watch(draftKey, scheduleOptions, { flush: 'sync' });
watch(requestKey, () => { previewKey.value = ''; });
watch(documentKey, () => { if (!busy.value) emit('close'); });
onMounted(async () => {
  if (sourceItemId.value) { await refreshOptions(); return; }
  catalogLoading.value = true;
  const result = await store.getOfficialCraftCatalog('', 'unique');
  if (disposed) return;
  catalogLoading.value = false;
  if (!result.success || !Array.isArray(result.data?.uniques)) { error.value = result.error?.message || '官方传奇目录不可用'; return; }
  catalog.value = result.data.uniques;
});
onUnmounted(() => { disposed = true; requestSequence++; if (timer) clearTimeout(timer); });
</script>

<style scoped>
.unique-input { display: block; box-sizing: border-box; width: 100%; min-width: 0; border: 1px solid #ffffff30; border-radius: 4px; background: #08090d; color: #e5e7eb; padding: 7px 8px; font-size: 12px; }
.unique-input.pl-8 { padding-left: 32px; }
.unique-input.w-24 { width: 96px; }
.unique-input:focus-visible, button:focus-visible { outline: 2px solid #22d3ee; outline-offset: 2px; }
.unique-input option { padding: 4px; }
.unique-button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 32px; padding: 6px 12px; border: 1px solid #ffffff25; border-radius: 4px; font-size: 12px; }
button:disabled, select:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
