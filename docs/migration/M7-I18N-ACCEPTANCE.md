# M7 Generated I18N UI Integration Acceptance

## Implemented Scope

- `cn/lua/i18n/loader.lua` loads only the controlled generated table at `cn/generated/lua-i18n/translations.lua` through a repository-relative `loadfile` path. It has no legacy-project path or runtime dependency.
- The existing CN bootstrap adapter in `src/Modules/Main.lua` registers `lua-i18n.loader` in the `i18n` pre-init lifecycle stage. The upstream initialization flow is otherwise unchanged.
- The loader translates exact dictionary keys, preserves leading PoB colour prefixes such as `^7` and `^xAABBCC`, and leaves unknown text untouched.
- `DrawString` and `DrawStringWidth` are wrapped only when they exist. `Control:GetProperty()` translates the common display properties `text`, `tooltipText`, `label`, `title`, `placeholder`, and `prompt`; the `new()` factory rechecks the hook after lazy Control-class loading.
- The hook installation is idempotent. Rendering an already translated Control property passes through unchanged, and a no-drawing-primitives environment still initializes the dictionary successfully.

## Red/Green Evidence

- Red: before the loader existed, `node cn/tests/lua/run-i18n-loader.mjs` failed with `ENOENT` for `cn/lua/i18n/loader.lua`. This demonstrated that the generated table had no runtime consumer.
- Green: `npm run test:i18n` completed with `PASS ui` and `PASS headless`. It runs the project-local LuaJIT runtime against the actual generated 24,169-entry Lua table and verifies dictionary loading, draw wrappers, Control `text` and `tooltipText`, colour-prefix preservation, unknown text, idempotence, lazy new-Control handling, and no-drawing headless initialization.
- Regression: `npm run test:bootstrap` completed with all six existing lifecycle/adapter cases passing.
- Headless smoke: from `src`, the project-local LuaJIT ran `../cn/bridge/calc_server.lua` and emitted `POB_JSON` ready with `calculator.available=true`.

## Remaining Translation Boundary

This is an integration milestone, not a complete desktop-translation claim. The current generated artifact is the 24,169-entry `terms` contract, so any desktop wording absent from that exact-key table remains English. Dynamic/concatenated strings, text rendered outside `DrawString`/`DrawStringWidth`, direct raw property reads that bypass `Control:GetProperty()`, images, and third-party/native UI surfaces are not covered by this hook. No manual full-screen desktop walkthrough has been recorded; visible layout, clipping, input behavior, and untranslated UI inventory still require that acceptance pass.
