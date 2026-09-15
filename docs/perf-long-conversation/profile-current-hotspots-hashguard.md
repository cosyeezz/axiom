# History 地址判断后：单次串行诊断

数据：`profile-current-hotspots-hashguard.json`。主代理执行一次带 profile/trace 的加载及一次独立慢读探针加载，工具 timeout=180 秒，进程正常退出，随后确认全局测量锁不存在。未覆盖旧产物。

## 样本与版本

- JSONL：12,394,998 字节，SHA256 `6dfedb20cb2d97396b928067d0beb0410b8a817f48edeb83598a342fd61c7cf1`，与旧记录一致。
- app.js：`f8165f01f26ec0804a90d48feb64c6aaac36ff03a59f0348f7378c1bca249896`。
- 浏览器：HeadlessChrome/148.0.7778.96，hardwareConcurrency=16。
- 原始 trace/profile 仅留本机临时目录 `axiom-profile-current-oOleYn/raw-profiles`，不入库。

## 原始点值，不计性能验收

| 指标 | 数值 |
|---|---|
| 首次 DOM 输出（不是 paint） | 740ms |
| 页面 longtask（起点 / 耗时） | 446 / 294ms；740 / 161ms；1750 / 403ms |
| trace 汇总阻塞任务耗时（文件顺序） | 403ms；294.6ms |
| 交叉核对 matched | **false** |
| 独立探针页面长任务 | 283ms；154ms；408ms |
| beginSnapshot phaseActiveMs | 3.2ms |

只读复核发现两个独立问题：页面耗时数组按发生时间排列，trace数组按耗时降序排列，原逐项比较存在排序错误；此外，页面的161ms条目在trace中确实未找到对应长任务。修复排序也不会消除后一处数量不一致，仍不通过交叉核对。

原始事件：主线程pid=57348、tid=73184，CommitLoad ts=1027887890304；相对该起点的RunTask为439.00/294.56ms与1743.49/403.01ms。对应未匹配条目的窗口内，rel 733.60→889.20约155.7ms没有RunTask，CPU profile的276次采样全部为idle；恢复后首个RunTask为889.21/5.40ms。页面时间比此trace相对时间约大6.76ms（只读报告原文字号方向写反，以这两条匹配事件为准）。

这支持“该窗口未记录到连续161ms主线程计算”，但不能据此判定页面条目虚假，或确认是后台队列饥饿/观测开销。两个来源的不一致保留，不采用忽略额外页面条目、把trace子集匹配视为整体验证成功的建议。

**不能把 beginSnapshot 归因减少直接当成整页节省约150ms**。当前长任务仍超过200ms；两条吻合任务仍可用于热点诊断，但本次不满足三次性能验收。

JSON 的 `verification.passed` 仅来自计数稳定性流程，不能凌驾于 `crossCheck.matched=false` 宣称整次性能验证成功。此处明确按未通过性能验收处理；一次加载也不满足三次要求。

## 已匹配任务的进一步归因

只读复核699c9972：403.01ms任务中，JS约7.2ms；UpdateLayoutTree 43.948ms、Layout 334.902ms、PrePaint 13.648ms。Layout记录dirtyObjects=15339、totalObjects=15384、partialLayout=false、根为document；此前布局对象仅67个。恢复链在快照分片和refreshSessions完成后才将workspace由hidden改为显示，符合“分片建DOM后仍发生一次整体首布局”的解释。继续审查是否可在已批准P1-2范围内安全渐进显示；尚未实施或证明收益。

294.559ms任务从network.mojom.WebSocketClient消息投递进入；约190.85ms后记录WebSocketReceive（97625字节），约255.57ms后进入DOMWebSocket message回调。CPU profile约256.2ms归到program，不能区分原生计算与等待；不能据97KB或回调时长断言服务端耗时/JSON.parse必然成本，也不能把相邻发送接收差值直接当服务端生成时间。本产物不足以判定该段可由前端哪处代码消除。

## 复现

复用 `profile-current-hotspots.mjs --runs 1`，数据库、会话及代码来源见 JSON provenance；使用已安装的 Python Playwright 1.60.0 包入口，未指定另一版 Chromium。不重复写本次 JSON，后续必须指定新的输出路径并遵守共享锁。
