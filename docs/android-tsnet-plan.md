# Axiom Android 内嵌 Tailscale 实施计划

状态：计划先行，实现及自动化验证完成；按下列记录集成发布。范围：独立 Android APK；不改变现有桌面壳，不把服务开放到公网。

## 1. 用户交付目标

- 用户只安装 Axiom APK，无需安装或手动打开独立 Tailscale App。
- 首次通过官方 Tailscale 登录流程授权个人设备；后续打开 APK 自动恢复应用内连接。
- 复用电脑端 Axiom 网页及 `/ws` 协议；电脑仍需启动 Axiom 和 Tailscale。
- 不使用 Android `VpnService`，不接管手机其他应用的流量。
- 代码、计划、README、devlog 提交到 Git；GitHub Releases 提供可直接下载并安装的 APK。
- 不把未完成的真机登录、聊天或后台恢复测试描述为已通过。

## 2. 架构及兼容边界

```text
原生连接页（地址、状态、登录入口）
                 |
WebView --应用级代理--> 127.0.0.1 临时端口
                              |
                        Go Android bridge
                              |
                      tsnet 用户态网络栈
                              |
                   电脑的 Tailscale IP / MagicDNS
                              |
               Axiom HTTP 页面 + WebSocket /ws
```

- 单独新增 `android/` 工程，优先使用简单原生 Java 壳和 Go AAR；具体版本在构建依赖核实后固定。
- 实施核实后的调整：WebView 加载应用私有会话保护的 loopback 固定上游反向代理，仍实时复用服务端网页，不复制前端，不使用 iframe。
- 不依赖 WebView 407 代理认证：公开 API 不足以保证 HTTP/WS 完整覆盖。原生 CookieManager 安装随机 HttpOnly 会话 Cookie；代理先验证本地 Host/Origin/Cookie，再将合法请求映射为目标 Host/Origin，保留 `/ws` 子协议 `axiom`。服务端仍通过实际 tsnet 对端进行 whois，不信任新增身份请求头。
- Cookie 不隔离端口，因此强制精确 origin CSP（含 WebSocket）、禁止 worker/frame/表单外发、拦截外部导航及资源、拒绝外部重定向；token 不写 URL/日志/上游请求。旧 WebView 销毁后才释放代理端口。
- Go 端用 `tsnet.Server.Dial` 连接目标，而不是手机操作系统默认网络直连目标。
- 固定目标反向代理正确处理普通资源、上传、WebSocket Upgrade；拒绝 CONNECT 和 absolute-form 请求。远端 HTTPS 由 Go 默认信任链校验，不忽略证书错误。
- `tsnet` 是嵌入式 Go 网络库，不是现成完整 Android SDK；先验证 Android 编译和 WebView 网络桥接，再完善交互。
- 默认保持现有服务端 socket 对端 IP + Tailscale whois 个人账号鉴权；不使用 tag 设备身份，不放宽现有认证。

## 3. 安全要求

1. 不在源码、APK、日志或 CI 配置中硬编码 auth key、用户节点私钥或长期可复用登录凭据。
2. 节点状态仅写入 Android 应用私有、禁备份目录；提供明确的本机凭据清理操作，提示必要时还应在 Tailscale 管理端撤销设备。
3. 登录使用 tsnet 返回的官方授权 URL，并由外部系统浏览器打开；禁止任意网页通过 JS bridge 获取节点凭据。
4. 代理仅监听 loopback 的随机端口，只允许用户配置的单一目标主机和端口；加本机会话保护，评估其他 App 访问 loopback 的风险，不做通用代理/出口节点。
5. 目标地址限制为适合 tailnet 访问的地址，拒绝任意公网代理、userinfo、恶意端口/路径和不支持的协议。
6. WebView 禁止文件 URL 访问、不启用通用文件跨域访问、不忽略 TLS 错误；外部链接不沿用私网代理加载到业务页。
7. 配置更改与退出及时关闭旧代理/连接，避免残留旧目标授权或多实例竞争。
8. 不将现有 4319 端口开放公网；不为使 APK 可用而取消服务端鉴权。

## 4. 实施顺序

### 阶段 A：基线与计划（实现前）

- 获取远端最新 `master`，在 `../worktrees/Axiom-android-tsnet` 创建 `feat/android-tsnet`。
- 只读检查现有构建/发布约定及设计规范；写入本计划，保留已有用户改动。
- 核实 Go、gomobile、tsnet、Android Gradle Plugin、Gradle、JDK、SDK/NDK 的固定兼容组合。

### 阶段 B：Go 网络桥

- 导出 gomobile 可绑定的最小接口：启动、状态、登录入口、设置目标、代理地址及停止。
- 节点状态持久化；启动后查询状态，未登录时显式发起交互式登录，不把“正在连接”误报为在线。
- 实现受限 HTTP 固定目标反向代理和 WebSocket 隧道；关闭时清理监听器、传输连接和 tsnet。
- 编写可离线运行的单元测试：目标校验、代理认证/拒绝路径、Host/Origin 保持、HTTP、升级连接、关闭行为。测试不得要求真实私网凭据。

### 阶段 C：Android 客户端

- 原生连接界面遵守项目设计 token，显示地址、登录/连接状态及有意义的错误。
- 原生安装会话 Cookie 并收到成功回调后才加载本地入口；失败时禁止绕过认证。每次重建重新安装会话，进程重启生成新 token。
- 外部浏览器完成首次授权，回到应用检查连接状态并继续加载。
- 支持返回键、图片文件选择、外部链接安全处理；必要时补下载或明确首版限制。
- 前台恢复检查节点与页面连接，提供可操作的重试；不承诺锁屏期间永久在线，不默认加入常驻前台服务。

### 阶段 D：构建、签名与发布

- 新增 GitHub Actions，固定工具链，构建 Go AAR、运行测试并编译 Android APK。
- APK 必须签名并核实可安装；区分测试签名与持久 release 签名，文档写明升级限制。正式发布优先使用受控 GitHub Actions 签名密钥，不提交私钥到 Git。
- 支持分支/PR 构建与手动验证，发布阶段提供 GitHub Release APK、SHA-256 及版本说明。
- 构建权限与发布权限分离；禁止在不可信 PR 中暴露签名凭据。
- 用户只需进入 Releases 点击 APK，而非先下载 Actions ZIP。

### 阶段 E：集成与交付

- 更新 README 的 Android 安装、首次登录、电脑条件、连接恢复、安全和已知限制说明；每次主要改动及决策记入 devlog。
- 实际执行 Go 测试、Android 构建与适用的现有项目检查，核对实际产物。
- 提交并推送工作分支；获取最新 master 并合入工作分支、重新验证。
- 合并本地 master 前同步其 upstream；主线如再次变化，则重新同步和验证，保留其他人的工作。
- 合并并推送 master；验证 GitHub Release 成功且 APK 可下载；成功后清理本任务 worktree。

## 5. 验收矩阵

| 项目 | 验证方式 | 未验证时处理 |
|---|---|---|
| 固定依赖可构建 AAR/APK | 实际构建日志及产物 | 不宣称已生成 APK |
| 代理仅允许所配置目标 | Go 自动化负例测试 | 作为发布阻塞 |
| HTTP 与 WebSocket 保持 Host/Origin | 离线代理协议测试 | 作为发布阻塞 |
| 首次个人账号登录与节点持久恢复 | Android 真机/模拟器 + 用户授权 | 明确未覆盖并给出验收步骤 |
| 真实 Axiom 聊天、图片、重新连接 | 有授权的目标服务真机测试 | 不把离线测试等同端到端验证 |
| APK 签名、版本、CPU 架构 | 构建工具检查 | 不发布无法确认的安装包 |
| GitHub 下载交付 | 查询 Release 和实际下载校验 | 权限/网络失败须报告真实阻塞 |
| 主线兼容 | 适用的现有测试 | 失败先修复或明确阻塞，不强推 |

## 6. 风险与停止条件

- Android tsnet、gomobile 或 WebView 的代理行为有版本差异；出现问题先用最小用例修复，不擅自改为系统 VPN 或公网入口。
- 登录是用户授权行为；不能自行创建用户身份、滥用主机现有密钥或预置私网授权。
- 若没有真机或用户授权，仍可完成可构建 APK 和离线协议验证，但必须在版本说明中标注端到端验证范围。
- 若发布权限、远端同步、CI、签名凭据缺失影响交付，保留工作现场并请求所缺的最小行动，不把仅有 workflow 当作发布成功。
- 若必须改变上述交付范围，先向用户确认，不以删减验收掩盖缺口。

## 7. 实施记录

- 计划先行提交：`0c03d3a`。实现时选择固定目标反向代理而非 WebView 正向代理，原因是 407 回调及 WS 认证缺少稳定契约；明确补上 Cookie 跨端口防泄露边界。
- 签名：一次生成 RSA-4096 PKCS#12，已存入仓库 Actions Secrets；本地私密备份位于用户 `.axiom/signing/android-release`，不提交。公开证书 SHA-256：`B9:3D:54:20:3F:14:F8:BE:FC:5B:75:22:F8:C4:30:16:3B:3B:99:DE:26:59:89:64:76:B2:F0:EC:E6:77:A2:AD`。
- 本机无可用 Go/JDK/Android SDK，使用 GitHub Actions 实际构建和签名。固定 tsnet `v1.102.4`（核实时官方稳定版）与 Go `1.26.6`；Android Java 17、AGP 8.7.3、Gradle 8.9、compile/target SDK 35、minSdk 26、Build Tools 34.0.0、NDK 27.0.12077973。
- 已运行现有 Node 全量测试：925 项，923 通过、2 跳过、0 失败。独立静态审查发现探测中重复点击导致 loading 不释放，已以探测期间禁用操作修复；续期加入前台轮询，固定目标 URL 复制为私有值。
- Go 测试增加真实 RFC6455 握手响应检查及单帧回显（不是仅裸TCP回显）；仍不替代 WebView/真实 tailnet 端到端测试。
- Android 网络接口由 Application 注册 Java NetworkInterface 回调，避免 SDK30+ Go 枚举限制；状态轮询单次在途，换目标失败不会恢复旧工作台。凭据清除显式校验私有目录；登录按钮重新请求官方授权链接。
- 首两轮 CI 的 Go race 测试、双架构 AAR 及生产 Java 编译通过；许可收集缺失依赖与旧测试API编译问题分别修复，Android 测试改用 AndroidX Test。
- CI `36571028167` 已生成并签名 release APK、lint通过，但模拟器因 Tailscale `LogsDir` 默认目录查找 panic 崩溃；启动前显式设置 `TS_LOGS_DIR` 到私有节点目录。保留默认诊断上传及审计兼容性，不误称静默回调禁上传。修复后 CI `36574348195` 模拟器5项测试全部通过（含未登录节点获取官方AuthURL），签名指纹比对通过；后置卸载脚本改为检查包存在后才卸载。
- 最终实现提交 `520f157` 的 [CI 36575755333 / attempt 2](https://github.com/cosyeezz/axiom/actions/runs/36575755333/attempts/2) 全绿：Go race、arm64/x86_64 AAR、debug/test/release APK、lint、持久证书指纹比对、Android11模拟器5项测试及真实release APK的 `adb install` Success。首次attempt因Go模块代理HTTP2传输失败，核实无发布副作用后重跑一次通过。
- 已复核最新远端 `master` 为 `4a42624`，工作分支包含该基线；现有Node全量925项、923通过、2跳过、0失败。发布版本 `android-v0.1.0`，标签工作流在相同门禁成功后创建GitHub预发布及直接APK附件；真实Release资产需发布后独立核对。
- 未覆盖：本人账号授权后的真实私网连接、真机聊天/图片上传、锁屏恢复、蜂窝/Wi-Fi切换及arm64实体机运行。模拟器AuthURL验证不代表已完成这些端到端验收，首版按Preview交付。
