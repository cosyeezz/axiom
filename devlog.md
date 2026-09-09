# 开发记录

## 2026-09-09 — Axiom 独立服务

- 按用户要求在当前空间新建独立项目，不接入 MyWorkbench，不改其依赖、代码和文档。
- 实现 Node HTTP/WebSocket 服务、Pi SDK 适配、主会话、并行任务、delegate/read_result 两个工具。
- 使用原生 JS 模块与 Node 测试，省去构建环节；模块按传输、会话、任务、工具、Pi 适配分开。
- 无任务并发上限、超时、只读或结果截断；保留鉴权、输入校验、取消传播和慢连接保护。
- 会话与连接分离，重连使用快照；数据仅内存，重启不恢复。未配置系统服务、自启动或进程自动拉起。
- 验证：3 项自动测试通过；真实模型完成主 Agent -> delegate -> 两个子 Agent -> read_result -> 汇总；本地 HTTP 健康检查通过。
- 涉及文件：src/*.js、tests/*、package.json、package-lock.json、README.md、.gitignore。本机 .env.local、日志和 PID 文件不纳入版本管理。

## 2026-09-09 — Linear 网页入口

- 新增 public/ 输入页、模型/供应商/思考等级选择、流式输出。
- 修改 pi、sessions、protocol、server：提供模型目录、配置入口和子任务配置继承。
- 验证：自动测试、真实服务模型目录与思考配置、首页 HTTP 200、浏览器导航。
- 同步 README；未新增前端依赖。

## 2026-09-09 — 输入框下移

- 按用户要求将 public/index.html 的任务输入框移动到执行记录下方，保持原有交互；同步 README。
- 验证 HTML 元素顺序并重启服务加载页面。

## 2026-09-09 — 本机免令牌
- 按用户要求移除令牌配置、输入与认证；页面自动连接，仅保留本机 Host/Origin 检查。
- 更新 main/server、页面、README 和连接测试；4 项测试通过。

## 2026-09-09 — 输入快捷键与思考样式
- Enter 发送，Ctrl/Cmd+Enter 换行，保留 Shift+Enter 换行；中文输入法选词不触发发送。
- 思考正文改为斜体；涉及 public/app.js、index.html、style.css。

## 2026-09-09 — Markdown、会话、工作空间及输入栏
- 统一正文 Markdown 渲染，使用 marked 和 DOMPurify，测试格式与脚本清理；保留思考斜体。
- 增加会话列表、新建/切换/删除，工作空间目录选择，子任务继承目录。
- Esc 停止；模型/供应商/思考选择放到发送左侧。
- 涉及 public/*、src/{pi,sessions,server,protocol}.js、依赖与测试、README。
- 5 项测试通过，浏览器确认页面自动连接、模型和会话显示、Markdown 表格及按钮布局。

## 2026-09-09 — 输入工具栏单行
- 标签与选择框横排，发送区不换行；窄屏横向滚动，避免挤成两行。涉及 public/style.css。

## 2026-09-09 — 会话工作台布局
- 重写布局与样式为左侧会话导航、独立消息滚动、底部常驻输入区，保留 Linear token。
- 增加搜索、日期分组、活动排序、重命名，页面内草稿/滚动恢复，子任务折叠展示。
- 验证 5 项测试、浏览器输入区位置固定且无横向页面溢出。
- 本次未交付磁盘历史；确认 Pi 原生 SessionManager 可用于后续持久化，README 明确当前边界。

## 2026-09-09 — 用户消息去角色标签
- public/app.js 隐藏用户消息的“你”标题，保留消息正文及样式，覆盖新消息和历史恢复。

## 2026-09-09 — 模型选择工具栏协调
- 浏览器检查发现模型框被 flex 拉伸至 530px，取消强制填充，改为内容宽度、32px 等高控件。
- 统一深灰表面、细边框、箭头与思考标签；支持浏览器原生可样式化下拉面板，保留不支持时的原生回退。
- 涉及 public/style.css、public/app.js；浏览器验证四个控件同一水平线、等高，截图验证工具栏和模型菜单。

## 2026-09-09 — 代码复核与渲染性能
- 阅读 src/public/tests 全链路，删除全 live 重绘、思考触发正文重算、重复任务恢复、多订阅 Map 和重命名全快照复制。
- 新增 stream-renderer.js：仅 dirty 消息按帧更新、折叠思考延迟显示、展开后追加 Text 节点；切换清理待绘制。
- Markdown 保留未变块 DOM，完整 lexer 保证引用/列表等语义，保留 DOMPurify。
- 合并滚动、并发列表请求，修复旧会话发送回执清空新草稿与 Windows 路径显示/匹配；子任务模型直接初始化，非法思考配置回滚。
- 源码统一格式化，未增加运行依赖。新增 tests/stream-renderer.test.js、tests/benchmark.js，扩充 Markdown 回归。
- 验证 6 项测试、npm audit 0 vulnerabilities；真实浏览器模型输出标题/列表/代码块通过。浏览器微基准中位数 391ms -> 148ms；Node/JSDOM 同负载 2603ms -> 298ms，仅作渲染微基准。
- 仍保留内存会话；持久化、超长单块增量解析不在本次实现。
