<!-- 自动生成，勿手改。重建：node .pi/skills/codebase-map/scripts/reindex.mjs -->
# Axiom 多级代码索引（生成于 2026/9/10 11:33:34）

## L1 模块总览（文件 → 职责）

| 文件 | 行数 | 职责 | 关键符号 |
|---|---|---|---|
| public/app.js | 1719 | 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度 | filePicker, $, ws, allSessions |
| public/file-picker.css | 269 | 文件选择弹窗主题与响应式布局 | - |
| public/file-picker.js | 351 | 共享文件/目录选择弹窗、懒加载与分类 SVG 图标 | NS, SEARCH_DEBOUNCE, el, FOLDER_COLORS |
| public/index.html | 237 | 页面骨架与元素 id（见 L3） | - |
| public/markdown.js | 37 | marked + DOMPurify 渲染（XSS 边界） | cache, policy, renderMarkdown |
| public/stream-renderer.js | 51 | 流式增量渲染状态机 | createStreamRenderer |
| public/style.css | 948 | 全局样式（CSP 禁 inline style，样式一律进这里） | - |
| scripts/autostart.mjs | 133 | Windows/macOS/Linux 当前用户登录自动启动安装/卸载 | run, projectDir, serviceEntry, label |
| scripts/install.mjs | 84 | 一键安装：装依赖/注册自启/启动守护/健康检查/打开浏览器 | root, parseArgs, nodeOk, openCommand |
| scripts/service.mjs | 96 | 服务守护：IPC 快速/重建重启与安装构建失败反馈 | root, output, run, rebuild |
| src/capabilities.js | 114 | 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities） | sdkEntry, resolver, alias, jiti |
| src/compaction.js | 351 | 后台独立摘要、token/占比阈值、快照校验与 turn 安全提交 | contextTokens, prepareBackgroundCompaction, DEFAULT_COMPACTION_CONFIG, normalizeCompaction |
| src/main.js | 48 | 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理 | port, cwd, factory, home |
| src/pi.js | 261 | createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档） | agentRuntime, queueStateOf, withdrawQueue, createPiFactory |
| src/protocol.js | 145 | zod 协议：selection / command 判别联合（消息类型见 L3） | id, capabilities, workspace, thinking |
| src/retry.js | 149 | 模型失败重试：可取消退避、最多30次、保留已有工具结果继续 | RETRY_DELAYS_MS, MAX_RETRIES, delayFor, MAX_TIMEOUT_MS |
| src/server.js | 210 | createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发 | assets, createServerApp |
| src/sessions.js | 568 | Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化 | BROWSE_PAGE, resolveDir, parentOf, absoluteCrumbs |
| src/tasks.js | 108 | Tasks：子任务（委托）生命周期 | Tasks |
| src/tools.js | 73 | delegationTools：注册给 pi 的委托/读取工具定义（zod 入参） | delegateInput, readInput, result, delegationTools |
| tests/app.test.js | 1274 | node --test 测试（npm test） | pickerSource |
| tests/autostart.test.js | 60 | node --test 测试（npm test） | node, cwd, service |
| tests/benchmark.js | 92 | node --test 测试（npm test） | window |
| tests/capabilities.test.js | 78 | node --test 测试（npm test） | - |
| tests/codebase-index.test.js | 20 | node --test 测试（npm test） | ROOT, SKILL |
| tests/compaction-config.test.js | 105 | node --test 测试（npm test） | - |
| tests/compaction.test.js | 737 | node --test 测试（npm test） | fakeModel, createTestSession, seq, userMsg |
| tests/config.test.js | 215 | node --test 测试（npm test） | - |
| tests/defaults.test.js | 33 | node --test 测试（npm test） | - |
| tests/file-picker.test.js | 67 | node --test 测试（npm test） | source, tick |
| tests/image-input.test.js | 167 | node --test 测试（npm test） | pngBase64, jpegBase64, image, parsePrompt |
| tests/install.test.js | 24 | node --test 测试（npm test） | - |
| tests/markdown.test.js | 55 | node --test 测试（npm test） | - |
| tests/retry.test.js | 340 | node --test 测试（npm test） | RATE_LIMIT, QUOTA, ABORTED, fakeSession |
| tests/server.test.js | 125 | node --test 测试（npm test） | - |
| tests/service-api.test.js | 34 | node --test 测试（npm test） | - |
| tests/service.test.js | 81 | node --test 测试（npm test） | - |
| tests/session-flow.test.js | 128 | node --test 测试（npm test） | flowFactory |
| tests/smoke.js | 29 | node --test 测试（npm test） | sessions |
| tests/stream-renderer.test.js | 91 | node --test 测试（npm test） | - |
| tests/tasks.test.js | 87 | node --test 测试（npm test） | fixture |
| tests/workspace-picker.test.js | 96 | node --test 测试（npm test） | - |

## L2 符号 → 行号（跳转：read <文件> offset=<行>）

### public/app.js（1719 行） — 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度

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
| card | function | 289 |
| renderMessage | function | 328 |
| compactionCard | function | 381 |
| renderMarkdown | method | 395 |
| foldCompaction | function | 398 |
| compactionEditor | function | 415 |
| options | method | 451 |
| fillThinking | method | 479 |
| renderQueue | function | 486 |
| retryCards | const | 503 |
| retryFailures | const | 504 |
| renderRetry | function | 505 |
| scrollLatest | method | 540 |
| event | function | 542 |
| snapshot | function | 652 |
| clearTimeout | method | 653 |
| renderImages | method | 729 |
| closeCompletion | method | 732 |
| renderQueue | method | 743 |
| applyConfig | method | 745 |
| controls | method | 747 |
| reconnectTimer | const | 749 |
| clearTimeout | method | 753 |
| controls | method | 756 |
| scheduleReconnect | function | 837 |
| clearTimeout | method | 838 |
| controls | method | 861 |
| fillModels | method | 873 |
| fillSubagentModels | method | 880 |
| closeCompletion | method | 897 |
| controls | method | 902 |
| scrollLatest | method | 907 |
| enableImagePreview | function | 939 |
| renderImages | function | 960 |
| addImages | function | 985 |
| loadImages | function | 1006 |
| renderImages | method | 1015 |
| escapeTimer | const | 1069 |
| withdrawQueue | function | 1070 |
| refreshing | const | 1126 |
| refreshSessions | function | 1127 |
| updateSessions | function | 1134 |
| renderSessions | method | 1138 |
| switchSession | function | 1140 |
| saveView | method | 1142 |
| controls | method | 1145 |
| renderSessions | function | 1157 |
| sessionAction | const | 1277 |
| openSessionAction | function | 1278 |
| contextIcon | function | 1319 |
| renderContextChips | function | 1322 |
| renderContextResults | function | 1340 |
| controls | method | 1372 |
| resizePrompt | method | 1378 |
| controls | method | 1379 |
| closeCompletion | function | 1382 |
| highlightCompletion | function | 1390 |
| chooseCompletion | function | 1399 |
| closeCompletion | method | 1409 |
| updateCompletion | function | 1412 |
| closeCompletion | method | 1413 |
| resizePrompt | method | 1466 |
| controls | method | 1467 |
| switchSession | method | 1507 |
| creationLoad | const | 1509 |
| createAgentPicker | function | 1510 |
| options | method | 1532 |
| fill | method | 1540 |
| fillThinking | method | 1548 |
| options | method | 1550 |
| loadCreation | function | 1596 |
| openCreation | function | 1630 |
| updateDefaultsPreview | function | 1647 |
| updateDefaultsPreview | method | 1667 |

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

### public/markdown.js（37 行） — marked + DOMPurify 渲染（XSS 边界）

| 符号 | 类型 | 行 |
|---|---|---|
| cache | const | 4 |
| policy | const | 5 |
| renderMarkdown | function | 11 |

### public/stream-renderer.js（51 行） — 流式增量渲染状态机

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

### scripts/install.mjs（84 行） — 一键安装：装依赖/注册自启/启动守护/健康检查/打开浏览器

| 符号 | 类型 | 行 |
|---|---|---|
| root | const | 14 |
| parseArgs | const | 16 |
| nodeOk | const | 26 |
| openCommand | const | 31 |
| probe | const | 37 |
| ask | const | 45 |
| install | function | 47 |

### scripts/service.mjs（96 行） — 服务守护：IPC 快速/重建重启与安装构建失败反馈

| 符号 | 类型 | 行 |
|---|---|---|
| root | const | 8 |
| output | const | 9 |
| run | function | 10 |
| rebuild | function | 17 |
| supervise | function | 36 |
| mkdirSync | method | 40 |
| start | method | 93 |

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

### src/main.js（48 行） — 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理

| 符号 | 类型 | 行 |
|---|---|---|
| port | const | 10 |
| cwd | const | 13 |
| factory | const | 16 |
| home | const | 17 |
| sessions | const | 24 |
| app | const | 27 |
| closing | const | 36 |
| stop | function | 37 |

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

### src/server.js（210 行） — createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发

| 符号 | 类型 | 行 |
|---|---|---|
| assets | const | 7 |
| createServerApp | function | 26 |

### src/sessions.js（568 行） — Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化

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
| get | method | 339 |
| revealWorkspace | method | 344 |
| browse | method | 358 |
| listFiles | method | 364 |
| snapshot | method | 422 |
| subscribe | method | 449 |
| configure | method | 455 |
| prompt | method | 488 |
| cancel | method | 534 |
| remove | method | 551 |
| close | method | 564 |

### src/tasks.js（108 行） — Tasks：子任务（委托）生命周期

| 符号 | 类型 | 行 |
|---|---|---|
| Tasks | class | 3 |
| constructor | method | 4 |
| start | method | 10 |
| publish | method | 21 |
| view | method | 24 |
| snapshot | method | 27 |
| run | method | 31 |
| read | method | 70 |
| cancel | method | 94 |

### src/tools.js（73 行） — delegationTools：注册给 pi 的委托/读取工具定义（zod 入参）

| 符号 | 类型 | 行 |
|---|---|---|
| delegateInput | const | 3 |
| readInput | const | 10 |
| result | const | 16 |
| delegationTools | function | 20 |

### tests/app.test.js（1274 行） — node --test 测试（npm test）

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

### tests/smoke.js（29 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| sessions | const | 5 |
| assert | method | 17 |
| assert | method | 21 |
| assert | method | 22 |

### tests/tasks.test.js（87 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| fixture | function | 6 |
| assert | method | 67 |
| assert | method | 85 |

## L3 横切常量（跨模块定位入口）

- 协议 command.type：image、inherit、service.status、service.restart、session.rename、workspace.reveal、workspace.browse、files.browse、models.list、capabilities.list、session.defaults.get、session.defaults.configure、session.configure、sessions.list、session.create、session.attach、session.close、prompt、cancel、queue.withdraw、tasks.read（src/protocol.js）
- HTML id：sidebar、open-workspace、new、custom-new、search、sessions、hidden-session-area、hidden-session-summary、hidden-sessions、open-settings、sidebar-backdrop、toggle-sidebar、session-title、workspace-label、copy-workspace、reveal-workspace、workspace-feedback、status、service-menu-button、service-menu、restart-quick、restart-rebuild、service-feedback、login、connect、workspace、transcript、output、latest、message-queue、add-context、add-image、image-files、context-chips、context-menu、context-picker、context-title、context-close、context-search、context-results、context-error、image-attachments、composer、prompt、prompt-completion、composer-skill、provider、model、thinking、stop、send-steer、send-followup、send、session-runtime、composer-help、error、session-action、session-action-form、session-action-title、session-action-description、session-name-label、session-name、session-action-error、session-action-cancel、session-action-submit、image-preview、image-preview-close、image-preview-image、restart-dialog、restart-form、restart-title、restart-description、restart-warning、restart-cancel、restart-submit、task-overlays、task-template、settings、settings-title、defaults-panel、queue-type、steer-help、followup-help、defaults-preview、subagent-title、subagent-help、subagent-provider、subagent-model、settings-feedback、defaults-title、defaults-editor、create-session、create-title、create-form、create-workspace、create-defaults-help、create-agents、create-compaction、create-trust-row、create-trust、create-feedback、create-submit（public/index.html）
- HTTP 静态路由：/、/favicon.svg、/style.css、/app.js、/file-picker.js、/file-picker.css、/markdown.js、/stream-renderer.js、/vendor/marked.js、/vendor/purify.js、/health（src/server.js）

## ⚠ 未登记文件（0）

（无）
