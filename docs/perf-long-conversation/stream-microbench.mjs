// 流式单帧耗时配对微基准采集脚本（长对话性能调研·独立复核轮）
//
// 口径（与 docs/perf-long-conversation/stream-render.json 一致，便于同口径比较）：
//   对真实会话文本直接调用 public/markdown.js 的 renderMarkdown，文本累计增长，
//   每帧追加 chunkChars 字符，记录该帧 renderMarkdown 调用耗时；计时区间只含
//   renderMarkdown 调用本身，调用后每帧强制读回布局（void offsetHeight），但布局
//   不计入耗时。尾部窗口取最后 tailFrames 帧。
//
// 用法（需本机可导入 playwright，并指定 chromium 可执行文件）：
//   PLAYWRIGHT_PATH=<.../playwright/index.mjs> CHROMIUM_EXE=<.../chrome.exe> \
//   node stream-microbench.mjs --jsonl <会话 JSONL 路径> \
//     --baseline <c7cf8a5 的 public 目录> --current <当前工作树 public 目录> \
//     [--runs 3] [--chars 43645] [--chunk 600] [--tail 4]
//
// 说明：
//   - 只读会话 JSONL，样本文本仅在内存中传递，不落盘、不打印、不进入仓库。
//   - --baseline/--current 目录需含 markdown.js，且其同级有 vendor/{marked,purify}.js
//     （可从 node_modules 复制；server.js 的 /vendor 映射即指向这两个文件）。
//   - 本脚本只调用 renderMarkdown，不经过 stream-renderer 的节流；不要据此推断节流收益。

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};

const JSONL = arg('jsonl');
const BASELINE_DIR = arg('baseline');
const CURRENT_DIR = arg('current');
const RUNS = Number(arg('runs', 3));
const CHARS = Number(arg('chars', 43645));
const CHUNK = Number(arg('chunk', 600));
const TAIL = Number(arg('tail', 4));
const PW = process.env.PLAYWRIGHT_PATH || 'playwright';
const EXE = process.env.CHROMIUM_EXE;

if (!JSONL || !BASELINE_DIR || !CURRENT_DIR) {
  console.error('need --jsonl <path> --baseline <dir> --current <dir>');
  process.exit(1);
}

// 样本文本规则：按文件顺序拼接 assistant 的 text 片段，取前 CHARS 字符。
function extractSample(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  let acc = '';
  for (const l of lines) {
    const m = JSON.parse(l).message;
    if (!m || m.role !== 'assistant') continue;
    for (const part of [].concat(m.content || [])) if (part.type === 'text' && part.text) acc += part.text + '\n';
    if (acc.length >= CHARS) break;
  }
  return acc.slice(0, CHARS);
}

// 页面局部函数：BENCH 内不应引用外部变量（除入参）。
const BENCH = (sample) => {
  const rm = window.__rm;
  const stage = document.getElementById('stage');
  const el = document.createElement('div');
  stage.appendChild(el);
  const frames = [];
  const n = Math.ceil(sample.length / 600);
  for (let i = 0; i < n; i++) {
    const text = sample.slice(0, Math.min(sample.length, 600 * (i + 1)));
    const t0 = performance.now();
    rm(el, text);
    const t1 = performance.now();
    void el.offsetHeight; // 强制布局，计时区间之外，每帧执行
    const t2 = performance.now();
    frames.push({ chars: text.length, ms: +(t1 - t0).toFixed(2), layoutMs: +(t2 - t1).toFixed(2) });
  }
  const el2 = document.createElement('div');
  stage.appendChild(el2);
  const c0 = performance.now();
  rm(el2, sample);
  const c1 = performance.now();
  void el2.offsetHeight;
  return { frames, fullColdMs: +(c1 - c0).toFixed(2), fullColdNodes: el2.querySelectorAll('*').length };
};

function serveStatic() {
  const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.mjs': 'text/javascript' };
  const roots = { '/baseline/': BASELINE_DIR, '/current/': CURRENT_DIR };
  const srv = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/blank.html') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<!doctype html><html><body><div id="stage"></div></body></html>');
    }
    for (const [prefix, root] of Object.entries(roots)) {
      if (p.startsWith(prefix)) {
        const f = path.join(root, p.slice(prefix.length));
        if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
        res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
        return res.end(fs.readFileSync(f));
      }
    }
    res.writeHead(404);
    res.end('nf');
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

const hashFile = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

const sample = extractSample(JSONL);
const sampleHash = crypto.createHash('sha256').update(sample, 'utf8').digest('hex');
const srv = await serveStatic();
const base = `http://127.0.0.1:${srv.address().port}`;
const pwMod = await import(PW.startsWith('file:') || PW.includes(':') ? PW : `file:///${PW}`);
const { chromium } = pwMod.default || pwMod;
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
const ctx = await browser.newContext();

const out = {
  sample: { chars: sample.length, sha256: sampleHash, rule: `assistant text parts concatenated in file order, first ${CHARS} chars`, source: path.basename(path.dirname(JSONL)) + '/' + path.basename(JSONL) },
  versions: {
    baseline: { dir: BASELINE_DIR, markdownSha256: hashFile(path.join(BASELINE_DIR, 'markdown.js')) },
    current: { dir: CURRENT_DIR, markdownSha256: hashFile(path.join(CURRENT_DIR, 'markdown.js')) },
  },
  protocol: { chunkChars: CHUNK, tailFrames: TAIL, timed: 'renderMarkdown(element, cumulativeText) only', forcedLayout: 'void element.offsetHeight after timing, every frame', warmup: 'fresh page + fresh element per run', runs: RUNS },
  env: {},
  runs: [],
};

for (let i = 0; i < RUNS; i++) {
  for (const v of ['baseline', 'current']) {
    const page = await ctx.newPage();
    await page.goto(`${base}/blank.html`);
    await page.evaluate(async (v) => { window.__rm = (await import(`/${v}/markdown.js`)).renderMarkdown; }, v);
    if (i === 0) out.env = await page.evaluate(() => ({ ua: navigator.userAgent, hw: navigator.hardwareConcurrency, deviceMemory: navigator.deviceMemory ?? null, viewport: [innerWidth, innerHeight] }));
    out.runs.push({ version: v, run: i + 1, ...(await page.evaluate(BENCH, sample)) });
    await page.close();
  }
}

await browser.close();
srv.close();
console.log(JSON.stringify(out));
