<!-- 自动生成，勿手改。重建：node .pi/skills/codebase-map/scripts/reindex.mjs -->
# Axiom 多级代码索引（生成于 2026/9/12 02:44:52）

## L1 模块总览（文件 → 职责）

| 文件 | 行数 | 职责 | 关键符号 |
|---|---|---|---|
| public/app.js | 3029 | 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度 | filePicker, $, ws, sessionMissing |
| public/file-picker.css | 269 | 文件选择弹窗主题与响应式布局 | - |
| public/file-picker.js | 351 | 共享文件/目录选择弹窗、懒加载与分类 SVG 图标 | NS, SEARCH_DEBOUNCE, el, FOLDER_COLORS |
| public/index.html | 287 | 页面骨架与元素 id（见 L3） | - |
| public/markdown.js | 230 | marked + DOMPurify 渲染（XSS 边界） | cache, policy, textLanguages, isText |
| public/model-manager.css | 279 | 模型配置页：供应商列表、编辑表单与响应式布局 | - |
| public/model-manager.js | 628 | Pi 模型管理：供应商模板、模型编辑与安全保存反馈 | API_TYPES, PROVIDER_TEMPLATES, PROVIDER_ID, MASK_KINDS |
| public/model-picker.css | 88 | 共享收藏下拉：暗色浮层、星标、触屏与焦点样式 | - |
| public/model-picker.js | 283 | 共享模型选择器：供应商/模型/思考收藏、排序与键盘交互 | GAP, EDGE, TYPEAHEAD_MS, el |
| public/stream-renderer.js | 46 | 流式增量渲染状态机 | createStreamRenderer |
| public/style.css | 1239 | 全局样式（CSP 禁 inline style，样式一律进这里） | - |
| public/text-contrast.css | 46 | 文字专用对比度档位与调节面板 | - |
| public/text-contrast.js | 113 | 文字对比度按钮、实时调节与本地偏好 | KEY, MIN, MAX, STEP |
| public/tooltip.css | 50 | 共享暗色悬停说明样式 | - |
| public/tooltip.js | 225 | 共享悬停说明：动态 title、键盘、定位与无障碍 | SHOW_DELAY, HIDE_DELAY, GAP, EDGE |
| scripts/autostart.mjs | 133 | Windows/macOS/Linux 当前用户登录自动启动安装/卸载 | run, projectDir, serviceEntry, label |
| scripts/dev.mjs | 12 | 开发入口：DEV 标识、4320 端口与独立数据目录 | - |
| scripts/install.mjs | 101 | 一键安装：装依赖/注册自启/启动守护/健康检查/打开浏览器 | root, parseArgs, nodeOk, openCommand |
| scripts/service.mjs | 234 | 服务守护：IPC 重启、HTTP 安全停止与崩溃退避停止通道 | root, output, run, npmRun |
| scripts/uninstall.mjs | 18 | 统一卸载：核对 npm 目标、安全停止、取消自启、保留用户数据 | uninstall |
| src/capabilities.js | 135 | 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities） | sdkEntry, resolver, alias, jiti |
| src/compaction.js | 374 | 后台独立摘要、token/占比阈值、快照校验与 turn 安全提交 | contextTokens, prepareBackgroundCompaction, DEFAULT_COMPACTION_CONFIG, normalizeCompaction |
| src/inline-images.js | 32 | 模型上下文图片定位：将占位符与真实附件交错排列，不改存储与队列 | inlineImages, inlineImagesExtension |
| src/main.js | 86 | 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理 | port, cwd, factory, home |
| src/model-config.js | 369 | Pi models.json 无损配置读写与共享收藏持久化 | sdkModelConfig, EMPTY_FINGERPRINT, digest, LEVELS |
| src/pi.js | 307 | createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档） | agentRuntime, queueStateOf, hasModelOutput, withdrawQueue |
| src/protocol.js | 312 | zod 协议：selection / command 判别联合（消息类型见 L3） | id, capabilities, workspace, thinking |
| src/remote.js | 501 | Tailscale 登录身份、远程监听、同账号授权与本机配置持久化 | configSchema, execOptions, cliEnv, defaultRun |
| src/retry.js | 161 | 模型失败重试：可取消退避、最多45次、16分钟封顶、自定义错误词表、保留已有工具结果继续 | RETRY_DELAYS_MS, MAX_DELAY_MS, MAX_RETRIES, delayFor |
| src/server.js | 438 | createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发 | assets, createServerApp |
| src/sessions.js | 876 | Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化 | BROWSE_PAGE, resolveDir, parentOf, absoluteCrumbs |
| src/tasks.js | 107 | Tasks：子任务（委托）生命周期 | Tasks |
| src/tools.js | 97 | delegationTools：委托/凭证读取/追加工具定义（zod 入参） | delegateInput, readInput, appendInput, result |
| src/update.js | 41 | 检查更新：本地安装（提交 SHA/版本）比对 GitHub 公开仓库 master，npm 安装实例可自动重装 | repo, npmSpec, commitFile, validateCommit |
| tests/activity-groups-ui.py | 201 | node --test 测试（npm test） | activityHistory, sessions |
| tests/app.test.js | 1562 | node --test 测试（npm test） | pickerSource, contrastSource, modelSources |
| tests/autostart.test.js | 60 | node --test 测试（npm test） | node, cwd, service |
| tests/benchmark.js | 92 | node --test 测试（npm test） | window |
| tests/capabilities.test.js | 207 | node --test 测试（npm test） | - |
| tests/codebase-index.test.js | 20 | node --test 测试（npm test） | ROOT, SKILL |
| tests/compaction-config.test.js | 105 | node --test 测试（npm test） | - |
| tests/compaction-ui.py | 57 | node --test 测试（npm test） | - |
| tests/compaction-ui.test.js | 98 | node --test 测试（npm test） | page |
| tests/compaction.test.js | 781 | node --test 测试（npm test） | fakeModel, createTestSession, seq, userMsg |
| tests/config.test.js | 224 | node --test 测试（npm test） | - |
| tests/context-menu-ui.py | 66 | node --test 测试（npm test） | - |
| tests/conversation-preview.mjs | 123 | node --test 测试（npm test） | markdown, message, thinking, state |
| tests/conversation-ui.py | 262 | node --test 测试（npm test） | - |
| tests/defaults.test.js | 33 | node --test 测试（npm test） | - |
| tests/file-picker.test.js | 67 | node --test 测试（npm test） | source, tick |
| tests/image-input.test.js | 167 | node --test 测试（npm test） | pngBase64, jpegBase64, image, parsePrompt |
| tests/inline-images.test.js | 42 | node --test 测试（npm test） | text, a, b, user |
| tests/install.test.js | 52 | node --test 测试（npm test） | - |
| tests/markdown.test.js | 159 | node --test 测试（npm test） | - |
| tests/message-activity.test.js | 263 | node --test 测试（npm test） | page, assistant, thought, call |
| tests/model-config.test.js | 463 | node --test 测试（npm test） | sha, EMPTY, tempDir, makeService |
| tests/model-manager.test.js | 430 | node --test 测试（npm test） | source, tick, j, masked |
| tests/model-onboarding-ui.test.js | 153 | node --test 测试（npm test） | stripImports, modelSources, contrastSource, pickerSource |
| tests/model-onboarding.test.js | 55 | node --test 测试（npm test） | - |
| tests/model-picker.test.js | 230 | node --test 测试（npm test） | source, tick, nap, OPTS |
| tests/model-selection-preview.mjs | 42 | node --test 测试（npm test） | home, catalog, factory, sessions |
| tests/model-selection-ui.py | 60 | node --test 测试（npm test） | - |
| tests/presets.test.js | 102 | node --test 测试（npm test） | makeFactory |
| tests/project-skills.test.js | 57 | node --test 测试（npm test） | - |
| tests/recall.test.js | 94 | node --test 测试（npm test） | user, assistant, thinking, fixture |
| tests/remote-ui.py | 51 | node --test 测试（npm test） | - |
| tests/remote-ui.test.js | 224 | node --test 测试（npm test） | page, modelSources, flush, stubRequest |
| tests/remote.test.js | 598 | node --test 测试（npm test） | EMAIL, mockTailscale, fakeChild, setup |
| tests/retry.test.js | 369 | node --test 测试（npm test） | RATE_LIMIT, QUOTA, ABORTED, fakeSession |
| tests/server.test.js | 125 | node --test 测试（npm test） | - |
| tests/service-api.test.js | 63 | node --test 测试（npm test） | - |
| tests/service.test.js | 236 | node --test 测试（npm test） | - |
| tests/session-created-at.test.js | 44 | node --test 测试（npm test） | factory |
| tests/session-flow.test.js | 222 | node --test 测试（npm test） | flowFactory |
| tests/session-sidebar-ui.py | 61 | node --test 测试（npm test） | - |
| tests/smoke.js | 67 | node --test 测试（npm test） | TIMEOUT, sessions |
| tests/stream-renderer.test.js | 99 | node --test 测试（npm test） | - |
| tests/task-notifications.test.js | 129 | node --test 测试（npm test） | factoryFixture, tick, until |
| tests/tasks.test.js | 76 | node --test 测试（npm test） | fixture |
| tests/text-contrast.test.js | 162 | node --test 测试（npm test） | source, css, fakeStorage, throwingStorage |
| tests/text-diagram-ui.py | 36 | node --test 测试（npm test） | - |
| tests/tooltip.test.js | 282 | node --test 测试（npm test） | source, boot, fire, tip |
| tests/uninstall.test.js | 45 | node --test 测试（npm test） | - |
| tests/update.test.js | 38 | node --test 测试（npm test） | old |
| tests/workspace-isolation.test.js | 80 | node --test 测试（npm test） | - |
| tests/workspace-picker.test.js | 96 | node --test 测试（npm test） | - |
| tests/workspace-tabs.test.js | 235 | node --test 测试（npm test） | appSource, pickerSource, contrastSource, modelSources |

## L2 符号 → 行号（跳转：read <文件> offset=<行>）

### public/app.js（3029 行） — 前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度

| 符号 | 类型 | 行 |
|---|---|---|
| filePicker | const | 10 |
| $ | const | 11 |
| ws | const | 12 |
| sessionMissing | const | 24 |
| onboarding | const | 25 |
| allSessions | const | 26 |
| views | const | 28 |
| compactionDefaults | const | 29 |
| thinkingLevels | const | 30 |
| modelFavorites | const | 31 |
| modelPicker | const | 32 |
| modelManager | const | 45 |
| compactions | const | 46 |
| compactionNodes | const | 47 |
| images | const | 48 |
| completionVersion | const | 49 |
| selectedSkill | const | 50 |
| hiddenSessions | const | 54 |
| readSessionPreference | function | 59 |
| changeSessionPreference | function | 63 |
| setSessionHidden | function | 77 |
| saveView | function | 92 |
| resizePrompt | function | 103 |
| scrollFrame | const | 107 |
| scrollLatest | function | 108 |
| scheduleCallGroups | method | 109 |
| renderer | const | 119 |
| scrollLatest | method | 141 |
| mobile | const | 143 |
| sidebar | function | 144 |
| sidebar | method | 154 |
| pending | const | 158 |
| requestSeq | const | 163 |
| error | function | 164 |
| request | function | 167 |
| controls | function | 176 |
| renderContextChips | method | 201 |
| options | function | 216 |
| providerEntries | const | 225 |
| modelEntries | const | 226 |
| refreshModelCatalog | function | 228 |
| fillModels | function | 256 |
| options | method | 257 |
| fillSubagentModels | function | 263 |
| options | method | 265 |
| capabilityName | function | 273 |
| runtimeSummary | function | 283 |
| renderRuntime | function | 296 |
| updateTaskRuntime | function | 304 |
| renderRuntime | method | 306 |
| applyConfig | function | 309 |
| options | method | 311 |
| renderRuntime | method | 317 |
| options | method | 318 |
| fillSubagentModels | method | 323 |
| fillModels | method | 325 |
| options | method | 326 |
| configure | function | 332 |
| controls | method | 335 |
| showSettingsPanel | function | 357 |
| showSettingsPanel | method | 371 |
| controls | method | 372 |
| remoteView | const | 383 |
| remoteLoaded | const | 384 |
| remoteAnchor | function | 385 |
| remoteRender | function | 393 |
| controls | method | 439 |
| remoteLoad | function | 441 |
| remoteAuthUrl | function | 457 |
| remoteLogin | function | 465 |
| remoteOnReconnect | function | 491 |
| controls | method | 505 |
| messageItems | const | 518 |
| activityPaths | const | 520 |
| setActivityIcon | function | 537 |
| callGroupsFrame | const | 547 |
| scheduleCallGroups | function | 548 |
| createCallGroup | function | 557 |
| paintCallGroup | function | 571 |
| refreshCallGroups | function | 598 |
| foldCallsBeforeMessage | function | 691 |
| paintCallGroup | method | 695 |
| disclosureHint | function | 697 |
| activityLine | function | 717 |
| setActivity | method | 727 |
| setActivity | function | 730 |
| scheduleCallGroups | method | 731 |
| setActivityIcon | method | 733 |
| waiting | function | 744 |
| scheduleCallGroups | method | 746 |
| scrollLatest | method | 752 |
| clearWaiting | function | 754 |
| stopActivity | function | 758 |
| scheduleCallGroups | method | 760 |
| clearWaiting | method | 761 |
| updateActivity | function | 770 |
| setActivity | method | 783 |
| setActivity | method | 784 |
| mergeThoughts | function | 788 |
| diffView | const | 806 |
| renderToolDetail | function | 811 |
| section | method | 897 |
| toolState | function | 899 |
| clearWaiting | method | 901 |
| setActivity | method | 945 |
| renderToolDetail | method | 946 |
| scrollLatest | method | 947 |
| card | function | 949 |
| renderMessage | function | 1000 |
| updateActivity | method | 1093 |
| renderCompactionStatus | function | 1096 |
| trackTaskEntries | function | 1113 |
| placeCompactedTasks | function | 1124 |
| compactionCard | function | 1133 |
| renderMarkdown | method | 1151 |
| foldCompaction | function | 1154 |
| placeCompactedTasks | method | 1174 |
| mergeThoughts | method | 1175 |
| compactionEditor | function | 1179 |
| options | method | 1217 |
| fillThinking | method | 1247 |
| retryChipList | function | 1256 |
| retryEditor | function | 1305 |
| renderTaskRuns | function | 1325 |
| renderQueue | function | 1353 |
| retryCards | const | 1370 |
| renderRetry | function | 1371 |
| scrollLatest | method | 1404 |
| event | function | 1406 |
| snapshot | function | 1564 |
| clearTimeout | method | 1566 |
| updatePageTitle | method | 1584 |
| renderTaskRuns | method | 1591 |
| renderCompactionStatus | method | 1596 |
| restoreRetries | method | 1653 |
| mergeThoughts | method | 1667 |
| placeCompactedTasks | method | 1681 |
| renderImages | method | 1693 |
| closeCompletion | method | 1696 |
| renderQueue | method | 1707 |
| applyConfig | method | 1709 |
| controls | method | 1711 |
| reconnectTimer | const | 1713 |
| clearTimeout | method | 1717 |
| controls | method | 1720 |
| scheduleReconnect | function | 1839 |
| clearTimeout | method | 1840 |
| serviceVersion | const | 1844 |
| importDir | const | 1845 |
| restartNames | const | 1846 |
| restartDescriptions | const | 1847 |
| controls | method | 1871 |
| fillModels | method | 1883 |
| fillSubagentModels | method | 1890 |
| closeCompletion | method | 1907 |
| controls | method | 1912 |
| scrollLatest | method | 1917 |
| enableImagePreview | function | 1949 |
| renderImages | function | 1970 |
| addImages | function | 1995 |
| loadImages | function | 2016 |
| renderImages | method | 2025 |
| selectionCopy | const | 2048 |
| copySelection | function | 2060 |
| escapeTimer | const | 2123 |
| withdrawQueue | function | 2124 |
| refreshing | const | 2204 |
| refreshSessions | function | 2205 |
| updatePageTitle | function | 2216 |
| updateSessions | function | 2220 |
| updatePageTitle | method | 2232 |
| renderSessions | method | 2233 |
| recoverMissingSession | function | 2235 |
| controls | method | 2237 |
| saveView | method | 2244 |
| controls | method | 2248 |
| switchSession | function | 2264 |
| saveView | method | 2266 |
| controls | method | 2269 |
| copySessionFile | function | 2295 |
| renderSessions | function | 2303 |
| sessionAction | const | 2419 |
| openSessionAction | function | 2420 |
| contextIcon | function | 2461 |
| renderContextChips | function | 2464 |
| renderContextResults | function | 2482 |
| showContextSkills | function | 2502 |
| positionContextSkills | function | 2507 |
| showContextSkills | method | 2519 |
| controls | method | 2554 |
| skillTrigger | const | 2556 |
| showContextSkills | method | 2572 |
| resizePrompt | method | 2581 |
| controls | method | 2582 |
| closeCompletion | function | 2585 |
| highlightCompletion | function | 2593 |
| chooseCompletion | function | 2602 |
| closeCompletion | method | 2612 |
| updateCompletion | function | 2615 |
| closeCompletion | method | 2616 |
| resizePrompt | method | 2669 |
| controls | method | 2670 |
| switchSession | method | 2710 |
| creationLoad | const | 2721 |
| refreshPresets | function | 2722 |
| createAgentPicker | function | 2757 |
| options | method | 2783 |
| fill | method | 2791 |
| fillThinking | method | 2799 |
| options | method | 2801 |
| loadCreation | function | 2848 |
| openCreation | function | 2884 |
| rememberCreation | const | 2905 |
| updateDefaultsPreview | function | 2937 |
| updateDefaultsPreview | method | 2961 |
| controls | method | 3016 |

### public/file-picker.js（351 行） — 共享文件/目录选择弹窗、懒加载与分类 SVG 图标

| 符号 | 类型 | 行 |
|---|---|---|
| NS | const | 11 |
| SEARCH_DEBOUNCE | const | 12 |
| el | function | 16 |
| FOLDER_COLORS | const | 29 |
| FOLDER_ALIASES | const | 30 |
| FOLDER_COLOR | const | 31 |
| FOLDER_BASE | const | 32 |
| DOC_BASE | const | 33 |
| p | const | 35 |
| c | const | 36 |
| t | const | 37 |
| FOLDER_GLYPHS | const | 43 |
| FILE_GLYPHS | const | 51 |
| KIND_BY_EXT | const | 65 |
| kindOf | function | 82 |
| fileIcon | function | 94 |
| createFilePicker | function | 115 |
| baseName | function | 348 |

### public/markdown.js（230 行） — marked + DOMPurify 渲染（XSS 边界）

| 符号 | 类型 | 行 |
|---|---|---|
| cache | const | 4 |
| policy | const | 5 |
| textLanguages | const | 11 |
| isText | const | 12 |
| asciiTable | function | 15 |
| looksLikeDiagram | function | 46 |
| layoutDiagram | function | 53 |
| isJson | function | 82 |
| jsonControls | function | 86 |
| renderMarkdown | function | 125 |

### public/model-manager.js（628 行） — Pi 模型管理：供应商模板、模型编辑与安全保存反馈

| 符号 | 类型 | 行 |
|---|---|---|
| API_TYPES | const | 9 |
| PROVIDER_TEMPLATES | const | 17 |
| PROVIDER_ID | const | 48 |
| MASK_KINDS | const | 49 |
| MANAGED_PROVIDER_KEYS | const | 52 |
| MANAGED_MODEL_KEYS | const | 53 |
| isMask | const | 55 |
| hasOwn | const | 56 |
| clone | const | 57 |
| keepMasked | function | 59 |
| stable | function | 67 |
| el | function | 75 |
| field | function | 91 |
| badge | function | 95 |
| parseJsonText | function | 98 |
| initModelManager | function | 105 |

### public/model-picker.js（283 行） — 共享模型选择器：供应商/模型/思考收藏、排序与键盘交互

| 符号 | 类型 | 行 |
|---|---|---|
| GAP | const | 23 |
| EDGE | const | 24 |
| TYPEAHEAD_MS | const | 25 |
| el | function | 29 |
| createModelPicker | function | 39 |
| addEventListener | method | 273 |
| addEventListener | method | 276 |

### public/stream-renderer.js（46 行） — 流式增量渲染状态机

| 符号 | 类型 | 行 |
|---|---|---|
| createStreamRenderer | function | 2 |

### public/text-contrast.js（113 行） — 文字对比度按钮、实时调节与本地偏好

| 符号 | 类型 | 行 |
|---|---|---|
| KEY | const | 10 |
| MIN | const | 11 |
| MAX | const | 12 |
| STEP | const | 13 |
| DEFAULT | const | 14 |
| clampLevel | function | 17 |
| readStoredLevel | function | 23 |
| storeLevel | function | 34 |
| applyLevel | function | 42 |
| initTextContrast | function | 47 |
| sync | method | 100 |

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

### scripts/install.mjs（101 行） — 一键安装：装依赖/注册自启/启动守护/健康检查/打开浏览器

| 符号 | 类型 | 行 |
|---|---|---|
| root | const | 14 |
| parseArgs | const | 16 |
| nodeOk | const | 26 |
| openCommand | const | 31 |
| ensurePi | const | 37 |
| viaShell | const | 44 |
| probe | const | 50 |
| ask | const | 58 |
| install | function | 60 |
| invoked | const | 98 |

### scripts/service.mjs（234 行） — 服务守护：IPC 重启、HTTP 安全停止与崩溃退避停止通道

| 符号 | 类型 | 行 |
|---|---|---|
| root | const | 12 |
| output | const | 13 |
| run | function | 14 |
| npmRun | const | 27 |
| update | function | 34 |
| rebuild | function | 49 |
| controlPath | function | 66 |
| supervise | function | 71 |
| mkdirSync | method | 79 |
| start | method | 181 |
| invoked | const | 185 |
| stopService | function | 186 |

### scripts/uninstall.mjs（18 行） — 统一卸载：核对 npm 目标、安全停止、取消自启、保留用户数据

| 符号 | 类型 | 行 |
|---|---|---|
| uninstall | function | 8 |

### src/capabilities.js（135 行） — 模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities）

| 符号 | 类型 | 行 |
|---|---|---|
| sdkEntry | const | 12 |
| resolver | const | 13 |
| alias | const | 14 |
| jiti | const | 21 |
| snapshotSettings | function | 23 |
| discoverCapabilities | function | 36 |
| resolveCapabilities | function | 77 |
| refreshProjectSkills | function | 94 |
| capabilityLoader | function | 104 |

### src/compaction.js（374 行） — 后台独立摘要、token/占比阈值、快照校验与 turn 安全提交

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
| throwIfAborted | function | 111 |
| summarizeWithPiSession | function | 115 |
| throwIfAborted | method | 116 |
| createBackgroundCompaction | function | 189 |

### src/inline-images.js（32 行） — 模型上下文图片定位：将占位符与真实附件交错排列，不改存储与队列

| 符号 | 类型 | 行 |
|---|---|---|
| inlineImages | function | 2 |
| inlineImagesExtension | function | 29 |

### src/main.js（86 行） — 入口：端口/工作区校验，组装 factory+Sessions+server，信号处理

| 符号 | 类型 | 行 |
|---|---|---|
| port | const | 14 |
| cwd | const | 17 |
| factory | const | 20 |
| home | const | 21 |
| sessions | const | 28 |
| models | const | 30 |
| service | const | 33 |
| app | const | 58 |
| initRemote | method | 62 |
| initRemote | function | 64 |
| closing | const | 74 |
| stop | function | 75 |

### src/model-config.js（369 行） — Pi models.json 无损配置读写与共享收藏持久化

| 符号 | 类型 | 行 |
|---|---|---|
| sdkModelConfig | const | 11 |
| EMPTY_FINGERPRINT | const | 21 |
| digest | const | 22 |
| LEVELS | const | 23 |
| FAVORITE_GROUPS | const | 24 |
| FAVORITE_CAP | const | 25 |
| providerPattern | const | 26 |
| envPattern | const | 28 |
| kindOf | const | 30 |
| maskHeaders | const | 31 |
| maskModel | const | 40 |
| maskProvider | function | 45 |
| resolveSecret | function | 62 |
| checkBaseUrl | function | 74 |
| mergeHeaders | function | 84 |
| mergeProvider | function | 95 |
| applyModel | function | 119 |
| validFavoriteKey | function | 136 |
| readFavorites | function | 154 |
| createModelsService | function | 171 |

### src/pi.js（307 行） — createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档）

| 符号 | 类型 | 行 |
|---|---|---|
| agentRuntime | function | 12 |
| queueStateOf | function | 28 |
| hasModelOutput | function | 47 |
| withdrawQueue | function | 57 |
| recallLastMessage | function | 67 |
| createPiFactory | function | 89 |

### src/protocol.js（312 行） — zod 协议：selection / command 判别联合（消息类型见 L3）

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
| retryPatterns | const | 57 |
| selection | const | 63 |
| preset | const | 75 |
| presetStore | const | 81 |
| providerKey | const | 83 |
| modelKey | const | 86 |
| secretValueIn | const | 93 |
| secretHeadersIn | const | 98 |
| thinkingLevelMapIn | const | 99 |
| costIn | const | 107 |
| providerConfigIn | const | 126 |
| modelConfigIn | const | 142 |
| fingerprintIn | const | 159 |
| command | const | 160 |

### src/remote.js（501 行） — Tailscale 登录身份、远程监听、同账号授权与本机配置持久化

| 符号 | 类型 | 行 |
|---|---|---|
| configSchema | const | 10 |
| execOptions | const | 14 |
| cliEnv | const | 16 |
| defaultRun | const | 17 |
| defaultCandidates | const | 24 |
| createTailscale | const | 38 |
| isTailnetIPv4 | const | 75 |
| selfStatus | function | 86 |
| whoisUser | function | 108 |
| describeError | const | 119 |
| defaultSpawnLogin | const | 129 |
| spawn | method | 130 |
| AUTH_URL | const | 131 |
| MAX_WHOIS | const | 134 |
| LOGIN_OUTPUT_CAP | const | 135 |
| createRemoteAccess | function | 137 |

### src/retry.js（161 行） — 模型失败重试：可取消退避、最多45次、16分钟封顶、自定义错误词表、保留已有工具结果继续

| 符号 | 类型 | 行 |
|---|---|---|
| RETRY_DELAYS_MS | const | 5 |
| MAX_DELAY_MS | const | 6 |
| MAX_RETRIES | const | 7 |
| delayFor | const | 8 |
| MAX_TIMEOUT_MS | const | 14 |
| abortableSleep | const | 15 |
| classify | class | 51 |
| createAutoRetry | function | 84 |

### src/server.js（438 行） — createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发

| 符号 | 类型 | 行 |
|---|---|---|
| assets | const | 7 |
| createServerApp | function | 43 |

### src/sessions.js（876 行） — Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化

| 符号 | 类型 | 行 |
|---|---|---|
| BROWSE_PAGE | const | 13 |
| resolveDir | function | 15 |
| parentOf | function | 26 |
| absoluteCrumbs | function | 35 |
| importedTitle | function | 57 |
| hostLocations | function | 79 |
| Sessions | class | 94 |
| constructor | method | 95 |
| loadDefaults | method | 107 |
| getDefaults | method | 126 |
| workspaceDefaults | method | 129 |
| configureDefaults | method | 147 |
| saveDefaults | method | 152 |
| validateSelection | method | 200 |
| validateCompaction | method | 221 |
| listPresets | method | 239 |
| mutatePresets | method | 250 |
| savePreset | method | 271 |
| deletePreset | method | 286 |
| load | method | 295 |
| persist | method | 314 |
| list | method | 333 |
| rename | method | 347 |
| importSession | method | 356 |
| create | method | 384 |
| scheduleTaskNotifications | method | 582 |
| deliverTaskNotifications | method | 594 |
| get | method | 616 |
| revealWorkspace | method | 621 |
| browse | method | 635 |
| listFiles | method | 641 |
| refreshSkills | method | 700 |
| snapshot | method | 706 |
| subscribe | method | 734 |
| configure | method | 740 |
| prompt | method | 774 |
| withdraw | method | 824 |
| cancel | method | 839 |
| remove | method | 857 |
| close | method | 872 |

### src/tasks.js（107 行） — Tasks：子任务（委托）生命周期

| 符号 | 类型 | 行 |
|---|---|---|
| Tasks | class | 3 |
| constructor | method | 4 |
| start | method | 11 |
| publish | method | 22 |
| view | method | 25 |
| snapshot | method | 28 |
| run | method | 33 |
| read | method | 76 |
| append | method | 83 |
| cancel | method | 93 |

### src/tools.js（97 行） — delegationTools：委托/凭证读取/追加工具定义（zod 入参）

| 符号 | 类型 | 行 |
|---|---|---|
| delegateInput | const | 3 |
| readInput | const | 10 |
| appendInput | const | 13 |
| result | const | 20 |
| delegationTools | function | 24 |

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

### tests/app.test.js（1562 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| pickerSource | const | 9 |
| contrastSource | const | 10 |
| modelSources | const | 11 |

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

### tests/compaction-ui.test.js（98 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 10 |
| restore | method | 39 |

### tests/compaction.test.js（781 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| fakeModel | const | 65 |
| createTestSession | function | 78 |
| seq | const | 95 |
| userMsg | const | 96 |
| assistantMsg | const | 97 |
| big | const | 103 |
| seed | function | 105 |
| settle | const | 110 |
| waitFor | function | 112 |
| enabledConfig | const | 120 |
| fakeSummarize | function | 129 |
| startHangingLlmServer | function | 137 |
| startFakeLlmServer | function | 160 |
| zodError | method | 217 |
| zodError | method | 218 |
| zodError | method | 219 |
| zodError | method | 220 |
| zodError | method | 221 |
| zodError | method | 222 |
| hangingSummarize | function | 544 |
| createLoopSession | function | 641 |
| writeFileSync | method | 642 |

### tests/conversation-preview.mjs（123 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| markdown | const | 4 |
| message | const | 21 |
| thinking | const | 26 |
| state | const | 38 |
| sequence | const | 45 |
| add | const | 46 |
| assistant | const | 47 |
| add | method | 59 |
| add | method | 60 |
| states | const | 64 |
| longState | const | 75 |
| compactState | const | 91 |
| sessions | const | 113 |
| app | const | 120 |
| port | const | 121 |

### tests/file-picker.test.js（67 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| source | const | 6 |
| tick | const | 7 |

### tests/image-input.test.js（167 行） — node --test 测试（npm test）

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

### tests/message-activity.test.js（263 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 10 |
| restore | method | 39 |
| assistant | const | 43 |
| thought | const | 44 |
| call | const | 45 |
| entry | const | 46 |

### tests/model-config.test.js（463 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| sha | const | 16 |
| EMPTY | const | 17 |
| tempDir | function | 19 |
| makeService | function | 23 |
| seed | const | 40 |

### tests/model-manager.test.js（430 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| source | const | 7 |
| tick | const | 8 |
| j | const | 10 |
| masked | const | 12 |
| harness | function | 14 |
| setInput_on | method | 142 |
| setInput_on | function | 168 |

### tests/model-onboarding-ui.test.js（153 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| stripImports | const | 8 |
| modelSources | const | 9 |
| contrastSource | const | 14 |
| pickerSource | const | 15 |
| appSource | const | 16 |
| config | const | 18 |
| harness | const | 19 |

### tests/model-picker.test.js（230 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| source | const | 6 |
| tick | const | 7 |
| nap | const | 8 |
| OPTS | const | 10 |
| SELECT | const | 14 |
| boot | function | 17 |
| $ | const | 34 |
| key | const | 35 |
| click | const | 37 |
| menu | const | 38 |
| opts | const | 39 |
| stars | const | 40 |

### tests/model-selection-preview.mjs（42 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| home | const | 9 |
| catalog | const | 10 |
| factory | const | 16 |
| sessions | const | 29 |
| models | const | 31 |
| app | const | 32 |
| port | const | 33 |
| close | function | 35 |

### tests/presets.test.js（102 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| makeFactory | const | 10 |

### tests/recall.test.js（94 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| user | const | 9 |
| assistant | const | 10 |
| thinking | const | 11 |
| fixture | function | 13 |

### tests/remote-ui.test.js（224 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| page | function | 10 |
| modelSources | const | 16 |
| flush | const | 40 |
| stubRequest | function | 41 |
| submit | const | 51 |

### tests/remote.test.js（598 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| EMAIL | const | 21 |
| mockTailscale | const | 23 |
| fakeChild | const | 76 |
| setup | const | 93 |
| wsRequest | const | 134 |
| setTimeout | method | 424 |

### tests/retry.test.js（369 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| RATE_LIMIT | const | 6 |
| QUOTA | const | 7 |
| ABORTED | const | 8 |
| fakeSession | function | 15 |
| recorder | function | 53 |
| recordedSleep | const | 63 |
| lastAssistant | const | 73 |

### tests/session-created-at.test.js（44 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factory | const | 8 |

### tests/session-flow.test.js（222 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| flowFactory | const | 77 |

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

### tests/task-notifications.test.js（129 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| factoryFixture | function | 8 |
| tick | const | 26 |
| until | function | 27 |

### tests/tasks.test.js（76 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| fixture | function | 7 |
| assert | method | 53 |

### tests/text-contrast.test.js（162 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| source | const | 7 |
| css | const | 8 |
| fakeStorage | const | 10 |
| throwingStorage | const | 19 |
| boot | class | 21 |

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

### tests/update.test.js（38 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| old | const | 8 |

### tests/workspace-tabs.test.js（235 行） — node --test 测试（npm test）

| 符号 | 类型 | 行 |
|---|---|---|
| appSource | const | 9 |
| pickerSource | const | 10 |
| contrastSource | const | 11 |
| modelSources | const | 12 |
| html | const | 17 |
| state | const | 19 |
| STATES | const | 24 |
| bootPage | function | 30 |
| attachCalls | const | 84 |

## L3 横切常量（跨模块定位入口）

- 协议 command.type：image、inherit、radius、service.status、service.restart、remote.get、remote.login、remote.configure、session.rename、workspace.reveal、workspace.browse、files.browse、models.list、models.config.get、models.provider.save、models.provider.delete、models.model.save、models.model.delete、models.favorites.get、models.favorites.set、capabilities.list、session.defaults.get、session.defaults.configure、session.presets.list、session.presets.save、session.presets.delete、session.configure、sessions.list、session.create、session.import、session.attach、session.skills.refresh、session.close、prompt、cancel、queue.withdraw、tasks.read（src/protocol.js）
- HTML id：sidebar、open-workspace、new、custom-new、preset-list、import-session、search、sessions、open-settings、sidebar-backdrop、toggle-sidebar、session-title、workspace-label、copy-workspace、reveal-workspace、workspace-feedback、status、service-dev、service-version、service-menu-button、service-menu、restart-quick、restart-rebuild、restart-update、service-feedback、login、connect、workspace、earliest、transcript、output、latest、message-queue、task-runs、compaction-progress、add-context、add-image、image-files、context-chips、context-menu、context-picker、context-back、context-title、context-close、context-search、context-results、context-error、image-attachments、composer、prompt、prompt-completion、composer-skill、provider、model、thinking、stop、send-steer、send-followup、send、session-runtime、composer-help、error、session-action、session-action-form、session-action-title、session-action-description、session-name-label、session-name、session-action-error、session-action-cancel、session-action-submit、image-preview、image-preview-close、image-preview-image、restart-dialog、restart-form、restart-title、restart-description、restart-warning、restart-cancel、restart-submit、task-overlays、task-template、settings、settings-title、settings-defaults-tab、settings-remote-tab、settings-models-tab、defaults-panel、selection-copy-title、selection-copy、selection-copy-help、selection-copy-feedback、queue-type、steer-help、followup-help、defaults-preview、subagent-title、subagent-help、subagent-provider、subagent-model、settings-feedback、defaults-title、defaults-editor、remote-panel、remote-status-title、remote-status、remote-login、remote-auth、remote-url、remote-form、remote-note、remote-enabled、remote-email、remote-email-help、remote-feedback、remote-refresh、remote-save、models-panel、create-session、create-title、create-form、preset-fields、preset-name、preset-fixed-cwd、preset-directory、preset-delete、create-workspace、create-defaults-help、create-agents、create-compaction、create-retry、create-trust-row、create-trust、create-feedback、create-submit（public/index.html）
- HTTP 静态路由：/、/favicon.svg、/style.css、/app.js、/file-picker.js、/tooltip.js、/tooltip.css、/text-contrast.js、/text-contrast.css、/file-picker.css、/markdown.js、/stream-renderer.js、/vendor/marked.js、/vendor/purify.js、/model-manager.js、/model-manager.css、/model-picker.js、/model-picker.css、/health（src/server.js）

## ⚠ 未登记文件（0）

（无）
