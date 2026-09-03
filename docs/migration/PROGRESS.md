# PoB-CN 迁移进度台账

本文件是迁移过程的唯一进度记录。只追加，不重写既有记录；每条“完成”记录必须能在 Git 历史和命令输出中复现。

## 状态定义

- `待开始`：尚未分派。
- `进行中`：子代理已接手，但尚未提交可验收结果。
- `待验收`：实现已提交，等待验收代理复现。
- `已验收`：验收命令、提交 SHA 和证据完整。
- `已退回`：验收失败，保留失败证据并重新进入 `进行中`。

## 记录格式

```markdown
### <UTC+8 日期时间> | <任务/步骤 ID> | <状态>

- 执行代理：<agent id>
- 验收代理：<agent id 或待分派>
- 工作分支：<branch>
- 提交：<full SHA 或无>
- 范围：<实际修改的文件>
- 执行命令：`<命令>`（退出码：<code>）
- 证据：<测试输出路径、manifest hash、报告路径>
- 验收结论：<通过/退回及原因>
```

## 台账

### 2026-08-26 20:02 | P0-01 | 已验收

- 执行代理：`/root`
- 验收代理：`/root`
- 工作分支：无（尚未初始化新项目 Git 仓库）
- 提交：无
- 范围：创建 `docs/migration/2026-08-26-architecture-migration-plan.md`、`docs/migration/ACCEPTANCE.md` 与本台账。
- 执行命令：`New-Item -ItemType Directory -Force -Path C:\Users\25147\Documents\pob-cn\docs\migration`（退出码：0）
- 证据：上述 3 个文档已位于 `C:\Users\25147\Documents\pob-cn\docs\migration`。
- 验收结论：通过。仅创建计划与台账；未初始化 Git、未迁移代码、未修改或删除旧项目文件。

### 2026-08-26 20:02 | M0 | 待开始

- 执行代理：待分派
- 验收代理：`/root`
- 工作分支：待创建
- 提交：无
- 范围：建立干净上游基线与文件归属清册。
- 执行命令：无
- 证据：无
- 验收结论：待执行。

### 2026-08-26 20:08 | P0-02 | 已验收

- 执行代理：`/root`
- 验收代理：`/root`
- 工作分支：无（尚未初始化新项目 Git 仓库）
- 提交：无
- 范围：修订迁移计划，明确 `M0` 的首次初始化例外和 `M1` 起的 `.worktrees/` 隔离规则。
- 执行命令：计划文档自检（任务数：6；待办数：26；占位符匹配：0）（退出码：0）
- 证据：`2026-08-26-architecture-migration-plan.md` 第 21 行及 M0 任务段。
- 验收结论：通过。规则与用户指定的新项目根目录兼容，未执行迁移实现。

### 2026-08-26 20:21 | M0 | 待验收

- 执行代理：`/root/m0_baseline`
- 验收代理：`/root`
- 工作分支：`cn-main`
- 提交：`914d34dead7d63eb129092126d8bcdf6d4a70f1f`
- 范围：`.gitignore`、`cn/config/ownership.yml`、`cn/config/version-lock.json`、`docs/architecture/source-inventory.md` 及三份治理文档。
- 执行命令：`git ls-remote --symref https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2.git HEAD`（退出码：0；默认分支 `dev`，SHA `5d173cbf8c9cf394a975cbb813f19d0b6dc67ea6`）；`git -C C:\Users\25147\Documents\pob-cn fetch --filter=blob:none --depth=1 --no-tags upstream refs/heads/dev:refs/remotes/upstream/dev`（退出码：0）；`node -e <version-lock parser>`（红灯退出码：1，绿灯退出码：0）；`node -e <ownership static checker>`（红灯退出码：1，绿灯退出码：0）；`git check-ignore -q .worktrees`（红灯退出码：1，创建受忽略目录后绿灯退出码：0）；`git diff --cached --check`（退出码：0）；`git commit -m "chore(governance): 建立可追溯的迁移基线"`（退出码：0）。
- 证据：`cn/config/version-lock.json`、`cn/config/ownership.yml`、`docs/architecture/source-inventory.md`、本台账，以及提交 `914d34dead7d63eb129092126d8bcdf6d4a70f1f`。
- 验收结论：待验收。M0 已建立可追溯上游基线和归属清册；验收代理须在 `cn-main` 复现远端、JSON/YAML、忽略规则和提交差异验证。

### 2026-08-26 20:17 | P0-03 | 已验收

- 执行代理：`/root`
- 验收代理：`/root`
- 工作分支：`cn-main`（尚无中文项目提交）
- 提交：无
- 范围：依据 M0 发现修订默认分支验收和稀疏检出限制。
- 执行命令：`git ls-remote --symref <upstream> HEAD`（官方默认分支：`dev`）；稀疏基线状态检查（退出码：0）。
- 证据：官方 SHA `5d173cbf8c9cf394a975cbb813f19d0b6dc67ea6`；计划文档 M0 段。
- 验收结论：通过。旧脚本对 `upstream/main` 的假设已从新流程中移除；完整工作树仍保留为 M5 门禁。

### 2026-08-26 20:31 | M0-SPEC-01 | 已退回

- 执行代理：`/root/m0_baseline`
- 验收代理：`/root`；独立规格审查：`/root/m0_spec_review`
- 工作分支：`cn-main`
- 提交：`1425259ee45276e61b6e5c2c04dc63b15af0a2e2`（被审查提交）；本记录提交后补充。
- 范围：对 M0 治理基线的规格合规性验收；未修改迁移实现或旧项目文件。
- 执行命令：`git status --short`、`git rev-parse HEAD`、`git remote -v`、`git rev-parse upstream/dev`、`git check-ignore -q .worktrees`、`git sparse-checkout list`、JSON/YAML/唯一生产者检查、`git diff --check 5d173cb..1425259`（均退出码：0）；独立审查的 `git ls-remote --symref <upstream> HEAD` 因远端重置退出码：1。
- 证据：`cn/config/version-lock.json`、`cn/config/ownership.yml`、`docs/architecture/source-inventory.md`、`.gitignore`、规格审查报告及当前提交 `1425259ee45276e61b6e5c2c04dc63b15af0a2e2`。
- 验收结论：退回。必须由原实施代理修复后重新接受规格审查：
  1. 在版本锁和台账记录 `partial clone`、`blob:none`、sparse 路径 `/.gitignore`，并明确完整检出前不得作源码或发布验收。
  2. 为旧工作树建立可复现的逐文件 manifest，记录路径、工作树状态、Git blob hash 或工作树 SHA-256，以及迁移、归档或不迁移结论；覆盖根脚本与未跟踪的项目源码，仍排除 `LOCAL` 用户数据。
  3. 将计划和后续同步合同中现存的 `upstream/main` 改为从版本锁读取的默认分支，当前为 `dev`。
  4. 让 `.gitignore` 覆盖 `ownership.yml` 声明的 `LOCAL` 文件，例如 `Settings.xml`、`imgui.ini`、`Builds/`、`node_modules/`、`tools/last_imported_build.xml` 和根 EXE/DLL。

### 2026-08-26 20:46 | M0-SPEC-01-R1 | 待验收

- 执行代理：`/root`
- 验收代理：待分派（须独立复现）
- 工作分支：`cn-main`
- 提交：`a5f5b8a3f2813ef195e6b78d2f871548deccc9e4`
- 范围：`.gitignore`、`cn/config/ownership.yml`、`cn/config/version-lock.json`、`docs/architecture/generate-legacy-source-manifest.mjs`、`docs/architecture/legacy-source-manifest.json`、`docs/architecture/source-inventory.md`、`docs/migration/2026-08-26-architecture-migration-plan.md`。
- 执行命令：`node docs/architecture/generate-legacy-source-manifest.mjs --legacy-root C:\Users\25147\Documents\AI-xiangmu\ninja-poe2\POB-cn --output docs/architecture/legacy-source-manifest.json --generated-at 2026-08-26T20:42:13+08:00`（退出码：0；`records=360`、`local_exclusions=6`）；同生成器 `--verify`（退出码：0）；独立 manifest schema/required-path 校验（退出码：0；required=10）；`git check-ignore -q --no-index` 的 11 个 `LOCAL` 样本（退出码：0）；version-lock 与 ownership/唯一生产者静态校验（退出码：0）；`git rev-parse --verify upstream/dev`（退出码：0，`5d173cbf8c9cf394a975cbb813f19d0b6dc67ea6`）；`git check-ignore -q .worktrees`、活动 `upstream/main` 合同检查与 `git diff --check`（均退出码：0）。
- 证据：`docs/architecture/legacy-source-manifest.json` 的 SHA-256 为 `09192132BC9A35B5BEF7AEBAFF922E4445CF1AFB2D55A5F0094067B36CBC5E17`；清单记录 `legacy_head_commit=0f41abb9b72354e094a73bb2ac33a8bf0305f672`、逐文件 Git/worktree 状态、blob hash 或 SHA-256，以及 `迁移`/`归档`/`不迁移` 决定；`LOCAL` 仅记录状态和规则，未读取或哈希其内容。
- 验收结论：待验收。版本锁明确当前检出是 `partial clone`、`blob:none`、仅 sparse `/.gitignore`，不得据此宣称完整源码、构建或发布验收；未修改或删除旧工作树文件，未开始 M1。

### 2026-08-26 21:00 | M0-PROVENANCE-01 | 待验收

- 执行代理：`/root/m0_baseline`
- 验收代理：待分派（须独立复现）
- 工作分支：`cn-main`
- 更正对象：`M0-SPEC-01-R1` 的「执行代理」字段应为 `/root/m0_baseline`，原记录误写为 `/root`。
- 关联提交：原 M0 修复实现为 `a5f5b8a3f2813ef195e6b78d2f871548deccc9e4`；含错误执行代理字段的台账提交为 `5ef892cbe3454189139304b86a8410d42d9ed47e`。
- 范围：仅追加本台账追溯更正；不改迁移实现、不触碰 `C:\Users\25147\Documents\AI-xiangmu\ninja-poe2\POB-cn` 旧项目，也不开始 M1。
- 执行命令：`git status --short`（退出码：0；无输出）；`git branch --show-current`（退出码：0；`cn-main`）；`git rev-parse HEAD`（退出码：0；`5ef892cbe3454189139304b86a8410d42d9ed47e`）；`Get-Content docs/migration/PROGRESS.md | Select-Object -Last 35`（退出码：0；确认原记录仍存在）。
- 证据：提交前工作树清洁；本记录仅修正可追溯身份，不改变 `M0-SPEC-01-R1` 的实现提交、manifest hash、验收边界或旧工作树只读约束。
- 提交：待提交；完整 SHA、`git diff --check`、台账差异和提交后工作树验证将在紧随其后的只追加追溯记录中登记。
- 验收结论：待验收。需独立确认更正仅影响台账归属，且所有既有 M0 验收边界保持不变。

### 2026-08-26 21:00 | M0-PROVENANCE-01-TRACE | 待验收

- 执行代理：`/root/m0_baseline`
- 验收代理：待分派（须独立复现）
- 工作分支：`cn-main`
- 更正提交：`28c41c6e9e59c97191c7a4edfa741c9845d49d24`，提交主题为 `docs(迁移): 更正 M0 执行归属记录`。
- 范围：仅追溯 `M0-PROVENANCE-01` 的提交身份；本记录和所追溯提交均只修改 `docs/migration/PROGRESS.md`，不改迁移实现、不触碰旧项目，也不开始 M1。
- 执行命令：`git diff --check`（退出码：0）；`git diff -- docs/migration/PROGRESS.md`（退出码：0；仅新增 `M0-PROVENANCE-01`）；`git status --short`（退出码：0；仅 `M docs/migration/PROGRESS.md`）；`git add --sparse -- docs/migration/PROGRESS.md`（退出码：0）；`git diff --cached --check`（退出码：0）；`git diff --cached --name-only`（退出码：0；仅 `docs/migration/PROGRESS.md`）；`git commit -m "docs(迁移): 更正 M0 执行归属记录"`（退出码：0）；`git rev-parse HEAD`（退出码：0；`28c41c6e9e59c97191c7a4edfa741c9845d49d24`）。
- 证据：更正提交直接父提交为 `5ef892cbe3454189139304b86a8410d42d9ed47e`；`git show --name-only 28c41c6` 仅应列出本台账。错误字段的来源、原 M0 实现 SHA 与旧工作树只读边界均由 `M0-PROVENANCE-01` 明确记录。
- 验收结论：待验收。独立验收应核对本追溯提交及前一更正提交均未改变 M0 实现内容，且 `M0-SPEC-01-R1` 的实施代理更正为 `/root/m0_baseline`。

### 2026-08-26 21:12 | M0-COMMAND-01 | 待验收

- 执行代理：`/root/m0_baseline`
- 验收代理：待分派（须独立复现）
- 工作分支：`cn-main`
- 修复前 HEAD：`8fac40fb92610ceebe046922f6012f3d45f20d3b`
- 澄清对象：`M0-SPEC-01-R1` 将 manifest 复验命令简写为「同生成器 `--verify`」，未完整记录实际参数。
- 规范复验命令：`node docs/architecture/generate-legacy-source-manifest.mjs --legacy-root 'C:\Users\25147\Documents\AI-xiangmu\ninja-poe2\POB-cn' --output docs/architecture/legacy-source-manifest.json --verify`（退出码：0；输出：`LEGACY_MANIFEST_VERIFY_OK records=360 local_exclusions=6`）。
- 裸命令证据：`node docs/architecture/generate-legacy-source-manifest.mjs --verify`（退出码：1；`Error: --legacy-root is required`）。该参数显式要求是为避免生成器隐式依赖个人绝对路径；裸命令不是 M0 计划的验收命令。
- 范围：仅追加台账命令追溯澄清；不改 `docs/architecture/generate-legacy-source-manifest.mjs`，不改迁移实现或功能，不触碰 `C:\Users\25147\Documents\AI-xiangmu\ninja-poe2\POB-cn` 旧项目，也不开始 M1。
- 执行命令：`git status --short`（退出码：0；无输出）；`git branch --show-current`（退出码：0；`cn-main`）；`git rev-parse HEAD`（退出码：0；修复前 HEAD）；上述裸命令与规范复验命令分别按其记录的退出码执行。
- 证据：规范命令对既有 `docs/architecture/legacy-source-manifest.json` 进行只读可复现比对，未写入旧项目；工作树在编辑前清洁。
- 提交：待提交；本条台账提交的完整 SHA、`git diff --check`、`git show --name-only` 和提交后状态将在紧随其后的只追加追溯记录中登记。
- 验收结论：待验收。独立验收须使用完整规范复验命令；裸命令的参数校验失败不构成 M0 实现或功能缺陷。

### 2026-08-26 21:12 | M0-COMMAND-01-TRACE | 待验收

- 执行代理：`/root/m0_baseline`
- 验收代理：待分派（须独立复现）
- 工作分支：`cn-main`
- 澄清提交：`f34104c74b330e9d39a35afa757ed6647a3a8761`，提交主题为 `docs(迁移): 澄清 M0 清单复验命令`。
- 范围：仅追溯 `M0-COMMAND-01` 的命令澄清提交；所追溯提交只修改 `docs/migration/PROGRESS.md`，未修改生成器、迁移实现、功能或旧项目，未开始 M1。
- 执行命令：`git diff --check`（提交后退出码：0）；`git status --short`（提交后退出码：0；无输出）；`git rev-parse HEAD`（退出码：0；`f34104c74b330e9d39a35afa757ed6647a3a8761`）；`git show --name-only --format='%H %s' f34104c74b330e9d39a35afa757ed6647a3a8761`（退出码：0；仅列出 `docs/migration/PROGRESS.md`）。
- 证据：`M0-COMMAND-01` 已记录裸命令的参数校验退出码 `1` 与规范完整命令的退出码 `0`、输出 `LEGACY_MANIFEST_VERIFY_OK records=360 local_exclusions=6`；本追溯提交使澄清提交 SHA 可由 Git 历史独立复现。
- 验收结论：待验收。独立验收应同时复现裸命令的预期参数校验失败和规范完整命令的成功结果，并确认两次台账提交均未触碰旧项目。

### 2026-08-26 21:20 | M0-ACCEPT-01 | 已验收

- 验收代理：`/root`
- 规划代理：`/root`
- 实现代理：`/root/m0_baseline`；实现及追溯提交：`914d34dead7d63eb129092126d8bcdf6d4a70f1f`、`a5f5b8a3f2813ef195e6b78d2f871548deccc9e4`、`28c41c6e9e59c97191c7a4edfa741c9845d49d24`、`8fac40fb92610ceebe046922f6012f3d45f20d3b`、`f34104c74b330e9d39a35afa757ed6647a3a8761`、`c037353a482f3b532cc8effd2952f8a1c27faa48`。
- 被验收 HEAD：`c037353a482f3b532cc8effd2952f8a1c27faa48`；工作树：清洁。
- 规格复审：`/root/m0_spec_recheck` 复核了 M0 全部条款。其指出的裸 `--verify` 参数失败已按计划原文与实现行为复核：M0 未把裸命令列为验收命令，生成器显式要求 `--legacy-root` 是为避免隐式依赖个人绝对路径。`M0-COMMAND-01` 已追加唯一可复制的完整校验命令，因此该项不构成 M0 实现缺陷。
- 质量复审：`/root/m0_baseline/m0_repair_review` 已独立审查清单生成器和 M0 修复实现，结论为无 `P0/P1/P2`。其后至被验收 HEAD 的变更仅为 `PROGRESS.md` 追溯记录，已由 `git show --name-only` 复核。
- 复现命令：`git status --short`（退出码：0；无输出）；`git rev-parse HEAD`（退出码：0；`c037353a482f3b532cc8effd2952f8a1c27faa48`）；`git remote -v`（退出码：0；官方 URL、`blob:none`）；`git rev-parse --verify upstream/dev`（退出码：0；`5d173cbf8c9cf394a975cbb813f19d0b6dc67ea6`）；`git sparse-checkout list`（退出码：0；`/.gitignore`）；`git check-ignore --no-index -v .worktrees/m1-bootstrap`（退出码：0）。
- 清单复现：`node docs/architecture/generate-legacy-source-manifest.mjs --legacy-root 'C:\\Users\\25147\\Documents\\AI-xiangmu\\ninja-poe2\\POB-cn' --output docs/architecture/legacy-source-manifest.json --verify`（退出码：0；`LEGACY_MANIFEST_VERIFY_OK records=360 local_exclusions=6`）；manifest SHA-256 为 `09192132BC9A35B5BEF7AEBAFF922E4445CF1AFB2D55A5F0094067B36CBC5E17`。
- 合同复现：受控 manifest 静态校验（退出码：0；`records=360`、`required=10`、`local=6`）；`ownership.yml` YAML 和唯一输出生产者校验（退出码：0；`categories=5`、`outputs=3`）；10 个 `.worktrees`/LOCAL 样本 `git check-ignore --no-index -q` 校验（退出码：0）。
- 范围复现：`git diff --check 914d34dead7d63eb129092126d8bcdf6d4a70f1f..c037353a482f3b532cc8effd2952f8a1c27faa48`（退出码：0）；差异路径仅为 `.gitignore`、`cn/config/**`、`docs/**`；`git diff --check 8fac40fb92610ceebe046922f6012f3d45f20d3b..c037353a482f3b532cc8effd2952f8a1c27faa48`（退出码：0）。旧项目仅通过 Git、哈希和生成器的只读命令检查，`HEAD` 仍为 `0f41abb9b72354e094a73bb2ac33a8bf0305f672`。
- 网络说明：本次 `git ls-remote --symref https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2.git HEAD` 被远端重置（退出码：1），不计为实时远端验证通过。初始台账和独立规格复审曾成功记录官方默认分支为 `dev`；本次已验证本地锁定文件、`upstream/dev` 和 SHA 三者一致。后续 M4 上游同步 CI 必须再次执行实时 fetch/remote 校验。
- 验收结论：M0 的「可追溯基线与归属清册」通过。partial/sparse 检出仅证明治理基线，不能推导完整源码、构建、发布或功能等价验收；这些门禁留待 M1-M5。允许开始 M1；旧目录删除仍需 M5 后用户明确确认精确路径。

### 2026-08-26 21:22 | M0-ACCEPT-01-TRACE | 已验收

- 验收代理：`/root`
- 工作分支：`cn-main`
- 验收提交：`8f63b884f1aa7e684c60b7e62538f57f801c2b9d`，提交主题为 `docs(迁移): 验收 M0 治理基线`。
- 追溯范围：该提交仅追加 `M0-ACCEPT-01`，只修改 `docs/migration/PROGRESS.md`；不改迁移实现、不触碰旧项目、不改变 M0 的 partial/sparse 验收限制。
- 复现命令：`git show --name-only --format='%H %s' 8f63b884f1aa7e684c60b7e62538f57f801c2b9d`（退出码：0；仅列出本台账）；`git diff --check c037353a482f3b532cc8effd2952f8a1c27faa48..8f63b884f1aa7e684c60b7e62538f57f801c2b9d`（退出码：0）；`git status --short`（退出码：0；无输出）。
- 验收结论：M0 已完成。M1 可开始，但必须在已忽略的 `.worktrees/<branch>/` 中由独立实施代理执行。

### 2026-08-26 21:36 | M1-PRECHECK-01 | 已完成（实施前）

- 规划代理：`/root`
- 范围：仅修订 M1 的上游入口路径、白名单与可执行测试合同；未创建 M1 工作树，未修改产品代码；旧项目未修改。
- 路径结论：`git ls-tree -r --name-only upstream/dev` 确认上游入口为 `src/Modules/Main.lua`，并同时存在 `src/Classes/ControlHost.lua`、`src/Launch.lua`、`src/Export/Main.lua`；`upstream/dev` 不存在 `/Modules/Main.lua`。因此将 `ownership.yml` 的 `ADAPTER` 和 `bootstrap_adapter_whitelist`、迁移计划的目标路径统一更正为 `/src/Modules/Main.lua`。
- 生命周期结论：`src/Modules/Main.lua` 先执行 `main = new("ControlHost")`，随后定义 `main:Init()`；`src/Launch.lua` 通过 `PLoadModule("Modules/Main")` 加载后才调用 `main:Init()`。旧项目的 `PatchCore.init()` 在创建 `main` 前运行，且 `hookBuild()` 以 `if _G.main` 静默跳过。新 M1 固定为包装已创建 host 的 `main:Init()`，按前置扩展、原始 `Init`、后置扩展执行，避免 `main:OnFrame()` 后续定义覆盖过早安装的 UI hook。
- 测试结论：当前环境未发现系统 `lua`、`luajit` 或 `busted` 命令；M1 测试须用仓库锁定的 Node Lua 5.1 兼容运行时执行，不得引用任意用户目录的解释器。该测试基础设施是 M1 的唯一新增 Node 依赖，不迁移 M2/M3 的词典、数据、bridge 或 Web 业务。
- 提交：待提交；完整 SHA、差异检查与工作树状态由下一条仅追溯记录补充。
- 验收结论：待验收。必须先完成本条治理改动的提交追溯和独立复核，才允许派发 M1 实施代理。

### 2026-08-26 21:38 | M1-PRECHECK-01-TRACE | 待验收

- 规划代理：`/root`
- 工作分支：`cn-main`
- 前置决策提交：`28d3aeac1b278fc5de62cff7257bdcd38e15e52a`，提交主题为 `docs(迁移): 修正 M1 bootstrap 入口合同`。
- 提交范围：`cn/config/ownership.yml`、`docs/migration/2026-08-26-architecture-migration-plan.md`、`docs/migration/PROGRESS.md`；不含 `src/`、`cn/bootstrap/`、`cn/tests/` 或旧项目文件。
- 提交前验证：`git diff --check`（退出码：0）；必需文本检查（退出码：0；`M1_PRECHECK_DOCUMENTS_OK`）；`git cat-file -e upstream/dev:src/Modules/Main.lua`、`src/Classes/ControlHost.lua`、`src/Launch.lua`（均退出码：0）；`git cat-file -e upstream/dev:Modules/Main.lua`（退出码：1，符合「根路径不存在」预期）。
- 提交验证：`git diff --cached --check`（退出码：0）；`git diff --cached --name-only`（退出码：0；仅上述 3 个文件）；`git commit`（退出码：0）；`git rev-parse HEAD`（退出码：0；`28d3aeac1b278fc5de62cff7257bdcd38e15e52a`）；`git status --short`（退出码：0；无输出）。
- 验收结论：待验收。独立复核必须确认目标上游路径、白名单、M1 生命周期阶段与测试运行时合同一致，且本提交未引入任何 M1 产品实现。

### 2026-08-26 21:44 | M1-PRECHECK-02 | 已完成（实施前）

- 复核代理：`/root/m1_precheck_review`
- 复核对象：`28d3aeac1b278fc5de62cff7257bdcd38e15e52a` 与 `ecef72ba43c3abe873a3d02f3a3ff9848b17b2c9`。
- 必须修复项：复核确认 `src/Modules/Main.lua` 在 `main = new("ControlHost")` 后才开始定义 `main:Init()`；若在构造语句紧后调用 `Install(main)`，无法可靠包装未定义的 `main.Init`。该表述不能交由 M1 实施代理自行猜测。
- 修订：M1 唯一 adapter 调用改为位于 `function main:Init()` 定义结束后、模块 `return main` 前。安装时 host 和原始 `Init` 都已存在；实际初始化仍由 `src/Launch.lua` 在 `PLoadModule("Modules/Main")` 完整返回后调用，因此后置原生 UI hook 不会被稍后定义的 `main:OnFrame()` 覆盖。
- 复核命令：`git rev-parse HEAD`（退出码：0；`ecef72ba43c3abe873a3d02f3a3ff9848b17b2c9`）；`git diff --check b90ae9d..ecef72b`（退出码：0）；`git diff --name-only b90ae9d..ecef72b`（退出码：0；仅 3 个治理文件）；`git cat-file -e upstream/dev:src/Modules/Main.lua`（退出码：0）；`git cat-file -e upstream/dev:Modules/Main.lua`（退出码：1，符合根路径不存在预期）。
- 提交：待提交；完整 SHA、差异检查和再次独立复核结果由后续台账追溯记录补充。
- 验收结论：待验收。不得在此修订前派发 M1 实施代理。

### 2026-08-26 21:46 | M1-PRECHECK-02-TRACE | 待验收

- 规划代理：`/root`
- 修订提交：`6fcd2dc1d223cffcbf860bf1de091a225c812ca8`，提交主题为 `docs(迁移): 修正 M1 Init 包装时机`。
- 提交范围：仅 `docs/migration/2026-08-26-architecture-migration-plan.md` 与本台账；不含 `src/`、`cn/bootstrap/`、`cn/tests/` 或旧项目文件。
- 提交前验证：`git diff --check`（退出码：0）；M1 合同文本检查（退出码：0；`M1_PRECHECK_02_DOCUMENTS_OK`）；上游行序检查（退出码：0；`UPSTREAM_INIT_ORDER_OK new=50 init=52 shutdown=338 return=1812`）。
- 提交验证：`git diff --cached --check`（退出码：0）；`git diff --cached --name-only`（退出码：0；仅上述 2 个文件）；`git commit`（退出码：0）；`git rev-parse HEAD`（退出码：0；`6fcd2dc1d223cffcbf860bf1de091a225c812ca8`）；`git status --short`（退出码：0；无输出）。
- 验收结论：待验收。独立规格复核必须确认 M1 的唯一 adapter 安装点处于原始 `main:Init()` 定义完成之后、模块加载完成之前，并且仍保持单一白名单 hunk。

### 2026-08-26 21:55 | M1-PRECHECK-ACCEPT-01 | 已验收（实施前）

- 规划与验收代理：`/root`；独立规格复核：`/root/m1_timing_recheck`。
- 验收对象：M1 前置决策与时机修订提交 `28d3aeac1b278fc5de62cff7257bdcd38e15e52a`、`6fcd2dc1d223cffcbf860bf1de091a225c812ca8`、`dfede5f3797f2cf60aa29762613b489db1f13925`。
- 独立结论：无 `P0`、`P1`、`P2`。`src/Modules/Main.lua` 的唯一安装调用合同已固定在原始 `function main:Init()` 定义结束后、模块 `return main` 前；`src/Launch.lua` 完整加载模块后才调用 `PCall(self.main.Init, self.main)`，因此包装顺序可保持「前置扩展 -> 原始 Init -> 后置扩展」，且不会被后续 `OnFrame` 定义覆盖。
- 复核命令：`git status --short`（退出码：0；无输出）；`git diff --check 28d3aea..dfede5f`（退出码：0）；`git diff --name-only 28d3aea..dfede5f`（退出码：0；仅迁移计划与台账）；上游 `src/Modules/Main.lua`、`src/Launch.lua` 行序检查和 M1 合同/ownership 静态检查（均退出码：0）。
- 范围结论：上述前置提交均未创建或修改 `cn/bootstrap/`、`cn/tests/`、`package.json`、`package-lock.json` 或 `src/Modules/Main.lua` 产品实现；旧项目未修改。
- 残余边界：本条是实施前治理验收，尚未运行 `npm ci` 或 `npm run test:bootstrap`；partial/sparse 基线仍不能作为完整源码、构建或发布验收。
- 验收结论：允许由独立实施代理在已忽略的 `.worktrees/m1-bootstrap` 中执行 M1。实施完成后必须先通过规格审查，再进入代码质量审查与主线复验；未通过前不得开始 M2。

### 2026-08-26 21:55 | M1-PRECHECK-ACCEPT-01-TRACE | 已验收（实施前）

- 验收记录提交：`d39d43a8d35d85d3cd15a8ba8b203475f7460251`，提交主题为 `docs(迁移): 验收 M1 实施前合同`。
- 提交范围：仅 `docs/migration/PROGRESS.md`；不包含 M1 产品实现、adapter 改动、依赖安装或旧项目文件。
- 提交验证：`git diff --cached --check`（退出码：0）；`git diff --cached --name-only`（退出码：0；仅本台账）；`git commit`（退出码：0）；`git rev-parse HEAD`（退出码：0；`d39d43a8d35d85d3cd15a8ba8b203475f7460251`）。
- 验收结论：M1 前置合同已闭环，可开始隔离工作树中的单任务实施。

### 2026-08-26 22:02 | M1-PRECHECK-ACCEPT-01-TRACE-CORRECTION | 已验收（实施前）

- 更正对象：`M1-PRECHECK-ACCEPT-01-TRACE` 中的验收记录完整 SHA 被误记为 `d39d43a8d35d85d3cd15a8ba8b203475f7460251`；该字符串不是本仓库对象。
- 正确对象：`d39d43a6bce90fda3b91390e87618bdc2c6aa2d5`，提交主题为 `docs(迁移): 验收 M1 实施前合同`。该提交是当前追溯提交 `787a1b58ea951a16f4543cf20e05da641e39f1d4` 的直接父提交。
- 复现命令：`git log -2 --format='%H%n%s'`、`git rev-parse 787a1b58ea951a16f4543cf20e05da641e39f1d4^`、`git rev-parse d39d43a`（均退出码：0，均返回正确对象）；误记 SHA 的 `git show` 失败是本更正的触发证据。
- 范围：仅追加本台账更正；不改 M1 产品实现、adapter、依赖或旧项目文件。
- 验收结论：此前 M1 前置规格结论不变；实施前台账 SHA 已可由 Git 对象独立验证。

### 2026-08-26 22:16 | M1 | 待验收

- 执行代理：`Codex（M1 实施）`
- 验收代理：待分派。
- 工作分支：`codex/m1-bootstrap`（基线 `6c41a9820446c9cf21afacfb10be090209fe00cf`）。
- 提交：待创建。本条记录随 M1 实现进入同一原子提交；最终完整 SHA 以提交后的 `git rev-parse HEAD` 为准。
- 范围：创建 `cn/bootstrap/Init.lua`、`cn/bootstrap/Lifecycle.lua`、`cn/tests/lua/bootstrap_lifecycle_spec.lua`、`cn/tests/lua/run-bootstrap-lifecycle.mjs`、`package.json`、`package-lock.json`；仅在 `src/Modules/Main.lua` 增加 1 个 bootstrap adapter hunk；追加本台账。
- 测试运行时：`package-lock.json` 锁定 `lua-wasm-bindings@0.5.3`（Lua 5.1.5 WASM）、`semver@7.8.5`、`@types/semver@7.8.0`；未使用系统 `lua`、`luajit`、`busted` 或用户目录解释器。
- 红灯证据：`npm install --package-lock-only --ignore-scripts`（退出码：0）；首次 `npm ci`（退出码：0）；生产 Lua 文件尚未创建时运行 `npm run test:bootstrap`，按预期因缺少 `cn/bootstrap/Lifecycle.lua` 的 `ENOENT` 失败。实现后首次运行 `npm run test:bootstrap`（退出码：7）暴露 `lua.lua_setglobal is not a function`；导出 API 检查确认绑定提供 `lua_getglobal`、`lua_pushstring`、`lua_setfield`、`lua_settop`，不提供 `lua_setglobal`。修正测试运行器后再次运行用例，按预期暴露原始 `Init` 调用次数为 `4`（期望 `2`），确认结果打包逻辑重复调用原始初始化。
- 绿灯证据：`npm ci`（退出码：0；`added 3 packages`、`found 0 vulnerabilities`）；`npm run test:bootstrap`（退出码：0；`PASS invalid-host`、`PASS unregistered`、`PASS lifecycle`、`PASS adapter`）；`npm ls lua-wasm-bindings semver @types/semver --depth=0`（退出码：0）；`node -e <package-lock version check>`（退出码：0，锁定版本如上）；`git diff --check`（退出码：0）。
- adapter 决策：`src/Modules/Main.lua` 在原始 `main:Init()` 定义结束后通过仓库相对 `GetScriptPath() .. "/../cn/bootstrap/Init.lua"` 调用 `loadfile`，校验模块 API 后只执行 `bootstrap.Install(main)`。adapter 测试使用 stub host、`GetScriptPath` 和 `loadfile`，确认加载顺序且不执行生命周期阶段；生命周期由完整加载模块后的上游 `src/Launch.lua` 调用包装后的 `main:Init()`。
- 已验证行为：缺少 host 或 `main.Init` 会通过 `ConPrintf` 记录 `ERROR` 并失败；重复安装只包装 1 次；前置 `i18n`、`data-patch` 在原始 `Init` 前，后置 `native-ui` 在其后；每个未注册扩展均产生可检索诊断；原始 `Init` 的返回值和每次调用语义保留。
- 限制：当前仓库仍为 `partial clone`、`blob:none` 的稀疏检出。M1 仅完成 Node 锁定 Lua 5.1 生命周期与 adapter 加载契约测试；未执行完整 PoB 构建、完整 `src/Launch.lua` 启动或实际应用验收，也未开始 M2。
- 验收结论：待独立复现 `npm ci`、`npm run test:bootstrap`、adapter 白名单差异和提交范围后确认；旧项目未修改。

### 2026-08-26 22:41 | M1-P1 | 待验收

- 前置 M1 实现提交：`904f8c37f6f040808565cfccb69c8690e4cdb9ef`（`feat(bootstrap): 建立 M1 生命周期适配`）。
- 问题：独立第二次 `loadfile(Init.lua)` 会再次执行 `Lifecycle.lua`，使后续 `Register` 写入新的局部阶段表；已由 `Main.lua` adapter 安装的 `main.Init` 仍捕获第一套阶段表。
- 修复：`cn/bootstrap/Init.lua` 缓存并复用经校验的 `Install`/`Register` API。首次加载保留 Lifecycle 闭包和注册表，后续加载只返回同一 API；未改 `src/Modules/Main.lua` adapter hunk 或 `src/Launch.lua`。
- 红灯证据：补足 adapter 合同测试宿主后运行 `npm run test:bootstrap`（退出码：1），前四项通过，`adapter-registration` 断言失败：期望 `i18n,data-patch,original,native-ui`，实际为 `original`。
- 绿灯证据：实现共享 API 后运行 `npm run test:bootstrap`（退出码：0；`PASS invalid-host`、`PASS unregistered`、`PASS lifecycle`、`PASS adapter`、`PASS adapter-registration`）。
- 验证边界：adapter-registration 真实加载 `src/Modules/Main.lua` 并验证其安装路径；为隔离 Lifecycle 合同，测试以 `debug.setupvalue` 替换包装器捕获的原始 Init，因此未执行完整应用初始化。仓库仍是 `partial clone`、`blob:none` 的稀疏检出；未做完整 PoB 构建、`src/Launch.lua` 启动或实际应用验收，未开始 M2。
- 提交：待创建。本条记录随 P1 修复进入同一原子提交，最终完整 SHA 由提交后的 Git 记录追溯。
- 验收结论：待独立复现依赖安装、Bootstrap 合同测试、adapter 白名单差异和提交范围；旧项目未修改。

### 2026-08-26 22:56 | M1-ACCEPT-01 | 已验收

- 规划与验收：`/root`；实施：`/root/m1_bootstrap_impl`；初次规格复核：`/root/m1_spec_review`。
- 验收对象：M1 实现提交 `904f8c37f6f040808565cfccb69c8690e4cdb9ef` 与 P1 修复提交 `2e51240d53e125ceada776490bb4dd3f1d5b4c40`。后者已由 `cn-main` 从 `6c41a9820446c9cf21afacfb10be090209fe00cf` 快进至相同对象。
- 规格复核闭环：初次独立审查发现三项 P1，分别为跨加载注册表失效、返回值/日志/诊断断言不足、台账新增旧项目绝对路径。修复后，`Init.lua` 复用经校验的全局生命周期 API；adapter 重载注册、`nil,value,nil` 返回值、两类错误的独立日志、三类未注册诊断的精确一次计数均有回归测试；M1 新增行不含旧项目绝对路径。
- 质量审阅：仅保留 `src/Modules/Main.lua` 的一个新增 adapter hunk（23 行）；其余产品改动均在 M1 白名单文件中。生命周期代码没有系统 Lua、用户路径或子进程依赖；`package-lock.json` 锁定 `lua-wasm-bindings@0.5.3` 的 Lua 5.1 WASM 运行时。未发现新的 P0、P1 或 P2。
- 复现（完整物化工作树、提交 `2e51240d53e125ceada776490bb4dd3f1d5b4c40`）：`npm ci`（退出码 0；added 3 packages，0 vulnerabilities）；`npm run test:bootstrap`（退出码 0；`PASS invalid-host`、`PASS unregistered`、`PASS lifecycle`、`PASS adapter`、`PASS adapter-registration`）；`git status --short`（退出码 0；无输出）；`git diff --check 6c41a9820446c9cf21afacfb10be090209fe00cf HEAD`（退出码 0）；提交范围检查（退出码 0；8 个 M1 白名单路径）。
- 主线范围复核：`git diff --unified=0 6c41a9820446c9cf21afacfb10be090209fe00cf 2e51240d53e125ceada776490bb4dd3f1d5b4c40 -- src/Modules/Main.lua`（退出码 0；仅一个新增 hunk）；新增行旧项目绝对路径检查（退出码 0；无匹配）；`git diff --check`（退出码 0）。
- sparse 边界：根工作树仍只物化 M0 的 `.gitignore`，因此并未在根工作树执行 M1 的 Node 测试；在该根目录运行 `npm ci` 的退出码为 1，原因是 `package-lock.json` 未物化。这不是产品测试失败，等价提交的完整物化隔离工作树复现结果为本条的有效证据。partial/sparse 基线仍不构成完整 PoB 构建、`src/Launch.lua` 启动、实际应用或发布验收。
- 验收结论：M1 的 bootstrap 生命周期与可回归测试合同通过；允许开始 M2。旧项目未修改，旧目录删除仍须等 M5 完成且取得用户对精确路径的确认。

### 2026-08-27 | M2-0 | 已完成

- 提交：`b5737ade194870ecd6431a28279b8ae053daa84a`。
- 上游固定：`upstream/dev` 为 `5d173cbf8c9cf394a975cbb813f19d0b6dc67ea6`；完整上游快照包含 1,896 个 blobs。
- 上游树 SHA-256：`4e08811bb30bc0e5d767f20aa84347f9542bfc4d9a128393a5f9e7e0bd0e15bf`。
- 受控 Ninja 词典身份：gzip SHA-256 为 `2af6460f94ef0fc6ef9826e7ca8b06f485013b4828993e0480391b9138bcc779`；解压 payload SHA-256 为 `18f613924fe3a8092bc00194ff1082309484c454773f76566674db1feba4057a`。
- 五域计数：`items=13609`、`stats=29358`、`tooltip=2592`、`ui=499`、`terms=24169`。
- 允许的 M1 上游例外仅为 `.gitignore` 与 `src/Modules/Main.lua`。

### 2026-08-27 | M2-1 | 已完成并验收

- 初始提交：`bcdd927c80cea0e25526a5099e85349891d304af`；修复提交：`9eb2b184e630305654194c4356574249d5c7c565`。
- 实现内容：建立内容源锁、内容合同、归属投影、完整业务树快照、受控导入事务模块及测试；词典输入固定于 POB-CN 受控目录。
- 修复原因：补足 lock/version/compatibility-report 的交叉校验；支持携带完整 `externalEvidence` 的未来候选 gzip 导入；移除 Ninja 绝对路径依赖；以真实临时 Git 仓库验证 tracked/untracked snapshot 分类。
- 单次最终验证：`npm ci` 通过，`0 vulnerabilities`；M2 pipeline 为 `24 pass, 1 skip`，跳过原因为当前 Windows 账号没有创建 symlink 的权限；M1 bootstrap regression 通过；`git diff --check` 通过。
- 审查边界：未再次启动 M2-1 质量或规格复审，原因是用户要求停止重复审查和重复测试；以上单次验证作为 M2-1 最终验收依据。

### 2026-08-27 | M2-2 | 已完成并单次范围核对

- 提交：`8db972ee1c5000fa4e73636684dddb1557b08d66`。
- 生成结果：Lua 翻译表共 24,169 条；manifest completeness 为 `partial_crafting_seed_pending`。
- 输出 SHA-256：`cn/generated/lua-i18n/translations.lua` 为 `2A07FAC1BF1444799C63F8BA960A4C7E96BAF1553D41EAE68BC48DF738C05A7D`；`cn/generated/manifest.json` 为 `FF21A7B7726584C7DDF0032A9C6D2CCC82B30A25C1D53609FE782DB6A12B9901`。
- 实施验证：生成器测试 `3/3` 通过；manifest 测试 `2/2` 通过；双生成字节一致；`git diff --check` 通过。
- 主代理仅进行一次范围核对，变更仅包含 7 个文件：两个 generated 输出、`generate-content.mjs`、`manifest-validator.mjs`、manifest schema 和两个 spec；未重复执行测试或启动额外审查。

### 2026-08-27 | M4 | 已完成，待主线快进

- 实现提交：`64c3e7ad8bbf93fa92dfb14be61e35734bda2888`（`feat(m4): 固定同步 CI 与发布门禁`）。
- 交付：新增 `verify.yml` 与仅手动触发的 `upstream-sync.yml`；新增候选同步脚本、兼容性报告合同、报告字段说明和三项同步回归。同步器只 fetch、创建 `sync/upstream-<12 位 SHA>`、在 Git 元数据目录写报告；不 checkout、merge 或替换 gzip/lock。
- 报告字段：候选分支与上游 SHA、CN/国际服版本、三个 Ninja 工具 hash、schema 身份及禁止 fallback、两个 override hash、gzip/解压 JSON hash 与大小、五域计数、最终 `npm run build:dict` 退出码及同步命令退出码。
- 跨平台修正：M2-3 authority 曾锁定 Windows CRLF 工作树的原始 hash，Linux CI 的 LF checkout 会失败。现改为上游 Git/LF 内容 hash，并同步更新 crafting seed、slot map、生成 `crafting.json` 与 manifest；上游快照中的 `worktree_raw_sha256_diagnostic` 保留为历史诊断字段。
- 验证：`node --test cn/tests/sync/new-upstream-sync.spec.mjs` 为 3/3 通过，覆盖模拟 SHA 报告、缺 schema 失败关闭与受控 gzip/lock 不变；pipeline 既有 32 项与修正后的 `generate-content.spec.mjs` 3/3 通过（1 项 Windows symlink 权限跳过）；`npm run test:m3` 为 7/7 通过；锁定 Web 依赖安装无漏洞，`vue-tsc --noEmit` 后生产构建生成 `cn/web/dist/index.html`；`git diff --check` 通过。
- 边界：GitHub Actions 尚未在远端执行，主线快进后由 push/PR 触发；候选分支仅供人工审阅，任何实际 gzip 导入和上游合并仍须走独立流程。

### 2026-08-27 | M6 | 已完成并验收

- 工作树：`C:\Users\25147\Documents\pob-cn`，分支 `cn-main`；旧 POB-CN 工作树未修改、未删除。
- 工作树修复：解除误配的 sparse checkout，按已有 `cn-main` 提交物化 `src/`、`cn/`、`runtime/` 与迁移文档；物化前后 Git 状态均无业务覆盖。
- 词典：新工程内受控文件 `cn/pipeline/sources/dictionary/ninja-poe2/poe2.json.gz` 与用户指定外部 artifact SHA-256 均为 `2af6460f94ef0fc6ef9826e7ca8b06f485013b4828993e0480391b9138bcc779`，大小均为 `2,558,745` bytes。运行、测试和生成不读取旧项目路径。
- bridge：服务只从项目内 `Builds/luajit/luajit.exe` 或显式 `POB_CN_LUAJIT` 解析运行时，并使用仓库相对 `LUA_PATH`。新增本地运行时 staging 脚本，不包含机器或旧项目绝对路径。bridge 对官方 HeadlessWrapper 当前 Build 采用受控兼容 shim；导入后未完成转换的 Build 返回 `POB_BUILD_LOAD_INCOMPLETE`。
- 导出：`/api/export` 和前端导出弹窗均使用官方 `build:SaveDB()` 生成 URL-safe PoB 分享码，移除前端占位字符串。当前 Build 在官方 loader 替换后仍被正确导出。
- 单次最终验证：`npm run test:bootstrap` 为 6/6 通过；`npm run test:m3` 为 14/14 通过；`npm run web:build` 通过并产生 `cn/web/dist/index.html`。新目录 bridge 在 `127.0.0.1:3003` 启动（`3002` 为旧 `server.mjs` 占用，未停止）。current-version fixture 的 `import -> export -> import -> export` 通过，两个 canonical XML 均含 `Build`、`Skills`、1 个 `SkillSet` 与 2 个 `Skill`。
- 未完成项：`content-contract.json` 声明的 `cn/lua/i18n/loader.lua` 尚不存在，24,169 条 generated Lua 词典尚未接入官方 desktop UI；这是下一 M7 的明确阻断项，M6 不将其标为已完成翻译。

### 2026-08-27 | M7 | 已完成并验收

- 范围：新增 `cn/lua/i18n/loader.lua`，只通过仓库相对 `loadfile` 消费受控 generated 词典；仅在 `src/Modules/Main.lua` 既有 CN bootstrap adapter hunk 注册 `i18n` 生命周期回调。未迁入旧 `src/i18n/`，未修改旧目录。
- 行为：运行时包装 `DrawString`、`DrawStringWidth` 及 `Control:GetProperty()` 的常见显示文本属性；保留 PoB 颜色前缀和未知文本，避免重复翻译。无头环境缺少绘制函数时仍可加载词典和完成初始化。
- 红灯证据：生产 loader 尚不存在时，`node cn/tests/lua/run-i18n-loader.mjs` 以 `ENOENT: ... cn\\lua\\i18n\\loader.lua` 失败。
- 绿灯证据：`npm run test:i18n` 输出 `PASS ui`、`PASS headless`；`npm run test:bootstrap` 为 6/6 通过；从 `src` 启动项目内 LuaJIT bridge 后输出 `POB_JSON` ready，`calculator.available=true`。
- 边界：当前词典是 24,169 条 exact-key terms 表。动态拼接、表外 UI 文案、绕开 `GetProperty()` 的 raw 属性读取、非 DrawString 渲染和人工逐屏桌面显示验收仍未覆盖；M7 不将项目标记为“完整翻译完成”。完整证据见 `docs/migration/M7-I18N-ACCEPTANCE.md`。
- 验收：实施提交 `66273437a8a8f52b6b85de02bfbdb6b12efd49cf`（`feat(m7): load generated Lua translations into UI`）。主代理按既定轻量门禁核对提交范围为 8 个约定路径、提交后 `cn-main` 工作树干净；采纳执行代理记录的单次红灯、`test:i18n`、`test:bootstrap` 与 headless smoke 结果，不重复执行 M6 或扩大审查。

### 2026-08-27 17:22 | M5-0 | 已退回

- 执行代理：`/root/m5_cleanroom`；验收代理：`/root`。
- 工作分支：`cn-main`；被验收提交：`774ffee5748bd113076c8693eef67dbeed949be4`。
- 范围：从当前新仓库创建唯一临时 clone；一次 `npm ci`、一次受控生成、四个固定自动化门禁和状态检查；不执行 M6 HTTP/export 回归，不读写旧项目。
- 通过：`npm ci`、`npm run generate:content`、`npm run test:bootstrap`（6 项通过）、生成后 Git 状态与差异检查均为退出码 `0`。`npm run test:m3` 的单次输出列出 14 项通过，但并行命令载体未回传退出码；后续未发现其 Node 进程，未重跑。
- 阻断：`npm run test:i18n`（退出码 `1`）要求被忽略的 `Builds/luajit/luajit.exe`；`npm run web:build`（退出码 `1`）因 `vite` 未安装失败，根 `npm ci` 未安装 `cn/web` 子项目依赖。
- 清理：临时 clone 的 Git 根与路径一致性已核对。首轮删除被三个只读 Git pack 文件阻塞；仅移除该 clone 内 `.idx`、`.pack`、`.rev` 的只读属性后清理成功，最终标记 `M5_CLEANROOM_REMOVED`，路径不存在。
- 证据：`docs/migration/M5-CLEANROOM-ACCEPTANCE.md`。
- 验收结论：退回。须先固定 i18n 的无本机依赖运行时供给和 Web 子项目依赖安装合同，再以同一单次 M5-0 序列复验。不得依据本条进行切换或旧目录删除。

### 2026-08-27 | M5-1 | 待验收

- 执行代理：`/root/m5_repair`；验收代理：`/root`。
- 工作分支：`codex/m5-cleanroom-repair`；提交：待本次实现提交后由验收代理记录。
- 范围：根 npm workspace/lock、i18n 测试运行器与既有 Lua spec、CI 安装步骤、M5 修复记录；未读写旧项目，未执行完整 M5/M6 复验。
- 修复：i18n 回归改用 `lua-wasm-bindings` 的 Lua 5.1；为受控 24,169 条 Lua 词典采用有界传输和隔离状态，消除被忽略的本机 `Builds/luajit` 依赖。根 `package.json` 将 `cn/web` 定义为 workspace，并由根 lockfile 锁定 Web 依赖。
- 执行命令：`npm ci`（退出码 `0`）；`npm run test:i18n`（退出码 `0`，`PASS ui`、`PASS headless`）；`npm run web:build`（退出码 `0`，生成 `cn/web/dist/index.html`）；`git diff --check`（退出码 `0`）。
- 证据：`docs/migration/M5-CLEANROOM-ACCEPTANCE.md` 的 M5-1 段；根 `package-lock.json` 包含 `cn/web` workspace 与 Vite 锁定记录。
- 验收结论：M5-0 的两个可复现性阻断已修复，仍待从修复提交创建全新 clone 后执行一次完整 M5-0 序列。此条不授权切换或删除旧目录。

### 2026-08-27 18:03 | M5-0-R1 | 环境阻断

- 执行代理：`/root/m5_cleanroom_r1`；验收代理：`/root`。
- 基线：`917203f24512371a9a7c1a189124c00bbcdd48c1`（M5-1 修复后的 `cn-main`）；新 clone 初始状态干净，旧项目未读取或写入。
- 单次执行结果：`npm ci`、`npm run generate:content`、`npm run test:bootstrap`（6/6）和 `npm run test:i18n`（ui/headless）均为退出码 `0`。`npm.cmd run test:m3` 输出 15/16 通过后，在测试临时目录复制 `tree_0_5.json` 时因 C: 盘 `ENOSPC` 退出 `1`；按固定序列未执行其后的 `npm run web:build`、状态/差异检查，也没有重试。
- 清理阻断：已解析并核对仅属于 M3/M5 自动化的临时目录；主代理对精确 `LiteralPath` 的递归清理请求被当前执行环境策略拒绝，因此未使用替代删除机制。临时 clone 和门禁目录仍占用空间，须由用户释放空间后再以新的 clone 完整复验。
- 证据：`docs/migration/M5-CLEANROOM-ACCEPTANCE.md` 的 `M5-0-R1 Disk-Space Blocker` 段；C: 盘现场仅余约 10 MB。
- 验收结论：环境阻断，不是产品功能失败。M5 仍未完成，不能切换或删除旧目录；清理并释放空间后只需重新执行一次固定 M5-0 序列。

### 2026-08-27 | M3 fixture 空间修复 | 已完成

- 提交：`cf3a354`（`test(m3): avoid copying worktree fixtures`）。
- 修复：M3 fixture 递归复制现在排除 `node_modules`、`.git` 和 `.worktrees`，并兼容 Windows 与 POSIX 路径分隔符；fixture 在复制、读取或写入 manifest 失败时会清理已创建的临时目录，`partial`/`complete` 创建阶段也会清理先前成功创建的 fixture。
- 验证：单次 `npm.cmd run test:m3` 为 17/17 通过；`git diff --check` 通过。
- 边界：M5 仍须在新的 clean-room clone 中按固定完整序列复验一次；在复验完成前不可切换，也不可删除旧目录。

### 2026-08-27 18:39 | M5-0-R2 | 已验收

- 执行代理：`/root/m5_cleanroom_r2`；验收代理：`/root`。
- 工作分支：`cn-main`；基线提交：`0e066ac74fab245a98e121ee09bb16e2d953f732`。
- 范围：仅在一个全新的 `%LOCALAPPDATA%\\Temp` clone 执行 M5 固定 clean-room 序列；随后只追加本台账和 `M5-CLEANROOM-ACCEPTANCE.md`。未读写旧项目，未启动 bridge、HTTP/export 或桌面程序。
- 路径与基线：唯一临时目录为 `C:\\Users\\25147\\AppData\\Local\\Temp\\pob-cn-m5-r2-96f604497c814a70be5c4e157c920b01`；创建前已确认其不存在、位于 Temp、且不等于新仓库或旧项目根。clone 的 Git root 与该目录完全一致，`HEAD` 为记录的基线提交。
- 单次执行命令：`npm ci`（退出码：0）；`npm run generate:content`（退出码：0）；`npm run test:bootstrap`（退出码：0，6/6）；`npm run test:i18n`（退出码：0，ui/headless）；`npm.cmd run test:m3`（退出码：0，17/17）；`npm run web:build`（退出码：0）；`git status --short`（退出码：0，无输出）；`git diff --check`（退出码：0，无输出）。没有重跑。
- 清理证据：最终再次确认该临时目录是其自身 Git root 后，以字面量目录删除成功（退出码：0）；`Directory.Exists` 为 `False`。记录时 C: 可用空间为 `12.08 GB`。
- 提交：`094aa41d54eed35c6069d87f2f665d7933dcff23`。
- 主代理验收：已核对基线、全部一次性门禁通过、临时 clone 删除证据、提交范围仅 `docs/migration/PROGRESS.md` 与 `docs/migration/M5-CLEANROOM-ACCEPTANCE.md`，且当前工作树清洁。
- 验收结论：M5 clean-room 自动化门禁已验收通过；仍不授权 production cutover、逐屏桌面功能/翻译验收或删除 `C:\\Users\\25147\\Documents\\AI-xiangmu\\ninja-poe2\\POB-cn` 旧目录。

### 2026-08-27 | M8-import-contract | 已完成，待人工验收

- 执行代理：`/root/m8_import_contract`；验收代理：`/root`
- 工作分支：`cn-main`
- 范围：`cn/lua/real-calc-adapter.lua`、`cn/bridge/http-server.spec.mjs`、`cn/tests/bridge/real-calc-adapter.spec.mjs`、`cn/web/src/stores/buildStore.ts`、`cn/web/src/components/ImportExportModal.vue`、`cn/web/src/stores/importContract.ts`、`cn/tests/web/import-contract.spec.mjs`。
- 修复：官方 `loadXML` 成功后新增受控 `pob-cn-web-active-build-v1` 投影，包含 buildName/class/ascendancy/level、已分配天赋、单一活动装备集的物品与装备槽、已映射珠宝、单一活动技能集与宝石、官方 `mainOutput` 标量；空珠宝槽不再误报为投影失败。多套天赋/装备/技能集或无法映射条目返回 `POB_IMPORT_PROJECTION_UNSUPPORTED` 与字段路径。
- 前端：导入状态消费统一合同，成功响应必须含 `data`；HTTP/桥接/投影错误保留错误码与诊断消息，不再固定显示“格式不完整”。成功投影会实际更新 Pinia 的角色、等级、天赋、物品、装备、珠宝、技能组和计算属性状态。
- 红灯：首次定向测试因测试运行器从根目录解析 `typescript`，错误地报告模块缺失；修正为 `cn/web/node_modules/typescript` 后未重跑红灯。
- 绿灯：`node --test cn/tests/bridge/real-calc-adapter.spec.mjs cn/tests/bridge/http-server.spec.mjs cn/tests/web/import-contract.spec.mjs`（退出码：0，10/10）；`cn/web` 工作目录执行 `vue-tsc --noEmit -p tsconfig.json`（退出码：0）；`npm.cmd run web:build`（退出码：0）。
- 真实样本：使用用户提供的本地 PoB 分享码在独立 bridge 进程完成一次 `decode -> loadXML -> official BuildOutput -> projection`，结果为成功；97 级 Witch、131 个已分配节点、26 件物品、17 个已装备槽、24 个技能组、72 颗宝石，官方输出含 Life/TotalDPS。完整分享码未写入仓库、文档或日志。
- 限制：当前 Web 投影只支持一个活动天赋树、一个装备集和一个技能集；配置、备注、比较页等复杂官方 XML 数据仍由官方核心保留但未投影到 Web 状态；尚未完成人工桌面逐屏验收。
- 验收结论：主代理已完成一次真实 Web UI 导入初验；UI 信号为 `Imported build`、`Witch`、`level 97`、`131 allocated nodes`。M8 总体仍待用户继续逐屏验收。

### 2026-08-27 | M8-calculate-apply | 已完成，待人工验收

- 问题：Web store 会把等级、天赋、装备、珠宝、技能组和计算模式发送到 `/api/calculate`，但 bridge 过去直接调用官方 `BuildOutput()`，静默忽略所有输入，导致界面变更后的伤害仍是导入时旧 Build 的结果。
- 修复：`real-calc-adapter.lua` 在 `BuildOutput()` 前仅通过官方已加载 Build 的字段与方法应用可验证输入：`characterLevel`/配置刷新、`PassiveSpec:ImportFromNodeList`、`ItemSlot:SetSelItemId`、`SkillsTab:ProcessSocketGroup`、主技能组和 `calcsTab.input.misc_buffMode`。同职业的 `className` 传 `nil` 给官方被动树导入，以保留现有升华；未知职业、无效节点、未由官方 Build 拥有的物品、替换/增删技能组与宝石都会返回结构化 `POB_CALC_INPUT_UNSUPPORTED`，不再以旧输出伪装成功。
- 回归：先以完整状态请求得到红灯，再加入官方 Build mock 验证等级、节点、装备、珠宝、宝石等级/品质和输出均在 `BuildOutput()` 前改变；另验证 web-only item 不会执行计算。最终 `node --test cn/tests/bridge/real-calc-adapter.spec.mjs` 为 `7/7` 通过。
- 构建：`npm.cmd run web:build` 通过。`npm.cmd run web:typecheck` 未通过，原因是脚本借助 `npx` 解析到 npm cache 中与 TypeScript `exports` 不兼容的 `vue-tsc`，并非本次 Lua 改动引发；按单次门禁规则未重跑或改动该独立工具链。
- 边界：此适配只支持对已经由官方 PoB 导入并持有的单一活动树/装备集/技能集做状态更新。新建或修改物品文本、替换技能、配置页选项、备注和多集合投影仍未实现，必须由后续专门的官方导入/映射合同处理。

### 2026-08-27 | M8-calculate-apply | 主代理真实验收

- 重启：仅重启新目录 `C:\\Users\\25147\\Documents\\pob-cn\\cn\\bridge\\service.mjs`；端口 `3002` 的 Node 进程和其 LuaJIT 子进程均从新目录启动，`/health` 返回 `ready:true`。Web 服务 `3000` 仍为新目录 Vite 进程；未读取、启动或修改旧目录。
- 真实样本：重新导入用户提供的 PoB 分享码后，以该导入投影分别对官方 bridge 发送原状态、单项变更状态和原状态恢复请求。分享码未写入仓库、文档或日志。
- 数值对照：等级 `97 -> 96` 改变了 60 个官方输出标量，Life `779 -> 772`；移除已分配节点 `64379` 后 86 个标量改变，`TotalDPS 642233.59 -> 626364.54`；卸下 `Weapon 1` 后 154 个标量改变，`TotalDPS 642233.59 -> 116731.44`；主技能组中的 `Comet 20 -> 19` 后，`TotalDPS 642233.59 -> 555032.31`，`AverageDamage 893106.09 -> 771841.81`。每项后均恢复原状态。
- 前端拒绝可见性：提交 `7b7afa2` 将 HTTP/bridge 拒绝、缺输出、无效 JSON 与网络错误收敛为 `lastCalculationError`；`SideStats` 显示“本次修改未进入官方 PoB 计算”和错误码，旧属性只在错误明确显示时保留，不再静默伪装成重算成功。该提交的单次 `npm.cmd run web:build` 通过。
- 主代理验收：已核对 `9879fc7` 与 `7b7afa2` 的变更范围、`git show --check` 和干净工作树；采纳执行代理的定向 7/7 Lua 回归与两次 Web 构建记录，未重跑无关门禁。
- 结论：导入后对同一活动树、装备集和技能集的等级、天赋、现有装备/珠宝、已有宝石等级/品质/启用和计算模式，现在会改变官方 PoB 输出。新建或改写物品文本、替换或增删宝石/技能组、配置页选项和多集合映射仍不属于已完成范围，界面会明确报错而非显示旧结果。

### 2026-08-27 | M8-web-import-localization | 已完成

- 范围：新增受控 Web 词典输出 `cn/generated/web-data/translations.json`，并只在 Web 的导入/持久化显示转换边界补全 `name_cn`、`base_cn`、`lines_cn` 和 gem `name_cn`；未改 bridge 计算逻辑，未读写旧项目。
- 词典与合同：生成器从已锁定的 `poe2.json.gz` 及两份 override 生成 24,169 条 `terms` JSON（2,269,427 bytes），M8 `web.translation` content contract、ownership、manifest 和输出 SHA-256 一并锁定。Web 运行时只静态导入该 generated JSON，不读取 gzip。
- 行为：英文 `name`、`nameSpec`、`base`、`rawLines`/`lines` 保留给官方 PoB 计算；展示字段优先精确查受控词典。PoB 运行时拼接出的数值词缀会只在其受控 subject term 命中时按通用语法翻译，例如 `60% increased Runic Ward` 显示为 `符文结界提高 60%`；无法确定的未知原文保持不变。
- 回归：`node --test cn/tests/web/import-localization.spec.mjs` 最终 1/1 通过，覆盖真实导入投影形状中的 `Svalinn -> 斯瓦林`、`Runemastered Crucible Tower Shield -> 符文师匠熔铸塔盾`、`Cast on Elemental Ailment -> 元素异常状态时施放`、动态装备词缀和未知原文保持。测试初始加载器两次未进入用例，原因是 workspace 的 TypeScript 解析路径错误；仅修正测试解析路径后得到上述单次通过结果。
- 构建：`npm.cmd run web:build` 退出码 0。未重跑 M5/M8 全套门禁。

### 2026-08-27 | M8 导入中文展示与抗性回归 | 已完成

- 词典：Web 导入与本地恢复统一从受控 `web.translation` 产物投影中文展示字段；英文 `name`、`base`、`rawLines` 和宝石标识仍保留为官方 PoB 计算输入。
- 抗性：官方输出 `FireResist`、`ColdResist`、`LightningResist`、`ChaosResist` 同步提供给既有 Web 面板字段，不再显示默认 `0%`。
- 真实页面验收：使用用户提供的本地分享码重新导入后，主技能显示“元素异常状态时施放”，装备显示“斯瓦林”及“符文师匠熔铸塔盾”，火/冰/雷/混沌抗性为 `68/74/67/32`；未读取、启动或修改旧目录。
- 体验修复：成功导入开始时清除上一轮计算拒绝状态，避免导入成功后仍显示旧的红色计算告警。
- 提交：`8fc9aaf`、`7862f9d`、`281785c`；未重跑无关 M3/M5 门禁。
