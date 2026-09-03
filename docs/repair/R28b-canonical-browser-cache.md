# R28b: Browser Cache Uses Canonical XML Only

## Problem

Earlier browser versions persisted rendered items, skills, output values, and
loadout metadata in localStorage. Those values are not authoritative and could
be stale or fabricated after a restart.

## Change

`buildStore.loadFromStorage()` now restores only a valid canonical PoB document
(sharing code and revision). The next import replaces every rendered field from
the official PoB XML projection. Legacy cached local edits never block a later
official transaction.

## Verification

`node --test cn/tests/web/canonical-build-store.spec.mjs`

Result: 6/6 passing, including a regression that confirms cached fabricated
stats, skills, and equipment cannot be restored without a canonical document.

`npm run web:build` also passed before the test-only assertion correction. The
only output was the existing Node `DEP0190` deprecation warning.
