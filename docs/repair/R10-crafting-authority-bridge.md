# R10 制作权威 Bridge 校验

## 已完成

- `/api/items/preview` 和 `/api/items/commit` 现在必须明确带 `operation: "create" | "replace"`、canonical PoB 文档和版本号。
- Bridge 先重新载入请求中的 canonical XML，再按 `crafting-authority-v2.json` 校验草案；校验失败不会调用 Lua 制作事务。
- 校验覆盖官方底材、底材等级、品质、前后缀类型、数量、重复、词缀等级、底材权重、跨前后缀词缀组冲突和 PoB range scalar Roll。
- Lua Headless adapter 显式提供 `validateCraftDraft`、`previewCraftDraft`、`commitCraftDraft` 和 `projectOfficialItem`；它再次以官方 Item 解析、词缀权重和词缀组执行防御性校验。
- 替换仍采用新增官方物品再切换当前槽位的 copy-on-write 行为，原物品不会被删除。

## 未开放项

- 多装备集、珠宝槽定位、暗金可变 Roll、符文、腐化和已有物品 Roll 反投影尚未完成，因此 Web 制作与微调入口继续禁用。
- 版本号当前由 Web canonical 文档维护；陈旧写入拒绝将在 Web 原子提交和 Bridge 文档版本登记一并接入。
