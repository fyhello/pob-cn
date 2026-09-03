# PoB-CN 架构治理与迁移实施计划

> **面向执行子代理：** 每个任务只由一个执行代理完成。完成后必须更新 `docs/migration/PROGRESS.md`，提交代码，并等待验收代理确认；不得自行删除旧项目目录。

**目标：** 在 `C:\Users\25147\Documents\pob-cn` 建立可持续同步官方 Path of Building PoE2 的中文项目；分离上游、项目源代码、生成产物和本机文件，并在功能等价验收后替代旧目录。

**架构：** 新项目以 `cn/config/version-lock.json` 中记录的官方默认分支（当前为 `dev`）及其指定 SHA 为干净基线。所有中文项目代码集中在 `cn/`，仅通过一个受测的 Lua bootstrap 接入上游。M2-0 至 M2-2 的唯一业务输出是 `core.translation`；锻造与 Web 数据只能在 M2-3 首次建立独立合同后生成。词典更新在外部 `ninja-poe2` 工作区完成，POB-CN 只受控导入最终 gzip artifact；每次上游或词典更新均在独立同步分支完成并产生兼容性报告。

**技术栈：** Lua 5.1、Path of Building PoE2、Node.js、Vue 3、Vite、PowerShell、GitHub Actions。

---

## 1. 非协商规则

1. 不在当前 `C:\Users\25147\Documents\AI-xiangmu\ninja-poe2\POB-cn` 工作树执行迁移、同步、清理或 `git merge`。
2. 旧目录是已分类代码的审计与归档对象，不是词典、生成、测试或导入的数据源。只复制经批准的项目源文件；不得移动、覆盖或删除旧目录任何文件。
3. `Settings.xml`、`imgui.ini`、可执行文件、DLL、用户流派和 `last_imported_build.xml` 属于本机或用户数据，不进入新项目版本库。
4. 子代理只执行被分派的单个任务，不扩大目录范围。每项任务结束后停止，等待验收结论。
5. 任何“完成”必须在 `PROGRESS.md` 记录提交 SHA、命令、退出码、产物 hash 和验收人；没有这些证据只能是“进行中”。
6. 删除旧目录是独立的最终任务，必须由用户再次确认精确路径后执行。
7. `M0` 是新仓库首次初始化的唯一例外，直接在用户指定的新项目根目录执行；从 `M1` 开始，所有实现子代理必须在已忽略的 `.worktrees/<branch>/` 中工作。

## 2. 目标目录和文件归属

```text
C:\Users\25147\Documents\pob-cn\
├─ src\                                                        # UPSTREAM
│  ├─ Assets\ Classes\ Data\ Modules\ System\ TreeData\ lua\
├─ cn\                                                         # CN_SOURCE
│  ├─ bootstrap\        # 唯一上游生命周期适配层
│  ├─ lua\              # i18n、数据补丁、原生 UI 扩展
│  ├─ bridge\           # Node <-> Lua 计算桥接
│  ├─ web\              # Vue 前端和服务端
│  ├─ pipeline\         # 唯一词典/游戏数据生成器
│  ├─ generated\        # GENERATED，禁止人工编辑
│  ├─ tests\            # fixture、golden build、回归测试
│  └─ config\           # ownership、version lock、schema
├─ docs\architecture\   # 架构、兼容性和决策记录
├─ docs\migration\      # 本计划、进度台账、验收记录
└─ .github\workflows\   # CI
```

| 归属 | 允许内容 | 修改规则 |
|---|---|---|
| `UPSTREAM` | 官方源代码及其原有工具 | 只由上游同步带入；禁止直接写业务改动 |
| `ADAPTER` | `src/Modules/Main.lua` 中唯一 bootstrap 调用 | 仅允许白名单 hunk，必须有生命周期回归测试 |
| `CN_SOURCE` | `cn/` 下手写代码、人工术语表和覆盖词典 | 只在特性分支修改并配套测试 |
| `GENERATED` | `cn/generated/lua-i18n/`、manifest；`cn/generated/web-data/` 仅 M2-3+ | 只能由唯一生成命令写入；M2-0 至 M2-2 不得创建或读取 `web-data` |
| `LOCAL` | 用户配置、构建产物、依赖目录、诊断输出 | 写入 `.gitignore`，不迁移入版本库 |

## 3. 迁移输入映射

| 旧路径 | 新路径 | 迁移策略 |
|---|---|---|
| `src/PatchCore/` | `cn/bootstrap/` | 重写为延迟、幂等的生命周期适配；不原样复制提前 hook |
| `src/i18n/` | `cn/lua/i18n/` 与 `cn/pipeline/overrides/` | 分离人工覆盖与生成词典；生成文件重建 |
| `src/DataPatch/` | `cn/lua/data-patches/` | 为每个补丁声明适用上游版本和 schema 断言 |
| `src/CustomUI/` | `cn/lua/native-ui/` | 先证明进入 `main` 生命周期，再迁移功能 |
| `core-bridge/` | `cn/bridge/` | 加入请求超时、进程退出恢复和 golden 测试 |
| `pob-nextgen/` | `cn/web/` | 保留构建配置；只有 M2-3 完成独立 crafting 合同后才可导入对应 `cn/generated/web-data/`，不得把旧 Web 数据当作 M2 输入 |
| 自定义 `tools/*.mjs` | `cn/pipeline/` 或 `cn/tests/` | 每个脚本只能有一个输出所有权；无用途脚本不迁移 |
| `sync_upstream.ps1` | `cn/pipeline/sync/new-upstream-sync.ps1` | 改为创建同步分支和报告，禁止在当前分支直接 merge |

## 4. 词典与数据合同

唯一基础词典是受控外部 `ninja-poe2` 工作区产生的 `data/poe2.json.gz`。POB-CN 的 M2 受控输入链为：该 gzip 的原子导入副本 + 两份独立 `zh-CN` 人工 override -> `cn/pipeline/` -> Lua 输出 -> `cn/generated/manifest.json`。gzip 解压后的 `items`、`stats`、`tooltip`、`ui`、`terms` 是导入载荷校验，不是 5 个输入文件。M2-0 至 M2-2 不存在游戏、天赋树、crafting 或泛化 Web 数据 read set。

`manifest.json` 至少包含：官方 commit SHA、PoB 版本、gzip artifact SHA-256、解压 JSON SHA-256、压缩/解压大小、5 域记录数、schema 来源/版本/SHA-256、两份 override hash、输入/输出文件 hash、记录数、未翻译计数、JSON schema 版本、生成命令版本与 completeness。生成器必须拒绝绝对个人路径；所有路径相对项目根目录解析。M2-2 的 completeness 固定为 `partial_crafting_seed_pending`，且只生成 `translations.lua` 与 manifest；游戏/天赋树版本或 Web 数据不能伪装为词典合同字段。

人工修改只能落在 `cn/pipeline/overrides/zh-CN/` 和术语表，不能编辑 `cn/generated/`。一个输出文件只能由一个生成入口写入，消除当前多个脚本同时覆盖 `tree_0_5.json`、`uniques.json`、Lua 词典的情况。

## 5. 上游同步合同

1. 读取 `cn/config/version-lock.json` 的 `upstream.default_branch`（当前为 `dev`），再 fetch 对应的 `upstream/<default_branch>`，创建 `sync/upstream-<short-sha>` 分支。
2. 合并上游后，校验 `UPSTREAM` 文件未被中文业务改动污染，且 `ADAPTER` 改动只命中白名单。
3. 在独立、受控的外部 `ninja-poe2` 工作区记录 CN/国际服客户端版本、工具快照与逐文件 SHA-256、schema 来源/版本/SHA-256。Ninja 有两条不可互换的数据构建路径，且两条都必须以成功的 `npm run build:dict` 为交付前置：首次或离线提取执行 `npm run extract:upstream`，再执行 `npm run build:dict`；游戏补丁更新执行 `python tools/upstream-builder/update.py --cn <CN 客户端> --intl <国际服客户端>`，再执行 `npm run build:dict`。`update.py` 不等价于 `npm run extract:upstream`；即使前者内部可能触发构建，也不能替代完整交付链。`build:dict` 的 `node tools/build-all.mjs` 可能产生 Trade、发布或打包副作用，POB-CN 不得调用、依赖或导入这些步骤和副产物，只允许外部验证后的最终 `data/poe2.json.gz` 进入 importer。
4. `ninja-poe2` 不是 Git 仓库，不得编造 commit 或 remote。其 `tools/upstream-builder/config.json` 当前没有 `schemaUrl`，因此 update 的远程 schema 下载回退不等于自动同步成功；schema 来源、版本和 SHA-256 未人工锁定时，外部更新失败关闭，不得写入 POB-CN。
5. POB-CN importer 的唯一实现位于 M2-1 的 `cn/pipeline/lib/source-lock.mjs`。它必须在仓库外临时事务中准备 gzip、`content-source-lock.json`、`version-lock.json` dictionary 字段和兼容性报告候选，再执行 gzip/JSON/schema/5 域计数/hash 校验；全部候选通过后才以可回滚提交成组替换 `cn/pipeline/sources/dictionary/ninja-poe2/poe2.json.gz`、两个 lock 位置和 `docs/architecture/compatibility/dictionary/<gzip-sha256>.md`。任一校验、候选写入或提交失败都必须恢复导入前逐文件 hash 与报告路径集合，不得改变 manifest 或其他仓库文件；常规 build/test 不得访问外部或旧 POB-CN 绝对路径，更不得隐式执行 Ninja 工具链。
6. 重新生成本阶段允许的 `GENERATED` 输出，比较 manifest、schema、未翻译计数和 completeness。
7. 运行官方测试、bridge golden 测试、导入/导出 round-trip、天赋连接合法性和 Web 类型检查/构建。
8. 生成 `docs/architecture/compatibility/<sha>.md`，列出冲突、数据差异、失效补丁、人工决定，以及客户端版本、外部工具 hash、schema 身份、override hash、gzip/json hash、压缩/解压大小、5 域计数、命令/退出码和导入结论。
9. 只有 CI 全绿及验收通过后，才能将同步分支合入 `cn-main`。不允许脚本自动合并。

## 6. 执行任务与验收

### 任务 M0：建立可追溯基线与归属清册

**文件：**
- 创建：`cn/config/ownership.yml`
- 创建：`cn/config/version-lock.json`
- 创建：`docs/architecture/source-inventory.md`
- 修改：`.gitignore`
- 修改：`docs/migration/PROGRESS.md`

- [ ] 子代理先执行 `git ls-remote --symref https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2.git HEAD`，记录官方默认分支；不得假定为 `main`。
- [ ] 子代理确认官方树不存在 `docs/migration/` 冲突后，在新项目根目录初始化 Git，添加 `upstream`，fetch 已记录默认分支，并以精确 SHA 创建 `cn-main`。
- [ ] 如首次完整检出会阻塞基线建立，子代理可使用 partial clone 与只含 `.gitignore` 的稀疏检出；必须在 `version-lock.json` 和台账中记录该状态，且不得把它作为完整源码或发布验收。
- [ ] 子代理在 `.gitignore` 添加 `.worktrees/`，运行 `git check-ignore -q .worktrees`，通过后才为后续任务启用项目内隔离工作树。
- [ ] 子代理将本计划和台账纳入首次治理提交；记录当前旧工作树的文件清单和 hash，不复制用户数据。
- [ ] 子代理写入五类文件归属及唯一输出所有者；验收代理确认每个旧项目自定义文件都有“迁移、归档或不迁移”结论。
- [ ] 验收命令：`git status --short`、`git rev-parse HEAD`、`git remote -v`、`git rev-parse upstream/<记录的默认分支>`。

**通过条件：** 新项目可定位到一个官方 SHA；`.worktrees/` 已被 Git 忽略；归属清册覆盖旧 `src/`、`core-bridge/`、`pob-nextgen/`、自定义 `tools/` 和根脚本；本机文件已忽略。稀疏检出仅允许作为 M0 基线，M5 的从零构建验收必须使用完整工作树。

### 任务 M1：迁移并修复唯一 bootstrap

**文件：**
- 创建：`cn/bootstrap/Init.lua`
- 创建：`cn/bootstrap/Lifecycle.lua`
- 创建：`cn/tests/lua/bootstrap_lifecycle_spec.lua`
- 创建：`cn/tests/lua/run-bootstrap-lifecycle.mjs`
- 创建：`package.json`、`package-lock.json`（仅用于锁定 Lua 生命周期测试运行时）
- 修改：`src/Modules/Main.lua`

- [ ] 子代理先以 `cn/tests/lua/bootstrap_lifecycle_spec.lua` 写失败用例，并用 Node 锁定的 Lua 5.1 兼容运行时执行。用例必须覆盖：无 `main` 时记录 `ERROR` 并失败；同一 host 重复安装或重复调用 `Init` 时，bootstrap 各阶段只运行一次；初始化前阶段发生在原始 `main:Init()` 之前；初始化后阶段发生在其之后；三个未注册扩展（i18n、数据补丁、原生 UI）分别产生可检索诊断，不能静默跳过。
- [ ] 子代理在 `cn/bootstrap/Lifecycle.lua` 实现唯一状态机：`Install(main)` 只接受已创建的 host；它只包装 `main:Init()` 一次，并按「前置扩展 -> 原始 `main:Init()` -> 后置扩展」执行。前置扩展供后续 i18n 和数据补丁任务注册，后置扩展供后续原生 UI 任务注册；缺失扩展必须通过 `ConPrintf` 以模块名和阶段记录诊断。
- [ ] 子代理在 `cn/bootstrap/Init.lua` 暴露唯一安装入口和注册 API。M1 不得复制旧 `PatchCore`、词典、数据补丁或工作台业务实现，也不得引用旧项目的绝对路径。
- [ ] 子代理仅在 `src/Modules/Main.lua` 的 `function main:Init()` 定义结束后、模块 `return main` 前添加一处 `cn/bootstrap/Init` 安装调用；不得改动上游的其他 hunk。此时 `main` 与原始 `main:Init()` 均已定义，安装只包装 `Init` 而不直接执行扩展；随后由 `src/Launch.lua` 在完整加载模块后调用已包装的 `Init`。
- [ ] 验收命令：`npm ci`；`npm run test:bootstrap`；启动日志断言；`git diff -- src/Modules/Main.lua` 白名单审查；所有命令和退出码写入台账。测试运行时和 lockfile 必须随仓库提交，禁止依赖任意 `C:\Users\...` 的 Lua 可执行文件。

**通过条件：** 原生 Lua 扩展有明确、可测试的 `main` 生命周期接入点；未迁入模块不会静默失效；上游修改只保留 `src/Modules/Main.lua` 的经批准 bootstrap hunk。

### 任务 M2：建立单一词典与内容生成管线

M2 已拆分为有严格顺序的 `M2-0` 至 `M2-3`。详细文件清单、输入 hash、禁止迁移的旧产物、测试与验收命令见 [2026-08-26-m2-content-pipeline-plan.md](2026-08-26-m2-content-pipeline-plan.md)。

当前 M2 总阶段与 M2-0 至 M2-3 均为“待开始”。只有 4 个子阶段全部完成并分别验收，且 A4-0、A4-1、A4-2、A4-3 均通过后，主代理才可将 M2 标记为“已验收”；任何单项计划、测试或子阶段结论均不足以改变该总状态。

- [ ] `M2-0`：在新的隔离工作树完整物化锁定上游，记录完整 upstream 树/业务树快照，并探测唯一 `ninja-poe2` gzip artifact、schema 与导入兼容性；禁止探测或锁定 game/tree/crafting/Web 输入。
- [ ] `M2-1`：将经受控导入 hash 验证的唯一 gzip 词典副本，以及两份独立人工 override 冻结到 `cn/pipeline/sources/` 与 `cn/pipeline/overrides/`，建立仅供 M2-2 `core.translation` 使用、严格含 3 个输入的 `stage: "M2-2"` 选择集和归属检查；M2-3 输入只能在其自身阶段另行登记。
- [ ] `M2-2`：实现唯一 `node cn/pipeline/generate-content.mjs`，首次且唯一创建 `cn/pipeline/lib/manifest-validator.mjs`，只生成受归属约束的 Lua i18n 与 `partial_crafting_seed_pending` manifest。
- [ ] `M2-3`：首次建立并人工审阅独立 crafting authority、seed、schema、合同与 `cn/generated/web-data/crafting.json`；没有可追溯的 seed，锻造数据不得作为完整迁移交付。

**通过条件：** 完整上游源已物化；任意干净工作树可用锁定的 gzip 与 override 两次生成相同输出；M2-2 只写 `translations.lua` 与 partial manifest；所有 generated 文件只有唯一写入者；M2-3 的锻造 seed 与翻译覆盖均可审阅；旧目录中的未跟踪 JSON 从不作为输入。

### 任务 M3：迁移 bridge 与 Web 应用

**文件：**
- 创建：`cn/bridge/*`
- 创建：`cn/web/*`
- 创建：`cn/tests/bridge/*`
- 创建：`cn/tests/web/*`
- 创建：`cn/tests/m3/manifest-gate.spec.mjs`

- [ ] **第一步必须先写 manifest partial 红灯测试。** M2-2 已创建唯一的 `cn/pipeline/lib/manifest-validator.mjs`；M3 只允许导入它，严禁创建替代版本。在任何 bridge、Web、导入/导出或发布实现迁移之前，创建 `cn/tests/m3/manifest-gate.spec.mjs`，以临时仓库分别放置 `manifest.completeness = "partial_crafting_seed_pending"` 和 `manifest.completeness = "complete"`。测试通过同一个既有 API `assertManifestCompleteFromRepo(repoRoot)` 驱动 5 个真实入口：bridge 启动、Web build/typecheck、导入、导出 round-trip、发布/打包。对 partial fixture，5 个入口都必须非零退出且错误中包含 manifest 路径、实际 completeness 和 `crafting seed pending`；对 complete fixture，5 个入口才允许继续并返回零。测试还必须断言全部入口导入的是同一个 validator，而非复制条件判断。
- [ ] **运行红灯并保留证据。** 运行 `node --test cn/tests/m3/manifest-gate.spec.mjs`，预期因 5 个入口中至少一个尚未接入 M2-2 validator 而失败；若测试在入口尚未改造时通过，说明没有验证 partial 消费路径，必须退回重写。
- [ ] **只接入共享 manifest validator 和入口门禁。** bridge 启动、Web build/typecheck 包装脚本、导入 runner、导出 round-trip runner、发布/打包脚本都必须在第一步调用 M2-2 的 `assertManifestCompleteFromRepo(repoRoot)`。验证失败直接写 stderr 并以非零退出，不得开始读取 generated crafting 数据。门禁不能由环境变量、跳过参数或空文件绕过；M3 不得创建、复制或修改 validator 的业务判断。
- [ ] **门禁通过后才迁移功能。** 仅在 partial/complete 两套门禁测试均绿后，子代理才可将 Node/Lua bridge 与 Vue 应用复制至 `cn/`，改用生成数据和仓库相对路径；为导入、导出、天赋合法连接、装备修改与计算结果准备匿名 golden fixture。不得在门禁测试通过前把 M2-2 的 partial 产物接入任何构建、round-trip 或发布路径。
- [ ] **验收命令：** `node --test cn/tests/m3/manifest-gate.spec.mjs`、bridge 启动探针、`npm run build`、`npx vue-tsc --noEmit`、导入命令、导出 round-trip、发布入口 dry-run；每个真实入口都必须在读取 manifest 后复现 partial 非零和 complete 零的结果。

**通过条件：** 共享 manifest validator 的 partial 拒绝测试先于所有 M3 实现且全绿；前端类型检查、构建、发布入口和 bridge/round-trip 均拒绝非 complete manifest；complete fixture 下全部通过，核心互操作与计算回归有自动化证据。

### 任务 M4：固定同步 CI 与发布门禁

**文件：**
- 创建：`.github/workflows/verify.yml`
- 创建：`.github/workflows/upstream-sync.yml`
- 创建：`cn/pipeline/sync/new-upstream-sync.ps1`
- 创建：`docs/architecture/compatibility/README.md`

- [ ] 子代理为文件归属检查、manifest 漂移、外部 gzip importer 原子失败和同步报告编写 CI 测试；报告必须验证客户端版本、Ninja 工具 hash、schema 身份、override hash、gzip/json hash、大小、5 域计数和命令退出码完整。
- [ ] 子代理迁移有效工作流至 `.github/workflows/`，移除对不存在脚本的引用。
- [ ] 子代理实现只创建候选同步分支的脚本，禁止在用户当前分支 merge。
- [ ] 验收命令：本地 workflow lint、完整验证脚本、模拟上游 SHA 与 schema 缺失/回退的兼容性报告；schema 身份不完整时必须失败且不替换受控 gzip。

**通过条件：** 任何上游更新都能得到可审查的分支、数据差异和测试结果。

### 任务 M5：等价验收、切换与旧目录清理申请

**文件：**
- 创建：`docs/migration/acceptance-report.md`
- 创建：`docs/migration/cutover-inventory.md`
- 修改：`docs/migration/PROGRESS.md`

- [ ] 子代理从零 clone 新项目，完成安装、生成、测试和构建。
- [ ] 子代理使用已脱敏的 golden build 对比导入、导出、计算、天赋、装备、技能和中文覆盖率。
- [ ] 验收代理复核所有证据，生成迁移完成报告和旧目录精确清单。
- [ ] 仅在用户书面确认后，由独立子代理删除精确旧目录并记录删除清单；没有确认则保留归档。

**通过条件：** 新项目满足发布门禁，且删除动作与迁移验收完全解耦。

## 7. 验收职责与进度协议

执行代理负责实现、测试和提交；验收代理负责复现命令、审查 diff、更新“验收结果”，但不重写实现。每完成一个复选项，必须在 `PROGRESS.md` 新增一条记录。若验收失败，记录失败原因并将任务退回“进行中”，不得覆盖历史记录。

## 8. 当前已知风险

- 旧项目 `Modules/Main.lua` 在第 27 行启动补丁，而 `main` 在第 54 行才创建；现有 hook 会静默失效。新仓库对应上游适配路径为 `src/Modules/Main.lua`。
- 当前多个工具能覆盖同一词典或 Web 数据，且存在个人绝对路径。
- 旧项目的 `sync_upstream.ps1` 曾直接合并 `upstream/main`；这是历史脚本问题，新同步流程必须从版本锁读取默认分支，且没有生成、测试、兼容性报告或版本锁定前不得合并。
- 旧工作树已有大量未提交变更和删除，任何整理前都必须先做清册。
