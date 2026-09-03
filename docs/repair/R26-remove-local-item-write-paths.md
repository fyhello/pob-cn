# R26 Remove Local Item Write Paths

## Scope

Remove item-creation paths that could create local-only items and then feed them into calculation requests without a canonical PoB document update.

## Changes

- Removed the arbitrary item-text modal and every entry point to it from `ItemsPanel.vue`.
- Removed `saveCraftedItem`, which minted `custom_*` IDs, modified local equipment state, and recalculated without an official commit.
- Removed the unused `ItemCraftingModal.vue`, including its raw PoB text editor and locally assembled item preview.

## Verification

- Red: `node --test cn/tests/web/legacy-local-item-write.spec.mjs` initially failed because the slot picker still exposed an old custom-item entry point.
- Green: removed that last entry point; the same command passed `2/2`.
- `npm run web:build` passed. Node emitted the existing `DEP0190` warning only.

## Boundary

This stage deliberately does not keep a local replacement for the removed actions. Existing-item equip, unequip, and jewel assignment still require a separate official canonical transaction before their local actions can be removed safely.
