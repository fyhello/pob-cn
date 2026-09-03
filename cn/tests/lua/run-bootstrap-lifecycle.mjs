import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LUA_OK } from "lua-wasm-bindings/dist/lua.js";
import { lauxlib, lua, lualib } from "lua-wasm-bindings/dist/lua.51.js";

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const sourcePaths = {
  lifecycle: "cn/bootstrap/Lifecycle.lua",
  init: "cn/bootstrap/Init.lua",
  main: "src/Modules/Main.lua",
  spec: "cn/tests/lua/bootstrap_lifecycle_spec.lua",
};

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(sourcePaths).map(async ([name, relativePath]) => [
      name,
      await readFile(resolve(repositoryRoot, relativePath), "utf8"),
    ]),
  ),
);

function setGlobal(state, name, value) {
  lua.lua_getglobal(state, "_G");
  lua.lua_pushstring(state, value);
  lua.lua_setfield(state, -2, name);
  lua.lua_settop(state, 0);
}

function runCase(name) {
  const state = lauxlib.luaL_newstate();
  try {
    lualib.luaL_openlibs(state);
    setGlobal(state, "__LIFECYCLE_SOURCE", sources.lifecycle);
    setGlobal(state, "__INIT_SOURCE", sources.init);
    setGlobal(state, "__MAIN_SOURCE", sources.main);
    setGlobal(state, "__TEST_CASE", name);

    const status = lauxlib.luaL_dostring(state, sources.spec);
    if (status !== LUA_OK) {
      throw new Error(lua.lua_tostring(state, -1) ?? "Lua test failed without an error message");
    }
  } finally {
    lua.lua_close(state);
  }
}

for (const name of ["invalid-host", "unregistered", "lifecycle", "adapter", "adapter-registration", "adapter-headless-path"]) {
  runCase(name);
  console.log(`PASS ${name}`);
}
