# Phase D：渲染容量与发送链路优化计划

日期：2026-09-17 · 分支：`feat/session-render-phase-d`（worktree：F:/worktrees/Axiom-session-render-phase-d）

## 1. 背景

会话渲染一致性修复（`feat/session-render-consistency`，master 16b99e2）交付后遗留四项容量/性能优化。此前延后理由是"需真实浏览器实测"——本轮引入 Playwright 真实浏览器验证（项目已有基建），闭环该前提。

## 2. 目标与子项

| # | 子项 | 目标 | 状态 |
|---|------|------|------|
| D1 | 有界 DOM（滑动窗口） | 已挂载消息节点数有上限；远离阅读端的节点被裁剪，靠近时按既有分页游标回载 | 待调研结论 |
| D2 | 消息渲染缓存 | 已完成消息的重复渲染（翻页往返/回切/升级）命中缓存，流式消息不缓存 | 待调研结论 |
| D3 | 流式尾部增量 | 流式事件只解析新增尾部，已完成块不再重解析 | 待调研结论 |
| D4 | 发送序列化量化 | stringify 主线程占比实测 + 优化方案评估（协议语义不动） | 待实测数据 |

## 3. 硬约束（继承上一轮）

- 协议语义不破坏：游标/水位/重连对账/maxBytes/失败重试全部保留。
- 渲染管线（rAF 批处理、epoch 取消、隐藏 park、播放上限）只做增量接入，不推倒。
- 一致性优先：D1 裁剪不得造成消息丢失/重复/乱序假象（被裁端必须可由游标完整回载）；D3 不得引入跨边界标签解析错误。
- 服务端原文仍为唯一权威，前端缓存只缓存"派生渲染产物"，可随时丢弃重建。

## 4. 验收标准

- DOM 节点数在任意翻页/滚动路径下有硬上限；被裁消息回载后与原文逐条一致。
- 重复渲染场景（换页往返、切回）命中缓存可观测（计数器或测试断言）。
- 流式长消息每事件重解析的工作量随增量而非全文增长（测试断言）。
- 发送大内容的卡顿有实测数据与结论（修或不修均有据）。
- `npm test` 全绿 + Playwright 真实浏览器验证通过。

## 5. 实施记录

### D4：发送序列化实测（调研完成，2026-09-17）

调用链：`composer.onsubmit`（public/app.js:3031）→ 乐观卡 `await nextPaint()`（app.js:3050-3055）→ `request("prompt")`（app.js:3058）→ `transport.request` 唯一 stringify 点（**public/transport.js:101**）→ maxBytes 软限检查（transport.js:102-103，bufferedAmount+Blob 大小 >32MiB → send_limit 确定性拒绝）→ `socket.send`（transport.js:112，单条 WS 消息原子）。服务端硬限 ws maxPayload 32MiB（src/server.js:146，超限 close 1009）；prompt text 无长度上限（src/protocol.js:346-355）。

实测（node v24.19.0，V8 与 Chrome 同引擎；两遍复跑偏差 <5%）：

| payload | stringify p50 | 客户端主线程总占用≈2×stringify |
|---|---|---|
| 混合文本 1MiB | 1.84ms | ~4ms |
| 混合文本 4MiB | 6.90ms | ~14ms（≈1 帧） |
| 混合文本 16MiB | 29.7ms | **~60ms（3-6 帧）** |
| 协议上限 ~30MiB | — | ~110ms |

结论：①常规输入（<100KiB）<0.2ms 可忽略；超大 prompt 是一次性卡顿非稳态开销，且已发生在乐观卡绘制之后；②值得条件触发 Worker 化（payload 估算 >1MiB 才走 Worker：stringify + UTF-8 transferable buffer + 字节数一并返回，免 Blob 检查免二次编码，16MiB 省约 60-90ms），`request()` 本就返回 Promise 无 API 变化；③协议硬约束——单条 WS 消息原子不可分片、32MiB 服务端硬限分片绕过=连接级故障、Worker 化后须在真正 send 前复检 bufferedAmount 保持 send_limit 确定性失败语义。**优先级低于 D3 流式路径。**

### D2：消息渲染 LRU 缓存（调研完成，2026-09-17）

现状：markdown.js:4 已有**元素级 WeakMap 缓存**（:268 `previous?.text === text` 整体早退；:306-312 块级 `type+raw` 复用 + linksKey 门控，流式增长只重解析尾部块）——但元素销毁即失效。**整页替换场景（回 latestHistory/向前翻页/锚点恢复/切会话回切/压缩撤回修订触发 session.history.changed→全量重渲/hidden 回切）旧 DOM 全毁（beginSnapshot app.js:2673 replaceChildren + renderer.clear），≤60 条从零重渲**，是重复渲染主场景；向后翻旧页 prepend 是增量首渲（缓存无益）；原文对照双视图纯 textContent diff 成本可忽略。content-visibility（style.css:571-574）只省布局/绘制，不省 JS 侧 lexer/parse/sanitize。

实施设计：
- **缓存键** `[sessionId, historyRevision, messageId||entryId, kind]`（kind ∈ text/thought/process/skill/summary）；值存 markdown.js:307 已产出的 `{text, linksKey, blocks:[{key,node}]}`，同步存 text 做等值校验防未换修订的漂移。修订是会话级（touchHistory 仅压缩/撤回递增，随 meta.revision 下发，app.js:2539/2545 已比对）——键含 revision 即覆盖压缩/撤回失效，无消息级修订字段。
- **只缓存终态**：流式增量路径（paint(item,false)）不带键；final flush 且 ！item.active、finishSnapshot 半成品流不带键。
- **节点所有权**：缓存 detached 节点、命中时 move 进新元素（同 document）；入缓存时 node.isConnected 则存 clone 防双挂载（工具结果 rehome 是移动非复制，不冲突）。
- **容量**：字节预算（~2-4MB）或条数上限（~300），插入序 LRU（参照 session-cache.js Map 顺序淘汰）；>24K literal 与 plain-text 快路径不缓存。
- **收益边界**：命中跳过 marked.lexer + 逐块 parser + DOMPurify + 代码块工具栏构建 + Intl.Segmenter 扫描（markdown.js:281-407）；card 骨架/goal 锚/mainItems/bindRaw 照常重建（承载位置恢复语义，不动）。可在 receiveHistoryEvent 顺带 pruneSession(sessionId) 加速回收。

### D3：流式尾部增量（调研完成，2026-09-17）

现状（stream-renderer.js 调度链：事件→mark→40ms rAF 批处理→draw→prepareStream→renderMarkdown，每帧 6ms 预算让出）：DOM 层已有块级复用（markdown.js:313-315 逐块 type\0raw 键比对）与纯文本 Text 节点保留（:275 replaceData）——**不是整条重渲**；重复的是文本层全文计算。20K 字符实测热点：

| 热点 | 量级 | 位置 |
|---|---|---|
| prepareStream 剥离管线 4 次全文 maskCode | ~90ms/s | app.js:1596-1600（goal-markers.js:22/:51 各一次 + memory-tags.js:75 + answer-tags.js:14） |
| 播放器每帧全文 Intl.Segmenter 重分段 | ~58ms/s | stream-playback.js:89-113（文档化的正确性机制，不动） |
| 整篇 marked.lexer + fixCjkBold 重 lex | ~48ms/s | markdown.js:302-303（≥100ms 自适应节流 nextMarkdown） |
| 思考面板渲染无 nextMarkdown 闸门 | 同 lexer 量级 | stream-renderer.js:115（闸门 :98 只护正文） |
| refreshCallGroups 遍历全部会话消息 | O(会话长度)/帧 | app.js:1135 |

**实施范围（按实测收益排序，调研结论）**：
1. **双 maskCode 合并**（免费）：stripGoalMarkers 内部对同一全文跑两次 maskCode（goal-markers.js:22/:51），掩码传递复用减半，零行为变化。
2. **剥离管线前缀缓存 + 尾窗重扫**（~90ms/s）：围栏状态前向扫描、追加不改已定行分类；唯一回溯项 = INLINE 反引号配对（不跨空行，段落局部）与未闭合围栏延伸到 EOF → 从「最后一个空行/未闭合围栏」起的尾窗重扫。maskCode 被 3 模块共用（markdown-scan.js 头注），缓存按调用方键控。answer-tags 行级缓存（isMark 逐行判定+行偏移缓存）；memory-tags headLine 首行恒定+DEAD span 前缀缓存+尾窗重扫；isPlainText 增量布尔（逐 delta 查字符类）；prepareStream 结果按已剥离前缀长度缓存。
3. **思考面板渲染对齐 nextMarkdown 闸门**（免费）：与正文同口径节流。
4. **lexer 增量化不做**：尾部后到的引用定义 `[id]: url` 会回溯改写更早块行内渲染（markdown.js:251-255/:309），增量必须精确复刻 CommonMark 引用定义判定，现设计刻意整篇 lex+块级复用，风险高于收益。
5. **播放器整段重分段不做**：正确性机制（ZWJ 链/RI 奇偶/跨批代理对靠整段 Segmenter 定夺，stream-playback.js:4-9 头注），MAX_TEXT=24000 已把单帧封在 ~1ms。

**不可动**：块级 DOM 复用与保留 Text 节点（保选区机制）；splitAnswer 开标签到达即翻转可见性语义（answer 区间两端会动，解析失败有剥裸标记回退）；DOMPurify 边界照过；调度器不变量（单帧所有权/epoch 取消/隐藏 park/选区接管/6ms 让出/interact 520ms）；24K literal 与播放 24000 兑底。

### D1：有界 DOM 滑动窗口（设计，结合 T2/T3 调研）

现状：DOM 只增不减（连续上滚 + 前向预取都只追加）。设计：已挂载主消息超过上限（~300 条）时，从远离阅读方向的一端裁剪节点——向上加载/预取时裁底部，prefetchForward/向下时裁顶部；顶部裁剪需滚动锚点补偿（反向于前插补偿）；裁剪同时从 state.mains/子代理入口引用移除。被裁端回载天然闭环：向上=既有顶部预取（before 游标），向下=既有 prefetchForward（nextCursor）。分页条文本自动反映窗口范围。锚点/views 缓存指向被裁消息时，switchSession 锚点恢复重取窗口，天然兼容。裁剪后回载走 mountHistory → D2 缓存命中。注意懒渲染口径：容量计数与验证须「全展开」后计（T3 坑）。

### T3：浏览器验证基建（调研完成，2026-09-17）

- 脚本自启隔离预览（tests/*.mjs 假数据服务器，随机端口，不碰真实服务/npm start/AXIOM_DEV）；就绪信号 `#workspace:not([hidden])`；断言模式 report+sys.exit(1)；需 `pip install playwright && playwright install chromium`（本机 Python 3.12.10 + Playwright 1.60.0 已验）。
- **现成基线**：`python tests/smooth-stream-browser.py --out <json>` 16 项全 PASS（4× CDP CPU 节流，指标口径：renderCalls/paints/帧 p50/p95/longtask/滚动键盘 p95）——Phase D 验收直接对照。`python tests/session-billing-ui.py` 4/4 PASS。
- 验证模板已实跑通过（%TEMP%/axiom-render-profile-template.py）：随机端口自起 conversation-preview.mjs → `#session=ui-long` 哈希选会话 → collapsed/expanded 两遇测 DOM 节点数（懒渲染坑：details 未 open 不在 DOM，须全展开）。
- 造多消息数据：activity-groups-ui.py 的源码注入法（preview.replace('const sessions = {', …) + `node --input-type=module -e` 不落盘；`page.route('**/app.js')` 注入 `window.activityTestEvent` 可合成流式事件）。数百条消息无现成样例，需此法自造。
- 计划新增：`tests/render-capacity-ui.py`（N∈{100,300,500} 混合消息，collapsed/expanded DOM 节点数、attach→ready 耗时、4× 节流下 scroll/key p95）+ 流式到达压测（delta 连发测帧间隔/longtask）。

（实施随进度补入。）
