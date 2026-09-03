<template>
  <div 
    class="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] flex items-center justify-center p-4 select-none"
    @click.self="$emit('close')"
  >
    <div class="w-full max-w-2xl glass-panel p-6 rounded-2xl border border-poe-gold/50 shadow-2xl space-y-5">
      <!-- 弹窗标题 -->
      <div class="flex items-center justify-between border-b border-white/10 pb-3">
        <div class="flex items-center space-x-2">
          <Download class="w-5 h-5 text-poe-gold" />
          <h3 class="font-bold text-base text-poe-gold font-poe-title">导入与导出流派配置</h3>
        </div>
        <button @click="$emit('close')" class="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white">
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- 标签页切换：导入 / 导出 -->
      <div class="flex items-center space-x-2 bg-black/60 p-1 rounded-lg border border-poe-border text-xs">
        <button 
          @click="activeMode = 'IMPORT'"
          :class="['flex-1 py-1.5 rounded font-bold transition-all', activeMode === 'IMPORT' ? 'bg-poe-gold text-black shadow' : 'text-gray-400 hover:text-white']"
        >
          导入流派配置
        </button>
        <button 
          @click="generateExportCode"
          :class="['flex-1 py-1.5 rounded font-bold transition-all', activeMode === 'EXPORT' ? 'bg-poe-gold text-black shadow' : 'text-gray-400 hover:text-white']"
        >
          导出分享代码
        </button>
      </div>

      <!-- 1. 导入模式 -->
      <div v-if="activeMode === 'IMPORT'" class="space-y-3">
        <div class="text-xs text-gray-400">
          请在下方粘贴 **PoB 编码串** (Base64) 或 **XML 配置代码**：
        </div>
        <textarea 
          v-model="importCode"
          class="w-full h-36 bg-black/60 border border-poe-border rounded-xl p-3 text-xs font-mono text-gray-200 outline-none focus:border-poe-gold transition-all resize-none"
          placeholder="在此处粘贴 eNrtW1tz... 或 XML 配置代码"
        ></textarea>
        <div class="flex justify-between items-center pt-2">
          <span v-if="importStatus" :class="['text-xs font-medium', importError ? 'text-red-400' : 'text-green-400']">
            {{ importStatus }}
          </span>
          <span v-else></span>
          <div class="flex space-x-2">
            <button @click="$emit('close')" class="btn-primary text-xs">取消</button>
            <button 
              @click="doImport" 
              :disabled="loading"
              class="btn-gold text-xs flex items-center space-x-1 disabled:opacity-50"
            >
              <Check class="w-3.5 h-3.5" />
              <span>{{ loading ? '正在解析计算...' : '立即导入' }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 2. 导出模式 -->
      <div v-else class="space-y-3">
        <div class="text-xs text-gray-400">
          下方是当前流派生成的分享编码，可直接在任何 PoB 客户端中导入：
        </div>
        <textarea 
          readonly 
          v-model="exportCode"
          class="w-full h-36 bg-black/60 border border-poe-border rounded-xl p-3 text-xs font-mono text-gray-300 outline-none focus:border-poe-gold transition-all resize-none"
        ></textarea>
        <div class="flex justify-between items-center pt-2">
          <span v-if="exportStatus" :class="['text-xs font-medium', exportError ? 'text-red-400' : 'text-green-400']">{{ exportStatus }}</span>
          <span v-else></span>
          <button @click="copyExportCode" :disabled="!exportCode || exportLoading" class="btn-gold text-xs flex items-center space-x-1 disabled:opacity-50">
            <Copy class="w-3.5 h-3.5" />
            <span>{{ exportLoading ? '正在生成...' : '复制分享代码' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useBuildStore } from '../stores/buildStore';
import { Download, X, Copy, Check } from 'lucide-vue-next';

const emit = defineEmits(['close']);

function handleGlobalKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close');
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeyDown);
});

const store = useBuildStore();
const activeMode = ref<'IMPORT' | 'EXPORT'>('IMPORT');
const importCode = ref('');
const exportCode = ref('');
const copied = ref(false);
const exportLoading = ref(false);
const exportStatus = ref('');
const exportError = ref(false);
const loading = ref(false);
const importStatus = ref('');
const importError = ref(false);

async function generateExportCode() {
  activeMode.value = 'EXPORT';
  copied.value = false;
  exportLoading.value = true;
  exportStatus.value = '正在由官方 PoB 核心生成分享代码...';
  exportError.value = false;
  try {
    const result = await store.exportCanonicalBuild();
    if (!result.success || !result.code) throw new Error(result.error ? `[${result.error.code}] ${result.error.message}` : '官方 PoB XML 导出失败');
    exportCode.value = result.code;
    exportStatus.value = '分享代码已生成。';
  } catch (error) {
    exportCode.value = '';
    exportError.value = true;
    exportStatus.value = error instanceof Error ? error.message : '导出失败。';
  } finally {
    exportLoading.value = false;
  }
}

function copyExportCode() {
  navigator.clipboard.writeText(exportCode.value);
  copied.value = true;
  exportStatus.value = '已复制到剪贴板。';
  exportError.value = false;
  setTimeout(() => copied.value = false, 2000);
}

async function doImport() {
  const code = importCode.value.trim();
  if (!code) {
    importStatus.value = '请输入有效的 PoB 导入代码！';
    importError.value = true;
    return;
  }

  loading.value = true;
  importStatus.value = '正在解压并由官方计算核心解析...';
  importError.value = false;

  const result = await store.importBuildFromCode(code);
  loading.value = false;

  if (result.success) {
    importStatus.value = '🎉 流派导入成功！天赋、装备、技能与属性已全部更新。';
    setTimeout(() => {
      emit('close');
    }, 800);
  } else {
    importStatus.value = `[${result.error.code}] ${result.error.message}`;
    importError.value = true;
  }
}
</script>
