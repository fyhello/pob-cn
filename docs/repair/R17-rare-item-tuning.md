# R17：官方稀有物品词缀微调

## 完成内容

- 在既有 `/api/items/preview` 与 `/api/items/commit` 中增加 `draft.kind: "rareTune"` 事务，不另建残留状态接口。
- 微调必须以当前目标槽位绑定的官方 `itemId` 为源，且 `operation` 固定为 `replace`。
- 仅接受稀有、未腐化物品的现有前后缀 Roll；Roll 范围为 `0..1`，精度固定为官方标准化文本支持的三位小数。
- 通过 `Item:BuildRaw`、`new("Item", raw)` 和 `BuildAndParseRaw` 生成官方副本。克隆与重建前后都核对词缀 ID 和前后缀类型，任何新增、缺失、替换或类型变化均拒绝。
- 采用 copy-on-write：新物品替换当前目标槽位，原物品继续保留在官方物品库；预览完整回滚。
- Store 新增 `previewOfficialRareTune` 与 `commitOfficialRareTune`，提交继续使用 canonical 文档和完整官方 Build 投影原子更新。

## 明确未开放

- 品质、符文、腐化、底材、词缀增删和任意物品文本仍被拒绝。
- 暗金微调和 Web 微调器的可编辑界面尚未开放。

## 验证

执行一次目标回归：

```powershell
node --test --test-name-pattern "tunes only existing rare affix rolls|craft endpoints route rare tuning" cn/tests/bridge/real-calc-adapter.spec.mjs cn/tests/bridge/http-server.spec.mjs
```

结果：2/2 通过，覆盖预览回滚、copy-on-write、质量字段拒绝、官方 Roll 投影和 Bridge canonical 提交契约。
