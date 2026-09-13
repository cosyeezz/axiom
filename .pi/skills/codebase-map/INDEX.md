<!-- 自动生成，勿手改。重建：node .pi/skills/codebase-map/scripts/reindex.mjs -->
# Axiom 多级代码索引（生成于 2026/9/13 09:35:20）

## L1 模块总览（文件 → 职责）

| 文件 | 行数 | 职责 | 关键符号 |
|---|---|---|---|
| public/app.js | 3283 | 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度 | filePicker, $, ws, sessionMissing |
| public/file-picker.css | 274 | 文件选择弹窗主题与响应式布局 | - |
| public/file-picker.js | 355 | 共享文件/目录选择弹窗、懒加载与分类 SVG 图标 | NS, SEARCH_DEBOUNCE, el, FOLDER_COLORS |
| public/index.html | 317 | 页面骨架与元素 id（见 L3） | - |
| public/markdown.js | 247 | marked + DOMPurify 渲染（XSS 边界） | cache, policy, textLanguages, isText |
| public/memory-tags.js | 94 | 主子代理共享简单标签提取与流式显示过滤 | TAGS, NAMES, TAG, OPEN |
| public/model-manager.css | 474 | 模型配置页：供应商列表、编辑表单与响应式布局 | - |
| public/model-manager.js | 1215 | Pi 模型管理：供应商模板、模型编辑与安全保存反馈 | API_TYPES, PROVIDER_TEMPLATES, PROVIDER_ID, MASK_KINDS |
| public/model-picker.css | 88 | 共享收藏下拉：暗色浮层、星标、触屏与焦点样式 | - |
| public/model-picker.js | 300 | 共享模型选择器：供应商/模型/思考收藏、排序与键盘交互 | GAP, EDGE, TYPEAHEAD_MS, el |
| public/service-settings.js | 278 | 设置页服务维护：真实进度、结果、更新确认与独立维护通道 | MAINT_URL_RE, POLL_MS, initServiceSettings |
| public/stream-renderer.js | 46 | 流式增量渲染状态机 | createStreamRenderer |
| public/style.css | 1355 | 全局样式（CSP 禁 inline style，样式一律进这里） | - |
| public/text-contrast.css | 46 | 文字专用对比度档位与调节面板 | - |
| public/text-contrast.js | 113 | 文字对比度按钮、实时调节与本地偏好 | KEY, MIN, MAX, STEP |
| public/tooltip.css | 50 | 共享暗色悬停说明样式 | - |
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
| src/model-config.js | 579 | Pi models.json 无损配置读写与共享收藏持久化 | sdkModelConfig, sdkResolveConfigValue, digest, LEVELS |
| src/pi-model-storage.js | 304 | 模型与凭据 SQLite 权威存储、Pi 派生兼容文件 | sdkResolveConfigValue, sdkIsCommandConfigValue, NAMESPACE, AUTH_NAMESPACE |
| src/pi.js | 365 | createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档） | agentRuntime, queueStateOf, hasModelOutput, withdrawQueue |
| src/protocol.js | 345 | zod 协议：selection / command 判别联合（消息类型见 L3） | id, capabilities, workspace, thinking |
| src/remote.js | 547 | Tailscale 登录身份、远程监听、同账号授权与本机配置持久化 | configSchema, execOptions, cliEnv, defaultRun |
| src/retry.js | 173 | 模型失败重试：可取消退避、最多45次、16分钟封顶、自定义错误词表、保留已有工具结果继续 | RETRY_DELAYS_MS, MAX_DELAY_MS, MAX_RETRIES, delayFor |
| src/server.js | 465 | createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发 | assets, createServerApp |
| src/session-memory.js | 29 | 标题提取登记、轮次预算挂钩与委派背景 | textOf, memoryHooks |
| src/session-store.js | 457 | 会话四表、实体增量更新、逐会话事务与旧数据迁移 | EVENT_TYPES, SESSION_FIELDS, TABLES, INDEXES |
| src/sessions.js | 1286 | Sessions：会话生命周期、增量保存、元数据启动与SDK按需恢复 | BROWSE_PAGE, SEARCH_LIMIT, SEARCH_DIR_LIMIT, IGNORED_ENTRIES |
| src/task-budget.js | 36 | 主子代理轮次预算规则、收尾提示词与配置页参数校验 | WRAP_UP_PROMPT, TASK_BUDGET_LIMITS, taskBudgetDefaults, within |
| src/tasks.js | 121 | Tasks：子任务（委托）生命周期 | Tasks |
| src/tools.js | 110 | delegationTools：委托/凭证读取/追加工具定义（zod 入参） | delegateInput, readInput, appendInput, result |
| src/update.js | 41 | 检查更新：本地安装（提交 SHA/版本）比对 GitHub 公开仓库 master，npm 安装实例可自动重装 | repo, npmSpec, commitFile, validateCommit |
| tests/activity-groups-ui.py | 201 | node --test 测试（npm test） | activityHistory, sessions |
| tests/app.test.js | 1675 | node --test 测试（npm test） | pickerSource, contrastSource, modelSources, serviceSource |
| tests/autoscroll-ui.py | 99 | node --test 测试（npm test） | - |
| tests/autostart.test.js | 71 | node --test 测试（npm test） | node, cwd, service |
| tests/benchmark.js | 92 | node --test 测试（npm test） | window |
| tests/capabilities.test.js | 208 | node --test 测试（npm test） | - |
| tests/cli-help.test.js | 23 | node --test 测试（npm test） | - |
| tests/codebase-index.test.js | 20 | node --test 测试（npm test） | ROOT, SKILL |
| tests/compaction-config.test.js | 109 | node --test 测试（npm test） | - |
| tests/compaction-ui.py | 57 | node --test 测试（npm test） | - |
| tests/compaction-ui.test.js | 126 | node --test 测试（npm test） | page |
| tests/compaction.test.js | 802 | node --test 测试（npm test） | fakeModel, createTestSession, seq, userMsg |
| tests/config.test.js | 225 | node --test 测试（npm test） | - |
| tests/context-menu-ui.py | 66 | node --test 测试（npm test） | - |
| tests/conversation-preview.mjs | 123 | node --test 测试（npm test） | markdown, message, thinking, state |
| tests/conversation-ui.py | 262 | node --test 测试（npm test） | - |
| tests/database.test.js | 149 | node --test 测试（npm test） | - |
| tests/defaults.test.js | 37 | node --test 测试（npm test） | - |
| tests/file-picker.test.js | 67 | node --test 测试（npm test） | source, tick |
| tests/helpers/model-concurrency-child.mjs | 82 | node --test 测试（npm test） | barrier, runOpponent |
| tests/image-input.test.js | 169 | node --test 测试（npm test） | pngBase64, jpegBase64, image, parsePrompt |
| tests/inline-images.test.js | 42 | node --test 测试（npm test） | text, a, b, user |
| tests/install.test.js | 79 | node --test 测试（npm test） | - |
| tests/manual-retry.test.js | 187 | node --test 测试（npm test） | session, assistant, page, message |
| tests/markdown.test.js | 166 | node --test 测试（npm test） | - |
| tests/memory-preview.mjs | 22 | node --test 测试（npm test） | state, sessions, app |
| tests/memory-tags.test.js | 70 | node --test 测试（npm test） | - |
| tests/memory-ui.test.js | 98 | node --test 测试（npm test） | page |
| tests/message-activity.test.js | 407 | node --test 测试（npm test） | page, assistant, thought, call |
| tests/mobile-reading-ui.py | 103 | node --test 测试（npm test） | - |
| tests/model-config.test.js | 980 | node --test 测试（npm test） | sha, EMPTY, tempDir, openDatabases |
| tests/model-manager.test.js | 1048 | node --test 测试（npm test） | source, tick, j, masked |
| tests/model-onboarding-ui.test.js | 154 | node --test 测试（npm test） | stripImports, modelSources, contrastSource, pickerSource |
| tests/model-onboarding.test.js | 55 | node --test 测试（npm test） | - |
| tests/model-picker.test.js | 311 | node --test 测试（npm test） | source, tick, nap, OPTS |
| tests/model-selection-preview.mjs | 52 | node --test 测试（npm test） | home, catalog, factory, sessions |
| tests/model-selection-ui.py | 60 | node --test 测试（npm test） | - |
| tests/model-settings-ui.py | 44 | node --test 测试（npm test） | - |
| tests/model-thinking-favorites.test.js | 122 | node --test 测试（npm test） | appSource, pickerSource, contrastSource, modelSources |
| tests/pi-memory.test.js | 168 | node --test 测试（npm test） | - |
| tests/pi-model-storage.test.js | 402 | node --test 测试（npm test） | tempDir, makeStorage, seedPiModels, seedPiAuth |
| tests/presets.test.js | 112 | node --test 测试（npm test） | makeFactory |
| tests/project-skills.test.js | 59 | node --test 测试（npm test） | - |
| tests/recall.test.js | 202 | node --test 测试（npm test） | user, assistant, thinking, fixture |
| tests/remote-ui.py | 51 | node --test 测试（npm test） | - |
| tests/remote-ui.test.js | 225 | node --test 测试（npm test） | page, modelSources, flush, stubRequest |
| tests/remote.test.js | 721 | node --test 测试（npm test） | EMAIL, mockTailscale, fakeChild, fakeDatabase |
| tests/retry.test.js | 369 | node --test 测试（npm test） | RATE_LIMIT, QUOTA, ABORTED, fakeSession |
| tests/server.test.js | 125 | node --test 测试（npm test） | - |
| tests/service-api.test.js | 106 | node --test 测试（npm test） | - |
| tests/service-settings-api.test.js | 71 | node --test 测试（npm test） | - |
| tests/service-settings-ui.py | 60 | node --test 测试（npm test） | - |
| tests/service-settings.test.js | 377 | node --test 测试（npm test） | source, html, setup |
| tests/service.test.js | 527 | node --test 测试（npm test） | until, readMaybe, killTree, buildWorkspace |
| tests/session-created-at.test.js | 44 | node --test 测试（npm test） | factory |
| tests/session-flow.test.js | 417 | node --test 测试（npm test） | flowFactory, jsonlFactory |
| tests/session-memory.test.js | 110 | node --test 测试（npm test） | reply |
| tests/session-migration.test.js | 266 | node --test 测试（npm test） | factory, workspaceHash |
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
| tests/text-contrast.test.js | 162 | node --test 测试（npm test） | source, css, fakeStorage, throwingStorage |
| tests/text-diagram-ui.py | 36 | node --test 测试（npm test） | - |
| tests/tooltip.test.js | 282 | node --test 测试（npm test） | source, boot, fire, tip |
| tests/ui-sticky-check.html | 63 | node --test 测试（npm test） | checks, lines, ok |
| tests/ui-sticky-check.mjs | 104 | node --test 测试（npm test） | here, candidates, browser, port |
| tests/uninstall.test.js | 45 | node --test 测试（npm test） | - |
| tests/update.test.js | 38 | node --test 测试（npm test） | old |
| tests/workspace-isolation.test.js | 80 | node --test 测试（npm test） | - |
| tests/workspace-picker.test.js | 99 | node --test 测试（npm test） | - |
| tests/workspace-tabs.test.js | 235 | node --test 测试（npm test） | appSource, pickerSource, contrastSource, modelSources |

## L2 符号 → 行号（跳转：read <文件> offset=<行>）

### public/app.js（3283 行） — 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度

| 符号 | 类型 | 行 |
|---|---|---|
| filePicker | const | 12 |
| $ | const | 13 |
| ws | const | 14 |
| sessionMissing | const | 24 |
| onboarding | const | 25 |
| allSessions | const | 26 |
| views | const | 28 |
| compactionDefaults | const | 29 |
| taskBudgetDefaults | const | 31 |
| thinkingLevels | const | 32 |
| modelFavorites | const | 33 |
| favoriteKey | function | 36 |
| modelPicker | const | 41 |
| modelManager | const | 55 |
| serviceUi | const | 56 |
| compactions | const | 57 |
| lastMainMessage | const | 59 |
| compactionNodes | const | 60 |
| images | const | 61 |
| completionVersion | const | 62 |
| selectedSkill | const | 63 |
| hiddenSessions | const | 67 |
| readSessionPreference | function | 72 |
| changeSessionPreference | function | 76 |
| setSessionHidden | function | 90 |
| saveView | function | 105 |
| resizePrompt | function | 116 |
| scrollFrame | const | 122 |
| FOLLOW_GAP | const | 123 |
| scrollIntent | const | 124 |
| lastScrollTops | const | 125 |
| noteScrollIntent | const | 127 |
| atLatest | const | 129 |
| readFollow | function | 132 |
| scrollToLatest | const | 141 |
| scrollLatest | function | 142 |
| scheduleCallGroups | method | 143 |
| transcript | const | 152 |
| growthWatch | const | 154 |
| growthObserver | function | 155 |
| watchGrowth | function | 158 |
| forgetGrowth | function | 159 |
| renderer | const | 162 |
| scrollLatest | method | 186 |
| mobile | const | 188 |
| sidebar | function | 189 |
| sidebar | method | 199 |
| sidebar | method | 202 |
| resizePrompt | method | 203 |
| pending | const | 211 |
| requestSeq | const | 216 |
| error | function | 217 |
| request | function | 220 |
| controls | function | 229 |
| renderContextChips | method | 254 |
| syncRetryPrompt | method | 261 |
| options | function | 269 |
| providerEntries | const | 278 |
| modelEntries | const | 279 |
| refreshModelCatalog | function | 281 |
| fillModels | function | 309 |
| options | method | 310 |
| fillSubagentModels | function | 316 |
| options | method | 318 |
| capabilityName | function | 326 |
| runtimeSummary | function | 336 |
| renderRuntime | function | 349 |
| updateTaskRuntime | function | 365 |
| renderRuntime | method | 367 |
| applyConfig | function | 370 |
| options | method | 372 |
| renderRuntime | method | 378 |
| options | method | 379 |
| fillSubagentModels | method | 384 |
| fillModels | method | 386 |
| options | method | 387 |
| configure | function | 393 |
| controls | method | 396 |
| taskBudgetInputs | const | 419 |
| loadTaskBudget | function | 420 |
| saveTaskBudget | function | 429 |
| showSettingsPanel | function | 443 |
| showSettingsPanel | method | 459 |
| showSettingsPanel | method | 463 |
| controls | method | 464 |
| remoteView | const | 476 |
| remoteLoaded | const | 477 |
| remoteAnchor | function | 478 |
| remoteRender | function | 486 |
| controls | method | 532 |
| remoteLoad | function | 534 |
| remoteAuthUrl | function | 550 |
| remoteLogin | function | 558 |
| remoteOnReconnect | function | 584 |
| controls | method | 598 |
| messageItems | const | 611 |
| activityPaths | const | 613 |
| setActivityIcon | function | 630 |
| callGroupsFrame | const | 640 |
| scheduleCallGroups | function | 641 |
| createCallGroup | function | 650 |
| paintCallGroup | function | 664 |
| refreshCallGroups | function | 693 |
| foldCallsBeforeMessage | function | 793 |
| paintCallGroup | method | 797 |
| disclosureHint | function | 799 |
| activityLine | function | 819 |
| setActivity | method | 829 |
| setActivity | function | 832 |
| scheduleCallGroups | method | 833 |
| setActivityIcon | method | 835 |
| waiting | function | 846 |
| scheduleCallGroups | method | 848 |
| scrollLatest | method | 854 |
| clearWaiting | function | 856 |
| stopActivity | function | 860 |
| scheduleCallGroups | method | 862 |
| clearWaiting | method | 863 |
| updateActivity | function | 872 |
| setActivity | method | 885 |
| setActivity | method | 886 |
| mergeThoughts | function | 890 |
| diffView | const | 908 |
| renderToolDetail | function | 913 |
| section | method | 999 |
| toolState | function | 1001 |
| clearWaiting | method | 1003 |
| setActivity | method | 1047 |
| renderToolDetail | method | 1048 |
| scrollLatest | method | 1049 |
| card | function | 1051 |
| renderMessage | function | 1102 |
| updateActivity | method | 1197 |
| renderCompactionStatus | function | 1200 |
| trackTaskEntries | function | 1217 |
| placeCompactedTasks | function | 1228 |
| placeCompactedRetries | method | 1229 |
| compactionCard | function | 1238 |
| renderMarkdown | method | 1258 |
| foldCompaction | function | 1261 |
| placeCompactedTasks | method | 1281 |
| mergeThoughts | method | 1282 |
| compactionEditor | function | 1289 |
| options | method | 1327 |
| fillThinking | method | 1357 |
| retryChipList | function | 1366 |
| retryEditor | function | 1415 |
| renderTaskRuns | function | 1435 |
| renderQueue | function | 1463 |
| canResumeMessage | const | 1482 |
| retryPrompt | const | 1484 |
| syncRetryPrompt | function | 1485 |
| scrollLatest | method | 1510 |
| retryCards | const | 1512 |
| placeCompactedRetries | function | 1513 |
| retryArchive | function | 1530 |
| renderRetry | function | 1543 |
| placeCompactedRetries | method | 1579 |
| scrollLatest | method | 1580 |
| event | function | 1582 |
| snapshot | function | 1755 |
| clearTimeout | method | 1758 |
| updatePageTitle | method | 1776 |
| renderTaskRuns | method | 1786 |
| renderCompactionStatus | method | 1791 |
| restoreRetries | method | 1852 |
| mergeThoughts | method | 1866 |
| placeCompactedTasks | method | 1880 |
| renderImages | method | 1894 |
| closeCompletion | method | 1897 |
| renderQueue | method | 1908 |
| applyConfig | method | 1910 |
| controls | method | 1912 |
| reconnectTimer | const | 1914 |
| clearTimeout | method | 1918 |
| controls | method | 1921 |
| scheduleReconnect | function | 2033 |
| clearTimeout | method | 2034 |
| importDir | const | 2038 |
| fillModels | method | 2042 |
| fillSubagentModels | method | 2049 |
| closeCompletion | method | 2066 |
| controls | method | 2071 |
| scrollLatest | method | 2076 |
| enableImagePreview | function | 2108 |
| renderImages | function | 2129 |
| addImages | function | 2154 |
| loadImages | function | 2175 |
| renderImages | method | 2184 |
| selectionCopy | const | 2207 |
| copySelection | function | 2219 |
| escapeTimer | const | 2282 |
| withdrawQueue | function | 2283 |
| refreshing | const | 2365 |
| refreshSessions | function | 2366 |
| timerText | function | 2382 |
| renderTaskTimer | function | 2389 |
| applyElapsed | function | 2402 |
| renderTaskTimer | method | 2408 |
| updatePageTitle | function | 2410 |
| updateSessions | function | 2414 |
| renderTaskTimer | method | 2416 |
| updatePageTitle | method | 2427 |
| renderSessions | method | 2428 |
| recoverMissingSession | function | 2430 |
| controls | method | 2432 |
| saveView | method | 2439 |
| controls | method | 2443 |
| switchSession | function | 2459 |
| saveView | method | 2461 |
| controls | method | 2464 |
| copySessionFile | function | 2490 |
| positionSessionMenu | function | 2503 |
| renderSessions | function | 2509 |
| sessionAction | const | 2661 |
| openSessionAction | function | 2663 |
| contextIcon | function | 2704 |
| renderContextChips | function | 2707 |
| fuzzyHit | function | 2726 |
| renderContextResults | function | 2733 |
| showContextSkills | function | 2753 |
| positionContextSkills | function | 2758 |
| showContextSkills | method | 2770 |
| controls | method | 2805 |
| skillTrigger | const | 2807 |
| showContextSkills | method | 2823 |
| resizePrompt | method | 2832 |
| controls | method | 2833 |
| closeCompletion | function | 2836 |
| highlightCompletion | function | 2844 |
| chooseCompletion | function | 2853 |
| closeCompletion | method | 2863 |
| updateCompletion | function | 2866 |
| closeCompletion | method | 2867 |
| resizePrompt | method | 2923 |
| controls | method | 2924 |
| switchSession | method | 2964 |
| creationLoad | const | 2975 |
| refreshPresets | function | 2976 |
| createAgentPicker | function | 3011 |
| options | method | 3037 |
| fill | method | 3045 |
| fillThinking | method | 3053 |
| options | method | 3055 |
| loadCreation | function | 3102 |
| openCreation | function | 3138 |
| rememberCreation | const | 3159 |
| updateDefaultsPreview | function | 3191 |
| updateDefaultsPreview | method | 3215 |
| controls | method | 3270 |

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

### public/memory-tags.js（94 行） — 主子代理共享简单标签提取与流式显示过滤

| 符号 | 类型 | 行 |
|---|---|---|
| TAGS | const | 7 |
| NAMES | const | 8 |
| TAG | const | 10 |
| OPEN | const | 11 |
| CLOSE | const | 12 |
| MARKS | const | 13 |
| FENCE | const | 14 |
| HOLE | const | 16 |
| segments | function | 19 |
| extractMemoryTags | function | 34 |
| stripMemoryTags | function | 53 |

### public/model-manager.js（1215 行） — Pi 模型管理：供应商模板、模型编辑与安全保存反馈

| 符号 | 类型 | 行 |
|---|---|---|
| API_TYPES | const | 22 |
| PROVIDER_TEMPLATES | const | 30 |
| PROVIDER_ID | const | 61 |
| MASK_KINDS | const | 62 |
| DRAFT | const | 64 |
| HIDDEN_VIEW | const | 66 |
| MANAGED_PROVIDER_KEYS | const | 69 |
| MANAGED_MODEL_KEYS | const | 70 |
| isMask | const | 72 |
| hasOwn | const | 73 |
| clone | const | 74 |
| keepMasked | function | 76 |
| stable | function | 84 |
| el | function | 92 |
| fieldSeq | const | 108 |
| field | function | 110 |
| badge | function | 119 |
| parseJsonText | function | 123 |
| SVG_NS | const | 135 |
| ICONS | const | 137 |
| icon | function | 143 |
| openModal | function | 155 |
| closeModal | function | 159 |
| openDialog | function | 168 |
| openModal | method | 186 |
| initModelManager | function | 191 |
| renderProviders | method | 1212 |

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

### public/text-contrast.js（113 行） — 文字对比度按钮、实时调节与本地偏好

| 符号 | 类型 | 行 |
|---|---|---|
| KEY | const | 10 |
| MIN | const | 11 |
| MAX | const | 12 |
| STEP | const | 13 |
| DEFAULT | const | 14 |
| clampLevel | function | 17 |
| readStoredLevel | function | 23 |
| storeLevel | function | 34 |
| applyLevel | function | 42 |
| initTextContrast | function | 47 |
| sync | method | 100 |

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

### src/model-config.js（579 行） — Pi models.json 无损配置读写与共享收藏持久化

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

### src/pi-model-storage.js（304 行） — 模型与凭据 SQLite 权威存储、Pi 派生兼容文件

| 符号 | 类型 | 行 |
|---|---|---|
| sdkResolveConfigValue | const | 10 |
| sdkIsCommandConfigValue | const | 11 |
| NAMESPACE | const | 25 |
| AUTH_NAMESPACE | const | 26 |
| MIGRATED_NAMESPACE | const | 27 |
| CONFIG_KEY | const | 28 |
| FAVORITES_KEY | const | 29 |
| HIDDEN_KEY | const | 31 |
| IMPORT_ERROR_KEY | const | 32 |
| canonicalModelsJson | function | 35 |
| isPlainObject | const | 39 |
| isCredential | const | 41 |
| isPlainObject | method | 42 |
| createPiModelStorage | function | 50 |

### src/pi.js（365 行） — createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档）

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

### src/protocol.js（345 行） — zod 协议：selection / command 判别联合（消息类型见 L3）

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
| fingerprintIn | const | 166 |
| command | const | 167 |

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

### src/server.js（465 行） — createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发

| 符号 | 类型 | 行 |
|---|---|---|
| assets | const | 7 |
| createServerApp | function | 45 |

### src/session-memory.js（29 行） — 标题提取登记、轮次预算挂钩与委派背景

| 符号 | 类型 | 行 |
|---|---|---|
| textOf | const | 4 |
| memoryHooks | function | 11 |

### src/session-store.js（457 行） — 会话四表、实体增量更新、逐会话事务与旧数据迁移

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
| insertSession | method | 296 |
| importLegacySession | method | 322 |
| migrateLegacy | method | 339 |
| updateSession | method | 361 |
| deleteSession | method | 385 |
| saveEvent | method | 391 |
| deleteEvents | method | 410 |
| saveTask | method | 428 |
| listTasks | method | 451 |

### src/sessions.js（1286 行） — Sessions：会话生命周期、增量保存、元数据启动与SDK按需恢复

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
| validateCompaction | method | 354 |
| listPresets | method | 369 |
| mutatePresets | method | 379 |
| savePreset | method | 392 |
| deletePreset | method | 407 |
| load | method | 416 |
| ensureLoaded | method | 435 |
| migrateLegacySessions | method | 457 |
| sessionData | method | 481 |
| persist | method | 494 |
| writeChange | method | 512 |
| saveChange | method | 527 |
| list | method | 532 |
| rename | method | 549 |
| importSession | method | 562 |
| create | method | 589 |
| scheduleTaskNotifications | method | 899 |
| deliverTaskNotifications | method | 911 |
| get | method | 935 |
| revealWorkspace | method | 940 |
| browse | method | 954 |
| listFiles | method | 960 |
| refreshSkills | method | 1022 |
| snapshot | method | 1028 |
| subscribe | method | 1057 |
| configure | method | 1063 |
| startRun | method | 1098 |
| retry | method | 1134 |
| prompt | method | 1141 |
| withdraw | method | 1166 |
| cancel | method | 1215 |
| remove | method | 1238 |
| close | method | 1276 |

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

### tests/app.test.js（1675 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| pickerSource | const | 9 |
| contrastSource | const | 10 |
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

### tests/codebase-index.test.js（20 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| ROOT | const | 7 |
| SKILL | const | 8 |
| execFileSync | method | 11 |

### tests/compaction-ui.test.js（126 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 10 |
| restore | method | 40 |

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

### tests/manual-retry.test.js（187 行） — node --test 测试（npm test）

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
| restore | method | 129 |
| message | const | 133 |
| prompt | const | 134 |

### tests/memory-preview.mjs（22 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| state | const | 3 |
| sessions | const | 12 |
| app | const | 19 |

### tests/memory-ui.test.js（98 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 12 |
| restore | method | 42 |

### tests/message-activity.test.js（407 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 10 |
| restore | method | 40 |
| assistant | const | 44 |
| thought | const | 45 |
| call | const | 46 |
| entry | const | 47 |

### tests/model-config.test.js（980 行） — node --test 测试（npm test）

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

### tests/model-manager.test.js（1048 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| source | const | 7 |
| tick | const | 8 |
| j | const | 10 |
| masked | const | 12 |
| harness | function | 14 |
| apiSelect | method | 77 |
| apiSelect | method | 78 |
| setInput_on | method | 234 |
| setInput_on | function | 262 |
| modelDelete | method | 325 |
| dialogButton | method | 329 |
| modelDelete | method | 335 |
| dialogButton | method | 337 |
| dialogButton | method | 355 |
| confirm | method | 388 |
| confirm | method | 395 |
| row | method | 499 |
| row | method | 510 |
| discoverPanelEl | const | 810 |
| discoverRows | const | 811 |
| rowBox | const | 812 |
| addSelectedButton | const | 813 |
| fetchButton | const | 814 |
| checkRow | const | 815 |
| rowBox | method | 816 |
| rowBox | method | 817 |
| fetchButton | method | 827 |
| checkRow | method | 848 |
| fetchButton | method | 860 |
| checkRow | method | 872 |
| checkRow | method | 873 |
| addSelectedButton | method | 874 |
| fetchButton | method | 908 |
| addSelectedButton | method | 915 |
| addSelectedButton | method | 934 |
| fetchButton | method | 956 |
| fetchButton | method | 964 |
| fetchButton | method | 987 |
| fetchButton | method | 1006 |
| fetchButton | method | 1009 |
| fetchButton | method | 1026 |
| fetchButton | method | 1032 |

### tests/model-onboarding-ui.test.js（154 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| stripImports | const | 8 |
| modelSources | const | 9 |
| contrastSource | const | 14 |
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
| appSource | const | 9 |
| pickerSource | const | 10 |
| contrastSource | const | 11 |
| modelSources | const | 12 |
| html | const | 17 |
| MODEL_KEY | const | 19 |
| bootPage | function | 21 |
| click | const | 76 |
| menu | const | 77 |
| opts | const | 78 |
| stars | const | 79 |

### tests/pi-model-storage.test.js（402 行） — node --test 测试（npm test）

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

### tests/remote-ui.test.js（225 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 10 |
| modelSources | const | 17 |
| flush | const | 41 |
| stubRequest | function | 42 |
| submit | const | 52 |

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

### tests/service.test.js（527 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| until | const | 15 |
| readMaybe | const | 24 |
| killTree | const | 25 |
| buildWorkspace | const | 32 |
| WORKER | const | 47 |
| fs | const | 48 |
| ready | const | 66 |
| ready | method | 74 |
| ready | method | 77 |
| startDaemon | const | 81 |
| spawn | method | 82 |
| startTest | const | 87 |
| maintEnv | const | 96 |
| getStatus | const | 97 |
| stateOf | const | 103 |
| teardown | const | 110 |
| NPM_FAKE | const | 117 |
| say | const | 121 |
| sdkStub | const | 122 |
| mkdirSync | method | 123 |
| writeFileSync | method | 124 |
| writeFileSync | method | 125 |
| rmSync | method | 133 |
| sdkStub | method | 135 |
| writeFileSync | method | 136 |
| writeFileSync | method | 137 |
| writeFileSync | method | 138 |
| rmSync | method | 146 |
| sdkStub | method | 147 |
| writeFileSync | method | 148 |
| installNpmShim | const | 154 |
| A40 | const | 167 |

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

### tests/text-contrast.test.js（162 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| source | const | 7 |
| css | const | 8 |
| fakeStorage | const | 10 |
| throwingStorage | const | 19 |
| boot | class | 21 |

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
| appSource | const | 9 |
| pickerSource | const | 10 |
| contrastSource | const | 11 |
| modelSources | const | 12 |
| html | const | 17 |
| state | const | 19 |
| STATES | const | 24 |
| bootPage | function | 30 |
| attachCalls | const | 84 |

## L3 横切常量（跨模块定位入口）

- 协议 command.type：image、inherit、radius、service.status、service.update.check、service.restart、remote.get、remote.login、remote.configure、session.rename、workspace.reveal、workspace.browse、files.browse、models.list、models.config.get、models.provider.save、models.provider.delete、models.provider.rename、models.model.save、models.model.delete、models.provider.discover、models.favorites.get、models.hidden.set、models.favorites.set、capabilities.list、session.defaults.get、session.defaults.configure、task.budget.get、task.budget.configure、session.presets.list、session.presets.save、session.presets.delete、session.configure、sessions.list、session.create、session.import、session.attach、session.skills.refresh、session.close、prompt、cancel、session.retry、queue.withdraw、tasks.read（src/protocol.js）
- HTML id：sidebar、open-workspace、new、custom-new、preset-list、import-session、search、sessions、open-settings、sidebar-backdrop、toggle-sidebar、session-title、workspace-label、copy-workspace、reveal-workspace、workspace-feedback、status、service-dev、service-version、login、maintenance-state、connect、workspace、earliest、transcript、output、latest、message-queue、task-runs、compaction-progress、add-context、add-image、image-files、context-chips、task-timer、task-timer-value、context-menu、context-picker、context-back、context-title、context-close、context-search、context-results、context-error、image-attachments、composer、prompt、prompt-completion、composer-skill、provider、model、thinking、stop、send-steer、send-followup、send、session-runtime、mobile-runtime、mobile-expand、composer-help、error、session-action、session-action-form、session-action-title、session-action-description、session-name-label、session-name、session-action-error、session-action-cancel、session-action-submit、image-preview、image-preview-close、image-preview-image、restart-dialog、restart-form、restart-title、restart-description、restart-warning、restart-cancel、restart-submit、task-overlays、task-template、settings、settings-title、settings-defaults-tab、settings-remote-tab、settings-models-tab、settings-service-tab、defaults-panel、selection-copy-title、selection-copy、selection-copy-help、selection-copy-feedback、queue-type、steer-help、followup-help、defaults-preview、task-budget-title、task-max-turns、task-wrap-up-window、task-budget-help、subagent-title、subagent-help、subagent-provider、subagent-model、settings-feedback、defaults-title、defaults-editor、remote-panel、remote-status-title、remote-status、remote-login、remote-auth、remote-url、remote-form、remote-note、remote-enabled、remote-email、remote-email-help、remote-feedback、remote-refresh、remote-save、models-panel、service-panel、service-state-title、service-feedback、service-restart-title、restart-quick、restart-rebuild、service-recover、service-update-section、service-update-title、update-check、update-result、update-install、service-history-title、service-history、create-session、create-title、create-form、preset-fields、preset-name、preset-fixed-cwd、preset-directory、preset-delete、create-workspace、create-defaults-help、create-agents、create-compaction、create-retry、create-trust-row、create-trust、create-feedback、create-submit（public/index.html）
- HTTP 静态路由：/、/favicon.svg、/style.css、/app.js、/service-settings.js、/file-picker.js、/tooltip.js、/tooltip.css、/text-contrast.js、/text-contrast.css、/file-picker.css、/markdown.js、/stream-renderer.js、/memory-tags.js、/vendor/marked.js、/vendor/purify.js、/model-manager.js、/model-manager.css、/model-picker.js、/model-picker.css、/health（src/server.js）

## ⚠ 未登记文件（0）

（无）
