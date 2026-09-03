local cacheKey = "__cnGeneratedI18nLoader"
local cachedLoader = rawget(_G, cacheKey)
if cachedLoader ~= nil then
	return cachedLoader
end

local function resolveScriptPath()
	local scriptPath = type(GetScriptPath) == "function" and GetScriptPath() or "."
	if type(scriptPath) ~= "string" then
		error("ERROR: CN i18n could not resolve the source script path")
	end
	if scriptPath == "" then
		return "."
	end
	return scriptPath
end

local scriptPath = resolveScriptPath()
local dictionaryPath = scriptPath .. "/../cn/generated/web-data/translations.json"
local json = require("dkjson")
local dictionaryFile, dictionaryOpenError = io.open(dictionaryPath, "rb")
if not dictionaryFile then
	error("ERROR: CN i18n could not load generated translations at " .. dictionaryPath .. ": " .. tostring(dictionaryOpenError))
end
local dictionarySource = dictionaryFile:read("*a")
dictionaryFile:close()
local dictionaryDecoded, _, dictionaryDecodeError = json.decode(dictionarySource, 1, nil)
if type(dictionaryDecoded) ~= "table" then
	error("ERROR: CN i18n could not decode generated translations at " .. dictionaryPath .. ": " .. tostring(dictionaryDecodeError))
end

local translations = { }
for _, domainName in ipairs({ "items", "stats", "tooltip", "ui", "terms" }) do
	local domain = dictionaryDecoded[domainName]
	if type(domain) ~= "table" then
		error("ERROR: CN i18n generated translations domain is missing: " .. domainName)
	end
	for sourceText, translatedText in pairs(domain) do
		if type(sourceText) == "string" and type(translatedText) == "string" and translatedText ~= "" then
			translations[sourceText] = translatedText
		end
	end
end

local loader = { }
local state = { }
local translatableProperties = {
	text = true,
	tooltipText = true,
	label = true,
	title = true,
	placeholder = true,
	prompt = true,
}

local function splitLeadingColorPrefixes(text)
	local offset = 1
	while offset <= #text do
		local remainder = string.sub(text, offset)
		local prefix = string.match(remainder, "^(%^x%x%x%x%x%x%x)") or string.match(remainder, "^(%^%d)")
		if not prefix then
			break
		end
		offset = offset + #prefix
	end
	return string.sub(text, 1, offset - 1), string.sub(text, offset)
end

function loader.Translate(text)
	if type(text) ~= "string" or text == "" then
		return text
	end

	local prefix, sourceText = splitLeadingColorPrefixes(text)
	if sourceText == "" then
		return text
	end
	local translated = translations[sourceText]
	if type(translated) == "string" then
		return prefix .. translated
	end
	return text
end

local function hookDrawFunctions()
	if type(_G.DrawString) == "function" and _G.DrawString ~= state.drawStringWrapper then
		local originalDrawString = _G.DrawString
		state.drawStringWrapper = function(left, top, align, height, font, text)
			return originalDrawString(left, top, align, height, font, loader.Translate(text))
		end
		_G.DrawString = state.drawStringWrapper
	end

	if type(_G.DrawStringWidth) == "function" and _G.DrawStringWidth ~= state.drawStringWidthWrapper then
		local originalDrawStringWidth = _G.DrawStringWidth
		state.drawStringWidthWrapper = function(height, font, text)
			return originalDrawStringWidth(height, font, loader.Translate(text))
		end
		_G.DrawStringWidth = state.drawStringWidthWrapper
	end
end

local function hookControlProperties()
	local common = rawget(_G, "common")
	local classes = type(common) == "table" and common.classes
	local controlClass = type(classes) == "table" and classes.Control
	if type(controlClass) ~= "table" or type(controlClass.GetProperty) ~= "function" then
		return
	end

	if not state.controlGetProperty then
		state.controlGetProperty = controlClass.GetProperty
		state.controlGetPropertyWrapper = function(self, name)
			local value = state.controlGetProperty(self, name)
			if translatableProperties[name] and type(value) == "string" then
				return loader.Translate(value)
			end
			return value
		end
		controlClass.GetProperty = state.controlGetPropertyWrapper
	elseif controlClass.GetProperty == state.controlGetProperty then
		controlClass.GetProperty = state.controlGetPropertyWrapper
	end

	for _, class in pairs(classes) do
		if class ~= controlClass and class._superParents and class._superParents[controlClass] and class.GetProperty == state.controlGetProperty then
			class.GetProperty = state.controlGetPropertyWrapper
		end
	end
end

local function pack(...)
	return {
		n = select("#", ...),
		...
	}
end

local function hookControlFactory()
	if type(_G.new) ~= "function" or _G.new == state.newWrapper then
		return
	end

	local originalNew = _G.new
	state.newWrapper = function(...)
		local results = pack(originalNew(...))
		hookControlProperties()
		return unpack(results, 1, results.n)
	end
	_G.new = state.newWrapper
end

function loader.Install()
	hookDrawFunctions()
	hookControlProperties()
	hookControlFactory()
	return loader
end

rawset(_G, cacheKey, loader)
return loader
