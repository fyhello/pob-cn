<template>
  <p v-for="(line, index) in rows" :key="index" class="whitespace-pre-line break-words"
    :class="line.presentationClass" :data-item-line-kind="line.kind">
    <ItemModifierLine :text="line.translated" :unsupported="line.unsupported" />
  </p>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { localizeWebItemRows } from '../utils/webTranslation';
import { presentItemRows } from '../utils/itemLinePresentation';
import { useBuildStore } from '../stores/buildStore';
import ItemModifierLine from './ItemModifierLine.vue';

const props = defineProps<{ lines: string[]; unsupported?: boolean[]; item?: Record<string, any>; tooltip?: boolean }>();
const store = useBuildStore();
const rows = computed(() => presentItemRows(
  localizeWebItemRows(props.lines, props.unsupported, { item: props.item, items: store.itemLibrary }),
  { item: props.item, tooltip: props.tooltip },
));
</script>
