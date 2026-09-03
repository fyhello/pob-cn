<template>
  <div class="p-8 flex-1 overflow-y-auto bg-black/95 select-none relative">
    <div class="max-w-7xl mx-auto space-y-6">
      <!-- 装备面板顶部标题与快捷操作 -->
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-poe-gold font-poe-title flex items-center space-x-2">
            <Shield class="w-5 h-5 text-poe-gold" />
            <span>角色装备槽位与物品库</span>
          </h2>
          <p class="text-xs text-gray-400 mt-1">
            点击任意槽位直接弹出可选装备列表 · 选中装备在右侧微调试算 · 顶部独立制作工坊从零打造
          </p>
        </div>

        <div class="flex items-center space-x-3">
          <button 
            @click="openNewCraftStudio"
            @mouseenter="warmCraftingStudio"
            class="px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white rounded-xl font-bold text-xs shadow-lg shadow-amber-950/50 flex items-center space-x-1.5 transition-all transform hover:-translate-y-0.5"
          >
            <Hammer class="w-4 h-4 text-amber-200" />
            <span>🔨 装备与珠宝制作工坊</span>
          </button>
        </div>
      </div>

      <!-- 操作提示 Toast 通知 -->
      <div 
        v-if="toastNotice.text" 
        :class="[
          'p-3 rounded-xl border text-xs flex items-center justify-between transition-all shadow-xl animate-fade-in',
          toastNotice.type === 'warn' 
            ? 'bg-amber-950/90 border-amber-500 text-amber-200' 
            : 'bg-emerald-950/90 border-emerald-500 text-emerald-200'
        ]"
      >
        <div class="flex items-center space-x-2">
          <Info class="w-4 h-4 shrink-0" />
          <span>{{ toastNotice.text }}</span>
        </div>
        <button @click="toastNotice.text = ''" class="p-0.5 hover:bg-white/10 rounded">
          <X class="w-3.5 h-3.5" />
        </button>
      </div>

      <div class="grid grid-cols-12 gap-6 items-start">
        <!-- 左侧：官方装备槽位 + 药剂/护符栏 + 星盘珠宝插槽 (4列) -->
        <div class="col-span-4 space-y-4 max-h-[calc(100vh-140px)] overflow-y-auto pr-1">
          <!-- 1. 角色基础装备槽 -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between pb-1 px-1">
              <span class="text-xs font-bold text-gray-400">角色装备槽位</span>
              <span class="text-[10px] text-poe-gold font-mono">{{ equippedSlotsCount }} / {{ equipmentSlots.length }} 已装配</span>
            </div>

            <div 
              v-for="slot in equipmentSlots" 
              :key="slot.id"
              @mouseenter="onHoverItem(store.equippedItems[slot.id], $event)"
              @mousemove="onMouseMove($event)"
              @mouseleave="onMouseLeave"
              @click="selectSlotItem(slot.id)"
              :class="[
                'p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between group',
                selectedLibraryItem && store.equippedItems[slot.id] && selectedLibraryItem.id === store.equippedItems[slot.id].id
                  ? 'bg-amber-950/40 border-amber-500 shadow-lg ring-1 ring-amber-500/50'
                  : (selectedSlot === slot.id 
                    ? 'bg-poe-gold/15 border-poe-gold shadow-lg ring-1 ring-poe-gold/50' 
                    : 'bg-black/60 border-poe-border/80 hover:border-poe-gold/50 hover:bg-white/5')
              ]"
            >
              <div class="flex items-center space-x-2.5 truncate">
                <div 
                  :class="[
                    'w-7 h-7 rounded-lg border flex items-center justify-center text-[10px] font-mono font-bold shrink-0',
                    store.equippedItems[slot.id] ? 'bg-amber-950/50 border-amber-500/60 text-amber-300 shadow-sm' : 'bg-black/80 border-poe-border text-gray-500'
                  ]"
                >
                  {{ slot.short }}
                </div>
                <div class="truncate">
                  <div class="text-[10px] font-semibold text-gray-400 flex items-center space-x-1.5">
                    <span>{{ slot.name }}</span>
                    <span v-if="store.equippedItems[slot.id]" class="text-[9px] text-emerald-400 font-normal">已装配</span>
                    <span v-else class="text-[9px] text-gray-500 font-normal">空槽位</span>
                  </div>
                  <div 
                    :class="[
                      'text-xs font-bold mt-0.5 truncate',
                      store.equippedItems[slot.id] ? 'text-poe-unique' : 'text-gray-600 italic'
                    ]"
                  >
                    {{ store.equippedItems[slot.id] ? (store.equippedItems[slot.id].name_cn || store.equippedItems[slot.id].name) : '未装备 (点击右侧装备)' }}
                  </div>
                </div>
              </div>

              <!-- 槽位操作区 -->
              <div class="flex items-center space-x-1.5 shrink-0 ml-2">
                <button 
                  v-if="store.equippedItems[slot.id]"
                  @click.stop="openStudioWithItem(store.equippedItems[slot.id])"
                  class="px-2.5 py-1 bg-amber-600/25 hover:bg-amber-600 border border-amber-500/50 hover:border-amber-400 rounded-lg text-amber-300 hover:text-white text-xs font-semibold transition-all shadow-sm flex items-center space-x-1"
                  title="以此物品底材创建官方结构化副本"
                >
                  <span>✏️ 修改</span>
                </button>
                <button 
                  v-if="store.equippedItems[slot.id]"
                  @click.stop="unequipEquipment(slot.id)"
                  class="px-2.5 py-1 bg-red-950/40 hover:bg-red-900 border border-red-800/60 hover:border-red-600 rounded-lg text-red-300 hover:text-white text-xs font-semibold transition-all shadow-sm"
                  title="卸下此装备 (保留在流派物品库中)"
                >
                  <span>卸下</span>
                </button>
                <button 
                  @click.stop="openSlotPicker(slot.id)" 
                  class="px-3 py-1 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 border border-amber-400/60 text-white rounded-lg text-xs font-bold transition-all shadow-md active:scale-95"
                  title="打开可选装备选择框"
                >
                  <span>{{ store.equippedItems[slot.id] ? '更换' : '装备' }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- 2. 星盘已分配的珠宝插槽 -->
          <div class="space-y-1.5 pt-2 border-t border-white/10">
            <div class="flex items-center justify-between pb-1 px-1">
              <span class="text-xs font-bold text-amber-400 flex items-center space-x-1">
                <Sparkles class="w-3.5 h-3.5 text-amber-400" />
                <span>星盘珠宝插槽</span>
              </span>
              <span class="text-[10px] text-amber-300 font-mono">{{ activeJewelSockets.length }} 个已激活</span>
            </div>

            <div v-if="activeJewelSockets.length > 0" class="space-y-1.5">
              <div 
                v-for="socketNode in activeJewelSockets" 
                :key="socketNode.id"
                @mouseenter="onHoverItem(store.equippedJewels[socketNode.id], $event)"
                @mousemove="onMouseMove($event)"
                @mouseleave="onMouseLeave"
                @click="selectJewelSlot(socketNode.id)"
                :class="[
                  'p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between group',
                  selectedJewelNode === socketNode.id 
                    ? 'bg-amber-950/30 border-amber-500 shadow-md ring-1 ring-amber-500/50' 
                    : 'bg-black/60 border-amber-950/40 hover:border-amber-500/40 hover:bg-white/5'
                ]"
              >
                <div class="flex items-center space-x-2.5 truncate">
                  <div class="w-7 h-7 rounded-lg border bg-amber-950/60 border-amber-600/50 flex items-center justify-center text-[10px] font-mono font-bold text-amber-300 shrink-0">
                    宝
                  </div>
                  <div class="truncate">
                    <div class="text-[10px] font-semibold text-amber-400/80">
                      星盘插槽 #{{ socketNode.id }} ({{ socketNode.name_cn || socketNode.name || '珠宝插槽' }})
                    </div>
                    <div 
                      :class="[
                        'text-xs font-bold mt-0.5 truncate',
                        store.equippedJewels[socketNode.id] ? 'text-amber-200' : 'text-gray-600 italic'
                      ]"
                    >
                      {{ store.equippedJewels[socketNode.id] ? (store.equippedJewels[socketNode.id].name_cn || store.equippedJewels[socketNode.id].name) : '未镶嵌珠宝 (点击右侧镶嵌)' }}
                    </div>
                  </div>
                </div>

                <div class="flex items-center space-x-1.5 shrink-0 ml-2">
                  <button
                    v-if="store.equippedJewels[socketNode.id]"
                    @click.stop="unequipJewel(socketNode.id)"
                    class="px-2.5 py-1 bg-red-950/40 hover:bg-red-900 border border-red-800/60 hover:border-red-600 rounded-lg text-red-300 hover:text-white text-xs font-semibold transition-all shadow-sm"
                    title="拔出此珠宝 (保留在物品库中)"
                  >
                    <span>拔出</span>
                  </button>
                  <button
                    @click.stop="openJewelCrafting(socketNode.id)"
                    class="px-2.5 py-1 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-500/40 hover:border-amber-400 rounded-lg text-amber-300 hover:text-white text-xs font-semibold transition-all shadow-sm flex items-center gap-1"
                    title="在此插槽制作全新珠宝并自动镶嵌"
                  >
                    <span>制作</span>
                  </button>
                  <button 
                    @click.stop="openJewelPicker(socketNode.id)" 
                    class="px-3 py-1 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 border border-amber-400/60 text-white rounded-lg text-xs font-bold transition-all shadow-md active:scale-95"
                  >
                    <span>{{ store.equippedJewels[socketNode.id] ? '更换' : '镶嵌' }}</span>
                  </button>
                </div>
              </div>
            </div>

            <div v-else class="p-3 bg-black/40 border border-poe-border/40 rounded-xl text-center text-gray-500 text-xs">
              天赋星盘上尚未点亮珠宝插槽节点
            </div>
          </div>

          <!-- 3. 药剂与护符槽位 -->
          <div class="space-y-1.5 pt-2 border-t border-white/10">
            <div class="flex items-center justify-between pb-1 px-1">
              <span class="text-xs font-bold text-emerald-400 flex items-center space-x-1">
                <span>🧪 药剂与护符槽位</span>
              </span>
            </div>

            <div class="space-y-1.5">
              <div 
                v-for="slot in flaskSlots" 
                :key="slot.id"
                @mouseenter="onHoverItem(store.equippedItems[slot.id], $event)"
                @mousemove="onMouseMove($event)"
                @mouseleave="onMouseLeave"
                @click="selectSlotItem(slot.id)"
                :class="[
                  'p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between group',
                  selectedSlot === slot.id 
                    ? 'bg-emerald-950/40 border-emerald-500 shadow-md ring-1 ring-emerald-500/50' 
                    : 'bg-black/60 border-emerald-950/40 hover:border-emerald-500/40 hover:bg-white/5'
                ]"
              >
                <div class="flex items-center space-x-2.5 truncate">
                  <div class="w-7 h-7 rounded-lg border bg-emerald-950/60 border-emerald-600/50 flex items-center justify-center text-xs font-bold text-emerald-400 shrink-0">
                    🧪
                  </div>
                  <div class="truncate">
                    <div class="text-[10px] font-semibold text-emerald-400/80 flex items-center space-x-1.5">
                      <span>{{ slot.name }}</span>
                      <span v-if="store.equippedItems[slot.id]" class="text-[9px] text-emerald-300 font-normal">已装配</span>
                      <span v-else class="text-[9px] text-gray-500 font-normal">空槽位</span>
                    </div>
                    <div 
                      :class="[
                        'text-xs font-bold mt-0.5 truncate',
                        store.equippedItems[slot.id] ? 'text-emerald-200' : 'text-gray-600 italic'
                      ]"
                    >
                      {{ store.equippedItems[slot.id] ? (store.equippedItems[slot.id].name_cn || store.equippedItems[slot.id].name) : '未装配药剂/护符 (点击装配)' }}
                    </div>
                  </div>
                </div>

                <div class="flex items-center space-x-1.5 shrink-0 ml-2">
                  <button 
                    v-if="store.equippedItems[slot.id]"
                    @click.stop="openStudioWithItem(store.equippedItems[slot.id])"
                    class="px-2.5 py-1 bg-amber-600/25 hover:bg-amber-600 border border-amber-500/50 hover:border-amber-400 rounded-lg text-amber-300 hover:text-white text-xs font-semibold transition-all shadow-sm flex items-center space-x-1"
                    title="以此物品底材创建官方结构化副本"
                  >
                    <span>✏️ 修改</span>
                  </button>
                  <button 
                    v-if="store.equippedItems[slot.id]"
                    @click.stop="unequipEquipment(slot.id)"
                    class="px-2.5 py-1 bg-red-950/40 hover:bg-red-900 border border-red-800/60 hover:border-red-600 rounded-lg text-red-300 hover:text-white text-xs font-semibold transition-all shadow-sm"
                    title="卸下此药剂 (保留在流派物品库中)"
                  >
                    <span>卸下</span>
                  </button>
                  <button 
                    @click.stop="openSlotPicker(slot.id)" 
                    class="px-3 py-1 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 border border-emerald-400/60 text-white rounded-lg text-xs font-bold transition-all shadow-md active:scale-95"
                    title="打开可选药剂选择框"
                  >
                    <span>{{ store.equippedItems[slot.id] ? '更换' : '装配' }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 中间：流派物品与珠宝总库 (4列) -->
        <div class="col-span-4 space-y-3">
          <div class="glass-panel p-4 rounded-2xl border border-poe-border/80 shadow-xl flex flex-col h-[600px]">
            <div class="flex items-center justify-between border-b border-white/10 pb-2.5">
              <div>
                <h4 class="font-bold text-xs text-poe-gold font-poe-title">流派物品与珠宝总库</h4>
                <div class="text-[10px] text-gray-400">当前流派拥有的全部装备、珠宝与药剂清单</div>
              </div>
              <span class="text-xs text-poe-gold font-mono">{{ store.itemLibrary.length }} 件</span>
            </div>

            <!-- 分类筛选 Tab (5 分类：匹配槽位 / 全部 / 装备 / 珠宝 / 药剂) -->
            <div class="flex flex-wrap gap-1 bg-black/40 p-1 rounded-lg border border-poe-border/60 text-xs my-2">
              <button 
                @click="invFilter = 'SLOT'"
                :class="['flex-1 py-1 px-1.5 rounded font-medium transition-all text-center text-[11px]', invFilter === 'SLOT' ? 'bg-cyan-600 text-white font-bold' : 'text-gray-400 hover:text-white']"
                :title="`仅显示匹配当前选定槽位 (${getSlotName(selectedSlot)}) 的物品`"
              >
                匹配当前槽位 ({{ slotMatchCount }})
              </button>
              <button 
                @click="invFilter = 'ALL'"
                :class="['py-1 px-2 rounded font-medium transition-all text-center text-[11px]', invFilter === 'ALL' ? 'bg-poe-gold text-black font-bold' : 'text-gray-400 hover:text-white']"
              >
                全部 ({{ store.itemLibrary.length }})
              </button>
              <button 
                @click="invFilter = 'EQUIP'"
                :class="['py-1 px-2 rounded font-medium transition-all text-center text-[11px]', invFilter === 'EQUIP' ? 'bg-poe-gold text-black font-bold' : 'text-gray-400 hover:text-white']"
              >
                装备 ({{ equipCount }})
              </button>
              <button 
                @click="invFilter = 'JEWEL'"
                :class="['py-1 px-2 rounded font-medium transition-all text-center text-[11px]', invFilter === 'JEWEL' ? 'bg-amber-600 text-white font-bold' : 'text-gray-400 hover:text-white']"
              >
                珠宝 ({{ jewelCount }})
              </button>
              <button 
                @click="invFilter = 'FLASK'"
                :class="['py-1 px-2 rounded font-medium transition-all text-center text-[11px]', invFilter === 'FLASK' ? 'bg-emerald-700 text-white font-bold' : 'text-gray-400 hover:text-white']"
              >
                药剂 ({{ flaskCount }})
              </button>
            </div>

            <!-- 物品列表 -->
            <div class="flex-1 overflow-y-auto space-y-2 pr-1">
              <div 
                v-for="item in filteredInventory" 
                :key="item.id"
                @mouseenter="onHoverItem(item, $event)"
                @mousemove="onMouseMove($event)"
                @mouseleave="onMouseLeave"
                @click="selectedLibraryItem = item"
                :class="[
                  'p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between group',
                  selectedLibraryItem && selectedLibraryItem.id === item.id 
                    ? 'bg-amber-950/40 border-amber-500 shadow-md ring-1 ring-amber-500/50' 
                    : 'bg-black/40 border-poe-border/80 hover:border-poe-gold hover:bg-white/5'
                ]"
              >
                <div class="flex-1 min-w-0 truncate mr-2">
                  <div class="font-bold text-xs text-poe-unique truncate">
                    {{ item.name_cn || item.name }}
                  </div>
                  <div class="text-[10px] text-gray-400 font-mono mt-0.5 truncate flex items-center space-x-1.5">
                    <span>{{ item.base_cn || item.base || item.type }}</span>
                    <span v-if="getItemEquippedStatus(item)" class="text-emerald-400">
                      ● {{ getItemEquippedStatus(item) }}
                    </span>
                    <span v-else class="text-gray-500">
                      ○ 闲置 (未穿戴)
                    </span>
                  </div>
                </div>

                <div class="flex items-center space-x-1.5 shrink-0">
                  <button 
                    v-if="!isJewelItem(item)"
                    @click.stop="assignItemToActiveTarget(item)"
                    :class="[
                      'px-2.5 py-1 text-xs font-bold rounded-lg transition-all shadow-sm',
                      getItemEquippedStatus(item) 
                        ? 'bg-white/10 hover:bg-white/20 text-gray-300' 
                        : 'btn-primary'
                    ]"
                  >
                    <span>{{ getItemEquippedStatus(item) ? '换槽' : '穿戴' }}</span>
                  </button>

                  <button 
                    v-else
                    @click.stop="assignItemToActiveTarget(item)"
                    class="btn-gold px-2.5 py-1 text-xs font-bold rounded-lg shadow-sm"
                  >
                    <span>镶嵌</span>
                  </button>

                  <!-- 槽位角标 -->
                  <span 
                    class="max-w-[9rem] min-w-0 shrink-0 truncate text-[10px] text-gray-500 font-mono px-1.5 py-0.5 rounded bg-black/40 border border-white/5"
                  >
                    {{ getItemSlotHint(item) }}
                  </span>

                  <!-- 编辑/修改此装备 (填入右侧编辑框) -->
                  <button 
                    @click.stop="openStudioWithItem(item)" 
                    class="p-1 hover:bg-amber-950/60 rounded text-gray-500 hover:text-amber-400 text-xs transition-colors"
                    title="以此物品底材创建官方结构化副本"
                  >
                    <Wrench class="w-3.5 h-3.5" />
                  </button>

                  <button
                    @click.stop="deleteLibraryItem(item)"
                    :disabled="store.isCalculating"
                    class="p-1 hover:bg-red-950/70 rounded text-gray-500 hover:text-red-300 text-xs transition-colors disabled:opacity-40"
                    title="从物品库删除（已穿戴或已镶嵌的物品需先卸下）"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <!-- 空提示 -->
              <div v-if="filteredInventory.length === 0" class="h-full flex flex-col items-center justify-center text-gray-600 py-16 space-y-2">
                <Box class="w-8 h-8 text-gray-600" />
                <div class="text-xs">此分类下物品为空</div>
                <div class="text-[10px] text-gray-500">点击上方新建或从右侧装备库添加</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- 槽位直连快速装备选择弹窗 (Slot Quick Equipper Modal) -->
    <div 
      v-if="slotPickerModal.isOpen" 
      class="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4"
      @click.self="slotPickerModal.isOpen = false"
    >
      <div class="w-full max-w-2xl glass-panel p-6 rounded-2xl border border-poe-gold/60 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
        <div class="flex items-center justify-between border-b border-white/10 pb-3">
          <div class="flex items-center space-x-2">
            <Shield class="w-5 h-5 text-poe-gold" />
            <div>
              <h3 class="font-bold text-base text-poe-gold font-poe-title">
                选择装备：{{ slotPickerModal.isJewel ? `星盘珠宝插槽 #${slotPickerModal.jewelNodeId}` : getSlotName(slotPickerModal.slotId) }}
              </h3>
              <div class="text-[11px] text-gray-400 mt-0.5">
                直接选择符合此部位的装备进行快速穿戴或替换
              </div>
            </div>
          </div>
          <button @click="slotPickerModal.isOpen = false" class="text-gray-400 hover:text-white text-lg px-2">✕</button>
        </div>

        <!-- 筛选过滤 -->
        <div class="flex-1 overflow-y-auto space-y-2 pr-1">
          <div class="flex items-center justify-between pb-1 px-1">
            <span class="text-xs text-gray-400">
              符合该槽位的可用物品 ({{ availablePickerItems.length }})
            </span>
            <div class="flex items-center space-x-1.5 text-xs">
              <button 
                @click="pickerUnusedOnly = false" 
                :class="['px-2 py-0.5 rounded transition-all', !pickerUnusedOnly ? 'bg-poe-gold text-black font-bold' : 'text-gray-400 hover:text-white']"
              >
                全部符合
              </button>
              <button 
                @click="pickerUnusedOnly = true" 
                :class="['px-2 py-0.5 rounded transition-all', pickerUnusedOnly ? 'bg-green-600 text-white font-bold' : 'text-gray-400 hover:text-white']"
              >
                仅未穿戴/未镶嵌 ({{ unusedPickerCount }})
              </button>
            </div>
          </div>

          <div 
            v-for="item in displayedPickerItems" 
            :key="item.id"
            @mouseenter="onHoverItem(item, $event)"
            @mousemove="onMouseMove($event)"
            @mouseleave="onMouseLeave"
            @click="equipFromPicker(item)"
            class="p-3 rounded-xl bg-black/50 border border-poe-border/80 hover:border-poe-gold hover:bg-white/5 transition-all cursor-pointer flex items-center justify-between group"
          >
            <div class="truncate mr-3">
              <div class="flex items-center space-x-2">
                <span class="font-bold text-xs text-poe-unique truncate">
                  {{ item.name_cn || item.name }}
                </span>
                <!-- 占用/可用状态标签 -->
                <span 
                  v-if="isItemCurrentlyInSlot(item)" 
                  class="px-1.5 py-0.5 text-[9px] rounded font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0"
                >
                  当前装备中
                </span>
                <span 
                  v-else-if="getItemEquippedStatus(item)" 
                  class="px-1.5 py-0.5 text-[9px] rounded font-medium bg-orange-950/60 text-orange-400 border border-orange-700/50 shrink-0"
                >
                  已在 {{ getItemEquippedStatus(item) }}
                </span>
                <span 
                  v-else 
                  class="px-1.5 py-0.5 text-[9px] rounded font-bold bg-green-950/60 text-green-400 border border-green-700/50 shrink-0"
                >
                  ✓ 空闲可用
                </span>
              </div>
              <div class="text-[10px] text-gray-400 font-mono mt-0.5 truncate flex items-center space-x-2">
                <span>{{ item.base_cn || item.base || item.type }}</span>
              </div>
              <!-- 词条摘要 -->
              <div v-if="item.lines_cn && item.lines_cn.length > 0" class="text-[10px] text-gray-500 truncate mt-0.5">
                {{ item.lines_cn.slice(0, 2).join(' · ') }}
              </div>
            </div>

            <button 
              :class="[
                'text-xs py-1 px-3 shrink-0 font-bold shadow-md transition-all rounded-lg',
                isItemCurrentlyInSlot(item)
                  ? 'bg-amber-600/80 text-white cursor-default'
                  : 'btn-gold opacity-90 group-hover:opacity-100'
              ]"
            >
              {{ isItemCurrentlyInSlot(item) ? '当前中' : (slotPickerModal.isJewel ? '镶嵌' : '穿戴') }}
            </button>
          </div>

          <!-- 空列表提示 -->
          <div v-if="availablePickerItems.length === 0" class="h-48 flex flex-col items-center justify-center text-gray-500 space-y-3">
            <Box class="w-8 h-8 text-gray-600" />
            <div class="text-xs">流派库中暂无符合此部位的闲置装备</div>
            <button 
              v-if="slotPickerModal.isJewel"
              @click="slotPickerModal.jewelNodeId !== null && openJewelCrafting(slotPickerModal.jewelNodeId)"
              class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
            >
              <Hammer class="w-3.5 h-3.5 text-amber-200" />
              <span>立即在此插槽制作或挑选传奇珠宝</span>
            </button>
            <button 
              v-else
              @click="openSlotCrafting(slotPickerModal.slotId)"
              class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
            >
              <Sparkles class="w-3.5 h-3.5 text-amber-200" />
              <span>立即为此槽位制作或挑选传奇装备</span>
            </button>
          </div>
        </div>

        <div class="flex justify-between items-center pt-2 border-t border-white/10">
          <button 
            v-if="slotPickerModal.isJewel"
            @click="slotPickerModal.jewelNodeId !== null && openJewelCrafting(slotPickerModal.jewelNodeId)"
            class="px-2.5 py-1 text-xs text-amber-300 hover:text-white bg-amber-950/40 hover:bg-amber-900/60 border border-amber-600/40 rounded-lg flex items-center gap-1 transition-all"
          >
            <Hammer class="w-3 h-3 text-amber-400" />
            <span>制作或挑选传奇珠宝</span>
          </button>
          <button 
            v-else
            @click="openSlotCrafting(slotPickerModal.slotId)"
            class="px-2.5 py-1 text-xs text-amber-300 hover:text-white bg-amber-950/40 hover:bg-amber-900/60 border border-amber-600/40 rounded-lg flex items-center gap-1 transition-all"
          >
            <Sparkles class="w-3 h-3 text-amber-400" />
            <span>为此槽位制作或挑选传奇</span>
          </button>
          <button @click="slotPickerModal.isOpen = false" class="btn-primary text-xs">
            完成
          </button>
        </div>
      </div>
    </div>

    <!-- 全局 1:1 PoE 原生游戏 / Ninja 风格 Tooltip 悬浮框 -->
    <PoEItemTooltip 
      :item="hoveredItem" 
      :is-visible="isTooltipVisible"
      :mouse-x="mousePos.x"
      :mouse-y="mousePos.y"
    />

    <!-- 独立全功能装备/珠宝制作工坊 Modal -->
    <ItemCraftingStudio 
      v-if="isStudioOpen"
      :is-open="isStudioOpen" 
      :item-to-edit="itemToEditForStudio"
      :initial-category="studioCategory"
      :initial-target="studioTarget"
      @close="closeStudio"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue';
import { useBuildStore } from '../stores/buildStore';
import { Shield, Box, X, Sparkles, Info, Hammer, Trash2, Wrench } from 'lucide-vue-next';
import PoEItemTooltip from './PoEItemTooltip.vue';
import { translateWebText } from '../utils/webTranslation';
import treeDataRaw from '../../../generated/web-data/tree_0_5.json';

const loadItemCraftingStudio = () => import('./ItemCraftingStudio.vue');
const ItemCraftingStudio = defineAsyncComponent(loadItemCraftingStudio);

const store = useBuildStore();
const invFilter = ref<'SLOT' | 'ALL' | 'EQUIP' | 'JEWEL' | 'FLASK'>('ALL');
const selectedSlot = ref('Body Armour');
const selectedJewelNode = ref<number | null>(null);
const isStudioOpen = ref(false);
const itemToEditForStudio = ref<any>(null);
const studioCategory = ref<string | undefined>(undefined);
const studioTarget = ref<any>(null);

function slotLabel(id: string): string {
  return translateWebText(id);
}

const equipmentSlots = computed(() => {
  const ids = Array.isArray(store.loadouts?.equipmentSlots) ? store.loadouts.equipmentSlots : [];
  return ids.map(id => ({ id: String(id), name: slotLabel(String(id)), short: slotLabel(String(id)) }));
});

const flaskSlots = computed(() => {
  const ids = Array.isArray(store.loadouts?.utilitySlots) ? store.loadouts.utilitySlots : [];
  return ids.map(id => ({ id: String(id), name: slotLabel(String(id)), short: slotLabel(String(id)) }));
});

const allSlots = computed(() => [...equipmentSlots.value, ...flaskSlots.value]);

const equippedSlotsCount = computed(() => {
  return equipmentSlots.value.filter(slot => store.equippedSlots[slot.id]).length;
});

const equippedFlaskCount = computed(() => {
  return flaskSlots.value.filter(slot => store.equippedSlots[slot.id]).length;
});

function getSlotName(slotId: string): string {
  const s = allSlots.value.find(slot => slot.id === slotId);
  return s ? s.name : slotId;
}

function selectSlotItem(slotId: string) {
  selectedSlot.value = slotId;
  if (store.equippedItems[slotId]) {
    selectedLibraryItem.value = store.equippedItems[slotId];
  }
}

function selectJewelSlot(nodeId: number) {
  selectedJewelNode.value = nodeId;
  if (store.equippedJewels[nodeId]) {
    selectedLibraryItem.value = store.equippedJewels[nodeId];
  }
}

function openStudioWithItem(item: any) {
  itemToEditForStudio.value = item;
  studioCategory.value = undefined;
  const itemId = Number(item?.id);
  const active = store.loadouts?.active;
  let target: any = null;
  if (Number.isInteger(itemId) && active) {
    const equipped = store.equippedItems ?? {};
    const slot = Object.keys(equipped).find(slotName => Number(equipped[slotName]?.id) === itemId);
    if (slot && Number.isInteger(active.itemSetId)) target = { kind: 'equipment', itemSetId: active.itemSetId, slotName: slot };
    const jewelNode = Object.entries(store.equippedJewels ?? {}).find(([, equippedItem]) => Number(equippedItem?.id) === itemId)?.[0];
    if (!target && jewelNode && Number.isInteger(active.specId)) target = { kind: 'jewel', specId: active.specId, nodeId: Number(jewelNode) };
  }
  studioTarget.value = target;
  isStudioOpen.value = true;
}

function openNewCraftStudio() {
  itemToEditForStudio.value = null;
  studioCategory.value = undefined;
  studioTarget.value = null;
  isStudioOpen.value = true;
}

function warmCraftingStudio() {
  void loadItemCraftingStudio();
}

function openJewelCrafting(nodeId: number) {
  selectedJewelNode.value = nodeId;
  itemToEditForStudio.value = null;
  studioCategory.value = 'Jewel';
  const active = store.loadouts?.active;
  studioTarget.value = active && Number.isInteger(active.specId) ? { kind: 'jewel', specId: active.specId, nodeId } : null;
  if (slotPickerModal.value.isOpen) slotPickerModal.value.isOpen = false;
  isStudioOpen.value = true;
}

function openSlotCrafting(slotId: string) {
  selectedSlot.value = slotId;
  itemToEditForStudio.value = null;
  const active = store.loadouts?.active;
  studioTarget.value = active && Number.isInteger(active.itemSetId) ? { kind: 'equipment', itemSetId: active.itemSetId, slotName: slotId } : null;
  // The target slot is authoritative; do not infer a category from its name.
  // The studio obtains the available bases from the official catalog and the
  // Lua target validation remains the final compatibility check.
  studioCategory.value = undefined;

  if (slotPickerModal.value.isOpen) slotPickerModal.value.isOpen = false;
  isStudioOpen.value = true;
}

function closeStudio() {
  isStudioOpen.value = false;
  itemToEditForStudio.value = null;
  studioCategory.value = undefined;
  studioTarget.value = null;
}

const selectedLibraryItem = ref<any>(null);

function getEquipmentAssignmentTarget(slotName: string) {
  const active = store.loadouts?.active;
  if (!active || !Number.isInteger(active.itemSetId)) {
    showNotice('无法装备：当前没有可用的官方装备集', 'warn');
    return null;
  }
  return { kind: 'equipment' as const, itemSetId: active.itemSetId, slotName };
}

function getJewelAssignmentTarget(nodeId: number) {
  const active = store.loadouts?.active;
  if (!active || !Number.isInteger(active.specId)) {
    showNotice('无法镶嵌：当前没有可用的官方天赋页', 'warn');
    return null;
  }
  return { kind: 'jewel' as const, specId: active.specId, nodeId };
}

async function commitItemAssignment(target: any, itemId: string | number | null) {
  const numericItemId = itemId === null || itemId === undefined ? null : Number(itemId);
  const result = await store.commitOfficialItemAssignment(target, numericItemId);
  if (!result.success) {
    showNotice(result.error?.message ?? '装备装配失败', 'warn');
    return false;
  }
  return true;
}

async function unequipEquipment(slotName: string) {
  const target = getEquipmentAssignmentTarget(slotName);
  if (!target || !(await commitItemAssignment(target, null))) return;
  showNotice(`已卸下 ${getSlotName(slotName)} 槽位装备`);
}

async function unequipJewel(nodeId: number) {
  const target = getJewelAssignmentTarget(nodeId);
  if (!target || !(await commitItemAssignment(target, null))) return;
  showNotice(`已从星盘插槽 #${nodeId} 拔出珠宝`);
}

async function deleteLibraryItem(item: any) {
  if (!item) return;
  const status = getItemEquippedStatus(item);
  if (status) {
    showNotice(`【${item.name_cn || item.name}】当前已被装备在 ${status}，请先卸下再删除！`, 'warn');
    return;
  }
  const result = await store.deleteItemFromLibrary(item.id);
  if (!result.success) {
    showNotice(result.error?.message ?? '删除物品失败', 'warn');
    return;
  }
  showNotice(`已从物品库删除【${item.name_cn || item.name}】`);
  if (selectedLibraryItem.value && selectedLibraryItem.value.id === item.id) {
    selectedLibraryItem.value = null;
  }
}

const slotPickerModal = ref({
  isOpen: false,
  isJewel: false,
  slotId: '',
  jewelNodeId: null as number | null,
});

function openSlotPicker(slotId: string) {
  selectedSlot.value = slotId;
  slotPickerModal.value = {
    isOpen: true,
    isJewel: false,
    slotId,
    jewelNodeId: null,
  };
}

function openJewelPicker(nodeId: number) {
  selectedJewelNode.value = nodeId;
  slotPickerModal.value = {
    isOpen: true,
    isJewel: true,
    slotId: '',
    jewelNodeId: nodeId,
  };
}

function isItemCurrentlyInSlot(item: any): boolean {
  if (slotPickerModal.value.isJewel) {
    const nodeId = slotPickerModal.value.jewelNodeId;
    return nodeId !== null && String(store.socketedJewels[nodeId]) === String(item.id);
  } else {
    const slotId = slotPickerModal.value.slotId;
    return String(store.equippedSlots[slotId]) === String(item.id);
  }
}

async function equipFromPicker(item: any) {
  if (slotPickerModal.value.isJewel) {
    const nodeId = slotPickerModal.value.jewelNodeId;
    if (nodeId === null) return;
    const target = getJewelAssignmentTarget(nodeId);
    if (!target || !(await commitItemAssignment(target, item.id))) return;
    showNotice(`已将【${item.name_cn || item.name}】镶嵌至星盘插槽 #${nodeId}`);
  } else {
    const slotId = slotPickerModal.value.slotId;
    const target = getEquipmentAssignmentTarget(slotId);
    if (!target || !(await commitItemAssignment(target, item.id))) return;
    showNotice(`已将【${item.name_cn || item.name}】装备至 ${getSlotName(slotId)}`);
  }
  slotPickerModal.value.isOpen = false;
  isTooltipVisible.value = false;
}

const pickerUnusedOnly = ref(false);

const availablePickerItems = computed(() => {
  if (slotPickerModal.value.isJewel) {
    const nodeId = slotPickerModal.value.jewelNodeId;
    if (nodeId === null) return [];
    return store.itemLibrary.filter(item => getItemValidJewelTargets(item).some(target => target.nodeId === nodeId));
  }
  const targetSlot = slotPickerModal.value.slotId;
  return store.itemLibrary.filter(item => {
    const valid = getItemValidSlots(item);
    return valid.includes(targetSlot);
  });
});

const unusedPickerCount = computed(() => {
  return availablePickerItems.value.filter(item => !getItemEquippedStatus(item)).length;
});

const displayedPickerItems = computed(() => {
  let list = [...availablePickerItems.value];
  if (pickerUnusedOnly.value) {
    list = list.filter(item => !getItemEquippedStatus(item) || isItemCurrentlyInSlot(item));
  }
  return list.sort((a, b) => {
    const aCurr = isItemCurrentlyInSlot(a);
    const bCurr = isItemCurrentlyInSlot(b);
    if (aCurr && !bCurr) return -1;
    if (!aCurr && bCurr) return 1;

    const aEquip = getItemEquippedStatus(a);
    const bEquip = getItemEquippedStatus(b);
    if (!aEquip && bEquip) return -1;
    if (aEquip && !bEquip) return 1;
    return 0;
  });
});

const toastNotice = ref({ text: '', type: 'info' as 'info' | 'warn' });
let toastTimer: any = null;

function showNotice(text: string, type: 'info' | 'warn' = 'info') {
  toastNotice.value = { text, type };
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastNotice.value.text = '';
  }, 4000);
}

const hoveredItem = ref<any>(null);
const isTooltipVisible = ref(false);
const mousePos = ref({ x: 0, y: 0 });

function onHoverItem(item: any, e: MouseEvent) {
  if (!item) {
    isTooltipVisible.value = false;
    hoveredItem.value = null;
    return;
  }
  hoveredItem.value = item;
  mousePos.value = { x: e.clientX, y: e.clientY };
  isTooltipVisible.value = true;
}

function onMouseMove(e: MouseEvent) {
  if (isTooltipVisible.value) {
    mousePos.value = { x: e.clientX, y: e.clientY };
  }
}

function onMouseLeave() {
  isTooltipVisible.value = false;
  hoveredItem.value = null;
}

const activeJewelSockets = computed(() => {
  const list: any[] = [];
  const nodes = treeDataRaw.nodes || [];
  for (const node of nodes) {
    if (store.allocatedNodes.has(node.id)) {
      if (node.type === 'Socket' || (node.name && node.name.includes('Jewel Socket'))) {
        list.push(node);
      }
    }
  }
  return list;
});

// 严谨的物品大类识别算法
function getItemCategory(item: any): 'EQUIP' | 'JEWEL' | 'FLASK' {
  if (!item) return 'EQUIP';
  const type = (item.type || '').trim().toLowerCase();
  if (type === 'jewel') {
    return 'JEWEL';
  }
  if (type === 'flask' || type === 'charm') {
    return 'FLASK';
  }
  return 'EQUIP';
}

function isJewelItem(item: any): boolean {
  return getItemCategory(item) === 'JEWEL';
}

// 严谨的槽位匹配约束（杜绝词缀中 during 等单词误判为 ring）
function getItemValidSlots(item: any): string[] {
  if (!item) return [];
  const official = item.validTargetSlots;
  if (official && Array.isArray(official.equipment)) return official.equipment.map((slot: unknown) => String(slot));
  return [];
}

function getItemValidEquipmentJewelSlots(item: any): string[] {
  const official = item?.validTargetSlots;
  if (!official || !Array.isArray(official.equipmentJewels)) return [];
  return official.equipmentJewels.map((slot: unknown) => String(slot));
}

function getItemValidJewelTargets(item: any): Array<{ nodeId: number; slotName?: string }> {
  const official = item?.validTargetSlots;
  if (!official || !Array.isArray(official.jewels)) return [];
  return official.jewels.flatMap((target: any) => {
    const nodeId = Number(target?.nodeId);
    if (!Number.isInteger(nodeId)) return [];
    return [{ nodeId, slotName: typeof target?.slotName === 'string' ? target.slotName : undefined }];
  });
}

function getItemSlotHint(item: any): string {
  const slots = getItemValidSlots(item);
  const jewelTargets = getItemValidJewelTargets(item);
  if (slots.length === 0 && jewelTargets.length === 0) return '不可装备';
  const labels = slots.map(s => {
    const f = allSlots.value.find(e => e.id === s);
    if (f) return f.short;

    const translated = translateWebText(s);
    if (translated !== s) return translated;

    const socketMatch = s.match(/^(.*?) Jewel Socket (\d+)$/);
    if (socketMatch) {
      const parent = translateWebText(socketMatch[1]);
      const socket = translateWebText('Jewel Socket');
      return `${parent} ${socket} ${socketMatch[2]}`;
    }

    return s;
  });
  for (const target of jewelTargets) labels.push(`星盘插槽 #${target.nodeId}`);
  return labels.join('/');
}

async function assignItemToActiveTarget(item: any) {
  if (!item) return;

  if (isJewelItem(item)) {
    const equipmentJewelSlots = getItemValidEquipmentJewelSlots(item);
    if (equipmentJewelSlots.length > 0 && equipmentJewelSlots.includes(selectedSlot.value)) {
      const active = store.loadouts?.active;
      const targetSlot = selectedSlot.value;
      if (active && Number.isInteger(active.itemSetId)) {
        const target = getEquipmentAssignmentTarget(targetSlot);
        if (target && await commitItemAssignment(target, item.id)) {
          showNotice(`已将【${item.name_cn || item.name}】装备至 ${getSlotName(targetSlot)}`);
        }
        return;
      }
    }
    const validJewelTargets = getItemValidJewelTargets(item);
    if (validJewelTargets.length === 0) {
      showNotice(`无法装备：【${item.name_cn || item.name}】没有官方可用的珠宝槽目标。`, 'warn');
      return;
    }
    const selectedNodeIsValid = selectedJewelNode.value !== null
      && validJewelTargets.some(target => target.nodeId === selectedJewelNode.value);
    const targetNodeId = selectedNodeIsValid ? selectedJewelNode.value! : validJewelTargets[0].nodeId;
    const target = getJewelAssignmentTarget(targetNodeId);
    if (!target || !(await commitItemAssignment(target, item.id))) return;
    showNotice(`已将珠宝【${item.name_cn || item.name}】镶嵌至星盘插槽 #${targetNodeId}`);
    return;
  }

  const validSlots = getItemValidSlots(item);
  if (validSlots.length === 0) {
    showNotice(`无法装备：【${item.name_cn || item.name}】不可装备！`, 'warn');
    return;
  }

  if (validSlots.includes(selectedSlot.value)) {
    const target = getEquipmentAssignmentTarget(selectedSlot.value);
    if (!target || !(await commitItemAssignment(target, item.id))) return;
    showNotice(`已将【${item.name_cn || item.name}】穿戴至 ${getSlotName(selectedSlot.value)}`);
    return;
  }

  let targetSlot = validSlots[0];
  if (validSlots.length > 1) {
    const emptySlot = validSlots.find(s => !store.equippedSlots[s]);
    if (emptySlot) targetSlot = emptySlot;
  }

  selectedSlot.value = targetSlot;
  const target = getEquipmentAssignmentTarget(targetSlot);
  if (!target || !(await commitItemAssignment(target, item.id))) return;
  showNotice(`已自动将【${item.name_cn || item.name}】装配至匹配槽位：${getSlotName(targetSlot)}`);
}

const slotMatchCount = computed(() => {
  const targetSlot = selectedSlot.value;
  return store.itemLibrary.filter(item => getItemValidSlots(item).includes(targetSlot)).length;
});

const equipCount = computed(() => store.itemLibrary.filter(i => getItemCategory(i) === 'EQUIP').length);
const jewelCount = computed(() => store.itemLibrary.filter(i => getItemCategory(i) === 'JEWEL').length);
const flaskCount = computed(() => store.itemLibrary.filter(i => getItemCategory(i) === 'FLASK').length);

function getItemEquippedStatus(item: any): string | null {
  for (const [slot, id] of Object.entries(store.equippedSlots)) {
    if (String(id) === String(item.id)) {
      const slotDef = allSlots.value.find(s => s.id === slot);
      return slotDef ? slotDef.short : slot;
    }
  }
  for (const [nodeId, id] of Object.entries(store.socketedJewels)) {
    if (String(id) === String(item.id)) {
      return `星盘插槽 #${nodeId}`;
    }
  }
  return null;
}

const filteredInventory = computed(() => {
  return store.itemLibrary.filter(item => {
    if (invFilter.value === 'SLOT') {
      return getItemValidSlots(item).includes(selectedSlot.value);
    }
    const cat = getItemCategory(item);
    if (invFilter.value === 'EQUIP') return cat === 'EQUIP';
    if (invFilter.value === 'JEWEL') return cat === 'JEWEL';
    if (invFilter.value === 'FLASK') return cat === 'FLASK';
    return true;
  });
});

function handleGlobalKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && slotPickerModal.value.isOpen) {
    slotPickerModal.value.isOpen = false;
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeyDown);
});
</script>
