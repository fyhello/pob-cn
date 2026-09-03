# R9 制作权威数据

## 已完成

- `cn/generated/web-data/crafting-authority-v2.json` 只由锁定的上游 `src/Data/ModItem.lua`、`src/Data/Bases/*.lua`、符文和精华表生成。
- 每个底材和可制作词缀都带有来源路径、文件 SHA-256 和定位符；词缀还带有前后缀类型、词缀组、物品等级、权重标签、官方文本、数值区间和 PoB range scalar 模型。
- 底材目录按上游快照的完整文件集合计算摘要。文件增删、任一内容变化或快照不匹配都会阻止生成。
- 同名底材遵循 Lua 的后写覆盖规则，和上游运行时实际 `itemBases` 表一致。
- manifest 记录新的输出、制作来源摘要和 1,768 个底材、2,550 个词缀的覆盖计数。

## 范围边界

- `crafting-legacy.json` 保留为旧界面迁移展示数据，但不参与 `crafting-authority-v2.json` 的生成或合法性判断。
- 本阶段不重新开放制作或微调按钮。后续 Bridge 校验和 Web 界面只能消费本权威表，不能回退到 legacy 种子。

## 后续顺序

1. Bridge 按 authority-v2 校验底材、词缀、等级、词缀组、权重和 roll，再进行官方 XML 事务。
2. 完成多装备集的官方定位与 copy-on-write，之后接回微调器和制作工坊。
