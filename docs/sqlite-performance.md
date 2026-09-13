# SQLite 拆表性能验收报告（G 包）

执行：G（性能验收）| 日期：2026-09-13（-07:00）| 脚本：`tests/sqlite-benchmark.mjs`
被测：`Axiom-sqlite-refactor-plan` @ **2df2b2b**（git archive 物化快照，只读源码）| 基线：**4371708**

## 结论（按维度，不做总体宣称）

- **写入字节**：大数据集单次保存从 **1.35MB（整份重写）降到 17~680B**（约 3~4 个数量级）；
  小数据集从 33~40KB 降到 17~680B。写字节口径 = 写语句 SQL 绑定字符串的 UTF-8 字节（唯一计量点）。
- **写语句数**：热路径每次操作 1 条写语句（进度送达+修剪为 2 条：插入事件 + 修剪）。
- **启动**：旧版全量解析 + 全量创建 SDK（large 337ms、16 个 SDK）；新版元数据启动
  （large 1.8ms），无待通知任务 **0 个 SDK**，恰 1 会话待通知只创建 **1 个** SDK（硬门槛 5b）。
- **存储层启动读**：large 旧 `list()` 全量解析 p50 **109ms**；新元数据读 **0.094ms** +
  待通知查询 0.016ms，单会话全投影首开读 7.7ms（按需）。
- 硬门槛 **6/6 通过**（含门4 动态逐 token 不写库验证），双进程锁实验超时可见。

## 运行命令

```bash
# 在仓库根目录运行（分支 feat/sqlite-benchmark）；默认被测就是当前仓库（含 src/sessions.js 即可）
node tests/sqlite-benchmark.mjs                        # 全量：small+large、端到端、硬门槛、锁实验
node tests/sqlite-benchmark.mjs --sizes small          # 只跑小数据集
node tests/sqlite-benchmark.mjs --new-dir <目录>       # 指定被测代码目录（默认当前仓库根）
node tests/sqlite-benchmark.mjs --baseline-ref <sha>   # 指定基线（默认 4371708）
node tests/sqlite-benchmark.mjs self-check             # 脚本自校验：百分位/计量/失败判定/环路采样

# 被测任意 revision 的标准做法（不改动该工作树磁盘状态）：
#   git -C <E工作树> archive <sha> src public | tar -x -C <临时目录>
#   node tests/sqlite-benchmark.mjs --new-dir <临时目录>
#   （快照若脱离 node_modules，脚本会用 junction 接回可用依赖目录）

# 退出码：0=全部通过；1=任一硬门槛失败、任一子命令失败或锁实验不符预期（见结论段明细）
```

## 方法与环境

```
机器    AMD Ryzen 7 5800X | Windows 10.0.26200 x64 | Node v24.19.0（node:sqlite 内置）
基线    git archive 4371708 (src, public) 物化到临时目录后 import 真实旧代码
被测    2df2b2b 磁盘快照（src+public），读取时刻 2026-09-13T05:41:31Z
数据    全部在 mkdtemp 临时目录，fake SDK（可注入 createAgent），绝不触碰 ~/.axiom
样本    写操作 40 次/相位（small）、12 次/相位（large）；读操作 5 次；单机单轮，未做多轮聚合
```

数据集（**数量值均为字符数**；中文“字”UTF-8 每字 3 字节，真实字节以 `Buffer.byteLength`
计量，见表中载荷/写字节列）：

```
small:  8 会话 × 4 摘要(200字) × 2 任务(result 400字 + runtime 1200字)   → 单会话载荷 32~40KB
large: 16 会话 × 32 摘要(1000字) × 6 任务(result 49152字 + runtime 16384字) → 单会话载荷 1.29MB
```

口径与声明（先读这段再看表）：

- **唯一计量点**：写字节 = 写语句 SQL 绑定字符串参数的 UTF-8 字节数；SQL 次数 = 语句执行
  次数（**含读写**）；store 层调用只计次数不计字节。读语句的绑定参数不计入写字节。
- **侧别**：旧侧存储微基准是 baseline `persist()` 的逐字段复刻（同投影、同
  stringify→parse→set 双序列化管线，计时含首次 stringify 的完整保存成本），**不是端到端**；
  旧侧端到端另用真实旧 `Sessions` 类 + fake SDK。新侧全部 import 被测真实代码。
- **延迟**：p50/p95/p99 为排序后分位（最近秩）。本机 WAL+FULL 同步下单次提交有 fsync 地板
  （p50≈2ms 即此地板），绝对值不具跨机可比性；**写字节数与 SDK 数是主证**。
- **环路 max**：采样间隔 1ms，同步执行期间事件循环完全阻塞，故存储相位的 loop max ≈ 该相位
  总墙钟（每次操作都同步 fsync）；端到端的 loop max 才反映启动期真实停顿分布。
- **RSS**：子进程**退出前**采样（不是启动阶段瞬时值），受 GC 时机影响。
- **WAL ≠ 写入字节**：WAL 受 autocheckpoint（约 4MB）顶棚截断，部分相位显示 0，仅作辅助指标。
- **合成数据**：任务/摘要内容为中文字符填充的固定形状数据，非真实会话；SDK 为 fake（零网络）。

## 存储微基准（large：单会话载荷 1.29MB）

| 操作 | 旧 p50 | 旧 p95 | 旧 p99 | 旧写字节/次 | 新 p50 | 新 p95 | 新 p99 | 新写字节/次 | 写SQL/次(新) |
|---|---|---|---|---|---|---|---|---|---|
| 改标题 | 8.0ms | 8.6ms | 8.6ms | 1,354,534B | 1.95ms | 2.07ms | 2.07ms | 24B | 1 |
| 追加摘要 | 11.9ms | 22.0ms | 22.0ms | 1,355,188B | 1.95ms | 2.07ms | 2.07ms | 678B | 1 |
| 任务进度 | 12.0ms | 20.0ms | 20.0ms | 1,355,579B | 2.04ms | 12.2ms | 12.2ms | 415B | 1 |
| 任务通知(notified) | 8.0ms | 11.2ms | 11.2ms | 1,355,579B | 0.26ms | 0.40ms | 0.40ms | 25B | 1 |
| 进度送达+修剪 | 15.8ms | 24.1ms | 24.1ms | 1,355,573B | 4.02ms | 6.6ms | 6.6ms | 533B | 2 |
| 计时更新(elapsedMs) | 8.0ms | 12.0ms | 12.0ms | 1,355,573B | 1.95ms | 2.07ms | 2.07ms | 17B | 1 |

小数据集（单会话载荷 32~40KB）同型：旧每次写字节 33,355~40,698B，新 17~680B。

启动读与库体积（large）：

```
启动读(全部会话)     旧 p50=109.2ms（全量解析）   新 p50=0.094ms（元数据）+ 0.016ms（待通知查询）
存储层首开读(单会话)  新 p50=7.7ms（按需，打开哪个读哪个）
库文件               旧 22.0MB | 新 21.6MB      进程RSS(退出前) 旧 199MB | 新 87MB
```

WAL 增长（辅助指标，受 autocheckpoint 顶棚影响）：small 改标题 40 次，旧 +626KB vs 新 +165KB，
与写字节同向但不等比。

## 端到端（真实 Sessions + fake SDK）

| 场景 | 启动耗时 | 启动 SDK 数 | 首开 | 环路 max | RSS 增量 |
|---|---|---|---|---|---|
| 旧 small 无待通知 | 29.1ms | **8（全量创建）** | 启动时已含 | 7.9ms | +1MB |
| 旧 small 1 会话待通知 | 41.3ms | **8（全量创建）** | 启动时已含 | 11.4ms | +10MB |
| 旧 large 无待通知 | **337.0ms** | **16（全量创建）** | 启动时已含 | **106.5ms** | +38MB |
| 新 small 无待通知 | 1.6ms | **0（硬门槛 5b）** | 7.3ms | 13.5ms | +1MB |
| 新 small 1 会话待通知 | 9.0ms | **1（只恢复待通知）** | 4.6ms | 11.7ms | +1MB |
| 新 large 无待通知 | **1.8ms** | **0** | 21.8ms | 7.9ms | −5MB（GC 波动） |

## 硬门槛（6/6 通过，断言未放宽）

1. **追加摘要不更新旧任务**：任务行逐字节不变；`tasks` 表挂 `BEFORE UPDATE → RAISE(ABORT)`
   触发器，期间任何任务行更新直接抛错；SQL 写语句恰 1 条（summaries upsert）。
2. **notified 不携带 runtime/result**：notified 更新在 SQL 绑定层唯一计量，小任务 25B =
   大任务（49K字 result + 16K字 runtime）25B，与体积无关；断言写语句 ≥1（自校验计量层
   观测到了写入，防语句缓存绕过代理后门槛空转）。
3. **改标题不改任务**：tasks/summaries/session_events 三表行逐字节不变 + 三表 UPDATE 触发器
   （ABORT）+ 写语句恰 1 条（仅 sessions 行）。
4. **逐 token 不写库（动态）**：真实 `Sessions` + fake subscribe 注入 **100 个含 token 数据的
   事件**（agent.delta×66、agent.runtime×33 带 usage 计数），事件期间 **SQL 总数=0（含读）**；
   辅以静态证据：无 token/usage 列、摘要/事件/会话内容无 token 计数。任务 runtime 内 usage
   与 compaction.tokensBefore 属计划允许的运行详情快照，不在禁令内。
5. **待通知查询三态**：notified:false → 待通知；缺 notified 键（旧记录）→ 待通知；
   notified:true → 不待通知。
6. **无待通知任务启动 SDK=0**（端到端）：无待通知启动 SDK=0；恰 1 会话待通知时启动 SDK=1
   （只恢复待通知会话）；旧版对照 8/8、16/16 全量创建。

## 双进程同库持锁/超时可见

| 实验 | holder 实际持锁 | victim（生产构造器，busy_timeout=5000 未调参） |
|---|---|---|
| 持锁 300ms | 300ms | 等待 272.1ms 后写入成功（exit 0，阻塞可见、可恢复） |
| 持锁 6000ms（超过 busy_timeout） | 6000ms | 等待 5565.5ms 后失败：`database is locked`（exit 2，超时可见） |

时序保证：holder 拿到写锁后先输出 `READY`，父进程收到才启动 victim——测量必落在持锁窗口内，
不存在旧探针方案的抢锁干扰。victim 只有锁超时归为预期结果（exit 2），其他错误单独暴露（exit 4）。

锁窗口与写入字节的定量关系本实验**不给出**：两个场景只证明「短持锁可等待恢复、超长持锁
超时可见」。单次写事务变小是否等比缩短锁窗口，需要按字节分级的多点实验，未在本次范围。

## 限制

- 存储微基准的旧侧是 `persist()` 复刻而非端到端；两侧端到端均为 **fake SDK + 合成数据**
  （中文字符填充、固定形状），未测真实模型 SDK、真实会话分布与正式库容量/运行指标。
- **样本小**：写操作每相位 40 次（small）/12 次（large），读操作 5 次，单机单轮，p95/p99
  受尾部抖动影响大，应与写字节、SDK 数等确定性指标一起解读。
- 延迟绝对值受本机 fsync 地板与 autocheckpoint 顶棚影响，跨机器对比以写字节数与 SDK 数为准。
- RSS 为子进程退出前采样，受 GC 时机影响（新 large 端到端 −5MB 属波动）；非启动阶段瞬时值。
- WAL 增长受 autocheckpoint（~4MB）顶棚截断，部分相位显示 0，仅作辅助指标，不等于写入字节。
- 历史线性匹配（无平方扫描）属 F 包范围，不在本脚本覆盖：fake `historyEntries()` 恒为空。
- 门4 在被测存储层验证「逐 token 不写库」；真实 token 流的来源与 UI 层防泄漏由 D/E 层单测覆盖。
- 本次被测为 2df2b2b 快照；集成合并后，主审在当前仓库直接 `node tests/sqlite-benchmark.mjs`
  即可对最终代码复跑（默认 `--new-dir` 即仓库自身，命令见上）。
