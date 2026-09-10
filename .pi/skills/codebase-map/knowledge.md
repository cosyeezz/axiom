# 坑与 bug 知识库（自成长：只追加，不删改历史）

登记格式：`### YYYY-MM-DD 标题` + 症状 / 根因 / 修复 / 防再犯。修完 bug 必追加一条。

### 2025-05 能力清单显示绝对路径，设置弹窗溢出
- 症状：主/子能力清单直接显示绝对路径，内容过长撑爆弹窗
- 根因：UI 直接渲染内部标识（目录绝对路径）
- 修复：public/app.js `capabilityName()`——技能取目录名、npm 扩展取含 scope 包名、本地扩展取文件名
- 防再犯：UI 展示层一律过 capabilityName，绝不直接用内部 id

### 2025-05 CSP 阻止预览 inline style
- 症状：能力预览的新行/长文本样式被浏览器 CSP 拦截
- 根因：JS 动态注入 inline style，与安全策略冲突
- 修复：样式移入 public/style.css，不放宽 CSP
- 防再犯：新样式一律进 CSS 文件（类名切换），不写 inline style

### 2025-05 WS 回执时序错乱（历史多发区）
- 症状：旧会话发送回执清空新会话草稿；列表刷新失败误删已发送消息；跨会话重命名回执错乱；断线丢草稿
- 根因模式：客户端回执未严格绑定会话身份与请求时序
- 修复：public/app.js `pending` Map 与 `ws.onmessage` 分支（回执带会话标识、断线保草稿、重连前保存输入）
- 防再犯：凡改 pending/回执逻辑，先列出"回执属于哪个会话哪个请求"再动手

### 2025-05 委托链路误报：插件指令无回答被当失败
- 症状：插件指令无模型回答被误报失败；子任务清理异常导致状态不发布
- 涉及：src/tools.js、src/tasks.js
- 防再犯：改委托链路时，错误分支必须区分"无回答"与"真失败"；子任务 finally 必须发布终态

### 2025-05 新建会话总恢复启动时模型
- 症状：每次新建会话都回到服务启动时的模型，需重复选择
- 根因：默认选择未持久化/继承
- 修复：src/sessions.js 默认配置快照 + agent 目录 axiom/defaults.json 持久化
- 防再犯：改会话创建逻辑时，确认 defaultSelection 的读取与保存链路完整

### 2026-09-10 子代理详情缺少真实运行信息
- 症状：子任务只有状态与输出，无法查看实际系统提示词、模型、缓存命中和上下文；销毁后不能再读取 SDK 状态。
- 根因：原协议只传消息与任务状态，Tasks 终态删除 agent，未保存独立运行快照。
- 修复：src/pi.js 读取 SDK systemPrompt/messages.usage/getContextUsage，边界事件发布 agent.runtime；src/tasks.js 保留终态 runtime，src/sessions.js 恢复主会话 runtime；public/app.js 按会话和 agentId 隔离展示，系统提示词只用 textContent。
- 防再犯：展示用 runtime 不进入 read_result，避免把系统提示词灌回主代理上下文；缓存率分母包含 cacheWrite，未知用量与压缩后未知上下文不能当零；销毁前保存，切换时清空前会话状态，不逐 token 扫历史。

### 2026-09-10 子代理浮层必须以会话区定位，不能覆盖侧栏或污染共享渲染
- 症状：原生 dialog 默认按整个视口居中，桌面浮层跑到左侧配置区；使用 `.task-dialog h2` 时覆盖消息正文标题的颜色、字号与间距。
- 根因：顶层 dialog 不按父容器居中；浮层标题样式选择器过宽，命中复用的 Markdown 标题。
- 修复：public/style.css 用同一 `--sidebar-width` 驱动侧栏和浮层边界，避开顶部 64px 会话栏，侧栏收起/手机归零；标题样式收窄到 `.task-top h2`。public/app.js 将卡片入口与 dialog 容器分开，继续复用 card/renderMessage 和原 renderer，以 dialog.open 做按需渲染；跳转按钮分别暂停/恢复跟随。
- 防再犯：真实浏览器比较浮层与会话区中心，覆盖侧栏展开/收起、320px 手机与横屏；检查浮层正文和主会话相同 Markdown 的 DOM 与样式。会话切换清理旧 dialog，Esc 有任意原生弹窗时不发 cancel，延迟 close 事件不能清空已重开的 activeTask。

### 2026-09-10 运行中模型配置与队列回执不能混淆执行状态
- 症状：运行时无法发插话、无法换模型；切模型若沿用 configuring/idle 会错误显示已完成；乐观用户卡片不能正确呈现 Pi 队列实际消费。
- 根因：Sessions.configure 与 prompt 均以 idle 为唯一入口，UI 同步禁用；浏览器自行造消息，而 SDK 才知道消息何时进入上下文。
- 修复：src/sessions.js 配置锁与执行状态分离，运行中转交 SDK steer/followUp；src/pi.js 转发 queue_update；public/app.js 用实际 user message_end 渲染，撤回用 clearQueue 并绑定会话保留草稿；每条回答使用消息自带模型字段。退出保存与显式删除分开，避免 close 清理误删落盘历史。
- 防再犯：测试运行中换模型不变 idle、双类型队列和撤回、单/双 Esc、服务关闭后恢复、删除才移除文件；模型信息不可从当前下拉框倒推历史。

### 2026-09-10 输入区扩展不能挤占原工具栏，索引测试不能写死源码行号
- 症状：整行 Skill 下拉框打断原输入区布局；增加 imports 后索引测试误报。
- 根因：将添加上下文做成常驻表单；测试把 Sessions 的类行号固定为 9。
- 修复：public 输入区上沿独立图标菜单与标签，保持模型栏/运行信息顺序；tests/codebase-index.test.js 从源码计算类行号再比对生成物。
- 防再犯：新增 UI 在桌面/手机检查菜单、标签、工具栏和横向溢出；索引测试验证内容与源码一致，不锁死合法改动后的行号。

### 2026-09-10 新弹窗漏样式与设置选择器错位
- 症状：重命名/删除弹窗有默认边框，删除悬停变紫；设置下拉箭头与文字重叠，宽度受手机模型选择限制。
- 根因：新 dialog 未纳入共享选择器；全局 button:hover 优先于 .danger；箭头按 label 顶部定位，设置 label 包含可见标题。
- 修复：public/style.css 补齐 dialog/backdrop、危险按钮状态；箭头按底部定位、设置选择器宽度单独限定。public/app.js 操作绑定列表项身份而非当前会话；断线统一退避重连。
- 防再犯：检查新增弹窗普通/悬停/手机状态；测非当前会话操作、两种队列按钮与连接失败重试。

### 2026-09-10 会话行操作图标在选中框外
- 症状：选中框只包住标题按钮，操作图标看起来在框外。
- 根因：背景、边框和选中阴影仍挂在 .session-item，而操作按钮是兄弟元素。
- 修复：public/style.css 将选中外观移到 .session-row，以 :has([aria-current]) 驱动；行内留边距，图标颜色统一。
- 防再犯：复合条目外观作用于整行，不把交互按钮嵌套进另一个按钮。

### 2026-09-10 后台压缩的安全边界和消息 ID
- 症状：直接 session.compact 会 abort 主任务；只监听 turn_end 后异步替换可能丢新消息；message_end 回调内还拿不到刚结束消息的 entryId。
- 根因：原生手动压缩是中断式；普通订阅通知不等待 Promise，SDK 在通知之后同步持久化消息；prepareNextTurnWithContext 仅覆盖同次运行的续轮次。
- 修复：src/compaction.js 固定历史快照并后台生成，在下一轮刷新钩子或空闲后的 prompt 入口校验并应用；src/pi.js 延迟一个微任务取得真实 entryId，result 使用本次最后响应引用而非压缩前数组下标；src/sessions.js 按顺序补齐旧历史 ID 并恢复 JSONL 已提交摘要。
- 防再犯：保留边界后的全部消息按当前分支重建；旧 compaction 条目可位于新切点之后，不能重复当作摘要正文或近期消息；压缩后未知 usage 使用内容估算，不复用旧用量。摘要会话显式禁用资源发现，取消须中断真实 HTTP。tests/compaction.test.js 与 compaction-config.test.js 覆盖安全点、取消、分支失效和重启恢复。

### 2026-09-10 隐藏 DOM 输入框不能当状态存储
- 症状：删除侧栏「工作空间」路径表单后，新会话/自定义新会话报错（openCreation 读 `$("cwd").value`）。
- 根因：`#cwd` 隐藏输入被当作「当前工作空间」状态存储，UI 元素与状态耦合。
- 修复：app.js 模块级 `currentCwd` 变量，snapshot 时更新；DOM 只负责展示。
- 防再犯：删任何 UI 元素前先 rg 全部引用；状态放变量，DOM 只做展示。

### 2026-09-10 信息栏与模型栏视觉顺序颠倒
- 症状：HTML 中信息在模型栏后面，但实际显示在其上方。
- 根因：#session-runtime 的 order:-1 与 #prompt 的 order:-2 覆盖 DOM 顺序；只检查 DOM 无法发现。
- 修复：删除两处 order，使用自然顺序；浏览器比较 actions.bottom <= session-runtime.top。
- 防再犯：布局顺序验收检查真实坐标，不只测试 previousElementSibling；紧凑按钮同时覆盖全局 min-height。

### 2026-09-10 图片队列与截图预览
- 症状：图片输入只传文本、运行中撤回丢图；data URL 图片被 CSP 拦截。
- 根因：Pi 0.85.1 的公开队列快照/clearQueue 返回文本，真实消息队列才保留图片；clearQueue 同步清空，入队事件早于真实队列写入。按文本建立图片映射还会让相同文字的两张图碰撞。
- 修复：src/pi.js 从锁定版本的真实队列读取图片，撤回先快照再清空，queue_update 延迟微任务；public/app.js 按会话和发送快照保存/移除附件，src/server.js 仅为图片增加 img-src self/data:。
- 防再犯：升级 SDK 验证私有队列形状与事件时序；测试同文不同图、撤回、纯图、跨会话草稿和截图异常停止共享。不放宽脚本 CSP，不把未发送附件写入 localStorage。

### 2026-09-10 后台目录选择框不可见
- 症状：点击打开工作空间没有可见窗口，后续提示文件夹选择窗口已打开。
- 根因：隐藏 PowerShell 宿主调用无 owner 的 ShowDialog，窗口前台归属不明确；未完成请求持有互斥锁，提示把请求占用误称为窗口已显示。
- 修复：src/sessions.js 创建并显示/激活透明置顶 Form，传给 ShowDialog(owner)，finally 释放两个窗口；保留超时并明确提示重试。
- 防再犯：窗口显示与请求入队不同；mock 覆盖取消/错误释放锁，同时使用 Windows UI Automation 检查真实对话框可见，不能只检查进程存在。

### 2026-09-10 重启确认遗漏应用弹窗样式
- 症状：重启时出现带站点地址的浏览器确认框。
- 根因：public/app.js 重启入口直接调用 confirm，CSS 无法定制浏览器系统弹窗。
- 修复：两种重启统一改用原生 dialog + 项目共享样式，仅表单确认发送请求，默认聚焦取消。
- 防再犯：新确认交互使用可样式化 dialog，并覆盖取消/Esc 不发送、重复提交及错误恢复。

### 2026-09-10 原生文件夹选择框仍是旧树状界面
- 症状：选择框可见但 UI 陈旧，没有地址栏和搜索。
- 根因：系统 Windows PowerShell 5.1 的 .NET Framework FolderBrowserDialog 使用旧 shell 界面，不能仅靠 EnableVisualStyles 升级。
- 修复：优先已安装的 pwsh.exe，利用现代 .NET 的 AutoUpgradeEnabled；仅 ENOENT 回退旧系统宿主，避免取消/超时/执行错误再次打开窗口。
- 防再犯：检查实际宿主版本，UI Automation 验证 Address Band Root/SearchEditBox，不把原生等同于现代；不自动安装 PowerShell。

### 2026-09-10 输入框引用单独发送与补全初始化
- 症状：只有文件/文件夹标签时按钮禁用；开发补全时首次页面加载触发 TDZ。
- 根因：required、按钮禁用、submit 三处未计入 contextFiles；controls 在事件注册段前已经执行。
- 修复：public/app.js 三处统一计入文件引用，补全状态声明放到文件顶部。
- 防再犯：新增上下文类型检查表单校验到发送全链路；controls 使用的 let 状态必须先初始化，保留真实页面启动回归测试。

### 2026-09-10 顶栏路径图标撑大标题行距
- 症状：标题与路径间距松散，与左侧菜单按钮不协调。
- 根因：路径图标的 height:26px 小于全局 button min-height:40px，实际路径行被撑高。
- 修复：public/style.css 同时设置图标 height/min-height:24px，标题显式行高与双行间距，保留顶栏居中。
- 防再犯：紧凑按钮同时检查 height 与 min-height；tests/app.test.js 检查真实页面计算样式，不只匹配 CSS 文本。

### 2026-09-10 共享文件选择器的样式边界与请求竞态
- 症状：新弹窗在手机被位置侧栏遮挡，搜索框超宽；异步加载失败时仍能确认未验证目录。
- 根因：全局 `aside` 手机规则定位 fixed、input width:100% 加外边距溢出；目录输入被提前当作有效结果，搜索防抖窗口和原生异步 close 事件可能命中重开的弹窗。
- 修复：public/file-picker.js 用独立 div/class，SVG 使用 presentation color 属性遵守 CSP；file-picker.css 搜索宽度扣除边距。确认只接受成功浏览结果，搜索立即使旧响应失效，close 清理定时器且延迟 close 事件不影响已重开弹窗。src/sessions.js 绝对路径导航使用系统根解析，避免 UNC share 被拆为普通 POSIX 根。
- 防再犯：真实浏览器测 320px 与桌面溢出/遮挡和 Esc；tests/file-picker.test.js 检查不预读、分页、过期响应、错误重试与无效目录不能确认。
