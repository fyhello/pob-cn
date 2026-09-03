# R29: Full Locked Dictionary for Web Projection

## Problem

The Web client generated and consumed only the `terms` domain of the locked
`poe2.json.gz` dictionary. Imported rare names, item bases, UI labels, and
runtime stat lines that exist in the other dictionary domains therefore fell
back to English.

## Change

- `web.translation` now generates all five locked dictionary domains:
  `items`, `stats`, `tooltip`, `ui`, and `terms` (70,227 records).
- The content contract stores per-domain counts and fails generation when an
  upstream dictionary update changes the required coverage.
- The Web localizer selects the appropriate official domain for names, UI, and
  stat lines. Numeric stat templates retain PoB's returned Roll values while
  using their locked Chinese text.
- Equipment and skills panels use localized imported names and no longer add
  English parenthetical slot labels.

## Verification

- `npm run generate:content` completed with the generated manifest recording
  70,227 Web translation records.
- `node --test cn/tests/pipeline/content-contract.spec.mjs` passed before the
  localized projection assertions were finalized.
- `node --test cn/tests/web/import-localization.spec.mjs` passed, covering
  imported names, composed skill names, and dynamic official stat templates.
