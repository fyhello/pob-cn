<template>
  <p v-for="(line, index) in rows" :key="index" class="whitespace-pre-line break-words">
    <ItemModifierLine :text="line.text" :unsupported="line.unsupported" />
  </p>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { translateWebItemLines } from '../utils/webTranslation';
import ItemModifierLine from './ItemModifierLine.vue';

const props = defineProps<{ lines: string[]; unsupported?: boolean[] }>();
const rows = computed(() => {
  const groups: Array<{ lines: string[]; unsupported: boolean }> = [];
  props.lines.forEach((line, index) => {
    const unsupported = props.unsupported?.[index] === true;
    const previous = groups[groups.length - 1];
    // 仅合并支持状态相同的连续行，避免多行翻译使高亮错位。
    if (previous && previous.unsupported === unsupported) previous.lines.push(line);
    else groups.push({ lines: [line], unsupported });
  });
  return groups.flatMap(group => translateWebItemLines(group.lines).map(text => ({ text, unsupported: group.unsupported })));
});
</script>
