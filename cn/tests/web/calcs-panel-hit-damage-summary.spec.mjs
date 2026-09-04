import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = relative => readFile(new URL(relative, import.meta.url), 'utf8');

test('总击中二级浮窗只汇总 PoB 已投影的最终结果', async () => {
  const panel = await source('../../web/src/components/CalcsPanel.vue');

  assert.doesNotMatch(panel, /\btypeDamageDetails\b/, '不得把各类型来源明细回填到总击中行');
  assert.doesNotMatch(panel, /details:\s*typeDamageDetails/, '不得伪造总击中行的二级明细');
  assert.match(panel, /const hitDamageSummaryTypeRows = computed<DynamicRow\[\]>\([\s\S]*?row\.label === 'Skill Hit Damage'[\s\S]*?row\.columnLabel !== 'All Types:'/);
  assert.match(panel, /const hitDamageSummaryTotalRow = computed<DynamicRow \| null>\([\s\S]*?find\(isAllTypesSkillHitDamageRow\)/);
  assert.match(panel, /const hitDamageSummaryAverageRow = computed<DynamicRow \| null>\([\s\S]*?row\.columnLabel === 'All Types:' && row\.label === 'Skill Average Hit'/);
  assert.match(panel, /v-if="isHitDamageSummarySelected"[\s\S]*?v-for="row in hitDamageSummaryTypeRows"[\s\S]*?hitDamageSummaryTotalRow[\s\S]*?hitDamageSummaryAverageRow/);
});

test('总击中行与官方范围行可以打开浮窗，其他无明细行保持不可点击', async () => {
  const panel = await source('../../web/src/components/CalcsPanel.vue');

  assert.match(panel, /if \(!row\.details\?\.length && !isAllTypesSkillHitDamageRow\(row\) && !row\.radiusVisual\) return;/);
});
