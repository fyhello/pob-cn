-- 传奇只编辑官方模板/原物品；普通制作与保存事务仍由适配器负责。
local Unique = {}
local variantFields = { "variant", "variantAlt", "variantAlt2", "variantAlt3", "variantAlt4", "variantAlt5" }
local sections = { "enchantModLines", "runeModLines", "classRequirementModLines", "implicitModLines", "explicitModLines" }

local function invalid(path, message)
	return { success = false, error = { code = "POB_UNIQUE_DRAFT_INVALID", path = path, message = message } }
end

local function integer(value)
	return type(value) == "number" and value == value and value ~= math.huge and value ~= -math.huge and value % 1 == 0
end

local function list(value)
	if type(value) ~= "table" then return false end
	for key in pairs(value) do if not integer(key) or key < 1 or key > #value then return false end end
	return true
end

local function database(runtime)
	local db = runtime.main and runtime.main.uniqueDB
	if type(db) ~= "table" or db.loading or type(db.list) ~= "table" then
		error("当前官方传奇目录尚未就绪")
	end
	return db.list
end

function Unique.catalog(runtime)
	local ok, result = pcall(function()
		local rows = {}
		for id, item in pairs(database(runtime)) do
			rows[#rows + 1] = { id = id, name = item.title or item.name, baseName = item.baseName, type = item.type, source = item.source, league = item.league }
		end
		table.sort(rows, function(a, b) return a.id < b.id end)
		return { success = true, action = "craftCatalog", data = { uniques = rows } }
	end)
	return ok and result or invalid("catalog", tostring(result))
end

local function activeVariants(item)
	local result = {}
	if item.variantList then
		for index, field in ipairs(variantFields) do
			if index == 1 or item["hasAltVariant" .. (index == 2 and "" or index - 1)] then
				result[#result + 1] = { field = field, value = item[field] }
			end
		end
	end
	return result
end

-- 行索引仅在同一官方结构内有效；变体/符文改变后不能把旧滑块写到另一条词缀。
local function rangeOptions(item)
	local active, rows, refs, basis = {}, {}, {}, {}
	local function stamp(value)
		value = tostring(value)
		basis[#basis + 1] = #value .. ":" .. value
	end
	stamp(item.name)
	for _, entry in ipairs(activeVariants(item)) do stamp(entry.field); stamp(entry.value) end
	for _, line in ipairs(item.rangeLineList or {}) do active[line] = true end
	for _, section in ipairs(sections) do
		for index, line in ipairs(item[section] or {}) do
			if active[line] then
				local id = section .. ":" .. index
				rows[#rows + 1] = { id = id, line = line.line, roll = line.range }
				refs[id] = line
				stamp(id); stamp(line.line); stamp(line.corruptedRange)
			end
		end
	end
	return rows, refs, table.concat(basis)
end

local function withDisplayItem(itemsTab, item, fn)
	local original = itemsTab.displayItem
	local showStatDifferences = itemsTab.showStatDifferences
	itemsTab.displayItem = item
	itemsTab.showStatDifferences = false
	local ok, result, detail = pcall(fn)
	itemsTab.displayItem = original
	itemsTab.showStatDifferences = showStatDifferences
	if not ok then error(result) end
	return result, detail
end

local function capabilities(itemsTab, item)
	return withDisplayItem(itemsTab, item, function()
		local controls = assert(itemsTab.controls, "官方物品编辑控件不可用")
		local function shown(name)
			local control = assert(controls[name], "缺少官方控件 " .. name)
			return control:IsShown() and true or false
		end
		local function numeric(name, value)
			local control = assert(controls[name])
			assert(control.filter == "%D" and integer(control.limit), "官方数值输入契约不可用")
			return { canSet = shown(name), value = value, min = 0, max = 10 ^ control.limit - 1 }
		end
		local socket = numeric("displayItemSocketRuneEdit", item.itemSocketCount)
		local socketLimit = 0
		while controls["displayItemRune" .. (socketLimit + 1)] do socketLimit = socketLimit + 1 end
		socket.max = socketLimit
		local catalyst = { canSet = shown("displayItemCatalyst"), value = item.catalyst or 0, allowed = {}, quality = numeric("displayItemCatalystQualityEdit", item.catalystQuality) }
		if catalyst.canSet then
			for index, label in ipairs(controls.displayItemCatalyst.list) do
				catalyst.allowed[#catalyst.allowed + 1] = { id = index - 1, name = label }
			end
		end
		return { quality = numeric("displayItemQualityEdit", item.quality), socketCount = socket, catalyst = catalyst }
	end)
end

local function validateNumeric(value, cap, path)
	if not cap.canSet or not integer(value) or value < cap.min or value > cap.max then
		return invalid(path, "数值超出当前传奇的官方编辑范围")
	end
end

function Unique.create(adapter, draft, itemsTab, source)
	local fields = { kind = true, templateId = true, variants = true, ranges = true, rangeBasis = true, quality = true, socketCount = true, runes = true, catalyst = true, catalystQuality = true, corruption = true }
	for key in pairs(draft) do
		if not fields[key] then return nil, invalid("draft." .. tostring(key), "传奇制作不接受该字段") end
	end
	if draft.runes ~= nil and not list(draft.runes) then return nil, invalid("draft.runes", "符文必须是连续列表") end
	if source and (source.rarity ~= "UNIQUE" or draft.templateId ~= nil) then
		return nil, invalid("sourceItemId", "编辑传奇必须保留原物品，不能同时替换传奇模板")
	end
	local ok, result, issue, runes, options = pcall(function()
		local runtime = adapter.runtime
		local template = not source and database(runtime)[draft.templateId] or nil
		if not source and not template then return nil, invalid("draft.templateId", "请选择当前官方传奇目录中的物品") end
		local item = runtime.new("Item", source and source:BuildRaw() or template.raw)
		if not item.base or item.rarity ~= "UNIQUE" then return nil, invalid("draft", "官方核心无法解析该传奇") end
		if not source then item:NormaliseQuality() end
		local selectable = {}
		for _, entry in ipairs(activeVariants(item)) do selectable[entry.field] = true end
		if draft.variants ~= nil then
			if type(draft.variants) ~= "table" then return nil, invalid("draft.variants", "传奇变体必须是官方选项") end
			for field, value in pairs(draft.variants) do
				if not selectable[field] or not integer(value) or value < 1 or value > #item.variantList then
					return nil, invalid("draft.variants", "变体不在当前传奇的官方选项中")
				end
				item[field] = value
			end
		end
		item:BuildAndParseRaw()
		local caps = capabilities(itemsTab, item)
		for _, field in ipairs({ "quality", "socketCount" }) do
			if draft[field] ~= nil then
				local err = validateNumeric(draft[field], caps[field], "draft." .. field)
				if err then return nil, err end
				if field == "quality" then item.quality = draft.quality else item.itemSocketCount = draft.socketCount; item:UpdateRunes() end
			end
		end
		if draft.catalyst ~= nil then
			if not caps.catalyst.canSet or not integer(draft.catalyst) or draft.catalyst < 0 or draft.catalyst >= #caps.catalyst.allowed then
				return nil, invalid("draft.catalyst", "催化剂不在当前传奇的官方选项中")
			end
			-- 默认品质由官方选择回调决定；浮窗及输入控件保持为临时编辑状态。
			local tooltip, edit = itemsTab.displayItemTooltip, itemsTab.controls.displayItemCatalystQualityEdit
			local text = edit.buf
			local mutated = item.mutated
			itemsTab.displayItemTooltip = runtime.new("Tooltip")
			local selected, selectionError = pcall(withDisplayItem, itemsTab, item, function()
				itemsTab.controls.displayItemCatalyst.selFunc(draft.catalyst + 1)
			end)
			itemsTab.displayItemTooltip = tooltip
			edit:SetText(text)
			item.mutated = mutated
			if not selected then error(selectionError) end
		end
		if draft.catalystQuality ~= nil then
			caps = capabilities(itemsTab, item)
			local err = validateNumeric(draft.catalystQuality, caps.catalyst.quality, "draft.catalystQuality")
			if err then return nil, err end
			item.catalystQuality = draft.catalystQuality
		end
		item:BuildAndParseRaw()
		local runeCaps, runeError = adapter:applyStrictCraftRunes(itemsTab, item, draft)
		if not runeCaps then return nil, runeError end
		local _, refs, basis = rangeOptions(item)
		if draft.ranges ~= nil then
			if not list(draft.ranges) or draft.rangeBasis ~= basis then
				return nil, invalid("draft.ranges", "传奇词条结构已变化，请重新读取当前可调范围")
			end
			local seen = {}
			for _, range in ipairs(draft.ranges) do
				if type(range) ~= "table" or not refs[range.id] or seen[range.id] or type(range.roll) ~= "number" or range.roll ~= range.roll or range.roll < 0 or range.roll > 1 then
					return nil, invalid("draft.ranges", "词条位置或数值不属于当前传奇的官方可调范围")
				end
				seen[range.id] = true
				refs[range.id].range = range.roll
			end
			item:BuildAndParseRaw()
		end
		local ranges, _, rangeBasis = rangeOptions(item)
		caps = capabilities(itemsTab, item)
		caps.variants = activeVariants(item)
		caps.variantList = item.variantList or {}
		caps.allowDuplicateVariants = item.allowDuplicateVariants == true
		caps.ranges, caps.rangeBasis = ranges, rangeBasis
		caps.runeCapabilities = runeCaps
		caps.runes = item.runes
		-- 普通调值保留原行身份；腐化新增词条的范围与显式倍率由独立能力负责。
		local originalEnchants = item.enchantModLines
		caps.corruption = dofile('../cn/lua/unique-corruption.lua').apply(runtime, itemsTab, item, draft.corruption)
		if caps.corruption.modsCanSet then
			local ordinary = {}
			for _, range in ipairs(caps.ranges) do
				local index = tonumber(range.id:match('^enchantModLines:(%d+)$'))
				if not index or originalEnchants[index].line:match('^Allocates .*') then ordinary[#ordinary + 1] = range end
			end
			caps.ranges = ordinary
		end
		return item, nil, runeCaps, caps
	end)
	if not ok then return nil, invalid("draft", "官方传奇编辑失败：" .. tostring(result)) end
	return result, issue, runes, options
end

function Unique.options(adapter, request, validTargets)
	local itemsTab = adapter:currentBuild().itemsTab
	local operation = request.actionMode or request.operation
	if operation ~= "create" and operation ~= "edit" and operation ~= "duplicate" then return invalid("action", "必须指定传奇新建、编辑或复制操作") end
	local source
	if operation ~= "create" then
		if not integer(request.sourceItemId) or request.sourceItemId <= 0 then return invalid("sourceItemId", "缺少当前官方物品 ID") end
		source = itemsTab.items[request.sourceItemId]
		if not source then return invalid("sourceItemId", "当前官方物品库中不存在该物品") end
	end
	local item, err, _, options = Unique.create(adapter, request.draft, itemsTab, source)
	if not item then return err end
	local projected, projectionError = withDisplayItem(itemsTab, item, function() return adapter:projectOfficialItem(item, true) end)
	if not projected then return projectionError end
	-- 关闭原生差异显示后追加的桌面快捷键提示不适用于网页。
	local tooltip = projected.tooltip
	if tooltip and tooltip.bodyLines[#tooltip.bodyLines] == 'Tip: Press Ctrl+D to enable the display of stat differences.' then
		table.remove(tooltip.bodyLines)
		table.remove(tooltip.bodyLineUnsupported)
	end
	options.item = projected
	options.validTargetSlots = validTargets(itemsTab, item)
	return { success = true, action = "craftOptions", data = options }
end

return Unique
