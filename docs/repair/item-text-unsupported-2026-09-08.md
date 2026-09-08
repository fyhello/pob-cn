# 装备文本导入与未支持词缀

## 行为

- 合法底材的完整英文游戏或 PoB 装备文本允许保留核心未支持词缀，不再因 `modLine.extra` 拒绝整件装备。
- 导入预览明确说明高亮词缀导入后不生效。导入成功提示再次说明；预览、装备浮窗、制作预览、公共池明细使用相同玫红高亮和 `（不生效）` 标记。
- 支持状态取自官方 Item 的 `extra`、当前变体判断及原生浮窗的 `UNSUPPORTED` 状态。不按译文猜测，不把有条件但当前未触发的词缀标成不支持。
- 原文由官方 `BuildRaw` 和 XML 链路保存，界面提示不写进原文。官方 `BuildModList` 本身跳过带 `extra` 的整条词缀，其他受支持词缀继续正常计算。
- 空白、超过 64 KiB、未知底材、会造成字符损失的中文或特殊字符仍明确拒绝。非法穿戴及提交错误保留事务回滚。

## 关键路径

- `src/Modules/ModParser.lua`：保持仓库官方原版。不能因去掉 Bonded 前缀后正文能匹配，就把整条词缀提升为支持。
- `cn/lua/item-transfer.lua`：复用官方解析和统一物品投影，未支持词缀不导致整件拒绝。
- `cn/lua/real-calc-adapter.lua`：透传 `displayLineUnsupported`、`unparsedLines`、`tooltip.bodyLineUnsupported`，保持原字符串数组接口；只投影当前有效变体，包含药剂/护符 buff 行。
- `cn/web/src/components/ItemModifierLine.vue`：统一状态标记。`ItemDisplayLines.vue` 只将相同支持状态的连续行交给现有多行翻译，防止翻译合并造成标记错位。
- `ItemTextImport.vue`、`SharedItemPool.vue`、`PoEItemTooltip.vue`、`ItemCraftingStudio.vue` 接入逐行标记。未修改共享翻译函数、词典、插件项目或计算请求策略。

## 整理后验证（2026-09-08）

- 清理过期说明、重复运行记录和本机证据路径；HTTP 处理函数与构建状态存储仅整理缩进，逐行排除行首缩进后的 SHA-256 与整理前一致。保留所有有效业务入口和回归测试，未修改官方解析器或词典。
- 桥接、前端、数据完整性与其他 M3 门禁共 146 项通过，0 失败、0 跳过。`npm run web:typecheck`、`npm --prefix cn/web run build`、`git diff --check` 通过。保留既有 Node `DEP0190` 和 Git 换行提示。
- 真实 LuaJIT 语料：259 条去重 Bonded 文案，官方判定 164 条完整解析、95 条未支持。保留支持但条件未满足的正常显示；未支持词缀不进入官方计算列表。这是单行语料统计，不等同于完整装备的支持率。
- 截图词缀 `Bonded: Break Armour on Critical Hit with Spells equal to 12% of Physical Damage dealt` 在原版中有 `extra`，原生浮窗使用 `UNSUPPORTED` 红色。此前扩展只让它生成 `Condition:CanArmourBreak` 标志，并未实现文案中 12% 粉碎量的计算，因此已撤回。新增真实决斗法杖与符文文本用例，验证原版未支持标记、原文重载，以及满足羁绊条件后仍不参与计算。
- 443 个官方暗金条目的当前变体投影及 BuildRaw 重载通过；198 个条目包含至少一条原生未支持内容。这不是市场导入失败率，也不是 198 种独立缺陷。
- 真实接口覆盖截图词缀允许导入和穿戴、预览与装备浮窗的未支持标记、受支持属性结果不变、共享存档重载后重新读取浮窗、原文保留、非法输入与穿戴回滚。
- 真实双页面浏览器覆盖导入前警告、允许按钮、成功提示、装备浮窗、公共池复制与跨 BD 加入/穿戴、来源 BD 不变。连续武器组切换没有新增预览请求；原浮窗按需构造机制回归通过。
- 1920/1440/1024 桌面截图与溢出检查通过。独立展示组件在 390px 下验证多行翻译、同文不同支持状态、过滤空行、超长单词换行。现有整页手机布局未适配，不作为本轮通过项。
- 浏览器脚本明确检查截图词缀对应行具有高亮及 `（不生效）`，不只统计其他未知测试词缀。证据输出到系统临时目录，路径由运行日志给出，不加入仓库。

## 限制与复验

- 已撤回的解析扩展曾将 43 条文案提升为支持；当前恢复官方判定，相关数值以原版为准，已有装备原文不删除。尚未支持中文游戏源码有损转换，不静默兜底。
- GitNexus 未索引相关 Lua 函数，已以实际调用点和真实核心测试补足。共享翻译函数影响分析为 HIGH，未修改该函数。agy 只读核验超时，无独立评审结论。
- 完整复验使用 `npm run test:m3`、`npm run web:typecheck`、`npm run web:build`，以及 `cn/tests/browser/multi-build.mjs` 和 `cn/tests/browser/weapon-sets-item-text.mjs`。浏览器环境参数见 `multi-build-library-2026-09-07.md`。
- 浏览器验证使用临时共享库、独立端口及真实核心，不修改正式存档或公共物品池，也不重启用户正在使用的核心。
