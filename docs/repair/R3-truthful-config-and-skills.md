# R3 - Truthful configuration and skill displays

Status: complete

## Scope

- `cn/web/src/App.vue`
- `cn/web/src/components/SkillsPanel.vue`
- `cn/web/src/components/CalcsPanel.vue`
- `cn/tests/web/r3-truthful-config-and-skills.spec.mjs`

## Resolution

The combat Config checkboxes had no official PoB write path, so they were
removed and replaced with a Chinese explanation. The Skills panel now only
selects and reads imported official skill groups. It removes group/gem
creation, deletion, replacement, and the local gem catalog modal.

The former local calculation breakdown used fabricated defaults for crit,
ailments, and damage types. Skills and calculation panels now show only fields
returned by the official bridge; unavailable values state `官方核心未提供`.

## Acceptance

The targeted static contract test rejects editable Config checkboxes,
unsupported skill mutation entry points, and known fabricated defaults.
