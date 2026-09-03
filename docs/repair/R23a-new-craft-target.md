# R23a 从零制作目标修复

## 缺陷

R23 工坊仅能从 `itemToEdit` 推导 target。顶部“从零打造”打开工坊时没有该物品，导致 target 为空、操作固定为 `replace`，预览和保存按钮永久禁用。

## 修复

- `ItemsPanel` 为新建工坊传入当前活动 Loadout 的显式目标列表：十个官方装备槽（`itemSetId` + `slotName`）以及当前已分配珠宝槽（`specId` + `nodeId`）。
- 顶部入口通过 `openNewCraftStudio()` 清除旧编辑物品后打开工坊。
- `ItemCraftingStudio` 在无 `itemToEdit` 时要求用户选择一个目标；未选择时不发送请求。
- 无现有物品时调用 `previewOfficialCraft('create', target, draft)` / `commitOfficialCraft('create', target, draft)`；存在现有物品时仍只定位该物品的当前目标并使用 `replace`。

没有回退到本地物品写入，没有使用 legacy 制作数据，也没有构造非官方 target。

## 验证

```powershell
node --test cn/tests/web/r23-crafting-studio.spec.mjs
npm run web:build
```

结果：静态门禁 2/2 通过；Web 构建通过。构建仅输出 Node `DEP0190` 弃用警告，无构建错误。
