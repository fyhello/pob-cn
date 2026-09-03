-- Headless PoB JSON-lines bridge. Run with cwd set to src/ so the upstream
-- HeadlessWrapper.lua and its runtime module paths retain their normal layout.
io.stdout:setvbuf("no")

package.path = "../runtime/lua/?.lua;../runtime/lua/?/init.lua;" .. package.path
local json = require("dkjson")
local Adapter = assert(dofile("../cn/lua/real-calc-adapter.lua"))

-- HeadlessWrapper blocks on io.read when its GUI startup reports a prompt. A
-- bridge must return an explicit unavailable state instead of blocking forever.
local originalRead = io.read
io.read = function() return nil end
local function loadHeadlessWrapper()
  return dofile("HeadlessWrapper.lua")
end
local headlessStarted, headlessError = pcall(loadHeadlessWrapper)
io.read = originalRead

local function currentHeadlessBuild()
	if not headlessStarted or type(runCallback) ~= "function" or type(debug) ~= "table" then return _G.build end
	local index = 1
	while true do
		local name, value = debug.getupvalue(runCallback, index)
		if not name then return _G.build end
		if name == "mainObject" and type(value) == "table" and type(value.main) == "table" then
			return value.main.modes and value.main.modes["BUILD"] or _G.build
		end
		index = index + 1
	end
end
_G.__cnCurrentHeadlessBuild = currentHeadlessBuild
local calculator = Adapter.new(_G, headlessStarted and nil or headlessError)

local function reply(value)
  local encoded = json.encode(value)
  io.write("POB_JSON:" .. (encoded or '{"success":false,"error":"json encoding failed"}') .. "\n")
  io.flush()
end

local function execute(request)
  local action = request.action
  if action == "newBuild" then
    return calculator:execute(request)
  end
	if action == "loadXML" then
		return calculator:execute(request)
	end
	if action == "exportXML" then
		return calculator:execute(request)
	end
	if action == "calculate" or action == "getStats" then
    return calculator:execute(request)
  end
  if action == "ping" then return calculator:execute(request) end
  return calculator:execute(request)
end

reply({ event = "ready", protocol = "pob-cn-json-lines-v1", calculator = calculator:status() })
for line in io.lines() do
  if line == "exit" or line == "quit" then break end
  local request, _, err = json.decode(line)
  if not request then
    reply({ success = false, error = "invalid json: " .. tostring(err) })
  else
    local ok, result = pcall(execute, request)
    reply(ok and result or { success = false, action = request.action, error = tostring(result) })
  end
end
