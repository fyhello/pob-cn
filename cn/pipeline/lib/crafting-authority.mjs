import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const hash = value => createHash('sha256').update(value).digest('hex');
const requiredMetadata = ['schema_version', 'reviewed_at_utc_plus_8', 'reviewed_by'];
const requiredEntry = ['id', 'text', 'source_path', 'source_sha256', 'source_locator'];

function requireFields(value, fields, label) {
  if (!value || typeof value !== 'object') throw new Error(`${label} is invalid`);
  for (const field of fields) if (!(field in value) || value[field] === '' || value[field] == null) throw new Error(`${label} missing ${field}`);
}

function indexed(entries, label) {
  if (!Array.isArray(entries) || !entries.length) throw new Error(`${label} must not be empty`);
  const values = new Map();
  for (const entry of entries) {
    requireFields(entry, requiredEntry, label);
    if (typeof entry.text !== 'string' || !entry.text.trim()) throw new Error(`${label} contains an empty translation`);
    if (values.has(entry.id)) throw new Error(`${label} contains a duplicate id: ${entry.id}`);
    values.set(entry.id, entry);
  }
  return values;
}

function input(lockedInputs, id) {
  const found = lockedInputs.find(value => value.id === id);
  if (!found) throw new Error(`locked crafting input is missing: ${id}`);
  return found;
}

function keysFromLua(contents) {
  return [...contents.matchAll(/^\t\["((?:\\.|[^"\\])+)"\]\s*=\s*\{/gm)].map(match => match[1].replaceAll('\\"', '"'));
}

function luaEntries(contents, expression, label) {
  const entries = [];
  let match;
  while ((match = expression.exec(contents))) {
    let cursor = expression.lastIndex;
    let depth = 1;
    let quoted = false;
    let escaped = false;
    while (cursor < contents.length && depth > 0) {
      const character = contents[cursor++];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') quoted = false;
      } else if (character === '"') quoted = true;
      else if (character === '{') depth += 1;
      else if (character === '}') depth -= 1;
    }
    if (depth !== 0) throw new Error(`${label} Lua entry is not balanced: ${match[1]}`);
    entries.push({ id: match[1].replace(/\\(.)/g, '$1'), body: contents.slice(expression.lastIndex, cursor - 1) });
  }
  if (!entries.length) throw new Error(`${label} has no entries`);
  return entries;
}

function stringField(body, field) {
  const value = body.match(new RegExp(`\\b${field}\\s*=\\s*"((?:\\\\.|[^"\\\\])*)"`));
  if (!value) return undefined;
  return value[1].replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function numberField(body, field) {
  const value = body.match(new RegExp(`\\b${field}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`));
  return value ? Number(value[1]) : null;
}

function arrayField(body, field) {
  const table = body.match(new RegExp(`\\b${field}\\s*=\\s*\\{([\\s\\S]*?)\\}`));
  return table ? [...table[1].matchAll(/"((?:\\.|[^"\\])*)"/g)].map(value => value[1].replace(/\\(.)/g, '$1')) : [];
}

function numberArrayField(body, field) {
  const table = body.match(new RegExp(`\\b${field}\\s*=\\s*\\{([\\s\\S]*?)\\}`));
  if (!table) return [];
  return table[1].split(',').map(value => value.trim()).filter(Boolean).map(value => Number(value));
}

function clamp(value, lower, upper) {
  return Math.max(lower, Math.min(value, upper));
}

function affixLimitAdjustments(implicit) {
  const adjustments = { prefixes: 0, suffixes: 0 };
  for (const line of (implicit ?? '').split(/\r?\n/)) {
    const match = line.trim().match(/^([+-]\d+)\s+(Prefix|Suffix)\s+Modifiers?\s+allowed$/i);
    if (!match) continue;
    adjustments[match[2].toLowerCase() === 'prefix' ? 'prefixes' : 'suffixes'] += Number(match[1]);
  }
  return adjustments;
}

function officialAffixLimits(type, subType, implicit) {
  const adjustments = affixLimitAdjustments(implicit);
  const limitsFor = corrupted => {
    // This is the exact rare-item capacity branch in src/Classes/Item.lua.
    const total = type === 'Jewel' && !(subType === 'Abyss' && corrupted) ? 4 : 6;
    const perKind = total / 2;
    return {
      prefixes: clamp(perKind + adjustments.prefixes, 0, total),
      suffixes: clamp(perKind + adjustments.suffixes, 0, total),
    };
  };
  return { normal: limitsFor(false), corrupted: limitsFor(true) };
}

function officialCraftRules(type, subType, implicit, hidden) {
  const rareLimits = officialAffixLimits(type, subType, implicit);
  const adjustments = affixLimitAdjustments(implicit);
  const magicLimits = {
    prefixes: clamp(1 + adjustments.prefixes, 0, 2),
    suffixes: clamp(1 + adjustments.suffixes, 0, 2),
  };
  const magicOnly = type === 'Flask' || type === 'Charm' || (type === 'Jewel' && subType === 'Charm');
  const normalOnly = type === 'Transcendent Limb';
  const allowedRarities = normalOnly ? ['NORMAL'] : magicOnly ? ['NORMAL', 'MAGIC'] : ['NORMAL', 'MAGIC', 'RARE'];

  return {
    craftable: !hidden,
    allowed_rarities: allowedRarities,
    corruptible: type !== 'Flask' && type !== 'Charm' && type !== 'Transcendent Limb',
    rarity_affix_limits: {
      NORMAL: { normal: { prefixes: 0, suffixes: 0 }, corrupted: { prefixes: 0, suffixes: 0 } },
      MAGIC: { normal: magicLimits, corrupted: magicLimits },
      RARE: rareLimits,
    },
  };
}

function modLines(body, id) {
  const statOrder = body.search(/\bstatOrder\s*=/);
  const affix = body.match(/\baffix\s*=\s*"(?:\\.|[^"\\])*"\s*,?/);
  const type = body.match(/\btype\s*=\s*"(?:\\.|[^"\\])*"\s*,?/);
  const start = affix ? affix.index + affix[0].length : type ? type.index + type[0].length : 0;
  const section = body.slice(start, statOrder >= 0 ? statOrder : body.length);
  const lines = [...section.matchAll(/"((?:\\.|[^"\\])*)"/g)].map(value => value[1].replace(/\\(.)/g, '$1'));
  if (!lines.length) throw new Error(`item modifier has no official text: ${id}`);
  return lines;
}

function ranges(lines) {
  return lines.map((line, lineIndex) => [...line.matchAll(/\((-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\)/g)].map(value => ({ line_index: lineIndex, min: Number(value[1]), max: Number(value[2]) }))).flat();
}

function unique(entries, label) {
  const ids = new Set();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`${label} contains duplicate id: ${entry.id}`);
    ids.add(entry.id);
  }
  return entries.sort((left, right) => left.id.localeCompare(right.id));
}

function itemMods(input, contents) {
  const records = luaEntries(contents, /^\s*\["((?:\\.|[^"\\])+)"\]\s*=\s*\{/gm, 'item modifiers')
    .map(({ id, body }) => {
      const type = stringField(body, 'type');
      if (type !== 'Prefix' && type !== 'Suffix') return null;
      const weightKeys = arrayField(body, 'weightKey');
      const weightValues = numberArrayField(body, 'weightVal');
      const level = numberField(body, 'level');
      const group = stringField(body, 'group');
      if (!Number.isInteger(level) || level < 1 || !group || !weightKeys.length || weightKeys.length !== weightValues.length || weightValues.some(value => !Number.isFinite(value))) throw new Error(`item modifier authority is incomplete: ${id}`);
      return {
        id,
        type,
        group,
        required_item_level: level,
        lines: modLines(body, id),
        value_ranges: ranges(modLines(body, id)),
        roll_model: 'pob_range_scalar_0_to_1',
        spawn_weights: weightKeys.map((tag, index) => ({ tag, weight: weightValues[index] })),
        source_path: input.path,
        source_sha256: input.sha256,
        source_locator: `${input.path}#${id}`,
      };
    })
    .filter(Boolean);
  if (!records.length) throw new Error('item modifier authority has no prefix or suffix records');
  return unique(records, 'item modifier authority');
}

function stringMapField(body, field) {
  const table = body.match(new RegExp(`\\b${field}\\s*=\\s*\\{([\\s\\S]*?)\\}`));
  if (!table) return [];
  return [...table[1].matchAll(/\["((?:\\.|[^"\\])*)"\]\s*=\s*"((?:\\.|[^"\\])*)"/g)]
    .map(match => ({
      key: match[1].replace(/\\(.)/g, '$1'),
      value: match[2].replace(/\\(.)/g, '$1'),
    }));
}

function essences(input, contents, mods) {
  const modById = new Map(mods.map(mod => [mod.id, mod]));
  const records = luaEntries(contents, /^\s*\["((?:\\.|[^"\\])+)"\]\s*=\s*\{/gm, 'essences')
    .map(({ id, body }) => {
      const name = stringField(body, 'name');
      const type = stringField(body, 'type');
      const tierLevel = numberField(body, 'tierLevel');
      const mappings = stringMapField(body, 'mods');
      if (!name || !type || !Number.isInteger(tierLevel) || tierLevel < 1) return null;
      // The upstream essence table also references display-only exclusive
      // records. They have no prefix/suffix identity, so the strict creator
      // cannot safely account for their affix slot or group. Keep only the
      // official item-mod records with that complete authority contract.
      const applicableMods = mappings.flatMap(({ key, value }) => {
        const mod = modById.get(value);
        if (!mod) return [];
        return [{
          base_type: key,
          mod_id: value,
          mod_type: mod.type,
          group: mod.group,
          lines: mod.lines,
        }];
      }).sort((left, right) => left.base_type.localeCompare(right.base_type));
      return {
        id,
        text: name,
        name,
        type,
        tier_level: tierLevel,
        mods: applicableMods,
        source_path: input.path,
        source_sha256: input.sha256,
        source_locator: `${input.path}#${id}`,
      };
    })
    .filter(Boolean);
  if (!records.length) throw new Error('essence authority has no applicable records');
  return unique(records, 'essence authority');
}

function itemBases(input, files, readLockedFile) {
  const records = new Map();
  for (const file of files) {
    const contents = readLockedFile({ ...input, path: file.path, sha256: file.sha256 });
    for (const { id, body } of luaEntries(contents, /itemBases\["((?:\\.|[^"\\])+)"\]\s*=\s*\{/g, file.path)) {
      const type = stringField(body, 'type');
      const tags = [...(body.match(/\btags\s*=\s*\{([\s\S]*?)\}/)?.[1] ?? '').matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*true/g)].map(value => value[1]).sort();
      const requirements = body.match(/\breq\s*=\s*\{([\s\S]*?)\}/)?.[1] ?? '';
      const requiredItemLevel = numberField(requirements, 'level') ?? 1;
      const attributeRequirements = Object.fromEntries(['str', 'dex', 'int'].map(attribute => [attribute, numberField(requirements, attribute) ?? 0]));
      const socketLimit = numberField(body, 'socketLimit') ?? 0;
      const implicit = stringField(body, 'implicit') ?? null;
      const subType = stringField(body, 'subType') ?? null;
      const variantList = arrayField(body, 'variantList');
      const hidden = /\bhidden\s*=\s*true\b/.test(body);
      if (!type || !tags.length || !Number.isInteger(requiredItemLevel) || requiredItemLevel < 1) throw new Error(`item base authority is incomplete: ${id}`);
      const craftRules = officialCraftRules(type, subType, implicit, hidden);
      // Match Lua table assignment semantics: later declarations replace earlier variants.
      records.set(id, {
        id,
        type,
        tags,
        required_item_level: requiredItemLevel,
        attribute_requirements: attributeRequirements,
        socket_limit: socketLimit,
        implicit,
        sub_type: subType,
        affix_limits: craftRules.rarity_affix_limits.RARE,
        craftable: craftRules.craftable,
        allowed_rarities: craftRules.allowed_rarities,
        corruptible: craftRules.corruptible,
        rarity_affix_limits: craftRules.rarity_affix_limits,
        variant_list: variantList.length ? variantList : undefined,
        hidden,
        source_path: file.path,
        source_sha256: file.sha256,
        source_locator: `${file.path}#${id}`,
      });
    }
  }
  return [...records.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function buildCraftingAuthority(lockedInputs, readLockedFile) {
  const runeInput = input(lockedInputs, 'upstream.crafting.runes');
  const essenceInput = input(lockedInputs, 'upstream.crafting.essences');
  const itemModInput = input(lockedInputs, 'upstream.crafting.item-mods');
  const jewelModInput = input(lockedInputs, 'upstream.crafting.jewel-mods');
  const itemBaseInput = input(lockedInputs, 'upstream.crafting.item-bases');
  if (!Array.isArray(itemBaseInput.collection_files) || !itemBaseInput.collection_files.length) throw new Error('locked item base collection is missing');
  const make = (entry, contents, label) => {
    const ids = keysFromLua(contents);
    if (!ids.length || new Set(ids).size !== ids.length) throw new Error(`${label} authority identifiers are invalid`);
    return ids.map(id => ({ id, text: id, source_path: entry.path, source_sha256: entry.sha256, source_locator: `${entry.path}#${id}` }));
  };
  const authoritativeMods = unique([
    ...itemMods(itemModInput, readLockedFile(itemModInput)),
    ...itemMods(jewelModInput, readLockedFile(jewelModInput)),
  ], 'combined item modifier authority');
  return {
    runes: make(runeInput, readLockedFile(runeInput), 'rune'),
    essences: essences(essenceInput, readLockedFile(essenceInput), authoritativeMods),
    itemMods: authoritativeMods,
    itemBases: itemBases(itemBaseInput, itemBaseInput.collection_files, readLockedFile),
  };
}

export function buildCraftingAuthorityV2(authority) {
  return {
    schema_version: 2,
    authority: 'locked-upstream-pob',
    item_bases: authority.itemBases,
    item_mods: authority.itemMods,
    runes: authority.runes,
    essences: authority.essences,
  };
}

export async function loadReviewedSlotTagMap(lockedInputs) {
  const entry = input(lockedInputs, 'crafting.slot-tag-map');
  const map = JSON.parse(await readFile(entry.absolute_path, 'utf8'));
  requireFields(map, ['schema_version', 'source_kind', 'source_description', 'reviewed_at_utc_plus_8', 'reviewed_by', 'review_evidence', 'entries'], 'slot tag map');
  if (map.schema_version !== 1 || map.source_kind !== 'CN_SOURCE') throw new Error('slot tag map schema or source kind is invalid');
  if (hash(await readFile(entry.absolute_path)) !== entry.sha256) throw new Error('slot tag map hash is not locked');
  for (const value of map.entries) if (value.source_path.includes('seed.zh-CN.json')) throw new Error('slot tag map must not reference seed');
  indexed(map.entries, 'slot tag map');
  return map;
}

function verifyExact(seedEntries, authorityEntries, label) {
  const seed = indexed(seedEntries, `${label} seed`);
  const authority = indexed(authorityEntries, `${label} authority`);
  const missing = [...authority.keys()].filter(id => !seed.has(id));
  const unknown = [...seed.keys()].filter(id => !authority.has(id));
  if (missing.length || unknown.length) throw new Error(`${label} identifiers mismatch: missing=${missing.length}, unknown=${unknown.length}`);
  for (const [id, value] of seed) {
    const expected = authority.get(id);
    if (value.source_path !== expected.source_path || value.source_sha256 !== expected.source_sha256 || value.source_locator !== expected.source_locator) throw new Error(`${label} source evidence does not match authority: ${id}`);
  }
}

export function validateCraftingSeed(seed, authority, slotTagMap) {
  requireFields(seed, [...requiredMetadata, 'runes', 'essences', 'slotTagMap'], 'crafting seed');
  if (seed.schema_version !== 1) throw new Error('crafting seed schema version is invalid');
  verifyExact(seed.runes, authority.runes, 'runes');
  verifyExact(seed.essences, authority.essences, 'essences');
  const slotAuthority = indexed(slotTagMap.entries, 'slot tag map');
  const slots = indexed(seed.slotTagMap, 'slot tag seed');
  const missing = [...slotAuthority.keys()].filter(id => !slots.has(id));
  const unknown = [...slots.keys()].filter(id => !slotAuthority.has(id));
  if (missing.length || unknown.length) throw new Error(`slot tag identifiers mismatch: missing=${missing.length}, unknown=${unknown.length}`);
  for (const value of slots.values()) {
    if (value.source_path !== 'cn/pipeline/sources/crafting/slot-tag-map.zh-CN.json' || !value.source_sha256 || !value.source_locator) throw new Error(`slot tag source evidence does not match locked map: ${value.id}`);
  }
  return seed;
}

export async function loadAndValidateCraftingSeed(repoRoot, lockedInputs) {
  const seedInput = input(lockedInputs, 'crafting.seed.zh-CN');
  const seed = JSON.parse(await readFile(seedInput.absolute_path, 'utf8'));
  if (hash(await readFile(seedInput.absolute_path)) !== seedInput.sha256) throw new Error('crafting seed hash is not locked');
  const authority = buildCraftingAuthority(lockedInputs, entry => readFileSync(resolve(repoRoot, entry.path), 'utf8'));
  const slotTagMap = await loadReviewedSlotTagMap(lockedInputs);
  validateCraftingSeed(seed, authority, slotTagMap);
  return { seed, authority, slotTagMap };
}
