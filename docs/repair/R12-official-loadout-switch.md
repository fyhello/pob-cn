# R12 官方 Loadout 切换

## 已完成

- 新增 `POST /api/loadouts/select`。
- 请求必须带当前 canonical PoB 文档、`expectedRevision` 和完整官方 `specId`、`itemSetId`、`skillSetId`、`configSetId`。
- Bridge 重新载入请求文档后，Lua 验证每个 ID 的存在性，只调用官方 `build:SetActiveLoadout`，随后由官方核心重算、保存 XML、投影完整 Build。
- 成功响应返回新的 canonical 分享代码与递增版本；无效集合 ID、缺少官方切换 API、计算或 XML 保存失败都会回滚到进入事务前的 XML。

## 下一步

- Web Store 按 Bridge 返回的完整 Build 投影和 canonical code 原子替换本地状态。
- 制作目标固定为官方 `itemSetId + slotName`，再接入珠宝树节点目标。
