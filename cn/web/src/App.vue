<template>
  <div v-if="restoring" class="flex h-screen items-center justify-center bg-[#111214] text-gray-300" role="status">正在恢复当前网页的流派...</div>
  <BuildLibrary v-else-if="!store.sessionId" />
  <div v-else :key="store.sessionId" class="h-screen w-screen flex flex-col bg-poe-bg text-gray-100 overflow-hidden font-sans">
    <!-- 顶部现代导航 -->
    <HeaderNav />
    <div v-if="library.error || store.storageError || store.lastCalculationError || library.notice" class="flex flex-wrap items-center gap-3 border-b border-white/10 bg-[#1b1c1e] px-4 py-2 text-xs" role="status">
      <span class="min-w-0 break-words" :class="library.error || store.storageError || store.lastCalculationError ? 'text-red-300' : 'text-emerald-300'">{{ library.error || store.storageError || store.lastCalculationError?.message || library.notice }}</span>
      <button v-if="library.error" class="text-sky-300 underline" :disabled="library.busy" @click="library.save(true)">另存为</button>
      <button v-if="library.error && store.savedBuild" class="text-sky-300 underline" :disabled="library.busy" @click="library.openSaved(store.savedBuild!.id)">重新载入存档</button>
      <button v-if="store.lastCalculationError" class="text-sky-300 underline" :disabled="library.busy" @click="library.restoreCurrent()">恢复当前草稿</button>
    </div>

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
  <SharedItemPool v-if="library.showPool && (!store.sessionId || store.activeTab !== 'ITEMS')" />
</template>

<script setup lang="ts">
import { defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import { useBuildStore } from './stores/buildStore';
import { useLibraryStore } from './stores/libraryStore';
import { bridgeFetch } from './api/bridgeClient';
import BuildLibrary from './components/BuildLibrary.vue';
import HeaderNav from './components/HeaderNav.vue';
import SideStats from './components/SideStats.vue';

const PassiveTreeCanvas = defineAsyncComponent(() => import('./components/PassiveTreeCanvas.vue'));
const SkillsPanel = defineAsyncComponent(() => import('./components/SkillsPanel.vue'));
const ItemsPanel = defineAsyncComponent(() => import('./components/ItemsPanel.vue'));
const DefencesPanel = defineAsyncComponent(() => import('./components/DefencesPanel.vue'));
const ConfigPanel = defineAsyncComponent(() => import('./components/ConfigPanel.vue'));
const SharedItemPool = defineAsyncComponent(() => import('./components/SharedItemPool.vue'));

const store = useBuildStore();
const library = useLibraryStore();
const restoring = ref(true);
let heartbeat: ReturnType<typeof setInterval>;

function beforeUnload(event: BeforeUnloadEvent) {
  if (library.dirty || library.busy || store.isCalculating || store.isOpening) { event.preventDefault(); event.returnValue = ''; }
}

function releaseSession(event: PageTransitionEvent) {
  if (!event.persisted && store.sessionId) navigator.sendBeacon('/api/sessions/close', new Blob([JSON.stringify({ sessionId: store.sessionId })], { type: 'application/json' }));
}

async function heartbeatSession() {
  const sessionId = store.sessionId;
  if (!sessionId) return;
  try {
    const response = await bridgeFetch(sessionId, '/api/sessions/heartbeat', { method: 'POST', body: '{}' });
    if (!response.ok && store.sessionId === sessionId) store.lastCalculationError = { code: 'POB_SESSION_UNAVAILABLE', message: '计算会话已结束，当前网页草稿仍保留，请恢复后继续编辑。' };
  } catch (error) {
    if (store.sessionId === sessionId) store.lastCalculationError = { code: 'POB_SERVICE_UNAVAILABLE', message: '无法连接计算服务，当前网页草稿仍保留。' };
  }
}

watch(() => store.buildName, () => { if (store.canonicalBuild) store.saveToStorage(); });
onMounted(async () => {
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  // 只恢复本页刷新；复制标签页即使继承 sessionStorage 也不得继承会话。
  if (navigation?.type === 'reload') {
    store.loadFromStorage();
    if (store.canonicalBuild) await store.ensureCanonicalBuildLoaded();
  } else {
    try { sessionStorage.removeItem('pob_nextgen_build_state'); }
    catch (error) { store.storageError = '浏览器禁止访问当前网页草稿。'; console.warn(store.storageError, error); }
  }
  restoring.value = false;
  heartbeat = setInterval(() => { void heartbeatSession(); }, 30_000);
  window.addEventListener('beforeunload', beforeUnload);
  window.addEventListener('pagehide', releaseSession);
  window.addEventListener('focus', heartbeatSession);
});
onUnmounted(() => {
  clearInterval(heartbeat);
  window.removeEventListener('beforeunload', beforeUnload);
  window.removeEventListener('pagehide', releaseSession);
  window.removeEventListener('focus', heartbeatSession);
});
</script>
