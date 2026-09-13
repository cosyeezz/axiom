<!-- 自动生成，勿手改。重建：node .pi/skills/codebase-map/scripts/reindex.mjs -->
# Axiom 多级代码索引（生成于 2026/9/13 03:48:42）

## L1 模块总览（文件 → 职责）

| 文件 | 行数 | 职责 | 关键符号 |
|---|---|---|---|
| public/app.js | 3283 | 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度 | filePicker, $, ws, sessionMissing |
| public/file-picker.css | 274 | 文件选择弹窗主题与响应式布局 | - |
| public/file-picker.js | 355 | 共享文件/目录选择弹窗、懒加载与分类 SVG 图标 | NS, SEARCH_DEBOUNCE, el, FOLDER_COLORS |
| public/index.html | 329 | 页面骨架与元素 id（见 L3） | - |
| public/markdown.js | 247 | marked + DOMPurify 渲染（XSS 边界） | cache, policy, textLanguages, isText |
| public/memory-tags.js | 92 | 主子代理共享简单标签提取与流式显示过滤 | TAGS, NAMES, TAG, OPEN |
| public/model-manager.css | 471 | 模型配置页：供应商列表、编辑表单与响应式布局 | - |
| public/model-manager.js | 1130 | Pi 模型管理：供应商模板、模型编辑与安全保存反馈 | API_TYPES, PROVIDER_TEMPLATES, PROVIDER_ID, MASK_KINDS |
| public/model-picker.css | 88 | 共享收藏下拉：暗色浮层、星标、触屏与焦点样式 | - |
| public/model-picker.js | 300 | 共享模型选择器：供应商/模型/思考收藏、排序与键盘交互 | GAP, EDGE, TYPEAHEAD_MS, el |
| public/service-settings.js | 278 | 设置页服务维护：真实进度、结果、更新确认与独立维护通道 | MAINT_URL_RE, POLL_MS, initServiceSettings |
| public/stream-renderer.js | 46 | 流式增量渲染状态机 | createStreamRenderer |
| public/style.css | 1374 | 全局样式（CSP 禁 inline style，样式一律进这里） | - |
| public/text-contrast.css | 46 | 文字专用对比度档位与调节面板 | - |
| public/text-contrast.js | 113 | 文字对比度按钮、实时调节与本地偏好 | KEY, MIN, MAX, STEP |
| public/tooltip.css | 50 | 共享暗色悬停说明样式 | - |
| public/tooltip.js | 225 | 共享悬停说明：动态 title、键盘、定位与无障碍 | SHOW_DELAY, HIDE_DELAY, GAP, EDGE |
| scripts/autostart.mjs | 133 | Windows/macOS/Linux 当前用户登录自动启动安装/卸载 | run, projectDir, serviceEntry, label |
| scripts/dev.mjs | 12 | 开发入口：DEV 标识、4320 端口与独立数据目录 | - |
| scripts/install.mjs | 95 | 一键安装：装依赖/注册自启/启动守护/健康检查/打开浏览器 | root, parseArgs, openCommand, ensurePi |
| scripts/maint-server.mjs | 86 | loopback维护HTTP：来源校验、随机凭证、状态与离线恢复 | MAX_BODY, hash, json, startMaintServer |
| scripts/maint-state.mjs | 105 | 守护维护状态：持久化阶段、最近结果与有界脱敏证据 | NAMESPACE, LOG_LIMIT, sanitize, createMaintState |
| scripts/service.mjs | 520 | 服务守护：IPC 重启、HTTP 安全停止与崩溃退避停止通道 | root, output, run, npmRun |
| scripts/uninstall.mjs | 18 | 统一卸载：核对 npm 目标、安全停止、取消自启、保留用户数据 | uninstall |
| src/capabilities.js | 139 | 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities） | sdkEntry, resolver, alias, jiti |
| src/compaction.js | 390 | 后台独立摘要、token/占比阈值、快照校验与 turn 安全提交 | contextTokens, prepareBackgroundCompaction, DEFAULT_COMPACTION_CONFIG, normalizeCompaction |
| src/database.js | 66 | 共享 SQLite 存储、WAL 与迁移标记 | nodeOk, Database |
| src/inline-images.js | 32 | 模型上下文图片定位：将占位符与真实附件交错排列，不改存储与队列 | inlineImages, inlineImagesExtension |
| src/main.js | 114 | 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理 | port, cwd, home, database |
| src/memory-policy.js | 39 | 主子代理摘要规则与配置页参数校验 | SUMMARY_SYSTEM_PROMPT, SUMMARY_REMINDER, SUMMARY_DELEGATE, MEMORY_SUMMARY_LIMITS |
| src/model-config.js | 500 | Pi models.json 无损配置读写与共享收藏持久化 | sdkModelConfig, sdkResolveConfigValue, digest, LEVELS |
| src/pi-model-storage.js | 230 | 模型与凭据 SQLite 权威存储、Pi 派生兼容文件 | sdkResolveConfigValue, sdkIsCommandConfigValue, NAMESPACE, AUTH_NAMESPACE |
| src/pi.js | 357 | createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档） | agentRuntime, queueStateOf, hasModelOutput, withdrawQueue |
| src/protocol.js | 335 | zod 协议：selection / command 判别联合（消息类型见 L3） | id, capabilities, workspace, thinking |
| src/remote.js | 536 | Tailscale 登录身份、远程监听、同账号授权与本机配置持久化 | configSchema, execOptions, cliEnv, defaultRun |
| src/retry.js | 161 | 模型失败重试：可取消退避、最多45次、16分钟封顶、自定义错误词表、保留已有工具结果继续 | RETRY_DELAYS_MS, MAX_DELAY_MS, MAX_RETRIES, delayFor |
| src/server.js | 458 | createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发 | assets, createServerApp |
| src/session-memory.js | 94 | 标题与增量摘要登记、触发复盘、委派背景与被动进度 | textOf, escape, memoryHooks, parentSummaryContext |
| src/sessions.js | 1155 | Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化 | BROWSE_PAGE, SEARCH_LIMIT, SEARCH_DIR_LIMIT, IGNORED_ENTRIES |
| src/tasks.js | 112 | Tasks：子任务（委托）生命周期 | Tasks |
| src/tools.js | 97 | delegationTools：委托/凭证读取/追加工具定义（zod 入参） | delegateInput, readInput, appendInput, result |
| src/update.js | 41 | 检查更新：本地安装（提交 SHA/版本）比对 GitHub 公开仓库 master，npm 安装实例可自动重装 | repo, npmSpec, commitFile, validateCommit |
| tests/activity-groups-ui.py | 201 | node --test 测试（npm test） | activityHistory, sessions |
| tests/app.test.js | 1675 | node --test 测试（npm test） | pickerSource, contrastSource, modelSources, serviceSource |
| tests/autoscroll-ui.py | 99 | node --test 测试（npm test） | - |
| tests/autostart.test.js | 71 | node --test 测试（npm test） | node, cwd, service |
| tests/benchmark.js | 92 | node --test 测试（npm test） | window |
| tests/capabilities.test.js | 207 | node --test 测试（npm test） | - |
| tests/cli-help.test.js | 23 | node --test 测试（npm test） | - |
| tests/codebase-index.test.js | 20 | node --test 测试（npm test） | ROOT, SKILL |
| tests/compaction-config.test.js | 107 | node --test 测试（npm test） | - |
| tests/compaction-ui.py | 57 | node --test 测试（npm test） | - |
| tests/compaction-ui.test.js | 126 | node --test 测试（npm test） | page |
| tests/compaction.test.js | 802 | node --test 测试（npm test） | fakeModel, createTestSession, seq, userMsg |
| tests/config.test.js | 225 | node --test 测试（npm test） | - |
| tests/context-menu-ui.py | 66 | node --test 测试（npm test） | - |
| tests/conversation-preview.mjs | 123 | node --test 测试（npm test） | markdown, message, thinking, state |
| tests/conversation-ui.py | 262 | node --test 测试（npm test） | - |
| tests/database.test.js | 76 | node --test 测试（npm test） | - |
| tests/defaults.test.js | 37 | node --test 测试（npm test） | - |
| tests/file-picker.test.js | 67 | node --test 测试（npm test） | source, tick |
| tests/image-input.test.js | 169 | node --test 测试（npm test） | pngBase64, jpegBase64, image, parsePrompt |
| tests/inline-images.test.js | 42 | node --test 测试（npm test） | text, a, b, user |
| tests/install.test.js | 79 | node --test 测试（npm test） | - |
| tests/markdown.test.js | 166 | node --test 测试（npm test） | - |
| tests/memory-policy.test.js | 58 | node --test 测试（npm test） | - |
| tests/memory-preview.mjs | 24 | node --test 测试（npm test） | state, sessions, app |
| tests/memory-tags.test.js | 74 | node --test 测试（npm test） | - |
| tests/memory-ui.test.js | 183 | node --test 测试（npm test） | page, record |
| tests/message-activity.test.js | 407 | node --test 测试（npm test） | page, assistant, thought, call |
| tests/mobile-reading-ui.py | 103 | node --test 测试（npm test） | - |
| tests/model-config.test.js | 785 | node --test 测试（npm test） | sha, EMPTY, tempDir, openDatabases |
| tests/model-manager.test.js | 984 | node --test 测试（npm test） | source, tick, j, masked |
| tests/model-onboarding-ui.test.js | 154 | node --test 测试（npm test） | stripImports, modelSources, contrastSource, pickerSource |
| tests/model-onboarding.test.js | 55 | node --test 测试（npm test） | - |
| tests/model-picker.test.js | 311 | node --test 测试（npm test） | source, tick, nap, OPTS |
| tests/model-selection-preview.mjs | 52 | node --test 测试（npm test） | home, catalog, factory, sessions |
| tests/model-selection-ui.py | 60 | node --test 测试（npm test） | - |
| tests/model-settings-ui.py | 44 | node --test 测试（npm test） | - |
| tests/model-thinking-favorites.test.js | 122 | node --test 测试（npm test） | appSource, pickerSource, contrastSource, modelSources |
| tests/pi-memory.test.js | 240 | node --test 测试（npm test） | - |
| tests/pi-model-storage.test.js | 228 | node --test 测试（npm test） | tempDir, makeStorage, seedPiModels, seedPiAuth |
| tests/presets.test.js | 112 | node --test 测试（npm test） | makeFactory |
| tests/project-skills.test.js | 59 | node --test 测试（npm test） | - |
| tests/recall.test.js | 146 | node --test 测试（npm test） | user, assistant, thinking, fixture |
| tests/remote-ui.py | 51 | node --test 测试（npm test） | - |
| tests/remote-ui.test.js | 225 | node --test 测试（npm test） | page, modelSources, flush, stubRequest |
| tests/remote.test.js | 682 | node --test 测试（npm test） | EMAIL, mockTailscale, fakeChild, fakeDatabase |
| tests/retry.test.js | 369 | node --test 测试（npm test） | RATE_LIMIT, QUOTA, ABORTED, fakeSession |
| tests/server.test.js | 125 | node --test 测试（npm test） | - |
| tests/service-api.test.js | 76 | node --test 测试（npm test） | - |
| tests/service-settings-api.test.js | 71 | node --test 测试（npm test） | - |
| tests/service-settings-ui.py | 60 | node --test 测试（npm test） | - |
| tests/service-settings.test.js | 317 | node --test 测试（npm test） | source, html, setup |
| tests/service.test.js | 525 | node --test 测试（npm test） | until, readMaybe, killTree, buildWorkspace |
| tests/session-created-at.test.js | 44 | node --test 测试（npm test） | factory |
| tests/session-flow.test.js | 381 | node --test 测试（npm test） | flowFactory, jsonlFactory |
| tests/session-memory.test.js | 189 | node --test 测试（npm test） | reply |
| tests/session-migration.test.js | 219 | node --test 测试（npm test） | factory, workspaceHash |
| tests/session-persistence.test.js | 104 | node --test 测试（npm test） | factory |
| tests/session-sidebar-ui.py | 104 | node --test 测试（npm test） | - |
| tests/smoke.js | 67 | node --test 测试（npm test） | TIMEOUT, sessions |
| tests/stream-renderer.test.js | 99 | node --test 测试（npm test） | - |
| tests/summary-compact.test.js | 21 | node --test 测试（npm test） | - |
| tests/task-notifications.test.js | 165 | node --test 测试（npm test） | factoryFixture, tick, until |
| tests/task-timer.test.js | 55 | node --test 测试（npm test） | factory, state, settle |
| tests/tasks.test.js | 96 | node --test 测试（npm test） | fixture |
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
| memorySummaryDefaults | const | 31 |
| thinkingLevels | const | 32 |
| modelFavorites | const | 33 |
| favoriteKey | function | 36 |
| modelPicker | const | 41 |
| modelManager | const | 55 |
| serviceUi | const | 56 |
| compactions | const | 57 |
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
| pending | const | 209 |
| requestSeq | const | 214 |
| error | function | 215 |
| request | function | 218 |
| controls | function | 227 |
| renderContextChips | method | 252 |
| options | function | 266 |
| providerEntries | const | 275 |
| modelEntries | const | 276 |
| refreshModelCatalog | function | 278 |
| fillModels | function | 306 |
| options | method | 307 |
| fillSubagentModels | function | 313 |
| options | method | 315 |
| capabilityName | function | 323 |
| runtimeSummary | function | 333 |
| renderRuntime | function | 346 |
| updateTaskRuntime | function | 362 |
| renderRuntime | method | 364 |
| applyConfig | function | 367 |
| options | method | 369 |
| renderRuntime | method | 375 |
| options | method | 376 |
| fillSubagentModels | method | 381 |
| fillModels | method | 383 |
| options | method | 384 |
| configure | function | 390 |
| controls | method | 393 |
| memorySummaryInputs | const | 416 |
| loadMemorySummary | function | 417 |
| saveMemorySummary | function | 427 |
| showSettingsPanel | function | 442 |
| showSettingsPanel | method | 458 |
| showSettingsPanel | method | 462 |
| controls | method | 463 |
| remoteView | const | 475 |
| remoteLoaded | const | 476 |
| remoteAnchor | function | 477 |
| remoteRender | function | 485 |
| controls | method | 531 |
| remoteLoad | function | 533 |
| remoteAuthUrl | function | 549 |
| remoteLogin | function | 557 |
| remoteOnReconnect | function | 583 |
| controls | method | 597 |
| messageItems | const | 610 |
| activityPaths | const | 612 |
| setActivityIcon | function | 629 |
| callGroupsFrame | const | 639 |
| scheduleCallGroups | function | 640 |
| createCallGroup | function | 649 |
| paintCallGroup | function | 663 |
| refreshCallGroups | function | 692 |
| foldCallsBeforeMessage | function | 792 |
| paintCallGroup | method | 796 |
| disclosureHint | function | 798 |
| activityLine | function | 818 |
| setActivity | method | 828 |
| setActivity | function | 831 |
| scheduleCallGroups | method | 832 |
| setActivityIcon | method | 834 |
| waiting | function | 845 |
| scheduleCallGroups | method | 847 |
| scrollLatest | method | 853 |
| clearWaiting | function | 855 |
| stopActivity | function | 859 |
| scheduleCallGroups | method | 861 |
| clearWaiting | method | 862 |
| updateActivity | function | 871 |
| setActivity | method | 884 |
| setActivity | method | 885 |
| mergeThoughts | function | 889 |
| diffView | const | 907 |
| renderToolDetail | function | 912 |
| section | method | 998 |
| toolState | function | 1000 |
| clearWaiting | method | 1002 |
| setActivity | method | 1046 |
| renderToolDetail | method | 1047 |
| scrollLatest | method | 1048 |
| card | function | 1050 |
| renderMessage | function | 1101 |
| updateActivity | method | 1196 |
| renderCompactionStatus | function | 1199 |
| trackTaskEntries | function | 1216 |
| placeCompactedTasks | function | 1227 |
| placeCompactedRetries | method | 1228 |
| compactionCard | function | 1237 |
| renderMarkdown | method | 1257 |
| foldCompaction | function | 1260 |
| placeCompactedTasks | method | 1280 |
| mergeThoughts | method | 1281 |
| compactionEditor | function | 1288 |
| options | method | 1326 |
| fillThinking | method | 1356 |
| retryChipList | function | 1365 |
| retryEditor | function | 1414 |
| renderTaskRuns | function | 1434 |
| renderQueue | function | 1462 |
| retryCards | const | 1479 |
| placeCompactedRetries | function | 1480 |
| retryArchive | function | 1497 |
| renderRetry | function | 1510 |
| placeCompactedRetries | method | 1546 |
| scrollLatest | method | 1547 |
| event | function | 1549 |
| snapshot | function | 1725 |
| clearTimeout | method | 1728 |
| updatePageTitle | method | 1746 |
| renderTaskRuns | method | 1754 |
| renderCompactionStatus | method | 1761 |
| restoreRetries | method | 1822 |
| mergeThoughts | method | 1836 |
| placeCompactedTasks | method | 1850 |
| renderImages | method | 1864 |
| closeCompletion | method | 1867 |
| renderQueue | method | 1878 |
| applyConfig | method | 1880 |
| controls | method | 1882 |
| reconnectTimer | const | 1884 |
| clearTimeout | method | 1888 |
| controls | method | 1891 |
| scheduleReconnect | function | 2003 |
| clearTimeout | method | 2004 |
| importDir | const | 2008 |
| fillModels | method | 2012 |
| fillSubagentModels | method | 2019 |
| closeCompletion | method | 2036 |
| controls | method | 2041 |
| scrollLatest | method | 2046 |
| enableImagePreview | function | 2078 |
| renderImages | function | 2099 |
| addImages | function | 2124 |
| loadImages | function | 2145 |
| renderImages | method | 2154 |
| selectionCopy | const | 2177 |
| copySelection | function | 2189 |
| escapeTimer | const | 2252 |
| withdrawQueue | function | 2253 |
| refreshing | const | 2335 |
| refreshSessions | function | 2336 |
| timerText | function | 2352 |
| renderTaskTimer | function | 2359 |
| applyElapsed | function | 2372 |
| renderTaskTimer | method | 2378 |
| updatePageTitle | function | 2380 |
| updateSessions | function | 2384 |
| renderTaskTimer | method | 2386 |
| updatePageTitle | method | 2397 |
| renderSessions | method | 2398 |
| recoverMissingSession | function | 2400 |
| controls | method | 2402 |
| saveView | method | 2409 |
| controls | method | 2413 |
| switchSession | function | 2429 |
| saveView | method | 2431 |
| controls | method | 2434 |
| copySessionFile | function | 2460 |
| positionSessionMenu | function | 2473 |
| renderSessions | function | 2479 |
| sessionAction | const | 2631 |
| renderSummaries | function | 2633 |
| renderSummaries | method | 2659 |
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

### public/memory-tags.js（92 行） — 主子代理共享简单标签提取与流式显示过滤

| 符号 | 类型 | 行 |
|---|---|---|
| TAGS | const | 6 |
| NAMES | const | 7 |
| TAG | const | 9 |
| OPEN | const | 10 |
| CLOSE | const | 11 |
| MARKS | const | 12 |
| FENCE | const | 13 |
| HOLE | const | 15 |
| segments | function | 18 |
| extractMemoryTags | function | 33 |
| stripMemoryTags | function | 51 |

### public/model-manager.js（1130 行） — Pi 模型管理：供应商模板、模型编辑与安全保存反馈

| 符号 | 类型 | 行 |
|---|---|---|
| API_TYPES | const | 18 |
| PROVIDER_TEMPLATES | const | 26 |
| PROVIDER_ID | const | 57 |
| MASK_KINDS | const | 58 |
| DRAFT | const | 60 |
| MANAGED_PROVIDER_KEYS | const | 63 |
| MANAGED_MODEL_KEYS | const | 64 |
| isMask | const | 66 |
| hasOwn | const | 67 |
| clone | const | 68 |
| keepMasked | function | 70 |
| stable | function | 78 |
| el | function | 86 |
| fieldSeq | const | 102 |
| field | function | 104 |
| badge | function | 113 |
| parseJsonText | function | 117 |
| SVG_NS | const | 129 |
| ICONS | const | 131 |
| icon | function | 137 |
| openModal | function | 149 |
| closeModal | function | 153 |
| openDialog | function | 162 |
| openModal | method | 180 |
| initModelManager | function | 185 |
| renderProviders | method | 1127 |

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

### scripts/maint-state.mjs（105 行） — 守护维护状态：持久化阶段、最近结果与有界脱敏证据

| 符号 | 类型 | 行 |
|---|---|---|
| NAMESPACE | const | 8 |
| LOG_LIMIT | const | 9 |
| sanitize | function | 12 |
| createMaintState | function | 21 |
| persist | method | 68 |

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

### src/database.js（66 行） — 共享 SQLite 存储、WAL 与迁移标记

| 符号 | 类型 | 行 |
|---|---|---|
| nodeOk | const | 5 |
| Database | class | 19 |
| constructor | method | 22 |
| get | method | 39 |
| set | method | 44 |
| list | method | 57 |
| close | method | 62 |

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

### src/memory-policy.js（39 行） — 主子代理摘要规则与配置页参数校验

| 符号 | 类型 | 行 |
|---|---|---|
| SUMMARY_SYSTEM_PROMPT | const | 4 |
| SUMMARY_REMINDER | const | 7 |
| SUMMARY_DELEGATE | const | 10 |
| MEMORY_SUMMARY_LIMITS | const | 13 |
| memorySummaryDefaults | const | 16 |
| within | const | 18 |
| memoryPolicy | function | 24 |

### src/model-config.js（500 行） — Pi models.json 无损配置读写与共享收藏持久化

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
| createModelsService | function | 257 |

### src/pi-model-storage.js（230 行） — 模型与凭据 SQLite 权威存储、Pi 派生兼容文件

| 符号 | 类型 | 行 |
|---|---|---|
| sdkResolveConfigValue | const | 9 |
| sdkIsCommandConfigValue | const | 10 |
| NAMESPACE | const | 24 |
| AUTH_NAMESPACE | const | 25 |
| MIGRATED_NAMESPACE | const | 26 |
| CONFIG_KEY | const | 27 |
| FAVORITES_KEY | const | 28 |
| IMPORT_ERROR_KEY | const | 29 |
| canonicalModelsJson | function | 32 |
| isPlainObject | const | 36 |
| isCredential | const | 38 |
| isPlainObject | method | 39 |
| createPiModelStorage | function | 47 |

### src/pi.js（357 行） — createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档）

| 符号 | 类型 | 行 |
|---|---|---|
| agentRuntime | function | 14 |
| queueStateOf | function | 30 |
| hasModelOutput | function | 49 |
| withdrawQueue | function | 59 |
| recallLastMessage | function | 69 |
| TITLE_INSTRUCTION | const | 92 |
| memoryExtension | function | 102 |
| createPiFactory | function | 130 |

### src/protocol.js（335 行） — zod 协议：selection / command 判别联合（消息类型见 L3）

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
| memorySummary | const | 77 |
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
| fingerprintIn | const | 167 |
| command | const | 168 |

### src/remote.js（536 行） — Tailscale 登录身份、远程监听、同账号授权与本机配置持久化

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

### src/retry.js（161 行） — 模型失败重试：可取消退避、最多45次、16分钟封顶、自定义错误词表、保留已有工具结果继续

| 符号 | 类型 | 行 |
|---|---|---|
| RETRY_DELAYS_MS | const | 5 |
| MAX_DELAY_MS | const | 6 |
| MAX_RETRIES | const | 7 |
| delayFor | const | 8 |
| MAX_TIMEOUT_MS | const | 14 |
| abortableSleep | const | 15 |
| classify | class | 51 |
| createAutoRetry | function | 84 |

### src/server.js（458 行） — createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发

| 符号 | 类型 | 行 |
|---|---|---|
| assets | const | 7 |
| createServerApp | function | 45 |

### src/session-memory.js（94 行） — 标题与增量摘要登记、触发复盘、委派背景与被动进度

| 符号 | 类型 | 行 |
|---|---|---|
| textOf | const | 5 |
| escape | const | 6 |
| memoryHooks | function | 11 |
| parentSummaryContext | function | 90 |

### src/sessions.js（1155 行） — Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化

| 符号 | 类型 | 行 |
|---|---|---|
| BROWSE_PAGE | const | 17 |
| SEARCH_LIMIT | const | 19 |
| SEARCH_DIR_LIMIT | const | 20 |
| IGNORED_ENTRIES | const | 22 |
| fuzzyHit | function | 25 |
| matchRank | function | 36 |
| searchEntries | function | 45 |
| pointStatus | function | 73 |
| trackElapsed | function | 80 |
| resolveDir | function | 90 |
| parentOf | function | 101 |
| absoluteCrumbs | function | 110 |
| importedTitle | function | 132 |
| hostLocations | function | 154 |
| Sessions | class | 169 |
| constructor | method | 170 |
| applyDefaults | method | 191 |
| loadDefaults | method | 206 |
| migrateDefaults | method | 216 |
| migratePresets | method | 229 |
| loadMemorySummary | method | 244 |
| getMemorySummary | method | 255 |
| configureMemorySummary | method | 260 |
| getDefaults | method | 266 |
| workspaceDefaults | method | 269 |
| configureDefaults | method | 287 |
| saveDefaults | method | 292 |
| validateSelection | method | 331 |
| validateCompaction | method | 352 |
| listPresets | method | 367 |
| mutatePresets | method | 377 |
| savePreset | method | 390 |
| deletePreset | method | 405 |
| load | method | 414 |
| migrateLegacySessions | method | 443 |
| persist | method | 468 |
| list | method | 489 |
| rename | method | 506 |
| importSession | method | 517 |
| create | method | 544 |
| scheduleTaskNotifications | method | 813 |
| deliverTaskNotifications | method | 825 |
| get | method | 847 |
| revealWorkspace | method | 852 |
| browse | method | 866 |
| listFiles | method | 872 |
| refreshSkills | method | 934 |
| snapshot | method | 940 |
| subscribe | method | 969 |
| configure | method | 975 |
| prompt | method | 1009 |
| withdraw | method | 1063 |
| cancel | method | 1107 |
| remove | method | 1125 |
| close | method | 1145 |

### src/tasks.js（112 行） — Tasks：子任务（委托）生命周期

| 符号 | 类型 | 行 |
|---|---|---|
| Tasks | class | 4 |
| constructor | method | 5 |
| start | method | 13 |
| publish | method | 24 |
| view | method | 27 |
| snapshot | method | 30 |
| run | method | 36 |
| read | method | 81 |
| append | method | 88 |
| cancel | method | 98 |

### src/tools.js（97 行） — delegationTools：委托/凭证读取/追加工具定义（zod 入参）

| 符号 | 类型 | 行 |
|---|---|---|
| delegateInput | const | 3 |
| readInput | const | 10 |
| appendInput | const | 13 |
| result | const | 20 |
| delegationTools | function | 24 |

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

### tests/memory-preview.mjs（24 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| state | const | 3 |
| sessions | const | 14 |
| app | const | 21 |

### tests/memory-ui.test.js（183 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 34 |
| restore | method | 64 |
| record | const | 68 |

### tests/message-activity.test.js（407 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 10 |
| restore | method | 40 |
| assistant | const | 44 |
| thought | const | 45 |
| call | const | 46 |
| entry | const | 47 |

### tests/model-config.test.js（785 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| sha | const | 18 |
| EMPTY | const | 20 |
| tempDir | function | 22 |
| openDatabases | const | 27 |
| closeOpenDatabases | const | 28 |
| makeService | function | 32 |
| seed | const | 50 |
| compat | const | 54 |
| discoverKey | const | 543 |
| mockFetch | const | 544 |
| jsonResponse | const | 553 |

### tests/model-manager.test.js（984 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| source | const | 7 |
| tick | const | 8 |
| j | const | 10 |
| masked | const | 12 |
| harness | function | 14 |
| setInput_on | method | 201 |
| setInput_on | function | 229 |
| modelDelete | method | 292 |
| dialogButton | method | 296 |
| modelDelete | method | 302 |
| dialogButton | method | 304 |
| dialogButton | method | 322 |
| confirm | method | 355 |
| confirm | method | 362 |
| row | method | 466 |
| row | method | 477 |
| discoverPanelEl | const | 746 |
| discoverRows | const | 747 |
| rowBox | const | 748 |
| addSelectedButton | const | 749 |
| fetchButton | const | 750 |
| checkRow | const | 751 |
| rowBox | method | 752 |
| rowBox | method | 753 |
| fetchButton | method | 763 |
| checkRow | method | 784 |
| fetchButton | method | 796 |
| checkRow | method | 808 |
| checkRow | method | 809 |
| addSelectedButton | method | 810 |
| fetchButton | method | 844 |
| addSelectedButton | method | 851 |
| addSelectedButton | method | 870 |
| fetchButton | method | 892 |
| fetchButton | method | 900 |
| fetchButton | method | 923 |
| fetchButton | method | 942 |
| fetchButton | method | 945 |
| fetchButton | method | 962 |
| fetchButton | method | 968 |

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

### tests/pi-model-storage.test.js（228 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| tempDir | function | 11 |
| makeStorage | function | 16 |
| seedPiModels | const | 21 |
| seedPiAuth | const | 25 |

### tests/presets.test.js（112 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| makeFactory | const | 10 |

### tests/recall.test.js（146 行） — node --test 测试（npm test）

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

### tests/remote.test.js（682 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| EMAIL | const | 21 |
| mockTailscale | const | 23 |
| fakeChild | const | 76 |
| fakeDatabase | const | 93 |
| setup | const | 111 |
| wsRequest | const | 152 |
| setTimeout | method | 508 |

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

### tests/service-settings.test.js（317 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| source | const | 11 |
| html | const | 12 |
| setup | function | 14 |

### tests/service.test.js（525 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| until | const | 15 |
| readMaybe | const | 24 |
| killTree | const | 25 |
| buildWorkspace | const | 32 |
| WORKER | const | 47 |
| fs | const | 48 |
| ready | const | 65 |
| ready | method | 73 |
| ready | method | 76 |
| startDaemon | const | 80 |
| spawn | method | 81 |
| startTest | const | 86 |
| maintEnv | const | 95 |
| getStatus | const | 96 |
| stateOf | const | 102 |
| teardown | const | 109 |
| NPM_FAKE | const | 116 |
| say | const | 120 |
| sdkStub | const | 121 |
| mkdirSync | method | 122 |
| writeFileSync | method | 123 |
| writeFileSync | method | 124 |
| rmSync | method | 132 |
| sdkStub | method | 134 |
| writeFileSync | method | 135 |
| writeFileSync | method | 136 |
| writeFileSync | method | 137 |
| rmSync | method | 145 |
| sdkStub | method | 146 |
| writeFileSync | method | 147 |
| installNpmShim | const | 153 |
| A40 | const | 166 |

### tests/session-created-at.test.js（44 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 8 |

### tests/session-flow.test.js（381 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| flowFactory | const | 90 |
| jsonlFactory | const | 100 |

### tests/session-memory.test.js（189 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| reply | const | 10 |

### tests/session-migration.test.js（219 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 10 |
| workspaceHash | const | 20 |

### tests/session-persistence.test.js（104 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 9 |

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

### tests/task-notifications.test.js（165 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factoryFixture | function | 9 |
| tick | const | 27 |
| until | function | 28 |

### tests/task-timer.test.js（55 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 9 |
| state | const | 19 |
| settle | const | 20 |

### tests/tasks.test.js（96 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| fixture | function | 7 |
| assert | method | 53 |
| release | method | 69 |

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

- 协议 command.type：image、inherit、radius、service.status、service.update.check、service.restart、remote.get、remote.login、remote.configure、session.rename、workspace.reveal、workspace.browse、files.browse、models.list、models.config.get、models.provider.save、models.provider.delete、models.provider.rename、models.model.save、models.model.delete、models.provider.discover、models.favorites.get、models.favorites.set、capabilities.list、session.defaults.get、session.defaults.configure、memory.summary.get、memory.summary.configure、session.presets.list、session.presets.save、session.presets.delete、session.configure、sessions.list、session.create、session.import、session.attach、session.skills.refresh、session.close、prompt、cancel、queue.withdraw、tasks.read（src/protocol.js）
- HTML id：sidebar、open-workspace、new、custom-new、preset-list、import-session、search、sessions、open-settings、sidebar-backdrop、toggle-sidebar、session-title、workspace-label、copy-workspace、reveal-workspace、workspace-feedback、open-summaries、status、service-dev、service-version、login、maintenance-state、connect、workspace、earliest、transcript、output、latest、message-queue、task-runs、compaction-progress、add-context、add-image、image-files、context-chips、task-timer、task-timer-value、context-menu、context-picker、context-back、context-title、context-close、context-search、context-results、context-error、image-attachments、composer、prompt、prompt-completion、composer-skill、provider、model、thinking、stop、send-steer、send-followup、send、session-runtime、mobile-runtime、mobile-expand、composer-help、error、session-action、session-action-form、session-action-title、session-action-description、session-name-label、session-name、session-action-error、session-action-cancel、session-action-submit、image-preview、image-preview-close、image-preview-image、restart-dialog、restart-form、restart-title、restart-description、restart-warning、restart-cancel、restart-submit、summaries、summaries-title、summaries-body、summaries-empty、summaries-list、task-overlays、task-template、settings、settings-title、settings-defaults-tab、settings-remote-tab、settings-models-tab、settings-service-tab、defaults-panel、selection-copy-title、selection-copy、selection-copy-help、selection-copy-feedback、queue-type、steer-help、followup-help、defaults-preview、memory-summary-title、memory-main-turns、memory-subagent-turns、memory-max-chars、memory-summary-help、subagent-title、subagent-help、subagent-provider、subagent-model、settings-feedback、defaults-title、defaults-editor、remote-panel、remote-status-title、remote-status、remote-login、remote-auth、remote-url、remote-form、remote-note、remote-enabled、remote-email、remote-email-help、remote-feedback、remote-refresh、remote-save、models-panel、service-panel、service-state-title、service-feedback、service-restart-title、restart-quick、restart-rebuild、service-recover、service-update-section、service-update-title、update-check、update-result、update-install、service-history-title、service-history、create-session、create-title、create-form、preset-fields、preset-name、preset-fixed-cwd、preset-directory、preset-delete、create-workspace、create-defaults-help、create-agents、create-compaction、create-retry、create-trust-row、create-trust、create-feedback、create-submit（public/index.html）
- HTTP 静态路由：/、/favicon.svg、/style.css、/app.js、/service-settings.js、/file-picker.js、/tooltip.js、/tooltip.css、/text-contrast.js、/text-contrast.css、/file-picker.css、/markdown.js、/stream-renderer.js、/memory-tags.js、/vendor/marked.js、/vendor/purify.js、/model-manager.js、/model-manager.css、/model-picker.js、/model-picker.css、/health（src/server.js）

## ⚠ 未登记文件（0）

（无）
