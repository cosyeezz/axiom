<!-- 自动生成，勿手改。重建：node .pi/skills/codebase-map/scripts/reindex.mjs -->
# Axiom 多级代码索引（生成于 2026/9/10 03:29:37）

## L1 模块总览（文件 → 职责）

| 文件 | 行数 | 职责 | 关键符号 |
|---|---|---|---|
| public/app.js | 1139 | 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度 | $, ws, allSessions, views |
| public/index.html | 222 | 页面骨架与元素 id（见 L3） | - |
| public/markdown.js | 37 | marked + DOMPurify 渲染（XSS 边界） | cache, policy, renderMarkdown |
| public/stream-renderer.js | 51 | 流式增量渲染状态机 | createStreamRenderer |
| public/style.css | 883 | 全局样式（CSP 禁 inline style，样式一律进这里） | - |
| src/capabilities.js | 114 | 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities） | sdkEntry, resolver, alias, jiti |
| src/main.js | 38 | 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理 | port, cwd, factory, home |
| src/pi.js | 169 | createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档） | agentRuntime, createPiFactory |
| src/protocol.js | 82 | zod 协议：selection / command 判别联合（消息类型见 L3） | id, capabilities, workspace, thinking |
| src/server.js | 191 | createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发 | assets, createServerApp |
| src/sessions.js | 405 | Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化 | Sessions |
| src/tasks.js | 108 | Tasks：子任务（委托）生命周期 | Tasks |
| src/tools.js | 73 | delegationTools：注册给 pi 的委托/读取工具定义（zod 入参） | delegateInput, readInput, result, delegationTools |
| tests/app.test.js | 643 | node --test 测试（npm test） | - |
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

### public/app.js（1139 行） — 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度

| 符号 | 类型 | 行 |
|---|---|---|
| $ | const | 3 |
| ws | const | 4 |
| allSessions | const | 14 |
| views | const | 16 |
| contextFiles | const | 17 |
| saveView | function | 21 |
| resizePrompt | function | 30 |
| scrollFrame | const | 34 |
| scrollLatest | function | 35 |
| renderer | const | 45 |
| scrollLatest | method | 54 |
| mobile | const | 56 |
| sidebar | function | 57 |
| sidebar | method | 67 |
| pending | const | 71 |
| error | function | 74 |
| request | function | 77 |
| controls | function | 86 |
| renderContextChips | method | 103 |
| options | function | 114 |
| fillModels | function | 121 |
| options | method | 122 |
| fillSubagentModels | function | 130 |
| options | method | 132 |
| capabilityName | function | 140 |
| runtimeSummary | function | 150 |
| renderRuntime | function | 163 |
| updateTaskRuntime | function | 171 |
| renderRuntime | method | 173 |
| applyConfig | function | 176 |
| options | method | 178 |
| renderRuntime | method | 184 |
| options | method | 185 |
| fillSubagentModels | method | 190 |
| fillModels | method | 192 |
| options | method | 193 |
| configure | function | 199 |
| controls | method | 202 |
| controls | method | 225 |
| openCreation | method | 227 |
| card | function | 235 |
| renderMessage | function | 274 |
| renderQueue | function | 312 |
| event | function | 328 |
| snapshot | function | 428 |
| clearTimeout | method | 429 |
| renderQueue | method | 502 |
| applyConfig | method | 504 |
| controls | method | 505 |
| controls | method | 510 |
| fillModels | method | 584 |
| fillSubagentModels | method | 591 |
| controls | method | 610 |
| scrollLatest | method | 615 |
| escapeTimer | const | 650 |
| withdrawQueue | function | 651 |
| refreshing | const | 698 |
| refreshSessions | function | 699 |
| updateSessions | function | 706 |
| renderSessions | method | 712 |
| switchSession | function | 714 |
| saveView | method | 716 |
| controls | method | 719 |
| renderSessions | function | 731 |
| sessionAction | const | 777 |
| openSessionAction | function | 778 |
| contextIcon | function | 819 |
| renderContextChips | function | 822 |
| renderContextResults | function | 840 |
| selectContext | function | 869 |
| browseContext | function | 875 |
| resizePrompt | method | 899 |
| controls | method | 900 |
| resizePrompt | method | 904 |
| controls | method | 905 |
| switchSession | method | 931 |
| creationLoad | const | 933 |
| createAgentPicker | function | 934 |
| options | method | 956 |
| fill | method | 964 |
| fillThinking | method | 972 |
| options | method | 974 |
| loadCreation | function | 1020 |
| openCreation | function | 1048 |
| updateDefaultsPreview | function | 1065 |
| updateDefaultsPreview | method | 1078 |

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
- HTML id：sidebar、workspace-picker、workspace-name、workspace-form、cwd、workspaces、open-workspace、new、custom-new、search、sessions、open-settings、sidebar-backdrop、toggle-sidebar、session-title、workspace-label、copy-workspace、reveal-workspace、workspace-feedback、status、rename、delete、login、connect、workspace、transcript、output、latest、message-queue、add-context、context-chips、context-menu、context-picker、context-title、context-close、context-search、context-path、context-results、context-error、composer、prompt、composer-skill、provider、model、thinking、stop、send-steer、send-followup、send、session-runtime、composer-help、error、session-action、session-action-form、session-action-title、session-action-description、session-name-label、session-name、session-action-error、session-action-cancel、session-action-submit、task-overlays、task-template、settings、settings-title、defaults-panel、queue-type、defaults-preview、subagent-title、subagent-help、subagent-provider、subagent-model、settings-feedback、defaults-title、defaults-editor、create-session、create-title、create-form、create-workspace、create-defaults-help、create-agents、create-trust-row、create-trust、create-feedback、create-submit（public/index.html）
- HTTP 静态路由：/、/favicon.svg、/style.css、/app.js、/markdown.js、/stream-renderer.js、/vendor/marked.js、/vendor/purify.js、/health（src/server.js）

## ⚠ 未登记文件（0）

（无）
