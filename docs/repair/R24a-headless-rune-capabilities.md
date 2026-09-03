# R24a - Headless crafted-item rune capabilities

Status: complete

## Scope

- `cn/lua/real-calc-adapter.lua`
- `cn/tests/bridge/real-calc-adapter.spec.mjs`

## Resolution

Successful `craftPreview` and `craftCommit` responses now include
`data.runeCapabilities` for the newly parsed official item:

- `socketCount` is the item's official `itemSocketCount`.
- `allowed` is obtained from `itemsTab:GetValidRunesForItem(item)` and excludes
  socket-bound runes when `itemsTab:IsSocketBoundRune` is available.

Strict draft validation and response capability construction share the same
official candidate helper. A socketless item still queries the official item
path and returns `socketCount: 0` with an empty `allowed` list.

## Acceptance

The focused adapter regression verifies one-socket allowed candidates exclude a
bound rune, preview rollback, commit XML, and the explicit zero-socket response.
