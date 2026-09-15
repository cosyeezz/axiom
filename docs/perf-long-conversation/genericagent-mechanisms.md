# genericagent Web 前端长对话机制对照（第 3 轮）

对照对象：本地只读克隆 `/f/tmp/GenericAgent-ro` @ `f6e5657`（`lsdefine/genericagent`）。
axiom 基线：`feat/long-conversation-perf-research` @ 本轮起点 `11c6bbd`。
本轮只读源码，未修改任何产品代码，也未运行 genericagent。

核对范围（按要求限定）：`frontends/desktop/static/*`（Web 前端）、`frontends/desktop_bridge.py`
（后端历史/流式接口）、`frontends/ga-web.js`。未做全仓库扫描。

## 一、两边数据通道的总差异（理解机制的前提）

| | genericagent | axiom |
| --- | --- | --- |
| 传输 | HTTP 走命令/数据，WS 只推小状态事件（`frontends/desktop/static/ga-web.js:33-52`） | 单条 WS 承载全部协议（`src/server.js:395-396`） |
| 首屏历史 | `GET /session/{sid}/messages?after=0&limit=0` 拉全量（`app.js:3062`；路由见 `desktop_bridge.py:20`，实现 `desktop_bridge.py:1254-1266`） | `session.attach` 一次性返回全量 snapshot（`src/sessions.js:1233-1263`，含 `messages`） |
| 增量 | 轮询 `after` 游标，单次上限 200 条（`app.js:1585`、`2996-3004`） | 服务端主动推 `agent.delta` / `agent.message.end`（`src/pi.js:287-293`），前端增量 append（`public/app.js:1820-1831`） |

结论先说：**两边在「历史获取」上不存在 axiom 缺失的能力**，差异只是通道形态。真正值得看的
是 genericagent 在前端**渲染节流**上的四层做法。

## 二、机制清单

每条格式：GA 证据 → 原理 → axiom 等价物 → 判定。

### M1 历史批量 hydrate，只做一次整表渲染
- GA：`app.js:3047-3052` 先把整批消息压进 `sess.messages`，最后只调一次 `renderAllMessages`；
  `app.js:3060-3062` hydrate 时 `limit=0` 全量；`app.js:2247-2253` 内部 `innerHTML=''` 后统一重建。
- 原理：批量入数组 + 单次 DOM 重建，避免「每来一条就重建全表」的 N 次全量重排。
- axiom 等价：**已有，实现不同**。`public/app.js:2001-2125` 的 `snapshot()` 单次遍历重建
  （清空点 `public/app.js:2029`）。实时新增消息走增量 append（`public/app.js:1820-1831`），
  不做逐条全量重绘。
- 判定：**已具备，不要重复建议**。

### M2 增量游标拉取（after + limit=200）
- GA：`app.js:1585` `POLL_MSG_LIMIT = 200`；`app.js:2996-3004` `fetchSessionPoll` 带 `afterId`；
  `app.js:3006` 起 `applyPollResult` 只 upsert 新增；后端 `desktop_bridge.py:1254-1266`、
  `desktop_bridge.py:2288-2292`。
- 原理：只传增量，且给单次响应封顶，避免长会话轮询拖垮链路。
- axiom 等价：**已有，实现不同**。axiom 用 WS 事件流，天然只传增量（`src/sessions.js:744`
  逐条 push），不需要游标。
- 判定：**已具备，不适用**（改成分页反而要牺牲回溯完整性）。

### M3 打字机节流 + 逐字步长（本清单最值得抄的一条）
- GA：常量 `app.js:2303-2306`（`TW_SPEED=10` 字符 / `TW_INTERVAL=35ms` / 积压
  `TW_CATCHUP_THRESHOLD=480` 时 ×8 加速）；调度循环 `app.js:2421-2444`，每拍只推进
  10 个字符并重绘当前轮；单帧超 60ms 时按 `backlog/3` 追平（`app.js:2437-2442`）。
- 原理：**把「重绘速率」与「token 到达速率」解耦**。无论模型吐多快，常规 DOM 重写频率与单拍新增文本都受限制、积压时才 ×8 追平；10 字符是常规步长而非硬上限，且节流只降低重绘频次，并不限制每次仍对全文 lex 的单次成本（GA 侧未实测单帧耗时）。
- axiom 等价：**部分已有，缺节流层**。`public/stream-renderer.js:27-37` 用 rAF 合并同帧多次
  `mark()`（这点比 GA 更好：同步突发被合并），但 `mark` → `paint`（`stream-renderer.js:9-25`）
  每个 rAF 都把**当前累计全文**重画一次，没有节流、没有步长：
  `public/app.js:1863-1889` 每个 delta 都 `renderer.mark(item)`。
- 实测佐证：流式尾部每帧 7–12ms、峰值 33ms（`docs/perf-long-conversation/stream-render.json`，
  Chromium 152 / Playwright，样本 `55e7fce9`）。按 60fps 计即 42%–72% 主线程占用，且随文本
  增长继续恶化。
- 判定：**适用（高优先级）**。原因：axiom 已有 rAF 合并，只要补上「按时间/字符双重节流」这一层，
  就能降低单位时间重绘次数；但若每次重绘仍对全文 lex，单帧成本仍随文本长度增长，需与 M4 的「限制 re-lex 范围」配合才可能把单帧成本压下来。不需要引入打字机动画，只需限制重绘频率与步长。

### M4 只重绘当前轮，历史轮冻结
- GA：`app.js:2425-2447` `ensureDraftFrozenThrough` 把已完成 turn 渲染成 `.turn-frozen`；
  `app.js:2448-2458` `freezeCurrentTurnDom` 固化为折叠壳；`app.js:2460+` `paintDraft` 只动
  `.turn-cur` 一个节点；`app.js:1291-1303` `tryPatchInflightToolDom` 对流式中工具块只改
  `textContent`，跳过整轮 marked。
- 原理：一次流式回答按 turn 切段，已完成的段只渲染一次、之后永不进入重绘路径；每帧只重建
  一个 turn 的子树。
- axiom 等价：**无等价物，但部分收益已由别的机制拿到**。axiom 每次 delta 都
  `renderer.mark(item)`（`public/app.js:1889`）；`public/markdown.js:213-215` 有块级缓存
  （`cache.get`/`cache.set` 于 `public/markdown.js:4,315`），未变块跳过替换，但
  `public/markdown.js:219-220` 每帧仍对**整个消息文本**跑一遍 `marked.lexer`。
- 判定：**部分适用（高优先级）**。适用的是「每帧全量 lexer」这一项——axiom 的 assistant 消息
  本来就按 turn 边界拆成独立 message（`src/pi.js:123`、`src/pi.js:287-293`），所以 GA 的「轮冻结」
  对 axiom 收益有限；真正该抄的是**限制每帧 re-lex 的文本范围**，而非照搬 turn 折叠。

### M5 旧轮按轮折叠 `renderTurnFold`
- GA：`app.js:1263-1272` 单轮包成 `<details class="fold fold-turn">` 默认收起；
  `app.js:2164-2174` 历史轮走折叠壳、当前轮走 `.turn-cur`。
- 原理：减少可见 DOM 与首屏绘制量。
- axiom 等价：**已具备同类能力，只是分层不同**——消息级折叠用 compaction
  （`public/app.js:2050-2090` `folded`/`compactionCard`）；工具级折叠用 call-group
  （`public/app.js:731-748`、`905-921`）；目标轮次分组用 `public/goal.js:518-540`
  （`goal-folded`）。缺的只是「单条 assistant 消息**内部**再按轮折叠」，而 axiom 里
  **一条 message 就是一个 turn**。
- 判定：**不适用**。再按轮折叠等于折叠消息本身，与 compaction / call-group 语义重叠，
  属于重复建议。折叠机制评估见第 3 轮汇总（第 4 轮报告）。

### M6 展开时才渲染（details.ontoggle 惰性）
- GA：`app.js:1291-1303`（live 工具折叠只改 `pre.textContent`）；`app.js:2306-2337`
  `bindDraftInteractGuard`（这条其实是 M7）。
- axiom 等价：**已有，且覆盖更全**——`public/app.js:1160` 工具详情 `ontoggle` →
  `renderToolDetail`，`public/app.js:1048-1049` 未展开直接 return；`public/app.js:1239-1241`
  thinking 展开才 `renderer.mark`；`public/app.js:1329` 技能详情展开才 `renderMarkdown`。
- 实测佐证：332 个 tool-record 全部置 `open` 后同步强制布局 4.1ms 且 DOM 节点数不变。注意：改 `open` 属性会异步派发 `toggle`，该计时只覆盖属性设置 + 同步布局，不含异步入场处理，不能作为详情渲染完成的耗时；惰性渲染由源码早退（`public/app.js:1049`）与 `ontoggle`（`public/app.js:1160`）确认。单个 3–10ms（`docs/perf-long-conversation/scroll-fold.json`）。
- 判定：**已具备，不要重复建议**。

### M7 用户交互期间暂停 DOM 重写
- GA：`app.js:2306-2308` `DRAFT_INTERACT_MS = 520`；`app.js:2325-2337`
  `bindDraftInteractGuard` 监听 `mousedown` / `wheel` / `toggle`，命中 `details summary`、
  `.code-block pre`、`.fold-pre` 就 arm 冻结；`app.js:2434` 冻结期间 tick 直接 return。
- 原理：用户正在展开折叠或滚动代码块时，**让出渲染**，避免流式重写把手势打断。
- axiom 等价：**无**。`public/app.js:195-204` 的 `scrollLatest` 只在滚动跟随层面做 rAF 合并，
  但 `public/stream-renderer.js:10-25` 的 `paint` 只有文本变化守卫（`paintedText`/`paintedProcess`/
  `paintedReasoning`，未变则跳过），**没有任何「交互期间让路」判定**；文本在变时下一个 rAF 仍会重写。
- 判定：**适用（中优先级）**。这直接对应「交互发涩」：用户展开详情/滚动代码块时，
  流式仍在重写同一子树，造成抖动与掉帧（机制确认，未单独量化交互延迟）。

### M8 后端历史截断/分页策略
- GA：`desktop_bridge.py:1254-1266`（`after` + `limit`，200 默认）、`desktop_bridge.py:925-953`
  `snapshot` 可 `include_messages=False` 只取元信息。
- axiom 等价：`src/sessions.js:1233-1263` attach 全量、无分页参数。
- 判定：**不适用**。axiom 靠事件增量推送替代轮询分页，前端仍需全量历史才能往回翻；
  并且 GA 的增量游标分页首屏以 `limit=0` 拉全量，本身也不减传输。不过**真正的按需历史分页
  （只取可视范围）可能降低初始构建量**，本判定不否认这一点，只是它要求改后端协议与前端存储模型。

### M9 滚动贴底判定与 rAF 合并
- GA：`app.js:2294-2301` `isNearBottom(80px)` + rAF 内写 `scrollTop`。
- axiom 等价：**已有，实现相近**：`public/app.js:195-204`；另有 `growthWatch`
  （`public/app.js:207` 起）处理图片/折叠引起的增高跟随。
- 判定：**已具备**。

### M10（补漏）刷新/重连时不重播动画，一次对齐
- GA：`app.js:2340-2358` `snapDraftRecover`。
- axiom 等价：无对应问题（axiom 无打字机动画），**不适用**。

### M11（补漏）conductor 页面与 chatapp_common 的取舍
按约束同时核对了约束点名的 `frontends/conductor.html` 与 `frontends/chatapp_common.py`：
- `conductor.html:359-605` 是内联脚本的 IM 中继管理页，靠 WS 推 `data.chat` 后
  `messagesEl.innerHTML=''` 整体重画（`conductor.html:540-542`），**没有任何长会话渲染优化**，
  只适合短管理列表。作为反例：它说明「整体重画」在小数据量下可行、在 axiom 的 1831 条消息上
  就是第 2 轮实测的 955ms 长任务。
- `frontends/chatapp_common.py:60-77` `split_text(limit)` 与 `AgentChatMixin`（`255-330`）是
  IM 前端（TG/QQ/微信等）的**消息长度分片**与命令处理，解决的是平台单条消息长度上限，
  与 Web 渲染无关。
- 判定：**不构成可移植的渲染机制**，仅作为「全量重画」反例记录。

## 三、分类结论

**「axiom 已具备但实现不同」——不要再提**：M1、M2、M6、M9。
**「axiom 确实缺失」——值得做**：
1. M3 流式重绘节流与步长（高）：`public/app.js:1863-1889` → `public/stream-renderer.js:9-25`。
   实测支撑：7–12ms/帧、峰值 33ms（微基准口径，与文本长度同向变化）。
2. M4 中的「每帧全量 lexer」（高）：`public/markdown.js:219-220`。axiom 已有块级 DOM 缓存，
   缺的是把 lex 范围限定在变化块/变化尾部。
3. M7 交互期间让出渲染（中）：axiom 无对应机制，`public/stream-renderer.js:10-25` 有文本变化守卫但无交互让路。

**「不适用 / 会重复」**：M5（轮折叠与 axiom 消息边界、compaction、call-group 重叠）、
M8（分页不解决渲染成本）、M10。

三条适用结论的共同点：**都不要求改数据结构或后端协议**，只改前端渲染调度的粒度，
与第 2 轮实测（首屏 1171ms / 39,947 DOM 节点 / 50.6MB 堆）指向的成本大头并不冲突。
