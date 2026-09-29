# 服务维护：设计依据与验收边界

日期：2026-09-12。

## 目标

服务操作统一放到「设置 → 服务与更新」。不展示源码位置，不把请求已接受或 WebSocket 重连当作操作成功。复用现有 Node 守护进程，不引入 PM2、容器或额外数据库。

## 成熟实现参考

- [Kubernetes：startup / readiness probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)：进程存在不等于可服务。Axiom 用新实例身份与就绪信号/健康检查核验启动，不因旧端口返回成功就结束维护。
- [systemd.unit：StartLimitIntervalSec / StartLimitBurst](https://www.freedesktop.org/software/systemd/man/systemd.unit.html)：重启退避之外还需要失败上限，确定性故障不应无限重试刷日志。
- [PM2：restart strategies](https://pm2.io/docs/runtime/features/restart-strategies/)：Node 服务也采用有限不稳定重启与退避；仅借鉴策略，不新增运行依赖。
- [VS Code：updates](https://code.visualstudio.com/docs/enterprise/updates)、[更新状态实现](https://github.com/microsoft/vscode/blob/main/src/vs/platform/update/electron-main/abstractUpdateService.ts)：检查、下载准备、待安装、重启是不同阶段。Axiom 保持手动更新，检查后确认完整提交，不随下一次远端变化偷偷更换目标。

## 状态语义

```text
请求接受 -> 准备 -> 保存并停止 -> 切换 -> 启动 -> 核验 -> 成功
              |                    |         |
              +-> 保留旧服务        +---------+-> 失败 / 恢复结果
```

- 页面显示的阶段必须由执行方提供，不能用计时器推算百分比。
- 操作记录由守护进程持有，不依赖即将退出的业务进程；只保留最近一次操作与有界诊断，避免建设复杂历史系统。
- 超时代表尚未确认或明确的阶段超时，不自动再次安装。
- 更新失败与旧服务恢复成功是两个结论，不能用一个绿色「成功」覆盖。
- 日志与错误在网页上按文本渲染；源码路径、用户目录、令牌不应进入维护面板。

## 安全与可用性边界

- 通过现有 Tailscale 认证的远程连接与本机拥有相同的在线重启、Pi 修复和更新权限；共享任务守卫、维护锁和 DEV 限制，维护期间仅允许读取 `service.status`。远程访问配置、登录与 CLI 停止入口仍限本机。
- 独立维护入口仅绑定 loopback，校验精确 Host / Origin 和随机凭证；不向 Tailscale 客户端提供维护凭证。在线 worker 通过固定只读 GET 取得守护实时状态，再由已认证的 `service.status.operation` 返回白名单字段；查询失败返回 `operationError`，不伪造空闲或成功，不解除服务端维护锁。远程浏览器不访问自身的 loopback。
- 前端以操作 ID 确认当前操作终态，拒绝提交前迟到的旧结果；守护 ACK 同时返回持久化、严格递增的 `startedAt`（时钟回拨时作为逻辑起点），用于识别已覆盖原记录的后续操作。后续操作终态可恢复按钮，但明确提示原请求结果未确认，不能冒称原请求成功。未知回执缺少操作身份时保守锁定，刷新后仅重新观察当前服务状态，不视为确认原请求。
- 查询失败和断线不判完成。准备失败而 worker 不断线时也会在线轮询展示失败并恢复按钮。维护期间刷新或重连只串行读取状态，不发送业务初始化请求、不消耗连接重试次数；维护结束后继续初始化。本机离线维护通道保持原样。
- CSP 只允许当前维护入口的精确 origin，不泛化放开 localhost 或任意端口。
- 有会话或子任务运行时拒绝维护；正常关闭必须等待保存，不强杀正在保存的业务进程。
- 故障恢复入口不能绕过仍存活 worker 的活动任务检查。
- 本机已打开的页面可在业务端口掉线后继续查询守护进程；远程页面断线期间等待自动重连，无法恢复时需本机处理。业务端口彻底离线时，刷新或新开页面仍可能加载失败，不承诺离线网页功能。
- 守护进程自身离线时提供终端恢复指引。维护功能变更需要在任务空闲后完整重启守护进程；快速重启业务 worker 不能更换已加载的守护代码。
- 本次开发不停止 4319 / 4320 上的活动任务，不重装其运行中的依赖；故障与恢复验收使用隔离进程、端口及临时数据。
