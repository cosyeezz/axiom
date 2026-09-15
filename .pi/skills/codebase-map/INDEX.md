<!-- 自动生成，勿手改。重建：node .pi/skills/codebase-map/scripts/reindex.mjs -->
# Axiom 多级代码索引（生成于 2026/9/14 20:37:09）

## L1 模块总览（文件 → 职责）

| 文件 | 行数 | 职责 | 关键符号 |
|---|---|---|---|
| public/answer-tags.js | 47 | 主代理回答标签解析、代码保护与流式容错 | OPEN, CLOSE, isMark, splitAnswer |
| public/app.js | 3534 | 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度 | questionUI, filePicker, $, ws |
| public/file-picker.css | 276 | 文件选择弹窗主题与响应式布局 | - |
| public/file-picker.js | 355 | 共享文件/目录选择弹窗、懒加载与分类 SVG 图标 | NS, SEARCH_DEBOUNCE, el, FOLDER_COLORS |
| public/goal-markers.js | 60 | 前后端共享 goal 完成标记解析与展示层剥离（含流式半截） | ROUND_MARKER, GOAL_MARKER, MARKER_TOKENS, SUFFIXES |
| public/goal.css | 239 | Goal 目标面板、轮次与控制样式 | - |
| public/goal.js | 642 | Goal 专属状态、操作与复用消息轮次分组 | createGoalUI |
| public/index.html | 343 | 页面骨架与元素 id（见 L3） | - |
| public/markdown-scan.js | 72 | 共享代码区扫描：围栏/缩进/行内代码掩码与区间切割 | FILL, FENCE, INLINE, fill |
| public/markdown.js | 317 | marked + DOMPurify 渲染（XSS 边界） | cache, policy, textLanguages, isText |
| public/memory-tags.js | 107 | 主子代理共享简单标签提取与流式显示过滤 | LIVE, DEAD, TAGS, NAMES |
| public/model-auth.js | 97 | 网页登录：授权提示、设备码、凭据输入与取消 | createModelAuth |
| public/model-manager.css | 520 | 模型配置页：供应商列表、编辑表单与响应式布局 | - |
| public/model-manager.js | 1278 | 统一模型管理：供应商、字段覆盖与思考等级编辑 | THINKING_LEVELS, API_TYPES, PROVIDER_TEMPLATES, PROVIDER_ID |
| public/model-picker.css | 88 | 共享收藏下拉：浮层、星标、触屏与焦点样式 | - |
| public/model-picker.js | 300 | 共享模型选择器：供应商/模型/思考收藏、排序与键盘交互 | GAP, EDGE, TYPEAHEAD_MS, el |
| public/question.css | 49 | 提问面板样式、焦点与窄屏布局 | - |
| public/question.js | 237 | 主代理提问选项卡、键盘交互与回答提交 | createQuestionUI |
| public/service-settings.js | 278 | 设置页服务维护：真实进度、结果、更新确认与独立维护通道 | MAINT_URL_RE, POLL_MS, initServiceSettings |
| public/stream-renderer.js | 51 | 流式增量渲染状态机 | createStreamRenderer |
| public/style.css | 1409 | 全局样式（CSP 禁 inline style，样式一律进这里） | - |
| public/theme.js | 11 | 首帧前阻塞应用明/暗主题（localStorage axiom.theme，默认深色） | - |
| public/tooltip.css | 50 | 共享悬停说明样式（浅色主题下反色） | - |
| public/tooltip.js | 225 | 共享悬停说明：动态 title、键盘、定位与无障碍 | SHOW_DELAY, HIDE_DELAY, GAP, EDGE |
| scripts/autostart.mjs | 138 | Windows/macOS/Linux 当前用户登录自动启动安装/卸载 | run, projectDir, serviceEntry, label |
| scripts/dev.mjs | 12 | 开发入口：DEV 标识、4320 端口与独立数据目录 | - |
| scripts/install.mjs | 72 | 一键安装：装依赖/注册自启/启动守护/健康检查/打开浏览器 | root, parseArgs, ensurePi, viaShell |
| scripts/maint-server.mjs | 86 | loopback维护HTTP：来源校验、随机凭证、状态与离线恢复 | MAX_BODY, hash, json, startMaintServer |
| scripts/maint-state.mjs | 138 | 守护维护状态：持久化阶段、最近结果与有界脱敏证据 | NAMESPACE, LOG_LIMIT, redact, sanitize |
| scripts/service.mjs | 619 | 服务守护：IPC 重启、HTTP 安全停止与崩溃退避停止通道 | root, output, run, npmRun |
| scripts/uninstall.mjs | 18 | 统一卸载：核对 npm 目标、安全停止、取消自启、保留用户数据 | uninstall |
| src/capabilities.js | 138 | 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities） | sdkEntry, resolver, alias, jiti |
| src/compaction.js | 391 | 后台独立摘要、token/占比阈值、快照校验与 turn 安全提交 | contextTokens, prepareBackgroundCompaction, DEFAULT_COMPACTION_CONFIG, normalizeCompaction |
| src/database.js | 103 | 共享 SQLite 连接、小配置 KV、WAL 与一致性备份 | nodeOk, Database |
| src/goal.js | 988 | Goal：会话级目标状态、轮次计划、验收门与持久化 | GOAL_PHASES, GOAL_ACTIONS, ROUND_STATUSES, GOAL_MAX_SEGMENTS |
| src/inline-images.js | 32 | 模型上下文图片定位：将占位符与真实附件交错排列，不改存储与队列 | inlineImages, inlineImagesExtension |
| src/main.js | 122 | 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理 | port, cwd, home, database |
| src/model-auth.js | 89 | SDK 登录桥：连接隔离、超时取消与安全事件投影 | safeUrl, text, eventView, createModelAuthService |
| src/model-config.js | 619 | Pi models.json 无损配置读写与共享收藏持久化 | sdkModelConfig, sdkResolveConfigValue, digest, LEVELS |
| src/pi-model-storage.js | 409 | 模型与凭据 SQLite 权威存储、Pi 派生兼容文件 | sdkResolveConfigValue, sdkIsCommandConfigValue, NAMESPACE, AUTH_NAMESPACE |
| src/pi.js | 510 | createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档） | agentRuntime, queueStateOf, hasModelOutput, withdrawQueue |
| src/prompts.js | 35 | Axiom 自有提示词按 main/subagent/compaction 角色集中维护 | USER_COMMUNICATION, DELEGATION_PROMPT, TITLE_INSTRUCTION, SUBAGENT_PROMPT |
| src/protocol.js | 346 | zod 协议：selection / command 判别联合（消息类型见 L3） | id, capabilities, workspace, thinking |
| src/questions.js | 86 | 主代理 question 工具、参数校验与可取消的回答等待 | text, option, input, questionAnswers |
| src/remote.js | 547 | Tailscale 登录身份、远程监听、同账号授权与本机配置持久化 | configSchema, execOptions, cliEnv, defaultRun |
| src/retry.js | 196 | 模型失败重试：可取消退避、最多45次、16分钟封顶、自定义错误词表、保留已有工具结果继续 | RETRY_DELAYS_MS, MAX_DELAY_MS, MAX_RETRIES, RECOVERY_PROMPT |
| src/server.js | 506 | createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发 | dev, digest, load, freshen |
| src/session-memory.js | 29 | 标题提取登记、轮次预算挂钩与委派背景 | textOf, memoryHooks |
| src/session-store.js | 479 | 会话三表、实体增量更新、逐会话事务与旧数据迁移 | EVENT_TYPES, SESSION_FIELDS, TABLES, INDEXES |
| src/sessions.js | 1596 | Sessions：会话生命周期、增量保存、元数据启动与SDK按需恢复 | GOAL_TOOL_NAMES, hasRunningTasks, BROWSE_PAGE, SEARCH_LIMIT |
| src/task-budget.js | 35 | 主子代理轮次预算规则、收尾提示词与配置页参数校验 | TASK_BUDGET_LIMITS, taskBudgetDefaults, within, taskBudgetPolicy |
| src/tasks.js | 210 | Tasks：子任务（委托）生命周期 | ACTIVE, historyResult, Tasks |
| src/tools.js | 110 | delegationTools：委托/凭证读取/追加工具定义（zod 入参） | delegateInput, readInput, appendInput, result |
| src/update.js | 41 | 检查更新：本地安装（提交 SHA/版本）比对 GitHub 公开仓库 master，npm 安装实例可自动重装 | repo, npmSpec, commitFile, validateCommit |
| tests/__pycache__/goal-ui.cpython-312.pyc | 165 | node --test 测试（npm test） | - |
| tests/activity-groups-ui.py | 201 | node --test 测试（npm test） | activityHistory, sessions |
| tests/answer-tags.test.js | 48 | node --test 测试（npm test） | open |
| tests/app.test.js | 1765 | node --test 测试（npm test） | pickerSource, modelSources, serviceSource |
| tests/autoscroll-ui.py | 99 | node --test 测试（npm test） | - |
| tests/autostart.test.js | 71 | node --test 测试（npm test） | node, cwd, service |
| tests/benchmark.js | 92 | node --test 测试（npm test） | window |
| tests/capabilities.test.js | 222 | node --test 测试（npm test） | - |
| tests/cli-help.test.js | 46 | node --test 测试（npm test） | cli |
| tests/codebase-index.test.js | 20 | node --test 测试（npm test） | ROOT, SKILL |
| tests/compaction-config.test.js | 152 | node --test 测试（npm test） | - |
| tests/compaction-ui.py | 57 | node --test 测试（npm test） | - |
| tests/compaction-ui.test.js | 187 | node --test 测试（npm test） | page |
| tests/compaction.test.js | 823 | node --test 测试（npm test） | fakeModel, createTestSession, seq, userMsg |
| tests/config.test.js | 304 | node --test 测试（npm test） | - |
| tests/context-menu-ui.py | 66 | node --test 测试（npm test） | - |
| tests/conversation-preview.mjs | 124 | node --test 测试（npm test） | markdown, message, thinking, state |
| tests/conversation-ui.py | 254 | node --test 测试（npm test） | - |
| tests/database.test.js | 149 | node --test 测试（npm test） | - |
| tests/defaults.test.js | 185 | node --test 测试（npm test） | - |
| tests/dev-assets.test.js | 46 | node --test 测试（npm test） | - |
| tests/file-picker.test.js | 67 | node --test 测试（npm test） | source, tick |
| tests/goal-command-ui.test.js | 141 | node --test 测试（npm test） | page, $, settle, input |
| tests/goal-markers.test.js | 115 | node --test 测试（npm test） | page, lastAssistant |
| tests/goal-pi.test.js | 288 | node --test 测试（npm test） | PREAMBLE, FOOTER, run |
| tests/goal-preview.mjs | 148 | node --test 测试（npm test） | cwd, seq, text, makeState |
| tests/goal-protocol.test.js | 15 | node --test 测试（npm test） | - |
| tests/goal-sessions.test.js | 711 | node --test 测试（npm test） | PLAN, factoryFixture, tick, until |
| tests/goal-ui.py | 488 | node --test 测试（npm test） | - |
| tests/goal-ui.test.js | 430 | node --test 测试（npm test） | page, $, labels, messages |
| tests/goal.test.js | 853 | node --test 测试（npm test） | ROUND, GOAL, PLAN, PLAN2 |
| tests/helpers/model-concurrency-child.mjs | 82 | node --test 测试（npm test） | barrier, runOpponent |
| tests/helpers/public-source.js | 10 | node --test 测试（npm test） | publicSource |
| tests/image-input.test.js | 169 | node --test 测试（npm test） | pngBase64, jpegBase64, image, parsePrompt |
| tests/inline-images.test.js | 42 | node --test 测试（npm test） | text, a, b, user |
| tests/install.test.js | 150 | node --test 测试（npm test） | fakeService |
| tests/manual-retry.test.js | 197 | node --test 测试（npm test） | session, assistant, page, message |
| tests/markdown.test.js | 214 | node --test 测试（npm test） | - |
| tests/memory-preview.mjs | 22 | node --test 测试（npm test） | state, sessions, app |
| tests/memory-tags.test.js | 115 | node --test 测试（npm test） | - |
| tests/memory-ui.test.js | 123 | node --test 测试（npm test） | page |
| tests/message-activity.test.js | 427 | node --test 测试（npm test） | page, assistant, thought, call |
| tests/mobile-reading-ui.py | 130 | node --test 测试（npm test） | - |
| tests/model-auth.test.js | 133 | node --test 测试（npm test） | SECRET, fakeAuth, waitFor, noLeak |
| tests/model-config.test.js | 1159 | node --test 测试（npm test） | sha, EMPTY, tempDir, openDatabases |
| tests/model-manager.test.js | 1229 | node --test 测试（npm test） | authSource, source, tick, j |
| tests/model-onboarding-ui.test.js | 154 | node --test 测试（npm test） | stripImports, modelSources, pickerSource, memoryTagsSource |
| tests/model-onboarding.test.js | 55 | node --test 测试（npm test） | - |
| tests/model-picker.test.js | 311 | node --test 测试（npm test） | source, tick, nap, OPTS |
| tests/model-runtime-catalog.test.js | 27 | node --test 测试（npm test） | - |
| tests/model-selection-preview.mjs | 52 | node --test 测试（npm test） | home, catalog, factory, sessions |
| tests/model-selection-ui.py | 60 | node --test 测试（npm test） | - |
| tests/model-settings-ui.py | 44 | node --test 测试（npm test） | - |
| tests/model-thinking-favorites.test.js | 122 | node --test 测试（npm test） | appSource, pickerSource, modelSources, html |
| tests/pi-memory.test.js | 171 | node --test 测试（npm test） | - |
| tests/pi-model-storage.test.js | 624 | node --test 测试（npm test） | tempDir, makeStorage, seedPiModels, seedPiAuth |
| tests/pi-question.test.js | 197 | node --test 测试（npm test） | - |
| tests/project-skills.test.js | 66 | node --test 测试（npm test） | - |
| tests/question-layout-ui.py | 48 | node --test 测试（npm test） | - |
| tests/question-preview.mjs | 36 | node --test 测试（npm test） | factory, sessions, app, port |
| tests/question-ui.test.js | 98 | node --test 测试（npm test） | source |
| tests/questions.test.js | 110 | node --test 测试（npm test） | params |
| tests/recall.test.js | 202 | node --test 测试（npm test） | user, assistant, thinking, fixture |
| tests/remote-ui.py | 51 | node --test 测试（npm test） | - |
| tests/remote-ui.test.js | 224 | node --test 测试（npm test） | page, modelSources, flush, stubRequest |
| tests/remote.test.js | 750 | node --test 测试（npm test） | EMAIL, mockTailscale, fakeChild, fakeDatabase |
| tests/retry-settings-ui.py | 30 | node --test 测试（npm test） | - |
| tests/retry.test.js | 407 | node --test 测试（npm test） | RATE_LIMIT, QUOTA, ABORTED, fakeSession |
| tests/server.test.js | 139 | node --test 测试（npm test） | - |
| tests/service-api.test.js | 106 | node --test 测试（npm test） | - |
| tests/service-settings-api.test.js | 71 | node --test 测试（npm test） | - |
| tests/service-settings-ui.py | 60 | node --test 测试（npm test） | - |
| tests/service-settings.test.js | 377 | node --test 测试（npm test） | source, html, setup |
| tests/service.test.js | 684 | node --test 测试（npm test） | until, readMaybe, killTree, buildWorkspace |
| tests/session-created-at.test.js | 44 | node --test 测试（npm test） | factory |
| tests/session-flow.test.js | 451 | node --test 测试（npm test） | flowFactory, jsonlFactory |
| tests/session-memory.test.js | 110 | node --test 测试（npm test） | reply |
| tests/session-migration.test.js | 282 | node --test 测试（npm test） | factory, workspaceHash |
| tests/session-model-restore.test.js | 61 | node --test 测试（npm test） | stubFactory, cleanup |
| tests/session-persistence.test.js | 422 | node --test 测试（npm test） | factory |
| tests/session-sidebar-ui.py | 112 | node --test 测试（npm test） | - |
| tests/session-store.test.js | 640 | node --test 测试（npm test） | withStore, fullSaved, LEGACY_DDL |
| tests/smoke.js | 67 | node --test 测试（npm test） | TIMEOUT, sessions |
| tests/sqlite-benchmark.mjs | 914 | node --test 测试（npm test） | parseArgs, args, scriptPath, repoDir |
| tests/stream-renderer.test.js | 116 | node --test 测试（npm test） | - |
| tests/subagent-persistence.test.js | 123 | node --test 测试（npm test） | factory |
| tests/task-budget.test.js | 102 | node --test 测试（npm test） | factory |
| tests/task-notifications.test.js | 197 | node --test 测试（npm test） | factoryFixture, tick, until |
| tests/task-resume.test.js | 182 | node --test 测试（npm test） | fakeAgent, fixture, restored |
| tests/task-timer.test.js | 55 | node --test 测试（npm test） | factory, state, settle |
| tests/tasks.test.js | 132 | node --test 测试（npm test） | fixture |
| tests/text-diagram-ui.py | 36 | node --test 测试（npm test） | - |
| tests/tooltip.test.js | 282 | node --test 测试（npm test） | source, boot, fire, tip |
| tests/ui-sticky-check.html | 63 | node --test 测试（npm test） | checks, lines, ok |
| tests/ui-sticky-check.mjs | 104 | node --test 测试（npm test） | here, candidates, browser, port |
| tests/uninstall.test.js | 45 | node --test 测试（npm test） | - |
| tests/update.test.js | 38 | node --test 测试（npm test） | old |
| tests/workspace-isolation.test.js | 80 | node --test 测试（npm test） | - |
| tests/workspace-picker.test.js | 99 | node --test 测试（npm test） | - |
| tests/workspace-tabs.test.js | 235 | node --test 测试（npm test） | appSource, pickerSource, modelSources, html |

## L2 符号 → 行号（跳转：read <文件> offset=<行>）

### public/answer-tags.js（47 行） — 主代理回答标签解析、代码保护与流式容错

| 符号 | 类型 | 行 |
|---|---|---|
| OPEN | const | 6 |
| CLOSE | const | 7 |
| isMark | const | 9 |
| splitAnswer | function | 11 |

### public/app.js（3534 行） — 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度

| 符号 | 类型 | 行 |
|---|---|---|
| questionUI | const | 13 |
| filePicker | const | 15 |
| $ | const | 16 |
| ws | const | 17 |
| sessionMissing | const | 27 |
| onboarding | const | 28 |
| allSessions | const | 29 |
| views | const | 31 |
| goalUI | function | 35 |
| compactionDefaults | const | 51 |
| taskBudgetDefaults | const | 53 |
| thinkingLevels | const | 54 |
| modelFavorites | const | 55 |
| favoriteKey | function | 58 |
| modelPicker | const | 63 |
| modelManager | const | 77 |
| serviceUi | const | 78 |
| compactions | const | 79 |
| goalAnchors | const | 81 |
| anchorGoal | function | 82 |
| clearGoalPrompt | function | 88 |
| resizePrompt | method | 93 |
| controls | method | 94 |
| lastMainMessage | const | 97 |
| compactionNodes | const | 98 |
| images | const | 99 |
| completionVersion | const | 100 |
| selectedSkill | const | 101 |
| hiddenSessions | const | 105 |
| seenSessions | const | 112 |
| markSessionSeen | function | 117 |
| readSessionPreference | function | 124 |
| changeSessionPreference | function | 128 |
| setSessionHidden | function | 142 |
| saveView | function | 159 |
| resizePrompt | function | 170 |
| scrollFrame | const | 176 |
| FOLLOW_GAP | const | 177 |
| scrollIntent | const | 178 |
| lastScrollTops | const | 179 |
| noteScrollIntent | const | 181 |
| atLatest | const | 183 |
| readFollow | function | 186 |
| scrollToLatest | const | 195 |
| scrollLatest | function | 196 |
| scheduleCallGroups | method | 197 |
| transcript | const | 206 |
| growthWatch | const | 208 |
| growthObserver | function | 209 |
| watchGrowth | function | 212 |
| forgetGrowth | function | 213 |
| renderer | const | 216 |
| scrollLatest | method | 240 |
| mobile | const | 242 |
| sidebar | function | 243 |
| sidebar | method | 253 |
| sidebar | method | 256 |
| resizePrompt | method | 257 |
| themeColors | const | 262 |
| applyTheme | function | 263 |
| applyTheme | method | 274 |
| pending | const | 283 |
| requestSeq | const | 288 |
| error | function | 289 |
| request | function | 292 |
| controls | function | 301 |
| renderContextChips | method | 329 |
| syncRetryPrompt | method | 336 |
| options | function | 345 |
| providerEntries | const | 354 |
| modelEntries | const | 355 |
| refreshModelCatalog | function | 357 |
| fillModels | function | 385 |
| options | method | 387 |
| renderAgentConfig | function | 390 |
| options | method | 394 |
| fillModels | method | 395 |
| options | method | 398 |
| fillSubagentModels | function | 402 |
| options | method | 404 |
| capabilityName | function | 412 |
| runtimeSummary | function | 422 |
| renderRuntime | function | 435 |
| updateTaskRuntime | function | 452 |
| renderRuntime | method | 454 |
| applyConfig | function | 457 |
| options | method | 459 |
| renderRuntime | method | 465 |
| options | method | 466 |
| fillSubagentModels | method | 471 |
| renderAgentConfig | method | 472 |
| configureSeq | const | 475 |
| configure | function | 476 |
| controls | method | 487 |
| taskBudgetInputs | const | 510 |
| loadTaskBudget | function | 511 |
| saveTaskBudget | function | 520 |
| showSettingsPanel | function | 534 |
| showSettingsPanel | method | 550 |
| showSettingsPanel | method | 554 |
| controls | method | 555 |
| remoteView | const | 567 |
| remoteLoaded | const | 568 |
| remoteAnchor | function | 569 |
| remoteRender | function | 577 |
| controls | method | 623 |
| remoteLoad | function | 625 |
| remoteAuthUrl | function | 641 |
| remoteLogin | function | 649 |
| remoteOnReconnect | function | 675 |
| controls | method | 689 |
| messageItems | const | 702 |
| activityPaths | const | 704 |
| setActivityIcon | function | 721 |
| callGroupsFrame | const | 731 |
| scheduleCallGroups | function | 732 |
| createCallGroup | function | 742 |
| paintCallGroup | function | 756 |
| refreshCallGroups | function | 798 |
| foldCallsBeforeMessage | function | 929 |
| paintCallGroup | method | 933 |
| disclosureHint | function | 935 |
| activityLine | function | 955 |
| setActivity | method | 965 |
| setActivity | function | 968 |
| scheduleCallGroups | method | 969 |
| setActivityIcon | method | 971 |
| waiting | function | 982 |
| scheduleCallGroups | method | 984 |
| scrollLatest | method | 990 |
| clearWaiting | function | 992 |
| stopActivity | function | 996 |
| scheduleCallGroups | method | 998 |
| clearWaiting | method | 999 |
| updateActivity | function | 1008 |
| setActivity | method | 1021 |
| setActivity | method | 1022 |
| mergeThoughts | function | 1026 |
| diffView | const | 1044 |
| renderToolDetail | function | 1049 |
| section | method | 1135 |
| toolState | function | 1137 |
| clearWaiting | method | 1139 |
| setActivity | method | 1183 |
| renderToolDetail | method | 1184 |
| scrollLatest | method | 1185 |
| card | function | 1187 |
| renderMessage | function | 1245 |
| updateActivity | method | 1354 |
| renderCompactionStatus | function | 1357 |
| trackTaskEntries | function | 1374 |
| placeCompactedTasks | function | 1385 |
| placeCompactedRetries | method | 1386 |
| compactionCard | function | 1415 |
| renderMarkdown | method | 1435 |
| foldCompaction | function | 1438 |
| placeCompactedTasks | method | 1460 |
| mergeThoughts | method | 1461 |
| compactionEditor | function | 1468 |
| options | method | 1506 |
| fillThinking | method | 1536 |
| retryChipList | function | 1547 |
| render | method | 1596 |
| retryEditor | function | 1600 |
| renderTaskRuns | function | 1620 |
| renderQueue | function | 1648 |
| canResumeMessage | const | 1667 |
| retryPrompt | const | 1669 |
| syncRetryPrompt | function | 1670 |
| scrollLatest | method | 1699 |
| retryCards | const | 1701 |
| placeCompactedRetries | function | 1702 |
| retryArchive | function | 1726 |
| renderRetry | function | 1739 |
| placeCompactedRetries | method | 1775 |
| scrollLatest | method | 1776 |
| event | function | 1778 |
| snapshot | function | 2003 |
| clearTimeout | method | 2006 |
| markSessionSeen | method | 2022 |
| updatePageTitle | method | 2026 |
| renderTaskRuns | method | 2037 |
| renderCompactionStatus | method | 2042 |
| restoreRetries | method | 2110 |
| mergeThoughts | method | 2124 |
| placeCompactedTasks | method | 2138 |
| renderImages | method | 2152 |
| closeCompletion | method | 2155 |
| renderQueue | method | 2166 |
| applyConfig | method | 2168 |
| controls | method | 2170 |
| reconnectTimer | const | 2173 |
| clearTimeout | method | 2177 |
| controls | method | 2180 |
| scheduleReconnect | function | 2303 |
| clearTimeout | method | 2304 |
| importDir | const | 2308 |
| fillModels | method | 2313 |
| fillSubagentModels | method | 2320 |
| closeCompletion | method | 2337 |
| controls | method | 2342 |
| scrollLatest | method | 2347 |
| enableImagePreview | function | 2379 |
| renderImages | function | 2400 |
| addImages | function | 2425 |
| loadImages | function | 2446 |
| renderImages | method | 2455 |
| selectionCopy | const | 2478 |
| copySelection | function | 2490 |
| escapeTimer | const | 2553 |
| withdrawQueue | function | 2554 |
| refreshing | const | 2636 |
| refreshSessions | function | 2637 |
| timerText | function | 2653 |
| renderTaskTimer | function | 2660 |
| applyElapsed | function | 2673 |
| renderTaskTimer | method | 2679 |
| updatePageTitle | function | 2681 |
| updateSessions | function | 2685 |
| renderTaskTimer | method | 2687 |
| updatePageTitle | method | 2699 |
| renderSessions | method | 2700 |
| recoverMissingSession | function | 2702 |
| controls | method | 2704 |
| saveView | method | 2711 |
| controls | method | 2715 |
| switchSession | function | 2731 |
| saveView | method | 2733 |
| controls | method | 2736 |
| copySessionFile | function | 2762 |
| positionSessionMenu | function | 2775 |
| renderSessions | function | 2781 |
| sessionAction | const | 2937 |
| openSessionAction | function | 2939 |
| contextIcon | function | 2980 |
| renderContextChips | function | 2983 |
| fuzzyHit | function | 3002 |
| renderContextResults | function | 3009 |
| showContextSkills | function | 3029 |
| positionContextSkills | function | 3034 |
| showContextSkills | method | 3046 |
| controls | method | 3081 |
| skillTrigger | const | 3083 |
| showContextSkills | method | 3099 |
| resizePrompt | method | 3108 |
| controls | method | 3109 |
| SLASH_COMMANDS | const | 3114 |
| closeCompletion | function | 3117 |
| highlightCompletion | function | 3125 |
| chooseCompletion | function | 3134 |
| closeCompletion | method | 3146 |
| updateCompletion | function | 3149 |
| closeCompletion | method | 3150 |
| resizePrompt | method | 3209 |
| controls | method | 3210 |
| switchSession | method | 3250 |
| creationLoad | const | 3261 |
| defaultsScope | const | 3263 |
| renderDefaultsScope | function | 3264 |
| options | method | 3265 |
| refreshDefaultsScope | function | 3268 |
| renderDefaultsScope | method | 3272 |
| createAgentPicker | function | 3275 |
| options | method | 3301 |
| fill | method | 3309 |
| fillThinking | method | 3317 |
| options | method | 3319 |
| defaultsSelection | const | 3367 |
| defaultsSaving | const | 3380 |
| loadCreation | function | 3382 |
| openDefaults | function | 3416 |
| controls | method | 3465 |
| updateDefaultsPreview | function | 3478 |
| updateDefaultsPreview | method | 3502 |
| controls | method | 3518 |

### public/file-picker.js（355 行） — 共享文件/目录选择弹窗、懒加载与分类 SVG 图标

| 符号 | 类型 | 行 |
|---|---|---|
| NS | const | 11 |
| SEARCH_DEBOUNCE | const | 12 |
| el | function | 16 |
| FOLDER_COLORS | const | 29 |
| FOLDER_ALIASES | const | 30 |
| FOLDER_COLOR | const | 31 |
| FOLDER_BASE | const | 32 |
| DOC_BASE | const | 33 |
| p | const | 35 |
| c | const | 36 |
| t | const | 37 |
| FOLDER_GLYPHS | const | 43 |
| FILE_GLYPHS | const | 51 |
| KIND_BY_EXT | const | 65 |
| kindOf | function | 82 |
| fileIcon | function | 94 |
| createFilePicker | function | 115 |
| baseName | function | 352 |

### public/goal-markers.js（60 行） — 前后端共享 goal 完成标记解析与展示层剥离（含流式半截）

| 符号 | 类型 | 行 |
|---|---|---|
| ROUND_MARKER | const | 9 |
| GOAL_MARKER | const | 10 |
| MARKER_TOKENS | const | 13 |
| SUFFIXES | const | 15 |
| signalLines | function | 19 |
| parseGoalMarkers | function | 30 |
| stripGoalMarkers | function | 45 |

### public/goal.js（642 行） — Goal 专属状态、操作与复用消息轮次分组

| 符号 | 类型 | 行 |
|---|---|---|
| createGoalUI | function | 9 |

### public/markdown-scan.js（72 行） — 共享代码区扫描：围栏/缩进/行内代码掩码与区间切割

| 符号 | 类型 | 行 |
|---|---|---|
| FILL | const | 13 |
| FENCE | const | 15 |
| INLINE | const | 17 |
| fill | const | 18 |
| maskCode | function | 21 |
| cutSpans | function | 53 |

### public/markdown.js（317 行） — marked + DOMPurify 渲染（XSS 边界）

| 符号 | 类型 | 行 |
|---|---|---|
| cache | const | 4 |
| policy | const | 5 |
| textLanguages | const | 11 |
| isText | const | 12 |
| wideCharacter | const | 13 |
| graphemes | const | 14 |
| numericCell | const | 15 |
| placeholderCell | const | 16 |
| ruleLine | const | 17 |
| borderedRows | function | 20 |
| alignedRows | function | 39 |
| textTable | function | 80 |
| looksLikeDiagram | function | 116 |
| layoutDiagram | function | 123 |
| isJson | function | 152 |
| fixCjkBold | function | 159 |
| jsonControls | function | 173 |
| renderMarkdown | function | 212 |

### public/memory-tags.js（107 行） — 主子代理共享简单标签提取与流式显示过滤

| 符号 | 类型 | 行 |
|---|---|---|
| LIVE | const | 9 |
| DEAD | const | 11 |
| TAGS | const | 12 |
| NAMES | const | 13 |
| TAG | const | 15 |
| OPEN | const | 16 |
| CLOSE | const | 17 |
| MARKS | const | 18 |
| TITLE_MAX | const | 19 |
| PARENT | const | 21 |
| HOLE | const | 23 |
| hide | const | 24 |
| sanitize | const | 26 |
| headLine | function | 29 |
| inHead | const | 37 |
| inParent | function | 39 |
| attributedOpen | const | 48 |
| extractMemoryTags | function | 52 |
| stripMemoryTags | function | 72 |

### public/model-auth.js（97 行） — 网页登录：授权提示、设备码、凭据输入与取消

| 符号 | 类型 | 行 |
|---|---|---|
| createModelAuth | function | 2 |

### public/model-manager.js（1278 行） — 统一模型管理：供应商、字段覆盖与思考等级编辑

| 符号 | 类型 | 行 |
|---|---|---|
| THINKING_LEVELS | const | 24 |
| API_TYPES | const | 25 |
| PROVIDER_TEMPLATES | const | 33 |
| PROVIDER_ID | const | 64 |
| MASK_KINDS | const | 65 |
| DRAFT | const | 67 |
| HIDDEN_VIEW | const | 69 |
| MANAGED_PROVIDER_KEYS | const | 72 |
| MANAGED_MODEL_KEYS | const | 73 |
| isMask | const | 75 |
| hasOwn | const | 76 |
| clone | const | 77 |
| keepMasked | function | 79 |
| stable | function | 87 |
| el | function | 95 |
| fieldSeq | const | 111 |
| field | function | 113 |
| badge | function | 122 |
| parseJsonText | function | 126 |
| SVG_NS | const | 138 |
| ICONS | const | 140 |
| icon | function | 146 |
| openModal | function | 158 |
| closeModal | function | 162 |
| openDialog | function | 171 |
| openModal | method | 189 |
| initModelManager | function | 194 |
| renderProviders | method | 1275 |

### public/model-picker.js（300 行） — 共享模型选择器：供应商/模型/思考收藏、排序与键盘交互

| 符号 | 类型 | 行 |
|---|---|---|
| GAP | const | 25 |
| EDGE | const | 26 |
| TYPEAHEAD_MS | const | 27 |
| el | function | 31 |
| createModelPicker | function | 41 |
| addEventListener | method | 290 |
| addEventListener | method | 293 |

### public/question.js（237 行） — 主代理提问选项卡、键盘交互与回答提交

| 符号 | 类型 | 行 |
|---|---|---|
| createQuestionUI | function | 1 |

### public/service-settings.js（278 行） — 设置页服务维护：真实进度、结果、更新确认与独立维护通道

| 符号 | 类型 | 行 |
|---|---|---|
| MAINT_URL_RE | const | 16 |
| POLL_MS | const | 17 |
| initServiceSettings | function | 19 |

### public/stream-renderer.js（51 行） — 流式增量渲染状态机

| 符号 | 类型 | 行 |
|---|---|---|
| createStreamRenderer | function | 2 |

### public/tooltip.js（225 行） — 共享悬停说明：动态 title、键盘、定位与无障碍

| 符号 | 类型 | 行 |
|---|---|---|
| SHOW_DELAY | const | 14 |
| HIDE_DELAY | const | 15 |
| GAP | const | 16 |
| EDGE | const | 17 |
| meta | const | 19 |
| current | const | 20 |
| deferred | const | 21 |
| popped | const | 22 |
| showTimer | const | 23 |
| hideTimer | const | 24 |
| tip | const | 26 |
| pos | const | 32 |
| cssPos | function | 33 |
| hot | function | 49 |
| lookup | function | 58 |
| restore | function | 68 |
| mount | function | 79 |
| unmount | function | 91 |
| position | function | 97 |
| showFor | function | 111 |
| hide | method | 114 |
| cancelHide | function | 136 |
| clearTimeout | method | 137 |
| finish | function | 141 |
| hide | function | 151 |
| clearTimeout | method | 152 |
| cancelHide | method | 164 |
| finish | method | 165 |
| hide | method | 196 |
| showFor | method | 202 |

### scripts/autostart.mjs（138 行） — Windows/macOS/Linux 当前用户登录自动启动安装/卸载

| 符号 | 类型 | 行 |
|---|---|---|
| run | const | 13 |
| projectDir | const | 14 |
| serviceEntry | const | 15 |
| label | const | 16 |
| unitName | const | 17 |
| vbsStr | const | 21 |
| xmlText | const | 22 |
| systemdArg | const | 24 |
| vbsArg | const | 26 |
| vbsScript | function | 27 |
| launchdPlist | function | 36 |
| systemdUnit | function | 58 |
| startupDir | const | 73 |
| join | method | 74 |
| vbsPath | const | 76 |
| plistPath | const | 77 |
| unitPath | const | 78 |
| enableWindows | function | 80 |
| disableWindows | function | 84 |
| enableMac | function | 87 |
| disableMac | function | 91 |
| enableLinux | function | 94 |
| disableLinux | function | 103 |
| actions | const | 110 |
| isEnabled | const | 118 |
| platform | method | 119 |
| main | function | 121 |

### scripts/install.mjs（72 行） — 一键安装：装依赖/注册自启/启动守护/健康检查/打开浏览器

| 符号 | 类型 | 行 |
|---|---|---|
| root | const | 15 |
| parseArgs | const | 17 |
| ensurePi | const | 29 |
| viaShell | const | 36 |
| ask | const | 41 |
| install | function | 43 |
| invoked | const | 69 |

### scripts/maint-server.mjs（86 行） — loopback维护HTTP：来源校验、随机凭证、状态与离线恢复

| 符号 | 类型 | 行 |
|---|---|---|
| MAX_BODY | const | 7 |
| hash | const | 8 |
| json | const | 9 |
| allow | method | 10 |
| startMaintServer | function | 15 |

### scripts/maint-state.mjs（138 行） — 守护维护状态：持久化阶段、最近结果与有界脱敏证据

| 符号 | 类型 | 行 |
|---|---|---|
| NAMESPACE | const | 8 |
| LOG_LIMIT | const | 9 |
| redact | function | 13 |
| sanitize | function | 21 |
| createMaintState | function | 27 |
| persist | method | 102 |

### scripts/service.mjs（619 行） — 服务守护：IPC 重启、HTTP 安全停止与崩溃退避停止通道

| 符号 | 类型 | 行 |
|---|---|---|
| root | const | 17 |
| output | const | 18 |
| run | function | 19 |
| npmRun | const | 32 |
| installTag | function | 40 |
| controlPath | function | 43 |
| stagedSha | const | 49 |
| verifySdkImport | function | 59 |
| prepareUpdate | function | 68 |
| swapUpdate | function | 86 |
| commitUpdate | function | 116 |
| rollbackUpdate | function | 122 |
| update | function | 130 |
| prepareRebuild | function | 138 |
| swapRebuild | function | 151 |
| commitRebuild | function | 162 |
| rollbackRebuild | function | 166 |
| rebuild | function | 172 |
| READY_TIMEOUT_MS | const | 180 |
| localPort | function | 184 |
| localAddress | const | 191 |
| homeDir | const | 196 |
| openCommand | const | 200 |
| openPage | function | 205 |
| spawn | method | 207 |
| firstRunGuide | function | 212 |
| serviceReady | const | 229 |
| fetch | method | 230 |
| startBackground | function | 237 |
| spawn | method | 239 |
| startCli | function | 250 |
| supervise | function | 257 |
| mkdirSync | method | 266 |
| spawnWorker | method | 551 |
| invoked | const | 555 |
| stopService | function | 556 |
| HELP | const | 592 |
| FORE | const | 604 |
| COMMANDS | const | 605 |

### scripts/uninstall.mjs（18 行） — 统一卸载：核对 npm 目标、安全停止、取消自启、保留用户数据

| 符号 | 类型 | 行 |
|---|---|---|
| uninstall | function | 8 |

### src/capabilities.js（138 行） — 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities）

| 符号 | 类型 | 行 |
|---|---|---|
| sdkEntry | const | 13 |
| resolver | const | 14 |
| alias | const | 15 |
| jiti | const | 22 |
| snapshotSettings | function | 24 |
| discoverCapabilities | function | 37 |
| resolveCapabilities | function | 78 |
| refreshProjectSkills | function | 95 |
| capabilityLoader | function | 105 |

### src/compaction.js（391 行） — 后台独立摘要、token/占比阈值、快照校验与 turn 安全提交

| 符号 | 类型 | 行 |
|---|---|---|
| contextTokens | function | 22 |
| prepareBackgroundCompaction | function | 29 |
| DEFAULT_COMPACTION_CONFIG | const | 56 |
| normalizeCompaction | function | 58 |
| overCompactionThreshold | function | 62 |
| entryIdFor | function | 68 |
| summarizedEntryIds | function | 81 |
| COMPACT_MAX | const | 102 |
| parseSummaryOutput | function | 103 |
| throwIfAborted | function | 127 |
| summarizeWithPiSession | function | 131 |
| throwIfAborted | method | 132 |
| createBackgroundCompaction | function | 205 |

### src/database.js（103 行） — 共享 SQLite 连接、小配置 KV、WAL 与一致性备份

| 符号 | 类型 | 行 |
|---|---|---|
| nodeOk | const | 5 |
| Database | class | 19 |
| constructor | method | 23 |
| get | method | 53 |
| set | method | 63 |
| list | method | 78 |
| prepare | method | 91 |
| exec | method | 95 |
| close | method | 99 |

### src/goal.js（988 行） — Goal：会话级目标状态、轮次计划、验收门与持久化

| 符号 | 类型 | 行 |
|---|---|---|
| GOAL_PHASES | const | 45 |
| GOAL_ACTIONS | const | 48 |
| ROUND_STATUSES | const | 50 |
| GOAL_MAX_SEGMENTS | const | 52 |
| SUMMARY_MAX | const | 54 |
| NON_EVIDENCE_TOOLS | const | 56 |
| ACTIVE_TASKS | const | 57 |
| messageText | const | 59 |
| normCriterion | const | 63 |
| bodyText | const | 66 |
| firstLine | const | 67 |
| normalizeToolResult | const | 69 |
| TABLE | const | 82 |
| createGoalStore | function | 88 |
| GoalStore | class | 92 |
| constructor | method | 97 |
| load | method | 108 |
| save | method | 119 |
| remove | method | 129 |
| list | method | 138 |
| planText | const | 153 |
| planRound | const | 154 |
| planSchema | const | 159 |
| evidenceItem | const | 166 |
| evidenceSchema | const | 172 |
| field | const | 177 |
| list | const | 178 |
| result | const | 179 |
| bullets | const | 180 |
| Goal | class | 184 |
| constructor | method | 193 |
| snapshot | method | 209 |
| evidence | method | 235 |
| failure | method | 240 |
| context | method | 245 |
| submitPlan | method | 312 |
| planTool | method | 345 |
| blockTool | method | 384 |
| progressTool | method | 395 |
| verificationTool | method | 408 |
| submitEvidence | method | 449 |
| noteToolResult | method | 510 |
| action | method | 518 |
| onReply | method | 536 |
| pauseAtSafePoint | method | 579 |
| fail | method | 592 |
| settle | method | 600 |
| whenSettled | method | 606 |
| freeze | method | 612 |
| exit | method | 622 |
| remove | method | 631 |
| supplyObjective | method | 671 |

### src/inline-images.js（32 行） — 模型上下文图片定位：将占位符与真实附件交错排列，不改存储与队列

| 符号 | 类型 | 行 |
|---|---|---|
| inlineImages | function | 2 |
| inlineImagesExtension | function | 29 |

### src/main.js（122 行） — 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理

| 符号 | 类型 | 行 |
|---|---|---|
| port | const | 17 |
| cwd | const | 20 |
| home | const | 25 |
| database | const | 34 |
| modelStorage | const | 35 |
| factory | const | 37 |
| sessions | const | 42 |
| models | const | 44 |
| service | const | 47 |
| app | const | 80 |
| remoteReady | const | 85 |
| initRemote | function | 93 |
| closing | const | 103 |
| stop | function | 104 |

### src/model-auth.js（89 行） — SDK 登录桥：连接隔离、超时取消与安全事件投影

| 符号 | 类型 | 行 |
|---|---|---|
| safeUrl | const | 3 |
| text | const | 9 |
| eventView | function | 10 |
| createModelAuthService | function | 17 |

### src/model-config.js（619 行） — Pi models.json 无损配置读写与共享收藏持久化

| 符号 | 类型 | 行 |
|---|---|---|
| sdkModelConfig | const | 11 |
| sdkResolveConfigValue | const | 12 |
| digest | const | 26 |
| LEVELS | const | 27 |
| FAVORITE_GROUPS | const | 28 |
| FAVORITE_CAP | const | 29 |
| DISCOVER_APIS | const | 31 |
| DISCOVER_BODY_LIMIT | const | 37 |
| DISCOVER_MODEL_CAP | const | 38 |
| providerPattern | const | 39 |
| envPattern | const | 41 |
| kindOf | const | 43 |
| maskHeaders | const | 44 |
| maskModel | const | 53 |
| maskProvider | function | 58 |
| resolveSecret | function | 75 |
| checkBaseUrl | function | 87 |
| mergeHeaders | function | 97 |
| mergeProvider | function | 108 |
| applyModel | function | 132 |
| validFavoriteKey | function | 149 |
| resolveDiscoverSecret | function | 168 |
| readBodyCapped | function | 179 |
| parseDiscoverBody | function | 205 |
| normalizeFavorites | function | 250 |
| HIDDEN_CAP | const | 260 |
| normalizeHidden | function | 261 |
| createModelsService | function | 266 |

### src/pi-model-storage.js（409 行） — 模型与凭据 SQLite 权威存储、Pi 派生兼容文件

| 符号 | 类型 | 行 |
|---|---|---|
| sdkResolveConfigValue | const | 10 |
| sdkIsCommandConfigValue | const | 11 |
| NAMESPACE | const | 26 |
| AUTH_NAMESPACE | const | 27 |
| MIGRATED_NAMESPACE | const | 28 |
| CONFIG_KEY | const | 29 |
| FAVORITES_KEY | const | 30 |
| HIDDEN_KEY | const | 32 |
| IMPORT_ERROR_KEY | const | 33 |
| canonicalModelsJson | function | 36 |
| isPlainObject | const | 40 |
| isCredential | const | 42 |
| isPlainObject | method | 43 |
| createPiModelStorage | function | 51 |

### src/pi.js（510 行） — createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档）

| 符号 | 类型 | 行 |
|---|---|---|
| agentRuntime | function | 15 |
| queueStateOf | function | 31 |
| hasModelOutput | function | 50 |
| withdrawQueue | function | 60 |
| recallLastMessage | function | 70 |
| CHECKPOINT_BOUNDARY | const | 98 |
| memoryExtension | function | 108 |
| createPiFactory | function | 133 |

### src/prompts.js（35 行） — Axiom 自有提示词按 main/subagent/compaction 角色集中维护

| 符号 | 类型 | 行 |
|---|---|---|
| USER_COMMUNICATION | const | 2 |
| DELEGATION_PROMPT | const | 8 |
| TITLE_INSTRUCTION | const | 9 |
| SUBAGENT_PROMPT | const | 12 |
| WRAP_UP_PROMPT | const | 13 |
| budgetSystemPrompt | const | 14 |
| SUMMARY_SYSTEM_PROMPT | const | 18 |
| summaryRequest | function | 21 |

### src/protocol.js（346 行） — zod 协议：selection / command 判别联合（消息类型见 L3）

| 符号 | 类型 | 行 |
|---|---|---|
| id | const | 5 |
| capabilities | const | 6 |
| workspace | const | 9 |
| thinking | const | 10 |
| queueType | const | 11 |
| base64Pattern | const | 13 |
| decodedBytes | const | 14 |
| promptImage | const | 15 |
| promptImages | const | 26 |
| imageSignatures | const | 31 |
| assertPromptImages | function | 38 |
| compactionDefaults | const | 45 |
| compaction | const | 49 |
| retryPatterns | const | 59 |
| selection | const | 65 |
| taskBudget | const | 78 |
| providerKey | const | 83 |
| modelKey | const | 86 |
| secretValueIn | const | 93 |
| secretHeadersIn | const | 98 |
| thinkingLevelMapIn | const | 99 |
| costIn | const | 107 |
| providerConfigIn | const | 126 |
| modelConfigIn | const | 144 |
| modelOverrideIn | const | 161 |
| fingerprintIn | const | 162 |
| command | const | 163 |

### src/questions.js（86 行） — 主代理 question 工具、参数校验与可取消的回答等待

| 符号 | 类型 | 行 |
|---|---|---|
| text | const | 3 |
| option | const | 4 |
| input | const | 5 |
| questionAnswers | const | 12 |
| string | const | 13 |
| createQuestions | function | 16 |

### src/remote.js（547 行） — Tailscale 登录身份、远程监听、同账号授权与本机配置持久化

| 符号 | 类型 | 行 |
|---|---|---|
| configSchema | const | 13 |
| execOptions | const | 17 |
| cliEnv | const | 19 |
| defaultRun | const | 20 |
| defaultCandidates | const | 27 |
| createTailscale | const | 41 |
| isTailnetIPv4 | const | 78 |
| selfStatus | function | 89 |
| whoisUser | function | 111 |
| describeError | const | 122 |
| defaultSpawnLogin | const | 132 |
| spawn | method | 133 |
| AUTH_URL | const | 134 |
| MAX_WHOIS | const | 137 |
| LOGIN_OUTPUT_CAP | const | 138 |
| createRemoteAccess | function | 140 |

### src/retry.js（196 行） — 模型失败重试：可取消退避、最多45次、16分钟封顶、自定义错误词表、保留已有工具结果继续

| 符号 | 类型 | 行 |
|---|---|---|
| RETRY_DELAYS_MS | const | 5 |
| MAX_DELAY_MS | const | 6 |
| MAX_RETRIES | const | 7 |
| RECOVERY_PROMPT | const | 8 |
| delayFor | const | 9 |
| MAX_TIMEOUT_MS | const | 15 |
| abortableSleep | const | 16 |
| classify | class | 52 |
| dropFailedAssistant | function | 76 |
| RESUMABLE_STOP_REASONS | const | 85 |
| canResume | function | 86 |
| createAutoRetry | function | 102 |

### src/server.js（506 行） — createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发

| 符号 | 类型 | 行 |
|---|---|---|
| dev | const | 10 |
| digest | const | 11 |
| load | const | 12 |
| freshen | const | 17 |
| assets | const | 27 |
| createServerApp | function | 67 |

### src/session-memory.js（29 行） — 标题提取登记、轮次预算挂钩与委派背景

| 符号 | 类型 | 行 |
|---|---|---|
| textOf | const | 4 |
| memoryHooks | function | 11 |

### src/session-store.js（479 行） — 会话三表、实体增量更新、逐会话事务与旧数据迁移

| 符号 | 类型 | 行 |
|---|---|---|
| EVENT_TYPES | const | 13 |
| SESSION_FIELDS | const | 16 |
| TABLES | const | 31 |
| INDEXES | const | 67 |
| BACKFILL_EVENT_KEYS | const | 79 |
| DEAD_TABLES | const | 84 |
| DEAD_COLUMNS | const | 85 |
| DEAD_EVENT_TYPES | const | 86 |
| SessionStore | class | 88 |
| constructor | method | 92 |
| change | method | 155 |
| hasSession | method | 177 |
| listSessions | method | 182 |
| listPendingSessionIds | method | 203 |
| getSession | method | 211 |
| insertSession | method | 311 |
| importLegacySession | method | 337 |
| migrateLegacy | method | 354 |
| updateSession | method | 376 |
| deleteSession | method | 400 |
| saveEvent | method | 406 |
| deleteEvents | method | 432 |
| saveTask | method | 450 |
| listTasks | method | 473 |

### src/sessions.js（1596 行） — Sessions：会话生命周期、增量保存、元数据启动与SDK按需恢复

| 符号 | 类型 | 行 |
|---|---|---|
| GOAL_TOOL_NAMES | const | 21 |
| hasRunningTasks | const | 23 |
| BROWSE_PAGE | const | 26 |
| SEARCH_LIMIT | const | 28 |
| SEARCH_DIR_LIMIT | const | 29 |
| IGNORED_ENTRIES | const | 31 |
| fuzzyHit | function | 34 |
| matchRank | function | 45 |
| searchEntries | function | 54 |
| pointStatus | function | 82 |
| trackElapsed | function | 89 |
| resolveDir | function | 99 |
| parentOf | function | 110 |
| absoluteCrumbs | function | 119 |
| importedTitle | function | 141 |
| hostLocations | function | 163 |
| landedSessionFile | function | 182 |
| RETRYABLE_SQLITE | const | 189 |
| retryableWrite | const | 190 |
| DEFAULTS_NS | const | 194 |
| WORKSPACE_PREFIX | const | 195 |
| workspaceKeyOf | const | 196 |
| validateProjectSkills | function | 199 |
| validateProjectSkillEntry | function | 203 |
| Sessions | class | 210 |
| constructor | method | 211 |
| applyDefaults | method | 236 |
| loadDefaults | method | 243 |
| migrateDefaults | method | 255 |
| migrateLegacyStore | method | 270 |
| loadWorkspaceDefaults | method | 294 |
| loadTaskBudget | method | 313 |
| getTaskBudget | method | 328 |
| configureTaskBudget | method | 334 |
| getDefaults | method | 341 |
| defaultsFor | method | 345 |
| listDefaults | method | 349 |
| deleteDefaults | method | 355 |
| removeDefaults | method | 360 |
| workspaceDefaults | method | 371 |
| configureDefaults | method | 389 |
| saveDefaults | method | 395 |
| pushCompaction | method | 433 |
| validateSelection | method | 444 |
| validateCompaction | method | 475 |
| load | method | 490 |
| ensureLoaded | method | 515 |
| migrateLegacySessions | method | 537 |
| sessionData | method | 561 |
| persist | method | 580 |
| writeChange | method | 609 |
| saveChange | method | 625 |
| list | method | 630 |
| rename | method | 647 |
| importSession | method | 660 |
| create | method | 687 |
| goalAction | method | 1042 |
| scheduleGoal | method | 1088 |
| advanceGoal | method | 1100 |
| goalNotificationsBlocked | method | 1138 |
| scheduleTaskNotifications | method | 1145 |
| deliverTaskNotifications | method | 1157 |
| get | method | 1185 |
| revealWorkspace | method | 1190 |
| browse | method | 1204 |
| listFiles | method | 1210 |
| refreshSkills | method | 1272 |
| snapshot | method | 1278 |
| subscribe | method | 1310 |
| configure | method | 1316 |
| startRun | method | 1352 |
| retry | method | 1391 |
| prompt | method | 1400 |
| withdraw | method | 1435 |
| replyQuestion | method | 1484 |
| cancel | method | 1490 |
| retryTask | method | 1516 |
| deleteRecords | method | 1527 |
| remove | method | 1538 |
| close | method | 1586 |

### src/task-budget.js（35 行） — 主子代理轮次预算规则、收尾提示词与配置页参数校验

| 符号 | 类型 | 行 |
|---|---|---|
| TASK_BUDGET_LIMITS | const | 10 |
| taskBudgetDefaults | const | 13 |
| within | const | 15 |
| taskBudgetPolicy | function | 22 |

### src/tasks.js（210 行） — Tasks：子任务（委托）生命周期

| 符号 | 类型 | 行 |
|---|---|---|
| ACTIVE | const | 4 |
| historyResult | const | 7 |
| Tasks | class | 16 |
| constructor | method | 17 |
| start | method | 25 |
| snapshotJob | method | 41 |
| publish | method | 50 |
| view | method | 57 |
| retryable | method | 64 |
| snapshot | method | 69 |
| run | method | 73 |
| read | method | 150 |
| retry | method | 158 |
| append | method | 177 |
| cancel | method | 187 |
| interrupt | method | 203 |

### src/tools.js（110 行） — delegationTools：委托/凭证读取/追加工具定义（zod 入参）

| 符号 | 类型 | 行 |
|---|---|---|
| delegateInput | const | 3 |
| readInput | const | 11 |
| appendInput | const | 14 |
| result | const | 21 |
| delegationTools | function | 25 |

### src/update.js（41 行） — 检查更新：本地安装（提交 SHA/版本）比对 GitHub 公开仓库 master，npm 安装实例可自动重装

| 符号 | 类型 | 行 |
|---|---|---|
| repo | const | 6 |
| npmSpec | const | 7 |
| commitFile | const | 8 |
| validateCommit | function | 10 |
| checkUpdate | function | 15 |

### tests/activity-groups-ui.py（201 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| activityHistory | const | 16 |
| sessions | const | 27 |

### tests/answer-tags.test.js（48 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| open | const | 5 |

### tests/app.test.js（1765 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| pickerSource | const | 10 |
| modelSources | const | 11 |
| serviceSource | const | 16 |

### tests/autostart.test.js（71 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| node | const | 16 |
| cwd | const | 17 |
| service | const | 18 |

### tests/benchmark.js（92 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| window | const | 9 |

### tests/cli-help.test.js（46 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| cli | const | 27 |
| spawnSync | method | 28 |

### tests/codebase-index.test.js（20 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| ROOT | const | 7 |
| SKILL | const | 8 |
| execFileSync | method | 11 |

### tests/compaction-ui.test.js（187 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 11 |
| restore | method | 39 |

### tests/compaction.test.js（823 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| fakeModel | const | 104 |
| createTestSession | function | 117 |
| seq | const | 134 |
| userMsg | const | 135 |
| assistantMsg | const | 136 |
| big | const | 142 |
| seed | function | 144 |
| settle | const | 149 |
| waitFor | function | 151 |
| enabledConfig | const | 159 |
| fakeSummarize | function | 168 |
| startHangingLlmServer | function | 176 |
| startFakeLlmServer | function | 199 |
| zodError | method | 256 |
| zodError | method | 257 |
| zodError | method | 258 |
| zodError | method | 259 |
| zodError | method | 260 |
| zodError | method | 261 |
| hangingSummarize | function | 586 |
| createLoopSession | function | 683 |
| writeFileSync | method | 684 |

### tests/conversation-preview.mjs（124 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| markdown | const | 4 |
| message | const | 21 |
| thinking | const | 26 |
| state | const | 38 |
| sequence | const | 45 |
| add | const | 46 |
| assistant | const | 47 |
| add | method | 59 |
| add | method | 60 |
| states | const | 64 |
| longState | const | 75 |
| compactState | const | 91 |
| sessions | const | 113 |
| app | const | 121 |
| port | const | 122 |

### tests/file-picker.test.js（67 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| source | const | 6 |
| tick | const | 7 |

### tests/goal-command-ui.test.js（141 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 10 |
| restore | method | 46 |
| $ | const | 49 |
| settle | const | 50 |
| input | const | 51 |
| key | const | 52 |

### tests/goal-markers.test.js（115 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 17 |
| restore | method | 46 |
| lastAssistant | const | 50 |

### tests/goal-pi.test.js（288 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| PREAMBLE | const | 15 |
| FOOTER | const | 74 |
| run | const | 79 |

### tests/goal-preview.mjs（148 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| cwd | const | 7 |
| seq | const | 8 |
| text | const | 9 |
| makeState | const | 10 |
| add | const | 16 |
| result | const | 18 |
| add | method | 19 |
| call | const | 20 |
| goalFor | const | 21 |
| plan | const | 27 |
| ROUND0 | const | 39 |
| running | const | 50 |
| runningGoal | const | 52 |
| EVIDENCE | const | 71 |
| paused | const | 81 |
| pausedGoal | const | 83 |
| ready | const | 96 |
| readyGoal | const | 98 |
| chat | const | 105 |
| fresh | const | 110 |
| states | const | 112 |
| goals | const | 113 |
| sessions | const | 114 |
| app | const | 130 |
| preferred | const | 132 |
| listen | method | 146 |

### tests/goal-sessions.test.js（711 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| PLAN | const | 11 |
| factoryFixture | function | 22 |
| tick | const | 52 |
| until | function | 53 |
| ordinary | function | 59 |
| enterGoal | function | 68 |
| injectToolResult | function | 274 |
| reply | function | 282 |
| evidenceBody | const | 294 |

### tests/goal-ui.test.js（430 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 10 |
| restore | method | 49 |
| $ | const | 52 |
| labels | const | 53 |
| messages | const | 54 |

### tests/goal.test.js（853 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| ROUND | const | 9 |
| GOAL | const | 10 |
| PLAN | const | 12 |
| PLAN2 | const | 18 |
| PLAN_MULTI | const | 24 |
| make | const | 34 |
| asst | const | 40 |
| toolText | const | 41 |
| call | const | 42 |
| runningGoal | const | 45 |
| verifyingGoal | const | 54 |
| evidenceTool | const | 60 |

### tests/helpers/model-concurrency-child.mjs（82 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| barrier | const | 11 |
| writeSync | method | 12 |
| runOpponent | function | 17 |
| createInterface | method | 29 |

### tests/helpers/public-source.js（10 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| publicSource | const | 5 |

### tests/image-input.test.js（169 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| pngBase64 | const | 13 |
| jpegBase64 | const | 14 |
| image | const | 15 |
| parsePrompt | const | 17 |

### tests/inline-images.test.js（42 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| text | const | 5 |
| a | const | 6 |
| b | const | 7 |
| user | const | 8 |
| inlineImagesExtension | method | 32 |

### tests/install.test.js（150 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| fakeService | const | 109 |

### tests/manual-retry.test.js（197 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| session | const | 12 |
| assistant | const | 13 |
| dropFailedAssistant | method | 28 |
| dropFailedAssistant | method | 32 |
| dropFailedAssistant | method | 35 |
| finish | method | 62 |
| finish | method | 83 |
| page | function | 99 |
| restore | method | 128 |
| message | const | 132 |
| prompt | const | 133 |

### tests/memory-preview.mjs（22 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| state | const | 3 |
| sessions | const | 12 |
| app | const | 19 |

### tests/memory-ui.test.js（123 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 14 |
| restore | method | 43 |

### tests/message-activity.test.js（427 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 11 |
| restore | method | 39 |
| assistant | const | 43 |
| thought | const | 44 |
| call | const | 45 |
| entry | const | 46 |

### tests/model-auth.test.js（133 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| SECRET | const | 5 |
| fakeAuth | function | 8 |
| waitFor | function | 19 |
| noLeak | const | 29 |
| status | const | 30 |
| noLeak | method | 49 |
| noLeak | method | 55 |
| noLeak | method | 63 |
| noLeak | method | 75 |
| noLeak | method | 131 |

### tests/model-config.test.js（1159 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| sha | const | 19 |
| EMPTY | const | 21 |
| tempDir | function | 23 |
| openDatabases | const | 28 |
| closeOpenDatabases | const | 29 |
| makeService | function | 33 |
| seed | const | 54 |
| compat | const | 61 |
| discoverKey | const | 662 |
| mockFetch | const | 663 |
| jsonResponse | const | 672 |
| test | method | 951 |

### tests/model-manager.test.js（1229 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| authSource | const | 10 |
| source | const | 11 |
| tick | const | 14 |
| j | const | 16 |
| masked | const | 18 |
| harness | function | 20 |
| apiSelect | method | 83 |
| apiSelect | method | 84 |
| setInput_on | method | 245 |
| setInput_on | function | 273 |
| modelDelete | method | 336 |
| dialogButton | method | 340 |
| modelDelete | method | 346 |
| dialogButton | method | 348 |
| dialogButton | method | 366 |
| confirm | method | 399 |
| confirm | method | 406 |
| row | method | 536 |
| row | method | 547 |
| discoverPanelEl | const | 847 |
| discoverRows | const | 848 |
| rowBox | const | 849 |
| addSelectedButton | const | 850 |
| fetchButton | const | 851 |
| checkRow | const | 852 |
| rowBox | method | 853 |
| rowBox | method | 854 |
| fetchButton | method | 864 |
| checkRow | method | 885 |
| fetchButton | method | 897 |
| checkRow | method | 909 |
| checkRow | method | 910 |
| addSelectedButton | method | 911 |
| fetchButton | method | 945 |
| addSelectedButton | method | 952 |
| addSelectedButton | method | 971 |
| fetchButton | method | 993 |
| fetchButton | method | 1001 |
| fetchButton | method | 1024 |
| fetchButton | method | 1043 |
| fetchButton | method | 1046 |
| fetchButton | method | 1063 |
| fetchButton | method | 1069 |
| sonnetCatalog | const | 1087 |
| openSonnet | const | 1092 |
| checkLevel | const | 1099 |
| checkLevel | method | 1116 |
| checkLevel | method | 1144 |
| confirmDialog | method | 1182 |
| confirmDialog | method | 1214 |

### tests/model-onboarding-ui.test.js（154 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| stripImports | const | 9 |
| modelSources | const | 10 |
| pickerSource | const | 15 |
| memoryTagsSource | const | 16 |
| appSource | const | 17 |
| config | const | 19 |
| harness | const | 20 |

### tests/model-picker.test.js（311 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| source | const | 6 |
| tick | const | 7 |
| nap | const | 8 |
| OPTS | const | 10 |
| SELECT | const | 14 |
| boot | function | 17 |
| $ | const | 35 |
| key | const | 36 |
| click | const | 38 |
| menu | const | 39 |
| opts | const | 40 |
| stars | const | 41 |

### tests/model-selection-preview.mjs（52 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| home | const | 11 |
| catalog | const | 12 |
| factory | const | 18 |
| sessions | const | 33 |
| database | const | 35 |
| storage | const | 36 |
| models | const | 38 |
| app | const | 41 |
| port | const | 42 |
| close | function | 44 |

### tests/model-thinking-favorites.test.js（122 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| appSource | const | 10 |
| pickerSource | const | 11 |
| modelSources | const | 12 |
| html | const | 17 |
| MODEL_KEY | const | 19 |
| bootPage | function | 21 |
| click | const | 76 |
| menu | const | 77 |
| opts | const | 78 |
| stars | const | 79 |

### tests/pi-model-storage.test.js（624 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| tempDir | function | 13 |
| makeStorage | function | 18 |
| seedPiModels | const | 23 |
| seedPiAuth | const | 27 |

### tests/question-preview.mjs（36 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 5 |
| sessions | const | 31 |
| app | const | 33 |
| port | const | 34 |

### tests/question-ui.test.js（98 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| source | const | 5 |

### tests/questions.test.js（110 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| params | const | 28 |

### tests/recall.test.js（202 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| user | const | 9 |
| assistant | const | 10 |
| thinking | const | 11 |
| fixture | function | 13 |

### tests/remote-ui.test.js（224 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 11 |
| modelSources | const | 16 |
| flush | const | 40 |
| stubRequest | function | 41 |
| submit | const | 51 |

### tests/remote.test.js（750 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| EMAIL | const | 21 |
| mockTailscale | const | 23 |
| fakeChild | const | 76 |
| fakeDatabase | const | 94 |
| setup | const | 113 |
| wsRequest | const | 154 |
| setTimeout | method | 547 |

### tests/retry.test.js（407 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| RATE_LIMIT | const | 6 |
| QUOTA | const | 7 |
| ABORTED | const | 8 |
| fakeSession | function | 15 |
| recorder | function | 53 |
| recordedSleep | const | 63 |
| lastAssistant | const | 73 |

### tests/service-settings.test.js（377 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| source | const | 11 |
| html | const | 12 |
| setup | function | 14 |

### tests/service.test.js（684 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| until | const | 17 |
| readMaybe | const | 26 |
| killTree | const | 27 |
| buildWorkspace | const | 34 |
| WORKER | const | 49 |
| fs | const | 50 |
| retry | const | 55 |
| ready | const | 74 |
| ready | method | 82 |
| ready | method | 85 |
| startDaemon | const | 89 |
| spawn | method | 91 |
| startTest | const | 96 |
| maintEnv | const | 105 |
| getStatus | const | 106 |
| stateOf | const | 112 |
| teardown | const | 119 |
| NPM_FAKE | const | 127 |
| say | const | 131 |
| sdkStub | const | 132 |
| mkdirSync | method | 133 |
| writeFileSync | method | 134 |
| writeFileSync | method | 135 |
| rmSync | method | 143 |
| sdkStub | method | 145 |
| writeFileSync | method | 146 |
| writeFileSync | method | 147 |
| writeFileSync | method | 148 |
| rmSync | method | 156 |
| sdkStub | method | 157 |
| writeFileSync | method | 158 |
| installNpmShim | const | 164 |
| A40 | const | 177 |
| fs | const | 567 |
| home | const | 569 |
| fs | const | 654 |

### tests/session-created-at.test.js（44 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 8 |

### tests/session-flow.test.js（451 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| flowFactory | const | 92 |
| jsonlFactory | const | 102 |

### tests/session-memory.test.js（110 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| reply | const | 9 |

### tests/session-migration.test.js（282 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 10 |
| workspaceHash | const | 20 |

### tests/session-model-restore.test.js（61 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| stubFactory | function | 9 |
| cleanup | const | 17 |

### tests/session-persistence.test.js（422 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 10 |

### tests/session-store.test.js（640 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| withStore | function | 11 |
| fullSaved | function | 24 |
| withStore | method | 48 |
| withStore | method | 60 |
| withStore | method | 71 |
| withStore | method | 87 |
| withStore | method | 98 |
| withStore | method | 119 |
| withStore | method | 139 |
| withStore | method | 167 |
| withStore | method | 181 |
| withStore | method | 207 |
| withStore | method | 225 |
| withStore | method | 254 |
| withStore | method | 316 |
| withStore | method | 341 |
| withStore | method | 355 |
| withStore | method | 380 |
| withStore | method | 393 |
| LEGACY_DDL | const | 424 |
| withStore | method | 516 |
| withStore | method | 591 |

### tests/smoke.js（67 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| TIMEOUT | const | 5 |
| sessions | const | 7 |
| assert | method | 46 |
| assert | method | 50 |
| assert | method | 51 |
| assert | method | 56 |
| assert | method | 57 |

### tests/sqlite-benchmark.mjs（914 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| parseArgs | function | 32 |
| args | const | 42 |
| scriptPath | const | 43 |
| repoDir | const | 44 |
| mode | const | 45 |
| bytesOf | const | 49 |
| since | const | 50 |
| kb | const | 51 |
| pct | const | 53 |
| rss | const | 57 |
| fileStat | const | 58 |
| tick | const | 60 |
| loopMonitor | function | 65 |
| WRITE_SQL | const | 85 |
| instrument | function | 86 |
| countingStore | function | 127 |
| SIZES | const | 140 |
| REPS | const | 146 |
| filler | const | 148 |
| makeSession | function | 151 |
| writeFileSync | method | 154 |
| makeDataset | function | 185 |
| oldPersist | function | 195 |
| runStorage | function | 212 |
| fakeAgentFactory | function | 325 |
| runE2E | function | 345 |
| runGates | function | 417 |
| lockHolder | function | 559 |
| lockVictim | function | 578 |
| runLock | function | 603 |
| rmSync | method | 655 |
| childResult | function | 660 |
| judge | function | 670 |
| selfCheck | function | 682 |
| main | function | 771 |
| writeFileSync | method | 794 |
| spawnSync | method | 795 |
| writeFileSync | method | 801 |
| cpSync | method | 803 |
| rmSync | method | 865 |
| line | method | 869 |
| line | method | 870 |
| line | method | 871 |
| line | method | 872 |
| line | method | 873 |
| line | method | 893 |
| line | method | 894 |
| line | method | 899 |
| line | method | 901 |
| line | method | 907 |
| emit | method | 909 |

### tests/subagent-persistence.test.js（123 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | function | 10 |

### tests/task-budget.test.js（102 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 10 |

### tests/task-notifications.test.js（197 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factoryFixture | function | 10 |
| tick | const | 28 |
| until | function | 29 |

### tests/task-resume.test.js（182 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| fakeAgent | function | 9 |
| fixture | function | 36 |
| restored | const | 46 |

### tests/task-timer.test.js（55 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 9 |
| state | const | 19 |
| settle | const | 20 |

### tests/tasks.test.js（132 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| fixture | function | 7 |
| assert | method | 53 |

### tests/tooltip.test.js（282 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| source | const | 6 |
| boot | function | 11 |
| fire | const | 68 |
| tip | const | 74 |
| fire | method | 79 |
| fire | method | 88 |
| fire | method | 99 |
| fire | method | 102 |
| fire | method | 110 |
| fire | method | 112 |
| fire | method | 115 |
| fire | method | 117 |
| fire | method | 139 |
| fire | method | 150 |
| fire | method | 153 |
| fire | method | 156 |
| fire | method | 158 |
| fire | method | 167 |
| fire | method | 170 |
| fire | method | 174 |
| fire | method | 183 |
| fire | method | 185 |
| fire | method | 196 |
| fire | method | 202 |
| fire | method | 204 |
| fire | method | 212 |
| fire | method | 223 |
| fire | method | 235 |
| fire | method | 245 |
| fire | method | 254 |
| fire | method | 255 |
| fire | method | 257 |
| fire | method | 268 |
| fire | method | 270 |
| fire | method | 271 |
| fire | method | 276 |

### tests/ui-sticky-check.html（63 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| checks | const | 45 |
| lines | const | 55 |
| ok | const | 56 |

### tests/ui-sticky-check.mjs（104 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| here | const | 10 |
| candidates | const | 11 |
| browser | const | 18 |
| port | const | 20 |
| profile | const | 21 |
| proc | const | 22 |
| sleep | const | 27 |
| target | const | 28 |
| ws | const | 37 |
| seq | const | 39 |
| pending | const | 40 |
| send | const | 45 |
| waitEvent | const | 48 |
| loaded | const | 54 |
| expression | const | 59 |
| result | const | 80 |
| checks | const | 81 |
| shotPath | const | 84 |
| shot | const | 85 |
| writeFileSync | method | 87 |
| ok | const | 95 |

### tests/update.test.js（38 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| old | const | 8 |

### tests/workspace-tabs.test.js（235 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| appSource | const | 10 |
| pickerSource | const | 11 |
| modelSources | const | 12 |
| html | const | 17 |
| state | const | 19 |
| STATES | const | 24 |
| bootPage | function | 30 |
| attachCalls | const | 84 |

## L3 横切常量（跨模块定位入口）

- 协议 command.type：image、inherit、goal.action、service.status、service.update.check、service.restart、remote.get、remote.login、remote.configure、session.rename、workspace.reveal、workspace.browse、files.browse、models.list、models.config.get、models.provider.save、models.provider.delete、models.provider.rename、models.model.save、models.model.delete、models.provider.discover、models.favorites.get、models.model.override、models.auth.list、models.auth.start、models.auth.status、models.auth.respond、models.auth.cancel、models.auth.logout、models.hidden.set、models.favorites.set、capabilities.list、session.defaults.get、session.defaults.configure、session.defaults.list、session.defaults.delete、task.budget.get、task.budget.configure、session.configure、sessions.list、session.create、session.import、session.attach、session.skills.refresh、session.close、prompt、cancel、question.reply、session.retry、task.retry、queue.withdraw、tasks.read（src/protocol.js）
- HTML id：sidebar、open-workspace、new、import-session、search、sessions、open-settings、sidebar-backdrop、toggle-sidebar、session-title、workspace-label、copy-workspace、reveal-workspace、workspace-feedback、github-link、status、service-dev、service-version、toggle-theme、login、maintenance-state、connect、workspace、goal-track、earliest、transcript、output、goal-dock、question-dock、latest、message-queue、task-runs、compaction-progress、add-context、add-image、goal-enter、image-files、context-chips、task-timer、task-timer-value、context-menu、context-picker、context-back、context-title、context-close、context-search、context-results、context-error、image-attachments、composer、prompt、prompt-completion、composer-skill、agent-role、provider、model、thinking、stop、send-steer、send-followup、send、session-runtime、mobile-runtime、mobile-expand、composer-help、error、session-action、session-action-form、session-action-title、session-action-description、session-name-label、session-name、session-action-error、session-action-cancel、session-action-submit、image-preview、image-preview-close、image-preview-image、restart-dialog、restart-form、restart-title、restart-description、restart-warning、restart-cancel、restart-submit、task-overlays、task-template、goal-plan、goal-plan-title、goal-plan-meta、goal-plan-constraints-title、goal-plan-constraints、goal-plan-acceptance-title、goal-plan-acceptance、goal-plan-rounds-section、goal-plan-rounds-title、goal-plan-rounds、goal-plan-close、goal-plan-confirm、settings、settings-title、settings-defaults-tab、settings-remote-tab、settings-models-tab、settings-service-tab、defaults-panel、selection-copy-title、selection-copy、selection-copy-help、selection-copy-feedback、queue-type、steer-help、followup-help、defaults-preview、task-budget-title、task-max-turns、task-wrap-up-window、task-budget-help、subagent-title、subagent-help、subagent-provider、subagent-model、settings-feedback、defaults-title、defaults-workspace、defaults-directory、defaults-delete、defaults-workspace-help、defaults-editor、create-form、create-defaults-help、create-agents、create-compaction、create-retry、create-feedback、remote-panel、remote-status-title、remote-status、remote-login、remote-auth、remote-url、remote-form、remote-note、remote-enabled、remote-email、remote-email-help、remote-feedback、remote-refresh、remote-save、models-panel、service-panel、service-state-title、service-feedback、service-restart-title、restart-quick、restart-rebuild、service-recover、service-update-section、service-update-title、update-check、update-result、update-install、service-history-title、service-history（public/index.html）
- HTTP 静态路由：/、/favicon.svg、/style.css、/theme.js、/app.js、/goal.js、/goal.css、/question.js、/question.css、/service-settings.js、/file-picker.js、/tooltip.js、/tooltip.css、/file-picker.css、/markdown.js、/stream-renderer.js、/markdown-scan.js、/memory-tags.js、/answer-tags.js、/goal-markers.js、/vendor/marked.js、/vendor/purify.js、/model-manager.js、/model-auth.js、/model-manager.css、/model-picker.js、/model-picker.css、/health（src/server.js）

## ⚠ 未登记文件（0）

（无）
