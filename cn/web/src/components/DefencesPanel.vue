<template>
  <div class="h-full flex-1 overflow-y-auto bg-black/95 p-5 text-gray-200 custom-scrollbar space-y-5 relative">
    
    <!-- 1. 顶部 Hero 生存看板与官方战斗状态切换器 -->
    <section class="rounded-2xl border border-poe-border/90 bg-[#0c0d14]/90 p-5 shadow-2xl space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div class="flex items-center gap-3">
          <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-900/40 border border-emerald-500/40 text-emerald-400 shadow-md">
            <ShieldAlert class="h-5 w-5" />
          </div>
          <div>
            <h2 class="text-base font-bold text-poe-gold font-poe-title tracking-wide flex items-center gap-2">
              <span>全维度生存与防御计算大盘</span>
              <span class="text-[10px] font-sans font-normal px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-700/50">
                100% 官方引擎直连
              </span>
            </h2>
            <p class="text-xs text-gray-400 mt-0.5">
              全量推演综合有效生命池、五系承伤转化流转、防一击秒杀线、六大基础池拆解与机动性
            </p>
          </div>
        </div>

        <!-- 官方战斗状态切换控制组 -->
        <div class="flex items-center gap-1 rounded-xl bg-black/80 p-1 border border-poe-border/80 shadow-inner text-xs">
          <span class="text-gray-500 px-2 font-mono text-[11px]">计算模式:</span>
          <button 
            v-for="mode in calcModes" 
            :key="mode.id"
            type="button" 
            @click="setCalcMode(mode.id)"
            :disabled="store.isCalculating"
            :class="[
              'rounded-lg px-2.5 py-1 font-semibold transition-all cursor-pointer',
              selectedCalcMode === mode.id 
                ? 'bg-gradient-to-r from-poe-gold to-amber-600 text-black shadow font-bold' 
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            ]"
          >
            {{ mode.label }}
          </button>
        </div>
      </div>

      <!-- 核心大指标总览 -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <!-- 综合有效生命池 -->
        <div 
          @click="openSectionBreakdown('EHP', '综合有效生命池推演')"
          class="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/25 to-black/80 p-3.5 cursor-pointer hover:border-emerald-400/60 transition-all group"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
              <HeartPulse class="h-3.5 w-3.5 text-emerald-400" />
              综合有效生命池
            </span>
            <ChevronRight class="h-3.5 w-3.5 text-gray-500 group-hover:text-emerald-400 transition-colors" />
          </div>
          <div class="mt-2 text-2xl font-extrabold font-mono text-white tracking-tight drop-shadow">
            {{ formatNumber(output.TotalEHP) }}
          </div>
          <div class="text-[10px] text-gray-400 mt-0.5">综合全维抗击打等效承伤量</div>
        </div>

        <!-- 猝死前承受击数 -->
        <div 
          @click="openSectionBreakdown('EHP', '致死前承受击数推演')"
          class="rounded-xl border border-poe-border/80 bg-black/60 p-3.5 cursor-pointer hover:border-amber-400/60 transition-all group"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-gray-300 flex items-center gap-1.5">
              <Target class="h-3.5 w-3.5 text-amber-400" />
              致死前承受击数
            </span>
            <ChevronRight class="h-3.5 w-3.5 text-gray-500 group-hover:text-amber-400 transition-colors" />
          </div>
          <div class="mt-2 text-2xl font-extrabold font-mono text-amber-300">
            {{ formatNumber(output.TotalNumberOfHits, 2) }} <span class="text-xs font-sans text-gray-500">次</span>
          </div>
          <div class="text-[10px] text-gray-400 mt-0.5">敌人平均出手致死次数</div>
        </div>

        <!-- 综合未受击回避率 -->
        <div 
          @click="openSectionBreakdown('Evasion', '综合未受击回避率推演')"
          class="rounded-xl border border-poe-border/80 bg-black/60 p-3.5 cursor-pointer hover:border-sky-400/60 transition-all group"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-gray-300 flex items-center gap-1.5">
              <Wind class="h-3.5 w-3.5 text-sky-400" />
              综合未受击回避率
            </span>
            <ChevronRight class="h-3.5 w-3.5 text-gray-500 group-hover:text-sky-400 transition-colors" />
          </div>
          <div class="mt-2 text-2xl font-extrabold font-mono text-sky-300">
            {{ formatNumber(output.MeleeNotHitChance, 1) }}%
          </div>
          <div class="text-[10px] text-gray-400 mt-0.5">闪避与躲避综合回避几率</div>
        </div>

        <!-- 有效移动速度 -->
        <div 
          @click="openMovementSpeedBreakdown('有效移动速度与机动性推演')"
          class="rounded-xl border border-poe-border/80 bg-gradient-to-br from-amber-950/20 to-black/80 p-3.5 cursor-pointer hover:border-poe-gold/60 transition-all group"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-poe-gold flex items-center gap-1.5">
              <Zap class="h-3.5 w-3.5 text-poe-gold" />
              有效移动速度
            </span>
            <ChevronRight class="h-3.5 w-3.5 text-gray-500 group-hover:text-poe-gold transition-colors" />
          </div>
          <div class="mt-2 text-2xl font-extrabold font-mono text-poe-gold">
            x {{ formatNumber(output.EffectiveMovementSpeedMod, 3) }}
          </div>
          <div class="text-[10px] text-gray-400 mt-0.5">综合装备惩罚与动作速度</div>
        </div>
      </div>
    </section>

    <!-- 2. 板块一：五系承伤全矩阵推演 与 元素与混沌抗性栏（同一行并排布局） -->
    <section class="grid grid-cols-1 xl:grid-cols-12 gap-4">
      
      <!-- 2.1 左侧：五系承伤与击中及持续全矩阵大表 (占 8 列) -->
      <div class="xl:col-span-8 2xl:col-span-9 rounded-2xl border border-poe-border/90 bg-[#0c0d14]/90 p-5 shadow-2xl space-y-3">
        <div class="flex items-center justify-between border-b border-white/10 pb-3">
          <div class="flex items-center gap-2">
            <Shield class="h-4 w-4 text-poe-gold" />
            <h3 class="text-sm font-bold text-gray-100 font-poe-title">五系承伤与击中及持续全矩阵推演</h3>
          </div>
          <span class="text-[11px] text-gray-400">点击任意行查看该伤害类型的精确推导与来源</span>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse font-sans">
            <thead>
              <tr class="border-b border-white/10 text-[11px] text-gray-400 bg-black/40">
                <th class="py-2.5 px-3 font-semibold">伤害属性</th>
                <th class="py-2.5 px-3 font-semibold">敌人基础伤害</th>
                <th class="py-2.5 px-3 font-semibold">转化后伤害</th>
                <th class="py-2.5 px-3 font-semibold">击中承伤倍率</th>
                <th class="py-2.5 px-3 font-semibold">单次承受击中</th>
                <th class="py-2.5 px-3 font-semibold text-poe-gold">防秒杀最大承受</th>
                <th class="py-2.5 px-3 font-semibold">持续承伤倍率</th>
                <th class="py-2.5 px-3 font-semibold text-emerald-400">持续伤有效血量</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5 font-mono">
              
              <!-- 物理 -->
              <tr 
                @click="openSectionBreakdown('Damage Taken', '物理承伤推演')"
                class="hover:bg-white/5 cursor-pointer transition-colors"
              >
                <td class="py-2.5 px-3 font-bold font-sans text-gray-200 flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-gray-400"></span>
                  物理
                </td>
                <td class="py-2.5 px-3 text-gray-300">{{ formatNumber(output.PhysicalEnemyDamage) }}</td>
                <td class="py-2.5 px-3 text-gray-300">{{ formatNumber(output.PhysicalTakenDamage) }}</td>
                <td class="py-2.5 px-3 text-amber-300">x {{ formatNumber(output.PhysicalTakenHitMult, 2) }}</td>
                <td class="py-2.5 px-3 text-gray-100 font-bold">{{ formatNumber(output.PhysicalTakenHit) }}</td>
                <td class="py-2.5 px-3 text-poe-gold font-bold text-sm">{{ formatNumber(output.PhysicalMaximumHitTaken) }}</td>
                <td class="py-2.5 px-3 text-gray-300">x {{ formatNumber(output.PhysicalBaseTakenHitMult, 2) }}</td>
                <td class="py-2.5 px-3 text-emerald-300 font-bold">{{ formatNumber(output.PhysicalDotEHP) }}</td>
              </tr>

              <!-- 闪电 -->
              <tr 
                @click="openSectionBreakdown('Damage Taken', '闪电承伤推演')"
                class="hover:bg-white/5 cursor-pointer transition-colors"
              >
                <td class="py-2.5 px-3 font-bold font-sans text-amber-400 flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                  闪电
                </td>
                <td class="py-2.5 px-3 text-gray-300">{{ formatNumber(output.LightningEnemyDamage) }}</td>
                <td class="py-2.5 px-3 text-gray-300">{{ formatNumber(output.LightningTakenDamage) }}</td>
                <td class="py-2.5 px-3 text-amber-300">x {{ formatNumber(output.LightningTakenHitMult, 2) }}</td>
                <td class="py-2.5 px-3 text-gray-100 font-bold">{{ formatNumber(output.LightningTakenHit) }}</td>
                <td class="py-2.5 px-3 text-poe-gold font-bold text-sm">{{ formatNumber(output.LightningMaximumHitTaken) }}</td>
                <td class="py-2.5 px-3 text-gray-300">x {{ formatNumber(output.LightningBaseTakenHitMult, 2) }}</td>
                <td class="py-2.5 px-3 text-emerald-300 font-bold">{{ formatNumber(output.LightningDotEHP) }}</td>
              </tr>

              <!-- 冰霜 -->
              <tr 
                @click="openSectionBreakdown('Damage Taken', '冰霜承伤推演')"
                class="hover:bg-white/5 cursor-pointer transition-colors"
              >
                <td class="py-2.5 px-3 font-bold font-sans text-sky-400 flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-sky-400"></span>
                  冰霜
                </td>
                <td class="py-2.5 px-3 text-gray-300">{{ formatNumber(output.ColdEnemyDamage) }}</td>
                <td class="py-2.5 px-3 text-gray-300">{{ formatNumber(output.ColdTakenDamage) }}</td>
                <td class="py-2.5 px-3 text-amber-300">x {{ formatNumber(output.ColdTakenHitMult, 2) }}</td>
                <td class="py-2.5 px-3 text-gray-100 font-bold">{{ formatNumber(output.ColdTakenHit) }}</td>
                <td class="py-2.5 px-3 text-poe-gold font-bold text-sm">{{ formatNumber(output.ColdMaximumHitTaken) }}</td>
                <td class="py-2.5 px-3 text-gray-300">x {{ formatNumber(output.ColdBaseTakenHitMult, 2) }}</td>
                <td class="py-2.5 px-3 text-emerald-300 font-bold">{{ formatNumber(output.ColdDotEHP) }}</td>
              </tr>

              <!-- 火焰 -->
              <tr 
                @click="openSectionBreakdown('Damage Taken', '火焰承伤推演')"
                class="hover:bg-white/5 cursor-pointer transition-colors"
              >
                <td class="py-2.5 px-3 font-bold font-sans text-red-400 flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-red-400"></span>
                  火焰
                </td>
                <td class="py-2.5 px-3 text-gray-300">{{ formatNumber(output.FireEnemyDamage) }}</td>
                <td class="py-2.5 px-3 text-gray-300">{{ formatNumber(output.FireTakenDamage) }}</td>
                <td class="py-2.5 px-3 text-amber-300">x {{ formatNumber(output.FireTakenHitMult, 2) }}</td>
                <td class="py-2.5 px-3 text-gray-100 font-bold">{{ formatNumber(output.FireTakenHit) }}</td>
                <td class="py-2.5 px-3 text-poe-gold font-bold text-sm">{{ formatNumber(output.FireMaximumHitTaken) }}</td>
                <td class="py-2.5 px-3 text-gray-300">x {{ formatNumber(output.FireBaseTakenHitMult, 2) }}</td>
                <td class="py-2.5 px-3 text-emerald-300 font-bold">{{ formatNumber(output.FireDotEHP) }}</td>
              </tr>

              <!-- 混沌 -->
              <tr 
                @click="openSectionBreakdown('Damage Taken', '混沌承伤推演')"
                class="hover:bg-white/5 cursor-pointer transition-colors"
              >
                <td class="py-2.5 px-3 font-bold font-sans text-purple-400 flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                  混沌
                </td>
                <td class="py-2.5 px-3 text-gray-300">{{ formatNumber(output.ChaosEnemyDamage) }}</td>
                <td class="py-2.5 px-3 text-gray-300">{{ formatNumber(output.ChaosTakenDamage) }}</td>
                <td class="py-2.5 px-3 text-amber-300">x {{ formatNumber(output.ChaosTakenHitMult, 2) }}</td>
                <td class="py-2.5 px-3 text-gray-100 font-bold">{{ formatNumber(output.ChaosTakenHit) }}</td>
                <td class="py-2.5 px-3 text-poe-gold font-bold text-sm">{{ formatNumber(output.ChaosMaximumHitTaken) }}</td>
                <td class="py-2.5 px-3 text-gray-300">x {{ formatNumber(output.ChaosBaseTakenHitMult, 2) }}</td>
                <td class="py-2.5 px-3 text-emerald-300 font-bold">{{ formatNumber(output.ChaosDotEHP) }}</td>
              </tr>

              <!-- 汇总行 -->
              <tr class="bg-black/60 font-bold border-t border-white/10">
                <td class="py-2.5 px-3 font-sans text-white">总计 / 综合</td>
                <td class="py-2.5 px-3 text-gray-200">{{ formatNumber(output.totalEnemyDamageIn) }}</td>
                <td class="py-2.5 px-3 text-gray-200">{{ formatNumber(output.totalTakenDamage) }}</td>
                <td class="py-2.5 px-3 text-amber-300">-</td>
                <td class="py-2.5 px-3 text-white">{{ formatNumber(output.totalTakenHit) }}</td>
                <td class="py-2.5 px-3 text-poe-gold text-sm">-</td>
                <td class="py-2.5 px-3 text-gray-300">-</td>
                <td class="py-2.5 px-3 text-emerald-400 text-sm">{{ formatNumber(output.TotalEHP) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 2.2 右侧：元素与混沌抗性栏 (与左侧五系矩阵同行呼应，占 4 列) -->
      <div 
        class="xl:col-span-4 2xl:col-span-3 rounded-2xl border border-poe-border/90 bg-[#0c0d14]/90 p-5 shadow-2xl space-y-3 flex flex-col justify-between"
      >
        <div class="flex items-center justify-between border-b border-white/10 pb-3">
          <div class="flex items-center gap-2">
            <Flame class="h-4 w-4 text-orange-400" />
            <h3 class="text-sm font-bold text-gray-100 font-poe-title">元素与混沌抗性</h3>
          </div>
          <span class="text-[10px] text-gray-400">点击单项查看专属来源</span>
        </div>

        <div class="space-y-2 text-xs font-mono flex-1 flex flex-col justify-around">
          
          <!-- 物理减免 -->
          <div 
            @click.stop="openSpecificResistBreakdown('Physical', '物理伤害减免拆解')"
            class="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between hover:bg-white/10 hover:border-gray-500/50 cursor-pointer transition-all group"
          >
            <span class="flex items-center gap-2 text-gray-300 font-sans font-medium group-hover:text-white transition-colors">
              <span class="w-2.5 h-2.5 rounded-full bg-gray-400 group-hover:ring-2 group-hover:ring-gray-300 transition-all"></span>物理减免
            </span>
            <div class="flex items-center gap-1.5">
              <span class="font-bold text-gray-100">{{ formatPercentage(output.PhysicalDamageReduction) }}</span>
              <ChevronRight class="w-3.5 h-3.5 text-gray-500 group-hover:text-gray-300 opacity-60 group-hover:opacity-100 transition-all" />
            </div>
          </div>

          <!-- 火焰抗性 -->
          <div 
            @click.stop="openSpecificResistBreakdown('Fire', '火焰抗性拆解')"
            class="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between hover:bg-red-950/20 hover:border-red-500/50 cursor-pointer transition-all group"
          >
            <span class="flex items-center gap-2 text-red-400 font-sans font-medium group-hover:text-red-300 transition-colors">
              <span class="w-2.5 h-2.5 rounded-full bg-red-400 group-hover:ring-2 group-hover:ring-red-400/80 transition-all"></span>火焰抗性
            </span>
            <div class="flex items-center gap-1.5 text-right">
              <div>
                <span class="font-bold text-red-400 group-hover:text-red-300 transition-colors">{{ formatPercentage(output.FireResist) }}</span>
                <span v-if="output.FireResistOverCap !== undefined" class="text-[10px] text-gray-400 ml-1.5 font-mono">({{ formatPercentage(output.FireResistOverCap) }})</span>
              </div>
              <ChevronRight class="w-3.5 h-3.5 text-red-900 group-hover:text-red-400 opacity-60 group-hover:opacity-100 transition-all" />
            </div>
          </div>

          <!-- 冰霜抗性 -->
          <div 
            @click.stop="openSpecificResistBreakdown('Cold', '冰霜抗性拆解')"
            class="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between hover:bg-sky-950/20 hover:border-sky-500/50 cursor-pointer transition-all group"
          >
            <span class="flex items-center gap-2 text-sky-400 font-sans font-medium group-hover:text-sky-300 transition-colors">
              <span class="w-2.5 h-2.5 rounded-full bg-sky-400 group-hover:ring-2 group-hover:ring-sky-400/80 transition-all"></span>冰霜抗性
            </span>
            <div class="flex items-center gap-1.5 text-right">
              <div>
                <span class="font-bold text-sky-400 group-hover:text-sky-300 transition-colors">{{ formatPercentage(output.ColdResist) }}</span>
                <span v-if="output.ColdResistOverCap !== undefined" class="text-[10px] text-gray-400 ml-1.5 font-mono">({{ formatPercentage(output.ColdResistOverCap) }})</span>
              </div>
              <ChevronRight class="w-3.5 h-3.5 text-sky-900 group-hover:text-sky-400 opacity-60 group-hover:opacity-100 transition-all" />
            </div>
          </div>

          <!-- 闪电抗性 -->
          <div 
            @click.stop="openSpecificResistBreakdown('Lightning', '闪电抗性拆解')"
            class="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between hover:bg-amber-950/20 hover:border-amber-500/50 cursor-pointer transition-all group"
          >
            <span class="flex items-center gap-2 text-amber-400 font-sans font-medium group-hover:text-amber-300 transition-colors">
              <span class="w-2.5 h-2.5 rounded-full bg-amber-400 group-hover:ring-2 group-hover:ring-amber-400/80 transition-all"></span>闪电抗性
            </span>
            <div class="flex items-center gap-1.5 text-right">
              <div>
                <span class="font-bold text-amber-400 group-hover:text-amber-300 transition-colors">{{ formatPercentage(output.LightningResist) }}</span>
                <span v-if="output.LightningResistOverCap !== undefined" class="text-[10px] text-gray-400 ml-1.5 font-mono">({{ formatPercentage(output.LightningResistOverCap) }})</span>
              </div>
              <ChevronRight class="w-3.5 h-3.5 text-amber-900 group-hover:text-amber-400 opacity-60 group-hover:opacity-100 transition-all" />
            </div>
          </div>

          <!-- 混沌抗性 -->
          <div 
            @click.stop="openSpecificResistBreakdown('Chaos', '混沌抗性拆解')"
            class="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between hover:bg-purple-950/20 hover:border-purple-500/50 cursor-pointer transition-all group"
          >
            <span class="flex items-center gap-2 text-purple-400 font-sans font-medium group-hover:text-purple-300 transition-colors">
              <span class="w-2.5 h-2.5 rounded-full bg-purple-400 group-hover:ring-2 group-hover:ring-purple-400/80 transition-all"></span>混沌抗性
            </span>
            <div class="flex items-center gap-1.5 text-right">
              <div>
                <span class="font-bold text-purple-400 group-hover:text-purple-300 transition-colors">{{ formatPercentage(output.ChaosResist) }}</span>
                <span v-if="output.ChaosResistOverCap !== undefined" class="text-[10px] text-gray-400 ml-1.5 font-mono">({{ formatPercentage(output.ChaosResistOverCap) }})</span>
              </div>
              <ChevronRight class="w-3.5 h-3.5 text-purple-900 group-hover:text-purple-400 opacity-60 group-hover:opacity-100 transition-all" />
            </div>
          </div>

        </div>
      </div>
    </section>

    <!-- 3. 板块二：六大基础池与核心防御 1:1 通用官方行动态拆解卡片 -->
    <section class="space-y-3">
      <div class="flex items-center justify-between border-b border-white/10 pb-2">
        <h3 class="text-sm font-bold text-gray-100 font-poe-title flex items-center gap-2">
          <Layers class="h-4 w-4 text-emerald-400" />
          基础生命池与核心防御公式拆解
        </h3>
        <span class="text-[11px] text-gray-400">点击任意指标卡片或具体行，查看官方独立专属推导与正负向来源明细</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        
        <!-- 1. 生命池卡片 -->
        <div 
          @click="openSectionBreakdown('Life', '生命池拆解')"
          class="rounded-xl border border-poe-border/80 bg-[#0a0a10] p-4 space-y-2.5 cursor-pointer hover:border-red-500/50 transition-all group"
        >
          <div class="flex items-center justify-between border-b border-white/10 pb-2">
            <div class="flex items-center gap-2">
              <Heart class="h-4 w-4 text-red-500 fill-red-500/20" />
              <span class="text-xs font-bold text-gray-100">生命池</span>
            </div>
            <span class="text-xs font-mono font-bold text-red-400">
              {{ getSubSectionHeader('Life') || (formatNumber(output.LifeUnreserved) + ' / ' + formatNumber(output.Life)) }}
            </span>
          </div>

          <div class="space-y-1.5 text-xs">
            <div 
              v-for="(row, rIdx) in getSectionRows('Life')" 
              :key="rIdx"
              @click.stop="openRowBreakdown('Life', row, '生命池: ' + translateRowLabel(row.label))"
              class="flex justify-between items-center text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-white/10"
            >
              <span>{{ translateRowLabel(row.label) }}</span>
              <span :class="['font-mono font-bold', getRowValueClass(row.value)]">{{ row.value }}</span>
            </div>
          </div>
        </div>

        <!-- 2. 魔力池卡片 -->
        <div 
          @click="openSectionBreakdown('Mana', '魔力池拆解')"
          class="rounded-xl border border-poe-border/80 bg-[#0a0a10] p-4 space-y-2.5 cursor-pointer hover:border-indigo-500/50 transition-all group"
        >
          <div class="flex items-center justify-between border-b border-white/10 pb-2">
            <div class="flex items-center gap-2">
              <Sparkles class="h-4 w-4 text-indigo-400" />
              <span class="text-xs font-bold text-gray-100">魔力池</span>
            </div>
            <span class="text-xs font-mono font-bold text-indigo-400">
              {{ getSubSectionHeader('Mana') || (formatNumber(output.ManaUnreserved) + ' / ' + formatNumber(output.Mana)) }}
            </span>
          </div>

          <div class="space-y-1.5 text-xs">
            <div 
              v-for="(row, rIdx) in getSectionRows('Mana')" 
              :key="rIdx"
              @click.stop="openRowBreakdown('Mana', row, '魔力池: ' + translateRowLabel(row.label))"
              class="flex justify-between items-center text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-white/10"
            >
              <span>{{ translateRowLabel(row.label) }}</span>
              <span :class="['font-mono font-bold', getRowValueClass(row.value)]">{{ row.value }}</span>
            </div>
          </div>
        </div>

        <!-- 3. 能量护盾与结界卡片 -->
        <div 
          @click="openSectionBreakdown('Energy Shield', '能量护盾与结界拆解')"
          class="rounded-xl border border-poe-border/80 bg-[#0a0a10] p-4 space-y-2.5 cursor-pointer hover:border-sky-500/50 transition-all group"
        >
          <div class="flex items-center justify-between border-b border-white/10 pb-2">
            <div class="flex items-center gap-2">
              <Zap class="h-4 w-4 text-sky-400" />
              <span class="text-xs font-bold text-gray-100">能量护盾与结界</span>
            </div>
            <span class="text-xs font-mono font-bold text-sky-300">
              {{ getSubSectionHeader('Energy Shield') || ('护盾: ' + formatNumber(output.EnergyShield)) }}
            </span>
          </div>

          <div class="space-y-1.5 text-xs">
            <div 
              v-for="(row, rIdx) in getSectionRows('Energy Shield')" 
              :key="rIdx"
              @click.stop="openRowBreakdown('Energy Shield', row, '能量护盾: ' + translateRowLabel(row.label))"
              class="flex justify-between items-center text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-white/10"
            >
              <span>{{ translateRowLabel(row.label) }}</span>
              <span :class="['font-mono font-bold', getRowValueClass(row.value)]">{{ row.value }}</span>
            </div>
          </div>
        </div>

        <!-- 4. 护甲与物理减免卡片 -->
        <div 
          @click="openSectionBreakdown('Armour', '护甲与物理减免拆解')"
          class="rounded-xl border border-poe-border/80 bg-[#0a0a10] p-4 space-y-2.5 cursor-pointer hover:border-amber-500/50 transition-all group"
        >
          <div class="flex items-center justify-between border-b border-white/10 pb-2">
            <div class="flex items-center gap-2">
              <Shield class="h-4 w-4 text-amber-400" />
              <span class="text-xs font-bold text-gray-100">护甲与物理减免</span>
            </div>
            <span class="text-xs font-mono font-bold text-amber-400">
              {{ getSubSectionHeader('Armour') || formatNumber(output.Armour) }}
            </span>
          </div>

          <div class="space-y-1.5 text-xs">
            <div 
              v-for="(row, rIdx) in getSectionRows('Armour')" 
              :key="rIdx"
              @click.stop="openRowBreakdown('Armour', row, '护甲: ' + translateRowLabel(row.label))"
              class="flex justify-between items-center text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-white/10"
            >
              <span>{{ translateRowLabel(row.label) }}</span>
              <span :class="['font-mono font-bold', getRowValueClass(row.value)]">{{ row.value }}</span>
            </div>
          </div>
        </div>

        <!-- 5. 闪避与回避率卡片 (100% 官方行动态映射) -->
        <div 
          @click="openSectionBreakdown('Evasion', '闪避与回避率拆解')"
          class="rounded-xl border border-poe-border/80 bg-[#0a0a10] p-4 space-y-2.5 cursor-pointer hover:border-emerald-500/50 transition-all group"
        >
          <div class="flex items-center justify-between border-b border-white/10 pb-2">
            <div class="flex items-center gap-2">
              <Wind class="h-4 w-4 text-emerald-400" />
              <span class="text-xs font-bold text-gray-100">闪避与回避率</span>
            </div>
            <span class="text-xs font-mono font-bold text-emerald-400">
              {{ getSubSectionHeader('Evasion') || formatNumber(output.Evasion) }}
            </span>
          </div>

          <div class="space-y-1.5 text-xs">
            <div 
              v-for="(row, rIdx) in getSectionRows('Evasion')" 
              :key="rIdx"
              @click.stop="openRowBreakdown('Evasion', row, '闪避: ' + translateRowLabel(row.label))"
              class="flex justify-between items-center text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-white/10"
            >
              <span>{{ translateRowLabel(row.label) }}</span>
              <span :class="['font-mono font-bold', getRowValueClass(row.value)]">{{ row.value }}</span>
            </div>
          </div>
        </div>

        <!-- 6. 精魂池卡片 -->
        <div 
          @click="openSectionBreakdown('Spirit', '精魂池拆解')"
          class="rounded-xl border border-poe-border/80 bg-[#0a0a10] p-4 space-y-2.5 cursor-pointer hover:border-yellow-500/50 transition-all group"
        >
          <div class="flex items-center justify-between border-b border-white/10 pb-2">
            <div class="flex items-center gap-2">
              <Flame class="h-4 w-4 text-yellow-400" />
              <span class="text-xs font-bold text-gray-100">精魂池</span>
            </div>
            <span class="text-xs font-mono font-bold text-yellow-400">
              {{ getSubSectionHeader('Spirit') || (formatNumber(output.SpiritUnreserved) + ' / ' + formatNumber(output.Spirit)) }}
            </span>
          </div>

          <div class="space-y-1.5 text-xs">
            <div 
              v-for="(row, rIdx) in getSectionRows('Spirit')" 
              :key="rIdx"
              @click.stop="openRowBreakdown('Spirit', row, '精魂池: ' + translateRowLabel(row.label))"
              class="flex justify-between items-center text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-white/10"
            >
              <span>{{ translateRowLabel(row.label) }}</span>
              <span :class="['font-mono font-bold', getRowValueClass(row.value)]">{{ row.value }}</span>
            </div>
          </div>
        </div>

      </div>
    </section>

    <!-- 4. 板块三：伤害避免大盘（【格挡与躲避】单卡片 + 【偏斜】卡片 + 【异常规避】卡片，整齐 3 列） -->
    <section class="space-y-3">
      <div class="flex items-center justify-between border-b border-white/10 pb-2">
        <h3 class="text-sm font-bold text-gray-100 font-poe-title flex items-center gap-2">
          <ShieldCheck class="h-4 w-4 text-sky-400" />
          伤害避免与规避机制
        </h3>
        <span class="text-[11px] text-gray-400">官方 1:1 原生格挡、躲避、偏斜与异常规避拆解</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        <!-- 1. 格挡与躲避合并为单个标准卡片 -->
        <div 
          @click="openSectionBreakdown('Block', '格挡与躲避规避拆解')"
          class="rounded-xl border border-poe-border/80 bg-[#0a0a10] p-4 space-y-2.5 cursor-pointer hover:border-sky-500/50 transition-all group"
        >
          <div class="flex items-center justify-between border-b border-white/10 pb-2">
            <div class="flex items-center gap-2">
              <ShieldCheck class="h-4 w-4 text-sky-400" />
              <span class="text-xs font-bold text-gray-100">格挡与躲避</span>
            </div>
            <div class="flex items-center gap-2 text-xs font-mono font-bold">
              <span class="text-sky-400">格挡: {{ formatPercentage(output.EffectiveBlockChance, 0) }}</span>
              <span class="text-gray-600">|</span>
              <span class="text-emerald-400">躲避: {{ getSubSectionHeader('Dodge') || '-' }}</span>
            </div>
          </div>

          <div class="space-y-1.5 text-xs">
            <!-- 格挡行 -->
            <div 
              v-for="(row, rIdx) in getSectionRows('Block')" 
              :key="'blk_' + rIdx"
              @click.stop="openRowBreakdown('Block', row, '格挡: ' + translateRowLabel(row.label))"
              class="flex justify-between items-center text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-white/10"
            >
              <span>{{ translateRowLabel(row.label) }}</span>
              <span :class="['font-mono font-bold', getRowValueClass(row.value)]">{{ row.value }}</span>
            </div>
            <!-- 躲避行 -->
            <div 
              v-for="(row, rIdx) in getSectionRows('Dodge')" 
              :key="'ddg_' + rIdx"
              @click.stop="openRowBreakdown('Dodge', row, '躲避: ' + translateRowLabel(row.label))"
              class="flex justify-between items-center text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-white/10"
            >
              <span>{{ translateRowLabel(row.label) }}</span>
              <span :class="['font-mono font-bold', getRowValueClass(row.value)]">{{ row.value }}</span>
            </div>
          </div>
        </div>

        <!-- 2. 偏斜卡片 (单个标准卡片) -->
        <div 
          @click="openSectionBreakdown('Deflection', '偏斜机制拆解')"
          class="rounded-xl border border-poe-border/80 bg-[#0a0a10] p-4 space-y-2.5 cursor-pointer hover:border-purple-500/50 transition-all group"
        >
          <div class="flex items-center justify-between border-b border-white/10 pb-2">
            <div class="flex items-center gap-2">
              <Shield class="h-4 w-4 text-purple-400" />
              <span class="text-xs font-bold text-gray-100">偏斜</span>
            </div>
            <span class="text-xs font-mono font-bold text-purple-400">
              偏斜: {{ getSubSectionHeader('Deflection') || '-' }}
            </span>
          </div>

          <div class="space-y-1.5 text-xs">
            <div 
              v-for="(row, rIdx) in getSectionRows('Deflection')" 
              :key="rIdx"
              @click.stop="openRowBreakdown('Deflection', row, '偏斜: ' + translateRowLabel(row.label))"
              class="flex justify-between items-center text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-white/10"
            >
              <span>{{ translateRowLabel(row.label) }}</span>
              <span :class="['font-mono font-bold', getRowValueClass(row.value)]">{{ row.value }}</span>
            </div>
          </div>
        </div>

        <!-- 3. 异常状态与特殊规避 (单个标准卡片) -->
        <div 
          @click="openSectionBreakdown('OtherAvoidance', '异常状态与特殊规避拆解')"
          class="rounded-xl border border-poe-border/80 bg-[#0a0a10] p-4 space-y-2.5 cursor-pointer hover:border-emerald-500/50 transition-all group"
        >
          <div class="flex items-center justify-between border-b border-white/10 pb-2">
            <div class="flex items-center gap-2">
              <Sparkles class="h-4 w-4 text-emerald-400" />
              <span class="text-xs font-bold text-gray-100">特殊规避与免暴</span>
            </div>
            <span class="text-xs font-mono font-bold text-emerald-400">免暴 / 免疫</span>
          </div>

          <div class="space-y-1.5 text-xs">
            <div 
              v-for="(row, rIdx) in getSectionRows('Other Avoidance')" 
              :key="rIdx"
              @click.stop="openRowBreakdown('Other Avoidance', row, '规避: ' + translateRowLabel(row.label))"
              class="flex justify-between items-center text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-white/10"
            >
              <span>{{ translateRowLabel(row.label) }}</span>
              <span :class="['font-mono font-bold', getRowValueClass(row.value)]">{{ row.value }}</span>
            </div>
          </div>
        </div>

      </div>
    </section>

    <!-- 5. 板块四：机动性、属性需求与药剂控制状态 (精简 3 列并排) -->
    <section class="grid grid-cols-1 md:grid-cols-3 gap-4">
      
      <!-- 1. 其他效果 (1:1 官方 PoB Other Effects) -->
      <div 
        @click="openSectionBreakdown('Other Effects', '其他效果拆解')"
        class="rounded-xl border border-poe-border/80 bg-[#0a0a10] p-4 space-y-3 cursor-pointer hover:border-yellow-500/50 transition-all group"
      >
        <div class="flex items-center justify-between border-b border-white/10 pb-2">
          <div class="flex items-center gap-2">
            <Sparkles class="h-4 w-4 text-yellow-400" />
            <h3 class="text-xs font-bold text-gray-200">其他效果</h3>
          </div>
          <span class="text-xs font-mono font-bold text-yellow-400">
            {{ getSubSectionHeader('Other Effects') || (getSectionRows('Other Effects').length ? '共 ' + getSectionRows('Other Effects').length + ' 项' : '-') }}
          </span>
        </div>

        <div class="space-y-1.5 text-xs">
          <div
            v-for="(row, rIdx) in getSectionRows('Other Effects')"
            :key="rIdx"
            @click.stop="openRowBreakdown('Other Effects', row, '其他效果: ' + translateRowLabel(row.label))"
            class="flex justify-between items-center text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-white/10"
          >
            <span>{{ translateRowLabel(row.label) }}</span>
            <span :class="['font-mono font-bold', getRowValueClass(row.value)]">{{ row.value }}</span>
          </div>
        </div>
      </div>

      <!-- 2. 三维属性与需求减免 -->
      <div 
        @click="openSectionBreakdown('Attributes', '三维属性与装备需求拆解')"
        class="rounded-xl border border-poe-border/80 bg-[#0a0a10] p-4 space-y-3 cursor-pointer hover:border-blue-500/50 transition-all group"
      >
        <div class="flex items-center justify-between border-b border-white/10 pb-2">
          <div class="flex items-center gap-2">
            <Target class="h-4 w-4 text-blue-400" />
            <h3 class="text-xs font-bold text-gray-200">三维属性与需求</h3>
          </div>
          <span class="text-xs font-mono font-bold text-blue-400">
            {{ getSubSectionHeader('Attributes') || (formatNumber(output.Str) + ' / ' + formatNumber(output.Dex) + ' / ' + formatNumber(output.Int)) }}
          </span>
        </div>

        <div class="space-y-1.5 text-xs">
          <div 
            v-for="(row, rIdx) in getSectionRows('Attributes')" 
            :key="rIdx"
            @click.stop="openRowBreakdown('Attributes', row, '属性: ' + translateRowLabel(row.label))"
            class="flex justify-between items-center text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-white/10"
          >
            <span>{{ translateRowLabel(row.label) }}</span>
            <span :class="['font-mono font-bold', getRowValueClass(row.value)]">{{ row.value }}</span>
          </div>
        </div>
      </div>

      <!-- 3. 药剂与充能恢复控制 -->
      <div 
        @click="openSectionBreakdown('Flasks', '药剂充能与持续时间拆解')"
        class="rounded-xl border border-poe-border/80 bg-[#0a0a10] p-4 space-y-3 cursor-pointer hover:border-emerald-500/50 transition-all group"
      >
        <div class="flex items-center justify-between border-b border-white/10 pb-2">
          <div class="flex items-center gap-2">
            <Activity class="h-4 w-4 text-emerald-400" />
            <h3 class="text-xs font-bold text-gray-200">药剂与充能获取</h3>
          </div>
          <span class="text-xs font-mono font-bold text-emerald-400">
            {{ getSubSectionHeader('Flasks') || '-' }}
          </span>
        </div>

        <div class="space-y-1.5 text-xs">
          <div 
            v-for="(row, rIdx) in getSectionRows('Flasks')" 
            :key="rIdx"
            @click.stop="openRowBreakdown('Flasks', row, '药剂: ' + translateRowLabel(row.label))"
            class="flex justify-between items-center text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-white/10"
          >
            <span>{{ translateRowLabel(row.label) }}</span>
            <span :class="['font-mono font-bold', getRowValueClass(row.value)]">{{ row.value }}</span>
          </div>
        </div>
      </div>

    </section>

    <!-- 6. 二级词缀溯源明细侧边抽屉 (100% 独立隔离专属行明细) -->
    <div 
      v-if="activeDrawer" 
      class="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50 flex justify-end"
      @click.self="activeDrawer = null"
    >
      <div class="w-full max-w-2xl h-full bg-[#0d0e17] border-l border-poe-border shadow-2xl flex flex-col animate-slide-left">
        <!-- 抽屉头部 -->
        <div class="p-4 border-b border-white/10 flex items-center justify-between bg-black/40">
          <div class="flex items-center gap-2.5">
            <div class="p-1.5 rounded-lg bg-poe-gold/10 border border-poe-gold/30 text-poe-gold">
              <Layers class="h-4 w-4" />
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-sm font-bold text-white font-poe-title">{{ activeDrawer.title }}</h3>
                <span v-if="activeDrawer.value !== undefined && activeDrawer.value !== ''" class="px-2 py-0.5 rounded-md bg-poe-gold/15 text-poe-gold border border-poe-gold/30 font-mono text-xs font-bold">
                  {{ activeDrawer.value }}
                </span>
              </div>
              <p class="text-[11px] text-gray-400">PoB 官方底层公式推导与专属词缀溯源明细</p>
            </div>
          </div>
          <button 
            @click="activeDrawer = null"
            class="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <!-- 抽屉主体内容 -->
        <div class="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar text-xs">
          
          <!-- A. 官方推导计算步骤 (文本公式行) -->
          <div class="space-y-2">
            <h4 class="text-xs font-bold text-poe-gold flex items-center gap-1.5">
              <Activity class="h-3.5 w-3.5 text-poe-gold" />
              官方推导计算步骤
            </h4>
            <div class="rounded-xl border border-white/10 bg-black/60 p-3 space-y-1.5 font-mono text-[11px]">
              <template v-if="activeDrawer.breakdownLines && activeDrawer.breakdownLines.length > 0">
                <div 
                  v-for="(line, idx) in activeDrawer.breakdownLines" 
                  :key="idx"
                  :class="line.startsWith('=') ? 'text-emerald-300 font-bold border-t border-white/10 pt-1 mt-1' : 'text-gray-300'"
                >
                  {{ translateFormulaLine(line) }}
                </div>
              </template>
              <template v-else-if="activeDrawer.value !== undefined && activeDrawer.value !== ''">
                <div class="text-gray-300">
                  基准机制设定: {{ activeDrawer.value }}
                </div>
                <div class="text-emerald-300 font-bold border-t border-white/10 pt-1 mt-1">
                  = {{ activeDrawer.value }} (当前生效值)
                </div>
              </template>
              <template v-else>
                <div class="text-gray-400">
                  官方基准机制生效中
                </div>
              </template>
            </div>
          </div>

          <!-- B. 官方原生装备槽位与各部位推导演算表 (Breakdown Tables) -->
          <div v-if="activeDrawer.breakdownTables && activeDrawer.breakdownTables.length > 0" class="space-y-3">
            <div v-for="(tab, tIdx) in activeDrawer.breakdownTables" :key="'btab_' + tIdx" class="space-y-1.5">
              <div v-if="tab.type === 'table'" class="overflow-x-auto rounded-xl border border-poe-border/80 bg-black/40">
                <div class="px-3 py-2 bg-poe-surface-elevated/60 border-b border-poe-border/60 text-xs font-bold text-gray-200 flex items-center justify-between">
                  <span class="flex items-center gap-1.5">
                    <Layers class="h-3.5 w-3.5 text-poe-gold" />
                    {{ tab.label ? translateWebText(tab.label) : '官方装备部位与基准槽位明细' }}
                  </span>
                  <span class="text-[10px] text-gray-400 font-mono">共 {{ tab.rows.length }} 项部位</span>
                </div>
                <table class="w-full text-left text-xs font-mono">
                  <thead class="bg-black/60 text-gray-400 border-b border-poe-border/40">
                    <tr>
                      <th v-for="col in tab.columns" :key="col.key" class="py-2 px-3 font-semibold">
                        {{ translateWebText(col.label || col.key) }}
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-white/5">
                    <tr v-for="(tRow, rIdx) in tab.rows" :key="'trow_' + rIdx" class="hover:bg-white/[0.04] transition-colors">
                      <td v-for="col in tab.columns" :key="col.key" class="py-2.5 px-3">
                        <span v-if="col.key === 'base' || col.key === 'total'" class="font-bold text-poe-gold">
                          {{ tRow[col.key] !== undefined && tRow[col.key] !== false ? tRow[col.key] : '-' }}
                        </span>
                        <span v-else-if="col.key === 'source'" class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-poe-gold/10 text-poe-gold border border-poe-gold/30">
                          {{ translateWebText(tRow[col.key]) }}
                        </span>
                        <span v-else-if="col.key === 'sourceLabel' || col.key === 'sourceName' || col.key === 'name'" class="text-gray-200 font-sans">
                          {{ tRow[col.key] ? translateWebItemName(tRow[col.key]) : '-' }}
                        </span>
                        <span v-else class="text-gray-300">
                          {{ tRow[col.key] !== undefined && tRow[col.key] !== false ? tRow[col.key] : '-' }}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- C. 全量词缀与机制来源结构化大表 -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <h4 class="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                <Target class="h-3.5 w-3.5 text-sky-400" />
                词缀与机制来源明细表 ({{ activeDrawer.sources.length }} 条)
              </h4>
              <span class="text-[10px] text-gray-500">1:1 对齐官方客户端明细表结构</span>
            </div>

            <!-- 1. 有外部/基础词缀来源 -->
            <div v-if="activeDrawer.sources.length > 0" class="rounded-xl border border-white/10 bg-black/40 overflow-hidden">
              <div class="overflow-x-auto">
                <table class="w-full text-left text-xs border-collapse font-sans">
                  <thead>
                    <tr class="border-b border-white/10 text-[11px] text-gray-400 bg-black/60">
                      <th class="py-2 px-3 font-semibold w-24">数值</th>
                      <th class="py-2 px-2.5 font-semibold w-28">作用属性</th>
                      <th class="py-2 px-2.5 font-semibold w-20">来源</th>
                      <th class="py-2 px-3 font-semibold">来源名称</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-white/5 font-mono">
                    <tr 
                      v-for="(src, idx) in activeDrawer.sources" 
                      :key="idx"
                      class="hover:bg-white/5 transition-colors"
                    >
                      <!-- 1. 数值 (图 3: 提高 30% / 图 4: +1 基础) -->
                      <td class="py-2.5 px-3 font-bold text-xs">
                        <span :class="getSourceValueClass(src.value)">
                          {{ displayOfficialSourceValue(src.value) }}
                        </span>
                      </td>

                      <!-- 2. 作用属性 (Stat: 火焰抗性上限 / 最大元素抗性 等) -->
                      <td class="py-2.5 px-2.5 text-[11px] font-sans text-gray-300">
                        <div>{{ displayOfficialSourceStat(src.name) }}</div>
                        <div v-if="src.modType" class="mt-0.5 text-[10px] text-gray-500">{{ displayOfficialSourceModType(src.modType) }}</div>
                      </td>

                      <!-- 3. 来源 (图 3: 天赋树 / 图 4: 物品) -->
                      <td class="py-2.5 px-2.5 text-[11px] font-sans">
                        <span :class="getSourceBadgeClass(src.sourceType)">
                          {{ displayOfficialSourceType(src.sourceType) }}
                        </span>
                      </td>

                      <!-- 4. 来源名称 (图 3: 守护者的核心 / 图 4: 斯瓦林) -->
                      <td class="py-2.5 px-3 font-sans space-y-1">
                        <div class="font-bold text-gray-200 text-xs">
                          {{ displayOfficialSourceName(src) }}
                        </div>
                        <div v-if="src.sourceRef && src.sourceRef.rawLines" class="text-[10px] text-gray-400 font-mono space-y-0.5">
                          <div 
                            v-for="(rawLine, lIdx) in getFilteredSourceLines(src.sourceRef.rawLines)" 
                            :key="lIdx"
                            class="text-gray-300"
                          >
                            • {{ translateItemLine(rawLine) }}
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- 2. PoB did not return a source row for this official breakdown -->
            <div v-else class="rounded-xl border border-white/10 bg-black/40 overflow-hidden">
              <div class="px-3 py-2.5 text-xs text-gray-500 font-mono">-</div>
            </div>
          </div>

        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { 
  ShieldAlert, Shield, ShieldCheck, HeartPulse, Heart, 
  Wind, Zap, Sparkles, Flame, Layers, Activity, Target,
  ChevronRight, X
} from 'lucide-vue-next';
import { useBuildStore } from '../stores/buildStore';
import { 
  translateCalcFormulaLine, 
  translateWebItemName, 
  translateWebItemLine, 
  translateWebText,
  translateSourceType
} from '../utils/webTranslation';

const store = useBuildStore();

const calcModes: Array<{ id: 'EFFECTIVE' | 'COMBAT' | 'BUFFED' | 'UNBUFFED'; label: string }> = [
  { id: 'EFFECTIVE', label: '有效秒伤' },
  { id: 'COMBAT', label: '战斗状态' },
  { id: 'BUFFED', label: '有增益' },
  { id: 'UNBUFFED', label: '无增益' },
];

const selectedCalcMode = computed(() => store.buffMode || 'EFFECTIVE');

const output = computed(() => {
  return (store.stats as any) || {};
});

const subSections = computed(() => {
  return ((store as any).skillBreakdown && (store as any).skillBreakdown.dynamicSubSections) || {};
});

interface DrawerState {
  key: string;
  title: string;
  value?: string | number;
  breakdownLines: string[];
  breakdownTables?: any[];
  sources: any[];
}
const activeDrawer = ref<DrawerState | null>(null);

function setCalcMode(modeId: 'EFFECTIVE' | 'COMBAT' | 'BUFFED' | 'UNBUFFED') {
  store.setBuffMode(modeId);
}

function getSectionRows(sectionKey: string): any[] {
  const sec = findSubSection(sectionKey);
  if (!sec || !Array.isArray(sec.rows)) return [];
  return sec.rows;
}

function getSubSectionHeader(sectionKey: string): string | null {
  const sec = findSubSection(sectionKey);
  if (sec && sec.headerValue) {
    return sec.headerValue;
  }
  if (sectionKey === 'Block') {
    const val = output.value.EffectiveBlockChance;
    return val !== undefined ? `${formatNumber(val, 0)}%` : null;
  }
  if (sectionKey === 'Dodge') {
    const atk = output.value.AttackDodgeChance;
    const spl = output.value.SpellDodgeChance;
    return atk !== undefined && spl !== undefined ? `${formatNumber(atk, 0)}%/${formatNumber(spl, 0)}%` : null;
  }
  if (sectionKey === 'Deflection') {
    const def = output.value.DeflectChance;
    return def !== undefined ? `${formatNumber(def, 0)}%` : null;
  }
  return null;
}

function findSubSection(sectionKey: string): any {
  if (sectionKey === 'EHP' || sectionKey === 'EffectiveHealthPool') {
    return subSections.value['Effective \"Health\" Pool'] || 
           subSections.value['Effective "Health" Pool'] || 
           subSections.value['EffectiveHealthPool'];
  }
  return subSections.value[sectionKey] || 
         subSections.value[sectionKey.replace(/ /g, '')];
}

function translateRowLabel(label: string): string {
  if (!label) return '';
  return translateWebText(label) || label;
}

function getRowValueClass(val: string | number | undefined): string {
  const str = String(val ?? '');
  if (str.startsWith('-') || str.includes('-%')) return 'text-red-400';
  if (str.includes('+') || str.startsWith('x ') || str.includes('/s')) return 'text-gray-100';
  return 'text-gray-200';
}

function openSpecificResistBreakdown(type: 'Fire' | 'Cold' | 'Lightning' | 'Chaos' | 'Physical', title: string) {
  if (type === 'Physical') {
    const armourSec = findSubSection('Armour');
    let physRow: any = null;
    if (armourSec && Array.isArray(armourSec.rows)) {
      physRow = armourSec.rows.find((r: any) => {
        const lbl = (r.label || '').toLowerCase();
        return lbl.includes('phys. dmg. reduct') || lbl.includes('physical damage reduction') || lbl === 'phys. dmg. reduct';
      });
    }
    if (physRow) {
      openRowBreakdown('Armour', physRow, title);
    } else {
      activeDrawer.value = {
        key: 'PhysicalDamageReduction',
        title,
        breakdownLines: [],
        breakdownTables: [],
        sources: []
      };
    }
    return;
  }

  const resistSec = findSubSection('Resists') || findSubSection('Resist');
  let targetRow: any = null;
  const targetKey = type.toLowerCase();
  if (resistSec && Array.isArray(resistSec.rows)) {
    targetRow = resistSec.rows.find((r: any) => {
      const lbl = (r.label || '').toLowerCase();
      return lbl.startsWith(targetKey) || lbl.includes(`${targetKey} resist`);
    });
  }

  if (targetRow) {
    openRowBreakdown('Resists', targetRow, title);
  } else {
    activeDrawer.value = {
      key: `Resist_${type}`,
      title,
      breakdownLines: [],
      breakdownTables: [],
      sources: []
    };
  }
}

function openMovementSpeedBreakdown(title: string = '有效移动速度拆解') {
  const otherDef = subSections.value['Other Defences'] || subSections.value['OtherDefences'];
  let msRow: any = null;
  if (otherDef && Array.isArray(otherDef.rows)) {
    msRow = otherDef.rows.find((r: any) => r.label === 'Movement Speed');
  }
  if (msRow) {
    openRowBreakdown('OtherDefences', msRow, title);
  } else {
    activeDrawer.value = {
      key: 'MovementSpeed',
      title,
      breakdownLines: [],
      breakdownTables: [],
      sources: []
    };
  }
}

function openSectionBreakdown(sectionKey: string, title: string) {
  if (sectionKey === 'Speed' || sectionKey === 'MovementSpeed' || sectionKey === 'Movement Speed') {
    openMovementSpeedBreakdown(title);
    return;
  }

  const sec = findSubSection(sectionKey);
  const lines: string[] = [];
  const tables: any[] = [];
  const sources: any[] = [];

  if (sec && Array.isArray(sec.rows)) {
    for (const row of sec.rows) {
      if (Array.isArray(row.breakdownLines)) {
        lines.push(...row.breakdownLines);
      }
      if (Array.isArray(row.breakdownTables)) {
        tables.push(...row.breakdownTables);
      }
      if (Array.isArray(row.sources)) {
        sources.push(...row.sources);
      }
    }
  }

  activeDrawer.value = {
    key: sectionKey,
    title,
    value: sec?.headerValue,
    breakdownLines: lines,
    breakdownTables: tables,
    sources
  };
}

function openRowBreakdown(sectionKey: string, row: any, title: string) {
  if (!row) return;
  const lines: string[] = Array.isArray(row.breakdownLines) && row.breakdownLines.length > 0 
    ? [...row.breakdownLines] 
    : [];
  const tables: any[] = Array.isArray(row.breakdownTables) && row.breakdownTables.length > 0 
    ? [...row.breakdownTables] 
    : [];
  const sources: any[] = Array.isArray(row.sources) && row.sources.length > 0 
    ? [...row.sources] 
    : [];

  activeDrawer.value = {
    key: `${sectionKey}_${row.label}`,
    title,
    value: row.value,
    breakdownLines: lines,
    breakdownTables: tables,
    sources
  };
}

function translateFormulaLine(line: string): string {
  if (!line) return '';
  return translateCalcFormulaLine(line);
}

function translateItemLine(line: string): string {
  if (!line) return '';
  return translateWebItemLine(line);
}

function translateText(text: string): string {
  if (!text) return '';
  return translateWebText(text) || text;
}

function displayOfficialSourceName(src: any): string {
  const raw = typeof src?.sourceName === 'string' && src.sourceName ? src.sourceName : src?.source;
  return typeof raw === 'string' && raw ? (translateCalcFormulaLine(raw) || raw) : '-';
}

function displayOfficialSourceType(type: unknown): string {
  const raw = typeof type === 'string' ? type : '';
  return raw ? (translateSourceType(raw) || raw) : '-';
}

function displayOfficialSourceStat(name: unknown): string {
  const raw = typeof name === 'string' ? name : '';
  return raw ? (translateCalcFormulaLine(raw) || raw) : '-';
}

function displayOfficialSourceModType(type: unknown): string {
  const raw = typeof type === 'string' ? type : '';
  return raw ? (translateWebText(raw) || raw) : '-';
}

function displayOfficialSourceValue(value: unknown): string {
  return value === undefined || value === null || value === '' ? '-' : String(value);
}

function getSourceValueClass(val: unknown): string {
  const raw = displayOfficialSourceValue(val);
  if (raw.startsWith('-')) return 'text-red-400 font-bold';
  if (raw !== '0' && raw !== '-') return 'text-emerald-400 font-bold';
  return 'text-gray-200';
}

function getFilteredSourceLines(rawLines: string[] | undefined): string[] {
  if (!Array.isArray(rawLines)) return [];
  return rawLines;
}

function getSourceBadgeClass(type: string | undefined): string {
  if (type === 'Item') return 'px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-700/50 text-[10px]';
  if (type === 'Tree') return 'px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700/50 text-[10px]';
  if (type === 'Jewel') return 'px-1.5 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-700/50 text-[10px]';
  if (type === 'Quest') return 'px-1.5 py-0.5 rounded bg-sky-950/80 text-sky-300 border border-sky-700/50 text-[10px]';
  return 'px-1.5 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-700/50 text-[10px]';
}

function formatNumber(num: number | string | undefined, precision: number = 0): string {
  if (num === undefined || num === null || num === '') return '-';
  const val = Number(num);
  if (isNaN(val)) return String(num);
  if (precision > 0) {
    return val.toLocaleString('zh-CN', { minimumFractionDigits: precision, maximumFractionDigits: precision });
  }
  return Math.round(val).toLocaleString('zh-CN');
}

function formatPercentage(num: number | string | undefined, precision: number = 0): string {
  const formatted = formatNumber(num, precision);
  return formatted === '-' ? formatted : `${formatted}%`;
}
</script>

<style scoped>
@keyframes slideLeft {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
.animate-slide-left {
  animation: slideLeft 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
</style>
