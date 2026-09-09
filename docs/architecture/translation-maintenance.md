# 翻译来源与更新流程

## 权威与边界

默认语言为 `zh-CN`。`zh-TW` 来自国际服繁中原文，不使用汉字转换器。本次提供语言包加载与显示语言 API，不增加切换按钮。

唯一输入是 `cn/config/content-source-lock.json` 中的 `translation.game`、`translation.core`、`translation.reviewed`。日常构建只读锁定快照，无须安装游戏。现有 ninja-poe2 快照和旧覆盖文件仅用于历史可追溯，不再参与翻译生成；其他制作、静态目录来源仍由各自锁定记录管理。

完整缺译报告 `cn/generated/web-data/translations-report.json` 是可复现的本地产物，体积超过 GitHub 单文件限制，不纳入 Git；锁定快照、审核归档及两个运行时语言包仍入库。全新检出安装依赖后，先运行 `npm run generate:content` 再运行测试。CI 使用相同顺序，生成器仍输出并校验完整报告，不删减诊断内容。

游戏计算、词缀机制和保存内容仍以官方 PoB 为准。词典只能改变显示文字。游戏没有对应文本的计算标签、配置说明由项目审核，来源标记为 `reviewed-pob-*`，不冒充客户端原文。

## 来源清单

| 内容 | 来源与锁定方式 |
| --- | --- |
| 简中原文 | 国服客户端的英文基础表与 Simplified Chinese 语言表，以及 `.csd` 简中语言段 |
| 繁中原文 | 国际服客户端的英文基础表与 Traditional Chinese 语言表，以及 `.csd` 繁中语言段 |
| 数据表结构 | `cn/pipeline/schemas/game-text-tables.json`；上游 pathofexile-dat schema v7，国际 Mods 单独使用 dat-schema `_Core.gql` 中记录的 blob；原始哈希与 MIT 许可随 schema 保留 |
| 资源提取器 | [zao/ooz v0.2.4](https://github.com/zao/ooz/releases/tag/v0.2.4) 的 `bun_extract_file.exe`、`libbun.dll`、`libooz.dll`；三文件 SHA-256 由 `game-text-tools.json` 锁定，不提交二进制 |
| PoB 核心语料 | 本仓库锁定的官方版本；隔离导出器读取官方物品、技能、天赋、配置及计算说明，并创建临时 BD 采集真实明细表和来源，记录源码及采集器哈希 |
| 审核译文 | `cn/pipeline/sources/translations/reviewed.json`，逐条带来源、原文与语境；43 个原先仅存在于产物中的词条登记在 `recoveredArtifactEntries` |

客户端资源与第三方代码的著作权仍归各自权利人；本流程不提供游戏安装包、提取器镜像或发布授权。对外分发前仍须单独审查许可。

国服与国际服 Mods 的结构不同，分别使用各自 schema，不能根据行宽猜字段。只在同一客户端内校验语言表 ID、结构与行数后配对；跨客户端只使用稳定内部 ID，不按行号拼接。没有稳定 ID 的条目使用英文原文、字段和来源表组成语境键。

## 四步更新

以下变量由维护者指定绝对路径，不把个人安装路径写入项目。候选目录应是新的本地诊断目录（例如 `Builds/i18n-candidate-日期`）。

```powershell
node cn/pipeline/collect-game-translations.mjs --cn "$cnClient" --intl "$intlClient" --extractor "$extractorPath" --output "$candidateDir"
node cn/pipeline/export-translation-corpus.mjs --lua "$luaPath" --output "$candidateDir/core-corpus.json.gz"
node cn/pipeline/update-translations.mjs review --candidate "$candidateDir" --output "$candidateDir/review.json"
```

`$luaPath` 是可运行当前核心的 LuaJIT 可执行文件绝对路径。导出器通过 `cn/pipeline/lua/translation-breakdown.lua` 在独立临时核心创建 Spark、Fireball、Ice Nova、Flame Wall 及带辅助宝石的测试 BD，并使用官方物品事务添加装备和珠宝，采集实际 `breakdownLines`、`breakdownTables`、来源字段、物品正文和官方浮窗；不打开用户存档。静态格式串与真实显示记录分开统计，测试组合并不代表所有 BD 和机制。

审核 `review.json` 的新增、删除、修改、实体、语境、规则、冲突和拒绝模板；结合当前核心语料核实专名与参数，不只看条数。修改审核译文后必须重新生成审核报告。核心快照中的 `collectors` 锁定导出器及两个 Lua 采集器的路径和哈希；修改采集逻辑后必须重新导出，接受阶段拒绝与当前采集器不一致的候选。

```powershell
node cn/pipeline/update-translations.mjs accept --candidate "$candidateDir" --review "$candidateDir/review.json" --ack-sha256 "$reviewSha256"
node cn/pipeline/generate-content.mjs
```

`accept` 要求完整报告 SHA-256 与当前输入、正式词典、版本锁和来源锁一致。失败不得更新正式词典；接受只更新翻译快照与对应锁定记录，不覆盖制作等输入。生成器先验证全部产物，暂存成功后再替换；可捕获的写入失败会恢复已写文件，恢复或清理失败也会明确报错。此机制不声称具备断电后的文件系统级原子性。

只修改审核译文时，仍需走 `review`、`accept`、生成步骤，可复用同版本的原生候选，无须重新提取游戏。

修改原生解析规则后，可以复用已提取的原始文件重新采集。`$cnRaw`、`$intlRaw` 分别指向旧候选的 `raw/cn`、`raw/intl`；`$previousGameSnapshot` 指向该次提取生成的游戏压缩快照。每个资源必须与旧提取清单的哈希一致，提取器版本也必须匹配，不能使用没有来源证明的目录。

```powershell
node cn/pipeline/collect-game-translations.mjs --extracted --cn "$cnRaw" --intl "$intlRaw" --provenance "$previousGameSnapshot" --output "$candidateDir"
```

游戏快照同时锁定采集器和 `game-text.mjs` 的哈希。解析规则或采集代码变化后，旧候选不能直接接受。后续仍执行核心导出、差异审核、接受和唯一生成入口。

审核同时比较旧包和候选对同一语料的实际显示结果。已支持文本退回英文，以及 `reviewed.json` 中 `requiredDisplays` 必验入口缺译，都会阻止接受；必验项在正式生成时也再次检查。不能靠确认报告哈希强行放行。撤销已证实的旧误译时，只能登记限定语言、原文、语境、旧译文、PoB 版本和来源证据的 `regressionExceptions`；必验项不能豁免。例外不算翻译成功。

传奇更新还须审核 `validation.uniqueCoverage` 和 `validation.itemCoverage`：前者记录实际预览、变体选择和调值标签的采集次数，后者逐项保留缺译原文、物品身份、预览编号及官方支持状态。实际浮窗按网页相同的多行分组后检查回退，不能以单行模板检查代替实际显示。存量未解决条目仍会进入审核文件和生成报告；确认报告不代表全目录零缺译。

采集器遍历每件传奇的默认状态、每组选项以及可调范围的 0、0.5、1 三个位置，使用官方构造与实际浮窗投影；不计算所有组选项的笛卡尔积。检查还包含采集用临时 BD 的装备比较行；其中缺少被替换物品身份的来源名称须单独核验，不能当成已覆盖的网页显示。

## 映射与显示

- 原生实体键为 `[table, id, field, element]`，同时保存对应英文。Words 使用 `HASH32` 作为身份，保存 `Wordlist` 命名角色和未经 trim 的原始文本；1 为物品名前半、2 为后半、6 为传奇名称，怪物等其他角色不得混入物品命名。实体身份相同但英文已变化时保留原文，不能偷偷替换历史版本。
- 词缀保留有序属性 ID、条件、参数编号、每次出现的格式和变换标记。只有与当前官方核心格式一致的语言模板才可发布；参数换序仅搬运字符串，不执行数值转换。
- `items/stats/tooltip/ui/terms` 按语义分域，不再无差别复制覆盖词条。`item-type` 用于物品分类，`item-display` 用于装备显示，`item-variant` 用于官方变体，`passive` 用于天赋，`skill` 用于技能，`pob` 用于计算说明。原生词缀按 CSD 的 include 关系继承，并按属性组覆盖继承项，再检查同一语境是否有歧义。审核规则可限定 `scope`，参数递归保留语境；公式范围中的 `to` 只在完整数字结构内翻译，不能加到英文白名单。
- 物品名称必须传递原始名称、稀有度及底材语境。稀有名称只按原生 `Words.Text2` 的前后半名称组合；魔法名称按原生 `Mods.Name` 与 `ClientStrings.MagicName*` 的语言专属顺序排列。不能按任意英文词项拆译，自制标题和公共池用户重命名保持不变。缺少身份或出现多个不同匹配时保留原文。
- 同名物品与词缀不能互相覆盖。装备三防词条存在局部／全局表述冲突，其等价显示译文以 `reviewed-equivalent-game-text` 记录两份原生证据，仅用于 `item-display`；这不是识别 stat ID，不改变局部／全局计算语义。其他未消歧内容仍保留原文。
- `item-translations.mjs` 从锁定核心底材能力和 `reviewed.itemStatSelections` 生成局部／全局显示索引。精魂与附加伤害只使用已经核验的有序 stat 身份；未知底材不推断。传奇背景按官方 FlavourText 身份、名称、底材和实际展示过的完整原文选择，旧版原文不替换成新背景。
- 物品语境中，原生 `{}`、`{:+d}` 只有在单一 stat、单一占位时才映射到参数 0；条件、格式和转换标记仍须一致。此规则不推广到其他语境，也不处理多参数隐式顺序。数值和米／秒等单位仍由官方格式化。
- 生成式珠宝使用完整包装规则：范围天赋包装来自 ClientStrings；指定技能等级包装与内部选项名属于 PoB 审核译文。内层名称或词缀无法完整匹配时保留整句原文，不用零散单词拼接。PoB 本身缺数值、截断的句子及支持状态不一致的多行词条不能补造内容。
- `getTranslationLocale()` 读取当前显示语言；`loadTranslationLocale(locale)` 按需加载；`setTranslationLocale(locale)` 加载成功后更新显示语言，失败保持当前语言并抛错。索引、缓存、缺译记录随各语言包版本独立创建。首次打开不加载繁中包。
- 显示 getter 从原始字段生成 `*_cn`；这些字段名为兼容现有组件保留，不表示它们只能显示简中。尚未接入统一入口的静态中文页面文案不属于繁中切换已完成的证明。
- 珠宝卡片优先读取核心 `displayLines`，按原行号配对 `displayLineUnsupported` 后生成 `displayRows`，不得被旧空 `rawLines` 遮蔽。装备页和计算来源的物品浮窗共用 `useOfficialItemTooltip`，按会话、文档代数和版本失效；同组件只有一个在途请求，重复悬停复用当前版本结果。加载、失败、官方空正文明确区分，不写回物品库或触发全量计算。
- 消耗公式与装备对比使用完整结构模板。对比属性只接受官方 `BuildDisplayStats` 的标签目录；替换物品通过实际物品身份翻译，自制名字保持原样。所有数值、符号、精度来自核心，前端不新增数值运算。
- `cn/shared/item-translation.mjs` 是网页和覆盖检查共用的多行与支持状态分组实现。合并只查注册过的多行模板；普通单行翻译入口保持原有语义。多行候选匹配和未命中使用 8192 条有界缓存，按有效语境、实体、语言包版本隔离；缓存不保存核心计算结果。`Shift`、`Ctrl` 是允许保留的键名，不能扩展为任意英文白名单。
- `getMissingTranslations()` 返回当前运行过程中无法完整匹配的原文。全量覆盖见 `cn/generated/web-data/translations-report.json`，该报告不进入网页包。

## 验证口径

```powershell
node --test cn/tests/pipeline/*.spec.mjs
npm run test:i18n
npm run test:m3
npm run web:typecheck
npm run web:build
```

全量语料按类别记录完整翻译、原文、部分翻译、内部格式与允许缩写，不将内部占位符或已拒绝的词缀当作翻译成功。三处函数式配置提示分别检查普通环境输出与开发环境自定义修正分支；空返回不等于覆盖成功。

运行回归必须使用隔离 BD，覆盖导入、制作、装备预览、计算、防御、配置、公共物品池和多窗口；比较原始结果、canonical 保存内容及请求次数。不能只检查主页面：必须展开生命池与元素伤害二级明细，检查公式、范围、表头、来源名字和空单元格。Lua 的 `false`／`nil` 单元格应为空，数值 `0` 必须保留；官方错误字符串不能当作允许缩写掩盖。

`cn/tests/browser/unique-crafting.mjs` 包含上述二级检查；通过 `POB_CN_PLAYWRIGHT_PATH` 指定现有 Playwright 模块、`POB_CN_BROWSER` 指定浏览器可执行文件即可运行。脚本自行创建临时存档库和双核心，输出截图、语言切换请求数与数据不变断言结果。

设置 `POB_CN_TRANSLATION_FIXTURE` 为已有存档 JSON 的绝对路径，还会创建第三页面，通过真实 UI 导入副本，检查完整消耗公式、计算来源三级物品浮窗、天赋珠宝正文和移动速度来源；原存档只读，测试前后比较文件内容。此项不能以“没有找到来源或已镶嵌珠宝”为由跳过，测试存档应包含这些实际入口。语言变化不得增加业务请求，核心数值、保存内容和原始物品保持不变。

性能以浏览器完成显示为准，不以核心返回为结束点。基础翻译结果见 [翻译验收记录（含 2026-09-09 显示链路复核）](translation-validation-20260908.md)；本轮全目录实际预览覆盖、剩余原文及性能对照见 [传奇翻译修复验收](../repair/unique-translation-2026-09-09.md)。
