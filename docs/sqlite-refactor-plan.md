# SQLite 拆表与修复执行计划

状态：五表、增量写、按需恢复与 A/B/C/D/E 接线已落地；隔离全量测试通过，最终复核与性能验收进行中。基线 `4371708`，2026-09-13 UTC。未重启正式服务或迁移正式数据。

## 1. 已确认的方向

- 保留SQLite，小配置继续JSON。不是所有namespace混在一个JSON：旧store每个会话一行，但该行里的摘要、记录、全部子任务被频繁整份重写。
- 最终五张业务表：`store / sessions / summaries / session_events / tasks`。
- Pi JSONL继续负责原始消息、分支与历史恢复；数据库不复制主会话完整消息，不新增子任务逐消息归档。
- 不做回滚框架、反向迁移、双写、旧版运行兼容、多阶段发布门禁、ORM或通用事件溯源。新表是唯一动态数据写入来源。
- 必要的数据安全仍保留：迁移前备份、逐会话事务、幂等标记、坏行保留与字段对账；不会用“没有回滚”当丢数据理由。
- 不先加数据库Worker、缓存或分库；先测拆表后的实际瓶颈。

## 2. 表设计

```text
store                        defaults/presets/settings/models/auth/remote/maint/migrated
sessions                     标题、目录、时间、配置、JSONL路径、标题标志、计时、主轮次
  +-- summaries              每条摘要一行
  +-- session_events         每条事件一行，通过type区分
  +-- tasks                  每个子任务一行
```

### sessions

实际列：`id, cwd, title, title_manual, title_requested, created_at, updated_at, elapsed_ms, running_since, main_turn, session_file, selection`（selection 为配置 JSON）。

不含任务/摘要/重试等历史数组。配置整体读取低频更新，用JSON；修改标题仅更新标题。重启不计入停机时长，不把旧running解释成任务可恢复执行。

### summaries

实际列：`session_id, id, agent_id, record`；复合主键 `(session_id,id)`，查询按 SQLite rowid 写入序。

record 是单条原形 JSON，保留 turn/entryId/text/timestamp/source/messageTimestamp/triggerId/toolResults。按会话或会话+代理查询，limit 取最近 N 条；不做尚无调用方的游标接口。追加为主，消息落盘后补 entryId、turn_end 补工具状态；撤回清理正确关联摘要，不能污染之后的委派背景。

### session_events

实际列：`session_id, type, agent_id, key, record`，按 rowid 写入序查询；有 key 时 `(session_id,type,agent_id,key)` 部分唯一索引保证重放幂等，不同代理同 ID 不误并。

类型仅包括 `compaction / retry / summary_trigger / progress_delivery`。JSON是一条事件的特有数据，不是全部记录数组。不保存token/聊天消息，不创建事件总线。旧记录缺ID时按原序号生成稳定迁移ID；同毫秒不能改变顺序。

保留压缩边界、重试anchorEntryId/messageCount/history、触发规则与实际提示词、进度送达记录。进度送达沿用最近50次及8000字符预算。

### tasks

实际列：`session_id, id, memory_turn, notified, progress_delivered, progress, record`，复合主键 `(session_id,id)`。通知、交付、进度和轮次是独立列；低频变更的任务内容（task/status/text/error/resultId/parentContext/runtime/createdAt/updatedAt）保存在单任务 record JSON，无完整会话 JSON。

- parent_context是委派时的真实背景副本，不用今天的摘要重建旧背景。
- runtime_json是**运行详情快照**：model/thinking/systemPrompt/context/usage。usage是最近助手消息用量，不是累计任务用量；不是进程快照，不能用于恢复执行。
- 状态/结果按单任务更新；通知标志、进度、轮次只更新独立列，完成后的大结果和 systemPrompt 不随其他会话事件重写。
- 旧任务没有创建时间就保持未知，不伪造时间。轮次不能通过摘要条数反推。

### 约束与查询

子表 session_id 外键级联删除，所有连接开启 foreign_keys；父行新建 INSERT、更新 UPDATE，禁止 REPLACE 触发意外级联。除主键索引外，事件有 `(session_id,type)` 扫描索引与上述身份索引；会话列表只取小元数据，暂无 SQL 工作空间分页和摘要游标调用，不加未使用索引。保留事件原形 JSON 是逐实体拆分，不是换表继续整会话回写。

## 3. 必做修复

| 问题 | 最小修复 |
|---|---|
| 大JSON整份重写、重复stringify/parse/stringify | 简洁session-store实体接口，真正按变更写；不要内部循环upsert全部历史伪装增量 |
| 模型已入库但compat/SDK失败，页面误报未保存 | 返回新指纹和applied状态；允许重试应用；数据库未成功仍报失败；不做跨文件回滚 |
| 坏JSON在list整体解析导致启动失败 | 逐行隔离，保留错误行并提供脱敏定位，SQL连接错误不吞 |
| 模型导入失败仍打完成标记 | 成功才标记，修好源后能重试，告警去重；混合坏auth不永久漏项 |
| defaults存在提前return阻断presets | 两个迁移独立判断 |
| 测试sidecar写到公共Temp/axiom.db | 数据库放到本次临时目录，关闭后清理；不去删除已存在公共库 |
| remote双重JSON编码 | 兼容读旧字符串/新对象，只写对象；坏结构继续默认禁用 |
| maint旧persistenceError被再次存入库 | 成功快照不带过期错误，失败仍可见；所有phase入口有界 |
| 临时配置含密钥、rename占用失败 | 唯一文件名、完整异常清理、瞬时占用有限重试，不先删目标；不做大型后台清扫框架 |
| 主库chmod不等于所有文件都安全 | 检查POSIX DB/WAL/SHM/临时文件和Windows ACL，不假定WAL一定0644，不修改共享父目录权限 |
| 启动创建全部SDK、历史从头findIndex | 元数据启动，统一按需恢复；历史单向匹配，保留分支与消息ID |
| README存在旧JSON权威/未引入SQLite描述 | 实现后同步真实说明 |

待验证而非已确认Bug：撤回无entryId摘要残留、完成通知与用户输入竞态。用可控时序复现，成立才修，不按猜测删除正常数据。

## 4. 增量写与恢复不变式

- onReply同步登记摘要，delegate必须能立即冻结当前摘要，不能等数据库或turn_end；内存保留必要的小视图。
- 任务终态与result_id先提交，再通知；失败不通知，notified单字段更新。取消、关闭、重启补发沿用现有语义，不承诺exactly-once。
- 新会话确认、配置确认、结果通知前、删除和退出前必须等待保存完成；普通重复状态允许合并，不一刀切防抖。
- 事务必须同步短小，不跨await/网络/SDK/文件复制。JSONL和SQLite不是共同事务，按原entryId幂等对账。
- 全量snapshot仅用于当前会话展示，不再作为存储格式，不悄悄截断前端历史。
- 启动读元数据，不初始化所有SDK；attach/prompt/configure等统一去重加载。list/rename/删除未加载会话不启动SDK。
- 未通知任务独立检索并按需加载对应会话；不得因懒加载丢通知。
- 审核get/snapshot/subscribe/cancel/close/remove/hasActiveWork及server直接访问items/agent的全部调用，不能只改load。
- 不做闲置代理LRU和聊天虚拟列表。本轮先把未打开历史会话从启动路径移除。

## 5. 直接迁移

1. 实施和验收只用独立临时数据，不启动正式迁移。实际迁移前停止同HOME的业务写者并做一致性备份；daemon也连库，不能只停worker就热拷贝单个db文件。
2. 创建新表；首次真实导入前自动 VACUUM INTO 唯一临时备份，成功后更名为 `axiom.db.pre-store-migration.db`（权限 600，Windows 依赖目录 ACL），失败清理残片、不标记。SQL 排除已迁移源，只取待迁移键，再逐条解析；每会话四表与完成标记同一 SAVEPOINT 提交。坏行保留、脱敏告警，其他会话可继续。
3. 原ID、顺序、配置、轮次、计时、进度、结果凭证、通知状态与JSONL路径逐项对账；未知字段先查清，不静默扔掉。
4. 重跑迁移不覆盖新表更新、不重复摘要/任务/通知。旧KV/JSON仅保留迁移源，不双写不作为新表读取兜底；删除后不能从旧源复活。
5. 更早workspaces JSON经同一入口导入。缺JSONL保留会话记录并报告原因，不创建空历史覆盖。
6. 删除数据库会话级联子行；Axiom拥有的JSONL副本单独清理，失败可见，不删导入原文件。

## 6. 并行执行计划与文件所有权

```text
A 数据库/四表/迁移 -----------+
B 模型配置修复 --------------+
C remote/maint修复 ----------+--> E 主审接线 --> F 按需恢复/历史优化 --> G 验证合并
D 摘要/任务增量生产端 -------+
```

A/B/C/D已同时启动，各用独立worktree与feat分支；E由主审独占sessions.js。F与E串行，禁止两个代理同时改生命周期文件。

| 包 | 独占文件 | 验收 |
|---|---|---|
| A | src/database.js、新session-store.js、新存储测试/database测试 | 实体增量SQL、短事务/外键、幂等迁移、坏行隔离、字段对账 |
| B | src/model-config.js、pi-model-storage.js、对应模型测试 | applied回执、指纹一致、坏源修复可重试、混合凭据、异常清理；不改server/UI |
| C | src/remote.js、scripts/maint-state.mjs、对应测试 | 新旧编码、fail closed、错误标记与阶段有界 |
| D | src/session-memory.js、tasks.js、对应测试 | 按变更回调、同步摘要背景、任务结果语义、测试临时库隔离 |
| E | src/sessions.js/main.js/server.js/protocol.js、会话/通知等测试；必要model-manager显示 | 接A/D接口，模型回执接线、默认/预设迁移、删除/撤回/关闭、取消全量persist |
| F | E交接后独占sessions.js/pi.js与相关调用者 | 元数据启动、并发加载去重、通知恢复、历史线性匹配 |
| G | 集成负责人及只读复核 | 定向/全量测试、锁实验、性能对比、README/devlog/知识/索引、提交合并 |

无额外发布/回滚工作包。涉及UI行为先遵循design skill，不改版。各worktree独立修改并提交，README/devlog由集成顺序合并；INDEX统一重建。收到delegate完成通知后读一次结果，不轮询；不因单测通过省略主审。

## 7. 验收与性能

### 必须通过

- 新旧数据迁移、重复迁移、事务中断、坏行、缺字段、缺JSONL、删除后不复活。
- 主/子轮次与摘要顺序、消息/工具关联、压缩/重试边界、结果凭证和通知状态保持。
- 保存失败不通知；取消/用户输入/配置/关闭/重启不丢结果；JSONL导入副本所有权不变。
- 模型DB成功+compat/refresh失败时页面与新指纹一致，不泄露密钥。
- 未加载/加载中/已加载会话的全部入口；并发首次加载只创建一个SDK。
- 两进程同库持锁/超时可见，远程鉴权与维护忙碌门禁不回归。
- 独立临时数据、连接关闭后清理；定向测试及全量npm test、git diff --check，必要真实SDK/浏览器隔离验证。

### 性能验收

固定合成小/大数据集，记录机器/Node/数据尺寸，比较启动时间、SDK创建数、RSS、首次打开、保存p50/p95/p99、事件循环延迟、SQL次数/序列化字节及WAL增长。

硬性要求：新增摘要不更新旧任务；改标题只更新会话；notified更新不携带runtime/结果；token不写库；无待通知任务时启动SDK创建数为0；历史匹配不做平方扫描。不以丢历史或截断结果换性能。

此前66项相关测试通过和870ms锁实验是审查基线，不是新实现的验收。拆表不消灭写锁；先短事务/减写入，不增加busy_timeout掩盖卡顿，不关闭耐久性。专用Worker仅在完成以上优化后仍有实测交互卡顿时再做，不提前搭建。

## 8. 完成条件

独立worktree验证与复核 -> conventional commit并push -> 集成验证后合并master并push -> 清理worktree。master不直接修改。

最终报告必须给实际表结构、迁移验证、测试/性能结果和仍存在的限制。正式服务不自动重启或迁移用户数据；需要停服务的实际部署与用户确认时机。
