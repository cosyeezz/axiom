# 手机端对话空间与信息密度：调研、方案和实施记录

日期：2026-09-29。基线：`origin/master 859270e`。适用：Android 内嵌 tsnet 壳及 ≤700 CSS px 移动网页。

## 1. 目标与边界

用户希望连接设置／重新设置不再长期占据顶部，正常聊天尽量展示对话，通过按需展开管理低频操作，并稍微缩小行间距。已授权先将方案写成文档、再直接实施，不另设方案确认关卡。

本文件先于实现单独提交。改造不缩小正文字号，不隐藏错误、停止/发送等关键动作，不丢草稿或阅读位置，不改变 Tailscale 身份、电脑 whois 鉴权、Cookie/CSP/固定目标代理边界。不增加独立 VPN、通用 JS-native 桥、UI 框架或底部全局导航。保留已有桌面、模型级联、Todo 两级列表能力；不将别人的并行改动回退为旧布局。

## 2. 当前问题：事实与估算分开

### Android 原生壳

`android/app/src/main/java/com/axiom/android/MainActivity.java`：

- `showConnection()` 与 `buildWebView()` 是两页替换，完整连接表单**并非**一直显示在聊天上方。
- `buildWebView()` 添加一行两个横排按钮，各固定 48dp：连接设置、重新连接。整行恒占 48dp；键盘打开仍不收起。不是两行96dp。
- 「连接设置」调用 `leaveWorkspace()`，销毁 WebView、清 Cookie、断开 gateway。查看设置会中断当前页面，不是无损展开。
- 原生「重新连接」实际 `renew + web.reload`；网页自身另有 WebSocket 自动重连和重试，两个不同动作同名。
- `renderStatus()` 在聊天时更新已移出的原生状态控件；需要重新授权的状态缺少可见原生入口。
- `adjustResize` 与系统 inset 已存在，不能仅凭声明认定所有 Android/IME 组合都正确。

源码预算：取消该行理论返还48dp。以360×800dp为例约占全屏6%，**并非实际截图结果**；系统栏、安全区、CSS px与dp分别测量，不机械相加。

### 移动网页

`public/style.css`、`public/index.html`、`public/composer-controls.css`、`public/app.js`：

- 正文 `.markdown` 当前14px / 1.8，行盒25.2px；段落下距12px，消息下距24px，输出上下padding24px。
- ≤700px已隐藏 `#status`，但顶栏仍包含工作目录、多个工具入口；输入区已由新紧凑控件接管，不再复活旧 `#mobile-expand`。
- 普通代码块13px / 1.7，工具输出和文本图表有独立折行/对齐规则，不统一压扁。
- `#connection-form` 切换 `location.href`，在APK中看到的是loopback origin，不等价于修改手机的Tailscale目标。
- 部分旧浏览器测试仍断言已移除的「纯阅读/展开」设计，需更新为真实当前功能，不能把陈旧脚本失败当生产布局问题或直接删掉回归。

20行、换行数相同的正文1.8→1.6：理论504→448px，约省11.1%行盒高度；总内容高度还受margin折叠/字体/Markdown影响，实施后另测。

## 3. 成熟产品比较与证据等级

检索核验于2026-09-29；产品帮助页滚动更新。没有登录竞品账号或实机操作，不宣称当前所有版本图标和像素一致。

| 产品 | 可追溯移动设计 | 借鉴 | 不照搬／证据限制 |
|---|---|---|---|
| ChatGPT Android | [官方历史帮助](https://help.openai.com/en/articles/8167621-how-can-i-access-my-chat-history-in-the-chatgpt-android-app)：左上两线菜单打开历史；[Android FAQ](https://help.openai.com/en/articles/8142208-chatgpt-android-app-faq)设置从侧栏进入 | 历史/全局设置不堆在聊天上方 | 正文抓取403，本轮仅官方搜索索引原文；不推断断线或键盘布局 |
| Claude mobile | [官方入门](https://support.claude.com/en/articles/8114491-get-started-with-claude)明确移动当前模型在顶部、点击展开选择；[移动能力设置](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude)从侧栏姓名进入设置 | 当前值保持紧凑，详细选项按需打开 | 正文已复核；[2024-07-16 Android发布图](https://www.anthropic.com/news/android-app)只是当时展示图，不当成最新版本 |
| Telegram mobile | [2022-03-11 官方更新](https://telegram.org/blog/downloads-attachments-streaming)将相机整合进附件图库，面板内访问照片/文件/位置；[代理帮助](https://core.telegram.org/proxy)将连接配置放设置 | 次要输入动作放面板，配置与聊天分离 | 官方索引证据，正文直连失败；不据此新增常驻底部导航或推断连接图标位置 |
| Signal mobile | [官方通知帮助](https://support.signal.org/hc/en-us/articles/360043273491-In-App-Notification-Options)：点联系人姓名/header进入聊天设置；[代理帮助](https://support.signal.org/hc/en-us/articles/360056052052-Proxy-Support)区分Connected/Connecting/Disconnected | 标题/更多承载详情；状态和配置分开 | 官方索引证据，正文抓取失败；代理首页toast不能推广为所有断网只需短toast |

共同原则不是“把所有东西藏起来”，而是区分全局、会话、当前消息操作。Axiom是开发工作台，仍需模型、运行控制、待回答问题；不照搬普通IM去掉这些关键状态。

### 规范依据

- [NN/g Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/)：常用内容优先、低频复杂选项后置。本轮正文可抓取；这是设计原则，不是具体像素规范。
- [W3C WCAG 2.2 Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)正文已复核：1.5行高/2倍段距/0.12em字距/0.16em词距是**用户覆盖后不得丢失功能或内容**的测试，不是默认样式必须采用这些值。
- [Android accessibility](https://developer.android.com/guide/topics/ui/accessibility/apps)：Android触控目标按48dp设计。网页此轮新增主要触控区采用48 CSS px；dp与CSS px不宣称等同。不以压缩按钮换取密度。
- [Android IME/insets](https://developer.android.com/develop/ui/views/layout/sw-keyboard)及[edge-to-edge](https://developer.android.com/develop/ui/views/layout/edge-to-edge)：输入区/返回键和系统安全区需分别验收，不能把缩小浏览器视口等同真实IME。

## 4. 选定方案

### 4.1 正常聊天：只有一条网页顶栏，原生工具栏占位为0

```text
系统状态栏（保留）
[历史 ☰] [当前会话标题……] [更多 ⋯]
│                                            │
│                对话记录                    │
│   14px正文 / 1.6行高，段距8，消息距16        │
│                                            │
[必要问题/任务提示：条件显示，不删安全动作]
[输入内容……                                 ]
[上下文/模型摘要与发送操作：复用现有紧凑输入区]
系统导航或键盘安全区
```

- 移除原生48dp两按钮行，不换成另一条“已收起”横幅，也不引入遮挡消息的常驻悬浮按钮。
- 手机网页顶栏保留历史、单行标题与更多按钮；工作目录和低频服务工具转入按需面板，不影响桌面。
- 更多面板提供连接设置、工作空间路径（可复制）、界面/原文/源码入口；当前模型仍由已有紧凑模型按钮展示。
- 原生连接设置入口由客户端明确标识提示显示，不依据127.0.0.1猜测APK。能力标识仅改变呈现，不是授权凭据。

### 4.2 原生连接面板：查看不等于断开

- 点击网页连接设置打开原生模态面板，可返回聊天、查看目标、刷新页面、切换电脑、重新登录或清除身份。
- 打开/关闭面板保留同一WebView、gateway、历史滚动和输入状态。仅确认切换目标/清除身份才销毁页面。
- “刷新页面”与“网络重试”不再混称；刷新须说明页面会重载，普通断线优先网页自动重连。
- 首次无目标仍用专门原生连接页，但去掉重复介绍，清除身份和版本说明放低频菜单；不在首次页塞空聊天。
- 网页空白、加载失败或旧电脑网页没有入口时，系统返回键进入原生连接面板兜底，不一按就销毁聊天；关闭面板回原页。
- 需要Tailscale重新授权时显示短的可操作原生提示，正常态GONE；普通网络抖动不自动全屏跳设置、不移除旧消息。

### 4.3 固定的低权限UI意图，不加通用桥

候选使用固定同源保留路径 `/_axiom/native/connection`（或审查后等价的固定意图），仅负责打开原生UI：当前WebView页精确同origin、主frame、用户手势、GET、无query/fragment/userinfo、路径完全匹配。其他变体不执行原生动作。收到意图不能直接修改地址、清身份、读取文件/凭据或调用任意Go方法。

原生保持禁外部资源/文件content访问、HttpOnly会话Cookie、端口精确隔离、HTTPS外链手势限制和gateway CSP。面板内再由原生明确操作管理连接。能力检测的UA后缀仅用于网页呈现，攻击者伪造后缀不能获得原生权限。

### 4.4 适度紧凑，而非小字

仅手机阅读区域，桌面保持不变：

| 项目 | 当前 | 实施起点 |
|---|---:|---:|
| 正文 | 14px / 1.8 | **14px / 1.6** |
| 段落下距 | 12px | 8px |
| 消息间距 | 24px | 16px |
| 输出上下padding | 24px | 16px |
| H1–H3前/后距 | 28/12px | 20/8px |
| 列表条目上下margin | 4px | 2px |
| 普通代码 | 13px / 1.7 | 保持，优先缩块外距 |

保留用户手动空行、代码缩进、表格/长代码块内部横向滚动、图表对齐及工具折叠触控目标。不全局缩body行高，不改消息真实文本。只在有限高度屏幕中约束输入框增长，不靠隐藏草稿或待回答项获取空间。

## 5. 状态规则

| 状态 | 展示与行为 |
|---|---|
| 未配置/首次授权 | 原生连接页，一个主要连接动作；登录条件显示；解释仅保留完成任务所需文字 |
| 正常在线 | 原生工具栏0dp；网页单行顶栏；连接/详细信息按需面板 |
| 普通断线 | 留住消息/草稿，网页短重连说明+重试；不自动展开表单，不清身份 |
| 授权失效 | 原生短提示+重新登录入口，点开原生面板；不把tsnet Running等同聊天WS健康 |
| 只查看设置 | 可取消；不销毁/reload/断开；保留焦点和阅读位置 |
| 确认换电脑/清身份 | 原生明确确认后执行，既有安全边界不变 |
| 输入/键盘 | 主要输入/发送始终可达；更多面板可返回关闭；短视口保留至少合理对话区，真实IME另列验证范围 |
| 旧网页/空白页 | 原生返回键可打开恢复面板；不是只能依赖网页JS恢复 |

## 6. 实施顺序与门禁

1. 本文档、README入口与devlog先独立提交。
2. 原生改造及确定性instrumentation测试；移动更多面板/连接提示/阅读样式，补单元与浏览器回归。
3. 记录同fixture、字号、视口前后消息区高度/正文高度，截图至少320×568、390×844、390×420、667×375及桌面。
4. 验证更多开关、Escape/焦点、工作空间/模型入口、断线草稿保留、长中文/列表/代码/表格无页面横溢出；WCAG间距覆盖、桌面字号隔离。
5. 原生instrumentation覆盖零工具栏、设置取消保持WebView实例/输入/滚动、不可信意图拒绝、返回键恢复、授权提示；Go race、lint、签名、模拟器与正式包安装门禁均实际运行。
6. Android升0.1.1/code2，沿用持久签名；工作分支CI通过后同步最新master、重新回归，提交合并推送，再tag发布并实际核验附件版本/哈希。失败不声称已发布。
7. README/devlog/本文记录真实测试和限制；工作树清理前保存日志/截图、核对主checkout原有文件未被覆盖。

## 7. 验收指标与未知项

- 正常聊天原生非系统顶部占位48dp→0dp；查看/取消设置无destroy/reload/disconnect。
- 手机正文保持14px，实测行高22.4 CSS px，桌面原样；固定样本文字不变且总高度下降。
- 历史一次点击，连接面板两次点击以内；错误不只靠颜色或瞬时toast。
- 新增手机主要按钮48 CSS px/原生48dp；扩大间距/文字后不裁切关键动作。
- 不在总收益中混加dp和CSS px，不把浏览器短视口测试写成IME真机通过。
- 尚无真实本人账号登录、实体arm64、锁屏、蜂窝切换或屏幕阅读器体验结论。APK改原生壳，网页改动需要电脑端同步本次版本；仅安装APK不会把旧电脑网页变成新版。

## 8. 实施结果（完成后填写）

当前：方案先行，尚未修改实现、执行本轮测试或生成新版APK。
