import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { LUA_OK } = require('lua-wasm-bindings/dist/lua');
const { lauxlib, lua, lualib } = require('lua-wasm-bindings/dist/lua.51');
const adapterPath = new URL('../../lua/real-calc-adapter.lua', import.meta.url);
const calcFormatPath = new URL('../../../src/Modules/CalcFormat.lua', import.meta.url);

async function runLua(scenario) {
  const [adapterSource, calcFormatSource] = await Promise.all([
    readFile(adapterPath, 'utf8'),
    readFile(calcFormatPath, 'utf8'),
  ]);
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  const script = `
    function round(value) return value end
    function formatNumSep(value) return value end
    assert(loadstring(${JSON.stringify(calcFormatSource)}))()
    local factory = assert(loadstring(${JSON.stringify(adapterSource)}))
    local Adapter = factory()
    ${scenario}
  `;
  const status = lauxlib.luaL_dostring(state, script);
  const result = lua.lua_tostring(state, -1);
  lua.lua_close(state);
  assert.equal(status, LUA_OK, result);
  return result;
}

test('fails closed when HeadlessWrapper does not expose its documented APIs', async () => {
  const result = await runLua(`
    local response = Adapter.new({}):execute({ action = "calculate" })
    assert(response.success == false)
    assert(response.error.code == "POB_HEADLESS_API_UNAVAILABLE")
    assert(response.error.api == "newBuild")
    return response.error.code .. ":" .. response.error.api
  `);
  assert.equal(result, 'POB_HEADLESS_API_UNAVAILABLE:newBuild');
});

test('calls only the HeadlessWrapper build APIs and returns calculated mainOutput scalars', async () => {
  const result = await runLua(`
    local calls = { newBuild = 0, loadBuildFromXML = 0, buildOutput = 0, tabulate = 0 }
    local modDB = {
      Sum = function() return 0 end,
      More = function() return 1 end,
      Tabulate = function()
        calls.tabulate = calls.tabulate + 1
        return {}
      end,
    }
    local runtime = {}
    runtime.build = {
      buildName = "Official build",
      characterLevel = 1,
      savers = {},
      spec = {
        curClassName = "Sorceress",
        curAscendClassName = "Chronomancer",
        allocNodes = { [123] = true },
        jewels = {},
      },
      treeTab = { specList = { {} } },
      itemsTab = {
        itemSetOrderList = { 1 },
        items = {
          [1] = {
            id = 1,
            title = "Golden Wand",
            base = { name = "Wand", type = "Wand" },
            rarity = "RARE",
            raw = "Rarity: Rare\\nGolden Wand\\nWand",
          },
        },
        activeItemSet = { ["Weapon 1"] = { selItemId = 1 } },
        slots = { ["Weapon 1"] = {} },
      },
      skillsTab = {
        skillSetOrderList = { 1 },
        socketGroupList = {
          {
            label = "Main Skill",
            enabled = true,
            includeInFullDPS = true,
            gemList = { { nameSpec = "Spark", level = 20, quality = 0, enabled = true } },
          },
        },
      },
      configTab = {
        UpdateLevel = function() end,
        BuildModList = function() end,
      },
      calcsTab = {
        mainOutput = { Life = 10, Label = "official", Nested = { ignored = true } },
        calcsEnv = { player = { output = {}, modDB = modDB } },
        sectionList = {},
        BuildOutput = function(self)
          calls.buildOutput = calls.buildOutput + 1
          self.mainOutput = { Life = 321, Label = "official", Nested = { ignored = true } }
        end,
      },
    }
    function runtime.build:SaveDB()
      return "<PathOfBuilding2 />"
    end
    runtime.newBuild = function()
      calls.newBuild = calls.newBuild + 1
    end
    runtime.loadBuildFromXML = function(xml, name)
      assert(xml == "<PathOfBuilding2 />")
      assert(name == "golden")
      calls.loadBuildFromXML = calls.loadBuildFromXML + 1
    end

    local adapter = Adapter.new(runtime)
    local created = adapter:execute({ action = "newBuild", level = 92 })
    assert(created.success == true)
    assert(created.output.Life == 321)
    assert(created.output.Label == "official")
    assert(created.output.Nested == nil)
    assert(runtime.build.characterLevel == 92)
    calls.tabulate = 0

    local loaded = adapter:execute({ action = "loadXML", xml = "<PathOfBuilding2 />", name = "golden" })
    assert(loaded.success == true)
    assert(loaded.data ~= nil)
    assert(loaded.data.buildName == "golden")
    assert(loaded.data.className == "Sorceress")
    assert(loaded.data.characterLevel == 92)
    assert(loaded.data.allocNodes[1] == 123)
    assert(loaded.data.itemLibrary[1].name == "Golden Wand")
    assert(loaded.data.equippedItems["Weapon 1"].id == 1)
    assert(loaded.data.socketGroups[1].gems[1].name == "Spark")
    assert(calls.newBuild == 1)
    assert(calls.loadBuildFromXML == 1)
    assert(calls.buildOutput == 2)
    -- Compatibility projection must not reconstruct damage or query sources.
    assert(calls.tabulate == 0)
    return table.concat({ calls.newBuild, calls.loadBuildFromXML, calls.buildOutput, calls.tabulate }, ":")
  `);
  assert.equal(result, '1:1:2:0');
});

test('projects DPS compatibility fields only from official actor output', async () => {
  const result = await runLua(`
    local forbidden = function() error("adapter must not derive official values") end
    local build = {
      calcsTab = {
        input = { misc_buffMode = "COMBAT" },
        calcsEnv = {
          player = {
            output = {
              CombinedDPS = 999, TotalDPS = 777, TotalDot = 555, AverageHit = 333, Speed = 2.5, Time = 0.4,
              HitChance = 95, CritChance = 12, CritMultiplier = 1.7, CritEffect = 1.084,
              ManaCost = 30, ManaRegenRecovery = 42,
            },
            breakdown = {
              TotalDPS = { "^7Base damage: 100", "= 777" },
            },
            modDB = { Sum = forbidden, More = forbidden, Combine = forbidden, Tabulate = forbidden },
          },
        },
        sectionList = {},
        BuildOutput = function(self) self.mainOutput = { TotalDPS = 777 } end,
      },
    }
    local result = Adapter.new({ build = build, newBuild = function() end, loadBuildFromXML = function() end }):calculate("calculate")
    assert(result.success == true)
    local pipe = result.skillBreakdown.dpsPipeline
    assert(pipe.combinedDPS == 999 and pipe.totalDPS == 777 and pipe.dotDPS == 555 and pipe.avgHit == 333)
    assert(pipe.damageTypes == nil)
    assert(pipe.hitDPS == nil and pipe.incDamage == nil and pipe.critMultiBase == nil)
    assert(pipe.officialBreakdowns.TotalDPS[1] == "Base damage: 100")
    return tostring(pipe.totalDPS) .. ":" .. tostring(pipe.manaRegen)
  `);
  assert.equal(result, '777:42');
});

test('projects only official visible equipment slots', async () => {
  const result = await runLua(`
    local hidden = { shown = function() return false end }
    local visible = { shown = function() return true end }
    local visibleSocket = { shown = function() return true end }
    local runtime = {
      build = {
        buildName = "Visible slots",
        characterLevel = 1,
        savers = {},
        spec = { curClassName = "Sorceress", allocNodes = {}, jewels = {} },
        treeTab = { specList = { {} } },
        itemsTab = {
          itemSetOrderList = { 1 },
          itemSets = { [1] = { id = 1, title = "Default", ["Belt"] = { selItemId = 0 } } },
          activeItemSetId = 1,
          activeItemSet = {},
          items = {
            [1] = { id = 1, title = "Visible Ring", baseName = "Ring", base = { name = "Ring", type = "Ring" }, rarity = "RARE", raw = "Rarity: RARE\\nVisible Ring\\nRing" },
          },
          slots = {
            ["Arm 1"] = visible, ["Arm 2"] = visible,
            ["Leg 1"] = visible, ["Leg 2"] = visible,
            ["Body Armour"] = visible, ["Weapon 1"] = visible, ["Belt"] = visible,
            ["Belt Jewel Socket 1"] = hidden,
            ["Belt Jewel Socket 2"] = visibleSocket,
          },
          IsItemValidForSlot = function(_, item, slotName)
            return slotName == "Body Armour" or slotName:find("Belt Jewel Socket", 1, true) ~= nil
          end,
        },
        skillsTab = { skillSetOrderList = { 1 }, skillSets = { [1] = { title = "Default", socketGroupList = {} } } },
        configTab = { activeConfigSetId = 1, configSets = { [1] = { title = "Default" } }, UpdateLevel = function() end, BuildModList = function() end },
        calcsTab = { mainOutput = {}, BuildOutput = function() end },
      },
      newBuild = function() end,
      loadBuildFromXML = function() end,
    }
    local response = Adapter.new(runtime):execute({ action = "loadXML", xml = "<PathOfBuilding2 />", name = "visible" })
    assert(response.success == true)
    assert(#response.data.loadouts.equipmentSlots == 8)
    assert(table.concat(response.data.loadouts.equipmentSlots, "|") == "Weapon 1|Body Armour|Belt|Belt Jewel Socket 2|Arm 1|Arm 2|Leg 1|Leg 2")
    local valid = response.data.itemLibrary[1].validTargetSlots.equipment
    assert(#valid == 2 and valid[1] == "Belt Jewel Socket 2" and valid[2] == "Body Armour")
    assert(#response.data.itemLibrary[1].validTargetSlots.equipmentJewels == 1)
    return table.concat(response.data.loadouts.equipmentSlots, ",")
  `);
  assert.equal(result, 'Weapon 1,Body Armour,Belt,Belt Jewel Socket 2,Arm 1,Arm 2,Leg 1,Leg 2');
});

test('projects every official passive tree, equipment set, skill set, and active loadout ids', async () => {
  const result = await runLua(`
    local firstSpec = { title = "Default", curClassName = "Sorceress", allocNodes = { [101] = true }, jewels = {} }
    local secondSpec = { title = "Boss", curClassName = "Sorceress", allocNodes = { [202] = true }, jewels = {} }
    local firstSet = { id = 10, title = "Default", ["Weapon 1"] = { selItemId = 1 } }
    local secondSet = { id = 20, title = "Boss", ["Weapon 1"] = { selItemId = 2 } }
    local firstSkills = { id = 30, title = "Default", socketGroupList = { { label = "Clear", enabled = true, includeInFullDPS = true, gemList = {} } } }
    local secondSkills = { id = 40, title = "Boss", socketGroupList = { { label = "Boss", enabled = true, includeInFullDPS = true, gemList = {} } } }
    local runtime = {
      newBuild = function() end,
      loadBuildFromXML = function() end,
      build = {
        savers = {}, buildName = "Multi", characterLevel = 90, spec = secondSpec,
        treeTab = { specList = { firstSpec, secondSpec }, activeSpec = 2 },
        itemsTab = {
          itemSetOrderList = { 10, 20 }, itemSets = { [10] = firstSet, [20] = secondSet }, activeItemSetId = 20, activeItemSet = secondSet,
          slots = { ["Weapon 1"] = {} },
          items = {
            [1] = { id = 1, title = "First Wand", baseName = "Wand", base = { name = "Wand", type = "Wand" }, rarity = "RARE", raw = "Rarity: RARE\\nFirst Wand\\nWand" },
            [2] = { id = 2, title = "Second Wand", baseName = "Wand", base = { name = "Wand", type = "Wand" }, rarity = "RARE", raw = "Rarity: RARE\\nSecond Wand\\nWand" },
          },
        },
        skillsTab = { skillSetOrderList = { 30, 40 }, skillSets = { [30] = firstSkills, [40] = secondSkills }, activeSkillSetId = 40, socketGroupList = secondSkills.socketGroupList },
        configTab = { activeConfigSetId = 50, configSetOrderList = { 50, 60 }, configSets = { [50] = { title = "Default" }, [60] = { title = "Boss" } } },
        calcsTab = { mainOutput = {} },
      },
    }
    function runtime.build.calcsTab:BuildOutput() self.mainOutput = { Life = 500 } end
    function runtime.build:SaveDB() return [[<PathOfBuilding2><Build loadout="saved" /></PathOfBuilding2>]] end
    function runtime.build:SetActiveLoadout(selection)
      self.treeTab.activeSpec = selection.specId
      self.spec = self.treeTab.specList[selection.specId]
      self.itemsTab.activeItemSetId = selection.itemSetId
      self.itemsTab.activeItemSet = self.itemsTab.itemSets[selection.itemSetId]
      self.skillsTab.activeSkillSetId = selection.skillSetId
      self.skillsTab.socketGroupList = self.skillsTab.skillSets[selection.skillSetId].socketGroupList
      self.configTab.activeConfigSetId = selection.configSetId
    end
    local adapter = Adapter.new(runtime)
    local response = adapter:execute({ action = "loadXML", xml = "<PathOfBuilding2 />" })
    assert(response.success == true)
    local loadouts = response.data.loadouts
    assert(loadouts.active.specId == 2)
    assert(loadouts.active.itemSetId == 20)
    assert(loadouts.active.skillSetId == 40)
    assert(loadouts.active.configSetId == 50)
    assert(#loadouts.passiveTrees == 2)
    assert(#loadouts.itemSets == 2)
    assert(#loadouts.skillSets == 2)
    assert(#loadouts.configSets == 2)
    assert(loadouts.itemSets[1].equippedItems["Weapon 1"].id == 1)
    assert(loadouts.itemSets[2].equippedItems["Weapon 1"].id == 2)
    assert(response.data.equippedItems["Weapon 1"].id == 2)
    assert(response.data.allocNodes[1] == 202)
    local switched = adapter:execute({ action = "selectLoadout", selection = { specId = 1, itemSetId = 10, skillSetId = 30, configSetId = 50 } })
    assert(switched.success == true)
    assert(switched.data.xml:find("saved", 1, true))
    assert(switched.data.build.loadouts.active.specId == 1)
    assert(switched.data.build.loadouts.active.itemSetId == 10)
    assert(switched.data.build.equippedItems["Weapon 1"].id == 1)
    return table.concat({ #loadouts.passiveTrees, #loadouts.itemSets, #loadouts.skillSets, switched.data.build.equippedItems["Weapon 1"].id }, ":")
  `);
  assert.equal(result, '2:2:2:1');
});

test('uses canonical XML as the rollback snapshot for loadout, build, config, and skill commits', async () => {
  const result = await runLua(`
    local saveCalls = 0
    local spec = { title = "Default", curClassName = "Sorceress", allocNodes = {} }
    local itemSet = { id = 1, title = "Default", useSecondWeaponSet = false }
    local skillSet = { id = 1, title = "Default", socketGroupList = { { label = "Main", enabled = true, includeInFullDPS = true, gemList = {} } } }
    local build = {
      savers = {}, characterLevel = 90, spec = spec,
      treeTab = { activeSpec = 1, specList = { spec } },
      itemsTab = { activeItemSetId = 1, activeItemSet = itemSet, itemSetOrderList = { 1 }, itemSets = { [1] = itemSet }, items = {}, slots = {} },
      skillsTab = {
        activeSkillSetId = 1, skillSetOrderList = { 1 }, skillSets = { [1] = skillSet }, socketGroupList = skillSet.socketGroupList,
        ProcessSocketGroup = function() end,
      },
      configTab = {
        activeConfigSetId = 1, configSetOrderList = { 1 }, configSets = { [1] = { title = "Default", input = {} } },
        UpdateLevel = function() end,
        BuildModList = function() end,
      },
      calcsTab = { input = { skill_number = 1 }, mainOutput = {} },
    }
    function build.calcsTab:BuildOutput() self.mainOutput = { Life = 500 } end
    function build:SetActiveLoadout(selection)
      self.treeTab.activeSpec = selection.specId
      self.spec = self.treeTab.specList[selection.specId]
      self.itemsTab.activeItemSetId = selection.itemSetId
      self.itemsTab.activeItemSet = self.itemsTab.itemSets[selection.itemSetId]
      self.skillsTab.activeSkillSetId = selection.skillSetId
      self.skillsTab.socketGroupList = self.skillsTab.skillSets[selection.skillSetId].socketGroupList
      self.configTab.activeConfigSetId = selection.configSetId
    end
    function build:SaveDB(fileName)
      assert(fileName == "pob-cn-export.xml")
      saveCalls = saveCalls + 1
      return "<PathOfBuilding2><Build save='" .. tostring(saveCalls) .. "' /></PathOfBuilding2>"
    end
    local runtime = {
      build = build,
      newBuild = function() end,
      loadBuildFromXML = function() error("canonical XML should avoid snapshot reload") end,
      LoadModule = function(name)
        assert(name == "Modules/ConfigOptions")
        return { { var = "conditionMoving", type = "check", label = "Moving" } }
      end,
    }
    local adapter = Adapter.new(runtime)
    local canonicalXML = "<PathOfBuilding2><Build canonical='true' /></PathOfBuilding2>"
    local loadout = adapter:selectOfficialLoadout({ selection = { specId = 1, itemSetId = 1, skillSetId = 1, configSetId = 1 }, canonicalXML = canonicalXML })
    assert(loadout.success == true, loadout.error and (loadout.error.code .. ":" .. tostring(loadout.error.api)))
    local buildCommit = adapter:commitBuildChanges({ changes = { level = 91 }, canonicalXML = canonicalXML })
    assert(buildCommit.success == true, buildCommit.error and (buildCommit.error.code .. ":" .. tostring(buildCommit.error.api)))
    local configCommit = adapter:commitConfigChange({ configSetId = 1, variable = "conditionMoving", value = true, canonicalXML = canonicalXML })
    assert(configCommit.success == true, configCommit.error and (configCommit.error.code .. ":" .. tostring(configCommit.error.api)))
    local skillCommit = adapter:commitSkillChange({ skillSetId = 1, operation = "setMain", groupIndex = 1, canonicalXML = canonicalXML })
    assert(skillCommit.success == true, skillCommit.error and (skillCommit.error.code .. ":" .. tostring(skillCommit.error.api)))
    assert(saveCalls == 4, "canonical XML should avoid four extra SaveDB snapshot calls")
    return tostring(saveCalls)
  `);
  assert.equal(result, '4');
});

test('restores the supplied canonical XML when a committed build change fails', async () => {
  const result = await runLua(`
    local restoredXML, restoredName, saved = nil, nil, false
    local canonicalXML = "<PathOfBuilding2><Build canonical='rollback' /></PathOfBuilding2>"
    local build = {
      calcsTab = {
        input = { misc_buffMode = "EFFECTIVE" },
        BuildOutput = function() error("fixture calculation failure") end,
        mainOutput = {},
      },
      SaveDB = function() saved = true; return "<PathOfBuilding2 />" end,
    }
    local runtime = {
      build = build,
      newBuild = function() end,
      loadBuildFromXML = function(xml, name)
        restoredXML, restoredName = xml, name
      end,
    }
    local result = Adapter.new(runtime):commitBuildChanges({ changes = { buffMode = "COMBAT" }, canonicalXML = canonicalXML })
    assert(result.success == false)
    assert(result.error.code == "POB_CALCULATION_FAILED")
    assert(restoredXML == canonicalXML)
    assert(restoredName == "")
    assert(saved == false)
    return result.error.code
  `);
  assert.equal(result, 'POB_CALCULATION_FAILED');
});

test('exports XML only through the official build SaveDB API', async () => {
  const result = await runLua(`
    local calls = 0
    local runtime = {
      newBuild = function() end,
      loadBuildFromXML = function() end,
      build = {
        calcsTab = { BuildOutput = function() end, mainOutput = {} },
        SaveDB = function(self, fileName)
          assert(fileName == "pob-cn-export.xml")
          calls = calls + 1
          return "<PathOfBuilding2><Skills /></PathOfBuilding2>"
        end,
      },
    }
    local exported = Adapter.new(runtime):execute({ action = "exportXML" })
    assert(exported.success == true)
    assert(exported.data.xml == "<PathOfBuilding2><Skills /></PathOfBuilding2>")
    return tostring(calls)
  `);
  assert.equal(result, '1');
});

test('uses the current headless build after the official loader replaces it', async () => {
  const result = await runLua(`
    local stale = { calcsTab = { BuildOutput = function() end, mainOutput = {} }, SaveDB = function() return "stale" end }
    local current = { savers = {}, calcsTab = { BuildOutput = function() end, mainOutput = {} }, SaveDB = function() return "<PathOfBuilding2><Skills /></PathOfBuilding2>" end }
    local runtime = {
      newBuild = function() end,
      loadBuildFromXML = function() current = { savers = {}, calcsTab = { BuildOutput = function() end, mainOutput = {} }, SaveDB = function() return "<PathOfBuilding2><Skills><Skill /></Skills></PathOfBuilding2>" end } end,
      build = stale,
      __cnCurrentHeadlessBuild = function() return current end,
    }
    local adapter = Adapter.new(runtime)
    local loaded = adapter:execute({ action = "loadXML", xml = "<PathOfBuilding2 />" })
    assert(loaded.success == true)
    local exported = adapter:execute({ action = "exportXML" })
    assert(exported.success == true)
    assert(exported.data.xml == "<PathOfBuilding2><Skills><Skill /></Skills></PathOfBuilding2>")
    return exported.data.xml
  `);
  assert.match(result, /<Skill \/>/);
});

test('applies non-item calculation inputs without mutating official equipment or jewel slots', async () => {
  const result = await runLua(`
    local calls = { importNodes = 0, processGroup = 0, populateSlots = 0, buildOutput = 0 }
    local build = {
      characterLevel = 90,
      characterLevelAutoMode = true,
      mainSocketGroup = 1,
      savers = {},
    }
    local nodeOne = { id = 1, allocMode = 0 }
    local nodeTwo = { id = 2, allocMode = 0 }
    build.spec = {
      curClassName = "Fixture",
      curClassId = 1,
      curAscendClassId = 0,
      curSecondaryAscendClassId = 0,
      treeVersion = "0_5",
      hashOverrides = {},
      masterySelections = {},
      nodes = { [1] = nodeOne, [2] = nodeTwo },
      allocNodes = { [1] = nodeOne },
      jewels = {},
    }
    function build.spec:ImportFromNodeList(className, classId, ascendClassId, secondaryAscendClassId, nodeIds)
      assert(className == nil)
      assert(classId == 1)
      assert(ascendClassId == 0)
      assert(secondaryAscendClassId == 0)
      calls.importNodes = calls.importNodes + 1
      self.allocNodes = {}
      for _, nodeId in ipairs(nodeIds) do self.allocNodes[nodeId] = self.nodes[nodeId] end
    end
    function build.spec:BuildClusterJewelGraphs()
      calls.clusterGraphs = (calls.clusterGraphs or 0) + 1
    end
    local weaponSlot = { selItemId = 10 }
    function weaponSlot:SetSelItemId(itemId) self.selItemId = itemId end
    local jewelSlot = { nodeId = 2, selItemId = 0 }
    function jewelSlot:SetSelItemId(itemId)
      self.selItemId = itemId
      build.spec.jewels[self.nodeId] = itemId
      build.spec:BuildClusterJewelGraphs()
    end
    build.itemsTab = {
      items = {
        [10] = { id = 10, raw = "Rarity: Rare\\nOld Wand" },
        [11] = { id = 11, raw = "Rarity: Rare\\nNew Wand" },
        [12] = { id = 12, raw = "Rarity: Rare\\nJewel" },
      },
      slots = { ["Weapon 1"] = weaponSlot, ["Jewel 2"] = jewelSlot },
      sockets = { [2] = jewelSlot },
      PopulateSlots = function() calls.populateSlots = calls.populateSlots + 1 end,
    }
    local group = {
      enabled = true,
      includeInFullDPS = true,
      gemList = { { nameSpec = "Spark", skillId = "spark", level = 20, quality = 0, enabled = true } },
    }
    build.skillsTab = {
      socketGroupList = { group },
      ProcessSocketGroup = function(_, target)
        assert(target == group)
        calls.processGroup = calls.processGroup + 1
      end,
    }
    build.configTab = {
      UpdateLevel = function() calls.levelUpdated = (calls.levelUpdated or 0) + 1 end,
      BuildModList = function() calls.configRebuilt = (calls.configRebuilt or 0) + 1 end,
    }
    build.calcsTab = {
      input = {},
      mainOutput = {},
      BuildOutput = function(self)
        calls.buildOutput = calls.buildOutput + 1
        self.mainOutput = {
          Score = build.characterLevel + (build.spec.allocNodes[2] and 10 or 0)
            + (weaponSlot.selItemId == 11 and 100 or 0)
            + (build.spec.jewels[2] == 12 and 1000 or 0)
            + group.gemList[1].level + group.gemList[1].quality + (group.enabled and 1 or 0),
        }
      end,
    }
    function build:SaveDB()
      return "<PathOfBuilding2 />"
    end
    local runtime = { newBuild = function() end, loadBuildFromXML = function() end, build = build }
    local response = Adapter.new(runtime):execute({
      action = "calculate",
      className = "Fixture",
      level = 95,
      allocNodes = { 1, 2 },
      mainSocketGroup = 1,
      socketGroups = {
        { enabled = true, includeInFullDPS = true, isMain = true, gems = {
          { name = "Spark", skillId = "spark", level = 21, quality = 20, enabled = true },
        } },
      },
      buffMode = "EFFECTIVE",
    })
    assert(response.success == true, response.error and response.error.message)
    assert(response.output.Score == 147)
    assert(build.characterLevel == 95)
    assert(build.characterLevelAutoMode == false)
    assert(build.spec.allocNodes[2] == nodeTwo)
    assert(weaponSlot.selItemId == 10)
    assert(jewelSlot.selItemId == 0)
    assert(group.gemList[1].level == 21)
    assert(group.gemList[1].quality == 20)
    assert(calls.importNodes == 1)
    assert(calls.processGroup == 1)
    assert(calls.populateSlots == 0)
    return tostring(response.output.Score)
  `);
  assert.equal(result, '147');
});

test('ignores legacy local item payloads so they cannot affect official calculation output', async () => {
  const result = await runLua(`
    local buildCalls = 0
    local runtime = {
      newBuild = function() end,
      loadBuildFromXML = function() end,
      build = {
        savers = {},
        itemsTab = { items = { [1] = { id = 1 } } },
        calcsTab = {
          BuildOutput = function() buildCalls = buildCalls + 1 end,
          mainOutput = { Life = 100 },
        },
      },
    }
    function runtime.build:SaveDB()
      return "<PathOfBuilding2 />"
    end
    local response = Adapter.new(runtime):execute({
      action = "calculate",
      itemLibrary = { { id = "web-only-item" } },
    })
    assert(response.success == true)
    assert(response.output.Life == 100)
    assert(buildCalls == 1)
    return tostring(response.output.Life)
  `);
  assert.equal(result, '100');
});

test('commits existing official item assignments, clears slots, rejects invalid ids, and rolls back failed calculations', async () => {
  const result = await runLua(`
    local failCalculation = false
    local function makeBuild(firstItemId, secondItemId, secondJewelId)
      local firstSet = { id = 1, title = "Default", ["Weapon 1"] = { selItemId = firstItemId } }
      local secondSet = { id = 2, title = "Boss", ["Weapon 1"] = { selItemId = secondItemId } }
      local weaponSlot = { slotName = "Weapon 1", selItemId = firstItemId }
      local firstSpec = { title = "Default", curClassName = "Sorceress", allocNodes = {}, jewels = {} }
      local secondSpec = { title = "Boss", curClassName = "Sorceress", allocNodes = { [200] = true }, jewels = { [200] = secondJewelId } }
      local build = { savers = {}, buildName = "Fixture", characterLevel = 90, spec = firstSpec }
      local jewelSlot = { nodeId = 200, slotName = "Jewel 200", selItemId = 0 }
      local itemsTab = {
        items = {
          [1] = { id = 1, title = "Starter Wand", baseName = "Wand", base = { name = "Wand", type = "Wand" }, rarity = "RARE", raw = "Rarity: RARE\\nStarter Wand\\nWand" },
          [2] = { id = 2, title = "Boss Wand", baseName = "Wand", base = { name = "Wand", type = "Wand" }, rarity = "RARE", raw = "Rarity: RARE\\nBoss Wand\\nWand" },
          [3] = { id = 3, title = "Official Jewel", baseName = "Jewel", base = { name = "Jewel", type = "Jewel" }, rarity = "RARE", raw = "Rarity: RARE\\nOfficial Jewel\\nJewel" },
        },
        slots = { ["Weapon 1"] = weaponSlot }, sockets = { [200] = jewelSlot }, itemSetOrderList = { 1, 2 }, itemSets = { [1] = firstSet, [2] = secondSet },
        activeItemSetId = 1, activeItemSet = firstSet,
      }
      function itemsTab:SetActiveItemSet(itemSetId)
        self.activeItemSetId = itemSetId
        self.activeItemSet = self.itemSets[itemSetId]
        weaponSlot.selItemId = self.activeItemSet["Weapon 1"].selItemId
      end
      function weaponSlot:SetSelItemId(itemId)
        self.selItemId = itemId
        itemsTab.activeItemSet["Weapon 1"].selItemId = itemId
      end
      function jewelSlot:SetSelItemId(itemId)
        self.selItemId = itemId
        build.spec.jewels[200] = itemId
      end
      function itemsTab:IsItemValidForSlot(item, slotName)
        return (slotName == "Weapon 1" and item.base.type == "Wand") or (slotName == "Jewel 200" and item.base.type == "Jewel")
      end
      function itemsTab:PopulateSlots() end
      build.itemsTab = itemsTab
      build.treeTab = { activeSpec = 1, specList = { firstSpec, secondSpec } }
      function build.treeTab:SetActiveSpec(specId)
        self.activeSpec = specId
        build.spec = self.specList[specId]
      end
      build.skillsTab = { activeSkillSetId = 1, skillSetOrderList = { 1 }, skillSets = { [1] = { title = "Default", socketGroupList = {} } }, socketGroupList = {} }
      build.configTab = { activeConfigSetId = 1, configSetOrderList = {}, configSets = {} }
      build.calcsTab = { mainOutput = {} }
      function build.calcsTab:BuildOutput()
        if failCalculation and itemsTab.activeItemSetId == 2 and weaponSlot.selItemId == 2 then error("fixture calculation failure") end
        self.mainOutput = { Score = 100 + weaponSlot.selItemId + (build.spec.jewels[200] == 3 and 1000 or 0) }
      end
      function build:SaveDB()
        return "<PathOfBuilding2 first='" .. firstSet["Weapon 1"].selItemId .. "' second='" .. secondSet["Weapon 1"].selItemId .. "' jewel='" .. secondSpec.jewels[200] .. "' />"
      end
      return build
    end
    local runtime = { newBuild = function() end, build = makeBuild(1, 0, 0) }
    runtime.loadBuildFromXML = function(xml)
      local first = assert(tonumber(assert(xml:match("first='(%d+)'"))))
      local second = assert(tonumber(assert(xml:match("second='(%d+)'"))))
      local jewel = assert(tonumber(assert(xml:match("jewel='(%d+)'"))))
      runtime.build = makeBuild(first, second, jewel)
    end
    local adapter = Adapter.new(runtime)
    local target = { itemSetId = 2, slotName = "Weapon 1" }

    local assigned = adapter:execute({ action = "assignOfficialItem", target = target, itemId = 2 })
    assert(assigned.success == true, assigned.error and assigned.error.message)
    assert(assigned.data.item.id == 2)
    assert(assigned.data.targetOutput.Score == 102)
    assert(assigned.data.output.Score == 101)
    assert(runtime.build.itemsTab.activeItemSetId == 1)
    assert(runtime.build.itemsTab.itemSets[1]["Weapon 1"].selItemId == 1)
    assert(runtime.build.itemsTab.itemSets[2]["Weapon 1"].selItemId == 2)
    assert(assigned.data.build.loadouts.itemSets[2].equippedItems["Weapon 1"].id == 2)

    local jewelTarget = { kind = "jewel", specId = 2, nodeId = 200 }
    local socketed = adapter:execute({ action = "assignOfficialItem", target = jewelTarget, itemId = 3 })
    assert(socketed.success == true, socketed.error and socketed.error.message)
    assert(socketed.data.targetOutput.Score == 1101)
    assert(runtime.build.treeTab.activeSpec == 1)
    assert(runtime.build.treeTab.specList[2].jewels[200] == 3)

    local cleared = adapter:execute({ action = "assignOfficialItem", target = jewelTarget })
    assert(cleared.success == true, cleared.error and cleared.error.message)
    assert(cleared.data.item == nil)
    assert(runtime.build.treeTab.activeSpec == 1)
    assert(runtime.build.treeTab.specList[2].jewels[200] == 0)

    local illegal = adapter:execute({ action = "assignOfficialItem", target = target, itemId = 999 })
    assert(illegal.success == false)
    assert(illegal.error.code == "POB_ITEM_ASSIGNMENT_INVALID")
    assert(illegal.error.api == "itemId")
    assert(runtime.build.itemsTab.activeItemSetId == 1)
    assert(runtime.build.itemsTab.itemSets[2]["Weapon 1"].selItemId == 2)

    failCalculation = true
    local rolledBack = adapter:execute({ action = "assignOfficialItem", target = target, itemId = 2 })
    assert(rolledBack.success == false)
    assert(rolledBack.error.code == "POB_CALCULATION_FAILED")
    assert(runtime.build.itemsTab.activeItemSetId == 1)
    assert(runtime.build.itemsTab.itemSets[1]["Weapon 1"].selItemId == 1)
    assert(runtime.build.itemsTab.itemSets[2]["Weapon 1"].selItemId == 2)
    return tostring(assigned.data.targetOutput.Score) .. ":" .. tostring(runtime.build.treeTab.specList[2].jewels[200])
  `);
  assert.equal(result, '102:0');
});

test('projects an official essence id so an existing crafted item can be edited as a structured draft', async () => {
  const result = await runLua(`
    local essenceMod = { "+(5-10) to maximum Life", level = 1, type = "Prefix", group = "EssenceLife" }
    local runtime = {
      build = {
        data = { essences = { EssenceOfLife = { mods = { Amulet = "EssenceLife" } } } },
      },
    }
    local item = {
      id = 7, title = "Crafted Amulet", baseName = "Test Amulet", base = { name = "Test Amulet", type = "Amulet" }, rarity = "RARE",
      prefixes = { { modId = "EssenceLife", essence = true, range = .25 } }, suffixes = {}, affixes = { EssenceLife = essenceMod },
    }
    local projected = assert(Adapter.new(runtime):projectOfficialItem(item))
    assert(projected.essence.id == "EssenceOfLife")
    assert(projected.essence.roll == .25)
    return projected.essence.id .. ":" .. tostring(projected.essence.roll)
  `);
  assert.equal(result, 'EssenceOfLife:0.25');
});

test('fails closed when the official loader leaves a build awaiting conversion', async () => {
  const result = await runLua(`
    local runtime = {
      newBuild = function() end,
      loadBuildFromXML = function() end,
      build = { calcsTab = { BuildOutput = function() end, mainOutput = {} } },
    }
    local loaded = Adapter.new(runtime):execute({ action = "loadXML", xml = "<PathOfBuilding2 />" })
    assert(loaded.success == false)
    assert(loaded.error.code == "POB_BUILD_LOAD_INCOMPLETE")
    return loaded.error.code
  `);
  assert.equal(result, 'POB_BUILD_LOAD_INCOMPLETE');
});

test('projects only upstream-visible calculation breakdowns and keeps calculation skill selection separate from main DPS', async () => {
  const result = await runLua(`
    local build = {
      mainSocketGroup = 1,
      skillsTab = { socketGroupList = { { label = "Clear" }, { label = "Boss" } } },
      calcsTab = {
        input = { skill_number = 1 },
        calcsEnv = {
          player = {
            output = { Damage = 250 },
            modDB = {
              Combine = function(_, _, _, modName)
                return modName == "Damage" and 60 or 40
              end,
            },
            breakdown = {
              HitDamage = { "^7Base damage: 100", "Final damage: 250" },
              DamageTable = {
                label = "Damage sources",
                colList = { { key = "source", label = "Source" }, { key = "total", label = "Total" } },
                rowList = { { source = "Wand", total = 250, affixLimit = "internal-only" } },
              },
              Hidden = { "this must not be projected", affixLimit = "internal-only" },
            },
          },
        },
        sectionList = {
          { subSection = {
            { label = "Official damage", data = {
              { { format = "All Types:" } },
              { label = "Hit damage", { format = "{0:mod:1,2}%", { breakdown = "HitDamage", modType = "INC", modName = "Damage" }, { label = "Conversions", breakdown = "DamageTable", modType = "INC", modName = "SpellDamage" } } },
              { label = "Hidden row", flag = "hidden", { format = "{output:Damage}", { breakdown = "Hidden" } } },
            } },
          } },
        },
      },
    }
    function build.calcsTab:CheckFlag(value) return value.flag ~= "hidden" end
    function build.calcsTab:BuildOutput() self.mainOutput = { Damage = 250 } end
    local runtime = { build = build, newBuild = function() end, loadBuildFromXML = function() end }
    local adapter = Adapter.new(runtime)
    local calculated = adapter:execute({ action = "calculate" })
    assert(calculated.success == true)
    assert(#calculated.skillBreakdown.sections == 2, "section count="..tostring(#calculated.skillBreakdown.sections))
    assert(calculated.skillBreakdown.sections[1].label == "Hit damage", "first label="..tostring(calculated.skillBreakdown.sections[1].label))
    assert(calculated.skillBreakdown.sections[1].sections[1].lines[1] == "Base damage: 100", "first line="..tostring(calculated.skillBreakdown.sections[1].sections[1].lines[1]))
    local tableSection = calculated.skillBreakdown.sections[2].sections[1]
    assert(tableSection.type == "table", "second type="..tostring(tableSection.type))
    assert(#tableSection.columns == 2, "column count="..tostring(#tableSection.columns))
    assert(tableSection.rows[1].source == "Wand", "source="..tostring(tableSection.rows[1].source))
    assert(tableSection.rows[1].total == 250, "projected total="..tostring(tableSection.rows[1].total))
    assert(tableSection.rows[1].affixLimit == nil)
    local dynamicRow = calculated.skillBreakdown.dynamicSubSections["Official damage"].rows[1]
    assert(dynamicRow.cellId == "1:1:2:1")
    assert(dynamicRow.columnLabel == "All Types:")
    assert(dynamicRow.value == "100%")
    assert(not dynamicRow.value:find("{", 1, true))
    assert(dynamicRow.details[1].breakdownLines[1] == "Base damage: 100")
    assert(dynamicRow.details[2].label == "Conversions")
    assert(dynamicRow.details[2].breakdownTables[1].rows[1].source == "Wand")

    local applied = adapter:applyCalculationInputs(build, { calcsSkillGroup = 2 })
    assert(applied == true)
    assert(build.mainSocketGroup == 1)
    assert(build.calcsTab.input.skill_number == 2)
    build.calcsTab.input.skill_number = 1
    applied = adapter:applyCalculationInputs(build, { mainSocketGroup = 2 })
    assert(applied == true)
    assert(build.mainSocketGroup == 2)
    assert(build.calcsTab.input.skill_number == 1)
    return tostring(#calculated.skillBreakdown.sections)..":"..tostring(build.calcsTab.input.skill_number)
  `);
  assert.equal(result, '2:1');
});

test('commits official buffMode changes and reflects in build projection', async () => {
  const result = await runLua(`
    local calls = { tabulate = 0 }
    local build = {
      spec = { curClassName = "Witch", allocNodes = {} },
      characterLevel = 90,
      skillsTab = { socketGroupList = {} },
      itemsTab = { items = {}, activeItemSetId = 1, itemSets = { [1] = { title = "Default", useSecondWeaponSet = false } } },
      treeTab = { activeSpec = 1, specList = { { title = "Default", allocNodes = {} } } },
      configTab = { activeConfigSetId = 1, configSets = { [1] = { title = "Default" } } },
      calcsTab = {
        input = { misc_buffMode = "EFFECTIVE" },
        calcsEnv = {
          player = {
            output = { TotalDPS = 1000 },
            modDB = {
              Tabulate = function()
                calls.tabulate = calls.tabulate + 1
                return {}
              end,
            },
          },
        },
        sectionList = {
          {
            subSection = {
              {
                data = {
                  {
                    label = "Expensive source",
                    { format = "{output:TotalDPS}", modType = "INC", modName = "Damage" },
                  },
                },
              },
            },
          },
        },
        BuildOutput = function(self)
          self.mainOutput = { TotalDPS = 1000 }
        end,
      },
      SaveDB = function() return "<PathOfBuilding2><Calcs><Input name=\\"misc_buffMode\\" string=\\"COMBAT\\"/></Calcs></PathOfBuilding2>" end,
    }
    local runtime = { build = build, newBuild = function() end, loadBuildFromXML = function() end }
    local adapter = Adapter.new(runtime)
    local result = adapter:commitBuildChanges({ changes = { buffMode = "COMBAT" } })
    assert(result.success == true)
    assert(build.calcsTab.input.misc_buffMode == "COMBAT")
    assert(result.data.build.buffMode == "COMBAT")
    assert(result.data.build.skillBreakdown.dpsPipeline.totalDPS == 1000)
    assert(#result.data.build.skillBreakdown.sections == 0)
    assert(result.data.build.skillBreakdown.dynamicSubSections["1"].rows[1].value == "1000")
    -- The dynamic row calls Tabulate once with the exact official context.
    -- Retrying with an empty context would invent a different source set.
    assert(calls.tabulate == 1)
    return result.data.build.buffMode .. ":" .. tostring(calls.tabulate)
  `);
  assert.equal(result, 'COMBAT:1');
});

test('projects each official radius visual through the native renderer without combining rows', async () => {
  const result = await runLua(`
    local actor = {
      output = {
        PresenceRadius = 999,
        PresenceRadiusMetres = 8,
        SurroundedRadius = 777,
        SurroundedRadiusMetres = 3,
      },
      breakdown = {
        PresenceRadius = { "^7Base radius: 8.0m", radius = 80 },
        SurroundedRadius = { "^7Base radius: 3.0m", radius = 30 },
      },
    }
    local renderedRadii = {}
    function DrawImage() error("the official renderer was not intercepted") end
    local build = {
      calcsTab = {
        calcsEnv = { player = actor },
        sectionList = {
          {
            subSection = {
              {
                label = "Other Effects",
                data = {
                  {
                    label = "Presence Radius",
                  {
                      format = "{1:output:PresenceRadiusMetres}m",
                      { breakdown = "PresenceRadius" },
                    },
                  },
                  {
                    label = "Surrounded Radius",
                    {
                      format = "{1:output:SurroundedRadiusMetres}m",
                      { breakdown = "SurroundedRadius" },
                    },
                  },
                },
              },
            },
          },
        },
        BuildOutput = function(self) self.mainOutput = {} end,
      },
    }
    local runtime = {
      build = build,
      newBuild = function() end,
      loadBuildFromXML = function() end,
      main = {
        RenderCircle = function(_, x, y, width, height, originX, originY, radius)
          assert(x == 0 and y == 0 and width == 480 and height == 270)
          assert(originX == 0 and originY == 0)
          renderedRadii[#renderedRadii + 1] = radius
          DrawImage(nil, radius, 10, 20, 1)
        end,
      },
    }
    local adapter = Adapter.new(runtime)
    local projected = adapter:calculate("calculate")
    assert(projected.success == true)
    local subSection = projected.skillBreakdown.dynamicSubSections["Other Effects"]
    local presence = subSection.rows[1]
    local surrounded = subSection.rows[2]
    assert(presence.value == "8m")
    assert(presence.radiusVisual.key == "PresenceRadius")
    assert(presence.radiusVisual.label == "Presence Radius")
    assert(presence.radiusVisual.radius == 80)
    assert(presence.radiusVisual.displayValue == "8m")
    assert(presence.radiusVisual.scanlines[1].x == 80)
    assert(surrounded.value == "3m")
    assert(surrounded.radiusVisual.key == "SurroundedRadius")
    assert(surrounded.radiusVisual.radius == 30)
    assert(surrounded.radiusVisual.scanlines[1].x == 30)

    actor.breakdown.PresenceRadius.radius = nil
    local missing = adapter:calculate("calculate")
    local missingSubSection = missing.skillBreakdown.dynamicSubSections["Other Effects"]
    assert(missingSubSection.rows[1].radiusVisual == nil)
    assert(missingSubSection.rows[2].radiusVisual.radius == 30)
    return table.concat(renderedRadii, ":")
  `);
  assert.equal(result, '80:30:30');
});
