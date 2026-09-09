# Axiom

多智能体协作的可靠基础。独立 Node.js 服务，通过 Pi SDK 运行主 Agent，以 `delegate` 并行启动子 Agent、以 `read_result` 读取结果，通过 WebSocket 输出实时事件。

## 启动

需要 Node.js >=22.5，以及已配置好凭据的 Pi。服务读取本机 Pi 凭据，但不自动加载扩展、Skills 和提示词模板；会加载工作目录的上下文说明。主 Agent 和子 Agent 都使用 Pi 默认编码工具（read/bash/edit/write），只有主 Agent 额外获得两个委派工具。

```powershell
npm ci --ignore-scripts
$env:AXIOM_CWD = 'F:/your-project'
# 可选，建议明确指定；不指定时选择首个已认证模型
$env:AXIOM_MODEL = 'provider/model'
# 可选，默认 4319
$env:AXIOM_PORT = '4319'
npm start
```

本次本机启动使用 `.env.local` 保存工作目录（已忽略，不要提交或共享），日志为 `axiom.log`，PID 为 `.axiom.pid`。手动重新启动可执行 `node --env-file=.env.local src/main.js`；先停止已有进程，避免端口冲突。

服务仅监听 `127.0.0.1`。健康检查 `GET /health`，WebSocket `/ws`。无需令牌。本机网页自动连接，服务校验 Host 和浏览器 Origin，拒绝其他网站跨站连接。本机进程可直接访问。不要公开部署到网络。工作目录不是沙箱，Agent 可以执行命令和修改文件。

## 输出渲染与性能

流式更新只处理发生变化的消息，每帧合并一次；思考不再触发正文 Markdown 重绘，折叠思考按需渲染。折叠子任务仅收集文本，不调度动画帧、不解析 Markdown，展开时一次显示完整结果（包括历史恢复与最终消息）。Markdown 按块比较，保留未变化的 DOM，仅对变化块解析、清理并替换；仍完整词法分析以正确处理后出现的引用定义。超长单个段落/代码块仍需重算该块，不保证恒定开销。

自动滚动请求合并，切换会话清理待绘制任务；删除重复任务恢复、单连接多订阅容器和重命名时的整份历史复制。静态资源启动时读取并生成 ETag，浏览器刷新时重新校验，未变化返回 304，不重复传输正文；更新静态文件后需重启服务。`public/stream-renderer.js` 独立负责渲染调度，`markdown.js` 负责安全块渲染。

运行 `node tests/benchmark.js` 可复现 CPU/DOM 微基准。浏览器同机 3 个约 4KB 输出区 × 60 次更新，三次中位数从 391ms 降至 148ms（约 -62%）。这不是模型生成速度或真实端到端延迟指标。新增折叠任务场景：3 个任务 × 60 次更新，展开时 60 帧 / 180 次 Markdown 解析，折叠时 0 帧 / 0 次解析；完整内容保留，展开后按需呈现。

## 布局

左侧固定工作空间和会话列表，提供搜索、今天/昨天/更早分组、最近活动排序、重命名和删除。侧栏可收起；手机端覆盖主区而非挤压内容，点击遮罩或 Esc 关闭，打开时主区不可交互。主区只滚动消息，输入区常驻底部；运行时发送按钮替换为停止，空白输入与断线时禁用发送。切换会话保留页面内草稿、输入框高度和滚动位置，浏览器记住上次选择的会话 ID。页面内断线保留可阅读的消息与可编辑草稿，点击「重新连接」后恢复；刷新页面仍不保存草稿。子任务详情折叠显示；历史恢复时按首条子任务消息的位置放回对话，不再全部堆到用户请求之前。空会话显示简短欢迎内容。

本次先完成布局，未接入磁盘历史：服务重启后会话仍丢失。已确认 Pi 提供原生 SessionManager 文件机制，持久化和中断恢复需要后续独立验证，不以浏览器记住 ID 代替真正持久化。

## 网页入口

打开 http://127.0.0.1:4319/，自动连接，无需令牌。首页采用克制的暗色界面（背景 #101114、面板 #17181c、强调 #717de5），统一文字层级、边框、留白和输入区焦点提示，提供空态及任务状态反馈。原生 HTML/CSS/JS，无前端构建，不添加字体、图标或组件依赖。

支持供应商、模型、思考程度选择，任务输入、停止、新会话和实时思考/回答/委派状态。支持会话列表（切换、新建、删除）和工作空间路径输入/历史目录选择，会话按目录筛选；切换不取消后台任务。已有会话目录固定，子 Agent 继承父会话目录。供应商、模型与思考选项位于发送按钮左侧，选择控件按内容宽度保持单行，桌面统一 32px 高度、手机 40px 触控高度，深灰表面与箭头；支持原生可样式化下拉菜单的浏览器使用统一暗色选项面板，其他浏览器回退原生菜单，窄屏仅选择区横向滚动，发送/停止按钮始终可见。任务输入框位于执行记录下方；Enter 发送，Ctrl/Cmd+Enter 或 Shift+Enter 换行，中文输入法选词不触发发送。Esc 优先关闭手机侧栏，否则停止当前会话任务。思考正文使用斜体；回答通过 marked + DOMPurify 安全渲染 Markdown，覆盖流式、最终消息与历史恢复。目录来自已认证 Pi 模型；思考选项来自当前模型实际支持的等级。配置应用于主会话，之后启动的子任务继承配置。刷新自动连接。页面内断线重连可恢复原会话；刷新后加载服务端会话列表，可重新选择会话。服务重启仍不保留内存会话。

新增协议：`sessions.list` 返回内存会话列表；`session.create` 可传 cwd（校验目录存在）；`models.list` 返回模型目录；`session.configure` 接收 sessionId、model（provider/id）与可选 thinking，返回实际配置和支持等级。运行中不可切换模型。静态资源位于 public/。

## 协议

每个命令必须有请求 `id`；响应为 `{type:'response', id, ok, data?, error?}`。

```javascript
const ws = new WebSocket('ws://127.0.0.1:4319/ws', ['axiom']);
ws.onmessage = ({ data }) => console.log(JSON.parse(data));
ws.onopen = () => ws.send(JSON.stringify({id:'1', type:'session.create'}));
// 从响应 data.sessionId 取得会话 ID 后发送：
// {id:'2', type:'prompt', sessionId, text:'并行检查两个模块，读取结果并总结'}
// {id:'3', type:'session.attach', sessionId}  // 重连，返回快照并订阅
// {id:'4', type:'tasks.read', sessionId, taskIds:['...'], wait:false}
// {id:'5', type:'cancel', sessionId}          // 取消主 Agent 与当前子任务
// {id:'6', type:'session.close', sessionId}   // 释放会话与结果
```

`session.create` 自动订阅；断开连接不取消任务。重新 attach 返回状态、历史消息、当前流式消息、工具状态、任务结果与序号。快照后按事件 seq 接续，不要重复追加快照之前的内容。服务不保存每个增量的回放日志。

事件包含 `sessionId`、`seq`；Agent 事件包含 `agentId`，子任务另有 `taskId`、`parentAgentId`。类型为 `session.state`、`agent.message.start/end`、`agent.delta`、`tool.state`、`task.state`、`error`。`agent.delta.data` 的 `type/contentIndex/delta` 对应内容块增量；thinking 是否可见取决于模型。`tool.state.data.partialResult` 为累计结果，替换展示而非追加。`agent.message.end` 的完整消息为最终事实。

主 Agent idle 不代表所有子任务完成，使用 task.state 判断子任务。任务 ID 只在其所属会话中有效。本机客户端能访问所有会话。

## 委派工具

- `delegate({tasks:[{task:'任务 A'},{task:'任务 B'}]})`：并行启动，立即返回 `{taskIds:[...]}`。
- `read_result({taskIds:[...],wait:true})`：等待并返回各任务结果；`wait:false` 查询当前状态。重复读取保留结果，失败与成功分别返回。

无固定并发上限、任务超时、只读限制或结果截断。子 Agent 没有递归委派工具。并行修改同一文件可能冲突，应让主 Agent 分配不同文件，或使用不同工作目录/worktree。取消不回滚已发生的文件修改，不自动重试委派任务。

## 模块边界

```text
main.js     配置与组装
server.js   HTTP / WebSocket / 鉴权
protocol.js 请求校验
sessions.js 主会话、订阅、快照、取消
  tools.js  两个工具的参数和适配
  tasks.js  子任务状态、并行执行、结果
pi.js       Pi SDK 创建、事件适配与释放
```

任务状态只归 tasks 管理，工具不保存另一份状态；传输层不直接调用 Pi SDK。采用原生 JavaScript ES modules 和 Node 测试工具，不增加编译步骤或工作流框架。

## 验证和运行边界

```sh
npm test           # 含页面交互、断线恢复、折叠渲染及静态资源缓存回归
node tests/benchmark.js # CPU/DOM 微基准，不代表模型生成速度
node tests/smoke.js  # 真实模型验证，会产生模型调用费用
```

当前状态、结果、会话都在内存，进程重启后丢失，不自动续跑。会话需显式关闭以释放历史与结果；长期服务需监测内存。发送缓冲过大时断开慢客户端，重新 attach 获取快照；不静默丢正文。单条 WebSocket 输入上限 1 MiB，属于网络输入保护，不是任务数量限制。

当前为前台 Node 服务，不含操作系统开机自启或自动拉起配置。使用 SIGINT/SIGTERM 正常关闭时取消并清理所有会话；强杀进程没有完成清理的保证。
