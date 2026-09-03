import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LUA_OK } from "lua-wasm-bindings/dist/lua.js";
import createLuaGlue from "lua-wasm-bindings/dist/glue/glue-lua-5.1.5.js";
import { createLauxLib, createLua, createLuaLib } from "lua-wasm-bindings/dist/binding-factory.js";

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const sourcePaths = {
  loader: "cn/lua/i18n/loader.lua",
  translations: "cn/generated/web-data/translations.json",
  dkjson: "runtime/lua/dkjson.lua",
  spec: "cn/tests/lua/i18n_loader_spec.lua",
};

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(sourcePaths).map(async ([name, relativePath]) => [
      name,
      await readFile(resolve(repositoryRoot, relativePath), "utf8"),
    ]),
  ),
);

// Keep the wasm fixture small while retaining values from the generated JSON
// artifact that the loader is required to consume.
const generatedTranslations = JSON.parse(sources.translations);
sources.translations = JSON.stringify({
  schema_version: generatedTranslations.schema_version,
  items: { Jewel: generatedTranslations.items?.Jewel },
  stats: { Damage: generatedTranslations.stats?.Damage },
  tooltip: { Skills: generatedTranslations.tooltip?.Skills },
  ui: { Jewel: generatedTranslations.ui?.Jewel },
  terms: {
    Damage: generatedTranslations.terms?.Damage,
    Skills: generatedTranslations.terms?.Skills,
    Jewel: generatedTranslations.terms?.Jewel,
  },
});

function createLua51() {
  const glue = createLuaGlue({
    print: () => {},
    printErr: () => {},
  });
  const lua = createLua(glue, "5.1.5");
  return {
    lua,
    lauxlib: createLauxLib(glue, lua, "5.1.5"),
    lualib: createLuaLib(glue, "5.1.5"),
  };
}

function setGlobal(lua, state, name, value) {
  lua.lua_getglobal(state, "_G");
  lua.lua_pushstring(state, value);
  lua.lua_setfield(state, -2, name);
  lua.lua_settop(state, 0);
}

function runCase(name) {
  const { lua, lauxlib, lualib } = createLua51();
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  setGlobal(lua, state, "__CN_I18N_LOADER_SOURCE", sources.loader);
  setGlobal(lua, state, "__CN_I18N_TRANSLATIONS_JSON", sources.translations);
  setGlobal(lua, state, "__CN_I18N_DKJSON_SOURCE", sources.dkjson);
  setGlobal(lua, state, "__TEST_CASE", name);

  const setupStatus = lauxlib.luaL_dostring(state, `
    local sources = {
      ["cn/lua/i18n/loader.lua"] = __CN_I18N_LOADER_SOURCE,
    }

    io.open = function(path, mode)
      if path == "src/../cn/generated/web-data/translations.json"
        or path == "./../cn/generated/web-data/translations.json" then
        local source = rawget(_G, "__CN_I18N_TRANSLATIONS_JSON")
        return {
          read = function() return source end,
          close = function() end,
        }
      end
      return nil, "missing test source: " .. tostring(path)
    end
    package.preload["dkjson"] = function()
      local chunk, chunkError = loadstring(__CN_I18N_DKJSON_SOURCE, "@runtime/lua/dkjson.lua")
      if not chunk then error(chunkError) end
      return chunk()
    end
    loadfile = function(path)
      local fileSource = sources[path]
      if type(fileSource) ~= "string" then
        return nil, "missing test source: " .. tostring(path)
      end
      return loadstring(fileSource, "@" .. path)
    end
  `);
  if (setupStatus !== LUA_OK) {
    throw new Error(lua.lua_tostring(state, -1) ?? "Lua i18n test setup failed");
  }

  const status = lauxlib.luaL_dostring(state, sources.spec);
  if (status !== LUA_OK) {
    throw new Error(lua.lua_tostring(state, -1) ?? "Lua i18n test failed");
  }

  // lua-wasm-bindings 5.1.5 traps while closing a state expanded for the full table.
  // Each case owns an isolated module, and process exit releases it after this CLI test.
}

for (const name of ["ui", "headless"]) {
  runCase(name);
  console.log(`PASS ${name}`);
}
