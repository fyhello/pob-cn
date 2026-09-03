<template>
  <div class="h-screen w-screen flex flex-col bg-poe-bg text-gray-100 overflow-hidden font-sans">
    <!-- 顶部现代导航 -->
    <HeaderNav />

    <!-- 主体区域：左侧属性侧边栏 + 右侧主工作画布 -->
    <div class="flex-1 flex overflow-hidden">
      <!-- 实时属性透视仪表盘 -->
      <SideStats />

      <!-- 主视图根据 activeTab 动态呈现 -->
      <main class="flex-1 relative flex flex-col overflow-hidden bg-black">
        <!-- 1. 天赋树视图 (4,912 真实节点) -->
        <PassiveTreeCanvas v-if="store.activeTab === 'TREE'" />

        <!-- 2. 技能宝石视图 (966 真实宝石库) -->
        <SkillsPanel v-else-if="store.activeTab === 'SKILLS'" />

        <!-- 3. 装备与物品视图 (443 真实暗金库与 10 大插槽) -->
        <ItemsPanel v-else-if="store.activeTab === 'ITEMS'" />

        <!-- 4. 生存与防御工作区；技能伤害计算仅保留在技能页 -->
        <DefencesPanel v-else-if="store.activeTab === 'CALCS'" />

        <!-- 5. 战斗状态配置 -->
        <ConfigPanel v-else-if="store.activeTab === 'CONFIG'" />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, onMounted } from 'vue';
import { useBuildStore } from './stores/buildStore';
import HeaderNav from './components/HeaderNav.vue';
import SideStats from './components/SideStats.vue';

const PassiveTreeCanvas = defineAsyncComponent(() => import('./components/PassiveTreeCanvas.vue'));
const SkillsPanel = defineAsyncComponent(() => import('./components/SkillsPanel.vue'));
const ItemsPanel = defineAsyncComponent(() => import('./components/ItemsPanel.vue'));
const DefencesPanel = defineAsyncComponent(() => import('./components/DefencesPanel.vue'));
const ConfigPanel = defineAsyncComponent(() => import('./components/ConfigPanel.vue'));

const store = useBuildStore();

onMounted(() => {
  store.loadFromStorage();
  if (store.canonicalBuild) {
    store.recalculate();
  }
});
</script>
