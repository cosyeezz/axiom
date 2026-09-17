# 坑与 bug 知识库（自成长：只追加，不删改历史）

### 2026-09-16 独立子历史堆尾挤走首屏主正文
- 原因：恢复时将子任务 JSONL 全部追加在主消息后，last60 分页只剩子代理卡片；实时顺序正常，因此纯主消息测试未发现。
- 修复：sessions.js 在独立历史重建时按 delegate 结果 taskIds 归位，无关联记录前置保留；不重排既有完整历史，不改实时数组或原文件。
- 防再犯：restored-history-order 回归用真实数组 content 和超过一页的子消息，验证最终主回答可见及全量遍历不重不漏；移除标签 UI 后仍验证侧栏跨目录草稿恢复。

### 2026-09-15 历史分页不能复用实时快照水位与发起时草稿
- 根因：历史页不包含水位后的全部事件，提交 seq 会吞掉实时消息；回包使用请求发起时的视图会覆盖期间新输入。
- 修复：session.history 不带 seq，loadHistory 只换页不 commitSnapshot，按会话/实例/修订/请求序号作废迟到响应；挂载前重新 saveView 保留草稿。仅 attach 提交实时快照。
- 防再犯：snapshot-switch、snapshot-chunk、session-history 测试验证在飞草稿、旧页不推进水位与游标失效。分页不等于 SDK 历史内存有界，必须分别说明。
### 2026-09-15 Electron ESM 顶层等待 ready 导致不开窗口
- 症状：主进程存活但不启动 worker、不弹窗；隔离冒烟30秒超时。
- 根因：ESM 主入口顶层 await app.whenReady() 阻止模块完成评估，与应用就绪互相等待。
- 修复：desktop/main.mjs 注册 app.whenReady().then(async ...) 后立即完成模块评估。
- 防再犯：scripts/smoke-shell.mjs 在隔离目录实际启动 Electron，校验窗口加载和退出码；超时清理本次进程树并按失败处理。

### 2026-09-14 默认配置按工作目录隔离
- 症状：目录选择编辑可能被慢响应覆盖，目录配置保存或删除失败可能让内存先于数据库生效。
- 修复：public/app.js 用编辑对象、加载序号及目录三重守卫；src/sessions.js 保存与删除共用串行链，先落库后更新内存，目录别名按真实路径归一化。
- 防再犯：tests/defaults.test.js 覆盖目录独立模型、删除回落和写入失败；目录选择器的测试桩不能改变「打开工作空间」原有返回值。

### 2026-09-14 Goal 安全暂停必须覆盖 SDK 外层队列续跑（同机制也覆盖用户安全停止）
- 症状：工具批次已安全停止，但队列非空时仍发第二个模型请求。
- 根因：SDK shouldStopAfterTurn 仅停止内层；AgentSession 的后处理仍根据 hasQueuedMessages 自动 continue。
- 修复：src/pi.js 把 goal 暂停（requestPause）与用户安全停止（requestSafeStop）合为同一个 shouldStopAfterTurn 钩子，收工期间禁止队列驱动自动续跑，真实队列和历史不动；抽水循环会反复查 hasQueuedMessages，所以标志必须闩到下一次 beginRun/abort 才复位。二者若各自赋值同一个钩子，后建的会静默覆盖前一个。
- 防再犯：tests/goal-pi.test.js 与 tests/safe-stop.test.js 都同时验证在飞工具完成、请求次数不增加、队列保留及显式恢复；升级 SDK 后重跑，不能只测空队列暂停。

### 2026-09-13 手机收起不等于只隐藏模型栏
- 症状：真机收起后输入/进度/跳转仍占据屏幕下部，无法纯阅读。
- 修复：手机折叠隐藏composer-wrap辅助子项与composer中非mobile-controls项，earliest同样隐藏；状态单行横滚显示百分比和模型，展开后重新测量输入高度。
- 防再犯：真实浏览器验证空/长草稿、队列进度与跳转均收起，重新展开草稿不丢、桌面样式不变；不以仅输入框44px作为整块底栏紧凑的证明。

### 2026-09-12 手机输入区与吸顶信息挤占正文
- 根因：桌面 textarea 三行/96px 下限、模型和多行状态常驻；嵌套 sticky 与绝对定位跳转叠在正文上。空 textarea 的长 placeholder 也会增加 scrollHeight。
- 修复：public/app.js 手机空输入固定44px，style.css 仅≤700px折叠辅助区、限制底栏与输入高度、取消详情吸顶和跳转悬浮；index.html 提供统一展开入口，双百分比保留读屏名称。
- 防再犯：tests/mobile-reading-ui.py 用真实布局检查小屏/横屏/长草稿和展开；桌面对比旧CSS计算样式与坐标。预览静态资源启动缓存，修改后换独立端口；不把短视口当真实软键盘。

### 2026-09-12 维护恢复不能绕过安全门禁
- 症状：HTTP 停止返回 409 后回落控制管道，仍可能停止活动任务；启动超时后回滚时旧进程仍活着，产生双 worker；更新依赖被写入错误的全局共享层。
- 根因：将业务拒绝当网络故障、将超时当退出，且测试桩把错误依赖布局写成预期。
- 修复：scripts/service.mjs 保留 HTTP 拒绝，只允许无 worker 的管道停止；回滚前确认退出，spawnWorker 防重；新包携带私有依赖，旧包连依赖整体备份。
- 防再犯：tests/service.test.js 覆盖忙碌停止拒绝、私有依赖位置、构建失败与启动超时回退；真实隔离服务核对 ACK 操作 ID、新实例 ready/health 身份与优雅退出。

### 2026-09-12 服务维护锁不能阻断状态读取
- 症状：维护准备期间刷新页面，WebSocket 尚在但无法重新获取守护进程状态入口。
- 根因：stopping 统一拒绝所有请求，也误拒绝只读 service.status；双发请求还可能一起通过异步鉴权之前的锁检查。
- 修复：src/server.js 在异步鉴权前后校验维护锁，唯独保留 service.status 读取；区分维护锁与实际关闭，准备期间允许刷新建立新 WebSocket，实际 close 才拒绝升级；本地才返回维护凭证，远程仍 managed:false。
- 防再犯：tests/service-settings-api.test.js 覆盖并发双重启只接收一个、维护中读取入口、远程无令牌及 CSP 不放行维护端口。

### 2026-09-12 回答前思考与前段工具形成相邻 Completed
- 症状：连续工具后开始正文，正文自身 thinking 又建一个折叠条，视觉上两个 Completed 紧邻。
- 根因：只合并工具消息，没有把下一条回答正文之前的 thinking 归入同一无正文区间。
- 修复：public/app.js refreshCallGroups 复用紧邻前组，独立 thinking-record 同样作为活动处理；正文之后的工具仍留在正文之后。
- 防再犯：tests/activity-groups-ui.py 覆盖三次实时调用、用量、正文前思考与真实 attach/reload；相邻断言忽略组内 Markdown 和空正文，不能让隐藏思考伪装成正文边界。tests/app.test.js 不再假定 thinking 必须位于原消息节点。

### 2026-09-11 Tailscale omitempty 字段不能当必填身份
- 症状：同账号个人设备打开远程地址也返回 403。
- 根因：真实 whois Node.Tags 使用 omitempty，无标签时省略；测试全手写 Tags:[]，未覆盖实际输出。
- 修复：src/remote.js whoisUser 将省略 Tags 视为无标签，仍拒绝非数组、真实 tag、缺 Node 和无有效身份。
- 防再犯：tests/remote.test.js 普通设备 mock 默认省略 Tags，真实形态贯穿 HTTP/WS 身份验证，不能只验证手工理想数据。

### 2026-09-11 Tailscale HTTP 地址不是浏览器安全上下文
- 症状：本机 localhost 可用，换成 Tailscale HTTP 地址后请求可能全部失效，自动复制不可用。
- 根因：Tailscale 的隧道加密不改变浏览器对 HTTP 非 loopback 地址的 secure context 判定，crypto.randomUUID 和剪贴板能力并非处处可用。
- 修复：public/app.js 请求 ID 使用页内递增序号，只用于匹配回执，无需密码学随机数；剪贴板继续保留错误提示与系统复制回退。
- 防再犯：tests/remote-ui.test.js 去掉 randomUUID 后验证请求与乱序回执；远程功能不以本机 localhost 浏览器能力作为全部验收依据。
### 2026-09-11 强制中断重启后执行过程仍 Working
- 症状：末尾工具调用失败或中断，没有最终正文，重启后仍显示 Working。
- 根因：paintCallGroup 将“没有后续消息折叠”误当成“Agent 仍运行”；stopActivity 只停止内层记录，外层忽略代理状态。
- 修复：waiting/stopActivity 在对应输出区记录实际活动状态，paintCallGroup 同时检查活动与消息边界；终态失败/停止显示 Stopped。
- 防再犯：tests/message-activity.test.js 覆盖失败后工具间隙仍 Working、idle 收尾、快照重建不复活，不以每个工具完成判整轮结束。


### 2026-09-11 执行过程 UI 改版后测试仍假定旧 DOM
- 症状：app.test.js、message-activity.test.js 三项基线失败，阻塞桌面打包集成。
- 根因：测试选到了新外层 details，并仍假定思考流默认折叠、工具步骤隐藏模型信息、旧中文状态标签。
- 修复：限定 .thinking-record；验证流中自动展开/结束收起与历史懒渲染，逐消息元信息与实际工具状态，不改产品代码。
- 防再犯：组件选择器按职责定位，状态语义与文字分别断言；UI 改版同步运行并维护测试。最终 143 通过、1 跳过。

### 2026-09-11 首次桌面 workflow 无法手动触发
- 症状：功能分支新增 workflow_dispatch 后，gh workflow run --ref feat/pake-desktop 返回 404。
- 根因：GitHub 手动工作流须先存在于默认分支；指定 ref 不能跳过首次注册条件。
- 修复：.github/workflows/desktop.yml 对打包配置变更提供 push 触发，在功能分支先构建验证再合并；macOS 额外校验 DMG 完整性与 arm64/x86_64 双架构。
- 防再犯：首次发布先使用分支 push 验证，不为触发构建提前合并未经验证的配置；产物发布 Release 并附 SHA256，不能只留有过期时间的 Artifact。


### 执行过程分组在工具间隙反复折叠
- 症状：Working 下的记录在连续调用之间反复收起、展开。
- 根因：paintCallGroup 用当前是否存在运行行判断整轮结束，工具结束与下一条消息之间的空隙被误判为完成。
- 修复：public/app.js 将自动折叠与工具状态解耦，后续出现用户消息或模型正文时统一收起外层及消息内分组，并终止旧分组 Working 状态；stopActivity 主动刷新状态。
- 防再犯：工具状态只控制图标，消息边界控制折叠；自动收起仅一次，保留用户手动展开。按用户要求未运行测试。

登记格式：`### YYYY-MM-DD 标题` + 症状 / 根因 / 修复 / 防再犯。修完 bug 必追加一条。

### 2026-09-11 选择工作空间后仍只加载全局技能
- 症状：项目 `.pi/skills/` 存在且格式正常，普通新会话却只显示全局技能，Windows/macOS 均受影响。
- 根因：能力发现依赖 Pi 全局信任策略，普通新会话不传信任确认，默认 ask 导致项目资源被跳过。
- 修复：`src/capabilities.js` 统一将所选工作空间视为可信，不修改 Pi 全局配置；旧 `trustProject` 参数保留协议兼容但不再控制信任。目录内插件/MCP 也会加载，只应选择可信目录。
- 防再犯：`tests/capabilities.test.js` 验证无全局信任配置和旧会话 false 参数均加载项目技能，并保留插件白名单过滤及配置不写盘检查。

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

### 2026-09-11 导入的 pi 会话必须是副本，且会切走当前工作空间
- 症状（潜在）：把 pi 原始 `.jsonl` 路径直接当 `sessionFile` 引用时，删除 Axiom 会话会连用户的 pi 历史一起删；导入后侧栏列表看着像"空了"。
- 根因：`Sessions.remove(id, deleting)` 会删 `agent.sessionFile()`；`renderSessions()` 只显示 `cwd === 当前工作空间` 的会话，导入其它目录的会话会切换当前工作空间。
- 处理：`importSession` 把 JSONL 内容复制到 `~/.axiom/workspaces/<sha256(cwd)>/<id>.jsonl`（`create()` 失败时删副本）；`load()` 只读 `.json`，遗留副本无副作用。侧栏筛选行为保留，属预期。
- 防再犯：tests/session-flow.test.js 断言删除会话后原文件仍在、副本已删；tests/app.test.js 断言导入后标题与 `workspace-label` 跟随会话，`service-api.test.js` 覆盖 `service.status.importDir`。

### 2026-09-11 多轮压缩后子代理入口夹杂、后台摘要无状态
- 症状：主消息折叠后独立 task trigger 仍留在摘要之间；刷新后排列不同；后台生成或失败不可见。
- 根因：压缩仅按主消息 entryId 隐藏节点，没有维护委托工具结果 taskIds 与消息区间的关系；SDK 恢复的压缩区间曾从头累计；后台仅发布成功落盘事件。
- 修复：`public/app.js` 按真实委托结果建立归属，把原入口移到对应摘要的任务区，弹窗继续放在独立 overlays，快照重建同一归属；`src/pi.js` 按每次保留边界还原区间。后台发布真实阶段并由快照恢复，已取消任务的异步完成不能覆盖新任务状态。
- 防再犯：不要按时间或可见位置猜任务归属，不丢弃无法关联的旧任务；覆盖实时/快照/连续压缩、折叠摘要里的运行入口定位和迟到状态。新增进度不要伪造百分比，UI 状态/错误走 textContent。`tests/compaction-ui.test.js` 和真实浏览器 `tests/compaction-ui.py` 验证分层与弹窗仍可用。

### 2026-09-11 输入清空必须保留浏览器撤销记录
- 场景：Ctrl+C 清空聊天文字后，需要 Ctrl+Z 恢复；直接设置 textarea.value 不会记录可撤销编辑。
- 处理：public/app.js 使用 select() + execCommand("delete") 原生编辑命令，Ctrl+Z 不拦截，复用浏览器撤销历史；input 事件更新高度、按钮与补全。仅处理 Ctrl+C，跳过输入法组合、空文字、只读/禁用。
- 防再犯：jsdom 不实现原生编辑历史，不用模拟命令证明撤销有效；tests/conversation-ui.py 在 Chromium 实测撤销/重做/清空恢复。预览服务启动时缓存静态资源，端口被旧进程占用时必须使用独立端口或重启自己启动的预览。

### 2026-09-11 跨目录技能默认选择与历史恢复阻塞启动
- 症状：macOS/Windows 换目录创建报「未知或已不可用的能力：skills」；任一旧会话技能失效后启动退出。
- 根因：技能 ID 是绝对路径，默认配置跨目录共享却严格要求所有 ID 仍可用；Sessions.load 没有逐文件错误隔离。
- 修复：capabilities.js 的 resolveCapabilities 仅在默认继承/历史恢复允许取交集并记录缺失 ID；sessions.js 保持显式输入严格、默认配置不被改写、空集合不扩权、子代理 inherit 不变；历史恢复失败保留原文件并继续。
- 防再犯：不得按技能名称替换路径或以 null 代替空集合；不得自动信任新目录。tests/capabilities.test.js 用真实目录验证技能删除/跨目录和损坏历史隔离，tests/config.test.js 验证默认配置与显式提交区别。
### 2026-09-11 会话树回退（撤回已发出的输入）的两个隐性约束
- 症状：用 SDK 公开的 `AgentSession.navigateTree(用户消息 id)` 回退后一切正常，但重启后那条消息又出现在上下文里；即使不重启，网页历史仍显示被撤回的输入和被打断的半截回答。
- 根因：① `SessionManager.branch()` 只移动内存里的叶子指针，文件是追加式的；只有再追加一条条目才会把新位置落盘，而重启时 `_buildIndex` 取「文件最后一条」当叶子。② axiom 自己还存了一份 `item.messages`（sessions.js 从 `agent.message.end` 累积，attach 快照就发它），SDK 上下文回退了这份副本不会跟着回退。
- 修复：src/pi.js 回退后补一条 `appendCustomEntry("axiom_recall", …)`（`type:"custom"` 不参与 `buildSessionContext`，等于零上下文成本的持久化标记）；src/sessions.js 按 `entryId` 截断 `item.messages` 并 `delete item.live.main`，别忘 `persist`。
- 防再犯：任何「改会话树/历史」的操作都要同时问三处——SDK 文件是否落盘（branch 不落盘）、axiom 的 `item.messages` 副本、客户端当前的 DOM/`views`。判断「本轮有没有模型输出」要看 `getBranch()` 里的持久化条目，且工具调用必须算已产出：工具副作用已发生，回退会让新的分支出现孤立 toolResult。

### 2026-09-11 具名预设不能隐式继承目录信任
- 风险：把会话配置完整保存成预设会将临时信任一起复用，换目录后可能加载未授权插件。
- 处理：预设使用 selection schema 去除 trustProject/useDefaults；public/app.js 启动检查目标目录能力，未信任或失效选择打开确认表单，目录改变重置确认；名称使用 textContent，空集合不变成全部。
- 防再犯：预设只是配置，不是授权；普通按钮不发送 trustProject。通过 tests/presets.test.js 和 tests/app.test.js 验证保存、启动与确认路径。

### 2026-09-11 npm 安装缺少 _resolved 导致 master 更新漏检
- 症状：master 有新提交但版本号不变时提示已是最新；本机 npm 11 全局包 package.json 没有 _resolved。
- 根因：更新依赖 npm 未保证保留的提交字段，缺失后退回版本号；测试仅注入 SHA，未覆盖真实安装布局。
- 修复：src/update.js 始终检查 master SHA，无本地提交记录时必须更新；src/main.js 传完整 SHA，scripts/service.mjs 按 SHA 安装成功后写 .axiom-commit。安装失败尝试重启并报告错误，避免旧服务一直 stopping。
- 防再犯：tests/update.test.js 用实际临时 package.json（无 _resolved、版本不变）检查；tests/service.test.js 验证精确 SHA、成功才记提交、非法 SHA 不执行、失败反馈。首次迁移需完整重启守护进程；安装失败不保证 npm 原地修改可回滚。

### 2026-09-11 npm 更新目标必须与运行目录一致
- 风险：多 Node/npm prefix 下全局安装成功但代码落在另一个目录，旧目录写入新 SHA 后永久误报已最新。
- 修复：scripts/service.mjs 安装前后查询同一个 npm root -g，realpath 比对目标包目录与运行根目录；不同就拒绝，不写提交记录。
- 防再犯：tests/service.test.js 验证安装前错位不执行安装、安装后错位保留旧 SHA、目录别名允许同一真实路径；npm 安装仍非原子，不承诺失败完整回滚。

### 2026-09-11 后台服务缺少优雅停止命令
- 修复：axiom stop 请求本机 POST /service/stop，校验 Host/Origin 与空闲状态，经 IPC 通知守护进程停止；等待子进程保存退出后守护退出，CLI 仅查询 PID 存活不强杀。
- 防再犯：tests/service-api.test.js 验证跨站/忙碌/重复停止拒绝；tests/service.test.js 验证延迟保存后父子退出，旧服务无接口明确报错。

### 2026-09-12 侧栏操作展开与标题混淆
- 症状：行内展开的操作看起来像后续会话标题，归属不清。
- 修复：public/app.js/style.css 使用三点旁的独立原生 Popover；保留触发器高亮、Esc 与外部关闭，菜单越界向内避让。
- 防再犯：tests/session-sidebar-ui.py 检查桌面菜单在三点右侧、窄屏不越界、后续会话坐标不变；原生 toggle 异步，键盘展开后等待绘制再断言。

### 2026-09-12 侧栏状态、完成标记与创建时间不能混用
- 症状：全部目录混排、运行中会话靠后，手动排序和最后活动时间让列表反复移动，完成区折叠且图标容易误触。
- 根因：renderSessions 未限定当前 cwd，把完成标记当隐藏优先级，updatedAt 并非创建时间，操作按钮直接常驻。
- 修复：public/app.js 固定当前工作空间和三组顺序；运行优先于完成标记；src/sessions.js 独立持久化 createdAt；操作通过原生 details 展开。跨 cwd 在 switchSession 统一新开页签，不替换当前草稿。
- 防再犯：tests/session-sidebar-ui.py 实测桌面/手机、日期与排序、绿点及键盘；tests/workspace-tabs.test.js 检查跨目录保留草稿。resize 后等待媒体查询事件再操作侧栏，预览端口冲突用 PREVIEW_PORT，不能误测旧服务。基线原有两项思考渲染失败已单独复现，不应归因侧栏。

### 2026-09-12 新电脑无模型凭据阻止网页首次配置
- 症状：安装后 No authenticated model 退出，无法进入网页添加供应商。
- 根因：createPiFactory 在启动阶段强制选择模型，浏览器连接后无条件创建会话并在失败时断线重连。
- 修复：src/pi.js 将校验延后到创建会话，每次使用刷新后的目录；public/app.js 空目录保持连接并打开既有模型配置页；scripts/install.mjs 缺少 Pi CLI 时补装最新版。
- 防再犯：隔离真实 SDK 的凭据与配置目录验证空启动、配置后创建，不只测 fake factory；前端验证无模型不发 session.create、不循环重连，安装 mock 覆盖已有/缺失/安装失败。
### 2026-09-12 ASCII 中英文表格边框错位
- 根因：空格对齐依赖字体字宽，模型生成的列宽也未必一致。
- 修复：markdown.js 仅转换完整、列数一致的纯文本 ASCII 表格为原生 table，单元格走 textContent，复制保留原文。JSON 工具同样用 textContent 更新，复制读取当前 code 内容。
- 防再犯：不要全局替换空格或修改普通代码；覆盖残缺流式块、HTML 文本、失败不丢原文与当前结果复制。

### 2026-09-12 并排 Unicode 字符图不属于 ASCII 表格
- 症状：菜单/流程框中中文图标与边框错位，表格转换不适用。
- 修复：markdown.js 对纯文本框线图按字素创建固定单/双格，style.css 零字距、正常字重；复制不改原文。
- 防再犯：不要将示意图猜成数据表；组合字符保留，超长内容回退，源空格错误不自动猜。tests/text-diagram-ui.py 验证真实字体下网格比例及手机不溢出。
### 2026-09-12 空模型网页与崩溃守护停止

- 症状：空模型导致网页建会话失败、重复恢复；worker 启动失败后 HTTP 无法停止重试。
- 根因：页面把连接等同于已建会话；停止命令只依赖 worker HTTP。
- 修复：app.js 空目录只引导设置、保留引用与草稿；service.mjs 本地管道仅允许停止已退出 worker 的守护进程；uninstall.mjs 安全卸载。
- 防再犯：jsdom 空目录/保存模型回归；独立子进程崩溃退避停止及重复 stop；卸载 busy/目标不匹配/取消自启失败阻断测试。

### 2026-09-12 重试卡吸收工具消息、刷新移到末尾
- 症状：重试卡混入思考/正文/工具，成功折叠后隐藏正常内容；刷新前后位置和内容不一致。
- 根因：renderRetry 搬入整条失败消息，失败缓存只按 agentId；snapshot 在全部消息后追加重试记录，没有消息边界。
- 修复：public/app.js 删除失败缓存和节点搬运，src/sessions.js 首次记录 messageCount；快照按消息边界插入。终态清除当前等待字段及成功旧错误，history 不变。
- 防再犯：tests/message-activity.test.js 对比实时/快照顺序和无嵌套消息/工具，tests/session-flow.test.js 验证位置落盘及字段清理；旧记录无位置不得猜测重排。

### 2026-09-12 字符图识别必须允许回退和手动启用
- 根因：ASCII 无统一语法，少数字符白名单会漏树/箭头/双线框，放宽猜测又会误判普通文本。
- 修复：markdown.js 分层识别并为纯文本提供优化/原文切换；布局与识别解耦，复制源文本不变，Tab 用累计字符格定位。
- 防再犯：普通编程语言/JSON 不进入字符图入口；保留未知原文、超长禁用、全角组合字符和两向切换回归。

### 2026-09-12 旧重试记录仍回退到回答末尾
- 根因：messageCount 仅为新事件赋值，旧记录无迁移，snapshot 按设计追加末尾。
- 修复：src/sessions.js 恢复时由首次等待时间与完整单调的同代理消息时间恢复边界，并通过既有 persist 固定；已有边界不重算，缺时间/时钟倒退/边界同毫秒不猜。
- 防再犯：tests/session-flow.test.js 连续两次真实保存/恢复，tests/message-activity.test.js 连续快照及分组绘制比较位置；修历史兼容不能只测新事件。

### 2026-09-12 卸载入口 top-level await 死锁
- 症状：卸载 CLI 以 unsettled top-level await 退出。
- 根因：入口动态导入的模块反向静态导入入口，函数导入测试未覆盖真实 CLI。
- 修复：uninstall 不再导入 service，由入口传入服务操作。
- 防再犯：保留真实 CLI 子进程回归，使用无效 npm 防止实际卸载。

### 2026-09-12 重试卡不能依赖编写时间与失效数组下标
- 症状：排队输入在消费之前就有 timestamp，撤回截断后旧计数漂移；压缩后重试裸露在回答末尾，子代理元信息缺失时混入主历史。
- 修复：sessions 维护首次边界和关联消息 ID，迁移使用可靠写入时间；app 按 ID 归档压缩重试，未知位置独立历史折叠区，不猜测插入正文。
- 防再犯：覆盖排队输入、撤回前后子代理混排、多次保存/恢复、多重试状态乱序、压缩与迟到子代理元信息；复核完成前不清理 worktree。

### 2026-09-12 会话复制目标缓存与断线按钮状态
- 症状：会话文件刚落盘后仍提示无 JSONL；断线时纯本地复制被禁用。
- 根因：updateSessions 的列表比较遗漏 sessionFile；controls 统一禁用所有会话操作，覆盖建行时的本地操作豁免。
- 修复：public/app.js 比较 sessionFile，controls 对复制入口/子项与完成标记保留可用；复制目录保留末尾分隔符，避免把 C:\ 变成盘符相对路径。
- 防再犯：tests/app.test.js 验证文件字段单独变化、断线后本地按钮可用及 Windows/UNC/POSIX 根目录复制。

### 2026-09-12 主代理空闲导致子任务未完成时侧栏绿点熄灭
- 症状：subagent 仍运行，会话侧栏却不再显示进行中绿点。
- 根因：Sessions.list 只返回 item.status，未合并 Tasks.jobs 的 starting/running 状态。
- 修复：列表聚合主/子运行状态，保留主代理内部状态用于输入、排队与完成通知；复用列表刷新与既有绿点。
- 防再犯：tests/task-notifications.test.js 覆盖真实主轮结束后多子任务陆续完成、通知轮与取消，不能把主轮结束当整场结束。

### 2026-09-12 导入副本仍跳回源工作空间
- 根因：复制 JSONL 不等于重新绑定 cwd；前端只传 path，后端从源头选择目录，跨目录页签逻辑正常触发。
- 修复：导入传目标 cwd，省略使用实例默认；副本头部同步新 ID/cwd，历史分支 ID 不改，源文件保持只读。
- 防再犯：同时验证页面请求、目标目录校验、副本头部、保存恢复及删除源文件不变；历史绝对路径不会自动迁移，项目文件不复制。

### 2026-09-12 委派背景不能等 turn_end
- 根因：Pi 0.85.1 在助手 message_end 之后立即执行工具，turn_end 在工具全部结束后才发生；同轮默认并发工具之间没有结果依赖。
- 处理：Pi 内置扩展在助手 message_end 同步登记摘要，delegate 创建任务时冻结背景；turn_end 只关联工具状态。累计轮次由 Axiom 保存，不用每次 agent_start 重置的 SDK turnIndex 当永久编号。
- 防再犯：memory 测试覆盖当前摘要进入背景、子任务context被动送达、首次标题不覆盖手动命名；保留Pi原文，仅在显示和结果读取边界隐藏标签。

### 2026-09-12 中文标点旁的加粗标记不渲染
- 症状：正文 `**加粗。**下文`、`**重点：**内容`、`他说**“重点”**内容` 星号原样显示。思考区 strong 不加粗是 style.css:1192 有意压平（README 318 行有载），非 bug。
- 根因：CommonMark 侧翼规则：闭合 ** 前为标点且后紧跟文字、或开 ** 后为标点且前为文字时，判定为不可开/闭；中文不加空格故高发。marked 遵循规范，升级无效。
- 修复：public/markdown.js 新增 fixCjkBold，词法分析前把成对 ** 的首尾标点移出（`**x。**y` → `**x**。y`），渲染文本不变，围栏代码块跳过；tests/markdown.test.js 覆盖句号/冒号/引号三型与代码块原文。
- 防再犯：行内反引号与缩进代码内的成对 ** 不处理（注释已标 ceiling）；改解析前先用真实 marked 复现最小用例，勿做全文字符串替换。

### 2026-09-12 设置切页因内容高度变化跳动
- 根因：原生居中 dialog 仅限最大高度，实际高度随页签内容变化。
- 修复：public/style.css 为 #settings 固定 80dvh，打开时采用纵向 flex，头部固定、settings-layout 内部滚动并预留滚动条位置。
- 防再犯：tests/service-settings-ui.py 在桌面与窄屏比较四页签真实坐标，长内容验证内部滚动和固定关闭栏；display:flex 仅用于 [open]，避免已关闭弹窗仍显示。

### 2026-09-12 12:20 预览配置不可复制
- 症状：浏览器预览连接后无法进入工作区；根因：factory selection 含嵌套 onTrigger 回调，测试桩直接 structuredClone。
- 修复：tests/model-selection-preview.mjs 仅保留 JSON 配置数据；用 model-selection-ui.py/model-settings-ui.py 防回归。

### 2026-09-12 摘要 JSON 替换被 Windows 拒绝
- 症状：摘要保存时 .json.tmp → .json 的 rename 报 EPERM；此操作是文件替换，不是会话改名。
- 根因：既有会话保存已串行，但文件替换无瞬时占用重试，且临时文件名固定；仅凭报错不能确定占用进程或排除持久权限问题。
- 修复：src/atomic-write.js 使用唯一临时文件，对 EPERM/EACCES/EBUSY 最多重试6次（共1.575秒等待），永久失败保留目标原文件并清理本次临时文件；sessions.persist 所有调用共用。
- 防再犯：tests/atomic-write.test.js 注入占用与永久失败，检查成功恢复、旧文件不丢和非占用错误不重试；禁止先删目标来绕过 rename。

### 2026-09-13 SQLite 加载早于安装版本检查
- 根因：install → service → database 静态导入 node:sqlite，旧 Node 在 nodeOk 检查前就报未知内置模块；npm engines 默认只警告。
- 修复：src/database.js 在 createRequire 加载 SQLite 前统一校验版本，所有入口共用；install.sh/ps1 同步最低版本提示。
- 防再犯：tests/install.test.js 子进程模拟旧 Node，并拦截 SQLite 加载，覆盖安装、守护及直接启动入口；仅改动态导入但不前置检查无效。

### 2026-09-12 SQLite 替代临时 JSON 保存修复
- 最终决策：前述 atomic-write 临时方案已移除，会话管理改用 database.js SQLite，Pi JSONL 保留历史。迁移必须逐文件标记，坏文件修复后可重试；JSONL 缺失跳过恢复，禁止静默创建空会话覆盖记录。
- 防再犯：Node 22.5–22.12 无标志不能加载 node:sqlite，安装要求22.13+（22.x）或24+；Windows 测试清理前须关闭数据库。数据库/迁移/凭据/守护回归及全量275项验证通过（1跳过）。

### 2026-09-12 子任务卡片分隔的旧执行段仍 Working
- 根因：paintCallGroup 只看代理 running 与正文边界，子任务卡片将执行段拆开后，旧段无真实活动也继续转圈。
- 修复：public/app.js 按输出区反向标记后续可见执行段，旧段须有 pending 记录才运行；最新段保留工具间隙等待，折叠策略不变。
- 防再犯：tests/message-activity.test.js 覆盖 delegate 完成、卡片分隔、后续 read、旧工具确实未结束、idle 与快照，不混淆子任务状态和主代理工具完成。

### 2026-09-12 子代理详情吸顶条叠层遮字
- 根因：主会话全局 sticky 规则进入 task-dialog 的有界滚动区，Working 使用 canvas 黑底、thinking 再次吸顶，叠层覆盖正文。
- 修复：public/style.css 在 task-dialog 内取消详情标题吸顶并使 Working 背景透明，主会话不变。
- 防再犯：tests/ui-sticky-check.mjs 真实 Chromium 验证背景、主/子样式隔离、滚动坐标；最小 DOM 不等于完整 app 会话端到端验收。

### 2026-09-12 @ 补全和工作空间搜索匹配不到嵌套文件
- 症状：在输入框输入 `@app` / `@apjs` 无匹配，工作空间根目录只列出 `public/` 这类目录名。
- 根因：`workspace.browse` 与 `files.browse` 的 `query` 只在当前层用 `entry.name.includes()` 子串过滤，既不递归也不模糊；`app.js` 在 `public/` 里，根层永远匹配不到。
- 修复：src/sessions.js 抽出 `fuzzyHit()`/`matchRank()` 与 BFS `searchEntries()`，`query` 非空时递归搜索当前 `path` 子树（跳过 `.git`/`node_modules`/符号链接）、只匹配名称、按匹配质量排序后一次返回（不分页，上限 60 条、目录上限 400）；`workspace.browse` 增加 `query`，前端把 `@` 后最后一段当 `query` 发出。
- 防再犯：tests/session-flow.test.js、tests/workspace-picker.test.js 断言递归与模糊（`appjs` → `src/deep/nested-app.js`）；tests/app.test.js 的 workspace.browse 桩件按 `req.query` 返回根目录没有的 `src/app.js`，保证「根层没有也能命中」这条回归；改搜索前先直连 `Sessions.browse()` 在真实工作空间量耗时，别凭感觉加索引/防抖。

### 2026-09-13 运行中吸底滚动被自己补发的 scroll 事件停掉
- 症状：会话运行中自动吸底会突然停下，之后只能手动滚到最底部才短暂恢复；子代理面板同样如此。
- 根因：onscroll 用 `scrollHeight - scrollTop - clientHeight < 80` 无条件重算跟随。程序补底写入的 scrollTop 要等下一帧的 scroll steps 才派发 scroll 事件，而同步追加的工具记录/流式正文已经把内容撑高超过 80px，事件里的距离是「旧 scrollTop + 新 scrollHeight」，于是被判成用户离开底部；暂停后内容继续增高，用户永远追不上 80px 阈值。
- 修复：public/app.js 的 `readFollow()` 只承认用户意图（wheel/touch/keydown/pointerdown 的 200ms 窗口）与无意图向上位移可以暂停，贴底一律恢复；滚动事件不再参与计算布局。内容增高改由内容观察器（`watchGrowth`/ResizeObserver）兜底补底，覆盖图片解码、折叠展开等不经过 scrollLatest 的路径。
- 防再犯：tests/app.test.js 用带限位的 scrollTop getter 模拟真实浏览器贴底，断言“内容增高后补发的 scroll 事件不暂停吸底”（把 readFollow 改回 `atLatest` 单条件即失败）；tests/autoscroll-ui.py 在真实 Chromium + conversation-preview 里重复同样场景。JSDOM 不限位 scrollTop，写这类测试必须自己限位，否则距离算负、假通过。
### 2026-09-13 供应商未设置协议被表单默认值覆盖
- 症状：选择不设置并保存后显示 OpenAI，再次保存可能误写协议。
- 根因：providerForm 对已有配置和新建模板共用 openai-completions 回退。
- 修复：public/model-manager.js 仅新建使用模板默认值，已有配置缺失 api 回显空值。
- 防再犯：tests/model-manager.test.js 覆盖清除、回读、再次保存、刷新与新建模板；默认值只用于创建，不用于解释缺失的已保存字段。

### 2026-09-13 SQLite 拆表后的事务与失败重试
- 根因：实体删除内部 BEGIN 与会话批量保存嵌套会抛事务错误；增量失败不能靠下一次全量快照补救；懒加载替换元数据对象会漏掉失败改名队列。
- 修复：session-store/sessions 统一同步 SAVEPOINT；pendingWrites 按序重试；ensureLoaded 与关闭先提交元数据失败队列；任务终态不在通知入口重复保存大结果。
- 防再犯：tests/session-persistence.test.js 注入 query_only 与后半段 SQL 失败；recall.test.js 检查撤回与同 ID 子代理事件隔离；task-notifications.test.js 断言终态仅存一次、通知更新只改单任务字段。Windows finally 必须先关闭数据库再删除临时目录。

### 2026-09-13 一致性备份残片与重复迁移读取
- 根因：VACUUM INTO 固定目标失败可能留下残片，existsSync 下次把它当成功备份；先读全部旧 JSON 再检查标记使重启依然随全部旧历史膨胀。
- 修复：session-store.js 临时目标600权限，VACUUM 成功后更名，异常清理；SQL 排除已迁移键，再逐条取旧值，不跨迁移事务持有迭代游标。
- 防再犯：session-store.test.js 注入失败残片、恢复后必须重做备份；重复迁移禁止读取 sessions 源。坏 JSON 错误只报键位，不透传含原文的 SyntaxError。

### 2026-09-13 主库600不代表WAL/SHM已受保护
- 已复现：Linux Node22.23.1，旧 Database 主库600而WAL/SHM644；chmod 晚于连接初始化与建表。
- 修复：database.js 打开连接前用600创建/收紧主库与已有sidecar，保留父目录；新WAL/SHM继承主库600。Windows依赖目录ACL，不能把POSIX测试当Windows隔离证明。
- 防再犯：database.test.js 在POSIX测试首次写入及第二连接收紧旧sidecar，同时检查父目录未变；Windows icacls 检查实际继承主体，不自动改共享目录权限。

### 2026-09-13 维护失败不等于恢复进程已启动
- 症状：service.test.js 偶发 workers 1≠2；rebuild 停止错误已报告但恢复 worker 尚未启动。
- 根因：runOp 先 await state.fail，再 fork/spawnWorker；测试只等 status failed 便读取启动次数。
- 修复：复用 until 等 ready 且 workers=2，再检查严格次数与原依赖未动，不改产品流程或用固定sleep掩盖竞态。测试桩 maint-env 需完整写临时文件后 rename，避免状态读取撞上直接覆写的空/半截 JSON。

### 2026-09-13 ID匹配优化不等于整个历史恢复没有平方扫描
- 已复现：256条消息/重试读取消息65,664次；retry迁移每次map/filter与slice找锚点，compactions逐条find，仍重复扫描全部历史。
- 修复：sessions.js 单次按代理建时间线/锚点后二分查询，压缩按ID索引；同毫秒、倒退、排队编写时间不可靠仍不猜位置。
- 防再犯：session-flow.test.js getter与toJSON计数验证规模上限和最终顺序，不靠易抖动的耗时阈值；不要只审第一个优化后的循环。

### 2026-09-13 取消加载失败的会话不能连带失败
- 根因：cancel直接await item.loading，加载失败传染取消；remove同场景已忽略加载失败后清理。
- 修复：cancel等待加载settle后继续原有未加载返回分支，无SDK时无需再取消，不删除原记录。
- 防再犯：session-persistence.test.js 可控SDK拒绝，验证打开报错、取消完成且库记录仍在。

### 2026-09-13 SDK已撤回后保存失败不能截断网页同步和回执
- 已复现：query_only使事件删除失败，旧代码在裁切messages之前await抛错；无事件时最后persist失败则已撤回但不给用户输入回执。
- 修复：sessions.withdraw先完成内存裁切，再经saveChange提交数组变更，复用单个SAVEPOINT与pendingWrites；失败可见但仍交还输入，后半段失败不允许前半段独立落盘。
- 防再犯：recall.test.js用真实recallLastMessage判定与SDK树桩、真实SQLite只读故障和后半段注入验证回执/网页/重试，不用强制成功的recall桩声称复现真实撤回边界。

### 2026-09-13 摘要缺ID与撤回污染不能混为同一复现
- 根因：memory.onReply先落摘要，Pi message.end回调微任务后才补entryId，崩溃恢复只补了messages；旧探针却绕过真实已回答不可撤回的限制，过度推断污染。
- 修复：恢复构建唯一助手时间戳索引补摘要/触发关联并落盘；同毫秒多条、缺时间、子代理记录不猜不删。
- 防再犯：session-memory.test.js覆盖唯一/歧义/未知/跨代理；涉及模型输出限制必须调用真实pi.recallLastMessage。

### 2026-09-13 配置存在item不等于已传SDK或已持久化
- 已复现：retry自定义词表仅在item和子代理装配处，首次主代理漏传，sessionData.selection也漏存，重启丢失。
- 修复：主代理createAgent传retry、sessionData显式保存；不让默认配置追溯覆盖旧会话。
- 防再犯：session-persistence.test.js串联首次主代理→库selection→重启主代理→子代理，不能仅断言item字段。

### 2026-09-13 基准必须测真实变化并等待子进程完整退出
- 根因：合法JSON可掩盖后续非零退出，exit时stdout未必排空；同值通知写入及错误的进度数组让新旧工作量不一致，旧字节计量漏绑定键；锁实验把进程启动算入持锁等待。
- 修复：sqlite-benchmark.mjs在close后同时要求退出码0与合法JSON，计量单点化含绑定键；使用真实快照及每次变化的通知/计时字段，victim连接就绪后经IPC才开始测锁。
- 防再犯：self-check验证失败判定，保留原硬门槛；绑定字节不是磁盘写入量，空历史fake SDK不能证明历史扫描复杂度，另用session-flow getter计数回归。

### 2026-09-13 CAS不能另开硬编码权威库，并发测试不能猜时序
- 根因：按home另开连接绕过传入Database及权限配置；JSON.parse错误泄露坏值片段；固定sleep不能保证两个进程已读同一旧值。
- 修复：pi-model-storage复用权威连接并固定解析错误；并发helper在捕获旧值后停住，父进程写完才放行，确定性拒绝旧CAS；close后检查结果，finally先终止子进程再关库清理。
- 防再犯：测试非默认数据库文件名、三类坏JSON、模型/收藏/凭据三条跨进程路径；CAS仅保护权威，派生文件跨await仍可能陈旧。

## 2026-09-13 历史模型恢复与目录口径
- 症状：切换旧会话报 Unknown model。恢复误用仅可用目录，未鉴权但定义仍存在的模型被拒绝；UI 缺失选项会静默落到第一项。
- 修复：sessions/pi 恢复按完整模型定义保留原模型，新建仍仅可用；app 为缺失选项保留占位，配置回执按会话与序号隔离。model-runtime-catalog/session-model-restore/app 测试覆盖。
- 注意：配置页模块引入 auth 子模块后，所有 JSDOM eval harness 必须先装载 auth 并剥除静态 import；模型 dirty 对比需两侧同样规范化。
### 2026-09-13T17:36:36.164Z 子代理重试不能使用混合消息计数定位
- 根因：重启仅重建主代理 JSONL，子代理 messageCount 越界后显示未知；已持久化 agentId 实为 taskId。
- 修复：public/app.js 共享归位函数按任务 ID 放到任务说明后，元数据迟到自动移出未知归档；复用既有 SQLite 关联，不恢复整段子消息。
- 防再犯：tests/message-activity.test.js 覆盖无子历史、越界/缺失位置、多任务、多重试及迟到元数据；主代理消息/压缩定位保持原有回归。

### 2026-09-14 后台化服务命令的三个陷阱：fork IPC、SIGHUP、CLI 无参数语义
- 症状：用户报 `axiom` 前台常驻、关掉终端窗口页面就「连接已断开」；`axiom-setup` 跑完不返回终端；`AXIOM_PORT=abc` 只报一句 `Invalid URL`。
- 根因：①CLI 无参数直接 `supervise()` 前台常驻，终端关闭时 SIGHUP 发给整个前台进程组，守护进程与 worker 一起死；②`fork()` 建立的 IPC channel 会让父进程不退出，`child.unref()` 只 unref child handle，管不到 IPC channel；③端口只 `Number()` 不校验，坏值一路走到 `fetch` 才抛。
- 修复：`axiom` 默认 `spawn(process.execPath, [service.mjs, "--foreground"], {detached:true, stdio:"ignore"})` 后轮询 `/health` 再返回，前台保留为 `axiom --foreground`；子进程**必须显式带 `--foreground`**，否则无参分支会再调一次 `startBackground` 无限派生；`localPort()` 统一解析并对坏值早报错。
- 防再犯：①`localPort()` **必须接受 0**——`tests/service.test.js` 一直用 `AXIOM_PORT=0` 当「不监听真实端口」的哨兵，且 `installTag("http://127.0.0.1:0", root)` 直接依赖该字面量；②改 CLI 默认分支前先 grep 测试怎么 spawn 这个入口，`service.test.js` 的 `startDaemon` 依赖前台管道，后台化后必须改传 `--foreground`；③日志与数据路径一律走 `homeDir()`，不要再硬编码 `join(homedir(), ".axiom")`，否则 `AXIOM_HOME` 场景下提示的路径是错的。

### 2026-09-14 惰性落盘的路径不能入库
- 症状：新建会话、没说一句话就重启，之后这条会话永久报「会话历史文件缺失，已保留数据库记录」，且该文件永远不会被创建；重装/换版本都不管用（坏记录已在 axiom.db 里）。
- 根因：Pi 的 `SessionManager` 惰性落盘——`create()` 就确定了 `sessionFile`，文件要等第一条消息才写。`sessionData()` 直接 `item.agent.sessionFile()` 入库，于是「新建→未发言→重启」就造出一条库里有路径、磁盘无文件的记录，`ensureLoaded()` 的 `existsSync` 检查从此永久拒绝加载它。
- 修复：新增 `landedSessionFile(item)`（文件真实存在才返回路径，否则 null），落库与 `list()` 共用；前端本就按 null 渲染「发送首条消息后生成」，口径一致。
- 防再犯：①**不要**放宽 `ensureLoaded()` 的严格语义去自动创建空 JSONL——`tests/session-migration.test.js` 的 ghost 用例要求「不创建空 JSONL、逐字节保留库记录」，这是为同步盘/外置盘临时不可用时能等文件回来；②判断“能否入库”只看文件在不在磁盘上，不要用“有无任务/摘要”之类启发式去猜会话是否为空，猜错等于静默丢数据；③修复前已写坏的库记录没有安全判据可自动清理，只能让用户删该会话。

### 2026-09-14 子代理入口与恢复必须各有稳定关联
- 症状：任务入口堆在最终回答后；重启只有最终结果，没有子代理过程且不能续跑。
- 根因：入口未按 delegate 的 toolCallId 归位，snapshot 兜底追加到末尾；子代理未传 sessionDir 使用 inMemory；正常停机与用户取消共用 cancel。
- 修复：public/app.js 严格按委派工具归位并拆分折叠区；sessions.js 为子任务配置独立 JSONL 目录并按 task ID 重建消息；tasks.js 区分 interrupt/cancel，重试沿用原 ID 与上下文。
- 防再犯：惰性 sessionFile 路径与 historySaved 分开保存，已落盘文件缺失时不重新执行；完成通知保存 resultId 快照，重试后不能将新结果标成旧通知已送达；没有委派锚点不猜上一条主消息。

### 2026-09-14 前端启动链的单点失败会放大成整页断连
- 症状：一条坏会话（历史文件缺失/目录被删）让页面永远「连接已断开，正在自动重连」，其余会话也进不去；删掉那条库记录后立刻恢复。
- 根因：`public/app.js` 启动时（URL 无 sessionId）只 attach `sessions.list()` 的第一条且没有 try/catch；`session.attach` 抛错冒到外层 catch → `error()` + `ws.close()` + `scheduleReconnect()`，重连再走同一段，形成死循环（退避至 15s）。`sessionId` 分支与 `switchSession()` 有降级，唯独这条漏了。
- 修复：逐条尝试 attach、失败跳过；有可用会话时只 `console.warn`，全失败才 `error()`；末尾 `if (!state)` 新建兜底。服务端 `ensureLoaded()` 的严格报错保持不动。
- 防再犯：①启动链里**任何** `request()` 的失败都必须在链内消化，绝不冒到最外层 catch（那里会关连接并安排重连，等于把单点故障升级成全页不可用）；②新增「按列表取第一条」这类代码前先问：这条坏了会怎样？③JSDOM harness 里跨 realm 的对象不能直接 `assert.deepEqual`（原型不同），先 `{...obj}` 摊平再比；④断言别放错 harness——`tests/app.test.js` 里有两套同风格的 harness，文件末尾那段的 `$`/`sockets` 属于第二个。

### 2026-09-14T03:10 默认全部能力导致可选 MCP 阻断会话
- 根因：初始 capabilities=null 表示全部，且 pi.js 在检查选中服务之前导入适配器入口。
- 修复：初始主/子选择显式空集合；pi.js 按 MCP 选择控制 loadAdapter，不删除用户配置、不要求补装插件。
- 防再犯：测试有坏插件时空选择仍可加载、默认为空、显式全部仍保持旧语义；基础内置工具保留。

### 2026-09-14 重试词表持久化成功但重开不可见
- 根因：retryChipList 恢复 state 后未首次 render，重复词被去重清空输入，看似保存丢失。
- 修复：public/app.js 返回组件前 render。
- 防再犯：保存回执之外必须测关闭重开和整页刷新后的可见标签；实际 HTTP 静态资源不等于磁盘 HEAD。tests/retry-settings-ui.py 走真实浏览器和服务链路。

### 2026-09-14 用户换行与回答分区
- 用户消息不应走 Markdown/HTML 解析：textContent + pre-wrap 保留输入并避免标签被当成元素。
- axiom_answer 只改展示，不改历史；代码中的同名标签不解析，未闭合回答保留正文，旧历史无标签不隐藏唯一答复。
- 回归：tests/answer-tags.test.js、memory-ui.test.js、stream-renderer.test.js。


### 2026-09-14T08:03 思考耗尽额度后空白终止
- 根因：length 满额默认终止，空白正文缺少有限纠偏路径。
- 修复：src/retry.js 对末尾无正文、无工具调用的 length 自动恢复一次，保留工具结果、临时短提示，恢复再失败停止。
- 防再犯：tests/retry.test.js 覆盖成功、重复截断、网络错误/抛异常、取消和提示恢复，不将工具参数错误猜成系统故障。

### 2026-09-14 提问自定义输入换行裁切
- 根因：rows=1 未自动增高，且继承全局 textarea max-height:240px。
- 修复：question.css 显式 line-height/max-height/overflow；question.js 挂载与输入时按 scrollHeight 加边框测高，缓存题面最大高度防切题跳动，宽度变化保留选区。
- 防再犯：tests/question-layout-ui.py 真实 Chromium 检查超过240px、长词、切题、375px宽度、删除缩回和会话草稿恢复。

### 2026-09-14 取消提问不能直接普通continue
- 根因：取消已产生错误toolResult，continue不会直接重新执行question；SDK还可能在末尾附加空error assistant。
- 修复：pi.js 识别尾部取消question，以新调用编号追加原题并直接执行，结果写入JSONL和内存并发出UI事件；Sessions.retry按canReask路由。
- 防再犯：真实SDK测试确认重开不发模型请求、再次取消可恢复、回答才续跑；不得重复原toolCallId结果或回退丢其它工具记录。

## 2026-09-14：工作空间技能勾选后没有保存

- 症状：旧目录记录只含部分字段，新能力选择被忽略。
- 根因：保存遍历已存对象的键，而非允许的 selection schema；项目技能另存旁路增加读写不一致。
- 修复：sessions.js 按 schema 接收补丁、旧 projectSkills 合并到完整目录 selection，落盘后更新内存；capabilities.js/server.js 按来源隔离全局与项目资源，app.js 不把目录外能力补成选项。
- 防回归：project-skills.test.js 覆盖缺字段记录、新勾选、重载、目录别名与跨目录拒绝；capabilities.test.js 验证 MCP/插件来源与目录刷新；默认配置生效无需重启。

### 2026-09-14 前端公共模块漏注册导致永久连接中
- 症状：health 正常，页面显示但一直连接中。
- 根因：d99efdc 的 markdown-scan.js 被标签模块静态导入，server assets 未注册，404 阻断 app.js 执行；本地文件测试加载器绕过 HTTP 未发现。
- 修复：src/server.js 补路由，tests/server.test.js 验证标签模块和扫描模块 HTTP 200、JavaScript MIME 及缓存。
- 防再犯：新增或抽取浏览器模块时检查传递依赖路由，不以磁盘 import 成功替代 HTTP 验证。


### 2026-09-15 单个子任务卡住缺少定点取消入口
- 症状：无超时工具迟迟不返回，append 只能排队，主代理无法只中断该任务。
- 修复：src/tools.js 注册 cancel_task，src/tasks.js 定点 abort 并沿用终态/通知流程；不设置整会话 cancelling，不回滚已发生副作用。
- 防再犯：任务测试覆盖启动竞态、兄弟隔离、重复取消与未知ID，Sessions 集成验证终态先落库、主轮结束后通知可读。取消回执不得作为 Goal 验收证据；无默认超时和 Goal 强停退化为暂停另行处理。

### 2026-09-15 安装健康不等于会话可用：压缩 off 阻断首次启动
- 根因：部分推理模型 thinkingLevelMap.off=null，默认压缩 off 被严格模型校验拒绝；页面把 session.create 业务失败当断线循环。
- 修复：protocol.resolveCompaction 统一保留合法偏好、不兼容取模型最低支持等级，pi/sessions 共用；页面保留连接、草稿与设置/更新入口。
- 防再犯：model-onboarding.test.js 用真实 SDK 和隔离目录验证 reasoning-only 默认新建，不能只验证 /health；model-onboarding-ui.test.js 验证配置失败仍能进入和修复重试，真实网络断线仍重连。

### 2026-09-15 正文滚动不应收起模型菜单
- 症状：无关输入触发菜单重建，正文滚动关闭已打开菜单。
- 根因：controls 全量同步和 model-picker 捕获所有外部 scroll。
- 修复：app 按区更新；picker 比较目录/收藏签名，仅触发器滚动祖先滚动才关闭。
- 防再犯：frontend-regions-ui.py 要求菜单一直打开且节点/焦点/scrollTop 不变，不允许关后重开替代；迟到设置预算及权威归并失败不推进 seq 另有可运行断言。
### 2026-06-01：快照回执到渲染间的事件空窗
- 症状：快照覆盖先到的实时正文；归并失败后水位提前推进。根因：旧 app.js 仅在渲染时建闸、先记 seq 后归并。
- 修复：public/transport.js 在快照回执时建闸、成功归并后记水位；失败受控恢复；public/app.js 在断线时作废旧分片。tests/realtime-transport.test.js 与 snapshot-first-screen.test.js 防回归。


### 2026-09-15 页窗口的附属记录必须保留身份和生命周期
- 症状：工具结束覆盖调用参数、旧页冒出重试入口、页外旧子代理追加到尾部、压缩消息没有阅读锚点。
- 修复：sessions.js 合并 tool.state；app.js 只在最新页给末尾重试入口，仅追加未落位的活动子代理，折叠消息绑定压缩卡片节点。
- 防再犯：session-history 与 history-reading 回归覆盖跨页工具参数、旧页重试、子代理状态和压缩卡片锚点。
## 2026-09-16 macOS 跳过签名导致资源封印失效
- 症状：Gatekeeper提示已损坏，codesign报code has no resources but signature indicates they must be present。
- 原因：electron-builder禁用自动证书发现后跳过签名，重打包的应用不能沿用原Electron签名；DMG校验与独立后端测试不覆盖.app资源签名。
- 修复：dev构建显式identity=-，用打包器完成ad-hoc签名；发布门禁加入codesign --verify --deep --strict和真实Electron窗口冒烟。
- 边界：ad-hoc仅保证包内一致性，不等于Developer ID或公证，不保证带下载隔离标记的Gatekeeper放行。CI 35063188663已验证严格签名、窗口启动与安全退出。

## 2026-09-16 多分支接线的静默自动合并
- 症状：WS 图片请求超时、旧历史页收到运行状态时归并失败。
- 根因：自动合并丢失 loaded snapshot 的 sessionId；历史分支残留 controls()，分区分支已删除该函数。
- 修复：src/sessions.js 恢复身份；public/app.js 调用 updateAvailability。未加载只读历史也遵循分页和页外元数据裁剪，server attach 不初始化SDK。
- 防再犯：tests/history-reading.test.js、session-history.test.js 增加跨功能回归；合并完成须跑全量而非仅各分支测试。

### 2026-09-16 展示页预算阻断实时事件并关闭子代理弹窗
- 症状：发送不显示、需刷新、60条后全量重建、子代理弹窗消失。
- 根因：receiveHistoryEvent 把 historyLoading 和60条预算当作停绘条件，latestHistory 重建了所有节点。
- 修复：public/app.js 实时持续追加，before游标前插历史且保留节点/草稿/锚点；跨页结果先到时将已有工具详情移回调用位置；public/stream-renderer.js 折叠过程按需绘制。
- 防再犯：continuous-history 回归覆盖80条实时消息、打开弹窗、在飞历史期间输入和首屏补齐；continuous-ui.py 实测Chromium滚动补偿。历史响应不得提交实时seq。

### 2026-09-16 前插历史必须同步辅助记录与锚点顺序
- 原因：只前插DOM但 mainItems 仍push到尾，重试取at(-1)错位；ctx.restoreRetries为空且未合并历史compactions。
- 修复：新历史主消息数组放在已有数组前，合并压缩记录并按页内边界恢复重试；history-prepend-records回归。

### 2026-09-17 恢复重排与 session.duplicate 的交互
- 原因：duplicate() 走 create() 恢复路径，messages 从独立 JSONL 重建时应用 orderRestoredHistory；测试夹具的子任务由 saveTask 直接落库、主历史无 delegate toolResult 锚点，无关联子消息按设计前置到头部。
- 修复：这不是回归而是新语义在副本路径的自然延伸——断言更新为 [s1,s2,u1,a1]，并补 at(-1)=main（无锚点副本最后仍是主回答）；带真实 delegate 锚点的会话子历史仍归位到声明处。
- 防再犯：改 duplicate/恢复顺序断言前先确认夹具是否有委派锚点；orderRestoredHistory 只在 restoredFromJsonl 为真时生效，旧快照 messages 保序（保护 retry messageCount 下标）。
