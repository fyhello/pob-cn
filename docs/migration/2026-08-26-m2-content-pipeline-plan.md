# PoB-CN M2 内容管线迁移实施计划

> **面向 AI 代理的工作者：** 必需子技能：使用 `subagent-driven-development` 或 `executing-plans` 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。每个实现任务只允许一个执行代理；主代理负责派发、验收、台账和合入，不直接实现产品代码。

**目标：** 将中文词典翻译迁移为一条可审计、可复现且不会污染上游的生成管线，并将外部 `ninja-poe2` 词典更新与 POB-CN 受控导入分离。M2-0 至 M2-2 只交付 `core.translation`；`manifest.json` 是该管线的元数据，不构成第二个业务内容域。M2-3 是后续独立的锻造内容阶段，只有在其自身开始后才建立锻造输入、合同和输出。

**架构：** M2-0 先完整物化 `upstream/dev` 并保存 canonical blob 证据，同时记录外部词典 artifact 的身份和导入兼容性要求。M2-1 冻结一个受控的 `ninja-poe2` gzip 词典副本与两份独立、人工审阅的 `zh-CN` 覆盖补丁；解压 JSON 的五个顶层域只用于导入载荷校验，不是五个输入文件。M2-2 用唯一 Node 入口生成 Lua 翻译和 partial manifest。每一步只能在锁验证后读取明确列出的输入；M2-2 只写 `core.translation` 的 Lua 输出和 manifest。锻造与 `cn/generated/web-data/**` 由 M2-3 首次建立的独立合同使用，M2-0 至 M2-2 不读取、不锁定、不预留该阶段的输入。任何前置门禁未通过都不得开始后续阶段。

**技术栈：** Node.js、JSON Schema、SHA-256、Lua、Path of Building PoE2、Git、PowerShell。

---

## 1. 范围、前提与禁止项

### 1.1 固定前提

- 新仓库根目录：`C:\Users\25147\Documents\pob-cn`；集成分支：`cn-main`。
- 上游锁定：`upstream/dev@5d173cbf8c9cf394a975cbb813f19d0b6dc67ea6`。后续版本更新必须走 M4 同步流程，不得在 M2 中变更该 SHA。
- 旧 POB-CN：`C:\Users\25147\Documents\AI-xiangmu\ninja-poe2\POB-cn`，在 M5 和用户书面确认前严格只读；它不是 M2 的词典输入，任何生成、测试或导入命令不得读取其绝对路径。
- 唯一基础词典来自外部、受控 `ninja-poe2` 工作区的 `data/poe2.json.gz`。当前已核定 artifact 位于 `C:\Users\25147\Documents\AI-xiangmu\ninja-poe2\data\poe2.json.gz`，gzip SHA-256 为 `2af6460f94ef0fc6ef9826e7ca8b06f485013b4828993e0480391b9138bcc779`、大小为 `2,558,745 bytes`、mtime 为 `2026-08-24 19:27:47`。该外部绝对路径只用于一次受审计导入，绝不是 POB-CN 运行时、构建或测试输入路径。
- M2-1 的输入锁必须且只能包含以下 3 个稳定 ID。两份 override 是 POB-CN 自有的人工补丁层：在受控路径创建、审阅并以各自 SHA-256 锁定；不得将旧 POB-CN 的同名文件或路径伪装为其来源。

| `id` | 受控路径 | 归属与固定身份 |
|---|---|---|
| `dictionary.ninja-poe2.poe2-runtime-gzip` | `cn/pipeline/sources/dictionary/ninja-poe2/poe2.json.gz` | 唯一基础词典；导入前后 SHA-256 必须为 `2af6460f94ef0fc6ef9826e7ca8b06f485013b4828993e0480391b9138bcc779` |
| `override.zh-CN.terms` | `cn/pipeline/overrides/zh-CN/terms.json` | 独立 `CN_SOURCE` 人工术语补丁；锁定其审阅后 SHA-256 |
| `override.zh-CN.glossary` | `cn/pipeline/overrides/zh-CN/glossary.json` | 独立 `CN_SOURCE` 人工词汇补丁；锁定其审阅后 SHA-256 |

- gzip 的解压载荷 SHA-256 必须为 `18f613924fe3a8092bc00194ff1082309484c454773f76566674db1feba4057a`，解压大小为 `12,205,433 bytes`。其唯一允许的顶层域及记录数为：`items=13609`、`stats=29358`、`tooltip=2592`、`ui=499`、`terms=24169`。这些是单一 gzip 的导入载荷校验，不是独立输入文件、source ID 或运行时 read set。

### 1.2 明确不迁移

- 不读取、不复制、不执行旧项目的 `tools/build_crafting_data.mjs`。该脚本扫描旧根级 `Data/*.lua`、依赖未跟踪 JSON 并会覆盖自身输出。
- 不将 `pob-nextgen/src/data/bases.json`、`pob-nextgen/src/data/affixes.json`、`pob-nextgen/src/data/craftingData.json`、`src/i18n/**` 或 `tools/dict-pipeline/upstream-builder/**` 作为生成输入。
- 不将 `poe1.json`、裸 `poe2.json`、`ninja-poe2` 的中间表或任何 `ninja-poe2` 绝对路径列为 POB-CN 输入。常规 build/test 不得调用 `ninja-poe2` 工具链，亦不得访问旧项目目录。
- POB-CN 只导入最终 `poe2.json.gz`，不得调用、封装或间接触发 `ninja-poe2` 的 Trade、发布或打包步骤。外部工作区生成 artifact 的过程与 POB-CN 构建严格隔离，任何外部副产物（例如 Trade 或 `dist`）不得导入仓库。
- 当前未纳入范围的 Web 数据不属于本 M2：不得出现于 M2-0/M2-1/M2-2 的合同、上游 read set、probe、golden/fixture、生成集、测试、生成器、验收或同步基线。未来只有经单独批准的明确阶段重新设计范围、锁定来源并完成验收后才可引入；本计划不保留预探测、预生成或隐式接入入口。
- 不默认生成 `zh-TW`。`tools/dict-pipeline/s2t.mjs` 不在 M2 范围；未来如要支持繁体，必须独立设计、测试和人工术语审校。

### 1.3 输出与归属边界

| 归属 | 路径 | 唯一写入者 | 人工编辑规则 |
|---|---|---|---|
| `UPSTREAM` | `src/**` | 上游同步流程 | M2 不直接修改 |
| `CN_SOURCE` | `cn/pipeline/**`、`cn/config/**`、`cn/tests/pipeline/**` | M2 实现分支 | 可修改，必须配套测试 |
| `GENERATED` | `cn/generated/lua-i18n/**` | `node cn/pipeline/generate-content.mjs` | 禁止人工编辑 |
| `GENERATED` | `cn/generated/web-data/**` | `node cn/pipeline/generate-content.mjs` | 仅在 M2-3 首次建立的锻造合同存在后才创建并写入；M2-0 至 M2-2 该路径必须不存在 |
| `GENERATED` | `cn/generated/manifest.json` | `node cn/pipeline/generate-content.mjs` | 禁止人工编辑 |

除受控词典导入事务外，任何生成、测试或同步命令对**业务仓库文件**的新增、修改或删除，如不在这 3 个 `GENERATED` 路径内，均为 M2 验收失败。唯一例外是 M2-1/M4 的 `source-lock.mjs` 导入器：它只可在成功提交时成组更新受控 gzip、`content-source-lock.json`、`version-lock.json` 的 dictionary 字段和本次词典兼容性报告；这 4 类路径必须在导入合同与 importer 测试中精确列出，绝不能由生成器或普通 build/test 写入。业务仓库文件定义为当前 M2 工作树中不在 `.git/**`、不命中 `pipeline-ownership.json.local_excludes`、且未被 Git ignore 的文件；`.git`、已声明 `LOCAL`（包括 `node_modules/**`）和系统临时目录仅可由其所属工具使用，均不得进入 Git 变更集、生成 manifest 或 M2 产物合同。这个例外仅解决受测导入事务、测试运行时和临时快照，不放宽任何可提交业务文件的写入范围。

## 2. 最终文件布局

```text
cn/
├─ config/
│  ├─ version-lock.json                 # 上游提交与冻结词典版本身份
│  ├─ upstream-content-snapshot.json    # 官方完整上游树的 blob OID、canonical 内容 hash 和物化验证
│  ├─ content-source-lock.json          # M2-1 的输入路径与 SHA-256
│  ├─ ownership.yml                     # M1/M4/M5 分层治理来源，M2 只读且不得重写
│  └─ pipeline-ownership.json           # M2 机器可解析的 GENERATED/LOCAL 投影合同
├─ pipeline/
│  ├─ generate-content.mjs              # 唯一生成入口
│  ├─ lib/
│  │  ├─ source-lock.mjs                 # 输入锁、hash 和受控导入验证
│  │  ├─ ownership.mjs                   # pipeline-ownership.json 的受测读取与输出边界验证
│  │  ├─ content-contract.mjs             # 产物合同和字段/覆盖规则验证
│  │  ├─ manifest-validator.mjs           # M2 唯一 manifest 完整性与消费门禁
│  │  └─ repository-snapshot.mjs          # 未忽略业务树快照、diff 和写入范围校验
│  ├─ sources/
│  │  ├─ dictionary/ninja-poe2/         # M2-1 受控导入的唯一 gzip 词典
│  ├─ overrides/zh-CN/                  # 人工翻译覆盖
│  └─ schemas/
│     ├─ content-source-lock.schema.json
│     ├─ content-contract.schema.json
│     ├─ manifest.schema.json
│     └─ ...                             # M2-3 才新增锻造 schema
├─ generated/
│  ├─ lua-i18n/                          # 仅生成器写入
│  ├─ web-data/                          # 仅 M2-3 首次创建并写入
│  └─ manifest.json                      # 仅生成器写入
└─ tests/pipeline/
   ├─ source-lock.spec.mjs
   ├─ ownership.spec.mjs
   ├─ repository-snapshot.spec.mjs
   ├─ content-contract.spec.mjs
   ├─ generate-content.spec.mjs
   └─ fixtures/
docs/architecture/
└─ content-source-probe.md               # M2-0 的外部 gzip 身份、schema 与导入兼容性证据
```

## 3. 状态机和推进规则

| 阶段 | 状态 | 允许开始的前提 | 阻断后续阶段的条件 |
|---|---|---|---|
| M2-0 | 待开始 | M1 已验收 | 上游仍为 sparse/partial 不完整工作树，或无法给出版本来源 |
| M2-1 | 待开始 | M2-0 已验收 | 任一冻结输入 hash 不匹配、路径不受控、无输入锁 |
| M2-2 | 待开始 | M2-1 已验收 | 没有唯一入口、写入越界、输出不可复现、manifest 无完整 provenance |
| M2-3 | 待开始 | M2-2 已验收 | 锻造 seed 来自旧未跟踪 JSON、schema 不完整或人工审阅未记录 |
| M2 | 待开始 | 仅当 M2-0 至 M2-3 均完成并分别验收，且 A4-0、A4-1、A4-2、A4-3 均通过后，主代理才可将 M2 标记为“已验收” | A4-0、A4-1、A4-2 或 A4-3 任何一项未通过 |

当前 M2 及其四个子阶段均为“待开始”；M2-0 至 M2-3 的验收不能用计划文字、局部测试或某一子阶段结果替代。阶段执行代理提交后，主代理必须按顺序派发规格审查和代码质量审查。任一审查提出 `P0`、`P1` 或 `P2`，执行代理修复并重新审查；不得跳过到下一阶段。

## 4. 任务 M2-0：完整物化上游与锁定内容来源

**文件：**
- 修改：`cn/config/version-lock.json`
- 创建：`cn/config/upstream-content-snapshot.json`
- 创建：`docs/architecture/content-source-probe.md`
- 创建：`docs/architecture/m2-0-business-tree-baseline.json`

**禁止修改：** `cn/pipeline/**`、`cn/generated/**`、`src/**`、旧项目。

- [ ] **步骤 1：确认异常工作树未被干预。**

  运行：

  ```powershell
  Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -match 'm2-governance|sparse-checkout' } |
    Select-Object ProcessId, Name, CommandLine
  Test-Path C:\Users\25147\Documents\pob-cn\.git\worktrees\m2-governance\info\sparse-checkout.lock
  ```

  预期：如锁和对应 Git 进程仍存在，只记录其状态；不终止进程、不删除锁、不复用 `m2-governance` 工作树。

- [ ] **步骤 2：创建新的隔离物化工作树。**

  运行：

  ```powershell
  $repo = 'C:\Users\25147\Documents\pob-cn'
  $root = 'C:\Users\25147\Documents\pob-cn\.worktrees\m2-source-materialize'
  $branch = 'codex/m2-source-materialize'
  if (Test-Path -LiteralPath $root) { throw "M2-0 worktree path already exists: $root; choose a new unique path and branch, do not reuse or clean it" }
  $existingBranch = @(& git -C $repo branch --list --format='%(refname:short)' $branch)
  if ($LASTEXITCODE -ne 0) { throw "cannot inspect existing branch: $LASTEXITCODE" }
  if ($existingBranch.Count -ne 0) { throw "M2-0 branch already exists: $branch; choose a new unique path and branch" }
  $existingWorktrees = @(& git -C $repo worktree list --porcelain)
  if ($LASTEXITCODE -ne 0) { throw "cannot inspect existing worktrees: $LASTEXITCODE" }
  if ($existingWorktrees -match [regex]::Escape($root)) { throw "M2-0 worktree is already registered: $root; choose a new unique path and branch" }
  & git -C $repo worktree add $root -b codex/m2-source-materialize cn-main
  if ($LASTEXITCODE -ne 0) { throw "worktree add failed: $LASTEXITCODE" }
  & git -C $root config core.autocrlf false
  if ($LASTEXITCODE -ne 0) { throw "cannot force worktree core.autocrlf=false: $LASTEXITCODE" }
  & git -C $root sparse-checkout disable
  if ($LASTEXITCODE -ne 0) { throw "sparse-checkout disable failed: $LASTEXITCODE" }
  $head = (& git -C $root rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0) { throw "cannot resolve worktree HEAD: $LASTEXITCODE" }
  $sourceHead = (& git -C $root rev-parse upstream/dev).Trim()
  if ($LASTEXITCODE -ne 0) { throw "cannot resolve upstream/dev: $LASTEXITCODE" }
  $locked = (Get-Content -Raw (Join-Path $root 'cn/config/version-lock.json') | ConvertFrom-Json).upstream.commit
  if ($sourceHead -ne $locked) { throw "upstream/dev source HEAD does not match version lock: $sourceHead != $locked" }
  & git -C $root merge-base --is-ancestor $sourceHead $head
  if ($LASTEXITCODE -ne 0) { throw 'cn-main does not contain the locked upstream commit' }
  $sparseConfig = (& git -C $root config --bool --get --default false core.sparseCheckout)
  if ($LASTEXITCODE -ne 0) { throw "cannot inspect sparse-checkout state: $LASTEXITCODE" }
  if ($sparseConfig.Trim().ToLowerInvariant() -eq 'true') { throw 'Sparse checkout remains enabled' }
  ```

  必须先完成上述只读 path、branch 与 `git worktree list --porcelain` 检查；任一目标已经存在就 fail-fast，记录阻断并要求主代理提供新的唯一名称，不得清理、复用、自动改名或触碰 `m2-governance`。`git worktree add` 是目标 `$root` 尚不存在时唯一以 `$repo` 执行的写 Git 命令；从该工作树创建成功起，后续所有 Git 调用一律为 `git -C $root ...`，所有文件读写一律为 `Join-Path $root ...`。每条外部 Git 命令后的紧邻 `$LASTEXITCODE` 检查是验收项，不得省略。

  预期：物化工作树存在、其 `HEAD` 包含锁定官方提交，且作为数据源身份的 `upstream/dev` HEAD 与 `version-lock.json` 中 SHA 完全相同；`core.sparseCheckout` 必须为 false 或未设置，`core.autocrlf` 必须为 false。若物化需要 promisor fetch，保留完整命令与退出码；网络或对象错误必须标为阻断，不得伪造完整状态。

  **说明：** 工作树 `HEAD` 可以包含已验收的 M1/bootstrap 与治理提交，不能要求它字节等于上游提交；必须严格相等的是 `upstream/dev` 的 source HEAD 与版本锁 SHA，且该 commit 必须是工作树 `HEAD` 的祖先。

- [ ] **步骤 3：验证完整数据源可读取。**

  运行：

  ```powershell
  $root = 'C:\Users\25147\Documents\pob-cn\.worktrees\m2-source-materialize'
  $sourceHead = (& git -C $root rev-parse upstream/dev).Trim()
  if ($LASTEXITCODE -ne 0) { throw "cannot resolve upstream/dev for source snapshot: $LASTEXITCODE" }
  $locked = (Get-Content -Raw (Join-Path $root 'cn/config/version-lock.json') | ConvertFrom-Json).upstream.commit
  if ($sourceHead -ne $locked) { throw "upstream/dev source HEAD does not match version lock: $sourceHead != $locked" }
  $autoCrlf = (& git -C $root config --bool --get --default false core.autocrlf)
  if ($LASTEXITCODE -ne 0) { throw "cannot inspect core.autocrlf: $LASTEXITCODE" }
  if ($autoCrlf.Trim().ToLowerInvariant() -ne 'false') { throw 'core.autocrlf must be false before collecting worktree blob identity and raw diagnostic hashes' }
  function Get-UpstreamBlobSha256 {
    param([string]$BlobOid)
    $tempBlob = Join-Path $root (".m2-upstream-blob-$BlobOid.tmp")
    try {
      & git -C $root cat-file blob $BlobOid 1> $tempBlob
      if ($LASTEXITCODE -ne 0) { throw "cannot materialize upstream blob $BlobOid: $LASTEXITCODE" }
      (Get-FileHash -LiteralPath $tempBlob -Algorithm SHA256).Hash.ToLowerInvariant()
    } finally {
      if (Test-Path -LiteralPath $tempBlob) { Remove-Item -LiteralPath $tempBlob -Force }
    }
  }

  $treeLines = @(& git -C $root ls-tree -r upstream/dev)
  if ($LASTEXITCODE -ne 0) { throw "cannot enumerate complete upstream tree: $LASTEXITCODE" }
  if ($treeLines.Count -eq 0) { throw 'upstream tree is empty' }
  $approvedAdapterBase = '6c41a9820446c9cf21afacfb10be090209fe00cf'
  $approvedAdapterCommit = '2e51240d53e125ceada776490bb4dd3f1d5b4c40'
  $approvedAdapterPatch = @(& git -C $root diff --no-ext-diff --binary $approvedAdapterBase $approvedAdapterCommit -- src/Modules/Main.lua)
  if ($LASTEXITCODE -ne 0) { throw "cannot read approved M1 adapter hunk: $LASTEXITCODE" }
  $currentAdapterPatch = @(& git -C $root diff --no-ext-diff --binary upstream/dev -- src/Modules/Main.lua)
  if ($LASTEXITCODE -ne 0) { throw "cannot compare current adapter hunk: $LASTEXITCODE" }
  if (($currentAdapterPatch -join "`n") -ne ($approvedAdapterPatch -join "`n")) {
    throw 'src/Modules/Main.lua differs from upstream by more or less than the approved M1 adapter hunk'
  }
  $approvedBootstrapIgnoreCommit = 'f88291dd5444958745a82241a4536c05dc31b789'
  $approvedBootstrapIgnorePatch = @(& git -C $root diff --no-ext-diff --binary upstream/dev $approvedBootstrapIgnoreCommit -- .gitignore)
  if ($LASTEXITCODE -ne 0) { throw "cannot read approved M1 .gitignore hunk: $LASTEXITCODE" }
  $currentBootstrapIgnorePatch = @(& git -C $root diff --no-ext-diff --binary upstream/dev -- .gitignore)
  if ($LASTEXITCODE -ne 0) { throw "cannot compare current .gitignore hunk: $LASTEXITCODE" }
  if (($currentBootstrapIgnorePatch -join "`n") -ne ($approvedBootstrapIgnorePatch -join "`n")) {
    throw '.gitignore differs from upstream by more or less than the approved M1 bootstrap hunk'
  }

  $snapshot = foreach ($line in $treeLines) {
    $parts = $line -split "`t", 2
    $metadata = $parts[0] -split ' '
    if ($parts.Count -ne 2 -or $metadata.Count -ne 3 -or $metadata[1] -ne 'blob') {
      throw "unexpected ls-tree record: $line"
    }
    $path = $parts[1].Replace('\', '/')
    $blobOid = $metadata[2]
    $fullPath = Join-Path $root $path
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
      throw "Missing materialized upstream file: $path"
    }
    $upstreamSha256 = Get-UpstreamBlobSha256 $blobOid
    $worktreeBlobOid = (& git -C $root hash-object --path=$path -- $fullPath).Trim()
    if ($LASTEXITCODE -ne 0) { throw "cannot hash materialized file $path: $LASTEXITCODE" }
    $worktreeRawSha256 = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $isAdapter = $path -eq 'src/Modules/Main.lua'
    $isBootstrapIgnore = $path -eq '.gitignore'
    if (-not $isAdapter -and -not $isBootstrapIgnore -and $worktreeBlobOid -ne $blobOid) {
      throw "materialized file does not match upstream blob: $path"
    }
    [ordered]@{
      path = $path
      upstream_blob_oid = $blobOid
      upstream_content_sha256 = $upstreamSha256
      worktree_blob_oid = $worktreeBlobOid
      worktree_raw_sha256_diagnostic = $worktreeRawSha256
      materialization = if ($isAdapter) { 'm1_adapter_hunk_verified' } elseif ($isBootstrapIgnore) { 'm1_bootstrap_hunk_verified' } else { 'upstream_blob_verified' }
      direct_generator_input = $false
    }
  }
  $snapshotJson = $snapshot | ConvertTo-Json -Compress -Depth 5
  $treeHash = [Convert]::ToHexString(
    [Security.Cryptography.SHA256]::HashData([System.Text.Encoding]::UTF8.GetBytes($snapshotJson))
  ).ToLowerInvariant()
  $snapshotPath = Join-Path $root 'cn/config/upstream-content-snapshot.json'
  $snapshotDocument = [ordered]@{
    schema_version = 1
    upstream_commit = $sourceHead
    file_count = $snapshot.Count
    source_tree_sha256 = $treeHash
    files = $snapshot
  } | ConvertTo-Json -Depth 8
  [System.IO.File]::WriteAllText($snapshotPath, $snapshotDocument + "`n", [System.Text.UTF8Encoding]::new($false))
  ```

  预期：`git ls-tree -r upstream/dev` 枚举的每个上游文件均实际落盘，而非只验证 `src/**`；除 `src/Modules/Main.lua` 与根 `.gitignore` 外，每个工作树文件均在 `core.autocrlf=false` 条件下以 Git path filter 计算为对应官方 blob OID。`.gitignore` 只能是 M1 提交 `f88291dd5444958745a82241a4536c05dc31b789` 相对 `upstream/dev` 的精确 bootstrap hunk，不能成为任意本地忽略规则的豁免。官方 `git cat-file blob` 的 SHA-256 是唯一 canonical 上游内容证据；工作树原始 SHA-256 只作物化诊断记录，绝不称为官方内容匹配。快照逐文件记录仓库相对路径、官方 blob OID、canonical 官方内容 SHA-256、工作树 blob OID、诊断 raw SHA 与物化状态，并记录官方 commit、文件总数和确定性 source tree hash。`Main.lua` 与 `.gitignore` 必须分别以 approved M1 adapter/bootstrap hunk 例外记录，且所有快照项的 `direct_generator_input` 均为 false；它们永远不是生成器输入。

  在写入 M2-0 产物前，使用与后续 `snapshotBusinessTree(repoRoot, ownership)` 相同的定义保存 `docs/architecture/m2-0-business-tree-baseline.json`：它是采集时刻 `.git/**` 之外的完整未忽略业务树基线，逐项记录 POSIX 相对路径、SHA-256 或缺失状态，以及 `tracked`、`added`、`modified`、`deleted`、`untracked` 五类状态。它必须覆盖新增、修改、删除和未跟踪候选，排除 Git ignored、`LOCAL`、系统临时目录；不得只扫描 `cn/generated/**`。该基线是采集前状态证据，不以其后创建的 M2-0 产物回填或改写。

  `content-source-probe.md` 至少须记录唯一 gzip artifact 的 source ID、外部构建记录、gzip/解压 JSON SHA-256、大小、mtime、schema 身份、5 个载荷域计数和导入兼容性结论；两份 `zh-CN` override 只记录为待 M2-1 创建并哈希锁定的独立 `CN_SOURCE` 补丁。缺失任一外部 artifact 证据即失败；不能以 `git cat-file` 成功替代完整工作树物化。

- [ ] **步骤 4：探测并锁定版本来源。**

  `content-source-probe.md` 必须逐项列出 `dictionary.ninja-poe2.poe2-runtime-gzip` 的外部 artifact 身份、读取文件或构建记录定位与 SHA-256，并记录两份人工 override 将在 M2-1 以独立锁定补丁引入。`version-lock.json.content_versions.dictionary` 不得保留 `UNPROBED`。

  `ninja-poe2` 不是 Git 仓库，不得虚构 commit、remote 或 Git OID。其版本身份只能来自 gzip/解压 JSON hash、外部客户端版本、构建记录、工具文件 hash 和 schema 身份；没有显式语义版本时，状态应为 `HASH_IDENTIFIED`，同时记录 hash。M2 不探测、锁定或记录游戏版本、天赋树版本，亦不得为被排除的 Web 数据建立来源入口。

- [ ] **步骤 5：验证并提交。**

  运行：

  ```powershell
  $root = 'C:\Users\25147\Documents\pob-cn\.worktrees\m2-source-materialize'
  & git -C $root diff --check
  if ($LASTEXITCODE -ne 0) { throw "diff check failed: $LASTEXITCODE" }
  $changed = @(& git -C $root status --porcelain)
  if ($LASTEXITCODE -ne 0) { throw "cannot read worktree status: $LASTEXITCODE" }
  $changed = @($changed | ForEach-Object { $_.Substring(3).Replace('\', '/') })
  $allowed = @(
    'cn/config/version-lock.json',
    'cn/config/upstream-content-snapshot.json',
    'docs/architecture/content-source-probe.md',
    'docs/architecture/m2-0-business-tree-baseline.json'
  )
  $unexpected = $changed | Where-Object { $_ -notin $allowed }
  if ($unexpected) { throw "Unexpected M2-0 paths: $($unexpected -join ', ')" }
  ```

  预期：完整工作树状态中只出现本任务 **4 个**允许路径；`git diff --check` 退出码为 0。提交主题：`docs(content): 物化并锁定 M2 内容来源`。

**M2-0 验收：** 主代理在同一完整工作树复现 `git ls-tree -r upstream/dev` 的全量物化、逐文件 blob OID/canonical 内容 hash/工作树 blob OID/raw 诊断 hash/物化状态验证、`core.autocrlf=false` 前置检查、`Main.lua` 与 `.gitignore` 的精确 approved M1 hunk 比对，以及唯一外部 gzip artifact 的身份、schema 与 5 域载荷计数采集；同时复核 M2-0 保存的完整未忽略业务树基线覆盖新增、修改、删除和未跟踪候选。规格审查确认没有把输出、词典或上游源偷偷写入 M2-0；质量审查确认词典版本身份可追溯而非猜测。通过后才可派发 M2-1。

## 5. 任务 M2-1：冻结输入、输入锁和归属检查

**文件：**
- 修改：`cn/config/version-lock.json`
- 创建：`cn/config/content-source-lock.json`
- 创建：`cn/config/content-contract.json`
- 创建：`cn/config/pipeline-ownership.json`
- 创建：`cn/pipeline/schemas/content-source-lock.schema.json`
- 创建：`cn/pipeline/schemas/content-contract.schema.json`
- 创建：`cn/pipeline/lib/source-lock.mjs`
- 创建：`cn/pipeline/lib/ownership.mjs`
- 创建：`cn/pipeline/lib/content-contract.mjs`
- 创建：`cn/pipeline/lib/repository-snapshot.mjs`
- 创建：`cn/pipeline/sources/dictionary/ninja-poe2/poe2.json.gz`
- 创建：`cn/pipeline/overrides/zh-CN/glossary.json`
- 创建：`cn/pipeline/overrides/zh-CN/terms.json`
- 创建：`docs/architecture/compatibility/dictionary/<gzip-sha256>.md`
- 创建：`cn/tests/pipeline/source-lock.spec.mjs`
- 创建：`cn/tests/pipeline/ownership.spec.mjs`
- 创建：`cn/tests/pipeline/repository-snapshot.spec.mjs`
- 创建：`cn/tests/pipeline/content-contract.spec.mjs`

**依赖与治理决策：** M2-1 不新增 `yaml`、`ajv` 或其他 npm 依赖，因而不修改 `package.json` 或 `package-lock.json`。M2 **不得修改、缩减解析或拒绝**已验收的 `cn/config/ownership.yml`；它仍是 M1/M4/M5 的完整分层治理来源，含 `UPSTREAM`、`ADAPTER`、`CN_SOURCE`、`GENERATED`、`LOCAL`、adapter whitelist 和 producer 规则。M2 新建受版本控制的 `cn/config/pipeline-ownership.json` 作为机器可解析的窄投影，字段固定为 `schema_version`、`ownership_yml_path`、`ownership_yml_sha256`、`generated_rules` 与 `local_excludes`。其中 `generated_rules` 必须逐项投影现有 `ownership.yml.generated_output_producers` 的 output/producer，`local_excludes` 必须逐项投影现有 LOCAL paths 并补充临时 snapshot 文件模式；M2-2 只消费 `cn/generated/lua-i18n/**` 和 `cn/generated/manifest.json` 两条规则，`cn/generated/web-data/**` 不得被 M2-0 至 M2-2 读取或写入。测试在 M2-1 生成时由人工复算 YAML SHA-256 和投影值，不允许 `ownership.mjs` 自行解析或重写 YAML。两个 JSON Schema 文件是受版本控制的合同；`source-lock.mjs`、`ownership.mjs`、`content-contract.mjs` 和 `repository-snapshot.mjs` 用 Node 标准库解析 JSON 并逐字段验证，测试必须同时读取 schema/合同与验证库，禁止在 fixture 中另写一套规则。M2-1 建立的 `stage: "M2-2"` 选择集与合同只含 `dictionary.ninja-poe2.poe2-runtime-gzip`、`override.zh-CN.terms`、`override.zh-CN.glossary` 和 `core.translation`，不得预留 crafting、Web、游戏或天赋树业务项及输入；M2-3 新输入只能在该阶段自己的原子合同变更中以 `stage: "M2-3"` 另行登记。

- [ ] **步骤 1：写失败的输入锁、归属和产物合同测试。**

  `source-lock.spec.mjs` 以临时仓库目录构造 `content-source-lock.json`、`upstream-content-snapshot.json` 和 `version-lock.json`。它必须拒绝：未登记输入、SHA-256 不匹配、绝对路径、`../` 路径逃逸、Windows 驱动器路径、落在 `cn/generated/` 的输入、重复路径、缺少完整 upstream snapshot、snapshot commit/OID/canonical 内容 hash 与 `version-lock.json` 不一致、在 `{ stage: 'M2-2' }` 选择集中出现非 3 个固定 ID、裸 JSON、旧项目或 `ninja-poe2` 绝对路径、以及任何上游读取条目。唯一 gzip 输入、两份独立 override 与完整物化快照的完整性引用必须通过；M2-1 不登记可读上游文件。测试还必须证明，在后续合法存在 `stage: 'M2-3'` crafting 条目的锁中，`loadLockedInputs(repoRoot, { stage: 'M2-2' })` 永不返回或读取任一 crafting 输入。该测试还必须对唯一 importer 注入候选写入、校验和目标替换失败：失败后受控 gzip、`content-source-lock.json`、`version-lock.json` dictionary 字段和兼容性报告的路径集合与逐文件 SHA-256 必须与导入前完全一致。

  `ownership.spec.mjs` 必须单独验证 `ownership.mjs` 对 `pipeline-ownership.json` 的读取：真实 `ownership_yml_path`、SHA-256、三条 `generated_rules`、writer 和 `local_excludes` 均精确通过；拒绝 YAML path/hash 不一致、漏投影/多投影 GENERATED 规则、错误 producer、绝对路径、规则重叠、CN_SOURCE 输入被标为 GENERATED，或将 `.git`/已忽略/LOCAL 路径伪装为业务文件。测试不能要求、解析、重写或拒绝 `ownership.yml` 的 YAML 语法。

  `repository-snapshot.spec.mjs` 必须用同一 `snapshotBusinessTree(repoRoot, ownership)` helper 建立 `.git` 外的完整**未忽略业务仓库树**快照：包括 tracked、untracked、新增、修改和删除候选，排除 `.git/**`、Git ignored、`pipeline-ownership.json.local_excludes` 和系统临时目录。它必须输出相对路径、SHA-256/缺失状态和差异类型，并且分别制造 GENERATED 外新增、修改、删除、未跟踪，以及 `node_modules`/临时文件；前四种必须被 `assertGeneratedOnlyBusinessChanges(changeSet, ownership, contract, { stage: 'M2-2' })` 拒绝，后两种必须被快照排除。该 helper 是 M2-2 和 A4-2 的唯一实现，不允许另写只扫 `cn/generated` 的比较逻辑。

  `content-contract.spec.mjs` 必须先用不合格合同证明失败，再验证每一个产物条目都拥有且仅拥有以下公共字段：`id`、`path`、`stage`、`consumer_id`、`consumer_target`、`consumer_owner`、`field_mapping`、`input_schema`、`output_schema`、`minimum_record_count`、`id_coverage_rule` 与 `source_ids`。M2-2 合同必须且只能有 `core.translation` 这一个业务条目；它的 `source_ids` 必须精确等于 3 个固定输入 ID。测试必须拒绝重复输出、生成器未声明的输出、consumer ID/target/owner 为空或路径不合法、任何非 `core.translation` 的 M2-2 业务条目、来源 ID 不在 source lock、空 hash、负数/零最小记录数、未定义 schema，以及无法以 source lock 的锁定输入重复计算的覆盖规则。M2-1 只验证 consumer 的 ID、目标路径格式和 M3 owner，不要求未来 M3 consumer 文件存在或导入 manifest validator。

  ```javascript
  test('rejects an input path that escapes the repository root', () => {
    const lock = validLock({ path: '../legacy/poe2.json.gz' });
    assert.throws(() => validateSourceLock(lock, repoRoot), /repository-relative/);
  });

  test('rejects a non-dictionary source record in the M2-2 selection', () => {
    const lock = validLock({ id: 'unexpected.source', stage: 'M2-2' });
    assert.throws(() => validateSourceLock(lock, repoRoot), /M2-2.*three fixed input ids/);
  });

  test('rejects a contract output whose source input is not locked', () => {
    const contract = validContract({ source_ids: ['dictionary.ninja-poe2.poe2-runtime-gzip', 'unlocked.input'] });
    assert.throws(() => validateContentContract(contract, sourceLock, { stage: 'M2-2' }), /unlocked input id/);
  });
  ```

- [ ] **步骤 2：运行红灯测试。**

  运行：

  ```powershell
  $root = 'C:\Users\25147\Documents\pob-cn\.worktrees\m2-source-materialize'
  Push-Location $root
  try {
    foreach ($testPath in @(
      'cn/tests/pipeline/source-lock.spec.mjs',
      'cn/tests/pipeline/ownership.spec.mjs',
      'cn/tests/pipeline/repository-snapshot.spec.mjs',
      'cn/tests/pipeline/content-contract.spec.mjs'
    )) {
      node --test $testPath
      if ($LASTEXITCODE -eq 0) { throw "expected red test failure before implementation: $testPath" }
    }
  } finally {
    Pop-Location
  }
  ```

  预期：在验证器尚未实现时，测试因缺少 `validateSourceLock`、`assertGeneratedOnlyBusinessChanges`、`snapshotBusinessTree` 或 `validateContentContract` 等受测 API 失败；不得因为测试 fixture 自身错误而失败。

- [ ] **步骤 3：受控导入并冻结 3 个审计输入。**

  M2-1 不复制、解压或读取旧 POB-CN。唯一受测 importer 接收外部 `ninja-poe2` 的最终 gzip 后，必须先在仓库外临时目录完整写出候选 gzip、候选 `content-source-lock.json`、候选 `version-lock.json` dictionary 字段和候选兼容性报告；在临时目录完成 gzip hash/大小、gunzip、JSON 可解析性、已锁 schema、解压 JSON hash/大小与 5 域记录数校验。所有候选文件和其 hash 均验证通过后，才以可回滚事务替换 `cn/pipeline/sources/dictionary/ninja-poe2/poe2.json.gz` 并成组安装候选 lock/report。任何校验、候选写入或提交阶段失败，都必须恢复导入前的受控 gzip、两个锁文件字段和报告路径集合，且不得留下半导入状态；测试以故障注入逐项证明该不变式。人工创建并审阅 `terms.json` 与 `glossary.json` 后，各自计算 SHA-256；不得以旧项目同名 JSON、未审阅缓存或生成文件代替补丁层。

  锁文件必须以如下不可变 ID 登记这 3 项，测试逐项比较，不得仅比较条目数：

  | `id` | `path` | `sha256` |
  |---|---|---|
  | `dictionary.ninja-poe2.poe2-runtime-gzip` | `cn/pipeline/sources/dictionary/ninja-poe2/poe2.json.gz` | `2af6460f94ef0fc6ef9826e7ca8b06f485013b4828993e0480391b9138bcc779` |
  | `override.zh-CN.terms` | `cn/pipeline/overrides/zh-CN/terms.json` | 审阅后实测 SHA-256 |
  | `override.zh-CN.glossary` | `cn/pipeline/overrides/zh-CN/glossary.json` | 审阅后实测 SHA-256 |

  `version-lock.json.content_versions.dictionary` 必须保存唯一 gzip 的 source ID、artifact 和载荷 hash；M2-1 的测试必须同时读取该字段和 `content-source-lock.json`，逐 ID 断言完全一致。人工 override 的 hash 只能从其受控路径实测得出。任何使用 `UNPROBED`、只保存一个汇总 hash、猜测版本字符串、复用裸 JSON，或未记录 schema 身份的实现均失败。

- [ ] **步骤 4：实现 schema、锁文件和归属校验。**

  新建 `cn/pipeline/lib/source-lock.mjs`，导出受测的 `validateSourceLock(lock, repoRoot)`、`loadLockedInputs(repoRoot, { stage })`、`assertLockedInputPath(lock, relativePath)` 与唯一导入入口 `importNinjaPoe2Dictionary({ repoRoot, artifactPath, externalEvidence })`。`{ stage }` 为必填且无默认值；每个锁条目必须带有 stage，`loadLockedInputs` 只返回该 stage 合同声明的输入并拒绝其他 stage 的条目。它必须在文件打开前用仓库相对 POSIX 路径验证输入，拒绝绝对路径、盘符、反斜杠归一化后的逃逸、`..`、符号链接逃逸、未登记路径、hash 不一致、`cn/generated/**`、裸 `poe2.json`、`poe1.json`、旧 POB-CN 路径和 `ninja-poe2` 外部路径。`importNinjaPoe2Dictionary(...)` 只从显式传入的 artifact 临时副本读取，并按步骤 3 的候选、校验、可回滚提交合同工作；它是唯一允许更新 gzip、dictionary lock 字段和 `docs/architecture/compatibility/dictionary/<gzip-sha256>.md` 的代码路径。`loadLockedInputs(repoRoot, { stage })` 必须先验证版本锁、完整 upstream snapshot 的 lineage 证据、受控 gzip 的导入报告以及 source lock 的 hash 关系，再返回只读输入描述；生成器只能从该返回值取得文件路径，且其中不得出现上游源码或外部工作区读取项。M2-2 调用只能传入 `stage: 'M2-2'`，测试必须证明它永不能读取 M2-3 crafting 输入。

  新建 `cn/pipeline/lib/ownership.mjs`，导出 `loadPipelineOwnership(repoRoot)`、`assertGeneratedPath(relativePath, ownership)` 与 `assertGeneratedOnlyBusinessChanges(changeSet, ownership, contract, { stage })`。它只读取 `pipeline-ownership.json` 并验证该 JSON 对 `ownership.yml` 的 path/hash/GENERATED producer/LOCAL 投影；不得解析、改写或拒绝 `ownership.yml`。`assertGeneratedPath()` 只接受合同中声明、且唯一命中 GENERATED 投影规则的目标；writer 必须精确等于 `node cn/pipeline/generate-content.mjs`。零条或多条规则命中均必须失败。`assertGeneratedOnlyBusinessChanges()` 的 `{ stage }` 为必填且无默认值，只允许该阶段合同声明的 GENERATED 输出；M2-2 只允许 `core.translation` 的 `cn/generated/lua-i18n/translations.lua` 和 `cn/generated/manifest.json`。任何业务仓库文件的 GENERATED 外写入、未被合同声明的 GENERATED 文件，或其他阶段的合同输出均必须失败；`.git`、ignored、`local_excludes` 和系统临时文件不属于业务变更集。

  新建 `cn/pipeline/lib/repository-snapshot.mjs`，导出 `snapshotBusinessTree(repoRoot, ownership)`、`diffBusinessSnapshots(before, after)` 和 `formatBusinessSnapshotDiff(diff)`。它是唯一可用于测试和 shell 验收的全树 helper：递归扫描 `.git` 外完整树，依据 Git ignore 与 `local_excludes` 排除非业务路径，保留未跟踪路径，并为每条业务路径记录 POSIX 相对路径及 SHA-256/缺失状态；diff 必须对新增、修改、删除和未跟踪路径分类，`formatBusinessSnapshotDiff()` 对空 diff 返回空字符串，对非空 diff 输出每个路径、变更类型和前后 hash。禁止 M2-2 再用 `Get-ChildItem cn/generated` 代替它。

  新建 `cn/pipeline/lib/content-contract.mjs`，导出 `validateContentContract(contract, sourceLock, { stage })`、`loadContentContract(repoRoot, { stage })` 与 `validateGeneratedOutput(output, contract, lockedInputs, { stage })`。`{ stage }` 对三者均为必填且无默认值；它们必须拒绝任何未选定阶段的产物，不能以完整合同或“所有 GENERATED”放行调用。`content-contract.json` 和 `content-contract.schema.json` 必须为每项产物固定以下公共字段：`id`、`path`、`stage`、`consumer_id`、`consumer_target`、`consumer_owner`、`field_mapping`、`input_schema`、`output_schema`、`minimum_record_count`、`id_coverage_rule` 与 `source_ids`。M2-1 只能定义 `core.translation`，其 `stage` 固定为 `M2-2`，`source_ids` 必须精确等于 3 个冻结输入 ID。测试必须以 `{ stage: 'M2-2' }` 验证合同选择，并证明只有 `core.translation` 可以被加载、生成和写入。每项 `minimum_record_count` 必须是从锁定输入实际记录数可重复算出的正整数，`id_coverage_rule` 必须写明精确集合相等、源 ID 覆盖比例或显式 allowlist；禁止填 `0`、通配符或自由文本规则。`bases.json` 既不得作 fixture，也不得作输入。

  `content-source-lock.json` 的每个词典/覆盖条目至少含 `id`、`kind`、`stage`、`path`、`sha256`、`format`、`language` 和 `provenance`。M2-1 创建的 3 个词典/覆盖条目 stage 固定为 `M2-2`，它们严格构成 `core.translation` 的输入选择集；M2-3 新增条目必须 stage 固定为 `M2-3`，不得改变 M2-2 选择集。唯一 gzip 条目还必须包含 gzip/解压 JSON hash、大小、mtime、schema 身份和 5 域记录数；它必须引用完整 `upstream_snapshot`（`path`、`sha256`、`upstream_commit`、`source_tree_sha256`、`file_count`）作为 PoB lineage 证据，但不得登记任何上游读取路径。合同条目不得以“待定”“由生成器决定”或自由描述代替字段映射。实施代理必须将以下逐项映射写成 JSON 可枚举对象，并在 `content-contract.spec.mjs` 对每个键、consumer 三字段、3 个 `source_ids`、schema、最小记录数和 coverage 规则做深度相等断言：

  | 合同 `id` | 输出 | `consumer_id` | `consumer_target` | `consumer_owner` | 必须固定的 `field_mapping` 与来源 |
  |---|---|---|---|---|---|
  | `core.translation` | `cn/generated/lua-i18n/translations.lua` | `lua-i18n.loader` | `cn/lua/i18n/loader.lua` | `M3` | `translation_id -> Lua table key`、`zh_CN -> Lua table value`；`source_ids` 精确为 gzip + `terms` + `glossary` 这 3 个输入 ID，覆盖规则为锁定翻译 ID 集合加 allowlist |

  上表中的 consumer 路径是 M3 必须创建的目标契约，不代表 M2 可提前创建或加载 consumer；未来 consumer 文件是否存在、是否导入 validator，均只在 M3 验证。未知 source 或错误 schema 应使 M2-1 的合同验证失败。

  `src/Modules/Main.lua` 被明确排除，不能登记为生成器 input。M2-2 不得临时扩大输入范围。

  `version-lock.json` 中 dictionary artifact/载荷版本来源必须与 `content-source-lock.json` 中唯一 gzip 条目一致。路径一律使用 `/` 分隔的仓库相对路径。`pipeline-ownership.json` 必须以 `ownership_yml_path` 和 `ownership_yml_sha256` 校验现有 `ownership.yml`，并投影其 GENERATED/LOCAL 规则；M2 不解析、缩减或重写 YAML。3 个冻结文件必须受该现有治理来源的 `CN_SOURCE` 规则覆盖；只有 `node cn/pipeline/generate-content.mjs` 可按显式 `stage` 消费锁中登记且被该 stage 合同声明的输入，且生成器不能把输入登记为输出。M2-2 的每个 manifest 输出条目必须包含合同 `id` 和可反向解析的 3 个 `source_ids`，不允许生成器从未列入合同或锁的输入读取。

- [ ] **步骤 5：运行绿灯与静态归属检查。**

  运行：

  ```powershell
  $root = 'C:\Users\25147\Documents\pob-cn\.worktrees\m2-source-materialize'
  Push-Location $root
  try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed: $LASTEXITCODE" }
    foreach ($testPath in @(
      'cn/tests/pipeline/source-lock.spec.mjs',
      'cn/tests/pipeline/ownership.spec.mjs',
      'cn/tests/pipeline/repository-snapshot.spec.mjs',
      'cn/tests/pipeline/content-contract.spec.mjs'
    )) {
      node --test $testPath
      if ($LASTEXITCODE -ne 0) { throw "test failed: $testPath ($LASTEXITCODE)" }
    }
    & git -C $root diff --check
    if ($LASTEXITCODE -ne 0) { throw "diff check failed: $LASTEXITCODE" }
    $status = @(& git -C $root status --porcelain)
    if ($LASTEXITCODE -ne 0) { throw "cannot read worktree status: $LASTEXITCODE" }
  } finally {
    Pop-Location
  }
  ```

  `npm ci` 与所有 Node 测试必须以 `$root` 为工作目录执行，或显式传入以 `Join-Path $root ...` 构造的文件路径；不得依赖调用者当前目录。预期：不新增第三方解析依赖；所有 source-lock、pipeline ownership 投影、repository-snapshot 与 content-contract 测试通过；以 `$status` 的完整路径列表对照本任务文件清单，改动只在允许文件中；旧项目绝对路径不进入任何新仓库文件。提交主题：`feat(content): 冻结词典输入、合同和归属`。

**M2-1 验收：** 主代理重新计算唯一 gzip 与两份人工 override 的 hash 并按 ID 对照版本锁和 source lock；复核 gzip 的导入报告含 artifact/载荷 hash、schema 身份和 5 域记录数，且失败导入没有替换受控副本；复核完整 upstream snapshot 的 path/OID/canonical hash 与版本锁一致；复核 `pipeline-ownership.json` 对现有 `ownership.yml` 的 path/hash、GENERATED/LOCAL 投影和唯一 writer `node cn/pipeline/generate-content.mjs`，但不解析或改写 YAML；规格审查必须复现路径逃逸、hash 不匹配、未登记输出和缺失合同字段的拒绝测试，并确认 `repository-snapshot.mjs` 是完整未忽略业务树的唯一 helper；确认合同中唯一业务项为 `core.translation`，且其 `source_ids` 精确引用 3 个固定输入。通过后才可派发 M2-2。

## 6. 任务 M2-2：唯一可复现生成器

**文件：**
- 创建：`cn/pipeline/generate-content.mjs`
- 创建：`cn/pipeline/lib/manifest-validator.mjs`
- 创建：`cn/pipeline/schemas/manifest.schema.json`
- 创建：`cn/tests/pipeline/generate-content.spec.mjs`
- 创建：`cn/tests/pipeline/manifest-validator.spec.mjs`
- 创建：`cn/tests/pipeline/fixtures/**`
- 生成：`cn/generated/lua-i18n/translations.lua`、`cn/generated/manifest.json`

- [ ] **步骤 1：写失败的生成器合同测试。**

  测试必须使用 M2-1 建立的真实 schema、source lock、snapshot、version lock、pipeline ownership 与 content contract 结构。fixture 可以缩小 `core.translation` 的输入记录，但不得缩小 M2-2 的两个预期输出。M2-2 在本步骤首次创建且唯一拥有 `cn/pipeline/lib/manifest-validator.mjs`：它导出 `loadManifest(repoRoot)`、允许 partial manifest 的 `validateManifest(...)`、消费者使用的 `assertManifestComplete(manifest, manifestPath)` 和 `assertManifestCompleteFromRepo(repoRoot)`。`manifest-validator.spec.mjs` 必须覆盖 manifest 结构/完整性、partial 允许性和 complete 消费门禁；M2-2 的 partial 测试、M2-3 的 complete 测试及 M3 的消费入口都必须复用这个文件，M3 严禁创建第二份 validator。M2-2 的预期生成集合固定为：

  ```text
  cn/generated/lua-i18n/translations.lua
  cn/generated/manifest.json
  ```

  `cn/generated/web-data/crafting.json` 不属于 M2-2 合同；M2-3 才首次定义其独立 authority、seed 和合同。该文件在 M2-2 提前存在、被空对象代替或将 manifest 标为 complete 都是失败。测试必须覆盖：

  ```javascript
  test('writes the complete M2-2 contract set and nothing else', async () => {
    const changed = await runGeneratorAndListChangedFiles(fixtureRoot);
    assert.deepStrictEqual(changed.sort(), [
      'cn/generated/lua-i18n/translations.lua',
      'cn/generated/manifest.json',
    ].sort());
    assertContractOutputsMatch(changed, contentContract, { stage: 'M2-2' });
  });

  test('changes only contract GENERATED outputs and is byte-identical on a second run', async () => {
    const before = await snapshotBusinessTree(fixtureRoot, ownership);
    await runGenerator(fixtureRoot);
    const first = await snapshotBusinessTree(fixtureRoot, ownership);
    const firstDiff = diffBusinessSnapshots(before, first);
    assert.doesNotThrow(() => assertGeneratedOnlyBusinessChanges(firstDiff, ownership, contentContract, { stage: 'M2-2' }));
    await runGenerator(fixtureRoot);
    const second = await snapshotBusinessTree(fixtureRoot, ownership);
    const secondDiff = diffBusinessSnapshots(first, second);
    assert.equal(formatBusinessSnapshotDiff(secondDiff), '', 'second-run business-tree diff');
  });

  test('rejects additions, modifications, deletions and untracked files outside GENERATED', async () => {
    for (const mutation of ['add', 'modify', 'delete', 'untracked']) {
      const before = await snapshotBusinessTree(fixtureRoot, ownership);
      await makeOutOfGeneratedBusinessMutation(fixtureRoot, mutation);
      const after = await snapshotBusinessTree(fixtureRoot, ownership);
      assert.throws(
        () => assertGeneratedOnlyBusinessChanges(diffBusinessSnapshots(before, after), ownership, contentContract, { stage: 'M2-2' }),
        /GENERATED/,
      );
    }
  });

  test('emits a partial manifest until the crafting seed is authority-verified', async () => {
    await runGenerator(fixtureRoot);
    const manifest = loadManifest(fixtureRoot);
    assert.equal(manifest.completeness, 'partial_crafting_seed_pending');
    assert.doesNotThrow(() => validateManifest(manifest));
    assert.throws(() => assertManifestComplete(manifest, 'cn/generated/manifest.json'), /partial_crafting_seed_pending/);
  });
  ```

  测试只能使用 M2-1 的 `snapshotBusinessTree`、`diffBusinessSnapshots`、`formatBusinessSnapshotDiff` 和 `assertGeneratedOnlyBusinessChanges`：快照记录 `.git` 外所有未忽略业务文件的仓库相对路径与 SHA-256，覆盖新增、修改、删除和未跟踪文件。测试必须在首次生成前、首次生成后和第二次生成后都建立快照；先用 pipeline ownership 投影规则和 content contract 验证首次变化集，M2-2 只允许 `core.translation` 的 Lua 输出及 manifest，再断言首次与第二次完整业务树无差异。失败时必须用 `formatBusinessSnapshotDiff()` 输出路径、变更类型和前后 hash。不得只检查 Git 已跟踪文件、manifest、写入 API 或 `cn/generated`。

- [ ] **步骤 2：运行红灯测试。**

  运行：

  ```powershell
  $root = 'C:\Users\25147\Documents\pob-cn\.worktrees\m2-source-materialize'
  Push-Location $root
  try {
    foreach ($testPath in @(
      'cn/tests/pipeline/manifest-validator.spec.mjs',
      'cn/tests/pipeline/generate-content.spec.mjs'
    )) {
      node --test $testPath
      if ($LASTEXITCODE -eq 0) { throw "expected red test failure before implementation: $testPath" }
    }
  } finally {
    Pop-Location
  }
  ```

  预期：缺少唯一 validator 或生成器时以预期原因失败。不得先写生产实现再补测试。

- [ ] **步骤 3：实现唯一入口和稳定序列化。**

  `node cn/pipeline/generate-content.mjs` 必须按固定顺序执行：调用 `loadLockedInputs(repoRoot, { stage: 'M2-2' })` 验证 `version-lock.json`、`upstream-content-snapshot.json`、受控 gzip 的导入报告和 `content-source-lock.json`，调用 `loadContentContract(repoRoot, { stage: 'M2-2' })` 验证且只加载 `core.translation`，校验 3 个输入 hash，读取受控 gzip 与两份 override，应用 `zh-CN` 覆盖，按稳定键序和 LF 换行只生成 `cn/generated/lua-i18n/translations.lua`，最后写 manifest 并调用 M2-2 唯一的 `validateManifest(...)`。它必须为 `core.translation` 的写入目标调用 `assertGeneratedPath()`，为完成的 Lua 输出调用 `validateGeneratedOutput(output, contract, lockedInputs, { stage: 'M2-2' })`；记录数、字段映射、schema 和 ID 覆盖规则不满足合同就非零退出。不得读取当前机器绝对路径、当前时间、随机数、旧项目路径、外部 `ninja-poe2` 目录或未登记文件；M2-2 不得加载、生成或写入任何 `web-data`，也不得修改输入锁、合同或增加新的上游读取路径。

  manifest 必须含：生成器版本、PoB 上游 SHA、唯一 gzip 的 artifact/载荷/schema 身份、3 个锁定输入与输出的 SHA-256、`core.translation` 的合同 `id` 与 `input_ids`、记录数、未翻译计数、未翻译 allowlist、schema 版本和唯一命令名。它不得包含游戏或天赋树版本，也不得包含泛化 Web 数据声明。每个 `input_ids` 都必须能反向定位到 `content-source-lock.json` 的稳定 ID，且精确等于 `core.translation` 合同项的 3 个 `source_ids`。存在未翻译项且不在已审阅 allowlist 时，生成器必须以非零退出码失败。

  M2-2 的 manifest 必须显式标记 `completeness = "partial_crafting_seed_pending"`，且 `cn/generated/web-data/crafting.json` 必须不存在。`validateManifest(...)` 必须允许这个 partial 状态，`assertManifestComplete(manifest, manifestPath)` 和 `assertManifestCompleteFromRepo(repoRoot)` 必须拒绝它；拒绝信息必须包含 manifest 路径、实际 completeness 和 `crafting seed pending`。M3 只接入这个 M2-2 唯一创建的 validator：bridge 启动、Web build/typecheck、导入、导出 round-trip、发布/打包 5 个真实入口均先调用它；partial 必须非零退出，只有 M2-3 seed 验收后的 `complete` 才能返回零。

- [ ] **步骤 4：实现输出越权保护。**

  写入前将目标相对路径与 `pipeline-ownership.json` 已校验的 GENERATED 投影规则及 content contract 的精确 output path 逐项比对；所有规则的 writer 均必须精确为 `node cn/pipeline/generate-content.mjs`。M2-2 目标只允许 `cn/generated/lua-i18n/translations.lua` 与 `cn/generated/manifest.json`；任何 `cn/generated/web-data/**`、其他合同外 GENERATED 路径或 GENERATED 外路径均立即失败。生成器不得删除未登记文件，也不得修改 `cn/pipeline/sources/**`、`cn/pipeline/overrides/**`、`src/**`、`package-lock.json` 或文档。

- [ ] **步骤 5：运行绿灯、双生成和完整 hash 验收。**

  运行：

  ```powershell
  $root = 'C:\Users\25147\Documents\pob-cn\.worktrees\m2-source-materialize'
  Push-Location $root
  try {
    node --test cn/tests/pipeline/generate-content.spec.mjs
    if ($LASTEXITCODE -ne 0) { throw "generate-content tests failed: $LASTEXITCODE" }
    node --test cn/tests/pipeline/manifest-validator.spec.mjs
    if ($LASTEXITCODE -ne 0) { throw "manifest-validator tests failed: $LASTEXITCODE" }
    $snapshotDir = Join-Path ([System.IO.Path]::GetTempPath()) ("pob-cn-m2-snapshots-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $snapshotDir -ErrorAction Stop | Out-Null
    $snapshotScript = @'
import { loadPipelineOwnership } from './cn/pipeline/lib/ownership.mjs';
import { snapshotBusinessTree } from './cn/pipeline/lib/repository-snapshot.mjs';
const repoRoot = process.argv[1];
const ownership = await loadPipelineOwnership(repoRoot);
process.stdout.write(`${JSON.stringify(await snapshotBusinessTree(repoRoot, ownership))}\n`);
'@
    $firstChangeScript = @'
import { readFile } from 'node:fs/promises';
import { loadPipelineOwnership, assertGeneratedOnlyBusinessChanges } from './cn/pipeline/lib/ownership.mjs';
import { loadContentContract } from './cn/pipeline/lib/content-contract.mjs';
import { diffBusinessSnapshots, formatBusinessSnapshotDiff } from './cn/pipeline/lib/repository-snapshot.mjs';
const [repoRoot, beforePath, afterPath] = process.argv.slice(1);
const ownership = await loadPipelineOwnership(repoRoot);
const contract = await loadContentContract(repoRoot, { stage: 'M2-2' });
const before = JSON.parse(await readFile(beforePath, 'utf8'));
const after = JSON.parse(await readFile(afterPath, 'utf8'));
const diff = diffBusinessSnapshots(before, after);
const formatted = formatBusinessSnapshotDiff(diff);
if (formatted) { process.stdout.write(`${formatted}\n`); }
assertGeneratedOnlyBusinessChanges(diff, ownership, contract, { stage: 'M2-2' });
'@
    $sameTreeScript = @'
import { readFile } from 'node:fs/promises';
import { diffBusinessSnapshots, formatBusinessSnapshotDiff } from './cn/pipeline/lib/repository-snapshot.mjs';
const [beforePath, afterPath] = process.argv.slice(1);
const before = JSON.parse(await readFile(beforePath, 'utf8'));
const after = JSON.parse(await readFile(afterPath, 'utf8'));
const formatted = formatBusinessSnapshotDiff(diffBusinessSnapshots(before, after));
if (formatted) { process.stdout.write(`${formatted}\n`); process.exitCode = 1; }
'@
    $beforePath = Join-Path $snapshotDir 'before.json'
    & node --input-type=module -e $snapshotScript $root > $beforePath
    if ($LASTEXITCODE -ne 0) { throw "cannot snapshot business tree before generation: $LASTEXITCODE" }
    node cn/pipeline/generate-content.mjs
    if ($LASTEXITCODE -ne 0) { throw "first generation failed: $LASTEXITCODE" }
    $firstPath = Join-Path $snapshotDir 'first.json'
    & node --input-type=module -e $snapshotScript $root > $firstPath
    if ($LASTEXITCODE -ne 0) { throw "cannot snapshot business tree after first generation: $LASTEXITCODE" }
    & node --input-type=module -e $firstChangeScript $root $beforePath $firstPath
    if ($LASTEXITCODE -ne 0) { throw "first generation changed a non-contract GENERATED business path: $LASTEXITCODE" }
    node cn/pipeline/generate-content.mjs
    if ($LASTEXITCODE -ne 0) { throw "second generation failed: $LASTEXITCODE" }
    $secondPath = Join-Path $snapshotDir 'second.json'
    & node --input-type=module -e $snapshotScript $root > $secondPath
    if ($LASTEXITCODE -ne 0) { throw "cannot snapshot business tree after second generation: $LASTEXITCODE" }
    & node --input-type=module -e $sameTreeScript $firstPath $secondPath
    if ($LASTEXITCODE -ne 0) { throw "complete business tree changed on the second generation: $LASTEXITCODE" }
    & git -C $root diff --check
    if ($LASTEXITCODE -ne 0) { throw "diff check failed: $LASTEXITCODE" }
    $status = @(& git -C $root status --porcelain)
    if ($LASTEXITCODE -ne 0) { throw "cannot read status: $LASTEXITCODE" }
  } finally {
    if ($snapshotDir -and (Test-Path -LiteralPath $snapshotDir)) { Remove-Item -LiteralPath $snapshotDir -Recurse -Force }
    Pop-Location
  }
  ```

  预期：以 M2-1 的 helper 在生成前、首轮后、二轮后保存完整未忽略业务树快照；首轮 diff 只包含合同声明的 GENERATED 输出，首轮与二轮完整树完全相同。任何差异必须由 `formatBusinessSnapshotDiff()` 输出相对路径、变更类型和前后 hash；不得以仅扫描 `cn/generated` 代替。以 `$status` 的完整路径列表对照本任务文件清单，并确认首轮生成对业务文件的写入精确只有 `cn/generated/lua-i18n/translations.lua` 与 `cn/generated/manifest.json`；不得出现 `cn/generated/web-data/**` 或任何未纳入范围的 Web 数据。`manifest.completeness` 必须为 `partial_crafting_seed_pending`。提交主题：`feat(content): 建立可复现生成管线`。

**M2-2 验收：** `core.translation` 必须是唯一业务合同项。主代理在新建完整工作树用 `snapshotBusinessTree` 执行生成前、首轮后和二轮后的完整未忽略业务树快照比较，保存每个路径/hash 的差异证据；首轮只允许 `cn/generated/lua-i18n/translations.lua` 与 `cn/generated/manifest.json` 两项业务变化。规格审查复现越权路径、未登记输入和未翻译项的失败，并确认 `web.crafting` 尚未生成、manifest 为 partial，且不存在任何未纳入范围的 Web 数据、合同项、fixture、probe、生成入口或同步基线；质量审查确认 `manifest-validator.mjs` 是 M2 唯一实现、partial 由 `validateManifest(...)` 通过而消费门禁由 `assertManifestComplete(...)` 拒绝、每个输出只有唯一 writer `node cn/pipeline/generate-content.mjs`、manifest 不含绝对路径。通过后才可派发 M2-3。

## 7. 任务 M2-3：锻造 seed 的可审阅来源

**文件：**
- 创建：`cn/pipeline/schemas/crafting-seed.schema.json`
- 创建：`cn/pipeline/schemas/slot-tag-map.schema.json`
- 创建：`cn/pipeline/sources/crafting/slot-tag-map.zh-CN.json`
- 创建：`cn/pipeline/sources/crafting/seed.zh-CN.json`
- 创建：`cn/pipeline/lib/crafting-authority.mjs`
- 创建：`cn/tests/pipeline/crafting-seed.spec.mjs`
- 修改：`cn/config/content-source-lock.json`、`cn/config/content-contract.json`、`cn/pipeline/lib/source-lock.mjs`、`cn/pipeline/lib/content-contract.mjs`、`cn/pipeline/generate-content.mjs`、`cn/tests/pipeline/generate-content.spec.mjs`、`cn/tests/pipeline/manifest-validator.spec.mjs`
- 生成：`cn/generated/web-data/crafting.json`、`cn/generated/manifest.json`

**M2-3 首次建立规则：** M2-0 至 M2-2 不得出现 `web.crafting`、`reserved_input_ids`、crafting authority、seed、slot map、相关 schema 或 fixture。M2-3 才在一个原子合同修改中首次引入 `web.crafting.input_ids`、独立 authority、CN slot map 与 seed，并将其新 source lock 条目显式标记为 `stage: 'M2-3'`；不得修改 M2-2 的 3 个 `core.translation` 输入选择集。`validateContentContract(contract, sourceLock, { stage: 'M2-3' })` 必须要求两个 `CN_SOURCE` ID 与所有上游 authority ID 均已锁定。禁止预留字段、空 hash、“稍后补充 hash”或由生成器自行登记输入。

- [ ] **步骤 1：写失败的 authority、CN slot map 与 seed schema 测试。**

  `slot-tag-map.schema.json` 必须要求根对象含 `schema_version`、`source_kind: "CN_SOURCE"`、`source_description`、`reviewed_at_utc_plus_8`、`reviewed_by`、`review_evidence` 和 `entries`。每个 slot tag 条目必须含稳定的原始 `id`、非空中文 `text`、人工定义依据的 `source_path`、`source_sha256` 和可复查的 `source_locator`；其 `source_path` 只能引用该 map 内已审阅的 CN 来源或已登记 upstream 关联输入，不能引用 seed，也不能由生成器生成。该文件独立于 seed，先通过 schema、人工审阅元数据、锁 hash 和全量唯一 ID 校验，才可成为 slot tag 的 authority。

  `crafting-seed.schema.json` 必须要求根对象含 `schema_version`、`reviewed_at_utc_plus_8`、`reviewed_by`、`runes`、`essences` 和 `slotTagMap`。每个 rune/essence/slot tag 映射项必须含稳定 `id`、非空中文值、`source_path`、`source_sha256` 和可复查的 `source_locator`。rune 的 `source_path`/`source_sha256` 必须精确匹配 `upstream.crafting.runes`（`src/Data/ModRunes.lua`）；essence 必须精确匹配 `upstream.crafting.essences`（`src/Data/Essence.lua`）；slot tag 必须精确匹配已锁定的 `crafting.slot-tag-map`，不得直接或间接引用 seed 自己。

  M2-3 首次创建 `cn/pipeline/lib/crafting-authority.mjs`，它必须导出 `buildCraftingAuthority(lockedInputs, readLockedFile)`、`loadReviewedSlotTagMap(lockedInputs)` 和 `validateCraftingSeed(seed, authority, slotTagMap)`。`buildCraftingAuthority()` 只从 M2-3 首次登记到 source lock 的上游文件提取权威 rune ID 与 essence ID：rune 解析规则固定为 `src/Data/ModRunes.lua` 中目标 rune 表的键，essence 解析规则固定为 `src/Data/Essence.lua` 中目标 essence 表的键；解析结果同时返回每个 ID 的 `source_path`、锁定 `source_sha256`、`source_locator`。它可以用四个已登记 Mod 文件做关联完整性校验，但不得用它们或任何旧 JSON 取代 rune/essence 的 ID authority。没有确认的直接上游 slot tag 表时，slot tag authority 只能是上一步通过审阅并锁定的 CN slot map，不得从 seed 得出。

  测试分别拒绝：缺少任何必填字段、重复 ID、空翻译、未知/遗漏 rune、未知/遗漏 essence、未知/遗漏 slot tag、未审阅时间戳、额外未声明字段、与 authority 不一致的 ID、与 lock 不一致的 source hash、source locator 无法定位的条目、slot map 指向 seed、slot map hash 未锁定、从未登记的上游路径读取以及旧项目 `craftingData.json`/`affixes.json`。必须对三个集合都执行双向验证：`seed.runes.id === authority.runes.id`、`seed.essences.id === authority.essences.id`、`seed.slotTagMap.id === reviewedSlotTagMap.entries.id`；测试输出两个方向的缺失/未知计数，任一计数非零即失败。

  ```javascript
  test('rejects crafting data without a reviewed seed', () => {
    assert.throws(() => validateCraftingSeed({ schema_version: 1 }), /runes.*essences.*slotTagMap/);
  });

  test('requires the seed identifiers and slot tags to match locked upstream authority', () => {
    const authority = buildCraftingAuthority(lockedInputs, readLockedFile);
    assert.throws(() => validateCraftingSeed(seedWithUnknownSlotTag, authority), /unknown slot tag/);
  });

  test('does not allow seed data to define its own slot-tag authority', () => {
    const slotMap = reviewedSlotMapReferencing('cn/pipeline/sources/crafting/seed.zh-CN.json');
    assert.throws(() => validateSlotTagMap(slotMap, lockedInputs), /must not reference seed/);
  });
  ```

- [ ] **步骤 2：运行红灯测试。**

  运行：

  ```powershell
  $root = 'C:\Users\25147\Documents\pob-cn\.worktrees\m2-source-materialize'
  Push-Location $root
  try {
    node --test cn/tests/pipeline/crafting-seed.spec.mjs
    if ($LASTEXITCODE -eq 0) { throw "expected red test failure before implementation: cn/tests/pipeline/crafting-seed.spec.mjs" }
  } finally {
    Pop-Location
  }
  ```

  预期：在 schema 与校验器尚未实现时，以功能缺失的原因失败。

- [ ] **步骤 3：人工录入、审阅并锁定 CN slot map 与 seed。**

  先由人工建立 `cn/pipeline/sources/crafting/slot-tag-map.zh-CN.json`，记录 slot tag 的中文名称、每条术语的来源说明/定位、审阅人、UTC+8 时间和审阅证据；它不是生成输出，也不是 seed 的派生物。通过 `slot-tag-map.schema.json` 后重新计算其 SHA-256，将其作为 `id: crafting.slot-tag-map`、`kind: CN_SOURCE` 加入 source lock，并在 ownership 标记为 `CN_SOURCE`。任何 hash、路径、schema、审阅人、时间或 source locator 缺失均不得登记。

  然后用 `crafting-authority.mjs` 从可追溯的官方游戏数据和已锁定上游 Lua 表导出 rune/essence authority，并以已锁定 CN slot map 作为 slot tag authority；再经人工翻译审阅写入 seed。执行代理不得复制、解析或依赖旧项目未跟踪的 `craftingData.json`、`affixes.json`；若需要对照其字段，只能在只读审计报告中列缺口，不能把它作为值来源。每个 authority ID 必须在对应 seed 集合中恰好出现一次；每个条目写入稳定 ID、中文显示文本、`source_path`、`source_sha256` 和 `source_locator`；审阅人、时间和来源 SHA 写入 seed。seed 写完后计算其 hash，登记为 `id: crafting.seed.zh-CN`、`kind: CN_SOURCE`，并用 source lock、content contract 与 schema 重新验证。

- [ ] **步骤 4：接入生成器和覆盖率门禁。**

  生成器必须调用 `loadLockedInputs(repoRoot, { stage: 'M2-3' })` 与 `loadContentContract(repoRoot, { stage: 'M2-3' })`，读取已登记的 seed 与 slot map，先用 `crafting-authority.mjs` 重建 rune/essence authority、加载独立 slot map，并验证 schema、双向 ID 集合、覆盖计数、source hash 和 source locator，再生成合同声明的 `cn/generated/web-data/crafting.json`，并以 `validateGeneratedOutput(output, contract, lockedInputs, { stage: 'M2-3' })` 验证该输出。此时才允许把 manifest 从 `partial_crafting_seed_pending` 切换为 `complete`：生成器必须复用 M2-2 创建的 `manifest-validator.mjs`，先以 `validateManifest(...)` 验证 complete 结构，再以 `assertManifestComplete(manifest, 'cn/generated/manifest.json')` 验证消费条件；不得创建或加载第二份 validator。切换前必须拒绝任何遗漏的 M2-3 合同项。manifest 记录 seed 与 slot map hash、authority 输入 ID、每个集合的 authority/seed 条目数、双向缺失项数和审阅元数据摘要。`runes`、`essences` 或 `slotTagMap` 任一为空、存在未翻译值、ID 覆盖缺口、未知 tag 或来源证据缺失时，生成命令必须失败；不能以空 JSON、隐式默认值或旧产物兜底。

- [ ] **步骤 5：运行绿灯、双生成与人工审阅复核。**

  运行：

  ```powershell
  $root = 'C:\Users\25147\Documents\pob-cn\.worktrees\m2-source-materialize'
  Push-Location $root
  try {
    node --test cn/tests/pipeline/crafting-authority.spec.mjs
    if ($LASTEXITCODE -ne 0) { throw "crafting-authority tests failed: $LASTEXITCODE" }
    node --test cn/tests/pipeline/crafting-seed.spec.mjs
    if ($LASTEXITCODE -ne 0) { throw "crafting-seed tests failed: $LASTEXITCODE" }
    node --test cn/tests/pipeline/generate-content.spec.mjs
    if ($LASTEXITCODE -ne 0) { throw "generate-content tests failed: $LASTEXITCODE" }
    node --test cn/tests/pipeline/manifest-validator.spec.mjs
    if ($LASTEXITCODE -ne 0) { throw "manifest-validator tests failed: $LASTEXITCODE" }
    $snapshotDir = Join-Path ([System.IO.Path]::GetTempPath()) ("pob-cn-m3-snapshots-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $snapshotDir -ErrorAction Stop | Out-Null
    $snapshotScript = @'
import { loadPipelineOwnership } from './cn/pipeline/lib/ownership.mjs';
import { snapshotBusinessTree } from './cn/pipeline/lib/repository-snapshot.mjs';
const repoRoot = process.argv[1];
const ownership = await loadPipelineOwnership(repoRoot);
process.stdout.write(`${JSON.stringify(await snapshotBusinessTree(repoRoot, ownership))}\n`);
'@
    $firstChangeScript = @'
import { readFile } from 'node:fs/promises';
import { loadPipelineOwnership, assertGeneratedOnlyBusinessChanges } from './cn/pipeline/lib/ownership.mjs';
import { loadContentContract } from './cn/pipeline/lib/content-contract.mjs';
import { diffBusinessSnapshots, formatBusinessSnapshotDiff } from './cn/pipeline/lib/repository-snapshot.mjs';
const [repoRoot, beforePath, afterPath] = process.argv.slice(1);
const ownership = await loadPipelineOwnership(repoRoot);
const contract = await loadContentContract(repoRoot, { stage: 'M2-3' });
const before = JSON.parse(await readFile(beforePath, 'utf8'));
const after = JSON.parse(await readFile(afterPath, 'utf8'));
const diff = diffBusinessSnapshots(before, after);
const formatted = formatBusinessSnapshotDiff(diff);
if (formatted) { process.stdout.write(`${formatted}\n`); }
assertGeneratedOnlyBusinessChanges(diff, ownership, contract, { stage: 'M2-3' });
'@
    $sameTreeScript = @'
import { readFile } from 'node:fs/promises';
import { diffBusinessSnapshots, formatBusinessSnapshotDiff } from './cn/pipeline/lib/repository-snapshot.mjs';
const [beforePath, afterPath] = process.argv.slice(1);
const before = JSON.parse(await readFile(beforePath, 'utf8'));
const after = JSON.parse(await readFile(afterPath, 'utf8'));
const formatted = formatBusinessSnapshotDiff(diffBusinessSnapshots(before, after));
if (formatted) { process.stdout.write(`${formatted}\n`); process.exitCode = 1; }
'@
    $manifestGateScript = @'
import { assertManifestCompleteFromRepo } from './cn/pipeline/lib/manifest-validator.mjs';
await assertManifestCompleteFromRepo(process.argv[1]);
'@
    $beforePath = Join-Path $snapshotDir 'before.json'
    & node --input-type=module -e $snapshotScript $root > $beforePath
    if ($LASTEXITCODE -ne 0) { throw "cannot snapshot business tree before generation: $LASTEXITCODE" }
    node cn/pipeline/generate-content.mjs
    if ($LASTEXITCODE -ne 0) { throw "first generation failed: $LASTEXITCODE" }
    $firstPath = Join-Path $snapshotDir 'first.json'
    & node --input-type=module -e $snapshotScript $root > $firstPath
    if ($LASTEXITCODE -ne 0) { throw "cannot snapshot business tree after first generation: $LASTEXITCODE" }
    & node --input-type=module -e $firstChangeScript $root $beforePath $firstPath
    if ($LASTEXITCODE -ne 0) { throw "first generation changed a non-contract GENERATED business path: $LASTEXITCODE" }
    node cn/pipeline/generate-content.mjs
    if ($LASTEXITCODE -ne 0) { throw "second generation failed: $LASTEXITCODE" }
    $secondPath = Join-Path $snapshotDir 'second.json'
    & node --input-type=module -e $snapshotScript $root > $secondPath
    if ($LASTEXITCODE -ne 0) { throw "cannot snapshot business tree after second generation: $LASTEXITCODE" }
    & node --input-type=module -e $sameTreeScript $firstPath $secondPath
    if ($LASTEXITCODE -ne 0) { throw "complete business tree changed on the second generation: $LASTEXITCODE" }
    & node --input-type=module -e $manifestGateScript $root
    if ($LASTEXITCODE -ne 0) { throw "complete manifest gate failed: $LASTEXITCODE" }
    & git -C $root diff --check
    if ($LASTEXITCODE -ne 0) { throw "diff check failed: $LASTEXITCODE" }
    $status = @(& git -C $root status --porcelain)
    if ($LASTEXITCODE -ne 0) { throw "cannot read status: $LASTEXITCODE" }
  } finally {
    if ($snapshotDir -and (Test-Path -LiteralPath $snapshotDir)) { Remove-Item -LiteralPath $snapshotDir -Recurse -Force }
    Pop-Location
  }
  ```

  预期：以 M2-1 的 helper 在生成前、首轮后、二轮后保存完整未忽略业务树快照；首轮 diff 只包含合同声明的 GENERATED 输出，首轮与二轮完整业务树完全相同。任何差异必须由 `formatBusinessSnapshotDiff()` 输出相对路径、变更类型和前后 hash；不得以仅扫描 `cn/generated` 代替。全部测试通过，manifest 为 `complete` 且含 seed、slot map hash、authority 输入和三个集合的双向零缺失项，并且 `assertManifestCompleteFromRepo($root)` 通过。提交主题：`feat(content): 固化锻造审阅 seed`。

**M2-3 验收：** 规格审查确认本阶段才首次建立 rune、essence 与 slot tag 的 schema、独立 authority、seed、来源和中文值，且 seed 不自证 slot tag；主代理复算 slot map/seed hash、确认 `web.crafting.input_ids` 与 authority/seed 均在同一原子合同变更中首次出现、检查 manifest 与三个双向零缺失计数，并记录人工审阅证据；主代理以 M2-1 的完整业务树 helper 复现首轮允许变化与二轮零差异，确认 complete 状态复用 M2-2 唯一 validator；代码质量审查确认旧未跟踪 JSON 未被读取。通过后 M2 才可标为已验收。

## 8. 外部 ninja-poe2 更新与受控导入契约

`ninja-poe2` 是外部工具工作区，不是 Git 仓库。对它的可追溯性必须使用 artifact hash、客户端版本、外部构建记录、工具文件 SHA-256 和 schema 身份；不得写入或假设 Git commit、remote 或 blob OID。

1. 外部受控工作区更新时，先记录 CN/国际服客户端版本与路径、`tools/upstream-builder/update.py`、`tools/upstream-builder/build.py`、`tools/build-all.mjs` 的 SHA-256，以及导入所需 schema 的来源、版本和 SHA-256。Ninja 外部数据构建有两条不可互换的路径，且两条都必须以成功执行最终 `npm run build:dict` 作为交付前置：

   - **首次或离线提取：** 先执行 `npm run extract:upstream`，再执行 `npm run build:dict`。
   - **游戏补丁更新：** 先执行 `python tools/upstream-builder/update.py --cn <CN 客户端> --intl <国际服客户端>`，再执行 `npm run build:dict`。

   `update.py` 不等价于 `npm run extract:upstream`；即使前者内部可能触发构建，也不能替代对应路径完成后的完整交付链。两条链只能在外部受控工作区执行，绝不能由 POB-CN 的 build/test/importer 调用。`build:dict` 的 `build-all.mjs` 可能触发 Trade、发布或打包副作用；POB-CN 不执行、不依赖也不导入这些副产物，只在外部 artifact 已验证后接收最终 `data/poe2.json.gz`。

2. 当前 `tools/upstream-builder/config.json` 没有 `schemaUrl`。因此 `update.py` 的远程 schema 下载会回退到 vendored schema，不能表述为「已自动同步最新 schema」。若 schema 来源、版本或 SHA-256 未由人工明确锁定，或外部更新记录显示下载失败/回退但没有相应身份记录，本次更新必须失败关闭且不得导入 artifact。

3. POB-CN 的唯一导入入口是 `source-lock.mjs` 的 `importNinjaPoe2Dictionary(...)`，采用两阶段、可回滚的原子事务：外部工作区只交付 `data/poe2.json.gz`；入口将 artifact 复制到仓库外临时文件，并在同一临时事务中准备候选 source lock、`version-lock.json` dictionary 字段和 `docs/architecture/compatibility/dictionary/<gzip-sha256>.md`。它依次校验 gzip SHA-256/大小、gunzip、JSON 可解析性、已锁 schema、解压 SHA-256/大小和 `items`、`stats`、`tooltip`、`ui`、`terms` 五域的精确记录数。全部候选通过才允许提交受控 gzip、两个 lock 位置和报告；任一校验、候选写入或提交失败都必须回滚为导入前逐文件 hash 和报告路径集合，且不得改变 manifest 或其他仓库文件。

4. 每次兼容性报告必须包含：CN/国际服客户端版本、`tools/upstream-builder/update.py`、`tools/upstream-builder/build.py`、`tools/build-all.mjs` 这 3 个工具文件的 hash、schema 来源/版本/hash、两份 override hash、输入与输出 gzip/json hash、压缩/解压大小、五域记录数、命令/退出码、导入时间、POB-CN 版本锁、差异摘要和结论。报告不得包含外部工作区作为运行时输入，也不得带入 Trade、发布、打包或 `dist` 产物。

## 9. M2 统一验收与后续同步契约

1. 主代理在一个干净、完整物化的工作树执行全部 M2 测试与生成命令两遍，记录每个生成文件 SHA-256，而非仅记录 manifest hash。
2. 按阶段核对 `git status --porcelain` 的完整路径列表：M2-2 只能出现 `CN_SOURCE` 实现文件、`cn/generated/lua-i18n/translations.lua` 和 `cn/generated/manifest.json`；M2-3 才可出现 `cn/generated/web-data/crafting.json` 及更新后的 manifest。两阶段都不得出现任何非锻造 Web 数据；`src/**` 仅允许 M1 已验收的 `src/Modules/Main.lua` adapter hunk，不得有 M2 改动。
3. manifest 中不应包含 `C:\Users\`、旧项目路径、时间戳或未锁定输入；使用仓库相对 POSIX 路径。
4. 将唯一 gzip 的 artifact/载荷/schema 身份、两份 override hash、`core.translation` 输入 hash、生成器版本，以及 M2-3 的 seed/slot map hash 与 crafting authority 基线，作为下一次 M4 上游同步的比较基线。上游 SHA 或外部词典 artifact 改变后，必须重新验证本阶段锁定输入、重新生成并生成兼容性报告，不能沿用本 M2 的输出；未纳入范围的 Web 数据仍须由经批准的新阶段单独设计、锁定和验收。
5. M2 完成不等于 M3 的导入/导出或 UI 等价验收通过，也不授权删除旧目录。
