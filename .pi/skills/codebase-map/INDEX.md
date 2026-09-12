<!-- 自动生成，勿手改。重建：node .pi/skills/codebase-map/scripts/reindex.mjs -->
# Axiom 多级代码索引（生成于 2026/9/12 12:39:05）

## L1 模块总览（文件 → 职责）

| 文件 | 行数 | 职责 | 关键符号 |
|---|---|---|---|
| public/app.js | 3217 | 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度 | filePicker, $, ws, sessionMissing |
| public/file-picker.css | 274 | 文件选择弹窗主题与响应式布局 | - |
| public/file-picker.js | 355 | 共享文件/目录选择弹窗、懒加载与分类 SVG 图标 | NS, SEARCH_DEBOUNCE, el, FOLDER_COLORS |
| public/index.html | 320 | 页面骨架与元素 id（见 L3） | - |
| public/markdown.js | 247 | marked + DOMPurify 渲染（XSS 边界） | cache, policy, textLanguages, isText |
| public/memory-tags.js | 87 | 主子代理共享简单标签提取与流式显示过滤 | TAGS, NAMES, TAG, OPEN |
| public/model-manager.css | 279 | 模型配置页：供应商列表、编辑表单与响应式布局 | - |
| public/model-manager.js | 628 | Pi 模型管理：供应商模板、模型编辑与安全保存反馈 | API_TYPES, PROVIDER_TEMPLATES, PROVIDER_ID, MASK_KINDS |
| public/model-picker.css | 88 | 共享收藏下拉：暗色浮层、星标、触屏与焦点样式 | - |
| public/model-picker.js | 300 | 共享模型选择器：供应商/模型/思考收藏、排序与键盘交互 | GAP, EDGE, TYPEAHEAD_MS, el |
| public/service-settings.js | 278 | 设置页服务维护：真实进度、结果、更新确认与独立维护通道 | MAINT_URL_RE, POLL_MS, initServiceSettings |
| public/stream-renderer.js | 46 | 流式增量渲染状态机 | createStreamRenderer |
| public/style.css | 1332 | 全局样式（CSP 禁 inline style，样式一律进这里） | - |
| public/text-contrast.css | 46 | 文字专用对比度档位与调节面板 | - |
| public/text-contrast.js | 113 | 文字对比度按钮、实时调节与本地偏好 | KEY, MIN, MAX, STEP |
| public/tooltip.css | 50 | 共享暗色悬停说明样式 | - |
| public/tooltip.js | 225 | 共享悬停说明：动态 title、键盘、定位与无障碍 | SHOW_DELAY, HIDE_DELAY, GAP, EDGE |
| scripts/autostart.mjs | 133 | Windows/macOS/Linux 当前用户登录自动启动安装/卸载 | run, projectDir, serviceEntry, label |
| scripts/dev.mjs | 12 | 开发入口：DEV 标识、4320 端口与独立数据目录 | - |
| scripts/install.mjs | 101 | 一键安装：装依赖/注册自启/启动守护/健康检查/打开浏览器 | root, parseArgs, nodeOk, openCommand |
| scripts/maint-server.mjs | 86 | loopback维护HTTP：来源校验、随机凭证、状态与离线恢复 | MAX_BODY, hash, json, startMaintServer |
| scripts/maint-state.mjs | 98 | 守护维护状态：持久化阶段、最近结果与有界脱敏证据 | LOG_LIMIT, sanitize, createMaintState |
| scripts/service.mjs | 497 | 服务守护：IPC 重启、HTTP 安全停止与崩溃退避停止通道 | root, output, run, npmRun |
| scripts/uninstall.mjs | 18 | 统一卸载：核对 npm 目标、安全停止、取消自启、保留用户数据 | uninstall |
| src/capabilities.js | 139 | 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities） | sdkEntry, resolver, alias, jiti |
| src/compaction.js | 390 | 后台独立摘要、token/占比阈值、快照校验与 turn 安全提交 | contextTokens, prepareBackgroundCompaction, DEFAULT_COMPACTION_CONFIG, normalizeCompaction |
| src/inline-images.js | 32 | 模型上下文图片定位：将占位符与真实附件交错排列，不改存储与队列 | inlineImages, inlineImagesExtension |
| src/main.js | 97 | 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理 | port, cwd, factory, home |
| src/memory-policy.js | 29 | 主子代理摘要规则与环境配置校验 | SUMMARY_SYSTEM_PROMPT, SUMMARY_REMINDER, SUMMARY_DELEGATE, intEnv |
| src/model-config.js | 369 | Pi models.json 无损配置读写与共享收藏持久化 | sdkModelConfig, EMPTY_FINGERPRINT, digest, LEVELS |
| src/pi.js | 357 | createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档） | agentRuntime, queueStateOf, hasModelOutput, withdrawQueue |
| src/protocol.js | 314 | zod 协议：selection / command 判别联合（消息类型见 L3） | id, capabilities, workspace, thinking |
| src/remote.js | 501 | Tailscale 登录身份、远程监听、同账号授权与本机配置持久化 | configSchema, execOptions, cliEnv, defaultRun |
| src/retry.js | 161 | 模型失败重试：可取消退避、最多45次、16分钟封顶、自定义错误词表、保留已有工具结果继续 | RETRY_DELAYS_MS, MAX_DELAY_MS, MAX_RETRIES, delayFor |
| src/server.js | 451 | createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发 | assets, createServerApp |
| src/session-memory.js | 91 | 标题与增量摘要登记、触发复盘、委派背景与被动进度 | textOf, escape, memoryHooks, parentSummaryContext |
| src/sessions.js | 1058 | Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化 | BROWSE_PAGE, SEARCH_LIMIT, SEARCH_DIR_LIMIT, IGNORED_ENTRIES |
| src/tasks.js | 112 | Tasks：子任务（委托）生命周期 | Tasks |
| src/tools.js | 97 | delegationTools：委托/凭证读取/追加工具定义（zod 入参） | delegateInput, readInput, appendInput, result |
| src/update.js | 41 | 检查更新：本地安装（提交 SHA/版本）比对 GitHub 公开仓库 master，npm 安装实例可自动重装 | repo, npmSpec, commitFile, validateCommit |
| tests/activity-groups-ui.py | 201 | node --test 测试（npm test） | activityHistory, sessions |
| tests/app.test.js | 1636 | node --test 测试（npm test） | pickerSource, contrastSource, modelSources, serviceSource |
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
| tests/defaults.test.js | 33 | node --test 测试（npm test） | - |
| tests/file-picker.test.js | 67 | node --test 测试（npm test） | source, tick |
| tests/image-input.test.js | 167 | node --test 测试（npm test） | pngBase64, jpegBase64, image, parsePrompt |
| tests/inline-images.test.js | 42 | node --test 测试（npm test） | text, a, b, user |
| tests/install.test.js | 52 | node --test 测试（npm test） | - |
| tests/markdown.test.js | 166 | node --test 测试（npm test） | - |
| tests/memory-policy.test.js | 62 | node --test 测试（npm test） | withEnv |
| tests/memory-preview.mjs | 24 | node --test 测试（npm test） | state, sessions, app |
| tests/memory-tags.test.js | 58 | node --test 测试（npm test） | - |
| tests/memory-ui.test.js | 159 | node --test 测试（npm test） | page, record |
| tests/message-activity.test.js | 407 | node --test 测试（npm test） | page, assistant, thought, call |
| tests/mobile-reading-ui.py | 103 | node --test 测试（npm test） | - |
| tests/model-config.test.js | 463 | node --test 测试（npm test） | sha, EMPTY, tempDir, makeService |
| tests/model-manager.test.js | 430 | node --test 测试（npm test） | source, tick, j, masked |
| tests/model-onboarding-ui.test.js | 154 | node --test 测试（npm test） | stripImports, modelSources, contrastSource, pickerSource |
| tests/model-onboarding.test.js | 55 | node --test 测试（npm test） | - |
| tests/model-picker.test.js | 311 | node --test 测试（npm test） | source, tick, nap, OPTS |
| tests/model-selection-preview.mjs | 42 | node --test 测试（npm test） | home, catalog, factory, sessions |
| tests/model-selection-ui.py | 60 | node --test 测试（npm test） | - |
| tests/model-thinking-favorites.test.js | 122 | node --test 测试（npm test） | appSource, pickerSource, contrastSource, modelSources |
| tests/pi-memory.test.js | 244 | node --test 测试（npm test） | - |
| tests/presets.test.js | 102 | node --test 测试（npm test） | makeFactory |
| tests/project-skills.test.js | 57 | node --test 测试（npm test） | - |
| tests/recall.test.js | 142 | node --test 测试（npm test） | user, assistant, thinking, fixture |
| tests/remote-ui.py | 51 | node --test 测试（npm test） | - |
| tests/remote-ui.test.js | 225 | node --test 测试（npm test） | page, modelSources, flush, stubRequest |
| tests/remote.test.js | 598 | node --test 测试（npm test） | EMAIL, mockTailscale, fakeChild, setup |
| tests/retry.test.js | 369 | node --test 测试（npm test） | RATE_LIMIT, QUOTA, ABORTED, fakeSession |
| tests/server.test.js | 125 | node --test 测试（npm test） | - |
| tests/service-api.test.js | 76 | node --test 测试（npm test） | - |
| tests/service-settings-api.test.js | 71 | node --test 测试（npm test） | - |
| tests/service-settings-ui.py | 60 | node --test 测试（npm test） | - |
| tests/service-settings.test.js | 314 | node --test 测试（npm test） | source, html, setup |
| tests/service.test.js | 478 | node --test 测试（npm test） | until, readMaybe, killTree, buildWorkspace |
| tests/session-created-at.test.js | 44 | node --test 测试（npm test） | factory |
| tests/session-flow.test.js | 333 | node --test 测试（npm test） | flowFactory, jsonlFactory |
| tests/session-memory.test.js | 170 | node --test 测试（npm test） | reply |
| tests/session-sidebar-ui.py | 104 | node --test 测试（npm test） | - |
| tests/smoke.js | 67 | node --test 测试（npm test） | TIMEOUT, sessions |
| tests/stream-renderer.test.js | 99 | node --test 测试（npm test） | - |
| tests/task-notifications.test.js | 161 | node --test 测试（npm test） | factoryFixture, tick, until |
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

### public/app.js（3217 行） — 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度

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
| thinkingLevels | const | 30 |
| modelFavorites | const | 31 |
| favoriteKey | function | 34 |
| modelPicker | const | 39 |
| modelManager | const | 53 |
| serviceUi | const | 54 |
| compactions | const | 55 |
| compactionNodes | const | 56 |
| images | const | 57 |
| completionVersion | const | 58 |
| selectedSkill | const | 59 |
| hiddenSessions | const | 63 |
| readSessionPreference | function | 68 |
| changeSessionPreference | function | 72 |
| setSessionHidden | function | 86 |
| saveView | function | 101 |
| resizePrompt | function | 112 |
| scrollFrame | const | 118 |
| scrollLatest | function | 119 |
| scheduleCallGroups | method | 120 |
| renderer | const | 130 |
| scrollLatest | method | 152 |
| mobile | const | 154 |
| sidebar | function | 155 |
| sidebar | method | 165 |
| sidebar | method | 168 |
| resizePrompt | method | 169 |
| pending | const | 177 |
| requestSeq | const | 182 |
| error | function | 183 |
| request | function | 186 |
| controls | function | 195 |
| renderContextChips | method | 220 |
| options | function | 234 |
| providerEntries | const | 243 |
| modelEntries | const | 244 |
| refreshModelCatalog | function | 246 |
| fillModels | function | 274 |
| options | method | 275 |
| fillSubagentModels | function | 281 |
| options | method | 283 |
| capabilityName | function | 291 |
| runtimeSummary | function | 301 |
| renderRuntime | function | 314 |
| updateTaskRuntime | function | 330 |
| renderRuntime | method | 332 |
| applyConfig | function | 335 |
| options | method | 337 |
| renderRuntime | method | 343 |
| options | method | 344 |
| fillSubagentModels | method | 349 |
| fillModels | method | 351 |
| options | method | 352 |
| configure | function | 358 |
| controls | method | 361 |
| showSettingsPanel | function | 383 |
| showSettingsPanel | method | 399 |
| showSettingsPanel | method | 403 |
| controls | method | 404 |
| remoteView | const | 415 |
| remoteLoaded | const | 416 |
| remoteAnchor | function | 417 |
| remoteRender | function | 425 |
| controls | method | 471 |
| remoteLoad | function | 473 |
| remoteAuthUrl | function | 489 |
| remoteLogin | function | 497 |
| remoteOnReconnect | function | 523 |
| controls | method | 537 |
| messageItems | const | 550 |
| activityPaths | const | 552 |
| setActivityIcon | function | 569 |
| callGroupsFrame | const | 579 |
| scheduleCallGroups | function | 580 |
| createCallGroup | function | 589 |
| paintCallGroup | function | 603 |
| refreshCallGroups | function | 632 |
| foldCallsBeforeMessage | function | 732 |
| paintCallGroup | method | 736 |
| disclosureHint | function | 738 |
| activityLine | function | 758 |
| setActivity | method | 768 |
| setActivity | function | 771 |
| scheduleCallGroups | method | 772 |
| setActivityIcon | method | 774 |
| waiting | function | 785 |
| scheduleCallGroups | method | 787 |
| scrollLatest | method | 793 |
| clearWaiting | function | 795 |
| stopActivity | function | 799 |
| scheduleCallGroups | method | 801 |
| clearWaiting | method | 802 |
| updateActivity | function | 811 |
| setActivity | method | 824 |
| setActivity | method | 825 |
| mergeThoughts | function | 829 |
| diffView | const | 847 |
| renderToolDetail | function | 852 |
| section | method | 938 |
| toolState | function | 940 |
| clearWaiting | method | 942 |
| setActivity | method | 986 |
| renderToolDetail | method | 987 |
| scrollLatest | method | 988 |
| card | function | 990 |
| renderMessage | function | 1041 |
| updateActivity | method | 1136 |
| renderCompactionStatus | function | 1139 |
| trackTaskEntries | function | 1156 |
| placeCompactedTasks | function | 1167 |
| placeCompactedRetries | method | 1168 |
| compactionCard | function | 1177 |
| renderMarkdown | method | 1197 |
| foldCompaction | function | 1200 |
| placeCompactedTasks | method | 1220 |
| mergeThoughts | method | 1221 |
| compactionEditor | function | 1225 |
| options | method | 1263 |
| fillThinking | method | 1293 |
| retryChipList | function | 1302 |
| retryEditor | function | 1351 |
| renderTaskRuns | function | 1371 |
| renderQueue | function | 1399 |
| retryCards | const | 1416 |
| placeCompactedRetries | function | 1417 |
| retryArchive | function | 1434 |
| renderRetry | function | 1447 |
| placeCompactedRetries | method | 1483 |
| scrollLatest | method | 1484 |
| event | function | 1486 |
| snapshot | function | 1661 |
| clearTimeout | method | 1663 |
| updatePageTitle | method | 1681 |
| renderTaskRuns | method | 1688 |
| renderCompactionStatus | method | 1695 |
| restoreRetries | method | 1756 |
| mergeThoughts | method | 1770 |
| placeCompactedTasks | method | 1784 |
| renderImages | method | 1798 |
| closeCompletion | method | 1801 |
| renderQueue | method | 1812 |
| applyConfig | method | 1814 |
| controls | method | 1816 |
| reconnectTimer | const | 1818 |
| clearTimeout | method | 1822 |
| controls | method | 1825 |
| scheduleReconnect | function | 1937 |
| clearTimeout | method | 1938 |
| importDir | const | 1942 |
| fillModels | method | 1946 |
| fillSubagentModels | method | 1953 |
| closeCompletion | method | 1970 |
| controls | method | 1975 |
| scrollLatest | method | 1980 |
| enableImagePreview | function | 2012 |
| renderImages | function | 2033 |
| addImages | function | 2058 |
| loadImages | function | 2079 |
| renderImages | method | 2088 |
| selectionCopy | const | 2111 |
| copySelection | function | 2123 |
| escapeTimer | const | 2186 |
| withdrawQueue | function | 2187 |
| refreshing | const | 2269 |
| refreshSessions | function | 2270 |
| timerText | function | 2286 |
| renderTaskTimer | function | 2293 |
| applyElapsed | function | 2306 |
| renderTaskTimer | method | 2312 |
| updatePageTitle | function | 2314 |
| updateSessions | function | 2318 |
| renderTaskTimer | method | 2320 |
| updatePageTitle | method | 2331 |
| renderSessions | method | 2332 |
| recoverMissingSession | function | 2334 |
| controls | method | 2336 |
| saveView | method | 2343 |
| controls | method | 2347 |
| switchSession | function | 2363 |
| saveView | method | 2365 |
| controls | method | 2368 |
| copySessionFile | function | 2394 |
| positionSessionMenu | function | 2407 |
| renderSessions | function | 2413 |
| sessionAction | const | 2565 |
| renderSummaries | function | 2567 |
| renderSummaries | method | 2593 |
| openSessionAction | function | 2597 |
| contextIcon | function | 2638 |
| renderContextChips | function | 2641 |
| fuzzyHit | function | 2660 |
| renderContextResults | function | 2667 |
| showContextSkills | function | 2687 |
| positionContextSkills | function | 2692 |
| showContextSkills | method | 2704 |
| controls | method | 2739 |
| skillTrigger | const | 2741 |
| showContextSkills | method | 2757 |
| resizePrompt | method | 2766 |
| controls | method | 2767 |
| closeCompletion | function | 2770 |
| highlightCompletion | function | 2778 |
| chooseCompletion | function | 2787 |
| closeCompletion | method | 2797 |
| updateCompletion | function | 2800 |
| closeCompletion | method | 2801 |
| resizePrompt | method | 2857 |
| controls | method | 2858 |
| switchSession | method | 2898 |
| creationLoad | const | 2909 |
| refreshPresets | function | 2910 |
| createAgentPicker | function | 2945 |
| options | method | 2971 |
| fill | method | 2979 |
| fillThinking | method | 2987 |
| options | method | 2989 |
| loadCreation | function | 3036 |
| openCreation | function | 3072 |
| rememberCreation | const | 3093 |
| updateDefaultsPreview | function | 3125 |
| updateDefaultsPreview | method | 3149 |
| controls | method | 3204 |

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

### public/memory-tags.js（87 行） — 主子代理共享简单标签提取与流式显示过滤

| 符号 | 类型 | 行 |
|---|---|---|
| TAGS | const | 6 |
| NAMES | const | 7 |
| TAG | const | 9 |
| OPEN | const | 10 |
| MARKS | const | 11 |
| FENCE | const | 12 |
| codeFlags | function | 15 |
| extractMemoryTags | function | 27 |
| stripMemoryTags | function | 45 |

### public/model-manager.js（628 行） — Pi 模型管理：供应商模板、模型编辑与安全保存反馈

| 符号 | 类型 | 行 |
|---|---|---|
| API_TYPES | const | 9 |
| PROVIDER_TEMPLATES | const | 17 |
| PROVIDER_ID | const | 48 |
| MASK_KINDS | const | 49 |
| MANAGED_PROVIDER_KEYS | const | 52 |
| MANAGED_MODEL_KEYS | const | 53 |
| isMask | const | 55 |
| hasOwn | const | 56 |
| clone | const | 57 |
| keepMasked | function | 59 |
| stable | function | 67 |
| el | function | 75 |
| field | function | 91 |
| badge | function | 95 |
| parseJsonText | function | 98 |
| initModelManager | function | 105 |

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

### scripts/install.mjs（101 行） — 一键安装：装依赖/注册自启/启动守护/健康检查/打开浏览器

| 符号 | 类型 | 行 |
|---|---|---|
| root | const | 14 |
| parseArgs | const | 16 |
| nodeOk | const | 26 |
| openCommand | const | 31 |
| ensurePi | const | 37 |
| viaShell | const | 44 |
| probe | const | 50 |
| ask | const | 58 |
| install | function | 60 |
| invoked | const | 98 |

### scripts/maint-server.mjs（86 行） — loopback维护HTTP：来源校验、随机凭证、状态与离线恢复

| 符号 | 类型 | 行 |
|---|---|---|
| MAX_BODY | const | 7 |
| hash | const | 8 |
| json | const | 9 |
| allow | method | 10 |
| startMaintServer | function | 15 |

### scripts/maint-state.mjs（98 行） — 守护维护状态：持久化阶段、最近结果与有界脱敏证据

| 符号 | 类型 | 行 |
|---|---|---|
| LOG_LIMIT | const | 7 |
| sanitize | function | 10 |
| createMaintState | function | 18 |

### scripts/service.mjs（497 行） — 服务守护：IPC 重启、HTTP 安全停止与崩溃退避停止通道

| 符号 | 类型 | 行 |
|---|---|---|
| root | const | 15 |
| output | const | 16 |
| run | function | 17 |
| npmRun | const | 30 |
| installTag | function | 38 |
| controlPath | function | 41 |
| stagedSha | const | 47 |
| verifySdkImport | function | 57 |
| prepareUpdate | function | 66 |
| swapUpdate | function | 84 |
| commitUpdate | function | 114 |
| rollbackUpdate | function | 120 |
| update | function | 128 |
| prepareRebuild | function | 136 |
| swapRebuild | function | 146 |
| commitRebuild | function | 157 |
| rollbackRebuild | function | 161 |
| rebuild | function | 167 |
| READY_TIMEOUT_MS | const | 175 |
| supervise | function | 177 |
| mkdirSync | method | 186 |
| spawnWorker | method | 434 |
| invoked | const | 438 |
| stopService | function | 439 |

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

### src/inline-images.js（32 行） — 模型上下文图片定位：将占位符与真实附件交错排列，不改存储与队列

| 符号 | 类型 | 行 |
|---|---|---|
| inlineImages | function | 2 |
| inlineImagesExtension | function | 29 |

### src/main.js（97 行） — 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理

| 符号 | 类型 | 行 |
|---|---|---|
| port | const | 15 |
| cwd | const | 18 |
| factory | const | 21 |
| home | const | 22 |
| sessions | const | 29 |
| models | const | 31 |
| service | const | 34 |
| app | const | 67 |
| initRemote | method | 72 |
| initRemote | function | 74 |
| closing | const | 84 |
| stop | function | 85 |

### src/memory-policy.js（29 行） — 主子代理摘要规则与环境配置校验

| 符号 | 类型 | 行 |
|---|---|---|
| SUMMARY_SYSTEM_PROMPT | const | 3 |
| SUMMARY_REMINDER | const | 6 |
| SUMMARY_DELEGATE | const | 9 |
| intEnv | const | 11 |
| memoryPolicy | function | 20 |

### src/model-config.js（369 行） — Pi models.json 无损配置读写与共享收藏持久化

| 符号 | 类型 | 行 |
|---|---|---|
| sdkModelConfig | const | 11 |
| EMPTY_FINGERPRINT | const | 21 |
| digest | const | 22 |
| LEVELS | const | 23 |
| FAVORITE_GROUPS | const | 24 |
| FAVORITE_CAP | const | 25 |
| providerPattern | const | 26 |
| envPattern | const | 28 |
| kindOf | const | 30 |
| maskHeaders | const | 31 |
| maskModel | const | 40 |
| maskProvider | function | 45 |
| resolveSecret | function | 62 |
| checkBaseUrl | function | 74 |
| mergeHeaders | function | 84 |
| mergeProvider | function | 95 |
| applyModel | function | 119 |
| validFavoriteKey | function | 136 |
| readFavorites | function | 154 |
| createModelsService | function | 171 |

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

### src/protocol.js（314 行） — zod 协议：selection / command 判别联合（消息类型见 L3）

| 符号 | 类型 | 行 |
|---|---|---|
| id | const | 3 |
| capabilities | const | 4 |
| workspace | const | 7 |
| thinking | const | 8 |
| queueType | const | 9 |
| base64Pattern | const | 11 |
| decodedBytes | const | 12 |
| promptImage | const | 13 |
| promptImages | const | 24 |
| imageSignatures | const | 29 |
| assertPromptImages | function | 36 |
| compactionDefaults | const | 43 |
| compaction | const | 47 |
| retryPatterns | const | 57 |
| selection | const | 63 |
| preset | const | 75 |
| presetStore | const | 81 |
| providerKey | const | 83 |
| modelKey | const | 86 |
| secretValueIn | const | 93 |
| secretHeadersIn | const | 98 |
| thinkingLevelMapIn | const | 99 |
| costIn | const | 107 |
| providerConfigIn | const | 126 |
| modelConfigIn | const | 142 |
| fingerprintIn | const | 159 |
| command | const | 160 |

### src/remote.js（501 行） — Tailscale 登录身份、远程监听、同账号授权与本机配置持久化

| 符号 | 类型 | 行 |
|---|---|---|
| configSchema | const | 10 |
| execOptions | const | 14 |
| cliEnv | const | 16 |
| defaultRun | const | 17 |
| defaultCandidates | const | 24 |
| createTailscale | const | 38 |
| isTailnetIPv4 | const | 75 |
| selfStatus | function | 86 |
| whoisUser | function | 108 |
| describeError | const | 119 |
| defaultSpawnLogin | const | 129 |
| spawn | method | 130 |
| AUTH_URL | const | 131 |
| MAX_WHOIS | const | 134 |
| LOGIN_OUTPUT_CAP | const | 135 |
| createRemoteAccess | function | 137 |

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

### src/server.js（451 行） — createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发

| 符号 | 类型 | 行 |
|---|---|---|
| assets | const | 7 |
| createServerApp | function | 45 |

### src/session-memory.js（91 行） — 标题与增量摘要登记、触发复盘、委派背景与被动进度

| 符号 | 类型 | 行 |
|---|---|---|
| textOf | const | 5 |
| escape | const | 6 |
| memoryHooks | function | 9 |
| parentSummaryContext | function | 87 |

### src/sessions.js（1058 行） — Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化

| 符号 | 类型 | 行 |
|---|---|---|
| BROWSE_PAGE | const | 14 |
| SEARCH_LIMIT | const | 16 |
| SEARCH_DIR_LIMIT | const | 17 |
| IGNORED_ENTRIES | const | 19 |
| fuzzyHit | function | 22 |
| matchRank | function | 33 |
| searchEntries | function | 42 |
| pointStatus | function | 70 |
| trackElapsed | function | 77 |
| resolveDir | function | 87 |
| parentOf | function | 98 |
| absoluteCrumbs | function | 107 |
| importedTitle | function | 129 |
| hostLocations | function | 151 |
| Sessions | class | 166 |
| constructor | method | 167 |
| loadDefaults | method | 179 |
| getDefaults | method | 198 |
| workspaceDefaults | method | 201 |
| configureDefaults | method | 219 |
| saveDefaults | method | 224 |
| validateSelection | method | 272 |
| validateCompaction | method | 293 |
| listPresets | method | 311 |
| mutatePresets | method | 322 |
| savePreset | method | 343 |
| deletePreset | method | 358 |
| load | method | 367 |
| persist | method | 386 |
| list | method | 408 |
| rename | method | 425 |
| importSession | method | 436 |
| create | method | 463 |
| scheduleTaskNotifications | method | 727 |
| deliverTaskNotifications | method | 739 |
| get | method | 761 |
| revealWorkspace | method | 766 |
| browse | method | 780 |
| listFiles | method | 786 |
| refreshSkills | method | 848 |
| snapshot | method | 854 |
| subscribe | method | 883 |
| configure | method | 889 |
| prompt | method | 923 |
| withdraw | method | 977 |
| cancel | method | 1021 |
| remove | method | 1039 |
| close | method | 1054 |

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

### tests/app.test.js（1636 行） — node --test 测试（npm test）

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

### tests/image-input.test.js（167 行） — node --test 测试（npm test）

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

### tests/memory-policy.test.js（62 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| withEnv | function | 6 |
| withEnv | method | 28 |
| withEnv | method | 36 |
| withEnv | method | 45 |

### tests/memory-preview.mjs（24 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| state | const | 3 |
| sessions | const | 14 |
| app | const | 21 |

### tests/memory-ui.test.js（159 行） — node --test 测试（npm test）

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

### tests/model-config.test.js（463 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| sha | const | 16 |
| EMPTY | const | 17 |
| tempDir | function | 19 |
| makeService | function | 23 |
| seed | const | 40 |

### tests/model-manager.test.js（430 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| source | const | 7 |
| tick | const | 8 |
| j | const | 10 |
| masked | const | 12 |
| harness | function | 14 |
| setInput_on | method | 142 |
| setInput_on | function | 168 |

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

### tests/model-selection-preview.mjs（42 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| home | const | 9 |
| catalog | const | 10 |
| factory | const | 16 |
| sessions | const | 29 |
| models | const | 31 |
| app | const | 32 |
| port | const | 33 |
| close | function | 35 |

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

### tests/presets.test.js（102 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| makeFactory | const | 10 |

### tests/recall.test.js（142 行） — node --test 测试（npm test）

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

### tests/remote.test.js（598 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| EMAIL | const | 21 |
| mockTailscale | const | 23 |
| fakeChild | const | 76 |
| setup | const | 93 |
| wsRequest | const | 134 |
| setTimeout | method | 424 |

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

### tests/service-settings.test.js（314 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| source | const | 10 |
| html | const | 11 |
| setup | function | 13 |

### tests/service.test.js（478 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| until | const | 13 |
| readMaybe | const | 22 |
| killTree | const | 23 |
| buildWorkspace | const | 30 |
| WORKER | const | 44 |
| fs | const | 45 |
| ready | const | 62 |
| ready | method | 70 |
| ready | method | 73 |
| startDaemon | const | 77 |
| spawn | method | 78 |
| startTest | const | 83 |
| maintEnv | const | 92 |
| getStatus | const | 93 |
| stateFileOf | const | 98 |
| teardown | const | 103 |
| NPM_FAKE | const | 110 |
| say | const | 114 |
| sdkStub | const | 115 |
| mkdirSync | method | 116 |
| writeFileSync | method | 117 |
| writeFileSync | method | 118 |
| rmSync | method | 126 |
| sdkStub | method | 128 |
| writeFileSync | method | 129 |
| writeFileSync | method | 130 |
| writeFileSync | method | 131 |
| rmSync | method | 139 |
| sdkStub | method | 140 |
| writeFileSync | method | 141 |
| installNpmShim | const | 147 |
| A40 | const | 160 |

### tests/session-created-at.test.js（44 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 8 |

### tests/session-flow.test.js（333 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| flowFactory | const | 77 |
| jsonlFactory | const | 86 |

### tests/session-memory.test.js（170 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| reply | const | 9 |

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

### tests/task-notifications.test.js（161 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factoryFixture | function | 8 |
| tick | const | 26 |
| until | function | 27 |

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

- 协议 command.type：image、inherit、radius、service.status、service.update.check、service.restart、remote.get、remote.login、remote.configure、session.rename、workspace.reveal、workspace.browse、files.browse、models.list、models.config.get、models.provider.save、models.provider.delete、models.model.save、models.model.delete、models.favorites.get、models.favorites.set、capabilities.list、session.defaults.get、session.defaults.configure、session.presets.list、session.presets.save、session.presets.delete、session.configure、sessions.list、session.create、session.import、session.attach、session.skills.refresh、session.close、prompt、cancel、queue.withdraw、tasks.read（src/protocol.js）
- HTML id：sidebar、open-workspace、new、custom-new、preset-list、import-session、search、sessions、open-settings、sidebar-backdrop、toggle-sidebar、session-title、workspace-label、copy-workspace、reveal-workspace、workspace-feedback、open-summaries、status、service-dev、service-version、login、maintenance-state、connect、workspace、earliest、transcript、output、latest、message-queue、task-runs、compaction-progress、add-context、add-image、image-files、context-chips、task-timer、task-timer-value、context-menu、context-picker、context-back、context-title、context-close、context-search、context-results、context-error、image-attachments、composer、prompt、prompt-completion、composer-skill、provider、model、thinking、stop、send-steer、send-followup、send、session-runtime、mobile-runtime、mobile-expand、composer-help、error、session-action、session-action-form、session-action-title、session-action-description、session-name-label、session-name、session-action-error、session-action-cancel、session-action-submit、image-preview、image-preview-close、image-preview-image、restart-dialog、restart-form、restart-title、restart-description、restart-warning、restart-cancel、restart-submit、summaries、summaries-title、summaries-body、summaries-empty、summaries-list、task-overlays、task-template、settings、settings-title、settings-defaults-tab、settings-remote-tab、settings-models-tab、settings-service-tab、defaults-panel、selection-copy-title、selection-copy、selection-copy-help、selection-copy-feedback、queue-type、steer-help、followup-help、defaults-preview、subagent-title、subagent-help、subagent-provider、subagent-model、settings-feedback、defaults-title、defaults-editor、remote-panel、remote-status-title、remote-status、remote-login、remote-auth、remote-url、remote-form、remote-note、remote-enabled、remote-email、remote-email-help、remote-feedback、remote-refresh、remote-save、models-panel、service-panel、service-state-title、service-feedback、service-restart-title、restart-quick、restart-rebuild、service-recover、service-update-section、service-update-title、update-check、update-result、update-install、service-history-title、service-history、create-session、create-title、create-form、preset-fields、preset-name、preset-fixed-cwd、preset-directory、preset-delete、create-workspace、create-defaults-help、create-agents、create-compaction、create-retry、create-trust-row、create-trust、create-feedback、create-submit（public/index.html）
- HTTP 静态路由：/、/favicon.svg、/style.css、/app.js、/service-settings.js、/file-picker.js、/tooltip.js、/tooltip.css、/text-contrast.js、/text-contrast.css、/file-picker.css、/markdown.js、/stream-renderer.js、/memory-tags.js、/vendor/marked.js、/vendor/purify.js、/model-manager.js、/model-manager.css、/model-picker.js、/model-picker.css、/health（src/server.js）

## ⚠ 未登记文件（0）

（无）
