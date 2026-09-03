# R19：官方物品品质微调

## 完成内容

- 在同一物品事务中增加 `draft.kind: "qualityTune"`。
- 仅对有 PoB 品质规则的官方物品开放，品质为 `0..20` 整数。
- 拒绝腐化、镜像、护符和没有官方品质属性的物品。
- 从官方标准化文本克隆副本，写入请求品质后调用 `Item:NormaliseQuality`；官方未保留该值即拒绝。
- 通过 copy-on-write 替换目标引用，预览回滚，commit 返回 canonical 文档和完整官方 Build 投影。
- Store 新增 `previewOfficialQualityTune` 与 `commitOfficialQualityTune`。

## 明确未开放

- 腐化品质、超过 20 的品质、符文、词缀或底材的同时修改。

## 验证

执行一次目标回归：

```powershell
node --test --test-name-pattern "tunes item quality only|craft endpoints route quality tuning" cn/tests/bridge/real-calc-adapter.spec.mjs cn/tests/bridge/http-server.spec.mjs
```

结果：2/2 通过，覆盖官方标准化、预览回滚、腐化源拒绝、copy-on-write 与 Bridge 提交契约。
