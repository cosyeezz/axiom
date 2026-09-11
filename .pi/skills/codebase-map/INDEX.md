<!-- 自动生成，勿手改。重建：node .pi/skills/codebase-map/scripts/reindex.mjs -->
# Axiom 多级代码索引（生成于 2026/9/10 20:32:23）

## L1 模块总览（文件 → 职责）

| 文件 | 行数 | 职责 | 关键符号 |
|---|---|---|---|
| public/app.js | 2072 | 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度 | filePicker, $, ws, allSessions |
| public/file-picker.css | 269 | 文件选择弹窗主题与响应式布局 | - |
| public/file-picker.js | 351 | 共享文件/目录选择弹窗、懒加载与分类 SVG 图标 | NS, SEARCH_DEBOUNCE, el, FOLDER_COLORS |
| public/index.html | 239 | 页面骨架与元素 id（见 L3） | - |
| public/markdown.js | 74 | marked + DOMPurify 渲染（XSS 边界） | cache, policy, renderMarkdown |
| public/stream-renderer.js | 46 | 流式增量渲染状态机 | createStreamRenderer |
| public/style.css | 1057 | 全局样式（CSP 禁 inline style，样式一律进这里） | - |
| scripts/autostart.mjs | 133 | Windows/macOS/Linux 当前用户登录自动启动安装/卸载 | run, projectDir, serviceEntry, label |
| scripts/install.mjs | 86 | 一键安装：装依赖/注册自启/启动守护/健康检查/打开浏览器 | root, parseArgs, nodeOk, openCommand |
| scripts/service.mjs | 100 | 服务守护：IPC 快速/重建重启与安装构建失败反馈 | root, output, run, rebuild |
| src/capabilities.js | 114 | 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities） | sdkEntry, resolver, alias, jiti |
| src/compaction.js | 351 | 后台独立摘要、token/占比阈值、快照校验与 turn 安全提交 | contextTokens, prepareBackgroundCompaction, DEFAULT_COMPACTION_CONFIG, normalizeCompaction |
| src/main.js | 59 | 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理 | port, cwd, factory, home |
| src/pi.js | 261 | createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档） | agentRuntime, queueStateOf, withdrawQueue, createPiFactory |
| src/protocol.js | 145 | zod 协议：selection / command 判别联合（消息类型见 L3） | id, capabilities, workspace, thinking |
| src/retry.js | 149 | 模型失败重试：可取消退避、最多30次、保留已有工具结果继续 | RETRY_DELAYS_MS, MAX_RETRIES, delayFor, MAX_TIMEOUT_MS |
| src/server.js | 208 | createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发 | assets, createServerApp |
| src/sessions.js | 618 | Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化 | BROWSE_PAGE, resolveDir, parentOf, absoluteCrumbs |
| src/tasks.js | 107 | Tasks：子任务（委托）生命周期 | Tasks |
| src/tools.js | 97 | delegationTools：委托/凭证读取/追加工具定义（zod 入参） | delegateInput, readInput, appendInput, result |
| src/update.js | 29 | 检查更新：本地版本比对 GitHub 公开仓库 master，npm 安装实例可自动重装 | repo, npmSpec, greater, checkUpdate |
| tests/app.test.js | 1307 | node --test 测试（npm test） | pickerSource |
| tests/autostart.test.js | 60 | node --test 测试（npm test） | node, cwd, service |
| tests/benchmark.js | 92 | node --test 测试（npm test） | window |
| tests/capabilities.test.js | 78 | node --test 测试（npm test） | - |
| tests/codebase-index.test.js | 20 | node --test 测试（npm test） | ROOT, SKILL |
| tests/compaction-config.test.js | 105 | node --test 测试（npm test） | - |
| tests/compaction.test.js | 737 | node --test 测试（npm test） | fakeModel, createTestSession, seq, userMsg |
| tests/config.test.js | 220 | node --test 测试（npm test） | - |
| tests/conversation-preview.mjs | 79 | node --test 测试（npm test） | markdown, message, thinking, state |
| tests/defaults.test.js | 33 | node --test 测试（npm test） | - |
| tests/file-picker.test.js | 67 | node --test 测试（npm test） | source, tick |
| tests/image-input.test.js | 167 | node --test 测试（npm test） | pngBase64, jpegBase64, image, parsePrompt |
| tests/install.test.js | 24 | node --test 测试（npm test） | - |
| tests/markdown.test.js | 68 | node --test 测试（npm test） | - |
| tests/message-activity.test.js | 155 | node --test 测试（npm test） | page, assistant, thought, call |
| tests/retry.test.js | 340 | node --test 测试（npm test） | RATE_LIMIT, QUOTA, ABORTED, fakeSession |
| tests/server.test.js | 125 | node --test 测试（npm test） | - |
| tests/service-api.test.js | 34 | node --test 测试（npm test） | - |
| tests/service.test.js | 81 | node --test 测试（npm test） | - |
| tests/session-flow.test.js | 128 | node --test 测试（npm test） | flowFactory |
| tests/smoke.js | 67 | node --test 测试（npm test） | TIMEOUT, sessions |
| tests/stream-renderer.test.js | 99 | node --test 测试（npm test） | - |
| tests/task-notifications.test.js | 129 | node --test 测试（npm test） | factoryFixture, tick, until |
| tests/tasks.test.js | 76 | node --test 测试（npm test） | fixture |
| tests/update.test.js | 20 | node --test 测试（npm test） | - |
| tests/workspace-picker.test.js | 96 | node --test 测试（npm test） | - |

## L2 符号 → 行号（跳转：read <文件> offset=<行>）

### public/app.js（2072 行） — 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度

| 符号 | 类型 | 行 |
|---|---|---|
| filePicker | const | 4 |
| $ | const | 5 |
| ws | const | 6 |
| allSessions | const | 18 |
| views | const | 20 |
| compactionDefaults | const | 21 |
| thinkingLevels | const | 22 |
| compactions | const | 23 |
| images | const | 24 |
| completionVersion | const | 25 |
| selectedSkill | const | 26 |
| hiddenSessions | const | 30 |
| sessionOrder | const | 35 |
| setSessionHidden | function | 40 |
| renderSessions | method | 45 |
| draggedSession | const | 48 |
| saveView | function | 67 |
| resizePrompt | function | 78 |
| scrollFrame | const | 82 |
| scrollLatest | function | 83 |
| renderer | const | 93 |
| scrollLatest | method | 102 |
| mobile | const | 104 |
| sidebar | function | 105 |
| sidebar | method | 115 |
| pending | const | 119 |
| error | function | 122 |
| request | function | 125 |
| controls | function | 134 |
| renderContextChips | method | 154 |
| options | function | 168 |
| fillModels | function | 175 |
| options | method | 176 |
| fillSubagentModels | function | 184 |
| options | method | 186 |
| capabilityName | function | 194 |
| runtimeSummary | function | 204 |
| renderRuntime | function | 217 |
| updateTaskRuntime | function | 225 |
| renderRuntime | method | 227 |
| applyConfig | function | 230 |
| options | method | 232 |
| renderRuntime | method | 238 |
| options | method | 239 |
| fillSubagentModels | method | 244 |
| fillModels | method | 246 |
| options | method | 247 |
| configure | function | 253 |
| controls | method | 256 |
| controls | method | 279 |
| openCreation | method | 281 |
| messageItems | const | 289 |
| activityPaths | const | 291 |
| setActivityIcon | function | 306 |
| disclosureHint | function | 316 |
| activityLine | function | 327 |
| setActivity | method | 337 |
| setActivity | function | 340 |
| setActivityIcon | method | 342 |
| waiting | function | 345 |
| scrollLatest | method | 351 |
| clearWaiting | function | 353 |
| stopActivity | function | 357 |
| clearWaiting | method | 358 |
| updateActivity | function | 367 |
| setActivity | method | 375 |
| setActivity | method | 376 |
| mergeThoughts | function | 380 |
| diffView | const | 397 |
| renderToolDetail | function | 402 |
| section | method | 483 |
| toolState | function | 485 |
| clearWaiting | method | 487 |
| setActivity | method | 531 |
| renderToolDetail | method | 532 |
| scrollLatest | method | 533 |
| card | function | 535 |
| renderMessage | function | 586 |
| updateActivity | method | 647 |
| compactionCard | function | 650 |
| renderMarkdown | method | 664 |
| foldCompaction | function | 667 |
| mergeThoughts | method | 681 |
| compactionEditor | function | 685 |
| options | method | 721 |
| fillThinking | method | 749 |
| renderTaskRuns | function | 757 |
| renderQueue | function | 774 |
| retryCards | const | 791 |
| retryFailures | const | 792 |
| renderRetry | function | 793 |
| scrollLatest | method | 830 |
| event | function | 832 |
| snapshot | function | 974 |
| clearTimeout | method | 975 |
| renderTaskRuns | method | 996 |
| mergeThoughts | method | 1055 |
| renderImages | method | 1077 |
| closeCompletion | method | 1080 |
| renderQueue | method | 1091 |
| applyConfig | method | 1093 |
| controls | method | 1095 |
| reconnectTimer | const | 1097 |
| clearTimeout | method | 1101 |
| controls | method | 1104 |
| scheduleReconnect | function | 1186 |
| clearTimeout | method | 1187 |
| restartNames | const | 1191 |
| restartDescriptions | const | 1192 |
| controls | method | 1214 |
| fillModels | method | 1226 |
| fillSubagentModels | method | 1233 |
| closeCompletion | method | 1250 |
| controls | method | 1255 |
| scrollLatest | method | 1260 |
| enableImagePreview | function | 1292 |
| renderImages | function | 1313 |
| addImages | function | 1338 |
| loadImages | function | 1359 |
| renderImages | method | 1368 |
| escapeTimer | const | 1422 |
| withdrawQueue | function | 1423 |
| refreshing | const | 1479 |
| refreshSessions | function | 1480 |
| updateSessions | function | 1487 |
| renderSessions | method | 1491 |
| switchSession | function | 1493 |
| saveView | method | 1495 |
| controls | method | 1498 |
| renderSessions | function | 1510 |
| sessionAction | const | 1630 |
| openSessionAction | function | 1631 |
| contextIcon | function | 1672 |
| renderContextChips | function | 1675 |
| renderContextResults | function | 1693 |
| controls | method | 1725 |
| resizePrompt | method | 1731 |
| controls | method | 1732 |
| closeCompletion | function | 1735 |
| highlightCompletion | function | 1743 |
| chooseCompletion | function | 1752 |
| closeCompletion | method | 1762 |
| updateCompletion | function | 1765 |
| closeCompletion | method | 1766 |
| resizePrompt | method | 1819 |
| controls | method | 1820 |
| switchSession | method | 1860 |
| creationLoad | const | 1862 |
| createAgentPicker | function | 1863 |
| options | method | 1885 |
| fill | method | 1893 |
| fillThinking | method | 1901 |
| options | method | 1903 |
| loadCreation | function | 1949 |
| openCreation | function | 1983 |
| updateDefaultsPreview | function | 2000 |
| updateDefaultsPreview | method | 2020 |

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

### public/markdown.js（74 行） — marked + DOMPurify 渲染（XSS 边界）

| 符号 | 类型 | 行 |
|---|---|---|
| cache | const | 4 |
| policy | const | 5 |
| renderMarkdown | function | 11 |

### public/stream-renderer.js（46 行） — 流式增量渲染状态机

| 符号 | 类型 | 行 |
|---|---|---|
| createStreamRenderer | function | 2 |

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

### scripts/service.mjs（100 行） — 服务守护：IPC 快速/重建重启与安装构建失败反馈

| 符号 | 类型 | 行 |
|---|---|---|
| root | const | 8 |
| output | const | 9 |
| run | function | 10 |
| rebuild | function | 17 |
| supervise | function | 36 |
| mkdirSync | method | 40 |
| start | method | 97 |

### src/capabilities.js（114 行） — 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities）

| 符号 | 类型 | 行 |
|---|---|---|
| sdkEntry | const | 11 |
| resolver | const | 12 |
| alias | const | 13 |
| jiti | const | 20 |
| snapshotSettings | function | 22 |
| discoverCapabilities | function | 35 |
| resolveCapabilities | function | 71 |
| capabilityLoader | function | 83 |

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

### src/main.js（59 行） — 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理

| 符号 | 类型 | 行 |
|---|---|---|
| port | const | 12 |
| cwd | const | 15 |
| factory | const | 18 |
| home | const | 19 |
| sessions | const | 26 |
| app | const | 29 |
| closing | const | 47 |
| stop | function | 48 |

### src/pi.js（261 行） — createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档）

| 符号 | 类型 | 行 |
|---|---|---|
| agentRuntime | function | 12 |
| queueStateOf | function | 28 |
| withdrawQueue | function | 47 |
| createPiFactory | function | 53 |

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

### src/server.js（208 行） — createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发

| 符号 | 类型 | 行 |
|---|---|---|
| assets | const | 7 |
| createServerApp | function | 26 |

### src/sessions.js（618 行） — Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化

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
| validateCompaction | method | 134 |
| load | method | 146 |
| persist | method | 159 |
| list | method | 178 |
| rename | method | 189 |
| create | method | 197 |
| scheduleTaskNotifications | method | 349 |
| deliverTaskNotifications | method | 361 |
| get | method | 383 |
| revealWorkspace | method | 388 |
| browse | method | 402 |
| listFiles | method | 408 |
| snapshot | method | 466 |
| subscribe | method | 493 |
| configure | method | 499 |
| prompt | method | 533 |
| cancel | method | 581 |
| remove | method | 599 |
| close | method | 614 |

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

### src/update.js（29 行） — 检查更新：本地版本比对 GitHub 公开仓库 master，npm 安装实例可自动重装

| 符号 | 类型 | 行 |
|---|---|---|
| repo | const | 7 |
| npmSpec | const | 8 |
| greater | const | 10 |
| checkUpdate | function | 17 |

### tests/app.test.js（1307 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| pickerSource | const | 9 |

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

### tests/conversation-preview.mjs（79 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| markdown | const | 4 |
| message | const | 21 |
| thinking | const | 26 |
| state | const | 38 |
| sequence | const | 45 |
| add | const | 46 |
| assistant | const | 47 |
| add | method | 58 |
| add | method | 59 |
| states | const | 63 |
| sessions | const | 70 |
| app | const | 77 |

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

### tests/message-activity.test.js（155 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 10 |
| restore | method | 33 |
| assistant | const | 37 |
| thought | const | 38 |
| call | const | 39 |
| entry | const | 40 |

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

## L3 横切常量（跨模块定位入口）

- 协议 command.type：image、inherit、service.status、service.restart、session.rename、workspace.reveal、workspace.browse、files.browse、models.list、capabilities.list、session.defaults.get、session.defaults.configure、session.configure、sessions.list、session.create、session.attach、session.close、prompt、cancel、queue.withdraw、tasks.read（src/protocol.js）
- HTML id：sidebar、open-workspace、new、custom-new、search、sessions、hidden-session-area、hidden-session-summary、hidden-sessions、open-settings、sidebar-backdrop、toggle-sidebar、session-title、workspace-label、copy-workspace、reveal-workspace、workspace-feedback、status、service-menu-button、service-menu、restart-quick、restart-rebuild、restart-update、service-feedback、login、connect、workspace、transcript、output、latest、message-queue、task-runs、add-context、add-image、image-files、context-chips、context-menu、context-picker、context-title、context-close、context-search、context-results、context-error、image-attachments、composer、prompt、prompt-completion、composer-skill、provider、model、thinking、stop、send-steer、send-followup、send、session-runtime、composer-help、error、session-action、session-action-form、session-action-title、session-action-description、session-name-label、session-name、session-action-error、session-action-cancel、session-action-submit、image-preview、image-preview-close、image-preview-image、restart-dialog、restart-form、restart-title、restart-description、restart-warning、restart-cancel、restart-submit、task-overlays、task-template、settings、settings-title、defaults-panel、queue-type、steer-help、followup-help、defaults-preview、subagent-title、subagent-help、subagent-provider、subagent-model、settings-feedback、defaults-title、defaults-editor、create-session、create-title、create-form、create-workspace、create-defaults-help、create-agents、create-compaction、create-trust-row、create-trust、create-feedback、create-submit（public/index.html）
- HTTP 静态路由：/、/favicon.svg、/style.css、/app.js、/file-picker.js、/file-picker.css、/markdown.js、/stream-renderer.js、/vendor/marked.js、/vendor/purify.js、/health（src/server.js）

## ⚠ 未登记文件（0）

（无）
