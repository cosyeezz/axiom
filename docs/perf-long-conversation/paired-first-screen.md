# 同机成对首屏/切换实测（独立复核轮）

本文件**所有数字均由 `paired-first-screen.json` 机器重算**（重算口径见文末附录），并逐项与
`paired-first-screen.mjs` 的实际代码口径核对。`paired-first-screen.json`、`paired-first-screen.mjs`
及 `first-screen.json` / `switch.json` / `measure.mjs` 等原始文件**均未改动**。

> 上一版本本文件中的表格与本 JSON 全面不符（首屏/切换多行数值、longtask 序列示例均为凭记忆填写），
> 本版已按 JSON 重算并修正；同时删除了「完整重建已核」等 JSON 不支持的结论。

---

## 零、结论速览

| 结论 | 数值（同轮配对，JSON 重算） | 判定 |
| --- | --- | --- |
| 首屏首次 DOM 输出（`#output` 首次新增直接子节点） | baseline 1301ms → current 672ms | 明显提前（-48%） |
| 切换「点击后」首次 DOM 输出（`firstOutputMs - clickAtMs`） | baseline 1602ms → current 606ms | 明显提前（-62%） |
| 渲染阶段最大 longtask | 首屏 1115ms → **450ms**；切换 1438ms → **429ms** | **未达标（目标 <200ms）** |
| 最后一次 DOM 变更 | 首屏 1840ms → 1832ms（持平）；切换「点击后」1766ms → **2196ms** | 首屏持平；**切换反而晚 430ms（+24%）** |
| 是否完成「完整重建」 | 仅有静默 + 计数一致性 + 尾部命中 | **不能证明完整重建**（见第六节） |

---

## 一、完成判据与字段口径（与旧 `measure.mjs` 的差别）

旧脚本 `ready()` 为 `waitForFunction(工具记录 > 300).catch(()=>{})`，**超时被吞**，可能在后台
仍在分片渲染时就读数。本组改为：

1. `#output` 子树（childList + subtree）连续 **700ms 无任何 DOM 变更**即视为完成；**60s 硬超时直接抛错**。
2. 完成后再静默 **1500ms**，全量快照（`nodes/outputChildren/messages/toolRecords/callGroups/lastDomMutationMs`）必须逐字节不变，否则断言失败。
3. **地面真值**：Node 侧 WebSocket `session.attach` 取服务端真实 `state.messages`（本组两实例均为 2393 条，user 27 / assistant 1052 / toolResult 1314，tasks 9，live 0），并断言 baseline/current 的 `messages` 与 `roles` 完全一致。
4. **跨版本/跨运行核对**：语义计数（`outputChildren/messages/toolRecords/callGroups`）在 3×2 次运行间完全一致；另以「服务端最后一条 user 消息的最长无空白片段」（仅内存传递）作尾内容诊断，12/12 命中。

各字段的**精确**含义（按 `paired-first-screen.mjs` 代码，非按命名直觉）：

| 字段 | 实际口径 |
| --- | --- |
| `firstOutputMs` | `#output` **直接子节点**（`childList`，非 subtree）首次出现 `addedNodes` 时，MutationObserver 回调里的 `performance.now()` 取整值 |
| `lastOutputMs` / `lastDomMutationMs` | 直接子节点 observer 与子树 observer 的**最后一次回调**时刻；两者在本数据下同时更新 |
| `settledAtMs` | 上述最后一次 DOM 变更之后，700ms 静默定时器触发的时刻 |
| `longTaskEntries` / `longTasks` | `PerformanceObserver('longtask')` 的全部条目（`start`/`dur` 取整） |
| 首屏的 longtask 范围 | `phaseStartMs = 0`，即**整页加载阶段**（不特指渲染段） |
| 切换的 longtask 范围 | 点击时执行 `__resetPerf()`，条目被清空，故等价于**点击之后** |
| `maxLongTaskRenderMs` | 代码实现为 `start <= settledAtMs` 的**上界**过滤（**未做下界过滤**）；本数据下与 `maxLongTaskMs` 逐运行相等 |

**关键措辞修正**：

- `firstOutputMs` **不是 paint / 首帧**，它只是 `#output` 出现第一个 DOM 子节点的时刻；页面何时真正绘制该节点没有被测量。
  「首次可见输出」应写成「首次 DOM 输出」。
- 切换数值有两个基准：JSON 里的 `firstOutputMs`（页面加载起算）与派生值 `firstOutputMs - clickAtMs`（**点击后**，
  后者才对应「切换代价」）；`completionFromClickMs` / `settledFromClickMs` 是 JSON 直接给出的点击后派生字段。
  上一版表格混用了两个基准，已修正。
- 目标参考线 `1171ms` 与 `<200ms` 来自 `thresholds.target`（`1171` 即 `first-screen.json` 的 `firstOutputMsAvg`），
  属**第 2 轮更小快照**的数值，不是本组同快照对照。

---

## 二、样本、环境与隔离

| 项 | 本组 | 第 2 轮原始基线（round-2 `README.md`） |
| --- | --- | --- |
| 会话 | `55e7fce9-c23b-441a-b6e1-1042321ad701` | 同一会话（旧快照） |
| JSONL | **12,394,998 B**，sha256 `6dfedb20…c7cf1` | 11,553,809 B / 1877 行 |
| 消息 | 地面真值 **2393** 条（user 27 / assistant 1052 / toolResult 1314，tasks 9） | 消息行 1831（user 18 / assistant 803 / toolResult 1010） |
| 浏览器 | `HeadlessChrome/148`（Playwright headless），视口 1280×720 | Playwright MCP 驱动，UA `Chrome/152.0.0.0` |
| 硬件 | `hardwareConcurrency 16` / `deviceMemory 32` | 同 |
| baseline 代码 | commit `c7cf8a5`；`public/app.js` sha `ab946d41…`、`markdown.js` sha `ccece070…` | worktree 基线（round-2 记录：渲染实现等同 master `2c8051b`） |
| current 代码 | 工作树未提交；`public/app.js` sha `6fc7761b…`、`markdown.js` sha `30205bbf…` | — |
| 隔离 | 每版本 `VACUUM INTO` 独立副本库 + JSONL 副本，改写副本库 `session_file` 指向副本；源库只读；端口动态取空闲 | 4410 + 隔离副本 |
| 样本原文 | 不入仓库（`sampleTextInRepo=false`），只记 sha256 | 同 |

> **样本已增长**：该会话自第 2 轮以来 JSONL +841,189 B（**+7.28%**），消息行 1831 → 2393（**+562，+30.7%**；
> 两者计数方式不同，1831 是 JSONL 行统计、2393 是服务端 `state.messages`，只能作量级参考）。
> 第 2 轮快照未随仓库保留、不可复原，故 `1171ms` / `955ms` / 39,947 节点只能作参考线，
> **跨版本结论一律取本组同轮配对差值**。

---

## 三、首屏结果（6 次运行：baseline / current 交替各 3 次）

| 指标（ms） | baseline `c7cf8a5` | current 工作树 | 配对变化 |
| --- | --- | --- | --- |
| 首次 DOM 输出 `firstOutputMs` | 1287 / 1282 / 1335，**均值 1301** | 691 / 664 / 661，**均值 672** | **-48%** |
| 最后 DOM 变更 `lastDomMutationMs` | 1877 / 1778 / 1864，**均值 1840** | 1891 / 1849 / 1756，**均值 1832** | **-8ms（基本持平）** |
| 静默判定完成 `settledAtMs` | 2586 / 2491 / 2570，均值 2549 | 2592 / 2551 / 2462，均值 2535 | -14ms |
| 最大 longtask | 1062 / 1050 / **1115** | 450 / 450 / **442** | **-60%（1115 → 450）** |
| longtask 序列 | `[1062,474,50]` / `[1050,373,52]` / `[1115,410]` | `[450,425]` / `[450,415]` / `[442,360]` | 段数变少、单段仍约 440ms |
| goto→静默完成 wall | 4165 / 4033 / 4131，均值 4110 | 4123 / 4117 / 4013，均值 4084 | -26ms |
| DOM 计数 nodes / outputChildren / messages / toolRecords / callGroups | 41628 / 92 / 143 / 329 / 45 | 41628 / 92 / 143 / 329 / 45 | **逐运行全同，差 0** |
| `addedNodes` / `mutations` | 263 / 3073（三次全同） | 279、263、264 / 3664、3366、3376 | current 变更次数更多 |

---

## 四、切换结果（短会话 `eb6bc50b` → 点击侧栏切到长会话）

| 指标（ms） | baseline `c7cf8a5` | current 工作树 | 配对变化 |
| --- | --- | --- | --- |
| 点击前 `clickAtMs` | 1367 / 1343 / 1364 | 1510 / 1357 / 1365 | — |
| 点击后首次 DOM 输出（`firstOutputMs - clickAtMs`，**派生**） | 1599 / 1620 / 1588，**均值 1602** | 596 / 614 / 607，**均值 606** | **-62%** |
| `firstOutputMs`（页面加载起算，JSON 原字段） | 2966 / 2963 / 2952，均值 2960 | 2106 / 1971 / 1972，均值 2016 | -32% |
| 点击后最后 DOM 变更 `completionFromClickMs` | 1774 / 1784 / 1740，**均值 1766** | 2278 / 2212 / 2098，**均值 2196** | **+430ms（+24%）** |
| 点击后静默完成 `settledFromClickMs` | 2485 / 2499 / 2447，均值 2477 | 2982 / 2913 / 2805，均值 2900 | +423ms（+17%） |
| 最大 longtask | 1435 / 1438 / **1413** | 429 / 429 / **423** | **-70%（1438 → 429）** |
| longtask 序列 | `[1435,89]` / `[1438,89]` / `[1413,74]`（各 2 段） | `[429,100,58,66,52]` / `[429,121,66,63,61]` / `[423,113,54]`（各 3–5 段） | 首段从 ~1430ms 降到 ~430ms，但出现多段 50–120ms |
| 点击→wall `clickToWallMs` | 4030 / 4038 / 3976，均值 4015 | 4525 / 4449 / 4352，均值 4442 | +427ms（+11%） |
| DOM 计数 nodes / outputChildren / messages / toolRecords / callGroups | 41627 / 92 / 143 / 329 / 45 | 41627 / 92 / 143 / 329 / 45 | **逐运行全同，差 0** |

> 绝对时间 `lastDomMutationMs`（点击基准起算）为 baseline 均值 3124ms、current 均值 3607ms；
> 第四节全部「点击后」行均以 JSON 的 `clickAtMs` / `*FromClickMs` 为准。

---

## 五、目标达成判定

| 目标 | 判定依据 | 结果 |
| --- | --- | --- |
| 首屏首次 DOM 输出 ≤ 1171ms | current 均值 672ms | **达标（但 1171 是旧小快照的参考线，有效表述是同轮 1301 → 672）** |
| 最大 longtask < 200ms（首屏） | current 450ms | **未达标** |
| 最大 longtask < 200ms（切换） | current 429ms | **未达标**（JSON 的 `thresholds` 只对首屏计算，切换由本文件按同一规则判） |

即：分片把一次千毫秒级长任务摊成多段数百毫秒任务（首屏 3 段 → 2 段、切换 2 段 → 3–5 段），
**最大单段仍有 420–450ms**，距 <200ms 目标还差一倍以上。

**注意归因边界**：`public/app.js:2041-2043` 可见 `SNAPSHOT_SYNC_MESSAGES = 120`、
`SNAPSHOT_CHUNK_MS = 8`、`SNAPSHOT_CHUNK_ITEMS = 40`，`finishSnapshot()`（约 2245 行起）会做
`mergeThoughts()`、compaction 卡片前置、task 入口归位等**同步收尾**。这只能说明代码里存在
「分片 + 同步尾部」的结构，**本组没有 CPU profile，不能据此断言剩余 longtask 的来源**。

---

## 六、能支持的结论 / 不能支持的结论

### 能支持（同轮配对，基于 JSON 重算）

1. 首屏首次 DOM 输出提前：**1301ms → 672ms**（-48%）。
2. 切换点击后首次 DOM 输出提前：**1602ms → 606ms**（-62%）。
3. 最大 longtask 显著下降但仍不达标：首屏 **1115ms → 450ms**（-60%）、切换 **1438ms → 429ms**（-70%），**均 ≥ 200ms**。
4. 首屏最后 DOM 变更基本持平（**1840ms → 1832ms**）；切换最后 DOM 变更**反而后移**（**1766ms → 2196ms，+430ms / +24%**）。
   「首屏更快」与「切换完成后移」是两件事，引用时必须分开表述。
5. 12 次运行的语义计数完全一致（`outputChildren 92 / messages 143 / toolRecords 329 / callGroups 45`），
   `nodes` 首屏 41628、切换 41627，两版本差 0；追加 1500ms 静默后快照（含 `lastDomMutationMs`）逐字节不变；
   尾片段 12/12 命中。

### 不能支持（本版已删除的过度结论）

1. **「完整重建已核」不成立**。地面真值是服务端 **2393 条消息**，而 DOM 里
   `#output` 直接子节点 92 个、`article.message` 143 个。脚本断言的是
   **两版本 DOM 计数彼此一致**，**从未断言 DOM 等于服务端 state**。因此上述证据只支持
   「两版本渲染出的 DOM 计数一致、约 2.2s 无变更后保持稳定、且页面文本包含会话尾部片段」。
2. **完成时刻只是静默推断**：判据为 700ms 静默 + 1.5s 复核（合计约 2.2s）。若渲染器把工作排到
   2.2s 之后再调度，本方法检测不到，计数也不一定会变。
3. **尾内容/计数一致性不能证明顺序或完整性**：尾片段是「最后一个 user 消息中最长的 ≥8 字符无空白片段
   （截 24 字符）是否出现在 `document.body.textContent` 中」，命中只证明「页面含有该片段」。
4. **不能把 longtask 降到 450/429ms 归因于某个具体函数**（无 profile，见第五节）。
5. **不能与第 2 轮数值跨环境比较**（浏览器 UA、样本快照、DOM 计数口径均已变化）。

---

## 七、复现

```sh
node docs/perf-long-conversation/paired-first-screen.mjs \
  --repo . --baseline-commit c7cf8a5 \
  --db <axiom.db 路径> --session 55e7fce9-... --short eb6bc50b-... \
  --runs 3 --json docs/perf-long-conversation/paired-first-screen.json \
  --playwright <playwright/index.mjs> --chromium <chrome.exe>
```

脚本自行建立临时隔离 home（`VACUUM INTO` 副本库 + JSONL 副本）与两个代码根
（baseline 用 `git show c7cf8a5:src|public|package.json` 重建，current 直接拷贝工作树），
`node_modules` 用 junction 复用；端口动态取空闲；`AXIOM_CWD` 固定 `F:/Axiom`。
会话原文不入仓库，只记 sha256。

---

## 八、已知偏差与限制

1. **代码哈希覆盖不全**：`provenance.codeSha256` **只记录了 `public/app.js` 与 `public/markdown.js`**。
   本次 current 的 `public/stream-renderer.js` 有 45 行改动（sha `68b0c041…`）、`public/index.html`
   （sha `14b085f9…`）以及全部 `src/` 服务端代码**均未 hash**，JSON 无法据此精确复原被测代码。
   （已核对：工作树 `app.js`/`markdown.js` 当前 sha 与 JSON 记录一致，即这两个文件自测量后未再变动。）
2. **baseline 是重建而非原目录**：baseline 代码根来自 `git show c7cf8a5`，故只含该 commit 的内容；
   即两侧差异不限于 `public/`，`src/` 服务端代码同样未纳入任何哈希证据（本次 `git status` 未显示 `src/` 有未提交改动）。
3. **样本增长与口径漂移**：JSONL +7.28%，消息 +562；DOM 计数也从第 2 轮的
   `97 / 332 / 48`（outputChildren / toolRecords / callGroups）变为本轮两版本一致的 `92 / 329 / 45`。
   跨轮数字只能作参考线。
4. **并发与时间线的证据边界**：同机残留 8 个 `axiom-paired-first-screen-*` 临时目录，
   创建时间集中在 **02:59:07–03:01:14（本地）**；而本 JSON 的 `generatedAt` 为
   `2026-09-15T10:14:07Z` = 本地 **03:14:07**（文件 mtime 03:15:06）。两者**时间不重叠**，
   故：**既不能断言最终这次运行被那些并发进程干扰，也不能断言未受偏移**——并发时段与最终时段不同，
   缺少对最终运行本身的直接证据。脚本成功时会清理临时目录，残留目录说明那些运行未正常结束。
5. **浏览器单点**：仅 `HeadlessChrome/148`；第 2 轮为 UA `Chrome/152.0.0.0`，
   所有结论均为同轮配对，不跨环境宣称提速。
6. **样本量与顺序**：每版本 3 次，顺序为 `baseline, current, current, baseline, baseline, current`（严格交替，
   并非「已打乱」）；未做统计显著性检验，也未强制/记录 GC。
7. `AXIOM_CWD` 固定 `F:/Axiom`，只影响会话默认值解析，不影响样本读取；端口动态分配，避免撞固定端口。

---

## 附录：核算口径（机器重算）

从 `paired-first-screen.json` 直接读取，不做任何插值；均值 = 算术平均；「点击后」= JSON 派生字段或
`firstOutputMs - clickAtMs`；百分比 = 配对相对变化。

```
firstScreen  baseline firstOutput [1287,1282,1335] mean 1301.33 | lastDom [1877,1778,1864] mean 1839.67
             current  firstOutput [ 691, 664, 661] mean  672.00 | lastDom [1891,1849,1756] mean 1832.00
             baseline settled [2586,2491,2570] mean 2549.00 | maxLT 1115 | seqs [1062,474,50] [1050,373,52] [1115,410]
             current  settled [2592,2551,2462] mean 2535.00 | maxLT  450 | seqs [450,425] [450,415] [442,360]
             counts(both versions) nodes 41628, out 92, msg 143, tools 329, groups 45
switch       baseline clickAt [1367,1343,1364] | fromClick [1599,1620,1588] mean 1602.33
                      completionFromClick [1774,1784,1740] mean 1766.00 | settledFromClick [2485,2499,2447] mean 2477.00
                      maxLT 1438 | seqs [1435,89] [1438,89] [1413,74] | clickToWall mean 4014.67
             current  clickAt [1510,1357,1365] | fromClick [ 596, 614, 607] mean  605.67
                      completionFromClick [2278,2212,2098] mean 2196.00 | settledFromClick [2982,2913,2805] mean 2900.00
                      maxLT  429 | seqs [429,100,58,66,52] [429,121,66,63,61] [423,113,54] | clickToWall mean 4442.00
             counts(both versions) nodes 41627, out 92, msg 143, tools 329, groups 45
deltas       首屏 first -48.36% | 切换 fromClick -62.20% | LT 首屏 -59.64% | LT 切换 -70.17%
             切换 completionFromClick +430ms (+24.35%) | 切换 settledFromClick +423ms (+17.08%)
groundTruth  messages 2393 (user 27 / assistant 1052 / toolResult 1314), tasks 9, live 0；两实例一致
verification passages=true, countsIdenticalAcrossVersions/Runs=true, nodeCountDelta firstScreen 0 / switch 0
             tailContentCheck 12/12 命中（6 + 6）
```
