<!-- 自动生成，勿手改。重建：node .pi/skills/codebase-map/scripts/reindex.mjs -->
# Axiom 多级代码索引（生成于 2026/9/18 00:30:11）

## L1 模块总览（文件 → 职责）

| 文件 | 行数 | 职责 | 关键符号 |
|---|---|---|---|
| desktop/connector/index.html | 184 | 壳内置连接入口页：地址可配置、可达探测与整页跳转 | - |
| desktop/pake.json | 14 | Pake 桌面壳配置：本地连接入口页、内导航与窗口参数 | - |
| public/answer-tags.js | 48 | 主代理回答标签解析、代码保护与流式容错 | OPEN, CLOSE, MARKS, isMark |
| public/app.js | 4615 | 前端唯一入口：视图栈、会话/设置 UI、权威归并与渲染调度 | questionUI, filePicker, $, sessionDetail |
| public/clipboard.js | 27 | 统一剪贴板入口：Clipboard API 优先，非安全上下文回退 execCommand | copyText |
| public/file-picker.css | 276 | 文件选择弹窗主题与响应式布局 | - |
| public/file-picker.js | 356 | 共享文件/目录选择弹窗、懒加载与分类 SVG 图标 | NS, SEARCH_DEBOUNCE, el, FOLDER_COLORS |
| public/goal-markers.js | 64 | 前后端共享 goal 完成标记解析与展示层剥离（含流式半截） | ROUND_MARKER, GOAL_MARKER, MARKER_TOKENS, SUFFIXES |
| public/goal.css | 239 | Goal 目标面板、轮次与控制样式 | - |
| public/goal.js | 644 | Goal 专属状态、操作与复用消息轮次分组 | createGoalUI |
| public/icons.js | 93 | 全页面动作 SVG 图标：固定几何路径字典、静态控件与模板水合 | actionIconPaths, initActionIcons, actionIconNode, actionIcon |
| public/index.html | 420 | 页面骨架与元素 id（见 L3） | - |
| public/markdown-scan.js | 140 | 共享代码区扫描：围栏/缩进/行内代码掩码与区间切割 | FILL, FENCE, INLINE, fill |
| public/markdown.js | 481 | marked + DOMPurify 渲染（XSS 边界） | cache, PAGE_CACHE_ENTRY_LIMIT, PAGE_CACHE_BYTE_LIMIT, createMarkdownPageCache |
| public/memory-tags.js | 107 | 主子代理共享简单标签提取与流式显示过滤 | LIVE, DEAD, TAGS, NAMES |
| public/model-auth.js | 97 | 网页登录：授权提示、设备码、凭据输入与取消 | createModelAuth |
| public/model-manager.css | 551 | 模型配置页：供应商列表、编辑表单与响应式布局 | - |
| public/model-manager.js | 1521 | 统一模型管理：供应商、字段覆盖与思考等级编辑 | THINKING_LEVELS, API_TYPES, PROVIDER_TEMPLATES, PROVIDER_ID |
| public/model-picker.css | 88 | 共享收藏下拉：浮层、星标、触屏与焦点样式 | - |
| public/model-picker.js | 382 | 共享模型选择器：供应商/模型/思考收藏、排序与键盘交互 | GAP, EDGE, TYPEAHEAD_MS, instanceSeq |
| public/question.css | 49 | 提问面板样式、焦点与窄屏布局 | - |
| public/question.js | 232 | 主代理提问选项卡、键盘交互与回答提交 | createQuestionUI |
| public/service-settings.js | 281 | 设置页服务维护：真实进度、结果、更新确认与独立维护通道 | MAINT_URL_RE, POLL_MS, initServiceSettings |
| public/session-cache.js | 53 | 可淘汰会话阅读位置缓存与未保存输入保护 | EVICTABLE_VIEWS, hasUnsavedInput, createSessionCache |
| public/session-details.js | 141 | 主代理页签、安全可折叠 JSON 树与会话账单渲染 | detailElement, money, precise, count |
| public/stream-playback.js | 165 | 有界字素播放游标与真实时间缓冲追赶 | BUFFER_MS, BASE_RATE, CATCHUP_S, MAX_RATE |
| public/stream-renderer.js | 179 | 共享 rAF 流式绘制、交互让路与挂载生命周期 | createStreamRenderer |
| public/style.css | 1801 | 全局样式（CSP 禁 inline style，样式一律进这里） | - |
| public/theme.js | 11 | 首帧前阻塞应用明/暗主题（localStorage axiom.theme，默认深色） | - |
| public/tooltip.css | 50 | 共享悬停说明样式（浅色主题下反色） | - |
| public/tooltip.js | 225 | 共享悬停说明：动态 title、键盘、定位与无障碍 | SHOW_DELAY, HIDE_DELAY, GAP, EDGE |
| public/transport.js | 269 | 业务 WS 唯一所有者：请求回执、逻辑订阅、快照事件闸门与有界恢复 | SERIALIZE_THRESHOLD, WORKER_SOURCE, estimateBytes, createTransport |
| scripts/autostart.mjs | 138 | Windows/macOS/Linux 当前用户登录自动启动安装/卸载 | run, projectDir, serviceEntry, label |
| scripts/dev-vite.mjs | 69 | 独立 Vite 前端：CSS 热替换、同源代理与整页刷新暂停 | startDevWeb |
| scripts/dev.mjs | 12 | 开发入口：DEV 标识、4320 端口与独立数据目录 | - |
| scripts/install.mjs | 72 | 一键安装：装依赖/注册自启/启动守护/健康检查/打开浏览器 | root, parseArgs, ensurePi, viaShell |
| scripts/maint-server.mjs | 86 | loopback维护HTTP：来源校验、随机凭证、状态与离线恢复 | MAX_BODY, hash, json, startMaintServer |
| scripts/maint-state.mjs | 138 | 守护维护状态：持久化阶段、最近结果与有界脱敏证据 | NAMESPACE, LOG_LIMIT, redact, sanitize |
| scripts/service.mjs | 619 | 服务守护：IPC 重启、HTTP 安全停止与崩溃退避停止通道 | root, output, run, npmRun |
| scripts/uninstall.mjs | 18 | 统一卸载：核对 npm 目标、安全停止、取消自启、保留用户数据 | uninstall |
| src/capabilities.js | 159 | 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities） | sdkEntry, resolver, alias, jiti |
| src/compaction.js | 391 | 后台独立摘要、token/占比阈值、快照校验与 turn 安全提交 | contextTokens, prepareBackgroundCompaction, DEFAULT_COMPACTION_CONFIG, normalizeCompaction |
| src/data-owner.js | 23 | 写库前数据根独占：内核管道或socket持有，禁止同根双写 | claimDataRoot |
| src/database.js | 122 | 共享 SQLite 连接、小配置 KV、WAL 与一致性备份 | nodeOk, DATA_VERSION, assertDataVersion, Database |
| src/goal.js | 988 | Goal：会话级目标状态、轮次计划、验收门与持久化 | GOAL_PHASES, GOAL_ACTIONS, ROUND_STATUSES, GOAL_MAX_SEGMENTS |
| src/inline-images.js | 32 | 模型上下文图片定位：将占位符与真实附件交错排列，不改存储与队列 | inlineImages, inlineImagesExtension |
| src/main.js | 139 | 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理 | port, host, cwd, home |
| src/model-auth.js | 89 | SDK 登录桥：连接隔离、超时取消与安全事件投影 | safeUrl, text, eventView, createModelAuthService |
| src/model-config.js | 619 | Pi models.json 无损配置读写与共享收藏持久化 | sdkModelConfig, sdkResolveConfigValue, digest, LEVELS |
| src/pi-model-storage.js | 409 | 模型与凭据 SQLite 权威存储、Pi 派生兼容文件 | sdkResolveConfigValue, sdkIsCommandConfigValue, NAMESPACE, AUTH_NAMESPACE |
| src/pi.js | 575 | createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档） | agentRuntime, queueStateOf, hasModelOutput, withdrawQueue |
| src/prompts.js | 60 | Axiom 自有提示词按 main/subagent/compaction 角色集中维护 | MAIN_AGENT_PROMPT, TITLE_INSTRUCTION, SUBAGENT_PROMPT, WRAP_UP_PROMPT |
| src/protocol.js | 373 | zod 协议：selection / command 判别联合（消息类型见 L3） | id, capabilities, workspace, thinking |
| src/questions.js | 86 | 主代理 question 工具、参数校验与可取消的回答等待 | text, option, input, questionAnswers |
| src/remote.js | 547 | Tailscale 登录身份、远程监听、同账号授权与本机配置持久化 | configSchema, execOptions, cliEnv, defaultRun |
| src/retry.js | 196 | 模型失败重试：可取消退避、最多45次、16分钟封顶、自定义错误词表、保留已有工具结果继续 | RETRY_DELAYS_MS, MAX_DELAY_MS, MAX_RETRIES, RECOVERY_PROMPT |
| src/server.js | 526 | createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发 | dev, digest, load, freshen |
| src/session-billing.js | 63 | 全会话 entries 用量与费用统计、当前上下文估算 | keys, zero, number, sessionBilling |
| src/session-history.js | 201 | 稳定消息身份、绑定会话/实例/修订的历史游标与有界传输页 | HISTORY_PAGE_DEFAULT, HISTORY_PAGE_MAX, HISTORY_PAGE_RECORDS_MAX, CURSOR_VERSION |
| src/session-memory.js | 34 | 标题提取登记、轮次预算挂钩与委派背景 | textOf, memoryHooks |
| src/session-store.js | 479 | 会话三表、实体增量更新、逐会话事务与旧数据迁移 | EVENT_TYPES, SESSION_FIELDS, TABLES, INDEXES |
| src/sessions.js | 2015 | Sessions：会话生命周期、增量保存、元数据启动与SDK按需恢复 | GOAL_TOOL_NAMES, hasRunningTasks, relevantTools, delegateTaskIds |
| src/task-budget.js | 35 | 主子代理轮次预算规则、收尾提示词与配置页参数校验 | TASK_BUDGET_LIMITS, taskBudgetDefaults, within, taskBudgetPolicy |
| src/tasks.js | 234 | Tasks：子任务（委托）生命周期 | ACTIVE, historyResult, Tasks |
| src/tools.js | 157 | delegationTools：委托/凭证读取/追加工具定义（zod 入参） | delegateInput, readInput, appendInput, result |
| src/transport.js | 37 | 统一有界 WS 发送：回执、广播、删除通知与慢客户端隔离 | createSender |
| src/update.js | 41 | 检查更新：本地安装（提交 SHA/版本）比对 GitHub 公开仓库 master，npm 安装实例可自动重装 | repo, npmSpec, commitFile, validateCommit |
| tests/__pycache__/goal-ui.cpython-312.pyc | 165 | node --test 测试（npm test） | - |
| tests/activity-groups-ui.py | 201 | node --test 测试（npm test） | activityHistory, sessions |
| tests/answer-tags.test.js | 56 | node --test 测试（npm test） | open |
| tests/app.test.js | 2043 | node --test 测试（npm test） | pickerSource, modelSources, serviceSource |
| tests/autoscroll-ui.py | 99 | node --test 测试（npm test） | - |
| tests/autostart.test.js | 71 | node --test 测试（npm test） | node, cwd, service |
| tests/benchmark.js | 92 | node --test 测试（npm test） | window |
| tests/capabilities.test.js | 314 | node --test 测试（npm test） | - |
| tests/cli-help.test.js | 46 | node --test 测试（npm test） | cli |
| tests/clipboard.test.js | 85 | node --test 测试（npm test） | loadCopyText, dom |
| tests/codebase-index.test.js | 20 | node --test 测试（npm test） | ROOT, SKILL |
| tests/compaction-config.test.js | 165 | node --test 测试（npm test） | - |
| tests/compaction-ui.py | 57 | node --test 测试（npm test） | - |
| tests/compaction-ui.test.js | 189 | node --test 测试（npm test） | page |
| tests/compaction.test.js | 823 | node --test 测试（npm test） | fakeModel, createTestSession, seq, userMsg |
| tests/config.test.js | 309 | node --test 测试（npm test） | - |
| tests/context-menu-ui.py | 66 | node --test 测试（npm test） | - |
| tests/continuous-history.test.js | 53 | node --test 测试（npm test） | send |
| tests/continuous-preview.mjs | 19 | node --test 测试（npm test） | id, history, records, state |
| tests/continuous-ui.py | 27 | node --test 测试（npm test） | - |
| tests/conversation-font-ui.py | 43 | node --test 测试（npm test） | - |
| tests/conversation-preview.mjs | 157 | node --test 测试（npm test） | markdown, message, thinking, state |
| tests/conversation-ui.py | 280 | node --test 测试（npm test） | - |
| tests/data-owner.test.js | 24 | node --test 测试（npm test） | - |
| tests/data-version.test.js | 25 | node --test 测试（npm test） | - |
| tests/database.test.js | 149 | node --test 测试（npm test） | - |
| tests/defaults.test.js | 185 | node --test 测试（npm test） | - |
| tests/dev-assets.test.js | 46 | node --test 测试（npm test） | - |
| tests/dev-vite-ui.py | 49 | node --test 测试（npm test） | - |
| tests/dev-vite.test.js | 52 | node --test 测试（npm test） | - |
| tests/file-picker.test.js | 68 | node --test 测试（npm test） | source, tick |
| tests/frontend-regions-preview.mjs | 64 | node --test 测试（npm test） | home, catalog, factory, sessions |
| tests/frontend-regions-ui.py | 452 | node --test 测试（npm test） | - |
| tests/frontend-regions.test.js | 214 | node --test 测试（npm test） | appSource, pickerSource, modelPickerSource, modelSources |
| tests/git-log-ui.py | 39 | node --test 测试（npm test） | - |
| tests/git-log.test.js | 53 | node --test 测试（npm test） | - |
| tests/goal-command-ui.test.js | 143 | node --test 测试（npm test） | page, $, settle, input |
| tests/goal-markers.test.js | 118 | node --test 测试（npm test） | page, lastAssistant |
| tests/goal-pi.test.js | 288 | node --test 测试（npm test） | PREAMBLE, FOOTER, run |
| tests/goal-preview.mjs | 148 | node --test 测试（npm test） | cwd, seq, text, makeState |
| tests/goal-protocol.test.js | 15 | node --test 测试（npm test） | - |
| tests/goal-sessions.test.js | 740 | node --test 测试（npm test） | PLAN, factoryFixture, tick, until |
| tests/goal-ui.py | 488 | node --test 测试（npm test） | - |
| tests/goal-ui.test.js | 432 | node --test 测试（npm test） | page, $, labels, messages |
| tests/goal.test.js | 856 | node --test 测试（npm test） | ROUND, GOAL, PLAN, PLAN2 |
| tests/helpers/history-page.js | 183 | node --test 测试（npm test） | PAGE_SIZE, CONFIG, makeRecords, html |
| tests/helpers/model-concurrency-child.mjs | 93 | node --test 测试（npm test） | barrier, runOpponent |
| tests/helpers/public-source.js | 14 | node --test 测试（npm test） | publicSource, event, appliedSeq |
| tests/history-dom-window.test.js | 123 | node --test 测试（npm test） | md, records, attachAndPageUp, mixed |
| tests/history-main-budget.test.js | 182 | node --test 测试（npm test） | fakeSource, mainRecord, subRecord, delegateAnchor |
| tests/history-page-cache.test.js | 72 | node --test 测试（npm test） | md, records |
| tests/history-prepend-records.test.js | 23 | node --test 测试（npm test） | - |
| tests/history-reading.test.js | 204 | node --test 测试（npm test） | - |
| tests/icons.test.js | 39 | node --test 测试（npm test） | - |
| tests/image-input.test.js | 169 | node --test 测试（npm test） | pngBase64, jpegBase64, image, parsePrompt |
| tests/inline-images.test.js | 42 | node --test 测试（npm test） | text, a, b, user |
| tests/install.test.js | 150 | node --test 测试（npm test） | fakeService |
| tests/internal-task-queue.test.js | 41 | node --test 测试（npm test） | custom, user |
| tests/manual-retry.test.js | 203 | node --test 测试（npm test） | session, assistant, page, message |
| tests/markdown-page-cache.test.js | 123 | node --test 测试（npm test） | loadRenderer, SAMPLE, OTHER |
| tests/markdown-scan.test.js | 88 | node --test 测试（npm test） | B, randomPiece |
| tests/markdown.test.js | 346 | node --test 测试（npm test） | - |
| tests/memory-preview.mjs | 22 | node --test 测试（npm test） | state, sessions, app |
| tests/memory-tags.test.js | 115 | node --test 测试（npm test） | - |
| tests/memory-ui.test.js | 132 | node --test 测试（npm test） | page |
| tests/message-activity.test.js | 523 | node --test 测试（npm test） | page, assistant, thought, call |
| tests/mobile-reading-ui.py | 130 | node --test 测试（npm test） | - |
| tests/model-auth.test.js | 133 | node --test 测试（npm test） | SECRET, fakeAuth, waitFor, noLeak |
| tests/model-config.test.js | 1159 | node --test 测试（npm test） | sha, EMPTY, tempDir, openDatabases |
| tests/model-manager.test.js | 1566 | node --test 测试（npm test） | authSource, source, tick, j |
| tests/model-onboarding-ui.test.js | 185 | node --test 测试（npm test） | stripImports, modelSources, pickerSource, memoryTagsSource |
| tests/model-onboarding.test.js | 78 | node --test 测试（npm test） | - |
| tests/model-picker.test.js | 423 | node --test 测试（npm test） | source, tick, nap, OPTS |
| tests/model-runtime-catalog.test.js | 27 | node --test 测试（npm test） | - |
| tests/model-selection-preview.mjs | 52 | node --test 测试（npm test） | home, catalog, factory, sessions |
| tests/model-selection-ui.py | 60 | node --test 测试（npm test） | - |
| tests/model-settings-ui.py | 44 | node --test 测试（npm test） | - |
| tests/model-thinking-favorites.test.js | 123 | node --test 测试（npm test） | appSource, pickerSource, modelSources, html |
| tests/perf-attach-ground-truth.test.js | 261 | node --test 测试（npm test） | FILE, SOURCE, BASE, extractFunction |
| tests/perf-measure-lock.test.js | 28 | node --test 测试（npm test） | - |
| tests/perf-profile-cli.test.js | 82 | node --test 测试（npm test） | script, realCrossCheck |
| tests/perf-startup-cleanup.test.js | 206 | node --test 测试（npm test） | DIR, SCRIPTS, extractFunction, dropLine |
| tests/pi-memory.test.js | 180 | node --test 测试（npm test） | - |
| tests/pi-model-storage.test.js | 624 | node --test 测试（npm test） | tempDir, makeStorage, seedPiModels, seedPiAuth |
| tests/pi-question.test.js | 197 | node --test 测试（npm test） | - |
| tests/project-skills.test.js | 143 | node --test 测试（npm test） | scopeKey, setup |
| tests/prompt-resize.test.js | 144 | node --test 测试（npm test） | page |
| tests/question-layout-ui.py | 48 | node --test 测试（npm test） | - |
| tests/question-preview.mjs | 36 | node --test 测试（npm test） | factory, sessions, app, port |
| tests/question-ui.test.js | 99 | node --test 测试（npm test） | source |
| tests/questions.test.js | 110 | node --test 测试（npm test） | params |
| tests/realtime-transport.test.js | 125 | node --test 测试（npm test） | rig, flush |
| tests/recall.test.js | 202 | node --test 测试（npm test） | user, assistant, thinking, fixture |
| tests/remote-ui.py | 51 | node --test 测试（npm test） | - |
| tests/remote-ui.test.js | 230 | node --test 测试（npm test） | page, modelSources, flush, stubRequest |
| tests/remote.test.js | 751 | node --test 测试（npm test） | EMAIL, mockTailscale, fakeChild, fakeDatabase |
| tests/render-capacity-ui.py | 222 | node --test 测试（npm test） | COUNT, capacityRecords, capacityHistory, capacityBase |
| tests/restored-history-order.test.js | 48 | node --test 测试（npm test） | - |
| tests/retry-settings-ui.py | 30 | node --test 测试（npm test） | - |
| tests/retry.test.js | 407 | node --test 测试（npm test） | RATE_LIMIT, QUOTA, ABORTED, fakeSession |
| tests/safe-stop.test.js | 228 | node --test 测试（npm test） | - |
| tests/send-optimistic.test.js | 138 | node --test 测试（npm test） | userEnd |
| tests/serialize-worker.test.js | 129 | node --test 测试（npm test） | rig, BIG |
| tests/server.test.js | 168 | node --test 测试（npm test） | - |
| tests/service-api.test.js | 106 | node --test 测试（npm test） | - |
| tests/service-settings-api.test.js | 71 | node --test 测试（npm test） | - |
| tests/service-settings-ui.py | 60 | node --test 测试（npm test） | - |
| tests/service-settings.test.js | 377 | node --test 测试（npm test） | source, html, setup |
| tests/service.test.js | 684 | node --test 测试（npm test） | until, readMaybe, killTree, buildWorkspace |
| tests/session-billing-ui.py | 70 | node --test 测试（npm test） | - |
| tests/session-billing.test.js | 41 | node --test 测试（npm test） | usage |
| tests/session-cache.test.js | 115 | node --test 测试（npm test） | clean, withDraft, withImages |
| tests/session-created-at.test.js | 44 | node --test 测试（npm test） | factory |
| tests/session-details.test.js | 36 | node --test 测试（npm test） | - |
| tests/session-flow.test.js | 590 | node --test 测试（npm test） | flowFactory, jsonlFactory |
| tests/session-history.test.js | 417 | node --test 测试（npm test） | build, ids, ask, fakeSource |
| tests/session-memory.test.js | 162 | node --test 测试（npm test） | reply |
| tests/session-migration.test.js | 282 | node --test 测试（npm test） | factory, workspaceHash |
| tests/session-model-restore.test.js | 61 | node --test 测试（npm test） | stubFactory, cleanup |
| tests/session-persistence.test.js | 464 | node --test 测试（npm test） | factory |
| tests/session-sidebar-ui.py | 172 | node --test 测试（npm test） | - |
| tests/session-store.test.js | 640 | node --test 测试（npm test） | withStore, fullSaved, LEGACY_DDL |
| tests/smoke.js | 67 | node --test 测试（npm test） | TIMEOUT, sessions |
| tests/smooth-stream-browser.py | 179 | node --test 测试（npm test） | - |
| tests/smooth-stream-preview.mjs | 269 | node --test 测试（npm test） | repo, root, vendor, types |
| tests/smooth-stream.test.js | 108 | node --test 测试（npm test） | fixture |
| tests/snapshot-chunk.test.js | 106 | node --test 测试（npm test） | messageEvent, login |
| tests/snapshot-first-screen.test.js | 103 | node --test 测试（npm test） | TOTAL, login |
| tests/snapshot-switch.test.js | 227 | node --test 测试（npm test） | messageEvent, login |
| tests/sqlite-benchmark.mjs | 914 | node --test 测试（npm test） | parseArgs, args, scriptPath, repoDir |
| tests/stream-playback.test.js | 321 | node --test 测试（npm test） | segmenter, boundaries, assertBoundary |
| tests/stream-renderer.test.js | 532 | node --test 测试（npm test） | setVisibility, virtualTimers, streamItem |
| tests/subagent-billing.test.js | 112 | node --test 测试（npm test） | usage, billed, factory |
| tests/subagent-persistence.test.js | 123 | node --test 测试（npm test） | factory |
| tests/task-budget.test.js | 102 | node --test 测试（npm test） | factory |
| tests/task-cancel-notifications.test.js | 61 | node --test 测试（npm test） | until |
| tests/task-notifications.test.js | 254 | node --test 测试（npm test） | factoryFixture, tick, until |
| tests/task-resume.test.js | 182 | node --test 测试（npm test） | fakeAgent, fixture, restored |
| tests/task-timer.test.js | 55 | node --test 测试（npm test） | factory, state, settle |
| tests/tasks.test.js | 269 | node --test 测试（npm test） | fixture |
| tests/text-diagram-ui.py | 37 | node --test 测试（npm test） | - |
| tests/tool-detail-reclaim.test.js | 160 | node --test 测试（npm test） | page, toggle, entry |
| tests/tooltip.test.js | 282 | node --test 测试（npm test） | source, boot, fire, tip |
| tests/ui-sticky-check.html | 63 | node --test 测试（npm test） | checks, lines, ok |
| tests/ui-sticky-check.mjs | 104 | node --test 测试（npm test） | here, candidates, browser, port |
| tests/uninstall.test.js | 45 | node --test 测试（npm test） | - |
| tests/update.test.js | 38 | node --test 测试（npm test） | old |
| tests/workspace-isolation.test.js | 80 | node --test 测试（npm test） | - |
| tests/workspace-picker.test.js | 99 | node --test 测试（npm test） | - |
| tests/workspace-tabs.test.js | 284 | node --test 测试（npm test） | appSource, pickerSource, modelSources, html |

## L2 符号 → 行号（跳转：read <文件> offset=<行>）

### public/answer-tags.js（48 行） — 主代理回答标签解析、代码保护与流式容错

| 符号 | 类型 | 行 |
|---|---|---|
| OPEN | const | 6 |
| CLOSE | const | 7 |
| MARKS | const | 8 |
| isMark | const | 10 |
| splitAnswer | function | 12 |

### public/app.js（4615 行） — 前端唯一入口：视图栈、会话/设置 UI、权威归并与渲染调度

| 符号 | 类型 | 行 |
|---|---|---|
| questionUI | const | 20 |
| filePicker | const | 22 |
| $ | const | 23 |
| sessionDetail | const | 25 |
| openSessionDetail | function | 26 |
| sessionId | const | 35 |
| sessionMissing | const | 48 |
| onboarding | const | 49 |
| allSessions | const | 50 |
| views | const | 52 |
| HISTORY_LIMIT | const | 53 |
| historyState | const | 54 |
| hiddenDirty | const | 55 |
| goalUI | function | 59 |
| compactionDefaults | const | 75 |
| taskBudgetDefaults | const | 77 |
| effectiveLevels | function | 81 |
| modelFavorites | const | 86 |
| favoriteKey | function | 89 |
| modelPicker | const | 94 |
| modelManager | const | 108 |
| serviceUi | const | 109 |
| compactions | const | 110 |
| HISTORY_DOM_LIMIT | const | 116 |
| trimmedForwardBoundary | const | 117 |
| goalAnchors | const | 119 |
| anchorGoal | function | 120 |
| clearGoalPrompt | function | 126 |
| resizePrompt | method | 131 |
| region | method | 132 |
| lastMainMessage | const | 135 |
| compactionNodes | const | 136 |
| images | const | 137 |
| completionVersion | const | 138 |
| selectedSkill | const | 139 |
| hiddenSessions | const | 143 |
| pinnedSessions | const | 149 |
| openCwds | const | 155 |
| sessionGroupPrefs | const | 162 |
| saveSessionGroupPrefs | function | 168 |
| seenSessions | const | 173 |
| markSessionSeen | function | 178 |
| readSessionPreference | function | 185 |
| changeSessionPreference | function | 189 |
| setSessionHidden | function | 204 |
| setSessionPinned | function | 212 |
| focusSessionMore | function | 220 |
| saveView | function | 233 |
| promptLayout | const | 252 |
| promptFit | const | 253 |
| resizePrompt | function | 254 |
| invalidatePrompt | function | 263 |
| scrollFrame | const | 264 |
| FOLLOW_GAP | const | 265 |
| scrollIntent | const | 266 |
| lastScrollTops | const | 267 |
| noteScrollIntent | const | 269 |
| atLatest | const | 271 |
| readFollow | function | 274 |
| scrollToLatest | const | 283 |
| scrollLatest | function | 284 |
| scheduleCallGroups | method | 285 |
| transcript | const | 294 |
| growthWatch | const | 296 |
| growthObserver | function | 297 |
| watchGrowth | function | 300 |
| forgetGrowth | function | 301 |
| renderer | const | 304 |
| markdownPageCache | const | 307 |
| pageCacheCurrent | function | 308 |
| prefetchHistory | method | 328 |
| prefetchForward | method | 329 |
| scrollLatest | method | 352 |
| mobile | const | 354 |
| sidebar | function | 355 |
| sidebar | method | 370 |
| sidebar | method | 373 |
| invalidatePrompt | method | 374 |
| promptResizeFrame | const | 379 |
| fontScale | const | 388 |
| applyConversationFontScale | function | 389 |
| savedFontScale | const | 394 |
| applyConversationFontScale | method | 398 |
| themeColors | const | 404 |
| applyTheme | function | 405 |
| applyTheme | method | 416 |
| live | const | 425 |
| error | function | 426 |
| rawEntries | const | 430 |
| rawMode | function | 431 |
| rawMode | method | 439 |
| rawChanged | function | 450 |
| rawEntry | function | 456 |
| selectRaw | function | 461 |
| rawMode | method | 463 |
| TASK_NOTIFICATION_TYPE | const | 480 |
| TASK_NOTIFICATION_PREFIX | const | 481 |
| isTaskNotification | const | 482 |
| taskNotificationCard | function | 491 |
| scrollLatest | method | 503 |
| bindRaw | function | 506 |
| paintRaw | function | 520 |
| request | function | 568 |
| region | function | 573 |
| updateAvailability | function | 577 |
| updateNavigation | method | 578 |
| region | method | 579 |
| region | method | 580 |
| region | method | 581 |
| region | method | 582 |
| updateConnection | function | 584 |
| updateModelAvailability | function | 589 |
| updateSettingsAvailability | function | 597 |
| updateNavigation | function | 610 |
| duplicateBlocked | function | 624 |
| updateComposer | function | 627 |
| renderContextChips | method | 638 |
| syncRetryPrompt | method | 649 |
| options | function | 651 |
| providerEntries | const | 662 |
| modelEntries | const | 663 |
| catalogRequest | const | 665 |
| refreshModelCatalog | function | 666 |
| updateNavigation | method | 688 |
| fillModels | function | 696 |
| options | method | 698 |
| renderAgentConfig | function | 700 |
| options | method | 704 |
| fillModels | method | 705 |
| options | method | 707 |
| fillSubagentModels | function | 711 |
| options | method | 713 |
| capabilityName | function | 721 |
| runtimeSummary | function | 731 |
| renderRuntime | function | 744 |
| updateTaskRuntime | function | 765 |
| renderRuntime | method | 767 |
| renderBill | method | 769 |
| applyConfig | function | 772 |
| region | method | 775 |
| region | method | 776 |
| region | method | 777 |
| renderComposerConfig | function | 779 |
| options | method | 780 |
| renderModelConfig | function | 786 |
| options | method | 787 |
| fillSubagentModels | method | 792 |
| renderAgentConfig | method | 793 |
| configureSeq | const | 796 |
| configure | function | 797 |
| updateAvailability | method | 808 |
| taskBudgetInputs | const | 831 |
| settingsGeneration | const | 832 |
| budgetRequest | const | 833 |
| settingsTicket | const | 834 |
| loadTaskBudget | function | 844 |
| saveTaskBudget | function | 855 |
| showSettingsPanel | function | 871 |
| showSettingsPanel | method | 890 |
| CONNECTION_KEY | const | 895 |
| normalizeBackendAddress | function | 896 |
| openConnectionPanel | function | 909 |
| showSettingsPanel | method | 928 |
| region | method | 929 |
| remoteView | const | 941 |
| remoteLoaded | const | 942 |
| remoteAnchor | function | 943 |
| remoteRender | function | 951 |
| region | method | 997 |
| remoteLoad | function | 999 |
| remoteAuthUrl | function | 1019 |
| remoteLogin | function | 1027 |
| remoteOnReconnect | function | 1053 |
| updateAvailability | method | 1067 |
| messageItems | const | 1080 |
| activityPaths | const | 1082 |
| setActivityIcon | function | 1099 |
| callGroupsFrame | const | 1109 |
| scheduleCallGroups | function | 1110 |
| createCallGroup | function | 1120 |
| paintCallGroup | function | 1134 |
| refreshCallGroups | function | 1176 |
| foldCallsBeforeMessage | function | 1308 |
| paintCallGroup | method | 1312 |
| disclosureHint | function | 1314 |
| activityLine | function | 1328 |
| setActivity | method | 1338 |
| setActivity | function | 1341 |
| scheduleCallGroups | method | 1342 |
| setActivityIcon | method | 1344 |
| waiting | function | 1355 |
| scheduleCallGroups | method | 1357 |
| scrollLatest | method | 1363 |
| clearWaiting | function | 1365 |
| stopActivity | function | 1369 |
| scheduleCallGroups | method | 1371 |
| clearWaiting | method | 1372 |
| updateActivity | function | 1384 |
| setActivity | method | 1399 |
| setActivity | method | 1400 |
| mergeThoughts | function | 1404 |
| diffView | const | 1422 |
| renderToolDetail | function | 1427 |
| section | method | 1515 |
| toolState | function | 1517 |
| clearWaiting | method | 1519 |
| setActivity | method | 1563 |
| renderToolDetail | method | 1564 |
| scrollLatest | method | 1565 |
| card | function | 1567 |
| prepareStream | function | 1631 |
| updateActivity | method | 1654 |
| renderMessage | function | 1656 |
| updateActivity | method | 1764 |
| renderCompactionStatus | function | 1767 |
| markTruncatedTasks | function | 1785 |
| trackTaskEntries | function | 1797 |
| placeCompactedTasks | function | 1808 |
| placeCompactedRetries | method | 1809 |
| compactionCard | function | 1838 |
| renderMarkdown | method | 1858 |
| foldCompaction | function | 1861 |
| placeCompactedTasks | method | 1883 |
| mergeThoughts | method | 1884 |
| compactionEditor | function | 1891 |
| options | method | 1929 |
| fillThinking | method | 1959 |
| retryChipList | function | 1970 |
| render | method | 2019 |
| retryEditor | function | 2023 |
| renderTaskRuns | function | 2043 |
| renderQueue | function | 2074 |
| canResumeMessage | const | 2094 |
| retryPrompt | const | 2096 |
| syncRetryPrompt | function | 2097 |
| scrollLatest | method | 2126 |
| retryCards | const | 2128 |
| placeCompactedRetries | function | 2129 |
| retryArchive | function | 2153 |
| renderRetry | function | 2166 |
| placeCompactedRetries | method | 2202 |
| scrollLatest | method | 2203 |
| applyEvent | function | 2205 |
| prefetchHistory | function | 2471 |
| trimMountedWindow | function | 2478 |
| prefetchForward | function | 2527 |
| prependHistory | function | 2541 |
| markTruncatedTasks | method | 2570 |
| restoreRetries | method | 2573 |
| mergeThoughts | method | 2579 |
| placeCompactedTasks | method | 2581 |
| trimMountedWindow | method | 2582 |
| rawChanged | method | 2583 |
| paintHistoryControls | method | 2585 |
| snapshotJob | const | 2589 |
| pendingRestore | const | 2592 |
| scheduleAnchorRestore | function | 2593 |
| flushAnchorRestore | function | 2596 |
| snapshot | function | 2603 |
| mountHistory | function | 2620 |
| finishSnapshot | method | 2626 |
| paintHistoryControls | method | 2627 |
| paintHistoryControls | function | 2629 |
| loadHistory | function | 2645 |
| saveView | method | 2647 |
| paintHistoryControls | method | 2651 |
| latestHistory | function | 2678 |
| saveView | method | 2680 |
| receiveHistoryEvent | function | 2693 |
| applyEvent | method | 2726 |
| beginSnapshot | function | 2744 |
| rawChanged | method | 2754 |
| clearTimeout | method | 2757 |
| markSessionSeen | method | 2774 |
| updatePageTitle | method | 2778 |
| renderTaskRuns | method | 2791 |
| renderCompactionStatus | method | 2796 |
| markTruncatedTasks | method | 2807 |
| renderImages | method | 2834 |
| closeCompletion | method | 2837 |
| placeSnapshotMessage | function | 2843 |
| finishSnapshot | function | 2900 |
| mergeThoughts | method | 2927 |
| placeCompactedTasks | method | 2941 |
| renderTaskRuns | method | 2942 |
| renderQueue | method | 2962 |
| applyConfig | method | 2965 |
| updateAvailability | method | 2967 |
| region | method | 2968 |
| transport | const | 2970 |
| onState | method | 2974 |
| initialized | const | 3010 |
| initializeConnection | function | 3011 |
| importDir | const | 3128 |
| fillModels | method | 3133 |
| fillSubagentModels | method | 3140 |
| closeCompletion | method | 3157 |
| region | method | 3163 |
| scrollLatest | method | 3168 |
| pendingUser | const | 3215 |
| mountPendingUser | function | 3216 |
| renderMessage | method | 3220 |
| settlePendingUser | function | 3230 |
| failPendingUser | function | 3234 |
| nextPaint | function | 3249 |
| enableImagePreview | function | 3257 |
| renderImages | function | 3278 |
| addImages | function | 3303 |
| loadImages | function | 3324 |
| renderImages | method | 3333 |
| selectionCopy | const | 3356 |
| copySelection | function | 3368 |
| escapeTimer | const | 3431 |
| withdrawQueue | function | 3432 |
| markSessionSeen | method | 3510 |
| renderSessions | method | 3511 |
| region | method | 3512 |
| stopSession | function | 3526 |
| refreshing | const | 3535 |
| refreshSessions | function | 3536 |
| timerText | function | 3552 |
| renderTaskTimer | function | 3559 |
| applyElapsed | function | 3572 |
| renderTaskTimer | method | 3578 |
| updatePageTitle | function | 3580 |
| updateSessions | function | 3584 |
| renderTaskTimer | method | 3586 |
| updatePageTitle | method | 3598 |
| renderSessions | method | 3599 |
| recoverMissingSession | function | 3601 |
| region | method | 3603 |
| saveView | method | 3610 |
| updateAvailability | method | 3614 |
| switchSession | function | 3631 |
| saveView | method | 3633 |
| updateAvailability | method | 3636 |
| copySessionFile | function | 3653 |
| positionSessionMenu | function | 3666 |
| normalizeCwd | function | 3672 |
| sessionDayLabel | function | 3676 |
| renderSessions | function | 3689 |
| sessionAction | const | 4011 |
| openSessionAction | function | 4013 |
| contextIcon | function | 4054 |
| renderContextChips | function | 4057 |
| fuzzyHit | function | 4076 |
| renderContextResults | function | 4083 |
| showContextSkills | function | 4103 |
| positionContextSkills | function | 4108 |
| showContextSkills | method | 4120 |
| region | method | 4155 |
| skillTrigger | const | 4157 |
| showContextSkills | method | 4173 |
| resizePrompt | method | 4182 |
| region | method | 4183 |
| SLASH_COMMANDS | const | 4188 |
| closeCompletion | function | 4191 |
| highlightCompletion | function | 4199 |
| chooseCompletion | function | 4208 |
| closeCompletion | method | 4220 |
| updateCompletion | function | 4223 |
| closeCompletion | method | 4224 |
| resizePrompt | method | 4283 |
| region | method | 4284 |
| switchSession | method | 4324 |
| creationLoad | const | 4335 |
| defaultsScope | const | 4337 |
| renderDefaultsScope | function | 4338 |
| options | method | 4339 |
| refreshDefaultsScope | function | 4342 |
| renderDefaultsScope | method | 4348 |
| createAgentPicker | function | 4351 |
| options | method | 4377 |
| fill | method | 4384 |
| fillThinking | method | 4392 |
| options | method | 4394 |
| defaultsSelection | const | 4440 |
| defaultsSaving | const | 4453 |
| loadCreation | function | 4455 |
| disposePickers | method | 4462 |
| disposePickers | method | 4463 |
| disposePickers | function | 4492 |
| openDefaults | function | 4495 |
| disposePickers | method | 4500 |
| updateAvailability | method | 4546 |
| updateDefaultsPreview | function | 4559 |
| updateDefaultsPreview | method | 4583 |
| updateAvailability | method | 4599 |

### public/clipboard.js（27 行） — 统一剪贴板入口：Clipboard API 优先，非安全上下文回退 execCommand

| 符号 | 类型 | 行 |
|---|---|---|
| copyText | function | 5 |

### public/file-picker.js（356 行） — 共享文件/目录选择弹窗、懒加载与分类 SVG 图标

| 符号 | 类型 | 行 |
|---|---|---|
| NS | const | 12 |
| SEARCH_DEBOUNCE | const | 13 |
| el | function | 17 |
| FOLDER_COLORS | const | 30 |
| FOLDER_ALIASES | const | 31 |
| FOLDER_COLOR | const | 32 |
| FOLDER_BASE | const | 33 |
| DOC_BASE | const | 34 |
| p | const | 36 |
| c | const | 37 |
| t | const | 38 |
| FOLDER_GLYPHS | const | 44 |
| FILE_GLYPHS | const | 52 |
| KIND_BY_EXT | const | 66 |
| kindOf | function | 83 |
| fileIcon | function | 95 |
| createFilePicker | function | 116 |
| baseName | function | 353 |

### public/goal-markers.js（64 行） — 前后端共享 goal 完成标记解析与展示层剥离（含流式半截）

| 符号 | 类型 | 行 |
|---|---|---|
| ROUND_MARKER | const | 9 |
| GOAL_MARKER | const | 10 |
| MARKER_TOKENS | const | 13 |
| SUFFIXES | const | 15 |
| signalLines | function | 21 |
| parseGoalMarkers | function | 32 |
| stripGoalMarkers | function | 47 |

### public/goal.js（644 行） — Goal 专属状态、操作与复用消息轮次分组

| 符号 | 类型 | 行 |
|---|---|---|
| createGoalUI | function | 10 |

### public/icons.js（93 行） — 全页面动作 SVG 图标：固定几何路径字典、静态控件与模板水合

| 符号 | 类型 | 行 |
|---|---|---|
| actionIconPaths | const | 3 |
| initActionIcons | function | 50 |
| actionIconNode | function | 80 |
| actionIcon | function | 89 |

### public/markdown-scan.js（140 行） — 共享代码区扫描：围栏/缩进/行内代码掩码与区间切割

| 符号 | 类型 | 行 |
|---|---|---|
| FILL | const | 13 |
| FENCE | const | 15 |
| INLINE | const | 17 |
| fill | const | 18 |
| scanLines | function | 23 |
| initState | const | 57 |
| inlineMask | const | 60 |
| maskCode | function | 63 |
| createMaskCache | function | 75 |
| maskCodeCached | function | 79 |
| commit | method | 94 |
| commit | function | 101 |
| cutSpans | function | 121 |

### public/markdown.js（481 行） — marked + DOMPurify 渲染（XSS 边界）

| 符号 | 类型 | 行 |
|---|---|---|
| cache | const | 5 |
| PAGE_CACHE_ENTRY_LIMIT | const | 12 |
| PAGE_CACHE_BYTE_LIMIT | const | 13 |
| createMarkdownPageCache | function | 14 |
| policy | const | 46 |
| textLanguages | const | 52 |
| isText | const | 53 |
| wideCharacter | const | 54 |
| graphemes | function | 55 |
| numericCell | const | 56 |
| placeholderCell | const | 57 |
| ruleLine | const | 58 |
| borderedRows | function | 61 |
| alignedRows | function | 80 |
| gitLogTable | function | 123 |
| textTable | function | 161 |
| looksLikeDiagram | function | 197 |
| layoutDiagram | function | 204 |
| isJson | function | 233 |
| fixCjkBold | function | 240 |
| jsonControls | function | 254 |
| linksSignature | function | 296 |
| renderMarkdown | function | 306 |
| PLAIN_CHARS | const | 466 |

### public/memory-tags.js（107 行） — 主子代理共享简单标签提取与流式显示过滤

| 符号 | 类型 | 行 |
|---|---|---|
| LIVE | const | 9 |
| DEAD | const | 11 |
| TAGS | const | 12 |
| NAMES | const | 13 |
| TAG | const | 15 |
| OPEN | const | 16 |
| CLOSE | const | 17 |
| MARKS | const | 18 |
| TITLE_MAX | const | 19 |
| PARENT | const | 21 |
| HOLE | const | 23 |
| hide | const | 24 |
| sanitize | const | 26 |
| headLine | function | 29 |
| inHead | const | 37 |
| inParent | function | 39 |
| attributedOpen | const | 48 |
| extractMemoryTags | function | 52 |
| stripMemoryTags | function | 72 |

### public/model-auth.js（97 行） — 网页登录：授权提示、设备码、凭据输入与取消

| 符号 | 类型 | 行 |
|---|---|---|
| createModelAuth | function | 2 |

### public/model-manager.js（1521 行） — 统一模型管理：供应商、字段覆盖与思考等级编辑

| 符号 | 类型 | 行 |
|---|---|---|
| THINKING_LEVELS | const | 25 |
| API_TYPES | const | 26 |
| PROVIDER_TEMPLATES | const | 34 |
| PROVIDER_ID | const | 65 |
| MASK_KINDS | const | 66 |
| DRAFT | const | 68 |
| HIDDEN_VIEW | const | 70 |
| MANAGED_PROVIDER_KEYS | const | 73 |
| MANAGED_MODEL_KEYS | const | 74 |
| DERIVED_MODEL_KEYS | const | 77 |
| MODEL_EXTRA_EXCLUDE | const | 79 |
| TAB_CONNECTION | const | 81 |
| TAB_MODELS | const | 82 |
| isMask | const | 84 |
| hasOwn | const | 85 |
| clone | const | 86 |
| keepMasked | function | 88 |
| stable | function | 96 |
| el | function | 104 |
| fieldSeq | const | 120 |
| field | function | 122 |
| badge | function | 131 |
| parseJsonText | function | 135 |
| ICONS | const | 148 |
| icon | function | 155 |
| openModal | function | 162 |
| closeModal | function | 166 |
| openDialog | function | 175 |
| openModal | method | 193 |
| initModelManager | function | 198 |
| renderProviders | method | 1518 |

### public/model-picker.js（382 行） — 共享模型选择器：供应商/模型/思考收藏、排序与键盘交互

| 符号 | 类型 | 行 |
|---|---|---|
| GAP | const | 29 |
| EDGE | const | 30 |
| TYPEAHEAD_MS | const | 31 |
| instanceSeq | const | 32 |
| el | function | 36 |
| createModelPicker | function | 46 |
| addEventListener | method | 376 |
| addEventListener | method | 377 |

### public/question.js（232 行） — 主代理提问选项卡、键盘交互与回答提交

| 符号 | 类型 | 行 |
|---|---|---|
| createQuestionUI | function | 2 |

### public/service-settings.js（281 行） — 设置页服务维护：真实进度、结果、更新确认与独立维护通道

| 符号 | 类型 | 行 |
|---|---|---|
| MAINT_URL_RE | const | 16 |
| POLL_MS | const | 17 |
| initServiceSettings | function | 19 |

### public/session-cache.js（53 行） — 可淘汰会话阅读位置缓存与未保存输入保护

| 符号 | 类型 | 行 |
|---|---|---|
| EVICTABLE_VIEWS | const | 7 |
| hasUnsavedInput | const | 9 |
| createSessionCache | function | 11 |

### public/session-details.js（141 行） — 主代理页签、安全可折叠 JSON 树与会话账单渲染

| 符号 | 类型 | 行 |
|---|---|---|
| detailElement | class | 2 |
| money | const | 8 |
| precise | const | 9 |
| count | const | 10 |
| jsonTree | function | 12 |
| initInspector | function | 27 |
| renderTools | function | 46 |
| costTable | function | 73 |
| renderBill | function | 93 |

### public/stream-playback.js（165 行） — 有界字素播放游标与真实时间缓冲追赶

| 符号 | 类型 | 行 |
|---|---|---|
| BUFFER_MS | const | 22 |
| BASE_RATE | const | 23 |
| CATCHUP_S | const | 24 |
| MAX_RATE | const | 25 |
| HOLD_TAIL_MS | const | 26 |
| MAX_STEP_G | const | 27 |
| MAX_TAIL_G | const | 28 |
| MAX_TEXT | const | 29 |
| makeSegmenter | const | 32 |
| createPlayback | function | 35 |

### public/stream-renderer.js（179 行） — 共享 rAF 流式绘制、交互让路与挂载生命周期

| 符号 | 类型 | 行 |
|---|---|---|
| createStreamRenderer | function | 4 |

### public/tooltip.js（225 行） — 共享悬停说明：动态 title、键盘、定位与无障碍

| 符号 | 类型 | 行 |
|---|---|---|
| SHOW_DELAY | const | 14 |
| HIDE_DELAY | const | 15 |
| GAP | const | 16 |
| EDGE | const | 17 |
| meta | const | 19 |
| current | const | 20 |
| deferred | const | 21 |
| popped | const | 22 |
| showTimer | const | 23 |
| hideTimer | const | 24 |
| tip | const | 26 |
| pos | const | 32 |
| cssPos | function | 33 |
| hot | function | 49 |
| lookup | function | 58 |
| restore | function | 68 |
| mount | function | 79 |
| unmount | function | 91 |
| position | function | 97 |
| showFor | function | 111 |
| hide | method | 114 |
| cancelHide | function | 136 |
| clearTimeout | method | 137 |
| finish | function | 141 |
| hide | function | 151 |
| clearTimeout | method | 152 |
| cancelHide | method | 164 |
| finish | method | 165 |
| hide | method | 196 |
| showFor | method | 202 |

### public/transport.js（269 行） — 业务 WS 唯一所有者：请求回执、逻辑订阅、快照事件闸门与有界恢复

| 符号 | 类型 | 行 |
|---|---|---|
| SERIALIZE_THRESHOLD | const | 4 |
| WORKER_SOURCE | const | 5 |
| estimateBytes | function | 9 |
| createTransport | function | 19 |

### scripts/autostart.mjs（138 行） — Windows/macOS/Linux 当前用户登录自动启动安装/卸载

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
| isEnabled | const | 118 |
| platform | method | 119 |
| main | function | 121 |

### scripts/dev-vite.mjs（69 行） — 独立 Vite 前端：CSS 热替换、同源代理与整页刷新暂停

| 符号 | 类型 | 行 |
|---|---|---|
| startDevWeb | function | 5 |

### scripts/install.mjs（72 行） — 一键安装：装依赖/注册自启/启动守护/健康检查/打开浏览器

| 符号 | 类型 | 行 |
|---|---|---|
| root | const | 15 |
| parseArgs | const | 17 |
| ensurePi | const | 29 |
| viaShell | const | 36 |
| ask | const | 41 |
| install | function | 43 |
| invoked | const | 69 |

### scripts/maint-server.mjs（86 行） — loopback维护HTTP：来源校验、随机凭证、状态与离线恢复

| 符号 | 类型 | 行 |
|---|---|---|
| MAX_BODY | const | 7 |
| hash | const | 8 |
| json | const | 9 |
| allow | method | 10 |
| startMaintServer | function | 15 |

### scripts/maint-state.mjs（138 行） — 守护维护状态：持久化阶段、最近结果与有界脱敏证据

| 符号 | 类型 | 行 |
|---|---|---|
| NAMESPACE | const | 8 |
| LOG_LIMIT | const | 9 |
| redact | function | 13 |
| sanitize | function | 21 |
| createMaintState | function | 27 |
| persist | method | 102 |

### scripts/service.mjs（619 行） — 服务守护：IPC 重启、HTTP 安全停止与崩溃退避停止通道

| 符号 | 类型 | 行 |
|---|---|---|
| root | const | 17 |
| output | const | 18 |
| run | function | 19 |
| npmRun | const | 32 |
| installTag | function | 40 |
| controlPath | function | 43 |
| stagedSha | const | 49 |
| verifySdkImport | function | 59 |
| prepareUpdate | function | 68 |
| swapUpdate | function | 86 |
| commitUpdate | function | 116 |
| rollbackUpdate | function | 122 |
| update | function | 130 |
| prepareRebuild | function | 138 |
| swapRebuild | function | 151 |
| commitRebuild | function | 162 |
| rollbackRebuild | function | 166 |
| rebuild | function | 172 |
| READY_TIMEOUT_MS | const | 180 |
| localPort | function | 184 |
| localAddress | const | 191 |
| homeDir | const | 196 |
| openCommand | const | 200 |
| openPage | function | 205 |
| spawn | method | 207 |
| firstRunGuide | function | 212 |
| serviceReady | const | 229 |
| fetch | method | 230 |
| startBackground | function | 237 |
| spawn | method | 239 |
| startCli | function | 250 |
| supervise | function | 257 |
| mkdirSync | method | 266 |
| spawnWorker | method | 551 |
| invoked | const | 555 |
| stopService | function | 556 |
| HELP | const | 592 |
| FORE | const | 604 |
| COMMANDS | const | 605 |

### scripts/uninstall.mjs（18 行） — 统一卸载：核对 npm 目标、安全停止、取消自启、保留用户数据

| 符号 | 类型 | 行 |
|---|---|---|
| uninstall | function | 8 |

### src/capabilities.js（159 行） — 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities）

| 符号 | 类型 | 行 |
|---|---|---|
| sdkEntry | const | 13 |
| resolver | const | 14 |
| alias | const | 15 |
| jiti | const | 22 |
| MAIN_EXCLUDED_SKILLS | const | 28 |
| snapshotSettings | function | 30 |
| discoverCapabilities | function | 43 |
| resolveCapabilities | function | 90 |
| refreshProjectSkills | function | 107 |
| capabilityLoader | function | 118 |

### src/compaction.js（391 行） — 后台独立摘要、token/占比阈值、快照校验与 turn 安全提交

| 符号 | 类型 | 行 |
|---|---|---|
| contextTokens | function | 22 |
| prepareBackgroundCompaction | function | 29 |
| DEFAULT_COMPACTION_CONFIG | const | 56 |
| normalizeCompaction | function | 58 |
| overCompactionThreshold | function | 62 |
| entryIdFor | function | 68 |
| summarizedEntryIds | function | 81 |
| COMPACT_MAX | const | 102 |
| parseSummaryOutput | function | 103 |
| throwIfAborted | function | 127 |
| summarizeWithPiSession | function | 131 |
| throwIfAborted | method | 132 |
| createBackgroundCompaction | function | 205 |

### src/data-owner.js（23 行） — 写库前数据根独占：内核管道或socket持有，禁止同根双写

| 符号 | 类型 | 行 |
|---|---|---|
| claimDataRoot | function | 6 |

### src/database.js（122 行） — 共享 SQLite 连接、小配置 KV、WAL 与一致性备份

| 符号 | 类型 | 行 |
|---|---|---|
| nodeOk | const | 5 |
| DATA_VERSION | const | 14 |
| assertDataVersion | function | 17 |
| Database | class | 36 |
| constructor | method | 40 |
| get | method | 72 |
| set | method | 82 |
| list | method | 97 |
| prepare | method | 110 |
| exec | method | 114 |
| close | method | 118 |

### src/goal.js（988 行） — Goal：会话级目标状态、轮次计划、验收门与持久化

| 符号 | 类型 | 行 |
|---|---|---|
| GOAL_PHASES | const | 45 |
| GOAL_ACTIONS | const | 48 |
| ROUND_STATUSES | const | 50 |
| GOAL_MAX_SEGMENTS | const | 52 |
| SUMMARY_MAX | const | 54 |
| NON_EVIDENCE_TOOLS | const | 56 |
| ACTIVE_TASKS | const | 57 |
| messageText | const | 59 |
| normCriterion | const | 63 |
| bodyText | const | 66 |
| firstLine | const | 67 |
| normalizeToolResult | const | 69 |
| TABLE | const | 82 |
| createGoalStore | function | 88 |
| GoalStore | class | 92 |
| constructor | method | 97 |
| load | method | 108 |
| save | method | 119 |
| remove | method | 129 |
| list | method | 138 |
| planText | const | 153 |
| planRound | const | 154 |
| planSchema | const | 159 |
| evidenceItem | const | 166 |
| evidenceSchema | const | 172 |
| field | const | 177 |
| list | const | 178 |
| result | const | 179 |
| bullets | const | 180 |
| Goal | class | 184 |
| constructor | method | 193 |
| snapshot | method | 209 |
| evidence | method | 235 |
| failure | method | 240 |
| context | method | 245 |
| submitPlan | method | 312 |
| planTool | method | 345 |
| blockTool | method | 384 |
| progressTool | method | 395 |
| verificationTool | method | 408 |
| submitEvidence | method | 449 |
| noteToolResult | method | 510 |
| action | method | 518 |
| onReply | method | 536 |
| pauseAtSafePoint | method | 579 |
| fail | method | 592 |
| settle | method | 600 |
| whenSettled | method | 606 |
| freeze | method | 612 |
| exit | method | 622 |
| remove | method | 631 |
| supplyObjective | method | 671 |

### src/inline-images.js（32 行） — 模型上下文图片定位：将占位符与真实附件交错排列，不改存储与队列

| 符号 | 类型 | 行 |
|---|---|---|
| inlineImages | function | 2 |
| inlineImagesExtension | function | 29 |

### src/main.js（139 行） — 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理

| 符号 | 类型 | 行 |
|---|---|---|
| port | const | 19 |
| host | const | 23 |
| cwd | const | 24 |
| home | const | 29 |
| releaseDataRoot | const | 31 |
| database | const | 39 |
| modelStorage | const | 40 |
| factory | const | 42 |
| sessions | const | 47 |
| models | const | 49 |
| idleTimer | const | 52 |
| service | const | 56 |
| app | const | 89 |
| remoteReady | const | 94 |
| initRemote | function | 103 |
| closing | const | 113 |
| stop | function | 114 |
| clearInterval | method | 115 |

### src/model-auth.js（89 行） — SDK 登录桥：连接隔离、超时取消与安全事件投影

| 符号 | 类型 | 行 |
|---|---|---|
| safeUrl | const | 3 |
| text | const | 9 |
| eventView | function | 10 |
| createModelAuthService | function | 17 |

### src/model-config.js（619 行） — Pi models.json 无损配置读写与共享收藏持久化

| 符号 | 类型 | 行 |
|---|---|---|
| sdkModelConfig | const | 11 |
| sdkResolveConfigValue | const | 12 |
| digest | const | 26 |
| LEVELS | const | 27 |
| FAVORITE_GROUPS | const | 28 |
| FAVORITE_CAP | const | 29 |
| DISCOVER_APIS | const | 31 |
| DISCOVER_BODY_LIMIT | const | 37 |
| DISCOVER_MODEL_CAP | const | 38 |
| providerPattern | const | 39 |
| envPattern | const | 41 |
| kindOf | const | 43 |
| maskHeaders | const | 44 |
| maskModel | const | 53 |
| maskProvider | function | 58 |
| resolveSecret | function | 75 |
| checkBaseUrl | function | 87 |
| mergeHeaders | function | 97 |
| mergeProvider | function | 108 |
| applyModel | function | 132 |
| validFavoriteKey | function | 149 |
| resolveDiscoverSecret | function | 168 |
| readBodyCapped | function | 179 |
| parseDiscoverBody | function | 205 |
| normalizeFavorites | function | 250 |
| HIDDEN_CAP | const | 260 |
| normalizeHidden | function | 261 |
| createModelsService | function | 266 |

### src/pi-model-storage.js（409 行） — 模型与凭据 SQLite 权威存储、Pi 派生兼容文件

| 符号 | 类型 | 行 |
|---|---|---|
| sdkResolveConfigValue | const | 10 |
| sdkIsCommandConfigValue | const | 11 |
| NAMESPACE | const | 26 |
| AUTH_NAMESPACE | const | 27 |
| MIGRATED_NAMESPACE | const | 28 |
| CONFIG_KEY | const | 29 |
| FAVORITES_KEY | const | 30 |
| HIDDEN_KEY | const | 32 |
| IMPORT_ERROR_KEY | const | 33 |
| canonicalModelsJson | function | 36 |
| isPlainObject | const | 40 |
| isCredential | const | 42 |
| isPlainObject | method | 43 |
| createPiModelStorage | function | 51 |

### src/pi.js（575 行） — createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档）

| 符号 | 类型 | 行 |
|---|---|---|
| agentRuntime | function | 17 |
| queueStateOf | function | 33 |
| hasModelOutput | function | 62 |
| withdrawQueue | function | 73 |
| recallLastMessage | function | 91 |
| CHECKPOINT_BOUNDARY | const | 119 |
| memoryExtension | function | 130 |
| createPiFactory | function | 154 |

### src/prompts.js（60 行） — Axiom 自有提示词按 main/subagent/compaction 角色集中维护

| 符号 | 类型 | 行 |
|---|---|---|
| MAIN_AGENT_PROMPT | const | 3 |
| TITLE_INSTRUCTION | const | 34 |
| SUBAGENT_PROMPT | const | 37 |
| WRAP_UP_PROMPT | const | 38 |
| budgetSystemPrompt | const | 39 |
| SUMMARY_SYSTEM_PROMPT | const | 43 |
| summaryRequest | function | 46 |

### src/protocol.js（373 行） — zod 协议：selection / command 判别联合（消息类型见 L3）

| 符号 | 类型 | 行 |
|---|---|---|
| id | const | 5 |
| capabilities | const | 6 |
| workspace | const | 9 |
| thinking | const | 10 |
| queueType | const | 11 |
| base64Pattern | const | 13 |
| decodedBytes | const | 14 |
| promptImage | const | 15 |
| promptImages | const | 26 |
| imageSignatures | const | 31 |
| assertPromptImages | function | 38 |
| compactionDefaults | const | 45 |
| compaction | const | 49 |
| resolveCompaction | function | 60 |
| retryPatterns | const | 70 |
| selection | const | 76 |
| taskBudget | const | 89 |
| providerKey | const | 94 |
| modelKey | const | 97 |
| secretValueIn | const | 104 |
| secretHeadersIn | const | 109 |
| thinkingLevelMapIn | const | 110 |
| costIn | const | 118 |
| providerConfigIn | const | 137 |
| modelConfigIn | const | 155 |
| modelOverrideIn | const | 172 |
| fingerprintIn | const | 173 |
| command | const | 174 |

### src/questions.js（86 行） — 主代理 question 工具、参数校验与可取消的回答等待

| 符号 | 类型 | 行 |
|---|---|---|
| text | const | 3 |
| option | const | 4 |
| input | const | 5 |
| questionAnswers | const | 12 |
| string | const | 13 |
| createQuestions | function | 16 |

### src/remote.js（547 行） — Tailscale 登录身份、远程监听、同账号授权与本机配置持久化

| 符号 | 类型 | 行 |
|---|---|---|
| configSchema | const | 13 |
| execOptions | const | 17 |
| cliEnv | const | 19 |
| defaultRun | const | 20 |
| defaultCandidates | const | 27 |
| createTailscale | const | 41 |
| isTailnetIPv4 | const | 78 |
| selfStatus | function | 89 |
| whoisUser | function | 111 |
| describeError | const | 122 |
| defaultSpawnLogin | const | 132 |
| spawn | method | 133 |
| AUTH_URL | const | 134 |
| MAX_WHOIS | const | 137 |
| LOGIN_OUTPUT_CAP | const | 138 |
| createRemoteAccess | function | 140 |

### src/retry.js（196 行） — 模型失败重试：可取消退避、最多45次、16分钟封顶、自定义错误词表、保留已有工具结果继续

| 符号 | 类型 | 行 |
|---|---|---|
| RETRY_DELAYS_MS | const | 5 |
| MAX_DELAY_MS | const | 6 |
| MAX_RETRIES | const | 7 |
| RECOVERY_PROMPT | const | 8 |
| delayFor | const | 9 |
| MAX_TIMEOUT_MS | const | 15 |
| abortableSleep | const | 16 |
| classify | class | 52 |
| dropFailedAssistant | function | 76 |
| RESUMABLE_STOP_REASONS | const | 85 |
| canResume | function | 86 |
| createAutoRetry | function | 102 |

### src/server.js（526 行） — createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发

| 符号 | 类型 | 行 |
|---|---|---|
| dev | const | 12 |
| digest | const | 13 |
| load | const | 14 |
| freshen | const | 19 |
| assets | const | 29 |
| createServerApp | function | 75 |

### src/session-billing.js（63 行） — 全会话 entries 用量与费用统计、当前上下文估算

| 符号 | 类型 | 行 |
|---|---|---|
| keys | const | 3 |
| zero | const | 4 |
| number | const | 5 |
| sessionBilling | function | 9 |
| combinedBilling | function | 35 |
| usageRuntime | function | 54 |

### src/session-history.js（201 行） — 稳定消息身份、绑定会话/实例/修订的历史游标与有界传输页

| 符号 | 类型 | 行 |
|---|---|---|
| HISTORY_PAGE_DEFAULT | const | 16 |
| HISTORY_PAGE_MAX | const | 17 |
| HISTORY_PAGE_RECORDS_MAX | const | 21 |
| CURSOR_VERSION | const | 23 |
| revisions | const | 27 |
| nextRevision | const | 28 |
| messageIdOf | const | 31 |
| createHistory | function | 33 |
| touchHistory | function | 38 |
| fail | const | 43 |
| resolveLimit | function | 47 |
| encodeCursor | const | 54 |
| decodeCursor | function | 57 |
| bindCursor | function | 72 |
| toPageRecord | const | 81 |
| pageOf | function | 93 |
| readSessionManager | function | 192 |
| readSessionHistory | function | 199 |

### src/session-memory.js（34 行） — 标题提取登记、轮次预算挂钩与委派背景

| 符号 | 类型 | 行 |
|---|---|---|
| textOf | const | 4 |
| memoryHooks | function | 11 |

### src/session-store.js（479 行） — 会话三表、实体增量更新、逐会话事务与旧数据迁移

| 符号 | 类型 | 行 |
|---|---|---|
| EVENT_TYPES | const | 13 |
| SESSION_FIELDS | const | 16 |
| TABLES | const | 31 |
| INDEXES | const | 67 |
| BACKFILL_EVENT_KEYS | const | 79 |
| DEAD_TABLES | const | 84 |
| DEAD_COLUMNS | const | 85 |
| DEAD_EVENT_TYPES | const | 86 |
| SessionStore | class | 88 |
| constructor | method | 92 |
| change | method | 155 |
| hasSession | method | 177 |
| listSessions | method | 182 |
| listPendingSessionIds | method | 203 |
| getSession | method | 211 |
| insertSession | method | 311 |
| importLegacySession | method | 337 |
| migrateLegacy | method | 354 |
| updateSession | method | 376 |
| deleteSession | method | 400 |
| saveEvent | method | 406 |
| deleteEvents | method | 432 |
| saveTask | method | 450 |
| listTasks | method | 473 |

### src/sessions.js（2015 行） — Sessions：会话生命周期、增量保存、元数据启动与SDK按需恢复

| 符号 | 类型 | 行 |
|---|---|---|
| GOAL_TOOL_NAMES | const | 25 |
| hasRunningTasks | const | 27 |
| relevantTools | function | 30 |
| delegateTaskIds | const | 48 |
| projectTimeline | function | 61 |
| pageTasks | function | 84 |
| pageRetries | function | 96 |
| translateRetries | function | 113 |
| BROWSE_PAGE | const | 134 |
| SEARCH_LIMIT | const | 136 |
| SEARCH_DIR_LIMIT | const | 137 |
| IGNORED_ENTRIES | const | 139 |
| fuzzyHit | function | 142 |
| matchRank | function | 153 |
| searchEntries | function | 162 |
| pointStatus | function | 190 |
| trackElapsed | function | 197 |
| fallbackTitle | function | 208 |
| resolveDir | function | 213 |
| parentOf | function | 224 |
| absoluteCrumbs | function | 233 |
| importedTitle | function | 255 |
| duplicateTitle | function | 279 |
| hostLocations | function | 291 |
| landedSessionFile | function | 310 |
| RETRYABLE_SQLITE | const | 317 |
| retryableWrite | const | 318 |
| DEFAULTS_NS | const | 323 |
| WORKSPACE_PREFIX | const | 324 |
| workspaceKeyOf | const | 325 |
| CAPABILITY_KINDS | const | 326 |
| catalogProjectsOf | const | 328 |
| validateProjectSkills | function | 331 |
| validateProjectSkillEntry | function | 335 |
| mergeLegacyProjectSkills | function | 343 |
| Sessions | class | 352 |
| constructor | method | 353 |
| applyDefaults | method | 377 |
| loadDefaults | method | 383 |
| migrateDefaults | method | 395 |
| migrateLegacyStore | method | 410 |
| loadWorkspaceDefaults | method | 434 |
| loadTaskBudget | method | 453 |
| getTaskBudget | method | 468 |
| configureTaskBudget | method | 474 |
| getDefaults | method | 481 |
| defaultsFor | method | 485 |
| listDefaults | method | 489 |
| deleteDefaults | method | 495 |
| removeDefaults | method | 500 |
| workspaceDefaults | method | 510 |
| configureDefaults | method | 530 |
| saveDefaults | method | 536 |
| pushCompaction | method | 575 |
| validateSelection | method | 586 |
| validateCompaction | method | 617 |
| load | method | 631 |
| ensureLoaded | method | 656 |
| migrateLegacySessions | method | 680 |
| sessionData | method | 704 |
| persist | method | 723 |
| writeChange | method | 752 |
| saveChange | method | 768 |
| list | method | 773 |
| rename | method | 790 |
| importSession | method | 803 |
| duplicate | method | 833 |
| create | method | 890 |
| goalAction | method | 1285 |
| scheduleGoal | method | 1331 |
| advanceGoal | method | 1343 |
| goalNotificationsBlocked | method | 1381 |
| scheduleTaskNotifications | method | 1388 |
| deliverTaskNotifications | method | 1401 |
| settleTaskNotifications | method | 1446 |
| get | method | 1467 |
| revealWorkspace | method | 1472 |
| browse | method | 1486 |
| listFiles | method | 1492 |
| refreshSkills | method | 1554 |
| snapshot | method | 1563 |
| history | method | 1662 |
| subscribe | method | 1672 |
| configure | method | 1680 |
| startRun | method | 1716 |
| retry | method | 1762 |
| prompt | method | 1771 |
| withdraw | method | 1805 |
| replyQuestion | method | 1861 |
| safeStop | method | 1870 |
| cancel | method | 1885 |
| retryTask | method | 1911 |
| deleteRecords | method | 1922 |
| releaseIdle | method | 1933 |
| remove | method | 1956 |
| close | method | 2005 |

### src/task-budget.js（35 行） — 主子代理轮次预算规则、收尾提示词与配置页参数校验

| 符号 | 类型 | 行 |
|---|---|---|
| TASK_BUDGET_LIMITS | const | 10 |
| taskBudgetDefaults | const | 13 |
| within | const | 15 |
| taskBudgetPolicy | function | 22 |

### src/tasks.js（234 行） — Tasks：子任务（委托）生命周期

| 符号 | 类型 | 行 |
|---|---|---|
| ACTIVE | const | 4 |
| historyResult | const | 7 |
| Tasks | class | 16 |
| constructor | method | 17 |
| start | method | 25 |
| snapshotJob | method | 41 |
| publish | method | 50 |
| view | method | 57 |
| retryable | method | 64 |
| snapshot | method | 69 |
| run | method | 73 |
| finalize | method | 145 |
| read | method | 153 |
| retry | method | 161 |
| append | method | 180 |
| cancelTask | method | 192 |
| cancel | method | 211 |
| interrupt | method | 227 |

### src/tools.js（157 行） — delegationTools：委托/凭证读取/追加工具定义（zod 入参）

| 符号 | 类型 | 行 |
|---|---|---|
| delegateInput | const | 3 |
| readInput | const | 11 |
| appendInput | const | 14 |
| result | const | 21 |
| cancelInput | const | 24 |
| delegationTools | function | 28 |

### src/transport.js（37 行） — 统一有界 WS 发送：回执、广播、删除通知与慢客户端隔离

| 符号 | 类型 | 行 |
|---|---|---|
| createSender | function | 2 |

### src/update.js（41 行） — 检查更新：本地安装（提交 SHA/版本）比对 GitHub 公开仓库 master，npm 安装实例可自动重装

| 符号 | 类型 | 行 |
|---|---|---|
| repo | const | 6 |
| npmSpec | const | 7 |
| commitFile | const | 8 |
| validateCommit | function | 10 |
| checkUpdate | function | 15 |

### tests/activity-groups-ui.py（201 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| activityHistory | const | 16 |
| sessions | const | 27 |

### tests/answer-tags.test.js（56 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| open | const | 5 |

### tests/app.test.js（2043 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| pickerSource | const | 10 |
| modelSources | const | 11 |
| serviceSource | const | 16 |

### tests/autostart.test.js（71 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| node | const | 16 |
| cwd | const | 17 |
| service | const | 18 |

### tests/benchmark.js（92 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| window | const | 9 |

### tests/cli-help.test.js（46 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| cli | const | 27 |
| spawnSync | method | 28 |

### tests/clipboard.test.js（85 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| loadCopyText | const | 8 |
| dom | const | 13 |

### tests/codebase-index.test.js（20 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| ROOT | const | 7 |
| SKILL | const | 8 |
| execFileSync | method | 11 |

### tests/compaction-ui.test.js（189 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 11 |
| restore | method | 41 |

### tests/compaction.test.js（823 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| fakeModel | const | 104 |
| createTestSession | function | 117 |
| seq | const | 134 |
| userMsg | const | 135 |
| assistantMsg | const | 136 |
| big | const | 142 |
| seed | function | 144 |
| settle | const | 149 |
| waitFor | function | 151 |
| enabledConfig | const | 159 |
| fakeSummarize | function | 168 |
| startHangingLlmServer | function | 176 |
| startFakeLlmServer | function | 199 |
| zodError | method | 256 |
| zodError | method | 257 |
| zodError | method | 258 |
| zodError | method | 259 |
| zodError | method | 260 |
| zodError | method | 261 |
| hangingSummarize | function | 586 |
| createLoopSession | function | 683 |
| writeFileSync | method | 684 |

### tests/continuous-history.test.js（53 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| send | const | 5 |
| send | method | 31 |

### tests/continuous-preview.mjs（19 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| id | const | 4 |
| history | const | 5 |
| records | const | 6 |
| state | const | 7 |
| snapshot | const | 8 |
| sessions | const | 9 |
| app | const | 17 |

### tests/conversation-preview.mjs（157 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| markdown | const | 4 |
| message | const | 21 |
| thinking | const | 26 |
| state | const | 38 |
| sequence | const | 51 |
| add | const | 52 |
| assistant | const | 53 |
| add | method | 65 |
| add | method | 66 |
| states | const | 70 |
| longState | const | 81 |
| compactState | const | 97 |
| childBill | const | 119 |
| billedTasks | const | 123 |
| mainBill | const | 127 |
| totalCost | const | 128 |
| sessions | const | 133 |
| app | const | 154 |
| port | const | 155 |

### tests/file-picker.test.js（68 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| source | const | 7 |
| tick | const | 8 |

### tests/frontend-regions-preview.mjs（64 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| home | const | 16 |
| catalog | const | 17 |
| factory | const | 26 |
| sessions | const | 43 |
| database | const | 45 |
| storage | const | 46 |
| models | const | 48 |
| app | const | 52 |
| port | const | 53 |
| close | function | 56 |

### tests/frontend-regions.test.js（214 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| appSource | const | 11 |
| pickerSource | const | 12 |
| modelPickerSource | const | 13 |
| modelSources | const | 14 |
| html | const | 18 |
| message | const | 20 |
| state | const | 25 |
| STATES | const | 31 |
| bootPage | function | 36 |
| values | const | 99 |
| MODEL_IDS | const | 100 |

### tests/goal-command-ui.test.js（143 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 11 |
| restore | method | 48 |
| $ | const | 51 |
| settle | const | 52 |
| input | const | 53 |
| key | const | 54 |

### tests/goal-markers.test.js（118 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 17 |
| restore | method | 49 |
| lastAssistant | const | 53 |

### tests/goal-pi.test.js（288 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| PREAMBLE | const | 15 |
| FOOTER | const | 74 |
| run | const | 79 |

### tests/goal-preview.mjs（148 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| cwd | const | 7 |
| seq | const | 8 |
| text | const | 9 |
| makeState | const | 10 |
| add | const | 16 |
| result | const | 18 |
| add | method | 19 |
| call | const | 20 |
| goalFor | const | 21 |
| plan | const | 27 |
| ROUND0 | const | 39 |
| running | const | 50 |
| runningGoal | const | 52 |
| EVIDENCE | const | 71 |
| paused | const | 81 |
| pausedGoal | const | 83 |
| ready | const | 96 |
| readyGoal | const | 98 |
| chat | const | 105 |
| fresh | const | 110 |
| states | const | 112 |
| goals | const | 113 |
| sessions | const | 114 |
| app | const | 130 |
| preferred | const | 132 |
| listen | method | 146 |

### tests/goal-sessions.test.js（740 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| PLAN | const | 11 |
| factoryFixture | function | 22 |
| tick | const | 53 |
| until | function | 54 |
| ordinary | function | 60 |
| enterGoal | function | 69 |
| injectToolResult | function | 303 |
| reply | function | 311 |
| evidenceBody | const | 323 |

### tests/goal-ui.test.js（432 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 11 |
| restore | method | 51 |
| $ | const | 54 |
| labels | const | 55 |
| messages | const | 56 |

### tests/goal.test.js（856 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| ROUND | const | 9 |
| GOAL | const | 10 |
| PLAN | const | 12 |
| PLAN2 | const | 18 |
| PLAN_MULTI | const | 24 |
| make | const | 34 |
| asst | const | 40 |
| toolText | const | 41 |
| call | const | 42 |
| runningGoal | const | 45 |
| verifyingGoal | const | 54 |
| evidenceTool | const | 60 |

### tests/helpers/history-page.js（183 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| PAGE_SIZE | const | 15 |
| CONFIG | const | 16 |
| makeRecords | const | 19 |
| html | const | 26 |
| pickerSource | const | 27 |
| modelSources | const | 28 |
| pageSource | const | 34 |
| answerSource | const | 36 |
| markdownSource | const | 37 |
| sessionState | function | 42 |
| settle | const | 48 |
| until | function | 49 |
| bootHistoryPage | function | 60 |

### tests/helpers/model-concurrency-child.mjs（93 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| barrier | const | 11 |
| writeSync | method | 12 |
| runOpponent | function | 28 |
| createInterface | method | 40 |

### tests/helpers/public-source.js（14 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| publicSource | const | 5 |
| event | function | 11 |
| appliedSeq | const | 12 |

### tests/history-dom-window.test.js（123 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| md | const | 8 |
| records | const | 9 |
| attachAndPageUp | function | 15 |
| mixed | const | 90 |

### tests/history-main-budget.test.js（182 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| fakeSource | function | 13 |
| mainRecord | const | 30 |
| subRecord | const | 32 |
| delegateAnchor | const | 34 |
| append | const | 38 |
| mainCount | const | 43 |
| boot | function | 45 |
| append | method | 50 |
| check | method | 93 |
| check | method | 103 |

### tests/history-page-cache.test.js（72 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| md | const | 9 |
| records | const | 10 |

### tests/icons.test.js（39 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| initActionIcons | method | 26 |
| initActionIcons | method | 35 |

### tests/image-input.test.js（169 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| pngBase64 | const | 13 |
| jpegBase64 | const | 14 |
| image | const | 15 |
| parsePrompt | const | 17 |

### tests/inline-images.test.js（42 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| text | const | 5 |
| a | const | 6 |
| b | const | 7 |
| user | const | 8 |
| inlineImagesExtension | method | 32 |

### tests/install.test.js（150 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| fakeService | const | 109 |

### tests/internal-task-queue.test.js（41 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| custom | const | 5 |
| user | const | 6 |
| test | method | 9 |

### tests/manual-retry.test.js（203 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| session | const | 12 |
| assistant | const | 13 |
| dropFailedAssistant | method | 28 |
| dropFailedAssistant | method | 32 |
| dropFailedAssistant | method | 35 |
| finish | method | 62 |
| finish | method | 83 |
| page | function | 99 |
| restore | method | 131 |
| message | const | 135 |
| prompt | const | 136 |

### tests/markdown-page-cache.test.js（123 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| loadRenderer | function | 11 |
| SAMPLE | const | 27 |
| OTHER | const | 28 |

### tests/markdown-scan.test.js（88 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| B | const | 8 |
| randomPiece | function | 10 |
| maskCodeCached | method | 58 |
| maskCodeCached | method | 78 |
| maskCodeCached | method | 83 |

### tests/memory-preview.mjs（22 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| state | const | 3 |
| sessions | const | 12 |
| app | const | 19 |

### tests/memory-ui.test.js（132 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 14 |
| restore | method | 46 |

### tests/message-activity.test.js（523 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 12 |
| restore | method | 48 |
| assistant | const | 52 |
| thought | const | 53 |
| call | const | 54 |
| entry | const | 55 |

### tests/model-auth.test.js（133 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| SECRET | const | 5 |
| fakeAuth | function | 8 |
| waitFor | function | 19 |
| noLeak | const | 29 |
| status | const | 30 |
| noLeak | method | 49 |
| noLeak | method | 55 |
| noLeak | method | 63 |
| noLeak | method | 75 |
| noLeak | method | 131 |

### tests/model-config.test.js（1159 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| sha | const | 19 |
| EMPTY | const | 21 |
| tempDir | function | 23 |
| openDatabases | const | 28 |
| closeOpenDatabases | const | 29 |
| makeService | function | 33 |
| seed | const | 54 |
| compat | const | 61 |
| discoverKey | const | 662 |
| mockFetch | const | 663 |
| jsonResponse | const | 672 |
| test | method | 951 |

### tests/model-manager.test.js（1566 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| authSource | const | 11 |
| source | const | 12 |
| tick | const | 13 |
| j | const | 15 |
| masked | const | 17 |
| harness | function | 19 |
| apiSelect | method | 88 |
| apiSelect | method | 89 |
| setInput_on | method | 256 |
| setInput_on | function | 289 |
| modelDelete | method | 352 |
| dialogButton | method | 356 |
| modelDelete | method | 362 |
| dialogButton | method | 364 |
| dialogButton | method | 382 |
| confirm | method | 415 |
| confirm | method | 422 |
| row | method | 577 |
| row | method | 588 |
| discoverPanelEl | const | 896 |
| discoverRows | const | 897 |
| rowBox | const | 898 |
| addSelectedButton | const | 899 |
| fetchButton | const | 900 |
| checkRow | const | 901 |
| rowBox | method | 902 |
| rowBox | method | 903 |
| fetchButton | method | 913 |
| checkRow | method | 934 |
| fetchButton | method | 946 |
| checkRow | method | 958 |
| checkRow | method | 959 |
| addSelectedButton | method | 960 |
| fetchButton | method | 994 |
| addSelectedButton | method | 1001 |
| addSelectedButton | method | 1020 |
| fetchButton | method | 1042 |
| fetchButton | method | 1050 |
| fetchButton | method | 1075 |
| fetchButton | method | 1094 |
| fetchButton | method | 1097 |
| fetchButton | method | 1114 |
| fetchButton | method | 1120 |
| sonnetCatalog | const | 1138 |
| openSonnet | const | 1143 |
| checkLevel | const | 1151 |
| checkLevel | method | 1170 |
| checkLevel | method | 1199 |
| confirmDialog | method | 1263 |
| confirmDialog | method | 1295 |
| toggle | method | 1508 |
| toggle | method | 1512 |
| toggle | method | 1516 |
| toggle | method | 1560 |
| toggle | method | 1562 |

### tests/model-onboarding-ui.test.js（185 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| stripImports | const | 9 |
| modelSources | const | 10 |
| pickerSource | const | 15 |
| memoryTagsSource | const | 16 |
| appSource | const | 17 |
| config | const | 19 |
| harness | const | 20 |

### tests/model-picker.test.js（423 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| source | const | 7 |
| tick | const | 8 |
| nap | const | 9 |
| OPTS | const | 11 |
| SELECT | const | 15 |
| boot | function | 18 |
| $ | const | 52 |
| key | const | 53 |
| click | const | 55 |
| menu | const | 56 |
| opts | const | 57 |
| stars | const | 58 |

### tests/model-selection-preview.mjs（52 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| home | const | 11 |
| catalog | const | 12 |
| factory | const | 18 |
| sessions | const | 33 |
| database | const | 35 |
| storage | const | 36 |
| models | const | 38 |
| app | const | 41 |
| port | const | 42 |
| close | function | 44 |

### tests/model-thinking-favorites.test.js（123 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| appSource | const | 10 |
| pickerSource | const | 11 |
| modelSources | const | 12 |
| html | const | 17 |
| MODEL_KEY | const | 19 |
| bootPage | function | 21 |
| click | const | 77 |
| menu | const | 78 |
| opts | const | 79 |
| stars | const | 80 |

### tests/perf-attach-ground-truth.test.js（261 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| FILE | const | 18 |
| SOURCE | const | 19 |
| BASE | const | 20 |
| extractFunction | function | 23 |
| extractLine | function | 53 |
| dropLine | function | 59 |
| FakeSocket | class | 68 |
| constructor | method | 69 |
| addEventListener | method | 82 |
| emit | method | 83 |
| send | method | 87 |
| close | method | 88 |
| payload | const | 97 |
| harness | function | 112 |
| rejectOf | const | 151 |

### tests/perf-profile-cli.test.js（82 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| script | const | 10 |
| realCrossCheck | function | 13 |
| crossCheckDurs | method | 42 |

### tests/perf-startup-cleanup.test.js（206 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| DIR | const | 18 |
| SCRIPTS | const | 20 |
| extractFunction | function | 38 |
| dropLine | function | 68 |
| fakeProc | function | 76 |
| timerSeq | const | 89 |
| harness | function | 91 |
| failingFetch | const | 135 |
| test | method | 138 |
| test | method | 161 |
| test | method | 178 |

### tests/pi-model-storage.test.js（624 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| tempDir | function | 13 |
| makeStorage | function | 18 |
| seedPiModels | const | 23 |
| seedPiAuth | const | 27 |

### tests/project-skills.test.js（143 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| scopeKey | const | 9 |
| setup | function | 16 |

### tests/prompt-resize.test.js（144 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 12 |

### tests/question-preview.mjs（36 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 5 |
| sessions | const | 31 |
| app | const | 33 |
| port | const | 34 |

### tests/question-ui.test.js（99 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| source | const | 6 |

### tests/questions.test.js（110 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| params | const | 28 |

### tests/realtime-transport.test.js（125 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| rig | function | 6 |
| flush | const | 23 |
| assert | method | 113 |

### tests/recall.test.js（202 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| user | const | 9 |
| assistant | const | 10 |
| thinking | const | 11 |
| fixture | function | 13 |

### tests/remote-ui.test.js（230 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 11 |
| modelSources | const | 16 |
| flush | const | 42 |
| stubRequest | function | 43 |
| submit | const | 53 |

### tests/remote.test.js（751 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| EMAIL | const | 22 |
| mockTailscale | const | 24 |
| fakeChild | const | 77 |
| fakeDatabase | const | 95 |
| setup | const | 114 |
| wsRequest | const | 155 |
| setTimeout | method | 548 |

### tests/render-capacity-ui.py（222 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| COUNT | const | 31 |
| capacityRecords | const | 32 |
| capacityHistory | const | 43 |
| capacityBase | const | 44 |
| capacityPage | const | 49 |
| capacityEpoch | const | 52 |

### tests/retry.test.js（407 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| RATE_LIMIT | const | 6 |
| QUOTA | const | 7 |
| ABORTED | const | 8 |
| fakeSession | function | 15 |
| recorder | function | 53 |
| recordedSleep | const | 63 |
| lastAssistant | const | 73 |

### tests/safe-stop.test.js（228 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| finish | method | 176 |
| finish | method | 187 |

### tests/send-optimistic.test.js（138 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| userEnd | const | 6 |

### tests/serialize-worker.test.js（129 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| rig | function | 9 |
| BIG | const | 40 |

### tests/service-settings.test.js（377 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| source | const | 11 |
| html | const | 12 |
| setup | function | 14 |

### tests/service.test.js（684 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| until | const | 17 |
| readMaybe | const | 26 |
| killTree | const | 27 |
| buildWorkspace | const | 34 |
| WORKER | const | 49 |
| fs | const | 50 |
| retry | const | 55 |
| ready | const | 74 |
| ready | method | 82 |
| ready | method | 85 |
| startDaemon | const | 89 |
| spawn | method | 91 |
| startTest | const | 96 |
| maintEnv | const | 105 |
| getStatus | const | 106 |
| stateOf | const | 112 |
| teardown | const | 119 |
| NPM_FAKE | const | 127 |
| say | const | 131 |
| sdkStub | const | 132 |
| mkdirSync | method | 133 |
| writeFileSync | method | 134 |
| writeFileSync | method | 135 |
| rmSync | method | 143 |
| sdkStub | method | 145 |
| writeFileSync | method | 146 |
| writeFileSync | method | 147 |
| writeFileSync | method | 148 |
| rmSync | method | 156 |
| sdkStub | method | 157 |
| writeFileSync | method | 158 |
| installNpmShim | const | 164 |
| A40 | const | 177 |
| fs | const | 567 |
| home | const | 569 |
| fs | const | 654 |

### tests/session-billing.test.js（41 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| usage | const | 5 |

### tests/session-cache.test.js（115 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| clean | const | 6 |
| withDraft | const | 7 |
| withImages | const | 8 |

### tests/session-created-at.test.js（44 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 8 |

### tests/session-flow.test.js（590 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| flowFactory | const | 92 |
| jsonlFactory | const | 102 |

### tests/session-history.test.js（417 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| build | const | 11 |
| ids | const | 14 |
| ask | const | 15 |
| touchHistory | method | 81 |
| fakeSource | function | 110 |
| append | const | 127 |

### tests/session-memory.test.js（162 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| reply | const | 9 |

### tests/session-migration.test.js（282 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 10 |
| workspaceHash | const | 20 |

### tests/session-model-restore.test.js（61 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| stubFactory | function | 9 |
| cleanup | const | 17 |

### tests/session-persistence.test.js（464 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 10 |

### tests/session-store.test.js（640 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| withStore | function | 11 |
| fullSaved | function | 24 |
| withStore | method | 48 |
| withStore | method | 60 |
| withStore | method | 71 |
| withStore | method | 87 |
| withStore | method | 98 |
| withStore | method | 119 |
| withStore | method | 139 |
| withStore | method | 167 |
| withStore | method | 181 |
| withStore | method | 207 |
| withStore | method | 225 |
| withStore | method | 254 |
| withStore | method | 316 |
| withStore | method | 341 |
| withStore | method | 355 |
| withStore | method | 380 |
| withStore | method | 393 |
| LEGACY_DDL | const | 424 |
| withStore | method | 516 |
| withStore | method | 591 |

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

### tests/smooth-stream-preview.mjs（269 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| repo | const | 10 |
| root | const | 11 |
| vendor | const | 13 |
| types | const | 17 |
| HARNESS | const | 25 |
| lexes | const | 29 |
| lexer | const | 30 |
| SCROLL | const | 33 |
| MOUNT | const | 34 |
| sleep | const | 35 |
| round | const | 36 |
| pad3 | const | 37 |
| renderCalls | const | 39 |
| lastRenderText | const | 40 |
| counted | const | 41 |
| paints | const | 44 |
| renderer | const | 45 |
| longtasks | const | 47 |
| longtaskSupported | const | 48 |
| PLAIN_SEED | const | 56 |
| LITERAL_SEED | const | 57 |
| fill | const | 58 |
| complexDoc | function | 60 |
| sourceFor | function | 74 |
| split | function | 80 |
| stats | function | 87 |
| makeItem | function | 97 |
| sampler | function | 117 |
| requestAnimationFrame | method | 129 |
| current | const | 133 |
| settled | function | 135 |
| run | function | 146 |
| responsiveness | function | 195 |
| PAGE | const | 232 |
| server | const | 248 |
| port | const | 265 |

### tests/smooth-stream.test.js（108 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| fixture | function | 9 |

### tests/snapshot-chunk.test.js（106 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| messageEvent | const | 8 |
| login | function | 14 |
| restore | method | 84 |

### tests/snapshot-first-screen.test.js（103 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| TOTAL | const | 8 |
| login | function | 10 |
| restore | method | 91 |

### tests/snapshot-switch.test.js（227 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| messageEvent | const | 7 |
| login | function | 13 |
| releaseAttachA | method | 213 |

### tests/sqlite-benchmark.mjs（914 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| parseArgs | function | 32 |
| args | const | 42 |
| scriptPath | const | 43 |
| repoDir | const | 44 |
| mode | const | 45 |
| bytesOf | const | 49 |
| since | const | 50 |
| kb | const | 51 |
| pct | const | 53 |
| rss | const | 57 |
| fileStat | const | 58 |
| tick | const | 60 |
| loopMonitor | function | 65 |
| WRITE_SQL | const | 85 |
| instrument | function | 86 |
| countingStore | function | 127 |
| SIZES | const | 140 |
| REPS | const | 146 |
| filler | const | 148 |
| makeSession | function | 151 |
| writeFileSync | method | 154 |
| makeDataset | function | 185 |
| oldPersist | function | 195 |
| runStorage | function | 212 |
| fakeAgentFactory | function | 325 |
| runE2E | function | 345 |
| runGates | function | 417 |
| lockHolder | function | 559 |
| lockVictim | function | 578 |
| runLock | function | 603 |
| rmSync | method | 655 |
| childResult | function | 660 |
| judge | function | 670 |
| selfCheck | function | 682 |
| main | function | 771 |
| writeFileSync | method | 794 |
| spawnSync | method | 795 |
| writeFileSync | method | 801 |
| cpSync | method | 803 |
| rmSync | method | 865 |
| line | method | 869 |
| line | method | 870 |
| line | method | 871 |
| line | method | 872 |
| line | method | 873 |
| line | method | 893 |
| line | method | 894 |
| line | method | 899 |
| line | method | 901 |
| line | method | 907 |
| emit | method | 909 |

### tests/stream-playback.test.js（321 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| segmenter | const | 5 |
| boundaries | const | 6 |
| assertBoundary | function | 13 |
| assertBoundary | method | 88 |
| assertBoundary | method | 134 |
| assertBoundary | method | 168 |
| assertBoundary | method | 300 |

### tests/stream-renderer.test.js（532 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| setVisibility | function | 311 |
| virtualTimers | function | 317 |
| streamItem | function | 343 |

### tests/subagent-billing.test.js（112 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| usage | const | 10 |
| billed | const | 12 |
| factory | function | 32 |

### tests/subagent-persistence.test.js（123 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | function | 10 |

### tests/task-budget.test.js（102 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 10 |

### tests/task-cancel-notifications.test.js（61 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| until | const | 8 |

### tests/task-notifications.test.js（254 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factoryFixture | function | 10 |
| tick | const | 30 |
| until | function | 31 |

### tests/task-resume.test.js（182 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| fakeAgent | function | 9 |
| fixture | function | 36 |
| restored | const | 46 |

### tests/task-timer.test.js（55 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 9 |
| state | const | 19 |
| settle | const | 20 |

### tests/tasks.test.js（269 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| fixture | function | 7 |
| assert | method | 73 |
| release | method | 201 |

### tests/tool-detail-reclaim.test.js（160 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 12 |
| restore | method | 46 |
| toggle | const | 50 |
| entry | const | 51 |

### tests/tooltip.test.js（282 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| source | const | 6 |
| boot | function | 11 |
| fire | const | 68 |
| tip | const | 74 |
| fire | method | 79 |
| fire | method | 88 |
| fire | method | 99 |
| fire | method | 102 |
| fire | method | 110 |
| fire | method | 112 |
| fire | method | 115 |
| fire | method | 117 |
| fire | method | 139 |
| fire | method | 150 |
| fire | method | 153 |
| fire | method | 156 |
| fire | method | 158 |
| fire | method | 167 |
| fire | method | 170 |
| fire | method | 174 |
| fire | method | 183 |
| fire | method | 185 |
| fire | method | 196 |
| fire | method | 202 |
| fire | method | 204 |
| fire | method | 212 |
| fire | method | 223 |
| fire | method | 235 |
| fire | method | 245 |
| fire | method | 254 |
| fire | method | 255 |
| fire | method | 257 |
| fire | method | 268 |
| fire | method | 270 |
| fire | method | 271 |
| fire | method | 276 |

### tests/ui-sticky-check.html（63 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| checks | const | 45 |
| lines | const | 55 |
| ok | const | 56 |

### tests/ui-sticky-check.mjs（104 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| here | const | 10 |
| candidates | const | 11 |
| browser | const | 18 |
| port | const | 20 |
| profile | const | 21 |
| proc | const | 22 |
| sleep | const | 27 |
| target | const | 28 |
| ws | const | 37 |
| seq | const | 39 |
| pending | const | 40 |
| send | const | 45 |
| waitEvent | const | 48 |
| loaded | const | 54 |
| expression | const | 59 |
| result | const | 80 |
| checks | const | 81 |
| shotPath | const | 84 |
| shot | const | 85 |
| writeFileSync | method | 87 |
| ok | const | 95 |

### tests/update.test.js（38 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| old | const | 8 |

### tests/workspace-tabs.test.js（284 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| appSource | const | 10 |
| pickerSource | const | 11 |
| modelSources | const | 12 |
| html | const | 17 |
| state | const | 19 |
| STATES | const | 24 |
| bootPage | function | 30 |
| attachCalls | const | 85 |

## L3 横切常量（跨模块定位入口）

- 协议 command.type：image、inherit、goal.action、service.status、service.update.check、service.restart、remote.get、remote.login、remote.configure、session.rename、workspace.reveal、workspace.browse、files.browse、models.list、models.config.get、models.provider.save、models.provider.delete、models.provider.rename、models.model.save、models.model.delete、models.provider.discover、models.favorites.get、models.model.override、models.auth.list、models.auth.start、models.auth.status、models.auth.respond、models.auth.cancel、models.auth.logout、models.hidden.set、models.favorites.set、capabilities.list、session.defaults.get、session.defaults.configure、session.defaults.list、session.defaults.delete、task.budget.get、task.budget.configure、session.configure、sessions.list、session.create、session.import、session.duplicate、session.attach、session.history、session.skills.refresh、session.close、prompt、cancel、question.reply、session.retry、task.retry、queue.withdraw、tasks.read（src/protocol.js）
- HTML id：sidebar、new、open-workspace、import-session、search、sessions、open-settings、sidebar-backdrop、toggle-sidebar、session-alert、session-title、workspace-label、copy-workspace、reveal-workspace、workspace-feedback、conversation-font-scale、github-link、status、service-dev、service-version、open-raw-io、toggle-theme、login、maintenance-state、connect、workspace、goal-track、earliest、history-pages、history-before、history-position、history-after、history-newest、transcript、output、raw-io、raw-io-title、close-raw-io、raw-io-empty、raw-io-list、goal-dock、question-dock、latest、message-queue、task-runs、compaction-progress、safe-stop-progress、add-context、add-image、goal-enter、image-files、context-chips、task-timer、task-timer-value、context-menu、context-picker、context-back、context-title、context-close、context-search、context-results、context-error、image-attachments、composer、prompt、prompt-completion、composer-skill、agent-role、provider、model、thinking、stop、force-stop、send-steer、send-followup、send、session-runtime、session-inspector-trigger、session-billing-trigger、session-bill-total、mobile-runtime、mobile-expand、composer-help、error、session-action、session-action-form、session-action-title、session-action-description、session-name-label、session-name、session-action-error、session-action-cancel、session-action-submit、image-preview、image-preview-close、image-preview-image、restart-dialog、restart-form、restart-title、restart-description、restart-warning、restart-cancel、restart-submit、force-stop-dialog、force-stop-form、force-stop-title、force-stop-description、force-stop-warning、force-stop-cancel、force-stop-submit、session-detail、session-detail-title、session-detail-close、session-inspector、inspector-prompt-tab、inspector-tools-tab、inspector-prompt-panel、session-system-prompt、inspector-tools-panel、session-active-tools、session-billing、session-bill-body、task-overlays、task-template、goal-plan、goal-plan-title、goal-plan-meta、goal-plan-constraints-title、goal-plan-constraints、goal-plan-acceptance-title、goal-plan-acceptance、goal-plan-rounds-section、goal-plan-rounds-title、goal-plan-rounds、goal-plan-close、goal-plan-confirm、settings、settings-title、settings-connection-tab、settings-defaults-tab、settings-remote-tab、settings-models-tab、settings-service-tab、connection-panel、connection-current-title、connection-current、connection-form、connection-address、connection-help、connection-feedback、connection-connect、defaults-panel、selection-copy-title、selection-copy、selection-copy-help、selection-copy-feedback、queue-type、steer-help、followup-help、defaults-preview、task-budget-title、task-max-turns、task-wrap-up-window、task-budget-help、subagent-title、subagent-help、subagent-provider、subagent-model、settings-feedback、defaults-title、defaults-workspace、defaults-directory、defaults-delete、defaults-workspace-help、defaults-editor、create-form、create-defaults-help、create-agents、create-compaction、create-retry、create-feedback、remote-panel、remote-status-title、remote-status、remote-login、remote-auth、remote-url、remote-form、remote-note、remote-enabled、remote-email、remote-email-help、remote-feedback、remote-refresh、remote-save、models-panel、service-panel、service-state-title、service-feedback、service-restart-title、restart-quick、restart-rebuild、service-recover、service-update-section、service-update-title、update-check、update-result、update-install、service-history-title、service-history（public/index.html）
- HTTP 静态路由：/、/favicon.svg、/style.css、/theme.js、/app.js、/icons.js、/session-cache.js、/session-details.js、/transport.js、/goal.js、/goal.css、/question.js、/question.css、/service-settings.js、/file-picker.js、/tooltip.js、/tooltip.css、/file-picker.css、/markdown.js、/stream-renderer.js、/stream-playback.js、/markdown-scan.js、/memory-tags.js、/clipboard.js、/answer-tags.js、/goal-markers.js、/vendor/marked.js、/vendor/purify.js、/model-manager.js、/model-auth.js、/model-manager.css、/model-picker.js、/model-picker.css、/health（src/server.js）

## ⚠ 未登记文件（0）

（无）
