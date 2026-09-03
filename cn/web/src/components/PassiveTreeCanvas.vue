<template>
  <div class="relative flex-1 h-[calc(100vh-3.5rem)] bg-[#050507] overflow-hidden select-none" ref="containerRef">
    <!-- WebGL / 2D 高速天赋树画布 -->
    <canvas 
      ref="canvasRef" 
      class="w-full h-full cursor-grab active:cursor-grabbing block"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @wheel.prevent="handleWheel"
      @mouseleave="handleMouseUp"
    ></canvas>

    <!-- 顶部画布操作悬浮条 -->
    <div class="absolute top-4 left-4 z-10 flex items-center space-x-3 glass-panel p-2 rounded-lg border border-poe-border/80 shadow-2xl">
      <div class="flex items-center space-x-1.5 px-2 border-r border-poe-border/50 text-xs">
        <span class="text-gray-400">已分配天赋点:</span>
        <span class="font-bold font-mono text-poe-gold text-sm">{{ store.allocatedNodes.size }}</span>
        <span class="text-gray-500">/ 123</span>
      </div>

      <!-- 搜索天赋节点输入框 -->
      <div class="flex items-center bg-black/50 border border-poe-border rounded px-2 py-1 text-xs focus-within:border-poe-gold transition-all">
        <Search class="w-3.5 h-3.5 text-gray-400 mr-1.5" />
        <input 
          v-model="searchQuery" 
          @input="handleSearch"
          class="bg-transparent border-none outline-none text-gray-200 w-36 placeholder-gray-500 font-medium text-xs"
          placeholder="搜索天赋节点/词条..."
        />
      </div>

      <div class="flex items-center space-x-1">
        <button @click="zoomIn" class="p-1.5 hover:bg-white/10 rounded text-gray-300 transition-all" title="放大">
          <Plus class="w-4 h-4" />
        </button>
        <button @click="zoomOut" class="p-1.5 hover:bg-white/10 rounded text-gray-300 transition-all" title="缩小">
          <Minus class="w-4 h-4" />
        </button>
        <button @click="resetView" class="p-1.5 hover:bg-white/10 rounded text-gray-300 transition-all" title="重置视角">
          <RotateCcw class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- 节点悬浮浮窗 (Tooltip) -->
    <div 
      v-if="hoveredNode" 
      class="absolute z-30 pointer-events-none transition-transform duration-75"
      :style="{ left: `${tooltipX}px`, top: `${tooltipY}px` }"
    >
      <div class="w-80 glass-panel p-4 rounded-xl border border-poe-gold/40 shadow-2xl space-y-2 bg-black/95">
        <div class="flex items-center justify-between border-b border-white/10 pb-2">
          <div class="font-bold text-sm text-poe-gold font-poe-title">
            {{ hoveredNode.name_cn || hoveredNode.name || '天赋节点' }}
          </div>
          <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-gray-400">
            {{ hoveredNode.type_cn || hoveredNode.type || 'Normal' }}
          </span>
        </div>

        <!-- 节点词条列表 (支持原生 stats_cn / stats) -->
        <div class="space-y-1 text-xs">
          <div 
            v-for="(stat, idx) in (hoveredNode.stats_cn || hoveredNode.stats || [])" 
            :key="idx"
            class="text-[#99aaff] font-medium leading-relaxed"
          >
            {{ formatStatDisplay(stat) }}
          </div>
          <div v-if="(!hoveredNode.stats || hoveredNode.stats.length === 0) && (!hoveredNode.stats_cn || hoveredNode.stats_cn.length === 0)" class="text-gray-500 text-[11px] italic">
            基础属性路径点
          </div>
        </div>

        <!-- 珠宝插槽额外信息与已镶嵌珠宝完整属性词条 -->
        <div v-if="isJewelSocketNode(hoveredNode)" class="pt-2 border-t border-white/10 space-y-2">
          <div v-if="store.socketedJewels[hoveredNode.id]" class="space-y-1.5 bg-amber-950/40 p-2.5 rounded-lg border border-amber-500/40">
            <div class="flex items-center justify-between border-b border-amber-500/20 pb-1">
              <span class="text-xs font-bold text-amber-300 font-poe-title flex items-center space-x-1">
                <Sparkles class="w-3.5 h-3.5 text-amber-400" />
                <span>{{ getSocketedJewel(hoveredNode.id)?.name_cn || getSocketedJewel(hoveredNode.id)?.name || '已镶嵌珠宝' }}</span>
              </span>
              <span class="text-[10px] text-amber-400/80 font-mono">{{ getSocketedJewel(hoveredNode.id)?.base_cn || getSocketedJewel(hoveredNode.id)?.base || '珠宝' }}</span>
            </div>
            
            <!-- 珠宝词条列表 -->
            <div class="space-y-0.5 text-xs">
              <div 
                v-for="(line, lIdx) in (getSocketedJewel(hoveredNode.id)?.lines_cn || getSocketedJewel(hoveredNode.id)?.lines || [])"
                :key="lIdx"
                class="text-amber-200/90 text-[11px] leading-snug"
              >
                {{ line }}
              </div>
            </div>
            <div class="text-[10px] text-gray-400 italic pt-1 border-t border-amber-500/10 flex items-center justify-between">
              <span>✦ 点击此插槽可拔出或更换珠宝</span>
            </div>
          </div>
          <div v-else class="text-[11px] text-amber-300/80 italic bg-black/40 p-2 rounded-lg border border-amber-950/60 flex items-center space-x-1">
            <Sparkles class="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>未镶嵌珠宝 (点击此插槽节点可装入流派库中的珠宝)</span>
          </div>
        </div>

        <!-- 底部状态栏 -->
        <div class="pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-gray-400 font-mono">
          <span>节点 ID: #{{ hoveredNode.id }}</span>
          <span :class="store.allocatedNodes.has(hoveredNode.id) ? 'text-green-400 font-bold' : 'text-gray-500'">
            {{ store.allocatedNodes.has(hoveredNode.id) ? '● 已点亮' : '○ 未点亮' }}
          </span>
        </div>
      </div>
    </div>

    <!-- 星盘珠宝插槽选择与装卸弹窗 -->
    <div 
      v-if="jewelModal.isOpen" 
      class="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4"
      @click.self="jewelModal.isOpen = false"
    >
      <div class="w-full max-w-lg glass-panel p-6 rounded-2xl border border-amber-500/50 shadow-2xl space-y-4">
        <div class="flex items-center justify-between border-b border-white/10 pb-3">
          <div class="flex items-center space-x-2">
            <Sparkles class="w-5 h-5 text-amber-400" />
            <h3 class="font-bold text-base text-amber-300 font-poe-title">
              星盘珠宝插槽 #{{ jewelModal.nodeId }}
            </h3>
          </div>
          <button @click="jewelModal.isOpen = false" class="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white">
            <X class="w-4 h-4" />
          </button>
        </div>

        <div v-if="jewelModal.notice" class="rounded border border-red-700/70 bg-red-950/70 px-3 py-2 text-xs text-red-200">
          {{ jewelModal.notice }}
        </div>

        <!-- 当前插槽已镶嵌的珠宝与拔出按钮 -->
        <div v-if="jewelModal.nodeId && store.socketedJewels[jewelModal.nodeId]" class="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 flex items-center justify-between">
          <div>
            <div class="text-xs text-amber-400 font-semibold">当前已镶嵌珠宝:</div>
            <div class="text-sm font-bold text-white mt-0.5">
              {{ getSocketedJewelName(jewelModal.nodeId) }}
            </div>
          </div>
          <button 
            @click="removeJewelFromNode(jewelModal.nodeId)"
            class="px-3 py-1.5 rounded bg-red-950/80 border border-red-700 text-red-300 text-xs hover:bg-red-900 transition-colors font-medium flex items-center space-x-1"
          >
            <Trash2 class="w-3.5 h-3.5" />
            <span>拔出珠宝</span>
          </button>
        </div>

        <!-- 筛选与选择珠宝 -->
        <div class="space-y-2.5">
          <div class="flex items-center justify-between">
            <div class="text-xs font-bold text-gray-300">从流派库中选择要镶嵌的珠宝：</div>
            <!-- 未镶嵌筛选开关 -->
            <div class="flex items-center space-x-1 bg-black/40 p-0.5 rounded-lg border border-poe-border/60 text-[11px]">
              <button 
                @click="jewelFilterUnusedOnly = false" 
                :class="['px-2 py-0.5 rounded transition-all', !jewelFilterUnusedOnly ? 'bg-amber-600 text-white font-bold' : 'text-gray-400 hover:text-white']"
              >
                全部 ({{ availableJewelsInLibrary.length }})
              </button>
              <button 
                @click="jewelFilterUnusedOnly = true" 
                :class="['px-2 py-0.5 rounded transition-all', jewelFilterUnusedOnly ? 'bg-green-600 text-white font-bold' : 'text-gray-400 hover:text-white']"
              >
                仅未镶嵌 ({{ unusedJewelsCount }})
              </button>
            </div>
          </div>
          
          <div v-if="displayedJewelsInModal.length > 0" class="max-h-64 overflow-y-auto space-y-2 pr-1">
            <div 
              v-for="jewel in displayedJewelsInModal" 
              :key="jewel.id"
              @click="socketJewelIntoNode(jewel.id)"
              :class="[
                'p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between hover:bg-white/5',
                jewelModal.nodeId && store.socketedJewels[jewelModal.nodeId] === jewel.id 
                  ? 'bg-amber-950/40 border-amber-500 ring-1 ring-amber-500/50' 
                  : 'bg-black/60 border-poe-border/80 hover:border-amber-500/50'
              ]"
            >
              <div class="truncate mr-2">
                <div class="flex items-center space-x-2">
                  <span class="font-bold text-xs text-amber-200 truncate">
                    {{ jewel.name_cn || jewel.name }}
                  </span>
                  <!-- 镶嵌状态标签 -->
                  <span 
                    v-if="jewelModal.nodeId && store.socketedJewels[jewelModal.nodeId] === jewel.id" 
                    class="px-1.5 py-0.2 text-[9px] rounded font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0"
                  >
                    当前使用
                  </span>
                  <span 
                    v-else-if="getJewelOccupiedSlot(jewel.id)" 
                    class="px-1.5 py-0.2 text-[9px] rounded font-medium bg-orange-950/60 text-orange-400 border border-orange-700/50 shrink-0"
                  >
                    已镶嵌于 #{{ getJewelOccupiedSlot(jewel.id) }}
                  </span>
                  <span 
                    v-else 
                    class="px-1.5 py-0.2 text-[9px] rounded font-bold bg-green-950/60 text-green-400 border border-green-700/50 shrink-0"
                  >
                    ✓ 未镶嵌可用
                  </span>
                </div>
                <div class="text-[10px] text-gray-400 font-mono mt-0.5 truncate">
                  {{ jewel.base_cn || jewel.base || jewel.type || '珠宝' }}
                </div>
                <!-- 词条简要展示 -->
                <div v-if="jewel.lines_cn && jewel.lines_cn.length > 0" class="text-[10px] text-gray-500 truncate mt-1">
                  {{ jewel.lines_cn.slice(0, 2).join(' · ') }}
                </div>
              </div>
              <button 
                :class="[
                  'px-3 py-1 rounded text-xs font-bold shrink-0 transition-all',
                  jewelModal.nodeId && store.socketedJewels[jewelModal.nodeId] === jewel.id
                    ? 'bg-amber-600/80 text-white cursor-default'
                    : 'bg-amber-600 hover:bg-amber-500 text-white'
                ]"
              >
                {{ jewelModal.nodeId && store.socketedJewels[jewelModal.nodeId] === jewel.id ? '当前' : '镶嵌' }}
              </button>
            </div>
          </div>

          <div v-else class="p-6 bg-black/40 border border-poe-border/40 rounded-xl text-center space-y-2">
            <div class="text-xs text-gray-400">
              {{ jewelFilterUnusedOnly ? '暂无未镶嵌的空闲珠宝' : '流派物品库中暂无珠宝' }}
            </div>
            <div class="text-[10px] text-gray-500">可在【装备与物品】面板中新建或从暗金库添加珠宝</div>
          </div>
        </div>

        <div class="flex justify-between items-center pt-2 border-t border-white/10">
          <button 
            v-if="jewelModal.nodeId && store.allocatedNodes.has(jewelModal.nodeId)"
            @click="store.toggleNode(jewelModal.nodeId); jewelModal.isOpen = false"
            class="text-xs text-gray-500 hover:text-red-400"
          >
            取消分配此天赋插槽
          </button>
          <div v-else></div>
          <button @click="jewelModal.isOpen = false" class="btn-secondary text-xs">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useBuildStore } from '../stores/buildStore';
import { Plus, Minus, RotateCcw, Search, Sparkles, X, Trash2 } from 'lucide-vue-next';
import treeDataRaw from '../../../generated/web-data/tree_0_5.json';

const store = useBuildStore();
const containerRef = ref<HTMLDivElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const searchQuery = ref('');

watch(() => store.allocatedNodes, () => {
  drawCanvas();
}, { deep: true });

// 视图变换状态
const view = ref({
  x: 0,
  y: 0,
  scale: 0.085,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
});

interface TreeNode {
  id: number;
  name: string;
  name_cn?: string;
  type: string;
  type_cn?: string;
  x: number;
  y: number;
  stats: string[];
  stats_cn?: string[];
  out?: number[];
  ascendancyName?: string;
}

const allNodes: TreeNode[] = (treeDataRaw.nodes || []) as TreeNode[];
const officialConnectors: [number, number][] = (treeDataRaw.connectors || []) as [number, number][];

const hoveredNode = ref<TreeNode | null>(null);
const tooltipPos = ref({ x: 0, y: 0 });
const matchedNodeIds = ref(new Set<number>());

// 快速节点索引 Map
const nodeMap = new Map<number, TreeNode>();
for (const n of allNodes) {
  nodeMap.set(n.id, n);
}

// 珠宝插槽弹窗
const jewelModal = ref({
  isOpen: false,
  nodeId: 0,
  notice: ''
});

const jewelFilterUnusedOnly = ref(false);

function isJewelSocketNode(node: any): boolean {
  if (!node) return false;
  return node.type === 'Socket' || (node.name && node.name.includes('Jewel Socket'));
}

function getSocketedJewel(nodeId: number): any {
  const jewelId = store.socketedJewels[nodeId];
  if (!jewelId) return null;
  return store.itemLibrary.find(i => String(i.id) === String(jewelId)) || null;
}

function getSocketedJewelName(nodeId: number): string {
  const jewel = getSocketedJewel(nodeId);
  return jewel ? (jewel.name_cn || jewel.name) : '未知珠宝';
}

function getJewelOccupiedSlot(jewelId: string | number): number | null {
  for (const [nodeId, id] of Object.entries(store.socketedJewels)) {
    if (String(id) === String(jewelId)) {
      return Number(nodeId);
    }
  }
  return null;
}

const availableJewelsInLibrary = computed(() => {
  return store.itemLibrary.filter(item => {
    const t = (item.type || '').toLowerCase();
    const n = (item.name || '').toLowerCase();
    const b = (item.base || '').toLowerCase();
    return t.includes('jewel') || t.includes('idol') || n.includes('jewel') || b.includes('jewel') || item.type === 'Jewel';
  });
});

const unusedJewelsCount = computed(() => {
  return availableJewelsInLibrary.value.filter(j => !getJewelOccupiedSlot(j.id)).length;
});

const displayedJewelsInModal = computed(() => {
  let list = [...availableJewelsInLibrary.value];
  if (jewelFilterUnusedOnly.value) {
    list = list.filter(j => !getJewelOccupiedSlot(j.id) || (jewelModal.value.nodeId && store.socketedJewels[jewelModal.value.nodeId] === j.id));
  }
  // 排序：当前插槽使用 > 未镶嵌 > 已镶嵌在其他插槽
  return list.sort((a, b) => {
    const aCurrent = jewelModal.value.nodeId && store.socketedJewels[jewelModal.value.nodeId] === a.id;
    const bCurrent = jewelModal.value.nodeId && store.socketedJewels[jewelModal.value.nodeId] === b.id;
    if (aCurrent && !bCurrent) return -1;
    if (!aCurrent && bCurrent) return 1;

    const aOcc = getJewelOccupiedSlot(a.id);
    const bOcc = getJewelOccupiedSlot(b.id);
    if (!aOcc && bOcc) return -1;
    if (aOcc && !bOcc) return 1;
    return 0;
  });
});

function assignmentErrorMessage(result: any): string {
  const message = result?.error?.message;
  return typeof message === 'string' && message ? message : '官方珠宝分配失败，请检查当前流派后重试';
}

async function commitJewelAssignment(nodeId: number, itemId: number | null): Promise<boolean> {
  const active = store.loadouts?.active;
  if (!Number.isInteger(active?.specId)) {
    jewelModal.value.notice = '无法操作：当前缺少官方天赋配置';
    return false;
  }
  const result = await store.commitOfficialItemAssignment({ kind: 'jewel', specId: active.specId, nodeId }, itemId);
  if (!result?.success) {
    jewelModal.value.notice = assignmentErrorMessage(result);
    return false;
  }
  return true;
}

async function socketJewelIntoNode(jewelId: string | number) {
  const nodeId = jewelModal.value.nodeId;
  const numericJewelId = Number(jewelId);
  if (!nodeId || !(await commitJewelAssignment(nodeId, Number.isNaN(numericJewelId) ? null : numericJewelId))) return;
  jewelModal.value.isOpen = false;
}

async function removeJewelFromNode(nodeId: number) {
  if (!nodeId || !(await commitJewelAssignment(nodeId, null))) return;
  jewelModal.value.isOpen = false;
}

function formatStatDisplay(statStr: string): string {
  if (!statStr) return '';
  return statStr;
}

const tooltipX = computed(() => {
  const containerW = containerRef.value?.clientWidth || window.innerWidth;
  const isRightOverflow = tooltipPos.value.x + 360 > containerW;
  return isRightOverflow ? Math.max(10, tooltipPos.value.x - 340) : tooltipPos.value.x + 18;
});

const tooltipY = computed(() => {
  const containerH = containerRef.value?.clientHeight || window.innerHeight;
  const isBottomOverflow = tooltipPos.value.y + 240 > containerH;
  return isBottomOverflow ? Math.max(10, tooltipPos.value.y - 210) : tooltipPos.value.y + 18;
});

function handleSearch() {
  const q = searchQuery.value.trim().toLowerCase();
  matchedNodeIds.value.clear();
  if (!q) {
    drawCanvas();
    return;
  }
  for (const n of allNodes) {
    const nameMatch = (n.name && n.name.toLowerCase().includes(q)) || (n.name_cn && n.name_cn.toLowerCase().includes(q));
    const statMatch = (n.stats && n.stats.some(s => s.toLowerCase().includes(q))) || (n.stats_cn && n.stats_cn.some(s => s.toLowerCase().includes(q)));
    if (nameMatch || statMatch) {
      matchedNodeIds.value.add(n.id);
    }
  }
  drawCanvas();
}

function drawCanvas() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.width / dpr;
  const cssHeight = canvas.height / dpr;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 清屏深邃星空底色
  ctx.fillStyle = '#060609';
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  ctx.save();
  ctx.translate(cssWidth / 2 + view.value.x, cssHeight / 2 + view.value.y);
  ctx.scale(view.value.scale, view.value.scale);

  // 1. 绘制官方精准基础骨架连线 (4,863 条官方连线)
  ctx.strokeStyle = '#232336';
  ctx.lineWidth = 26;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [id1, id2] of officialConnectors) {
    const n1 = nodeMap.get(id1);
    const n2 = nodeMap.get(id2);
    if (n1 && n2) {
      ctx.moveTo(n1.x, n1.y);
      ctx.lineTo(n2.x, n2.y);
    }
  }
  ctx.stroke();

  // 2. 绘制官方精准已激活璀璨发光连线
  ctx.strokeStyle = '#ffd066';
  ctx.lineWidth = 40;
  ctx.lineCap = 'round';
  ctx.shadowColor = '#ffbb33';
  ctx.shadowBlur = 40;
  ctx.beginPath();
  for (const [id1, id2] of officialConnectors) {
    if (store.allocatedNodes.has(id1) && store.allocatedNodes.has(id2)) {
      const n1 = nodeMap.get(id1);
      const n2 = nodeMap.get(id2);
      if (n1 && n2) {
        ctx.moveTo(n1.x, n1.y);
        ctx.lineTo(n2.x, n2.y);
      }
    }
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 3. 绘制节点
  for (const node of allNodes) {
    const isAllocated = store.allocatedNodes.has(node.id);
    const isHovered = hoveredNode.value?.id === node.id;
    const isMatched = matchedNodeIds.value.has(node.id);
    const isKeystone = node.type === 'Keystone';
    const isNotable = node.type === 'Notable';
    const isSocket = isJewelSocketNode(node);
    const hasJewel = isSocket && store.socketedJewels[node.id];

    const radius = isKeystone ? 90 : (isNotable ? 65 : (isSocket ? 55 : 35));

    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);

    if (hasJewel) {
      // 镶嵌了珠宝的专属翡翠金光晕
      const grad = ctx.createRadialGradient(node.x, node.y, 5, node.x, node.y, radius);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.5, '#34d399');
      grad.addColorStop(1, '#059669');
      ctx.fillStyle = grad;
      ctx.shadowColor = '#34d399';
      ctx.shadowBlur = 45;
    } else if (isAllocated) {
      const grad = ctx.createRadialGradient(node.x, node.y, 5, node.x, node.y, radius);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(1, '#c8a85c');
      ctx.fillStyle = grad;
      ctx.shadowColor = '#c8a85c';
      ctx.shadowBlur = 35;
    } else if (isMatched) {
      ctx.fillStyle = '#3b82f6';
      ctx.shadowColor = '#60a5fa';
      ctx.shadowBlur = 40;
    } else if (isHovered) {
      ctx.fillStyle = '#9ca3af';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 25;
    } else {
      ctx.fillStyle = isKeystone ? '#3a2818' : (isNotable ? '#1e1e2c' : (isSocket ? '#2a1a10' : '#101018'));
      ctx.shadowBlur = 0;
    }

    ctx.fill();
    ctx.shadowBlur = 0;

    // 节点外边框
    ctx.strokeStyle = hasJewel ? '#6ee7b7' : (isAllocated ? '#ffe89c' : (isSocket ? '#f59e0b' : (isKeystone ? '#af6025' : (isNotable ? '#4a4a60' : '#222230'))));
    ctx.lineWidth = isAllocated ? 12 : 6;
    ctx.stroke();
  }

  ctx.restore();
}

function handleMouseDown(e: MouseEvent) {
  if (e.button === 0) {
    if (hoveredNode.value) {
      if (isJewelSocketNode(hoveredNode.value)) {
        if (!store.allocatedNodes.has(hoveredNode.value.id)) {
          store.toggleNode(hoveredNode.value.id);
        }
        jewelModal.value = {
          isOpen: true,
          nodeId: hoveredNode.value.id,
          notice: ''
        };
      } else {
        store.toggleNode(hoveredNode.value.id);
      }
      drawCanvas();
    } else {
      view.value.isDragging = true;
      view.value.dragStartX = e.clientX - view.value.x;
      view.value.dragStartY = e.clientY - view.value.y;
    }
  }
}

function handleMouseMove(e: MouseEvent) {
  if (view.value.isDragging) {
    view.value.x = e.clientX - view.value.dragStartX;
    view.value.y = e.clientY - view.value.dragStartY;
    drawCanvas();
    return;
  }

  const canvas = canvasRef.value;
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const worldX = (mouseX - canvas.width / 2 - view.value.x) / view.value.scale;
  const worldY = (mouseY - canvas.height / 2 - view.value.y) / view.value.scale;

  let found: TreeNode | null = null;
  for (const node of allNodes) {
    const dist = Math.hypot(node.x - worldX, node.y - worldY);
    const threshold = node.type === 'Keystone' ? 90 : (node.type === 'Notable' ? 65 : (isJewelSocketNode(node) ? 60 : 45));
    if (dist <= threshold) {
      found = node;
      break;
    }
  }

  if (hoveredNode.value !== found) {
    hoveredNode.value = found;
    tooltipPos.value = { x: mouseX, y: mouseY };
    drawCanvas();
  } else if (found) {
    tooltipPos.value = { x: mouseX, y: mouseY };
  }
}

function handleMouseUp() {
  view.value.isDragging = false;
}

function handleWheel(e: WheelEvent) {
  const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
  const newScale = Math.min(Math.max(view.value.scale * zoomFactor, 0.015), 1.0);
  view.value.scale = newScale;
  drawCanvas();
}

function zoomIn() {
  view.value.scale = Math.min(view.value.scale * 1.25, 1.0);
  drawCanvas();
}

function zoomOut() {
  view.value.scale = Math.max(view.value.scale * 0.75, 0.015);
  drawCanvas();
}

function resetView() {
  view.value.x = 0;
  view.value.y = 0;
  view.value.scale = 0.085;
  drawCanvas();
}

function resizeCanvas() {
  const canvas = canvasRef.value;
  const container = containerRef.value;
  if (!canvas || !container) return;
  const dpr = window.devicePixelRatio || 1;
  const width = container.clientWidth;
  const height = container.clientHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  drawCanvas();
}

function handleGlobalKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && jewelModal.value.isOpen) {
    jewelModal.value.isOpen = false;
  }
}

onMounted(() => {
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('keydown', handleGlobalKeyDown);
  setTimeout(resizeCanvas, 50);
});

onUnmounted(() => {
  window.removeEventListener('resize', resizeCanvas);
  window.removeEventListener('keydown', handleGlobalKeyDown);
});
</script>
