import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// This suite deliberately drives the repository's real LuaJIT + HeadlessWrapper
// runtime. The executable is ignored by git and is therefore optional on a clean
// checkout; in that environment the integration gate is reported as skipped,
// while local release verification runs it whenever Builds/luajit is provisioned.
const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const sourceDir = join(repoRoot, 'src');
const luaJit = join(repoRoot, 'Builds', 'luajit', process.platform === 'win32' ? 'luajit.exe' : 'luajit');

async function runOfficialCraftProbe() {
  const tempDir = await mkdtemp(join(tmpdir(), 'pob-cn-crafting-'));
  const scriptPath = join(tempDir, 'probe.lua');
  const script = String.raw`package.path = '../runtime/lua/?.lua;../runtime/lua/?/init.lua;' .. package.path
dofile('HeadlessWrapper.lua')
local Adapter = assert(dofile('../cn/lua/real-calc-adapter.lua'))
local adapter = Adapter.new(_G)

local function ok(response, label)
  assert(response and response.success == true, label .. ': ' .. tostring(response and response.error and response.error.message or 'unknown error'))
  return response
end

local function reportsNonInherited(response, wanted)
  for _, state in ipairs(response.data.nonInheritedStates or {}) do
    if state == wanted then return true end
  end
  return false
end

local catalog = ok(adapter:execute({ action = 'craftCatalog', query = 'Acrid Wand' }), 'craft catalog')
assert(type(catalog.data.bases) == 'table' and #catalog.data.bases >= 1)
assert(catalog.data.bases[1].baseName == 'Acrid Wand')

-- Range metadata must come from the official modifier definition, even when
-- the display text uses PoB's (min-max) form rather than a range control token.
-- The web layer uses this projection to expose a roll slider.
local rangedOptions = ok(adapter:execute({ action = 'craftOptions', actionMode = 'create', baseName = 'Acrid Wand', rarity = 'RARE', itemLevel = 82, draft = {} }), 'ranged options')
local rangedChaos
for _, option in ipairs(rangedOptions.data.prefixes or {}) do
  if option.id == 'ChaosDamagePrefixOnWeapon8' then rangedChaos = option break end
end
assert(rangedChaos and rangedChaos.range and rangedChaos.range.max > rangedChaos.range.min and rangedChaos.range.step > 0, 'official range metadata missing')
local fixedSpellLevel
for _, option in ipairs(rangedOptions.data.suffixes or {}) do
  if option.id == 'GlobalSpellGemsLevelWeapon1' then fixedSpellLevel = option break end
end
assert(fixedSpellLevel and fixedSpellLevel.range == nil, 'fixed-value official modifier must not expose a fabricated range')

local variantCatalog = ok(adapter:execute({ action = 'craftCatalog', query = 'Lament Amulet' }), 'variant catalog')
assert(#variantCatalog.data.bases >= 1)
local variantBase = variantCatalog.data.bases[1].baseName
local variantOptions = ok(adapter:execute({ action = 'craftOptions', actionMode = 'create', baseName = variantBase, rarity = 'RARE', itemLevel = 82, draft = {} }), 'variant options')
assert(type(variantOptions.data.variantList) == 'table' and #variantOptions.data.variantList > 1)

-- Variant implicit ranges are the official ItemsTab rangeLineList contract.
-- Absent Amulet's selected granted skill must remain adjustable from level 1
-- through 20 without the adapter deriving the displayed level itself.
local absentOptions = ok(adapter:execute({ action = 'craftOptions', actionMode = 'create', baseName = 'Absent Amulet', rarity = 'RARE', itemLevel = 80, draft = {} }), 'absent amulet options')
assert(type(absentOptions.data.implicitRanges) == 'table' and #absentOptions.data.implicitRanges == 1, 'active variant implicit range must be projected')
local absentImplicitIndex = absentOptions.data.implicitRanges[1].index
local function absentRangePreview(roll)
  return ok(adapter:execute({ action = 'craftPreview', operation = 'create', draft = {
    baseName = 'Absent Amulet', rarity = 'RARE', itemLevel = 80, variant = 1,
    implicitRanges = { { index = absentImplicitIndex, roll = roll } }, prefixes = {}, suffixes = {},
  } }), 'absent amulet range '..tostring(roll))
end
local absentLow = absentRangePreview(0)
local absentMid = absentRangePreview(0.5)
local absentHigh = absentRangePreview(1)
local function findGrantedSkill(text)
  for _, line in ipairs(text or {}) do
    if line:find('Grants Skill: Level', 1, true) then return line end
  end
  return nil
end
assert(findGrantedSkill(absentLow.data.item.displayLines):find('Level 1 ', 1, true), 'implicit roll 0 must produce official level 1')
assert(findGrantedSkill(absentMid.data.item.displayLines):find('Level 11 ', 1, true), 'implicit roll .5 must produce official level 11')
assert(findGrantedSkill(absentHigh.data.item.displayLines):find('Level 20 ', 1, true), 'implicit roll 1 must produce official level 20')

local catalystCatalog = ok(adapter:execute({ action = 'craftCatalog', query = 'Breach Ring' }), 'catalyst catalog')
assert(#catalystCatalog.data.bases >= 1)
local catalystBase = catalystCatalog.data.bases[1].baseName
local catalystOptions = ok(adapter:execute({ action = 'craftOptions', actionMode = 'create', baseName = catalystBase, rarity = 'RARE', itemLevel = 82, draft = {} }), 'catalyst options')
assert(catalystOptions.data.catalyst and catalystOptions.data.catalyst.canSet == true)
assert(type(catalystOptions.data.catalyst.allowedIds) == 'table' and #catalystOptions.data.catalyst.allowedIds == 14)
local catalystPreview = ok(adapter:execute({ action = 'craftPreview', operation = 'create', draft = {
  baseName = 'Amethyst Ring', rarity = 'RARE', itemLevel = 82, catalyst = 8, catalystQuality = 20, prefixes = {}, suffixes = {},
} }), 'catalyst preview')
assert(catalystPreview.data.item.catalyst == 8 and catalystPreview.data.item.catalystQuality == 20)
assert(type(catalystPreview.data.item.raw) == 'string' and catalystPreview.data.item.raw:find("Catalyst: Chayula's", 1, true))

-- A martial wand must use ItemsTab's official default sockets/quality/implicit
-- initialization and expose display lines separately from canonical raw text.
local emptyDraft = { baseName = 'Acrid Wand', rarity = 'RARE', itemLevel = 82, prefixes = {}, suffixes = {} }
local preview = ok(adapter:execute({ action = 'craftPreview', operation = 'create', draft = emptyDraft }), 'create preview')
local item = preview.data.item
assert(item.base == 'Acrid Wand')
assert(item.socketCount == 3)
assert(item.quality == 20)
assert(type(item.displayLines) == 'table' and #item.displayLines > 0)
assert(type(item.raw) == 'string' and item.raw:find('Sockets: S S S', 1, true))
assert(type(item.tooltip) == 'table' and type(item.tooltip.header) == 'table' and type(item.tooltip.bodyLines) == 'table')
assert(item.tooltip.header.title == 'New Item' and item.tooltip.header.base == 'Acrid Wand', 'tooltip header rows must preserve the official AddItemTooltip output')
local emptyTooltipText = table.concat(item.tooltip.bodyLines, '\n')
assert(not emptyTooltipText:find('New Item', 1, true) and not emptyTooltipText:find('Acrid Wand', 1, true), 'header rows must not be duplicated in tooltip body lines')

-- Acrid Wand is a caster wand with no weaponData. Use an official physical
-- weapon base to prove Item:BuildModList -> AddItemTooltip field passthrough.
local weaponPreview = ok(adapter:execute({ action = 'craftPreview', operation = 'create', draft = {
  baseName = 'Wooden Club', rarity = 'RARE', itemLevel = 82, prefixes = {}, suffixes = {},
} }), 'weapon tooltip preview')
local weaponTooltipText = table.concat(weaponPreview.data.item.tooltip.bodyLines, '\n')
assert(weaponTooltipText:find('Physical Damage:', 1, true), 'official Item weaponData physical damage must be projected')
assert(weaponTooltipText:find('DPS)', 1, true), 'official Item weaponData physical DPS must be projected')
assert(weaponTooltipText:find('Critical Hit Chance:', 1, true), 'official Item weaponData crit chance must be projected')
assert(weaponTooltipText:find('Attacks per Second:', 1, true), 'official Item weaponData attack rate must be projected')

-- Greed's Embrace has an official Vaal flavour origin. AddItemTooltip annotates
-- that origin with item.mutated = true, so projecting it must not mutate the
-- canonical item even while retaining the original upstream tooltip text.
local vaalItem = new('Item', [[Rarity: UNIQUE
Greed's Embrace
Vaal Cuirass]])
adapter:currentBuild().itemsTab:AddItem(vaalItem, true)
vaalItem.mutated = false
local vaalProjection, vaalProjectionError = adapter:projectOfficialItem(vaalItem)
assert(vaalProjection, vaalProjectionError and vaalProjectionError.error and vaalProjectionError.error.message or 'Vaal tooltip projection failed')
local vaalTooltipText = table.concat(vaalProjection.tooltip.bodyLines, '\n')
assert(vaalTooltipText:find('Vaal Body Armour', 1, true), 'tooltip must retain the official Vaal-origin line')
assert(vaalItem.mutated == false, 'official tooltip projection must preserve the source mutated state')

-- Affix materialization and roll normalization must be performed by Item:Craft.
local affixDraft = {
  baseName = 'Acrid Wand', rarity = 'RARE', itemLevel = 82,
  prefixes = { { id = 'ChaosDamagePrefixOnWeapon8', roll = 0.5 } }, suffixes = {},
}
local affixPreview = ok(adapter:execute({ action = 'craftPreview', operation = 'create', draft = affixDraft }), 'affix preview')
local affixItem = affixPreview.data.item
assert(type(affixItem.displayLines) == 'table')
local foundChaos = false
for _, line in ipairs(affixItem.displayLines) do
  if line:find('increased Chaos Damage', 1, true) then foundChaos = true end
end
assert(foundChaos, 'official crafted display must contain the rolled chaos modifier')
assert(not affixItem.displayLines[1]:find('Prefix:', 1, true), 'control Prefix lines must not leak into displayLines')
local missingVariableRoll = adapter:execute({ action = 'craftPreview', operation = 'create', draft = {
  baseName = 'Acrid Wand', rarity = 'RARE', itemLevel = 82,
  prefixes = { { id = 'ChaosDamagePrefixOnWeapon8' } }, suffixes = {},
} })
assert(missingVariableRoll.success == false and missingVariableRoll.error and missingVariableRoll.error.code == 'POB_CRAFT_DRAFT_INVALID', 'variable official modifier must require a normalized roll')
-- Fixed-value official modifiers have no roll range and must be accepted
-- without a synthetic roll value.
local fixedDraft = {
  baseName = 'Acrid Wand', rarity = 'RARE', itemLevel = 82,
  prefixes = {}, suffixes = { { id = 'GlobalSpellGemsLevelWeapon1' } },
}
local fixedPreview = ok(adapter:execute({ action = 'craftPreview', operation = 'create', draft = fixedDraft }), 'fixed-value affix preview')
local fixedText = table.concat(fixedPreview.data.item.displayLines or {}, '\n')
assert(fixedText:find('+1 to Level of all Spell Skills', 1, true), 'fixed-value official modifier must be materialized')
local fixedCommit = ok(adapter:execute({ action = 'craftCommit', operation = 'create', draft = fixedDraft, name = 'integration-fixed-affix' }), 'fixed-value affix commit')
assert(type(fixedCommit.data.item.id) == 'number' and fixedCommit.data.item.id > 0)
assert(type(fixedCommit.data.xml) == 'string' and fixedCommit.data.xml:find('GlobalSpellGemsLevelWeapon1', 1, true), 'fixed-value commit must export the official modifier id')
local fixedReload = ok(adapter:execute({ action = 'loadXML', xml = fixedCommit.data.xml, name = 'integration-fixed-affix-reload' }), 'fixed-value affix XML roundtrip')
local fixedReloaded
for _, libraryItem in ipairs(fixedReload.data.itemLibrary or {}) do
  if libraryItem.id == fixedCommit.data.item.id then fixedReloaded = libraryItem break end
end
assert(fixedReloaded and table.concat(fixedReloaded.displayLines or {}, '\n'):find('+1 to Level of all Spell Skills', 1, true), 'fixed-value modifier must survive XML roundtrip')
local lowRoll = ok(adapter:execute({ action = 'craftPreview', operation = 'create', draft = {
  baseName = 'Acrid Wand', rarity = 'RARE', itemLevel = 82,
  prefixes = { { id = 'ChaosDamagePrefixOnWeapon8', roll = 0 } }, suffixes = {},
} }), 'low roll preview')
local highRoll = ok(adapter:execute({ action = 'craftPreview', operation = 'create', draft = {
  baseName = 'Acrid Wand', rarity = 'RARE', itemLevel = 82,
  prefixes = { { id = 'ChaosDamagePrefixOnWeapon8', roll = 1 } }, suffixes = {},
} }), 'high roll preview')
assert(table.concat(lowRoll.data.item.displayLines or {}, '\n') ~= table.concat(highRoll.data.item.displayLines or {}, '\n'), 'official roll changes must alter display values')

-- The essence modifier is simultaneously an affix in PoB's item model and a
-- structured essence selection in the draft. Its projected affix marker is
-- the only authority the Studio needs to avoid submitting the same modifier
-- twice when it opens an existing crafted item.
local essenceOption
for _, candidate in ipairs(rangedOptions.data.essences or {}) do
  if candidate.mod and (candidate.mod.type == 'Prefix' or candidate.mod.type == 'Suffix') then
    essenceOption = candidate
    break
  end
end
assert(essenceOption, 'Acrid Wand must expose an official compatible essence')
local essenceSelection = { id = essenceOption.id }
if essenceOption.mod.range then essenceSelection.roll = 0.5 end
local essenceDraft = {
  baseName = 'Acrid Wand', rarity = 'RARE', itemLevel = 82,
  prefixes = {}, suffixes = {}, essence = essenceSelection,
}
local essenceSourceCommit = ok(adapter:execute({ action = 'craftCommit', operation = 'create', draft = essenceDraft, name = 'integration-essence-source' }), 'essence source commit')
local essenceSource = essenceSourceCommit.data.item
assert(essenceSource.essence and essenceSource.essence.id == essenceOption.id, 'official essence projection must preserve its source id')
local sourceEssenceAffix
for _, kind in ipairs({ 'prefixes', 'suffixes' }) do
  for _, affix in ipairs(essenceSource[kind] or {}) do
    if affix.essence == true then sourceEssenceAffix = affix break end
  end
  if sourceEssenceAffix then break end
end
assert(sourceEssenceAffix and sourceEssenceAffix.id == essenceOption.mod.id, 'projected essence affix must retain the native essence marker')
local reopenedEssenceDraft = {
  baseName = essenceSource.base, rarity = essenceSource.rarity, itemLevel = essenceSource.itemLevel,
  prefixes = {}, suffixes = {}, essence = { id = essenceSource.essence.id },
}
if essenceSource.essence.roll ~= nil then reopenedEssenceDraft.essence.roll = essenceSource.essence.roll end
for _, kind in ipairs({ 'prefixes', 'suffixes' }) do
  for _, affix in ipairs(essenceSource[kind] or {}) do
    if affix.essence ~= true then table.insert(reopenedEssenceDraft[kind], { id = affix.id, roll = affix.roll }) end
  end
end
local essenceEditOptions = ok(adapter:execute({ action = 'craftOptions', actionMode = 'edit', sourceItemId = essenceSource.id, baseName = essenceSource.base, rarity = essenceSource.rarity, itemLevel = essenceSource.itemLevel, draft = reopenedEssenceDraft }), 'essence edit options')
assert(essenceEditOptions.data.selected.essence and essenceEditOptions.data.selected.essence.id == essenceOption.id, 'options must accept the reopened essence draft exactly once')
local essenceEditPreview = ok(adapter:execute({ action = 'craftPreview', operation = 'edit', sourceItemId = essenceSource.id, draft = reopenedEssenceDraft }), 'essence edit preview')
assert(essenceEditPreview.data.item.essence and essenceEditPreview.data.item.essence.id == essenceOption.id, 'edit preview must retain the requested essence')
local essenceEdited = ok(adapter:execute({ action = 'craftCommit', operation = 'edit', sourceItemId = essenceSource.id, draft = reopenedEssenceDraft, name = 'integration-essence-edit' }), 'essence edit commit')
assert(essenceEdited.data.item.id == essenceSource.id and essenceEdited.data.item.essence and essenceEdited.data.item.essence.id == essenceOption.id, 'edit commit must keep the essence on the canonical item')
local essenceDuplicatePreview = ok(adapter:execute({ action = 'craftPreview', operation = 'duplicate', sourceItemId = essenceSource.id, draft = reopenedEssenceDraft }), 'essence duplicate preview')
assert(essenceDuplicatePreview.data.item.essence and essenceDuplicatePreview.data.item.essence.id == essenceOption.id, 'duplicate preview must retain the explicit essence')
local essenceDuplicated = ok(adapter:execute({ action = 'craftCommit', operation = 'duplicate', sourceItemId = essenceSource.id, draft = reopenedEssenceDraft, name = 'integration-essence-duplicate' }), 'essence duplicate commit')
assert(essenceDuplicated.data.item.id ~= essenceSource.id and essenceDuplicated.data.item.essence and essenceDuplicated.data.item.essence.id == essenceOption.id, 'duplicate commit must retain the explicit essence')

-- A duplicate cannot silently drop crafted affixes. Compare its structured
-- draft with the official source projection, including each native roll and
-- the separately projected essence selection.
local disclosurePrefix, disclosureSuffix
for _, prefix in ipairs(rangedOptions.data.prefixes or {}) do
  if prefix.range and prefix.group ~= essenceOption.mod.group then
    for _, suffix in ipairs(rangedOptions.data.suffixes or {}) do
      if suffix.group ~= prefix.group and suffix.group ~= essenceOption.mod.group then
        disclosurePrefix, disclosureSuffix = prefix, suffix
        break
      end
    end
  end
  if disclosurePrefix then break end
end
assert(disclosurePrefix and disclosureSuffix, 'official options must provide non-conflicting ordinary affixes for duplicate disclosure')
local function craftAffix(option)
  local affix = { id = option.id }
  if option.range then affix.roll = 0.5 end
  return affix
end
local disclosureEssence = { id = essenceOption.id }
if essenceOption.mod.range then disclosureEssence.roll = 0.5 end
local disclosureSourceCommit = ok(adapter:execute({ action = 'craftCommit', operation = 'create', draft = {
  baseName = 'Acrid Wand', rarity = 'RARE', itemLevel = 82,
  prefixes = { craftAffix(disclosurePrefix) }, suffixes = { craftAffix(disclosureSuffix) }, essence = disclosureEssence,
}, name = 'integration-duplicate-affix-source' }), 'duplicate affix source commit')
local disclosureSource = disclosureSourceCommit.data.item
assert(#(disclosureSource.prefixes or {}) > 0 and #(disclosureSource.suffixes or {}) > 0 and disclosureSource.essence, 'official source projection must retain ordinary affixes and essence')
local preservedAffixDraft = {
  baseName = disclosureSource.base, rarity = disclosureSource.rarity, itemLevel = disclosureSource.itemLevel,
  prefixes = {}, suffixes = {}, essence = { id = disclosureSource.essence.id },
}
if disclosureSource.essence.roll ~= nil then preservedAffixDraft.essence.roll = disclosureSource.essence.roll end
for _, kind in ipairs({ 'prefixes', 'suffixes' }) do
  for _, affix in ipairs(disclosureSource[kind] or {}) do
    if affix.essence ~= true then table.insert(preservedAffixDraft[kind], { id = affix.id, roll = affix.roll }) end
  end
end
local omittedAffixDuplicate = ok(adapter:execute({ action = 'craftPreview', operation = 'duplicate', sourceItemId = disclosureSource.id, draft = {
  baseName = disclosureSource.base, rarity = disclosureSource.rarity, itemLevel = disclosureSource.itemLevel, prefixes = {}, suffixes = {},
} }), 'duplicate without affix state')
assert(reportsNonInherited(omittedAffixDuplicate, 'Prefix'), 'duplicate must report a missing ordinary prefix')
assert(reportsNonInherited(omittedAffixDuplicate, 'Suffix'), 'duplicate must report a missing ordinary suffix')
assert(reportsNonInherited(omittedAffixDuplicate, 'Essence'), 'duplicate must report a missing essence')
local omittedAffixOptions = ok(adapter:execute({ action = 'craftOptions', actionMode = 'duplicate', sourceItemId = disclosureSource.id, baseName = disclosureSource.base, rarity = disclosureSource.rarity, itemLevel = disclosureSource.itemLevel, draft = { prefixes = {}, suffixes = {} } }), 'duplicate affix options without source state')
assert(reportsNonInherited(omittedAffixOptions, 'Prefix') and reportsNonInherited(omittedAffixOptions, 'Suffix') and reportsNonInherited(omittedAffixOptions, 'Essence'), 'craftOptions must report every omitted affine state')
local preservedAffixDuplicate = ok(adapter:execute({ action = 'craftPreview', operation = 'duplicate', sourceItemId = disclosureSource.id, draft = preservedAffixDraft }), 'duplicate with exact affix state')
assert(not reportsNonInherited(preservedAffixDuplicate, 'Prefix'), 'exactly preserved ordinary prefix must not be reported as dropped')
assert(not reportsNonInherited(preservedAffixDuplicate, 'Suffix'), 'exactly preserved ordinary suffix must not be reported as dropped')
assert(not reportsNonInherited(preservedAffixDuplicate, 'Essence'), 'exactly preserved essence must not be reported as dropped')
local changedRollDraft = {
  baseName = preservedAffixDraft.baseName, rarity = preservedAffixDraft.rarity, itemLevel = preservedAffixDraft.itemLevel,
  prefixes = {}, suffixes = {}, essence = preservedAffixDraft.essence,
}
for _, affix in ipairs(preservedAffixDraft.prefixes) do table.insert(changedRollDraft.prefixes, { id = affix.id, roll = affix.roll }) end
for _, affix in ipairs(preservedAffixDraft.suffixes) do table.insert(changedRollDraft.suffixes, { id = affix.id, roll = affix.roll }) end
changedRollDraft.prefixes[1].roll = 0
local changedRollDuplicate = ok(adapter:execute({ action = 'craftPreview', operation = 'duplicate', sourceItemId = disclosureSource.id, draft = changedRollDraft }), 'duplicate with changed affix roll')
assert(reportsNonInherited(changedRollDuplicate, 'Prefix'), 'a different official prefix roll must not count as preserved')
local preservedAffixOptions = ok(adapter:execute({ action = 'craftOptions', actionMode = 'duplicate', sourceItemId = disclosureSource.id, baseName = disclosureSource.base, rarity = disclosureSource.rarity, itemLevel = disclosureSource.itemLevel, draft = preservedAffixDraft }), 'duplicate affix options with exact state')
assert(not reportsNonInherited(preservedAffixOptions, 'Prefix') and not reportsNonInherited(preservedAffixOptions, 'Suffix') and not reportsNonInherited(preservedAffixOptions, 'Essence'), 'craftOptions must not report exactly preserved affine state')

-- Commit, edit in place, duplicate explicitly, then export/import through PoB's
-- own XML APIs. Edit preserves the canonical ID; duplicate receives a new ID.
local committed = ok(adapter:execute({ action = 'craftCommit', operation = 'create', draft = affixDraft, name = 'integration' }), 'create commit')
local sourceId = committed.data.item.id
assert(type(sourceId) == 'number' and sourceId > 0, 'source id=' .. tostring(sourceId) .. ' type=' .. type(sourceId))
local autoEditOptions = ok(adapter:execute({ action = 'craftOptions', sourceItemId = sourceId, baseName = 'Acrid Wand', rarity = 'RARE', itemLevel = 82, draft = {} }), 'auto edit options')
assert(autoEditOptions.data.action == 'edit', 'Lua options must select edit for a writable rare source')
local edited = ok(adapter:execute({ action = 'craftCommit', operation = 'edit', sourceItemId = sourceId, draft = emptyDraft, name = 'integration-edit' }), 'edit commit')
assert(edited.data.item.id == sourceId, 'edit must replace the source item ID in place')
local duplicated = ok(adapter:execute({ action = 'craftCommit', operation = 'duplicate', sourceItemId = sourceId, draft = emptyDraft, name = 'integration-duplicate' }), 'duplicate commit')
assert(type(duplicated.data.item.id) == 'number' and duplicated.data.item.id ~= sourceId, 'duplicate must allocate a new item ID')
assert(type(duplicated.data.xml) == 'string' and #duplicated.data.xml > 0)
local reloaded = ok(adapter:execute({ action = 'loadXML', xml = duplicated.data.xml, name = 'integration-roundtrip' }), 'XML roundtrip')
assert(type(reloaded.data.itemLibrary) == 'table' and #reloaded.data.itemLibrary >= 2)
local seenSource, seenDuplicate = false, false
for _, libraryItem in ipairs(reloaded.data.itemLibrary) do
  if libraryItem.id == sourceId then seenSource = true end
  if libraryItem.id == duplicated.data.item.id then seenDuplicate = true end
end
assert(seenSource and seenDuplicate, 'export/import must retain both canonical item IDs')

-- A create operation may atomically equip the newly allocated official item.
local equippedCreate = ok(adapter:execute({ action = 'craftCommit', operation = 'create', target = { kind = 'equipment', itemSetId = 1, slotName = 'Weapon 1' }, draft = emptyDraft, name = 'integration-equipped-create' }), 'create+target commit')
assert(type(equippedCreate.data.item.id) == 'number' and equippedCreate.data.item.id > 0)
assert(type(equippedCreate.data.xml) == 'string' and #equippedCreate.data.xml > 0)
local equippedReload = ok(adapter:execute({ action = 'loadXML', xml = equippedCreate.data.xml, name = 'integration-equipped-reload' }), 'create+target roundtrip')
assert(equippedReload.data.equippedItems and equippedReload.data.equippedItems['Weapon 1'] and equippedReload.data.equippedItems['Weapon 1'].id == equippedCreate.data.item.id)

-- Editing an equipped rare item must preserve its canonical ID and slot
-- reference through export/import.
local equippedEdit = ok(adapter:execute({ action = 'craftCommit', operation = 'edit', sourceItemId = sourceId, target = { kind = 'equipment', itemSetId = 1, slotName = 'Weapon 1' }, draft = affixDraft, name = 'integration-equipped-edit' }), 'edit+target commit')
assert(equippedEdit.data.item.id == sourceId)
local equippedEditReload = ok(adapter:execute({ action = 'loadXML', xml = equippedEdit.data.xml, name = 'integration-equipped-edit-reload' }), 'edit+target roundtrip')
assert(equippedEditReload.data.equippedItems and equippedEditReload.data.equippedItems['Weapon 1'] and equippedEditReload.data.equippedItems['Weapon 1'].id == sourceId)

-- Explicit duplicate+target allocates a new ID while retaining the source.
local equippedDuplicate = ok(adapter:execute({ action = 'craftCommit', operation = 'duplicate', sourceItemId = sourceId, target = { kind = 'equipment', itemSetId = 1, slotName = 'Weapon 1' }, draft = emptyDraft, name = 'integration-equipped-duplicate' }), 'duplicate+target commit')
assert(type(equippedDuplicate.data.item.id) == 'number' and equippedDuplicate.data.item.id ~= sourceId)
local equippedDuplicateReload = ok(adapter:execute({ action = 'loadXML', xml = equippedDuplicate.data.xml, name = 'integration-equipped-duplicate-reload' }), 'duplicate+target roundtrip')
assert(equippedDuplicateReload.data.equippedItems and equippedDuplicateReload.data.equippedItems['Weapon 1'] and equippedDuplicateReload.data.equippedItems['Weapon 1'].id == equippedDuplicate.data.item.id)

-- Inactive equipment jewel sockets stay out of the target set until the
-- official parent slot exposes them through shown().
local equippedJewel = ok(adapter:execute({ action = 'craftPreview', operation = 'create', draft = {
  baseName = 'Time-Lost Ruby', rarity = 'RARE', itemLevel = 82, prefixes = {}, suffixes = {},
} }), 'equipment jewel preview')
assert(type(equippedJewel.data.validTargetSlots.equipmentJewels) == 'table' and #equippedJewel.data.validTargetSlots.equipmentJewels == 0)

local corrupted = ok(adapter:execute({ action = 'craftCommit', operation = 'create', draft = {
  baseName = 'Acrid Wand', rarity = 'RARE', itemLevel = 82, corrupted = true, prefixes = {}, suffixes = {},
} }), 'corrupted create')
local autoDuplicateOptions = ok(adapter:execute({ action = 'craftOptions', sourceItemId = corrupted.data.item.id, baseName = 'Acrid Wand', rarity = 'RARE', itemLevel = 82, draft = {} }), 'auto duplicate options')
assert(autoDuplicateOptions.data.action == 'duplicate', 'Lua options must select duplicate for a read-only source')
local rejectedEdit = adapter:execute({ action = 'craftPreview', operation = 'edit', sourceItemId = corrupted.data.item.id, draft = emptyDraft })
assert(rejectedEdit.success == false and rejectedEdit.error and rejectedEdit.error.code == 'POB_CRAFT_DRAFT_INVALID')
local duplicatedCorrupted = ok(adapter:execute({ action = 'craftPreview', operation = 'duplicate', sourceItemId = corrupted.data.item.id, draft = emptyDraft }), 'corrupted duplicate preview')
local reportedCorrupted = false
for _, state in ipairs(duplicatedCorrupted.data.nonInheritedStates or {}) do if state == 'corrupted' then reportedCorrupted = true end end
assert(reportedCorrupted, 'duplicate must report states that are intentionally not inherited')
local preservedCorrupted = ok(adapter:execute({ action = 'craftPreview', operation = 'duplicate', sourceItemId = corrupted.data.item.id, draft = {
  baseName = 'Acrid Wand', rarity = 'RARE', itemLevel = 82, corrupted = true, prefixes = {}, suffixes = {},
} }), 'corrupted duplicate explicit preservation')
assert(preservedCorrupted.data.item.corrupted == true)
for _, state in ipairs(preservedCorrupted.data.nonInheritedStates or {}) do assert(state ~= 'corrupted', 'explicitly preserved corruption must not be reported as dropped') end

-- Catalyst fields are structured duplicate state as well.  An empty duplicate
-- draft intentionally starts without the source catalyst, but must expose both
-- dropped fields so the caller can decide whether to preserve them explicitly.
local catalystSource = ok(adapter:execute({ action = 'craftCommit', operation = 'create', draft = {
  baseName = 'Amethyst Ring', rarity = 'RARE', itemLevel = 82, catalyst = 8, catalystQuality = 20, prefixes = {}, suffixes = {},
} }), 'catalyst source commit')
local catalystDuplicate = ok(adapter:execute({ action = 'craftPreview', operation = 'duplicate', sourceItemId = catalystSource.data.item.id, draft = {
  baseName = 'Amethyst Ring', rarity = 'RARE', itemLevel = 82, prefixes = {}, suffixes = {},
} }), 'catalyst duplicate preview')
assert(catalystDuplicate.data.item.catalyst == nil and catalystDuplicate.data.item.catalystQuality == nil)
local reportedCatalyst, reportedCatalystQuality = false, false
for _, state in ipairs(catalystDuplicate.data.nonInheritedStates or {}) do
  if state == 'catalyst' then reportedCatalyst = true end
  if state == 'catalystQuality' then reportedCatalystQuality = true end
end
assert(reportedCatalyst and reportedCatalystQuality, 'duplicate must report dropped catalyst state')
local droppedCatalystOptions = ok(adapter:execute({ action = 'craftOptions', actionMode = 'duplicate', sourceItemId = catalystSource.data.item.id, baseName = 'Amethyst Ring', rarity = 'RARE', itemLevel = 82, draft = {
  prefixes = {}, suffixes = {},
} }), 'catalyst duplicate options')
local optionsReportedCatalyst, optionsReportedCatalystQuality = false, false
for _, state in ipairs(droppedCatalystOptions.data.nonInheritedStates or {}) do
  if state == 'catalyst' then optionsReportedCatalyst = true end
  if state == 'catalystQuality' then optionsReportedCatalystQuality = true end
end
assert(optionsReportedCatalyst and optionsReportedCatalystQuality, 'craftOptions must report dropped catalyst state')
local preservedCatalyst = ok(adapter:execute({ action = 'craftPreview', operation = 'duplicate', sourceItemId = catalystSource.data.item.id, draft = {
  baseName = 'Amethyst Ring', rarity = 'RARE', itemLevel = 82, catalyst = 8, catalystQuality = 20, prefixes = {}, suffixes = {},
} }), 'catalyst duplicate explicit preservation')
assert(preservedCatalyst.data.item.catalyst == 8 and preservedCatalyst.data.item.catalystQuality == 20)
for _, state in ipairs(preservedCatalyst.data.nonInheritedStates or {}) do
  assert(state ~= 'catalyst' and state ~= 'catalystQuality', 'explicitly preserved catalyst must not be reported as dropped')
end
local preservedCatalystOptions = ok(adapter:execute({ action = 'craftOptions', actionMode = 'duplicate', sourceItemId = catalystSource.data.item.id, baseName = 'Amethyst Ring', rarity = 'RARE', itemLevel = 82, draft = {
  catalyst = 8, catalystQuality = 20, prefixes = {}, suffixes = {},
} }), 'catalyst duplicate options explicit preservation')
for _, state in ipairs(preservedCatalystOptions.data.nonInheritedStates or {}) do
  assert(state ~= 'catalyst' and state ~= 'catalystQuality', 'craftOptions must agree with duplicate preview state reporting')
end

-- A duplicate starts from a new native item. Every projected state that is not
-- explicitly included in the structured draft must be disclosed rather than
-- silently copied or lost. Socket count and rune state prove this on a martial
-- base, and jewel radius proves it on a radius jewel.
local socketSource = ok(adapter:execute({ action = 'craftCommit', operation = 'create', draft = {
  baseName = 'Acrid Wand', rarity = 'RARE', itemLevel = 82, socketCount = 2, prefixes = {}, suffixes = {},
}, name = 'integration-socket-source' }), 'socket source commit')
assert(socketSource.data.item.socketCount == 2, 'socket source must retain the explicit count')
local socketOmitted = ok(adapter:execute({ action = 'craftPreview', operation = 'duplicate', sourceItemId = socketSource.data.item.id, draft = emptyDraft }), 'socket duplicate without source state')
assert(reportsNonInherited(socketOmitted, 'socketCount'), 'duplicate must report an omitted socket count')
local socketPreserved = ok(adapter:execute({ action = 'craftPreview', operation = 'duplicate', sourceItemId = socketSource.data.item.id, draft = {
  baseName = 'Acrid Wand', rarity = 'RARE', itemLevel = 82, socketCount = 2, prefixes = {}, suffixes = {},
} }), 'socket duplicate explicit preservation')
assert(not reportsNonInherited(socketPreserved, 'socketCount'), 'explicitly preserved socket count must not be reported as dropped')

local realRune
for _, candidate in ipairs(rangedOptions.data.runeCapabilities.allowed or {}) do
  if candidate ~= 'None' then realRune = candidate break end
end
assert(realRune, 'Acrid Wand must expose at least one official rune')
local runedSource = ok(adapter:execute({ action = 'craftCommit', operation = 'create', draft = {
  baseName = 'Acrid Wand', rarity = 'RARE', itemLevel = 82, socketCount = 3, runes = { realRune, realRune, realRune }, prefixes = {}, suffixes = {},
}, name = 'integration-rune-source' }), 'rune source commit')
assert(#(runedSource.data.item.runes or {}) == 3, 'rune source must retain each native rune')
local runeOmitted = ok(adapter:execute({ action = 'craftPreview', operation = 'duplicate', sourceItemId = runedSource.data.item.id, draft = emptyDraft }), 'rune duplicate without source state')
assert(reportsNonInherited(runeOmitted, 'runes'), 'duplicate must report omitted runes')
local runePreserved = ok(adapter:execute({ action = 'craftPreview', operation = 'duplicate', sourceItemId = runedSource.data.item.id, draft = {
  baseName = 'Acrid Wand', rarity = 'RARE', itemLevel = 82, socketCount = 3, runes = { realRune, realRune, realRune }, prefixes = {}, suffixes = {},
} }), 'rune duplicate explicit preservation')
assert(not reportsNonInherited(runePreserved, 'runes'), 'explicitly preserved runes must not be reported as dropped')

local radiusLabel
for _, radius in ipairs(adapter:currentBuild().data.jewelRadius or {}) do
  if radius.label and radius.label ~= 'Small' then radiusLabel = radius.label break end
end
assert(radiusLabel, 'official radius data must expose a non-default radius label')
local radiusSource = ok(adapter:execute({ action = 'craftCommit', operation = 'create', draft = {
  baseName = 'Time-Lost Ruby', rarity = 'RARE', itemLevel = 82, jewelRadiusLabel = radiusLabel, prefixes = {}, suffixes = {},
}, name = 'integration-radius-source' }), 'radius source commit')
assert(radiusSource.data.item.jewelRadiusLabel == radiusLabel, 'radius source must retain the explicit official label')
local radiusOmitted = ok(adapter:execute({ action = 'craftPreview', operation = 'duplicate', sourceItemId = radiusSource.data.item.id, draft = {
  baseName = 'Time-Lost Ruby', rarity = 'RARE', itemLevel = 82, prefixes = {}, suffixes = {},
} }), 'radius duplicate without source state')
assert(reportsNonInherited(radiusOmitted, 'jewelRadiusLabel'), 'duplicate must report an omitted jewel radius')
local radiusPreserved = ok(adapter:execute({ action = 'craftPreview', operation = 'duplicate', sourceItemId = radiusSource.data.item.id, draft = {
  baseName = 'Time-Lost Ruby', rarity = 'RARE', itemLevel = 82, jewelRadiusLabel = radiusLabel, prefixes = {}, suffixes = {},
} }), 'radius duplicate explicit preservation')
assert(not reportsNonInherited(radiusPreserved, 'jewelRadiusLabel'), 'explicitly preserved jewel radius must not be reported as dropped')
print('OFFICIAL_CRAFT_HEADLESS_OK')
`;
  await writeFile(scriptPath, script, 'utf8');
  try {
    const output = await new Promise((resolvePromise, reject) => {
      const child = spawn(luaJit, [scriptPath], { cwd: sourceDir, windowsHide: true });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', chunk => { stdout += chunk.toString(); });
      child.stderr.on('data', chunk => { stderr += chunk.toString(); });
      child.on('error', reject);
      child.on('close', (code, signal) => resolvePromise({ code, signal, stdout, stderr }));
    });
    assert.equal(output.code, 0, `${output.stderr}\n${output.stdout}`);
    assert.match(output.stdout, /OFFICIAL_CRAFT_HEADLESS_OK/);
    return output.stdout;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test('official crafting contract runs through the real LuaJIT HeadlessWrapper', async t => {
  if (!existsSync(luaJit)) {
    t.skip(`real LuaJIT executable not provisioned at ${luaJit}`);
    return;
  }
  await runOfficialCraftProbe();
});
