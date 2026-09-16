# Axiom 六个工作包现状汇总与集成接线指南（2026-09-15 晚）

> 用途：给接手“接线并交付最终产品”的 Agent 阅读。本文只陈述当前事实，不含未执行的推测。
> 所有 worktree 均以 `ab52936`（chore: synchronize merged code index）为 merge-base；`origin/master` 当前为 `ab52936`。

## 0. 全局状态一句话

- **03 通信基础层（WebSocket）**：已经合并进 `master`（提交 `af51b00`），成为后续所有工作包的地基。
- **04 前端分区 / 05 历史性能 / 06 平滑流式 / 桌面运行时（01+02 合并）**：各自在独立 worktree 分支中完成全部代码与测试，**尚未合并回 master**，互相之间有文件交集，需要按依赖顺序合并并解决冲突。
- 桌面工作包实际以“01+02 合并为一个 `feat/desktop-runtime`”的形式存在，且已扩展到“会话历史懒加载、应用内会话页签”等未在原始六份任务书范围内的功能——这些额外功能与 05 的历史分页有职责重叠，是合并时最主要的冲突源。

## 1. 六个工作包 → 实际分支对照

| 任务文档 | 分支/worktree | 未合并提交数 | 一句话现状 |
|---|---|---|---|
| 03 实时通信与事件分发 | **已合并进 master**（`af51b00`） | 0 | `public/transport.js` + `src/transport.js` 成为唯一连接/订阅/水位/快照队列管理者；`tests/realtime-transport.test.js` |
| 04 前端分区与开发热加载 | `feat/frontend-regions`（../worktrees/Axiom-frontend-regions） | 3 | 六区独立更新替代 `controls()`；模型菜单无变化不动；Vite CSS 热替换开发服务器（dev-only） |
| 05 长会话与多会话性能 | `feat/history-performance`（../worktrees/Axiom-history-performance） | 6 | 历史游标分页 + 稳定消息身份 + 会话视图有界缓存 + 后台不绘制；新协议命令 `session.history` |
| 06 平滑流式显示 | `feat/smooth-stream`（../worktrees/Axiom-smooth-stream） | 1 | `stream-playback.js` 有界字素平滑播放 + rAF；与隐藏/减动视/结束一致 |
| 01+02 桌面交付、启动与更新 | `feat/desktop-runtime`（../worktrees/Axiom-desktop-runtime） | 13 | Electron 唯一后端管理者 + 随包 Node 24.19.0 + 数据所有权锁 + DATA_VERSION 前向只读守卫；**尚无“手动下载更新”实现** |

## 2. 逐个分支的详细现状

### 2.1 master（已含 03）

`af51b00 feat: centralize websocket lifecycle and bounded event transport`，改动 20 文件（+840/-478）：

- 新增 `public/transport.js`（200 行）与 `src/transport.js`（36 行）。
- `public/transport.js` 契约（已核实现码）：
  - `createTransport({...})` 唯一拥有业务 socket；`connect / request / receive / beginSnapshot / commitSnapshot / failSnapshot / subscribe / dispose`。
  - 事件水位按 `sessionId` 单调去重；快照期间事件入 `gate` 缓冲，`commitSnapshot` 时按水位补放；reducer 抛错 → `recover("merge_failed")` 且不推进水位（必先快照）。
  - `request` 超时/断线清理 pending；副作用命令**不自动重发**（`unknown` 标记 + “结果未知”文案）。
  - `subscribe(type, filter, listener)` 支持按 `type`/`sessionId`/`agentId` 定向订阅，listener 单点失败隔离；dispose 清理全部。
  - 慢消费者沿用 32 MiB 阈值：`src/transport.js` `createSender` 每消息/每缓冲上限，超限 `terminate()`；广播也走同一保护。
  - epoch：`commitSnapshot` 见 `snapshot.instanceId` 变化即清空水位。
- `app.js` 已改为通过 `createTransport` 工作（`transport.request`、`beginSnapshot/commitSnapshot` 等共 202 行改）。
- 测试：`tests/realtime-transport.test.js`（122 行）。

> 意味着：后续所有分支都已在这套 transport 基础上开发，合并时不能再出现第二套连接/重连代码。

### 2.2 `feat/frontend-regions`（3 提交）

链：`7f81da6`（分区+模型菜单）→ `6c94b65`（Vite CSS 开发服务器）→ `da1f15c`（merge transport foundation，merge-base=ab52936）。

- **删除 `controls()` 全量联动**：已实测 `grep -c controls()` = 0；替代为 `region(name, updateFn)`（app.js:451，内部 try/catch + `error()` 脱敏上报，不吞连接）。
  - 六区覆盖确认：`连接状态/会话导航/输入操作/模型配置/设置与详情/对话展示`，各有 `updateAvailability/updateConnection/updateNavigation/updateComposer/updateModelAvailability/updateSettingsAvailability`（app.js:455-496, 639-641, 757, 825, 843, 2025, 2050-2116, 2535, 2602, 2698…）。
  - 注意：`对话展示` 没有独立 update 函数（仍走既有消息渲染），README 也承认“对话归并仍走唯一 reducer”。不要按“六区必须各有 update”的预设去改它。
- **模型菜单稳定**：`model-picker.js` 重写（219 行改为 219 行变动）：`sync()` 无实质变化 → 零 DOM 操作；`syncMenu` 取代无条件 `rerender`；`dispose(select)`/`dispose()` 精确释放监听/定时器/定位规则（`data-ax-mp` 标记）。
- **副作用文件**：`public/app.js`、`public/model-picker.js`、`scripts/dev-vite.mjs`（新增）、`scripts/service.mjs`（仅 2 行：`session-cache.js` 静态路由？需核）、`package.json`（Vite devDependency 8.3.0）、`public/transport.js` 未改。
- 测试：`tests/frontend-regions.test.js`、`tests/model-picker.test.js`、`tests/dev-vite.test.js`、`tests/frontend-regions-ui.py`、`tests/dev-vite-ui.py`（Python 真浏览器，会临时改 CSS/JS 后恢复）。
- 新增测试依赖：无（Vite 是 devDependency）。

### 2.3 `feat/history-performance`（6 提交）

链：`67fdcf1`（稳定身份+cursor pages）→ `de7338a`（隐藏不绘制）→ `7372be2`（preserve paged details/anchors）→ `6776f82`/`6bf76fe`/`45848c8`（修复与证据文档）。

- 新增协议命令 `session.history`（`src/protocol.js` +13 行）：`{edge:first|last, before, after, target, limit(≤200)}` 互斥由 `pageOf` 校验。
- 新增 `src/session-history.js`（152 行）：`createHistory / messageIdOf / pageOf / toPageRecord / touchHistory`；
  - `messageIdOf = record.entryId ?? (record.messageId ??= randomUUID())` —— **稳定身份是“优先 JSONL entryId，无则补 uuid 记在记录上”**，不是已有协议字段；撤回/压缩通过 `revision`（进程内单调递增）失效游标。
  - `HISTORY_PAGE_DEFAULT = 60`，`HISTORY_PAGE_MAX = 200`。
- `src/sessions.js`（+157）：`snapshot(id, options)` 支持 `window:{edge,limit}`、`revision`、`history` 元数据；分页时 `messages/compactions/retries/tools/tasks` 都按页裁剪（`pageTasks/pageRetries/relevantTools`）；`session.history` 请求逐项校验。
- `src/server.js` attach 改为**先订阅后 ensureLoaded**（避免加载期间丢事件），再 `snapshot(id, {epoch:instanceId, includeSeq:true, window:{edge:"last", limit:60}})`。
- 新增 `public/session-cache.js`（52 行，注释极清晰）：有界 LRU，**未保存输入（draft/images/contextFiles/selectedSkill）钉住不淘汰**；`EVICTABLE_VIEWS=3`。
- `public/transport.js` 被改 +10 行（对 `session.attach/create/import` 失败做了 gate 恢复）。**这是 transport 之上唯一的再改动点。**
- `public/stream-renderer.js` 也改了 +23（visibilityState 隐藏不绘制，恢复一次收口）——**与 06 对同一文件也有改动，合并必冲突。**
- 测试：`tests/session-history.test.js`（356）、`tests/session-cache.test.js`、`tests/history-reading.test.js`、`tests/snapshot-*.test.js` 三件套大改（232/325/302 行）、`tests/stream-renderer.test.js`（77 行新增）。
- 性能证据：`docs/perf-history-session/`（baseline/after/followup JSON + 测量脚本）。

### 2.4 `feat/smooth-stream`（1 提交 `829237f`）

- 新增 `public/stream-playback.js`（164 行）：`createPlayback()`，`Intl.Segmenter` 字素切分、`pending/starts/shown` 游标、同 revision 前缀延长=append、其余=替换；有界 `maxPlayMs` 追赶；`dispose` 释放。
- `public/stream-renderer.js` +166 行：默认 rAF（`requestAnimationFrame` 降级 setTimeout）、`states = new WeakMap()`、`mounted(item)` 检查（`item.mounted !== false`、`node.isConnected`、`!item.task || item.task.node.open`）、`visibilitychange`/`selectionchange`/`prefers-reduced-motion` 监听、`epoch` 取消陈旧帧、`dispose()`（页面 `pagehide` 时调用）。
- `public/markdown.js` +37（疑似内部同版本文本增量/尾窗支持，未逐行核对）。
- `public/app.js` 仅 +5：`pagehide → renderer.dispose()`；`stopActivity` 调 `renderer.flush(item)`；aria-live 关闭；`agent.message.start` 先 `flush(previous)+disposeMessage(previous)` 再新建 live。
- `src/server.js` +1：静态路由登记 `/stream-playback.js`。
- 测试：`tests/stream-playback.test.js`（320）、`tests/smooth-stream.test.js`、`tests/smooth-stream-browser.py`、`tests/smooth-stream-preview.mjs`；`stream-renderer.test.js` 改 19 行。

### 2.5 `feat/desktop-runtime`（13 提交，实际合并了 01+02 并扩展）

链（逆序看最易理解）：
`dbb553c`(生命周期握手) → `4432943`(数据所有权+关闭) → `92a2d94`(打包 Electron+随包 Node) → `6f1b8aa`(README 标记 Pake 历史) → `bbbb301`(只读历史分支) → `cfb2441`(退出确认) → `7000bcd`(历史懒加载+应用内会话页签) → `bbb4e32`(工作空间导航保留+桌面端口隔离) → `e6a7b3c`/`15320f3`/`551d914`/`a9a4fe9`/`116bd38`(CI/签名/验证)

- 新增文件：
  - `desktop/main.mjs`（85 行）：`app.requestSingleInstanceLock()`；`createBackendLifecycle({bundleRoot, bundleVersion, dataRoot, cwd, nodePath, onShutdown, onCrash})`；随包 Node 绝对路径 `root/runtime/node(.exe)`；`AXIOM_HOME/AXIOM_CWD/AXIOM_INSTANCE_ID/AXIOM_START_TOKEN/AXIOM_BUNDLE_VERSION/AXIOM_DESKTOP=1/AXIOM_DEV=0`；ready 校验（token/instanceId/bundleVersion/pid/protocol=1/url 正则）；`requestStop({mode:wait|cancel})` 仅真停；`quitSafely()` 弹窗三选一（返回/等待/取消），无子进程才 `app.quit()`；`onCrash` 弹“保存结果未确认”。
  - `desktop/backend-lifecycle.mjs`（102 行）：`fork(join(bundleRoot,"app","src","main.js"), {execPath: nodePath, cwd, env, stdio:["ignore","inherit","inherit","ipc"]})`；`service.restart` 消息直接拒绝（桌面不用 npm 更新/重启）；`service.ready` 校验后 resolve；`requestStop` 忙时 wait/cancel；超时不强杀。
  - `src/data-owner.js`（22 行）：按数据根目录 sha256 独占锁（Windows 命名管道 / Linux abstract socket / macOS loopback 65535 内端口），`EADDRINUSE` → “已被其他 Axiom 实例占用”。
  - `src/session-history.js`（11 行，与 2.3 同名文件**不同实现**）：`readSessionHistory(file,cwd)` 用 `parseSessionEntries` + `SessionManager.inMemory` 只读 JSONL（禁止 `SessionManager.open` 改写磁盘）。
  - `scripts/stage-desktop.mjs`：固定 Node 24.19.0，cp src/public/package/LIC，`npm ci --omit=dev --ignore-scripts`，复制 `process.execPath` 为随包 node，写 `manifest.json{schema:1,bundleVersion,node,platform,arch,dataVersion:1}`。
  - `scripts/smoke-desktop.mjs` / `smoke-shell.mjs`。
  - `.github/workflows/desktop.yml`（58 行）：矩阵 win-x64 / macos-arm64，`action/setup-node@v4` 24.19.0，`desktop:stage`→`desktop:build --publish never`，macOS ad-hoc sign（`--config.mac.identity=-`），`codesign --verify --deep --strict`；产物 `Axiom-{platform}-unsigned`。
- **随包 Node 不是 Electron 内置**：`extraResources: [{from: ".desktop-stage", to: "."}]`，运行时在 `resourcesPath/runtime/node(.exe)`。
- 修改共享文件：`src/main.js`（port=0 随机[桌面]，claimDataRoot、`service.ready` 带 token/url、`stop(mode)` wait 循环、`prepareStop/hasActiveWork` 扩展）、`src/server.js`（+10，`prepareStop`/`hasActiveWork`）、`src/sessions.js`（+55：只读历史分支读取）、`src/database.js`（+21：`DATA_VERSION=1` + `assertDataVersion` 只读前向守卫）、`public/app.js`（+56：会话懒加载页签/工作空间导航保留）、`public/index.html/style.css`、`package.json`（+18：`main: desktop/main.mjs`、`desktop:*` 脚本、electron/electron-builder devDeps）。
- 测试：`tests/backend-lifecycle.test.js`、`data-owner.test.js`、`data-version.test.js`、`session-history.test.js`（这里指 11 行只读版本）、`session-persistence/workspace-tabs/workspace-picker/service-api/service/helpers/model-concurrency-child.mjs` 等改动。
- **已知空缺（必须明确告知）**：
  - **没有手动“检查/下载/安装更新”UI 与逻辑**（`desktop-runtime` 分支 grep 无 update/下载实现）。仅拒绝运行期 npm 更新。
  - 无正式签名/公证（CI 产物名 `-unsigned`；macOS 仅 ad-hoc 自签测试）。
  - `BBB4E32 隔离桌面端口`：桌面 worker `AXIOM_PORT=0` 随机端口，经 `service.ready.url` 回传。
  - 历史懒加载/应用内页签是 01+02 任务书之外自行增加，与 05 分页有职责重叠（下方 §3 冲突风险评估）。

## 3. 合并这张图的真正风险（基于实际文件交集）

按“相对各自 merge-base 的改动文件”计算交集（已过滤索引/文档）：

| 组合 | 交集 | 冲突/协调点 |
|---|---|---|
| 05 × 06 | `public/app.js`、`public/stream-renderer.js`、`src/server.js`、`tests/stream-renderer.test.js`、reindex | **`stream-renderer.js` 双方都大改**：05 加 visibilityState 不绘制（+23），06 换成 rAF+WeakMap+mounted+hidden+dispose（+166）。**两套实现目标重叠（页面隐藏时不绘制）**，不能简单 merge —— 应让 06 作为该文件真正归属，05 的“隐藏不绘制”语义迁移到 06（06 已有同功能）。 |
| 04 × 05 | `public/app.js`、`tests/snapshot-switch.test.js`、reindex | 04 改分区控件与菜单；05 改 attach/snapshot 返回结构（分页窗口）。**app.js 双方大范围交织**：04 在 446-2698 行区间改控件调用点，05 在 2215-2503 行区间改快照首屏。合并时以 04 后合入（依赖更少是错误直觉，见下）。 |
| 04 × 06 | `public/app.js`、`tests/app.test.js`、reindex | 04 控件、06 的 5 行（pagehide/flush/aria-live）——06 相对小，冲突少，但 06 改 `stream-renderer`，04 没碰它，故 04×06 唯一实质冲突在 app.js 少量行。 |
| 04 × desktop | `public/app.js`、`package.json`、`package-lock.json`、tests/app.test.js | desktop 未改模型菜单/分区；主要冲突在 package.json（devDeps：electron vs vite）与 app.js 少量行（desktop 的懒加载页签区域）。**若 Vite 与 electron 同时启用，`dev:web` 和 `desktop:dev` 的并发说明需补写。** |
| 05 × desktop | `src/sessions.js`、`src/session-history.js`、`src/server.js`、`public/app.js`、`public/index.html`、`public/style.css`、tests/session-history.test.js | **同名 `src/session-history.js` 两个完全不同的实现**（05：分页引擎 152 行；desktop：只读 JSONL 11 行）——**必须重命名或合并**，否则后者直接覆盖前者。`sessions.js` 双方都改 snapshot/attach（05 加窗口/分页；desktop 加只读历史分支读取+惰性加载）——需要把 desktop 的“只读读历史”功能嫁接进 05 的分页 API。`app.js` desktop 加了“应用内会话页签”+历史懒加载（`bbbb301/7000bcd`），与 05 的“attach 只回最近一页”冲突。 |
| desktop × 06 | `public/app.js`、`src/server.js`、tests/app.test.js | desktop 改 server.js 加 prepareStop/hasActiveWork（+10），06 改 server.js 加静态路由（+1）——易合并。 |

**结论（最关键）**：
1. `src/session-history.js` 存在两版实现，是**确定性冲突**，必须先决策：05 的 `createHistory/pageOf/messageIdOf` 为分页权威，desktop 的 `readSessionHistory`（只读 JSONL）是另一个职责（“不 rewrite 历史分支的打开路径”），建议把 desktop 的只读功能并入 `src/session-history.js`（尾接 `readSessionHistory`）或改名 `src/jsonl-reader.js`，避免同名覆盖。
2. `stream-renderer.js` 05 与 06 目标重叠，合并后应统一到 06 的实现（含 visibilityState/selectionchange/reduced-motion），把 05 的隐藏不绘制语义手工迁移进去，不能两个版本并存。
3. `app.js` 是所有分支的交集：**它的合并顺序决定其余冲突量**。
4. desktop 的历史懒加载/应用内页签与 05 分页是**功能重复**（都“首屏减少 DOM/消息量”）——需要二选一或明确分层：05 提供“attach 只回一页+session.history 翻页”，desktop 的“页签/懒加载”应改为调用 05 的分页接口，而不是自己再裁减。
5. transport（master）是公共底座：合并时**不得**引入第二套连接/重连/水位（04/05/06/desktop 都没有自己造连接）。

## 4. 推荐的合并顺序（仅建议，供接手者确认）

1. **06（smooth-stream）先合**：它改动文件最少、依赖面最小，且是 `stream-renderer.js` 的“名义归属”。
2. **05（history-performance）合入**：此时与 06 的 `stream-renderer` 冲突以 06 为准手工迁移隐藏语义；同时把 desktop 版 `readSessionHistory` 改名并进 `src/session-history.js`（05 的版本）+ 在 `src/session-history.js` 内放入只读读取函数，`sessions.js` 中 desktop 的只读调用点改为调用 05 接口的只读部分。
3. **04（frontend-regions）合入**：采用 04 的 `region()`/菜单稳定；`app.js` 控件层让位于 04；若与 05 的 attach/快照结构有冲突，按 05 的新 snapshot schema 为基准改 04 调用点。
4. **desktop-runtime 最后合**：`desktop/*`、`src/main.js`、`src/database.js`、`src/data-owner.js`、CI 脚本均为新增，冲突少；**唯一交叉点是 `src/server.js`/`app.js`/`sessions.js`/`session-history.js`**，此时 05 的分页 schema 已定，把 desktop 的懒加载页签改为消费 05 的分页，删除 desktop 自己裁切历史的部分。
5. **每步合完跑 `npm test`（含新增全部 test）→ `reindex.mjs` → 更新 README/devlog**。

## 5. 现有测试基线（合并前必须记录）

| 分支 | 可运行测试命令 |
|---|---|
| master | `npm test`（全量） |
| 03（已合） | `node --test tests/realtime-transport.test.js` |
| 04 | `node --test tests/frontend-regions.test.js tests/model-picker.test.js`；`python tests/frontend-regions-ui.py` |
| 05 | `node --test tests/session-history.test.js tests/session-cache.test.js tests/history-reading.test.js`；`python` 用 `tests/helpers/history-page.js` 相关 |
| 06 | `node --test tests/stream-playback.test.js tests/smooth-stream.test.js tests/stream-renderer.test.js`；`python tests/smooth-stream-browser.py` |
| desktop | `node --test tests/backend-lifecycle.test.js tests/data-owner.test.js tests/data-version.test.js`；构建 `npm run desktop:stage && npm run desktop:build`（需 Node 24.19.0 本机）；`scripts/smoke-desktop.mjs` |

## 6. 尚未完成/明确缺口（合并以后的工作）

- **桌面手动更新**（下载/校验/退出安装/回退）未实现；当前桌面已拒绝运行期 npm 更新，但用户点击更新的 UI 与流程仍是 TODO。
- 正式签名/公证（Windows codesign、macOS Developer ID + notarization）未做；CI 产物为 `-unsigned`。
- 05 与 desktop 历史职责重叠的“正式决策”未落文档（§3 第4点）。
- `stream-renderer` 双实现未合一。
- 合并前各分支测试是否在当前 master 上全绿，未验证（应作为接手第一步：各分支基于 ab52936，master 也是 ab52936，理论可合，但需各自先 `npm test`）。
- 六份计划文档本身未因实现而回写（01-06 仍是“拟议”表述）；建议合并后把文档状态改为“已实现/部分实现”，避免误导后续 Agent。