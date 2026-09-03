<template>
  <div class="flex-1 overflow-y-auto bg-black/95 p-6">
    <div class="mx-auto max-w-6xl space-y-5">
      <div class="flex items-center gap-3 border-b border-poe-border/80 pb-4">
        <SlidersHorizontal class="h-5 w-5 text-poe-gold" />
        <div>
          <h2 class="text-xl font-bold text-poe-gold font-poe-title">战斗条件与状态</h2>
          <p class="mt-1 text-xs text-gray-400">当前配置集中的选项均由官方 PoB 保存并参与重算。</p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <input v-model="query" type="search" placeholder="筛选战斗条件" class="w-full max-w-sm border border-poe-border bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-poe-gold" />
        <span v-if="store.config?.activeConfigSetId" class="text-xs text-gray-500">配置集 #{{ store.config.activeConfigSetId }}</span>
      </div>

      <p v-if="error" class="border border-red-900/70 bg-red-950/30 px-3 py-2 text-sm text-red-200">{{ error }}</p>
      <p v-if="!sections.length" class="py-12 text-center text-sm text-gray-500">当前官方流派配置未返回可编辑的战斗配置。</p>

      <section v-for="section in sections" :key="section.name" class="border border-poe-border/80 bg-black/35">
        <h3 class="border-b border-poe-border/70 px-4 py-3 text-sm font-bold text-gray-200">{{ display(section.name) }}</h3>
        <div class="divide-y divide-poe-border/50">
          <div v-for="option in section.options" :key="option.var" class="grid grid-cols-1 gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,360px)] md:items-center">
            <label :for="`config-${option.var}`" class="text-sm text-gray-200">{{ display(option.label) }}</label>

            <input v-if="option.type === 'check'" :id="`config-${option.var}`" type="checkbox" class="h-4 w-4 accent-amber-400" :checked="option.value === true" :disabled="store.isCalculating" @change="commit(option, ($event.target as HTMLInputElement).checked)" />

            <input v-else-if="isNumber(option.type)" :id="`config-${option.var}`" type="number" :step="option.type === 'float' ? 'any' : '1'" :value="option.value ?? option.placeholder ?? ''" :disabled="store.isCalculating" class="w-full border border-poe-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-poe-gold" @change="commit(option, numberValue($event))" />

            <select v-else-if="option.type === 'list'" :id="`config-${option.var}`" :value="String(option.value ?? option.placeholder ?? '')" :disabled="store.isCalculating" class="w-full border border-poe-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-poe-gold" @change="commit(option, selectedValue(option, $event))">
              <option v-for="choice in option.list || []" :key="String(choice.value)" :value="String(choice.value)">{{ display(choice.label) }}</option>
            </select>

            <textarea v-else :id="`config-${option.var}`" :value="option.value ?? option.placeholder ?? ''" :disabled="store.isCalculating" rows="3" class="w-full resize-y border border-poe-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-poe-gold" @change="commit(option, ($event.target as HTMLTextAreaElement).value)" />
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { SlidersHorizontal } from 'lucide-vue-next';
import { useBuildStore } from '../stores/buildStore';
import { translateWebText } from '../utils/webTranslation';

const store = useBuildStore();
const query = ref('');
const error = ref('');

const sections = computed(() => {
  const grouped = new Map<string, any[]>();
  const needle = query.value.trim().toLowerCase();
  for (const option of store.config?.options || []) {
    const label = `${option.label || ''} ${option.var || ''}`.toLowerCase();
    if (needle && !label.includes(needle)) continue;
    const name = option.section || '其他';
    const entries = grouped.get(name) || [];
    entries.push(option);
    grouped.set(name, entries);
  }
  return [...grouped.entries()].map(([name, options]) => ({ name, options }));
});

function display(value: unknown): string {
  return typeof value === 'string' ? translateWebText(value) : '';
}

function isNumber(type: string): boolean {
  return ['count', 'countAllowZero', 'integer', 'float'].includes(type);
}

function numberValue(event: Event): number | null {
  const raw = (event.target as HTMLInputElement).value;
  if (raw === '' || raw === null || raw === undefined) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function selectedValue(option: any, event: Event): unknown {
  const value = (event.target as HTMLSelectElement).value;
  if (value === '' || value === null || value === undefined) return null;
  return (option.list || []).find((choice: any) => String(choice.value) === value)?.value ?? null;
}

async function commit(option: any, value: unknown) {
  if (typeof option?.var !== 'string') return;
  error.value = '';
  const result = await store.commitOfficialConfigChange(option.var, value === '' ? null : value);
  if (!result.success) error.value = result.error?.message || '官方战斗配置保存失败。';
}
</script>
