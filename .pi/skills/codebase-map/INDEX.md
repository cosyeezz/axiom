<!-- 自动生成，勿手改。重建：node .pi/skills/codebase-map/scripts/reindex.mjs -->
# Axiom 多级代码索引（生成于 2026/9/11 11:54:42）

## L1 模块总览（文件 → 职责）

| 文件 | 行数 | 职责 | 关键符号 |
|---|---|---|---|
| public/app.js | 2627 | 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度 | filePicker, $, ws, sessionMissing |
| public/file-picker.css | 269 | 文件选择弹窗主题与响应式布局 | - |
| public/file-picker.js | 351 | 共享文件/目录选择弹窗、懒加载与分类 SVG 图标 | NS, SEARCH_DEBOUNCE, el, FOLDER_COLORS |
| public/index.html | 258 | 页面骨架与元素 id（见 L3） | - |
| public/markdown.js | 75 | marked + DOMPurify 渲染（XSS 边界） | cache, policy, renderMarkdown |
| public/stream-renderer.js | 46 | 流式增量渲染状态机 | createStreamRenderer |
| public/style.css | 1204 | 全局样式（CSP 禁 inline style，样式一律进这里） | - |
| public/text-contrast.css | 46 | 文字专用对比度档位与调节面板 | - |
| public/text-contrast.js | 113 | 文字对比度按钮、实时调节与本地偏好 | KEY, MIN, MAX, STEP |
| public/tooltip.css | 50 | 共享暗色悬停说明样式 | - |
| public/tooltip.js | 225 | 共享悬停说明：动态 title、键盘、定位与无障碍 | SHOW_DELAY, HIDE_DELAY, GAP, EDGE |
| scripts/autostart.mjs | 133 | Windows/macOS/Linux 当前用户登录自动启动安装/卸载 | run, projectDir, serviceEntry, label |
| scripts/dev.mjs | 12 | 开发入口：DEV 标识、4320 端口与独立数据目录 | - |
| scripts/install.mjs | 86 | 一键安装：装依赖/注册自启/启动守护/健康检查/打开浏览器 | root, parseArgs, nodeOk, openCommand |
| scripts/service.mjs | 143 | 服务守护：IPC 快速/重建重启与安装构建失败反馈 | root, output, run, npmRun |
| src/capabilities.js | 135 | 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities） | sdkEntry, resolver, alias, jiti |
| src/compaction.js | 374 | 后台独立摘要、token/占比阈值、快照校验与 turn 安全提交 | contextTokens, prepareBackgroundCompaction, DEFAULT_COMPACTION_CONFIG, normalizeCompaction |
| src/inline-images.js | 32 | 模型上下文图片定位：将占位符与真实附件交错排列，不改存储与队列 | inlineImages, inlineImagesExtension |
| src/main.js | 66 | 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理 | port, cwd, factory, home |
| src/pi.js | 302 | createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档） | agentRuntime, queueStateOf, hasModelOutput, withdrawQueue |
| src/protocol.js | 169 | zod 协议：selection / command 判别联合（消息类型见 L3） | id, capabilities, workspace, thinking |
| src/retry.js | 149 | 模型失败重试：可取消退避、最多30次、保留已有工具结果继续 | RETRY_DELAYS_MS, MAX_RETRIES, delayFor, MAX_TIMEOUT_MS |
| src/server.js | 236 | createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发 | assets, createServerApp |
| src/sessions.js | 846 | Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化 | BROWSE_PAGE, resolveDir, parentOf, absoluteCrumbs |
| src/tasks.js | 107 | Tasks：子任务（委托）生命周期 | Tasks |
| src/tools.js | 97 | delegationTools：委托/凭证读取/追加工具定义（zod 入参） | delegateInput, readInput, appendInput, result |
| src/update.js | 41 | 检查更新：本地安装（提交 SHA/版本）比对 GitHub 公开仓库 master，npm 安装实例可自动重装 | repo, npmSpec, commitFile, validateCommit |
| tests/activity-groups-ui.py | 110 | node --test 测试（npm test） | - |
| tests/app.test.js | 1547 | node --test 测试（npm test） | pickerSource, contrastSource |
| tests/autostart.test.js | 60 | node --test 测试（npm test） | node, cwd, service |
| tests/benchmark.js | 92 | node --test 测试（npm test） | window |
| tests/capabilities.test.js | 207 | node --test 测试（npm test） | - |
| tests/codebase-index.test.js | 20 | node --test 测试（npm test） | ROOT, SKILL |
| tests/compaction-config.test.js | 105 | node --test 测试（npm test） | - |
| tests/compaction-ui.py | 57 | node --test 测试（npm test） | - |
| tests/compaction-ui.test.js | 93 | node --test 测试（npm test） | page |
| tests/compaction.test.js | 781 | node --test 测试（npm test） | fakeModel, createTestSession, seq, userMsg |
| tests/config.test.js | 223 | node --test 测试（npm test） | - |
| tests/context-menu-ui.py | 66 | node --test 测试（npm test） | - |
| tests/conversation-preview.mjs | 123 | node --test 测试（npm test） | markdown, message, thinking, state |
| tests/conversation-ui.py | 262 | node --test 测试（npm test） | - |
| tests/defaults.test.js | 33 | node --test 测试（npm test） | - |
| tests/file-picker.test.js | 67 | node --test 测试（npm test） | source, tick |
| tests/image-input.test.js | 167 | node --test 测试（npm test） | pngBase64, jpegBase64, image, parsePrompt |
| tests/inline-images.test.js | 42 | node --test 测试（npm test） | text, a, b, user |
| tests/install.test.js | 24 | node --test 测试（npm test） | - |
| tests/markdown.test.js | 72 | node --test 测试（npm test） | - |
| tests/message-activity.test.js | 191 | node --test 测试（npm test） | page, assistant, thought, call |
| tests/presets.test.js | 102 | node --test 测试（npm test） | makeFactory |
| tests/project-skills.test.js | 57 | node --test 测试（npm test） | - |
| tests/recall.test.js | 94 | node --test 测试（npm test） | user, assistant, thinking, fixture |
| tests/retry.test.js | 340 | node --test 测试（npm test） | RATE_LIMIT, QUOTA, ABORTED, fakeSession |
| tests/server.test.js | 125 | node --test 测试（npm test） | - |
| tests/service-api.test.js | 40 | node --test 测试（npm test） | - |
| tests/service.test.js | 176 | node --test 测试（npm test） | - |
| tests/session-created-at.test.js | 44 | node --test 测试（npm test） | factory |
| tests/session-flow.test.js | 179 | node --test 测试（npm test） | flowFactory |
| tests/session-sidebar-ui.py | 55 | node --test 测试（npm test） | - |
| tests/smoke.js | 67 | node --test 测试（npm test） | TIMEOUT, sessions |
| tests/stream-renderer.test.js | 99 | node --test 测试（npm test） | - |
| tests/task-notifications.test.js | 129 | node --test 测试（npm test） | factoryFixture, tick, until |
| tests/tasks.test.js | 76 | node --test 测试（npm test） | fixture |
| tests/text-contrast.test.js | 162 | node --test 测试（npm test） | source, css, fakeStorage, throwingStorage |
| tests/tooltip.test.js | 282 | node --test 测试（npm test） | source, boot, fire, tip |
| tests/update.test.js | 38 | node --test 测试（npm test） | old |
| tests/workspace-isolation.test.js | 80 | node --test 测试（npm test） | - |
| tests/workspace-picker.test.js | 96 | node --test 测试（npm test） | - |
| tests/workspace-tabs.test.js | 229 | node --test 测试（npm test） | appSource, pickerSource, contrastSource, html |

## L2 符号 → 行号（跳转：read <文件> offset=<行>）

### public/app.js（2627 行） — 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度

| 符号 | 类型 | 行 |
|---|---|---|
| filePicker | const | 8 |
| $ | const | 9 |
| ws | const | 10 |
| sessionMissing | const | 22 |
| allSessions | const | 23 |
| views | const | 25 |
| compactionDefaults | const | 26 |
| thinkingLevels | const | 27 |
| compactions | const | 28 |
| compactionNodes | const | 29 |
| images | const | 30 |
| completionVersion | const | 31 |
| selectedSkill | const | 32 |
| hiddenSessions | const | 36 |
| readSessionPreference | function | 41 |
| changeSessionPreference | function | 45 |
| setSessionHidden | function | 59 |
| saveView | function | 74 |
| resizePrompt | function | 85 |
| scrollFrame | const | 89 |
| scrollLatest | function | 90 |
| scheduleCallGroups | method | 91 |
| renderer | const | 101 |
| scrollLatest | method | 114 |
| mobile | const | 116 |
| sidebar | function | 117 |
| sidebar | method | 127 |
| pending | const | 131 |
| error | function | 134 |
| request | function | 137 |
| controls | function | 146 |
| renderContextChips | method | 167 |
| options | function | 181 |
| fillModels | function | 188 |
| options | method | 189 |
| fillSubagentModels | function | 197 |
| options | method | 199 |
| capabilityName | function | 207 |
| runtimeSummary | function | 217 |
| renderRuntime | function | 230 |
| updateTaskRuntime | function | 238 |
| renderRuntime | method | 240 |
| applyConfig | function | 243 |
| options | method | 245 |
| renderRuntime | method | 251 |
| options | method | 252 |
| fillSubagentModels | method | 257 |
| fillModels | method | 259 |
| options | method | 260 |
| configure | function | 266 |
| controls | method | 269 |
| controls | method | 292 |
| openCreation | method | 294 |
| messageItems | const | 302 |
| activityPaths | const | 304 |
| setActivityIcon | function | 321 |
| callGroupsFrame | const | 331 |
| scheduleCallGroups | function | 332 |
| createCallGroup | function | 341 |
| paintCallGroup | function | 355 |
| refreshCallGroups | function | 381 |
| foldCallsBeforeMessage | function | 464 |
| paintCallGroup | method | 468 |
| disclosureHint | function | 470 |
| activityLine | function | 490 |
| setActivity | method | 500 |
| setActivity | function | 503 |
| scheduleCallGroups | method | 504 |
| setActivityIcon | method | 506 |
| waiting | function | 517 |
| scrollLatest | method | 523 |
| clearWaiting | function | 525 |
| stopActivity | function | 529 |
| scheduleCallGroups | method | 530 |
| clearWaiting | method | 531 |
| updateActivity | function | 540 |
| setActivity | method | 553 |
| setActivity | method | 554 |
| mergeThoughts | function | 558 |
| diffView | const | 576 |
| renderToolDetail | function | 581 |
| section | method | 667 |
| toolState | function | 669 |
| clearWaiting | method | 671 |
| setActivity | method | 715 |
| renderToolDetail | method | 716 |
| scrollLatest | method | 717 |
| card | function | 719 |
| renderMessage | function | 770 |
| updateActivity | method | 837 |
| renderCompactionStatus | function | 840 |
| trackTaskEntries | function | 857 |
| placeCompactedTasks | function | 868 |
| compactionCard | function | 877 |
| renderMarkdown | method | 895 |
| foldCompaction | function | 898 |
| placeCompactedTasks | method | 918 |
| mergeThoughts | method | 919 |
| compactionEditor | function | 923 |
| options | method | 959 |
| fillThinking | method | 987 |
| renderTaskRuns | function | 995 |
| renderQueue | function | 1023 |
| retryCards | const | 1040 |
| retryFailures | const | 1041 |
| renderRetry | function | 1042 |
| scrollLatest | method | 1079 |
| event | function | 1081 |
| snapshot | function | 1240 |
| clearTimeout | method | 1242 |
| updatePageTitle | method | 1260 |
| renderTaskRuns | method | 1267 |
| renderCompactionStatus | method | 1273 |
| mergeThoughts | method | 1331 |
| placeCompactedTasks | method | 1345 |
| renderImages | method | 1358 |
| closeCompletion | method | 1361 |
| renderQueue | method | 1372 |
| applyConfig | method | 1374 |
| controls | method | 1376 |
| reconnectTimer | const | 1378 |
| clearTimeout | method | 1382 |
| controls | method | 1385 |
| scheduleReconnect | function | 1480 |
| clearTimeout | method | 1481 |
| serviceVersion | const | 1485 |
| importDir | const | 1486 |
| restartNames | const | 1487 |
| restartDescriptions | const | 1488 |
| controls | method | 1512 |
| fillModels | method | 1524 |
| fillSubagentModels | method | 1531 |
| closeCompletion | method | 1548 |
| controls | method | 1553 |
| scrollLatest | method | 1558 |
| enableImagePreview | function | 1590 |
| renderImages | function | 1611 |
| addImages | function | 1636 |
| loadImages | function | 1657 |
| renderImages | method | 1666 |
| selectionCopy | const | 1689 |
| copySelection | function | 1701 |
| escapeTimer | const | 1764 |
| withdrawQueue | function | 1765 |
| refreshing | const | 1845 |
| refreshSessions | function | 1846 |
| updatePageTitle | function | 1857 |
| updateSessions | function | 1861 |
| updatePageTitle | method | 1873 |
| renderSessions | method | 1874 |
| recoverMissingSession | function | 1876 |
| saveView | method | 1878 |
| controls | method | 1882 |
| switchSession | function | 1898 |
| saveView | method | 1900 |
| controls | method | 1903 |
| renderSessions | function | 1925 |
| sessionAction | const | 2028 |
| openSessionAction | function | 2029 |
| contextIcon | function | 2070 |
| renderContextChips | function | 2073 |
| renderContextResults | function | 2091 |
| showContextSkills | function | 2111 |
| positionContextSkills | function | 2116 |
| showContextSkills | method | 2128 |
| controls | method | 2163 |
| skillTrigger | const | 2165 |
| showContextSkills | method | 2181 |
| resizePrompt | method | 2190 |
| controls | method | 2191 |
| closeCompletion | function | 2194 |
| highlightCompletion | function | 2202 |
| chooseCompletion | function | 2211 |
| closeCompletion | method | 2221 |
| updateCompletion | function | 2224 |
| closeCompletion | method | 2225 |
| resizePrompt | method | 2278 |
| controls | method | 2279 |
| switchSession | method | 2319 |
| creationLoad | const | 2330 |
| refreshPresets | function | 2331 |
| createAgentPicker | function | 2366 |
| options | method | 2388 |
| fill | method | 2396 |
| fillThinking | method | 2404 |
| options | method | 2406 |
| loadCreation | function | 2453 |
| openCreation | function | 2487 |
| rememberCreation | const | 2508 |
| updateDefaultsPreview | function | 2540 |
| updateDefaultsPreview | method | 2560 |
| controls | method | 2614 |

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

### scripts/service.mjs（143 行） — 服务守护：IPC 快速/重建重启与安装构建失败反馈

| 符号 | 类型 | 行 |
|---|---|---|
| root | const | 10 |
| output | const | 11 |
| run | function | 12 |
| npmRun | const | 25 |
| update | function | 32 |
| rebuild | function | 47 |
| supervise | function | 64 |
| mkdirSync | method | 72 |
| start | method | 137 |
| invoked | const | 141 |

### src/capabilities.js（135 行） — 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities）

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

### src/main.js（66 行） — 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理

| 符号 | 类型 | 行 |
|---|---|---|
| port | const | 12 |
| cwd | const | 15 |
| factory | const | 18 |
| home | const | 19 |
| sessions | const | 26 |
| app | const | 29 |
| closing | const | 54 |
| stop | function | 55 |

### src/pi.js（302 行） — createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档）

| 符号 | 类型 | 行 |
|---|---|---|
| agentRuntime | function | 12 |
| queueStateOf | function | 28 |
| hasModelOutput | function | 47 |
| withdrawQueue | function | 57 |
| recallLastMessage | function | 67 |
| createPiFactory | function | 89 |

### src/protocol.js（169 行） — zod 协议：selection / command 判别联合（消息类型见 L3）

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
| preset | const | 67 |
| presetStore | const | 73 |
| command | const | 74 |

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

### src/server.js（236 行） — createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发

| 符号 | 类型 | 行 |
|---|---|---|
| assets | const | 7 |
| createServerApp | function | 30 |

### src/sessions.js（846 行） — Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化

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
| loadDefaults | method | 107 |
| getDefaults | method | 126 |
| workspaceDefaults | method | 129 |
| configureDefaults | method | 147 |
| saveDefaults | method | 152 |
| validateSelection | method | 200 |
| validateCompaction | method | 221 |
| listPresets | method | 239 |
| mutatePresets | method | 250 |
| savePreset | method | 271 |
| deletePreset | method | 286 |
| load | method | 295 |
| persist | method | 314 |
| list | method | 333 |
| rename | method | 345 |
| importSession | method | 354 |
| create | method | 382 |
| scheduleTaskNotifications | method | 552 |
| deliverTaskNotifications | method | 564 |
| get | method | 586 |
| revealWorkspace | method | 591 |
| browse | method | 605 |
| listFiles | method | 611 |
| refreshSkills | method | 670 |
| snapshot | method | 676 |
| subscribe | method | 704 |
| configure | method | 710 |
| prompt | method | 744 |
| withdraw | method | 794 |
| cancel | method | 809 |
| remove | method | 827 |
| close | method | 842 |

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
| repo | const | 6 |
| npmSpec | const | 7 |
| commitFile | const | 8 |
| validateCommit | function | 10 |
| checkUpdate | function | 15 |

### tests/app.test.js（1547 行） — node --test 测试（npm test）

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

### tests/message-activity.test.js（191 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 10 |
| restore | method | 34 |
| assistant | const | 38 |
| thought | const | 39 |
| call | const | 40 |
| entry | const | 41 |

### tests/presets.test.js（102 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| makeFactory | const | 10 |

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

### tests/session-created-at.test.js（44 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 8 |

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

### tests/update.test.js（38 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| old | const | 8 |

### tests/workspace-tabs.test.js（229 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| appSource | const | 9 |
| pickerSource | const | 10 |
| contrastSource | const | 11 |
| html | const | 12 |
| state | const | 14 |
| STATES | const | 19 |
| bootPage | function | 25 |
| attachCalls | const | 78 |

## L3 横切常量（跨模块定位入口）

- 协议 command.type：image、inherit、service.status、service.restart、session.rename、workspace.reveal、workspace.browse、files.browse、models.list、capabilities.list、session.defaults.get、session.defaults.configure、session.presets.list、session.presets.save、session.presets.delete、session.configure、sessions.list、session.create、session.import、session.attach、session.skills.refresh、session.close、prompt、cancel、queue.withdraw、tasks.read（src/protocol.js）
- HTML id：sidebar、open-workspace、new、custom-new、preset-list、import-session、search、sessions、open-settings、sidebar-backdrop、toggle-sidebar、session-title、workspace-label、copy-workspace、reveal-workspace、workspace-feedback、status、service-dev、service-version、service-menu-button、service-menu、restart-quick、restart-rebuild、restart-update、service-feedback、login、connect、workspace、transcript、output、latest、message-queue、task-runs、compaction-progress、add-context、add-image、image-files、context-chips、context-menu、context-picker、context-back、context-title、context-close、context-search、context-results、context-error、image-attachments、composer、prompt、prompt-completion、composer-skill、provider、model、thinking、stop、send-steer、send-followup、send、session-runtime、composer-help、error、session-action、session-action-form、session-action-title、session-action-description、session-name-label、session-name、session-action-error、session-action-cancel、session-action-submit、image-preview、image-preview-close、image-preview-image、restart-dialog、restart-form、restart-title、restart-description、restart-warning、restart-cancel、restart-submit、task-overlays、task-template、settings、settings-title、defaults-panel、selection-copy-title、selection-copy、selection-copy-help、selection-copy-feedback、queue-type、steer-help、followup-help、defaults-preview、subagent-title、subagent-help、subagent-provider、subagent-model、settings-feedback、defaults-title、defaults-editor、create-session、create-title、create-form、preset-fields、preset-name、preset-fixed-cwd、preset-directory、preset-delete、create-workspace、create-defaults-help、create-agents、create-compaction、create-trust-row、create-trust、create-feedback、create-submit（public/index.html）
- HTTP 静态路由：/、/favicon.svg、/style.css、/app.js、/file-picker.js、/tooltip.js、/tooltip.css、/text-contrast.js、/text-contrast.css、/file-picker.css、/markdown.js、/stream-renderer.js、/vendor/marked.js、/vendor/purify.js、/health（src/server.js）

## ⚠ 未登记文件（0）

（无）
