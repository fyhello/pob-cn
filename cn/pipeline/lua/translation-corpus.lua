local json = require('dkjson')
dofile('../cn/bridge/headless-runtime.lua')()
local adapter = dofile('../cn/lua/real-calc-adapter.lua').new(_G)
local build = assert(adapter:currentBuild())
local rows, stats, deferred, itemBases = {}, {}, {}, {}
local function add(category, id, field, text, gameId, context)
  if type(text) == 'string' and text ~= '' then
    rows[#rows + 1] = { category = category, id = tostring(id), field = field, text = text, gameId = gameId, context = context }
  end
end
for name, base in pairs(data.itemBases) do
  itemBases[name] = { weapon = base.weapon ~= nil, spirit = base.spirit ~= nil }
  add('base_name', name, 'name', name)
  add('base_type', name, 'type', base.type)
  add('base_implicit', name, 'implicit', base.implicit)
end
for id, gem in pairs(data.gems) do
  add('gem_name', id, 'name', gem.name, gem.gameId)
  for tag in pairs(gem.tags or {}) do add('gem_tag', id, 'tag.' .. tostring(tag), tag) end
end
for id, skill in pairs(data.skills) do
  add('skill_name', id, 'name', skill.name)
  add('skill_description', id, 'description', skill.description)
end
for id, node in pairs(build.spec.tree.nodes) do
  add('passive_name', id, 'name', node.dn or node.name)
  if node.type == 'Socket' or node.isJewelSocket then add('passive_type', id, 'type', 'Socket') end
  for index, line in ipairs(node.sd or node.stats or {}) do add('passive_stat', id, tostring(index), line) end
end
for id, item in pairs(main.uniqueDB.list) do
  add('unique_name', id, 'title', item.title or item.name)
  add('unique_base', id, 'baseName', item.baseName)
  add('unique_source', id, 'source', item.source and 'Source: ' .. item.source)
  add('unique_league', id, 'league', item.league)
  for index, variant in ipairs(item.variantList or {}) do add('unique_variant', id, tostring(index), variant) end
  for _, section in ipairs({ 'implicitModLines', 'explicitModLines', 'enchantModLines', 'runeModLines' }) do
    for index, line in ipairs(item[section] or {}) do add('unique_mod', id, section .. '.' .. index, line.line, nil, { scope = 'item-display', item = { title = item.title, base = item.baseName, rarity = item.rarity } }) end
  end
end
for id, flavour in pairs(data.flavourText) do
  if type(flavour) == 'table' then
    add('flavour_name', flavour.id or id, 'name', flavour.name)
    add('flavour_text', flavour.id or id, 'text', type(flavour.text) == 'table' and table.concat(flavour.text, '\n') or flavour.text, nil,
      { entity = { table = 'FlavourText', id = flavour.id or tostring(id), field = 'Text' } })
  end
end
for pool, mods in pairs(data.itemMods or {}) do
  for id, mod in pairs(mods) do
    add('craft_affix_name', pool .. '.' .. id, 'affix', mod.affix)
    for index, line in ipairs(mod) do add('craft_mod', pool .. '.' .. id, tostring(index), line) end
  end
end
local function declarations(value, path, category)
  if type(value) ~= 'table' then return end
  for key, child in pairs(value) do
    local childPath = path .. '.' .. tostring(key)
    if type(child) == 'table' then
      declarations(child, childPath, category)
    elseif key == 'label' or key == 'tooltip' or key == 'section' or key == 'format' then
      if type(child) == 'function' then
        local ok, text = pcall(child, {}, build)
        deferred[#deferred + 1] = { category = category, path = childPath, invoked = true, success = ok, empty = text == nil, error = not ok and tostring(text) or nil }
        if ok then add(category, childPath, tostring(key), text) end
        if ok and text == nil then
          local previous = launch.devModeAlt
          launch.devModeAlt = true
          local mods = assert(modLib.parseMod('+10 to maximum Life'))
          for _, mod in ipairs(mods) do mod.source = 'Custom' end
          local debugOk, debugText = pcall(child, mods, build)
          launch.devModeAlt = previous
          deferred[#deferred + 1] = { category = category, path = childPath, mode = 'developer-custom-mod', invoked = true, success = debugOk, empty = debugText == nil, text = debugOk and debugText or nil, error = not debugOk and tostring(debugText) or nil }
        end
      else add(category, childPath, tostring(key), child) end
    end
  end
end
declarations(LoadModule('Modules/ConfigOptions'), 'ConfigOptions', 'config_text')
declarations(LoadModule('Modules/CalcSections'), 'CalcSections', 'calc_label')
local display, minion, extra = LoadModule('Modules/BuildDisplayStats')
declarations(display, 'BuildDisplayStats', 'display_stat')
declarations(minion, 'MinionDisplayStats', 'display_stat')
declarations(extra, 'ExtraDisplayStats', 'display_stat')
for index, quest in ipairs(LoadModule('Data/QuestRewards')) do
  add('calc_source', 'QuestRewards.' .. index, 'source', 'Quest:' .. quest.Description .. ': ' .. quest.Area)
end
dofile('../cn/pipeline/lua/translation-breakdown.lua')(adapter, add)
-- 穷举实际预览及每组选项；不计算选项的笛卡尔积，重复选择由官方计数测试覆盖。
local unique = dofile('../cn/lua/unique-crafting.lua')
local previews, variantSelections, rangeLabels = 0, 0, 0
for id in pairs(main.uniqueDB.list) do
  local original, issue, _, caps = unique.create(adapter, { kind = 'unique', templateId = id }, build.itemsTab)
  assert(original, issue and issue.error.message)
  local function collectItem(item, suffix)
    local context = { scope = 'item-display', item = { title = item.title, base = item.baseName, rarity = item.rarity } }
    local projected, err = adapter:projectOfficialItem(item, true)
    assert(projected and projected.tooltip, err and err.error and err.error.message or id .. ': 官方浮窗为空')
    local lines = projected.tooltip.bodyLines
    local index = 1
    while index <= #lines do
      local value, count = lines[index], 1
      for _, flavour in pairs(data.flavourText) do
        if flavour.name == item.title and type(flavour.text) == 'table' and flavour.text[1] == value then
          local matches = true
          for offset, line in ipairs(flavour.text) do if lines[index + offset - 1] ~= line then matches = false end end
          if matches then value, count = table.concat(flavour.text, '\n'), #flavour.text; break end
        end
      end
      if not value:match('^Tip: Press Ctrl%+D') then
        add('unique_display', id .. ':' .. suffix, tostring(index), value, nil, context)
        rows[#rows].unsupported = projected.tooltip.bodyLineUnsupported[index] == true
      end
      index = index + count
    end
    previews = previews + 1
  end
  local function collectRolls(item, suffix)
    if #(item.rangeLineList or {}) == 0 then collectItem(item, suffix); return end
    for _, roll in ipairs({ 0, 0.5, 1 }) do
      for _, line in ipairs(item.rangeLineList) do line.range = roll end
      item:BuildAndParseRaw()
      collectItem(item, suffix .. ':roll=' .. roll)
    end
  end
  collectRolls(original, 'default')
  for _, field in ipairs(caps.variants) do
    for index in ipairs(original.variantList or {}) do
      original[field.field] = index
      original:BuildAndParseRaw()
      collectRolls(original, field.field .. '=' .. index)
      variantSelections = variantSelections + 1
    end
    original[field.field] = field.value
    original:BuildAndParseRaw()
  end
  for _, line in ipairs(caps.ranges) do
    add('unique_range', id, line.id, line.line, nil, { scope = 'item-display', item = { title = original.title, base = original.baseName, rarity = original.rarity } })
    rangeLabels = rangeLabels + 1
  end
end
local files = assert(io.open(os.getenv('POB_CN_TRANSLATION_FILES'), 'rb'))
local paths = assert(json.decode(files:read('*a')))
files:close()
for _, path in ipairs(paths) do
  local scope = dofile(path)
  for index, descriptor in ipairs(scope) do
    for form, description in ipairs(descriptor[1] or {}) do
      stats[#stats + 1] = { file = path, index = index, form = form, stats = descriptor.stats, description = description }
      add('stat_template', path .. ':' .. index .. ':' .. form, 'text', description.text)
    end
  end
end
table.sort(rows, function(a, b) return a.category .. '\0' .. a.id .. '\0' .. a.field < b.category .. '\0' .. b.id .. '\0' .. b.field end)
print('TRANSLATION_CORPUS:' .. json.encode({ schema_version = 1, rows = rows, stats = stats, deferred = deferred, itemBases = itemBases,
  uniqueCoverage = { previews = previews, variantSelections = variantSelections, rangeLabels = rangeLabels } }))
