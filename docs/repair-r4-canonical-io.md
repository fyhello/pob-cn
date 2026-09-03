# R4 Canonical Build I/O

## Contract

- Input: a successful `/api/import` code or XML payload is saved as the canonical PoB document with a positive local version.
- Restore: `recalculate()` reloads that document through `/api/import` before it asks the bridge to calculate, so a browser restore does not depend on a previous bridge process.
- Export: `/api/export` requires the canonical document and version, reloads the submitted document, then exports it. It does not export whatever build happened to remain in bridge memory.
- Local UI edits retain the canonical document for Bridge restore and official incremental calculation, but mark it as not yet serialized back to XML. Until a supported XML writer exists, export fails visibly in Chinese instead of exporting a stale official document.

## Targeted Acceptance

Command:

```powershell
node --test cn/tests/bridge/http-server.spec.mjs cn/tests/web/canonical-build-store.spec.mjs
```

Actual result: recorded after the R4 correction. The canonical-flow test imports XML, exports version 3 from that exact XML, decodes the resulting share code, and reimports it. The Store regression imports a canonical document, changes level, verifies canonical reload followed by the level calculation request, and verifies that export rejects the dirty local state in Chinese.

Web type-check note: `npm exec vue-tsc --noEmit` could not start because the installed `vue-tsc` resolves `typescript/lib/tsc`, which is no longer exported by the active TypeScript package under Node 24. This is an existing toolchain compatibility issue; the targeted Bridge acceptance above completed.
