# R8 - Official Crafting Core

Status: complete

## Contract

`/api/items/preview` and `/api/items/commit` require a caller-provided canonical
PoB document and positive revision. The Bridge reloads that document before it
uses the official PoB item APIs. Drafts contain only official base names,
rarity, item level, quality, affix IDs, and normalized Rolls; arbitrary item
text is not accepted.

Preview restores the official XML snapshot. Commit retains the official item,
returns a new XML share code, and increments the caller revision.

## Verification

- `node --test cn/tests/bridge/real-calc-adapter.spec.mjs` (9 passing)
- `node --test cn/tests/bridge/http-server.spec.mjs` (4 passing)
