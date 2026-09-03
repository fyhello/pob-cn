-- Adapter for the official HeadlessWrapper.lua public surface.
-- It deliberately exposes no fallback calculator: a missing upstream API is a
-- structured failure instead of a fabricated calculation.
local Adapter = {}
Adapter.__index = Adapter
-- Assigned after the official craft helpers are declared; keeping the
-- forward declaration here lets every projection include the same native
-- slot calculation without a second front-end rule path.
local officialValidTargetSlots

local function failure(code, api, message)
	return {
		success = false,
		error = {
			code = code,
			api = api,
			message = message,
		},
	}
end

local function outputScalars(output)
	local result = {}
	for key, value in pairs(output or {}) do
		local valueType = type(value)
		if valueType == "number" or valueType == "string" or valueType == "boolean" then
			result[key] = value
		end
	end
	-- The web surfaces use short resistance names while PoB exposes *Resist.
	-- Preserve the official values and provide the display aliases centrally.
	result.FireRes = result.FireResist
	result.ColdRes = result.ColdResist
	result.LightningRes = result.LightningResist
	result.ChaosRes = result.ChaosResist
	return result
end

local function stringValue(...)
	for index = 1, select("#", ...) do
		local value = select(index, ...)
		if type(value) == "string" and value ~= "" then return value end
	end
	return nil
end

-- Keep catalyst metadata owned by the official Item implementation.  PoB's
-- catalyst list and tag table are lexical locals, so the adapter discovers
-- them from the official methods instead of maintaining a second rule table.
-- If the runtime does not expose debug upvalues, callers must reject the
-- operation rather than silently falling back to invented IDs or tags.
local function officialUpvalue(fn, wanted)
	if type(fn) ~= "function" or type(debug) ~= "table" or type(debug.getupvalue) ~= "function" then return nil end
	for index = 1, 64 do
		local name, value = debug.getupvalue(fn, index)
		if not name then break end
		if name == wanted then return value end
	end
	return nil
end

local function officialCatalystList(item)
	return type(item) == "table" and officialUpvalue(item.BuildRaw, "catalystList") or nil
end

local function officialCatalystTags(item)
	if type(item) ~= "table" then return nil end
	local ranged = officialUpvalue(item.BuildModList, "getRangedModList")
	local scalar = officialUpvalue(ranged, "getCatalystScalar")
	return officialUpvalue(scalar, "catalystTags")
end

local stripColourCodes

-- AddItemTooltip is ordinarily a presentation method, but the current
-- upstream implementation annotates Vaal-origin items with item.mutated.
-- Give it a write-isolated view so its presentation-only side effects cannot
-- alter the canonical item stored by the adapter. Reads and shadowed writes
-- still have normal Lua table semantics for the duration of the call.
local function tooltipItemView(item)
	local writes = {}
	local values = {}
	return setmetatable({}, {
		__index = function(_, key)
			if writes[key] then return values[key] end
			return item[key]
		end,
		__newindex = function(_, key, value)
			writes[key] = true
			values[key] = value
		end,
	})
end

-- Capture the upstream ItemsTab presentation rather than duplicating its
-- Item/weaponData formatting rules. Header rows are separated by the official
-- AddItemTooltip control flow: titled items emit two header rows, all others
-- emit one. No text content is inspected to decide that boundary.
local function officialTooltipProjection(itemsTab, item)
	if type(itemsTab) ~= "table" or type(itemsTab.AddItemTooltip) ~= "function" then return nil end
	local captured = { lines = {} }
	function captured:AddLine(_, value)
		if type(value) == "string" and value ~= "" then
			table.insert(self.lines, stripColourCodes(value))
		end
	end
	function captured:AddSeparator() end
	local ok = pcall(itemsTab.AddItemTooltip, itemsTab, captured, tooltipItemView(item))
	local headerCount = item.title and 2 or 1
	if not ok or #captured.lines < headerCount then return nil end
	local bodyLines = {}
	for index = headerCount + 1, #captured.lines do
		table.insert(bodyLines, captured.lines[index])
	end
	return {
		header = {
			title = captured.lines[1],
			base = headerCount == 2 and captured.lines[2] or nil,
		},
		bodyLines = bodyLines,
	}
end

-- Project visible rows from the completed official Item state. The serialized
-- BuildRaw text remains a separate import/export field and is never parsed into
-- display rows.
local function officialDisplayLines(item)
	if type(item) ~= "table" then return nil end
	local lines = {}
	local function add(value)
		if type(value) == "string" and value ~= "" then table.insert(lines, value) end
	end
	if item.title then
		add(item.title)
		add(item.baseName)
	else
		add((item.namePrefix or "") .. (item.baseName or "") .. (item.nameSuffix or ""))
	end
	add(item.charmLimit and "Charm Slots: "..tostring(item.charmLimit) or nil)
	add(item.spiritValue and "Spirit: "..tostring(item.spiritValue) or nil)
	if type(item.armourData) == "table" then
		for _, key in ipairs({ "Armour", "Evasion", "EnergyShield", "Ward" }) do
			if tonumber(item.armourData[key]) and item.armourData[key] > 0 then
				add(key:gsub("EnergyShield", "Energy Shield") .. ": " .. tostring(item.armourData[key]))
			end
		end
	end
	if item.quality and item.quality > 0 then add("Quality: "..tostring(item.quality)) end
	if item.catalystQuality and item.catalystQuality > 0 then add("Catalyst Quality: "..tostring(item.catalystQuality)) end
	if item.itemSocketCount and item.itemSocketCount > 0 then
		add("Sockets: "..string.rep("S ", item.itemSocketCount):gsub(" $", ""))
	end
	if item.jewelSocketCount and item.jewelSocketCount > 0 then
		add("Sockets: "..string.rep("J ", item.jewelSocketCount):gsub(" $", ""))
	end
	if item.requirements and item.requirements.level and item.requirements.level > 0 then add("LevelReq: "..tostring(item.requirements.level)) end
	if item.itemLevel then add("Item Level: "..tostring(item.itemLevel)) end
	if item.jewelRadiusLabel then add("Radius: "..tostring(item.jewelRadiusLabel)) end
	if type(item.variantList) == "table" and item.variant and item.variantList[item.variant] then add("Variant: "..tostring(item.variantList[item.variant])) end
	if item.talismanTier then add("Talisman Tier: "..tostring(item.talismanTier)) end
	local function addMods(list)
		for _, modLine in ipairs(list or {}) do
			if type(modLine) == "table" then
				local line = modLine.line
			local itemTools = rawget(_G, "itemLib")
			if type(itemTools) == "table" and type(itemTools.formatModLine) == "function" then
				local formatted, value = pcall(itemTools.formatModLine, modLine)
				if formatted and type(value) == "string" then
					line = value:gsub("%^x%x%x%x%x%x%x", ""):gsub("%^%d", "")
				end
			end
			add(line)
			end
		end
	end
	-- These lists are populated by Item:Craft/UpdateRunes and are the only
	-- source for visible modifier text. Never derive display rows from raw.
	addMods(item.runeModLines)
	addMods(item.enchantModLines)
	addMods(item.classRequirementModLines)
	addMods(item.implicitModLines)
	addMods(item.explicitModLines)
	if item.fractured then add("Fractured") end
	if item.desecrated then add("Desecrated") end
	if item.mutated then add("Mutated") end
	if item.mirrored then add("Mirrored") end
	if item.sanctified then add("Sanctified") end
	if item.doubleCorrupted then add("Twice Corrupted") elseif item.corrupted then add("Corrupted") end
	if #lines == 0 then return nil end
	return lines
end

-- PoB exposes editable implicit rolls through the same rangeLineList used by
-- ItemsTab's native range controls. Keep the transport keyed to the implicit
-- line index so the caller never has to parse or recreate the mod text.
local function officialImplicitRanges(item)
	local result = {}
	if type(item) ~= "table" or type(item.implicitModLines) ~= "table" then return result end
	local active = type(item.rangeLineList) == "table" and item.rangeLineList or {}
	for _, rangeLine in ipairs(active) do
		if type(rangeLine) == "table" and tonumber(rangeLine.range) then
			for index, implicit in ipairs(item.implicitModLines) do
				if implicit == rangeLine then
					result[#result + 1] = {
						index = index,
						roll = tonumber(rangeLine.range),
						line = type(rangeLine.line) == "string" and rangeLine.line or nil,
					}
					break
				end
			end
		end
	end
	return result
end

local function unsupportedProjection(path, message)
	return failure("POB_IMPORT_PROJECTION_UNSUPPORTED", path, message)
end

local function unsupportedCalculationInput(path, message)
	return failure("POB_CALC_INPUT_UNSUPPORTED", path, message)
end

local function projectItem(item, allowTransientId, data, itemsTab)
	if type(item) ~= "table" or (type(item.id) ~= "number" and not allowTransientId) then
		return nil, unsupportedProjection("itemsTab.items", "PoB returned an item without a numeric id")
	end
	local base = type(item.base) == "table" and item.base or {}
	local name = stringValue(item.title, item.name, item.baseName, base.name)
	if not name then
		return nil, unsupportedProjection("itemsTab.items["..tostring(item.id or "preview").."]", "PoB returned an item without a display name")
	end
	local rawText = type(item.raw) == "string" and item.raw or ""
	if rawText == "" and type(item.BuildRaw) == "function" then
		local built, value = pcall(item.BuildRaw, item)
		if built and type(value) == "string" then rawText = value end
	end
	local displayLines = officialDisplayLines(item)
	if not displayLines then
		return nil, unsupportedProjection("itemsTab.items["..tostring(item.id or "preview").."].displayLines", "PoB 未返回可见物品字段")
	end
	-- displayLines remains the crafting-card projection. The hover tooltip
	-- consumes the structured upstream capture below, so title/base rows cannot
	-- render twice. A runtime without the upstream presentation method exposes
	-- no tooltip field instead of falling back to a hand-built approximation.
	local tooltip = officialTooltipProjection(itemsTab, item)
	local function projectAffixes(kind)
		local result = {}
		for _, affix in ipairs(item[kind] or {}) do
			if type(affix) == "table" and type(affix.modId) == "string" and affix.modId ~= "None" then
				-- A missing range is an unknown upstream value; do not fabricate
				-- PoB's default roll in the public projection.
				table.insert(result, { id = affix.modId, roll = tonumber(affix.range), essence = affix.essence == true })
			end
		end
		return result
	end
	local essence = nil
	if type(data) == "table" and type(data.essences) == "table" and type(base.type) == "string" then
		for _, kind in ipairs({ "prefixes", "suffixes" }) do
			for _, affix in ipairs(item[kind] or {}) do
				if type(affix) == "table" and affix.essence == true and type(affix.modId) == "string" then
					for essenceId, entry in pairs(data.essences) do
						if type(entry) == "table" and type(entry.mods) == "table" and entry.mods[base.type] == affix.modId then
						essence = { id = essenceId, roll = tonumber(affix.range) }
							break
						end
					end
					if essence then break end
				end
			end
			if essence then break end
		end
	end
	local runes = {}
	for _, rune in ipairs(item.runes or {}) do if type(rune) == "string" then table.insert(runes, rune) end end
	return {
		id = item.id,
		name = name,
		title = item.title,
		base = stringValue(item.baseName, base.name, ""),
		type = stringValue(base.type, "Custom"),
		rarity = stringValue(item.rarity, "NORMAL"),
		itemLevel = tonumber(item.itemLevel),
		quality = tonumber(item.quality),
		catalyst = item.catalyst,
		catalystQuality = tonumber(item.catalystQuality),
		variant = tonumber(item.variant),
		corrupted = item.corrupted == true,
		crafted = item.crafted == true,
		fractured = item.fractured == true,
		desecrated = item.desecrated == true,
		mutated = item.mutated == true,
		hasModTags = item.hasModTags == true,
		clusterJewel = item.clusterJewel,
		uniqueID = item.uniqueID,
		prefixes = projectAffixes("prefixes"),
		suffixes = projectAffixes("suffixes"),
		essence = essence,
		runes = runes,
		socketCount = tonumber(item.itemSocketCount) or (type(item.sockets) == "table" and #item.sockets or 0),
		sockets = item.sockets,
		jewelRadiusLabel = item.jewelRadiusLabel,
		implicitModLines = item.implicitModLines,
		implicitRanges = officialImplicitRanges(item),
		enchantModLines = item.enchantModLines,
		mirrored = item.mirrored == true,
		sanctified = item.sanctified == true,
		doubleCorrupted = item.doubleCorrupted == true,
		validTargetSlots = officialValidTargetSlots and officialValidTargetSlots(itemsTab, item) or nil,
		raw = rawText,
		displayLines = displayLines,
		tooltip = tooltip,
	}
end

local function projectGem(gem, groupIndex, gemIndex)
	if type(gem) ~= "table" then
		return nil, unsupportedProjection("skillsTab.socketGroupList["..groupIndex.."].gemList["..gemIndex.."]", "PoB returned an invalid gem entry")
	end
	local gemData = type(gem.gemData) == "table" and gem.gemData or {}
	local tags = type(gemData.tags) == "table" and gemData.tags or {}
	local name = stringValue(gem.nameSpec, gemData.name, gem.skillId, gemData.gameId)
	if not name then
		return nil, unsupportedProjection("skillsTab.socketGroupList["..groupIndex.."].gemList["..gemIndex.."]", "PoB returned a gem without a display name")
	end
	return {
		name = name,
		skillId = stringValue(gem.skillId, gemData.gameId),
		level = tonumber(gem.level) or 1,
		quality = tonumber(gem.quality) or 0,
		enabled = gem.enabled ~= false,
		isSupport = gem.isSupport == true or gem.support == true or tags.support == true or tags.support_gem == true,
	}
end

local function projectEquippedItems(itemsTab, itemSet, itemsById, path)
	local equippedItems = {}
	for slotName, slot in pairs(itemsTab.slots or {}) do
		if type(slot) == "table" and not slot.nodeId then
			local selected = type(itemSet) == "table" and itemSet[slotName] or nil
			local selectedId = type(selected) == "table" and tonumber(selected.selItemId) or nil
			if selectedId and selectedId ~= 0 then
				local item = itemsById[selectedId]
				if not item then return nil, unsupportedProjection(path.."["..slotName.."]", "PoB selected an item that cannot be projected") end
				equippedItems[slotName] = item
			end
		end
	end
	return equippedItems
end

local function projectSocketedJewels(spec, itemsById, path)
	local socketedJewels = {}
	for nodeId, itemId in pairs(spec.jewels or {}) do
		local numericNodeId = tonumber(nodeId)
		local numericItemId = tonumber(itemId)
		if numericItemId and numericItemId > 0 then
			local item = itemsById[numericItemId]
			if not numericNodeId or not item then return nil, unsupportedProjection(path, "PoB returned a jewel socket that cannot be projected") end
			socketedJewels[tostring(numericNodeId)] = item
		end
	end
	return socketedJewels
end

local function projectSocketGroups(groups, mainSocketGroup, path)
	local result = {}
	for groupIndex, group in ipairs(groups or {}) do
		if type(group) ~= "table" then return nil, unsupportedProjection(path.."["..groupIndex.."]", "PoB returned an invalid skill group") end
		local projectedGroup = {
			index = groupIndex,
			label = stringValue(group.label, group.displayLabel, "Skill Group "..groupIndex),
			slot = stringValue(group.slot),
			groupCount = tonumber(group.groupCount) or 1,
			editable = group.source == nil,
			isMain = tonumber(mainSocketGroup) == groupIndex,
			enabled = group.enabled ~= false,
			includeInFullDPS = group.includeInFullDPS ~= false,
			gems = {},
		}
		for gemIndex, gem in ipairs(group.gemList or {}) do
			local projectedGem, err = projectGem(gem, groupIndex, gemIndex)
			if not projectedGem then return nil, err end
			table.insert(projectedGroup.gems, projectedGem)
		end
		table.insert(result, projectedGroup)
	end
	return result
end

stripColourCodes = function(value)
	if type(value) ~= "string" then return value end
	local stripped = value:gsub("%^x%x%x%x%x%x%x", ""):gsub("%^[0-9A-Fa-f]", "")
	return stripped
end

-- The raw breakdown tree contains calculators, item references, modifier stores,
-- and other implementation details. Mirror CalcBreakdownControl instead: expose
-- only the text and table cells that the upstream calculation page can display.
local function checkCalculationFlag(calcsTab, value)
	if type(calcsTab.CheckFlag) ~= "function" then return true end
	local ok, visible = pcall(calcsTab.CheckFlag, calcsTab, value)
	return ok and visible == true
end

local function breakdownFor(actor, name)
	if type(actor) ~= "table" or type(actor.breakdown) ~= "table" or type(name) ~= "string" then return nil end
	local namespace, field = name:match("^(%a+)%.(%a+)$")
	if namespace then
		return type(actor.breakdown[namespace]) == "table" and actor.breakdown[namespace][field] or nil
	end
	return actor.breakdown[name]
end

local function projectBreakdownCell(value)
	local valueType = type(value)
	if valueType == "string" then return stripColourCodes(value) end
	if valueType == "number" or valueType == "boolean" then return value end
	return nil
end

local function projectBreakdownRows(rowList, colList)
	if type(rowList) ~= "table" or type(colList) ~= "table" then return {}, {} end
	local columns = {}
	for _, column in ipairs(colList) do
		if type(column) == "table" and type(column.key) == "string" then
			table.insert(columns, { key = column.key, label = stripColourCodes(stringValue(column.label, column.key)) })
		end
	end
	if #columns == 0 then return {}, {} end
	local rows = {}
	for _, sourceRow in ipairs(rowList) do
		if type(sourceRow) == "table" then
			local row = {}
			for _, column in ipairs(columns) do
				local value = projectBreakdownCell(sourceRow[column.key])
				if value ~= nil then row[column.key] = value end
			end
			if next(row) then table.insert(rows, row) end
		end
	end
	return columns, rows
end

local function resolveSlotItemName(slotName, build)
	if not slotName or not build or not build.itemsTab then return nil end
	local itemsTab = build.itemsTab
	local itemSet = itemsTab.activeItemSet or (type(itemsTab.itemSets) == "table" and itemsTab.itemSets[itemsTab.activeItemSetId])
	local selItemId = nil
	if type(itemSet) == "table" and type(itemSet[slotName]) == "table" then
		selItemId = tonumber(itemSet[slotName].selItemId)
	end
	if not selItemId and type(itemsTab.slots) == "table" and type(itemsTab.slots[slotName]) == "table" then
		selItemId = tonumber(itemsTab.slots[slotName].selItemId)
	end
	if selItemId and selItemId > 0 and itemsTab.items and itemsTab.items[selItemId] then
		local item = itemsTab.items[selItemId]
		return item.name or item.title or (item.base and item.base.name)
	end
	if slotName == "Global" then
		return "角色等级自带全域基础"
	end
	return nil
end

local function projectBreakdownTables(breakdown, sectionData, build)
	local sections = {}
	if type(breakdown) ~= "table" then return sections end
	local lines = {}
	for _, value in ipairs(breakdown) do
		local line = projectBreakdownCell(value)
		if line ~= nil then table.insert(lines, line) end
	end
	if #lines > 0 then table.insert(sections, { type = "text", lines = lines }) end

	local function addTable(label, footer, rows, columns)
		local projectedColumns, projectedRows = projectBreakdownRows(rows, columns)
		if #projectedRows > 0 then
			-- 自动为 slot 补充装备名称
			for _, r in ipairs(projectedRows) do
				if r.source and not r.sourceLabel and not r.name then
					r.sourceLabel = resolveSlotItemName(r.source, build)
				end
			end
			table.insert(sections, {
				type = "table",
				label = stripColourCodes(label),
				footer = stripColourCodes(footer),
				columns = projectedColumns,
				rows = projectedRows,
			})
		end
	end

	addTable(breakdown.label, breakdown.footer, breakdown.rowList, breakdown.colList)
	addTable(nil, nil, breakdown.reservations, {
		{ label = "Skill", key = "skillName" }, { label = "Base", key = "base" }, { label = "MCM", key = "mult" },
		{ label = "More/less", key = "more" }, { label = "Inc/red", key = "inc" }, { label = "Efficiency", key = "efficiency" },
		{ label = "Efficiency More/less", key = "efficiencyMore" }, { label = "Count", key = "count" }, { label = "Reservation", key = "total" },
	})
	addTable(nil, nil, breakdown.damageTypes, {
		{ label = "From", key = "source" }, { label = "Base", key = "base" }, { label = "Inc/red", key = "inc" },
		{ label = "More/less", key = "more" }, { label = "Converted Damage", key = "convSrc" }, { label = "Total", key = "total" }, { label = "Conversion", key = "convDst" },
	})
	if sectionData and sectionData.gearOnly then
		addTable(nil, nil, breakdown.slots, {
			{ label = "Value", key = "base" }, { label = "Source", key = "source" }, { label = "Name", key = "sourceLabel" },
		})
	else
		addTable(nil, nil, breakdown.slots, {
			{ label = "Base", key = "base" }, { label = "Inc/red", key = "inc" }, { label = "More/less", key = "more" },
			{ label = "Total", key = "total" }, { label = "Source", key = "source" }, { label = "Name", key = "sourceLabel" },
		})
	end
	return sections
end

local function resolveModSource(sourceStr, build)
	if not sourceStr or sourceStr == "" then return "", "Other", nil end
	local srcDesc = stripColourCodes(tostring(sourceStr))
	local sourceType = "Other"
	local sourceName = srcDesc
	local sourceRef = nil

	if srcDesc:match("^Item:") then
		sourceType = "Item"
		local itemId = srcDesc:match("^Item:(%d+)")
		if itemId and build and build.itemsTab and build.itemsTab.items then
			local numId = tonumber(itemId)
			local item = build.itemsTab.items[numId]
			if item and item.name then
				sourceName = item.name
				if item.type == "Jewel" or (item.base and (item.base.type == "Jewel" or item.base.subType == "Jewel")) or item.rarity == "JEWEL" then
					sourceType = "Jewel"
				end
				local displayLines = {}
				if type(item.displayLines) == "table" then
					for _, l in ipairs(item.displayLines) do displayLines[#displayLines + 1] = stripColourCodes(tostring(l)) end
				end
				sourceRef = {
					kind = "item",
					id = numId,
					name = stripColourCodes(item.name),
					baseName = item.base and stripColourCodes(item.base.name) or nil,
					rarity = item.rarity or "NORMAL",
					itemType = item.type or (item.base and item.base.type) or nil,
					displayLines = displayLines,
				}
			else
				sourceRef = { kind = "item", id = numId }
			end
		end
	elseif srcDesc:match("^Tree:") or srcDesc:match("^Node:") then
		sourceType = "Tree"
		local nodeId = srcDesc:match("^(?:Tree|Node):(%d+)") or srcDesc:match(":(%d+)")
		if nodeId and build and build.spec then
			local nodeIdNumber = tonumber(nodeId)
			local node = (build.spec.nodes and build.spec.nodes[nodeIdNumber])
				or (build.spec.switchableNodes and build.spec.switchableNodes[nodeIdNumber])
				or (build.spec.tree and build.spec.tree.nodes and build.spec.tree.nodes[nodeIdNumber])
			if node and (node.dn or node.name) then
				sourceName = node.dn or node.name
				local sdList = {}
				if type(node.sd) == "table" then
					for _, desc in ipairs(node.sd) do
						sdList[#sdList + 1] = stripColourCodes(tostring(desc))
					end
				end
				sourceRef = {
					kind = "treeNode",
					id = nodeIdNumber,
					name = stripColourCodes(node.dn or node.name),
					nodeType = node.type or (node.containJewelSocket and "Socket") or "Normal",
					sd = sdList,
					isAllocated = (build.spec.allocNodes and build.spec.allocNodes[nodeIdNumber]) and true or false,
				}
			else
				sourceRef = { kind = "treeNode", id = nodeIdNumber }
			end
		end
	elseif srcDesc:match("^Skill:") then
		sourceType = "Skill"
		local skillId = srcDesc:match("^Skill:(.+)")
		if skillId and build and build.data and build.data.skills and build.data.skills[skillId] then
			local skill = build.data.skills[skillId]
			sourceName = skill.name or skillId
			sourceRef = {
				kind = "skill",
				id = skillId,
				name = stripColourCodes(skill.name or skillId),
				isSupport = skill.isSupport or false,
			}
		elseif skillId then
			sourceName = skillId
			sourceRef = { kind = "skill", id = skillId }
		end
	elseif srcDesc:match("^Pantheon:") then
		sourceType = "Pantheon"
		sourceName = srcDesc:match("^Pantheon:(.+)") or srcDesc
		sourceRef = { kind = "pantheon", name = stripColourCodes(sourceName) }
	elseif srcDesc:match("^Mastery:") then
		sourceType = "Mastery"
		sourceName = srcDesc:match("^Mastery:(.+)") or srcDesc
		sourceRef = { kind = "mastery", name = stripColourCodes(sourceName) }
	elseif srcDesc:match("^Keystone:") then
		sourceType = "Keystone"
		sourceName = srcDesc:match("^Keystone:(.+)") or srcDesc
		sourceRef = { kind = "keystone", name = stripColourCodes(sourceName) }
	elseif srcDesc:match("^Ascendancy:") then
		sourceType = "Ascendancy"
		sourceName = srcDesc:match("^Ascendancy:(.+)") or srcDesc
		sourceRef = { kind = "ascendancy", name = stripColourCodes(sourceName) }
	elseif srcDesc:match("^Config:") then
		sourceType = "Config"
		sourceRef = { kind = "config" }
	end

	return stripColourCodes(sourceName), sourceType, sourceRef
end

local function projectModSources(actor, sectionData, build)
	if type(actor) ~= "table" or type(sectionData) ~= "table" then return nil end
	if not sectionData.modName and not sectionData.modType and not sectionData.modList then return nil end

	local cfg = (sectionData.cfg and actor.mainSkill and type(actor.mainSkill[sectionData.cfg.."Cfg"]) == "table" and copyTable(actor.mainSkill[sectionData.cfg.."Cfg"], true)) or {}
	cfg.source = sectionData.modSource
	cfg.ignoreSourceInCheckConditions = true
	cfg.actor = sectionData.actor

	local modStore = (sectionData.enemy and actor.enemy and actor.enemy.modDB) or (sectionData.cfg and actor.mainSkill and actor.mainSkill.skillModList) or actor.modDB
	if not modStore or type(modStore.Tabulate) ~= "function" then return nil end

	local modNames = {}
	if sectionData.modName then
		if type(sectionData.modName) == "table" then
			for _, m in ipairs(sectionData.modName) do table.insert(modNames, m) end
		else
			table.insert(modNames, sectionData.modName)
		end
	end
	if sectionData.breakdown then
		if sectionData.breakdown == "PresenceRadius" or sectionData.breakdown == "PresenceMod" then
			table.insert(modNames, "PresenceRadius")
			table.insert(modNames, "PresenceArea")
		elseif sectionData.breakdown == "SurroundedRadius" or sectionData.breakdown == "SurroundedMod" then
			table.insert(modNames, "SurroundedRadius")
			table.insert(modNames, "SurroundedArea")
		end
	end
	if sectionData.modName == "PresenceArea" then
		table.insert(modNames, "PresenceRadius")
	elseif sectionData.modName == "SurroundedArea" then
		table.insert(modNames, "SurroundedRadius")
	end

	local rowList
	if sectionData.modList then
		rowList = copyTable(sectionData.modList, true)
	elseif #modNames > 0 then
		local ok, list = pcall(modStore.Tabulate, modStore, sectionData.modType, cfg, unpack(modNames))
		if ok and type(list) == "table" and #list > 0 then 
			rowList = list 
		else
			local ok2, list2 = pcall(modStore.Tabulate, modStore, sectionData.modType, {}, unpack(modNames))
			if ok2 and type(list2) == "table" then rowList = list2 end
		end
	end

	if not rowList or #rowList == 0 then return nil end

	local sources = {}
	for _, row in ipairs(rowList) do
		if type(row) == "table" and type(row.mod) == "table" then
			local mod = row.mod
			local rawVal = row.value or mod.value
			local valueNum = tonumber(rawVal)
			local valStr = tostring(rawVal or "")
			local srcDesc = stripColourCodes(stringValue(mod.source, ""))
			local srcName, sourceType, sourceRef = resolveModSource(srcDesc, build)
			if srcName == "" or srcName == srcDesc then
				srcName = stripColourCodes(stringValue(row.sourceName, mod.sourceName, srcDesc))
			end

			table.insert(sources, {
				value = valueNum or valStr,
				modType = stripColourCodes(stringValue(mod.type, "BASE")),
				name = stripColourCodes(stringValue(mod.name, "")),
				source = srcDesc,
				sourceName = srcName,
				sourceType = sourceType,
				sourceRef = sourceRef,
			})
		end
	end
	return #sources > 0 and sources or nil
end

local function projectDpsPipeline(actor, calcsTab, build)
	if not actor or type(actor.output) ~= "table" then return nil end
	local out = actor.output
	local mainSkill = actor.mainSkill
	local activeEffect = mainSkill and mainSkill.activeEffect
	local cfg = (mainSkill and type(mainSkill.skillCfg) == "table" and mainSkill.skillCfg) or {}
	local skillModList = (mainSkill and mainSkill.skillModList) or actor.modDB
	local modStore = skillModList or actor.modDB

	local skillName = activeEffect and activeEffect.grantedEffect and activeEffect.grantedEffect.name or "主技能"
	local skillLevel = activeEffect and activeEffect.level or 20
	local skillQuality = activeEffect and activeEffect.quality or 0
	local gemCount = (mainSkill and mainSkill.socketGroup and type(mainSkill.socketGroup.gemList) == "table") and #mainSkill.socketGroup.gemList or 0

	local calcMode = (calcsTab and calcsTab.input and calcsTab.input.misc_buffMode) or "EFFECTIVE"

	-- 1. 暴击几率与暴击伤害拆解
	local critChance = tonumber(out.CritChance) or tonumber(out.PreEffectiveCritChance) or 0
	local critMultiplier = tonumber(out.CritMultiplier) or 1
	local critEffect = tonumber(out.CritEffect) or ((1 - critChance / 100) + (critChance / 100) * critMultiplier)
	local critMultiBase = (skillModList and skillModList.Sum and skillModList:Sum("BASE", cfg, "CritMultiplier")) or 150
	local critMultiInc = (skillModList and skillModList.Sum and skillModList:Sum("INC", cfg, "CritMultiplier")) or 0
	local critMultiMore = (skillModList and skillModList.More and skillModList:More("MORE", cfg, "CritMultiplier")) or 1

	-- 2. 增伤乘区
	local incDamage = (skillModList and skillModList.Sum and skillModList:Sum("INC", cfg, "Damage", "SpellDamage", "ElementalDamage", "LightningDamage", "FireDamage", "ColdDamage", "PhysicalDamage", "ChaosDamage")) or 0
	local moreDamage = (skillModList and skillModList.More and skillModList:More("MORE", cfg, "Damage", "SpellDamage", "ElementalDamage", "LightningDamage", "FireDamage", "ColdDamage", "PhysicalDamage", "ChaosDamage")) or 1

	-- 3. 独立提取专属于暴击率与暴击伤害的 Tabulate 来源
	local critChanceSources, critMultiSources = {}, {}
	if modStore and modStore.Tabulate then
		-- 暴击几率 sources
		local ok1, list1 = pcall(modStore.Tabulate, modStore, "INC", cfg, "CritChance", "SpellCritChance", "AttackCritChance")
		if ok1 and type(list1) == "table" then
			for _, r in ipairs(list1) do
				if r.mod then
					local sDesc = stripColourCodes(stringValue(r.mod.source, ""))
					local sType = sDesc:match("^Item:") and "Item" or sDesc:match("^Tree:") and "Tree" or sDesc:match("^Skill:") and "Skill" or "Other"
					critChanceSources[#critChanceSources + 1] = {
						value = tonumber(r.value or r.mod.value) or r.value,
						modType = "INC",
						name = stripColourCodes(stringValue(r.mod.name, "暴击几率提高")),
						source = sDesc,
						sourceName = stripColourCodes(stringValue(r.sourceName, r.mod.sourceName, sDesc)),
						sourceType = sType,
					}
				end
			end
		end
		-- 暴击伤害 sources
		local ok2, list2 = pcall(modStore.Tabulate, modStore, "BASE", cfg, "CritMultiplier", "SpellCritMultiplier", "AttackCritMultiplier")
		if ok2 and type(list2) == "table" then
			for _, r in ipairs(list2) do
				if r.mod then
					local sDesc = stripColourCodes(stringValue(r.mod.source, ""))
					local sType = sDesc:match("^Item:") and "Item" or sDesc:match("^Tree:") and "Tree" or sDesc:match("^Skill:") and "Skill" or "Other"
					critMultiSources[#critMultiSources + 1] = {
						value = tonumber(r.value or r.mod.value) or r.value,
						modType = "BASE",
						name = stripColourCodes(stringValue(r.mod.name, "暴击伤害加成")),
						source = sDesc,
						sourceName = stripColourCodes(stringValue(r.sourceName, r.mod.sourceName, sDesc)),
						sourceType = sType,
					}
				end
			end
		end
	end

	-- 4. 提取 5 大元素专属的点伤、提高、更多乘区与抗性修正 (动态直连 Lua 引擎，杜绝任何假数据或词条污染)
	local elementStats = {}
	local elementNames = {
		lightning = { 
			min = "LightningMin", max = "LightningMax", 
			incNames = { "LightningDamage", "ElementalDamage", "SpellDamage", "Damage" },
			effKey = "LightningEffMult",
			resKey = "EnemyLightningResist"
		},
		cold = { 
			min = "ColdMin", max = "ColdMax", 
			incNames = { "ColdDamage", "ElementalDamage", "SpellDamage", "Damage" },
			effKey = "ColdEffMult",
			resKey = "EnemyColdResist"
		},
		fire = { 
			min = "FireMin", max = "FireMax", 
			incNames = { "FireDamage", "ElementalDamage", "SpellDamage", "Damage" },
			effKey = "FireEffMult",
			resKey = "EnemyFireResist"
		},
		chaos = { 
			min = "ChaosMin", max = "ChaosMax", 
			incNames = { "ChaosDamage", "SpellDamage", "Damage" },
			effKey = "ChaosEffMult",
			resKey = "EnemyChaosResist"
		},
		physical = { 
			min = "PhysicalMin", max = "PhysicalMax", 
			incNames = { "PhysicalDamage", "SpellDamage", "Damage" },
			effKey = "PhysicalEffMult",
			resKey = nil
		},
	}

	for eleKey, modCfg in pairs(elementNames) do
		local eleInc = (skillModList and skillModList.Sum and skillModList:Sum("INC", cfg, unpack(modCfg.incNames))) or 0
		local eleMore = (skillModList and skillModList.More and skillModList:More("MORE", cfg, unpack(modCfg.incNames))) or 1
		local eleEff = tonumber(out[modCfg.effKey]) or (modCfg.resKey and (1 - (tonumber(out[modCfg.resKey]) or 0) / 100)) or 1.0

		local sources = {}
		if modStore and modStore.Tabulate then
			-- A. 附加点伤
			local okMin, listMin = pcall(modStore.Tabulate, modStore, "BASE", cfg, modCfg.min, modCfg.max)
			if okMin and type(listMin) == "table" then
				for _, r in ipairs(listMin) do
					if r.mod then
						local sDesc = stripColourCodes(stringValue(r.mod.source, ""))
						local sName, sType, sRef = resolveModSource(sDesc, build)
						if sName == "" or sName == sDesc then
							sName = stripColourCodes(stringValue(r.sourceName, r.mod.sourceName, sDesc))
						end
						sources[#sources + 1] = {
							value = tonumber(r.value or r.mod.value) or r.value,
							modType = "BASE",
							name = stripColourCodes(stringValue(r.mod.name, "附加点伤")),
							source = sDesc,
							sourceName = sName,
							sourceType = sType,
							sourceRef = sRef,
						}
					end
				end
			end
			-- B. 元素提高 (严格按专属 incNames 过滤，混沌/物理绝不混入元素提高)
			local okInc, listInc = pcall(modStore.Tabulate, modStore, "INC", cfg, unpack(modCfg.incNames))
			if okInc and type(listInc) == "table" then
				for _, r in ipairs(listInc) do
					if r.mod then
						local sDesc = stripColourCodes(stringValue(r.mod.source, ""))
						local sName, sType, sRef = resolveModSource(sDesc, build)
						if sName == "" or sName == sDesc then
							sName = stripColourCodes(stringValue(r.sourceName, r.mod.sourceName, sDesc))
						end
						sources[#sources + 1] = {
							value = tonumber(r.value or r.mod.value) or r.value,
							modType = "INC",
							name = stripColourCodes(stringValue(r.mod.name, "伤害提高")),
							source = sDesc,
							sourceName = sName,
							sourceType = sType,
							sourceRef = sRef,
						}
					end
				end
			end
			-- C. 元素更多 (More)
			local okMore, listMore = pcall(modStore.Tabulate, modStore, "MORE", cfg, unpack(modCfg.incNames))
			if okMore and type(listMore) == "table" then
				for _, r in ipairs(listMore) do
					if r.mod then
						local sDesc = stripColourCodes(stringValue(r.mod.source, ""))
						local sName, sType, sRef = resolveModSource(sDesc, build)
						if sName == "" or sName == sDesc then
							sName = stripColourCodes(stringValue(r.sourceName, r.mod.sourceName, sDesc))
						end
						sources[#sources + 1] = {
							value = tonumber(r.value or r.mod.value) or r.value,
							modType = "MORE",
							name = stripColourCodes(stringValue(r.mod.name, "伤害更多")),
							source = sDesc,
							sourceName = sName,
							sourceType = sType,
							sourceRef = sRef,
						}
					end
				end
			end
		end

		local prefix = eleKey:gsub("^%l", string.upper)
		local eleMin = tonumber(out[prefix .. "Min"]) or 0
		local eleMax = tonumber(out[prefix .. "Max"]) or 0
		local eleHit = tonumber(out[prefix .. "HitAvg"]) or ((eleMin + eleMax) / 2)
		local eleDps = tonumber(out[prefix .. "DPS"]) or 0

		elementStats[eleKey] = {
			min = eleMin,
			max = eleMax,
			hit = eleHit,
			dps = eleDps,
			inc = eleInc,
			more = eleMore,
			effMult = eleEff,
			sources = #sources > 0 and sources or nil
		}
	end

	-- 5. 提取全量增伤乘区来源 (所有 Inc 提高与 More 更多)
	local multiplierSources = {}
	if modStore and modStore.Tabulate then
		local incModNames = { "Damage", "SpellDamage", "AttackDamage", "ElementalDamage", "LightningDamage", "ColdDamage", "FireDamage", "PhysicalDamage", "ChaosDamage", "AreaDamage", "ProjectileDamage", "MeleeDamage" }
		local okIncAll, listIncAll = pcall(modStore.Tabulate, modStore, "INC", cfg, unpack(incModNames))
		if okIncAll and type(listIncAll) == "table" then
			for _, r in ipairs(listIncAll) do
				if r.mod then
					local sDesc = stripColourCodes(stringValue(r.mod.source, ""))
					local sName, sType, sRef = resolveModSource(sDesc, build)
					if sName == "" or sName == sDesc then
						sName = stripColourCodes(stringValue(r.sourceName, r.mod.sourceName, sDesc))
					end
					multiplierSources[#multiplierSources + 1] = {
						value = tonumber(r.value or r.mod.value) or r.value,
						modType = "INC",
						name = stripColourCodes(stringValue(r.mod.name, "伤害提高")),
						source = sDesc,
						sourceName = sName,
						sourceType = sType,
						sourceRef = sRef,
					}
				end
			end
		end

		local okMoreAll, listMoreAll = pcall(modStore.Tabulate, modStore, "MORE", cfg, unpack(incModNames))
		if okMoreAll and type(listMoreAll) == "table" then
			for _, r in ipairs(listMoreAll) do
				if r.mod then
					local sDesc = stripColourCodes(stringValue(r.mod.source, ""))
					local sName, sType, sRef = resolveModSource(sDesc, build)
					if sName == "" or sName == sDesc then
						sName = stripColourCodes(stringValue(r.sourceName, r.mod.sourceName, sDesc))
					end
					multiplierSources[#multiplierSources + 1] = {
						value = tonumber(r.value or r.mod.value) or r.value,
						modType = "MORE",
						name = stripColourCodes(stringValue(r.mod.name, "伤害更多")),
						source = sDesc,
						sourceName = sName,
						sourceType = sType,
						sourceRef = sRef,
					}
				end
			end
		end
	end

	local officialBreakdowns = {}
	if actor and actor.breakdown then
		for bKey, bVal in pairs(actor.breakdown) do
			if type(bVal) == "table" then
				local lines = {}
				for _, line in ipairs(bVal) do
					if type(line) == "string" then
						if line == "Hit damage:" and bVal.damageTypes and #bVal.damageTypes > 0 then
							for _, dt in ipairs(bVal.damageTypes) do
								local dtSource = dt.source or bKey
								local srcLabel = dtSource .. "来源加成"
								if dt.inc then
									lines[#lines + 1] = stripColourCodes(dt.inc .. " (提高伤害倍率: " .. srcLabel .. ")")
								end
								if dt.more then
									lines[#lines + 1] = stripColourCodes(dt.more .. " (更多伤害乘区: " .. srcLabel .. ")")
								end
							end
						end
						lines[#lines + 1] = stripColourCodes(line)
					end
				end
				if #lines > 0 then
					officialBreakdowns[bKey] = lines
				end
			end
		end
	end

	return {
		skillName = stripColourCodes(skillName),
		skillLevel = skillLevel,
		skillQuality = skillQuality,
		gemCount = gemCount,
		calcMode = calcMode,

		-- 金字塔各层核心指标
		totalDPS = tonumber(out.TotalDPS) or 0,
		hitDPS = tonumber(out.HitDPS) or tonumber(out.TotalDPS) or 0,
		dotDPS = tonumber(out.TotalDot) or 0,
		avgHit = tonumber(out.AverageHit) or tonumber(out.AverageDamage) or 0,
		speed = tonumber(out.Speed) or tonumber(out.CastRate) or 0,
		castTime = tonumber(out.Time) or (tonumber(out.Speed) and tonumber(out.Speed) > 0 and (1 / tonumber(out.Speed))) or 0,
		hitChance = tonumber(out.HitChance) or 100,

		-- 暴击金字塔
		critChance = critChance,
		critMultiplier = critMultiplier,
		critEffect = critEffect,
		critMultiBase = critMultiBase,
		critMultiInc = critMultiInc,
		critMultiMore = critMultiMore,
		critChanceSources = #critChanceSources > 0 and critChanceSources or nil,
		critMultiSources = #critMultiSources > 0 and critMultiSources or nil,

		-- 增伤金字塔
		incDamage = incDamage,
		moreDamage = moreDamage,
		multiplierSources = #multiplierSources > 0 and multiplierSources or nil,

		-- 异常状态核心及官方原版全量明细
		igniteDPS = tonumber(out.IgniteDPS) or 0,
		igniteChance = tonumber(out.IgniteChancePerHit) or tonumber(out.IgniteChance) or 0,
		igniteDuration = tonumber(out.IgniteDuration) or 4.0,
		igniteDamage = tonumber(out.IgniteDamage) or 0,
		
		igniteDetails = {
			enemyThreshold = tonumber(out.EnemyAilmentThreshold) or 0,
			stacksMax = tonumber(out.IgniteStacksMax) or 1,
			stackPotential = tonumber(out.IgniteStackPotentialPercent) or 0,
			rollAverage = tonumber(out.IgniteRollAverage) or 0,
			chancePerHit = tonumber(out.IgniteChancePerHit) or 0,
			magnitudeEffect = tonumber(out.IgniteMagnitudeEffect) or 1,
			sources = {
				lightning = (tonumber(out.IgniteLightningMax) or 0) > 0 and { min = tonumber(out.IgniteLightningMin) or 0, max = tonumber(out.IgniteLightningMax) or 0 } or nil,
				cold = (tonumber(out.IgniteColdMax) or 0) > 0 and { min = tonumber(out.IgniteColdMin) or 0, max = tonumber(out.IgniteColdMax) or 0 } or nil,
				fire = (tonumber(out.IgniteFireMax) or 0) > 0 and { min = tonumber(out.IgniteFireMin) or 0, max = tonumber(out.IgniteFireMax) or 0 } or nil,
				chaos = (tonumber(out.IgniteChaosMax) or 0) > 0 and { min = tonumber(out.IgniteChaosMin) or 0, max = tonumber(out.IgniteChaosMax) or 0 } or nil,
				physical = (tonumber(out.IgnitePhysicalMax) or 0) > 0 and { min = tonumber(out.IgnitePhysicalMin) or 0, max = tonumber(out.IgnitePhysicalMax) or 0 } or nil,
			},
			effectiveMult = tonumber(out.IgniteEffMult) or 1,
			dps = tonumber(out.IgniteDPS) or 0,
			duration = tonumber(out.IgniteDuration) or 4.0,
			damageAll = tonumber(out.IgniteDamage) or 0,
		},

		shockEffect = tonumber(out.ShockVal) or tonumber(out.ShockEffect) or 1.0,
		shockChance = tonumber(out.ShockChance) or 0,
		
		freezeChance = tonumber(out.FreezeChance) or 0,
		chillChance = tonumber(out.ChillChance) or 0,
		bleedDPS = tonumber(out.BleedDPS) or 0,
		poisonDPS = tonumber(out.PoisonDPS) or 0,

		-- 元素点伤与秒伤 (真实动态计算)
		damageTypes = elementStats,

		-- 消耗与抗性
		manaCost = tonumber(out.ManaCost) or 0,
		manaCostPerSecond = tonumber(out.ManaCostPerSecond) or 0,
		manaRegen = tonumber(out.ManaRegen) or tonumber(out.ManaRegenRecovery) or 0,
		enemyResist = {
			fire = tonumber(out.EnemyFireResist) or 0,
			cold = tonumber(out.EnemyColdResist) or 0,
			lightning = tonumber(out.EnemyLightningResist) or 0,
			chaos = tonumber(out.EnemyChaosResist) or 0,
		},

		-- 官方核心生成的原始推导文本
		officialBreakdowns = officialBreakdowns,
	}
end

local function formatDisplayValue(columnData, actor)
	if not columnData or not actor then return "" end
	local out = actor.output or {}
	local fmt = columnData.format
	if type(fmt) ~= "string" then return "" end

	local str = fmt:gsub("{output:([%a%.:_]+)}", function(c) 
		local ns, var = c:match("^(%a+)%.(%a+)$")
		if ns then
			return out[ns] and out[ns][var] or ""
		else
			return out[c] or ""
		end
	end)
	str = str:gsub("{(%d+):output:([%a%.:_]+)}", function(p, c) 
		local ns, var = c:match("^(%a+)%.(%a+)$")
		local val = ns and (out[ns] and out[ns][var] or 0) or (out[c] or 0)
		local num = tonumber(val)
		if num then
			local prec = tonumber(p) or 0
			if prec > 0 then
				return string.format("%." .. prec .. "f", num)
			else
				return tostring(math.floor(num + 0.5))
			end
		end
		return tostring(val or "")
	end)
	str = str:gsub("{(%d+):mod:([%d,]+)}", function(p, n)
		local numList = { }
		for num in n:gmatch("%d+") do
			table.insert(numList, tonumber(num))
		end
		if #numList == 0 or not columnData[numList[1]] then return "" end
		local modType = columnData[numList[1]].modType
		local modTotal = modType == "MORE" and 1 or 0
		for _, num in ipairs(numList) do
			local sectionData = columnData[num]
			if sectionData then
				local modCfg = (sectionData.cfg and actor.mainSkill and actor.mainSkill[sectionData.cfg.."Cfg"]) or { }
				if sectionData.modSource then
					modCfg.source = sectionData.modSource
					modCfg.ignoreSourceInCheckConditions = true
				end
				if sectionData.actor then
					modCfg.actor = sectionData.actor
				end
				local modVal = modType == "MORE" and 1 or 0
				local modStore = (sectionData.enemy and actor.enemy and actor.enemy.modDB) or (sectionData.cfg and actor.mainSkill and actor.mainSkill.skillModList) or actor.modDB
				if modStore and type(modStore.Combine) == "function" then
					if type(sectionData.modName) == "table" then
						local ok, res = pcall(modStore.Combine, modStore, sectionData.modType, modCfg, unpack(sectionData.modName))
						if ok and res then modVal = res end
					elseif sectionData.modName then
						local ok, res = pcall(modStore.Combine, modStore, sectionData.modType, modCfg, sectionData.modName)
						if ok and res then modVal = res end
					end
				end
				if modType == "MORE" then
					modTotal = modTotal * modVal
				else
					modTotal = modTotal + modVal
				end
			end
		end
		if modType == "MORE" then
			modTotal = (modTotal - 1) * 100
		end
		local prec = tonumber(p) or 0
		if prec > 0 then
			return string.format("%." .. prec .. "f", modTotal)
		else
			return tostring(math.floor(modTotal + 0.5))
		end
	end)
	return stripColourCodes(str)
end

local function projectBreakdown(build, fastMode)
	local calcsTab = type(build.calcsTab) == "table" and build.calcsTab or nil
	local env = calcsTab and type(calcsTab.calcsEnv) == "table" and calcsTab.calcsEnv or nil
	local input = calcsTab and type(calcsTab.input) == "table" and calcsTab.input or {}
	local actor = env and (input.showMinion and env.minion or env.player) or nil
	if not actor then return { sections = {}, dynamicSubSections = {}, dpsPipeline = nil } end

	local dpsPipeline = projectDpsPipeline(actor, calcsTab, build)
	local sections, seen = {}, {}
	local dynamicSubSections = {}

	for sectionIndex, calcSection in ipairs(calcsTab.sectionList or {}) do
		if type(calcSection) == "table" and checkCalculationFlag(calcsTab, calcSection) then
			for subIndex, subSection in ipairs(calcSection.subSection or {}) do
				if type(subSection) == "table" and checkCalculationFlag(calcsTab, subSection) then
					local subKey = tostring(subSection.id or subSection.label or subIndex)
					local subLabel = stripColourCodes(stringValue(subSection.label, subSection.id, "小节"))
					local subRows = {}

					for rowIndex, rowData in ipairs(subSection.data or {}) do
						if type(rowData) == "table" and checkCalculationFlag(calcsTab, rowData) then
							local rowLabel = stripColourCodes(stringValue(rowData.label, ""))
							for columnIndex, columnData in ipairs(rowData) do
								if type(columnData) == "table" and checkCalculationFlag(calcsTab, columnData) then
									local valText = formatDisplayValue(columnData, actor)
									local breakdownLines = {}
									local breakdownTables = {}
									local rowSources = nil

									local detailList = {}
									if type(columnData.breakdown) == "string" or columnData.modName or columnData.modType then
										detailList[#detailList + 1] = columnData
									end
									for _, detail in ipairs(columnData) do detailList[#detailList + 1] = detail end

									for detailIndex, sectionData in ipairs(detailList) do
										if type(sectionData) == "table" and checkCalculationFlag(calcsTab, sectionData) then
											local content = {}
											if type(sectionData.breakdown) == "string" then
												local bData = breakdownFor(actor, sectionData.breakdown)
												if bData then
													for _, bLine in ipairs(bData) do
														if type(bLine) == "string" then
															breakdownLines[#breakdownLines + 1] = stripColourCodes(bLine)
														end
													end
													if #breakdownLines == 0 and type(bData.radius) == "number" then
														local metres = bData.radius / 10
														breakdownLines[#breakdownLines + 1] = string.format("%.1fm (基础范围)", metres)
														breakdownLines[#breakdownLines + 1] = string.format("= %.1fm", metres)
													end
													content = projectBreakdownTables(bData, sectionData, build)
													for _, tab in ipairs(content) do
														breakdownTables[#breakdownTables + 1] = tab
													end
												end
												if #breakdownLines == 0 then
													if (sectionData.breakdown == "PresenceRadius" or rowData.label == "Presence Radius") and actor.output.PresenceRadiusMetres then
														breakdownLines[#breakdownLines + 1] = string.format("%.1fm (基础在场半径)", actor.output.PresenceRadiusMetres)
														breakdownLines[#breakdownLines + 1] = string.format("= %.1fm", actor.output.PresenceRadiusMetres)
													elseif (sectionData.breakdown == "SurroundedRadius" or rowData.label == "Surrounded Radius") and actor.output.SurroundedRadiusMetres then
														breakdownLines[#breakdownLines + 1] = string.format("%.1fm (基础包围判定半径)", actor.output.SurroundedRadiusMetres)
														breakdownLines[#breakdownLines + 1] = string.format("= %.1fm", actor.output.SurroundedRadiusMetres)
													elseif (sectionData.breakdown == "PresenceMod" or rowData.label == "Presence Mod") and actor.output.PresenceMod then
														breakdownLines[#breakdownLines + 1] = string.format("x %.2f (在场效果倍率)", actor.output.PresenceMod)
													elseif (sectionData.breakdown == "SurroundedMod" or rowData.label == "Surrounded Mod") and actor.output.SurroundedMod then
														breakdownLines[#breakdownLines + 1] = string.format("x %.2f (包围判定倍率)", actor.output.SurroundedMod)
													end
												end
											end
											local sources = projectModSources(actor, sectionData, build)
											if sources then
												rowSources = rowSources or {}
												for _, s in ipairs(sources) do rowSources[#rowSources + 1] = s end
											end

											if not fastMode and (#content > 0 or sources) then
												local key = table.concat({ sectionIndex, subIndex, rowIndex, columnIndex, detailIndex, tostring(sectionData.breakdown or sectionData.modName or "") }, ":")
												if not seen[key] then
													seen[key] = true
													sections[#sections + 1] = {
														key = key,
														group = stripColourCodes(stringValue(calcSection.id, "General")),
														label = stripColourCodes(stringValue(sectionData.label, rowData.label, subSection.label, sectionData.breakdown, "明细")),
														sections = content,
														sources = sources,
													}
												end
											end
										end
									end

									if valText ~= "" or #breakdownLines > 0 or rowSources then
										subRows[#subRows + 1] = {
											label = rowLabel ~= "" and rowLabel or (stripColourCodes(stringValue(columnData.label, "属性"))),
											value = valText,
											breakdownLines = #breakdownLines > 0 and breakdownLines or nil,
											breakdownTables = #breakdownTables > 0 and breakdownTables or nil,
											sources = rowSources,
										}
									end
								end
							end
						end
					end

					if #subRows > 0 then
						local headerVal = nil
						if type(subSection.data) == "table" and type(subSection.data.extra) == "string" then
							headerVal = formatDisplayValue({ format = subSection.data.extra }, actor)
						end
						local entry = {
							key = subKey,
							label = subLabel,
							group = stripColourCodes(stringValue(calcSection.id, "General")),
							headerValue = headerVal,
							rows = subRows,
						}
						dynamicSubSections[subKey] = entry
						if subSection.label then
							dynamicSubSections[stripColourCodes(subSection.label)] = entry
						end
						if subSection.id then
							dynamicSubSections[stripColourCodes(subSection.id)] = entry
						end
						if calcSection.id and not dynamicSubSections[stripColourCodes(calcSection.id)] then
							dynamicSubSections[stripColourCodes(calcSection.id)] = entry
						end
					end
				end
			end
		end
	end

	if dpsPipeline then
		dpsPipeline.dynamicSubSections = dynamicSubSections
	end

	return { sections = sections, dynamicSubSections = dynamicSubSections, dpsPipeline = dpsPipeline }
end

local function projectConfig(build, runtime)
	local configTab = type(build.configTab) == "table" and build.configTab or nil
	if not configTab or type(configTab.configSets) ~= "table" then return { options = {} } end
	local activeId = tonumber(configTab.activeConfigSetId) or 1
	local active = configTab.configSets[activeId]
	if type(active) ~= "table" then return { activeConfigSetId = activeId, options = {} } end
	local loadModule = type(runtime) == "table" and runtime.LoadModule or nil
	if type(loadModule) ~= "function" then return { activeConfigSetId = activeId, options = {} } end
	local loaded, optionList = pcall(loadModule, "Modules/ConfigOptions")
	if not loaded or type(optionList) ~= "table" then return { activeConfigSetId = activeId, options = {} } end
	local options, section = {}, ""
	for _, option in ipairs(optionList) do
		if type(option) == "table" then
			if type(option.section) == "string" then section = stripColourCodes(option.section)
			elseif type(option.var) == "string" and ({ check = true, count = true, integer = true, countAllowZero = true, float = true, list = true, text = true })[option.type] then
				local entry = {
					var = option.var,
					label = stripColourCodes(stringValue(option.label, option.var)),
					type = option.type,
					section = section,
					value = active.input and active.input[option.var],
					placeholder = active.placeholder and active.placeholder[option.var],
				}
				if type(option.list) == "table" then
					entry.list = {}
					for _, choice in ipairs(option.list) do
						if type(choice) == "table" and choice.val ~= nil then table.insert(entry.list, { value = choice.val, label = stripColourCodes(stringValue(choice.label, tostring(choice.val))) }) end
					end
				end
				table.insert(options, entry)
			end
		end
	end
	return { activeConfigSetId = activeId, options = options }
end

local function projectBuild(build, requestedName, output, runtime, fastMode, skillBreakdown)
	if type(build) ~= "table" then
		return nil, unsupportedProjection("build", "PoB did not retain the imported build")
	end
	local treeTab = type(build.treeTab) == "table" and build.treeTab or {}
	local itemsTab = type(build.itemsTab) == "table" and build.itemsTab or {}
	local skillsTab = type(build.skillsTab) == "table" and build.skillsTab or {}
	local spec = type(build.spec) == "table" and build.spec or {}
	local projection = {
		projectionVersion = "pob-cn-web-active-build-v1",
		buildName = stringValue(requestedName, build.buildName, "Imported build"),
		className = stringValue(spec.curClassName, build.className, "Unknown"),
		ascendancyName = stringValue(spec.curAscendClassName, build.ascendClassName),
		characterLevel = tonumber(build.characterLevel) or 1,
		allocNodes = {},
		itemLibrary = {},
		equippedItems = {},
		socketedJewels = {},
		socketGroups = {},
		loadouts = {
			active = {
				specId = tonumber(treeTab.activeSpec) or 1,
				itemSetId = tonumber(itemsTab.activeItemSetId) or 1,
				skillSetId = tonumber(skillsTab.activeSkillSetId) or 1,
				configSetId = tonumber(type(build.configTab) == "table" and build.configTab.activeConfigSetId) or 1,
			},
			passiveTrees = {},
			itemSets = {},
			skillSets = {},
			configSets = {},
		},
		output = outputScalars(output),
		skillBreakdown = skillBreakdown or projectBreakdown(build, fastMode),
		calcsSkillGroup = tonumber(type(build.calcsTab) == "table" and type(build.calcsTab.input) == "table" and build.calcsTab.input.skill_number) or 1,
		buffMode = stringValue(type(build.calcsTab) == "table" and type(build.calcsTab.input) == "table" and build.calcsTab.input.misc_buffMode, "EFFECTIVE"),
		config = projectConfig(build, runtime),
		preservedByCore = {
			"Configuration and calculation options",
			"Notes and metadata",
			"Official XML retained by the running PoB core",
		},
	}
	local equipmentSlots, utilitySlots = {}, {}
	for slotName, slot in pairs(itemsTab.slots or {}) do
		local shown = true
		if type(slot) == "table" and type(slot.shown) == "function" then
			local shownOk, shownValue = pcall(slot.shown)
			shown = not shownOk or shownValue == true
		end
		if shown and type(slotName) == "string" and type(slot) == "table" and not slot.nodeId then
			if slotName:match("^Flask") or slotName:match("^Charm") then
				table.insert(utilitySlots, slotName)
			else
				table.insert(equipmentSlots, slotName)
			end
		end
	end
	local equipmentSlotOrder = {
		["Weapon 1"] = 10,
		["Weapon 1 Swap"] = 11,
		["Weapon 2"] = 20,
		["Weapon 2 Swap"] = 21,
		["Helmet"] = 30,
		["Body Armour"] = 40,
		["Gloves"] = 50,
		["Boots"] = 60,
		["Amulet"] = 70,
		["Ring 1"] = 80,
		["Ring 2"] = 81,
		["Ring 3"] = 82,
		["Belt"] = 90,
		["Arm 1"] = 1000,
		["Arm 2"] = 1001,
		["Leg 1"] = 1010,
		["Leg 2"] = 1011,
	}
	local function equipmentSlotSortKey(slotName)
		local direct = equipmentSlotOrder[slotName]
		if direct then return direct end
		local parent, socketIndex = slotName:match("^(.-) Jewel Socket (%d+)$")
		local parentOrder = parent and equipmentSlotOrder[parent]
		if parentOrder then return parentOrder + (tonumber(socketIndex) or 0) / 100 end
		return 2000
	end
	table.sort(equipmentSlots, function(left, right)
		local leftKey, rightKey = equipmentSlotSortKey(left), equipmentSlotSortKey(right)
		if leftKey ~= rightKey then return leftKey < rightKey end
		return left < right
	end)
	table.sort(utilitySlots)
	projection.loadouts.equipmentSlots = equipmentSlots
	projection.loadouts.utilitySlots = utilitySlots

	local itemsById = {}
	for itemId, item in pairs(itemsTab.items or {}) do
		local projectedItem, err = projectItem(item, nil, build.data, itemsTab)
		if not projectedItem then return nil, err end
		itemsById[tonumber(itemId) or projectedItem.id] = projectedItem
		table.insert(projection.itemLibrary, projectedItem)
	end
	table.sort(projection.itemLibrary, function(left, right) return left.id < right.id end)

	local specList = type(treeTab.specList) == "table" and treeTab.specList or nil
	if not specList or not specList[1] then specList = { spec } end
	for specId, passiveSpec in ipairs(specList) do
		if specId == projection.loadouts.active.specId then passiveSpec = spec end
		local nodes = {}
		for nodeId in pairs(passiveSpec.allocNodes or {}) do
			local numericId = tonumber(nodeId)
			if numericId then table.insert(nodes, numericId) end
		end
		table.sort(nodes)
		local jewels, jewelError = projectSocketedJewels(passiveSpec, itemsById, "treeTab.specList["..specId.."].jewels")
		if not jewels then return nil, jewelError end
		local projectedSpec = { id = specId, title = stringValue(passiveSpec.title, "Default"), allocNodes = nodes, socketedJewels = jewels }
		table.insert(projection.loadouts.passiveTrees, projectedSpec)
		if specId == projection.loadouts.active.specId then
			projection.allocNodes = nodes
			projection.socketedJewels = jewels
		end
	end

	local itemSetOrder = type(itemsTab.itemSetOrderList) == "table" and itemsTab.itemSetOrderList or nil
	if not itemSetOrder or not itemSetOrder[1] then itemSetOrder = { projection.loadouts.active.itemSetId } end
	for _, itemSetId in ipairs(itemSetOrder) do
		local itemSet = type(itemsTab.itemSets) == "table" and itemsTab.itemSets[itemSetId] or itemsTab.activeItemSet or {}
		if type(itemSet) ~= "table" then return nil, unsupportedProjection("itemsTab.itemSets["..itemSetId.."]", "PoB returned an invalid equipment set") end
		local equipped, equipmentError = projectEquippedItems(itemsTab, itemSet, itemsById, "itemsTab.itemSets["..itemSetId.."]")
		if not equipped then return nil, equipmentError end
		local projectedSet = { id = tonumber(itemSetId) or itemSetId, title = stringValue(itemSet.title, "Default"), useSecondWeaponSet = itemSet.useSecondWeaponSet == true, equippedItems = equipped }
		table.insert(projection.loadouts.itemSets, projectedSet)
		if tonumber(itemSetId) == projection.loadouts.active.itemSetId then projection.equippedItems = equipped end
	end

	local skillSetOrder = type(skillsTab.skillSetOrderList) == "table" and skillsTab.skillSetOrderList or nil
	if not skillSetOrder or not skillSetOrder[1] then skillSetOrder = { projection.loadouts.active.skillSetId } end
	for _, skillSetId in ipairs(skillSetOrder) do
		local skillSet = type(skillsTab.skillSets) == "table" and skillsTab.skillSets[skillSetId] or { title = "Default", socketGroupList = skillsTab.socketGroupList }
		if type(skillSet) ~= "table" then return nil, unsupportedProjection("skillsTab.skillSets["..skillSetId.."]", "PoB returned an invalid skill set") end
		local groups, groupsError = projectSocketGroups(skillSet.socketGroupList, tonumber(skillSetId) == projection.loadouts.active.skillSetId and (build.mainSocketGroup or 1) or nil, "skillsTab.skillSets["..skillSetId.."].socketGroupList")
		if not groups then return nil, groupsError end
		local projectedSet = { id = tonumber(skillSetId) or skillSetId, title = stringValue(skillSet.title, "Default"), socketGroups = groups }
		table.insert(projection.loadouts.skillSets, projectedSet)
		if tonumber(skillSetId) == projection.loadouts.active.skillSetId then projection.socketGroups = groups end
	end

	local configTab = type(build.configTab) == "table" and build.configTab or {}
	for _, configSetId in ipairs(configTab.configSetOrderList or {}) do
		local configSet = type(configTab.configSets) == "table" and configTab.configSets[configSetId] or nil
		if type(configSet) == "table" then table.insert(projection.loadouts.configSets, { id = tonumber(configSetId) or configSetId, title = stringValue(configSet.title, "Default") }) end
	end
	if not projection.loadouts.passiveTrees[1] then return nil, unsupportedProjection("treeTab.specList", "PoB returned no passive tree") end
	if not projection.loadouts.itemSets[1] then return nil, unsupportedProjection("itemsTab.itemSetOrderList", "PoB returned no equipment set") end
	if not projection.loadouts.skillSets[1] then return nil, unsupportedProjection("skillsTab.skillSetOrderList", "PoB returned no skill set") end
	return projection
end

function Adapter.new(runtime, startupError)
	return setmetatable({
		runtime = runtime or _G,
		startupError = startupError,
	}, Adapter)
end

function Adapter:currentBuild()
	local resolver = self.runtime.__cnCurrentHeadlessBuild
	if type(resolver) == "function" then
		local ok, build = pcall(resolver)
		if ok and type(build) == "table" then return build end
	end
	return self.runtime.build
end

function Adapter:available()
	if self.startupError then
		return nil, failure(
			"POB_HEADLESS_STARTUP_FAILED",
			"HeadlessWrapper.lua",
			tostring(self.startupError)
		)
	end
	if type(self.runtime.newBuild) ~= "function" then
		return nil, failure("POB_HEADLESS_API_UNAVAILABLE", "newBuild", "HeadlessWrapper.lua did not expose newBuild")
	end
	if type(self.runtime.loadBuildFromXML) ~= "function" then
		return nil, failure("POB_HEADLESS_API_UNAVAILABLE", "loadBuildFromXML", "HeadlessWrapper.lua did not expose loadBuildFromXML")
	end
	local build = self:currentBuild()
	if type(build) ~= "table" then
		return nil, failure("POB_HEADLESS_API_UNAVAILABLE", "build", "HeadlessWrapper.lua did not expose build")
	end
	if type(build.calcsTab) ~= "table" then
		return nil, failure("POB_HEADLESS_API_UNAVAILABLE", "build.calcsTab", "PoB build is missing calcsTab")
	end
	if type(build.calcsTab.BuildOutput) ~= "function" then
		return nil, failure("POB_HEADLESS_API_UNAVAILABLE", "build.calcsTab:BuildOutput", "PoB build cannot calculate output")
	end
	return build
end

function Adapter:status()
	local build, err = self:available()
	if not build then
		return { available = false, error = err.error }
	end
	return { available = true }
end

local function validInteger(value)
	local numeric = tonumber(value)
	if not numeric or numeric % 1 ~= 0 then return nil end
	return numeric
end

local calculationInputKeys = {
	"level",
	"allocNodes",
	"className",
	"socketGroups",
	"mainSocketGroup",
	"calcsSkillGroup",
	"buffMode",
}

local function hasCalculationInputs(request)
	if type(request) ~= "table" then return false end
	for _, key in ipairs(calculationInputKeys) do
		if request[key] ~= nil then return true end
	end
	return false
end

local function craftInputError(path, message)
	return failure("POB_CRAFT_DRAFT_INVALID", path, message)
end

local function itemAssignmentInput(path, message)
	return failure("POB_ITEM_ASSIGNMENT_INVALID", path, message)
end

-- Headless PoB stores modifier definitions in typed namespaces
-- (data.itemMods.Item, .Jewel, .Flask, ...), while a few test/runtime
-- integrations expose a flat table.  Resolve through the official namespace
-- without manufacturing or copying modifier data.
local function officialItemMod(data, modId)
	if type(data) ~= "table" or type(data.itemMods) ~= "table" or type(modId) ~= "string" then return nil end
	local direct = data.itemMods[modId]
	if type(direct) == "table" then return direct end
	local itemMods = data.itemMods.Item
	if type(itemMods) == "table" and type(itemMods[modId]) == "table" then return itemMods[modId] end
	return nil
end

local function officialModHasRollRange(mod)
	if type(mod) ~= "table" then return false end
	for _, line in ipairs(mod) do
		if type(line) == "string" and line:match("%(%s*-?%d+%.?%d*%s*%-%s*-?%d+%.?%d*%s*%)") then
			return true
		end
	end
	return false
end

local function resolveCraftEssence(draft, itemsTab)
	if draft.essence == nil then return nil end
	if type(draft.essence) ~= "table" or type(draft.essence.id) ~= "string" or draft.essence.id == "" then
		return nil, craftInputError("draft.essence", "精华必须来自当前锁定的官方精华列表")
	end
	local build = type(itemsTab) == "table" and itemsTab.build or nil
	local data = type(build) == "table" and build.data or nil
	local base = type(data) == "table" and type(data.itemBases) == "table" and data.itemBases[draft.baseName] or nil
	local essence = type(data) == "table" and type(data.essences) == "table" and data.essences[draft.essence.id] or nil
	if type(base) ~= "table" or type(base.type) ~= "string" then return nil, craftInputError("draft.baseName", "底材无法由当前官方 PoB 版本识别") end
	if type(essence) ~= "table" or type(essence.mods) ~= "table" then return nil, craftInputError("draft.essence.id", "所选精华不在当前锁定的官方版本中") end
	local modId = essence.mods[base.type]
	local mod = officialItemMod(data, modId)
	if type(modId) ~= "string" or type(mod) ~= "table" or (mod.type ~= "Prefix" and mod.type ~= "Suffix") then
		return nil, craftInputError("draft.essence.id", "该精华不能作用于所选官方底材")
	end
	local roll = tonumber(draft.essence.roll)
	if officialModHasRollRange(mod) then
		if not roll or roll < 0 or roll > 1 then return nil, craftInputError("draft.essence.roll", "精华词缀必须提供官方范围位置（0 到 1）") end
	elseif draft.essence.roll ~= nil and (not roll or roll < 0 or roll > 1) then
		return nil, craftInputError("draft.essence.roll", "精华固定值词缀的范围位置必须为空或为 0 到 1")
	end
	return { id = modId, type = mod.type, group = mod.group, roll = roll, essence = true }
end

local function requestedCraftAffixes(draft, kind, essence)
	local wanted = {}
	for _, affix in ipairs(draft[kind] or {}) do table.insert(wanted, affix) end
	local type = kind == "prefixes" and "Prefix" or "Suffix"
	if essence and essence.type == type then table.insert(wanted, essence) end
	return wanted
end

local function markCraftEssence(item, essence)
	if not essence then return true end
	local kind = essence.type == "Prefix" and "prefixes" or essence.type == "Suffix" and "suffixes" or nil
	if not kind then return false end
	for _, affix in ipairs(item[kind] or {}) do
		if type(affix) == "table" and affix.modId == essence.id then
			-- Item:Craft rebuilds the native affix table through ParseRaw, whose
			-- official serialization has no essence-origin field. Restore only the
			-- already-validated structured request marker for this live projection;
			-- it never changes the official modifier ID, range, raw or calculation.
			affix.essence = true
			return true
		end
	end
	return false
end

local function readOnlyCraftState(item)
	if type(item) ~= "table" then return nil end
	for _, key in ipairs({ "fractured", "desecrated", "mutated", "mirrored", "sanctified", "corrupted", "doubleCorrupted", "uniqueID", "clusterJewel" }) do
		local value = item[key]
		if value == true or (key == "uniqueID" and value ~= nil) or (key == "clusterJewel" and type(value) == "table") then return key end
	end
	for _, key in ipairs({ "enchantModLines", "classRequirementModLines" }) do
		if type(item[key]) == "table" and #item[key] > 0 then return key end
	end
	return nil
end

local function nonInheritedCraftStates(item, draft, data)
	if type(item) ~= "table" then return {} end
	local states = {}
	local function requestedNumber(key, source)
		return type(draft) == "table" and draft[key] ~= nil and tonumber(draft[key]) == source
	end
	local function requestedString(key, source)
		return type(draft) == "table" and type(draft[key]) == "string" and draft[key] == source
	end
	local function requestedStringList(key, source)
		if type(draft) ~= "table" or type(draft[key]) ~= "table" or type(source) ~= "table" or #draft[key] ~= #source then return false end
		for index, value in ipairs(source) do
			if draft[key][index] ~= value then return false end
		end
		return true
	end
	-- Duplicate starts with a new Item. Compare the source's projected native
	-- affix records against the structured draft without deriving any values:
	-- an id and its official normalised roll are the complete craft identity.
	local function sameAffixLists(source, requested)
		if #source ~= #requested then return false end
		local matched = {}
		for _, sourceAffix in ipairs(source) do
			local found = false
			for index, requestedAffix in ipairs(requested) do
				if not matched[index] and sourceAffix.id == requestedAffix.id and sourceAffix.roll == requestedAffix.roll then
					matched[index] = true
					found = true
					break
				end
			end
			if not found then return false end
		end
		return true
	end
	local function requestedNormalAffixes(kind)
		local result = {}
		for _, affix in ipairs(type(draft) == "table" and draft[kind] or {}) do
			if type(affix) == "table" and type(affix.id) == "string" and affix.id ~= "" and affix.essence ~= true then
				table.insert(result, { id = affix.id, roll = tonumber(affix.roll) })
			end
		end
		return result
	end
	local function sourceEssence()
		local baseType = type(item.base) == "table" and item.base.type or nil
		if type(baseType) ~= "string" or type(data) ~= "table" or type(data.essences) ~= "table" then return nil end
		-- Item:Craft only keeps the explicit essence marker on the live preview;
		-- after AddItem/ParseRaw, PoB persists the same native modifier ID but not
		-- its UI-origin bit. The official essence-to-base modifier table is the
		-- canonical identity for that durable source record.
		for _, kind in ipairs({ "prefixes", "suffixes" }) do
			for _, affix in ipairs(item[kind] or {}) do
				if type(affix) == "table" and type(affix.modId) == "string" and affix.modId ~= "None" then
					for essenceId, definition in pairs(data.essences) do
						if type(essenceId) == "string" and type(definition) == "table" and type(definition.mods) == "table" and definition.mods[baseType] == affix.modId then
							return { id = essenceId, modId = affix.modId, kind = kind, roll = tonumber(affix.range) }
						end
					end
				end
			end
		end
		return nil
	end
	local essence = sourceEssence()
	local function sourceNormalAffixes(kind)
		local result = {}
		for _, affix in ipairs(item[kind] or {}) do
			if type(affix) == "table" and type(affix.modId) == "string" and affix.modId ~= "None"
				and not (essence and essence.kind == kind and essence.modId == affix.modId) then
				table.insert(result, { id = affix.modId, roll = tonumber(affix.range) })
			end
		end
		return result
	end
	for _, comparison in ipairs({ { kind = "prefixes", state = "Prefix" }, { kind = "suffixes", state = "Suffix" } }) do
		local source = sourceNormalAffixes(comparison.kind)
		if #source > 0 and not sameAffixLists(source, requestedNormalAffixes(comparison.kind)) then
			table.insert(states, comparison.state)
		end
	end
	if essence and not sameAffixLists({ essence }, type(draft) == "table" and type(draft.essence) == "table" and { { id = draft.essence.id, roll = tonumber(draft.essence.roll) } } or {}) then
		table.insert(states, "Essence")
	end
	for _, key in ipairs({ "fractured", "desecrated", "mutated", "mirrored", "sanctified", "corrupted", "doubleCorrupted", "uniqueID", "clusterJewel", "enchantModLines", "classRequirementModLines" }) do
		local value = item[key]
		local present = value == true or (key == "uniqueID" and value ~= nil) or (key == "clusterJewel" and type(value) == "table") or ((key == "enchantModLines" or key == "classRequirementModLines") and type(value) == "table" and #value > 0)
		-- Corruption is the one read-only flag that the structured duplicate
		-- draft can explicitly request.  Do not report it as "not inherited"
		-- when the caller actually opted into preserving it; double corruption
		-- remains non-inheritable because the draft has no such field.
		local explicitlyPreserved = key == "corrupted" and type(draft) == "table" and draft.corrupted == true
		if present and not explicitlyPreserved then table.insert(states, key) end
	end
	-- Catalysts are writable structured fields rather than immutable PoB flags,
	-- but duplicate starts from a fresh item.  Report a source catalyst (and
	-- its quality) whenever the caller omitted it or requested a different
	-- value, so an empty duplicate draft cannot silently discard the modifier.
	local sourceCatalyst = tonumber(item.catalyst)
	local sourceCatalystQuality = tonumber(item.catalystQuality)
	local draftCatalyst = type(draft) == "table" and draft.catalyst or nil
	local draftCatalystQuality = type(draft) == "table" and draft.catalystQuality or nil
	local catalystPresent = sourceCatalyst and sourceCatalyst > 0
	local catalystPreserved = draftCatalyst ~= nil and tonumber(draftCatalyst) == sourceCatalyst
	local catalystQualityPresent = sourceCatalystQuality and sourceCatalystQuality > 0
	local catalystQualityPreserved = draftCatalystQuality ~= nil and tonumber(draftCatalystQuality) == sourceCatalystQuality
	if catalystPresent and not catalystPreserved then table.insert(states, "catalyst") end
	if catalystQualityPresent and (not catalystPreserved or not catalystQualityPreserved) then
		table.insert(states, "catalystQuality")
	end
	-- These are all public projection fields that a fresh duplicate can replace
	-- with a base default. A duplicate must therefore disclose each source value
	-- unless the caller sent the same structured value explicitly.
	local sourceQuality = tonumber(item.quality)
	if sourceQuality ~= nil and not requestedNumber("quality", sourceQuality) then table.insert(states, "quality") end
	local sourceVariant = tonumber(item.variant)
	if sourceVariant ~= nil and not requestedNumber("variant", sourceVariant) then table.insert(states, "variant") end
	local sourceSocketCount = validInteger(item.itemSocketCount)
	if sourceSocketCount == nil and type(item.sockets) == "table" then sourceSocketCount = #item.sockets end
	if sourceSocketCount ~= nil and not requestedNumber("socketCount", sourceSocketCount) then table.insert(states, "socketCount") end
	if type(item.runes) == "table" and #item.runes > 0 and not requestedStringList("runes", item.runes) then table.insert(states, "runes") end
	if type(item.jewelRadiusLabel) == "string" and item.jewelRadiusLabel ~= "" and not requestedString("jewelRadiusLabel", item.jewelRadiusLabel) then
		table.insert(states, "jewelRadiusLabel")
	end
	if type(item.title) == "string" and item.title:match("%S") and not requestedString("title", item.title) then table.insert(states, "title") end
	table.sort(states)
	return states
end

local function officialAffixSlotsFor(item, kind)
	local list = type(item) == "table" and item[kind] or nil
	if type(list) == "table" and validInteger(list.limit) then return list.limit end
	local total = type(item) == "table" and validInteger(item.affixLimit) or nil
	if total and total % 2 == 0 then return total / 2 end
	return nil
end

local function validateCraftDraftFields(draft, essence)
	if type(draft) ~= "table" then return nil, craftInputError("draft", "制作草案不能为空") end
	for _, forbidden in ipairs({ "raw", "rawText", "rawLines", "sockets", "itemSocketCount" }) do
		if draft[forbidden] ~= nil then
			return nil, craftInputError("draft."..forbidden, "制作草案不能指定物品原始文本或内部孔位数据")
		end
	end
	if type(draft.baseName) ~= "string" or draft.baseName == "" then
		return nil, craftInputError("draft.baseName", "必须选择官方装备底材")
	end
	if draft.prefixes ~= nil and type(draft.prefixes) ~= "table" then return nil, craftInputError("draft.prefixes", "前缀必须是官方词缀列表") end
	if draft.suffixes ~= nil and type(draft.suffixes) ~= "table" then return nil, craftInputError("draft.suffixes", "后缀必须是官方词缀列表") end
	if draft.rarity ~= "NORMAL" and draft.rarity ~= "MAGIC" and draft.rarity ~= "RARE" then
		return nil, craftInputError("draft.rarity", "制作稀有度必须是普通、魔法或稀有")
	end
	local itemLevel = validInteger(draft.itemLevel)
	if not itemLevel or itemLevel < 1 or itemLevel > 100 then
		return nil, craftInputError("draft.itemLevel", "物品等级必须是 1 至 100 的整数")
	end
	local quality = draft.quality == nil and 0 or tonumber(draft.quality)
	-- The actual quality capability/range is base-specific and is checked
	-- after resolving the official base below.  Here we only validate shape.
	if not quality or quality % 1 ~= 0 or quality < 0 then
		return nil, craftInputError("draft.quality", "品质必须是非负整数")
	end
	local socketCount = draft.socketCount
	if socketCount ~= nil then
		socketCount = validInteger(socketCount)
		if not socketCount or socketCount < 0 or socketCount > 6 then return nil, craftInputError("draft.socketCount", "符文孔数必须是 0 至 6 的整数") end
	end
	if draft.jewelRadiusLabel ~= nil and (type(draft.jewelRadiusLabel) ~= "string" or not draft.jewelRadiusLabel:match("%S")) then
		return nil, craftInputError("draft.jewelRadiusLabel", "珠宝范围必须是当前官方范围标签")
	end
	if draft.implicitRanges ~= nil and type(draft.implicitRanges) ~= "table" then
		return nil, craftInputError("draft.implicitRanges", "隐性词条范围必须是官方范围位置列表")
	end
	if type(draft.implicitRanges) == "table" then
		local seenImplicitRanges = {}
		for index, range in ipairs(draft.implicitRanges) do
			if type(range) ~= "table" or not validInteger(range.index) or range.index <= 0 then
				return nil, craftInputError("draft.implicitRanges["..index.."].index", "隐性词条范围索引必须是正整数")
			end
			if seenImplicitRanges[range.index] then
				return nil, craftInputError("draft.implicitRanges["..index.."].index", "不能重复指定同一隐性词条范围")
			end
			seenImplicitRanges[range.index] = true
			local roll = tonumber(range.roll)
			if not roll or roll < 0 or roll > 1 then
				return nil, craftInputError("draft.implicitRanges["..index.."].roll", "隐性词条范围位置必须是 0 到 1")
			end
		end
	end
	for _, kind in ipairs({ "prefixes", "suffixes" }) do
		local affixes = draft[kind]
		if affixes == nil then affixes = {} end
		local wanted = requestedCraftAffixes(draft, kind, essence)
		if type(affixes) ~= "table" or #affixes > 6 or #wanted > 6 then
			return nil, craftInputError("draft."..kind, "前缀或后缀数量不能超过 6")
		end
		if draft.rarity == "NORMAL" and #wanted > 0 then
			return nil, craftInputError("draft."..kind, "普通物品不能包含制作词缀")
		end
		if draft.rarity == "NORMAL" and essence then
			return nil, craftInputError("draft.essence", "普通物品不能包含精华词缀")
		end
		local seen = {}
		for index, affix in ipairs(wanted) do
			if type(affix) ~= "table" or type(affix.id) ~= "string" or affix.id == "" then
				return nil, craftInputError("draft."..kind.."["..index.."]", "词缀必须来自官方词缀库")
			end
			if seen[affix.id] then return nil, craftInputError("draft."..kind.."["..index.."]", "不能重复选择同一词缀") end
			seen[affix.id] = true
			-- Fixed-value official modifiers have no range and may omit roll.
			-- Variable modifiers are checked against their official line after the
			-- base/modifier has been resolved in createStrictCraftItem.
			if affix.roll ~= nil then
				local roll = tonumber(affix.roll)
				if not roll or roll < 0 or roll > 1 then
					return nil, craftInputError("draft."..kind.."["..index.."].roll", "词缀范围位置必须是 0 到 1")
				end
			end
		end
	end
	return true, itemLevel, socketCount
end

function Adapter:getOfficialRuneCapabilities(itemsTab, item)
	if type(itemsTab) ~= "table" or type(itemsTab.GetValidRunesForItem) ~= "function" then
		return nil, failure("POB_HEADLESS_API_UNAVAILABLE", "itemsTab:GetValidRunesForItem", "PoB 未暴露官方符文校验接口")
	end
	local valid, validRunes = pcall(itemsTab.GetValidRunesForItem, itemsTab, item)
	if not valid or type(validRunes) ~= "table" then
		return nil, failure("POB_RUNE_VALIDATION_FAILED", "itemsTab:GetValidRunesForItem", valid and "PoB 未返回符文列表" or tostring(validRunes))
	end
	local socketCount = validInteger(item.itemSocketCount) or 0
	local capabilities = { socketCount = math.max(0, socketCount), allowed = {}, allowedByName = {} }
	if socketCount <= 0 then return capabilities end
	for _, rune in ipairs(validRunes) do
		if type(rune) == "table" and type(rune.name) == "string" then
			local bound = false
			if type(itemsTab.IsSocketBoundRune) == "function" then
				local checked, boundOrError = pcall(itemsTab.IsSocketBoundRune, itemsTab, item, rune.name, validRunes)
				if not checked then return nil, failure("POB_RUNE_VALIDATION_FAILED", "itemsTab:IsSocketBoundRune", tostring(boundOrError)) end
				bound = boundOrError == true
			end
			if not bound then
				capabilities.allowedByName[rune.name] = true
				table.insert(capabilities.allowed, rune.name)
			end
		end
	end
	return capabilities
end

function Adapter:applyStrictCraftRunes(itemsTab, item, draft)
	local capabilities, capabilitiesError = self:getOfficialRuneCapabilities(itemsTab, item)
	if not capabilities then return nil, capabilitiesError end
	if draft.runes == nil then return capabilities end
	if type(draft.runes) ~= "table" then return nil, craftInputError("draft.runes", "符文必须是官方符文名称列表") end
	if capabilities.socketCount <= 0 then return nil, craftInputError("draft.runes", "该官方底材没有可用符文孔") end
	if #draft.runes ~= capabilities.socketCount then return nil, craftInputError("draft.runes", "符文数量必须与官方底材已有孔数完全一致") end
	local requested = {}
	for index, name in ipairs(draft.runes) do
		if type(name) ~= "string" or not capabilities.allowedByName[name] then
			return nil, craftInputError("draft.runes["..index.."]", "符文不适用于该官方底材")
		end
		requested[index] = name
	end
	if type(item.UpdateRunes) ~= "function" or type(item.BuildAndParseRaw) ~= "function" then
		return nil, failure("POB_HEADLESS_API_UNAVAILABLE", "Item:UpdateRunes/BuildAndParseRaw", "PoB 未暴露官方符文重建接口")
	end
	item.runes = requested
	local updated, updateError = pcall(item.UpdateRunes, item)
	if not updated then return nil, failure("POB_CRAFT_RUNE_BUILD_FAILED", "Item:UpdateRunes", tostring(updateError)) end
	local rebuilt, rebuildError = pcall(item.BuildAndParseRaw, item)
	if not rebuilt then return nil, failure("POB_CRAFT_RUNE_BUILD_FAILED", "Item:BuildAndParseRaw", tostring(rebuildError)) end
	if item.itemSocketCount ~= capabilities.socketCount then
		return nil, failure("POB_CRAFT_RUNE_BUILD_FAILED", "Item:BuildAndParseRaw", "官方 PoB 未保留底材原有孔数")
	end
	for index, name in ipairs(requested) do
		if item.runes[index] ~= name then
			return nil, failure("POB_CRAFT_RUNE_BUILD_FAILED", "Item:BuildAndParseRaw", "官方 PoB 未保留请求的符文")
		end
	end
	return capabilities
end

function Adapter:createStrictCraftItem(draft, itemsTab)
	local essence, essenceError = resolveCraftEssence(draft, itemsTab)
	if essenceError then return nil, essenceError end
	local validDraft, itemLevel, requestedSocketCount = validateCraftDraftFields(draft, essence)
	if not validDraft then return nil, itemLevel end
	local quality = draft.quality == nil and 0 or tonumber(draft.quality)
	if type(itemsTab) ~= "table" or type(itemsTab.build) ~= "table" or type(itemsTab.build.data) ~= "table" then
		return nil, failure("POB_HEADLESS_API_UNAVAILABLE", "itemsTab.build.data", "PoB 未暴露官方物品底材目录")
	end
	local baseEntry = nil
	local indexedBase = itemsTab.build.data.itemBases and itemsTab.build.data.itemBases[draft.baseName]
	if type(indexedBase) == "table" then
		baseEntry = { name = draft.baseName, base = indexedBase }
	end
	for _, list in pairs(itemsTab.build.data.itemBaseLists or {}) do
		if baseEntry then break end
		for _, candidate in ipairs(list or {}) do
			if type(candidate) == "table" and candidate.name == draft.baseName then
				baseEntry = candidate
				break
			end
		end
		if baseEntry then break end
	end
	if not baseEntry or type(baseEntry.base) ~= "table" then
		return nil, craftInputError("draft.baseName", "底材无法由当前官方 PoB 版本识别")
	end
	local base = baseEntry.base
	local jewelRadiusLabel = draft.jewelRadiusLabel
	if jewelRadiusLabel ~= nil then
		if base.type ~= "Jewel" or base.subType ~= "Radius" then
			return nil, craftInputError("draft.jewelRadiusLabel", "该官方底材不支持珠宝范围")
		end
		local validRadius = false
		for _, radius in ipairs(type(itemsTab.build.data.jewelRadius) == "table" and itemsTab.build.data.jewelRadius or {}) do
			if type(radius) == "table" and radius.label == jewelRadiusLabel then validRadius = true break end
		end
		if not validRadius then return nil, craftInputError("draft.jewelRadiusLabel", "珠宝范围必须来自当前官方范围列表") end
	end
	local qualityLimit = validInteger(base.quality) or 0
	if quality > qualityLimit then
		return nil, craftInputError("draft.quality", "该官方底材的品质上限为 " .. tostring(qualityLimit))
	end
	if qualityLimit == 0 and quality ~= 0 then
		return nil, craftInputError("draft.quality", "该官方底材不支持品质")
	end
	-- Catalysts are official item state, not a free-form client decoration.
	-- The ID list is checked against the canonical Item implementation after the
	-- item has been created below; this early pass only validates the request
	-- shape and base eligibility.
	local catalyst = draft.catalyst
	if catalyst ~= nil then
		catalyst = validInteger(catalyst)
		if catalyst == nil or catalyst < 0 then return nil, craftInputError("draft.catalyst", "催化剂必须是当前官方物品模型中的有效编号") end
		if catalyst > 0 and base.type ~= "Ring" and base.type ~= "Amulet" then
			return nil, craftInputError("draft.catalyst", "只有官方戒指或护身符底材可以使用催化剂")
		end
	end
	local catalystQuality = draft.catalystQuality
	if catalystQuality ~= nil then
		catalystQuality = validInteger(catalystQuality)
		local maxCatalystQuality = baseEntry.name and baseEntry.name:find("Breach Ring", 1, true) and 50 or 20
		if catalystQuality == nil or catalystQuality < 0 or catalystQuality > maxCatalystQuality then
			return nil, craftInputError("draft.catalystQuality", "催化剂品质超出当前官方底材允许范围")
		end
		if catalystQuality > 0 and (not catalyst or catalyst == 0) then
			return nil, craftInputError("draft.catalystQuality", "设置催化剂品质前必须选择官方催化剂")
		end
	end
	local rarity = draft.rarity
	-- Match ItemsTab:CraftItem's official rarity coercions for bases which
	-- cannot be rare (flasks, charms and transcendent limbs).
	if base.flask or (base.type == "Jewel" and base.subType == "Charm") or base.type == "Charm" then
		if rarity == "RARE" then rarity = "MAGIC" end
	elseif base.type == "Transcendent Limb" then
		rarity = "NORMAL"
	end
	if type(self.runtime.new) ~= "function" then
		return nil, failure("POB_HEADLESS_API_UNAVAILABLE", "new(Item)", "PoB 未暴露官方物品解析器")
	end
	local ok, item = pcall(self.runtime.new, "Item")
	if not ok or type(item) ~= "table" then
		return nil, failure("POB_CRAFT_CREATE_FAILED", "new(Item)", ok and "官方 PoB 未返回空白物品" or tostring(item))
	end
	-- This is the same initialization performed by ItemsTab:CraftItem.
	item.name = baseEntry.name
	item.base = base
	item.baseName = baseEntry.name
	item.charmLimit = baseEntry.charmLimit
	item.spiritValue = baseEntry.spiritValue
	item.buffModLines = {}
	item.enchantModLines = {}
	item.runeModLines = {}
	item.classRequirementModLines = {}
	item.implicitModLines = {}
	item.explicitModLines = {}
	item.sockets = {}
	item.runes = {}
	if base.quality then item.quality = 0 end
	if base.socketLimit and (base.weapon or base.armour or (base.tags and (base.tags.wand or base.tags.staff or base.tags.sceptre))) then
		for _ = 1, base.socketLimit do table.insert(item.sockets, { group = 0 }) end
		item.itemSocketCount = #item.sockets
	end
	if rarity ~= "NORMAL" then item.crafted = true end
	item.rarity = rarity
	item.itemLevel = itemLevel
	if rarity == "RARE" then item.title = (type(draft.title) == "string" and draft.title:match("%S")) and draft.title or "New Item" end
	if base.implicit then
		if type(modLib) ~= "table" or type(modLib.parseMod) ~= "function" then
			return nil, failure("POB_HEADLESS_API_UNAVAILABLE", "modLib:parseMod", "PoB 未暴露官方隐式词条解析器")
		end
		local implicitIndex = 1
		for line in base.implicit:gmatch("[^\n]+") do
			local modList, extra = modLib.parseMod(line)
			table.insert(item.implicitModLines, { line = line, extra = extra, modList = modList or {}, modTags = base.implicitModTypes and base.implicitModTypes[implicitIndex] or {} })
			implicitIndex = implicitIndex + 1
		end
	end
	if base.variantList then
		if type(copyTable) ~= "function" then return nil, failure("POB_HEADLESS_API_UNAVAILABLE", "copyTable", "PoB 未暴露官方变体复制函数") end
		item.variantList = copyTable(base.variantList, true)
		item.variant = 1
		item.baseLines = {}
	end
	if base.type == "Jewel" and base.subType == "Radius" then item.jewelRadiusLabel = jewelRadiusLabel or "Small" end
	if draft.corrupted and (base.flask or base.type == "Flask" or base.type == "Charm" or base.type == "Transcendent Limb" or (base.type == "Jewel" and base.subType == "Charm")) then
		return nil, craftInputError("draft.corrupted", "该官方底材不能腐化")
	end
	if rarity == "NORMAL" and (essence or #(draft.prefixes or {}) > 0 or #(draft.suffixes or {}) > 0) then
		return nil, craftInputError("draft.rarity", "普通物品不能包含制作词缀")
	end
	if draft.quality ~= nil then item.quality = tonumber(draft.quality) end
	if draft.variant ~= nil then
		item.variant = validInteger(draft.variant)
		if not item.variant then return nil, craftInputError("draft.variant", "底材变体必须是官方变体编号") end
		if type(item.variantList) ~= "table" or type(item.variantList[item.variant]) ~= "string" then
			return nil, craftInputError("draft.variant", "底材变体必须来自当前官方变体列表")
		end
		if type(item.BuildAndParseRaw) ~= "function" then
			return nil, failure("POB_HEADLESS_API_UNAVAILABLE", "Item:BuildAndParseRaw", "PoB 未暴露官方底材变体重建接口")
		end
		local rebuilt, rebuildError = pcall(item.BuildAndParseRaw, item)
		if not rebuilt then return nil, failure("POB_CRAFT_VARIANT_BUILD_FAILED", "Item:BuildAndParseRaw", tostring(rebuildError)) end
	end
	if draft.catalyst ~= nil then item.catalyst = catalyst end
	if draft.catalystQuality ~= nil then item.catalystQuality = catalystQuality end
	if catalyst and catalyst > 0 then
		local catalystList = officialCatalystList(item)
		if type(catalystList) ~= "table" or type(catalystList[catalyst]) ~= "string" then
			return nil, failure("POB_CATALYST_METADATA_UNAVAILABLE", "Item.catalystList", "官方 PoB 未暴露有效催化剂列表")
		end
	end
	if draft.corrupted == true then item.corrupted = true end
	if type(item.NormaliseQuality) ~= "function" or type(item.BuildAndParseRaw) ~= "function" or type(item.Craft) ~= "function" then
		return nil, failure("POB_HEADLESS_API_UNAVAILABLE", "Item:NormaliseQuality/BuildAndParseRaw/Craft", "PoB 未暴露官方制作物品接口")
	end
	item:NormaliseQuality()
	local initialBuild, initialError = pcall(item.BuildAndParseRaw, item)
	if not initialBuild then return nil, failure("POB_CRAFT_BUILD_FAILED", "Item:BuildAndParseRaw", tostring(initialError)) end
	if draft.implicitRanges ~= nil then
		for rangeIndex, range in ipairs(draft.implicitRanges) do
			local implicit = item.implicitModLines[range.index]
			if type(implicit) ~= "table" or type(implicit.range) ~= "number" then
				return nil, craftInputError("draft.implicitRanges["..rangeIndex.."].index", "隐性词条范围索引不属于当前官方底材")
			end
			implicit.range = tonumber(range.roll)
		end
		local rebuiltImplicit, implicitBuildError = pcall(item.BuildAndParseRaw, item)
		if not rebuiltImplicit then return nil, failure("POB_CRAFT_IMPLICIT_BUILD_FAILED", "Item:BuildAndParseRaw", tostring(implicitBuildError)) end
	end
	-- Match ItemsTab's catalyst control visibility: a catalyst is writable only
	-- on crafted jewellery (or an official item carrying catalyst mod tags).
	-- The options endpoint already reports this capability; enforce it again at
	-- the creator boundary so a direct API request cannot smuggle Catalyst lines
	-- onto a normal ring/amulet that the native editor would leave read-only.
	if catalyst and catalyst > 0 and not (item.crafted == true or item.hasModTags == true) then
		return nil, craftInputError("draft.catalyst", "当前官方物品状态不允许设置催化剂")
	end
	if requestedSocketCount ~= nil then
		local socketLimit = validInteger(item.base.socketLimit) or 0
		if requestedSocketCount > socketLimit then return nil, craftInputError("draft.socketCount", "所选孔数超过该官方底材允许的上限") end
		if requestedSocketCount ~= validInteger(item.itemSocketCount) then
			item.sockets = {}
			if requestedSocketCount > 0 then
				for _ = 1, requestedSocketCount do table.insert(item.sockets, { group = 0 }) end
			end
			item.itemSocketCount = requestedSocketCount
			-- Keep the canonical parsed/raw state in sync with the requested
			-- socket count.  Without this rebuild preview.raw still advertised the
			-- base default sockets while the structured projection reported the
			-- override, creating a split-brain craft result.
			local rebuiltSockets, socketBuildError = pcall(item.BuildAndParseRaw, item)
			if not rebuiltSockets then return nil, failure("POB_CRAFT_SOCKET_BUILD_FAILED", "Item:BuildAndParseRaw", tostring(socketBuildError)) end
		end
	end
	local groups = {}
	for _, kind in ipairs({ "prefixes", "suffixes" }) do
		local wanted = requestedCraftAffixes(draft, kind, essence)
		local maxAffixSlots = officialAffixSlotsFor(item, kind)
		if not maxAffixSlots then
			return nil, failure("POB_CRAFT_AFFIX_LIMIT_UNAVAILABLE", "Item:BuildAndParseRaw", "官方 PoB 未返回该底材的词缀容量")
		end
		if #wanted > maxAffixSlots then
			return nil, craftInputError("draft."..kind, "该官方底材的"..(kind == "prefixes" and "前缀" or "后缀").."数量不能超过 "..maxAffixSlots)
		end
		-- Official crafted rares retain their own per-type slot count and fill
		-- unused slots with the sentinel mod ID "None".
		for index, wantedAffix in ipairs(wanted) do
			local mod = item.affixes and item.affixes[wantedAffix.id]
			if type(mod) ~= "table" then
				return nil, craftInputError("draft."..kind.."["..index.."]", "词缀不属于该底材")
			end
			if mod.type ~= (kind == "prefixes" and "Prefix" or "Suffix") then
				return nil, craftInputError("draft."..kind.."["..index.."]", "词缀类型与前后缀栏位不匹配")
			end
			local roll = tonumber(wantedAffix.roll)
			if officialModHasRollRange(mod) then
				if not roll or roll < 0 or roll > 1 then
					return nil, craftInputError("draft."..kind.."["..index.."].roll", "可变词缀必须提供官方范围位置（0 到 1）")
				end
			else
				-- A fixed-value modifier has no normalized range. Ignore an optional
				-- transport value rather than inventing one for the official Item.
				roll = nil
			end
			if not wantedAffix.essence and tonumber(mod.level) and tonumber(mod.level) > itemLevel then
				return nil, craftInputError("draft."..kind.."["..index.."]", "物品等级不足以制作该词缀")
			end
			if not wantedAffix.essence and type(item.GetModSpawnWeight) == "function" and item:GetModSpawnWeight(mod) <= 0 then
				return nil, craftInputError("draft."..kind.."["..index.."]", "该词缀不能出现在此底材上")
			end
			local group = mod.group
			if group and groups[group] then return nil, craftInputError("draft."..kind.."["..index.."]", "不能选择同词缀组的两个词缀") end
			if group then groups[group] = true end
		end
		for index, wantedAffix in ipairs(wanted) do
			local mod = item.affixes and item.affixes[wantedAffix.id]
			local range = officialModHasRollRange(mod) and tonumber(wantedAffix.roll) or nil
			item[kind][index] = { modId = wantedAffix.id, range = range, essence = wantedAffix.essence == true }
		end
		for index = #wanted + 1, maxAffixSlots do item[kind][index] = { modId = "None" } end
	end
	local crafted, craftError = pcall(item.Craft, item)
	if not crafted then return nil, failure("POB_CRAFT_BUILD_FAILED", "Item:Craft", tostring(craftError)) end
	local capabilities, runeError = self:applyStrictCraftRunes(itemsTab, item, draft)
	if not capabilities then return nil, runeError end
	if not markCraftEssence(item, essence) then
		return nil, failure("POB_CRAFT_ESSENCE_BUILD_FAILED", "Item:Craft", "官方 PoB 未保留所选精华词缀")
	end
	return item, nil, capabilities
end

function Adapter:validateCraftDraft(draft, itemsTab)
	if type(draft) == "table" and (draft.kind == "rawItem" or type(draft.raw) == "string") then
		return nil, craftInputError("draft", "制作只能提交由官方规则接口校验的结构化草稿")
	end
	return self:createStrictCraftItem(draft, itemsTab)
end

local function projectCraftOptionMod(modId, mod)
	local lines = {}
	local rangeMin, rangeMax, rangeStep
	for _, line in ipairs(type(mod) == "table" and mod or {}) do
		if type(line) == "string" then
			table.insert(lines, line)
			-- Official definitions expose display ranges in the line text. Keep
			-- this metadata separate so the web layer never parses display text.
			for lowerText, upperText in line:gmatch("%(%s*(-?%d+%.?%d*)%s*%-%s*(-?%d+%.?%d*)%s*%)") do
				local lower, upper = tonumber(lowerText), tonumber(upperText)
				if lower and upper and upper > lower then
					local precision = math.max(#(lowerText:match("%.(%d+)") or ""), #(upperText:match("%.(%d+)") or ""))
					local valueStep = 10 ^ (-precision)
					local normalisedStep = valueStep / (upper - lower)
					if normalisedStep > 1 then normalisedStep = 1 end
					if not rangeMin then rangeMin, rangeMax = lower, upper end
					if not rangeStep or normalisedStep < rangeStep then rangeStep = normalisedStep end
				end
			end
		end
	end
	return {
		id = modId,
		type = type(mod) == "table" and mod.type or nil,
		group = type(mod) == "table" and mod.group or nil,
		requiredItemLevel = type(mod) == "table" and (tonumber(mod.level) or 1) or 1,
		lines = lines,
		range = rangeMin and { min = rangeMin, max = rangeMax, step = rangeStep } or nil,
	}
end

function Adapter:craftOptions(request)
	local build, unavailable = self:available()
	if not build then unavailable.action = "craftOptions"; return unavailable end
	if type(request) ~= "table" then return craftInputError("request", "制作选项请求不能为空") end
	if type(request.baseName) ~= "string" or request.baseName == "" then return craftInputError("baseName", "必须选择官方装备底材") end
	-- `execute` routes this method with the transport action "craftOptions";
	-- never mistake that endpoint name for the requested craft operation.  The
	-- bridge may send the operation as actionMode (preferred) or operation for
	-- compatibility, while an omitted operation is a normal create/options
	-- request.
	local actionMode = request.actionMode or request.operation
	if not actionMode and request.action and request.action ~= "craftOptions" then
		actionMode = request.action
	end
	if not actionMode then
		local sourceId = validInteger(request.sourceItemId)
		if not sourceId then
			actionMode = "create"
		elseif type(build.itemsTab) ~= "table" or type(build.itemsTab.items) ~= "table" or type(build.itemsTab.items[sourceId]) ~= "table" then
			return craftInputError("sourceItemId", "编辑或复制官方物品必须指定当前官方物品库中的物品 ID")
		else
			local sourceItem = build.itemsTab.items[sourceId]
			actionMode = sourceItem.rarity == "RARE" and not readOnlyCraftState(sourceItem) and "edit" or "duplicate"
		end
	end
	if actionMode ~= "create" and actionMode ~= "edit" and actionMode ~= "duplicate" then
		return craftInputError("action", "必须明确指定 create、edit 或 duplicate 操作")
	end
	local sourceItem = nil
	if actionMode ~= "create" then
		local sourceId = validInteger(request.sourceItemId)
		if not sourceId or type(build.itemsTab) ~= "table" or type(build.itemsTab.items) ~= "table" or type(build.itemsTab.items[sourceId]) ~= "table" then
			return craftInputError("sourceItemId", "编辑或复制官方物品必须指定当前官方物品库中的物品 ID")
		end
		sourceItem = build.itemsTab.items[sourceId]
		if actionMode == "edit" then
			local readOnlyState = readOnlyCraftState(sourceItem)
			if sourceItem.rarity ~= "RARE" or readOnlyState then
				return craftInputError("sourceItemId", "该官方物品包含不可由制作草案表达的只读状态（"..tostring(readOnlyState or "rarity").."），必须使用 duplicate 创建副本")
			end
		end
	end
	if request.rarity ~= "NORMAL" and request.rarity ~= "MAGIC" and request.rarity ~= "RARE" then
		return craftInputError("rarity", "制作稀有度必须是普通、魔法或稀有")
	end
	local itemLevel = validInteger(request.itemLevel)
	if not itemLevel or itemLevel < 1 or itemLevel > 100 then return craftInputError("itemLevel", "物品等级必须是 1 至 100 的整数") end
	local selection = type(request.draft) == "table" and request.draft or {}
	if actionMode == "edit" then
		local sourceId = validInteger(request.sourceItemId)
		local sourceItem = sourceId and build.itemsTab.items[sourceId] or nil
		if type(sourceItem) == "table" then
			local inherited = {}
			for key, value in pairs(selection) do inherited[key] = value end
			if inherited.quality == nil then inherited.quality = sourceItem.quality end
			if inherited.catalyst == nil then inherited.catalyst = sourceItem.catalyst end
			if inherited.catalystQuality == nil then inherited.catalystQuality = sourceItem.catalystQuality end
			if inherited.catalyst == 0 and inherited.catalystQuality == nil then inherited.catalystQuality = 0 end
			if inherited.title == nil then inherited.title = sourceItem.title end
			if inherited.variant == nil then inherited.variant = sourceItem.variant end
			if inherited.jewelRadiusLabel == nil then inherited.jewelRadiusLabel = sourceItem.jewelRadiusLabel end
			if inherited.socketCount == nil then inherited.socketCount = sourceItem.itemSocketCount end
			if inherited.implicitRanges == nil then inherited.implicitRanges = officialImplicitRanges(sourceItem) end
			-- Empty rune arrays on non-martial items are an internal parser detail;
			-- passing them as an explicit draft makes applyStrictCraftRunes reject
			-- the edit (it interprets any table as a request that must match socket
			-- count). Inherit rune state only when the source has real sockets.
			if inherited.runes == nil and (tonumber(sourceItem.itemSocketCount) or 0) > 0 and type(sourceItem.runes) == "table" then
				inherited.runes = {}
				for index, rune in ipairs(sourceItem.runes) do inherited.runes[index] = rune end
			end
			selection = inherited
		end
	end
	local item, itemError, runeCapabilities = self:validateCraftDraft({
		baseName = request.baseName,
		rarity = request.rarity,
		itemLevel = itemLevel,
		quality = selection.quality,
		catalyst = selection.catalyst,
		catalystQuality = selection.catalystQuality,
		corrupted = request.corrupted == true,
		title = selection.title,
		prefixes = selection.prefixes or {},
		suffixes = selection.suffixes or {},
		essence = selection.essence,
		variant = selection.variant,
		jewelRadiusLabel = selection.jewelRadiusLabel,
		socketCount = selection.socketCount,
		runes = selection.runes,
		implicitRanges = selection.implicitRanges,
	}, build.itemsTab)
	if not item then return itemError end
	local affixLimits = {
		prefixes = officialAffixSlotsFor(item, "prefixes") or 0,
		suffixes = officialAffixSlotsFor(item, "suffixes") or 0,
	}
	local prefixes, suffixes, selectedPrefixes, selectedSuffixes, selectedIds, blockedGroups, tierOptions = {}, {}, {}, {}, {}, {}, {}
	for _, kind in ipairs({ "prefixes", "suffixes" }) do
		for _, affix in ipairs(item[kind] or {}) do
			if type(affix) == "table" and type(affix.modId) == "string" and affix.modId ~= "None" then
				selectedIds[affix.modId] = true
				local mod = type(item.affixes) == "table" and item.affixes[affix.modId] or nil
				if type(mod) == "table" then
					if type(mod.group) == "string" then blockedGroups[mod.group] = true end
					if kind == "prefixes" then table.insert(selectedPrefixes, projectCraftOptionMod(affix.modId, mod)) else table.insert(selectedSuffixes, projectCraftOptionMod(affix.modId, mod)) end
				end
			end
		end
	end
	for _, selected in ipairs(selectedPrefixes) do
		local tiers = {}
		for modId, mod in pairs(item.affixes or {}) do
			if type(modId) == "string" and type(mod) == "table" and mod.type == "Prefix" and mod.group == selected.group
				and (tonumber(mod.level) or 1) <= itemLevel and type(item.GetModSpawnWeight) == "function" and item:GetModSpawnWeight(mod) > 0 then
				table.insert(tiers, projectCraftOptionMod(modId, mod))
			end
		end
		table.sort(tiers, function(a, b) return a.requiredItemLevel > b.requiredItemLevel end)
		for index, tier in ipairs(tiers) do tier.tier = index end
		tierOptions[selected.id] = tiers
	end
	for _, selected in ipairs(selectedSuffixes) do
		local tiers = {}
		for modId, mod in pairs(item.affixes or {}) do
			if type(modId) == "string" and type(mod) == "table" and mod.type == "Suffix" and mod.group == selected.group
				and (tonumber(mod.level) or 1) <= itemLevel and type(item.GetModSpawnWeight) == "function" and item:GetModSpawnWeight(mod) > 0 then
				table.insert(tiers, projectCraftOptionMod(modId, mod))
			end
		end
		table.sort(tiers, function(a, b) return a.requiredItemLevel > b.requiredItemLevel end)
		for index, tier in ipairs(tiers) do tier.tier = index end
		tierOptions[selected.id] = tiers
	end
	if request.rarity ~= "NORMAL" then
		for modId, mod in pairs(item.affixes or {}) do
			if type(modId) == "string" and type(mod) == "table" and (mod.type == "Prefix" or mod.type == "Suffix")
				and not selectedIds[modId] and not blockedGroups[mod.group] and (tonumber(mod.level) or 1) <= itemLevel and type(item.GetModSpawnWeight) == "function" and item:GetModSpawnWeight(mod) > 0 then
				local projected = projectCraftOptionMod(modId, mod)
				if mod.type == "Prefix" then table.insert(prefixes, projected) else table.insert(suffixes, projected) end
			end
		end
	end
	local function sortOptions(a, b)
		if a.group ~= b.group then return tostring(a.group or "") < tostring(b.group or "") end
		if a.requiredItemLevel ~= b.requiredItemLevel then return a.requiredItemLevel > b.requiredItemLevel end
		return a.id < b.id
	end
	table.sort(prefixes, sortOptions)
	table.sort(suffixes, sortOptions)
	local essences, selectedEssence = {}, nil
	local data = type(build) == "table" and build.data or nil
	if request.rarity ~= "NORMAL" then
		for essenceId, essence in pairs(type(data) == "table" and data.essences or {}) do
			local modId = type(essence) == "table" and type(essence.mods) == "table" and essence.mods[item.base.type] or nil
			local mod = officialItemMod(data, modId)
			if type(essenceId) == "string" and type(mod) == "table" and (mod.type == "Prefix" or mod.type == "Suffix")
				and (not blockedGroups[mod.group] or (type(selection.essence) == "table" and selection.essence.id == essenceId)) then
				local projected = projectCraftOptionMod(modId, mod)
				table.insert(essences, {
					id = essenceId,
					name = type(essence.name) == "string" and essence.name or essenceId,
					type = type(essence.type) == "string" and essence.type or "",
					mod = projected,
				})
			end
			if type(essenceId) == "string" and type(selection.essence) == "table" and selection.essence.id == essenceId and type(mod) == "table" then
				selectedEssence = {
					id = essenceId,
					name = type(essence.name) == "string" and essence.name or essenceId,
					type = type(essence.type) == "string" and essence.type or "",
					mod = projectCraftOptionMod(modId, mod),
				}
			end
		end
	end
	table.sort(essences, function(a, b) return a.id < b.id end)
	local affixCounts = { prefixes = #selectedPrefixes, suffixes = #selectedSuffixes }
	if selectedEssence and selectedEssence.mod and selectedEssence.mod.type == "Prefix" then affixCounts.prefixes = affixCounts.prefixes + 1 end
	if selectedEssence and selectedEssence.mod and selectedEssence.mod.type == "Suffix" then affixCounts.suffixes = affixCounts.suffixes + 1 end
	local catalystCanSet = item.base and (item.base.type == "Ring" or item.base.type == "Amulet") and (item.crafted == true or item.hasModTags == true)
	local catalystAllowedIds = { 0 }
	local catalystAllowed = { { id = 0, name = "None" } }
	local catalystList = officialCatalystList(item)
	if catalystCanSet and type(catalystList) == "table" then
		for catalystId = 1, #catalystList do
			table.insert(catalystAllowedIds, catalystId)
			table.insert(catalystAllowed, { id = catalystId, name = catalystList[catalystId] })
		end
	end
	return {
		success = true,
		action = "craftOptions",
		canonicalRevision = request.canonicalRevision,
		data = {
			baseName = item.baseName,
			type = item.type,
			rarity = item.rarity,
			corruptible = item.corruptible == true,
			-- Do not invent a global 20/40 quality rule.  The canonical base
			-- definition is the source of whether quality exists and its limit.
			qualityLimit = tonumber(item.base and item.base.quality) or 0,
			affixLimits = affixLimits,
			affixCounts = affixCounts,
			prefixes = prefixes,
			suffixes = suffixes,
			selected = { prefixes = selectedPrefixes, suffixes = selectedSuffixes, essence = selectedEssence },
			variantList = item.variantList,
			variant = tonumber(item.variant),
			implicitRanges = officialImplicitRanges(item),
			quality = { canSet = item.base and item.base.quality ~= nil, value = tonumber(item.quality), min = 0, max = tonumber(item.base and item.base.quality) or 0 },
			catalyst = {
				canSet = catalystCanSet == true,
				allowedIds = catalystAllowedIds,
				allowed = catalystAllowed,
				value = tonumber(item.catalyst) or 0,
				quality = tonumber(item.catalystQuality) or 0,
				qualityLimit = (item.base and item.base.name and item.base.name:find("Breach Ring", 1, true)) and 50 or 20,
			},
			action = actionMode,
			sourceItemId = validInteger(request.sourceItemId),
			tierOptions = tierOptions,
			essences = essences,
			runeCapabilities = { socketCount = runeCapabilities.socketCount, allowed = runeCapabilities.allowed },
			validTargetSlots = officialValidTargetSlots(build.itemsTab, item),
			-- Compare against the actual structured duplicate draft, including
			-- catalyst/catalystQuality.  Passing only the corruption flag here made
			-- craftOptions disagree with craftPreview/commit and report a catalyst as
			-- dropped even when the caller explicitly preserved it.
			nonInheritedStates = actionMode == "duplicate" and nonInheritedCraftStates(sourceItem, (function()
				local stateDraft = {}
				for key, value in pairs(type(selection) == "table" and selection or {}) do stateDraft[key] = value end
				if request.corrupted == true then stateDraft.corrupted = true end
				return stateDraft
			end)(), build.data) or {},
		},
	}
end

function Adapter:craftCatalog(request)
	local build, unavailable = self:available()
	if not build then unavailable.action = "craftCatalog"; return unavailable end
	local data = type(build.data) == "table" and build.data or nil
	if type(data) ~= "table" or type(data.itemBases) ~= "table" then
		return failure("POB_HEADLESS_API_UNAVAILABLE", "build.data.itemBases", "PoB 未暴露官方底材目录")
	end
	local query = type(request) == "table" and request.query or nil
	local result = {}
	for baseName, base in pairs(data.itemBases) do
		if type(baseName) == "string" and type(base) == "table" then
			local hidden = base.hidden == true or base.unreleased == true
			local craftable = base.craftable ~= false and base.virtual ~= true
			if not hidden and craftable and (type(query) ~= "string" or query == "" or baseName:lower():find(query:lower(), 1, true)) then
				local req = type(base.req) == "table" and base.req or {}
				local allowedRarities = { "NORMAL", "MAGIC", "RARE" }
				if base.flask or base.type == "Charm" or (base.type == "Jewel" and base.subType == "Charm") then
					allowedRarities = { "NORMAL", "MAGIC" }
				elseif base.type == "Transcendent Limb" then
					allowedRarities = { "NORMAL" }
				end
				result[#result + 1] = {
					id = baseName,
					baseId = baseName,
					baseName = baseName,
					type = base.type,
					variantList = base.variantList,
					canHaveQuality = base.quality ~= nil,
					canHaveSockets = base.socketLimit ~= nil,
					requiredItemLevel = tonumber(req.level) or 1,
					attributeRequirements = { str = tonumber(req.str) or 0, dex = tonumber(req.dex) or 0, int = tonumber(req.int) or 0 },
					allowedRarities = allowedRarities,
				}
			end
		end
	end
	table.sort(result, function(a, b) return a.baseName < b.baseName end)
	return { success = true, action = "craftCatalog", data = { bases = result } }
end

function Adapter:projectOfficialItem(item, allowTransientId)
	local build = self:currentBuild()
	return projectItem(item, allowTransientId, type(build) == "table" and build.data or nil, type(build) == "table" and build.itemsTab or nil)
end

officialValidTargetSlots = function(itemsTab, item)
	local result = { equipment = {}, equipmentJewels = {}, jewels = {} }
	if type(itemsTab) ~= "table" or type(itemsTab.IsItemValidForSlot) ~= "function" then return result end
	for slotName, slot in pairs(itemsTab.slots or {}) do
		if type(slot) == "table" and not slot.nodeId then
			local shown = true
			if type(slot.shown) == "function" then
				local shownOk, shownValue = pcall(slot.shown)
				shown = not shownOk or shownValue == true
			end
			local ok, valid = false, false
			if shown then
				ok, valid = pcall(itemsTab.IsItemValidForSlot, itemsTab, item, slotName)
			end
			if shown and ok and valid == true then
				table.insert(result.equipment, slotName)
				if slotName:find("Jewel Socket", 1, true) then table.insert(result.equipmentJewels, slotName) end
			end
		end
	end
	for nodeId, slot in pairs(itemsTab.sockets or {}) do
		if type(slot) == "table" and slot.nodeId and type(slot.slotName) == "string" then
			local ok, valid = pcall(itemsTab.IsItemValidForSlot, itemsTab, item, slot.slotName)
			if ok and valid == true then table.insert(result.jewels, { nodeId = tonumber(nodeId), slotName = slot.slotName }) end
		end
	end
	table.sort(result.equipment)
	table.sort(result.jewels, function(a, b) return (a.nodeId or 0) < (b.nodeId or 0) end)
	return result
end

function Adapter:craft(action, request)
	local build, unavailable = self:available()
	if not build then unavailable.action = action; return unavailable end
	local operation = type(request) == "table" and (request.operation or request.actionMode) or nil
	if operation ~= "create" and operation ~= "edit" and operation ~= "duplicate" then
		return craftInputError("operation", "必须明确指定 create、edit 或 duplicate 操作")
	end
	local sourceItem = nil
	if operation ~= "create" then
		local sourceId = validInteger(request.sourceItemId)
		if not sourceId or sourceId <= 0 or type(build.itemsTab.items) ~= "table" or type(build.itemsTab.items[sourceId]) ~= "table" then
			return craftInputError("sourceItemId", "编辑或复制必须指定当前官方物品库中的物品 ID")
		end
		sourceItem = build.itemsTab.items[sourceId]
		if operation == "edit" then
			local readOnlyState = readOnlyCraftState(sourceItem)
			if sourceItem.rarity ~= "RARE" or readOnlyState then
				return craftInputError("sourceItemId", "该官方物品包含不可由制作草案表达的只读状态（"..tostring(readOnlyState or "rarity").."），必须使用 duplicate 创建副本")
			end
		end
	end
	-- Editing is an in-place update.  Preserve official state that is not
	-- explicitly represented by the structured draft (sockets/runes, quality,
	-- catalyst and immutable flags) instead of silently resetting it.
	if operation == "edit" and type(request.draft) == "table" and type(sourceItem) == "table" then
		local draft = {}
		for key, value in pairs(request.draft) do draft[key] = value end
		for _, key in ipairs({ "quality", "catalyst", "catalystQuality", "corrupted", "variant", "socketCount", "runes", "title", "jewelRadiusLabel" }) do
			local sourceValue = sourceItem[key]
			if key == "socketCount" and sourceValue == nil then sourceValue = sourceItem.itemSocketCount end
			if key == "runes" and (tonumber(sourceItem.itemSocketCount) or 0) <= 0 then
				-- No rune sockets: omit the parser's empty internal array.
			elseif draft[key] == nil and sourceValue ~= nil then
				if key == "runes" and type(sourceValue) == "table" then
					draft[key] = {}
					for index, rune in ipairs(sourceValue) do draft[key][index] = rune end
				else
					draft[key] = sourceValue
				end
			end
		end
		if draft.implicitRanges == nil then draft.implicitRanges = officialImplicitRanges(sourceItem) end
		if draft.catalyst == 0 and draft.catalystQuality == nil then draft.catalystQuality = 0 end
		request.draft = draft
	end
	-- A duplicate without a target is a library-only copy, just like create.
	-- When a target is supplied it must continue through the target transaction
	-- below so the new ID is actually assigned to the requested equipment or
	-- passive-jewel slot.
	if (operation == "create" and request.target == nil) or (operation == "duplicate" and request.target == nil) then
		local item, itemError, runeCapabilities = self:validateCraftDraft(request.draft, build.itemsTab)
		if not item then itemError.action = action; return itemError end
		if action == "craftPreview" then
			local projected, projectionError = self:projectOfficialItem(item, true)
			if not projected then projectionError.action = action; return projectionError end
			local previewData = { item = projected, output = outputScalars(build.calcsTab.mainOutput), runeCapabilities = { socketCount = runeCapabilities.socketCount, allowed = runeCapabilities.allowed }, validTargetSlots = officialValidTargetSlots(build.itemsTab, item) }
			if operation == "duplicate" then previewData.nonInheritedStates = nonInheritedCraftStates(sourceItem, request.draft, build.data) end
			return { success = true, action = action, data = previewData }
		end
		local snapshot, snapshotError = self:createCalculationSnapshot(build)
		if not snapshot then snapshotError.action = action; return snapshotError end
		if type(build.itemsTab) ~= "table" or type(build.itemsTab.AddItem) ~= "function" then
			return self:restoreCalculationSnapshot(snapshot, failure("POB_HEADLESS_API_UNAVAILABLE", "itemsTab:AddItem", "PoB 未暴露官方物品库写入接口"))
		end
		-- Both create and duplicate allocate a fresh official ID.  Duplicate's
		-- source item is validated above (so read-only uniques can be copied),
		-- but no hidden state is inherited unless it is explicitly present in the
		-- structured draft.
		build.itemsTab:AddItem(item, true)
		local projected, projectionError = self:projectOfficialItem(item)
		if not projected then return self:restoreCalculationSnapshot(snapshot, projectionError) end
	local result = { success = true, action = action, data = { item = projected, output = outputScalars(build.calcsTab.mainOutput), runeCapabilities = { socketCount = runeCapabilities.socketCount, allowed = runeCapabilities.allowed }, validTargetSlots = officialValidTargetSlots(build.itemsTab, item) } }
		if operation == "duplicate" then result.data.nonInheritedStates = nonInheritedCraftStates(sourceItem, request.draft, build.data) end
		build.buildFlag = true
		local calculated, calculationError = pcall(build.calcsTab.BuildOutput, build.calcsTab)
		if not calculated then return self:restoreCalculationSnapshot(snapshot, failure("POB_CALCULATION_FAILED", "build.calcsTab:BuildOutput", tostring(calculationError))) end
		result.data.output = outputScalars(build.calcsTab.mainOutput)
		local exported = self:exportXML()
		if not exported.success then return self:restoreCalculationSnapshot(snapshot, exported) end
		result.data.xml = exported.data.xml
		local projection, buildError = projectBuild(build, request.name, build.calcsTab.mainOutput, self.runtime)
		if not projection then return self:restoreCalculationSnapshot(snapshot, buildError) end
		result.data.build = projection
		return result
	end
	if operation == "edit" and request.target == nil then
		local sourceId = validInteger(request.sourceItemId)
		local item, itemError, runeCapabilities = self:validateCraftDraft(request.draft, build.itemsTab)
		if not item then itemError.action = action; return itemError end
		local snapshot, snapshotError = self:createCalculationSnapshot(build)
		if not snapshot then snapshotError.action = action; return snapshotError end
		-- Route an in-place replacement through the official ItemsTab:AddItem
		-- path.  Assigning the table directly leaves BuildModList (and cluster
		-- jewel graph invalidation) untouched, so calculations would continue to
		-- observe stale or missing modifier lists even though the XML contains the
		-- replacement.  AddItem keeps the explicit source ID and therefore does
		-- not create a second item-order entry.
		item.id = sourceId
		build.itemsTab:AddItem(item, true)
		if type(build.itemsTab.PopulateSlots) == "function" then build.itemsTab:PopulateSlots() end
		build.buildFlag = true
		local calculated, calculationError = pcall(build.calcsTab.BuildOutput, build.calcsTab)
		if not calculated then return self:restoreCalculationSnapshot(snapshot, failure("POB_CALCULATION_FAILED", "build.calcsTab:BuildOutput", tostring(calculationError))) end
		local projected, projectionError = self:projectOfficialItem(item)
		if not projected then return self:restoreCalculationSnapshot(snapshot, projectionError) end
		local exported = self:exportXML()
		if not exported.success then return self:restoreCalculationSnapshot(snapshot, exported) end
		local projection, buildError = projectBuild(build, request.name, build.calcsTab.mainOutput, self.runtime)
		if not projection then return self:restoreCalculationSnapshot(snapshot, buildError) end
		if action == "craftPreview" then return self:restoreCalculationSnapshot(snapshot, { success = true, action = action, data = { item = projected, output = outputScalars(build.calcsTab.mainOutput), runeCapabilities = { socketCount = runeCapabilities.socketCount, allowed = runeCapabilities.allowed }, validTargetSlots = officialValidTargetSlots(build.itemsTab, item) } }) end
		return { success = true, action = action, data = { item = projected, output = outputScalars(build.calcsTab.mainOutput), runeCapabilities = { socketCount = runeCapabilities.socketCount, allowed = runeCapabilities.allowed }, validTargetSlots = officialValidTargetSlots(build.itemsTab, item), xml = exported.data.xml, build = projection } }
	end
	local targetKind = request.target and (request.target.kind or "equipment") or "equipment"
	if targetKind ~= "equipment" and targetKind ~= "jewel" then return craftInputError("target.kind", "制作目标必须是官方装备槽位或天赋珠宝槽") end
	if targetKind == "equipment" and (type(request.target.slotName) ~= "string" or not validInteger(request.target.itemSetId)) then
		return craftInputError("target", "必须指定官方装备集 ID 与要预览或穿戴的装备槽位")
	end
	if targetKind == "jewel" and (not validInteger(request.target.specId) or not validInteger(request.target.nodeId)) then
		return craftInputError("target", "必须指定官方天赋树 ID 与已分配的珠宝槽节点 ID")
	end
	local snapshot, snapshotError = self:createCalculationSnapshot(build)
	if not snapshot then snapshotError.action = action; return snapshotError end
	local item, itemError, runeCapabilities = self:validateCraftDraft(request.draft, build.itemsTab)
	if not item then return self:restoreCalculationSnapshot(snapshot, itemError) end
	local itemsTab = build.itemsTab
	if type(itemsTab.AddItem) ~= "function" or type(itemsTab.IsItemValidForSlot) ~= "function" then
		return self:restoreCalculationSnapshot(snapshot, failure("POB_HEADLESS_API_UNAVAILABLE", "itemsTab", "PoB 未暴露官方装备操作接口"))
	end
	local slotName = nil
	local restoreTarget = nil
	if targetKind == "equipment" then
		local targetItemSetId = validInteger(request.target.itemSetId)
		if type(itemsTab.itemSets) ~= "table" or not itemsTab.itemSets[targetItemSetId] or type(itemsTab.SetActiveItemSet) ~= "function" then
			return self:restoreCalculationSnapshot(snapshot, craftInputError("target.itemSetId", "指定的官方装备集不存在或无法切换"))
		end
		local originalItemSetId = itemsTab.activeItemSetId
		if originalItemSetId ~= targetItemSetId then
			local switched, switchError = pcall(itemsTab.SetActiveItemSet, itemsTab, targetItemSetId, true)
			if not switched then return self:restoreCalculationSnapshot(snapshot, failure("POB_CRAFT_ITEM_SET_SWITCH_FAILED", "itemsTab:SetActiveItemSet", tostring(switchError))) end
			restoreTarget = function()
				local restored, restoreError = pcall(itemsTab.SetActiveItemSet, itemsTab, originalItemSetId, true)
				if not restored then return failure("POB_CRAFT_ITEM_SET_RESTORE_FAILED", "itemsTab:SetActiveItemSet", tostring(restoreError)) end
				return nil
			end
		end
		local slot = type(itemsTab.slots) == "table" and itemsTab.slots[request.target.slotName] or nil
		if type(slot) ~= "table" or slot.nodeId or type(slot.SetSelItemId) ~= "function" then
			return self:restoreCalculationSnapshot(snapshot, craftInputError("target.slotName", "该官方装备槽位不存在"))
		end
		slotName = request.target.slotName
		if not itemsTab:IsItemValidForSlot(item, slotName) then
			return self:restoreCalculationSnapshot(snapshot, craftInputError("target.slotName", "该物品不能穿戴在指定槽位"))
		end
		local sourceId = validInteger(request.sourceItemId)
		if operation == "edit" then item.id = sourceId end
		itemsTab:AddItem(item, true)
		slot:SetSelItemId(item.id)
	else
		local treeTab = build.treeTab
		local targetSpecId = validInteger(request.target.specId)
		local targetNodeId = validInteger(request.target.nodeId)
		if type(treeTab) ~= "table" or type(treeTab.specList) ~= "table" or not treeTab.specList[targetSpecId] or type(treeTab.SetActiveSpec) ~= "function" then
			return self:restoreCalculationSnapshot(snapshot, craftInputError("target.specId", "指定的官方天赋树不存在或无法切换"))
		end
		local originalSpecId = treeTab.activeSpec
		if originalSpecId ~= targetSpecId then
			local switched, switchError = pcall(treeTab.SetActiveSpec, treeTab, targetSpecId, true)
			if not switched then return self:restoreCalculationSnapshot(snapshot, failure("POB_CRAFT_SPEC_SWITCH_FAILED", "treeTab:SetActiveSpec", tostring(switchError))) end
			restoreTarget = function()
				local restored, restoreError = pcall(treeTab.SetActiveSpec, treeTab, originalSpecId, true)
				if not restored then return failure("POB_CRAFT_SPEC_RESTORE_FAILED", "treeTab:SetActiveSpec", tostring(restoreError)) end
				return nil
			end
		end
		local spec = build.spec
		local slot = type(itemsTab.sockets) == "table" and itemsTab.sockets[targetNodeId] or nil
		if type(spec) ~= "table" or type(spec.allocNodes) ~= "table" or not spec.allocNodes[targetNodeId] then
			return self:restoreCalculationSnapshot(snapshot, craftInputError("target.nodeId", "珠宝槽必须已在指定官方天赋树中分配"))
		end
		if type(slot) ~= "table" or slot.nodeId ~= targetNodeId or type(slot.slotName) ~= "string" or type(slot.SetSelItemId) ~= "function" then
			return self:restoreCalculationSnapshot(snapshot, craftInputError("target.nodeId", "指定节点不是当前官方天赋树中的珠宝槽"))
		end
		slotName = slot.slotName
		if not itemsTab:IsItemValidForSlot(item, slotName) then
			return self:restoreCalculationSnapshot(snapshot, craftInputError("target.nodeId", "该物品不能镶嵌到指定官方珠宝槽"))
		end
		local sourceId = validInteger(request.sourceItemId)
		if operation == "edit" then item.id = sourceId end
		itemsTab:AddItem(item, true)
		slot:SetSelItemId(item.id)
	end
	if type(itemsTab.PopulateSlots) == "function" then itemsTab:PopulateSlots() end
	build.buildFlag = true
	local ok, calculateError = pcall(build.calcsTab.BuildOutput, build.calcsTab)
	if not ok then return self:restoreCalculationSnapshot(snapshot, failure("POB_CALCULATION_FAILED", "build.calcsTab:BuildOutput", tostring(calculateError))) end
	local projected, projectionError = self:projectOfficialItem(item)
	if not projected then return self:restoreCalculationSnapshot(snapshot, projectionError) end
	local targetOutput = outputScalars(build.calcsTab.mainOutput)
	local result = { success = true, action = action, data = { item = projected, output = targetOutput, runeCapabilities = { socketCount = runeCapabilities.socketCount, allowed = runeCapabilities.allowed }, validTargetSlots = officialValidTargetSlots(build.itemsTab, item) } }
	if operation == "duplicate" then result.data.nonInheritedStates = nonInheritedCraftStates(sourceItem, request.draft, build.data) end
	if action == "craftPreview" then return self:restoreCalculationSnapshot(snapshot, result) end
	if restoreTarget then
		local restoreError = restoreTarget()
		if restoreError then return self:restoreCalculationSnapshot(snapshot, restoreError) end
		build.buildFlag = true
		local recalculateOk, recalculateError = pcall(build.calcsTab.BuildOutput, build.calcsTab)
		if not recalculateOk then return self:restoreCalculationSnapshot(snapshot, failure("POB_CALCULATION_FAILED", "build.calcsTab:BuildOutput", tostring(recalculateError))) end
		result.data.output = outputScalars(build.calcsTab.mainOutput)
		result.data.targetOutput = targetOutput
	end
	local exported = self:exportXML()
	if not exported.success then return self:restoreCalculationSnapshot(snapshot, exported) end
	result.data.xml = exported.data.xml
	local projection, buildError = projectBuild(build, request.name, build.calcsTab.mainOutput, self.runtime)
	if not projection then return self:restoreCalculationSnapshot(snapshot, buildError) end
	result.data.build = projection
	return result
end

function Adapter:previewCraftDraft(request)
	return self:craft("craftPreview", request)
end

function Adapter:commitCraftDraft(request)
	return self:craft("craftCommit", request)
end

local function trim(value)
	return type(value) == "string" and value:match("^%s*(.-)%s*$") or ""
end

local function normaliseAffixLine(value)
	local line = trim(value)
	-- Formatting flags are transport metadata. They do not identify a game
	-- modifier and must not affect the strict upstream-text comparison.
	line = line:gsub("{[^}]*}", "")
	return (trim(line):gsub("\r", ""))
end

local function numericLineSignature(value)
	return (normaliseAffixLine(value):gsub("[-+]?%d+%.?%d*", "#"))
end

local function numericValues(value)
	local values = {}
	for token in normaliseAffixLine(value):gmatch("[-+]?%d+%.?%d*") do table.insert(values, tonumber(token)) end
	return values
end

local function sourceFitsOfficialRange(source, lower, upper)
	if numericLineSignature(source) ~= numericLineSignature(lower) or numericLineSignature(source) ~= numericLineSignature(upper) then return false end
	local sourceValues, lowerValues, upperValues = numericValues(source), numericValues(lower), numericValues(upper)
	if #sourceValues ~= #lowerValues or #sourceValues ~= #upperValues then return false end
	for index, value in ipairs(sourceValues) do
		local minValue, maxValue = math.min(lowerValues[index], upperValues[index]), math.max(lowerValues[index], upperValues[index])
		if value < minValue - 0.000001 or value > maxValue + 0.000001 then return false end
	end
	return true
end

local function catalystScalarFor(item, mod, override)
	if type(item) ~= "table" or type(mod) ~= "table" or mod.unscalable then return 1 end
	local catalystId = (override and override.id) or item.catalyst
	local tags = mod.modTags
	local catalystTags = officialCatalystTags(item)
	if type(catalystId) ~= "number" or type(tags) ~= "table" or type(catalystTags) ~= "table" or not catalystTags[catalystId] then return 1 end
	local tagLookup = {}
	for _, tag in ipairs(tags) do tagLookup[tag] = true end
	for _, tag in ipairs(catalystTags[catalystId]) do
		if tagLookup[tag] then
			local quality = (override and override.quality) or item.catalystQuality or item.quality or 20
			return (100 + (tonumber(quality) or 20)) / 100
		end
	end
	return 1
end

local function catalystStateFor(item, override)
	local catalystId = override and override.id or (type(item) == "table" and item.catalyst)
	local catalystList = officialCatalystList(item)
	if type(catalystId) ~= "number" or type(catalystList) ~= "table" or type(catalystList[catalystId]) ~= "string" then return nil end
	local quality = override and override.quality or item.catalystQuality or item.quality
	return { id = catalystId, quality = tonumber(quality) or 20 }
end

local function applyOfficialAffixRange(itemTools, item, mod, line, roll, catalystOverride)
	local scalar = catalystScalarFor(item, mod, catalystOverride)
	return pcall(itemTools.applyRange, line, roll, scalar)
end

local function itemAffixForTuning(item, modId)
	return type(item) == "table" and type(item.affixes) == "table" and item.affixes[modId] or nil
end

local function declaredRareAffixes(item)
	local entries, ordered = {}, {}
	for _, kind in ipairs({ "prefixes", "suffixes" }) do
		for index, affix in ipairs(item[kind] or {}) do
			if type(affix) == "table" and affix.modId == "None" then
				-- Crafted rares retain empty official slots; they are not modifiers.
			elseif type(affix) ~= "table" or type(affix.modId) ~= "string" or affix.modId == "" or type(affix.range) ~= "number" then
				return nil, craftInputError("draft.itemId", "该官方物品包含不能按 Roll 微调的词缀")
			else
				if entries[affix.modId] then return nil, craftInputError("draft.itemId", "该官方物品包含重复词缀，不能安全微调") end
				local entry = { id = affix.modId, affix = affix, kind = kind, index = index, roll = affix.range }
				entries[affix.modId] = entry
				table.insert(ordered, entry)
			end
		end
	end
	return #ordered > 0 and { entries = entries, ordered = ordered, imported = false, catalyst = catalystStateFor(item) } or nil
end

local function matchingLineIndexSets(sourceLines, expectedLines)
	local results, used, selected = {}, {}, {}
	local function collect(index)
		if #results >= 24 then return end
		if index > #expectedLines then
			local copy = {}
			for position, value in ipairs(selected) do copy[position] = value end
			table.insert(results, copy)
			return
		end
		for sourceIndex, source in ipairs(sourceLines) do
			if not used[sourceIndex] and source == expectedLines[index] then
				used[sourceIndex] = true
				selected[index] = sourceIndex
				collect(index + 1)
				selected[index] = nil
				used[sourceIndex] = nil
			end
		end
	end
	collect(1)
	return results
end

local function importedRareAffixes(item, catalystOverride)
	local itemTools = rawget(_G, "itemLib")
	if type(item.affixes) ~= "table" or type(itemTools) ~= "table" or type(itemTools.applyRange) ~= "function" then
		return nil, craftInputError("draft.itemId", "该导入稀有物品没有可验证的官方词缀数据")
	end
	local sourceLines, sourceSignatures = {}, {}
	for index, modLine in ipairs(item.explicitModLines or {}) do
		if type(modLine) ~= "table" or type(modLine.line) ~= "string" or modLine.custom or modLine.fractured or modLine.desecrated or modLine.mutated then
			return nil, craftInputError("draft.itemId", "导入物品含有无法安全反推的词缀")
		end
		local line = normaliseAffixLine(modLine.line)
		if line == "" then return nil, craftInputError("draft.itemId", "导入物品含有空词缀") end
		sourceLines[index] = line
		local signature = numericLineSignature(line)
		sourceSignatures[signature] = (sourceSignatures[signature] or 0) + 1
	end
	if #sourceLines == 0 then return nil, craftInputError("draft.itemId", "该稀有物品没有可微调的词缀") end

	local maxPerKind = {
		prefixes = officialAffixSlotsFor(item, "prefixes"),
		suffixes = officialAffixSlotsFor(item, "suffixes"),
	}
	if not maxPerKind.prefixes or not maxPerKind.suffixes then
		return nil, craftInputError("draft.itemId", "官方 PoB 未返回该底材的词缀容量")
	end
	local baseTags = type(item.base) == "table" and item.base.tags or {}
	local function belongsToBase(modId, mod)
		if type(item.GetModSpawnWeight) == "function" then
			local ok, weight = pcall(item.GetModSpawnWeight, item, mod)
			if ok and type(weight) == "number" and weight > 0 then return true end
		end
		-- Special-crafted/essence records can have zero normal weight, but must
		-- still explicitly name this base family. A default-only zero-weight
		-- record belongs to no concrete base and is never accepted for tuning.
		if type(mod.weightKey) ~= "table" then return true end
		for _, tag in ipairs(mod.weightKey) do
			if tag ~= "default" and baseTags[tag] then return true end
		end
		return false
	end
	local modIds = {}
	for modId, mod in pairs(item.affixes) do
		-- A live imported item may legitimately contain a special-crafted,
		-- essence, or alloy modifier whose normal spawn weight is zero. This is
		-- reverse projection only: membership in PoB's base-specific affix table
		-- is the authority here, while new-item creation remains weight-checked.
		if type(modId) == "string" and type(mod) == "table" and (mod.type == "Prefix" or mod.type == "Suffix") and belongsToBase(modId, mod) then
			table.insert(modIds, modId)
		end
	end
	table.sort(modIds)
	local byKey, candidates, candidatesBySource = {}, {}, {}
	for _, modId in ipairs(modIds) do
		local mod = itemAffixForTuning(item, modId, catalystOverride)
		-- Applying every roll to every modifier is prohibitively expensive on a
		-- real ring. First require its official text skeleton to fit the imported
		-- explicit lines; the exact comparison below remains the authority.
		local expectedCount, compatible = 0, {}
		for _, line in ipairs(mod) do
			if type(line) == "string" then
				local applied, value = applyOfficialAffixRange(itemTools, item, mod, line, 0, catalystOverride)
				if not applied or type(value) ~= "string" then
					compatible = nil
					break
				end
				local signature = numericLineSignature(value)
				compatible[signature] = (compatible[signature] or 0) + 1
				expectedCount = expectedCount + 1
			end
		end
		if expectedCount > 0 and compatible then
			for signature, count in pairs(compatible) do
				if (sourceSignatures[signature] or 0) < count then compatible = nil; break end
			end
		end
		if compatible and expectedCount > 0 then
			for _, line in ipairs(mod) do
				if type(line) == "string" then
					local lowOk, lower = applyOfficialAffixRange(itemTools, item, mod, line, 0, catalystOverride)
					local highOk, upper = applyOfficialAffixRange(itemTools, item, mod, line, 1, catalystOverride)
					local fitsSource = lowOk and highOk and type(lower) == "string" and type(upper) == "string"
					if fitsSource then
						fitsSource = false
						for _, source in ipairs(sourceLines) do
							if sourceFitsOfficialRange(source, lower, upper) then fitsSource = true; break end
						end
					end
					if not fitsSource then compatible = nil; break end
				end
			end
		end
		if compatible and expectedCount > 0 then
			local identityParts = { mod.type or "", mod.group or "" }
			for _, line in ipairs(mod) do if type(line) == "string" then table.insert(identityParts, line) end end
			local identity = table.concat(identityParts, "\30")
			for thousandths = 0, 1000 do
				local roll = thousandths / 1000
				local expected = {}
				for _, line in ipairs(mod) do
					if type(line) == "string" then
						local applied, value = applyOfficialAffixRange(itemTools, item, mod, line, roll, catalystOverride)
						if applied and type(value) == "string" then table.insert(expected, normaliseAffixLine(value)) end
					end
				end
				if #expected > 0 then
					for _, lineIndexes in ipairs(matchingLineIndexSets(sourceLines, expected)) do
						local key = modId .. ":" .. table.concat(lineIndexes, ",")
						local candidate = byKey[key]
						if not candidate then
							candidate = { id = modId, identity = identity, kind = mod.type == "Prefix" and "prefixes" or "suffixes", lineIndexes = lineIndexes, first = thousandths, last = thousandths }
							byKey[key] = candidate
							table.insert(candidates, candidate)
						else
							candidate.last = thousandths
						end
					end
				end
			end
		end
	end
	for _, candidate in ipairs(candidates) do
		candidate.roll = math.floor((candidate.first + candidate.last) / 2 + 0.5) / 1000
		for _, sourceIndex in ipairs(candidate.lineIndexes) do
			candidatesBySource[sourceIndex] = candidatesBySource[sourceIndex] or {}
			table.insert(candidatesBySource[sourceIndex], candidate)
		end
	end
	for sourceIndex = 1, #sourceLines do
		if not candidatesBySource[sourceIndex] or #candidatesBySource[sourceIndex] == 0 then
			return nil, craftInputError("draft.itemId", "导入物品包含当前官方版本无法识别的词缀："..sourceLines[sourceIndex])
		end
	end

	local solutions, solutionByKey = {}, {}
	local usedLines, usedMods, selected, counts = {}, {}, {}, { prefixes = 0, suffixes = 0 }
	local function solve()
		local sourceIndex, available
		for index = 1, #sourceLines do
			if not usedLines[index] then
				local compatible = {}
				for _, candidate in ipairs(candidatesBySource[index]) do
					local fits = not usedMods[candidate.id] and counts[candidate.kind] < maxPerKind[candidate.kind]
					if fits then for _, covered in ipairs(candidate.lineIndexes) do if usedLines[covered] then fits = false; break end end end
					if fits then table.insert(compatible, candidate) end
				end
				if not sourceIndex or #compatible < #available then sourceIndex, available = index, compatible end
			end
		end
		if not sourceIndex then
			local signatureParts, copy = {}, {}
			for index, candidate in ipairs(selected) do
				copy[index] = candidate
				table.insert(signatureParts, candidate.identity .. ":" .. string.format("%.3f", candidate.roll))
			end
			table.sort(signatureParts)
			local signature = table.concat(signatureParts, "|")
			if not solutionByKey[signature] then solutionByKey[signature] = true; table.insert(solutions, copy) end
			return
		end
		if not available or #available == 0 then return end
		for _, candidate in ipairs(available) do
			usedMods[candidate.id] = true
			counts[candidate.kind] = counts[candidate.kind] + 1
			for _, covered in ipairs(candidate.lineIndexes) do usedLines[covered] = true end
			table.insert(selected, candidate)
			solve()
			table.remove(selected)
			for _, covered in ipairs(candidate.lineIndexes) do usedLines[covered] = nil end
			counts[candidate.kind] = counts[candidate.kind] - 1
			usedMods[candidate.id] = nil
			if #solutions > 1 then return end
		end
	end
	solve()
	if #solutions == 0 then return nil, craftInputError("draft.itemId", "导入物品的官方词缀组合不合法或无法完整反推") end
	if #solutions > 1 then return nil, craftInputError("draft.itemId", "导入物品的词缀映射存在歧义，已拒绝修改") end
	local entries, ordered = {}, {}
	for _, candidate in ipairs(solutions[1]) do
		local entry = { id = candidate.id, kind = candidate.kind, roll = candidate.roll, lineIndexes = candidate.lineIndexes }
		entries[entry.id] = entry
		table.insert(ordered, entry)
	end
	table.sort(ordered, function(left, right) return left.id < right.id end)
	return { entries = entries, ordered = ordered, imported = true, catalyst = catalystStateFor(item, catalystOverride) }
end

-- Ninja exports or game client pastes can omit the explicit catalyst descriptor
-- line from otherwise valid Amulets, Rings, and Belts, or encode it simply as "Quality: +40%".
-- Probe catalyst types and quality levels that can account for displayed lines,
-- then require the complete official affix mapping to produce one unique result.
local function isJewelleryItem(item)
	if type(item) ~= "table" then return false end
	local base = type(item.base) == "table" and item.base or nil
	local itemType = type(base) == "table" and (base.type or base.name) or item.type
	local baseName = type(base) == "table" and base.name or item.baseName
	local raw = type(item.raw) == "string" and item.raw or ""
	if itemType == "Amulet" or itemType == "Ring" or itemType == "Belt" then return true end
	if baseName == "Breach Ring" or raw:match("[\r\n]Breach Ring[\r\n]") ~= nil then return true end
	if raw:match("[\r\n]Amulet[\r\n]") ~= nil or raw:match("[\r\n]Ring[\r\n]") ~= nil or raw:match("[\r\n]Belt[\r\n]") ~= nil then return true end
	return false
end

local function inferredJewelleryCatalystOverrides(item)
	if not isJewelleryItem(item) or (type(item.catalyst) == "number" and item.catalyst > 0) or type(item.affixes) ~= "table" then return {} end
	local itemTools = rawget(_G, "itemLib")
	if type(itemTools) ~= "table" or type(itemTools.applyRange) ~= "function" then return {} end
	local sourceBySignature = {}
	for _, modLine in ipairs(item.explicitModLines or {}) do
		if type(modLine) == "table" and type(modLine.line) == "string" then
			local source = normaliseAffixLine(modLine.line)
			local signature = numericLineSignature(source)
			sourceBySignature[signature] = sourceBySignature[signature] or {}
			table.insert(sourceBySignature[signature], source)
		end
	end
	local rawQuality = tonumber(item.catalystQuality) or tonumber(item.quality)
	local base = type(item.base) == "table" and item.base or nil
	local baseName = type(base) == "table" and base.name or (type(item) == "table" and item.baseName)
	local isBreachRing = baseName == "Breach Ring" or (type(item.raw) == "string" and item.raw:match("[\r\n]Breach Ring[\r\n]") ~= nil)
	local testQualities = rawQuality and rawQuality > 0 and { rawQuality } or (isBreachRing and { 50, 20 } or { 20, 40, 50 })
	local possible = {}
	local catalystList = officialCatalystList(item)
	if type(catalystList) ~= "table" then return {} end
	for _, mod in pairs(item.affixes) do
		if type(mod) == "table" and type(mod.modTags) == "table" then
			for _, line in ipairs(mod) do
				if type(line) == "string" then
					for _, quality in ipairs(testQualities) do
						for catalystId = 1, #catalystList do
							local override = { id = catalystId, quality = quality }
							if catalystScalarFor(item, mod, override) > 1 then
								local lowOk, lower = applyOfficialAffixRange(itemTools, item, mod, line, 0, override)
								local highOk, upper = applyOfficialAffixRange(itemTools, item, mod, line, 1, override)
								local sources = lowOk and type(lower) == "string" and sourceBySignature[numericLineSignature(lower)] or nil
								if sources and highOk and type(upper) == "string" then
									for _, source in ipairs(sources) do
										if sourceFitsOfficialRange(source, lower, upper) then
											possible[catalystId .. ":" .. quality] = override
											break
										end
									end
								end
							end
						end
					end
				end
			end
		end
	end
	local overrides = {}
	for _, override in pairs(possible) do table.insert(overrides, override) end
	return overrides
end

local function collectRareAffixes(item)
	if type(item) ~= "table" or item.rarity ~= "RARE" then return nil, craftInputError("draft.itemId", "只能微调当前官方稀有物品") end
	if item.corrupted then return nil, craftInputError("draft.itemId", "腐化物品不能进行稀有词缀微调") end
	local declared, declaredError = declaredRareAffixes(item)
	if declaredError then return nil, declaredError end
	if declared then return declared end
	local imported, importedError = importedRareAffixes(item)
	if imported then return imported end
	local inferred = {}
	for _, override in ipairs(inferredJewelleryCatalystOverrides(item)) do
		local candidate, candidateError = importedRareAffixes(item, override)
		if candidate then table.insert(inferred, candidate) end
	end
	if #inferred == 1 then return inferred[1] end
	if #inferred > 1 then return nil, craftInputError("draft.itemId", "导入首饰的催化剂类型存在歧义，不能安全微调") end
	return nil, importedError
end

function Adapter:activateOfficialItemTarget(build, target, failurePrefix)
	if type(target) ~= "table" then return nil, craftInputError("target", "必须指定当前官方装备槽位或已分配的天赋珠宝槽") end
	local targetKind = target.kind or "equipment"
	if targetKind ~= "equipment" and targetKind ~= "jewel" then return nil, craftInputError("target.kind", "目标必须是官方装备槽位或天赋珠宝槽") end
	local itemsTab = build.itemsTab
	if type(itemsTab) ~= "table" or type(itemsTab.items) ~= "table" then return nil, failure("POB_HEADLESS_API_UNAVAILABLE", "itemsTab", "PoB 未暴露官方物品库") end
	local restoreTarget = nil
	local slot = nil
	local slotName = nil
	if targetKind == "equipment" then
		local targetItemSetId = validInteger(target.itemSetId)
		if type(target.slotName) ~= "string" or not targetItemSetId or type(itemsTab.itemSets) ~= "table" or not itemsTab.itemSets[targetItemSetId] or type(itemsTab.SetActiveItemSet) ~= "function" then
			return nil, craftInputError("target", "必须指定官方装备集 ID 与当前装备槽位")
		end
		local originalItemSetId = itemsTab.activeItemSetId
		if originalItemSetId ~= targetItemSetId then
			local switched, switchError = pcall(itemsTab.SetActiveItemSet, itemsTab, targetItemSetId, true)
			if not switched then return nil, failure(failurePrefix.."_ITEM_SET_SWITCH_FAILED", "itemsTab:SetActiveItemSet", tostring(switchError)) end
			restoreTarget = function()
				local restored, restoreError = pcall(itemsTab.SetActiveItemSet, itemsTab, originalItemSetId, true)
				if not restored then return failure(failurePrefix.."_ITEM_SET_RESTORE_FAILED", "itemsTab:SetActiveItemSet", tostring(restoreError)) end
				return nil
			end
		end
		slot = type(itemsTab.slots) == "table" and itemsTab.slots[target.slotName] or nil
		if type(slot) ~= "table" or slot.nodeId or type(slot.SetSelItemId) ~= "function" then return nil, craftInputError("target.slotName", "该官方装备槽位不存在") end
		slotName = target.slotName
	else
		local treeTab = build.treeTab
		local targetSpecId = validInteger(target.specId)
		local targetNodeId = validInteger(target.nodeId)
		if not targetSpecId or not targetNodeId or type(treeTab) ~= "table" or type(treeTab.specList) ~= "table" or not treeTab.specList[targetSpecId] or type(treeTab.SetActiveSpec) ~= "function" then
			return nil, craftInputError("target", "必须指定官方天赋树 ID 与已分配的珠宝槽节点 ID")
		end
		local originalSpecId = treeTab.activeSpec
		if originalSpecId ~= targetSpecId then
			local switched, switchError = pcall(treeTab.SetActiveSpec, treeTab, targetSpecId, true)
			if not switched then return nil, failure(failurePrefix.."_SPEC_SWITCH_FAILED", "treeTab:SetActiveSpec", tostring(switchError)) end
			restoreTarget = function()
				local restored, restoreError = pcall(treeTab.SetActiveSpec, treeTab, originalSpecId, true)
				if not restored then return failure(failurePrefix.."_SPEC_RESTORE_FAILED", "treeTab:SetActiveSpec", tostring(restoreError)) end
				return nil
			end
		end
		if type(build.spec) ~= "table" or type(build.spec.allocNodes) ~= "table" or not build.spec.allocNodes[targetNodeId] then
			return nil, craftInputError("target.nodeId", "珠宝槽必须已在指定官方天赋树中分配")
		end
		slot = type(itemsTab.sockets) == "table" and itemsTab.sockets[targetNodeId] or nil
		if type(slot) ~= "table" or slot.nodeId ~= targetNodeId or type(slot.slotName) ~= "string" or type(slot.SetSelItemId) ~= "function" then return nil, craftInputError("target.nodeId", "指定节点不是当前官方天赋树中的珠宝槽") end
		slotName = slot.slotName
	end
	return { itemsTab = itemsTab, slot = slot, slotName = slotName, restoreTarget = restoreTarget }
end

function Adapter:assignOfficialItem(request)
	local build, unavailable = self:available()
	if not build then unavailable.action = "assignOfficialItem"; return unavailable end
	if type(request) ~= "table" then return itemAssignmentInput("request", "必须指定官方物品分配请求") end
	-- HTTP has already loaded the canonical XML for this request. Reusing it as
	-- the rollback snapshot avoids serialising the entire Build a second time.
	local snapshot = type(request.canonicalXML) == "string" and request.canonicalXML ~= "" and request.canonicalXML or nil
	local snapshotError = nil
	if not snapshot then snapshot, snapshotError = self:createCalculationSnapshot(build) end
	if not snapshot then snapshotError.action = "assignOfficialItem"; return snapshotError end
	local target, targetError = self:activateOfficialItemTarget(build, request.target, "POB_ITEM_ASSIGNMENT")
	if not target then return self:restoreCalculationSnapshot(snapshot, targetError) end
	local selectedItem = nil
	local selectedId = 0
	if request.itemId ~= nil then
		selectedId = validInteger(request.itemId)
		if not selectedId or selectedId <= 0 then return self:restoreCalculationSnapshot(snapshot, itemAssignmentInput("itemId", "物品 ID 必须是当前官方物品库中的正整数")) end
		selectedItem = target.itemsTab.items[selectedId]
		if type(selectedItem) ~= "table" or validInteger(selectedItem.id) ~= selectedId then
			return self:restoreCalculationSnapshot(snapshot, itemAssignmentInput("itemId", "物品 ID 不属于当前官方 PoB 物品库"))
		end
		if type(target.itemsTab.IsItemValidForSlot) ~= "function" then
			return self:restoreCalculationSnapshot(snapshot, failure("POB_HEADLESS_API_UNAVAILABLE", "itemsTab:IsItemValidForSlot", "PoB 未暴露官方物品槽位校验接口"))
		end
		if not target.itemsTab:IsItemValidForSlot(selectedItem, target.slotName) then
			return self:restoreCalculationSnapshot(snapshot, itemAssignmentInput("target", "该官方物品不能分配到指定槽位"))
		end
	end
	local assigned, assignmentError = pcall(target.slot.SetSelItemId, target.slot, selectedId)
	if not assigned then return self:restoreCalculationSnapshot(snapshot, failure("POB_ITEM_ASSIGNMENT_FAILED", "slot:SetSelItemId", tostring(assignmentError))) end
	if type(target.itemsTab.PopulateSlots) == "function" then target.itemsTab:PopulateSlots() end
	build.buildFlag = true
	local calculated, calculationError = pcall(build.calcsTab.BuildOutput, build.calcsTab)
	if not calculated then return self:restoreCalculationSnapshot(snapshot, failure("POB_CALCULATION_FAILED", "build.calcsTab:BuildOutput", tostring(calculationError))) end
	local targetOutput = outputScalars(build.calcsTab.mainOutput)
	local result = { success = true, action = "assignOfficialItem", data = { item = nil, output = targetOutput } }
	if selectedItem then
		local projected, projectionError = self:projectOfficialItem(selectedItem)
		if not projected then return self:restoreCalculationSnapshot(snapshot, projectionError) end
		result.data.item = projected
	end
	if target.restoreTarget then
		local restoreError = target.restoreTarget()
		if restoreError then return self:restoreCalculationSnapshot(snapshot, restoreError) end
		build.buildFlag = true
		local recalculated, recalculateError = pcall(build.calcsTab.BuildOutput, build.calcsTab)
		if not recalculated then return self:restoreCalculationSnapshot(snapshot, failure("POB_CALCULATION_FAILED", "build.calcsTab:BuildOutput", tostring(recalculateError))) end
		result.data.output = outputScalars(build.calcsTab.mainOutput)
		result.data.targetOutput = targetOutput
	end
	local exported = self:exportXML()
	if not exported.success then return self:restoreCalculationSnapshot(snapshot, exported) end
	local projection, projectionError = projectBuild(build, request.name, build.calcsTab.mainOutput, self.runtime, true)
	if not projection then return self:restoreCalculationSnapshot(snapshot, projectionError) end
	result.data.xml = exported.data.xml
	result.data.build = projection
	return result
end

function Adapter:deleteOfficialLibraryItem(request)
	local build, unavailable = self:available()
	if not build then unavailable.action = "deleteOfficialItem"; return unavailable end
	if type(request) ~= "table" then return failure("POB_ITEM_DELETE_INVALID", "request", "必须指定要删除的官方物品") end
	local itemId = validInteger(request.itemId)
	if not itemId or itemId <= 0 then return failure("POB_ITEM_DELETE_INVALID", "itemId", "物品 ID 必须是当前官方物品库中的正整数") end
	local itemsTab = build.itemsTab
	if type(itemsTab) ~= "table" or type(itemsTab.items) ~= "table" or type(itemsTab.DeleteItem) ~= "function" then
		return failure("POB_HEADLESS_API_UNAVAILABLE", "itemsTab:DeleteItem", "PoB 未暴露官方物品删除接口")
	end
	local item = itemsTab.items[itemId]
	if type(item) ~= "table" then return failure("POB_ITEM_DELETE_INVALID", "itemId", "物品不属于当前官方 PoB 物品库") end
	for itemSetId, itemSet in pairs(itemsTab.itemSets or {}) do
		for slotName, slot in pairs(itemSet) do
			if type(slot) == "table" and validInteger(slot.selItemId) == itemId then
				return failure("POB_ITEM_DELETE_IN_USE", "itemId", "物品已装备在装备集 "..tostring(itemSetId).." 的 "..tostring(slotName).." 槽位，请先卸下后删除")
			end
		end
	end
	for specId, spec in pairs((build.treeTab and build.treeTab.specList) or {}) do
		for nodeId, jewelId in pairs((type(spec) == "table" and spec.jewels) or {}) do
			if validInteger(jewelId) == itemId then
				return failure("POB_ITEM_DELETE_IN_USE", "itemId", "物品已镶嵌在天赋树 "..tostring(specId).." 的珠宝槽 "..tostring(nodeId).."，请先拔出后删除")
			end
		end
	end
	local snapshot = type(request.canonicalXML) == "string" and request.canonicalXML ~= "" and request.canonicalXML or nil
	local snapshotError = nil
	if not snapshot then snapshot, snapshotError = self:createCalculationSnapshot(build) end
	if not snapshot then snapshotError.action = "deleteOfficialItem"; return snapshotError end
	local deleted, deleteError = pcall(itemsTab.DeleteItem, itemsTab, item)
	if not deleted or itemsTab.items[itemId] ~= nil then
		return self:restoreCalculationSnapshot(snapshot, failure("POB_ITEM_DELETE_FAILED", "itemsTab:DeleteItem", deleted and "官方 PoB 未删除指定物品" or tostring(deleteError)))
	end
	build.buildFlag = true
	local calculated, calculationError = pcall(build.calcsTab.BuildOutput, build.calcsTab)
	if not calculated then return self:restoreCalculationSnapshot(snapshot, failure("POB_CALCULATION_FAILED", "build.calcsTab:BuildOutput", tostring(calculationError))) end
	local exported = self:exportXML()
	if not exported.success then return self:restoreCalculationSnapshot(snapshot, exported) end
	local projection, projectionError = projectBuild(build, request.name, build.calcsTab.mainOutput, self.runtime, true)
	if not projection then return self:restoreCalculationSnapshot(snapshot, projectionError) end
	return { success = true, action = "deleteOfficialItem", data = { removedItemId = itemId, output = outputScalars(build.calcsTab.mainOutput), xml = exported.data.xml, build = projection } }
end

function Adapter:selectOfficialLoadout(request)
	local build, unavailable = self:available()
	if not build then unavailable.action = "selectLoadout"; return unavailable end
	local selection = type(request) == "table" and request.selection or nil
	if type(selection) ~= "table" then return failure("POB_LOADOUT_SELECTION_INVALID", "selection", "必须指定完整的官方 Loadout 选择") end
	local specId = validInteger(selection.specId)
	local itemSetId = validInteger(selection.itemSetId)
	local skillSetId = validInteger(selection.skillSetId)
	local configSetId = validInteger(selection.configSetId)
	local treeTab = build.treeTab
	local itemsTab = build.itemsTab
	local skillsTab = build.skillsTab
	local configTab = build.configTab
	if not specId or not itemSetId or not skillSetId or not configSetId then return failure("POB_LOADOUT_SELECTION_INVALID", "selection", "Loadout 必须包含官方天赋、装备、技能和配置集 ID") end
	if type(treeTab) ~= "table" or type(treeTab.specList) ~= "table" or not treeTab.specList[specId] then return failure("POB_LOADOUT_SELECTION_INVALID", "selection.specId", "指定的官方天赋树不存在") end
	if type(itemsTab) ~= "table" or type(itemsTab.itemSets) ~= "table" or not itemsTab.itemSets[itemSetId] then return failure("POB_LOADOUT_SELECTION_INVALID", "selection.itemSetId", "指定的官方装备集不存在") end
	if type(skillsTab) ~= "table" or type(skillsTab.skillSets) ~= "table" or not skillsTab.skillSets[skillSetId] then return failure("POB_LOADOUT_SELECTION_INVALID", "selection.skillSetId", "指定的官方技能集不存在") end
	if type(configTab) ~= "table" or type(configTab.configSets) ~= "table" or not configTab.configSets[configSetId] then return failure("POB_LOADOUT_SELECTION_INVALID", "selection.configSetId", "指定的官方配置集不存在") end
	if type(build.SetActiveLoadout) ~= "function" then return failure("POB_HEADLESS_API_UNAVAILABLE", "build:SetActiveLoadout", "PoB 未暴露官方 Loadout 切换接口") end
	local snapshot = type(request.canonicalXML) == "string" and request.canonicalXML ~= "" and request.canonicalXML or nil
	local snapshotError = nil
	if not snapshot then snapshot, snapshotError = self:createCalculationSnapshot(build) end
	if not snapshot then return snapshotError end
	local ok, selectionError = pcall(build.SetActiveLoadout, build, { specId = specId, itemSetId = itemSetId, skillSetId = skillSetId, configSetId = configSetId })
	if not ok then return self:restoreCalculationSnapshot(snapshot, failure("POB_LOADOUT_SELECTION_FAILED", "build:SetActiveLoadout", tostring(selectionError))) end
	build.buildFlag = true
	local calculated, calculationError = pcall(build.calcsTab.BuildOutput, build.calcsTab)
	if not calculated then return self:restoreCalculationSnapshot(snapshot, failure("POB_CALCULATION_FAILED", "build.calcsTab:BuildOutput", tostring(calculationError))) end
	local exported = self:exportXML()
	if not exported.success then return self:restoreCalculationSnapshot(snapshot, exported) end
	local projection, projectionError = projectBuild(build, request.name, build.calcsTab.mainOutput, self.runtime, true)
	if not projection then return self:restoreCalculationSnapshot(snapshot, projectionError) end
	return { success = true, action = "selectLoadout", data = { xml = exported.data.xml, build = projection, output = outputScalars(build.calcsTab.mainOutput) } }
end

function Adapter:commitBuildChanges(request)
	local build, unavailable = self:available()
	if not build then unavailable.action = "commitBuildChanges"; return unavailable end
	local changes = type(request) == "table" and request.changes or nil
	if type(changes) ~= "table" then return failure("POB_BUILD_CHANGE_INVALID", "changes", "必须提供官方可保存的构建修改") end
	for key in pairs(changes) do
		if key ~= "level" and key ~= "allocNodes" and key ~= "className" and key ~= "mainSocketGroup" and key ~= "calcsSkillGroup" and key ~= "buffMode" then
			return failure("POB_BUILD_CHANGE_INVALID", "changes."..tostring(key), "不支持的构建修改")
		end
	end
	if not hasCalculationInputs(changes) then return failure("POB_BUILD_CHANGE_INVALID", "changes", "构建修改不能为空") end
	local snapshot = type(request.canonicalXML) == "string" and request.canonicalXML ~= "" and request.canonicalXML or nil
	local snapshotError = nil
	if not snapshot then snapshot, snapshotError = self:createCalculationSnapshot(build) end
	if not snapshot then return snapshotError end
	local applied, inputError = self:applyCalculationInputs(build, changes)
	if not applied then return self:restoreCalculationSnapshot(snapshot, inputError) end
	local calculated, calculationError = pcall(build.calcsTab.BuildOutput, build.calcsTab)
	if not calculated then return self:restoreCalculationSnapshot(snapshot, failure("POB_CALCULATION_FAILED", "build.calcsTab:BuildOutput", tostring(calculationError))) end
	local exported = self:exportXML()
	if not exported.success then return self:restoreCalculationSnapshot(snapshot, exported) end
	local projection, projectionError = projectBuild(build, request.name, build.calcsTab.mainOutput, self.runtime, true)
	if not projection then return self:restoreCalculationSnapshot(snapshot, projectionError) end
	return { success = true, action = "commitBuildChanges", data = { xml = exported.data.xml, build = projection, output = outputScalars(build.calcsTab.mainOutput) } }
end

local function configOptionByVar(runtime, variable)
	local loadModule = type(runtime) == "table" and runtime.LoadModule or nil
	if type(loadModule) ~= "function" then return nil end
	local loaded, optionList = pcall(loadModule, "Modules/ConfigOptions")
	if not loaded or type(optionList) ~= "table" then return nil end
	for _, option in ipairs(optionList) do
		if type(option) == "table" and option.var == variable then return option end
	end
	return nil
end

local function normaliseConfigValue(option, value)
	if option.type == "check" then
		if type(value) ~= "boolean" then return nil, "布尔选项必须使用 true 或 false" end
		return value
	end
	if option.type == "count" or option.type == "countAllowZero" or option.type == "float" or option.type == "integer" then
		if type(value) ~= "number" or value ~= value or value == math.huge or value == -math.huge then return nil, "数值选项必须是有限数字" end
		if option.type == "integer" and value % 1 ~= 0 then return nil, "整数选项不能包含小数" end
		if (option.type == "count" or option.type == "countAllowZero") and value < 0 then return nil, "计数选项不能小于零" end
		return value
	end
	if option.type == "list" then
		for _, choice in ipairs(option.list or {}) do
			if choice.val == value then return value end
		end
		return nil, "选项不属于当前官方版本允许的列表"
	end
	if option.type == "text" then
		if type(value) ~= "string" or #value > 4096 then return nil, "文本选项必须是不超过 4096 字符的字符串" end
		return value
	end
	return nil, "该官方配置项类型暂不支持"
end

function Adapter:commitConfigChange(request)
	local build, unavailable = self:available()
	if not build then unavailable.action = "commitConfigChange"; return unavailable end
	local configTab = build.configTab
	local configSetId = validInteger(type(request) == "table" and request.configSetId)
	local variable = type(request) == "table" and request.variable or nil
	if type(configTab) ~= "table" or type(configTab.configSets) ~= "table" then return failure("POB_HEADLESS_API_UNAVAILABLE", "build.configTab", "PoB 未暴露官方战斗配置") end
	if not configSetId or configTab.activeConfigSetId ~= configSetId or type(configTab.configSets[configSetId]) ~= "table" then return failure("POB_CONFIG_TARGET_INVALID", "configSetId", "只能修改当前已激活的官方战斗配置集") end
	if type(variable) ~= "string" or variable == "" then return failure("POB_CONFIG_CHANGE_INVALID", "variable", "必须指定官方战斗配置项") end
	local option = configOptionByVar(self.runtime, variable)
	if not option then return failure("POB_CONFIG_CHANGE_INVALID", "variable", "该字段不是当前官方 PoB 支持的战斗配置项") end
	local value, valueError
	if request.value == nil or request.value == "" then
		value = nil
	else
		value, valueError = normaliseConfigValue(option, request.value)
		if value == nil then return failure("POB_CONFIG_CHANGE_INVALID", "value", valueError) end
	end
	local snapshot = type(request.canonicalXML) == "string" and request.canonicalXML ~= "" and request.canonicalXML or nil
	local snapshotError = nil
	if not snapshot then snapshot, snapshotError = self:createCalculationSnapshot(build) end
	if not snapshot then return snapshotError end
	configTab.configSets[configSetId].input[variable] = value
	local rebuilt, rebuildError = pcall(configTab.BuildModList, configTab)
	if not rebuilt then return self:restoreCalculationSnapshot(snapshot, failure("POB_CONFIG_REBUILD_FAILED", "build.configTab:BuildModList", tostring(rebuildError))) end
	build.buildFlag = true
	local calculated, calculationError = pcall(build.calcsTab.BuildOutput, build.calcsTab)
	if not calculated then return self:restoreCalculationSnapshot(snapshot, failure("POB_CALCULATION_FAILED", "build.calcsTab:BuildOutput", tostring(calculationError))) end
	local exported = self:exportXML()
	if not exported.success then return self:restoreCalculationSnapshot(snapshot, exported) end
	local projection, projectionError = projectBuild(build, request.name, build.calcsTab.mainOutput, self.runtime, true)
	if not projection then return self:restoreCalculationSnapshot(snapshot, projectionError) end
	return { success = true, action = "commitConfigChange", data = { xml = exported.data.xml, build = projection, output = outputScalars(build.calcsTab.mainOutput) } }
end

local function skillOperationError(path, message)
	return failure("POB_SKILL_CHANGE_INVALID", path, message)
end

local function validSkillIndex(value, groups, path)
	local index = validInteger(value)
	if not index or not groups[index] then return nil, skillOperationError(path, "指定的官方技能组不存在") end
	return index
end

local function applySkillGemPatch(skillsTab, group, gemIndex, patch)
	local gem = group.gemList[gemIndex]
	if type(gem) ~= "table" then return nil, skillOperationError("gemIndex", "指定的官方宝石不存在") end
	if patch.nameSpec ~= nil then
		if type(patch.nameSpec) ~= "string" or patch.nameSpec == "" then return nil, skillOperationError("patch.nameSpec", "宝石名称不能为空") end
		local findError, gemData = skillsTab:FindSkillGem(patch.nameSpec)
		if not gemData then return nil, skillOperationError("patch.nameSpec", tostring(findError or "当前官方 PoB 未识别该宝石")) end
		gem.nameSpec = gemData.name
		gem.gemId = gemData.id
		gem.skillId = gemData.grantedEffectId
		gem.grantedEffect = nil
	end
	for _, field in ipairs({ "level", "quality" }) do
		if patch[field] ~= nil then
			local value = validInteger(patch[field])
			if not value or (field == "level" and value < 1) or (field == "quality" and value < 0) then return nil, skillOperationError("patch."..field, "宝石等级或品质超出官方允许范围") end
			gem[field] = value
		end
	end
	if patch.enabled ~= nil then
		if type(patch.enabled) ~= "boolean" then return nil, skillOperationError("patch.enabled", "宝石启用状态必须为布尔值") end
		gem.enabled = patch.enabled
	end
	local processed, processError = pcall(skillsTab.ProcessSocketGroup, skillsTab, group)
	if not processed then return nil, failure("POB_SKILL_PROCESS_FAILED", "build.skillsTab:ProcessSocketGroup", tostring(processError)) end
	return true
end

function Adapter:commitSkillChange(request)
	local build, unavailable = self:available()
	if not build then unavailable.action = "commitSkillChange"; return unavailable end
	local skillsTab = build.skillsTab
	local skillSetId = validInteger(type(request) == "table" and request.skillSetId)
	local operation = type(request) == "table" and request.operation or nil
	if type(skillsTab) ~= "table" or type(skillsTab.skillSets) ~= "table" or type(skillsTab.ProcessSocketGroup) ~= "function" then return failure("POB_HEADLESS_API_UNAVAILABLE", "build.skillsTab", "PoB 未暴露官方技能编辑接口") end
	if not skillSetId or skillsTab.activeSkillSetId ~= skillSetId or type(skillsTab.skillSets[skillSetId]) ~= "table" then return skillOperationError("skillSetId", "只能修改当前已激活的官方技能集") end
	local groups = skillsTab.skillSets[skillSetId].socketGroupList
	if type(groups) ~= "table" then return failure("POB_HEADLESS_API_UNAVAILABLE", "build.skillsTab.socketGroupList", "当前官方技能集没有技能组") end
	local snapshot = type(request.canonicalXML) == "string" and request.canonicalXML ~= "" and request.canonicalXML or nil
	local snapshotError = nil
	if not snapshot then snapshot, snapshotError = self:createCalculationSnapshot(build) end
	if not snapshot then return snapshotError end
	local function reject(error) return self:restoreCalculationSnapshot(snapshot, error) end
	if operation == "setGroup" then
		local index, indexError = validSkillIndex(request.groupIndex, groups, "groupIndex")
		if not index then return reject(indexError) end
		local group, patch = groups[index], request.patch
		if group.source ~= nil then return reject(skillOperationError("groupIndex", "由物品或天赋提供的技能组不能在此编辑")) end
		if type(patch) ~= "table" then return reject(skillOperationError("patch", "必须提供技能组修改内容")) end
		if patch.label ~= nil then if type(patch.label) ~= "string" or #patch.label > 80 then return reject(skillOperationError("patch.label", "技能组名称必须是不超过 80 字符的文本")) end; group.label = patch.label end
		if patch.enabled ~= nil then if type(patch.enabled) ~= "boolean" then return reject(skillOperationError("patch.enabled", "启用状态必须为布尔值")) end; group.enabled = patch.enabled end
		if patch.includeInFullDPS ~= nil then if type(patch.includeInFullDPS) ~= "boolean" then return reject(skillOperationError("patch.includeInFullDPS", "Full DPS 状态必须为布尔值")) end; group.includeInFullDPS = patch.includeInFullDPS end
		local processed, processError = pcall(skillsTab.ProcessSocketGroup, skillsTab, group)
		if not processed then return reject(failure("POB_SKILL_PROCESS_FAILED", "build.skillsTab:ProcessSocketGroup", tostring(processError))) end
	elseif operation == "setGem" then
		local index, indexError = validSkillIndex(request.groupIndex, groups, "groupIndex")
		if not index then return reject(indexError) end
		if groups[index].source ~= nil then return reject(skillOperationError("groupIndex", "由物品或天赋提供的技能组不能在此编辑")) end
		if type(request.patch) ~= "table" then return reject(skillOperationError("patch", "必须提供宝石修改内容")) end
		local applied, applyError = applySkillGemPatch(skillsTab, groups[index], validInteger(request.gemIndex) or 0, request.patch)
		if not applied then return reject(applyError) end
	elseif operation == "addGem" then
		local index, indexError = validSkillIndex(request.groupIndex, groups, "groupIndex")
		if not index then return reject(indexError) end
		local group, patch = groups[index], request.patch
		if group.source ~= nil then return reject(skillOperationError("groupIndex", "由物品或天赋提供的技能组不能在此编辑")) end
		if type(patch) ~= "table" then return reject(skillOperationError("patch", "必须提供要添加的官方宝石")) end
		local newGem = { nameSpec = "", enabled = true, enableGlobal1 = true, enableGlobal2 = false, count = 1, level = 1, quality = 0 }
		table.insert(group.gemList, newGem)
		local applied, applyError = applySkillGemPatch(skillsTab, group, #group.gemList, patch)
		if not applied then return reject(applyError) end
	elseif operation == "removeGem" then
		local index, indexError = validSkillIndex(request.groupIndex, groups, "groupIndex")
		if not index then return reject(indexError) end
		local group = groups[index]
		if group.source ~= nil then return reject(skillOperationError("groupIndex", "由物品或天赋提供的技能组不能在此编辑")) end
		local gemIndex = validInteger(request.gemIndex)
		if not gemIndex or not group.gemList[gemIndex] then return reject(skillOperationError("gemIndex", "指定的官方宝石不存在")) end
		table.remove(group.gemList, gemIndex)
		local processed, processError = pcall(skillsTab.ProcessSocketGroup, skillsTab, group)
		if not processed then return reject(failure("POB_SKILL_PROCESS_FAILED", "build.skillsTab:ProcessSocketGroup", tostring(processError))) end
	elseif operation == "addGroup" then
		local label = type(request.label) == "string" and request.label or ""
		if #label > 80 then return reject(skillOperationError("label", "技能组名称必须是不超过 80 字符的文本")) end
		local group = { label = label, enabled = true, includeInFullDPS = true, groupCount = 1, gemList = {} }
		table.insert(groups, group)
	elseif operation == "removeGroup" then
		local index, indexError = validSkillIndex(request.groupIndex, groups, "groupIndex")
		if not index then return reject(indexError) end
		if groups[index].source ~= nil then return reject(skillOperationError("groupIndex", "由物品或天赋提供的技能组不能在此删除")) end
		table.remove(groups, index)
		if build.mainSocketGroup and build.mainSocketGroup > #groups then build.mainSocketGroup = #groups > 0 and #groups or 1 end
	elseif operation == "setMain" then
		local index, indexError = validSkillIndex(request.groupIndex, groups, "groupIndex")
		if not index then return reject(indexError) end
		build.mainSocketGroup = index
		if type(build.calcsTab.input) == "table" then build.calcsTab.input.skill_number = index end
	else
		return reject(skillOperationError("operation", "不支持的官方技能编辑操作"))
	end
	skillsTab.socketGroupList = groups
	if type(skillsTab.UpdateGlobalGemCountAssignments) == "function" then skillsTab:UpdateGlobalGemCountAssignments() end
	build.buildFlag = true
	local calculated, calculationError = pcall(build.calcsTab.BuildOutput, build.calcsTab)
	if not calculated then return reject(failure("POB_CALCULATION_FAILED", "build.calcsTab:BuildOutput", tostring(calculationError))) end
	local exported = self:exportXML()
	if not exported.success then return reject(exported) end
	local projection, projectionError = projectBuild(build, request.name, build.calcsTab.mainOutput, self.runtime, true)
	if not projection then return reject(projectionError) end
	return { success = true, action = "commitSkillChange", data = { xml = exported.data.xml, build = projection, output = outputScalars(build.calcsTab.mainOutput) } }
end

function Adapter:applyCalculationInputs(build, request)
	if type(request) ~= "table" then return true end
	local itemsTab = build.itemsTab
	local skillsTab = build.skillsTab
	local spec = build.spec

	if request.level ~= nil then
		local level = validInteger(request.level)
		if not level or level < 1 or level > 100 then
			return nil, unsupportedCalculationInput("level", "level must be an integer between 1 and 100")
		end
		build.characterLevel = level
		build.characterLevelAutoMode = false
		if type(build.configTab) ~= "table" or type(build.configTab.UpdateLevel) ~= "function" or type(build.configTab.BuildModList) ~= "function" then
			return nil, failure("POB_HEADLESS_API_UNAVAILABLE", "build.configTab", "PoB build cannot refresh level-dependent configuration")
		end
		build.configTab:UpdateLevel()
		build.configTab:BuildModList()
	end

	local requestedNodes = request.allocNodes
	local requestedClassName = request.className
	if requestedNodes ~= nil or requestedClassName ~= nil then
		if type(spec) ~= "table" or type(spec.ImportFromNodeList) ~= "function" or type(spec.nodes) ~= "table" then
			return nil, failure("POB_HEADLESS_API_UNAVAILABLE", "build.spec:ImportFromNodeList", "PoB build cannot apply passive tree changes")
		end
		local nodeIds = {}
		if requestedNodes ~= nil then
			if type(requestedNodes) ~= "table" then
				return nil, unsupportedCalculationInput("allocNodes", "allocNodes must be an array of current-tree node ids")
			end
			local seen = {}
			for index, rawNodeId in ipairs(requestedNodes) do
				local nodeId = validInteger(rawNodeId)
				if not nodeId or not spec.nodes[nodeId] then
					return nil, unsupportedCalculationInput("allocNodes["..index.."]", "node id is not present in the loaded PoB passive tree")
				end
				if not seen[nodeId] then
					seen[nodeId] = true
					table.insert(nodeIds, nodeId)
				end
			end
		else
			for nodeId in pairs(spec.allocNodes or {}) do table.insert(nodeIds, nodeId) end
		end
		local className = requestedClassName
		if requestedClassName ~= nil and (type(requestedClassName) ~= "string" or requestedClassName == "") then
			return nil, unsupportedCalculationInput("className", "className must be a PoB class name")
		end
		if className == spec.curClassName then className = nil end
		if className ~= nil then
			local tree = spec.tree
			local knownClass = type(tree) == "table" and (
				(type(tree.classNameMap) == "table" and tree.classNameMap[className]) or
				(type(tree.ascendNameMap) == "table" and tree.ascendNameMap[className]) or
				(type(tree.internalAscendNameMap) == "table" and tree.internalAscendNameMap[className])
			)
			if not knownClass then
				return nil, unsupportedCalculationInput("className", "className is not available in the loaded PoB passive tree")
			end
		end
		local weaponSets = {}
		for nodeId, node in pairs(spec.allocNodes or {}) do
			if node and node.allocMode and node.allocMode ~= 0 then weaponSets[nodeId] = node.allocMode end
		end
		spec:ImportFromNodeList(className, spec.curClassId, spec.curAscendClassId, spec.curSecondaryAscendClassId,
			nodeIds, weaponSets, spec.hashOverrides or {}, spec.masterySelections or {}, spec.treeVersion)
		if type(itemsTab) == "table" and type(itemsTab.UpdateSockets) == "function" then itemsTab:UpdateSockets() end
	end

	if request.socketGroups ~= nil then
		if type(skillsTab) ~= "table" or type(skillsTab.socketGroupList) ~= "table" or type(skillsTab.ProcessSocketGroup) ~= "function" then
			return nil, failure("POB_HEADLESS_API_UNAVAILABLE", "build.skillsTab", "PoB build cannot apply skill changes")
		end
		if type(request.socketGroups) ~= "table" or #request.socketGroups ~= #skillsTab.socketGroupList then
			return nil, unsupportedCalculationInput("socketGroups", "adding, removing, or replacing official PoB skill groups is not supported")
		end
		for groupIndex, requestedGroup in ipairs(request.socketGroups) do
			local group = skillsTab.socketGroupList[groupIndex]
			if type(requestedGroup) ~= "table" or type(requestedGroup.gems) ~= "table" or #requestedGroup.gems ~= #(group.gemList or {}) then
				return nil, unsupportedCalculationInput("socketGroups["..groupIndex.."]", "adding, removing, or replacing official PoB gems is not supported")
			end
			group.enabled = requestedGroup.enabled ~= false
			group.includeInFullDPS = requestedGroup.includeInFullDPS ~= false
			for gemIndex, requestedGem in ipairs(requestedGroup.gems) do
				local gem = group.gemList[gemIndex]
				if type(requestedGem) ~= "table" or type(gem) ~= "table" then
					return nil, unsupportedCalculationInput("socketGroups["..groupIndex.."].gems["..gemIndex.."]", "gem must match the loaded official PoB gem")
				end
				local requestedName = requestedGem.name or requestedGem.nameSpec
				if requestedName ~= nil and requestedName ~= gem.nameSpec then
					return nil, unsupportedCalculationInput("socketGroups["..groupIndex.."].gems["..gemIndex.."].name", "replacing an official PoB gem is not supported")
				end
				if requestedGem.skillId ~= nil and gem.skillId ~= nil and requestedGem.skillId ~= gem.skillId then
					return nil, unsupportedCalculationInput("socketGroups["..groupIndex.."].gems["..gemIndex.."].skillId", "replacing an official PoB gem is not supported")
				end
				if requestedGem.level ~= nil then
					local level = validInteger(requestedGem.level)
					if not level or level < 1 then return nil, unsupportedCalculationInput("socketGroups["..groupIndex.."].gems["..gemIndex.."].level", "gem level must be a positive integer") end
					gem.level = level
				end
				if requestedGem.quality ~= nil then
					local quality = validInteger(requestedGem.quality)
					if not quality or quality < 0 then return nil, unsupportedCalculationInput("socketGroups["..groupIndex.."].gems["..gemIndex.."].quality", "gem quality must be a non-negative integer") end
					gem.quality = quality
				end
				if requestedGem.enabled ~= nil then gem.enabled = requestedGem.enabled == true end
			end
			skillsTab:ProcessSocketGroup(group)
		end
	end

	if request.mainSocketGroup ~= nil then
		local index = validInteger(request.mainSocketGroup)
		if not index or type(skillsTab) ~= "table" or type(skillsTab.socketGroupList) ~= "table" or not skillsTab.socketGroupList[index] then
			return nil, unsupportedCalculationInput("mainSocketGroup", "mainSocketGroup must refer to a loaded official PoB skill group")
		end
		build.mainSocketGroup = index
	end

	if request.calcsSkillGroup ~= nil then
		local index = validInteger(request.calcsSkillGroup)
		if not index or type(skillsTab) ~= "table" or type(skillsTab.socketGroupList) ~= "table" or not skillsTab.socketGroupList[index] then
			return nil, unsupportedCalculationInput("calcsSkillGroup", "calcsSkillGroup must refer to a loaded official PoB skill group")
		end
		if type(build.calcsTab.input) ~= "table" then
			return nil, failure("POB_HEADLESS_API_UNAVAILABLE", "build.calcsTab.input", "PoB build cannot select a calculation skill group")
		end
		build.calcsTab.input.skill_number = index
	end

	if request.buffMode ~= nil then
		local allowed = { EFFECTIVE = true, COMBAT = true, BUFFED = true, UNBUFFED = true }
		if not allowed[request.buffMode] then
			return nil, unsupportedCalculationInput("buffMode", "buffMode must be EFFECTIVE, COMBAT, BUFFED, or UNBUFFED")
		end
		if type(build.calcsTab.input) ~= "table" then
			return nil, failure("POB_HEADLESS_API_UNAVAILABLE", "build.calcsTab.input", "PoB build cannot apply calculation mode")
		end
		build.calcsTab.input.misc_buffMode = request.buffMode
	end

	build.buildFlag = true
	return true
end

function Adapter:createCalculationSnapshot(build)
	if type(build.SaveDB) ~= "function" then
		return nil, failure("POB_HEADLESS_API_UNAVAILABLE", "build:SaveDB", "PoB build cannot create a calculation transaction snapshot")
	end
	if type(self.runtime.loadBuildFromXML) ~= "function" then
		return nil, failure("POB_HEADLESS_API_UNAVAILABLE", "loadBuildFromXML", "PoB cannot restore a calculation transaction snapshot")
	end
	local ok, xml = pcall(build.SaveDB, build, "pob-cn-calculation-snapshot.xml")
	if not ok or type(xml) ~= "string" or xml == "" then
		return nil, failure("POB_CALC_TRANSACTION_SNAPSHOT_FAILED", "build:SaveDB", ok and "PoB did not return calculation snapshot XML" or tostring(xml))
	end
	return xml
end

function Adapter:restoreCalculationSnapshot(xml, originalError)
	local ok, err = pcall(self.runtime.loadBuildFromXML, xml, "")
	if not ok then
		return failure("POB_CALC_TRANSACTION_RESTORE_FAILED", "loadBuildFromXML", tostring(err))
	end
	local restored, unavailable = self:available()
	if not restored then
		return failure("POB_CALC_TRANSACTION_RESTORE_FAILED", "loadBuildFromXML", unavailable.error.message)
	end
	return originalError
end

function Adapter:calculate(action, request)
	local build, unavailable = self:available()
	if not build then
		unavailable.action = action
		return unavailable
	end
	local snapshot = nil
	if hasCalculationInputs(request) then
		snapshot, unavailable = self:createCalculationSnapshot(build)
		if not snapshot then
			unavailable.action = action
			return unavailable
		end
	end
	local applyOk, applied, inputError = pcall(self.applyCalculationInputs, self, build, request)
	if not applyOk then
		local result = failure("POB_CALC_INPUT_APPLICATION_FAILED", "build", tostring(applied))
		return snapshot and self:restoreCalculationSnapshot(snapshot, result) or result
	end
	if not applied then return snapshot and self:restoreCalculationSnapshot(snapshot, inputError) or inputError end
	local ok, err = pcall(function()
		build.calcsTab:BuildOutput()
	end)
	if not ok then
		local result = failure("POB_CALCULATION_FAILED", "build.calcsTab:BuildOutput", tostring(err))
		return snapshot and self:restoreCalculationSnapshot(snapshot, result) or result
	end
	if type(build.calcsTab.mainOutput) ~= "table" then
		local result = failure("POB_HEADLESS_API_UNAVAILABLE", "build.calcsTab.mainOutput", "PoB calculation did not produce mainOutput")
		return snapshot and self:restoreCalculationSnapshot(snapshot, result) or result
	end
	return {
		success = true,
		action = action,
		output = outputScalars(build.calcsTab.mainOutput),
		skillBreakdown = projectBreakdown(build),
	}
end

function Adapter:requireLoadedBuild(action)
	local build = self:currentBuild()
	if type(build) ~= "table" or type(build.savers) ~= "table" then
		return nil, failure("POB_BUILD_LOAD_INCOMPLETE", "build.savers", "PoB requires build conversion or did not finish loading the imported XML")
	end
	return build
end

function Adapter:exportXML()

	local build, unavailable = self:available()
	if not build then
		unavailable.action = "exportXML"
		return unavailable
	end
	if type(build.SaveDB) ~= "function" then
		return failure("POB_HEADLESS_API_UNAVAILABLE", "build:SaveDB", "PoB build cannot export XML")
	end
	local ok, xml = pcall(build.SaveDB, build, "pob-cn-export.xml")
	if not ok then
		return failure("POB_BUILD_EXPORT_FAILED", "build:SaveDB", tostring(xml))
	end
	if type(xml) ~= "string" or xml == "" then
		return failure("POB_BUILD_EXPORT_FAILED", "build:SaveDB", "PoB did not return build XML")
	end
	return { success = true, action = "exportXML", data = { xml = xml } }
end

function Adapter:execute(request)
	local action = type(request) == "table" and request.action or nil
	if action == "ping" then
		return { success = true, action = action, pong = true, calculator = self:status() }
	end
	if action == "newBuild" then
		local _, unavailable = self:available()
		if unavailable then
			unavailable.action = action
			return unavailable
		end
		local ok, err = pcall(self.runtime.newBuild)
		if not ok then
			return failure("POB_BUILD_CREATE_FAILED", "newBuild", tostring(err))
		end
		local _, incomplete = self:requireLoadedBuild(action)
		if incomplete then return incomplete end
		return self:calculate(action, request)
	end
	if action == "loadXML" then
		if type(request.xml) ~= "string" or request.xml == "" then
			return failure("POB_INVALID_REQUEST", "xml", "xml is required")
		end
		local _, unavailable = self:available()
		if unavailable then
			unavailable.action = action
			return unavailable
		end
		local ok, err = pcall(self.runtime.loadBuildFromXML, request.xml, request.name or "")
		if not ok then
			return failure("POB_BUILD_LOAD_FAILED", "loadBuildFromXML", tostring(err))
		end
		local _, incomplete = self:requireLoadedBuild(action)
		if incomplete then return incomplete end
		local calculated = self:calculate(action)
		if not calculated.success then return calculated end
		-- calculate already built the complete official breakdown for this exact
		-- BuildOutput. Reuse it for the import projection instead of running the
		-- expensive Tabulate and detailed breakdown traversal a second time.
		local data, projectionError = projectBuild(self:currentBuild(), request.name, calculated.output, self.runtime, nil, calculated.skillBreakdown)
		if not data then
			projectionError.action = action
			return projectionError
		end
		calculated.data = data
		return calculated
	end
	if action == "exportXML" then
		return self:exportXML()
	end
	if action == "assignOfficialItem" then
		return self:assignOfficialItem(request)
	end
	if action == "deleteOfficialItem" then
		return self:deleteOfficialLibraryItem(request)
	end
	if action == "craftPreview" then
		return self:previewCraftDraft(request)
	end
	if action == "craftCommit" then
		return self:commitCraftDraft(request)
	end
	if action == "craftOptions" then
		return self:craftOptions(request)
	end
	if action == "craftCatalog" then
		return self:craftCatalog(request)
	end
	if action == "selectLoadout" then
		return self:selectOfficialLoadout(request)
	end
	if action == "commitBuildChanges" then
		return self:commitBuildChanges(request)
	end
	if action == "commitConfigChange" then
		return self:commitConfigChange(request)
	end
	if action == "commitSkillChange" then
		return self:commitSkillChange(request)
	end
	if action == "calculate" or action == "getStats" then
		return self:calculate(action, request)
	end
	return failure("POB_UNSUPPORTED_ACTION", "action", "unsupported action")
end

return Adapter
