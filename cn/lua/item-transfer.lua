local Transfer = {}

local function failure(message)
  return { success = false, error = { code = 'POB_SHARED_ITEM_FAILED', message = message } }
end

function Transfer.export(adapter, request)
  local build, unavailable = adapter:available()
  if not build then return unavailable end
  local id = request.itemId
  if type(id) ~= 'number' or id < 1 or id ~= math.floor(id) then return failure('必须指定当前 BD 的官方物品 ID。') end
  local source = build.itemsTab.items[id]
  if not source then return failure('物品不属于当前 BD。') end
  -- BuildRaw 会修改符文的显示字段，必须在官方深拷贝上执行。
  local ok, result = pcall(function()
    local copy = adapter.runtime.copyTableSafe(source, false, true)
    local raw = copy:BuildRaw()
    copy.id = nil
    local item, projectionError = adapter:projectOfficialItem(copy, true, false)
    if not item then return projectionError end
    item.validTargetSlots = nil
    item.raw = nil
    return { success = true, data = { raw = raw, item = item } }
  end)
  return ok and result or failure(tostring(result))
end

local function parseItem(adapter, request)
  if type(request.raw) ~= 'string' or request.raw:match('^%s*$') or #request.raw > 65536 then
    return nil, failure('物品原始文本为空或超过 64 KiB。')
  end
  if request.action == 'previewItemText' or request.action == 'importItemText' then
    -- 官方构造器会将不支持的字符改为问号，必须在解析前阻止有损导入。
    local sanitised = adapter.runtime.sanitiseText(request.raw)
    local _, originalQuestions = request.raw:gsub('%?', '')
    local _, parsedQuestions = sanitised:gsub('%?', '')
    if parsedQuestions > originalQuestions then
      return nil, { success = false, error = { code = 'POB_ITEM_TEXT_LANGUAGE_UNSUPPORTED', message = '当前官方核心不支持这段装备文本中的中文或特殊字符，请使用英文游戏或 PoB 装备原文；未导入物品。' } }
    end
  end
  local item = adapter.runtime.new('Item', request.raw)
  if not item.base then return nil, failure('官方 PoB 无法识别物品底材，请检查完整的游戏或 PoB 装备文本。') end
  item:BuildModList()
  return item
end

function Transfer.preview(adapter, request)
  local build, unavailable = adapter:available()
  if not build then return unavailable end
  local ok, result = pcall(function()
    local item, parseError = parseItem(adapter, request)
    if not item then return parseError end
    local projection, projectionError = adapter:projectOfficialItem(item, true, false)
    if not projection then return projectionError end
    local sockets = {}
    for _, socket in ipairs(projection.validTargetSlots.jewels or {}) do
      if build.spec.allocNodes[socket.nodeId] then sockets[#sockets + 1] = socket end
    end
    projection.validTargetSlots.jewels = sockets
    return { success = true, data = projection }
  end)
  return ok and result or failure(tostring(result))
end

function Transfer.import(adapter, request)
  local build, unavailable = adapter:available()
  if not build then return unavailable end
  local snapshot, snapshotError = adapter:createCalculationSnapshot(build)
  if not snapshot then return snapshotError end
  local ok, result = pcall(function()
    local item, parseError = parseItem(adapter, request)
    if not item then return parseError end
    build.itemsTab:AddItem(item, true)
    if request.target then
      return adapter:assignOfficialItem({ itemId = item.id, target = request.target, canonicalXML = snapshot, projectionScope = request.projectionScope })
    end
    build.itemsTab:PopulateSlots()
    build.buildFlag = true
    local projection = adapter:projectCurrentBuild({ projectionScope = request.projectionScope or 'items' })
    if not projection.success then return projection end
    local exported = adapter:exportXML()
    if not exported.success then return exported end
    local projectedItem, projectionError = adapter:projectOfficialItem(item)
    if not projectedItem then return projectionError end
    return { success = true, data = { xml = exported.data.xml, build = projection.data.build, output = projection.data.output, item = projectedItem } }
  end)
  if not ok then return adapter:restoreCalculationSnapshot(snapshot, failure(tostring(result))) end
  if not result.success then return adapter:restoreCalculationSnapshot(snapshot, result) end
  return result
end

return Transfer
