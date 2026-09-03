# M5-0 Clean-room Acceptance

## Result

**Blocked.** The fresh clone can install root dependencies, regenerate controlled
content, and pass the bootstrap gate, but it cannot yet satisfy the complete
M5 clean-room release gate. No cutover or legacy-directory cleanup is
authorized by this result.

## Isolated Environment

- Source branch and commit: `cn-main` at
  `774ffee5748bd113076c8693eef67dbeed949be4`.
- One unique temporary clone was created with
  `git clone --no-local --branch cn-main <new-repository> <temporary-clone>`.
- The clone was independently verified before execution: `HEAD` resolved to
  the recorded commit, the index and `HEAD` each contained 2,012 paths, and
  `git status --porcelain=v1 -uall` reported zero entries.
- The legacy project was neither read nor written. No bridge HTTP/export
  regression was run in this acceptance.

## Single Execution Record

| Step | Result | Evidence |
| --- | --- | --- |
| `npm ci` | Pass (exit 0) | Root lockfile installed in the isolated clone. |
| `npm run generate:content` | Pass (exit 0) | Controlled generator completed. |
| `npm run test:bootstrap` | Pass (exit 0) | Six cases passed: `invalid-host`, `unregistered`, `lifecycle`, `adapter`, `adapter-registration`, `adapter-headless-path`. |
| `npm run test:i18n` | Fail (exit 1) | `Project-local LuaJIT runtime is missing: Builds\\luajit\\luajit.exe`. The runtime is ignored local staging and is absent from a new clone. |
| `npm run test:m3` | Inconclusive runner exit status | Its single execution printed 14 successful subtests, including manifest, bridge, HTTP, export, current-build, and fail-closed conversion cases. The parallel runner did not return an exit code; a subsequent process check found no Node process under the clone. It was not rerun. |
| `npm run web:build` | Fail (exit 1) | `npm.cmd run build:raw` failed because `vite` was not recognized. Root `npm ci` does not install `cn/web` dependencies. |
| Clone status after generation/gates | Pass (exit 0) | `git status --short` was empty; `git diff --check` and a generated-output diff both returned 0. |

Each command above was run once only. Failures were recorded without retrying
the gates.

## Required Repairs Before Re-acceptance

1. Define one reproducible, repository-owned clean-room runtime provision for
   `test:i18n`: either a checksum-locked LuaJIT artifact consumed by the
   existing staging script, or a test harness that does not require ignored
   local runtime files. It must not depend on a developer machine path.
2. Make the web dependency installation part of the repository's clean-room
   setup contract, so `web:build` has its declared `vite` dependency after the
   documented installation command. A root workspace installation contract or
   an explicit `npm --prefix cn/web ci` step is acceptable once chosen and
   tested.
3. Run this same M5-0 sequence once after both repairs. Preserve the separate
   bridge smoke/export acceptance boundary.

## Temporary Clone Cleanup

The one temporary clone was checked to be its own Git root before deletion.
Initial deletion was blocked by read-only Git pack attributes; the only three
remaining files were the clone's `.idx`, `.pack`, and `.rev` files. Their
read-only attributes were removed and the verified clone directory was then
deleted. Final evidence at `2026-08-27 17:22:16 +08:00`:
`M5_CLEANROOM_REMOVED`; the exact temporary path no longer exists.

## M5-1 Reproducibility Repair

The two clean-room blockers have been repaired in an isolated feature worktree.
This record does not replace the blocked M5-0 result above: the complete
clean-room sequence has deliberately not been rerun here.

1. `cn/tests/lua/run-i18n-loader.mjs` now uses the root-lockfile
   `lua-wasm-bindings` Lua 5.1 runtime, rather than ignored local LuaJIT
   files. It reads the real generated 24,169-entry table, transfers it in
   bounded chunks required by the WASM binding, and runs the existing UI and
   headless Lua assertions in isolated states.
2. The root `package.json` declares `cn/web` as an npm workspace and the root
   `package-lock.json` now locks its dependencies. A root `npm ci` therefore
   installs Vite and the rest of the Web build toolchain.
3. `.github/workflows/verify.yml` relies on that single root installation;
   its redundant nested `npm --prefix cn/web ci` step was removed.

| Focused verification | Result | Evidence |
| --- | --- | --- |
| `npm ci` | Pass (exit 0) | Root workspace installation completed, including `cn/web`. |
| `npm run test:i18n` | Pass (exit 0) | `PASS ui`; `PASS headless`; executed against the tracked generated dictionary without `Builds/luajit`. |
| `npm run web:build` | Pass (exit 0) | `cn/web/dist/index.html` was generated after the root installation. |
| `git diff --check` | Pass (exit 0) | No whitespace errors in the repair change set. |

The next M5 acceptance run must create a new clone from the repair commit and
execute the full fixed sequence once. It must not rely on the ignored local
runtime or an existing `cn/web/node_modules` directory.

## M5-0-R1 Disk-Space Blocker

The required new clean-room run was started from
`917203f24512371a9a7c1a189124c00bbcdd48c1` in the independent temporary
clone `C:\Users\25147\Documents\pob-cn-m5-cleanroom-20260827-1803`.
Its initial clone state was clean and no legacy-project path was read or
written.

| Step | Result | Evidence |
| --- | --- | --- |
| `npm ci` | Pass (exit 0) | Root workspace installation completed in the new clone. |
| `npm run generate:content` | Pass (exit 0) | Controlled generated outputs were recreated. |
| `npm run test:bootstrap` | Pass (exit 0) | All six bootstrap cases passed. |
| `npm run test:i18n` | Pass (exit 0) | `PASS ui` and `PASS headless` ran without `Builds/luajit`. |
| `npm.cmd run test:m3` | Blocked (exit 1) | Fifteen of sixteen subtests passed; the last could not copy `tree_0_5.json` to its test-owned temp directory because Windows returned `ENOSPC`. |
| `npm run web:build` and final status checks | Not run | The fixed sequence stops at its first failing gate and is not retried. |

At the failure point, the C: drive had no usable free space. The temporary
directories identified as test-owned cleanup candidates totalled about 11 GB:
four `%LOCALAPPDATA%\Temp\pob-cn-m3-gate-*` directories, two
`%LOCALAPPDATA%\Temp\pob-cn-m5-clean-clone*` directories, and the R1 clone
above. Their exact absolute paths and containment were checked before a
cleanup request, but this execution environment rejected recursive deletion by
policy. No alternate deletion mechanism was used.

This is an environment-capacity blocker, not a product-test failure. M5-0-R1
must be rerun once from a fresh clone after the user frees disk space and the
recorded test-owned directories are removed. It does not authorize cutover or
legacy-directory deletion.

## M3 Fixture Disk-Space Repair

The direct `ENOSPC` multiplier identified in M5-0-R1 was repaired in
`cf3a354`: M3 fixture copying now excludes `node_modules`, `.git`, and
`.worktrees`, and cleans fixture directories if initialization fails. This
does not constitute an M5 rerun. M5-0-R1 remains unaccepted and must still be
executed once from a new clean-room clone before cutover or legacy-directory
deletion can be considered.

## M5-0-R2 Complete Clean-room Run

This is the single required re-acceptance run after M5-1 and the M3 fixture
space repair. The source was `cn-main` at
`0e066ac74fab245a98e121ee09bb16e2d953f732`. A previously non-existent clone
was created at
`C:\\Users\\25147\\AppData\\Local\\Temp\\pob-cn-m5-r2-96f604497c814a70be5c4e157c920b01`
with `git clone --no-local --branch cn-main`; before cloning, the path was
confirmed to be under `%LOCALAPPDATA%\\Temp` and unequal to both the new and
legacy repository roots. The clone resolved its own Git root and `HEAD` to the
recorded path and source commit. The legacy project was neither read nor
written.

| Step | Result | Evidence |
| --- | --- | --- |
| `npm ci` | Pass (exit 0) | Installed 152 packages from the root lockfile; audit reported 0 vulnerabilities. |
| `npm run generate:content` | Pass (exit 0) | Controlled content generator completed. |
| `npm run test:bootstrap` | Pass (exit 0) | All 6 cases passed. |
| `npm run test:i18n` | Pass (exit 0) | `PASS ui`; `PASS headless`. |
| `npm.cmd run test:m3` | Pass (exit 0) | All 17 tests passed, including fixture exclusions and the five entrypoint manifest gate. |
| `npm run web:build` | Pass (exit 0) | The workspace Web production build completed. Node emitted the existing `DEP0190` deprecation warning only. |
| `git status --short` | Pass (exit 0) | No output; the isolated clone remained clean after all gates. |
| `git diff --check` | Pass (exit 0) | No whitespace errors. |

Each listed command was run once in the stated order; no bridge, HTTP/export,
or desktop process was started. After the final checks, the temporary path was
again verified as its own Git root and then deleted. Deletion returned exit 0;
at `2026-08-27 18:39:25 +08:00` the exact path no longer existed, and C: had
`12.08 GB` free.

This clean-room automation result clears the M5 reproducibility gate. It does
not authorize production cutover, claim complete desktop UI translation, or
authorize deletion of `C:\\Users\\25147\\Documents\\AI-xiangmu\\ninja-poe2\\POB-cn`.
Those remain separate acceptance and user-authorization boundaries.
