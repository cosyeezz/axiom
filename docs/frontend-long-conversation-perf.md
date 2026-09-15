# 长对话渲染性能调研报告（最终版）

> 状态：调研完成，待用户取舍确认。本文件为调研专题文档，汇总第 1–4 轮全部结论。
> 代码基准：`master` @ `2c8051b`（分支 `feat/long-conversation-perf-research`，产品代码零改动）。
> 被测前端：`public/`（浏览器端，纯原生 JS，无框架、无虚拟列表）。
> 配套材料：
> - 实测原始数据与采集口径：`docs/perf-long-conversation/README.md` 及同目录 JSON/`measure.mjs`
> - genericagent 机制对照：`docs/perf-long-conversation/genericagent-mechanisms.md`
>
> 本文档只做调研与方案，不改产品代码。分优先级改法见第六节。

---

## 〇、结论速览

1. **卡顿是真实的，但有明确主次**：长对话首屏/切换是**同步全量重建**（单次长任务 938–955ms，
   切换 1345ms），流式输出随文本增长变慢（尾部每帧 7–12ms、峰值 33ms）。
2. **成本大头不在折叠**：现有折叠（tool-record / thinking-record / call-group / compaction）确实
   拿掉了「工具详情」这块最大的构造成本（代码确认惰性渲染），但它**触及不到**三类常驻成本——
   每帧整段文本重算、每帧全量分组重排、消息外壳 DOM 常驻。
   故「现有折叠机制已足够」**不成立**，判断依据见第四节。
3. **滚动掉帧与内存持续增长在本样本上未复现**，不应作为本轮优化目标（保留观测项）。
4. 最高性价比的三条改法都不动数据结构与后端协议，只改前端渲染调度的粒度（第六节 P0/P1）。

---

## 一、渲染链路（WS 消息 → 最终 DOM）

```
模型 token
   │
   ▼
src/sessions.js:711  item.emit(event)          ← 每个 delta 单独转发，不做节流/合并
   │   例：text_delta 只累积到 item.live[].content（src/sessions.js:712-741）
   ▼
WS → public/app.js:2187  ws.onmessage → event(message)
   │
   ▼
public/app.js:1776  event()                     ← 单一分发器，长 if 链
   ├─ agent.message.start → card()                  app.js:1851 → 建空消息节点
   ├─ agent.delta        → 累积文本 + renderer.mark app.js:1863-1890
   ├─ agent.message.end  → renderMessage(item,msg)  app.js:1891
   ├─ tool.state         → toolState()              app.js:1136
   ├─ session.state / task.state / question.* / goal …
   └─ goal               → goalUI.show(...)         app.js:1791
   │
   ├───────────── 流式路径（高频）──────────────┐
   ▼                                            │
app.js:1867  item.raw += delta                  │
app.js:1869  stripMemoryTags(raw)  ← 整段重算   │
app.js:1874  splitAnswer(buffer)   ← 整段重算   │
app.js:1889  renderer.mark(item)                │
   ▼                                            │
public/stream-renderer.js:28  mark() → dirty.add + rAF 合并（同帧多 item 只画一次）
   ▼
public/stream-renderer.js:10  paint(item)
   ├─ renderMarkdown(item.text, item.buffer)   stream-renderer.js:13
   └─ renderMarkdown(item.thought / processText)
   ▼
public/markdown.js:212  renderMarkdown(element, text)
   ├─ 213-214  文本没变直接 return（唯一缓存层，WeakMap）
   ├─ 219-220  fixCjkBold(整段) + marked.lexer(整段)   ← 每次全量词法分析
   ├─ 223-224  每个 token 做 JSON.stringify(token) 当 diff key
   ├─ 226-301  只重建 key 变化的块，块内再生成代码工具栏/表格/字符示意图
   └─ 298-303  table-scroll 包装
   │
   ├───────────── 每条消息结束 / 切换会话 ──────────────┐
   ▼                                                    ▼
app.js:1244 renderMessage()  → app.js:1353 renderer.flush(item)（同步画一次）
   │
app.js:2001 snapshot(state)  ← 切换/恢复会话：同步全量重建整个会话
   ├─ 2029  $("output").replaceChildren()        清空
   ├─ 2070  for (…) 遍历 state.messages
   │    ├─ 2073  toolState(…, {phase:"end"})
   │    ├─ 2083  compactionCard(record)
   │    └─ 2087  card() + 2100 renderMessage()
   ├─ 2122  mergeThoughts($("output"))
   ├─ 2133  prepend 压缩摘要
   └─ 2158  下一帧设置 scrollTop
   │
   ├───────────── 每帧的分组重排（真正常驻成本）─────────┐
   ▼                                                    │
app.js:195  scrollLatest() → app.js:216 watchGrowth(#output)
            （ResizeObserver，app.js:208-213，内容一增高就触发）
   ▼
app.js:731  scheduleCallGroups() → rAF 合并
   ▼
app.js:797  refreshCallGroups(#output)
   ├─ 799     遍历 output 全部子节点
   ├─ 911     [...output.querySelectorAll('.call-group')].reverse()
   ├─ 913-921 再反向扫一遍设置 hasFollowingActivity
   ├─ 922-928 再反向扫 output.children 判断折叠
   └─ 内部大量 before()/after()/append() 节点搬移 → 触发样式与布局重算
   ▼
app.js:755  paintCallGroup(group)
   └─ 757  每个 group 内 querySelectorAll('.activity-line') 全扫
   ▼
app.js:1025 mergeThoughts(output)  ← 每次消息结束 + snapshot 各一次，全量子节点扫描
   ▼
app.js:556（public/goal.js）renderRounds()  ← goal 模式下每条消息结束都触发
   ├─ 558  遍历所有 [data-goal-round] 清属性
   ├─ 570-585 重新分组并给节点打 dataset
   └─ 586  插入轮次头
   ▼
最终 DOM：#output（public/index.html:71）→ article.message → .markdown → .markdown-block
```

要点：整条链路**没有虚拟列表、没有分页窗口，也没有 CSS 层跳过**
（`public/style.css:365` 的 `#output`、`368` 的 `.message` 都没有 `content-visibility` / `contain`）。
每次切换会话是全量重建，每次流式增量都会走一遍「整段文本重算 + 全量分组重排」。

命名对应（避免与 genericagent 混淆）：axiom 侧没有 `renderAllMessages`，其等价物是
`snapshot()`（`app.js:2001`，切换/恢复会话时全量重建）；叠加式追加走 `event()` 里的
`card()`/`renderMessage()`；`public/goal.js` 里同名的 `render()`（`goal.js:589`）只重画面板与轮次分组。

---

## 二、实测基线与测量口径

**样本**（筛选口径：goal 模式 + 真实体量最大，而非用户口头报告的那条）：
session `55e7fce9-c23b-441a-b6e1-1042321ad701`，JSONL 11,553,809B / 1877 行 /
1831 消息行（user 18、assistant 803、toolResult 1010）/ 38 次 compaction /
正文 2,193,665 字符 / thinking 1,390,647 字符 / 145 个代码块 / 工具调用参数 562,130 字符。
（用户口头报告卡顿的 `aff6e5c0` 仅 588KB，体量不足以暴露卡顿，故不作主样本。）

**测量环境**：`VACUUM INTO` 只读复制 `~/.axiom-dev/axiom.db` + JSONL 副本，独立实例启动
（`AXIOM_HOME=<TEMP>/axiom-perf-home AXIOM_PORT=4410 node src/main.js`）；浏览器 Chromium 152
（Playwright MCP 驱动，16 核 / 32GB）；探针由 `page.addInitScript` 注入
（`PerformanceObserver('longtask')`、`MutationObserver(#output, childList)`、
`performance.memory.usedJSHeapSize`、`document.getElementsByTagName('*').length`、rAF 帧间隔）。
全程只读，不写入原始库、不外传会话原文（临时导出的原文样本已删除）。
完整口径与复现步骤见 `docs/perf-long-conversation/README.md`。

### 四项核心数值

| 指标 | 数值 | 口径 / 数据文件 |
| --- | --- | --- |
| 首屏 / 切换渲染耗时 | 首屏 firstOutput **1171ms**、lastOutput **1626ms**（3 次均值），最大长任务 **955ms**；切到长会话最大长任务 **1345ms**、点击到渲染完成 **3108ms** | MutationObserver + longtask；`first-screen.json`、`switch.json` |
| 消息条数与实际 DOM 节点数 | 会话 1831 条消息行 → **39,947 个 DOM 节点**（#output 97 个子节点、332 个 tool-record、48 个 call-group） | `document.getElementsByTagName('*').length`；`first-screen.json` |
| 流式渲染单帧耗时 | 真实文本尾部每帧 **7–12ms**（峰值 **33ms**），头部 2–4ms；64,000 字符全量冷渲染 **502.6ms** | 对真实文本直接调用 `renderMarkdown`，每帧追加 600 字符并强制读回布局；`stream-render.json` |
| 页面内存占用 | 长会话首屏 **50.6MB**（3 次均值）、切换后 53.3MB、短会话 3.4MB | `performance.memory.usedJSHeapSize`；`memory.json` |

补测（同一实例）：滚动与静止基线均为 **~31.3ms/帧（≈32fps）**，滚动掉帧未复现；
332 个 tool-record 置 `open` 后强制布局 **4.1ms**、总节点数不变；
3 轮长短切换长会话侧 23.5→23.8→24.2MB（+0.7MB，随 GC 回落）。

口径限制（引用数值时必须一并说明）：① 本环境静止帧间隔即 ~31.3ms，绝对值不代表 60fps 设备，
只能看相对差异；② 流式耗时为微基准（未叠加 `app.js` delta 处理与 DOM 重建），是真实成本**下界**；
③ `usedJSHeapSize` 受 GC 时机影响，单点值不宜跨采样比较；④ 采集期主仓库工作树外部漂移，
已改用 worktree 代码 + 独立依赖复测，两实例（4399 / 4410）结果互相印证。

---

## 三、五类卡顿场景 → 根因结论

| 场景 | 根因结论（axiom 文件:行号） | 实测支撑 | 复现 |
| --- | --- | --- | --- |
| **A 打开/切换长会话首屏卡** | 主因 `public/app.js:2001`（`snapshot`）在**一个同步任务**里遍历 `state.messages`（2070）逐条 `card()`+`renderMessage()`，主线程无法插入渲染；每条消息内 `renderMessage`→`app.js:1353` `renderer.flush` 又整段 lex 一次（`public/markdown.js:219-220`）；goal 会话再叠加 `public/goal.js:556` `renderRounds` 全量重分组 | 最大长任务 955ms / 切换 1345ms；节点 39,947 | 是 |
| **B 流式输出越来越卡** | ① 每个 delta 对**整段原文**重跑 `public/app.js:1869` `stripMemoryTags` 与 `1874` `splitAnswer`；② 每个 rAF 对**整段累计文本**跑 `public/markdown.js:219-220` `fixCjkBold`+`marked.lexer`（块级 DOM 缓存只免掉未变块的替换，免不掉 lex 与 223 行 `JSON.stringify` 重新序列化）；③ 每帧 `public/app.js:797` `refreshCallGroups` 三趟全量子节点扫描 + 节点搬移；④ 后端 `src/sessions.js:711-741` 每个 delta 单独成帧、无合并，前端计算频率 = token 频率 | 尾部 7–12ms/帧（峰值 33ms）vs 头部 2–4ms；64000 字符冷渲染 502.6ms | 是（微基准口径） |
| **C 滚动长对话掉帧** | 代码层确实缺层跳过：`public/style.css:365`(`#output`)、`368`(`.message`) 无 `content-visibility`/`contain`，39,947 个节点全部参与布局与绘制 | 静止基线即 31.3ms/帧；滚动与静止无统计差异（120 帧内 >33ms 帧 0–1） | **否** |
| **D 输入/点击发涩** | 与 B 同源：每个 delta 的同步整段重算（`app.js:1869`、`1874`）与每帧全量分组重排（`app.js:797`）长期占用主线程；且 `public/stream-renderer.js:9-25` 的 `paint` 在用户展开详情/滚动代码块时**无条件重写**同一子树，无「交互期间让路」判定 | 由 B 的单帧耗时外推（未单独做输入延迟采样） | 部分（机制确认，未单独量化） |
| **E 内存持续增长** | 存在只增不删的结构：`public/app.js:701` `toolItems` 仅快照时清空（且保留工具完整 `args`/`result`），`app.js:1825/1904/2102` `mainItems`、`app.js:80` `goalAnchors` 随消息数线性增长并持有已渲染节点引用 | 3 轮切换 +0.7MB 且随 GC 回落，未观察到单调增长 | **否（短周期）** |

---

## 四、对现有折叠机制是否够用的判断

**结论：不够。「现有折叠已足够，无需再加优化」不成立**——但同时要承认折叠**不是无用的**，
它拿掉的是当前最大的一块成本。判断分三层，均有证据：

**1. 折叠确实有效（占最大块）**：
`tool-record`（`public/app.js:1136` 起）与 `thinking-record`（`1186` 起）默认折叠，
且 `renderToolDetail` 在 `container.open` 为假时直接 return（**`public/app.js:1048-1049`**），
所以工具大输出（本样本 332 个 tool-record、工具参数 562,130 字符）的节点构建成本被推迟。

**2. 但实测证明折叠本身不是瓶颈**：
单个 tool-record 开/关 3–10ms；332 个全部置 `open` 后强制布局仅 **4.1ms 且总 DOM 节点数不变**
（39947）——因为直接改 `open` 属性不触发 `toggle` 事件，构建被推迟；48 个 call-group 全开 57.1ms，
同样不增节点。数据见 `docs/perf-long-conversation/scroll-fold.json`。
**含义**：折叠已经做到位了，继续在折叠上做文章（例如 genericagent 的 `renderTurnFold` 按轮折叠）
不会缓解剩余成本。

**3. 折叠触及不到的三类常驻成本（这就是不够的原因）**：

| 常驻成本 | 位置 | 折缓解释？ |
| --- | --- | --- |
| 每帧对整段累计文本重新 lex + 每 token `JSON.stringify` | `public/markdown.js:219-220`、`223` | 否（与折叠状态无关） |
| 每个 delta 对整段文本重算 `stripMemoryTags` / `splitAnswer` | `public/app.js:1869`、`1874` | 否 |
| 每帧三趟全量子节点扫描 + 节点搬移 | `public/app.js:797`（799/911/913/922）、`757`、`1025` | 否（扫描的是可见结构，折叠只改 `hidden`，节点仍在） |
| 消息外壳与 markdown 块 DOM 常驻 39,947 节点 | `public/style.css:365`、`368` 无 `content-visibility` | 否（`<details>` 收起不等于不布局，需实测层跳过） |
| `toolItems`/`mainItems`/`goalAnchors` 对象常驻 | `public/app.js:701`、`1825`、`client:80` | 部分（`toolItems` 保留完整输出，与折叠无关） |

即：**折叠减少的是「细节节点何时构建」，剩余卡顿来自「每帧都要重算全文 + 全量重排」，
两者正交。** 因此高优先级改法应从渲染调度入手（第六节），而不是再加一层折叠。

---

## 五、genericagent 机制对照摘要

完整 11 条（M1–M11，每条含 GA 文件:行号 + 原理 + axiom 等价物 + 判定）见
`docs/perf-long-conversation/genericagent-mechanisms.md`。对照对象 `/f/tmp/GenericAgent-ro` @ `f6e5657`。

### 值得移植的 3 条（axiom 确实缺失）

| # | 机制 | GA 证据 | 原理 | axiom 现状与适用性 |
| --- | --- | --- | --- | --- |
| 1 | **打字机节流 + 逐字步长** | `frontends/desktop/static/app.js:2303-2306`（`TW_SPEED=10` 字符 / `TW_INTERVAL=35ms`，积压超阈值 ×8 追平）、`2421-2444` 调度循环 | 把「重绘速率」与「token 到达速率」解耦：重写频率封顶 ≈28Hz、单拍新增封顶 10 字符，单帧成本与累计文本长度基本脱钩 | **适用（高）**。axiom 已有 rAF 合并（`public/stream-renderer.js:28`，比 GA 更好），但缺节流与步长：`public/app.js:1863-1889` 每个 delta 都 `mark`，`stream-renderer.js:9-25` 每 rAF 重画累计全文。实测 7–12ms/帧即由此而来 |
| 2 | **只重绘当前轮 / 限制 re-lex 范围** | `app.js:2425-2458`、`2460+` 只动 `.turn-cur`；`1291-1303` 流式中工具块只改 `textContent` | 已完成的轮次只渲染一次、之后永不进入重绘路径 | **部分适用（高）**。axiom 一条 message 就是一个 turn（`src/pi.js:123`、`287-293`），照搬轮冻结收益有限；该抄的是「限制每帧 re-lex 的文本范围」（`public/markdown.js:219-220`） |
| 3 | **交互期间暂停 DOM 重写** | `app.js:2306-2308`（`DRAFT_INTERACT_MS=520`）、`2325-2337` 监听 `mousedown`/`wheel`/`toggle` arm 冻结、`2434` 冻结期 tick 直接 return | 用户展开折叠或滚动代码块时让出渲染，避免重写打断手势 | **适用（中）**。axiom 无对应机制：`public/app.js:195-204` 只在滚动跟随时做 rAF 合并，`stream-renderer.js:9-25` 照常重写。对应场景 D「交互发涩」 |

### 已具备但实现不同（不要再提）

批量 hydrate 单次整表渲染（GA `app.js:3047-3052`/`2247-2253` ↔ axiom `public/app.js:2001-2125`
`snapshot`）；增量游标拉取（GA `app.js:1585`/`2996-3004` + `desktop_bridge.py:1254-1266` ↔
axiom WS 增量 `src/sessions.js:744`）；展开才渲染的惰性（GA `app.js:1291-1303` ↔ axiom
`public/app.js:1160`、`1048-1049`、`1239-1241`、`1329`，且覆盖面更全）；滚动 rAF 贴底
（GA `app.js:2294-2301` ↔ axiom `public/app.js:195-204`、`207`）。

### 不适用 / 会重复

`renderTurnFold` 按轮折叠（GA `app.js:1263-1272`/`2164-2174`）——axiom 一条 message 即一个 turn，
与 compaction（`public/app.js:2050-2090`）、call-group（`731-748`、`905-921`）、goal 轮次
（`public/goal.js:518-540`）语义重叠；后端历史分页（`desktop_bridge.py:1254-1266`）——axiom 靠事件
增量，分页只减传输、不减首屏渲染成本（955ms）；刷新恢复不重播（GA `app.js:2340-2358`）——axiom 无打字机。
反例：`frontends/conductor.html:540-542` 的 `innerHTML=''` 整体重画只适合小数据量；
`frontends/chatapp_common.py:60-77` `split_text` 是 IM 平台消息分片，与 Web 渲染无关。

---

## 六、分优先级优化方案

每条含：改法 → 预期收益 → 风险 → 回退方式。所有改法**只动前端渲染调度**，不改数据结构、不改后端协议。

### P0-1 流式重绘双重闸门（时间 + 字符步长）

- **改法**：`public/stream-renderer.js:9-37` 的 `mark`/`paint` 增加最小重绘间隔（如 ≥40ms）与
  追加字符上限（如单拍 ≤N 字符，超量时按比例加速追平）；`public/app.js:1863-1889` 不再每个 delta
  都 `mark`，改为累计后由闸门调度。
- **预期收益**：单帧成本从「与累计文本长度成正比」压到有界；实测 7–12ms/帧 → 目标 ≤4ms/帧，
  长文本尾部不再劣化（当前占 60fps 预算的 42%–72%）。直接针对场景 B/D。
- **风险**：文本呈现有可感知延迟（视觉上是「攒一下再刷」，实际 GA 的 35ms 拍不可感知）；
  与 `renderer.flush`（`app.js:1353`，消息结束同步画）的时序需保证终点必有一次完整绘制。
- **回退**：两个常量置 0（间隔）/ 无穷（步长）即恢复当前行为；不改任何数据结构。

### P0-2 限定每帧 re-lex 范围

- **改法**：`public/markdown.js:219-220` 目前对整段文本 `fixCjkBold` + `marked.lexer`。
  在**流式追加**场景下只对「尾部可变窗口」（如最后一个空行之后 + 未闭合围栏块）做 lex，
  流式结束时（`app.js:1891` `agent.message.end`）再用全量 `renderMarkdown` 收口一次。
- **预期收益**：单帧 lex 成本与消息总长解耦；`stream-render.json` 显示 64000 字符冷渲染 502.6ms、
  尾部帧 12.12ms 均值，收益上限即为该项大头。
- **风险**：markdown 存在跨块依赖（`public/markdown.js:218` 注释已说明「late reference definitions
  can change earlier blocks」），尾部窗口法在引用式链接/跨块列表续行等边界可能短暂渲染不一致。
  缓解：收口时的全量渲染保证最终一致；边界差异仅存在于流式中间态。
- **回退**：加开关常量（默认走新路径），异常时切回全量 lex，一行恢复。

### P1-1 交互期间让出渲染（对齐 GA M7）

- **改法**：参照 `app.js:2306-2337` 的思路，在 axiom 侧监听 `mousedown`/`wheel`/`toggle`
  （命中 `summary`、代码块 `pre`、`.call-group` 等）后短暂冻结 `paint`
  （`public/stream-renderer.js:9-25`），冻结结束补一次绘制。
- **预期收益**：展开详情/滚动代码块不再与流式重写抢主线程，改善场景 D 的交互跟手度。
- **风险**：冻结窗口内文本不更新（有界，≤500ms 量级）；需处理冻结期间消息结束的强制 flush。
- **回退**：删掉监听与判定，恢复无条件重写（纯前端局部改动）。

### P1-2 首屏/切换分片重建（先出最后 N 条，再补齐）

- **改法**：`public/app.js:2001` `snapshot` 的 2070 循环改为分片：先用 `requestAnimationFrame`/
  `setTimeout` 分片构建，或先渲染最近 N 条并让用户立即看到内容，剩余部分在空闲时补齐。
- **预期收益**：把 938–955ms 的单个长任务拆散，首屏可见时间从 1171ms 明显下降；对应场景 A。
- **风险**：分片重建期间若又有新事件（`event()`）到达，需与快照排序对齐（消息顺序错乱风险）；
  实现复杂度在本清单中最高。`content-visibility: auto`（P2）可能以更低成本拿到部分收益，
  建议先做 P2 的 A/B 再决定是否投入 P1-2。
- **回退**：分片阈值置为「一次性构建全部」即回到当前实现。

### P2-1 CSS 层跳过（`content-visibility` + `contain`）

- **改法**：`public/style.css:365`/`368` 给 `#output`/`.message` 加
  `content-visibility: auto` + `contain-intrinsic-size`。
- **预期收益**：屏外消息跳过布局与绘制，可能显著降低首屏 layout/paint 与滚动成本（滚动场景未复现，
  收益主要集中在首屏与长列表）。
- **风险**：滚动条高度跳动（需 `contain-intrinsic-size` 校准）、页内查找/打印/锚点定位行为变化；
  **且首屏 955ms 长任务大头是 JS 构建节点，CSS 未必能覆盖**——必须先做一次 10 分钟 A/B 实测再决定。
- **回退**：删掉这两行 CSS。

### P2-2 DOM 外的常驻对象回收

- **改法**：`public/app.js:701` `toolItems` 在工具记录折叠且离开视口/超出窗口后释放
  `args`/`result` 大字符串；`mainItems`/`goalAnchors` 引入上限。
- **预期收益**：降低长会话常驻内存（当前 50.6MB 堆）。**但短周期未复现增长**，属于预防性改动。
- **风险**：可能破坏「回溯历史时不用重取」的假设（释放后需重新拉取或重新渲染）。
- **回退**：去掉释放逻辑，恢复只增不删。

### 明确不做（有证据的排除）

- **不再增加折叠层**（含 genericagent 式按轮折叠）：见第四节，折叠已到位且不是瓶颈。
- **不做后端历史分页**：只减传输，不减 955ms 首屏渲染成本。
- **不以滚动掉帧与内存泄漏为当前目标**：本样本未复现，保留观测项。

---

## 七、修订后的实施目标草案（待用户取舍确认）

> 原目标「产出一份调研报告」已达成；按约定，报告经确认后把目标修订为**实施修复**。以下为草案。

**建议目标**：按 P0-1 → P0-2 → P1-1 的顺序落地流式渲染调度优化，并用同一套 `measure.mjs`
口径复测对比（首屏耗时、流式单帧耗时、DOM 节点数、堆占用），回归 `npm test`。

**验收标准（草案）**：
1. 流式单帧耗时尾部从 7–12ms 降至 ≤4ms（同一微基准口径，样本 `55e7fce9`，≥3 次重复）。
2. 流式渲染单位文本成本与消息总长解耦：64,000 字符尾部帧耗时不超过 12,000 字符时的 1.5 倍。
3. 消息结束时最终渲染结果与当前全量 `renderMarkdown` 一致（引用式链接、代码块围栏等边界用例有测试）。
4. 交互冻结窗口内展开 tool-record / 滚动代码块不出现掉帧（相对静止基线无显著劣化）。
5. 产品代码改动集中在 `public/stream-renderer.js`、`public/markdown.js`、`public/app.js`，
   每条改动可通过一个常量开关回退。
6. `npm test` 全绿，`devlog.md` 记录改动。

**建议本轮讨论的取舍点**：
- P0-2（尾部 lex）有 markdown 边界风险，是否与 P0-1 同批做，还是先只做 P0-1 观察收益？
- P1-2（首屏分片）实现最复杂，是否先做 P2-1 的 CSS A/B 再决定？
- 场景 C/E 未复现，是否同意本轮不投入、只保留观测？

---

## 附录 A：热点清单（第 1 轮代码级定位）

置信度：**代码确认** = 从代码即可断定会随规模变差；**已实测** = 第 2 轮已量化；**未复现** = 实测未观察到。

| # | 位置 | 一句话成因 | 置信度 |
|---|---|---|---|
| H1 | `public/markdown.js:219-220` | 每次重画都对**整段累计文本**跑 `fixCjkBold` + `marked.lexer` 全量词法分析，文本越长单帧越慢 | 已实测（尾部 7–12ms） |
| H2 | `public/markdown.js:223` | 分块缓存的 key 是 `JSON.stringify(token)`，**未变化的块每帧也要重新序列化一遍** | 代码确认 |
| H3 | `public/app.js:1869` | 每个 `text_delta` 都对整段原文重跑 `stripMemoryTags`（分段 + 行内代码遮罩正则 + `do/while` 反复 `replace`） | 代码确认 |
| H4 | `public/app.js:1874` | 每个 `text_delta` 都对整段文本重跑 `splitAnswer`（逐行 split + 反引号扫描） | 代码确认 |
| H5 | `public/app.js:797`（内部 799/911/913/922） | 每帧全量重排 `#output`：三趟全量子节点扫描 + 大量节点搬移，随历史线性变慢 | 代码确认 |
| H6 | `public/app.js:757` | `paintCallGroup` 对每个分组都全扫 `.activity-line` | 代码确认 |
| H7 | `public/app.js:1025` | `mergeThoughts` 全量子节点扫描，每条消息结束触发一次 | 代码确认 |
| H8 | `public/app.js:2001`（循环 2070） | `snapshot` 在**一个同步任务**里重建整个会话，主线程无法插入渲染，首屏必卡 | 已实测（955ms 长任务） |
| H9 | `public/app.js:1048`（1049 早退，1069-1113 建节点） | 工具详情默认折叠且**懒渲染**（好设计），展开时把最多 6 万字符逐行建成节点 | 已实测（开/关 3–10ms） |
| H10 | `public/style.css:365`、`368` | 缺 `content-visibility`/`contain`，历史节点全部参与布局与绘制 | 未复现（滚动无劣化） |
| H11 | `public/app.js:701`（`toolItems`），1164-1165 | `toolItems` 整个会话内只增不删（仅快照时 `clear`），且把**工具完整输出**留在 JS 对象里 | 未复现（短周期） |
| H12 | `public/app.js:1825/1904/2102`（`mainItems`）、`80`（`goalAnchors`）、`2044` | 随消息数线性增长的数组/Map，且持有已渲染节点引用，历史越长内存越大 | 未复现（短周期） |
| H13 | `public/goal.js:556`（558/570-586） | goal 模式下**每条消息结束**都重跑 `renderRounds`：全量清属性 + 重新分组 + 打 dataset + 插轮次头 | 代码确认 |
| H14 | `public/stream-renderer.js:32-37` | 一帧内逐条 `paint`，多 agent 同时流式时一帧内多次全量 lex（见 H1） | 代码确认 |
| H15 | `src/sessions.js:711-741` | 后端每个 delta 单独成帧转发，无合并/节流，前端计算频率 = 模型 token 频率 | 代码确认 |

## 附录 B：数据文件清单

| 文件 | 内容 |
| --- | --- |
| `docs/perf-long-conversation/README.md` | 样本筛选口径、测量环境、复现步骤、限制 |
| `docs/perf-long-conversation/session-stats.json` | 样本会话规模统计 |
| `docs/perf-long-conversation/first-screen.json` | 首屏 3 次原始数据 + 另一实例交叉印证 |
| `docs/perf-long-conversation/switch.json` | 会话切换原始数据 |
| `docs/perf-long-conversation/memory.json` | 内存占用与 3 轮切换趋势 |
| `docs/perf-long-conversation/scroll-fold.json` | 滚动掉帧（idle 对照）与折叠成本 |
| `docs/perf-long-conversation/stream-render.json` | 流式单帧耗时与全量渲染微基准 |
| `docs/perf-long-conversation/measure.mjs` | 采集脚本（可独立复现） |
| `docs/perf-long-conversation/genericagent-mechanisms.md` | genericagent 11 条机制对照（M1–M11） |
