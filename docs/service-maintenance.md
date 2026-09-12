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

- 维护入口仅绑定 loopback，校验精确 Host / Origin 和随机凭证；不向 Tailscale 客户端提供维护凭证。
- CSP 只允许当前维护入口的精确 origin，不泛化放开 localhost 或任意端口。
- 有会话或子任务运行时拒绝维护；正常关闭必须等待保存，不强杀正在保存的业务进程。
- 故障恢复入口不能绕过仍存活 worker 的活动任务检查。
- 已打开的页面可在业务端口掉线后继续查询守护进程。业务端口彻底离线时，刷新或新开页面仍可能加载失败，不承诺离线网页功能。
- 守护进程自身离线时提供终端恢复指引。维护功能变更需要在任务空闲后完整重启守护进程；快速重启业务 worker 不能更换已加载的守护代码。
- 本次开发不停止 4319 / 4320 上的活动任务，不重装其运行中的依赖；故障与恢复验收使用隔离进程、端口及临时数据。
