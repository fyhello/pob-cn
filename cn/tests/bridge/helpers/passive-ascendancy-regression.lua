dofile('../cn/bridge/headless-runtime.lua')()
local adapter = dofile('../cn/lua/real-calc-adapter.lua').new(_G)
local function ok(response)
	assert(response and response.success, response and response.error and response.error.message or '官方请求失败')
	return response.data
end
local function reload(xml)
	ok(adapter:loadXML({ xml = xml }, 'loadXML'))
	return adapter:currentBuild()
end
local function export()
	return ok(adapter:exportXML()).xml
end
local function ascendId(spec, name)
	for id, class in pairs(spec.curClass.classes) do if class.id == name then return id end end
	error('当前基础职业没有目标升华：' .. name)
end
local function allocations(spec, regularOnly)
	local rows = {}
	for id, node in pairs(spec.allocNodes) do
		if not regularOnly or not node.ascendancyName then rows[#rows + 1] = id .. ':' .. tostring(node.allocMode or 0) end
	end
	table.sort(rows)
	return table.concat(rows, ',')
end
local function scalars(output)
	local rows = {}
	for key, value in pairs(output) do
		if type(value) == 'number' or type(value) == 'boolean' or type(value) == 'string' then rows[#rows + 1] = key .. '=' .. tostring(value) end
	end
	table.sort(rows)
	return table.concat(rows, '\n')
end
local function document(xml)
	local root = assert(common.xml.ParseXML(xml))[1]
	local function normalise(node, parent)
		for _, field in ipairs({ 'nodes', 'strNodes', 'dexNodes', 'intNodes' }) do
			if node.attrib and node.attrib[field] then
				local ids = {}
				for id in node.attrib[field]:gmatch('[^,]+') do ids[#ids + 1] = id end
				table.sort(ids); node.attrib[field] = table.concat(ids, ',')
			end
		end
		if node.elem == 'URL' and parent == 'Spec' then node[1] = 'derived-from-spec-nodes' end
		for _, child in ipairs(node) do if type(child) == 'table' then normalise(child, node.elem) end end
		if node.elem == 'ConfigSet' then table.sort(node, function(a, b) return a.elem .. a.attrib.name < b.elem .. b.attrib.name end) end
	end
	normalise(root)
	table.sort(root, function(a, b) return a.elem < b.elem end)
	return assert(common.xml.ComposeXML(root))
end

local build = reload(export())
if arg[1] then
	local file = assert(io.open(arg[1], 'rb'))
	local xml = file:read('*a'); file:close()
	build = reload(xml)
else
	build.spec:SelectClass(assert(build.spec.tree.classNameMap.Witch))
	build.spec:SelectAscendClass(ascendId(build.spec, 'Infernalist'))
	build.spec:AllocNode(assert(build.spec.nodes[17754]))
	-- 从当前官方路径选择互不占用的普通节点，构造两组武器分配。
	for mode = 0, 2 do
		build.spec.allocMode = mode
		local candidates = {}
		for _, node in pairs(build.spec.nodes) do
			if not node.alloc and not node.ascendancyName and node.type == 'Normal' and node.path then candidates[#candidates + 1] = node end
		end
		table.sort(candidates, function(a, b) return #a.path == #b.path and a.id < b.id or #a.path < #b.path end)
		local allocated = false
		for _, node in ipairs(candidates) do
			build.spec:AllocNode(node)
			if node.alloc and node.allocMode == mode then allocated = true; break end
		end
		assert(allocated, '不能构造官方武器组分配')
	end
	build.buildFlag = true
	build.calcsTab:BuildOutput()
	build = reload(export())
end
assert(build.spec.curClassName == 'Witch' and build.spec.curAscendClassBaseName == 'Infernalist')
local original = export()
local originalRegular = allocations(build.spec, true)
local switches = 0
local function verifySwitch(nodeId, mode)
	local before = export()
	local spec = adapter:currentBuild().spec
	local name = assert(spec.nodes[nodeId].ascendancyName)
	-- 独立基准只调用官方方法，不经过适配层的单点分支。
	spec.allocMode = mode
	-- 免费升华不依赖起点：仅切换起点会残留，官方取消分配后再选择目标升华。
	local old = {}
	for _, node in pairs(spec.allocNodes) do
		if node.ascendancyName and node.ascendancyName == spec.curAscendClassBaseName and not node.isGrantedPassive then old[#old + 1] = node end
	end
	for _, node in ipairs(old) do spec:DeallocSingleNode(node) end
	spec:SelectAscendClass(ascendId(spec, name))
	if not spec.nodes[nodeId].alloc then spec:AllocNode(spec.nodes[nodeId]) end
	adapter:currentBuild().itemsTab:UpdateSockets()
	adapter:currentBuild().buildFlag = true
	adapter:currentBuild().calcsTab:BuildOutput()
	local expectedNodes = allocations(spec)
	local expectedOutput = scalars(adapter:currentBuild().calcsTab.mainOutput)
	local expectedXML = document(export())
	build = reload(before)
	local calculates, saves = 0, 0
	local calculate, save = build.calcsTab.BuildOutput, build.SaveDB
	build.calcsTab.BuildOutput = function(self, ...) calculates = calculates + 1; return calculate(self, ...) end
	build.SaveDB = function(self, ...) saves = saves + 1; return save(self, ...) end
	local result = adapter:commitBuildChanges({ canonicalXML = before, projectionScope = 'tree', changes = { passiveNode = { nodeId = nodeId, allocate = true, allocMode = mode } } })
	build.calcsTab.BuildOutput, build.SaveDB = calculate, save
	local data = ok(result)
	assert(calculates == 1 and saves == 1, '切换重复计算或重复序列化')
	assert(data.build.ascendancyName == name and data.build.className == 'Witch', '升华投影未更新')
	assert(allocations(build.spec) == expectedNodes, '分配与官方方法不一致')
	assert(allocations(build.spec, true) == originalRegular, '普通或武器组天赋被改变')
	assert(scalars(build.calcsTab.mainOutput) == expectedOutput, '计算结果与官方不一致')
	assert(document(data.xml) == expectedXML, '保存内容与官方不一致')
	for _, node in pairs(build.spec.allocNodes) do
		if node.ascendancyName then assert(node.ascendancyName == name and (node.allocMode or 0) == 0, '残留旧升华或升华误入武器组：' .. node.id .. ':' .. node.ascendancyName .. ':' .. tostring(node.allocMode) .. ' target=' .. name .. ' mode=' .. mode) end
	end
	build = reload(data.xml)
	assert(allocations(build.spec) == expectedNodes and scalars(build.calcsTab.mainOutput) == expectedOutput, '保存重开不一致')
	switches = switches + 1
end
for mode = 0, 2 do
	verifySwitch(59822, mode)
	verifySwitch(17754, mode)
	verifySwitch(8415, mode)
	verifySwitch(32699, mode)
end

build = reload(original)
local previousAscendancy = {}
for _, node in pairs(build.spec.allocNodes) do if node.ascendancyName then previousAscendancy[#previousAscendancy + 1] = node end end
for _, node in ipairs(previousAscendancy) do build.spec:DeallocSingleNode(node) end
build.spec:SelectAscendClass(0)
build.buildFlag = true
build.calcsTab:BuildOutput()
assert(build.spec.curAscendClassBaseName == nil, '未升华角色的官方 ID 应为空')
verifySwitch(17754, 2)

local function rejected(changes, code, inject)
	build = reload(original)
	local before = document(export())
	local nodes, output = allocations(build.spec), scalars(build.calcsTab.mainOutput)
	if inject then inject(build) end
	local result = adapter:commitBuildChanges({ canonicalXML = original, projectionScope = 'tree', changes = changes })
	assert(not result.success and result.error.code == code, '错误没有按预期返回：' .. tostring(result.error and result.error.code))
	build = adapter:currentBuild()
	assert(allocations(build.spec) == nodes and scalars(build.calcsTab.mainOutput) == output, '失败未回滚天赋或计算')
	assert(document(export()) == before, '失败污染存档')
end
local switch = { passiveNode = { nodeId = 8415, allocate = true } }
local foreign
for id, node in pairs(build.spec.nodes) do
	if node.type == 'AscendClassStart' and node.ascendancyName then
		local sameClass = false
		for _, class in pairs(build.spec.curClass.classes) do if class.id == node.ascendancyName then sameClass = true end end
		if not sameClass then foreign = id; break end
	end
end
assert(foreign)
rejected({ passiveNode = { nodeId = foreign, allocate = true } }, 'POB_CALC_INPUT_UNSUPPORTED')
rejected({ passiveNode = { nodeId = -1, allocate = true } }, 'POB_CALC_INPUT_UNSUPPORTED')
rejected({ passiveNode = { nodeId = 8415, allocate = true, allocMode = 3 } }, 'POB_CALC_INPUT_UNSUPPORTED')
rejected(switch, 'POB_ASCENDANCY_CHANGE_FAILED', function(b)
	local select = b.spec.SelectAscendClass
	b.spec.SelectAscendClass = function(self, id) select(self, id); error('注入切换失败') end
end)
rejected(switch, 'POB_PASSIVE_ALLOCATION_FAILED', function(b) b.spec.AllocNode = function() end end)
rejected(switch, 'POB_CALCULATION_FAILED', function(b)
	local calculate = b.calcsTab.BuildOutput
	b.calcsTab.BuildOutput = function() b.calcsTab.BuildOutput = calculate; error('注入计算失败') end
end)
rejected(switch, 'POB_BUILD_EXPORT_FAILED', function(b)
	local save = b.SaveDB
	b.SaveDB = function() b.SaveDB = save; error('注入保存失败') end
end)
print('PASSIVE_ASCENDANCY_OK switches=' .. switches .. ' rollback=7')
