# R27a Official Item Assignment UI

## Scope

Connect the existing equipment and passive-tree jewel interfaces to R27's canonical item-assignment transaction. Remove every local item-state write that could display or calculate a result different from the exported PoB XML.

## Changes

- `ItemsPanel.vue` now awaits `commitOfficialItemAssignment` for equip, replace, unequip, socket, and unsocket. It keeps the picker open and reports the Bridge error when the official transaction is rejected.
- `PassiveTreeCanvas.vue` now uses the same official transaction for socketing and unsocketing. It requires the active canonical passive spec and leaves the modal open on failure.
- Removed stale static unique/base injection helpers and the local item-delete control. These actions had no official canonical transaction.
- Added a UI regression guard that rejects the removed local Store APIs and verifies that both components use active-Loadout targets.

## Verification

```powershell
node --test cn/tests/web/r27-official-item-assignment-ui.spec.mjs
```

Result: 2/2 passed. The combined R27/R27a targeted suite later passed 37/37, and `npm run web:build` passed with only the existing Node `DEP0190` warning.

## Boundary

Creating or permanently deleting items from the official library remains disabled until it has its own canonical transaction. Real-build manual acceptance is still required for multi-Loadout assignment, Bridge restart, export/reimport, copy-on-write, and invalid-assignment rollback.
