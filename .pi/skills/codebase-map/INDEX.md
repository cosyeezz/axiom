<!-- 自动生成，勿手改。重建：node .pi/skills/codebase-map/scripts/reindex.mjs -->
# Axiom 多级代码索引（生成于 2026/9/10 06:00:54）

## L1 模块总览（文件 → 职责）

| 文件 | 行数 | 职责 | 关键符号 |
|---|---|---|---|
| public/app.js | 1479 | 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度 | $, ws, allSessions, views |
| public/index.html | 225 | 页面骨架与元素 id（见 L3） | - |
| public/markdown.js | 37 | marked + DOMPurify 渲染（XSS 边界） | cache, policy, renderMarkdown |
| public/stream-renderer.js | 51 | 流式增量渲染状态机 | createStreamRenderer |
| public/style.css | 918 | 全局样式（CSP 禁 inline style，样式一律进这里） | - |
| src/capabilities.js | 114 | 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities） | sdkEntry, resolver, alias, jiti |
| src/compaction.js | 351 | 后台独立摘要、token/占比阈值、快照校验与 turn 安全提交 | contextTokens, prepareBackgroundCompaction, DEFAULT_COMPACTION_CONFIG, normalizeCompaction |
| src/main.js | 38 | 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理 | port, cwd, factory, home |
| src/pi.js | 252 | createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档） | agentRuntime, queueStateOf, withdrawQueue, createPiFactory |
| src/protocol.js | 132 | zod 协议：selection / command 判别联合（消息类型见 L3） | id, capabilities, workspace, thinking |
| src/server.js | 194 | createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发 | assets, createServerApp |
| src/sessions.js | 450 | Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化 | Sessions |
| src/tasks.js | 108 | Tasks：子任务（委托）生命周期 | Tasks |
| src/tools.js | 73 | delegationTools：注册给 pi 的委托/读取工具定义（zod 入参） | delegateInput, readInput, result, delegationTools |
| tests/app.test.js | 1070 | node --test 测试（npm test） | - |
| tests/benchmark.js | 92 | node --test 测试（npm test） | window |
| tests/capabilities.test.js | 78 | node --test 测试（npm test） | - |
| tests/codebase-index.test.js | 20 | node --test 测试（npm test） | ROOT, SKILL |
| tests/compaction-config.test.js | 65 | node --test 测试（npm test） | - |
| tests/compaction.test.js | 737 | node --test 测试（npm test） | fakeModel, createTestSession, seq, userMsg |
| tests/config.test.js | 215 | node --test 测试（npm test） | - |
| tests/defaults.test.js | 33 | node --test 测试（npm test） | - |
| tests/image-input.test.js | 167 | node --test 测试（npm test） | pngBase64, jpegBase64, image, parsePrompt |
| tests/markdown.test.js | 55 | node --test 测试（npm test） | - |
| tests/server.test.js | 125 | node --test 测试（npm test） | - |
| tests/session-flow.test.js | 59 | node --test 测试（npm test） | - |
| tests/smoke.js | 29 | node --test 测试（npm test） | sessions |
| tests/stream-renderer.test.js | 91 | node --test 测试（npm test） | - |
| tests/tasks.test.js | 87 | node --test 测试（npm test） | fixture |

## L2 符号 → 行号（跳转：read <文件> offset=<行>）

### public/app.js（1479 行） — 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度

| 符号 | 类型 | 行 |
|---|---|---|
| $ | const | 3 |
| ws | const | 4 |
| allSessions | const | 14 |
| views | const | 16 |
| compactionDefaults | const | 17 |
| thinkingLevels | const | 18 |
| compactions | const | 19 |
| images | const | 20 |
| selectedSkill | const | 21 |
| saveView | function | 25 |
| resizePrompt | function | 36 |
| scrollFrame | const | 40 |
| scrollLatest | function | 41 |
| renderer | const | 51 |
| scrollLatest | method | 60 |
| mobile | const | 62 |
| sidebar | function | 63 |
| sidebar | method | 73 |
| pending | const | 77 |
| error | function | 80 |
| request | function | 83 |
| controls | function | 92 |
| renderContextChips | method | 115 |
| options | function | 127 |
| fillModels | function | 134 |
| options | method | 135 |
| fillSubagentModels | function | 143 |
| options | method | 145 |
| capabilityName | function | 153 |
| runtimeSummary | function | 163 |
| renderRuntime | function | 176 |
| updateTaskRuntime | function | 184 |
| renderRuntime | method | 186 |
| applyConfig | function | 189 |
| options | method | 191 |
| renderRuntime | method | 197 |
| options | method | 198 |
| fillSubagentModels | method | 203 |
| fillModels | method | 205 |
| options | method | 206 |
| configure | function | 212 |
| controls | method | 215 |
| controls | method | 243 |
| openCreation | method | 245 |
| card | function | 253 |
| renderMessage | function | 292 |
| compactionCard | function | 343 |
| renderMarkdown | method | 357 |
| foldCompaction | function | 360 |
| compactionEditor | function | 373 |
| options | method | 409 |
| fillThinking | method | 445 |
| commitCompaction | function | 453 |
| buildSessionCompaction | function | 460 |
| renderQueue | function | 466 |
| event | function | 483 |
| snapshot | function | 591 |
| clearTimeout | method | 592 |
| renderImages | method | 670 |
| renderQueue | method | 683 |
| applyConfig | method | 685 |
| buildSessionCompaction | method | 687 |
| controls | method | 688 |
| reconnectTimer | const | 690 |
| clearTimeout | method | 694 |
| controls | method | 697 |
| scheduleReconnect | function | 772 |
| clearTimeout | method | 773 |
| fillModels | method | 780 |
| fillSubagentModels | method | 788 |
| controls | method | 809 |
| scrollLatest | method | 814 |
| renderImages | function | 846 |
| addImages | function | 862 |
| loadImages | function | 883 |
| controls | method | 886 |
| controls | method | 908 |
| escapeTimer | const | 946 |
| withdrawQueue | function | 947 |
| refreshing | const | 997 |
| refreshSessions | function | 998 |
| updateSessions | function | 1005 |
| renderSessions | method | 1011 |
| switchSession | function | 1013 |
| saveView | method | 1015 |
| controls | method | 1018 |
| renderSessions | function | 1030 |
| sessionAction | const | 1096 |
| openSessionAction | function | 1097 |
| contextIcon | function | 1138 |
| renderContextChips | function | 1141 |
| renderContextResults | function | 1159 |
| selectContext | function | 1188 |
| browseContext | function | 1194 |
| resizePrompt | method | 1216 |
| controls | method | 1217 |
| resizePrompt | method | 1226 |
| controls | method | 1227 |
| switchSession | method | 1253 |
| creationLoad | const | 1255 |
| createAgentPicker | function | 1256 |
| options | method | 1278 |
| fill | method | 1286 |
| fillThinking | method | 1294 |
| options | method | 1296 |
| loadCreation | function | 1342 |
| openCreation | function | 1376 |
| updateDefaultsPreview | function | 1393 |
| updateDefaultsPreview | method | 1413 |

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

### src/main.js（38 行） — 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理

| 符号 | 类型 | 行 |
|---|---|---|
| port | const | 10 |
| cwd | const | 13 |
| factory | const | 16 |
| home | const | 17 |
| sessions | const | 24 |
| app | const | 27 |

### src/pi.js（252 行） — createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档）

| 符号 | 类型 | 行 |
|---|---|---|
| agentRuntime | function | 11 |
| queueStateOf | function | 27 |
| withdrawQueue | function | 46 |
| createPiFactory | function | 52 |

### src/protocol.js（132 行） — zod 协议：selection / command 判别联合（消息类型见 L3）

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

### src/server.js（194 行） — createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发

| 符号 | 类型 | 行 |
|---|---|---|
| assets | const | 7 |
| createServerApp | function | 24 |

### src/sessions.js（450 行） — Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化

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
| persist | method | 96 |
| list | method | 115 |
| rename | method | 126 |
| create | method | 134 |
| get | method | 264 |
| pickWorkspace | method | 269 |
| revealWorkspace | method | 280 |
| browse | method | 292 |
| snapshot | method | 305 |
| subscribe | method | 331 |
| configure | method | 337 |
| prompt | method | 370 |
| cancel | method | 416 |
| remove | method | 433 |
| close | method | 446 |

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

## L3 横切常量（跨模块定位入口）

- 协议 command.type：image、inherit、session.rename、workspace.pick、workspace.reveal、workspace.browse、models.list、capabilities.list、session.defaults.get、session.defaults.configure、session.configure、sessions.list、session.create、session.attach、session.close、prompt、cancel、queue.withdraw、tasks.read（src/protocol.js）
- HTML id：sidebar、workspace-picker、workspace-name、workspace-form、cwd、workspaces、open-workspace、new、custom-new、search、sessions、open-settings、sidebar-backdrop、toggle-sidebar、session-title、workspace-label、copy-workspace、reveal-workspace、workspace-feedback、status、login、connect、workspace、transcript、output、latest、message-queue、add-context、add-image、capture-screen、image-files、context-chips、context-menu、context-picker、context-title、context-close、context-search、context-path、context-results、context-error、image-attachments、composer、prompt、composer-skill、provider、model、thinking、stop、send-steer、send-followup、send、session-runtime、composer-help、error、session-action、session-action-form、session-action-title、session-action-description、session-name-label、session-name、session-action-error、session-action-cancel、session-action-submit、task-overlays、task-template、settings、settings-title、defaults-panel、queue-type、steer-help、followup-help、defaults-preview、subagent-title、subagent-help、subagent-provider、subagent-model、compaction-title、session-compaction、settings-feedback、defaults-title、defaults-editor、create-session、create-title、create-form、create-workspace、create-defaults-help、create-agents、create-compaction、create-trust-row、create-trust、create-feedback、create-submit（public/index.html）
- HTTP 静态路由：/、/favicon.svg、/style.css、/app.js、/markdown.js、/stream-renderer.js、/vendor/marked.js、/vendor/purify.js、/health（src/server.js）

## ⚠ 未登记文件（0）

（无）
