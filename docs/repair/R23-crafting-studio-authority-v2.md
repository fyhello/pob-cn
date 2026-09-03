# R23 制作工坊迁移

## 范围

- `cn/web/src/components/ItemCraftingStudio.vue`
- `cn/tests/web/r23-crafting-studio.spec.mjs`

工坊改为直接读取受控输出 `cn/generated/web-data/crafting-authority-v2.json`。未修改 Bridge、Lua、Store 或旧项目。

## 行为

- 底材仅来自 authority v2 的非隐藏 `item_bases`，并按官方底材 `type` 分类。
- 物品等级下限取底材与已选词缀 `required_item_level` 的最大值。
- 词缀按前缀/后缀、物品等级、底材 tags、`spawn_weights`、词缀 ID 和词缀组筛选；前缀和后缀均最多三个。
- 移除了精华随机流程、额外腐化词缀、任意文本输入和前端自定符文孔数。
- 工坊从当前活动装备集或当前天赋树珠宝槽解析明确 target。预览调用 `previewOfficialCraft`，提交调用 `commitOfficialCraft`；页面只显示 Bridge 返回的正式物品文本，不调用前端物品库写入接口。

## 验证

执行：

```powershell
node --test cn/tests/web/r23-crafting-studio.spec.mjs
npm run web:build
```

结果：静态门禁 1/1 通过，Web 构建通过。构建仅输出 Node `DEP0190` 弃用警告，无构建错误。
