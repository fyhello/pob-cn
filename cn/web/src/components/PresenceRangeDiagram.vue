<template>
  <section class="overflow-hidden rounded-lg border border-cyan-400/30 bg-black p-1.5">
    <div class="relative aspect-video w-full overflow-hidden rounded-md" role="img" :aria-label="translateCalcFormulaLine(visual.label)">
      <img :src="rangeGuide" alt="" aria-hidden="true" class="absolute inset-0 h-full w-full" />
      <svg class="absolute inset-0 h-full w-full" viewBox="0 0 480 270" preserveAspectRatio="none" aria-hidden="true">
        <rect
          v-for="(scanline, index) in visual.scanlines"
          :key="index"
          :x="scanline.x"
          :y="scanline.y"
          :width="scanline.width"
          height="1"
          fill="#80ff80"
          fill-opacity="0.33"
        />
      </svg>
      <img :src="gameUiSmall" alt="" aria-hidden="true" class="absolute inset-0 h-full w-full" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { translateCalcFormulaLine } from '../utils/webTranslation';
import rangeGuide from '../assets/range_guide.png';
import gameUiSmall from '../assets/game_ui_small.png';

interface OfficialRadiusScanline {
  x: number;
  y: number;
  width: number;
}

export interface OfficialRadiusVisual {
  key: string;
  label: string;
  radius: number;
  displayValue: string;
  scanlines: OfficialRadiusScanline[];
}

defineProps<{ visual: OfficialRadiusVisual }>();
</script>
