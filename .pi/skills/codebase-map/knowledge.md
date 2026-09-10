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
