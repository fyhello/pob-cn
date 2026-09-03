import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('headless bridge server owns only the JSON-lines calculation protocol', async () => {
  const server = await readFile(new URL('../../bridge/calc_server.lua', import.meta.url), 'utf8');
  assert.match(server, /dofile\("HeadlessWrapper\.lua"\)/);
  assert.match(server, /\.\.\/runtime\/lua\/\?\.lua/);
  assert.match(server, /POB_JSON:/);
  for (const action of ['newBuild', 'loadXML', 'exportXML', 'calculate', 'getStats', 'ping']) assert.match(server, new RegExp(`action == "${action}"`));
  assert.doesNotMatch(server, /syncEquippedItems|syncSocketGroups|jewelSlotBindings/);
});
