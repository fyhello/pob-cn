local apiKey = "__cnBootstrapLifecycleApi"
local cachedApi = rawget(_G, apiKey)
if cachedApi ~= nil then
	if type(cachedApi) == "table" and type(cachedApi.Install) == "function" and type(cachedApi.Register) == "function" then
		return cachedApi
	end
	error("ERROR: CN bootstrap cached Lifecycle API is invalid")
end

local scriptPath = GetScriptPath()
if type(scriptPath) ~= "string" then
	error("ERROR: CN bootstrap could not resolve the source script path")
end
if scriptPath == "" then
	scriptPath = "."
end

local lifecyclePath = scriptPath .. "/../cn/bootstrap/Lifecycle.lua"
local lifecycleChunk, lifecycleLoadError = loadfile(lifecyclePath)
if not lifecycleChunk then
	error("ERROR: CN bootstrap could not load Lifecycle.lua at " .. lifecyclePath .. ": " .. tostring(lifecycleLoadError))
end

local lifecycleLoaded, lifecycle = pcall(lifecycleChunk)
if not lifecycleLoaded then
	error("ERROR: CN bootstrap could not initialize Lifecycle.lua: " .. tostring(lifecycle))
end
if type(lifecycle) ~= "table" or type(lifecycle.Install) ~= "function" or type(lifecycle.Register) ~= "function" then
	error("ERROR: CN bootstrap Lifecycle.lua has an invalid API")
end
local api = {
	Install = lifecycle.Install,
	Register = lifecycle.Register,
}
rawset(_G, apiKey, api)
return api
