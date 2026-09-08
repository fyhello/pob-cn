package.path = '../runtime/lua/?.lua;../runtime/lua/?/init.lua;' .. package.path

-- 语料验收只读加载官方核心，禁止写入用户设置或存档。
local originalOpen, originalGetenv = io.open, os.getenv
io.open = function(path, mode)
  assert(not mode or not mode:find('[wa+]'), '验收禁止文件写入')
  return originalOpen(path, mode)
end
io.read = function() return nil end
io.output = function() error('验收禁止输出文件') end
io.popen = function() error('验收禁止启动进程') end
os.remove = function() error('验收禁止删除文件') end
os.rename = function() error('验收禁止移动文件') end
os.execute = function() error('验收禁止启动进程') end
os.getenv = function(name) if name == 'CI' then return '1' end return originalGetenv(name) end
dofile('HeadlessWrapper.lua')
local Adapter = dofile('../cn/lua/real-calc-adapter.lua')
local adapter = Adapter.new(_G)
local json = require('dkjson')

local function same(a, b)
  if type(a) ~= type(b) then return false end
  if type(a) ~= 'table' then return a == b end
  for key, value in pairs(a) do if not same(value, b[key]) then return false end end
  for key in pairs(b) do if a[key] == nil then return false end end
  return true
end

local counts = { bonded = 0, supported = 0, unsupported = 0, uniqueItems = 0, uniqueUnsupported = 0 }
local seen = {}
for _, slots in pairs(data.itemMods.Runes) do
  for _, entry in pairs(slots) do
    if type(entry) == 'table' then
      for _, source in ipairs(entry) do
        local line = itemLib.applyRange(source, 1)
        if line:match('^Bonded: ') and not seen[line] then
          seen[line] = true
          counts.bonded = counts.bonded + 1
          local bonded, extra = modLib.parseMod(line)
          if bonded and not extra then
            counts.supported = counts.supported + 1
          else
            counts.unsupported = counts.unsupported + 1
            assert(extra, '官方未支持词缀必须保留未解析状态：' .. line)
          end
        end
      end
    end
  end
end

local function database(line)
  local mods, extra = modLib.parseMod(line)
  assert(mods and not extra, line)
  local db = new('ModDB')
  db:AddList(mods)
  return db
end
local life = database('Bonded: +20 to maximum Life')
assert(life:Sum('BASE', nil, 'Life') == 0)
life.conditions.CanUseBondedModifiers = true
assert(life:Sum('BASE', nil, 'Life') == 20)
local screenshotLine = 'Bonded: Break Armour on Critical Hit with Spells equal to 12% of Physical Damage dealt'
for _, line in ipairs({ screenshotLine, 'Bonded: Minions deal 20% increased Damage', 'Bonded: Triggered Spells deal 20% increased Spell Damage' }) do
  local _, extra = modLib.parseMod(line)
  assert(extra, '不能把官方未支持的组合词缀提升为支持：' .. line)
end
local _, repeated = modLib.parseMod('Bonded: Bonded: +20 to maximum Life')
assert(repeated)

local fields = { 'runeModLines', 'enchantModLines', 'classRequirementModLines', 'implicitModLines', 'explicitModLines', 'buffModLines' }
local function verify(item)
  item:BuildModList()
  local projected, err = adapter:projectOfficialItem(item, true, false)
  assert(projected, err and err.error and err.error.message)
  assert(#projected.displayLines == #projected.displayLineUnsupported)
  local expected = {}
  for _, field in ipairs(fields) do
    for _, line in ipairs(item[field] or {}) do
      if line.extra and item:CheckModLineVariant(line) then expected[#expected + 1] = line.line end
    end
  end
  assert(same(projected.unparsedLines, expected), item.name)
  local marked = 0
  for _, value in ipairs(projected.displayLineUnsupported) do if value then marked = marked + 1 end end
  assert(marked == #expected, item.name)
  return projected
end

local raw = 'Rarity: RARE\nModifier Regression\nCrimson Amulet\nItem Level: 82\n+20 to maximum Life\nBonded: Minions deal 20% increased Damage\nBonded: +50 to maximum Runic Ward\n15% increased Mana Cost Efficiency of Spells\nUnsupported test modifier'
local item = new('Item', raw)
local projection = verify(item)
assert(#projection.unparsedLines == 4)
local control = new('Item', 'Rarity: RARE\nModifier Regression\nCrimson Amulet\nItem Level: 82\n+20 to maximum Life')
control:BuildModList()
assert(same({ unpack(item.baseModList) }, { unpack(control.baseModList) }), '未支持词缀不得进入计算列表')
local reloaded = verify(new('Item', item:BuildRaw()))
assert(same(reloaded.unparsedLines, projection.unparsedLines))
assert(not item:BuildRaw():find('不生效', 1, true))

local wandRaw = 'Rarity: RARE\nScreenshot Regression\nDueling Wand\nItem Level: 82\n{enchant}{rune}30% increased Spell Damage\n{enchant}{rune}' .. screenshotLine
local wand = new('Item', wandRaw)
local wandProjection = verify(wand)
assert(same(wandProjection.unparsedLines, { screenshotLine }))
local officialLine = itemLib.formatModLine(wand.runeModLines[2])
assert(officialLine:sub(1, #colorCodes.UNSUPPORTED) == colorCodes.UNSUPPORTED)
assert(not wand.baseModList:Flag(nil, 'Condition:CanArmourBreak'))
wand.baseModList.conditions.CanUseBondedModifiers = true
assert(not wand.baseModList:Flag(nil, 'Condition:CanArmourBreak'), '未支持词缀不能在条件满足时参与计算')
assert(same(verify(new('Item', wand:BuildRaw())).unparsedLines, { screenshotLine }))

local supported = verify(new('Item', 'Rarity: RARE\nSupported Regression\nCrimson Amulet\nBonded: +20 to maximum Life'))
assert(#supported.unparsedLines == 0, '支持但条件未满足不能标为官方未支持')

local variant = new('Item', 'Rarity: UNIQUE\nVariant Regression\nCrimson Amulet\nVariant: First\nVariant: Second\nSelected Variant: 1\n{variant:1}+20 to maximum Life\n{variant:2}Unsupported variant modifier')
assert(#verify(variant).unparsedLines == 0)
variant.variant = 2
assert(#verify(variant).unparsedLines == 1)

for _, entries in pairs(data.uniques) do
  for _, text in ipairs(entries) do
    if type(text) == 'string' then
      local unique = new('Item', text, 'UNIQUE', true)
      assert(unique.base, unique.name)
      local projected = verify(unique)
      counts.uniqueItems = counts.uniqueItems + 1
      if #projected.unparsedLines > 0 then counts.uniqueUnsupported = counts.uniqueUnsupported + 1 end
      local copy = new('Item', unique:BuildRaw())
      assert(same(verify(copy).unparsedLines, projected.unparsedLines), unique.name .. ' 重载状态差异：' .. json.encode({ before = projected.unparsedLines, after = verify(copy).unparsedLines }))
    end
  end
end
assert(counts.bonded > 200 and counts.uniqueItems > 400)
print('MODIFIER_REGRESSION:' .. json.encode(counts))
