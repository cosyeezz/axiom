# 长对话渲染性能基线（第 2 轮实测）

本目录保存 axiom 长对话卡顿调研第 2 轮的全部原始数据、采集脚本与测量口径。
所有采集均指向**隔离副本实例**，不写入、不外传任何原始会话数据。

## 一、样本与会话筛选口径

### 业务库位置（对先前假设的修正）
- `~/.axiom/axiom.db` 仅 12KB、单表 `store` 1 行（namespace=maint 的守护状态），**不是业务库**。
- 真实业务库为 `~/.axiom-dev/axiom.db`（实测 9,797,632B，WAL 4,400,192B；表：store 173 行、sessions 89、session_events 192、tasks 210、goals 3）。

### 选定样本
筛选口径：**goal 模式 + 真实体量最大的长会话**（而非用户口头报告的那条）。

| 项 | 值 |
| --- | --- |
| session id | `55e7fce9-c23b-441a-b6e1-1042321ad701` |
| title | 第1轮: 看下axiom的sqlite机制是否存在没有落实的情况… |
| 原始 JSONL | 11,553,809 B / 1877 行 |
| 消息行 | 1831（user 18 / assistant 803 / toolResult 1010） |
| compaction | 38 次 |
| 正文字符 | 2,193,665 |
| thinking 字符 | 1,390,647 |
| 代码块 / 代码字符 | 145 个 / 31,737 |
| 工具调用参数字符 | 562,130 |

统计脚本产物见 `session-stats.json`。

旁证样本：`aff6e5c0`（588KB，即用户报告卡顿的那条会话，首条消息="目前axiom的前端页面渲染长对话会卡…"），体量远小于上表样本，故不作为主样本；体量小不直接等于不会卡，只是本轮未在该会话上复现。

### 隔离测量环境
用 `node:sqlite` 的 `VACUUM INTO` 从 `~/.axiom-dev/axiom.db` **只读复制**出副本库，并把副本库中该会话的 `session_file` 指向 JSONL 副本：

```
AXIOM_HOME = <TEMP>/axiom-perf-home/
  axiom.db                     # VACUUM INTO 副本
  defaults.json / models.compat.json / models-store.json
  workspaces/28d5.../<原始文件名>.jsonl   # JSONL 副本
```

启动方式（在本仓库 worktree 内）：

```
AXIOM_HOME="<TEMP>/axiom-perf-home" AXIOM_PORT=4410 AXIOM_CWD="F:/Axiom" node src/main.js
```

> 提交时机说明：本目录数据采集时所测代码为 worktree 基线（渲染实现等同于 master @2c8051b）。
> 采集期间主仓库工作树发生外部漂移，故另起 4410 实例复测，代码仍为该基线，与 `docs/frontend-long-conversation-perf.md` 的行号证据一致。

## 二、测量口径

| 项 | 设定 |
| --- | --- |
| 浏览器 | Chromium（Playwright MCP 驱动，UA Chrome/152.0.0.0，hardwareConcurrency 16，deviceMemory 32） |
| 视口 | 滚动/折叠测试显式设为 1440×900；首屏/切换沿用默认视口 |
| 启动方式 | 隔离副本库 + 独立端口（4410），`AXIOM_CWD=F:/Axiom` |
| 重复次数 | 首屏 3 次；切换 1 次；内存趋势 3 轮；滚动 idle/scroll 各 2 次 × 120 帧 |
| 采集脚本 | `measure.mjs`（Playwright 脚本，可独立运行；本轮实际由 Playwright MCP 执行同一段页面代码） |
| 只读保证 | 仅对副本实例发起读请求；未写入会话库；未把会话原文复制进仓库 |

页面级探针（由 `page.addInitScript` 注入）：
- `PerformanceObserver('longtask')`：记录 >50ms 长任务时长。
- `MutationObserver(#output, childList)`：记录 `#output` 子节点新增的首次/末次时间（首屏与切换渲染耗时）。
- `performance.memory.usedJSHeapSize`：JS 堆占用。
- `performance.getEntriesByType('navigation')`：`responseEnd` / `DOMContentLoaded` / `load`。
- `document.getElementsByTagName('*').length`：实际 DOM 节点数。
- rAF 帧间隔：滚动掉帧测量。

> 合规说明：采集过程中曾临时导出的会话原文样本文件已删除，仓库内只保留统计数值与耗时数字。

## 三、四项核心数值汇总

| 指标 | 数值 | 数据文件 |
| --- | --- | --- |
| 首屏渲染耗时 | firstOutput 1171ms / lastOutput 1626ms（3 次均值）；最大长任务 955ms | `first-screen.json` |
| 切换渲染耗时 | 切到长会话后最大长任务 1345ms；点击到渲染完成 3108ms | `switch.json` |
| 消息条数与 DOM 节点数 | 会话 1831 条消息行 → **39,947 个 DOM 节点**（#output 97 个子节点，332 个 tool-record，48 个 call-group） | `first-screen.json` |
| 流式渲染单帧耗时 | 真实文本尾部每帧 7–12ms（峰值 33ms）；头部 2–4ms；64,000 字符全量冷渲染 502.6ms | `stream-render.json` |
| 页面内存占用 | 长会话首屏 50.6MB（3 次均值）；切换后 53.3MB；短会话 3.4MB | `memory.json` |

> 上述 50.6/53.3MB 来自实例 4410，3 轮切换趋势（23.5→23.8→24.2MB）来自实例 4399，两者是**不同实例的样本**，不可直接相互比较；且采集均未强制/记录 GC。

## 四、五类场景的实测结论

| 场景 | 实测结论 | 是否复现 |
| --- | --- | --- |
| 打开长会话首屏 | 首次输出 1.17s，完全渲染 1.63s，含 938–955ms 单次长任务（归因 `snapshot` 为代码候选，非 CPU profile 结论） | 复现 |
| 切换长会话 | 切换触发 1345ms 长任务（早前一轮 2431ms），点击到完成 3.1s | 复现 |
| 流式越来越卡 | 文本尾部每帧 7–12ms（头部 2–4ms），随文本增长明显劣化 | 复现（微基准口径） |
| 滚动掉帧 | 静止基线即 ~31.3ms/帧（≈32fps），120 帧内超 33ms 帧 0–1 个；但滚动协议为每帧 `scrollTop += 900px`、范围 31,776px，约 36 帧即触底、其后可能静止，属**有限帧数的检测** | **未检出（不等于无掉帧）** |
| 内存持续增长 | 3 轮长短切换后长会话侧 23.5→23.8→24.2MB（+0.7MB）；回落与 GC 相容，但未强制/记录 GC，无法据此判定泄漏 | **未检出（短周期）** |

折叠成本单独测量（判断「现有折叠机制是否够用」）：单个 tool-record 开/关 3–10ms；332 个全开同步强制布局 4.1ms 且 DOM 节点数不变。改 `open` 属性会异步派发 `toggle`，该计时只覆盖属性设置 + 同步布局，不含异步详情处理，故**不能当作详情渲染完成的耗时**；惰性渲染由源码早退（app.js:1049）+ `ontoggle`（app.js:1160）确认。48 个 call-group 全开 57.1ms。详见 `scroll-fold.json`。

## 五、限制与注意事项

1. **rAF 基线偏低**：本环境静止帧间隔即 ~31.3ms（约 32fps），说明测量环境存在 vsync/节流，绝对值不可当作 60fps 设备上的表现；场景间需看**相对差异**。
2. **流式耗时为微基准**：由「对真实文本直接调用 `renderMarkdown`、每帧追加 600 字符并强制读回布局」测得，既未叠加 `app.js` 的 delta 处理与 DOM 重建，也不是真实模型流式分片，故只能作同口径相对比较，**既不能当真实成本的上界也不能当下界**。
3. **内存采样受 GC 时机影响**：同一实例不同时刻 `usedJSHeapSize` 可差 20MB+，单点值不宜跨采样直接比较，50.6MB 也不等于某个对象群的占用量；未强制/记录 GC，短周期未观测到泄漏不等于长期无泄漏。
4. **环境漂移**：采集期间主仓库工作树被外部切换到其他分支、`node_modules` 依赖缺失/变动，已改用 worktree 代码 + 另一份完整依赖复测；两次实例（4399 / 4410）结果互相印证。

## 六、复现步骤

```
# 1) 复制库（只读，不触碰原始数据）
node -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync('<源>/axiom.db',{readOnly:true}).exec(\"VACUUM INTO '<TEMP>/axiom-perf-home/axiom.db'\")"

# 2) 启动隔离实例
AXIOM_HOME="<TEMP>/axiom-perf-home" AXIOM_PORT=4410 AXIOM_CWD="F:/Axiom" node src/main.js

# 3) 采集（需 playwright）
node measure.mjs http://127.0.0.1:4410 55e7fce9-c23b-441a-b6e1-1042321ad701 eb6bc50b-43ec-42ea-ba14-b13193582293
```

## 文件清单

| 文件 | 内容 |
| --- | --- |
| `session-stats.json` | 样本会话规模统计（消息条数、文本体量、代码块数等） |
| `first-screen.json` | 首屏 3 次原始数据 + 另一实例交叉印证 |
| `switch.json` | 会话切换原始数据 |
| `memory.json` | 内存占用与 3 轮切换趋势 |
| `scroll-fold.json` | 滚动掉帧（idle 对照）与折叠成本 |
| `stream-render.json` | 流式单帧耗时与全量渲染微基准 |
| `measure.mjs` | 采集脚本（可独立复现） |
