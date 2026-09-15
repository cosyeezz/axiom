// 长会话渲染性能基线采集脚本（第 2 轮）
//
// 用法：
//   node measure.mjs <baseUrl> <longSessionId> <shortSessionId> [sampleJsonlPath]
// 示例：
//   node measure.mjs http://127.0.0.1:4410 55e7fce9-...-1042321ad701 eb6bc50b-...-b13193582293
//
// 依赖：playwright（本机若未安装，可用等价的 Playwright MCP 调用执行同一段页面代码）。
// 输出：stdout 打印 JSON，各场景键名与 docs/perf-long-conversation/*.json 对应。
//
// 说明：只对隔离副本实例发起只读请求，不写入任何会话数据。

import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://127.0.0.1:4410';
const LONG = process.argv[3];
const SHORT = process.argv[4];

if (!LONG || !SHORT) {
  console.error('need <baseUrl> <longSessionId> <shortSessionId>');
  process.exit(1);
}

// 页面级探针：长任务 + #output 子节点新增时间（首屏/切换渲染耗时）
const INIT = () => {
  window.__perf = { longTasks: [], first: null, last: null, count: 0 };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__perf.longTasks.push(Math.round(e.duration));
    }).observe({ entryTypes: ['longtask'] });
  } catch (e) {}
  document.addEventListener('DOMContentLoaded', () => {
    const out = document.getElementById('output');
    if (!out) return;
    new MutationObserver(() => {
      const t = performance.now();
      window.__perf.count++;
      if (window.__perf.first === null) window.__perf.first = t;
      window.__perf.last = t;
    }).observe(out, { childList: true });
  });
};

const SNAP = () => ({
  firstOutputMs: window.__perf.first === null ? null : Math.round(window.__perf.first),
  lastOutputMs: window.__perf.last === null ? null : Math.round(window.__perf.last),
  longTasksMs: window.__perf.longTasks,
  nodes: document.getElementsByTagName('*').length,
  outputChildren: document.getElementById('output').children.length,
  toolRecords: document.querySelectorAll('details.tool-record').length,
  callGroups: document.querySelectorAll('details.call-group').length,
  heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1),
  nav: (() => {
    const n = performance.getEntriesByType('navigation')[0];
    return n ? { responseEnd: Math.round(n.responseEnd), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) } : null;
  })(),
  resources: performance.getEntriesByType('resource').length,
});

const ready = (p) =>
  p.waitForFunction(() => document.querySelectorAll('details.tool-record').length > 300, { timeout: 30000 }).catch(() => {});

const browser = await chromium.launch();
const ctx = await browser.newContext();
const out = {};

// 1) 首屏：新页面打开长会话，重复 3 次
out.firstScreen = [];
for (let i = 0; i < 3; i++) {
  const p = await ctx.newPage();
  await p.addInitScript(INIT);
  const t0 = Date.now();
  await p.goto(`${BASE}/#session=${LONG}`, { waitUntil: 'load' });
  await ready(p);
  await p.waitForTimeout(1500);
  const r = await p.evaluate(SNAP);
  r.wallMs = Date.now() - t0;
  out.firstScreen.push(r);
  await p.close();
}

// 2) 切换：先开短会话，再点侧栏切到长会话
{
  const p = await ctx.newPage();
  await p.addInitScript(INIT);
  await p.goto(`${BASE}/#session=${SHORT}`, { waitUntil: 'load' });
  await p.waitForTimeout(2000);
  const before = await p.evaluate(SNAP);
  const t0 = Date.now();
  await p.click(`[data-session-id="${LONG}"] .session-item`);
  await ready(p);
  await p.waitForTimeout(1500);
  out.switch = { before, after: await p.evaluate(SNAP), clickToWallMs: Date.now() - t0 };
  await p.close();
}

// 3) 内存趋势：长短会话反复切换 3 轮
{
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1440, height: 900 });
  const trend = [];
  await p.goto(`${BASE}/#session=${SHORT}`, { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  for (let i = 0; i < 3; i++) {
    trend.push({ step: `short#${i + 1}`, ...(await p.evaluate(() => ({ heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), nodes: document.getElementsByTagName('*').length }))) });
    await p.click(`[data-session-id="${LONG}"] .session-item`);
    await ready(p);
    await p.waitForTimeout(1500);
    trend.push({ step: `long#${i + 1}`, ...(await p.evaluate(() => ({ heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), nodes: document.getElementsByTagName('*').length }))) });
    await p.click(`[data-session-id="${SHORT}"] .session-item`);
    await p.waitForTimeout(1200);
  }
  out.memoryTrend = trend;
  await p.close();
}

// 4) 滚动掉帧（idle 对照）+ 折叠成本
{
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto(`${BASE}/#session=${LONG}`, { waitUntil: 'load' });
  await ready(p);
  await p.waitForTimeout(2000);

  out.scroll = { geometry: await p.evaluate(() => { const t = document.getElementById('transcript'); return { clientHeight: t.clientHeight, scrollHeight: t.scrollHeight, range: t.scrollHeight - t.clientHeight }; }) };
  const measure = (mode) =>
    p.evaluate(async (mode) => {
      const el = document.getElementById('transcript');
      if (mode === 'scroll') el.scrollTop = 0;
      await new Promise((r) => requestAnimationFrame(r));
      const iv = [];
      let last = performance.now();
      for (let i = 0; i < 120; i++) {
        if (mode === 'scroll') el.scrollTop += 900;
        await new Promise((r) => requestAnimationFrame(() => { const n = performance.now(); iv.push(n - last); last = n; r(); }));
      }
      const s = [...iv].sort((a, b) => a - b);
      const pick = (q) => s[Math.min(s.length - 1, Math.floor(s.length * q))];
      return { avg: +(iv.reduce((a, b) => a + b, 0) / iv.length).toFixed(1), p50: +pick(0.5).toFixed(1), p95: +pick(0.95).toFixed(1), max: +s[s.length - 1].toFixed(1), over33: iv.filter((x) => x > 33.4).length };
    }, mode);
  out.scroll.idle = [await measure('idle'), await measure('idle')];
  out.scroll.scrolling = [await measure('scroll'), await measure('scroll')];

  out.fold = await p.evaluate(() => {
    const all = [...document.querySelectorAll('details.tool-record')];
    const sample = all.filter((d) => !d.open).slice(0, 10);
    const open = sample.map((d) => { const t = performance.now(); d.open = true; void d.offsetHeight; return +(performance.now() - t).toFixed(1); });
    const close = sample.map((d) => { const t = performance.now(); d.open = false; void d.offsetHeight; return +(performance.now() - t).toFixed(1); });
    const tAll = performance.now(); all.forEach((d) => { d.open = true; }); void document.body.offsetHeight;
    const openAllMs = +(performance.now() - tAll).toFixed(1);
    const nodesAfterOpenAll = document.getElementsByTagName('*').length;
    all.forEach((d) => { d.open = false; }); void document.body.offsetHeight;
    const cg = [...document.querySelectorAll('details.call-group')];
    const tCg = performance.now(); cg.forEach((d) => { d.open = true; }); void document.body.offsetHeight;
    return { toolRecordTotal: all.length, callGroupTotal: cg.length, singleOpenMs: open, singleCloseMs: close, openAllMs, nodesAfterOpenAll, openAllCallGroupsMs: +(performance.now() - tCg).toFixed(1) };
  });
  await p.close();
}

await browser.close();
console.log(JSON.stringify(out, null, 1));
