<!-- 自动生成，勿手改。重建：node .pi/skills/codebase-map/scripts/reindex.mjs -->
# Axiom 多级代码索引（生成于 2026/9/11 02:13:43）

## L1 模块总览（文件 → 职责）

| 文件 | 行数 | 职责 | 关键符号 |
|---|---|---|---|
| public/app.js | 2207 | 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度 | filePicker, $, ws, allSessions |
| public/file-picker.css | 269 | 文件选择弹窗主题与响应式布局 | - |
| public/file-picker.js | 351 | 共享文件/目录选择弹窗、懒加载与分类 SVG 图标 | NS, SEARCH_DEBOUNCE, el, FOLDER_COLORS |
| public/index.html | 243 | 页面骨架与元素 id（见 L3） | - |
| public/markdown.js | 75 | marked + DOMPurify 渲染（XSS 边界） | cache, policy, renderMarkdown |
| public/stream-renderer.js | 46 | 流式增量渲染状态机 | createStreamRenderer |
| public/style.css | 1138 | 全局样式（CSP 禁 inline style，样式一律进这里） | - |
| public/text-contrast.css | 46 | 文字专用对比度档位与调节面板 | - |
| public/text-contrast.js | 113 | 文字对比度按钮、实时调节与本地偏好 | KEY, MIN, MAX, STEP |
| public/tooltip.css | 50 | 共享暗色悬停说明样式 | - |
| public/tooltip.js | 225 | 共享悬停说明：动态 title、键盘、定位与无障碍 | SHOW_DELAY, HIDE_DELAY, GAP, EDGE |
| scripts/autostart.mjs | 133 | Windows/macOS/Linux 当前用户登录自动启动安装/卸载 | run, projectDir, serviceEntry, label |
| scripts/install.mjs | 86 | 一键安装：装依赖/注册自启/启动守护/健康检查/打开浏览器 | root, parseArgs, nodeOk, openCommand |
| scripts/service.mjs | 119 | 服务守护：IPC 快速/重建重启与安装构建失败反馈 | root, output, run, npmRun |
| src/capabilities.js | 120 | 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities） | sdkEntry, resolver, alias, jiti |
| src/compaction.js | 374 | 后台独立摘要、token/占比阈值、快照校验与 turn 安全提交 | contextTokens, prepareBackgroundCompaction, DEFAULT_COMPACTION_CONFIG, normalizeCompaction |
| src/inline-images.js | 32 | 模型上下文图片定位：将占位符与真实附件交错排列，不改存储与队列 | inlineImages, inlineImagesExtension |
| src/main.js | 60 | 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理 | port, cwd, factory, home |
| src/pi.js | 298 | createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档） | agentRuntime, queueStateOf, hasModelOutput, withdrawQueue |
| src/protocol.js | 145 | zod 协议：selection / command 判别联合（消息类型见 L3） | id, capabilities, workspace, thinking |
| src/retry.js | 149 | 模型失败重试：可取消退避、最多30次、保留已有工具结果继续 | RETRY_DELAYS_MS, MAX_RETRIES, delayFor, MAX_TIMEOUT_MS |
| src/server.js | 212 | createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发 | assets, createServerApp |
| src/sessions.js | 653 | Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化 | BROWSE_PAGE, resolveDir, parentOf, absoluteCrumbs |
| src/tasks.js | 107 | Tasks：子任务（委托）生命周期 | Tasks |
| src/tools.js | 97 | delegationTools：委托/凭证读取/追加工具定义（zod 入参） | delegateInput, readInput, appendInput, result |
| src/update.js | 41 | 检查更新：本地安装（提交 SHA/版本）比对 GitHub 公开仓库 master，npm 安装实例可自动重装 | repo, npmSpec, greater, checkUpdate |
| tests/app.test.js | 1353 | node --test 测试（npm test） | pickerSource, contrastSource |
| tests/autostart.test.js | 60 | node --test 测试（npm test） | node, cwd, service |
| tests/benchmark.js | 92 | node --test 测试（npm test） | window |
| tests/capabilities.test.js | 157 | node --test 测试（npm test） | - |
| tests/codebase-index.test.js | 20 | node --test 测试（npm test） | ROOT, SKILL |
| tests/compaction-config.test.js | 105 | node --test 测试（npm test） | - |
| tests/compaction-ui.py | 57 | node --test 测试（npm test） | - |
| tests/compaction-ui.test.js | 93 | node --test 测试（npm test） | page |
| tests/compaction.test.js | 781 | node --test 测试（npm test） | fakeModel, createTestSession, seq, userMsg |
| tests/config.test.js | 223 | node --test 测试（npm test） | - |
| tests/conversation-preview.mjs | 122 | node --test 测试（npm test） | markdown, message, thinking, state |
| tests/conversation-ui.py | 210 | node --test 测试（npm test） | - |
| tests/defaults.test.js | 33 | node --test 测试（npm test） | - |
| tests/file-picker.test.js | 67 | node --test 测试（npm test） | source, tick |
| tests/image-input.test.js | 167 | node --test 测试（npm test） | pngBase64, jpegBase64, image, parsePrompt |
| tests/inline-images.test.js | 42 | node --test 测试（npm test） | text, a, b, user |
| tests/install.test.js | 24 | node --test 测试（npm test） | - |
| tests/markdown.test.js | 72 | node --test 测试（npm test） | - |
| tests/message-activity.test.js | 191 | node --test 测试（npm test） | page, assistant, thought, call |
| tests/recall.test.js | 94 | node --test 测试（npm test） | user, assistant, thinking, fixture |
| tests/retry.test.js | 340 | node --test 测试（npm test） | RATE_LIMIT, QUOTA, ABORTED, fakeSession |
| tests/server.test.js | 125 | node --test 测试（npm test） | - |
| tests/service-api.test.js | 34 | node --test 测试（npm test） | - |
| tests/service.test.js | 138 | node --test 测试（npm test） | - |
| tests/session-flow.test.js | 128 | node --test 测试（npm test） | flowFactory |
| tests/smoke.js | 67 | node --test 测试（npm test） | TIMEOUT, sessions |
| tests/stream-renderer.test.js | 99 | node --test 测试（npm test） | - |
| tests/task-notifications.test.js | 129 | node --test 测试（npm test） | factoryFixture, tick, until |
| tests/tasks.test.js | 76 | node --test 测试（npm test） | fixture |
| tests/text-contrast.test.js | 162 | node --test 测试（npm test） | source, css, fakeStorage, throwingStorage |
| tests/tooltip.test.js | 282 | node --test 测试（npm test） | source, boot, fire, tip |
| tests/update.test.js | 28 | node --test 测试（npm test） | - |
| tests/workspace-picker.test.js | 96 | node --test 测试（npm test） | - |

## L2 符号 → 行号（跳转：read <文件> offset=<行>）

### public/app.js（2207 行） — 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度

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
| compactionNodes | const | 28 |
| images | const | 29 |
| completionVersion | const | 30 |
| selectedSkill | const | 31 |
| hiddenSessions | const | 35 |
| sessionOrder | const | 40 |
| setSessionHidden | function | 45 |
| renderSessions | method | 50 |
| draggedSession | const | 53 |
| saveView | function | 72 |
| resizePrompt | function | 83 |
| scrollFrame | const | 87 |
| scrollLatest | function | 88 |
| renderer | const | 98 |
| scrollLatest | method | 111 |
| mobile | const | 113 |
| sidebar | function | 114 |
| sidebar | method | 124 |
| pending | const | 128 |
| error | function | 131 |
| request | function | 134 |
| controls | function | 143 |
| renderContextChips | method | 163 |
| options | function | 177 |
| fillModels | function | 184 |
| options | method | 185 |
| fillSubagentModels | function | 193 |
| options | method | 195 |
| capabilityName | function | 203 |
| runtimeSummary | function | 213 |
| renderRuntime | function | 226 |
| updateTaskRuntime | function | 234 |
| renderRuntime | method | 236 |
| applyConfig | function | 239 |
| options | method | 241 |
| renderRuntime | method | 247 |
| options | method | 248 |
| fillSubagentModels | method | 253 |
| fillModels | method | 255 |
| options | method | 256 |
| configure | function | 262 |
| controls | method | 265 |
| controls | method | 288 |
| openCreation | method | 290 |
| messageItems | const | 298 |
| activityPaths | const | 300 |
| setActivityIcon | function | 315 |
| disclosureHint | function | 325 |
| activityLine | function | 345 |
| setActivity | method | 355 |
| setActivity | function | 358 |
| setActivityIcon | method | 360 |
| waiting | function | 371 |
| scrollLatest | method | 377 |
| clearWaiting | function | 379 |
| stopActivity | function | 383 |
| clearWaiting | method | 384 |
| updateActivity | function | 393 |
| setActivity | method | 401 |
| setActivity | method | 402 |
| mergeThoughts | function | 406 |
| diffView | const | 423 |
| renderToolDetail | function | 428 |
| section | method | 514 |
| toolState | function | 516 |
| clearWaiting | method | 518 |
| setActivity | method | 562 |
| renderToolDetail | method | 563 |
| scrollLatest | method | 564 |
| card | function | 566 |
| renderMessage | function | 617 |
| updateActivity | method | 684 |
| renderCompactionStatus | function | 687 |
| trackTaskEntries | function | 704 |
| placeCompactedTasks | function | 715 |
| compactionCard | function | 724 |
| renderMarkdown | method | 742 |
| foldCompaction | function | 745 |
| placeCompactedTasks | method | 765 |
| mergeThoughts | method | 766 |
| compactionEditor | function | 770 |
| options | method | 806 |
| fillThinking | method | 834 |
| renderTaskRuns | function | 842 |
| renderQueue | function | 870 |
| retryCards | const | 887 |
| retryFailures | const | 888 |
| renderRetry | function | 889 |
| scrollLatest | method | 926 |
| event | function | 928 |
| snapshot | function | 1077 |
| clearTimeout | method | 1079 |
| renderTaskRuns | method | 1101 |
| renderCompactionStatus | method | 1107 |
| mergeThoughts | method | 1165 |
| placeCompactedTasks | method | 1179 |
| renderImages | method | 1192 |
| closeCompletion | method | 1195 |
| renderQueue | method | 1206 |
| applyConfig | method | 1208 |
| controls | method | 1210 |
| reconnectTimer | const | 1212 |
| clearTimeout | method | 1216 |
| controls | method | 1219 |
| scheduleReconnect | function | 1304 |
| clearTimeout | method | 1305 |
| serviceVersion | const | 1309 |
| restartNames | const | 1310 |
| restartDescriptions | const | 1311 |
| controls | method | 1335 |
| fillModels | method | 1347 |
| fillSubagentModels | method | 1354 |
| closeCompletion | method | 1371 |
| controls | method | 1376 |
| scrollLatest | method | 1381 |
| enableImagePreview | function | 1413 |
| renderImages | function | 1434 |
| addImages | function | 1459 |
| loadImages | function | 1480 |
| renderImages | method | 1489 |
| escapeTimer | const | 1543 |
| withdrawQueue | function | 1544 |
| refreshing | const | 1614 |
| refreshSessions | function | 1615 |
| updateSessions | function | 1622 |
| renderSessions | method | 1626 |
| switchSession | function | 1628 |
| saveView | method | 1630 |
| controls | method | 1633 |
| renderSessions | function | 1645 |
| sessionAction | const | 1765 |
| openSessionAction | function | 1766 |
| contextIcon | function | 1807 |
| renderContextChips | function | 1810 |
| renderContextResults | function | 1828 |
| controls | method | 1860 |
| resizePrompt | method | 1866 |
| controls | method | 1867 |
| closeCompletion | function | 1870 |
| highlightCompletion | function | 1878 |
| chooseCompletion | function | 1887 |
| closeCompletion | method | 1897 |
| updateCompletion | function | 1900 |
| closeCompletion | method | 1901 |
| resizePrompt | method | 1954 |
| controls | method | 1955 |
| switchSession | method | 1995 |
| creationLoad | const | 1997 |
| createAgentPicker | function | 1998 |
| options | method | 2020 |
| fill | method | 2028 |
| fillThinking | method | 2036 |
| options | method | 2038 |
| loadCreation | function | 2084 |
| openCreation | function | 2118 |
| updateDefaultsPreview | function | 2135 |
| updateDefaultsPreview | method | 2155 |

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

### src/capabilities.js（120 行） — 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities）

| 符号 | 类型 | 行 |
|---|---|---|
| sdkEntry | const | 12 |
| resolver | const | 13 |
| alias | const | 14 |
| jiti | const | 21 |
| snapshotSettings | function | 23 |
| discoverCapabilities | function | 36 |
| resolveCapabilities | function | 72 |
| capabilityLoader | function | 89 |

### src/compaction.js（374 行） — 后台独立摘要、token/占比阈值、快照校验与 turn 安全提交

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
| throwIfAborted | function | 111 |
| summarizeWithPiSession | function | 115 |
| throwIfAborted | method | 116 |
| createBackgroundCompaction | function | 189 |

### src/inline-images.js（32 行） — 模型上下文图片定位：将占位符与真实附件交错排列，不改存储与队列

| 符号 | 类型 | 行 |
|---|---|---|
| inlineImages | function | 2 |
| inlineImagesExtension | function | 29 |

### src/main.js（60 行） — 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理

| 符号 | 类型 | 行 |
|---|---|---|
| port | const | 12 |
| cwd | const | 15 |
| factory | const | 18 |
| home | const | 19 |
| sessions | const | 26 |
| app | const | 29 |
| closing | const | 48 |
| stop | function | 49 |

### src/pi.js（298 行） — createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档）

| 符号 | 类型 | 行 |
|---|---|---|
| agentRuntime | function | 12 |
| queueStateOf | function | 28 |
| hasModelOutput | function | 47 |
| withdrawQueue | function | 57 |
| recallLastMessage | function | 67 |
| createPiFactory | function | 89 |

### src/protocol.js（145 行） — zod 协议：selection / command 判别联合（消息类型见 L3）

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

### src/server.js（212 行） — createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发

| 符号 | 类型 | 行 |
|---|---|---|
| assets | const | 7 |
| createServerApp | function | 30 |

### src/sessions.js（653 行） — Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化

| 符号 | 类型 | 行 |
|---|---|---|
| BROWSE_PAGE | const | 13 |
| resolveDir | function | 15 |
| parentOf | function | 26 |
| absoluteCrumbs | function | 35 |
| hostLocations | function | 57 |
| Sessions | class | 72 |
| constructor | method | 73 |
| loadDefaults | method | 83 |
| getDefaults | method | 92 |
| configureDefaults | method | 95 |
| saveDefaults | method | 100 |
| validateSelection | method | 118 |
| validateCompaction | method | 139 |
| load | method | 151 |
| persist | method | 170 |
| list | method | 189 |
| rename | method | 200 |
| create | method | 208 |
| scheduleTaskNotifications | method | 366 |
| deliverTaskNotifications | method | 378 |
| get | method | 400 |
| revealWorkspace | method | 405 |
| browse | method | 419 |
| listFiles | method | 425 |
| snapshot | method | 483 |
| subscribe | method | 511 |
| configure | method | 517 |
| prompt | method | 551 |
| withdraw | method | 601 |
| cancel | method | 616 |
| remove | method | 634 |
| close | method | 649 |

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

### tests/app.test.js（1353 行） — node --test 测试（npm test）

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

### tests/compaction-ui.test.js（93 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 10 |
| restore | method | 34 |

### tests/compaction.test.js（781 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| fakeModel | const | 65 |
| createTestSession | function | 78 |
| seq | const | 95 |
| userMsg | const | 96 |
| assistantMsg | const | 97 |
| big | const | 103 |
| seed | function | 105 |
| settle | const | 110 |
| waitFor | function | 112 |
| enabledConfig | const | 120 |
| fakeSummarize | function | 129 |
| startHangingLlmServer | function | 137 |
| startFakeLlmServer | function | 160 |
| zodError | method | 217 |
| zodError | method | 218 |
| zodError | method | 219 |
| zodError | method | 220 |
| zodError | method | 221 |
| zodError | method | 222 |
| hangingSummarize | function | 544 |
| createLoopSession | function | 641 |
| writeFileSync | method | 642 |

### tests/conversation-preview.mjs（122 行） — node --test 测试（npm test）

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

### tests/recall.test.js（94 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| user | const | 9 |
| assistant | const | 10 |
| thinking | const | 11 |
| fixture | function | 13 |

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

### tests/session-flow.test.js（128 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| flowFactory | const | 66 |

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

- 协议 command.type：image、inherit、service.status、service.restart、session.rename、workspace.reveal、workspace.browse、files.browse、models.list、capabilities.list、session.defaults.get、session.defaults.configure、session.configure、sessions.list、session.create、session.attach、session.close、prompt、cancel、queue.withdraw、tasks.read（src/protocol.js）
- HTML id：sidebar、open-workspace、new、custom-new、search、sessions、hidden-session-area、hidden-session-summary、hidden-sessions、open-settings、sidebar-backdrop、toggle-sidebar、session-title、workspace-label、copy-workspace、reveal-workspace、workspace-feedback、status、service-version、service-menu-button、service-menu、restart-quick、restart-rebuild、restart-update、service-feedback、login、connect、workspace、transcript、output、latest、message-queue、task-runs、compaction-progress、add-context、add-image、image-files、context-chips、context-menu、context-picker、context-title、context-close、context-search、context-results、context-error、image-attachments、composer、prompt、prompt-completion、composer-skill、provider、model、thinking、stop、send-steer、send-followup、send、session-runtime、composer-help、error、session-action、session-action-form、session-action-title、session-action-description、session-name-label、session-name、session-action-error、session-action-cancel、session-action-submit、image-preview、image-preview-close、image-preview-image、restart-dialog、restart-form、restart-title、restart-description、restart-warning、restart-cancel、restart-submit、task-overlays、task-template、settings、settings-title、defaults-panel、queue-type、steer-help、followup-help、defaults-preview、subagent-title、subagent-help、subagent-provider、subagent-model、settings-feedback、defaults-title、defaults-editor、create-session、create-title、create-form、create-workspace、create-defaults-help、create-agents、create-compaction、create-trust-row、create-trust、create-feedback、create-submit（public/index.html）
- HTTP 静态路由：/、/favicon.svg、/style.css、/app.js、/file-picker.js、/tooltip.js、/tooltip.css、/text-contrast.js、/text-contrast.css、/file-picker.css、/markdown.js、/stream-renderer.js、/vendor/marked.js、/vendor/purify.js、/health（src/server.js）

## ⚠ 未登记文件（0）

（无）
