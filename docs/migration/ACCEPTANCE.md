# PoB-CN 迁移验收门禁

只有以下全部门禁通过，迁移才可标记完成。验收代理必须将每项实际命令、退出码、完整提交 SHA 和报告路径追加到 `PROGRESS.md`。

| 编号 | 门禁 | 必需证据 |
|---|---|---|
| A1 | 基线可追溯 | `upstream` URL、官方 SHA、`cn-main` SHA、版本锁定文件 |
| A2 | 文件归属完整 | `ownership.yml` 覆盖全部自定义输入与生成输出；上游 diff 仅命中 adapter 白名单 |
| A3 | 生命周期正确 | 原生 Lua bootstrap 在 `main` 就绪后只初始化一次的自动化测试和启动日志 |
| A4-0 | 数据源已物化 | 在新物化 `$root` 中以 `git -C $root rev-parse upstream/dev` 与 `Join-Path $root 'cn/config/version-lock.json'` 的 SHA 做等值断言，`HEAD` 必须包含该提交，`core.sparseCheckout` 为 false/未设置且 `core.autocrlf=false`；按 `git -C $root ls-tree -r upstream/dev` 枚举完整上游业务树，每个文件均实际落盘并记录 upstream blob OID、`git cat-file blob` 的 canonical 内容 SHA-256、工作树 blob OID、仅作诊断的 raw SHA-256 与物化状态；除 `src/Modules/Main.lua` 的 approved M1 adapter hunk 和根 `.gitignore` 相对 M1 提交 `f88291dd5444958745a82241a4536c05dc31b789` 的精确 bootstrap hunk 外，所有 blob OID 必须一致。另以相同业务树定义保存 `.git` 外完整未忽略快照，覆盖 tracked、added、modified、deleted、untracked 五种状态；M2-0 仅采集唯一 external gzip artifact 与 schema/导入兼容性身份，禁止 game/tree/crafting/Web probe |
| A4-1 | 数据输入可追溯 | M2-1 建立且仅供 M2-2 `core.translation` 使用的 `stage: "M2-2"` 输入选择集，必须严格等于 `dictionary.ninja-poe2.poe2-runtime-gzip`、`override.zh-CN.terms`、`override.zh-CN.glossary` 3 个输入及完整 upstream snapshot lineage；唯一 gzip 位于 `cn/pipeline/sources/dictionary/ninja-poe2/poe2.json.gz`，记录 gzip/解压 JSON SHA-256、大小、mtime、schema 来源/版本/SHA-256、5 域记录数与外部构建证据。M2-3 新输入必须以 `stage: "M2-3"` 另行登记；`loadLockedInputs(repoRoot, { stage })` 的 stage 为必填且只返回该 stage 合同声明的输入，测试必须断言 M2-2 永不能读取 crafting 输入。`source-lock.mjs` 的唯一 `importNinjaPoe2Dictionary(...)` 必须先在仓库外临时事务完成候选 gzip、两个 dictionary lock 位置和兼容性报告的完整校验，再可回滚地成组提交；校验、候选写入或提交故障注入后，受控 gzip、`content-source-lock.json`、`version-lock.json` dictionary 字段和报告路径集合的逐项 hash 必须与导入前一致。`source-lock.mjs`、`ownership.mjs`、`content-contract.mjs` 的测试证明所有路径为仓库相对 POSIX 路径，拒绝绝对路径、盘符、`..` 路径逃逸、符号链接逃逸、`cn/generated/**` 输入、裸 `poe2.json`、`poe1.json`、外部/旧项目路径、未登记输入、hash/OID 不一致、未锁定 upstream 读取和 ownership 外写入；M2-0 至 M2-2 不得出现 crafting read set；manifest 每个 M2-2 输出含合同 `id` 与可反查的 3 个 `input_ids` |
| A4-2 | 数据可复现 | 干净完整工作树连续两次执行唯一生成命令，逐项比较 generated 文件路径和 SHA-256、manifest 字节、记录数与 completeness；`.git` 之外的完整文件树快照必须覆盖新增、修改、删除和未跟踪文件。M2-2 的变化集只能命中 `cn/generated/lua-i18n/translations.lua` 与 `cn/generated/manifest.json`，且两者均由 `content-contract.json` 声明；不得存在或读取 `cn/generated/web-data/**`。manifest 必须是 `partial_crafting_seed_pending`，且 shared validator 使 bridge 启动、Web build/typecheck、导入、导出 round-trip、发布/打包 5 个入口均以非零退出；错误须包含 manifest 路径、实际 completeness 和 `crafting seed pending`，只有 complete fixture 才能返回零 |
| A4-3 | 锻造数据可审阅 | `runes` authority 只能来自锁定 `src/Data/ModRunes.lua`，`essences` authority 只能来自锁定 `src/Data/Essence.lua`；`ModItem.lua`、`ModJewel.lua`、`ModItemExclusive.lua`、`ModCorrupted.lua` 只能用于已登记的关联完整性；无直接上游表时，`slotTagMap` 必须来自独立 `CN_SOURCE` `cn/pipeline/sources/crafting/slot-tag-map.zh-CN.json`，具备 schema、来源说明、人工审阅人/时间/证据和定位。tracked seed 的每项均保留 `source_path`、`source_sha256`、`source_locator`；测试对 rune、essence、slot tag 分别做 authority/seed 双向集合相等和覆盖计数，拒绝未知或遗漏项、空翻译、未锁 hash、自引用 seed 以及旧项目未跟踪的 `craftingData.json`/`affixes.json` |
| A5 | 翻译可控 | 未翻译扫描报告、两份独立人工 override 的审阅 diff/hash、无直接编辑 generated 文件；每次 Ninja 导入保留 CN/国际服客户端版本、`tools/upstream-builder/update.py`、`tools/upstream-builder/build.py`、`tools/build-all.mjs` 3 个工具文件 hash、schema 来源/版本/hash、输入与输出 gzip/json hash、压缩/解压大小、5 域计数、命令/退出码、原子替换结果、差异与结论。`config.json` 缺少 `schemaUrl` 时，未人工锁定 schema 的下载回退必须失败关闭；不得声称自动同步最新 schema、不得记录虚构 Ninja Git commit，也不得导入 Trade、发布、打包或 `dist` 副产物 |
| A6 | 核心功能等价 | 匿名 fixture 的导入、导出 round-trip、计算、天赋、装备、技能 golden 测试 |
| A7 | 前端质量 | `vue-tsc`、生产构建、关键交互自动化测试全部通过 |
| A8 | 同步可执行 | 模拟上游 SHA 的候选同步分支、兼容性报告和 CI 结果 |
| A9 | 从零可构建 | 全新目录 clone、安装、生成、测试、打包的完整日志 |
| A10 | 删除授权 | 用户明确确认精确删除路径；删除前归档 hash，删除后清单与状态记录 |

M2 当前总状态及 M2-0 至 M2-3 均为“待开始”。只有 A4-0 至 A4-3 全部通过、4 个子阶段均完成并分别验收后，主代理才可将 M2 标记为“已验收”；任一局部计划、测试或子阶段结果都不能改变该总状态。

Ninja 外部数据交付有两条不可互换的路径，两条均须在外部受控工作区以最终 `npm run build:dict` 结束后，才允许验证和交付 `data/poe2.json.gz`：首次或离线提取为 `npm run extract:upstream` 后执行 `npm run build:dict`；游戏补丁更新为 `python tools/upstream-builder/update.py --cn <CN 客户端> --intl <国际服客户端>` 后执行 `npm run build:dict`。`update.py` 不等价于 `npm run extract:upstream`，即使其内部可能触发构建，也不能替代完整交付链。POB-CN 只导入外部验证通过的最终 gzip artifact，不得导入 Trade、发布、打包或 `dist` 副产物。

## 驳回规则

- 任一命令未执行、失败或无可复现输出，整项门禁不通过。
- 仅有截图、口头说明或“本机测试正常”不能替代自动化证据。
- A10 在用户明确授权前永久保持未通过，不阻塞开发验收，但阻塞旧目录删除。
