import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const repoRoot = new URL('../../..', import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '');

test('Strict Data Integrity: CalcsPanel.vue contains zero fake math formulas and zero mock numbers', async () => {
  const panelPath = join(repoRoot, 'cn', 'web', 'src', 'components', 'CalcsPanel.vue');
  const content = await readFile(panelPath, 'utf8');

  // 断言 1：严禁包含任何历史遗留的假常数 mock
  assert.equal(/inc:\s*113/.test(content), false, 'CalcsPanel.vue must NOT contain hardcoded inc: 113');
  assert.equal(/more:\s*1\.0,\s*effMult:\s*0\.5/.test(content), false, 'CalcsPanel.vue must NOT contain hardcoded mock element properties');

  // 断言 2：严禁包含自编的伪连乘公式栏 (Base * Inc * More * Crit)
  assert.equal(/基础点伤均值.*提高加成.*更多乘区.*暴击期望倍率/.test(content), false, 'CalcsPanel.vue must NOT contain fabricated multi-tier multiplication banner');

  // 断言 3：视口安全盒模型与 popoverMaxHeight 必须存在
  assert.ok(content.includes('popoverMaxHeight'), 'CalcsPanel.vue must enforce popoverMaxHeight viewport clamp');
});

test('Strict Data Integrity: GEMINI.md exists in root with 5 strict rules', async () => {
  const geminiPath = join(repoRoot, 'GEMINI.md');
  const content = await readFile(geminiPath, 'utf8');
  assert.ok(content.includes('绝对零前端运算'), 'GEMINI.md must contain rule 1');
  assert.ok(content.includes('绝对零假数据/常数兜底'), 'GEMINI.md must contain rule 2');
  assert.ok(content.includes('Lua 适配层 100% 纯透传契约'), 'GEMINI.md must contain rule 3');
});
