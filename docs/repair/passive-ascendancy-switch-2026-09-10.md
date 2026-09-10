# 天赋树升华切换修复

## 根因与范围

网页天赋点击通过 `buildStore.toggleNode` 提交 `passiveNode`。原适配层直接调用 `PassiveSpec:AllocNode`；另一升华的节点没有当前路径，因此核心拒绝分配。

官方 `src/Classes/PassiveTreeView.lua` 的点击流程先检查目标所属升华，再调用 `SelectAscendClass`，最后分配目标节点。目标可以是起点，也可以是内部节点。

真实往返验证还发现：`Sanguimancy`（滴血为咒）在当前官方树中带有 `isFreeAllocate=true`，不会被 `BuildAllDependsAndPaths` 的孤立路径剪枝清除。只调用 `SelectAscendClass` 会留下旧升华节点，不能作为完整修复。

## 实现

业务修改仅位于 `cn/lua/real-calc-adapter.lua` 的 `applyCalculationInputs` 单节点分支：

- 从当前官方节点和职业表解析目标，不接收前端自造职业映射。
- 同基础职业切换前，调用官方 `DeallocSingleNode` 清理旧主升华手动分配节点，包括免费节点；物品授予节点仍由核心管理。
- 调用官方 `SelectAscendClass` 重建路径，再沿现有分配入口处理目标节点。
- 当前主升华、替换升华和第二升华不会被误判为切换。未升华的官方 ID 为空，不能据此把普通节点当旧升华清理。
- 跨基础职业直接点击返回明确错误，不自动清树。

沿用原事务的计算、XML 保存、投影及失败回滚。没有增加 HTTP 接口、前端运算、完整天赋树重导或第二套保存事务。官方计算和树数据未修改。

## 验证入口

```powershell
node --test cn/tests/bridge/passive-ascendancy.integration.spec.mjs cn/tests/bridge/real-calc-adapter.spec.mjs

# 可选：读取实际驱炎使存档副本；所有测试写入临时目录。
$env:POB_CN_TEST_BUILD = '<BD 存档 JSON 的绝对路径>'
node --test cn/tests/bridge/passive-ascendancy.integration.spec.mjs

$env:POB_CN_PLAYWRIGHT_PATH = '<Playwright index.mjs 的绝对路径>'
$env:POB_CN_BROWSER = '<Chrome 可执行文件的绝对路径>'
node cn/tests/browser/passive-ascendancy.mjs

npm run test:m3
npm run web:typecheck
npm run web:build
```

集成测试使用真实 LuaJIT 核心，对照独立调用官方取消分配、选择升华和分配节点后的完整标量结果、节点分配及规范化 XML。覆盖双向起点／内部节点、三种分配模式、首次选择升华、保存重开，以及非法节点、非法模式、跨职业、切换失败、分配失败、计算失败和保存失败。成功事务断言计算、序列化各一次。

浏览器测试使用隔离物品库和两个独立核心，通过真实画布点击检查名称、数值、请求次数、连续操作、保存重开、错误提示与回滚；用户原始存档读取前后逐字校验不变。临时证据目录由测试输出。

本次验证结果：

- 真实测试 BD：13 次官方对照（含未升华首次选择）、7 类错误回滚通过。
- 实际导入 BD 的隔离副本：12 次双向官方对照、7 类错误回滚通过。
- 最终浏览器：14 次逐次点击、3 次快速排队点击、保存重开、两个窗口状态和核心结果隔离均通过；没有页面运行异常。每次点击一个提交请求，成功事务一次官方计算、一次序列化。
- `npm run test:m3`：179 项通过，0 失败、0 跳过；类型检查和生产构建通过。
- 证据：`C:/Users/25147/AppData/Local/Temp/pob-ascendancy-browser-F4Y9Sc/results.json`。该轮与全目录 M3 测试并行，正常切换 631–1223 毫秒，错误后首次重载 8748 毫秒；不作为空闲性能基线。

## 已知边界

跨基础职业清树／连接路径仍不在本次范围。已有 HTTP 事务在错误后使核心文档标识失效，下一次操作重新载入规范 XML；首轮真实浏览器验收中，正常切换显示耗时为 238–643 毫秒，跨职业错误后的首次恢复操作为 5750 毫秒。后者是现有错误恢复路径，不能混入正常切换数据或宣称已经优化。

现有服务无需重启：新建或重新打开网页会话会启动读取最新 Lua 的独立核心。旧网页刷新时按现有流程恢复本页草稿并创建新核心。
