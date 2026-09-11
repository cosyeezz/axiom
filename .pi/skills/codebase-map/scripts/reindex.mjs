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
  "scripts/service.mjs": "服务守护：IPC 快速/重建重启与安装构建失败反馈",
  "scripts/autostart.mjs": "Windows/macOS/Linux 当前用户登录自动启动安装/卸载",
  "scripts/install.mjs": "一键安装：装依赖/注册自启/启动守护/健康检查/打开浏览器",
  "src/main.js": "入口：端口/工作区校验，组装 factory+Sessions+server，信号处理",
  "src/pi.js": "createPiFactory：封装 pi-coding-agent，按 selection 组装会话（模型/能力/思考档）",
  "src/retry.js": "模型失败重试：可取消退避、最多30次、保留已有工具结果继续",
  "src/compaction.js": "后台独立摘要、token/占比阈值、快照校验与 turn 安全提交",
  "src/sessions.js": "Sessions：会话生命周期、队列、配置快照、~/.axiom 按工作空间持久化",
  "src/server.js": "createServerApp：HTTP 静态路由 + /health + WebSocket 升级与消息分发",
  "src/protocol.js": "zod 协议：selection / command 判别联合（消息类型见 L3）",
  "src/capabilities.js": "模型/子代理/技能目录发现、解析与设置快照（capabilityLoader/resolveCapabilities）",
  "src/tasks.js": "Tasks：子任务（委托）生命周期",
  "src/tools.js": "delegationTools：委托/凭证读取/追加工具定义（zod 入参）",
  "tests/task-notifications.test.js": "子任务通知落盘、批量唤醒、取消抑制与重启补发回归",
  "public/app.js": "前端唯一入口：视图栈、WS 客户端、会话/设置 UI、渲染调度",
  "public/markdown.js": "marked + DOMPurify 渲染（XSS 边界）",
  "public/stream-renderer.js": "流式增量渲染状态机",
  "public/file-picker.js": "共享文件/目录选择弹窗、懒加载与分类 SVG 图标",
  "public/file-picker.css": "文件选择弹窗主题与响应式布局",
  "tests/file-picker.test.js": "共享选择器懒加载、分页、竞态和键盘交互回归",
  "public/index.html": "页面骨架与元素 id（见 L3）",
  "public/style.css": "全局样式（CSP 禁 inline style，样式一律进这里）",
  "tests/image-input.test.js": "图片协议/签名/模型限制、真实队列附件快照与撤回、大图 WS 回归",
  "tests/workspace-picker.test.js": "Windows 原生目录选择置顶 owner、取消/超时/失败释放锁回归",
  "tests/session-flow.test.js": "会话落盘/恢复/删除、队列和运行中模型切换回归",
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
