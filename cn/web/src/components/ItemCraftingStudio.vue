<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px] font-sans"
    @click.self="closeStudio"
  >
    <div class="bg-[#0e1017] border border-amber-500/40 rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden text-gray-200">
      <!-- 头部 -->
      <header class="flex items-center justify-between px-6 py-3.5 border-b border-white/10 bg-black/40">
        <div class="flex items-center gap-2.5">
          <Hammer class="w-5 h-5 text-poe-gold" />
          <div>
            <h2 class="text-sm font-bold text-amber-300 font-poe-title">PoB 官方装备与珠宝制作工坊 (0.5 赛季)</h2>
            <p class="text-[11px] text-gray-400">底材目录用于选择；词缀、精华、符文与规范化预览均由当前 PoB 官方核心返回</p>
          </div>
        </div>
        <button @click="closeStudio" class="text-gray-400 hover:text-white text-xl px-2 transition-colors" title="关闭">×</button>
      </header>

      <div class="flex items-center px-6 py-2 border-b border-white/10 bg-black/60 gap-2">
        <span class="px-3.5 py-1 rounded-lg text-xs font-bold bg-amber-600 text-white shadow-md flex items-center gap-1.5">
          <Hammer class="w-3.5 h-3.5" />
          <span>稀有、魔法与普通装备/珠宝制作</span>
        </span>
            <span v-if="itemToEdit?.rarity === 'UNIQUE'" class="text-xs text-amber-200">传奇暗金只读；当前操作会以底材新建稀有副本。</span>
      </div>

      <div v-if="craftAction === 'duplicate' && nonInheritedStates.length" class="px-6 py-2 border-b border-amber-500/30 bg-amber-950/20 text-xs text-amber-100">
        <span>该副本不会继承以下官方状态：</span>
        <span v-for="state in nonInheritedStates" :key="state" class="ml-1.5 inline-block rounded border border-amber-500/40 px-1.5 py-0.5 text-[11px]">
          {{ translateWebText(state) }}
        </span>
      </div>

      <!-- 目标槽只显示当前官方 options 返回的合法槽位；空值表示仅保存到物品库。 -->
      <div v-if="craftOptions?.validTargetSlots" class="px-6 py-2 border-b border-white/10 bg-black/40">
        <label class="flex items-center gap-3 text-xs text-gray-300">
          <span class="shrink-0 text-amber-300 font-semibold">制作后目标</span>
          <select v-model="selectedTargetKey" class="min-w-64 flex-1 max-w-xl bg-black/80 border border-amber-500/30 rounded px-2 py-1.5 text-xs text-gray-100 focus:border-amber-500 focus:outline-none">
            <option value="">仅保存到物品库</option>
            <optgroup v-if="targetEquipmentSlots.length" label="官方装备槽">
              <option v-for="slot in targetEquipmentSlots" :key="`equipment:${slot}`" :value="`equipment:${slot}`">{{ translateWebText(slot) }}</option>
            </optgroup>
            <optgroup v-if="targetJewelSlots.length" label="官方天赋珠宝槽">
              <option v-for="slot in targetJewelSlots" :key="`jewel:${slot.nodeId}`" :value="`jewel:${slot.nodeId}`">{{ translateWebText(slot.slotName) }} #{{ slot.nodeId }}</option>
            </optgroup>
          </select>
          <span v-if="!targetEquipmentSlots.length && !targetJewelSlots.length" class="text-[10px] text-gray-500">当前官方物品没有可用目标槽</span>
        </label>
      </div>

      <!-- 主体双栏区域 -->
      <main class="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_380px] overflow-y-auto">
        <!-- 左侧配置区 -->
        <section class="p-5 space-y-4 border-r border-white/10 overflow-y-auto">
          <div v-if="itemToEdit && !target" class="p-2.5 rounded-lg bg-amber-950/30 border border-amber-600/40 text-xs text-amber-200 flex items-center gap-2">
            <span>ℹ️</span>
            <span>当前物品为物品库中的独立条目，保存时将生成新条目或存入物品库。</span>
          </div>

          <div class="space-y-4">
            <!-- 1. 基础信息配置（类别、底材、变体、等级、品质、腐化开关） -->
            <div class="bg-black/50 p-3.5 rounded-xl border border-white/10 space-y-3">
              <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <label class="space-y-1 text-xs text-gray-400">
                  <span>装备类别</span>
                  <select v-model="selectedCategory" class="w-full bg-black/80 border border-white/20 rounded px-2 py-1.5 text-xs text-gray-100 focus:border-amber-500 focus:outline-none">
                    <option v-for="category in categories" :key="category" :value="category">{{ translateWebItemType(category) }}</option>
                  </select>
                </label>
                <label class="space-y-1 text-xs text-gray-400">
                  <span>需求属性偏向</span>
                  <select v-model="attributeFilter" class="w-full bg-black/80 border border-white/20 rounded px-2 py-1.5 text-xs text-gray-100 focus:border-amber-500 focus:outline-none">
                    <option v-for="option in attributeOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
                  </select>
                </label>
                <label class="space-y-1 text-xs text-gray-400">
                  <span>官方底材</span>
                  <select v-model="baseName" class="w-full bg-black/80 border border-white/20 rounded px-2 py-1.5 text-xs text-gray-100 focus:border-amber-500 focus:outline-none">
                    <option v-for="base in basesForCategory" :key="base.id" :value="base.id">{{ translateWebItemName(base.id) }} (需求等级 {{ base.requiredItemLevel }})</option>
                  </select>
                </label>
                <label class="space-y-1 text-xs text-gray-400">
                  <span>官方稀有度</span>
                  <select v-model="rarity" class="w-full bg-black/80 border border-white/20 rounded px-2 py-1.5 text-xs text-gray-100 focus:border-amber-500 focus:outline-none">
                    <option v-for="value in allowedRarities" :key="value" :value="value">{{ translateWebText(value) }}</option>
                  </select>
                </label>
                <label v-if="rarity === 'RARE'" class="space-y-1 text-xs text-gray-400">
                  <span>物品标题（可选）</span>
                  <input v-model="itemTitle" type="text" maxlength="64" placeholder="New Item" class="w-full bg-black/80 border border-white/20 rounded px-2 py-1.5 text-xs text-gray-100 focus:border-amber-500 focus:outline-none" />
                </label>
              </div>

              <!-- 官方底材变体与符文孔 -->
              <div v-if="selectedBase && (craftOptions?.variantList || selectedBase.variantList || (craftOptions?.runeCapabilities?.socketCount ?? 0) > 0)" class="p-2.5 bg-black/60 border border-white/10 rounded-lg space-y-2">
                <div v-if="(craftOptions?.variantList ?? selectedBase.variantList)?.length" class="flex items-center gap-3">
                  <span class="text-xs text-amber-300 font-semibold shrink-0">底材变体 / 技能:</span>
                  <select v-model.number="selectedVariantIndex" class="flex-1 bg-black/80 border border-amber-500/40 rounded px-2 py-1 text-xs text-amber-100 focus:outline-none">
                    <option v-for="(v, idx) in (craftOptions?.variantList ?? selectedBase.variantList)" :key="idx" :value="idx + 1">
                      {{ translateWebItemLine(v) }}
                    </option>
                  </select>
                </div>

                <div v-for="range in implicitRanges" :key="`implicit-range-${range.index}`" class="flex items-center gap-2">
                  <span class="text-[10px] text-gray-400 shrink-0">范围位置: {{ formatRoll(range.roll) }}</span>
                  <input type="range" v-model.number="range.roll" min="0" max="1" step="0.001" aria-label="范围位置" class="craft-roll-slider min-w-24 flex-1" />
                </div>

                <!-- 底材孔数信息 -->
                <div v-if="(craftOptions?.runeCapabilities?.socketCount ?? 0) > 0" class="text-[10px] text-cyan-400">
                  <span>官方底材符文孔: {{ craftOptions?.runeCapabilities?.socketCount }} 孔</span>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end pt-1">
                <label class="space-y-1 text-xs text-gray-400">
                  <span>物品等级 (等级: {{ itemLevel }})</span>
                  <input v-model.number="itemLevel" type="number" :min="minimumItemLevel" class="w-full bg-black/80 border border-white/20 rounded px-2 py-1 text-xs text-gray-100 focus:border-amber-500 focus:outline-none" />
                </label>

                <!-- 品质滑块 (珠宝不支持品质，自动隐藏) -->
                <label v-if="selectedBase?.canHaveQuality" class="space-y-1 text-xs text-gray-400">
                  <div class="flex justify-between">
                    <span>基础品质</span>
                    <span class="text-amber-400 font-mono font-bold">{{ quality }}%</span>
                  </div>
                  <input v-model.number="quality" type="range" min="0" :max="craftOptions?.qualityLimit ?? 0" step="1" :disabled="optionsLoading || !craftOptions" class="w-full accent-amber-500" />
                </label>

                <label v-if="craftOptions?.catalyst?.canSet" class="space-y-1 text-xs text-gray-400">
                  <span>催化剂</span>
                  <select v-model.number="catalyst" class="w-full bg-black/80 border border-violet-400/30 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none">
                    <option v-for="option in (craftOptions.catalyst.allowed ?? [])" :key="option.id" :value="option.id">{{ translateWebText(option.name) }}</option>
                  </select>
                  <input v-if="catalyst > 0" v-model.number="catalystQuality" type="range" min="0" :max="craftOptions.catalyst.qualityLimit" step="1" class="w-full accent-violet-500" />
                  <span v-if="catalyst > 0" class="text-[10px] text-violet-300">催化剂品质：{{ catalystQuality }}%</span>
                </label>
                <div v-else-if="hasReadonlyCatalyst" class="text-[10px] text-violet-300 leading-snug">
                  当前催化剂及催化剂品质由官方 PoB 内核原样保留。
                </div>

                <!-- 腐化开关 -->
                <label v-if="!craftOptions || craftOptions.corruptible" class="flex items-center gap-2 p-2 bg-red-950/30 hover:bg-red-950/50 border border-red-800/40 rounded-lg cursor-pointer transition-all">
                  <input v-model="isCorrupted" type="checkbox" class="w-4 h-4 accent-red-600 rounded" />
                  <span class="text-xs font-bold text-red-300">🔴 腐化装备</span>
                </label>
              </div>
            </div>

            <!-- 精华固定词缀（由当前 Lua 官方底材规则返回） -->
              <div v-if="!isJewelCategory && rarity !== 'NORMAL'" class="p-3 rounded-xl border border-violet-500/30 bg-violet-950/15 space-y-2">
              <div class="flex items-center justify-between">
                <h3 class="text-xs font-bold text-violet-200">精华固定词缀</h3>
                <span v-if="selectedEssenceMod" class="text-[10px] text-violet-300">占用{{ translateWebText(selectedEssenceMod.type) }}</span>
              </div>
              <select v-model="selectedEssenceId" :disabled="optionsLoading || !craftOptions" class="w-full bg-black/80 border border-violet-400/30 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none">
                <option value="">不使用精华</option>
                <option v-for="essence in availableEssences" :key="essence.id" :value="essence.id">{{ essenceLabel(essence) }}</option>
              </select>
              <div v-if="selectedEssenceId" class="mt-2 flex items-center gap-2 px-1">
                <span class="text-[10px] text-violet-300">范围位置: {{ formatRoll(essenceRoll) }}</span>
                        <input type="range" v-model.number="essenceRoll" min="0" max="1" :step="selectedEssenceMod?.range?.step ?? 0.01" aria-label="范围位置" class="craft-roll-slider min-w-24 flex-1 craft-roll-slider-violet" />
              </div>
              <div v-if="selectedEssence && selectedEssenceMod" class="text-[11px] text-violet-200 leading-snug font-semibold">
                <div v-for="(line, lineIndex) in officialModLines(selectedEssenceMod)" :key="`${selectedEssenceMod.id}:${lineIndex}`">
                  {{ line }}
                </div>
              </div>
            </div>

            <!-- 4. 核心词缀选择系统（严格同组互斥、前缀与后缀、上限联动） -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <section v-for="type in affixTypes" :key="type.key" class="p-3.5 rounded-xl border border-white/10 bg-black/40 space-y-3">
                <div class="flex items-center justify-between">
                  <h3 class="text-xs font-bold font-poe-title" :class="type.key === 'prefixes' ? 'text-blue-300' : 'text-amber-300'">
                    {{ type.label }} ({{ affixCount(type.type) }}/{{ affixLimitFor(type.key) }})
                  </h3>
                </div>

                <!-- 搜索与添加词缀族选择器（已选同组词缀彻底排除！） -->
                <div class="space-y-1.5">
                  <div class="flex gap-1.5">
                    <input
                      v-model="affixSearch[type.key]"
                      type="text"
                      placeholder="🔍 搜索词缀族 (如 生命, 抗性, 施法...)"
                      class="flex-1 bg-black/70 border border-white/20 rounded px-2 py-1 text-xs text-gray-100 placeholder:text-gray-500 focus:outline-none"
                    />
                    <button
                      @click="addAffixByGroup(type.key)"
                      :disabled="optionsLoading || !craftOptions || affixCount(type.type) >= affixLimitFor(type.key) || !selectedGroupKey[type.key]"
                      class="px-2.5 py-1 text-xs font-bold rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-30 text-white transition-all shadow-sm shrink-0"
                    >
                      添加
                    </button>
                  </div>

                  <select v-model="selectedGroupKey[type.key]" class="w-full bg-black/80 border border-white/20 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none">
                    <option value="">选择词缀族 (已自动排除冲突组)</option>
                    <option v-for="group in filteredAffixGroups(type.key === 'prefixes' ? 'Prefix' : 'Suffix', affixSearch[type.key])" :key="group.key" :value="group.key">
                      {{ group.displayName }}
                    </option>
                  </select>
                </div>

                <!-- 已选词缀列表 -->
                <div v-if="draft[type.key].length === 0" class="text-[11px] text-gray-500 py-3 text-center">
                  尚未添加{{ type.label }}
                </div>
                <div v-for="(affix, index) in draft[type.key]" :key="affix.id" class="p-2.5 rounded-lg border border-white/10 bg-black/60 space-y-2">
                  <div class="flex justify-between items-start gap-2">
                    <div class="flex-1 min-w-0">
                      <div class="text-xs text-gray-100 font-semibold">
                        <div v-for="(line, lineIndex) in officialModLines(optionModFor(affix.id))" :key="`${affix.id}:${lineIndex}`">
                          {{ line }}
                        </div>
                      </div>
                      <div v-if="optionModFor(affix.id)?.range" class="mt-1 flex items-center gap-2">
                        <span class="text-[10px] text-gray-400">范围位置: {{ formatRoll(affix.roll) }}</span>
                        <input type="range" v-model.number="affix.roll" min="0" max="1" :step="optionModFor(affix.id)?.range?.step ?? 0.01" aria-label="范围位置" class="craft-roll-slider min-w-24 flex-1" />
                      </div>
                    </div>
                    <button @click="draft[type.key].splice(index, 1)" class="text-red-400 hover:text-red-300 text-xs px-1">移除</button>
                  </div>

                  <!-- 等阶快捷切换下拉 -->
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] text-gray-400 shrink-0">等阶:</span>
                    <select
                      :value="affix.id"
                      @change="switchAffixTier(type.key, index, ($event.target as HTMLSelectElement).value)"
                      class="flex-1 bg-black/80 border border-white/15 rounded px-1.5 py-0.5 text-[11px] text-gray-200 focus:outline-none"
                    >
                      <option v-for="sibling in getSiblingTiers(affix.id)" :key="sibling.id" :value="sibling.id">
                        {{ officialModLabel(sibling) }}
                      </option>
                    </select>
                  </div>
                </div>
              </section>
            </div>

            <!-- 5. 官方符文孔与镶嵌联动 (基于官方 runeCapabilities，珠宝不展示) -->
            <div v-if="!isJewelCategory && runeCapabilities && runeCapabilities.socketCount > 0" class="p-3.5 bg-cyan-950/20 border border-cyan-500/30 rounded-xl space-y-2.5">
              <div class="flex justify-between items-center text-xs">
                <h3 class="font-bold text-cyan-200 flex items-center gap-1.5">
                  <Sparkles class="w-3.5 h-3.5 text-cyan-300" />
                  <span>官方符文孔与镶嵌</span>
                </h3>
                <span class="text-cyan-300 font-mono">{{ runeCapabilities.socketCount }} 孔</span>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label v-for="(_, index) in runeCapabilities.socketCount" :key="index" class="space-y-1 text-xs text-gray-300">
                  <span>符文孔</span>
                  <select v-model="selectedRunes[index]" class="w-full bg-black/80 border border-cyan-500/40 rounded px-2 py-1.5 text-xs text-gray-100 focus:outline-none">
                    <option v-if="runeCapabilities.allowed.includes('None')" value="None">无符文</option>
                    <option v-for="rune in runeCapabilities.allowed" :key="rune" :value="rune">{{ translateRuneName(rune) }}</option>
                  </select>
                </label>
              </div>
            </div>
            <div v-else-if="!isJewelCategory && optionsLoading" class="p-2.5 bg-cyan-950/10 border border-cyan-800/30 rounded-xl text-xs text-cyan-300">
              正在读取官方符文能力。
            </div>
          </div>

          <div v-if="error" class="p-2.5 rounded-lg bg-red-950/40 border border-red-800/60 text-xs text-red-200">
            ⚠️ {{ error }}
          </div>
          <div v-if="draftValidationError" class="p-2.5 rounded-lg bg-amber-950/40 border border-amber-800/60 text-xs text-amber-200">
            ⚠️ {{ draftValidationError }}
          </div>
        </section>

        <!-- 右侧：官方卡片 / PoB 源码框 双视图 -->
        <aside class="p-4 bg-black/40 flex flex-col h-full space-y-3 overflow-hidden">
          <!-- 视图切换栏与工具按钮 -->
          <div class="flex items-center justify-between border-b border-white/10 pb-2.5">
            <div class="flex items-center gap-1 bg-black/80 p-1 rounded-lg border border-white/10">
              <button
                @click="rightViewMode = 'card'"
                type="button"
                :class="['px-2.5 py-1 rounded text-xs font-bold transition-all flex items-center gap-1', rightViewMode === 'card' ? 'bg-amber-600 text-white shadow' : 'text-gray-400 hover:text-white']"
              >
                <span>📊 官方卡片</span>
              </button>
              <button
                @click="rightViewMode = 'raw'"
                type="button"
                :class="['px-2.5 py-1 rounded text-xs font-bold transition-all flex items-center gap-1', rightViewMode === 'raw' ? 'bg-amber-600 text-white shadow' : 'text-gray-400 hover:text-white']"
              >
                <Code class="w-3.5 h-3.5" />
                <span>📝 PoB 源码框</span>
              </button>
            </div>

            <div class="flex items-center gap-1.5">
              <button
                v-if="rightViewMode === 'raw'"
                @click="copyRawText"
                type="button"
                class="px-2 py-1 rounded text-[11px] bg-white/10 hover:bg-white/20 text-gray-200 hover:text-white border border-white/10 transition-all flex items-center gap-1"
                title="复制当前 PoB 源码"
              >
                <Clipboard class="w-3 h-3 text-amber-300" />
                <span>{{ copiedNotice ? '已复制！' : '复制源码' }}</span>
              </button>
              <span v-else class="text-[10px] text-gray-400 font-mono">100% 原生透传</span>
            </div>
          </div>

          <!-- 视图 1：官方装备展示卡片 -->
          <div v-if="rightViewMode === 'card'" class="flex-1 space-y-2 overflow-y-auto pr-1">
            <div class="p-3.5 bg-black/70 border border-amber-500/40 rounded-xl space-y-2.5 shadow-inner">
              <div v-if="previewItem?.tooltip?.header" class="space-y-2.5 text-xs font-mono">
                <div class="border-b border-amber-500/30 pb-2 text-center">
                  <div class="font-bold text-amber-300">{{ officialTooltipTitle(previewItem) }}</div>
                  <div v-if="previewItem.tooltip.header.base" class="mt-0.5 text-gray-300">{{ translateWebItemLine(previewItem.tooltip.header.base) }}</div>
                </div>
                <div v-if="Array.isArray(previewItem.tooltip.bodyLines) && previewItem.tooltip.bodyLines.length" class="space-y-1 py-0.5 text-xs">
                  <div v-for="(line, index) in previewItem.tooltip.bodyLines" :key="index" class="break-words leading-relaxed text-[#8888ff]">
                    {{ translateWebItemLine(line) }}
                  </div>
                </div>
              </div>
              <div v-else class="text-center text-xs text-gray-500 py-4 font-mono">
                等待官方预览
              </div>
            </div>
          </div>

          <!-- 视图 2：PoB 官方源码文本框 (Raw Text Editor) -->
          <div v-else-if="rightViewMode === 'raw'" class="flex-1 flex flex-col space-y-2 overflow-hidden">
            <div class="flex items-center justify-between text-[11px] text-gray-400 px-0.5">
               <span>PoB 官方规范化源码（只读）：</span>
            </div>

             <pre class="w-full flex-1 bg-black/90 border border-white/20 rounded-xl p-3 font-mono text-xs text-amber-200 whitespace-pre-wrap overflow-y-auto">{{ previewRawText }}</pre>
          </div>
        </aside>
      </main>

      <!-- 底部操作按钮 -->
      <footer class="flex items-center justify-between gap-3 px-6 py-3.5 border-t border-white/10 bg-black/70">
        <span class="text-xs text-gray-400">同组词缀互斥；词缀等级受物品等级约束；遵循官方制作契约。</span>
        <div class="flex items-center gap-2">
          <button @click="closeStudio" type="button" class="px-3.5 py-1.5 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-gray-200 transition-all">
            取消
          </button>
          <button @click="preview" :disabled="loading || !!draftValidationError" type="button" class="px-3.5 py-1.5 text-xs rounded-lg bg-blue-900/70 hover:bg-blue-800 text-blue-100 font-bold transition-all shadow">
            {{ loading ? '解析中...' : '🔍 官方预览' }}
          </button>
          <button @click="commit" :disabled="loading || !!draftValidationError || !previewIsCurrent" type="button" class="px-4 py-1.5 text-xs rounded-lg bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold transition-all shadow-md">
            {{ target ? '⚡ 保存并穿戴' : '📥 保存到物品库' }}
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { Clipboard, Code, Hammer, Sparkles } from 'lucide-vue-next';
import { useBuildStore } from '../stores/buildStore';
import { translateRuneName, translateWebItemLine, translateWebItemName, translateWebItemType, translateWebText } from '../utils/webTranslation';

function handleGlobalKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.isOpen) {
    closeStudio();
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeyDown);
  if (optionsRefreshTimer) clearTimeout(optionsRefreshTimer);
});

type AffixKey = 'prefixes' | 'suffixes';
type AffixLimitState = { prefixes: number; suffixes: number };
type Target = { kind: 'equipment'; itemSetId: number; slotName: string } | { kind: 'jewel'; specId: number; nodeId: number } | null;
type AttributeFilter = 'ALL' | 'STR' | 'DEX' | 'INT' | 'HYBRID' | 'NONE';
type OfficialCraftBase = {
  id: string;
  type: string;
  requiredItemLevel: number;
  attributeRequirements?: { str?: number; dex?: number; int?: number };
  allowedRarities?: Array<'NORMAL' | 'MAGIC' | 'RARE'>;
  variantList?: string[];
  canHaveQuality?: boolean;
  canHaveSockets?: boolean;
};
type OfficialCraftMod = {
  id: string;
  type: 'Prefix' | 'Suffix';
  group: string;
  requiredItemLevel: number;
  lines: string[];
  range?: { min: number; max: number; step: number };
  tier?: number;
};
type OfficialImplicitRange = { index: number; roll: number; line?: string };
type OfficialCraftEssence = {
  id: string;
  name: string;
  type: string;
  mod: OfficialCraftMod;
};
type OfficialCraftOptions = {
  corruptible: boolean;
  affixLimits: AffixLimitState;
  affixCounts: AffixLimitState;
  prefixes: OfficialCraftMod[];
  suffixes: OfficialCraftMod[];
  selected: { prefixes: OfficialCraftMod[]; suffixes: OfficialCraftMod[]; essence: OfficialCraftEssence | null };
  tierOptions: Record<string, OfficialCraftMod[]>;
  essences: OfficialCraftEssence[];
  runeCapabilities: { socketCount: number; allowed: string[] };
  qualityLimit: number;
  variantList?: string[];
  variant?: number;
  implicitRanges?: OfficialImplicitRange[];
  quality?: { canSet: boolean; value?: number; min: number; max: number };
  catalyst?: { canSet: boolean; allowedIds: number[]; allowed?: Array<{ id: number; name: string }>; value: number; quality: number; qualityLimit: number };
  validTargetSlots?: { equipment: string[]; equipmentJewels?: string[]; jewels: Array<{ nodeId: number; slotName: string }> };
  action?: 'create' | 'edit' | 'duplicate';
  nonInheritedStates?: string[];
};

const props = defineProps<{
  isOpen: boolean;
  itemToEdit?: any;
  initialCategory?: string;
  initialTarget?: Target;
}>();
const emit = defineEmits<{ close: []; created: [itemId: string | number] }>();

const store = useBuildStore();
const catalog = ref<OfficialCraftBase[]>([]);
const bases = computed(() => catalog.value);
const categories = computed(() => [...new Set(bases.value.map(base => base.type))].sort());

const rightViewMode = ref<'card' | 'raw'>('card');
const copiedNotice = ref(false);

const selectedCategory = ref(props.initialCategory || '');
const attributeFilter = ref<AttributeFilter>('ALL');
const baseName = ref('');
const rarity = ref<'NORMAL' | 'MAGIC' | 'RARE'>('RARE');
const selectedVariantIndex = ref(1);
const implicitRanges = ref<OfficialImplicitRange[]>([]);
const defaultCraftItemLevel = 82;
const itemLevel = ref(defaultCraftItemLevel);
const itemTitle = ref('');
const quality = ref(0);
const catalyst = ref(0);
const catalystQuality = ref(0);
const jewelRadiusLabel = ref('');
const requestedSocketCount = ref<number | undefined>(undefined);
const hasReadonlyCatalyst = computed(() => Boolean(props.itemToEdit?.catalyst));
const isCorrupted = ref(false);
const sourceBaseUnavailable = ref(false);

const isJewelCategory = computed(() => selectedCategory.value === 'Jewel');
const allowedRarities = computed(() => selectedBase.value?.allowedRarities?.length ? selectedBase.value.allowedRarities : ['RARE' as const]);
const craftOptions = ref<OfficialCraftOptions | null>(null);
const optionsLoading = ref(false);
const catalogLoading = ref(false);

function affixLimitFor(type: OfficialCraftMod['type'] | AffixKey): number {
  const key = type === 'Prefix' || type === 'prefixes' ? 'prefixes' : 'suffixes';
  return craftOptions.value?.affixLimits[key] ?? 0;
}

const selectedEssenceId = ref('');
// PoB's Main.defaultItemAffixQuality is 0.5; keep the same midpoint when a
// new essence is selected, while edits still load the source item's roll.
const essenceRoll = ref(0.5);
const selectedRunes = ref<string[]>([]);
const runeCapabilities = ref<{ socketCount: number; allowed: string[] } | null>(null);

const loading = ref(false);
const error = ref('');
const previewItem = ref<any>(null);
const optionsNonInheritedStates = ref<string[]>([]);
const previewNonInheritedStates = ref<string[]>([]);
const selectedTargetKey = ref('');
const initialTargetPending = ref(false);

const affixSearch = reactive<Record<AffixKey, string>>({ prefixes: '', suffixes: '' });
const selectedGroupKey = reactive<Record<AffixKey, string>>({ prefixes: '', suffixes: '' });
const draft = reactive<{ prefixes: Array<{ id: string; roll?: number }>; suffixes: Array<{ id: string; roll?: number }> }>({ prefixes: [], suffixes: [] });

const affixTypes: Array<{ key: AffixKey; label: string; type: OfficialCraftMod['type'] }> = [
  { key: 'prefixes', label: '前缀', type: 'Prefix' },
  { key: 'suffixes', label: '后缀', type: 'Suffix' },
];

const attributeOptions: Array<{ id: AttributeFilter; label: string }> = [
  { id: 'ALL', label: translateWebText('All') },
  { id: 'STR', label: translateWebText('Strength') },
  { id: 'DEX', label: translateWebText('Dexterity') },
  { id: 'INT', label: translateWebText('Intelligence') },
  { id: 'HYBRID', label: translateWebText('Hybrid Attribute') },
  { id: 'NONE', label: translateWebText('No Attribute') },
];

const minimumItemLevel = computed(() => selectedBase.value?.requiredItemLevel ?? 1);
const previewRawText = computed(() => previewItem.value?.raw ?? '');
const sourceItemId = computed(() => {
  const id = Number.parseInt(String(props.itemToEdit?.id ?? ''), 10);
  return Number.isInteger(id) && id > 0 ? id : undefined;
});
const craftAction = computed<'create' | 'edit' | 'duplicate' | null>(() => {
  const action = craftOptions.value?.action;
  return action === 'create' || action === 'edit' || action === 'duplicate' ? action : null;
});
const nonInheritedStates = computed(() => previewIsCurrent.value ? previewNonInheritedStates.value : optionsNonInheritedStates.value);

function readNonInheritedStates(data: unknown): string[] {
  const states = data && typeof data === 'object' ? (data as { nonInheritedStates?: unknown }).nonInheritedStates : undefined;
  return Array.isArray(states) ? states.filter((state): state is string => typeof state === 'string') : [];
}

function baseAttributeKind(base: OfficialCraftBase): AttributeFilter {
  const req = base.attributeRequirements ?? {};
  const count = ['str', 'dex', 'int'].filter(a => typeof req[a as keyof typeof req] === 'number' && (req[a as keyof typeof req] as number) > 0).length;
  if (count === 0) return 'NONE';
  if (count > 1) return 'HYBRID';
  if (typeof req.str === 'number' && req.str > 0) return 'STR';
  if (typeof req.dex === 'number' && req.dex > 0) return 'DEX';
  return 'INT';
}

const basesForCategory = computed(() => bases.value.filter(b => b.type === selectedCategory.value && (attributeFilter.value === 'ALL' || baseAttributeKind(b) === attributeFilter.value)));
const selectedBase = computed(() => basesForCategory.value.find(b => b.id === baseName.value) ?? basesForCategory.value[0]);

const availableEssences = computed(() => {
  return craftOptions.value?.essences ?? [];
});

const selectedEssence = computed(() => availableEssences.value.find(essence => essence.id === selectedEssenceId.value) ?? craftOptions.value?.selected.essence ?? null);
const selectedEssenceMod = computed(() => selectedEssence.value?.mod ?? null);

const selectedGroupNames = computed(() => {
  const groups = new Set<string>();
  for (const a of draft.prefixes) {
    const m = optionModFor(a.id);
    if (m) groups.add(m.group);
  }
  for (const a of draft.suffixes) {
    const m = optionModFor(a.id);
    if (m) groups.add(m.group);
  }
  if (selectedEssenceMod.value) {
    groups.add(selectedEssenceMod.value.group);
  }
  return groups;
});

const optionMods = computed(() => [
  ...(craftOptions.value?.prefixes ?? []),
  ...(craftOptions.value?.suffixes ?? []),
  ...(craftOptions.value?.selected.prefixes ?? []),
  ...(craftOptions.value?.selected.suffixes ?? []),
]);

function optionModFor(modId: string): OfficialCraftMod | undefined {
  return optionMods.value.find(mod => mod.id === modId);
}

function officialModLines(mod: OfficialCraftMod | null | undefined): string[] {
  return (mod?.lines ?? []).filter((line): line is string => typeof line === 'string').map(translateWebItemLine);
}

function officialModLabel(mod: OfficialCraftMod): string {
  return officialModLines(mod).join(' / ');
}

function officialTooltipTitle(item: any): string {
  const title = item?.tooltip?.header?.title;
  if (item?.rarity === 'RARE' && item?.crafted === true && typeof item?.title === 'string' && item.title.length > 0) return item.title;
  return typeof title === 'string' ? translateWebItemLine(title) : '';
}

function formatRoll(value: number | undefined): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 12 }).format(value ?? 0);
}

function getAffixGroupsForType(type: 'Prefix' | 'Suffix') {
  const eligibleMods = type === 'Prefix' ? craftOptions.value?.prefixes ?? [] : craftOptions.value?.suffixes ?? [];

  const groupMap = new Map<string, OfficialCraftMod[]>();
  for (const mod of eligibleMods) {
    const list = groupMap.get(mod.group) || [];
    list.push(mod);
    groupMap.set(mod.group, list);
  }

  const result = [];
  for (const [groupKey, tierList] of groupMap.entries()) {
    const sampleMod = tierList[0];
    const translatedName = officialModLabel(sampleMod);
    result.push({
      key: groupKey,
      displayName: translatedName,
      tiers: tierList,
      sampleMod,
    });
  }
  return result;
}

function filteredAffixGroups(type: 'Prefix' | 'Suffix', searchKw: string) {
  const groups = getAffixGroupsForType(type);
  const used = selectedGroupNames.value;
  const kw = searchKw.trim().toLowerCase();
  return groups.filter(g => {
    if (used.has(g.key)) return false;
    if (!kw) return true;
    return g.displayName.toLowerCase().includes(kw) || g.key.toLowerCase().includes(kw) || g.tiers.some(t => t.lines.some(l => l.toLowerCase().includes(kw)));
  });
}

function addAffixByGroup(key: AffixKey) {
  const groupKey = selectedGroupKey[key];
  if (!craftOptions.value || !groupKey || selectedGroupNames.value.has(groupKey) || affixCount(key) >= affixLimitFor(key)) return;
  const groups = getAffixGroupsForType(key === 'prefixes' ? 'Prefix' : 'Suffix');
  const group = groups.find(g => g.key === groupKey);
  if (!group || group.tiers.length === 0) return;
  const bestMod = group.tiers[0];
  // New ranged affixes start at PoB's normalized midpoint. The presence of
  // the official range metadata, rather than display-text parsing, controls
  // whether the roll slider is rendered.
  draft[key].push({ id: bestMod.id, roll: bestMod.range ? 0.5 : undefined });
  selectedGroupKey[key] = '';
}

function getSiblingTiers(modId: string) {
  return craftOptions.value?.tierOptions[modId] ?? [];
}

function switchAffixTier(key: AffixKey, index: number, newModId: string) {
  if (draft[key][index]) {
    draft[key][index].id = newModId;
  }
}

function affixCount(type: OfficialCraftMod['type'] | AffixKey): number {
  const key = type === 'Prefix' || type === 'prefixes' ? 'prefixes' : 'suffixes';
  return craftOptions.value?.affixCounts?.[key] ?? draft[key].length;
}

const target = computed<Target>(() => {
  if (!selectedTargetKey.value) return null;
  const [kind, ...rest] = selectedTargetKey.value.split(':');
  if (kind === 'equipment') {
    const itemSetId = store.loadouts?.active?.itemSetId;
    const slotName = rest.join(':');
    return Number.isInteger(itemSetId) && slotName ? { kind: 'equipment', itemSetId, slotName } : null;
  }
  if (kind === 'jewel') {
    const specId = store.loadouts?.active?.specId;
    const slot = targetJewelSlots.value.find(entry => `jewel:${entry.nodeId}` === selectedTargetKey.value);
    return Number.isInteger(specId) && slot ? { kind: 'jewel', specId, nodeId: slot.nodeId } : null;
  }
  return null;
});

const targetEquipmentSlots = computed(() => {
  if (!Number.isInteger(store.loadouts?.active?.itemSetId)) return [];
  const slots = [
    ...(craftOptions.value?.validTargetSlots?.equipment ?? []),
    ...(craftOptions.value?.validTargetSlots?.equipmentJewels ?? []),
  ];
  return [...new Set(slots)];
});
const targetJewelSlots = computed(() => {
  if (!Number.isInteger(store.loadouts?.active?.specId)) return [];
  return craftOptions.value?.validTargetSlots?.jewels ?? [];
});

function targetKeyFor(value: Target | null | undefined) {
  if (!value) return '';
  if (value.kind === 'jewel') return `jewel:${value.nodeId}`;
  return `equipment:${value.slotName}`;
}

function reconcileTargetSelection() {
  const key = selectedTargetKey.value;
  const valid = new Set(targetEquipmentSlots.value.map(slot => `equipment:${slot}`));
  for (const slot of targetJewelSlots.value) valid.add(`jewel:${slot.nodeId}`);
  if (key && valid.has(key)) {
    initialTargetPending.value = false;
    return;
  }
  selectedTargetKey.value = '';
  if (!initialTargetPending.value) return;
  initialTargetPending.value = false;
  const initialKey = targetKeyFor(props.initialTarget);
  selectedTargetKey.value = initialKey && valid.has(initialKey) ? initialKey : '';
}

const draftPayload = computed<Record<string, unknown>>(() => {
  const base = selectedBase.value;
  const payload: Record<string, unknown> = {
    rarity: rarity.value,
    baseName: base?.id || '',
    itemLevel: itemLevel.value,
    quality: isJewelCategory.value ? 0 : quality.value,
    prefixes: draft.prefixes.map(p => ({ id: p.id, roll: p.roll })),
    suffixes: draft.suffixes.map(s => ({ id: s.id, roll: s.roll })),
  };
  if (rarity.value === 'RARE' && itemTitle.value.trim()) payload.title = itemTitle.value.trim();

  if (base?.variantList?.length) {
    payload.variant = selectedVariantIndex.value;
  }
  if (implicitRanges.value.length > 0) {
    payload.implicitRanges = implicitRanges.value.map(range => ({ index: range.index, roll: range.roll }));
  }

  if (jewelRadiusLabel.value) payload.jewelRadiusLabel = jewelRadiusLabel.value;

  if (selectedEssenceId.value) {
    payload.essence = { id: selectedEssenceId.value, roll: essenceRoll.value };
  }

  if (!isJewelCategory.value && requestedSocketCount.value !== undefined) {
    payload.socketCount = requestedSocketCount.value;
  }

  if (!isJewelCategory.value && selectedRunes.value.length > 0) {
    payload.runes = [...selectedRunes.value];
  }

  if (isCorrupted.value) {
    payload.corrupted = true;
  }

  if (catalyst.value > 0) {
    payload.catalyst = catalyst.value;
    payload.catalystQuality = catalystQuality.value;
  }

  return payload;
});

const draftValidationError = computed(() => {
  if (catalogLoading.value) return '正在读取当前 PoB 官方底材目录。';
  if (sourceBaseUnavailable.value) return '此物品的官方底材不在当前可制作目录中，不能创建副本。';
  const base = selectedBase.value;
  if (!base) return '请选择官方底材。';
  if (itemLevel.value < base.requiredItemLevel) return `物品等级至少需要 ${base.requiredItemLevel}。`;
  if (optionsLoading.value) return '正在读取当前草案的官方制作选项。';
  if (!craftOptions.value) return '未获得官方制作选项，不能提交草案。';
  return '';
});

const officialOptionsInput = computed(() => ({
  sourceItemId: sourceItemId.value,
  baseName: selectedBase.value?.id ?? '',
  itemLevel: itemLevel.value,
  rarity: rarity.value,
  corrupted: isCorrupted.value,
  draft: {
    title: rarity.value === 'RARE' && itemTitle.value.trim() ? itemTitle.value.trim() : undefined,
    quality: quality.value,
    catalyst: catalyst.value > 0 ? catalyst.value : undefined,
    catalystQuality: catalyst.value > 0 ? catalystQuality.value : undefined,
    prefixes: draft.prefixes.map(affix => ({ id: affix.id, roll: affix.roll })),
    suffixes: draft.suffixes.map(affix => ({ id: affix.id, roll: affix.roll })),
    essence: selectedEssenceId.value ? { id: selectedEssenceId.value, roll: essenceRoll.value } : undefined,
    variant: selectedBase.value?.variantList?.length ? selectedVariantIndex.value : undefined,
    implicitRanges: implicitRanges.value.map(range => ({ index: range.index, roll: range.roll })),
    jewelRadiusLabel: jewelRadiusLabel.value || undefined,
    socketCount: requestedSocketCount.value,
    runes: selectedRunes.value.length > 0 ? [...selectedRunes.value] : undefined,
  },
}));
// ROLL values only affect the previewed item. Keep them out of the options
// refresh key so dragging a slider does not repeatedly clear the official
// capabilities and show transient loading states.
const officialOptionsFingerprint = computed(() => {
  const input = officialOptionsInput.value;
  return JSON.stringify({
    ...input,
    draft: {
      ...input.draft,
      prefixes: draft.prefixes.map(affix => ({ id: affix.id })),
      suffixes: draft.suffixes.map(affix => ({ id: affix.id })),
      essence: selectedEssenceId.value ? { id: selectedEssenceId.value } : undefined,
      implicitRanges: implicitRanges.value.map(range => ({ index: range.index })),
    },
  });
});
const previewFingerprint = computed(() => JSON.stringify(draftPayload.value));
const previewKey = ref('');
const previewIsCurrent = computed(() => previewItem.value !== null && previewKey.value === previewFingerprint.value);
let officialOptionsRequest = 0;
let optionsRefreshTimer: ReturnType<typeof setTimeout> | undefined;

async function refreshOfficialCatalog(): Promise<boolean> {
  catalogLoading.value = true;
  const result = await store.getOfficialCraftCatalog();
  catalogLoading.value = false;
  if (!result.success || !Array.isArray(result.data?.bases)) {
    catalog.value = [];
    error.value = result.error?.message ?? '无法读取当前底材的官方制作目录。';
    return false;
  }
  catalog.value = result.data.bases as OfficialCraftBase[];
  if (props.itemToEdit) {
    const matching = catalog.value.find(base => base.id === props.itemToEdit?.base);
    if (matching) {
      sourceBaseUnavailable.value = false;
      selectedCategory.value = matching.type;
      baseName.value = matching.id;
    }
  }
  if (!selectedCategory.value || !categories.value.includes(selectedCategory.value)) {
    selectedCategory.value = categories.value[0] ?? '';
  }
  return true;
}

function reconcileOfficialRunes(capabilities: { socketCount: number; allowed: string[] }) {
  const previous = selectedRunes.value;
  const emptyRune = capabilities.allowed.includes('None') ? 'None' : '';
  selectedRunes.value = Array.from({ length: capabilities.socketCount }, (_, index) => {
    const existing = previous[index];
    return typeof existing === 'string' && capabilities.allowed.includes(existing) ? existing : emptyRune;
  });
}

async function refreshOfficialOptions(): Promise<boolean> {
  const requestId = ++officialOptionsRequest;
  const input = officialOptionsInput.value;
  if (!input.baseName) {
    craftOptions.value = null;
    runeCapabilities.value = null;
    optionsNonInheritedStates.value = [];
    optionsLoading.value = false;
    return false;
  }
  optionsLoading.value = true;
  const result = await store.getOfficialCraftOptions(input);
  if (requestId !== officialOptionsRequest) return false;
  optionsLoading.value = false;
  if (!result.success || !result.data) {
    craftOptions.value = null;
    runeCapabilities.value = null;
    optionsNonInheritedStates.value = [];
    error.value = result.error?.message ?? '无法读取当前底材的官方制作选项。';
    return false;
  }
  const options = result.data as OfficialCraftOptions;
  craftOptions.value = options;
  optionsNonInheritedStates.value = readNonInheritedStates(options);
  implicitRanges.value = Array.isArray(options.implicitRanges)
    ? options.implicitRanges.filter(range => Number.isInteger(range.index) && typeof range.roll === 'number')
    : [];
  runeCapabilities.value = options.runeCapabilities;
  reconcileTargetSelection();
  if (catalyst.value === 0 && options.catalyst) catalyst.value = options.catalyst.value ?? 0;
  if (catalystQuality.value === 0 && options.catalyst) catalystQuality.value = options.catalyst.quality ?? 0;
  reconcileOfficialRunes(options.runeCapabilities);
  error.value = '';
  return true;
}

function scheduleOfficialOptionsRefresh() {
  if (optionsRefreshTimer) clearTimeout(optionsRefreshTimer);
  optionsRefreshTimer = setTimeout(() => {
    optionsRefreshTimer = undefined;
    void refreshOfficialOptions();
  }, 120);
}

async function copyRawText() {
  try {
    await navigator.clipboard.writeText(previewRawText.value);
    copiedNotice.value = true;
    setTimeout(() => {
      copiedNotice.value = false;
    }, 2000);
  } catch {}
}

function essenceLabel(essence: OfficialCraftEssence) {
  return `${translateWebItemName(essence.name)} (${translateWebText(essence.type)})`;
}

function closeStudio() {
  emit('close');
}

async function preview() {
  if (draftValidationError.value) return;
  const action = craftAction.value;
  if (!action) return;
  const requestFingerprint = previewFingerprint.value;
  const requestedDraft = draftPayload.value;
  loading.value = true;
  error.value = '';
  try {
    const result = await store.previewOfficialCraft(action, target.value, requestedDraft, sourceItemId.value);
    if (!result.success || !result.data?.item) throw new Error(result.error?.message ?? '官方制作预览失败');
    if (requestFingerprint !== previewFingerprint.value) return;
    previewItem.value = result.data.item;
    previewNonInheritedStates.value = readNonInheritedStates(result.data);
    previewKey.value = requestFingerprint;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '制作预览失败';
  } finally {
    loading.value = false;
  }
}

async function commit() {
  if (draftValidationError.value || !previewIsCurrent.value) return;
  const action = craftAction.value;
  if (!action) return;
  loading.value = true;
  error.value = '';
  try {
    const result = await store.commitOfficialCraft(action, target.value, draftPayload.value, sourceItemId.value);
    if (!result.success) throw new Error(result.error?.message ?? '制作保存失败');
    emit('created', result.data?.item?.id);
    closeStudio();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '制作保存失败';
  } finally {
    loading.value = false;
  }
}

let preserveNextBaseDraft = false;

function clearCraftSelections() {
  draft.prefixes = [];
  draft.suffixes = [];
  selectedEssenceId.value = '';
  essenceRoll.value = 0.5;
  selectedRunes.value = [];
  implicitRanges.value = [];
  requestedSocketCount.value = undefined;
  jewelRadiusLabel.value = '';
  catalyst.value = 0;
  catalystQuality.value = 0;
  selectedGroupKey.prefixes = '';
  selectedGroupKey.suffixes = '';
}

watch(() => props.isOpen, async open => {
  if (!open) return;
  // The source base can arrive only after the asynchronous official catalog.
  // Keep its structured draft intact until that catalog has selected the base.
  preserveNextBaseDraft = Boolean(props.itemToEdit);
  error.value = '';
  previewItem.value = null;
  optionsNonInheritedStates.value = [];
  previewNonInheritedStates.value = [];
  craftOptions.value = null;
  runeCapabilities.value = null;
  sourceBaseUnavailable.value = false;
  selectedTargetKey.value = '';
  initialTargetPending.value = true;
  if (props.initialCategory) selectedCategory.value = props.initialCategory;
  if (!props.itemToEdit) {
    clearCraftSelections();
    isCorrupted.value = false;
    selectedVariantIndex.value = 1;
    itemTitle.value = '';
  } else {
    const item = props.itemToEdit;
    const matchingBase = bases.value.find(base => base.id === item.base);
    preserveNextBaseDraft = true;
    if (matchingBase) {
      selectedCategory.value = matchingBase.type;
      baseName.value = matchingBase.id;
    } else {
      sourceBaseUnavailable.value = true;
    }
    itemLevel.value = item.itemLevel ?? 1;
    itemTitle.value = item.title ?? '';
    quality.value = item.quality ?? 0;
    catalyst.value = item.catalyst ?? 0;
    catalystQuality.value = item.catalystQuality ?? 0;
    jewelRadiusLabel.value = typeof item.jewelRadiusLabel === 'string' ? item.jewelRadiusLabel : '';
    requestedSocketCount.value = Number.isInteger(item.socketCount) ? item.socketCount : undefined;
    implicitRanges.value = Array.isArray(item.implicitRanges)
      ? item.implicitRanges.filter((range: any) => range && Number.isInteger(range.index) && typeof range.roll === 'number')
      : [];
    isCorrupted.value = item.corrupted === true;
    const editedRarity = item.rarity === 'UNIQUE' ? 'RARE' : item.rarity;
    rarity.value = allowedRarities.value.includes(editedRarity) ? editedRarity : 'RARE';
    selectedVariantIndex.value = item.variant || 1;
    if (item.rarity === 'UNIQUE') {
      clearCraftSelections();
    } else {
      draft.prefixes = (item.prefixes || []).filter((affix: any) => affix.essence !== true).map((affix: any) => ({ id: affix.id, roll: affix.roll }));
      draft.suffixes = (item.suffixes || []).filter((affix: any) => affix.essence !== true).map((affix: any) => ({ id: affix.id, roll: affix.roll }));
      selectedEssenceId.value = item.essence?.id ?? '';
      essenceRoll.value = item.essence?.roll ?? 0;
      selectedRunes.value = Array.isArray(item.runes) ? [...item.runes] : [];
    }
  }
  try {
    await nextTick();
    if (!props.itemToEdit) itemLevel.value = defaultCraftItemLevel;
    if (await refreshOfficialCatalog()) {
      if (await refreshOfficialOptions()) await preview();
    }
  } finally {
    preserveNextBaseDraft = false;
  }
}, { immediate: true });

watch(() => basesForCategory.value, list => {
  if (list.length > 0 && !list.some(b => b.id === baseName.value)) {
    baseName.value = list[0].id;
  }
}, { immediate: true });

watch(() => baseName.value, (nextBaseName, previousBaseName) => {
  if (!nextBaseName || nextBaseName === previousBaseName) return;
  if (!preserveNextBaseDraft) {
    if (!previousBaseName) itemLevel.value = defaultCraftItemLevel;
    selectedVariantIndex.value = 1;
    if (previousBaseName) clearCraftSelections();
  }
});

watch(allowedRarities, () => {
  if (!allowedRarities.value.includes(rarity.value)) rarity.value = allowedRarities.value[0] ?? 'RARE';
});

watch(officialOptionsFingerprint, () => {
  if (!props.isOpen) return;
  craftOptions.value = null;
  runeCapabilities.value = null;
  optionsNonInheritedStates.value = [];
  scheduleOfficialOptionsRefresh();
});

watch([targetEquipmentSlots, targetJewelSlots], reconcileTargetSelection);

watch(previewFingerprint, () => {
  if (props.isOpen) {
    previewItem.value = null;
    previewKey.value = '';
    previewNonInheritedStates.value = [];
  }
});
</script>

<style scoped>
.craft-roll-slider {
  appearance: none;
  width: 100%;
  height: 1rem;
  margin: 0;
  background: transparent;
  cursor: ew-resize;
}

.craft-roll-slider::-webkit-slider-runnable-track {
  height: 0.375rem;
  border: 1px solid rgb(120 53 15 / 0.9);
  border-radius: 9999px;
  background: rgb(17 24 39 / 0.95);
}

.craft-roll-slider::-webkit-slider-thumb {
  appearance: none;
  width: 1rem;
  height: 1rem;
  margin-top: -0.375rem;
  border: 2px solid rgb(253 230 138);
  border-radius: 9999px;
  background: rgb(245 158 11);
  box-shadow: 0 0 0 2px rgb(245 158 11 / 0.2);
}

.craft-roll-slider::-moz-range-track {
  height: 0.375rem;
  border: 1px solid rgb(120 53 15 / 0.9);
  border-radius: 9999px;
  background: rgb(17 24 39 / 0.95);
}

.craft-roll-slider::-moz-range-thumb {
  width: 1rem;
  height: 1rem;
  border: 2px solid rgb(253 230 138);
  border-radius: 9999px;
  background: rgb(245 158 11);
  box-shadow: 0 0 0 2px rgb(245 158 11 / 0.2);
}

.craft-roll-slider-violet::-webkit-slider-runnable-track {
  border-color: rgb(139 92 246 / 0.9);
}

.craft-roll-slider-violet::-webkit-slider-thumb,
.craft-roll-slider-violet::-moz-range-thumb {
  border-color: rgb(221 214 254);
  background: rgb(139 92 246);
  box-shadow: 0 0 0 2px rgb(139 92 246 / 0.2);
}

.craft-roll-slider-violet::-moz-range-track {
  border-color: rgb(139 92 246 / 0.9);
}

.craft-roll-slider:focus-visible {
  outline: 2px solid rgb(251 191 36);
  outline-offset: 2px;
}
</style>
