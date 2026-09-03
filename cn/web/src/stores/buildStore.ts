import { defineStore } from 'pinia';
import { resolveImportOutcome, type ImportOutcome } from './importContract';
import { localizeImportedBuild, localizeImportedItem, localizeImportedSocketGroups } from '../utils/webTranslation';

export interface CharacterStats {
  Life: number;
  Mana: number;
  TotalSpirit?: number;
  TotalEHP: number;
  Str: number;
  Dex: number;
  Int: number;
  FireRes: number;
  ColdRes: number;
  LightningRes: number;
  ChaosRes: number;
  TotalDPS?: number;
  HitDPS?: number;
  AverageDamage?: number;
  Speed?: number;
  CritChance?: number;
  CritMultiplier?: number;
  HitChance?: number;
  Armour?: number;
  Evasion?: number;
  BlockChance?: number;
  SpellBlockChance?: number;
  [key: string]: any;
}

export interface Item {
  id: string | number;
  name: string;
  name_cn?: string;
  base?: string;
  base_cn?: string;
  type?: string;
  rarity?: string;
  rawLines?: string[];
  lines?: string[];
  lines_cn?: string[];
  [key: string]: any;
}

interface CanonicalBuildDocument {
  version: number;
  code: string;
}

interface CanonicalExportResult {
  success: boolean;
  code?: string;
  error?: { code: string; message: string };
}

type OfficialItemTarget = { kind?: 'equipment'; itemSetId: number; slotName: string } | { kind: 'jewel'; specId: number; nodeId: number };

interface OfficialProjectionState {
  buildName: string;
  className: string;
  ascendancyName: string;
  characterLevel: number;
  allocatedNodes: Set<number>;
  itemLibrary: Item[];
  equippedSlots: Record<string, string | number>;
  socketedJewels: Record<number, string | number>;
  socketGroups: any[];
  skillBreakdown: any;
  calcsSkillGroup: number;
  buffMode?: 'EFFECTIVE' | 'COMBAT' | 'BUFFED' | 'UNBUFFED';
  config: Record<string, any> | null;
  stats: CharacterStats | null;
  loadouts: Record<string, any> | null;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// Mutations can arrive while the official calculation is still running. Keep
// them ordered per store so every request observes the revision produced by
// the previous one instead of reusing a stale canonical snapshot.
const canonicalMutationTails = new WeakMap<object, Promise<unknown>>();

function enqueueCanonicalMutation<T>(store: object, work: () => Promise<T>): Promise<T> {
  const previous = canonicalMutationTails.get(store) ?? Promise.resolve();
  const task = previous.then(work, work);
  canonicalMutationTails.set(store, task.catch(() => undefined));
  return task;
}

function officialProjectionState(value: Record<string, unknown>): OfficialProjectionState {
  const build = localizeImportedBuild(value);
  const itemLibrary: Item[] = Array.isArray(build.itemLibrary) ? [...build.itemLibrary] : [];
  const itemsById = new Map(itemLibrary.filter(item => item.id !== undefined && item.id !== null).map(item => [String(item.id), item]));
  const includeItem = (value: unknown): Item => {
    const item = localizeImportedItem(value) as Item;
    if (item.id === undefined || item.id === null) throw new Error('官方 PoB 投影返回了缺少 ID 的物品。');
    const key = String(item.id);
    if (!itemsById.has(key)) {
      itemsById.set(key, item);
      itemLibrary.push(item);
    }
    return itemsById.get(key)!;
  };
  const equippedSlots: Record<string, string | number> = {};
  if (isRecord(build.equippedItems)) for (const [slot, item] of Object.entries(build.equippedItems)) equippedSlots[slot] = includeItem(item).id;
  const socketedJewels: Record<number, string | number> = {};
  if (isRecord(build.socketedJewels)) for (const [nodeId, item] of Object.entries(build.socketedJewels)) {
    const numericNodeId = Number(nodeId);
    if (!Number.isInteger(numericNodeId)) throw new Error('官方 PoB 投影返回了无效的珠宝槽节点。');
    socketedJewels[numericNodeId] = includeItem(item).id;
  }
  const rawBuffMode = build.buffMode ?? build.skillBreakdown?.dpsPipeline?.calcMode;
  const validBuffMode = (['EFFECTIVE', 'COMBAT', 'BUFFED', 'UNBUFFED'].includes(rawBuffMode as any)
    ? rawBuffMode
    : undefined) as 'EFFECTIVE' | 'COMBAT' | 'BUFFED' | 'UNBUFFED' | undefined;

  return {
    buildName: typeof build.buildName === 'string' && build.buildName ? build.buildName : '已导入的流派配置',
    className: typeof build.className === 'string' ? build.className : '',
    ascendancyName: typeof build.ascendancyName === 'string' ? build.ascendancyName : '',
    characterLevel: Number.isInteger(build.characterLevel) ? build.characterLevel : 1,
    allocatedNodes: new Set(Array.isArray(build.allocNodes) ? build.allocNodes.filter(Number.isInteger) : []),
    itemLibrary,
    equippedSlots,
    socketedJewels,
    socketGroups: Array.isArray(build.socketGroups) ? localizeImportedSocketGroups(build.socketGroups) : [],
    skillBreakdown: build.skillBreakdown ?? null,
    calcsSkillGroup: Number.isInteger(build.calcsSkillGroup) && Number(build.calcsSkillGroup) > 0 ? Number(build.calcsSkillGroup) : 1,
    buffMode: validBuffMode,
    config: isRecord(build.config) ? build.config : null,
    stats: isRecord(build.output) ? build.output as CharacterStats : null,
    loadouts: isRecord(build.loadouts) ? build.loadouts : null,
  };
}

export const useBuildStore = defineStore('build', {
  state: () => ({
    buildName: '未命名流派配置',
    className: 'Sorceress',
    ascendancyName: 'Chronomancer',
    characterLevel: 90,
    activeTab: 'TREE' as 'TREE' | 'SKILLS' | 'ITEMS' | 'CALCS' | 'CONFIG' | 'IMPORT',
    allocatedNodes: new Set<number>(),

    // 1. 流派物品与珠宝总库 (Item & Jewel Library)
    itemLibrary: [] as Item[],

    // 2. 角色 10 大装备槽位装配映射 (SlotName -> ItemId)
    equippedSlots: {} as Record<string, string | number>,

    // 3. 天赋星盘珠宝插槽装配映射 (NodeId -> ItemId)
    socketedJewels: {} as Record<number, string | number>,

    socketGroups: [] as any[],
    stats: {
      Life: 0,
      Mana: 0,
      TotalSpirit: 0,
      TotalEHP: 0,
      Str: 0,
      Dex: 0,
      Int: 0,
      FireRes: 0,
      ColdRes: 0,
      LightningRes: 0,
      ChaosRes: 0,
      TotalDPS: 0,
      HitDPS: 0,
      AverageDamage: 0,
      Speed: 0,
      CritChance: 0,
      CritMultiplier: 0,
      HitChance: 0,
      Armour: 0,
      Evasion: 0,
      BlockChance: 0,
      SpellBlockChance: 0
    } as CharacterStats,
    selectedSkillIndex: 0,
    selectedCalculationSkillIndex: 0,
    skillBreakdown: null as any,
    config: null as Record<string, any> | null,
    buffMode: 'EFFECTIVE' as 'EFFECTIVE' | 'COMBAT' | 'BUFFED' | 'UNBUFFED',
    isCalculating: false,
    lastImportError: null as { code: string; message: string } | null,
    lastCalculationError: null as { code: string; message: string } | null,
    canonicalBuild: null as CanonicalBuildDocument | null,
    bridgeCanonicalVersion: 0,
    hasUnsavedLocalEdits: false,
    loadouts: null as Record<string, any> | null,
  }),

  getters: {
    // 兼容 getter：将 equippedSlots 转换为 { [slotName]: Item }
    equippedItems(state): Record<string, Item> {
      const result: Record<string, Item> = {};
      for (const [slot, id] of Object.entries(state.equippedSlots)) {
        if (id) {
          const item = state.itemLibrary.find(i => String(i.id) === String(id));
          if (item) result[slot] = item;
        }
      }
      return result;
    },
    // 兼容 getter：获取已镶嵌的珠宝对象列表
    equippedJewels(state): Record<number, Item> {
      const result: Record<number, Item> = {};
      for (const [nodeId, id] of Object.entries(state.socketedJewels)) {
        if (id) {
          const item = state.itemLibrary.find(i => String(i.id) === String(id));
          if (item) result[Number(nodeId)] = item;
        }
      }
      return result;
    }
  },

  actions: {
    async setClassName(name: string) {
      return this.commitOfficialBuildChanges({ className: name });
    },
    async setLevel(level: number) {
      return this.commitOfficialBuildChanges({ level });
    },
    async toggleNode(nodeId: number) {
      return enqueueCanonicalMutation(this, async () => {
        // Read both the visible allocation and canonical document only after
        // earlier clicks have settled. This makes each request use the latest
        // revision/code and preserves every successful click in order.
        const prev = new Set(this.allocatedNodes);
        const next = new Set(this.allocatedNodes);
        if (next.has(nodeId)) next.delete(nodeId);
        else next.add(nodeId);
        this.allocatedNodes = next;

        const result = await this.commitCanonicalMutationNow('/api/build/commit', { changes: { allocNodes: [...next] } }, 'POB_BUILD_COMMIT_FAILED', '官方 PoB 未返回可提交的构建修改结果。');
        if (!result.success) {
          this.allocatedNodes = prev;
        }
        return result;
      });
    },

    async importBuildFromCode(codeText: string): Promise<ImportOutcome> {
      this.isCalculating = true;
      this.lastImportError = null;
      this.lastCalculationError = null;
      try {
        const response = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: codeText })
        });
        const res = await response.json();
        const outcome = resolveImportOutcome(response.ok, res);
        if (outcome.success) {
          this.applyOfficialProjection(outcome.data, { version: 1, code: codeText.trim() });
          this.bridgeCanonicalVersion = 1;
          return outcome;
        }
        this.lastImportError = outcome.error;
        return outcome;
      } catch (e) {
        console.error("Import request failed:", e);
        const error = { code: 'POB_IMPORT_REQUEST_FAILED', message: e instanceof Error ? e.message : '导入请求失败。' };
        this.lastImportError = error;
        return { success: false, error };
      } finally {
        this.isCalculating = false;
      }
    },

    async selectCalculationSkillGroup(idx: number) {
      return this.commitOfficialBuildChanges({ calcsSkillGroup: idx + 1 });
    },

    async setBuffMode(mode: 'EFFECTIVE' | 'COMBAT' | 'BUFFED' | 'UNBUFFED') {
      return this.commitOfficialBuildChanges({ buffMode: mode });
    },

    applyOfficialProjection(data: Record<string, unknown>, document: CanonicalBuildDocument) {
      if (!Number.isInteger(document.version) || document.version < 1 || typeof document.code !== 'string' || !document.code.trim()) throw new Error('官方 PoB 文档版本或分享代码无效。');
      const next = officialProjectionState(data);
      this.buildName = next.buildName;
      if (next.className) this.className = next.className;
      if (next.ascendancyName) this.ascendancyName = next.ascendancyName;
      this.characterLevel = next.characterLevel;
      this.allocatedNodes = next.allocatedNodes;
      this.itemLibrary = next.itemLibrary;
      this.equippedSlots = next.equippedSlots;
      this.socketedJewels = next.socketedJewels;
      this.socketGroups = next.socketGroups;
      this.skillBreakdown = next.skillBreakdown;
      this.config = next.config;
      this.selectedSkillIndex = Math.max(0, next.socketGroups.findIndex(group => group.isMain));
      this.selectedCalculationSkillIndex = Math.min(Math.max(0, next.calcsSkillGroup - 1), Math.max(0, next.socketGroups.length - 1));
      if (next.buffMode) this.buffMode = next.buffMode;
      const nextOutput = (next as any).output || next.stats;
      if (nextOutput) this.stats = nextOutput as CharacterStats;
      this.loadouts = next.loadouts;
      this.canonicalBuild = document;
      this.bridgeCanonicalVersion = document.version;
      this.hasUnsavedLocalEdits = false;
      this.saveToStorage();
    },

    async commitCanonicalMutation(path: '/api/build/commit' | '/api/config/commit' | '/api/skills/commit' | '/api/items/remove', payload: Record<string, unknown>, fallbackCode: string, fallbackMessage: string): Promise<{ success: boolean; data?: Record<string, any>; error?: { code: string; message: string } }> {
      return enqueueCanonicalMutation(this, () => this.commitCanonicalMutationNow(path, payload, fallbackCode, fallbackMessage));
    },

    async commitCanonicalMutationNow(path: '/api/build/commit' | '/api/config/commit' | '/api/skills/commit' | '/api/items/remove', payload: Record<string, unknown>, fallbackCode: string, fallbackMessage: string): Promise<{ success: boolean; data?: Record<string, any>; error?: { code: string; message: string } }> {
      // Read the document only when this queued mutation starts. Earlier
      // requests may have advanced the canonical revision while this one
      // was waiting, so capturing it before enqueueing causes conflicts.
      const document = this.canonicalBuild;
      if (!document) return { success: false, error: { code: 'POB_CANONICAL_DOCUMENT_MISSING', message: '当前内容尚未保存为官方 PoB 文档。' } };
      if (this.hasUnsavedLocalEdits) return { success: false, error: { code: 'POB_CANONICAL_DOCUMENT_DIRTY', message: '当前本地编辑尚未写入官方 PoB 文档，无法继续修改。' } };
      this.isCalculating = true;
      this.lastCalculationError = null;
      try {
        const response = await fetch(path, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: document.code, expectedRevision: document.version, ...payload }),
        });
        const result = await response.json();
        const data = result?.data;
        if (!response.ok || result?.success !== true || !isRecord(data) || typeof data.code !== 'string' || !Number.isInteger(data.revision) || !isRecord(data.build) || data.sourceRevision !== document.version || data.revision !== document.version + 1) {
          const error = result?.error;
          return { success: false, error: { code: typeof error?.code === 'string' ? error.code : fallbackCode, message: typeof error?.message === 'string' ? error.message : fallbackMessage } };
        }
        this.applyOfficialProjection(data.build, { code: data.code, version: data.revision });
        return { success: true, data };
      } catch (error) {
        return { success: false, error: { code: `${fallbackCode}_REQUEST_FAILED`, message: error instanceof Error ? error.message : '无法连接官方 PoB 服务。' } };
      } finally {
        this.isCalculating = false;
      }
    },

    async commitOfficialBuildChanges(changes: Record<string, unknown>) {
      return this.commitCanonicalMutation('/api/build/commit', { changes }, 'POB_BUILD_COMMIT_FAILED', '官方 PoB 未返回可提交的构建修改结果。');
    },

    async commitOfficialConfigChange(variable: string, value: unknown) {
      const configSetId = this.loadouts?.active?.configSetId;
      if (!Number.isInteger(configSetId)) return { success: false, error: { code: 'POB_CONFIG_SET_MISSING', message: '当前官方 Build 缺少活动战斗配置集。' } };
      return this.commitCanonicalMutation('/api/config/commit', { configSetId, variable, value }, 'POB_CONFIG_COMMIT_FAILED', '官方 PoB 未返回可提交的战斗配置结果。');
    },

    async commitOfficialSkillChange(operation: 'setGroup' | 'setGem' | 'addGem' | 'removeGem' | 'addGroup' | 'removeGroup' | 'setMain', payload: Record<string, unknown> = {}) {
      const skillSetId = this.loadouts?.active?.skillSetId;
      if (!Number.isInteger(skillSetId)) return { success: false, error: { code: 'POB_SKILL_SET_MISSING', message: '当前官方 Build 缺少活动技能集。' } };
      return this.commitCanonicalMutation('/api/skills/commit', { skillSetId, operation, ...payload }, 'POB_SKILL_COMMIT_FAILED', '官方 PoB 未返回可提交的技能修改结果。');
    },

    async selectOfficialLoadout(selection: { specId: number; itemSetId: number; skillSetId: number; configSetId: number }): Promise<{ success: boolean; error?: { code: string; message: string } }> {
      const document = this.canonicalBuild;
      if (!document) return { success: false, error: { code: 'POB_CANONICAL_DOCUMENT_MISSING', message: '当前内容尚未保存为官方 PoB 文档。' } };
      if (this.hasUnsavedLocalEdits) return { success: false, error: { code: 'POB_CANONICAL_DOCUMENT_DIRTY', message: '当前本地编辑尚未写入官方 PoB 文档，无法切换 Loadout。' } };
      this.isCalculating = true;
      this.lastCalculationError = null;
      try {
        const response = await fetch('/api/loadouts/select', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: document.code, expectedRevision: document.version, selection }),
        });
        const result = await response.json();
        const data = result?.data;
        if (!response.ok || result?.success !== true || !isRecord(data) || typeof data.code !== 'string' || !Number.isInteger(data.revision) || !isRecord(data.build) || data.sourceRevision !== document.version || data.revision !== document.version + 1) {
          const error = result?.error;
          return { success: false, error: { code: typeof error?.code === 'string' ? error.code : 'POB_LOADOUT_SWITCH_FAILED', message: typeof error?.message === 'string' ? error.message : '官方 PoB 未返回可提交的 Loadout 切换结果。' } };
        }
        this.applyOfficialProjection(data.build, { code: data.code, version: data.revision });
        return { success: true };
      } catch (error) {
        return { success: false, error: { code: 'POB_LOADOUT_SWITCH_REQUEST_FAILED', message: error instanceof Error ? error.message : '无法连接官方 PoB 服务。' } };
      } finally {
        this.isCalculating = false;
      }
    },

    async commitOfficialItemAssignment(target: { kind?: 'equipment'; itemSetId: number; slotName: string } | { kind: 'jewel'; specId: number; nodeId: number }, itemId: number | null): Promise<{ success: boolean; data?: Record<string, any>; error?: { code: string; message: string } }> {
      return enqueueCanonicalMutation(this, () => this.commitOfficialItemAssignmentNow(target, itemId));
    },

    async commitOfficialItemAssignmentNow(target: { kind?: 'equipment'; itemSetId: number; slotName: string } | { kind: 'jewel'; specId: number; nodeId: number }, itemId: number | null): Promise<{ success: boolean; data?: Record<string, any>; error?: { code: string; message: string } }> {
      const document = this.canonicalBuild;
      if (!document) return { success: false, error: { code: 'POB_CANONICAL_DOCUMENT_MISSING', message: '当前内容尚未保存为官方 PoB 文档。' } };
      if (this.hasUnsavedLocalEdits) return { success: false, error: { code: 'POB_CANONICAL_DOCUMENT_DIRTY', message: '当前本地编辑尚未写入官方 PoB 文档，无法分配物品。' } };
      this.isCalculating = true;
      this.lastCalculationError = null;
      try {
        const response = await fetch('/api/items/assign', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: document.code, expectedRevision: document.version, target, itemId }),
        });
        const result = await response.json();
        const data = result?.data;
        if (!response.ok || result?.success !== true || !isRecord(data) || typeof data.code !== 'string' || !Number.isInteger(data.revision) || !isRecord(data.build) || data.sourceRevision !== document.version || data.revision !== document.version + 1) {
          const error = result?.error;
          return { success: false, error: { code: typeof error?.code === 'string' ? error.code : 'POB_ITEM_ASSIGNMENT_COMMIT_CONTRACT_INVALID', message: typeof error?.message === 'string' ? error.message : '官方 PoB 未返回可提交的物品分配结果。' } };
        }
        this.applyOfficialProjection(data.build, { code: data.code, version: data.revision });
        return { success: true, data };
      } catch (error) {
        return { success: false, error: { code: 'POB_ITEM_ASSIGNMENT_REQUEST_FAILED', message: error instanceof Error ? error.message : '无法连接官方 PoB 服务。' } };
      } finally {
        this.isCalculating = false;
      }
    },

    async assignItemToTarget(target: { kind?: 'equipment'; itemSetId: number; slotName: string } | { kind: 'jewel'; specId: number; nodeId: number }, itemId: string | number | null) {
      const numericItemId = itemId === null || itemId === undefined ? null : Number(itemId);
      return this.commitOfficialItemAssignment(target, Number.isNaN(numericItemId) ? null : numericItemId);
    },

    async deleteItemFromLibrary(itemId: string | number) {
      const numericItemId = Number(itemId);
      return this.deleteOfficialLibraryItem(Number.isNaN(numericItemId) ? 0 : numericItemId);
    },

    async deleteOfficialLibraryItem(itemId: number): Promise<{ success: boolean; data?: Record<string, any>; error?: { code: string; message: string } }> {
      if (!Number.isInteger(itemId) || itemId <= 0) return { success: false, error: { code: 'POB_ITEM_DELETE_ITEM_ID_INVALID', message: '只能删除当前官方物品库中的物品。' } };
      return this.commitCanonicalMutation('/api/items/remove', { itemId }, 'POB_ITEM_DELETE_FAILED', '官方 PoB 未返回可提交的物品删除结果。');
    },

    async getOfficialCraftOptions(input: { action?: 'create' | 'edit' | 'duplicate'; sourceItemId?: number; baseName: string; itemLevel: number; rarity: 'NORMAL' | 'MAGIC' | 'RARE'; corrupted: boolean; draft?: Record<string, unknown> }): Promise<{ success: boolean; data?: Record<string, any>; error?: { code: string; message: string } }> {
      const document = this.canonicalBuild;
      if (!document) return { success: false, error: { code: 'POB_CANONICAL_DOCUMENT_MISSING', message: '当前内容尚未保存为官方 PoB 文档。' } };
      if (this.hasUnsavedLocalEdits) return { success: false, error: { code: 'POB_CANONICAL_DOCUMENT_DIRTY', message: '当前本地编辑尚未写入官方 PoB 文档，无法读取制作选项。' } };
      try {
        const response = await fetch('/api/crafting/options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: document.code, expectedRevision: document.version, ...input }),
        });
        const result = await response.json();
        if (!response.ok || result?.success !== true || !isRecord(result.data)) {
          const error = result?.error;
          return { success: false, error: { code: typeof error?.code === 'string' ? error.code : 'POB_CRAFT_OPTIONS_FAILED', message: typeof error?.message === 'string' ? error.message : '官方 PoB 未返回制作选项。' } };
        }
        if (result.data.canonicalRevision !== document.version || result.data.sourceRevision !== document.version) {
          return { success: false, error: { code: 'POB_CRAFT_OPTIONS_CONTRACT_INVALID', message: '官方 PoB 返回的制作选项版本不匹配。' } };
        }
        return { success: true, data: result.data };
      } catch (error) {
        return { success: false, error: { code: 'POB_CRAFT_OPTIONS_REQUEST_FAILED', message: error instanceof Error ? error.message : '无法连接官方 PoB 服务。' } };
      }
    },

    async getOfficialCraftCatalog(query = ''): Promise<{ success: boolean; data?: Record<string, any>; error?: { code: string; message: string } }> {
      const document = this.canonicalBuild;
      if (!document) return { success: false, error: { code: 'POB_CANONICAL_DOCUMENT_MISSING', message: '当前内容尚未保存为官方 PoB 文档。' } };
      if (this.hasUnsavedLocalEdits) return { success: false, error: { code: 'POB_CANONICAL_DOCUMENT_DIRTY', message: '当前本地编辑尚未写入官方 PoB 文档，无法读取制作目录。' } };
      try {
        const response = await fetch('/api/crafting/catalog', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: document.code, expectedRevision: document.version, query }),
        });
        const result = await response.json();
        if (!response.ok || result?.success !== true || !isRecord(result.data)) {
          const error = result?.error;
          return { success: false, error: { code: typeof error?.code === 'string' ? error.code : 'POB_CRAFT_CATALOG_FAILED', message: typeof error?.message === 'string' ? error.message : '官方 PoB 未返回制作目录。' } };
        }
        if (result.data.canonicalRevision !== document.version || result.data.sourceRevision !== document.version) {
          return { success: false, error: { code: 'POB_CRAFT_CATALOG_CONTRACT_INVALID', message: '官方 PoB 返回的制作目录版本不匹配。' } };
        }
        return { success: true, data: result.data };
      } catch (error) {
        return { success: false, error: { code: 'POB_CRAFT_CATALOG_REQUEST_FAILED', message: error instanceof Error ? error.message : '无法连接官方 PoB 服务。' } };
      }
    },

    async previewOfficialCraft(action: 'create' | 'edit' | 'duplicate', target: OfficialItemTarget | null, draft: Record<string, unknown>, sourceItemId?: number): Promise<{ success: boolean; data?: Record<string, any>; error?: { code: string; message: string } }> {
      return this.runOfficialCraft('/api/items/preview', action, target, draft, false, sourceItemId);
    },

    async commitOfficialCraft(action: 'create' | 'edit' | 'duplicate', target: OfficialItemTarget | null, draft: Record<string, unknown>, sourceItemId?: number): Promise<{ success: boolean; data?: Record<string, any>; error?: { code: string; message: string } }> {
      return this.runOfficialCraft('/api/items/commit', action, target, draft, true, sourceItemId);
    },

    async runOfficialCraft(path: '/api/items/preview' | '/api/items/commit', action: 'create' | 'edit' | 'duplicate', target: OfficialItemTarget | null, draft: Record<string, unknown>, commit: boolean, sourceItemId?: number): Promise<{ success: boolean; data?: Record<string, any>; error?: { code: string; message: string } }> {
      const document = this.canonicalBuild;
      if (!document) return { success: false, error: { code: 'POB_CANONICAL_DOCUMENT_MISSING', message: '当前内容尚未保存为官方 PoB 文档。' } };
      if (this.hasUnsavedLocalEdits) return { success: false, error: { code: 'POB_CANONICAL_DOCUMENT_DIRTY', message: '当前本地编辑尚未写入官方 PoB 文档，无法制作物品。' } };
      this.isCalculating = true;
      this.lastCalculationError = null;
      try {
        const response = await fetch(path, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: document.code, expectedRevision: document.version, action, sourceItemId, target, draft }),
        });
        const result = await response.json();
        const data = result?.data;
        if (!response.ok || result?.success !== true || !isRecord(data)) {
          const error = result?.error;
          return { success: false, error: { code: typeof error?.code === 'string' ? error.code : 'POB_CRAFT_FAILED', message: typeof error?.message === 'string' ? error.message : '官方 PoB 未接受此制作草案。' } };
        }
        if (!commit) {
          if (data.sourceRevision !== document.version || data.canonicalRevision !== document.version) {
            return { success: false, error: { code: 'POB_CRAFT_PREVIEW_CONTRACT_INVALID', message: '官方 PoB 未返回与当前文档一致的预览版本。' } };
          }
          return { success: true, data };
        }
        if (typeof data.code !== 'string' || !Number.isInteger(data.revision) || !isRecord(data.build) || data.sourceRevision !== document.version || data.canonicalRevision !== document.version || data.revision !== document.version + 1) {
          return { success: false, error: { code: 'POB_CRAFT_COMMIT_CONTRACT_INVALID', message: '官方 PoB 未返回可提交的制作结果。' } };
        }
        this.applyOfficialProjection(data.build, { code: data.code, version: data.revision });
        return { success: true, data };
      } catch (error) {
        return { success: false, error: { code: 'POB_CRAFT_REQUEST_FAILED', message: error instanceof Error ? error.message : '无法连接官方 PoB 服务。' } };
      } finally {
        this.isCalculating = false;
      }
    },

    saveToStorage() {
      try {
        // Browser recovery deliberately trusts only the canonical PoB document.
        // Persisting the full projection was unused on restore and blocked the
        // main thread after every official item transaction.
        const payload = { canonicalBuild: this.canonicalBuild };
        localStorage.setItem('pob_nextgen_build_state', JSON.stringify(payload));
      } catch (e) {
        console.warn("Save to localStorage failed:", e);
      }
    },

    loadFromStorage() {
      try {
        const raw = localStorage.getItem('pob_nextgen_build_state');
        if (raw) {
          const d = JSON.parse(raw);
          if (d.canonicalBuild && typeof d.canonicalBuild === 'object'
            && Number.isInteger(d.canonicalBuild.version) && d.canonicalBuild.version > 0
            && typeof d.canonicalBuild.code === 'string' && d.canonicalBuild.code.trim()) {
            this.canonicalBuild = { version: d.canonicalBuild.version, code: d.canonicalBuild.code };
            this.bridgeCanonicalVersion = 0;
          }
          // Browser projections from older clients may contain fabricated or
          // stale results. Restore only the official document, then replace
          // every visible field with the next PoB XML projection.
          this.hasUnsavedLocalEdits = false;
        }
      } catch (e) {
        console.warn("Load from localStorage failed:", e);
      }
    },

    async recalculate() {
      this.isCalculating = true;
      this.lastCalculationError = null;
      try {
        const document = this.canonicalBuild;
        const bridgeSessionMissing = document !== null && this.bridgeCanonicalVersion !== document.version;
        if (!await this.ensureCanonicalBuildLoaded()) return;
        // Restoring a build imports, calculates, and projects the official
        // result already. Avoid immediately running the same calculation a
        // second time after a browser refresh or bridge restart.
        if (bridgeSessionMissing) return;
        const response = await fetch('/api/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        let data: any;
        try {
          data = await response.json();
        } catch {
          this.lastCalculationError = {
            code: 'POB_CALC_RESPONSE_INVALID',
            message: '官方 PoB 计算服务返回了无法识别的响应。'
          };
          return;
        }
        const bridgeError = data?.error;
        const errorCode = typeof bridgeError?.code === 'string' ? bridgeError.code : `POB_CALC_HTTP_${response.status}`;
        const errorMessage = typeof bridgeError?.message === 'string' && bridgeError.message
          ? bridgeError.message.slice(0, 240)
          : `官方 PoB 计算服务请求失败（HTTP ${response.status}）。`;
        if (!response.ok) {
          this.lastCalculationError = { code: errorCode, message: errorMessage };
          return;
        }
        if (!data || data.success !== true) {
          this.lastCalculationError = {
            code: typeof bridgeError?.code === 'string' ? bridgeError.code : 'POB_CALCULATION_REJECTED',
            message: typeof bridgeError?.message === 'string' && bridgeError.message
              ? bridgeError.message.slice(0, 240)
              : '本次修改未被官方 PoB 计算核心接受。'
          };
          return;
        }
        const buildData = data.data || data;
        if (!buildData.output || typeof buildData.output !== 'object') {
          this.lastCalculationError = {
            code: 'POB_CALC_OUTPUT_MISSING',
            message: '官方 PoB 未返回本次修改的计算结果。'
          };
          return;
        }
        this.stats = buildData.output as CharacterStats;
        this.skillBreakdown = buildData.skillBreakdown ?? this.skillBreakdown;
        const rawBuffMode = buildData.buffMode ?? buildData.skillBreakdown?.dpsPipeline?.calcMode;
        if (['EFFECTIVE', 'COMBAT', 'BUFFED', 'UNBUFFED'].includes(rawBuffMode)) {
          this.buffMode = rawBuffMode;
        }
      } catch (e) {
        console.warn("Recalculate failed:", e);
        this.lastCalculationError = {
          code: 'POB_CALC_REQUEST_FAILED',
          message: e instanceof Error && e.message ? e.message.slice(0, 240) : '无法连接官方 PoB 计算服务。'
        };
      } finally {
        this.saveToStorage();
        this.isCalculating = false;
      }
    },

    async ensureCanonicalBuildLoaded(): Promise<boolean> {
      const document = this.canonicalBuild;
      if (!document) {
        this.lastCalculationError = {
          code: 'POB_CANONICAL_DOCUMENT_MISSING',
          message: '当前界面内容不是可重算的官方 PoB 文档。请重新导入有效 PoB 配置后再计算或导出。'
        };
        return false;
      }
      if (this.bridgeCanonicalVersion === document.version) return true;
      try {
        const response = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: document.code })
        });
        const outcome = resolveImportOutcome(response.ok, await response.json());
        if (!outcome.success) {
          this.lastCalculationError = {
            code: outcome.error.code,
            message: `无法恢复已保存的官方 PoB 配置：${outcome.error.message}`
          };
          return false;
        }
        // A browser restart may restore an older local projection that has no
        // Loadout IDs. Refresh it from the same canonical XML before allowing
        // item actions. Dirty edits intentionally keep their local view.
        if (!this.hasUnsavedLocalEdits) {
          this.applyOfficialProjection(outcome.data, { version: 1, code: document.code });
        } else {
          this.canonicalBuild = { version: 1, code: document.code };
        }
        this.bridgeCanonicalVersion = 1;
        return true;
      } catch (e) {
        this.lastCalculationError = {
          code: 'POB_CANONICAL_RESTORE_FAILED',
          message: `无法恢复已保存的官方 PoB 配置：${e instanceof Error ? e.message : '导入服务不可用。'}`
        };
        return false;
      }
    },

    async exportCanonicalBuild(): Promise<CanonicalExportResult> {
      const document = this.canonicalBuild;
      if (!document) {
        return {
          success: false,
          error: {
            code: 'POB_CANONICAL_DOCUMENT_MISSING',
            message: '当前内容尚未保存为官方 PoB 文档，无法导出。请重新导入有效 PoB 配置。'
          }
        };
      }
      if (this.hasUnsavedLocalEdits) {
        return {
          success: false,
          error: {
            code: 'POB_CANONICAL_DOCUMENT_DIRTY',
            message: '当前本地编辑尚未写入官方 PoB 文档，无法导出。请重新导入或等待官方文档写入功能完成。'
          }
        };
      }
      try {
        const response = await fetch('/api/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: document.code, version: document.version })
        });
        const result = await response.json();
        if (!response.ok || result?.success !== true || typeof result?.code !== 'string') {
          const error = result?.error;
          return {
            success: false,
            error: {
              code: typeof error?.code === 'string' ? error.code : 'POB_EXPORT_FAILED',
              message: typeof error?.message === 'string' ? `导出失败：${error.message}` : '导出失败：官方 PoB 核心未返回分享代码。'
            }
          };
        }
        if (result.sourceVersion !== document.version) {
          return { success: false, error: { code: 'POB_EXPORT_VERSION_MISMATCH', message: '导出失败：官方 PoB 文档版本不一致。' } };
        }
        return { success: true, code: result.code };
      } catch (e) {
        return {
          success: false,
          error: {
            code: 'POB_EXPORT_REQUEST_FAILED',
            message: `导出失败：${e instanceof Error ? e.message : '导出服务不可用。'}`
          }
        };
      }
    }
  }
});
