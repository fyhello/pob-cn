local metrics = {}
local instrumented = setmetatable({}, { __mode = 'k' })

local function track(name, fn, ...)
  metrics[name] = (metrics[name] or 0) + 1
  return fn(...)
end

local function install()
  if not common or not common.classes then return end
  local itemsTab = common.classes.ItemsTab
  local calcsTab = common.classes.CalcsTab
  if itemsTab and not instrumented[itemsTab] then
    local original = itemsTab.AddItemTooltip
    itemsTab.AddItemTooltip = function(...) return track('tooltip', original, ...) end
    instrumented[itemsTab] = true
  end
  if calcsTab and not instrumented[calcsTab] then
    local originalBuild = calcsTab.BuildOutput
    calcsTab.BuildOutput = function(...) return track('buildOutput', originalBuild, ...) end
    local originalGet = calcsTab.GetMiscCalculator
    calcsTab.GetMiscCalculator = function(self)
      local fn, base = originalGet(self)
      return function(...) return track('comparison', fn, ...) end, base
    end
    instrumented[calcsTab] = true
  end
end

local originalDofile = dofile
dofile = function(path)
  local isAdapter = path:find('real-calc-adapter.lua', 1, true)
  local value = originalDofile(isAdapter and os.getenv('POB_CN_REVIEW_ADAPTER') or path)
  if isAdapter then
    local originalExecute = value.execute
    value.execute = function(self, request)
      metrics = {}
      install()
      local result = originalExecute(self, request)
      install()
      result.review = metrics
      if request.action == 'getStats' then
        local build = self:currentBuild()
        local candidates = {}
        for id, node in pairs(build and build.spec and build.spec.nodes or {}) do
          if not node.alloc and node.type == 'Normal' and node.path and #node.path == 1 then
            candidates[#candidates + 1] = { id = id, name = node.dn, stats = node.sd }
          end
        end
        table.sort(candidates, function(a, b) return a.id < b.id end)
        result.reviewCandidates = candidates
      end
      return result
    end
  end
  return value
end

-- 测试只修改独立进程内的 BD，禁止官方运行时写入保存文件。
local originalOpen = io.open
io.open = function(path, mode, ...)
  if mode and (mode:find('w') or mode:find('a') or mode:find('+', 1, true)) then
    error('diagnostic disk write blocked: ' .. tostring(path))
  end
  return originalOpen(path, mode, ...)
end

dofile('../cn/bridge/calc_server.lua')
