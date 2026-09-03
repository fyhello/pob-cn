# R24 - Official runes for strict craft drafts

Status: complete

## Scope

- `cn/lua/real-calc-adapter.lua`
- `cn/tests/bridge/real-calc-adapter.spec.mjs`

## Resolution

Strict create/replace drafts may now include `draft.runes`, but only after the
new item has been parsed by the official PoB item parser. The adapter takes the
official `itemSocketCount` as the only socket authority, requires an exact rune
count, and validates every rune with `itemsTab:GetValidRunesForItem`. It rejects
socket-bound runes through `itemsTab:IsSocketBoundRune` when that API is
available.

The adapter applies accepted runes through `Item:UpdateRunes` and
`Item:BuildAndParseRaw`, then verifies both the official socket count and each
rune after rebuilding. Draft fields for raw text or socket counts are rejected;
the draft cannot create or describe sockets itself.

## Acceptance

The focused adapter regression covers a valid one-socket craft, preview
rollback, canonical XML returned from commit, wrong rune count, a socketless
base, an invalid bound rune, and a forged `sockets` draft field.
