# 兼容性报告

`cn/pipeline/sync/new-upstream-sync.ps1` 只允许在已验证外部证据后创建
`sync/upstream-<12 位 SHA>` 候选分支。它不导入 gzip、不改内容锁、不会 merge 或
checkout 当前分支。

候选报告写入 Git 元数据目录 `upstream-sync-reports/`，不作为业务产物提交。报告必须包含：

- 候选分支、上游 SHA、基线 SHA 与上游默认分支；
- CN 与国际服客户端版本；
- `update.py`、`build.py`、`build-all.mjs` 的 SHA-256，以及 `npm run build:dict` 的退出码；
- schema 路径、版本、SHA-256 与 `fallback_used: false`；
- 锁定 gzip 与解压 JSON 的 SHA-256、大小、五个顶层域计数；
- `terms` 与 `glossary` override 的路径和 SHA-256；
- 每个脚本命令的退出码，以及“不替换 gzip/lock”的结论。

外部证据的 schema 身份、客户端版本、三个工具哈希或最终 `build:dict` 成功记录缺失时，
同步器必须在 fetch 或创建候选分支前失败。候选分支只供人工审阅；通过 CI 和人工决定后，
才可在独立流程中导入新 gzip 并准备合并。
