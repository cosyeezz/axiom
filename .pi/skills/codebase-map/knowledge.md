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

### 2026-09-10 自动重试的计数、取消与长等待
- 症状：嵌套重试超出次数，长退避触发定时器溢出，取消期间重新开始请求。
- 根因：SDK与应用双重重试、setTimeout为32位、取消监听未及时释放。
- 修复：src/retry.js统一30次计数，48秒后继续翻倍，超长等待分段且清理监听；src/pi.js关闭两层内建重试。sessions保存重试记录，服务重启标记停止。
- 防再犯：假等待验证完整30次序列、取消与监听清理；继续时保留工具结果，不重新发送原任务；UI错误只用textContent。
### 2026-09-10 共享文件选择器的样式边界与请求竞态
- 症状：新弹窗在手机被位置侧栏遮挡，搜索框超宽；异步加载失败时仍能确认未验证目录。
- 根因：全局 `aside` 手机规则定位 fixed、input width:100% 加外边距溢出；目录输入被提前当作有效结果，搜索防抖窗口和原生异步 close 事件可能命中重开的弹窗。
- 修复：public/file-picker.js 用独立 div/class，SVG 使用 presentation color 属性遵守 CSP；file-picker.css 搜索宽度扣除边距。确认只接受成功浏览结果，搜索立即使旧响应失效，close 清理定时器且延迟 close 事件不影响已重开弹窗。src/sessions.js 绝对路径导航使用系统根解析，避免 UNC share 被拆为普通 POSIX 根。
- 防再犯：真实浏览器测 320px 与桌面溢出/遮挡和 Esc；tests/file-picker.test.js 检查不预读、分页、过期响应、错误重试与无效目录不能确认。

### 2026-09-10 图片占位需保留位置与编号对应
- 症状：粘贴图片只有附件预览，正文没有插入位置；多条队列撤回会重复 image1 编号。
- 根因：正文与图片数组独立传输，原输入没有建立可见编号；异步读取期间若允许撤回，附件数量会改变并冲突。
- 修复：public/app.js 在读取前原地插入 `[imageN]`，发送说明编号对应附件顺序；删除重排、撤回累加偏移，读图与撤回互斥。失败只恢复未被编辑的原位置标记，防止误改同名正文。
- 防再犯：tests/app.test.js 覆盖中间插入后继续输入、删除重排、失败恢复、读取期间切会话与多条撤回；手改标记按普通文本处理，不自动删除真实图片。

## 2026-09-11 — 子任务完成通知与主轮结束竞态
- 症状：主代理在收尾窗口收到 followUp 后无后续循环；用户撤回也可能清除系统通知。
- 根因：SDK 队列最终排空早于外层 work finally；用户队列并非可靠通知存储。
- 修复：Tasks 落盘 resultId/notified，Sessions 在空闲、配置完成与运行 finally 调度新通知轮；取消暂停，关闭等待通知清理，重启补发，旧任务补凭证。
- 防再犯：tests/task-notifications.test.js 覆盖忙时合并、空闲唤醒、持久化失败、取消通知与重启补发；摘要 UI 只复用当前会话任务状态，快照清理同步隐藏。

### 2026-09-11 空助手卡片与工具过程不可见
- 症状：会话大量只有模型用量或思考的 AXIOM 卡片，工具执行内容不可见。
- 根因：每条 assistant 建卡，仅提取 text/thinking，忽略 toolCall/toolResult/tool.state。
- 修复：public/app.js 共享活动状态与工具折叠详情，保留消息节点/entryId 仅展示合并；历史读取工具结果和 snapshot.tools，压缩不复活已折叠工具。
- 防再犯：实时与快照共用工具渲染，按 agentId+toolCallId 隔离；终止/断线停止动画但不虚构工具成功；diff 优先真实结果，否则标注请求预览；纯文本输出不使用 innerHTML。tests/message-activity.test.js 覆盖合并、压缩保留边界、安全展开和状态恢复。

### 2026-09-11 思考 Markdown、活动身份与表格滚动
- 症状：思考状态与折叠入口重复，工具完成后只剩字符对勾；思考以斜体 pre 显示、不识别 Markdown。表格 display:block 出现右侧空框，窄屏短状态挤成一字一行。
- 根因：状态图标替代工具身份、两个组件同时表达思考；思考绕过 Markdown 渲染器；将 table 本体当滚动容器破坏原生表格布局。
- 修复：public/app.js 合并思考入口、工具图标/对象/状态分离；stream-renderer.js 仅展开时共享 renderMarkdown。markdown.js 用独立 .table-scroll 保留 table 语义，生成净化后的复制控件；style.css 原生表格宽度与最小列宽、窄屏工具摘要分行。
- 防再犯：正文定位使用 `.message > .markdown`，不能用命中思考的后代选择器；测试用真实 Markdown 验证思考/XSS/复制及未打开任务零解析。按钮在 DOMPurify 之后由程序生成，不放开脚本/inline style。浏览器截图必须等待 details toggle 和动画帧，不能把尚未渲染当为空内容；所有 display:flex 的 summary 显式隐藏 marker，保留键盘与文字展开提示。

### 2026-09-10 20:40 diff 截断提示不能放在可切换的视图内部
- 症状：超过 60,000 字符的 diff 在左右对比模式看不到截断提示，用户可能误以为结果完整。
- 根因：renderToolDetail 将提示附到 .diff-unified，而桌面默认隐藏该视图。
- 修复：public/app.js 把 .tool-truncation 作为该节下方的独立元素，适用于 diff 与普通输出；public/style.css 共用说明文字样式。
- 防再犯：tests/message-activity.test.js 验证两种视图切换后提示仍在 .tool-detail 直属层，普通输出上限不变；浏览器验证 1440px/320px 可见。共享 summary 使用 span 活动行，JS Markdown 查询不依赖 :has（不支持时会抛错，而非仅丢样式）。

### 2026-09-10 21:12 程序跳转被滚动事件误判为恢复跟随
- 症状：子代理摘要先设 follow=false 再 scrollIntoView，目标靠近底部时「回到最新」立即隐藏，新输出又把阅读位置拉走。
- 根因：浏览器异步 scroll 事件按距底部 <80px 无条件恢复 follow；JSDOM 不自动触发真实布局滚动，单测只检查 click 会漏掉。
- 修复：public/app.js 记录定位后的 scrollTop，同位置事件不改变暂停状态；实际不同位置的滚动仍按原逻辑处理，回到最新和快照清除标记。
- 防再犯：tests/app.test.js 显式派发定位后的 scroll，再验证 scrollLatest 不改位置；tests/conversation-ui.py 从顶部跳到近底卡片后等待事件，验证按钮/焦点/最新入口及恢复跟随。

### 2026-09-10 21:12 静态 UI 预览与 Windows 路径转义
- 症状：worktree 的 node_modules junction 无效；浏览器长内容验收误打开旧会话，截图偶现吸顶标题短暂空白；重复样例变成未解析 Markdown。
- 根因：Python 普通字符串里的反斜杠 a 被转为 bell；预览初次异步恢复覆盖过早写入的 session ID；滚动后未等合成帧；Markdown 代码围栏与下段之间缺换行。
- 修复/防再犯：junction 用 PowerShell New-Item -ItemType Junction；预览切换前等待初次工作区恢复，reload 后核验 ID；截图等待滚动稳定，动画选择可见元素并检查 transform 确实变化；长 Markdown 样例用双换行连接，修改 public/ 后重启预览。对应 tests/conversation-ui.py 与 conversation-preview.mjs。

### 2026-09-10 图片占位不能只靠末尾说明关联
- 症状：每条消息追加编号说明，模型附件仍堆在正文末尾。
- 根因：SDK 普通发送及队列采用 [text,...images]，正文标记没有改变真实图片位置。
- 修复：inline-images.js 内置 context 钩子只转换模型副本，按首次有效标记交错排列；app.js 不再追加说明。
- 防再犯：保留原始存储与队列顺序；覆盖乱序、重复、悬空、漏标、纯图及不修改工具结果，已交错消息不重排。

### 2026-09-10 21:52 动画验收先核对实际资源，不只看 CSS 声明
- 症状：用户仍反馈状态图标不动，而工作树中已有动画；正式 4319 的 CSS 与 8b186c6 一致，不是本轮文件。
- 根因：src/server.js 在模块加载时读取并缓存资源，刷新页面不会重读磁盘；仅检查 animationName 也不能证明图像真的发生变化。不能据此推断所有旧 SVG 动画都失效。
- 修复：public/style.css 将等待/准备调用改为高低亮度分段的伪元素圆环，缩小图标后仍清晰；tests/conversation-ui.py 验证伪元素 transform 随时间变化，停止状态与 reduced-motion 无动画。新版仅在预览验证，正式服务未重启。
- 防再犯：先比对实际 HTTP 资源与待验版本；修改 public/ 后重启预览，正式合并后在安全时段快速重启。浏览器同时验状态、旋转变化和 reduced-motion；静态截图不能作为动态有效的证据。

### 2026-09-11 系统动画关闭/RDP 下 reduced-motion 冻结全部进行中动画
- 症状：Windows 关闭「动画效果」或经远程桌面（RDP）会话时，页面所有转圈与思考动态点静止，像页面卡死。
- 根因：这类环境会让 `prefers-reduced-motion: reduce` 匹配，CSS 动画按无障碍规则全部 `animation: none`，并非页面故障。
- 处理：用户在系统设置重新开启动画后确认恢复；保留该媒体查询（行为正确），不新增应用内动画开关。
- 防再犯：动画「不动」先查系统 reduced-motion 环境（系统动画设置/远程会话），别急着改代码；style.css 新增任何动画必须同时登记进文件尾部 reduce 媒体查询的选择器列表（本轮补了 `.task-run-spin`、`.thinking-dots`）。

### 2026-09-11 新增静态文件不重启服务时 404
- 症状：往 public/ 放了新 JS/CSS 并在页面引用，浏览器刷新后仍拿不到文件。
- 根因：src/server.js 的 assets 映射在启动时固定构建，启动后新增的文件不在路由表里。
- 处理：新文件在 assets 表登记后走「服务 → 快速重启」；更新已注册文件同样需重启载入（ETag 缓存不变）。
- 防再犯：新增静态资源 = 登记 assets + 快速重启，两步缺一不可。

### 2026-09-11 会话树回退（撤回已发出的输入）的两个隐性约束
- 症状：用 SDK 公开的 `AgentSession.navigateTree(用户消息 id)` 回退后一切正常，但重启后那条消息又出现在上下文里；即使不重启，网页历史仍显示被撤回的输入和被打断的半截回答。
- 根因：① `SessionManager.branch()` 只移动内存里的叶子指针，文件是追加式的；只有再追加一条条目才会把新位置落盘，而重启时 `_buildIndex` 取「文件最后一条」当叶子。② axiom 自己还存了一份 `item.messages`（sessions.js 从 `agent.message.end` 累积，attach 快照就发它），SDK 上下文回退了这份副本不会跟着回退。
- 修复：src/pi.js 回退后补一条 `appendCustomEntry("axiom_recall", …)`（`type:"custom"` 不参与 `buildSessionContext`，等于零上下文成本的持久化标记）；src/sessions.js 按 `entryId` 截断 `item.messages` 并 `delete item.live.main`，别忘 `persist`。
- 防再犯：任何「改会话树/历史」的操作都要同时问三处——SDK 文件是否落盘（branch 不落盘）、axiom 的 `item.messages` 副本、客户端当前的 DOM/`views`。判断「本轮有没有模型输出」要看 `getBranch()` 里的持久化条目，且工具调用必须算已产出：工具副作用已发生，回退会让新的分支出现孤立 toolResult。
