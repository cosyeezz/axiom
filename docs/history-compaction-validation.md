# 历史归档与压缩验证记录

工作分支：feat/op-removal-compaction。初始基线 d6dc014；已集成 77beb10 及其祖先。SDK 固定 0.85.1。测试使用 Node 24、真实 SDK 与本地 HTTP/SSE 假供应商，不调用付费模型。

## 验证层次

- L1 纯逻辑：compaction-state / budget / input、history-tools。
- L2 文件系统：raw-history、history-journal、legacy-history-dryrun。
- L3 SDK 集成：compaction、observation-pack-flow（真实 SDK、隔离凭据、本地供应商）。
- L4 模型质量：尚未执行人工标注的真实模型评测，不能把 L1—L3 的假响应当作质量评测结果。

## 验收证据索引

状态“部分”表示存在实现与回归，但尚不能宣称整个场景已完整验收。

| 场景 | 证据 | 状态 |
|---|---|---|
| T01—T05、T08 | raw-history 三次压缩原文/控制分流、身份重放与同文异事件；observation-pack-flow 未压缩尾部恢复 | 通过 |
| T06—T07 | raw-history 身份冲突；history-tools allowed 作用域 | 部分：需主/子同 ID 集成验证 |
| T09—T10 | custom_message 按类型归档；完整 tool fullOutputPath 产物独立保留、缺失拒绝；内嵌内容全字段保存 | 通过：含内嵌图片、取消后的 thinking/signature 与 custom_message 跨重开回归 |
| T11—T13、T15 | compaction-state 十轮继承；compaction 真实 SDK 摘要 JSON、用户约束更新与工具伪授权拒绝 | 通过确定性回归；真实模型质量未评测 |
| T14、T20 | 提示词禁止计划变完成，保留未知与分歧 | 部分：语义质量专项未执行 |
| T16—T19 | compaction-input UTF-8 首尾与省略清单；真实 recall 不删除；伪引文/非 JSON 拒绝；来源清单独立生成 | 通过 |
| T21—T24 | compaction 单 flight、ready、安全点、追加尾部、分支切换及其他摘要作废 | 通过 |
| T25 | 配置/取消 generation，屏障期间取消回归；暂停/撤回取消候选 | 部分：关键权限变更组合待补 |
| T26—T29 | 工具切点配对、窗口硬守卫；checkpoint 来源检查与真实重开；手动同步/异步共用提交 | 通过现有回归 |
| T30 | fork copiedFrom 同目录来源校验与 ref 兼容，当前链授权 | 部分：多层 fork 集成待补 |
| T31—T32 | 首用户落盘与重开；journal 原文补齐和 barrier | 通过 |
| T33—T37 | 屏障故障拒绝、提交不确定锁存、精确 journal 尾部确认；内存候选不被重开使用 | 部分：OS 短写/磁盘满与逐点进程终止矩阵待补 |
| T38—T40 | 残尾隔离、来源改写/删除检测、首消息前写锁、关闭 flush | 部分：跨进程写锁竞争已验证，逐点强杀专项待补 |
| T41—T46 | history-tools 中文/emoji/CRLF 连续分页、完整响应预算、篡改拒绝、搜索快照与再授权 | 通过现有回归 |
| T47—T50 | 不删除取回事件、历史警告、提交前工具激活与来源检查、历史文件不重执行 | 部分：主/子恢复组合待补 |
| T51—T57、T59 | 生产无 OP 自动折叠依赖，旧 obs 只读、无 ledger，超窗硬守卫和多轮大结果原文保留 | 通过现有回归 |
| T58 | 摘要请求接入 usage stream，关闭嵌套自动重试；本地失败 usageKnown=false，终态首写防重复 | 部分：stale/rejected/cancelled 计费矩阵待补 |
| T60 | legacy-history-dryrun 测试只读、缺失附件和冲突报告；未执行生产回填/删除 | 通过 |

## 最终确定性回归

2026-09-21，合入 77beb10 后执行 `npm test`：873 项，871 通过、0 失败、2 跳过。`git diff --check` 通过。这里只证明已执行回归，没有补齐下述所有验收缺口。

## 发布边界

此记录不是“全部验收通过”声明。上述部分项和 L4 尚未闭环之前，不得据全量单元测试通过宣称方案全部交付。生产数据未执行迁移或删除。主检出用户修改不得覆盖。
