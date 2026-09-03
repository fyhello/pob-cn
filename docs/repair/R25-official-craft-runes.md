# R25 官方制作符文能力

## 范围

- `cn/web/src/components/ItemCraftingStudio.vue`
- `cn/tests/web/r23-crafting-studio.spec.mjs`

## 行为

制作工坊在官方预览或提交成功后读取 Bridge 返回的 `data.runeCapabilities`。只有官方返回正数 `socketCount` 和非空 `allowed` 时，才渲染符文区。

- 符文选择器数量严格等于 `socketCount`。
- 每个选择器的选项只来自 `allowed`，并通过 `translateRuneName` 展示中文。
- 选择后的符文仅以 `runes` 字段加入下一次官方制作草案；前端不生成物品文本、不增删孔、不接受自由文本。
- 底材、物品等级、前缀或后缀变化会清空官方符文能力和已选符文，必须重新官方预览后才能继续选择。
- R23a 的无物品 `create` 和既有物品 `replace` 流程保持不变。

## 验证

```powershell
node --test cn/tests/web/r23-crafting-studio.spec.mjs
npm run web:build
```

结果：静态门禁 3/3 通过；Web 构建通过。构建仅输出 Node `DEP0190` 弃用警告，无构建错误。
