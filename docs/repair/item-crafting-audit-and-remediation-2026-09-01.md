# 装备与珠宝制作系统审计与修复要求

**审计日期：** 2026-09-01  
**审计范围：** `C:\Users\25147\Documents\pob-cn` 当前工作树中的装备、珠宝、符文、物品库同步和相关翻译路径。  
**审计性质：** 前半部分是源码静态追踪与已记录复现的审计基线；文件末尾的“执行复核记录”单独记录本轮实际修复和测试结果，不替代最终人工验收结论。
**规则基线：** 本仓库内置 PoB 0.5 Lua 数据与官方物品模型。

## 审计结论

审计基线下制作系统**不可验收**。问题不是单一的展示错误，而是同时涉及：官方词缀生成、数值范围、符文孔、物品展示/序列化边界、装备槽合法性、状态保真、规则来源、唯一词典、性能和交付门禁。

修复必须以 `GEMINI.md` 为硬约束：Lua 官方核心是唯一业务规则源；Vue/TS 只显示并提交结构化状态；缺失值保持空或零；全项目只能使用 `cn/generated/web-data/translations.json` 这一份翻译词典；静态生成数据不得裁决制作合法性。当前执行结果与尚未完成的人工/干净检出门禁见下方“执行复核记录”。

## 状态说明

- **已确认：** 在本次工作树的源码中仍可直接追踪到的缺陷。
- **需要复验：** 曾以真实场景复现，但本次没有对运行中的服务重新执行该复现；必须作为回归测试先补上。
- **真实内核探针：** 本审计已用项目内 `Builds/luajit/luajit.exe` 启动 `HeadlessWrapper.lua`，在空白 Build 上请求 `Acrid Wand` 的稀有词缀预览。结果只返回 `Prefix/Suffix: {range}ModId` 控制行和 `Implicits: 0`，未返回候选词缀的可见数值行；该底材生成数据的孔上限为 3，当前 options 却返回 `socketCount: 0`。这不是测试替身结果。
- 现有工作树有大量未提交改动。本审计不判断这些改动的作者或意图，不回退、不覆盖它们。

## 执行复核记录（2026-09-01）

本轮已在本方案约束下直接执行核心修复，并将结果作为后续验收基线：

- `Item:Craft()` 负责真实词缀实体化；默认孔、品质、隐式、符文和 Time-Lost Ruby 半径均由官方对象投影。
- 制作选项从官方词缀行解析 `(min-max)` 数值范围并返回 `range.min/max/step`；有官方 numeric range 的词缀必须提供 `roll`，并由 Lua 校验、规范化为 `0..1`。前端新增词缀默认使用 PoB `defaultItemAffixQuality = 0.5`，不再固定为最低值。无官方 range 的固定值词缀，`options` 返回 `range = nil`，草稿可省略 `roll`，并由 `Item:Craft()` 以官方原值实体化；适配层不会为固定值伪造 `range`。
- `raw` 与用户可见 Tooltip 投影分离；工坊卡片和悬浮 Tooltip 只消费官方 `ItemsTab:AddItemTooltip` 返回的 `header/bodyLines`。`edit` 原位保留 ID，`duplicate` 分配新 ID；canonical revision 过期会拒绝。
- 目标槽只消费 Lua `IsItemValidForSlot` 投影，装备珠宝槽单独返回并可提交；`create + target`、`edit + target`、`duplicate + target` 均已加入 XML 导出/重载回归。
- 只读状态的 `edit` 会失败；`duplicate` 返回 `nonInheritedStates`，以官方 `id + normalized roll` 的多重集合比较普通前缀、后缀和精华，并明确列出未继承的腐化、镜像、圣化、碎裂、附魔等状态。
- `duplicate` 的催化剂、催化剂品质、孔数、符文和珠宝半径也纳入 `nonInheritedStates` 对比；显式保留同值时不误报，空草稿丢失时会明确提示。所有 22 个可能返回的状态键均已在唯一生成词典中有非空中文译文。
- 催化剂 ID/标签从官方 `Item` 方法取得，制作选项和工坊控件均消费官方能力；催化剂品质上限仍沿用当前 PoB `ItemsTab` 对 Breach Ring 的名称分支，属于上游契约残余风险。
- `AddItemTooltip` 的 Vaal `mutated` 顶层写入已使用写隔离 view 阻断；真实 `Greed's Embrace / Vaal Cuirass` 回归确认展示仍完整，原始物品状态不被 Tooltip 投影污染。
- 浏览器复验发现并修复了动态翻译漏项。官方 `catalog/options` 中的稀有度、精华类型、13 个 `Item.catalystList` 名称，以及 Tooltip 的授予技能、Ctrl+D、装备对比和属性需求文本均仅通过 `terms.json -> generate:content -> translations.json` 补齐；未改 Vue/Lua 翻译逻辑或增加私有映射。
- 2026-09-02 浏览器实提交流程发现并修复编辑初始化回归：异步目录回填底材时曾将源物品的 `itemLevel` 从 50 重置为底材最低等级 33，致使 Lua 正确拒绝原词缀、工坊却错误地显示为不可编辑。现仅在编辑源物品的异步目录/选项初始化窗口保留其官方投影等级、变体和词缀；新建仍以官方底材最低等级初始化。该修复不修改 Lua 制作规则、桥接事务或静态规则数据。

已执行并通过：

```text
node --test cn/tests/bridge/official-crafting-headless.integration.spec.mjs                     (1/1)
node --test cn/tests/web/r23-crafting-studio.spec.mjs cn/tests/web/poe-item-tooltip.spec.mjs    (16/16)
npm run web:typecheck                                                                            (0)
npm run web:build                                                                                (0)
npm run test:m3                                                                                  (76 pass / 0 fail / 9 legacy mock skip)
```

本轮在本机 `127.0.0.1` 的真实 UI 中以 `Acrid Wand` 完成了工坊打开、官方类别/底材切换、可变词缀添加和官方预览。预览卡片包含官方武器孔、需求、获授技能和词缀；无 `Prefix/Suffix: {range...}` raw 控制行、无控制台错误，且已核对上述动态运行时值不再泄漏英文。随后已实际提交并验收：`create + 主手装备` 使物品库从 0 变为 1；从该项进入 `edit + 主手装备` 后，等级 50、词缀和目标槽均保留，提交后物品库仍为 1；对腐化只读项走 `duplicate` 后物品库从 2 变为 3，源项未被覆盖。真实 LuaJIT 集成仍覆盖 `create/edit/duplicate` 的装备珠宝槽、XML 导出/重载；浏览器手工验收仍应补充不同 build 的重开与装备珠宝槽交互。

Tooltip 完整投影已闭环：工坊与悬浮层直接使用官方 Tooltip 行，真实武器预览已显示其官方武器字段。仍有一项架构性未闭环风险：桥接目录保留了 `crafting-authority-v2.json` 静态草稿校验器。当前 `http-server.mjs` 的实际制作端点直接转发 Lua `craftCatalog/craftOptions/craftPreview/craftCommit`，未导入该校验器；该静态校验器不得重新接入制作请求，后续应在可归属的独立变更集中删除或隔离它及其测试，防止静态规则再次取得裁决权。

GitNexus 索引已确认为最新。局部 Lua helper 未被索引时，`projectOfficialItem`、`nonInheritedCraftStates` 和 `createStrictCraftItem` 的影响查询返回 target not found，已以真实 LuaJIT 回归补偿；静态 `createCraftDraftValidator` 的影响范围如上。`gitnexus_detect_changes(scope=all)` 仍因当前共享工作树历史累积差异过大返回 `spawnSync git ENOBUFS`；本轮未提交，已改用目标文件 diff、真实 HeadlessWrapper、浏览器复验、类型检查、构建和 M3 门禁进行范围复核。提交前必须在拆分后的干净变更集上重新执行 `gitnexus_detect_changes()`。

## P0：阻断制作正确性的缺陷

| 编号 | 状态 | 问题与证据 | 用户影响 | 必须的修复 |
|---|---|---|---|---|
| C-01 | 已确认，真实内核复现 | [`real-calc-adapter.lua:1502`](../../cn/lua/real-calc-adapter.lua#L1502) 的 `createStrictCraftItem` 从 `Prefix/Suffix + ModId` 建物品，但未调用官方 [`Item.lua:1695`](../../src/Classes/Item.lua#L1695) 的 `Item:Craft()`。官方该方法负责把词缀 ID 与 range 展开为真实显式词条并重建物品。真实 `Acrid Wand` 探针已证实最终 raw 只有控制行、`Implicits: 0`。 | 词缀只停留为控制字段，既没有可见数值词条，也不能作为可信的计算输入。 | 以官方新建物品流程建立底材和状态，写入词缀结构后调用 `Item:Craft()`；只以该调用后的官方 Item 做预览、保存和计算。禁止前端拼接最终词缀文本。 |
| C-02 | 已确认 | 物品投影优先使用 `item.raw`，而制作页将 `rawLines` 用于可见卡片、`raw` 用于源码。`Crafted: true`、`Prefix: <ModId>`、`Implicits: 0` 等解析控制行会进入玩家可见信息。 | 预览卡片与 PoB 官方工具提示/源码含义混淆，既看不到真实词缀，也无法判断导出内容是否正确。 | API 返回两个不可混用的字段：`raw`（官方可导入/可回读序列化文本）与 `displayLines`（官方完成物品的可见行）。卡片只能消费后者，源码面板只能消费前者。 |
| C-03 | 已修复并有真实内核回归 | [`ItemCraftingStudio.vue`](../../cn/web/src/components/ItemCraftingStudio.vue) 原先固定写入 `roll: 0`，且只识别 `{range:...}`；官方候选通常使用 `(85-99)`。现由 Lua 从官方词缀定义返回 `range.min/max/step`；有官方 numeric range 的词缀必须提供并由 Lua 校验、规范化 `0..1` Roll，前端新增词缀默认使用 PoB `defaultItemAffixQuality = 0.5`。无官方 range 的固定值词缀返回 `range = nil`，草稿可省略 `roll`，由官方 `Item:Craft()` 按原值实体化。真实 `HeadlessWrapper` 集成证据：`GlobalSpellGemsLevelWeapon1` 的 options 返回 `range == nil`，省略 roll 可成功 preview，该固定值词缀 commit 成功，XML 导出并由官方重载后词缀仍保留；`ChaosDamagePrefixOnWeapon8` 省略 roll 被明确拒绝并返回 `POB_CRAFT_DRAFT_INVALID`，roll `0` 与 `1` 均可用且产生不同显示值。 | 普通词缀无法调整数值，最终总是最低 roll；若把固定值词缀也强制绑定滑块，会向官方模型写入不存在的范围。 | 已完成并由真实 `HeadlessWrapper` 断言范围元数据、可变/固定值 Roll 契约、官方显示行和 XML 往返；仍需在浏览器中手工确认滑块改变后预览数值随 Roll 更新。 |
| C-04 | 已确认，真实内核复现 | [`ItemCraftingStudio.vue:580`](../../cn/web/src/components/ItemCraftingStudio.vue#L580) 的草稿请求未提交 `socketCount`；适配器只有收到该字段才写 `Sockets:`。官方新建装备流程会在 [`ItemsTab.lua:2419`](../../src/Classes/ItemsTab.lua#L2419) 为可有孔的武器/护甲创建默认孔。真实 `Acrid Wand` 探针确认：底材孔上限为 3，当前 options 为 0 孔。 | 新制作物品实际为零孔，符文能力也显示为零；编辑已有带孔物品时孔和符文可能丢失。 | Lua creator 必须复用 `ItemsTab` 的默认孔、质量和半径初始化语义；草稿只能请求 Lua 已返回的可变孔状态，前端不得推导或默认孔数。验证保存、计算、导出和重导入均保留孔与符文。 |
| C-05 | 已确认 | [`ItemsPanel.vue:651`](../../cn/web/src/components/ItemsPanel.vue#L651) 打开已有物品编辑器时固定把 target 设为 `null`；制作页据此走 `create` 而不是替换。请求也没有 `sourceItemId`。 | 编辑已有物品会新增库项，旧项和原装备引用仍存在；这与原版 PoB 的库内编辑语义不一致，且会积累孤儿物品。历史“同 ID 已替换但计算仍旧值”不能作为当前缺陷的已确认描述。 | 提交结构化草稿时，编辑必须携带 `sourceItemId`，由 Lua 在同一 canonical XML 事务中以该 ID 替换 `itemsTab.items[id]`，保留装备集和珠宝槽引用；“创建副本”作为独立显式动作。删除历史 `/api/calculate` 全量 JS 快照方案。 |

## P1：官方物品模型与界面契约错误

| 编号 | 状态 | 问题与证据 | 必须的修复 |
|---|---|---|---|
| C-06 | 已确认 | [`ItemsPanel.vue:959`](../../cn/web/src/components/ItemsPanel.vue#L959) 以名称/类型正则猜测装备槽，代替官方 [`ItemsTab.lua:2275`](../../src/Classes/ItemsTab.lua#L2275) `IsItemValidForSlot`。当前 options/preview 也未返回官方合法目标槽位。 | Lua preview 必须返回当前物品集状态下的 `validTargetSlots`。前端只呈现并提交该集合，不得按名称推导。覆盖双手、盾牌/副手、替换和冲突规则。 |
| C-07 | 已确认 | 官方基础槽包含 `Ring 3`、`Arm 1/2`、`Leg 1/2`，武器还有 swap 槽（[`ItemsTab.lua:25`](../../src/Classes/ItemsTab.lua#L25)）；当前前端只维护常见十个装备槽和固定药剂/护符槽。 | 由后端投影当前官方槽模型，UI 动态渲染全部可用槽位、条件槽与武器切换槽；不再维护裁决性的前端槽列表。 |
| C-08 | 已确认 | 官方会创建装备珠宝槽，如 `Weapon 1 Jewel Socket 1`（[`ItemsTab.lua:210`](../../src/Classes/ItemsTab.lua#L210) 起）。前端只管理天赋树珠宝槽。 | 将装备珠宝槽纳入同一份官方 slot projection；导入、编辑、替换和删除都必须可访问、可保存。 |
| C-09 | 已确认 | 当前正则把 `talisman` 归为 `Amulet`（[`ItemsPanel.vue:959`](../../cn/web/src/components/ItemsPanel.vue#L959)），但权威底材中存在可制作 `Talisman`，官方槽规则还对其作为武器有专门逻辑（[`ItemsTab.lua:2349`](../../src/Classes/ItemsTab.lua#L2349)）。 | 删除名称分类；全部由 `IsItemValidForSlot` 返回实际合法槽位。至少覆盖每个 Talisman 底材。 |
| C-10 | 已确认 | 官方新建 `Jewel/Radius` 时会设 `item.jewelRadiusLabel = "Small"`（[`ItemsTab.lua:2460`](../../src/Classes/ItemsTab.lua#L2460)）；当前草稿/API没有等价状态。 | 在 Lua creator-equivalent 逻辑中保留并投影官方半径状态。验收 Time-Lost Ruby/Emerald/Sapphire/Diamond 与被动树半径效果。 |
| C-11 | 已确认 | 编辑投影只保留有限字段；孔、催化剂、附魔、特殊隐式、fractured、desecrated、mirrored、sanctified、double-corrupted 等不能完整保真。仅 UNIQUE 有特殊分支，其他不可改物品仍可能进入编辑后静默丢状态。 | 建立完整官方状态投影与可编辑性分类。普通可制作稀有物品的 `edit` 必须以 `sourceItemId` 原位替换，保留其装备集和珠宝槽引用；只读的 UNIQUE、镜像或其他官方不允许改写状态不得伪装成可编辑。对这类只读物品可另提供明确的 `duplicate`/“以此底材创建稀有副本”动作，并在预览中逐项说明不会继承的状态。`edit` 与 `duplicate` 不可混用，任何状态都不得静默丢失。 |
| C-12 | 已确认 | 适配器拒绝 `draft.title`，原始文本构建器固定 `Crafted Item`。官方稀有制作允许自定义物品标题。 | 将官方允许的稀有标题作为结构化草稿字段，执行官方字符/格式校验，并在 raw 与 display 中一致保留。 |
| C-13 | 已确认 | 适配层在 [`crafting-authority.mjs:48`](../../cn/bridge/crafting-authority.mjs#L48) 写死品质上限 20/40；前端对所有非珠宝显示品质。官方仅在 `item.quality` 与 `item.base.quality` 存在时展示编辑（[`ItemsTab.lua:591`](../../src/Classes/ItemsTab.lua#L591)）。catalyst 虽有部分投影，但无完整合法配置入口。 | Lua options/preview 返回官方是否可设品质、范围与催化剂可用性。前端不写质量/催化剂规则；支持合法催化剂和催化品质，或明确只读且原样保留。 |
| C-14 | 已确认 | 变体仅做整数类型校验，没有根据官方 `variantList` 校验上下界。 | options 返回官方变体列表、索引和标签；preview 只接受该列表中的值。 |
| C-15 | 已确认 | [`ItemCraftingStudio.vue:494`](../../cn/web/src/components/ItemCraftingStudio.vue#L494) 用 `#` 替换官方数值；多行词缀/精华只显示 `lines[0]`；Tier 与组标签由前端拼装并泄漏内部英文。 | 前端直接渲染 Lua 返回的权威显示行及唯一词典翻译结果。多行词缀必须完整显示，不能修改官方数值、范围、Tier 或组名。 |

## P1：硬性规则违反

| 编号 | 状态 | 问题与证据 | 必须的修复 |
|---|---|---|---|
| C-16 | 已确认 | [`ItemCraftingStudio.vue:317`](../../cn/web/src/components/ItemCraftingStudio.vue#L317) 和 [`crafting-authority.mjs:4`](../../cn/bridge/crafting-authority.mjs#L4) 直接加载 5.7MB `crafting-authority-v2.json`；[`cn/pipeline/lib/crafting-authority.mjs`](../../cn/pipeline/lib/crafting-authority.mjs) 还在 JS 重写稀有度、词缀容量、腐化等规则。前端还以静态数据筛选底材、类别和稀有度。 | 增加由 Lua/官方数据生成的 `catalog` 契约，作为底材、类别、稀有度和可见制作入口的唯一来源。删除静态规则数据对“允许/拒绝/容量/数值/槽位/底材分类/稀有度/品质/孔数/range”的任何裁决权。`options`、`preview` 和 `commit` 的全部合法性及规范化只由官方 `Item`/`ItemsTab` 数据得出。静态数据若保留，只能作为不参与筛选、排序或判断的展示缓存，且不得在缓存缺失时降级为前端规则。 |
| C-17 | 已确认 | [`webTranslation.ts:143`](../../cn/web/src/utils/webTranslation.ts#L143) 含硬编码翻译 switch/文本分支，且其静态门禁并未覆盖所有运行时分支；[`loader.lua:19`](../../cn/lua/i18n/loader.lua#L19) 另加载 `cn/generated/lua-i18n/translations.lua`。这违反 `GEMINI.md` 的全局唯一词典限制。 | 只保留 `cn/generated/web-data/translations.json`。Lua 运行时须直接解码/查询这一个 JSON 源（可做进程内只读缓存），不得生成、加载或维护第二份 `translations.lua` 词典；Vue/TS 也只能通过同一 JSON 查询。删除 `translateSourceType` 的硬编码 switch、私造翻译表和硬编码翻译文本。门禁除静态扫描外还必须覆盖实际 `catalog/options/preview` 返回值，检测 `Tier`、组 ID、`Prefix/Suffix`、`ModId` 等内部标识泄漏。 |

## P2：性能、交付和测试可信度

| 编号 | 状态 | 问题 | 必须的修复 |
|---|---|---|---|
| C-18 | 已确认 | 工作台首次加载/预热会导入并解析 5.7MB 静态权威 JSON。该行为是首次打开卡顿风险，不能据此直接断言全部应用启动耗时。 | 移除该 JSON 的规则职责后重新做冷启动与首次打开 profiling；记录网络、解析、Lua options 和首帧耗时，建立上限回归测试。 |
| C-19 | 已确认 | 当前工作树中生产文件与 `test:m3` 所依赖的门禁测试存在未跟踪文件；干净检出可能缺失实现或测试，无法构建完整交付物。 | 将实际生产组件、桥接接口、规则测试、严格门禁和生成物清单纳入版本控制。用全新 clone 执行 install、`npm run test:m3`、`npm run build`。 |
| C-20 | 已确认 | 当前 `npm run test:m3` 为 **62 pass / 0 fail / 9 legacy mock skip**；替身用例已明确跳过，但通过数不能替代真实内核证据。 | 真实集成门禁必须直接以项目 `Builds/luajit/luajit.exe` 驱动 `HeadlessWrapper.lua`，实际执行官方 `Item:Craft()` 和 `ItemsTab` 逻辑；覆盖词缀实体化、默认孔、Time-Lost 半径、装备珠宝槽、原位编辑 ID/引用保留、特殊状态往返、导出/导入及计算更新。单元替身测试可保留，但不得充当上述验收证据。每份报告必须包含命令、完整退出码和最终汇总。 |

## 推荐的目标契约

### 1. Lua 唯一规则接口

新增或收敛为以下桥接接口，输入输出均为结构化 JSON；前端不得重算其中任何规则。不得新增“前端发送完整物品库快照，再由独立 `/api/calculate` 回写”的并行制作通路。

| 接口 | 输入 | Lua/官方内核职责 | 必须返回 |
|---|---|---|---|
| `POST /api/crafting/catalog` | 当前 build/物品集上下文及仅用于显示的查询条件 | 从官方基础与物品模型枚举当前可创建的底材、类别、稀有度和入口状态；不读取前端静态规则包作裁决 | 权威 `baseId/baseName`、类别、可选稀有度、最小/最大物品等级、可编辑性及禁用原因；前端只能据此建立筛选和下拉框 |
| `POST /api/crafting/options` | `action`、`sourceItemId`（`edit`/`duplicate` 必填）、底材、等级、稀有度、当前物品集/槽上下文 | 读取当前 canonical XML，校验动作与源 ID；从官方基础、权重、最低等级、词缀组、物品状态取得候选项和默认草稿 | 权威候选词缀及完整数值范围/步进、精华、符文能力、品质/催化剂、变体、完整状态投影、`validTargetSlots`、逐项禁止原因、`canonicalRevision` 和规范化初始草稿 |
| `POST /api/items/preview` | `action`、`sourceItemId`、`canonicalRevision`、结构化草稿及目标槽选择 | 在当前 canonical XML 上走官方新建/编辑流程，调用 `Item:Craft()`，规范化并验证；不改变持久状态 | `raw`、由官方 Item 字段投影的结构化 `displayLines`、规范化草稿、完整状态投影、`validTargetSlots`、逐字段错误和同一 `canonicalRevision` |
| `POST /api/items/commit` | `action: create|edit|duplicate`、`sourceItemId`（除 `create` 外必填）、预览通过的规范化草稿、目标槽、`canonicalRevision` | 在单一 Lua canonical XML 事务中重新验证预览结果并提交。`edit` 以 `sourceItemId` 原位替换；`duplicate` 分配新 ID；按官方规则更新装备/珠宝引用并触发现有计算更新路径 | 已提交 `itemId`、新 `canonicalRevision`、更新后的物品/槽投影、计算更新结果或精确错误。版本不一致、源不存在、只读状态或非法槽必须失败，绝不静默创建、覆盖或丢引用 |

`canonicalRevision` 是针对当前 canonical XML 的乐观并发令牌：`options` 和 `preview` 返回其读取的版本，`commit` 必须拒绝过期版本并要求重新 options/preview；不得依赖前端缓存或全量快照解决并发和同步。

### 2. 官方新建/编辑流程

1. 读取 `action`、`sourceItemId` 和 canonical revision。`edit` 只能针对官方允许修改的现有稀有物品；`duplicate` 才能创建新 ID；只读特殊状态不可被降格为普通编辑。
2. 解析并验证底材、等级、稀有度、标题、变体、品质、催化剂、腐化和所有保留状态；验证只以官方对象及其数据为准。
3. 严格对齐 `ItemsTab:CraftItem` 的初始创建语义：按官方条件赋予默认质量、默认符文孔、装备珠宝孔和珠宝半径。不要调用依赖 GUI 界面状态的交互流程；必要时抽出可测试的 Lua 核心 helper，并以该官方流程为唯一语义基线。
4. 对每个词缀仅接收 `modId + normalizedRange`，先做官方权重、等级、组互斥和容量验证，写入官方 affix 结构后调用 `Item:Craft()`。
5. 从 `Item:Craft()` 完成后的同一官方 Item 生成 canonical raw；`displayLines` 必须从官方对象的可见字段结构化投影，不能由前端或服务端解析 raw 控制行拼出。
6. 用 `ItemsTab:IsItemValidForSlot` 计算当前物品集下的目标槽集合，并返回完整状态投影和计算输入。
7. `commit` 重新执行上述验证并在同一 canonical XML 事务提交，再走既有计算更新路径；前端不可用本地快照补偿事务失败。

### 3. 前端职责边界

- 仅渲染 catalog/options/preview 的数据，提交 `action`、`sourceItemId`、revision、`modId + range`、状态与用户选择的目标槽。
- 只能对 UI 排序、搜索、选择和显示格式处理；不得用静态 JSON 或名称规则筛选底材/类别/稀有度，亦不得判定词缀合法性、词缀上限、品质上限、孔数、装备槽或最终数值。
- 不得把 raw 解析控制行展示给用户，不得把官方数值改成 `#`，不得截断多行属性。
- 不得自动装备到“猜测合法”的槽；目标槽必须由用户在 Lua 返回的集合中选择。
- `edit`、`duplicate`、只读与 revision 冲突必须是明确的交互状态；前端不得把失败请求降级成 create，或将旧物品/引用留在用户不可见的状态。

## 验收矩阵

| 验收项 | 最小证据 | 通过标准 |
|---|---|---|
| 真实词缀生成 | 用 `Builds/luajit/luajit.exe` 驱动 `HeadlessWrapper.lua`，新建装备加入 `IncreasedLife7`、`Intelligence5` 并改变 roll | `Item:Craft()` 后的 preview display lines 和 raw 都含正确数值；`explicitModLines` 与计算值同步变化，且不出现仅有 `Prefix/Suffix: {range}ModId` 的控制行状态 |
| 合法性 | 零权重、等级不足、词缀组冲突、超前后缀上限、珠宝上限 | options 不提供或 preview 给出逐项官方错误；前端不自行放行/拒绝 |
| 数值范围 | 每种 range 形式及精华词缀 | 控件来自 Lua range；最小、中间、最大值都能规范化、计算、导出和重导入 |
| 孔与符文 | 单手、双手、护甲、无孔底材、已有符文物品 | 默认孔与官方一致；符文可保存、计算、导出/导入不丢失 |
| 珠宝 | 普通珠宝、Time-Lost 半径珠宝、装备珠宝槽 | radius、被动树效果和装备珠宝槽均可见、可访问、可往返 |
| 装备槽 | 双手、盾牌、副手、Talisman、Ring 3、Arm/Leg、武器 swap | 目标选择只显示 `IsItemValidForSlot` 结果；无名称正则判定 |
| 状态保真 | 催化剂、品质、变体、附魔、特殊隐式、腐化/镜像/圣化等 | 可编辑状态合法保留；不可编辑状态只读或明确复制，不允许静默丢失 |
| 原位编辑事务 | 把已分配到装备槽的同一稀有物品生命从 `+111` 编辑为 `+222`，提交 `action=edit` 和原 `sourceItemId` | 物品 ID 不变，所有已分配装备槽/珠宝槽仍引用该 ID，库中没有旧孤儿项；计算更新为 `+222`；导出/导入往返后 ID、引用和数值仍一致。随后删除该物品时不残留引用 |
| 显式复制事务 | 对只读特殊物品请求 `duplicate`，并对普通稀有物品请求 `edit` | `duplicate` 分配新 ID 且清楚列出未继承状态；`edit` 不生成新项。只读项的 `edit`、过期 revision、错误 source ID 均返回明确失败，绝不回退为 create |
| 展示与翻译 | 原始源码、卡片、多行词缀、Tier、ModId | raw 与 display 分离；不出现控制字段、英文内部 ID 或私造译名；只查唯一 JSON 词典 |
| 性能与交付 | 全新 clone 冷启动、首次打开工作台 | 不加载静态规则包裁决；记录并满足性能预算；`npm run test:m3`、`npm run build` 均有完整成功退出码 |

## 实施顺序与门禁

以下顺序是为了避免用界面修补掩盖 Lua/事务缺陷。每阶段完成前不得进入下一阶段；每个阶段都须在本文件的验收用例中留下可复跑的命令、退出码与结果。

1. **先建立失败的真实核心契约测试。** 用 `Builds/luajit/luajit.exe + HeadlessWrapper.lua` 固定 C-01、C-04、C-05、C-10、C-11 的最小复现：`Item:Craft()` 实体化、默认孔、Time-Lost 半径、装备珠宝槽、原位编辑 ID/引用/计算与状态往返。现有 70/70 替身测试只能作为回归辅助，不能解除本门禁。
2. **实现 creator 与投影核心。** 将 `ItemsTab:CraftItem` 的初始化语义抽为可由桥接层调用的官方等价逻辑，随后调用 `Item:Craft()`；建立 raw 与结构化 display projection 的单向边界。该阶段必须使真实内核测试通过，且不得由 Vue/TS 解析或补齐词缀。
3. **实现单事务编辑提交。** 在现有 canonical XML/计算更新路径中加入 `create|edit|duplicate`、`sourceItemId` 与 `canonicalRevision`。先通过原位替换和显式复制的集成测试，再连接 UI；禁止引入第二套全库快照或 `/api/calculate` 写入通路。
4. **先接 catalog，再移除前端裁决。** 让页面的底材、类别、稀有度、候选词缀、范围、孔、质量、状态和目标槽全部消费 Lua `catalog/options/preview`；删除静态 JSON、正则和名称推断参与的 allow/deny 分支。此阶段应有断言证明静态数据缺失时接口仍不能被前端规则替代。
5. **收敛翻译与显示。** Lua 和 Web 直接查询唯一 `translations.json`，删除第二份 Lua 词典与 `translateSourceType` 等硬编码映射；对真实 `catalog/options/preview` 结果运行内部 ID 泄漏门禁，并验证多行显示不截断。
6. **交付前在干净检出验证。** 确认生产文件、桥接接口、生成物和真实集成测试均已纳入版本控制；用全新 clone 运行核心集成测试、`npm run test:m3`、`npm run web:typecheck`、`npm run web:build`，并记录完整退出码。最后执行手工 PoB 对照验收：新建、编辑、复制、装备、导入/导出、重开 build。

任何阶段发现官方数据无法表达的状态，必须先将该状态标为只读并返回结构化原因；不得以丢字段、前端猜测或伪造默认值换取“可保存”。

## 性能整改计划与可追溯执行记录（2026-09-02）

### 目标、边界与判断标准

本章节处理用户实际反馈的严重交互性能问题：连续分配天赋后已分配节点消失、装备装卸/技能修改数秒后才反映、导入或刷新长时间无可用信息。目标是将普通编辑路径收敛到与官方 PoB 相同的语义：官方核心在同一 Build 中完成单次变更和单次 `BuildOutput`；浏览器只提交状态并显示当次官方投影。不得为了性能显示上一 revision 的计算结果，或在前端/Lua 伪造、缓存、二次推导伤害数值。

下列铁律逐项适用，任何一项未满足即停止进入下一阶段：

- `GEMINI.md`：前端零业务数学；Lua 仅透传官方 `actor.output`、`actor.breakdown`、`modStore:Tabulate`；无非零/非空伪造兜底；翻译只能查询 `cn/generated/web-data/translations.json`。
- canonical XML revision 是唯一并发顺序源。不得并发访问单线程 PoB 核心，且失败的连续操作不得被静默合并、覆盖或丢弃。
- 本计划只在本文件回填计划、变更、命令、退出码、结果和遗留风险；不新建并行“性能修复方案”文档。
- 修改任意代码符号前，先记录 GitNexus upstream impact；`HIGH`/`CRITICAL` 必须先在本文和用户同步风险，且由专门回归门禁确认。共享工作树很脏，绝不回退、覆盖或归属既有改动。

### 官方对照与已确认根因

| 编号 | 已确认事实 | 官方 PoB 对照 | 影响 |
|---|---|---|---|
| PERF-01 | 当前一般 mutation 会经过 `BuildOutput -> SaveDB -> projectBuild(fastMode) -> 全量 JSON`；`fastMode` 仍构造 DPS pipeline、动态 breakdown、来源和完整项目投影。 | 官方普通编辑设置 `buildFlag` 后只在 UI 更新周期执行一次 `BuildOutput`，不把每一次编辑都序列化为 `SaveDB` 或完整传输整个 Build。 | 装备、技能、配置和天赋每次都付出完整物品库、全部配置/技能/装备集和计算明细的成本。 |
| PERF-02 | `projectBuild` 遍历物品库并对每一项调用 `ItemsTab:AddItemTooltip`；位置 `cn/lua/real-calc-adapter.lua:1314`、约 `1408`。 | 官方 `ItemListControl:AddValueTooltip` 只在悬浮项需要刷新时调用 `AddItemTooltip`（`src/Classes/ItemListControl.lua:139`）。 | 任何不涉及物品展示的 mutation 也重新构造所有 Tooltip，物品库越大越慢。 |
| PERF-03 | `projectDpsPipeline` 至少固定调用 19 次 `ModStore:Tabulate`，`projectBreakdown` 可继续展开更多动态明细；位置 `real-calc-adapter.lua:623`、`:700`、`:1137`。 | 官方计算页按当前 UI 状态消费官方输出/明细，不在每次非计算页编辑中建立额外手工管线。 | 负载与 UI 可见数据不匹配，且扩大 GC 和 JSON 序列化成本。 |
| PERF-04 | 天赋点击前端发送完整 `allocNodes`，Lua 使用 `spec:ImportFromNodeList`（`real-calc-adapter.lua:3612`）。该方法会 Reset、选择职业/升华并多次重建路径。 | 官方点击分别调用 `PassiveSpec:AllocNode` 或 `DeallocNode`（`src/Classes/PassiveSpec.lua:917`、`:977`），每个操作只执行与单节点语义相关的路径重建。 | 不必要的整树重导入是天赋操作秒级延迟的确定根因之一。 |
| PERF-05 | `projectDpsPipeline` 含手工伤害公式、`Sum/More` 推演和非零静态兜底。 | `GEMINI.md` 只允许官方原始输出、breakdown、Tabulate 透传。 | 不能以缓存或搬移该管线解决性能；必须先移除其违规派生职责。 |
| PERF-06 | 连续 mutation 已串行化，修复了旧 revision 交错覆盖造成的已点节点消失；但串行意味着慢操作会累积等待。 | PoB 核心单线程，不能通过并发请求修复。 | 后续只能在同一核心会话中按官方逐节点语义有序合并，不能并发。 |

`saveToStorage` 当前仅保存 `canonicalBuild`（`buildStore.ts:521`），不是本轮主热点。Bridge `ensureLoaded` 已按 fingerprint/revision 复用已加载官方会话，装备/技能慢的主因也不是每次重新 `loadXML`。

### 阶段计划与准入门禁

| 阶段 | 状态 | 最小允许范围 | 交付物与通过条件 | 明确禁止项 |
|---|---|---|---|---|
| PERF-P0 性能基线 | 已通过最小根因量化；用户 Build 基线待补 | 只读测量；未改业务语义。 | 已对同一 canonical XML 记录 load、单点天赋、装备、技能、`BuildOutput`、`SaveDB` 与总墙钟时间；保留输入来源、环境、退出码和限制。 | 不以空白 build 成绩代替用户 build；不以浏览器计时猜测 Lua 阶段。 |
| PERF-P1 天赋单点官方语义 | 已通过自动化、真实 HTTP 与页面级冒烟；用户大 Build 手工性能验收待补 | `buildStore.ts`、`real-calc-adapter.lua` 和既有专属测试；仅改变单节点 toggle 请求/应用语义。 | 每次点击走 `AllocNode`/`DeallocNode`；真实 LuaJIT 已验证自动路径后 XML 往返与取消后 XML 往返，且两侧 `ImportFromNodeList=0`。 | 不发送整表 `allocNodes` 作为单点操作；不跳过失败反馈；不改变其它 mutation 或 response shape。 |
| PERF-P2 数据完整性整改 | 已启动审计，尚未改代码；风险高 | 计算投影消费者、`projectDpsPipeline`、`projectBreakdown`、Store 清理语义和专属断言。 | 页面只显示对应 revision 的官方原始投影；删除 `projectDpsPipeline` 的手工公式、`Sum/More`/`Combine` 推演和伪造兜底；严格数据完整性门禁通过。 | 不缓存旧 dps/breakdown 冒充当前结果；不在前端重新计算；不以零外的默认值补洞。 |
| PERF-P3 按需 Tooltip/Breakdown | 待执行，依赖 P2 | `projectBuild`、按需 endpoint/消费者和接口契约测试。 | mutation 不再为每个库项调用 `AddItemTooltip`，未打开计算页不展开完整 breakdown；按需接口只从当前官方会话的同 revision 取数。显式全量刷新仍可取得完整投影。 | 不复用旧 revision Tooltip/明细；不客户端解析 raw 或推导数值；不削减导入/导出数据保真。 |
| PERF-P4 连续交互优化 | 待执行，依赖 P1-P3 | canonical mutation 队列与天赋专属测试。 | 仅在一个核心会话中按官方逐节点操作有序执行，随后一次计算；任一节点失败时返回精确操作结果且不丢已成功步骤。 | 不并发核心计算；不按时间窗吞掉用户操作；不跨 revision 合并。 |
| PERF-P5 持久化策略 | 延后评估，依赖 P0-P4 | 仅在可恢复 journal/事务设计获审后允许修改。 | 刷新、Bridge 崩溃和请求失败均可恢复 canonical state；持久化成本与收益有 P0 数据证明。 | 直接延迟/取消 `SaveDB`；以可能丢 build 的方式换取速度。 |

风险评估：P1 为中高风险，因官方树路径、Mastery 与武器分支属于共享状态；P2/P3 为高风险，跨越计算、投影和 Web 合约，必须独立验收。P4/P5 在前置阶段未完成前不得开始。

### 已完成缓解措施（作为 P0 基线前状态）

| 记录时间 | 变更/结论 | 验证命令与结果 | 残余风险 |
|---|---|---|---|
| 2026-09-02 | canonical mutation 队列使天赋、装备、技能顺序使用最新 revision，修复连点后先前节点被旧投影覆盖的问题。 | `node --test cn/tests/web/canonical-build-store.spec.mjs`：11 pass，0 fail；`npm run test:m3`：85 pass，9 legacy skip，0 fail。 | 这保证正确性但不缩短单次计算；慢操作仍会串行累积。 |
| 2026-09-02 | `loadXML` 复用首次 `skillBreakdown`，避免导入后第二次完整投影；Loadout/Build/Config/Skill mutation 用已验证 canonical XML 作为回滚快照，减少额外 `SaveDB`。 | `node --test cn/tests/bridge/http-server.spec.mjs cn/tests/bridge/real-calc-adapter.spec.mjs`：28 pass，9 skip，0 fail；`npm run web:typecheck`：exit 0。 | 仍保留一次正式 `SaveDB`、全量 `projectBuild` 和完整 JSON；不能宣称已达到官方交互性能。 |
| 2026-09-02 | 独立审查确认所有制作展示继续只消费官方 Tooltip 投影，唯一词典与零前端业务计算门禁保持通过。 | `npm run test:m3`：73 pass，9 legacy skip，0 fail；`npm run web:typecheck` / `npm run web:build`：exit 0。 | 共享工作树使计数会因并行改动变化；最终交付以本轮全量门禁为准。 |

### PERF-P0 执行台账

| 时间 | 操作 | 输入与环境 | 命令/证据 | 退出码 | 结果/下一步 |
|---|---|---|---|---|---|
| 2026-09-02 | 源码与官方对照复核 | 当前 `pob-cn` 工作树；官方 PoB 内置 `src/` | 对照 `real-calc-adapter.lua:623,700,1137,1314,1408,3612`、`PassiveSpec.lua:917,977`、`ItemListControl.lua:139` | 0（只读） | PERF-01 至 PERF-06 证据成立；P0 继续建立可重复的真实计时。 |
| 2026-09-02 | GitNexus 索引核对与流程检索 | GitNexus repo `pob-cn`，3967 symbols / 151 processes | `gitnexus://repo/pob-cn/context`；query: `canonical build mutation performance calculation projectBuild passive tree equipment skill update` | 0 | 索引未报告 stale；`officialProjectionState` 位于导入投影链。开始任何 P0 代码符号改动前必须单独运行 upstream impact。 |
| 2026-09-02 | 空白官方 Build 的分段计时 | 独立进程：`Builds/luajit/luajit.exe`，工作目录 `src/`，先 `newBuild -> exportXML -> loadXML`，对 `loadBuildFromXML`、`Adapter:calculate`、`BuildOutput`、`SaveDB` 加临时 wrapper；无 HTTP/浏览器。 | PowerShell 以 `package.path = '../runtime/lua/?.lua;../runtime/lua/?/init.lua;'` 加载 `HeadlessWrapper.lua` 和 `real-calc-adapter.lua`；输出见本行结果。 | 0 | `newBuild=331ms`；`loadXML=528ms`，其中官方 XML 加载 `454ms`、calculate `57ms`、剩余投影约 `17ms`；`commitBuildChanges(level=2)=89ms`，`BuildOutput=48ms`、`SaveDB=4ms`、其余 mutation/projection 约 `37ms`；XML 12,929 bytes，0 库物品。仅验证计时切点和冷导入成本，不代表用户 Build。 |
| 2026-09-02 | 一件真实官方制作装备的分段计时 | 独立进程；使用官方 `craftCommit(Wooden Club)`、`assignOfficialItem(Weapon 1)` 形成 13,184-byte canonical XML，随后 `loadXML` 并依次装备卸下、等级变更、整表方式新增一个相邻天赋节点、技能组新增。 | 同上；每次 mutation wrapper 记录总时间、`BuildOutput`、`SaveDB`，余数包含 mutation + export + `projectBuild(fastMode)`。 | 0 | 导入 `571ms`：XML 加载 `437ms`、calculate `71ms`、投影约 `63ms`；装备卸下 `104ms`（`BuildOutput=35ms`、`SaveDB=4ms`、其余 `65ms`）；等级 `137ms`（`42/9/86ms`）；整表天赋单点 `306ms`（`43/3/260ms`）；技能新增组 `95ms`（`41/5/49ms`）。证明本样本中单点天赋慢主要不是伤害计算或持久化，而是整树导入及其后全量路径；P1 准入通过。 |
| 2026-09-02 | P1 修改前 GitNexus impact | `toggleNode` 与其直接调用链；Lua Adapter 局部方法和 Bridge route 未被当前索引解析。 | `gitnexus_impact({target:'toggleNode', direction:'upstream', minConfidence:0.8, maxDepth:3, includeTests:true})`；`gitnexus_context(toggleNode)`、`gitnexus_context(handleMouseDown)`。 | 0 | `LOW`：1 个直接调用者 `PassiveTreeCanvas.handleMouseDown`，1 条受影响流程。`applyCalculationInputs`、`commitBuildChanges` 和 `/api/build/commit` 返回 `target/route not found`，因此不能据此降级风险；P1 必须以真实 LuaJIT 和 XML 往返补偿。 |

### PERF-P1 执行台账

| 时间 | 操作 | 修改范围/输入 | 命令/证据 | 退出码 | 结果/下一步 |
|---|---|---|---|---|---|
| 2026-09-02 | 最小单节点契约实现 | `cn/web/src/stores/buildStore.ts`：`toggleNode` 改为提交 `changes.passiveNode={nodeId,allocated}`；`cn/lua/real-calc-adapter.lua`：仅该字段调用官方 `spec:AllocNode` / `spec:DeallocNode`，检查节点存在、意图布尔值与官方最终状态，随后调用既有 `itemsTab:UpdateSockets`。保留 `allocNodes + ImportFromNodeList` 供导入/兼容；未改 response shape、`BuildOutput`、`SaveDB`、投影、物品或技能代码。 | 定向源码审阅：`calculationInputKeys`、`commitBuildChanges`、`applyCalculationInputs`、`toggleNode`。 | 不适用 | 请求不再带完整节点表；前端队列仍在真正执行时读取最新 revision，失败仍回滚该次乐观显示。 |
| 2026-09-02 | 单元回归 | `cn/tests/web/canonical-build-store.spec.mjs` 增加/修改连续三次分配和一次取消请求契约；`cn/tests/bridge/real-calc-adapter.spec.mjs` 断言单点分配/取消各调用官方 method、零次 `ImportFromNodeList`、更新珠宝槽并拒绝与全量导入混用。 | `node --test cn/tests/web/canonical-build-store.spec.mjs cn/tests/bridge/real-calc-adapter.spec.mjs` | 0 | 28 pass，9 legacy skip，0 fail。 |
| 2026-09-02 | 真实官方语义与 XML 往返 | 真实 `HeadlessWrapper` 新 Build；选择已分配节点的相邻可达节点 `56651`；临时包装官方方法计数。 | `Builds/luajit/luajit.exe` 在 `src/` 加载 `HeadlessWrapper.lua`，执行 `commitBuildChanges(passiveNode allocate) -> loadXML -> commitBuildChanges(passiveNode deallocate) -> loadXML`。 | 0 | 分配：`AllocNode=1`、`ImportFromNodeList=0`；取消：`DeallocNode=1`、`ImportFromNodeList=0`；分配 XML 12,939 bytes 和取消 XML 12,998 bytes 均由官方重载后得到正确节点集。该断言同时已固化入 `official-crafting-headless.integration.spec.mjs`。 |
| 2026-09-02 | 同构性能对照 | 同一独立 LuaJIT 进程、同一新 Build、同一候选节点 `56651`、同一 canonical XML；每轮先旧 `allocNodes`，再新 `passiveNode`，均记录总时间、`BuildOutput` 与 `SaveDB`。 | 三轮真实 HeadlessWrapper 对照；输出 XML 每轮均为 12,939 bytes。 | 0 | 旧：`347/634/411ms`，新：`199/203/160ms`；新路径的其它阶段 `132/133/103ms`，旧为 `272/439/336ms`。`BuildOutput` 仍为 `54-70ms`，`SaveDB` 为 `1-6ms`，说明收益来自移除整树重导入，不是缓存或伪造计算结果。样本较小，不能代表用户 build 的绝对毫秒；P2/P3 仍需处理大 Build 的全量投影。 |
| 2026-09-02 | 真实集成门禁 | 现有 `cn/tests/bridge/official-crafting-headless.integration.spec.mjs` 已增加官方单点分配、取消、方法计数与 XML 重载断言。 | `node --test cn/tests/bridge/official-crafting-headless.integration.spec.mjs` | 0 | 1 pass，0 fail；真实 LuaJIT 全链耗时约 9.4s。 |
| 2026-09-02 | 全量回归门禁 | 全工作区，保留 9 个明确 legacy mock skip。 | `npm run test:m3`；`npm run web:typecheck`；`npm run web:build`。 | 0 / 0 / 0 | M3：90 pass，9 skip，0 fail；类型检查与生产构建均通过。仅出现 Node `DEP0190` 弃用警告，不影响命令结果。 |
| 2026-09-02 | 变更范围图谱复核 | 当前共享工作树含历史累计差异。 | `gitnexus_detect_changes({scope:'all'})`。 | 非零 | 返回 `Git diff failed: spawnSync git ENOBUFS`。未伪称图谱扫描通过；已用 P1 修改文件局部审阅、GitNexus P1 前 impact、真实 LuaJIT、定向单元和全量门禁补偿。提交前必须在拆分后的干净变更集重新执行该命令。 |
| 2026-09-02 | 已启动服务上的 HTTP 与页面级冒烟 | 启动前 `3000/3002` 无监听进程；随后启动 `npm --prefix cn/web run server` 和 `npm --prefix cn/web run dev -- --host 127.0.0.1 --port 3000`。HTTP 使用独立新建官方空白 Build，不覆盖启动前用户会话。 | `GET /health`：200 `{"ready":true}`；`GET /`：200。`POST /api/import` revision 1，随后 `POST /api/build/commit` 分配节点 `56651` 到 revision 2，再取消到 revision 3；浏览器打开 `http://127.0.0.1:3000/`。 | 0 | HTTP 返回：`allocatedNodePresent=true`、`deallocatedNodePresent=false`；页面天赋树正常渲染，浏览器控制台 0 error。Canvas 节点不使用猜测坐标自动点击，故这不是用户真实 Build 的手感验收；需用户在实际大 Build 连续点天赋确认延迟。 |

P1 准入结论：**通过，服务已重启并可供用户验收；已完成 P2 的高风险准入审计，开始 P2 的测试先行实施。** 原因是 P1 只移除了天赋整表重导入，装备、技能、导入和刷新仍会构造全量投影；P2 的手工 DPS 管线整改必须先完成独立影响分析、数据完整性门禁和真实核心契约，不能与 P1 最小修复混合。

### PERF-P2 高风险准入审计与执行计划

#### 已确认的影响面与图谱限制

- GitNexus 已执行 `npx gitnexus analyze`，返回 `Already up to date`；随后对 `projectDpsPipeline`、`projectBreakdown`、`projectBuild`、`commitBuildChanges`、`calculate`、`/api/build/commit` 和 `/api/import` 的 context/impact/API impact 查询均未识别 Lua 局部函数或这些路由。不能以空结果降级风险。
- 源码逐点补偿结果：`projectBuild` 位于 `real-calc-adapter.lua:1314`，由 import、制作、装备装卸、loadout、build/config/skill mutation 全部调用；Store 的 `applyOfficialProjection` 位于 `buildStore.ts:283`，每次成功提交都会无条件替换全部领域；`CalcsPanel` 和 `DefencesPanel` 消费 `skillBreakdown`，`SideStats`、`CalcsPanel`、`DefencesPanel` 消费 `output`。
- 因此 P2 为 **HIGH**：直接覆盖计算投影、Bridge revision 响应、Pinia 状态和计算界面。此风险已经在实施前同步给用户；任何 P2 代码变更必须通过下述真实 LuaJIT、HTTP、Store 和 Web 门禁。

#### 官方对照与必须删除的违规路径

| 位置 | 已确认问题 | 官方/铁律依据 | P2 处置 |
|---|---|---|---|
| `real-calc-adapter.lua:700-1057` `projectDpsPipeline` | 调用 `Sum`/`More`，手工计算暴击、元素均伤和 DPS，且填充 `150`、`1`、`4.0`、`100` 等默认值。 | `GEMINI.md` 只允许 `actor.output`、`actor.breakdown`、`modStore:Tabulate` 的 1:1 透传。 | 整个函数及 `dpsPipeline` 返回字段删除，不以等价公式重写。 |
| `real-calc-adapter.lua:1059-1135` `formatDisplayValue` | 使用 `Combine` 并手工累加/相乘 `{n:mod:...}` token。 | 即便官方 UI 有该显示逻辑，适配层白名单不含 `Combine`。 | 只允许读取 `{output:...}` 的同 actor 原值；`mod` token 不生成数值。 |
| `real-calc-adapter.lua:1137-1275` `projectBreakdown` | fastMode 仍完整遍历 section、breakdown、来源；还自造半径/倍率文字。 | 官方以 `CalcsTab:CheckFlag` 选择可见项，breakdown 直接来自 actor；不得自造数据。 | fastMode 完全不进入 breakdown/Tabulate；全量时仅投影可见的官方 breakdown 和精确一次 Tabulate。 |
| `CalcsPanel.vue:1468-1690` | `dpsPipeline` 回退、零对象、前端数值组合/格式化推导和来源累加。 | 前端零业务数学、无伪造兜底。 | 改为直接显示当前 revision 官方 output 与官方 breakdown；字段缺失显示空白。 |
| `buildStore.ts:295-303,607` | 可保留旧 `skillBreakdown`、合并旧 `stats` 到新 revision。 | 当前 revision 不得显示旧计算结果。 | 任一成功 mutation 必须原子替换 output，并清空未随响应返回的 breakdown。 |

#### 分步最小执行顺序

1. **P2-A 测试先行，未改业务代码前完成。** 将现有“19 次 Tabulate”预期替换为普通 mutation 的 `Tabulate=0`、`AddItemTooltip=0` 语义计数；增加 sentinel fixture，令 `Sum`/`More`/`Combine` 抛错后仍验证纯 `actor.output`/`actor.breakdown` 路径；扩展严格门禁，准确扫描 Lua 投影和 CalcsPanel 计算段而非宽泛全文件误伤。
2. **P2-B 纯透传与陈旧状态清理。** 删除 `projectDpsPipeline`、手工 `formatDisplayValue` 的 mod 合成、手工文本/默认值；普通 mutation 的 fast projection 不构造 `skillBreakdown`，Store 无条件清空旧 breakdown 并整替换当次 output。此步不得引入缓存、前端公式或 response revision 例外。
3. **P2-C 契约验收。** 真实 LuaJIT 对比同一 actor 的 `TotalDPS`、`AverageHit`、`Speed`、`CritEffect`、`TotalDot`、`IgniteDPS`、`ManaCost` 等实际存在字段；缺失字段必须保持缺失。HTTP/Store 验证 build、装备、技能连续 revision 只接受 `n -> n+1`，旧 revision detail 不可留存。
4. **P2-D 性能台账。** 固定非空公开 canonical XML fixture，记录 SHA-256、PoB/LuaJIT 路径、预热、至少 7 次样本、P50/P95、`BuildOutput`/`SaveDB`/Tooltip/Tabulate 调用计数和响应字节数。时间数据只在同机对照，CI 只断言确定性的语义计数。

**P2 的明确停线条件：** 任一官方数值不相等、缺失字段被补为 `0/1/100/150`、旧 revision 的 breakdown 残留、普通 mutation 出现 Tooltip/Tabulate、翻译词典门禁失败、或真实 LuaJIT 失败，均标记“阻断”，回填原因而不是进入 P3。P3 的按需 Tooltip/Breakdown endpoint 在 P2 全部通过前不得开始。

#### P2 审计记录

| 时间 | 操作 | 输入/证据 | 退出码 | 结果/准入结论 |
|---|---|---|---|---|
| 2026-09-02 | GitNexus 预编辑影响分析 | `npx gitnexus analyze`；对 `projectDpsPipeline`、`projectBreakdown`、`projectBuild`、`commitBuildChanges`、`calculate` 运行 upstream impact/context；对 `/api/build/commit`、`/api/import` 运行 API impact。 | 0；图谱查询无匹配 | 索引工具无法覆盖 Lua 局部函数/路由，不能将空结果解释为 LOW。源码调用审阅、真实 LuaJIT、HTTP 和 Store 契约列为强制补偿；P2 评估为 HIGH。 |
| 2026-09-02 | 官方对照与消费者审计 | 官方 `CalcsTab.lua:414-497`、`CalcBreakdownControl.lua:117-309`、`CalcSectionControl.lua:164-216`、`ModStore.lua:245-255`；Web/Bridge/Lua 全文调用点审阅。 | 0（只读） | 确认删除手工 pipeline 才能同时满足性能和 `GEMINI.md`；确认 Calcs/Defences 的明细必须按当前 revision 透传，不能保留旧对象。P2-A 可以开始。 |

#### 2026-09-02 纠偏：模板冻结与兼容投影

本轮曾错误地将“删除手工计算”扩大为替换 `CalcsPanel` 的完整伤害模板。用户已明确拒绝：**PoB 原始数据的用途是保证数值真实，不是取代本项目的计算界面。** 原 1722 行模板已从本次会话的持久 FileChange 审计记录精确恢复；恢复内容 SHA-256 为 `62a8ecc1f7ce0771a424f494e5491c5556527dc358572681eb252678301b8950`，`npm run web:typecheck` 退出码为 0。

自本记录起，P2/P3 必须遵守以下额外硬边界：

1. 不删除、不替换、不降级 `CalcsPanel` 的模板 DOM、布局、卡片、抽屉、事件或 CSS。任何界面可见结构变化都不是性能优化，必须独立提案和用户确认。
2. 保留 `skillBreakdown.dpsPipeline` 仅作为既有模板的数据兼容 DTO；DTO 的每个数值必须逐字段直接来自当前 revision 的 `actor.output`，每个文本明细必须直接来自 `actor.breakdown`。不得调用 `Sum`、`More`、`Combine`，不得合并来源或计算新值。
3. 官方未提供的模板字段必须省略；绑定层显示空白/`-`，不能用 `0/1/100` 或临时对象填充。模板可以保留其位置和交互，不得因字段缺失而移除卡片。
4. 普通 mutation 只构造上述轻量 DTO，严禁构造完整 breakdown、`Tabulate` 来源或 item Tooltip。只有用户显式打开对应明细后，后续 P3 才允许同 revision 按需请求。
5. 每一项性能改动先做模板哈希/关键锚点和页面冒烟，再做 LuaJIT、HTTP、Store 与性能计数验收。任一模板锚点消失即阻断并先恢复界面。

#### 2026-09-02 PERF-P2-B 兼容 DTO 实施中

- **变更目标（最小范围）**：仅在 `real-calc-adapter.lua` 恢复 `skillBreakdown.dpsPipeline` 的轻量兼容 DTO，使既有 `CalcsPanel` 可继续读取本次 revision 的数值；不触碰组件模板、DOM、样式、抽屉或事件。
- **数据契约**：DTO 只逐字段复制当前选中 actor 的 `actor.output`（含 `TotalDPS`、`TotalDot`、`AverageHit` 和五类元素的 `Min/Max/HitAverage`）。没有值即省略；不得调用 `Sum`、`More`、`Combine`，不得提供非零常数、来源聚合或公式推导。已核对官方 `CalcOffence.lua:4313-4316`，拒绝 `HitDPS`、`*HitAvg`、`*DPS` 等官方未写入的伪字段；法力回复仅使用官方展示标量 `ManaRegenRecovery`。
- **性能契约**：普通 build/equipment/skill/config mutation 仅返回空 sections 加该 DTO；仍不得进入完整 breakdown、`modStore:Tabulate` 或 item Tooltip 路径。
- **GitNexus 预编辑记录**：对 `projectBuild`、`projectBreakdown` 及 `Adapter` 的 upstream impact 均返回 `Target not found`，说明当前索引不覆盖 Lua 局部函数和 Adapter table。不能按 LOW 处理，按 **HIGH** 风险执行；补偿验收必须包含 LuaJIT、HTTP、Store、Web 构建和模板 SHA/锚点检查。
- **测试先行状态**：`real-calc-adapter.spec.mjs` 已以官方 fixture 建立红灯，普通 `commitBuildChanges` 要求 DTO 返回 `777/555/10/20/15/30`，并要求不存在 `incDamage`/`critMultiBase`。本实施完成后先运行该测试；任一失败即阻断，不能进入 P3。

| 时间 | 操作 | 修改文件与符号 | 验证命令与结果 | 结论 |
|---|---|---|---|---|
| 2026-09-02 | DTO 恢复与官方字段复核 | `real-calc-adapter.lua`：新增 `projectDpsPipeline`；`projectBreakdown` 与 `projectBuild(fastMode)` 均附带 DTO。`CalcsPanel.vue` 未修改。 | 对照 `src/Modules/CalcOffence.lua:4313-4316`，五系均伤仅取 `*HitAverage`；`HitDPS`、`*DPS`、`ManaCostPerSecond` 等未由官方 output 写入的字段不返回。`ManaRegen` 只映射官方 `ManaRegenRecovery`。 | 仅恢复显示数据契约；没有恢复任何手工公式或假数据。 |
| 2026-09-02 | 快速 mutation 契约 | `real-calc-adapter.spec.mjs`、`strict-data-integrity.spec.mjs` | `node --test cn/tests/bridge/real-calc-adapter.spec.mjs cn/tests/m3/strict-data-integrity.spec.mjs cn/tests/web/canonical-build-store.spec.mjs`：31 pass，9 legacy skip，0 fail；断言普通 mutation 的 `Tabulate=0`、`AddItemTooltip=0`。 | 通过。兼容 DTO 只复制当前 actor.output；无来源聚合、无 Tooltip、无完整 breakdown。 |
| 2026-09-02 | 模板冻结核验 | `CalcsPanel.vue` 只读核验 | SHA-256：`62a8ecc1f7ce0771a424f494e5491c5556527dc358572681eb252678301b8950`；`skillMeta`、`hitDamagePipelineList`、`allCardsMap` 三个锚点均存在。 | 通过。原计算页面结构未被再次更改。 |
| 2026-09-02 | 真实核心与 Web 验证 | 无额外业务代码 | `node --test cn/tests/bridge/official-crafting-headless.integration.spec.mjs`：1 pass；`npm run web:typecheck`：0；`npm run web:build`：0。 | 通过。接下来仅允许进行服务重启和浏览器冒烟；P3 仍未准入。 |
| 2026-09-02 | 页面装配恢复 | `App.vue` 的 `CALCS` 分支从错误的 `DefencesPanel` 改回已恢复的 `CalcsPanel`；未删除 `DefencesPanel.vue`。 | 浏览器首次 DOM 冒烟证明伤害卡片缺席，源码确认该分支错误装配。GitNexus 对 `DefencesPanel` upstream impact：LOW，0 direct / 0 process；`App` 与 `CalcsPanel` 未被图谱识别，按关键页面路径进行后续浏览器验收。 | 恢复用户原有伤害计算页面的唯一必要装配改动。 |
| 2026-09-02 | 唯一词典门禁校正 | `strict-single-dictionary.spec.mjs` | 全量 M3 首次运行仅此门禁失败，原因是它要求不存在的 `sourceText(...)` 包装；实际面板直接调用从 `webTranslation.ts` 导入的共享 `translateSourceType`，后者读取唯一生成词典。门禁改为匹配真实共享调用，不改 `CalcsPanel`。 | 保持面板 SHA 不变，修复测试的错误前提；仍需重新运行全量 M3。 |
| 2026-09-02 | 恢复后全量门禁 | 全工作区 | `npm run test:m3`：91 pass，9 legacy skip，0 fail；`CalcsPanel.vue` SHA-256 仍为 `62a8ecc1f7ce0771a424f494e5491c5556527dc358572681eb252678301b8950`；此前 `npm run web:typecheck`、`npm run web:build` 均为 0。 | 通过。唯一词典、严格数据、真实 HeadlessWrapper、Bridge、Store、制作与页面契约均未回归。 |
| 2026-09-02 | 服务与浏览器冒烟 | 新启动 Bridge / Vite 本地进程 | `GET http://127.0.0.1:3002/health`：200 `{"ready":true}`；`GET http://127.0.0.1:3000/`：200；浏览器点击 `CALCS` 入口后 DOM 同时包含“综合总输出秒伤”和“各元素击中伤害构成”，控制台 error 为 0。 | 通过。用户可在 `http://127.0.0.1:3000/` 实测已恢复的伤害页面。 |
| 2026-09-02 | GitNexus 变更范围复核 | 共享脏工作区 | `gitnexus_detect_changes({scope:'all'})` 返回 `Git diff failed: spawnSync git ENOBUFS`。 | 未通过且不可作为本轮范围证明；原因是全仓历史累计差异过大。已用本表的逐符号 pre-impact、定向测试、真实 LuaJIT、全量 M3、Web 构建和浏览器冒烟补偿。拆分为干净变更集后仍需重跑该命令，当前不得据此提交。 |

### 每阶段固定验收与回填格式

每个阶段结束必须在本节追加：修改文件与符号、GitNexus impact 输出摘要（直接调用者/受影响流程/风险）、输入 fixture 的来源、逐条命令、完整退出码、自动化结果、浏览器手工结果、性能数据、未覆盖情形和明确的下一阶段准入结论。任一失败项必须标记为“阻断”，不可写作已完成。

本计划不取代制作正确性验收矩阵；性能优化后的任何 mutation 仍必须经过 `npm run test:m3`、`npm run web:typecheck`、`npm run web:build` 和相关真实 LuaJIT 集成测试。提交前还必须运行 `gitnexus_detect_changes()`；若共享工作树的历史差异触发 `ENOBUFS`，须在本文记录实际错误，并在拆分后的干净变更集重新执行，不得伪称通过。

### PERF-P3：交互延迟与全量投影开销（已完成自动化验收，待用户实测）

#### 2026-09-02 重新取证结论

- 同一 Bridge 会话的连续写入不会重复 `loadXML`；热点仍是每次官方 `BuildOutput -> SaveDB -> projectBuild(fastMode)`、完整 JSON 返回，以及 Store 对全量投影的同步处理。冷导入/刷新则无条件 `loadXML`，因此是另一条必须独立处理的路径。
- `officialProjectionState` 先调用 `localizeImportedBuild`，后者已本地化 `socketGroups`；当前代码又对该结果调用一次 `localizeImportedSocketGroups`。这是无语义价值的重复遍历、复制和翻译，可在不改变输出形状的前提下删除。
- 连续天赋点击目前严格排队为 N 个完整 revision；每一次都等待官方计算、导出和全量投影。原 P1 已将单点从整树导入缩短为官方 `AllocNode/DeallocNode`，但 N 连点仍近似 N 倍延迟。
- `PassiveTreeCanvas` 的一次绘制扫描 4,863 条连线两次及全部节点；单次点击会同时触发乐观状态、官方投影状态和直接绘制，可能形成 2--3 次同帧全量绘制。

#### P3 事务与回归边界

1. **P3-A，低风险**：移除已经由 `localizeImportedBuild` 完成的第二次技能组本地化；增加 Store 契约测试，证明技能组仅经过一次本地化且投影值不变。
2. **P3-B，HIGH 风险**：将紧邻的天赋点击收集为一个有序 `passiveNodes` 官方意图批次，单批只执行一次 `BuildOutput`、`SaveDB` 与投影。前端继续立即显示点击结果；每个批次只携带最后意图，调用者仍使用相同的官方 `/api/build/commit` revision 契约。成功投影后必须重放尚未提交意图；失败时仅按最后已确认官方节点集回滚该批，不能抹掉后续点击。
3. **P3-C，CRITICAL 图谱影响但内容不变**：不修改 `drawCanvas` 的画布内容、节点、连线、样式或命中逻辑；仅把天赋状态变化和点击后的冗余直接调用合并为每帧至多一次既有绘制。搜索、拖拽、缩放、重置和尺寸调整的直接绘制保持原语义。
4. **明确不做**：不得缓存旧 revision 的 `output`/breakdown，不得跳过官方计算，不得局部伪造 build 投影；装备、技能、导入/刷新 scoped projection 与刷新会话命中优化必须先有独立的官方字段影响域和真实大 Build 分段基准，不能混入本批。

#### 预编辑影响分析

| 符号/路径 | GitNexus upstream | 风险与补偿 |
|---|---|---|
| `officialProjectionState` / `applyOfficialProjection` | 图谱显示 0 direct / 0 process，但索引与当前 Store 有已知差异 | 不因空结果降级；用 Store 行为测试与 Web 构建补偿。 |
| `toggleNode` | 1 direct：`PassiveTreeCanvas.handleMouseDown`，1 process | 图谱 LOW；批量变更真实影响 canonical revision，按 HIGH 执行。 |
| `drawCanvas` | 9 direct，8 process（搜索、鼠标、缩放、重置、resize） | 图谱 CRITICAL；只允许 rAF 合帧包装，现有绘制函数内容不得改动，需浏览器验收。 |
| Lua `commitBuildChanges` / HTTP `/api/build/commit` | 当前索引未识别 | 按 HIGH；必须 Lua adapter 单元、真实 HeadlessWrapper、HTTP revision 与全量门禁补偿。 |

#### P3 验收门禁

- Store：三次连续节点点击最多生成一个包含有序 `passiveNodes` 的官方请求；同一节点的最终意图正确；失败不会吞掉仍待提交的后续意图；revision 只能 `n -> n+1`。
- Lua：每个批次逐项调用官方 `AllocNode`/`DeallocNode`，不调用 `ImportFromNodeList`，且仅在整批后更新珠宝槽、一次 `BuildOutput`、一次 `SaveDB`。
- UI：天赋状态变更在一帧内最多调用既有绘制一次；页面仍可渲染、控制台无 error。
- 回归：`npm run test:m3`、`npm run web:typecheck`、`npm run web:build`、真实 HeadlessWrapper integration；`CalcsPanel.vue` SHA-256 必须维持 `62a8ecc1f7ce0771a424f494e5491c5556527dc358572681eb252678301b8950`。

#### P3 执行记录

| 时间 | 操作 | 修改范围 | 验证/结果 | 状态 |
|---|---|---|---|---|
| 2026-09-02 | 测试先行 | 新增 Store 单次本地化、三连点合批、失败后续意图保留；新增画布合帧静态契约；Lua batch method 契约。 | 旧实现红灯：技能组二次本地化；三连点是三个 `passiveNode` 请求；`passiveNodes` 未支持；画布无合帧。 | 通过红灯证明目标。 |
| 2026-09-02 | P3-A 投影去重 | `buildStore.ts`：`localizeImportedBuild` 的结果直接作为 `socketGroups`，移除第二次 `localizeImportedSocketGroups`。 | Store sentinel 证明 build 本地化 1 次、socket group 本地化 0 次，输出保持 build-localized 值。 | 通过。无业务字段、词典或官方输出改变。 |
| 2026-09-02 | P3-B 官方节点批次 | `buildStore.ts`、`real-calc-adapter.lua`：短时间点击收集为有序 `changes.passiveNodes`；Lua 对每项调用官方 `AllocNode`/`DeallocNode`，整批后一次 `UpdateSockets`。 | Store：3 次点击仅 1 个 revision `1 -> 2`；Lua mock：`AllocNode=2`、`ImportFromNodeList=0`、`UpdateSockets=1`。 | 通过。没有前端伤害运算、缓存数值或跳过官方计算。 |
| 2026-09-02 | 失败竞态纠错 | 首版批次实现将“已进入 canonical 队列、但尚未开始”的下一批从可见意图中提前移除；首批失败时节点 `102` 被复现为消失。 | 改为显式维护 `queuedBatches` / `activeBatch`；投影只叠加尚未确认批次。定向测试确认首批失败后节点 `102` 仍显示、随后以 revision `1 -> 2` 成功提交。 | 通过。此项直接覆盖此前连续点天赋丢点风险。 |
| 2026-09-02 | P3-C 画布合帧 | `PassiveTreeCanvas.vue`：不改 `drawCanvas` 内容，只将节点状态 watcher 与 click 后的冗余调用改为 `requestAnimationFrame` 单帧合并；卸载时取消帧。 | 图谱原评为 CRITICAL（9 direct/8 process）；静态契约、类型检查和浏览器天赋树烟测通过。搜索/拖拽/缩放/重置/resize 仍直接调用原 painter。 | 通过。 |
| 2026-09-02 | 真实核心 | `official-crafting-headless.integration.spec.mjs`：真实新 Build 选择两个相连官方节点，批次提交并 XML 重载。 | `AllocNode=2`、`ImportFromNodeList=0`、`BuildOutput=1`、`SaveDB=1`；两个节点均在提交投影和官方 XML 重载后存在。 | 通过。 |
| 2026-09-02 | 隔离 HTTP 性能基准 | 新 Bridge `127.0.0.1:3004`，真实 LuaJIT、空白官方 Build、节点 `56651` 后接 `35234`、每模式 5 次；不触碰用户 `3000/3002`。 | 两个单独提交样本 `184,152,164,160,145ms`，P50 `160ms`；一个两节点 batch 样本 `85,90,75,98,107ms`，P50 `90ms`。完整响应约 `109.6KB`，未因 batch 增长。 | 批量 P50 降低约 `44%`。该小 Build 数据不能外推为用户大 Build 的绝对毫秒。 |
| 2026-09-02 | 完整回归 | 全工程；`CalcsPanel` 仅 SHA 检查。 | `npm run test:m3`：95 pass / 9 legacy skip / 0 fail；`npm run web:typecheck`：0；`npm run web:build`：0；真实 HeadlessWrapper：0；浏览器天赋页正常渲染、console error=0；`CalcsPanel` SHA-256 为冻结值。 | 通过。 |

#### P3 准入结论与剩余根因

P3 可以进入用户实测：连续点天赋不再按点击数线性触发完整官方回合，同帧画布重绘已合并，且失败竞态已经有回归门禁。它不会改变装备、技能、制作、计算面板模板或任何官方数值。

装备装卸、技能编辑和刷新仍未宣称“解决”：它们每次仍生成并传输全量 `projectBuild(fastMode)`，Store 仍对整库物品、所有 loadout 与技能组执行本地化和状态替换；刷新仍无条件 `loadXML`。`saveToStorage` 已只持久化 canonical code，排除为本轮主因。下一阶段必须用用户大 Build 的分段数据验证 Lua projection、JSON 字节/解析、`localizeImportedBuild` 和首次 `loadXML` 的占比后，再为各 mutation 定义经官方语义证明的 scoped projection；不得直接保留旧 revision 的 stats、breakdown 或未证实的领域字段。

### PERF-P4：用户大构筑分段观测准备（2026-09-03）

#### 目标、范围与非目标

- 本阶段只建立可关闭的观测链，不实施 scoped projection、缓存、字段裁剪或计算路径修改。官方 `BuildOutput`、`SaveDB`、XML/revision 契约、Lua 适配层、物品/技能/天赋业务语义和计算页模板均未修改。
- 只有地址栏显式含 `?pobPerf=1` 时，浏览器才附带无内容的请求 ID。默认地址、自动化测试和正式业务请求不会发送 ID、不会产生观测请求。
- Bridge 最多保留 64 个内存样本；样本仅含路径、排队时间、核心 action 总耗时、session `cache-hit/load-xml` 状态、HTTP JSON 字节数，以及浏览器的响应到达/JSON 解析/投影/下一帧耗时。绝不记录 PoB 分享码、XML、角色名、物品、技能、词典文本或计算数值。
- 浏览器在既有响应已处理且下一帧到达后以不等待的 `keepalive` 请求写入本地 Bridge；其耗时不属于也不阻塞原 mutation。此阶段不能分解 Lua 内部 `BuildOutput`、`SaveDB` 与 `projectBuild`，只将它们诚实地归入同一个 core action；若 core action 成为真实大构筑瓶颈，再在隔离环境单独增加官方调用计数。

#### 预编辑影响分析与风险处置

| 符号/路径 | GitNexus upstream | 风险与本阶段补偿 |
|---|---|---|
| `createBridgeHttpServer` | LOW；1 个直接调用者 `service.mjs` | 仅增加显式 probe 的计时元数据和 `/api/performance` 诊断接口；非 probe 的 HTTP body/状态/核心请求保持不变。 |
| `send` | LOW；直接 `createBridgeHttpServer`，并间接影响 `service.mjs` | 仅 probe 响应多一个标准 `Server-Timing` header；原 JSON 序列化语义不变。 |
| `importBuildFromCode` / `ensureCanonicalBuildLoaded` | LOW；各 1 个图谱测试调用者 | 默认关闭，启用时只加 header 与异步计时上报；导入、恢复、投影顺序不变。 |
| `commitOfficialItemAssignment` | CRITICAL；3 个直接调用者、6 条装备/珠宝流程 | 不改调用者、payload、revision 校验、投影或失败处理；只在显式 probe 下合并一个 header，并用装备回归、Store 契约和全量 M3 补偿。 |
| `commitOfficialSkillChange` | HIGH；技能 `run` 入口及 4 条技能编辑流程 | 不改调用者、payload、revision 校验、投影或失败处理；只由共用 mutation 路径在 probe 下加 header，并用技能回归、Store 契约和全量 M3 补偿。 |
| Lua `projectBuild` / mutation 局部函数 | GitNexus 未索引 | 按 HIGH 处理但本阶段不修改 Lua；绝不将 Bridge 外层时间伪称为 Lua 内部阶段。 |

#### 执行记录

| 时间 | 操作 | 修改范围 | 验证/结果 | 状态 |
|---|---|---|---|---|
| 2026-09-03 | 测试先行 | `http-server.spec.mjs`、`canonical-build-store.spec.mjs` 新增显式 probe 契约。 | 原实现红灯：无 `Server-Timing` header、没有浏览器 probe ID 或 telemetry。 | 通过红灯证明观测只在显式开关下工作。 |
| 2026-09-03 | Bridge 观测链 | `http-server.mjs`：对带 `x-pob-performance-id` 的请求记录 queue/core/total/responseBytes、`ensureLoaded` session 状态，返回标准 `Server-Timing`；新增本地 `GET/POST /api/performance`。 | Bridge 单测 14 pass、0 fail。断言记录只含 timing metadata，不含 XML/分享码；默认无 probe 时没有 header。 | 通过。 |
| 2026-09-03 | 浏览器观测链 | `buildStore.ts`：仅 `?pobPerf=1` 时在 import、restore、通用 canonical mutation、装备分配、制作请求上附 ID；在投影后下一帧异步发送 timing。 | Store 单测 16 pass、0 fail；断言 import telemetry 不含 canonical XML，且默认请求契约不变。 | 通过。 |
| 2026-09-03 | 隔离真实核心冒烟 | 新 Bridge `127.0.0.1:3004`、新建空白官方 Build；未接触正式 `3000/3002` 会话。 | `POST /api/import`：HTTP 200；`Server-Timing` 显示 queue `0.9ms`、engine `1458.1ms`、total `1464.4ms`；记录 `loadXML` `1458.1ms`、response `198119` bytes。隔离进程已停止。 | 通过计时链验证；空白 Build 仅验证采样，不代表用户构筑性能。 |
| 2026-09-03 | 回归门禁 | 全工程；`CalcsPanel.vue` 仅哈希检查。 | `node --test cn/tests/bridge/http-server.spec.mjs`：14 pass；`node --test cn/tests/web/canonical-build-store.spec.mjs`：16 pass；`npm run web:typecheck`：0；`npm run test:m3`：97 pass / 9 legacy skip / 0 fail；`npm run web:build`：0；`CalcsPanel.vue` SHA-256：`62a8ecc1f7ce0771a424f494e5491c5556527dc358572681eb252678301b8950`。 | 通过。 |
| 2026-09-03 | 正式服务重启 | 仅替换原 Bridge `127.0.0.1:3002` 进程；Vite `3000` 保持运行。 | 新 Bridge PID `35388`；`GET /health`：200 `{"ready":true}`；`GET /api/performance`：200 `{"success":true,"data":[]}`。 | 通过。用户构筑未通过 API 读写，等待显式 performance mode 手测。 |

`gitnexus_detect_changes({scope:'all'})` 仍不作为通过证据：共享脏工作区此前在该命令上返回 `spawnSync git ENOBUFS`，且本阶段未提交。没有伪称变更图谱全量扫描通过；提交前须在拆分后的干净变更集重跑。

#### 用户采样准入

1. 正式服务重启后以 `http://127.0.0.1:3000/?pobPerf=1` 打开当前最慢的大构筑，并先导出分享码作为可回退副本。
2. 完成一次装备更换、一次技能/宝石修改、连续三个天赋点击，待界面稳定后按 `F5`；每项只执行一次，避免把排队行为误判为单次耗时。
3. 读取同一 Bridge 的 `/api/performance` 样本，按 `engine`、`responseBytes`、`responseJsonMs`、`projectionMs`、`requestToNextFrameMs` 判断下一步。未取得这组真实样本前，PERF-P4 不准入 scoped projection 或刷新会话复用实现。

#### 用户大构筑采样结果与结论（2026-09-03）

本节只记录性能元数据，不记录用户 PoB 分享码、XML、装备、技能或数值。P50/P95 采用 nearest-rank；刷新仅有 2 个样本，故只报告范围。

| 操作 | 成功样本 | 官方 core action | core P50/P95 | 到下一帧 P50/P95 | JSON 解析 P95 | 投影 P95 | 响应 P50 |
|---|---:|---|---:|---:|---:|---:|---:|
| 天赋/构筑提交 | 14 | `commitBuildChanges` | `443.6 / 1649.3ms` | `532.0 / 1707.2ms` | `23.3ms` | `4.2ms` | `302625` bytes |
| 技能修改 | 12 | `commitSkillChange` | `259.9 / 391.8ms` | `361.6 / 455.3ms` | `16.1ms` | `4.1ms` | `302659` bytes |
| 装备装卸 | 4 | `assignOfficialItem` | `375.2 / 498.7ms` | `432.3 / 549.5ms` | `26.4ms` | `3.7ms` | `297902` bytes |
| 刷新恢复 | 2 | `loadXML` | `4025.0 - 7083.6ms` | `4323.5 - 7381.1ms` | `51.7ms` | `210.2ms` | `708468 - 718999` bytes |

- **根因已确认：** 刷新秒级等待的主体是官方 `loadXML`，而非浏览器 JSON 解析、Pinia 本地化或下一帧绘制；两次刷新中 core 分别占约 93% 与 96%。当前无条件 `/api/import` 是直接原因。
- **次级结论：** 装备、技能、天赋的正常路径均是官方 core action 主导。`projectBuild` 全量响应约 300KB，但本次浏览器解析和投影没有出现主要瓶颈；在没有新的官方字段影响域证明前，不准为了数毫秒裁剪完整投影或保留旧状态。
- **异常单列：** 另有 3 次 `build/commit` 返回 `422 POB_CANONICAL_REVISION_CONFLICT`，core action 均为 0；其排队时间为 `14.8/275.9/1097.7ms`。现有隐私最小化记录未保存 expected/active revision，不能断言是单页队列错误、旧页面还是并发来源；不得把这些失败样本并入成功性能统计，也不得据此弱化 revision 校验。

### PERF-P5：精确会话恢复，跳过刷新 XML 重载（已实施并验收，2026-09-03）

#### 最小设计

1. 新增受限 Bridge 恢复路径，只接收 canonical `code` 与当前 `revision`。若且仅若 active session 的规范化 XML fingerprint 和 revision 都精确相等，调用新的 Lua `projectCurrentBuild` 从**当前官方 Build**执行一次官方 `BuildOutput` 和完整官方投影；不重用旧 HTTP response、旧 `output` 或旧 `breakdown`。
2. 若 Bridge 重启、fingerprint 不同、revision 不同、重投影失败，恢复路径必须走现有完整 `loadXML` 导入；不得接受近似匹配、不得将 revision 重置或伪装为命中。
3. `importBuildFromCode` 保持既有显式导入语义和 revision `1`；只修改页面刷新用的 `ensureCanonicalBuildLoaded`。成功恢复必须保留用户保存的 canonical revision，而不是把同一 XML 降为 revision `1`。
4. Lua Adapter 只能调用官方 `BuildOutput`、读取当前 `actor.output`/`actor.breakdown` 并调用既有 `projectBuild`；不引入前端计算、缓存数值、手工 DTO、`SaveDB` 延迟或字段裁剪。
5. `revision-conflict` 继续 fail-closed。本阶段不借“恢复性能”掩盖或自动覆盖另一来源的 canonical 文档；冲突来源待后续最小化 revision telemetry 或可复现步骤确认。

#### 风险、测试与准入

- GitNexus：`ensureCanonicalBuildLoaded` 与 `createBridgeHttpServer` upstream 为 LOW（各 1 个直接调用者）；Lua `execute`、`projectBuild`、`calculate` 未被索引，按 **HIGH** 风险执行，不能以 `Target not found` 降级。
- 先建立红灯：Lua 命中恢复必须 `BuildOutput=1`、`loadBuildFromXML=0`，返回当前官方完整投影；HTTP 命中只发送 `projectCurrentBuild`，miss 只发送 `loadXML`；Store 必须把 bridge canonical version 恢复为返回 revision，且显式 import 保持原有 `1`。
- 验收：Lua mock、真实 HeadlessWrapper、HTTP revision、Store、`npm run test:m3`、`npm run web:typecheck`、`npm run web:build`、冻结 `CalcsPanel` 哈希、正式服务冒烟。真实 HTTP 同一 active session 命中必须记录 `engine` action 中无 `loadXML`，且恢复投影只来自同一 fingerprint/revision 的官方核心。

#### 实施与验收记录（2026-09-03）

1. Bridge 新增 `/api/restore`。它仅在规范化 XML fingerprint 与 canonical revision 均匹配当前会话时调用 `projectCurrentBuild`；其它情况仍调用 `loadXML`。命中重投影缺少完整对象时也强制回退 `loadXML`，不能把不完整或旧投影交给页面。
2. Lua Adapter 新增 `projectCurrentBuild` action：对 retained official Build 执行一次官方 `BuildOutput` 后复用既有完整 `projectBuild`；不读取先前 HTTP 响应，不缓存数值，不执行前端计算或手工 DTO 拼装。
3. 页面刷新只由 `ensureCanonicalBuildLoaded` 调用 `/api/restore`，并要求返回 revision 与保存的 canonical document 精确一致。显式导入仍走 `/api/import` 并从 revision `1` 开始；Bridge 重启后的首次恢复仍完整 `loadXML`。
4. GitNexus 复核：`ensureCanonicalBuildLoaded` 上游 `0`，风险 LOW；`createBridgeHttpServer` 仅 `service.mjs` 一个直接调用者，风险 LOW。`execute` 与 `projectBuild` 未被索引，按 HIGH 风险通过 Lua mock、真实 HeadlessWrapper 和完整 M3 约束验收。
5. 定向测试：Bridge `16/16`、Lua Adapter `17 pass / 9 skip / 0 fail`、Store `16/16`。其中覆盖命中只发 `projectCurrentBuild`、miss 只发 `loadXML`、缺投影成功响应也回退重载、Store 保留 revision。
6. 完整门禁：`npm run test:m3` 为 `99 pass / 9 legacy skip / 0 fail`，包含真实 LuaJIT + HeadlessWrapper；`npm run web:typecheck`、`npm run web:build` 均通过。`CalcsPanel.vue` SHA-256 保持 `62a8ecc1f7ce0771a424f494e5491c5556527dc358572681eb252678301b8950`。
7. 隔离真实 HTTP：用空白官方 Build 的 canonical XML 在独立 `127.0.0.1:3004` 验证，冷恢复的 response action/engine action 都是 `loadXML`；相同 code + revision 的第二次恢复都为 `projectCurrentBuild`，且两次均返回完整当前投影。隔离 Bridge 已停止，未读取用户构筑数据，也未影响正式 `3002`。
8. 正式服务冒烟：已仅重启 `127.0.0.1:3002` 的 Bridge 及其 Lua 子进程；新进程健康检查返回 `ready: true`。`3000` Web 开发服务未重启。正式大构筑的冷恢复与同会话刷新样本仍由用户验收后再记录。
9. 页面路由回归纠正：一次错误装配曾将 `CALCS`（用户已确认的“生存与防御”工作区）渲染成技能伤害 `CalcsPanel`。现已仅在 `App.vue` 恢复 `CALCS -> DefencesPanel`；`CalcsPanel` 继续只由 `SkillsPanel.vue` 嵌入。没有修改任一计算、投影、数据字段或样式。新增静态回归契约锁定这两个入口的隔离；浏览器实测“生存与防御”显示防御工作区，技能页显示伤害计算，控制台 error 为 0。验证：定向 4/4、M3 100 pass / 9 legacy skip / 0 fail、`web:typecheck` 通过；生产构建另行记录其最终退出状态。
10. 防御明细回归追溯：上述页面路由恢复后发现，普通 mutation 的 `projectBuild(..., fastMode=true)` 会故意返回空 `skillBreakdown.dynamicSubSections`，而防御页需要这份官方明细来填充行、抽屉和来源。此前完整 M3 未覆盖“防御页消费 fast projection”的交叉契约，故不能把第 9 项的页面验证视作数据验收。真实 LuaJIT 新 Build 对照证实完整官方投影可返回 57 个有效分区，且 fast mutation 仍保留官方防御标量；问题是明细契约被省略，不是构筑数据删除。另发现运行中的 `3002` Lua 子进程未加载当前适配层，已精确重启 `node cn/bridge/service.mjs` 及其项目内 LuaJIT 子进程，健康检查通过。现有页面必须刷新，以保存的 canonical 文档重新加载完整官方投影；在用户实际构筑确认前，本项状态为**待用户验收**。后续修复必须保留 fast mutation，新增严格 revision 的按需官方明细请求，禁止前端公式、伪兜底或旧 revision 回填。
11. 防御明细按需恢复（实施中，2026-09-03）：为修复第 10 项而不撤销性能优化，Bridge 新增只读 `/api/calculations/detail`。请求必须携带 canonical `code` 和 `expectedRevision`；当前会话 XML fingerprint 或 revision 不一致时以 `409 POB_CANONICAL_REVISION_CONFLICT` fail-closed。命中后只调用官方 `calculate`，响应仅含官方 `output` 与包含 `dynamicSubSections` 的 `skillBreakdown`，并原样回显 `sourceRevision` / `canonicalRevision`；不导出 XML、不返回或写入新的 canonical code、不推进 revision。Store 通过既有 canonical mutation 队列串行请求，并在响应前后核验 code、revision 及官方动态分区，只有完整官方对象才原子替换 `stats` 和 `skillBreakdown`。`DefencesPanel` 不改模板、不改字段、不改路由；仅在它已挂载且官方动态分区为空时触发一次该只读恢复。真实服务审计发现 Lua `calculate` 直接返回 `{ output, skillBreakdown }`，而此前新接口错误地只识别测试桩使用的 `{ data }` 包装，致使完整真实响应被误判为不完整；现已改为兼容官方直接投影与包装投影。必须完成真实响应形状测试、完整门禁和正式服务重启后才能恢复为待用户验收。

    - 真实核心只读证据：`/api/calculate` 返回 855 个官方 output 字段、`Life=785`、`LifeUnreserved=266`、`Mana=1149`、`ManaUnreserved=1149`、`Armour=772`、`Evasion=383`，并包含 63 个官方 `dynamicSubSections`（其中 `Life`、`Mana`、`Armour` 都存在）。这证明用户截图的空值不是核心或构筑数据丢失，而是上述 Bridge 响应归一化错误。
    - 修正后定向验收：Bridge `19/19`、Store `19/19`、`web:typecheck`、`web:build` 通过。完整 M3 在本机 30 秒工具窗口中未获得最终汇总，故本项仍不以 M3 全量通过宣称完成。
    - 正式 `3002` Bridge 已精确重启为 PID `18164`，健康检查通过；`3003` 的另一套服务未触碰。待用户刷新并查看真实构筑页面。
12. 防御明细空值的最终根因与最小修复（2026-09-03）：对用户当前构筑的只读官方 `calculate` 响应已确认，官方核心仍返回 `Life=785`、`LifeUnreserved=266`、`Armour=772`，以及包含 `Life`、`Mana`、`Armour` 的 63 个 `dynamicSubSections`。空白发生在 `real-calc-adapter.lua` 的 `formatDisplayValue` 投影过程：Lua `string.gsub` 的格式 `{%d+:output:([%a%.:_]+)}` 只产生一个捕获值，但回调错误地从第二个参数读取 `outputName`；因此每一个官方 `{0:output:...}` 占位符都被替换为空字符串。修复严格限于回调改为接收唯一捕获参数；没有改 `DefencesPanel` 模板、`App.vue` 路由、`CalcsPanel`、构筑 XML、导入或任何用户数据。

    - 新增适配器回归：用官方同形格式验证 `{0:output:LifeUnreserved} / {0:output:Life}` 投影为 `266 / 785`，生命行投影为 `785`，护甲行投影为 `772`。测试夹具的数字仅用于断言官方输出占位符的纯透传，不是产品兜底或前端计算。
    - 本次定向验证：Lua Adapter `18 pass / 9 legacy skip / 0 fail`；Bridge `19/19`；Store `19/19`；严格数据完整性与唯一词典门禁 `3/3`；`web:typecheck`、`web:build` 退出成功；完整 `npm run test:m3` 退出 `0`，`107 pass / 9 legacy skip / 0 fail`。
    - 正式服务：仅 `127.0.0.1:3002` 已重启为 PID `13212`，`GET /health` 返回 `{"ready":true}`；`3003` 未触碰。由于浏览器当前没有可读取的项目标签页，不能将测试夹具或空白 Build 伪称为用户构筑验收。用户刷新真实构筑后，页面必须发起当前 canonical revision 的只读详情请求，并显示核心已经返回的官方明细；在该人工验证完成前，本项状态为**待用户验收**。

**效果边界：** P5 仅消除仍存活 Bridge 中、精确同一 canonical 文档的浏览器刷新重复 `loadXML`。它不缩短装备、技能或天赋 mutation 中官方 `BuildOutput` 的时间，不放宽 revision conflict，也不承诺在 Bridge 重启后的首次恢复提速。正式服务重启后需以用户大构筑的首次冷恢复与同会话 F5 各采样一次，才可记录真实收益。

## 非目标

- 不模拟游戏内随机制作、掉落、货币消耗、概率或交易市场。
- 不在本次修复自动升级 PoB 游戏版本或上游数据；规则基线固定为仓库内置 PoB 0.5。
- 精华、符文和腐化仅作为直接、经官方规则验证的物品编辑状态，不表示模拟一次游戏内制作操作。

## 审核建议

外部审核应先验证 C-01 至 C-05，再验证 C-16/C-17。若这七项没有真实核心集成测试和干净检出证据，界面即使能保存也不能被视为“与官方编辑器对齐”。
