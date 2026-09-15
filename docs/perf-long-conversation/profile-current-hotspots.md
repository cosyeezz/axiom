# current 长会话首屏加载 —— Chromium CPU profile 热点定位（profile 轮）

> 后续独立核查发现：本文运行次数和部分组成耗时与同名 JSON 不一致（本文两次，JSON 三次）。以下历史正文保留，但这些数值不得用于性能验收。差异清单及 JSON 原始值见 [profile-prompt-cache.md](profile-prompt-cache.md)；差异原因尚未查明，不推断为旧采集并发覆盖。

数据：`profile-current-hotspots.json`（由 `profile-current-hotspots.mjs` 产出）。
原始 `.cpuprofile` / `.trace.json` 含私有上下文，只落临时目录（不入库）。

## 采集与验证方式

同一次导航**同时**开 CDP `Profiler`（100µs 采样）与 CDP `Tracing`（`devtools.timeline,toplevel`）。
两者时间戳同属 Chromium TimeTicks(µs) 域，因此采样点直接按 trace 任务区间切片
（`profile.startTime + Σ timeDeltas` ↔ trace `ts`），不是墙钟估算。

隔离沿用 paired 脚本口径：源库 `VACUUM INTO` 副本 + JSONL 副本，`session_file` 指向副本；
源库只读；服务只起在隔离副本上。

自校验（2 次运行全部通过）：

| 校验 | 结果 |
|---|---|
| 页面 PerformanceObserver longtask 列表 == trace 主线程顶层 RunTask(≥50ms) | 完全一致（含 36ms / 52ms 小任务） |
| 切片后 profile 任务内 active 时间 == trace 任务时长 | 440.1/440、370.0/369.7、456.7/456.4、405.6/405.3、52.3/52.2 |
| 完成后 +1.5s 计数快照（节点数 / #output 子节点 / message 数）不变 | 全部通过 |

## 结果：每次加载有 2 段阻塞任务

| 任务 | 位置 | 时长 | 组成（V8 采样） | trace（主线程，非 JS） |
|---|---|---|---|---|
| A | +258~495ms（CommitLoad 后） | 440~456ms | **`(program)` 原生 255~279ms（56~58% 任务内 active）**、`beginSnapshot(app.js:2124)` 自耗 **149~152ms（33%）**、`ws.onmessage(app.js:2337)` 20~21ms、GC 7~22ms | 整个任务是一个 `SimpleWatcher::OnHandleReady`→`Receive mojo message` 区域，内部无 `Layout`；`FunctionCall` 仅 29~42ms |
| B | +1541~1704ms | 370~405ms | **`resizePrompt(app.js:169)` 自耗 348.5/372.2ms = 任务内 active 的 92~94%**，`(program)` 仅 1.3~8.2ms | `Layout` 312~332ms + `UpdateLayoutTree` 36~39ms（合计占任务 84~93%），`FunctionCall` 0.2ms |
| 小 | 提交时 / 两次长任务之间 | 36~52ms | `(program)` 30ms + marked.js 首次编译 ~9ms | `Layout` 24.5ms |

阶段自身时间（占任务内 active）：`beginSnapshot` 33~34%（任务 A、B 均出现，任务 B 的 150ms 属另一段）、
`placeSnapshotMessage→renderMessage/Markdown` 4.9~5.1%（**单条 Markdown 渲染不是 400ms 级元凶**）、
`finishSnapshot` 只在小任务里 26.7%。

## 根因 1（最硬）：`resizePrompt` 每帧同步读 `prompt.scrollHeight`

强制同步布局探针（仅测试侧拦截 `Element.prototype.scrollHeight/clientHeight/offsetHeight` 的 getter）：

```
resizePrompt app.js:173 [scrollHeight]   ≈348~380ms（单次最大 353ms）
scrollToLatest app.js:194 [scrollHeight] ≈11~14ms
合计 >1ms 的同步布局读：372.7 / 393.3 ms（两次运行）
```

调用点：`resizePrompt()` 由 `$.onsubmit(app.js:2322)`（登录/连接 websocket 的 handler，作用域 2322–2450）
的 `await snapshot(state)`（2431）之后的 **app.js:2438** 直接调用；同函数尾部 rAF 里的 2295 也调用它。
`app.js:172` 先写 `style.height = "auto"` 使其失效，`app.js:173` 再读 `scrollHeight` → 对
~39,947 节点的整文档触发一次强制同步布局（该文档大部分是长会话 transcript）。

最小下一步修改（未改产品代码）：
- `resizePrompt` 记一个 last-key（`prompt.value` + 手机布局 + 展开态），键未变直接 return，跳过 172/173 两次写读；
- 键变了则把「读几何」放在本帧 DOM 插入**之前**、或用一次 rAF 合并（现调用点 13 处：92/259/283/2295/2438/2509/2565/2611/2733/3259/3297/3360 + 169）。
- 预期收益：直接消掉 370~405ms 那一段长任务的大部分（任务内 active 的 92~94% 就是这一个读）。

## 根因 2（未澄清）：任务 A 的 262~280ms 原生 `(program)`

硬证据：两次运行中**所有** `(program)` 采样栈都是 `(program) < (root)`（深度 2，全载 505 / 533ms），
没有一个采样有 JS 父帧 → 这段原生时间不在任何 JS 函数内部，而是事件循环层的非 JS 工作，
落在同一个 mojo 消息任务里（trace 显示该任务无 `Layout`、无 `ParseHTML` 之外的子事件）。

未查清：究竟是大 payload 的 Blink/mojo 解码，还是被 V8 记成 builtin 的 `JSON.parse`。
**不作源码推定**，标注为限制。

## 已知工具限制

- trace 的 `FunctionCall` 在不带 `v8` category 时**只是 Blink 入口的部分覆盖**（任务 A 内合计 29~42ms，
  而 profile 同窗口 `beginSnapshot` 自耗 149~152ms）→ JS 归因只信 profile，trace 只用于 `Layout`/`UpdateLayoutTree`/`ParseHTML`。
- 任务 B 的阶段标签在 JSON 里落在 `outside-snapshot`：现已确认为 app.js:2438 的连接 handler 续体，
  不是 `finishSnapshot` 的 rAF（2293）。
- 采集本身有开销，绝对耗时会略高于无观测的成对测量值；占比与调用链结论不受影响。

## 建议的下一步（按性价比）

1. 改 `resizePrompt` 的跳过/合并读（上节），重跑成对首屏 → 预期首屏 longtask 从 450ms 量级降到 200ms 量级；
2. 若要归因 262ms 原生时间：把脚本 trace 的 `categories` 加上 `v8` 重跑一次（`devtools.timeline,toplevel,v8`，脚本内 `Tracing.start` 处一处改动），
   并在页面上单独计时「收到 payload」与 `JSON.parse(payload)`；
3. 之后再谈 `beginSnapshot` 的 150ms（33%）与阶段分片参数（`SNAPSHOT_CHUNK_MS=8` / `SNAPSHOT_CHUNK_ITEMS=40`）。
