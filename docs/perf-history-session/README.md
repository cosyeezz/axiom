# 长会话历史改造：性能实测报告（baseline vs current）

假源隔离夹具、Playwright 无头 Chromium、同一台机器上前后两次采集。
**结论先说：attach 首屏从「整段历史分片但最终全量建 DOM」改成「最新一页窗口（≤60 条）+ 显式翻页」。
这是分页/单页窗口，不是动态虚拟化** —— 没有伪造的全历史滚动条、没有高度缓存、没有分片调度；
滚动条长度、元素高度全由浏览器按当前页真实布局决定（`public/app.js` 快照入口注释亦如此声明）。

| 文件 | 内容 |
|---|---|
| `baseline.json` | 改造前（`ab52936` 基线代码物化运行）3 轮 |
| `after.json` | 改造后（当前 worktree：`7372be2`，工作树干净）3 轮 + 切换趋势 + 翻页检查 |
| `measure-baseline.mjs` | 采集脚本；`--mode baseline`（默认）/ `--mode current` |
| `make-fake-home.mjs` | 夹具生成器（1831 条长会话 + 20 条短会话，无任何用户数据） |

## 1. 口径与隔离（已复核脚本实现）

- 夹具：`make-fake-home.mjs` 生成临时 `AXIOM_HOME`；无 `~/.axiom` 读写、不联网、不调用模型。
  本报告两次采集的夹具**逐字节相同**：用 baseline 记录的临时 home 路径重生成，
  sha256 完全命中 baseline.json（长 `a007974e…`、短 `d2aa63d8…`）。
  JSONL 头部内嵌 home 路径，故原始 sha256 每次天然不同；JSON 另记 `sha256Normalized`
  （长 `dc99297f…`、短 `438faa94…`）用于跨次确认夹具一致。
- 代码：`baseline` 模式用 `git show <commit>:src|public` 物化到临时目录再跑；
  `current` 模式直接跑当前 worktree 代码，provenance 记录 HEAD、脏文件清单与逐文件 sha256。
  本次 `after.json`：HEAD `7372be2`、`dirtyPaths: []`、53 个文件、
  `codeDigest 9f2695e0…`、`app.js 6d8b2e49…`。本报告数值只对应这个内容指纹。
- 探针与完成判据：`#output` 子树静默 700ms 无 DOM 变更 = 首屏完成（硬超时 60s 抛错，
  不吞超时），完成后追加 1500ms 复核节点数/子节点数/消息数/末次变更时刻不漂移。
  longtask 由 `PerformanceObserver`、堆由 `performance.memory`（`--expose-gc`，取样前 `window.gc()`）。
- 隔离锁：`../perf-long-conversation/measure-lock.mjs`（`mkdir` 锁 + `owner.json` token 校验）。
  本次采集前后实测：锁目录已被释放、临时目录已删除、浏览器与自 spawn 的服务进程均已退出。
- 串行：同一时刻一个服务实例、一个页面；切换/翻页相位复用同一页面实例依次执行。
- 环境：HeadlessChrome 148 / 1280×720 / 16 线程 / deviceMemory 32，单机单次测量。

## 2. 首屏（3 轮，同一夹具）

| 指标（长会话 1831 条） | baseline | current | 变化 |
|---|---|---|---|
| 首个可见输出 | 485ms | **152ms** | ~3.2× |
| 静默判完成 | 5415ms | **936ms** | ~5.8× |
| 最大 longtask | 147–155ms | **50ms / 0ms / 50ms** | ~3× |
| ≥50ms longtask 次数 | 32–35 | **0–1** | ~30× |
| 全程 DOM 变更次数 | 77 246 | **806** | ~96× |
| `#output` 直接子节点 | 1625 | **55** | ~30× |
| 消息卡片 | 821 | **27** | ~30× |
| 工具记录 / 调用组 | 1010 / 821 | **33 / 28** | ~30× |
| 文档节点总数 | 45 351 | **1 930** | ~23.5× |
| gc 后 JS 堆 | 15.4MB | **3.9MB** | ~3.9× |
| 测量墙钟（含复核定静默） | ~7.3s | **~2.5s** | ~3× |

短会话（20 条，本来就没有分页必要）：首屏 158→141ms、节点 1008→**1014**、堆 3.5→**3.6MB**、
墙钟 ~2.5s 持平 —— 改造对短会话基本无副作用（节点 +6）。

服务端地面真值：baseline 下 `session.attach` 返回 1831 条；current 下只返回最新一页
（长会话 60 条：user 1 / assistant 26 / toolResult 33），全历史 1831 条仍可由翻页取到。
跨轮次计数稳定：`semanticCountsStableAcrossRuns: true`（短 `[17,9,12,9]`、长 `[55,27,33,28]`）。
附注：baseline.json 里该字段为 `false` 是旧脚本把「短会话那次 run」与「长会话那次 run」直接比的跨会话误算，
本轮已改为按会话分组比较；历史 artifact 未回改。

## 3. 反复会话切换的 DOM/内存趋势（3 轮 = 6 次真实侧栏点击切换）

| 回到长会话第 n 次 | 节点 | 堆（gc 后） | 该次静默 | 该次最大 longtask |
|---|---|---|---|---|
| 1 | 1929 | 4.8MB | 900ms | 51ms |
| 2 | 1929 | 4.9MB | 874ms | 0ms |
| 3 | 1929 | 5.0MB | 890ms | 0ms |

每次切换的变更量恒定（短会话 263 次变更 / 17 个新增节点；长会话 803 次 / 56 个），
节点数 3 轮零漂移。**但内存 4.8→4.9→5.0MB 是单调小幅上行的**：
3 轮样本既不能证明「无泄漏」，也不能判定「有泄漏」—— 它只说明「单次切换不引入量级增长」。
判断泄漏需要更多轮次 + 强制 gc 后的基线对比 + 堆快照，本轮未做。
另外这 6 次切换是**有限轮次**的浅测，没有覆盖长时间挂机、真实流式追加、多人并发标签页。

## 4. 翻页定位 / 游标边界 / DOM 有界性（2 轮「上一页→下一页」+ 一次「最新消息」）

真实按钮驱动真实 `loadHistory`/`latestHistory` 通路，结果全部通过：

- 页范围：`1712–1771` → `1772–1831`（每页 60，`total 1831`），两轮重复结果一致（幂等）。
- 边界连续且无重叠：旧页 id 集合与新页集合无交集，且旧页最大 entryId < 新页最小 entryId
  （`e01770` → `e01773`，含游标语义的边界）；最新页确实含末条 `e01830` 且 range.end = 1831。
- 显式翻页从页顶读起：每步 `#transcript.scrollTop = 0`（不跳到底部、不继承上一页偏移）。
- 「最新消息」回到最新页且停在底部（scrollHeight − scrollTop − clientHeight ≤ 4）。
- DOM 有界：每步节点 1929–1955（波动 26，长页 18431px vs 最新页 18058px），
  每步 heap 5.0–5.2MB，翻页不随历史深度累积。

## 5. 明确未实测的缺口（别当成已验证）

- **图片消息**：夹具里没有任何 `type:"image"` 块，页面 `#output img` 实测为 0。
  因此「图片懒加载（`loading="lazy"`）/尺寸未知内容导致的布局位移，是否破坏跨页阅读锚点」**完全没有实测**。
- **折叠**：夹具不含压缩卡片、也不触发折叠交互路径；图片/折叠增高时依赖浏览器原生滚动锚定，没有自造位移补偿引擎，浏览器端稳定性未验证。
- **流式/实时锚点**：翻页期间「新消息到达保持当前阅读页、游标置 pending」的事件分支本轮未触发；
  `snapshot()` 中「attach 回来的页不含锚点 → 自动跳回锚点所在页」的阅读锚点保留路径需要重连/重新 attach，
  夹具下未构造，未在浏览器端验证。
- 内存泄漏判断（见第 3 节）、长时间 soak、真实模型/网络、真实用户数据、真机/移动端、多标签并发均未覆盖。
- 本报告不是「动态虚拟化」的证据：没有全历史滚动条、没有连续滚动虚拟窗口、没有高度缓存，
  更早内容必须点「上一页」显式取。

## 6. 复现命令

```bash
# 当前代码（写 after.json，不覆盖 baseline.json；已存在则拒绝写入）
node docs/perf-history-session/measure-baseline.mjs --mode current \
  --repo <worktree> --runs 3 --switch-rounds 3 --page-rounds 2 \
  --out docs/perf-history-session/after.json

# 基线代码（物化 ab52936 后再跑）
node docs/perf-history-session/measure-baseline.mjs \
  --repo <worktree> --baseline-commit ab52936 --runs 3 \
  --out docs/perf-history-session/baseline.json
```


## 7. 复核补修后的独立复测

`followup.json` 保留补修版原始记录，不覆盖上面的 `after.json` 历史证据。
采样 HEAD 为 `6bf76fe`，包含当时未提交的 `public/app.js` / `src/sessions.js` 补修；
`codeDigest 76964448…`，`app.js 51150aab…`。夹具归一化 SHA256 与基线相同。
同机同脚本串行采集 3 轮，无用户服务、用户数据或真实模型请求：

- 1831 条首输出 149 / 163 / 148ms，静默完成 930 / 937 / 929ms，最大长任务 0 / 54 / 0ms。
- 当前页文档节点均为 1930，GC 后堆均为 3.9MB。
- 6 次切换中，回到长会话节点 1929 → 1929 → 1929，GC 后堆 4.8 → 4.9 → 4.9MB。
- 两轮翻页的全部断言通过，页间节点波动 23；范围仍为 1712–1771 → 1772–1831。
- 第 5 节未覆盖事项保持不变；本次没有补做图片/流式增高的真实布局验收。

复现时用新的 `--out` 路径，避免覆盖已有证据。
