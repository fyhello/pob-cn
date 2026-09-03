# R1 - Transactional official calculation updates

Status: complete

## Scope

- `cn/lua/real-calc-adapter.lua`
- `cn/tests/bridge/real-calc-adapter.spec.mjs`

## Defect

The calculation adapter changed official Build fields such as character level
before validating later request inputs. A rejected later item, equipment, jewel,
or skill input could leave those earlier changes in the loaded PoB Build.

## Resolution

Any calculation request containing editable inputs now takes an official PoB XML
snapshot through `Build:SaveDB` before applying changes. If application,
calculation, or output validation fails, the adapter reloads that snapshot with
the official `loadBuildFromXML` API and returns the original failure. A
successful request retains the changed official Build.

## Acceptance

The targeted adapter test submits a valid level change followed by an invalid
item id. It verifies that the request is rejected, `BuildOutput` is not called,
and the active official Build's level and auto-level mode are restored to their
pre-request values.
