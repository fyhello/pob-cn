dofile('../cn/bridge/headless-runtime.lua')()
local adapter = dofile('../cn/lua/real-calc-adapter.lua').new(_G)
local unique = dofile('../cn/lua/unique-crafting.lua')
local function ok(response)
	assert(response and response.success, response and response.error and response.error.message or '官方请求失败')
	return response.data
end
local function options(draft, sourceId)
	return ok(adapter:craftOptions({ actionMode = sourceId and 'edit' or 'create', sourceItemId = sourceId, draft = draft }))
end
local function create(draft, source)
	local item, err, runes, caps = unique.create(adapter, draft, adapter:currentBuild().itemsTab, source)
	assert(item, err and err.error.message)
	return item, caps
end
local function semantic(item)
	local result = {}
	for _, field in ipairs({ 'name', 'baseName', 'rarity', 'variant', 'variantAlt', 'variantAlt2', 'variantAlt3', 'variantAlt4', 'variantAlt5', 'allowDuplicateVariants', 'quality', 'uniqueID', 'corrupted', 'mirrored', 'mutated', 'catalyst', 'catalystQuality', 'itemSocketCount', 'jewelRadiusLabel' }) do
		result[#result + 1] = field .. '=' .. tostring(item[field])
	end
	for _, section in ipairs({ 'enchantModLines', 'runeModLines', 'classRequirementModLines', 'implicitModLines', 'explicitModLines' }) do
		for _, line in ipairs(item[section]) do
			result[#result + 1] = section .. ':' .. line.line .. ':' .. tostring(line.range) .. ':' .. tostring(line.corruptedRange) .. ':' .. item:GetModLineVariantCount(line)
		end
	end
	return table.concat(result, '\n')
end

local function documentState(xml)
	local root = assert(common.xml.ParseXML(xml))[1]
	local function normalise(node, parent)
		-- 官方以 pairs 保存节点集合及其旧版 URL；顺序不同不代表天赋变化。
		for _, field in ipairs({ 'nodes', 'strNodes', 'dexNodes', 'intNodes' }) do
			if node.attrib and node.attrib[field] then
				local ids = {}
				for id in node.attrib[field]:gmatch('[^,]+') do ids[#ids + 1] = id end
				table.sort(ids)
				node.attrib[field] = table.concat(ids, ',')
			end
		end
		if node.elem == 'URL' and parent == 'Spec' then node[1] = 'derived-from-spec-nodes' end
		for _, child in ipairs(node) do if type(child) == 'table' then normalise(child, node.elem) end end
		if node.elem == 'ConfigSet' then
			table.sort(node, function(a, b) return a.elem .. a.attrib.name < b.elem .. b.attrib.name end)
		end
	end
	normalise(root)
	table.sort(root, function(a, b) return a.elem < b.elem end)
	return assert(common.xml.ComposeXML(root))
end

dofile('../cn/tests/bridge/helpers/unique-corruption-regression.lua')(adapter, create, options, semantic, ok, documentState)
local catalog = ok(adapter:craftCatalog({ kind = 'unique' })).uniques
local count, rolls, changingBases, multi = 0, 0, 0, 0
local before = ok(adapter:exportXML()).xml
for _, row in ipairs(catalog) do
	count = count + 1
	local draft = { kind = 'unique', templateId = row.id }
	local item, caps = create(draft)
	local direct = new('Item', main.uniqueDB.list[row.id].raw)
	direct:NormaliseQuality(); direct:BuildAndParseRaw()
	assert(semantic(item) == semantic(direct), row.id .. ': 默认状态改变')
	for _, roll in ipairs({ 0, 0.5, 1 }) do
		local ranges = {}
		for _, range in ipairs(caps.ranges) do ranges[#ranges + 1] = { id = range.id, roll = roll }; rolls = rolls + 1 end
		local adjusted = create({ kind = 'unique', templateId = row.id, ranges = ranges, rangeBasis = caps.rangeBasis })
		local reference = new('Item', direct:BuildRaw())
		for _, line in ipairs(reference.rangeLineList) do line.range = roll end
		reference:BuildAndParseRaw()
		assert(semantic(adjusted) == semantic(reference), row.id .. ': 调值与官方不一致')
		assert(semantic(adjusted) == semantic(new('Item', adjusted:BuildRaw())), row.id .. ': 序列化丢失状态')
	end
	if #caps.variants > 1 then
		multi = multi + 1
		local selected = {}
		for _, entry in ipairs(caps.variants) do selected[entry.field] = 1 end
		local adjusted = create({ kind = 'unique', templateId = row.id, variants = selected })
		local reference = new('Item', direct:BuildRaw())
		for field, value in pairs(selected) do reference[field] = value end
		reference:BuildAndParseRaw()
		assert(semantic(adjusted) == semantic(reference), row.id .. ': 多组选项改变官方计数')
	end
	local baseCount = 0
	for _ in pairs(direct.baseLines) do baseCount = baseCount + 1 end
	if baseCount > 1 then changingBases = changingBases + 1 end
	for index in ipairs(direct.variantList or {}) do
		local adjusted = create({ kind = 'unique', templateId = row.id, variants = { variant = index } })
		local reference = new('Item', direct:BuildRaw())
		reference.variant = index; reference:BuildAndParseRaw()
		assert(semantic(adjusted) == semantic(reference), row.id .. ': 变体属性或底材失真')
		assert(semantic(adjusted) == semantic(new('Item', adjusted:BuildRaw())), row.id .. ': 变体序列化丢失状态')
	end
end
assert(count > 0 and multi > 0 and changingBases > 0 and rolls > 0)
assert(ok(adapter:exportXML()).xml == before, '全目录预览污染当前 BD')

local id = 'Morior Invictus, Grand Regalia'
local calcTab = adapter:currentBuild().calcsTab
local getMiscCalculator = calcTab.GetMiscCalculator
local miscCalls = 0
calcTab.GetMiscCalculator = function(self, ...) miscCalls = miscCalls + 1; return getMiscCalculator(self, ...) end
local initial = options({ kind = 'unique', templateId = id })
assert(miscCalls == 0, '自动传奇预览不能偷偷调用装备对比计算器')
calcTab.GetMiscCalculator = getMiscCalculator
assert(initial.item.tooltip and #initial.ranges > 0 and #initial.variants > 1)
local invalidDrafts = {
	{ kind = 'unique', templateId = '不存在的传奇' },
	{ kind = 'unique', templateId = id, raw = 'Rarity: UNIQUE' },
	{ kind = 'unique', templateId = id, prefixes = {} },
	{ kind = 'unique', templateId = id, variants = { variant = 0 } },
	{ kind = 'unique', templateId = id, variants = { variantAlt5 = 1 } },
	{ kind = 'unique', templateId = id, ranges = { { id = initial.ranges[1].id, roll = 2 } }, rangeBasis = initial.rangeBasis },
	{ kind = 'unique', templateId = id, ranges = { { id = initial.ranges[1].id, roll = 1 } }, rangeBasis = '过期范围' },
	{ kind = 'unique', templateId = id, quality = 10000 },
	{ kind = 'unique', templateId = id, socketCount = 10000 },
}
for _, draft in ipairs(invalidDrafts) do
	assert(not adapter:craft('craftCommit', { operation = 'create', draft = draft }).success, '非法草稿被接受')
	assert(ok(adapter:exportXML()).xml == before, '失败草稿污染 BD')
end

local committed = ok(adapter:craft('craftCommit', { operation = 'create', draft = { kind = 'unique', templateId = id } }))
local sourceId = committed.item.id
local original = adapter:currentBuild().itemsTab.items[sourceId]
original.uniqueID = 'unique-regression-source'
original.corrupted = true
original.explicitModLines[#original.explicitModLines + 1] = { line = 'Unique regression unsupported modifier' }
original.enchantModLines[#original.enchantModLines + 1] = { line = '+10 to maximum Life', enchant = true }
original.explicitModLines[1].corruptedRange = 1.12
original:BuildAndParseRaw()
local originalState = semantic(original)
local sourceOptions = options({ kind = 'unique' }, sourceId)
assert(sourceOptions.item.tooltip.bodyLineUnsupported)
local unsupported = false
for _, value in ipairs(sourceOptions.item.tooltip.bodyLineUnsupported) do if value then unsupported = true end end
assert(unsupported, '未支持词缀标记丢失')
local preview = ok(adapter:craft('craftPreview', { operation = 'edit', sourceItemId = sourceId, draft = { kind = 'unique' } }))
assert(preview.item.id == sourceId)
assert(semantic(adapter:currentBuild().itemsTab.items[sourceId]) == originalState, '编辑预览改变源物品')
local duplicate = ok(adapter:craft('craftCommit', { operation = 'duplicate', sourceItemId = sourceId, draft = { kind = 'unique' } }))
assert(duplicate.item.id ~= sourceId)
assert(semantic(adapter:currentBuild().itemsTab.items[duplicate.item.id]) == originalState, '副本丢失隐藏状态')
assert(semantic(adapter:currentBuild().itemsTab.items[sourceId]) == originalState, '副本改变源物品')
local edited = ok(adapter:craft('craftCommit', { operation = 'edit', sourceItemId = sourceId, draft = { kind = 'unique', quality = 7 } }))
assert(edited.item.id == sourceId and edited.item.quality == 7)
local editedState = semantic(adapter:currentBuild().itemsTab.items[sourceId])
ok(adapter:loadXML({ xml = edited.xml }, 'loadXML'))
assert(semantic(adapter:currentBuild().itemsTab.items[sourceId]) == editedState, '存档重开丢失传奇状态')

local noMetadata = new('Item', 'Rarity: UNIQUE\nThe Everlasting Gaze\nAzure Amulet\nImplicits: 0\n+25 to maximum Mana\nCorrupted')
local preserved, noMetadataOptions = create({ kind = 'unique' }, noMetadata)
assert(#noMetadataOptions.ranges == 0 and #noMetadataOptions.variants == 0)
assert(semantic(preserved) == semantic(noMetadata), '导入传奇被偷换成目录模板')
local badTarget = adapter:craft('craftCommit', { operation = 'create', draft = { kind = 'unique', templateId = id }, target = { kind = 'equipment', itemSetId = 1, slotName = 'Helmet' } })
assert(not badTarget.success, '错误槽位被接受')
assert(semantic(adapter:currentBuild().itemsTab.items[sourceId]) == editedState, '错误槽位回滚丢失传奇状态')

local armour, armourCaps = create({ kind = 'unique', templateId = id, socketCount = 2, quality = 31 })
assert(armour.quality == 31 and armour.itemSocketCount == 2, '传奇错误套用了稀有制作的品质限制')
local rune
for _, name in ipairs(armourCaps.runeCapabilities.allowed) do if name ~= 'None' then rune = name break end end
assert(rune, '官方符文选项缺失')
local runed = create({ kind = 'unique', templateId = id, socketCount = 2, runes = { rune, rune } })
assert(runed.runes[1] == rune and runed.runes[2] == rune)
assert(not unique.create(adapter, { kind = 'unique', templateId = id, socketCount = 2, runes = { '非法符文', rune } }, adapter:currentBuild().itemsTab))
local boundRune
for _, entry in ipairs(adapter:currentBuild().itemsTab:GetValidRunesForItem(runed)) do
	if entry.isSocketBound then boundRune = entry.name break end
end
assert(boundRune, '测试需要官方绑定符文')
runed.runes = { boundRune, 'None' }
runed:UpdateRunes(); runed:BuildAndParseRaw()
local preservedRunes = create({ kind = 'unique', runes = { boundRune, rune } }, runed)
assert(preservedRunes.runes[1] == boundRune and preservedRunes.runes[2] == rune, '修改另一孔不能拒绝已有绑定符文')
assert(not unique.create(adapter, { kind = 'unique', runes = { 'None', boundRune } }, adapter:currentBuild().itemsTab, runed), '不能把只读符文挪到新孔')
local catalystId = 'The Everlasting Gaze, Azure Amulet'
local catalysed, catalystCaps = create({ kind = 'unique', templateId = catalystId, catalyst = 1 })
assert(catalysed.catalyst == 1 and catalysed.catalystQuality ~= nil)
local reference = new('Item', main.uniqueDB.list[catalystId].raw)
reference:NormaliseQuality()
local itemsTab = adapter:currentBuild().itemsTab
local oldDisplay = itemsTab.displayItem
itemsTab.displayItem = reference
itemsTab.controls.displayItemCatalyst.selFunc(2)
itemsTab.displayItem = oldDisplay
assert(semantic(reference) == semantic(catalysed), '催化剂默认行为与官方不一致')
assert(catalystCaps.catalyst.quality.canSet)
local qualityChanged = create({ kind = 'unique', templateId = catalystId, catalyst = 1, catalystQuality = 17 })
assert(qualityChanged.catalystQuality == 17)

-- 比较同一事务与直接官方计算；第二组武器、药剂及珠宝都使用原生槽位。
for _, weaponSet in ipairs({ 1, 2 }) do
	local build = adapter:currentBuild()
	build.itemsTab.controls['weaponSwap' .. weaponSet].onClick()
	local slotName = weaponSet == 1 and 'Weapon 1' or 'Weapon 1 Swap'
	local equipped = ok(adapter:craft('craftCommit', { operation = 'create', projectionScope = 'items', draft = { kind = 'unique', templateId = 'Seeing Stars, Marching Mace' }, target = { kind = 'equipment', itemSetId = 1, slotName = slotName } }))
	assert(equipped.build.projectionScope == 'items' and equipped.build.skillBreakdown == nil)
	assert(equipped.build.equippedItems[slotName].id == equipped.item.id)
	build = adapter:currentBuild()
	build.calcsTab:BuildOutput()
	for _, stat in ipairs({ 'Life', 'Mana', 'Spirit', 'TotalDPS', 'Armour' }) do assert(equipped.output[stat] == build.calcsTab.mainOutput[stat], '官方计算结果不一致：' .. stat) end
end
local flaskId
for _, row in ipairs(catalog) do if row.type == 'Flask' then flaskId = row.id break end end
local flask = options({ kind = 'unique', templateId = flaskId })
assert(#flask.validTargetSlots.equipment > 0)
ok(adapter:craft('craftCommit', { operation = 'create', projectionScope = 'items', draft = { kind = 'unique', templateId = flaskId }, target = { kind = 'equipment', itemSetId = 1, slotName = flask.validTargetSlots.equipment[1] } }))
local build = adapter:currentBuild()
local socket
for _, node in pairs(build.spec.nodes) do if node.type == 'Socket' and node.path and #node.path > 0 then socket = node break end end
assert(socket, '测试需要官方可达珠宝槽')
build.spec:AllocNode(socket)
build.itemsTab:PopulateSlots()
build:EstimatePlayerProgress()
build.calcsTab:BuildOutput()
local jewel = ok(adapter:craft('craftCommit', { operation = 'create', projectionScope = 'items', draft = { kind = 'unique', templateId = 'Against the Darkness, Time-Lost Diamond' }, target = { kind = 'jewel', specId = build.treeTab.activeSpec, nodeId = socket.id } }))
assert(adapter:currentBuild().spec.jewels[socket.id] == jewel.item.id)
local saved = documentState(ok(adapter:exportXML()).xml)
local failingTab = adapter:currentBuild().calcsTab
local originalOutput = failingTab.BuildOutput
failingTab.BuildOutput = function(self, ...)
	self.BuildOutput = originalOutput
	error('传奇事务回滚验收')
end
local failed = adapter:craft('craftCommit', { operation = 'create', draft = { kind = 'unique', templateId = id }, projectionScope = 'items' })
assert(not failed.success and failed.error.code == 'POB_CALCULATION_FAILED')
local restored = documentState(ok(adapter:exportXML()).xml)
if restored ~= saved then
	local offset = 1
	while saved:sub(offset, offset) == restored:sub(offset, offset) do offset = offset + 1 end
	error('计算失败后原文档未恢复，位置 ' .. offset .. '\n原文：' .. saved:sub(math.max(1, offset - 100), offset + 250) .. '\n恢复：' .. restored:sub(math.max(1, offset - 100), offset + 250))
end
print('UNIQUE_CRAFT_OK templates=' .. count .. ' rolls=' .. rolls .. ' multi=' .. multi .. ' changingBases=' .. changingBases)
