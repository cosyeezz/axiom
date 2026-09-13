// 独立 UI 检查：用真实 Chrome（CDP）验证子代理 task-dialog 内 sticky 已禁用、主输出仍 sticky。
// 运行：node tests/ui-sticky-check.mjs   （需要系统装有 Chrome 或 Edge）
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import WebSocket from 'ws';

const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const browser = candidates.find(p => p && existsSync(p)) ?? (() => { throw new Error('未找到 Chrome/Edge，请设置 CHROME_PATH'); })();

const port = Number(process.env.CDP_PORT || 9337);
const profile = mkdtempSync(join(tmpdir(), 'axiom-ui-check-'));
const proc = spawn(browser, [
  '--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    target = list.find(t => t.type === 'page');
  } catch { await sleep(200); }
}
if (!target) { console.error('FAIL: 浏览器调试端口未就绪'); proc.kill(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise(r => ws.on('open', r));
let seq = 0;
const pending = new Map();
ws.on('message', data => {
  const msg = JSON.parse(data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
const send = (method, params = {}) => new Promise(r => {
  const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params }));
});
const waitEvent = method => new Promise(r => {
  const listener = data => { const msg = JSON.parse(data); if (msg.method === method) { ws.off('message', listener); r(msg); } };
  ws.on('message', listener);
});

await send('Page.enable');
const loaded = waitEvent('Page.loadEventFired');
await send('Page.navigate', { url: pathToFileURL(join(here, 'ui-sticky-check.html')).href });
await loaded;
await sleep(300);

const expression = `(() => {
  const $ = id => document.getElementById(id);
  const pos = el => getComputedStyle(el.firstElementChild).position;
  const bg = el => getComputedStyle(el.firstElementChild).backgroundColor;
  const body = $('dialog-body');
  body.scrollTop = 0;
  const bars = ['dialog-call-group', 'dialog-thinking'].map(id => $(id).firstElementChild);
  const before = bars.map(el => el.getBoundingClientRect().top);
  body.scrollTop = 180;
  const moved = bars.every((el, i) => Math.abs(before[i] - el.getBoundingClientRect().top - body.scrollTop) < 1);
  return [
    ['dialog 状态行随正文滚走而非覆盖正文', body.scrollTop > 0 && moved, true],
    ['dialog call-group summary 不再 sticky', pos($('dialog-call-group')), 'static'],
    ['dialog thinking-record summary 不再 sticky', pos($('dialog-thinking')), 'static'],
    ['dialog tool-record summary 不再 sticky', pos($('dialog-tool')), 'static'],
    ['dialog task-system-prompt summary 不再 sticky', pos($('dialog-sysprompt')), 'static'],
    ['dialog Working 条无黑底', bg($('dialog-call-group')), 'rgba(0, 0, 0, 0)'],
    ['主输出 call-group summary 保持 sticky', pos($('main-call-group')), 'sticky'],
    ['主输出 thinking-record summary 保持 sticky', pos($('main-thinking')), 'sticky'],
  ];
})()`;
const result = await send('Runtime.evaluate', { expression, returnByValue: true });
const checks = result.result?.result?.value ?? [];

// 截图留证（写系统临时目录，不入库）
const shotPath = join(tmpdir(), 'axiom-ui-sticky-check.png');
const shot = await send('Page.captureScreenshot', { format: 'png' });
if (shot.result?.data) {
  writeFileSync(shotPath, Buffer.from(shot.result.data, 'base64'));
  console.log(`截图: ${shotPath}`);
}

ws.close(); proc.kill();
await sleep(500);
try { rmSync(profile, { recursive: true, force: true }); } catch {} // ponytail: Chrome 可能仍占用目录，清理失败无妨

let ok = true;
for (const [name, got, want] of checks) {
  const pass = got === want;
  ok &&= pass;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  (got: ${got}, want: ${want})`);
}
if (!checks.length) { console.error('FAIL: 未能从页面取得检查结果'); ok = false; }
console.log(ok ? 'ALL PASS' : 'HAS FAIL');
process.exit(ok ? 0 : 1);
