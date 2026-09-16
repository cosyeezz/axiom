// 纯静态预览：只服务 public/ 与内置测试页，loopback 随机端口，不启动业务服务、不开业务 WebSocket、不调用模型。
// 测试页直接 import 真实 public/markdown.js 与 public/stream-renderer.js，挂载普通 active item。
// 运行：node tests/smooth-stream-preview.mjs   （PORT=0 随机端口，也支持 PORT=<端口>）
// 启动后打印一行：SMOOTH-STREAM-PREVIEW http://127.0.0.1:<port>/smooth-stream.html
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(repo, "public");
// 与 src/server.js 一致的 vendor 映射（markdown.js 依赖这两个前端库，仍来自 node_modules，非业务服务）。
const vendor = new Map([
  ["/vendor/marked.js", join(repo, "node_modules", "marked", "lib", "marked.esm.js")],
  ["/vendor/purify.js", join(repo, "node_modules", "dompurify", "dist", "purify.es.mjs")],
]);
const types = {
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2", ".png": "image/png", ".ico": "image/x-icon",
};

// 页面内测量逻辑：无模板字符串，便于内联进测试页。
const HARNESS = `
import { renderMarkdown as realRender } from "/markdown.js";
import { createStreamRenderer } from "/stream-renderer.js";
import { marked } from "/vendor/marked.js";
let lexes = 0;
const lexer = marked.lexer;
marked.lexer = (...args) => { lexes++; return lexer(...args); };

const SCROLL = document.getElementById("scroll");
const MOUNT = document.getElementById("mount");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (n) => Math.round(n * 100) / 100;
const pad3 = (n) => String(n).padStart(3, "0");

let renderCalls = 0;
let lastRenderText = "";
const counted = (element, text = "") => { renderCalls += 1; lastRenderText = text; return realRender(element, text); };
counted.isPlainText = realRender.isPlainText; // 保留属性：stream-renderer 依赖它选纯文本 playback 路径

let paints = 0;
const renderer = createStreamRenderer(counted, () => { paints += 1; });

const longtasks = [];
let longtaskSupported = false;
try {
  new PerformanceObserver((list) => { for (const entry of list.getEntries()) longtasks.push(entry.duration); })
    .observe({ type: "longtask", buffered: false });
  longtaskSupported = true;
} catch (error) { longtaskSupported = false; }

// 纯文本：只含 \\p{L} 与白名单标点，满足 renderMarkdown.isPlainText 且无前导空白。
const PLAIN_SEED = "平滑流式显示游标只保留最新正文引用，按字素边界推进显示。";
const LITERAL_SEED = "超长安全原文，普通文本不含任何标记语法；中文与 ascii 混排 0123456789。";
const fill = (seed, chars) => { let out = ""; while (out.length < chars) out += seed; return out.slice(0, chars); };

function complexDoc(sections) {
  let out = "";
  for (let i = 1; i <= sections; i++) {
    const tag = "M" + pad3(i);
    out += "## 段落 " + i + " · 标记 " + tag + "\\n\\n"
      + "**重点 " + i + "** 与 *补充 " + i + "*，路径 \`public/module-" + i + ".js\`，标记 " + tag + "。\\n\\n"
      + "- 工具记录 " + i + "：" + tag + "\\n- 状态 " + i + "：已调整\\n\\n"
      + "| 内容 | 展示 | 状态 |\\n| --- | --- | --- |\\n| 行 " + i + "A（" + tag + "） | 单行入口 | 已调整 |\\n| 行 " + i + "B | 按需展开 | 已调整 |\\n\\n"
      + "\`\`\`js\\nconst item" + i + " = { id: " + i + ", text: \\"" + tag + "\\" };\\nconsole.log(item" + i + ".text);\\n\`\`\`\\n\\n"
      + "> 引用 " + i + "：" + tag + " 结论应当一眼能找到。\\n\\n";
  }
  return out;
}

function sourceFor(spec) {
  if (spec.kind === "stream") return fill(PLAIN_SEED, spec.charsPerBatch * spec.batches);
  if (spec.kind === "long") return fill(LITERAL_SEED, spec.chars);
  return complexDoc(spec.sections);
}

function split(source, parts) {
  const size = Math.max(1, Math.ceil(source.length / parts));
  const out = [];
  for (let i = 0; i < source.length; i += size) out.push(source.slice(i, i + size));
  return out;
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);
  return {
    n: sorted.length, mean: round(sorted.reduce((sum, v) => sum + v, 0) / (sorted.length || 1)),
    p50: round(at(0.5)), p95: round(at(0.95)), max: round(sorted.length ? sorted[sorted.length - 1] : 0),
  };
}

// 普通 active item：字段与 public/app.js 的 live item 对齐（无 task、无思考、未挂起）。
function makeItem() {
  MOUNT.replaceChildren();
  const node = document.createElement("div");
  node.className = "message";
  const thinking = document.createElement("details");
  thinking.hidden = true;
  const text = document.createElement("div");
  text.className = "message-text";
  const thought = document.createElement("div");
  const processText = document.createElement("div");
  node.append(thinking, text, processText);
  MOUNT.append(node);
  return {
    task: null, active: true, node, text, thought, processText, thinking,
    buffer: "", processBuffer: "", reasoning: "", paintedText: "", paintedProcess: "",
    raw: "", pending: false, mounted: true, generation: 0, prepare: undefined,
  };
}

// 每帧采样：rAF 间隔 + pending UTF-16（buffer 与已绘制文本的码元差）。
function sampler(item) {
  const frames = [];
  const pending = [];
  let last = null;
  let running = true;
  const tick = (time) => {
    if (!running) return;
    if (last !== null) frames.push(time - last);
    last = time;
    pending.push(Math.max(0, item.buffer.length - (item.paintedText || "").length));
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return { stop() { running = false; return { frames, pending }; } };
}

let current = null;

async function settled(item, timeoutMs = 4000) {
  const until = performance.now() + timeoutMs;
  let stable = 0;
  while (performance.now() < until) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    stable = (item.paintedText || "").length === item.buffer.length ? stable + 1 : 0;
    if (stable >= 3) return true;
  }
  return false;
}

async function run(spec) {
  const item = makeItem();
  current = item;
  const source = sourceFor(spec);
  const before = { calls: renderCalls, lexes, paints, longtasks: longtasks.length };
  SCROLL.scrollTop = 0;
  const watch = sampler(item);
  const startedAt = performance.now();
  const chunks = spec.kind === "stream" ? split(source, spec.batches) : split(source, spec.bursts);
  const gap = spec.kind === "stream" ? spec.intervalMs : spec.burstMs;
  for (let i = 0; i < chunks.length; i++) {
    item.buffer += chunks[i];
    renderer.mark(item);
    if (i < chunks.length - 1) await sleep(gap);
  }
  const pendingAtFlush = Math.max(0, item.buffer.length - (item.paintedText || "").length);
  renderer.flush(item);
  await settled(item);
  const durationMs = round(performance.now() - startedAt);
  const { frames, pending } = watch.stop();
  const dom = MOUNT.textContent;
  const count = (selector) => MOUNT.querySelectorAll(selector).length;
  const tasks = longtasks.slice(before.longtasks);
  return {
    name: spec.name, kind: spec.kind, spec,
    chars: source.length, chunks: chunks.length, delayMs: gap,
    durationMs, settled: (item.paintedText || "").length === item.buffer.length,
    frames: Object.assign({ jankOver33ms: frames.filter((value) => value > 33.34).length }, stats(frames)),
    pendingUtf16: Object.assign({ peak: pending.length ? Math.max(...pending) : 0, atFlush: pendingAtFlush }, stats(pending)),
    renderCalls: renderCalls - before.calls,
    lexes: lexes - before.lexes,
    paints: paints - before.paints,
    longtasks: {
      supported: longtaskSupported, count: tasks.length,
      totalMs: round(tasks.reduce((sum, value) => sum + value, 0)), maxMs: round(tasks.length ? Math.max(...tasks) : 0),
    },
    finalRenderChars: lastRenderText.length,
    finalTextComplete: lastRenderText === source,
    // 纯文本走 playback/plain 分支：DOM 即原文；literal 分支会在原文前插一条提示。
    domTextComplete: spec.kind === "burst" ? null : spec.kind === "long" ? dom.endsWith(source) : dom === source,
    domTags: { pre: count("pre"), p: count("p"), table: count("table"), code: count("code"), h2: count("h2"), li: count("li") },
    missingMarkers: spec.kind === "burst" ? spec.markers.filter((marker) => !dom.includes(marker)) : [],
    literalNotice: dom.includes("长内容以原文展示"),
    sockets: window.__sockets,
    isPlainTextPreserved: counted.isPlainText === realRender.isPlainText,
  };
}

// 输入停止后的交互响应：滚动与按键（不触发任何模型调用）。
async function responsiveness(rounds = 20) {
  const item = current;
  const scrollLatency = [];
  const keyLatency = [];
  let scrollEvents = 0, scrolled = 0, keyHandled = 0;
  const probe = document.createElement("div");
  probe.hidden = true;
  MOUNT.append(probe);
  const onKey = (event) => { keyHandled += 1; probe.textContent = "key:" + event.key + ":" + keyHandled; };
  const onScroll = () => { scrollEvents += 1; };
  document.addEventListener("keydown", onKey);
  SCROLL.addEventListener("scroll", onScroll, { passive: true });
  for (let i = 0; i < rounds; i++) {
    const scrollAt = performance.now();
    SCROLL.scrollTop = SCROLL.scrollTop + 60 + (i % 4) * 40;
    if (SCROLL.scrollTop > 0) scrolled += 1;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    scrollLatency.push(performance.now() - scrollAt);
    const keyAt = performance.now();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    keyLatency.push(performance.now() - keyAt);
  }
  document.removeEventListener("keydown", onKey);
  SCROLL.removeEventListener("scroll", onScroll);
  probe.remove();
  return {
    rounds, scrollEvents, scrolled, keyHandled,
    scrollHeight: SCROLL.scrollHeight, clientHeight: SCROLL.clientHeight,
    paintedComplete: item ? (item.paintedText || "").length === item.buffer.length : false,
    scrollLatency: stats(scrollLatency), keyLatency: stats(keyLatency),
  };
}

window.harness = { ready: true, run, responsiveness };
`;

const PAGE = [
  "<!doctype html>",
  '<html lang="zh-CN"><head><meta charset="utf-8"><title>smooth stream harness</title>',
  "<style>html,body{margin:0;height:100%}#scroll{height:100vh;overflow:auto}",
  // 宿主最小样式：仅保证长文/代码换行，让页面真实可滚（不改业务布局）。
  "#mount{padding:8px;max-width:820px;font:14px/1.6 system-ui,sans-serif}#mount pre{white-space:pre-wrap;word-break:break-word;margin:0}</style>",
  "</head><body>",
  '<div id="scroll"><div id="mount"></div></div>',
  // 硬隔离：任何 WebSocket 构造都会被计数（业务 WS 一旦出现，脚本即能从结果中发现）。
  '<script>window.__sockets=0;window.WebSocket=function(){window.__sockets+=1;};</script>',
  '<script type="module">',
  HARNESS,
  "</script></body></html>",
  "",
].join("\n");

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/smooth-stream.html") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(PAGE);
    return;
  }
  const mapped = vendor.get(url.pathname);
  const file = mapped || join(root, normalize(decodeURIComponent(url.pathname).replace(/^\/+/, "")));
  if (!file.startsWith(mapped ? repo : root)) { response.writeHead(404).end("not found"); return; }
  try {
    const body = await readFile(file);
    response.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    response.end(body);
  } catch { response.writeHead(404).end("not found"); }
});

const port = Number(process.env.PORT || 0);
server.listen(port, "127.0.0.1", () => {
  console.log(`SMOOTH-STREAM-PREVIEW http://127.0.0.1:${server.address().port}/smooth-stream.html`);
});
