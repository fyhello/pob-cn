<template>
  <div class="flex-1 overflow-y-auto bg-[#0a0b0e] p-6 select-none space-y-6 font-sans text-gray-200 relative">
    <!-- 1. 顶栏：技能信息、计算模式胶囊按钮组、总输出秒伤 -->
    <header class="p-4 rounded-2xl bg-black/80 border border-poe-border/80 shadow-2xl flex flex-wrap items-center justify-between gap-4">
      <div class="flex items-center space-x-3.5">
        <div class="w-12 h-12 rounded-xl bg-amber-950/40 border border-amber-500/50 flex items-center justify-center text-amber-400 shadow-inner shrink-0">
          <Flame class="w-6 h-6 text-poe-gold" />
        </div>
        <div class="space-y-1">
          <div class="flex items-center space-x-2">
            <h2 class="text-base font-black text-gray-100 font-poe-title">
              {{ skillMeta.name }} <span class="text-xs font-normal text-gray-400 font-mono">({{ skillMeta.rawName }})</span>
            </h2>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/70 border border-emerald-500/60 text-emerald-300 font-mono">
              #{{ store.selectedCalculationSkillIndex + 1 }} 技能组
            </span>
          </div>
          <div class="text-[11px] text-gray-400 flex items-center space-x-2 font-mono">
            <span>连接宝石: <strong class="text-gray-200">{{ skillMeta.gemCount }} 颗</strong></span>
            <span>•</span>
            <span>主技能等级: <strong class="text-gray-200">{{ skillMeta.level }} 级</strong></span>
            <span>•</span>
            <span>品质: <strong class="text-gray-200">{{ skillMeta.quality }}%</strong></span>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-6">
        <div class="space-y-1 text-right">
          <div class="text-[10px] text-gray-500 font-semibold uppercase tracking-wider font-mono">计算模式</div>
          <div class="flex items-center gap-1 bg-black/90 p-1 rounded-xl border border-white/15 text-xs">
            <button 
              v-for="mode in calcModes" 
              :key="mode.id" 
              @click="handleModeSelect(mode.id)"
              :disabled="store.isCalculating"
              :class="[
                'px-3 py-1 rounded-lg transition-all font-semibold text-xs',
                selectedCalcMode === mode.id 
                  ? 'bg-gradient-to-r from-amber-600 to-amber-700 text-white font-bold shadow-md ring-1 ring-amber-400/50' 
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5',
                store.isCalculating ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
              ]"
            >
              {{ mode.label }}
            </button>
          </div>
        </div>

        <div class="text-right space-y-0.5 pl-4 border-l border-white/10">
          <div class="text-[10px] text-gray-400 font-bold uppercase tracking-wider font-mono">总输出秒伤</div>
          <div class="text-3xl font-black font-mono text-poe-gold tracking-tight drop-shadow-md">
            {{ formatNumber(dpsData.totalDPS) }}
          </div>
        </div>
      </div>
    </header>

    <!-- 2. 金字塔第一层（顶层）：综合总秒伤构成流水线 -->
    <section class="p-5 rounded-2xl bg-black/60 border border-poe-gold/40 shadow-xl space-y-3.5">
      <div class="flex items-center justify-between border-b border-white/10 pb-2.5">
        <span class="text-xs font-bold text-amber-300 flex items-center gap-2 font-poe-title">
          <Sparkles class="w-4 h-4 text-poe-gold" />
          <span>金字塔顶层：综合总输出秒伤构成</span>
        </span>
        <span class="text-[11px] text-gray-400 font-mono">鼠标悬停卡片弹出公式浮窗，固定后可自由拖动移位</span>
      </div>

      <div class="flex flex-wrap items-center justify-center gap-3 py-1">
        <!-- 综合总秒伤 -->
        <div 
          @mouseenter="onCardMouseEnter('totalDPS', $event)"
          @mouseleave="onCardMouseLeave"
          @click="onCardClick('totalDPS', $event)"
          :class="[
            'px-6 py-3.5 rounded-xl border transition-all cursor-pointer text-center min-w-[210px] space-y-1 relative select-none',
            isPrimaryPinned('totalDPS') ? 'bg-amber-950/90 border-poe-gold ring-2 ring-poe-gold shadow-2xl' : 'bg-black/80 border-poe-gold/70 hover:border-poe-gold hover:bg-amber-950/30'
          ]"
        >
          <div class="text-[11px] font-semibold text-poe-gold/90 font-mono flex items-center justify-center gap-1">
            <span>综合总输出秒伤</span>
            <span v-if="isPrimaryPinned('totalDPS')" class="text-[10px] text-poe-gold">📌</span>
          </div>
          <div class="text-2xl font-black font-mono text-white tracking-tight">{{ formatNumber(dpsData.totalDPS) }}</div>
          <div class="text-[10px] text-gray-400 font-mono">击中 + 持续伤害总计</div>
        </div>

        <span class="text-gray-400 font-bold text-lg font-mono">=</span>

        <!-- 击中秒伤 -->
        <div 
          @mouseenter="onCardMouseEnter('hitDPS', $event)"
          @mouseleave="onCardMouseLeave"
          @click="onCardClick('hitDPS', $event)"
          :class="[
            'px-6 py-3.5 rounded-xl border transition-all cursor-pointer text-center min-w-[210px] space-y-1 relative select-none',
            isPrimaryPinned('hitDPS') ? 'bg-blue-950/90 border-blue-400 ring-2 ring-blue-400 shadow-2xl' : 'bg-blue-950/30 border-blue-600/50 hover:border-blue-400 hover:bg-blue-950/50'
          ]"
        >
          <div class="text-[11px] font-semibold text-blue-300 font-mono flex items-center justify-center gap-1">
            <span>击中秒伤</span>
            <span v-if="isPrimaryPinned('hitDPS')" class="text-[10px] text-blue-300">📌</span>
          </div>
          <div class="text-2xl font-black font-mono text-blue-200 tracking-tight">{{ formatNumber(dpsData.hitDPS) }}</div>
          <div class="text-[10px] text-blue-300/70 font-mono">单次均伤 × 频次 × 命中</div>
        </div>

        <template v-if="dpsData.dotDPS > 0">
          <span class="text-gray-400 font-bold text-lg font-mono">+</span>

          <!-- 持续秒伤 -->
          <div 
            @mouseenter="onCardMouseEnter('igniteDPS', $event)"
            @mouseleave="onCardMouseLeave"
            @click="onCardClick('igniteDPS', $event)"
            :class="[
              'px-6 py-3.5 rounded-xl border transition-all cursor-pointer text-center min-w-[210px] space-y-1 relative select-none',
              isPrimaryPinned('igniteDPS') ? 'bg-amber-950/90 border-amber-400 ring-2 ring-amber-400 shadow-2xl' : 'bg-amber-950/30 border-amber-600/50 hover:border-amber-400 hover:bg-amber-950/50'
            ]"
          >
            <div class="text-[11px] font-semibold text-amber-300 font-mono flex items-center justify-center gap-1">
              <span>持续伤害秒伤</span>
              <span v-if="isPrimaryPinned('igniteDPS')" class="text-[10px] text-amber-300">📌</span>
            </div>
            <div class="text-2xl font-black font-mono text-amber-300 tracking-tight">{{ formatNumber(dpsData.dotDPS) }}</div>
            <div class="text-[10px] text-amber-300/70 font-mono">包含点燃 {{ formatNumber(dpsData.igniteDPS) }}</div>
          </div>
        </template>
      </div>
    </section>

    <!-- 3. 金字塔第二层（中层）：击中秒伤与单次击中伤害核心枢纽 (双独立区域) -->
    <section class="p-5 rounded-2xl bg-black/60 border border-white/10 shadow-xl space-y-3.5">
      <div class="flex items-center justify-between border-b border-white/10 pb-2.5">
        <span class="text-xs font-bold text-gray-200 flex items-center gap-2 font-poe-title">
          <Calculator class="w-4 h-4 text-poe-gold" />
          <span>金字塔中层：击中秒伤与单次击中伤害核心拆解</span>
        </span>
        <span class="text-[11px] text-poe-gold font-mono">击中秒伤 = 单次击中均伤 × 动作频次 · 单次击中均伤 = 非暴击均伤 × 暴击期望</span>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- 区域 1 (左)：由单次击中伤害到击中秒伤的计算 -->
        <div 
          @mouseenter="onCardMouseEnter('hitDPS', $event)"
          @mouseleave="onCardMouseLeave"
          @click="onCardClick('hitDPS', $event)"
          :class="[
            'p-4 rounded-xl border transition-all cursor-pointer flex flex-wrap items-center justify-between gap-3 relative select-none',
            isPrimaryPinned('hitDPS') ? 'bg-blue-950/60 border-blue-400 ring-2 ring-blue-400/60 shadow-2xl' : 'bg-black/80 border-white/10 hover:border-blue-500/60'
          ]"
        >
          <div class="space-y-1">
            <div class="text-xs font-bold text-blue-300 flex items-center gap-1.5">
              <span>⚡ 击中输出秒伤</span>
              <span class="px-1.5 py-0.5 rounded text-[10px] bg-blue-950/80 border border-blue-500/50 text-blue-300 font-mono">
                频次: {{ dpsData.speed > 0 ? dpsData.speed.toFixed(2) + '/s' : '-' }}
              </span>
              <span v-if="isPrimaryPinned('hitDPS')" class="text-[10px] text-blue-300">📌</span>
            </div>
            <div class="text-2xl font-black font-mono text-blue-200 tracking-tight">
              {{ formatNumber(dpsData.hitDPS) }}
            </div>
          </div>

          <!-- 过程：单次击中均伤 × 每秒动作频次 = 最终击中秒伤 -->
          <div class="flex items-center gap-1.5 text-xs font-mono">
            <div class="p-1.5 rounded-lg bg-black/70 border border-emerald-500/40 text-center min-w-[80px]">
              <div class="text-[9px] text-emerald-300">单次均伤</div>
              <div class="font-bold text-emerald-200">{{ formatNumber(dpsData.avgHit) }}</div>
            </div>
            <span class="text-gray-500 font-bold">×</span>
            <div class="p-1.5 rounded-lg bg-black/70 border border-blue-500/40 text-center min-w-[76px]">
              <div class="text-[9px] text-blue-300">动作频次</div>
              <div class="font-bold text-blue-200">{{ dpsData.speed > 0 ? dpsData.speed.toFixed(2) + '/s' : '-' }}</div>
            </div>
            <span class="text-gray-500 font-bold">=</span>
            <div class="p-1.5 rounded-lg bg-black/70 border border-blue-400/60 text-center min-w-[84px] bg-blue-950/30">
              <div class="text-[9px] text-blue-300">击中秒伤</div>
              <div class="font-bold text-blue-200">{{ formatNumber(dpsData.hitDPS) }}</div>
            </div>
          </div>
        </div>

        <!-- 区域 2 (右)：单次击中伤害构成拆解 -->
        <div 
          @mouseenter="onCardMouseEnter('avgHit', $event)"
          @mouseleave="onCardMouseLeave"
          @click="onCardClick('avgHit', $event)"
          :class="[
            'p-4 rounded-xl border transition-all cursor-pointer flex flex-wrap items-center justify-between gap-3 relative select-none',
            isPrimaryPinned('avgHit') ? 'bg-amber-950/60 border-amber-400 ring-2 ring-amber-400/60 shadow-2xl' : 'bg-black/80 border-white/10 hover:border-amber-500/60'
          ]"
        >
          <div class="space-y-1">
            <div class="text-xs font-bold text-gray-300 flex items-center gap-1.5">
              <span>🎯 单次击中伤害期望</span>
              <span class="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 font-mono">
                命中: {{ dpsData.hitChance > 0 ? dpsData.hitChance + '%' : '-' }}
              </span>
              <span v-if="isPrimaryPinned('avgHit')" class="text-[10px] text-poe-gold">📌</span>
            </div>
            <div class="text-2xl font-black font-mono text-white tracking-tight">
              {{ formatNumber(dpsData.avgHit) }}
            </div>
          </div>

          <!-- 过程：单次击中均伤与暴击期望倍率 -->
          <div class="flex items-center gap-1.5 text-xs font-mono">
            <div class="p-1.5 rounded-lg bg-black/70 border border-yellow-500/40 text-center min-w-[76px]">
              <div class="text-[9px] text-yellow-300">单次均伤</div>
              <div class="font-bold text-yellow-200">{{ formatNumber(dpsData.avgHit) }}</div>
            </div>
            <span class="text-gray-500 font-bold">×</span>
            <div class="p-1.5 rounded-lg bg-black/70 border border-amber-500/40 text-center min-w-[76px]">
              <div class="text-[9px] text-amber-300">暴击倍率</div>
              <div class="font-bold text-amber-200">{{ dpsData.critEffect > 0 ? dpsData.critEffect.toFixed(2) + 'x' : '-' }}</div>
            </div>
            <span class="text-gray-500 font-bold">=</span>
            <div class="p-1.5 rounded-lg bg-black/70 border border-emerald-500/40 text-center min-w-[80px]">
              <div class="text-[9px] text-emerald-300">伤害期望</div>
              <div class="font-bold text-emerald-200">{{ formatNumber(dpsData.avgHit) }}</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 4. 金字塔第三层（底层）：4 大核心计算支柱 -->
    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
      <!-- 支柱 ①：基础点伤构成 -->
      <div 
        @mouseenter="onCardMouseEnter('baseDamage', $event)"
        @mouseleave="onCardMouseLeave"
        @click="onCardClick('baseDamage', $event)"
        :class="[
          'p-4 rounded-xl border transition-all cursor-pointer select-none relative group flex flex-col justify-between space-y-3',
          isPrimaryPinned('baseDamage') ? 'bg-amber-950/50 border-amber-400 ring-2 ring-amber-400/60 shadow-2xl' : 'bg-black/60 border-white/10 hover:border-amber-500/60'
        ]"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-yellow-300 flex items-center gap-1">
            <span>① 各元素击中伤害构成</span>
          </span>
          <Wand2 class="w-4 h-4 text-yellow-400" />
        </div>
        <div class="space-y-1 font-mono">
          <div class="text-xl font-black text-white">
            {{ formatNumber(dpsData.avgHit) }} <span class="text-xs font-normal text-gray-400">均伤</span>
          </div>
          <div class="text-[10px] text-yellow-400/80 truncate">
            区间: {{ (dpsData.totalMin > 0 || dpsData.totalMax > 0) ? (formatNumber(dpsData.totalMin) + ' ~ ' + formatNumber(dpsData.totalMax)) : '-' }}
          </div>
        </div>
        <div class="flex items-center justify-between text-[11px] pt-2 border-t border-white/5 font-mono">
          <span class="text-gray-400">各元素击中点伤与放大流水线</span>
          <span class="text-gray-500 group-hover:text-poe-gold text-[10px]">
            {{ isPrimaryPinned('baseDamage') ? '已固定 📌' : '点击固定 · 悬停看明细' }}
          </span>
        </div>
      </div>

      <!-- 支柱 ②：增伤放大乘区 -->
      <div 
        @mouseenter="onCardMouseEnter('multipliers', $event)"
        @mouseleave="onCardMouseLeave"
        @click="onCardClick('multipliers', $event)"
        :class="[
          'p-4 rounded-xl border transition-all cursor-pointer select-none relative group flex flex-col justify-between space-y-3',
          isPrimaryPinned('multipliers') ? 'bg-cyan-950/50 border-cyan-400 ring-2 ring-cyan-400/60 shadow-2xl' : 'bg-black/60 border-white/10 hover:border-cyan-500/60'
        ]"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-cyan-300 flex items-center gap-1">
            <span>② 增伤放大乘区</span>
          </span>
          <TrendingUp class="w-4 h-4 text-cyan-400" />
        </div>
        <div class="space-y-1 font-mono">
          <div class="text-xl font-black text-cyan-200">
            {{ dpsData.incDamage > 0 ? '+' + dpsData.incDamage + '%' : '-' }} <span class="text-xs font-normal text-gray-400">/ {{ dpsData.moreDamage > 0 ? dpsData.moreDamage.toFixed(2) + 'x' : '-' }}</span>
          </div>
          <div class="text-[10px] text-cyan-400/80 truncate">
            更多乘区: {{ dpsData.moreDamage > 0 ? dpsData.moreDamage.toFixed(2) + 'x' : '-' }}
          </div>
        </div>
        <div class="flex items-center justify-between text-[11px] pt-2 border-t border-white/5 font-mono">
          <span class="text-gray-400">天赋装备+辅助石乘区</span>
          <span class="text-gray-500 group-hover:text-cyan-300 text-[10px]">
            {{ isPrimaryPinned('multipliers') ? '已固定 📌' : '点击固定 · 悬停看明细' }}
          </span>
        </div>
      </div>

      <!-- 支柱 ③：暴击期望系统 -->
      <div 
        @mouseenter="onCardMouseEnter('critSystem', $event)"
        @mouseleave="onCardMouseLeave"
        @click="onCardClick('critSystem', $event)"
        :class="[
          'p-4 rounded-xl border transition-all cursor-pointer select-none relative group flex flex-col justify-between space-y-3',
          isPrimaryPinned('critSystem') ? 'bg-amber-950/50 border-amber-400 ring-2 ring-amber-400/60 shadow-2xl' : 'bg-black/60 border-white/10 hover:border-amber-500/60'
        ]"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-amber-300 flex items-center gap-1">
            <span>③ 暴击期望系统</span>
          </span>
          <Zap class="w-4 h-4 text-amber-400" />
        </div>
        <div class="space-y-1 font-mono">
          <div class="text-xl font-black text-amber-300">
            {{ dpsData.critChance > 0 ? dpsData.critChance.toFixed(1) + '%' : '-' }} <span class="text-xs font-normal text-gray-400">/ {{ dpsData.critMultiplier > 0 ? dpsData.critMultiplier.toFixed(2) + 'x' : '-' }}</span>
          </div>
          <div class="text-[10px] text-amber-400/80 truncate">
            暴击期望综合倍率: {{ dpsData.critEffect > 0 ? dpsData.critEffect.toFixed(2) + 'x' : '-' }}
          </div>
        </div>
        <div class="flex items-center justify-between text-[11px] pt-2 border-t border-white/5 font-mono">
          <span class="text-gray-400">暴伤倍率: {{ dpsData.critMultiplier > 0 ? dpsData.critMultiplier.toFixed(2) + 'x' : '-' }}</span>
          <span class="text-gray-500 group-hover:text-amber-300 text-[10px]">
            {{ isPrimaryPinned('critSystem') ? '已固定 📌' : '点击固定 · 悬停看明细' }}
          </span>
        </div>
      </div>

      <!-- 支柱 ④：动作频次与速度 -->
      <div 
        @mouseenter="onCardMouseEnter('speedSystem', $event)"
        @mouseleave="onCardMouseLeave"
        @click="onCardClick('speedSystem', $event)"
        :class="[
          'p-4 rounded-xl border transition-all cursor-pointer select-none relative group flex flex-col justify-between space-y-3',
          isPrimaryPinned('speedSystem') ? 'bg-emerald-950/50 border-emerald-400 ring-2 ring-emerald-400/60 shadow-2xl' : 'bg-black/60 border-white/10 hover:border-emerald-500/60'
        ]"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-gray-300 flex items-center gap-1">
            <span>④ 动作速度与频次</span>
          </span>
          <Activity class="w-4 h-4 text-emerald-400" />
        </div>
        <div class="space-y-1 font-mono">
          <div class="text-xl font-black text-emerald-300">
            {{ dpsData.speed > 0 ? dpsData.speed.toFixed(2) : '-' }} <span class="text-xs font-normal text-gray-400">/秒</span>
          </div>
          <div class="text-[10px] text-emerald-400/80 truncate">
            动作耗时: {{ dpsData.castTime > 0 ? dpsData.castTime.toFixed(2) + 's' : '-' }}
          </div>
        </div>
        <div class="flex items-center justify-between text-[11px] pt-2 border-t border-white/5 font-mono">
          <span class="text-gray-400">每秒动作 {{ dpsData.speed > 0 ? dpsData.speed.toFixed(2) : '-' }} 次</span>
          <span class="text-gray-500 group-hover:text-emerald-300 text-[10px]">
            {{ isPrimaryPinned('speedSystem') ? '已固定 📌' : '点击固定 · 悬停看明细' }}
          </span>
        </div>
      </div>
    </div>

    <!-- 5. 异常状态与资源消耗 -->
    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
      <!-- 点燃 (伤害型异常) -->
      <div 
        @mouseenter="onCardMouseEnter('igniteDPS', $event)"
        @mouseleave="onCardMouseLeave"
        @click="onCardClick('igniteDPS', $event)"
        :class="[
          'p-3.5 rounded-xl border transition-all cursor-pointer select-none space-y-2 font-mono relative group',
          isPrimaryPinned('igniteDPS') ? 'bg-amber-950/60 border-amber-400 ring-2 ring-amber-400/60 shadow-2xl' : 'bg-black/60 border-white/10 hover:border-amber-500/60'
        ]"
      >
        <div class="flex items-center justify-between text-xs font-bold text-amber-300">
          <span>点燃</span>
          <span class="px-1 py-0.5 rounded text-[9px] bg-amber-950 border border-amber-600/60">持续</span>
        </div>
        <div class="text-xl font-black text-amber-300">{{ formatNumber(dpsData.igniteDPS) }}</div>
        <div class="text-[10px] text-gray-400">点燃几率: {{ dpsData.igniteChance > 0 ? dpsData.igniteChance.toFixed(1) + '%' : '-' }} · 持续 {{ dpsData.igniteDuration > 0 ? dpsData.igniteDuration + 's' : '-' }}</div>
      </div>

      <!-- 非伤害型异常状态 (Shock / Chill / Freeze / Sap 等) -->
      <div 
        @mouseenter="onCardMouseEnter('nonDamagingAilments', $event)"
        @mouseleave="onCardMouseLeave"
        @click="onCardClick('nonDamagingAilments', $event)"
        :class="[
          'p-3.5 rounded-xl border transition-all cursor-pointer select-none space-y-2 font-mono relative group',
          isPrimaryPinned('nonDamagingAilments') ? 'bg-blue-950/60 border-blue-400 ring-2 ring-blue-400 shadow-2xl' : 'bg-black/60 border-white/10 hover:border-blue-500/60'
        ]"
      >
        <div class="flex items-center justify-between text-xs font-bold text-blue-300">
          <span>非伤害型异常状态</span>
          <Zap class="w-3.5 h-3.5 text-blue-400" />
        </div>
        <div class="text-xl font-black text-blue-200">
          {{ dpsData.shockEffect > 0 ? 'x' + dpsData.shockEffect.toFixed(2) : '-' }} <span class="text-xs font-normal text-gray-400">感电效果</span>
        </div>
        <div class="text-[10px] text-gray-400 truncate">
          感电几率: {{ dpsData.shockChance > 0 ? dpsData.shockChance.toFixed(1) + '%' : '-' }} · 点击固定/悬停明细
        </div>
      </div>

      <!-- 技能消耗与秒耗 -->
      <div 
        @mouseenter="onCardMouseEnter('manaCost', $event)"
        @mouseleave="onCardMouseLeave"
        @click="onCardClick('manaCost', $event)"
        :class="[
          'p-3.5 rounded-xl border transition-all cursor-pointer select-none space-y-2 font-mono relative group',
          isPrimaryPinned('manaCost') ? 'bg-blue-950/60 border-blue-400 ring-2 ring-blue-400 shadow-2xl' : 'bg-black/60 border-white/10 hover:border-blue-500/60'
        ]"
      >
        <div class="flex items-center justify-between text-xs font-bold text-blue-300">
          <span>技能法力消耗</span>
          <Droplet class="w-3.5 h-3.5 text-blue-400" />
        </div>
        <div class="text-xl font-black text-blue-300">{{ dpsData.manaCost > 0 ? dpsData.manaCost : '-' }} <span class="text-xs font-normal text-gray-400">蓝</span></div>
        <div class="text-[10px] text-gray-400">每秒耗蓝: {{ dpsData.manaCostPerSecond > 0 ? dpsData.manaCostPerSecond.toFixed(1) : '-' }} · 每秒回蓝: {{ dpsData.manaRegen > 0 ? dpsData.manaRegen.toFixed(1) : '-' }}</div>
      </div>

      <!-- 敌人实际抗性 -->
      <div 
        @mouseenter="onCardMouseEnter('enemyResist', $event)"
        @mouseleave="onCardMouseLeave"
        @click="onCardClick('enemyResist', $event)"
        :class="[
          'p-3.5 rounded-xl border transition-all cursor-pointer select-none space-y-2 font-mono relative group',
          isPrimaryPinned('enemyResist') ? 'bg-red-950/60 border-red-400 ring-2 ring-red-400 shadow-2xl' : 'bg-black/60 border-white/10 hover:border-red-500/60'
        ]"
      >
        <div class="flex items-center justify-between text-xs font-bold text-red-300">
          <span>敌人实际抗性</span>
          <ShieldAlert class="w-3.5 h-3.5 text-red-400" />
        </div>
        <div class="text-xl font-black text-red-300">{{ dpsData.enemyResist.fire || 0 }}%</div>
        <div class="text-[10px] text-gray-400">穿透与曝光后最终抗性</div>
      </div>
    </div>

    <!-- 6. 🏆 终极无重叠双层浮窗架构 (Flex Row Layout - 绝对零重叠，一级绝对不跳位，上下左右自适应) -->
    <Teleport to="body">
      <div 
        v-if="activeCard"
        ref="popoverContainerRef"
        @mouseenter="onPrimaryPopoverMouseEnter"
        @mouseleave="onPrimaryPopoverMouseLeave"
        @click.stop
        @mousedown.stop
        @pointerdown.stop
        :style="containerStyle"
        :class="[
          'fixed z-[100] flex gap-2.5 select-text font-sans pointer-events-auto transition-shadow items-start',
          isSecondaryOnLeft ? 'flex-row-reverse' : 'flex-row'
        ]"
      >
        <!-- 6.1 一级主浮窗 (宽 336px [总体宽度减少 30% 紧凑版]，在 Flex 容器内稳固立足) -->
        <div 
          ref="primaryPopoverRef"
          :style="{ maxHeight: popoverMaxHeight }"
          :class="[
            'bg-[#0b0d14]/98 border shadow-2xl rounded-2xl p-3.5 flex flex-col backdrop-blur-2xl w-[336px] text-gray-200 transition-colors shrink-0',
            isPrimaryPinnedActive ? 'border-2 border-poe-gold ring-2 ring-poe-gold/30' : 'border-amber-500/60'
          ]"
        >
          <!-- 浮窗头部 (支持拖拽手柄) -->
          <div 
            @mousedown="startPrimaryDrag"
            :class="[
              'flex items-center justify-between border-b border-white/10 pb-2.5 mb-2.5 shrink-0 select-none',
              isPrimaryPinnedActive ? 'cursor-move' : ''
            ]"
            :title="isPrimaryPinnedActive ? '按住鼠标左键可拖动此浮窗' : ''"
          >
            <div class="flex items-center space-x-2 truncate mr-2">
              <Sparkles class="w-4 h-4 text-poe-gold shrink-0" />
              <div class="truncate">
                <h3 class="text-xs font-bold text-poe-gold font-poe-title truncate">{{ activeCard.label }}</h3>
                <p class="text-[10px] text-gray-400 font-mono">{{ activeCard.subLabel }}</p>
              </div>
            </div>

            <div class="flex items-center gap-1.5 shrink-0 pointer-events-auto" @mousedown.stop>
              <button 
                @click.stop="togglePrimaryPin" 
                :class="[
                  'px-2.5 py-1 text-xs rounded-lg font-bold flex items-center gap-1 transition-all shadow-sm',
                  isPrimaryPinnedActive 
                    ? 'bg-amber-500 text-black hover:bg-amber-400 ring-1 ring-amber-300' 
                    : 'bg-white/10 hover:bg-white/20 text-amber-300'
                ]"
                :title="isPrimaryPinnedActive ? '已锁定 (可拖动浮窗)，点击取消固定' : '固定此浮窗，固定后可自由拖动与选词'"
              >
                <Pin class="w-3.5 h-3.5" />
                <span>{{ isPrimaryPinnedActive ? '已固定 📌' : '📌 固定' }}</span>
              </button>

              <button 
                v-if="isPrimaryPinnedActive" 
                @click.stop="closePrimaryPopover" 
                class="p-1 hover:bg-red-950/80 text-gray-400 hover:text-red-300 rounded-lg transition-colors text-sm px-2"
                title="关闭浮窗"
              >
                ✕
              </button>
            </div>
          </div>

          <!-- 核心数值胶囊 -->
          <div class="p-2.5 rounded-xl bg-black/60 border border-white/10 flex items-center justify-between mb-3 shrink-0">
            <span class="text-xs text-gray-400 font-semibold">PoB 官方最终计算结果:</span>
            <span class="text-sm font-black font-mono text-poe-gold">{{ activeCard.formattedValue }}</span>
          </div>

          <!-- 主浮窗内容可滚动区 -->
          <div class="flex-1 overflow-y-auto space-y-3 pr-1">
            <!-- 模块 A：基础点伤专属【5 元素全链路放大流水线表】(100% 对齐 PoB 官方 6 大维度数据) -->
            <div v-if="activeCardKey === 'baseDamage'" class="space-y-3">
              <!-- A1. 全类型综合总览 -->
              <div class="p-2.5 rounded-xl bg-black/80 border border-poe-gold/40 flex items-center justify-between font-mono text-xs shadow-inner">
                <div class="space-y-0.5">
                  <div class="text-[10px] text-gray-400">所有类型综合点伤</div>
                  <div class="text-sm font-black text-poe-gold">
                    {{ (dpsData.totalMin > 0 || dpsData.totalMax > 0) ? (formatNumber(dpsData.totalMin) + ' ~ ' + formatNumber(dpsData.totalMax)) : '-' }}
                  </div>
                </div>
                <div class="flex items-center gap-3 text-right text-[11px]">
                  <div>
                    <div class="text-[9px] text-gray-400">总提高</div>
                    <div class="font-bold text-cyan-300">{{ dpsData.incDamage > 0 ? '+' + dpsData.incDamage + '%' : '-' }}</div>
                  </div>
                  <div>
                    <div class="text-[9px] text-gray-400">总更多</div>
                    <div class="font-bold text-amber-300">{{ dpsData.moreDamage > 0 ? dpsData.moreDamage.toFixed(2) + 'x' : '-' }}</div>
                  </div>
                </div>
              </div>

              <!-- A2. 5 元素全生命周期流水线卡片列表 (物理、闪电、冰霜、火焰、混沌) -->
              <div class="space-y-2">
                <div class="text-[11px] font-bold text-amber-300 flex items-center justify-between border-b border-white/10 pb-1">
                  <span>各元素击中点伤与放大流水线:</span>
                  <span class="text-[10px] font-mono text-gray-400 font-normal">悬停行查看分步推导与来源</span>
                </div>

                <div class="space-y-1.5 font-mono text-xs">
                  <div 
                    v-for="eleItem in hitDamagePipelineList" 
                    :key="eleItem.element"
                    @mouseenter="onRowMouseEnter(eleItem.rowRef)"
                    @mouseleave="onRowMouseLeave"
                    @click="onRowClick(eleItem.rowRef, $event)"
                    :class="[
                      'p-2.5 rounded-xl border transition-all cursor-pointer space-y-1.5',
                      eleItem.hitAvg > 0 ? 'bg-black/60 border-white/15' : 'bg-black/30 border-white/5 opacity-70',
                      (activeRow === eleItem.rowRef || pinnedSecondaryRow === eleItem.rowRef) ? 'ring-1 ring-poe-gold bg-amber-950/40 border-poe-gold' : 'hover:bg-white/5'
                    ]"
                  >
                    <!-- 顶行：元素名与最终击中点伤 -->
                    <div class="flex items-center justify-between font-sans">
                      <div class="flex items-center gap-1.5 font-bold" :class="eleItem.color">
                        <span class="w-2 h-2 rounded-full" :class="eleItem.dotBg"></span>
                        <span>{{ eleItem.nameCn }}</span>
                      </div>
                      <div class="text-right font-mono">
                        <span class="font-black text-sm text-white">
                          {{ (eleItem.hitMin > 0 || eleItem.hitMax > 0) ? (formatNumber(eleItem.hitMin) + ' ~ ' + formatNumber(eleItem.hitMax)) : (eleItem.hitAvg > 0 ? formatNumber(eleItem.hitAvg) : '-') }}
                        </span>
                        <span v-if="eleItem.hitAvg > 0" class="text-[10px] text-gray-400 ml-1.5">(均值 {{ formatNumber(eleItem.hitAvg) }})</span>
                      </div>
                    </div>

                    <!-- 底行：4 步放大乘区明细胶囊 (附加 ➔ 提高 ➔ 更多 ➔ 抗性修正) -->
                    <div class="grid grid-cols-4 gap-1.5 text-[10px] pt-1 border-t border-white/10">
                      <div class="p-1 rounded bg-black/50 border border-white/5 text-center">
                        <div class="text-gray-500 scale-90">附加点伤</div>
                        <div class="font-bold text-gray-300 truncate">
                          {{ (eleItem.hitMin > 0 || eleItem.hitMax > 0) ? (formatNumber(eleItem.hitMin) + ' ~ ' + formatNumber(eleItem.hitMax)) : '-' }}
                        </div>
                      </div>
                      <div class="p-1 rounded bg-black/50 border border-cyan-500/20 text-center">
                        <div class="text-cyan-400 scale-90">总提高</div>
                        <div class="font-bold text-cyan-200">{{ eleItem.inc > 0 ? '+' + eleItem.inc + '%' : '-' }}</div>
                      </div>
                      <div class="p-1 rounded bg-black/50 border border-amber-500/20 text-center">
                        <div class="text-amber-400 scale-90">更多乘区</div>
                        <div class="font-bold text-amber-200">{{ eleItem.more > 0 ? eleItem.more.toFixed(2) + 'x' : '-' }}</div>
                      </div>
                      <div class="p-1 rounded bg-black/50 border border-red-500/20 text-center">
                        <div class="text-red-400 scale-90">抗性修正</div>
                        <div class="font-bold text-red-200">{{ eleItem.effMult > 0 ? 'x' + eleItem.effMult.toFixed(2) : '-' }}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 模块 B：PoB 官方动态属性全量表格 (暴击/速度/异常小节等) -->
            <div v-else-if="activeSubSection && activeSubSection.rows && activeSubSection.rows.length > 0" class="space-y-2">
              <div class="text-[11px] text-amber-300 font-semibold flex items-center justify-between border-b border-white/10 pb-1">
                <div class="flex items-center gap-1">
                  <Flame class="w-3.5 h-3.5 text-poe-gold" />
                  <span>PoB 官方【{{ translateCalcFormulaLine(activeSubSection.label) }}】全量明细:</span>
                </div>
                <span class="font-mono text-[10px] text-gray-500">{{ activeSubSection.rows.length }} 项属性</span>
              </div>

              <div class="border border-white/15 rounded-lg overflow-hidden font-mono text-xs">
                <table class="w-full border-collapse">
                  <tbody class="divide-y divide-white/10 bg-black/60 text-gray-300">
                    <tr 
                      v-for="(r, rIdx) in activeSubSection.rows" 
                      :key="rIdx" 
                      @mouseenter="onRowMouseEnter(r)" 
                      @mouseleave="onRowMouseLeave"
                      @click="onRowClick(r, $event)"
                      :class="[
                        'transition-colors cursor-pointer',
                        (activeRow === r || pinnedSecondaryRow === r) ? 'bg-amber-950/80 text-white font-bold ring-1 ring-poe-gold' : 'hover:bg-white/10'
                      ]"
                    >
                      <td class="px-3 py-1.5 truncate max-w-[230px]">
                        <span :class="(activeRow === r || pinnedSecondaryRow === r) ? 'text-amber-300' : 'text-gray-300'">{{ translateCalcFormulaLine(r.label) }}</span>
                      </td>
                      <td class="px-3 py-1.5 font-bold text-right truncate">
                        <span :class="(activeRow === r || pinnedSecondaryRow === r) ? 'text-poe-gold' : 'text-gray-200'">{{ r.value }}</span>
                        <span class="ml-1 text-[10px] text-gray-500 font-normal">
                          {{ (r.breakdownLines || r.sources) ? (pinnedSecondaryRow === r ? '📌' : '▶') : '' }}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- 模块 C：卡片顶层官方分步推导公式（若无小节表格） -->
            <div v-else-if="activeCard.breakdownLines && activeCard.breakdownLines.length > 0" class="space-y-1.5">
              <div class="text-[11px] text-amber-300 font-semibold flex items-center gap-1">
                <Calculator class="w-3.5 h-3.5 text-poe-gold" />
                <span>PoB 官方底层分步推导过程:</span>
              </div>
              <div class="space-y-1 font-mono text-[11px]">
                <template v-for="(line, lIdx) in activeCard.breakdownLines" :key="lIdx">
                  <p 
                    v-if="line && line.trim() && translateCalcFormulaLine(line)" 
                    class="p-2.5 rounded-xl bg-black/70 border border-white/10 text-gray-100 leading-relaxed break-words shadow-inner"
                  >
                    {{ translateCalcFormulaLine(line) }}
                  </p>
                </template>
              </div>
            </div>

            <!-- 无官方推导或小节时的提示 -->
            <div 
              v-else-if="activeCardKey !== 'baseDamage' && (!activeCard.sources || activeCard.sources.length === 0)" 
              class="p-3 text-center text-xs text-gray-500 italic bg-black/40 rounded-xl border border-white/5 font-mono"
            >
              官方核心未提供详细推导数据
            </div>

            <!-- 模块 D：加成来源大类汇总 -->
            <div v-if="activeCard.sources && activeCard.sources.length > 0" class="space-y-1.5 pt-1 border-t border-white/10">
              <div class="text-[10px] text-gray-400 font-semibold flex items-center justify-between">
                <span>加成来源大类统计:</span>
                <span class="font-mono text-amber-300">{{ activeCard.sources.length }} 处加成</span>
              </div>
              <div class="flex flex-wrap gap-1 text-[11px]">
                <span 
                  v-for="(sumVal, sumKey) in getSourceSummary(activeCard.sources)" 
                  :key="sumKey" 
                  class="px-2 py-0.5 rounded-md bg-black/80 border border-white/15 text-gray-300"
                >
                  <strong class="text-amber-400">{{ sumKey }}:</strong> {{ sumVal }}
                </span>
              </div>
            </div>

            <!-- 模块 E：逐条来源清单 -->
            <div v-if="activeCard.sources && activeCard.sources.length > 0" class="space-y-1.5 pt-1">
              <div class="text-[10px] text-gray-400 font-semibold">
                官方词缀来源清单 (PoB 底层 Tabulate 数据):
              </div>
              <div class="space-y-1 max-h-48 overflow-y-auto pr-1 font-mono">
                <div 
                  v-for="(src, sIdx) in activeCard.sources" 
                  :key="sIdx" 
                  @mouseenter="onSourceMouseEnter(src, $event)"
                  @mousemove="onSourceMouseMove($event)"
                  @mouseleave="onSourceMouseLeave"
                  class="p-2 rounded-lg bg-black/50 border border-white/5 flex items-center justify-between gap-2 hover:bg-white/5 hover:border-poe-gold/40 transition-colors cursor-pointer"
                >
                  <div class="min-w-0 flex-1">
                    <div class="text-gray-200 text-xs font-semibold truncate flex items-center gap-1 font-sans">
                      <span :class="getSourceTypeColor(src.sourceType)" class="text-[10px] font-bold shrink-0">
                        [{{ translateSourceType(src.sourceType) }}]
                      </span>
                      <span class="truncate">{{ translateCalcFormulaLine(src.sourceName) }}</span>
                    </div>
                    <div class="text-[10px] text-gray-500 truncate mt-0.5">
                      {{ translateCalcFormulaLine(src.name) }} ({{ translateCalcFormulaLine(src.modType) }})
                    </div>
                  </div>
                  <span 
                    class="text-xs font-bold shrink-0 px-1.5 py-0.5 rounded bg-black/60 border border-white/10"
                    :class="Number(src.value) >= 0 ? 'text-emerald-400' : 'text-red-400'"
                  >
                    {{ typeof src.value === 'number' ? (src.value > 0 ? `+${src.value}` : src.value) : src.value }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 6.2 🌟 二级专属推导浮窗 (同容器并排对齐，CSS 层面 100% 杜绝任何重叠遮挡！) -->
        <div 
          v-if="effectiveSecondaryRow && (effectiveSecondaryRow.breakdownLines || effectiveSecondaryRow.sources)"
          @mouseenter="onSecondaryPopoverMouseEnter"
          @mouseleave="onSecondaryPopoverMouseLeave"
          :style="{ maxHeight: popoverMaxHeight }"
          :class="[
            'bg-[#0c0e16]/98 border shadow-2xl rounded-2xl p-3.5 w-[308px] overflow-y-auto flex flex-col space-y-2.5 pointer-events-auto text-left backdrop-blur-2xl shrink-0 animate-in fade-in duration-150',
            isSecondaryPinnedActive ? 'border-2 border-poe-gold ring-2 ring-poe-gold/30' : 'border-poe-gold/60'
          ]"
        >
          <!-- 二级头部 -->
          <div class="flex items-center justify-between border-b border-white/10 pb-2 select-none">
            <div>
              <div class="text-xs font-bold text-amber-300 font-poe-title flex items-center gap-1.5">
                <Calculator class="w-4 h-4 text-poe-gold shrink-0" />
                <span>【{{ translateCalcFormulaLine(effectiveSecondaryRow.label) }}】组成明细</span>
              </div>
              <div class="text-base font-black font-mono text-poe-gold mt-0.5">
                {{ effectiveSecondaryRow.value }}
              </div>
            </div>

            <div class="flex items-center gap-1.5 shrink-0 pointer-events-auto">
              <button 
                @click.stop="toggleSecondaryPin" 
                :class="[
                  'px-2 py-0.5 text-xs rounded-lg font-bold flex items-center gap-1 transition-all shadow-sm',
                  isSecondaryPinnedActive 
                    ? 'bg-amber-500 text-black hover:bg-amber-400 ring-1 ring-amber-300' 
                    : 'bg-white/10 hover:bg-white/20 text-amber-300'
                ]"
                :title="isSecondaryPinnedActive ? '已锁定二级浮窗，点击取消固定' : '固定二级浮窗'"
              >
                <Pin class="w-3 h-3" />
                <span>{{ isSecondaryPinnedActive ? '已固定' : '📌 固定' }}</span>
              </button>

              <button 
                v-if="isSecondaryPinnedActive" 
                @click.stop="closeSecondaryPopover" 
                class="p-0.5 hover:bg-red-950/80 text-gray-400 hover:text-red-300 rounded-lg transition-colors text-xs px-1.5"
                title="关闭二级浮窗"
              >
                ✕
              </button>
            </div>
          </div>

          <!-- 专属分步公式 -->
          <div v-if="effectiveSecondaryRow.breakdownLines && effectiveSecondaryRow.breakdownLines.length > 0" class="space-y-1.5">
            <div class="text-[10px] text-gray-400 font-semibold font-mono">官方分步推导过程:</div>
            <div class="space-y-1 font-mono text-[11px]">
              <template v-for="(line, lIdx) in effectiveSecondaryRow.breakdownLines" :key="lIdx">
                <p 
                  v-if="line && line.trim() && translateCalcFormulaLine(line)" 
                  class="p-2 rounded-lg bg-black/70 border border-white/10 text-gray-100 leading-relaxed break-words"
                >
                  {{ translateCalcFormulaLine(line) }}
                </p>
              </template>
            </div>
          </div>

          <!-- 专属来源明细 -->
          <div v-if="effectiveSecondaryRow.sources && effectiveSecondaryRow.sources.length > 0" class="space-y-1.5 pt-1 border-t border-white/10">
            <div class="text-[10px] text-gray-400 font-semibold font-mono flex items-center justify-between">
              <span>官方装备与天赋词缀来源:</span>
              <span class="text-amber-300 font-mono">{{ effectiveSecondaryRow.sources.length }} 条</span>
            </div>
            <div class="space-y-1 max-h-56 overflow-y-auto pr-1 font-mono">
              <div 
                v-for="(src, sIdx) in effectiveSecondaryRow.sources" 
                :key="sIdx" 
                @mouseenter="onSourceMouseEnter(src, $event)"
                @mousemove="onSourceMouseMove($event)"
                @mouseleave="onSourceMouseLeave"
                class="p-2 rounded-lg bg-black/50 border border-white/5 flex items-center justify-between gap-2 hover:bg-white/5 hover:border-poe-gold/40 transition-colors cursor-pointer"
              >
                <div class="min-w-0 flex-1">
                  <div class="text-gray-200 text-xs font-semibold truncate flex items-center gap-1 font-sans">
                    <span :class="getSourceTypeColor(src.sourceType)" class="text-[10px] font-bold shrink-0">
                      [{{ translateSourceType(src.sourceType) }}]
                    </span>
                    <span class="truncate">{{ translateCalcFormulaLine(src.sourceName) }}</span>
                  </div>
                  <div class="text-[10px] text-gray-500 truncate mt-0.5">
                    {{ translateCalcFormulaLine(src.name) }} ({{ translateCalcFormulaLine(src.modType) }})
                  </div>
                </div>
                <span 
                  class="text-xs font-bold shrink-0 px-1.5 py-0.5 rounded bg-black/60 border border-white/10"
                  :class="Number(src.value) >= 0 ? 'text-emerald-400' : 'text-red-400'"
                >
                  {{ typeof src.value === 'number' ? (src.value > 0 ? `+${src.value}` : src.value) : src.value }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 🌟 3 级官方来源专属 Tooltip (挂载在根节点，pointer-events-none 彻底杜绝遮挡闪烁) -->
      <!-- 6.3.1 官方装备 / 珠宝卡片 -->
      <PoEItemTooltip 
        v-if="hoveredSourceItem"
        :item="hoveredSourceItem"
        :is-visible="isSourceTooltipVisible && !hoveredSourceNode && !hoveredSourceSkill"
        :mouse-x="sourceMousePos.x"
        :mouse-y="sourceMousePos.y"
      />

      <!-- 6.3.2 官方天赋树节点卡片 -->
      <div 
        v-if="isSourceTooltipVisible && hoveredSourceNode"
        class="fixed z-[9999] pointer-events-none transition-transform duration-75 shadow-[0_10px_40px_rgba(0,0,0,0.95)] rounded-lg overflow-hidden border border-emerald-500/50 font-sans"
        :style="nodeTooltipStyle"
      >
        <div class="bg-[#0c0c11]/98 backdrop-blur-xl p-3.5 space-y-2.5 text-xs text-gray-200">
          <!-- 节点标题栏 -->
          <div class="text-center py-2 -mx-3.5 -mt-3.5 px-3.5 border-b border-emerald-500/30 bg-gradient-to-b from-emerald-950/40 to-black/60">
            <div class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider mb-1 border" :class="getNodeTypeColor(hoveredSourceNode.nodeType)">
              {{ getNodeTypeLabel(hoveredSourceNode.nodeType) }}
            </div>
            <h3 class="font-bold text-sm font-poe-title tracking-wide text-amber-300">
              {{ translateCalcFormulaLine(hoveredSourceNode.name || '') }}
            </h3>
          </div>

          <!-- 节点词缀列表 -->
          <div v-if="hoveredSourceNode.sd && hoveredSourceNode.sd.length > 0" class="space-y-1.5 py-1 text-xs text-[#8888ff] font-medium leading-relaxed">
            <div v-for="(stat, sIdx) in hoveredSourceNode.sd" :key="sIdx" class="flex items-start gap-1.5">
              <span class="text-emerald-400 shrink-0">◆</span>
              <span>{{ translateWebItemLine(stat) }}</span>
            </div>
          </div>
          <div v-else class="text-gray-400 italic py-1 text-center">
            {{ hoveredSourceNode.nodeType === 'Socket' ? '可在此处镶嵌珠宝以获得属性' : '基础被动属性' }}
          </div>

          <!-- 分配状态 -->
          <div class="pt-1.5 border-t border-white/10 text-[10px] flex items-center justify-between text-gray-400">
            <span>天赋节点 #{{ hoveredSourceNode.id }}</span>
            <span :class="hoveredSourceNode.isAllocated ? 'text-emerald-400 font-bold' : 'text-gray-500'">
              {{ hoveredSourceNode.isAllocated ? '● 已分配' : '○ 未分配' }}
            </span>
          </div>
        </div>
      </div>

      <!-- 6.3.3 官方技能石卡片 -->
      <div 
        v-if="isSourceTooltipVisible && hoveredSourceSkill"
        class="fixed z-[9999] pointer-events-none transition-transform duration-75 shadow-[0_10px_40px_rgba(0,0,0,0.95)] rounded-lg overflow-hidden border border-cyan-500/50 font-sans"
        :style="skillTooltipStyle"
      >
        <div class="bg-[#0c0c11]/98 backdrop-blur-xl p-3.5 space-y-2 text-xs text-gray-200">
          <div class="text-center py-2 -mx-3.5 -mt-3.5 px-3.5 border-b border-cyan-500/30 bg-gradient-to-b from-cyan-950/40 to-black/60">
            <div class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider mb-1 text-cyan-400 border border-cyan-500/40 bg-cyan-500/10">
              {{ hoveredSourceSkill.isSupport ? '辅助技能石' : '主动技能石' }}
            </div>
            <h3 class="font-bold text-sm font-poe-title tracking-wide text-cyan-300">
              {{ translateCalcFormulaLine(hoveredSourceSkill.name || '') }}
            </h3>
          </div>
          <div class="text-[11px] text-gray-400">
            技能石 ID: <span class="font-mono text-gray-300">{{ hoveredSourceSkill.id }}</span>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { Calculator, Flame, Wand2, Activity, Zap, Sparkles, TrendingUp, Droplet, ShieldAlert, Pin } from 'lucide-vue-next';
import { useBuildStore } from '../stores/buildStore';
import { translateWebText, translateCalcFormulaLine, translateWebItemLine, translateSourceType } from '../utils/webTranslation';
import PoEItemTooltip from './PoEItemTooltip.vue';

const store = useBuildStore();
defineProps<{ embedded?: boolean }>();

const selectedCalcMode = computed(() => {
  return store.buffMode || 'EFFECTIVE';
});

const calcModes: { id: 'EFFECTIVE' | 'COMBAT' | 'BUFFED' | 'UNBUFFED'; label: string }[] = [
  { id: 'EFFECTIVE', label: '有效秒伤' },
  { id: 'COMBAT', label: '战斗秒伤' },
  { id: 'BUFFED', label: '有增益' },
  { id: 'UNBUFFED', label: '无增益' },
];

async function handleModeSelect(modeId: 'EFFECTIVE' | 'COMBAT' | 'BUFFED' | 'UNBUFFED') {
  if (store.buffMode === modeId || store.isCalculating) return;
  store.buffMode = modeId;
  await store.setBuffMode(modeId);
}

export type SourceRef = {
  kind: 'item' | 'treeNode' | 'skill' | 'pantheon' | 'mastery' | 'keystone' | 'ascendancy' | 'config' | 'generic';
  id?: number | string;
  name?: string;
  baseName?: string;
  rarity?: string;
  itemType?: string;
  rawLines?: string[];
  nodeType?: string;
  sd?: string[];
  isAllocated?: boolean;
  isSupport?: boolean;
};

interface ModSource {
  value: number | string;
  modType: string;
  name: string;
  source: string;
  sourceName: string;
  sourceType: string;
  sourceRef?: SourceRef;
}

// 🌟 3 级官方来源专属悬浮 Tooltip 状态引擎
const activeHoveredSource = ref<ModSource | null>(null);
const sourceMousePos = ref({ x: 0, y: 0 });

const isSourceTooltipVisible = computed(() => {
  if (isDraggingPrimary.value) return false;
  return !!activeHoveredSource.value;
});

const nodeTooltipStyle = computed(() => {
  const winW = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const winH = typeof window !== 'undefined' ? window.innerHeight : 1080;
  const left = Math.min(sourceMousePos.value.x + 18, winW - 350);
  const top = Math.max(10, Math.min(sourceMousePos.value.y - 20, winH - 280));
  return {
    left: `${left}px`,
    top: `${top}px`,
    maxWidth: '350px',
    minWidth: '260px',
  };
});

const skillTooltipStyle = computed(() => {
  const winW = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const winH = typeof window !== 'undefined' ? window.innerHeight : 1080;
  const left = Math.min(sourceMousePos.value.x + 18, winW - 340);
  const top = Math.max(10, Math.min(sourceMousePos.value.y - 20, winH - 220));
  return {
    left: `${left}px`,
    top: `${top}px`,
    maxWidth: '320px',
    minWidth: '240px',
  };
});

const hoveredSourceItem = computed(() => {
  if (!activeHoveredSource.value?.sourceRef) return null;
  const ref = activeHoveredSource.value.sourceRef;
  if (ref.kind !== 'item' && activeHoveredSource.value.sourceType !== 'Jewel' && activeHoveredSource.value.sourceType !== 'Item') return null;

  // 1. 优先在 itemLibrary 中匹配
  if (ref.id !== undefined && store.itemLibrary?.length) {
    const idStr = String(ref.id);
    const found = store.itemLibrary.find((i: any) => String(i.id) === idStr);
    if (found) return found;
  }

  // 2. 使用 sourceRef 纯透传数据保底
  if (ref.name || (ref.rawLines && ref.rawLines.length > 0)) {
    return {
      id: ref.id,
      name: ref.name || activeHoveredSource.value.sourceName,
      name_cn: ref.name || activeHoveredSource.value.sourceName,
      base: ref.baseName || '',
      base_cn: ref.baseName || '',
      rarity: ref.rarity || (activeHoveredSource.value.sourceType === 'Jewel' ? 'RARE' : 'NORMAL'),
      rawLines: ref.rawLines || [],
      lines: ref.rawLines || [],
    };
  }
  return null;
});

const hoveredSourceNode = computed(() => {
  if (!activeHoveredSource.value?.sourceRef) return null;
  const ref = activeHoveredSource.value.sourceRef;
  if (ref.kind !== 'treeNode') return null;
  return ref;
});

const hoveredSourceSkill = computed(() => {
  if (!activeHoveredSource.value?.sourceRef) return null;
  const ref = activeHoveredSource.value.sourceRef;
  if (ref.kind !== 'skill') return null;
  return ref;
});

function onSourceMouseEnter(src: ModSource, event: MouseEvent) {
  if (isDraggingPrimary.value) return;
  activeHoveredSource.value = src;
  sourceMousePos.value = { x: event.clientX, y: event.clientY };
}

let sourceMouseMoveRaf: number | null = null;
function onSourceMouseMove(event: MouseEvent) {
  if (!activeHoveredSource.value || isDraggingPrimary.value) {
    if (isDraggingPrimary.value) activeHoveredSource.value = null;
    return;
  }
  const cx = event.clientX;
  const cy = event.clientY;
  if (sourceMouseMoveRaf) cancelAnimationFrame(sourceMouseMoveRaf);
  sourceMouseMoveRaf = requestAnimationFrame(() => {
    sourceMousePos.value = { x: cx, y: cy };
  });
}

function onSourceMouseLeave() {
  activeHoveredSource.value = null;
}

function getNodeTypeLabel(type?: string): string {
  const source = typeof type === 'string' ? type.trim() : '';
  if (!source) return '';
  // Node type labels must come from the single generated dictionary.  Keep an
  // unknown upstream value visible instead of inventing a local translation.
  return translateWebText(source) || source;
}

function getNodeTypeColor(type?: string): string {
  switch (type) {
    case 'Notable': return 'text-amber-400 border-amber-500/40 bg-amber-500/10';
    case 'Keystone': return 'text-purple-400 border-purple-500/40 bg-purple-500/10';
    case 'Socket': return 'text-sky-400 border-sky-500/40 bg-sky-500/10';
    default: return 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10';
  }
}

interface DynamicRow {
  label: string;
  value: string;
  breakdownLines?: string[];
  breakdownTables?: any[];
  sources?: ModSource[];
}

interface DynamicSubSection {
  key: string;
  label: string;
  group: string;
  rows: DynamicRow[];
}

interface StatCardItem {
  key: string;
  subSectionKey?: string;
  label: string;
  subLabel?: string;
  formattedValue: string;
  sources?: ModSource[];
  breakdownLines?: string[];
}

// 状态管理
const pinnedCardKey = ref<string | null>(null);
const hoveredCardKey = ref<string | null>(null);

// 二级浮窗状态（默认不打开任何行）
const activeRow = ref<DynamicRow | null>(null);
const pinnedSecondaryRow = ref<DynamicRow | null>(null);

// 鼠标位置与拖拽位置
const mousePos = ref({ x: 0, y: 0 });
const isHoveringPopover = ref(false);
const isHoveringSecondary = ref(false);

// 拖拽坐标偏移动态记录
const customPopoverPos = ref<{ x: number; y: number } | null>(null);
const isDraggingPrimary = ref(false);
const dragStart = ref({ mouseX: 0, mouseY: 0, popoverX: 0, popoverY: 0 });

let cardLeaveTimer: ReturnType<typeof setTimeout> | null = null;
let rowLeaveTimer: ReturnType<typeof setTimeout> | null = null;

const activeCardKey = computed(() => pinnedCardKey.value || hoveredCardKey.value);
const isPrimaryPinnedActive = computed(() => !!pinnedCardKey.value);
const isSecondaryPinnedActive = computed(() => !!pinnedSecondaryRow.value);

const activeCard = computed<StatCardItem | null>(() => {
  if (!activeCardKey.value) return null;
  return allCardsMap.value.get(activeCardKey.value) || null;
});

const activeSubSection = computed<DynamicSubSection | null>(() => {
  const targetKey = activeCard.value?.subSectionKey;
  if (!targetKey) return null;
  const dyn = store.skillBreakdown?.dynamicSubSections || (store.skillBreakdown?.dpsPipeline as any)?.dynamicSubSections;
  if (!dyn) return null;
  return dyn[targetKey] || null;
});

const effectiveSecondaryRow = computed<DynamicRow | null>(() => {
  return pinnedSecondaryRow.value || activeRow.value || null;
});

function isPrimaryPinned(key: string): boolean {
  return pinnedCardKey.value === key;
}

// 智能判断方向：二级浮窗是在左侧展开还是右侧展开（336px + 308px 紧凑版）
const isSecondaryOnLeft = computed(() => {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const primaryWidth = 336;
  const secondaryWidth = 308;
  const pLeft = customPopoverPos.value ? customPopoverPos.value.x : mousePos.value.x + 14;
  return (pLeft + primaryWidth + 12 + secondaryWidth > vw - 16);
});

const popoverContainerRef = ref<HTMLElement | null>(null);
const primaryPopoverRef = ref<HTMLElement | null>(null);
const popoverHeight = ref(320);

// 当卡片切换或子行切换时，实时测量主浮窗实际高度
watch([activeCardKey, effectiveSecondaryRow], () => {
  nextTick(() => {
    if (primaryPopoverRef.value) {
      popoverHeight.value = primaryPopoverRef.value.offsetHeight || 320;
    }
  });
});

// 动态计算统一 Flex 容器样式（🛡️ 动态真实高度贴身跟随，杜绝远距离悬空与越界）
const containerStyle = computed(() => {
  if (customPopoverPos.value) {
    return {
      left: `${customPopoverPos.value.x}px`,
      top: `${customPopoverPos.value.y}px`,
    };
  }

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;

  const style: Record<string, string> = {};

  // 水平定位
  if (isSecondaryOnLeft.value) {
    const anchorRight = Math.max(16, vw - (mousePos.value.x - 14));
    style.right = `${anchorRight}px`;
    style.left = 'auto';
  } else {
    const anchorLeft = Math.max(16, mousePos.value.x + 14);
    style.left = `${anchorLeft}px`;
    style.right = 'auto';
  }

  // 垂直紧贴鼠标自适应定位（优先紧贴鼠标上下方 12px 处）
  const actualH = popoverHeight.value || 300;
  let targetTop: number;

  if (mousePos.value.y > vh * 0.52) {
    targetTop = mousePos.value.y - actualH - 12;
  } else {
    targetTop = mousePos.value.y + 16;
  }

  // 视口安全限制：确保顶部不穿破 16px，底部不穿破 vh - 24px
  const minTop = 16;
  const maxTop = Math.max(minTop, vh - actualH - 24);
  const safeTop = Math.max(minTop, Math.min(maxTop, targetTop));

  style.top = `${Math.round(safeTop)}px`;
  style.bottom = 'auto';

  return style;
});

// 动态计算浮窗可用最大高度（保证从 top 开始延伸到底部永远留出 24px 安全边距，绝对不穿破屏幕）
const popoverMaxHeight = computed(() => {
  const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;
  const currentTop = parseFloat(containerStyle.value.top || '16') || 16;
  const availableHeight = vh - currentTop - 24;
  return `${Math.max(260, availableHeight)}px`;
});

// 全局一键关闭所有浮窗
function closeAllPopovers() {
  pinnedCardKey.value = null;
  hoveredCardKey.value = null;
  activeRow.value = null;
  pinnedSecondaryRow.value = null;
  customPopoverPos.value = null;
  isHoveringPopover.value = false;
  isHoveringSecondary.value = false;
  activeHoveredSource.value = null;
}

// 🎯 点击卡片：自动弹出并固定浮窗；若已固定当前卡片则关闭
function onCardClick(key: string, e: MouseEvent) {
  e.stopPropagation();
  if (pinnedCardKey.value === key) {
    closeAllPopovers();
    return;
  }
  hoveredCardKey.value = key;
  pinnedCardKey.value = key;
  mousePos.value = { x: e.clientX, y: e.clientY };
  customPopoverPos.value = null;
  activeRow.value = null;
  pinnedSecondaryRow.value = null;
}

// 卡片鼠标悬停与移动事件
function onCardMouseEnter(key: string, e: MouseEvent) {
  if (cardLeaveTimer) {
    clearTimeout(cardLeaveTimer);
    cardLeaveTimer = null;
  }
  if (!pinnedCardKey.value) {
    hoveredCardKey.value = key;
    mousePos.value = { x: e.clientX, y: e.clientY };
    customPopoverPos.value = null;
  }
}

function onCardMouseLeave() {
  if (!pinnedCardKey.value) {
    cardLeaveTimer = setTimeout(() => {
      if (!isHoveringPopover.value && !isHoveringSecondary.value) {
        hoveredCardKey.value = null;
        activeRow.value = null;
        pinnedSecondaryRow.value = null;
        customPopoverPos.value = null;
      }
    }, 250);
  }
}

// 主浮窗悬停
function onPrimaryPopoverMouseEnter() {
  isHoveringPopover.value = true;
  if (cardLeaveTimer) {
    clearTimeout(cardLeaveTimer);
    cardLeaveTimer = null;
  }
}

function onPrimaryPopoverMouseLeave() {
  isHoveringPopover.value = false;
  if (!pinnedCardKey.value) {
    cardLeaveTimer = setTimeout(() => {
      if (!isHoveringPopover.value && !isHoveringSecondary.value) {
        hoveredCardKey.value = null;
        activeRow.value = null;
        pinnedSecondaryRow.value = null;
        customPopoverPos.value = null;
      }
    }, 250);
  }
}

// 一级浮窗固定控制
function togglePrimaryPin() {
  if (pinnedCardKey.value) {
    pinnedCardKey.value = null;
    if (!isHoveringPopover.value && !isHoveringSecondary.value) {
      hoveredCardKey.value = null;
      activeRow.value = null;
      pinnedSecondaryRow.value = null;
    }
  } else if (hoveredCardKey.value) {
    pinnedCardKey.value = hoveredCardKey.value;
    const el = document.querySelector('.z-\\[100\\]') as HTMLElement;
    if (el) {
      const rect = el.getBoundingClientRect();
      customPopoverPos.value = { x: rect.left, y: rect.top };
    }
  }
}

function closePrimaryPopover() {
  closeAllPopovers();
}

// 二级浮窗条目悬停控制
function onRowMouseEnter(row?: DynamicRow | null) {
  if (!row) return;
  if (rowLeaveTimer) {
    clearTimeout(rowLeaveTimer);
    rowLeaveTimer = null;
  }
  if (!pinnedSecondaryRow.value) {
    activeRow.value = row;
  }
}

function onRowMouseLeave() {
  if (!pinnedSecondaryRow.value) {
    rowLeaveTimer = setTimeout(() => {
      if (!isHoveringSecondary.value) {
        activeRow.value = null;
      }
    }, 200);
  }
}

// 🖱️ 点击 1 级浮窗中的对应内容：2 级浮窗直接弹出并自动固定
function onRowClick(row: DynamicRow | null | undefined, e: MouseEvent) {
  e.stopPropagation();
  if (!row) return;
  if (!row.breakdownLines && !row.sources) return;

  // 🛡️ 若点击行固定 2 级浮窗，同时锁定 1 级浮窗，防止光标移开后意外关闭
  if (hoveredCardKey.value && !pinnedCardKey.value) {
    pinnedCardKey.value = hoveredCardKey.value;
  }

  if (pinnedSecondaryRow.value === row) {
    pinnedSecondaryRow.value = null;
  } else {
    activeRow.value = row;
    pinnedSecondaryRow.value = row;
  }
}

function onSecondaryPopoverMouseEnter() {
  isHoveringSecondary.value = true;
  if (rowLeaveTimer) {
    clearTimeout(rowLeaveTimer);
    rowLeaveTimer = null;
  }
  if (cardLeaveTimer) {
    clearTimeout(cardLeaveTimer);
    cardLeaveTimer = null;
  }
}

function onSecondaryPopoverMouseLeave() {
  isHoveringSecondary.value = false;
  if (!pinnedSecondaryRow.value) {
    rowLeaveTimer = setTimeout(() => {
      if (!isHoveringSecondary.value) {
        activeRow.value = null;
      }
    }, 200);
  }
}

function toggleSecondaryPin() {
  if (pinnedSecondaryRow.value) {
    pinnedSecondaryRow.value = null;
  } else if (activeRow.value) {
    pinnedSecondaryRow.value = activeRow.value;
  }
}

function closeSecondaryPopover() {
  pinnedSecondaryRow.value = null;
  activeRow.value = null;
}

// 拖拽移位引擎
function startPrimaryDrag(e: MouseEvent) {
  if (!isPrimaryPinnedActive.value) return;
  isDraggingPrimary.value = true;

  let currentX = customPopoverPos.value?.x;
  let currentY = customPopoverPos.value?.y;

  const el = popoverContainerRef.value;
  if (el) {
    const rect = el.getBoundingClientRect();
    currentX = rect.left;
    currentY = rect.top;
  }

  if (currentX === undefined || currentY === undefined) {
    currentX = mousePos.value.x;
    currentY = mousePos.value.y;
  }

  dragStart.value = {
    mouseX: e.clientX,
    mouseY: e.clientY,
    popoverX: currentX,
    popoverY: currentY,
  };

  const onMouseMove = (moveEvent: MouseEvent) => {
    if (!isDraggingPrimary.value) return;
    const deltaX = moveEvent.clientX - dragStart.value.mouseX;
    const deltaY = moveEvent.clientY - dragStart.value.mouseY;
    const newX = Math.max(8, Math.min(window.innerWidth - 336, dragStart.value.popoverX + deltaX));
    const newY = Math.max(8, Math.min(window.innerHeight - 300, dragStart.value.popoverY + deltaY));
    customPopoverPos.value = { x: newX, y: newY };
  };

  const onMouseUp = () => {
    isDraggingPrimary.value = false;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && (pinnedCardKey.value || hoveredCardKey.value)) {
    closeAllPopovers();
  }
}

// 🖱️ 点击非浮窗区域：所有方式固定的浮窗自动解除固定并消失
function handleGlobalPointerDown(e: MouseEvent) {
  if (!pinnedCardKey.value && !hoveredCardKey.value && !pinnedSecondaryRow.value) return;
  if (popoverContainerRef.value && popoverContainerRef.value.contains(e.target as Node)) {
    return;
  }
  closeAllPopovers();
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('pointerdown', handleGlobalPointerDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('pointerdown', handleGlobalPointerDown);
});

// 主技能元数据
const skillMeta = computed(() => {
  const pipe = store.skillBreakdown?.dpsPipeline;
  const groups = store.socketGroups || [];
  const idx = store.selectedCalculationSkillIndex || 0;
  const currentGroup = groups[idx] || groups[0] || null;
  return {
    name: translateWebText(pipe?.skillName || currentGroup?.label_cn || currentGroup?.label || '当前技能'),
    rawName: pipe?.skillName || '当前主技能',
    level: pipe?.skillLevel || 0,
    quality: pipe?.skillQuality || 0,
    gemCount: pipe?.gemCount || currentGroup?.gems?.length || currentGroup?.gemList?.length || 0,
  };
});

// 顶层 DPS 核心数据 (100% 真实直取官方返回，绝对零假数据/常数兜底)
const dpsData = computed(() => {
  const pipe = store.skillBreakdown?.dpsPipeline;
  const stats = store.stats as Record<string, any> | undefined;
  return {
    totalDPS: pipe?.totalDPS ?? stats?.TotalDPS ?? 0,
    hitDPS: pipe?.hitDPS ?? stats?.HitDPS ?? stats?.TotalDPS ?? 0,
    dotDPS: pipe?.dotDPS ?? stats?.TotalDot ?? 0,
    avgHit: pipe?.avgHit ?? stats?.AverageHit ?? stats?.AverageDamage ?? 0,
    speed: pipe?.speed ?? stats?.Speed ?? stats?.CastRate ?? 0,
    castTime: pipe?.castTime ?? stats?.Time ?? 0,
    hitChance: pipe?.hitChance ?? stats?.HitChance ?? 0,
    critChance: pipe?.critChance ?? stats?.CritChance ?? stats?.PreEffectiveCritChance ?? 0,
    critMultiplier: pipe?.critMultiplier ?? stats?.CritMultiplier ?? 0,
    critEffect: pipe?.critEffect ?? stats?.CritEffect ?? 0,
    critMultiBase: pipe?.critMultiBase ?? 0,
    critMultiInc: pipe?.critMultiInc ?? 0,
    critMultiMore: pipe?.critMultiMore ?? 0,
    incDamage: pipe?.incDamage ?? 0,
    moreDamage: pipe?.moreDamage ?? 0,
    multiplierSources: pipe?.multiplierSources || [],
    critChanceSources: pipe?.critChanceSources || [],
    critMultiSources: pipe?.critMultiSources || [],
    igniteDPS: pipe?.igniteDPS ?? stats?.IgniteDPS ?? 0,
    bleedDPS: pipe?.bleedDPS ?? stats?.BleedDPS ?? 0,
    poisonDPS: pipe?.poisonDPS ?? stats?.PoisonDPS ?? 0,
    igniteChance: pipe?.igniteChance ?? 0,
    igniteDuration: pipe?.igniteDuration ?? stats?.IgniteDuration ?? 0,
    shockEffect: pipe?.shockEffect ?? stats?.ShockVal ?? stats?.ShockEffect ?? 0,
    shockChance: pipe?.shockChance ?? 0,
    totalMin: pipe?.totalMin ?? stats?.TotalMin ?? 0,
    totalMax: pipe?.totalMax ?? stats?.TotalMax ?? 0,
    damageTypes: pipe?.damageTypes || {
      lightning: { min: 0, max: 0, hit: 0, dps: 0 },
      fire: { min: 0, max: 0, hit: 0, dps: 0 },
      cold: { min: 0, max: 0, hit: 0, dps: 0 },
      physical: { min: 0, max: 0, hit: 0, dps: 0 },
      chaos: { min: 0, max: 0, hit: 0, dps: 0 }
    },
    manaCost: pipe?.manaCost ?? stats?.ManaCost ?? 0,
    manaCostPerSecond: pipe?.manaCostPerSecond ?? stats?.ManaCostPerSecond ?? 0,
    manaRegen: pipe?.manaRegen ?? stats?.ManaRegen ?? stats?.ManaRegenRecovery ?? 0,
    enemyResist: pipe?.enemyResist || {
      fire: stats?.EnemyFireResist ?? stats?.FireResist ?? 0,
      cold: stats?.EnemyColdResist ?? stats?.ColdResist ?? 0,
      lightning: stats?.EnemyLightningResist ?? stats?.LightningResist ?? 0,
      chaos: stats?.EnemyChaosResist ?? stats?.ChaosResist ?? 0,
    },
    officialBreakdowns: pipe?.officialBreakdowns || {},
  };
});

// 🌟 构建 5 元素全生命周期流水线列表（100% 动态直连 Lua 官方计算引擎，绝对零自编算术与零伪公式）
const hitDamagePipelineList = computed(() => {
  const dt = dpsData.value.damageTypes;
  const elements = [
    { key: 'lightning', nameCn: '闪电', color: 'text-yellow-300', dotBg: 'bg-yellow-400' },
    { key: 'cold', nameCn: '冰霜', color: 'text-blue-300', dotBg: 'bg-blue-400' },
    { key: 'fire', nameCn: '火焰', color: 'text-red-400', dotBg: 'bg-red-500' },
    { key: 'chaos', nameCn: '混沌', color: 'text-purple-400', dotBg: 'bg-purple-500' },
    { key: 'physical', nameCn: '物理', color: 'text-stone-300', dotBg: 'bg-stone-400' },
  ] as const;

  return elements.map(el => {
    const d = (dt as any)[el.key] || { min: 0, max: 0, hit: 0, dps: 0, inc: 0, more: 0, effMult: 0, sources: undefined };
    const hitMin = d.min || 0;
    const hitMax = d.max || 0;
    const hitAvg = d.hit || 0;
    const incVal = d.inc ?? 0;
    const moreVal = d.more ?? 0;
    const effMultVal = d.effMult ?? 0;

    // 专属官方二级推导 Row（直接透传真实官方推导 breakdownLines 和真实词缀来源 sources）
    const breakdown = dpsData.value.officialBreakdowns?.[el.key] || 
                      dpsData.value.officialBreakdowns?.[el.nameCn] || 
                      dpsData.value.officialBreakdowns?.[el.key.charAt(0).toUpperCase() + el.key.slice(1)];

    const rowRef: DynamicRow = {
      label: `${el.nameCn}击中伤害`,
      value: (hitMin > 0 || hitMax > 0) ? `${formatNumber(hitMin)} ~ ${formatNumber(hitMax)}` : (hitAvg > 0 ? `${formatNumber(hitAvg)}` : '-'),
      breakdownLines: (breakdown && breakdown.length > 0) ? breakdown : undefined,
      sources: (hitAvg > 0 || hitMax > 0) ? (d.sources && d.sources.length > 0 ? d.sources : undefined) : undefined
    };

    return {
      element: el.key,
      nameCn: el.nameCn,
      color: el.color,
      dotBg: el.dotBg,
      addedMin: 0,
      addedMax: 0,
      inc: incVal,
      more: moreVal,
      effMult: effMultVal,
      hitMin: hitMin,
      hitMax: hitMax,
      hitAvg: hitAvg,
      rowRef: rowRef,
    };
  });
});

// 构造所有结构化金字塔卡片 (100% 官方数据透传)
const allCardsMap = computed(() => {
  const map = new Map<string, StatCardItem>();
  const d = dpsData.value;
  const enemyRes = d.enemyResist.fire || 0;

  // 1. 综合总秒伤
  map.set('totalDPS', {
    key: 'totalDPS',
    label: '综合总输出秒伤',
    subLabel: '全维度秒伤推导流水线',
    formattedValue: d.totalDPS > 0 ? formatNumber(d.totalDPS) : '-',
    breakdownLines: d.officialBreakdowns?.TotalDPS || undefined,
  });

  // 2. 击中秒伤
  map.set('hitDPS', {
    key: 'hitDPS',
    label: '击中秒伤',
    subLabel: '单次击中均伤与频次推导明细',
    formattedValue: d.hitDPS > 0 ? formatNumber(d.hitDPS) : '-',
    breakdownLines: d.officialBreakdowns?.HitDPS || undefined,
  });

  // 3. 持续伤害秒伤
  map.set('dotDPS', {
    key: 'dotDPS',
    label: '持续伤害秒伤',
    subLabel: '异常与持续伤害推导明细',
    formattedValue: d.dotDPS > 0 ? formatNumber(d.dotDPS) : '-',
    breakdownLines: d.officialBreakdowns?.TotalDot || d.officialBreakdowns?.DotDPS || undefined,
  });

  // 4. 单次击中均伤 (核心中层枢纽)
  map.set('avgHit', {
    key: 'avgHit',
    label: '单次击中伤害期望',
    subLabel: '非暴击与暴击加权期望明细',
    formattedValue: d.avgHit > 0 ? formatNumber(d.avgHit) : '-',
    breakdownLines: d.officialBreakdowns?.AverageHit || d.officialBreakdowns?.AverageDamage || undefined,
  });

  // 5. 支柱 ①：各元素击中伤害构成
  map.set('baseDamage', {
    key: 'baseDamage',
    label: '① 各元素击中伤害构成',
    subLabel: '各元素点伤与放大流水线',
    formattedValue: d.avgHit > 0 ? `${formatNumber(d.avgHit)} 均伤` : '-',
    breakdownLines: d.officialBreakdowns?.BaseDamage || d.officialBreakdowns?.Damage || undefined,
  });

  // 6. 支柱 ②：增伤放大乘区
  map.set('multipliers', {
    key: 'multipliers',
    label: '② 增伤放大乘区',
    subLabel: '伤害提高与更多乘区汇总',
    formattedValue: (d.incDamage > 0 || d.moreDamage > 0) ? `+${d.incDamage}% / ${d.moreDamage.toFixed(2)}x` : '-',
    breakdownLines: d.officialBreakdowns?.Multipliers || undefined,
    sources: d.multiplierSources.length > 0 ? d.multiplierSources : undefined,
  });

  // 7. 支柱 ③：暴击期望系统
  map.set('critSystem', {
    key: 'critSystem',
    subSectionKey: 'Crit',
    label: '③ 暴击期望系统',
    subLabel: '暴击几率与伤害倍率推导',
    formattedValue: (d.critChance > 0 || d.critMultiplier > 0) ? `${d.critChance.toFixed(1)}% / ${d.critMultiplier.toFixed(2)}x` : '-',
    breakdownLines: d.officialBreakdowns?.CritEffect || d.officialBreakdowns?.CritMultiplier || d.officialBreakdowns?.CritChance || undefined,
    sources: d.critMultiSources.length > 0 ? d.critMultiSources : (d.critChanceSources.length > 0 ? d.critChanceSources : undefined),
  });

  // 8. 支柱 ④：动作频次与速度
  map.set('speedSystem', {
    key: 'speedSystem',
    subSectionKey: 'Speed',
    label: '④ 动作速度与频次',
    subLabel: '动作耗时与每秒频次推导',
    formattedValue: d.speed > 0 ? `${d.speed.toFixed(2)} /秒` : '-',
    breakdownLines: d.officialBreakdowns?.Speed || undefined,
  });

  // 9. 点燃
  map.set('igniteDPS', {
    key: 'igniteDPS',
    subSectionKey: 'Ignite',
    label: '点燃伤害与状态属性',
    subLabel: '点燃伤害与状态属性明细',
    formattedValue: d.igniteDPS > 0 ? formatNumber(d.igniteDPS) : '-',
    breakdownLines: d.officialBreakdowns?.IgniteDPS || d.officialBreakdowns?.Ignite || undefined,
  });

  // 10. 非伤害型异常状态
  map.set('nonDamagingAilments', {
    key: 'nonDamagingAilments',
    subSectionKey: 'Non-Damaging Ailments',
    label: '非伤害型异常状态属性',
    subLabel: '感电·冰缓·冻结·力竭属性明细',
    formattedValue: d.shockEffect > 0 ? `x${d.shockEffect.toFixed(2)} 感电效果` : '-',
    breakdownLines: d.officialBreakdowns?.Shock || d.officialBreakdowns?.Chill || d.officialBreakdowns?.Freeze || undefined,
  });

  // 11. 法力消耗
  map.set('manaCost', {
    key: 'manaCost',
    label: '技能法力消耗与续航',
    subLabel: '单次法力消耗与续航推导',
    formattedValue: d.manaCost > 0 ? `${d.manaCost} 蓝` : '-',
    breakdownLines: d.officialBreakdowns?.ManaCost || undefined,
  });

  // 12. 敌人抗性
  map.set('enemyResist', {
    key: 'enemyResist',
    label: '敌人实际抗性与穿透',
    subLabel: '敌人抗性穿透与承受度明细',
    formattedValue: `${enemyRes}%`,
    breakdownLines: d.officialBreakdowns?.FireResist || d.officialBreakdowns?.EnemyResist || undefined,
  });

  return map;
});

function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined || isNaN(num) || num === 0) return '0';
  return num.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function getSourceTypeColor(type: string): string {
  if (type === 'Jewel') return 'text-sky-400';
  if (type === 'Item') return 'text-amber-400';
  if (type === 'Tree') return 'text-emerald-400';
  if (type === 'Skill') return 'text-cyan-400';
  if (type === 'Config') return 'text-violet-400';
  if (type === 'Pantheon' || type === 'Ascendancy') return 'text-purple-400';
  return 'text-gray-400';
}

function getSourceSummary(sources: ModSource[]): Record<string, string> {
  const map: Record<string, number> = {};
  for (const s of sources) {
    const t = translateSourceType(s.sourceType);
    const num = Number(s.value) || 0;
    map[t] = (map[t] || 0) + num;
  }
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) {
    result[k] = v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1);
  }
  return result;
}
</script>
