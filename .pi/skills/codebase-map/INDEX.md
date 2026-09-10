<!-- 自动生成，勿手改。重建：node .pi/skills/codebase-map/scripts/reindex.mjs -->
# Axiom 多级代码索引（生成于 2026/9/10 03:13:26）

## L1 模块总览（文件 → 职责）

| 文件 | 行数 | 职责 | 关键符号 |
|---|---|---|---|
| public/app.js | 1004 | 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度 | $, ws, allSessions, views |
| public/index.html | 207 | 页面骨架与元素 id（见 L3） | - |
| public/markdown.js | 37 | marked + DOMPurify 渲染（XSS 边界） | cache, policy, renderMarkdown |
| public/stream-renderer.js | 51 | 流式增量渲染状态机 | createStreamRenderer |
| public/style.css | 858 | 全局样式（CSP 禁 inline style，样式一律进这里） | - |
| src/capabilities.js | 114 | 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities） | sdkEntry, resolver, alias, jiti |
| src/main.js | 38 | 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理 | port, cwd, factory, home |
| src/pi.js | 169 | createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档） | agentRuntime, createPiFactory |
| src/protocol.js | 79 | zod 协议：selection / command 判别联合（消息类型见 L3） | id, capabilities, workspace, thinking |
| src/server.js | 182 | createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发 | assets, createServerApp |
| src/sessions.js | 367 | Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化 | Sessions |
| src/tasks.js | 108 | Tasks：子任务（委托）生命周期 | Tasks |
| src/tools.js | 73 | delegationTools：注册给 pi 的委托/读取工具定义（zod 入参） | delegateInput, readInput, result, delegationTools |
| tests/app.test.js | 600 | node --test 测试（npm test） | - |
| tests/benchmark.js | 92 | node --test 测试（npm test） | window |
| tests/capabilities.test.js | 78 | node --test 测试（npm test） | - |
| tests/codebase-index.test.js | 18 | node --test 测试（npm test） | ROOT, SKILL |
| tests/config.test.js | 214 | node --test 测试（npm test） | - |
| tests/defaults.test.js | 33 | node --test 测试（npm test） | - |
| tests/markdown.test.js | 55 | node --test 测试（npm test） | - |
| tests/server.test.js | 125 | node --test 测试（npm test） | - |
| tests/session-flow.test.js | 52 | node --test 测试（npm test） | - |
| tests/smoke.js | 29 | node --test 测试（npm test） | sessions |
| tests/stream-renderer.test.js | 91 | node --test 测试（npm test） | - |
| tests/tasks.test.js | 87 | node --test 测试（npm test） | fixture |

## L2 符号 → 行号（跳转：read <文件> offset=<行>）

### public/app.js（1004 行） — 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度

| 符号 | 类型 | 行 |
|---|---|---|
| $ | const | 3 |
| ws | const | 4 |
| allSessions | const | 14 |
| views | const | 16 |
| saveView | function | 20 |
| resizePrompt | function | 28 |
| scrollFrame | const | 32 |
| scrollLatest | function | 33 |
| renderer | const | 43 |
| scrollLatest | method | 52 |
| mobile | const | 54 |
| sidebar | function | 55 |
| sidebar | method | 65 |
| pending | const | 69 |
| error | function | 72 |
| request | function | 75 |
| controls | function | 84 |
| options | function | 107 |
| fillModels | function | 114 |
| options | method | 115 |
| fillSubagentModels | function | 123 |
| options | method | 125 |
| capabilityName | function | 133 |
| runtimeSummary | function | 143 |
| renderRuntime | function | 156 |
| updateTaskRuntime | function | 164 |
| renderRuntime | method | 166 |
| applyConfig | function | 169 |
| options | method | 171 |
| renderRuntime | method | 177 |
| options | method | 178 |
| fillSubagentModels | method | 183 |
| fillModels | method | 185 |
| options | method | 186 |
| configure | function | 192 |
| controls | method | 195 |
| controls | method | 218 |
| openCreation | method | 220 |
| card | function | 228 |
| renderMessage | function | 267 |
| renderQueue | function | 284 |
| event | function | 300 |
| snapshot | function | 400 |
| clearTimeout | method | 401 |
| renderQueue | method | 471 |
| applyConfig | method | 473 |
| controls | method | 474 |
| controls | method | 479 |
| fillModels | method | 553 |
| fillSubagentModels | method | 560 |
| controls | method | 578 |
| scrollLatest | method | 583 |
| escapeTimer | const | 614 |
| withdrawQueue | function | 615 |
| refreshing | const | 662 |
| refreshSessions | function | 663 |
| updateSessions | function | 670 |
| renderSessions | method | 676 |
| switchSession | function | 678 |
| saveView | method | 680 |
| controls | method | 683 |
| renderSessions | function | 695 |
| sessionAction | const | 741 |
| openSessionAction | function | 742 |
| resizePrompt | method | 787 |
| controls | method | 788 |
| resizePrompt | method | 792 |
| controls | method | 793 |
| switchSession | method | 796 |
| creationLoad | const | 798 |
| createAgentPicker | function | 799 |
| options | method | 821 |
| fill | method | 829 |
| fillThinking | method | 837 |
| options | method | 839 |
| loadCreation | function | 885 |
| openCreation | function | 913 |
| updateDefaultsPreview | function | 930 |
| updateDefaultsPreview | method | 943 |

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

### src/protocol.js（79 行） — zod 协议：selection / command 判别联合（消息类型见 L3）

| 符号 | 类型 | 行 |
|---|---|---|
| id | const | 3 |
| capabilities | const | 4 |
| workspace | const | 7 |
| thinking | const | 8 |
| queueType | const | 9 |
| selection | const | 10 |
| command | const | 19 |

### src/server.js（182 行） — createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发

| 符号 | 类型 | 行 |
|---|---|---|
| assets | const | 7 |
| createServerApp | function | 24 |

### src/sessions.js（367 行） — Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化

| 符号 | 类型 | 行 |
|---|---|---|
| Sessions | class | 9 |
| constructor | method | 10 |
| loadDefaults | method | 20 |
| getDefaults | method | 29 |
| configureDefaults | method | 32 |
| saveDefaults | method | 37 |
| validateSelection | method | 55 |
| load | method | 70 |
| persist | method | 81 |
| list | method | 100 |
| rename | method | 111 |
| create | method | 119 |
| get | method | 227 |
| snapshot | method | 232 |
| subscribe | method | 257 |
| configure | method | 263 |
| prompt | method | 295 |
| cancel | method | 333 |
| remove | method | 350 |
| close | method | 363 |

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

### tests/codebase-index.test.js（18 行） — node --test 测试（npm test）

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

- 协议 command.type：inherit、session.rename、models.list、capabilities.list、session.defaults.get、session.defaults.configure、session.configure、sessions.list、session.create、session.attach、session.close、prompt、cancel、queue.withdraw、tasks.read（src/protocol.js）
- HTML id：sidebar、workspace-picker、workspace-name、workspace-form、cwd、workspaces、new、custom-new、search、sessions、open-settings、sidebar-backdrop、toggle-sidebar、session-title、workspace-label、status、rename、delete、login、connect、workspace、transcript、output、latest、message-queue、composer、prompt、composer-skill、provider、model、thinking、stop、send-steer、send-followup、send、session-runtime、composer-help、error、session-action、session-action-form、session-action-title、session-action-description、session-name-label、session-name、session-action-error、session-action-cancel、session-action-submit、task-overlays、task-template、settings、settings-title、defaults-panel、queue-type、defaults-preview、subagent-title、subagent-help、subagent-provider、subagent-model、settings-feedback、defaults-title、defaults-editor、create-session、create-title、create-form、create-workspace、create-defaults-help、create-agents、create-trust-row、create-trust、create-feedback、create-submit（public/index.html）
- HTTP 静态路由：/、/favicon.svg、/style.css、/app.js、/markdown.js、/stream-renderer.js、/vendor/marked.js、/vendor/purify.js、/health（src/server.js）

## ⚠ 未登记文件（0）

（无）
