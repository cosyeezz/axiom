<!-- 自动生成，勿手改。重建：node .pi/skills/codebase-map/scripts/reindex.mjs -->
# Axiom 多级代码索引（生成于 2026/9/13 19:10:20）

## L1 模块总览（文件 → 职责）

| 文件 | 行数 | 职责 | 关键符号 |
|---|---|---|---|
| public/app.js | 3317 | 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度 | filePicker, $, ws, sessionMissing |
| public/file-picker.css | 276 | 文件选择弹窗主题与响应式布局 | - |
| public/file-picker.js | 355 | 共享文件/目录选择弹窗、懒加载与分类 SVG 图标 | NS, SEARCH_DEBOUNCE, el, FOLDER_COLORS |
| public/index.html | 321 | 页面骨架与元素 id（见 L3） | - |
| public/markdown.js | 247 | marked + DOMPurify 渲染（XSS 边界） | cache, policy, textLanguages, isText |
| public/memory-tags.js | 111 | 主子代理共享简单标签提取与流式显示过滤 | TAGS, NAMES, TAG, OPEN |
| public/model-auth.js | 97 | 网页登录：授权提示、设备码、凭据输入与取消 | createModelAuth |
| public/model-manager.css | 520 | 模型配置页：供应商列表、编辑表单与响应式布局 | - |
| public/model-manager.js | 1272 | 统一模型管理：供应商、字段覆盖与思考等级编辑 | THINKING_LEVELS, API_TYPES, PROVIDER_TEMPLATES, PROVIDER_ID |
| public/model-picker.css | 88 | 共享收藏下拉：浮层、星标、触屏与焦点样式 | - |
| public/model-picker.js | 300 | 共享模型选择器：供应商/模型/思考收藏、排序与键盘交互 | GAP, EDGE, TYPEAHEAD_MS, el |
| public/service-settings.js | 278 | 设置页服务维护：真实进度、结果、更新确认与独立维护通道 | MAINT_URL_RE, POLL_MS, initServiceSettings |
| public/stream-renderer.js | 46 | 流式增量渲染状态机 | createStreamRenderer |
| public/style.css | 1390 | 全局样式（CSP 禁 inline style，样式一律进这里） | - |
| public/theme.js | 11 | 首帧前阻塞应用明/暗主题（localStorage axiom.theme，默认深色） | - |
| public/tooltip.css | 50 | 共享悬停说明样式（浅色主题下反色） | - |
| public/tooltip.js | 225 | 共享悬停说明：动态 title、键盘、定位与无障碍 | SHOW_DELAY, HIDE_DELAY, GAP, EDGE |
| scripts/autostart.mjs | 133 | Windows/macOS/Linux 当前用户登录自动启动安装/卸载 | run, projectDir, serviceEntry, label |
| scripts/dev.mjs | 12 | 开发入口：DEV 标识、4320 端口与独立数据目录 | - |
| scripts/install.mjs | 95 | 一键安装：装依赖/注册自启/启动守护/健康检查/打开浏览器 | root, parseArgs, openCommand, ensurePi |
| scripts/maint-server.mjs | 86 | loopback维护HTTP：来源校验、随机凭证、状态与离线恢复 | MAX_BODY, hash, json, startMaintServer |
| scripts/maint-state.mjs | 116 | 守护维护状态：持久化阶段、最近结果与有界脱敏证据 | NAMESPACE, LOG_LIMIT, sanitize, createMaintState |
| scripts/service.mjs | 520 | 服务守护：IPC 重启、HTTP 安全停止与崩溃退避停止通道 | root, output, run, npmRun |
| scripts/uninstall.mjs | 18 | 统一卸载：核对 npm 目标、安全停止、取消自启、保留用户数据 | uninstall |
| src/capabilities.js | 139 | 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities） | sdkEntry, resolver, alias, jiti |
| src/compaction.js | 390 | 后台独立摘要、token/占比阈值、快照校验与 turn 安全提交 | contextTokens, prepareBackgroundCompaction, DEFAULT_COMPACTION_CONFIG, normalizeCompaction |
| src/database.js | 103 | 共享 SQLite 连接、小配置 KV、WAL 与一致性备份 | nodeOk, Database |
| src/inline-images.js | 32 | 模型上下文图片定位：将占位符与真实附件交错排列，不改存储与队列 | inlineImages, inlineImagesExtension |
| src/main.js | 114 | 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理 | port, cwd, home, database |
| src/model-auth.js | 89 | SDK 登录桥：连接隔离、超时取消与安全事件投影 | safeUrl, text, eventView, createModelAuthService |
| src/model-config.js | 601 | Pi models.json 无损配置读写与共享收藏持久化 | sdkModelConfig, sdkResolveConfigValue, digest, LEVELS |
| src/pi-model-storage.js | 321 | 模型与凭据 SQLite 权威存储、Pi 派生兼容文件 | sdkResolveConfigValue, sdkIsCommandConfigValue, NAMESPACE, AUTH_NAMESPACE |
| src/pi.js | 384 | createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档） | agentRuntime, queueStateOf, hasModelOutput, withdrawQueue |
| src/protocol.js | 353 | zod 协议：selection / command 判别联合（消息类型见 L3） | id, capabilities, workspace, thinking |
| src/remote.js | 547 | Tailscale 登录身份、远程监听、同账号授权与本机配置持久化 | configSchema, execOptions, cliEnv, defaultRun |
| src/retry.js | 173 | 模型失败重试：可取消退避、最多45次、16分钟封顶、自定义错误词表、保留已有工具结果继续 | RETRY_DELAYS_MS, MAX_DELAY_MS, MAX_RETRIES, delayFor |
| src/server.js | 478 | createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发 | assets, createServerApp |
| src/session-memory.js | 29 | 标题提取登记、轮次预算挂钩与委派背景 | textOf, memoryHooks |
| src/session-store.js | 458 | 会话三表、实体增量更新、逐会话事务与旧数据迁移 | EVENT_TYPES, SESSION_FIELDS, TABLES, INDEXES |
| src/sessions.js | 1301 | Sessions：会话生命周期、增量保存、元数据启动与SDK按需恢复 | BROWSE_PAGE, SEARCH_LIMIT, SEARCH_DIR_LIMIT, IGNORED_ENTRIES |
| src/task-budget.js | 36 | 主子代理轮次预算规则、收尾提示词与配置页参数校验 | WRAP_UP_PROMPT, TASK_BUDGET_LIMITS, taskBudgetDefaults, within |
| src/tasks.js | 121 | Tasks：子任务（委托）生命周期 | Tasks |
| src/tools.js | 110 | delegationTools：委托/凭证读取/追加工具定义（zod 入参） | delegateInput, readInput, appendInput, result |
| src/update.js | 41 | 检查更新：本地安装（提交 SHA/版本）比对 GitHub 公开仓库 master，npm 安装实例可自动重装 | repo, npmSpec, commitFile, validateCommit |
| tests/activity-groups-ui.py | 201 | node --test 测试（npm test） | activityHistory, sessions |
| tests/app.test.js | 1705 | node --test 测试（npm test） | pickerSource, modelSources, serviceSource |
| tests/autoscroll-ui.py | 99 | node --test 测试（npm test） | - |
| tests/autostart.test.js | 71 | node --test 测试（npm test） | node, cwd, service |
| tests/benchmark.js | 92 | node --test 测试（npm test） | window |
| tests/capabilities.test.js | 208 | node --test 测试（npm test） | - |
| tests/cli-help.test.js | 23 | node --test 测试（npm test） | - |
| tests/codebase-index.test.js | 20 | node --test 测试（npm test） | ROOT, SKILL |
| tests/compaction-config.test.js | 109 | node --test 测试（npm test） | - |
| tests/compaction-ui.py | 57 | node --test 测试（npm test） | - |
| tests/compaction-ui.test.js | 125 | node --test 测试（npm test） | page |
| tests/compaction.test.js | 802 | node --test 测试（npm test） | fakeModel, createTestSession, seq, userMsg |
| tests/config.test.js | 225 | node --test 测试（npm test） | - |
| tests/context-menu-ui.py | 66 | node --test 测试（npm test） | - |
| tests/conversation-preview.mjs | 123 | node --test 测试（npm test） | markdown, message, thinking, state |
| tests/conversation-ui.py | 254 | node --test 测试（npm test） | - |
| tests/database.test.js | 149 | node --test 测试（npm test） | - |
| tests/defaults.test.js | 37 | node --test 测试（npm test） | - |
| tests/file-picker.test.js | 67 | node --test 测试（npm test） | source, tick |
| tests/helpers/model-concurrency-child.mjs | 82 | node --test 测试（npm test） | barrier, runOpponent |
| tests/image-input.test.js | 169 | node --test 测试（npm test） | pngBase64, jpegBase64, image, parsePrompt |
| tests/inline-images.test.js | 42 | node --test 测试（npm test） | text, a, b, user |
| tests/install.test.js | 79 | node --test 测试（npm test） | - |
| tests/manual-retry.test.js | 186 | node --test 测试（npm test） | session, assistant, page, message |
| tests/markdown.test.js | 166 | node --test 测试（npm test） | - |
| tests/memory-preview.mjs | 22 | node --test 测试（npm test） | state, sessions, app |
| tests/memory-tags.test.js | 83 | node --test 测试（npm test） | - |
| tests/memory-ui.test.js | 97 | node --test 测试（npm test） | page |
| tests/message-activity.test.js | 427 | node --test 测试（npm test） | page, assistant, thought, call |
| tests/mobile-reading-ui.py | 130 | node --test 测试（npm test） | - |
| tests/model-auth.test.js | 133 | node --test 测试（npm test） | SECRET, fakeAuth, waitFor, noLeak |
| tests/model-config.test.js | 1035 | node --test 测试（npm test） | sha, EMPTY, tempDir, openDatabases |
| tests/model-manager.test.js | 1203 | node --test 测试（npm test） | authSource, source, tick, j |
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
| tests/presets.test.js | 112 | node --test 测试（npm test） | makeFactory |
| tests/project-skills.test.js | 59 | node --test 测试（npm test） | - |
| tests/recall.test.js | 202 | node --test 测试（npm test） | user, assistant, thinking, fixture |
| tests/remote-ui.py | 51 | node --test 测试（npm test） | - |
| tests/remote-ui.test.js | 224 | node --test 测试（npm test） | page, modelSources, flush, stubRequest |
| tests/remote.test.js | 721 | node --test 测试（npm test） | EMAIL, mockTailscale, fakeChild, fakeDatabase |
| tests/retry.test.js | 369 | node --test 测试（npm test） | RATE_LIMIT, QUOTA, ABORTED, fakeSession |
| tests/server.test.js | 125 | node --test 测试（npm test） | - |
| tests/service-api.test.js | 106 | node --test 测试（npm test） | - |
| tests/service-settings-api.test.js | 71 | node --test 测试（npm test） | - |
| tests/service-settings-ui.py | 60 | node --test 测试（npm test） | - |
| tests/service-settings.test.js | 377 | node --test 测试（npm test） | source, html, setup |
| tests/service.test.js | 538 | node --test 测试（npm test） | until, readMaybe, killTree, buildWorkspace |
| tests/session-created-at.test.js | 44 | node --test 测试（npm test） | factory |
| tests/session-flow.test.js | 417 | node --test 测试（npm test） | flowFactory, jsonlFactory |
| tests/session-memory.test.js | 110 | node --test 测试（npm test） | reply |
| tests/session-migration.test.js | 266 | node --test 测试（npm test） | factory, workspaceHash |
| tests/session-model-restore.test.js | 61 | node --test 测试（npm test） | stubFactory, cleanup |
| tests/session-persistence.test.js | 229 | node --test 测试（npm test） | factory |
| tests/session-sidebar-ui.py | 104 | node --test 测试（npm test） | - |
| tests/session-store.test.js | 514 | node --test 测试（npm test） | withStore, fullSaved, LEGACY_DDL |
| tests/smoke.js | 67 | node --test 测试（npm test） | TIMEOUT, sessions |
| tests/sqlite-benchmark.mjs | 914 | node --test 测试（npm test） | parseArgs, args, scriptPath, repoDir |
| tests/stream-renderer.test.js | 99 | node --test 测试（npm test） | - |
| tests/task-budget.test.js | 50 | node --test 测试（npm test） | - |
| tests/task-notifications.test.js | 197 | node --test 测试（npm test） | factoryFixture, tick, until |
| tests/task-timer.test.js | 55 | node --test 测试（npm test） | factory, state, settle |
| tests/tasks.test.js | 117 | node --test 测试（npm test） | fixture |
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

### public/app.js（3317 行） — 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度

| 符号 | 类型 | 行 |
|---|---|---|
| filePicker | const | 10 |
| $ | const | 11 |
| ws | const | 12 |
| sessionMissing | const | 22 |
| onboarding | const | 23 |
| allSessions | const | 24 |
| views | const | 26 |
| compactionDefaults | const | 27 |
| taskBudgetDefaults | const | 29 |
| thinkingLevels | const | 30 |
| modelFavorites | const | 31 |
| favoriteKey | function | 34 |
| modelPicker | const | 39 |
| modelManager | const | 53 |
| serviceUi | const | 54 |
| compactions | const | 55 |
| lastMainMessage | const | 57 |
| compactionNodes | const | 58 |
| images | const | 59 |
| completionVersion | const | 60 |
| selectedSkill | const | 61 |
| hiddenSessions | const | 65 |
| readSessionPreference | function | 70 |
| changeSessionPreference | function | 74 |
| setSessionHidden | function | 88 |
| saveView | function | 103 |
| resizePrompt | function | 114 |
| scrollFrame | const | 120 |
| FOLLOW_GAP | const | 121 |
| scrollIntent | const | 122 |
| lastScrollTops | const | 123 |
| noteScrollIntent | const | 125 |
| atLatest | const | 127 |
| readFollow | function | 130 |
| scrollToLatest | const | 139 |
| scrollLatest | function | 140 |
| scheduleCallGroups | method | 141 |
| transcript | const | 150 |
| growthWatch | const | 152 |
| growthObserver | function | 153 |
| watchGrowth | function | 156 |
| forgetGrowth | function | 157 |
| renderer | const | 160 |
| scrollLatest | method | 184 |
| mobile | const | 186 |
| sidebar | function | 187 |
| sidebar | method | 197 |
| sidebar | method | 200 |
| resizePrompt | method | 201 |
| themeColors | const | 206 |
| applyTheme | function | 207 |
| applyTheme | method | 218 |
| pending | const | 227 |
| requestSeq | const | 232 |
| error | function | 233 |
| request | function | 236 |
| controls | function | 245 |
| renderContextChips | method | 270 |
| syncRetryPrompt | method | 277 |
| options | function | 285 |
| providerEntries | const | 294 |
| modelEntries | const | 295 |
| refreshModelCatalog | function | 297 |
| fillModels | function | 325 |
| options | method | 326 |
| fillSubagentModels | function | 332 |
| options | method | 334 |
| capabilityName | function | 342 |
| runtimeSummary | function | 352 |
| renderRuntime | function | 365 |
| updateTaskRuntime | function | 382 |
| renderRuntime | method | 384 |
| applyConfig | function | 387 |
| options | method | 389 |
| renderRuntime | method | 395 |
| options | method | 396 |
| fillSubagentModels | method | 401 |
| fillModels | method | 404 |
| options | method | 409 |
| configureSeq | const | 416 |
| configure | function | 417 |
| controls | method | 421 |
| taskBudgetInputs | const | 446 |
| loadTaskBudget | function | 447 |
| saveTaskBudget | function | 456 |
| showSettingsPanel | function | 470 |
| showSettingsPanel | method | 486 |
| showSettingsPanel | method | 490 |
| controls | method | 491 |
| remoteView | const | 503 |
| remoteLoaded | const | 504 |
| remoteAnchor | function | 505 |
| remoteRender | function | 513 |
| controls | method | 559 |
| remoteLoad | function | 561 |
| remoteAuthUrl | function | 577 |
| remoteLogin | function | 585 |
| remoteOnReconnect | function | 611 |
| controls | method | 625 |
| messageItems | const | 638 |
| activityPaths | const | 640 |
| setActivityIcon | function | 657 |
| callGroupsFrame | const | 667 |
| scheduleCallGroups | function | 668 |
| createCallGroup | function | 677 |
| paintCallGroup | function | 691 |
| refreshCallGroups | function | 720 |
| foldCallsBeforeMessage | function | 820 |
| paintCallGroup | method | 824 |
| disclosureHint | function | 826 |
| activityLine | function | 846 |
| setActivity | method | 856 |
| setActivity | function | 859 |
| scheduleCallGroups | method | 860 |
| setActivityIcon | method | 862 |
| waiting | function | 873 |
| scheduleCallGroups | method | 875 |
| scrollLatest | method | 881 |
| clearWaiting | function | 883 |
| stopActivity | function | 887 |
| scheduleCallGroups | method | 889 |
| clearWaiting | method | 890 |
| updateActivity | function | 899 |
| setActivity | method | 912 |
| setActivity | method | 913 |
| mergeThoughts | function | 917 |
| diffView | const | 935 |
| renderToolDetail | function | 940 |
| section | method | 1026 |
| toolState | function | 1028 |
| clearWaiting | method | 1030 |
| setActivity | method | 1074 |
| renderToolDetail | method | 1075 |
| scrollLatest | method | 1076 |
| card | function | 1078 |
| renderMessage | function | 1129 |
| updateActivity | method | 1224 |
| renderCompactionStatus | function | 1227 |
| trackTaskEntries | function | 1244 |
| placeCompactedTasks | function | 1255 |
| placeCompactedRetries | method | 1256 |
| compactionCard | function | 1265 |
| renderMarkdown | method | 1285 |
| foldCompaction | function | 1288 |
| placeCompactedTasks | method | 1308 |
| mergeThoughts | method | 1309 |
| compactionEditor | function | 1316 |
| options | method | 1354 |
| fillThinking | method | 1384 |
| retryChipList | function | 1393 |
| retryEditor | function | 1442 |
| renderTaskRuns | function | 1462 |
| renderQueue | function | 1490 |
| canResumeMessage | const | 1509 |
| retryPrompt | const | 1511 |
| syncRetryPrompt | function | 1512 |
| scrollLatest | method | 1537 |
| retryCards | const | 1539 |
| placeCompactedRetries | function | 1540 |
| retryArchive | function | 1564 |
| renderRetry | function | 1577 |
| placeCompactedRetries | method | 1613 |
| scrollLatest | method | 1614 |
| event | function | 1616 |
| snapshot | function | 1789 |
| clearTimeout | method | 1792 |
| updatePageTitle | method | 1810 |
| renderTaskRuns | method | 1820 |
| renderCompactionStatus | method | 1825 |
| restoreRetries | method | 1886 |
| mergeThoughts | method | 1900 |
| placeCompactedTasks | method | 1914 |
| renderImages | method | 1928 |
| closeCompletion | method | 1931 |
| renderQueue | method | 1942 |
| applyConfig | method | 1944 |
| controls | method | 1946 |
| reconnectTimer | const | 1948 |
| clearTimeout | method | 1952 |
| controls | method | 1955 |
| scheduleReconnect | function | 2067 |
| clearTimeout | method | 2068 |
| importDir | const | 2072 |
| fillModels | method | 2076 |
| fillSubagentModels | method | 2083 |
| closeCompletion | method | 2100 |
| controls | method | 2105 |
| scrollLatest | method | 2110 |
| enableImagePreview | function | 2142 |
| renderImages | function | 2163 |
| addImages | function | 2188 |
| loadImages | function | 2209 |
| renderImages | method | 2218 |
| selectionCopy | const | 2241 |
| copySelection | function | 2253 |
| escapeTimer | const | 2316 |
| withdrawQueue | function | 2317 |
| refreshing | const | 2399 |
| refreshSessions | function | 2400 |
| timerText | function | 2416 |
| renderTaskTimer | function | 2423 |
| applyElapsed | function | 2436 |
| renderTaskTimer | method | 2442 |
| updatePageTitle | function | 2444 |
| updateSessions | function | 2448 |
| renderTaskTimer | method | 2450 |
| updatePageTitle | method | 2461 |
| renderSessions | method | 2462 |
| recoverMissingSession | function | 2464 |
| controls | method | 2466 |
| saveView | method | 2473 |
| controls | method | 2477 |
| switchSession | function | 2493 |
| saveView | method | 2495 |
| controls | method | 2498 |
| copySessionFile | function | 2524 |
| positionSessionMenu | function | 2537 |
| renderSessions | function | 2543 |
| sessionAction | const | 2695 |
| openSessionAction | function | 2697 |
| contextIcon | function | 2738 |
| renderContextChips | function | 2741 |
| fuzzyHit | function | 2760 |
| renderContextResults | function | 2767 |
| showContextSkills | function | 2787 |
| positionContextSkills | function | 2792 |
| showContextSkills | method | 2804 |
| controls | method | 2839 |
| skillTrigger | const | 2841 |
| showContextSkills | method | 2857 |
| resizePrompt | method | 2866 |
| controls | method | 2867 |
| closeCompletion | function | 2870 |
| highlightCompletion | function | 2878 |
| chooseCompletion | function | 2887 |
| closeCompletion | method | 2897 |
| updateCompletion | function | 2900 |
| closeCompletion | method | 2901 |
| resizePrompt | method | 2957 |
| controls | method | 2958 |
| switchSession | method | 2998 |
| creationLoad | const | 3009 |
| refreshPresets | function | 3010 |
| createAgentPicker | function | 3045 |
| options | method | 3071 |
| fill | method | 3079 |
| fillThinking | method | 3087 |
| options | method | 3089 |
| loadCreation | function | 3136 |
| openCreation | function | 3172 |
| rememberCreation | const | 3193 |
| updateDefaultsPreview | function | 3225 |
| updateDefaultsPreview | method | 3249 |
| controls | method | 3304 |

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

### public/markdown.js（247 行） — marked + DOMPurify 渲染（XSS 边界）

| 符号 | 类型 | 行 |
|---|---|---|
| cache | const | 4 |
| policy | const | 5 |
| textLanguages | const | 11 |
| isText | const | 12 |
| asciiTable | function | 15 |
| looksLikeDiagram | function | 46 |
| layoutDiagram | function | 53 |
| isJson | function | 82 |
| fixCjkBold | function | 89 |
| jsonControls | function | 103 |
| renderMarkdown | function | 142 |

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

### public/model-manager.js（1272 行） — 统一模型管理：供应商、字段覆盖与思考等级编辑

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
| renderProviders | method | 1269 |

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

### public/service-settings.js（278 行） — 设置页服务维护：真实进度、结果、更新确认与独立维护通道

| 符号 | 类型 | 行 |
|---|---|---|
| MAINT_URL_RE | const | 16 |
| POLL_MS | const | 17 |
| initServiceSettings | function | 19 |

### public/stream-renderer.js（46 行） — 流式增量渲染状态机

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

### scripts/autostart.mjs（133 行） — Windows/macOS/Linux 当前用户登录自动启动安装/卸载

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
| main | function | 116 |

### scripts/install.mjs（95 行） — 一键安装：装依赖/注册自启/启动守护/健康检查/打开浏览器

| 符号 | 类型 | 行 |
|---|---|---|
| root | const | 15 |
| parseArgs | const | 17 |
| openCommand | const | 26 |
| ensurePi | const | 32 |
| viaShell | const | 39 |
| probe | const | 45 |
| ask | const | 53 |
| install | function | 55 |
| invoked | const | 92 |

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

### scripts/service.mjs（520 行） — 服务守护：IPC 重启、HTTP 安全停止与崩溃退避停止通道

| 符号 | 类型 | 行 |
|---|---|---|
| root | const | 16 |
| output | const | 17 |
| run | function | 18 |
| npmRun | const | 31 |
| installTag | function | 39 |
| controlPath | function | 42 |
| stagedSha | const | 48 |
| verifySdkImport | function | 58 |
| prepareUpdate | function | 67 |
| swapUpdate | function | 85 |
| commitUpdate | function | 115 |
| rollbackUpdate | function | 121 |
| update | function | 129 |
| prepareRebuild | function | 137 |
| swapRebuild | function | 150 |
| commitRebuild | function | 161 |
| rollbackRebuild | function | 165 |
| rebuild | function | 171 |
| READY_TIMEOUT_MS | const | 179 |
| supervise | function | 181 |
| mkdirSync | method | 190 |
| spawnWorker | method | 457 |
| invoked | const | 461 |
| stopService | function | 462 |

### scripts/uninstall.mjs（18 行） — 统一卸载：核对 npm 目标、安全停止、取消自启、保留用户数据

| 符号 | 类型 | 行 |
|---|---|---|
| uninstall | function | 8 |

### src/capabilities.js（139 行） — 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities）

| 符号 | 类型 | 行 |
|---|---|---|
| sdkEntry | const | 12 |
| resolver | const | 13 |
| alias | const | 14 |
| jiti | const | 21 |
| snapshotSettings | function | 23 |
| discoverCapabilities | function | 36 |
| resolveCapabilities | function | 77 |
| refreshProjectSkills | function | 94 |
| capabilityLoader | function | 104 |

### src/compaction.js（390 行） — 后台独立摘要、token/占比阈值、快照校验与 turn 安全提交

| 符号 | 类型 | 行 |
|---|---|---|
| contextTokens | function | 19 |
| prepareBackgroundCompaction | function | 26 |
| DEFAULT_COMPACTION_CONFIG | const | 53 |
| normalizeCompaction | function | 55 |
| overCompactionThreshold | function | 59 |
| entryIdFor | function | 65 |
| summarizedEntryIds | function | 78 |
| SUMMARY_SYSTEM_PROMPT | const | 95 |
| summaryRequest | function | 98 |
| parseSummaryOutput | function | 113 |
| throwIfAborted | function | 126 |
| summarizeWithPiSession | function | 130 |
| throwIfAborted | method | 131 |
| createBackgroundCompaction | function | 204 |

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

### src/pi.js（384 行） — createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档）

| 符号 | 类型 | 行 |
|---|---|---|
| agentRuntime | function | 14 |
| queueStateOf | function | 30 |
| hasModelOutput | function | 49 |
| withdrawQueue | function | 59 |
| recallLastMessage | function | 69 |
| TITLE_INSTRUCTION | const | 92 |
| memoryExtension | function | 101 |
| createPiFactory | function | 124 |

### src/protocol.js（353 行） — zod 协议：selection / command 判别联合（消息类型见 L3）

| 符号 | 类型 | 行 |
|---|---|---|
| id | const | 4 |
| capabilities | const | 5 |
| workspace | const | 8 |
| thinking | const | 9 |
| queueType | const | 10 |
| base64Pattern | const | 12 |
| decodedBytes | const | 13 |
| promptImage | const | 14 |
| promptImages | const | 25 |
| imageSignatures | const | 30 |
| assertPromptImages | function | 37 |
| compactionDefaults | const | 44 |
| compaction | const | 48 |
| retryPatterns | const | 58 |
| selection | const | 64 |
| taskBudget | const | 77 |
| preset | const | 82 |
| presetStore | const | 88 |
| providerKey | const | 90 |
| modelKey | const | 93 |
| secretValueIn | const | 100 |
| secretHeadersIn | const | 105 |
| thinkingLevelMapIn | const | 106 |
| costIn | const | 114 |
| providerConfigIn | const | 133 |
| modelConfigIn | const | 149 |
| modelOverrideIn | const | 166 |
| fingerprintIn | const | 167 |
| command | const | 168 |

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

### src/retry.js（173 行） — 模型失败重试：可取消退避、最多45次、16分钟封顶、自定义错误词表、保留已有工具结果继续

| 符号 | 类型 | 行 |
|---|---|---|
| RETRY_DELAYS_MS | const | 5 |
| MAX_DELAY_MS | const | 6 |
| MAX_RETRIES | const | 7 |
| delayFor | const | 8 |
| MAX_TIMEOUT_MS | const | 14 |
| abortableSleep | const | 15 |
| classify | class | 51 |
| dropFailedAssistant | function | 75 |
| RESUMABLE_STOP_REASONS | const | 84 |
| canResume | function | 85 |
| createAutoRetry | function | 101 |

### src/server.js（478 行） — createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发

| 符号 | 类型 | 行 |
|---|---|---|
| assets | const | 8 |
| createServerApp | function | 46 |

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

### src/sessions.js（1301 行） — Sessions：会话生命周期、增量保存、元数据启动与SDK按需恢复

| 符号 | 类型 | 行 |
|---|---|---|
| BROWSE_PAGE | const | 18 |
| SEARCH_LIMIT | const | 20 |
| SEARCH_DIR_LIMIT | const | 21 |
| IGNORED_ENTRIES | const | 23 |
| fuzzyHit | function | 26 |
| matchRank | function | 37 |
| searchEntries | function | 46 |
| pointStatus | function | 74 |
| trackElapsed | function | 81 |
| resolveDir | function | 91 |
| parentOf | function | 102 |
| absoluteCrumbs | function | 111 |
| importedTitle | function | 133 |
| hostLocations | function | 155 |
| Sessions | class | 170 |
| constructor | method | 171 |
| applyDefaults | method | 193 |
| loadDefaults | method | 208 |
| migrateDefaults | method | 218 |
| migratePresets | method | 231 |
| loadTaskBudget | method | 246 |
| getTaskBudget | method | 257 |
| configureTaskBudget | method | 262 |
| getDefaults | method | 268 |
| workspaceDefaults | method | 271 |
| configureDefaults | method | 289 |
| saveDefaults | method | 294 |
| validateSelection | method | 333 |
| validateCompaction | method | 364 |
| listPresets | method | 382 |
| mutatePresets | method | 392 |
| savePreset | method | 405 |
| deletePreset | method | 420 |
| load | method | 429 |
| ensureLoaded | method | 448 |
| migrateLegacySessions | method | 470 |
| sessionData | method | 494 |
| persist | method | 507 |
| writeChange | method | 525 |
| saveChange | method | 540 |
| list | method | 545 |
| rename | method | 562 |
| importSession | method | 575 |
| create | method | 602 |
| scheduleTaskNotifications | method | 914 |
| deliverTaskNotifications | method | 926 |
| get | method | 950 |
| revealWorkspace | method | 955 |
| browse | method | 969 |
| listFiles | method | 975 |
| refreshSkills | method | 1037 |
| snapshot | method | 1043 |
| subscribe | method | 1072 |
| configure | method | 1078 |
| startRun | method | 1113 |
| retry | method | 1149 |
| prompt | method | 1156 |
| withdraw | method | 1181 |
| cancel | method | 1230 |
| remove | method | 1253 |
| close | method | 1291 |

### src/task-budget.js（36 行） — 主子代理轮次预算规则、收尾提示词与配置页参数校验

| 符号 | 类型 | 行 |
|---|---|---|
| WRAP_UP_PROMPT | const | 6 |
| TASK_BUDGET_LIMITS | const | 9 |
| taskBudgetDefaults | const | 12 |
| within | const | 14 |
| taskBudgetPolicy | function | 21 |
| budgetSystemPrompt | const | 34 |

### src/tasks.js（121 行） — Tasks：子任务（委托）生命周期

| 符号 | 类型 | 行 |
|---|---|---|
| Tasks | class | 4 |
| constructor | method | 5 |
| start | method | 13 |
| snapshotJob | method | 26 |
| publish | method | 33 |
| view | method | 38 |
| snapshot | method | 41 |
| run | method | 45 |
| read | method | 90 |
| append | method | 97 |
| cancel | method | 107 |

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

### tests/app.test.js（1705 行） — node --test 测试（npm test）

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

### tests/codebase-index.test.js（20 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| ROOT | const | 7 |
| SKILL | const | 8 |
| execFileSync | method | 11 |

### tests/compaction-ui.test.js（125 行） — node --test 测试（npm test）

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

### tests/conversation-preview.mjs（123 行） — node --test 测试（npm test）

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
| app | const | 120 |
| port | const | 121 |

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

### tests/memory-ui.test.js（97 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 12 |
| restore | method | 41 |

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

### tests/model-manager.test.js（1203 行） — node --test 测试（npm test）

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
| row | method | 510 |
| row | method | 521 |
| discoverPanelEl | const | 821 |
| discoverRows | const | 822 |
| rowBox | const | 823 |
| addSelectedButton | const | 824 |
| fetchButton | const | 825 |
| checkRow | const | 826 |
| rowBox | method | 827 |
| rowBox | method | 828 |
| fetchButton | method | 838 |
| checkRow | method | 859 |
| fetchButton | method | 871 |
| checkRow | method | 883 |
| checkRow | method | 884 |
| addSelectedButton | method | 885 |
| fetchButton | method | 919 |
| addSelectedButton | method | 926 |
| addSelectedButton | method | 945 |
| fetchButton | method | 967 |
| fetchButton | method | 975 |
| fetchButton | method | 998 |
| fetchButton | method | 1017 |
| fetchButton | method | 1020 |
| fetchButton | method | 1037 |
| fetchButton | method | 1043 |
| sonnetCatalog | const | 1061 |
| openSonnet | const | 1066 |
| checkLevel | const | 1073 |
| checkLevel | method | 1090 |
| checkLevel | method | 1118 |
| confirmDialog | method | 1156 |
| confirmDialog | method | 1188 |

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

### tests/retry.test.js（369 行） — node --test 测试（npm test）

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

### tests/service.test.js（538 行） — node --test 测试（npm test）

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
| spawn | method | 90 |
| startTest | const | 95 |
| maintEnv | const | 104 |
| getStatus | const | 105 |
| stateOf | const | 111 |
| teardown | const | 118 |
| NPM_FAKE | const | 126 |
| say | const | 130 |
| sdkStub | const | 131 |
| mkdirSync | method | 132 |
| writeFileSync | method | 133 |
| writeFileSync | method | 134 |
| rmSync | method | 142 |
| sdkStub | method | 144 |
| writeFileSync | method | 145 |
| writeFileSync | method | 146 |
| writeFileSync | method | 147 |
| rmSync | method | 155 |
| sdkStub | method | 156 |
| writeFileSync | method | 157 |
| installNpmShim | const | 163 |
| A40 | const | 176 |

### tests/session-created-at.test.js（44 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 8 |

### tests/session-flow.test.js（417 行） — node --test 测试（npm test）

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

### tests/task-notifications.test.js（197 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factoryFixture | function | 10 |
| tick | const | 28 |
| until | function | 29 |

### tests/task-timer.test.js（55 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 9 |
| state | const | 19 |
| settle | const | 20 |

### tests/tasks.test.js（117 行） — node --test 测试（npm test）

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

- 协议 command.type：image、inherit、radius、service.status、service.update.check、service.restart、remote.get、remote.login、remote.configure、session.rename、workspace.reveal、workspace.browse、files.browse、models.list、models.config.get、models.provider.save、models.provider.delete、models.provider.rename、models.model.save、models.model.delete、models.provider.discover、models.favorites.get、models.model.override、models.auth.list、models.auth.start、models.auth.status、models.auth.respond、models.auth.cancel、models.auth.logout、models.hidden.set、models.favorites.set、capabilities.list、session.defaults.get、session.defaults.configure、task.budget.get、task.budget.configure、session.presets.list、session.presets.save、session.presets.delete、session.configure、sessions.list、session.create、session.import、session.attach、session.skills.refresh、session.close、prompt、cancel、session.retry、queue.withdraw、tasks.read（src/protocol.js）
- HTML id：sidebar、open-workspace、new、custom-new、preset-list、import-session、search、sessions、open-settings、sidebar-backdrop、toggle-sidebar、session-title、workspace-label、copy-workspace、reveal-workspace、workspace-feedback、github-link、status、service-dev、service-version、toggle-theme、login、maintenance-state、connect、workspace、earliest、transcript、output、latest、message-queue、task-runs、compaction-progress、add-context、add-image、image-files、context-chips、task-timer、task-timer-value、context-menu、context-picker、context-back、context-title、context-close、context-search、context-results、context-error、image-attachments、composer、prompt、prompt-completion、composer-skill、provider、model、thinking、stop、send-steer、send-followup、send、session-runtime、mobile-runtime、mobile-expand、composer-help、error、session-action、session-action-form、session-action-title、session-action-description、session-name-label、session-name、session-action-error、session-action-cancel、session-action-submit、image-preview、image-preview-close、image-preview-image、restart-dialog、restart-form、restart-title、restart-description、restart-warning、restart-cancel、restart-submit、task-overlays、task-template、settings、settings-title、settings-defaults-tab、settings-remote-tab、settings-models-tab、settings-service-tab、defaults-panel、selection-copy-title、selection-copy、selection-copy-help、selection-copy-feedback、queue-type、steer-help、followup-help、defaults-preview、task-budget-title、task-max-turns、task-wrap-up-window、task-budget-help、subagent-title、subagent-help、subagent-provider、subagent-model、settings-feedback、defaults-title、defaults-editor、remote-panel、remote-status-title、remote-status、remote-login、remote-auth、remote-url、remote-form、remote-note、remote-enabled、remote-email、remote-email-help、remote-feedback、remote-refresh、remote-save、models-panel、service-panel、service-state-title、service-feedback、service-restart-title、restart-quick、restart-rebuild、service-recover、service-update-section、service-update-title、update-check、update-result、update-install、service-history-title、service-history、create-session、create-title、create-form、preset-fields、preset-name、preset-fixed-cwd、preset-directory、preset-delete、create-workspace、create-defaults-help、create-agents、create-compaction、create-retry、create-trust-row、create-trust、create-feedback、create-submit（public/index.html）
- HTTP 静态路由：/、/favicon.svg、/style.css、/theme.js、/app.js、/service-settings.js、/file-picker.js、/tooltip.js、/tooltip.css、/file-picker.css、/markdown.js、/stream-renderer.js、/memory-tags.js、/vendor/marked.js、/vendor/purify.js、/model-manager.js、/model-auth.js、/model-manager.css、/model-picker.js、/model-picker.css、/health（src/server.js）

## ⚠ 未登记文件（0）

（无）
