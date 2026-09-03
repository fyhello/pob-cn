# R14 制作官方装备集目标

## 已完成

- 制作 preview/commit 的 `target` 现在必须包含 `itemSetId` 和 `slotName`。
- Lua 只允许对现有官方 `itemsTab.itemSets[itemSetId]` 操作，并通过官方 `SetActiveItemSet`、`AddItem`、槽位选择和 `PopulateSlots` 执行。
- Preview 总是以 XML 快照回滚。
- Commit 若目标不是当前活动装备集，会在保存前恢复原活动装备集并重新计算；响应保留当前活动输出，同时以 `targetOutput` 提供目标装备集的预览输出。
- 创建和替换仍是 copy-on-write：新增物品后只改变指定装备集中的指定槽位，原物品保留在物品库和其他引用中。
