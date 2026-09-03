# M6 Startup and Export Acceptance

## Scope

- Materialize the `cn-main` worktree at `C:\Users\25147\Documents\pob-cn`.
- Remove runtime dependence on the legacy project path.
- Use the official headless build for import, calculation, and `SaveDB()` export.
- Keep LuaJIT executables and DLLs local and ignored under `Builds/luajit/`.

## Runtime Contract

`cn/bridge/service.mjs` starts from the repository root and resolves the runtime only from `POB_CN_LUAJIT` or `Builds/luajit/luajit.exe`. It sets a repository-relative `LUA_PATH` for `runtime/lua`. `cn/bridge/stage-local-runtime.ps1` stages `luajit.exe`, `lua51.dll`, and `lua-utf8.dll` into that local directory from explicitly supplied build artifacts; it contains no machine-specific source path.

## Export Contract

- `/api/import` decodes a PoB code and uses official `loadBuildFromXML()`.
- `/api/export` uses the current official Build object and `build:SaveDB()`.
- Export is zlib-compressed URL-safe Base64 PoB sharing code.
- A build held at the official conversion prompt fails closed with `POB_BUILD_LOAD_INCOMPLETE`; it is not reported as a successful import.

## Recorded Environment Boundary

During acceptance, port `3002` was occupied by the already-running legacy `server.mjs`. The new bridge was started on `127.0.0.1:3003` through `POB_CN_PORT=3003`; no legacy process was stopped or used as a runtime dependency.

## Acceptance Result

- `npm run test:bootstrap`: 6/6 lifecycle and headless-path cases passed.
- `npm run test:m3`: 14/14 manifest, bridge, HTTP, runtime-environment, export, and fail-closed import cases passed.
- `npm run web:build`: production bundle was generated under `cn/web/dist/`.
- The local bridge started from `C:\Users\25147\Documents\pob-cn` and returned an official `/api/stats` output on port 3003.
- A current-version fixture completed `import -> export -> import -> export`. The canonical exports both retained `Build`, `Skills`, one `SkillSet`, and two nested `Skill` groups. The exported code format was `pob-share-code`.

The initial fixture lacked `targetVersion`; it was supplied with the locked current value `0_1` for the live round-trip. This is necessary because upstream PoB opens an interactive conversion flow for legacy `0_0` XML. M6 rejects that incomplete state instead of claiming it loaded successfully.

## Deferred Work

`cn/config/content-contract.json` declares `cn/lua/i18n/loader.lua`, but that loader does not yet exist. The generated `cn/generated/lua-i18n/translations.lua` is therefore not integrated with the official desktop UI. This is a separate M7 implementation blocker for the complete-translation claim, not a condition hidden by M6 startup/export acceptance.
