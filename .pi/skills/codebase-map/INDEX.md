<!-- 自动生成，勿手改。重建：node .pi/skills/codebase-map/scripts/reindex.mjs -->
# Axiom 多级代码索引（生成于 2026/9/10 02:33:49）

## L1 模块总览（文件 → 职责）

| 文件 | 行数 | 职责 | 关键符号 |
|---|---|---|---|
| public/app.js | 914 | 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度 | $, ws, allSessions, views |
| public/index.html | 188 | 页面骨架与元素 id（见 L3） | - |
| public/markdown.js | 37 | marked + DOMPurify 渲染（XSS 边界） | cache, policy, renderMarkdown |
| public/stream-renderer.js | 51 | 流式增量渲染状态机 | createStreamRenderer |
| public/style.css | 839 | 全局样式（CSP 禁 inline style，样式一律进这里） | - |
| src/capabilities.js | 114 | 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities） | sdkEntry, resolver, alias, jiti |
| src/main.js | 28 | 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理 | port, cwd, factory, sessions |
| src/pi.js | 160 | createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档） | agentRuntime, createPiFactory |
| src/protocol.js | 74 | zod 协议：selection / command 判别联合（消息类型见 L3） | id, capabilities, workspace, thinking |
| src/server.js | 179 | createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发 | assets, createServerApp |
| src/sessions.js | 307 | Sessions：会话生命周期、配置快照、默认会话持久化（agent目录 axiom/defaults.json） | Sessions |
| src/tasks.js | 108 | Tasks：子任务（委托）生命周期 | Tasks |
| src/tools.js | 73 | delegationTools：注册给 pi 的委托/读取工具定义（zod 入参） | delegateInput, readInput, result, delegationTools |
| tests/app.test.js | 553 | node --test 测试（npm test） | - |
| tests/benchmark.js | 92 | node --test 测试（npm test） | window |
| tests/capabilities.test.js | 78 | node --test 测试（npm test） | - |
| tests/codebase-index.test.js | 18 | node --test 测试（npm test） | ROOT, SKILL |
| tests/config.test.js | 213 | node --test 测试（npm test） | - |
| tests/defaults.test.js | 33 | node --test 测试（npm test） | - |
| tests/markdown.test.js | 55 | node --test 测试（npm test） | - |
| tests/server.test.js | 125 | node --test 测试（npm test） | - |
| tests/smoke.js | 29 | node --test 测试（npm test） | sessions |
| tests/stream-renderer.test.js | 91 | node --test 测试（npm test） | - |
| tests/tasks.test.js | 87 | node --test 测试（npm test） | fixture |

## L2 符号 → 行号（跳转：read <文件> offset=<行>）

### public/app.js（914 行） — 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度

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
| options | function | 109 |
| fillModels | function | 116 |
| options | method | 117 |
| fillSubagentModels | function | 125 |
| options | method | 127 |
| capabilityName | function | 135 |
| runtimeSummary | function | 145 |
| renderRuntime | function | 158 |
| updateTaskRuntime | function | 166 |
| renderRuntime | method | 168 |
| applyConfig | function | 171 |
| renderRuntime | method | 174 |
| options | method | 175 |
| fillSubagentModels | method | 180 |
| fillModels | method | 182 |
| options | method | 183 |
| configure | function | 189 |
| controls | method | 192 |
| controls | method | 214 |
| openCreation | method | 216 |
| card | function | 224 |
| renderMessage | function | 260 |
| event | function | 275 |
| snapshot | function | 372 |
| applyConfig | method | 442 |
| controls | method | 443 |
| controls | method | 448 |
| fillModels | method | 522 |
| fillSubagentModels | method | 529 |
| controls | method | 544 |
| renderMarkdown | method | 548 |
| scrollLatest | method | 550 |
| refreshing | const | 599 |
| refreshSessions | function | 600 |
| updateSessions | function | 607 |
| renderSessions | method | 613 |
| switchSession | function | 615 |
| saveView | method | 617 |
| controls | method | 620 |
| renderSessions | function | 632 |
| resizePrompt | method | 691 |
| controls | method | 692 |
| switchSession | method | 695 |
| creationLoad | const | 697 |
| createAgentPicker | function | 698 |
| options | method | 720 |
| fill | method | 728 |
| fillThinking | method | 736 |
| options | method | 738 |
| loadCreation | function | 784 |
| openCreation | function | 812 |
| updateDefaultsPreview | function | 829 |
| updateDefaultsPreview | method | 842 |

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

### src/main.js（28 行） — 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理

| 符号 | 类型 | 行 |
|---|---|---|
| port | const | 8 |
| cwd | const | 11 |
| factory | const | 14 |
| sessions | const | 15 |
| app | const | 17 |

### src/pi.js（160 行） — createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档）

| 符号 | 类型 | 行 |
|---|---|---|
| agentRuntime | function | 10 |
| createPiFactory | function | 21 |

### src/protocol.js（74 行） — zod 协议：selection / command 判别联合（消息类型见 L3）

| 符号 | 类型 | 行 |
|---|---|---|
| id | const | 3 |
| capabilities | const | 4 |
| workspace | const | 7 |
| thinking | const | 8 |
| selection | const | 9 |
| command | const | 17 |

### src/server.js（179 行） — createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发

| 符号 | 类型 | 行 |
|---|---|---|
| assets | const | 7 |
| createServerApp | function | 24 |

### src/sessions.js（307 行） — Sessions：会话生命周期、配置快照、默认会话持久化（agent目录 axiom/defaults.json）

| 符号 | 类型 | 行 |
|---|---|---|
| Sessions | class | 9 |
| constructor | method | 10 |
| loadDefaults | method | 19 |
| getDefaults | method | 28 |
| configureDefaults | method | 31 |
| saveDefaults | method | 36 |
| validateSelection | method | 54 |
| list | method | 69 |
| rename | method | 80 |
| create | method | 86 |
| get | method | 182 |
| snapshot | method | 187 |
| subscribe | method | 210 |
| configure | method | 216 |
| prompt | method | 245 |
| cancel | method | 278 |
| remove | method | 295 |
| close | method | 303 |

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

- 协议 command.type：inherit、session.rename、models.list、capabilities.list、session.defaults.get、session.defaults.configure、session.configure、sessions.list、session.create、session.attach、session.close、prompt、cancel、tasks.read（src/protocol.js）
- HTML id：sidebar、workspace-picker、workspace-name、workspace-form、cwd、workspaces、new、custom-new、search、sessions、open-settings、sidebar-backdrop、toggle-sidebar、session-title、workspace-label、status、rename、delete、login、connect、workspace、transcript、output、latest、composer、prompt、provider、model、thinking、stop、send、session-runtime、composer-help、error、task-overlays、task-template、settings、settings-title、defaults-panel、defaults-preview、subagent-title、subagent-help、subagent-provider、subagent-model、settings-feedback、defaults-title、defaults-editor、create-session、create-title、create-form、create-workspace、create-defaults-help、create-agents、create-trust-row、create-trust、create-feedback、create-submit（public/index.html）
- HTTP 静态路由：/、/favicon.svg、/style.css、/app.js、/markdown.js、/stream-renderer.js、/vendor/marked.js、/vendor/purify.js、/health（src/server.js）

## ⚠ 未登记文件（0）

（无）
