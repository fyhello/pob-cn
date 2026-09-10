return function(adapter, create, options, semantic, ok, documentState)
	local unique = dofile('../cn/lua/unique-crafting.lua')
	-- 与网页打开存档一致，先经过官方加载；全新内存对象尚未初始化珠宝搜索控件的保存默认值。
	ok(adapter:loadXML({ xml = ok(adapter:exportXML()).xml }, 'loadXML'))
	local itemsTab = adapter:currentBuild().itemsTab
	local previousDisplay, previousPopup, previousOpen = itemsTab.displayItem, main.popups, main.OpenPopup
	local originalDocument = documentState(ok(adapter:exportXML()).xml)
	local templates = {}
	for id, template in pairs(main.uniqueDB.list) do
		if template.corruptible and not template.corrupted and not templates[template.type] then templates[template.type] = id end
	end
	local bootId, beltId = assert(templates.Boots), assert(templates.Belt)
	local boot, bootCaps = create({ kind = 'unique', templateId = bootId })
	local belt, beltCaps = create({ kind = 'unique', templateId = beltId })
	local movement = 'CorruptionMovementVelocity1'
	local function has(caps, id)
		for _, source in ipairs(caps.sources) do for _, mod in ipairs(source.mods) do if mod.id == id then return true end end end
		return false
	end
	assert(has(bootCaps.corruption, movement) and not has(beltCaps.corruption, movement), '鞋子专用腐化词缀串到腰带')
	local legacy = new('Item', belt:BuildRaw())
	legacy.corrupted = true
	legacy.enchantModLines[#legacy.enchantModLines + 1] = { line = data.itemMods.Corruption[movement][1], range = 1, enchant = true }
	legacy:BuildAndParseRaw()
	local preservedLegacy, legacyCaps = create({ kind = 'unique' }, legacy)
	assert(not legacyCaps.corruption.modsCanSet and semantic(preservedLegacy) == semantic(legacy), '不符合当前候选的旧词缀必须保留并明确只读')
	local hiddenEnchant = new('Item', boot:BuildRaw())
	hiddenEnchant.enchantModLines[#hiddenEnchant.enchantModLines + 1] = { line = data.itemMods.Corruption[movement][1], range = 1, corruptedRange = 1.12, enchant = true }
	hiddenEnchant:BuildAndParseRaw()
	local preservedHidden, hiddenCaps = create({ kind = 'unique' }, hiddenEnchant)
	assert(not hiddenCaps.corruption.modsCanSet and semantic(preservedHidden) == semantic(hiddenEnchant), '附带额外状态的附魔不能被重建覆盖')
	local function draft(id, caps, change)
		change.basis = caps.corruption.basis
		return { kind = 'unique', templateId = id, corruption = change }
	end
	local function rejected(value, source)
		local item, err = unique.create(adapter, value, itemsTab, source)
		assert(not item and err.error.code == 'POB_UNIQUE_DRAFT_INVALID', '非法腐化未被拒绝')
	end
	rejected(draft(beltId, beltCaps, { mods = { { id = movement, roll = 1 } } }))
	rejected({ kind = 'unique', corruption = { basis = legacyCaps.corruption.basis, mods = {} } }, legacy)
	rejected(draft(bootId, bootCaps, { source = false }))
	rejected(draft(bootId, bootCaps, { mods = { { id = movement, roll = 1 }, { id = movement, roll = 0 } } }))
	rejected(draft(bootId, bootCaps, { mods = { { id = '不存在', roll = 1 } } }))
	rejected(draft(bootId, bootCaps, { mods = { { id = movement, roll = 2 } } }))
	rejected(draft(beltId, beltCaps, { source = 'Glimpse of Chaos', mods = {} }))
	rejected(draft(bootId, bootCaps, { socketCount = 1 }))
	rejected({ kind = 'unique', templateId = bootId, corruption = { basis = '过期', mods = {} } })
	for _, scalar in ipairs({ 0, 0.5, 1 }) do
		local adjusted = create(draft(bootId, bootCaps, { mods = { { id = movement, roll = scalar } } }))
		assert(adjusted.corrupted and adjusted.itemSocketCount == boot.itemSocketCount)
		assert(semantic(adjusted) == semantic(new('Item', adjusted:BuildRaw())), '新增腐化词缀往返失真')
		local found = false
		for _, line in ipairs(adjusted.enchantModLines) do
			if line.line == data.itemMods.Corruption[movement][1] then assert(line.range == scalar); found = true end
		end
		assert(found, '腐化词缀未按官方原文写入')
		local reopened, reopenedCaps = create({ kind = 'unique' }, adjusted)
		assert(reopenedCaps.corruption.modsCanSet and reopenedCaps.corruption.selected[1].id == movement, '重开不能识别原腐化词缀')
		assert(semantic(reopened) == semantic(adjusted))
	end
	local jewel, jewelCaps = create({ kind = 'unique', templateId = assert(templates.Jewel) })
	assert(not has(jewelCaps.corruption, movement))
	local jewelMods = jewelCaps.corruption.sources[1].mods
	assert(#jewelMods == 11)
	local corruptedJewel = create(draft(templates.Jewel, jewelCaps, { mods = { { id = jewelMods[1].id, roll = 1 } } }))
	assert(corruptedJewel.type == 'Jewel' and corruptedJewel.corrupted)
	for _, kind in ipairs({ 'Flask', 'Charm' }) do
		local found = false
		for id, template in pairs(main.uniqueDB.list) do
			if template.type == kind then
				local item, caps = create({ kind = 'unique', templateId = id })
				assert(not caps.corruption.canSet)
				rejected(draft(id, caps, {}))
				found = true; break
			end
		end
		assert(found, '缺少药剂或护符测试样本')
	end
	local helmetId = 'Glimpse of Chaos, Tribal Mask'
	assert(main.uniqueDB.list[helmetId], '缺少特殊头盔模板')
	local helmet, helmetCaps = create({ kind = 'unique', templateId = helmetId })
	local special
	for _, source in ipairs(helmetCaps.corruption.sources) do if source.id == 'Glimpse of Chaos' then special = source end end
	assert(special and special.maxMods == 8 and #special.mods == 8)
	local selected = {}
	for _, mod in ipairs(special.mods) do selected[#selected + 1] = { id = mod.id, roll = 1 } end
	local specialItem = create(draft(helmetId, helmetCaps, { source = special.id, mods = selected }))
	assert(#specialItem.enchantModLines == 8)

	local id = 'Morior Invictus, Grand Regalia'
	local item, caps = create({ kind = 'unique', templateId = id })
	assert(#caps.corruption.ranges > 0)
	local range = caps.corruption.ranges[1]
	local index = tonumber(range.id:match(':(%d+)$'))
	local combinedDraft = draft(id, caps, { ranges = { { id = range.id, roll = 1 } } })
	combinedDraft.ranges = { { id = caps.ranges[1].id, roll = 0.2 } }
	combinedDraft.rangeBasis = caps.rangeBasis
	local combined = create(combinedDraft)
	assert(combined.rangeLineList[1].range == 0.2, '腐化覆盖普通数值调整')
	for _, scalar in ipairs({ 0, 0.5, 1 }) do
		local adjusted, result = create(draft(id, caps, { ranges = { { id = range.id, roll = scalar } } }))
		local expected = scalar == 0 and 0.78 or scalar == 1 and 1.22 or 1
		assert((adjusted.explicitModLines[index].corruptedRange or 1) == expected, '官方倍率映射不一致')
		assert(result.corruption.ranges[1].line == itemLib.applyRange(item.explicitModLines[index].line, item.explicitModLines[index].range, item.explicitModLines[index].valueScalar or 1, expected))
		assert(semantic(adjusted) == semantic(new('Item', adjusted:BuildRaw())), '腐化倍率往返失真')
	end
	local original = new('Item', item:BuildRaw())
	original.corrupted = true
	original.explicitModLines[index].corruptedRange = 1.12
	local hidden
	for i, line in ipairs(original.explicitModLines) do
		if original:GetModLineVariantCount(line) == 0 then hidden = i; line.corruptedRange = 0.88; break end
	end
	original.enchantModLines[#original.enchantModLines + 1] = { line = 'Unrecognised enchant retained for regression', enchant = true }
	original:BuildAndParseRaw()
	local sourceState = semantic(original)
	local _, originalCaps = create({ kind = 'unique' }, original)
	assert(not originalCaps.corruption.modsCanSet)
	local reset = create({ kind = 'unique', corruption = { basis = originalCaps.corruption.basis, ranges = { { id = range.id, roll = 0.5 } } } }, original)
	assert(reset.explicitModLines[index].corruptedRange == nil, '1 倍没有清除原倍率')
	if hidden then assert(reset.explicitModLines[hidden].corruptedRange == 0.88, '隐藏变体倍率被清除') end
	assert(reset.enchantModLines[1].line == original.enchantModLines[1].line, '未知附魔丢失')
	assert(semantic(original) == sourceState, '修改腐化污染源物品')
	rejected({ kind = 'unique', corruption = { basis = originalCaps.corruption.basis, mods = {} } }, original)
	if hidden then rejected(draft(id, caps, { ranges = { { id = 'explicitModLines:' .. hidden, roll = 1 } } })) end
	rejected(draft(id, caps, { ranges = { { id = range.id, roll = -1 } } }))
	rejected(draft(id, caps, { ranges = { { id = range.id, roll = 1 }, { id = range.id, roll = 0 } } }))
	local stale = draft(id, caps, { ranges = { { id = range.id, roll = 1 } } })
	stale.variants = { variant = caps.variants[1].value == 1 and 2 or 1 }
	rejected(stale)
	for _, state in ipairs({ 'mirrored', 'sanctified' }) do
		local locked = new('Item', item:BuildRaw()); locked[state] = true; locked:BuildAndParseRaw()
		local _, lockedCaps = create({ kind = 'unique' }, locked)
		assert(not lockedCaps.corruption.canSet)
		rejected({ kind = 'unique', corruption = { basis = lockedCaps.corruption.basis } }, locked)
	end
	assert(documentState(ok(adapter:exportXML()).xml) == originalDocument, '腐化能力与校验污染 BD')
	assert(itemsTab.displayItem == previousDisplay and main.popups == previousPopup and main.OpenPopup == previousOpen, '失败路径未恢复官方编辑上下文')

	local transaction = draft(bootId, bootCaps, { mods = { { id = movement, roll = 1 } } })
	local preview = ok(adapter:craft('craftPreview', { operation = 'create', draft = transaction, target = { kind = 'equipment', itemSetId = 1, slotName = 'Boots' } }))
	assert(preview.item.raw:find('Corrupted', 1, true))
	local restoredDocument = documentState(ok(adapter:exportXML()).xml)
	if restoredDocument ~= originalDocument then
		local offset = 1
		while originalDocument:sub(offset, offset) == restoredDocument:sub(offset, offset) do offset = offset + 1 end
		error('腐化预览未回滚，位置 ' .. offset .. '\n原文：' .. originalDocument:sub(math.max(1, offset - 100), offset + 250) .. '\n恢复：' .. restoredDocument:sub(math.max(1, offset - 100), offset + 250))
	end
	local committed = ok(adapter:craft('craftCommit', { operation = 'create', draft = transaction, target = { kind = 'equipment', itemSetId = 1, slotName = 'Boots' } }))
	local sourceId = committed.item.id
	local savedState = semantic(adapter:currentBuild().itemsTab.items[sourceId])
	local copied = ok(adapter:craft('craftCommit', { operation = 'duplicate', sourceItemId = sourceId, draft = { kind = 'unique' } }))
	assert(copied.item.id ~= sourceId and semantic(adapter:currentBuild().itemsTab.items[copied.item.id]) == savedState)
	ok(adapter:loadXML({ xml = copied.xml }, 'loadXML'))
	assert(semantic(adapter:currentBuild().itemsTab.items[sourceId]) == savedState, '保存重开丢失腐化')
	local reopenedCaps = options({ kind = 'unique' }, sourceId)
	local edited = ok(adapter:craft('craftCommit', { operation = 'edit', sourceItemId = sourceId, draft = { kind = 'unique', corruption = { basis = reopenedCaps.corruption.basis, mods = { { id = movement, roll = 0 } } } } }))
	assert(edited.item.id == sourceId)
	local build = adapter:currentBuild()
	build.calcsTab:BuildOutput()
	for _, stat in ipairs({ 'Life', 'Mana', 'Armour', 'MovementSpeedMod' }) do assert(edited.output[stat] == build.calcsTab.mainOutput[stat]) end
	print('UNIQUE_CORRUPTION_OK eligibility ranges variants preservation preview commit duplicate reopen')
end
