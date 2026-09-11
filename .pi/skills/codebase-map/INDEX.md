<!-- 自动生成，勿手改。重建：node .pi/skills/codebase-map/scripts/reindex.mjs -->
# Axiom 多级代码索引（生成于 2026/9/11 02:14:00）

## L1 模块总览（文件 → 职责）

| 文件 | 行数 | 职责 | 关键符号 |
|---|---|---|---|
| public/app.js | 2136 | 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度 | filePicker, $, ws, allSessions |
| public/file-picker.css | 269 | 文件选择弹窗主题与响应式布局 | - |
| public/file-picker.js | 351 | 共享文件/目录选择弹窗、懒加载与分类 SVG 图标 | NS, SEARCH_DEBOUNCE, el, FOLDER_COLORS |
| public/index.html | 243 | 页面骨架与元素 id（见 L3） | - |
| public/markdown.js | 75 | marked + DOMPurify 渲染（XSS 边界） | cache, policy, renderMarkdown |
| public/stream-renderer.js | 46 | 流式增量渲染状态机 | createStreamRenderer |
| public/style.css | 1132 | 全局样式（CSP 禁 inline style，样式一律进这里） | - |
| public/text-contrast.css | 46 | 文字专用对比度档位与调节面板 | - |
| public/text-contrast.js | 113 | 文字对比度按钮、实时调节与本地偏好 | KEY, MIN, MAX, STEP |
| public/tooltip.css | 50 | 共享暗色悬停说明样式 | - |
| public/tooltip.js | 225 | 共享悬停说明：动态 title、键盘、定位与无障碍 | SHOW_DELAY, HIDE_DELAY, GAP, EDGE |
| scripts/autostart.mjs | 133 | Windows/macOS/Linux 当前用户登录自动启动安装/卸载 | run, projectDir, serviceEntry, label |
| scripts/install.mjs | 86 | 一键安装：装依赖/注册自启/启动守护/健康检查/打开浏览器 | root, parseArgs, nodeOk, openCommand |
| scripts/service.mjs | 119 | 服务守护：IPC 快速/重建重启与安装构建失败反馈 | root, output, run, npmRun |
| src/capabilities.js | 115 | 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities） | sdkEntry, resolver, alias, jiti |
| src/compaction.js | 351 | 后台独立摘要、token/占比阈值、快照校验与 turn 安全提交 | contextTokens, prepareBackgroundCompaction, DEFAULT_COMPACTION_CONFIG, normalizeCompaction |
| src/inline-images.js | 32 | 模型上下文图片定位：将占位符与真实附件交错排列，不改存储与队列 | inlineImages, inlineImagesExtension |
| src/main.js | 62 | 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理 | port, cwd, factory, home |
| src/pi.js | 261 | createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档） | agentRuntime, queueStateOf, withdrawQueue, createPiFactory |
| src/protocol.js | 147 | zod 协议：selection / command 判别联合（消息类型见 L3） | id, capabilities, workspace, thinking |
| src/retry.js | 149 | 模型失败重试：可取消退避、最多30次、保留已有工具结果继续 | RETRY_DELAYS_MS, MAX_RETRIES, delayFor, MAX_TIMEOUT_MS |
| src/server.js | 221 | createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发 | assets, createServerApp |
| src/sessions.js | 679 | Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化 | BROWSE_PAGE, resolveDir, parentOf, absoluteCrumbs |
| src/tasks.js | 107 | Tasks：子任务（委托）生命周期 | Tasks |
| src/tools.js | 97 | delegationTools：委托/凭证读取/追加工具定义（zod 入参） | delegateInput, readInput, appendInput, result |
| src/update.js | 41 | 检查更新：本地安装（提交 SHA/版本）比对 GitHub 公开仓库 master，npm 安装实例可自动重装 | repo, npmSpec, greater, checkUpdate |
| tests/app.test.js | 1341 | node --test 测试（npm test） | pickerSource, contrastSource |
| tests/autostart.test.js | 60 | node --test 测试（npm test） | node, cwd, service |
| tests/benchmark.js | 92 | node --test 测试（npm test） | window |
| tests/capabilities.test.js | 85 | node --test 测试（npm test） | - |
| tests/codebase-index.test.js | 20 | node --test 测试（npm test） | ROOT, SKILL |
| tests/compaction-config.test.js | 105 | node --test 测试（npm test） | - |
| tests/compaction.test.js | 737 | node --test 测试（npm test） | fakeModel, createTestSession, seq, userMsg |
| tests/config.test.js | 220 | node --test 测试（npm test） | - |
| tests/conversation-preview.mjs | 99 | node --test 测试（npm test） | markdown, message, thinking, state |
| tests/conversation-ui.py | 210 | node --test 测试（npm test） | - |
| tests/defaults.test.js | 33 | node --test 测试（npm test） | - |
| tests/file-picker.test.js | 67 | node --test 测试（npm test） | source, tick |
| tests/image-input.test.js | 167 | node --test 测试（npm test） | pngBase64, jpegBase64, image, parsePrompt |
| tests/inline-images.test.js | 42 | node --test 测试（npm test） | text, a, b, user |
| tests/install.test.js | 24 | node --test 测试（npm test） | - |
| tests/markdown.test.js | 72 | node --test 测试（npm test） | - |
| tests/message-activity.test.js | 191 | node --test 测试（npm test） | page, assistant, thought, call |
| tests/retry.test.js | 340 | node --test 测试（npm test） | RATE_LIMIT, QUOTA, ABORTED, fakeSession |
| tests/server.test.js | 125 | node --test 测试（npm test） | - |
| tests/service-api.test.js | 34 | node --test 测试（npm test） | - |
| tests/service.test.js | 138 | node --test 测试（npm test） | - |
| tests/session-flow.test.js | 179 | node --test 测试（npm test） | flowFactory |
| tests/smoke.js | 67 | node --test 测试（npm test） | TIMEOUT, sessions |
| tests/stream-renderer.test.js | 99 | node --test 测试（npm test） | - |
| tests/task-notifications.test.js | 129 | node --test 测试（npm test） | factoryFixture, tick, until |
| tests/tasks.test.js | 76 | node --test 测试（npm test） | fixture |
| tests/text-contrast.test.js | 162 | node --test 测试（npm test） | source, css, fakeStorage, throwingStorage |
| tests/tooltip.test.js | 282 | node --test 测试（npm test） | source, boot, fire, tip |
| tests/update.test.js | 28 | node --test 测试（npm test） | - |
| tests/workspace-picker.test.js | 96 | node --test 测试（npm test） | - |

## L2 符号 → 行号（跳转：read <文件> offset=<行>）

### public/app.js（2136 行） — 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度

| 符号 | 类型 | 行 |
|---|---|---|
| filePicker | const | 8 |
| $ | const | 9 |
| ws | const | 10 |
| allSessions | const | 22 |
| views | const | 24 |
| compactionDefaults | const | 25 |
| thinkingLevels | const | 26 |
| compactions | const | 27 |
| images | const | 28 |
| completionVersion | const | 29 |
| selectedSkill | const | 30 |
| hiddenSessions | const | 34 |
| sessionOrder | const | 39 |
| setSessionHidden | function | 44 |
| renderSessions | method | 49 |
| draggedSession | const | 52 |
| saveView | function | 71 |
| resizePrompt | function | 82 |
| scrollFrame | const | 86 |
| scrollLatest | function | 87 |
| renderer | const | 97 |
| scrollLatest | method | 110 |
| mobile | const | 112 |
| sidebar | function | 113 |
| sidebar | method | 123 |
| pending | const | 127 |
| error | function | 130 |
| request | function | 133 |
| controls | function | 142 |
| renderContextChips | method | 162 |
| options | function | 176 |
| fillModels | function | 183 |
| options | method | 184 |
| fillSubagentModels | function | 192 |
| options | method | 194 |
| capabilityName | function | 202 |
| runtimeSummary | function | 212 |
| renderRuntime | function | 225 |
| updateTaskRuntime | function | 233 |
| renderRuntime | method | 235 |
| applyConfig | function | 238 |
| options | method | 240 |
| renderRuntime | method | 246 |
| options | method | 247 |
| fillSubagentModels | method | 252 |
| fillModels | method | 254 |
| options | method | 255 |
| configure | function | 261 |
| controls | method | 264 |
| controls | method | 287 |
| openCreation | method | 289 |
| messageItems | const | 297 |
| activityPaths | const | 299 |
| setActivityIcon | function | 314 |
| disclosureHint | function | 324 |
| activityLine | function | 344 |
| setActivity | method | 354 |
| setActivity | function | 357 |
| setActivityIcon | method | 359 |
| waiting | function | 370 |
| scrollLatest | method | 376 |
| clearWaiting | function | 378 |
| stopActivity | function | 382 |
| clearWaiting | method | 383 |
| updateActivity | function | 392 |
| setActivity | method | 400 |
| setActivity | method | 401 |
| mergeThoughts | function | 405 |
| diffView | const | 422 |
| renderToolDetail | function | 427 |
| section | method | 513 |
| toolState | function | 515 |
| clearWaiting | method | 517 |
| setActivity | method | 561 |
| renderToolDetail | method | 562 |
| scrollLatest | method | 563 |
| card | function | 565 |
| renderMessage | function | 616 |
| updateActivity | method | 683 |
| compactionCard | function | 686 |
| renderMarkdown | method | 700 |
| foldCompaction | function | 703 |
| mergeThoughts | method | 717 |
| compactionEditor | function | 721 |
| options | method | 757 |
| fillThinking | method | 785 |
| renderTaskRuns | function | 793 |
| renderQueue | function | 819 |
| retryCards | const | 836 |
| retryFailures | const | 837 |
| renderRetry | function | 838 |
| scrollLatest | method | 875 |
| event | function | 877 |
| snapshot | function | 1020 |
| clearTimeout | method | 1022 |
| renderTaskRuns | method | 1043 |
| mergeThoughts | method | 1102 |
| renderImages | method | 1124 |
| closeCompletion | method | 1127 |
| renderQueue | method | 1138 |
| applyConfig | method | 1140 |
| controls | method | 1142 |
| reconnectTimer | const | 1144 |
| clearTimeout | method | 1148 |
| controls | method | 1151 |
| scheduleReconnect | function | 1237 |
| clearTimeout | method | 1238 |
| serviceVersion | const | 1242 |
| importDir | const | 1243 |
| restartNames | const | 1244 |
| restartDescriptions | const | 1245 |
| controls | method | 1269 |
| fillModels | method | 1281 |
| fillSubagentModels | method | 1288 |
| closeCompletion | method | 1305 |
| controls | method | 1310 |
| scrollLatest | method | 1315 |
| enableImagePreview | function | 1347 |
| renderImages | function | 1368 |
| addImages | function | 1393 |
| loadImages | function | 1414 |
| renderImages | method | 1423 |
| escapeTimer | const | 1477 |
| withdrawQueue | function | 1478 |
| refreshing | const | 1534 |
| refreshSessions | function | 1535 |
| updateSessions | function | 1542 |
| renderSessions | method | 1546 |
| switchSession | function | 1548 |
| saveView | method | 1550 |
| controls | method | 1553 |
| renderSessions | function | 1565 |
| sessionAction | const | 1685 |
| openSessionAction | function | 1686 |
| contextIcon | function | 1727 |
| renderContextChips | function | 1730 |
| renderContextResults | function | 1748 |
| controls | method | 1780 |
| resizePrompt | method | 1786 |
| controls | method | 1787 |
| closeCompletion | function | 1790 |
| highlightCompletion | function | 1798 |
| chooseCompletion | function | 1807 |
| closeCompletion | method | 1817 |
| updateCompletion | function | 1820 |
| closeCompletion | method | 1821 |
| resizePrompt | method | 1874 |
| controls | method | 1875 |
| switchSession | method | 1915 |
| creationLoad | const | 1926 |
| createAgentPicker | function | 1927 |
| options | method | 1949 |
| fill | method | 1957 |
| fillThinking | method | 1965 |
| options | method | 1967 |
| loadCreation | function | 2013 |
| openCreation | function | 2047 |
| updateDefaultsPreview | function | 2064 |
| updateDefaultsPreview | method | 2084 |

### public/file-picker.js（351 行） — 共享文件/目录选择弹窗、懒加载与分类 SVG 图标

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
| baseName | function | 348 |

### public/markdown.js（75 行） — marked + DOMPurify 渲染（XSS 边界）

| 符号 | 类型 | 行 |
|---|---|---|
| cache | const | 4 |
| policy | const | 5 |
| renderMarkdown | function | 11 |

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

### scripts/install.mjs（86 行） — 一键安装：装依赖/注册自启/启动守护/健康检查/打开浏览器

| 符号 | 类型 | 行 |
|---|---|---|
| root | const | 14 |
| parseArgs | const | 16 |
| nodeOk | const | 26 |
| openCommand | const | 31 |
| probe | const | 37 |
| ask | const | 45 |
| install | function | 47 |
| invoked | const | 83 |

### scripts/service.mjs（119 行） — 服务守护：IPC 快速/重建重启与安装构建失败反馈

| 符号 | 类型 | 行 |
|---|---|---|
| root | const | 10 |
| output | const | 11 |
| run | function | 12 |
| npmRun | const | 20 |
| update | const | 27 |
| rebuild | function | 29 |
| supervise | function | 46 |
| mkdirSync | method | 54 |
| start | method | 113 |
| invoked | const | 117 |

### src/capabilities.js（115 行） — 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities）

| 符号 | 类型 | 行 |
|---|---|---|
| sdkEntry | const | 12 |
| resolver | const | 13 |
| alias | const | 14 |
| jiti | const | 21 |
| snapshotSettings | function | 23 |
| discoverCapabilities | function | 36 |
| resolveCapabilities | function | 72 |
| capabilityLoader | function | 84 |

### src/compaction.js（351 行） — 后台独立摘要、token/占比阈值、快照校验与 turn 安全提交

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
| throwIfAborted | function | 110 |
| summarizeWithPiSession | function | 114 |
| throwIfAborted | method | 115 |
| createBackgroundCompaction | function | 188 |

### src/inline-images.js（32 行） — 模型上下文图片定位：将占位符与真实附件交错排列，不改存储与队列

| 符号 | 类型 | 行 |
|---|---|---|
| inlineImages | function | 2 |
| inlineImagesExtension | function | 29 |

### src/main.js（62 行） — 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理

| 符号 | 类型 | 行 |
|---|---|---|
| port | const | 12 |
| cwd | const | 15 |
| factory | const | 18 |
| home | const | 19 |
| sessions | const | 26 |
| app | const | 29 |
| closing | const | 50 |
| stop | function | 51 |

### src/pi.js（261 行） — createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档）

| 符号 | 类型 | 行 |
|---|---|---|
| agentRuntime | function | 12 |
| queueStateOf | function | 28 |
| withdrawQueue | function | 47 |
| createPiFactory | function | 53 |

### src/protocol.js（147 行） — zod 协议：selection / command 判别联合（消息类型见 L3）

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
| selection | const | 56 |
| command | const | 66 |

### src/retry.js（149 行） — 模型失败重试：可取消退避、最多30次、保留已有工具结果继续

| 符号 | 类型 | 行 |
|---|---|---|
| RETRY_DELAYS_MS | const | 5 |
| MAX_RETRIES | const | 6 |
| delayFor | const | 7 |
| MAX_TIMEOUT_MS | const | 13 |
| abortableSleep | const | 14 |
| classify | class | 48 |
| createAutoRetry | function | 77 |

### src/server.js（221 行） — createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发

| 符号 | 类型 | 行 |
|---|---|---|
| assets | const | 7 |
| createServerApp | function | 30 |

### src/sessions.js（679 行） — Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化

| 符号 | 类型 | 行 |
|---|---|---|
| BROWSE_PAGE | const | 13 |
| resolveDir | function | 15 |
| parentOf | function | 26 |
| absoluteCrumbs | function | 35 |
| importedTitle | function | 57 |
| hostLocations | function | 79 |
| Sessions | class | 94 |
| constructor | method | 95 |
| loadDefaults | method | 105 |
| getDefaults | method | 114 |
| configureDefaults | method | 117 |
| saveDefaults | method | 122 |
| validateSelection | method | 140 |
| validateCompaction | method | 156 |
| load | method | 168 |
| persist | method | 181 |
| list | method | 200 |
| rename | method | 211 |
| importSession | method | 220 |
| create | method | 248 |
| scheduleTaskNotifications | method | 410 |
| deliverTaskNotifications | method | 422 |
| get | method | 444 |
| revealWorkspace | method | 449 |
| browse | method | 463 |
| listFiles | method | 469 |
| snapshot | method | 527 |
| subscribe | method | 554 |
| configure | method | 560 |
| prompt | method | 594 |
| cancel | method | 642 |
| remove | method | 660 |
| close | method | 675 |

### src/tasks.js（107 行） — Tasks：子任务（委托）生命周期

| 符号 | 类型 | 行 |
|---|---|---|
| Tasks | class | 3 |
| constructor | method | 4 |
| start | method | 11 |
| publish | method | 22 |
| view | method | 25 |
| snapshot | method | 28 |
| run | method | 33 |
| read | method | 76 |
| append | method | 83 |
| cancel | method | 93 |

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
| repo | const | 8 |
| npmSpec | const | 9 |
| greater | const | 11 |
| checkUpdate | function | 18 |

### tests/app.test.js（1341 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| pickerSource | const | 9 |
| contrastSource | const | 10 |

### tests/autostart.test.js（60 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| node | const | 14 |
| cwd | const | 15 |
| service | const | 16 |

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

### tests/compaction.test.js（737 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| fakeModel | const | 25 |
| createTestSession | function | 38 |
| seq | const | 55 |
| userMsg | const | 56 |
| assistantMsg | const | 57 |
| big | const | 63 |
| seed | function | 65 |
| settle | const | 70 |
| waitFor | function | 72 |
| enabledConfig | const | 80 |
| fakeSummarize | function | 89 |
| startHangingLlmServer | function | 97 |
| startFakeLlmServer | function | 120 |
| zodError | method | 177 |
| zodError | method | 178 |
| zodError | method | 179 |
| zodError | method | 180 |
| zodError | method | 181 |
| zodError | method | 182 |
| hangingSummarize | function | 502 |
| createLoopSession | function | 597 |
| writeFileSync | method | 598 |

### tests/conversation-preview.mjs（99 行） — node --test 测试（npm test）

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
| sessions | const | 90 |
| app | const | 97 |

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

### tests/message-activity.test.js（191 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 10 |
| restore | method | 34 |
| assistant | const | 38 |
| thought | const | 39 |
| call | const | 40 |
| entry | const | 41 |

### tests/retry.test.js（340 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| RATE_LIMIT | const | 6 |
| QUOTA | const | 7 |
| ABORTED | const | 8 |
| fakeSession | function | 15 |
| recorder | function | 53 |
| recordedSleep | const | 63 |
| lastAssistant | const | 73 |

### tests/session-flow.test.js（179 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| flowFactory | const | 67 |

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

### tests/task-notifications.test.js（129 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factoryFixture | function | 8 |
| tick | const | 26 |
| until | function | 27 |

### tests/tasks.test.js（76 行） — node --test 测试（npm test）

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

## L3 横切常量（跨模块定位入口）

- 协议 command.type：image、inherit、service.status、service.restart、session.rename、workspace.reveal、workspace.browse、files.browse、models.list、capabilities.list、session.defaults.get、session.defaults.configure、session.configure、sessions.list、session.create、session.import、session.attach、session.close、prompt、cancel、queue.withdraw、tasks.read（src/protocol.js）
- HTML id：sidebar、open-workspace、new、custom-new、import-session、search、sessions、hidden-session-area、hidden-session-summary、hidden-sessions、open-settings、sidebar-backdrop、toggle-sidebar、session-title、workspace-label、copy-workspace、reveal-workspace、workspace-feedback、status、service-version、service-menu-button、service-menu、restart-quick、restart-rebuild、restart-update、service-feedback、login、connect、workspace、transcript、output、latest、message-queue、task-runs、add-context、add-image、image-files、context-chips、context-menu、context-picker、context-title、context-close、context-search、context-results、context-error、image-attachments、composer、prompt、prompt-completion、composer-skill、provider、model、thinking、stop、send-steer、send-followup、send、session-runtime、composer-help、error、session-action、session-action-form、session-action-title、session-action-description、session-name-label、session-name、session-action-error、session-action-cancel、session-action-submit、image-preview、image-preview-close、image-preview-image、restart-dialog、restart-form、restart-title、restart-description、restart-warning、restart-cancel、restart-submit、task-overlays、task-template、settings、settings-title、defaults-panel、queue-type、steer-help、followup-help、defaults-preview、subagent-title、subagent-help、subagent-provider、subagent-model、settings-feedback、defaults-title、defaults-editor、create-session、create-title、create-form、create-workspace、create-defaults-help、create-agents、create-compaction、create-trust-row、create-trust、create-feedback、create-submit（public/index.html）
- HTTP 静态路由：/、/favicon.svg、/style.css、/app.js、/file-picker.js、/tooltip.js、/tooltip.css、/text-contrast.js、/text-contrast.css、/file-picker.css、/markdown.js、/stream-renderer.js、/vendor/marked.js、/vendor/purify.js、/health（src/server.js）

## ⚠ 未登记文件（0）

（无）
