import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = relative => readFile(new URL(relative, import.meta.url), 'utf8');

test('crafting studio submits structured drafts only and takes craft rules from the Lua options response', async () => {
  const studio = await source('../../web/src/components/ItemCraftingStudio.vue');
  assert.match(studio, /getOfficialCraftCatalog/);
  assert.match(studio, /getOfficialCraftOptions/);
  assert.match(studio, /officialOptionsFingerprint/);
  assert.match(studio, /refreshOfficialOptions/);
  assert.match(studio, /previewOfficialCraft/);
  assert.match(studio, /commitOfficialCraft/);
  assert.match(studio, /watch\(\(\) => props\.isOpen, async open =>/);
  assert.match(studio, /const defaultCraftItemLevel = 82;/);
  assert.match(studio, /if \(!props\.itemToEdit\) itemLevel\.value = defaultCraftItemLevel;/);
  assert.match(studio, /\}, \{ immediate: true \}\);/);
  assert.match(studio, /craftOptions\.value\?\.prefixes/);
  assert.match(studio, /craftOptions\.value\?\.essences/);
  assert.match(studio, /tierOptions/);
  assert.match(studio, /affixCounts/);
  assert.match(studio, /qualityLimit/);
  assert.match(studio, /prefixes: draft\.prefixes\.map\(affix => \(\{ id: affix\.id \}\)\)/);
  assert.match(studio, /suffixes: draft\.suffixes\.map\(affix => \(\{ id: affix\.id \}\)\)/);
  assert.match(studio, /implicitRanges: implicitRanges\.value\.map\(range => \(\{ index: range\.index \}\)\)/);
  assert.doesNotMatch(studio, /officialSpawnWeight/);
  assert.doesNotMatch(studio, /authority\.essences/);
  assert.doesNotMatch(studio, /authority\.item_mods/);
  assert.doesNotMatch(studio, /socket_limit/);
  assert.doesNotMatch(studio, /Math\./);
  assert.doesNotMatch(studio, /Number\(/);
});

test('new crafting creates an official library item and editing an item never writes through raw text', async () => {
  const panel = await source('../../web/src/components/ItemsPanel.vue');
  const studio = await source('../../web/src/components/ItemCraftingStudio.vue');
  const store = await source('../../web/src/stores/buildStore.ts');
  assert.match(panel, /@click="openNewCraftStudio"/);
  assert.match(studio, /craftAction/);
  assert.match(studio, /item\.rarity === 'UNIQUE'/);
  assert.match(studio, /sourceBaseUnavailable/);
  assert.match(studio, /不能创建副本/);
  assert.doesNotMatch(store, /previewOfficialRawItem/);
  assert.doesNotMatch(store, /commitOfficialRawItem/);
  assert.doesNotMatch(studio, /rawItem/);
});

test('defers the large crafting data bundle until the workbench is opened', async () => {
  const app = await source('../../web/src/App.vue');
  const panel = await source('../../web/src/components/ItemsPanel.vue');
  assert.match(app, /defineAsyncComponent\(\(\) => import\('\.\/components\/ItemsPanel\.vue'\)\)/);
  assert.match(panel, /const ItemCraftingStudio = defineAsyncComponent\(loadItemCraftingStudio\)/);
  assert.match(panel, /v-if="isStudioOpen"/);
  assert.match(panel, /@mouseenter="warmCraftingStudio"/);
});

test('crafting studio invalidates stale previews and applies only official rune capabilities', async () => {
  const studio = await source('../../web/src/components/ItemCraftingStudio.vue');
  assert.match(studio, /watch\(previewFingerprint/);
  assert.match(studio, /previewIsCurrent/);
  assert.match(studio, /requestFingerprint !== previewFingerprint\.value/);
  assert.match(studio, /previewItem\.value = null/);
  assert.match(studio, /runeCapabilities\.value = options\.runeCapabilities/);
  assert.match(studio, /reconcileOfficialRunes/);
  assert.match(studio, /v-for="rune in runeCapabilities\.allowed"/);
  assert.match(studio, /runeCapabilities\.allowed\.includes\('None'\)/);
  assert.match(studio, /runes: selectedRunes\.value\.length > 0 \? \[\.\.\.selectedRunes\.value\] : undefined/);
  assert.match(studio, /validTargetSlots/);
  assert.match(studio, /selectedTargetKey/);
  assert.match(studio, /equipment:\$\{slot\}/);
  assert.match(studio, /jewel:\$\{slot\.nodeId\}/);
  assert.doesNotMatch(studio, /ItemQuickCreatePanel/);
  assert.doesNotMatch(studio, /rawText/);
});

test('crafting preview card renders only the structured Lua tooltip projection', async () => {
  const studio = await source('../../web/src/components/ItemCraftingStudio.vue');
  assert.match(studio, /v-if="previewItem\?\.tooltip\?\.header"/);
  assert.match(studio, /function officialTooltipTitle\(item: any\): string/);
  assert.match(studio, /officialTooltipTitle\(previewItem\)/);
  assert.match(studio, /previewItem\.tooltip\.header\.base/);
  assert.match(studio, /Array\.isArray\(previewItem\.tooltip\.bodyLines\)/);
  assert.match(studio, /v-for="\(line, index\) in previewItem\.tooltip\.bodyLines"/);
  assert.match(studio, /等待官方预览/);
  assert.doesNotMatch(studio, /getLineColor/);
});

test('variant implicit ranges stay official and are submitted as normalized positions', async () => {
  const studio = await source('../../web/src/components/ItemCraftingStudio.vue');
  assert.match(studio, /type OfficialImplicitRange = \{ index: number; roll: number; line\?: string \}/);
  assert.match(studio, /v-for="range in implicitRanges"/);
  assert.match(studio, /payload\.implicitRanges = implicitRanges\.value\.map\(range => \(\{ index: range\.index, roll: range\.roll \}\)\)/);
  assert.match(studio, /implicitRanges: implicitRanges\.value\.map\(range => \(\{ index: range\.index, roll: range\.roll \}\)\)/);
  assert.doesNotMatch(studio, /Grants Skill: Level|1 \+ .*19|\*\s*19/);
});

test('crafting roll labels format floating-point noise without changing draft values', async () => {
  const studio = await source('../../web/src/components/ItemCraftingStudio.vue');
  assert.match(studio, /function formatRoll\(value: number \| undefined\): string/);
  assert.match(studio, /new Intl\.NumberFormat\('en-US', \{ maximumFractionDigits: 12 \}\)\.format\(value \?\? 0\)/);
  assert.doesNotMatch(studio, /formatRoll\([^\n]*\)\s*=|formatRoll\([^\n]*\)\s*=>/);
});

test('successful official options refresh clears a stale level error', async () => {
  const studio = await source('../../web/src/components/ItemCraftingStudio.vue');
  assert.match(studio, /reconcileOfficialRunes\(options\.runeCapabilities\);\s*error\.value = '';\s*return true;/);
});

test('crafting roll controls remain explicit native sliders with a visible affordance', async () => {
  const studio = await source('../../web/src/components/ItemCraftingStudio.vue');
  assert.equal((studio.match(/class="craft-roll-slider/g) ?? []).length, 3);
  assert.match(studio, /class="craft-roll-slider min-w-24 flex-1 craft-roll-slider-violet"/);
  assert.match(studio, /\.craft-roll-slider::-webkit-slider-thumb/);
  assert.match(studio, /\.craft-roll-slider:focus-visible/);
});

test('crafting studio submits an explicit target only from Lua validTargetSlots', async () => {
  const studio = await source('../../web/src/components/ItemCraftingStudio.vue');
  assert.match(studio, /validTargetSlots\?\.equipment/);
  assert.match(studio, /validTargetSlots\?\.equipmentJewels/);
  assert.match(studio, /validTargetSlots\?\.jewels/);
  assert.match(studio, /type Target = \{ kind: 'equipment'; itemSetId: number; slotName: string \}/);
  assert.match(studio, /\{ kind: 'jewel'; specId: number; nodeId: number \}/);
  assert.match(studio, /if \(!Number\.isInteger\(store\.loadouts\?\.active\?\.itemSetId\)\) return \[\];/);
  assert.match(studio, /if \(!Number\.isInteger\(store\.loadouts\?\.active\?\.specId\)\) return \[\];/);
  assert.match(studio, /selectedTargetKey\.value = '';/);
  assert.match(studio, /if \(!initialTargetPending\.value\) return;/);
  assert.match(studio, /watch\(\[targetEquipmentSlots, targetJewelSlots\], reconcileTargetSelection\);/);
  assert.doesNotMatch(studio, /getItemCategory\(/);
  assert.doesNotMatch(studio, /slotName\.includes\(/);
});

test('crafting action is returned by Lua craft options and never inferred from source item fields', async () => {
  const studio = await source('../../web/src/components/ItemCraftingStudio.vue');
  assert.match(studio, /action\?: 'create' \| 'edit' \| 'duplicate';/);
  assert.match(studio, /const action = craftOptions\.value\?\.action;/);
  assert.match(studio, /action === 'create' \|\| action === 'edit' \|\| action === 'duplicate'/);
  assert.match(studio, /const action = craftAction\.value;/);
  assert.doesNotMatch(studio, /action: craftAction\.value/);
  assert.doesNotMatch(studio, /props\.itemToEdit\?\.mirrored/);
  assert.doesNotMatch(studio, /props\.itemToEdit\?\.sanctified/);
  assert.doesNotMatch(studio, /props\.itemToEdit\?\.corrupted/);
  assert.doesNotMatch(studio, /props\.itemToEdit\?\.fractured/);
  assert.doesNotMatch(studio, /props\.itemToEdit\?\.craftability/);
});

test('reopening an editable source preserves its level through asynchronous catalog base selection before Lua returns edit options', async () => {
  const studio = await source('../../web/src/components/ItemCraftingStudio.vue');

  assert.match(studio, /preserveNextBaseDraft = Boolean\(props\.itemToEdit\);/);
  assert.match(studio, /try \{\s*await nextTick\(\);\s*if \(!props\.itemToEdit\) itemLevel\.value = defaultCraftItemLevel;/);
  assert.match(studio, /if \(await refreshOfficialCatalog\(\)\) \{\s*if \(await refreshOfficialOptions\(\)\) await preview\(\);/);
  assert.match(studio, /finally \{\s*preserveNextBaseDraft = false;/);
  assert.match(studio, /if \(!preserveNextBaseDraft\) \{\s*if \(!previousBaseName\) itemLevel\.value = defaultCraftItemLevel;/);
  assert.match(studio, /sourceItemId: sourceItemId\.value,/);
  assert.match(studio, /const action = craftOptions\.value\?\.action;/);
});

test('crafting studio renders Lua-reported non-inherited duplicate states without client-side state rules', async () => {
  const studio = await source('../../web/src/components/ItemCraftingStudio.vue');
  assert.match(studio, /nonInheritedStates\?: string\[\];/);
  assert.match(studio, /const optionsNonInheritedStates = ref<string\[\]>\(\[\]\);/);
  assert.match(studio, /const previewNonInheritedStates = ref<string\[\]>\(\[\]\);/);
  assert.match(studio, /optionsNonInheritedStates\.value = readNonInheritedStates\(options\);/);
  assert.match(studio, /previewNonInheritedStates\.value = readNonInheritedStates\(result\.data\);/);
  assert.match(studio, /v-if="craftAction === 'duplicate' && nonInheritedStates\.length"/);
  assert.match(studio, /v-for="state in nonInheritedStates"/);
  assert.match(studio, /translateWebText\(state\)/);
  assert.doesNotMatch(studio, /nonInheritedStateLabels|NON_INHERITED_STATE/);
});

test('every Lua-reported duplicate state has a generated single-dictionary translation', async () => {
  const translations = JSON.parse(await source('../../generated/web-data/translations.json'));
  const duplicateStateKeys = [
    'Prefix', 'Suffix', 'Essence',
    'fractured', 'desecrated', 'mutated', 'mirrored', 'sanctified', 'corrupted', 'doubleCorrupted',
    'uniqueID', 'clusterJewel', 'enchantModLines', 'classRequirementModLines',
    'catalyst', 'catalystQuality', 'quality', 'variant', 'socketCount', 'runes', 'jewelRadiusLabel', 'title',
  ];
  const domains = ['items', 'stats', 'tooltip', 'ui', 'terms'];

  for (const state of duplicateStateKeys) {
    const translated = domains.some(domain => typeof translations[domain]?.[state] === 'string' && translations[domain][state].trim());
    assert.equal(translated, true, `duplicate state ${state} must be defined in translations.json`);
  }
});

test('catalog and official crafting options runtime display values are covered by the generated dictionary', async () => {
  const translations = JSON.parse(await source('../../generated/web-data/translations.json'));
  const catalogAndOptionTerms = [
    ['NORMAL', '普通'], ['MAGIC', '魔法'], ['Rarity', '稀有度'],
    ['Hysteria', '歇斯底里'], ['ColdResist', '冰霜抗性'], ['FireResist', '火焰抗性'], ['LightningResist', '闪电抗性'], ['SpeedCaster', '施法速度'],
    ['None', '无'], ['Flesh', '生命'], ['Neural', '魔力'], ['Carapace', '防御'],
    ["Uul-Netol's", '乌尔尼多的'], ["Xoph's", '索伏的'], ["Tul's", '托沃的'], ["Esh's", '艾许的'], ["Chayula's", '夏乌拉的'],
    ['Reaver', '攻击'], ['Sibilant', '施法'], ['Skittering', '速度'], ['Adaptive', '全属性'], ['Necrotic', '召唤'],
  ];
  const domains = ['items', 'stats', 'tooltip', 'ui', 'terms'];

  for (const [value, expected] of catalogAndOptionTerms) {
    const translated = domains.map(domain => translations[domain]?.[value]).find(Boolean);
    assert.equal(translated, expected, `runtime crafting value ${value} must resolve through translations.json`);
  }
});

test('reopening an essence-crafted item keeps its native essence affix out of the ordinary affix arrays', async () => {
  const studio = await source('../../web/src/components/ItemCraftingStudio.vue');
  assert.match(studio, /filter\(\(affix: any\) => affix\.essence !== true\)/);
  assert.match(studio, /jewelRadiusLabel: jewelRadiusLabel\.value \|\| undefined/);
  assert.match(studio, /payload\.socketCount = requestedSocketCount\.value/);
});

test('crafting studio translates official rarity and essence types, and renders complete official mod lines', async () => {
  const studio = await source('../../web/src/components/ItemCraftingStudio.vue');
  assert.match(studio, /translateWebText\(value\)/);
  assert.match(studio, /translateWebText\(selectedEssenceMod\.type\)/);
  assert.match(studio, /translateWebText\(essence\.type\)/);
  assert.match(studio, /function officialModLines\(mod: OfficialCraftMod \| null \| undefined\)/);
  assert.match(studio, /officialModLines\(selectedEssenceMod\)/);
  assert.match(studio, /officialModLines\(optionModFor\(affix\.id\)\)/);
  assert.match(studio, /officialModLabel\(sibling\)/);
  assert.doesNotMatch(studio, /function rarityLabel/);
  assert.doesNotMatch(studio, /function getModTierLabel/);
  assert.doesNotMatch(studio, /\.lines\[0\]/);
  assert.doesNotMatch(studio, /Tier \$\{sibling\.tier\}/);
});
