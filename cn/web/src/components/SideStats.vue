<template>
  <aside class="w-80 border-r border-poe-border bg-poe-panel/90 backdrop-blur-md flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden select-none z-10">
    <!-- 侧边栏标题栏 -->
    <div class="p-3 border-b border-poe-border/70 flex items-center justify-between bg-black/40">
      <div class="flex items-center space-x-2">
        <Activity class="w-4 h-4 text-poe-gold" />
        <span class="font-bold text-xs uppercase tracking-wider text-gray-300">角色属性透视面板</span>
      </div>
      <div class="flex items-center space-x-1.5">
        <span v-if="store.isCalculating" class="animate-spin w-3.5 h-3.5 border-2 border-poe-gold border-t-transparent rounded-full"></span>
        <span class="text-[10px] text-gray-500 font-mono">100% 官方精度</span>
      </div>
    </div>

    <!-- 滚动属性区域 -->
    <div class="flex-1 overflow-y-auto p-3 space-y-4">
      <div v-if="store.lastCalculationError" class="border border-red-500/60 bg-red-950/60 px-3 py-2 text-xs text-red-100" role="alert">
        <div class="font-bold text-red-300">本次修改未进入官方 PoB 计算</div>
        <div class="mt-1 break-words text-red-100/90">{{ store.lastCalculationError.message }}</div>
        <div class="mt-1 font-mono text-[10px] text-red-300/80">{{ store.lastCalculationError.code }}</div>
      </div>

      <!-- 核心 DPS 模块 -->
      <div class="glass-card rounded-lg p-3 bg-gradient-to-b from-poe-card/90 to-red-950/20 border-red-900/30">
        <div class="flex items-center justify-between pb-2 border-b border-white/5 mb-2">
          <div class="flex items-center space-x-1.5">
            <Flame class="w-4 h-4 text-red-400" />
            <span class="text-xs font-bold text-red-300">主技能输出</span>
          </div>
          <span class="text-[11px] text-gray-400 font-medium truncate max-w-[140px]">{{ mainSkillName }}</span>
        </div>

        <div class="space-y-1.5 text-xs">
          <div class="flex justify-between items-baseline">
            <span class="text-gray-400">单次击中伤害</span>
            <span class="font-bold text-white font-mono text-sm">{{ formatNumber(store.stats.AverageDamage) }}</span>
          </div>
          <div class="flex justify-between items-baseline">
            <span class="text-gray-400">攻击/施法速度</span>
            <span class="font-bold text-gray-200 font-mono">{{ (store.stats.Speed || 0).toFixed(2) }} /秒</span>
          </div>
          <div class="flex justify-between items-baseline">
            <span class="text-gray-400">暴击几率</span>
            <span class="font-bold text-yellow-400 font-mono">{{ (store.stats.CritChance || 0).toFixed(1) }}%</span>
          </div>
          <div class="flex justify-between items-baseline">
            <span class="text-gray-400">暴击伤害加成</span>
            <span class="font-bold text-yellow-400 font-mono">{{ store.stats.CritMultiplier || 0 }}%</span>
          </div>
          <div class="flex justify-between items-baseline">
            <span class="text-gray-400">命中几率</span>
            <span class="font-bold text-green-400 font-mono">{{ store.stats.HitChance || 0 }}%</span>
          </div>

          <div v-if="(store.stats.IgniteDPS || 0) > 0" class="pt-1.5 border-t border-white/5 space-y-1">
            <div class="flex justify-between items-baseline">
              <span class="text-blue-300">击中秒伤</span>
              <span class="font-bold text-blue-200 font-mono">{{ formatNumber(store.stats.HitDPS) }}</span>
            </div>
            <div class="flex justify-between items-baseline">
              <span class="text-amber-300">点燃秒伤</span>
              <span class="font-bold text-amber-200 font-mono">{{ formatNumber(store.stats.IgniteDPS) }}</span>
            </div>
          </div>

          <div class="pt-2 mt-2 border-t border-white/10 flex justify-between items-baseline">
            <span class="font-bold text-poe-gold">总输出秒伤</span>
            <span class="font-bold text-poe-gold font-mono text-base tracking-wide">{{ formatNumber(store.stats.TotalDPS) }}</span>
          </div>
        </div>
      </div>

      <!-- 生存与防御模块 (全面强化 PoE2 防御机制) -->
      <div class="glass-card rounded-lg p-3 bg-gradient-to-b from-poe-card/90 to-blue-950/20 border-blue-900/30">
        <div class="flex items-center justify-between pb-2 border-b border-white/5 mb-2">
          <div class="flex items-center space-x-1.5">
            <ShieldCheck class="w-4 h-4 text-blue-400" />
            <span class="text-xs font-bold text-blue-300">综合防御与生命池</span>
          </div>
          <span class="text-[10px] text-gray-400 font-mono">有效生命 {{ formatNumber(store.stats.TotalEHP) }}</span>
        </div>

        <div class="space-y-2 text-xs">
          <!-- 1. 生命 -->
          <div>
            <div class="flex justify-between text-[11px] mb-1">
              <span class="text-red-400 font-semibold">生命</span>
              <span class="font-mono text-white font-bold">{{ store.stats.Life || 0 }} / {{ store.stats.Life || 0 }}</span>
            </div>
            <div class="w-full h-1.5 bg-black/60 rounded-full overflow-hidden border border-red-900/50">
              <div class="h-full bg-gradient-to-r from-red-700 to-red-500 rounded-full w-full"></div>
            </div>
          </div>

          <!-- 2. 能量护盾 -->
          <div>
            <div class="flex justify-between text-[11px] mb-1">
              <span class="text-cyan-400 font-semibold">能量护盾</span>
              <span class="font-mono text-cyan-200 font-bold">{{ store.stats.EnergyShield || 0 }} / {{ store.stats.EnergyShield || 0 }}</span>
            </div>
            <div class="w-full h-1.5 bg-black/60 rounded-full overflow-hidden border border-cyan-900/50">
              <div 
                class="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-full transition-all"
                :style="{ width: (store.stats.EnergyShield || 0) > 0 ? '100%' : '0%' }"
              ></div>
            </div>
          </div>

          <!-- 3. 符文结界 -->
          <div>
            <div class="flex justify-between text-[11px] mb-1">
              <span class="text-amber-300 font-semibold">符文结界</span>
              <span class="font-mono text-amber-200 font-bold">{{ store.stats.Ward || 0 }}</span>
            </div>
            <div class="w-full h-1.5 bg-black/60 rounded-full overflow-hidden border border-amber-900/50">
              <div 
                class="h-full bg-gradient-to-r from-amber-600 to-yellow-400 rounded-full transition-all"
                :style="{ width: (store.stats.Ward || 0) > 0 ? '100%' : '0%' }"
              ></div>
            </div>
          </div>

          <!-- 4. 魔力 -->
          <div>
            <div class="flex justify-between text-[11px] mb-1">
              <span class="text-blue-400 font-semibold">魔力</span>
              <span class="font-mono text-white font-bold">{{ store.stats.Mana || 0 }} / {{ store.stats.Mana || 0 }}</span>
            </div>
            <div class="w-full h-1.5 bg-black/60 rounded-full overflow-hidden border border-blue-900/50">
              <div class="h-full bg-gradient-to-r from-blue-700 to-blue-500 rounded-full w-full"></div>
            </div>
          </div>

          <!-- 5. 精魂 -->
          <div>
            <div class="flex justify-between text-[11px] mb-1">
              <span class="text-purple-400 font-semibold">精魂</span>
              <span class="font-mono text-white font-bold">{{ store.stats.TotalSpirit || 0 }} / {{ store.stats.TotalSpirit || 0 }}</span>
            </div>
            <div class="w-full h-1.5 bg-black/60 rounded-full overflow-hidden border border-purple-900/50">
              <div class="h-full bg-gradient-to-r from-purple-700 to-amber-500 rounded-full w-full"></div>
            </div>
          </div>

          <!-- 6. 核心防御机制矩阵 (2x2 网格: 护甲、闪避与闪避率、攻击格挡、法术格挡) -->
          <div class="pt-2 border-t border-white/5 grid grid-cols-2 gap-1.5 text-[11px]">
            <!-- 护甲值 -->
            <div class="bg-black/40 p-1.5 rounded border border-white/5 flex flex-col justify-between">
              <span class="text-gray-400 text-[10px]">护甲值</span>
              <span class="font-mono font-bold text-gray-200 text-xs mt-0.5">{{ store.stats.Armour || 0 }}</span>
            </div>

            <!-- 闪避值与闪避几率 -->
            <div class="bg-black/40 p-1.5 rounded border border-white/5 flex flex-col justify-between">
              <div class="flex items-center justify-between">
                <span class="text-gray-400 text-[10px]">闪避值</span>
                <span class="text-emerald-400 text-[9.5px] font-mono font-bold">{{ (store.stats.EvadeChance || store.stats.AverageEvadeChance || 0).toFixed(1) }}%</span>
              </div>
              <div class="font-mono font-bold text-gray-200 text-xs mt-0.5 flex items-baseline justify-between">
                <span>{{ Math.round(store.stats.Evasion || 0) }}</span>
                <span class="text-[9px] text-gray-500 font-normal">闪避几率</span>
              </div>
            </div>

            <!-- 攻击格挡几率 -->
            <div class="bg-black/40 p-1.5 rounded border border-white/5 flex flex-col justify-between">
              <span class="text-gray-400 text-[10px]">攻击格挡</span>
              <span class="font-mono font-bold text-amber-300 text-xs mt-0.5">
                {{ (store.stats.BlockChance || store.stats.EffectiveBlockChance || 0).toFixed(1) }}%
              </span>
            </div>

            <!-- 法术格挡几率 -->
            <div class="bg-black/40 p-1.5 rounded border border-white/5 flex flex-col justify-between">
              <span class="text-gray-400 text-[10px]">法术格挡</span>
              <span class="font-mono font-bold text-sky-300 text-xs mt-0.5">
                {{ (store.stats.SpellBlockChance || store.stats.EffectiveSpellBlockChance || 0).toFixed(1) }}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 四大抗性网格 -->
      <div class="glass-card rounded-lg p-3">
        <div class="text-xs font-bold text-gray-300 pb-2 border-b border-white/5 mb-2 flex items-center justify-between">
          <span>元素与混沌抗性</span>
          <span class="text-[10px] text-gray-500 font-normal">封顶: 75%</span>
        </div>
        <div class="grid grid-cols-2 gap-2 text-xs">
          <!-- 火抗 -->
          <div class="bg-gradient-to-br from-red-950/30 to-black p-2 rounded border border-red-900/40 flex items-center justify-between">
            <span class="text-red-400 font-medium">火焰抗性</span>
            <span class="font-mono font-bold text-red-300">{{ store.stats.FireRes ?? store.stats.FireResist ?? 0 }}%</span>
          </div>
          <!-- 冰抗 -->
          <div class="bg-gradient-to-br from-blue-950/30 to-black p-2 rounded border border-blue-900/40 flex items-center justify-between">
            <span class="text-blue-400 font-medium">冰霜抗性</span>
            <span class="font-mono font-bold text-blue-300">{{ store.stats.ColdRes ?? store.stats.ColdResist ?? 0 }}%</span>
          </div>
          <!-- 电抗 -->
          <div class="bg-gradient-to-br from-amber-950/30 to-black p-2 rounded border border-amber-900/40 flex items-center justify-between">
            <span class="text-yellow-400 font-medium">闪电抗性</span>
            <span class="font-mono font-bold text-yellow-300">{{ store.stats.LightningRes ?? store.stats.LightningResist ?? 0 }}%</span>
          </div>
          <!-- 混抗 -->
          <div class="bg-gradient-to-br from-purple-950/30 to-black p-2 rounded border border-purple-900/40 flex items-center justify-between">
            <span class="text-purple-400 font-medium">混沌抗性</span>
            <span class="font-mono font-bold text-purple-300">{{ store.stats.ChaosRes ?? store.stats.ChaosResist ?? 0 }}%</span>
          </div>
        </div>
      </div>

      <!-- 三维基础属性 -->
      <div class="glass-card rounded-lg p-3">
        <div class="text-xs font-bold text-gray-300 pb-2 border-b border-white/5 mb-2">三维核心属性</div>
        <div class="grid grid-cols-3 gap-2 text-center text-xs">
          <div class="bg-black/30 p-2 rounded border border-red-900/20">
            <div class="text-red-400 text-[10px]">力量</div>
            <div class="font-mono font-bold text-sm text-gray-200 mt-0.5">{{ store.stats.Str || 0 }}</div>
          </div>
          <div class="bg-black/30 p-2 rounded border border-green-900/20">
            <div class="text-green-400 text-[10px]">敏捷</div>
            <div class="font-mono font-bold text-sm text-gray-200 mt-0.5">{{ store.stats.Dex || 0 }}</div>
          </div>
          <div class="bg-black/30 p-2 rounded border border-blue-900/20">
            <div class="text-blue-400 text-[10px]">智慧</div>
            <div class="font-mono font-bold text-sm text-gray-200 mt-0.5">{{ store.stats.Int || 0 }}</div>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useBuildStore } from '../stores/buildStore';
import { Activity, Flame, ShieldCheck } from 'lucide-vue-next';

const store = useBuildStore();

const mainSkillName = computed(() => {
  const mainGroup = store.socketGroups.find(g => g.isMain) || store.socketGroups[0];
  if (!mainGroup) return '普通攻击';
  const activeGem = (mainGroup.gems || []).find((gem: any) => !gem.isSupport);
  return activeGem ? `${activeGem.name_cn || activeGem.name}` : mainGroup.label;
});

function formatNumber(num: number | undefined): string {
  if (num === undefined || num === null || isNaN(num)) return '0';
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + 'm';
  } else if (num >= 1000) {
    return num.toLocaleString('en-US', { maximumFractionDigits: 1 });
  }
  return num.toFixed(1);
}
</script>
