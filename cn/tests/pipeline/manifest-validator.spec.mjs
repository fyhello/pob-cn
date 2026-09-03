import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertManifestComplete,
  validateManifest,
} from '../../pipeline/lib/manifest-validator.mjs';

const partial = {
  schema_version: 1,
  completeness: 'partial_crafting_seed_pending',
  generator: { command: 'node cn/pipeline/generate-content.mjs', version: 1 },
  upstream: { commit: 'a'.repeat(40) },
  dictionary: { gzip_sha256: 'd'.repeat(64), payload_sha256: 'e'.repeat(64), schema_sha256: 'f'.repeat(64) },
  inputs: [{ id: 'dictionary.ninja-poe2.poe2-runtime-gzip', path: 'cn/pipeline/sources/dictionary/ninja-poe2/poe2.json.gz', sha256: 'b'.repeat(64) }],
  outputs: [{ id: 'web.translation', path: 'cn/generated/web-data/translations.json', sha256: 'c'.repeat(64), input_ids: ['dictionary.ninja-poe2.poe2-runtime-gzip'], record_count: 1 }],
  untranslated: { count: 0, allowlist: [] },
};

test('accepts the M2-2 partial manifest but rejects it at a consumer gate', () => {
  assert.doesNotThrow(() => validateManifest(partial));
  assert.throws(
    () => assertManifestComplete(partial, 'cn/generated/manifest.json'),
    /cn\/generated\/manifest\.json.*partial_crafting_seed_pending.*crafting seed pending/i,
  );
});

test('requires manifest structural provenance', () => {
  const invalid = structuredClone(partial);
  delete invalid.outputs[0].input_ids;
  assert.throws(() => validateManifest(invalid), /input_ids/);
});
