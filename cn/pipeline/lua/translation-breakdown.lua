-- 仅在隔离采集进程中建立测试流派，使用真实事务和官方明细投影。
return function(adapter, add)
  local function request(message)
    local result = adapter:execute(message)
    assert(result.success, result.error and result.error.message or '官方语料采集请求失败')
    return result.data
  end
  local function collect(value, path, field)
    if type(value) == 'table' then
      for key, child in pairs(value) do
        if key == 'sourceRef' and type(child) == 'table' and child.kind == 'treeNode' then
          add('passive_type', path, 'nodeType', child.nodeType)
          for index, line in ipairs(child.sd or {}) do add('passive_stat', path, tostring(index), line) end
        elseif key ~= 'sourceRef' and key ~= 'dpsPipeline' and not (key == 'source' and value.sourceName) then
          collect(child, path .. '.' .. tostring(key), tostring(key))
        end
      end
    elseif type(value) == 'string' and value ~= '' and field ~= 'key' and field ~= 'type' and field ~= 'sourceType' and field ~= 'kind' and field ~= 'skillId' and field ~= 'id' and field ~= 'group' and field ~= 'calcMode' then
      add('calc_dynamic', path, field, value)
    end
  end
  for _, skill in ipairs({ 'Spark', 'Fireball', 'Ice Nova', 'Flame Wall' }) do
    request({ action = 'newBuild' })
    local created = request({ action = 'commitSkillChange', operation = 'addGroup', skillSetId = 1, label = skill })
    local group = #created.build.socketGroups
    request({ action = 'commitSkillChange', operation = 'addGem', skillSetId = 1, groupIndex = group, patch = { nameSpec = skill, level = 20 } })
    if skill == 'Fireball' then
      request({ action = 'commitSkillChange', operation = 'addGem', skillSetId = 1, groupIndex = group, patch = { nameSpec = 'Controlled Destruction', level = 1 } })
    end
    request({ action = 'importItemText', raw = 'Rarity: RARE\nEmpyrean Corona\nKamasan Tiara\nItem Level: 82\n18% increased Armour, Evasion and Energy Shield\n+100 to maximum Life\nRegenerate 2% of Life per second', target = { itemSetId = 1, slotName = 'Helmet' } })
    if skill == 'Fireball' then
      request({ action = 'importItemText', raw = 'Rarity: RARE\nArmageddon Turn\nEmerald Ring\nItem Level: 82\n35% increased Mana Cost of Skills\n100% more Mana Cost of Skills\nSkills cost Life instead of 8% of Mana Cost\n+15 to Strength\n9% increased Duration of Ignite on Enemies', target = { itemSetId = 1, slotName = 'Ring 1' } })
    end
    request({ action = 'importItemText', raw = 'Rarity: RARE\nSpirit Spark\nSapphire\nItem Level: 82\n25% increased Totem Placement speed\nRegenerate 0.5% of maximum Life per second\n25% reduced Armour, Evasion and Energy Shield' })
    local projected = request({ action = 'projectCurrentBuild', projectionScope = 'full' })
    collect(projected.build.skillBreakdown, skill .. '.skillBreakdown', '')
    for _, item in ipairs(projected.build.itemLibrary or {}) do
      local context = { scope = 'item-display', item = { name = item.name, title = item.title, base = item.base, rarity = item.rarity, crafted = item.crafted } }
      for index, line in ipairs(item.displayLines or {}) do add('item_display', skill .. '.item.' .. item.id, tostring(index), line, nil, context) end
      local tooltip = request({ action = 'projectOfficialItemTooltip', itemId = item.id }).tooltip
      for index, line in ipairs(tooltip.bodyLines or {}) do add('item_display', skill .. '.tooltip.' .. item.id, tostring(index), line, nil, context) end
    end
  end
end
