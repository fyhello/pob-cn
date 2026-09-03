# R30: Official Calculation Breakdown Projection

## Problem

The Web calculation page recursively printed `calcsEnv.player.breakdown`.
That exposed PoB implementation fields such as `affixLimit`, `group`, `level`,
and `type`, while omitting much of the actual skill damage detail. Selecting a
skill for calculation also rewrote `build.mainSocketGroup`, so viewing another
calculation could accidentally change the main DPS group.

## Change

- The Headless adapter now mirrors the upstream `CalcBreakdownControl` data
  path: visible `calcsTab.sectionList` rows select only their official
  breakdown text, tables, reservation rows, damage-type rows, and slot rows.
- Breakdown output is structured as `skillBreakdown.sections`. It contains
  scalar display text and declared table columns only; raw calculator and
  item-affix internals are never serialized to the Web client.
- `calcsSkillGroup` is an explicit canonical Build field backed by
  `calcsTab.input.skill_number`. It is independent from `mainSocketGroup`.
- The calculation page renders the returned structure and exposes a separate
  calculation-skill selector through the canonical Bridge commit transaction.

## Verification

- `node --test cn/tests/bridge/real-calc-adapter.spec.mjs` passed: 19/19.
  The new fixture verifies both visibility filtering/no internal-field leak and
  that changing the calculation group leaves the main DPS group untouched.
- `npm run web:build` passed.
- Runtime check on the real imported Build after restarting the Bridge and
  Vite from `C:\Users\25147\Documents\pob-cn`: the calculation page showed
  the independent selector plus full official skill, ailment, resource,
  resistance, and defensive detail tables. The previous internal fields were
  absent.
