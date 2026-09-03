import assert from 'node:assert/strict';
import test from 'node:test';

import { importBuild } from '../../commands/import.mjs';
import { exportBuildRoundTrip } from '../../commands/export-roundtrip.mjs';

const golden = { name: 'Golden', xml: '<PathOfBuilding><Build level="90" /></PathOfBuilding>' };

test('imports and exports a golden PoB XML envelope without data loss', async () => {
  const imported = await importBuild(process.cwd(), golden);
  assert.deepEqual(await exportBuildRoundTrip(process.cwd(), imported), golden);
});
