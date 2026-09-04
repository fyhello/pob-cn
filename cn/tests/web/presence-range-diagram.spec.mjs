import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = relative => readFile(new URL(relative, import.meta.url), 'utf8');

test('范围图复用官方底图与原生扫描线，不在前端计算半径', async () => {
  const [diagram, officialGuide, webGuide, officialOverlay, webOverlay] = await Promise.all([
    source('../../web/src/components/PresenceRangeDiagram.vue'),
    readFile(new URL('../../../src/Assets/range_guide.png', import.meta.url)),
    readFile(new URL('../../web/src/assets/range_guide.png', import.meta.url)),
    readFile(new URL('../../../src/Assets/game_ui_small.png', import.meta.url)),
    readFile(new URL('../../web/src/assets/game_ui_small.png', import.meta.url)),
  ]);

  assert.deepEqual(webGuide, officialGuide, '距离标尺底图必须与 PoB 原件一致');
  assert.deepEqual(webOverlay, officialOverlay, '游戏 UI 覆盖图必须与 PoB 原件一致');
  assert.match(diagram, /import rangeGuide from '..\/assets\/range_guide\.png';/);
  assert.match(diagram, /import gameUiSmall from '..\/assets\/game_ui_small\.png';/);
  assert.match(diagram, /v-for="\(scanline, index\) in visual\.scanlines"/);
  assert.match(diagram, /:x="scanline\.x"/);
  assert.match(diagram, /:y="scanline\.y"/);
  assert.match(diagram, /:width="scanline\.width"/);
  assert.match(diagram, /fill="#80ff80"/);
  assert.match(diagram, /fill-opacity="0\.33"/);
  assert.doesNotMatch(diagram, /(?:Math\.|parseFloat\(|Number\(|toFixed\(|\|\|\s*\d|\?\?\s*\d|:r=|<circle|<ellipse)/, '范围图不得计算、解析或伪造半径图形');
});

test('计算浮窗仅显示当前官方半径行的范围图', async () => {
  const panel = await source('../../web/src/components/CalcsPanel.vue');

  assert.match(panel, /import PresenceRangeDiagram, \{ type OfficialRadiusVisual \} from '.\/PresenceRangeDiagram\.vue';/);
  assert.match(panel, /const activeRadiusVisual = computed<OfficialRadiusVisual \| null>\([\s\S]*?activeCardKey\.value !== 'otherEffects'[\s\S]*?effectiveSecondaryRow\.value\?\.radiusVisual/);
  assert.match(panel, /<PresenceRangeDiagram v-if="activeRadiusVisual" :visual="activeRadiusVisual" \/>/);
  assert.match(panel, /v-if="effectiveSecondaryRow\?\.details\?\.length \|\| isHitDamageSummarySelected \|\| effectiveSecondaryRow\?\.radiusVisual"/);
  assert.match(panel, /!row\.details\?\.length && !isAllTypesSkillHitDamageRow\(row\) && !row\.radiusVisual/);
  assert.doesNotMatch(panel, /rangeMetrics|activeRangeMetrics/, '不同官方半径不得合并成同一范围图');
});
