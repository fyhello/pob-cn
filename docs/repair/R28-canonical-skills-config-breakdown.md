# R28：官方技能、战斗条件与计算明细

## 修复范围

- 移除 Web 向 `/api/calculate` 发送等级、天赋、技能组和战斗模式的临时内存修改。该接口现在只读；携带这些字段会被明确拒绝。
- 新增 `POST /api/build/commit`、`POST /api/skills/commit` 和 `POST /api/config/commit`。三个接口均先重新加载调用方 canonical XML，再调用官方 PoB API、重算、`SaveDB`，并只在成功时返回新的分享码、版本和完整 Build 投影。
- 技能编辑支持官方技能组的启用、Full DPS、主技能、宝石等级/品质/启用、添加/移除宝石、添加/移除技能组；由物品或天赋生成的只读技能组会被拒绝修改。
- 战斗页投影并写入当前官方 Config Set 的 `ConfigOptions`，前端按官方类型显示开关、数值、下拉和文本输入。
- Build 投影和只读重算返回 `calcsEnv.player.breakdown` 的受限、无颜色码、循环安全投影，计算页直接显示该官方明细。
- 移除旧的手写 `itemTranslator` 消费路径；工具提示和工坊标签统一消费由锁定 `poe2.json.gz` 生成的 Web 词典与通用数值模板。

## 事务边界

任何拒绝、计算失败或 XML 导出失败均从 SaveDB 快照恢复，不更新浏览器 canonical 文档。前端仅在 Bridge 返回 `sourceRevision + 1` 的完整投影后替换状态。

## 验证

目标契约：

`node --test cn/tests/bridge/http-server.spec.mjs cn/tests/bridge/real-calc-adapter.spec.mjs cn/tests/web/canonical-build-store.spec.mjs`

结果：37/37 通过。

真实 Build 本地验收（分享码未写入仓库、日志或本文档）：

- 导入：26 件物品、24 个技能组、560 个官方 ConfigOptions、7 个 Breakdown 分区、855 个输出字段。
- Config 提交：`conditionMoving=true` 返回新版 XML、版本 2 和对应官方配置投影。
- 技能提交：主技能设置返回新版 XML、版本 2 与主技能组 1。
- Build 提交：等级 97 返回新版 XML、版本 2 与 855 个官方输出字段。

Web 构建已通过；仅有 Node `DEP0190` 现有弃用警告。
