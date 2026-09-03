# R13 Web Canonical Loadout 状态

## 已完成

- Web Store 现在先在内存中构造完整官方投影，验证成功后才一次性替换角色、物品库、装备、珠宝、技能组、数值、Loadout 和 canonical 文档状态。
- 导入不再通过本地 `addItem` 逐项写入，因此不会在导入/官方提交期间生成本地物品 ID 或误标记 canonical 文档为脏。
- `selectOfficialLoadout` 仅接受当前未脏的 canonical 文档，调用 Bridge 后只应用返回的 `build + code + revision`；旧版本、缺少官方投影或失败响应不会改变本地状态。
- Loadout 元数据随本地状态保存和恢复；Bridge 重启后仍以 canonical 文档为唯一恢复来源。

## 下一步

- 制作 `commit` 使用相同原子应用方法，目标改为官方装备集 ID 与槽位。
- 再实现珠宝目标、暗金/已有物品反投影、符文、腐化和制作界面。
