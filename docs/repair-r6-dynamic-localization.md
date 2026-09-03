# R6 动态装备与宝石词条中文展示

## 问题

`cn/generated/web-data/translations.json` 由锁定的 `cn/pipeline/sources/dictionary/ninja-poe2/poe2.json.gz` 及既有词典生成链产生，能覆盖完整静态术语。PoB 在运行时组装带数值的装备和宝石词条，整行通常不是词典精确键，因此 Web 导入展示会将部分英文动态行原样回退。

## 本次范围

- `cn/web/src/utils/webTranslation.ts`
- `cn/tests/web/import-localization.spec.mjs`

只补展示层组合模板；`rawLines`、物品英文 ID 和传给官方计算层的数据均不修改。

新增三种模板，所有可翻译的名词均从生成的 `translations.json` 查询：

- `Adds <min> to <max> <Damage>`
- `Gain <%> of Damage as <Extra Damage>`
- `Socketed Skills have <value> to <Stat>`

若模板中的术语不在锁定词典中，函数继续返回原行，不臆造翻译。

## 验证

目标用例：`node --test cn/tests/web/import-localization.spec.mjs`。

红灯：新增用例后，`Adds 12 to 24 Fire Damage` 返回英文原文。

绿灯：补规则后同一用例通过，覆盖以下输出：

- `Adds 12 to 24 Fire Damage` -> `附加 12 至 24 火焰伤害`
- `Gain 18% of Damage as Extra Fire Damage` -> `获得 18% 伤害作为额外火焰伤害`
- `Socketed Skills have +12% to Critical Strike Multiplier` -> `已镶嵌技能的暴击伤害加成 +12%`
- 既有 `60% increased Runic Ward` 仍为 `符文结界提高 60%`
- 未知词条仍原样回退

未重新生成词典：本次不改变锁定 gzip、override 或生成器输入，只消费现有受控生成输出。
