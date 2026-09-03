local function fail(message)
	error(message, 2)
end

local function assertEqual(expected, actual, message)
	if expected ~= actual then
		fail((message or "values differ") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual))
	end
end

local function assertContains(value, expected, message)
	if not string.find(value, expected, 1, true) then
		fail((message or "value does not contain expected text") .. ": " .. expected)
	end
end

local function assertFails(callback, expected)
	local ok, err = pcall(callback)
	if ok then
		fail("expected callback to fail")
	end
	assertContains(tostring(err), expected, "failure message")
end

local function compile(source, sourceName)
	local chunk, err = loadstring(source, sourceName)
	if not chunk then
		fail(err)
	end
	return chunk
end

local function makeLoader()
	local loadedPaths = { }
	local function loadBootstrapFile(path)
		table.insert(loadedPaths, path)
		if path == "src/../cn/bootstrap/Lifecycle.lua" then
			return compile(__LIFECYCLE_SOURCE, "@cn/bootstrap/Lifecycle.lua")
		end
		if path == "src/../cn/bootstrap/Init.lua" then
			return compile(__INIT_SOURCE, "@cn/bootstrap/Init.lua")
		end
		return nil, "missing bootstrap file: " .. path
	end
	return loadBootstrapFile, loadedPaths
end

local function setupInit()
	local logs = { }
	ConPrintf = function(message)
		table.insert(logs, tostring(message))
	end
	GetScriptPath = function()
		return "src"
	end
	loadfile = makeLoader()
	local init = compile(__INIT_SOURCE, "@cn/bootstrap/Init.lua")()
	return init, logs
end

local function joinLogs(logs)
	return table.concat(logs, "\n")
end

local function countOccurrences(value, expected)
	local count = 0
	local start = 1
	while true do
		local found = string.find(value, expected, start, true)
		if not found then
			return count
		end
		count = count + 1
		start = found + #expected
	end
end

local function pack(...)
	return {
		n = select("#", ...),
		...
	}
end

local function runInvalidHostCase()
	local missingHostInit, missingHostLogs = setupInit()

	assertFails(function()
		missingHostInit.Install(nil)
	end, "ERROR")
	assertContains(joinLogs(missingHostLogs), "ERROR", "missing host must be logged")

	local missingInitInit, missingInitLogs = setupInit()

	assertFails(function()
		missingInitInit.Install({ })
	end, "ERROR")
	assertContains(joinLogs(missingInitLogs), "ERROR", "missing Init must be logged")
	assertContains(joinLogs(missingInitLogs), "main.Init", "missing Init must be logged")
end

local function runUnregisteredCase()
	local init, logs = setupInit()
	local originalCalls = 0
	local host = {
		Init = function(self)
			originalCalls = originalCalls + 1
			return "original"
		end,
	}

	init.Install(host)
	assertEqual("original", host:Init(), "unregistered extensions must not break the original Init")
	assertEqual("original", host:Init(), "the original Init must retain caller invocation semantics")
	assertEqual(2, originalCalls, "the original Init call count")

	local output = joinLogs(logs)
	local i18nDiagnostic = "phase=pre-init module=i18n status=unregistered"
	local dataPatchDiagnostic = "phase=pre-init module=data-patch status=unregistered"
	local nativeUiDiagnostic = "phase=post-init module=native-ui status=unregistered"
	assertEqual(1, countOccurrences(output, i18nDiagnostic), "i18n diagnostic count")
	assertEqual(1, countOccurrences(output, dataPatchDiagnostic), "data patch diagnostic count")
	assertEqual(1, countOccurrences(output, nativeUiDiagnostic), "native UI diagnostic count")
end

local function runLifecycleCase()
	local init, logs = setupInit()
	local order = { }
	local originalCalls = 0
	local host = {
		Init = function(self, value)
			originalCalls = originalCalls + 1
			table.insert(order, "original:" .. value)
			return nil, value, nil
		end,
	}

	init.Register("i18n", "test-i18n", function()
		table.insert(order, "i18n")
	end)
	init.Register("data-patch", "test-data-patch", function()
		table.insert(order, "data-patch")
	end)
	init.Register("native-ui", "test-native-ui", function()
		table.insert(order, "native-ui")
	end)
	assertFails(function()
		init.Register("i18n", "test-i18n", function() end)
	end, "ERROR")

	init.Install(host)
	init.Install(host)
	local firstResults = pack(host:Init("first"))
	assertEqual(3, firstResults.n, "first original Init result count")
	assertEqual(nil, firstResults[1], "first original Init first result")
	assertEqual("first", firstResults[2], "first original Init second result")
	assertEqual(nil, firstResults[3], "first original Init trailing result")
	local secondResults = pack(host:Init("second"))
	assertEqual(3, secondResults.n, "second original Init result count")
	assertEqual(nil, secondResults[1], "second original Init first result")
	assertEqual("second", secondResults[2], "second original Init second result")
	assertEqual(nil, secondResults[3], "second original Init trailing result")
	assertEqual(2, originalCalls, "Install must not change original Init call count")
	assertEqual(
		"i18n,data-patch,original:first,native-ui,original:second",
		table.concat(order, ","),
		"bootstrap order and stage idempotence"
	)
	if string.find(joinLogs(logs), "status=unregistered", 1, true) then
		fail("registered stages must not emit missing-extension diagnostics")
	end
end

local function setupAdapter(scriptPath)
	local logs = { }
	local loadedPaths = { }
	local order = { }
	if scriptPath == nil then
		scriptPath = "src"
	end
	local bootstrapRoot = scriptPath == "" and "." or scriptPath
	local mainHost = {
		controls = { },
		SetMode = function()
			table.insert(order, "original")
		end,
		LoadTree = function() end,
		ChangeUserPath = function() end,
	}
	ConPrintf = function(message)
		table.insert(logs, tostring(message))
	end
	GetScriptPath = function()
		return scriptPath
	end
	loadfile = function(path)
		table.insert(loadedPaths, path)
		if path == bootstrapRoot .. "/../cn/bootstrap/Init.lua" then
			return compile(__INIT_SOURCE, "@cn/bootstrap/Init.lua")
		end
		if path == bootstrapRoot .. "/../cn/bootstrap/Lifecycle.lua" then
			return compile(__LIFECYCLE_SOURCE, "@cn/bootstrap/Lifecycle.lua")
		end
		if path == bootstrapRoot .. "/../cn/lua/i18n/loader.lua" then
			return compile("return { Install = function() end }", "@cn/lua/i18n/loader.lua")
		end
		return nil, "missing bootstrap file: " .. path
	end
	LoadModule = function()
		return { }
	end
	new = function(className)
		if className == "ControlHost" then
			return mainHost
		end
		return { }
	end
	arg = { }
	isValueInTable = function()
		return false
	end
	launch = {
		devMode = false,
		installedMode = true,
	}
	GetRuntimePath = function()
		return "runtime"
	end
	GetUserPath = function()
		return "user"
	end
	defaultColorCodes = {
		POSITIVE = "positive",
		NEGATIVE = "negative",
		HIGHLIGHT = "highlight",
	}
	colorCodes = {
		NEGATIVE = "negative",
	}
	latestTreeVersion = "test"
	modLib = { }

	local main = compile(__MAIN_SOURCE, "@src/Modules/Main.lua")()
	return main, logs, loadedPaths, order
end

local function runAdapterHeadlessPathCase()
	local main, _, loadedPaths = setupAdapter("")
	assertEqual("./../cn/bootstrap/Init.lua", loadedPaths[1], "headless adapter Init path")
	assertEqual("./../cn/bootstrap/Lifecycle.lua", loadedPaths[2], "headless Init Lifecycle path")
	assertEqual("function", type(main.Init), "headless adapter returns the upstream main host")
end

local function runAdapterCase()
	local main, logs, loadedPaths = setupAdapter()
	assertEqual("src/../cn/bootstrap/Init.lua", loadedPaths[1], "adapter Init path")
	assertEqual("src/../cn/bootstrap/Lifecycle.lua", loadedPaths[2], "Init Lifecycle path")
	assertEqual(0, #logs, "adapter installation must not execute extension stages")
	assertEqual("function", type(main.Init), "adapter returns the upstream main host")
end

local function replaceInstalledOriginalInit(main, originalInit)
	local upvalueIndex = 1
	while true do
		local upvalueName = debug.getupvalue(main.Init, upvalueIndex)
		if not upvalueName then
			break
		end
		if upvalueName == "originalInit" then
			debug.setupvalue(main.Init, upvalueIndex, originalInit)
			return
		end
		upvalueIndex = upvalueIndex + 1
	end
	fail("installed adapter did not retain the original Init closure")
end

local function runAdapterRegistrationCase()
	local main, logs, loadedPaths, order = setupAdapter()
	local reloadedInitChunk, reloadError = loadfile("src/../cn/bootstrap/Init.lua")
	if not reloadedInitChunk then
		fail(reloadError)
	end
	local reloadedInit = reloadedInitChunk()

	reloadedInit.Register("i18n", "adapter-i18n", function()
		table.insert(order, "i18n")
	end)
	reloadedInit.Register("data-patch", "adapter-data-patch", function()
		table.insert(order, "data-patch")
	end)
	reloadedInit.Register("native-ui", "adapter-native-ui", function()
		table.insert(order, "native-ui")
	end)

	replaceInstalledOriginalInit(main, function()
		table.insert(order, "original")
	end)
	main:Init()
	assertEqual(
		"i18n,data-patch,original,native-ui",
		table.concat(order, ","),
		"reloaded Init API must register callbacks for the installed adapter"
	)
	assertEqual("src/../cn/bootstrap/Init.lua", loadedPaths[3], "independent Init reload path")
	assertEqual(0, #logs, "registered adapter extensions must not emit diagnostics")
end

if __TEST_CASE == "invalid-host" then
	runInvalidHostCase()
elseif __TEST_CASE == "unregistered" then
	runUnregisteredCase()
elseif __TEST_CASE == "lifecycle" then
	runLifecycleCase()
elseif __TEST_CASE == "adapter" then
	runAdapterCase()
elseif __TEST_CASE == "adapter-registration" then
	runAdapterRegistrationCase()
elseif __TEST_CASE == "adapter-headless-path" then
	runAdapterHeadlessPathCase()
else
	fail("unknown test case: " .. tostring(__TEST_CASE))
end
