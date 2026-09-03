# R27b：从官方文档恢复过期浏览器投影

## 问题

浏览器启动时会先恢复 localStorage。旧版本保存的投影可能缺少 `loadouts.active.itemSetId`，而 Store 虽会重新导入 canonical PoB 文档，却没有采用导入返回的官方 Build 投影。装备卸下和替换因此被错误拒绝为“缺少官方装备集”。

## 修复

在 `ensureCanonicalBuildLoaded()` 成功重新导入当前 canonical 文档后，若没有本地未保存编辑，调用 `applyOfficialProjection()` 覆盖旧缓存的物品库、装备绑定和 Loadout ID。存在脏编辑时保留本地视图，避免恢复动作覆盖用户尚未提交的内容。

## 验证

`node --test cn/tests/web/canonical-build-store.spec.mjs`

结果：5/5 通过。其中新增回归覆盖“旧缓存缺少 Loadout 投影，恢复官方文档后可获得装备操作所需 ID”。
