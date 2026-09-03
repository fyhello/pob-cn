<template>
  <div class="flex h-full flex-1 overflow-hidden bg-black/95 max-lg:flex-col">
    <!-- 左侧技能组配置边栏 -->
    <aside class="flex w-[450px] shrink-0 flex-col overflow-hidden border-r border-poe-border/80 bg-[#08080c] max-lg:h-[46%] max-lg:w-full max-lg:border-b max-lg:border-r-0">
      
      <!-- 1. 顶部标题与新建按钮 -->
      <div class="flex items-center justify-between border-b border-poe-border/80 px-4 py-3 bg-black/40">
        <div class="flex items-center gap-2">
          <Zap class="h-4 w-4 text-poe-gold" />
          <h2 class="text-sm font-bold text-poe-gold font-poe-title tracking-wide">技能组</h2>
          <span class="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-gray-400">
            {{ (store.socketGroups || []).length }}
          </span>
        </div>
        <button 
          type="button" 
          class="flex items-center gap-1 rounded border border-poe-gold/50 bg-poe-gold/10 px-2 py-1 text-xs font-semibold text-poe-gold hover:bg-poe-gold/20 transition-all disabled:opacity-50 cursor-pointer"
          :disabled="store.isCalculating" 
          @click="addGroup"
        >
          <Plus class="h-3.5 w-3.5" />
          <span>新建技能组</span>
        </button>
      </div>

      <!-- 2. 技能组紧凑列表（微型胶囊徽章，自适应拉伸占满上半部） -->
      <div class="flex-1 min-h-0 space-y-1.5 overflow-y-auto border-b border-poe-border/70 p-2.5 custom-scrollbar">
        <button 
          v-for="(g, index) in (store.socketGroups || [])" 
          :key="index" 
          type="button" 
          @click="selectGroup(index)" 
          :class="[
            'w-full cursor-pointer rounded-lg border p-2 text-left transition-all',
            selectedIndex === index 
              ? 'border-poe-gold bg-poe-gold/15 text-white shadow-sm ring-1 ring-poe-gold/40' 
              : 'border-poe-border/70 bg-black/40 text-gray-300 hover:border-white/25 hover:bg-white/5'
          ]"
        >
          <!-- 组标题行（第一行：主动技能 黄色高亮显示） -->
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 truncate">
              <span class="h-1.5 w-1.5 rounded-full" :class="g?.enabled !== false ? (g?.isMain ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-amber-400') : 'bg-gray-600'"></span>
              <span class="truncate text-xs font-bold text-amber-300 drop-shadow-sm">
                {{ g?.label_cn || g?.label || `技能组 ${index + 1}` }}
              </span>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <span v-if="g?.isMain" class="rounded bg-emerald-950/80 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-700/50">
                主输出
              </span>
              <span class="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-mono text-gray-400 border border-white/10">
                {{ (g?.gems || []).length }}连
              </span>
            </div>
          </div>

          <!-- 辅助技能胶囊行（第二行：仅展示辅助技能 绿色微型胶囊） -->
          <div v-if="getSupportGems(g).length > 0" class="mt-1.5 flex flex-wrap items-center gap-1">
            <span 
              v-for="(gem, gemIdx) in getSupportGems(g).slice(0, 5)" 
              :key="gemIdx"
              class="inline-flex items-center rounded px-1.5 py-0.2 text-[10px] font-medium leading-tight border bg-emerald-950/40 text-emerald-300 border-emerald-700/40"
            >
              {{ gem?.name_cn || gem?.name }}
            </span>
            <span v-if="getSupportGems(g).length > 5" class="text-[10px] text-gray-500 font-mono">
              +{{ getSupportGems(g).length - 5 }}
            </span>
          </div>
          <div v-else-if="(g?.gems || []).length > 0" class="mt-1 text-[10px] text-gray-500 italic">无辅助技能</div>
          <div v-else class="mt-1 text-[10px] text-gray-500 italic">空技能组</div>
        </button>
      </div>

      <!-- 3. 技能组编辑器与紧凑数据表格（紧凑包裹内容，贴合底部） -->
      <section class="shrink-0 p-3 bg-black/30 flex flex-col justify-start">
        <div v-if="activeGroup" class="space-y-2.5">
          
          <!-- 错误提示 -->
          <p v-if="error" class="rounded border border-red-900/80 bg-red-950/50 px-2.5 py-1.5 text-xs text-red-200">
            {{ error }}
          </p>

          <!-- A. 单行集成控制栏（名称 + 选项 + 主技能设置） -->
          <div class="rounded-lg border border-poe-border/80 bg-black/50 p-2.5 space-y-2">
            <div class="flex items-center gap-2">
              <input 
                :value="activeGroup.label_cn || activeGroup.label" 
                :disabled="store.isCalculating || !activeGroup.editable" 
                placeholder="技能组名称..."
                class="flex-1 rounded border border-poe-border bg-black/80 px-2.5 py-1 text-xs text-white outline-none focus:border-poe-gold transition-all" 
                @change="setGroup({ label: ($event.target as HTMLInputElement).value })" 
              />
              <button 
                type="button" 
                :class="[
                  'shrink-0 flex items-center gap-1 rounded border px-2 py-1 text-xs transition-all cursor-pointer',
                  activeGroup.isMain 
                    ? 'border-emerald-600 bg-emerald-950/60 text-emerald-300 font-bold' 
                    : 'border-poe-gold/60 text-poe-gold hover:bg-poe-gold/10'
                ]" 
                :disabled="store.isCalculating || activeGroup.isMain" 
                @click="setMain"
              >
                <Star class="h-3 w-3" :class="activeGroup.isMain ? 'fill-emerald-400 text-emerald-400' : ''" />
                <span>{{ activeGroup.isMain ? '当前为主技能' : '设为主技能' }}</span>
              </button>
              <button 
                v-if="activeGroup.editable" 
                type="button" 
                class="p-1 rounded text-red-400/80 hover:text-red-200 hover:bg-red-950/40 border border-transparent hover:border-red-800/50 transition-all cursor-pointer disabled:opacity-50" 
                :disabled="store.isCalculating" 
                title="删除技能组"
                @click="removeGroup"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>

            <!-- 开关选项 -->
            <div class="flex items-center gap-4 text-xs text-gray-300 pt-1 border-t border-white/5">
              <label class="flex items-center gap-1.5 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  class="accent-amber-400 cursor-pointer h-3.5 w-3.5" 
                  :checked="activeGroup.enabled !== false" 
                  :disabled="store.isCalculating || !activeGroup.editable" 
                  @change="setGroup({ enabled: ($event.target as HTMLInputElement).checked })" 
                />
                <span>启用技能组</span>
              </label>
              <label class="flex items-center gap-1.5 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  class="accent-amber-400 cursor-pointer h-3.5 w-3.5" 
                  :checked="activeGroup.includeInFullDPS !== false" 
                  :disabled="store.isCalculating || !activeGroup.editable" 
                  @change="setGroup({ includeInFullDPS: ($event.target as HTMLInputElement).checked })" 
                />
                <span>计入全技能总秒伤</span>
              </label>
            </div>
          </div>

          <!-- B. 紧凑宝石插槽表格 (Socket Table) -->
          <div class="rounded-lg border border-poe-border/80 bg-black/40 overflow-hidden shadow-inner">
            
            <!-- 表头 -->
            <div class="grid grid-cols-[22px_minmax(0,1fr)_48px_48px_32px_28px] items-center gap-1.5 bg-black/80 px-2 py-1.5 border-b border-poe-border/70 text-[11px] font-semibold text-gray-400 select-none">
              <span class="text-center font-mono">#</span>
              <span>宝石名称</span>
              <span class="text-center">等级</span>
              <span class="text-center">品质</span>
              <span class="text-center">启用</span>
              <span class="text-center"></span>
            </div>

            <!-- 宝石行列表（固定 6 连插槽总高度，消灭切换抖动） -->
            <div class="h-[216px] overflow-y-auto divide-y divide-white/5 custom-scrollbar bg-black/50">
              <div 
                v-for="(gem, gemIndex) in activeGroup.gems || []" 
                :key="`${gemIndex}-${gem.name}`" 
                class="grid grid-cols-[22px_minmax(0,1fr)_48px_48px_32px_28px] items-center gap-1.5 px-2 py-1 hover:bg-white/[0.03] transition-colors h-[36px]"
              >
                <!-- 1. 插槽序号 -->
                <span class="text-center text-[10px] font-mono font-bold text-gray-500">
                  {{ gemIndex + 1 }}
                </span>

                <!-- 2. 宝石选择下拉框 -->
                <div class="min-w-0 flex items-center gap-1">
                  <span 
                    :class="[
                      'shrink-0 text-[9px] font-bold px-1 py-0.2 rounded border',
                      isGemSupport(gem) 
                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-600/50' 
                        : 'bg-amber-950/60 text-amber-300 border-amber-600/50'
                    ]"
                  >
                    {{ isGemSupport(gem) ? '辅' : '主' }}
                  </span>
                  <select 
                    :value="gem.name" 
                    :disabled="store.isCalculating || !activeGroup.editable" 
                    class="w-full truncate rounded border border-poe-border/80 bg-black px-1.5 py-0.5 text-xs text-white outline-none focus:border-poe-gold cursor-pointer"
                    @change="setGem(gemIndex, { nameSpec: ($event.target as HTMLSelectElement).value })"
                  >
                    <optgroup label="主动技能宝石">
                      <option v-for="candidate in activeGemOptions" :key="candidate.id" :value="candidate.name">
                        {{ candidate.name_cn || candidate.name }}
                      </option>
                    </optgroup>
                    <optgroup label="辅助技能宝石">
                      <option v-for="candidate in supportGemOptions" :key="candidate.id" :value="candidate.name">
                        {{ candidate.name_cn || candidate.name }}
                      </option>
                    </optgroup>
                  </select>
                </div>

                <!-- 3. 等级微调框 -->
                <div>
                  <input 
                    type="number" 
                    min="1" 
                    :value="gem.level" 
                    :disabled="store.isCalculating || !activeGroup.editable" 
                    class="w-full rounded border border-poe-border/80 bg-black px-1 py-0.5 text-center text-xs font-mono text-white outline-none focus:border-poe-gold" 
                    @change="setGem(gemIndex, { level: numberValue($event) })" 
                  />
                </div>

                <!-- 4. 品质微调框 -->
                <div>
                  <input 
                    type="number" 
                    min="0" 
                    :value="gem.quality" 
                    :disabled="store.isCalculating || !activeGroup.editable" 
                    class="w-full rounded border border-poe-border/80 bg-black px-1 py-0.5 text-center text-xs font-mono text-white outline-none focus:border-poe-gold" 
                    @change="setGem(gemIndex, { quality: numberValue($event) })" 
                  />
                </div>

                <!-- 5. 启用勾选 -->
                <div class="flex justify-center">
                  <input 
                    type="checkbox" 
                    class="accent-amber-400 h-3.5 w-3.5 cursor-pointer" 
                    :checked="gem.enabled !== false" 
                    :disabled="store.isCalculating || !activeGroup.editable" 
                    @change="setGem(gemIndex, { enabled: ($event.target as HTMLInputElement).checked })" 
                  />
                </div>

                <!-- 6. 移除按钮 -->
                <div class="flex justify-center">
                  <button 
                    type="button" 
                    class="text-gray-500 hover:text-red-400 transition-colors p-0.5 rounded disabled:opacity-40 cursor-pointer" 
                    :disabled="store.isCalculating || !activeGroup.editable" 
                    title="移除宝石" 
                    @click="removeGem(gemIndex)"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <!-- 未插满 6 连时的空插槽占位，保证视觉高度绝对固定，消除抖动 -->
              <div 
                v-for="emptyIdx in Math.max(0, 6 - (activeGroup.gems || []).length)" 
                :key="`empty-slot-${emptyIdx}`" 
                class="grid grid-cols-[22px_minmax(0,1fr)_48px_48px_32px_28px] items-center gap-1.5 px-2 py-1 h-[36px] opacity-35 select-none"
              >
                <span class="text-center text-[10px] font-mono text-gray-600">
                  {{ (activeGroup.gems || []).length + emptyIdx }}
                </span>
                <div class="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span class="border border-dashed border-gray-700 px-1 py-0.2 rounded text-[9px] text-gray-600 font-mono">空</span>
                  <span class="text-gray-600 text-xs">空插槽</span>
                </div>
                <div class="text-center text-xs font-mono text-gray-700">-</div>
                <div class="text-center text-xs font-mono text-gray-700">-</div>
                <div class="text-center text-xs font-mono text-gray-700">-</div>
                <div></div>
              </div>
            </div>
          </div>

          <!-- C. 底部快捷添加宝石条 -->
          <div v-if="activeGroup.editable" class="flex items-center gap-2 pt-1">
            <select 
              v-model="gemToAdd" 
              class="flex-1 rounded border border-poe-border/90 bg-black px-2.5 py-1 text-xs text-white outline-none focus:border-poe-gold cursor-pointer"
            >
              <option value="">选择要插入插槽的宝石...</option>
              <optgroup label="主动技能宝石">
                <option v-for="candidate in activeGemOptions" :key="candidate.id" :value="candidate.name">
                  {{ candidate.name_cn || candidate.name }}
                </option>
              </optgroup>
              <optgroup label="辅助技能宝石">
                <option v-for="candidate in supportGemOptions" :key="candidate.id" :value="candidate.name">
                  {{ candidate.name_cn || candidate.name }}
                </option>
              </optgroup>
            </select>
            <button 
              type="button" 
              class="flex items-center gap-1 rounded border border-poe-gold/70 bg-poe-gold/15 px-3 py-1 text-xs font-semibold text-poe-gold hover:bg-poe-gold/25 transition-all disabled:opacity-50 cursor-pointer shrink-0"
              :disabled="store.isCalculating || !gemToAdd" 
              @click="addGem"
            >
              <Plus class="h-3.5 w-3.5" />
              <span>插入宝石</span>
            </button>
          </div>

        </div>
        <p v-else class="py-10 text-center text-sm text-gray-500">官方核心未提供技能组。</p>
      </section>
    </aside>

    <!-- 右侧嵌入计算明细金字塔面板 -->
    <section class="min-w-0 flex-1 overflow-hidden bg-black/80">
      <CalcsPanel embedded />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Trash2, Zap, Plus, Star } from 'lucide-vue-next';
import gemsRaw from '../../../generated/web-data/gems.json';
import { useBuildStore } from '../stores/buildStore';
import CalcsPanel from './CalcsPanel.vue';

const store = useBuildStore();
const selectedIndex = ref(0);
const gemToAdd = ref('');
const error = ref('');

const allGems = (gemsRaw as any[]).filter(gem => typeof gem?.name === 'string');
const activeGemOptions = allGems.filter(gem => !gem.isSupport).sort((left, right) => String(left.name_cn || left.name).localeCompare(String(right.name_cn || right.name), 'zh-CN'));
const supportGemOptions = allGems.filter(gem => gem.isSupport).sort((left, right) => String(left.name_cn || left.name).localeCompare(String(right.name_cn || right.name), 'zh-CN'));

const activeGroup = computed(() => {
  const list = store.socketGroups || [];
  return list[selectedIndex.value] || null;
});

watch(() => (store.socketGroups || []).length, length => { 
  if (selectedIndex.value >= length) selectedIndex.value = Math.max(0, length - 1); 
});

watch(() => store.selectedCalculationSkillIndex, index => { 
  selectedIndex.value = index || 0; 
});

function isGemSupport(gem: any): boolean {
  if (gem?.isSupport !== undefined) return Boolean(gem.isSupport);
  const found = allGems.find(g => g.name === gem?.name);
  return Boolean(found?.isSupport);
}

function getSupportGems(g: any): any[] {
  return (g?.gems || []).filter((gem: any) => isGemSupport(gem));
}

function numberValue(event: Event): number { 
  return Number((event.target as HTMLInputElement).value); 
}

async function selectGroup(index: number) {
  selectedIndex.value = index;
  error.value = '';
  if (store.selectedCalculationSkillIndex === index) return;
  const result = await store.selectCalculationSkillGroup(index);
  if (!result.success) error.value = result.error?.message || '官方计算技能切换失败。';
}

async function run(operation: any, payload: Record<string, unknown> = {}) {
  error.value = '';
  const result = await store.commitOfficialSkillChange(operation, payload);
  if (!result.success) error.value = result.error?.message || '官方技能保存失败。';
}

async function setGroup(patch: Record<string, unknown>) { 
  await run('setGroup', { groupIndex: selectedIndex.value + 1, patch }); 
}

async function setGem(gemIndex: number, patch: Record<string, unknown>) { 
  await run('setGem', { groupIndex: selectedIndex.value + 1, gemIndex: gemIndex + 1, patch }); 
}

async function addGem() { 
  if (!gemToAdd.value) return; 
  await run('addGem', { groupIndex: selectedIndex.value + 1, patch: { nameSpec: gemToAdd.value } }); 
  gemToAdd.value = ''; 
}

async function removeGem(gemIndex: number) { 
  await run('removeGem', { groupIndex: selectedIndex.value + 1, gemIndex: gemIndex + 1 }); 
}

async function addGroup() { 
  await run('addGroup', { label: '新技能组' }); 
  selectedIndex.value = (store.socketGroups || []).length; 
}

async function removeGroup() { 
  await run('removeGroup', { groupIndex: selectedIndex.value + 1 }); 
}

async function setMain() { 
  await run('setMain', { groupIndex: selectedIndex.value + 1 }); 
}
</script>
