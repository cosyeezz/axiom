# 01 完整桌面交付与手动更新（设计文档）

> 2026-09-16 状态更新：**部分实现（签名、备份及安装回退等发布门禁未完成）**。下文原方案及当时测试声明保留为历史记录；当前实现、验证和限制以[集成交付记录](../current-runtime-integration-status.md)为准。

日期：2026-09-15。状态：**待实施方案，不代表当前已具备这些能力**。
本文件只做设计与契约，不含产品改动；文中所有「拟议」接口、字段与文件路径均为待建，不等于仓库现状。
本轮**未执行任何测试**，也未声称任何测试通过。

范围关键词：自包含安装包、统一版本、手动更新、数据安全、旧安装迁移。
搭档文档：[02 启动与故障隔离](02-startup-fault-isolation.md)。01/02 共用桌面生命周期契约。

---

## 0. 一句话

把现在「npm 全局安装本体 + 独立 Pake 壳 + 分别更新」的交付方式，收敛为**一个带固定 Node 运行时的自包含安装包**：
一个版本号、一次签名覆盖全部内容，用户手动检查、手动下载、**退出应用后**替换，数据目录 `~/.axiom` 不动；
换回旧版本时数据库不允许被旧代码改写。

```text
现状（已确认）                          目标设计（拟议，未实现）
┌────────────┐  ┌──────────────┐       ┌──────────────────────────┐
│ Pake 壳     │  │ 用户自己装的  │       │ 一个安装包               │
│ 0.1.0      │  │ Node + npm   │  →    │ 壳 + 固定 Node + 应用 +  │
│ 只开网页    │  │ 全局装 Axiom │       │ 私有依赖，同一版本同一签名│
└─────┬──────┘  └──────┬───────┘       └────────────┬─────────────┘
      │ http 4319      │                             │
      └────────────────┴─→ ~/.axiom/axiom.db ←────────┘ 数据目录不变
```

---

## 1. 现状证据（已确认，非设计）

以下都是本轮在当前仓库读到的实际事实，作为设计依据。

### 1.1 桌面壳只有 Pake，且与本体分离

- `desktop/pake.json`：Pake 配置，`url = http://127.0.0.1:4319`，`name/title = Axiom`，`appVersion = 0.1.0`，`icon = public/favicon.svg`，`newWindow`、`enableDragDrop` 为真。
- `.github/workflows/desktop.yml`：`pake-cli@3.16.2`，`windows-latest`/x64 → `Axiom.msi`，`macos-latest`/universal → `Axiom.dmg`；macOS 侧有 `hdiutil verify` 与 `lipo … -verify_arch arm64 x86_64`；产物为 30 天 Artifact；**未配置签名、公证或自动发布**。
- `README.md` 桌面章节（约 152–180 行）明确：桌面壳**不内置 Node.js、Pi、网页副本或后端，不启动/停止服务**；壳版本在 `desktop/pake.json` 独立维护，不跟随 npm 包版本；Axiom 更新后刷新窗口即可，通常无需重打壳。
- `README.md` 明确记录目前产物**未配置代码签名/公证**，并提示未知发布者拦截。

### 1.2 本体是 npm 全局包，依赖用户环境

- `package.json`：`version 0.1.7`，`engines.node = ^22.13.0 || >=24.0.0`，`bin.axiom = scripts/service.mjs`、`bin.axiom-setup = scripts/install.mjs`；运行依赖含 `@earendil-works/pi-coding-agent 0.85.1`、`ws`、`zod`、`marked`、`dompurify`、`jiti`；`files` 只含源码与脚本，**不含 Node 运行时**。
- `install.sh` / `install.ps1` / `install.cmd`：先保证用户机器上存在 Node（必要时用 Homebrew / winget 装），再转交 `scripts/install.mjs`。
- `scripts/install.mjs`：`ensurePi()` 在缺失时执行 `npm install -g @earendil-works/pi-coding-agent@latest`（全局装 Pi CLI）；随后 `rebuild()` 按需 `npm ci`、注册自启、后台启动、可选开浏览器，并写 `~/.axiom/.guided` 标记。
- `src/database.js:5`：`nodeOk()` 只接受 Node 22.13+（22.x）或 24+，版本不符直接抛错。这就是「用户机器 Node 版本决定能否运行」的入口。

### 1.3 更新走 GitHub master 提交 + npm 换包（现役机制）

- `src/update.js`：`repo = cosyeezz/axiom`，`npmSpec = github:cosyeezz/axiom`，`commitFile = .axiom-commit`；`checkUpdate()` 请求 `https://api.github.com/repos/cosyeezz/axiom/commits/master`，用 40 位 SHA 比对；没有可靠提交记录（旧安装）时**必须更新一次**，不拿相同版本号当最新。
- `scripts/service.mjs:68` `prepareUpdate()`：先 `npm root -g` 核对当前运行目录就是全局安装目录，不一致直接报错；把目标提交装进包目录父级的暂存目录 `.axiom-update-<pid>`，用 `package-lock.json` 的 `resolved` 校验提交 SHA，并 `import` 校验 SDK 可加载。
- `scripts/service.mjs:93` `swapUpdate()`：备份 `.axiom-package-backup` → 把暂存包与新私有 `node_modules` 复制为 `.axiom-incoming-<pid>` → rename 换入；失败恢复备份。
- `scripts/service.mjs:116` `commitUpdate()`：新实例就绪后才写 `.axiom-commit`、删备份与暂存。`rollbackUpdate()`（:122）从备份还原。
- `scripts/service.mjs:458` `runOp()`：三段式编排（`preparing` → `swapping` → `ready`），`READY_TIMEOUT_MS` 默认 60 秒，超时先确认优雅退出再回滚；崩溃重试上限 `AXIOM_MAX_CRASH_RETRIES` 默认 5。
- 触发入口：网页 `service.update.check` / `service.restart`（`src/server.js:292`、`:298`），协议在 `src/protocol.js:180-181`，`mode === "update"` 必须带 SHA；`src/main.js:60` 经 `process.send` 请求守护进程执行。**DEV 环境拒绝安装版更新**。
- 维护通道：`scripts/maint-server.mjs`（loopback 随机端口、Bearer token、host/origin 双重校验）提供 `/status` 与 `/recover`（`quick`/`rebuild`）。

### 1.4 现有数据与迁移

- 数据目录由 `AXIOM_HOME` 决定，默认 `~/.axiom`（`src/main.js`、`scripts/service.mjs` 的 `homeDir()`）；库文件 `~/.axiom/axiom.db`。
- `src/database.js`：`node:sqlite` 的 `DatabaseSync`，单表 KV（`store(namespace,key,value)`），WAL + `busy_timeout=5000`，库文件及 `-wal`/`-shm` chmod `0600`。`get path()` 注释写明「供迁移前 `VACUUM INTO` 一致性备份等使用」——**该备份用途目前没有任何调用方**。
- 旧数据迁移靠 `migrated` 命名空间标记 + 按实际表结构自检，幂等：`src/session-store.js:339`、`src/sessions.js:270/558`、`src/pi-model-storage.js:28`。`README.md` 约 590 行记录：旧库首次打开时按实际表结构清理废弃表/列，**不靠迁移标记**，新库不执行清理。
- **仓库里没有 schema/数据版本号**（无 `PRAGMA user_version`、无 `schema_version`）。也就是说：用旧代码打开被新版本迁移过的库，目前没有任何保护。

### 1.5 Electron 位置未确认（前置核实项）

- 全仓库检索：`devlog.md` 与源码中**没有 Electron 相关代码或记录**；唯一确认的桌面实现是 Pake（1.1 节）。
- 因此本文不假设 Electron 主进程存在，也不定义 Electron 侧的 IPC、自动更新器或打包配置。**必须先定位用户提到的 Electron 实现**（在哪个仓库/分支/是否只是计划），核实通过后再决定安装包由谁产出；在此之前不得另建第二套桌面端。

---

## 2. 目标 / 非目标

### 目标

1. **自包含**：安装包内含固定版本 Node 运行时、应用代码与锁定依赖；目标机器不需要预装 Node、npm 或全局 Pi。
2. **统一版本**：壳、Node、应用只有一个版本号（`bundleVersion`），页面、守护进程、关于页读的是同一个来源。
3. **整体签名**：一次签名/公证覆盖可执行文件与资源；版本信息与签名绑定在同一发布清单上。
4. **手动更新**：用户主动检查 → 主动下载 → **退出应用后**替换 → 重新启动；无后台轮询、无自动修复按钮。
5. **数据安全**：更新前可回退的一致性快照；旧版本拒绝打开更新版本写过的数据库，绝不静默改写。
6. **旧安装迁移**：已用 npm 全局安装 + Pake 壳的用户有明确的一次性迁移路径，迁移后不会新旧服务并存。

### 非目标

- 不做后台定时检查、静默安装、灰度/自动回滚服务。
- 不做「修复安装」按钮或自动修复流程。
- 不改 Pi SDK 版本、不改会话/协议/渲染行为。
- 不新增 PM2、容器、第二套数据库或其它运行时框架；继续保留 Node + 原生 JS + `ws`。
- 不在核实 Electron 之前设计或新增 Electron 代码。
- 不负责进程生命周期本身（单实例、就绪、崩溃重试、安全退出归 02，见第 7 节）。

---

## 3. 交付包构成与「固定随包 Node 依赖」

### 3.1 包布局（拟议，未实现）

```text
<安装目录>/
  Axiom(.exe/.app)          ← 壳（Pake/Electron 之一，取决于第 1.5 节核实结果）
  runtime/node             ← 固定版本 Node（随包，不读系统 PATH）
  app/                     ← Axiom 本体（src/ scripts/ public/）
    node_modules/          ← 锁定的私有依赖（含 pi-coding-agent）
    package.json           ← version = bundleVersion
  manifest.json            ← 统一版本与内容hash清单
  manifest.json.sig        ← 整体签名
```

要点：

- 运行时**必须随包固定**（如 Node 22 LTS 的某个确定版本），分发时附 Node 的 LICENSE；启动链只允许用 `runtime/node`，不允许回退到系统 Node。
- `node_modules` 随包私有部署，沿用现有 `prepareUpdate()` 的思路（依赖私有、不覆盖全局共享依赖），但**不再执行 `npm install`**，也不再要求 `npm root -g` 与当前服务目录一致。
- 壳只做窗口与生命周期入口，仍不内置网页副本（网页是 `app/public/` 的本地服务资源）；桌面窗口与浏览器 localStorage 仍不共享。

### 3.2 统一版本与整体签名（拟议）

`manifest.json`（拟议字段，当前不存在）：

```json
{
  "schema": 1,
  "bundleVersion": "1.0.0",
  "commit": "<40位SHA>",
  "platform": "win32|darwin",
  "arch": "x64|arm64|universal",
  "node": { "version": "22.x.y", "sha256": "…" },
  "files": { "app/src/main.js": "sha256…" },
  "dataVersion": 3
}
```

规则：

- **唯一权威版本**是 `bundleVersion`；页面「服务与更新」、守护进程 `service.status`、关于页都从同一处读取（拟议：`manifest.json`，`src/main.js:59` 目前读的是 `package.json.version`，需改为同一来源）。
- `commit` 保留，仅作溯源与「同版本不同构建」的排查辅助，**不再作为更新判定键**；判定改为 `bundleVersion` 比较 + 签名校验。
- `dataVersion` 是该构建支持的数据库数据版本（见第 6 节）。
- 签名：签名覆盖 `manifest.json` 与包内关键文件 hash；实现方式（Windows Authenticode / macOS Developer ID + 公证，或自签清单）取决于证书可用性，属开放问题（第 14 节）。当前**无任何签名配置**（1.1 节），是本项最大外部依赖。

---

## 4. 手动更新：检查 → 下载 → 退出后替换

### 4.1 用户流程（拟议）

```text
点击「检查更新」 ──> 读取远端 manifest（一次请求，不轮询）
        │                 │
        │  无更新 ─────────┘ 显示「已是最新 <bundleVersion>」
        │
        └─ 有更新 ──> 显示 新版本号 / 发布日期 / 下载地址 / 大小
                          │
                          用户自行下载安装包（浏览器/下载器）
                          │
                          用户点「退出并更新」或直接退出应用
                          │
        应用退出后由安装器替换安装目录（旧目录改名备份）
                          │
                        重新启动 ──> 校验 manifest 与 dataVersion ──> 就绪
```

关键取舍（ponytail：先要最小可用）：

- **最小版本**：应用只负责「检查 + 给出下载链接 + 提示先退出」；下载与安装交给用户和系统安装器（MSI/DMG）。不引入内置下载器、不需要自替换进程（Windows 无法替换正在运行的 `.exe`，这是平台事实，不是设计偏好）。
- **可选增强**（有需求再做，不预先实现）：应用内下载到 `~/.axiom/staging/<version>/` 并校验 sha256，用户确认后应用退出，由一个极小的安装器/脚本完成目录替换再拉起。该增强必须复用第 3.2 节签名校验，且失败时保留旧目录可启动。
- 「检查更新」保持用户点击触发（现状已如此，`README.md` 约 232 行）；**不加轮询、不加自动修复**。

### 4.2 与现状机制的差异

| 维度 | 现状（1.3 节） | 目标（拟议） |
| --- | --- | --- |
| 判定键 | GitHub master 提交 SHA | `bundleVersion` + 签名 |
| 安装来源 | `npm install github:…#sha` 到暂存目录 | 用户安装签名安装包 |
| 替换时机 | 守护进程停 worker 后 rename | 应用完全退出后安装器替换 |
| 依赖 | 每次下载依赖、需要 npm/网络 | 随包锁定，无需 npm |
| 目录前提 | `npm root -g` 必须等于当前目录 | 安装目录固定，无需 npm 环境 |
| 失败回退 | `rollbackUpdate()` 备份还原 | 旧目录改名保留 + 旧版本可续用；DB 拒绝降级 |

现状的三段式生命周期（prepare/swap/commit）与「新实例就绪才算成功」的原则**应当保留**，只是触发者从守护进程内 npm 换包变为「退出后安装器替换 + 首次启动自检」。

---

## 5. 退出更新的边界与 02 的交接

「退出更新」意味着：**任何替换动作都发生在没有运行中进程时**。这依赖 02 提供的退出保证，01 不自己杀进程。

```text
01（本文档）                          02（启动与故障隔离）
────────────                          ──────────────────────
提供新包 / 清单 / 签名
提供回退方案（旧目录 + DB 快照）
        │                                      │
        │  「有新版本，需退出后安装」            │
        └───────────────►  用户点退出           │
                                │              │
                                ▼              │
                        02：安全退出（等待保存、确认 worker 退出码 0、不留悬挂进程）
                                │
        ┌───────────────────────┘
        ▼
安装器替换安装目录（无进程占用，Windows 才可能成功）
        │
        ▼
02：启动唯一实例 ──► 就绪信号（instanceId + bundleVersion）
        │
        ▼
01：首次就绪后确认更新成功（写版本记录、清理旧目录备份）；就绪失败则保留备份并按回退路径处理
```

边界规则：

- **01 不** fork / kill / 重启进程，**不**决定单实例策略、崩溃退避、就绪信号。
- **02 不** 决定更新目标、不下载、不校验签名、不改安装目录内容，只提供「已退出」「已就绪」两个事实。
- 共用契约（拟议）：
  - 01 → 02：`{ bundleRoot, bundleVersion, dataVersion, stagedBundle? }` 与「本次退出原因 = 待更新」。
  - 02 → 01：`{ stopped, exitCode }`、`{ ready, instanceId, bundleVersion }`。
- 正式桌面版目标为 Electron 使用随包固定独立 Node 直接管理 worker，不再叠加旧 supervisor。旧 CLI 模式独立保留但不能同时管理同一实例。`scripts/service.mjs` 属共享文件，由集成负责人独占；01/02提交接线清单，不分别编辑所谓不同部分。

---

## 6. 数据库回退安全

### 6.1 风险（现状证据）

- 库由 `~/.axiom/axiom.db` 唯一持有；新版本可能新增表/列/事件行形态（`session-store.js`、`sessions.js` 的迁移与清理是单向的）。
- 没有任何数据版本标记（1.4 节）。用户装回旧版本后，旧代码会照常打开并**重写**新版本写下的结构——可能静默丢字段或触发未预期分支。这是当前最实际的数据损坏路径，且更新是手动的，降级随时可能发生。

### 6.2 设计（拟议，未实现）

1. **数据版本标记**：复用既有配置存储记录 `dataVersion`（具体表结构实施前核对，不假定存在 namespace 列）。必须在任何迁移和业务写入前以只读方式检查兼容性；数据库迁移与版本推进应原子提交，跨 JSONL/文件迁移另设可恢复阶段记录。不能等整个应用成功启动后才标记已发生的迁移。
2. **打开即校验**：启动时读 `dataVersion`；若大于本构建 `manifest.dataVersion`，**拒绝以写模式打开**，页面/日志给出明确文案：「数据由更新版本 <v> 写入，当前 <w> 不支持，请安装 <v> 或从备份恢复」。
3. **更新前快照**：应用在「退出以安装更新」之前，对数据库做一次一致性快照：`VACUUM INTO` 到 `~/.axiom/backups/axiom-<bundleVersion>-<ts>.db`（`src/database.js` 的 `path` getter 已预留此用途，目前无调用方）。保留最近 N 份（拟议 N=2），超限删最旧。
4. **降级路径**：只有确认新版本尚未产生不兼容写入、旧程序仍兼容现有数据时，才可自动回退程序。旧程序若没有版本守卫，新增字段不能阻止其写库，必须由安装器/02生命周期管理拒绝启动不兼容版本。数据库快照不等于完整备份：SQLite 元数据与 Pi JSONL 历史须在停止任务和写入后成套备份并验证。恢复前保留更新后的全套数据，说明损失范围并获得用户确认，不能只覆盖数据库造成历史错配。跨文件恢复必须有可恢复阶段，不自动降级迁移。
5. **不做**：不自动删除旧数据、不自动改写为新版本格式、不在旧代码里「尽力兼容」新结构。

```text
正常升级：  旧库(3) ──快照──> 升级 ──> 新代码(4) 写库   ✓
错误降级：  新库(4) ──不写──> 旧代码(3) 拒绝写入       ✓（给备份路径）
唯一可行降级：装回 v4 或用快照还原后回到 v3（丢失 v4 期间数据，需用户确认）
```

---

## 7. 旧安装迁移

面向两类存量用户，迁移是**一次性、显式**的，沿用 `README.md` 从旧包名迁移章节的口径。

### 7.1 从 npm 全局安装 + Pake 壳迁移（拟议）

```text
1. 结束运行任务 → axiom stop（更早版本手动退出旧守护进程，确认 4319 空闲）
2. 取消旧自启：node "<旧安装目录>/scripts/autostart.mjs" disable
   （macOS Label com.cosyeezz.axiom；Windows 启动文件夹 VBS；Linux axiom.service）
3. 卸载旧 npm 包：npm uninstall -g @cosyeezz/axiom
4. 安装本安装包；首次启动按需重新注册新自启
5. 数据目录 ~/.axiom 与 Pi 配置 ~/.pi 原样保留，不搬移
```

必须保证：

- **禁止新旧并存**：两者默认同端口 4319、同数据目录，同时运行会端口冲突或互相干扰。迁移脚本/向导在检测到旧服务仍在运行时**拒绝继续**并提示先停止。
- 迁移不删除 `~/.axiom/service-state-*.json`、`.axiom-commit` 等旧文件；它们仅作诊断，不代表新版本权威状态（权威是 `manifest.json` + `store` 表）。
- 旧 Pake 壳与新安装包不共存：桌面快捷方式/开始菜单项替换，不保留两个入口。
- 迁移失败（如旧服务停不下来）时**停在旧状态**，不部分覆盖，让用户可继续用旧版本。

### 7.2 同族升级（新安装包 → 新安装包）

即第 4 节流程；额外要求：安装器发现应用运行时，提示「请先退出 Axiom」而不是强杀。

---

## 8. 代码入口与文件归属

### 8.1 现状入口（已确认）

| 关注点 | 现状位置 |
| --- | --- |
| 桌面壳配置/构建 | `desktop/pake.json`、`.github/workflows/desktop.yml` |
| 一键安装 | `install.sh` / `install.ps1` / `install.cmd` → `scripts/install.mjs` |
| 更新检查 | `src/update.js`（`checkUpdate`） |
| 更新执行 | `scripts/service.mjs`（`prepareUpdate`/`swapUpdate`/`commitUpdate`/`rollbackUpdate`/`runOp`） |
| 维护状态与通道 | `scripts/maint-state.mjs`、`scripts/maint-server.mjs` |
| 触发入口 | `src/server.js:292-305`、`src/protocol.js:180-181`、`src/main.js:55-80`、`public/app.js`（服务与更新面板） |
| 数据库 | `src/database.js`；迁移在 `src/session-store.js`、`src/sessions.js`、`src/pi-model-storage.js` |
| 自启注册 | `scripts/autostart.mjs` |
| 版本读取 | `src/main.js:59`（读 `package.json.version`） |

### 8.2 文件归属（并行开发约束）

| 归属 | 文件 | 说明 |
| --- | --- | --- |
| **01 独占新建** | `scripts/bundle/manifest.mjs` | 清单读取、版本比较、hash/签名校验 |
| | `scripts/bundle/update.mjs` | 暂存/下载校验/替换/回退；从 `service.mjs` 现有三段式下沉 |
| | `scripts/bundle/migrate.mjs` | 旧安装检测与迁移向导（只读检测 + 明确步骤） |
| | `desktop/bundle/*` | 安装包描述、打包输入清单、签名步骤（具体格式取决于 1.5 节核实结果） |
| | `tests/bundle-manifest.test.js`、`tests/bundle-update.test.js`、`tests/data-version.test.js` | 见第 10 节 |
| **集成负责人独占** | `public/app.js`、`src/server.js`、`src/protocol.js` | 全仓约定，他人不得编辑 |
| | `scripts/service.mjs`、`scripts/install.mjs`、`.github/workflows/desktop.yml`、`package.json`、`README.md` | 共享入口，改动由集成负责人接线 |
| **02 独占** | `scripts/autostart.mjs`、`src/main.js` 的启动/就绪/退出段 | 生命周期归 02，见第 5 节 |

原则：**不预先造大抽象**。`scripts/bundle/*` 只放这次真正需要的函数；不引入插件式更新源、不建更新历史数据库。

---

## 9. 建议接口与最小契约（拟议，均非已有）

> 以下函数/字段/路由**尚未存在**，命名可调整；写在这里是为了让 01 和 02 能各自用替身独立开发。

### 9.1 清单与版本

```js
// scripts/bundle/manifest.mjs（拟议）
export function parseManifest(text)            // → Manifest，字段非法抛错
export function bundleVersionOf(manifest)      // → "1.2.3"
export function compareBundleVersion(a, b)     // → -1 | 0 | 1（只比 bundleVersion）
export function verifyBundle(manifest, dir, verifyFile) // 逐文件比对 sha256
```

最小契约：

- `Manifest` 必含 `schema, bundleVersion, platform, arch, node.version, files, dataVersion`；缺一即拒绝。
- 版本比较**只**看 `bundleVersion`；`commit` 仅记录。
- 任一文件 hash 不匹配 → 拒绝使用该包，不尝试修复。

### 9.2 更新

```js
// scripts/bundle/update.mjs（拟议）
export async function checkBundleUpdate({ manifestUrl, fetchJson, current })  // → { available, local, remote, url, sha256 }
export async function stageBundle({ url, sha256, dir, download })            // → stagePath（校验失败即删除）
export function applyBundle({ stage, bundleRoot, backupDir })                // 仅在无进程占用时调用
export function rollbackBundle({ bundleRoot, backupDir })
```

最小契约：

- `checkBundleUpdate` 单次请求、无重试轮询；失败必须抛错，**不得**报「已是最新」（沿用 `src/update.js` 现有原则）。
- `applyBundle` 的前置条件由 02 保证：`stopped === true`。01 侧对未满足前置条件的调用直接抛错（防误用）。
- 替换顺序：旧目录 rename 成备份 → 新目录 rename 到位 → 失败则还原备份；备份在「新版本首次就绪」后才删除。
- **不在 01 内实现进程停止/启动**；需要就绪确认时向 02 查询。

### 9.3 数据版本

```js
// 拟议：可放在 scripts/bundle/update.mjs 或 src/database.js 旁的新模块
export function readDataVersion(database)            // → number | undefined（store: meta/dataVersion）
export function writeDataVersion(database, n)
export function assertDataVersionSupported(database, max)  // 超限抛错，不打开写模式
export function snapshotDatabase(database, targetPath)     // VACUUM INTO
```

最小契约：

- 标记复用现有 `store` 表，`namespace = "meta"`；不新建表。
- `assertDataVersionSupported` 在「本构建 dataVersion < 库内值」时抛错，错误文案含两端版本号与备份目录路径。
- `snapshotDatabase` 用 `VACUUM INTO`（只读一致性），目标文件存在时拒绝覆盖。

### 9.4 页面侧（走现有 WS，不改协议结构）

- 复用现有 `service.update.check` / `service.restart` 通道形状（`src/protocol.js:180-181`），**只改语义**：`service.update.check` 返回 `{ available, local, remote, url, sha256 }`；安装更新不再需要 40 位 SHA，而是「提示退出并安装」。
- 需要改动 `src/protocol.js`、`src/server.js`、`public/app.js` → 全部由集成负责人执行，01 只提供契约。

---

## 10. 独立开发的测试替身

目标：01 无需真实 Electron/Pake、无需真实签名证书、无需真实网络与全局 npm，即可自测。

| 替身 | 做法 | 覆盖点 |
| --- | --- | --- |
| 假清单源 | 注入 `fetchJson`（沿用 `tests/update.test.js` 现有风格） | 有新版本 / 无更新 / 网络失败 / 非法字段 |
| 假安装目录 | 临时目录里造 `manifest.json` + 几个小文件，逐文件 hash | `verifyBundle` 全对 / 缺文件 / 内容被改 |
| 假下载 | 注入 `download`，写入字节流或截断文件 | sha256 不匹配时 stage 被删除 |
| 假进程状态 | 注入 `isProcessRunning()` 或直接调用 `applyBundle` 时不传前置条件 | 有进程占用时拒绝替换 |
| 假替换目标 | 临时目录 + 目录改名，不用真实安装器 | 备份生成、失败还原、成功清理 |
| 假数据库 | 临时 `axiom.db`（`Database` 直接可用） | dataVersion 写入/读取/超限拒绝；`VACUUM INTO` 快照可重开 |
| 旧安装检测 | 临时目录造 `package.json` + autostart 注册文件 + 假 `axiom stop` 桩 | 检测到旧服务运行时拒绝迁移 |

不做的事：不起真实 Electron，不下载真实 Node，不执行真实 `npm install -g`，不碰用户 `~/.axiom`。

---

## 11. 分步实施（拟议顺序）

| 步 | 内容 | 产出 | 依赖 |
| --- | --- | --- | --- |
| 1 | **前置核实**：定位 Electron 实现（见 1.5），确认壳由谁产出 | 一页结论：壳=M? / 打包入口 | 无 |
| 2 | 清单模块 + 数据版本标记 | `scripts/bundle/manifest.mjs`、`dataVersion` 读写与拒绝逻辑 | 无 |
| 3 | 更新模块（版本比较、校验、替换、回退）+ 测试替身 | `scripts/bundle/update.mjs`、单测 | 步 2 |
| 4 | 打包：固定 Node + 私有依赖 + `manifest.json`，生成未签名 MSI/DMG | `desktop/bundle/*`、workflow 产物 | 步 1、2 |
| 5 | 首次启动自检（hash + dataVersion）与就绪输出统一版本 | `manifest.bundleVersion` 贯穿三处显示 | 步 2、4；02 提供就绪 |
| 6 | 更新前快照接入退出流程 | `VACUUM INTO` 备份 + 保留策略 | 步 3、5；02 提供「待更新退出」 |
| 7 | 签名/公证配置 | 签名产物 + 校验步骤 | 证书可用性（开放问题） |
| 8 | 旧安装迁移向导 | `scripts/bundle/migrate.mjs` + README 同步 | 步 4 |
| 9 | 页面接线（集成负责人） | 更新检查/提示退出文案 | 步 3；改 `server.js`/`protocol.js`/`app.js` |

> 步 7 可与 2–6 并行；签名未就位前，第 4 步产物仍可按现状标注「未签名，需手动批准」，但**必须**能本地验证 hash 校验链路。

---

## 12. 验收

### 12.1 现在就能跑（已有文件，本轮未执行）

```sh
node --test tests/update.test.js     # 现有更新检查语义（提交比对、失败不伪报）
node --test tests/install.test.js    # 现有安装流程
node --test tests/uninstall.test.js
```

### 12.2 待实现测试（文件尚不存在，不声称通过）

```sh
node --test tests/bundle-manifest.test.js   # 清单字段、版本比较、逐文件 hash、缺项拒绝
node --test tests/bundle-update.test.js     # 校验失败清理、替换与还原、有进程时拒绝
node --test tests/data-version.test.js      # 写入/读取、超限拒绝、VACUUM INTO 快照可重开
```

### 12.3 手工验收（需真实产物，晚于步 4/7）

- 干净虚拟机（无 Node、无 npm、无全局 Pi）安装未签名/已签名包 → 能启动、页面显示与 `manifest.bundleVersion` 一致的版本。
- 断网点击「检查更新」→ 明确报错，不显示「已是最新」。
- 应用运行中执行安装器 → 提示先退出，不强杀、不改目录。
- 退出后安装更高版本 → 重启后新版本就绪 → 旧目录备份在首次就绪后才清理。
- 故意在更高版本写入数据后降级装回 → 旧版本拒绝写库并提示备份路径；用快照还原后可正常使用。
- 旧 npm+Pake 用户按第 7 节迁移 → 全程无两个服务同时占用 4319，`~/.axiom` 会话与 `~/.pi` 配置保留。

---

## 13. 失败安全

| 失败点 | 期望行为 | 依据/沿用 |
| --- | --- | --- |
| 检查更新网络失败 | 报错，不伪报最新 | `src/update.js` 现有原则 |
| 清单字段非法/签名不符 | 拒绝使用，保留当前安装 | 本文件第 3.2 节 |
| 下载/暂存 hash 不匹配 | 删除暂存，继续用旧版本 | 沿用 `prepareUpdate` 双校验思路 |
| 替换中 rename 失败 | 从备份还原，旧版本仍可启动 | `swapUpdate`/`rollbackUpdate` 现有行为 |
| 新版本启动失败 | 保留备份；02 的崩溃重试到上限后停止，给终端恢复指引 | `AXIOM_MAX_CRASH_RETRIES` |
| 就绪超时 | 不并发拉起第二个实例；先确认优雅退出再回退 | `READY_TIMEOUT_MS`、`runOp` |
| 库版本高于本构建 | 拒绝写库，提示安装更高版本或还原快照 | 本文件第 6 节（拟议） |
| 迁移时旧服务仍在跑 | 停止迁移，保留旧状态 | 第 7.1 节 |
| 快照写失败 | 不继续退出更新流程，明确提示 | 第 6 节 |
| 用户中途取消 | 不留下半成品；暂存目录下次启动清理 | 约定 |

安全底线（不可简化）：签名/hash 校验、更新前快照、降级拒绝写库、旧新服务不并存。

---

## 14. 集成依赖、开放问题与交付清单

### 14.1 集成依赖

- **02**：提供「已安全退出（exitCode 0，无悬挂进程）」与「唯一实例已就绪（instanceId + bundleVersion）」两个事实；自启注册由 02 执行。
- **集成负责人**：`src/server.js`、`src/protocol.js`、`public/app.js`、`scripts/service.mjs`、`.github/workflows/desktop.yml`、`package.json`、`README.md`。01 只提契约，不改这些文件。
- **数据层**：`dataVersion` 标记与快照需在 `src/database.js` 或新模块落地；若落在 `src/database.js`，该处改动也交集成负责人。
- 版本显示统一：页面、守护进程、关于页必须读同一来源，避免三处版本号漂移（现状是 `package.json.version` + `pake.json.appVersion` 两处）。

### 14.2 开放问题（须先答复，不得虚构）

1. **Electron 实现位置未确认**（1.5 节）：在哪个仓库/分支？是否存在可运行代码，还是仅计划？结论决定第 2 步之后壳的产出方式。核实前不新建桌面端。
2. **签名证书**：当前无签名/公证配置（1.1 节）。有无 Windows 代码签名证书与 Apple Developer ID？没有则「整体签名」只能落地为「清单 + 内容 hash 自校验」，需用户明确接受。
3. **Node 运行时分发**：具体版本、来源与 LICENSE 随包方式（Node 许可证要求附带许可文本）。
4. **更新清单托管**：GitHub Release 上的 `manifest.json` 地址与命名（如 `latest-<platform>-<arch>.json`）；是否保留提交 SHA 供溯源。
5. **是否需要应用内下载**：第 4.1 节「最小版本」不含下载器；若用户要一键下载，再补 `stageBundle` 的真实实现。
6. **Pake 壳能否承载自包含布局**：若不能（例如无法控制 Node 路径或退出握手），是否必须走 Electron——这正是问题 1 的答案的一部分。

### 14.3 交付清单

- [ ] 前置核实结论：桌面壳实现来源（Pake / Electron）与打包入口。
- [ ] `manifest.json` 规范与 `scripts/bundle/manifest.mjs`。
- [ ] `scripts/bundle/update.mjs`：版本比较、hash 校验、替换、回退。
- [ ] `dataVersion` 标记 + 超限拒绝 + `VACUUM INTO` 更新前快照与保留策略。
- [ ] `scripts/bundle/migrate.mjs` 旧安装检测与迁移步骤（含「旧服务在跑则拒绝」）。
- [ ] 打包输入清单：固定 Node、私有依赖、LICENSE、单版本号三处一致。
- [ ] 签名/公证配置（取决于证书可用性）或「未签名 + hash 自校验」的明确降级说明。
- [ ] 待实现测试三件（第 12.2 节）与现有测试不回归（第 12.1 节）。
- [ ] `README.md` 安装/更新/迁移章节同步（由集成负责人执行）。
- [ ] 与 02 的交接契约书面确认（第 5 节）。
- [ ] 所有对外表述区分「现状证据」与「拟议设计」，不声称未执行过的验收。

---

## 附录 A：与 02 的职责对照（速查）

| 事项 | 01 | 02 |
| --- | --- | --- |
| 安装包构成 / 版本 / 签名 | ✓ | |
| 更新检查、下载、校验、替换 | ✓ | |
| 数据快照与数据版本拒绝 | ✓ | |
| 旧安装迁移步骤 | ✓ | |
| 单实例、启动链、就绪信号 | | ✓ |
| worker 停止与安全退出 | | ✓ |
| 崩溃重试、退避、自启注册 | | ✓ |
| 维护通道（`maint-server`） | 复用 | ✓ |
| 版本显示来源 | 定义单一来源 | 转发该值（不另算） |

## 附录 B：现状 vs 目标的常见误读

- 「桌面壳会内置后端」——**错**。现状壳只开 `http://127.0.0.1:4319`；自包含是**目标设计**，未实现。
- 「更新会自动下载安装」——**错**。现状是按提交 SHA 的 npm 换包，由用户在「设置 → 服务与更新」手动触发；目标仍是手动，且改为**退出后**由签名安装包替换。
- 「数据目录会随更新搬移」——**错**。`~/.axiom` 与 `~/.pi` 保持原位；迁移只处理服务与自启，不搬数据。
- 「有 Electron 代码可改」——**未证实**。仓库内只确认 Pake。
