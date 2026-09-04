import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = relative => readFile(new URL(relative, import.meta.url), 'utf8');

const officialDynamicSectionKeys = [
  'Other Defences',
  'Other Avoidance',
  'Damage Avoidance',
  'Stun Duration',
  'Other Ailment Defences',
  'Utility Flasks',
  'Life Flasks',
  'Mana Flasks',
  'Charms',
  'Rage',
  'Endurance',
  'Frenzy',
  'Power',
  'Damage Taken',
  'Damaging Hits',
  'Maximum Hit Taken',
  'Recoup and Hit Taken Over Time',
  'Dots and Build Degens',
  'Enemy Degens',
];

test('defences panel binds its dynamic cards to official section keys', async () => {
  const panel = await source('../../web/src/components/DefencesPanel.vue');

  for (const key of officialDynamicSectionKeys) {
    assert.match(
      panel,
      new RegExp(
        `(?:getSectionRows|openSectionBreakdown)\\('${key}'|v-for="sectionKey in \\[[^\\]]*'${key}'[^\\]]*\\]"`,
      ),
      `must bind the official ${key} section dynamically`,
    );
  }
});

test('defences panel resolves Effective "Health" Pool through its controlled EHP entry', async () => {
  const panel = await source('../../web/src/components/DefencesPanel.vue');

  assert.match(
    panel,
    /function findSubSection\([^)]*\)[\s\S]*?if \(sectionKey === 'EHP' \|\| sectionKey === 'EffectiveHealthPool'\)[\s\S]*?subSections\.value\['Effective (?:\\")?Health(?:\\")? Pool'\]/,
    'Effective "Health" Pool must stay behind the controlled EHP findSubSection entry',
  );
});

test('defences panel never opens breakdowns through obsolete section keys', async () => {
  const panel = await source('../../web/src/components/DefencesPanel.vue');

  assert.doesNotMatch(panel, /openSectionBreakdown\('Other Effects'/);
  assert.doesNotMatch(panel, /openSectionBreakdown\('OtherAvoidance'/);
});
