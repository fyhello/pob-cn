-- 腐化能力取自官方编辑器；只操作传奇构造器的临时物品，不运行桌面保存回调。
local Corruption = {}

local function reject(message)
	error(message, 0)
end

local function fields(value, allowed)
	if type(value) ~= "table" then reject("腐化草稿必须是结构化对象") end
	for key in pairs(value) do if not allowed[key] then reject("不支持的腐化字段：" .. tostring(key)) end end
end

local function array(value)
	if type(value) ~= "table" then reject("腐化选项必须是连续列表") end
	for key in pairs(value) do
		if type(key) ~= "number" or key % 1 ~= 0 or key < 1 or key > #value then reject("腐化选项必须是连续列表") end
	end
end

local function roll(value)
	if type(value) ~= "number" or value ~= value or value < 0 or value > 1 then reject("腐化调值超出官方归一化范围") end
	return value
end

local function selectionError(entries, source, mods)
	if #entries > source.maxMods then return "腐化词缀数量超过当前官方来源的上限" end
	local allowed, groups = {}, {}
	for _, mod in ipairs(source.mods) do allowed[mod.id] = true end
	for _, entry in ipairs(entries) do
		fields(entry, { id = true, roll = true })
		if not allowed[entry.id] then return "腐化词缀不适用于当前底材或来源" end
		local mod = mods[entry.id]
		if groups[mod.group] then return "不能重复选择同组腐化词缀" end
		groups[mod.group] = true
		if type(entry.roll) ~= "number" or entry.roll ~= entry.roll or entry.roll < 0 or entry.roll > 1 then return "腐化调值超出官方归一化范围" end
	end
end

local function basis(item)
	local parts = {}
	local function add(value)
		value = tostring(value)
		parts[#parts + 1] = #value .. ":" .. value
	end
	add(item.name); add(item.baseName); add(item.corrupted); add(item.uniqueID)
	for _, field in ipairs({ "variant", "variantAlt", "variantAlt2", "variantAlt3", "variantAlt4", "variantAlt5" }) do add(item[field]) end
	for _, section in ipairs({ "enchantModLines", "explicitModLines" }) do
		for index, line in ipairs(item[section]) do
			add(section); add(index); add(line.line); add(line.corruptedRange); add(item:GetModLineVariantCount(line))
		end
	end
	return table.concat(parts)
end

-- 已导入的固定文本不反推范围或偷偷替换模板。无法唯一识别时保留原附魔并关闭替换入口。
local function identify(item, mods, defaultRoll)
	local selected, occupied, source = {}, {}, nil
	for index, line in ipairs(item.enchantModLines) do
		if not occupied[index] and not line.line:match("^Allocates .*") then
			if line.variantList or line.corruptedRange or (line.valueScalar and line.valueScalar ~= 1) or line.fractured or line.desecrated then return {}, false, nil end
			local matches = {}
			for id, mod in pairs(mods) do
				local indices, used, value = {}, {}, nil
				for _, text in ipairs(mod) do
					local found
					for other, candidate in ipairs(item.enchantModLines) do
						if not occupied[other] and not used[other] and candidate.line == text then found = other; break end
					end
					if not found then indices = {}; break end
					local current = item.enchantModLines[found].range or defaultRoll
					if value ~= nil and value ~= current then indices = {}; break end
					value = current; used[found] = true; indices[#indices + 1] = found
				end
				if used[index] and #indices == #mod then matches[#matches + 1] = { id = id, roll = value, indices = indices, source = mod.type } end
			end
			if #matches ~= 1 then return {}, false, nil end
			local match = matches[1]
			if source and source ~= match.source then return {}, false, nil end
			source = match.source
			selected[#selected + 1] = { id = match.id, roll = match.roll }
			for _, other in ipairs(match.indices) do occupied[other] = true end
		end
	end
	return selected, true, source
end

local function withEditor(runtime, itemsTab, item, fn)
	local main = runtime.main
	local display, open, popups = itemsTab.displayItem, main.OpenPopup, main.popups
	local controls
	-- 桌面弹窗会对所有隐藏变体测试缩放；能力探测只需当前行，原物品的行及编号保持不变。
	local probe = runtime.new("Item", item:BuildRaw())
	local active, indices = {}, {}
	for index, line in ipairs(probe.explicitModLines) do
		if probe:GetModLineVariantCount(line) > 0 then active[#active + 1] = line; indices[#indices + 1] = index end
	end
	probe.explicitModLines = active
	itemsTab.displayItem = probe
	main.popups = { {} }
	main.OpenPopup = function(_, _, _, _, value) controls = value end
	local ok, result = pcall(function()
		itemsTab:CorruptDisplayItem()
		assert(controls and controls.source and controls.enchant1, "官方腐化控件契约不可用")
		return fn(controls, indices)
	end)
	itemsTab.displayItem, main.OpenPopup, main.popups = display, open, popups
	if not ok then error(result, 0) end
	return result
end

function Corruption.apply(runtime, itemsTab, item, draft)
	local caps = { canSet = item.corruptible == true and not item.mirrored and not item.sanctified, corrupted = item.corrupted == true, inherited = item.corrupted == true, basis = basis(item), sources = {}, selected = {}, ranges = {} }
	if not caps.canSet then
		caps.reason = "当前物品不开放腐化编辑，已有状态保持不变。"
		if draft ~= nil then reject(caps.reason) end
		return caps
	end
	if draft ~= nil then
		fields(draft, { basis = true, source = true, mods = true, ranges = true })
		if draft.basis ~= caps.basis then reject("物品或变体已变化，请重新读取腐化选项") end
		if draft.source ~= nil and type(draft.source) ~= "string" then reject("腐化来源必须是官方来源标识") end
		if draft.mods ~= nil then array(draft.mods) end
		if draft.ranges ~= nil then array(draft.ranges) end
	end
	local mods = assert(runtime.data.itemMods.Corruption, "官方腐化词缀库不可用")
	caps.defaultModRoll = runtime.main.defaultItemAffixQuality
	local selected, editable, currentSource = identify(item, mods, runtime.main.defaultItemAffixQuality)
	caps.selected, caps.modsCanSet = selected, editable
	if not editable then caps.reason = "已有附魔缺少可唯一识别的腐化元数据，保留原文；仅可调整下方官方支持的倍率。" end
	local modIds = {}
	for id, mod in pairs(mods) do modIds[mod] = id end
	return withEditor(runtime, itemsTab, item, function(controls, indices)
		local bySource = {}
		local defaultSource = controls.source.list[controls.source.selIndex]
		for index, name in ipairs(controls.source.list) do
			controls.source.selFunc(index, name)
			local source = { id = name, name = name, maxMods = 0, mods = {} }
			local count = 1
			while controls["enchant" .. count] do
				if controls["enchant" .. count].shown then source.maxMods = source.maxMods + 1 end
				count = count + 1
			end
			for _, option in ipairs(controls.enchant1.list) do
				if option.mod then
					local mod = option.mod
					source.mods[#source.mods + 1] = { id = assert(modIds[mod]), lines = { unpack(mod) }, group = mod.group }
					if currentSource == mod.type then caps.source = name end
				end
			end
			caps.sources[#caps.sources + 1] = source
			bySource[name] = source
		end
		caps.source = caps.source or defaultSource
		if editable and selectionError(selected, bySource[caps.source], mods) then
			editable, caps.modsCanSet = false, false
			caps.reason = "已有腐化词缀不符合当前核心的候选规则，原有内容保留，不能通过此入口替换。"
		end
		local wantedSource = draft and draft.source or caps.source
		local source = bySource[wantedSource]
		if not source then reject("腐化来源不适用于当前底材") end
		if draft and draft.source ~= nil and draft.mods == nil and wantedSource ~= caps.source then reject("切换腐化来源时必须明确选择当前来源的词缀") end
		local wanted = draft and draft.mods or selected
		if draft and draft.mods ~= nil and not editable then reject(caps.reason) end
		if editable then
			local issue = selectionError(wanted, source, mods)
			if issue then reject(issue) end
		end
		local rangeRefs = {}
		for probeIndex, index in ipairs(indices) do
			local line = item.explicitModLines[index]
			local slider = controls["rollRangeSlider" .. probeIndex]
			if slider then
				local id = "explicitModLines:" .. index
				local row = { id = id, roll = slider.val }
				caps.ranges[#caps.ranges + 1] = row
				rangeRefs[id] = { line = line, slider = slider, label = controls["rollRangeValue" .. probeIndex], row = row }
			end
		end
		if draft and draft.ranges then
			local seen = {}
			for _, entry in ipairs(draft.ranges) do
				fields(entry, { id = true, roll = true })
				local ref = rangeRefs[entry.id]
				if not ref or seen[entry.id] then reject("腐化倍率不属于当前变体的可调词条") end
				seen[entry.id] = true
				-- 官方回调负责归一化滑块到倍率的映射；1 倍必须清除旧倍率，不能跳过赋值。
				ref.slider.changeFunc(roll(entry.roll))
				local value = assert(tonumber((runtime.StripEscapes(ref.label.label))), "官方腐化倍率不可读")
				ref.line.corruptedRange = value ~= 1 and value or nil
				ref.row.roll = entry.roll
			end
		end
		if draft and draft.mods ~= nil then
			local enchants, retained = {}, {}
			for _, line in ipairs(item.enchantModLines) do if line.line:match("^Allocates .*") then retained[#retained + 1] = line end end
			for _, entry in ipairs(wanted) do
				local mod = mods[entry.id]
				for index, text in ipairs(mod) do
					-- 与 ItemsTab.applyCorruptionMods 使用相同官方行、标签、排序；范围由 Item 解析。
					local prefix = #mod.modTags > 0 and "{tags:" .. table.concat(mod.modTags, ",") .. "}" or ""
					enchants[#enchants + 1] = { line = prefix .. text, enchant = true, range = entry.roll, order = mod.statOrder[index] }
				end
			end
			table.sort(enchants, function(a, b) return a.order < b.order end)
			for _, line in ipairs(enchants) do line.order = nil end
			for _, line in ipairs(retained) do enchants[#enchants + 1] = line end
			item.enchantModLines = enchants
		end
		if draft then item.corrupted = true end
		for _, row in ipairs(caps.ranges) do
			local line = rangeRefs[row.id].line
			row.value = line.corruptedRange or 1
			row.line = runtime.itemLib.applyRange(line.line, line.range or runtime.main.defaultItemAffixQuality, line.valueScalar or 1, line.corruptedRange)
		end
		if draft then item:BuildAndParseRaw() end
		caps.corrupted, caps.source, caps.selected = item.corrupted == true, wantedSource, wanted
		return caps
	end)
end

return Corruption
