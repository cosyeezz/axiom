<!-- 自动生成，勿手改。重建：node .pi/skills/codebase-map/scripts/reindex.mjs -->
# Axiom 多级代码索引（生成于 2026/9/22 09:27:57）

## L1 模块总览（文件 → 职责）

| 文件 | 行数 | 职责 | 关键符号 |
|---|---|---|---|
| desktop/connector/index.html | 184 | 壳内置连接入口页：地址可配置、可达探测与整页跳转 | - |
| desktop/pake.json | 14 | Pake 桌面壳配置：本地连接入口页、内导航与窗口参数 | - |
| public/answer-tags.js | 48 | 主代理回答标签解析、代码保护与流式容错 | OPEN, CLOSE, MARKS, isMark |
| public/app.js | 5050 | 前端唯一入口：视图栈、会话/设置 UI、权威归并与渲染调度 | questionUI, filePicker, $, sessionDetail |
| public/clipboard.js | 27 | 统一剪贴板入口：Clipboard API 优先，非安全上下文回退 execCommand | copyText |
| public/compaction-view.js | 79 | 压缩尝试详情、完整输出及安全Markdown与原文切换 | createCompactionView |
| public/composer-controls.css | 48 | 输入区扁平按钮、级联菜单、分组信息与窄屏布局 | - |
| public/composer-controls.js | 138 | 紧凑输入区：三级搜索模型菜单、固定运行操作与焦点管理 | mountComposerControls |
| public/file-picker.css | 276 | 文件选择弹窗主题与响应式布局 | - |
| public/file-picker.js | 356 | 共享文件/目录选择弹窗、懒加载与分类 SVG 图标 | NS, SEARCH_DEBOUNCE, el, FOLDER_COLORS |
| public/goal-markers.js | 64 | 前后端共享 goal 完成标记解析与展示层剥离（含流式半截） | ROUND_MARKER, GOAL_MARKER, MARKER_TOKENS, SUFFIXES |
| public/goal.css | 239 | Goal 目标面板、轮次与控制样式 | - |
| public/goal.js | 644 | Goal 专属状态、操作与复用消息轮次分组 | createGoalUI |
| public/icons.js | 136 | 全页面动作 SVG 图标：固定几何路径字典、静态控件与模板水合 | artwork, tones, composerIcon, composerIconNode |
| public/index.html | 463 | 页面骨架与元素 id（见 L3） | - |
| public/markdown-scan.js | 140 | 共享代码区扫描：围栏/缩进/行内代码掩码与区间切割 | FILL, FENCE, INLINE, fill |
| public/markdown.js | 484 | marked + DOMPurify 渲染（XSS 边界） | cache, PAGE_CACHE_ENTRY_LIMIT, PAGE_CACHE_BYTE_LIMIT, createMarkdownPageCache |
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
| public/style.css | 1940 | 全局样式（CSP 禁 inline style，样式一律进这里） | - |
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
| src/compaction-excerpt.js | 49 | 内联原文逐字匹配、消息ID替换与Unicode关键词窗口 | messageText, idsIn, resolveSummaryExcerpts, messageWindow |
| src/compaction-input.js | 20 | 摘要预算视图，UTF-8首尾范围与省略标记，不用于原文归档 | selectSummaryInput |
| src/compaction-output.js | 38 | 摘要 JSON 边界解析与引用处理前的结构预校验 | parseTaskStateOutput |
| src/compaction-state.js | 72 | 累计任务状态与来源校验、候选身份 | STATE_FIELDS, STATUSES, inheritTaskState, validateTaskState |
| src/compaction.js | 957 | 后台独立摘要、token/占比阈值、快照校验与 turn 安全提交 | contextTokens, prepareBackgroundCompaction, DEFAULT_COMPACTION_CONFIG, normalizeCompaction |
| src/data-owner.js | 26 | 写库前数据根独占：内核管道或socket持有，禁止同根双写 | claimDataRoot, claimArchiveOwner, claimJournalOwner, claimOwner |
| src/database.js | 122 | 共享 SQLite 连接、小配置 KV、WAL 与一致性备份 | nodeOk, DATA_VERSION, assertDataVersion, Database |
| src/gate-ipc.js | 97 | 共享闸门认证IPC与连接租约回收 | MAX_LINE, authenticated, serveGate, connectGate |
| src/goal.js | 988 | Goal：会话级目标状态、轮次计划、验收门与持久化 | GOAL_PHASES, GOAL_ACTIONS, ROUND_STATUSES, GOAL_MAX_SEGMENTS |
| src/history-journal.js | 121 | 磁盘 journal 原文投影、持久屏障与提交确认 | readDurableJournal, installDurableJournal, confirmDurableAppend, createJournalArchive |
| src/history-tools.js | 127 | 鉴权历史检索、原文分页及游标签名 | createHistoryReader |
| src/inline-images.js | 32 | 模型上下文图片定位：将占位符与真实附件交错排列，不改存储与队列 | inlineImages, inlineImagesExtension |
| src/legacy-observation.js | 525 | 旧观察归档只读分页兼容，不折叠或写入 | THRESHOLD_BYTES, FULL_SENDS, PLACEHOLDER_EXCERPT_BYTES, OBSERVATION_ID_PATTERN |
| src/main.js | 145 | 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理 | port, host, cwd, home |
| src/model-auth.js | 89 | SDK 登录桥：连接隔离、超时取消与安全事件投影 | safeUrl, text, eventView, createModelAuthService |
| src/model-config.js | 619 | Pi models.json 无损配置读写与共享收藏持久化 | sdkModelConfig, sdkResolveConfigValue, digest, LEVELS |
| src/native-summary.js | 79 | 原生摘要请求、split-turn附加证据提示与只读流观察 | TASK_STATE_SYSTEM, EXCERPT_INSTRUCTIONS, observeSummaryStream, summarizeNative |
| src/pi-model-storage.js | 409 | 模型与凭据 SQLite 权威存储、Pi 派生兼容文件 | sdkResolveConfigValue, sdkIsCommandConfigValue, NAMESPACE, AUTH_NAMESPACE |
| src/pi.js | 720 | createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档） | forkSafePoint, agentRuntime, queueStateOf, hasModelOutput |
| src/prompts.js | 70 | Axiom 自有提示词按 main/subagent/compaction 角色集中维护 | MAIN_AGENT_PROMPT, TITLE_INSTRUCTION, SUBAGENT_PROMPT, WRAP_UP_PROMPT |
| src/protocol.js | 383 | zod 协议：selection / command 判别联合（消息类型见 L3） | id, capabilities, workspace, thinking |
| src/questions.js | 86 | 主代理 question 工具、参数校验与可取消的回答等待 | text, option, input, questionAnswers |
| src/raw-history.js | 119 | 完整原文耐久归档、身份幂等与恢复校验 | historyError, canonical, contentHash, isOriginal |
| src/remote.js | 547 | Tailscale 登录身份、远程监听、同账号授权与本机配置持久化 | configSchema, execOptions, cliEnv, defaultRun |
| src/request-gate.js | 115 | FIFO并发令牌与RPM滑动窗口 | validateLimits, RequestGate, retryAfterMs |
| src/retry.js | 196 | 模型失败重试：可取消退避、最多45次、16分钟封顶、自定义错误词表、保留已有工具结果继续 | RETRY_DELAYS_MS, MAX_DELAY_MS, MAX_RETRIES, RECOVERY_PROMPT |
| src/safe-points.js | 37 | 完整会话前缀安全点、恢复状态与工具批次边界校验 | safePoints, navigationState, requireSafePoint |
| src/server.js | 579 | createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发 | dev, digest, load, freshen |
| src/session-billing.js | 63 | 全会话 entries 用量与费用统计、当前上下文估算 | keys, zero, number, sessionBilling |
| src/session-history.js | 37 | 稳定消息身份、线缆记录投影与只读 JSONL 历史读取 | messageIdOf, toWireRecord, readSessionManager, readSessionHistory |
| src/session-memory.js | 34 | 标题提取登记、轮次预算挂钩与委派背景 | textOf, memoryHooks |
| src/session-store.js | 489 | 会话三表、实体增量更新、逐会话事务与旧数据迁移 | EVENT_TYPES, SESSION_FIELDS, TABLES, INDEXES |
| src/sessions.js | 2319 | Sessions：会话生命周期、增量保存、元数据启动与SDK按需恢复 | GOAL_TOOL_NAMES, hasRunningTasks, referencedToolKeys, relevantTools |
| src/shared-gate.js | 86 | 用户级共享闸门端点与远程服务适配 | gateLayout, remoteService, shareGate, claimShared |
| src/task-budget.js | 36 | 主子代理轮次预算规则、收尾提示词与配置页参数校验 | TASK_BUDGET_LIMITS, taskBudgetDefaults, within, taskBudgetPolicy |
| src/task-execution.js | 23 | 子任务活动阶段、独立时间预算、停止事实与总结提示 | EXECUTION_DEFAULTS, ACTIVE_TASK_STATES, stopReport, stopSummaryPrompt |
| src/task-state-doc.js | 20 | 压缩切点任务状态投影：从同版本日志派生独立上下文，不新增权威记录 | taskStateMessage, withTaskState |
| src/tasks.js | 266 | Tasks：子任务（委托）生命周期 | historyResult, Tasks |
| src/tool-execution.js | 53 | 命令默认超时策略、角色限制与工具耗时观察 | TOOL_TIMEOUT_PROMPT, createToolExecutionPolicy |
| src/tools.js | 158 | delegationTools：委托/凭证读取/追加工具定义（zod 入参） | delegateInput, readInput, appendInput, result |
| src/transport.js | 37 | 统一有界 WS 发送：回执、广播、删除通知与慢客户端隔离 | createSender |
| src/update.js | 41 | 检查更新：本地安装（提交 SHA/版本）比对 GitHub 公开仓库 master，npm 安装实例可自动重装 | repo, npmSpec, commitFile, validateCommit |
| src/usage-backfill.js | 23 | 历史用量时间分界与指纹去重 | backfillEntries |
| src/usage-service.js | 56 | 用量服务与限流配置 | UsageService |
| src/usage-store.js | 295 | 请求明细持久化与账单聚合 | TABLES, INDEXES, OPEN_STATUS, TOKEN_COLUMNS |
| src/usage-stream.js | 75 | 模型请求流审计与限流包装 | wrapUsageStream |
| tests/accept-native-two-rounds.mjs | 71 | node --test 测试（npm test） | dir, session |
| tests/activity-groups-ui.py | 205 | node --test 测试（npm test） | activityHistory, sessions |
| tests/answer-tags.test.js | 56 | node --test 测试（npm test） | open |
| tests/app.test.js | 2094 | node --test 测试（npm test） | pickerSource, modelSources, serviceSource |
| tests/autoscroll-ui.py | 99 | node --test 测试（npm test） | - |
| tests/autostart.test.js | 71 | node --test 测试（npm test） | node, cwd, service |
| tests/benchmark.js | 92 | node --test 测试（npm test） | window |
| tests/capabilities.test.js | 316 | node --test 测试（npm test） | - |
| tests/cli-help.test.js | 46 | node --test 测试（npm test） | cli |
| tests/clipboard.test.js | 85 | node --test 测试（npm test） | loadCopyText, dom |
| tests/codebase-index.test.js | 20 | node --test 测试（npm test） | ROOT, SKILL |
| tests/compaction-budget.test.js | 17 | node --test 测试（npm test） | - |
| tests/compaction-config.test.js | 208 | node --test 测试（npm test） | - |
| tests/compaction-excerpt.test.js | 28 | node --test 测试（npm test） | evidence |
| tests/compaction-input.test.js | 16 | node --test 测试（npm test） | - |
| tests/compaction-lazy.test.js | 162 | node --test 测试（npm test） | factory, withSession, sayMain |
| tests/compaction-output.test.js | 40 | node --test 测试（npm test） | state |
| tests/compaction-state.test.js | 35 | node --test 测试（npm test） | empty |
| tests/compaction-ui.py | 108 | node --test 测试（npm test） | - |
| tests/compaction-ui.test.js | 398 | node --test 测试（npm test） | page |
| tests/compaction-view.test.js | 31 | node --test 测试（npm test） | - |
| tests/compaction.test.js | 1684 | node --test 测试（npm test） | fakeModel, createTestSession, seq, userMsg |
| tests/composer-controls.test.js | 87 | node --test 测试（npm test） | iconSource, source, fixture |
| tests/composer-icons-ui.py | 84 | node --test 测试（npm test） | - |
| tests/config-scope-ui.py | 59 | node --test 测试（npm test） | - |
| tests/config.test.js | 309 | node --test 测试（npm test） | - |
| tests/context-menu-ui.py | 67 | node --test 测试（npm test） | - |
| tests/continuous-history.test.js | 53 | node --test 测试（npm test） | send |
| tests/continuous-preview.mjs | 24 | node --test 测试（npm test） | id, records, state, snapshot |
| tests/continuous-ui.py | 31 | node --test 测试（npm test） | - |
| tests/conversation-font-ui.py | 43 | node --test 测试（npm test） | - |
| tests/conversation-preview.mjs | 227 | node --test 测试（npm test） | markdown, message, thinking, state |
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
| tests/history-journal.test.js | 99 | node --test 测试（npm test） | - |
| tests/history-page-cache.test.js | 71 | node --test 测试（npm test） | md, records |
| tests/history-projection.test.js | 137 | node --test 测试（npm test） | fakeSource, mainRecord, subRecord, delegateAnchor |
| tests/history-reading.test.js | 136 | node --test 测试（npm test） | pageState |
| tests/history-tools.test.js | 78 | node --test 测试（npm test） | - |
| tests/icons.test.js | 63 | node --test 测试（npm test） | - |
| tests/image-input.test.js | 169 | node --test 测试（npm test） | pngBase64, jpegBase64, image, parsePrompt |
| tests/inline-images.test.js | 42 | node --test 测试（npm test） | text, a, b, user |
| tests/install.test.js | 150 | node --test 测试（npm test） | fakeService |
| tests/internal-task-queue.test.js | 41 | node --test 测试（npm test） | custom, user |
| tests/legacy-history-dryrun.test.js | 25 | node --test 测试（npm test） | - |
| tests/manual-compaction-ui.py | 33 | node --test 测试（npm test） | - |
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
| tests/native-summary.test.js | 72 | node --test 测试（npm test） | model, final |
| tests/new-session-feedback.test.js | 133 | node --test 测试（npm test） | appSource, inline, pickerSource, modelPickerSource |
| tests/observation-pack-flow.test.js | 150 | node --test 测试（npm test） | PREAMBLE, FOOTER, run |
| tests/observation-pack.test.js | 612 | node --test 测试（npm test） | bigText, toolResult, assistant, fakePi |
| tests/perf-attach-ground-truth.test.js | 261 | node --test 测试（npm test） | FILE, SOURCE, BASE, extractFunction |
| tests/perf-measure-lock.test.js | 28 | node --test 测试（npm test） | - |
| tests/perf-profile-cli.test.js | 82 | node --test 测试（npm test） | script, realCrossCheck |
| tests/perf-startup-cleanup.test.js | 206 | node --test 测试（npm test） | DIR, SCRIPTS, extractFunction, dropLine |
| tests/pi-memory.test.js | 180 | node --test 测试（npm test） | - |
| tests/pi-model-storage.test.js | 624 | node --test 测试（npm test） | tempDir, makeStorage, seedPiModels, seedPiAuth |
| tests/pi-question.test.js | 197 | node --test 测试（npm test） | - |
| tests/project-skills.test.js | 144 | node --test 测试（npm test） | scopeKey, setup |
| tests/prompt-resize.test.js | 179 | node --test 测试（npm test） | page |
| tests/question-layout-ui.py | 52 | node --test 测试（npm test） | - |
| tests/question-preview.mjs | 36 | node --test 测试（npm test） | factory, sessions, app, port |
| tests/question-ui.test.js | 99 | node --test 测试（npm test） | source |
| tests/questions.test.js | 110 | node --test 测试（npm test） | params |
| tests/raw-history.test.js | 109 | node --test 测试（npm test） | - |
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
| tests/safe-points.test.js | 47 | node --test 测试（npm test） | - |
| tests/safe-stop.test.js | 253 | node --test 测试（npm test） | - |
| tests/send-optimistic.test.js | 201 | node --test 测试（npm test） | userEnd |
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
| tests/session-store.test.js | 663 | node --test 测试（npm test） | withStore, fullSaved, LEGACY_DDL |
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
| tests/task-budget.test.js | 129 | node --test 测试（npm test） | factory |
| tests/task-cancel-notifications.test.js | 65 | node --test 测试（npm test） | until |
| tests/task-execution-ui.test.js | 56 | node --test 测试（npm test） | pageFor, taskState |
| tests/task-execution.test.js | 106 | node --test 测试（npm test） | delay, until, setup |
| tests/task-notifications.test.js | 274 | node --test 测试（npm test） | factoryFixture, tick, until |
| tests/task-resume.test.js | 182 | node --test 测试（npm test） | fakeAgent, fixture, restored |
| tests/task-state-doc.test.js | 28 | node --test 测试（npm test） | - |
| tests/task-state-generation.test.js | 30 | node --test 测试（npm test） | model, preparation, done |
| tests/task-state-pi.test.js | 79 | node --test 测试（npm test） | - |
| tests/task-timer.test.js | 59 | node --test 测试（npm test） | emit, factory, state, settle |
| tests/tasks.test.js | 276 | node --test 测试（npm test） | fixtures, fixture |
| tests/text-diagram-ui.py | 37 | node --test 测试（npm test） | - |
| tests/tool-detail-reclaim.test.js | 160 | node --test 测试（npm test） | page, toggle, entry |
| tests/tool-execution.test.js | 53 | node --test 测试（npm test） | fixture |
| tests/tooltip.test.js | 282 | node --test 测试（npm test） | source, boot, fire, tip |
| tests/transcript-empty-state.test.js | 51 | node --test 测试（npm test） | append |
| tests/ui-sticky-check.html | 63 | node --test 测试（npm test） | checks, lines, ok |
| tests/ui-sticky-check.mjs | 104 | node --test 测试（npm test） | here, candidates, browser, port |
| tests/uninstall.test.js | 45 | node --test 测试（npm test） | - |
| tests/update.test.js | 38 | node --test 测试（npm test） | old |
| tests/usage-backfill.test.js | 24 | node --test 测试（npm test） | - |
| tests/usage-extension.test.js | 14 | node --test 测试（npm test） | - |
| tests/usage-service.test.js | 25 | node --test 测试（npm test） | - |
| tests/usage-store.test.js | 283 | node --test 测试（npm test） | withStore, usage, complete |
| tests/usage-stream.test.js | 63 | node --test 测试（npm test） | createStream, model, message, fixture |
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

### public/app.js（5050 行） — 前端唯一入口：视图栈、会话/设置 UI、权威归并与渲染调度

| 符号 | 类型 | 行 |
|---|---|---|
| questionUI | const | 23 |
| filePicker | const | 25 |
| $ | const | 26 |
| sessionDetail | const | 28 |
| openSessionDetail | function | 29 |
| sessionId | const | 38 |
| sessionMissing | const | 51 |
| onboarding | const | 52 |
| allSessions | const | 53 |
| views | const | 55 |
| attachToken | const | 58 |
| goalUI | function | 62 |
| compactionDefaults | const | 78 |
| taskBudgetDefaults | const | 80 |
| effectiveLevels | function | 84 |
| modelFavorites | const | 89 |
| favoriteKey | function | 92 |
| modelPicker | const | 98 |
| modelManager | const | 113 |
| serviceUi | const | 114 |
| compactions | const | 115 |
| goalAnchors | const | 117 |
| anchorGoal | function | 118 |
| clearGoalPrompt | function | 124 |
| resizePrompt | method | 129 |
| region | method | 130 |
| lastMainMessage | const | 133 |
| compactionNodes | const | 134 |
| compactionSegments | const | 137 |
| compactionStatus | const | 140 |
| images | const | 141 |
| completionVersion | const | 142 |
| selectedSkill | const | 143 |
| hiddenSessions | const | 147 |
| pinnedSessions | const | 153 |
| openCwds | const | 159 |
| sessionGroupPrefs | const | 166 |
| saveSessionGroupPrefs | function | 172 |
| seenSessions | const | 177 |
| markSessionSeen | function | 182 |
| readSessionPreference | function | 189 |
| changeSessionPreference | function | 193 |
| setSessionHidden | function | 208 |
| setSessionPinned | function | 216 |
| focusSessionMore | function | 224 |
| saveView | function | 237 |
| promptLayout | const | 256 |
| promptFit | const | 257 |
| composerCollapsed | const | 259 |
| compactComposer | const | 260 |
| resizePrompt | function | 261 |
| invalidatePrompt | function | 270 |
| scrollFrame | const | 271 |
| FOLLOW_GAP | const | 272 |
| scrollIntent | const | 273 |
| lastScrollTops | const | 274 |
| noteScrollIntent | const | 276 |
| atLatest | const | 278 |
| readFollow | function | 281 |
| scrollToLatest | const | 290 |
| scrollLatest | function | 291 |
| scheduleCallGroups | method | 292 |
| transcript | const | 301 |
| growthWatch | const | 303 |
| growthObserver | function | 304 |
| watchGrowth | function | 307 |
| forgetGrowth | function | 308 |
| renderer | const | 311 |
| markdownPageCache | const | 316 |
| pageCacheCurrent | function | 317 |
| pageCacheKey | function | 321 |
| emptyPlaceholder | const | 324 |
| clearEmptyState | function | 325 |
| scrollLatest | method | 354 |
| mobile | const | 356 |
| sidebar | function | 357 |
| sidebar | method | 372 |
| sidebar | method | 375 |
| applyComposerCollapsed | method | 376 |
| invalidatePrompt | method | 377 |
| promptResizeFrame | const | 382 |
| COMPOSER_COLLAPSE_DELAY | const | 392 |
| composerHovered | const | 393 |
| composerWrap | const | 394 |
| applyComposerCollapsed | function | 395 |
| resizePrompt | method | 399 |
| clearComposerCollapseTimer | function | 401 |
| clearTimeout | method | 403 |
| composerBusy | function | 410 |
| expandComposer | function | 417 |
| clearComposerCollapseTimer | method | 418 |
| applyComposerCollapsed | method | 421 |
| collapseComposer | function | 423 |
| clearComposerCollapseTimer | method | 424 |
| applyComposerCollapsed | method | 427 |
| scheduleComposerCollapse | function | 429 |
| clearComposerCollapseTimer | method | 430 |
| composerIntent | const | 438 |
| fontScale | const | 444 |
| applyConversationFontScale | function | 445 |
| savedFontScale | const | 450 |
| applyConversationFontScale | method | 454 |
| themeColors | const | 460 |
| applyTheme | function | 461 |
| applyTheme | method | 472 |
| live | const | 481 |
| error | function | 482 |
| rawEntries | const | 486 |
| rawMode | function | 487 |
| rawMode | method | 495 |
| rawChanged | function | 506 |
| rawEntry | function | 512 |
| selectRaw | function | 517 |
| rawMode | method | 519 |
| TASK_NOTIFICATION_TYPE | const | 536 |
| TASK_NOTIFICATION_PREFIX | const | 537 |
| isTaskNotification | const | 538 |
| taskNotificationCard | function | 548 |
| clearEmptyState | method | 558 |
| scrollLatest | method | 560 |
| bindRaw | function | 563 |
| paintRaw | function | 577 |
| configuringSessions | const | 630 |
| request | function | 631 |
| queueMicrotask | method | 637 |
| region | function | 645 |
| updateAvailability | function | 649 |
| updateNavigation | method | 650 |
| region | method | 651 |
| region | method | 652 |
| region | method | 653 |
| region | method | 654 |
| updateConnection | function | 656 |
| updateModelAvailability | function | 661 |
| updateSettingsAvailability | function | 669 |
| updateNavigation | function | 687 |
| duplicateBlocked | function | 704 |
| updateComposer | function | 707 |
| renderContextChips | method | 718 |
| syncRetryPrompt | method | 729 |
| options | function | 732 |
| providerEntries | const | 743 |
| modelEntries | const | 744 |
| catalogRequest | const | 746 |
| refreshModelCatalog | function | 747 |
| updateNavigation | method | 769 |
| fillModels | function | 777 |
| options | method | 779 |
| renderAgentConfig | function | 781 |
| options | method | 785 |
| fillModels | method | 786 |
| options | method | 788 |
| fillSubagentModels | function | 792 |
| options | method | 794 |
| capabilityName | function | 802 |
| runtimeSummary | function | 812 |
| renderRuntime | function | 826 |
| updateTaskRuntime | function | 847 |
| renderRuntime | method | 849 |
| renderBill | method | 851 |
| applyConfig | function | 854 |
| region | method | 857 |
| region | method | 858 |
| region | method | 859 |
| renderComposerConfig | function | 861 |
| options | method | 862 |
| renderModelConfig | function | 868 |
| options | method | 869 |
| fillSubagentModels | method | 874 |
| renderAgentConfig | method | 875 |
| configureSeq | const | 878 |
| configure | function | 879 |
| updateAvailability | method | 890 |
| taskBudgetFields | const | 913 |
| taskBudgetInputs | const | 914 |
| settingsGeneration | const | 915 |
| budgetRequest | const | 916 |
| settingsTicket | const | 917 |
| loadTaskBudget | function | 927 |
| saveTaskBudget | function | 937 |
| usageAudit | const | 951 |
| showSettingsPanel | function | 952 |
| showSettingsPanel | method | 968 |
| renderDefaultsScope | method | 977 |
| showSettingsPanel | method | 978 |
| CONNECTION_KEY | const | 983 |
| normalizeBackendAddress | function | 984 |
| openConnectionPanel | function | 997 |
| renderDefaultsScope | method | 1017 |
| showSettingsPanel | method | 1018 |
| region | method | 1019 |
| remoteView | const | 1031 |
| remoteLoaded | const | 1032 |
| remoteAnchor | function | 1033 |
| remoteRender | function | 1041 |
| region | method | 1087 |
| remoteLoad | function | 1089 |
| remoteAuthUrl | function | 1109 |
| remoteLogin | function | 1117 |
| remoteOnReconnect | function | 1143 |
| updateAvailability | method | 1157 |
| messageItems | const | 1170 |
| activityPaths | const | 1172 |
| setActivityIcon | function | 1189 |
| callGroupsFrame | const | 1199 |
| scheduleCallGroups | function | 1200 |
| createCallGroup | function | 1210 |
| paintCallGroup | function | 1224 |
| refreshCallGroups | function | 1266 |
| foldCallsBeforeMessage | function | 1398 |
| paintCallGroup | method | 1402 |
| disclosureHint | function | 1404 |
| activityLine | function | 1418 |
| setActivity | method | 1428 |
| setActivity | function | 1431 |
| scheduleCallGroups | method | 1432 |
| setActivityIcon | method | 1434 |
| waiting | function | 1445 |
| scheduleCallGroups | method | 1447 |
| scrollLatest | method | 1453 |
| clearWaiting | function | 1455 |
| stopActivity | function | 1459 |
| scheduleCallGroups | method | 1461 |
| clearWaiting | method | 1462 |
| updateActivity | function | 1474 |
| setActivity | method | 1489 |
| setActivity | method | 1490 |
| mergeThoughts | function | 1494 |
| diffView | const | 1512 |
| renderToolDetail | function | 1517 |
| section | method | 1605 |
| toolState | function | 1607 |
| clearWaiting | method | 1609 |
| setActivity | method | 1656 |
| renderToolTiming | method | 1657 |
| renderToolDetail | method | 1658 |
| scrollLatest | method | 1659 |
| renderToolTiming | function | 1661 |
| renderSubtaskTiming | function | 1669 |
| card | function | 1675 |
| clearEmptyState | method | 1676 |
| prepareStream | function | 1739 |
| updateActivity | method | 1762 |
| renderMessage | function | 1764 |
| updateActivity | method | 1872 |
| compactionLabels | const | 1875 |
| compactionRunPhases | const | 1876 |
| compactionCount | const | 1877 |
| compactionClock | const | 1878 |
| compactionSpan | const | 1879 |
| compactionRuns | const | 1880 |
| compactionRun | function | 1882 |
| renderCompactionStatus | function | 1886 |
| openCompactionRun | function | 1931 |
| renderCompactionRun | method | 1933 |
| updateCompactionView | const | 1937 |
| renderCompactionRun | function | 1938 |
| trackTaskEntries | function | 2013 |
| placeCompactedTasks | function | 2024 |
| placeCompactedRetries | method | 2025 |
| compactionCard | function | 2054 |
| foldCompaction | function | 2087 |
| placeCompactedTasks | method | 2108 |
| scheduleCallGroups | method | 2109 |
| mergeThoughts | method | 2110 |
| liteItem | function | 2118 |
| markCompacted | method | 2137 |
| updateActivity | method | 2138 |
| loadCompactionSegment | function | 2142 |
| mountCompactionSegment | function | 2160 |
| placeCompactedTasks | method | 2235 |
| renderTaskRuns | method | 2236 |
| rawChanged | method | 2237 |
| scrollLatest | method | 2238 |
| compactionEditor | function | 2240 |
| options | method | 2281 |
| options | method | 2285 |
| fillThinking | method | 2323 |
| retryChipList | function | 2334 |
| render | method | 2383 |
| retryEditor | function | 2387 |
| ACTIVE_TASK_STATUSES | const | 2406 |
| renderTaskRuns | function | 2408 |
| renderQueue | function | 2439 |
| canResumeMessage | const | 2459 |
| retryPrompt | const | 2461 |
| syncRetryPrompt | function | 2462 |
| clearEmptyState | method | 2489 |
| scrollLatest | method | 2491 |
| retryCards | const | 2493 |
| placeCompactedRetries | function | 2494 |
| retryArchive | function | 2518 |
| renderRetry | function | 2531 |
| placeCompactedRetries | method | 2569 |
| scrollLatest | method | 2570 |
| applyEvent | function | 2572 |
| snapshotJob | const | 2875 |
| snapshot | function | 2876 |
| mountHistory | function | 2887 |
| finishSnapshot | method | 2893 |
| reattach | function | 2897 |
| saveView | method | 2899 |
| receiveHistoryEvent | function | 2912 |
| applyEvent | method | 2926 |
| beginSnapshot | function | 2936 |
| rawChanged | method | 2945 |
| clearTimeout | method | 2948 |
| markSessionSeen | method | 2965 |
| updatePageTitle | method | 2969 |
| renderTaskRuns | method | 2983 |
| renderCompactionStatus | method | 2988 |
| renderImages | method | 3021 |
| closeCompletion | method | 3024 |
| placeSnapshotMessage | function | 3030 |
| markCompacted | function | 3079 |
| safePointControl | function | 3092 |
| renderSafePoints | function | 3128 |
| finishSnapshot | function | 3140 |
| mergeThoughts | method | 3167 |
| placeCompactedTasks | method | 3181 |
| renderTaskRuns | method | 3182 |
| renderSafePoints | method | 3202 |
| renderQueue | method | 3221 |
| applyConfig | method | 3224 |
| updateAvailability | method | 3226 |
| region | method | 3227 |
| transport | const | 3229 |
| onState | method | 3233 |
| initialized | const | 3269 |
| initializeConnection | function | 3270 |
| importDir | const | 3387 |
| fillModels | method | 3392 |
| fillSubagentModels | method | 3399 |
| closeCompletion | method | 3416 |
| region | method | 3421 |
| scrollLatest | method | 3426 |
| pendingUser | const | 3481 |
| mountPendingUser | function | 3482 |
| renderMessage | method | 3486 |
| settlePendingUser | function | 3496 |
| failPendingUser | function | 3500 |
| nextPaint | function | 3515 |
| enableImagePreview | function | 3523 |
| renderImages | function | 3544 |
| addImages | function | 3569 |
| loadImages | function | 3590 |
| renderImages | method | 3599 |
| selectionCopy | const | 3622 |
| copySelection | function | 3634 |
| escapeTimer | const | 3697 |
| withdrawQueue | function | 3698 |
| markSessionSeen | method | 3776 |
| renderSessions | method | 3777 |
| region | method | 3778 |
| manualCompactionSession | const | 3782 |
| updateManualCompactionHint | function | 3783 |
| updateManualCompactionHint | method | 3793 |
| renderCompactionRun | method | 3817 |
| stopSession | function | 3859 |
| refreshing | const | 3868 |
| refreshSessions | function | 3871 |
| timerText | function | 3890 |
| renderTaskTimer | function | 3897 |
| applyElapsed | function | 3910 |
| renderTaskTimer | method | 3916 |
| updatePageTitle | function | 3918 |
| insertSessionRow | function | 3924 |
| updateSessions | function | 3939 |
| renderTaskTimer | method | 3945 |
| updatePageTitle | method | 3957 |
| renderSessions | method | 3958 |
| recoverMissingSession | function | 3960 |
| region | method | 3962 |
| saveView | method | 3969 |
| updateAvailability | method | 3973 |
| switchSession | function | 3989 |
| saveView | method | 3991 |
| updateAvailability | method | 3994 |
| copySessionFile | function | 4014 |
| positionSessionMenu | function | 4027 |
| normalizeCwd | function | 4033 |
| sessionDayLabel | function | 4037 |
| renderSessions | function | 4050 |
| sessionAction | const | 4386 |
| openSessionAction | function | 4388 |
| contextIcon | function | 4429 |
| renderContextChips | function | 4432 |
| fuzzyHit | function | 4451 |
| renderContextResults | function | 4458 |
| showContextSkills | function | 4478 |
| positionContextSkills | function | 4483 |
| showContextSkills | method | 4495 |
| region | method | 4530 |
| skillTrigger | const | 4532 |
| showContextSkills | method | 4548 |
| resizePrompt | method | 4557 |
| region | method | 4558 |
| SLASH_COMMANDS | const | 4563 |
| closeCompletion | function | 4566 |
| highlightCompletion | function | 4574 |
| chooseCompletion | function | 4583 |
| closeCompletion | method | 4595 |
| updateCompletion | function | 4598 |
| closeCompletion | method | 4599 |
| expandComposer | method | 4655 |
| resizePrompt | method | 4661 |
| region | method | 4662 |
| switchSession | method | 4702 |
| creationLoad | const | 4713 |
| defaultsScope | const | 4715 |
| renderDefaultsScope | function | 4716 |
| refreshDefaultsScope | function | 4750 |
| createAgentPicker | function | 4752 |
| options | method | 4778 |
| fill | method | 4785 |
| fillThinking | method | 4793 |
| options | method | 4795 |
| defaultsSelection | const | 4848 |
| defaultsSaving | const | 4861 |
| loadCreation | function | 4863 |
| disposePickers | method | 4870 |
| disposePickers | method | 4871 |
| disposePickers | method | 4876 |
| disposePickers | function | 4908 |
| openDefaults | function | 4911 |
| disposePickers | method | 4916 |
| openSessionConfiguration | function | 4925 |
| openScopedConfiguration | function | 4930 |
| renderDefaultsScope | method | 4935 |
| showSettingsPanel | method | 4936 |
| updateAvailability | method | 4947 |
| updateDefaultsPreview | function | 4960 |
| updateDefaultsPreview | method | 4984 |
| saveCreation | function | 4994 |
| updateAvailability | method | 5019 |

### public/clipboard.js（27 行） — 统一剪贴板入口：Clipboard API 优先，非安全上下文回退 execCommand

| 符号 | 类型 | 行 |
|---|---|---|
| copyText | function | 5 |

### public/compaction-view.js（79 行） — 压缩尝试详情、完整输出及安全Markdown与原文切换

| 符号 | 类型 | 行 |
|---|---|---|
| createCompactionView | function | 4 |

### public/composer-controls.js（138 行） — 紧凑输入区：三级搜索模型菜单、固定运行操作与焦点管理

| 符号 | 类型 | 行 |
|---|---|---|
| mountComposerControls | function | 4 |
| refresh | method | 135 |

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

### public/icons.js（136 行） — 全页面动作 SVG 图标：固定几何路径字典、静态控件与模板水合

| 符号 | 类型 | 行 |
|---|---|---|
| artwork | const | 5 |
| tones | const | 26 |
| composerIcon | function | 28 |
| composerIconNode | function | 34 |
| actionIconPaths | const | 44 |
| initActionIcons | function | 91 |
| actionIconNode | function | 123 |
| actionIcon | function | 132 |

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

### public/markdown.js（484 行） — marked + DOMPurify 渲染（XSS 边界）

| 符号 | 类型 | 行 |
|---|---|---|
| cache | const | 5 |
| PAGE_CACHE_ENTRY_LIMIT | const | 15 |
| PAGE_CACHE_BYTE_LIMIT | const | 16 |
| createMarkdownPageCache | function | 17 |
| policy | const | 49 |
| textLanguages | const | 55 |
| isText | const | 56 |
| wideCharacter | const | 57 |
| graphemes | function | 58 |
| numericCell | const | 59 |
| placeholderCell | const | 60 |
| ruleLine | const | 61 |
| borderedRows | function | 64 |
| alignedRows | function | 83 |
| gitLogTable | function | 126 |
| textTable | function | 164 |
| looksLikeDiagram | function | 200 |
| layoutDiagram | function | 207 |
| isJson | function | 236 |
| fixCjkBold | function | 243 |
| jsonControls | function | 257 |
| linksSignature | function | 299 |
| renderMarkdown | function | 309 |
| PLAIN_CHARS | const | 469 |

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

### src/compaction-excerpt.js（49 行） — 内联原文逐字匹配、消息ID替换与Unicode关键词窗口

| 符号 | 类型 | 行 |
|---|---|---|
| messageText | function | 4 |
| idsIn | const | 9 |
| resolveSummaryExcerpts | function | 10 |
| messageWindow | function | 35 |

### src/compaction-input.js（20 行） — 摘要预算视图，UTF-8首尾范围与省略标记，不用于原文归档

| 符号 | 类型 | 行 |
|---|---|---|
| selectSummaryInput | function | 4 |

### src/compaction-output.js（38 行） — 摘要 JSON 边界解析与引用处理前的结构预校验

| 符号 | 类型 | 行 |
|---|---|---|
| parseTaskStateOutput | function | 6 |

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

### src/compaction.js（957 行） — 后台独立摘要、token/占比阈值、快照校验与 turn 安全提交

| 符号 | 类型 | 行 |
|---|---|---|
| contextTokens | function | 35 |
| prepareBackgroundCompaction | function | 42 |
| DEFAULT_COMPACTION_CONFIG | const | 118 |
| normalizeCompaction | function | 120 |
| overCompactionThreshold | function | 124 |
| entryIdFor | function | 130 |
| summarizedEntryIds | function | 143 |
| COMPACT_MAX | const | 164 |
| FACTS_MAX | const | 165 |
| parseSummaryOutput | function | 166 |
| throwIfAborted | function | 213 |
| factMatch | function | 222 |
| lineOf | const | 233 |
| validateFacts | function | 235 |
| writeConversationSnapshot | function | 264 |
| appendVerifiedFacts | function | 280 |
| summarizeWithPiSession | function | 300 |
| throwIfAborted | method | 302 |
| progress | method | 303 |
| RUN_HISTORY | const | 433 |
| RUN_PREVIEW_CHARS | const | 434 |
| RUN_STEPS | const | 435 |
| RUN_STREAM_INTERVAL | const | 437 |
| CANCEL_COOLDOWN | const | 439 |
| describeCompactionError | function | 441 |
| createBackgroundCompaction | function | 453 |

### src/data-owner.js（26 行） — 写库前数据根独占：内核管道或socket持有，禁止同根双写

| 符号 | 类型 | 行 |
|---|---|---|
| claimDataRoot | function | 6 |
| claimArchiveOwner | function | 7 |
| claimJournalOwner | function | 8 |
| claimOwner | function | 9 |

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

### src/history-journal.js（121 行） — 磁盘 journal 原文投影、持久屏障与提交确认

| 符号 | 类型 | 行 |
|---|---|---|
| readDurableJournal | function | 7 |
| installDurableJournal | function | 28 |
| confirmDurableAppend | function | 59 |
| createJournalArchive | function | 69 |
| mkdirSync | method | 70 |

### src/history-tools.js（127 行） — 鉴权历史检索、原文分页及游标签名

| 符号 | 类型 | 行 |
|---|---|---|
| createHistoryReader | function | 7 |

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

### src/native-summary.js（79 行） — 原生摘要请求、split-turn附加证据提示与只读流观察

| 符号 | 类型 | 行 |
|---|---|---|
| TASK_STATE_SYSTEM | const | 7 |
| EXCERPT_INSTRUCTIONS | const | 10 |
| observeSummaryStream | function | 13 |
| summarizeNative | function | 47 |

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

### src/pi.js（720 行） — createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档）

| 符号 | 类型 | 行 |
|---|---|---|
| forkSafePoint | function | 27 |
| agentRuntime | function | 47 |
| queueStateOf | function | 64 |
| hasModelOutput | function | 93 |
| withdrawQueue | function | 104 |
| recallLastMessage | function | 122 |
| CHECKPOINT_BOUNDARY | const | 150 |
| memoryExtension | function | 161 |
| createPiFactory | function | 185 |

### src/prompts.js（70 行） — Axiom 自有提示词按 main/subagent/compaction 角色集中维护

| 符号 | 类型 | 行 |
|---|---|---|
| MAIN_AGENT_PROMPT | const | 4 |
| TITLE_INSTRUCTION | const | 39 |
| SUBAGENT_PROMPT | const | 42 |
| WRAP_UP_PROMPT | const | 43 |
| budgetSystemPrompt | const | 44 |
| taskStateRequest | function | 47 |
| SUMMARY_SYSTEM_PROMPT | const | 52 |
| summaryRequest | function | 55 |

### src/protocol.js（383 行） — zod 协议：selection / command 判别联合（消息类型见 L3）

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
| compaction | const | 50 |
| resolveCompaction | function | 63 |
| retryPatterns | const | 73 |
| selection | const | 79 |
| taskBudget | const | 92 |
| providerKey | const | 100 |
| modelKey | const | 103 |
| secretValueIn | const | 110 |
| secretHeadersIn | const | 115 |
| thinkingLevelMapIn | const | 116 |
| costIn | const | 124 |
| providerConfigIn | const | 143 |
| modelConfigIn | const | 161 |
| modelOverrideIn | const | 178 |
| fingerprintIn | const | 179 |
| command | const | 180 |

### src/questions.js（86 行） — 主代理 question 工具、参数校验与可取消的回答等待

| 符号 | 类型 | 行 |
|---|---|---|
| text | const | 3 |
| option | const | 4 |
| input | const | 5 |
| questionAnswers | const | 12 |
| string | const | 13 |
| createQuestions | function | 16 |

### src/raw-history.js（119 行） — 完整原文耐久归档、身份幂等与恢复校验

| 符号 | 类型 | 行 |
|---|---|---|
| historyError | function | 6 |
| canonical | function | 7 |
| contentHash | const | 12 |
| isOriginal | const | 13 |
| keyOf | const | 14 |
| writeAll | function | 15 |
| fsyncSync | method | 18 |
| createRawArchive | function | 22 |
| mkdirSync | method | 24 |
| mkdirSync | method | 31 |

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

### src/safe-points.js（37 行） — 完整会话前缀安全点、恢复状态与工具批次边界校验

| 符号 | 类型 | 行 |
|---|---|---|
| safePoints | function | 2 |
| navigationState | function | 27 |
| requireSafePoint | function | 32 |

### src/server.js（579 行） — createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发

| 符号 | 类型 | 行 |
|---|---|---|
| dev | const | 12 |
| digest | const | 13 |
| load | const | 14 |
| freshen | const | 19 |
| assets | const | 29 |
| createServerApp | function | 79 |

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

### src/session-store.js（489 行） — 会话三表、实体增量更新、逐会话事务与旧数据迁移

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
| insertSession | method | 317 |
| importLegacySession | method | 343 |
| migrateLegacy | method | 360 |
| updateSession | method | 382 |
| deleteSession | method | 406 |
| saveEvent | method | 412 |
| deleteEvents | method | 438 |
| saveTask | method | 456 |
| listTasks | method | 483 |

### src/sessions.js（2319 行） — Sessions：会话生命周期、增量保存、元数据启动与SDK按需恢复

| 符号 | 类型 | 行 |
|---|---|---|
| GOAL_TOOL_NAMES | const | 28 |
| hasRunningTasks | const | 30 |
| referencedToolKeys | const | 33 |
| relevantTools | function | 46 |
| ownedTools | function | 55 |
| delegateTaskIds | const | 66 |
| projectTimeline | function | 79 |
| entryIdSet | const | 102 |
| compactedAnswer | const | 106 |
| compactedRecord | function | 115 |
| foldCompacted | function | 139 |
| historyRetries | function | 173 |
| translateRetries | function | 191 |
| BROWSE_PAGE | const | 212 |
| SEARCH_LIMIT | const | 214 |
| SEARCH_DIR_LIMIT | const | 215 |
| IGNORED_ENTRIES | const | 217 |
| fuzzyHit | function | 220 |
| matchRank | function | 231 |
| searchEntries | function | 240 |
| pointStatus | function | 268 |
| trackElapsed | function | 275 |
| fallbackTitle | function | 286 |
| resolveDir | function | 291 |
| parentOf | function | 302 |
| absoluteCrumbs | function | 311 |
| importedTitle | function | 333 |
| duplicateTitle | function | 357 |
| hostLocations | function | 369 |
| landedSessionFile | function | 388 |
| RETRYABLE_SQLITE | const | 395 |
| retryableWrite | const | 396 |
| DEFAULTS_NS | const | 401 |
| WORKSPACE_PREFIX | const | 402 |
| workspaceKeyOf | const | 403 |
| CAPABILITY_KINDS | const | 404 |
| catalogProjectsOf | const | 406 |
| validateProjectSkills | function | 409 |
| validateProjectSkillEntry | function | 413 |
| mergeLegacyProjectSkills | function | 421 |
| Sessions | class | 430 |
| constructor | method | 431 |
| applyDefaults | method | 455 |
| loadDefaults | method | 461 |
| migrateDefaults | method | 473 |
| migrateLegacyStore | method | 488 |
| loadWorkspaceDefaults | method | 512 |
| loadTaskBudget | method | 531 |
| getTaskBudget | method | 546 |
| configureTaskBudget | method | 552 |
| getDefaults | method | 559 |
| defaultsFor | method | 563 |
| listDefaults | method | 567 |
| deleteDefaults | method | 573 |
| removeDefaults | method | 578 |
| workspaceDefaults | method | 587 |
| configureDefaults | method | 607 |
| saveDefaults | method | 613 |
| pushCompaction | method | 650 |
| validateSelection | method | 661 |
| validateCompaction | method | 692 |
| load | method | 706 |
| ensureLoaded | method | 731 |
| migrateLegacySessions | method | 757 |
| sessionData | method | 781 |
| persist | method | 800 |
| writeChange | method | 834 |
| saveChange | method | 850 |
| list | method | 855 |
| rename | method | 872 |
| importSession | method | 886 |
| safePoints | method | 916 |
| navigationItem | method | 922 |
| revert | method | 932 |
| fork | method | 958 |
| continueFromPoint | method | 976 |
| duplicate | method | 983 |
| create | method | 1042 |
| goalAction | method | 1450 |
| scheduleGoal | method | 1501 |
| advanceGoal | method | 1513 |
| goalNotificationsBlocked | method | 1551 |
| scheduleTaskNotifications | method | 1558 |
| deliverTaskNotifications | method | 1571 |
| confirmTaskNotification | method | 1612 |
| settleTaskNotifications | method | 1625 |
| get | method | 1644 |
| revealWorkspace | method | 1649 |
| browse | method | 1663 |
| listFiles | method | 1669 |
| refreshSkills | method | 1731 |
| configData | method | 1740 |
| snapshot | method | 1751 |
| compactionAttempt | method | 1848 |
| compactionMessages | method | 1860 |
| subscribe | method | 1909 |
| canReconfigure | method | 1917 |
| configure | method | 1923 |
| startRun | method | 1974 |
| retry | method | 2022 |
| prompt | method | 2031 |
| withdraw | method | 2066 |
| replyQuestion | method | 2120 |
| safeStop | method | 2129 |
| startCompaction | method | 2146 |
| cancelCompaction | method | 2163 |
| cancel | method | 2171 |
| cancelTask | method | 2197 |
| retryTask | method | 2206 |
| deleteRecords | method | 2217 |
| releaseIdle | method | 2228 |
| remove | method | 2251 |
| close | method | 2309 |

### src/shared-gate.js（86 行） — 用户级共享闸门端点与远程服务适配

| 符号 | 类型 | 行 |
|---|---|---|
| gateLayout | function | 8 |
| remoteService | function | 25 |
| shareGate | function | 62 |
| claimShared | function | 71 |

### src/task-budget.js（36 行） — 主子代理轮次预算规则、收尾提示词与配置页参数校验

| 符号 | 类型 | 行 |
|---|---|---|
| TASK_BUDGET_LIMITS | const | 9 |
| taskBudgetDefaults | const | 12 |
| within | const | 14 |
| taskBudgetPolicy | function | 21 |

### src/task-execution.js（23 行） — 子任务活动阶段、独立时间预算、停止事实与总结提示

| 符号 | 类型 | 行 |
|---|---|---|
| EXECUTION_DEFAULTS | const | 1 |
| ACTIVE_TASK_STATES | const | 2 |
| stopReport | function | 4 |
| stopSummaryPrompt | function | 9 |
| bounded | function | 14 |

### src/task-state-doc.js（20 行） — 压缩切点任务状态投影：从同版本日志派生独立上下文，不新增权威记录

| 符号 | 类型 | 行 |
|---|---|---|
| taskStateMessage | function | 2 |
| withTaskState | function | 11 |

### src/tasks.js（266 行） — Tasks：子任务（委托）生命周期

| 符号 | 类型 | 行 |
|---|---|---|
| historyResult | const | 5 |
| Tasks | class | 10 |
| constructor | method | 11 |
| start | method | 18 |
| launch | method | 28 |
| view | method | 46 |
| snapshotJob | method | 51 |
| publish | method | 57 |
| retryable | method | 61 |
| snapshot | method | 65 |
| run | method | 67 |
| pendingNotifications | method | 188 |
| resumeQueued | method | 194 |
| finalize | method | 203 |
| read | method | 208 |
| retry | method | 214 |
| append | method | 223 |
| cancelTask | method | 240 |
| cancel | method | 255 |
| interrupt | method | 260 |

### src/tool-execution.js（53 行） — 命令默认超时策略、角色限制与工具耗时观察

| 符号 | 类型 | 行 |
|---|---|---|
| TOOL_TIMEOUT_PROMPT | const | 2 |
| createToolExecutionPolicy | function | 4 |

### src/tools.js（158 行） — delegationTools：委托/凭证读取/追加工具定义（zod 入参）

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

### src/usage-store.js（295 行） — 请求明细持久化与账单聚合

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
| begin | method | 123 |
| admit | method | 134 |
| attempt | method | 142 |
| finish | method | 154 |
| importHistorical | method | 175 |
| recordGateEvent | method | 192 |
| billingBySession | method | 201 |
| billingGlobal | method | 220 |
| listRequests | method | 239 |
| openRequests | method | 273 |
| recentGateEvents | method | 284 |

### src/usage-stream.js（75 行） — 模型请求流审计与限流包装

| 符号 | 类型 | 行 |
|---|---|---|
| wrapUsageStream | function | 4 |

### tests/accept-native-two-rounds.mjs（71 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| dir | const | 14 |
| session | const | 15 |

### tests/activity-groups-ui.py（205 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| activityHistory | const | 16 |
| sessions | const | 27 |

### tests/answer-tags.test.js（56 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| open | const | 5 |

### tests/app.test.js（2094 行） — node --test 测试（npm test）

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

### tests/compaction-excerpt.test.js（28 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| evidence | const | 4 |

### tests/compaction-lazy.test.js（162 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 11 |
| withSession | const | 21 |
| sayMain | const | 33 |

### tests/compaction-output.test.js（40 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| state | const | 5 |

### tests/compaction-state.test.js（35 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| empty | const | 5 |

### tests/compaction-ui.test.js（398 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 11 |
| restore | method | 43 |

### tests/compaction.test.js（1684 行） — node --test 测试（npm test）

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
| fakeSummarize | function | 363 |
| startHangingLlmServer | function | 371 |
| startFakeLlmServer | function | 394 |
| zodError | method | 521 |
| zodError | method | 522 |
| zodError | method | 523 |
| zodError | method | 524 |
| zodError | method | 525 |
| zodError | method | 526 |
| hangingSummarize | function | 996 |
| createLoopSession | function | 1093 |
| writeFileSync | method | 1094 |
| createPersistentTestSession | function | 1282 |
| factsTags | const | 1298 |
| withFacts | const | 1299 |
| withoutFacts | const | 1301 |

### tests/composer-controls.test.js（87 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| iconSource | const | 5 |
| source | function | 6 |
| fixture | function | 7 |

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

### tests/conversation-preview.mjs（227 行） — node --test 测试（npm test）

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
| app | const | 224 |
| port | const | 225 |

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

### tests/history-page-cache.test.js（71 行） — node --test 测试（npm test）

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

### tests/icons.test.js（63 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| initActionIcons | method | 47 |
| initActionIcons | method | 59 |

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

### tests/native-summary.test.js（72 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| model | const | 5 |
| final | const | 35 |

### tests/new-session-feedback.test.js（133 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| appSource | const | 14 |
| inline | const | 15 |
| pickerSource | const | 17 |
| modelPickerSource | const | 18 |
| modelSources | const | 19 |
| html | const | 20 |
| state | const | 22 |
| bootPage | function | 29 |

### tests/observation-pack-flow.test.js（150 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| PREAMBLE | const | 10 |
| FOOTER | const | 68 |
| run | const | 73 |

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

### tests/prompt-resize.test.js（179 行） — node --test 测试（npm test）

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

### tests/safe-stop.test.js（253 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| finish | method | 201 |
| finish | method | 212 |

### tests/send-optimistic.test.js（201 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| test | method | 45 |
| userEnd | const | 66 |

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

### tests/session-store.test.js（663 行） — node --test 测试（npm test）

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
| withStore | method | 204 |
| withStore | method | 230 |
| withStore | method | 248 |
| withStore | method | 277 |
| withStore | method | 339 |
| withStore | method | 364 |
| withStore | method | 378 |
| withStore | method | 403 |
| withStore | method | 416 |
| LEGACY_DDL | const | 447 |
| withStore | method | 539 |
| withStore | method | 614 |

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

### tests/task-budget.test.js（129 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 11 |

### tests/task-cancel-notifications.test.js（65 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| until | const | 8 |

### tests/task-execution-ui.test.js（56 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| pageFor | function | 5 |
| taskState | const | 11 |
| taskState | method | 15 |
| taskState | method | 39 |

### tests/task-execution.test.js（106 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| delay | const | 4 |
| until | function | 5 |
| setup | function | 6 |
| finishSummary | method | 40 |
| create | method | 56 |

### tests/task-notifications.test.js（274 行） — node --test 测试（npm test）

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

### tests/task-state-generation.test.js（30 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| model | const | 4 |
| preparation | const | 5 |
| done | const | 6 |

### tests/task-timer.test.js（59 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| emit | const | 9 |
| factory | const | 10 |
| subscribe | method | 12 |
| state | const | 23 |
| settle | const | 24 |

### tests/tasks.test.js（276 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| fixtures | const | 7 |
| fixture | function | 10 |
| assert | method | 80 |
| release | method | 208 |

### tests/tool-detail-reclaim.test.js（160 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 12 |
| restore | method | 46 |
| toggle | const | 50 |
| entry | const | 51 |

### tests/tool-execution.test.js（53 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| fixture | function | 5 |

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

### tests/transcript-empty-state.test.js（51 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| append | const | 10 |
| append | method | 22 |

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

### tests/usage-stream.test.js（63 行） — node --test 测试（npm test）

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

- 协议 command.type：image、inherit、session.points、session.revert、session.fork、session.continue、goal.action、service.status、service.update.check、service.restart、remote.get、remote.login、remote.configure、session.rename、workspace.reveal、workspace.browse、files.browse、models.list、models.config.get、models.provider.save、models.provider.delete、models.provider.rename、models.model.save、models.model.delete、models.provider.discover、models.favorites.get、models.model.override、models.auth.list、models.auth.start、models.auth.status、models.auth.respond、models.auth.cancel、models.auth.logout、models.hidden.set、models.favorites.set、capabilities.list、session.defaults.get、session.defaults.configure、session.defaults.list、session.defaults.delete、usage.backfill、usage.get、usage.configure、task.budget.get、task.budget.configure、session.configure、inherit、sessions.list、session.create、session.import、session.duplicate、session.attach、session.compaction.messages、session.compaction.cancel、session.compaction.attempt、session.compaction.start、session.skills.refresh、session.close、prompt、cancel、question.reply、session.retry、task.retry、task.cancel、queue.withdraw、tasks.read（src/protocol.js）
- HTML id：sidebar、new、open-workspace、import-session、search、sessions、open-settings、sidebar-backdrop、toggle-sidebar、session-alert、session-title、workspace-label、copy-workspace、reveal-workspace、workspace-feedback、conversation-font-scale、github-link、status、service-dev、service-version、open-raw-io、toggle-theme、login、maintenance-state、connect、workspace、goal-track、earliest、transcript、output、raw-io、raw-io-title、close-raw-io、raw-io-empty、raw-io-list、goal-dock、question-dock、latest、message-queue、task-runs、compaction-progress、safe-stop-progress、add-context、add-image、compact-session、goal-enter、image-files、context-chips、task-timer、task-timer-value、context-menu、context-picker、context-back、context-title、context-close、context-search、context-results、context-error、image-attachments、composer、prompt、prompt-completion、composer-skill、agent-role、provider、model、thinking、stop、force-stop、send-steer、send-followup、send、session-runtime、session-inspector-trigger、session-billing-trigger、session-bill-total、mobile-runtime、mobile-expand、composer-help、composer-action-help、error、session-action、session-action-form、session-action-title、session-action-description、session-name-label、session-name、session-action-error、session-action-cancel、session-action-submit、image-preview、image-preview-close、image-preview-image、restart-dialog、restart-form、restart-title、restart-description、restart-warning、restart-cancel、restart-submit、force-stop-dialog、force-stop-form、force-stop-title、force-stop-description、force-stop-warning、force-stop-cancel、force-stop-submit、session-detail、session-detail-title、session-detail-close、session-inspector、inspector-prompt-tab、inspector-tools-tab、inspector-prompt-panel、session-system-prompt、inspector-tools-panel、session-active-tools、session-billing、session-bill-body、manual-compaction、manual-compaction-form、manual-compaction-title、manual-compaction-mode、manual-compaction-hint、manual-compaction-error、manual-compaction-cancel、manual-compaction-confirm、task-overlays、compaction-run、compaction-run-title、compaction-run-meta、compaction-run-pick-label、compaction-run-pick、compaction-run-cancel、compaction-run-error、compaction-run-trigger、compaction-run-steps、compaction-run-stream-wrap、compaction-run-stream、task-template、goal-plan、goal-plan-title、goal-plan-meta、goal-plan-constraints-title、goal-plan-constraints、goal-plan-acceptance-title、goal-plan-acceptance、goal-plan-rounds-section、goal-plan-rounds-title、goal-plan-rounds、goal-plan-close、goal-plan-confirm、settings、settings-title、settings-connection-tab、settings-defaults-tab、settings-remote-tab、settings-models-tab、settings-usage-tab、settings-service-tab、usage-panel、connection-panel、connection-current-title、connection-current、connection-form、connection-address、connection-help、connection-feedback、connection-connect、defaults-panel、selection-copy-title、selection-copy、selection-copy-help、selection-copy-feedback、queue-type、steer-help、followup-help、defaults-preview、task-budget-title、task-max-turns、task-wrap-up-window、task-work-seconds、task-wrap-up-seconds、task-summary-seconds、task-budget-help、subagent-title、subagent-help、subagent-provider、subagent-model、settings-feedback、defaults-title、defaults-scope-label、defaults-delete、defaults-workspace-help、defaults-editor、create-form、create-defaults-help、config-hot-title、config-timing-help、create-agents、create-compaction、config-subagent-title、config-subagent-help、create-subagent-settings、config-new-session-title、config-assembly-help、create-capabilities、create-retry、assembly-actions、assembly-feedback、apply-assembly、create-feedback、remote-panel、remote-status-title、remote-status、remote-login、remote-auth、remote-url、remote-form、remote-note、remote-enabled、remote-email、remote-email-help、remote-feedback、remote-refresh、remote-save、models-panel、service-panel、service-state-title、service-feedback、service-restart-title、restart-quick、restart-rebuild、service-recover、service-update-section、service-update-title、update-check、update-result、update-install、service-history-title、service-history（public/index.html）
- HTTP 静态路由：/、/favicon.svg、/style.css、/theme.js、/app.js、/composer-controls.js、/composer-controls.css、/icons.js、/session-cache.js、/session-details.js、/compaction-view.js、/transport.js、/goal.js、/goal.css、/question.js、/question.css、/service-settings.js、/usage-audit.js、/file-picker.js、/tooltip.js、/tooltip.css、/file-picker.css、/markdown.js、/stream-renderer.js、/stream-playback.js、/markdown-scan.js、/memory-tags.js、/clipboard.js、/answer-tags.js、/goal-markers.js、/vendor/marked.js、/vendor/purify.js、/model-manager.js、/model-auth.js、/model-manager.css、/model-picker.js、/model-picker.css、/health（src/server.js）

## ⚠ 未登记文件（0）

（无）
