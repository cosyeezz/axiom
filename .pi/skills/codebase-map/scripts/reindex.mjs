#!/usr/bin/env node
/**
 * 重建 axiom 多级代码索引 → 同目录上级 INDEX.md
 * 用法：node .pi/skills/codebase-map/scripts/reindex.mjs
 * 无第三方依赖，毫秒级。改动代码后、或使用索引前运行（保证实时）。
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = fileURLToPath(new URL("..", import.meta.url)); // .../codebase-map/
const ROOT = join(SKILL_DIR, "..", "..", ".."); // axiom/
const OUT = join(SKILL_DIR, "INDEX.md");

/**
 * 模块职责表（L0/L1 数据源）。新增文件时在这里补一行；
 * 未登记的文件会在 INDEX.md 里标 ⚠ 提醒补充。
 */
const MODULE_INFO = {
  "src/session-billing.js": "全会话 entries 用量与费用统计、当前上下文估算",
  "public/session-details.js": "主代理页签、安全可折叠 JSON 树与会话账单渲染",
  "src/data-owner.js": "写库前数据根独占：内核管道或socket持有，禁止同根双写",
  "tests/data-owner.test.js": "数据根独占、路径别名和释放重开回归",
  "tests/data-version.test.js": "数据版本超限写前拒绝与文件不变回归",
  "desktop/backend-lifecycle.mjs": "桌面直接管理随包Node worker：身份绑定就绪与真实退出确认",
  "desktop/main.mjs": "Electron唯一桌面入口、隔离窗口与安全退出",
  "scripts/stage-desktop.mjs": "暂存固定Node与完整后端依赖",
  "scripts/smoke-desktop.mjs": "随包Node空PATH隔离数据冒烟验证",
  "scripts/smoke-shell.mjs": "Electron真实窗口与安全退出隔离冒烟验证",
  "src/session-history.js": "JSONL当前分支纯读取：内存迁移不回写历史",
  "tests/backend-lifecycle.test.js": "假进程与可控时钟验证并发启动、伪就绪、超时及退出竞态",
  "tests/task-cancel-notifications.test.js": "单子任务取消工具注册、兄弟隔离与持久化完成通知集成回归",
  "src/questions.js": "主代理 question 工具、参数校验与可取消的回答等待",
  "tests/questions.test.js": "提问等待、校验、会话隔离、子代理不可用与取消回归",
  "tests/pi-question.test.js": "真实Pi SDK提问等待、工具答案续轮与取消回归",
  "tests/question-preview.mjs": "无模型提问UI验收服务：真实工具等待、网页回执与结果展示",
  "tests/question-ui.test.js": "提问面板多题键盘、自由输入与提交竞态回归",
  "public/goal.js": "Goal 专属状态、操作与复用消息轮次分组",
  "public/goal.css": "Goal 目标面板、轮次与控制样式",
  "public/question.js": "主代理提问选项卡、键盘交互与回答提交",
  "public/question.css": "提问面板样式、焦点与窄屏布局",
  "src/session-memory.js": "标题提取登记、轮次预算挂钩与委派背景",
  "src/task-budget.js": "主子代理轮次预算规则、收尾提示词与配置页参数校验",
  "tests/task-budget.test.js": "轮次预算默认值、边界校验与系统提示词回归",
  "public/answer-tags.js": "主代理回答标签解析、代码保护与流式容错",
  "src/prompts.js": "Axiom 自有提示词按 main/subagent/compaction 角色集中维护",
  "public/memory-tags.js": "主子代理共享简单标签提取与流式显示过滤",
  "public/markdown-scan.js": "共享代码区扫描：围栏/缩进/行内代码掩码与区间切割",
  "public/goal-markers.js": "前后端共享 goal 完成标记解析与展示层剥离（含流式半截）",
  "tests/goal-markers.test.js": "完成标记严格口径、代码区保留、流式半截与页面展示回归",
  "tests/helpers/public-source.js": "页面测试加载 public ESM 源码：按序拼接并剥模块语法",
  "tests/session-memory.test.js": "摘要时序、被动进度、标题保护与JSON恢复回归",
  "tests/memory-tags.test.js": "标签边界、代码块、流式前缀与合法性回归",
  "tests/pi-memory.test.js": "Pi事件接入、turn计数与请求前提示注入回归",
  "tests/memory-ui.test.js": "摘要记录入口与助手标签隐藏回归",
  "scripts/maint-server.mjs": "loopback维护HTTP：来源校验、随机凭证、状态与离线恢复",
  "scripts/maint-state.mjs": "守护维护状态：持久化阶段、最近结果与有界脱敏证据",
  "tests/service-settings.test.js": "服务设置操作、确认更新、进度与离线恢复回归",
  "public/service-settings.js": "设置页服务维护：真实进度、结果、更新确认与独立维护通道",
  "tests/service-settings-api.test.js": "维护接口本机凭证隔离、CSP、只读更新检查与实例健康回归",
  "tests/service-settings-ui.py": "服务设置真实浏览器桌面/手机布局与键盘关闭验收",
  "src/remote.js": "Tailscale 登录身份、远程监听、同账号授权与本机配置持久化",
  "tests/model-onboarding.test.js": "空凭据启动、配置后热选模型与显式无效模型回归（真实 Pi SDK）",
  "tests/remote.test.js": "Tailscale 远程访问身份、撤权、持久化与来源校验回归",
  "tests/remote-ui.test.js": "远程设置导航、状态、保存、登录与断线回归",
  "tests/remote-ui.py": "远程设置真实浏览器布局、分类切换与键盘关闭回归",
  "tests/session-created-at.test.js": "会话创建时间稳定、持久化与旧记录兼容回归",
  "tests/session-sidebar-ui.py": "浏览器侧栏验收：单工作空间、分组日期、绿点与操作展开",

  "src/inline-images.js": "模型上下文图片定位：将占位符与真实附件交错排列，不改存储与队列",
  "scripts/dev.mjs": "开发入口：DEV 标识、4320 端口与独立数据目录",
  "scripts/dev-vite.mjs": "独立 Vite 前端：CSS 热替换、同源代理与整页刷新暂停",
  "scripts/service.mjs": "服务守护：IPC 重启、HTTP 安全停止与崩溃退避停止通道",
  "scripts/uninstall.mjs": "统一卸载：核对 npm 目标、安全停止、取消自启、保留用户数据", 
  "scripts/autostart.mjs": "Windows/macOS/Linux 当前用户登录自动启动安装/卸载",
  "scripts/install.mjs": "一键安装：装依赖/注册自启/启动守护/健康检查/打开浏览器",
  "src/main.js": "入口：端口/工作区校验，组装 factory+Sessions+server，信号处理",
  "src/pi.js": "createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档）",
  "src/retry.js": "模型失败重试：可取消退避、最多45次、16分钟封顶、自定义错误词表、保留已有工具结果继续",
  "src/compaction.js": "后台独立摘要、token/占比阈值、快照校验与 turn 安全提交",
  "tests/session-persistence.test.js": "增量保存/失败重试、懒加载与取消恢复回归",
  "tests/helpers/model-concurrency-child.mjs": "跨进程CAS回归：捕获旧权威后的确定性屏障与退出清理",
  "tests/sqlite-benchmark.mjs": "SQLite 新旧合成数据、写入/启动/锁等待性能验收",
  "src/database.js": "共享 SQLite 连接、小配置 KV、WAL 与一致性备份",
  "src/session-history.js": "稳定消息身份、绑定会话/实例/修订的历史游标与有界传输页",
  "public/session-cache.js": "可淘汰会话阅读位置缓存与未保存输入保护",
  "src/session-store.js": "会话三表、实体增量更新、逐会话事务与旧数据迁移",
  "src/pi-model-storage.js": "模型与凭据 SQLite 权威存储、Pi 派生兼容文件",
  "src/sessions.js": "Sessions：会话生命周期、增量保存、元数据启动与SDK按需恢复",
  "src/server.js": "createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发",
  "src/protocol.js": "zod 协议：selection / command 判别联合（消息类型见 L3）",
  "src/update.js": "检查更新：本地安装（提交 SHA/版本）比对 GitHub 公开仓库 master，npm 安装实例可自动重装",
  "src/capabilities.js": "模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities）",
  "src/goal.js": "Goal：会话级目标状态、轮次计划、验收门与持久化",
  "src/tasks.js": "Tasks：子任务（委托）生命周期",
  "src/tools.js": "delegationTools：委托/凭证读取/追加工具定义（zod 入参）",
  "tests/compaction-ui.test.js": "压缩进度与任务归属：实时/快照/多轮摘要的 UI 回归",
  "tests/compaction-ui.py": "压缩界面真实浏览器验收：摘要分层、子代理弹窗与窄屏状态",
  "tests/task-notifications.test.js": "子任务通知落盘、批量唤醒、取消抑制与重启补发回归",
  "public/app.js": "前端唯一入口：视图栈、会话/设置 UI、权威归并与渲染调度",
  "public/transport.js": "业务 WS 唯一所有者：请求回执、逻辑订阅、快照事件闸门与有界恢复",
  "src/transport.js": "统一有界 WS 发送：回执、广播、删除通知与慢客户端隔离",
  "public/model-picker.js": "共享模型选择器：供应商/模型/思考收藏、排序与键盘交互",
  "public/model-picker.css": "共享收藏下拉：浮层、星标、触屏与焦点样式",
  "public/model-manager.js": "统一模型管理：供应商、字段覆盖与思考等级编辑",
  "public/model-auth.js": "网页登录：授权提示、设备码、凭据输入与取消",
  "src/model-auth.js": "SDK 登录桥：连接隔离、超时取消与安全事件投影",
  "public/model-manager.css": "模型配置页：供应商列表、编辑表单与响应式布局",
  "src/model-config.js": "Pi models.json 无损配置读写与共享收藏持久化",
  "tests/model-settings-ui.py": "模型设置浏览器验收：思考收藏持久、仅勾选添加与窄屏布局",
  "tests/model-selection-ui.py": "模型选择与配置真实浏览器验收：收藏共享、配置编辑、窄屏与键盘",
  "tests/model-selection-preview.mjs": "模型选择 UI 隔离验收服务：临时配置与模拟会话，不读取用户凭据",
  "public/markdown.js": "marked + DOMPurify 渲染（XSS 边界）",
  "public/stream-renderer.js": "共享 rAF 流式绘制、交互让路与挂载生命周期",
  "public/stream-playback.js": "有界字素播放游标与真实时间缓冲追赶",
  "tests/stream-playback.test.js": "纯播放时钟、字素边界与追赶测试",
  "tests/smooth-stream.test.js": "流式 DOM 生命周期、净化与权威文本测试",
  "tests/smooth-stream-browser.py": "隔离浏览器串行流式性能测量",
  "tests/smooth-stream-preview.mjs": "无模型无业务连接的流式测量静态实例",
  "public/file-picker.js": "共享文件/目录选择弹窗、懒加载与分类 SVG 图标",
  "public/file-picker.css": "文件选择弹窗主题与响应式布局",
  "public/tooltip.js": "共享悬停说明：动态 title、键盘、定位与无障碍",
  "public/tooltip.css": "共享悬停说明样式（浅色主题下反色）",
  "tests/tooltip.test.js": "共享提示事件、动态文本与键盘回归",
  "tests/conversation-preview.mjs": "无模型本地 UI 验收：思考、工具状态、Markdown、子任务与窄屏样例",
  "tests/text-diagram-ui.py": "可选 Playwright 回归：字符示意图单双宽网格与窄屏滚动",
  "tests/conversation-ui.py": "可选 Playwright 浏览器回归：配色、字重、吸顶收起、无内滚动、子代理定位与动态状态",
  "tests/message-activity.test.js": "消息活动状态、连续思考合并、工具历史与终态回归",
  "tests/file-picker.test.js": "共享选择器懒加载、分页、竞态和键盘交互回归",
  "public/index.html": "页面骨架与元素 id（见 L3）",
  "public/style.css": "全局样式（CSP 禁 inline style，样式一律进这里）",
  "public/theme.js": "首帧前阻塞应用明/暗主题（localStorage axiom.theme，默认深色）",
  "tests/image-input.test.js": "图片协议/签名/模型限制、真实队列附件快照与撤回、大图 WS 回归",
  "tests/workspace-picker.test.js": "Windows 原生目录选择置顶 owner、取消/超时/失败释放锁回归",
  "tests/project-skills.test.js": "项目技能来源、工作空间默认隔离、旧配置迁移与目录链接加载回归",
  "tests/session-flow.test.js": "会话落盘/恢复/删除、历史索引与队列/模型切换回归",
  "tests/": "node --test 测试（npm test）",
};

const SCAN_DIRS = ["src", "public", "tests", "scripts"];
const SKIP = new Set(["node_modules"]);
const KEYWORDS = new Set([
  "if", "for", "while", "switch", "catch", "return", "function", "class",
  "const", "let", "var", "async", "await", "new", "delete", "typeof",
]);
const SYMBOL = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\s*\*?|class|const|let)\s+([A-Za-z_$][\w$]*)/;
const METHOD = /^ {2}(?:async\s+)?([A-Za-z_$][\w$]{1,})\s*\(/;
const ROUTE = /^\s*\["(\/[^"]*)"/;

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const files = [];
for (const d of SCAN_DIRS) {
  const abs = join(ROOT, d);
  try { for await (const p of walk(abs)) files.push(p); } catch { /* 目录不存在则跳过 */ }
}
files.sort();

const byFile = []; // { path, lines, info, symbols:[{name,kind,line}], literals:[], ids:[], routes:[] }
for (const abs of files) {
  const rel = relative(ROOT, abs).split(sep).join("/");
  if (rel.endsWith(".png") || rel.endsWith(".svg")) continue;
  const text = await readFile(abs, "utf8");
  const lines = text.split("\n");
  const f = { path: rel, lines: lines.length, info: "", symbols: [], literals: [], ids: [], routes: [] };
  outer: for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(SYMBOL);
    if (m && !KEYWORDS.has(m[1])) { f.symbols.push({ name: m[1], kind: /class/.test(line) ? "class" : /function/.test(line) ? "function" : "const", line: i + 1 }); continue; }
    const mm = line.match(METHOD);
    if (mm && !KEYWORDS.has(mm[1])) { f.symbols.push({ name: mm[1], kind: "method", line: i + 1 }); continue; }
    if (rel === "src/protocol.js") for (const l of line.matchAll(/z\.literal\("([^"]+)"\)/g)) f.literals.push(l[1]);
    if (rel === "public/index.html") for (const l of line.matchAll(/id="([\w-]+)"/g)) f.ids.push(l[1]);
    if (rel === "src/server.js") { const r = line.match(ROUTE); if (r) f.routes.push(r[1]); }
  }
  // 归并模块级职责描述（目录条目匹配前缀）
  for (const [k, v] of Object.entries(MODULE_INFO))
    if (rel === k || (k.endsWith("/") && rel.startsWith(k))) f.info = v;
  byFile.push(f);
}

const unregistered = byFile.filter((f) => !f.info);
const key = (f) => f.symbols.filter((s) => s.kind !== "method").slice(0, 4).map((s) => s.name).join(", ");
const now = new Date().toLocaleString("zh-CN", { hour12: false });

let md = `<!-- 自动生成，勿手改。重建：node .pi/skills/codebase-map/scripts/reindex.mjs -->\n`;
md += `# Axiom 多级代码索引（生成于 ${now}）\n\n`;

md += `## L1 模块总览（文件 → 职责）\n\n| 文件 | 行数 | 职责 | 关键符号 |\n|---|---|---|---|\n`;
for (const f of byFile)
  md += `| ${f.path} | ${f.lines} | ${f.info || "⚠ 未登记：请在 reindex.mjs 的 MODULE_INFO 补一行"} | ${key(f) || "-"} |\n`;

md += `\n## L2 符号 → 行号（跳转：read ${"<文件>"} offset=<行>）\n\n`;
for (const f of byFile) {
  if (!f.symbols.length) continue;
  md += `### ${f.path}（${f.lines} 行）${f.info ? " — " + f.info : ""}\n\n| 符号 | 类型 | 行 |\n|---|---|---|\n`;
  for (const s of f.symbols) md += `| ${s.name} | ${s.kind} | ${s.line} |\n`;
  md += `\n`;
}

md += `## L3 横切常量（跨模块定位入口）\n\n`;
const proto = byFile.find((f) => f.path === "src/protocol.js");
if (proto?.literals.length) md += `- 协议 command.type：${proto.literals.join("、")}（src/protocol.js）\n`;
const ids = byFile.find((f) => f.path === "public/index.html");
if (ids?.ids.length) md += `- HTML id：${ids.ids.join("、")}（public/index.html）\n`;
const srv = byFile.find((f) => f.path === "src/server.js");
if (srv?.routes.length) md += `- HTTP 静态路由：${srv.routes.join("、")}、/health（src/server.js）\n`;
md += `\n## ⚠ 未登记文件（${unregistered.length}）\n\n`;
md += unregistered.length ? unregistered.map((f) => `- ${f.path}`).join("\n") + `\n> 在 scripts/reindex.mjs 的 MODULE_INFO 补职责后重跑。\n` : `（无）\n`;

await writeFile(OUT, md, "utf8");
console.log(`INDEX.md 已重建：${byFile.length} 个文件，${unregistered.length} 个未登记 → ${relative(ROOT, OUT)}`);
