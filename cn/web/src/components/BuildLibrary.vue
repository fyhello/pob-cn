<template>
  <main class="h-screen overflow-y-auto bg-[#111214] text-gray-100">
    <header class="border-b border-white/15 px-5 py-4">
      <div class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <h1 class="text-xl font-semibold">PoB NextGen <span class="ml-3 text-sm font-normal text-gray-400">流派存档</span></h1>
        <button class="btn-primary flex items-center gap-2" @click="library.showPool = true"><Archive :size="16" />公共物品池</button>
      </div>
    </header>
    <div class="mx-auto max-w-5xl px-5 py-6">
      <p v-if="library.error || store.storageError" role="alert" class="mb-4 break-words text-sm text-red-300">{{ library.error || store.storageError }}</p>
      <div v-if="store.canonicalBuild && !store.sessionId" class="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <span class="text-red-300">{{ store.lastCalculationError?.message || store.lastImportError?.message }}</span>
        <button :disabled="library.busy" class="text-sky-300 underline" @click="library.restoreCurrent()">恢复当前草稿</button>
      </div>
      <section class="border-b border-white/15 pb-6">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-base font-medium">新建存档</h2>
          <div class="flex gap-1 border-b border-white/20 text-sm">
            <button :aria-pressed="mode === 'new'" class="px-3 py-2" :class="mode === 'new' ? 'border-b-2 border-emerald-400 text-emerald-300' : 'text-gray-400'" @click="mode = 'new'">空白流派</button>
            <button :aria-pressed="mode === 'import'" class="px-3 py-2" :class="mode === 'import' ? 'border-b-2 border-emerald-400 text-emerald-300' : 'text-gray-400'" @click="mode = 'import'">导入流派</button>
          </div>
        </div>
        <form class="space-y-3" @submit.prevent="create">
          <label class="block text-xs text-gray-400" for="build-name">存档名称</label>
          <div class="flex flex-wrap gap-3">
            <input id="build-name" v-model="name" required maxlength="120" class="min-w-0 flex-1 rounded border border-white/20 bg-black/40 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
            <button type="submit" :disabled="library.busy" class="btn-primary flex items-center gap-2 disabled:opacity-50"><Plus :size="16" />{{ library.busy ? '正在打开...' : mode === 'new' ? '新建' : '导入并保存' }}</button>
          </div>
          <textarea v-if="mode === 'import'" v-model="code" required aria-label="PoB 分享代码或 XML" placeholder="PoB 分享代码或 XML" class="h-32 w-full resize-y rounded border border-white/20 bg-black/40 p-3 font-mono text-xs outline-none focus:border-emerald-400" />
        </form>
        <button v-if="legacyCode" class="mt-3 text-sm text-sky-300 underline" :disabled="library.busy" @click="restoreLegacy">导入旧版浏览器流派</button>
      </section>
      <section class="pt-6">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-base font-medium">已保存存档 <span class="ml-2 text-xs text-gray-400">{{ library.builds.length }}</span></h2>
          <div class="flex items-center gap-2">
            <label class="flex min-w-0 items-center gap-2 border-b border-white/30 pb-1"><Search :size="16" class="text-gray-400" /><input v-model="query" aria-label="搜索存档" placeholder="搜索存档" class="w-40 bg-transparent text-sm outline-none sm:w-56" /></label>
            <button title="刷新存档列表" aria-label="刷新存档列表" class="p-2 hover:text-emerald-300" @click="library.refresh()"><RefreshCw :size="16" /></button>
          </div>
        </div>
        <p v-if="loading" role="status" class="py-10 text-center text-sm text-gray-400">正在读取存档...</p>
        <ul v-else class="divide-y divide-white/10">
          <li v-for="entry in filtered" :key="entry.id" class="flex items-center gap-3 py-4">
            <FileText :size="20" class="shrink-0 text-sky-300" />
            <button class="min-w-0 flex-1 text-left" :disabled="library.busy" @click="library.openSaved(entry.id)">
              <span class="block break-words text-sm font-medium hover:text-emerald-300">{{ entry.name }}</span>
              <time class="mt-1 block text-xs text-gray-400">{{ new Date(entry.updatedAt).toLocaleString('zh-CN') }}</time>
            </button>
            <button :disabled="library.busy" title="打开存档" aria-label="打开存档" class="p-2 text-emerald-300" @click="library.openSaved(entry.id)"><FolderOpen :size="17" /></button>
            <button :disabled="library.busy" title="重命名" aria-label="重命名" class="p-2 text-gray-400 hover:text-white" @click="library.rename('builds', entry)"><Pencil :size="16" /></button>
            <button :disabled="library.busy" title="删除存档" aria-label="删除存档" class="p-2 text-gray-400 hover:text-red-300" @click="library.remove('builds', entry)"><Trash2 :size="16" /></button>
          </li>
        </ul>
        <p v-if="!loading && !filtered.length" class="py-10 text-center text-sm text-gray-500">{{ query ? '没有匹配的存档' : '暂无已保存存档' }}</p>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Archive, FileText, FolderOpen, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-vue-next';
import { useLibraryStore } from '../stores/libraryStore';
import { useBuildStore } from '../stores/buildStore';

const library = useLibraryStore();
const store = useBuildStore();
const mode = ref<'new' | 'import'>('new');
const name = ref('');
const code = ref('');
const query = ref('');
const legacyCode = ref('');
const loading = ref(true);
const filtered = computed(() => library.builds.filter(entry => entry.name.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())));

async function create() {
  await library.create(name.value, mode.value === 'import' ? code.value.trim() : undefined);
}

async function restoreLegacy() {
  await library.create('旧版浏览器流派', legacyCode.value);
}

onMounted(async () => {
  try {
    const previous = JSON.parse(localStorage.getItem('pob_nextgen_build_state') || 'null');
    if (typeof previous?.canonicalBuild?.code === 'string') legacyCode.value = previous.canonicalBuild.code;
  } catch (error) { console.warn('旧版浏览器存档无法读取，原始内容未删除。', error); }
  await library.refresh();
  loading.value = false;
});
</script>
