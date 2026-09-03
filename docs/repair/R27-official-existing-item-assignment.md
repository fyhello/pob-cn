# R27: Official existing-item assignment transaction

## Scope

R27 replaces local equipment and jewel state writes with one canonical PoB transaction for an item that already exists in the official item library.

The public request is `POST /api/items/assign`:

```json
{
  "code": "canonical PoB document",
  "expectedRevision": 7,
  "target": { "itemSetId": 2, "slotName": "Weapon 1" },
  "itemId": 12
}
```

`target` may instead be `{ "kind": "jewel", "specId": 2, "nodeId": 200 }`. `itemId: null` clears the official target slot.

## Transaction guarantees

- Bridge reloads the request canonical document before every assignment.
- Lua accepts only a positive numeric ID from `itemsTab.items`, checks `IsItemValidForSlot`, uses `SetSelItemId`, `PopulateSlots`, `BuildOutput`, `SaveDB`, and `projectBuild`.
- An assignment to another item set or passive-tree spec restores the previously active context before export and projection.
- Any target, item, validity, calculation, export, or projection failure restores the pre-transaction XML and returns no new canonical revision.
- A successful Bridge response contains the encoded canonical document, `sourceRevision`, incremented `revision`, official build projection, and official output.
- Store applies success only through `applyOfficialProjection`; it does not locally mutate equipment or jewel bindings and recalculate.

## Removed local calculation paths

- Store no longer exposes local add/remove/equip/unequip/socket/delete item actions, or legacy `equippedItems -> addItem` hydration.
- Store calculation requests no longer include `itemLibrary`, `equippedSlots`, `jewelSlotBindings`, or `socketedJewels`.
- Lua no longer accepts or applies those item payloads, and no longer runs `PopulateSlots` from calculation input.
- Removing a passive node no longer silently edits the local jewel map.

## Verification

Ran once after implementation:

```text
node --test cn/tests/bridge/real-calc-adapter.spec.mjs cn/tests/bridge/http-server.spec.mjs cn/tests/web/canonical-build-store.spec.mjs
```

Result: 35 passed, 0 failed.

The Lua transaction fixture covers existing-item assignment, empty assignment, invalid ID rejection, calculation rollback, a non-active item set, and a non-active passive tree. Bridge and Store fixtures verify canonical reload/revision behavior and atomic projection replacement.
