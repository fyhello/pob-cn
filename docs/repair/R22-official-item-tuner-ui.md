# R22：官方物品微调器界面

## 完成内容

- 新增只读 `tuneInspect`，仍经 `/api/items/preview`：请求先重载 canonical XML，再以当前目标槽位与 `itemId` 获取官方可调能力；不会写入 Build、分享码或版本。
- 微调器移除本地正则反推、`±25%` 伪区间和本地 `rawLines` 拼装。
- 微调器只显示并提交官方返回的稀有词缀 Roll、暗金可变行、品质、符文和单向腐化能力。
- 物品面板只为当前活动装备集的已装备物品或当前天赋树的已镶嵌珠宝生成目标；物品库中的未装备物品不能直接提交。
- 试算不替换本地 Build；保存只接受 Bridge 返回的完整官方投影和 canonical 版本。

## 验证

执行目标门禁：

```powershell
node --test --test-name-pattern "inspects a canonical official item|item tuner consumes official|item panel supplies" cn/tests/bridge/http-server.spec.mjs cn/tests/web/r22-official-tuner.spec.mjs
```

结果：3/3 通过。

执行一次相关生产编译：

```powershell
npm run web:build
```

结果：通过。
