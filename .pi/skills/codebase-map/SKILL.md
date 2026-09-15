---
name: codebase-map
description: axiom 项目导航与排障。多级索引（模块总览→符号→行号→横切常量）快速定位代码，分层排查 bug；改动后实时重建索引，bug 知识自成长沉淀到 knowledge.md。凡在 axiom 仓库内找代码、看结构、改功能、查 bug 时使用。
---

# Axiom 代码导航（多级索引 + 排障 + 自成长）

## 索引层级

| 层级 | 位置 | 内容 | 何时看 |
|---|---|---|---|
| L0 | 本文件 | 架构图 + 模块职责 | 了解全局、结构变化时 |
| L1 | INDEX.md 上半 | 文件 → 行数 → 职责 → 关键符号 | 定位到文件 |
| L2 | INDEX.md 下半 | 符号 → 文件:行号 表格 | 精确跳转 |
| L3 | INDEX.md 末尾 | 协议消息 type、HTML id、HTTP 路由 | 横切定位（消息流/UI 元素/接口） |
| 坑库 | knowledge.md | 历史 bug 与模式，只追加 | **查 bug 前必读** |

INDEX.md 是生成物（勿手改）；knowledge.md 是人工沉淀物（勿删历史）。

## 定位流程（最快路径）

1. **用前先跑**（毫秒级，保证索引实时）：
   ```bash
   node .pi/skills/codebase-map/scripts/reindex.mjs
   ```
2. L1 模块总览 → 按职责锁定文件
3. L2 符号表拿行号 → `read <文件> offset=<行>` 直接跳，不用翻全文
4. 找不到符号 → 索引可能过期，重跑第 1 步 → 仍无 → `rg` 关键字兜底 → 还没有就是新增文件未登记（INDEX.md 末尾有 ⚠ 未登记清单）

## 架构图（L0）

```
desktop/pake.json ── Pake 独立桌面壳（macOS Universal / Windows x64）
  └─ 打开 http://127.0.0.1:4319（不内置/启动后端，复用以下网页）
     .github/workflows/desktop.yml 分平台打包
浏览器 public/
  index.html ── app.js（唯一入口：视图栈/权威归并/会话设置UI）
                 ├─ transport.js        唯一业务连接、请求回执、逻辑订阅与快照闸门
                 ├─ goal.js/css         Goal 目标面板与轮次分组（复用现有消息节点）
                 ├─ question.js/css     主代理多题回答卡、键盘操作与回执
                 ├─ service-settings.js  服务设置：更新确认、维护阶段与断线诊断
                 ├─ model-picker.js      共享供应商/模型/思考下拉，星标收藏与键盘操作
                 ├─ model-manager.js     设置页 Pi 供应商/模型管理，模板与安全编辑
                 ├─ file-picker.js       共享文件/目录选择、分类图标、按目录分页加载
                 ├─ tooltip.js/css       全站统一暗色悬停提示（接管原生 title、键盘/Popover/Esc）
                 ├─ markdown.js          marked + DOMPurify（XSS 边界）
                 └─ stream-renderer.js   共享 rAF 绘制/挂载生命周期
                      └─ stream-playback.js  有界字素游标/真实时间缓冲追赶
      │  WebSocket JSON（command，src/protocol.js zod 校验）
      ▼
scripts/install.mjs    一键安装：装依赖/注册自启/启动守护/健康检查/打开浏览器
scripts/uninstall.mjs  核对安装目录 → 安全停止 → 取消自启 → 卸载（保留用户数据）
scripts/autostart.mjs  Windows/macOS/Linux 用户登录自动启动注册
  └─ scripts/service.mjs  守护进程：维护执行、新实例验证与故障恢复
       ├─ maint-state.mjs  最近操作持久化、阶段与脱敏证据
       ├─ maint-server.mjs 独立 loopback 状态/恢复入口
       └─ src/main.js  入口：端口/cwd 校验，组装并 listen(127.0.0.1)
  ├─ server.js       HTTP 静态路由 + /health + WS 升级分发
  │    ├─ transport.js  所有回执/广播/删除通知统一有界发送
  │    └─ remote.js  可选 Tailscale 独立监听、同账号 whois 验证、本机远程配置
  ├─ model-config.js SQLite 模型配置、版本冲突保护与全局收藏（pi-model-storage.js 自动派生 SDK 兼容文件）
  ├─ Sessions        会话生命周期/队列、元数据启动与 SDK 按需恢复；Pi JSONL 为历史权威
  │    ├─ session-store.js 会话/摘要/事件/任务四表、实体增量与旧数据迁移
  │    ├─ database.js SQLite 连接、小配置 store 表、WAL 与一致性备份
  │    ├─ session-memory.js  标题/逐回复摘要登记、最近32条背景与被动进度
  │    │    └─ public/memory-tags.js  标签提取与前端显示过滤（保留Pi原始消息）
  │    ├─ goal.js       会话级目标状态/轮次/验收门（Sessions 外层调度，共用 Pi 执行）
  │    ├─ questions.js 主代理提问等待、答案校验、快照与取消
  │    └─ Tasks ── delegationTools（tools.js，注册给 pi 的委托工具）
  └─ pi.js createPiFactory → pi-coding-agent SDK（原生队列 + SessionManager JSONL）
       ├─ capabilities.js  模型/子代理/技能发现与解析
       │    └─ inline-images.js  模型请求副本按正文占位交错排列图片
       └─ compaction.js    后台摘要 + 原生 turn 安全提交，保留检查点后的消息
```

## 查 bug 流程

1. **先读 knowledge.md**——WS 时序、渲染、协议校验是历史多发区，多数坑有记录
2. 按数据流分层排查（一层层验证，别跳步）：
   ```
   app.js 权威归并 ← transport.js 事件/pending Map → WS → server.js 分发 → sessions.js 状态
   → pi.js / capabilities.js / tasks.js → 回执经 protocol.js 校验
   → app.js renderMessage / renderer 渲染
   ```
3. 常见怀疑点速查：
   - 会话状态/回执错乱 → public/transport.js 请求表与消息分发 + src/sessions.js
   - 渲染/XSS → stream-renderer.js、markdown.js（DOMPurify 必须过）
   - 配置不生效/继承 → sessions.js defaults 快照 + capabilities.js resolveCapabilities
   - 委托子任务 → tasks.js + tools.js + sessions.js 装配处
   - 协议报错 → protocol.js（L3 有全部 command.type）
   - 消息排队/回执与执行状态混淆 → sessions.js 队列分支 + app.js 队列 UI（回执只代表入队，不代表执行）
   - 子代理浮层/运行详情 → app.js overlay（必须以会话区定位，不覆盖侧栏、不污染共享渲染）
   - 重启后会话丢失 → sessions.js ~/.axiom 持久化（load/persist）
4. 验证：`npm test`；起服务 `npm start`（默认 127.0.0.1:4319）浏览器复现

## 改动后的更新规则（实时 + 自成长，三件事缺一不可）

1. **重建索引**：`node .pi/skills/codebase-map/scripts/reindex.mjs`
2. **沉淀知识**：修了 bug 或踩了坑 → knowledge.md 追加一条（日期/症状/根因/修复位置/防再犯），只追加不删改
3. **测试全绿**：`npm test`

另有：
- 新增文件 → reindex.mjs 顶部 `MODULE_INFO` 补一行职责（INDEX.md 末尾 ⚠ 会提醒）
- 架构级变化（模块增删/职责迁移）→ 更新本文件架构图
- 仓库流程规范 → 仓库根 AGENTS.md（worktree、README/devlog 同步、提交风格）
