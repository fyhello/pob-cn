<template>
  <span :class="unsupported ? 'block rounded-sm border-l-2 border-rose-400 bg-rose-950/30 px-1.5 text-rose-300' : ''" :data-unsupported="unsupported ? 'true' : undefined" :title="unsupported ? '当前 PoB 核心未完整支持此词缀，不参与计算' : undefined">
    {{ text }}<span v-if="unsupported" class="ml-1 font-semibold">（不生效）</span>
  </span>
</template>

<script setup lang="ts">
defineProps<{ text: string; unsupported?: boolean }>();
</script>
