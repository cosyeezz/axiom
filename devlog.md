# 开发记录

## 2026-09-14 修复新建空会话被写成打不开的库记录
- 内容：`src/sessions.js` 新增模块级 `landedSessionFile(item)`：只有 `item.agent.sessionFile()` 指向的文件真的存在才返回路径，否则返回 `null`；`sessionData()`（落库）与 `list()`（侧栏）改用同一个函数。新增 `tests/session-flow.test.js` 用例：新建会话后断言库与列表里都是空路径、重启后 `ensureLoaded` 按空会话打开、真实落盘后路径才进库。README 补一句说明。
- 原因：Pi 的 `SessionManager` 是惰性落盘的——`create()` 返回时就确定了 `sessionFile` 路径，但文件要等第一条消息才写。旧代码在 `sessionData()` 里直接 `item.agent.sessionFile()` 入库，于是「新建会话 → 没发消息 → 重启」这条极普通的路径会永久造出一条坏记录：`ensureLoaded()` 查 `existsSync(saved.sessionFile)` 为假 → 报「会话历史文件缺失，已保留数据库记录」，而该文件永远不会被创建，这条会话就永久打不开了。用户 Mac 上的截图就是这个报错，且重装（包括换版本）治不好：库里的坏记录不会因重装而消失。
- 决策：不去改 `ensureLoaded()` 的严格语义。`tests/session-migration.test.js` 的 ghost 用例明确要求「只有打开时检查历史，不创建空 JSONL」且要逐字节保留库记录（临时不可用的历史文件——如同步盘未挂载——在文件回来后仍能恢复，不固化空历史）。真正的根因是**写入**了不曾存在的路径，所以只堵写入侧；判据用“文件是否真的在磁盘上”，不引入任何启发式猜测。`list()` 一并改用同一函数：前端本来就按 `sessionFile` 为 `null` 渲染「该会话还没有 JSONL 文件（发送首条消息后生成）」，两处口径因此一致。
- 遗留：修复前已经写进库的假记录仍需手动处理（打开会继续报错，没有安全的自动判据能区分「空会话的假路径」和「真被删掉的历史」，猜错就是静默丢数据）；在侧栏删掉该会话记录即可。
- 验证：`tests/session-flow.test.js`（9 项）与 `tests/session-migration.test.js`（7 项，含 ghost 语义回归）全绿；全量 `npm test` 370 项：368 通过 / 0 失败 / 2 跳过（24.6s）。
- 涉及：src/sessions.js、tests/session-flow.test.js、README.md、devlog.md。

## 2026-09-14 axiom 改为后台启动的服务命令
- 内容：`scripts/service.mjs` 的 CLI 分派重写。`axiom`（无参数）不再前台常驻，改为 `startBackground()`：`spawn(process.execPath, [..., "--foreground"], { detached: true, stdio: "ignore" })` 后轮询 `/health` 至就绪，打印地址与日志路径即返回，已在运行则只提示不重复启动。新增 `axiom --foreground`（`-f`）保留原前台行为，供调试与直接看日志。新增 `localPort()`/`localAddress()`/`homeDir()`/`openPage()`/`firstRunGuide()` 并导出；`serviceReady()` 与 `startBackground()` 由 `install.mjs` 复用，删掉其重复的 fork + 探活循环。新增 `scripts/autostart.mjs` 的 `isEnabled()`。首次引导把「注册登录自启」「打开页面」两个问题只问一次，标记写在 `AXIOM_HOME/.guided`，`axiom-setup` 结束时也写同一标记。README 的安装与启动章节同步。
- 原因：用户报告两件事：①`axiom` 在终端前台常驻，关掉终端窗口服务就没——macOS 关窗发 SIGHUP 给前台进程组，守护与 worker 一起死，页面表现为「连接已断开，正在自动重连」，这正是把「清理后重装仍不可用」串起来的一环；②`npm install -g` 之后没有任何引导，用户不知道要跑 `axiom-setup`，于是没注册自启、也没打开过页面。修的过程中又确定三个既有缺陷：`fork()` 的 IPC channel 会拖住父进程，`.unref()` 不够，`axiom-setup` 跑完不返回终端；日志路径硬编码 `join(homedir(), ".axiom")`，设了 `AXIOM_HOME` 时提示的路径是错的；`AXIOM_PORT` 没校验，坏值要走到 `fetch` 才报一句看不懂的 `Invalid URL`。
- 决策：`axiom` 的职责就是服务生命周期（起/停/卸载），安装引导仍归 `axiom-setup`；`axiom` 只补问一次自启与开页，不每次启动都问（用 `AXIOM_HOME/.guided` 一次标记，删 `~/.axiom` 才重新问）。子进程用 `spawn` 而非 `fork`：后台启动不需要 IPC，而 `fork` 的 IPC channel 会拖住父进程。子进程必须显式带 `--foreground`，否则无参数分支会再走一次 `startBackground` 无限派生。`localPort()` 接受 `0`：`tests/service.test.js` 一直用 `AXIOM_PORT=0` 当“不监听真实端口”的哨兵，且 `installTag("http://127.0.0.1:0", root)` 直接依赖该字面量。空值按 `||` 回退 4319，与 `src/main.js` 一致（不是 `??`）。
- 验证：`tests/service.test.js` 的 `startDaemon` 改 spawn `--foreground`（否则后台化后测试拿不到前台管道）；`tests/install.test.js` 新增 `localPort` 边界、`serviceReady`（真实 HTTP 服务，含非 2xx）、`startBackground` 已在运行不派生进程、`firstRunGuide` 非交互不写标记；`tests/cli-help.test.js` 新增 `--foreground` 参数校验与「`AXIOM_PORT` 非法即早退出、不等 stdin」。全量 `npm test` 369 项：367 通过 / 0 失败 / 2 跳过（24.6s）。本机实测：`axiom` 后台启动 1.6s 返回且关掉父 shell 后服务仍活（下次调用报「服务已在运行」），`axiom --foreground` 正常前台运行，`axiom stop` 正常退出。macOS/Linux 未实机运行，SIGHUP 隔离依赖 `detached` 的语义，未在真机验证。
- 涉及：scripts/service.mjs、scripts/install.mjs、scripts/autostart.mjs、tests/service.test.js、tests/install.test.js、tests/cli-help.test.js、README.md、devlog.md。

## 2026-09-13 修复导入会话用例的 hash 竞争
- 内容：`tests/app.test.js` 导入会话那段（点 `#file-picker-confirm` 之后）不再靠一次 `settle()` 就断言 `location.hash`，改为轮询等 `session=imported` 出现（上限 300×20ms，只防卡死）。
- 原因：上一条修复合入后，全套跑偶发挂在 `assert.match(window.location.hash, /session=imported/)`（收到 `'#session=a'`）。按钮处理器是 `await switchSession(...)` 的即发即忘调用：`session.import` 请求确实发出了（`lastImport` 断言在前面已通过），但 hash 要等响应回来走完 `snapshot(state)` 才改，一个 `setImmediate` 不保证这条异步链跑完。属既有的「按固定 tick 数往下走」写法，与上一条改动无关——把 `sleep(1100)` 那处改回原样后同样跑不出差异（空机器各 8 轮全绿）。
- 验证：单跑该用例通过（3.2s）；空机器全套 4 轮全绿（360 过 / 0 失败 / 2 跳过）；32 个忙循环进程压着再跑 2 轮全绿（100.2s / 101.5s，跑完确认 hog 仍是 32）。reindex 124 文件 0 未登记，`tests/codebase-index.test.js` 通过。
- 涉及：tests/app.test.js、devlog.md、.pi/skills/codebase-map/INDEX.md。

## 2026-09-13 修复测试在机器负载下的随机失败
- 内容：`tests/service.test.js` 假 worker 的启动期文件操作（`workers` 计数、`maint-env.tmp` → `maint-env` 原子改名、`workerPid`）加有限次退避重试，`uncaughtException` 处理器提到最前面；`until` 默认上限 12s → 60s，删掉 `served-during-install` 那处 8s 覆写；`teardown` 的 `rm` 加 `maxRetries: 20, retryDelay: 100`；维护 HTTP 用例的 `request` 超时 3s → 30s 并补 `req.on("timeout", () => req.destroy())`。`tests/app.test.js` 把等重连的固定 `sleep(1100)` 换成轮询。`package.json` 的 `test` 加 `--test-timeout=120000`，随后删除 6 处按空机器估的 `{ timeout }` 覆写（model-config、pi-model-storage、service-settings-api、service-settings、service、workspace-isolation）；`install`/`cli-help`/`uninstall` 的 `spawnSync` 上限统一提到 60s（`spawnSync` 不继承 runner 上限）。
- 原因：真正的根因只有一个，是测试夹具的 Windows 文件锁竞争，不是产品缺陷、也不只是超时太紧。`service.log` 抓到崩溃栈：假 worker 在模块加载期 `renameSync('maint-env.tmp', 'maint-env')` 报 `EPERM`（杀软/索引器瞬时占用新建文件，负载高时窗口变大），而这行在 `uncaughtException` 注册之前，于是进程直接以 code 1 退出、连 `worker-error` 都没留下。守护进程按“worker 崩溃”正确地自动重启，多出一个实例，`rebuild * failure restores old dependencies` 断言的 worker 数就从 3 变 4（或 2 变 3）。`src/pi-model-storage.js:69` 早就记录并处理过同一风险，夹具漏了。剩下的时限类改动是第二层：那些墙钟上限按空机器估，负载下会误判。
- 决策：时限一律视为“防永久 hang 的兜底”，不是性能断言，因此用 runner 级 `--test-timeout=120000` 取代手调的分散字面量（删除优于调参）；`until` 保留自己更清楚的 `until 超时` 报错。重试策略照抄 `pi-model-storage` 的既有写法（EPERM/EBUSY/EACCES，有限次退避），不新造机制。`rebuild` 的 worker 数断言保持严格：它验证的是“不会重复拉起实例”，根因修好后不该放宽。330ms 那几处等防抖窗口过期的固定 sleep 未动，负载只会让墙钟变长，不会短。
- 验证：32 个 node 忙循环进程压满 16 核（CPU 100%，每轮跑前后确认存活）下，`npm test` 连续 3 轮全绿（360 通过 / 0 失败 / 2 跳过，98~102s，空机器 23s）。修复前同样负载下：`rebuild * failure restores` 12 轮里 2 轮失败，修复后 12 轮 0 失败；`page preserves drafts` 也在压测中暴露并修掉。
- 涉及：`tests/service.test.js`、`tests/app.test.js`、`tests/install.test.js`、`tests/cli-help.test.js`、`tests/uninstall.test.js`、`tests/model-config.test.js`、`tests/pi-model-storage.test.js`、`tests/service-settings.test.js`、`tests/service-settings-api.test.js`、`tests/workspace-isolation.test.js`、`package.json`、重建 `INDEX.md`、`devlog.md`。

## 2026-09-13 明/暗主题切换与侧栏字号下调
- 内容：右上角新增 `#toggle-theme`（太阳/月亮图标，`aria-pressed` 标记浅色）。`public/style.css` 的 `:root` 重写为单一 `light-dark()` token 表，`:root[data-theme]` 只翻 `color-scheme`；新增 `--line-strong`/`--on-accent`/`--accent-hover`/`--hover`/`--shadow-soft|mid|strong`，约 30 处硬编码颜色改为 token 或 `color-mix`。`file-picker`/`model-manager`/`model-picker`/`tooltip` 四个 css 同步 token 化（提示浮层在浅色下反转为暗色芯片）。侧栏字号 aside 13px、品牌 19→17px、侧栏内次级文字 12→11px。
- 原因：白天使用需要浅色底；浅色调色取 Linear light / GitHub Primer / Vercel Geist 三家成熟方案的交集。侧栏字号偏大，抑制后主区对话更突出。
- 决策：默认暗色，不跟随 `prefers-color-scheme`，只认显式切换，存 `localStorage` 的 `axiom.theme`。首屏前由阻塞加载的 `public/theme.js` 写 `data-theme` 防闪白（CSP 禁 inline script，故独立文件 + 服务端资源表登记）。强调色底文字固定 `--on-accent: #ffffff`（#5e6ad2 与浅色 `--ink` 不足 4.5:1）。`::backdrop` 遮罩继承不可靠，继续用字面值。
- 修复：`.icon-button:hover`（0,1,1）输给通用 `button:hover:not(:disabled)`（0,2,1），悬停变成实心强调色底配 `--ink`（浅 2.81 / 暗 2.7，旧版就已存在）；补上 `:not(:disabled)` 后恢复 10% 强调色淡底。
- 验证：Playwright 逐面截图复核设置弹窗、新建会话、提示浮层、右键菜单、文件选择器、模型面板/自定义下拉、任务弹窗、补全弹窗、展开工具记录、diff 加减色、手机侧栏；对比度扫描（含 hover、按祖先背景做 alpha 合成）两个主题零失败。把新 css 的 `light-dark()` 折叠到暗色分支后与旧版逐行比对，确认暗色无回归（仅 `summary` 与 `.selectors select` 两处遗留 `#d0d6e0` 正式归入 `--body-ink`）。npm test 362 项全绿（service.test.js 并发下偶现 EBUSY 抖动，单跑 17/17）。
- 涉及：`public/index.html`、`public/theme.js`（新）、`public/app.js`、`public/style.css`、`public/{file-picker,model-manager,model-picker,tooltip}.css`、`src/server.js`（静态资源表）、`.pi/skills/codebase-map/scripts/reindex.mjs` + 重建 `INDEX.md`、`README.md`、`devlog.md`。

## 2026-09-13 同步最新 master 后复验
- 合并 origin/master（68e361b），保留手机阅读、GitHub 图标等并行改动；测试冲突按上游移除文字对比模块、本分支新增 model-auth 加载合并，日志和知识库保留双方记录，索引重建。
- 合并后 npm test：362 项，360 通过、2 跳过、0 失败（上游删除文字对比模块对应测试，故总数比合并前减少）；git diff --check 通过。

## 2026-09-13 统一模型配置与历史会话恢复：集成验证
- 内容与原因：供应商不再分内置只读/自定义；模型字段覆盖保留未编辑定义，七级思考勾选与高级映射同步。配置页直接桥接 SDK 登录/登出，凭据仅落 SQLite，连接隔离、取消/超时与错误脱敏。首次导入门闩关闭后不跟随 Pi 文件，不双写。
- 会话修复：历史恢复使用完整定义验证暂未鉴权模型，保留原模型；新建仍校验可用目录，真正未知模型仍拒绝。前端保留当前不可选模型占位，并丢弃跨会话迟到配置回执；修正模型初始虚假脏状态与思考勾选视觉同步。
- 涉及：src/{pi,sessions,model-config,model-auth,pi-model-storage,protocol,server}.js；public/{app,model-manager,model-auth}.js、model-manager.css；相关 tests；README、协议文档、codebase-map 索引/知识库。
- 验证：全量 npm test 371 项，369 通过、2 平台跳过、0 失败。Playwright 静态模拟授权：1280px/390px 各四状态，8 张截图、0 横向溢出、0 脚本错误；未进行真实 OAuth 或真实 API 请求。git diff --check 与 JS 语法检查通过。

## 2026-09-13 文档同步：模型统一编辑/登录/隐藏协议与导入门闩落稿（尚待验证）
- 原因：worktree 代码新增 models.model.override（统一定义编辑）、models.auth.*（网页登录）、models.config.get 回传 authProviders/hidden/applied 与全量模型目录 catalog、thinking 七级勾选写 thinkingLevelMap、SQLite 不双写与一次导入门闩（markMissing），但三份文档未同步。
- 修改：仅 README.md、docs/model-config-protocol.md、devlog.md 三个文件。协议文档：新增思考等级统一口径小节、models.model.override/models.hidden.set/models.auth.* 三节，models.config.get 响应补 applied/applyError/authProviders/hidden 与 catalog 字段说明，数据模型节补不双写与导入门闩语义，收藏 thinking key 注明七级与末位冒号切分。README：订阅登录改为可在设置页完成；「模型与供应商」bullet 改为统一编辑口径（内置模型逐字段覆盖、勾选思考等级、隐藏而非删除、默认新会话模型位置不变）；SQLite 节补一次导入门闩与不双写。devlog：本条。
- 未改：src/ 与 public/ 全部代码、tests、其他文档。
- 验证：尚待验证。未运行任何测试或构建；文档与代码的一致性仅经人工阅读比对（protocol.js/model-auth.js/model-config.js/pi-model-storage.js/pi.js/model-manager.js/model-auth.js），待后续轮次跑全量 npm test 与页面手测后再合并。
## 2026-09-13 手机纯阅读折叠
- 原因：真机截图中输入、进度与跳转仍占据大量空间；用户要求收起后仅展示会话和一行状态。
- 修改：≤700px 收起所有输入辅助区与最早/最新入口，保留单行双百分比/供应商模型思考信息及展开按钮；展开恢复输入和模型，输入14px，草稿附件不清空。桌面规则不变，沿用 Linear muted/surface 与8/12px间距。
- 涉及：public/style.css、public/app.js、public/index.html、tests/mobile-reading-ui.py、README.md、devlog.md、索引/知识库。
- 验证：首次 npm test 357项，355通过、2跳过；推送前重跑354通过、1项service超时、2跳过，单独重跑tests/service.test.js全部17项通过。浏览器回归在等待workspace显示时超时，手机/桌面对比未完成，不能视作验收通过；按用户明确要求合并推送。未重启正式服务。

## 2026-09-13 全部 worktree 集成与清理
- 决策：按用户要求集成所有附加工作区；先备份未提交内容，处理已有合并冲突，验证后推送 master 并清理附加 worktree。
- 保留：主仓库 AGENTS.md 的本地规则整理转入功能分支提交；临时安装目录和 NUL 不纳入源码。
- 复核：detached 工作区未跟踪 workspace-isolation.test.js 是旧版草稿（仍使用已废弃 files.browse）；master 已有更新后的 workspace.browse 测试，旧稿备份但不覆盖新版。
- 涉及：AGENTS.md、devlog.md，以及各 SQLite 分支的原有变更。
- 最终融合：保留隐藏/恢复模型新增功能、SQLite 拆表与懒恢复、跨进程 CAS；原始 storage/model-fixes/benchmark 文件逐字对照已吸收提交，确认重复后保留后续安全增强，五个原始分支历史合并前后源码差异为零。日志冲突保留双方条目，索引统一重建。
- 验证：所有原 worktree HEAD 均为集成分支祖先；全量 npm test 365 项，363 通过、2 平台跳过、0 失败。基线页面时序失败单跑 3/3 通过。未启动或重启正式服务。
- 清理保护：未提交改动、旧 detached 测试、截图及 19 个忽略日志备份至 ../worktrees/Axiom-merge-backup-20260913；保留主仓库未跟踪安装暂存目录、NUL、.env.local 与旧 stash，不删除其他仓库或非注册备份目录。

## 2026-09-13 05:40+ UTC 合并模型设置重设计与最新 master（冲突融合）
- 合并 8995365（模型设置重设计+选择性导入）到 SQLite 重构分支：5 个 UU 逐一人工融合，不选边。数字验证为严格并集：model-manager.js 461/118 = ours(10/3)+theirs(451/115)；tests/model-manager 584/70、tests/model-config 380/8 同理；devlog 为双方条目拼接。INDEX.md 由 reindex 重建。提交 69023fc。
- 合并 master（55937d4）7 个 UU：database.js 同时保留 master 的 Node 版本门控（createRequire 动态加载 node:sqlite）与本分支的 closeSync/openSync 存储安全导入；sessions.js 采用 master 的 startRun 运行骨架与 retry 入口，把本分支的懒加载（ensureLoaded）装进 prompt 与 retry，未加载会话不再 NPE；tests/service.test.js 保留本分支更强的恢复断言（ready 且 workers=2）。提交 b761552。
- README 6 处冲突按代码事实裁决：默认配置/预设存储取 master 表述（SQLite 权威，defaults.json 仅一次性迁移，代码 database.get("defaults","defaults") 佐证），摘要触发/维护假错误/remote 双重编码迁移/会话表/懒恢复等 5 处取本分支拆表后描述，会话存储段补回 master 独有的「旧每会话 JSON 首次启动只读导入」。knowledge.md 双方条目全部保留（89 条）。
- 验证：全量 npm test 360 项 358 通过、0 失败、2 平台跳过；首次出现的 service.test.js 两例失败（until 超时、EBUSY unlink -shm）单独复跑 2/2 通过，判定为 knowledge.md 已记录的 Windows 平台偶发问题，非合并引入（合并未触碰 service.mjs/service.test.js）。
- 涉及：上述源/测试/文档、codebase-map 索引与知识库。

## 2026-09-13 供应商协议「不设置」保存回显修复
- 原因：providerForm 把已有供应商缺失的 api 当作新建模板，回读时补成 openai-completions，再次保存还可能写回该默认值。
- 修改：仅新建表单采用模板默认协议；已有配置缺失 api 保持空值，不改后端协议校验、模型继承或界面样式。
- 验证：新增回归覆盖清除发送 null、成功回读、再次保存、刷新和新建模板默认值；修复前复现，修复后模型面板 25 项通过；全量 307 项中 306 通过、1 跳过。首次全量因 service 测试清理临时数据库遇 EBUSY 失败，未改相关代码，重跑全绿。
- 涉及：public/model-manager.js、tests/model-manager.test.js、README.md、devlog.md、codebase-map 知识库与生成索引。

## 2026-09-13 开发服务重建失败保护与恢复
- 原因：4320 的旧守护状态显示重建在停服后才因残留 `.node_modules-backup` 拒绝切换，随后兜底 worker 因 SDK 文件缺失退出；维护期间退出被 `restarting` 屏蔽，兜底失败没有恢复普通崩溃重试。
- 修改：准备阶段提前检查备份，不停止健康 worker、不删除不明确的备份；兜底启动失败明确记录未就绪，确认 worker 已退出后恢复有上限的崩溃重试。回滚失败或停止未确认仍保留现场，不盲目启动。
- 验证：新增残留备份保活及兜底失败有限重试回归测试；修正旧测试先等 worker ready 再断言启动次数的竞态。相关测试 34/34；全量 npm test 305 项，304 通过、1 跳过、0 失败。首次相关测试因 worktree 尚未安装依赖失败，独立 npm ci 后通过。
- 决策：不自动删除备份，不在故障时自动联网重装；备份内容不完整的来源尚未证实，避免猜测性覆盖依赖。此次故障运行实例已安全重启恢复，源码修复与运行恢复分别验证。
- 涉及：scripts/service.mjs、tests/service.test.js、README.md、devlog.md。

## 2026-09-13 07:43 UTC 模型面板视觉修补：协议下拉不再截断、连接区纵向堆叠、复选框不再变大方块
- 原因：用户看了实际截图提三点：①「API 协议」下拉的选项文案太长被切掉（`OpenAI Chat Completions（兼容性最…`），原生下拉本身也显拥挤；②宽屏下「API 协议 / API Key」两字段并排互相挤压，提示文字被折成两行；必须竖屏兼容、宁可向下扩展也不挤压；③折叠区里 Bearer 头的复选框被全局 `input { width:100%; min-height:40px }` 撑成一个灰大方块，与旁边文字极不协调。
- 实现：①`API_TYPES` 标签去掉括号后缀（只留 `OpenAI Chat Completions` 等），兼容性提示下移到字段 hint；原生 select 不会省略号截断，只能从文案长度上解决。②连接区四个字段全部改成 `mm-field-wide` 单列堆叠（含 API 协议），`.mm-form` 列宽下限 200→240px、`.mm-model-grid` 170→200px，窄屏更早退化为单列；`.mm-advanced .mm-check` 允许换行（其它 `.mm-check` 保持 nowrap），Bearer 字段改为整行宽。③新增 `.mm input[type="checkbox"] { flex:none; width/height:14px; min-height:0 }`，删掉只覆盖 `.mm-check input` 的局部规则，之后任何裸复选框都不会再被撑开；Bearer 复选框包进 `<label class="mm-check">` 并带上可见说明文字（原本只有 aria-label，视觉上是个孤立方块）。④模型摘要行的 id/名称改成单行省略号截断并补 `title`（窄屏原本会在单词中间断行，如 `claude-/opus-5`）。
- 验证：用 Playwright + 静态页临时挂在 public/model-manager.js（stub `request`）截图对比：900/420/360px 三档均无横向溢出（`scrollWidth <= innerWidth`）、复选框实测 14×14、模型行保持单行省略；截图用完即删，未入库。全量 `npm test` 303 项：302 通过、1 跳过、0 失败（首次并发跑出现 service.test.js 既有计时断言波动，重跑全绿）。
- 涉及：public/model-manager.js、public/model-manager.css、本日志与 codebase-map 索引。

## 2026-09-13 07:16 UTC 运行中吸底滚动只在用户滚动时暂停
- 原因：用户反馈运行中自动吸底会莫名停下。根因是 `#transcript`/子代理面板的 onscroll 按“距底部 <80px”无条件重算跟随状态：贴底时 `scrollTop = scrollHeight` 产生的滚动事件要等下一帧才派发，而同步追加的工具记录/流式正文已把内容撑高超过 80px，于是被误判成“用户离开了底部”；一旦暂停，用户很难再靠滚到底部追上持续增高的内容。
- 实现：public/app.js 抽出 `atLatest()`/`readFollow()`，跟随状态只由贴底和用户意图决定（滚轮、触摸、键盘、按下滚动条标记 200ms 意图窗口；无意图的向上位移仍视为拖动滚动条），程序跳转、折叠补偿、布局重排引发的滚动事件不再改变状态。新增内容观察器：`#output` 与子代理输出增高就补一次贴底，覆盖图片解码、折叠展开等不经过 `scrollLatest` 的路径；切换会话与重建弹窗时解除观察。
- 涉及文件：public/app.js、tests/app.test.js、tests/autoscroll-ui.py（新增）、README.md、devlog.md、knowledge.md 与 codebase-map 索引。
- 验证：tests/app.test.js 用限位 scrollTop 复现“补发滚动事件 + 内容增高”场景（改回旧规则时该断言必失败）；真实 Chromium（`node tests/conversation-preview.mjs` + `python tests/autoscroll-ui.py`）13 项通过：初始贴底、增高跟随、上滚暂停与不抢位、滚回底部恢复、补发事件不暂停、无脚本错误。全量 `npm test` 301 项：300 通过、1 跳过、0 失败。未调用模型、未重启正式服务。
## 2026-09-13 07:11 UTC 模型与供应商面板：删除移到导航行、重命名后端原子命令、右侧折叠重组
- 原因：用户五点反馈——删除入口在右侧详情里不好找、两段式「点两次」确认易误触也不够清楚、改名完全没有入口（只能删除重建，会丢 modelOverrides）、右侧详情一眼望去字段太多太乱、关键配置被淹没。
- 实现：①新增协议命令 `models.provider.rename {providerId,newProviderId,baseFingerprint}`（.strict()），`src/model-config.js` 的 `renameProvider` 在乐观锁内整体搬移条目并同步内联 id 字段；前端无法用 save+delete 复现（两命令之间的失败会丢配置、且无独立写 modelOverrides 的命令），故独立成一条原子写。②左侧导航项改 `.mm-nav-row` 行容器 + `.mm-nav-actions`，悬停/键盘聚焦显示铅笔与删除图标（`opacity:0`，触屏常显），删除图标悬停变红；图标路径与会话右键菜单同源（添加 `ICONS`，`createElementNS` 构造，不引第三方图标库）。③删除/改名统一走原生 `<dialog>`+`showModal`（Esc 与焦点陷阱免实现），弹窗挂在 `body` 上，`close` 即移除；确认按钮 `type="button"`，取消不发请求；jsdom 无 `showModal/close`，用 `openModal/closeModal` 垫片。④右侧详情分成「连接 / 模型」两段：连接区只留 `id`（仅草稿）/ Base URL / API 协议 / API Key 四个宽窄分列字段，Bearer 头与自定义请求头收进 `<details class="mm-advanced">`（展开态存 `form.advancedOpen`，顺带修掉旧版展开高级区后新增请求头重渲染就自动折回的 bug）；模型行也改为 `<details>` 折叠摘要行（id + 异名 + 推理/图片徽标 + 脏点 + 删除图标，新建行默认展开，保存成功自动收起），保存按钮仍是 `.mm-model-actions` 第一个按钮。⑤重命名成功后 `rekeyProviderCaches()` 把 `editForms/newRows/modelRows/discover` 从旧 id 搬到新 id，正在编辑但未保存的内容不丢；删除则清缓存并清空选中。⑥弹窗容器样式复用 `style.css` 已有的 `#session-action` 选择器组（新增 `.mm-dialog`），只在本模块 CSS 补宽度与校验提示色，未新增颜色 token。
- 验证：`tests/model-manager.test.js` 重写删除用例为「图标→弹窗→取消不发请求 / 确认才发」并新增重命名用例（非法 id 与重名留在弹窗、id 未变直接关窗、Enter 提交、成功后新 id 入选且未保存草稿跟随）；`tests/model-config.test.js` 新增 `provider.rename` 后端用例（未知/重名拒绝且指纹不变、成功迁移 modelOverrides 与未知字段、旧指纹被拒）。该 worktree 无 `node_modules`，先建 `node_modules` junction 指向 `F:\worktrees\node_modules`（`src/server.js` 按项目内相对路径读 marked/dompurify）后才能跑后端测试。全量 `npm test`：301 通过、1 跳过；唯一失败 `tests/app.test.js` 的时序断言在单独运行时通过（并发负载下的既有 flaky，与本次改动无关）。未在浏览器手测。
- 涉及：src/protocol.js、src/model-config.js、public/model-manager.js、public/model-manager.css、public/style.css、docs/model-config-protocol.md、tests/model-manager.test.js、tests/model-config.test.js、README.md、本日志与 codebase-map 索引。

## 2026-09-13 06:55 UTC SQLite 安装入口的 Node 版本前置检查
- 原因：静态导入 node:sqlite 早于安装脚本的版本检查，旧 Node 先报未知内置模块；安装脚本及 README 存在过时版本/JSON 存储描述。
- 实现：src/database.js 复用原 nodeOk 规则，在同步加载 SQLite 前统一拒绝不支持的 Node；scripts/install.mjs 重导出规则供现有测试使用，移除不可达的重复检查。无需新依赖、启动标志或修改 npm 全局安装命令。install.sh、install.ps1 与 README.md 同步版本及 SQLite 说明。
- 验证：tests/install.test.js 用子进程模拟 Node 20/22.12/23，验证安装、守护、直接启动三入口在加载 SQLite 前提示升级；安装/数据库 11 项通过。两次全量并发运行出现不同的既有时序断言失败（service/app），服务测试单独15项通过；全量串行 node --test --test-concurrency=1 tests/*.test.js 为300通过、1跳过、0失败。未升级全局包或重启当前服务。
- 涉及：src/database.js、scripts/install.mjs、tests/install.test.js、install.sh、install.ps1、README.md、本日志、代码索引及排障知识。
## 2026-09-13 05:12 UTC 摘要列表紧凑化
- 原因：时间行误继承全局 header 的64px高度、24px缩进及底线，设置段落规则又覆盖正文，列表过于稀疏。
- 修改：public/style.css 隔离摘要时间行，时间/轮次靠左同排，正文间距4px、条目上下12px，正文保持13px；README.md 同步说明。不改变排序和摘要生成、不加依赖。
- 验证：tests/summary-compact.test.js 新增样式回归，摘要UI共9项通过。全量282项280通过、1跳过、1服务恢复时序失败；该服务测试文件单独重跑15项全部通过。尚未真实浏览器验收，暂不合并。
- 涉及：上述文件、devlog.md、codebase-map 索引与知识库。
## 2026-09-13 05:54 UTC 性能计量复核与最终口径
- 合入G修正f71e524（9351a7e），主审继续修复：非零退出被合法JSON掩盖、exit早于stdout排空、旧绑定字节遗漏namespace/key、token观察窗口漏message.start；所有子结果close后解析并检查退出码。锁实验victim先连接，holder拿锁后IPC通知写入，排除Node启动耗时，5000ms超时及原门槛不变。
- 数据修正：任务progress按真实单条快照，不在旧侧人为累积数组；通知位每次切换、计时每次递增，排除同值空写；快照加ESM标记，不额外计语法探测开销。finally释放相位监视器，自检数据库关闭。
- 验证：计量self-check6/6、存储/启动硬门槛6/6、两锁实验全过，退出0。05:52UTC大数据绑定字节每次约1.35MB→17–678B；无待通知SDK16→0；fake SDK启动362.5→2ms，首开34.820ms单列。300ms锁等328.3ms成功，6000ms锁等5561.7ms后预期失败。非正式数据，不把绑定字节当磁盘增量、不由WAL推导锁比例，small真实变更两侧p50均约2ms。
- 文档完整重写docs/sqlite-performance.md，旧数字作废，以修正报告为准；README登记基准与历史独立计数回归。涉及tests/sqlite-benchmark.mjs、报告、README、本日志和索引/知识。
- 集成预检发现master已由其他会话合入模型设置改版到8995365（33e7987），需先在功能worktree合并并复测。主仓INDEX/NUL是他人未提交内容，不动；跨进程CAS修复仍由独立任务进行。

## 2026-09-13 05:45 UTC 撤回失败一致性、摘要恢复关联与重试词表
- 已复现：PRAGMA query_only使撤回中的事件删除抛错，SDK已回退但网页历史未裁切，或网页已裁切却丢失撤回回执。修复先同步内存，再经saveChange提交整组短SAVEPOINT；失败通过既有error事件报告、pendingWrites保留整组清理，下次保存/关闭重试，仍把输入交还用户，不跨SDK持SQL事务。
- 复核纠正：此前V01探针强行允许撤回已有完整回答的轮次，绕过真实recallLastMessage限制，不能据此确认“撤回后污染委派”。真正已确认的是崩溃窗口后摘要/触发记录缺entryId；恢复按唯一助手messageTimestamp回填并落库，同毫秒歧义/缺时间保留旧记录，不猜测删除。
- 额外已复现：retry错误词表未传首次主代理、sessionData.selection未保存；补两处传递，重启主代理与子代理保持原词表。跨进程配置丢更新修复另由独立worktree处理，不持事务跨await。
- 验证：tests/recall.test.js、session-memory.test.js、session-persistence.test.js三个新增用例先红后绿；38项定向全过，全量327项：325通过、0失败、2平台跳过。撤回用真实recallLastMessage+SDK树桩，另注入清理后半段失败证明整组回退后可重试，未降低断言。
- 涉及：src/sessions.js、上述测试、README.md、devlog.md、docs/sqlite-refactor-plan.md、codebase-map知识与索引。正式服务、正式库仍未触碰；性能基准修正待最终复跑，不引用旧精确数字。

## 2026-09-13 主审接管跨进程并发修复
- 修正074d30c：pi-model-storage复用传入Database，不再按home硬编码另开连接；原文捕获解析固定脱敏错误。配置/凭据异步校验结束后单条SQL CAS，无事务跨await。收藏沿用明确冲突拒绝的CAS，避免额外事务接口与自动重放。
- tests/helpers/model-concurrency-child.mjs改为捕获旧权威后停在CAS前（凭据停在fn内），父进程完成写入才放行；移除20/200ms sleep与8轮概率试验。结果等待close并检查退出码，异常finally终止子进程后才关闭数据库/删目录。
- 增加非默认数据库文件名与配置/收藏/凭据三类坏JSON脱敏检查；修正派生文件注释，不承诺跨进程SDK实时同步。涉及两个产品文件、两个测试、helper、README、索引及知识库。
- 验证：定向28/28通过，全量328项：326通过、0失败、2平台跳过。尚未合入集成分支，未触碰正式服务/数据库。


## 2026-09-13 05:32 UTC 历史恢复索引与取消失败边界
- 已复现：256条消息、256条重试使旧恢复逻辑读取消息65,664次；ID匹配已线性但后续retry逐条map/filter/slice，compaction逐条find仍为平方扫描。取消恰好正在恢复且SDK失败的会话会连带抛加载错误，虽无运行任务可取消。
- 修复：src/sessions.js 按代理一次构建单调时间线与锚点，重试二分查询；同毫秒歧义、时间倒退、缺失时间、排队输入规则保持，压缩按ID对账。cancel等待失败加载后继续原有未加载直接返回语义，不重建SDK、不删记录。
- 验证：tests/session-flow.test.js getter计数回归先红后绿，不依赖耗时阈值；tests/session-persistence.test.js 取消加载失败先红后绿。会话流程/保存/撤回/摘要30项全部通过；全量324项：322通过、0失败、2平台跳过，git diff --check通过。最终只读复核继续收口。
- 基准：集成0582534/05bad78，但主审发现分位数未排序、SQL字节双计/混入读参数、事件循环采样未tick与部分静态门槛，旧报告精确数字暂不采信；独立任务修正计量与失败出口后重跑，不降低门槛。历史非平方硬门槛由上述getter测试承担。
- 文档：README同步元数据启动/按需恢复/历史索引、基准入口；清除默认配置仍原子替换JSON和无守护/自启的过期描述。涉及上述源/测试、README.md、devlog.md、codebase-map脚本/索引/知识；正式服务和正式库仍未触碰。

## 2026-09-13 UTC SQLite 存储修正：remote/config 去双重编码 + 维护记录假错误/无界 phases 修复
- 原因：通用 Database 已对 value 做 JSON 序列化，remote/config 旧代码预 stringify 导致双重编码（库中存的是带引号的 JSON string）；maint persist 把上一次落库失败留下的 persistenceError 随下一次快照一起固化进库，重启后显示假错误；phases 只在 `phase()` 入口限长，restore 与 workerReady 追加不截尾，历史脏数据可无界放大。
- 实现：`src/remote.js` 不再预 stringify（set 直接传对象）；parseConfig 兼容旧 string 与新 object（其他类型同样 fail closed），命中旧 string 且解析成功时一次读取即迁移成 object，坏结构不迁移、回退默认禁用，鉴权逻辑未动；`scripts/maint-state.mjs` persist 先 `delete data.persistenceError` 再存，失败时错误只留内存（下次成功自愈），restore 读入即丢弃残留 persistenceError（历史库已固化的也不显示），追加阶段收敛到唯一 `pushPhase()` 入口（超限从头部裁剪），restore 超长残留先截尾再补 boot，非数组 phases 防御性置空。
- 涉及：src/remote.js、scripts/maint-state.mjs、tests/remote.test.js（fakeDatabase 对齐真实 Database 同步 JSON 语义；新增旧 string 迁移与坏 object fail closed 用例）、tests/service-settings.test.js（新增 persist 假错误/重启/phases 有界用例）、README.md（修正 remote.json/service-state JSON 的过时存储描述）、本日志。
- 验证：remote 12/12、service-settings 9/9；全量 `npm test` 283 项 282 通过、0 失败、1 跳过（service.test.js「rebuild cancels swap」为既有时序抖动，master 未含本改动时 6 跑 4 挂，单独复跑通过）。检查两个测试文件无真实密钥：仅 user@example.com、hunter2、tokensecret 等显式虚构值，端点均为本地 mock/临时目录。
- 边界：未改 database/main/server/service.mjs；依赖经 junction 指向 F:/Axiom/node_modules，未安装、未修改共享依赖。

## 2026-09-13 04:45 UTC SQLite 拆表主接线（实施中，尚未全量验收）
- 决策：按用户要求直接实施五表，不加双写、旧版兼容、反向迁移或专用 Worker；一致性备份、逐会话事务、幂等标记与字段对账仍是数据安全底线。
- 主接线：`src/sessions.js` 改按实体增量保存，失败增量留待下一次写入/关闭重试，多实体变更使用同步 SAVEPOINT；启动仅读元数据、待通知会话串行恢复，首次打开以 Promise 去重。改标题/删除未打开会话不创建 SDK；缺 JSONL 记录仍可见但拒绝空历史覆盖。撤回同步清理摘要与事件；消息匹配改为 ID Map 与单调游标。
- 并发与页面：`src/server.js` 等待恢复再 attach，慢旧请求不覆盖新订阅，加载中阻止维护；`public/model-manager.js` 区分已保存与已应用，重试当前配置不重放写操作，复用现有 Linear 提示组件，不改样式 token。
- 涉及：上述源文件、会话/通知/迁移/模型页面/服务测试，`README.md`、`docs/sqlite-refactor-plan.md`。事件生产包 `521b5dc` 已集成；数据库/模型/配置子包仍待交付。
- 已运行：模型页面12项、服务API3项、任务模块4项通过，语法检查与 `git diff --check` 通过。会话集成测试仍因存储包缺 `src/session-store.js` 阻塞；不能把新增未运行用例当作验收。未启动正式数据迁移或重启正式服务。

## 2026-09-12 19:37 UTC 文件/文件夹搜索与 @ 补全：名称模糊匹配 + 工作空间递归
- 原因：输入框上沿「＋」与 `@` 补全都只能在当前目录里按子串过滤名称，工作空间根目录只有 `public/` 这类目录名，输入 `@app` 或 `@apjs` 根本匹配不到 `public/app.js`，用户反馈「艾特的时候输入无法匹配」。
- 实现：`src/sessions.js` 新增 `fuzzyHit()`（忽略大小写、字符按顺序出现即命中）与 `matchRank()`（完全相等 → 前缀 → 子串越靠前越好 → 子序列），`listFiles()` 在 `query` 非空时改走 BFS 递归搜索 `searchEntries()`：只匹配名称、不回读文件、跳过 `.git`/`node_modules`/符号链接，按匹配质量排序后一次返回（`nextOffset: null`），递归目录数封顶 400、单目录不可读只跳过；无搜索词时保持原目录优先排序 + 分页（每页 200）。`browse()`/`workspace.browse` 增加 `query` 参数（`protocol.js` 同步为 `query: z.string().max(200).default("")`），`app.js` 的 `@` 补全把最后一段作为 `query` 发给服务端，技能搜索（＋ 菜单与 `/` 补全）同样改为名称模糊、说明仍按子串。`file-picker.js` 搜索命中行右侧显示所在相对目录，避免深浅目录同名文件无法区分。
- 涉及：src/{sessions,server,protocol}.js、public/{app,file-picker}.js、public/file-picker.css、tests/{session-flow,workspace-picker,app}.test.js、README.md、本日志与 codebase-map 索引。
- 验证：session-flow / workspace-picker 改为断言递归 + 模糊 + 不分页（`query: "appjs"` 命中 `src/deep/nested-app.js`），app.test.js 新增 `@app` 命中根目录没有的 `src/app.js` 的回归用例；worktree 全量 `npm test` 258 项：257 通过、1 跳过、0 失败。直连 `Sessions.browse()` 在真实 Axiom 工作空间实测：`@app` 38ms 4 命中、`@apjs` 7ms、`@sessionMjs` 6ms，均按匹配质量把 `public/app.js`、`src/session-memory.js` 排在前。
## 2026-09-12 手机阅读优先（桌面布局不变）
- 原因：手机输入区和多层吸顶遮挡正文；用户要求信息最大化、单行输入、双数值状态及统一展开入口，不能影响桌面。
- 修改：≤700px 默认折叠顶栏/模型/上下文工具/任务快捷列表；保留发送与安全操作、附件和错误。输入一行起步，限制自动增高与底栏最大占比；状态仅两个百分比，去操作指引与详情吸顶，跳转不浮遮。沿用 Linear token，不加依赖。
- 涉及：public/{index.html,app.js,style.css}、tests/mobile-reading-ui.py、README.md、devlog.md、codebase-map 索引与知识库。
- 复核决策：保留用户指定的统一展开入口（切会话先展开），转屏不重置展开选择；`:has()` 沿用项目既有现代浏览器要求，旧内核仍可通过展开移除引用。独立只读复核未发现桌面隔离问题。
- 验证：Chromium 390×844、320×568、390×420、667×375；展开/收起、长输入和队列、页面无横向溢出；1440px 修改前后计算样式与坐标一致。npm test 258 项，257 通过、1 跳过。短视口非真实软键盘验收，未重启使用中的正式服务。

## 2026-09-12 任务计时器（输入框「+」行最右端）
- 原因：需要直观看到当前任务进行了多久；口径必须与侧栏绿点一致，停止后重新输入要继续累计而不是清零。
- 实现：后端在 `session.state` / `task.state` 事件里按「会话执行中」累计 `elapsedMs`（进入 running 开表、离开结算），随会话 JSON 落盘，事件回执与 `sessions.list` 带 `elapsedMs` / `runningSince`；前端每秒重算并渲染，停止后定格。取消/关闭空闲会话也会发 cancelling，因此以 running 而非「非 idle」开表。绿点口径抽成 `pointStatus()`，`sessions.list` 与事件回执共用，计时与侧栏绿点永远同源。
- 参考成熟实现：[OpenAI Codex 状态行](https://github.com/openai/codex) 的 pause/resume 计时与 `59s` / `1m 00s` / `1h 02m 03s` 紧凑格式；Claude Code 的「减少动态效果不应冻结计时」教训；`font-variant-numeric: tabular-nums` 防每秒跳动。不引入前端框架或额外依赖。
- 涉及：src/sessions.js、public/{index.html,app.js,style.css}、tests/{task-timer,app}.test.js、README.md、本日志与 codebase-map 索引。
- 验证：tests/task-timer.test.js 覆盖开表、结算、续跑累计、落盘恢复；tests/app.test.js 页面用例覆盖「无记录不占位、运行中累计、停止后定格、再次执行继续累加」。worktree 全量 `npm test` 256 项：255 通过、1 跳过、0 失败。Chromium 静态预览核对运行/停止两态配色、脉冲动画、`tabular-nums`、与「+」同排且右对齐、390px 无溢出（非真实会话端到端验收）。

## 2026-09-12 18:10 UTC 设置页签切换高度稳定
- 原因：设置弹窗随内容长度改变高度，居中布局导致切换分类上下跳动。
- 修复：固定 80dvh 高度，头部不收缩，分类与正文区域内部滚动并预留滚动条宽度；仅使用 CSS，保留 Linear surface/line/accent token，不影响其他弹窗。
- 涉及：public/style.css、tests/service-settings-ui.py、README.md、本日志与 codebase-map 索引/知识库。
- 验证：隔离 Chromium 1440×900、390×900、320×900、844×390，四页签往返高度与位置一致、上下各 10%、长内容可滚动且关闭栏固定、Esc 可关闭；npm test 252 项：251 通过、1 跳过、0 失败。

## 2026-09-12 统一摘要规则与复盘基础
- 按用户原文固定共同系统提示词，主代理额外要求delegate时摘要；不添加首次范围或行动意图。每3/6累计turn动态提醒，摘要正文严格小于30字，环境变量可调间隔和长度，默认不加配置UI。
- 新增summaryTriggers保存触发规则、实际提示词、轮次、回复关联与缺失/超长/失败状态；代理重启后未完成触发标记interrupted，供未来复盘，不额外模型调用。
- 涉及 src/{memory-policy,capabilities,pi,session-memory,sessions}.js、tests/{memory-policy,pi-memory,session-memory}.test.js、README.md与索引。合并最新master时保留双方知识/开发记录，索引重建；主代理接管修正字数配置（可显式设30/40，提示词上限同步），委派附加句严格采用用户原文，补“此内容进入工作记忆。”。最终隔离全量252项：251通过、0失败、1跳过。

## 2026-09-12 摘要标签统一
- 按用户确认改为 `<axiom_summary>`，主代理摘要与子代理进度按身份登记；兼容旧标签读取。删除子代理系统提示词中的轮次要求，仅代码计数后在请求末尾提醒，要求闭合标签后无正文。
- 涉及 src/{capabilities,pi,session-memory}.js、public/memory-tags.js、tests/{memory-tags,pi-memory}.test.js、README.md；合并master及最终验证仍进行中。

## 2026-09-12 15:22 UTC 会话标题与轻量工作记忆
- 原因：委派缺少主会话背景，主代理无法被动了解子任务方向；采用随回复输出标签，避免新增标题/总结模型调用。
- 决策：助手 message_end 先登记摘要，delegate 再冻结最近32条；turn_end 关联工具状态；子代理每5轮在下次 context 提醒汇报，主代理仅在正常 context 附带最新进度。标题只请求一次，手动改名优先。
- 存储：沿用 JSON 异步持久化；保存模型自报摘要、累计轮次、时间、消息关联和进度送达记录，不替代 Pi JSONL，不引入 SQLite 调度或轮询工具。
- 涉及：src/{pi,capabilities,sessions,tasks,session-memory}.js、public/{memory-tags,app,stream-renderer}.js、public/{index.html,style.css}、相关 memory 测试、README、codebase-map。
- 复核修正：撤回主代理消息时清理关联摘要，避免继续委派旧背景；消息时间戳缺失时不关联 entryId；进度送达诊断仅保留最近50次且8000字符预算包含包装；更新旧测试 mock，配置不再混入 memory 回调。涉及 src/{sessions,session-memory}.js、tests/{session-memory,config,compaction-config}.test.js；增加隔离浏览器预览 tests/memory-preview.mjs。
- UI复核：轮次改为后端一致的1起算；标签提取跳过空/超长标题后取首个合法值。1440/390/320px隔离预览的摘要列表、无横向溢出、Esc关闭通过。
- 最终修正：memory.context() 移至每次 SDK context 事件，工具连续轮可收到新进度；子代理累计满5轮后下一次请求提醒一次，标题独立消费一次。真实SDK+本地fake SSE覆盖工具前登记、连续轮进度、一次性标题、子代理第6轮提醒，未增加请求。
- 最终验证：隔离副本 F:/worktrees/verify-session-memory-final 执行 npm ci（0漏洞）及 npm test：245项，244通过、0失败、1跳过。共享node_modules随后出现缺包（@asamuzakjp/css-color等），原因未查明，未修补或重启运行实例；三种屏宽浏览器检查已通过。

## 2026-09-12 17:45 UTC Stop 方块改为红色
- 原因：按用户截图要求，仅将 Stop 右侧白色方块改为红色。
- 修改：方块单独包裹 span，复用现有 --danger（#f2a6a6），保留文字、边框及停止行为；装饰图标对读屏隐藏。
- 涉及：public/index.html、public/style.css、tests/app.test.js、README.md、本日志及自动生成的代码索引。
- 验证：同步远端 master 后 npm test 共 227 项，226 通过、1 原有跳过、0 失败；git diff --check 通过。

## 2026-09-12 10:45 -07:00 摘要展示元数据改用末尾标签
- 原因：用户指定 axiom_compact_title、axiom_compact_desc，避免自然语言输出使用 JSON 转义。
- 修改：摘要提示词要求完整交接正文后追加两个标签；只提取末尾完整有效的标签，校验非空和长度，异常保留全文。内部 progress 存储和前端 01/02 编号不变，不新增模型调用。
- 文件：src/compaction.js、tests/compaction.test.js、README.md、devlog.md、.pi/skills/codebase-map/INDEX.md。
- 验证：npm test 共 227 项，226 通过、1 跳过、0 失败；覆盖多行/CRLF、标签缺失、空内容、超长、嵌套、非末尾及旧 JSON 原文回退。git diff --check 通过；未调用真实模型，未重启服务。

## 2026-09-12 09:15 -07:00 摘要增量进度展示
- 原因：用户希望连续摘要按 01、02 展示为可读进度，而不是反复展示累计历史。
- 决策：同次摘要请求额外输出中文增量标题与描述，程序按记录顺序编号；完整交接摘要仍累计，展示数据存入压缩 details，重启恢复。格式异常保留完整原文并回退默认展示，不新增依赖或模型请求。
- 文件：src/compaction.js、src/pi.js、public/app.js、tests/compaction.test.js、tests/compaction-config.test.js、tests/compaction-ui.test.js、README.md 及代码索引。复用现有 Linear 摘要卡片样式，无新增视觉 token。
- 验证：后台相关 22 项通过；全量 227 项中 226 通过、1 跳过、0 失败，git diff --check 通过。覆盖增量格式解析/回退、元数据落盘恢复、序号实时/快照一致与展示文本安全；未调用真实模型或运行真实浏览器验收。

## 2026-09-12 主代理接管服务维护收敛
- 原因：子代理测试覆盖了理想流程，却把控制管道绕过任务检查及共享依赖覆盖当作预期；暂停子代理编辑，由主代理统一修复。
- 修改：HTTP 停止拒绝不再回落管道，管道仅停止无 worker 的守护；更新依赖随新包私有部署，备份含完整旧依赖；构建失败恢复依赖；未就绪实例必须确认退出后才能回滚/拉起，增加重复 worker 防线；健康探测同步更新 ready，退出清除 ready。
- 涉及：scripts/service.mjs、tests/{service,service-settings}.test.js、README.md、本日志与代码索引。守护测试增至 15 项，补构建失败回退与启动超时回退；前端 HTTP 测试清理前 flush，删除重复且过时的 scripts/maintenance-contract.md，统一维护 docs/service-maintenance.md。
- 验证：复制源码到独立临时目录 npm ci，SDK 导入成功；全量 224 项，223 通过、1 原有跳过、0 失败。真实服务使用随机端口 52226 与临时数据目录：WS 回执 operationId → 独立维护状态 succeeded → 新实例健康身份一致 → CLI 优雅退出，全部通过；1440/390/320px 浏览器检查通过。4319/4320 的运行实例未改动。
- 最终复核：维护状态按调用时快照串行落盘，持久化失败通过状态接口和面板明确告警；补齐真实阶段中文名称、无维护操作时的崩溃终态展示。再次全量 223 通过、1 跳过，三种屏幕尺寸通过，git diff --check 无错误。沿用 Linear surface-1/hairline 与现有按钮，没有新样式依赖。
- 环境：在用 worktree 的 Pi SDK dist 缺失已独立确认，但缺失原因未查明；没有原地修依赖或重启，避免中断已有会话。隔离安装正常，不能将当前进程仍健康视为下次可启动。部署需先确认任务空闲。

## 2026-09-12 10:50 UTC 服务设置与可观测维护（实施中）
- 原因：4320 开发 worker 因 Pi SDK 的 dist 缺失反复崩溃；旧服务菜单把接收请求、启动进程与真正就绪混为一谈，刷新后无维护证据。
- 决策：在独立 worktree 恢复开发依赖；复用守护进程提供本机鉴权维护接口、持久化真实阶段与最近结果；入口迁入「设置 → 服务与更新」，不公开源码路径，远程连接不授予维护权限。更新先检查固定提交再确认，失败不能冒充成功。
- 涉及：scripts/service.mjs、scripts/maint-*.mjs、src/{main,server,protocol}.js、public/{app,service-settings}.js、public/{index.html,style.css}、相关 API/UI/守护测试、README.md、docs/service-maintenance.md 和 codebase-map。
- 复核：维护准备期允许新 WebSocket 读取 service.status，实际 close 才拒绝新连接，避免刷新丢失维护入口；鉴权与维护写锁保持不变。
- 进度：本机权限/CSP/活动任务保护及远程隔离 12 项通过；1440/390/320px 服务设置浏览器检查通过。守护流程与故障恢复仍在集成验证，未宣称全量通过。当前轮不重启有活动会话的 4320，不触碰 4319 正式服务。
## 2026-09-12 会话导入修复发布 0.1.6
- 按用户要求合并 master 并发布；package.json/package-lock.json 同步升至 0.1.6，README 发布说明沿用 master SHA 更新流程。
- 发布前全量测试；保留主仓库已有未提交索引，不混入本次提交。不强制重启其他 worktree 的开发预览服务。

## 2026-09-12 05:25 导入会话归属当前工作空间
- 原因：导入虽然复制 JSONL，却使用源头 cwd，导致跳回原目录，未满足独立副本在目标空间正常续聊的预期。
- 修改：前端传当前 cwd；协议与服务转发目标目录，省略时使用实例默认值并复用目录校验；副本头部更新 ID/cwd，历史条目保持不变，源文件只读。沿用普通会话保存、恢复、重命名和删除，不复制项目文件，不改历史绝对路径。
- 验证：npm test 209 项，208 通过、1 跳过；新增目标归属、头部身份、历史不变、重命名/重启恢复/删除不改源文件、默认目标与无效目标检查，前端验证不另开源目录。
- 涉及：src/sessions.js、src/protocol.js、src/server.js、public/app.js、tests/session-flow.test.js、tests/app.test.js、README.md、本日志及 codebase-map 索引/知识库。

## 2026-09-12 03:45 左侧会话列表与复制菜单重构
- 需求：执行中/待继续合并为「进行中」；已完成默认折叠并固定在设置上方；复制目录、文件名、完整路径收进右侧二级菜单。
- 决策：复用原生 details / Popover 与既有 Linear surface、raised、line、accent token，沿用创建时间倒序及日期分隔，不新增依赖。完成标记不影响运行，展开状态仅在当前页面保留；复制对象是 JSONL 源文件，目录保留末尾分隔符以兼容盘符根目录、POSIX 根目录与 UNC。
- 修复：controls 不再禁用断线时可本地执行的复制/完成标记；列表比较纳入 sessionFile，避免文件刚落盘后复制菜单仍使用旧空路径。
- 验证：npm test 208 项，207 通过、0 失败、1 原有跳过；Chromium 1440/320 宽度验证底部折叠、右侧菜单/窄屏避让、Esc 逐级关闭与焦点、外部点击、长列表滚动及设置不被挤出。新增 Windows/UNC/POSIX 复制、未落盘、剪贴板失败、断线、路径更新回归检查。
- 涉及：public/app.js、public/style.css、tests/app.test.js、tests/session-sidebar-ui.py、README.md、本日志与 codebase-map 知识/生成索引。

## 2026-09-12 重试时间线完整边界修复
- 原因：上一轮未覆盖排队消息时间与消费时间区别、撤回后的计数失效、压缩与主/子代理归属；无法定位的历史仍追加末尾。
- 修改：后端统一恢复/维护首次重试边界及关联消息 ID，撤回同步维护重试记录；前端按关联 ID 将已压缩重试归档到摘要，未知位置使用顶部独立折叠区，迟到子代理元信息不污染主时间线。
- 设计：复用 Linear 既有 compaction-card/retry-card、surface-1 与 hairline、原生 details 键盘操作，无新增样式或依赖。不凭编写时间猜队列消费顺序，不删除无法确认位置的旧记录。
- 涉及：src/sessions.js、public/app.js、tests/session-flow.test.js、tests/recall.test.js、tests/message-activity.test.js、README.md、本日志和 codebase-map 坑库/索引；验证：npm test 共 208 项，207 通过、0 失败、1 项原有跳过；Chromium 实测 46 项通过（定位、恢复折叠、未知归档、压缩及连续刷新），无控制台错误。最终复核移除“最后失败助手”猜测，无消费时间的排队输入保持未知；撤回保留独立子任务输出，并重映射混合消息边界。

## 2026-09-12 项目独立：包名 @cosyeezz/axiom，弃用旧发布方式
- 决策：按用户要求 Axiom 独立，去除与主工作区的现行从属关系；旧的子目录镜像发布方式不再使用，master 直接推送公开仓库。npm 包名定为 `@cosyeezz/axiom`，macOS 登录自启 Label 改为 `com.cosyeezz.axiom`。不改写 Git 历史，不删除另一仓库及其未提交改动；历史条目仅以中性表述（主工作区、旧发布方式）去除旧名称与具体路径，事件事实不变。
- 文档：README 发布流程改为独立功能 worktree 验证 → 提交 push → 合并 master 推送发布；卸载说明按本机实际安装 package.json 的 name 确定包名，不保留旧名称字面量；新增「从旧包名迁移」一节：更名不支持原地自动迁移，旧版本先安全停止、取消自启、卸载旧包，再安装 github:cosyeezz/axiom 并 axiom-setup，~/.axiom 与 ~/.pi 保留，新旧服务不可同时运行。AGENTS 示例改用 Axiom。版本升至 0.1.5，更新与卸载核对新包目录，预览使用当前工作空间。
- 本机配置：worktree `.env.local`（gitignore，不入库）已复制原配置并移除旧 AXIOM_CWD（改为注释），合并后部署回主源码目录并保留其他设置；在此记录该被忽略的本机配置修正，便于追溯。
- 验证：合入最新 master 的卸载 CLI 循环等待及重试时间线修复后，npm test 199 项，198 通过、1 原有跳过、0 失败；npm pack --dry-run 核对独立包名且不含本机 .env.local；当前源码与文档的旧项目名称引用清零。
- 涉及：README.md、devlog.md、AGENTS.md、package.json、package-lock.json、scripts/{service,uninstall,autostart}.mjs、tests/{service,uninstall,autostart}.test.js、tests/conversation-preview.mjs、代码索引及本机 .env.local。

## 2026-09-12 09:42 UTC 旧重试卡时间线迁移
- 原因：新记录已有 messageCount，但旧记录恢复仍固定追加末尾，成功状态更新不会纠正旧位置。
- 决策：src/sessions.js 在恢复时用首次 nextRetryAt-delayMs 和同代理消息 timestamp 找边界，仅接受完整、单调且边界不重时的时间线；补齐 messageCount 后随现有 persist 落盘，已有位置不覆盖，缺证据继续回退。不改重试策略、消息正文或 Linear 卡片样式，无新增依赖。
- 涉及：src/sessions.js、tests/session-flow.test.js、tests/message-activity.test.js、README.md、本日志及 codebase-map 坑库/生成索引。
- 验证：合入最新 origin/master 后 npm test 198 项，197 通过、0 失败、1 既有跳过。新增旧记录迁移与连续两次服务关闭/恢复检查；前端多次快照与分组绘制验证卡片始终在恢复回答之前；另覆盖主/子隔离、已存边界优先、时间缺失/倒退/同毫秒不猜位置。

## 2026-09-12 02:15 执行过程合组收尾与上下跳转
- 原因：回答前 thinking 独立建组，与紧邻工具组形成连续 Completed；旧测试把思考位置锁在消息内部，且遗漏历史恢复。
- 修改：public/app.js 复用前段工具组并保留 thinking 在正文之前，识别移出的 thinking 记录；public/index.html、public/style.css 增加顶部最早/底部最新按钮，沿用现有 secondary 样式与 8px 间距。
- 验证：tests/activity-groups-ui.py 用 Chromium 覆盖连续三次调用、用量不拆组、手动展开、失败行、手机元信息、上下跳转、真实 attach 与 reload；tests/app.test.js 更新思考查询以允许跨消息合组。README.md 同步说明，坑库追加根因；索引重建但不纳入本次提交。
- 集成：先合并最新 origin/master，保留其 Agent 结束/停止状态修复，不恢复旧版无限 Working；功能分支验证后合并 master 并普通推送。

## 2026-09-12 通用字符图入口与原文回退
- 决策：字符图无统一语法，不强行推断语义；复用 ASCII 表格与字符网格，以结构信号识别 ASCII 框、树、箭头和完整 Unicode 制表线范围，未知保持原文并支持手动优化。
- 内容：纯文本语言统一大小写归一、增加 diagram/tree；表格和字符网格共用优化/原文切换，复制保持源内容；Tab 按字素列宽推进至 8 格位置，超长网格禁用并说明原因。JSON 控件不变。
- 文件：public/markdown.js、public/style.css、tests/markdown.test.js、tests/text-diagram-ui.py、README.md、本日志和代码索引/坑库。复用现有 --mono、颜色及工具栏按钮，不新增依赖。
- 验证：单测覆盖框/树/箭头/混合文本、手动回退、表格双向切换与 Tab 保真；Playwright 验证桌面/手机切换与 Tab 实际坐标。

## 2026-09-12 字符示意图网格排版
- 原因：并排菜单框不是表格，上一轮转换不覆盖；中文、图标的字体回退字宽不符合字符图的网格。
- 修改：public/markdown.js 识别纯文本 Unicode 制表线图，Intl.Segmenter 保留字素，CSS 单/双格固定宽度；保留原文和复制，不猜测语义或修复源空格。20K 字符上限避免逐字 DOM 放大。public/style.css 复用现有 --mono 和颜色，正常字重、零字距。
- 文件：上述两文件、tests/markdown.test.js、tests/text-diagram-ui.py、README.md、devlog.md 与 codebase-map 索引/脚本/坑库。
- 验证：Playwright Chromium 实测 1440/320px 单双宽网格、页面无横向溢出与键盘滚动入口；单测覆盖组合字符、emoji、注入、原文复制与大内容回退。

## 2026-09-12 首次安装允许后配模型，并自动补装 Pi
- 原因：新电脑尚无模型凭据时 createPiFactory 直接退出，用户无法进入网页配置；安装脚本也未补装 Pi CLI。
- 决策：服务启动与模型可用性分离，建会话时才校验，每次从最新模型目录选择；显式无效模型仍拒绝，不悄悄替换。网页无模型时保持连接并复用现有「模型与供应商」设置，配置后可新建会话，不新增向导或样式。
- 安装检查 Pi CLI，缺失则 npm 全局安装最新版，已有不强制升级，安装失败中止。卸载沿用停止/取消自启/npm uninstall 三步，README 说明实际包名与保留数据，不额外删除共用 Pi。
- 涉及：src/pi.js、public/app.js、scripts/install.mjs、tests/model-onboarding.test.js、tests/install.test.js、前端回归测试、README.md、codebase-map 索引与坑库。复用既有 Linear 暗色面板和焦点样式，无新增依赖。
- 验证：真实 Pi SDK 在独立临时目录、空凭据环境启动，写入测试模型后刷新目录并创建会话；不调用真实模型、不修改用户凭据。最终全量结果见交付说明。
## 2026-09-12 00:52 ASCII 表格与 JSON 展示
- 原因：中英文混排的字符表格边框错位；用户需要会话 JSON 的格式化、压缩、去转义、转义和复制当前结果。
- 内容：共享 Markdown 渲染器识别完整 ASCII 表格并复用原生表格滚动样式、复制仍保留原文；JSON 使用原生 JSON.parse/stringify、本地操作与错误状态，不增加依赖。单元格和转换结果只用 textContent；未知/残缺 ASCII 保持代码，超安全整数拒绝重写。
- 样式：复用既有 --line/--surface/--muted token、8px 圆角与 4px 操作间距，窄屏工具栏换行。
- 涉及：public/markdown.js、public/style.css、tests/markdown.test.js、README.md、本日志与 .pi/skills/codebase-map/{INDEX,knowledge}.md。
- 验证：共享 Markdown 回归覆盖转换、原文复制、当前 JSON 复制、失败保留和 HTML 注入防护；npm test 184 项：183 通过、1 原有跳过，git diff --check 通过；未做真实浏览器视觉验收。

## 2026-09-11 修复 Tailscale 普通设备被拒绝
- 实机只读检查 status/whois：个人设备正常省略 Tags，旧 whoisUser 却要求数组，误将同账号设备当作 tag 设备拒绝。
- src/remote.js 允许省略 Tags，仍拒绝真实标签、非法类型、缺失 Node/用户和不同登录名；tests/remote.test.js 的所有普通设备 mock 改为真实省略形态，覆盖 HTTP/WS 全链路。README 与坑库、索引同步。
- 未替用户开启远程访问或中断正在运行的会话；修复部署后需重启 Axiom 进程。

## 2026-09-11 Tailscale 同账号远程控制

- 内容：设置左侧默认新会话设置下新增远程控制；自动读取本机 Tailscale 登录名，显式开启后仅允许同账号设备访问。电脑本机继续走 loopback，远程可正常操作会话，但远程访问配置和登录操作仅允许本机管理。
- 原因与决策：手机在 Wi-Fi/流量之间切换无需维护两套 IP 白名单；使用本机 Tailscale CLI 的 whois 验证真实连接身份，不信客户端邮箱/代理身份头，不保存密码，不开放公网或整个局域网。单独绑定 Tailscale 地址，不要求 Serve/Funnel。默认关闭，账号变更与关闭后撤销旧连接。
- 涉及文件：`src/remote.js`、`src/server.js`、`src/main.js`、`src/protocol.js`、`public/app.js`、`public/index.html`、`public/style.css`、`tests/remote.test.js`、`tests/remote-ui.test.js`、`README.md` 与代码索引技能。设置复用 Linear 的 #0f1011 面板、#23252a 边框、#5e6ad2 操作强调及系统字体，不新增依赖。
- 最终验证：`npm test` 184 项，183 通过、0 失败、1 原有跳过；`python tests/remote-ui.py` 的 1440/390/320px 全通过。远程验证使用模拟身份，未进行真实手机连通或真实登录操作。
- 联调：同步模型供应商设置的新导航；修正远程 active/online 状态区分、切换本机账号后只读邮箱刷新、登录授权部分回执合并及在途 WS 撤权检查。新建 `tests/remote-ui.py` 覆盖 1440/390/320px。
- 验证边界：使用模拟 Tailscale 身份与本地 HTTP/WebSocket 验证，不替用户执行真实登录或开启远程监听；实际手机端双设备连通需用户登录后验收。HTTP 由 Tailscale 加密传输，但浏览器非安全上下文，请求 ID 不应依赖 crypto.randomUUID，剪贴板功能可能受限。
## 2026-09-11 — 统一模型收藏与 Pi 模型管理
- 在独立 worktree `../worktrees/Axiom-model-favorites` / `feat/model-favorites` 实现；主仓库未跟踪的用户文件保持不动。
- 调研 Linear Favorites、WAI-ARIA Listbox 与触屏收藏交互。选择项与星标分开，收藏不切换、不关闭，稳定置顶；未收藏悬停/焦点显示，触屏常显。沿用现有 Linear 暗色 token、细边框与蓝紫焦点，黄色仅表达收藏。
- `public/model-picker.js/.css` 与 `public/app.js`：供应商、模型和思考等级统一组件/目录/收藏，覆盖输入区、默认设置、预设、子代理和压缩模型；刷新目录保留当前选择，不能因收藏或刷新隐式保存会话配置。
- `public/model-manager.js/.css`、`public/index.html`：设置侧栏增加「模型与供应商」，集中查看/编辑 Pi 配置，常见模板和自定义 API 地址，密钥留空保留，明确保存/刷新/删除反馈。
- 后端新增模型配置与收藏协议，直接操作 Pi models.json，保留未编辑高级字段，保护凭据、检测外部版本冲突并备份；收藏与 Pi 配置分离，使用 Axiom 全局数据目录。
- `README.md`、codebase-map 架构/索引同步；增加组件、持久化和隔离浏览器验收，测试数据不访问真实模型或用户凭据。验证：完整 npm test 172 项（171 通过、0 失败、1 原有跳过）；隔离 Chromium 验证收藏不改选中、跨页共享、设置导航及 390/320px 无横向溢出，截图位于本地 artifacts/model-selection。

## 2026-09-11 — 中断与重启后的 Working 收尾
- public/app.js：paintCallGroup 原先仅按后续正文 messageFolded 判断运行，末尾没有回答的中断记录在 idle 快照仍转圈。复用 waiting/stopActivity 统一记录各主/子代理输出区实际活动状态；状态控制 Working/Stopped/Completed，不改变正文边界折叠，不在工具间隙提前结束。
- tests/message-activity.test.js 增加实际事件→工具失败→idle→重启快照回归，验证活动结束与展开选择保持；npm test 145 项：144 通过、0 失败、1 跳过。
- README.md 同步行为，复用现有图标/样式，无新依赖。主动中断不自动重放有副作用的命令；继续使用现有消息入口。

## 2026-09-11 — 桌面发布最终验证
- 修正 tests/app.test.js、tests/message-activity.test.js 过时断言：精准选择 thinking-record 而非新增外层 details；按已实现的思考自动展开/结束收起、逐消息模型用量、工具状态规则验证；保留历史思考懒渲染、XSS 与错误状态覆盖。未修改产品行为。
- 最终 npm test：144 项，143 通过、0 失败、1 原有跳过；第二批发布 MSI 再次通过解包/进程/窗口与页面标题验收。两平台安装包 SHA256 检查通过。
- 功能分支提交推送后以 PR 合并 master，发布 desktop-v0.1.0（MSI/DMG/SHA256），清理两个功能 worktree；主工作区未跟踪用户文件保持不动。

## 2026-09-11 — 完成桌面安装包构建与验收
- 用户要求完整交付：继续执行分支 CI，而非停留在配置；两次 macOS Universal / Windows x64 构建成功。第二次运行 https://github.com/cosyeezz/axiom/actions/runs/34639536557 额外通过 hdiutil DMG 校验与 lipo arm64/x86_64 架构校验。
- Windows MSI 管理解包返回 0；启动解包后的 pake-axiom.exe，进程正常、主窗口标题 Axiom，UI Automation 读到 Axiom 页面标题；随后关闭本次启动的窗口，未停止后台服务。当前桌面会话无法截图，未声称完成全部交互验收。
- 打包文件保存到 ../releases/Axiom-desktop-v0.1.0/，生成 SHA256SUMS.txt 并上传 Release 草稿；README.md 增加正式下载地址，codebase-map 架构图与 workflow 首次触发知识同步。安装包未签名/公证，需使用者批准可信应用；不擅自关闭安全机制。

## 2026-09-11 — Pake 独立桌面壳
- 用户确认本体与壳独立：新增 desktop/pake.json，仅连接 http://127.0.0.1:4319，壳版本 0.1.0；复用现有 favicon，允许新窗口与拖放，不改后端或 npm 运行依赖，不附带服务生命周期管理。
- 新增 .github/workflows/desktop.yml：手动触发、固定 pake-cli 3.16.2，Windows x64 MSI 与 macOS Universal DMG，构建结果作为 30 天 Artifact 保存；未配置签名、公证或自动发布。
- README.md 记录安装、分离更新、端口、编译环境与未签名限制；.gitignore 排除本机产物；重建代码索引。
- 验证：npm ci --ignore-scripts 成功；实际 pake-cli --help 确认参数；读取配置后返回 ENV_MISSING（本机无 Rust），未产出安装包。npm test：140 通过、3 失败、1 跳过；在原主工作区只读复跑对应测试，同样复现 app.test.js / message-activity.test.js 三项已有失败，不修改无关断言。因基线不全绿，暂不合并 master，保留功能 worktree 待处理。


## 消息元信息紧凑排版
- public/app.js、public/style.css：供应商、模型、消息记录的 thinkingLevel 用间隔点分开；输入/输出用千分位和 ↑/↓，保留悬停说明与无障碍名称；纯工具消息的统计留在展开区域，不分隔调用组。
- tests/activity-groups-ui.py：Chromium 验证示例数字、级别和 390px 窄屏无横向溢出；README.md 同步。缺失思考级别不使用当前会话设置补写历史。


## 执行过程统一按正文边界结束
- 在独立 worktree `Axiom-activity-text-boundary` 修改 public/app.js：状态和折叠共用 messageFolded；移出正文消息内部的后续工具分组，让下一条工具消息沿用同组，模型用量不再形成视觉隔离。
- README.md 同步行为；tests/activity-groups-ui.py 新增带模型用量的连续工具回归，确认工具结束仍为 Working、分组数不增加；真实 Chromium 验证通过。


## 2026-09-11 — 增加 axiom stop
- CLI 经本机 POST /service/stop 请求优雅停止：拒绝忙碌会话/子任务，IPC 通知守护进程，保存后退出父子进程；命令等待守护退出，超时不强杀，不取消登录自启。
- Host/Origin 防跨站、仅 POST、重复请求拒绝；默认 4319，可用 AXIOM_PORT 指定端口。旧实例缺少停止接口时明确提示，不盲目杀进程。
- 服务相关 9 项通过；全量 138 通过、2 项已有思考渲染失败、1 跳过。未停止本机正式/开发环境。

## 2026-09-11 — 补发本地 master 已合并功能
- 将本地 master 截至 a8016a9 的已提交功能与公开 master 更新修复合并，包含 Working 工具/思考折叠、后续消息边界收起、工作空间标签与会话同步；不包含原工作区未提交改动。
- 修正上次只发布更新修复、遗漏本地 master 功能提交的问题；重建索引。npm test：136 通过、2 项思考渲染相关失败、1 跳过，如实保留测试结果，不修改断言掩盖失败。未部署或重启 4319/4320。

## 2026-09-11 — 更新修复独立合并 master
- 从公开仓库 origin/master 创建独立工作区，仅移入本次更新修复，不带入主工作区其他提交或未提交功能；重建发布版代码索引。
- 发布工作区 npm test：130 通过、0 失败、1 原有跳过；未全局安装或重启正式/开发服务。首次部署后需完整重启守护进程加载新更新逻辑。

## 2026-09-11 — 更新目录错位保护
- scripts/service.mjs 安装前后执行同一 npm 的 root -g，以 realpath 比对目标包与运行根目录；不一致拒绝，防止多 Node/npm 环境中更新别处却把旧目录标记为最新。
- tests/service.test.js 覆盖不同 prefix 安装前拦截、安装后 prefix 变化不写新 SHA，以及目录别名的真实路径核对；相关 9 项通过。未全局安装或重启服务。

## 2026-09-11 — 更新按 master 完整提交，不再依赖版本号
- src/update.js 始终查询 GitHub master SHA；读取安装目录 .axiom-commit，兼容旧 _resolved；无记录/损坏记录必须更新一次。15 秒请求超时，非法 SHA 拒绝执行。
- main 将检查结果 SHA 传给守护进程；service 使用 github:cosyeezz/axiom#完整SHA 全局安装，成功后才记录提交。安装失败尝试重启服务、解除请求锁定并反馈错误。首次部署需完整重启守护进程以加载新版逻辑。
- 验证：更新/守护/服务 API 9 项通过；npm test 137 通过、2 项已有思考内容渲染失败、1 跳过。未实际全局安装、未重启 4319/4320、未推送。

## 2026-09-11 — 预设会话合并发布 0.1.4
- 用户确认合并；功能分支先同步最新 master，保留导入 pi 会话入口、压缩与输入快捷键，文档两侧记录保留，代码索引重建。package.json patch 升至 0.1.4，以便独立仓库更新识别。
- 合并后 npm test：130 项，129 通过、1 原有跳过、0 失败。推送功能分支并合并 master，再按当时的子目录镜像方式同步 cosyeezz/axiom；主工作区未提交改动保留，不重启服务。全局/项目配置分层和工具进度条不在此次预设分支内。

## 2026-09-11 — 侧栏具名预设会话
- 按用户要求将自定义新会话入口改为「预设会话配置」，保存的预设按钮显示在其下方，共享背景框；复用现有主/子模型、能力与压缩表单，支持名称、可选固定目录、编辑、删除、点击启动。
- 后端通过 session.presets.list/save/delete 管理本机 presets.json，严格输入校验与串行原子持久化，不保存信任授权。前端启动先检查目标目录信任，需要时复用确认表单；不自动信任，不按名替换缺失技能。
- 涉及 public/app.js、index.html、style.css、src/sessions.js、server.js、protocol.js、tests/app.test.js、presets.test.js、README 与代码索引。此项不包含全局/项目默认配置分层，也不包含自动 Shell 启动命令。
- 验证：后端持久化/并发/输入校验与前端保存失败、编辑删除、失效能力确认、仅本次信任路径通过；全量 npm test 为 125 项，124 通过、1 原有跳过、0 失败；未重启本机服务，未做 macOS 实机验证。

## 2026-09-11 — 后台压缩增强合并验收
- 用户确认合并 master。功能 worktree 合入最新 master，保留技能恢复及三按 Esc 撤回功能；日志/知识库冲突保留两侧记录，索引按合并后源码重建。
- 验证：npm test 123 通过、1 原有跳过、0 失败。功能分支推送后合并并推送 master；保留主工作区 package-lock.json 和未跟踪文件，不安装依赖、不重启正式服务。

## 2026-09-11 — 后台摘要保留规则、输入区进度与子代理归档
- worktree `axiom-compaction-ux` / `feat/compaction-ux`。保持 Pi SDK 后台生成、安全点应用和滚动更新摘要；显式要求保留仍有效的旧目标、约束、决策、未完成项与准确上下文，不把未再次提及视为失效。提示词降低遗漏风险，不声称无损。
- 输入框上方增加后台压缩真实阶段提示，不虚构百分比；状态按主会话隔离并纳入快照，取消/失败/拒绝应用均有反馈。已压缩的委托任务按真实工具结果 ID 归入对应摘要，保留子代理详情和运行入口定位；多次压缩不再夹杂已归档任务。
- 验证：`npm test` 116 通过、1 原有跳过、0 失败；真实 Chromium 1440/390/320px 摘要分层、任务弹窗、进度位置、旋转和 reduced-motion 通过，无页面/CSP 错误。仓库无 build 脚本，采用现有测试和真实浏览器检查；未调用付费模型，提示词测试仅证明传参及保留规则，不证明摘要语义无损。委托两次被外部服务重启取消，核心代码由主任务直接完成。正式服务未由本任务重启。
- 涉及 `src/{compaction,pi,sessions}.js`、`public/{app.js,index.html,style.css}`、压缩后端/UI 测试、`tests/conversation-preview.mjs`、两级 README/devlog 与 codebase-map 索引/知识库。使用现有依赖，不安装或重装运行实例依赖；保留主工作区原有改动。

## 2026-09-11 — 输入快捷键与自动复制合并验收
- 用户要求合并 master；在 feat/input-shortcuts worktree 先合入最新 origin/master，保留三按 Esc 收回输入与能力恢复修复。README 合并两侧功能说明，devlog/knowledge 保留两侧记录，INDEX 重建解决生成文件冲突；未触碰主工作区 package-lock.json 等用户未提交内容。
- 验证：npm test 119 通过、1 原有跳过；独立 4327 预览下 Chromium 1440/390/320px 检查及真实剪贴板/开关持久化/撤销恢复通过，无浏览器错误。功能分支推送后合并 master 并推送，清理本次 worktree；不主动重启正式服务。

## 2026-09-11 — 选中自动复制与本地开关
- 在 feat/input-shortcuts 独立 worktree 继续实现：聊天输入框、会话正文及子任务详情支持 pointerup/选区相关 keyup 后自动复制非空白选区；不监听连续 selectionchange、不改变焦点/选区，不处理右键、清空快捷键、其他表单与跨区域选区。使用原生 Clipboard API，失败提示右键复制，无新增依赖。
- 按用户追加要求，设置页增加「输入与复制 → 选中自动复制」开启/关闭，默认开启；localStorage 保存当前浏览器偏好，保存受限仍在本页生效并提示，不进入服务端会话配置或断线禁用列表。手机系统手柄事件不保证送到页面，README 明示可用系统复制菜单。
- 涉及 public/app.js、public/index.html、tests/app.test.js、tests/conversation-ui.py、README.md、本日志及生成索引。验证 npm test 112 通过、1 原有跳过；真实 Chromium 剪贴板验证输入框/正文复制、关闭后均不复制、刷新保留关闭及原有撤销清空，1440/390/320px UI 检查通过、无页面错误。正式服务未重启。

## 2026-09-11 01:23 — 输入框撤销与清空快捷键
- 独立 worktree axiom-input-shortcuts / feat/input-shortcuts：聊天输入框 Ctrl+C 全选并调用原生删除，保留 Ctrl+Z 撤销/恢复清空；不影响图片、文件、Skill 附件及任务。不添加自建历史栈或依赖；输入法组合、只读/禁用及空文字不删除。
- 涉及 public/app.js、public/index.html、README.md、tests/conversation-ui.py、本日志及 codebase-map 索引/坑库；页面提示及 README 说明 Ctrl+C 在此处替代复制，右键仍可复制。
- 验证：npm test 112 通过、1 原有跳过；真实 Chromium 原生输入撤销/重做、部分选中后清空、重复清空后撤销恢复、输入法保护通过，1440/390/320px 既有 UI 检查通过、无浏览器错误。首次误连已有 4321 旧预览，改用独立 4327 端口后验证通过；未重启正式服务。

## 2026-09-11 — 技能恢复修复发布 0.1.3
- 用户确认合并与同步独立仓库。package.json 升至 0.1.3，发布跨目录默认能力收窄与逐会话恢复隔离修复；README 已同步恢复规则。
- 在功能 worktree 复验后合并原主仓库 master，并以旧发布方式推送至公开仓库 cosyeezz/axiom master。保留主工作区未提交改动，不重启本机服务，不执行 npm ci。

## 2026-09-11 01:30 — 跨目录能力继承与启动恢复隔离
- 原因：默认/历史能力以绝对路径持久化，跨目录或卸载后与新清单不符；Sessions.load 将单会话失败传播至 main，导致服务退出，macOS/Windows 共用此缺陷。
- src/capabilities.js 增加仅供默认继承/历史恢复使用的收窄选项，保持显式输入严格校验，错误包含具体 ID；src/sessions.js 对主/子选择取交集，保留 null/空集合/inherit 语义，不改写全局默认、不按名称替换或授予信任。load 逐文件隔离恢复失败并保留原文件，警告写服务日志。
- tests/capabilities.test.js、tests/config.test.js 覆盖真实项目技能跨目录、删除技能后恢复、子代理继承、坏 JSON/目录消失隔离、Windows/POSIX 旧 ID 和显式提交拒绝。同步 README.md、codebase-map/knowledge.md 与生成索引；不新增依赖、不修改用户数据。
- 验证：Windows 本机 npm test 114 通过、1 原有跳过、0 失败；git diff --check 通过。macOS 未实机运行，测试同时覆盖 Windows/POSIX 旧路径。

## 2026-09-10 21:52 — 紧凑原名工具行与模块强调
- 功能 worktree feat/conversation-labels。按用户六项反馈将工具/思考行缩至 12px/400、SVG 16px/底座 24px；工具显示原名（仅省略 functions. 前缀，完整名保留 title），powershell/pwsh 复用命令图标。思考/连接/准备调用使用 thinking / thinking... / connecting... / calling...，中文结果状态保留。
- waiting/running 的等待图标隐藏 SVG，使用高低亮度分段 CSS 旋转环；不增加定时器，尊重 reduced-motion。SKILL 与 SUBAGENT 使用描边标识、语义底色和左侧色条，任务状态行允许换行；桌面工具行最小 36px，手机 44px 点击区域不变。缩短消息/角色标题/用量间距，正文 14px、1.8 行高不动，不改安全 Markdown、流式脏块或折叠惰性渲染。
- 涉及 public/{app.js,style.css}、tests/{app.test.js,message-activity.test.js,conversation-preview.mjs,conversation-ui.py}、两级 README.md / devlog.md、codebase-map 索引及 knowledge.md。测试补原始工具名/完整 title/图标映射、Skill badge 和真实浏览器尺寸、键盘与伪元素旋转。
- 验证：npm test 86 通过、1 原有跳过、0 失败；Chromium 1440/390/320px 全部通过，无页面/CSP 错误。相同内容对比桌面工具行从 44px 降至 36px（18.2%），录制实际浏览器 12 帧动画，未伪造动效。样例不调用模型/读取用户数据。只读比对确认正式 4319 CSS 仍为 8b186c6：src/server.js 启动时缓存静态资源，需合并后快速重启才载入新版；本轮不重启正式服务，保留分支和截图供验收。

## 2026-09-10 21:19 — 会话配色验收与合并
- 用户确认合并并 push；三份只读复核已回收，无剩余阻塞。先在 feat/conversation-colors worktree 合入最新 origin/master，保留图片定位修复；knowledge.md 两侧记录均保留，INDEX.md 重新生成，不手工拼接行号。涉及这两份文档、本日志与仓库 devlog.md；不追加功能改动。
- 合并后验证：npm test 86 通过、1 原有跳过、0 失败；重启静态预览后，Chromium 1440/390/320px 配色、吸顶、定位、转圈及减少动态效果检查通过，无浏览器错误。按流程推送功能分支、合并 master 并推送，再将截图/日志移出并清理 worktree；正式服务不在本次合并中重启。

## 2026-09-10 21:12 — 会话语义配色、动态状态与阅读体验
- 功能 worktree feat/conversation-colors。按用户三轮反馈保留 Linear 深色底，新增雾蓝读取/搜索、青绿命令/代码、暖金编辑/重点、柔紫思考/子代理；正文缩至 14px，思考 Markdown 斜体正常字重（代码保持正体）。状态改清晰旋转环，覆盖思考、连接、工具与子代理卡片/浮层/摘要，结束停止并尊重减少动态效果。
- 去除工具输出、diff、系统提示词内部纵向限高，使用共享 sticky summary 和收起 SVG；原生键盘折叠、宽代码/表格横向滚动保留。子代理摘要改原生按钮，定位并聚焦会话内原卡片，不直接打开浮层；浏览器复现近底部跳转触发 onscroll 后重新跟随的问题，记录程序跳转位置并忽略同位置事件，实际滚动或回到最新可恢复，快照重置。
- 涉及 public/{app.js,style.css}、tests/{app.test.js,conversation-preview.mjs,conversation-ui.py}、README.md、本日志、仓库 devlog.md、codebase-map 的索引/职责表与 knowledge.md。不加运行依赖，不改 SDK、消息协议、安全 Markdown 或折叠渲染策略。
- 验证：npm test 83 通过、1 原有跳过、0 失败；已有 Python Playwright + Chromium 实测 1440/390/320px 配色、字号/字重、主/子长内容吸顶收起、无内部纵向滚动、键盘定位及回到最新；检查旋转实际运动、结束停止及 reduced-motion，无页面/CSP 错误。新增脚本可重复验收并输出截图，静态样例不调用模型、不读取用户数据；截图前等待滚动合成稳定，避免拍到短暂空白标题。正式服务未重启，先保留功能分支供用户看预览。

## 2026-09-10 20:40 — 会话 UI 复核修补
- 根据已回收的只读复核，确认左右 diff 把截断提示放在隐藏的统一视图里；public/app.js 将提示移到该节下方，activityLine 改 span 满足 summary 内容约束。public/markdown.js 避免 JS 查询依赖 :has，保留无 code 的 pre。public/style.css 清理旧强调色与未定义 --text，输入菜单使用同一套 Linear 表面/文字 token。
- tests/message-activity.test.js 覆盖长 diff/输出与双视图提示，tests/markdown.test.js 覆盖原始 pre；README.md、codebase-map 索引/knowledge.md 与仓库日志同步。侧栏/设置折叠三角不属于会话执行记录，保留原生交互；不新增工具归组、状态机或依赖。
- 验证：npm test 83 通过、1 原有跳过、0 失败；Chromium 桌面/390px/320px 全套 UI 检查通过，额外验证 1440px/320px 双 diff 视图截断提示及输入菜单颜色，无浏览器/CSP 错误。预览仍为静态样例，正式服务未重启。最终只读复核已回收：主体改动未发现功能/性能/安全回归；后续补修由主代理以上述 83 项测试与浏览器检查验证。复制反馈的失焦边界、纯 pre 的标签措辞和无害死选择器三项非阻塞建议暂留，避免扩大本轮范围；按仓库流程合并，验收截图移出工作树保留。

## 2026-09-11 — 会话信息层级与 Linear 视觉重设计
- 功能 worktree feat/conversation-ui。按用户反馈去掉执行记录默认三角、字符图标和重复思考状态：统一 20px SVG + 32px 底座，工具动作/对象/状态分列，完成保持工具身份；工作空间内路径缩短，手机对象换行，未知工具原名省略显示。
- 思考入口合并为一行，展开复用安全 Markdown 与脏块渲染；正文/思考/重点/斜体分层。代码块新增语言/复制反馈，表格改原生布局加可聚焦滚动容器，修正右侧空框及窄屏单字换行；工具详情、Skill、重试与压缩统一文字展开提示。采用项目 design 的 Linear tokens 与系统字体回退，无新增依赖，不改 pending、回执、SDK 或模型上下文。
- 涉及 public/{app.js,style.css,markdown.js,stream-renderer.js}、tests/{app,markdown,message-activity,stream-renderer}.test.js、tests/conversation-preview.mjs、README.md、devlog.md、codebase-map 索引/职责表与知识库。新增无模型/用户数据的本地预览入口，主代理完成 UI，子代理只读复核。
- 验证：npm test 82 通过、1 原有跳过、0 失败；Chromium 148 实测桌面/390px/320px 无会话或浮层横向溢出，Enter/空格展开、思考 Markdown、代码真实剪贴板、diff 响应式、子任务与减少动态效果通过，页面/CSP 控制台无错误。JSDOM 微基准中位数 baseline 2457ms / optimized 340ms；折叠任务 0 帧/0 解析（仅本机微基准，非模型速度）。未调用付费模型；静态资源需服务重启后生效。

## 2026-09-11 — 子任务主动通知、凭证读取与输入区运行摘要
- 功能 worktree feat/task-notifications。完成任务随机生成 resultId，结果与待通知状态先落盘，再等主运行结束合并唤醒；通知不进入可撤回队列，取消暂停，重启补发（不保证 exactly-once、不重跑任务）。旧任务加载补齐凭证；取消通知轮不标记送达。
- read_result / WS tasks.read 改单任务 taskId+resultId，删除 wait 和批量/轮询用法；新增 append，默认 steer、可选 followUp，仅允许运行中子任务追加。模型提示与 smoke 同步迁移。
- 输入框＋上方添加当前会话启动中/运行中子代理的单行摘要，转圈图标、省略溢出，完成移除、切会话重置，复用现有任务状态；不增加依赖或后端接口。
- 涉及 src/{tasks,sessions,tools,protocol,server,capabilities}.js、public/{app.js,index.html,style.css}、tests/{tasks,task-notifications,config,capabilities,app}.test.js、tests/smoke.js、README.md、索引及 knowledge.md。使用假代理与 DOM 回归验证；未调用付费模型运行 smoke、未做真实浏览器视觉验收。

## 2026-09-10 — 主/子代理自动避让重试
- 功能 worktree feat/auto-retry。调研 OpenAI/Anthropic SDK 与 Pi SDK 后，在共享 factory 层统一重试，禁用底层重复计数；保留工具结果后继续，不重发用户任务。
- 用户确认间隔 3、3、3、6、6、12、24、48、96、192…秒，持续翻倍、最多30次。长等待分段定时防32位溢出；主动停止立即取消；永久错误不重试。
- UI 原生 details 聚合错误与等待时间，成功自动折叠，可手动展开；主/子代理隔离，记录保存、重启标记停止。前端委托两次遇到429失败，改由主代理实现。
- 涉及 src/{pi,retry,sessions}.js、public/{app.js,style.css}、tests/{retry,app,session-flow}.test.js、README.md、索引与知识库。测试使用假模型/假等待，不调用付费模型；未做真实浏览器视觉验收。
## 2026-09-10 — 图片粘贴位置占位
- 功能 worktree feat/image-placeholders。上传/粘贴立即在光标或选区插入 `[imageN]`，缩略图显示同编号，删除附件同步删标记并重排；发送保留正文位置并附编号与附件顺序说明，复用原协议，不改 SDK。
- 队列撤回按已有草稿与各条附件数累加调整编号；读图与撤回互斥，避免异步编号冲突；读图失败只回滚原位置尚未编辑的占位，不覆盖用户新输入。手改标记按普通文字处理，删除标记不自动丢弃图片。
- 涉及 public/app.js、tests/app.test.js、README.md、devlog.md、codebase-map 的 INDEX.md 与 knowledge.md。测试覆盖中间粘贴、继续输入、删除重排、失败恢复、异步切会话、多条撤回编号、发送说明；独立复查补充了读图/撤回竞态防护。
- 验证：npm test 全量 52 项通过；未做真实浏览器手动验收。

## 2026-09-10 — 三类分组与拖动排序
- 功能 worktree feat/session-groups。按用户要求列表分三类：按时间分组、待处理（运行中会话，紧挨已完成上方）、已完成；另支持同类内拖动会话到另一行手动排序。
- 排序以全局会话 id 顺序物化存入 localStorage（axiom.sessionOrder），搜索中拖动也不破坏其他会话顺序；未排序会话按原服务端顺序稳定跟随。
- 涉及 public/{app.js,style.css}、tests/app.test.js、README.md、devlog.md 与 codebase-map 索引。
- 验证：npm test 全量 52 项通过，新增断言三类分组顺序、拖动排序落点、localStorage 持久化与重渲染稳定；未做真实浏览器拖拽验收。

## 2026-09-10 — 已完成区上移与待处理分组
- 功能 worktree feat/done-placement。按用户要求，「已完成」区域从侧栏底部固定改为紧贴会话列表下方（列表空间不足时自动压缩滚动，「设置」仍钉在底部），并在列表顶部增加「待处理」分组标题。
- 涉及 public/{app.js,style.css}、tests/app.test.js、README.md、devlog.md 与 codebase-map 索引。

## 2026-09-10 — 已完成区去掉拖放提示文案
- 功能 worktree feat/done-label。按用户要求，折叠区标题精简为「已完成」，去掉「· 拖到这里」提示；拖放行为不变。涉及 public/{app.js,index.html}、devlog.md。
- 验证：npm test 全量 51 项通过（测试未断言该文案）。

## 2026-09-10 — 输入框 Skill 与工作空间补全
- 功能 worktree feat/composer-completion。输入开头 `/` 补全当前会话 Skill，`@` 补全文件及文件夹，支持名称过滤、路径分层、带空格路径、点击与上下/Enter/Tab/Esc 键；文件夹可直接引用或右箭头进入。
- 复用 workspace.browse 的工作空间边界检查、已有标签及发送链路，不引入依赖或新协议；序号与会话检查丢弃过期结果，切换/断线/失焦关闭候选。修正仅文件/文件夹标签无法发送的已有条件遗漏。
- 涉及 public/{app.js,index.html,style.css}、tests/app.test.js、README.md、devlog.md、codebase-map 索引与知识库。测试覆盖技能/文件/文件夹、去重、键盘、邮件/URL 不误触发、过期回包与引用单独发送。
- 验证时发现 controls 首次执行早于补全状态初始化，将状态声明移到文件顶部后页面测试通过；`npm test` 全量 51 项通过。未执行真实浏览器手动验收。

## 2026-09-10 — 已完成区改名与去掉计数
- 功能 worktree feat/session-done-label。按用户要求，隐藏区标题由「已隐藏 (N) · 拖到这里」改为「已完成 · 拖到这里」，不再显示会话个数；README 同步。涉及 public/{app.js,index.html}、README.md、devlog.md。
- 验证：npm test 全量 51 项通过（测试未断言计数文案，无需改动）。

## 2026-09-10 — 顶栏标题与路径间距
- 用户反馈标题和路径行距过大，与左侧菜单按钮不协调；路径图标虽然设置 height:26px，仍被全局 button min-height:40px 撑高。
- public/style.css 显式设置路径图标 height/min-height:24px，标题行高 20px、双行间距 2px，沿用顶栏垂直居中，不改其他按钮。
- tests/app.test.js 增加真实页面 CSS 计算样式回归检查；同步 README.md、knowledge.md 与索引。npm test 全量 52 项通过；worktree 初次缺依赖，建立现有 node_modules junction 后通过，无新增依赖。未做真实浏览器截图验收。
- 同时排查 Steer / Follow-up：空输入时禁用符合现有逻辑，输入后启用及双类型发送已有测试覆盖，无需修改队列。

## 2026-09-10 — 会话隐藏与拖放恢复
- 功能 worktree feat/session-hide。在会话列表下方添加默认收起的原生 details 隐藏区，支持拖入隐藏、拖回恢复及键盘/触屏按钮；限制展开高度，避免影响正常列表阅读。
- 按后续反馈，将重命名图标改为直线铅笔轮廓，去掉原有类似取色器的圆头。
- 按后续要求，将隐藏入口放在编辑前，使用对钩图标与「完成并隐藏」提示，点击后移动到下方隐藏区；隐藏区仍提供向上箭头恢复。
- 仅作为当前浏览器列表偏好保存到 localStorage，不增加服务端协议、不删除或停止会话、不切换当前对话；搜索和工作空间筛选继续生效。
- 涉及 public/{app.js,index.html,style.css}、tests/app.test.js、README.md、devlog.md 和 codebase-map 索引。
- 验证：npm test 全量 51 项通过，覆盖双向拖放、按钮隐藏/恢复、折叠、持久化写入、列表刷新、搜索及不发会话操作请求；未执行真实浏览器拖放验收。首次因 worktree 缺依赖失败，建立既有 node_modules junction 后通过，无新增依赖。

## 2026-09-10 — Skill 与用户消息分离
- 按用户要求，public/app.js 将 skill 折叠块放到对应用户气泡前面、同级显示，保留安全 Markdown 与按需展开；纯 skill 不留空气泡，压缩时一起隐藏。
- 涉及 public/app.js、tests/app.test.js、README.md、devlog.md 与 codebase-map 索引。功能 worktree feat/skill-flat；不增加依赖。
- 验证：`npm test` 51 项通过；覆盖同级顺序、展开、重复渲染清理、纯 skill 和压缩隐藏。首次缺少依赖，建立共享 node_modules junction 后重跑。

## 2026-09-10 — 移除浏览器截图，增加图片放大预览
- 功能 worktree feat/image-preview。按用户要求删除截图按钮与 getDisplayMedia 抓帧逻辑，保留上传和粘贴；附件及消息/历史图片共用原生 dialog 放大预览，支持点击、Enter/空格打开，关闭按钮、遮罩或原生 Esc 关闭，不新增依赖。
- 涉及 public/{app.js,index.html,style.css}、tests/app.test.js、README.md、devlog.md 与 codebase-map 索引。
- 验证：全量 `npm test` 50 项通过，覆盖截图入口移除、附件/消息预览、键盘开启、关闭与图片源清理。首次测试因 worktree 缺少依赖失败，修正依赖 junction 后通过；JSDOM 不实现原生 Esc，关闭事件用 close() 验证。

## 2026-09-10 — 现代原生工作空间选择框
- 功能 worktree feat/modern-workspace-picker。按用户反馈替换老式树状 UI：优先调用本机 PowerShell 7，启用 VisualStyles、AutoUpgradeEnabled 和标题；仅未安装（ENOENT）时回退 Windows PowerShell，其他错误不重复弹窗。不新增依赖，保留置顶 owner、取消和超时语义。
- 涉及 src/sessions.js、tests/workspace-picker.test.js、README.md、devlog.md、codebase-map 坑库与索引。
- 验证：全量 `npm test` 50 项通过；本机 PowerShell 7.6.6；Windows UI Automation 实测现代选择框、地址栏、搜索框和选择文件夹按钮可见，测试窗口已关闭；测试覆盖新版优先、缺失回退以及非 ENOENT 错误不回退。

## 2026-09-10 — 修复工作空间选择窗口不可见
- 功能 worktree feat/workspace-picker。后台 PowerShell 的无 owner 文件夹选择框可能隐藏或落在浏览器后面，未完成的请求随后被误导性提示「窗口已打开」。为原生选择框创建并激活置顶 owner，完成后释放；保留互斥与 5 分钟超时，补充明确占用/超时错误，移除不再存在的手输路径建议。
- 涉及 src/sessions.js、tests/workspace-picker.test.js、README.md、devlog.md、codebase-map 索引与坑库。无新增依赖，不改会话切换流程。
- 验证：全量 `npm test` 50 项通过；Windows UI Automation 确认真实选择框和取消/确定按钮 IsOffscreen=false（测试窗口已关闭）；回归覆盖中文路径、取消、并发拒绝、超时及失败释放锁。首次原生探测命令误匹配自身并终止，已修正排除自身后重新验证。

## 2026-09-10 — 守护进程自动重生
- 功能 worktree feat/supervisor-respawn。worker 意外退出后 supervisor 自动重启（指数退避 1s→10s，稳定运行 30s 重置计数），端口被占时后台重试、释放后接管；优雅停止/快速重建路径不受影响，终端 Ctrl+C 仍整体退出。
- 涉及 scripts/service.mjs、tests/service.test.js。验证：真实子进程测试 49 项全部通过。

## 2026-09-10 — 工作空间打开改原生选择
- 功能 worktree feat/workspace-picker。按用户要求移除侧栏手输目录路径表单（▶ 工作空间），「打开工作空间」直接拉起原生文件夹选择，选后切已有同目录会话或新建；当前工作空间改存 JS 变量，不再借隐藏 DOM 输入框当状态。非 Windows 暂无打开其他工作空间入口（pick 本就仅 Windows），README 同步。
- 涉及 public/{index.html,app.js,style.css}、tests/app.test.js、README 与代码索引。验证：全量 npm test 48 项通过。

## 2026-09-10 — 截图与图片输入
- 独立 功能 worktree feat/image-input。输入区增加图片上传、粘贴系统截图、浏览器授权截取屏幕/窗口/标签页；截图只抓一帧，成功或失败都停止共享。复用 FileReader、canvas、getDisplayMedia 与 Pi 原生图片输入，无新增依赖。
- 支持纯图片/图文发送、附件预览与移除、按会话保留草稿、消息历史图片；限制 PNG/JPEG/GIF/WebP、4 张/消息、5 MiB/张，后端校验 base64、签名与大小，视觉模型能力提前校验。排队与撤回保留附件，避免 SDK 文本队列回执丢图。
- 涉及 public/{app.js,index.html,style.css}、src/{protocol,server,sessions,pi}.js、tests/{app,image-input}.test.js、README/devlog、codebase-map。刻意不增加裁剪/压缩库或独立上传存储；截图超限可先使用系统区域截图。未发送草稿仅存页面内存。
- 验证：`npm test` 初始 41 项、同步最新 master（服务控制功能）后全部 48 项通过；前端 JSDOM 检查上传、粘贴、纯图发送、会话隔离、移除、格式/数量限制和截图清理；后端检查协议、模型限制、图片队列与 WebSocket 大图传输。未调用付费视觉模型、未进行真实浏览器授权弹窗人工验收，未重启现有服务。

## 2026-09-10 — 跨平台自动启动与服务重启
- 独立 功能 worktree feat/service-controls。右上角独立连接状态与服务菜单，命名「快速重启」「重建重启」；复用 WebSocket Origin/Host 校验，严格校验模式，忙碌会话/子任务禁止重启。
- npm start 使用 Node 守护进程与 IPC 优雅停止。重建执行 npm ci + 可选 build，暂存原依赖以便安装失败恢复；原生 JS 不增加虚假编译步骤。当前用户登录自动启动分别使用 Windows Startup、macOS LaunchAgent、Linux systemd --user，不立即启停现有进程。
- 涉及 scripts/{service,autostart}.mjs、package.json、src/{main,server,protocol}.js、public/{app.js,index.html,style.css}、tests/{service,service-api,autostart,app}.test.js、README 和代码索引。
- 验证：自动启动三平台配置生成/转义、真实子进程快速重启、重建失败恢复与 API 校验测试；全量 npm test。macOS/Linux 尚无真实系统登录验收，不宣称已验证开机；不强杀运行中的现有服务。

## 2026-09-10 — 可配置后台摘要与 turn 安全压缩
- 独立 功能 worktree feat/background-compaction。按照用户确定方案，后台独立内存 Pi 会话生成摘要，主会话继续运行；token/窗口占比阈值任一先达到触发，支持专用模型、思考等级和近期保留量，摘要会话固定无工具及无关资源。
- 复用 Pi 原生轮次刷新钩子，摘要完成后仅在下一请求前校验并提交；保留固定边界之后的近期消息与全部新增输入/输出/工具结果，原生压缩作为窗口保护。每会话单任务，失败/失效不折叠、不删除原文。
- 配置接入默认设置、自定义新会话和当前会话；成功压缩事件/历史消息 ID 落盘，前端按覆盖范围局部隐藏旧消息并新增可展开摘要，不重建流式消息。无新增依赖，不修改 node_modules。
- 涉及 src/{pi,compaction,protocol,sessions}.js、public/{app.js,index.html,style.css}、tests/{compaction,compaction-config,config,app}.test.js、README/devlog 与 codebase-map。验证：npm test 34 项通过，含真实 SDK + 本地 SSE 伪模型端到端、真实 HTTP 取消、split-turn、失效检查、阈值校验、配置/消息 ID/摘要重启恢复、前端折叠与输入滚动保留。实际本机已认证 Pi factory 创建/配置/释放检查通过；未调用付费模型、未重启现有服务，未进行真实浏览器视觉验收。

## 2026-09-10 — 紧凑添加菜单、Skill 标签与布局纠正
- 在独立 独立功能 worktree 实施：菜单改为 176px 三行单行布局，移除标题/副文案，说明移入 title；加号换细线 SVG、桌面 28px 无边框按钮，触屏保留 40px 点击区域。
- Skill 单独保存为页面草稿状态，上方标签显示，正文不再重复命令，发送时复用 Pi /skill 命令；取消不改正文、失败保留、切换按会话恢复，支持仅发送 Skill。删除旧 CSS order，恢复正文→模型按钮→会话信息。
- 涉及 public/{app.js,index.html,style.css}、tests/app.test.js、README.md、devlog.md 和 codebase-map；npm test 13 项通过。独立 Chromium 检查 1440/390px 菜单 176×106、加号 28×28、无横向溢出，模型操作行实际位于信息栏上方。未重启现有服务。

## 2026-09-10 — 上下文添加菜单与工作空间本地操作
- 独立 功能 worktree feat/composer-add-menu。参考 Claude Code 桌面「＋」与 Cursor 上下文引用官方文档，移除可见的 Skill 表单行，输入框上沿增加图标菜单、搜索选择器、可移除标签；不调整模型栏/运行摘要位置。Skill 正文以 Pi 终端同款 `[skill] 名称` 默认折叠、点击展开并安全渲染，保留任务正文。
- 文件/目录只添加工作空间路径引用，按需读取；浏览接口校验真实路径边界，排除符号链接及 .git/node_modules。新会话上方提供 Windows 原生选目录，路径后增加复制/Explorer 图标；取消选择不切换，沿用原会话/信任流程。顶栏仅 WS 状态、停止按钮改 Stop。
- 涉及 public/{app.js,index.html,style.css}、src/{sessions,server,protocol}.js、tests/{app,session-flow,codebase-index}.test.js、README/devlog 与索引/坑库。无新增依赖；native picker 限 Windows，目录引用不冒充完整附件加载。
- 验证：13 项自动测试通过，覆盖菜单搜索/选择/移除/发送、Skill 折叠与正文、复制/打开请求、目录越界/缺失、索引行号；独立 4348 模拟服务浏览器验证 1440/390/320px 无横向溢出、菜单与标签可操作、无页面异常。未调用付费模型，未重启现有服务；Windows 原生弹窗与 Explorer 尚未人工点击验收。

## 2026-09-10 — 输入框显式加载 Skill
- 独立 功能 worktree feat/composer-skills。输入框增加原生 Skill 下拉框，显示主代理实际可用技能及说明；选择、替换、取消直接编辑草稿中的 `/skill:名称 `，发送前即可看到要加载的技能。
- 复用 Pi 原生命令展开，普通发送/插话/追加共用，不添加加载接口、依赖或独立选择状态；草稿原有切换保留与失败保留机制不变。只提供单技能显式加载，不把默认能力预览当作当前加载状态。
- 涉及 src/pi.js、public/{app.js,index.html,style.css}、tests/app.test.js、README.md、devlog.md 和 codebase-map/INDEX.md。npm test 13 项通过，覆盖选择/替换/取消、手动命令同步、发送请求及发送后清空；未调用真实模型，未重启现有服务。

## 2026-09-10 — 队列、运行中模型切换与工作空间会话落盘
- 独立 功能 worktree feat/session-flow。发送操作移到输入区底部；执行中提供 Steering 插话与 Follow-up 追加，设置保存当前会话 Enter 默认类型。复用 Pi 原生队列事件/查询/clearQueue，点击或单按 Esc 撤回全部队列并保留已有草稿，300ms 内双按 Esc 停止；弹窗及手机侧栏优先处理 Esc。
- 运行中允许切换模型，不误将运行状态改为 idle；回答下方使用消息本身的 provider/model/usage，不套用当前选择。右上角仅显示已连接（绿）/连接断开（灰）。重命名、删除使用统一暗色原生 dialog，异步操作绑定原会话 ID，错误留在弹窗。
- 选择 ~/.axiom/workspaces/<目录 SHA-256>/ 下 Pi 原生 JSONL + 网页元数据 JSON，而非 SQLite：无需新依赖和上下文格式转换，保留 Pi 压缩/模型记录；元数据串行原子替换，保存标题、配置、网页消息和子任务结果。正常退出保留历史，显式删除移除磁盘记录；重启不自动续跑。默认配置移到 ~/.axiom/defaults.json，首次从旧位置复制且不覆盖已有文件。
- 验证：npm test 13 项通过，新增持久化/关闭恢复/删除/队列类型/运行中配置状态检查；页面测试覆盖撤回保留草稿、单 Esc 不取消、双 Esc 取消与连接状态。真实 SDK 无付费调用验证创建/保存/关闭/重新加载/删除通过。Playwright 独立 4337 模拟服务检查 1440/390/320px 均无横向溢出，发送按钮贴近输入区底部，重命名弹窗打开并聚焦名称输入。未重启既有 4319 服务，旧版纯内存会话无法由此次文件存储自动迁移。
- 涉及 src/{main,pi,protocol,server,sessions}.js、public/{app.js,index.html,style.css}、tests/{app,config,session-flow}.test.js、README.md 与 codebase-map。队列目前按 Pi 原生一次撤回全部，不实现自造逐条队列；运行队列/未完成片段不跨重启恢复。

## 2026-09-10 — 子代理会话内浮层、统一渲染与上下跳转
- 在独立 worktree（feat/subagent-overlay）实施。模型摘要及等级选项去掉「思考」前缀，直接显示供应商 · 模型 · max 等实际等级；不改变运行配置或思考输出能力。
- 主会话保留 SUBAGENT 状态/任务卡片，点击打开原生 dialog。按用户反馈将初版青绿色改为与现有主题协调的低饱和蓝紫色；浮层和遮罩限定在右侧会话区，以其中心定位，宽度沿用 880px 上限，避开侧栏和顶部会话栏，随侧栏收起及移动端布局变化。
- 复用主会话 card/renderMessage、stream-renderer、Markdown/DOMPurify 和消息样式，只替换容器；没有第二套子代理渲染或新依赖。缓存、上下文、实际模型/等级固定在顶部，下方独立滚动；「回到最上」暂停跟随，「回到最下」恢复跟随。关闭/未打开时不解析正文，重开补绘完整结果；不自动弹窗抢焦点。
- 保留原生关闭/遮罩/Esc/焦点返回，Esc 不取消代理；切换/重连释放旧浮层，按快照恢复；延迟 close 回调不清空已重新打开的 activeTask。将浮层 h2 样式限定到顶部，避免污染复用的 Markdown 正文。
- 验证：npm test 12 项通过（主/子真实 Markdown 相同、XSS 边界、流式/思考/最终消息、隐藏按需绘制、任务隔离、上下跳转与跟随、关闭竞态等）；Playwright 独立 4331 模拟服务验证 1440/1024/768/390/320px 及 700×400 横屏、侧栏展开/收起、浮层相对会话居中、顶部固定、跳转、关闭/焦点、断线重连与会话隔离，无横向溢出和控制台错误，未调用付费模型。原 4319 服务未重启（重启会丢失内存会话）。
- 涉及 public/{app.js,index.html,style.css}、tests/app.test.js、README.md、devlog.md 与 codebase-map 索引/坑库；截图仅放独立 artifacts 目录，不提交。

## 2026-09-10 — 会话运行摘要与子代理详情
- 在独立 worktree（feat/session-runtime）实施。发送按钮去掉 ↑；模型选择下显示最近请求缓存命中、Pi 当前上下文估算和实际供应商/模型/思考程度，窄屏换行。
- 复用 SDK systemPrompt、messages.usage 和 getContextUsage，增加 agent.runtime 边界事件与主/子快照；子任务销毁前保留最终信息。折叠摘要显示状态与运行信息，展开查看完整任务、实际系统提示词、错误和输出，提示词只按纯文本展示。
- 展示元数据不进入 read_result/tasks.read，避免额外占用主代理上下文；未知用量不伪装成 0%，压缩后的未知上下文显示待更新。无新依赖，不在 token 增量上扫描历史或传输提示词。
- 验证：npm test 12 项通过，覆盖运行数据、模型变更、主子/跨会话隔离、历史恢复、终态保留、XSS 文本边界与折叠按需绘制；真实 SDK 创建/读取/释放验证通过，未发起付费模型请求。Playwright 使用独立 4327 模拟服务验证 1440/390/320px 无横向溢出、提示词纯文本及摘要展示；git diff --check 通过。
- 涉及 public/{app.js,index.html,style.css}、src/{pi,sessions,tasks}.js、tests/{app,config}.test.js、README.md、devlog.md 与 codebase-map 索引/坑库。

## 2026-09-10 — 顶部能力同步默认选择，移除当前会话展示
- 浏览器复现顶部仍显示当前会话、同步预览位于下方的混淆；按用户要求删除当前会话标题和能力展示及渲染代码，唯一默认预览移到顶部「会话能力」。
- 修复浏览器 CSP 阻止预览 inline style 的错误：换行与长文本样式移入外部 CSS，不放宽安全策略。
- npm test 10 项通过，覆盖当前会话展示移除、预览位于编辑器上方及自动保存同步。浏览器样式预览确认 pre-wrap；复核时 WS 断开，未声称完成在线保存验证。
- 涉及 public/{app.js,index.html,style.css}、tests/app.test.js、README.md、devlog.md。

## 2026-09-10 — 默认新会话自动保存与本机持久化
- 默认配置取消保存按钮，选择事件直接经既有 WebSocket 命令保存；显示保存中、落盘成功或失败未生效。增加实时默认能力预览，与当前会话实际配置明确区分，复用原选择器和能力名称格式化。
- 本机 Pi 用户目录 axiom/defaults.json 持久保存默认配置；启动加载并校验结构，同目录临时文件原子替换，串行保存避免并发部分更新丢失，失败不覆盖旧配置。Pi settings/MCP、目录信任与自定义入口不变。
- 验证自动保存真实页面 change 事件、服务重建加载、并发部分更新、失败不覆盖及损坏配置报错；npm test。
- 涉及 src/{main,sessions,protocol}.js、public/{app.js,index.html}、tests/{app,defaults}.test.js、README.md、devlog.md。

## 2026-09-10 — 浏览器复核与会话能力短名称
- 浏览器连接现有 4319 服务，复现主/子能力清单直接显示绝对路径、导致设置内容过长的问题。抽取 capabilityName，技能显示目录名、npm 扩展显示含 scope 的包名，本地扩展显示文件名或 index 所在目录；缺失能力提示复用，内部标识保持不变。
- 浏览器以请求替换预览同一修复，确认主/子清单不含绝对路径；390/1440px 无横向溢出，默认配置正常加载且仅一个弹窗。未保存测试配置、未重启服务或调用模型。
- 增加 Windows/POSIX、scoped 包、本地 index、单文件扩展和 MCP 名称回归。涉及 public/app.js、tests/app.test.js、README.md、devlog.md。

## 2026-09-10 — 设置左侧分类与内联默认会话配置
- 在 feat/settings-inline 独立 worktree 实施。设置增加左侧唯一分类「默认新会话设置」，右侧保留当前主/子 Agent 供应商、模型、思考与 Skills/MCP/Extensions 明细，直接在其下编辑默认配置，不打开二级弹窗。
- 复用原有 create-form 和主/子选择器，在默认设置与自定义新会话之间移动同一表单；补充模型支持的思考等级以及子代理模型/能力分别跟随主代理。能力 inherit 与全部 null 明确区分，子任务使用主代理实际能力，不扩大选择。
- 新增 thinking/subagentThinking 默认值、子能力解析快照和协议校验；默认保存只影响后续普通新会话，保留服务内存生命周期和原信任边界。清单表示配置/加载能力，不声称已经调用。
- 验证：npm test 9 项通过，覆盖内联表单不打开二级弹窗、保存思考与能力跟随、刷新恢复、自定义入口隔离和子任务实际继承；Pi 工厂模块导入及 git diff --check 通过。
- 涉及 public/{app.js,index.html,style.css}、src/{pi,protocol,sessions}.js、tests/{app,config}.test.js、README.md、devlog.md。

## 2026-09-10 — 可配置默认新会话，复用自定义会话组件
- 在独立 worktree（feat/default-new-session）实施。「新会话 · 全部能力」更名为「新会话」，设置中增加默认新会话入口，可独立配置主/子模型与 Skills、MCP、插件的全部或自定义能力（含空选择）。
- 两种配置直接复用原有弹窗、createAgentPicker 和加载/提交数据组装；协议共享选择字段，保存与创建共用 validateSelection，不新增依赖、组件副本或配置服务。默认配置和最近主模型/思考回退值分开，防止调整当前会话覆盖显式默认配置。
- Sessions.create 统一合入默认值，覆盖所有普通创建入口；自定义入口明确 useDefaults:false，保留当前模型和初始全部能力的原行为。保存默认不创建代理、不改已有会话；省略字段保留，null 恢复默认/全部，失败保留旧值。沿用服务内存生命周期，刷新/重连保留，重启重置，不写 Pi 设置。
- 默认配置不保存目录信任；保存和实际创建均校验目录/模型/两组能力，所选能力在其他目录不可用时拒绝创建，编辑保留并标记缺失项，不静默扩大或清空选择。原有自定义会话级信任流程保持不变。
- 验证：npm test 9 项全部通过，扩充默认配置保存/继承/覆盖/重置、主子与已有会话隔离、失败回滚、协议校验、WebSocket 重连和真实页面处理器回归。Playwright 使用独立 4323 测试服务与模拟代理，验证保存不新建、普通创建应用空能力和固定模型、自定义仍全部、刷新恢复、Escape 返回设置及焦点；320/390/700/1440px 页面和弹窗均无横向溢出。无付费模型调用。
- 涉及文件：public/{app.js,index.html,style.css}、src/{sessions,protocol,server}.js、tests/{app,config,server}.test.js、README.md、devlog.md。

## 2026-09-10 — 默认完整能力与自定义主/子代理新会话
- 在独立 worktree（feat/agent-capabilities）实施。新增默认全部能力、自定义新会话两个入口；弹窗复用模型选择样式，主/子代理分别选择供应商/模型和 Skills、MCP、插件多选清单。
- 复用 DefaultPackageManager/loadSkills/DefaultResourceLoader，不重写插件扫描或 MCP 协议；MCP 通过已安装适配器独立 config 快照过滤。增加直接依赖 jiti 2.7.0（与 SDK 已使用版本一致），用于导入 Pi 全局 npm 目录中的 TypeScript MCP 适配器及其配置解析器，并映射到当前宿主 SDK。
- 默认遵守 Pi 已启用配置和目录信任；未信任项目仅全局加载，自定义可明确授予会话级信任。配置快照不写回用户设置。插件按选择加载而非加载后隐藏；主/子模型运行时独立，接通 session_start/session_shutdown，避免 MCP 连接泄漏。无 TUI 组件桥，需审批的操作不自动放行。
- 新增 capabilities.list 与 session.create 能力字段，创建前校验两类代理选择；快照保留模式/选项、实际工具名和加载提示。能力创建时固定，模型继续使用现有设置机制。修复插件指令无模型回答被误报失败，以及子任务清理异常导致状态不发布。
- 验证：npm test 9 项通过，含目录信任、未选插件不执行、配置不写回、未知 ID 拒绝、主子隔离、页面多选/模型提交/失败保留。真实 SDK 无付费模型调用检查：默认包含基础工具、4 个网页工具及 mcp/mcpScript，空选择仅基础工具，关闭均正常。Playwright 验证自定义成功创建及摘要，390px 手机宽度页面/弹窗无横向溢出。
- 涉及文件：src/{capabilities,pi,sessions,tasks,protocol,server}.js、public/{index.html,app.js,style.css}、tests/{capabilities,app}.test.js、package{,-lock}.json、README.md、devlog.md。

## 2026-09-09 — 新建会话继承最近主代理配置
- 在独立 worktree（feat/session-defaults）实现，解决新建会话总是恢复启动模型、需要重复选择的问题。
- Sessions 统一记忆最近成功变更的主模型与实际思考等级，所有新建入口（含切换工作空间时创建）沿用；已有会话不变，子代理覆盖仍按会话独立。
- 仅子代理变更、读取旧会话或配置失败不覆盖默认值；采用服务内存保存，不新增持久化文件，服务重启后恢复启动配置。
- 验证：npm test 7 项全部通过；补充新会话继承、已有会话隔离、失败和子代理变更不污染默认值的检查，git diff --check 通过。
- 涉及文件：src/sessions.js、tests/config.test.js、README.md、devlog.md。

## 2026-09-09 21:00 — 统一设置入口与子代理配置迁移
- 在独立 worktree（feat/agent-settings）实施；删除侧栏底部运行时标语，改为「设置」入口，采用常见的设置弹窗与分区布局，后续设置继续加入此处，不创建空白分类或插件框架。
- 将子代理配置从输入区迁入设置，复用主代理的供应商 → 模型下拉样式，保留默认跟随主代理、当前会话作用范围和自动保存；未增加独立思考配置，继续沿用既有继承规则。
- 使用原生 dialog 处理焦点与 Escape，避免关闭设置时误停任务；支持关闭按钮、遮罩关闭、失败反馈及回滚、忙碌/离线禁用。
- 验证：npm test 全部 7 项通过，补充供应商筛选、跟随恢复、失败回滚和入口迁移检查；真实浏览器验证桌面打开、关闭焦点与 Escape、390px 手机宽度无横向溢出，未调用付费模型。
- 涉及文件：public/{index.html,app.js,style.css}、tests/app.test.js、README.md、devlog.md。

## 2026-09-09 — 页面子 Agent 模型配置
- 在独立 worktree（feat/subagent-model）实现，复用模型目录与 session.configure，不新增依赖或配置服务。
- 输入框下新增原生折叠配置区：子 Agent 可选择独立模型或默认跟随主 Agent；按会话内存保存，快照恢复，忙碌/断线时禁用选择。
- 委派创建统一应用模型覆盖，保留工作目录和思考继承；配置只影响新子任务，未知模型在主 Agent 配置变更前拒绝。省略覆盖保留旧值，null 恢复继承。
- 验证：npm test 7 项通过，覆盖独立模型、恢复继承、未知模型拒绝、会话隔离、协议校验、页面选择提交及切换/重连恢复；未进行付费模型调用。依赖通过临时 node_modules junction 复用本机安装。
- 涉及文件：src/{sessions,protocol}.js、public/{app.js,index.html,style.css}、tests/{config,app}.test.js、README.md、devlog.md。

## 2026-09-09 — Axiom 独立服务

- 按用户要求在当前空间新建独立项目，不接入原主项目，不改其依赖、代码和文档。
- 实现 Node HTTP/WebSocket 服务、Pi SDK 适配、主会话、并行任务、delegate/read_result 两个工具。
- 使用原生 JS 模块与 Node 测试，省去构建环节；模块按传输、会话、任务、工具、Pi 适配分开。
- 无任务并发上限、超时、只读或结果截断；保留鉴权、输入校验、取消传播和慢连接保护。
- 会话与连接分离，重连使用快照；数据仅内存，重启不恢复。未配置系统服务、自启动或进程自动拉起。
- 验证：3 项自动测试通过；真实模型完成主 Agent -> delegate -> 两个子 Agent -> read_result -> 汇总；本地 HTTP 健康检查通过。
- 涉及文件：src/*.js、tests/*、package.json、package-lock.json、README.md、.gitignore。本机 .env.local、日志和 PID 文件不纳入版本管理。

## 2026-09-09 — Linear 网页入口

- 新增 public/ 输入页、模型/供应商/思考等级选择、流式输出。
- 修改 pi、sessions、protocol、server：提供模型目录、配置入口和子任务配置继承。
- 验证：自动测试、真实服务模型目录与思考配置、首页 HTTP 200、浏览器导航。
- 同步 README；未新增前端依赖。

## 2026-09-09 — 输入框下移

- 按用户要求将 public/index.html 的任务输入框移动到执行记录下方，保持原有交互；同步 README。
- 验证 HTML 元素顺序并重启服务加载页面。

## 2026-09-09 — 本机免令牌
- 按用户要求移除令牌配置、输入与认证；页面自动连接，仅保留本机 Host/Origin 检查。
- 更新 main/server、页面、README 和连接测试；4 项测试通过。

## 2026-09-09 — 输入快捷键与思考样式
- Enter 发送，Ctrl/Cmd+Enter 换行，保留 Shift+Enter 换行；中文输入法选词不触发发送。
- 思考正文改为斜体；涉及 public/app.js、index.html、style.css。

## 2026-09-09 — Markdown、会话、工作空间及输入栏
- 统一正文 Markdown 渲染，使用 marked 和 DOMPurify，测试格式与脚本清理；保留思考斜体。
- 增加会话列表、新建/切换/删除，工作空间目录选择，子任务继承目录。
- Esc 停止；模型/供应商/思考选择放到发送左侧。
- 涉及 public/*、src/{pi,sessions,server,protocol}.js、依赖与测试、README。
- 5 项测试通过，浏览器确认页面自动连接、模型和会话显示、Markdown 表格及按钮布局。

## 2026-09-09 — 输入工具栏单行
- 标签与选择框横排，发送区不换行；窄屏横向滚动，避免挤成两行。涉及 public/style.css。

## 2026-09-09 — 会话工作台布局
- 重写布局与样式为左侧会话导航、独立消息滚动、底部常驻输入区，保留 Linear token。
- 增加搜索、日期分组、活动排序、重命名，页面内草稿/滚动恢复，子任务折叠展示。
- 验证 5 项测试、浏览器输入区位置固定且无横向页面溢出。
- 本次未交付磁盘历史；确认 Pi 原生 SessionManager 可用于后续持久化，README 明确当前边界。

## 2026-09-09 — 用户消息去角色标签
- public/app.js 隐藏用户消息的“你”标题，保留消息正文及样式，覆盖新消息和历史恢复。

## 2026-09-09 — 模型选择工具栏协调
- 浏览器检查发现模型框被 flex 拉伸至 530px，取消强制填充，改为内容宽度、32px 等高控件。
- 统一深灰表面、细边框、箭头与思考标签；支持浏览器原生可样式化下拉面板，保留不支持时的原生回退。
- 涉及 public/style.css、public/app.js；浏览器验证四个控件同一水平线、等高，截图验证工具栏和模型菜单。

## 2026-09-09 — 代码复核与渲染性能
- 阅读 src/public/tests 全链路，删除全 live 重绘、思考触发正文重算、重复任务恢复、多订阅 Map 和重命名全快照复制。
- 新增 stream-renderer.js：仅 dirty 消息按帧更新、折叠思考延迟显示、展开后追加 Text 节点；切换清理待绘制。
- Markdown 保留未变块 DOM，完整 lexer 保证引用/列表等语义，保留 DOMPurify。
- 合并滚动、并发列表请求，修复旧会话发送回执清空新草稿与 Windows 路径显示/匹配；子任务模型直接初始化，非法思考配置回滚。
- 源码统一格式化，未增加运行依赖。新增 tests/stream-renderer.test.js、tests/benchmark.js，扩充 Markdown 回归。
- 验证 6 项测试、npm audit 0 vulnerabilities；真实浏览器模型输出标题/列表/代码块通过。浏览器微基准中位数 391ms -> 148ms；Node/JSDOM 同负载 2603ms -> 298ms，仅作渲染微基准。
- 仍保留内存会话；持久化、超长单块增量解析不在本次实现。

## 2026-09-09 — 质量、性能与页面体验优化
- 原 axiom/ 全部未跟踪：在功能 worktree（feat/axiom-quality）复制源码并提交现状基线，未复制凭据、node_modules、PID 或运行日志；保留原工作区及 4319 服务。
- 渲染：折叠子任务仅更新文本缓存，跳过帧调度和 Markdown 解析，展开补绘；覆盖流式、最终结果与快照。历史任务按首条消息放置，避免任务详情全部跑到用户请求之前。
- 传输：合并重复静态资源注册，启动时生成 ETag，no-cache 强制校验、命中返回 304；保持 CSP、DOMPurify、输入校验与本机连接限制。
- 交互：断线不隐藏消息，允许继续写草稿，重连前保存最新输入；注册握手失败关闭处理，避免无法重试。保留草稿高度和滚动、修复带空白的发送回执、避免列表刷新失败误删已发送消息，修复跨会话重命名回执，删除会话释放草稿。
- 页面：统一暗色层级、留白、输入区焦点和任务状态；手机侧栏覆盖显示，支持遮罩 / Esc 关闭及焦点返回，主区 inert 防误操作。窄屏仅模型选择区滚动，发送按钮固定可见；去除重复 CSS，补充搜索空态和本地 SVG 图标，不新增依赖。
- 验证：npm test 7 项全部通过（新增 JSDOM 页面链路回归，扩充折叠任务和 HTTP 缓存检查）；npm audit --omit=dev 为 0 漏洞；git diff --check 通过。真实服务连接及模型目录可用；浏览器用模拟协议验证 Markdown/长内容/折叠任务，320、390、700、768、1440px 无页面横向溢出且发送按钮可见，控制台 0 错误，无付费模型调用。
- 可复现性能：node tests/benchmark.js，3 个任务 × 60 更新，展开 60 帧 / 180 次解析（本机一次 562ms），折叠 0 帧 / 0 次解析（四舍五入 0ms）。原有块渲染微基准 4964ms -> 551ms 是既有优化对全量重绘的对比，不归因于本次改动、不代表端到端加速。
- 涉及文件：public/{app.js,index.html,style.css,stream-renderer.js,favicon.svg}、src/server.js、tests/{app.test.js,stream-renderer.test.js,server.test.js,benchmark.js}、README.md、devlog.md。仍不做磁盘持久化、自动重连或额外前端框架。
- 交付：基线 87d2816、优化 65916cb 已推送 origin/feat/axiom-quality。尝试按规范合并 master，被主工作区未跟踪的 axiom/ 同名文件阻止，Git 安全中止；不强制覆盖或自动移动原代码。等待用户确认备份策略后再合并、推送 master 和清理 worktree。
- 保留独立预览 http://127.0.0.1:4320/（该 worktree 内运行，PID 记录在被忽略的 .axiom.pid），未重启原 4319 服务。浏览器截图留在当时 worktree 旁的 artifacts 目录，不提交生成图片。

## 2026-09-10 项目 skill：codebase-map 多级索引与排障

- 内容：新增项目级 skill `.pi/skills/codebase-map/`（SKILL.md / INDEX.md / knowledge.md / scripts/reindex.mjs）。多级索引：L0 架构图与模块职责（SKILL.md）→ L1 文件总览 → L2 符号→行号跳转表 → L3 横切常量（协议 command.type、HTML id、HTTP 路由），INDEX.md 由脚本毫秒级重建，用前/改后各跑一次保证实时。bug 知识库 knowledge.md 从 devlog 历史提炼 5 条，修复后追加实现自成长。新增 tests/codebase-index.test.js 守住生成逻辑。
- 原因：需要快速定位项目结构与按层排障，且索引和知识随代码改动同步成长，不腐烂。
- 涉及文件：axiom/.pi/skills/codebase-map/{SKILL.md,INDEX.md,knowledge.md,scripts/reindex.mjs}、axiom/tests/codebase-index.test.js、axiom/README.md、axiom/devlog.md。
- 分支：feat/axiom-project-skill（独立功能 worktree）。

## 2026-09-10 会话左右留白调整

- 按需求将主会话消息区和输入区左右留白统一为可用宽度的 5%，移除 880px 最大宽度；手机断点同步调整，保留原有上下间距和安全区。子任务浮层不变。
- 涉及文件：`public/style.css`、`README.md`、`.pi/skills/codebase-map/INDEX.md`、`devlog.md`。采用纯 CSS，不新增依赖或配置。

## 2026-09-10 skill 例行更新：codebase-map 怀疑点清单对齐新架构

- 内容：核查 skill 与近期 4 个功能合并（持久化会话/消息队列/子代理浮层/运行详情）的同步情况——MODULE_INFO、架构图、knowledge.md（+3 条）均已被功能分支按规则维护，索引零漂移（仅时间戳差异）。唯一缺口：SKILL.md 查 bug 怀疑点清单缺新区域，补 3 条（队列回执≠执行状态、子代理浮层定位约束、~/.axiom 持久化排查入口）。
- 原因：新功能落地后 skill 的排障指引未覆盖新增故障面。
- 涉及文件：axiom/.pi/skills/codebase-map/SKILL.md、axiom/devlog.md。
- 分支：feat/axiom-skill-refresh（独立功能 worktree）。

### 2026-09-10 会话操作、队列命名与连接恢复
- 内容/原因：操作入口移到左侧每条会话，固定图标空间并截断长标题；补齐 session-action 暗色样式和危险按钮悬停；修正设置选择器宽度、箭头与复用样式；统一 Send/Steer/Follow-up、Idle/Running 并直接说明效果；WS 退避重连避免后台启动后必须刷新。
- 涉及：public/app.js、public/index.html、public/style.css、tests/app.test.js、README.md、导航索引及坑库。
- 验证：新增按钮发送两类队列、初次失败自动重连/防并发、非当前会话重命名及删除确认测试；现有发送链路和 SDK 已支持队列，浏览器模拟 WS 验证两按钮可用，尚未复现用户原先的不可用情况，不凭猜测修改后端。

### 2026-09-10 会话条目统一外框
- 内容/原因：按反馈将选中边框和背景移到整行，包住标题与两个操作图标；垃圾桶与铅笔统一中性色，仅确认删除保留危险红色。
- 涉及：public/style.css、README.md、devlog.md、导航索引和坑库；保持标题省略与图标固定宽度。

### 2026-09-10 重启确认弹窗 UI
- 原因：快速/重建重启仍调用浏览器 confirm，与页面样式不一致。
- 改动：public/index.html、public/app.js、public/style.css 增加共享暗色重启 dialog，复用已有表单/按钮样式，默认取消焦点、Esc 关闭，确认时校验连接状态并避免重复提交。
- 验证：tests/app.test.js 覆盖两种模式的打开、取消、关闭、确认、重复提交与服务拒绝恢复；同步 README.md 和代码索引。

### 2026-09-10 统一跨平台文件选择器
- 原因：Windows 专用系统目录选择框与上下文文件选择界面割裂、图标单一，无法跨平台复用。
- 决策：调研 VS Code Explorer、Seti、vanilla FileExplorer 和浏览器 File System Access API；采用原生 dialog + 现有 WS/Node 文件系统，不引入框架/图标依赖，不递归扫描或读取内容。
- 改动：public/file-picker.js、file-picker.css 共用导航、地址、搜索、分页、确认、分类 SVG 图标和手机布局；app.js 统一工作空间/文件/文件夹入口，保留 Skill 与图片上传各自语义；src/sessions.js、protocol.js、server.js 增加 files.browse 和跨平台系统打开，删除 PowerShell picker；工作空间内 realpath 限界，主机模式可浏览可访问目录，每页 200 项。
- 防回归：tests/file-picker.test.js、app.test.js、workspace-picker.test.js、session-flow.test.js、server.test.js；README.md、导航架构/索引和坑库同步。
- 验证：npm test 初次 55 项中 54 通过；同步 master 的安装器/图片占位改动后复验 58 项中 57 通过、1 个非 Windows 平台测试跳过、0 失败；Windows Chromium 真浏览器 1280×900 / 320×640 检查文件浏览、图标、Esc 和弹窗无横向溢出，控制台无脚本/CSP 错误。macOS/Linux 桌面及 UNC 网络共享未实机验证。


### 2026-09-11 消息活动状态与工具详情
- 原因：中间工具/纯思考消息显示为空 AXIOM 卡片，用户无法判断进度与文件改动。
- 内容：连接/思考/工具动态状态，终态静态标识；连续纯思考显示合并但保留原消息 ID；工具默认紧凑并可展开参数、文本输出和实际/请求 diff。历史、子代理、取消、断线、重试、压缩边界同步处理。详情按需纯文本渲染，单节显示上限 60000 字符，保留完整持久化记录；write 不虚构新建/覆盖判断。
- 文件：public/app.js、public/style.css、tests/message-activity.test.js、README.md、索引与 knowledge.md。
- 验证：页面回归与新增活动测试通过；全量 npm test 在提交前运行。
- 追加决定：diff 支持统一/左右切换并记住手动选择；无已存偏好时窄屏默认统一、宽屏默认左右，窄屏展示强制统一。新增回归覆盖左右旧新配对与偏好保存。

## 2026-09-10 — 隐藏内部任务通知
- public/app.js 共享消息渲染入口隐藏内部任务完成通知，实时与历史共用，不改变模型上下文或后台投递。tests/app.test.js 覆盖字符串和内容块格式；同步 README 与索引。

## 2026-09-10 图片按占位位置送入模型
- 核实 Pi 0.85.1 TUI 粘贴：图片存临时文件，光标处插路径，正文原样提交，并非自动内联附件。
- 删除 public/app.js 每条追加的编号说明；src/inline-images.js 经 capabilities.js 内置 context 扩展按标记首次位置插图，仅转换模型副本，保留队列/存储及重复、漏标兜底。
- 更新 README、导航索引、knowledge；tests/inline-images.test.js 覆盖顺序与边界，app/capabilities 测试同步。
- 验证：npm test 86 通过 / 0 失败 / 1 原有跳过；真实 SDK 扩展加载测试验证 context 注册，Codex Responses 转换器实测请求块顺序 text → image → text（不调用远端模型）。

## 2026-09-11 00:10 活动动画统一、暗色提示与文字对比度

- 原因：用户反馈各处「进行中」图标样式不一、图标整体偏大，且原生 title 提示与暗色 UI 割裂、正文文字对比度不可调。
- 改动：
  - public/style.css：所有进行中状态（连接/思考/准备与执行工具，子代理卡片、浮层标题、输入区摘要）统一为 12px 细环——conic 渐变细边、无光晕、1.6s 一圈，颜色随所在组件语义色；思考文字后的 `...` 动态点固定 3ch 宽、1.2s steps 循环，不跳动布局；reduce 媒体查询补齐 `.task-run-spin`、`.thinking-dots`。活动图标底座 24→20px、SVG 16→14px、工具行网格列同步 20px，手机 44px 点击区保留。
  - public/tooltip.js + tooltip.css（新增）：事件委托接管全站原生 title，统一暗色浮层；悬停 0.5s/键盘聚焦显示，Esc/滚动/按下/移开关闭并恢复 title 与 aria 关联，触摸不干预，Popover API 优先，CSP 不放宽、无 inline style。
  - public/text-contrast.js + text-contrast.css（新增）：右上角「A」按钮 + 原生 popover，100–150% 按 10% 一档，仅提亮正文文字 token（--body-ink/--muted，钉回非文字用途），档位存 localStorage、默认 100% 不落盘，非法输入钳位。
  - public/app.js 接线两个模块并生成思考动态点；index.html 引入两份 CSS；src/server.js assets 表注册 4 个新静态文件。
  - 系统动画关闭/RDP 使 prefers-reduced-motion 匹配、动画全部冻结：用户开启系统设置后确认恢复，保留无障碍媒体查询，不新增应用内开关。
- 注意：新增静态文件必须注册 server.js assets 并快速重启服务，普通刷新拿不到新资源。
- 最终验证：npm test 111 项——110 通过、1 原有跳过、0 失败；conversation-ui.py 在 1440/390/320px 全通过、browserErrors=[]，覆盖对比度持久化/重置、提示、图标尺寸、1.6s 旋转、动态点固定宽与 reduce 冻结。修复 tooltip 外部 CSSOM 定位、popover 断链及跨间隙悬停问题；修复 localStorage getter 抛错防护并增加回归。
- 涉及文件：public/{app.js,index.html,style.css,tooltip.js,tooltip.css,text-contrast.js,text-contrast.css}、src/server.js、tests/{message-activity.test.js,conversation-ui.py,tooltip.test.js,text-contrast.test.js}、README.md、.pi/skills/codebase-map/{INDEX.md,knowledge.md,SKILL.md} 与本日志。

## 2026-09-11 01:30 导入 pi JSONL 会话

- 原因：Axiom 只能管理自己创建的会话，用户在 pi TUI / 其它入口积累的 `.jsonl` 历史无法过来继续对话。
- 内容：
  - 侧栏「导入 pi 会话…」复用共享文件选择器，默认从 pi 会话目录（`service.status` 新增 `importDir`）开始浏览；协议新增 `session.import({path})`，返回与 `session.create` 相同的快照，前端走原有 `switchSession` 链路。
  - `Sessions.importSession(file)` 校验首行 `session` 头与 `cwd`，工作空间取 `cwd`（目录不存在时退回本实例工作空间）；标题按「pi 会话名 → 首条用户正文（剥掉注入的 Skill 正文与标签）→ 文件名」取。
  - 导入是复制：JSONL 写入 `~/.axiom/workspaces/<sha256(cwd)>/<id>.jsonl`，与网页快照并存；`create()` 里代理创建失败会删除副本。`historyEntries()` 重建网页历史（带 entryId，压缩折叠关系保持）。删除 Axiom 会话只删副本，原 pi 文件不动。
  - 能力与模型沿用「默认新会话设置」，不读取原会话在 pi 里的供应商/模型选择。
- 文件：src/{protocol.js,sessions.js,server.js,main.js}、public/{index.html,app.js}、tests/{session-flow.test.js,app.test.js,service-api.test.js}、README.md、导航索引、knowledge.md 与本日志。
- 验证：npm test 114 项——113 通过、1 原有跳过、0 失败；新增用例覆盖复制文件、标题、历史 entryId、删除不触碰原文件、非法文件报错，以及页面导入按钮到工作空间切换。

## 2026-09-11 三按 Esc 收回已发出的输入
- 需求：发送后模型还没回复时，三次 Esc 把这条输入（含图片）收回输入框，避免重打；用户特别关心是否会打断供应商前缀缓存。
- 实现：只做后缀回退。SDK 公开接口 `AgentSession.navigateTree(用户消息 id)` 把叶子移回该条之前并重建内存消息，再补一条不参与上下文的自定义条目（`axiom_recall`）让分支落盘；历史前缀逐字节不变，之前的前缀缓存继续命中，重发同文本还能命中热缓存，代价只是被打断那一轮的缓存写入（编辑消息本来也要丢）。刻意不写「已撤回」占位、不摘要、不碰系统提示词与工具集。
- 门槛（不额外存标志、重启后仍成立）：这条之后出现回答、工具调用或工具结果就拒绝，只停止并保留原消息；被中断/失败的半截回答可以随输入一起丢弃（否则三按 Esc 在最常见场景下永远失败）。工具调用一律拒绝，避免回退后出现孤立 toolResult 与已发生的副作用。
- 手势：沿用原 300ms 计时结构。第一次按下开计时器；第二次按下取消计时器、记 300ms 窗口并保留原「停止」点击；窗口内的第三次按下才把 `recall: true` 带进那次队列撤回。单按、双按语义完全不变。
- 接线：protocol 的 `queue.withdraw` 增加可选 `recall`；`Sessions.withdraw(id, recall)` 先停稳再 recall、最后才清队列（被拒绝时队列原样保留，不吞消息），并按 `entryId` 截断网页历史；客户端撤回后重新 attach 重绘消息区（先 `saveView()` 保住草稿与附件），图片编号按草稿附件数重新对齐。
- 验证：npm test 121 项全绿（新增 tests/recall.test.js：无输出可撤回、流式中先停、有回答/工具调用/工具结果拒绝、无用户消息与取消导航返回 null、Sessions 截断历史与被拒绝时不吞队列）；tests/app.test.js 补真实按键序列，确认双按不撤回、三按带 `recall` 并重绘。另用真实 SDK 跑 SessionManager 脚本验证「分支 + 自定义标记」重启后仍生效（含被中断的半截回答不复活）。
- 文件：src/{pi.js,sessions.js,server.js,protocol.js}、public/app.js、tests/{recall.test.js,app.test.js}、README.md、devlog.md、codebase-map 索引与 knowledge.md。

## 2026-09-12 会话操作浮动菜单
- 根据截图反馈，将列表内展开操作改为三点右侧原生 Popover，窄屏向内避让；触发三点保持高亮，菜单使用现有 Linear raised/line/ink 与 8px 圆角，不挤动下方会话标题。
- 文件：public/app.js、public/style.css、tests/session-sidebar-ui.py、README.md、devlog.md、codebase-map 索引及知识库。
- 验证：Chromium 1440px/320px 检查位置、后续标题坐标不变、键盘/Esc/外部关闭通过；npm test 140 通过、3 项原有消息渲染失败、1 跳过。

## 2026-09-12 侧栏合并上线
- 按用户明确要求，将 feat/session-sidebar 合并到最新 origin/master（基线 2e47423），在独立集成 worktree 处理知识库追加冲突并重建生成索引，保留两边功能。
- 验证：侧栏相关 9 项测试全部通过；全量测试有 3 项消息/思考渲染失败，在未修改的最新 master 同样复现。记录既有失败后按用户要求合并推送，不声称全绿；主仓库未提交文件不动。

## 2026-09-12 会话侧栏整理与页签工作空间隔离
- 内容：每页签只展示当前工作空间；跨目录打开、预设启动和导入统一另开页签并提供被拦截时的链接，保留原草稿。固定「执行中 → 待继续 → 已完成」，按创建时间倒序逐日分隔，移除拖动和分组折叠；运行中优先展示，标题前使用 Linear success #27a644 绿色圆点。
- 决策：复用原完成标记 localStorage 与跨页锁，不新增依赖；会话操作收进原生 details，支持键盘、Esc、外部点击和手机触控。创建时间独立持久化，旧历史以 updatedAt 兼容，不能还原过去未保存的创建时间。
- 验证：创建时间与页签回归通过，Chromium 1440px/320px 验证分组、日期、绿点、操作展开/收起与边界；全量测试的思考展开和 collapsed-thinking 两处失败在干净基线 159d62a 同样复现，未冒充全绿。预览使用 PREVIEW_PORT=4397，未重启正式服务。
- 文件：public/{app.js,index.html,style.css}、src/sessions.js、tests/{app.test.js,workspace-tabs.test.js,session-created-at.test.js,session-sidebar-ui.py,conversation-preview.mjs}、README.md、devlog.md、codebase-map 索引/生成脚本/knowledge.md。

### 2026-09-12 首装网页引导与统一卸载

- 内容：空模型保持连接并复用模型设置；保留历史引用/草稿，配置后手动新建。新增 axiom uninstall 核对全局目录、安全停止、取消自启后仅卸载 Axiom。
- 原因：避免首装会话失败重连；HTTP 未启动时通过本地守护通道停止崩溃重试，不强杀活跃 worker。
- 涉及：public/app.js、scripts/service.mjs、scripts/uninstall.mjs、tests/model-onboarding-ui.test.js、tests/service.test.js、tests/uninstall.test.js、README.md、代码索引及坑库。
- 决策：保留 ~/.axiom 与 ~/.pi；旧守护进程须完整重启后才有兜底通道。

## 2026-09-12 重试卡内容边界与历史顺序修复
- 内容/原因：删除整条失败助手消息搬入重试卡的逻辑，正文、思考和工具留在消息流，消除旧失败消息跨轮误收。重试首次记录 messageCount，快照按相同边界恢复；旧记录没有位置保留末尾回退，不伪造顺序。
- 终态移除当前等待字段，成功清除当前错误；加载旧记录也规范化，history 保留每次失败原因。
- 验证：功能分支 npm test 184 通过、1 跳过；合并远端最新 master 后 192 通过、1 跳过。新增实时/快照顺序、内容隔离、旧记录回退、位置持久化及终态字段断言。未重启正式服务。
- 文件：public/app.js、src/sessions.js、tests/message-activity.test.js、tests/session-flow.test.js、README.md、devlog.md、codebase-map INDEX.md/knowledge.md。

## 2026-09-12 会话菜单支持复制 JSONL 源文件路径
- 内容：会话操作菜单在「新页签打开」与「重命名」之间新增「复制 JSONL 路径」，把会话 `.jsonl` 源文件的绝对路径写入剪贴板，便于在其他位置（如另一实例的「导入 pi 会话」）直接粘贴导入。
- 实现：服务端 `Sessions.list()` 返回 `sessionFile`（取 `agent.sessionFile()`，未落盘为 null）；前端 `copySessionFile()` 走 `navigator.clipboard`，按钮悬停反馈「已复制」，无文件或复制失败走错误条。复制是纯前端操作，断连时保持可用。导入的会话返回的是存储目录里的副本路径（导入即复制，原文件不动）。
- 验证：npm test 183 通过、1 跳过；tests/app.test.js 更新菜单子项断言并新增复制路径断言（`C:\axiom\b.jsonl`）。
- 文件：src/sessions.js、public/app.js、tests/app.test.js、README.md、devlog.md。
- 内容/原因：自动重试节奏改为 2、2、5、5、10、10、30、60、120、240、480 秒，之后翻倍、16 分钟封顶，最多 45 次（全部耗尽纯等待约 9.3 小时）；原为翻倍不封顶、最多 30 次。涉及 src/retry.js（新增 MAX_DELAY_MS 上限）、tests/retry.test.js、README.md。时间：2025-06。文件：src/retry.js、tests/retry.test.js、README.md、devlog.md。
- 内容/原因：重试支持自定义错误词表（会话配置 selection.retry）：白名单命中强制重试、黑名单命中不重试（黑名单>白名单>内建判定），字符串子串匹配、大小写不敏感；设置页新增芯片式编辑器（回车添加/× 删除/去重），子代理经会话配置继承；仅新建会话生效。涉及 src/protocol.js（retryPatterns schema）、src/retry.js（classify 词表）、src/pi.js、src/sessions.js（defaultSelection/item/子代理透传）、public/app.js、public/index.html、public/style.css。时间：2025-06。文件：上述 + tests/retry.test.js、tests/config.test.js、README.md、devlog.md。

### 2026-09-12 修复卸载 CLI 循环等待
- 症状：axiom uninstall 报 unsettled top-level await，未执行卸载。
- 根因：service 顶层等待动态导入 uninstall，uninstall 又静态导入尚未完成求值的 service。
- 修复：显式传入 run/stop/npm，删除反向导入；涉及 scripts/service.mjs、scripts/uninstall.mjs、tests/uninstall.test.js、README.md 及索引。
- 验证：新增真实 CLI 子进程测试，以不存在的 npm 隔离实际安装和用户数据。

### 2026-09-12 增加 axiom help
- 内容/原因：提供命令行用法、停止及卸载的数据保留说明，支持 help/--help/-h；帮助不加载本地环境或启动服务，无效参数非零退出。
- 涉及：scripts/service.mjs、tests/cli-help.test.js、README.md、代码索引。
- 验证：真实 CLI 子进程检查三个帮助入口及错误参数。

### 2026-09-12 服务维护层按最终 HTTP 契约重写（服务设置重构）
- 内容/原因：维护通道对齐 scripts/maint-server.mjs 实际实现——GET /status 扁平记录（operation/status 枚举/phase/phases/startedAt/error/log），POST /recover 严格 body（仅 {"mode":"quick"|"rebuild"}，要求 application/json，多余键 400）；凭证仅缓存 loopback http（^http://127.0.0.1:\d+$）+ 非空 token 于 sessionStorage；fetch 5s 超时即 abort（AbortController + finally clearTimeout），轮询防重叠（在飞跳过）；在线与断线都轮询（重启准备阶段可观测），每次以权威 state 更新重启锁（准备阶段失败 worker 在线时靠轮询解锁，提交后守护记账前 5s 宽限防提前解锁）；service.status 暂不带 operation：apply 无字段时保留 lastState 不抹历史；阶段名本地化（未知原样）；恢复改为面板「尝试恢复服务」按钮手动触发（#service-recover，index.html 新增），前端不自动再起，自动重试/限流归守护；真实 HTTP 集成测试（真实 maint-state + maint-server + 真实 fetch）验证 404/400/409/202、扁平字段、日志脱敏、前端端到端渲染。
- 涉及：public/service-settings.js（重写）、public/index.html（+恢复按钮）、README.md、devlog.md、tests/service-settings.test.js（重写：8 项含真实 HTTP 契约实测）。
- 验证：node --test tests/service-settings.test.js tests/app.test.js 11/11 通过、自然退出；全量除后端进行中的 service.test.js 外 207 passed 1 skipped；索引失败仅后端 3 个未登记文件（maintenance-contract.md、service-settings-api.test.js、service-settings-ui.py），待统一重建。

### 2026-09-12 — 4320 原地依赖修复与独立重载
- npm ci 遇到运行中原生模块的 Windows 文件锁（EPERM），改用 npm install 补齐依赖；SDK 导入和 service-settings-api 测试通过。还原 npm 自动补写的锁文件元数据，不变更依赖版本。
- 不再等待当前代理自身空闲：临时独立进程限时重试 4320 安全停止入口，当前回复结束后接手启动 scripts/dev.mjs 并记录健康检查；不强杀、不操作 4319。重载结果写入系统临时目录 axiom-reload-4320.log。
### 2026-09-12 会话运行绿点包含子代理
- 原因：主代理空闲后，列表仅返回主代理状态，仍执行中的子代理被漏算，绿点提前熄灭。
- 修改：src/sessions.js 在列表聚合 starting/running 子任务；不改变主代理输入、排队与通知状态机，不改现有绿色样式。README.md 同步语义。
- 验证：tests/task-notifications.test.js 覆盖子代理启动、主轮提前结束、部分完成、主代理处理通知、全部完成及取消。同步代码索引与坑库。
- 验证结果：npm test 209 项，208 通过、1 跳过、0 失败；git diff --check 通过。复用可见页面每 5 秒的后台列表刷新，不增加订阅或改变视觉 token。

### 2026-09-12 中文标点旁的加粗标记不渲染
- 原因：CommonMark 侧翼规则在 `**` 紧贴中文标点+紧邻文字时拒绝开/闭，正文星号原样显示（用户截图场景）；思考区不加粗为既定设计，不改。
- 修改：public/markdown.js 增加 fixCjkBold 预处理（仅围栏外，成对 `**` 首尾标点移出，渲染文本不变）；tests/markdown.test.js 补 4 条断言。README 无需改（318 行描述的「强调」行为本就应含中文）。
- 验证：npm test 三轮 225 项（224 通过、1 跳过、0 失败）；真实渲染探针覆盖截图原文/冒号/引号/正常加粗。有一轮曾出现 expected 2 的抖动断言，随后同代码连续三轮全绿，按既有基线抖动记录，不归因本次改动。

### 2026-09-12 — 恢复后端工作：models.provider.discover 只读拉取 + Ollama 冒号收藏修复（Axiom-model-settings-recovery）
- 背景：旧 worktree F:/worktrees/Axiom-model-settings 被清空，未提交工作不可恢复；本条记录在 F:/worktrees/Axiom-model-settings-recovery（分支 feat/model-settings-recovery，基线 cb7686f）重建全部改动，未 git 提交（交主代理验收合并）。
- 冒号修复恢复：src/model-config.js validFavoriteKey 删除 model key 禁冒号行，model 组整体作 modelKey（colon=-1），thinking 组仍按最后冒号切分等级；docs 收藏章节改为「允许模型 ID 中的冒号，如 ollama/llama3.1:8b」；tests/model-config.test.js 冒号拒绝断言改为正向回归（收藏/持久化/无 thinking 误匹配）。
- discover 新增（只读）：protocol.js 加 z.literal("models.provider.discover")+providerId strict schema；model-config.js 深加载 SDK resolve-config-value.js（$VAR/$ {VAR}/$$/$! 真实插值，!command 拒不执行），DISCOVER_APIS 四 api 类型（openai-completions/responses、anthropic-messages、google-generative-ai，官方接口已核实），redirect:"error" 防 Key 外泄、15s 超时、响应体 5MiB 上限、>500 条截断，错误全部固定中文文案+HTTP 状态码不含请求头/密钥/上游响应体；不写盘、不触发 refreshModels、不广播、无 baseFingerprint。
- 限制内未改 src/server.js，主代理需补：case 组（src/server.js ~295 行）加 case "models.provider.discover" 走 service.models.handle；广播分支（~305 行）排除 discover（只读不得触发 models.config.changed）。
- 验证：worktree 本地 npm ci（旧 node_modules 是指向主仓库残缺 SDK 的 junction，pi-coding-agent dist 整体缺失，共享路径全部 ERR_MODULE_NOT_FOUND）；tests/model-config.test.js 18/18（含 7 个 discover 套件）、tests/model-thinking-favorites.test.js 1/1（Ollama 冒号键回归）、全量 tests/*.test.js 270 项 0 失败（model-manager XSS 断言曾单次抖动，复跑稳定全绿）。mock 保真度修正：redirect 拒绝场景改为 mock 抛 TypeError 模拟 undici 真实行为（原 mock 返 302 响应对象绕过了 redirect:"error" 逻辑）。

## 2026-09-12 12:20 — 模型管理验收收尾
- README 同步分栏设计来源、只读拉取并勾选添加、思考收藏键与浏览器回归命令；reindex 登记新增测试。
- tests/model-selection-preview.mjs 使用隔离供应商与 mock discoverFetch，并去除配置中的运行时回调，修复 structuredClone 导致预览无法连接。
- 新增 tests/model-settings-ui.py：思考收藏刷新持久且不切换、拉取后仅保存勾选项、1440/390/320 布局；两份浏览器回归通过。全量 npm test：274 通过、1 跳过、0 失败。

## 2026-09-12 SQLite 统一配置与管理
- 原因：摘要 JSON 替换在 Windows 报 EPERM；用户要求跨平台配置页与 SQLite 权威存储，API Key 明文保存。
- 内容：新增 database/pi-model-storage，迁移 sessions/model-config/remote/maint-state 的管理数据；main/pi/server 接线，摘要设置页、模型页文案与协议同步。保留 Pi JSONL，迁移按文件幂等、缺失历史不覆盖；Node 支持范围升为22.13+（22.x）或24+。
- 验证：数据库、迁移、凭据真实 SDK、配置 UI、守护测试均有回归；全量最后一项守护时序测试首次失败、单独重跑15/15通过，最终全量复跑275项：274通过、0失败、1跳过。

## 2026-09-12 记忆与任务按变更增量落盘（事件级 save 契约）
- 原因：每个摘要/触发器/进度事件都触发全会话 persist（整行序列化重写），写入放大且随任务数增长；主审接线单任务/单变更保存需要精确的变更描述。
- 修改：src/session-memory.js 的 memoryHooks(item, save, job) 保持同步时序，save 改为 save(change) 描述变更：{summary:record}、{event:{type:"summary_trigger",record}}、{turn:{agentId,turn}}、{title:true}、{progress:{taskId,record}}、{delivery:record,delivered:[{taskId,progressId}]}；一次 onReply 多变更合并同一 change，无变更不调用 save；失败回复只结算 trigger；交付记录赋稳定 id、保留 50 条审计。src/tasks.js 新增 createdAt/updatedAt（publish 刷新 updatedAt），snapshot() 复用 snapshotJob(job)；publish 广播 {type:"task.state",taskId,data:安全view含runtime,saved:完整单条快照}，saved 含 parentContext/resultId/notified/progress/runtime，广播前由主审剥离；runtime 事件仍只更新内存不逐 token 写。tests/session-memory.test.js 修复 Sessions 测试库隔离（storagePath 用 root/storage，库落各测试独占 Temp root，不再共享公共 Temp axiom.db），新增变更契约断言；tests/tasks.test.js 新增 data/saved 分离断言。
- 验证：node --test session-memory+tasks 12 项通过；session-flow/task-notifications/message-activity/session-persistence/session-created-at 25 项通过；app.test 3 项通过。

## 2026-09-12 模型存储修复：部分成功回执、导入自愈、临时文件加固
- 原因：审查确认三处缺陷——writeConfig 先库后派生后刷新产生部分成功但向上抛错（UI 误判保存失败而权威已变）；旧配置导入坏文件即打迁移标记，用户修复原文件后永远无法重导；compat 原子写临时文件名可碰撞且 writeFile 失败路径泄漏临时文件、rename 无瞬时占用重试。
- 内容（src/pi-model-storage.js + src/model-config.js + 两个对应测试）：
  - writeConfig 拆为两阶段：仅权威落库；派生兼容文件由调用方经 syncCompatFile 显式重建。saveProvider/saveModel/deleteProvider/deleteModel 落库成功后派生/刷新失败时不再抛错，返回 `{fingerprint, applied:false, applyError(脱敏截断)}` 并记挂起状态；库写入失败照常抛。models.config.get 读取路径顺带重试挂起应用（GET 幂等、不重放 mutation），响应新增可选 `applyError`（有 = 已保存未应用，无 = 已应用），重试成功即清除；无挂起时 GET 不额外刷新。同一 fingerprint 重试保存仍可重新派生应用（乐观锁照常通过，apply 幂等）。不新增协议类型，server/ui 由主审接线。
  - 导入门闩改为仅成功后打标记：读失败/坏 JSON/结构拒绝只记去重告警（同源同消息只记一条）且不打标记，修复原文件后下次 init 自动重导；导入干净时清除该来源陈旧告警。混合坏 auth：好条目入库、坏条目告警、权威已有 providerId 一律不覆盖（UI 新值优先），修复后补导入。凭据 modify 本进程串行语义保持，不加跨 await SQL 事务、不做多 worker。
  - compat 临时文件改 randomUUID 唯一名，write/rename 任一步失败完整清理；rename 瞬时占用（EPERM/EBUSY）有限退避重试 2 次，绝不先删目标；校验临时文件同样 randomUUID 并把 writeFile 移入 try/finally。
- 验证：npm test 全量 288 项 287 通过 0 失败 1 跳过（此前 service.test.js 偶发失败为基线时序抖动，stash 对比确认与本分支无关）；新增 7 条故障注入测试（compat 失败回执+同指纹重派生、refresh 失败回执、GET 自愈、修复坏源再 init、混合 auth 不覆盖新值、告警去重、rename 失败清理临时文件）。测试全部使用独立临时目录，未触碰真实配置。
- 涉及文件：src/model-config.js、src/pi-model-storage.js、tests/model-config.test.js、tests/pi-model-storage.test.js、README.md。

## 2026-09-12 SessionStore 四表实体存储（feat/sqlite-storage）
- 原因：单会话整 JSON 每次保存全量重写，通知/进度高频更新代价大，且无法按实体增量查询。
- 内容：新增 src/session-store.js——sessions/summaries/session_events/tasks 四表 + store 配置表保留；事件身份 (session_id,type,agent_id,key) 部分唯一索引；tasks 元数据列（memory_turn/notified/progress_delivered/progress）权威、record 存任务内容，仅元数据变化只 UPDATE 列不读不写大 record；无 id 摘要 `anon-<sha256前20>` 稳定 id；change(work) SAVEPOINT 供多实体原子变更；importLegacySession/migrateLegacy 单事务迁移（坏行告警保留源、精确标记、幂等不覆盖新表）。src/database.js：busy_timeout 先于 journal_mode、外键 ON、暴露 prepare/exec、list() 坏行逐行隔离且告警只报键位不带内容。
- 验证：node --test tests/database.test.js tests/session-store.test.js 18/18 通过；全量 268 项中 9 个失败经基线（stash 后重跑）确认为既有环境性失败，与本次无关。
- 涉及：src/database.js、src/session-store.js、tests/database.test.js、tests/session-store.test.js。集成（sessions.js 接线、README）由主审后续处理。

## 2026-09-12 迁移安全收口：脱敏补漏 + 首次导入前 VACUUM INTO 备份
- 原因：主审确认两处硬阻塞——database.js get() 裸 JSON.parse（Node 21+ SyntaxError 携带原文片段）与 list() 告警拼接 error.message 均可泄露存储原文；importLegacySession 原注释把库级备份推给调用方，但集成层没有 VACUUM 入口。
- 内容：get() 解析失败抛脱敏错误（只报 namespace/key）；list() 告警去 error.message 只报键位；Database 暴露只读 path；importLegacySession 在每次真正导入前（已标记跳过/新表同 id 跳过不触发）自动 VACUUM INTO 到 <主库>.pre-store-migration.db，快照已存在则保留首次快照不覆盖，备份失败即抛错中止迁移。
- 验证：node --test tests/database.test.js tests/session-store.test.js 22/22 通过（新增 get 脱敏断言、备份生成/快照可读/不覆盖/跳过路径不备份等用例）。
- 涉及：src/database.js、src/session-store.js、tests/database.test.js、tests/session-store.test.js。

## 2026-09-13 05:20 UTC SQLite 集成：增量写、懒加载与安全收口
- 内容：集成 A/B/C/D 提交，sessions 接 SessionStore 增量描述，失败增量保留重试、SAVEPOINT 全有全无；新建落库/历史装配失败释放 SDK 与导入副本。启动仅取元数据，首次打开去重恢复，未加载改名和关闭重试失败队列；server attach 序号防迟到订阅，加载中停止拒绝。默认配置与预设迁移独立，恢复历史 ID 用 Map 与单向游标。任务终态只存一次，通知前重检主轮状态，通知确认只改单任务列。
- 模型：页面保留已保存未应用状态和新指纹，重读即可重试应用，不重放 mutation；错误只暴露固定提示及已知 errno，不把截断当脱敏。迁移坏 JSON 日志同样不携带解析原文。
- 迁移：A 采用嵌套 SAVEPOINT 后撤回事务回归转绿；主审追加唯一临时备份+成功更名，失败残片清理，避免下次 exists 误判成功；SQL 排除已迁移旧源，只取待迁移键再单条解析，避免重启读全部大 JSON。不做双写、反向迁移或回滚框架，保留旧源与一致性备份。
- 权限复现：WSL Ubuntu 22.04 / Node 22.23.1 / Linux 临时目录中，原实现主库600、WAL/SHM644；根因 chmod 在 WAL 建表后。现打开连接前创建/收紧主库与已有 sidecar（不改共享目录），新 sidecar 继承600；POSIX 权限失败显式拒绝。Windows Node24 临时目录 icacls 实测为继承ACL（含本机用户、系统、管理员及额外继承SID），不宣称 chmod 能隔离 ACL，不触碰用户目录权限。
- 验证：权限改动前全量321项：320通过、0失败、1原有跳过；存储/迁移/持久化38/38。权限改动后 Linux 数据库+存储25/25（包括新旧 sidecar600、备份失败再试、重复迁移不读源）；Windows同组24通过、1平台跳过。全量最终复跑与独立复核/性能报告继续收口。
- 涉及：src/{sessions,server,session-store,database,model-config}.js、public/model-manager.js、tests/{capabilities,compaction-config,model-config,model-manager,recall,service-api,session-flow,session-memory,session-migration,session-persistence,task-notifications,database,session-store,service}.test.js、README.md、docs/sqlite-refactor-plan.md、codebase-map三层索引/知识。
- 全量复跑曾复现既有 `rebuild cancels swap` 时序失败（workers 1≠2）：service.mjs 先 state.fail 落盘才 fork 恢复进程，测试误把 status failed 当恢复完成。tests/service.test.js 复用 until 等真实 ready 且 workers=2，再保留原严格断言；不加固定 sleep、不降低判定、不改守护产品逻辑。定向复跑另外暴露测试桩直接覆写 maint-env 被读到半截 JSON，改为完整临时文件后 rename；随后全量322项：320通过、0失败、2跳过（原有平台用例及Windows跳过POSIX权限测试，后者已在Linux实跑）。

## 2026-09-12 22:40 — 模型设置合并最新 master
- 原因：用户要求合并并推送；master 已迁移 SQLite，保留新存储实现并适配 discover 只读加载、收藏断言及隔离预览，保留分栏与勾选导入。涉及 src/model-config.js、public/model-manager.js、模型测试与预览、README、协议、索引；合并双方 devlog/knowledge 记录。
- 验证：两份 Playwright 回归通过；全量最终 299 通过、1 跳过、0 失败。此前守护测试出现恢复时序断言与 Windows EBUSY（单独15/15通过），未为此次合并改动守护逻辑。

## 2026-09-13 08:35 — 设置面板 API 协议下拉改为应用既有下拉外观
- 原因：用户反馈「API 协议」仍是全宽原生 select，原生箭头+浅蓝高亮的弹层样式与面板整体割裂，要求对齐应用内既有的紧凑下拉（截图：composer 底部 commandcode / DeepSeek V4.1 Flash / max 三个控件）。
- 内容：`public/model-manager.js` 新增 `selectControl()`，把「API 协议」「API 协议覆盖」两个 select 包进 `span.selectors.mm-select > label`，直接复用 `style.css` 里 `.selectors select`（深色 raised 底、6px 圆角、32px 高、右内边距 28px）与 `.selectors label:has(select):after` 的 CSS 小箭头；删除 `model-manager.css` 里会被同权重覆盖、且会把 28px 右内边距压掉的 `.mm-field select` 旧规则，改为两行局部微调（`.mm-select { flex:none; padding:0 }`、`.mm-select select { max-width:100% }`）。
- 验证：Playwright 截图 900/420/360px 与参考图一致（紧凑圆角下拉 + 小箭头）、无横向溢出；`node --test tests/model-manager.test.js` 24/24；全量 `npm test` 296 项 293 过 1 跳过，2 项失败集中在 `tests/workspace-tabs.test.js`（并发负载抖动，单独跑 8/8 全绿）。
- 涉及：public/model-manager.js、public/model-manager.css、devlog.md、.pi/skills/codebase-map/index。

## 2026-09-13 08:55 — API Key「显示」复选框改为小眼睛图标，并澄清密钥不回显
- 原因：用户指出「已配置（掩码值）——留空保留 / 输入新值替换」+「☐ 显示」的写法有误导——勾选后并不会显示已存密钥（后端 GET 只回传 `{masked,kind}`，前端永远拿不到明文），看起来像坏掉的开关。
- 内容：`public/model-manager.js` 里把 `显示` 复选框换成输入框内右侧的小眼睛图标按钮（`ICONS.eye` / `ICONS.eyeOff` 两条路径，点击切换 `type` 与 `aria-pressed`，同时更新 `title`/`aria-label`）；文案改成「已配置（掩码值）——留空保留」+ hint「密钥不回显（只能看到「已配置」）。留空 = 保留，输入 = 替换，勾「清除已存」= 删除；小眼睛只看本次输入」。`public/model-manager.css` 把输入框与小眼睛包进 `.mm-key-input` 定位容器（`.mm-key .mm-key-input input` 加 34px 右内边距，按钮绝对定位右 5px 居中，`aria-pressed=true` 时高亮），「清除已存」复选框仍在字段行内、不被覆盖。
- 验证：Playwright 实测（900/420px）点击后 `type` 变 `text`、`aria-pressed=true`、图标换成斜杠眼、无横向溢出，截图确认小眼睛叠在输入框右端；`tests/model-manager.test.js` 24/24（新增小眼睛切换 + 回显后输入框仍为空的断言）；全量 `npm test` 305 项 304 过 1 跳过 0 失败。
- 涉及：public/model-manager.js、public/model-manager.css、tests/model-manager.test.js、devlog.md、.pi/skills/codebase-map/index。

## 2026-09-13 09:20 — 设置面板两处排版修补：Bearer 鉴权行、摘要记忆数值字段
- 原因：用户反馈「高级连接 → Authorization: Bearer 头」看不懂且没对齐；「摘要记忆」三个数值字段排版不行（长句子换行后读不出对应关系：主代理每 [3] / 轮提醒一次摘要 分两行）。
- 内容：
  - Bearer 行（public/model-manager.js / model-manager.css）：字段名改「Bearer 鉴权」，复选框文案改「自动附加 Authorization: Bearer <apiKey> 请求头」，新增 hint 说明作用与边界（多数 OpenAI 兼容网关需要；自定义请求头里已写 Authorization 时不覆盖——与 src/model-config.js:379 行为一致）。根因修复：`.mm-advanced .mm-check` 的 `align-items: flex-start` 让 14px 复选框浮在 17.6px 行高文字的上方，改回 `center`（实测 boxCenterOffset 1.8px → 0）。
  - 摘要记忆（public/index.html / style.css）：三个字段从句子式内联（`主代理每 [input] 轮提醒一次摘要`）改为堆叠式 `.memory-field`（标签在上、输入框 + 单位在下），文案改「主代理提醒间隔 / 子代理提醒间隔（轮）」「单条摘要上限（字）」；新增 `.settings-selectors:has(> .memory-field)` 加大列间距，输入框收到 32px 高、12px 字（原全局 input 规则是 40px/16px）。
- 验证：Playwright 实测 1280/900/420px——三字段标签均单行、输入框 104×32、单位与输入框同一行、无横向溢出；Bearer 复选框 14×14 且与文字垂直居中对齐（offset 0）；全量 `npm test` 305 项 304 过 1 跳过 0 失败。
- 涉及：public/model-manager.js、public/model-manager.css、public/index.html、public/style.css、devlog.md、.pi/skills/codebase-map/index。

## 2026-09-13 09:40 — 设置弹窗滚动时分类列固定
- 原因：用户反馈设置弹窗滚动后左侧分类（默认新会话设置 / 远程控制 / 模型与供应商 / 服务与更新）跟着滚走，切分类得先滚回顶部。
- 内容：`public/style.css` 把 `.settings-layout` 由整块滚动改为 `overflow: hidden`，分类列与右侧面板各自成为滚动容器（`#settings .settings-nav, #settings .settings-body { min-width: 0; min-height: 0; overflow: auto; scrollbar-gutter: stable }`）；≤700px 单列布局回到整块滚动，但分类列改 `position: sticky; top: 0; max-height: 45dvh`（配 `background: var(--surface)`、`z-index: 2`），窄屏滚下去同样能看到分类。
- 验证：Playwright 用真实 dialog 片段（index.html 的 `#settings` 块 + 造 60 段占位内容）实测 1200/700/420px：滚到底后分类列 `navTop` 完全不变（145/145/141），右侧内容分别在自身容器内滚动；全量 `npm test` 305 项 304 过 1 跳过 0 失败。
- 涉及：public/style.css、devlog.md、.pi/skills/codebase-map/index。

## 2026-09-13 10:10 — 内置/扩展供应商与模型可隐藏（models.hidden.set）
- 原因：内置目录与模型选择器条目只增不减，用户不想再选到的模型会一直出现在候选里；需要一个不影响 Pi 运行时的纯 Axiom 侧隐藏入口。
- 内容：新增 `models.hidden.set { key, hidden }` 协议命令（key = 供应商 id 或 `provider/id`），SQLite models 命名空间新增独立 `hidden` 键（不写 models.json，SDK schema 只认 provider 定义）；`model-config.js` 的 `listCatalog()` 过滤隐藏项（供应商级隐藏在有同名自定义覆盖时让位），`models.config.get` 回传 `hidden` 清单；`server.js` 的 `models.list`（选取入口）改用过滤后目录，Pi 运行时 `catalog()` 不动；模型管理页目录行加隐藏图标 + 二次确认弹窗，隐藏清单集中在左侧「已隐藏」页一键恢复。
- 验证：全量 `npm test` 307 项 306 过 1 跳过 0 失败（含新增 models.hidden.set 测试：单模型/整供应商隐藏、覆盖让位、恢复幂等、未知 key 与非法载荷拒绝、models.json 不被污染）。
- 涉及：src/protocol.js、src/server.js、src/model-config.js、src/pi-model-storage.js、public/model-manager.js、public/model-manager.css、tests/model-config.test.js、README.md、devlog.md、.pi/skills/codebase-map/INDEX.md。
## 2026-09-13 10:10 — 修复跨行 `<axiom_summary>` 导致闭合标签漏进正文、摘要未入库
- 原因：用户截图里助手正文末尾出现裸的 `</axiom_summary>`。根因是 `public/memory-tags.js` 的 `TAG` 正则内容用 `[^\n]`，只认单行有界标签；模型实际把开启标签、正文、闭合标签分三行写。按行处理时：开启标签行同行无闭合 → 整行丢弃；正文行无标签 → 原样保留；闭合标签行不匹配 `OPEN`（`<name>` 而非 `</name>`）→ 原样保留，Markdown 把正文与闭合标签并成一段就成了截图效果。同一原因下 `extractMemoryTags` 也提取不到，该条摘要没入库（trigger 记 missing）。
- 内容：`public/memory-tags.js` —— `TAG` 内容改 `[\s\S]`，标签可跨行，提取时 `replace(/\s+/g," ")` 把换行折叠为空格；新增 `segments()` 按代码围栏把连续同类行合成段，段内整段匹配（围栏内仍原样保留）；strip 用 `HOLE`（`\u0000`）占位替换被删标签，整行只剩占位符才丢弃以免留空行；首个无配对闭合的开启标签截到段尾（流式中的摘要整块隐藏）；新增 `CLOSE` 正则删除落单闭合标签，兜住开启标签丢失（跨围栏、被截断）时的漏出。
- 验证：`tests/memory-tags.test.js` 旧断言 `extractMemoryTags("<summary>跨行\n不认</summary>") === {}` 翻转为 `{ summary: "跨行 认" }`；新增两条测试覆盖截图那种标签独占行的跨行摘要（入库 + 整块隐藏）、裸闭合标签、开启标签落在围栏内、以及流式闭合前整块隐藏。`npm test` 308 项 307 过 1 跳过 0 失败。
- 涉及：public/memory-tags.js、tests/memory-tags.test.js、README.md、devlog.md。

## 2026-09-13 10:20 — 异常停止后在会话流末尾增加手动重试（续跑）入口
- 原因：自动重试只覆盖「可恢复失败」，手动 Esc 停止（归为 cancelled）与终态错误停下来后没有任何再来一次的入口，只能重打一遍输入；用户明确要求按钮贴在被打断的位置，不放发送区。
- 内容：
  - `src/retry.js`：抽出并导出 `dropFailedAssistant(session)`（仅移除末尾失败/截断的助手消息，末尾是 user/toolResult 时空操作）与 `canResume(session)` + `RESUMABLE_STOP_REASONS`（`error/aborted/length/toolUse`）；只认异常的正面证据，`stopReason=stop` 与缺失 `stopReason` 都不给重试（宁可漏不可误，避免测试/历史里无 stopReason 的消息误挂按钮）。createAutoRetry 内部改用导出版本，行为不变。
  - `src/pi.js`：agent 返回对象新增 `resumable()` / `resume()`。resume 清 `lastResult` 后 `retry.run(() => { dropFailedAssistant(session); return session.agent.continue(); })`——不重发用户输入，续跑再失败仍吃自动退避；故意不跑 compaction（maybeApply 会重写消息数组，与 continue 靠末尾接续的前提冲突）。
  - `src/protocol.js` / `src/server.js`：新增 `session.retry` 命令（`{ id, type, sessionId }.strict()`）与分发 `data = { runId: await sessions.retry(request.sessionId) }`。
  - `src/sessions.js`：从 `prompt()` 抽出 `startRun(item, run)` 运行骨架（runId/status 广播 → run() → result() 取错 → 收尾持久化 + idle 复位 + scheduleTaskNotifications），`prompt()` 与新增的 `retry(id)` 共用；retry 在启动前同步校验 `status==="idle" && !configuring && !closing && agent.resumable()`，不可续直接抛错给回执，不留 running→idle 空转。
  - `public/app.js` / `public/style.css`：新增 `lastMainMessage`/`interrupted` 状态与 `canResumeMessage`（服务端规则的前端副本）；`syncRetryPrompt()` 维护单例 `.retry-prompt` 节点（提示 + 「↻ 重试」按钮 → `request("session.retry", { sessionId })`），按 interrupted && 空闲 && 已连接 && 有会话 append/remove 到 `#output` 末尾；`agent.message.end`(main) 更新 lastMainMessage，`session.state` running 清标记、idle 重判，刷新恢复时从 `messages.findLast(agentId==="main")` 初始化。样式复用 retry-card 同款 `--line/--surface/--muted` token。
- 验证：新增 `tests/manual-retry.test.js` 5 项（canResume 正负样本、dropFailedAssistant 三种末尾、sessions.retry 续跑/回执 runId/忙碌与不可续守卫不广播状态/续跑再失败仍回 idle、protocol strict + server 分发、前端入口显隐与点击载荷）；全量 `npm test` 311 项 310 过 1 跳过 0 失败。
- 涉及：src/retry.js、src/pi.js、src/protocol.js、src/server.js、src/sessions.js、public/app.js、public/style.css、tests/manual-retry.test.js、README.md、devlog.md、.pi/skills/codebase-map/index。

## 2026-09-13 04:30 — worktree 流程补充「任务完成后自动合并 master 并推送」
- 原因：用户要求任务完成后自动拉取最新 `master`、完成主从合并并推送，不再每步征求确认。此前流程写的是「提交并 push → 合并回 master 并推送」，没有明确 push 前先把最新 master 合进功能分支，实际已出现本地 master 与 origin/master 分叉各 2 个提交的情况。
- 内容：`AGENTS.md` worktree 段落——流程行改为「验证 → 提交 → 拉取最新 `master` 并合并进功能分支（冲突在功能分支内解决）→ push 功能分支 → 合并回 `master` 并推送 → 清理 worktree」，把合并方向定为先 master→功能分支（冲突在功能分支解决，master 只接快进式合并）；新增一条：任务完成后自动执行收尾，仅当 master 工作区不干净、存在未完成合并、或冲突无法安全自动解决时暂停并报告。`README.md:147`「维护：发布更新」同步为同一套流程措辞，避免两处文档打架。
- 验证：纯文档改动，无代码变更，未跑测试套件；人工复核两处流程描述一致。本次收尾按新规则实测走通（fetch → merge origin/master → push 功能分支 → 合并回 master → push）。
- 涉及：AGENTS.md、README.md、devlog.md。

## 2026-09-13 09:35 — 删除增量摘要机制，改为子代理软轮次预算
- 原因：主代理自报摘要 + 子代理 progress 推送这套机制与「注意力原则」冲突——摘要提醒和进度回注都会在主代理忙碌时挤进上下文，打断正在进行的推理；上下文维持已由后台压缩（compaction.js）覆盖，摘要属于重复投资。同时子代理缺少规模约束，容易在一个任务里无限展开探索。用户要求开发阶段精准切割：不留死列死表、不留字段冗余、不留未知空字段。
- 内容：
  - `src/memory-policy.js` → `src/task-budget.js`（git mv）：导出 `WRAP_UP_PROMPT`、`TASK_BUDGET_LIMITS={turns:[3,200],window:[1,10]}`、`taskBudgetDefaults={maxTurns:20,wrapUpWindow:2}`、`taskBudgetPolicy(role,budget)`（非 subagent 返回 null，否则返回含 `wrapUpAt=max(1,maxTurns-wrapUpWindow)` 的策略）、`budgetSystemPrompt`。软上限：到点每轮注入收尾指令，不 abort——abort 会让 `result()` 抛错并丢掉此前所有轮次的产出。
  - `src/pi.js`：删摘要提醒注入、进度投影与 memoryState 的摘要字段；改为子代理累计 turn ≥ wrapUpAt 时在请求末尾追加 `WRAP_UP_PROMPT`，创建时把 `budgetSystemPrompt` 拼进系统提示词。`<title>` 提取与 `stripMemoryTags` 保留；compaction 自己的 `<axiom_compact_*>` 与 `entry.details.progress` 投影是另一套机制，未改动。
  - `src/tools.js`：`delegate` 新增必填 `context`（批内共享一次），description 与系统提示词同时约束任务粒度；删除进度上报相关工具行为。
  - `src/session-store.js`：DDL 拆为 `TABLES` + `INDEXES` 常量（表建好→归一化→再建索引，避免重建丢索引）；新增 `#normalizeSchema()` 幂等清理旧库——按 `PRAGMA table_info`/`sqlite_master` 自检，删 `summaries` 表、`sessions.main_turn`、`tasks.memory_turn/progress/progress_delivered` 列、`summary_trigger`/`progress_delivery` 事件行，带旧 CHECK 的 `session_events` 走建新表拷贝改名重建，全程保存点包裹，无需迁移标记，新库一条不执行。删 `saveSummary/listSummaries/deleteSummaries/setTurn/pruneEvents`，`EVENT_TYPES` 收窄为 `('compaction','retry')`。
  - `src/session-memory.js`、`src/sessions.js`、`src/tasks.js`、`src/capabilities.js`、`src/protocol.js`、`src/server.js`：`save(change)` 只留 `title/event/task/deletedEvents`；新增 WS 命令 `task.budget.get`/`task.budget.configure`（payload `budget`，zod 边界取 `TASK_BUDGET_LIMITS`），settings key `taskBudget`。
  - `public/`：删「摘要记录」按钮与对话框、`renderSummaries`、`session.summary` 事件处理与快照重放；设置面板「摘要记忆」换成「子代理轮次预算」双输入框（`task-max-turns` 3-200 / `task-wrap-up-window` 1-10），`loadTaskBudget`/`saveTaskBudget` 走新 WS 命令；`.memory-field` 改名 `.budget-field`，删除全部 `#summaries` / `.summary-*` 样式。`public/memory-tags.js` 提取只认 `title`，剥离列表保留旧标签（旧会话历史仍需过滤）。
  - `tests/`：`memory-policy.test.js` → `task-budget.test.js`；`session-store.test.js` 增 `#normalizeSchema` 幂等迁移用例；`pi-memory.test.js` 覆盖 `WRAP_UP_PROMPT` 注入时机；`memory-ui.test.js` 只留 UI 集成（流式剥离标签、标题更新、轮次预算面板），标签纯函数用例归到 `memory-tags.test.js`；删 `summary-compact.test.js`（只测已删对话框的 CSS）；`sqlite-benchmark.mjs` 去掉摘要/进度阶段。
- 验证：全量 `npm test` 356 项 354 过 2 跳过 0 失败。`rg -in "summar|progress|memory_turn|main_turn"` 在 src/ 仅剩 `#normalizeSchema` 的 DEAD_* 常量与 compaction 自有机制；public/ 零命中。SQLite 侧确认 node v24.19.0 内置 SQLite 3.53.3 支持 `ALTER TABLE DROP COLUMN`。
- 涉及：src/task-budget.js（原 memory-policy.js）、src/pi.js、src/tools.js、src/session-store.js、src/session-memory.js、src/sessions.js、src/tasks.js、src/capabilities.js、src/protocol.js、src/server.js、src/database.js、public/app.js、public/index.html、public/style.css、public/memory-tags.js、tests/（10 个文件，含删除 summary-compact.test.js）、README.md、devlog.md、.pi/skills/codebase-map/。

## 2026-09-13 11:20 — 行内代码里的标签不再被剥离，清理导入死字段与过时文档

- 原因：讨论标签机制时写 `` `<axiom_summary>` ``，正文被当成未闭合开启标签，按「截到段尾」规则把反引号之后的整句话吞掉。顺带深扫上一轮删除摘要机制的遗留。
- 内容：
  - public/memory-tags.js：标签处理前把单行行内代码跨度（CommonMark 规则，N 个反引号由等长 run 闭合）掩码为 `\u0001序号\u0001`，处理后回填；extract 与 strip 共用。围栏保护逻辑不变，未闭合开启标签「截到段尾」规则不变。
  - src/session-store.js：`#insertTaskRow` 丢掉旧整 JSON 里的 memoryTurn/progress/progressDelivered 三个死字段，不随迁移搬进新 tasks.record（旧库死列已由 #normalizeSchema 清理，JSON 侧此前仍会照搬）。
  - 删 docs/sqlite-refactor-plan.md：写的是「最终五张业务表」与 summaries 表/main_turn/memory_turn 等实际列，与现状（store + sessions/session_events/tasks）矛盾，无任何代码或 README 引用，决策已在 devlog 留档。
  - 删 .pi/skills/codebase-map/knowledge.md 里「摘要列表稀疏与全局样式串用」条目：对应对话框、summary-meta 样式与 tests/summary-compact.test.js 均已删除。
  - README.md 第 15 行补一句：围栏与行内代码内的同名标签原样保留。
- 验证：新增 tests/memory-tags.test.js「行内代码里的标签是讨论内容」用例（复现串、`` `<title>` ``、双反引号、行内与真标签混排、extract 只认真标签）；实测带死字段的旧 JSON 导入后 record 仅剩 task/status/id；全量 `npm test` 357 项，355 过 / 0 失败 / 2 跳过（既有 SKIP）。worktree 首次需 `npm ci`。
- 涉及：public/memory-tags.js、src/session-store.js、tests/memory-tags.test.js、README.md、devlog.md、docs/sqlite-refactor-plan.md（删）、.pi/skills/codebase-map/knowledge.md。

## 2026-09-13 11:35 — 「会话四表」表述改回三表

- 原因：重建索引时发现 session-store 的模块职责仍写「会话四表」。`summaries` 表已随摘要机制删除，实际只建 sessions / session_events / tasks 三张（`store` 属 database.js），文件头早已写三表，内部注释与索引没跟上。
- 内容：reindex.mjs 的 MODULE_INFO、src/sessions.js:455 与 src/session-store.js:319 的迁移注释、tests/session-store.test.js:206 的用例名，四处「四表」改「三表」。
- 验证：全量 `npm test` 357 项，355 过 / 0 失败 / 2 跳过；重建 INDEX.md 后模块表描述同步为三表。
- 涉及：.pi/skills/codebase-map/scripts/reindex.mjs、src/sessions.js、src/session-store.js、tests/session-store.test.js、devlog.md。

### 2026-09-13T17:36:36.164Z 子代理重试绑定任务
- 内容/原因：重启不恢复子消息，混合 messageCount 不能定位；改为复用 SQLite 已保存的 agentId/taskId，将重试固定置于任务说明后。迟到元数据自动迁回，多次重试不重复，主代理路径不变；不新增存储字段或样式。
- 涉及：public/app.js、tests/message-activity.test.js、README.md、.pi/skills/codebase-map/knowledge.md、INDEX.md。
- 验证：定向10项及 app/session-flow/session-persistence 20项通过；全量验证见后续记录。
- 最终验证：node --test --test-concurrency=1 全量357项，355通过、2跳过；默认并行两次在未改动 app.test.js 异步断言失败（排序/导入跳转），定向与串行通过。追加实时子消息之后重试也固定归位检查，定向10项再次通过。
- 集成复验：合并最新 origin/master 后，定向30项通过；全量串行再次355通过、2跳过。

## 2026-09-13 11:02 — 右上角加 GitHub 图标；移除文字对比度调节，正文固定最高档

- 原因：用户要求右上角一个可点进开源页的 GitHub 图标；同时「A」对比度按钮不再需要，直接把正文文字定死在原先 150% 那一档，省掉一个控件、一段本地存储和两份资源。
- 内容：
  - public/index.html：`.service-controls` 首位新增 `a#github-link.icon-button`，指向 https://github.com/cosyeezz/axiom ，`target="_blank"` + `rel="noopener noreferrer"`，内嵌 GitHub mark 单 path SVG（无新增图标依赖）；删掉 `/text-contrast.css` 的 link。
  - public/style.css：`--body-ink` #d0d6e0 → #dee2e9、`--muted` #8a8f98 → #adb1b7（各混入 30% 白，等于原 150% 档结果，#adb1b7 对 #010102 约 9.7:1）；新增 `--dim-line: #8a8f98` 供 `--muted` 的两处非文字用途钉回原色（`.selectors label:has(select):after` 下拉箭头、`.tool-activity` 默认 `--activity-ink`）；新增 `#github-link` 两条（grid 居中、去下划线、17px svg 用 currentColor 填充，复用 `.icon-button` 32px 方形与 hover）。
  - public/app.js、src/server.js：删 `initTextContrast` 的 import 与调用、删两条静态资源路由。
  - 删 public/text-contrast.js、public/text-contrast.css、tests/text-contrast.test.js。
  - 9 个测试 harness（app/compaction-ui/manual-retry/memory-ui/message-activity/model-onboarding-ui/model-thinking-favorites/remote-ui/workspace-tabs）去掉注入 text-contrast.js 的读取与 eval 插值。
  - tests/app.test.js 在既有 header 图标用例里补断言：href/rel 正确、高度 32px、`text-decoration: none`、`#text-contrast-button` 不再存在。
  - tests/conversation-ui.py：对比度面板那段换成 GitHub 图标的 tooltip 文案与 href/target 校验。
  - README.md：品牌正文色改 #dee2e9；tooltip 段落改写为 GitHub 图标 + 固定高对比度说明；`npm test` 注释去掉「对比度」。
  - .pi/skills/codebase-map/：SKILL.md 架构图与 reindex.mjs 的 MODULE_INFO 去掉三条 text-contrast 条目，重建 INDEX.md（118 文件、0 未登记）。
- 验证：`npm test` 348 项，346 过 / 0 失败 / 2 跳过（既有 SKIP；较上轮 357 少 9 项＝删掉的 text-contrast 用例）。Playwright 实测：图标位于 header 最右侧服务区首位（1440 宽下 x=1296、32×32），静止色 rgb(173,177,183)、hover 转 --ink，tooltip 显示「在 GitHub 查看源码」，href/target/rel 均符合预期；`--body-ink`/`--muted`/`--dim-line` 计算值分别为 #dee2e9/#adb1b7/#8a8f98。tests/conversation-ui.py 全量跑不通（`#workspace` 30s 不可见），在 master 上同样复现，属本环境既有问题，非本次改动引入。
- 涉及：public/index.html、public/style.css、public/app.js、src/server.js、public/text-contrast.js（删）、public/text-contrast.css（删）、tests/text-contrast.test.js（删）、tests/app.test.js、tests/conversation-ui.py、tests/compaction-ui.test.js、tests/manual-retry.test.js、tests/memory-ui.test.js、tests/message-activity.test.js、tests/model-onboarding-ui.test.js、tests/model-thinking-favorites.test.js、tests/remote-ui.test.js、tests/workspace-tabs.test.js、README.md、devlog.md、.pi/skills/codebase-map/。
