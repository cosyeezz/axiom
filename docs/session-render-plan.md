# 会话渲染一致性修复计划

日期：2026-09-17 · 分支：`feat/session-render-consistency`（worktree：F:/worktrees/Axiom-session-render-consistency）

## 1. 背景与症状

用户可复现的五个症状，均属「会话展示层」问题（数据层完整，JSONL/内存记录均无缺失）：

| # | 症状 | 实际根因（见 §2） |
|---|------|------|
| 1 | 点「回到最早消息」后，后续消息丢失、滚不下去 | 前向分页入口被无条件隐藏（2f25500 引入回归） |
| 2 | 切走会话再切回，阅读位置丢失 | 锚点定位请求被 `loadHistory` 的 changing 守卫吞掉且不重试 |
| 3 | 重启/切换后主对话消失，只剩 subagent 卡片、大片空白 | 混合分页：子代理记录计入页预算，最新页可为 0 条主记录 |
| 4 | subagent 卡片位置反复丢失、落到时间线末尾 | 页内无委派锚点时的多处兜底「追加到末尾」 |
| 5 | 发送大内容卡顿；希望先显示再发送 | 提交前 `await latestHistory()` 整页重建阻塞；无乐观 UI |

渲染管线本身（rAF 批处理 + 节流 + epoch 取消 + 隐藏 park + 播放上限）健康，不推倒重做；本计划只修分页、位置恢复与发送反馈。

## 2. 根因清单（均已核实行号）

1. **前向分页入口被隐藏**：`paintHistoryControls()` 无条件 `history-before/after.hidden = true`（public/app.js:2444-2445）。「回到最早」整页替换为最旧页后，中间消息 UI 不可达；`prefetchHistory` 只覆盖「近顶取更旧」。服务端 `pageOf` 本身支持 before/after/target/edge 双向游标。
2. **切换恢复被守卫拦截**：`snapshot()`（app.js:2412-2428）用 `queueMicrotask` 安排 `loadHistory({target: 锚点})`，执行时 `changing=true` 被 `loadHistory` 首行守卫直接 return，且无任何补发。switchSession 的 finally 置 `changing=false` 后无人接手。
3. **混合分页挤空主对话**：主代理与子代理记录在 `item.messages` 按到达顺序混排；`pageOf` 按记录数取最后 60 条。子代理记录渲染进任务弹窗（不占主轴高度），于是「最新页 60 条全是子代理记录」时主对话首屏为空。真实会话实测：582 条记录中主 32 / 子 550，末尾 60 条全为子代理记录。
4. **卡片位置兜底不一致**：实时按到达序、重启恢复按 `orderRestoredHistory` 锚点重排，两套顺序不同构（既往提交 5405361 只修了恢复路径）。无锚点可归位时，`card()`（~1524）、`applyEvent(task.state)`、`finishSnapshot`（~2728）多处把卡片追加到时间线末尾，伪造位置。
5. **无乐观发送**：用户卡片只由服务端 `agent.message.end role=user` 创建；提交处先 `await latestHistory()`（整页重建）再发 prompt；大内容序列化（transport.js:108-121）同步占主线程，感知为「点了没反应」。

关键事实：子代理记录 `agentId === taskId`，主记录 `agentId === "main"`（缺失视为 main）；prompt 响应返回 `runId`，主代理事件信封顶层带同一 `runId`（sessions.js:1224-1225、1690 附近），可作乐观卡对账键。

## 3. 方案总览

四阶段，A→C 顺序实施，D 文档化延后。核心原则：

- **服务端原文是唯一权威**，位置都是派生物；不做静态渲染缓存（2026-09-16 既有决策）。
- **不动 live 数组语义**：投影在 `pageOf` 调用点进行（读时投影），撤回/压缩/重试/压缩过滤等既有逻辑基于到达序数组，不受影响。
- **协议语义不变**：消息 ID、seq 水位、重连对账、失败重试、排队语义全部保留；乐观卡只做「临时占位 + 原位升级」，绝不伪装成已确认状态。

## 4. Phase A —— 服务端：读时投影 + 主轴预算分页

**src/sessions.js**

- 把 `orderRestoredHistory` 提炼为共享投影函数 `projectTimeline(messages)`：子代理记录移到其委派锚点（主代理 delegate toolResult）之后成组；孤儿子记录前置于头部（与既有重排语义一致，投影幂等）。
- `snapshot()` 两个调用点（只读投影分支 + live 分支）统一改为 `pageOf(projectTimeline(messages), …)`。live 数组本身不改，不动 goal evidence slice / retry messageCount / 压缩过滤。
- `pageRetries` 优先 `anchorEntryId` 精确定位，messageCount 仅作兜底；live 分支对 retry.messageCount 做「到达序下标 → 投影下标」换算（主记录恒保序，O(n) 双指针）。
- snapshot 的 `history` meta 增加 `truncatedTasks`（被裁剪记录的 taskId 列表）。

**src/session-history.js**

- `pageOf` 窗口预算改为**按主轴记录计**：`limit`（上限仍是 1..200，默认 60）指主记录数；子代理记录随锚点整组进出窗口。边界一律锚在主记录上；旧游标若指到子代理记录（重排前签发，理论上仅限同进程热替换场景），向主轴就近吸附。全主记录数组下新旧窗口算法结果逐条相同（既有测试不破）。
- 每次调用重建 messageId 索引 Map（投影产生新数组，增量 `ensureIndex` 的「同数组追加」假设不再成立；调用为用户驱动、非热路径）。移除 history 对象上的 ids 缓存字段。
- 页总记录上限 `HISTORY_PAGE_RECORDS_MAX = 400`：超出时从窗口左缘裁掉子代理记录（永不裁主记录），`meta.truncatedTasks` 带出被裁 taskId，`prevCursor` 仍锚未裁前的原始边界。
- 不升 CURSOR_VERSION：游标只存在于前端内存，跨进程换代会随 epoch 失效，无兼容负担。

**效果**：任何一页必含 `min(limit, 主记录总数)` 条主记录；委派锚点与其子代理记录同页；「末页 0 条主记录」不可能出现。

## 5. Phase B —— 前端：翻页可用、位置可恢复、卡片不伪造位置

**public/app.js**

1. **分页条恢复**：`paintHistoryControls()` 取消 before/after 无条件隐藏。分页条在「加载中 / 有新消息（dirty）/ 不在最新页（nextCursor）」时可见；位置文本显示区间与总数（`181–240 / 共 240 条`）。`history-after` 走 `loadHistory({after})` 翻下一页（页替换语义：新页从顶部开始，符合向前阅读直觉）；dirty 时维持现状跳最新。
2. **近底部前向预取**：`onscroll` 中与 `prefetchHistory` 对称增加 `prefetchForward()`（距底 < 160px 且有 nextCursor 时取下一页），从旧页向新页连续滚动可自动推进。
3. **切换恢复修复**：`snapshot()` 的锚点定位改为登记 `pendingAnchorRestore`，在 `changing=false` 后冲刷（switchSession finally、sessionMissing 新建路径 finally、以及 changing 本来就为 false 的直接 snapshot 尾部）。请求在飞（historyLoading）时保持挂起，`loadHistory` finally 再冲刷一次。真实 switchSession 路径由新回归测试覆盖（旧测试直接调 snapshot，绕过了守卫）。
4. **移除三处「末尾追加」兜底**：`card()` 尾部、`applyEvent(task.state)` 创建路径、`finishSnapshot` 的 running 任务末尾追加。锚点不在当前页时卡片不进时间线（不伪造位置）；运行中任务由底部 `#task-runs` 运行条呈现（`renderTaskRuns` 已有，且任务页必然含其锚点，翻到锚点页卡片自然出现）。运行条对应 trigger 未挂 DOM 时行禁用（不可定位）。投影保证锚点与记录同页，正常路径不再依赖兜底。
5. **后台返回不丢位置**：`visibilitychange` 仅在 `view.follow`（本来就在底部跟随）时自动跳最新；阅读旧页返回时保留位置，dirty 横幅提示「有新消息 · 回到最新查看」。
6. **截断提示**：`beginSnapshot`/`prependHistory` 读取 `history.truncatedTasks`，对应任务弹窗顶部加「任务记录过长，本页仅显示最近部分」提示。

## 6. Phase C —— 发送：先显示、后发送、按 runId 对账

**public/app.js 提交处理器 + applyEvent**

1. 移除提交前的 `await latestHistory()`：旧页发送时改为 `void latestHistory()`（不阻塞 prompt 派发，回最新仍异步发生）。
2. 乐观卡仅当「在最新页（无 nextCursor）且非 busy（未排队）」时创建：`card("你")` + `renderMessage(item, {role:"user", content:[text+图片]})`，附状态行「发送中…」；`await nextPaint()`（rAF + setTimeout）让浏览器先画出卡片，再进入序列化/网络重活（症状 5 的主线程卡顿）。
3. prompt 响应返回 `runId` 绑到乐观卡；`agent.message.end role=user agentId=main` 到达时按 runId（缺失时按单槽假设）**原位升级**为权威卡（renderMessage + bindRaw + mainItems + anchorGoal 复用既有路径），支持回执先于/后于事件两种次序。
4. 失败语义：`response_error`（确定拒绝）删乐观卡、保草稿；`unknown`（断线/超时）状态行改「发送结果未确认」，卡保留，重连/切换时由整页快照重建天然对账收敛。
5. 排队路径（busy）不建乐观卡，沿用队列行反馈；`beginSnapshot` 重置乐观槽位（切会话/重连自然清理）。

## 7. Phase D —— 文档化延后（不在本次实施）

- 有界 DOM 窗口/虚拟化（TanStack Virtual 路线：overscan + measureElement + initialMeasurementsCache 恢复）。
- 块级 markdown 解析缓存（Streamdown 路线）。
- 流式尾部增量更新、阅读位置与重型缓存分离。

理由：这些是性能优化而非正确性修复；当前实测瓶颈（DOM 随上滚无上限增长、切换 ~900ms）需要真实浏览器测量后再做，盲改风险大于收益。分页主轴预算落地后 DOM 量级已被页上限约束（≤400 记录/页）。

## 8. 验收标准

- 任何页、任何混合比例下：主对话记录不缺失、不重复、顺序稳定；子代理记录再多也挤不空首屏。
- 真实切换（switchSession 路径）后阅读位置恢复；「回到最早」→ 翻页/滚动可持续向前读回最新。
- 跨页委派、同批任务乱序完成、重启恢复、压缩折叠后：卡片位置与阅读锚点确定性一致；未锚定运行任务只出现在底部运行条。
- 发送即时可见（最新页乐观卡 / 旧页先派发后回最新）；prompt 派发先于历史整页重建；断线/超时/排队状态如实呈现。
- 回归：`npm test` 全绿；新增测试覆盖上列场景。

## 9. 测试计划

- **服务端**（tests/，走真实 Sessions）：混合主/子记录任意窗口必含 N 条主记录；边界游标往返不重不漏（含子代理记录组跨边界）；投影幂等；live 到达序与恢复重排投影等价；「追加 200 条子代理记录后 attach 末页仍含最新主消息」；截断标记与 prevCursor 语义。
- **前端**（tests/helpers/history-page.js 真实 app.js）：真实 switchSession 锚点恢复；从最早页经 after 游标连续翻回最新；后台返回保留位置；去掉末尾追加后「页外任务不伪造卡片位置」；乐观卡立即显示/原位升级/response_error 删除/unknown 标记/快照重建清理/发送先于历史重建。

## 10. 风险与对策

- pageOf 窗口语义变化影响面：全主记录数组的窗口结果与旧算法逐条相同（既有 session-history.test.js 全部保留作回归）；混合数组行为变化是本次修复目标本身。
- 前端 tests/helper 的 pageOf 直调不传投影：预算语义在全主记录下等价，无需改 helper 即兼容；新增投影用例走真实 Sessions。
- 乐观卡与权威消息竞态：runId 对账 + 单槽假设 + 快照重建兜底；绝不按文本匹配。
