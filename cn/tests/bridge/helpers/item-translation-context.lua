dofile('../cn/bridge/headless-runtime.lua')()
local seen, count = {}, 0
for name, base in pairs(data.itemBases) do
  local profile = tostring(base.weapon ~= nil) .. ':' .. tostring(base.spirit ~= nil)
  if not seen[profile] and (base.type == 'Sceptre' or base.type == 'Ring' or base.weapon) then
    local item = new('Item', 'Rarity: RARE\nTranslation Verification\n' .. name .. '\nImplicits: 0\n74% increased Spirit\nAdds 18 to 25 Physical Damage')
    assert(item.base, name .. ': 官方物品无法解析')
    local mods = item.modList or item.slotModList[1]
    local spirit, physical = false, false
    for _, mod in ipairs(mods) do
      if mod.name == 'Spirit' and mod.type == 'INC' then spirit = true end
      if mod.name == 'PhysicalMin' and mod.type == 'BASE' then physical = true end
    end
    assert(spirit == (base.spirit == nil), name .. ': Spirit 局部/全局假设与官方消费结果不符')
    assert(physical == (base.weapon == nil), name .. ': PhysicalMin 局部/全局假设与官方消费结果不符')
    seen[profile], count = true, count + 1
  end
end
assert(seen['false:true'] and seen['false:false'] and seen['true:false'], '缺少官方三类底材验证')
print('ITEM_TRANSLATION_CONTEXT_OK ' .. count)
