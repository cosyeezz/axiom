# 开发记录

## 2026-09-20 配置按钮对齐与子代理生效分区修正

- 时间：2026-09-20；分支 `feat/config-affordance`。
- 原因：齿轮轮廓不规则，工作空间按钮被通用 icon-button 样式覆盖，与相邻「＋」交互不一致；子代理模型/思考被误归需要新会话区。
- 内容：使用标准齿轮轮廓；两按钮共用无边框尺寸、悬停显隐与背景，移除通用按钮类并修正 hover 优先级。子代理模型/思考独立展示为下次委派生效，新子任务采用当前会话压缩设置；默认配置仍只用于新会话。修正全局预算与思考跟随的说明。
- 验证：真实 Chromium 浅色/深色按钮默认、行悬停、按钮悬停计算样式一致；桌面/窄屏截图人工检查，分区标题与DOM顺序断言通过。全量819项，817通过、0失败、2既有跳过；独立只读复审无阻塞。
- 涉及文件：public/app.js、public/index.html、public/style.css、public/icons.js、tests/config-scope-ui.py、README.md、devlog.md。
- 边界：不修改运行中子任务；能力装配和重试仍为会话创建时配置，本次不实现其热更新。

## 2026-09-20 后台压缩失败诊断与重试冷却

- 内容：启动、生成、应用失败保留具体错误摘要，单行限长并屏蔽常见凭据；引文核验及其他失败按 30/60/120/240/300 秒冷却，避免每回合重复请求。
- 原因与决策：原代码吞掉异常，只显示固定失败文案且立即允许下一回合重试。保留原历史与既有状态展示，不新增定时请求；成功应用或配置变更重置计数，取消与正常跳过不计失败。
- 涉及文件：src/compaction.js、tests/compaction.test.js、README.md、devlog.md。
- 验证：覆盖失败原因、启动/应用失败、凭据脱敏、冷却递增和封顶、配置修正与成功应用后的重置；真实 HTTP 401 回归验证 SDK 错误原因与脱敏；同步最新 origin/master 后全量测试 819 项，817 通过、0 失败、2 平台跳过。

## 2026-09-20 独立动画「反向出行」

- 内容：新增独立 HTML，以内联 SVG 绘制自行车骑着鹈鹕的抽象 2D 动画，包含迈步、摆翅、飘带、空转车轮、移动地面、暂停与步速控制。
- 原因与决策：突出自行车是乘客的角色反转；使用 Linear 近黑 #010102、薰衣草紫 #5e6ad2、前景 #f7f8f8 与次要文字 #8a8f98，采用无网络依赖的单文件交付。
- 涉及文件：bicycle-rides-pelican.html、README.md、devlog.md。
- 验证：按用户要求不运行测试，不使用子任务，不参考本地已完成项目；仅进行改动范围和 Git 差异检查，未进行浏览器视觉验证。

## 2026-09-20 修正配置入口位置

- 原因：上一版只在页头路径与独立标题菜单添加按钮，遗漏用户实际操作的侧栏工作空间标题和已有会话下拉菜单。
- 内容：侧栏工作空间右侧新增配置按钮，使用该行真实 cwd，不切换会话且不触发折叠；会话原有菜单新增「配置」，非当前会话先 attach 成功后再打开，避免误改正在查看的其他会话。断线和切换中禁用入口。
- 设计：复用 workspace-header、icon-button、session-actions 和现有图标，使用 --muted、--ink、--raised token。
- 涉及文件：public/app.js、public/style.css、tests/app.test.js、README.md、devlog.md。
- 验证：前端回归覆盖侧栏入口存在、展开状态不变、保存作用域和非当前会话定向配置；同步最新 origin/master 后全量测试 816 项，814 通过、0 失败、2 平台跳过。此修复不宣称已完成 MCP/插件会话级重新装配。

## 2026-09-20 配置作用域与生效时机

- 内容：全局默认页移除工作空间枚举与目录选择；工作空间路径右侧新增配置入口，会话标题下拉新增仅当前会话配置；复用现有存储与 session.configure，按热更新、新会话、重启服务说明分区。
- 原因与决策：避免全局默认与当前会话配置混用。默认值仅影响未来新会话，删除工作空间配置回落全局但不覆盖已有会话；修正恢复时覆盖会话压缩设置的旧逻辑。当前会话的能力装配只读，重试不开放编辑，避免伪热更新；子代理模型与思考用于下次启动。
- 设计：沿用 Linear 的 --surface、--line、--muted 与既有 fieldset/弹窗样式，无新增颜色体系。
- 涉及文件：public/app.js、public/index.html、public/style.css、src/sessions.js、tests/app.test.js、tests/compaction-config.test.js、tests/defaults.test.js、README.md、devlog.md。
- 验证：独立只读复审后修正作用域回执隔离、默认值生效文案和子代理分区；同步最新 origin/master 后全量 npm test 816 项，814 通过、0 失败、2 平台跳过。前端回归包含入口隔离、恢复全局默认、当前会话保存不改全局默认；后端覆盖压缩配置跨恢复隔离。

## 2026-09-20 OP 二轮复核修复

- 原因：独立复核发现正文伪装回显、布尔配置误用、归档中断窗口、压缩 raw/projected 尺度混用及成本文案误导。
- 内容：限定回显工具来源；严格配置与互斥定位校验；临时文件完整写入同步后通过硬链接原子发布，损坏 manifest 拒绝；内容 blob 与调用引用分离且兼容旧 ID，增加取回 sliceId；跨投影有界缓存与文件变化校验；压力门槛、read_result 保留期可配置；压缩前后使用相同原始估算尺度；修正面板文案及警示。
- 决策：保留现有默认折叠年龄与旧无 manifest 归档兼容，不承诺净费用下降。启用审计时通过 request-usage 关联审计 requestId 与投影 seq、真实 usage；不将局部估算当净收益。不支持硬链接的文件系统保持 fail-open，不用非原子复制牺牲正确性。暂不实现基于预测净成本的自动调度或会话策略持久化。
- 涉及文件：src/observation-pack.js、src/compaction.js、src/pi.js、src/usage-stream.js、public/app.js、tests/observation-pack.test.js、tests/app.test.js、README.md、devlog.md。
- 验证：独立只读复审后补齐旧 manifest 自愈、缓存覆盖记账和费用日志非阻塞防重；同步最新 origin/master 后全量 npm test 816 项，814 通过、0 失败、2 平台跳过。


## 2026-09-20 Observation Pack 加固：取回粒度、完整性校验、指标口径与策略开关

- 内容：按外部审查报告 OP-01～OP-14 逐条核验后落地修复。指标口径改同尺度（取回率＝被重新取回过的不同对象数 ÷ 折叠对象数，封顶 1，另报页数/失败数/回显折叠数）；`obs_recall` 加 `limit`（默认 4KB，小于 16KB 硬上限）、`startLine`/`lineLimit` 行范围、`query`+`contextLines` 大小写不敏感检索；取回回显不再归档成新对象而是折成指回原对象的小指针；对象旁写 sidecar manifest 并在取回前校验全文哈希（等长篡改可检出，结果按 size+mtime 缓存）；取回起点落在多字节字符中间时前移到字符边界并如实回报 offset；单行超摘录预算时 placeholder 退回 UTF-8 安全的字节截断，不再出现头尾摘录全空；折叠年龄改为纯推导（删掉可变 sentCounts）；归档推迟到首次真正折叠时才写盘；ledger 补 `runId`/`agentId`/`configVersion`、投影汇总（含最早折叠位置＝前缀缓存最早失效点）、供应商响应事件与取回失败事件；阈值等 8 项策略提为可配置并可经 `AXIOM_OBSERVATION_PACK`（JSON）覆盖；压缩前丢弃「同批既有原文又有其取回回显」的纯冗余回显。
- 原因：报告 14 条经 4 个只读子代理逐条对本地代码核验，全部成立（无一条凭空编造），其中 OP-04/OP-12 部分成立、OP-07 属既有取舍。真正会伤到运行效果的是：分页取回把取回率算成 >100% 触发误报警（分子是页级调用次数、分母是对象数，口径不同尺度）、16KB 页即默认读取量让「确认一个符号」也拉回满页、取回回显超阈值后被当新材料再折一层形成多层引用、等长篡改的归档会被当证据返回、单行大结果的占位符摘录可能全空、可变计数器让取消/重试虚增材料年龄、恢复场景（sends 已超阈值）整段漏记 fold。
- 决策：不做 OP-07 的 blob/reference/slice 三层重构（架构级改动，等真实出现重复大结果的证据再说），不做 OP-04 的成批/延后折叠调度（需要 A/B 数据支撑），不让摘要吃折叠投影（摘要读原始历史是正确行为，只去掉纯冗余回显）。审查报告建议的「近期工作集保护」（最后 N 条候选永不折叠）在实现后被移除：现有「其后 assistant 消息数 ≥ fullSends」的年龄规则已经意味着模型有过两次机会处理该结果，再叠一层保护既无实测证据支撑，又会把「只有一条大结果的会话」变成永不折叠，还破坏了既有测试语义。关闭折叠时 `obs_recall` 仍注册，旧会话的旧占位符不会变成取不回的断点；无 manifest 的旧归档默认宽松放行并标 `integrity=unverified`，`strictVerify` 才拒绝。配置取值非法直接抛错，不静默回默认。
- 涉及文件：`src/observation-pack.js`（重写）、`src/pi.js`（注入 agentId 与配置、解析 `AXIOM_OBSERVATION_PACK`）、`src/compaction.js`（摘要前去冗余回显）、`public/app.js`（面板新口径与报警条件）、`tests/observation-pack.test.js`（10 → 22 项）、`tests/observation-pack-flow.test.js`（头部新增 `integrity=` 字段）、`tests/compaction.test.js`（新增 OP×压缩交叉用例）、`README.md`、`devlog.md`。
- 验证：`npm test` 全量 811 项 809 通过、0 失败（2 项存量跳过）。新增用例覆盖配置校验与 configVersion 指纹、`foldEnabled: false` 下仍可取回、回显折成指针且不新建归档对象、limit/startLine/query 三种取回粒度、manifest 等长篡改被拒与无 manifest 的宽松/严格分支、UTF-8 起点对齐、单行超预算的摘录兜底、同批重复投影逐字节一致、未折叠不写盘、恢复场景不漏记 fold、`dropRedundantRecallEchoes` 找不到原文时保留。未重启运行实例，未改 `src/sessions.js`（agentId 从既有 `selection.audit` 取）。

## 2026-09-19 请求审计与 FIFO 共享限流

- 内容：新增逐请求 SQLite 记录、全局每日聚合、会话主/子代理归属、游标分页、限额配置及历史显式回填；会话删除不级联删除审计。新增纯 FIFO 并发租约/RPM 滑动窗口、用户级认证 IPC、连接断开令牌回收及外部 pi 扩展入口。
- 原因：独立窗口分别计数不能遵守供应商总额度；JSONL 现场统计不能提供跨会话请求级审计。复用现有会话账单展示，不冒充供应商扣款。
- 决策：无优先级、无自动清理；计费失败不阻塞终态输出；超时 fail-open，因此不是严格额度保证。Google/WS 不承诺 fetch RPM。历史以启用时间分界、entry 指纹去重，只恢复现存数据，不自动导入。共享端点失败时关闭本地限额而不是假装独立限流等于全局限流；个人扩展需显式加载，不擅改全局配置。
- 涉及文件：src/{usage-store,usage-service,usage-stream,usage-backfill,request-gate,gate-ipc,shared-gate,main,pi,sessions,server,protocol}.js；public/{usage-audit,app}.js、index.html、style.css；extensions/usage-gate.ts；对应 tests、测试源码装配 helper、codebase-map 索引及 README.md。
- 验证：最终全量测试 798 项，796 通过、2 跳过、0 失败；扩展实际依赖解析冒烟、远程取消与迟到租约回收测试通过。外部扩展跳过其他扩展已接管的供应商以避免覆盖。未重启运行实例、未写用户数据库、未执行历史回填。

## 2026-09-19 移植 SoL-Pi Observation Pack：大工具结果折叠 + 面板统计

- 内容：大于 6KB 的纯文本工具结果前 2 次请求照原文发送，之后在 context 投影层替换为字节级稳定的占位符（头尾完整行摘录 + 取回指引）；原文按内容寻址归档，模型用 `obs_recall` 按 16KB 分页取回。会话运行摘要新增 `OP 折叠 N 项 · 每请求省 X tokens · 取回 M 次 (R%)` 一行，取回率超 50% 整行标红（判定线写死在展示逻辑，不靠人记）。归档随会话删除清理，ledger 只记状态转换。
- 原因：结论固化于调研轮：OP 投影层不动历史、零额外 LLM 调用、降低压缩触发频率，与 AXIOM 后台压缩互不干扰（压缩输入取 JSONL 原文）；EPR/OCC 不接、Action Fusion 另评。阈值取 6KB：本仓子代理报告实测 6 份中一半低于原版 10KB。
- 决策：移植为纯 JS 单文件而非装 SoL-Pi 插件（不引入 projectTrusted 注入面、无 typebox/pi-tui 依赖）；归档目录由 AXIOM 会话存储布局显式注入（`selection.observationsDir` → `<sha>/<id>-observations/`）而非 SDK 会话推导，删除挂靠 `remove()` 两分支与 `${id}-tasks` 同批；ledger 从「可砍」定为保留但只记 fold/recall/fail-open 转换事件（SoL-Pi 逐请求记账会随请求次数膨胀且累计口径易误读）；面板「省 X」为当前每请求实时值而非累计和；主代理与子代理共享归档目录但计数各自独立；不做结构感知摘录、不按工具名排除、obs_recall 结果同样参与折叠（统一规则）。
- 验证：`node --test tests/observation-pack.test.js` 10 项（占位符字节稳定、原消息不改写、分页拼接与原文逐字节一致、等长篡改拒用、fail-open 原文照发、重启种子、ledger 转换事件唯一、错误/图片块不折叠）；新增 `tests/observation-pack-flow.test.js` 真实 SDK 端到端（子进程 + 假 SSE 供应商，复用 goal-pi.test.js 骨架）：验证扩展经 `selection.observationsDir` 装载、obs_recall 进工具 schema、第 3 次请求后占位符替换全文、归档落盘、obs_recall 被“模型”实际调用并分页回原文、`runtime()` 面板字段与 ledger fold/recall 事件，以及未注入 observationsDir 的会话不装载扩展；全量 `node --test "tests/*.test.js"` 756 项 754 通过 0 失败（2 项存量跳过）；索引重建后 `codebase-index.test.js` 回绿。集成测试踩坑两处：fake SSE 脚本数组须按全局请求计数索引（改成 shift 队列）；同会话两次 tool call 须不同 id（否则 SDK 拒重复 id，不再续跑）。
- 涉及文件：`src/observation-pack.js`（新）、`src/pi.js`、`src/sessions.js`、`public/app.js`、`public/style.css`、`tests/observation-pack.test.js`（新）、`tests/observation-pack-flow.test.js`（新）、`.pi/skills/codebase-map/scripts/reindex.mjs`、`.pi/skills/codebase-map/INDEX.md`、`README.md`、`devlog.md`。

## 2026-09-18 索引脚本跳过 __pycache__

- 原因：`.gitignore` 已忽略 `__pycache__/`（`835767e` 顺手加的），但 `reindex.mjs` 的 `SKIP` 集只有 `node_modules`。跑过 `python tests/*-ui.py` 后 Python 重建字节码，重建索引就把 `.pyc` 当成「165 行的 node --test 测试」登记进 INDEX.md，让被跟踪的索引凭空多出假条目、产生脏 diff。实测确认：造一个 pyc 再 reindex，INDEX.md 立刻多一条。
- 决策：`SKIP` 加入 `__pycache__`，README 的 codebase-map 段注明扫描跳过 `node_modules` 与 `__pycache__`。
- 并行处理说明：本分支原本也做了「加 .gitignore + `git rm --cached` 删误入库的 pyc」，与 `835767e` 撞同一件事；合并 master 后那部分归其所有，这里只保留索引脚本这一处独有修复。
- 验证：重建索引 215 个文件、零 `__pycache__` 条目；`npm test` 744 项全绿；`python tests/goal-ui.py` 通过。
- 涉及文件：`.pi/skills/codebase-map/scripts/reindex.mjs`、`.pi/skills/codebase-map/INDEX.md`、`README.md`、`devlog.md`。

## 2026-09-18 修回 6 个浏览器验收脚本：折叠态、CSP eval 与模块注入

- 起因：为「折叠态只留运行摘要」另开分支时逐个重跑浏览器脚本，翻出一批失败。发现远端 `master`（`c327e3f` + `b2306c4`）已实现同一需求，遂弃掉重复的产品改动，只把这批脚本修复搬过来。
- `tests/conversation-ui.py`（真竞态，折叠高度变化暴露）：`load()` 展开全部分组会触发 transcript 自动滚到底，而 `tooltip.js` 按设计「滚动即关闭」。折叠高度变化前这次滚动落在 hover 前 8ms（`current` 尚未建立，关闭无效）侥幸躲过；变高后推迟到 43ms，正好落进 500ms 显示延迟里把提示掐死。改法是 `load()` 末尾加 `settle()`：等 `#transcript.scrollTop` 连续两帧 rAF 不变再往下跑，而不是放宽断言。教训：靠帧数差侥幸通过的断言，早晚被一次无关的布局改动撞翻。
- `tests/session-billing-ui.py`、`tests/frontend-regions-ui.py`、`tests/dev-vite-ui.py`：都在等 `#model:enabled` 之类折叠态隐藏的元素。统一按真实交互补「先点 `#prompt` 展开」，不改产品行为。
- `tests/activity-groups-ui.py`（三个互不相干的旧坑）：① 三处 `wait_for_function` 传表达式字符串，Playwright 会包成 `eval`，页面 CSP 没放 `unsafe-eval` 直接抛错 → 改箭头函数；② 测试钩子 `window.activityTestEvent = event` 在 `af51b00` 把全局 `event()` 改名 `applyEvent()` 后没跟，ReferenceError → 指向 `applyEvent`；③ 390px 下 `#earliest` 只在 `.mobile-expanded` 显示 → 先点 `#mobile-expand`。
- `tests/question-layout-ui.py`：`question.js` 现在 `import { actionIconNode } from "./icons.js"`，整段拼进普通 `<script>` 报「Cannot use import statement outside a module」→ 先拼 icons.js 源码再剥掉 import/export，保持无服务器的纯样式验收。
- `tests/goal-ui.py`：新增 `collapse_composer()`（鼠标移开 + blur，等 5s 定时器真收回）与 `check_collapsed_composer()`，验收折叠态隐藏 `+` / 图片 / 目标图标组与动作区、保留运行摘要三段且不换行、摘要左缘与输入行对齐、右上角计时未被折叠规则连带隐藏，并验展开后图标立刻回来。单行断言是必要的：换行会让折叠高度随屏宽跳动，钉在其上沿的「回到最新」跟着跳。
- 确认属既有问题、本次不动（`master` 上同样失败，根因与输入区无关）：`tests/context-menu-ui.py`（`#context-results` 不渲染，片段式注入的 app.js 切片边界已漂）、`tests/service-settings-ui.py`（`.settings-layout` 不再滚动）。`model-selection-ui`、`model-settings-ui`、`retry-settings-ui`、`remote-ui` 需外部预览服务，未起服务不计作失败。
- 顺手：`.gitignore` 加 `__pycache__/`，并移除此前误入库的 pyc。
- 验证：上述 6 个脚本在 `master` 代码上全部转绿，`conversation-ui.py` 连跑三次稳定；`npm test` 739 通过 / 2 跳过。
- 涉及文件：`tests/conversation-ui.py`、`tests/goal-ui.py`、`tests/session-billing-ui.py`、`tests/activity-groups-ui.py`、`tests/frontend-regions-ui.py`、`tests/question-layout-ui.py`、`tests/dev-vite-ui.py`、`.gitignore`、`devlog.md`。

## 2026-09-18 折叠输入区：运行摘要与停止按钮合并到同一行

- 原因：上一版折叠态运行中是上下两行（摘要一行、停止按钮又一行，约 116px），右侧大片空白白占一行高。
- 决策：折叠态把 `#composer` 从竖向改为 `flex-flow: row wrap`，输入框 `flex: 1 0 100%` 独占首行，运行摘要与 `.actions`（`order: 1`）共用第二行：摘要 `flex: 1 1 0` 吃剩余宽度、`nowrap + overflow: hidden` 裁末尾，按钮 `flex: 0 0 auto` 靠右不收缩。运行折叠高度 116px → 约 90px。
- 关键点：摘要的 flex-basis 必须写 0。`auto` 时 basis 取 nowrap 文本的完整内容宽（`.runtime-summary` 自身也是 flex 容器，nowrap 后 min/max-content 等于子项宽度之和），而换行判定发生在收缩之前，820px 窗口下摘要会独占一行把按钮挤到第三行（实测 118px）。
- 方案取舍：不用绝对定位（要给按钮写死预留 padding，文案变长就漏），不用显式 grid（得给全部直接子节点排格子，脆）；不动 DOM 顺序（`tests/app.test.js` 断言 `#session-runtime` 的 `previousElementSibling` 是 `.actions`）。
- 验证：Playwright 实测 1440px / 820px 两档，摘要与两个停止按钮垂直居中同行（cy 一致）、composer 高 90.4px，窄屏摘要按预期裁切；`tests/prompt-resize.test.js` 折叠样式守护改成断言 row wrap / basis 100% / `flex: 1 1 0` / `order: 1`；`npm test` 744 项全绿，`python tests/goal-ui.py` 通过。
- 涉及文件：`public/style.css`（折叠 media query 块）、`tests/prompt-resize.test.js`、`README.md`、`devlog.md`。

## 2026-09-18 压缩后保留用户输入与正式答复的精简版记录

- 原因：后台压缩一旦应用，段内历史整体隐藏/不下发，页面只剩摘要卡。长会话里用户看不到自己问过什么、agent 答过什么，阅读脉络整段断掉，只能逐张卡展开找。
- 决策：压缩段不再整段收走，而是降为「压缩段节选」留在原位。
  - 服务端（`src/sessions.js`）：`foldCompacted` 段内记录改走新增的 `compactedRecord`——用户消息保留 text/image 块，助手消息只留 `compactedAnswer`（`stripGoalMarkers` → `stripMemoryTags` → `splitAnswer().answer`，与 `src/goal.js` 的 bodyText 同一管线，避免正则漂移）；空正文、非主代理、工具/结果轮次、旧形态任务通知一律丢弃。产物带 `compacted: true`，`toWireRecord` 透传。
  - `foldCompacted` 改返 `visibleIds`（只收未被压缩的记录），两处快照组装改用它；锚在段内的重试卡行为不变，仍随摘要卡展开补发。折叠前下标 `messageIndexes` 与 `messageCount` 口径照旧。
  - 前端（`public/app.js`）：快照路径 `placeSnapshotMessage` 遇 `compacted` 不重建 toolCall 条目；实时路径 `foldCompaction` 改调新增的 `liteItem`，就地清掉过程说明/思考/工具条目与 call group，两条路径渲染结果一致（刷新不变样）。`markCompacted` 手动置 `hasAnswer`，避免节选正文被 `refreshCallGroups` 当成过程说明折进 call group。
  - 摘要卡展开取回原文时，`mountCompactionSegment` 按 `liteEntries` 就地升级同一条目而不重复插入；原文面板给节选条目加标注。
  - 样式（`public/style.css`）：`.compacted` 用与摘要卡同一条左侧色带（`--subagent` 混 `--line`），`.message-compacted` 用现有 mono 小标签口径，不引入 linear 规范外的颜色。
- 附带：`node_modules/@earendil-works/pi-coding-agent` 缺 `dist`（安装不完整）导致主仓测试也跑不起来，补装同版本 0.85.1 后恢复；npm 把固定版本改成 `^` 范围，已回滚 `package.json` / `package-lock.json` 保持精确钉版。
- 涉及文件：`src/sessions.js`、`src/session-history.js`、`public/app.js`、`public/style.css`、`tests/compaction-lazy.test.js`、`tests/compaction-config.test.js`、`tests/app.test.js`、`README.md`、`devlog.md`。

## 2026-09-18 修复「回到最新消息」点不动，补浏览器脚本残留断言

- 原因：两个独立改动合并后撞出回归。`6add51f` 让桌面输入区默认折叠、mousedown 就展开；而 `#latest` 在 `.composer-wrap` 里、CSS 钉在 `bottom: calc(100% + 8px)`。真鼠标点它时 mousedown 先把输入区从 48px 撑到 270px，按钮跟着上跃 247px，mouseup 落在空处 → click 根本不触发，按钮彻底失效。两边各自的测试都没盖住：需要两个改动同时在场。
- 决策：
  - 滚动按钮不算输入意图。`composer-wrap` 的 mousedown / focusin 展开判定加一道 `closest("#latest")` 门限；不改 CSS 锜点位置，也不动输入区本体的展开行为。按钮点完就 `hidden = true`，展开时机无影响。
  - 回归防守放在 jsdom（`tests/prompt-resize.test.js`），直接断言点 `#latest` 后 `data-collapsed` 不翻，而点输入框仍展开——不依赖真浏览器就能拦住。
  - `tests/render-capacity-ui.py` 跟上新模型重写：stub 不再引 `pageOf/createHistory`（已删），改用 `toWireRecord` 一次下发 500 条；验收改成整份挂载、首尾齐、attach 只发一次且无历史补齐请求、回最早/回最新纯本地跳转（不取数、节点不重建）、4× 节流下交互延迟、全展开后 DOM 规模只记录不断硬上限。
  - `tests/conversation-ui.py` 旧断言“翻到所在页”改成现在的“尚未入史”提示文案。
- 涉及：`public/app.js`（composerIntent 门限）、`tests/prompt-resize.test.js`（新用例）、`tests/render-capacity-ui.py`（重写）、`tests/conversation-ui.py`、`README.md`、`devlog.md`、codebase-map 索引。
- 验证：`npm test` 741 项（739 通过 / 2 平台跳过 / 0 失败）；`python tests/continuous-ui.py` 修前挂在“回最新”断言、修后通过；`python tests/render-capacity-ui.py` 全红→全绿（375 条 .message，因 toolResult 并入前一条 toolCall 卡片）；`python tests/conversation-ui.py` 通过且无浏览器错误。
- 教训：锜在可伸缩容器边缘的按钮，不能让自己的 mousedown 触发那个容器的伸缩；Playwright 只在派发前查稳定性，mousedown 之后的位移不会让它报错，点击丢了会静默通过——验收得断言“点了之后真的变了”。

## 2026-09-18 删除消息分页，整份历史 + 压缩卡按需展开

- 原因：分页是负优化。上滚前插闪烁、翻页后后续消息消失、阅读锚点跑位，为治时序又堆出游标作废、旧页不推水位等一整套分支；而它本来要解的 DOM 规模问题已经被上下文自动压缩解决：压缩后历史折成摘要卡，实际滚动范围并不长。
- 决策：
  - 删干净分页。`session.history` 命令、before/after 游标、页预取与前插、窗口裁剪（300 条 / MOUNT_MAX）、分页条 UI、`session.history.changed` 修订机制全部移除。`session.attach` 一次下发整份历史，前端同步挂载；历史区两个按钮（回最早 / 回最新）退为纯本地滚动跳转。
  - 压缩摘要卡改为服务端排除 + 客户端按需取：快照不包含被压缩折叠的消息（含段内子代理记录与重试卡），只给摘要；点开摘要卡才用新命令 `session.compaction.messages`（compactionId 必填）取一次原文，结果缓存、失败可重试、切会话后迟到响应丢弃。未加载的会话走只读 JSONL 投影，不创建 SDK 实例；实时压缩刚折的段原文还在页上，展开免取。
  - 新增 `session.history.reset`（reason: recall）：撤回真正截断历史时广播，各端整份重取。增量事件表达不了「消息消失」，而旧方案是靠游标作废带过的；撤回失败不广播。
  - 快照另带 messageIndexes / messageCount（折叠前的历史下标与总长），给目标轮次锚点和重试卡定位；越界 messageCount 收敛到历史末尾而不丢弃。tasks 恒全量，tools 仍裁剪（owned ∪ 运行中）。
  - Markdown 渲染缓存 epoch 从「会话 + 修订号」改为 sessionId：同会话整份重挂（撤回重取、后台回前台）命中，切会话整体丢弃。后台标签页只记脏、回前台重取的优化保留。
- 涉及：`src/session-history.js`（重写，只留 messageIdOf / toWireRecord / readSessionManager / readSessionHistory）、`src/protocol.js`、`src/sessions.js`、`src/server.js`；`public/app.js`、`public/index.html`、`public/style.css`；新增 `tests/helpers/session-page.js`、`tests/compaction-lazy.test.js`、`tests/history-projection.test.js`，删除 `tests/helpers/history-page.js`、`tests/history-dom-window.test.js`、`tests/history-prepend-records.test.js`、`tests/history-main-budget.test.js`，重写 snapshot 三份、history-reading、history-page-cache、send-optimistic、continuous-history、continuous-preview.mjs、continuous-ui.py、recall、compaction-ui、session-history 等；`README.md`、`devlog.md`、codebase-map 索引与知识库。
- 验证：`npm test` 738 项（736 通过 / 2 平台跳过 / 0 失败）；`node tests/continuous-preview.mjs` 服务可起并响应 200；`public/` 与 `src/` grep 无分页残留。已知边界：从未压缩过的超长会话仍可能一次下发很大一帧（32 MiB 上限），未实现虚拟列表。

## 2026-09-18 供应商与模型两级配置、配置复制与有效思考等级

- 原因：模型管理页把供应商连接和模型列表混在一屏，新建供应商时两件事互相牵扯；重复配置同类供应商/模型只能手抄；会话里的思考等级下拉罗列七个等级，模型并不支持的等级也能选；勾选框按白名单写 thinkingLevelMap，保存后回读的勾选状态与保存前不一致。
- 决策：
  - 详情页拆「供应商 / 模型」两个分区（tablist + tabpanel）。新建草稿阶段模型分区禁用并提示先保存连接；保存成功后自动选中新供应商并跳到模型分区，模板/复制带来的示例模型作为待保存行迁过去。分区选择按条目 id 记忆，重渲染与回读不会把用户扔回连接页。
  - 新增「复制为新供应商」（id 自动 `-copy` 避让，连接字段与高级 JSON 照搬，模型行克隆为待写入；API Key 与已存请求头值不复制并显式提示，不带 modelOverrides）和模型行复制图标（取表单当前值而非快照，剔除派生字段与掩码占位，id 自动避让）。已有未保存草稿时复制供应商需二次确认。
  - 思考等级改为按「与基准的差异」写值：取消写 `null`（浅合并下删键清不掉已落盘条目），重新勾上回到默认（可能整体清空 thinkingLevelMap），xhigh/max 属 opt-in 勾上才写字面量，已落盘的自定义 API 入参在取消→勾回后原样恢复。这修掉了旧版按白名单写导致的保存/回读不一致。模型管理页仍列全部七级（它是定义面），未勾「支持推理」时非 off 等级锁死；行内新增「有效等级」摘要。
  - 消费侧（输入区、默认新会话设置、主/子代理、自动压缩）统一改用 `effectiveLevels(modelKey)`：取该模型 `levels`，缺失时回落当前会话 `config.levels`，不再展示模型不支持的等级。
  - 顺带修掉一个静默写坏值：复制出来的请求头只有名称没有值时，旧逻辑会把空字符串当密钥写进去，现在保存前明确报错，要求重填或删行。
- 涉及：`public/model-manager.js`、`public/model-manager.css`、`public/app.js`、`tests/model-manager.test.js`、`tests/app.test.js`、`README.md`、`devlog.md`。
- 验证：`npm test` 全绿（747 项：745 通过 / 2 skip / 0 失败）；`tests/model-manager.test.js` 单文件 38 项通过，新增覆盖两级分区与禁用态、复制供应商（含密钥不复制、请求头缺值报错、载荷不含 models/modelOverrides）、复制模型（取实时值、id 避让、不发请求）、思考等级写值语义与保存后回读一致性。`tests/app.test.js` 的等级断言按「只列有效等级」更新，并把 `models.list` fixture 补上 `levels`（`src/pi.js` 的 catalog 投影本来就带该字段，旧 fixture 不真实）。

## 2026-09-17 输入区详情入口对齐与紧凑排版

- 原因：运行统计与详情入口左右内缩相差 4px，桌面入口沿用触控行高导致底部留白偏大。
- 决策：统一为 12px 内缩；桌面行高从 44px 缩为 36px，两行共节省 16px，粗指针设备仍保留 44px 点击区域。不改变详情弹窗与账单行为。
- 涉及：`public/style.css`、`tests/session-billing-ui.py`、`README.md`、`devlog.md`、自动生成的 `.pi/skills/codebase-map/INDEX.md`。
- 验证：`npm test` 通过；浏览器在 320/390/768/1280px 与 390px 触控模式验证左右对齐、行高、无横向溢出及配置/账单交互均通过；合并前获取 origin/master，基线未变化。

## 2026-09-17 修复桌面 CI macOS 校验 PlistBuddy 路径

- 原因：首次 Pake 构建中 Windows MSI 成功，macOS 作业在 DMG 校验步骤报 `PlistBuddy: command not found`（不在 runner 默认 PATH）。
- 决策：改用完整路径 `/usr/libexec/PlistBuddy`；重新构建后两个产物均通过校验。
- 涉及：`.github/workflows/desktop.yml`。
- 验证：重建 run 35210946054：Windows 8m9s 与 macOS 10m4s 双作业全绿，产物 Axiom-Windows-x4（3.3MB）/ Axiom-macOS-universal（9.1MB）已上传。

## 2026-09-17 桌面端回归 Pake 壳并支持可配置连接地址

- 原因：用户认为 Electron 方案过重（随包 Node 运行时、生命周期握手、electron-builder 链路），决定移除 Electron，回归 Pake 轻量壳，且连接地址不再构建期烘焙，须可配置（本机或远程均司）。
- 决策：壳内置本地连接入口页 `desktop/connector/index.html`（pake-cli 支持本地目录打包，无后端依赖）：填 `host:port`（默认端口 4319）或完整 http(s) 地址，点「连接」后以 no-cors 探测可达即整页跳转；上次地址可达时自动直达。pake.json `appVersion` 升 0.2.0，`url` 指向 connector 目录，`forceInternalNavigation: true` 保证跳转留在壳内。网页右上角连接状态点击改为直达设置的「连接」面板（新增第 5 个 tab），断线时也可切换地址，地址校验与 connector 同源规则（拒绝非 http(s)、userinfo、非法端口）。后端配套：`AXIOM_HOST` 环境变量支持非回环监听；WS 升级放宽 loopback Host 白名单（同源 Origin 校验保留）。
- 删除：`desktop/main.mjs`、`desktop/backend-lifecycle.mjs`、`scripts/stage-desktop.mjs`、`scripts/smoke-shell.mjs`、`scripts/smoke-desktop.mjs`、`tests/backend-lifecycle.test.js`；`package.json` 移除 `main`、`build` 段、`desktop:dev/stage/pack/build/web` 脚本与 electron/electron-builder 依赖；`src/main.js` 移除 AXIOM_DESKTOP 分支（随机端口、ready 握手扩展）；`src/update.js` 移除 checkDesktopUpdate；`src/server.js` 移除 service.desktop 字段；`public/service-settings.js` 移除 desktop 分支；同步删改 tests/{update,service-api,service-settings,app}.test.js。CI 重写为 Pake 构建（Windows MSI + macOS Universal DMG，含 DMG 完整性与双架构校验）。
- 保留：`desktop:pake` 脚本（配置已重建可用）；`src/data-owner.js`、`src/database.js` 版本守卫、stop/prepareStop、`tests/smoke.js`（与桌面方案无关的通用能力）。
- 文档：README 桌面段重写为 Pake 方案，旧版 v0.1.0 段落转为历史下载说明；development-plans 概述改为历史存档定位。
- 涉及：desktop/pake.json、desktop/connector/index.html（新增）；src/{main,update,server}.js；public/{index.html,app.js,style.css,service-settings.js}；scripts/（删 3）、tests/（删 1 改 4）；.github/workflows/desktop.yml；package.json、package-lock.json、.gitignore、README.md、devlog.md。
- 验证：npm test 697 项：695 通过、0 失败、2 平台跳过（与基线一致）；全仓无 electron/AXIOM_DESKTOP 残留引用。壳内跳转、入口页自动直达与远程直连需 CI 产物实机验收（本机无 Rust 工具链，历史上即依赖 CI 出包）。

## 2026-09-17 隔离内部任务通知与用户撤回队列

- 原因：SDK 的 custom 通知与用户 Steer 共用真实队列，快照丢失角色信息，导致通知显示成 Steer，Esc 清除通知并将内部 JSON 写入输入框。
- 决策：队列快照增加平行 internal 标记，前端不渲染内部行；保留原文本数组以维持 checkpoint / idle 闸门。撤回仅返回用户文本与图片，清理 SDK 镜像后同步原样恢复 custom 消息，不提前落历史、不改变送达确认。送达后的独立通知条保持不变。
- 设计：仅过滤队列行，沿用 Linear 既有布局和 token，无新增样式。
- 涉及文件：`src/pi.js`、`public/app.js`、`tests/internal-task-queue.test.js`、`tests/app.test.js`、`README.md`、`devlog.md`、自动生成的 `.pi/skills/codebase-map/INDEX.md`。
- 验证：初次定向测试因独立 worktree 缺少依赖未启动，链接现有依赖后全量测试 712 项（710 通过、2 跳过、0 失败）。覆盖双队列内部消息保序、重复撤回、图片索引、内部队列隐藏及既有通知投递回归；获取最新 origin/master 后无新增变更。未运行真实模型或浏览器手测。

## 2026-09-17 全页面操作图标统一重绘

- 原因：上一版置顶图标仍不够清晰，用户明确要求连同页面所有操作图标重绘。
- 决策：新增共享 SVG 图标表，以 24×24 网格、1.75 圆角描边和 currentColor 统一轮廓。置顶改为直立钉帽、曲线肩部、独立针尖，行内和菜单同源；替换关闭、更多、重试、收藏等字体符号。沿用 Linear 的 muted/ink/accent，不新增配色；保留品牌、文件类型图示、数据仪表与工具身份图形。
- 涉及：`public/icons.js`、`public/app.js`、`public/style.css`、文件/模型选择器、模型管理、Goal/Question 模块、`src/server.js`、测试加载器与回归、`README.md`、代码索引。
- 验证：同步最新 master（16b99e2）后全量 730 项，728 通过、2 跳过、0 失败；侧栏浏览器回归通过（含桌面/移动端菜单、键盘关闭及复制）；明暗主题截图核对图钉与菜单轮廓。新增图标几何安全、水合幂等回归，收藏断言改为 SVG 与 aria 状态。期间共享依赖短暂缺失导致一次加载失败，依赖恢复后重新全量验证通过。

## 2026-09-17 置顶图钉视觉优化

- 原因：侧栏 11px 紫色实心图钉过密，与其他线性图标风格不一致。
- 决策：改为 14px 斜向线框图钉，圆角描边、16px 居中容器；复用 Linear 的 `--muted`，不新增颜色，不用重复主色强调抢占会话标题。保留置顶分组、行底色、左键、无障碍标签和全部操作行为。
- 涉及文件：`public/app.js`、`public/style.css`、`README.md`、`devlog.md`。
- 验证：合入最新 master 后全量测试 710 项（708 通过、2 跳过、0 失败）；侧栏浏览器回归通过（含桌面/移动端菜单）；额外浏览器检查验证明暗两色的图标颜色、14px 尺寸、无填充描边及无障碍标签，浅色截图人工核对通过。

## 2026-09-17 Git 字符历史阅读优化

- 原因：历史字素网格优化未被覆盖，但只解决对齐；长提交说明仍横滚，截图中的 Git 树可读性差。
- 决策：保守识别整块 graph/oneline 或哈希开头的分支列表，使用弱化的等宽关系/哈希列和自动换行的说明列。不改任意字符图、不猜拓扑、不修改数据；git/gitgraph 标签同样支持，复制与原文切换保真，20K 上限限制新增 DOM。
- 设计：沿用现有 Linear 字体、muted 色和卡片，不新增配色、斑马纹或表格网格线。
- 涉及：`public/markdown.js`、`public/style.css`、`tests/git-log.test.js`、`tests/git-log-ui.py`、`README.md`、`devlog.md`；测试自动更新代码索引。
- 验证：Markdown/Git 单测 4/4；Git 与字符图浏览器测试桌面/320px 通过；首次全量 700 项，698 通过、2 跳过、0 失败。合入远端 `a44c3d8` 后重建生成索引解决唯一冲突；再次全量 701 项，699 通过、2 跳过、0 失败，两项浏览器检查再次通过。

## 2026-09-16 修复历史首屏正文缺失并删除会话标签栏

- 原因：独立 JSONL 恢复时先拼全部主消息，再拼全部子历史；最近 60 条分页可能全部来自子代理，主正文被挤到更早页。
- 决策：恢复时按委派结果的 taskIds 将子历史归位，无关联旧记录保留在前部，不按不可靠时间戳猜顺序，不改写原始历史。保留实时消息与既有完整时间线顺序。
- UI：删除顶部标签 DOM、样式、状态与渲染函数及侧栏冗余打开入口；侧栏切换、页面内草稿、hash/sessionStorage 恢复保持不变。遵循既有 Linear 设计 token，不引入新颜色、字体或控件。
- 涉及文件：`src/sessions.js`、`public/app.js`、`public/index.html`、`public/style.css`、`tests/restored-history-order.test.js`、`tests/workspace-tabs.test.js`、`tests/app.test.js`、`README.md`、代码索引及坑库。
- 验证：新增 130 条子历史回归，覆盖首屏最终回答、主子分页无丢失/重复与真实 app 渲染；最终全量结果见本条后续更新。

## 2026-09-16 统一主代理追加提示词与项目交付规范

- 内容与原因：将已确认的交流、只读调研委派、跨平台、Git/worktree 和 `<axiom_display>` 协议整理为 Pi 风格英文指令列表，仅追加到主代理，不替换默认提示词或扩散至子代理。
- 涉及文件：`src/prompts.js`、`src/capabilities.js`、`tests/capabilities.test.js`、`AGENTS.md`、`README.md` 和代码索引；本机 `C:/Users/dane/.pi/agent/AGENTS.md` 的唯一重复交流规则已移除（保留空文件，不纳入 Git）。
- 决策：项目文件保留分支、README/devlog 与 conventional commits 约定，明确授权每次改动验证通过后主动提交、合并并推送 master；通用提示词仍不自行授权合并。同步或验证失败时停止交付，不覆盖已有工作。
- 验证：提示词加载回归 7/7 通过；`npm test` 共 691 项，689 通过、2 跳过、0 失败；`git diff --check` 通过。

## 2026-09-16 更新 append 描述与参数说明

- 按用户原文更新 `src/tools.js` 的 append description，以及 `taskId`、`text`、`mode` 字段描述；明确 steer 调整当前工作，followUp 排队等待当前工作完成，补充指令不重复已有背景。
- 参数约束、默认模式及执行逻辑不变；同步 `README.md` 和代码索引。沿用本轮要求，由主代理直接执行，不运行验证或测试。

## 2026-09-16 更新 read_result 描述与参数说明

- 按用户原文更新 `src/tools.js` 的 read_result description，并为 `taskId`、`resultId` 添加描述：必须取自同一条完成通知，仅获取结果、不查询进度、禁止轮询。
- 参数约束及执行逻辑不变；同步 `README.md` 和代码索引。沿用本轮要求，由主代理直接执行，不运行验证或测试。

## 2026-09-16 补充 delegate 任务说明充分性要求

- 按用户最新原文更新 `src/tools.js` 的 delegate description：提供独立工作所需信息，并检查未参与当前对话的子代理能否理解及执行任务。参数 schema 与执行逻辑不变。
- 同步 `README.md`；由主代理直接执行，按用户要求不运行验证或测试。

## 2026-09-16 更新 delegate 描述与 schema

- 内容与原因：按用户提供的原文更新 `delegate` 工具描述、`context` / `tasks[].task` 字段描述，补充 `tasks` 数组描述；明确研究分析用途、共享背景与任务专属信息分工，以及通知后择时读取一次、禁止轮询。
- 决策：保留必填字段、非空与额外字段限制、执行逻辑及其他委派工具不变，不新增只读限制；README 同步修正 context 为调用级批内共享字段。
- 文件：`src/tools.js`、`tests/tasks.test.js`、`README.md`、`devlog.md`、`.pi/skills/codebase-map/INDEX.md`。
- 验证：新增 schema 文案与结构回归；worktree 初次测试缺少依赖，链接现有 node_modules 后 `npm test` 共 690 项，688 通过、2 跳过、0 失败。未发起真实模型请求。

## 2026-09-16 主代理提示词与激活工具查看

- 内容：输入区新增默认折叠的主代理运行态查看，纯文本展示系统提示词与激活工具名称、描述、参数；复用既有 runtime 通路，不增加 endpoint 或模型请求。
- 原因与边界：先使提示词可观测再优化；明确当前快照不等于最后请求，不包含动态用户消息和供应商内部指令，扩展覆盖结束后可能复位。不修改代理行为提示词。
- 实现：agentRuntime 仅提取 SDK 激活工具的可序列化定义，enableTools/disableTools 后立即推送，避免 Goal 工具列表陈旧；未加载占位、会话隔离与文本安全。UI 沿用 Linear 风格现有 var(--line)/var(--muted)、8px 圆角和折叠组件，内容区域限高滚动。
- 文件：src/pi.js、public/app.js、public/index.html、public/style.css、tests/app.test.js、tests/config.test.js、README.md、导航索引。
- 验证：定点测试 14/14；全量串行测试 689 项，687 通过、2 跳过、0 失败；git diff --check 通过。未进行真实供应商请求抓包或桌面安装包验收。

## 2026-09-16 侧栏会话置顶

- 内容：侧栏「⋯」菜单新增「置顶/取消置顶」；置顶会话在每个工作区分组内单独进「置顶」子组（排在「进行中」之前，运行中会话也排在其后），行底色用 `--raised` 加深、强调色左键 + 图钉图标突出（置顶且当前打开时两套高亮叠加）。「置顶」子组仅在该工作区有置顶会话时出现。
- 原因：用户需要把长期关注的会话固定在侧栏最上方，并与运行中/待查看的自动排序区分开；加深底色与当前页高亮（浅主题色底）可同时区分。
- 实现：`axiom.pinnedSessions` 本地偏好（与 `axiom.hiddenSessions` 共用 `changeSessionPreference` 的 Web Locks 串行读改写、storage 跨标签页同步，断连可用）；`renderSessions` 每个工作区内的排序 rank 改为置顶 0 → 运行中 1 → 待查看 2 → 已读 3。
- 文件：public/app.js、public/style.css、tests/app.test.js（置顶/取消置顶、排序、分组、持久化、不触碰服务端断言；菜单索引断言更新）、README.md。
- 验证：`node --test --test-timeout=120000 tests/app.test.js` 3/3 通过；全量 `npm test` 689 项，687 通过、2 跳过、0 失败。合并 master 的「工作区折叠分组侧栏」（a4b7cbe）后置顶逻辑改为每组内生效，重跑上述测试与浏览器验收（多工作区脚本）均通过。

## 2026-09-15 长会话阶段三：功能验证与性能证据

- 新增 tests/history-reading.test.js：未挂载阅读锚点按 messageId 获取一页且不推进水位；跨页工具结果不依赖上一页 DOM 仍可展开。2/2 通过。
- 性能脚本与数据：docs/perf-history-session/，ab52936 假历史基线与当前分支，20/1831 条，各 3 次串行、独立临时实例、真实 Chromium、禁真实模型。基线长会话输出节点 45351；当前页约 1930。当前仅证明传输/DOM 分页收益，不证明 SDK 全历史内存有界。
- 最终全量串行验证：636 项，634 通过、2 跳过、0 失败、0 todo（148.7 秒）。长会话首输出均值约 485→152ms，文档节点 45351→1930，GC 后前端堆 15.4→3.9MB；有限切换堆 4.8→5.0MB，小幅增长不能证明无泄漏。图片/折叠/流式锚点未完成真实浏览器验收，不宣称整个任务所有性能指标达标。
- 最终数字与未覆盖场景以该目录 README 和 JSON 为准；不使用旧调研分支的数据冒充本轮基线。新增文件后重建索引，保留 worktree 供统一集成，不合并 master。

## 2026-09-15 长会话阶段二：有界页窗口、缓存与功能接线

- 决策：采用无新增依赖的原生 60 条页窗口，不冒充动态高度虚拟列表；页内自然布局、换页卸载。删除 120 条阈值/8ms/40 条全量分片调度。只持当前页消息引用，不维护全历史高度表；位置缓存 3 个，未保存输入例外不淘汰。
- 接线：app.js 按会话/实例/修订/请求 token 拒绝旧回包；历史页不推进水位，最新 attach 才提交；翻页回包重新保存输入；后台只置更新标记，前台恢复一个快照。阅读锚点按 messageId 按需取页。跨页 toolResult 可独立展示；原文与选区复制仅当前页，明确限制。
- 文件：public/app.js、transport.js、session-cache.js、stream-renderer.js、index.html、style.css；tests/helpers/history-page.js、public-source.js、snapshot 三测试、session-cache 与 stream-renderer 测试；README、导航技能、索引与知识库。
- 验证：node --test --test-concurrency=1 --test-timeout=120000 tests/*.test.js：634 项，632 通过、2 跳过、0 失败、0 todo（158.8 秒）；git diff --check。新旧页水位、首屏缓冲、会话/epoch/revision 切换、在飞草稿、后台不绘制均有可运行检查。
- 限制：未实现连续无限滚动，浏览器全历史查找须翻页；服务端全量历史/身份索引、活动业务和草稿仍非硬字节有界。单条巨块仍可造成长任务，需性能实测而非单测代替。

## 2026-09-15 长会话阶段一：身份与历史传输分页

- 决策：不改 SDK 上下文/权威历史，不新增数据库历史副本；session.attach 最近 60 条，session.history 游标绑定 session/epoch/revision/消息边界，分页不提供 seq；订阅先于加载，活动流显式传身份，撤回/压缩换修订。
- 文件：src/session-history.js、src/sessions.js、src/server.js、src/protocol.js、tests/session-history.test.js；README 与导航文档同步于后续展示提交。
- 验证：session-history 与分页前端组合 30 项中 29 通过、1 在飞草稿缺陷已修复并单独复测 9/9；后端 SDK 假源测试确认翻页不调用上下文修改路径。服务端仍全量保留历史，未声称服务端内存有界。
## 2026-09-16 Mac签名修正版验证与异步发布

- CI 35063188663成功：Mac测试618/618，codesign报告valid on disk / satisfies its Designated Requirement，真实Electron窗口、后端保存退出、DMG CRC均通过；Windows616通过2跳过。
- 用户授权发布dev.2。使用仓库忽略目录dist内的一次性后台脚本下载并上传独立预发布版，每个网络步骤有超时（查询25秒，下载/上传600秒），不使用阻塞watch；完成前不报告发布成功。旧版Mac故障说明随发布结果更新。
- knowledge.md追加根因与发布门禁，强调ad-hoc不等于开发者认证或公证。

## 2026-09-16 修复Mac测试包无效资源签名

- 用户实机codesign/spctl均报code has no resources but signature indicates they must be present；旧流程禁用自动证书发现且未指定identity，跳过签名，DMG完整性和后端测试无法检测.app签名问题。
- desktop.yml Mac构建显式使用electron-builder内置ad-hoc identity=-，让打包器完成嵌套签名；加入codesign深度严格校验及真实Electron窗口冒烟。无需证书，但不是Developer ID认证或公证，不能承诺Gatekeeper放行。
- README标记旧Mac包故障；待云端验证后发布独立修正版，不静默覆盖旧资产。

## 2026-09-16 Mac arm64 dev包发布

- CI运行35049501362两平台成功，Mac通过自动测试、随包后端隔离启动/健康身份/安全退出和hdiutil verify。下载首次180秒超时，重试600秒上限内成功。
- 基于551d914产出的Axiom-0.1.7-arm64.dmg及SHA256SUMS-macOS.txt补充至desktop-v0.1.7-dev.1，GitHub digest与本地b37c8798782cf93009ef83837b20592ffb31cad3d0a727d7c682b6b9d9e83016一致。
- README与发布说明注明仅Apple Silicon、无Developer ID/公证、未完成实机窗口安装验收；master未合并，未更改Windows资产。

## 2026-09-16 禁止构建器隐式发布

- 第二次云端运行两平台测试通过并完成打包，但electron-builder因CI环境自动尝试发布而缺GH_TOKEN失败。desktop.yml显式--publish never，保持构建权限只读，发布仍由人工核验后执行。不通过给构建器写权限绕过此问题。

## 2026-09-16 云端跨平台测试修正

- 首次macOS/Windows云端构建均在测试阶段失败，未产出Mac包。原因：测试假目录未canonicalize（macOS /var与/private/var、Windows短路径与长路径）；macOS并发测试同步管道读返回EAGAIN。
- tests/defaults、project-skills、session-flow、workspace-picker、service将相关临时目录realpath后作为测试基准，不改业务路径规则；tests/helpers/model-concurrency-child.mjs仅对EAGAIN进行10秒有界重试，父进程字节屏障仍决定放行，不放宽CAS断言。
- 本地相关测试通过；desktop.yml加入Mac随包独立Node后端冒烟及DMG校验。README记录云端验证范围。Mac实机窗口和安装验收不冒充已通过。

## 2026-09-16 发布未签名 Windows dev 预发布包

- 用户授权发布到其cosyeezz/axiom仓库；以bbb4e32为目标发布desktop-v0.1.7-dev.1，prerelease=true，非Latest；未合并master。功能分支已推送。
- 安装包250331447字节，SHA256为4c161c1926c4c83ee3bd5c2a087daa83a948f9d2f6db0cb1c2e2e1ad0bbadc39；GitHub资产digest与本地一致。发布附SHA256SUMS.txt（使用GitHub规范化后的点分文件名），不冒充签名；Authenticode核查NotSigned。
- 重建包真实隔离启动、窗口加载、安全退出通过；618项测试616通过2跳过。发布说明明确更新链路/迁移/安装器覆盖升级/macOS尚未完整验收。README更新下载入口与进度。
- 用户要求停止子代理，已取消剩余任务和自动重试；此后仅主代理执行。

## 2026-09-15 应用内跨目录标签与桌面端口隔离

- public/app.js 删除跨目录window.open旧分支，侧栏打开同样使用switchSession，避免Electron拒绝同源新窗口后看不到会话；tests/app.test.js、workspace-tabs.test.js验证跨目录切回草稿、不取消任务。
- src/main.js：桌面绑定port=0，握手回传实际端口；CLI端口规则不变。scripts/smoke-desktop.mjs保持配置端口被占用，真实随包Node仍启动成功，健康身份与保存退出均通过。
- 全量测试618项：616通过、2跳过、0失败；README同步行为。尚未声明整包更新完成。

## 2026-09-15 冷会话历史、空闲释放和应用内标签接线

- sessions/server：attach不再ensureLoaded，历史只读；恢复共享监听集合和seq，避免冷订阅丢失；每分钟释放空闲5分钟的持久化SDK，保护任务/通知/保存/队列/Goal；释放与加载、关闭串行。
- public/app.js/index.html/style.css：复用views实现顶部会话标签、切换和关闭，不触发删除或取消；使用Linear既有surface/line/accent token。跨目录首次打开暂留原浏览器路径。
- tests/session-persistence、service-api、workspace-tabs覆盖冷读取零SDK初始化、释放保护、监听水位、关闭标签不删任务与草稿恢复；阶段全量615通过2跳过，新增标签测试10项通过。不是更新安装完成声明。

## 2026-09-15 后端失败不应锁死桌面退出

- `desktop/backend-lifecycle.mjs` 显式提供 processPresent，运行就绪后异常退出通知 onCrash；`desktop/main.mjs` 在已无后端进程时允许关闭窗口，但不授予安全保存或更新许可。超时仍有进程时继续阻止退出，不强杀。
- `tests/backend-lifecycle.test.js` 新增崩溃通知、进程存在状态及更新拒绝断言，四项通过；README同步。尚未重建安装包，旧产物不含此修正。

## 2026-09-15 只读历史基础

- `src/session-history.js` 复用SDK公开 parseSessionEntries + SessionManager.inMemory，避免 open() 在读取空文件/旧格式时改写历史；接入 sessions 子任务历史路径。
- `tests/session-history.test.js` 覆盖分支选择、旧格式与空文件原字节不变；连同持久化测试16项通过。未宣称主会话 attach 已惰性化。
- README补充历史读取说明并明确旧Pake命令不可用于当前分支；索引同步。

## 2026-09-15 Electron自包含Windows测试包与真实启动验证

- 删除 `desktop/pake.json`，将 `.github/workflows/desktop.yml` 替换为仅手动触发的 Electron 未签名测试包构建（不发布 Release，macOS arm64 待CI验收）。
- 新增 `desktop/main.mjs`、`scripts/stage-desktop.mjs`、两份 `scripts/smoke-*.mjs`；固定 Electron 44.4.1、独立 Node 24.19.0、私有生产依赖，更新 package/lock、README 与忽略目录。镜像解除 Electron/NSIS 官方下载超时，不关闭校验。
- 实测发现 Electron ESM 顶层 await app.whenReady() 阻塞 ready；改为注册 then 后完成模块评估，真实开发壳与打包壳均完成窗口加载和退出。前两次超时仅清理本次隔离进程树，记失败，不视作安全退出。
- 产物 `dist/Axiom Setup 0.1.7.exe`；Authenticode 查询为 NotSigned。打包目录随包 Node 在空 PATH 启动、health身份核对、安全退出通过；实际 Electron 窗口隔离数据验证通过。全量测试612通过、2跳过、0失败（614项）。尚未运行安装向导、macOS、签名、公证、更新替换、旧安装迁移、空闲释放与应用内标签，不能称完整成品。


## 2026-09-15 生命周期审查修正与数据保护基础（进行中）

- 修正：等待退出允许明确取消升级；停止后清除 ready，拒绝复用过期启动结果；删除对数组 pendingWrites.size 的无效检测，保存失败由 close 流程上报，不能靠排队长度永久阻塞退出。
- 数据：main.js 写库前取得数据根独占；Windows 使用命名管道、Linux 抽象 socket、macOS loopback 端口（碰撞保守拒绝）。Database 在权限/WAL/迁移前只读检查 dataVersion，拒绝更新数据被旧构建改写；旧无守卫程序仍需显式迁移门禁。
- 文件：src/data-owner.js、src/main.js、src/server.js、src/database.js、desktop/backend-lifecycle.mjs、tests/backend-lifecycle.test.js、tests/data-owner.test.js、tests/data-version.test.js、README.md、代码索引。
- 验证：生命周期/归属/API 五项通过；版本与数据库七项通过、一项 POSIX 权限测试在 Windows 跳过。所有命令有超时，未操作用户数据。尚未完成 Electron 成品接线和全量回归。


## 2026-09-15 09:43 -0700 桌面重构：授权与生命周期首段

- 决策：用户明确授权在 feat/desktop-runtime 新增精简 Electron 主进程替换 Pake；不再等待外部 Electron 仓库。此提交仅为阶段一的生命周期基础，不代表桌面交付完成。
- 内容：随包独立 Node 路径、绝对数据路径、并发启动去重、令牌/实例/版本/PID/地址就绪核对；停止超时保留失败且不强杀。worker 支持等待任务完成后保存退出，服务器关闭新写请求入口但保留状态读取。
- 文件：desktop/backend-lifecycle.mjs、src/main.js、src/server.js、tests/backend-lifecycle.test.js、README.md、devlog.md、索引。
- 验证：假进程/可控时钟三项及现有 service-settings-api 测试通过，git diff --check 通过；完整 npm test：610 通过、2 跳过、0 失败。尚未接入 Electron，未实现数据根归属锁、崩溃重试、安装包、签名或更新，不把替身验证当成成品验收。


## 2026-09-15 08:12 -0700 按用户要求移除旧回答标签兼容

- 原因与决策：用户明确不需要历史兼容；展示解析仅识别 axiom_display，删除新旧标签配对表，恢复单组标签判定。旧 axiom_answer 不再作为展示协议解析，原始历史不改写。
- 文件：public/answer-tags.js、public/app.js、src/goal.js、tests/answer-tags.test.js、tests/goal.test.js、tests/app.test.js、README.md、devlog.md、代码索引。
- 验证：npm test 600 通过、2 跳过、0 失败；新增旧标签及其流式前缀按普通文本透传的断言，现有展示和 Goal 测试使用新标签；git diff --check 通过。

## 2026-09-15 08:10 -0700 展示标签改名与执行收尾约束

- 原因：去掉模型无法判断的“界面支持的图示”，避免正式答复标签被理解为任务结束要求。
- 内容与决策：主代理提示词改用 axiom_display，明确标签仅用于界面展示而非停止/完成/终止条件；需要执行的任务持续调用工具直到完成并验证或遇到需要用户决策的阻塞，不得以确认需求、复述计划或承诺执行代替交付。共享解析器支持新标签并兼容历史 axiom_answer，不改原始消息、不新增终止逻辑；新旧标签不能错配。
- 文件：src/prompts.js、public/answer-tags.js、public/app.js、src/goal.js、tests/answer-tags.test.js、tests/goal-markers.test.js、tests/memory-ui.test.js、tests/message-activity.test.js、README.md、devlog.md、代码索引。
- 验证：独立 worktree 内 npm test：606 通过、2 跳过、0 失败；覆盖新旧标签、流式前缀、代码示例保护、畸形/错配回退，以及新标签的前端显示和 Goal 完成标记组合。git diff --check 通过。未改视觉样式，未操作运行中的服务。

## 2026-09-15 桌面会话字号等比调整

- 原因：会话字体偏小，需要放大阅读内容但不改变侧边栏与输入栏。
- 内容与决策：顶部原生字号选择器提供 100%～200% 五档，localStorage 记住选择并校验非法值；CSS 仅在桌面会话内容、子代理正文及原文区域调整字号，保留字体层级与行高，不使用整页 zoom、不改图片大小、不引入依赖。手机 ≤700px 保持原字号；工具折叠行高度随比例增长避免裁字。
- 文件：public/index.html、public/app.js、public/style.css、tests/app.test.js、tests/conversation-font-ui.py、README.md、devlog.md、代码索引。
- 设计：复用 Linear 的 surface/line/body-ink 与 8px 圆角、原生焦点与键盘选择。
- 验证：npm test 599 通过、2 跳过；Chromium 浏览器检查五档实际字体比例、侧栏/输入栏/标题不变、保存恢复、手机隔离与页面不横向溢出通过。未在 macOS/Windows 桌面壳实机验收。

## 2026-09-15 桌面运行与前端性能六份独立开发方案

- 内容：新增六份可独立交付开发的方案，涵盖完整桌面交付与手动更新、启动故障隔离、实时通信、前端分区与开发热加载、长会话性能、平滑流式显示；同步 README 导航。
- 原因与决策：将讨论落实为可并行执行的有边界工作包，保留 Node、ws 与原生前端，不以更换框架代替修复；共享入口由集成负责人接线，各模块先使用替身验证。Electron 代码位置尚未确认，桌面方案明确列为前置条件，不声称已经实现。
- 文件：docs/development-plans/01-desktop-delivery-update.md、02-startup-fault-isolation.md、03-realtime-transport.md、04-frontend-regions-dev.md、05-history-session-performance.md、06-smooth-stream-display.md、README.md、devlog.md。
- 复核修订：移除正式版双层守护链、优先级导致同会话乱序和不安全增量丢弃方案；补齐版本守卫对旧程序无效、数据库与JSONL一致备份、历史revision及实例水位边界。开发热加载优先成熟工具，流式显示不自造Markdown尾窗解析器。三个修订子任务因插件依赖加载失败，改由主代理完成，不修改运行环境。
- 验证范围：六文档数量、Markdown链接与代码围栏自动检查通过，git diff --check通过，并复核共享契约；本次不修改产品代码、不安装依赖、不操作服务，文档中的实现验收均为后续任务，不代表已经通过。

## 2026-09-15 修复新安装因压缩思考等级无法进入

- 原因：默认自动压缩 thinking=off，但部分推理模型禁用 off；后端建会话校验抛错，页面将业务失败当断线重连，安装 HTTP 健康检查未覆盖真正创建会话。
- 决策：协议共享 resolver 严格解析输入后将不兼容偏好适配到实际模型最低等级，新建/恢复/换模型/配置直推共用；不换模型、不关闭压缩、不修改保存偏好。页面初始化失败保留连接与设置/服务更新入口，不吞网络断线。
- 文件：src/protocol.js、src/pi.js、src/sessions.js、public/app.js、tests/compaction-config.test.js、tests/model-onboarding.test.js、tests/model-onboarding-ui.test.js、README.md、代码索引与坑库。
- 验证：隔离临时 Pi 目录、真实 SDK 复现 off 不受支持模型的默认和显式建会话、配置更新；前端错误保持设置可达及草稿保留；全量 npm test 599 通过、2 跳过。没有调用外部模型或改动本机用户配置。

## 2026-09-15 原文对照改为逐条阅读

- 原因：JSON 日志弹窗无法与聊天对应，用户要求真正可读的原文模式。
- 内容：入口移到主题旁；桌面左右分栏，窄屏切换；逐消息纯文本、双向定位高亮、逐条复制、思考/工具折叠；移除整屏事件 JSON 和截断日志，历史与实时按消息统一保留。
- 设计：沿用 Linear 的 canvas/surface/raised、ink/muted、accent 与 mono token，8px 卡片圆角；没有新增依赖、后端接口或内容渲染器。
- 文件：public/app.js、public/index.html、public/style.css、tests/app.test.js、README.md、代码索引。
- 验证：真实 Chromium 1440px/390px 布局、无横向溢出、无页面异常；页面测试覆盖原文标签、流式、复制、会话隔离与开关，全量 npm test 验证。

## 2026-09-15 独立鹈鹕自行车动画

- 内容：新增 `pelican-bicycle.html`，以手绘 SVG 几何图形呈现自行车骑在鹈鹕背上，CSS 实现步态、颠簸、车轮旋转、围巾摆动和地面运动。
- 原因与决策：按用户字面要求采用反转骑乘关系；单文件、零依赖、离线打开，以原生复选框暂停动画，并尊重减少动态效果设置。使用 Linear 的 canvas / ink / muted / surface / accent token。
- 文件：`pelican-bicycle.html`、`README.md`、`devlog.md`。
- 验证：按用户要求不添加、不运行测试；不使用子任务、不参考本地已完成项目。

## 2026-09-14 原始输入输出诊断入口

- 内容：右上角新增 `</>`，原生 dialog + 只读 textarea 展示当前会话消息快照、输入请求和实时事件，包含子代理，标签/Markdown/HTML 均不解析；关闭面板仍记录。
- 原因：区分模型原文未包含标签与前端解析导致的内容不可见，在渲染前独立采集，不从渲染 DOM 反推。
- 决策：复用既有消息通道，无新依赖与后端接口；不收集模型配置/服务凭据，不持久化诊断日志；限最近约 2M 字符并显式提示截断，切换/重连重建快照，注明非供应商 HTTP 报文。沿用 Linear 项目 surface/ink/line/mono token、8px 文本框圆角。
- 文件：public/app.js、public/index.html、public/style.css、tests/app.test.js、README.md 与代码索引。
- 验证：页面回归覆盖原文保留、无 HTML 执行、缺 message.start 仍记录、子代理、关闭后记录、输入请求、跨会话隔离与敏感服务配置不记录；运行全量 npm test。

## 2026-09-14 更新后页面连接中：补齐标签扫描模块路由

- 根因：d99efdc 新增 public/markdown-scan.js 并被前端标签模块静态导入，但 src/server.js 未注册路由；HTTP health 正常，浏览器模块 404 导致 app.js 不执行。
- 修复：仅补静态资源路由，不改自启或 Node 支持范围；tests/server.test.js 补三个标签模块及扫描模块的 HTTP 状态、JavaScript MIME 与缓存验证。README.md 同步排障说明，knowledge.md 沉淀并重建 INDEX.md。
- 验证：新增测试在修复前明确失败于 /markdown-scan.js 404，修复后通过；npm test 534 项，532 通过、2 跳过、0 失败。Windows 本地真实 HTTP 验证，Mac 待用户更新确认。合并 origin/master a568d0b 后再次全测：539 项，537 通过、2 跳过、0 失败。

## 2026-09-14 安全点停止：两级停止 + 等待提示条 + 停下提醒点
- 原因：只有硬停，一点就把本轮正在跑的工具和已写一半的回答丢了；需要一个「跑完这一步再停」的选项，同时把会丢产出的硬停降级为需要确认的强制停止。硬停保留为逃生门：安全点粒度是一个 turn，长命令可能等很久。
- 后端：src/pi.js 在建会话时常驻安装 SDK 原生 `shouldStopAfterTurn` 钩子（loopConfig 在 run 开始就捕获该函数，运行中赋值对本轮无效），新增 `requestSafeStop()` / `safeStopPending()` 与 goal 暂停共用一个函数：先看 `safeStopPending`，再看 goal 的 `paused`，最后问 `shouldPause()`，三者都只请求「边界即停」。SDK 的 `AgentSession` 在轮次边界后还会按 `hasQueuedMessages()` 继续抽干 steer/followUp 队列，单靠 `shouldStopAfterTurn` 挡不住，因此把 `hasQueuedMessages` 一并门控为 `!stopping()`；标志因此必须闩到 `beginRun()`（prompt/reask/resume 入口）或 `abort()` 才复位，否则抽水那次查询就已经是 false。退避等待期没有 turn 边界，`requestSafeStop()` 顺手 `retry.cancel()`（无等待时 no-op，不影响在飞请求与工具）。prompt 的 catch 与 `result()` 同步改为按 `stopping()` 判定：收工导致的退避取消不当失败报错。
- src/sessions.js 新增 `safeStop(id)`：不 abort、不杀工具，只置 `safeStopping` 并发 `session.state { status:"running", safeStop:true }`；同时 `notificationsPaused = true`，否则子任务完成通知会在 idle 时调 prompt 把会话重新拉起来（与 cancel 同手法，下一次运行开始时恢复）。goal 会话转交 `goalAction(id,"pause")`（master 已有「停=安全暂停目标」的专用路径），避免同一颗按钮两套语义。收尾 idle 带 `stopped:"safe"`，`snapshot()` 在 running 时带 `safeStop`，刷新/重连不丢状态；不新增状态值。
- 协议：src/protocol.js 的 `cancel` 增加 `mode: "force" | "safe"`，缺省 `force` 保留旧客户端语义；src/server.js 按 mode 分发到 `safeStop` / `cancel`。
- 前端：public/index.html 拆为 `#stop`（安全停止，文案仍 Stop ■）+ `#force-stop`（`button.danger`，Force ⚠，弹 `#force-stop-dialog` 确认，焦点默认在取消）；新增 `#safe-stop-progress` 绿色提示条（SVG 图标 + 跳动三点，纳入 prefers-reduced-motion）；标题前 `#session-alert` 复用 `.session-attention-dot`，点击清除并 `markSessionSeen`。双按 Esc 只走安全停止；两条停止路径都先 `withdrawQueue()`。样式只用现有 token（`--success` / `--danger` / `--accent-ink` / `--line` / `--surface`）。
- 边界：主代理停下后子代理继续跑完自己（侧栏仍显示运行中）；暂停期内的子任务通知不补发；队列消息原样退回输入框；标题提醒点仅覆盖安全停止，不复用失败中断，且为页面内存态不跨标签页。goal 模式下两颗停止按钮都走 Goal 的安全暂停（保留目标进度、等子任务收尾），强停的「立即中断」语义仅对普通会话成立。
- 验证：新增 tests/safe-stop.test.js 4 个用例（真实 Pi SDK + fake SSE 子进程：工具跑完、文本不丢、stopReason 仍可 resume、resume 后正常收尾、排队消息不被抽水循环消费；`sessions.safeStop` 不 abort / 暂停通知 / 快照标志 / idle 标记；idle 幂等与强停优先；cancel 缺省 mode）；tests/goal-sessions.test.js 补 goal 会话转交暂停的回归；tests/app.test.js 补两级停止 UI 回归。
- 涉及文件：src/pi.js、src/sessions.js、src/server.js、src/protocol.js、public/index.html、public/style.css、public/app.js、tests/safe-stop.test.js、tests/goal-sessions.test.js、tests/app.test.js、README.md、devlog.md。
- 合并：与 origin/master（2c8051b，含 Goal 模式）合并时，goal 的安全暂停与本功能共用同一个 `shouldStopAfterTurn`/`hasQueuedMessages` 钩子，需合为一个函数（否则后赋值的会覆盖 goal 的暂停）；冲突集中在 src/pi.js（三处 `beginRun()`）、src/sessions.js（startRun 通知复位）、devlog.md 与生成物 INDEX.md。随后又并入 b1cee83（SQLite 持久化排查修复、goal 完成标记展示层剥离、任务结果落库口径），唯一冲突同样是生成物 INDEX.md；重点复核了 `persist()/writeChange()` 改为支持增量数组后，本功能按单对象调用仍然有效。两次合并后 npm test：539 项，537 通过、2 跳过、0 失败。

## 2026-09-14 工作空间独立会话配置

- 决策：移除具名预设；保留全局默认兜底，每个真实工作目录独立保存配置，下拉只切换编辑对象。删除配置不删除目录或会话，旧预设不迁移。
- 内容：设置页使用现有目录选择器添加配置，已配置目录下拉编辑、自动保存和删除；后端按目录隔离模型、思考、能力、重试及压缩，最近模型记忆也不跨目录。已有会话模型保持原值，压缩按配置作用范围更新。旧项目技能配置迁移保留。
- 涉及：public/app.js、index.html、style.css；src/sessions.js、protocol.js、server.js、database.js；对应前后端测试、README及代码导航索引。
- 验证：实施前基线 400 通过、2 跳过；变更后 npm test 共399项，397通过、2跳过、0失败（移除旧预设测试并补目录隔离回归）。索引已重建，git diff --check通过。删除配置时已有会话压缩也立即回落全局，其他目录不变；README迁移表述已校正为技能保留在所属目录。功能提交37eb822；随后合并origin/master（0d3386a），保留Goal模式及压缩默认开启/50%/近期5000 token，适配新增测试的Goal回调。合并后npm test：485项，483通过、2跳过、0失败；索引重新生成。

## 2026-09-14 Goal 退出与输入工具栏统一

- 原因：用户反馈缺少退出目标模式入口，目标按钮单独外框与添加/图片图标不协调。
- 决策：提供退出操作，执行中先安全暂停再退出；退出回普通对话，保留历史与产物，禁用 Goal 工具并阻止旧通知自行启动。三个输入辅助按钮共用外框，保持独立可访问操作。
- 涉及文件：Goal 状态机、Sessions、Pi 通用工具激活入口、协议、Goal UI、index/style、相关回归测试、README 与索引。
- 补充需求：新会话默认普通模式（新增从运行/暂停 Goal 新建会话回归）；底部状态栏桌面紧凑同行、手机按需换行，未填写目标不显示重新开始。
- 验证：全量 488 项，486 通过、2 跳过、0 失败；真实 Chromium mock 预览覆盖 1440/390、退出保留消息、图标共享外框、紧凑布局与新会话普通模式。一次 app.test.js 导入跳转断言失败，单独与全量重跑均通过；未修改该测试，记录时序风险。尚未重启用户日常服务验收。

## 2026-09-14 /goal 命令提示与两步填写目标

- 用户确认：支持命令提示；单独 /goal 开启任务状态，后续消息填写目标；也支持 /goal 直接带目标，保留计划确认。
- 实现：复用 clarifying 空目标状态，不增加阶段；空命令不发模型请求，下一条输入通过 supplyObjective 校验并持久化后复用普通 prompt 路径。前端复用现有命令补全，等待状态明确提示填写目标。
- 涉及文件：src/goal.js、src/sessions.js、public/app.js、public/goal.js、目标相关测试、README 与索引。
- 验证：npm test 共 477 项，475 通过、2 跳过、0 失败；新增两步目标填写与命令补全、直接发送/追加目标、等待目标提示回归。

## 2026-09-14 Goal 交付复核：迟到报告补漏

- 原因：汇总子任务最终报告时发现原测试未覆盖提前整体声明造成卡轮、首次折叠与工具组异步生成的时序问题；原全绿结果不能证明这些边界正确。
- 修复：过早的整体完成声明不再永久阻止后续合规轮次标记推进，整体验收门保持不变；观察消息容器增删，在异步工具组生成后重新应用折叠；新增 goal_progress 保存与输入校验测试。
- 决策：补充状态机与 UI 回归后再更新功能分支；在 codebase-map/knowledge.md 记录 SDK 外层队列绕过暂停的根因，保留升级复核依据。
- 涉及文件：src/goal.js、public/goal.js、tests/goal.test.js、tests/goal-ui.test.js、知识库与生成索引。
- 验证：新增 4 项回归后全量 473 项，471 通过、2 跳过、0 失败；Chromium 1440/390 验收通过。一次全量运行出现既有维护通道 UI 测试 document 销毁时序失败，原样重跑通过，未改动该测试或掩盖失败。

## 2026-09-14 Goal 目标模式：实现与验证

- 内容：新增 src/goal.js、public/goal.js/css；在 sessions/protocol/server/app/index 接入会话级目标计划、真实工具证据门、工具批次安全暂停、SQLite 恢复、跨轮 checkpoint 与自动续跑预算。src/pi.js 仅补通用上下文、工具激活、暂停与 checkpoint 入口；普通聊天不注入目标、不暴露目标工具、不自动续跑。
- 决策：暂停优先于通知/重试/重启；完成信号不能绕过真实 toolResult 引用校验；goal_progress 保存六类交接信息。证据仅为可核对材料，不证明产物必然正确。README 已按实际语义纠正文档草案。
- 验证：npm test：469 项，467 通过，2 跳过，0 失败；python tests/goal-ui.py：真实 Chromium 桌面 1440px 与手机 390px 通过，涵盖普通聊天、确认计划、执行折叠、暂停操作、无横向溢出及浏览器错误。浏览器使用 mock 会话数据，不等同真实模型长任务验收。
- 涉及文件：上述实现、tests/goal*.test.js、tests/goal-preview.mjs、tests/goal-ui.py、config/compaction-config 测试工厂投影，以及 codebase-map 索引。未新增运行时依赖。

## 2026-09-14 Goal 目标模式：外层包装 + 共享会话引擎（文档先行）

- 原因：多轮「计划—确认—执行—验收」不能把执行链路再抄一份，也不能让普通会话为此多付代价；需要先把目标行为、安全边界和架构写清。
- 内容：README 新增「Goal 目标模式」一节，并在「模块边界」补上 `goal.js`。约定：`/goal` 原地进入目标模式，模型先出计划、用户确认后才执行；每轮以独占行 `axiom_round_finished` 结算并落 SQLite，整体以独占行 `axiom_goal_finished` + 验收证据收尾，缺证据不算完成；暂停只在轮次边界生效，不 abort 正在执行的工具；`src/goal.js` 是外层包装，发送/工具/子代理/队列/压缩复用 `sessions.js` 同一套引擎，前端 `public/goal.js`、`goal.css` 只加状态条与按钮；协议新增 `goal.action`（enter/confirm/adjust/pause/resume/restart）。
- 边界：文档只写设计意图与安全边界，明确不做「绝对无漏洞」承诺，验收证据是可核对材料而非正确性证明；普通会话路径不变。
- 未做/状态：本次只改 README.md 与 devlog.md，不碰实现文件；`src/goal.js`、`public/goal.*` 及前端按钮由并行的 runtime/UI 任务实现，尚无端到端验收，README 描述目标行为，不代表已实现或已测试通过。
- 涉及：README.md、devlog.md。

## 2026-09-14 默认会话配置的后台自动压缩改为默认开启
- 原因：新会话一律要手动去默认配置里勾选才能用上后台压缩，默认值偏保守。
- src/protocol.js compactionDefaults 改为 enabled: true、percentThreshold: 50、keepRecentTokens: 5000（token 阈值仍 100000）；public/app.js 的同名前端默认值保持同源同步。
- tests/compaction.test.js、tests/app.test.js 的默认值断言同步；预设编辑器断言改为校验它取会话配置而非被编辑的默认值。README「后台自动压缩」一节同步描述。
- npm test：402项，400通过、0失败。

## 2026-09-14 提问卡紧凑布局与切题稳定
- 原因：各题高度不同让底部输入区上下移动；原卡片留白和独立滚动过多。
- public/question.js 按当前宽度测量同组最高题面并保持高度，宽度变化重测；选项聚焦使用 preventScroll 避免浏览器自动滚动。public/question.css 改紧凑题签/无框选项行/行内说明，主题使用现有变量；卡片取消独立滚动，超长题由输入区滚动；手机收起态仍显示待答卡。
- README同步。Chromium验证切题前后题签y坐标完全一致，左右键切题有效，卡片overflow为visible；npm test：401项，399通过、2跳过、0失败。


## 2026-09-14 主代理交互式 question 工具

- 决策：仅主代理注册；工具描述和字段定义足够，不增加系统提示词；前端回答就是等待中的工具输出，不插入新聊天消息、不引入通用表单或依赖。
- 内容：新增 src/questions.js（问题/选项说明、单多选、内存等待与取消、答案校验）；sessions 注册/快照/取消接入，protocol/server 增加 question.reply；前端多题选项卡和自由输入，左右切题、上下聚焦、空格选择、Enter 下一题/统一提交。
- 边界：会话隔离、重复提交一次生效、断线快照恢复、停止/关闭释放等待；不支持跨服务重启续答，子代理工具数组不变。
- 验证：新增 tests/questions.test.js 覆盖真实 WS 命令、等待/返回、输入校验、主子工具隔离、取消和关闭；真实 Pi SDK + 本地 fake SSE 验证答案进入下一轮 tool 消息、abort 释放；jsdom UI 回归通过；浏览器实际验证键盘多题、单多选、自定义、提交结果及焦点恢复。全量 npm test：396 项，394 通过、2 跳过、0 失败。旧子任务未正常返回完成通知，前端和新增测试由主代理接手完成/修正。
- 涉及：src/questions.js、src/sessions.js、src/protocol.js、src/server.js、public 提问组件与入口、tests、README.md、代码索引。

## 2026-09-14 侧栏「待查看」：跑完的会话不用再逐个点开

- 诉求：并行多个会话时 AI 跑完、绿点熄灭后就和其他会话长得一样，只能反复点开找哪个刚出结果。
- 结论（讨论了四个方案）：不做系统通知/标题计数；不给每组上色（设计规范只允许一个彩色强调色）；不加粗、不降字色、不加分组标题、不加横线（侧栏已有日期分线，再加一层横线等于一个视觉手段背两种语义）；最终只用「顺序 + 圆点颜色」。
- 内容：
  - public/app.js：新增 `localStorage` 的 `axiom.sessionSeen`（会话 id → 打开时刻）与 `markSessionSeen()`；未读判定 `状态 idle && seen 有记录 && updatedAt > seen`，无记录一律算已读，避免首次加载把全部历史会话标成未读。
  - 排序改为 `rank`（运行中 0 / 待查看 1 / 已读 2）优先、再按 `updatedAt` 倒序（原来是 `createdAt`），与后端 `sessions.list()` 的口径一致；日期分隔线随之改用「最后活动时间」。
  - `session.state` 转 idle 时给当前会话补记 seen：只看渲染时的 `s.id !== sessionId` 排除不够，否则正在看的会话跑完、切走后会被错标成待查看。storage 事件同步 `axiom.sessionSeen` 到其他标签页。
  - `updateSessions` 的比较键补上 `updatedAt`：原来只比 `createdAt ?? updatedAt`，只动 `updatedAt` 的「跑完」不会触发列表重绘。
  - public/style.css：`.session-attention-dot` 复用 8px 实心圆形状，颜色用 `--accent-ink`（暗色 #828fff；`--accent` 在近黑底上偏暗）。分组名、绿点、手动「已完成」归档均未改动。
  - tests/app.test.js：排序断言改为「运行中置顶、其余按最后活动倒序」；新增待查看点的可见性、`aria-label`、`markSessionSeen` 落盘与 idle 事件补记断言（`seenSessions` 是模块作用域的 `let`，测试需通过同一段 eval 暴露的 `window.setSeenSessions` 写入）。
  - tests/session-sidebar-ui.py：fixture 改为显式 `updatedAt`，补主题色点颜色（rgb(130, 143, 255)）、`aria-label` 与日期分线断言。
- 验证：`npm test` 384 项、382 通过、0 失败、2 跳过（既有 SKIP）。Playwright 真实截图确认顺序为运行中 → 待查看 → 已读、两点颜色与日期线正确。session-sidebar-ui.py 新增断言全过，末尾移动端 `#toggle-sidebar` 点击 30s 超时在 master 上同样复现，属本环境既有问题，非本次引入。
- 未做：不改后端、不建表、不加未读计数/通知；`updatedAt` 也会被重命名刷新，重命名后可能多标一条待查看（已知小瑕疵，需要时在重命名回执里补记 seen）。
- 涉及：public/app.js、public/style.css、tests/app.test.js、tests/session-sidebar-ui.py、README.md、devlog.md。

## 2026-09-14 配置热更新：开发期静态资源免重启 + 默认压缩配置直推已加载会话

- 诉求：“改了设置每次都要重启”。先拆清“重启”到底是为了什么：改前端代码要重启（静态资源启动时一次性读入内存）、改默认压缩配置要重启（已加载会话不采用新值）两个原因各自独立，本轮分别消除；源码全局热重载、运行中会话热换技能/插件/MCP 不在本轮范围。
- 改动一（`src/server.js`）：抽出 `load()` 统一读取资源并记录 mtime，`freshen()` 在请求时比对 mtime，变了就重读并重算 ETag。`dev` 标志在模块加载期读一次 `AXIOM_DEV === "1"`，生产路径首行就 return，零额外 IO、行为不变。`statSync` 在编辑器保存瞬间可能读到临时缺失，故 try/catch 后沿用旧字节，不把一次竞争变成 500。新增文件仍需重启（路由表启动期构建）。
- 改动二（`src/sessions.js` 的 `saveDefaults()`）：保存带 compaction 的默认值后，遍历 `this.items` 把新压缩配置推给已加载会话。依据是压缩本来就是全局口径：`ensureLoaded` 恢复会话时总以默认值覆盖 `saved.selection.compaction`，且前端从不向已有会话单独下发 compaction（`session.configure` 只带 model/queueType/subagentModel/thinking），所以不存在被覆盖的“用户自设会话值”，直推只是把重启后的既定结果提前。调 `configure` 必须带会话原 `model`（从 `item.agent.config().model` 取），否则 SDK 会招“模型当前不可用”；跳过 `configuring` 中的会话避免抢锁；单会话失败（如模型不支持该思考等级）吃掉，继续保持 `saveDefaults` 原有的“不抛”契约。
- 不做 `retry` 词表直推：retry 是会话级配置（`item.retry` 单独存盘、不被默认值覆盖），强推会覆写用户在单会话上的意图，语义与压缩不同。
- 不采用 `--watch`：沙箱实测过（`fork` + `execArgv:["--watch"]`）技术上可行，IPC 在文件变更重启后仍存续，子进程能再次完成 `service.ready` 握手，守护进程的 `onMessage` 也会忽略 Node 自发的 `watch:import` 消息。但代价是每次存盘杀掉进程内所有活动会话与运行中任务，且会与 `service.mjs` 的崩溃退避计数相互干扰（主动重启被计作崩溃），收益不抵风险，暂不接入。
- 验证：`npm test` 384 个用例，382 通过、2 个既有跳过、0 失败。新增 `tests/dev-assets.test.js`（必须先设 `AXIOM_DEV` 再动态 import server.js，因为标志在模块加载期读；改 `public/style.css` 后断言 ETag 变化、旧 ETag 不再命中 304，finally 还原原字节）。`tests/defaults.test.js` 补一例：注入 live/broken/cold 三个假 item，断言只推 live、broken 报错不影响保存、cold 不被碰，且不带 compaction 的保存不骚扰任何会话。`tests/compaction-config.test.js` 重启前的断言从“会话保留自己的压缩配置”改为“保存即推”，重启后的断言不变。
- 另做真实端到端冒烟（隔离端口，不碰用户开发服务）：dev 下改 `public/app.js` 后同一进程内二次请求即返回新 ETag 与新正文；生产下同样改动被忽略（ETag 不变、不含探针），确认未改动生产行为。两个冒烟脚本用完删除，文件字节已校验还原。
- 涉及文件：`src/server.js`、`src/sessions.js`、`tests/dev-assets.test.js`（新增）、`tests/defaults.test.js`、`tests/compaction-config.test.js`、`README.md`、`devlog.md`、codebase-map 索引。

## 2026-09-14 重试词表重新打开为空的二次排查

- 用户在 macOS/Windows 继续反馈回车消失、关闭配置再打开为空。上次只验证事件与保存请求，没有验证重新加载后的标签，结论不完整。
- 根因：`retryChipList` 从 initial 恢复 state，却漏调首次 render；已保存词不可见，再输入同词被去重并清空输入，视觉上像再次丢失。最小修复是在返回组件前调用 render，增删与后端语义不变。
- 实机证据：只读请求 Windows 4319 的 /app.js，仍返回 add() 旧实现、没有 commit/notify；运行中静态资源与磁盘代码不同，不能用 git HEAD 代表服务已部署。未擅自重启正式服务。
- 验证：tests/app.test.js 补关闭重开和重复输入可见性；撤掉这行修复后断言实际 []、期望 [stream error]，恢复后通过。tests/retry-settings-ui.py 在隔离 Chromium + 真实 HTTP/WS/Sessions 预览验证 Enter、保存回执、重开、重复、整页刷新和删除，无模型请求、不碰用户配置。
- 涉及文件：public/app.js、tests/app.test.js、tests/retry-settings-ui.py、README.md、devlog.md、codebase-map 索引与知识库。

## 2026-09-14 自动重试词表配置不保存

- 现象：「设置 → 默认新会话设置」里的自动重试白/黑名单，输入关键词回车后看着加上了，但关面板再打开就空了，配置也不生效。
- 根因：默认配置面板没有保存按钮，唯一保存路径是 `create-form` 的 `change` 冒泡触发 `requestSubmit()`。而 chip 的增删全是脚本改状态：Enter 上 `preventDefault()` 连隐式提交都没有，浏览器不会为脚本改动发 `change`；`add()` 里把 `input.value` 清空还顺手重置了输入框的脏值标记，导致后续失焦也不再发 `change`。Playwright 实测三种路径均无事件。压缩配置用的是原生 select/checkbox，自己会发 `change`，所以只有重试词表中招。
- 内容：`public/app.js` 的 `retryChipList` 把 `add()` 拆成 `commit()`（提交待定词，返回是否真的改了状态）与 `notify()`（派发 `bubbles: true` 的 `change`）；Enter、Backspace 删末尾、× 删除三条路径改完状态后都派发一次。另加 `input.onchange = () => { commit(); }`：只打字没回车就失焦/关面板时，浏览器的 `change` 先到 input 再冒到 form，这里补提交，form 读到的状态已含该词，不静默丢字；自己派发的合成 `change` 回到这里时输入框已空，是空操作。
- 后端未改：`selection.retry` → `workspaceDefaults` → `create` → `createAgent` → `createAutoRetry({ patterns })` 全链路本来是通的，词表只在建会话时绑定，「仅对新建会话生效」是设计如此。
- 测试：`tests/app.test.js` 压缩设置用例里补一段，覆盖回车添加即保存、重复词（不区分大小写）不入表、失焦补记、× 与 Backspace 删除同样触发保存。写用例时踩到一个坑：前一段刚把压缩阈值清空成无效值，提交会在压缩校验处 `return`，测不到重试词表，故先恢复合法阈值。回滚 `app.js` 验证过该用例确实失败。
- 涉及文件：`public/app.js`、`tests/app.test.js`、`README.md`、`devlog.md`。

## 2026-09-14 空格对齐的纯文本表格转成网页表格

- 诉求：会话里一张呼叫报表（日期/方向/呼叫量/接通率…）以纯文本块展示，问能不能优化。旧逻辑只认 `+---+` 边框表格，这类靠空格对齐的表只能走字符网格对齐，看上去仍是一堆等宽文本。
- 内容：`public/markdown.js` 把 `asciiTable` 拆为 `borderedRows` + 新增 `alignedRows`，共用 `textTable` 建表。`alignedRows` 按显示宽度（宽字符占两格，第二格标 `null` 以区分于真空白）建网格，以「每行都空的 ≥ 2 格空白」作列界，单个空格归入单元格（`2026-09-12 六` 不被拆）；`-----` 分隔行不当数据，只记位置并给下一行上 `row-rule`。`style.css` 新增 `.cell-number`（右对齐 + `tabular-nums`）、`tr.row-rule` 上边框、`table.table-aligned` 单元格不折行且按内容定宽。
- 为何加「对齐不一致就不转」守卫：测试时用手敲的（列未对齐）样例，结果把「日期」「方向」并成一格，单元格里残留一串空格。现在拆完后若任一单元格内仍含 2 格以上空白，说明列划分是猜的，直接保留原文。
- 为何加表头判定：`ls -l` 这种没表头的输出会把第一行数据当成 `th`，屏读和视觉都是错的。现在若某列数据全是数字、首行同列也是数字，则不出 `thead`。边框表格有显式分隔线，仍无条件有表头。
- 为何单元格不折行：390px 下首版会把 `2026-09-12 六` 折成两行。这类表每格原本就是一行文本，9 列无论如何都要横向滚动，折行只是把行变高，不能免滚动。
- 涉及文件：`public/markdown.js`、`public/style.css`、`tests/markdown.test.js`、`README.md`。
- 验证：`node --test --test-timeout=120000 tests/*.test.js` 全绿（380 pass / 0 fail / 2 skip）。jsdom 用例覆盖：9 列报表的列切分与合计行分组线、数字列标记、复制保留原文、切回原文、`ls -l` 无表头，以及 5 类不该转表的输入（非文本语言、对齐被破坏、两列、含双空格的说明段、目录树）。另用临时 CDP 脚本在真 Chrome 1440/390 渲染截图目检（数字右缘对齐、分组线 2px、页面无溢出），脚本用完删除。

## 2026-09-14 浅色主题的用户消息换成品牌紫并加深

- 诉求：上一轮把浅色卡片从 5% 蓝加到 8% 仍不够看，要求「换个显眼的颜色，并加深一些」。
- 内容：`.message.user` 浅色支换成 `--accent`（品牌紫 #5e6ad2），底 25% / 边框 50% → #d7daf4 / #a2a8df；深色支本来就够看，保持 info 蓝 5%/20% 不动。同时把浅色的 `--info` `--highlight` `--thought` `--muted` 各压黑 3–13%（#2d6cba→#2961a7、#96650b→#83580a、6b4fbe→#684db9、#62666d→#5d6168）。
- 为何必須动 token：上轮卡在 8% 就是因为浅色正文 token 在白底上本身只有 4.7–4.9 的对比度，几乎没余量，底色一深就跌破 4.5:1。真正的瓶颈在 token，不在百分比，所以这次改根。压黑幅度胉眼分不出，但白底对比度从 ≈ 4.8 升到 ≈ 6.2，全局只变好。深色支一律未动。
- 为何停在 25%：这是「不再动其余 token」前提下的上限，卡片上 `strong` 4.51、`em` 4.53、`del` 4.50、链接 4.52，全部贴线达标。考过 amber 16%（不用改 token）但像警告卡，也试过 accent 18%（不够显眼），四档并排渲染后选的 25%。
- 副作用排查：四个 token 是全局的，掂了一遗「浅色主题里的深色底」——那种地方文字压深会反向变糟。`tooltip.css` 浅色用 #2b2d33 深底，但文字是硬编的 #f7f8f8，不含这四个 token；其余命中处（`::backdrop`、task-card、skill-invocation、表头、code-toolbar）都是浅底上的深文字或纯背景，只会更清楚。
- 验证：纯 CSS 变更。临时 Playwright 脚本加载真 `style.css` 渲染卡片，逐个元素读 computed color 与向上最近的不透明背景、算实测对比度：浅色 15 项全过（最低 4.50），深色 15 项全过（最低 8.19），并截图目检。坐标坑：Chromium 把 `color-mix` 输出成 `color(srgb 0.84 …)` 的 0–1 浮点，按 0–255 解析会得到全面假不达标；已在脚本里归一化后重跑。验证脚本用完删除。代码侧无人断言这几个色值（已 grep tests/ 与 public/）。
- 涉及：public/style.css、devlog.md。

## 2026-09-14 浅色主题的用户消息卡片加深

- 诉求：白色主题下用户消息跟背景几乎分不开，要求加深一点。原来 `.message.user` 两个颇色都是单一值（底 `--info` 5% + 边框 20%），深色底看着刚好，浅色底因为 `--surface` 是纯白（5% 蓝 ≈ #f5f8fc）基本看不出来。
- 内容：`public/style.css` 把背景与边框改成 `light-dark()` 包两份 `color-mix`，浅色底 8% / 边框 28%（#eef3f9 / #b2c4dd），深色底原值不动。`light-dark()` 只接受 `<color>`，百分比位置写不进去，所以是两支各写一份而不是抽变量（本文件的 `[data-theme]` 规则只管 `color-scheme`，不堆 token）。
- 为何停在 8%：卡片内正文要对比度 ≥ 4.5:1，约束最紧的是 `--highlight`（#96650b，粗体 14px，不到大字可用 3:1 的档）。逐档算了一遍：8% 时 4.53，9% 就跌到 4.47、12% 只剩 4.29。其余正文 token（body-ink 9.23、code-ink 4.71、thought 5.41、success 4.56、danger 4.85、info 链接 4.76）在 8% 全部过线。
- 遗留：要再深得先把浅色的 `--highlight` 压深（目前它在白底上本身就只有 4.72，余量很薄），超本次范围。
- 验证：纯 CSS 变更，无 JS 涉及。临时用 Playwright 加载真 `style.css` 渲染卡片，读 computed style 确认两个主题取值（浅 srgb 0.934/0.954/0.978 = #eef3f9；深 0.086/0.098/0.111 与改前一致）并截图目检，验证脚本用完删除。
- 涉及：public/style.css、devlog.md。

## 2026-09-14 复选框不再被全局输入框撑错行；思考等级勾选与会话选择器对齐

- 症状一：「预设会话配置」弹窗里「固定使用此工作目录」的复选框单占一行，说明文字掉到下一行并下坠。根因是 `public/style.css` 的全局 `input { width: 100%; padding: 8px 12px; min-height: 40px }` 也命中了 checkbox：布局盒被撑到 40px 高，WebKit/Blink 把 13px 的原生控件画在盒顶、同行文字按基线落到盒底，于是看起来就是错行。以前只在出事的地方零星打补丁（`.capability-options input`、`.trust-row input`、`.mm input[type="checkbox"]`），漏一个就错一个。
- 修法一：在全局 `input` 规则旁补 `input[type="checkbox"], input[type="radio"] { width: auto; min-height: 0; padding: 0 }`（属性选择器特异性胜出，与声明顺序无关），一处就兑平所有复选框/单选框；同时删掉因此冗余的 `#preset-fixed-cwd { width: auto }`。不动已有的局部补丁（那些还带 `accent-color` 等其它样式），也没顺手改 label 布局。
- 症状二：模型设置里 kiro/claude-opus-5 只勾了两个思考等级，但会话里的等级下拉框全部可选。根因是两边算法不同：下拉框用目录的 `levels`（`src/pi.js` 由 SDK `getSupportedThinkingLevels` 算出——reasoning 模型里未显式映射的等级默认**可用**，只有 xhigh/max 需显式映射、写 null 才禁用）；而 `public/model-manager.js` 的 `thinkingFields` 拿 `model.levels` 做勾选基线，自定义供应商的模型行来自配置原文、根本没有 `levels` 字段，回退成空数组 → 实际可用的等级被画成未勾选。
- 修法二：`thinkingFields` 添 `providerId` 入参，`model.levels` 缺失时回退到 `state.catalog` 里同 provider+id 条目的 `levels`。只修显示基线，不在前端复刻 SDK 规则（避免两处语义分叉），也不往保存载荷里塞 `levels`（那会把目录字段写进用户配置）。勾选行为本身是对的：取消勾选写 null 确实会禁用该等级。
- 遗留：未保存的新模型行在目录里查不到，思考等级仍全空（保存后就正常）；「支持推理」开关切换时不联动刷新勾选，两项都超本次范围。
- 测试：`tests/app.test.js` 在现有 CSS 用例里断言 `#preset-fixed-cwd` 的 min-height/padding/width 与 `#preset-name` 仍为 40px；`tests/model-manager.test.js` 新增用例：自定义供应商行只带两个映射、目录给六个等级时，勾选必须是六个。**反向验证**：分别拿掉两个修复后对应用例各自失败，确认能守住。另用 Playwright 渲染弹窗对照：修前 checkbox 盒 13×40 / label 高 49.39，修后 13×13 / 21。
- 验证：全量 `npm test` 371 项：369 通过 / 0 失败 / 2 跳过（23.8s）。
- 涉及：public/style.css、public/model-manager.js、tests/app.test.js、tests/model-manager.test.js、devlog.md。

## 2026-09-14 前端启动链不再被单条坏会话卡死

- 症状：用户报「这个会话无法加载不能阻塞程序连接啊」。库里一条坏会话（历史文件缺失）就让整页连不上：红字 +「连接已断开，正在自动重连」无限循环、退避到 15s，其他会话也进不去；清掉那条记录后立刻恢复。
- 根因：`public/app.js` 启动链里「URL 无 `sessionId`」的分支只 attach `sessions.list()` 的第一条（列表按 updatedAt 倒序，第一条正是最新那条坏会话），而且**没有** try/catch。`session.attach` → `src/server.js` 的 `sessions.ensureLoaded()` 抛「会话历史文件缺失」，异常冒到外层 `catch` → `error()` + `ws.close()` → `finally` 里 `scheduleReconnect()` → 重连后又走同一段 → 死循环。对比之下 `sessionId` 分支（原工作空间新建 + 保留草稿）和 `switchSession()` 都有降级，唯独这条路径漏了。
- 内容：该分支改为遍历 `existing` 逐条 `session.attach`，失败跳过并记入 `failed`；有可用会话时只 `console.warn`（页面整体是好的，不占错误区），全部不可用（紧接着要新建）才 `error()`；循环后 `if (!state) state = await request("session.create")` 兜住空列表。服务端 `ensureLoaded()` 的严格语义**不动**——真数据丢失要让用户知道，但不该被放大成连接失败。
- 测试：`tests/app.test.js` 第一个 harness 加 `attachError` 开关（`session.attach` 对 "a" 返错）与 `window.sessionState()` / `window.openPageAs()` 探针；末尾新增用例「无 session 启动 + 列表首条坏掉」，断言 `{connected: true, sessionId: "b", error: ""}`。**反向验证**：`git stash` 掉 app.js 修复后该用例失败并复现用户现场（`connected:false`、`sessionId:undefined`、红字正是「会话历史文件缺失…」），确认测试真能守住。
- 涉及：public/app.js、tests/app.test.js、README.md、.pi/skills/codebase-map/knowledge.md。
- 验证：定向 `node --test tests/app.test.js` 3 项全过；全量见下条记录。

## 2026-09-14 修复新建空会话被写成打不开的库记录
- 内容：`src/sessions.js` 新增模块级 `landedSessionFile(item)`：只有 `item.agent.sessionFile()` 指向的文件真的存在才返回路径，否则返回 `null`；`sessionData()`（落库）与 `list()`（侧栏）改用同一个函数。新增 `tests/session-flow.test.js` 用例：新建会话后断言库与列表里都是空路径、重启后 `ensureLoaded` 按空会话打开、真实落盘后路径才进库。README 补一句说明。
- 原因：Pi 的 `SessionManager` 是惰性落盘的——`create()` 返回时就确定了 `sessionFile` 路径，但文件要等第一条消息才写。旧代码在 `sessionData()` 里直接 `item.agent.sessionFile()` 入库，于是「新建会话 → 没发消息 → 重启」这条极普通的路径会永久造出一条坏记录：`ensureLoaded()` 查 `existsSync(saved.sessionFile)` 为假 → 报「会话历史文件缺失，已保留数据库记录」，而该文件永远不会被创建，这条会话就永久打不开了。用户 Mac 上的截图就是这个报错，且重装（包括换版本）治不好：库里的坏记录不会因重装而消失。
- 决策：不去改 `ensureLoaded()` 的严格语义。`tests/session-migration.test.js` 的 ghost 用例明确要求「只有打开时检查历史，不创建空 JSONL」且要逐字节保留库记录（临时不可用的历史文件——如同步盘未挂载——在文件回来后仍能恢复，不固化空历史）。真正的根因是**写入**了不曾存在的路径，所以只堵写入侧；判据用“文件是否真的在磁盘上”，不引入任何启发式猜测。`list()` 一并改用同一函数：前端本来就按 `sessionFile` 为 `null` 渲染「该会话还没有 JSONL 文件（发送首条消息后生成）」，两处口径因此一致。
- 遗留：修复前已经写进库的假记录仍需手动处理（打开会继续报错，没有安全的自动判据能区分「空会话的假路径」和「真被删掉的历史」，猜错就是静默丢数据）；在侧栏删掉该会话记录即可。
- 验证：`tests/session-flow.test.js`（9 项）与 `tests/session-migration.test.js`（7 项，含 ghost 语义回归）全绿；全量 `npm test` 370 项：368 通过 / 0 失败 / 2 跳过（24.6s）。
- 涉及：src/sessions.js、tests/session-flow.test.js、README.md、devlog.md。

## 2026-09-14 axiom 改为后台启动的服务命令
- 内容：`scripts/service.mjs` 的 CLI 分派重写。`axiom`（无参数）不再前台常驻，改为 `startBackground()`：`spawn(process.execPath, [..., "--foreground"], { detached: true, stdio: "ignore" })` 后轮询 `/health` 至就绪，打印地址与日志路径即返回，已在运行则只提示不重复启动。新增 `axiom --foreground`（`-f`）保留原前台行为，供调试与直接看日志。新增 `localPort()`/`localAddress()`/`homeDir()`/`openPage()`/`firstRunGuide()` 并导出；`serviceReady()` 与 `startBackground()` 由 `install.mjs` 复用，删掉其重复的 fork + 探活循环。新增 `scripts/autostart.mjs` 的 `isEnabled()`。首次引导把「注册登录自启」「打开页面」两个问题只问一次，标记写在 `AXIOM_HOME/.guided`，`axiom-setup` 结束时也写同一标记。README 的安装与启动章节同步。
- 原因：用户报告两件事：①`axiom` 在终端前台常驻，关掉终端窗口服务就没——macOS 关窗发 SIGHUP 给前台进程组，守护与 worker 一起死，页面表现为「连接已断开，正在自动重连」，这正是把「清理后重装仍不可用」串起来的一环；②`npm install -g` 之后没有任何引导，用户不知道要跑 `axiom-setup`，于是没注册自启、也没打开过页面。修的过程中又确定三个既有缺陷：`fork()` 的 IPC channel 会拖住父进程，`.unref()` 不够，`axiom-setup` 跑完不返回终端；日志路径硬编码 `join(homedir(), ".axiom")`，设了 `AXIOM_HOME` 时提示的路径是错的；`AXIOM_PORT` 没校验，坏值要走到 `fetch` 才报一句看不懂的 `Invalid URL`。
- 决策：`axiom` 的职责就是服务生命周期（起/停/卸载），安装引导仍归 `axiom-setup`；`axiom` 只补问一次自启与开页，不每次启动都问（用 `AXIOM_HOME/.guided` 一次标记，删 `~/.axiom` 才重新问）。子进程用 `spawn` 而非 `fork`：后台启动不需要 IPC，而 `fork` 的 IPC channel 会拖住父进程。子进程必须显式带 `--foreground`，否则无参数分支会再走一次 `startBackground` 无限派生。`localPort()` 接受 `0`：`tests/service.test.js` 一直用 `AXIOM_PORT=0` 当“不监听真实端口”的哨兵，且 `installTag("http://127.0.0.1:0", root)` 直接依赖该字面量。空值按 `||` 回退 4319，与 `src/main.js` 一致（不是 `??`）。
- 验证：`tests/service.test.js` 的 `startDaemon` 改 spawn `--foreground`（否则后台化后测试拿不到前台管道）；`tests/install.test.js` 新增 `localPort` 边界、`serviceReady`（真实 HTTP 服务，含非 2xx）、`startBackground` 已在运行不派生进程、`firstRunGuide` 非交互不写标记；`tests/cli-help.test.js` 新增 `--foreground` 参数校验与「`AXIOM_PORT` 非法即早退出、不等 stdin」。全量 `npm test` 369 项：367 通过 / 0 失败 / 2 跳过（24.6s）。本机实测：`axiom` 后台启动 1.6s 返回且关掉父 shell 后服务仍活（下次调用报「服务已在运行」），`axiom --foreground` 正常前台运行，`axiom stop` 正常退出。macOS/Linux 未实机运行，SIGHUP 隔离依赖 `detached` 的语义，未在真机验证。
- 涉及：scripts/service.mjs、scripts/install.mjs、scripts/autostart.mjs、tests/service.test.js、tests/install.test.js、tests/cli-help.test.js、README.md、devlog.md。

## 2026-09-13 修复导入会话用例的 hash 竞争
- 内容：`tests/app.test.js` 导入会话那段（点 `#file-picker-confirm` 之后）不再靠一次 `settle()` 就断言 `location.hash`，改为轮询等 `session=imported` 出现（上限 300×20ms，只防卡死）。
- 原因：上一条修复合入后，全套跑偶发挂在 `assert.match(window.location.hash, /session=imported/)`（收到 `'#session=a'`）。按钮处理器是 `await switchSession(...)` 的即发即忘调用：`session.import` 请求确实发出了（`lastImport` 断言在前面已通过），但 hash 要等响应回来走完 `snapshot(state)` 才改，一个 `setImmediate` 不保证这条异步链跑完。属既有的「按固定 tick 数往下走」写法，与上一条改动无关——把 `sleep(1100)` 那处改回原样后同样跑不出差异（空机器各 8 轮全绿）。
- 验证：单跑该用例通过（3.2s）；空机器全套 4 轮全绿（360 过 / 0 失败 / 2 跳过）；32 个忙循环进程压着再跑 2 轮全绿（100.2s / 101.5s，跑完确认 hog 仍是 32）。reindex 124 文件 0 未登记，`tests/codebase-index.test.js` 通过。
- 涉及：tests/app.test.js、devlog.md、.pi/skills/codebase-map/INDEX.md。

## 2026-09-13 修复测试在机器负载下的随机失败
- 内容：`tests/service.test.js` 假 worker 的启动期文件操作（`workers` 计数、`maint-env.tmp` → `maint-env` 原子改名、`workerPid`）加有限次退避重试，`uncaughtException` 处理器提到最前面；`until` 默认上限 12s → 60s，删掉 `served-during-install` 那处 8s 覆写；`teardown` 的 `rm` 加 `maxRetries: 20, retryDelay: 100`；维护 HTTP 用例的 `request` 超时 3s → 30s 并补 `req.on("timeout", () => req.destroy())`。`tests/app.test.js` 把等重连的固定 `sleep(1100)` 换成轮询。`package.json` 的 `test` 加 `--test-timeout=120000`，随后删除 6 处按空机器估的 `{ timeout }` 覆写（model-config、pi-model-storage、service-settings-api、service-settings、service、workspace-isolation）；`install`/`cli-help`/`uninstall` 的 `spawnSync` 上限统一提到 60s（`spawnSync` 不继承 runner 上限）。
- 原因：真正的根因只有一个，是测试夹具的 Windows 文件锁竞争，不是产品缺陷、也不只是超时太紧。`service.log` 抓到崩溃栈：假 worker 在模块加载期 `renameSync('maint-env.tmp', 'maint-env')` 报 `EPERM`（杀软/索引器瞬时占用新建文件，负载高时窗口变大），而这行在 `uncaughtException` 注册之前，于是进程直接以 code 1 退出、连 `worker-error` 都没留下。守护进程按“worker 崩溃”正确地自动重启，多出一个实例，`rebuild * failure restores old dependencies` 断言的 worker 数就从 3 变 4（或 2 变 3）。`src/pi-model-storage.js:69` 早就记录并处理过同一风险，夹具漏了。剩下的时限类改动是第二层：那些墙钟上限按空机器估，负载下会误判。
- 决策：时限一律视为“防永久 hang 的兜底”，不是性能断言，因此用 runner 级 `--test-timeout=120000` 取代手调的分散字面量（删除优于调参）；`until` 保留自己更清楚的 `until 超时` 报错。重试策略照抄 `pi-model-storage` 的既有写法（EPERM/EBUSY/EACCES，有限次退避），不新造机制。`rebuild` 的 worker 数断言保持严格：它验证的是“不会重复拉起实例”，根因修好后不该放宽。330ms 那几处等防抖窗口过期的固定 sleep 未动，负载只会让墙钟变长，不会短。
- 验证：32 个 node 忙循环进程压满 16 核（CPU 100%，每轮跑前后确认存活）下，`npm test` 连续 3 轮全绿（360 通过 / 0 失败 / 2 跳过，98~102s，空机器 23s）。修复前同样负载下：`rebuild * failure restores` 12 轮里 2 轮失败，修复后 12 轮 0 失败；`page preserves drafts` 也在压测中暴露并修掉。
- 涉及：`tests/service.test.js`、`tests/app.test.js`、`tests/install.test.js`、`tests/cli-help.test.js`、`tests/uninstall.test.js`、`tests/model-config.test.js`、`tests/pi-model-storage.test.js`、`tests/service-settings.test.js`、`tests/service-settings-api.test.js`、`tests/workspace-isolation.test.js`、`package.json`、重建 `INDEX.md`、`devlog.md`。

## 2026-09-13 明/暗主题切换与侧栏字号下调
- 内容：右上角新增 `#toggle-theme`（太阳/月亮图标，`aria-pressed` 标记浅色）。`public/style.css` 的 `:root` 重写为单一 `light-dark()` token 表，`:root[data-theme]` 只翻 `color-scheme`；新增 `--line-strong`/`--on-accent`/`--accent-hover`/`--hover`/`--shadow-soft|mid|strong`，约 30 处硬编码颜色改为 token 或 `color-mix`。`file-picker`/`model-manager`/`model-picker`/`tooltip` 四个 css 同步 token 化（提示浮层在浅色下反转为暗色芯片）。侧栏字号 aside 13px、品牌 19→17px、侧栏内次级文字 12→11px。
- 原因：白天使用需要浅色底；浅色调色取 Linear light / GitHub Primer / Vercel Geist 三家成熟方案的交集。侧栏字号偏大，抑制后主区对话更突出。
- 决策：默认暗色，不跟随 `prefers-color-scheme`，只认显式切换，存 `localStorage` 的 `axiom.theme`。首屏前由阻塞加载的 `public/theme.js` 写 `data-theme` 防闪白（CSP 禁 inline script，故独立文件 + 服务端资源表登记）。强调色底文字固定 `--on-accent: #ffffff`（#5e6ad2 与浅色 `--ink` 不足 4.5:1）。`::backdrop` 遮罩继承不可靠，继续用字面值。
- 修复：`.icon-button:hover`（0,1,1）输给通用 `button:hover:not(:disabled)`（0,2,1），悬停变成实心强调色底配 `--ink`（浅 2.81 / 暗 2.7，旧版就已存在）；补上 `:not(:disabled)` 后恢复 10% 强调色淡底。
- 验证：Playwright 逐面截图复核设置弹窗、新建会话、提示浮层、右键菜单、文件选择器、模型面板/自定义下拉、任务弹窗、补全弹窗、展开工具记录、diff 加减色、手机侧栏；对比度扫描（含 hover、按祖先背景做 alpha 合成）两个主题零失败。把新 css 的 `light-dark()` 折叠到暗色分支后与旧版逐行比对，确认暗色无回归（仅 `summary` 与 `.selectors select` 两处遗留 `#d0d6e0` 正式归入 `--body-ink`）。npm test 362 项全绿（service.test.js 并发下偶现 EBUSY 抖动，单跑 17/17）。
- 涉及：`public/index.html`、`public/theme.js`（新）、`public/app.js`、`public/style.css`、`public/{file-picker,model-manager,model-picker,tooltip}.css`、`src/server.js`（静态资源表）、`.pi/skills/codebase-map/scripts/reindex.mjs` + 重建 `INDEX.md`、`README.md`、`devlog.md`。

## 2026-09-13 同步最新 master 后复验
- 合并 origin/master（68e361b），保留手机阅读、GitHub 图标等并行改动；测试冲突按上游移除文字对比模块、本分支新增 model-auth 加载合并，日志和知识库保留双方记录，索引重建。
- 合并后 npm test：362 项，360 通过、2 跳过、0 失败（上游删除文字对比模块对应测试，故总数比合并前减少）；git diff --check 通过。

## 2026-09-13 统一模型配置与历史会话恢复：集成验证
- 内容与原因：供应商不再分内置只读/自定义；模型字段覆盖保留未编辑定义，七级思考勾选与高级映射同步。配置页直接桥接 SDK 登录/登出，凭据仅落 SQLite，连接隔离、取消/超时与错误脱敏。首次导入门闩关闭后不跟随 Pi 文件，不双写。
- 会话修复：历史恢复使用完整定义验证暂未鉴权模型，保留原模型；新建仍校验可用目录，真正未知模型仍拒绝。前端保留当前不可选模型占位，并丢弃跨会话迟到配置回执；修正模型初始虚假脏状态与思考勾选视觉同步。
- 涉及：src/{pi,sessions,model-config,model-auth,pi-model-storage,protocol,server}.js；public/{app,model-manager,model-auth}.js、model-manager.css；相关 tests；README、协议文档、codebase-map 索引/知识库。
- 验证：全量 npm test 371 项，369 通过、2 平台跳过、0 失败。Playwright 静态模拟授权：1280px/390px 各四状态，8 张截图、0 横向溢出、0 脚本错误；未进行真实 OAuth 或真实 API 请求。git diff --check 与 JS 语法检查通过。

## 2026-09-13 文档同步：模型统一编辑/登录/隐藏协议与导入门闩落稿（尚待验证）
- 原因：worktree 代码新增 models.model.override（统一定义编辑）、models.auth.*（网页登录）、models.config.get 回传 authProviders/hidden/applied 与全量模型目录 catalog、thinking 七级勾选写 thinkingLevelMap、SQLite 不双写与一次导入门闩（markMissing），但三份文档未同步。
- 修改：仅 README.md、docs/model-config-protocol.md、devlog.md 三个文件。协议文档：新增思考等级统一口径小节、models.model.override/models.hidden.set/models.auth.* 三节，models.config.get 响应补 applied/applyError/authProviders/hidden 与 catalog 字段说明，数据模型节补不双写与导入门闩语义，收藏 thinking key 注明七级与末位冒号切分。README：订阅登录改为可在设置页完成；「模型与供应商」bullet 改为统一编辑口径（内置模型逐字段覆盖、勾选思考等级、隐藏而非删除、默认新会话模型位置不变）；SQLite 节补一次导入门闩与不双写。devlog：本条。
- 未改：src/ 与 public/ 全部代码、tests、其他文档。
- 验证：尚待验证。未运行任何测试或构建；文档与代码的一致性仅经人工阅读比对（protocol.js/model-auth.js/model-config.js/pi-model-storage.js/pi.js/model-manager.js/model-auth.js），待后续轮次跑全量 npm test 与页面手测后再合并。
## 2026-09-13 手机纯阅读折叠
- 原因：真机截图中输入、进度与跳转仍占据大量空间；用户要求收起后仅展示会话和一行状态。
- 修改：≤700px 收起所有输入辅助区与最早/最新入口，保留单行双百分比/供应商模型思考信息及展开按钮；展开恢复输入和模型，输入14px，草稿附件不清空。桌面规则不变，沿用 Linear muted/surface 与8/12px间距。
- 涉及：public/style.css、public/app.js、public/index.html、tests/mobile-reading-ui.py、README.md、devlog.md、索引/知识库。
- 验证：首次 npm test 357项，355通过、2跳过；推送前重跑354通过、1项service超时、2跳过，单独重跑tests/service.test.js全部17项通过。浏览器回归在等待workspace显示时超时，手机/桌面对比未完成，不能视作验收通过；按用户明确要求合并推送。未重启正式服务。

## 2026-09-13 全部 worktree 集成与清理
- 决策：按用户要求集成所有附加工作区；先备份未提交内容，处理已有合并冲突，验证后推送 master 并清理附加 worktree。
- 保留：主仓库 AGENTS.md 的本地规则整理转入功能分支提交；临时安装目录和 NUL 不纳入源码。
- 复核：detached 工作区未跟踪 workspace-isolation.test.js 是旧版草稿（仍使用已废弃 files.browse）；master 已有更新后的 workspace.browse 测试，旧稿备份但不覆盖新版。
- 涉及：AGENTS.md、devlog.md，以及各 SQLite 分支的原有变更。
- 最终融合：保留隐藏/恢复模型新增功能、SQLite 拆表与懒恢复、跨进程 CAS；原始 storage/model-fixes/benchmark 文件逐字对照已吸收提交，确认重复后保留后续安全增强，五个原始分支历史合并前后源码差异为零。日志冲突保留双方条目，索引统一重建。
- 验证：所有原 worktree HEAD 均为集成分支祖先；全量 npm test 365 项，363 通过、2 平台跳过、0 失败。基线页面时序失败单跑 3/3 通过。未启动或重启正式服务。
- 清理保护：未提交改动、旧 detached 测试、截图及 19 个忽略日志备份至 ../worktrees/Axiom-merge-backup-20260913；保留主仓库未跟踪安装暂存目录、NUL、.env.local 与旧 stash，不删除其他仓库或非注册备份目录。

## 2026-09-13 05:40+ UTC 合并模型设置重设计与最新 master（冲突融合）
- 合并 8995365（模型设置重设计+选择性导入）到 SQLite 重构分支：5 个 UU 逐一人工融合，不选边。数字验证为严格并集：model-manager.js 461/118 = ours(10/3)+theirs(451/115)；tests/model-manager 584/70、tests/model-config 380/8 同理；devlog 为双方条目拼接。INDEX.md 由 reindex 重建。提交 69023fc。
- 合并 master（55937d4）7 个 UU：database.js 同时保留 master 的 Node 版本门控（createRequire 动态加载 node:sqlite）与本分支的 closeSync/openSync 存储安全导入；sessions.js 采用 master 的 startRun 运行骨架与 retry 入口，把本分支的懒加载（ensureLoaded）装进 prompt 与 retry，未加载会话不再 NPE；tests/service.test.js 保留本分支更强的恢复断言（ready 且 workers=2）。提交 b761552。
- README 6 处冲突按代码事实裁决：默认配置/预设存储取 master 表述（SQLite 权威，defaults.json 仅一次性迁移，代码 database.get("defaults","defaults") 佐证），摘要触发/维护假错误/remote 双重编码迁移/会话表/懒恢复等 5 处取本分支拆表后描述，会话存储段补回 master 独有的「旧每会话 JSON 首次启动只读导入」。knowledge.md 双方条目全部保留（89 条）。
- 验证：全量 npm test 360 项 358 通过、0 失败、2 平台跳过；首次出现的 service.test.js 两例失败（until 超时、EBUSY unlink -shm）单独复跑 2/2 通过，判定为 knowledge.md 已记录的 Windows 平台偶发问题，非合并引入（合并未触碰 service.mjs/service.test.js）。
- 涉及：上述源/测试/文档、codebase-map 索引与知识库。

## 2026-09-13 供应商协议「不设置」保存回显修复
- 原因：providerForm 把已有供应商缺失的 api 当作新建模板，回读时补成 openai-completions，再次保存还可能写回该默认值。
- 修改：仅新建表单采用模板默认协议；已有配置缺失 api 保持空值，不改后端协议校验、模型继承或界面样式。
- 验证：新增回归覆盖清除发送 null、成功回读、再次保存、刷新和新建模板默认值；修复前复现，修复后模型面板 25 项通过；全量 307 项中 306 通过、1 跳过。首次全量因 service 测试清理临时数据库遇 EBUSY 失败，未改相关代码，重跑全绿。
- 涉及：public/model-manager.js、tests/model-manager.test.js、README.md、devlog.md、codebase-map 知识库与生成索引。

## 2026-09-13 开发服务重建失败保护与恢复
- 原因：4320 的旧守护状态显示重建在停服后才因残留 `.node_modules-backup` 拒绝切换，随后兜底 worker 因 SDK 文件缺失退出；维护期间退出被 `restarting` 屏蔽，兜底失败没有恢复普通崩溃重试。
- 修改：准备阶段提前检查备份，不停止健康 worker、不删除不明确的备份；兜底启动失败明确记录未就绪，确认 worker 已退出后恢复有上限的崩溃重试。回滚失败或停止未确认仍保留现场，不盲目启动。
- 验证：新增残留备份保活及兜底失败有限重试回归测试；修正旧测试先等 worker ready 再断言启动次数的竞态。相关测试 34/34；全量 npm test 305 项，304 通过、1 跳过、0 失败。首次相关测试因 worktree 尚未安装依赖失败，独立 npm ci 后通过。
- 决策：不自动删除备份，不在故障时自动联网重装；备份内容不完整的来源尚未证实，避免猜测性覆盖依赖。此次故障运行实例已安全重启恢复，源码修复与运行恢复分别验证。
- 涉及：scripts/service.mjs、tests/service.test.js、README.md、devlog.md。

## 2026-09-13 07:43 UTC 模型面板视觉修补：协议下拉不再截断、连接区纵向堆叠、复选框不再变大方块
- 原因：用户看了实际截图提三点：①「API 协议」下拉的选项文案太长被切掉（`OpenAI Chat Completions（兼容性最…`），原生下拉本身也显拥挤；②宽屏下「API 协议 / API Key」两字段并排互相挤压，提示文字被折成两行；必须竖屏兼容、宁可向下扩展也不挤压；③折叠区里 Bearer 头的复选框被全局 `input { width:100%; min-height:40px }` 撑成一个灰大方块，与旁边文字极不协调。
- 实现：①`API_TYPES` 标签去掉括号后缀（只留 `OpenAI Chat Completions` 等），兼容性提示下移到字段 hint；原生 select 不会省略号截断，只能从文案长度上解决。②连接区四个字段全部改成 `mm-field-wide` 单列堆叠（含 API 协议），`.mm-form` 列宽下限 200→240px、`.mm-model-grid` 170→200px，窄屏更早退化为单列；`.mm-advanced .mm-check` 允许换行（其它 `.mm-check` 保持 nowrap），Bearer 字段改为整行宽。③新增 `.mm input[type="checkbox"] { flex:none; width/height:14px; min-height:0 }`，删掉只覆盖 `.mm-check input` 的局部规则，之后任何裸复选框都不会再被撑开；Bearer 复选框包进 `<label class="mm-check">` 并带上可见说明文字（原本只有 aria-label，视觉上是个孤立方块）。④模型摘要行的 id/名称改成单行省略号截断并补 `title`（窄屏原本会在单词中间断行，如 `claude-/opus-5`）。
- 验证：用 Playwright + 静态页临时挂在 public/model-manager.js（stub `request`）截图对比：900/420/360px 三档均无横向溢出（`scrollWidth <= innerWidth`）、复选框实测 14×14、模型行保持单行省略；截图用完即删，未入库。全量 `npm test` 303 项：302 通过、1 跳过、0 失败（首次并发跑出现 service.test.js 既有计时断言波动，重跑全绿）。
- 涉及：public/model-manager.js、public/model-manager.css、本日志与 codebase-map 索引。

## 2026-09-13 07:16 UTC 运行中吸底滚动只在用户滚动时暂停
- 原因：用户反馈运行中自动吸底会莫名停下。根因是 `#transcript`/子代理面板的 onscroll 按“距底部 <80px”无条件重算跟随状态：贴底时 `scrollTop = scrollHeight` 产生的滚动事件要等下一帧才派发，而同步追加的工具记录/流式正文已把内容撑高超过 80px，于是被误判成“用户离开了底部”；一旦暂停，用户很难再靠滚到底部追上持续增高的内容。
- 实现：public/app.js 抽出 `atLatest()`/`readFollow()`，跟随状态只由贴底和用户意图决定（滚轮、触摸、键盘、按下滚动条标记 200ms 意图窗口；无意图的向上位移仍视为拖动滚动条），程序跳转、折叠补偿、布局重排引发的滚动事件不再改变状态。新增内容观察器：`#output` 与子代理输出增高就补一次贴底，覆盖图片解码、折叠展开等不经过 `scrollLatest` 的路径；切换会话与重建弹窗时解除观察。
- 涉及文件：public/app.js、tests/app.test.js、tests/autoscroll-ui.py（新增）、README.md、devlog.md、knowledge.md 与 codebase-map 索引。
- 验证：tests/app.test.js 用限位 scrollTop 复现“补发滚动事件 + 内容增高”场景（改回旧规则时该断言必失败）；真实 Chromium（`node tests/conversation-preview.mjs` + `python tests/autoscroll-ui.py`）13 项通过：初始贴底、增高跟随、上滚暂停与不抢位、滚回底部恢复、补发事件不暂停、无脚本错误。全量 `npm test` 301 项：300 通过、1 跳过、0 失败。未调用模型、未重启正式服务。
## 2026-09-13 07:11 UTC 模型与供应商面板：删除移到导航行、重命名后端原子命令、右侧折叠重组
- 原因：用户五点反馈——删除入口在右侧详情里不好找、两段式「点两次」确认易误触也不够清楚、改名完全没有入口（只能删除重建，会丢 modelOverrides）、右侧详情一眼望去字段太多太乱、关键配置被淹没。
- 实现：①新增协议命令 `models.provider.rename {providerId,newProviderId,baseFingerprint}`（.strict()），`src/model-config.js` 的 `renameProvider` 在乐观锁内整体搬移条目并同步内联 id 字段；前端无法用 save+delete 复现（两命令之间的失败会丢配置、且无独立写 modelOverrides 的命令），故独立成一条原子写。②左侧导航项改 `.mm-nav-row` 行容器 + `.mm-nav-actions`，悬停/键盘聚焦显示铅笔与删除图标（`opacity:0`，触屏常显），删除图标悬停变红；图标路径与会话右键菜单同源（添加 `ICONS`，`createElementNS` 构造，不引第三方图标库）。③删除/改名统一走原生 `<dialog>`+`showModal`（Esc 与焦点陷阱免实现），弹窗挂在 `body` 上，`close` 即移除；确认按钮 `type="button"`，取消不发请求；jsdom 无 `showModal/close`，用 `openModal/closeModal` 垫片。④右侧详情分成「连接 / 模型」两段：连接区只留 `id`（仅草稿）/ Base URL / API 协议 / API Key 四个宽窄分列字段，Bearer 头与自定义请求头收进 `<details class="mm-advanced">`（展开态存 `form.advancedOpen`，顺带修掉旧版展开高级区后新增请求头重渲染就自动折回的 bug）；模型行也改为 `<details>` 折叠摘要行（id + 异名 + 推理/图片徽标 + 脏点 + 删除图标，新建行默认展开，保存成功自动收起），保存按钮仍是 `.mm-model-actions` 第一个按钮。⑤重命名成功后 `rekeyProviderCaches()` 把 `editForms/newRows/modelRows/discover` 从旧 id 搬到新 id，正在编辑但未保存的内容不丢；删除则清缓存并清空选中。⑥弹窗容器样式复用 `style.css` 已有的 `#session-action` 选择器组（新增 `.mm-dialog`），只在本模块 CSS 补宽度与校验提示色，未新增颜色 token。
- 验证：`tests/model-manager.test.js` 重写删除用例为「图标→弹窗→取消不发请求 / 确认才发」并新增重命名用例（非法 id 与重名留在弹窗、id 未变直接关窗、Enter 提交、成功后新 id 入选且未保存草稿跟随）；`tests/model-config.test.js` 新增 `provider.rename` 后端用例（未知/重名拒绝且指纹不变、成功迁移 modelOverrides 与未知字段、旧指纹被拒）。该 worktree 无 `node_modules`，先建 `node_modules` junction 指向 `F:\worktrees\node_modules`（`src/server.js` 按项目内相对路径读 marked/dompurify）后才能跑后端测试。全量 `npm test`：301 通过、1 跳过；唯一失败 `tests/app.test.js` 的时序断言在单独运行时通过（并发负载下的既有 flaky，与本次改动无关）。未在浏览器手测。
- 涉及：src/protocol.js、src/model-config.js、public/model-manager.js、public/model-manager.css、public/style.css、docs/model-config-protocol.md、tests/model-manager.test.js、tests/model-config.test.js、README.md、本日志与 codebase-map 索引。

## 2026-09-13 06:55 UTC SQLite 安装入口的 Node 版本前置检查
- 原因：静态导入 node:sqlite 早于安装脚本的版本检查，旧 Node 先报未知内置模块；安装脚本及 README 存在过时版本/JSON 存储描述。
- 实现：src/database.js 复用原 nodeOk 规则，在同步加载 SQLite 前统一拒绝不支持的 Node；scripts/install.mjs 重导出规则供现有测试使用，移除不可达的重复检查。无需新依赖、启动标志或修改 npm 全局安装命令。install.sh、install.ps1 与 README.md 同步版本及 SQLite 说明。
- 验证：tests/install.test.js 用子进程模拟 Node 20/22.12/23，验证安装、守护、直接启动三入口在加载 SQLite 前提示升级；安装/数据库 11 项通过。两次全量并发运行出现不同的既有时序断言失败（service/app），服务测试单独15项通过；全量串行 node --test --test-concurrency=1 tests/*.test.js 为300通过、1跳过、0失败。未升级全局包或重启当前服务。
- 涉及：src/database.js、scripts/install.mjs、tests/install.test.js、install.sh、install.ps1、README.md、本日志、代码索引及排障知识。
## 2026-09-13 05:12 UTC 摘要列表紧凑化
- 原因：时间行误继承全局 header 的64px高度、24px缩进及底线，设置段落规则又覆盖正文，列表过于稀疏。
- 修改：public/style.css 隔离摘要时间行，时间/轮次靠左同排，正文间距4px、条目上下12px，正文保持13px；README.md 同步说明。不改变排序和摘要生成、不加依赖。
- 验证：tests/summary-compact.test.js 新增样式回归，摘要UI共9项通过。全量282项280通过、1跳过、1服务恢复时序失败；该服务测试文件单独重跑15项全部通过。尚未真实浏览器验收，暂不合并。
- 涉及：上述文件、devlog.md、codebase-map 索引与知识库。
## 2026-09-13 05:54 UTC 性能计量复核与最终口径
- 合入G修正f71e524（9351a7e），主审继续修复：非零退出被合法JSON掩盖、exit早于stdout排空、旧绑定字节遗漏namespace/key、token观察窗口漏message.start；所有子结果close后解析并检查退出码。锁实验victim先连接，holder拿锁后IPC通知写入，排除Node启动耗时，5000ms超时及原门槛不变。
- 数据修正：任务progress按真实单条快照，不在旧侧人为累积数组；通知位每次切换、计时每次递增，排除同值空写；快照加ESM标记，不额外计语法探测开销。finally释放相位监视器，自检数据库关闭。
- 验证：计量self-check6/6、存储/启动硬门槛6/6、两锁实验全过，退出0。05:52UTC大数据绑定字节每次约1.35MB→17–678B；无待通知SDK16→0；fake SDK启动362.5→2ms，首开34.820ms单列。300ms锁等328.3ms成功，6000ms锁等5561.7ms后预期失败。非正式数据，不把绑定字节当磁盘增量、不由WAL推导锁比例，small真实变更两侧p50均约2ms。
- 文档完整重写docs/sqlite-performance.md，旧数字作废，以修正报告为准；README登记基准与历史独立计数回归。涉及tests/sqlite-benchmark.mjs、报告、README、本日志和索引/知识。
- 集成预检发现master已由其他会话合入模型设置改版到8995365（33e7987），需先在功能worktree合并并复测。主仓INDEX/NUL是他人未提交内容，不动；跨进程CAS修复仍由独立任务进行。

## 2026-09-13 05:45 UTC 撤回失败一致性、摘要恢复关联与重试词表
- 已复现：PRAGMA query_only使撤回中的事件删除抛错，SDK已回退但网页历史未裁切，或网页已裁切却丢失撤回回执。修复先同步内存，再经saveChange提交整组短SAVEPOINT；失败通过既有error事件报告、pendingWrites保留整组清理，下次保存/关闭重试，仍把输入交还用户，不跨SDK持SQL事务。
- 复核纠正：此前V01探针强行允许撤回已有完整回答的轮次，绕过真实recallLastMessage限制，不能据此确认“撤回后污染委派”。真正已确认的是崩溃窗口后摘要/触发记录缺entryId；恢复按唯一助手messageTimestamp回填并落库，同毫秒歧义/缺时间保留旧记录，不猜测删除。
- 额外已复现：retry错误词表未传首次主代理、sessionData.selection未保存；补两处传递，重启主代理与子代理保持原词表。跨进程配置丢更新修复另由独立worktree处理，不持事务跨await。
- 验证：tests/recall.test.js、session-memory.test.js、session-persistence.test.js三个新增用例先红后绿；38项定向全过，全量327项：325通过、0失败、2平台跳过。撤回用真实recallLastMessage+SDK树桩，另注入清理后半段失败证明整组回退后可重试，未降低断言。
- 涉及：src/sessions.js、上述测试、README.md、devlog.md、docs/sqlite-refactor-plan.md、codebase-map知识与索引。正式服务、正式库仍未触碰；性能基准修正待最终复跑，不引用旧精确数字。

## 2026-09-13 主审接管跨进程并发修复
- 修正074d30c：pi-model-storage复用传入Database，不再按home硬编码另开连接；原文捕获解析固定脱敏错误。配置/凭据异步校验结束后单条SQL CAS，无事务跨await。收藏沿用明确冲突拒绝的CAS，避免额外事务接口与自动重放。
- tests/helpers/model-concurrency-child.mjs改为捕获旧权威后停在CAS前（凭据停在fn内），父进程完成写入才放行；移除20/200ms sleep与8轮概率试验。结果等待close并检查退出码，异常finally终止子进程后才关闭数据库/删目录。
- 增加非默认数据库文件名与配置/收藏/凭据三类坏JSON脱敏检查；修正派生文件注释，不承诺跨进程SDK实时同步。涉及两个产品文件、两个测试、helper、README、索引及知识库。
- 验证：定向28/28通过，全量328项：326通过、0失败、2平台跳过。尚未合入集成分支，未触碰正式服务/数据库。


## 2026-09-13 05:32 UTC 历史恢复索引与取消失败边界
- 已复现：256条消息、256条重试使旧恢复逻辑读取消息65,664次；ID匹配已线性但后续retry逐条map/filter/slice，compaction逐条find仍为平方扫描。取消恰好正在恢复且SDK失败的会话会连带抛加载错误，虽无运行任务可取消。
- 修复：src/sessions.js 按代理一次构建单调时间线与锚点，重试二分查询；同毫秒歧义、时间倒退、缺失时间、排队输入规则保持，压缩按ID对账。cancel等待失败加载后继续原有未加载直接返回语义，不重建SDK、不删记录。
- 验证：tests/session-flow.test.js getter计数回归先红后绿，不依赖耗时阈值；tests/session-persistence.test.js 取消加载失败先红后绿。会话流程/保存/撤回/摘要30项全部通过；全量324项：322通过、0失败、2平台跳过，git diff --check通过。最终只读复核继续收口。
- 基准：集成0582534/05bad78，但主审发现分位数未排序、SQL字节双计/混入读参数、事件循环采样未tick与部分静态门槛，旧报告精确数字暂不采信；独立任务修正计量与失败出口后重跑，不降低门槛。历史非平方硬门槛由上述getter测试承担。
- 文档：README同步元数据启动/按需恢复/历史索引、基准入口；清除默认配置仍原子替换JSON和无守护/自启的过期描述。涉及上述源/测试、README.md、devlog.md、codebase-map脚本/索引/知识；正式服务和正式库仍未触碰。

## 2026-09-13 UTC SQLite 存储修正：remote/config 去双重编码 + 维护记录假错误/无界 phases 修复
- 原因：通用 Database 已对 value 做 JSON 序列化，remote/config 旧代码预 stringify 导致双重编码（库中存的是带引号的 JSON string）；maint persist 把上一次落库失败留下的 persistenceError 随下一次快照一起固化进库，重启后显示假错误；phases 只在 `phase()` 入口限长，restore 与 workerReady 追加不截尾，历史脏数据可无界放大。
- 实现：`src/remote.js` 不再预 stringify（set 直接传对象）；parseConfig 兼容旧 string 与新 object（其他类型同样 fail closed），命中旧 string 且解析成功时一次读取即迁移成 object，坏结构不迁移、回退默认禁用，鉴权逻辑未动；`scripts/maint-state.mjs` persist 先 `delete data.persistenceError` 再存，失败时错误只留内存（下次成功自愈），restore 读入即丢弃残留 persistenceError（历史库已固化的也不显示），追加阶段收敛到唯一 `pushPhase()` 入口（超限从头部裁剪），restore 超长残留先截尾再补 boot，非数组 phases 防御性置空。
- 涉及：src/remote.js、scripts/maint-state.mjs、tests/remote.test.js（fakeDatabase 对齐真实 Database 同步 JSON 语义；新增旧 string 迁移与坏 object fail closed 用例）、tests/service-settings.test.js（新增 persist 假错误/重启/phases 有界用例）、README.md（修正 remote.json/service-state JSON 的过时存储描述）、本日志。
- 验证：remote 12/12、service-settings 9/9；全量 `npm test` 283 项 282 通过、0 失败、1 跳过（service.test.js「rebuild cancels swap」为既有时序抖动，master 未含本改动时 6 跑 4 挂，单独复跑通过）。检查两个测试文件无真实密钥：仅 user@example.com、hunter2、tokensecret 等显式虚构值，端点均为本地 mock/临时目录。
- 边界：未改 database/main/server/service.mjs；依赖经 junction 指向 F:/Axiom/node_modules，未安装、未修改共享依赖。

## 2026-09-13 04:45 UTC SQLite 拆表主接线（实施中，尚未全量验收）
- 决策：按用户要求直接实施五表，不加双写、旧版兼容、反向迁移或专用 Worker；一致性备份、逐会话事务、幂等标记与字段对账仍是数据安全底线。
- 主接线：`src/sessions.js` 改按实体增量保存，失败增量留待下一次写入/关闭重试，多实体变更使用同步 SAVEPOINT；启动仅读元数据、待通知会话串行恢复，首次打开以 Promise 去重。改标题/删除未打开会话不创建 SDK；缺 JSONL 记录仍可见但拒绝空历史覆盖。撤回同步清理摘要与事件；消息匹配改为 ID Map 与单调游标。
- 并发与页面：`src/server.js` 等待恢复再 attach，慢旧请求不覆盖新订阅，加载中阻止维护；`public/model-manager.js` 区分已保存与已应用，重试当前配置不重放写操作，复用现有 Linear 提示组件，不改样式 token。
- 涉及：上述源文件、会话/通知/迁移/模型页面/服务测试，`README.md`、`docs/sqlite-refactor-plan.md`。事件生产包 `521b5dc` 已集成；数据库/模型/配置子包仍待交付。
- 已运行：模型页面12项、服务API3项、任务模块4项通过，语法检查与 `git diff --check` 通过。会话集成测试仍因存储包缺 `src/session-store.js` 阻塞；不能把新增未运行用例当作验收。未启动正式数据迁移或重启正式服务。

## 2026-09-12 19:37 UTC 文件/文件夹搜索与 @ 补全：名称模糊匹配 + 工作空间递归
- 原因：输入框上沿「＋」与 `@` 补全都只能在当前目录里按子串过滤名称，工作空间根目录只有 `public/` 这类目录名，输入 `@app` 或 `@apjs` 根本匹配不到 `public/app.js`，用户反馈「艾特的时候输入无法匹配」。
- 实现：`src/sessions.js` 新增 `fuzzyHit()`（忽略大小写、字符按顺序出现即命中）与 `matchRank()`（完全相等 → 前缀 → 子串越靠前越好 → 子序列），`listFiles()` 在 `query` 非空时改走 BFS 递归搜索 `searchEntries()`：只匹配名称、不回读文件、跳过 `.git`/`node_modules`/符号链接，按匹配质量排序后一次返回（`nextOffset: null`），递归目录数封顶 400、单目录不可读只跳过；无搜索词时保持原目录优先排序 + 分页（每页 200）。`browse()`/`workspace.browse` 增加 `query` 参数（`protocol.js` 同步为 `query: z.string().max(200).default("")`），`app.js` 的 `@` 补全把最后一段作为 `query` 发给服务端，技能搜索（＋ 菜单与 `/` 补全）同样改为名称模糊、说明仍按子串。`file-picker.js` 搜索命中行右侧显示所在相对目录，避免深浅目录同名文件无法区分。
- 涉及：src/{sessions,server,protocol}.js、public/{app,file-picker}.js、public/file-picker.css、tests/{session-flow,workspace-picker,app}.test.js、README.md、本日志与 codebase-map 索引。
- 验证：session-flow / workspace-picker 改为断言递归 + 模糊 + 不分页（`query: "appjs"` 命中 `src/deep/nested-app.js`），app.test.js 新增 `@app` 命中根目录没有的 `src/app.js` 的回归用例；worktree 全量 `npm test` 258 项：257 通过、1 跳过、0 失败。直连 `Sessions.browse()` 在真实 Axiom 工作空间实测：`@app` 38ms 4 命中、`@apjs` 7ms、`@sessionMjs` 6ms，均按匹配质量把 `public/app.js`、`src/session-memory.js` 排在前。
## 2026-09-12 手机阅读优先（桌面布局不变）
- 原因：手机输入区和多层吸顶遮挡正文；用户要求信息最大化、单行输入、双数值状态及统一展开入口，不能影响桌面。
- 修改：≤700px 默认折叠顶栏/模型/上下文工具/任务快捷列表；保留发送与安全操作、附件和错误。输入一行起步，限制自动增高与底栏最大占比；状态仅两个百分比，去操作指引与详情吸顶，跳转不浮遮。沿用 Linear token，不加依赖。
- 涉及：public/{index.html,app.js,style.css}、tests/mobile-reading-ui.py、README.md、devlog.md、codebase-map 索引与知识库。
- 复核决策：保留用户指定的统一展开入口（切会话先展开），转屏不重置展开选择；`:has()` 沿用项目既有现代浏览器要求，旧内核仍可通过展开移除引用。独立只读复核未发现桌面隔离问题。
- 验证：Chromium 390×844、320×568、390×420、667×375；展开/收起、长输入和队列、页面无横向溢出；1440px 修改前后计算样式与坐标一致。npm test 258 项，257 通过、1 跳过。短视口非真实软键盘验收，未重启使用中的正式服务。

## 2026-09-12 任务计时器（输入框「+」行最右端）
- 原因：需要直观看到当前任务进行了多久；口径必须与侧栏绿点一致，停止后重新输入要继续累计而不是清零。
- 实现：后端在 `session.state` / `task.state` 事件里按「会话执行中」累计 `elapsedMs`（进入 running 开表、离开结算），随会话 JSON 落盘，事件回执与 `sessions.list` 带 `elapsedMs` / `runningSince`；前端每秒重算并渲染，停止后定格。取消/关闭空闲会话也会发 cancelling，因此以 running 而非「非 idle」开表。绿点口径抽成 `pointStatus()`，`sessions.list` 与事件回执共用，计时与侧栏绿点永远同源。
- 参考成熟实现：[OpenAI Codex 状态行](https://github.com/openai/codex) 的 pause/resume 计时与 `59s` / `1m 00s` / `1h 02m 03s` 紧凑格式；Claude Code 的「减少动态效果不应冻结计时」教训；`font-variant-numeric: tabular-nums` 防每秒跳动。不引入前端框架或额外依赖。
- 涉及：src/sessions.js、public/{index.html,app.js,style.css}、tests/{task-timer,app}.test.js、README.md、本日志与 codebase-map 索引。
- 验证：tests/task-timer.test.js 覆盖开表、结算、续跑累计、落盘恢复；tests/app.test.js 页面用例覆盖「无记录不占位、运行中累计、停止后定格、再次执行继续累加」。worktree 全量 `npm test` 256 项：255 通过、1 跳过、0 失败。Chromium 静态预览核对运行/停止两态配色、脉冲动画、`tabular-nums`、与「+」同排且右对齐、390px 无溢出（非真实会话端到端验收）。

## 2026-09-12 18:10 UTC 设置页签切换高度稳定
- 原因：设置弹窗随内容长度改变高度，居中布局导致切换分类上下跳动。
- 修复：固定 80dvh 高度，头部不收缩，分类与正文区域内部滚动并预留滚动条宽度；仅使用 CSS，保留 Linear surface/line/accent token，不影响其他弹窗。
- 涉及：public/style.css、tests/service-settings-ui.py、README.md、本日志与 codebase-map 索引/知识库。
- 验证：隔离 Chromium 1440×900、390×900、320×900、844×390，四页签往返高度与位置一致、上下各 10%、长内容可滚动且关闭栏固定、Esc 可关闭；npm test 252 项：251 通过、1 跳过、0 失败。

## 2026-09-12 统一摘要规则与复盘基础
- 按用户原文固定共同系统提示词，主代理额外要求delegate时摘要；不添加首次范围或行动意图。每3/6累计turn动态提醒，摘要正文严格小于30字，环境变量可调间隔和长度，默认不加配置UI。
- 新增summaryTriggers保存触发规则、实际提示词、轮次、回复关联与缺失/超长/失败状态；代理重启后未完成触发标记interrupted，供未来复盘，不额外模型调用。
- 涉及 src/{memory-policy,capabilities,pi,session-memory,sessions}.js、tests/{memory-policy,pi-memory,session-memory}.test.js、README.md与索引。合并最新master时保留双方知识/开发记录，索引重建；主代理接管修正字数配置（可显式设30/40，提示词上限同步），委派附加句严格采用用户原文，补“此内容进入工作记忆。”。最终隔离全量252项：251通过、0失败、1跳过。

## 2026-09-12 摘要标签统一
- 按用户确认改为 `<axiom_summary>`，主代理摘要与子代理进度按身份登记；兼容旧标签读取。删除子代理系统提示词中的轮次要求，仅代码计数后在请求末尾提醒，要求闭合标签后无正文。
- 涉及 src/{capabilities,pi,session-memory}.js、public/memory-tags.js、tests/{memory-tags,pi-memory}.test.js、README.md；合并master及最终验证仍进行中。

## 2026-09-12 15:22 UTC 会话标题与轻量工作记忆
- 原因：委派缺少主会话背景，主代理无法被动了解子任务方向；采用随回复输出标签，避免新增标题/总结模型调用。
- 决策：助手 message_end 先登记摘要，delegate 再冻结最近32条；turn_end 关联工具状态；子代理每5轮在下次 context 提醒汇报，主代理仅在正常 context 附带最新进度。标题只请求一次，手动改名优先。
- 存储：沿用 JSON 异步持久化；保存模型自报摘要、累计轮次、时间、消息关联和进度送达记录，不替代 Pi JSONL，不引入 SQLite 调度或轮询工具。
- 涉及：src/{pi,capabilities,sessions,tasks,session-memory}.js、public/{memory-tags,app,stream-renderer}.js、public/{index.html,style.css}、相关 memory 测试、README、codebase-map。
- 复核修正：撤回主代理消息时清理关联摘要，避免继续委派旧背景；消息时间戳缺失时不关联 entryId；进度送达诊断仅保留最近50次且8000字符预算包含包装；更新旧测试 mock，配置不再混入 memory 回调。涉及 src/{sessions,session-memory}.js、tests/{session-memory,config,compaction-config}.test.js；增加隔离浏览器预览 tests/memory-preview.mjs。
- UI复核：轮次改为后端一致的1起算；标签提取跳过空/超长标题后取首个合法值。1440/390/320px隔离预览的摘要列表、无横向溢出、Esc关闭通过。
- 最终修正：memory.context() 移至每次 SDK context 事件，工具连续轮可收到新进度；子代理累计满5轮后下一次请求提醒一次，标题独立消费一次。真实SDK+本地fake SSE覆盖工具前登记、连续轮进度、一次性标题、子代理第6轮提醒，未增加请求。
- 最终验证：隔离副本 F:/worktrees/verify-session-memory-final 执行 npm ci（0漏洞）及 npm test：245项，244通过、0失败、1跳过。共享node_modules随后出现缺包（@asamuzakjp/css-color等），原因未查明，未修补或重启运行实例；三种屏宽浏览器检查已通过。

## 2026-09-12 17:45 UTC Stop 方块改为红色
- 原因：按用户截图要求，仅将 Stop 右侧白色方块改为红色。
- 修改：方块单独包裹 span，复用现有 --danger（#f2a6a6），保留文字、边框及停止行为；装饰图标对读屏隐藏。
- 涉及：public/index.html、public/style.css、tests/app.test.js、README.md、本日志及自动生成的代码索引。
- 验证：同步远端 master 后 npm test 共 227 项，226 通过、1 原有跳过、0 失败；git diff --check 通过。

## 2026-09-12 10:45 -07:00 摘要展示元数据改用末尾标签
- 原因：用户指定 axiom_compact_title、axiom_compact_desc，避免自然语言输出使用 JSON 转义。
- 修改：摘要提示词要求完整交接正文后追加两个标签；只提取末尾完整有效的标签，校验非空和长度，异常保留全文。内部 progress 存储和前端 01/02 编号不变，不新增模型调用。
- 文件：src/compaction.js、tests/compaction.test.js、README.md、devlog.md、.pi/skills/codebase-map/INDEX.md。
- 验证：npm test 共 227 项，226 通过、1 跳过、0 失败；覆盖多行/CRLF、标签缺失、空内容、超长、嵌套、非末尾及旧 JSON 原文回退。git diff --check 通过；未调用真实模型，未重启服务。

## 2026-09-12 09:15 -07:00 摘要增量进度展示
- 原因：用户希望连续摘要按 01、02 展示为可读进度，而不是反复展示累计历史。
- 决策：同次摘要请求额外输出中文增量标题与描述，程序按记录顺序编号；完整交接摘要仍累计，展示数据存入压缩 details，重启恢复。格式异常保留完整原文并回退默认展示，不新增依赖或模型请求。
- 文件：src/compaction.js、src/pi.js、public/app.js、tests/compaction.test.js、tests/compaction-config.test.js、tests/compaction-ui.test.js、README.md 及代码索引。复用现有 Linear 摘要卡片样式，无新增视觉 token。
- 验证：后台相关 22 项通过；全量 227 项中 226 通过、1 跳过、0 失败，git diff --check 通过。覆盖增量格式解析/回退、元数据落盘恢复、序号实时/快照一致与展示文本安全；未调用真实模型或运行真实浏览器验收。

## 2026-09-12 主代理接管服务维护收敛
- 原因：子代理测试覆盖了理想流程，却把控制管道绕过任务检查及共享依赖覆盖当作预期；暂停子代理编辑，由主代理统一修复。
- 修改：HTTP 停止拒绝不再回落管道，管道仅停止无 worker 的守护；更新依赖随新包私有部署，备份含完整旧依赖；构建失败恢复依赖；未就绪实例必须确认退出后才能回滚/拉起，增加重复 worker 防线；健康探测同步更新 ready，退出清除 ready。
- 涉及：scripts/service.mjs、tests/{service,service-settings}.test.js、README.md、本日志与代码索引。守护测试增至 15 项，补构建失败回退与启动超时回退；前端 HTTP 测试清理前 flush，删除重复且过时的 scripts/maintenance-contract.md，统一维护 docs/service-maintenance.md。
- 验证：复制源码到独立临时目录 npm ci，SDK 导入成功；全量 224 项，223 通过、1 原有跳过、0 失败。真实服务使用随机端口 52226 与临时数据目录：WS 回执 operationId → 独立维护状态 succeeded → 新实例健康身份一致 → CLI 优雅退出，全部通过；1440/390/320px 浏览器检查通过。4319/4320 的运行实例未改动。
- 最终复核：维护状态按调用时快照串行落盘，持久化失败通过状态接口和面板明确告警；补齐真实阶段中文名称、无维护操作时的崩溃终态展示。再次全量 223 通过、1 跳过，三种屏幕尺寸通过，git diff --check 无错误。沿用 Linear surface-1/hairline 与现有按钮，没有新样式依赖。
- 环境：在用 worktree 的 Pi SDK dist 缺失已独立确认，但缺失原因未查明；没有原地修依赖或重启，避免中断已有会话。隔离安装正常，不能将当前进程仍健康视为下次可启动。部署需先确认任务空闲。

## 2026-09-12 10:50 UTC 服务设置与可观测维护（实施中）
- 原因：4320 开发 worker 因 Pi SDK 的 dist 缺失反复崩溃；旧服务菜单把接收请求、启动进程与真正就绪混为一谈，刷新后无维护证据。
- 决策：在独立 worktree 恢复开发依赖；复用守护进程提供本机鉴权维护接口、持久化真实阶段与最近结果；入口迁入「设置 → 服务与更新」，不公开源码路径，远程连接不授予维护权限。更新先检查固定提交再确认，失败不能冒充成功。
- 涉及：scripts/service.mjs、scripts/maint-*.mjs、src/{main,server,protocol}.js、public/{app,service-settings}.js、public/{index.html,style.css}、相关 API/UI/守护测试、README.md、docs/service-maintenance.md 和 codebase-map。
- 复核：维护准备期允许新 WebSocket 读取 service.status，实际 close 才拒绝新连接，避免刷新丢失维护入口；鉴权与维护写锁保持不变。
- 进度：本机权限/CSP/活动任务保护及远程隔离 12 项通过；1440/390/320px 服务设置浏览器检查通过。守护流程与故障恢复仍在集成验证，未宣称全量通过。当前轮不重启有活动会话的 4320，不触碰 4319 正式服务。
## 2026-09-12 会话导入修复发布 0.1.6
- 按用户要求合并 master 并发布；package.json/package-lock.json 同步升至 0.1.6，README 发布说明沿用 master SHA 更新流程。
- 发布前全量测试；保留主仓库已有未提交索引，不混入本次提交。不强制重启其他 worktree 的开发预览服务。

## 2026-09-12 05:25 导入会话归属当前工作空间
- 原因：导入虽然复制 JSONL，却使用源头 cwd，导致跳回原目录，未满足独立副本在目标空间正常续聊的预期。
- 修改：前端传当前 cwd；协议与服务转发目标目录，省略时使用实例默认值并复用目录校验；副本头部更新 ID/cwd，历史条目保持不变，源文件只读。沿用普通会话保存、恢复、重命名和删除，不复制项目文件，不改历史绝对路径。
- 验证：npm test 209 项，208 通过、1 跳过；新增目标归属、头部身份、历史不变、重命名/重启恢复/删除不改源文件、默认目标与无效目标检查，前端验证不另开源目录。
- 涉及：src/sessions.js、src/protocol.js、src/server.js、public/app.js、tests/session-flow.test.js、tests/app.test.js、README.md、本日志及 codebase-map 索引/知识库。

## 2026-09-12 03:45 左侧会话列表与复制菜单重构
- 需求：执行中/待继续合并为「进行中」；已完成默认折叠并固定在设置上方；复制目录、文件名、完整路径收进右侧二级菜单。
- 决策：复用原生 details / Popover 与既有 Linear surface、raised、line、accent token，沿用创建时间倒序及日期分隔，不新增依赖。完成标记不影响运行，展开状态仅在当前页面保留；复制对象是 JSONL 源文件，目录保留末尾分隔符以兼容盘符根目录、POSIX 根目录与 UNC。
- 修复：controls 不再禁用断线时可本地执行的复制/完成标记；列表比较纳入 sessionFile，避免文件刚落盘后复制菜单仍使用旧空路径。
- 验证：npm test 208 项，207 通过、0 失败、1 原有跳过；Chromium 1440/320 宽度验证底部折叠、右侧菜单/窄屏避让、Esc 逐级关闭与焦点、外部点击、长列表滚动及设置不被挤出。新增 Windows/UNC/POSIX 复制、未落盘、剪贴板失败、断线、路径更新回归检查。
- 涉及：public/app.js、public/style.css、tests/app.test.js、tests/session-sidebar-ui.py、README.md、本日志与 codebase-map 知识/生成索引。

## 2026-09-12 重试时间线完整边界修复
- 原因：上一轮未覆盖排队消息时间与消费时间区别、撤回后的计数失效、压缩与主/子代理归属；无法定位的历史仍追加末尾。
- 修改：后端统一恢复/维护首次重试边界及关联消息 ID，撤回同步维护重试记录；前端按关联 ID 将已压缩重试归档到摘要，未知位置使用顶部独立折叠区，迟到子代理元信息不污染主时间线。
- 设计：复用 Linear 既有 compaction-card/retry-card、surface-1 与 hairline、原生 details 键盘操作，无新增样式或依赖。不凭编写时间猜队列消费顺序，不删除无法确认位置的旧记录。
- 涉及：src/sessions.js、public/app.js、tests/session-flow.test.js、tests/recall.test.js、tests/message-activity.test.js、README.md、本日志和 codebase-map 坑库/索引；验证：npm test 共 208 项，207 通过、0 失败、1 项原有跳过；Chromium 实测 46 项通过（定位、恢复折叠、未知归档、压缩及连续刷新），无控制台错误。最终复核移除“最后失败助手”猜测，无消费时间的排队输入保持未知；撤回保留独立子任务输出，并重映射混合消息边界。

## 2026-09-12 项目独立：包名 @cosyeezz/axiom，弃用旧发布方式
- 决策：按用户要求 Axiom 独立，去除与主工作区的现行从属关系；旧的子目录镜像发布方式不再使用，master 直接推送公开仓库。npm 包名定为 `@cosyeezz/axiom`，macOS 登录自启 Label 改为 `com.cosyeezz.axiom`。不改写 Git 历史，不删除另一仓库及其未提交改动；历史条目仅以中性表述（主工作区、旧发布方式）去除旧名称与具体路径，事件事实不变。
- 文档：README 发布流程改为独立功能 worktree 验证 → 提交 push → 合并 master 推送发布；卸载说明按本机实际安装 package.json 的 name 确定包名，不保留旧名称字面量；新增「从旧包名迁移」一节：更名不支持原地自动迁移，旧版本先安全停止、取消自启、卸载旧包，再安装 github:cosyeezz/axiom 并 axiom-setup，~/.axiom 与 ~/.pi 保留，新旧服务不可同时运行。AGENTS 示例改用 Axiom。版本升至 0.1.5，更新与卸载核对新包目录，预览使用当前工作空间。
- 本机配置：worktree `.env.local`（gitignore，不入库）已复制原配置并移除旧 AXIOM_CWD（改为注释），合并后部署回主源码目录并保留其他设置；在此记录该被忽略的本机配置修正，便于追溯。
- 验证：合入最新 master 的卸载 CLI 循环等待及重试时间线修复后，npm test 199 项，198 通过、1 原有跳过、0 失败；npm pack --dry-run 核对独立包名且不含本机 .env.local；当前源码与文档的旧项目名称引用清零。
- 涉及：README.md、devlog.md、AGENTS.md、package.json、package-lock.json、scripts/{service,uninstall,autostart}.mjs、tests/{service,uninstall,autostart}.test.js、tests/conversation-preview.mjs、代码索引及本机 .env.local。

## 2026-09-12 09:42 UTC 旧重试卡时间线迁移
- 原因：新记录已有 messageCount，但旧记录恢复仍固定追加末尾，成功状态更新不会纠正旧位置。
- 决策：src/sessions.js 在恢复时用首次 nextRetryAt-delayMs 和同代理消息 timestamp 找边界，仅接受完整、单调且边界不重时的时间线；补齐 messageCount 后随现有 persist 落盘，已有位置不覆盖，缺证据继续回退。不改重试策略、消息正文或 Linear 卡片样式，无新增依赖。
- 涉及：src/sessions.js、tests/session-flow.test.js、tests/message-activity.test.js、README.md、本日志及 codebase-map 坑库/生成索引。
- 验证：合入最新 origin/master 后 npm test 198 项，197 通过、0 失败、1 既有跳过。新增旧记录迁移与连续两次服务关闭/恢复检查；前端多次快照与分组绘制验证卡片始终在恢复回答之前；另覆盖主/子隔离、已存边界优先、时间缺失/倒退/同毫秒不猜位置。

## 2026-09-12 02:15 执行过程合组收尾与上下跳转
- 原因：回答前 thinking 独立建组，与紧邻工具组形成连续 Completed；旧测试把思考位置锁在消息内部，且遗漏历史恢复。
- 修改：public/app.js 复用前段工具组并保留 thinking 在正文之前，识别移出的 thinking 记录；public/index.html、public/style.css 增加顶部最早/底部最新按钮，沿用现有 secondary 样式与 8px 间距。
- 验证：tests/activity-groups-ui.py 用 Chromium 覆盖连续三次调用、用量不拆组、手动展开、失败行、手机元信息、上下跳转、真实 attach 与 reload；tests/app.test.js 更新思考查询以允许跨消息合组。README.md 同步说明，坑库追加根因；索引重建但不纳入本次提交。
- 集成：先合并最新 origin/master，保留其 Agent 结束/停止状态修复，不恢复旧版无限 Working；功能分支验证后合并 master 并普通推送。

## 2026-09-12 通用字符图入口与原文回退
- 决策：字符图无统一语法，不强行推断语义；复用 ASCII 表格与字符网格，以结构信号识别 ASCII 框、树、箭头和完整 Unicode 制表线范围，未知保持原文并支持手动优化。
- 内容：纯文本语言统一大小写归一、增加 diagram/tree；表格和字符网格共用优化/原文切换，复制保持源内容；Tab 按字素列宽推进至 8 格位置，超长网格禁用并说明原因。JSON 控件不变。
- 文件：public/markdown.js、public/style.css、tests/markdown.test.js、tests/text-diagram-ui.py、README.md、本日志和代码索引/坑库。复用现有 --mono、颜色及工具栏按钮，不新增依赖。
- 验证：单测覆盖框/树/箭头/混合文本、手动回退、表格双向切换与 Tab 保真；Playwright 验证桌面/手机切换与 Tab 实际坐标。

## 2026-09-12 字符示意图网格排版
- 原因：并排菜单框不是表格，上一轮转换不覆盖；中文、图标的字体回退字宽不符合字符图的网格。
- 修改：public/markdown.js 识别纯文本 Unicode 制表线图，Intl.Segmenter 保留字素，CSS 单/双格固定宽度；保留原文和复制，不猜测语义或修复源空格。20K 字符上限避免逐字 DOM 放大。public/style.css 复用现有 --mono 和颜色，正常字重、零字距。
- 文件：上述两文件、tests/markdown.test.js、tests/text-diagram-ui.py、README.md、devlog.md 与 codebase-map 索引/脚本/坑库。
- 验证：Playwright Chromium 实测 1440/320px 单双宽网格、页面无横向溢出与键盘滚动入口；单测覆盖组合字符、emoji、注入、原文复制与大内容回退。

## 2026-09-12 首次安装允许后配模型，并自动补装 Pi
- 原因：新电脑尚无模型凭据时 createPiFactory 直接退出，用户无法进入网页配置；安装脚本也未补装 Pi CLI。
- 决策：服务启动与模型可用性分离，建会话时才校验，每次从最新模型目录选择；显式无效模型仍拒绝，不悄悄替换。网页无模型时保持连接并复用现有「模型与供应商」设置，配置后可新建会话，不新增向导或样式。
- 安装检查 Pi CLI，缺失则 npm 全局安装最新版，已有不强制升级，安装失败中止。卸载沿用停止/取消自启/npm uninstall 三步，README 说明实际包名与保留数据，不额外删除共用 Pi。
- 涉及：src/pi.js、public/app.js、scripts/install.mjs、tests/model-onboarding.test.js、tests/install.test.js、前端回归测试、README.md、codebase-map 索引与坑库。复用既有 Linear 暗色面板和焦点样式，无新增依赖。
- 验证：真实 Pi SDK 在独立临时目录、空凭据环境启动，写入测试模型后刷新目录并创建会话；不调用真实模型、不修改用户凭据。最终全量结果见交付说明。
## 2026-09-12 00:52 ASCII 表格与 JSON 展示
- 原因：中英文混排的字符表格边框错位；用户需要会话 JSON 的格式化、压缩、去转义、转义和复制当前结果。
- 内容：共享 Markdown 渲染器识别完整 ASCII 表格并复用原生表格滚动样式、复制仍保留原文；JSON 使用原生 JSON.parse/stringify、本地操作与错误状态，不增加依赖。单元格和转换结果只用 textContent；未知/残缺 ASCII 保持代码，超安全整数拒绝重写。
- 样式：复用既有 --line/--surface/--muted token、8px 圆角与 4px 操作间距，窄屏工具栏换行。
- 涉及：public/markdown.js、public/style.css、tests/markdown.test.js、README.md、本日志与 .pi/skills/codebase-map/{INDEX,knowledge}.md。
- 验证：共享 Markdown 回归覆盖转换、原文复制、当前 JSON 复制、失败保留和 HTML 注入防护；npm test 184 项：183 通过、1 原有跳过，git diff --check 通过；未做真实浏览器视觉验收。

## 2026-09-11 修复 Tailscale 普通设备被拒绝
- 实机只读检查 status/whois：个人设备正常省略 Tags，旧 whoisUser 却要求数组，误将同账号设备当作 tag 设备拒绝。
- src/remote.js 允许省略 Tags，仍拒绝真实标签、非法类型、缺失 Node/用户和不同登录名；tests/remote.test.js 的所有普通设备 mock 改为真实省略形态，覆盖 HTTP/WS 全链路。README 与坑库、索引同步。
- 未替用户开启远程访问或中断正在运行的会话；修复部署后需重启 Axiom 进程。

## 2026-09-11 Tailscale 同账号远程控制

- 内容：设置左侧默认新会话设置下新增远程控制；自动读取本机 Tailscale 登录名，显式开启后仅允许同账号设备访问。电脑本机继续走 loopback，远程可正常操作会话，但远程访问配置和登录操作仅允许本机管理。
- 原因与决策：手机在 Wi-Fi/流量之间切换无需维护两套 IP 白名单；使用本机 Tailscale CLI 的 whois 验证真实连接身份，不信客户端邮箱/代理身份头，不保存密码，不开放公网或整个局域网。单独绑定 Tailscale 地址，不要求 Serve/Funnel。默认关闭，账号变更与关闭后撤销旧连接。
- 涉及文件：`src/remote.js`、`src/server.js`、`src/main.js`、`src/protocol.js`、`public/app.js`、`public/index.html`、`public/style.css`、`tests/remote.test.js`、`tests/remote-ui.test.js`、`README.md` 与代码索引技能。设置复用 Linear 的 #0f1011 面板、#23252a 边框、#5e6ad2 操作强调及系统字体，不新增依赖。
- 最终验证：`npm test` 184 项，183 通过、0 失败、1 原有跳过；`python tests/remote-ui.py` 的 1440/390/320px 全通过。远程验证使用模拟身份，未进行真实手机连通或真实登录操作。
- 联调：同步模型供应商设置的新导航；修正远程 active/online 状态区分、切换本机账号后只读邮箱刷新、登录授权部分回执合并及在途 WS 撤权检查。新建 `tests/remote-ui.py` 覆盖 1440/390/320px。
- 验证边界：使用模拟 Tailscale 身份与本地 HTTP/WebSocket 验证，不替用户执行真实登录或开启远程监听；实际手机端双设备连通需用户登录后验收。HTTP 由 Tailscale 加密传输，但浏览器非安全上下文，请求 ID 不应依赖 crypto.randomUUID，剪贴板功能可能受限。
## 2026-09-11 — 统一模型收藏与 Pi 模型管理
- 在独立 worktree `../worktrees/Axiom-model-favorites` / `feat/model-favorites` 实现；主仓库未跟踪的用户文件保持不动。
- 调研 Linear Favorites、WAI-ARIA Listbox 与触屏收藏交互。选择项与星标分开，收藏不切换、不关闭，稳定置顶；未收藏悬停/焦点显示，触屏常显。沿用现有 Linear 暗色 token、细边框与蓝紫焦点，黄色仅表达收藏。
- `public/model-picker.js/.css` 与 `public/app.js`：供应商、模型和思考等级统一组件/目录/收藏，覆盖输入区、默认设置、预设、子代理和压缩模型；刷新目录保留当前选择，不能因收藏或刷新隐式保存会话配置。
- `public/model-manager.js/.css`、`public/index.html`：设置侧栏增加「模型与供应商」，集中查看/编辑 Pi 配置，常见模板和自定义 API 地址，密钥留空保留，明确保存/刷新/删除反馈。
- 后端新增模型配置与收藏协议，直接操作 Pi models.json，保留未编辑高级字段，保护凭据、检测外部版本冲突并备份；收藏与 Pi 配置分离，使用 Axiom 全局数据目录。
- `README.md`、codebase-map 架构/索引同步；增加组件、持久化和隔离浏览器验收，测试数据不访问真实模型或用户凭据。验证：完整 npm test 172 项（171 通过、0 失败、1 原有跳过）；隔离 Chromium 验证收藏不改选中、跨页共享、设置导航及 390/320px 无横向溢出，截图位于本地 artifacts/model-selection。

## 2026-09-11 — 中断与重启后的 Working 收尾
- public/app.js：paintCallGroup 原先仅按后续正文 messageFolded 判断运行，末尾没有回答的中断记录在 idle 快照仍转圈。复用 waiting/stopActivity 统一记录各主/子代理输出区实际活动状态；状态控制 Working/Stopped/Completed，不改变正文边界折叠，不在工具间隙提前结束。
- tests/message-activity.test.js 增加实际事件→工具失败→idle→重启快照回归，验证活动结束与展开选择保持；npm test 145 项：144 通过、0 失败、1 跳过。
- README.md 同步行为，复用现有图标/样式，无新依赖。主动中断不自动重放有副作用的命令；继续使用现有消息入口。

## 2026-09-11 — 桌面发布最终验证
- 修正 tests/app.test.js、tests/message-activity.test.js 过时断言：精准选择 thinking-record 而非新增外层 details；按已实现的思考自动展开/结束收起、逐消息模型用量、工具状态规则验证；保留历史思考懒渲染、XSS 与错误状态覆盖。未修改产品行为。
- 最终 npm test：144 项，143 通过、0 失败、1 原有跳过；第二批发布 MSI 再次通过解包/进程/窗口与页面标题验收。两平台安装包 SHA256 检查通过。
- 功能分支提交推送后以 PR 合并 master，发布 desktop-v0.1.0（MSI/DMG/SHA256），清理两个功能 worktree；主工作区未跟踪用户文件保持不动。

## 2026-09-11 — 完成桌面安装包构建与验收
- 用户要求完整交付：继续执行分支 CI，而非停留在配置；两次 macOS Universal / Windows x64 构建成功。第二次运行 https://github.com/cosyeezz/axiom/actions/runs/34639536557 额外通过 hdiutil DMG 校验与 lipo arm64/x86_64 架构校验。
- Windows MSI 管理解包返回 0；启动解包后的 pake-axiom.exe，进程正常、主窗口标题 Axiom，UI Automation 读到 Axiom 页面标题；随后关闭本次启动的窗口，未停止后台服务。当前桌面会话无法截图，未声称完成全部交互验收。
- 打包文件保存到 ../releases/Axiom-desktop-v0.1.0/，生成 SHA256SUMS.txt 并上传 Release 草稿；README.md 增加正式下载地址，codebase-map 架构图与 workflow 首次触发知识同步。安装包未签名/公证，需使用者批准可信应用；不擅自关闭安全机制。

## 2026-09-11 — Pake 独立桌面壳
- 用户确认本体与壳独立：新增 desktop/pake.json，仅连接 http://127.0.0.1:4319，壳版本 0.1.0；复用现有 favicon，允许新窗口与拖放，不改后端或 npm 运行依赖，不附带服务生命周期管理。
- 新增 .github/workflows/desktop.yml：手动触发、固定 pake-cli 3.16.2，Windows x64 MSI 与 macOS Universal DMG，构建结果作为 30 天 Artifact 保存；未配置签名、公证或自动发布。
- README.md 记录安装、分离更新、端口、编译环境与未签名限制；.gitignore 排除本机产物；重建代码索引。
- 验证：npm ci --ignore-scripts 成功；实际 pake-cli --help 确认参数；读取配置后返回 ENV_MISSING（本机无 Rust），未产出安装包。npm test：140 通过、3 失败、1 跳过；在原主工作区只读复跑对应测试，同样复现 app.test.js / message-activity.test.js 三项已有失败，不修改无关断言。因基线不全绿，暂不合并 master，保留功能 worktree 待处理。


## 消息元信息紧凑排版
- public/app.js、public/style.css：供应商、模型、消息记录的 thinkingLevel 用间隔点分开；输入/输出用千分位和 ↑/↓，保留悬停说明与无障碍名称；纯工具消息的统计留在展开区域，不分隔调用组。
- tests/activity-groups-ui.py：Chromium 验证示例数字、级别和 390px 窄屏无横向溢出；README.md 同步。缺失思考级别不使用当前会话设置补写历史。


## 执行过程统一按正文边界结束
- 在独立 worktree `Axiom-activity-text-boundary` 修改 public/app.js：状态和折叠共用 messageFolded；移出正文消息内部的后续工具分组，让下一条工具消息沿用同组，模型用量不再形成视觉隔离。
- README.md 同步行为；tests/activity-groups-ui.py 新增带模型用量的连续工具回归，确认工具结束仍为 Working、分组数不增加；真实 Chromium 验证通过。


## 2026-09-11 — 增加 axiom stop
- CLI 经本机 POST /service/stop 请求优雅停止：拒绝忙碌会话/子任务，IPC 通知守护进程，保存后退出父子进程；命令等待守护退出，超时不强杀，不取消登录自启。
- Host/Origin 防跨站、仅 POST、重复请求拒绝；默认 4319，可用 AXIOM_PORT 指定端口。旧实例缺少停止接口时明确提示，不盲目杀进程。
- 服务相关 9 项通过；全量 138 通过、2 项已有思考渲染失败、1 跳过。未停止本机正式/开发环境。

## 2026-09-11 — 补发本地 master 已合并功能
- 将本地 master 截至 a8016a9 的已提交功能与公开 master 更新修复合并，包含 Working 工具/思考折叠、后续消息边界收起、工作空间标签与会话同步；不包含原工作区未提交改动。
- 修正上次只发布更新修复、遗漏本地 master 功能提交的问题；重建索引。npm test：136 通过、2 项思考渲染相关失败、1 跳过，如实保留测试结果，不修改断言掩盖失败。未部署或重启 4319/4320。

## 2026-09-11 — 更新修复独立合并 master
- 从公开仓库 origin/master 创建独立工作区，仅移入本次更新修复，不带入主工作区其他提交或未提交功能；重建发布版代码索引。
- 发布工作区 npm test：130 通过、0 失败、1 原有跳过；未全局安装或重启正式/开发服务。首次部署后需完整重启守护进程加载新更新逻辑。

## 2026-09-11 — 更新目录错位保护
- scripts/service.mjs 安装前后执行同一 npm 的 root -g，以 realpath 比对目标包与运行根目录；不一致拒绝，防止多 Node/npm 环境中更新别处却把旧目录标记为最新。
- tests/service.test.js 覆盖不同 prefix 安装前拦截、安装后 prefix 变化不写新 SHA，以及目录别名的真实路径核对；相关 9 项通过。未全局安装或重启服务。

## 2026-09-11 — 更新按 master 完整提交，不再依赖版本号
- src/update.js 始终查询 GitHub master SHA；读取安装目录 .axiom-commit，兼容旧 _resolved；无记录/损坏记录必须更新一次。15 秒请求超时，非法 SHA 拒绝执行。
- main 将检查结果 SHA 传给守护进程；service 使用 github:cosyeezz/axiom#完整SHA 全局安装，成功后才记录提交。安装失败尝试重启服务、解除请求锁定并反馈错误。首次部署需完整重启守护进程以加载新版逻辑。
- 验证：更新/守护/服务 API 9 项通过；npm test 137 通过、2 项已有思考内容渲染失败、1 跳过。未实际全局安装、未重启 4319/4320、未推送。

## 2026-09-11 — 预设会话合并发布 0.1.4
- 用户确认合并；功能分支先同步最新 master，保留导入 pi 会话入口、压缩与输入快捷键，文档两侧记录保留，代码索引重建。package.json patch 升至 0.1.4，以便独立仓库更新识别。
- 合并后 npm test：130 项，129 通过、1 原有跳过、0 失败。推送功能分支并合并 master，再按当时的子目录镜像方式同步 cosyeezz/axiom；主工作区未提交改动保留，不重启服务。全局/项目配置分层和工具进度条不在此次预设分支内。

## 2026-09-11 — 侧栏具名预设会话
- 按用户要求将自定义新会话入口改为「预设会话配置」，保存的预设按钮显示在其下方，共享背景框；复用现有主/子模型、能力与压缩表单，支持名称、可选固定目录、编辑、删除、点击启动。
- 后端通过 session.presets.list/save/delete 管理本机 presets.json，严格输入校验与串行原子持久化，不保存信任授权。前端启动先检查目标目录信任，需要时复用确认表单；不自动信任，不按名替换缺失技能。
- 涉及 public/app.js、index.html、style.css、src/sessions.js、server.js、protocol.js、tests/app.test.js、presets.test.js、README 与代码索引。此项不包含全局/项目默认配置分层，也不包含自动 Shell 启动命令。
- 验证：后端持久化/并发/输入校验与前端保存失败、编辑删除、失效能力确认、仅本次信任路径通过；全量 npm test 为 125 项，124 通过、1 原有跳过、0 失败；未重启本机服务，未做 macOS 实机验证。

## 2026-09-11 — 后台压缩增强合并验收
- 用户确认合并 master。功能 worktree 合入最新 master，保留技能恢复及三按 Esc 撤回功能；日志/知识库冲突保留两侧记录，索引按合并后源码重建。
- 验证：npm test 123 通过、1 原有跳过、0 失败。功能分支推送后合并并推送 master；保留主工作区 package-lock.json 和未跟踪文件，不安装依赖、不重启正式服务。

## 2026-09-11 — 后台摘要保留规则、输入区进度与子代理归档
- worktree `axiom-compaction-ux` / `feat/compaction-ux`。保持 Pi SDK 后台生成、安全点应用和滚动更新摘要；显式要求保留仍有效的旧目标、约束、决策、未完成项与准确上下文，不把未再次提及视为失效。提示词降低遗漏风险，不声称无损。
- 输入框上方增加后台压缩真实阶段提示，不虚构百分比；状态按主会话隔离并纳入快照，取消/失败/拒绝应用均有反馈。已压缩的委托任务按真实工具结果 ID 归入对应摘要，保留子代理详情和运行入口定位；多次压缩不再夹杂已归档任务。
- 验证：`npm test` 116 通过、1 原有跳过、0 失败；真实 Chromium 1440/390/320px 摘要分层、任务弹窗、进度位置、旋转和 reduced-motion 通过，无页面/CSP 错误。仓库无 build 脚本，采用现有测试和真实浏览器检查；未调用付费模型，提示词测试仅证明传参及保留规则，不证明摘要语义无损。委托两次被外部服务重启取消，核心代码由主任务直接完成。正式服务未由本任务重启。
- 涉及 `src/{compaction,pi,sessions}.js`、`public/{app.js,index.html,style.css}`、压缩后端/UI 测试、`tests/conversation-preview.mjs`、两级 README/devlog 与 codebase-map 索引/知识库。使用现有依赖，不安装或重装运行实例依赖；保留主工作区原有改动。

## 2026-09-11 — 输入快捷键与自动复制合并验收
- 用户要求合并 master；在 feat/input-shortcuts worktree 先合入最新 origin/master，保留三按 Esc 收回输入与能力恢复修复。README 合并两侧功能说明，devlog/knowledge 保留两侧记录，INDEX 重建解决生成文件冲突；未触碰主工作区 package-lock.json 等用户未提交内容。
- 验证：npm test 119 通过、1 原有跳过；独立 4327 预览下 Chromium 1440/390/320px 检查及真实剪贴板/开关持久化/撤销恢复通过，无浏览器错误。功能分支推送后合并 master 并推送，清理本次 worktree；不主动重启正式服务。

## 2026-09-11 — 选中自动复制与本地开关
- 在 feat/input-shortcuts 独立 worktree 继续实现：聊天输入框、会话正文及子任务详情支持 pointerup/选区相关 keyup 后自动复制非空白选区；不监听连续 selectionchange、不改变焦点/选区，不处理右键、清空快捷键、其他表单与跨区域选区。使用原生 Clipboard API，失败提示右键复制，无新增依赖。
- 按用户追加要求，设置页增加「输入与复制 → 选中自动复制」开启/关闭，默认开启；localStorage 保存当前浏览器偏好，保存受限仍在本页生效并提示，不进入服务端会话配置或断线禁用列表。手机系统手柄事件不保证送到页面，README 明示可用系统复制菜单。
- 涉及 public/app.js、public/index.html、tests/app.test.js、tests/conversation-ui.py、README.md、本日志及生成索引。验证 npm test 112 通过、1 原有跳过；真实 Chromium 剪贴板验证输入框/正文复制、关闭后均不复制、刷新保留关闭及原有撤销清空，1440/390/320px UI 检查通过、无页面错误。正式服务未重启。

## 2026-09-11 01:23 — 输入框撤销与清空快捷键
- 独立 worktree axiom-input-shortcuts / feat/input-shortcuts：聊天输入框 Ctrl+C 全选并调用原生删除，保留 Ctrl+Z 撤销/恢复清空；不影响图片、文件、Skill 附件及任务。不添加自建历史栈或依赖；输入法组合、只读/禁用及空文字不删除。
- 涉及 public/app.js、public/index.html、README.md、tests/conversation-ui.py、本日志及 codebase-map 索引/坑库；页面提示及 README 说明 Ctrl+C 在此处替代复制，右键仍可复制。
- 验证：npm test 112 通过、1 原有跳过；真实 Chromium 原生输入撤销/重做、部分选中后清空、重复清空后撤销恢复、输入法保护通过，1440/390/320px 既有 UI 检查通过、无浏览器错误。首次误连已有 4321 旧预览，改用独立 4327 端口后验证通过；未重启正式服务。

## 2026-09-11 — 技能恢复修复发布 0.1.3
- 用户确认合并与同步独立仓库。package.json 升至 0.1.3，发布跨目录默认能力收窄与逐会话恢复隔离修复；README 已同步恢复规则。
- 在功能 worktree 复验后合并原主仓库 master，并以旧发布方式推送至公开仓库 cosyeezz/axiom master。保留主工作区未提交改动，不重启本机服务，不执行 npm ci。

## 2026-09-11 01:30 — 跨目录能力继承与启动恢复隔离
- 原因：默认/历史能力以绝对路径持久化，跨目录或卸载后与新清单不符；Sessions.load 将单会话失败传播至 main，导致服务退出，macOS/Windows 共用此缺陷。
- src/capabilities.js 增加仅供默认继承/历史恢复使用的收窄选项，保持显式输入严格校验，错误包含具体 ID；src/sessions.js 对主/子选择取交集，保留 null/空集合/inherit 语义，不改写全局默认、不按名称替换或授予信任。load 逐文件隔离恢复失败并保留原文件，警告写服务日志。
- tests/capabilities.test.js、tests/config.test.js 覆盖真实项目技能跨目录、删除技能后恢复、子代理继承、坏 JSON/目录消失隔离、Windows/POSIX 旧 ID 和显式提交拒绝。同步 README.md、codebase-map/knowledge.md 与生成索引；不新增依赖、不修改用户数据。
- 验证：Windows 本机 npm test 114 通过、1 原有跳过、0 失败；git diff --check 通过。macOS 未实机运行，测试同时覆盖 Windows/POSIX 旧路径。

## 2026-09-10 21:52 — 紧凑原名工具行与模块强调
- 功能 worktree feat/conversation-labels。按用户六项反馈将工具/思考行缩至 12px/400、SVG 16px/底座 24px；工具显示原名（仅省略 functions. 前缀，完整名保留 title），powershell/pwsh 复用命令图标。思考/连接/准备调用使用 thinking / thinking... / connecting... / calling...，中文结果状态保留。
- waiting/running 的等待图标隐藏 SVG，使用高低亮度分段 CSS 旋转环；不增加定时器，尊重 reduced-motion。SKILL 与 SUBAGENT 使用描边标识、语义底色和左侧色条，任务状态行允许换行；桌面工具行最小 36px，手机 44px 点击区域不变。缩短消息/角色标题/用量间距，正文 14px、1.8 行高不动，不改安全 Markdown、流式脏块或折叠惰性渲染。
- 涉及 public/{app.js,style.css}、tests/{app.test.js,message-activity.test.js,conversation-preview.mjs,conversation-ui.py}、两级 README.md / devlog.md、codebase-map 索引及 knowledge.md。测试补原始工具名/完整 title/图标映射、Skill badge 和真实浏览器尺寸、键盘与伪元素旋转。
- 验证：npm test 86 通过、1 原有跳过、0 失败；Chromium 1440/390/320px 全部通过，无页面/CSP 错误。相同内容对比桌面工具行从 44px 降至 36px（18.2%），录制实际浏览器 12 帧动画，未伪造动效。样例不调用模型/读取用户数据。只读比对确认正式 4319 CSS 仍为 8b186c6：src/server.js 启动时缓存静态资源，需合并后快速重启才载入新版；本轮不重启正式服务，保留分支和截图供验收。

## 2026-09-10 21:19 — 会话配色验收与合并
- 用户确认合并并 push；三份只读复核已回收，无剩余阻塞。先在 feat/conversation-colors worktree 合入最新 origin/master，保留图片定位修复；knowledge.md 两侧记录均保留，INDEX.md 重新生成，不手工拼接行号。涉及这两份文档、本日志与仓库 devlog.md；不追加功能改动。
- 合并后验证：npm test 86 通过、1 原有跳过、0 失败；重启静态预览后，Chromium 1440/390/320px 配色、吸顶、定位、转圈及减少动态效果检查通过，无浏览器错误。按流程推送功能分支、合并 master 并推送，再将截图/日志移出并清理 worktree；正式服务不在本次合并中重启。

## 2026-09-10 21:12 — 会话语义配色、动态状态与阅读体验
- 功能 worktree feat/conversation-colors。按用户三轮反馈保留 Linear 深色底，新增雾蓝读取/搜索、青绿命令/代码、暖金编辑/重点、柔紫思考/子代理；正文缩至 14px，思考 Markdown 斜体正常字重（代码保持正体）。状态改清晰旋转环，覆盖思考、连接、工具与子代理卡片/浮层/摘要，结束停止并尊重减少动态效果。
- 去除工具输出、diff、系统提示词内部纵向限高，使用共享 sticky summary 和收起 SVG；原生键盘折叠、宽代码/表格横向滚动保留。子代理摘要改原生按钮，定位并聚焦会话内原卡片，不直接打开浮层；浏览器复现近底部跳转触发 onscroll 后重新跟随的问题，记录程序跳转位置并忽略同位置事件，实际滚动或回到最新可恢复，快照重置。
- 涉及 public/{app.js,style.css}、tests/{app.test.js,conversation-preview.mjs,conversation-ui.py}、README.md、本日志、仓库 devlog.md、codebase-map 的索引/职责表与 knowledge.md。不加运行依赖，不改 SDK、消息协议、安全 Markdown 或折叠渲染策略。
- 验证：npm test 83 通过、1 原有跳过、0 失败；已有 Python Playwright + Chromium 实测 1440/390/320px 配色、字号/字重、主/子长内容吸顶收起、无内部纵向滚动、键盘定位及回到最新；检查旋转实际运动、结束停止及 reduced-motion，无页面/CSP 错误。新增脚本可重复验收并输出截图，静态样例不调用模型、不读取用户数据；截图前等待滚动合成稳定，避免拍到短暂空白标题。正式服务未重启，先保留功能分支供用户看预览。

## 2026-09-10 20:40 — 会话 UI 复核修补
- 根据已回收的只读复核，确认左右 diff 把截断提示放在隐藏的统一视图里；public/app.js 将提示移到该节下方，activityLine 改 span 满足 summary 内容约束。public/markdown.js 避免 JS 查询依赖 :has，保留无 code 的 pre。public/style.css 清理旧强调色与未定义 --text，输入菜单使用同一套 Linear 表面/文字 token。
- tests/message-activity.test.js 覆盖长 diff/输出与双视图提示，tests/markdown.test.js 覆盖原始 pre；README.md、codebase-map 索引/knowledge.md 与仓库日志同步。侧栏/设置折叠三角不属于会话执行记录，保留原生交互；不新增工具归组、状态机或依赖。
- 验证：npm test 83 通过、1 原有跳过、0 失败；Chromium 桌面/390px/320px 全套 UI 检查通过，额外验证 1440px/320px 双 diff 视图截断提示及输入菜单颜色，无浏览器/CSP 错误。预览仍为静态样例，正式服务未重启。最终只读复核已回收：主体改动未发现功能/性能/安全回归；后续补修由主代理以上述 83 项测试与浏览器检查验证。复制反馈的失焦边界、纯 pre 的标签措辞和无害死选择器三项非阻塞建议暂留，避免扩大本轮范围；按仓库流程合并，验收截图移出工作树保留。

## 2026-09-11 — 会话信息层级与 Linear 视觉重设计
- 功能 worktree feat/conversation-ui。按用户反馈去掉执行记录默认三角、字符图标和重复思考状态：统一 20px SVG + 32px 底座，工具动作/对象/状态分列，完成保持工具身份；工作空间内路径缩短，手机对象换行，未知工具原名省略显示。
- 思考入口合并为一行，展开复用安全 Markdown 与脏块渲染；正文/思考/重点/斜体分层。代码块新增语言/复制反馈，表格改原生布局加可聚焦滚动容器，修正右侧空框及窄屏单字换行；工具详情、Skill、重试与压缩统一文字展开提示。采用项目 design 的 Linear tokens 与系统字体回退，无新增依赖，不改 pending、回执、SDK 或模型上下文。
- 涉及 public/{app.js,style.css,markdown.js,stream-renderer.js}、tests/{app,markdown,message-activity,stream-renderer}.test.js、tests/conversation-preview.mjs、README.md、devlog.md、codebase-map 索引/职责表与知识库。新增无模型/用户数据的本地预览入口，主代理完成 UI，子代理只读复核。
- 验证：npm test 82 通过、1 原有跳过、0 失败；Chromium 148 实测桌面/390px/320px 无会话或浮层横向溢出，Enter/空格展开、思考 Markdown、代码真实剪贴板、diff 响应式、子任务与减少动态效果通过，页面/CSP 控制台无错误。JSDOM 微基准中位数 baseline 2457ms / optimized 340ms；折叠任务 0 帧/0 解析（仅本机微基准，非模型速度）。未调用付费模型；静态资源需服务重启后生效。

## 2026-09-11 — 子任务主动通知、凭证读取与输入区运行摘要
- 功能 worktree feat/task-notifications。完成任务随机生成 resultId，结果与待通知状态先落盘，再等主运行结束合并唤醒；通知不进入可撤回队列，取消暂停，重启补发（不保证 exactly-once、不重跑任务）。旧任务加载补齐凭证；取消通知轮不标记送达。
- read_result / WS tasks.read 改单任务 taskId+resultId，删除 wait 和批量/轮询用法；新增 append，默认 steer、可选 followUp，仅允许运行中子任务追加。模型提示与 smoke 同步迁移。
- 输入框＋上方添加当前会话启动中/运行中子代理的单行摘要，转圈图标、省略溢出，完成移除、切会话重置，复用现有任务状态；不增加依赖或后端接口。
- 涉及 src/{tasks,sessions,tools,protocol,server,capabilities}.js、public/{app.js,index.html,style.css}、tests/{tasks,task-notifications,config,capabilities,app}.test.js、tests/smoke.js、README.md、索引及 knowledge.md。使用假代理与 DOM 回归验证；未调用付费模型运行 smoke、未做真实浏览器视觉验收。

## 2026-09-10 — 主/子代理自动避让重试
- 功能 worktree feat/auto-retry。调研 OpenAI/Anthropic SDK 与 Pi SDK 后，在共享 factory 层统一重试，禁用底层重复计数；保留工具结果后继续，不重发用户任务。
- 用户确认间隔 3、3、3、6、6、12、24、48、96、192…秒，持续翻倍、最多30次。长等待分段定时防32位溢出；主动停止立即取消；永久错误不重试。
- UI 原生 details 聚合错误与等待时间，成功自动折叠，可手动展开；主/子代理隔离，记录保存、重启标记停止。前端委托两次遇到429失败，改由主代理实现。
- 涉及 src/{pi,retry,sessions}.js、public/{app.js,style.css}、tests/{retry,app,session-flow}.test.js、README.md、索引与知识库。测试使用假模型/假等待，不调用付费模型；未做真实浏览器视觉验收。
## 2026-09-10 — 图片粘贴位置占位
- 功能 worktree feat/image-placeholders。上传/粘贴立即在光标或选区插入 `[imageN]`，缩略图显示同编号，删除附件同步删标记并重排；发送保留正文位置并附编号与附件顺序说明，复用原协议，不改 SDK。
- 队列撤回按已有草稿与各条附件数累加调整编号；读图与撤回互斥，避免异步编号冲突；读图失败只回滚原位置尚未编辑的占位，不覆盖用户新输入。手改标记按普通文字处理，删除标记不自动丢弃图片。
- 涉及 public/app.js、tests/app.test.js、README.md、devlog.md、codebase-map 的 INDEX.md 与 knowledge.md。测试覆盖中间粘贴、继续输入、删除重排、失败恢复、异步切会话、多条撤回编号、发送说明；独立复查补充了读图/撤回竞态防护。
- 验证：npm test 全量 52 项通过；未做真实浏览器手动验收。

## 2026-09-10 — 三类分组与拖动排序
- 功能 worktree feat/session-groups。按用户要求列表分三类：按时间分组、待处理（运行中会话，紧挨已完成上方）、已完成；另支持同类内拖动会话到另一行手动排序。
- 排序以全局会话 id 顺序物化存入 localStorage（axiom.sessionOrder），搜索中拖动也不破坏其他会话顺序；未排序会话按原服务端顺序稳定跟随。
- 涉及 public/{app.js,style.css}、tests/app.test.js、README.md、devlog.md 与 codebase-map 索引。
- 验证：npm test 全量 52 项通过，新增断言三类分组顺序、拖动排序落点、localStorage 持久化与重渲染稳定；未做真实浏览器拖拽验收。

## 2026-09-10 — 已完成区上移与待处理分组
- 功能 worktree feat/done-placement。按用户要求，「已完成」区域从侧栏底部固定改为紧贴会话列表下方（列表空间不足时自动压缩滚动，「设置」仍钉在底部），并在列表顶部增加「待处理」分组标题。
- 涉及 public/{app.js,style.css}、tests/app.test.js、README.md、devlog.md 与 codebase-map 索引。

## 2026-09-10 — 已完成区去掉拖放提示文案
- 功能 worktree feat/done-label。按用户要求，折叠区标题精简为「已完成」，去掉「· 拖到这里」提示；拖放行为不变。涉及 public/{app.js,index.html}、devlog.md。
- 验证：npm test 全量 51 项通过（测试未断言该文案）。

## 2026-09-10 — 输入框 Skill 与工作空间补全
- 功能 worktree feat/composer-completion。输入开头 `/` 补全当前会话 Skill，`@` 补全文件及文件夹，支持名称过滤、路径分层、带空格路径、点击与上下/Enter/Tab/Esc 键；文件夹可直接引用或右箭头进入。
- 复用 workspace.browse 的工作空间边界检查、已有标签及发送链路，不引入依赖或新协议；序号与会话检查丢弃过期结果，切换/断线/失焦关闭候选。修正仅文件/文件夹标签无法发送的已有条件遗漏。
- 涉及 public/{app.js,index.html,style.css}、tests/app.test.js、README.md、devlog.md、codebase-map 索引与知识库。测试覆盖技能/文件/文件夹、去重、键盘、邮件/URL 不误触发、过期回包与引用单独发送。
- 验证时发现 controls 首次执行早于补全状态初始化，将状态声明移到文件顶部后页面测试通过；`npm test` 全量 51 项通过。未执行真实浏览器手动验收。

## 2026-09-10 — 已完成区改名与去掉计数
- 功能 worktree feat/session-done-label。按用户要求，隐藏区标题由「已隐藏 (N) · 拖到这里」改为「已完成 · 拖到这里」，不再显示会话个数；README 同步。涉及 public/{app.js,index.html}、README.md、devlog.md。
- 验证：npm test 全量 51 项通过（测试未断言计数文案，无需改动）。

## 2026-09-10 — 顶栏标题与路径间距
- 用户反馈标题和路径行距过大，与左侧菜单按钮不协调；路径图标虽然设置 height:26px，仍被全局 button min-height:40px 撑高。
- public/style.css 显式设置路径图标 height/min-height:24px，标题行高 20px、双行间距 2px，沿用顶栏垂直居中，不改其他按钮。
- tests/app.test.js 增加真实页面 CSS 计算样式回归检查；同步 README.md、knowledge.md 与索引。npm test 全量 52 项通过；worktree 初次缺依赖，建立现有 node_modules junction 后通过，无新增依赖。未做真实浏览器截图验收。
- 同时排查 Steer / Follow-up：空输入时禁用符合现有逻辑，输入后启用及双类型发送已有测试覆盖，无需修改队列。

## 2026-09-10 — 会话隐藏与拖放恢复
- 功能 worktree feat/session-hide。在会话列表下方添加默认收起的原生 details 隐藏区，支持拖入隐藏、拖回恢复及键盘/触屏按钮；限制展开高度，避免影响正常列表阅读。
- 按后续反馈，将重命名图标改为直线铅笔轮廓，去掉原有类似取色器的圆头。
- 按后续要求，将隐藏入口放在编辑前，使用对钩图标与「完成并隐藏」提示，点击后移动到下方隐藏区；隐藏区仍提供向上箭头恢复。
- 仅作为当前浏览器列表偏好保存到 localStorage，不增加服务端协议、不删除或停止会话、不切换当前对话；搜索和工作空间筛选继续生效。
- 涉及 public/{app.js,index.html,style.css}、tests/app.test.js、README.md、devlog.md 和 codebase-map 索引。
- 验证：npm test 全量 51 项通过，覆盖双向拖放、按钮隐藏/恢复、折叠、持久化写入、列表刷新、搜索及不发会话操作请求；未执行真实浏览器拖放验收。首次因 worktree 缺依赖失败，建立既有 node_modules junction 后通过，无新增依赖。

## 2026-09-10 — Skill 与用户消息分离
- 按用户要求，public/app.js 将 skill 折叠块放到对应用户气泡前面、同级显示，保留安全 Markdown 与按需展开；纯 skill 不留空气泡，压缩时一起隐藏。
- 涉及 public/app.js、tests/app.test.js、README.md、devlog.md 与 codebase-map 索引。功能 worktree feat/skill-flat；不增加依赖。
- 验证：`npm test` 51 项通过；覆盖同级顺序、展开、重复渲染清理、纯 skill 和压缩隐藏。首次缺少依赖，建立共享 node_modules junction 后重跑。

## 2026-09-10 — 移除浏览器截图，增加图片放大预览
- 功能 worktree feat/image-preview。按用户要求删除截图按钮与 getDisplayMedia 抓帧逻辑，保留上传和粘贴；附件及消息/历史图片共用原生 dialog 放大预览，支持点击、Enter/空格打开，关闭按钮、遮罩或原生 Esc 关闭，不新增依赖。
- 涉及 public/{app.js,index.html,style.css}、tests/app.test.js、README.md、devlog.md 与 codebase-map 索引。
- 验证：全量 `npm test` 50 项通过，覆盖截图入口移除、附件/消息预览、键盘开启、关闭与图片源清理。首次测试因 worktree 缺少依赖失败，修正依赖 junction 后通过；JSDOM 不实现原生 Esc，关闭事件用 close() 验证。

## 2026-09-10 — 现代原生工作空间选择框
- 功能 worktree feat/modern-workspace-picker。按用户反馈替换老式树状 UI：优先调用本机 PowerShell 7，启用 VisualStyles、AutoUpgradeEnabled 和标题；仅未安装（ENOENT）时回退 Windows PowerShell，其他错误不重复弹窗。不新增依赖，保留置顶 owner、取消和超时语义。
- 涉及 src/sessions.js、tests/workspace-picker.test.js、README.md、devlog.md、codebase-map 坑库与索引。
- 验证：全量 `npm test` 50 项通过；本机 PowerShell 7.6.6；Windows UI Automation 实测现代选择框、地址栏、搜索框和选择文件夹按钮可见，测试窗口已关闭；测试覆盖新版优先、缺失回退以及非 ENOENT 错误不回退。

## 2026-09-10 — 修复工作空间选择窗口不可见
- 功能 worktree feat/workspace-picker。后台 PowerShell 的无 owner 文件夹选择框可能隐藏或落在浏览器后面，未完成的请求随后被误导性提示「窗口已打开」。为原生选择框创建并激活置顶 owner，完成后释放；保留互斥与 5 分钟超时，补充明确占用/超时错误，移除不再存在的手输路径建议。
- 涉及 src/sessions.js、tests/workspace-picker.test.js、README.md、devlog.md、codebase-map 索引与坑库。无新增依赖，不改会话切换流程。
- 验证：全量 `npm test` 50 项通过；Windows UI Automation 确认真实选择框和取消/确定按钮 IsOffscreen=false（测试窗口已关闭）；回归覆盖中文路径、取消、并发拒绝、超时及失败释放锁。首次原生探测命令误匹配自身并终止，已修正排除自身后重新验证。

## 2026-09-10 — 守护进程自动重生
- 功能 worktree feat/supervisor-respawn。worker 意外退出后 supervisor 自动重启（指数退避 1s→10s，稳定运行 30s 重置计数），端口被占时后台重试、释放后接管；优雅停止/快速重建路径不受影响，终端 Ctrl+C 仍整体退出。
- 涉及 scripts/service.mjs、tests/service.test.js。验证：真实子进程测试 49 项全部通过。

## 2026-09-10 — 工作空间打开改原生选择
- 功能 worktree feat/workspace-picker。按用户要求移除侧栏手输目录路径表单（▶ 工作空间），「打开工作空间」直接拉起原生文件夹选择，选后切已有同目录会话或新建；当前工作空间改存 JS 变量，不再借隐藏 DOM 输入框当状态。非 Windows 暂无打开其他工作空间入口（pick 本就仅 Windows），README 同步。
- 涉及 public/{index.html,app.js,style.css}、tests/app.test.js、README 与代码索引。验证：全量 npm test 48 项通过。

## 2026-09-10 — 截图与图片输入
- 独立 功能 worktree feat/image-input。输入区增加图片上传、粘贴系统截图、浏览器授权截取屏幕/窗口/标签页；截图只抓一帧，成功或失败都停止共享。复用 FileReader、canvas、getDisplayMedia 与 Pi 原生图片输入，无新增依赖。
- 支持纯图片/图文发送、附件预览与移除、按会话保留草稿、消息历史图片；限制 PNG/JPEG/GIF/WebP、4 张/消息、5 MiB/张，后端校验 base64、签名与大小，视觉模型能力提前校验。排队与撤回保留附件，避免 SDK 文本队列回执丢图。
- 涉及 public/{app.js,index.html,style.css}、src/{protocol,server,sessions,pi}.js、tests/{app,image-input}.test.js、README/devlog、codebase-map。刻意不增加裁剪/压缩库或独立上传存储；截图超限可先使用系统区域截图。未发送草稿仅存页面内存。
- 验证：`npm test` 初始 41 项、同步最新 master（服务控制功能）后全部 48 项通过；前端 JSDOM 检查上传、粘贴、纯图发送、会话隔离、移除、格式/数量限制和截图清理；后端检查协议、模型限制、图片队列与 WebSocket 大图传输。未调用付费视觉模型、未进行真实浏览器授权弹窗人工验收，未重启现有服务。

## 2026-09-10 — 跨平台自动启动与服务重启
- 独立 功能 worktree feat/service-controls。右上角独立连接状态与服务菜单，命名「快速重启」「重建重启」；复用 WebSocket Origin/Host 校验，严格校验模式，忙碌会话/子任务禁止重启。
- npm start 使用 Node 守护进程与 IPC 优雅停止。重建执行 npm ci + 可选 build，暂存原依赖以便安装失败恢复；原生 JS 不增加虚假编译步骤。当前用户登录自动启动分别使用 Windows Startup、macOS LaunchAgent、Linux systemd --user，不立即启停现有进程。
- 涉及 scripts/{service,autostart}.mjs、package.json、src/{main,server,protocol}.js、public/{app.js,index.html,style.css}、tests/{service,service-api,autostart,app}.test.js、README 和代码索引。
- 验证：自动启动三平台配置生成/转义、真实子进程快速重启、重建失败恢复与 API 校验测试；全量 npm test。macOS/Linux 尚无真实系统登录验收，不宣称已验证开机；不强杀运行中的现有服务。

## 2026-09-10 — 可配置后台摘要与 turn 安全压缩
- 独立 功能 worktree feat/background-compaction。按照用户确定方案，后台独立内存 Pi 会话生成摘要，主会话继续运行；token/窗口占比阈值任一先达到触发，支持专用模型、思考等级和近期保留量，摘要会话固定无工具及无关资源。
- 复用 Pi 原生轮次刷新钩子，摘要完成后仅在下一请求前校验并提交；保留固定边界之后的近期消息与全部新增输入/输出/工具结果，原生压缩作为窗口保护。每会话单任务，失败/失效不折叠、不删除原文。
- 配置接入默认设置、自定义新会话和当前会话；成功压缩事件/历史消息 ID 落盘，前端按覆盖范围局部隐藏旧消息并新增可展开摘要，不重建流式消息。无新增依赖，不修改 node_modules。
- 涉及 src/{pi,compaction,protocol,sessions}.js、public/{app.js,index.html,style.css}、tests/{compaction,compaction-config,config,app}.test.js、README/devlog 与 codebase-map。验证：npm test 34 项通过，含真实 SDK + 本地 SSE 伪模型端到端、真实 HTTP 取消、split-turn、失效检查、阈值校验、配置/消息 ID/摘要重启恢复、前端折叠与输入滚动保留。实际本机已认证 Pi factory 创建/配置/释放检查通过；未调用付费模型、未重启现有服务，未进行真实浏览器视觉验收。

## 2026-09-10 — 紧凑添加菜单、Skill 标签与布局纠正
- 在独立 独立功能 worktree 实施：菜单改为 176px 三行单行布局，移除标题/副文案，说明移入 title；加号换细线 SVG、桌面 28px 无边框按钮，触屏保留 40px 点击区域。
- Skill 单独保存为页面草稿状态，上方标签显示，正文不再重复命令，发送时复用 Pi /skill 命令；取消不改正文、失败保留、切换按会话恢复，支持仅发送 Skill。删除旧 CSS order，恢复正文→模型按钮→会话信息。
- 涉及 public/{app.js,index.html,style.css}、tests/app.test.js、README.md、devlog.md 和 codebase-map；npm test 13 项通过。独立 Chromium 检查 1440/390px 菜单 176×106、加号 28×28、无横向溢出，模型操作行实际位于信息栏上方。未重启现有服务。

## 2026-09-10 — 上下文添加菜单与工作空间本地操作
- 独立 功能 worktree feat/composer-add-menu。参考 Claude Code 桌面「＋」与 Cursor 上下文引用官方文档，移除可见的 Skill 表单行，输入框上沿增加图标菜单、搜索选择器、可移除标签；不调整模型栏/运行摘要位置。Skill 正文以 Pi 终端同款 `[skill] 名称` 默认折叠、点击展开并安全渲染，保留任务正文。
- 文件/目录只添加工作空间路径引用，按需读取；浏览接口校验真实路径边界，排除符号链接及 .git/node_modules。新会话上方提供 Windows 原生选目录，路径后增加复制/Explorer 图标；取消选择不切换，沿用原会话/信任流程。顶栏仅 WS 状态、停止按钮改 Stop。
- 涉及 public/{app.js,index.html,style.css}、src/{sessions,server,protocol}.js、tests/{app,session-flow,codebase-index}.test.js、README/devlog 与索引/坑库。无新增依赖；native picker 限 Windows，目录引用不冒充完整附件加载。
- 验证：13 项自动测试通过，覆盖菜单搜索/选择/移除/发送、Skill 折叠与正文、复制/打开请求、目录越界/缺失、索引行号；独立 4348 模拟服务浏览器验证 1440/390/320px 无横向溢出、菜单与标签可操作、无页面异常。未调用付费模型，未重启现有服务；Windows 原生弹窗与 Explorer 尚未人工点击验收。

## 2026-09-10 — 输入框显式加载 Skill
- 独立 功能 worktree feat/composer-skills。输入框增加原生 Skill 下拉框，显示主代理实际可用技能及说明；选择、替换、取消直接编辑草稿中的 `/skill:名称 `，发送前即可看到要加载的技能。
- 复用 Pi 原生命令展开，普通发送/插话/追加共用，不添加加载接口、依赖或独立选择状态；草稿原有切换保留与失败保留机制不变。只提供单技能显式加载，不把默认能力预览当作当前加载状态。
- 涉及 src/pi.js、public/{app.js,index.html,style.css}、tests/app.test.js、README.md、devlog.md 和 codebase-map/INDEX.md。npm test 13 项通过，覆盖选择/替换/取消、手动命令同步、发送请求及发送后清空；未调用真实模型，未重启现有服务。

## 2026-09-10 — 队列、运行中模型切换与工作空间会话落盘
- 独立 功能 worktree feat/session-flow。发送操作移到输入区底部；执行中提供 Steering 插话与 Follow-up 追加，设置保存当前会话 Enter 默认类型。复用 Pi 原生队列事件/查询/clearQueue，点击或单按 Esc 撤回全部队列并保留已有草稿，300ms 内双按 Esc 停止；弹窗及手机侧栏优先处理 Esc。
- 运行中允许切换模型，不误将运行状态改为 idle；回答下方使用消息本身的 provider/model/usage，不套用当前选择。右上角仅显示已连接（绿）/连接断开（灰）。重命名、删除使用统一暗色原生 dialog，异步操作绑定原会话 ID，错误留在弹窗。
- 选择 ~/.axiom/workspaces/<目录 SHA-256>/ 下 Pi 原生 JSONL + 网页元数据 JSON，而非 SQLite：无需新依赖和上下文格式转换，保留 Pi 压缩/模型记录；元数据串行原子替换，保存标题、配置、网页消息和子任务结果。正常退出保留历史，显式删除移除磁盘记录；重启不自动续跑。默认配置移到 ~/.axiom/defaults.json，首次从旧位置复制且不覆盖已有文件。
- 验证：npm test 13 项通过，新增持久化/关闭恢复/删除/队列类型/运行中配置状态检查；页面测试覆盖撤回保留草稿、单 Esc 不取消、双 Esc 取消与连接状态。真实 SDK 无付费调用验证创建/保存/关闭/重新加载/删除通过。Playwright 独立 4337 模拟服务检查 1440/390/320px 均无横向溢出，发送按钮贴近输入区底部，重命名弹窗打开并聚焦名称输入。未重启既有 4319 服务，旧版纯内存会话无法由此次文件存储自动迁移。
- 涉及 src/{main,pi,protocol,server,sessions}.js、public/{app.js,index.html,style.css}、tests/{app,config,session-flow}.test.js、README.md 与 codebase-map。队列目前按 Pi 原生一次撤回全部，不实现自造逐条队列；运行队列/未完成片段不跨重启恢复。

## 2026-09-10 — 子代理会话内浮层、统一渲染与上下跳转
- 在独立 worktree（feat/subagent-overlay）实施。模型摘要及等级选项去掉「思考」前缀，直接显示供应商 · 模型 · max 等实际等级；不改变运行配置或思考输出能力。
- 主会话保留 SUBAGENT 状态/任务卡片，点击打开原生 dialog。按用户反馈将初版青绿色改为与现有主题协调的低饱和蓝紫色；浮层和遮罩限定在右侧会话区，以其中心定位，宽度沿用 880px 上限，避开侧栏和顶部会话栏，随侧栏收起及移动端布局变化。
- 复用主会话 card/renderMessage、stream-renderer、Markdown/DOMPurify 和消息样式，只替换容器；没有第二套子代理渲染或新依赖。缓存、上下文、实际模型/等级固定在顶部，下方独立滚动；「回到最上」暂停跟随，「回到最下」恢复跟随。关闭/未打开时不解析正文，重开补绘完整结果；不自动弹窗抢焦点。
- 保留原生关闭/遮罩/Esc/焦点返回，Esc 不取消代理；切换/重连释放旧浮层，按快照恢复；延迟 close 回调不清空已重新打开的 activeTask。将浮层 h2 样式限定到顶部，避免污染复用的 Markdown 正文。
- 验证：npm test 12 项通过（主/子真实 Markdown 相同、XSS 边界、流式/思考/最终消息、隐藏按需绘制、任务隔离、上下跳转与跟随、关闭竞态等）；Playwright 独立 4331 模拟服务验证 1440/1024/768/390/320px 及 700×400 横屏、侧栏展开/收起、浮层相对会话居中、顶部固定、跳转、关闭/焦点、断线重连与会话隔离，无横向溢出和控制台错误，未调用付费模型。原 4319 服务未重启（重启会丢失内存会话）。
- 涉及 public/{app.js,index.html,style.css}、tests/app.test.js、README.md、devlog.md 与 codebase-map 索引/坑库；截图仅放独立 artifacts 目录，不提交。

## 2026-09-10 — 会话运行摘要与子代理详情
- 在独立 worktree（feat/session-runtime）实施。发送按钮去掉 ↑；模型选择下显示最近请求缓存命中、Pi 当前上下文估算和实际供应商/模型/思考程度，窄屏换行。
- 复用 SDK systemPrompt、messages.usage 和 getContextUsage，增加 agent.runtime 边界事件与主/子快照；子任务销毁前保留最终信息。折叠摘要显示状态与运行信息，展开查看完整任务、实际系统提示词、错误和输出，提示词只按纯文本展示。
- 展示元数据不进入 read_result/tasks.read，避免额外占用主代理上下文；未知用量不伪装成 0%，压缩后的未知上下文显示待更新。无新依赖，不在 token 增量上扫描历史或传输提示词。
- 验证：npm test 12 项通过，覆盖运行数据、模型变更、主子/跨会话隔离、历史恢复、终态保留、XSS 文本边界与折叠按需绘制；真实 SDK 创建/读取/释放验证通过，未发起付费模型请求。Playwright 使用独立 4327 模拟服务验证 1440/390/320px 无横向溢出、提示词纯文本及摘要展示；git diff --check 通过。
- 涉及 public/{app.js,index.html,style.css}、src/{pi,sessions,tasks}.js、tests/{app,config}.test.js、README.md、devlog.md 与 codebase-map 索引/坑库。

## 2026-09-10 — 顶部能力同步默认选择，移除当前会话展示
- 浏览器复现顶部仍显示当前会话、同步预览位于下方的混淆；按用户要求删除当前会话标题和能力展示及渲染代码，唯一默认预览移到顶部「会话能力」。
- 修复浏览器 CSP 阻止预览 inline style 的错误：换行与长文本样式移入外部 CSS，不放宽安全策略。
- npm test 10 项通过，覆盖当前会话展示移除、预览位于编辑器上方及自动保存同步。浏览器样式预览确认 pre-wrap；复核时 WS 断开，未声称完成在线保存验证。
- 涉及 public/{app.js,index.html,style.css}、tests/app.test.js、README.md、devlog.md。

## 2026-09-10 — 默认新会话自动保存与本机持久化
- 默认配置取消保存按钮，选择事件直接经既有 WebSocket 命令保存；显示保存中、落盘成功或失败未生效。增加实时默认能力预览，与当前会话实际配置明确区分，复用原选择器和能力名称格式化。
- 本机 Pi 用户目录 axiom/defaults.json 持久保存默认配置；启动加载并校验结构，同目录临时文件原子替换，串行保存避免并发部分更新丢失，失败不覆盖旧配置。Pi settings/MCP、目录信任与自定义入口不变。
- 验证自动保存真实页面 change 事件、服务重建加载、并发部分更新、失败不覆盖及损坏配置报错；npm test。
- 涉及 src/{main,sessions,protocol}.js、public/{app.js,index.html}、tests/{app,defaults}.test.js、README.md、devlog.md。

## 2026-09-10 — 浏览器复核与会话能力短名称
- 浏览器连接现有 4319 服务，复现主/子能力清单直接显示绝对路径、导致设置内容过长的问题。抽取 capabilityName，技能显示目录名、npm 扩展显示含 scope 的包名，本地扩展显示文件名或 index 所在目录；缺失能力提示复用，内部标识保持不变。
- 浏览器以请求替换预览同一修复，确认主/子清单不含绝对路径；390/1440px 无横向溢出，默认配置正常加载且仅一个弹窗。未保存测试配置、未重启服务或调用模型。
- 增加 Windows/POSIX、scoped 包、本地 index、单文件扩展和 MCP 名称回归。涉及 public/app.js、tests/app.test.js、README.md、devlog.md。

## 2026-09-10 — 设置左侧分类与内联默认会话配置
- 在 feat/settings-inline 独立 worktree 实施。设置增加左侧唯一分类「默认新会话设置」，右侧保留当前主/子 Agent 供应商、模型、思考与 Skills/MCP/Extensions 明细，直接在其下编辑默认配置，不打开二级弹窗。
- 复用原有 create-form 和主/子选择器，在默认设置与自定义新会话之间移动同一表单；补充模型支持的思考等级以及子代理模型/能力分别跟随主代理。能力 inherit 与全部 null 明确区分，子任务使用主代理实际能力，不扩大选择。
- 新增 thinking/subagentThinking 默认值、子能力解析快照和协议校验；默认保存只影响后续普通新会话，保留服务内存生命周期和原信任边界。清单表示配置/加载能力，不声称已经调用。
- 验证：npm test 9 项通过，覆盖内联表单不打开二级弹窗、保存思考与能力跟随、刷新恢复、自定义入口隔离和子任务实际继承；Pi 工厂模块导入及 git diff --check 通过。
- 涉及 public/{app.js,index.html,style.css}、src/{pi,protocol,sessions}.js、tests/{app,config}.test.js、README.md、devlog.md。

## 2026-09-10 — 可配置默认新会话，复用自定义会话组件
- 在独立 worktree（feat/default-new-session）实施。「新会话 · 全部能力」更名为「新会话」，设置中增加默认新会话入口，可独立配置主/子模型与 Skills、MCP、插件的全部或自定义能力（含空选择）。
- 两种配置直接复用原有弹窗、createAgentPicker 和加载/提交数据组装；协议共享选择字段，保存与创建共用 validateSelection，不新增依赖、组件副本或配置服务。默认配置和最近主模型/思考回退值分开，防止调整当前会话覆盖显式默认配置。
- Sessions.create 统一合入默认值，覆盖所有普通创建入口；自定义入口明确 useDefaults:false，保留当前模型和初始全部能力的原行为。保存默认不创建代理、不改已有会话；省略字段保留，null 恢复默认/全部，失败保留旧值。沿用服务内存生命周期，刷新/重连保留，重启重置，不写 Pi 设置。
- 默认配置不保存目录信任；保存和实际创建均校验目录/模型/两组能力，所选能力在其他目录不可用时拒绝创建，编辑保留并标记缺失项，不静默扩大或清空选择。原有自定义会话级信任流程保持不变。
- 验证：npm test 9 项全部通过，扩充默认配置保存/继承/覆盖/重置、主子与已有会话隔离、失败回滚、协议校验、WebSocket 重连和真实页面处理器回归。Playwright 使用独立 4323 测试服务与模拟代理，验证保存不新建、普通创建应用空能力和固定模型、自定义仍全部、刷新恢复、Escape 返回设置及焦点；320/390/700/1440px 页面和弹窗均无横向溢出。无付费模型调用。
- 涉及文件：public/{app.js,index.html,style.css}、src/{sessions,protocol,server}.js、tests/{app,config,server}.test.js、README.md、devlog.md。

## 2026-09-10 — 默认完整能力与自定义主/子代理新会话
- 在独立 worktree（feat/agent-capabilities）实施。新增默认全部能力、自定义新会话两个入口；弹窗复用模型选择样式，主/子代理分别选择供应商/模型和 Skills、MCP、插件多选清单。
- 复用 DefaultPackageManager/loadSkills/DefaultResourceLoader，不重写插件扫描或 MCP 协议；MCP 通过已安装适配器独立 config 快照过滤。增加直接依赖 jiti 2.7.0（与 SDK 已使用版本一致），用于导入 Pi 全局 npm 目录中的 TypeScript MCP 适配器及其配置解析器，并映射到当前宿主 SDK。
- 默认遵守 Pi 已启用配置和目录信任；未信任项目仅全局加载，自定义可明确授予会话级信任。配置快照不写回用户设置。插件按选择加载而非加载后隐藏；主/子模型运行时独立，接通 session_start/session_shutdown，避免 MCP 连接泄漏。无 TUI 组件桥，需审批的操作不自动放行。
- 新增 capabilities.list 与 session.create 能力字段，创建前校验两类代理选择；快照保留模式/选项、实际工具名和加载提示。能力创建时固定，模型继续使用现有设置机制。修复插件指令无模型回答被误报失败，以及子任务清理异常导致状态不发布。
- 验证：npm test 9 项通过，含目录信任、未选插件不执行、配置不写回、未知 ID 拒绝、主子隔离、页面多选/模型提交/失败保留。真实 SDK 无付费模型调用检查：默认包含基础工具、4 个网页工具及 mcp/mcpScript，空选择仅基础工具，关闭均正常。Playwright 验证自定义成功创建及摘要，390px 手机宽度页面/弹窗无横向溢出。
- 涉及文件：src/{capabilities,pi,sessions,tasks,protocol,server}.js、public/{index.html,app.js,style.css}、tests/{capabilities,app}.test.js、package{,-lock}.json、README.md、devlog.md。

## 2026-09-09 — 新建会话继承最近主代理配置
- 在独立 worktree（feat/session-defaults）实现，解决新建会话总是恢复启动模型、需要重复选择的问题。
- Sessions 统一记忆最近成功变更的主模型与实际思考等级，所有新建入口（含切换工作空间时创建）沿用；已有会话不变，子代理覆盖仍按会话独立。
- 仅子代理变更、读取旧会话或配置失败不覆盖默认值；采用服务内存保存，不新增持久化文件，服务重启后恢复启动配置。
- 验证：npm test 7 项全部通过；补充新会话继承、已有会话隔离、失败和子代理变更不污染默认值的检查，git diff --check 通过。
- 涉及文件：src/sessions.js、tests/config.test.js、README.md、devlog.md。

## 2026-09-09 21:00 — 统一设置入口与子代理配置迁移
- 在独立 worktree（feat/agent-settings）实施；删除侧栏底部运行时标语，改为「设置」入口，采用常见的设置弹窗与分区布局，后续设置继续加入此处，不创建空白分类或插件框架。
- 将子代理配置从输入区迁入设置，复用主代理的供应商 → 模型下拉样式，保留默认跟随主代理、当前会话作用范围和自动保存；未增加独立思考配置，继续沿用既有继承规则。
- 使用原生 dialog 处理焦点与 Escape，避免关闭设置时误停任务；支持关闭按钮、遮罩关闭、失败反馈及回滚、忙碌/离线禁用。
- 验证：npm test 全部 7 项通过，补充供应商筛选、跟随恢复、失败回滚和入口迁移检查；真实浏览器验证桌面打开、关闭焦点与 Escape、390px 手机宽度无横向溢出，未调用付费模型。
- 涉及文件：public/{index.html,app.js,style.css}、tests/app.test.js、README.md、devlog.md。

## 2026-09-09 — 页面子 Agent 模型配置
- 在独立 worktree（feat/subagent-model）实现，复用模型目录与 session.configure，不新增依赖或配置服务。
- 输入框下新增原生折叠配置区：子 Agent 可选择独立模型或默认跟随主 Agent；按会话内存保存，快照恢复，忙碌/断线时禁用选择。
- 委派创建统一应用模型覆盖，保留工作目录和思考继承；配置只影响新子任务，未知模型在主 Agent 配置变更前拒绝。省略覆盖保留旧值，null 恢复继承。
- 验证：npm test 7 项通过，覆盖独立模型、恢复继承、未知模型拒绝、会话隔离、协议校验、页面选择提交及切换/重连恢复；未进行付费模型调用。依赖通过临时 node_modules junction 复用本机安装。
- 涉及文件：src/{sessions,protocol}.js、public/{app.js,index.html,style.css}、tests/{config,app}.test.js、README.md、devlog.md。

## 2026-09-09 — Axiom 独立服务

- 按用户要求在当前空间新建独立项目，不接入原主项目，不改其依赖、代码和文档。
- 实现 Node HTTP/WebSocket 服务、Pi SDK 适配、主会话、并行任务、delegate/read_result 两个工具。
- 使用原生 JS 模块与 Node 测试，省去构建环节；模块按传输、会话、任务、工具、Pi 适配分开。
- 无任务并发上限、超时、只读或结果截断；保留鉴权、输入校验、取消传播和慢连接保护。
- 会话与连接分离，重连使用快照；数据仅内存，重启不恢复。未配置系统服务、自启动或进程自动拉起。
- 验证：3 项自动测试通过；真实模型完成主 Agent -> delegate -> 两个子 Agent -> read_result -> 汇总；本地 HTTP 健康检查通过。
- 涉及文件：src/*.js、tests/*、package.json、package-lock.json、README.md、.gitignore。本机 .env.local、日志和 PID 文件不纳入版本管理。

## 2026-09-09 — Linear 网页入口

- 新增 public/ 输入页、模型/供应商/思考等级选择、流式输出。
- 修改 pi、sessions、protocol、server：提供模型目录、配置入口和子任务配置继承。
- 验证：自动测试、真实服务模型目录与思考配置、首页 HTTP 200、浏览器导航。
- 同步 README；未新增前端依赖。

## 2026-09-09 — 输入框下移

- 按用户要求将 public/index.html 的任务输入框移动到执行记录下方，保持原有交互；同步 README。
- 验证 HTML 元素顺序并重启服务加载页面。

## 2026-09-09 — 本机免令牌
- 按用户要求移除令牌配置、输入与认证；页面自动连接，仅保留本机 Host/Origin 检查。
- 更新 main/server、页面、README 和连接测试；4 项测试通过。

## 2026-09-09 — 输入快捷键与思考样式
- Enter 发送，Ctrl/Cmd+Enter 换行，保留 Shift+Enter 换行；中文输入法选词不触发发送。
- 思考正文改为斜体；涉及 public/app.js、index.html、style.css。

## 2026-09-09 — Markdown、会话、工作空间及输入栏
- 统一正文 Markdown 渲染，使用 marked 和 DOMPurify，测试格式与脚本清理；保留思考斜体。
- 增加会话列表、新建/切换/删除，工作空间目录选择，子任务继承目录。
- Esc 停止；模型/供应商/思考选择放到发送左侧。
- 涉及 public/*、src/{pi,sessions,server,protocol}.js、依赖与测试、README。
- 5 项测试通过，浏览器确认页面自动连接、模型和会话显示、Markdown 表格及按钮布局。

## 2026-09-09 — 输入工具栏单行
- 标签与选择框横排，发送区不换行；窄屏横向滚动，避免挤成两行。涉及 public/style.css。

## 2026-09-09 — 会话工作台布局
- 重写布局与样式为左侧会话导航、独立消息滚动、底部常驻输入区，保留 Linear token。
- 增加搜索、日期分组、活动排序、重命名，页面内草稿/滚动恢复，子任务折叠展示。
- 验证 5 项测试、浏览器输入区位置固定且无横向页面溢出。
- 本次未交付磁盘历史；确认 Pi 原生 SessionManager 可用于后续持久化，README 明确当前边界。

## 2026-09-09 — 用户消息去角色标签
- public/app.js 隐藏用户消息的“你”标题，保留消息正文及样式，覆盖新消息和历史恢复。

## 2026-09-09 — 模型选择工具栏协调
- 浏览器检查发现模型框被 flex 拉伸至 530px，取消强制填充，改为内容宽度、32px 等高控件。
- 统一深灰表面、细边框、箭头与思考标签；支持浏览器原生可样式化下拉面板，保留不支持时的原生回退。
- 涉及 public/style.css、public/app.js；浏览器验证四个控件同一水平线、等高，截图验证工具栏和模型菜单。

## 2026-09-09 — 代码复核与渲染性能
- 阅读 src/public/tests 全链路，删除全 live 重绘、思考触发正文重算、重复任务恢复、多订阅 Map 和重命名全快照复制。
- 新增 stream-renderer.js：仅 dirty 消息按帧更新、折叠思考延迟显示、展开后追加 Text 节点；切换清理待绘制。
- Markdown 保留未变块 DOM，完整 lexer 保证引用/列表等语义，保留 DOMPurify。
- 合并滚动、并发列表请求，修复旧会话发送回执清空新草稿与 Windows 路径显示/匹配；子任务模型直接初始化，非法思考配置回滚。
- 源码统一格式化，未增加运行依赖。新增 tests/stream-renderer.test.js、tests/benchmark.js，扩充 Markdown 回归。
- 验证 6 项测试、npm audit 0 vulnerabilities；真实浏览器模型输出标题/列表/代码块通过。浏览器微基准中位数 391ms -> 148ms；Node/JSDOM 同负载 2603ms -> 298ms，仅作渲染微基准。
- 仍保留内存会话；持久化、超长单块增量解析不在本次实现。

## 2026-09-09 — 质量、性能与页面体验优化
- 原 axiom/ 全部未跟踪：在功能 worktree（feat/axiom-quality）复制源码并提交现状基线，未复制凭据、node_modules、PID 或运行日志；保留原工作区及 4319 服务。
- 渲染：折叠子任务仅更新文本缓存，跳过帧调度和 Markdown 解析，展开补绘；覆盖流式、最终结果与快照。历史任务按首条消息放置，避免任务详情全部跑到用户请求之前。
- 传输：合并重复静态资源注册，启动时生成 ETag，no-cache 强制校验、命中返回 304；保持 CSP、DOMPurify、输入校验与本机连接限制。
- 交互：断线不隐藏消息，允许继续写草稿，重连前保存最新输入；注册握手失败关闭处理，避免无法重试。保留草稿高度和滚动、修复带空白的发送回执、避免列表刷新失败误删已发送消息，修复跨会话重命名回执，删除会话释放草稿。
- 页面：统一暗色层级、留白、输入区焦点和任务状态；手机侧栏覆盖显示，支持遮罩 / Esc 关闭及焦点返回，主区 inert 防误操作。窄屏仅模型选择区滚动，发送按钮固定可见；去除重复 CSS，补充搜索空态和本地 SVG 图标，不新增依赖。
- 验证：npm test 7 项全部通过（新增 JSDOM 页面链路回归，扩充折叠任务和 HTTP 缓存检查）；npm audit --omit=dev 为 0 漏洞；git diff --check 通过。真实服务连接及模型目录可用；浏览器用模拟协议验证 Markdown/长内容/折叠任务，320、390、700、768、1440px 无页面横向溢出且发送按钮可见，控制台 0 错误，无付费模型调用。
- 可复现性能：node tests/benchmark.js，3 个任务 × 60 更新，展开 60 帧 / 180 次解析（本机一次 562ms），折叠 0 帧 / 0 次解析（四舍五入 0ms）。原有块渲染微基准 4964ms -> 551ms 是既有优化对全量重绘的对比，不归因于本次改动、不代表端到端加速。
- 涉及文件：public/{app.js,index.html,style.css,stream-renderer.js,favicon.svg}、src/server.js、tests/{app.test.js,stream-renderer.test.js,server.test.js,benchmark.js}、README.md、devlog.md。仍不做磁盘持久化、自动重连或额外前端框架。
- 交付：基线 87d2816、优化 65916cb 已推送 origin/feat/axiom-quality。尝试按规范合并 master，被主工作区未跟踪的 axiom/ 同名文件阻止，Git 安全中止；不强制覆盖或自动移动原代码。等待用户确认备份策略后再合并、推送 master 和清理 worktree。
- 保留独立预览 http://127.0.0.1:4320/（该 worktree 内运行，PID 记录在被忽略的 .axiom.pid），未重启原 4319 服务。浏览器截图留在当时 worktree 旁的 artifacts 目录，不提交生成图片。

## 2026-09-10 项目 skill：codebase-map 多级索引与排障

- 内容：新增项目级 skill `.pi/skills/codebase-map/`（SKILL.md / INDEX.md / knowledge.md / scripts/reindex.mjs）。多级索引：L0 架构图与模块职责（SKILL.md）→ L1 文件总览 → L2 符号→行号跳转表 → L3 横切常量（协议 command.type、HTML id、HTTP 路由），INDEX.md 由脚本毫秒级重建，用前/改后各跑一次保证实时。bug 知识库 knowledge.md 从 devlog 历史提炼 5 条，修复后追加实现自成长。新增 tests/codebase-index.test.js 守住生成逻辑。
- 原因：需要快速定位项目结构与按层排障，且索引和知识随代码改动同步成长，不腐烂。
- 涉及文件：axiom/.pi/skills/codebase-map/{SKILL.md,INDEX.md,knowledge.md,scripts/reindex.mjs}、axiom/tests/codebase-index.test.js、axiom/README.md、axiom/devlog.md。
- 分支：feat/axiom-project-skill（独立功能 worktree）。

## 2026-09-10 会话左右留白调整

- 按需求将主会话消息区和输入区左右留白统一为可用宽度的 5%，移除 880px 最大宽度；手机断点同步调整，保留原有上下间距和安全区。子任务浮层不变。
- 涉及文件：`public/style.css`、`README.md`、`.pi/skills/codebase-map/INDEX.md`、`devlog.md`。采用纯 CSS，不新增依赖或配置。

## 2026-09-10 skill 例行更新：codebase-map 怀疑点清单对齐新架构

- 内容：核查 skill 与近期 4 个功能合并（持久化会话/消息队列/子代理浮层/运行详情）的同步情况——MODULE_INFO、架构图、knowledge.md（+3 条）均已被功能分支按规则维护，索引零漂移（仅时间戳差异）。唯一缺口：SKILL.md 查 bug 怀疑点清单缺新区域，补 3 条（队列回执≠执行状态、子代理浮层定位约束、~/.axiom 持久化排查入口）。
- 原因：新功能落地后 skill 的排障指引未覆盖新增故障面。
- 涉及文件：axiom/.pi/skills/codebase-map/SKILL.md、axiom/devlog.md。
- 分支：feat/axiom-skill-refresh（独立功能 worktree）。

### 2026-09-10 会话操作、队列命名与连接恢复
- 内容/原因：操作入口移到左侧每条会话，固定图标空间并截断长标题；补齐 session-action 暗色样式和危险按钮悬停；修正设置选择器宽度、箭头与复用样式；统一 Send/Steer/Follow-up、Idle/Running 并直接说明效果；WS 退避重连避免后台启动后必须刷新。
- 涉及：public/app.js、public/index.html、public/style.css、tests/app.test.js、README.md、导航索引及坑库。
- 验证：新增按钮发送两类队列、初次失败自动重连/防并发、非当前会话重命名及删除确认测试；现有发送链路和 SDK 已支持队列，浏览器模拟 WS 验证两按钮可用，尚未复现用户原先的不可用情况，不凭猜测修改后端。

### 2026-09-10 会话条目统一外框
- 内容/原因：按反馈将选中边框和背景移到整行，包住标题与两个操作图标；垃圾桶与铅笔统一中性色，仅确认删除保留危险红色。
- 涉及：public/style.css、README.md、devlog.md、导航索引和坑库；保持标题省略与图标固定宽度。

### 2026-09-10 重启确认弹窗 UI
- 原因：快速/重建重启仍调用浏览器 confirm，与页面样式不一致。
- 改动：public/index.html、public/app.js、public/style.css 增加共享暗色重启 dialog，复用已有表单/按钮样式，默认取消焦点、Esc 关闭，确认时校验连接状态并避免重复提交。
- 验证：tests/app.test.js 覆盖两种模式的打开、取消、关闭、确认、重复提交与服务拒绝恢复；同步 README.md 和代码索引。

### 2026-09-10 统一跨平台文件选择器
- 原因：Windows 专用系统目录选择框与上下文文件选择界面割裂、图标单一，无法跨平台复用。
- 决策：调研 VS Code Explorer、Seti、vanilla FileExplorer 和浏览器 File System Access API；采用原生 dialog + 现有 WS/Node 文件系统，不引入框架/图标依赖，不递归扫描或读取内容。
- 改动：public/file-picker.js、file-picker.css 共用导航、地址、搜索、分页、确认、分类 SVG 图标和手机布局；app.js 统一工作空间/文件/文件夹入口，保留 Skill 与图片上传各自语义；src/sessions.js、protocol.js、server.js 增加 files.browse 和跨平台系统打开，删除 PowerShell picker；工作空间内 realpath 限界，主机模式可浏览可访问目录，每页 200 项。
- 防回归：tests/file-picker.test.js、app.test.js、workspace-picker.test.js、session-flow.test.js、server.test.js；README.md、导航架构/索引和坑库同步。
- 验证：npm test 初次 55 项中 54 通过；同步 master 的安装器/图片占位改动后复验 58 项中 57 通过、1 个非 Windows 平台测试跳过、0 失败；Windows Chromium 真浏览器 1280×900 / 320×640 检查文件浏览、图标、Esc 和弹窗无横向溢出，控制台无脚本/CSP 错误。macOS/Linux 桌面及 UNC 网络共享未实机验证。


### 2026-09-11 消息活动状态与工具详情
- 原因：中间工具/纯思考消息显示为空 AXIOM 卡片，用户无法判断进度与文件改动。
- 内容：连接/思考/工具动态状态，终态静态标识；连续纯思考显示合并但保留原消息 ID；工具默认紧凑并可展开参数、文本输出和实际/请求 diff。历史、子代理、取消、断线、重试、压缩边界同步处理。详情按需纯文本渲染，单节显示上限 60000 字符，保留完整持久化记录；write 不虚构新建/覆盖判断。
- 文件：public/app.js、public/style.css、tests/message-activity.test.js、README.md、索引与 knowledge.md。
- 验证：页面回归与新增活动测试通过；全量 npm test 在提交前运行。
- 追加决定：diff 支持统一/左右切换并记住手动选择；无已存偏好时窄屏默认统一、宽屏默认左右，窄屏展示强制统一。新增回归覆盖左右旧新配对与偏好保存。

## 2026-09-10 — 隐藏内部任务通知
- public/app.js 共享消息渲染入口隐藏内部任务完成通知，实时与历史共用，不改变模型上下文或后台投递。tests/app.test.js 覆盖字符串和内容块格式；同步 README 与索引。

## 2026-09-10 图片按占位位置送入模型
- 核实 Pi 0.85.1 TUI 粘贴：图片存临时文件，光标处插路径，正文原样提交，并非自动内联附件。
- 删除 public/app.js 每条追加的编号说明；src/inline-images.js 经 capabilities.js 内置 context 扩展按标记首次位置插图，仅转换模型副本，保留队列/存储及重复、漏标兜底。
- 更新 README、导航索引、knowledge；tests/inline-images.test.js 覆盖顺序与边界，app/capabilities 测试同步。
- 验证：npm test 86 通过 / 0 失败 / 1 原有跳过；真实 SDK 扩展加载测试验证 context 注册，Codex Responses 转换器实测请求块顺序 text → image → text（不调用远端模型）。

## 2026-09-11 00:10 活动动画统一、暗色提示与文字对比度

- 原因：用户反馈各处「进行中」图标样式不一、图标整体偏大，且原生 title 提示与暗色 UI 割裂、正文文字对比度不可调。
- 改动：
  - public/style.css：所有进行中状态（连接/思考/准备与执行工具，子代理卡片、浮层标题、输入区摘要）统一为 12px 细环——conic 渐变细边、无光晕、1.6s 一圈，颜色随所在组件语义色；思考文字后的 `...` 动态点固定 3ch 宽、1.2s steps 循环，不跳动布局；reduce 媒体查询补齐 `.task-run-spin`、`.thinking-dots`。活动图标底座 24→20px、SVG 16→14px、工具行网格列同步 20px，手机 44px 点击区保留。
  - public/tooltip.js + tooltip.css（新增）：事件委托接管全站原生 title，统一暗色浮层；悬停 0.5s/键盘聚焦显示，Esc/滚动/按下/移开关闭并恢复 title 与 aria 关联，触摸不干预，Popover API 优先，CSP 不放宽、无 inline style。
  - public/text-contrast.js + text-contrast.css（新增）：右上角「A」按钮 + 原生 popover，100–150% 按 10% 一档，仅提亮正文文字 token（--body-ink/--muted，钉回非文字用途），档位存 localStorage、默认 100% 不落盘，非法输入钳位。
  - public/app.js 接线两个模块并生成思考动态点；index.html 引入两份 CSS；src/server.js assets 表注册 4 个新静态文件。
  - 系统动画关闭/RDP 使 prefers-reduced-motion 匹配、动画全部冻结：用户开启系统设置后确认恢复，保留无障碍媒体查询，不新增应用内开关。
- 注意：新增静态文件必须注册 server.js assets 并快速重启服务，普通刷新拿不到新资源。
- 最终验证：npm test 111 项——110 通过、1 原有跳过、0 失败；conversation-ui.py 在 1440/390/320px 全通过、browserErrors=[]，覆盖对比度持久化/重置、提示、图标尺寸、1.6s 旋转、动态点固定宽与 reduce 冻结。修复 tooltip 外部 CSSOM 定位、popover 断链及跨间隙悬停问题；修复 localStorage getter 抛错防护并增加回归。
- 涉及文件：public/{app.js,index.html,style.css,tooltip.js,tooltip.css,text-contrast.js,text-contrast.css}、src/server.js、tests/{message-activity.test.js,conversation-ui.py,tooltip.test.js,text-contrast.test.js}、README.md、.pi/skills/codebase-map/{INDEX.md,knowledge.md,SKILL.md} 与本日志。

## 2026-09-11 01:30 导入 pi JSONL 会话

- 原因：Axiom 只能管理自己创建的会话，用户在 pi TUI / 其它入口积累的 `.jsonl` 历史无法过来继续对话。
- 内容：
  - 侧栏「导入 pi 会话…」复用共享文件选择器，默认从 pi 会话目录（`service.status` 新增 `importDir`）开始浏览；协议新增 `session.import({path})`，返回与 `session.create` 相同的快照，前端走原有 `switchSession` 链路。
  - `Sessions.importSession(file)` 校验首行 `session` 头与 `cwd`，工作空间取 `cwd`（目录不存在时退回本实例工作空间）；标题按「pi 会话名 → 首条用户正文（剥掉注入的 Skill 正文与标签）→ 文件名」取。
  - 导入是复制：JSONL 写入 `~/.axiom/workspaces/<sha256(cwd)>/<id>.jsonl`，与网页快照并存；`create()` 里代理创建失败会删除副本。`historyEntries()` 重建网页历史（带 entryId，压缩折叠关系保持）。删除 Axiom 会话只删副本，原 pi 文件不动。
  - 能力与模型沿用「默认新会话设置」，不读取原会话在 pi 里的供应商/模型选择。
- 文件：src/{protocol.js,sessions.js,server.js,main.js}、public/{index.html,app.js}、tests/{session-flow.test.js,app.test.js,service-api.test.js}、README.md、导航索引、knowledge.md 与本日志。
- 验证：npm test 114 项——113 通过、1 原有跳过、0 失败；新增用例覆盖复制文件、标题、历史 entryId、删除不触碰原文件、非法文件报错，以及页面导入按钮到工作空间切换。

## 2026-09-11 三按 Esc 收回已发出的输入
- 需求：发送后模型还没回复时，三次 Esc 把这条输入（含图片）收回输入框，避免重打；用户特别关心是否会打断供应商前缀缓存。
- 实现：只做后缀回退。SDK 公开接口 `AgentSession.navigateTree(用户消息 id)` 把叶子移回该条之前并重建内存消息，再补一条不参与上下文的自定义条目（`axiom_recall`）让分支落盘；历史前缀逐字节不变，之前的前缀缓存继续命中，重发同文本还能命中热缓存，代价只是被打断那一轮的缓存写入（编辑消息本来也要丢）。刻意不写「已撤回」占位、不摘要、不碰系统提示词与工具集。
- 门槛（不额外存标志、重启后仍成立）：这条之后出现回答、工具调用或工具结果就拒绝，只停止并保留原消息；被中断/失败的半截回答可以随输入一起丢弃（否则三按 Esc 在最常见场景下永远失败）。工具调用一律拒绝，避免回退后出现孤立 toolResult 与已发生的副作用。
- 手势：沿用原 300ms 计时结构。第一次按下开计时器；第二次按下取消计时器、记 300ms 窗口并保留原「停止」点击；窗口内的第三次按下才把 `recall: true` 带进那次队列撤回。单按、双按语义完全不变。
- 接线：protocol 的 `queue.withdraw` 增加可选 `recall`；`Sessions.withdraw(id, recall)` 先停稳再 recall、最后才清队列（被拒绝时队列原样保留，不吞消息），并按 `entryId` 截断网页历史；客户端撤回后重新 attach 重绘消息区（先 `saveView()` 保住草稿与附件），图片编号按草稿附件数重新对齐。
- 验证：npm test 121 项全绿（新增 tests/recall.test.js：无输出可撤回、流式中先停、有回答/工具调用/工具结果拒绝、无用户消息与取消导航返回 null、Sessions 截断历史与被拒绝时不吞队列）；tests/app.test.js 补真实按键序列，确认双按不撤回、三按带 `recall` 并重绘。另用真实 SDK 跑 SessionManager 脚本验证「分支 + 自定义标记」重启后仍生效（含被中断的半截回答不复活）。
- 文件：src/{pi.js,sessions.js,server.js,protocol.js}、public/app.js、tests/{recall.test.js,app.test.js}、README.md、devlog.md、codebase-map 索引与 knowledge.md。

## 2026-09-12 会话操作浮动菜单
- 根据截图反馈，将列表内展开操作改为三点右侧原生 Popover，窄屏向内避让；触发三点保持高亮，菜单使用现有 Linear raised/line/ink 与 8px 圆角，不挤动下方会话标题。
- 文件：public/app.js、public/style.css、tests/session-sidebar-ui.py、README.md、devlog.md、codebase-map 索引及知识库。
- 验证：Chromium 1440px/320px 检查位置、后续标题坐标不变、键盘/Esc/外部关闭通过；npm test 140 通过、3 项原有消息渲染失败、1 跳过。

## 2026-09-12 侧栏合并上线
- 按用户明确要求，将 feat/session-sidebar 合并到最新 origin/master（基线 2e47423），在独立集成 worktree 处理知识库追加冲突并重建生成索引，保留两边功能。
- 验证：侧栏相关 9 项测试全部通过；全量测试有 3 项消息/思考渲染失败，在未修改的最新 master 同样复现。记录既有失败后按用户要求合并推送，不声称全绿；主仓库未提交文件不动。

## 2026-09-12 会话侧栏整理与页签工作空间隔离
- 内容：每页签只展示当前工作空间；跨目录打开、预设启动和导入统一另开页签并提供被拦截时的链接，保留原草稿。固定「执行中 → 待继续 → 已完成」，按创建时间倒序逐日分隔，移除拖动和分组折叠；运行中优先展示，标题前使用 Linear success #27a644 绿色圆点。
- 决策：复用原完成标记 localStorage 与跨页锁，不新增依赖；会话操作收进原生 details，支持键盘、Esc、外部点击和手机触控。创建时间独立持久化，旧历史以 updatedAt 兼容，不能还原过去未保存的创建时间。
- 验证：创建时间与页签回归通过，Chromium 1440px/320px 验证分组、日期、绿点、操作展开/收起与边界；全量测试的思考展开和 collapsed-thinking 两处失败在干净基线 159d62a 同样复现，未冒充全绿。预览使用 PREVIEW_PORT=4397，未重启正式服务。
- 文件：public/{app.js,index.html,style.css}、src/sessions.js、tests/{app.test.js,workspace-tabs.test.js,session-created-at.test.js,session-sidebar-ui.py,conversation-preview.mjs}、README.md、devlog.md、codebase-map 索引/生成脚本/knowledge.md。

### 2026-09-12 首装网页引导与统一卸载

- 内容：空模型保持连接并复用模型设置；保留历史引用/草稿，配置后手动新建。新增 axiom uninstall 核对全局目录、安全停止、取消自启后仅卸载 Axiom。
- 原因：避免首装会话失败重连；HTTP 未启动时通过本地守护通道停止崩溃重试，不强杀活跃 worker。
- 涉及：public/app.js、scripts/service.mjs、scripts/uninstall.mjs、tests/model-onboarding-ui.test.js、tests/service.test.js、tests/uninstall.test.js、README.md、代码索引及坑库。
- 决策：保留 ~/.axiom 与 ~/.pi；旧守护进程须完整重启后才有兜底通道。

## 2026-09-12 重试卡内容边界与历史顺序修复
- 内容/原因：删除整条失败助手消息搬入重试卡的逻辑，正文、思考和工具留在消息流，消除旧失败消息跨轮误收。重试首次记录 messageCount，快照按相同边界恢复；旧记录没有位置保留末尾回退，不伪造顺序。
- 终态移除当前等待字段，成功清除当前错误；加载旧记录也规范化，history 保留每次失败原因。
- 验证：功能分支 npm test 184 通过、1 跳过；合并远端最新 master 后 192 通过、1 跳过。新增实时/快照顺序、内容隔离、旧记录回退、位置持久化及终态字段断言。未重启正式服务。
- 文件：public/app.js、src/sessions.js、tests/message-activity.test.js、tests/session-flow.test.js、README.md、devlog.md、codebase-map INDEX.md/knowledge.md。

## 2026-09-12 会话菜单支持复制 JSONL 源文件路径
- 内容：会话操作菜单在「新页签打开」与「重命名」之间新增「复制 JSONL 路径」，把会话 `.jsonl` 源文件的绝对路径写入剪贴板，便于在其他位置（如另一实例的「导入 pi 会话」）直接粘贴导入。
- 实现：服务端 `Sessions.list()` 返回 `sessionFile`（取 `agent.sessionFile()`，未落盘为 null）；前端 `copySessionFile()` 走 `navigator.clipboard`，按钮悬停反馈「已复制」，无文件或复制失败走错误条。复制是纯前端操作，断连时保持可用。导入的会话返回的是存储目录里的副本路径（导入即复制，原文件不动）。
- 验证：npm test 183 通过、1 跳过；tests/app.test.js 更新菜单子项断言并新增复制路径断言（`C:\axiom\b.jsonl`）。
- 文件：src/sessions.js、public/app.js、tests/app.test.js、README.md、devlog.md。
- 内容/原因：自动重试节奏改为 2、2、5、5、10、10、30、60、120、240、480 秒，之后翻倍、16 分钟封顶，最多 45 次（全部耗尽纯等待约 9.3 小时）；原为翻倍不封顶、最多 30 次。涉及 src/retry.js（新增 MAX_DELAY_MS 上限）、tests/retry.test.js、README.md。时间：2025-06。文件：src/retry.js、tests/retry.test.js、README.md、devlog.md。
- 内容/原因：重试支持自定义错误词表（会话配置 selection.retry）：白名单命中强制重试、黑名单命中不重试（黑名单>白名单>内建判定），字符串子串匹配、大小写不敏感；设置页新增芯片式编辑器（回车添加/× 删除/去重），子代理经会话配置继承；仅新建会话生效。涉及 src/protocol.js（retryPatterns schema）、src/retry.js（classify 词表）、src/pi.js、src/sessions.js（defaultSelection/item/子代理透传）、public/app.js、public/index.html、public/style.css。时间：2025-06。文件：上述 + tests/retry.test.js、tests/config.test.js、README.md、devlog.md。

### 2026-09-12 修复卸载 CLI 循环等待
- 症状：axiom uninstall 报 unsettled top-level await，未执行卸载。
- 根因：service 顶层等待动态导入 uninstall，uninstall 又静态导入尚未完成求值的 service。
- 修复：显式传入 run/stop/npm，删除反向导入；涉及 scripts/service.mjs、scripts/uninstall.mjs、tests/uninstall.test.js、README.md 及索引。
- 验证：新增真实 CLI 子进程测试，以不存在的 npm 隔离实际安装和用户数据。

### 2026-09-12 增加 axiom help
- 内容/原因：提供命令行用法、停止及卸载的数据保留说明，支持 help/--help/-h；帮助不加载本地环境或启动服务，无效参数非零退出。
- 涉及：scripts/service.mjs、tests/cli-help.test.js、README.md、代码索引。
- 验证：真实 CLI 子进程检查三个帮助入口及错误参数。

### 2026-09-12 服务维护层按最终 HTTP 契约重写（服务设置重构）
- 内容/原因：维护通道对齐 scripts/maint-server.mjs 实际实现——GET /status 扁平记录（operation/status 枚举/phase/phases/startedAt/error/log），POST /recover 严格 body（仅 {"mode":"quick"|"rebuild"}，要求 application/json，多余键 400）；凭证仅缓存 loopback http（^http://127.0.0.1:\d+$）+ 非空 token 于 sessionStorage；fetch 5s 超时即 abort（AbortController + finally clearTimeout），轮询防重叠（在飞跳过）；在线与断线都轮询（重启准备阶段可观测），每次以权威 state 更新重启锁（准备阶段失败 worker 在线时靠轮询解锁，提交后守护记账前 5s 宽限防提前解锁）；service.status 暂不带 operation：apply 无字段时保留 lastState 不抹历史；阶段名本地化（未知原样）；恢复改为面板「尝试恢复服务」按钮手动触发（#service-recover，index.html 新增），前端不自动再起，自动重试/限流归守护；真实 HTTP 集成测试（真实 maint-state + maint-server + 真实 fetch）验证 404/400/409/202、扁平字段、日志脱敏、前端端到端渲染。
- 涉及：public/service-settings.js（重写）、public/index.html（+恢复按钮）、README.md、devlog.md、tests/service-settings.test.js（重写：8 项含真实 HTTP 契约实测）。
- 验证：node --test tests/service-settings.test.js tests/app.test.js 11/11 通过、自然退出；全量除后端进行中的 service.test.js 外 207 passed 1 skipped；索引失败仅后端 3 个未登记文件（maintenance-contract.md、service-settings-api.test.js、service-settings-ui.py），待统一重建。

### 2026-09-12 — 4320 原地依赖修复与独立重载
- npm ci 遇到运行中原生模块的 Windows 文件锁（EPERM），改用 npm install 补齐依赖；SDK 导入和 service-settings-api 测试通过。还原 npm 自动补写的锁文件元数据，不变更依赖版本。
- 不再等待当前代理自身空闲：临时独立进程限时重试 4320 安全停止入口，当前回复结束后接手启动 scripts/dev.mjs 并记录健康检查；不强杀、不操作 4319。重载结果写入系统临时目录 axiom-reload-4320.log。
### 2026-09-12 会话运行绿点包含子代理
- 原因：主代理空闲后，列表仅返回主代理状态，仍执行中的子代理被漏算，绿点提前熄灭。
- 修改：src/sessions.js 在列表聚合 starting/running 子任务；不改变主代理输入、排队与通知状态机，不改现有绿色样式。README.md 同步语义。
- 验证：tests/task-notifications.test.js 覆盖子代理启动、主轮提前结束、部分完成、主代理处理通知、全部完成及取消。同步代码索引与坑库。
- 验证结果：npm test 209 项，208 通过、1 跳过、0 失败；git diff --check 通过。复用可见页面每 5 秒的后台列表刷新，不增加订阅或改变视觉 token。

### 2026-09-12 中文标点旁的加粗标记不渲染
- 原因：CommonMark 侧翼规则在 `**` 紧贴中文标点+紧邻文字时拒绝开/闭，正文星号原样显示（用户截图场景）；思考区不加粗为既定设计，不改。
- 修改：public/markdown.js 增加 fixCjkBold 预处理（仅围栏外，成对 `**` 首尾标点移出，渲染文本不变）；tests/markdown.test.js 补 4 条断言。README 无需改（318 行描述的「强调」行为本就应含中文）。
- 验证：npm test 三轮 225 项（224 通过、1 跳过、0 失败）；真实渲染探针覆盖截图原文/冒号/引号/正常加粗。有一轮曾出现 expected 2 的抖动断言，随后同代码连续三轮全绿，按既有基线抖动记录，不归因本次改动。

### 2026-09-12 — 恢复后端工作：models.provider.discover 只读拉取 + Ollama 冒号收藏修复（Axiom-model-settings-recovery）
- 背景：旧 worktree F:/worktrees/Axiom-model-settings 被清空，未提交工作不可恢复；本条记录在 F:/worktrees/Axiom-model-settings-recovery（分支 feat/model-settings-recovery，基线 cb7686f）重建全部改动，未 git 提交（交主代理验收合并）。
- 冒号修复恢复：src/model-config.js validFavoriteKey 删除 model key 禁冒号行，model 组整体作 modelKey（colon=-1），thinking 组仍按最后冒号切分等级；docs 收藏章节改为「允许模型 ID 中的冒号，如 ollama/llama3.1:8b」；tests/model-config.test.js 冒号拒绝断言改为正向回归（收藏/持久化/无 thinking 误匹配）。
- discover 新增（只读）：protocol.js 加 z.literal("models.provider.discover")+providerId strict schema；model-config.js 深加载 SDK resolve-config-value.js（$VAR/$ {VAR}/$$/$! 真实插值，!command 拒不执行），DISCOVER_APIS 四 api 类型（openai-completions/responses、anthropic-messages、google-generative-ai，官方接口已核实），redirect:"error" 防 Key 外泄、15s 超时、响应体 5MiB 上限、>500 条截断，错误全部固定中文文案+HTTP 状态码不含请求头/密钥/上游响应体；不写盘、不触发 refreshModels、不广播、无 baseFingerprint。
- 限制内未改 src/server.js，主代理需补：case 组（src/server.js ~295 行）加 case "models.provider.discover" 走 service.models.handle；广播分支（~305 行）排除 discover（只读不得触发 models.config.changed）。
- 验证：worktree 本地 npm ci（旧 node_modules 是指向主仓库残缺 SDK 的 junction，pi-coding-agent dist 整体缺失，共享路径全部 ERR_MODULE_NOT_FOUND）；tests/model-config.test.js 18/18（含 7 个 discover 套件）、tests/model-thinking-favorites.test.js 1/1（Ollama 冒号键回归）、全量 tests/*.test.js 270 项 0 失败（model-manager XSS 断言曾单次抖动，复跑稳定全绿）。mock 保真度修正：redirect 拒绝场景改为 mock 抛 TypeError 模拟 undici 真实行为（原 mock 返 302 响应对象绕过了 redirect:"error" 逻辑）。

## 2026-09-12 12:20 — 模型管理验收收尾
- README 同步分栏设计来源、只读拉取并勾选添加、思考收藏键与浏览器回归命令；reindex 登记新增测试。
- tests/model-selection-preview.mjs 使用隔离供应商与 mock discoverFetch，并去除配置中的运行时回调，修复 structuredClone 导致预览无法连接。
- 新增 tests/model-settings-ui.py：思考收藏刷新持久且不切换、拉取后仅保存勾选项、1440/390/320 布局；两份浏览器回归通过。全量 npm test：274 通过、1 跳过、0 失败。

## 2026-09-12 SQLite 统一配置与管理
- 原因：摘要 JSON 替换在 Windows 报 EPERM；用户要求跨平台配置页与 SQLite 权威存储，API Key 明文保存。
- 内容：新增 database/pi-model-storage，迁移 sessions/model-config/remote/maint-state 的管理数据；main/pi/server 接线，摘要设置页、模型页文案与协议同步。保留 Pi JSONL，迁移按文件幂等、缺失历史不覆盖；Node 支持范围升为22.13+（22.x）或24+。
- 验证：数据库、迁移、凭据真实 SDK、配置 UI、守护测试均有回归；全量最后一项守护时序测试首次失败、单独重跑15/15通过，最终全量复跑275项：274通过、0失败、1跳过。

## 2026-09-12 记忆与任务按变更增量落盘（事件级 save 契约）
- 原因：每个摘要/触发器/进度事件都触发全会话 persist（整行序列化重写），写入放大且随任务数增长；主审接线单任务/单变更保存需要精确的变更描述。
- 修改：src/session-memory.js 的 memoryHooks(item, save, job) 保持同步时序，save 改为 save(change) 描述变更：{summary:record}、{event:{type:"summary_trigger",record}}、{turn:{agentId,turn}}、{title:true}、{progress:{taskId,record}}、{delivery:record,delivered:[{taskId,progressId}]}；一次 onReply 多变更合并同一 change，无变更不调用 save；失败回复只结算 trigger；交付记录赋稳定 id、保留 50 条审计。src/tasks.js 新增 createdAt/updatedAt（publish 刷新 updatedAt），snapshot() 复用 snapshotJob(job)；publish 广播 {type:"task.state",taskId,data:安全view含runtime,saved:完整单条快照}，saved 含 parentContext/resultId/notified/progress/runtime，广播前由主审剥离；runtime 事件仍只更新内存不逐 token 写。tests/session-memory.test.js 修复 Sessions 测试库隔离（storagePath 用 root/storage，库落各测试独占 Temp root，不再共享公共 Temp axiom.db），新增变更契约断言；tests/tasks.test.js 新增 data/saved 分离断言。
- 验证：node --test session-memory+tasks 12 项通过；session-flow/task-notifications/message-activity/session-persistence/session-created-at 25 项通过；app.test 3 项通过。

## 2026-09-12 模型存储修复：部分成功回执、导入自愈、临时文件加固
- 原因：审查确认三处缺陷——writeConfig 先库后派生后刷新产生部分成功但向上抛错（UI 误判保存失败而权威已变）；旧配置导入坏文件即打迁移标记，用户修复原文件后永远无法重导；compat 原子写临时文件名可碰撞且 writeFile 失败路径泄漏临时文件、rename 无瞬时占用重试。
- 内容（src/pi-model-storage.js + src/model-config.js + 两个对应测试）：
  - writeConfig 拆为两阶段：仅权威落库；派生兼容文件由调用方经 syncCompatFile 显式重建。saveProvider/saveModel/deleteProvider/deleteModel 落库成功后派生/刷新失败时不再抛错，返回 `{fingerprint, applied:false, applyError(脱敏截断)}` 并记挂起状态；库写入失败照常抛。models.config.get 读取路径顺带重试挂起应用（GET 幂等、不重放 mutation），响应新增可选 `applyError`（有 = 已保存未应用，无 = 已应用），重试成功即清除；无挂起时 GET 不额外刷新。同一 fingerprint 重试保存仍可重新派生应用（乐观锁照常通过，apply 幂等）。不新增协议类型，server/ui 由主审接线。
  - 导入门闩改为仅成功后打标记：读失败/坏 JSON/结构拒绝只记去重告警（同源同消息只记一条）且不打标记，修复原文件后下次 init 自动重导；导入干净时清除该来源陈旧告警。混合坏 auth：好条目入库、坏条目告警、权威已有 providerId 一律不覆盖（UI 新值优先），修复后补导入。凭据 modify 本进程串行语义保持，不加跨 await SQL 事务、不做多 worker。
  - compat 临时文件改 randomUUID 唯一名，write/rename 任一步失败完整清理；rename 瞬时占用（EPERM/EBUSY）有限退避重试 2 次，绝不先删目标；校验临时文件同样 randomUUID 并把 writeFile 移入 try/finally。
- 验证：npm test 全量 288 项 287 通过 0 失败 1 跳过（此前 service.test.js 偶发失败为基线时序抖动，stash 对比确认与本分支无关）；新增 7 条故障注入测试（compat 失败回执+同指纹重派生、refresh 失败回执、GET 自愈、修复坏源再 init、混合 auth 不覆盖新值、告警去重、rename 失败清理临时文件）。测试全部使用独立临时目录，未触碰真实配置。
- 涉及文件：src/model-config.js、src/pi-model-storage.js、tests/model-config.test.js、tests/pi-model-storage.test.js、README.md。

## 2026-09-12 SessionStore 四表实体存储（feat/sqlite-storage）
- 原因：单会话整 JSON 每次保存全量重写，通知/进度高频更新代价大，且无法按实体增量查询。
- 内容：新增 src/session-store.js——sessions/summaries/session_events/tasks 四表 + store 配置表保留；事件身份 (session_id,type,agent_id,key) 部分唯一索引；tasks 元数据列（memory_turn/notified/progress_delivered/progress）权威、record 存任务内容，仅元数据变化只 UPDATE 列不读不写大 record；无 id 摘要 `anon-<sha256前20>` 稳定 id；change(work) SAVEPOINT 供多实体原子变更；importLegacySession/migrateLegacy 单事务迁移（坏行告警保留源、精确标记、幂等不覆盖新表）。src/database.js：busy_timeout 先于 journal_mode、外键 ON、暴露 prepare/exec、list() 坏行逐行隔离且告警只报键位不带内容。
- 验证：node --test tests/database.test.js tests/session-store.test.js 18/18 通过；全量 268 项中 9 个失败经基线（stash 后重跑）确认为既有环境性失败，与本次无关。
- 涉及：src/database.js、src/session-store.js、tests/database.test.js、tests/session-store.test.js。集成（sessions.js 接线、README）由主审后续处理。

## 2026-09-12 迁移安全收口：脱敏补漏 + 首次导入前 VACUUM INTO 备份
- 原因：主审确认两处硬阻塞——database.js get() 裸 JSON.parse（Node 21+ SyntaxError 携带原文片段）与 list() 告警拼接 error.message 均可泄露存储原文；importLegacySession 原注释把库级备份推给调用方，但集成层没有 VACUUM 入口。
- 内容：get() 解析失败抛脱敏错误（只报 namespace/key）；list() 告警去 error.message 只报键位；Database 暴露只读 path；importLegacySession 在每次真正导入前（已标记跳过/新表同 id 跳过不触发）自动 VACUUM INTO 到 <主库>.pre-store-migration.db，快照已存在则保留首次快照不覆盖，备份失败即抛错中止迁移。
- 验证：node --test tests/database.test.js tests/session-store.test.js 22/22 通过（新增 get 脱敏断言、备份生成/快照可读/不覆盖/跳过路径不备份等用例）。
- 涉及：src/database.js、src/session-store.js、tests/database.test.js、tests/session-store.test.js。

## 2026-09-13 05:20 UTC SQLite 集成：增量写、懒加载与安全收口
- 内容：集成 A/B/C/D 提交，sessions 接 SessionStore 增量描述，失败增量保留重试、SAVEPOINT 全有全无；新建落库/历史装配失败释放 SDK 与导入副本。启动仅取元数据，首次打开去重恢复，未加载改名和关闭重试失败队列；server attach 序号防迟到订阅，加载中停止拒绝。默认配置与预设迁移独立，恢复历史 ID 用 Map 与单向游标。任务终态只存一次，通知前重检主轮状态，通知确认只改单任务列。
- 模型：页面保留已保存未应用状态和新指纹，重读即可重试应用，不重放 mutation；错误只暴露固定提示及已知 errno，不把截断当脱敏。迁移坏 JSON 日志同样不携带解析原文。
- 迁移：A 采用嵌套 SAVEPOINT 后撤回事务回归转绿；主审追加唯一临时备份+成功更名，失败残片清理，避免下次 exists 误判成功；SQL 排除已迁移旧源，只取待迁移键再单条解析，避免重启读全部大 JSON。不做双写、反向迁移或回滚框架，保留旧源与一致性备份。
- 权限复现：WSL Ubuntu 22.04 / Node 22.23.1 / Linux 临时目录中，原实现主库600、WAL/SHM644；根因 chmod 在 WAL 建表后。现打开连接前创建/收紧主库与已有 sidecar（不改共享目录），新 sidecar 继承600；POSIX 权限失败显式拒绝。Windows Node24 临时目录 icacls 实测为继承ACL（含本机用户、系统、管理员及额外继承SID），不宣称 chmod 能隔离 ACL，不触碰用户目录权限。
- 验证：权限改动前全量321项：320通过、0失败、1原有跳过；存储/迁移/持久化38/38。权限改动后 Linux 数据库+存储25/25（包括新旧 sidecar600、备份失败再试、重复迁移不读源）；Windows同组24通过、1平台跳过。全量最终复跑与独立复核/性能报告继续收口。
- 涉及：src/{sessions,server,session-store,database,model-config}.js、public/model-manager.js、tests/{capabilities,compaction-config,model-config,model-manager,recall,service-api,session-flow,session-memory,session-migration,session-persistence,task-notifications,database,session-store,service}.test.js、README.md、docs/sqlite-refactor-plan.md、codebase-map三层索引/知识。
- 全量复跑曾复现既有 `rebuild cancels swap` 时序失败（workers 1≠2）：service.mjs 先 state.fail 落盘才 fork 恢复进程，测试误把 status failed 当恢复完成。tests/service.test.js 复用 until 等真实 ready 且 workers=2，再保留原严格断言；不加固定 sleep、不降低判定、不改守护产品逻辑。定向复跑另外暴露测试桩直接覆写 maint-env 被读到半截 JSON，改为完整临时文件后 rename；随后全量322项：320通过、0失败、2跳过（原有平台用例及Windows跳过POSIX权限测试，后者已在Linux实跑）。

## 2026-09-12 22:40 — 模型设置合并最新 master
- 原因：用户要求合并并推送；master 已迁移 SQLite，保留新存储实现并适配 discover 只读加载、收藏断言及隔离预览，保留分栏与勾选导入。涉及 src/model-config.js、public/model-manager.js、模型测试与预览、README、协议、索引；合并双方 devlog/knowledge 记录。
- 验证：两份 Playwright 回归通过；全量最终 299 通过、1 跳过、0 失败。此前守护测试出现恢复时序断言与 Windows EBUSY（单独15/15通过），未为此次合并改动守护逻辑。

## 2026-09-13 08:35 — 设置面板 API 协议下拉改为应用既有下拉外观
- 原因：用户反馈「API 协议」仍是全宽原生 select，原生箭头+浅蓝高亮的弹层样式与面板整体割裂，要求对齐应用内既有的紧凑下拉（截图：composer 底部 commandcode / DeepSeek V4.1 Flash / max 三个控件）。
- 内容：`public/model-manager.js` 新增 `selectControl()`，把「API 协议」「API 协议覆盖」两个 select 包进 `span.selectors.mm-select > label`，直接复用 `style.css` 里 `.selectors select`（深色 raised 底、6px 圆角、32px 高、右内边距 28px）与 `.selectors label:has(select):after` 的 CSS 小箭头；删除 `model-manager.css` 里会被同权重覆盖、且会把 28px 右内边距压掉的 `.mm-field select` 旧规则，改为两行局部微调（`.mm-select { flex:none; padding:0 }`、`.mm-select select { max-width:100% }`）。
- 验证：Playwright 截图 900/420/360px 与参考图一致（紧凑圆角下拉 + 小箭头）、无横向溢出；`node --test tests/model-manager.test.js` 24/24；全量 `npm test` 296 项 293 过 1 跳过，2 项失败集中在 `tests/workspace-tabs.test.js`（并发负载抖动，单独跑 8/8 全绿）。
- 涉及：public/model-manager.js、public/model-manager.css、devlog.md、.pi/skills/codebase-map/index。

## 2026-09-13 08:55 — API Key「显示」复选框改为小眼睛图标，并澄清密钥不回显
- 原因：用户指出「已配置（掩码值）——留空保留 / 输入新值替换」+「☐ 显示」的写法有误导——勾选后并不会显示已存密钥（后端 GET 只回传 `{masked,kind}`，前端永远拿不到明文），看起来像坏掉的开关。
- 内容：`public/model-manager.js` 里把 `显示` 复选框换成输入框内右侧的小眼睛图标按钮（`ICONS.eye` / `ICONS.eyeOff` 两条路径，点击切换 `type` 与 `aria-pressed`，同时更新 `title`/`aria-label`）；文案改成「已配置（掩码值）——留空保留」+ hint「密钥不回显（只能看到「已配置」）。留空 = 保留，输入 = 替换，勾「清除已存」= 删除；小眼睛只看本次输入」。`public/model-manager.css` 把输入框与小眼睛包进 `.mm-key-input` 定位容器（`.mm-key .mm-key-input input` 加 34px 右内边距，按钮绝对定位右 5px 居中，`aria-pressed=true` 时高亮），「清除已存」复选框仍在字段行内、不被覆盖。
- 验证：Playwright 实测（900/420px）点击后 `type` 变 `text`、`aria-pressed=true`、图标换成斜杠眼、无横向溢出，截图确认小眼睛叠在输入框右端；`tests/model-manager.test.js` 24/24（新增小眼睛切换 + 回显后输入框仍为空的断言）；全量 `npm test` 305 项 304 过 1 跳过 0 失败。
- 涉及：public/model-manager.js、public/model-manager.css、tests/model-manager.test.js、devlog.md、.pi/skills/codebase-map/index。

## 2026-09-13 09:20 — 设置面板两处排版修补：Bearer 鉴权行、摘要记忆数值字段
- 原因：用户反馈「高级连接 → Authorization: Bearer 头」看不懂且没对齐；「摘要记忆」三个数值字段排版不行（长句子换行后读不出对应关系：主代理每 [3] / 轮提醒一次摘要 分两行）。
- 内容：
  - Bearer 行（public/model-manager.js / model-manager.css）：字段名改「Bearer 鉴权」，复选框文案改「自动附加 Authorization: Bearer <apiKey> 请求头」，新增 hint 说明作用与边界（多数 OpenAI 兼容网关需要；自定义请求头里已写 Authorization 时不覆盖——与 src/model-config.js:379 行为一致）。根因修复：`.mm-advanced .mm-check` 的 `align-items: flex-start` 让 14px 复选框浮在 17.6px 行高文字的上方，改回 `center`（实测 boxCenterOffset 1.8px → 0）。
  - 摘要记忆（public/index.html / style.css）：三个字段从句子式内联（`主代理每 [input] 轮提醒一次摘要`）改为堆叠式 `.memory-field`（标签在上、输入框 + 单位在下），文案改「主代理提醒间隔 / 子代理提醒间隔（轮）」「单条摘要上限（字）」；新增 `.settings-selectors:has(> .memory-field)` 加大列间距，输入框收到 32px 高、12px 字（原全局 input 规则是 40px/16px）。
- 验证：Playwright 实测 1280/900/420px——三字段标签均单行、输入框 104×32、单位与输入框同一行、无横向溢出；Bearer 复选框 14×14 且与文字垂直居中对齐（offset 0）；全量 `npm test` 305 项 304 过 1 跳过 0 失败。
- 涉及：public/model-manager.js、public/model-manager.css、public/index.html、public/style.css、devlog.md、.pi/skills/codebase-map/index。

## 2026-09-13 09:40 — 设置弹窗滚动时分类列固定
- 原因：用户反馈设置弹窗滚动后左侧分类（默认新会话设置 / 远程控制 / 模型与供应商 / 服务与更新）跟着滚走，切分类得先滚回顶部。
- 内容：`public/style.css` 把 `.settings-layout` 由整块滚动改为 `overflow: hidden`，分类列与右侧面板各自成为滚动容器（`#settings .settings-nav, #settings .settings-body { min-width: 0; min-height: 0; overflow: auto; scrollbar-gutter: stable }`）；≤700px 单列布局回到整块滚动，但分类列改 `position: sticky; top: 0; max-height: 45dvh`（配 `background: var(--surface)`、`z-index: 2`），窄屏滚下去同样能看到分类。
- 验证：Playwright 用真实 dialog 片段（index.html 的 `#settings` 块 + 造 60 段占位内容）实测 1200/700/420px：滚到底后分类列 `navTop` 完全不变（145/145/141），右侧内容分别在自身容器内滚动；全量 `npm test` 305 项 304 过 1 跳过 0 失败。
- 涉及：public/style.css、devlog.md、.pi/skills/codebase-map/index。

## 2026-09-13 10:10 — 内置/扩展供应商与模型可隐藏（models.hidden.set）
- 原因：内置目录与模型选择器条目只增不减，用户不想再选到的模型会一直出现在候选里；需要一个不影响 Pi 运行时的纯 Axiom 侧隐藏入口。
- 内容：新增 `models.hidden.set { key, hidden }` 协议命令（key = 供应商 id 或 `provider/id`），SQLite models 命名空间新增独立 `hidden` 键（不写 models.json，SDK schema 只认 provider 定义）；`model-config.js` 的 `listCatalog()` 过滤隐藏项（供应商级隐藏在有同名自定义覆盖时让位），`models.config.get` 回传 `hidden` 清单；`server.js` 的 `models.list`（选取入口）改用过滤后目录，Pi 运行时 `catalog()` 不动；模型管理页目录行加隐藏图标 + 二次确认弹窗，隐藏清单集中在左侧「已隐藏」页一键恢复。
- 验证：全量 `npm test` 307 项 306 过 1 跳过 0 失败（含新增 models.hidden.set 测试：单模型/整供应商隐藏、覆盖让位、恢复幂等、未知 key 与非法载荷拒绝、models.json 不被污染）。
- 涉及：src/protocol.js、src/server.js、src/model-config.js、src/pi-model-storage.js、public/model-manager.js、public/model-manager.css、tests/model-config.test.js、README.md、devlog.md、.pi/skills/codebase-map/INDEX.md。
## 2026-09-13 10:10 — 修复跨行 `<axiom_summary>` 导致闭合标签漏进正文、摘要未入库
- 原因：用户截图里助手正文末尾出现裸的 `</axiom_summary>`。根因是 `public/memory-tags.js` 的 `TAG` 正则内容用 `[^\n]`，只认单行有界标签；模型实际把开启标签、正文、闭合标签分三行写。按行处理时：开启标签行同行无闭合 → 整行丢弃；正文行无标签 → 原样保留；闭合标签行不匹配 `OPEN`（`<name>` 而非 `</name>`）→ 原样保留，Markdown 把正文与闭合标签并成一段就成了截图效果。同一原因下 `extractMemoryTags` 也提取不到，该条摘要没入库（trigger 记 missing）。
- 内容：`public/memory-tags.js` —— `TAG` 内容改 `[\s\S]`，标签可跨行，提取时 `replace(/\s+/g," ")` 把换行折叠为空格；新增 `segments()` 按代码围栏把连续同类行合成段，段内整段匹配（围栏内仍原样保留）；strip 用 `HOLE`（`\u0000`）占位替换被删标签，整行只剩占位符才丢弃以免留空行；首个无配对闭合的开启标签截到段尾（流式中的摘要整块隐藏）；新增 `CLOSE` 正则删除落单闭合标签，兜住开启标签丢失（跨围栏、被截断）时的漏出。
- 验证：`tests/memory-tags.test.js` 旧断言 `extractMemoryTags("<summary>跨行\n不认</summary>") === {}` 翻转为 `{ summary: "跨行 认" }`；新增两条测试覆盖截图那种标签独占行的跨行摘要（入库 + 整块隐藏）、裸闭合标签、开启标签落在围栏内、以及流式闭合前整块隐藏。`npm test` 308 项 307 过 1 跳过 0 失败。
- 涉及：public/memory-tags.js、tests/memory-tags.test.js、README.md、devlog.md。

## 2026-09-13 10:20 — 异常停止后在会话流末尾增加手动重试（续跑）入口
- 原因：自动重试只覆盖「可恢复失败」，手动 Esc 停止（归为 cancelled）与终态错误停下来后没有任何再来一次的入口，只能重打一遍输入；用户明确要求按钮贴在被打断的位置，不放发送区。
- 内容：
  - `src/retry.js`：抽出并导出 `dropFailedAssistant(session)`（仅移除末尾失败/截断的助手消息，末尾是 user/toolResult 时空操作）与 `canResume(session)` + `RESUMABLE_STOP_REASONS`（`error/aborted/length/toolUse`）；只认异常的正面证据，`stopReason=stop` 与缺失 `stopReason` 都不给重试（宁可漏不可误，避免测试/历史里无 stopReason 的消息误挂按钮）。createAutoRetry 内部改用导出版本，行为不变。
  - `src/pi.js`：agent 返回对象新增 `resumable()` / `resume()`。resume 清 `lastResult` 后 `retry.run(() => { dropFailedAssistant(session); return session.agent.continue(); })`——不重发用户输入，续跑再失败仍吃自动退避；故意不跑 compaction（maybeApply 会重写消息数组，与 continue 靠末尾接续的前提冲突）。
  - `src/protocol.js` / `src/server.js`：新增 `session.retry` 命令（`{ id, type, sessionId }.strict()`）与分发 `data = { runId: await sessions.retry(request.sessionId) }`。
  - `src/sessions.js`：从 `prompt()` 抽出 `startRun(item, run)` 运行骨架（runId/status 广播 → run() → result() 取错 → 收尾持久化 + idle 复位 + scheduleTaskNotifications），`prompt()` 与新增的 `retry(id)` 共用；retry 在启动前同步校验 `status==="idle" && !configuring && !closing && agent.resumable()`，不可续直接抛错给回执，不留 running→idle 空转。
  - `public/app.js` / `public/style.css`：新增 `lastMainMessage`/`interrupted` 状态与 `canResumeMessage`（服务端规则的前端副本）；`syncRetryPrompt()` 维护单例 `.retry-prompt` 节点（提示 + 「↻ 重试」按钮 → `request("session.retry", { sessionId })`），按 interrupted && 空闲 && 已连接 && 有会话 append/remove 到 `#output` 末尾；`agent.message.end`(main) 更新 lastMainMessage，`session.state` running 清标记、idle 重判，刷新恢复时从 `messages.findLast(agentId==="main")` 初始化。样式复用 retry-card 同款 `--line/--surface/--muted` token。
- 验证：新增 `tests/manual-retry.test.js` 5 项（canResume 正负样本、dropFailedAssistant 三种末尾、sessions.retry 续跑/回执 runId/忙碌与不可续守卫不广播状态/续跑再失败仍回 idle、protocol strict + server 分发、前端入口显隐与点击载荷）；全量 `npm test` 311 项 310 过 1 跳过 0 失败。
- 涉及：src/retry.js、src/pi.js、src/protocol.js、src/server.js、src/sessions.js、public/app.js、public/style.css、tests/manual-retry.test.js、README.md、devlog.md、.pi/skills/codebase-map/index。

## 2026-09-13 04:30 — worktree 流程补充「任务完成后自动合并 master 并推送」
- 原因：用户要求任务完成后自动拉取最新 `master`、完成主从合并并推送，不再每步征求确认。此前流程写的是「提交并 push → 合并回 master 并推送」，没有明确 push 前先把最新 master 合进功能分支，实际已出现本地 master 与 origin/master 分叉各 2 个提交的情况。
- 内容：`AGENTS.md` worktree 段落——流程行改为「验证 → 提交 → 拉取最新 `master` 并合并进功能分支（冲突在功能分支内解决）→ push 功能分支 → 合并回 `master` 并推送 → 清理 worktree」，把合并方向定为先 master→功能分支（冲突在功能分支解决，master 只接快进式合并）；新增一条：任务完成后自动执行收尾，仅当 master 工作区不干净、存在未完成合并、或冲突无法安全自动解决时暂停并报告。`README.md:147`「维护：发布更新」同步为同一套流程措辞，避免两处文档打架。
- 验证：纯文档改动，无代码变更，未跑测试套件；人工复核两处流程描述一致。本次收尾按新规则实测走通（fetch → merge origin/master → push 功能分支 → 合并回 master → push）。
- 涉及：AGENTS.md、README.md、devlog.md。

## 2026-09-13 09:35 — 删除增量摘要机制，改为子代理软轮次预算
- 原因：主代理自报摘要 + 子代理 progress 推送这套机制与「注意力原则」冲突——摘要提醒和进度回注都会在主代理忙碌时挤进上下文，打断正在进行的推理；上下文维持已由后台压缩（compaction.js）覆盖，摘要属于重复投资。同时子代理缺少规模约束，容易在一个任务里无限展开探索。用户要求开发阶段精准切割：不留死列死表、不留字段冗余、不留未知空字段。
- 内容：
  - `src/memory-policy.js` → `src/task-budget.js`（git mv）：导出 `WRAP_UP_PROMPT`、`TASK_BUDGET_LIMITS={turns:[3,200],window:[1,10]}`、`taskBudgetDefaults={maxTurns:20,wrapUpWindow:2}`、`taskBudgetPolicy(role,budget)`（非 subagent 返回 null，否则返回含 `wrapUpAt=max(1,maxTurns-wrapUpWindow)` 的策略）、`budgetSystemPrompt`。软上限：到点每轮注入收尾指令，不 abort——abort 会让 `result()` 抛错并丢掉此前所有轮次的产出。
  - `src/pi.js`：删摘要提醒注入、进度投影与 memoryState 的摘要字段；改为子代理累计 turn ≥ wrapUpAt 时在请求末尾追加 `WRAP_UP_PROMPT`，创建时把 `budgetSystemPrompt` 拼进系统提示词。`<title>` 提取与 `stripMemoryTags` 保留；compaction 自己的 `<axiom_compact_*>` 与 `entry.details.progress` 投影是另一套机制，未改动。
  - `src/tools.js`：`delegate` 新增必填 `context`（批内共享一次），description 与系统提示词同时约束任务粒度；删除进度上报相关工具行为。
  - `src/session-store.js`：DDL 拆为 `TABLES` + `INDEXES` 常量（表建好→归一化→再建索引，避免重建丢索引）；新增 `#normalizeSchema()` 幂等清理旧库——按 `PRAGMA table_info`/`sqlite_master` 自检，删 `summaries` 表、`sessions.main_turn`、`tasks.memory_turn/progress/progress_delivered` 列、`summary_trigger`/`progress_delivery` 事件行，带旧 CHECK 的 `session_events` 走建新表拷贝改名重建，全程保存点包裹，无需迁移标记，新库一条不执行。删 `saveSummary/listSummaries/deleteSummaries/setTurn/pruneEvents`，`EVENT_TYPES` 收窄为 `('compaction','retry')`。
  - `src/session-memory.js`、`src/sessions.js`、`src/tasks.js`、`src/capabilities.js`、`src/protocol.js`、`src/server.js`：`save(change)` 只留 `title/event/task/deletedEvents`；新增 WS 命令 `task.budget.get`/`task.budget.configure`（payload `budget`，zod 边界取 `TASK_BUDGET_LIMITS`），settings key `taskBudget`。
  - `public/`：删「摘要记录」按钮与对话框、`renderSummaries`、`session.summary` 事件处理与快照重放；设置面板「摘要记忆」换成「子代理轮次预算」双输入框（`task-max-turns` 3-200 / `task-wrap-up-window` 1-10），`loadTaskBudget`/`saveTaskBudget` 走新 WS 命令；`.memory-field` 改名 `.budget-field`，删除全部 `#summaries` / `.summary-*` 样式。`public/memory-tags.js` 提取只认 `title`，剥离列表保留旧标签（旧会话历史仍需过滤）。
  - `tests/`：`memory-policy.test.js` → `task-budget.test.js`；`session-store.test.js` 增 `#normalizeSchema` 幂等迁移用例；`pi-memory.test.js` 覆盖 `WRAP_UP_PROMPT` 注入时机；`memory-ui.test.js` 只留 UI 集成（流式剥离标签、标题更新、轮次预算面板），标签纯函数用例归到 `memory-tags.test.js`；删 `summary-compact.test.js`（只测已删对话框的 CSS）；`sqlite-benchmark.mjs` 去掉摘要/进度阶段。
- 验证：全量 `npm test` 356 项 354 过 2 跳过 0 失败。`rg -in "summar|progress|memory_turn|main_turn"` 在 src/ 仅剩 `#normalizeSchema` 的 DEAD_* 常量与 compaction 自有机制；public/ 零命中。SQLite 侧确认 node v24.19.0 内置 SQLite 3.53.3 支持 `ALTER TABLE DROP COLUMN`。
- 涉及：src/task-budget.js（原 memory-policy.js）、src/pi.js、src/tools.js、src/session-store.js、src/session-memory.js、src/sessions.js、src/tasks.js、src/capabilities.js、src/protocol.js、src/server.js、src/database.js、public/app.js、public/index.html、public/style.css、public/memory-tags.js、tests/（10 个文件，含删除 summary-compact.test.js）、README.md、devlog.md、.pi/skills/codebase-map/。

## 2026-09-13 11:20 — 行内代码里的标签不再被剥离，清理导入死字段与过时文档

- 原因：讨论标签机制时写 `` `<axiom_summary>` ``，正文被当成未闭合开启标签，按「截到段尾」规则把反引号之后的整句话吞掉。顺带深扫上一轮删除摘要机制的遗留。
- 内容：
  - public/memory-tags.js：标签处理前把单行行内代码跨度（CommonMark 规则，N 个反引号由等长 run 闭合）掩码为 `\u0001序号\u0001`，处理后回填；extract 与 strip 共用。围栏保护逻辑不变，未闭合开启标签「截到段尾」规则不变。
  - src/session-store.js：`#insertTaskRow` 丢掉旧整 JSON 里的 memoryTurn/progress/progressDelivered 三个死字段，不随迁移搬进新 tasks.record（旧库死列已由 #normalizeSchema 清理，JSON 侧此前仍会照搬）。
  - 删 docs/sqlite-refactor-plan.md：写的是「最终五张业务表」与 summaries 表/main_turn/memory_turn 等实际列，与现状（store + sessions/session_events/tasks）矛盾，无任何代码或 README 引用，决策已在 devlog 留档。
  - 删 .pi/skills/codebase-map/knowledge.md 里「摘要列表稀疏与全局样式串用」条目：对应对话框、summary-meta 样式与 tests/summary-compact.test.js 均已删除。
  - README.md 第 15 行补一句：围栏与行内代码内的同名标签原样保留。
- 验证：新增 tests/memory-tags.test.js「行内代码里的标签是讨论内容」用例（复现串、`` `<title>` ``、双反引号、行内与真标签混排、extract 只认真标签）；实测带死字段的旧 JSON 导入后 record 仅剩 task/status/id；全量 `npm test` 357 项，355 过 / 0 失败 / 2 跳过（既有 SKIP）。worktree 首次需 `npm ci`。
- 涉及：public/memory-tags.js、src/session-store.js、tests/memory-tags.test.js、README.md、devlog.md、docs/sqlite-refactor-plan.md（删）、.pi/skills/codebase-map/knowledge.md。

## 2026-09-13 11:35 — 「会话四表」表述改回三表

- 原因：重建索引时发现 session-store 的模块职责仍写「会话四表」。`summaries` 表已随摘要机制删除，实际只建 sessions / session_events / tasks 三张（`store` 属 database.js），文件头早已写三表，内部注释与索引没跟上。
- 内容：reindex.mjs 的 MODULE_INFO、src/sessions.js:455 与 src/session-store.js:319 的迁移注释、tests/session-store.test.js:206 的用例名，四处「四表」改「三表」。
- 验证：全量 `npm test` 357 项，355 过 / 0 失败 / 2 跳过；重建 INDEX.md 后模块表描述同步为三表。
- 涉及：.pi/skills/codebase-map/scripts/reindex.mjs、src/sessions.js、src/session-store.js、tests/session-store.test.js、devlog.md。

### 2026-09-13T17:36:36.164Z 子代理重试绑定任务
- 内容/原因：重启不恢复子消息，混合 messageCount 不能定位；改为复用 SQLite 已保存的 agentId/taskId，将重试固定置于任务说明后。迟到元数据自动迁回，多次重试不重复，主代理路径不变；不新增存储字段或样式。
- 涉及：public/app.js、tests/message-activity.test.js、README.md、.pi/skills/codebase-map/knowledge.md、INDEX.md。
- 验证：定向10项及 app/session-flow/session-persistence 20项通过；全量验证见后续记录。
- 最终验证：node --test --test-concurrency=1 全量357项，355通过、2跳过；默认并行两次在未改动 app.test.js 异步断言失败（排序/导入跳转），定向与串行通过。追加实时子消息之后重试也固定归位检查，定向10项再次通过。
- 集成复验：合并最新 origin/master 后，定向30项通过；全量串行再次355通过、2跳过。

## 2026-09-13 11:02 — 右上角加 GitHub 图标；移除文字对比度调节，正文固定最高档

- 原因：用户要求右上角一个可点进开源页的 GitHub 图标；同时「A」对比度按钮不再需要，直接把正文文字定死在原先 150% 那一档，省掉一个控件、一段本地存储和两份资源。
- 内容：
  - public/index.html：`.service-controls` 首位新增 `a#github-link.icon-button`，指向 https://github.com/cosyeezz/axiom ，`target="_blank"` + `rel="noopener noreferrer"`，内嵌 GitHub mark 单 path SVG（无新增图标依赖）；删掉 `/text-contrast.css` 的 link。
  - public/style.css：`--body-ink` #d0d6e0 → #dee2e9、`--muted` #8a8f98 → #adb1b7（各混入 30% 白，等于原 150% 档结果，#adb1b7 对 #010102 约 9.7:1）；新增 `--dim-line: #8a8f98` 供 `--muted` 的两处非文字用途钉回原色（`.selectors label:has(select):after` 下拉箭头、`.tool-activity` 默认 `--activity-ink`）；新增 `#github-link` 两条（grid 居中、去下划线、17px svg 用 currentColor 填充，复用 `.icon-button` 32px 方形与 hover）。
  - public/app.js、src/server.js：删 `initTextContrast` 的 import 与调用、删两条静态资源路由。
  - 删 public/text-contrast.js、public/text-contrast.css、tests/text-contrast.test.js。
  - 9 个测试 harness（app/compaction-ui/manual-retry/memory-ui/message-activity/model-onboarding-ui/model-thinking-favorites/remote-ui/workspace-tabs）去掉注入 text-contrast.js 的读取与 eval 插值。
  - tests/app.test.js 在既有 header 图标用例里补断言：href/rel 正确、高度 32px、`text-decoration: none`、`#text-contrast-button` 不再存在。
  - tests/conversation-ui.py：对比度面板那段换成 GitHub 图标的 tooltip 文案与 href/target 校验。
  - README.md：品牌正文色改 #dee2e9；tooltip 段落改写为 GitHub 图标 + 固定高对比度说明；`npm test` 注释去掉「对比度」。
  - .pi/skills/codebase-map/：SKILL.md 架构图与 reindex.mjs 的 MODULE_INFO 去掉三条 text-contrast 条目，重建 INDEX.md（118 文件、0 未登记）。
- 验证：`npm test` 348 项，346 过 / 0 失败 / 2 跳过（既有 SKIP；较上轮 357 少 9 项＝删掉的 text-contrast 用例）。Playwright 实测：图标位于 header 最右侧服务区首位（1440 宽下 x=1296、32×32），静止色 rgb(173,177,183)、hover 转 --ink，tooltip 显示「在 GitHub 查看源码」，href/target/rel 均符合预期；`--body-ink`/`--muted`/`--dim-line` 计算值分别为 #dee2e9/#adb1b7/#8a8f98。tests/conversation-ui.py 全量跑不通（`#workspace` 30s 不可见），在 master 上同样复现，属本环境既有问题，非本次改动引入。
- 涉及：public/index.html、public/style.css、public/app.js、src/server.js、public/text-contrast.js（删）、public/text-contrast.css（删）、tests/text-contrast.test.js（删）、tests/app.test.js、tests/conversation-ui.py、tests/compaction-ui.test.js、tests/manual-retry.test.js、tests/memory-ui.test.js、tests/message-activity.test.js、tests/model-onboarding-ui.test.js、tests/model-thinking-favorites.test.js、tests/remote-ui.test.js、tests/workspace-tabs.test.js、README.md、devlog.md、.pi/skills/codebase-map/。

### 2026-09-13T23:21:57 子代理位置与恢复修复（进行中）
- 已修改 public/app.js：delegate 的 task ID/toolCallId 绑定任务入口，快照重放与分组后归位，同批保持返回顺序；子代理详情接入 canRetry 与 task.retry，绑定原会话并阻止重复点击。
- src/protocol.js、src/server.js 新增 task.retry 协议与转发；tests/compaction-ui.test.js、message-activity.test.js、server.test.js 覆盖位置及按钮/API。README.md 已同步目标行为，后端落盘/续跑尚待实现验证。
- 前端/API阶段 npm test：373项，371通过、2跳过。后续接入 src/sessions.js 的子代理独立目录、历史回放、自动续跑、retryTask 与停机 interrupt；完成通知绑定结果凭据，避免重试后的新结果被旧通知标成已送达。
- 2026-09-14：修复 tests/conversation-preview.mjs 缺 ensureLoaded；tests/compaction-ui.py 改用会话 URL 并在手机展开输入区。真实 Chromium 的桌面/390/320px 摘要嵌套任务、详情、减少动态效果验收通过。后端首轮全量373项，371通过、2跳过。委派的集成测试模拟器存在挂起缺陷，主线程接管重写为两条真实 SessionManager/JSONL 回归，验证停机续跑、已完成/取消不自动执行、历史缺失拒绝重发、同 ID 手动重试与目录清理；另有7条任务单元回归。最终 npm test：382项，380通过、2跳过，git diff --check 通过；未调用真实模型。合并最新 origin/master 后再次跑全量及 Chromium 桌面/390/320px 验收，均通过；已提交功能分支并推送。

## 2026-09-14T03:10 默认可选能力为空
- 内容：新用户主/子代理默认不选择 Skills/MCP/插件；未选 MCP 时不导入适配器入口。保留已保存选择、null=全部语义及用户 Pi 配置。
- 原因：可选插件不能成为基础使用的前提，避免无关 MCP 的缺失依赖阻断会话。
- 文件：src/sessions.js、src/pi.js、tests/capabilities.test.js、tests/config.test.js、README.md、代码索引与知识库。


## 2026-09-14 回答分区与角色提示词
- 原因：过程与正式答复难区分，用户消息换行丢失。
- 新增 src/prompts.js 按角色集中 Axiom 自有提示词；main 使用 axiom_answer，子代理和压缩不继承。原注入时机和摘要请求保持不变。
- public/answer-tags.js 负责独占行标签、代码保护、流式和异常回退；app.js 按明确答复折叠此前过程；stream-renderer.js/style.css 将用户输入按纯文本保留换行。server.js 注册新静态模块。
- README、索引、标签/页面/渲染测试同步。npm test：390 项，388 通过，2 跳过；Chromium 核验用户 pre-wrap 和新模块 HTTP 200。未新增 Mermaid 或改变压缩策略。


### 2026-09-14T08:03 空正文截断自动恢复
- 内容/原因：length 且无正文与工具调用时自动纠偏一次，避免思考耗尽额度后必须人工重试；恢复再失败即停，取消不续跑。提示仅临时加入系统上下文，不伪造用户消息、不重发工具。
- 文件：src/retry.js、tests/retry.test.js、README.md、.pi/skills/codebase-map/INDEX.md、knowledge.md。
- 验证：npm test，397 通过，2 跳过，无失败；无编译脚本。

### 2026-09-14 提问卡视觉与多行输入修复
- 原因：单行 textarea 不随内容增高，继承全局 240px 上限；新增图标缺少配套样式。
- 修改 public/question.js/css：按 scrollHeight 自动增高，重绘恢复草稿尺寸，缓存题面最大高度，宽度变化保留焦点/选区；完成徽章、SVG 键帽和语义色。
- 同步 README.md、codebase-map 索引与知识库；新增 tests/question-layout-ui.py。
- 验证：Chromium 多行/长词/切题/375px/选区/删除缩回/会话恢复通过；npm test 399 通过、2 跳过。

### 2026-09-14 取消后直接重新提问
- public/app.js 使用后端 canReask 区分重新提问/重试；src/pi.js 只识别末尾取消的 question，保留旧历史并追加新编号的同题调用，直接执行工具，回答后 continue。src/sessions.js 复用 session.retry 路由及忙碌保护。
- 不回退历史、不重跑其它工具、不要求模型重生成。兼容 SDK 取消后追加空 error assistant。
- tests/pi-question.test.js 真实 SDK 覆盖无模型请求重开、重复点击、反复取消、答案续传；tests/manual-retry.test.js 覆盖入口及快照。README/索引同步。npm test 399通过、2跳过。

## 2026-09-14 当前会话代理角色选择

- 原因：保留讨论上下文时也能调整后续子代理模型和思考等级。
- 内容：输入区增加角色下拉并复用现有选择器；session.configure 支持 nullable subagentThinking；保持默认配置及已启动任务不变。沿用现有暗色表面、细边框、圆角与键盘交互，不引入样式或依赖。
- 涉及：public/app.js、public/index.html、src/protocol.js、src/sessions.js、tests/app.test.js、tests/config.test.js、README.md、devlog.md、代码索引。

## 2026-09-14 长对话性能调研第 2 轮：真实长会话实测基线

- 原因：第 1 轮只有代码级热点，需真实 goal 长会话的可复现数值支撑（首屏/切换耗时、DOM 节点数、流式单帧耗时、内存占用）。
- 样本：goal 模式最大真实会话 55e7fce9-c23b-441a-b6e1-1042321ad701（JSONL 11,553,809B / 1877 行 / 1831 消息行：user 18、assistant 803、toolResult 1010 / 38 次 compaction / 正文 2,193,665 字符 / thinking 1,390,647 字符 / 145 个代码块）。筛选口径为 goal + 最大体量，而非用户口头报告的 aff6e5c0（588KB，体量不足以暴露卡顿）。
- 修正：业务库实为 `~/.axiom-dev/axiom.db`（9.8MB，sessions 89/goals 3），先前假设的 `~/.axiom/axiom.db` 仅 12KB 且只有守护状态。
- 环境：`VACUUM INTO` 只读复制库 + JSONL 副本，独立端口 4410 启动，测量全程不写入原始数据、不外传会话原文（临时导出的原文样本已删除）。
- 实测（Chromium 152 / Playwright）：首屏 firstOutput 1171ms、lastOutput 1626ms、最大长任务 955ms；切换触发 1345ms 长任务；**DOM 节点 39,947**（#output 97、tool-record 332、call-group 48）；流式文本尾部每帧 7–12ms（峰值 33ms）、头部 2–4ms、64000 字符全量冷渲染 502.6ms；长会话堆 50.6MB、切换后 53.3MB、短会话 3.4MB。滚动与静止基线均 ~31.3ms/帧（≈32fps），滚动掉帧未复现；3 轮切换内存 +0.7MB 并随 GC 回落，短周期未复现持续增长。折叠成本：单个 tool-record 3–10ms，332 个全开 4.1ms 且 DOM 数不变（惰性渲染生效）。
- 涉及：新增 docs/perf-long-conversation/（README.md 测量口径、session-stats.json、first-screen.json、switch.json、memory.json、scroll-fold.json、stream-render.json、measure.mjs）。产品代码（public/、src/、scripts/）零改动。
- 验证：`git diff --stat -- public src scripts` 为空；两处实例（4399/4410）结果交叉印证。

## 2026-09-14 长对话性能调研第 3 轮：genericagent 前端机制对照

- 原因：需确认 genericagent 的 Web 聊天前端/后端流式处理里哪些机制值得移植，避免把 axiom 已有的能力当缺口重复建议。
- 对象：本地只读克隆 `/f/tmp/GenericAgent-ro` @ f6e5657；限定 frontends/desktop/static/*、ga-web.js、desktop_bridge.py、conductor.html、chatapp_common.py，未做全仓库扫描。未运行 genericagent，未改产品代码。
- 结论（11 条机制，每条含 GA 文件:行号 + axiom 等价物）：
  - 已具备但实现不同（勿重复建议）：批量 hydrate 单次整表渲染（GA app.js:3047-3052/2247-2253 ↔ axiom public/app.js:2001-2125）、增量游标拉取（GA app.js:1585/2996-3004 ↔ axiom WS 增量 src/sessions.js:744）、展开才渲染的惰性（GA app.js:1291-1303 ↔ axiom public/app.js:1160、1048-1049、1239-1241、1329）、滚动 rAF 贴底（GA app.js:2294-2301 ↔ axiom public/app.js:195-204）。
  - axiom 确实缺失（本轮 3 条适用结论）：① 流式重绘节流与逐字步长（GA app.js:2303-2306/2421-2444；axiom public/app.js:1863-1889 → public/stream-renderer.js:9-25 每帧全量重绘，实测 7–12ms/帧、峰值 33ms）；② 每帧对整条消息跑 marked.lexer（axiom public/markdown.js:219-220，块级 DOM 缓存已有但 lex 范围未限定）；③ 用户交互期间暂停 DOM 重写（GA app.js:2306-2337 DRAFT_INTERACT_MS=520；axiom 无对应机制）。
  - 不适用：按轮折叠（axiom 一条 message 即一个 turn，与 compaction public/app.js:2050-2090、call-group public/app.js:731-748/905-921、goal 轮次 public/goal.js:518-540 重叠）、后端历史分页（axiom 用事件增量，分页不解决首屏渲染成本）、GA 刷新恢复对齐（axiom 无打字机）。
- 反例记录：conductor.html:540-542 整体重画仅适用于小数据量；chatapp_common.py:60-77 split_text 是 IM 平台消息分片，与 Web 渲染无关。
- 涉及：新增 docs/perf-long-conversation/genericagent-mechanisms.md。产品代码（public/、src/、scripts/）零改动。

## 2026-09-14 长对话性能调研第 4 轮：汇总报告与分优先级方案

- 原因：前三轮分别产出了代码链路热点、真实长会话实测基线、genericagent 机制对照，需收口为一份可执行报告并给出取舍选项；同时回答「现有折叠机制是否已足够」。
- 内容：把 `docs/frontend-long-conversation-perf.md` 从第 1 轮工作稿改写成最终报告，新增：五类场景根因表（每条带 axiom 文件:行号与实测支撑）、四项实测数值汇总与口径说明、折叠机制是否够用的三层判断、genericagent 三条可移植机制摘要与已具备/不适用分类、六条分优先级方案（P0-1 流式重绘双重闸门、P0-2 限定每帧 re-lex 范围、P1-1 交互期间让出渲染、P1-2 首屏分片重建、P2-1 CSS content-visibility、P2-2 常驻对象回收，每条含预期收益/风险/回退），以及修订后的实施目标草案与三个待确认取舍点。
- 关键判断：「现有折叠机制已足够」不成立——实测 332 个 tool-record 全开 4.1ms 且 DOM 节点数不变、单个开/关 3–10ms，说明折叠（含 tool-record 惰性渲染 app.js:1048-1049）本身已到位且不是瓶颈；剩余卡顿来自折叠触及不到的三类常驻成本：每帧整段 lex（public/markdown.js:219-220）、每个 delta 整段重算（public/app.js:1869、1874）、每帧全量分组重排（public/app.js:797/757/1025）。滚动掉帧（idle 与 scroll 均 ~31.3ms/帧）与内存持续增长（3 轮 +0.7MB 且随 GC 回落）在本样本未复现，列为观测项而非优化目标。
- 涉及：改写 docs/frontend-long-conversation-perf.md（第 1 轮链路图与 H1–H15 热点清单作为附录保留）。产品代码（public/、src/、scripts/）零改动。
- 验证：`git diff --stat -- public src scripts` 为空；报告条目与 docs/perf-long-conversation/ 各 JSON 数值逐项对齐。
- 后续：向用户提交 P0/P1/P2 取舍，确认后把目标修订为实施修复（草案见报告第七节）。

## 2026-09-14 长对话性能调研第 5 轮：跨文档证据纠错（不提交，待独立验收）

- 原因：第 4 轮报告及配套 JSON/README 的部分表述超出实测证据边界（把属性设置+同步布局的计时当作详情渲染完成、把微基准当真实上/下界、把有限帧数检测当统计学无差异、断言 39,947 节点全部参与布局等），需在不改任何原始数值的前提下把解释文字改成可核查的表述。
- 取舍：只改解释与结论文字，**所有原始数值/样本/协议参数一律保留**；不改产品/测试/`measure.mjs`，不新增测量；保留「不做后端历史分页」的决策，但把理由改为「GA 增量游标分页首屏 limit=0 仍全量」，并承认真正按需分页可能降低初始构建量；GA 惰性渲染改为由源码早退 + `ontoggle` 确认（引用不足处标「未量化」而不编造）。
- 修正要点：
  1. GA M3：节流只降重绘频次、不限制单次全文 lex 成本，10 字符是常规步长而非硬上限；删除「单帧成本有界/与文本长度脱钩」的推断，未测 GA 单帧耗时。
  2. 折叠：4.1ms/57.1ms 与单条 3–10ms 只覆盖「改 `open` 属性 + 同步布局」，`open` 会异步派发 `toggle`，不能算详情渲染完成或据此证明惰性；惰性改由 `app.js:1049` 早退 + `app.js:1160` `ontoggle` 确认。
  3. 流式：删除「超线性」结论，也不反说次线性；不同文本样本不能判复杂度增长阶数。
  4. 微基准：强制布局 + 600 字符步长，非真实流式，既非上界也非下界；报告/README/JSON 三处「下界」全部纠正。
  5. 滚动：范围 31,776px、每帧 +900px、约 36 帧触底后可能静止，检测能力有限；未检出≠无掉帧，不能称「统计学无差异/非瓶颈」，不能称 39,947 节点全部参与布局。
  6. paint：`stream-renderer.js:10-25` 已有文本变化守卫，只缺交互让路，非无条件重写。
  7. P0-2 收益参照真实尾部 7–12ms；502.6ms 是另一口径的合成冷渲染，不是收益上限。
  8. 内存：4410 首屏 50.6/53.3MB 与 4399 趋势 23.5→24.2MB 为不同实例样本，未强制/记录 GC；回落与 GC 相容但不证实，+0.7MB 不能判泄漏，50.6MB 是整页堆非某对象占用。
  9. 其他：删去「折叠省最大块」的无量化表述；588KB 样本改述为「体量远小于主样本，未在该会话复现」；首屏 955ms 归因 `snapshot` 标为代码候选而非 CPU profile 结论。
  10. 行号修正：`src/sessions.js` emit 711→708（H15 与链路图、场景 B）；`public/markdown.js` 注释 218→215。
- 涉及：docs/frontend-long-conversation-perf.md、docs/perf-long-conversation/{README.md,genericagent-mechanisms.md,scroll-fold.json,stream-render.json,memory.json}、README.md（补报告入口）。产品代码（public/、src/、scripts/）零改动。
- 验证（见本轮收口）：JSON 全部可解析；三份 JSON 数值与 HEAD 逐项一致（仅解释字段变化）；`git diff --check` 无空白错误；`git diff --stat 2c8051b -- public src scripts` 为空。未提交，交独立代理验收后提交。

## 2026-09-14 长对话性能实施第 6 轮：P0-1 最小流式节流 + delta 预处理延后（不提交，待独立验收）

- 原因：调研确认流式路径每帧整段重算（`public/app.js` 旧 1869/1874 每个 delta 都跑 `stripMemoryTags`/`splitAnswer`）且绘制无时间闸门，需先落最小改法：节流 + 把预处理移到绘制前一次。
- 内容：
  1. `public/stream-renderer.js`：`mark()` 首次标记后按 `interval=40ms` 调度一次绘制，期间到达只累计进 dirty（不重置计时，持续输入不饿死）；`paint()` 在绘制前对 `item.pending` 执行一次 `item.prepare(item)`；默认调度改为 `setTimeout/clearTimeout`（rAF 无法延迟），`flush()` 仍立即绘制并收口 pending，`clear()` 取消挂起调度；签名新增第 5 个可选参数 `interval`，前 4 个位置参数不变。
  2. `public/app.js`：`agent.delta` 只做 `raw += delta` / `reasoning += delta` 并标 `pending`，不再在到达时解析；新增 `prepareStream(item)`（去记忆标签 + 回答/过程拆分 + `updateActivity`）挂到卡片 `item.prepare`，由绘制前一次调用——活动状态依赖 buffer，必须与正文同一时机刷新；`renderMessage` 开头清 `item.pending`，最终态不被挂起的流式帧覆盖。主/子任务语义不变（子任务仍不做回答标签拆分）。
  3. 折叠子任务：`mark()` 早退不变，因此折叠期间既不调度也不预处理，展开时按最新累计 `raw` 补画（原行为保留）。
- 未做：Markdown 尾部解析优化（P0-1 范围内明确不做）；逐字动画/任意字符步长；新依赖或单用途工厂。
- 诚实边界：仍是单次绘制整段完整 Markdown 词法分析（`public/markdown.js`），本次只降低绘制频次，**未达成单帧 ≤4ms**，需 P0-2 复测。
- 涉及：public/stream-renderer.js、public/app.js、tests/stream-renderer.test.js（+4 例：突发合并/持续输入上限且不饿死/flush 与 clear/折叠展开）、tests/message-activity.test.js（+1 例：绘制前不处理与最终态不被覆盖）、README.md（流式说明）。`.pi/skills/codebase-map/INDEX.md` 由 `tests/codebase-index.test.js` 重建（行号同步）。
- 验证：`npm test` 全量 490 例、488 通过、0 失败、2 跳过（EXIT=0）；`node --test tests/stream-renderer.test.js tests/message-activity.test.js` 17 例全绿；`git diff --check` 见下轮收口。未提交，交独立代理复核后提交。

## 2026-09-14 长对话性能实施第 6 轮补充：修复 stop×挂起帧回归（不提交，待独立验收）

- 原因：独立复核 b26e416e 复现真实回归——真实事件序列 `session.state running → agent.message.start assistant → thinking_delta → session.state idle`（无 `message.end`）后等待绘制，摘要本应停在「已结束/stopped」，却被挂起的 `prepareStream → updateActivity(item)` 覆盖成 `done`（thinking 行回到 `thinking`，主活动行回到 `connecting...`）。根因：停用态只写在 DOM 上，`updateActivity` 无条件刷新活动显示。
- 内容：
  1. `public/app.js` 共享路径修：`stopActivity()` 把停用标签落到 `item.stopped`；`updateActivity()` 在 `item.stopped && !item.active` 时强制沿用停用态，覆盖所有挂起刷新入口（流式绘制、工具更新等），不再回退为运行/连接态；`renderMessage()` 落定最终消息时清 `item.stopped`，让最终内容与自身 `stopReason` 生效。
  2. `public/app.js` `prepareStream()`：仅当 `item.raw` 变化时才重算去标签/拆分（纯思考 delta 不再重复解析未变化的回答原文）。
  3. `public/stream-renderer.js` `flush()`：收口后若 `dirty` 已空则取消无用的节流定时器；仍有其他 dirty 项时保留共享定时器，不影响其他待绘项。
- 未做：不改 `markdown.js`；不做 P0-2/P0-3 等其余范围优化；不声称性能达标。
- 涉及：public/app.js、public/stream-renderer.js、tests/message-activity.test.js（+2 例：主代理 idle 停用摘要不被挂起帧覆盖、子任务 cancelled 同理）、tests/stream-renderer.test.js（flush 取消定时器断言 + 有其他 dirty 项时保留 + 生产默认真实 `setTimeout` 有界等待）。`.pi/skills/codebase-map/INDEX.md` 由 `tests/codebase-index.test.js` 中的 `reindex.mjs` 重建（行号同步）。
- 验证（先失败后通过）：修复前新增用例报 `AssertionError: 挂起帧不得把已停止的摘要改回 done / 'done' !== 'stopped'`；修复后 `node --test tests/stream-renderer.test.js tests/message-activity.test.js` 20 例全绿；`npm test` 全量 493 例、491 通过、0 失败、2 跳过（EXIT=0）。未提交，交独立代理复核后提交。

## 2026-09-14 长对话性能实施第 6 轮收口：固化 P0-1 生产默认定时器回归检查（不提交，待独立验收）

- 原因：P0-1 已通过的应用级验证用的是临时脚本（已删），需把「真实事件序列下产品默认 setTimeout 绘制不得回退 stopped」固化进常驻测试。
- 内容：`tests/message-activity.test.js` 的 `page()` 最小加参 `{ defaultSchedule }`（为真时不注入 rAF，走 `public/stream-renderer.js` 默认 `setTimeout/clearTimeout` 调度，仅包一层 `afterPaint` 计数供等待）；新增 1 例：running → message.start → thinking_delta → idle（停用立即 stopped）→ 等生产默认定时器绘制落地仍 stopped → message.end 清 stopped 且正文完整。等待为 5ms×200 有界轮询，不做脆弱墙钟断言；同步修既有同类用例 `scope >` 缺冒号笔误（`:scope >`）。
- 未做：不改产品代码与 markdown/README，不新增多余 helper 抽象；不跑会重建 `.pi/skills/codebase-map/INDEX.md` 的全量测试。
- 验证：`node --test tests/message-activity.test.js tests/stream-renderer.test.js` 21 例全绿；`git diff --check` 无空白错误；临时把 `updateActivity` 的 stopped 守卫改回旧行为时新用例失败，恢复后 sha256 与原文一致（见本轮收口回复）。
- 涉及：tests/message-activity.test.js、devlog.md（本条）。未提交，交独立代理复核后提交。

## 2026-09-15 长对话性能实施第 6 轮：P0-2 第一步最小安全块缓存（不提交，待独立验收）

- 原因：`public/markdown.js` 每帧对每个 block token 做 `JSON.stringify(token)` 当复用键，长对话下是帧内固定深序列化开销；目标是消除它，同时不得破坏「晚到引用定义会改变先前块」的正确性（审查 0c60e1ce：冻结最后 token 之前不安全、def 可多行/转义/在容器内、regex 不可靠）。
- 内容：
  1. `public/markdown.js`：新增 `linksSignature(links)`（按 id 排序拼接 id/href/title）；块键由 `JSON.stringify(token)` 改为 `type + "\0" + raw`，`raw` 缺失时回退 `JSON.stringify` 兜底；`linksKey` 变化（或首次渲染）时本轮禁用全部复用；缓存项新增 `linksKey`。注意 `Array.filter` 会丢掉 `marked.lexer` 返回数组上的 `links` 属性，必须在 filter 前读取 `lexed.links`。
  2. 为何 `type`+`raw` 足够：marked 块 token 的其余字段（depth/loose/align/lang/href/title/start/text…）都由 `raw` 与文档级 `lexer.links` 派生；唯一的跨块依赖是引用定义（定义自己不产生块），由 `linksKey` 覆盖。反例已固化为测试：`[reference][id]` 单独出现 vs 追加 `[id]: url` 后，paragraph 的 `type`/`raw` 逐字相同，DOM 从字面量变为链接。
  3. `tests/markdown.test.js` 新增独立 test：同一共享容器逐步追加，每步与「全新容器全量渲染」oracle 比对 innerHTML；覆盖 loose list、list 第二段、setext、表格、blockquote、晚到 ref、blockquote 内 def、多行 def、转义 def（必须不解析为链接）、代码内伪 def、CJK 围栏、裸 JSON 增长、危险 HTML/链接、非追加替换。
- 未做（P0-2 仅部分实施）：仍每帧完整 `marked.lexer`（不减少词法范围）、`fixCjkBold` 保留；不做冒险前缀冻结；不改 `app.js`/`stream-renderer.js`；不声称单帧 ≤4ms。`linksKey` 变化时保守重建全部块（定义极少变化，代价可接受）——正确性优先于该边界下的 DOM 复用率；定义变化导致未变块 DOM 身份丢失是本步已知边界。
- 涉及：public/markdown.js、tests/markdown.test.js、README.md（流式说明）、.pi/skills/codebase-map/INDEX.md（`scripts/reindex.mjs` 重建）。未提交，交独立代理验收。
- 验证：`npm test` 全量 495 例、493 通过、0 失败、2 跳过（EXIT=0）；`node --test tests/markdown.test.js` 2 例全绿；另以临时脚本对 18 条追加序列 + 400 条随机 fuzz 逐步比对「新键 / 旧键(git HEAD) / 新鲜容器 oracle」三方 DOM 全一致（临时脚本已删）。

## 2026-09-15 长对话性能实施第 6 轮：修复 linksSignature 分隔符碰撞（不提交，待独立验收）

- 原因：独立审查 e327b742 发现 `linksSignature` 用 `\u0000`/`\u0001` 拼接 id/href/title，拼接边界可被伪造——不同定义集合产生同一签名字符串，导致错误复用旧块 DOM。两个已确认碰撞：`[a]: u` + `[b]: v` 与 `[a\0u\0\u0001b]: v` 签名同为 `a\0u\0\u0001b\0v\0`；`[a]: x\0y "t"` 与 `[a]: x "y\0t"` 签名同为 `a\0x\0y\0t`。
- 内容：`public/markdown.js` 的 `linksSignature` 改为 `JSON.stringify(Object.entries(links||{}).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([id,def])=>[id,def.href??"",def.title??""]))`——JSON 自带转义与字段边界，id/href/title 内含分隔符也无法跨字段伪造；`type`/`raw` 块键与完整 `marked.lexer` 流程不变。`tests/markdown.test.js` 新增常驻用例：两组「先后渲染（先 A 后 B）vs 全新容器 oracle」对照，并先断言 A/B 的全量渲染确实不同（防止反例本身失效）。
- 未做：README 第 373 行只描述「引用定义另用 `lexer.links` 签名触发失效」，未写分隔符实现，无需纠正，故 README 不动；不跑会重建 INDEX 的全量用例；不动已有实测 JSON/脚本。
- 涉及：public/markdown.js、tests/markdown.test.js、devlog.md（本条）。
- 已知边界：`public/markdown.js` 由 333 行变 336 行（+3 行注释），`.pi/skills/codebase-map/INDEX.md` 中该文件的行号/行数未同步，待下次跑 `scripts/reindex.mjs` 时校正。
- 验证（先失败后通过）：修复前新用例报 `AssertionError: id boundary: reused DOM kept the previous definitions`（实际 `<a href="u">x</a>` vs 期望字面量 `[x][a]`）；修复后 `node --test tests/markdown.test.js` 3 例全绿；`git diff --check` 无空白错误。未提交，交独立代理复核后提交。

### 2026-09-15 交互让路（直接实施）
- 修改 public/stream-renderer.js、public/app.js：用户交互后让路520ms，每批等待硬截止1秒；flush立即收口，clear取消并重置窗口。不改变布局、样式或历史内容。
- tests/stream-renderer.test.js 用受控时钟覆盖恢复、持续交互截止、结束与切换；tests/app.test.js 两处假rAF检查等待真实交互窗口。README同步；相关25项测试通过。浏览器交互延迟与rAF p95尚待实测，不据单测宣称性能达标。

### 2026-09-15 首屏分片实施与事件回归（未提交）
- public/app.js 将 snapshot 拆为同步初始化、分片消息恢复与尾部整理；超过120条按8ms/40条预算后台调度。共享任务身份取消旧片，外部事件排队并按快照seq去重，无seq事件放行；内部task恢复直接应用。调用链等待分片完成，草稿恢复前移避免覆盖新输入。
- 主代理补短同步路径失败清队列，并补 live 原文恢复（含字符串正文），避免后续delta丢前缀。README同步说明；单条巨块及同步尾部仍有性能上限，不据预算声称最大长任务达标。
- tests/snapshot-chunk.test.js 新增4项受控检查：片间事件顺序且恰好一次、水位去重、无seq放行、短快照异常解除排队。子代理4/4通过；主代理与stream-renderer合跑13/13通过。交互测试新增旁支mark/flush不重置首项1秒截止，渲染器9/9通过；独立交互复核尚待结果。
- 快速切换/草稿/live恢复测试、浏览器实测和全量验证尚未完成；本条不代表五项优化已验收。

### 2026-09-15 用户授权合并master并在4320预览
- 用户明确改为提交到master，在现有4320预览，不另起4330。功能分支fetch origin并合并最新master，冲突在worktree内解决；主仓库未跟踪.playwright-mcp与历史stash不动，不重启服务。
- master新增原始输入输出查看与Goal标记过滤，app.js冲突需保留raw绑定及流式过滤；委派9b1d0723独占产品整合，e7d966ea独占5个新增测试的真实模块依赖接线。devlog保留双方记录，INDEX重建而非手拼。
- 合并后全量首次599项仅remote.test.js中文路径URL未解码失败；改用fileURLToPath后专项13/13，再全量599项597通过、0失败、2跳过（55.1秒，工具timeout=180）。5个新增测试加载器接入master真实markdown-scan/goal-markers，断言不变；INDEX重建165文件。
- 功能分支先提交整合并推送，再以合并方式更新master；性能未达标说明不变，4320服务不重启。

### 2026-09-15 用户授权预览检查点
- 用户同意先提交可预览版本，后续持续优化。此次仅功能分支检查点，不代表性能验收完成，不合并master、不push、不重启现有服务；保留worktree用于预览与后续优化。
- 主代理重建INDEX（159文件、0未登记），npm test工具timeout=180：537项、535通过、0失败、2跳过，30.9秒。原生前端无额外构建步骤。
- 提交范围为本轮产品、回归、文档与已保留的诊断产物；临时dbg.mjs不纳入提交。剩余282ms长任务、微基准4.74ms、三次配对/交互/十轮内存验收仍未收口。

### 2026-09-15 渐进显示断线修复与单次诊断
- 94e600ea将保护收敛到saveView.scroll，分片期间仍存草稿/附件/技能；onReady移入try/catch，新增断线真实恢复与钩子异常回归。主代理相关21/21通过、diff检查通过，显式timeout=180。
- 锁不存在后串行采集profile-progressive-reveal-1.json（timeout=180），样本hash与前次一致，app.js hash1001e36c…275679。页面282/167/134/50/74ms，trace282/134.8/74.3/50.6ms；计数41655/92/143；首次DOM734ms。无原403ms任务，但仍>200ms且crossCheck=false，不计性能验收。退出码1为预期诊断失败而非超时；事后锁不存在。
- 新诊断md及README同步。未据单次测量宣称提速，未提交/推送。

### 2026-09-15 首屏渐进显示落地与断线草稿风险复查
- ab6a726b实现snapshot可选onReady（仅登录入口传入）同步清场后显示workspace，connected仍末尾设置；新增snapshot-first-screen两例。子任务报告535项533过2跳过0失败，尚未浏览器验证。
- 主代理读saveView发现新增ws.onclose按!snapshotQueue跳过整个保存会同时漏存新草稿/附件/技能，不能接受。委派94e600ea独占原两文件改共享保存边界、追踪断线恢复二次保存、补真实断线恢复回归，并将onReady放入现有try/catch解事件阀；修复完成前不复测。
- 当前渐进显示失败后允许半成品可见但不可发，仍有错误/重连条；暂保留这一可恢复状态，不冒称失败回退与旧版完全一致。

### 2026-09-15 首屏渐进显示继续实施
- b5aabc31只读复核因Upstream stream ended失败，无可用结论、不计通过。主代理直接检查app.js snapshot/beginSnapshot及登录恢复链，确认同步清理完成后才开始分片，登录connected仍在整个恢复末尾设置。
- 委派ab6a726b独占app.js和新测试，先核查调用再最小接线：仅登录入口在beginSnapshot成功后首片前显示workspace，不提前connected/开放发送，其他snapshot调用不受影响；须覆盖清旧内容、忙态、完成及失败/切换。暂无性能收益结论、不启动采集。

### 2026-09-15 首布局归因与P1-2显示时机复核
- 699c9972只读确认403ms任务主要Layout334.9ms、全量15384布局对象；恢复链末尾workspace.hidden=false让此前隐藏构建的DOM一次布局。294ms主要program，无法细分原生计算/等待，报告不采纳“97KB不可能解析250ms”等无充分依据推断。
- 不采纳“渐进显示必定越界因此无可做”的结论：用户已经批准首屏分片，提前安全显示可能是该实现缺口。委派b5aabc31只读查登录/恢复/重连/切换及显示时机边界，禁浏览器/服务/采集，暂不改产品；新诊断md同步。

### 2026-09-15 排序修复与全量验证
- be1a4d30修profile-current-hotspots.mjs比较时长副本排序，保留严格等长及<=2ms容差与原始输出顺序；tests/perf-profile-cli.test.js覆盖排序/容差/多余项/重复值及不修改输入。旧JSON未改，新规则重算hashguard依旧false。
- 主代理重建INDEX（158文件、0未登记），npm test显式timeout=180：533项、531通过、0失败、2跳过，30.5秒；git diff --check无错误，仅LF/CRLF提示。
- 委派699c9972只读归因294/403ms已匹配热点，寻找不改变展示/安全性的最小产品优化，不启动新采集。性能尚未达标，不提交/推送。

### 2026-09-15 trace核对排序问题与证据边界
- 890d86f1只读核对发现页面按时间序、trace按耗时序却逐项比较；另有161ms页面条目在trace无对应RunTask，同窗CPU采样idle。新诊断md记录原始事件与时钟偏移，纠正子任务报告偏移符号；不采用“幻影任务”定论。
- 拒绝其trace子集匹配即可通过的建议（且所给排序后下标代码本身也不能跳过额外161ms）。委派be1a4d30仅修副本排序，仍严格等数量、每项差<=2ms，并补多余条目/重复值等回归。不改旧JSON、不重测。

### 2026-09-15 测量关闭确认回归与报告成功状态修复
- 94d8e49f完成paired WebSocket统一收口、登记与有限等待close；主代理合跑四组测量测试14/14通过，git diff --check通过。子代理报告全量531项529过2跳过0失败；主代理本次没有重复全量。
- profile报告原先在crossCheck失败时仍写verification.passed=true。现在采用summary.crossCheckAllMatched，失败保留新诊断JSON但exitCode=1，console.ok同步。tests/perf-profile-cli.test.js新增VM运行真实收尾逻辑覆盖true/false、独占写与保留失败证据；2/2通过（工具timeout=180）。不回写旧JSON。README同步。

### 2026-09-15 History判断后单次串行profile
- d3af58b4核对参数可用，但把History hash判断误解为缺少样本sha guard；未采纳该新增范围。主代理确认app.js守卫存在、profile不走paired的业务WS、锁不存在后，修正先前一概等待WS的流程决定，仅串行执行profile。
- 显式工具timeout=180，--runs1输出新profile-current-hotspots-hashguard.json，正常退出，事后锁不存在。实际JSONL哈希与旧样本相同，app.js hash f8165f01…249896。
- 页面长任务294/161/403ms，首次DOM740ms；trace汇总仅403/294.6ms，crossCheck=false。beginSnapshot phase3.2ms不能直接当150ms总收益；未通过性能验收。新md明确JSON verification.passed不代表crosscheck成功，委派890d86f1只读查漏161ms，不重测。

### 2026-09-15 失败启动专项回归完成
- a82b7abf新增tests/perf-startup-cleanup.test.js，用VM执行脚本真实startServer/stopServer和受控进程/时钟桩，覆盖健康失败且kill未退出仍保有登记、已exit、spawn抛错关闭fd；内存移除登记验证反例。未启动实际服务/浏览器。
- 主代理合跑startup/lock/CLI，9/9通过（工具timeout=180，约0.2秒），git diff --check通过。README同步；WebSocket异常关闭专项仍在进行。
- 委派d3af58b4只读准备复测参数/样本hash/锁状态，不启动采集、不删除锁；后续仅串行采集，不覆盖旧产物。

### 2026-09-15 History独立复核通过与全量回归
- 862035d1只读复核通过：History无项目state消费者，sessionStorage照常写；hash启动/切换/恢复及特殊字符编码检查未发现新增回归（孤立代理项的USVString替换是既有行为）。workspace-tabs 9/9，app/snapshot合跑14/14通过；此结论仅正确性，不是150ms收益验收。
- 主代理重建索引并npm test（工具timeout=180）：519项，517通过、0失败、2跳过，约31.8秒。此时尚不含进行中的失败启动专项测试。
- 继续委派94d8e49f独占paired脚本修attachGroundTruth异常/超时WS清理并写受控桩测试，不跑实际浏览器/服务。所有安全边界补齐前不启动新采集。

### 2026-09-15 测量锁接线复查与失败启动修复
- 12b5b987交付两脚本锁接线、paired参数/输出独占保护、浏览器15秒关闭上限和自起服务退出确认；报告明确未覆盖浏览器超时残留等边界，不视作完整有界退出验收。
- 主代理复查发现startServer失败且内部stop失败时，外层尚未登记进程却可能放锁。修复profile在spawn后立即登记spawnedServer、paired立即push进procs，不等健康返回；外层可再次确认退出，失败保锁。paired清理失败不再尝试删除仍被占用的隔离目录。
- 两脚本语法、CLI和锁测试2/2通过（timeout=180）；委派a82b7abf新增真实startServer函数+VM进程桩回归，不启动浏览器/服务。README同步；仍未实测，不用process.exit兜底。

### 2026-09-15 跳过相同地址的History更新
- d6248e98只读原始profile positionTicks，将beginSnapshot约150ms采样定位到history.replaceState行；任务壳恢复仅数ms，不盲目改成子任务懒恢复。该线索不等于干净配对收益，也不能解决另250ms原生/约310ms布局成本。
- 主代理修改public/app.js唯一replaceState调用：构造sessionHash，仅location.hash不同才更新；保留sessionStorage以及真正切换/缺hash写回。tests/workspace-tabs.test.js新增实际History调用次数与恢复断言，和snapshot两组共20/20通过（timeout=180）。
- README同步，独立只读复核已委派862035d1，未启动浏览器实测、未承诺<200ms达标。

### 2026-09-15 测量共享锁与资源接线
- 读取1462573c只读复核，采纳跨脚本同一临时目录锁、参数校验后且副本创建前获取、资源确认退出后释放；不采纳process.exit看门狗（与用户防泄漏约束不符）。互斥只能约束遵循该协议的脚本，不能排除第三方CPU负载或端口竞争。
- 新增measure-lock.mjs：mkdir原子获取，随机token核对释放，owner记录PID/主机/时间/输出；未知owner或token改变不自动删锁。perf-measure-lock.test.js真实目录测试不同输出并发拒绝、释放后恢复、所有权改变和无owner锁保留，1/1通过（显式timeout=180）。
- 委派12b5b987独占两份测量脚本接线及有限清理，主代理仅改锁模块/独立测试/文档，避免并发编辑同文件；未运行浏览器实测。

### 2026-09-15 接续修复profile证据写入门禁
- profile-current-hotspots.mjs在任何副本/浏览器创建前拒绝已有输出和无效runs，最终用wx独占创建结果，避免竞态覆盖旧证据；修复缺db参数先path.resolve抛错的问题。crossCheck从只比任务数量改为逐项耗时差≤2ms，不再以数量相同冒充对应一致。
- 新增tests/perf-profile-cli.test.js：真实CLI子进程验证已有证据不变、无效runs在打开库/浏览器前拒绝。首跑因中文路径URL未解码失败，改标准库fileURLToPath后1/1通过，显式工具timeout=180，无浏览器/服务启动。
- 同时委派两项只读小调查：beginSnapshot任务恢复成本、测量脚本共享互斥与退出清理。尚未声称防并发测量已完成，也未启动新实测。
- 接续修复profile.startServer：spawn后finally关闭日志fd，记录spawn错误，健康fetch限2秒、启动限30秒，失败终止自己启动的进程，去掉硬编码AXIOM_CWD；loadOnce健康检查也限2秒。语法检查和CLI回归通过；未把kill调用当退出确认，browser.close等剩余退出边界仍待补齐。
- 索引重建、git diff --check通过；CLI/prompt/snapshot两组共15/15通过（显式timeout=180，约7秒）。

### 2026-09-15 profile证据只读复核与纠错
- 208d46a0独立核查确认当前JSON点值与来源内部自洽，PIEDXg原始trace支持另一次运行；但并发污染不能用于性能收益验收。其丢失JSON中的18.6ms探针数字和代码hash不可直接核对。
- 完整重写profile-prompt-cache.md，区分>1ms慢读与总读取、原生采样无JS父帧与任务内仍有JS、一次探针对比与三次测量；删除混用被覆盖运行的区间及未留档收益推断。
- 旧profile-current-hotspots.md运行次数/部分组成值与旧JSON不一致，追加警示并保留历史正文与原始JSON；差异原因未知，不将不一致直接判作旧并发。当前长任务仍未达<200ms，未启动新测量。

### 2026-09-15 缓存后profile并发污染：不计验收
- cb95663a返回profile-prompt-cache.json/md，同时报告另一个同路径并发运行覆盖JSON。保留产物但标为待核验诊断线索，不用于性能验收；未立即重跑，也未据此承诺收益。修正文案：>1ms站点未检出不等于读取次数为0。
- 主代理用显式timeout=30查询Win32_Process，profile-current-hotspots/profile-prompt-cache/axiom-perf-profile仅匹配本次查询自身；未擅自杀进程或声称全局无残留。已委派只读核验JSON/md与来源，不再启动并发测量。
- 当前诊断文件仍显示约432/378ms长任务，<200ms未达标；布局成本可能从同步JS读转移到浏览器帧内，需清洁采集后确认。

### 2026-09-15 输入框缓存独立复核
- e580e378只读复核通过：内容、viewport、侧栏、断点、手机展开、字体失效接线覆盖，无初始化TDZ；prompt测试3/3、与snapshot-switch合跑8/8通过。手机隐藏时非空草稿可能测得0，但当前展开/跨断点必失效恢复，记录边界，不新增抽象。
- JSDOM只证明重复几何读取减少，不证明真实布局耗时减少；已委派单次缓存后profile及强制布局探针，使用新产物路径保留旧数据，所有bash显式工具超时且先核查资源清理。尚不宣称<200ms达标。

### 2026-09-15 接续输入框缓存与防卡死修复
- resize子任务06cccf8c取消，未当作成功交付。其dbg.mjs缺少JSDOM清理，用户终止挂起PID58912；主代理补try/finally清回调队列并dom.window.close()，显式timeout=30运行正常退出，不用process.exit。之后所有bash显式超时（诊断30秒、测试≤180秒），新委派共享该约束；不改全局超时、不重启服务或修改业务历史。
- 接续public/app.js的promptFit/promptLayout缓存与viewport/侧栏/手机/字体失效接线。tests/prompt-resize.test.js原手机空内容断言错误：既有44px分支不读scrollHeight，修正预期并补字体loadingdone验证，非删除必要检查。
- 带timeout=180：prompt/app/snapshot-switch合跑11/11通过；npm test 516项，514通过、0失败、2跳过（约31.9秒）。README同步；独立复核已委派，尚未重测浏览器性能，不以测试通过替代<200ms验收。dbg.mjs仍为已清理资源的临时诊断文件，交付前移除。

### 2026-09-15 首屏配对报告纠正完成
- 7b383013仅重写docs/perf-long-conversation/paired-first-screen.md，逐项机器复算JSON：首屏DOM均1301→672ms，longtask1115→450ms；切换点击后DOM均1602→606ms，最后DOM1766→2196ms（+24.4%），longtask1438→429ms。JSON/mjs与既有基线未改。
- 删除完整重建证明和未经profile支持的巨块/尾部归因；强调MutationObserver不是paint，静默完成只是推断，longtask统计只有上界过滤，代码hash覆盖不全。样本增长/跨浏览器与并发时间线限制保留。
- 下一步只采当前版本CPU profile，确认剩余长任务实际热点后再改产品，不把此次报告纠错当作性能优化或达标。

### 2026-09-15 首屏配对实测证据纠错（未验收达标）
- 实测任务df03先返回服务失败、后返回完成及paired-first-screen.mjs/json/md。独立审核b65ce7f2发现md表格数值与JSON不一致，原报告445/454ms及切换+30%无对应原始产物，禁止继续引用，已委派仅按JSON重写md。
- JSON核算：首屏首次DOM输出均1301→672ms，最大longtask1115→450ms；切换首次DOM相对点击1602→606ms，最大longtask1438→429ms，最后DOM变更1766→2196ms（约+24%）。<200ms未达；首次DOM输出不是paint实测，不能据672ms声称可见首屏目标已验收。
- 12次语义计数一致且尾部命中，静默700ms+1.5s仅增强完成推断，不证明全部快照完整。样本已增至2393条，旧1171ms仅参考，不跨浏览器版本对比。早期临时目录提示并发，但最终03:14运行无可核验并发干扰证据，不声称“无系统偏移”。当前产物哈希覆盖app/markdown，未覆盖stream-renderer等，来源信息仍需补强。

### 2026-09-15 快照修复独立验收
- 独立复核1bbcd1c4通过：快照11/11、合并详情回收14/14；首片异常清队列、成功后提交水位、召回attach迟到身份检查均成立。额外临时探针验证同会话attach等待期间新增草稿保留，未发现回归。
- 报告末尾对断线分支“总写views”的描述与代码不完全一致：最终写输入框分支检查sessionId与changing、不检查connected；当前会话断线时仍可保留在输入框。该分支未独立测，不将其计为验收证据。
- 已启动同环境同真实样本首屏/切换前后各3次实测任务；原始基线保留，不能据逻辑验收声称达到1171ms/<200ms。

### 2026-09-15 详情回收独立验收与全量回归
- 独立复核1d384fa7通过：详情回收3/3、与快照合跑14/14、既有message-activity/app测试17/17；关闭重开、diff、结果更新和锚点均未发现回归，未改仓库文件。
- 主代理执行npm test：513项，511通过、0失败、2跳过，约35.2秒。此次全量覆盖当前详情回收和快照三处修复，不替代尚待完成的浏览器性能验收及快照独立复核。

### 2026-09-15 详情回收及快照复核缺陷修复
- public/app.js 的renderToolDetail在已连接记录关闭时清body，保留args/result及全部历史索引；重开使用既有渲染，未加依赖或折叠层。tests/tool-detail-reclaim.test.js三项通过，覆盖普通工具、diff视图、关闭期间更新；README同步页内查找限制。尚未做10轮浏览器GC/堆实测，不宣称完整P2-2验收。
- 首片调度同步异常纳入清队列路径；快照水位改为finishSnapshot成功后、drain之前提交。失败渲染仍须重新恢复快照才补全历史，不把水位修复当完整恢复。
- withdrawQueue在attach回包后再次检查会话、changing和connected；saveView移到重绘前保留等待期间新增输入，切换期间召回文本写回目标views而不写当前输入框。
- tests/snapshot-chunk.test.js两项失败（调度/水位）与tests/snapshot-switch.test.js两种召回回包顺序失败均先复现再转绿；取消快照不再提交水位，调整对应断言。主代理合跑上述两文件与详情回收14/14通过；三处修复及详情回收已交独立复核，尚未提交。

### 2026-09-15 分片真实调用链独立复核（需修复）
- 独立复核748befc9重跑snapshot测试7/7通过，但发现直接snapshot测试未覆盖的withdrawQueue attach回包夺屏窗口，以及首片调度同步抛错未解除snapshotQueue。已分别委派最小失败回归，产品修改等待工具详情写入者完成后串行进行。
- 复核另指出快照开始即抬appliedSeq会使失败视图仍按新水位丢弃旧事件；计划改为成功完成后提交水位。注意：回退水位本身不能恢复已清空的历史，不能据此宣称失败视图完整恢复。
- 报告对changing误清的结论前后矛盾：前文给出withdrawQueue抢占switchSession反例，后文又声称不可达。以真实入口受控测试裁定，不把矛盾表述作为通过证据。

### 2026-09-15 分片切换与恢复回归
- tests/snapshot-switch.test.js 新增受控调度测试：旧片/旧事件不污染新会话，分片中新草稿保留且切回恢复，live原文前缀接续delta；子代理3/3通过。主代理补thinking块恢复及继续thinking_delta断言，两个snapshot文件合跑7/7通过。
- 子任务报告中“thinking块不会恢复”的观察不成立：renderMessage既有逻辑提取thinking，新增断言确认无需产品修复。真实switchSession的attach等待窗口另交独立复核，直接snapshot测试不能替代整条调用链验收。

### 2026-09-15 交互让路独立复核及测试补强
- 独立复核任务34bc0fe1完成：520ms窗口、首批dirty起1秒截止、旁支flush、clear取消、终态flush五类边界通过；既有9项测试与独立虚拟时钟探针30项断言通过，未发现功能缺陷。此前两次上游失败不计作验收。
- tests/stream-renderer.test.js 将持续交互循环补为实际持续mark及文本变化，新增定时器已顺延后flush/clear取消补画与新会话恢复测试；主代理重跑10/10通过，无产品改动。浏览器事件到绘制延迟与rAF p95仍未测，逻辑验收不替代性能验收。

### 2026-09-15 paired-first-screen 地面真值 WS 退出统一（子代理 94d8e49f）
- docs/perf-long-conversation/paired-first-screen.mjs：attachGroundTruth 改为单一 finalize 收口（成功/拒绝/畸形JSON/ws error/提前close/超时都清定时器并 close()）；JSON.parse 与响应处理全部 try/catch→reject，不再从 ws.onmessage 回调原样抛出；onclose 既判「提前断开」失败又从登记表移除；重复事件由 settled 幂等忽略。
- close() 只算发起关闭：新增模块级 openSockets 登记 + 真实 closeSocket(ws, CLOSE_LIMIT_MS)（等 'close' 事件或已是 CLOSED，有限超时），在 finally 里先于 browser.close 确认；未确认即计入 cleanupErrors → 保留测量锁。未改动任何测量口径、阈值、产物字段。
- 新增 tests/perf-attach-ground-truth.test.js：node:vm 从脚本切出真实 attachGroundTruth/closeSocket/withLimit/sha256，注入假 WebSocket + 受控定时器（fireTimers 触发超时，不等真实 30s），5/5 通过（约 0.1 秒）：成功、畸形JSON与服务端ok:false、ws error/提前close（含结算后事件忽略）、超时清定时器+保登记+未确认保锁、内存删除 openSockets.add 行的承重变异。
- 主代理 npm test（工具 timeout=180）：531 项、529 通过、0 失败、2 跳过，约 32.3 秒。
- 遗留风险：closeSocket 只在真实服务/浏览器场景外验证（本机未跑采集）；登记表只覆盖本脚本自建 socket，不覆盖 Playwright/Chromium 内部连接；close 事件迟迟不来时每次清理最多多等 CLOSE_LIMIT_MS；仍未实测「服务端拒绝 attach」的真实报文形状。
## 2026-09-14T13:06 SQLite 持久化排查清单逐条修复（第 2 轮 / 共 6 轮）

- 原因：第 1 轮只读排查产出 33 条问题清单（跨类 P1-P2、会话 S1-S5、任务 T1-T3、事件 E1-E4、模型存储与配置 M1-M12、守护进程与维护状态 X1-X7）。本轮按「数据丢失/不一致 > 安全 > 性能 > 整洁」逐条修复，每点先写会失败的回归测试并记录失败输出，再改代码使其通过。
- 结论：29 条已修复，4 条明确不修并给出技术理由（S5/E2/E3/X7）。表结构与字段一个未动，只新增一条幂等部分索引。

### 已修复（29 条，均附修复前失败输出）

跨三类基础设施
- P1 落库队列队头阻塞（src/sessions.js persist）：按 SQLite 主结果码分类——环境性失败（忙/锁/只读/IO/磁盘满，errcode&0xff ∈ {5,6,7,8,10,13,14,15}）保留队头与增量顺序原样上抛，由下次写入或关闭重放；确定性失败（未知字段/缺 id/库内坏 JSON）每条增量给且只给一次机会，再撞见同一条即丢弃并 emit 上报，绝不让一条坏增量把该会话此后全部落盘永久堵死。修复前失败：`Error: updateSession：未知会话字段 taskBudgetTypo`，连 close() 的收尾落盘一起带崩。
- P2 persist 裸写 SAVEPOINT：改为复用 SessionStore.change()（回滚自身异常在那里被吞，不掩盖原始错误）。

会话（sessions 表）
- S1 会话级 taskBudget 不落库：sessionData().selection 补 taskBudget。修复前 selection.taskBudget 为 undefined，重开旧会话被热更成当前全局值。不改表结构（selection 是 JSON 列）。
- S2 JSONL 被外部删除后 session_file 被写回 NULL：改 `landedSessionFile(item) ?? item.sessionFile ?? null`，「从未生成」与「生成后丢失」不再混为一谈，历史缺失守卫继续生效。修复前 actual undefined。
- S3 先删 goal 后删 session：新增 Sessions.deleteRecords()，会话行与 goal 记录同一 store.change 事务（goals 表无指向 sessions 的外键，两步分开做崩在中间会「会话还在、目标没了」）。修复前 `删库失败时目标记录必须仍在` actual null。
- S4 标题落库不带 titleRequested：change.title 分支一并写。修复前 `false !== true`，重启会重复索要一次标题。

任务（tasks 表）
- T1 notified 先改内存后落库：换序为先落库成功再改内存。修复前 `true !== false`。
- T2 listPendingSessionIds 全表扫描：新增部分索引 `tasks_pending ON tasks(session_id) WHERE COALESCE(notified,0)=0`（幂等 DDL，只加索引不动表结构；实测现有查询直接命中，无需改 SQL）。修复前 `SCAN tasks USING INDEX sqlite_autoindex_tasks_1`。
- T3 Goal 阻塞态会话每次启动白拉 SDK：load() 先读 goalStore 持久化 phase，非 running/verifying 直接跳过，notified 原样保留等用户恢复 Goal 再投。修复前 `1 !== 0`。

事件（session_events 表）
- E1 无 id 事件纯追加致重放膨胀：saveEvent 对无 id 记录按 (session_id,type,agent_id,record) 内容判重，同代理同内容视为同一条，内容不同仍各自成行。修复前同一条写 3 次得 3 行。
- E4 恢复对账逐条独立事务：整段合并成一次 persist 数组增量（同一 SAVEPOINT），写放大从 1+N 次事务压到 1 次。修复前 `actual 'cancelled' expected 'running'`（半截归一化）。

模型存储与配置（src/pi-model-storage.js、src/model-config.js、src/protocol.js）
- M1 auth 迁移窗口被 models/config 存在性提前关闭：改为每个来源只看自己的 migrated 标记，仍有告警的来源保持窗口开着。修复前 `config 存在不得推断 auth 已迁移完成`——models.json 合法 + auth.json 有坏条目时，坏条目修好也永不导入且告警被清空。
- M2 importFavorites 结构非法不告警：与 importModels/importAuth 同口径 recordImportError。
- M3 hidden 无 CAS：新增 hiddenState()/casHidden()，与 config/favorites/凭据同口径。修复前 Missing expected rejection（跨进程丢更新）。
- M4 多语句写入未包 SAVEPOINT：新增本模块 change()（同 SessionStore #change 风格），包住 importAuth 循环、recordImportError/clearImportErrors 的读-改-写、importOnce 的 apply+打标记。修复前 `半截导入必须整体回滚` actual `{type:'api_key',key:'sk-a'}`。
- M5 单行坏 JSON 阻断启动：新增 readRow() 容错读，所有 database.get 改走它；readState 返回 invalid 标志。读路径按未配置处理并在配置页给告警（启动与页面都打得开，用户有自愈入口），写路径明确拒绝。修复前 `store：命名空间 models 键 config 的值不是合法 JSON，读取中止` 直接抛出 init。
- M6 credentials.modify 落库前不校形状：加 isCredential 校验，杜绝 read/list 看不见却占位阻断导入的幽灵行。
- M7 favorites 三条写入口径 version 不一致：统一 `{...store, version:1}`（version 放 spread 之后，调用方不能覆盖字面量）。
- M8 收藏超限静默截断后以截断值做 CAS 基线：normalizeFavorites 不再 slice，上限只拦新增。修复前库内 250 条读回 200、取消一条后只剩 199。
- M9 saveProvider 放行内联 id：合并后强制 `entry.id = providerId`（与 renameProvider 同口径），原本无 id 的条目不凭空添加。修复前 `'other-id' !== 'key-a'`。
- M10 顶层非对象配置不报错且指纹等于空配置：configState 返回 invalid，get() 报 parseError、mutate() 拒绝写入。修复前 parseError 为空且可静默覆盖原值。
- M11 zod invalid_literal 回显原值：oauth 改 `z.string().refine(...)`，issue 不再带 received。修复前错误信息含 `"received": "leak-me-please"`（server.js 会把整条 message 原样回传客户端）。
- M12 写路径每次重新 prepare：本模块按 SQL 文本缓存 prepared 语句（外部连接仍走各自 prepare）。修复前 5 次写入新 prepare 10 次。

守护进程与维护状态（scripts/service.mjs、scripts/maint-state.mjs、src/main.js）
- X1 homeDir 未 resolve：统一 resolve（与 src/main.js 同口径）。修复前 `homeDir 必须是绝对路径，实际 ./relhome`——相对 AXIOM_HOME 下 supervisor 与 worker 会写进两个库文件，且 sanitize 白名单失配导致 /status 泄漏本机路径。
- X2 第二个守护进程启动失败后僵死：抢锁段包 try/catch，抛错前关 maint server、数据库与控制管道。修复前该进程 20s 未退出（actual 'HANG'），一直占着库连接与随机端口。
- X3 维护状态坏行阻断启动：database.get 包 try/catch 按全新状态重建（与 Database.list 跳坏行、Sessions.loadTaskBudget 有 catch 同口径），restore 对非对象快照（JSON null/标量/数组）同样兜底。修复前 `Error: store：命名空间 maint 键 state-bad 的值不是合法 JSON，读取中止`。
- X4 全局 taskBudget 读写口径不对称：读侧先按已知键挑取再 strict 校验（未知键不再连合法值一起丢），configureTaskBudget 无库时明确报错。修复前脏键让整条回落默认 {20,2}。
- X5 main.js initRemote 未 await：记录 remoteReady 并在 stop() 里先等它落定，listen 回调加 `if (closing) return`。实测证据：spawn 真实 main.js + IPC service.stop，修复前 5/5 全部 remote/config 未落库，修复后 5/5 落库。
- X6 service.log 权限未收紧且写入含 token：openSync 带 0o600 + chmodSync（Windows 按平台容错），worker 输出写盘前抹掉维护 token（只抹 token 不做整体脱敏——路径与栈不是秘密，且 sanitize 会按 16KB 截尾，用在追加日志上会吞内容）。修复前 service.log 含 token 明文。

### 明确不修（4 条，附技术理由）

- S5 改标题不刷新 updatedAt：不是缺陷。手工重命名走 rename() 本来就写 updatedAt；模型自报标题发生在 run 内，startRun 进入时已刷 updatedAt、收尾 persist 写全量快照。列表排序不受影响。
- E2 子代理 compaction 不落库：public/app.js:1796 与 1910 两处 compaction 处理都硬编码 `agentId === "main"`，前端从未渲染子代理压缩卡片（运行期也不渲染，不只是重启后）；且 create() 恢复子任务历史时只取 message 条目。此刻落库等于写无人读的行。这是「子代理压缩折叠」这个功能缺失，不是持久化缺陷，已在代码注释里写明这是有意边界。
- E3 compaction 记录不带 agentId：与 E2 同源。当前只有主代理记录会落库，saveEvent 的 `?? "main"` 兜底恒等于真实身份，不存在身份键撞车。E2 若实现，此条必须一起改。
- X7 WAL 不 truncate：supervisor 全生命周期持连接，尾次 checkpoint 不发生是 SQLite 的正常语义（只要还有连接打开，WAL 就必须保留）。实测 `wal_autocheckpoint = 1000`（页）已给磁盘占用封顶，且不丢数据。为「清爽」而在 supervisor 空闲时强制 TRUNCATE 会与 worker 的写入抢锁，收益不抵风险。

### 表结构影响

未增删改任何表或字段。唯一 DDL 是新增部分索引 `tasks_pending`（CREATE INDEX IF NOT EXISTS，幂等，重复启动不重复执行），老库无需数据迁移，投影口径不变。

### 涉及文件

- 产品代码：src/sessions.js、src/session-store.js、src/main.js、src/model-config.js、src/pi-model-storage.js、src/protocol.js、scripts/service.mjs、scripts/maint-state.mjs
- 测试：tests/session-persistence.test.js、tests/task-budget.test.js、tests/goal-sessions.test.js、tests/session-store.test.js、tests/model-config.test.js、tests/pi-model-storage.test.js、tests/remote.test.js、tests/service.test.js
- 文档：README.md（会话级预算固定、service.log 权限与 token 脱敏、启动跳过 Goal 阻塞态会话、已落盘路径只增不抹、hidden 走 CAS、坏行读容错写拒绝、按来源独立的导入门闩、收藏上限只拦新增）、devlog.md、.pi/skills/codebase-map/INDEX.md

### 验证

- npm test 全量：516 项，514 通过，0 失败，2 跳过（`tests/database.test.js` 与 `tests/workspace-picker.test.js` 的 `skip: process.platform === "win32"` 平台条件跳过，master 上本来就有，非本轮新增）。
- 连带回归：P1 的丢弃规则首版写成「只对本次调用者的增量给机会」，导致 tests/recall.test.js 的撤回清理重试失败（`Missing expected rejection`）。已改为「每条增量都有且只有一次确定性失败的机会」——可重试失败不消耗这次机会，撤回清理仍是短事务且能重放。
- 临时验证脚本（probe.tmp.mjs、x5probe.tmp.mjs、wal.tmp.mjs）用完即删，无残留。

## 2026-09-14T14:38 第 2 轮补修：X1 worker 环境变量与 X6 日志脱敏范围

- 原因：第 2 轮 X1/X6 的首版修复只做了一半。复验守护进程组时发现两处仍不达标，按「先写会失败的测试 → 再改代码」补齐。这两条不是新问题，是同一条清单项没修到底，因此仍归第 2 轮。
- X1 补修：`homeDir()` 已 resolve，但 `spawnWorker` 的 fork env 还在透传用户原样的 `AXIOM_HOME`。worker 以 `cwd: root` 启动，会把相对路径按 root 重新解析——只要守护进程的当前目录不是项目根，两端依旧各开一个库。首版测试只断言 `homeDir()` 返回绝对路径，抓不到这个分叉。现在 fork env 显式覆盖 `AXIOM_HOME: logDir`（已解析的绝对 home）。修复前失败输出：`AssertionError: worker 必须与 supervisor 打开同一个库目录 + actual '…\Temp\axiom-svc-p5axFP\relhome' - expected '…\Temp\relhome'`。
- X6 口径反转：首版注释写的「只抹 token 不做整体脱敏——路径与栈不是秘密」站不住。同一批 `redactions` 白名单本来就把安装目录与用户目录换成 `<install>`/`<home>` 后才给 `/status`，同一份信息在 service.log 里原样落盘等于两套标准；日志又常被整份贴进 issue。现在 worker 输出写盘前一律过白名单。修复前失败输出：`AssertionError: 白名单路径必须替换为占位符，实际 "worker boot token=***\nworker home=C:\Users\dane\AppData\Local\Temp\axiom-svc-H2mHnp\home\n"`。
- 首版顾虑的处理：`sanitize` 会按 16KB 尾截，直接用在追加日志上会吞正在写的内容。故拆成两个函数——`redact()` 只脱敏不截尾，给流式追加的 service.log；`sanitize()` = `redact()` + 16KB 尾截，有界语义只留给维护状态里的 `log` 字段。行为对既有调用方不变。
- X2/X3 本次只复验，未再改代码：抢锁失败路径仍完整收摊（maint server + 数据库 + 控制管道），`.catch` 保持 `process.exitCode = 1` 而不加 `process.exit(1)`——句柄已释放，事件循环自然退出；显式 exit 反而可能在 stderr 未冲刷时截断报错文本，而该用例正断言 stderr 含「已有守护进程运行」。
- X7 仍判不修，补一组实测数据：`page_size=4096`、`wal_autocheckpoint=1000` 页，写入约 12MB 期间 `-wal` 稳定在 4132392 字节（= 1000×4096）不再增长，长连接 close 后 `-wal` 消失。占用有硬上界且不丢数据，为「清爽」强制 TRUNCATE 需独占 checkpoint，会与 worker 抢锁。
- 涉及文件：scripts/service.mjs（导入 redact、logLine 全白名单脱敏、fork env 覆盖 AXIOM_HOME）、scripts/maint-state.mjs（拆出 redact，sanitize 复用）、tests/service.test.js（新增「相对 AXIOM_HOME 两端同库」，加强 service.log 用例断言白名单路径落盘即脱敏）、README.md（AXIOM_HOME 相对路径解析语义、service.log 脱敏范围由「抹 token」改为「白名单」）、.pi/skills/codebase-map/INDEX.md。
- 验证：修复前 `node --test tests/service.test.js` 为 22 项 20 通过 2 失败（正是上述两条）；修复后 22 项全通过。`npm test` 全量 518 项，516 通过，0 失败，2 跳过（`tests/database.test.js`、`tests/workspace-picker.test.js` 的 `skip: process.platform === "win32"` 平台条件跳过，master 上本来就有）。测试总数由 516 增至 518，增量为老库部分索引升级、相对 AXIOM_HOME 两条。

## 2026-09-14T15:45 SQLite 收口复查（第 3 轮 / 共 6 轮）

- 原因：第 2 轮把 33 条清单改完了，但 X1/X6 暴露出一种模式——「首版只修一半 + 测试断言过弱恰好放行」（当时只断言 `homeDir()` 的返回值，没断言两端实际打开的库文件）。本轮对 33 条逐条回头复查，并对每条追问一句「这条的测试断言的是真实可观察结果，还是只断言了中间量」；同时补第 2 轮改动的连带影响（兄弟调用点、投影口径、老库升级幂等），补齐跨重启读回这块测试缺口。
- 结论：33 条全部复查完毕，无「待确认」条目——29 条确认实际生效，4 条不修的理由复核后仍然成立。本轮新发现 2 条遗漏（E5 老库 NULL key 事件行、S6 标题与 updatedAt 落库时机），均已修复并配回归测试。表结构与字段仍一个未动。

### 本轮新发现并修复（2 条）

**E5 老库无身份事件行：写得进、读不出、删不掉（src/session-store.js）**

`session_events.key` 一直是可空列（`b95d36e 2026-09-12` 引入），导入侧的 `anon-<序号>` 兜底是其后才加的（`11b21c0`、`98e8ec4`）。那之前导入的老库里，无 id 的 retry/compaction 行 `key IS NULL`，于是同一行在三条链路上身份不一致：

- 写：`saveEvent` 靠第 1 轮修的内容判重兜住，但只认「内容一字不差」。
- 读：`listEvents` 读出来 `record.id === undefined`。
- 删：`deleteEvents` 要求非空 id，直接抛「目标必须是 {agentId, id} 或含 id 的事件 record，拒绝裸 id」。

用真实库跑六步探针确认了这不是理论问题：A 初始 1 行 `key=null`；B 读回 `retries[0].id === undefined`；C 原样回写仍 1 行（内容判重有效）；D 归一化后回写（`messageCount` 落在消息数之外被删掉）→ **2 行幽灵重复行**；E 再回写一次仍 2 行（新行有内容判重护着，老行永远留着）；F 撤回删除抛错。

产品链路完全可达，不需要构造：`src/sessions.js:703` 把 `saved.retries` 映射进 item，`:968-1010` 的恢复对账归一化之后整段 persist 带 `{event:{type:"retry",record}}` 增量 → 必然产生幽灵行；用户撤回时走 `:1433-1448`，`deleteEvents` 抛的是确定性失败，按第 2 轮 P1 的规则整批增量（含同批的会话快照）被丢弃 → 界面上没了、库里永久残留。运行期不会新产生这种行（`src/retry.js:115` 用 `randomUUID()`，compaction 记录带 `entry.id`），纯粹是老库历史包袱，而 Axiom 的老库导入路径本来就是要长期支持的。

修复取向选「开库补身份」而不是「让 deleteEvents 兼容无 id」：一条幂等 UPDATE 让写/读/删三路口径一致，顺带修掉 `compactionById` 用同一个 `undefined` 键互相覆盖的潜在缺陷；若改成删除侧兼容，读出来仍然没身份，前端按 id 归位的逻辑还是错的。

```js
const BACKFILL_EVENT_KEYS = "UPDATE OR IGNORE session_events SET key = 'legacy-' || rowid WHERE key IS NULL";
```

三个细节：**放在 `database.exec(INDEXES)` 之后**——`OR IGNORE` 要靠 `session_events_identity` 这条唯一部分索引才跳得过冲突行，也避开 `#normalizeSchema` 重建表引起的 rowid 变化（重建语句 `INSERT INTO session_events_new SELECT session_id, type, agent_id, key, record FROM session_events` 保留了 key 列，重建先于建索引与补 key）。**前缀选 `legacy-<rowid>`**：与导入侧的 `anon-<序号>` 区分来源，rowid 在表内唯一；万一撞上同组已有同名 key，`OR IGNORE` 跳过该行留 NULL，仍由内容判重兜住。**不把 `key` 列改成 NOT NULL**——那要重建表，收益只是形式上的严格。

回归测试 `tests/session-store.test.js:534`「老库 NULL key 事件行开库补稳定身份…」，修复前失败：`✖ (39.8055ms)`、`pass 1 / fail 1`、`AssertionError [ERR_ASSERTION]: 老库无 id 行必须在开库时补上稳定 key`、`actual: null`。同一用例 `:583` 断言幂等：`assert.equal(rows(last)[0].key, keyBefore, "已有身份的行重开不得被改写")`。

**S6 标题与 updatedAt 要等整轮跑完才落库（src/sessions.js:772-782）**

用 `SESSION_FIELDS`（11 个字段）逐字段机械核对「每个内存态字段是否都有落库出口」时发现的：`prompt()`（`:1400`）由首条输入推导的临时标题、`startRun()`（`:1329`）刷新的 `item.updatedAt`，都只改内存，要等 `:1349` finally 里整轮结束的全量快照才落盘。长任务跑到一半进程被杀（崩溃、断电、Windows 强杀），重启后侧栏就是一排「新会话」配过期时间，而且下次 `prompt` 会从第二条消息重新推导标题——首条输入推导的那个标题永久丢失。

修复折进已有的运行状态变化那一笔写，不额外增加落盘次数：

```js
if (wasRunning !== item.runningSince)
  this.saveChange(item, { session: { title: item.title, updatedAt: item.updatedAt,
    elapsedMs: item.elapsedMs, runningSince: item.runningSince } });
```

`runningSince` 从空变成有值正好发生在运行开始那一刻，而标题与 `updatedAt` 在这之前就已确定，同一笔写顺路带上即可。**故意不同时写 `titleRequested`**：模型此时还没自报标题，重启后必须再索要一次；提前写 true 会让自报请求永久失效。

回归测试 `tests/session-persistence.test.js:291`「运行一开始就落库标题与 updatedAt：跑到一半被杀，侧栏不退回「新会话」与旧时间」，用挂住的 factory（`prompt: () => new Promise((resolve) => { release = resolve; })`）模拟运行中被杀。修复前失败：`AssertionError [ERR_ASSERTION]: 首条输入推导的标题必须随运行开始落库，否则崩溃后每个会话都叫「新会话」`、`'新会话' !== '查一下今天的天气'`、`at tests/session-persistence.test.js:311:12`。

### 三类数据「确实落库且可恢复」的可执行证据

新增 `tests/session-persistence.test.js`「跨重启读回：会话元数据、任务、事件三类原样恢复，撤回的事件不复活」。它不是 mock 断言，而是 `new Sessions(factory, undefined, storage)` 真实关库重开（第二个 Sessions 实例拿同一个库文件），逐类核对：

- **会话**：`title` / `titleManual` / `titleRequested` / `elapsedMs` 4200 / `runningSince` 恢复为 `null`、`selection.taskBudget` deepEqual `{maxTurns:30,wrapUpWindow:3}`；`ensureLoaded` 之后全局 5/1 也不覆盖会话自己的 30/3（S1 的实际生效证据）；`restored.loaded === false` 确认只加载了元数据。
- **任务**：`listTasks` deepEqual 原任务（含 runtime / parentContext / notified / createdAt / updatedAt）。
- **事件**：retries / compactions 一致；撤回 `{deletedEvents:{type:"retry",records:[{id:"r2",agentId:"main"}]}}` 后兄弟事件保留，再 close + 开库读回 `retries.length === 2` —— 删掉的没复活、没删的没丢。

顺带把 `running_since` 的语义用断言钉住：内存里恒为 `null`（重启即中断，未结算的运行段不补算），但 store 里保留崩溃瞬间的原值 999（`saved.runningSince === 999`）。这是既定语义而非缺陷，所以不删列也不特判，改用测试把它固定下来。

`node --test --test-name-pattern="跨重启读回"` → `✔ (77.3635ms)`、`pass 1 / fail 0`。

### 33 条逐条复查结论

**跨类基础设施**
- P1（队头阻塞按结果码分类）实际生效：确定性失败的一次机会机制由 `head.tried` 承载，`tests/recall.test.js` 的撤回清理仍能重放。E5 的分析正是踩在这条规则上——`deleteEvents` 抛错属确定性失败，整批增量被丢弃，因此 E5 必须在写入侧解决。
- P2（裸写 SAVEPOINT）无遗留兄弟点：`grep -E "SAVEPOINT|RELEASE|ROLLBACK TO" src/ scripts/` 全仓只剩两处，都是有意的事务包装器——`src/session-store.js:140`（`session_change`）与 `src/pi-model-storage.js:63`（`model_storage`）；`src/sessions.js:996` 只是注释。

**会话**
- S1 已由跨重启用例证明（`selection.taskBudget` 读回 30/3，且 `ensureLoaded` 不被全局值热更）。顺手还清了一处文档债：`create()` 里「selection.taskBudget 仅供测试注入」的注释与实际行为不符，改为「恢复的会话从 selection 读回创建时的预算，全局值后来改了也不追认」。
- S2 兄弟点口径一致：`landedSessionFile` 定义 `:181-185`，三个出口 `sessionData()` `:547`、`list()` `:622`、新落盘 `:761-764` 都是同一口径，「从未生成」与「生成后丢失」没有在任何出口被合并。
- S3 `deleteRecords()` 是删除路径的唯一入口，会话行与 goal 记录同一 `store.change` 事务。
- S4 判定成立，但生效点不在我以为的地方：`grep "session: {"` 只找到 3 处，都不含 `titleRequested`；真正写它的是 `writeChange` `:596-598` 的投影 `if (change.title) this.store.updateSession(item.id, { title, titleRequested })` —— 只要变更里带 `title`，两个字段就一起写。`src/session-memory.js:19-25` 的模型自报走的正是 `save({title:true})`。
- S5（改标题不刷 updatedAt）复核后仍判不修，理由不变。

**任务**
- T1 顺序正确且三处一致：`:485` 注释、任务恢复映射 `:851`（`notified: resumable ? false : task.notified ?? false`）、恢复循环 `~:1024-1033` 先落库后置位、`:1151`。
- T2 部分索引在老库升级用例里已验证自动补建且三处投影一致；本轮新增的 `BACKFILL_EVENT_KEYS` 排在 `INDEXES` 之后，不影响它的幂等性。
- T3 启动跳过 Goal 阻塞态会话，notified 原样保留。

**事件**
- E1 内容判重实际生效（E5 探针 C 步：原样回写仍 1 行），但只兜住「内容一字不差」的回写，真正的收口是 E5 的开库补身份，已在 `INDEXES` 上方的注释里指明这层关系。
- E4 恢复对账整段单事务；跨重启用例覆盖了「归一化后写回 + 撤回删除」的组合。
- E2/E3（子代理 compaction）复核后仍判不修，理由不变（前端两处硬编码 `agentId === "main"`，落库等于写无人读的行）。

**模型存储与配置**
- M1 门闩按来源独立：`src/pi-model-storage.js:351-357` 每个来源只看自己的 `migrated/<source>` 标记，`pending` 集合由 `importErrors()` 的 source 构成。
- M4 多语句写入的原子边界：`change()` `:59-71` 包住 importAuth 循环、`recordImportError`/`clearImportErrors` 的读-改-写、`importOnce` 的 apply+打标记。
- M5 判定成立（不是残留）：`:90-97` 的 `readRow` 是容错读的唯一点，裸 `database.get` 只出现在它的 try 内，配 `recordImportError` 给用户自愈入口。
- M7 三条 favorites 写入口 version 一致（`writeFavoritesRaw` `:346`、`casFavorites` `:170` 都是 `{...store, version:1}`，字面量在 spread 之后，调用方覆盖不了）；M3 hidden 同口径（`:337`、`:342`）。
- M8 上限只拦新增（`src/model-config.js:246-249` 注释与 `:398` 实现一致，读路径不 slice）。
- M12 判定成立，且 `:139` 的裸 `db.prepare` 不是残留：它在 `readRaw(db, namespace, key)` 内，`db` 是服务跨进程 CAS 传入的**另一条连接**，`db === database ? sql(text) : db.prepare(text)` 是有意分流（语句缓存只属于权威连接，不能拿别人的连接往自己缓存里塞），`compareAndSet` `:143-153` 同样分流。
- M2/M6/M9/M10/M11 复查代码与测试断言均落在真实可观察结果上（库内原始值、`importErrors()` 文案、`assert.rejects` 的错误正则），无中间量断言。

**守护进程与维护状态**
- X1/X6 已在第 2 轮补修中修到底（fork env 显式覆盖 `AXIOM_HOME`、worker 输出写盘前一律过白名单），本轮不再改动。
- X2/X3/X4/X5 复查结论不变；X7 仍判不修（实测 `wal_autocheckpoint=1000` 页已封顶）。

**测试断言强度抽检**：按 X1 的教训抽查第 2 轮新增测试，均断言真实可观察结果而非中间量——`pi-model-storage.test.js` 断言 `database.get("models","favorites") === undefined` 加 `importErrors()` 含 `/结构无效/`；`credentials.modify` 非法值同时断言 `assert.rejects(/凭据格式无效/)`、库内 `database.get("auth","p") === undefined`、`read/list` 为空、合法值照写、返回 `undefined` 视为放弃变更；X1 断言 worker 实际打开的库目录；T2 断言 `EXPLAIN QUERY PLAN` 的实际计划；X5 断言 spawn 出的真实进程退出码与落库结果。

### 复查中判定为「不是缺陷」的几处

- `trackElapsed`（定义 `src/sessions.js:87-96`）**只有一个调用点** `:776`，在 `item.emit` 的 `session.state`/`task.state` 分支内。优雅关闭会经状态变化结算 `elapsedMs` 并把 `runningSince` 置空；硬杀留下未结算段，与「重启即中断，不补算」的既定语义一致，已在跨重启用例里显式断言。
- `canRetry` 冗余落库不修：它是每次 `snapshot()` 重算的派生量，读回不权威，只在测试断言方式上规避。
- `:764` 直写 `sessionFile` 不改成 `landedSessionFile`：这里是「JSONL 首次落盘」的检测点，SDK 在 message.end 之前已写出 JSONL（`node_modules/@earendil-works/pi-coding-agent/dist/core/*.js` 里搜不到 `agent.message.end` 字面量，无法直接证明 appendMessage 先于 message.end，但 `event.data.entryId` 的存在与既有子代理持久化测试都支持这个时序），非缺陷，不做无谓 churn。

### 表结构影响

未增删改任何表或字段。本轮唯一新增 DDL 之外的开库语句是 `BACKFILL_EVENT_KEYS`（一条 `UPDATE OR IGNORE`）：只给 `key IS NULL` 的行补值，已有身份的行不动（有断言），新库零行匹配，重复开库空转。

### 涉及文件

- 产品代码：src/session-store.js（BACKFILL_EVENT_KEYS + 构造函数顺序 + E1/E5 关系注释）、src/sessions.js（S6 运行开始那一笔写带上 title/updatedAt；taskBudget 注释纠正）
- 测试：tests/session-store.test.js（老库 NULL key 补身份 + 幂等断言）、tests/session-persistence.test.js（S6 运行开始落标题、跨重启三类读回）
- 文档：README.md（运行开始即落库标题与 updatedAt 的可观察行为；老库开库补事件身份）、devlog.md、.pi/skills/codebase-map/INDEX.md

### 验证

- 基线（第 2 轮 HEAD 22fc1b0）：518 项，516 通过，0 失败，2 平台跳过。
- 本轮：**npm test 全量 521 项，519 通过，0 失败，2 跳过**（`tests/database.test.js`、`tests/workspace-picker.test.js` 的 `skip: process.platform === "win32"`，master 上本来就有），`duration_ms` 约 48.3 秒。增量 3 条正是 E5 补身份、S6 运行开始落标题、跨重启三类读回。
- 临时探针 probe.tmp.mjs（E5 六步验证）用完即删，无残留。
- 方法学记录，留给第 6 轮复用：(a) 复查看真实可观察结果，不看中间量；(b) 遇到「路径/栈不是秘密」这类为简化找的理由，回头核对同一份信息在其他出口是否已按敏感处理；(c) node TAP 汇总行前缀是 `ℹ` 不是 `#`，别用 `^# ` grep 基线日志；(d) 遇到「可写但不可读不可删」这类结构性不对称，优先让三条链路身份一致，而不是让其中一条容忍残缺；(e) 用字段白名单（这里是 `SESSION_FIELDS` 的 11 个字段）逐字段机械核对「每个内存态字段是否都有落库出口」——S6 就是这么翻出来的。

## 2026-09-14T16:40 五套标签机制排查（第 4 轮 / 共 6 轮）

只读排查，不改产品代码。方法沿用第 3 轮的「白名单逐格核对」：对五套标签各列出 **解析入口 / 剥离出口 / 落库口径** 三栏，逐格用临时探针脚本喂真实不守格式输入，只看可观察输出，不靠读代码推理。四个探针（probe-tags.tmp.mjs、probe-tags2.tmp.mjs、probe-tags3.tmp.mjs、probe-goal.tmp.mjs）用完即删。

先扫旧分支：`git branch -a --no-merged master` 里没有任何分支碰过 memory-tags.js / answer-tags.js / compaction.js / goal.js / pi.js / tasks.js —— 本轮 26 条全是新报点，无重复覆盖。

### 一、memory-tags（`public/memory-tags.js`；标签 `<title>` 与死标签 `<axiom_summary>` / `<summary>` / `<progress>`）

- **M-T1 `summary` 与 markdown 折叠块 `<details><summary>` 撞名**（`:8` TAGS 含 "summary"）。可复现输入：`<details>\n<summary>点击展开细节</summary>\n\n正文\n</details>` → strip 后 `"<details>\n\n正文\n</details>"`，折叠块标题整行消失。`public/markdown.js:228-230` 用 DOMPurify `USE_PROFILES:{html:true}` 且未禁 details/summary，说明折叠块是能正常渲染的正经写法。影响：助手写折叠块，标题被吞；`src/pi.js:467`、`src/tasks.js:58` 也走同一函数，子代理结果同样被吞。修复方向：区分「提取标签」与「历史死标签兜底剥离」两张表，死标签只删独占一行的裸标签行，不吞跨行内容。
- **M-T2 未闭合开启标签「截到段尾」吞掉后文与其他机制的标记**（`:84-88`）。可复现输入：`分析：模型应输出 <title>My Page</title> 这样的头部` 不受影响，但 `讨论 <summary> 的用法\n\n正文\n\n<axiom_round_finished>` → strip 后只剩 `"讨论 "`，`parseGoalMarkers` 全 false。影响：**最严重**。会话里只要谈到这几个标签名（本项目自己就天天谈），后文连轮次完成标记一起消失 → 轮次不结算、收到催促、前端答复被截断。修复方向：非流式输入不做截断，落单开启标签按落单闭合标签同样处理（只删标签本身）；截到行尾只保留给 streaming。
- **M-T3 围栏规则不认 `~~~`、不记围栏长度**（`:15` `FENCE = /^\s*```/`）。可复现输入（探针 B4/B5）：`~~~\n<title>围栏内</title>\n~~~` → 仍提取 `{title:"围栏内"}`；`` ````\n```\n<title>嵌套围栏内</title>\n```\n```` `` → 围栏计数错乱同样误提取。同一段文本 goal.js 与 answer-tags.js 都判为代码。影响：文档/教学内容里写在围栏内的示范标签被当自报，会话标题被示范值覆盖，且该行从展示文本中消失（`public/memory-tags.js:15` 与 `src/goal.js:50` 两份规则对同一文本给出相反结论）。修复方向：与 `src/goal.js:50` 的 `FENCE = /^ {0,3}(`{3,}|~{3,})/` 对齐，抽一份共享围栏扫描。
- **M-T4 不认缩进代码块，且 `^\s*` 把 6 空格缩进误当围栏**（`:15`、`:39-41`）。4 空格/Tab 缩进内的 `<title>` 被提取；反过来 6 空格缩进的 ``` 行被当围栏开关（CommonMark 里 4 空格以上缩进的 ``` 是代码内容，不是围栏）。可复现输入：4 空格缩进的 `<title>缩进内</title>` → 被提取；6 空格缩进的围栏行 → 被当围栏开关，其后真实标签反而漏提取。影响：与 M-T3 同类，`public/memory-tags.js:15` 两个方向都错（该当代码的当正文、该当正文的当代码）。修复方向同 M-T3，共享实现里按 0-3 空格判围栏、4 空格/Tab 判缩进代码。
- **M-T5 行内 HTML `<title>` 被当自报标题**（`:50-62`）。可复现输入：`HTML 页头这样写：\n<title>示例站点</title>\n再配 meta 标签即可。` → `{title:"示例站点"}`，且该行被 strip 删除。影响：会话标题被示例内容覆盖（`titlePending` 为真的首轮命中），正文被吞。修复方向：自报标题只认独占一行的完整标签（提示词本来就要求独占一行），行内出现一概不提取。
- **M-T6 死标签 `progress` 吞掉合法 HTML `<progress>`**（`public/memory-tags.js:8` TAGS 含 "progress"）。可复现输入：`进度条这样写：\n<progress value="70" max="100"></progress>\n即可。` → strip 后该行消失（探针 B6）。影响：与 M-T1 同源，正文里的合法 HTML 被当历史死标签剥离；`progress` 是早期版本用过、现已废弃的标签名，兜底剥离的代价却落在正文上。修复方向：与 M-T1 一起处理 —— 死标签只删独占一行的裸标签行，不删带属性的 HTML 元素、不吞行内内容。

### 二、answer-tags（`public/answer-tags.js`；标记 `<axiom_answer>` / `</axiom_answer>`）

- **A-T1 `inline` 反引号计数器跨行不重置**（`:8` 声明在循环外、`:25-28` 累计、`:15/:19/:21` 全靠 `!inline` 把门）。可复现输入：`路径 `src/a.js 写错了\n<axiom_answer>\n正式答复\n</axiom_answer>` → `{found:false}`，标签原文进 `answer` 直接显示到 UI；行中（非行首）出现 ``` 同样如此。影响：**最严重**。一个落单反引号让整条消息的答复折叠失效、裸标签泄漏；反向还会让围栏失效，围栏内的示范标记被当真协议。CommonMark 的行内代码不跨行，`public/memory-tags.js:17` 的 `INLINE_CODE` 已经是对的。修复方向：每行结束重置 inline，或直接复用 memory-tags 的行内代码遮罩。
- **A-T2 缩进代码块内的标记被当协议**（`:18-19` 只 trim 不看缩进）。可复现输入：4 空格缩进的 `<axiom_answer>` / `</axiom_answer>` 包住 `例子` → `{found:true, answer:"例子"}`，教学示例被误折叠成答复。影响：`public/answer-tags.js:18-19` 把文档里的示范标记当真协议，示例正文被折进答复区、其余正文被划进过程区。修复方向同 A-T1，共享围栏/缩进判定。
- **A-T3 `malformed` 产出但前端从不消费**（`:33-39` 三处 `fallback(true)`；`public/app.js:1290-1301`、`:1870-1885` 只用 `split.answer`/`process`）。可复现输入：两组标签或多余闭合标签 → `malformed:true` 且 `answer` 含标签原文 → 裸标签照样显示。影响：协议破损时 `public/answer-tags.js:33-39` 已经识别出异常，但这个信息在前端被丢弃，用户直接看到标签原文。修复方向：兜底路径先删掉独占一行的标记行再返回，丢协议不丢正文。

### 三、compaction（`src/compaction.js`；标签 `<axiom_compact_title>` / `<axiom_compact_desc>`）

- **C-T1 `parseSummaryOutput` 正则过严，兜底把标签原文当正文**（`:100` 正则 `[^<>]*` + 锚定 `$` + 要求换行前缀；`:105` 长度校验；`:108` `return { summary }`）。可复现输入 —— 八种实测触发（正则码在 `:100`，完整形式是 `\n[ \t]*<axiom_compact_title>([^<>]*)</axiom_compact_title>\s*<axiom_compact_desc>([^<>]*)</axiom_compact_desc>$`）：`<axiom_compact_title>` 或 `<axiom_compact_desc>` 内含 `>`（讲 HTML 的会话，被 `[^<>]*` 卡掉）、只有两个空标签无正文、标题超 30 字、描述超 200 字、标签间夹正文、两标签顺序颠倒、标签后多写一句、围栏内示范格式。全部返回含标签原文的 summary。影响：摘要卡片显示裸标签；更糟的是这份带标签的 summary 会作为 `previousSummary`（`:34`、`:236`）注入下一次摘要请求，坏格式自我强化。修复方向：先无条件剥离独占行的标签行（不论解析成败），再宽松解析元数据；解析失败只丢元数据不污染正文。
- **C-T2 长度口径用 UTF-16 length**（`:105`）。16 个 emoji 的标题 `[...title].length === 16` 但 `title.length === 32` → 判超长 → 整段回落。`public/memory-tags.js:59` 用 `[...value].length`（码点）。可复现输入：标题写 16 个 emoji。影响：`src/compaction.js:105` 判超长 → 整段回落 → 摘要卡片显示裸标签，并经 previousSummary 回注（见 X5/X6）。修复方向：统一按码点计。

### 四、goal（`src/goal.js`；标记 `<axiom_round_finished>` / `<axiom_goal_finished>`）

- **G-T1 模型补了闭合标签 → 不算信号且原文泄漏**（`:74-84` 精确整行匹配、`:86-101` 只删信号集合内的行）。可复现输入：`<axiom_round_finished></axiom_round_finished>` → `roundFinished:false`，且 strip 不清该行 → 裸标签进 UI；分两行写时 `stripGoalMarkers` 留下 `"</axiom_round_finished>"`。影响：轮次不结算 + 收到催促 + 用户看到裸标签。修复方向：strip 与 parse 口径一致，`</marker>` 独占行按落单闭合标签删除；是否把空标签对认作信号需决策。**此条对 `<axiom_goal_finished>` 同样成立**：`:49` 的 `MARKERS = new Set([ROUND_MARKER, GOAL_MARKER])` 让两个标记共用同一条 parse/strip 路径，G-T1、G-T2、G-T4 三条缺陷对两者同时适用（探针只喂了轮次标记，但代码路径同一）。
- **G-T2 奇数围栏（模型漏写闭合围栏）吞掉后续标记**（`:57-70` `outsideFences` 中 `if (match) { fence = match; continue; }` 后续全部 skip）。与 M-T2 同一类「未闭合视为代码到结尾」，两套机制会同时失效，造成同一个催促循环。可复现输入：正文写一个未闭合的代码围栏，其后再写 `<axiom_round_finished>` → `parseGoalMarkers` 返回 false（探针 D2）。影响：`src/goal.js:57-70` 让轮次标记失效 → 轮次不结算 + 收到催促；模型写代码漏写闭合围栏是常见情形。修复方向：扫到文本结尾仍在围栏内时，该未闭合围栏之后的内容不再当代码（更可能是漏写围栏或流式截断）；与 memory-tags 共享实现一起改。
- **G-T3 轮次小结取到 `<axiom_answer>` 裸标签**（`:106` `firstLine`、`:589` `#closeRound(firstLine(text), at)`、`:620` 落库）。goal.js 不认识 answer-tags 的标记，模型按提示词把答复放进标签、标记独占一行时，首个非空行就是开启标签。可复现输入：回复首行独占一行写答复开启标记，后接正文。**有真实现场证据**：本 Goal 状态 JSON 里 `rounds[0].summary === "<axiom_answer>"`。影响：脏值落库进 goals 表、每轮回注进后续上下文（`:317`/`:339` 的计划渲染）、前端展示裸标签。修复方向：`firstLine` 先过共享展示层剥离（有 answer 取 answer 首行，否则取过程首行）。
- **G-T4 严格解析的三种落空（记录，倾向不修）**：大写 `<AXIOM_ROUND_FINISHED>`、标记后紧跟句号、两个标记写在同一行 —— 均不算信号。这是防伪造的有意设计，提示词（`:317`/`:343`）已明确要求独占一行、无内文。可复现输入（探针 M1/M2/M3a）：大写标记、标记后紧跟句号、两个标记写在同一行 → 三种均返回 false。影响：`src/goal.js:74-84` 严格匹配导致模型稍不守格式即轮次不结算（属可接受代价，换来的是模型无法用变体写法伪造完成）。修复方向：如要改只改提示词措辞，不放宽解析。
- **G-T5 验证阶段提示与证据门口径不一致：轮次未收尾就提示「证据已齐 → 输出整体完成标记」**（`:338-339` `#verifyingPrompt` 的分支条件只看 `gate.roundMissing.length === 0 && gate.goalMissing.length === 0`，**不含 `roundsSettled`**；而 `#gate()`（`:959-971`）的 `complete = s.claimed && roundsSettled && roundMissing.length === 0 && goalMissing.length === 0`）。可复现输入（探针 GP，三轮计划）：第一轮提交「轮内 + 全部整体」验收证据 → 第二轮只提交轮内证据 → 同一时刻两个出口互相矛盾：`goal_evidence` 返回 `{"ready":true,"completable":false}` 且指令「本轮证据已齐：…输出 `<axiom_round_finished>` 进入下一轮」，而 `context()` 的验证提示给的是「证据已齐：…输出 `<axiom_goal_finished>` 完成整体目标」。本会话第 4 轮现场同样触发（第 5、6 轮 `pending`，提示仍要求整体标记）。影响：模型若照提示只发整体标记，`onReply`（`:588` 置 `s.claimed = true`、`:606` 兜底 `phase = "verifying"`）既不完成也不推进轮次 —— 探针 GP 第 8 步实测 `phase=verifying currentRound=1`、第三轮仍 `pending`，白等一轮；下一回合提示不变会反复诱导同一错误，只有模型自行改发轮次标记才恢复（第 9 步 → `currentRound=2`）。附带：`:335` 的「本轮待补验收：」在无缺失时仍打印标题加空列表，与紧随其后的「证据已齐」自相矛盾（本会话现场提示原文即为「本轮待补验收：（无）」+「证据已齐」）。修复方向：该分支直接复用 `gate.complete`（或补 `roundsSettled` 条件），整体未收尾时只提示轮次标记；缺失列表为空时不打印那行标题。
- **G-T6 整体验收证据不校验轮次，陈旧证据永久算齐**（`:963` `const missing = (criteria) => criteria.filter((c) => !s.evidence[normCriterion(c)])` 与 `:965` `goalMissing = missing(s.acceptance)` 只判「有没有这条证据」，不比对 `s.evidence[...].round`；对照 `:964` 的 `roundMissing` 明确要求 `?.round !== s.currentRound`）。可复现输入（探针 GP 第 7 步）：第一轮就为整体验收「npm test 全量通过」「合并回主干并清理工作区」提交证据 → 到第二轮，证据表里这两条仍是 `round=0`，`goalMissing` 恒为空，第三轮尚未开始就算整体验收已齐。影响：这是 G-T5 误报的直接成因；整体验收标准通常跨轮、且含多个分句（本会话整体验收第 8 条含「合并回 master 并推送、清理 worktree」，实际未做却已在册），一旦早期轮次登记过就再不复核 → 证据门对整体目标形同虚设，模型被诱导提前宣布完成。修复方向：整体验收证据同样按新鲜度校验（要求产生于当前轮，或至少产生于最后一个 settle 的轮次），或在 `complete` 里显式要求轮次全部收尾后整体证据重提一次。

### 五、pi 内部标记（`src/pi.js`；`__axiom_checkpoint__` / `axiom_recall` / `axiom-memory`）—— 三条均判定无缺陷

- **P-T1 `CHECKPOINT_BOUNDARY = "__axiom_checkpoint__"`（`:99`、`:329`）只作 id 哨兵**，从不与正文做文本匹配。判定：无缺陷。可复现输入（探针 J1）：正文里写这串字符 → `parseGoalMarkers` 与标签解析全不受影响；检查点条目的 `compactedMessageIds` 恒为 `[]`（`summarizedEntryIds` 的 `cut <= 0 → []`），前端不折叠任何消息，只多一张摘要卡，与「JSONL 与 getBranch 保留全文」的设计一致。影响：无（该常量只作条目 id 哨兵，不进任何文本匹配与 strip 路径）。
- **P-T2 `appendCustomEntry("axiom_recall", …)`（`:83`）不进模型上下文**。SDK `session-manager.js:166-189` 的 `sessionEntryToContextMessages` 只处理 message / custom_message / branch_summary / compaction，`type:"custom"` 落到空返回 → 不与任何标签互撞。判定：无缺陷。可复现输入（探针 J2）：正文里写 `axiom_recall` 字样 → 标签解析与 goal 标记均不受影响。影响：无（不进请求上下文、不参与任何 strip）。正文出现 `axiom_recall` 字样也不被剥离。
- **P-T3 `customType:"axiom-memory"`（`:120`）是 `display:false` 的请求副本消息**，不落 JSONL、不过 strip。判定：无缺陷。可复现输入：无 —— 此条未做探针实测，属语义推断，不冒充已验证事实。影响：无（只存在于单次请求副本，不落盘、不进任何标签解析路径）。此条为语义推断（context 钩子返回请求副本），未单独探针实测。

### 六、跨机制冲突（独立于上面的单机制问题）

- **X1 剥离顺序依赖：memory-tags 的截断吞掉另两套的标记**。链路 `src/pi.js:467` `result()` → `src/sessions.js:1102` `goal.onReply({text: reply.text})`，以及前端 `public/app.js:1870` strip → `:1875` split。memory-tags 先跑且会截到段尾，goal 标记与 answer 闭合标签一起没了。可复现输入：过程说明里提到死标签名且后文有轮次标记（探针 E1）。影响：三套机制串联失效（答复不折叠 + 轮次不结算 + 催促循环），单看任一文件都看不出问题。修复方向：归属 M-T2（非流式不截断），并固定「先剥离死标签、再解析协议标记」的顺序，不让前一道吃掉后一道的 payload。
- **X2 三套围栏 + 行内代码规则互不一致（含前后端规则不一致）**。前后端规则不一致的具体形态：`public/memory-tags.js` 是前后端共享的（`src/pi.js:9`、`src/compaction.js`、`src/tasks.js:3` 都 import 它），而 `public/answer-tags.js` 只有前端 `public/app.js` 用、`src/goal.js:50` 又自带第三份 `FENCE` —— 同一份文本在「后端 goal 判定轮次」与「前端 answer 判定折叠」两侧走的是两份不同正则，规则漂移无人约束。可复现输入与实测对照（memory 提取 / goal 标记 / answer 识别）：``` 围栏内 = 全对；`~~~` 围栏内 = memory 误提取；4 空格缩进 = memory 误提取 + answer 误判协议；Tab 缩进 = 同上；嵌套 ````/``` = memory 误提取；6 空格缩进围栏 = memory 当代码（违反 CommonMark）。同一段文本在三处得三种结论。影响：前端显示、后端轮次判定、标题提取三者对同一段文本口径不一致，用户看到的与系统判定的不是同一件事。修复方向：归属 M-T3/M-T4/A-T1/A-T2，抽一份共享围栏/缩进/行内代码扫描（放 `public/` 便于前后端同 import），三处共用。
- **X3 落库原文与展示口径混淆（落库存了展示文本）**：`src/tasks.js:58` `view()` 的 `text` 是 `stripMemoryTags(text)`，`snapshotJob` 展开 `view()` 写进 tasks.record → 子代理原文（含 details/summary）永久不可回读；`read_result` 返回同一份。且子代理本无标题机制（`src/session-memory.js` 里 `if (job || …) return`），`src/sessions.js:830` 给子代理挂 memoryHooks 使 `src/pi.js:467` 对子代理也剥离，纯副作用。违反第 5 轮既定原则「落库存原文、只在展示层剥离」。可复现输入：子代理答复内含 `<details><summary>标题</summary>` → 落库与 `read_result` 读回时该标题行已消失（与 M-T1 同一条剥离路径）。影响：子代理原文不可回读（数据永久损失，不是显示问题）。修复方向：落库与 `read_result` 存模型原文，剥离只留展示层；去掉子代理多余的 memoryHooks。（第 3 轮预记的线索，本轮确认成立并定位到具体行。）
- **X4 goal 不认识 answer-tags 的展示协议**（`src/goal.js:106` 的 `firstLine` 不过 `public/answer-tags.js` 的 `splitAnswer`）。可复现输入：回复首行独占一行写答复开启标记。影响：轮次小结取到裸标签并落库、回注上下文、前端展示（现场证据见 G-T3）。修复方向：归属 G-T3，`firstLine` 先过共享展示层剥离。
- **X5 compaction 兜底污染回注上下文**（`src/compaction.js:108` 兜底 → `:34`/`:236` 回注）。可复现输入：模型输出的摘要标题内含 `>`。影响：带标签的 summary 变成下一次的 previousSummary，坏格式自我强化，且污染是累积的。修复方向：归属 C-T1，解析失败也先剥离标签行，只丢元数据不污染正文。
- **X6 长度计量口径不一致**：`src/compaction.js:105` 用 `String.length`（UTF-16），`public/memory-tags.js:59` 用码点，`src/goal.js:51` 用 `slice(0, 500)`。可复现输入：16 个 emoji 的标题（UTF-16 长度 32、码点 16）。影响：同一份内容在一处合法、在另一处判超长回落，用户无法预期哪种长度算超。修复方向：归属 C-T2，统一按码点计。

### 表结构影响

无。本轮只读。

### 涉及文件

- 排查（未修改）：public/memory-tags.js、public/answer-tags.js、public/app.js、public/markdown.js、src/compaction.js、src/goal.js、src/pi.js、src/tasks.js、src/session-memory.js、src/sessions.js、node_modules/@earendil-works/pi-coding-agent/dist/session-manager.js（SDK 语义核对）
- 文档：devlog.md（本条）

### 验证

- `git status --short --untracked-files=all` 仅输出 ` M devlog.md`、`git diff --stat HEAD -- src public tests` 为空 → 未改任何产品代码，四个探针已删。
- 旧分支覆盖核查：`git branch -a --no-merged master` 逐分支 `git diff --name-only master...$b` 过滤六个标签相关文件 → 无命中。
- 条目账目（26 条，逐类可核）：单机制可复现缺陷 16 条（M-T1~M-T6、A-T1~A-T3、C-T1~C-T2、G-T1~G-T3、G-T5、G-T6）+ 记录不修 1 条（G-T4）+ 判无缺陷 3 条（P-T1~P-T3）+ 跨机制冲突 6 条（X1~X6，其中 X3 是独立修复点，其余各归属上面某条）= 26。按小节数：6 + 3 + 2 + 6 + 3 + 6 = 26。
- G-T5/G-T6 于本轮验收取证过程中实证发现：验证提示要求输出 `<axiom_goal_finished>`，而同一时刻 `goal_evidence` 返回 `completable:false`、第 5/6 轮为 `pending`。按「不盲从与证据门冲突的提示词」原则未输出整体标记，改为记为缺陷；探针 probe-goal.tmp.mjs 复现后已删。
- I2（检查点条目折叠列表为空）与 J1/J2（内部标记与用户正文碰撞）经实测判定符合设计，不列为缺陷；I3（`summarizedEntryIds` 口径）经核对 SDK `getBranch` 语义后撤回，非缺陷。

## 2026-09-14T19:10 修复五套标签机制（第 5 轮 / 共 6 轮）

按第 4 轮 26 条清单逐条处理，分四批推进，每批「先写会失败的回归测试 → 记录失败输出 → 改代码 → 定向复跑」。复用既有测试文件，不新造框架。

### 核心决策：代码区判定收敛成一份实现

第 4 轮 X2 指出三套标签各写了一份围栏/行内代码规则，同一段文本在三处得三种结论，且前后端各走一份正则、无人约束漂移。本轮新增 `public/markdown-scan.js`，memory-tags / answer-tags / compaction / goal 四处全部改用它：

- `maskCode(text)`：把代码区字符换成占位符 `\u0001`，**长度与下标与原文一一对应** —— 于是「按掩码结果扫描、按原文下标切割」共用一套坐标，不需要解析两遍。口径对齐 CommonMark 与 `public/markdown.js`：0-3 空格 + ≥3 个反引号或波浪线为围栏，闭合需同字符且不短于开启，未闭合延伸到结尾；缩进代码块用惰性启发式（前一行是空行或已在缩进段内，且 4 空格/Tab 起头）；行内代码等长反引号配对且不跨空行，落单反引号按字面。
- `cutSpans(text, spans)`：按下标区间并集切割原文，删完只剩空白且原行非空时才丢该行（丢协议不丢正文，也不留空档）。

放 `public/` 是为了前后端同一个 import（先例：`src/tasks.js` 已 import `../public/memory-tags.js`）。

**协议标记行的统一判据**：五套标签一律要求「缩进 0-3 空格 + 独占一行」，4 空格/Tab 缩进的同名行按 markdown 缩进代码块原样保留。这条同时约束 answer-tags 的 `<axiom_answer>` 与 goal 的两个完成标记，与前端渲染口径一致。

### 批次 A：memory-tags（M-T1..M-T6）+ answer-tags（A-T1..A-T3）

**修复前失败**：`node --test tests/memory-tags.test.js tests/answer-tags.test.js` → **19 tests / pass 10 / fail 9**。三条代表性失败输出原文：

```
actual:   '讨论 '
expected: '讨论  的用法\n\n正文\n\n<axiom_round_finished>'   (memory-tags.test.js:56，M-T2/X1)
actual:   '<details>\n\n正文\n</details>'                      (memory-tags.test.js:64，M-T1 吞掉 summary 行)
actual:   { title: '围栏内' }    expected: {}                  (memory-tags.test.js:70，M-T3 波浪线围栏)
```

**改动**（`public/memory-tags.js`、`public/answer-tags.js` 均重写）：

- **M-T1 已修复**：提取表（`LIVE = title`）与历史死标签表（`DEAD = axiom_summary/summary/progress`）分离，并加 `PARENT` 守卫 —— `<details>` 内的 `<summary>`、`<head>` 内的 `<title>` 不删，折叠块标题保住。
- **M-T2 已修复**（最严重）：落单开启标签**非流式只删标签本身**，不再截到段尾。`讨论 <summary> 的用法` 后面的正文与另一套机制的标记都留住；只有流式尾部未完成时才裁残片。
- **M-T3 已修复**：围栏改用共享 `FENCE`（记录围栏字符与长度），`~~~` 围栏、更长围栏、嵌套围栏都认。
- **M-T4 已修复**：`maskCode` 认缩进代码块；同时 6 空格起头的行不再被误当围栏（原 `^\s*` 的错）。
- **M-T5 已修复**：`<title>` 只在回复首个非空非代码行的窗口内**既提取又剥离**；正文中间讨论用的行内 `<title>` 不提取也不剥离（两侧同时收窄，不是只改一侧）。
- **M-T6 已修复**：带属性的开启标签不当协议，`<progress value="70" max="100">` 原样保留。
- **A-T1 已修复**：删掉跨行不重置的行内反引号计数器，改先 `maskCode`；落单反引号不再跨行配对吃掉后面的协议标记。
- **A-T2 已修复**：标记只认 0-3 空格缩进独占行（原来只 trim 不看缩进），缩进代码块里的标记示例不再被当协议。
- **A-T3 已修复**：malformed / legacy 回退时用 `cutSpans` 删掉裸标记行再返回 —— 原来前端从不消费 `malformed`，裸标签照样显示给用户。

**修复后**：同命令 **19 / 19 / 0**。

**连带影响：测试加载器（本轮必修，否则全量跑不起来）**。页面测试用「读 public 源码 → 剥 `export` → `window.eval`」加载，新增的跨模块 `import` 让整段 eval 报 `SyntaxError: Cannot use import statement outside a module`，全量一度 **527 / pass 491 / fail 34**。修法：新增 `tests/helpers/public-source.js`（按序读取、同时剥 `import` 与 `export`、拼接），统一替换 10 个加载点。**没有**选择「把扫描器塞回 memory-tags.js 内部以绕开加载器」—— 那是拿产品代码结构迁就测试基建，属「将就」。同时在 `.pi/skills/codebase-map/scripts/reindex.mjs` 登记两个新文件（`codebase-index.test.js` 要求未登记文件为 0）。

### 批次 B：compaction（C-T1、C-T2）

**修复前失败**：定向跑改写后的首例 → **tests 1 / pass 0 / fail 1**，位置 `tests/compaction.test.js:34:10`：

```
actual: { summary: 'Goal: 保留之前的约束\nProgress: 新发现\n<axiom_compact_title>...' }
```

即 X5 的兜底污染：解析失败时把标签原文当正文交回，经 `previousSummary` 回注后坏格式自我强化。

**改动**（`src/compaction.js`）：`parseSummaryOutput` 先 `maskCode` 扫描（围栏内同名标签不算协议；整份被围栏包住时退回原文扫描），用 `matchAll` 记录 title/desc 开闭标签的 span（**含落单的闭合标签**），`cutSpans` 剥壳后得 `summary`，两个字段都合格才给 `progress`。

- **C-T1 已修复**：解析放宽（不锚 `$`、允许顺序颠倒、允许标签前后夹正文与尾随句子），且**解析失败只丢元数据、不污染正文**。
- **C-T2 已修复**：长度改 `[...s].length` 按码点计，16 个 emoji 的标题不再误判超长；上限集中为 `COMPACT_MAX = { title: 30, desc: 200 }`。
- **X6 已解决**（归 C-T2）：三处长度口径统一按码点。

**既有断言变更（必须写明）**：`tests/compaction.test.js` 首例原断言「纯标签输入原样返回全文」被改写（改名为 `增量展示与完整交接分离，格式异常只丢元数据不污染正文`）。**理由：属修缺陷，不是放宽。** 原断言把「标签原文回流进 summary」固定成了期望行为，而它正是 X5 的污染源。定案口径：纯标签输入返回 `{progress, summary:""}`，由调用方按既有语义处理 —— 已核实 `src/compaction.js:268` 空摘要 → `report("skipped","摘要为空，保留原文")`、`:300` `maybeApply` 空摘要 → `skip(...)`，即**空摘要 = 跳过压缩保留原文**，不是数据丢失。另：标题校验从「拒 `<` 和 `>`」放宽为只拒 `<`（`>` 是正常中文标题会用的字符，如 `A > B 的差异`），这一条是放宽，已加测试固定。

**修复后**：`node --test tests/compaction.test.js` → **22 / 22 / 0**。

### 批次 C+E：goal（G-T1..G-T6）

**修复前失败**：`node --test tests/goal.test.js` → **tests 46 / pass 42 / fail 4**（用 `git stash push -- src/goal.js` 精确回到修复前状态采集，随后 `git stash pop` 恢复）：

```
✖ strip：模型补的闭合标签与空标签对都不留在展示文本里
✖ 轮次小结取正文首行：记忆标签、答复标签与完成标记都不落进小结
✖ 验证提示：还有未收尾的轮次时不要求整体完成标记
✖ 证据门：整体验收证据也要本轮新鲜，陈旧证据不算整体已齐
```

具体断言：① `actual: '<title>接口修复</title>'` vs `expected: '修好了，接口恢复 200'`（小结取到裸标签）；② 提示文本**意外匹配** `/证据已齐：在回复最后单独一行输出 <axiom_goal_finished>/`（G-T5）；③ `actual: []` vs `expected: [ '线上接口返回 200' ]`（G-T6，陈旧证据被算作已齐）。

**改动**（`src/goal.js`）：

- **G-T1 已修复**：**「不认作信号」与「要清掉原文」分开处理**。空标签对（模型补的闭合形式）仍不算完成信号（不放宽防伪造口径），但 `stripGoalMarkers` 必须删掉它 —— 原来它既不算信号、又留在展示文本和落库小结里，两头都错。
- **G-T2 明确不修语义，仅去重**：**保持「未闭合围栏视为代码延伸到结尾」**。理由：① CommonMark 如是规定；② 前端渲染是同一口径，后端单独放宽正是 X2 投诉的前后端漂移；③ 漏判完成标记可由催促恢复（false negative 可恢复），误判则不可逆地推进轮次（false positive 不可逆），保守方向更安全；④ 与 M-T2 情形不同 —— M-T2 的截断会**删掉可见正文**，围栏只改变分类、不删任何内容。本轮只把这份第三份正则换成共享 `maskCode`（行为等价），`tests/goal.test.js` 现有六类围栏断言即回归守卫，不新增测试。
- **G-T3 + X4 已修复**：新增 `bodyText(text) = splitAnswer(stripMemoryTags(stripGoalMarkers(text))).answer`，`firstLine` 与 `pauseAtSafePoint` 的小结都走它，轮次小结不再落进裸标签（原来 `src/sessions.js:1085` 的 goalResult 会把标签原文写进小结并回注上下文）。
- **G-T4 明确不修**：大写标记、标记后紧跟句号、两个标记同一行仍不算信号。这是防伪造的有意设计，提示词已要求独占一行无内文；放宽解析等于允许模型用变体写法伪造完成。代价（模型不守格式则该轮不结算）由催促恢复，方向上可接受。第 4 轮记为「倾向不修」，本轮确认不修。
- **G-T5 已修复**：`#verifyingPrompt` 按 `gate.settled` 分流。这里**不能**直接用 `gate.complete` —— 它还要求 `s.claimed`，而提示词正是在模型尚未声明时要求它声明，用 `complete` 会死锁。因此 `#gate()` 新增 `settled`（证据门本身已满足，与 `claimed` 无关）：`settled` → 提示输出整体标记；`roundMissing` 空但还有剩余轮次 → 提示输出轮次标记；末轮但整体证据未齐 → 提示先补证据。缺失列表为空时不再打印「本轮待补验收：（无）」这行自相矛盾的标题。
- **G-T6 已修复**：整体验收证据同样做轮次新鲜度校验。抽出 `stale = (criteria) => criteria.filter((c) => s.evidence[normCriterion(c)]?.round !== s.currentRound)`，`roundMissing` 与 `goalMissing` 共用同一判据。理由：`#lookupTool` 本来就只认当前轮的真实工具结果，「存了 round 却不比对」属内部不一致；末轮重新给出整体验收证据正是「整体验收」应有之义。**已知副作用（接受）**：本任务自身第 6 轮需重新提交全部整体验收证据。
- 顺带去重：删掉 `MARKERS` 集合、独立 `FENCE` 正则与 `outsideFences`，改为 `signalLines(text)`（遍历 `maskCode` 结果，只有 `/^ {0,3}\S/` 的行算信号行，同时记录原文下标便于切割）。`stripGoalMarkers` 改为删**标记 token** 而非整行 —— `<axiom_round_finished>干完了` 现在留下 `干完了`；标记在渲染层本就当未知 HTML 被吞掉，删 token 才与用户所见一致。

**修复后**：`node --test tests/goal.test.js` → **46 / 46 / 0**；三个 goal 文件合跑 → **71 / 71 / 0**（`completable` 仍返回含 `claimed` 的 `gate.complete`，语义未破）。

### 批次 D：X3 落库原文

**修复前失败**：`node --test tests/tasks.test.js` → **tests 5 / pass 3 / fail 2**：

```
actual:   '完成检查\n'
expected: '完成检查<title>接口修复</title>\n\n<progress>进度说明</progress>'   (tasks.test.js:84)
actual:   '完成'
expected: '完成<progress>已完成检查</progress>'                              (tasks.test.js:99)
```

**改动**：`src/pi.js` 的 `result()` 不再剥离（删 `stripMemoryTags` import 与调用，`memoryState` 本身保留，另有用途）；`src/tasks.js` 的 `view()` 不再剥离（同样删 import），`snapshotJob` 因展开 `view()` 自动落原文。

- **X3 已修复**：落库与 `read_result` 存模型原文，剥离只属于展示层。

**依据（逐条核实，不是推理）**：① 前端**不渲染** task 的 `text` —— `public/app.js:1914-2010` 的 task 状态只用 heading/description/failure/retryButton/runtime，子代理正文走流式消息通道，展示层剥离已在 `public/app.js:1290`、`:1870` 独立完成；② 子代理没有标题自报协议 —— `src/session-memory.js:15` 的 `onReply` 开头即 `if (job || message.role !== "assistant") return;`，对子代理剥离是纯副作用；③ `historyResult()`（`src/tasks.js:7-14`）从不剥离，只有 prompt 路径剥离 —— 去掉后 resume 与首次执行的文本口径反而**一致**了；④ `read_result` 面向模型消费，给原文更忠实。

**既有断言变更（必须写明）**：`tests/pi-memory.test.js:92`（原期望 `result()` 已去标签）与 `tests/tasks.test.js:88` 一例改为期望原文。**理由：属层次修正（剥离归展示层），不是放宽。** 这两条断言把「落库存展示文本」固定成了期望行为，而它导致子代理原文永久不可回读（数据损失，不是显示问题）；剥离能力没有减少，只是移到唯一该做剥离的地方。

**修复后**：`node --test tests/tasks.test.js tests/pi-memory.test.js tests/task-resume.test.js tests/task-notifications.test.js` → **18 / 18 / 0**。

### 跨机制冲突：处理顺序与归属结论

| 冲突 | 归属 | 结论 |
| --- | --- | --- |
| X1 剥离顺序依赖 | M-T2 | 已修复。非流式不再截断，前一道不会吃掉后一道的 payload；顺序固定为「先剥死标签 → 再解析协议标记」。 |
| X2 三套围栏规则不一致（含前后端漂移） | M-T3/M-T4/A-T1/A-T2 | 已修复。四处共用 `public/markdown-scan.js` 一份实现，goal 也换用（见 G-T2），前后端不再有两份正则。 |
| X3 落库存了展示文本 | 独立修复点 | 已修复（批次 D）。 |
| X4 goal 不认 answer-tags | G-T3 | 已修复。`bodyText` 串起三层展示剥离。 |
| X5 compaction 兜底污染回注 | C-T1 | 已修复。解析失败只丢元数据。 |
| X6 长度计量三处不一致 | C-T2 | 已修复。统一按码点。 |

### pi 内部标记（P-T1..P-T3）

三条均**判无缺陷、不修**。P-T3 第 4 轮标注为「语义推断、未实测」，本轮补成实测：`tests/pi-memory.test.js` 现有断言「标题指令只出现在请求 4、其余请求都不含它」即为证据 —— 若那条 `customType:"axiom-memory"` 的 `display:false` 条目落进消息历史，后续每次请求都会复现它。已在该处补注释说明这条断言承担 P-T3 的验证职责。（顺带发现：该 fixture 的 agent 不落盘，cwd 下只有 `models.json`，所以「查磁盘 JSONL」不是这条的有效证据路径，试过一版磁盘断言后撤回，改用请求序列断言。）

### 表结构影响

无。本轮未增删改任何表或字段；落库内容口径变化（X3）只影响新写入的值，旧记录照旧可读。

### 涉及文件

- 新增：`public/markdown-scan.js`（共享代码区扫描）、`tests/helpers/public-source.js`（页面测试源码加载）
- 产品代码：`public/memory-tags.js`（重写）、`public/answer-tags.js`（重写）、`src/compaction.js`、`src/goal.js`、`src/pi.js`、`src/tasks.js`
- 测试：`tests/memory-tags.test.js`、`tests/answer-tags.test.js`、`tests/compaction.test.js`、`tests/goal.test.js`、`tests/tasks.test.js`、`tests/pi-memory.test.js`；加载点统一 10 处（`app.test.js`×2、`compaction-ui`、`manual-retry`、`memory-ui`、`message-activity`、`model-onboarding-ui`、`model-thinking-favorites`、`remote-ui`、`workspace-tabs`）
- 工具：`.pi/skills/codebase-map/scripts/reindex.mjs`（登记两个新文件）
- 文档：`README.md`（memory-tags 与 answer-tags 行为、compaction 解析口径、goal 标记行规则与证据新鲜度、`read_result` 原文口径）、`devlog.md`（本条）

### 验证

- 分批「修复前失败 → 修复后通过」：批次 A 19/pass 10/**fail 9** → 19/19/0；批次 B 1/pass 0/**fail 1** → 22/22/0；批次 C+E 46/pass 42/**fail 4** → 46/46/0（三个 goal 文件 71/71/0）；批次 D 5/pass 3/**fail 2** → 18/18/0。
- 全量：`npm test` → **tests 532 / pass 530 / fail 0 / skipped 2**。两条 skip 是既有的 `{ skip: process.platform === "win32" }`（`tests/database.test.js:103` POSIX 权限、`tests/workspace-picker.test.js:87` 平台揭示），非本轮新增，第 3 轮基线同为 2。
- 26 条账目：**已修复 16 条**（M-T1..M-T6、A-T1..A-T3、C-T1、C-T2、G-T1、G-T3、G-T5、G-T6、X3）+ **明确不修 2 条**（G-T2 保持 CommonMark 口径、仅去重；G-T4 防伪造有意设计）+ **判无缺陷 3 条**（P-T1、P-T2、P-T3）+ **归属到上述修复的冲突 5 条**（X1→M-T2、X2→M-T3/M-T4/A-T1/A-T2、X4→G-T3、X5→C-T1、X6→C-T2）= 26。无「待确认」条目。
- 既有断言变更 3 处，理由已逐条写明（compaction 首例：修缺陷；`pi-memory.test.js:92`、`tasks.test.js:88`：层次修正）；另有 1 处主动放宽（compaction 标题允许 `>`），已加测试固定。

## 2026-09-14T19:42 收口复查与整体收尾（第 6 轮 / 共 6 轮）

对第 4 轮 26 条清单逐条复查生效性，补查连带影响（前端展示路径、后端落库路径、goal/compaction 调用点）；发现并修复一处第 5 轮漏掉的前端展示缺陷；完成文档、索引、全量验证与合并收尾。

### 复查结论（26 条，无「待确认」）

用临时探针 `probe6.tmp.mjs` 原样重放第 4 轮的复现输入（纯函数、只看可观察输出），26 条全部符合第 5 轮既定结论，无回归：已修复 16 条维持生效、G-T2/G-T4 两条维持「不修」、P-T1..P-T3 三条维持「无缺陷」、X1..X6 六条维持既有归属（X1→M-T2、X2→M-T3/M-T4/A-T1/A-T2、X4→G-T3、X5→C-T1、X6→C-T2）。

### 本轮新发现遗漏：前端展示路径从不剥 goal 完成标记（G-T1 的另一半）

第 5 轮只修了后端（轮次小结不留标记原文），前端 `public/app.js` 的展示链路仍只有 `stripMemoryTags` → `splitAnswer`，没有剥离 goal 标记。用与 `tests/markdown.test.js` 相同的真实渲染管线（marked + DOMPurify + jsdom）探针 `probe6b.tmp.mjs` 实测：带闭合标签、流式半截（`<axiom_round_fin`）、未闭合围栏后等 4 类输入 × 流式/非流式 8 格，`textContent` 与 `innerHTML` 都出现 `&lt;axiom_round_finished&gt;`，用户可见。这是 G-T1「裸标签进 UI」的另一半，本轮修复。

原因：标记解析逻辑只存在于 `src/goal.js`（后端私有），前端没有可复用的实现，只能完全不处理。

### 修复：goal 标记解析/剥离抽成前后端唯一实现

新增 `public/goal-markers.js`（与 `public/answer-tags.js` 同构），导出 `ROUND_MARKER`、`GOAL_MARKER`、`parseGoalMarkers`、`stripGoalMarkers(text, { streaming })`；内部 `signalLines` 基于第 5 轮的 `maskCode`，标记 token 大小写不敏感匹配开启与闭合写法，流式用后缀表隐藏半截。

- `src/goal.js`：删除本文件的重复实现（`ROUND_MARKER`/`GOAL_MARKER`/`MARKER_TOKENS`/`signalLines`/`parseGoalMarkers`/`stripGoalMarkers`），改为 `import ... from "../public/goal-markers.js"` 并 `export {...}`，对外 API 与行为不变；不再 import 已无用的 `cutSpans`/`maskCode`。
- `public/app.js`：新增 `import { stripGoalMarkers } from "./goal-markers.js"`；成稿路径（历史/快照）改为 `stripMemoryTags(stripGoalMarkers(raw))`，流式路径改为 `stripMemoryTags(stripGoalMarkers(item.raw, { streaming: true }), { streaming: true })`。顺序与后端 `bodyText` 一致：先剥协议标记 → 再剥记忆标签 → 再拆答复。
- `src/server.js`：静态路由登记 `["/goal-markers.js", "public/goal-markers.js"]`。

不把 goal 标记并入 `memory-tags.js`：两者语义不同（死标签 vs 协议标记），合并会破坏「先剥死标签 → 再解析协议标记」的既定顺序。

### 回归测试

新增 `tests/goal-markers.test.js`（5 条）：严格判定口径（围栏/波浪围栏/缩进/行内/大写变体/标记后有内文/两个标记同行/模型多写的闭合形式都不算信号）；剥离（含闭合写法、空标签对、代码区原样保留）；流式半截隐藏 vs 非流式按字面保留；前后端共用同一份实现（`src/goal.js` 导出的函数与模块同一引用 + app.js 源码级 import 断言）；页面集成（真实渲染管线：成稿、流式、代码区讲解、用户手写同名文本各就各位）。

「修复前失败」证据：`git stash push -- public/app.js` 后跑该文件 → 展示层断言 `AssertionError: 成稿不显示完成标记原文 / actual: true, expected: false`（标记确实渲染给用户），共 2 条失败；`git stash pop` 后 5/5 通过。

连带：8 个页面测试挂具的 publicSource 清单加入 `goal-markers`，`goal-ui`/`goal-command-ui` 加 `stripGoalMarkers` stub，`model-onboarding-ui` 的 memoryTagsSource 同步，共 11 处。

### 涉及文件

- 新增：`public/goal-markers.js`、`tests/goal-markers.test.js`
- 产品代码：`src/goal.js`、`public/app.js`、`src/server.js`
- 测试：`tests/goal-markers.test.js`（新）、`tests/app.test.js`、`tests/compaction-ui.test.js`、`tests/goal-command-ui.test.js`、`tests/goal-ui.test.js`、`tests/manual-retry.test.js`、`tests/memory-ui.test.js`、`tests/message-activity.test.js`、`tests/model-onboarding-ui.test.js`、`tests/model-thinking-favorites.test.js`、`tests/remote-ui.test.js`、`tests/workspace-tabs.test.js`
- 工具：`.pi/skills/codebase-map/scripts/reindex.mjs`（登记两个新文件）、`.pi/skills/codebase-map/INDEX.md`（重建，155 文件 0 未登记）
- 文档：`README.md`（goal 标记展示口径与共用实现）、`devlog.md`（本条）

### 验证

- 定向：`tests/goal-markers.test.js` 修复后 5/5 通过；索引一致性测试通过（含关键符号与横切常量断言）。
- 全量：`npm test` → **tests 537 / pass 535 / fail 0 / skipped 2**（新增 5 条即本轮；两条 skip 为既有 win32 平台守卫，与第 3、5 轮基线同为 2）。
- 表结构影响：无。本轮未增删改任何表或字段。
- 临时文件：`probe6.tmp.mjs`、`probe6b.tmp.mjs` 已删除。

## 2026-09-14 — 工作空间能力选择持久化与隔离

- 修复旧目录记录缺字段导致新勾选未保存：按 selection schema 合并补丁，项目技能并入目录完整 selection；继续复用 SQLite store 表，每套配置一行，落盘成功才更新内存。
- skills/MCP/插件按当前目录清单校验；全局编辑不列项目资源，前端不补外项目/不可用能力为可选项，补充来源标签。发现清单每次按目录刷新，默认选择热生效，不覆盖已有会话的能力配置。
- 涉及 src/sessions.js、src/capabilities.js、src/server.js、public/app.js 及对应测试、README.md、代码索引与坑库。
- 验证：npm test：536 项，534 通过、2 跳过、0 失败。


## 2026-09-15 新增单子任务取消工具

- 原因：子代理工具长时间不返回时，主代理缺少只中断该任务的工具，追加指令不能代替取消。
- 决策：新增 cancel_task({taskId})，仅作用于当前会话指定任务，复用 agent.abort 与任务结果/通知流程；保留已有历史，不回滚外部副作用，不增加 UI 或默认超时。
- 涉及：src/tasks.js、src/tools.js、src/prompts.js、src/goal.js、任务与目标相关测试、README.md 及代码索引/坑库。取消回执不作为 Goal 验收证据。
- 验证：最终 npm test 共 547 项，545 通过、0 失败、2 项既有平台跳过；独立复核发现回执从 id 改为 taskId 后旧断言遗漏，已修正并补首个回执断言；集成测试验证工具注册、目标 abort、兄弟隔离、结果先落库后通知。node --check 与 git diff --check 通过。未新增依赖，未重启运行中的服务。

## 2026-09-15 前端区域边界与稳定模型菜单
- 文件：public/app.js、public/model-picker.js、tests/frontend-regions*、tests/model-picker.test.js 及引用旧 controls 的测试。
- 原因：无关输入/输出触发全区同步重建菜单；正文滚动旧监听关闭模型菜单；设置迟到回执可能覆盖新面板。
- 改动：拆 controls、去掉无关 syncAll；选项比较与缺失占位、稳定键焦点/滚动恢复、完整 picker dispose；请求代次守卫；权威归并成功才推进 seq。保留共享收藏 syncAll 和连接可用性扇出，不新建状态框架。
- 验证：浏览器 41 项通过；专项 19 项通过。首轮全量604通过/1失败/2跳过，失败来自远程设置测试未真实打开 dialog，已修正测试场景并保留原断言，等待最终全量复跑。
- 限制：03订阅接线、05/06算法及Electron成品不在本次实现；热加载单独接线/提交。两项追加委派因宿主插件加载失败，由主任务补测。

## 2026-09-15 独立 Vite 开发入口
- 文件：scripts/dev-vite.mjs、scripts/service.mjs、package*.json、tests/dev-vite*、README、索引。
- 决策：Vite 8.3.0 仅devDependency，独立5173代理隔离4320；业务WS和开发WS分离，前端不管理后端进程。先校验同源再改写代理头；正式CSP不动，开发限定样式注入与loopback维护访问。
- 有意阶段性收窄：草稿、附件、阅读锚点尚无可靠跨刷新保存，暂停JS/HTML整页自动刷新并明确提示，未冒称无损HMR。保留CSS热替换，不额外造保存框架或业务reload协议。
- 验证：分区提交全量608通过/0失败/2跳过；Vite专项通过，真实Chromium验证CSS保留草稿和页面、JS刷新暂停、后端身份不变。最终全量另行复跑。
## 2026-06-01 — WebSocket 基础设施收口

- 原因：app.js 的 socket/pending/重连/事件水位分散，回执到快照渲染有空窗；广播与删除通知绕过缓冲限制，监听异常能冒泡进业务。
- 内容：新增 public/transport.js、src/transport.js；app.js 删除旧 ws、pending、requestSeq、reconnectTimer、acceptEventSeq、snapshotQueue 与 drainSnapshotQueue，统一由通信层持有连接、清理请求、提交水位和订阅；server.js 所有发送接入 sender，快照携带 instanceId，拒绝过时 attach；sessions.js 隔离同步/异步监听失败。
- 入口清单：登录 -> transport.connect；所有页面 request（含注入 question/file-picker/model-manager/service-settings）-> transport.request；models.* -> subscribe；snapshot -> begin/commit/failSnapshot；服务端回执/会话事件 -> sender.send，模型广播/删除通知 -> sender.broadcast。
- 决策：不加依赖、不加第二条业务连接、不加应用优先级队列，不改协议 seq 含义。归并失败停止后续事件并受控重快照，不再吞错推进；32 MiB 单帧上限会限制超大历史快照，明确留给 05 分页恢复，不用无限重下载掩盖限制。自动恢复上限 5 次，维护超过窗口后手动恢复。
- 复核修复：断线作废旧渲染尾部；等待旧初始化退出再建新连接；重连坏会话回落初始化；跨工作空间打开后恢复本页订阅；bfcache pagehide 不销毁通信层；1009 清空队列。
- 测试：新增 tests/realtime-transport.test.js，迁移 public-source 夹具与 app/goal/model/remote/snapshot 集成用例；全量 npm test 验证，未运行真实业务服务或模型，未安装依赖（仅 junction 复用已有 node_modules）。同步 README 与 codebase-map 架构/模块索引。

## 2026-09-15 功能分支同步最新 master 与最终复验
- 合入 origin/master 的03连接基础设施；冲突保留 createTransport 唯一连接/水位/快照队列，删除本分支被替代的 appliedSeq/acceptEventSeq/旧WS监听，区域可用性接 onState；非bfcache离页释放 modelPicker。
- 最终合并后全量616通过、0失败、2跳过；两组真实Chromium专项均通过。仅推送 feat/frontend-regions，按统一集成例外保留 worktree，不改动/推送 master。
- 未完成：JS/HTML自动刷新与跨刷新完整保存（当前明确暂停）；Electron成品验收和真实模型长流性能采集。

## 2026-09-16 运行时集成最终接线
- 按接线指南依序合并 smooth-stream、history-performance、frontend-regions、desktop-runtime；共享渲染以 06 为准，历史只读读取与 05 分页合一，保留应用内标签。
- 修复自动合并遗漏的 snapshot.sessionId 与旧页状态 controls 调用；只读分页裁剪任务/压缩/重试并补回归测试。
- src/update.js/main.js/server.js 与 public/service-settings.js 接入稳定 Release 手动检查和可信下载链接；缺平台安装包必须报错而非最新，禁止桌面 npm 重启/更新。package.json 产物名称包含平台架构。
- README、六份计划及集成指南同步实现状态，索引重建。文档子任务未完成编辑，主代理完成补写。
- npm test 689项：687通过、2既有跳过、0失败；三个浏览器脚本通过。Windows NSIS 构建及随包 Node/真实窗口隔离冒烟通过。构建默认源超时，镜像成功；一次 stage LICENSE 网络重置后重试成功。
- 未完成发布门禁：正式签名/公证、成套备份与安装回退、macOS本轮构建和实机验收；不宣称正式稳定发行。产物和日志归档到 F:/deliveries/Axiom-runtime-integration。

## 2026-09-16 工作区折叠分组侧栏
- 侧栏会话列表改为按工作区分组折叠展示。包装一层现有的 renderSessions 逻辑（进行中/已完成分组、日期分隔、排序、状态点、操作菜单完全不变），外层加可折叠的 `<details>` 工作区头。
- 当前工作区默认展开、其他折叠；折叠状态持久化到 localStorage `axiom.openCwds`。
- 工作区头显示目录 basename、完整路径 tooltip、运行中 ◉ 徽章、待查看 • 徽章、hover 出现的 ＋ 新建按钮。
- 搜索跨全部工作空间（匹配会话标题），搜索时不显示空工作区组。
- 已完成（hiddenSessions）保留在每个工作区内部的折叠区域，状态按工作区独立持久化。
- 涉及文件：public/app.js（renderSessions 重构、normalizeCwd 工具函数、openCwds 状态）、public/style.css（workspace-group/workspace-header/workspace-badge/workspace-new-btn 样式）、public/index.html（搜索占位文本）、tests/app.test.js（其他工作区会话可见性断言调整）、tests/workspace-tabs.test.js（同）、tests/session-sidebar-ui.py（全面适配新 DOM 结构：工作区分组断言、折叠展开测试、内部列表范围限定）。
- 优化：工作区头改为两行布局 — 顶行 13px 加粗名称 + 徽章 + 新建按钮，第二行 11px 等宽字体显示完整原始路径（muted 色），遵循 Linear 设计风格（-0.2px letter-spacing、6px 圆角、紧凑间距）。app.js 新增 wsOriginalCwd Map 保留原始路径用于展示。

## 2026-09-16 连续会话与实时渲染修复

- 原因：60条展示预算使实时事件停绘并触发整页 attach；historyLoading 期间吞掉展示更新，重建同时关闭子代理弹窗。
- 改动：app.js/index.html 改连续上滚预取、首屏补齐、历史前插保持节点与滚动锚点；移除实时预算和加载期间停绘；跨窗口工具结果节点回归调用位置；stream-renderer.js 折叠过程懒渲染；style.css 屏外 content-visibility。
- 决策：不缓存派生HTML文件，保留服务端原文为权威；已加载DOM会随上滚增长，不宣称硬上限虚拟化。复用现有主题、字号和间距，不新增视觉主题。
- 验证：新增 continuous-history.test.js / continuous-preview.mjs / continuous-ui.py；更新 snapshot、memory、stream-renderer 回归。全量 694 项，692通过、2跳过；Chromium 桌面/390px手机通过连续前插、节点保留、滚动补偿与无页面错误检查。README、索引与坑库同步。

## 2026-09-16 连续历史补充审查
- 修复 public/app.js 前插历史后 mainItems 顺序、旧页压缩摘要和重试卡遗漏；恢复子代理正文分组。新增 history-prepend-records.test.js，扩展测试 helper。
- 全量695项：693通过、2跳过。README/索引/坑库同步。
- 清理前一worktree时 Windows junction 被递归处理导致主目录部分依赖缺失；已通过独立 npm ci 安装并 robocopy 仅补缺失文件恢复，不终止在用进程。后续不使用 git worktree remove 清理含联接目录。

## 2026-09-17 会话复制与侧栏分组折叠
- 新增「复制会话」：后端 `session.duplicate` 协议命令（src/protocol.js、src/server.js 分发、src/sessions.js 实现）——服务端把主历史 JSONL 与全部子任务历史复制成新会话（副本文件绝不引用源路径，删除源不影响副本），配置沿用源会话，标题原名接序号（xxx → xxx 1，复制「xxx 1」也回到同一条 xxx N 序列）；运行中/无已落盘历史/未启用存储均拒绝。副本不接管未完成子任务、不重发完成通知（与 goal 退出同一 notified 口径）。
- 侧栏三组（置顶/进行中/已完成）统一为可折叠 `<details>` + 计数徽章：空组不渲染（置顶/已完成）；折叠状态按工作区记入 localStorage `axiom.sessionGroups`，渲染时同步固化 + toggle 双保险；已完成展开时限高 45vh 组内滚动，整体滚动交给 #sessions。
- 前端 app.js：操作菜单插入「复制会话」（禁用条件集中 duplicateBlocked()：断连/切换中/运行中/无 sessionFile，渲染与 updateNavigation 共用）；原「复制」改名「复制文件」。
- 顺带修复：duplicateTitle 把源标题计入 taken，副本绝不与源同名；移动端（≤700px）点击复制后自动收起侧栏属既有行为，py 断言改在桌面视口下验证。
- 测试：session-flow.test.js 新增 duplicate 全行为用例（复制/序号/独立性/重启恢复/拒绝路径）；server.test.js 补协议分发；app.test.js 调整空组断言 + 复制 mock；conversation-preview.mjs 补 duplicate mock 与 sessionFile；session-sidebar-ui.py 改造为分组折叠/计数/限高/复制断言，并修复 master 上本就漂移的断言与 320px 轮次从未跑通的 toggle 路径（先点 #mobile-expand 再开侧栏）。
- 验证：npm test 696 项全绿（694 通过、2 既有跳过）；4399 预览上 session-sidebar-ui.py PASS。README 同步侧栏/菜单/协议/测试指引。

## 2026-09-17 委托纪律提示词与通知双通道

- 内容与原因：修复已观察到的委托死锁环——主代理把"You are responsible for verifying key findings"当亲自调研的许可证（单会话 42 次 read/rg），叠加通知只在 idle 投递的守卫，主代理收尾被"Do not use a promise to act"锁死后 status 恒 running，子任务完成通知永久无法送达。三管齐下：① 系统提示词重写 Delegation 段（信息收集全域走 delegate、spot-check 替代亲自验证、收尾例外允许通知唤醒）；② delegate 工具返回值提示"继续无关工作或收尾等通知"；③ 通知改双通道。
- 通知双通道：主代理 running 时子任务完成经 `session.sendCustomMessage`（customType=task-notification，deliverAs steer）注入 steering 队列，SDK 在轮次边界（安全点）送达，不打断在飞工具，当前 run 自动延长到通知消化完（`_handlePostAgentRun` 抽水）；idle 时保持原 prompt 唤醒路径。送达确认（notified 置位）移到 run 收尾的 `settleTaskNotifications`：以消息历史中存在对应 custom 通知为准，未进历史（clear_queue 误清、滞留队列）保持未通知并自动补投，文本幂等、read_result 靠 resultId 校验。安全停止/goal 暂停的 notificationsPaused 冻结语义不变。
- 前端通知显示：不再隐藏。新 custom 通知与旧 user+前缀通知统一识别（isTaskNotification），以独立通知条（.task-notification，accent 左边线）渲染，与用户消息区分；实时路径（agent.message.end）与历史回放（placeSnapshotMessage）同构处理，通知占 goal 锚点槽位但不 anchorGoal，下标与 live 侧一致。原文面板标注"内部任务通知"。
- 能力分流：主代理（customTools 非空）loader 不装配导航类技能（MAIN_EXCLUDED_SKILLS=["codebase-map"]），系统提示不出现其可用性；选择集不变，子代理 inherit 时仍装配全部选中技能；skillsOverride 闭包实时计算以兼容 refreshProjectSkills 的运行时扩充。
- 涉及文件：`src/prompts.js`（Delegation/Response format/SUBAGENT_PROMPT 英文终稿）、`src/tools.js`（delegate 返回 note）、`src/pi.js`（queueStateOf 归一 string content、messageEntries 纳入 custom_message、notifyTask、refreshSkills 排除）、`src/sessions.js`（双通道 deliverTaskNotifications、settleTaskNotifications、startRun 挂接）、`public/app.js`（isTaskNotification/taskNotificationCard/实时与回放分支/删隐藏 hack/paintRaw 标注）、`public/style.css`（.task-notification）、`src/capabilities.js`（MAIN_EXCLUDED_SKILLS 分流）、`tests/task-notifications.test.js`（双通道两用例、fixture notifyTask）、`tests/app.test.js`（通知条断言替代隐藏断言）、`README.md`。
- 决策：模型层无法区分 custom 与 user（SDK convertToLlm 把 custom 转普通 user 原文），custom 收益在存储/UI 分型；不引入 wait_result/sleep 规则（root fix 后症状自消）；triggerTurn 弃用（绕过 startRun 状态机会撒谎 status、丢收尾、双 run 并发）；通知不隐藏，与用户消息以样式区分。
- 验证：`npm test` 698 项 696 通过 0 失败（2 skip 为既有）；新增用例覆盖 running 注入+settle 确认不重投、误清补投走 idle 通道；capabilities/project-skills/app/safe-stop 等回归全过。

## 2026-09-17 恢复历史重排后的收尾

- 合并 master（9b0f4d2/83fa04e）后 session.duplicate 用例失败：副本走 create() 恢复路径，messages 从 JSONL 重建触发 orderRestoredHistory；夹具子任务由 saveTask 落库、主历史无 delegate 锚点，无关联子消息按设计前置。判定为有意设计在副本路径的自然延伸，非回归。
- 更新断言为 [s1,s2,u1,a1] 并补 at(-1)=main（无锚点副本最后仍是主回答）；带真实 delegate 锚点的会话子历史仍归位到声明点之后（restored-history-order.test.js 覆盖）。
- 涉及文件：tests/session-flow.test.js、knowledge.md（追加）。
- 验证：npm test 699 项全绿（697 通过、0 失败、2 既有跳过）。

## 2026-09-17 侧栏视觉对齐 Linear

- 内容与原因：侧栏观感陈旧（三个描边按钮堆叠、hover 用 --surface 与侧栏底色相同导致完全不可见、品牌行是纯文本、展开指示符是 "▶" 字符、行高 40px 偏松）。按 Linear 设计规范与成熟侧栏（VS Code/Linear/ChatGPT）语汇重构：品牌行改为 20px 强调色方块 + XIOM 字标；「新会话」保留为唯一主按钮，「打开工作空间/导入会话」降为并排 30px 幽灵按钮；搜索包进 .search-wrap 内嵌框（画布色底+左侧放大镜）；设置按钮换成 gear SVG 钉底部脚注行（ghost 风格）。
- 关键修复：.session-row:hover 改用 var(--hover)（旧值 --surface 与 aside 背景同色，悬停反馈为零，同病还有 .session-group-count 底色）；.workspace-group.current 区分当前工作区（常驻 8% 淡强调底 + 名称提重，非当前降 --body-ink/500）。
- 选中/置顶语汇重做：正在看的会话 = 淡强调底 + inset 2px 主色左键 + 文字 500；置顶 = --raised 底 + 45% 主色左键；叠加规则（置顶+当前）置于其后。会话行 32px 紧凑化（coarse 40px），「⋯」28px 悬停浮现，状态点 8px→6px（#session-alert 共享点类，单独补 8px 兜底）。
- 日期分线改相对标签：app.js 新增 sessionDayLabel()（今天/昨天/前天/N 天前，3-6 天；同年 M月D日；跨年带年份；无效时间「日期未知」），分线加 title 显示精确日期。
- 测试同步：session-sidebar-ui.py 引入 page.clock.set_fixed_time(datetime(2026,9,12))，日期断言改为 ['昨天','前天','3 天前','4 天前','5 天前']；原「已完成段紧挨设置按钮 ≤150px」断言只在旧行高恰好填满 960px 视口时成立，改为验证脚注钉底 + 列表不重叠（紧凑化后列表下方留白属正常侧栏行为）。
- 涉及文件：public/index.html、public/app.js、public/style.css、tests/session-sidebar-ui.py、README.md、devlog.md。
- 验证：worktree 内 npm test 699 项全绿（697 通过、0 失败、2 既有跳过）；session-sidebar-ui.py PASS。

## 2026-09-17 会话标题修复：失败不固化、整轮索要与坏会话自愈

- 现象与根因：9/17 凌晨起 5 个会话侧栏标题退化为首条消息前 60 字（含 `[imageN]` 前缀）。排查结论：标题靠主代理自报 `<title>` 行，指令经 pi 层 memoryState.pending 只注入当次 run 的首个 LLM 请求、消费即失效；出问题会话首轮回复直接委派、没带标签，而 sessions.send 早已把 titleRequested 固化为 true，run 结束全量快照落库后永不重试。非代码回归（标题链路 9/16 以来无改动），是「一次性注入 + 一次机会 + 失败永久固化」的设计脆弱点撞上模型合规率波动。
- 修复：① 索要开关改由 memoryHooks.wantsTitle()（闭包读 item.titlePending）实时提供，context 钩子对标题未定案的整轮每次请求（含工具后续轮）都注入 TITLE_INSTRUCTION，自报成功即停；删除 memoryState.pending 一次性消费机制与 prompt 的 titleRequest 选项。② titleRequested 语义改为「标题已定案」：只在 onReply 真正提取到合法标题时置 true 并随 change.title 同笔落库，send 不再提前固化，失败后下一条消息自动重试。③ 恢复自愈：create() 恢复时 titleRequested 为 true 但标题超过自报上限（必为旧兜底）且非手动命名的视为未定案重新索要，存量 5 个坏会话下一条消息即自动修复。④ 兜底标题剥掉 `[imageN]` 占位符，纯图片回退「[图片]」。
- 涉及文件：src/pi.js（context 钩子、memoryState、prompt）、src/session-memory.js（wantsTitle、onReply 定案、复用导出的 TITLE_MAX）、src/sessions.js（fallbackTitle、send、恢复愈合）、public/memory-tags.js（导出 TITLE_MAX）、tests/session-memory.test.js（重试/自愈/占位符回归）、tests/pi-memory.test.js（整轮注入断言重写）、tests/image-input.test.js、.pi/skills/codebase-map/INDEX.md（测试期自动重建）、README.md、devlog.md。
- 决策：不引入独立标题总结模型调用（保持零额外请求）；愈合用长度启发式——新语义下 titleRequested=1 只伴随 ≤10 字自报标题，超长必是旧兜底，titleManual 短路排除；enqueue 走 SDK 层 followUp 不经标题逻辑，维持现状。
- 验证：worktree F:/worktrees/Axiom-title-retry 内 `node --test tests/*.test.js` 700 项全绿（698 通过、0 失败、2 既有跳过）；新增用例覆盖首轮漏报→下一条消息重试→自报定案、旧坏会话重启自愈、`[image1]` 占位符剥离、整轮（含工具轮）持续注入。

## 2026-09-17 会话统计恢复、计费与输入区详情优化

- 时间：2026-09-17 UTC（本机核对时间 2026-09-16 23:54 -0700）。原因：历史只读快照缺 runtime；移动选择区和统计横滚隐藏信息；模型 cost 仅支持高级 JSON；主代理详情平铺难读。
- 内容：只读恢复最近已报告 usage 与压缩后上下文估算；主会话全 entries 按模型累计费用，工具/摘要分桶；模型管理四项价格输入与非负校验；输入区 flex 自动检测可用宽度换行；双页签主代理详情、逐层折叠 JSON、独立账单。
- 决策：保留有效 SDK 上下文，缺失 token 数时也在活跃路径标注估算（有意更新旧 null 测试契约）；不把当前价格追溯到历史、不把 SDK 全零费用伪称免费；不含独立委托会话。界面沿用 Linear surface/line/ink token、8px 圆角与键盘页签。
- 涉及文件：src/session-billing.js、src/session-history.js、src/sessions.js、src/pi.js、src/server.js；public/session-details.js、app.js、index.html、model-manager.js、style.css；对应 config/app/model-manager/session-history/session-billing/session-details 测试、浏览器夹具及 public-source 装配器；README.md、代码索引与 knowledge.md。
- 验证：npm test 全绿（2 项既有跳过）；新增单测覆盖计费口径、空态、价格非法值和 tiers 保留、安全 JSON 与页签；frontend-regions-ui.py 通过；session-billing-ui.py 在 320/390/768/1280px 检查无横向溢出、统计、页签与账单通过。合并最新 master 后再次验证。
## 2026-09-17 远程 HTTP 复制回退：统一剪贴板入口

- 内容与原因：用户通过浏览器远程连接（Tailscale HTTP）时，「复制文件 ›」等复制操作报「复制失败：Cannot read properties of undefined (reading 'writeText')」。根因是远程地址属非安全上下文，`navigator.clipboard` 为 undefined，而前端 5 处直连 `writeText`（app.js 4 处 + markdown.js 代码块 1 处）都没有防护。修复：新增 `public/clipboard.js` 的 `copyText(text, view)`——Clipboard API 可用时优先使用，被拒绝（如 Firefox 权限门控）或缺失时在目标文档里建临时只读 textarea、`select()` + `execCommand("copy")`、复制后清理并恢复焦点，两条路径都失败才抛错。5 处调用点全部收敛到该入口，markdown 代码块传入 `element.ownerDocument.defaultView` 支持任务弹窗等跨文档场景。
- 涉及文件：public/clipboard.js（新增）、public/app.js、public/markdown.js、tests/clipboard.test.js（新增）、tests/markdown.test.js、tests/git-log.test.js、tests/app.test.js、tests/helpers/public-source.js、.pi/skills/codebase-map/scripts/reindex.mjs、.pi/skills/codebase-map/INDEX.md（重建）、README.md、devlog.md、package.json（0.1.7 → 0.1.8）。
- 决策：页面测试按「剥模块语法拼接 eval 真实源码」的既有装配方式接入新模块——publicSource 的 app 拼接序列加入 clipboard（app 页面测试自动获得 copyText），各 markdown 独立求值点改用 `publicSource("clipboard", "markdown")`，不引入新的 window 注入口。交叉复核（第二个调研子任务）后补强：writeText 被拒绝时也在同一用户手势窗口内继续 execCommand（Firefox 等存在 API 存在但拒绝、execCommand 仍可用的场景），双失败抛可操作文案「请改用系统复制菜单」而不透传内部错误。
- 验证：worktree F:/worktrees/Axiom-clipboard-fallback 内 `npm test` 705 项全绿（703 通过、0 失败、2 既有跳过）；新增 4 项剪贴板用例覆盖 API 优先、writeText 被拒绝后 execCommand 回退、跨文档复制与可操作失败文案，markdown 按钮级补了「删除 clipboard 注入后回退仍复制原文」回归。Playwright 实测 Chromium：无 Clipboard API 与 writeText 被拒绝两种场景，代码块/工作空间复制均回退成功且清理临时输入框。

## 2026-09-17 会话总账与详情阅读 v2

- 内容与原因：上一版详情占用输入区过多且未计入子代理费用。改为两行轻量入口打开独立原生详情弹窗；配置提供提示词/工具注册页签、工具搜索、可折叠 JSON。账单以总额、代理分项、模型明细组织，任务卡与任务详情各显示本任务费用；字号与触控高度按 Linear 规范复核。
- 涉及文件：src/session-billing.js、src/sessions.js、public/session-details.js、public/app.js、public/index.html、public/style.css、tests/subagent-billing.test.js（新增）、tests/session-details.test.js、tests/session-persistence.test.js、tests/app.test.js、tests/conversation-preview.mjs、tests/session-billing-ui.py、tests/conversation-ui.py、README.md、.pi/skills/codebase-map/knowledge.md、INDEX.md。
- 决策：保留 runtime.billing 单代理语义，新增快照 billing 与 session.billing 事件统一汇总全部子任务；覆盖而非增量相加，避免重复。恢复按每个代理的完整 JSONL entries 重算，缺文件回退最后已知任务账。独立弹窗避免手机输入区内外双滚动，费用仍是估算而非实际扣款。
- 验证：npm test 712 项（710 通过、2 项平台条件跳过）；session-billing-ui.py 在 320/390/768/1280px 验证页签、JSON、总账与任务账单，实际截图核对 $0.023 = 主代理 $0.012 + 子代理 $0.006 + $0.005；frontend-regions-ui.py 通过。用户明确选择继续修复旧 conversation-ui.py：修正 hash 路由优先级（原测试未真正切换 fixture）、撤销事务前置、移动展开及活动组展开、双层吸顶/弹窗 static 断言、过时折叠图标和等待/工具状态动画目标；支持 PREVIEW_PORT 隔离端口。最终在独立 4397 端口完整通过 1440/390/320px、浏览器错误为零。
- 合并复验（2026-09-17）：同步 origin/master 3f181e9，随后再次合入 941b673（macOS CI 路径修复）并完整重跑以下验收；保留双方开发日志并重建索引；适配最新未锚定任务设计，conversation-ui.py 改验底部禁用运行条与动画，不再要求不存在的主轴卡片。npm ci 成功，npm test 719 项（717 通过、2 跳过、0 失败），账单四档宽度、frontend-regions-ui.py 与 conversation-ui.py 全部通过。

## 2026-09-17 会话渲染一致性修复：分页/位置/卡片位置/乐观发送

- 时间：2026-09-17。分支 `feat/session-render-consistency`（worktree F:/worktrees/Axiom-session-render-consistency），计划与决策全文见 `docs/session-render-plan.md`。
- 现象：回到最早后读不回最新；切走切回位置丢失；重启后主对话被 subagent 记录挤空；卡片位置反复丢失落到时间线末尾；发送大内容卡顿。
- 内容（三阶段提交）：
  - `851b28b` 服务端：pageOf 窗口预算改按主记录计（1..200，默认 60），子代理记录随委派锚点整组进出；单页记录上限 400，超限裁子代理记录并下发 truncatedTasks；每次分页重建 messageId 索引（投影数组使增量索引失效）；sessions.js 读时投影 projectTimeline（live 到达序不动，仅窗口下发重排，孤儿前置）；pageRetries anchorEntryId 优先；新增 translateRetries 把 live 重试 messageCount 换算到投影下标。
  - `b4a4d52` 前端：paintHistoryControls 分页条在旧页/加载/有新消息常驻（前向入口曾因 2f25500 无条件隐藏）；prefetchForward 近底部前向预取（historyDirty 时假游标 pending 不进请求）；pendingAnchorRestore 挂起登记 + changing=false 的 finally 冲刷（锚点恢复曾被 changing 守卫吞掉）；移除 finishSnapshot 对未锚定运行任务的末尾追加，入口收敛到 #task-runs（行在入口缺席本页时禁用）；实时子代理消息渲染后立即 placeCompactedTasks 归位；visibilitychange 分视角（贴底追新/旧页保位）；markTruncatedTasks 截断声明。
  - `fdf1263` 发送：乐观卡「发送中」提交即上屏（nextPaint 先绘制再序列化，测试无渲染环境靠 64ms 兜底 + paint() 驱动）；prompt 回执 runId 绑卡，agent.message.end(user) 按 runId 声领原位升级（无 runId 单槽假设）；response_error 撤卡保草稿，unknown 保留卡标「发送结果未确认」；beginSnapshot 重置槽位；旧页提交先派发 prompt（transport 同步序列化发送），历史回最新并行不阻塞。
- 涉及文件：src/session-history.js、src/sessions.js；public/app.js、public/style.css；tests/history-main-budget.test.js（新增）、tests/send-optimistic.test.js（新增）、tests/history-reading.test.js（重写 1 项 + 新增 5 项）、tests/session-history.test.js、tests/app.test.js（提交点补 paint() 驱动）；README.md、docs/session-render-plan.md（补实施结果）。
- 决策：不做整会话静态渲染文件（服务端原文唯一权威）；乐观卡只做占位+原位升级，绝不按文本对账、不伪装已确认；渲染管线（rAF 批处理/epoch 取消/隐藏 park）不推倒重做；虚拟化与增量解析延后（需真实浏览器实测）；不升 CURSOR_VERSION（游标只在前端内存）。
- 验证：worktree 内 `npm test` 726 项全绿（724 通过、0 失败、2 既有跳过）；service-settings 的真实 HTTP 契约用例在全量并发下偶发一次，单独重跑通过，非本次改动引入。

## 2026-09-18 Phase D 渲染容量与发送链路：有界 DOM、页级缓存、增量剥离、Worker 序列化

- 时间：2026-09-18。分支 `feat/session-render-phase-d`（worktree F:/worktrees/Axiom-session-render-phase-d），计划、调研与实施结果全文见 `docs/session-render-phase-d.md`。
- 原因：上一轮会话渲染一致性修复把虚拟化与增量解析明确延后到真实浏览器实测之后。本轮补齐四项容量瓶颈：长会话 DOM 只增不减、翻页重复解析 Markdown、流式每批全文重扫剥离管线、大命令序列化阻塞主线程。
- 内容（五次提交）：
  - `8b0c3a0` D3 流式尾部增量：maskCode 增量缓存（段边界前缀缓存 + 尾窗重扫），goal-markers/memory-tags/answer-tags 各自持有 maskCache；思考面板三面统一节流口径；isPlainText 增量布尔。lexer 增量化与播放器整段重分段刻意不做（引用定义回溯改写、字素簇正确性靠整段定夺）。
  - `e8c13f9` D2 页级渲染缓存：markdown.js 新增 createMarkdownPageCache（LRU 300 条 / 4MiB），renderMarkdown 支持 pageCache/cacheKey；缓存 epoch 为 `sessionId + revision`，只在快照路径挂键，已连接节点当 miss 重渲。
  - `abfd5b7` D1 有界 DOM 窗口：HISTORY_DOM_LIMIT=300，trimMountedWindow 在前插末尾从最新端裁剪，被裁端以 target 整页重挂回载，分页条按真实窗口显示。
  - `f398750` D4 发送序列化 Worker 化：超过 1MiB 的发送体走内联 Worker（返回字符串保 send 接口），全请求经 queueTail 保序链，无 Worker 环境退化同步；单条消息仍原子发送，32MiB 硬限与 send_limit 失败语义不变。
  - `e9a2afa` 真实浏览器暴露的两个 D1 缺陷修复（详见下条）。
- 真实浏览器（500 条混合会话，4× CPU 节流）抓出两个 jsdom 结构上覆盖不到的缺陷：① trimMountedWindow 遇到没有独立 DOM 节点的条目就 break，而工具结果记录渲染进前一条助手卡的过程组、本身不拥有节点，尾部一旦是工具结果裁剪立刻停在 0 条 —— 混合会话永远不裁，500 条全部挂载；改为连同所属主卡一起纳入丢弃集合，并把裁剪边界对齐到拥有自己节点的条目上，保证丢弃 DOM 完整。② prefetchForward 在 `!nextCursor` 时直接返回，而从末页往上翻时 nextCursor 恒为 null，滚底回载只能靠手点分页按钮；改为 trimmedForwardBoundary 存在时也视作有下页。附带效应是裁剪未生效时分页条位置文本恒空，修复后正常显示 `1–300 / 共 500 条`。
- 涉及文件：public/app.js、public/markdown.js、public/stream-renderer.js、public/goal-markers.js、public/memory-tags.js、public/answer-tags.js、public/markdown-scan.js、public/transport.js；tests/markdown-page-cache.test.js、tests/history-page-cache.test.js、tests/history-dom-window.test.js、tests/serialize-worker.test.js、tests/render-capacity-ui.py（均新增）；tests/app.test.js、tests/manual-retry.test.js、tests/remote-ui.test.js 及多处测试环境注入补丁；README.md、docs/session-render-phase-d.md、devlog.md。
- 决策：D1 只裁前插方向（向下本来就是整页替换，天然有界；顶部裁剪需反向滚动锚点补偿，收益不足），代价是实时跟随新消息的方向仍无上限，长时间挂机会话 DOM 继续增长，作为已知边界记录在 README 与设计文档；被裁端回载不沿用 after 游标（服务端签发游标不可伪造，沿用会跳过被裁区间形成页隙），改以被裁第一条为 target 整页重挂；压缩摘要共享的节点不参与裁剪；D2 只缓存派生渲染产物，服务端原文始终是唯一权威。
- 验证：worktree 内 `npm test` 749 项（747 通过、0 失败、2 既有跳过）；新增 `python tests/render-capacity-ui.py` 7/7 通过（窗口封顶 300 条 / 225 节点、滚底 target 重挂降到 90 节点、被裁边界回载在场、滚动 p95 约 0.1ms、按键 p95 约 0.2ms、全展开后仍有界、无页面错误）；`python tests/smooth-stream-browser.py` 16/16 通过确认 D3 无回归。
- 环境事件：主检出 node_modules 里 `@earendil-works/pi-coding-agent/dist/` 曾整体缺失，导致所有 Playwright 脚本（含既有 session-billing-ui.py）集体失败；在 F:/Axiom 执行 `npm install --no-audit --no-fund` 恢复。browser-ui 脚本集体挂掉时先查该 dist 是否存在。

## 2026-09-18 任务通知压缩为单行、桌面输入区默认折叠

- 时间：2026-09-18。分支 `feat/compact-notification-composer`（worktree F:/worktrees/axiom-compact-notification-composer）。
- 原因：子任务完成通知原本按卡片渲染（标题 + `pre` 原文），占多行且居中，在会话里比真实内容更显眼；底部输入区常驻完整形态（模型栏、运行统计、详情入口、快捷键提示）约 270px，长会话阅读时挤压正文。
- 内容：
  - 通知：`taskNotificationCard` 去掉 `h3` + `pre`，只输出固定单行 `任务通知: 子任务完成`（子代理转投补 ` · 子代理`），原文写入 `node.title` 并保留「原文对照」入口；样式从卡片改为左对齐 flex 行 + 5px 强调色圆点，左边缘与普通消息齐平，行文本 12px 并接入 `--conversation-font-scale`。
  - 输入区折叠（仅桌面 >700px）：`composerCollapsed` 状态写到 `#composer` / `.composer-wrap` 的 `data-collapsed`，CSS 在折叠态隐藏 `.actions`、`#session-runtime`、`.session-detail-rows`、`.composer-footer`，`#prompt` 走 `rows=1` + `min-height:0` + `nowrap`（高度交回 CSS，不写 inline height）。mousedown/focusin/input 展开；mouseleave/focusout 起 5s 计时收回；`composerBusy()` 在悬停、焦点在输入区内、补全或上下文菜单打开、有待发图片、Stop/强制停止可见时拒绝折叠。`resizePrompt` 的复用键新增 `collapsed` 字段，折叠态切换会重算。手机端 `mobile-expanded` 机制不动。
  - 实测：折叠 48px、展开 270px，失焦 5s 自动收回（Playwright 1440×900）。
- 涉及文件：public/app.js、public/style.css、tests/app.test.js、tests/prompt-resize.test.js、README.md、.pi/skills/codebase-map/INDEX.md（重新生成）。
- 决策：通知不再展示 taskId/resultId 原文（`title` + 原文对照够用），也不做卡片外观；折叠只改高度不动草稿，不加高度动画（避免抖动）；不用 `:not()` 一把隐藏 `#composer` 子节点，显式列出要收的块，免得连带隐藏已选 Skill 行。
- 验证：worktree 内 `npm test` 749 项（747 通过、0 失败、2 既有跳过）；`tests/prompt-resize.test.js` 新增 2 项折叠用例，用拦 5000ms setTimeout 的 `__collapseTick()` 驱动计时，不真等 5 秒。

## 2026-09-19 折叠态只留运行摘要、任务计时与停止按钮

- 时间：2026-09-19。分支 `feat/collapsed-composer-chrome`（worktree F:/worktrees/axiom-collapsed-composer-chrome）。
- 原因：上一轮折叠把整条 `.actions` 与 `#session-runtime` 一起收掉，结果折叠态既看不到缓存命中/上下文/模型这组运行摘要（判断状态要先展开），任务运行中又因为 Stop / 强制停止被收起而整块豁免折叠，等于长任务期间折叠形同失效。用户明确要求：折叠态不显示左上角三个图标，保留运行摘要行，右上角任务计时与右下角两个停止按钮都是需求。
- 内容（纯 CSS + 一处 JS 豁免条件）：
  - 折叠态（`min-width: 701px`）隐藏清单改为：`.session-detail-rows`、`.actions` 内的 `.selectors` / `#send` / `#send-steer` / `#send-followup`、`.context-bar > .icon-group`（+ / 图片 / 目标三枚）、`.composer-footer`。
  - 保留：`#session-runtime`（改 `padding: 0 20px 10px` 与折叠输入框同左右缘，`nowrap` + `overflow:hidden`，挤不下裁末尾而不换行撑高）、`#task-timer`（右上角，空闲时本身 `hidden`）、`#context-chips`、`#image-attachments`。
  - `.actions` 折叠态改 `justify-content: flex-end` + `padding: 0 20px 8px`，只剩 Stop / Force 靠右下；两个按钮都 `[hidden]` 时用 `:not(:has(> #stop:not([hidden]), > #force-stop:not([hidden])))` 把整条收掉，空闲不留空 padding。
  - `composerBusy()` 去掉 `!$("stop").hidden || !$("force-stop").hidden`：停止按钮在折叠态里本来就在，运行中不必再豁免折叠。
  - 实测（Playwright 1440×900，goal-preview）：空闲折叠 76px（一行输入 46.4 + 摘要 27.6）、运行中折叠 116px（多一条 40px 停止按钮行）、展开 269.6px；折叠态 `.icon-group` 与 `#send` 不可见，`#task-timer` 在 x≈1344、Stop/Force 右缘距输入框右缘 20px。
- 涉及文件：public/style.css、public/app.js、tests/prompt-resize.test.js、tests/goal-ui.py、README.md。
- 决策：不调 DOM 顺序（停止按钮留在输入框下方一行，不为「绝对贴右下」重排结构）；`#context-chips` 与图片附件继续保留，否则待发上下文/附件会失联；折叠态样式断言走 CSS 文本正则（jsdom 不跑 media query），与 `goal-command-ui.test.js` 的图标组断言同一路子。
- 验证：`npm test` 742 项（740 通过、0 失败、2 既有跳过），其中 `tests/prompt-resize.test.js` 7 项含新增的折叠态样式守护；`python tests/goal-ui.py` 全绿（普通会话/新会话/图标组三处断言前先点 `#prompt` 展开，因为桌面折叠态图标组本就不可见）。

## 2026-09-19 压缩摘要三层引文核验（逐字校验/已核验附录/原文快照）
- 时间：2026-09-19。分支 `feat/compaction-evidence`（worktree F:/worktrees/axiom-compaction-evidence）。
- 原因：SoL-Pi 四机制调研收尾后，把 EPR（evidence-preserving reducer）里唯一与本仓库目标函数（注意力质量）兼容的设计——逐字节引文校验——移植进 AXIOM 后台压缩。EPR 整体不接（相关性缩减可靠性存疑、首抹即替换无纠错基础），但其「摘要声称的事实必须机械可对账」的纪律能补上压缩最大的缺口：摘要无法验证、漏抄无声。
- 内容（三层：校验 → 附录 → 快照）：
  - `src/prompts.js`：`summaryRequest` 输出格式改为末尾依次三个标签，新增 `<axiom_compact_facts>` 指令段——5–30 行、每行一条、逐字连续复制对话或上次摘要原文、保标点空格、禁转述/合并/编造、每行 <300 字符、选路径/命令/值/报错行/用户明确决定，并明说「未逐字出现的行会导致整份摘要作废」；同时允许引用旧摘要里已核验引文附录的引文行，禁止复制附录标记本身。
  - `src/compaction.js`：`parseSummaryOutput` 新增 facts 块提取（无块/未闭合/空块都不出 facts 键，向后兼容既有形状；bullet 前缀原样保留）；新增 `validateFacts` 导出（先原样 indexOf、再剥 `^[-*]\s+` 降级匹配；命中会话语料记程序计算的行号，仅命中上次摘要记 `line:null`；dedup；任一 miss → `{ok:false, missed}`）。`onTurnEnd` 在 flight 上记 `corpus`（= `serializeConversation(convertToLlm(messagesToSummarize))`，与摘要模型所见逐字一致）与 `previousSummary`；成功回调里 facts 存在且非空时先核验，失败 → 整单作废、报告 failed、保留原文（不删坏行留其余，防「编十条留九条」）。`maybeApply` 里 `writeConversationSnapshot`（sessionFile 真值才写 `<dir>/compaction-snapshots/snapshot-<sha256前16>.txt`，内容寻址、失败返回 null 不阻断）+ `appendVerifiedFacts`（附录带行号随摘要进上下文、回读指引写摘要末尾而非系统提示词——路径每次压缩不同，指引紧邻引文、随会话持久化）；附录计入体积校验；`details` 与 data 事件新增 `facts`/`snapshotPath`。
  - `tests/compaction.test.js`：新增 5 项——parseSummaryOutput facts 提取（存在/缺失/未闭合/空块/bullet 保留/超长行过滤/30 行上限）、validateFacts（行号/漏检/前摘命中 line:null/会话优先/bullet 降级/dedup）、summaryRequest 含第三标签与核验后果、合法 facts 集成（持久 SessionManager.create 会话：附录行号、快照文件内容即渲染原文、details/事件/上下文同构）、编造引文集成（整单作废不落盘、下个 turn_end 自然重试通过）。
- 涉及文件：src/prompts.js、src/compaction.js、tests/compaction.test.js、README.md、devlog.md。
- 决策：facts 缺席 = fail-open（只丢这层校验，与「模型不守格式只丢元数据」哲学一致）；facts 存在且引文造假 = 整单作废（激励干净）。回读指引写在摘要里不进系统提示词（EPR 的 readback 注记与 SDK bash 截断注记都嵌在产物本体）。附录用纯文本标记 `已核验引文（...）:` 不用标签，防标签随 previousSummary 回注自我强化。行号由程序计算不信模型自报。测试中 keepRecentTokens 会保留最后一条消息，被摘要语料只含前两条——第三条引文被校验正确拒收，恰好验证语料边界就是模型所见。
- 验证：`npm test` 749 项（747 通过、0 失败、2 既有跳过）；`tests/compaction.test.js` 27 项（22 项既有全数通过，证明无 facts 的旧 mock 路径不受影响）。

## 2026-09-19 修复 context-menu-ui 与 service-settings-ui 两个失效验收脚本

- 时间：2026-09-19。分支 `feat/fix-ui-scripts`（worktree F:/worktrees/axiom-fix-ui-scripts）。
- 原因：两个浏览器验收脚本自 9-12 前后持续失败被搁置，均判明为脚本对产品改动的假设过期，产品无 bug：`context-menu-ui.py` 等待 `#context-results button` 超时（结果列表不渲染）；`service-settings-ui.py` 断言 `.settings-layout` 自身可滚动失败，且此前死在第一个视口，移动端分支从未执行过。
- 内容：
  - `tests/context-menu-ui.py`：主因——`47a4b57` 在 `renderContextResults` 前插入了 `fuzzyHit`，恰好落在测试两段 app.js 源码切片的空档里没被注入，`renderContextResults` 首行过滤即抛 `ReferenceError`，`#context-results` 永远为空；切片起点从 `"function renderContextResults("` 改为 `"function fuzzyHit("`。次因（390px 轮才暴露）——`403e140` 的移动端折叠 CSS 把 `.composer-wrap` 下非 `#composer` 子元素 `display:none`，`.context-bar` 与 `#context-menu` 都在其中；setup 给 `.shell` 加 `mobile-expanded`，`#add-context` 的 cssText 补 `z-index:100`，避免被展开的 `#model` select 挡住点击点。
  - `tests/service-settings-ui.py`：`620cb55` 重构设置弹窗滚动结构后，桌面端 `.settings-layout` 是 `overflow:hidden`，真正滚动的是各 `.settings-body` 面板（窄屏 ≤700px 才由 `.settings-layout` 自身滚）；滚动断言改为同时滚 `#service-panel` 与 `.settings-layout`、断言至少一个 `scrollTop>0`。另窄屏顶栏默认隐藏（`9f95ca9`），先点 `#mobile-expand` 再点 `#toggle-sidebar`，否则后者不可见超时。
- 涉及文件：tests/context-menu-ui.py、tests/service-settings-ui.py、.pi/skills/codebase-map/INDEX.md（重新生成）、devlog.md。
- 决策：零产品代码改动，只修脚本的过期假设；不动断言语义（断言描述的行为在产品里都成立），滚动断言用「候选容器至少一个滚了」而非按视口宽度猜分支，与 CSS 媒体查询解耦；`fuzzyHit` 切片边界取函数头唯一字符串，纯函数无外部依赖，带上后不引入额外 stub。
- 验证：worktree 内 `npm test` 744 项（742 通过、0 失败、2 既有跳过）；`python tests/context-menu-ui.py` 通过（1100 与 390 两轮全部断言）；`python tests/service-settings-ui.py` 四视口（1440×900、390×900、320×900、844×390）全部 PASS。

## 2026-09-20 输入框视觉层对齐 linear 设计规范

- 时间：2026-09-20。分支 `feat/composer-redesign`（worktree F:/worktrees/axiom-composer-redesign）。
- 原因：计划接入 OpenDesign（open-design.ai）驱动整体 UI 重构、先从输入框起步；OpenDesign 本机未安装（`od` 实为 Git coreutils 同名工具、daemon 7456 端口不通），先按项目设计系统（`.pi/skills/design` 的 linear 规范）完成输入框视觉层重构，后续装好 OpenDesign 后再走其迁移管线对齐标准化 token。
- 内容（`public/style.css` 四处，纯 CSS，零 JS 改动）：
  - `#composer`：圆角 16px→12px（linear 卡片规范 `{rounded.lg}` 12px + 1px hairline）；删除 `box-shadow: 0 8px 32px var(--shadow-soft)`（规范明确「无阴影，层级靠 surface ladder + hairline 分层」，薰衣草不作装饰）。
  - `#composer:focus-within`：大光晕（3px accent 5% + 8px32px 阴影）改为规范 focus ring——`border-color: var(--accent-ink)` + `box-shadow: 0 0 0 2px accent-ink 50%`，accent-ink 在明暗两套里各自取最清晰强调色。
  - `#prompt-completion` 补全浮层：边框 `accent 20%`→`var(--line)`（hairline；accent 不用于装饰）；hover 从 accent 16% 拆为中性 `var(--hover)`，`aria-selected` 保留 accent 16%（选中属 focus 语义）。
  - 移动端删冗余规则 `#composer { border-radius: 12px; }`（桌面已统一 12px）。
- 涉及文件：public/style.css、devlog.md。
- 决策：DOM id 与事件语义（`#prompt`/`#composer`、onsubmit/onkeydown/onpaste、aria-autocomplete）完全不动——输入框交互逻辑约 500 行集中在 app.js，改结构风险不成比例；token 层不动（暗色 `--surface #0f1011`/`--line #23252a`/`--accent #5e6ad2` 本就是 linear 体系，差异只在组件级规则）；textarea 20px padding 保持（linear text-input 的 8px12px 针对单行表单输入，大面积对话输入保持产品级呼吸感，规范未覆盖处保持同气质）。
- 验证：worktree 内 `npm ci` 后 `npm test` 798 项（796 通过、0 失败、2 既有跳过）。

## 2026-09-20 配置入口收敛与作用域弹窗隔离

- 时间：2026-09-20；分支 `feat/config-scope-dialog`。
- 原因：页头遗留入口重复，工作空间与会话配置复用全局设置展示容易误导保存范围。
- 内容：移除页头配置入口及死绑定，侧栏统一齿轮图标；作用域弹窗隐藏全局导航与无关区块，使用独立标题和保存范围说明，配置表单置于首位。返回全局设置时恢复导航和布局。
- 验证补齐：预览 fixture 增加能力与默认配置读取存根；新增 Python Playwright Chromium 桌面／窄屏验收，截图人工检查；全量测试 816 项，814 通过、0 失败、2 既有跳过。
- 涉及文件：public/app.js、public/index.html、public/style.css、tests/app.test.js、tests/conversation-preview.mjs、tests/config-scope-ui.py、README.md、devlog.md。
- 边界：此次不实现 MCP／插件在已有会话中的重新装配，不将入口与展示修复等同于该能力完成。
