<!-- 自动生成，勿手改。重建：node .pi/skills/codebase-map/scripts/reindex.mjs -->
# Axiom 多级代码索引（生成于 2026/9/10 09:44:41）

## L1 模块总览（文件 → 职责）

| 文件 | 行数 | 职责 | 关键符号 |
|---|---|---|---|
| public/app.js | 1614 | 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度 | $, ws, allSessions, views |
| public/index.html | 236 | 页面骨架与元素 id（见 L3） | - |
| public/markdown.js | 37 | marked + DOMPurify 渲染（XSS 边界） | cache, policy, renderMarkdown |
| public/stream-renderer.js | 51 | 流式增量渲染状态机 | createStreamRenderer |
| public/style.css | 940 | 全局样式（CSP 禁 inline style，样式一律进这里） | - |
| scripts/autostart.mjs | 133 | Windows/macOS/Linux 当前用户登录自动启动安装/卸载 | run, projectDir, serviceEntry, label |
| scripts/service.mjs | 96 | 服务守护：IPC 快速/重建重启与安装构建失败反馈 | root, output, run, rebuild |
| src/capabilities.js | 114 | 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities） | sdkEntry, resolver, alias, jiti |
| src/compaction.js | 351 | 后台独立摘要、token/占比阈值、快照校验与 turn 安全提交 | contextTokens, prepareBackgroundCompaction, DEFAULT_COMPACTION_CONFIG, normalizeCompaction |
| src/main.js | 48 | 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理 | port, cwd, factory, home |
| src/pi.js | 252 | createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档） | agentRuntime, queueStateOf, withdrawQueue, createPiFactory |
| src/protocol.js | 134 | zod 协议：selection / command 判别联合（消息类型见 L3） | id, capabilities, workspace, thinking |
| src/server.js | 208 | createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发 | assets, createServerApp |
| src/sessions.js | 489 | Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化 | Sessions |
| src/tasks.js | 108 | Tasks：子任务（委托）生命周期 | Tasks |
| src/tools.js | 73 | delegationTools：注册给 pi 的委托/读取工具定义（zod 入参） | delegateInput, readInput, result, delegationTools |
| tests/app.test.js | 1178 | node --test 测试（npm test） | - |
| tests/autostart.test.js | 60 | node --test 测试（npm test） | node, cwd, service |
| tests/benchmark.js | 92 | node --test 测试（npm test） | window |
| tests/capabilities.test.js | 78 | node --test 测试（npm test） | - |
| tests/codebase-index.test.js | 20 | node --test 测试（npm test） | ROOT, SKILL |
| tests/compaction-config.test.js | 105 | node --test 测试（npm test） | - |
| tests/compaction.test.js | 737 | node --test 测试（npm test） | fakeModel, createTestSession, seq, userMsg |
| tests/config.test.js | 215 | node --test 测试（npm test） | - |
| tests/defaults.test.js | 33 | node --test 测试（npm test） | - |
| tests/image-input.test.js | 167 | node --test 测试（npm test） | pngBase64, jpegBase64, image, parsePrompt |
| tests/markdown.test.js | 55 | node --test 测试（npm test） | - |
| tests/server.test.js | 125 | node --test 测试（npm test） | - |
| tests/service-api.test.js | 34 | node --test 测试（npm test） | - |
| tests/service.test.js | 81 | node --test 测试（npm test） | - |
| tests/session-flow.test.js | 59 | node --test 测试（npm test） | - |
| tests/smoke.js | 29 | node --test 测试（npm test） | sessions |
| tests/stream-renderer.test.js | 91 | node --test 测试（npm test） | - |
| tests/tasks.test.js | 87 | node --test 测试（npm test） | fixture |
| tests/workspace-picker.test.js | 63 | node --test 测试（npm test） | - |

## L2 符号 → 行号（跳转：read <文件> offset=<行>）

### public/app.js（1614 行） — 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度

| 符号 | 类型 | 行 |
|---|---|---|
| $ | const | 3 |
| ws | const | 4 |
| allSessions | const | 16 |
| views | const | 18 |
| compactionDefaults | const | 19 |
| thinkingLevels | const | 20 |
| compactions | const | 21 |
| images | const | 22 |
| completionVersion | const | 23 |
| selectedSkill | const | 24 |
| hiddenSessions | const | 28 |
| setSessionHidden | function | 33 |
| renderSessions | method | 38 |
| draggedSession | const | 41 |
| saveView | function | 60 |
| resizePrompt | function | 71 |
| scrollFrame | const | 75 |
| scrollLatest | function | 76 |
| renderer | const | 86 |
| scrollLatest | method | 95 |
| mobile | const | 97 |
| sidebar | function | 98 |
| sidebar | method | 108 |
| pending | const | 112 |
| error | function | 115 |
| request | function | 118 |
| controls | function | 127 |
| renderContextChips | method | 147 |
| options | function | 161 |
| fillModels | function | 168 |
| options | method | 169 |
| fillSubagentModels | function | 177 |
| options | method | 179 |
| capabilityName | function | 187 |
| runtimeSummary | function | 197 |
| renderRuntime | function | 210 |
| updateTaskRuntime | function | 218 |
| renderRuntime | method | 220 |
| applyConfig | function | 223 |
| options | method | 225 |
| renderRuntime | method | 231 |
| options | method | 232 |
| fillSubagentModels | method | 237 |
| fillModels | method | 239 |
| options | method | 240 |
| configure | function | 246 |
| controls | method | 249 |
| controls | method | 272 |
| openCreation | method | 274 |
| card | function | 282 |
| renderMessage | function | 321 |
| compactionCard | function | 374 |
| renderMarkdown | method | 388 |
| foldCompaction | function | 391 |
| compactionEditor | function | 408 |
| options | method | 444 |
| fillThinking | method | 472 |
| renderQueue | function | 479 |
| event | function | 496 |
| snapshot | function | 604 |
| clearTimeout | method | 605 |
| renderImages | method | 678 |
| closeCompletion | method | 681 |
| renderQueue | method | 692 |
| applyConfig | method | 694 |
| controls | method | 696 |
| reconnectTimer | const | 698 |
| clearTimeout | method | 702 |
| controls | method | 705 |
| scheduleReconnect | function | 786 |
| clearTimeout | method | 787 |
| controls | method | 810 |
| fillModels | method | 822 |
| fillSubagentModels | method | 829 |
| closeCompletion | method | 846 |
| controls | method | 851 |
| scrollLatest | method | 856 |
| enableImagePreview | function | 888 |
| renderImages | function | 909 |
| addImages | function | 926 |
| loadImages | function | 947 |
| controls | method | 950 |
| escapeTimer | const | 992 |
| withdrawQueue | function | 993 |
| refreshing | const | 1043 |
| refreshSessions | function | 1044 |
| updateSessions | function | 1051 |
| renderSessions | method | 1055 |
| switchSession | function | 1057 |
| saveView | method | 1059 |
| controls | method | 1062 |
| renderSessions | function | 1074 |
| sessionAction | const | 1155 |
| openSessionAction | function | 1156 |
| contextIcon | function | 1197 |
| renderContextChips | function | 1200 |
| renderContextResults | function | 1218 |
| selectContext | function | 1247 |
| browseContext | function | 1253 |
| resizePrompt | method | 1275 |
| controls | method | 1276 |
| closeCompletion | function | 1279 |
| highlightCompletion | function | 1287 |
| chooseCompletion | function | 1296 |
| closeCompletion | method | 1306 |
| updateCompletion | function | 1309 |
| closeCompletion | method | 1310 |
| resizePrompt | method | 1363 |
| controls | method | 1364 |
| switchSession | method | 1402 |
| creationLoad | const | 1404 |
| createAgentPicker | function | 1405 |
| options | method | 1427 |
| fill | method | 1435 |
| fillThinking | method | 1443 |
| options | method | 1445 |
| loadCreation | function | 1491 |
| openCreation | function | 1525 |
| updateDefaultsPreview | function | 1542 |
| updateDefaultsPreview | method | 1562 |

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

### src/protocol.js（134 行） — zod 协议：selection / command 判别联合（消息类型见 L3）

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

### src/server.js（208 行） — createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发

| 符号 | 类型 | 行 |
|---|---|---|
| assets | const | 7 |
| createServerApp | function | 24 |

### src/sessions.js（489 行） — Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化

| 符号 | 类型 | 行 |
|---|---|---|
| Sessions | class | 11 |
| constructor | method | 12 |
| loadDefaults | method | 22 |
| getDefaults | method | 31 |
| configureDefaults | method | 34 |
| saveDefaults | method | 39 |
| validateSelection | method | 57 |
| validateCompaction | method | 73 |
| load | method | 85 |
| persist | method | 98 |
| list | method | 117 |
| rename | method | 128 |
| create | method | 136 |
| get | method | 266 |
| pickWorkspace | method | 271 |
| revealWorkspace | method | 319 |
| browse | method | 331 |
| snapshot | method | 344 |
| subscribe | method | 370 |
| configure | method | 376 |
| prompt | method | 409 |
| cancel | method | 455 |
| remove | method | 472 |
| close | method | 485 |

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

### tests/image-input.test.js（167 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| pngBase64 | const | 13 |
| jpegBase64 | const | 14 |
| image | const | 15 |
| parsePrompt | const | 17 |

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

### tests/workspace-picker.test.js（63 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| syncBuiltinESMExports | method | 32 |

## L3 横切常量（跨模块定位入口）

- 协议 command.type：image、inherit、service.status、service.restart、session.rename、workspace.pick、workspace.reveal、workspace.browse、models.list、capabilities.list、session.defaults.get、session.defaults.configure、session.configure、sessions.list、session.create、session.attach、session.close、prompt、cancel、queue.withdraw、tasks.read（src/protocol.js）
- HTML id：sidebar、open-workspace、new、custom-new、search、sessions、hidden-session-area、hidden-session-summary、hidden-sessions、open-settings、sidebar-backdrop、toggle-sidebar、session-title、workspace-label、copy-workspace、reveal-workspace、workspace-feedback、status、service-menu-button、service-menu、restart-quick、restart-rebuild、service-feedback、login、connect、workspace、transcript、output、latest、message-queue、add-context、add-image、image-files、context-chips、context-menu、context-picker、context-title、context-close、context-search、context-path、context-results、context-error、image-attachments、composer、prompt、prompt-completion、composer-skill、provider、model、thinking、stop、send-steer、send-followup、send、session-runtime、composer-help、error、session-action、session-action-form、session-action-title、session-action-description、session-name-label、session-name、session-action-error、session-action-cancel、session-action-submit、image-preview、image-preview-close、image-preview-image、restart-dialog、restart-form、restart-title、restart-description、restart-warning、restart-cancel、restart-submit、task-overlays、task-template、settings、settings-title、defaults-panel、queue-type、steer-help、followup-help、defaults-preview、subagent-title、subagent-help、subagent-provider、subagent-model、settings-feedback、defaults-title、defaults-editor、create-session、create-title、create-form、create-workspace、create-defaults-help、create-agents、create-compaction、create-trust-row、create-trust、create-feedback、create-submit（public/index.html）
- HTTP 静态路由：/、/favicon.svg、/style.css、/app.js、/markdown.js、/stream-renderer.js、/vendor/marked.js、/vendor/purify.js、/health（src/server.js）

## ⚠ 未登记文件（0）

（无）
