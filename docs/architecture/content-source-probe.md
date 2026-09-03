# M2-0 内容来源探测记录

## 结论

`dictionary.ninja-poe2.poe2-runtime-gzip` 已完成只读身份探测，可作为 M2-1 受控导入候选；本阶段未复制、导入或作为 POB-CN 构建、测试、运行时依赖使用。`ninja-poe2` 是外部工具工作区，不是 Git 仓库，因此不得为该来源虚构 Git commit、remote 或语义版本。

当前词典状态为 `HASH_IDENTIFIED`。`tools/upstream-builder/config.json` 未配置 `schemaUrl`，当前只记录 vendored schema 的身份和兼容性结论，不能表述为自动同步最新 schema。

## 唯一词典 artifact

| 字段 | 实测值 |
| --- | --- |
| source ID | `dictionary.ninja-poe2.poe2-runtime-gzip` |
| 外部只读路径 | `C:\\Users\\25147\\Documents\\AI-xiangmu\\ninja-poe2\\data\\poe2.json.gz` |
| gzip SHA-256 | `2af6460f94ef0fc6ef9826e7ca8b06f485013b4828993e0480391b9138bcc779` |
| gzip 大小 | `2558745` bytes |
| 文件 mtime（UTC+8） | `2026-08-24T19:27:47+08:00` |
| 解压 JSON SHA-256 | `18f613924fe3a8092bc00194ff1082309484c454773f76566674db1feba4057a` |
| 解压 JSON 大小 | `12205433` bytes |

解压 JSON 顶层记录数如下：

| 域 | 记录数 |
| --- | ---: |
| `items` | 13609 |
| `stats` | 29358 |
| `tooltip` | 2592 |
| `ui` | 499 |
| `terms` | 24169 |

## 外部构建与 schema 身份

- `dictionary/meta.json`：`generatedAt=2026-08-23T15:39:16.649746+00:00`，`schemaVersion=7`。
- `tools/upstream-builder/config.json`：无 `schemaUrl`。
- vendored schema：`tools/upstream-builder/poe2dict/vendor/schema.min.json`，SHA-256 为 `0d0844dd3a049cb806cb9be6299e6427c86a8c48f355f3fe878100fe254d8688`。
- `tools/upstream-builder/update.py`：SHA-256 `d916bfaf7ff906ed6235d766bb6ed3f99e151f7bd8bfaf9ce634dd89c91f3653`。
- `tools/upstream-builder/build.py`：SHA-256 `bef358cae73bad0d569fb0cb930a8dab9415ce1fca76500c155f8b930b877e7e`。
- `tools/build-all.mjs`：SHA-256 `c4501bcaadcd4e73d87c29e8398879ccf95285c40f26c0b8718f10f7cf0c38d9`。

外部更新链固定如下，二者都必须在外部受控工作区以成功的 `npm run build:dict` 结束：

1. 首次或离线提取：`npm run extract:upstream`，再运行 `npm run build:dict`。
2. 游戏补丁更新：`python tools/upstream-builder/update.py --cn <CN 客户端> --intl <国际服客户端>`，再运行 `npm run build:dict`。

POB-CN 后续仅可由受控导入入口接收已验证的最终 gzip，不得调用外部更新链，也不得接收 Trade、发布、打包或 `dist` 副产物。

## M2-1 前置项

M2-1 将创建、人工审阅并哈希锁定以下独立 `CN_SOURCE` 覆盖层：

- `override.zh-CN.terms`
- `override.zh-CN.glossary`

两份 override 在本阶段尚不存在，不能以本探测记录替代其内容、审阅证据或 hash 锁定。
