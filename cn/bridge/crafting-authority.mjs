import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const defaultAuthority = require('../generated/web-data/crafting-authority-v2.json');

function invalid(code, path, message, suggestions = []) {
  return { code, path, message, suggestions };
}

function authorityMaps(authority) {
  if (!authority || authority.schema_version !== 2 || !Array.isArray(authority.item_bases) || !Array.isArray(authority.item_mods) || !Array.isArray(authority.essences)) throw new Error('crafting authority v2 is unavailable or invalid');
  const bases = new Map(authority.item_bases.map(base => [base.id, base]));
  const mods = new Map(authority.item_mods.map(mod => [mod.id, mod]));
  const essences = new Map(authority.essences.map(essence => [essence.id, essence]));
  if (!bases.size || !mods.size || !essences.size || bases.size !== authority.item_bases.length || mods.size !== authority.item_mods.length || essences.size !== authority.essences.length) throw new Error('crafting authority v2 has duplicate or missing records');
  return { bases, mods, essences };
}

function spawnWeight(base, mod) {
  for (const entry of mod.spawn_weights ?? []) {
    if ((base.tags ?? []).includes(entry.tag)) return entry.weight;
  }
  return 0;
}

function affixLimitsFor(base, corrupted) {
  const limits = base.affix_limits?.[corrupted ? 'corrupted' : 'normal'];
  if (!limits || !Number.isInteger(limits.prefixes) || !Number.isInteger(limits.suffixes) || limits.prefixes < 0 || limits.suffixes < 0) {
    throw new Error(`crafting authority base has invalid official affix limits: ${base.id}`);
  }
  return limits;
}

export function createCraftDraftValidator(authority = defaultAuthority) {
  const { bases, mods, essences } = authorityMaps(authority);
  return draft => {
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return invalid('POB_CRAFT_DRAFT_INVALID', 'draft', '制作草案不能为空。');
    if (draft.kind === 'rawItem' || typeof draft.raw === 'string') {
      if (typeof draft.raw !== 'string' || draft.raw.trim().length === 0) return invalid('POB_CRAFT_RAW_EMPTY', 'draft.raw', '装备文本不能为空。');
      return null;
    }
    if (draft.rarity !== 'RARE') return invalid('POB_CRAFT_RARITY_UNSUPPORTED', 'draft.rarity', '严格制作模式目前仅支持稀有装备。');
    const base = bases.get(draft.baseName);
    if (!base) return invalid('POB_CRAFT_BASE_UNKNOWN', 'draft.baseName', '所选底材不在当前锁定的官方版本中。');
    const affixLimits = affixLimitsFor(base, draft.corrupted === true);
    if (!Number.isInteger(draft.itemLevel) || draft.itemLevel < 1 || draft.itemLevel > 100) return invalid('POB_CRAFT_ITEM_LEVEL_INVALID', 'draft.itemLevel', '物品等级必须是 1 至 100 的整数。');
    if (draft.itemLevel < base.required_item_level) return invalid('POB_CRAFT_BASE_ITEM_LEVEL_TOO_LOW', 'draft.itemLevel', `该底材至少需要物品等级 ${base.required_item_level}。`, [`将物品等级提高至 ${base.required_item_level}。`]);
    const maxQuality = draft.corrupted ? 40 : 20;
    const quality = draft.quality ?? 0;
    if (!Number.isInteger(quality) || quality < 0 || quality > maxQuality) return invalid('POB_CRAFT_QUALITY_INVALID', 'draft.quality', `品质必须是 0 至 ${maxQuality} 的整数。`);
    const socketLimit = Number.isInteger(base.socket_limit) && base.socket_limit > 0 ? base.socket_limit : 0;
    const socketCount = draft.socketCount ?? socketLimit;
    if (!Number.isInteger(socketCount) || socketCount < 0 || socketCount > socketLimit) return invalid('POB_CRAFT_SOCKET_COUNT_INVALID', 'draft.socketCount', `该官方底材仅允许 0 至 ${socketLimit} 个符文孔。`);

    const groups = new Set();
    const ids = new Set();
    const counts = { Prefix: 0, Suffix: 0 };
    const essenceDraft = draft.essence;
    if (essenceDraft !== undefined && essenceDraft !== null) {
      if (!essenceDraft || typeof essenceDraft !== 'object' || Array.isArray(essenceDraft) || typeof essenceDraft.id !== 'string') return invalid('POB_CRAFT_ESSENCE_INVALID', 'draft.essence', '精华必须来自当前锁定的官方精华列表。');
      const essence = essences.get(essenceDraft.id);
      if (!essence) return invalid('POB_CRAFT_ESSENCE_UNKNOWN', 'draft.essence.id', '所选精华不在当前锁定的官方版本中。');
      const mapping = (essence.mods ?? []).find(entry => entry?.base_type === base.type);
      if (!mapping || typeof mapping.mod_id !== 'string') return invalid('POB_CRAFT_ESSENCE_BASE_INVALID', 'draft.essence.id', '该精华不能作用于所选官方底材。');
      const mod = mods.get(mapping.mod_id);
      if (!mod || mod.type !== mapping.mod_type || mod.group !== mapping.group) throw new Error(`crafting authority essence mapping is inconsistent: ${essence.id}`);
      const roll = essenceDraft.roll ?? 0.5;
      if (typeof roll !== 'number' || !Number.isFinite(roll) || roll < 0 || roll > 1) return invalid('POB_CRAFT_ESSENCE_ROLL_INVALID', 'draft.essence.roll', '精华词缀 Roll 必须是 0 至 1 的数字。');
      ids.add(mod.id);
      groups.add(mod.group);
      counts[mod.type] += 1;
    }
    for (const [collection, type] of [['prefixes', 'Prefix'], ['suffixes', 'Suffix']]) {
      const affixes = draft[collection] ?? [];
      const affixLimit = affixLimits[collection];
      if (!Array.isArray(affixes) || affixes.length > affixLimit) return invalid('POB_CRAFT_AFFIX_COUNT_INVALID', `draft.${collection}`, `该官方底材的${type === 'Prefix' ? '前缀' : '后缀'}最多允许 ${affixLimit} 个。`);
      for (let index = 0; index < affixes.length; index += 1) {
        const affix = affixes[index];
        const path = `draft.${collection}[${index}]`;
        if (!affix || typeof affix !== 'object' || Array.isArray(affix) || typeof affix.id !== 'string') return invalid('POB_CRAFT_AFFIX_INVALID', path, '词缀必须来自当前官方词缀库。');
        const mod = mods.get(affix.id);
        if (!mod) return invalid('POB_CRAFT_AFFIX_UNKNOWN', `${path}.id`, '所选词缀不在当前锁定的官方版本中。');
        if (mod.type !== type) return invalid('POB_CRAFT_AFFIX_TYPE_INVALID', `${path}.id`, `该词缀是官方${mod.type === 'Prefix' ? '前缀' : '后缀'}，不能放入当前栏位。`);
        if (ids.has(mod.id)) return invalid('POB_CRAFT_AFFIX_DUPLICATE', `${path}.id`, '同一词缀不能重复选择。');
        ids.add(mod.id);
        counts[mod.type] += 1;
        const typeLimit = affixLimits[mod.type === 'Prefix' ? 'prefixes' : 'suffixes'];
        if (counts[mod.type] > typeLimit) return invalid('POB_CRAFT_AFFIX_COUNT_INVALID', `draft.${collection}`, `精华固定词缀也会占用${mod.type === 'Prefix' ? '前缀' : '后缀'}栏位，当前类型最多 ${typeLimit} 个。`);
        if (draft.itemLevel < mod.required_item_level) return invalid('POB_CRAFT_AFFIX_ITEM_LEVEL_TOO_LOW', path, `该词缀至少需要物品等级 ${mod.required_item_level}。`, [`将物品等级提高至 ${mod.required_item_level}。`]);
        if (spawnWeight(base, mod) <= 0) return invalid('POB_CRAFT_AFFIX_BASE_INVALID', `${path}.id`, '该词缀不能出现在所选官方底材上。');
        if (groups.has(mod.group)) return invalid('POB_CRAFT_AFFIX_GROUP_CONFLICT', `${path}.id`, '不能同时选择同一官方词缀组的多个词缀。');
        groups.add(mod.group);
        const roll = affix.roll ?? 0.5;
        if (typeof roll !== 'number' || !Number.isFinite(roll) || roll < 0 || roll > 1) return invalid('POB_CRAFT_ROLL_INVALID', `${path}.roll`, '词缀 Roll 必须是 0 至 1 的数字。');
      }
    }
    return null;
  };
}
