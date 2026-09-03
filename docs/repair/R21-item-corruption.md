# R21：官方物品单向腐化

## 完成内容

- 在同一物品事务中增加 `draft.kind: "corruptionTune"`。
- 只允许把当前未腐化、非镜像、非圣化的目标物品标记为腐化；不能撤销或二次腐化。
- 腐化不能与品质、符文、词缀、底材或任意物品文本修改合并。
- 副本通过官方 `BuildAndParseRaw` 写回腐化状态；未保留状态或物品身份变化时拒绝提交。
- Store 新增 `previewOfficialCorruptionTune` 与 `commitOfficialCorruptionTune`。

## 边界

- 这是构建合法目标成品的状态写入，不模拟瓦尔宝珠等随机制作过程或概率。

## 验证

执行一次目标回归：

```powershell
node --test --test-name-pattern "marks an official item corrupted only|craft endpoints route corruption tuning" cn/tests/bridge/real-calc-adapter.spec.mjs cn/tests/bridge/http-server.spec.mjs
```

结果：2/2 通过，覆盖单向腐化、预览回滚、已腐化源拒绝、copy-on-write 与 Bridge 提交契约。
