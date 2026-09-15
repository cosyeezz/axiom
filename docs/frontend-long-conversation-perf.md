# 前端长对话渲染性能调研

> 状态：调研中（第 1/4 轮完成：渲染链路与热点定位）
> 代码基准：`master` @ `2c8051b`
> 被测前端：`public/`（浏览器端，纯原生 JS，无框架、无虚拟列表）

本文档只做调研与方案，不改产品代码。五类卡顿场景（首屏、流式、滚动、交互、内存）
各自根因与实测数据、genericagent 机制对照、分优先级改法见后续轮次。

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

要点：整条链路**没有虚拟列表、没有分页窗口，也没有 CSS 层跳过**（`public/style.css:365`
的 `#output`、`368` 的 `.message` 都没有 `content-visibility` / `contain`）。
每次切换会话是全量重建，每次流式增量都会走一遍「整段文本重算 + 全量分组重排」。

命名对应（避免与 genericagent 混淆）：axiom 侧没有 `renderAllMessages`，其等价物是
`snapshot()`（`app.js:2001`，切换/恢复会话时全量重建）；叠加式追加走 `event()` 里的
`card()`/`renderMessage()`；`public/goal.js` 里同名的 `render()`（`goal.js:589`）只重画面板与轮次分组。

---

## 二、热点清单

置信度含义：**代码确认** = 从代码即可断定会随规模变差；**需实测** = 机制成立但幅度待第 2 轮量化。

| # | 位置 | 一句话成因 | 置信度 |
|---|---|---|---|
| H1 | `public/markdown.js:219-220` | 每次重画都对**整段累计文本**跑 `fixCjkBold` + `marked.lexer` 全量词法分析，文本越长单帧越慢 | 代码确认 |
| H2 | `public/markdown.js:223` | 分块缓存的 key 是 `JSON.stringify(token)`，**未变化的块每帧也要重新序列化一遍** | 代码确认 |
| H3 | `public/app.js:1869` | 每个 `text_delta` 都对整段原文重跑 `stripMemoryTags`（分段 + 行内代码遮罩正则 + `do/while` 反复 `replace`） | 代码确认 |
| H4 | `public/app.js:1874` | 每个 `text_delta` 都对整段文本重跑 `splitAnswer`（逐行 split + 反引号扫描） | 代码确认 |
| H5 | `public/app.js:797`（内部 799/911/913/922） | 每帧全量重排 `#output`：三趟全量子节点扫描 + 大量节点搬移，随历史线性变慢 | 代码确认 |
| H6 | `public/app.js:757` | `paintCallGroup` 对每个分组都全扫 `.activity-line` | 代码确认 |
| H7 | `public/app.js:1025` | `mergeThoughts` 全量子节点扫描，每条消息结束触发一次 | 代码确认 |
| H8 | `public/app.js:2001`（循环 2070） | `snapshot` 在**一个同步任务**里重建整个会话（每条消息都走 `card`+`renderMessage`），主线程无法插入渲染，首屏必卡 | 代码确认（耗时需实测） |
| H9 | `public/app.js:1048`（1049 早退，1069-1113 建节点） | 工具详情默认折叠且**懒渲染**（这点是好设计），但展开时会把最多 6 万字符逐行建成节点，左右对比视图再整份复制一遍 | 代码确认 |
| H10 | `public/style.css:365`、`368` | 缺 `content-visibility`/`contain`，历史节点全部参与布局与绘制，滚动时无层跳过 | 代码确认（幅度需实测） |
| H11 | `public/app.js:701`（`toolItems`），1164-1165 | `toolItems` 整个会话内只增不删（仅快照时 `clear`），且 `tool.args`/`tool.result` 把**工具完整输出**留在 JS 对象里（不止 DOM） | 代码确认 |
| H12 | `public/app.js:1825/1904/2102`（`mainItems`）、`80`（`goalAnchors` 声明）、`2044`（快照重建） | 随消息数线性增长的数组/Map，且持有已渲染节点引用，历史越长内存越大 | 代码确认 |
| H13 | `public/goal.js:556`（558/570-586） | goal 模式下**每条消息结束**都重跑 `renderRounds`：全量清属性 + 重新分组 + 打 dataset + 插轮次头 | 代码确认 |
| H14 | `public/stream-renderer.js:32-37` | 一帧内逐条 `paint`，多 agent 同时流式时一帧内多次全量 lex（见 H1） | 代码确认 |
| H15 | `src/sessions.js:711-741` | 后端每个 delta 单独成帧转发，无合并/节流，前端计算频率 = 模型 token 频率 | 代码确认 |

### 折叠机制现状（与「已做大量折叠」的说法对齐）

已具备的折叠：`call-group`（`app.js:731-935`）、`tool-record`（`app.js:1136` 起，详情懒渲染）、
`thinking-record`（`app.js:1186` 起）、compaction 卡（`app.js:1413`）、goal 轮次头（`goal.js:556`）、
task 弹窗（`app.js:1913` 起）。

对性能的实际作用，初步判断：

- **确实有效**：`tool-record` 与 `thinking-record` 默认折叠，且 `renderToolDetail` 在
  `container.open` 为假时直接 return（`app.js:1049`），所以工具大输出的**构建成本被推迟**，
  这是当前最主要的省钱点。
- **不覆盖的**：折叠只减少了「详情节点的构建与渲染」，**没有减少三类常驻成本**——
  ① 每帧的整段文本重算（H1-H4），② 每帧的全量分组重排（H5-H6），
  ③ 消息外壳、markdown 块的 DOM 常驻与 `toolItems`/`mainItems` 的对象常驻（H11-H12）。
- **一个待实测的点**：折叠后的 `<details>` 内容在 Chromium 下是否仍参与布局（若是
  `content-visibility: hidden` 则成本很低）。这决定 H10 的严重程度，第 2 轮量化。

---

## 三、五类卡顿场景 → 候选热点

| 场景 | 主要嫌疑 | 置信度 |
|---|---|---|
| A 打开/切换长会话首屏卡 | H8（同步全量重建）> H1/H2（每条消息完整 lex 一次，`app.js:1353` flush）> H13（goal 模式额外重分组） | H8 代码确认；幅度需实测 |
| B 流式输出越来越卡 | H1+H2（每帧整段 lex/序列化）> H3+H4（**每个 token** 整段重算）> H5（每帧全量重排）> H15（后端不合并 delta） | 代码确认；曲线需实测 |
| C 滚动长对话掉帧 | H10（无 CSS 层跳过）> H5（每帧重排）> H6 | 代码确认；幅度需实测（受折叠缓解程度影响） |
| D 输入/点击发涩 | H5+H6（每帧占用主线程）+ H3+H4（每个 delta 同步阻塞） | 代码确认 |
| E 内存越用越大 | H11（`toolItems` 不回收 + 保留工具完整输出）> H12（`mainItems`/`goalAnchors`）> 历史 DOM 常驻 | 代码确认；增长曲线需实测 |

---

## 四、待验证清单（交给第 2 轮实测）

1. 该 goal 长会话的消息条数、DOM 节点数、历史文本体量。
2. 首屏/切换渲染耗时（`snapshot` 同步段占用多长时间主线程）。
3. 流式单帧耗时随文本长度的变化（验证 H1-H4 是否为超线性）。
4. 折叠状态下滚动帧率与布局成本（验证 H10 严重程度）。
5. 内存占用与 `toolItems`/`mainItems` 规模的关系（验证 H11-H12）。
