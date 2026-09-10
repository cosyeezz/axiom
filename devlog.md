# 开发记录

## 2026-09-10 — 设置左侧分类与内联默认会话配置
- 在 feat/settings-inline 独立 worktree 实施。设置增加左侧唯一分类「默认新会话设置」，右侧保留当前主/子 Agent 供应商、模型、思考与 Skills/MCP/Extensions 明细，直接在其下编辑默认配置，不打开二级弹窗。
- 复用原有 create-form 和主/子选择器，在默认设置与自定义新会话之间移动同一表单；补充模型支持的思考等级以及子代理模型/能力分别跟随主代理。能力 inherit 与全部 null 明确区分，子任务使用主代理实际能力，不扩大选择。
- 新增 thinking/subagentThinking 默认值、子能力解析快照和协议校验；默认保存只影响后续普通新会话，保留服务内存生命周期和原信任边界。清单表示配置/加载能力，不声称已经调用。
- 验证：npm test 9 项通过，覆盖内联表单不打开二级弹窗、保存思考与能力跟随、刷新恢复、自定义入口隔离和子任务实际继承；Pi 工厂模块导入及 git diff --check 通过。
- 涉及 public/{app.js,index.html,style.css}、src/{pi,protocol,sessions}.js、tests/{app,config}.test.js、README.md、devlog.md。

## 2026-09-10 — 可配置默认新会话，复用自定义会话组件
- 在独立 worktree F:/worktrees/MyWorkbench-default-new-session（feat/default-new-session）实施。「新会话 · 全部能力」更名为「新会话」，设置中增加默认新会话入口，可独立配置主/子模型与 Skills、MCP、插件的全部或自定义能力（含空选择）。
- 两种配置直接复用原有弹窗、createAgentPicker 和加载/提交数据组装；协议共享选择字段，保存与创建共用 validateSelection，不新增依赖、组件副本或配置服务。默认配置和最近主模型/思考回退值分开，防止调整当前会话覆盖显式默认配置。
- Sessions.create 统一合入默认值，覆盖所有普通创建入口；自定义入口明确 useDefaults:false，保留当前模型和初始全部能力的原行为。保存默认不创建代理、不改已有会话；省略字段保留，null 恢复默认/全部，失败保留旧值。沿用服务内存生命周期，刷新/重连保留，重启重置，不写 Pi 设置。
- 默认配置不保存目录信任；保存和实际创建均校验目录/模型/两组能力，所选能力在其他目录不可用时拒绝创建，编辑保留并标记缺失项，不静默扩大或清空选择。原有自定义会话级信任流程保持不变。
- 验证：npm test 9 项全部通过，扩充默认配置保存/继承/覆盖/重置、主子与已有会话隔离、失败回滚、协议校验、WebSocket 重连和真实页面处理器回归。Playwright 使用独立 4323 测试服务与模拟代理，验证保存不新建、普通创建应用空能力和固定模型、自定义仍全部、刷新恢复、Escape 返回设置及焦点；320/390/700/1440px 页面和弹窗均无横向溢出。无付费模型调用。
- 涉及文件：public/{app.js,index.html,style.css}、src/{sessions,protocol,server}.js、tests/{app,config,server}.test.js、README.md、devlog.md。

## 2026-09-10 — 默认完整能力与自定义主/子代理新会话
- 在独立 worktree F:/worktrees/MyWorkbench-agent-capabilities（feat/agent-capabilities）实施。新增默认全部能力、自定义新会话两个入口；弹窗复用模型选择样式，主/子代理分别选择供应商/模型和 Skills、MCP、插件多选清单。
- 复用 DefaultPackageManager/loadSkills/DefaultResourceLoader，不重写插件扫描或 MCP 协议；MCP 通过已安装适配器独立 config 快照过滤。增加直接依赖 jiti 2.7.0（与 SDK 已使用版本一致），用于导入 Pi 全局 npm 目录中的 TypeScript MCP 适配器及其配置解析器，并映射到当前宿主 SDK。
- 默认遵守 Pi 已启用配置和目录信任；未信任项目仅全局加载，自定义可明确授予会话级信任。配置快照不写回用户设置。插件按选择加载而非加载后隐藏；主/子模型运行时独立，接通 session_start/session_shutdown，避免 MCP 连接泄漏。无 TUI 组件桥，需审批的操作不自动放行。
- 新增 capabilities.list 与 session.create 能力字段，创建前校验两类代理选择；快照保留模式/选项、实际工具名和加载提示。能力创建时固定，模型继续使用现有设置机制。修复插件指令无模型回答被误报失败，以及子任务清理异常导致状态不发布。
- 验证：npm test 9 项通过，含目录信任、未选插件不执行、配置不写回、未知 ID 拒绝、主子隔离、页面多选/模型提交/失败保留。真实 SDK 无付费模型调用检查：默认包含基础工具、4 个网页工具及 mcp/mcpScript，空选择仅基础工具，关闭均正常。Playwright 验证自定义成功创建及摘要，390px 手机宽度页面/弹窗无横向溢出。
- 涉及文件：src/{capabilities,pi,sessions,tasks,protocol,server}.js、public/{index.html,app.js,style.css}、tests/{capabilities,app}.test.js、package{,-lock}.json、README.md、devlog.md。

## 2026-09-09 — 新建会话继承最近主代理配置
- 在独立 worktree MyWorkbench-session-defaults（feat/session-defaults）实现，解决新建会话总是恢复启动模型、需要重复选择的问题。
- Sessions 统一记忆最近成功变更的主模型与实际思考等级，所有新建入口（含切换工作空间时创建）沿用；已有会话不变，子代理覆盖仍按会话独立。
- 仅子代理变更、读取旧会话或配置失败不覆盖默认值；采用服务内存保存，不新增持久化文件，服务重启后恢复启动配置。
- 验证：npm test 7 项全部通过；补充新会话继承、已有会话隔离、失败和子代理变更不污染默认值的检查，git diff --check 通过。
- 涉及文件：src/sessions.js、tests/config.test.js、README.md、devlog.md。

## 2026-09-09 21:00 — 统一设置入口与子代理配置迁移
- 在独立 worktree MyWorkbench-agent-settings（feat/agent-settings）实施；删除侧栏底部运行时标语，改为「设置」入口，采用常见的设置弹窗与分区布局，后续设置继续加入此处，不创建空白分类或插件框架。
- 将子代理配置从输入区迁入设置，复用主代理的供应商 → 模型下拉样式，保留默认跟随主代理、当前会话作用范围和自动保存；未增加独立思考配置，继续沿用既有继承规则。
- 使用原生 dialog 处理焦点与 Escape，避免关闭设置时误停任务；支持关闭按钮、遮罩关闭、失败反馈及回滚、忙碌/离线禁用。
- 验证：npm test 全部 7 项通过，补充供应商筛选、跟随恢复、失败回滚和入口迁移检查；真实浏览器验证桌面打开、关闭焦点与 Escape、390px 手机宽度无横向溢出，未调用付费模型。
- 涉及文件：public/{index.html,app.js,style.css}、tests/app.test.js、README.md、devlog.md。

## 2026-09-09 — 页面子 Agent 模型配置
- 在独立 worktree F:/worktrees/MyWorkbench-subagent-model（feat/subagent-model）实现，复用模型目录与 session.configure，不新增依赖或配置服务。
- 输入框下新增原生折叠配置区：子 Agent 可选择独立模型或默认跟随主 Agent；按会话内存保存，快照恢复，忙碌/断线时禁用选择。
- 委派创建统一应用模型覆盖，保留工作目录和思考继承；配置只影响新子任务，未知模型在主 Agent 配置变更前拒绝。省略覆盖保留旧值，null 恢复继承。
- 验证：npm test 7 项通过，覆盖独立模型、恢复继承、未知模型拒绝、会话隔离、协议校验、页面选择提交及切换/重连恢复；未进行付费模型调用。依赖通过临时 node_modules junction 复用本机安装。
- 涉及文件：src/{sessions,protocol}.js、public/{app.js,index.html,style.css}、tests/{config,app}.test.js、README.md、devlog.md。

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

## 2026-09-09 — 质量、性能与页面体验优化
- 原 axiom/ 全部未跟踪：在 F:/worktrees/MyWorkbench-axiom-quality（feat/axiom-quality）复制源码并提交现状基线，未复制凭据、node_modules、PID 或运行日志；保留原工作区及 4319 服务。
- 渲染：折叠子任务仅更新文本缓存，跳过帧调度和 Markdown 解析，展开补绘；覆盖流式、最终结果与快照。历史任务按首条消息放置，避免任务详情全部跑到用户请求之前。
- 传输：合并重复静态资源注册，启动时生成 ETag，no-cache 强制校验、命中返回 304；保持 CSP、DOMPurify、输入校验与本机连接限制。
- 交互：断线不隐藏消息，允许继续写草稿，重连前保存最新输入；注册握手失败关闭处理，避免无法重试。保留草稿高度和滚动、修复带空白的发送回执、避免列表刷新失败误删已发送消息，修复跨会话重命名回执，删除会话释放草稿。
- 页面：统一暗色层级、留白、输入区焦点和任务状态；手机侧栏覆盖显示，支持遮罩 / Esc 关闭及焦点返回，主区 inert 防误操作。窄屏仅模型选择区滚动，发送按钮固定可见；去除重复 CSS，补充搜索空态和本地 SVG 图标，不新增依赖。
- 验证：npm test 7 项全部通过（新增 JSDOM 页面链路回归，扩充折叠任务和 HTTP 缓存检查）；npm audit --omit=dev 为 0 漏洞；git diff --check 通过。真实服务连接及模型目录可用；浏览器用模拟协议验证 Markdown/长内容/折叠任务，320、390、700、768、1440px 无页面横向溢出且发送按钮可见，控制台 0 错误，无付费模型调用。
- 可复现性能：node tests/benchmark.js，3 个任务 × 60 更新，展开 60 帧 / 180 次解析（本机一次 562ms），折叠 0 帧 / 0 次解析（四舍五入 0ms）。原有块渲染微基准 4964ms -> 551ms 是既有优化对全量重绘的对比，不归因于本次改动、不代表端到端加速。
- 涉及文件：public/{app.js,index.html,style.css,stream-renderer.js,favicon.svg}、src/server.js、tests/{app.test.js,stream-renderer.test.js,server.test.js,benchmark.js}、README.md、devlog.md。仍不做磁盘持久化、自动重连或额外前端框架。
- 交付：基线 87d2816、优化 65916cb 已推送 origin/feat/axiom-quality。尝试按规范合并 master，被主工作区未跟踪的 axiom/ 同名文件阻止，Git 安全中止；不强制覆盖或自动移动原代码。等待用户确认备份策略后再合并、推送 master 和清理 worktree。
- 保留独立预览 http://127.0.0.1:4320/（该 worktree 内运行，PID 记录在被忽略的 .axiom.pid），未重启原 4319 服务。浏览器截图留在 F:/worktrees/MyWorkbench-axiom-quality-artifacts/，不提交生成图片。
