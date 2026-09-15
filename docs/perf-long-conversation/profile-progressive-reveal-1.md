# 首屏渐进显示：单次串行诊断

原始数据：`profile-progressive-reveal-1.json`，不覆盖历史。一次profile/trace加载加一次独立慢读探针；工具timeout=180，退出码1来自交叉核对失败，非超时；事后确认共享锁不存在。

样本12,394,998字节，SHA256 `6dfedb20cb2d97396b928067d0beb0410b8a817f48edeb83598a342fd61c7cf1`，与前次一致。app.js SHA256 `1001e36c4811c2db2cae5dd965881f98732011a5e61f2144d099e0ab3a275679`。浏览器配置沿用前次Chromium148。原始trace仅留本机临时目录 `axiom-profile-current-u6OpfC/raw-profiles`。

| 指标 | 本次点值 |
|---|---|
| 首次DOM输出（不是paint） | 734ms |
| 页面长任务，按时间序 | 282、167、134、50、74ms |
| trace阻塞任务，按耗时序 | 282、134.8、74.3、50.6ms |
| 独立探针页面长任务 | 280、169、134、50、73ms |
| 稳定性计数：节点/output子节点/article | 41655 / 92 / 143 |
| verification.passed | **false** |

前次单次profile的403ms任务本次未出现；本次仍有282ms任务，页面167ms条目未匹配trace，因此不能宣布整体达标。仅可作为渐进显示方向的诊断信号，不是三次配对收益验收，不能把任务耗时直接相减作为确定收益。

产品变化：仅登录恢复在beginSnapshot成功清场后显示workspace，完整恢复前仍不可发；分片中断线保留新输入和既有阅读位置。失败时半成品可能保持可见，但错误与重连入口保留。主代理相关回归21/21通过，JSDOM不验证布局收益。
