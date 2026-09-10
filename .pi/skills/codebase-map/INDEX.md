<!-- 自动生成，勿手改。重建：node .pi/skills/codebase-map/scripts/reindex.mjs -->
# Axiom 多级代码索引（生成于 2026/9/10 03:42:23）

## L1 模块总览（文件 → 职责）

| 文件 | 行数 | 职责 | 关键符号 |
|---|---|---|---|
| public/app.js | 1181 | 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度 | $, ws, allSessions, views |
| public/index.html | 215 | 页面骨架与元素 id（见 L3） | - |
| public/markdown.js | 37 | marked + DOMPurify 渲染（XSS 边界） | cache, policy, renderMarkdown |
| public/stream-renderer.js | 51 | 流式增量渲染状态机 | createStreamRenderer |
| public/style.css | 879 | 全局样式（CSP 禁 inline style，样式一律进这里） | - |
| src/capabilities.js | 114 | 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities） | sdkEntry, resolver, alias, jiti |
| src/main.js | 38 | 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理 | port, cwd, factory, home |
| src/pi.js | 169 | createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档） | agentRuntime, createPiFactory |
| src/protocol.js | 82 | zod 协议：selection / command 判别联合（消息类型见 L3） | id, capabilities, workspace, thinking |
| src/server.js | 191 | createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发 | assets, createServerApp |
| src/sessions.js | 405 | Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化 | Sessions |
| src/tasks.js | 108 | Tasks：子任务（委托）生命周期 | Tasks |
| src/tools.js | 73 | delegationTools：注册给 pi 的委托/读取工具定义（zod 入参） | delegateInput, readInput, result, delegationTools |
| tests/app.test.js | 675 | node --test 测试（npm test） | - |
| tests/benchmark.js | 92 | node --test 测试（npm test） | window |
| tests/capabilities.test.js | 78 | node --test 测试（npm test） | - |
| tests/codebase-index.test.js | 20 | node --test 测试（npm test） | ROOT, SKILL |
| tests/config.test.js | 214 | node --test 测试（npm test） | - |
| tests/defaults.test.js | 33 | node --test 测试（npm test） | - |
| tests/markdown.test.js | 55 | node --test 测试（npm test） | - |
| tests/server.test.js | 125 | node --test 测试（npm test） | - |
| tests/session-flow.test.js | 59 | node --test 测试（npm test） | - |
| tests/smoke.js | 29 | node --test 测试（npm test） | sessions |
| tests/stream-renderer.test.js | 91 | node --test 测试（npm test） | - |
| tests/tasks.test.js | 87 | node --test 测试（npm test） | fixture |

## L2 符号 → 行号（跳转：read <文件> offset=<行>）

### public/app.js（1181 行） — 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度

| 符号 | 类型 | 行 |
|---|---|---|
| $ | const | 3 |
| ws | const | 4 |
| allSessions | const | 14 |
| views | const | 16 |
| selectedSkill | const | 17 |
| saveView | function | 21 |
| resizePrompt | function | 31 |
| scrollFrame | const | 35 |
| scrollLatest | function | 36 |
| renderer | const | 46 |
| scrollLatest | method | 55 |
| mobile | const | 57 |
| sidebar | function | 58 |
| sidebar | method | 68 |
| pending | const | 72 |
| error | function | 75 |
| request | function | 78 |
| controls | function | 87 |
| renderContextChips | method | 105 |
| options | function | 117 |
| fillModels | function | 124 |
| options | method | 125 |
| fillSubagentModels | function | 133 |
| options | method | 135 |
| capabilityName | function | 143 |
| runtimeSummary | function | 153 |
| renderRuntime | function | 166 |
| updateTaskRuntime | function | 174 |
| renderRuntime | method | 176 |
| applyConfig | function | 179 |
| options | method | 181 |
| renderRuntime | method | 187 |
| options | method | 188 |
| fillSubagentModels | method | 193 |
| fillModels | method | 195 |
| options | method | 196 |
| configure | function | 202 |
| controls | method | 205 |
| controls | method | 228 |
| openCreation | method | 230 |
| card | function | 238 |
| renderMessage | function | 277 |
| renderQueue | function | 315 |
| event | function | 331 |
| snapshot | function | 431 |
| clearTimeout | method | 432 |
| renderQueue | method | 506 |
| applyConfig | method | 508 |
| controls | method | 509 |
| reconnectTimer | const | 511 |
| clearTimeout | method | 515 |
| controls | method | 518 |
| scheduleReconnect | function | 593 |
| clearTimeout | method | 594 |
| fillModels | method | 601 |
| fillSubagentModels | method | 608 |
| controls | method | 628 |
| scrollLatest | method | 633 |
| escapeTimer | const | 670 |
| withdrawQueue | function | 671 |
| refreshing | const | 718 |
| refreshSessions | function | 719 |
| updateSessions | function | 726 |
| renderSessions | method | 732 |
| switchSession | function | 734 |
| saveView | method | 736 |
| controls | method | 739 |
| renderSessions | function | 751 |
| sessionAction | const | 817 |
| openSessionAction | function | 818 |
| contextIcon | function | 859 |
| renderContextChips | function | 862 |
| renderContextResults | function | 880 |
| selectContext | function | 909 |
| browseContext | function | 915 |
| resizePrompt | method | 937 |
| controls | method | 938 |
| resizePrompt | method | 947 |
| controls | method | 948 |
| switchSession | method | 974 |
| creationLoad | const | 976 |
| createAgentPicker | function | 977 |
| options | method | 999 |
| fill | method | 1007 |
| fillThinking | method | 1015 |
| options | method | 1017 |
| loadCreation | function | 1063 |
| openCreation | function | 1091 |
| updateDefaultsPreview | function | 1108 |
| updateDefaultsPreview | method | 1121 |

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

### src/main.js（38 行） — 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理

| 符号 | 类型 | 行 |
|---|---|---|
| port | const | 10 |
| cwd | const | 13 |
| factory | const | 16 |
| home | const | 17 |
| sessions | const | 24 |
| app | const | 27 |

### src/pi.js（169 行） — createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档）

| 符号 | 类型 | 行 |
|---|---|---|
| agentRuntime | function | 10 |
| createPiFactory | function | 21 |

### src/protocol.js（82 行） — zod 协议：selection / command 判别联合（消息类型见 L3）

| 符号 | 类型 | 行 |
|---|---|---|
| id | const | 3 |
| capabilities | const | 4 |
| workspace | const | 7 |
| thinking | const | 8 |
| queueType | const | 9 |
| selection | const | 10 |
| command | const | 19 |

### src/server.js（191 行） — createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发

| 符号 | 类型 | 行 |
|---|---|---|
| assets | const | 7 |
| createServerApp | function | 24 |

### src/sessions.js（405 行） — Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化

| 符号 | 类型 | 行 |
|---|---|---|
| Sessions | class | 11 |
| constructor | method | 12 |
| loadDefaults | method | 22 |
| getDefaults | method | 31 |
| configureDefaults | method | 34 |
| saveDefaults | method | 39 |
| validateSelection | method | 57 |
| load | method | 72 |
| persist | method | 83 |
| list | method | 102 |
| rename | method | 113 |
| create | method | 121 |
| get | method | 229 |
| pickWorkspace | method | 234 |
| revealWorkspace | method | 245 |
| browse | method | 257 |
| snapshot | method | 270 |
| subscribe | method | 295 |
| configure | method | 301 |
| prompt | method | 333 |
| cancel | method | 371 |
| remove | method | 388 |
| close | method | 401 |

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

- 协议 command.type：inherit、session.rename、workspace.pick、workspace.reveal、workspace.browse、models.list、capabilities.list、session.defaults.get、session.defaults.configure、session.configure、sessions.list、session.create、session.attach、session.close、prompt、cancel、queue.withdraw、tasks.read（src/protocol.js）
- HTML id：sidebar、workspace-picker、workspace-name、workspace-form、cwd、workspaces、open-workspace、new、custom-new、search、sessions、open-settings、sidebar-backdrop、toggle-sidebar、session-title、workspace-label、copy-workspace、reveal-workspace、workspace-feedback、status、login、connect、workspace、transcript、output、latest、message-queue、add-context、context-chips、context-menu、context-picker、context-title、context-close、context-search、context-path、context-results、context-error、composer、prompt、composer-skill、provider、model、thinking、stop、send-steer、send-followup、send、session-runtime、composer-help、error、session-action、session-action-form、session-action-title、session-action-description、session-name-label、session-name、session-action-error、session-action-cancel、session-action-submit、task-overlays、task-template、settings、settings-title、defaults-panel、queue-type、steer-help、followup-help、defaults-preview、subagent-title、subagent-help、subagent-provider、subagent-model、settings-feedback、defaults-title、defaults-editor、create-session、create-title、create-form、create-workspace、create-defaults-help、create-agents、create-trust-row、create-trust、create-feedback、create-submit（public/index.html）
- HTTP 静态路由：/、/favicon.svg、/style.css、/app.js、/markdown.js、/stream-renderer.js、/vendor/marked.js、/vendor/purify.js、/health（src/server.js）

## ⚠ 未登记文件（0）

（无）
