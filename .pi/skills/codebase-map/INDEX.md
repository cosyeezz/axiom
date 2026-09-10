<!-- 自动生成，勿手改。重建：node .pi/skills/codebase-map/scripts/reindex.mjs -->
# Axiom 多级代码索引（生成于 2026/9/10 11:07:26）

## L1 模块总览（文件 → 职责）

| 文件 | 行数 | 职责 | 关键符号 |
|---|---|---|---|
| public/app.js | 1605 | 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度 | filePicker, $, ws, allSessions |
| public/file-picker.css | 269 | 文件选择弹窗主题与响应式布局 | - |
| public/file-picker.js | 351 | 共享文件/目录选择弹窗、懒加载与分类 SVG 图标 | NS, SEARCH_DEBOUNCE, el, FOLDER_COLORS |
| public/index.html | 237 | 页面骨架与元素 id（见 L3） | - |
| public/markdown.js | 37 | marked + DOMPurify 渲染（XSS 边界） | cache, policy, renderMarkdown |
| public/stream-renderer.js | 51 | 流式增量渲染状态机 | createStreamRenderer |
| public/style.css | 943 | 全局样式（CSP 禁 inline style，样式一律进这里） | - |
| scripts/autostart.mjs | 133 | Windows/macOS/Linux 当前用户登录自动启动安装/卸载 | run, projectDir, serviceEntry, label |
| scripts/service.mjs | 96 | 服务守护：IPC 快速/重建重启与安装构建失败反馈 | root, output, run, rebuild |
| src/capabilities.js | 114 | 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities） | sdkEntry, resolver, alias, jiti |
| src/compaction.js | 351 | 后台独立摘要、token/占比阈值、快照校验与 turn 安全提交 | contextTokens, prepareBackgroundCompaction, DEFAULT_COMPACTION_CONFIG, normalizeCompaction |
| src/main.js | 48 | 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理 | port, cwd, factory, home |
| src/pi.js | 252 | createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档） | agentRuntime, queueStateOf, withdrawQueue, createPiFactory |
| src/protocol.js | 145 | zod 协议：selection / command 判别联合（消息类型见 L3） | id, capabilities, workspace, thinking |
| src/server.js | 210 | createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发 | assets, createServerApp |
| src/sessions.js | 555 | Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化 | BROWSE_PAGE, resolveDir, parentOf, absoluteCrumbs |
| src/tasks.js | 108 | Tasks：子任务（委托）生命周期 | Tasks |
| src/tools.js | 73 | delegationTools：注册给 pi 的委托/读取工具定义（zod 入参） | delegateInput, readInput, result, delegationTools |
| tests/app.test.js | 1204 | node --test 测试（npm test） | pickerSource |
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
| tests/markdown.test.js | 55 | node --test 测试（npm test） | - |
| tests/server.test.js | 125 | node --test 测试（npm test） | - |
| tests/service-api.test.js | 34 | node --test 测试（npm test） | - |
| tests/service.test.js | 81 | node --test 测试（npm test） | - |
| tests/session-flow.test.js | 122 | node --test 测试（npm test） | flowFactory |
| tests/smoke.js | 29 | node --test 测试（npm test） | sessions |
| tests/stream-renderer.test.js | 91 | node --test 测试（npm test） | - |
| tests/tasks.test.js | 87 | node --test 测试（npm test） | fixture |
| tests/workspace-picker.test.js | 96 | node --test 测试（npm test） | - |

## L2 符号 → 行号（跳转：read <文件> offset=<行>）

### public/app.js（1605 行） — 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度

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
| setSessionHidden | function | 35 |
| renderSessions | method | 40 |
| draggedSession | const | 43 |
| saveView | function | 62 |
| resizePrompt | function | 73 |
| scrollFrame | const | 77 |
| scrollLatest | function | 78 |
| renderer | const | 88 |
| scrollLatest | method | 97 |
| mobile | const | 99 |
| sidebar | function | 100 |
| sidebar | method | 110 |
| pending | const | 114 |
| error | function | 117 |
| request | function | 120 |
| controls | function | 129 |
| renderContextChips | method | 149 |
| options | function | 163 |
| fillModels | function | 170 |
| options | method | 171 |
| fillSubagentModels | function | 179 |
| options | method | 181 |
| capabilityName | function | 189 |
| runtimeSummary | function | 199 |
| renderRuntime | function | 212 |
| updateTaskRuntime | function | 220 |
| renderRuntime | method | 222 |
| applyConfig | function | 225 |
| options | method | 227 |
| renderRuntime | method | 233 |
| options | method | 234 |
| fillSubagentModels | method | 239 |
| fillModels | method | 241 |
| options | method | 242 |
| configure | function | 248 |
| controls | method | 251 |
| controls | method | 274 |
| openCreation | method | 276 |
| card | function | 284 |
| renderMessage | function | 323 |
| compactionCard | function | 376 |
| renderMarkdown | method | 390 |
| foldCompaction | function | 393 |
| compactionEditor | function | 410 |
| options | method | 446 |
| fillThinking | method | 474 |
| renderQueue | function | 481 |
| event | function | 498 |
| snapshot | function | 606 |
| clearTimeout | method | 607 |
| renderImages | method | 680 |
| closeCompletion | method | 683 |
| renderQueue | method | 694 |
| applyConfig | method | 696 |
| controls | method | 698 |
| reconnectTimer | const | 700 |
| clearTimeout | method | 704 |
| controls | method | 707 |
| scheduleReconnect | function | 788 |
| clearTimeout | method | 789 |
| controls | method | 812 |
| fillModels | method | 824 |
| fillSubagentModels | method | 831 |
| closeCompletion | method | 848 |
| controls | method | 853 |
| scrollLatest | method | 858 |
| enableImagePreview | function | 890 |
| renderImages | function | 911 |
| addImages | function | 928 |
| loadImages | function | 949 |
| controls | method | 952 |
| escapeTimer | const | 994 |
| withdrawQueue | function | 995 |
| refreshing | const | 1045 |
| refreshSessions | function | 1046 |
| updateSessions | function | 1053 |
| renderSessions | method | 1057 |
| switchSession | function | 1059 |
| saveView | method | 1061 |
| controls | method | 1064 |
| renderSessions | function | 1076 |
| sessionAction | const | 1163 |
| openSessionAction | function | 1164 |
| contextIcon | function | 1205 |
| renderContextChips | function | 1208 |
| renderContextResults | function | 1226 |
| controls | method | 1258 |
| resizePrompt | method | 1264 |
| controls | method | 1265 |
| closeCompletion | function | 1268 |
| highlightCompletion | function | 1276 |
| chooseCompletion | function | 1285 |
| closeCompletion | method | 1295 |
| updateCompletion | function | 1298 |
| closeCompletion | method | 1299 |
| resizePrompt | method | 1352 |
| controls | method | 1353 |
| switchSession | method | 1393 |
| creationLoad | const | 1395 |
| createAgentPicker | function | 1396 |
| options | method | 1418 |
| fill | method | 1426 |
| fillThinking | method | 1434 |
| options | method | 1436 |
| loadCreation | function | 1482 |
| openCreation | function | 1516 |
| updateDefaultsPreview | function | 1533 |
| updateDefaultsPreview | method | 1553 |

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

### src/pi.js（252 行） — createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档）

| 符号 | 类型 | 行 |
|---|---|---|
| agentRuntime | function | 11 |
| queueStateOf | function | 27 |
| withdrawQueue | function | 46 |
| createPiFactory | function | 52 |

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

### src/server.js（210 行） — createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发

| 符号 | 类型 | 行 |
|---|---|---|
| assets | const | 7 |
| createServerApp | function | 26 |

### src/sessions.js（555 行） — Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化

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
| get | method | 327 |
| revealWorkspace | method | 332 |
| browse | method | 346 |
| listFiles | method | 352 |
| snapshot | method | 410 |
| subscribe | method | 436 |
| configure | method | 442 |
| prompt | method | 475 |
| cancel | method | 521 |
| remove | method | 538 |
| close | method | 551 |

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

### tests/app.test.js（1204 行） — node --test 测试（npm test）

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

### tests/session-flow.test.js（122 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| flowFactory | const | 60 |

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
