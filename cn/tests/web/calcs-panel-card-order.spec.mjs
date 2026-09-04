import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = relative => readFile(new URL(relative, import.meta.url), 'utf8');

test('点燃位于核心计算卡片，其他效果位于下方辅助卡片', async () => {
  const panel = await source('../../web/src/components/CalcsPanel.vue');
  const coreStart = panel.indexOf('<!-- 4. 金字塔第三层（底层）：4 大核心计算支柱 -->');
  const auxiliaryStart = panel.indexOf('<!-- 5. 异常状态与资源消耗 -->');
  const popoverStart = panel.indexOf('<!-- 6. 🏆 终极无重叠双层浮窗架构');

  assert.ok(coreStart >= 0 && auxiliaryStart > coreStart && popoverStart > auxiliaryStart, '计算卡片分区必须完整');
  const coreCards = panel.slice(coreStart, auxiliaryStart);
  const auxiliaryCards = panel.slice(auxiliaryStart, popoverStart);

  assert.match(coreCards, /onCardMouseEnter\('igniteDPS', \$event\)/);
  assert.doesNotMatch(coreCards, /onCardMouseEnter\('otherEffects', \$event\)/);
  assert.match(auxiliaryCards, /onCardMouseEnter\('otherEffects', \$event\)/);
  assert.doesNotMatch(auxiliaryCards, /onCardMouseEnter\('igniteDPS', \$event\)/);
});
