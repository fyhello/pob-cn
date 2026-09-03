local Lifecycle = { }

local stages = {
	["i18n"] = {
		phase = "pre-init",
		extensions = { },
	},
	["data-patch"] = {
		phase = "pre-init",
		extensions = { },
	},
	["native-ui"] = {
		phase = "post-init",
		extensions = { },
	},
}

local stateKey = "__cnBootstrapLifecycleState"

local function log(level, message)
	ConPrintf("CN bootstrap " .. level .. ": " .. message)
end

local function fail(message)
	log("ERROR", message)
	error("ERROR: " .. message, 3)
end

local function pack(...)
	return {
		n = select("#", ...),
		...
	}
end

local function runStage(stageName)
	local stage = stages[stageName]
	if #stage.extensions == 0 then
		log("DIAGNOSTIC", "phase=" .. stage.phase .. " module=" .. stageName .. " status=unregistered")
		return
	end
	for _, extension in ipairs(stage.extensions) do
		extension.callback()
	end
end

function Lifecycle.Register(stageName, moduleName, callback)
	local stage = stages[stageName]
	if not stage then
		fail("unknown extension module: " .. tostring(stageName))
	end
	if type(moduleName) ~= "string" or moduleName == "" then
		fail("extension module name is required for " .. stageName)
	end
	if type(callback) ~= "function" then
		fail("extension callback is required for " .. stageName .. ":" .. moduleName)
	end
	for _, extension in ipairs(stage.extensions) do
		if extension.moduleName == moduleName then
			fail("duplicate extension registration: " .. stageName .. ":" .. moduleName)
		end
	end
	table.insert(stage.extensions, {
		moduleName = moduleName,
		callback = callback,
	})
end

function Lifecycle.Install(main)
	if type(main) ~= "table" then
		fail("Install requires an existing main host")
	end
	if type(main.Init) ~= "function" then
		fail("Install requires main.Init")
	end
	if main[stateKey] then
		return main
	end

	local originalInit = main.Init
	local state = {
		preInitComplete = false,
		postInitComplete = false,
	}
	main[stateKey] = state
	main.Init = function(self, ...)
		if not state.preInitComplete then
			state.preInitComplete = true
			runStage("i18n")
			runStage("data-patch")
		end

		local results = pack(originalInit(self, ...))

		if not state.postInitComplete then
			state.postInitComplete = true
			runStage("native-ui")
		end
		return unpack(results, 1, results.n)
	end
	return main
end

return Lifecycle
