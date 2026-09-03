# R15 Web 制作事务

## 已完成

- `previewOfficialCraft` 调用 `/api/items/preview`，只返回官方预览，不改 Web 状态、canonical 文档或导出版本。
- `commitOfficialCraft` 调用 `/api/items/commit`，只在响应同时包含匹配的 `sourceRevision`、递增 `revision`、新的分享代码和完整官方 Build 投影时提交。
- 成功提交复用官方投影的原子应用路径；失败、网络错误、陈旧响应或不完整响应都不会局部修改物品库、装备槽、数值或 canonical 文档。
- 当前方法为后续制作工坊与微调器提供唯一写入入口；旧 `saveCraftedItem` 仍不允许由这些界面调用。
