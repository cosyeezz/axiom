<!-- 自动生成，勿手改。重建：node .pi/skills/codebase-map/scripts/reindex.mjs -->
# Axiom 多级代码索引（生成于 2026/9/14 08:03:32）

## L1 模块总览（文件 → 职责）

| 文件 | 行数 | 职责 | 关键符号 |
|---|---|---|---|
| public/answer-tags.js | 48 | 主代理回答标签解析、代码保护与流式容错 | OPEN, CLOSE, splitAnswer |
| public/app.js | 3488 | 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度 | questionUI, filePicker, $, ws |
| public/file-picker.css | 276 | 文件选择弹窗主题与响应式布局 | - |
| public/file-picker.js | 355 | 共享文件/目录选择弹窗、懒加载与分类 SVG 图标 | NS, SEARCH_DEBOUNCE, el, FOLDER_COLORS |
| public/index.html | 323 | 页面骨架与元素 id（见 L3） | - |
| public/markdown.js | 317 | marked + DOMPurify 渲染（XSS 边界） | cache, policy, textLanguages, isText |
| public/memory-tags.js | 111 | 主子代理共享简单标签提取与流式显示过滤 | TAGS, NAMES, TAG, OPEN |
| public/model-auth.js | 97 | 网页登录：授权提示、设备码、凭据输入与取消 | createModelAuth |
| public/model-manager.css | 520 | 模型配置页：供应商列表、编辑表单与响应式布局 | - |
| public/model-manager.js | 1278 | 统一模型管理：供应商、字段覆盖与思考等级编辑 | THINKING_LEVELS, API_TYPES, PROVIDER_TEMPLATES, PROVIDER_ID |
| public/model-picker.css | 88 | 共享收藏下拉：浮层、星标、触屏与焦点样式 | - |
| public/model-picker.js | 300 | 共享模型选择器：供应商/模型/思考收藏、排序与键盘交互 | GAP, EDGE, TYPEAHEAD_MS, el |
| public/question.css | 31 | 提问面板样式、焦点与窄屏布局 | - |
| public/question.js | 169 | 主代理提问选项卡、键盘交互与回答提交 | createQuestionUI |
| public/service-settings.js | 278 | 设置页服务维护：真实进度、结果、更新确认与独立维护通道 | MAINT_URL_RE, POLL_MS, initServiceSettings |
| public/stream-renderer.js | 51 | 流式增量渲染状态机 | createStreamRenderer |
| public/style.css | 1419 | 全局样式（CSP 禁 inline style，样式一律进这里） | - |
| public/theme.js | 11 | 首帧前阻塞应用明/暗主题（localStorage axiom.theme，默认深色） | - |
| public/tooltip.css | 50 | 共享悬停说明样式（浅色主题下反色） | - |
| public/tooltip.js | 225 | 共享悬停说明：动态 title、键盘、定位与无障碍 | SHOW_DELAY, HIDE_DELAY, GAP, EDGE |
| scripts/autostart.mjs | 138 | Windows/macOS/Linux 当前用户登录自动启动安装/卸载 | run, projectDir, serviceEntry, label |
| scripts/dev.mjs | 12 | 开发入口：DEV 标识、4320 端口与独立数据目录 | - |
| scripts/install.mjs | 72 | 一键安装：装依赖/注册自启/启动守护/健康检查/打开浏览器 | root, parseArgs, ensurePi, viaShell |
| scripts/maint-server.mjs | 86 | loopback维护HTTP：来源校验、随机凭证、状态与离线恢复 | MAX_BODY, hash, json, startMaintServer |
| scripts/maint-state.mjs | 116 | 守护维护状态：持久化阶段、最近结果与有界脱敏证据 | NAMESPACE, LOG_LIMIT, sanitize, createMaintState |
| scripts/service.mjs | 597 | 服务守护：IPC 重启、HTTP 安全停止与崩溃退避停止通道 | root, output, run, npmRun |
| scripts/uninstall.mjs | 18 | 统一卸载：核对 npm 目标、安全停止、取消自启、保留用户数据 | uninstall |
| src/capabilities.js | 138 | 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities） | sdkEntry, resolver, alias, jiti |
| src/compaction.js | 375 | 后台独立摘要、token/占比阈值、快照校验与 turn 安全提交 | contextTokens, prepareBackgroundCompaction, DEFAULT_COMPACTION_CONFIG, normalizeCompaction |
| src/database.js | 103 | 共享 SQLite 连接、小配置 KV、WAL 与一致性备份 | nodeOk, Database |
| src/inline-images.js | 32 | 模型上下文图片定位：将占位符与真实附件交错排列，不改存储与队列 | inlineImages, inlineImagesExtension |
| src/main.js | 114 | 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理 | port, cwd, home, database |
| src/model-auth.js | 89 | SDK 登录桥：连接隔离、超时取消与安全事件投影 | safeUrl, text, eventView, createModelAuthService |
| src/model-config.js | 601 | Pi models.json 无损配置读写与共享收藏持久化 | sdkModelConfig, sdkResolveConfigValue, digest, LEVELS |
| src/pi-model-storage.js | 321 | 模型与凭据 SQLite 权威存储、Pi 派生兼容文件 | sdkResolveConfigValue, sdkIsCommandConfigValue, NAMESPACE, AUTH_NAMESPACE |
| src/pi.js | 387 | createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档） | agentRuntime, queueStateOf, hasModelOutput, withdrawQueue |
| src/prompts.js | 35 | Axiom 自有提示词按 main/subagent/compaction 角色集中维护 | USER_COMMUNICATION, DELEGATION_PROMPT, TITLE_INSTRUCTION, SUBAGENT_PROMPT |
| src/protocol.js | 356 | zod 协议：selection / command 判别联合（消息类型见 L3） | id, capabilities, workspace, thinking |
| src/questions.js | 86 | 主代理 question 工具、参数校验与可取消的回答等待 | text, option, input, questionAnswers |
| src/remote.js | 547 | Tailscale 登录身份、远程监听、同账号授权与本机配置持久化 | configSchema, execOptions, cliEnv, defaultRun |
| src/retry.js | 196 | 模型失败重试：可取消退避、最多45次、16分钟封顶、自定义错误词表、保留已有工具结果继续 | RETRY_DELAYS_MS, MAX_DELAY_MS, MAX_RETRIES, RECOVERY_PROMPT |
| src/server.js | 502 | createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发 | dev, digest, load, freshen |
| src/session-memory.js | 29 | 标题提取登记、轮次预算挂钩与委派背景 | textOf, memoryHooks |
| src/session-store.js | 458 | 会话三表、实体增量更新、逐会话事务与旧数据迁移 | EVENT_TYPES, SESSION_FIELDS, TABLES, INDEXES |
| src/sessions.js | 1369 | Sessions：会话生命周期、增量保存、元数据启动与SDK按需恢复 | BROWSE_PAGE, SEARCH_LIMIT, SEARCH_DIR_LIMIT, IGNORED_ENTRIES |
| src/task-budget.js | 35 | 主子代理轮次预算规则、收尾提示词与配置页参数校验 | TASK_BUDGET_LIMITS, taskBudgetDefaults, within, taskBudgetPolicy |
| src/tasks.js | 209 | Tasks：子任务（委托）生命周期 | ACTIVE, historyResult, Tasks |
| src/tools.js | 110 | delegationTools：委托/凭证读取/追加工具定义（zod 入参） | delegateInput, readInput, appendInput, result |
| src/update.js | 41 | 检查更新：本地安装（提交 SHA/版本）比对 GitHub 公开仓库 master，npm 安装实例可自动重装 | repo, npmSpec, commitFile, validateCommit |
| tests/activity-groups-ui.py | 201 | node --test 测试（npm test） | activityHistory, sessions |
| tests/answer-tags.test.js | 29 | node --test 测试（npm test） | open |
| tests/app.test.js | 1794 | node --test 测试（npm test） | pickerSource, modelSources, serviceSource |
| tests/autoscroll-ui.py | 99 | node --test 测试（npm test） | - |
| tests/autostart.test.js | 71 | node --test 测试（npm test） | node, cwd, service |
| tests/benchmark.js | 92 | node --test 测试（npm test） | window |
| tests/capabilities.test.js | 222 | node --test 测试（npm test） | - |
| tests/cli-help.test.js | 46 | node --test 测试（npm test） | cli |
| tests/codebase-index.test.js | 20 | node --test 测试（npm test） | ROOT, SKILL |
| tests/compaction-config.test.js | 109 | node --test 测试（npm test） | - |
| tests/compaction-ui.py | 57 | node --test 测试（npm test） | - |
| tests/compaction-ui.test.js | 187 | node --test 测试（npm test） | page |
| tests/compaction.test.js | 802 | node --test 测试（npm test） | fakeModel, createTestSession, seq, userMsg |
| tests/config.test.js | 225 | node --test 测试（npm test） | - |
| tests/context-menu-ui.py | 66 | node --test 测试（npm test） | - |
| tests/conversation-preview.mjs | 124 | node --test 测试（npm test） | markdown, message, thinking, state |
| tests/conversation-ui.py | 254 | node --test 测试（npm test） | - |
| tests/database.test.js | 149 | node --test 测试（npm test） | - |
| tests/defaults.test.js | 86 | node --test 测试（npm test） | - |
| tests/dev-assets.test.js | 46 | node --test 测试（npm test） | - |
| tests/file-picker.test.js | 67 | node --test 测试（npm test） | source, tick |
| tests/helpers/model-concurrency-child.mjs | 82 | node --test 测试（npm test） | barrier, runOpponent |
| tests/image-input.test.js | 169 | node --test 测试（npm test） | pngBase64, jpegBase64, image, parsePrompt |
| tests/inline-images.test.js | 42 | node --test 测试（npm test） | text, a, b, user |
| tests/install.test.js | 150 | node --test 测试（npm test） | fakeService |
| tests/manual-retry.test.js | 186 | node --test 测试（npm test） | session, assistant, page, message |
| tests/markdown.test.js | 214 | node --test 测试（npm test） | - |
| tests/memory-preview.mjs | 22 | node --test 测试（npm test） | state, sessions, app |
| tests/memory-tags.test.js | 83 | node --test 测试（npm test） | - |
| tests/memory-ui.test.js | 123 | node --test 测试（npm test） | page |
| tests/message-activity.test.js | 427 | node --test 测试（npm test） | page, assistant, thought, call |
| tests/mobile-reading-ui.py | 130 | node --test 测试（npm test） | - |
| tests/model-auth.test.js | 133 | node --test 测试（npm test） | SECRET, fakeAuth, waitFor, noLeak |
| tests/model-config.test.js | 1035 | node --test 测试（npm test） | sha, EMPTY, tempDir, openDatabases |
| tests/model-manager.test.js | 1229 | node --test 测试（npm test） | authSource, source, tick, j |
| tests/model-onboarding-ui.test.js | 153 | node --test 测试（npm test） | stripImports, modelSources, pickerSource, memoryTagsSource |
| tests/model-onboarding.test.js | 55 | node --test 测试（npm test） | - |
| tests/model-picker.test.js | 311 | node --test 测试（npm test） | source, tick, nap, OPTS |
| tests/model-runtime-catalog.test.js | 27 | node --test 测试（npm test） | - |
| tests/model-selection-preview.mjs | 52 | node --test 测试（npm test） | home, catalog, factory, sessions |
| tests/model-selection-ui.py | 60 | node --test 测试（npm test） | - |
| tests/model-settings-ui.py | 44 | node --test 测试（npm test） | - |
| tests/model-thinking-favorites.test.js | 121 | node --test 测试（npm test） | appSource, pickerSource, modelSources, html |
| tests/pi-memory.test.js | 168 | node --test 测试（npm test） | - |
| tests/pi-model-storage.test.js | 461 | node --test 测试（npm test） | tempDir, makeStorage, seedPiModels, seedPiAuth |
| tests/pi-question.test.js | 179 | node --test 测试（npm test） | - |
| tests/presets.test.js | 112 | node --test 测试（npm test） | makeFactory |
| tests/project-skills.test.js | 59 | node --test 测试（npm test） | - |
| tests/question-preview.mjs | 36 | node --test 测试（npm test） | factory, sessions, app, port |
| tests/question-ui.test.js | 40 | node --test 测试（npm test） | source |
| tests/questions.test.js | 110 | node --test 测试（npm test） | params |
| tests/recall.test.js | 202 | node --test 测试（npm test） | user, assistant, thinking, fixture |
| tests/remote-ui.py | 51 | node --test 测试（npm test） | - |
| tests/remote-ui.test.js | 224 | node --test 测试（npm test） | page, modelSources, flush, stubRequest |
| tests/remote.test.js | 721 | node --test 测试（npm test） | EMAIL, mockTailscale, fakeChild, fakeDatabase |
| tests/retry-settings-ui.py | 30 | node --test 测试（npm test） | - |
| tests/retry.test.js | 407 | node --test 测试（npm test） | RATE_LIMIT, QUOTA, ABORTED, fakeSession |
| tests/server.test.js | 138 | node --test 测试（npm test） | - |
| tests/service-api.test.js | 106 | node --test 测试（npm test） | - |
| tests/service-settings-api.test.js | 71 | node --test 测试（npm test） | - |
| tests/service-settings-ui.py | 60 | node --test 测试（npm test） | - |
| tests/service-settings.test.js | 377 | node --test 测试（npm test） | source, html, setup |
| tests/service.test.js | 539 | node --test 测试（npm test） | until, readMaybe, killTree, buildWorkspace |
| tests/session-created-at.test.js | 44 | node --test 测试（npm test） | factory |
| tests/session-flow.test.js | 451 | node --test 测试（npm test） | flowFactory, jsonlFactory |
| tests/session-memory.test.js | 110 | node --test 测试（npm test） | reply |
| tests/session-migration.test.js | 266 | node --test 测试（npm test） | factory, workspaceHash |
| tests/session-model-restore.test.js | 61 | node --test 测试（npm test） | stubFactory, cleanup |
| tests/session-persistence.test.js | 229 | node --test 测试（npm test） | factory |
| tests/session-sidebar-ui.py | 112 | node --test 测试（npm test） | - |
| tests/session-store.test.js | 514 | node --test 测试（npm test） | withStore, fullSaved, LEGACY_DDL |
| tests/smoke.js | 67 | node --test 测试（npm test） | TIMEOUT, sessions |
| tests/sqlite-benchmark.mjs | 914 | node --test 测试（npm test） | parseArgs, args, scriptPath, repoDir |
| tests/stream-renderer.test.js | 116 | node --test 测试（npm test） | - |
| tests/subagent-persistence.test.js | 123 | node --test 测试（npm test） | factory |
| tests/task-budget.test.js | 50 | node --test 测试（npm test） | - |
| tests/task-notifications.test.js | 197 | node --test 测试（npm test） | factoryFixture, tick, until |
| tests/task-resume.test.js | 182 | node --test 测试（npm test） | fakeAgent, fixture, restored |
| tests/task-timer.test.js | 55 | node --test 测试（npm test） | factory, state, settle |
| tests/tasks.test.js | 118 | node --test 测试（npm test） | fixture |
| tests/text-diagram-ui.py | 36 | node --test 测试（npm test） | - |
| tests/tooltip.test.js | 282 | node --test 测试（npm test） | source, boot, fire, tip |
| tests/ui-sticky-check.html | 63 | node --test 测试（npm test） | checks, lines, ok |
| tests/ui-sticky-check.mjs | 104 | node --test 测试（npm test） | here, candidates, browser, port |
| tests/uninstall.test.js | 45 | node --test 测试（npm test） | - |
| tests/update.test.js | 38 | node --test 测试（npm test） | old |
| tests/workspace-isolation.test.js | 80 | node --test 测试（npm test） | - |
| tests/workspace-picker.test.js | 99 | node --test 测试（npm test） | - |
| tests/workspace-tabs.test.js | 234 | node --test 测试（npm test） | appSource, pickerSource, modelSources, html |

## L2 符号 → 行号（跳转：read <文件> offset=<行>）

### public/answer-tags.js（48 行） — 主代理回答标签解析、代码保护与流式容错

| 符号 | 类型 | 行 |
|---|---|---|
| OPEN | const | 2 |
| CLOSE | const | 3 |
| splitAnswer | function | 5 |

### public/app.js（3488 行） — 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度

| 符号 | 类型 | 行 |
|---|---|---|
| questionUI | const | 11 |
| filePicker | const | 13 |
| $ | const | 14 |
| ws | const | 15 |
| sessionMissing | const | 25 |
| onboarding | const | 26 |
| allSessions | const | 27 |
| views | const | 29 |
| compactionDefaults | const | 30 |
| taskBudgetDefaults | const | 32 |
| thinkingLevels | const | 33 |
| modelFavorites | const | 34 |
| favoriteKey | function | 37 |
| modelPicker | const | 42 |
| modelManager | const | 56 |
| serviceUi | const | 57 |
| compactions | const | 58 |
| lastMainMessage | const | 60 |
| compactionNodes | const | 61 |
| images | const | 62 |
| completionVersion | const | 63 |
| selectedSkill | const | 64 |
| hiddenSessions | const | 68 |
| seenSessions | const | 75 |
| markSessionSeen | function | 80 |
| readSessionPreference | function | 87 |
| changeSessionPreference | function | 91 |
| setSessionHidden | function | 105 |
| saveView | function | 122 |
| resizePrompt | function | 133 |
| scrollFrame | const | 139 |
| FOLLOW_GAP | const | 140 |
| scrollIntent | const | 141 |
| lastScrollTops | const | 142 |
| noteScrollIntent | const | 144 |
| atLatest | const | 146 |
| readFollow | function | 149 |
| scrollToLatest | const | 158 |
| scrollLatest | function | 159 |
| scheduleCallGroups | method | 160 |
| transcript | const | 169 |
| growthWatch | const | 171 |
| growthObserver | function | 172 |
| watchGrowth | function | 175 |
| forgetGrowth | function | 176 |
| renderer | const | 179 |
| scrollLatest | method | 203 |
| mobile | const | 205 |
| sidebar | function | 206 |
| sidebar | method | 216 |
| sidebar | method | 219 |
| resizePrompt | method | 220 |
| themeColors | const | 225 |
| applyTheme | function | 226 |
| applyTheme | method | 237 |
| pending | const | 246 |
| requestSeq | const | 251 |
| error | function | 252 |
| request | function | 255 |
| controls | function | 264 |
| renderContextChips | method | 290 |
| syncRetryPrompt | method | 297 |
| options | function | 306 |
| providerEntries | const | 315 |
| modelEntries | const | 316 |
| refreshModelCatalog | function | 318 |
| fillModels | function | 346 |
| options | method | 347 |
| fillSubagentModels | function | 353 |
| options | method | 355 |
| capabilityName | function | 363 |
| runtimeSummary | function | 373 |
| renderRuntime | function | 386 |
| updateTaskRuntime | function | 403 |
| renderRuntime | method | 405 |
| applyConfig | function | 408 |
| options | method | 410 |
| renderRuntime | method | 416 |
| options | method | 417 |
| fillSubagentModels | method | 422 |
| fillModels | method | 425 |
| options | method | 430 |
| configureSeq | const | 437 |
| configure | function | 438 |
| controls | method | 442 |
| taskBudgetInputs | const | 467 |
| loadTaskBudget | function | 468 |
| saveTaskBudget | function | 477 |
| showSettingsPanel | function | 491 |
| showSettingsPanel | method | 507 |
| showSettingsPanel | method | 511 |
| controls | method | 512 |
| remoteView | const | 524 |
| remoteLoaded | const | 525 |
| remoteAnchor | function | 526 |
| remoteRender | function | 534 |
| controls | method | 580 |
| remoteLoad | function | 582 |
| remoteAuthUrl | function | 598 |
| remoteLogin | function | 606 |
| remoteOnReconnect | function | 632 |
| controls | method | 646 |
| messageItems | const | 659 |
| activityPaths | const | 661 |
| setActivityIcon | function | 678 |
| callGroupsFrame | const | 688 |
| scheduleCallGroups | function | 689 |
| createCallGroup | function | 699 |
| paintCallGroup | function | 713 |
| refreshCallGroups | function | 755 |
| foldCallsBeforeMessage | function | 886 |
| paintCallGroup | method | 890 |
| disclosureHint | function | 892 |
| activityLine | function | 912 |
| setActivity | method | 922 |
| setActivity | function | 925 |
| scheduleCallGroups | method | 926 |
| setActivityIcon | method | 928 |
| waiting | function | 939 |
| scheduleCallGroups | method | 941 |
| scrollLatest | method | 947 |
| clearWaiting | function | 949 |
| stopActivity | function | 953 |
| scheduleCallGroups | method | 955 |
| clearWaiting | method | 956 |
| updateActivity | function | 965 |
| setActivity | method | 978 |
| setActivity | method | 979 |
| mergeThoughts | function | 983 |
| diffView | const | 1001 |
| renderToolDetail | function | 1006 |
| section | method | 1092 |
| toolState | function | 1094 |
| clearWaiting | method | 1096 |
| setActivity | method | 1140 |
| renderToolDetail | method | 1141 |
| scrollLatest | method | 1142 |
| card | function | 1144 |
| renderMessage | function | 1202 |
| updateActivity | method | 1310 |
| renderCompactionStatus | function | 1313 |
| trackTaskEntries | function | 1330 |
| placeCompactedTasks | function | 1341 |
| placeCompactedRetries | method | 1342 |
| compactionCard | function | 1371 |
| renderMarkdown | method | 1391 |
| foldCompaction | function | 1394 |
| placeCompactedTasks | method | 1416 |
| mergeThoughts | method | 1417 |
| compactionEditor | function | 1424 |
| options | method | 1462 |
| fillThinking | method | 1492 |
| retryChipList | function | 1503 |
| render | method | 1552 |
| retryEditor | function | 1556 |
| renderTaskRuns | function | 1576 |
| renderQueue | function | 1604 |
| canResumeMessage | const | 1623 |
| retryPrompt | const | 1625 |
| syncRetryPrompt | function | 1626 |
| scrollLatest | method | 1651 |
| retryCards | const | 1653 |
| placeCompactedRetries | function | 1654 |
| retryArchive | function | 1678 |
| renderRetry | function | 1691 |
| placeCompactedRetries | method | 1727 |
| scrollLatest | method | 1728 |
| event | function | 1730 |
| snapshot | function | 1940 |
| clearTimeout | method | 1943 |
| markSessionSeen | method | 1959 |
| updatePageTitle | method | 1963 |
| renderTaskRuns | method | 1973 |
| renderCompactionStatus | method | 1978 |
| restoreRetries | method | 2040 |
| mergeThoughts | method | 2054 |
| placeCompactedTasks | method | 2068 |
| renderImages | method | 2082 |
| closeCompletion | method | 2085 |
| renderQueue | method | 2096 |
| applyConfig | method | 2098 |
| controls | method | 2100 |
| reconnectTimer | const | 2102 |
| clearTimeout | method | 2106 |
| controls | method | 2109 |
| scheduleReconnect | function | 2233 |
| clearTimeout | method | 2234 |
| importDir | const | 2238 |
| fillModels | method | 2242 |
| fillSubagentModels | method | 2249 |
| closeCompletion | method | 2266 |
| controls | method | 2271 |
| scrollLatest | method | 2276 |
| enableImagePreview | function | 2308 |
| renderImages | function | 2329 |
| addImages | function | 2354 |
| loadImages | function | 2375 |
| renderImages | method | 2384 |
| selectionCopy | const | 2407 |
| copySelection | function | 2419 |
| escapeTimer | const | 2482 |
| withdrawQueue | function | 2483 |
| refreshing | const | 2565 |
| refreshSessions | function | 2566 |
| timerText | function | 2582 |
| renderTaskTimer | function | 2589 |
| applyElapsed | function | 2602 |
| renderTaskTimer | method | 2608 |
| updatePageTitle | function | 2610 |
| updateSessions | function | 2614 |
| renderTaskTimer | method | 2616 |
| updatePageTitle | method | 2628 |
| renderSessions | method | 2629 |
| recoverMissingSession | function | 2631 |
| controls | method | 2633 |
| saveView | method | 2640 |
| controls | method | 2644 |
| switchSession | function | 2660 |
| saveView | method | 2662 |
| controls | method | 2665 |
| copySessionFile | function | 2691 |
| positionSessionMenu | function | 2704 |
| renderSessions | function | 2710 |
| sessionAction | const | 2866 |
| openSessionAction | function | 2868 |
| contextIcon | function | 2909 |
| renderContextChips | function | 2912 |
| fuzzyHit | function | 2931 |
| renderContextResults | function | 2938 |
| showContextSkills | function | 2958 |
| positionContextSkills | function | 2963 |
| showContextSkills | method | 2975 |
| controls | method | 3010 |
| skillTrigger | const | 3012 |
| showContextSkills | method | 3028 |
| resizePrompt | method | 3037 |
| controls | method | 3038 |
| closeCompletion | function | 3041 |
| highlightCompletion | function | 3049 |
| chooseCompletion | function | 3058 |
| closeCompletion | method | 3068 |
| updateCompletion | function | 3071 |
| closeCompletion | method | 3072 |
| resizePrompt | method | 3128 |
| controls | method | 3129 |
| switchSession | method | 3169 |
| creationLoad | const | 3180 |
| refreshPresets | function | 3181 |
| createAgentPicker | function | 3216 |
| options | method | 3242 |
| fill | method | 3250 |
| fillThinking | method | 3258 |
| options | method | 3260 |
| loadCreation | function | 3307 |
| openCreation | function | 3343 |
| rememberCreation | const | 3364 |
| updateDefaultsPreview | function | 3396 |
| updateDefaultsPreview | method | 3420 |
| controls | method | 3475 |

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

### public/memory-tags.js（111 行） — 主子代理共享简单标签提取与流式显示过滤

| 符号 | 类型 | 行 |
|---|---|---|
| TAGS | const | 8 |
| NAMES | const | 9 |
| TAG | const | 11 |
| OPEN | const | 12 |
| CLOSE | const | 13 |
| MARKS | const | 14 |
| FENCE | const | 15 |
| INLINE_CODE | const | 17 |
| HOLE | const | 19 |
| MASK | const | 23 |
| maskInlineCode | function | 24 |
| unmaskInlineCode | const | 29 |
| segments | function | 35 |
| extractMemoryTags | function | 50 |
| stripMemoryTags | function | 69 |

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

### public/question.js（169 行） — 主代理提问选项卡、键盘交互与回答提交

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

### scripts/maint-state.mjs（116 行） — 守护维护状态：持久化阶段、最近结果与有界脱敏证据

| 符号 | 类型 | 行 |
|---|---|---|
| NAMESPACE | const | 8 |
| LOG_LIMIT | const | 9 |
| sanitize | function | 12 |
| createMaintState | function | 21 |
| persist | method | 80 |

### scripts/service.mjs（597 行） — 服务守护：IPC 重启、HTTP 安全停止与崩溃退避停止通道

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
| homeDir | const | 192 |
| openCommand | const | 196 |
| openPage | function | 201 |
| spawn | method | 203 |
| firstRunGuide | function | 208 |
| serviceReady | const | 225 |
| fetch | method | 226 |
| startBackground | function | 233 |
| spawn | method | 235 |
| startCli | function | 246 |
| supervise | function | 253 |
| mkdirSync | method | 262 |
| spawnWorker | method | 529 |
| invoked | const | 533 |
| stopService | function | 534 |
| HELP | const | 570 |
| FORE | const | 582 |
| COMMANDS | const | 583 |

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

### src/compaction.js（375 行） — 后台独立摘要、token/占比阈值、快照校验与 turn 安全提交

| 符号 | 类型 | 行 |
|---|---|---|
| contextTokens | function | 21 |
| prepareBackgroundCompaction | function | 28 |
| DEFAULT_COMPACTION_CONFIG | const | 55 |
| normalizeCompaction | function | 57 |
| overCompactionThreshold | function | 61 |
| entryIdFor | function | 67 |
| summarizedEntryIds | function | 80 |
| parseSummaryOutput | function | 98 |
| throwIfAborted | function | 111 |
| summarizeWithPiSession | function | 115 |
| throwIfAborted | method | 116 |
| createBackgroundCompaction | function | 189 |

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

### src/inline-images.js（32 行） — 模型上下文图片定位：将占位符与真实附件交错排列，不改存储与队列

| 符号 | 类型 | 行 |
|---|---|---|
| inlineImages | function | 2 |
| inlineImagesExtension | function | 29 |

### src/main.js（114 行） — 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理

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
| initRemote | method | 85 |
| initRemote | function | 87 |
| closing | const | 97 |
| stop | function | 98 |

### src/model-auth.js（89 行） — SDK 登录桥：连接隔离、超时取消与安全事件投影

| 符号 | 类型 | 行 |
|---|---|---|
| safeUrl | const | 3 |
| text | const | 9 |
| eventView | function | 10 |
| createModelAuthService | function | 17 |

### src/model-config.js（601 行） — Pi models.json 无损配置读写与共享收藏持久化

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
| normalizeFavorites | function | 248 |
| HIDDEN_CAP | const | 258 |
| normalizeHidden | function | 259 |
| createModelsService | function | 264 |

### src/pi-model-storage.js（321 行） — 模型与凭据 SQLite 权威存储、Pi 派生兼容文件

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

### src/pi.js（387 行） — createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档）

| 符号 | 类型 | 行 |
|---|---|---|
| agentRuntime | function | 15 |
| queueStateOf | function | 31 |
| hasModelOutput | function | 50 |
| withdrawQueue | function | 60 |
| recallLastMessage | function | 70 |
| memoryExtension | function | 102 |
| createPiFactory | function | 125 |

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

### src/protocol.js（356 行） — zod 协议：selection / command 判别联合（消息类型见 L3）

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
| preset | const | 83 |
| presetStore | const | 89 |
| providerKey | const | 91 |
| modelKey | const | 94 |
| secretValueIn | const | 101 |
| secretHeadersIn | const | 106 |
| thinkingLevelMapIn | const | 107 |
| costIn | const | 115 |
| providerConfigIn | const | 134 |
| modelConfigIn | const | 150 |
| modelOverrideIn | const | 167 |
| fingerprintIn | const | 168 |
| command | const | 169 |

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

### src/server.js（502 行） — createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发

| 符号 | 类型 | 行 |
|---|---|---|
| dev | const | 10 |
| digest | const | 11 |
| load | const | 12 |
| freshen | const | 17 |
| assets | const | 27 |
| createServerApp | function | 63 |

### src/session-memory.js（29 行） — 标题提取登记、轮次预算挂钩与委派背景

| 符号 | 类型 | 行 |
|---|---|---|
| textOf | const | 4 |
| memoryHooks | function | 11 |

### src/session-store.js（458 行） — 会话三表、实体增量更新、逐会话事务与旧数据迁移

| 符号 | 类型 | 行 |
|---|---|---|
| EVENT_TYPES | const | 13 |
| SESSION_FIELDS | const | 16 |
| TABLES | const | 31 |
| INDEXES | const | 63 |
| DEAD_TABLES | const | 72 |
| DEAD_COLUMNS | const | 73 |
| DEAD_EVENT_TYPES | const | 74 |
| SessionStore | class | 76 |
| constructor | method | 80 |
| change | method | 141 |
| hasSession | method | 163 |
| listSessions | method | 168 |
| listPendingSessionIds | method | 189 |
| getSession | method | 197 |
| insertSession | method | 297 |
| importLegacySession | method | 323 |
| migrateLegacy | method | 340 |
| updateSession | method | 362 |
| deleteSession | method | 386 |
| saveEvent | method | 392 |
| deleteEvents | method | 411 |
| saveTask | method | 429 |
| listTasks | method | 452 |

### src/sessions.js（1369 行） — Sessions：会话生命周期、增量保存、元数据启动与SDK按需恢复

| 符号 | 类型 | 行 |
|---|---|---|
| BROWSE_PAGE | const | 20 |
| SEARCH_LIMIT | const | 22 |
| SEARCH_DIR_LIMIT | const | 23 |
| IGNORED_ENTRIES | const | 25 |
| fuzzyHit | function | 28 |
| matchRank | function | 39 |
| searchEntries | function | 48 |
| pointStatus | function | 76 |
| trackElapsed | function | 83 |
| resolveDir | function | 93 |
| parentOf | function | 104 |
| absoluteCrumbs | function | 113 |
| importedTitle | function | 135 |
| hostLocations | function | 157 |
| landedSessionFile | function | 176 |
| Sessions | class | 181 |
| constructor | method | 182 |
| applyDefaults | method | 204 |
| loadDefaults | method | 219 |
| migrateDefaults | method | 229 |
| migratePresets | method | 242 |
| loadTaskBudget | method | 257 |
| getTaskBudget | method | 268 |
| configureTaskBudget | method | 273 |
| getDefaults | method | 279 |
| workspaceDefaults | method | 282 |
| configureDefaults | method | 300 |
| saveDefaults | method | 305 |
| validateSelection | method | 355 |
| validateCompaction | method | 386 |
| listPresets | method | 404 |
| mutatePresets | method | 414 |
| savePreset | method | 427 |
| deletePreset | method | 442 |
| load | method | 451 |
| ensureLoaded | method | 470 |
| migrateLegacySessions | method | 492 |
| sessionData | method | 516 |
| persist | method | 529 |
| writeChange | method | 547 |
| saveChange | method | 562 |
| list | method | 567 |
| rename | method | 584 |
| importSession | method | 597 |
| create | method | 624 |
| scheduleTaskNotifications | method | 955 |
| deliverTaskNotifications | method | 967 |
| get | method | 994 |
| revealWorkspace | method | 999 |
| browse | method | 1013 |
| listFiles | method | 1019 |
| refreshSkills | method | 1081 |
| snapshot | method | 1087 |
| subscribe | method | 1117 |
| configure | method | 1123 |
| startRun | method | 1158 |
| retry | method | 1194 |
| prompt | method | 1201 |
| withdraw | method | 1226 |
| replyQuestion | method | 1275 |
| cancel | method | 1281 |
| retryTask | method | 1306 |
| remove | method | 1312 |
| close | method | 1359 |

### src/task-budget.js（35 行） — 主子代理轮次预算规则、收尾提示词与配置页参数校验

| 符号 | 类型 | 行 |
|---|---|---|
| TASK_BUDGET_LIMITS | const | 10 |
| taskBudgetDefaults | const | 13 |
| within | const | 15 |
| taskBudgetPolicy | function | 22 |

### src/tasks.js（209 行） — Tasks：子任务（委托）生命周期

| 符号 | 类型 | 行 |
|---|---|---|
| ACTIVE | const | 5 |
| historyResult | const | 8 |
| Tasks | class | 17 |
| constructor | method | 18 |
| start | method | 26 |
| snapshotJob | method | 42 |
| publish | method | 51 |
| view | method | 56 |
| retryable | method | 63 |
| snapshot | method | 68 |
| run | method | 72 |
| read | method | 149 |
| retry | method | 157 |
| append | method | 176 |
| cancel | method | 186 |
| interrupt | method | 202 |

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

### tests/answer-tags.test.js（29 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| open | const | 5 |

### tests/app.test.js（1794 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| pickerSource | const | 9 |
| modelSources | const | 10 |
| serviceSource | const | 15 |

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
| page | function | 10 |
| restore | method | 39 |

### tests/compaction.test.js（802 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| fakeModel | const | 83 |
| createTestSession | function | 96 |
| seq | const | 113 |
| userMsg | const | 114 |
| assistantMsg | const | 115 |
| big | const | 121 |
| seed | function | 123 |
| settle | const | 128 |
| waitFor | function | 130 |
| enabledConfig | const | 138 |
| fakeSummarize | function | 147 |
| startHangingLlmServer | function | 155 |
| startFakeLlmServer | function | 178 |
| zodError | method | 235 |
| zodError | method | 236 |
| zodError | method | 237 |
| zodError | method | 238 |
| zodError | method | 239 |
| zodError | method | 240 |
| hangingSummarize | function | 565 |
| createLoopSession | function | 662 |
| writeFileSync | method | 663 |

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

### tests/helpers/model-concurrency-child.mjs（82 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| barrier | const | 11 |
| writeSync | method | 12 |
| runOpponent | function | 17 |
| createInterface | method | 29 |

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

### tests/manual-retry.test.js（186 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| session | const | 11 |
| assistant | const | 12 |
| dropFailedAssistant | method | 27 |
| dropFailedAssistant | method | 31 |
| dropFailedAssistant | method | 34 |
| finish | method | 61 |
| finish | method | 82 |
| page | function | 98 |
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
| page | function | 13 |
| restore | method | 43 |

### tests/message-activity.test.js（427 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 10 |
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

### tests/model-config.test.js（1035 行） — node --test 测试（npm test）

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

### tests/model-onboarding-ui.test.js（153 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| stripImports | const | 8 |
| modelSources | const | 9 |
| pickerSource | const | 14 |
| memoryTagsSource | const | 15 |
| appSource | const | 16 |
| config | const | 18 |
| harness | const | 19 |

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

### tests/model-thinking-favorites.test.js（121 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| appSource | const | 9 |
| pickerSource | const | 10 |
| modelSources | const | 11 |
| html | const | 16 |
| MODEL_KEY | const | 18 |
| bootPage | function | 20 |
| click | const | 75 |
| menu | const | 76 |
| opts | const | 77 |
| stars | const | 78 |

### tests/pi-model-storage.test.js（461 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| tempDir | function | 13 |
| makeStorage | function | 18 |
| seedPiModels | const | 23 |
| seedPiAuth | const | 27 |

### tests/presets.test.js（112 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| makeFactory | const | 10 |

### tests/question-preview.mjs（36 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 5 |
| sessions | const | 31 |
| app | const | 33 |
| port | const | 34 |

### tests/question-ui.test.js（40 行） — node --test 测试（npm test）

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
| page | function | 10 |
| modelSources | const | 16 |
| flush | const | 40 |
| stubRequest | function | 41 |
| submit | const | 51 |

### tests/remote.test.js（721 行） — node --test 测试（npm test）

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

### tests/service.test.js（539 行） — node --test 测试（npm test）

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

### tests/session-migration.test.js（266 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 10 |
| workspaceHash | const | 20 |

### tests/session-model-restore.test.js（61 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| stubFactory | function | 9 |
| cleanup | const | 17 |

### tests/session-persistence.test.js（229 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 9 |

### tests/session-store.test.js（514 行） — node --test 测试（npm test）

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

### tests/tasks.test.js（118 行） — node --test 测试（npm test）

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

### tests/workspace-tabs.test.js（234 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| appSource | const | 9 |
| pickerSource | const | 10 |
| modelSources | const | 11 |
| html | const | 16 |
| state | const | 18 |
| STATES | const | 23 |
| bootPage | function | 29 |
| attachCalls | const | 83 |

## L3 横切常量（跨模块定位入口）

- 协议 command.type：image、inherit、radius、service.status、service.update.check、service.restart、remote.get、remote.login、remote.configure、session.rename、workspace.reveal、workspace.browse、files.browse、models.list、models.config.get、models.provider.save、models.provider.delete、models.provider.rename、models.model.save、models.model.delete、models.provider.discover、models.favorites.get、models.model.override、models.auth.list、models.auth.start、models.auth.status、models.auth.respond、models.auth.cancel、models.auth.logout、models.hidden.set、models.favorites.set、capabilities.list、session.defaults.get、session.defaults.configure、task.budget.get、task.budget.configure、session.presets.list、session.presets.save、session.presets.delete、session.configure、sessions.list、session.create、session.import、session.attach、session.skills.refresh、session.close、prompt、cancel、question.reply、session.retry、task.retry、queue.withdraw、tasks.read（src/protocol.js）
- HTML id：sidebar、open-workspace、new、custom-new、preset-list、import-session、search、sessions、open-settings、sidebar-backdrop、toggle-sidebar、session-title、workspace-label、copy-workspace、reveal-workspace、workspace-feedback、github-link、status、service-dev、service-version、toggle-theme、login、maintenance-state、connect、workspace、earliest、transcript、output、question-dock、latest、message-queue、task-runs、compaction-progress、add-context、add-image、image-files、context-chips、task-timer、task-timer-value、context-menu、context-picker、context-back、context-title、context-close、context-search、context-results、context-error、image-attachments、composer、prompt、prompt-completion、composer-skill、provider、model、thinking、stop、send-steer、send-followup、send、session-runtime、mobile-runtime、mobile-expand、composer-help、error、session-action、session-action-form、session-action-title、session-action-description、session-name-label、session-name、session-action-error、session-action-cancel、session-action-submit、image-preview、image-preview-close、image-preview-image、restart-dialog、restart-form、restart-title、restart-description、restart-warning、restart-cancel、restart-submit、task-overlays、task-template、settings、settings-title、settings-defaults-tab、settings-remote-tab、settings-models-tab、settings-service-tab、defaults-panel、selection-copy-title、selection-copy、selection-copy-help、selection-copy-feedback、queue-type、steer-help、followup-help、defaults-preview、task-budget-title、task-max-turns、task-wrap-up-window、task-budget-help、subagent-title、subagent-help、subagent-provider、subagent-model、settings-feedback、defaults-title、defaults-editor、remote-panel、remote-status-title、remote-status、remote-login、remote-auth、remote-url、remote-form、remote-note、remote-enabled、remote-email、remote-email-help、remote-feedback、remote-refresh、remote-save、models-panel、service-panel、service-state-title、service-feedback、service-restart-title、restart-quick、restart-rebuild、service-recover、service-update-section、service-update-title、update-check、update-result、update-install、service-history-title、service-history、create-session、create-title、create-form、preset-fields、preset-name、preset-fixed-cwd、preset-directory、preset-delete、create-workspace、create-defaults-help、create-agents、create-compaction、create-retry、create-trust-row、create-trust、create-feedback、create-submit（public/index.html）
- HTTP 静态路由：/、/favicon.svg、/style.css、/theme.js、/app.js、/question.js、/question.css、/service-settings.js、/file-picker.js、/tooltip.js、/tooltip.css、/file-picker.css、/markdown.js、/stream-renderer.js、/memory-tags.js、/answer-tags.js、/vendor/marked.js、/vendor/purify.js、/model-manager.js、/model-auth.js、/model-manager.css、/model-picker.js、/model-picker.css、/health（src/server.js）

## ⚠ 未登记文件（0）

（无）
