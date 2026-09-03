<template>
  <header class="h-14 border-b border-poe-border bg-poe-panel/95 backdrop-blur-md px-4 flex items-center justify-between z-20 select-none">
    <!-- 左侧：应用 LOGO & 流派名称 -->
    <div class="flex items-center space-x-3">
      <div class="flex items-center space-x-2">
        <div class="w-7 h-7 rounded bg-gradient-to-br from-poe-gold to-amber-800 flex items-center justify-center shadow-lg">
          <Sparkles class="w-4 h-4 text-black" />
        </div>
        <span class="font-poe-title font-bold text-lg gold-gradient-text tracking-wide hidden sm:inline">PoB NextGen</span>
      </div>

      <div class="h-5 w-px bg-poe-border mx-2"></div>

      <!-- 流派名称输入 -->
      <div class="flex items-center bg-black/40 border border-poe-border/70 rounded px-2 py-1 text-sm focus-within:border-poe-gold transition-all">
        <Edit3 class="w-3.5 h-3.5 text-gray-400 mr-1.5" />
        <input 
          v-model="store.buildName" 
          class="bg-transparent border-none outline-none text-gray-200 text-xs w-36 sm:w-48 placeholder-gray-500 font-medium"
          placeholder="输入配置名称..."
        />
      </div>

      <!-- 职业选择 -->
      <div class="flex items-center space-x-1.5 bg-black/40 border border-poe-border/70 rounded px-2 py-1 text-xs">
        <User class="w-3.5 h-3.5 text-poe-gold" />
        <select 
          :value="store.className" 
          @change="onClassChange"
          class="bg-transparent border-none outline-none text-gray-200 cursor-pointer font-medium"
        >
          <option class="bg-poe-panel text-white" value="Sorceress">女术士</option>
          <option class="bg-poe-panel text-white" value="Ranger">游侠</option>
          <option class="bg-poe-panel text-white" value="Warrior">勇士</option>
          <option class="bg-poe-panel text-white" value="Monk">武僧</option>
          <option class="bg-poe-panel text-white" value="Mercenary">雇佣兵</option>
          <option class="bg-poe-panel text-white" value="Witch">女巫</option>
          <option class="bg-poe-panel text-white" value="Huntress">女猎手</option>
          <option class="bg-poe-panel text-white" value="Shadow">暗影</option>
          <option class="bg-poe-panel text-white" value="Druid">德鲁伊</option>
        </select>
      </div>

      <!-- 等级设定 -->
      <div class="flex items-center space-x-1 bg-black/40 border border-poe-border/70 rounded px-2 py-1 text-xs">
        <span class="text-gray-400">等级:</span>
        <input 
          type="number" 
          min="1" 
          max="100" 
          :value="store.characterLevel" 
          @change="onLevelChange"
          class="bg-transparent border-none outline-none text-poe-gold w-9 text-center font-bold"
        />
      </div>
    </div>

    <!-- 中间：核心模块导航选项卡 -->
    <nav class="flex items-center bg-black/50 p-1 rounded-lg border border-poe-border/60 shadow-inner">
      <button 
        v-for="tab in tabs" 
        :key="tab.id"
        @click="store.activeTab = tab.id"
        :class="[
          'flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all duration-200',
          store.activeTab === tab.id 
            ? 'bg-gradient-to-r from-[#c8a85c] to-[#98783c] text-black shadow-md' 
            : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
        ]"
      >
        <component :is="tab.icon" class="w-3.5 h-3.5" />
        <span>{{ tab.label }}</span>
      </button>
    </nav>

    <!-- 右侧：全局操作与状态 -->
    <div class="flex items-center space-x-2">
      <button @click="showImportModal = true" class="btn-primary flex items-center space-x-1 py-1 px-2.5">
        <Download class="w-3.5 h-3.5 text-poe-gold" />
        <span class="text-xs">导入/导出</span>
      </button>
      <button @click="showImportModal = true" class="btn-primary flex items-center space-x-1 py-1 px-2.5">
        <Share2 class="w-3.5 h-3.5 text-poe-blue" />
        <span class="text-xs">分享短链</span>
      </button>
      <button class="btn-primary py-1 px-2">
        <Settings class="w-3.5 h-3.5 text-gray-400 hover:text-white" />
      </button>
    </div>

    <!-- 导入导出弹窗 -->
    <ImportExportModal v-if="showImportModal" @close="showImportModal = false" />
  </header>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useBuildStore } from '../stores/buildStore';
import ImportExportModal from './ImportExportModal.vue';
import { 
  Sparkles, Edit3, User, Network, Zap, Shield, 
  ShieldAlert, Sliders, Download, Share2, Settings 
} from 'lucide-vue-next';

const store = useBuildStore();
const showImportModal = ref(false);

const tabs = [
  { id: 'TREE' as const, label: '天赋树', icon: Network },
  { id: 'SKILLS' as const, label: '技能与宝石', icon: Zap },
  { id: 'ITEMS' as const, label: '装备与物品', icon: Shield },
  { id: 'CALCS' as const, label: '生存与防御', icon: ShieldAlert },
  { id: 'CONFIG' as const, label: '战斗状态配置', icon: Sliders },
];

async function onClassChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  if (!value) return;
  await store.setClassName(value);
}

async function onLevelChange(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isInteger(value) || value < 1 || value > 100) return;
  await store.setLevel(value);
}
</script>
