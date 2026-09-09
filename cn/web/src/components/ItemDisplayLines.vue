<template>
  <p v-for="(line, index) in rows" :key="index" class="whitespace-pre-line break-words">
    <ItemModifierLine :text="line.translated" :unsupported="line.unsupported" />
  </p>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { localizeWebItemRows } from '../utils/webTranslation';
import { useBuildStore } from '../stores/buildStore';
import ItemModifierLine from './ItemModifierLine.vue';

const props = defineProps<{ lines: string[]; unsupported?: boolean[]; item?: Record<string, any> }>();
const store = useBuildStore();
const rows = computed(() => localizeWebItemRows(props.lines, props.unsupported, { item: props.item, items: store.itemLibrary }));
</script>
