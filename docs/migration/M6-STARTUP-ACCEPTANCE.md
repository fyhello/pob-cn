# M6 Startup and Export Acceptance

## Scope

- Materialize the `cn-main` worktree at `C:\Users\25147\Documents\pob-cn`.
- Remove runtime dependence on the legacy project path.
- Use the official headless build for import, calculation, and `SaveDB()` export.
- Keep LuaJIT executables and DLLs local and ignored under `Builds/luajit/`.

## Runtime Contract

`cn/bridge/service.mjs` starts from the repository root and resolves the runtime only from `POB_CN_LUAJIT` or `Builds/luajit/luajit.exe`. It sets a repository-relative `LUA_PATH` for `runtime/lua`. `cn/bridge/stage-local-runtime.ps1` stages `luajit.exe`, `lua51.dll`, and `lua-utf8.dll` into that local directory from explicitly supplied build artifacts; it contains no machine-specific source path.

## Runtime Provenance and Recovery Plan (2026-09-03)

This section closes the provenance gap only. It does not add an automatic download,
copy any historical project, or make a historical directory a runtime dependency.

### Verified Runtime Set

The bridge runtime is one inseparable Windows x64 set. The staged files currently
identified by SHA-256 are:

| File | SHA-256 |
| --- | --- |
| `luajit.exe` | `B9DA559783CBA27D24FD1E1969D9C7C7A87550692734A19C073DF7F20E104461` |
| `lua51.dll` | `9209BADEE5AF72A4E118B0286CF44260126DC6F8212C0E0AA73F146B0DFF527F` |
| `lua-utf8.dll` | `8F49400E2C84716C3CAF27C5B1D60133B7F598748FA9CDD31F0732A0642AF96D` |

The first two files are byte-identical to the LuaJIT outputs retained by the
historical SimpleGraphic build. `lua-utf8.dll` is byte-identical to the tracked
`runtime/lua-utf8.dll` in this repository. That history is evidence of origin,
not an allowed runtime source.

Do not substitute the bridge `lua51.dll` with `runtime/lua51.dll` (SHA-256
`2E4E58E4CC6F6CB01D119FF3715253108041F6C59F9A6A464A62B2F70623BCA6`) or
with the DLL inside `runtime-win32.zip`. They are a different desktop-runtime
artifact and have a different hash. A staging step must reject any mixed set.

### Rebuild Inputs Confirmed from the Historical Source

- LuaJIT: `LuaJIT/LuaJIT` commit
  `2460b3ff93a1c955de3d62cfc825de7d68dc272e`, through the `2026-07-20`,
  port-version `1` vcpkg port. Its source SHA-512 is
  `f7b35a4690b5bfc847dc9f94288cc7c51b7a3bd84a793b5841889ecc7dc2d60b67b3b9f31f3e713a0c8867a719c27b129289f6d90d64dccf54595e270c6c2977`.
- The port was supplied by vcpkg ports commit
  `b04f28febfb691019be686f86590b4ed3d4621cd`, with the custom
  `msvcbuild.patch` and `pob-wide-crt.patch`. Its vcpkg configuration used
  builtin baseline `66c0373dc7fca549e5803087b9487edfe3aca0a1` and target
  triplet `x64-windows`.
- Lua UTF-8: `starwing/luautf8` commit
  `bdd3d7fb6ef22334fde028ba792d3a16309a4de8` (MIT). The historical CMake
  target compiles `lutf8lib.c` as `lua-utf8.dll` and links it to LuaJIT.
- The recorded builder was CMake with Visual Studio 2022 (`Visual Studio 17
  2022`), x64, and the vcpkg toolchain. The old build script contains absolute
  paths and proxy settings and must not be copied into this repository.

### Required Completion Gates

1. Add a minimal, repository-owned runtime build recipe and source lock. It may
   contain only the LuaJIT port metadata and its two required patches, the exact
   Lua UTF-8 source reference, toolchain requirements, licenses, and checksums.
   It must not import SimpleGraphic, the old launcher, the desktop runtime ZIP,
   or any historical application source.
2. Add a staging verification gate which accepts only all three named files,
   checks their provenance/checksums for a released artifact, and rejects a
   mismatched `lua51.dll`. The current staging script remains a copy-only
   mechanism until that gate is reviewed and implemented.
3. In a fresh directory, rebuild only LuaJIT and `lua-utf8.dll` from the pinned
   inputs, then validate `luajit -v`, `require('lua-utf8')`, bridge `/health`,
   and one official import/calculate/export round trip. A locally rebuilt binary
   need not have the same full-file SHA-256 because compiler and PDB paths are
   embedded; functional acceptance and recorded inputs are required.
4. Only after the clean rebuild passes, decide the distribution policy: a
   checksum-locked release artifact may remain outside Git, while the minimal
   source lock and recipe must be versioned. Do not commit runtime binaries
   before that review.

Status: the repository-owned minimal recipe, vendored sources, licenses, and
patch provenance are versioned under `cn/bridge/runtime-build/`. An independent
clean-room rebuild has passed. This source tree can now rebuild the bridge
runtime without any legacy project directory or network download.

### Executed Recovery Acceptance

The recovery builder is:

```powershell
pwsh -NoProfile -File cn/bridge/runtime-build/build-runtime.ps1 -Stage
```

It requires the local Visual Studio 2022 x64 C++ Build Tools. It copies only
the tracked, vendored sources to an ignored `Builds/runtime-build-work/` path,
builds the three files, validates LuaJIT and `require('lua-utf8')`, then stages
only those three outputs to `Builds/luajit/` when `-Stage` is supplied. It does
not download, search, or reference a legacy directory.

On 2026-09-03, the builder was run from this baseline with a separate ignored
output directory. It produced `luajit.exe`, `lua51.dll`, and `lua-utf8.dll`;
reported `LuaJIT 2.1.1784580905`; successfully loaded `lua-utf8`; and started
an independent bridge on port `3004`, whose `/health` response was
`{"ready":true}`. The test process was stopped after acceptance and did not
replace the active `Builds/luajit/` runtime.

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
