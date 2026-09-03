local function fail(message)
	error(message, 2)
end

local function assertEqual(expected, actual, message)
	if expected ~= actual then
		fail((message or "values differ") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual))
	end
end

local baseLoadfile = loadfile

local function setup(scriptPath, withDrawingPrimitives)
	local loadedPaths = { }
	local drawCalls = { }
	GetScriptPath = function()
		return scriptPath
	end
	local baseIoOpen = io.open
	io.open = function(path, mode)
		table.insert(loadedPaths, path)
		if path == "src/../cn/generated/web-data/translations.json"
			or path == "./../cn/generated/web-data/translations.json" then
			local source = rawget(_G, "__CN_I18N_TRANSLATIONS_JSON")
			return {
				read = function() return source end,
				close = function() end,
			}
		end
		return baseIoOpen(path, mode)
	end

	local ControlClass = {
		GetProperty = function(self, name)
			local value = self[name]
			if type(value) == "function" then
				return value(self)
			end
			return value
		end,
	}
	common = { classes = { Control = ControlClass } }
	new = function(className, text, tooltipText)
		return setmetatable({
			text = text,
			tooltipText = tooltipText,
		}, { __index = ControlClass })
	end

	if withDrawingPrimitives then
		DrawString = function(left, top, align, height, font, text)
			table.insert(drawCalls, { kind = "draw", text = text })
			return text
		end
		DrawStringWidth = function(height, font, text)
			table.insert(drawCalls, { kind = "width", text = text })
			return #text
		end
	else
		DrawString = nil
		DrawStringWidth = nil
	end

	return ControlClass, loadedPaths, drawCalls
end

local function runUiCase()
	local ControlClass, loadedPaths, drawCalls = setup("src", true)
	local loaderChunk, loaderLoadError = baseLoadfile("cn/lua/i18n/loader.lua")
	if not loaderChunk then
		fail(loaderLoadError)
	end
	local loader = loaderChunk()
	loader.Install()

	assertEqual("src/../cn/generated/web-data/translations.json", loadedPaths[1], "loader dictionary path")
	assertEqual("伤害", loader.Translate("Damage"), "generated dictionary lookup")
	assertEqual("^7伤害", loader.Translate("^7Damage"), "colour prefix translation")
	assertEqual("^xAABBCC技能", loader.Translate("^xAABBCCSkills"), "hex colour prefix translation")
	assertEqual("^8Unlisted UI text", loader.Translate("^8Unlisted UI text"), "unknown colour text must be preserved")
	assertEqual("Unlisted UI text", loader.Translate("Unlisted UI text"), "unknown text must be preserved")

	DrawString(0, 0, "LEFT", 16, "VAR", "Damage")
	DrawStringWidth(16, "VAR", "^7Skills")
	assertEqual("伤害", drawCalls[1].text, "DrawString must receive translated text")
	assertEqual("^7技能", drawCalls[2].text, "DrawStringWidth must receive translated text")

	local control = setmetatable({
		text = "Damage",
		tooltipText = "Skills",
		label = "Unlisted UI text",
	}, { __index = ControlClass })
	assertEqual("伤害", control:GetProperty("text"), "Control text must be translated")
	assertEqual("技能", control:GetProperty("tooltipText"), "Control tooltipText must be translated")
	assertEqual("Unlisted UI text", control:GetProperty("label"), "unknown Control text must be preserved")
	DrawString(0, 0, "LEFT", 16, "VAR", control:GetProperty("text"))
	assertEqual("伤害", drawCalls[3].text, "Control text must not be translated twice during drawing")
	local newControl = new("Control", "Damage", "Skills")
	assertEqual("伤害", newControl:GetProperty("text"), "new Control text must be translated")
	assertEqual("技能", newControl:GetProperty("tooltipText"), "new Control tooltipText must be translated")
	assertEqual("伤害", loader.Translate(loader.Translate("Damage")), "translation must be idempotent")
end

local function runHeadlessCase()
	rawset(_G, "__cnGeneratedI18nLoader", nil)
	local _, loadedPaths = setup("", false)
	local loaderChunk, loaderLoadError = baseLoadfile("cn/lua/i18n/loader.lua")
	if not loaderChunk then
		fail(loaderLoadError)
	end
	local loader = loaderChunk()
	loader.Install()

	assertEqual("./../cn/generated/web-data/translations.json", loadedPaths[1], "headless dictionary path")
	assertEqual("伤害", loader.Translate("Damage"), "headless dictionary lookup")
	assertEqual(nil, DrawString, "headless DrawString must remain optional")
	assertEqual(nil, DrawStringWidth, "headless DrawStringWidth must remain optional")
end

if __TEST_CASE == "ui" then
	runUiCase()
	print("PASS ui")
elseif __TEST_CASE == "headless" then
	runHeadlessCase()
	print("PASS headless")
else
	fail("unknown i18n test case: " .. tostring(__TEST_CASE))
end
