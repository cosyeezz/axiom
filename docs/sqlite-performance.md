# SQLite 拆表性能验收报告（G 包）

执行：G（性能验收）| 日期：2026-09-13（-07:00）| 脚本：`tests/sqlite-benchmark.mjs`

## 结论

拆表后全面优于旧 KV 整份保存：大任务场景单次保存写入字节从 **1.35MB 降到 35B~1.3KB**（约 3~5 个数量级），启动从 **全量解析+逐会话创建 SDK（359ms、16 个 SDK、事件循环停顿 113ms）** 变为 **元数据启动（8.1ms、无待通知 0 个 SDK、停顿 4.5ms）**。硬门槛 **6/6 通过**，双进程锁实验超时可见。

## 运行命令

```bash
# 在本 worktree 根目录（F:/worktrees/Axiom-sqlite-benchmark，分支 feat/sqlite-benchmark）
node tests/sqlite-benchmark.mjs                       # 全量：small+large、端到端、硬门槛、锁实验
node tests/sqlite-benchmark.mjs --sizes small         # 只跑小数据集
node tests/sqlite-benchmark.mjs --new-dir <E工作树>    # 指定被测代码目录（默认 ../Axiom-sqlite-refactor-plan）
node tests/sqlite-benchmark.mjs --baseline-ref <sha>  # 指定基线（默认 4371708）
# 退出码：0=全部硬门槛通过；1=有门槛失败（子进程失败同样如实呈现）
```

## 方法与环境

```
机器    AMD Ryzen 7 5800X | Windows 10.0.26200 x64 | Node v24.19.0（node:sqlite 内置）
基线    git archive 4371708 (src, public) 物化到临时目录后 import 真实旧代码
被测    F:/worktrees/Axiom-sqlite-refactor-plan 磁盘快照（src+public），读取时刻
        2026-09-13T05:13:52Z（A 的 notified/progress 独立列改动已包含，见 src mtime 记录）
数据    全部在 mkdtemp 临时目录，fake SDK（可注入 createAgent），绝不触碰 ~/.axiom
小数据  8 会话 × 4 摘要(200B) × 2 任务(result 400B + runtime 1.2KB)，单会话载荷 ~40KB
大数据  16 会话 × 32 摘要(1KB) × 6 任务(result 48KB + runtime 16KB + usage)，单会话载荷 1.29MB
指标    单次操作延迟 p50/p95/p99（hrtime）、SQL 绑定字符串字节（真实落库字节）、SQL 次数、
        WAL 文件增长、进程 RSS、事件循环最大停顿（1ms 采样）、启动耗时与 SDK 创建数
```

侧别说明（诚实声明）：

- **旧侧存储微基准**是 baseline `persist()` 的逐字段复刻（同投影、同 stringify→parse→set 双序列化管线），
  **不是端到端**；旧侧端到端另用真实旧 `Sessions` 类 + fake SDK 单独跑。
- **新侧**全部 import E 真实代码（database.js / session-store.js / sessions.js），热路径调用形态
  与 E 实际接线一致（如通知 = `saveTask(id, {id, notified: true})` 单列 UPDATE）。
- 延迟绝对值受 fsync 地板（约 2ms/次提交，synchronous=FULL 未降级）影响，**字节与 SDK 数是主证**。

## 存储微基准（大任务 runtime/result 有实际重量）

单会话载荷 1.29MB（大数据集）：

| 操作 | 旧 p50 | 旧写入字节/次 | 新 p50 | 新写入字节/次 | 字节降幅 |
|---|---|---|---|---|---|
| 改标题 | 7.1ms | 1,354,534B | 2.1ms | 69B | ~19,600× |
| 追加摘要 | 11.0ms | 1,355,188B | 1.9ms | 1,331B | ~1,000× |
| 任务进度 | 17.3ms | 1,355,579B | 2.0ms | 834B | ~1,600× |
| 任务通知(notified) | 5.2ms | 1,355,579B | 0.27ms | 58B | ~23,000× |
| 进度送达+修剪 | 10.9ms | 1,355,573B | 4.0ms | 955B | ~1,400× |
| 计时更新 | 7.0ms | 1,355,573B | 2.1ms | 35B | ~38,700× |

小数据集（~40KB/会话）同型结论：旧每次 33~40KB 整份重写，新 35B~1.3KB 按实体写。
WAL 增长与写字节同向（旧 small 改标题 40 次 +626KB vs 新 +165KB），但 WAL 受 autocheckpoint
约 4MB 顶棚截断，仅作辅助指标。进程 RSS：大数据集启动读阶段旧 194MB vs 新 87MB。

存储层启动读（大数据集）：旧 `list("sessions")` 全量解析 **112ms**；新元数据读 **0.063ms** +
待通知查询 0.010ms；单会话全投影首开读 7.8ms（按需，打开哪个读哪个）。

## 端到端（真实 Sessions + fake SDK）

| 场景 | 启动耗时 | 启动 SDK 数 | 首开 | 事件循环最大停顿 | RSS 增量 |
|---|---|---|---|---|---|
| 旧 small 无待通知 | 29.5ms | **8（全量创建）** | 启动时已含 | 3.4ms | +10.4MB |
| 旧 large 无待通知 | **359.6ms** | **16（全量创建）** | 启动时已含 | **113.0ms** | +37.6MB |
| 新 small 无待通知 | 2.0ms | **0（硬门槛）** | 6.6ms | 0.4ms | +1.0MB |
| 新 small 1 会话待通知 | 8.3ms | **1（只恢复待通知）** | 3.3ms | 1.3ms | +1.2MB |
| 新 large 无待通知 | **8.1ms** | **0** | 27.4ms | 4.5ms | −3.4MB |

## 硬门槛（6/6 通过，断言未放宽）

1. **追加摘要不更新旧任务**：任务行逐字节不变，摘要正确追加。
2. **notified 不携带 runtime/result**：notified 更新在 SQL 绑定层计量，小任务 25B = 大任务
   （64KB result + 16KB runtime）25B，与体积无关（A 的独立列修复已落地并被本门槛验证）。
3. **改标题不改任务**：tasks/summaries/session_events 三表逐字节不变，仅 sessions 行更新。
4. **token 不写库**：无 token/usage 列；摘要/事件/会话内容无 token 计数（任务 runtime 内
   usage 属计划允许的运行详情快照）。
5. **待通知查询三态**：notified:false → 待通知；缺 notified 键（旧记录）→ 待通知；
   notified:true → 不待通知。
6. **无待通知任务启动 SDK=0**（端到端）：无待通知启动 SDK=0；恰 1 会话待通知时启动 SDK=1
   （只恢复待通知会话）；旧版对照为 8/8、16/16 全量创建。

## 双进程同库持锁/超时可见

| 实验 | holder 实际持锁 | victim（busy_timeout=5000，生产默认未调参） |
|---|---|---|
| 持锁 300ms | 300ms | 等待 322.6ms 后写入成功（阻塞可见、可恢复） |
| 持锁 6000ms（超过 busy_timeout） | 6000ms | 等待 5536.1ms 后失败：`database is locked`（超时可见，未吞错） |

与基线审查的 870ms 锁实验同型：拆表不消灭写锁，但单次写事务已从「整会话重写」缩短为
单行/单列更新，持锁窗口随写入字节同幅缩小。

## 限制

- 存储微基准的旧侧是 `persist()` 复刻而非端到端（已如上声明）；两侧端到端均为 fake SDK，
  未测真实模型 SDK 与正式库容量/运行指标。
- 延迟绝对值受本机 fsync 与 autocheckpoint 顶棚影响，跨机器对比应以写字节数与 SDK 数为准。
- WAL 增长受 autocheckpoint（~4MB）顶棚截断，部分相位显示 0，仅作辅助指标。
- RSS 为子进程采样，受 GC 时机影响（新 large 端到端出现 −3.4MB 属正常波动）。
- 历史匹配不做平方扫描属 F 包范围，本脚本 fake `historyEntries()` 恒为空，未覆盖。
- 门4 在存储层验证（喂入记录本无 token）；真正防泄漏在 D/E 层，由其单测覆盖。
- 本次读取的 E 快照含 A 的独立列改动（session-store.js mtime 2026-09-13T05:08Z）；
  A 最终交付后主审应以同一脚本对最终代码重跑（命令见上，结果可对照本报告）。
