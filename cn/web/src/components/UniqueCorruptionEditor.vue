<template>
  <section class="space-y-3 border-t border-rose-800/50 pt-3 text-xs" data-testid="unique-corruption">
    <label class="flex items-center gap-2 text-rose-200"><input type="checkbox" :checked="enabled" :disabled="!options.canSet || options.inherited" @change="toggle" />腐化成品</label>
    <p v-if="options.reason" class="leading-relaxed text-gray-400">{{ options.reason }}</p>
    <template v-if="enabled && options.canSet">
      <p class="leading-relaxed text-gray-400">编辑目标成品，不模拟随机过程。本次不提供腐化加孔。</p>
      <template v-if="options.modsCanSet && source">
        <label class="block space-y-1">腐化来源<select aria-label="腐化来源" :value="source.id" class="corruption-input" @change="setSource"><option v-for="entry in options.sources" :key="entry.id" :value="entry.id">{{ translateSource(entry.name) }}</option></select></label>
        <label class="block space-y-1">筛选腐化词缀<input v-model="search" class="corruption-input" placeholder="搜索词缀" /></label>
        <div v-for="index in source.maxMods" :key="index" class="space-y-2">
          <label class="block space-y-1">腐化词缀 {{ index }}<select :aria-label="`腐化词缀 ${index}`" :value="selected[index - 1]?.id || ''" class="corruption-input" @change="setMod(index - 1, $event)"><option value="">无</option><option v-for="entry in choices(index - 1)" :key="entry.id" :value="entry.id">{{ entry.lines.map(line => translateWebItemLine(line, { item })).join(' / ') }}</option></select></label>
          <label v-if="selected[index - 1]" class="flex items-center gap-3 text-gray-400">词缀调值<input type="range" min="0" max="1" step="0.001" :aria-label="`腐化词缀调值 ${index}`" :value="selected[index - 1]?.roll" class="min-w-0 flex-1 accent-rose-400" @input="setModRoll(index - 1, $event)" /></label>
        </div>
      </template>
      <div v-for="range in options.ranges" :key="range.id" class="space-y-2 border-t border-white/10 pt-3">
        <label :for="`corruption-${range.id}`" class="block break-words leading-relaxed text-indigo-200">{{ translateWebItemLine(range.line, { item }) }}</label>
        <div class="flex items-center gap-3"><span class="shrink-0 text-rose-200">腐化倍率 {{ range.value }}</span><input :id="`corruption-${range.id}`" type="range" min="0" max="1" step="0.001" :aria-label="`腐化倍率 ${range.id}`" :value="draft?.ranges?.find(entry => entry.id === range.id)?.roll ?? range.roll" class="min-w-0 flex-1 accent-rose-400" @input="setRange(range.id, $event)" /></div>
      </div>
      <p v-if="!options.ranges.length" class="text-gray-400">当前变体没有官方支持的可调腐化倍率。</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { CorruptionDraft, CorruptionOptions } from '../types/uniqueCorruption';
import { translateWebItemLine, translateWebItemName, translateWebText } from '../utils/webTranslation';

const props = defineProps<{ options: CorruptionOptions; draft?: CorruptionDraft; item: any }>();
const emit = defineEmits<{ change: [value: CorruptionDraft | undefined] }>();
const search = ref('');
const enabled = computed(() => Boolean(props.draft || props.options.corrupted));
const source = computed(() => props.options.sources.find(entry => entry.id === (props.draft?.source ?? props.options.source)));
const selected = computed(() => props.draft?.mods ?? props.options.selected);
function next(): CorruptionDraft { return { ...(props.draft ?? { basis: props.options.basis }) }; }
function translateSource(name: string) { return name === 'Corrupted' ? translateWebText(name) : translateWebItemName(name); }
function toggle(event: Event) { emit('change', (event.target as HTMLInputElement).checked ? next() : undefined); }
function setSource(event: Event) { emit('change', { ...next(), source: (event.target as HTMLSelectElement).value, mods: [] }); }
function choices(index: number) {
  const query = search.value.trim().toLowerCase();
  const used = new Set(selected.value.filter((_, position) => position !== index).map(entry => source.value?.mods.find(mod => mod.id === entry.id)?.group));
  return (source.value?.mods ?? []).filter(entry => entry.id === selected.value[index]?.id || (!used.has(entry.group) && (!query || `${entry.lines.join(' ')} ${entry.lines.map(line => translateWebItemLine(line, { item: props.item })).join(' ')}`.toLowerCase().includes(query))));
}
function setMod(index: number, event: Event) {
  const id = (event.target as HTMLSelectElement).value;
  const mods = selected.value.map(entry => ({ ...entry }));
  if (id) mods[index] = { id, roll: props.options.defaultModRoll }; else mods.splice(index, 1);
  emit('change', { ...next(), source: source.value?.id, mods: mods.filter(Boolean) });
}
function setModRoll(index: number, event: Event) {
  const mods = selected.value.map(entry => ({ ...entry }));
  mods[index]!.roll = Number((event.target as HTMLInputElement).value);
  emit('change', { ...next(), mods });
}
function setRange(id: string, event: Event) {
  const ranges = [...(props.draft?.ranges ?? [])].filter(entry => entry.id !== id);
  ranges.push({ id, roll: Number((event.target as HTMLInputElement).value) });
  emit('change', { ...next(), ranges });
}
</script>

<style scoped>
.corruption-input { display: block; width: 100%; min-width: 0; border: 1px solid #ffffff30; border-radius: 4px; background: #08090d; color: #e5e7eb; padding: 7px 8px; font-size: 12px; }
.corruption-input:focus-visible, input:focus-visible { outline: 2px solid #22d3ee; outline-offset: 2px; }
</style>
