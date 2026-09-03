<template>
  <div class="relative overflow-hidden rounded-xl border border-poe-border/80 bg-black/60 shadow-2xl flex flex-col items-center">
    <div class="w-full px-3 py-2 bg-poe-surface-elevated/60 border-b border-poe-border/60 text-xs font-bold text-gray-200 flex items-center justify-between">
      <span class="flex items-center gap-1.5">
        <Compass class="h-3.5 w-3.5 text-poe-gold" />
        游戏内有效作用范围透视示意 (Range Guide)
      </span>
      <span class="text-[11px] font-mono text-poe-gold font-bold">
        半径: {{ (radius / 10).toFixed(1) }} 米 ({{ radius }} 码)
      </span>
    </div>
    <div class="relative w-full flex items-center justify-center p-2 bg-black/80">
      <canvas 
        ref="canvasRef" 
        :width="CANVAS_WIDTH" 
        :height="CANVAS_HEIGHT" 
        class="rounded-lg shadow-inner max-w-full h-auto"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { Compass } from 'lucide-vue-next';
import rangeGuideImg from '../assets/range_guide.png';
import gameUiImg from '../assets/game_ui_small.png';

const props = defineProps<{
  radius: number;
}>();

const CANVAS_WIDTH = 488;
const CANVAS_HEIGHT = 274;

const canvasRef = ref<HTMLCanvasElement | null>(null);

const cos45 = Math.cos(Math.PI / 4);
const cos35 = Math.cos(Math.PI * 0.195);
const sin35 = Math.sin(Math.PI * 0.195);

// 1:1 官方 WorldToScreen 等轴 3D 透视转换算法 (Main.lua:1560)
function worldToScreen(x: number, y: number, z: number, width: number, height: number): [number, number] {
  const cx = (x - y) * cos45;
  const cy = -5.33 - (y + x) * cos45 * cos35 - z * sin35;
  const cz = 122 + (y + x) * cos45 * sin35 - z * cos35;
  const sx = width * 0.5 + (cx / cz) * 1.27 * height;
  const sy = height * 0.5 + (cy / cz) * 1.27 * height;
  return [Math.round(sx), Math.round(sy)];
}

let bgImage: HTMLImageElement | null = null;
let fgImage: HTMLImageElement | null = null;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function render() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (!bgImage || !fgImage) {
    try {
      const [bg, fg] = await Promise.all([
        loadImage(rangeGuideImg),
        loadImage(gameUiImg)
      ]);
      bgImage = bg;
      fgImage = fg;
    } catch (e) {
      console.error('Failed to load range guide assets:', e);
      return;
    }
  }

  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // 1. 绘制地面标尺背景 (10, 20, 30... 80 码同心圆)
  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  // 2. 绘制绿色透视作用范围多边形
  const rad = Math.max(1, props.radius || 10);
  ctx.beginPath();
  let first = true;
  for (let d = 0; d <= 360; d += 2) {
    const r = (d / 180) * Math.PI;
    const [px, py] = worldToScreen(
      Math.sin(r) * rad,
      Math.cos(r) * rad,
      0,
      CANVAS_WIDTH,
      CANVAS_HEIGHT
    );
    if (first) {
      ctx.moveTo(px, py);
      first = false;
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(100, 255, 100, 0.35)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(140, 255, 140, 0.85)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 3. 绘制前景暗黑血球/魔球 UI 遮罩
  if (fgImage) {
    ctx.drawImage(fgImage, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
}

onMounted(() => {
  render();
});

watch(() => props.radius, () => {
  render();
});
</script>
