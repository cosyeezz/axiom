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
- 只有本应用的显式连接经 tsnet，手机其他应用流量不受控制；仍受底层网络或其他 VPN 的网络规则影响。
- 本地代理绑定 `127.0.0.1` 随机端口，所有 HTTP/WS 先检查随机 HttpOnly 会话 Cookie、Host 与 Origin，再转为唯一配置目标。
- 拒绝 loopback/LAN/公网目标、CONNECT、外部重定向；本地会话不发往上游。Tailscale IP 与完整 `.ts.net` 名称以外的自定义域名首版不支持。
- Cookie 不隔离端口，因此代理设置明确端口的 CSP，禁外部连接/worker/frame/form；WebView 同时限制导航、资源和文件访问。不加载不可信网页，不启用 JS-native 接口。
- 页面中的 HTTPS 外链仅在明确点击时交系统浏览器打开。不要让陌生人使用已解锁的手机控制你的 Agent。
- 「清除本机登录状态」删除本应用节点状态；设备撤销还应在 Tailscale 管理后台执行。卸载也会删除本机状态。

## 生命周期与首版限制

- 首版不启动常驻前台服务，不承诺锁屏永久在线。回到前台续期会话；如页面未恢复，点「重新连接」，或回连接设置重试。
- Android 进程重启会建立新的本地 origin；网页 localStorage 不保证跨本地端口保留。服务端会话仍在电脑上，可从侧栏重新选择。
- 支持系统图片文档选择器（最多四张），不申请广泛存储权限。旋转或销毁 Activity 会取消正在选择的上传。
- 不实现原生下载管理、推送通知或手机端 Agent。原生设置用于切换电脑地址，不使用网页地址切换去绕过应用网络桥。
- 自动化离线协议测试与模拟器启动验证不等于真实 tailnet 登录、聊天和上传真机验收；实际验证清单与发布记录见计划文档和 Release notes。

## 构建

工具链固定于 `../.github/workflows/android.yml`：Java 17、AGP 8.7.3、Gradle 8.9、SDK 35、Build Tools 34.0.0、NDK 27.0.12077973。Go/tsnet/gomobile 固定版本与命令见 workflow 和 `go/go.mod`。直接执行 CI 或使用相同工具链本机构建；生产壳不依赖 AndroidX/Kotlin；模拟器测试使用 AndroidX Test 1.6.x 与 JUnit 4.13.2。

```sh
cd android/go
go test -race ./...
# 使用 workflow 固定的 gomobile/gobind 与 NDK 后生成 app/libs/bridge.aar
cd ..
gradle --no-daemon :app:assembleDebug :app:lint
```

发布签名需要 `ANDROID_KEYSTORE_PATH`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`。没有签名不能把 unsigned release 当作可安装交付。

维护者可在可信本机执行 `node android/scripts/create-signing.mjs` **首次**生成签名并配置 Secrets；已存在时脚本拒绝覆盖。密钥及密码备份在用户 `.axiom/signing/android-release`，必须安全备份，不能提交 Git、发到聊天或上传 artifact。GitHub Secrets 不能导出明文。

公开签名证书 SHA-256：

```text
B9:3D:54:20:3F:14:F8:BE:FC:5B:75:22:F8:C4:30:16:3B:3B:99:DE:26:59:89:64:76:B2:F0:EC:E6:77:A2:AD
```

后续版本递增 `app/build.gradle` 的 versionCode，沿用同一签名。分支构建的测试签名包不能覆盖正式签名包。

## 许可证

Axiom 源码沿用仓库 MIT 许可。Tailscale/tsnet 与各 Go 依赖保留其各自许可证；发布 workflow 收集第三方许可到 APK assets 和 Release 的 notices 附件。内嵌客户端并非 Tailscale 官方 Android 应用。
