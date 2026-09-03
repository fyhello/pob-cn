# R16：官方天赋珠宝制作事务

## 完成内容

- 制作目标新增 `kind: "jewel"`，以 `specId + nodeId` 精确指向官方天赋树中的珠宝槽。
- 仅接受指定天赋树中已经分配的珠宝节点，并通过官方 `IsItemValidForSlot` 与 `SetSelItemId` 完成校验和镶嵌。
- 预览在 XML 快照中执行，返回目标树的计算结果后完整回滚。
- 提交可临时切换到目标天赋树，但在导出前恢复原活动天赋树并重新计算；返回活动树输出与 `targetOutput`，不会改变用户当前活动 Loadout。
- Web Store 制作契约接受装备目标或珠宝目标；现有工坊和微调器继续保持禁用，尚未开放写入入口。

## 拒绝范围

- 目标天赋树不存在、节点不是珠宝槽或节点未分配时，拒绝写入且回滚。
- 不修改装备集、技能集、配置集，也不提供任意物品文本写入。

## 验证

执行一次目标回归：

```powershell
node --test --test-name-pattern "crafts jewels only" cn/tests/bridge/real-calc-adapter.spec.mjs
```

结果：1/1 通过。夹具覆盖预览回滚、未分配节点拒绝、跨天赋树提交、目标输出、活动树恢复和 Build 投影中的珠宝映射。
