<template>
  <div class="flex flex-wrap items-center gap-2 text-xs" aria-label="计算武器组">
    <span class="text-gray-400">计算武器组</span>
    <div class="flex overflow-hidden rounded border border-white/20" role="group" aria-label="武器组切换">
      <button v-for="group in [1, 2]" :key="group" :aria-pressed="active === group" :disabled="busy || store.isCalculating || !store.canonicalBuild" :class="active === group ? 'bg-white/15 text-poe-gold' : 'text-gray-400 hover:bg-white/5'" class="h-8 w-10 disabled:opacity-50" @click="select(group)">{{ group === 1 ? 'I' : 'II' }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useBuildStore } from '../stores/buildStore';
const store = useBuildStore();
const busy = ref(false);
const active = computed(() => {
  const itemSet = store.loadouts?.itemSets?.find((entry: { id: number }) => entry.id === store.loadouts?.active?.itemSetId);
  return itemSet ? (itemSet.useSecondWeaponSet ? 2 : 1) : null;
});
async function select(weaponSet: number) {
  if (busy.value || weaponSet === active.value) return;
  busy.value = true;
  try { await store.commitOfficialBuildChanges({ weaponSet }); }
  finally { busy.value = false; }
}
</script>
