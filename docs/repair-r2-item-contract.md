# R2 装备编辑与打造契约

## 问题

Web 装备微调与打造入口会保留原官方物品 ID，同时只替换 `rawLines`，再写回前端物品库。Bridge 的官方计算适配器只按已加载 PoB 物品 ID 取物品，不能解析这些新文本。因此界面可能显示修改后的词条或保存成功，但计算仍使用原物品。

## 本次范围

- `cn/web/src/components/ItemTunerPanel.vue`
- `cn/web/src/components/ItemCraftingStudio.vue`
- `cn/web/src/components/ItemCraftingModal.vue`

Bridge 尚未支持官方物品文本导入，本次不伪造该能力：三处入口保留装备查看和打造预览，移除对 `store.saveCraftedItem` 的调用，禁用保存、穿戴和修改后试算，并展示中文原因。原有已导入官方物品的查看和换装不在本次修改范围内。

## 验证

红灯：提交前针对三个组件搜索 `store.saveCraftedItem`，发现 6 处调用（微调器 2 处、制作工坊 2 处、制作弹窗 2 处）。

绿灯：提交后运行以下命令，确认三处组件不存在该调用，且每处均包含官方物品文本导入限制说明。

```powershell
$files = @('src/components/ItemTunerPanel.vue','src/components/ItemCraftingStudio.vue','src/components/ItemCraftingModal.vue')
$matches = Select-String -Path $files -Pattern 'store\.saveCraftedItem'
if ($matches) { exit 1 }
$notices = Select-String -Path $files -Pattern '官方物品文本导入尚未接入'
if ($notices.Count -lt 3) { throw 'Missing user-facing limitation.' }
```

结果：通过。

附加类型检查 `npm exec vue-tsc -- --noEmit` 未能运行：本机 Node 24 与解析到的 `vue-tsc`/TypeScript 组合报 `ERR_PACKAGE_PATH_NOT_EXPORTED`（`typescript/lib/tsc`）。本次未修改依赖或工具链，未用其他测试替代。

## 后续

当 Bridge 接入官方 PoB 物品文本导入并能原子地返回计算结果后，才恢复这些提交入口；恢复时必须验证显示词条、导入后的官方物品和计算输出一致。
