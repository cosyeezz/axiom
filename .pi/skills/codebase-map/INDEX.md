<!-- 自动生成，勿手改。重建：node .pi/skills/codebase-map/scripts/reindex.mjs -->
# Axiom 多级代码索引（生成于 2026/9/20 20:57:31）

## L1 模块总览（文件 → 职责）

| 文件 | 行数 | 职责 | 关键符号 |
|---|---|---|---|
| desktop/connector/index.html | 184 | 壳内置连接入口页：地址可配置、可达探测与整页跳转 | - |
| desktop/pake.json | 14 | Pake 桌面壳配置：本地连接入口页、内导航与窗口参数 | - |
| public/answer-tags.js | 48 | 主代理回答标签解析、代码保护与流式容错 | OPEN, CLOSE, MARKS, isMark |
| public/app.js | 4815 | 前端唯一入口：视图栈、会话/设置 UI、权威归并与渲染调度 | questionUI, filePicker, $, sessionDetail |
| public/clipboard.js | 27 | 统一剪贴板入口：Clipboard API 优先，非安全上下文回退 execCommand | copyText |
| public/file-picker.css | 276 | 文件选择弹窗主题与响应式布局 | - |
| public/file-picker.js | 356 | 共享文件/目录选择弹窗、懒加载与分类 SVG 图标 | NS, SEARCH_DEBOUNCE, el, FOLDER_COLORS |
| public/goal-markers.js | 64 | 前后端共享 goal 完成标记解析与展示层剥离（含流式半截） | ROUND_MARKER, GOAL_MARKER, MARKER_TOKENS, SUFFIXES |
| public/goal.css | 239 | Goal 目标面板、轮次与控制样式 | - |
| public/goal.js | 644 | Goal 专属状态、操作与复用消息轮次分组 | createGoalUI |
| public/icons.js | 93 | 全页面动作 SVG 图标：固定几何路径字典、静态控件与模板水合 | actionIconPaths, initActionIcons, actionIconNode, actionIcon |
| public/index.html | 446 | 页面骨架与元素 id（见 L3） | - |
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
| public/style.css | 1891 | 全局样式（CSP 禁 inline style，样式一律进这里） | - |
| public/theme.js | 11 | 首帧前阻塞应用明/暗主题（localStorage axiom.theme，默认深色） | - |
| public/tooltip.css | 50 | 共享悬停说明样式（浅色主题下反色） | - |
| public/tooltip.js | 225 | 共享悬停说明：动态 title、键盘、定位与无障碍 | SHOW_DELAY, HIDE_DELAY, GAP, EDGE |
| public/transport.js | 269 | 业务 WS 唯一所有者：请求回执、逻辑订阅、快照事件闸门与有界恢复 | SERIALIZE_THRESHOLD, WORKER_SOURCE, estimateBytes, createTransport |
| public/usage-audit.js | 72 | 用量与限流面板：全局汇总、会话分账、请求明细与限额配置 | createUsageAudit |
| scripts/autostart.mjs | 138 | Windows/macOS/Linux 当前用户登录自动启动安装/卸载 | run, projectDir, serviceEntry, label |
| scripts/dev-vite.mjs | 69 | 独立 Vite 前端：CSS 热替换、同源代理与整页刷新暂停 | startDevWeb |
| scripts/dev.mjs | 12 | 开发入口：DEV 标识、4320 端口与独立数据目录 | - |
| scripts/install.mjs | 72 | 一键安装：装依赖/注册自启/启动守护/健康检查/打开浏览器 | root, parseArgs, ensurePi, viaShell |
| scripts/legacy-history-dryrun.mjs | 63 | 旧历史只读盘点，不迁移或写入 | inspectLegacyHistory |
| scripts/maint-server.mjs | 86 | loopback维护HTTP：来源校验、随机凭证、状态与离线恢复 | MAX_BODY, hash, json, startMaintServer |
| scripts/maint-state.mjs | 138 | 守护维护状态：持久化阶段、最近结果与有界脱敏证据 | NAMESPACE, LOG_LIMIT, redact, sanitize |
| scripts/service.mjs | 619 | 服务守护：IPC 重启、HTTP 安全停止与崩溃退避停止通道 | root, output, run, npmRun |
| scripts/uninstall.mjs | 18 | 统一卸载：核对 npm 目标、安全停止、取消自启、保留用户数据 | uninstall |
| src/capabilities.js | 159 | 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities） | sdkEntry, resolver, alias, jiti |
| src/compaction-budget.js | 21 | 统一完整请求预算、高低水位及压缩错误分级 | requestBudget, compactionError |
| src/compaction-input.js | 19 | 摘要预算视图，UTF-8首尾范围与省略标记，不用于原文归档 | selectSummaryInput |
| src/compaction-state.js | 72 | 累计任务状态与来源校验、候选身份 | STATE_FIELDS, STATUSES, inheritTaskState, validateTaskState |
| src/compaction.js | 822 | 后台独立摘要、token/占比阈值、快照校验与 turn 安全提交 | contextTokens, prepareBackgroundCompaction, DEFAULT_COMPACTION_CONFIG, normalizeCompaction |
| src/data-owner.js | 25 | 写库前数据根独占：内核管道或socket持有，禁止同根双写 | claimDataRoot, claimArchiveOwner, claimOwner |
| src/database.js | 122 | 共享 SQLite 连接、小配置 KV、WAL 与一致性备份 | nodeOk, DATA_VERSION, assertDataVersion, Database |
| src/gate-ipc.js | 97 | 共享闸门认证IPC与连接租约回收 | MAX_LINE, authenticated, serveGate, connectGate |
| src/goal.js | 988 | Goal：会话级目标状态、轮次计划、验收门与持久化 | GOAL_PHASES, GOAL_ACTIONS, ROUND_STATUSES, GOAL_MAX_SEGMENTS |
| src/history-journal.js | 92 | 磁盘 journal 原文投影、持久屏障与提交确认 | readDurableJournal, installDurableJournal, confirmDurableAppend, createJournalArchive |
| src/history-tools.js | 95 | 鉴权历史检索、原文分页及游标签名 | createHistoryReader |
| src/inline-images.js | 32 | 模型上下文图片定位：将占位符与真实附件交错排列，不改存储与队列 | inlineImages, inlineImagesExtension |
| src/legacy-observation.js | 525 | 旧观察归档只读分页兼容，不折叠或写入 | THRESHOLD_BYTES, FULL_SENDS, PLACEHOLDER_EXCERPT_BYTES, OBSERVATION_ID_PATTERN |
| src/main.js | 145 | 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理 | port, host, cwd, home |
| src/model-auth.js | 89 | SDK 登录桥：连接隔离、超时取消与安全事件投影 | safeUrl, text, eventView, createModelAuthService |
| src/model-config.js | 619 | Pi models.json 无损配置读写与共享收藏持久化 | sdkModelConfig, sdkResolveConfigValue, digest, LEVELS |
| src/pi-model-storage.js | 409 | 模型与凭据 SQLite 权威存储、Pi 派生兼容文件 | sdkResolveConfigValue, sdkIsCommandConfigValue, NAMESPACE, AUTH_NAMESPACE |
| src/pi.js | 639 | createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档） | agentRuntime, queueStateOf, hasModelOutput, withdrawQueue |
| src/prompts.js | 65 | Axiom 自有提示词按 main/subagent/compaction 角色集中维护 | MAIN_AGENT_PROMPT, TITLE_INSTRUCTION, SUBAGENT_PROMPT, WRAP_UP_PROMPT |
| src/protocol.js | 370 | zod 协议：selection / command 判别联合（消息类型见 L3） | id, capabilities, workspace, thinking |
| src/questions.js | 86 | 主代理 question 工具、参数校验与可取消的回答等待 | text, option, input, questionAnswers |
| src/raw-history.js | 77 | 完整原文耐久归档、身份幂等与恢复校验 | historyError, canonical, contentHash, keyOf |
| src/remote.js | 547 | Tailscale 登录身份、远程监听、同账号授权与本机配置持久化 | configSchema, execOptions, cliEnv, defaultRun |
| src/request-gate.js | 115 | FIFO并发令牌与RPM滑动窗口 | validateLimits, RequestGate, retryAfterMs |
| src/retry.js | 196 | 模型失败重试：可取消退避、最多45次、16分钟封顶、自定义错误词表、保留已有工具结果继续 | RETRY_DELAYS_MS, MAX_DELAY_MS, MAX_RETRIES, RECOVERY_PROMPT |
| src/server.js | 554 | createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发 | dev, digest, load, freshen |
| src/session-billing.js | 63 | 全会话 entries 用量与费用统计、当前上下文估算 | keys, zero, number, sessionBilling |
| src/session-history.js | 37 | 稳定消息身份、线缆记录投影与只读 JSONL 历史读取 | messageIdOf, toWireRecord, readSessionManager, readSessionHistory |
| src/session-memory.js | 34 | 标题提取登记、轮次预算挂钩与委派背景 | textOf, memoryHooks |
| src/session-store.js | 479 | 会话三表、实体增量更新、逐会话事务与旧数据迁移 | EVENT_TYPES, SESSION_FIELDS, TABLES, INDEXES |
| src/sessions.js | 2177 | Sessions：会话生命周期、增量保存、元数据启动与SDK按需恢复 | GOAL_TOOL_NAMES, hasRunningTasks, referencedToolKeys, relevantTools |
| src/shared-gate.js | 86 | 用户级共享闸门端点与远程服务适配 | gateLayout, remoteService, shareGate, claimShared |
| src/task-budget.js | 35 | 主子代理轮次预算规则、收尾提示词与配置页参数校验 | TASK_BUDGET_LIMITS, taskBudgetDefaults, within, taskBudgetPolicy |
| src/tasks.js | 234 | Tasks：子任务（委托）生命周期 | ACTIVE, historyResult, Tasks |
| src/tools.js | 157 | delegationTools：委托/凭证读取/追加工具定义（zod 入参） | delegateInput, readInput, appendInput, result |
| src/transport.js | 37 | 统一有界 WS 发送：回执、广播、删除通知与慢客户端隔离 | createSender |
| src/update.js | 41 | 检查更新：本地安装（提交 SHA/版本）比对 GitHub 公开仓库 master，npm 安装实例可自动重装 | repo, npmSpec, commitFile, validateCommit |
| src/usage-backfill.js | 23 | 历史用量时间分界与指纹去重 | backfillEntries |
| src/usage-service.js | 56 | 用量服务与限流配置 | UsageService |
| src/usage-store.js | 294 | 请求明细持久化与账单聚合 | TABLES, INDEXES, OPEN_STATUS, TOKEN_COLUMNS |
| src/usage-stream.js | 75 | 模型请求流审计与限流包装 | wrapUsageStream |
| tests/activity-groups-ui.py | 205 | node --test 测试（npm test） | activityHistory, sessions |
| tests/answer-tags.test.js | 56 | node --test 测试（npm test） | open |
| tests/app.test.js | 2085 | node --test 测试（npm test） | pickerSource, modelSources, serviceSource |
| tests/autoscroll-ui.py | 99 | node --test 测试（npm test） | - |
| tests/autostart.test.js | 71 | node --test 测试（npm test） | node, cwd, service |
| tests/benchmark.js | 92 | node --test 测试（npm test） | window |
| tests/capabilities.test.js | 316 | node --test 测试（npm test） | - |
| tests/cli-help.test.js | 46 | node --test 测试（npm test） | cli |
| tests/clipboard.test.js | 85 | node --test 测试（npm test） | loadCopyText, dom |
| tests/codebase-index.test.js | 20 | node --test 测试（npm test） | ROOT, SKILL |
| tests/compaction-budget.test.js | 17 | node --test 测试（npm test） | - |
| tests/compaction-config.test.js | 208 | node --test 测试（npm test） | - |
| tests/compaction-input.test.js | 16 | node --test 测试（npm test） | - |
| tests/compaction-lazy.test.js | 162 | node --test 测试（npm test） | factory, withSession, sayMain |
| tests/compaction-state.test.js | 35 | node --test 测试（npm test） | empty |
| tests/compaction-ui.py | 81 | node --test 测试（npm test） | - |
| tests/compaction-ui.test.js | 367 | node --test 测试（npm test） | page |
| tests/compaction.test.js | 1421 | node --test 测试（npm test） | fakeModel, createTestSession, seq, userMsg |
| tests/config-scope-ui.py | 59 | node --test 测试（npm test） | - |
| tests/config.test.js | 309 | node --test 测试（npm test） | - |
| tests/context-menu-ui.py | 67 | node --test 测试（npm test） | - |
| tests/continuous-history.test.js | 53 | node --test 测试（npm test） | send |
| tests/continuous-preview.mjs | 24 | node --test 测试（npm test） | id, records, state, snapshot |
| tests/continuous-ui.py | 31 | node --test 测试（npm test） | - |
| tests/conversation-font-ui.py | 43 | node --test 测试（npm test） | - |
| tests/conversation-preview.mjs | 219 | node --test 测试（npm test） | markdown, message, thinking, state |
| tests/conversation-ui.py | 292 | node --test 测试（npm test） | - |
| tests/data-owner.test.js | 24 | node --test 测试（npm test） | - |
| tests/data-version.test.js | 25 | node --test 测试（npm test） | - |
| tests/database.test.js | 149 | node --test 测试（npm test） | - |
| tests/defaults.test.js | 182 | node --test 测试（npm test） | - |
| tests/dev-assets.test.js | 46 | node --test 测试（npm test） | - |
| tests/dev-vite-ui.py | 52 | node --test 测试（npm test） | - |
| tests/dev-vite.test.js | 52 | node --test 测试（npm test） | - |
| tests/empty-session-config-preview.mjs | 30 | node --test 测试（npm test） | home, catalog, factory, sessions |
| tests/empty-session-config-ui.py | 41 | node --test 测试（npm test） | - |
| tests/empty-session-config.test.js | 99 | node --test 测试（npm test） | empty, chosen, fixture |
| tests/file-picker.test.js | 68 | node --test 测试（npm test） | source, tick |
| tests/fixtures/legacy-observation-writer.js | 974 | node --test 测试（npm test） | THRESHOLD_BYTES, FULL_SENDS, PLACEHOLDER_EXCERPT_BYTES, CHARS_PER_TOKEN |
| tests/frontend-regions-preview.mjs | 64 | node --test 测试（npm test） | home, catalog, factory, sessions |
| tests/frontend-regions-ui.py | 462 | node --test 测试（npm test） | - |
| tests/frontend-regions.test.js | 214 | node --test 测试（npm test） | appSource, pickerSource, modelPickerSource, modelSources |
| tests/gate-ipc.test.js | 33 | node --test 测试（npm test） | - |
| tests/git-log-ui.py | 39 | node --test 测试（npm test） | - |
| tests/git-log.test.js | 53 | node --test 测试（npm test） | - |
| tests/goal-command-ui.test.js | 143 | node --test 测试（npm test） | page, $, settle, input |
| tests/goal-markers.test.js | 118 | node --test 测试（npm test） | page, lastAssistant |
| tests/goal-pi.test.js | 288 | node --test 测试（npm test） | PREAMBLE, FOOTER, run |
| tests/goal-preview.mjs | 148 | node --test 测试（npm test） | cwd, seq, text, makeState |
| tests/goal-protocol.test.js | 15 | node --test 测试（npm test） | - |
| tests/goal-sessions.test.js | 744 | node --test 测试（npm test） | PLAN, factoryFixture, tick, until |
| tests/goal-ui.py | 578 | node --test 测试（npm test） | - |
| tests/goal-ui.test.js | 432 | node --test 测试（npm test） | page, $, labels, messages |
| tests/goal.test.js | 856 | node --test 测试（npm test） | ROUND, GOAL, PLAN, PLAN2 |
| tests/helpers/model-concurrency-child.mjs | 93 | node --test 测试（npm test） | barrier, runOpponent |
| tests/helpers/public-source.js | 16 | node --test 测试（npm test） | publicSource, event, appliedSeq, rawEntryIds |
| tests/helpers/session-page.js | 186 | node --test 测试（npm test） | CONFIG, makeRecords, html, pickerSource |
| tests/history-journal.test.js | 52 | node --test 测试（npm test） | - |
| tests/history-page-cache.test.js | 69 | node --test 测试（npm test） | md, records |
| tests/history-projection.test.js | 137 | node --test 测试（npm test） | fakeSource, mainRecord, subRecord, delegateAnchor |
| tests/history-reading.test.js | 136 | node --test 测试（npm test） | pageState |
| tests/history-tools.test.js | 45 | node --test 测试（npm test） | - |
| tests/icons.test.js | 39 | node --test 测试（npm test） | - |
| tests/image-input.test.js | 169 | node --test 测试（npm test） | pngBase64, jpegBase64, image, parsePrompt |
| tests/inline-images.test.js | 42 | node --test 测试（npm test） | text, a, b, user |
| tests/install.test.js | 150 | node --test 测试（npm test） | fakeService |
| tests/internal-task-queue.test.js | 41 | node --test 测试（npm test） | custom, user |
| tests/legacy-history-dryrun.test.js | 25 | node --test 测试（npm test） | - |
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
| tests/observation-pack-flow.test.js | 123 | node --test 测试（npm test） | PREAMBLE, FOOTER, run |
| tests/observation-pack.test.js | 612 | node --test 测试（npm test） | bigText, toolResult, assistant, fakePi |
| tests/perf-attach-ground-truth.test.js | 261 | node --test 测试（npm test） | FILE, SOURCE, BASE, extractFunction |
| tests/perf-measure-lock.test.js | 28 | node --test 测试（npm test） | - |
| tests/perf-profile-cli.test.js | 82 | node --test 测试（npm test） | script, realCrossCheck |
| tests/perf-startup-cleanup.test.js | 206 | node --test 测试（npm test） | DIR, SCRIPTS, extractFunction, dropLine |
| tests/pi-memory.test.js | 180 | node --test 测试（npm test） | - |
| tests/pi-model-storage.test.js | 624 | node --test 测试（npm test） | tempDir, makeStorage, seedPiModels, seedPiAuth |
| tests/pi-question.test.js | 197 | node --test 测试（npm test） | - |
| tests/project-skills.test.js | 144 | node --test 测试（npm test） | scopeKey, setup |
| tests/prompt-resize.test.js | 303 | node --test 测试（npm test） | page |
| tests/question-layout-ui.py | 52 | node --test 测试（npm test） | - |
| tests/question-preview.mjs | 36 | node --test 测试（npm test） | factory, sessions, app, port |
| tests/question-ui.test.js | 99 | node --test 测试（npm test） | source |
| tests/questions.test.js | 110 | node --test 测试（npm test） | params |
| tests/raw-history.test.js | 42 | node --test 测试（npm test） | - |
| tests/realtime-transport.test.js | 125 | node --test 测试（npm test） | rig, flush |
| tests/recall.test.js | 208 | node --test 测试（npm test） | user, assistant, thinking, fixture |
| tests/remote-ui.py | 51 | node --test 测试（npm test） | - |
| tests/remote-ui.test.js | 230 | node --test 测试（npm test） | page, modelSources, flush, stubRequest |
| tests/remote.test.js | 751 | node --test 测试（npm test） | EMAIL, mockTailscale, fakeChild, fakeDatabase |
| tests/render-capacity-ui.py | 203 | node --test 测试（npm test） | COUNT, capacityRecords, capacityBase, capacityFull |
| tests/request-gate.test.js | 74 | node --test 测试（npm test） | fixture |
| tests/restored-history-order.test.js | 44 | node --test 测试（npm test） | - |
| tests/retry-settings-ui.py | 30 | node --test 测试（npm test） | - |
| tests/retry.test.js | 407 | node --test 测试（npm test） | RATE_LIMIT, QUOTA, ABORTED, fakeSession |
| tests/safe-stop.test.js | 228 | node --test 测试（npm test） | - |
| tests/send-optimistic.test.js | 176 | node --test 测试（npm test） | userEnd |
| tests/serialize-worker.test.js | 129 | node --test 测试（npm test） | rig, BIG |
| tests/server.test.js | 168 | node --test 测试（npm test） | - |
| tests/service-api.test.js | 106 | node --test 测试（npm test） | - |
| tests/service-settings-api.test.js | 71 | node --test 测试（npm test） | - |
| tests/service-settings-ui.py | 66 | node --test 测试（npm test） | - |
| tests/service-settings.test.js | 377 | node --test 测试（npm test） | source, html, setup |
| tests/service.test.js | 684 | node --test 测试（npm test） | until, readMaybe, killTree, buildWorkspace |
| tests/session-background-server.test.js | 111 | node --test 测试（npm test） | - |
| tests/session-background-start.test.js | 57 | node --test 测试（npm test） | - |
| tests/session-billing-ui.py | 75 | node --test 测试（npm test） | - |
| tests/session-billing.test.js | 41 | node --test 测试（npm test） | usage |
| tests/session-cache.test.js | 115 | node --test 测试（npm test） | clean, withDraft, withImages |
| tests/session-created-at.test.js | 45 | node --test 测试（npm test） | factory |
| tests/session-details.test.js | 36 | node --test 测试（npm test） | - |
| tests/session-flow.test.js | 596 | node --test 测试（npm test） | flowFactory, jsonlFactory |
| tests/session-history.test.js | 238 | node --test 测试（npm test） | build, fakeSource, append |
| tests/session-memory.test.js | 164 | node --test 测试（npm test） | reply |
| tests/session-migration.test.js | 282 | node --test 测试（npm test） | factory, workspaceHash |
| tests/session-model-restore.test.js | 61 | node --test 测试（npm test） | stubFactory, cleanup |
| tests/session-persistence.test.js | 479 | node --test 测试（npm test） | Sessions, factory |
| tests/session-sidebar-ui.py | 172 | node --test 测试（npm test） | - |
| tests/session-store.test.js | 640 | node --test 测试（npm test） | withStore, fullSaved, LEGACY_DDL |
| tests/shared-gate.test.js | 24 | node --test 测试（npm test） | - |
| tests/smoke.js | 67 | node --test 测试（npm test） | TIMEOUT, sessions |
| tests/smooth-stream-browser.py | 179 | node --test 测试（npm test） | - |
| tests/smooth-stream-preview.mjs | 269 | node --test 测试（npm test） | repo, root, vendor, types |
| tests/smooth-stream.test.js | 108 | node --test 测试（npm test） | fixture |
| tests/snapshot-chunk.test.js | 104 | node --test 测试（npm test） | messageEvent, login |
| tests/snapshot-first-screen.test.js | 88 | node --test 测试（npm test） | TOTAL, login |
| tests/snapshot-switch.test.js | 221 | node --test 测试（npm test） | messageEvent, login, holdReattach |
| tests/sqlite-benchmark.mjs | 914 | node --test 测试（npm test） | parseArgs, args, scriptPath, repoDir |
| tests/stream-playback.test.js | 321 | node --test 测试（npm test） | segmenter, boundaries, assertBoundary |
| tests/stream-renderer.test.js | 532 | node --test 测试（npm test） | setVisibility, virtualTimers, streamItem |
| tests/subagent-billing.test.js | 112 | node --test 测试（npm test） | usage, billed, factory |
| tests/subagent-persistence.test.js | 123 | node --test 测试（npm test） | factory |
| tests/task-budget.test.js | 103 | node --test 测试（npm test） | factory |
| tests/task-cancel-notifications.test.js | 65 | node --test 测试（npm test） | until |
| tests/task-notifications.test.js | 258 | node --test 测试（npm test） | factoryFixture, tick, until |
| tests/task-resume.test.js | 182 | node --test 测试（npm test） | fakeAgent, fixture, restored |
| tests/task-timer.test.js | 59 | node --test 测试（npm test） | emit, factory, state, settle |
| tests/tasks.test.js | 269 | node --test 测试（npm test） | fixture |
| tests/text-diagram-ui.py | 37 | node --test 测试（npm test） | - |
| tests/tool-detail-reclaim.test.js | 160 | node --test 测试（npm test） | page, toggle, entry |
| tests/tooltip.test.js | 282 | node --test 测试（npm test） | source, boot, fire, tip |
| tests/ui-sticky-check.html | 63 | node --test 测试（npm test） | checks, lines, ok |
| tests/ui-sticky-check.mjs | 104 | node --test 测试（npm test） | here, candidates, browser, port |
| tests/uninstall.test.js | 45 | node --test 测试（npm test） | - |
| tests/update.test.js | 38 | node --test 测试（npm test） | old |
| tests/usage-backfill.test.js | 24 | node --test 测试（npm test） | - |
| tests/usage-extension.test.js | 14 | node --test 测试（npm test） | - |
| tests/usage-service.test.js | 25 | node --test 测试（npm test） | - |
| tests/usage-store.test.js | 283 | node --test 测试（npm test） | withStore, usage, complete |
| tests/usage-stream.test.js | 62 | node --test 测试（npm test） | createStream, model, message, fixture |
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

### public/app.js（4815 行） — 前端唯一入口：视图栈、会话/设置 UI、权威归并与渲染调度

| 符号 | 类型 | 行 |
|---|---|---|
| questionUI | const | 21 |
| filePicker | const | 23 |
| $ | const | 24 |
| sessionDetail | const | 26 |
| openSessionDetail | function | 27 |
| sessionId | const | 36 |
| sessionMissing | const | 49 |
| onboarding | const | 50 |
| allSessions | const | 51 |
| views | const | 53 |
| attachToken | const | 56 |
| goalUI | function | 60 |
| compactionDefaults | const | 76 |
| taskBudgetDefaults | const | 78 |
| effectiveLevels | function | 82 |
| modelFavorites | const | 87 |
| favoriteKey | function | 90 |
| modelPicker | const | 95 |
| modelManager | const | 109 |
| serviceUi | const | 110 |
| compactions | const | 111 |
| goalAnchors | const | 113 |
| anchorGoal | function | 114 |
| clearGoalPrompt | function | 120 |
| resizePrompt | method | 125 |
| region | method | 126 |
| lastMainMessage | const | 129 |
| compactionNodes | const | 130 |
| compactionSegments | const | 133 |
| compactionStatus | const | 136 |
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
| composerCollapsed | const | 255 |
| resizePrompt | function | 256 |
| invalidatePrompt | function | 266 |
| scrollFrame | const | 267 |
| FOLLOW_GAP | const | 268 |
| scrollIntent | const | 269 |
| lastScrollTops | const | 270 |
| noteScrollIntent | const | 272 |
| atLatest | const | 274 |
| readFollow | function | 277 |
| scrollToLatest | const | 286 |
| scrollLatest | function | 287 |
| scheduleCallGroups | method | 288 |
| transcript | const | 297 |
| growthWatch | const | 299 |
| growthObserver | function | 300 |
| watchGrowth | function | 303 |
| forgetGrowth | function | 304 |
| renderer | const | 307 |
| markdownPageCache | const | 310 |
| pageCacheCurrent | function | 311 |
| scrollLatest | method | 347 |
| mobile | const | 349 |
| sidebar | function | 350 |
| sidebar | method | 365 |
| sidebar | method | 368 |
| applyComposerCollapsed | method | 369 |
| invalidatePrompt | method | 370 |
| promptResizeFrame | const | 375 |
| COMPOSER_COLLAPSE_DELAY | const | 385 |
| composerHovered | const | 386 |
| composerWrap | const | 387 |
| applyComposerCollapsed | function | 388 |
| resizePrompt | method | 392 |
| clearComposerCollapseTimer | function | 394 |
| clearTimeout | method | 396 |
| composerBusy | function | 403 |
| expandComposer | function | 410 |
| clearComposerCollapseTimer | method | 411 |
| applyComposerCollapsed | method | 414 |
| collapseComposer | function | 416 |
| clearComposerCollapseTimer | method | 417 |
| applyComposerCollapsed | method | 420 |
| scheduleComposerCollapse | function | 422 |
| clearComposerCollapseTimer | method | 423 |
| composerIntent | const | 432 |
| fontScale | const | 438 |
| applyConversationFontScale | function | 439 |
| savedFontScale | const | 444 |
| applyConversationFontScale | method | 448 |
| themeColors | const | 454 |
| applyTheme | function | 455 |
| applyTheme | method | 466 |
| live | const | 475 |
| error | function | 476 |
| rawEntries | const | 480 |
| rawMode | function | 481 |
| rawMode | method | 489 |
| rawChanged | function | 500 |
| rawEntry | function | 506 |
| selectRaw | function | 511 |
| rawMode | method | 513 |
| TASK_NOTIFICATION_TYPE | const | 530 |
| TASK_NOTIFICATION_PREFIX | const | 531 |
| isTaskNotification | const | 532 |
| taskNotificationCard | function | 542 |
| scrollLatest | method | 554 |
| bindRaw | function | 557 |
| paintRaw | function | 571 |
| configuringSessions | const | 624 |
| request | function | 625 |
| queueMicrotask | method | 631 |
| region | function | 639 |
| updateAvailability | function | 643 |
| updateNavigation | method | 644 |
| region | method | 645 |
| region | method | 646 |
| region | method | 647 |
| region | method | 648 |
| updateConnection | function | 650 |
| updateModelAvailability | function | 655 |
| updateSettingsAvailability | function | 663 |
| updateNavigation | function | 681 |
| duplicateBlocked | function | 696 |
| updateComposer | function | 699 |
| renderContextChips | method | 710 |
| syncRetryPrompt | method | 721 |
| options | function | 723 |
| providerEntries | const | 734 |
| modelEntries | const | 735 |
| catalogRequest | const | 737 |
| refreshModelCatalog | function | 738 |
| updateNavigation | method | 760 |
| fillModels | function | 768 |
| options | method | 770 |
| renderAgentConfig | function | 772 |
| options | method | 776 |
| fillModels | method | 777 |
| options | method | 779 |
| fillSubagentModels | function | 783 |
| options | method | 785 |
| capabilityName | function | 793 |
| runtimeSummary | function | 803 |
| renderRuntime | function | 817 |
| updateTaskRuntime | function | 838 |
| renderRuntime | method | 840 |
| renderBill | method | 842 |
| applyConfig | function | 845 |
| region | method | 848 |
| region | method | 849 |
| region | method | 850 |
| renderComposerConfig | function | 852 |
| options | method | 853 |
| renderModelConfig | function | 859 |
| options | method | 860 |
| fillSubagentModels | method | 865 |
| renderAgentConfig | method | 866 |
| configureSeq | const | 869 |
| configure | function | 870 |
| updateAvailability | method | 881 |
| taskBudgetInputs | const | 904 |
| settingsGeneration | const | 905 |
| budgetRequest | const | 906 |
| settingsTicket | const | 907 |
| loadTaskBudget | function | 917 |
| saveTaskBudget | function | 928 |
| usageAudit | const | 944 |
| showSettingsPanel | function | 945 |
| showSettingsPanel | method | 961 |
| renderDefaultsScope | method | 970 |
| showSettingsPanel | method | 971 |
| CONNECTION_KEY | const | 976 |
| normalizeBackendAddress | function | 977 |
| openConnectionPanel | function | 990 |
| renderDefaultsScope | method | 1010 |
| showSettingsPanel | method | 1011 |
| region | method | 1012 |
| remoteView | const | 1024 |
| remoteLoaded | const | 1025 |
| remoteAnchor | function | 1026 |
| remoteRender | function | 1034 |
| region | method | 1080 |
| remoteLoad | function | 1082 |
| remoteAuthUrl | function | 1102 |
| remoteLogin | function | 1110 |
| remoteOnReconnect | function | 1136 |
| updateAvailability | method | 1150 |
| messageItems | const | 1163 |
| activityPaths | const | 1165 |
| setActivityIcon | function | 1182 |
| callGroupsFrame | const | 1192 |
| scheduleCallGroups | function | 1193 |
| createCallGroup | function | 1203 |
| paintCallGroup | function | 1217 |
| refreshCallGroups | function | 1259 |
| foldCallsBeforeMessage | function | 1391 |
| paintCallGroup | method | 1395 |
| disclosureHint | function | 1397 |
| activityLine | function | 1411 |
| setActivity | method | 1421 |
| setActivity | function | 1424 |
| scheduleCallGroups | method | 1425 |
| setActivityIcon | method | 1427 |
| waiting | function | 1438 |
| scheduleCallGroups | method | 1440 |
| scrollLatest | method | 1446 |
| clearWaiting | function | 1448 |
| stopActivity | function | 1452 |
| scheduleCallGroups | method | 1454 |
| clearWaiting | method | 1455 |
| updateActivity | function | 1467 |
| setActivity | method | 1482 |
| setActivity | method | 1483 |
| mergeThoughts | function | 1487 |
| diffView | const | 1505 |
| renderToolDetail | function | 1510 |
| section | method | 1598 |
| toolState | function | 1600 |
| clearWaiting | method | 1602 |
| setActivity | method | 1646 |
| renderToolDetail | method | 1647 |
| scrollLatest | method | 1648 |
| card | function | 1650 |
| prepareStream | function | 1714 |
| updateActivity | method | 1737 |
| renderMessage | function | 1739 |
| updateActivity | method | 1847 |
| compactionLabels | const | 1850 |
| compactionRunPhases | const | 1851 |
| compactionCount | const | 1852 |
| compactionClock | const | 1853 |
| compactionSpan | const | 1854 |
| compactionRuns | const | 1855 |
| compactionRun | function | 1857 |
| renderCompactionStatus | function | 1861 |
| openCompactionRun | function | 1906 |
| renderCompactionRun | method | 1908 |
| renderCompactionRun | function | 1912 |
| trackTaskEntries | function | 1980 |
| placeCompactedTasks | function | 1991 |
| placeCompactedRetries | method | 1992 |
| compactionCard | function | 2021 |
| foldCompaction | function | 2054 |
| placeCompactedTasks | method | 2075 |
| scheduleCallGroups | method | 2076 |
| mergeThoughts | method | 2077 |
| liteItem | function | 2085 |
| markCompacted | method | 2104 |
| updateActivity | method | 2105 |
| loadCompactionSegment | function | 2109 |
| mountCompactionSegment | function | 2127 |
| placeCompactedTasks | method | 2202 |
| renderTaskRuns | method | 2203 |
| rawChanged | method | 2204 |
| scrollLatest | method | 2205 |
| compactionEditor | function | 2207 |
| options | method | 2245 |
| fillThinking | method | 2275 |
| retryChipList | function | 2286 |
| render | method | 2335 |
| retryEditor | function | 2339 |
| renderTaskRuns | function | 2359 |
| renderQueue | function | 2390 |
| canResumeMessage | const | 2410 |
| retryPrompt | const | 2412 |
| syncRetryPrompt | function | 2413 |
| scrollLatest | method | 2442 |
| retryCards | const | 2444 |
| placeCompactedRetries | function | 2445 |
| retryArchive | function | 2469 |
| renderRetry | function | 2482 |
| placeCompactedRetries | method | 2520 |
| scrollLatest | method | 2521 |
| applyEvent | function | 2523 |
| snapshotJob | const | 2794 |
| snapshot | function | 2795 |
| mountHistory | function | 2806 |
| finishSnapshot | method | 2812 |
| reattach | function | 2816 |
| saveView | method | 2818 |
| receiveHistoryEvent | function | 2831 |
| applyEvent | method | 2845 |
| beginSnapshot | function | 2855 |
| rawChanged | method | 2864 |
| clearTimeout | method | 2867 |
| markSessionSeen | method | 2884 |
| updatePageTitle | method | 2888 |
| renderTaskRuns | method | 2901 |
| renderCompactionStatus | method | 2906 |
| renderImages | method | 2939 |
| closeCompletion | method | 2942 |
| placeSnapshotMessage | function | 2948 |
| markCompacted | function | 2997 |
| finishSnapshot | function | 3010 |
| mergeThoughts | method | 3037 |
| placeCompactedTasks | method | 3051 |
| renderTaskRuns | method | 3052 |
| renderQueue | method | 3071 |
| applyConfig | method | 3074 |
| updateAvailability | method | 3076 |
| region | method | 3077 |
| transport | const | 3079 |
| onState | method | 3083 |
| initialized | const | 3119 |
| initializeConnection | function | 3120 |
| importDir | const | 3237 |
| fillModels | method | 3242 |
| fillSubagentModels | method | 3249 |
| closeCompletion | method | 3266 |
| region | method | 3271 |
| scrollLatest | method | 3276 |
| pendingUser | const | 3324 |
| mountPendingUser | function | 3325 |
| renderMessage | method | 3329 |
| settlePendingUser | function | 3339 |
| failPendingUser | function | 3343 |
| nextPaint | function | 3358 |
| enableImagePreview | function | 3366 |
| renderImages | function | 3387 |
| addImages | function | 3412 |
| loadImages | function | 3433 |
| renderImages | method | 3442 |
| selectionCopy | const | 3465 |
| copySelection | function | 3477 |
| escapeTimer | const | 3540 |
| withdrawQueue | function | 3541 |
| markSessionSeen | method | 3619 |
| renderSessions | method | 3620 |
| region | method | 3621 |
| renderCompactionRun | method | 3627 |
| stopSession | function | 3669 |
| refreshing | const | 3678 |
| refreshSessions | function | 3679 |
| timerText | function | 3695 |
| renderTaskTimer | function | 3702 |
| applyElapsed | function | 3715 |
| renderTaskTimer | method | 3721 |
| updatePageTitle | function | 3723 |
| updateSessions | function | 3727 |
| renderTaskTimer | method | 3729 |
| updatePageTitle | method | 3741 |
| renderSessions | method | 3742 |
| recoverMissingSession | function | 3744 |
| region | method | 3746 |
| saveView | method | 3753 |
| updateAvailability | method | 3757 |
| switchSession | function | 3773 |
| saveView | method | 3775 |
| updateAvailability | method | 3778 |
| copySessionFile | function | 3794 |
| positionSessionMenu | function | 3807 |
| normalizeCwd | function | 3813 |
| sessionDayLabel | function | 3817 |
| renderSessions | function | 3830 |
| sessionAction | const | 4166 |
| openSessionAction | function | 4168 |
| contextIcon | function | 4209 |
| renderContextChips | function | 4212 |
| fuzzyHit | function | 4231 |
| renderContextResults | function | 4238 |
| showContextSkills | function | 4258 |
| positionContextSkills | function | 4263 |
| showContextSkills | method | 4275 |
| region | method | 4310 |
| skillTrigger | const | 4312 |
| showContextSkills | method | 4328 |
| resizePrompt | method | 4337 |
| region | method | 4338 |
| SLASH_COMMANDS | const | 4343 |
| closeCompletion | function | 4346 |
| highlightCompletion | function | 4354 |
| chooseCompletion | function | 4363 |
| closeCompletion | method | 4375 |
| updateCompletion | function | 4378 |
| closeCompletion | method | 4379 |
| expandComposer | method | 4433 |
| resizePrompt | method | 4439 |
| region | method | 4440 |
| switchSession | method | 4480 |
| creationLoad | const | 4491 |
| defaultsScope | const | 4493 |
| renderDefaultsScope | function | 4494 |
| refreshDefaultsScope | function | 4528 |
| createAgentPicker | function | 4530 |
| options | method | 4556 |
| fill | method | 4563 |
| fillThinking | method | 4571 |
| options | method | 4573 |
| defaultsSelection | const | 4626 |
| defaultsSaving | const | 4639 |
| loadCreation | function | 4641 |
| disposePickers | method | 4648 |
| disposePickers | method | 4649 |
| disposePickers | method | 4654 |
| disposePickers | function | 4686 |
| openDefaults | function | 4689 |
| disposePickers | method | 4694 |
| openSessionConfiguration | function | 4703 |
| openScopedConfiguration | function | 4708 |
| renderDefaultsScope | method | 4713 |
| showSettingsPanel | method | 4714 |
| updateAvailability | method | 4725 |
| updateDefaultsPreview | function | 4738 |
| updateDefaultsPreview | method | 4762 |
| saveCreation | function | 4772 |
| updateAvailability | method | 4797 |

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

### public/usage-audit.js（72 行） — 用量与限流面板：全局汇总、会话分账、请求明细与限额配置

| 符号 | 类型 | 行 |
|---|---|---|
| createUsageAudit | function | 2 |

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

### scripts/legacy-history-dryrun.mjs（63 行） — 旧历史只读盘点，不迁移或写入

| 符号 | 类型 | 行 |
|---|---|---|
| inspectLegacyHistory | function | 7 |
| walk | method | 49 |

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

### src/compaction-budget.js（21 行） — 统一完整请求预算、高低水位及压缩错误分级

| 符号 | 类型 | 行 |
|---|---|---|
| requestBudget | function | 3 |
| compactionError | function | 16 |

### src/compaction-input.js（19 行） — 摘要预算视图，UTF-8首尾范围与省略标记，不用于原文归档

| 符号 | 类型 | 行 |
|---|---|---|
| selectSummaryInput | function | 4 |

### src/compaction-state.js（72 行） — 累计任务状态与来源校验、候选身份

| 符号 | 类型 | 行 |
|---|---|---|
| STATE_FIELDS | const | 3 |
| STATUSES | const | 4 |
| inheritTaskState | function | 7 |
| validateTaskState | function | 23 |
| renderStateSections | function | 58 |
| renderTaskState | function | 62 |
| candidateIdentity | function | 69 |

### src/compaction.js（822 行） — 后台独立摘要、token/占比阈值、快照校验与 turn 安全提交

| 符号 | 类型 | 行 |
|---|---|---|
| contextTokens | function | 31 |
| prepareBackgroundCompaction | function | 38 |
| DEFAULT_COMPACTION_CONFIG | const | 81 |
| normalizeCompaction | function | 83 |
| overCompactionThreshold | function | 87 |
| entryIdFor | function | 93 |
| summarizedEntryIds | function | 106 |
| COMPACT_MAX | const | 127 |
| FACTS_MAX | const | 128 |
| parseSummaryOutput | function | 129 |
| throwIfAborted | function | 176 |
| factMatch | function | 185 |
| lineOf | const | 196 |
| validateFacts | function | 198 |
| writeConversationSnapshot | function | 227 |
| appendVerifiedFacts | function | 243 |
| summarizeWithPiSession | function | 263 |
| throwIfAborted | method | 265 |
| progress | method | 266 |
| RUN_HISTORY | const | 397 |
| RUN_PREVIEW_CHARS | const | 398 |
| RUN_STEPS | const | 399 |
| RUN_STREAM_INTERVAL | const | 401 |
| CANCEL_COOLDOWN | const | 403 |
| describeCompactionError | function | 405 |
| createBackgroundCompaction | function | 417 |

### src/data-owner.js（25 行） — 写库前数据根独占：内核管道或socket持有，禁止同根双写

| 符号 | 类型 | 行 |
|---|---|---|
| claimDataRoot | function | 6 |
| claimArchiveOwner | function | 7 |
| claimOwner | function | 8 |

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

### src/gate-ipc.js（97 行） — 共享闸门认证IPC与连接租约回收

| 符号 | 类型 | 行 |
|---|---|---|
| MAX_LINE | const | 4 |
| authenticated | const | 5 |
| serveGate | function | 9 |
| connectGate | function | 62 |

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

### src/history-journal.js（92 行） — 磁盘 journal 原文投影、持久屏障与提交确认

| 符号 | 类型 | 行 |
|---|---|---|
| readDurableJournal | function | 5 |
| installDurableJournal | function | 26 |
| confirmDurableAppend | function | 57 |
| createJournalArchive | function | 67 |

### src/history-tools.js（95 行） — 鉴权历史检索、原文分页及游标签名

| 符号 | 类型 | 行 |
|---|---|---|
| createHistoryReader | function | 5 |

### src/inline-images.js（32 行） — 模型上下文图片定位：将占位符与真实附件交错排列，不改存储与队列

| 符号 | 类型 | 行 |
|---|---|---|
| inlineImages | function | 2 |
| inlineImagesExtension | function | 29 |

### src/legacy-observation.js（525 行） — 旧观察归档只读分页兼容，不折叠或写入

| 符号 | 类型 | 行 |
|---|---|---|
| THRESHOLD_BYTES | const | 6 |
| FULL_SENDS | const | 8 |
| PLACEHOLDER_EXCERPT_BYTES | const | 10 |
| OBSERVATION_ID_PATTERN | const | 12 |
| READ_OBJECT_FLAGS | const | 14 |
| RECALL_MAX_BYTES | const | 16 |
| RECALL_MAX_LINES | const | 17 |
| RECALL_HEADER_RESERVE_BYTES | const | 18 |
| RECALL_HEADER_LINES | const | 19 |
| RECALL_LIMITS | const | 20 |
| RECALL_DEFAULT_BYTES | const | 25 |
| RECALL_SCAN_MAX_BYTES | const | 27 |
| RECALL_DEFAULT_CONTEXT_LINES | const | 28 |
| RECALL_MAX_CONTEXT_LINES | const | 29 |
| RECALL_MAX_QUERY_BYTES | const | 30 |
| hash | function | 32 |
| countLines | function | 36 |
| countBufferLines | function | 45 |
| OBSERVATION_DEFAULTS | const | 54 |
| positiveInteger | function | 66 |
| resolveObservationConfig | function | 74 |
| DEFAULT_CONFIG | const | 99 |
| objectPath | function | 101 |
| manifestPath | function | 106 |
| isObservationId | function | 110 |
| readManifest | function | 114 |
| createIntegrityVerifier | function | 126 |
| trimUtf8End | function | 173 |
| alignUtf8Start | function | 180 |
| excerptByBytes | function | 186 |
| readRecallChunk | function | 196 |
| readWholeObject | function | 240 |
| splitLines | function | 254 |
| readRecallLines | function | 261 |
| searchRecall | function | 299 |
| createObservationStats | function | 343 |
| observationRuntime | function | 356 |
| renderRecallHeader | function | 374 |
| legacyObservationExtension | function | 394 |

### src/main.js（145 行） — 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理

| 符号 | 类型 | 行 |
|---|---|---|
| port | const | 21 |
| host | const | 25 |
| cwd | const | 26 |
| home | const | 31 |
| releaseDataRoot | const | 33 |
| database | const | 41 |
| usage | const | 42 |
| modelStorage | const | 43 |
| factory | const | 45 |
| sessions | const | 51 |
| models | const | 53 |
| idleTimer | const | 56 |
| service | const | 60 |
| app | const | 94 |
| remoteReady | const | 99 |
| initRemote | function | 108 |
| closing | const | 118 |
| stop | function | 119 |
| clearInterval | method | 120 |

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

### src/pi.js（639 行） — createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档）

| 符号 | 类型 | 行 |
|---|---|---|
| agentRuntime | function | 24 |
| queueStateOf | function | 41 |
| hasModelOutput | function | 70 |
| withdrawQueue | function | 81 |
| recallLastMessage | function | 99 |
| CHECKPOINT_BOUNDARY | const | 127 |
| memoryExtension | function | 138 |
| createPiFactory | function | 162 |

### src/prompts.js（65 行） — Axiom 自有提示词按 main/subagent/compaction 角色集中维护

| 符号 | 类型 | 行 |
|---|---|---|
| MAIN_AGENT_PROMPT | const | 3 |
| TITLE_INSTRUCTION | const | 34 |
| SUBAGENT_PROMPT | const | 37 |
| WRAP_UP_PROMPT | const | 38 |
| budgetSystemPrompt | const | 39 |
| taskStateRequest | function | 42 |
| SUMMARY_SYSTEM_PROMPT | const | 47 |
| summaryRequest | function | 50 |

### src/protocol.js（370 行） — zod 协议：selection / command 判别联合（消息类型见 L3）

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

### src/raw-history.js（77 行） — 完整原文耐久归档、身份幂等与恢复校验

| 符号 | 类型 | 行 |
|---|---|---|
| historyError | function | 6 |
| canonical | function | 7 |
| contentHash | const | 12 |
| keyOf | const | 13 |
| writeAll | function | 14 |
| fsyncSync | method | 17 |
| createRawArchive | function | 21 |
| mkdirSync | method | 23 |

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

### src/request-gate.js（115 行） — FIFO并发令牌与RPM滑动窗口

| 符号 | 类型 | 行 |
|---|---|---|
| validateLimits | function | 3 |
| RequestGate | class | 19 |
| constructor | method | 28 |
| configure | method | 37 |
| acquire | method | 43 |
| sweep | method | 61 |
| cooldown | method | 89 |
| snapshot | method | 94 |
| close | method | 105 |
| retryAfterMs | function | 108 |

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

### src/server.js（554 行） — createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发

| 符号 | 类型 | 行 |
|---|---|---|
| dev | const | 11 |
| digest | const | 12 |
| load | const | 13 |
| freshen | const | 18 |
| assets | const | 28 |
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

### src/session-history.js（37 行） — 稳定消息身份、线缆记录投影与只读 JSONL 历史读取

| 符号 | 类型 | 行 |
|---|---|---|
| messageIdOf | const | 10 |
| toWireRecord | const | 13 |
| readSessionManager | function | 27 |
| readSessionHistory | function | 34 |

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

### src/sessions.js（2177 行） — Sessions：会话生命周期、增量保存、元数据启动与SDK按需恢复

| 符号 | 类型 | 行 |
|---|---|---|
| GOAL_TOOL_NAMES | const | 26 |
| hasRunningTasks | const | 28 |
| referencedToolKeys | const | 31 |
| relevantTools | function | 44 |
| ownedTools | function | 53 |
| delegateTaskIds | const | 64 |
| projectTimeline | function | 77 |
| entryIdSet | const | 100 |
| compactedAnswer | const | 104 |
| compactedRecord | function | 113 |
| foldCompacted | function | 137 |
| historyRetries | function | 171 |
| translateRetries | function | 189 |
| BROWSE_PAGE | const | 210 |
| SEARCH_LIMIT | const | 212 |
| SEARCH_DIR_LIMIT | const | 213 |
| IGNORED_ENTRIES | const | 215 |
| fuzzyHit | function | 218 |
| matchRank | function | 229 |
| searchEntries | function | 238 |
| pointStatus | function | 266 |
| trackElapsed | function | 273 |
| fallbackTitle | function | 284 |
| resolveDir | function | 289 |
| parentOf | function | 300 |
| absoluteCrumbs | function | 309 |
| importedTitle | function | 331 |
| duplicateTitle | function | 355 |
| hostLocations | function | 367 |
| landedSessionFile | function | 386 |
| RETRYABLE_SQLITE | const | 393 |
| retryableWrite | const | 394 |
| DEFAULTS_NS | const | 399 |
| WORKSPACE_PREFIX | const | 400 |
| workspaceKeyOf | const | 401 |
| CAPABILITY_KINDS | const | 402 |
| catalogProjectsOf | const | 404 |
| validateProjectSkills | function | 407 |
| validateProjectSkillEntry | function | 411 |
| mergeLegacyProjectSkills | function | 419 |
| Sessions | class | 428 |
| constructor | method | 429 |
| applyDefaults | method | 453 |
| loadDefaults | method | 459 |
| migrateDefaults | method | 471 |
| migrateLegacyStore | method | 486 |
| loadWorkspaceDefaults | method | 510 |
| loadTaskBudget | method | 529 |
| getTaskBudget | method | 544 |
| configureTaskBudget | method | 550 |
| getDefaults | method | 557 |
| defaultsFor | method | 561 |
| listDefaults | method | 565 |
| deleteDefaults | method | 571 |
| removeDefaults | method | 576 |
| workspaceDefaults | method | 585 |
| configureDefaults | method | 605 |
| saveDefaults | method | 611 |
| pushCompaction | method | 648 |
| validateSelection | method | 659 |
| validateCompaction | method | 690 |
| load | method | 704 |
| ensureLoaded | method | 729 |
| migrateLegacySessions | method | 755 |
| sessionData | method | 779 |
| persist | method | 798 |
| writeChange | method | 832 |
| saveChange | method | 848 |
| list | method | 853 |
| rename | method | 870 |
| importSession | method | 884 |
| duplicate | method | 914 |
| create | method | 971 |
| goalAction | method | 1376 |
| scheduleGoal | method | 1422 |
| advanceGoal | method | 1434 |
| goalNotificationsBlocked | method | 1472 |
| scheduleTaskNotifications | method | 1479 |
| deliverTaskNotifications | method | 1492 |
| settleTaskNotifications | method | 1537 |
| get | method | 1558 |
| revealWorkspace | method | 1563 |
| browse | method | 1577 |
| listFiles | method | 1583 |
| refreshSkills | method | 1645 |
| configData | method | 1654 |
| snapshot | method | 1665 |
| compactionMessages | method | 1751 |
| subscribe | method | 1800 |
| canReconfigure | method | 1808 |
| configure | method | 1814 |
| startRun | method | 1865 |
| retry | method | 1913 |
| prompt | method | 1922 |
| withdraw | method | 1957 |
| replyQuestion | method | 2011 |
| safeStop | method | 2020 |
| cancelCompaction | method | 2037 |
| cancel | method | 2045 |
| retryTask | method | 2071 |
| deleteRecords | method | 2082 |
| releaseIdle | method | 2093 |
| remove | method | 2116 |
| close | method | 2167 |

### src/shared-gate.js（86 行） — 用户级共享闸门端点与远程服务适配

| 符号 | 类型 | 行 |
|---|---|---|
| gateLayout | function | 8 |
| remoteService | function | 25 |
| shareGate | function | 62 |
| claimShared | function | 71 |

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

### src/usage-backfill.js（23 行） — 历史用量时间分界与指纹去重

| 符号 | 类型 | 行 |
|---|---|---|
| backfillEntries | function | 5 |

### src/usage-service.js（56 行） — 用量服务与限流配置

| 符号 | 类型 | 行 |
|---|---|---|
| UsageService | class | 7 |
| constructor | method | 8 |
| configure | method | 18 |
| view | method | 25 |
| backfill | method | 33 |
| close | method | 54 |

### src/usage-store.js（294 行） — 请求明细持久化与账单聚合

| 符号 | 类型 | 行 |
|---|---|---|
| TABLES | const | 20 |
| INDEXES | const | 70 |
| OPEN_STATUS | const | 80 |
| TOKEN_COLUMNS | const | 82 |
| COST_COLUMNS | const | 92 |
| number | const | 102 |
| UsageStore | class | 104 |
| constructor | method | 108 |
| begin | method | 122 |
| admit | method | 133 |
| attempt | method | 141 |
| finish | method | 153 |
| importHistorical | method | 174 |
| recordGateEvent | method | 191 |
| billingBySession | method | 200 |
| billingGlobal | method | 219 |
| listRequests | method | 238 |
| openRequests | method | 272 |
| recentGateEvents | method | 283 |

### src/usage-stream.js（75 行） — 模型请求流审计与限流包装

| 符号 | 类型 | 行 |
|---|---|---|
| wrapUsageStream | function | 4 |

### tests/activity-groups-ui.py（205 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| activityHistory | const | 16 |
| sessions | const | 27 |

### tests/answer-tags.test.js（56 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| open | const | 5 |

### tests/app.test.js（2085 行） — node --test 测试（npm test）

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

### tests/compaction-lazy.test.js（162 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 11 |
| withSession | const | 21 |
| sayMain | const | 33 |

### tests/compaction-state.test.js（35 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| empty | const | 5 |

### tests/compaction-ui.test.js（367 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 11 |
| restore | method | 41 |

### tests/compaction.test.js（1421 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| fakeModel | const | 123 |
| createTestSession | function | 136 |
| seq | const | 153 |
| userMsg | const | 154 |
| assistantMsg | const | 155 |
| big | const | 161 |
| seed | function | 163 |
| settle | const | 168 |
| waitFor | function | 170 |
| enabledConfig | const | 178 |
| fakeSummarize | function | 187 |
| startHangingLlmServer | function | 195 |
| startFakeLlmServer | function | 218 |
| zodError | method | 304 |
| zodError | method | 305 |
| zodError | method | 306 |
| zodError | method | 307 |
| zodError | method | 308 |
| zodError | method | 309 |
| hangingSummarize | function | 747 |
| createLoopSession | function | 844 |
| writeFileSync | method | 845 |
| createPersistentTestSession | function | 1029 |
| factsTags | const | 1045 |
| withFacts | const | 1046 |
| withoutFacts | const | 1048 |

### tests/continuous-history.test.js（53 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| send | const | 5 |
| send | method | 32 |

### tests/continuous-preview.mjs（24 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| id | const | 5 |
| records | const | 6 |
| state | const | 7 |
| snapshot | const | 8 |
| sessions | const | 15 |
| app | const | 22 |

### tests/conversation-preview.mjs（219 行） — node --test 测试（npm test）

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
| compactRunStart | const | 100 |
| childBill | const | 153 |
| billedTasks | const | 157 |
| mainBill | const | 161 |
| totalCost | const | 162 |
| sessions | const | 170 |
| app | const | 216 |
| port | const | 217 |

### tests/empty-session-config-preview.mjs（30 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| home | const | 7 |
| catalog | const | 8 |
| factory | const | 9 |
| sessions | const | 23 |
| app | const | 25 |
| close | function | 27 |

### tests/empty-session-config.test.js（99 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| empty | const | 15 |
| chosen | const | 16 |
| fixture | function | 17 |
| release | method | 91 |

### tests/file-picker.test.js（68 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| source | const | 7 |
| tick | const | 8 |

### tests/fixtures/legacy-observation-writer.js（974 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| THRESHOLD_BYTES | const | 19 |
| FULL_SENDS | const | 21 |
| PLACEHOLDER_EXCERPT_BYTES | const | 23 |
| CHARS_PER_TOKEN | const | 25 |
| OBSERVATION_ID_PATTERN | const | 26 |
| READ_OBJECT_FLAGS | const | 28 |
| CREATE_OBJECT_FLAGS | const | 29 |
| RECALL_MAX_BYTES | const | 31 |
| RECALL_MAX_LINES | const | 32 |
| RECALL_HEADER_RESERVE_BYTES | const | 33 |
| RECALL_HEADER_LINES | const | 34 |
| RECALL_LIMITS | const | 35 |
| RECALL_DEFAULT_BYTES | const | 40 |
| RECALL_SCAN_MAX_BYTES | const | 42 |
| RECALL_DEFAULT_CONTEXT_LINES | const | 43 |
| RECALL_MAX_CONTEXT_LINES | const | 44 |
| RECALL_MAX_QUERY_BYTES | const | 45 |
| hash | function | 47 |
| estimateTokens | function | 51 |
| countLines | function | 55 |
| countBufferLines | function | 64 |
| OBSERVATION_DEFAULTS | const | 79 |
| positiveInteger | function | 91 |
| resolveObservationConfig | function | 99 |
| DEFAULT_CONFIG | const | 124 |
| isPureTextResult | function | 126 |
| textFromResult | function | 136 |
| objectPath | function | 141 |
| manifestPath | function | 146 |
| isObservationId | function | 150 |
| createObservation | function | 158 |
| ensureStored | function | 184 |
| writeManifest | function | 240 |
| readManifest | function | 271 |
| createIntegrityVerifier | function | 287 |
| trimUtf8End | function | 334 |
| alignUtf8Start | function | 341 |
| excerptByBytes | function | 347 |
| completeLineExcerpt | function | 357 |
| placeholderFor | function | 380 |
| RECALL_ECHO_PATTERN | const | 407 |
| parseRecallEcho | function | 409 |
| recallPointerFor | function | 422 |
| readRecallChunk | function | 436 |
| readWholeObject | function | 480 |
| splitLines | function | 494 |
| readRecallLines | function | 501 |
| searchRecall | function | 539 |
| createObservationStats | function | 589 |
| observationRuntime | function | 602 |
| createLedger | function | 621 |
| dropRedundantRecallEchoes | function | 647 |
| observationPackExtension | function | 671 |
| renderRecallHeader | function | 955 |

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

### tests/goal-sessions.test.js（744 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| PLAN | const | 11 |
| factoryFixture | function | 22 |
| tick | const | 57 |
| until | function | 58 |
| ordinary | function | 64 |
| enterGoal | function | 73 |
| injectToolResult | function | 307 |
| reply | function | 315 |
| evidenceBody | const | 327 |

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

### tests/helpers/model-concurrency-child.mjs（93 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| barrier | const | 11 |
| writeSync | method | 12 |
| runOpponent | function | 28 |
| createInterface | method | 40 |

### tests/helpers/public-source.js（16 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| publicSource | const | 5 |
| event | function | 11 |
| appliedSeq | const | 12 |
| rawEntryIds | function | 14 |

### tests/helpers/session-page.js（186 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| CONFIG | const | 14 |
| makeRecords | const | 17 |
| html | const | 24 |
| pickerSource | const | 25 |
| modelSources | const | 26 |
| pageSource | const | 32 |
| answerSource | const | 34 |
| markdownSource | const | 35 |
| sessionState | function | 40 |
| settle | const | 46 |
| until | function | 47 |
| bootSessionPage | function | 58 |

### tests/history-page-cache.test.js（69 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| md | const | 9 |
| records | const | 10 |

### tests/history-projection.test.js（137 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| fakeSource | function | 13 |
| mainRecord | const | 30 |
| subRecord | const | 32 |
| delegateAnchor | const | 34 |
| append | const | 38 |
| entryIds | const | 43 |
| mainIds | const | 44 |
| boot | function | 46 |
| append | method | 51 |

### tests/history-reading.test.js（136 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| pageState | const | 23 |

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

### tests/observation-pack-flow.test.js（123 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| PREAMBLE | const | 12 |
| FOOTER | const | 70 |
| run | const | 75 |

### tests/observation-pack.test.js（612 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| bigText | function | 24 |
| toolResult | function | 31 |
| assistant | function | 35 |
| fakePi | function | 39 |
| project | function | 50 |
| observationPackExtension | method | 125 |
| observationPackExtension | method | 129 |

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

### tests/project-skills.test.js（144 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| scopeKey | const | 9 |
| setup | function | 16 |

### tests/prompt-resize.test.js（303 行） — node --test 测试（npm test）

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

### tests/recall.test.js（208 行） — node --test 测试（npm test）

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

### tests/render-capacity-ui.py（203 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| COUNT | const | 32 |
| capacityRecords | const | 33 |
| capacityBase | const | 44 |
| capacityFull | const | 50 |

### tests/request-gate.test.js（74 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| fixture | function | 5 |
| advance | method | 29 |
| advance | method | 30 |
| advance | method | 52 |

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

### tests/send-optimistic.test.js（176 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| userEnd | const | 43 |

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

### tests/session-created-at.test.js（45 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 8 |

### tests/session-flow.test.js（596 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| flowFactory | const | 92 |
| jsonlFactory | const | 102 |

### tests/session-history.test.js（238 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| build | const | 10 |
| fakeSource | function | 24 |
| append | const | 41 |

### tests/session-memory.test.js（164 行） — node --test 测试（npm test）

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

### tests/session-persistence.test.js（479 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| Sessions | class | 9 |
| create | method | 10 |
| factory | const | 25 |

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

### tests/shared-gate.test.js（24 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| grant | method | 16 |

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

### tests/snapshot-chunk.test.js（104 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| messageEvent | const | 8 |
| login | function | 14 |
| restore | method | 84 |

### tests/snapshot-first-screen.test.js（88 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| TOTAL | const | 7 |
| login | function | 9 |
| restore | method | 77 |

### tests/snapshot-switch.test.js（221 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| messageEvent | const | 7 |
| login | function | 13 |
| holdReattach | const | 20 |
| releaseAttachA | method | 207 |

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

### tests/task-budget.test.js（103 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 10 |

### tests/task-cancel-notifications.test.js（65 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| until | const | 8 |

### tests/task-notifications.test.js（258 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factoryFixture | function | 10 |
| tick | const | 34 |
| until | function | 35 |

### tests/task-resume.test.js（182 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| fakeAgent | function | 9 |
| fixture | function | 36 |
| restored | const | 46 |

### tests/task-timer.test.js（59 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| emit | const | 9 |
| factory | const | 10 |
| subscribe | method | 12 |
| state | const | 23 |
| settle | const | 24 |

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

### tests/usage-store.test.js（283 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| withStore | function | 11 |
| usage | function | 24 |
| complete | function | 38 |

### tests/usage-stream.test.js（62 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| createStream | function | 6 |
| model | const | 17 |
| message | const | 18 |
| fixture | function | 19 |

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

- 协议 command.type：image、inherit、goal.action、service.status、service.update.check、service.restart、remote.get、remote.login、remote.configure、session.rename、workspace.reveal、workspace.browse、files.browse、models.list、models.config.get、models.provider.save、models.provider.delete、models.provider.rename、models.model.save、models.model.delete、models.provider.discover、models.favorites.get、models.model.override、models.auth.list、models.auth.start、models.auth.status、models.auth.respond、models.auth.cancel、models.auth.logout、models.hidden.set、models.favorites.set、capabilities.list、session.defaults.get、session.defaults.configure、session.defaults.list、session.defaults.delete、usage.backfill、usage.get、usage.configure、task.budget.get、task.budget.configure、session.configure、inherit、sessions.list、session.create、session.import、session.duplicate、session.attach、session.compaction.messages、session.compaction.cancel、session.skills.refresh、session.close、prompt、cancel、question.reply、session.retry、task.retry、queue.withdraw、tasks.read（src/protocol.js）
- HTML id：sidebar、new、open-workspace、import-session、search、sessions、open-settings、sidebar-backdrop、toggle-sidebar、session-alert、session-title、workspace-label、copy-workspace、reveal-workspace、workspace-feedback、conversation-font-scale、github-link、status、service-dev、service-version、open-raw-io、toggle-theme、login、maintenance-state、connect、workspace、goal-track、earliest、transcript、output、raw-io、raw-io-title、close-raw-io、raw-io-empty、raw-io-list、goal-dock、question-dock、latest、message-queue、task-runs、compaction-progress、safe-stop-progress、add-context、add-image、goal-enter、image-files、context-chips、task-timer、task-timer-value、context-menu、context-picker、context-back、context-title、context-close、context-search、context-results、context-error、image-attachments、composer、prompt、prompt-completion、composer-skill、agent-role、provider、model、thinking、stop、force-stop、send-steer、send-followup、send、session-runtime、session-inspector-trigger、session-billing-trigger、session-bill-total、mobile-runtime、mobile-expand、composer-help、error、session-action、session-action-form、session-action-title、session-action-description、session-name-label、session-name、session-action-error、session-action-cancel、session-action-submit、image-preview、image-preview-close、image-preview-image、restart-dialog、restart-form、restart-title、restart-description、restart-warning、restart-cancel、restart-submit、force-stop-dialog、force-stop-form、force-stop-title、force-stop-description、force-stop-warning、force-stop-cancel、force-stop-submit、session-detail、session-detail-title、session-detail-close、session-inspector、inspector-prompt-tab、inspector-tools-tab、inspector-prompt-panel、session-system-prompt、inspector-tools-panel、session-active-tools、session-billing、session-bill-body、task-overlays、compaction-run、compaction-run-title、compaction-run-meta、compaction-run-pick-label、compaction-run-pick、compaction-run-cancel、compaction-run-error、compaction-run-trigger、compaction-run-steps、compaction-run-stream-wrap、compaction-run-stream、task-template、goal-plan、goal-plan-title、goal-plan-meta、goal-plan-constraints-title、goal-plan-constraints、goal-plan-acceptance-title、goal-plan-acceptance、goal-plan-rounds-section、goal-plan-rounds-title、goal-plan-rounds、goal-plan-close、goal-plan-confirm、settings、settings-title、settings-connection-tab、settings-defaults-tab、settings-remote-tab、settings-models-tab、settings-usage-tab、settings-service-tab、usage-panel、connection-panel、connection-current-title、connection-current、connection-form、connection-address、connection-help、connection-feedback、connection-connect、defaults-panel、selection-copy-title、selection-copy、selection-copy-help、selection-copy-feedback、queue-type、steer-help、followup-help、defaults-preview、task-budget-title、task-max-turns、task-wrap-up-window、task-budget-help、subagent-title、subagent-help、subagent-provider、subagent-model、settings-feedback、defaults-title、defaults-scope-label、defaults-delete、defaults-workspace-help、defaults-editor、create-form、create-defaults-help、config-hot-title、config-timing-help、create-agents、create-compaction、config-subagent-title、config-subagent-help、create-subagent-settings、config-new-session-title、config-assembly-help、create-capabilities、create-retry、assembly-actions、assembly-feedback、apply-assembly、create-feedback、remote-panel、remote-status-title、remote-status、remote-login、remote-auth、remote-url、remote-form、remote-note、remote-enabled、remote-email、remote-email-help、remote-feedback、remote-refresh、remote-save、models-panel、service-panel、service-state-title、service-feedback、service-restart-title、restart-quick、restart-rebuild、service-recover、service-update-section、service-update-title、update-check、update-result、update-install、service-history-title、service-history（public/index.html）
- HTTP 静态路由：/、/favicon.svg、/style.css、/theme.js、/app.js、/icons.js、/session-cache.js、/session-details.js、/transport.js、/goal.js、/goal.css、/question.js、/question.css、/service-settings.js、/usage-audit.js、/file-picker.js、/tooltip.js、/tooltip.css、/file-picker.css、/markdown.js、/stream-renderer.js、/stream-playback.js、/markdown-scan.js、/memory-tags.js、/clipboard.js、/answer-tags.js、/goal-markers.js、/vendor/marked.js、/vendor/purify.js、/model-manager.js、/model-auth.js、/model-manager.css、/model-picker.js、/model-picker.css、/health（src/server.js）

## ⚠ 未登记文件（0）

（无）
