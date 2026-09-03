# 旧项目来源清册

## 范围与方法

本清册是对旧项目 `HEAD` 的只读盘点，不复制、移动或修改旧工作树中的任何文件。路径集由以下命令取得：

```powershell
git -C C:\Users\25147\Documents\AI-xiangmu\ninja-poe2\POB-cn ls-tree -r --name-only HEAD -- src core-bridge pob-nextgen tools sync_upstream.ps1 README_CN.md
```

本清册不列入 `Settings.xml`、`imgui.ini`、可执行文件、DLL、`tools/last_imported_build.xml`、构建输出或用户流派。它们是 `LOCAL`，不迁移。

逐文件、可复现的来源快照位于 `docs/architecture/legacy-source-manifest.json`；其生成器会显式记录 `LOCAL` 排除项而不读取其内容。

## 来源快照

| 项目 | 记录值 |
|---|---|
| 旧项目路径 | `C:\Users\25147\Documents\AI-xiangmu\ninja-poe2\POB-cn` |
| 当前分支 | `dev-cn` |
| 当前 HEAD | `0f41abb9b72354e094a73bb2ac33a8bf0305f672` |
| HEAD 主题 | `fix(calc-engine): 修复 activeItemSet 遍历中遇到非 table 属性导致 Lua 后端崩溃的 Bug，彻底恢复天赋、珠宝、装备全量实时重算` |
| HEAD 时间 | `2026-08-25T21:26:49+08:00` |
| `origin` | `https://github.com/fyhello/PathOfBuilding-PoE2.git`（fetch/push） |
| `upstream` | `https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2.git`（fetch/push） |
| 工作树状态 | `git status --porcelain=v1` 共 78 项：12 项修改、54 项删除、12 项未跟踪。原始输出含本机/用户项目，按范围不转录。 |
| 本地旧 upstream ref | `git rev-parse upstream/dev` 退出码 128；不存在可用于推导 merge-base 的本地跟踪 ref。 |

## 自定义路径与处置

下表的路径通配符代表旧 `HEAD` 下该根路径的完整受控文件集合。迁移表示只可在对应 M 阶段重写或按测试迁入；归档表示旧目录保留为证据而不复制；不迁移表示不得进入新仓库。

| 旧 HEAD 路径 | 文件/内容范围 | 决定 | 目标或理由 |
|---|---|---|---|
| `src/PatchCore/**` | `Init.lua`、`Tools/HealthCheck.lua` | 迁移 | M1 重写到 `cn/bootstrap/**`；不得保留提前初始化行为。 |
| `src/DataPatch/**` | `Loader.lua`、`ModsPatch.lua`、`SkillsPatch.lua` | 迁移 | M1 迁到 `cn/lua/data-patches/**`，每个补丁须带版本与 schema 断言。 |
| `src/CustomUI/**` | `Init.lua`、`WorkbenchTab.lua` | 迁移 | M1 迁到 `cn/lua/native-ui/**`，以 `main` 生命周期测试为前置条件。 |
| `src/i18n/**` | 初始化文件及 `zh_CN/**`、`zh_TW/**` 的 Lua 词典 | 迁移 | M2 分离人工覆盖与生成词典；不直接复制输出。 |
| `core-bridge/**` | 3 个 Lua、5 个 MJS、1 个 JS 与现有测试 | 迁移 | M3 重写到 `cn/bridge/**` 和 `cn/tests/bridge/**`，加入超时/退出/黄金测试。 |
| `pob-nextgen/` 的构建与应用源 | 根构建配置、`server.mjs`、`src/App.vue`、组件、store、样式、工具函数 | 迁移 | M3 迁到 `cn/web/**`，保持相对路径和类型检查。 |
| `pob-nextgen/src/data/{bases,gems,tree_0_5,uniques}.json` | 当前 Web 数据输出 | 不迁移 | M2 唯一生成器写入 `cn/generated/web-data/**`；禁止复制旧输出。 |
| `tools/dict-pipeline/{data/**,export-to-pob-lua.mjs,rebuild-poe2-dictionary.mjs,s2t.mjs}` | 词典输入、覆盖与生成脚本 | 迁移 | M2 审核后迁到 `cn/pipeline/**`；输入与覆盖层保留可追溯来源。 |
| `tools/dict-pipeline/upstream-builder/**` | 上游构建器、第三方源码、缓存、二进制/生成数据 | 归档 | 旧项目保留为来源证据；M2 仅重新声明必要、可复现的输入，不复制缓存、二进制或生成结果。 |
| `tools/{build_perfect_tree,combine_official_with_ninja,compile_master_dictionary,compile_tree_nodes,export_all_bases,export_all_game_data,export_all_uniques_and_bases_cn,export_tree_full_cn,export_tree_json,export_tree_official_100,extract_data,extract_tree,fix_all_untranslated,rebuild_tree_official_clean,run_export_bases,translate_tree_with_ninja}.mjs/.lua` | 天赋、基础物品、唯一物品和词典生成/包装脚本 | 迁移 | M2 合并为单一 `generate-content.mjs`；旧脚本不能直接复制。 |
| `tools/{check_*,inspect_*,scan_*,debug_*,run_*,test_*}.mjs/.lua` | 检查、调试、临时运行和测试脚本 | 归档 | 仅从中挑选可脱敏、确定性断言重写进 `cn/tests/**`；不迁移临时调试入口。 |
| `tools/{official_tree_raw.json,raw_bases.json,unique_stats.txt,untranslated_stats.txt,test_code.txt}` | 原始、临时和报告输出 | 不迁移 | 由 M2 重新生成或以测试 fixture 重新定义。 |
| `tools/analyze_user_code.mjs` | 用户代码分析工具 | 不迁移 | 可能写入用户构建输入；不引入新仓库。 |
| `sync_upstream.ps1` | 当前上游同步脚本 | 迁移 | M4 重写为只创建候选同步分支和兼容性报告的脚本。 |
| `README_CN.md` | 旧项目中文说明 | 迁移 | M4 审核内容后迁入 `docs/`，不原样复制旧根文件。 |

## 已验证风险证据

| 风险 | 可验证证据 | 结论 |
|---|---|---|
| 上游路径污染 | `Modules/Main.lua:26-28` 在上游命名空间直接加载并初始化 `src/PatchCore/Init`。 | M1 只能保留 `ownership.yml` 白名单内的一处 bootstrap 调用。 |
| 生命周期先后错误 | `Modules/Main.lua:27-28` 调用 `patchCore.init()`，而 `main = new("ControlHost")` 位于 `Modules/Main.lua:54`。 | 旧 bootstrap 早于 `main`，必须延迟且幂等。 |
| 生成输出冲突 | `tools/build_perfect_tree.mjs:268` 与 `tools/combine_official_with_ninja.mjs:87` 都写 `pob-nextgen/src/data/tree_0_5.json`。 | M2 必须让一个生成入口拥有每个输出。 |
| 更多同一树输出写入者 | `tools/fix_all_untranslated.mjs:139`、`tools/rebuild_tree_official_clean.mjs:50`、`tools/translate_tree_with_ninja.mjs:108` 也写 `pob-nextgen/src/data/tree_0_5.json`。 | 旧输出不可复制；M2 重新生成。 |
| 个人绝对路径 | `tools/export_all_uniques_and_bases_cn.mjs:5` 和 `:9` 读取 `C:/Users/25147/Documents/AI-xiangmu/ninja-poe2/...`。 | 新管线只可从项目根目录的相对路径解析输入。 |
| 直接合并与错误分支假设 | `sync_upstream.ps1:17` 直接 fetch，`:22` 在当前分支执行 `git merge upstream/main`；本次远端查询的默认分支为 `dev`。 | M4 禁止自动合并，并且必须从 version lock 读取分支。 |

## 未确认事实

- 词典、游戏数据和天赋树版本在 M0 均为 `UNPROBED`，准确值锁定在 `cn/config/version-lock.json`。
- 旧仓库没有本地 `upstream/dev` 跟踪 ref，不能从当前工作树安全判断其历史分叉点。
- 本清册只记录来源与决策，不构成旧运行时功能通过或用户数据可用的证明。
