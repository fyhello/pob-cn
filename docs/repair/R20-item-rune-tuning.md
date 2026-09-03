# R20：官方物品符文微调

## 完成内容

- 在同一物品事务中增加 `draft.kind: "runeTune"`。
- 只消费当前官方 `ItemsTab:GetValidRunesForItem` 返回的符文数据，不使用旧 Web 静态表。
- 请求中的符文数必须与原物品的官方孔数完全一致；允许 `None` 表示空孔。
- 绑定符文必须保留原位置，腐化、镜像和圣化物品拒绝修改。
- 副本写入后调用官方 `Item:UpdateRunes` 与 `BuildAndParseRaw`，验证孔数、物品身份和每个请求符文均被官方保留。
- Store 新增 `previewOfficialRuneTune` 与 `commitOfficialRuneTune`。

## 验证

执行一次目标回归：

```powershell
node --test --test-name-pattern "tunes item runes only|craft endpoints route rune tuning" cn/tests/bridge/real-calc-adapter.spec.mjs cn/tests/bridge/http-server.spec.mjs
```

结果：2/2 通过，覆盖官方符文校验、预览回滚、孔数拒绝、绑定符文拒绝、copy-on-write 与 Bridge 提交契约。
