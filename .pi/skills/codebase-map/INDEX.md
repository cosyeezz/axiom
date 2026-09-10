<!-- 自动生成，勿手改。重建：node .pi/skills/codebase-map/scripts/reindex.mjs -->
# Axiom 多级代码索引（生成于 2026/9/10 01:40:49）

## L1 模块总览（文件 → 职责）

| 文件 | 行数 | 职责 | 关键符号 |
|---|---|---|---|
| public/app.js | 843 | 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度 | $, ws, allSessions, views |
| public/index.html | 161 | 页面骨架与元素 id（见 L3） | - |
| public/markdown.js | 37 | marked + DOMPurify 渲染（XSS 边界） | cache, policy, renderMarkdown |
| public/stream-renderer.js | 51 | 流式增量渲染状态机 | createStreamRenderer |
| public/style.css | 770 | 全局样式（CSP 禁 inline style，样式一律进这里） | - |
| src/capabilities.js | 114 | 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities） | sdkEntry, resolver, alias, jiti |
| src/main.js | 28 | 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理 | port, cwd, factory, sessions |
| src/pi.js | 145 | createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档） | createPiFactory |
| src/protocol.js | 74 | zod 协议：selection / command 判别联合（消息类型见 L3） | id, capabilities, workspace, thinking |
| src/server.js | 179 | createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发 | assets, createServerApp |
| src/sessions.js | 305 | Sessions：会话生命周期、配置快照、默认会话持久化（agent目录 axiom/defaults.json） | Sessions |
| src/tasks.js | 105 | Tasks：子任务（委托）生命周期 | Tasks |
| src/tools.js | 73 | delegationTools：注册给 pi 的委托/读取工具定义（zod 入参） | delegateInput, readInput, result, delegationTools |
| tests/app.test.js | 431 | node --test 测试（npm test） | - |
| tests/benchmark.js | 92 | node --test 测试（npm test） | window |
| tests/capabilities.test.js | 78 | node --test 测试（npm test） | - |
| tests/codebase-index.test.js | 18 | node --test 测试（npm test） | ROOT, SKILL |
| tests/config.test.js | 156 | node --test 测试（npm test） | - |
| tests/defaults.test.js | 33 | node --test 测试（npm test） | - |
| tests/markdown.test.js | 55 | node --test 测试（npm test） | - |
| tests/server.test.js | 125 | node --test 测试（npm test） | - |
| tests/smoke.js | 29 | node --test 测试（npm test） | sessions |
| tests/stream-renderer.test.js | 91 | node --test 测试（npm test） | - |
| tests/tasks.test.js | 87 | node --test 测试（npm test） | fixture |

## L2 符号 → 行号（跳转：read <文件> offset=<行>）

### public/app.js（843 行） — 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度

| 符号 | 类型 | 行 |
|---|---|---|
| $ | const | 3 |
| ws | const | 4 |
| allSessions | const | 12 |
| views | const | 14 |
| saveView | function | 18 |
| resizePrompt | function | 26 |
| scrollFrame | const | 30 |
| scrollLatest | function | 31 |
| renderer | const | 39 |
| scrollLatest | method | 48 |
| mobile | const | 50 |
| sidebar | function | 51 |
| sidebar | method | 61 |
| pending | const | 65 |
| error | function | 68 |
| request | function | 71 |
| controls | function | 80 |
| options | function | 105 |
| fillModels | function | 112 |
| options | method | 113 |
| fillSubagentModels | function | 121 |
| options | method | 123 |
| capabilityName | function | 131 |
| applyConfig | function | 141 |
| options | method | 143 |
| fillSubagentModels | method | 148 |
| fillModels | method | 150 |
| options | method | 151 |
| configure | function | 168 |
| controls | method | 171 |
| controls | method | 193 |
| openCreation | method | 195 |
| card | function | 203 |
| renderMessage | function | 239 |
| event | function | 254 |
| snapshot | function | 305 |
| applyConfig | method | 371 |
| controls | method | 372 |
| controls | method | 377 |
| fillModels | method | 451 |
| fillSubagentModels | method | 458 |
| controls | method | 473 |
| renderMarkdown | method | 477 |
| scrollLatest | method | 479 |
| refreshing | const | 528 |
| refreshSessions | function | 529 |
| updateSessions | function | 536 |
| renderSessions | method | 542 |
| switchSession | function | 544 |
| saveView | method | 546 |
| controls | method | 549 |
| renderSessions | function | 561 |
| resizePrompt | method | 620 |
| controls | method | 621 |
| switchSession | method | 624 |
| creationLoad | const | 626 |
| createAgentPicker | function | 627 |
| options | method | 649 |
| fill | method | 657 |
| fillThinking | method | 665 |
| options | method | 667 |
| loadCreation | function | 713 |
| openCreation | function | 741 |
| updateDefaultsPreview | function | 758 |
| updateDefaultsPreview | method | 771 |

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

### src/pi.js（145 行） — createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档）

| 符号 | 类型 | 行 |
|---|---|---|
| createPiFactory | function | 10 |

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

### src/sessions.js（305 行） — Sessions：会话生命周期、配置快照、默认会话持久化（agent目录 axiom/defaults.json）

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
| subscribe | method | 209 |
| configure | method | 215 |
| prompt | method | 243 |
| cancel | method | 276 |
| remove | method | 293 |
| close | method | 301 |

### src/tasks.js（105 行） — Tasks：子任务（委托）生命周期

| 符号 | 类型 | 行 |
|---|---|---|
| Tasks | class | 3 |
| constructor | method | 4 |
| start | method | 10 |
| publish | method | 21 |
| view | method | 24 |
| snapshot | method | 27 |
| run | method | 31 |
| read | method | 67 |
| cancel | method | 91 |

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
- HTML id：sidebar、workspace-picker、workspace-name、workspace-form、cwd、workspaces、new、custom-new、search、sessions、open-settings、sidebar-backdrop、toggle-sidebar、session-title、workspace-label、status、rename、delete、login、connect、workspace、transcript、output、latest、composer、prompt、provider、model、thinking、stop、send、composer-help、error、settings、settings-title、defaults-panel、defaults-preview、subagent-title、subagent-help、subagent-provider、subagent-model、settings-feedback、defaults-title、defaults-editor、create-session、create-title、create-form、create-workspace、create-defaults-help、create-agents、create-trust-row、create-trust、create-feedback、create-submit（public/index.html）
- HTTP 静态路由：/、/favicon.svg、/style.css、/app.js、/markdown.js、/stream-renderer.js、/vendor/marked.js、/vendor/purify.js、/health（src/server.js）

## ⚠ 未登记文件（0）

（无）
