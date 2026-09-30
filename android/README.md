# Axiom Android

原生 Java WebView 壳 + Go tsnet 用户态网络。无需独立 Tailscale App，不使用 `VpnService`，不开放公网服务。先行计划见 [android-tsnet-plan.md](../docs/android-tsnet-plan.md)。

## 首次连接

1. 在电脑启动 Axiom，开启其 Tailscale 远程入口。电脑端 Tailscale 保持在线，并配置允许的个人账号。
2. 安装 GitHub Release 中与你信任来源一致的已签名 APK（Android 8.0/API 26 及以上）。本应用不包含电脑端 Agent。
3. 填写电脑 `100.x.x.x:4319` 或完整 `设备名.tailxxx.ts.net:4319`，点击连接。
4. 点击「登录 Tailscale」，在系统浏览器完成官方账号授权。如 tailnet 开启审批，先在管理端批准设备。
5. 回到 Axiom，应用检查网络和远端 `/health`，成功后加载工作台。后续启动自动恢复节点身份与已保存地址。

登录账号必须与电脑远程入口允许的个人账号一致，不使用 tag 设备。电脑休眠/关机或退出 Tailscale 后，APK 无法代替电脑继续服务。

## 安全边界

- 节点密钥仅存于应用私有 `noBackupFilesDir`；禁 Android 备份，不在 APK 预置 auth key。
- Tailscale 日志状态也明确指向同一私有目录，避免 Android 默认目录缺失导致启动崩溃。保留 Tailscale 默认的诊断日志上传行为及 tailnet 审计兼容性；静默输出回调不等于禁用诊断上传，使用时同时适用 Tailscale 的隐私政策。
- 只有本应用的显式连接经 tsnet，手机其他应用流量不受控制；仍受底层网络或其他 VPN 的网络规则影响。
- 本地代理绑定 `127.0.0.1` 随机端口，所有 HTTP/WS 先检查随机 HttpOnly 会话 Cookie、Host 与 Origin，再转为唯一配置目标。
- 拒绝 loopback/LAN/公网目标、CONNECT、外部重定向；本地会话不发往上游。Tailscale IP 与完整 `.ts.net` 名称以外的自定义域名首版不支持。
- Cookie 不隔离端口，因此代理设置明确端口的 CSP，禁外部连接/worker/frame/form；WebView 同时限制导航、资源和文件访问。不加载不可信网页，不启用 JS-native 接口。
- 页面中的 HTTPS 外链仅在明确点击时交系统浏览器打开。不要让陌生人使用已解锁的手机控制你的 Agent。
- 「清除本机登录状态」删除本应用节点状态；设备撤销还应在 Tailscale 管理后台执行。卸载也会删除本机状态。

## 生命周期与限制

- 0.1.2 候选默认隐藏上下系统栏，边缘手势可临时呼出；cutout、IME与桌面caption逐边取最大安全区域，不累加、不隐藏软键盘。Core兼容层在API26–29仍依赖稳定/可见Insets推断，不承诺所有厂商浮动/极矮输入法。原生设置/确认弹窗独立请求沉浸式；当前仅API30旧版测试通过，持焦点/导航栏/确认框安全区域补测尚待CI，不宣称所有厂商弹窗或IME行为通过。
- 普通前后台与系统栏变化不重建WebView；旋转、配置变化和进程回收仍可能重建，不保证未发送草稿跨重建保存。沉浸式支持范围以现有API26+为准。

- 正常聊天移除原生常驻工具栏；网页「更多 → 连接设置」和系统返回可打开原生连接面板。查看/取消保留页面，刷新、切换电脑或清登录均需确认。首屏故障保留原生恢复入口。
- 不启动常驻前台服务、不承诺锁屏永久在线。回前台/默认网络可用事件触发受控恢复，30 秒去重；Stopped 节点仅对显式活动连接尝试恢复，不重建本地 origin/token、不自动登录。状态查询完成后才安排轮询，避免积压。
- 首次健康检查与尚未成功提交的根文档 GET 出现瞬时故障时保留目标，按 2/4/8/16/30 秒封顶退避，累计 8 次失败暂停，等待网络/前台事件或手动连接；401/403 等拒绝不自动解除。成功提交页面后不做原生自动重载，业务 WebSocket 由共享网页心跳与有界重试恢复，草稿和阅读状态保持。
- Cookie 清除/写入使用跨 Activity 的 UI 线程串行队列；首次导航等待写入成功。仅主框架、用户手势、非重定向、当前精确 origin 的固定 GET 导航可打开连接面板；不接收目标/token/任意动作参数，不提供通用 JS-native 桥。
- Android 进程重启会建立新的本地 origin；网页 localStorage 不保证跨本地端口保留。服务端会话仍在电脑上，可从侧栏重新选择。
- 支持系统图片文档选择器（最多四张），不申请广泛存储权限。旋转或销毁 Activity 会取消正在选择的上传。
- 不实现原生下载管理、推送通知或手机端 Agent。原生设置用于切换电脑地址，不使用网页地址切换去绕过应用网络桥。
- 自动化离线协议测试与模拟器启动验证不等于真实 tailnet 登录、聊天和上传真机验收；实际验证清单与发布记录见计划文档和 Release notes。

## 构建

工具链固定于 `../.github/workflows/android.yml`：Java 17、AGP 8.7.3、Gradle 8.9、SDK 35、Build Tools 34.0.0、NDK 27.0.12077973。Go/tsnet/gomobile 固定版本与命令见 workflow 和 `go/go.mod`。直接执行 CI 或使用相同工具链本机构建；生产仍为 platform Activity，依赖固定 AndroidX Core 1.15.0 的兼容 Insets（含其 Kotlin/协程传递运行库）；无 AppCompat UI。模拟器测试使用 AndroidX Test 1.6.x 与 JUnit 4.13.2。

```sh
cd android/go
go test -race ./...
# 使用 workflow 固定的 gomobile/gobind 与 NDK 后生成 app/libs/bridge.aar
cd ..
gradle --no-daemon :app:assembleDebug :app:lint
```

Gradle `:app:generateThirdPartyNotices` 是所有merge assets的前置任务（本地构建也需要Node24、Go和Python3）：先导出实际release运行制品，再用 `scripts/notices.mjs` 收集Go许可和 `scripts/runtime-notices.py` 合并制品内嵌许可/NOTICE与POM（含父许可），写入APK assets。每次构建重新生成，失败不得使用遗留文件；Gradle未知许可或缺全文会失败，不依赖手写传递依赖清单。Go收集器仍保留既有顶层文件扫描与缺失提示边界。

CI 使用 `scripts/emulator-smoke.sh` 在API30执行仪表测试并安装实际 release APK；`scripts/emulator-immersive.sh` 复用同一debug APK，在API26/29/35的官方google_apis镜像检查实际软键盘、生命周期与边缘手势；两脚本先用`verify-webview.py`校验当前provider有效且安装/启用，否则失败，不安装外部APK。兼容任务保留实际镜像revision、emulator和WebView版本，API29/35额外启用模拟cutout并分开启动横竖屏测试；这些仅为固定模拟器门禁，不代表真机。失败时在模拟器关闭前采集脱敏 logcat 到 Actions artifact 的 `dist/diagnostics/`，保留原测试退出码。签名检查启用 pipefail 并核对下列持久证书指纹。

发布签名需要 `ANDROID_KEYSTORE_PATH`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`。没有签名不能把 unsigned release 当作可安装交付。

维护者可在可信本机执行 `node android/scripts/create-signing.mjs` **首次**生成签名并配置 Secrets；已存在时脚本拒绝覆盖。密钥及密码备份在用户 `.axiom/signing/android-release`，必须安全备份，不能提交 Git、发到聊天或上传 artifact。GitHub Secrets 不能导出明文。

公开签名证书 SHA-256：

```text
B9:3D:54:20:3F:14:F8:BE:FC:5B:75:22:F8:C4:30:16:3B:3B:99:DE:26:59:89:64:76:B2:F0:EC:E6:77:A2:AD
```

后续版本递增 `app/build.gradle` 的 versionCode，沿用同一签名。可信分支与标签构建使用持久发布签名；PR 只生成 debug 测试签名包，不能覆盖正式签名包。

## 许可证

Axiom 源码沿用仓库 MIT 许可。Tailscale/tsnet、各 Go 与 Gradle运行依赖保留其各自许可证；发布 workflow 收集第三方许可到 APK assets 和 Release 的 notices 附件。内嵌客户端并非 Tailscale 官方 Android 应用。
