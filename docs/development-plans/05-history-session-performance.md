# 05 · 历史游标分页、动态高度虚拟化、有界会话缓存、后台不绘制

> 2026-09-16 状态更新：**已集成并通过本轮回归验证**。下文原方案及当时测试声明保留为历史记录；当前实现、验证和限制以[集成交付记录](../current-runtime-integration-status.md)为准。

> 状态：**独立开发方案（拟议）**。本文只做设计与契约，不含产品代码改动，不声称任何测试已通过。
> 代码基准：本 worktree `feat/runtime-render-plans`（HEAD `d387c5d`，已含 `09dbd6a` 长对话性能预览）。
> 标记约定：**✅已有** = 本文已按当前代码逐条核实；**🧪拟议** = 目标设计，仓库中尚不存在，需先核实/桩测再集成。
>
> 本文与其它文档的边界：
> - `03`（协议）：`seq` 的作用域、`session.history` 的请求/响应 schema、错误码由 03 负责人确定，本文只提需求。
> - `06`（显示游标/归并）：身份契约为 `sessionId + agentId + messageId`。**05 负责 mount / unmount 与滚动窗口**；06 只从**权威归并正文**推进「显示游标」，不接原始事件、不做第二个 reducer。
> - `app.js` / `server.js` / `protocol.js` 由集成负责人独占；本文只给最小 patch 契约。
> - 通信层只负责接收与路由；消息一律按 `sessionId` / `agentId` 与 `seq` 处理。

---

## 〇、一页速读

```
现状（✅）                              目标（🧪）
┌──────────────────────────┐            ┌──────────────────────────┐
│ session.attach 回全量    │            │ session.attach 只回最近N条│
│ 1831 条 → 39947 DOM 节点 │            │ +cursor；往上翻页再取     │
├──────────────────────────┤            ├──────────────────────────┤
│ 所有消息 DOM 常驻        │            │ 只有视口窗口内 mount      │
│ 无 content-visibility    │            │ 上下 spacer 保滚动条      │
├──────────────────────────┤            ├──────────────────────────┤
│ views: 草稿/滚动，无上限 │            │ 有界 LRU（默认 3 会话）   │
│ 但也不缓存 DOM           │            │ 只缓存权威引用+高度表     │
├──────────────────────────┤            ├──────────────────────────┤
│ 后台标签页仍按 40ms 节流 │            │ 隐藏时不绘制，回前台收口  │
│ 重画整段 markdown        │            │ 不修改真实消息            │
├──────────────────────────┤            ├──────────────────────────┤
│ 分片快照 + seq 水位（已做）│           │ 水位/队列进每会话缓存槽   │
│ appliedSeq 只增不清      │            │ 分页不改 SDK 上下文       │
└──────────────────────────┘            └──────────────────────────┘
```

四条不变量（任何实现都不能破坏）：

1. **分页只改展示窗口，不改 SDK 上下文。** 前端少渲染几条，不导致发给模型的 messages 变少。
2. **数据权威与 DOM 分离。** 权威消息在服务端 `item.messages`；DOM 只是可丢弃的视图。
3. **stream 动画不修改真实消息。** 任何节流、让路、后台停放都只影响「何时画」，不影响 `item.buffer` / 权威数据。
4. **身份稳定。** 任何跨页/跨挂载的引用都用 `(sessionId, agentId, messageId)`，不用 DOM 节点或数组下标做长期键。

---

## 一、现状证据（✅已有，逐条可查）

### 1.1 历史加载链路：全量，无游标

```
浏览器                                     服务端
  request("session.attach",{sessionId}) ──▶ src/protocol.js:326   只校验 sessionId
                                            src/server.js:401     data = await attach(id)
                                            src/server.js:260     ensureLoaded → sessions.snapshot(id)
                                            src/sessions.js:1291  structuredClone({... messages: item.messages ...})
  ◀──────────────── 整个会话的全部消息 + compactions + tools + live + tasks + goal
```

- `item.messages` 的来源是**全量历史**：`src/sessions.js:922` 用 `item.agent.historyEntries()` 铺满，
  `src/pi.js:257` 的 `messageEntries()` 即 `sessionManager.getBranch().filter(entry => entry.type === "message")`。
- 追加来源：`src/sessions.js:792` 每条 `agent.message.end` 直接 `push`；
  `src/sessions.js:927` 子代理历史（job）也整段 `push`。
- **没有任何 `cursor` / `limit` / `before` / `after` 字段**（已 grep `src/*.js public/*.js`，`cursor` 仅出现在 sessions.js:943 的压缩匹配游标，语义无关）。
- 实测代价（旧基线，见 1.6 的限制）：11.5MB JSONL / 1831 条消息 → **39,947 个 DOM 节点**，首屏最大长任务 955ms，切换 1345ms。

### 1.2 首屏渲染：已分片，但仍是「全量 DOM 常驻」

- ✅ 分片快照已落地：`public/app.js:2215-2219`（`SNAPSHOT_SYNC_MESSAGES=120` / `SNAPSHOT_CHUNK_MS=8` / `SNAPSHOT_CHUNK_ITEMS=40`）、
  `app.js:2239 snapshot(state, onReady)`、`app.js:2396 placeSnapshotMessage`、`app.js:2435 finishSnapshot`。
  ≤120 条同步建；>120 条按 8ms/40 条切片，用 `scheduler.postTask(background)` 或 `setTimeout` 让路。
- ✅ **没有虚拟化**：分片只把「一个 955ms 长任务」拆成多个小任务，**节点总数不变**，滚动条与内存压力不变。
- ✅ **没有 `content-visibility` / `contain`**：`public/style.css:365 #output`、`368 .message` 均无（已 grep）。
- ✅ 消息外壳由 `app.js:1342 card()` 建，正文由 `app.js:1426 renderMessage()` → `public/stream-renderer.js` 绘制。

### 1.3 seq 与事件通道：水位已做，但只增不清

- ✅ 事件带序号：`src/sessions.js:806` `const envelope = { ...event, sessionId: id, seq: ++item.seq }` → **seq 是 per-session 单调递增**（作用域最终由 03 确认）。
- ✅ 快照水位去重：`app.js:2220 appliedSeq = new Map()`、`app.js:2229 acceptEventSeq()`（`seq <= seen` 丢弃）、
  `app.js:2500` 在 `finishSnapshot` 成功后才提交 `appliedSeq.set(state.sessionId, state.seq)`。
- ✅ 分片期间事件入队：`app.js:2221 snapshotQueue`、`app.js:1965` 入队、`app.js:2503 drainSnapshotQueue` 按序补放。
- ⚠️ 缺口：`appliedSeq` 是**模块级 Map 且只在 `set` 时增长**，永不清理，会话多了会常驻；且水位只在快照成功收口时前进，
  分片失败/被新快照取代时旧水位留在原处（不会错，但语义靠调用方维护）。

### 1.4 会话缓存与后台绘制

- ✅ 唯一的「会话级视图缓存」是 `app.js:34 const views = new Map()`，只存 `{draft, contextFiles, images, selectedSkill, scroll, follow}`（`app.js:166-172`）；
  **无上限、不含 DOM、不含消息**。切换会话 = 旧 DOM 全丢、新 DOM 全建。
- ✅ 后台**不做任何门控**：`public/stream-renderer.js` 用 `setTimeout(draw, 40)` 节流，`draw()` 无条件对 dirty item 跑
  `renderMarkdown(item.text, item.buffer)`（整段累计文本全量 lex）。全仓 grep 无 `visibilitychange`；
  `app.js:3028` 只在「30 秒会话列表刷新」上判了 `!document.hidden`。
- ✅ 「交互期间让路」已实现：`stream-renderer.js` 的 `interact()` / `interactUntil`（520ms 窗口，最多延后 1s 必补画）。

### 1.5 搜索 / 复制 / 锚点 / 图片高度：现状都靠「DOM 已存在」

| 能力 | 现状位置 | 依赖的隐含假设 |
| --- | --- | --- |
| 会话列表搜索 | `app.js:3166` + `3318`（`$("search")`，按标题过滤） | 不依赖消息 DOM |
| 页内查找（Ctrl+F） | 浏览器原生 | **全部消息都在 DOM 里** |
| 选区自动复制 | `app.js:2850 copySelection()`（pointerup/keyup → `selection.toString()` → `navigator.clipboard`） | 选中的文本能由 DOM 还原 |
| 原文面板复制 | `app.js:407` `entry.body.textContent` | 独立副本，不依赖消息 DOM |
| 原文定位 | `app.js:357 selectRaw(entry, true)` → `node.scrollIntoView({block:"center"})` | 目标节点已挂载 |
| goal 锚点 | `app.js:84-90 goalAnchors = new Map()`（key = 下标或 entryId，value = **DOM 节点**） | 节点常驻 |
| 重试锚点 | `app.js:1942` `anchorEntryId` → `app.js:1887 placeCompactedRetries()` 移动 **DOM 节点** | 节点常驻 |
| 压缩折叠 | `app.js:1623 foldCompaction()`：把命中消息 `item.node.hidden = true` 并搬走分组成员 | 节点常驻 |
| 消息内图片 | `app.js:1527-1537`：`<img src="data:...">` + `loading="lazy"` + `onload = scrollLatest` | 解码后才有真实高度；**无任何尺寸元数据** |

### 1.6 ⚠️ 旧性能证据的限制（不能直接当 05 的「改造前基线」）

来源：`docs/frontend-long-conversation-perf.md`、`docs/perf-long-conversation/**`（README、JSON、`measure.mjs`）。

1. **基线过期**：旧数据采集于 `master @2c8051b`，**早于** `09dbd6a`（性能预览）落地。
   分片快照、流式 40ms 节流、交互让路、`markdown.js` 块缓存都已进树 → 旧数字描述的是**另一个前端**。
2. **环境限制（原文已自认）**：rAF 静止基线即 ~31.3ms/帧（≈32fps），绝对值不代表 60fps 设备，只能看相对差异。
3. **流式是微基准**：直接调 `renderMarkdown` 每帧追加 600 字符并强制读布局，未叠加 `app.js` 的 delta 处理与 DOM 重建，
   既不是上界也不是下界。
4. **内存未强制/未记录 GC**，且两次首屏来自不同实例（4399 / 4410），50.6MB / 53.3MB 不可直接比较。
5. **样本单一**：1 条会话（`55e7fce9…`）+ 1 台机器 + 1 个 Chromium；滚动检测 120 帧里约 36 帧即触底，「未检出掉帧」≠ 无掉帧。
6. **未做 CPU profile**：首屏 955ms 的 `snapshot` 归因是**代码路径推断（代码候选）**，不是 profile 结论。

**结论：05 必须重新采集，且不得用旧数字当通过/失败阈值。**具体见第六节。

---

## 二、目标与非目标

### 目标

| # | 目标 | 可判定的落点 |
| --- | --- | --- |
| G1 | 历史**游标分页**：首屏只取最近 N 条，向上按游标取更早页 | 请求/响应带 `cursor`；首屏 `messages` 数 ≤ N |
| G2 | **动态高度虚拟化**：仅挂载视口窗口 ± overscan | DOM 节点数与会话总长**解耦**（有界） |
| G3 | **有界会话缓存**：按 LRU 限制会话级视图状态 | 缓存条目数上限可配置；淘汰不丢数据 |
| G4 | **后台不绘制**：标签页隐藏/元素离屏时不画 | `visibilitychange` 期间无 markdown 全量渲染 |
| G5 | 分页**不改变 SDK 上下文** | 分页前后发往模型的 messages 数不变 |
| G6 | 初步快照与 seq 实时**一致** | 无重复、无丢失、无回退；水位按会话隔离 |
| G7 | 搜索/复制/锚点/图片高度在虚拟化下**保真或有显式限制** | 四项各有契约测试或明确降级声明 |

### 非目标（明确不做）

- 不换框架、不引入虚拟列表第三方库（保留 Node / 原生 JS / `ws`）。
- 不改持久历史、不删消息、不改 compaction 语义与压缩切点。
- 不改 pi SDK 的上下文构建（分页是**展示层**的事，不碰 `getBranch()` / checkpoint 边界）。
- 不做 Electron 更新、不做轮询、不做「修复」按钮（与更新类文档无关）。
- 不在本文件规定 `seq` 的作用域（03 的事）。
- 不预先造大抽象：新增模块先按**能测的最小接口**写，集成时再谈是否需要多一层。

---

## 三、目标设计（🧪拟议）

### 3.1 身份与最小契约（拟议，非已有）

**现状**：消息对象是 `{ agentId, message, entryId? }`（`src/sessions.js:792` / `927` / `922`）。
`entryId` 是 pi JSONL 的条目 id，但**是尽力而为**：

```js
// src/compaction.js:68 —— 用对象引用反查，查不到就返回 {}
export function entryIdFor(sessionManager, message) {
  const entry = sessionManager.getEntries()
    .findLast((c) => c.type === "message" && c.message === message);
  return entry ? { entryId: entry.id } : {};
}
```

因此 ✅ **当前不存在 `messageId` 字段**（已 grep 全仓，零命中）。

**拟议契约（本文定义，需 03/集成负责人确认）**：

```
消息身份 messageId ::= 服务端生成的稳定字符串
  - 优先：pi entryId（JSONL 条目 id，追加写，天然稳定）
  - 兜底：`${agentId}:i${index}`（仅当 entryId 缺失；必须在注释里标“非持久稳定”）
  - 客户端不得自行发明 messageId，只做校验与透传

复合键 messageKey = `${sessionId}|${agentId}|${messageId}`
```

> 前置核实（**未确认，不得当既有**）：
> 1. `agent.message.end` 是否**每条**都带 `entryId`（现状是 `...(event.data.entryId ? {entryId} : {})` 条件展开）。
> 2. `SessionManager` 是否支持「按 entryId 取切片」或只支持 `getBranch()` 全量（决定分页要在服务端自己读 JSONL 还是复用 SDK）。
> 3. 03 是否同意把 `messageId` 纳入响应 schema（而不是让前端从 `entryId` 猜）。
> 4. `seq` 作用域：当前是 per-session 递增（`src/sessions.js:806`），03 是否保持。

### 3.2 历史游标分页（G1 / G5）

**服务端（拟议接口，需 03 定 schema）**：

```js
// request（拟议）
{ id, type: "session.history",
  sessionId, agentId: "main",          // agentId 默认 main；子代理历史按 job id
  cursor: string | null,               // null = 从最新往回取
  direction: "before" | "after",       // 默认 "before"
  limit: number }                      // 拟议上限 200，默认 60

// response.data（拟议）
{ sessionId, agentId,
  entries: [{ messageId, entryId, index, message }],   // 顺序与权威数组一致
  prevCursor: string | null,           // 继续往更早取
  nextCursor: string | null,           // 往更新取
  total: number,                       // 权威总数（可空，允许不准）
  seq: number }                        // 初始快照水位；更早历史页不得推进实时已应用水位
```

- `cursor` 是**不透明字符串**，只由服务端解释（拟议编码 `entryId`；不要暴露成数组下标，压缩/撤回会让下标漂移）。
- 服务端新增模块 `src/session-history.js`（拟议，05 所有）：输入 session 的 JSONL/agent，输出上述切片；
  **不接入协议**，schema 与路由由 03 + 集成负责人在 `protocol.js` / `server.js` 落地。
- 首屏：`session.attach` 保持返回「最近 N 条 + `cursor` + `seq` + 其余状态」，或新增 `session.history` 由前端先 attach 再取页；
  两者取其一，**由集成负责人决定**（本文倾向后者改动小：attach 不动，前端多一次 `session.history`）。

**G5 实现要点**：分页只影响 `placeSnapshotMessage` 的输入数组长度与窗口；`item.messages`（服务端）与发给模型的上下文**完全不动**。
验收：同一条会话，分页前后各抓一次发往模型的请求体，messages 条数与顺序哈希必须相等（见 6.3）。

### 3.3 动态高度虚拟化（G2 / G7）

**新模块 `public/history-window.js`（拟议，05 所有）**——**纯状态机，不碰 DOM**，便于独立单测：

```js
// 拟议接口
export function createHistoryWindow({
  overscan = 6,            // 视口上下各多挂载几条
  maxMounted = 200,        // 单窗口挂载硬上限（防超长消息把窗口拖大）
  estimate,                // (item) => number，未测量时的估算高度
} = {}) {
  return {
    // 输入：全部已知条目（权威消息的轻量描述）+ 视口
    measure(messageKey, height) {},                   // ResizeObserver 回调写回
    update({ items, scrollTop, viewportHeight }) {},  // items: [{messageKey, agentId, role, chars}]
    // 输出：
    get window() {},   // { mounted: [{index, messageKey, top, height}], totalHeight, top, bottom, stale: bool }
  };
}
```

- **挂载/卸载由窗口决定**：`mounted` 之外的条目不建 DOM；`#output` 内用两个 spacer（`#output-top-spacer` / `#output-bottom-spacer`）撑住滚动条高度。
- **动态高度**：`height = measured.get(key) ?? estimate(item)`；估算初值可用「正文源码长度 × 系数 + 固定行高」，
  测量回写后**补偿滚动位置**（测量前后保持视口锚点 messageKey 不动，避免跳动）。
- **上限**：窗口条数 > `maxMounted` 时报 `stale` 并由调用方压缩 overscan（避免 1 条超长消息撑爆预算）。
- **与压缩折叠的冲突（重要）**：现状 `app.js:1623 foldCompaction()` 是「先渲染再 `hidden` + 搬节点」。
  虚拟化下未挂载的节点不存在 → 折叠必须在**窗口计算阶段**完成（按 compaction 记录过滤掉被折叠的条目），
  而不是渲染后隐藏。这是 05 需要给集成负责人的核心 patch 契约之一。
- **不做的事**：不要求 `requestAnimationFrame` 内精确同步（先用「滚动 → 下一帧重算窗口」，避免拖着滚动手感）。

### 3.4 有界会话缓存（G3）

**新模块 `public/session-cache.js`（拟议，05 所有）**：

```js
export function createSessionCache({ maxSessions = 3, maxBytes = 8 * 1024 * 1024 } = {}) {
  return {
    get(sessionId) {},                    // → slot | undefined（命中则更新 LRU 序）
    ensure(sessionId) {},                 // 取不到就建空槽
    set(sessionId, patch) {},             // 浅合并
    delete(sessionId) {},
    // 槽位（拟议形状）
    // { sessionId, seq, pending: [], heights: Map<messageKey, number>,
    //   scroll, follow, draft, contextFiles, images, selectedSkill, bytes }
    stats() {},                           // { sessions, bytes, evicted }
    onEvict: null,                        // (sessionId, slot) => void，用于打日志/测试断言
  };
}
```

硬规则：

1. **只缓存视图状态与引用，绝不缓存 DOM 节点**（对齐「数据权威与 DOM 分离」）。
2. 淘汰只丢视图（滚动位置、高度表），**不丢数据**：重新打开会话时按游标重取。
3. 双上限：条数 + 估算字节；超限时**先丢 `heights`**，再整体淘汰最久未用会话。
4. 现状的 `app.js:34 views` 是同一角色的极简版（无上限、无字节统计）；拟议是把它迁进来，
   **迁移由集成负责人做**（`views` 被 `app.js` 多处引用：`94/166/167/2383/2602/2715/2800/3096/3130/3350`）。

### 3.5 后台不绘制（G4）

**新模块 `public/paint-gate.js`（拟议，05 所有）**——约 20 行：

```js
export function createPaintGate() {
  return {
    shouldPaint() {},       // document.visibilityState === "visible"
    shouldPaintItem(key) {},// 且在挂载窗口内（由 history-window 提供，可选）
    onResume(fn) {},        // visibilitychange → visible 时回调，用于一次性收口
  };
}
```

- 隐藏期间：`stream-renderer.js` 的 `mark()` 只累计 dirty，`draw()` 直接 return 并可延后；
  **`item.buffer` / `item.raw` / 权威消息一律不变**（不变量 3）。
- 回到前台：`onResume` 触发一次 `draw()`，dirty 全量补齐 → 内容与「一直可见」的结果逐字一致。
- 离屏条目（挂载窗口内但滚出视口）：由 §3.3 的窗口决定是否挂载；不挂载自然不绘制，
  不需要额外门控（**先不引入 IntersectionObserver**，等有实测需要再说）。
- **集成点**：需要在 `public/stream-renderer.js` 的 `draw()` 开头加一行判定 + 一个 `onResume` 挂钩。
  该文件是既有共享文件 → 由集成负责人（或该文件负责人）落地，05 提供 diff 与测试。

### 3.6 初步快照与 seq 实时一致性（G6）

现状已具备骨架（`app.js:2220-2234` / `2239` / `2435` / `2503`），缺口在**生命周期与归属**：

| 问题 | 拟议修法 |
| --- | --- |
| `appliedSeq` 模块级永增 | 迁进 `session-cache` 槽位（`slot.seq`），会话淘汰时随槽释放 |
| `snapshotQueue` 全局单例 | 迁进槽位（`slot.pending`）；新快照接管时清空自己的队列（与现状语义一致） |
| 分片失败后水位不前进 | 保持现状语义（**不提交水位**），但把「失败半截」标记为 `slot.stale = true`，重开时强制全量 |
| 分页 + 实时并存 | 压缩、重试、替换可能影响旧历史，不能假设旧页永久不变。页绑定 snapshotId/历史revision；revision失效则取消旧页并重新获取。实时事件按会话seq归并，历史页按稳定messageId合并，旧页不能推进实时水位。 |
| 初步快照（仅最近 N 条）与实时 | 先订阅并缓冲，原子取得绑定实例epoch、snapshotId/revision、seq的首屏；首屏数据建立后才应用水位后的事件。缓冲有字节/条数上限，失败受控重取有界首屏。实例变化时旧水位无效；不能在订阅前取快照造成空窗。 |

> 明确不做：05 不定义 seq 的作用域/单调性规则，只按 03 的定义消费；05 与06都不做第二份正文归并；沿用统一消息数据层，06仅推进显示游标。

### 3.7 搜索 / 复制 / 锚点 / 图片高度（G7）

虚拟化打破「DOM 里什么都有」这一前提，四项能力逐条给契约：

| 能力 | 拟议契约 | 独立开发时的测试替身 |
| --- | --- | --- |
| **搜索** | ① 明确声明：**虚拟化窗口外的内容不参与浏览器页内查找**（已知限制，写进 README/UI 提示）。② 提供可选「应用内搜索」：走权威数据（服务端或 `item.messages`）匹配 `messageId`，再让窗口把命中项 roll 进挂载范围。**本轮只做 ① 的声明 + ② 的接口预留**，不做完整搜索 UI。 | 纯函数 `searchMessages(items, query) -> messageId[]`（输入权威轻量数组），不依赖 DOM |
| **复制** | 选区跨未挂载区域时，DOM 还原不出文本 → 复制改走权威：从 `window.getSelection()` 取到起止条目的 `messageKey`（由节点 `data-message-key` 属性提供，内含 agentId+messageId），再反查权威 message 文本重建选区字符串。**跨未挂载边界时给明确提示**，不静默丢内容。 | 桩：给定两个 `messageId` + 选中偏移，`rebuildSelection(entries, from, to) -> string`，纯函数可测 |
| **锚点** | 把 `goalAnchors`（`app.js:84`）、重试 `anchorEntryId`（`app.js:1942`）、原文定位（`app.js:357`）、压缩折叠（`app.js:1623`）的键从 **DOM 节点 / 下标** 改为 `messageKey`。定位流程 = 先把目标 roll 进窗口 → 等一帧 → `scrollIntoView`。折叠改为窗口阶段过滤。 | `resolveAnchor(window, messageKey) -> { mountedIndex, needsRoll }`，纯函数 |
| **图片高度** | ① 首挂载测量 + 回写 `heights` + **测量后补偿滚动位置**（保锚点）。② 若能拿到宽高比则预写估算高度（前置核实：消息 block 是否有尺寸字段——**现状没有**，见 1.5）。③ 折叠/展开也走同一条测量回写路径。 | 桩：喂「先高估 200px 后实际 80px」的序列，断言滚动补偿后锚点 messageKey 的视口位置不变 |

---

## 四、文件归属与代码入口

| 文件 | 归属 | 说明 |
| --- | --- | --- |
| `public/history-window.js` | **05 新建/所有** | 虚拟窗口纯状态机（无 DOM） |
| `public/session-cache.js` | **05 新建/所有** | 有界 LRU + 每会话 seq/pending/高度表 |
| `public/paint-gate.js` | **05 新建/所有** | 可见性门控 |
| `src/session-history.js` | **05 新建/所有** | 服务端游标切片（不接协议） |
| `public/app.js` | 集成负责人独占 | 接线：`snapshot` / `placeSnapshotMessage` / `finishSnapshot` / `views` / `goalAnchors` / `foldCompaction` / `copySelection` / `selectRaw` |
| `src/server.js` | 集成负责人独占 | 路由 `session.history` |
| `src/protocol.js` | 集成负责人独占 | `session.history` schema（03 定） |
| `public/stream-renderer.js` | 共享（非 05 独占） | 仅需 2 行 hook（§3.5） |
| `public/style.css` | 共享 | spacer / 占位样式 |
| `src/sessions.js` | 共享（03/集成） | `snapshot()` 增加 `cursor` 字段；`item.messages` 仍是权威 |

关键既有入口（改动点导航）：

```
首屏/切换：   app.js:2239 snapshot()  ← 分页入口（当前吃全量 state.messages）
              app.js:2396 placeSnapshotMessage()  ← 窗口 mount 入口
              app.js:2435 finishSnapshot()        ← 水位提交
懒渲染现状：  app.js:1202-1205 renderToolDetail（未挂载即 return；收起时 replaceChildren 释放详情节点）
              app.js:1316 ontoggle          ← 已有的惰性 + 释放，保留
              app.js:1398 thinking.ontoggle / app.js:1516 skill details.ontoggle
折叠冲突点：  app.js:1623 foldCompaction()
锚点：        app.js:83 goalAnchors / 1926 anchorEntryId / 357 selectRaw
复制：        app.js:2850 copySelection
图片：        app.js:1527-1537
滚动/吸底：   app.js:209-230（scrollLatest / readFollow / atLatest）
服务端切片：  src/sessions.js:1291 snapshot() / src/pi.js:257 messageEntries()
事件 seq：    src/sessions.js:806
协议路由：    src/protocol.js:326 / src/server.js:401 / src/server.js:260
```

---

## 五、分步实施（每步可独立开发 + 桩测，再集成）

> 原则：**先桩测再集成**。每步都先让 05 的模块在「不接真 DOM / 不接真协议」的替身下跑通，再由集成负责人接线。

### 第 0 步 · 前置核实（不改代码）

1. `agent.message.end` 是否每条都带 `entryId`？（抽样一条真实会话 + 读 `src/pi.js:304-310`）
2. `SessionManager` 能否按 entryId 切片？若不能 → `src/session-history.js` 自己读 JSONL（**只读，不改写**）。
3. 03 确认 `seq` 作用域与 `session.history` schema。
4. 集成负责人确认：分页放 `session.attach` 还是新增 `session.history`。
5. 与 06 对表 `messageId` 的生成规则与「显示游标」交接点。

**产出**：一段结论记录（写进本文或 devlog），不得把未核实项写成已有。

### 第 1 步 · `history-window.js` 纯状态机（无 DOM，可完全独立开发）

- 实现 `createHistoryWindow`：`update` / `measure` / `window`。
- 测试替身：**纯数组 + 假的视口高度**，不需要 jsdom。
- 最小 check（`tests/history-window.test.js`，node:test + assert）：
  - 1000 条、视口 900px：`mounted.length` 有界（≪ 1000）；
  - 滚动到底：`totalHeight` 稳定、`mounted` 覆盖最后一条；
  - 高度测量回写后：`totalHeight` 变化、`top` 偏移自洽；
  - `maxMounted` 触发 `stale`。

### 第 2 步 · `session-cache.js` 有界 LRU

- 双上限 + 淘汰顺序（先 heights 后整槽）+ `onEvict` 钩子。
- 测试替身：**纯对象**，用假 `bytes`。
- 最小 check（`tests/session-cache.test.js`）：4 个会话 + `maxSessions=3` → 淘汰 1 个且是 LRU；
  只丢视图不丢数据（`onEvict` 收到的槽里没有消息数组）。

### 第 3 步 · `src/session-history.js` 游标切片

- 测试替身：**桩 JSONL**（手工造 300 条 message 条目 + 1 条 compaction 条目），不接 pi SDK、不接 WS。
- 最小 check（`tests/session-history.test.js`）：
  - `limit=60` 连续往回翻 → 覆盖全部条目，无重复、无遗漏（按 `entryId` 去重校验）；
  - 越过最早：`prevCursor === null`；
  - 切片顺序与 `getBranch()` 顺序一致。
- ⚠️ 若第 0 步确认 SDK 支持切片，本模块退化为薄封装（甚至删掉）。

### 第 4 步 · `paint-gate.js` + 两行 hook

- 测试替身：**假 `document`**（`{visibilityState, addEventListener}`），不加载真页面。
- 最小 check：隐藏时 `shouldPaint()===false`；`visibilitychange` → visible 触发一次 `onResume`。

### 第 5 步 · 集成分页（集成负责人接线）

- `src/sessions.js:1291 snapshot()` 增加 `cursor`（不改 `messages` 全量语义，先并存）；
- 前端 `snapshot()` 先取最近 N 条，向上滚动/点「回到最早」时补页；
- **回归现有测试**（`npm test`），确认 `session.attach` 老路径不破。

### 第 6 步 · 集成虚拟化 + 折叠/锚点/复制/图片改造

- 顺序：先 `#output` 加 spacer 与窗口挂载 → 再改 `foldCompaction`（窗口期过滤）→ 再改锚点键 → 最后改复制与图片测量。
- 每改一项都能用第 1 步的纯函数测试兜底。

### 第 7 步 · 后台不绘制 + 水位迁入缓存 + 重新采集验收

- 迁移 `appliedSeq` / `snapshotQueue` / `views` 到 `session-cache`；
- 扩展 `docs/perf-long-conversation/measure.mjs`（或新增 05 专用脚本）做第六节的验收采集。

---

## 六、验收（重新采集，不用旧数字当阈值）

### 6.1 采集前置

- ✅ 复用旧采集口径（隔离副本库 + 独立端口 + Playwright），但**必须记录新的代码版本号**（`git rev-parse HEAD`），
  并在报告里显式写「与旧基线不可比」。
- 样本至少 2 条：旧主样本 `55e7fce9…`（1831 条） + 一条短会话做对照。
- **必须做 CPU profile**（旧报告自认首屏归因是「代码候选」而非 profile 结论）——分页/虚拟化的收益归因需要它。

### 6.2 验收项与阈值（拟议）

| # | 指标 | 拟议阈值 | 采集方式 |
| --- | --- | --- | --- |
| A1 | DOM 节点数与会话总长**解耦** | 打开 1831 条会话后 `<body>` 节点数 ≤ 8000，且与消息总数**不单调相关** | `document.getElementsByTagName("*").length` |
| A2 | 首屏可见时间 | `firstOutput` 不劣于「同版本关闭虚拟化」的 A/B，且有改善 | MutationObserver + longtask |
| A3 | 单个长任务 | p95 ≤ 200ms（**待重测确认可行**，旧目标是 955ms → <200ms） | `PerformanceObserver('longtask')` |
| A4 | 滚动流畅度 | 120 帧 p95 帧时间相对**同次采集的静止基线**劣化 ≤ 10ms；滚动到底/到顶无空白 | rAF 帧间隔 + 截图目视 |
| A5 | SDK 上下文不变 | 分页前后模型请求体的 messages 条数与顺序哈希**完全相等** | 服务端日志/桩拦截 |
| A6 | 后台不绘制 | 隐藏 60s 期间 markdown 全量渲染次数 = 0；回前台 1s 内收口且文本与全量渲染一致 | 埋点计数 + 文本 diff |
| A7 | seq 一致性 | 分页 + 实时 + 后台恢复后：无重复消息、无丢失、`slot.seq` 单调 | 采样对比权威数组 |
| A8 | 内存 | 长会话首屏堆占用不劣于改造前（**同一实例内 A/B**，不做跨采样比较） | `performance.memory` + 显式 `gc()`（需 `--expose-gc`） |

### 6.3 A5 的具体做法（分页不改 SDK 上下文）

```
1) 打开长会话（分页开）→ 在 `src/pi.js` 请求构造处打印 messages.length + 顺序哈希
2) 同一条会话（分页关，走全量 attach）→ 同样打印
3) 断言两次相等
```

📌 **本文未执行该测试**，也不声称已通过；它是交付前必须补的一项。

### 6.4 待实现测试清单（明确「还没写」）

| 测试 | 归属 | 状态 |
| --- | --- | --- |
| `tests/history-window.test.js` | 05 | 🧪待实现 |
| `tests/session-cache.test.js` | 05 | 🧪待实现 |
| `tests/session-history.test.js` | 05 | 🧪待实现 |
| `tests/paint-gate.test.js` | 05 | 🧪待实现 |
| 搜索/复制/锚点/图片高度四项契约 | 05（纯函数部分） | 🧪待实现 |
| `tests/app.test.js` 扩展（jsdom 集成：spacer、窗口、折叠过滤） | 集成 | 🧪待实现 |
| A1–A8 采集脚本 | 05 + 集成 | 🧪待实现 |

---

## 七、失败安全

| 失败点 | 兜底 | 回退开关 |
| --- | --- | --- |
| 游标失效 / 历史文件变了 | 回退 `session.attach` 全量，提示「已重新加载完整历史」 | 常量 `HISTORY_PAGING=off` → 老路径 |
| 高度测量异常 / 估算离谱 | 用估算值不阻塞；spacer 用 `contain-intrinsic-size` 兜底 | 关闭虚拟化 → 全量分片快照（现状） |
| 窗口计算 throw | 单帧降级为「全量挂载」（即现状），下一帧再试 | 同上 |
| 窗口条数超 `maxMounted` | 压缩 overscan；仍超则退化为全量 | 同上 |
| 后台恢复绘制异常 | 至少一次 `renderer.flush` 全量收口；再失败则重连重放快照 | `paint-gate` 直通（恒 true） |
| 分片快照中断 | 不提交水位（现状语义），标记 stale，重开全量 | 现状行为 |
| 缓存淘汰 | 只丢视图状态；数据永远可重新取 | 无（设计保证） |
| 复制跨未挂载边界 | 显式提示「跨未加载区域，已复制可见部分」或走权威重建 | 关闭虚拟化 |

**绝不触碰**：持久历史、compaction 切点、SDK 上下文、消息内容本身。

---

## 八、集成依赖

| 依赖方 | 需要对方给出 | 本文负责的对接物 |
| --- | --- | --- |
| **03 协议** | `seq` 作用域定义；`session.history` 请求/响应 schema；错误码 | 需求清单（§3.2）+ 前端消费规则（§3.6） |
| **06 显示游标** | 归并后的权威正文 + 显示游标推进结果；**身份 `(sessionId, agentId, messageId)`** | mount/unmount 与滚动窗口；`messageKey` 提供方；**不接原始事件、不做第二 reducer** |
| **集成负责人** | 接线 `app.js` / `server.js` / `protocol.js`；`stream-renderer.js` 两行 hook；`views` → `session-cache` 迁移 | 4 个新模块 + 最小 patch 契约 + 桩测 |
| **通信层** | 只做接收与路由；消息按 `sessionId`/`agentId` 与 `seq` 分发 | 不新增通道，复用 WS 请求/响应（`src/server.js:471` 的 `{type:"response", id, ok, data}`） |
| **既有性能文档** | 采集脚本与口径（`docs/perf-long-conversation/measure.mjs`） | 新版采集脚本（扩指标 A1–A8） |

统一声明：**上述所有接口与字段名均为拟议，仓库中不存在**；先桩测，再集成。

---

## 九、交付清单

**代码（05 所有的新模块）**
- [ ] `public/history-window.js` — 虚拟窗口纯状态机
- [ ] `public/session-cache.js` — 有界 LRU + 每会话 seq/pending/高度表
- [ ] `public/paint-gate.js` — 可见性门控
- [ ] `src/session-history.js` — 游标切片（或按第 0 步结论删除）

**测试（全部 🧪待实现，交付时不得声称已通过）**
- [ ] `tests/history-window.test.js`
- [ ] `tests/session-cache.test.js`
- [ ] `tests/session-history.test.js`（桩 JSONL）
- [ ] `tests/paint-gate.test.js`
- [ ] 四项保真契约的纯函数测试（搜索/复制重建/锚点解析/图片测量补偿）

**集成补丁（提交给集成负责人，不由 05 直接改共享文件）**
- [ ] `app.js`：`snapshot` 分页入口、spacer + 窗口挂载、`foldCompaction` 窗口期过滤、锚点键改 `messageKey`、`copySelection` 走权威
- [ ] `src/protocol.js` + `src/server.js`：`session.history` schema 与路由（03 定）
- [ ] `src/sessions.js`：`snapshot()` 带 `cursor`
- [ ] `public/stream-renderer.js`：`draw()` 前 2 行门控 hook
- [ ] `public/style.css`：spacer / 占位 / `contain-intrinsic-size`

**文档与数据**
- [ ] `docs/perf-long-conversation/` 下新增 05 验收采集脚本与结果（**记录代码版本号，声明与旧基线不可比**）
- [ ] `README.md`（新模块与已知限制：页内查找不覆盖未挂载内容）
- [ ] `devlog.md`（内容/原因/时间/涉及文件）——由集成负责人统一提交

---

## 十、未决与前置核实（写成 TODO，不写成结论）

1. 🧪 `messageId` 是否由服务端统一生成？`entryId` 缺失时的兜底是否会污染长期引用？
2. 🧪 `SessionManager` 的切片能力（决定 `src/session-history.js` 是薄封装还是自己读 JSONL）。
3. 🧪 分页放 `session.attach` 还是新开 `session.history`（集成负责人拍板）。
4. 🧪 `seq` 最终作用域（03 拍板）；05 只消费不定义。
5. 🧪 页内查找限制的**用户可见表述**（提示位置与文案）。
6. 🧪 虚拟化与「吸底 / 跟随」的交互细节：现有 `scrollLatest` / `readFollow` / `atLatest`（`app.js:209-230`）以 `scrollHeight` 为准，
   窗口挂载/卸载会改变 `scrollHeight` → 需要一次 A/B 验证跟随是否会自己断开。
7. 🧪 子代理（task）消息是否也纳入同一窗口，还是仅主会话窗口（影响 `tasks.get(agentId).output` 的挂载归属）。
8. 🧪 首屏 N 的取值（暂定对齐现状 `SNAPSHOT_SYNC_MESSAGES=120`）与翻页步长（暂定 60）需实测再定。
