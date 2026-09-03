<template>
  <div 
    v-if="item && isVisible" 
    class="fixed z-[9999] pointer-events-none transition-transform duration-75 shadow-[0_10px_40px_rgba(0,0,0,0.95)] rounded-lg overflow-y-auto max-h-[88vh] border font-sans"
    :class="borderClass"
    :style="{ left: `${clampedX}px`, top: `${clampedY}px`, maxWidth: '370px', minWidth: '290px' }"
  >
    <div class="bg-[#0c0c11]/95 backdrop-blur-xl p-3.5 space-y-2.5 text-xs text-gray-200">
      <!-- 1. 顶部标题区 (双层暗金/金色游戏风格) -->
      <div 
        class="text-center py-2 -mx-3.5 -mt-3.5 px-3.5 border-b"
        :class="[headerBgClass, headerBorderClass]"
      >
        <h3 class="font-bold text-sm font-poe-title tracking-wide" :class="titleColorClass">
          {{ parsed.headerTitle }}
        </h3>
        <div v-if="parsed.headerBase" class="text-xs font-semibold mt-0.5 font-poe-title text-gray-300">
          {{ parsed.headerBase }}
        </div>
      </div>

      <!-- Native Lua supplies body rows separately from its header. -->
      <div v-if="parsed.bodyLines.length > 0" class="space-y-1 py-1 text-xs font-medium leading-relaxed">
        <div
          v-for="(line, index) in parsed.bodyLines"
          :key="`${index}-${line}`"
          class="break-words whitespace-pre-wrap"
          :class="index === 0 ? 'text-gray-300' : 'text-[#8888ff]'"
        >
          {{ line }}
        </div>
      </div>
      <div v-else class="py-3 text-center text-xs text-gray-500">
        暂无官方物品显示数据
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { translateWebItemLine } from '../utils/webTranslation';

const props = defineProps<{
  item: any;
  isVisible: boolean;
  mouseX: number;
  mouseY: number;
}>();

// 自适应边缘防溢出坐标（智能保证顶部标题与横幅 100% 完整可见）
const clampedX = computed(() => {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1920;
  if (props.mouseX + 390 > w) {
    return Math.max(12, props.mouseX - 380);
  }
  return props.mouseX + 20;
});

const clampedY = computed(() => {
  const h = typeof window !== 'undefined' ? window.innerHeight : 1080;
  const idealTop = props.mouseY - 60;
  const lineCount = Array.isArray(props.item?.tooltip?.bodyLines) ? props.item.tooltip.bodyLines.length : 0;
  const estimatedHeight = Math.min(h * 0.88, 120 + lineCount * 24);
  const maxTop = Math.max(12, h - estimatedHeight - 12);
  return Math.max(12, Math.min(idealTop, maxTop));
});

// 样式根据稀有度匹配
const rarity = computed(() => {
  const item = props.item;
  if (!item) return 'NORMAL';
  return typeof item.rarity === 'string' && item.rarity ? item.rarity.toUpperCase() : 'NORMAL';
});

const borderClass = computed(() => {
  switch (rarity.value) {
    case 'UNIQUE': return 'border-[#af6025]/80';
    case 'RARE': return 'border-[#f6d365]/70';
    case 'MAGIC': return 'border-[#8888ff]/70';
    default: return 'border-white/20';
  }
});

const headerBgClass = computed(() => {
  switch (rarity.value) {
    case 'UNIQUE': return 'bg-gradient-to-r from-transparent via-[#af6025]/30 to-transparent';
    case 'RARE': return 'bg-gradient-to-r from-transparent via-amber-900/25 to-transparent';
    case 'MAGIC': return 'bg-gradient-to-r from-transparent via-blue-900/25 to-transparent';
    default: return 'bg-white/5';
  }
});

const headerBorderClass = computed(() => {
  switch (rarity.value) {
    case 'UNIQUE': return 'border-[#af6025]/50';
    case 'RARE': return 'border-amber-500/40';
    case 'MAGIC': return 'border-blue-500/40';
    default: return 'border-white/10';
  }
});

const titleColorClass = computed(() => {
  switch (rarity.value) {
    case 'UNIQUE': return 'text-[#af6025]';
    case 'RARE': return 'text-[#f6d365]';
    case 'MAGIC': return 'text-[#8888ff]';
    default: return 'text-gray-100';
  }
});

function officialTooltipTitle(item: any, title: unknown): string {
  if (item?.rarity === 'RARE' && item?.crafted === true && typeof item?.title === 'string' && item.title.length > 0) return item.title;
  return typeof title === 'string' ? translateWebItemLine(title) : '';
}

// Lua owns the title/base metadata and body rows. This component must not
// infer duplicate headers from text.
const parsed = computed(() => {
  const item = props.item;
  const header = item?.tooltip?.header;
  const bodyLines = Array.isArray(item?.tooltip?.bodyLines)
    ? item.tooltip.bodyLines.filter((line: unknown): line is string => typeof line === 'string' && line.length > 0)
      .map((line: string) => translateWebItemLine(line))
    : [];
  return {
    headerTitle: officialTooltipTitle(item, header?.title),
    headerBase: typeof header?.base === 'string' ? translateWebItemLine(header.base) : '',
    bodyLines,
  };
});
</script>
