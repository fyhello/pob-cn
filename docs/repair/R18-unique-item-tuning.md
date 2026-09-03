# R18：官方暗金原始词条微调

## 完成内容

- 在既有物品事务中增加 `draft.kind: "uniqueTune"`，仍使用同一组 preview/commit、canonical code 和版本递增契约。
- 仅接受 `rarity: UNIQUE` 且具有官方 `uniqueID` 的未腐化暗金。
- 可调整项仅来自 PoB 官方 `explicitModLines` 中经 `itemLib.applyRange` 确认实际可缩放的原始词条；草案按官方行索引和三位小数 Roll 指定。
- 克隆前后严格校验 `uniqueID`、可缩放行数量、行索引和行文本；提交后还验证未选中的原始 Roll 保持不变。
- 使用 copy-on-write 替换当前装备或珠宝槽的引用，旧暗金继续保留在物品库。
- Store 新增 `previewOfficialUniqueTune` 与 `commitOfficialUniqueTune`，对 commit 继续原子替换官方 Build 投影。

## 明确拒绝

- 无官方 `uniqueID` 的文本物品、固定词条、腐化暗金、品质、符文、底材、任意文本、稀有词缀字段和暗金词条的增删替换。

## 验证

执行一次目标回归：

```powershell
node --test --test-name-pattern "tunes only original scalable unique modifiers|craft endpoints route unique tuning" cn/tests/bridge/real-calc-adapter.spec.mjs cn/tests/bridge/http-server.spec.mjs
```

结果：2/2 通过，覆盖 `uniqueID` 保留、可缩放行投影、预览回滚、copy-on-write、非暗金草案字段拒绝和 Bridge 提交契约。
