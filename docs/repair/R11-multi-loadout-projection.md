# R11 多 Loadout 投影

## 已完成

- Bridge 不再因为多个被动树、装备集或技能集拒绝官方 PoB 导入。
- 现有活动 Build 投影保持兼容，同时新增 `loadouts`：
  - `active` 保留官方 `specId`、`itemSetId`、`skillSetId` 和 `configSetId`。
  - `passiveTrees` 保留每套天赋和珠宝绑定。
  - `itemSets` 保留每个官方装备集 ID、标题、副武器状态和各槽位物品引用。
  - `skillSets` 与 `configSets` 保留官方 ID 和标题，技能集带完整技能组投影。
- 投影只读取官方对象，不会切换或修改当前 Loadout。

## 下一步

- 增加官方 Loadout 切换事务和 Web 原子状态应用。
- 制作目标改为 `itemSetId + slotName`，珠宝目标改为被动树 ID + node ID；完成后才可重新开放写入入口。
