import { publicSource } from "./helpers/public-source.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { createStreamRenderer } from "../public/stream-renderer.js";
import { splitAnswer } from "../public/answer-tags.js";

// 页面集成用例：载入真实 index.html，剥离 app.js 的 import 行后注入真实 goal.js，
// 走 snapshot / event 两条真实入口，只断言 DOM 与 WS 载荷，不 mock 目标模式内部逻辑。
async function page() {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await publicSource("app");
  const dom = new JSDOM(html, { url: "http://localhost", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.splitAnswer = splitAnswer;
  w.matchMedia = () => ({ matches: false });
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const frames = new Map();
  let nextFrame = 0;
  w.requestAnimationFrame = (fn) => { frames.set(++nextFrame, fn); return nextFrame; };
  w.cancelAnimationFrame = (id) => frames.delete(id);
  w.renderMarkdown = (node, text) => { node.textContent = text ?? ""; };
  w.createMarkdownPageCache = () => ({ entries: new Map(), bytes: 0, stats: { hit: 0, miss: 0, store: 0, evict: 0 }, get: () => null, store: () => {} });
  w.stripMemoryTags = (text) => text;
  w.stripGoalMarkers = (text) => text;
  w.createStreamRenderer = (render, after) => createStreamRenderer(render, after, w.requestAnimationFrame, w.cancelAnimationFrame);
  // 记录实例，测试才能像服务端断开那样触发 onclose（走 app.js 真实断线路径）。
  w.WebSocket = class { static OPEN = 1; readyState = 1; constructor() { w.__ws = this; } send() {} close() {} };
  for (const name of ["model-picker", "model-auth", "model-manager"]) {
    const module = await readFile(new URL(`../public/${name}.js`, import.meta.url), "utf8");
    const exports = [...module.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
    w.eval(`Object.assign(window, (() => { ${module.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "")}\nreturn {${exports.join(",")}}; })());`);
  }
  const picker = (await readFile(new URL("../public/file-picker.js", import.meta.url), "utf8")).replace(/^export /gm, "");
  const question = (await readFile(new URL("../public/question.js", import.meta.url), "utf8")).replace(/^export /gm, "");
  // goal.js 与 question.js 一样按源码注入窗口作用域，使 document/SVG 命名空间指向 jsdom。
  const goal = (await readFile(new URL("../public/goal.js", import.meta.url), "utf8")).replace(/^export /gm, "");
  const service = (await readFile(new URL("../public/service-settings.js", import.meta.url), "utf8")).replace(/^export /gm, "");
  w.eval(`${picker}\n${question}\n${goal}\n${service}\n${source}\nconnected = true;`);
  const state = { sessionId: "goal-1", title: "Goal", cwd: "C:/work", status: "idle", config: { model: "test/model", thinking: "off", levels: ["off"], skills: [] }, messages: [], tasks: [], live: {}, tools: {} };
  const restore = (changes = {}) => w.snapshot({ ...state, ...changes });
  const emit = (type, data, agentId = "main") => w.event({ sessionId: state.sessionId, type, data, agentId });
  const paint = () => { const batch = [...frames.values()]; frames.clear(); batch.forEach((fn) => fn()); };
  const stub = (reply) => {
    w.eval(`window.__rpc = []; request = async (type, data = {}) => { window.__rpc.push([type, data]); return window.__reply ? window.__reply(type, data) : {}; };`);
    w.__reply = reply;
    return () => JSON.parse(JSON.stringify(w.__rpc));
  };
  restore();
  return { dom, w, emit, restore, paint, stub, output: w.document.getElementById("output") };
}
const $ = (w, id) => w.document.getElementById(id);
const labels = (w) => [...$(w, "goal-dock").querySelectorAll("button")].map((button) => button.textContent.trim());
const messages = (ids) => ids.map((id, index) => ({ agentId: "main", entryId: id, message: { role: index % 2 ? "assistant" : "user", content: `消息 ${index}` } }));

test("普通会话零影响：无 goal 时顶部条、底部控制、轮次标记全部不出现", async () => {
  const { dom, w, restore, output } = await page();
  try {
    restore({ messages: messages(["a", "b"]) });
    assert.equal($(w, "goal-track").hidden, true);
    assert.equal($(w, "goal-dock").hidden, true);
    assert.equal($(w, "goal-enter").hidden, false, "入口图标保留");
    assert.equal(output.querySelectorAll(".goal-round-head").length, 0);
    assert.equal(output.querySelectorAll("[data-goal-round]").length, 0);
    assert.equal(output.querySelectorAll(".message").length, 2, "消息渲染完全不受影响");
  } finally { dom.window.close(); }
});

test("snapshot.goal 渲染顶部进度与各阶段底部控制", async () => {
  const { dom, w, restore } = await page();
  try {
    restore({
      messages: messages(["a", "b", "c", "d"]),
      goal: {
        phase: "running", objective: "重构导出流程", constraints: ["不改公共 API"], acceptance: ["测试全绿", "体积不增"],
        rounds: [{ title: "梳理调用点", status: "done" }, { title: "落地改造", status: "active" }], currentRound: 1, progress: 0.5,
      },
    });
    assert.equal($(w, "goal-track").hidden, false);
    assert.equal($(w, "goal-dock").hidden, false);
    assert.match($(w, "goal-track").textContent, /重构导出流程/);
    assert.match($(w, "goal-track").textContent, /50%/);
    assert.match($(w, "goal-track").textContent, /第 2 \/ 2 轮/);
    assert.match($(w, "goal-track").textContent, /约束 1 · 验收 2/);
    assert.equal($(w, "goal-track").querySelectorAll(".goal-bar-seg").length, 2, "进度条按轮分格");
    assert.deepEqual(labels(w), ["调整 Goal", "暂停", "重启 Goal", "先暂停再退出"]);
    assert.equal($(w, "goal-enter").hidden, true, "进入目标模式后入口隐藏");
    assert.equal($(w, "goal-track").querySelector(".goal-gauge").dataset.state, "running");
  } finally { dom.window.close(); }
});

test("goal 事件兼容 data.goal 与顶层 goal，且忽略其它会话", async () => {
  const { dom, w, emit } = await page();
  try {
    const goal = { phase: "clarifying", objective: "澄清中", rounds: [], constraints: [], acceptance: [] };
    emit("goal", { goal });
    assert.equal($(w, "goal-track").hidden, false);
    assert.match($(w, "goal-track").textContent, /目标澄清/);
    w.event({ sessionId: "other", type: "goal", data: { goal: { phase: "completed", objective: "别人的目标" } } });
    assert.equal($(w, "goal-track").querySelector(".goal-objective").textContent, "澄清中", "其它会话的 goal 不落地");
    w.event({ sessionId: "goal-1", type: "goal", goal: { phase: "completed", objective: "改完了" } });
    assert.equal($(w, "goal-track").querySelector(".goal-objective").textContent, "改完了");
    assert.equal($(w, "goal-track").querySelector(".goal-gauge").dataset.state, "completed");
    assert.match($(w, "goal-track").textContent, /100%/);
    assert.deepEqual(labels(w), ["查看总结", "重新开始", "退出目标模式"]);
  } finally { dom.window.close(); }
});

test("goal.action 载荷：暂停只发 goal.action，绝不发 cancel 或 prompt", async () => {
  const { dom, w, emit, stub } = await page();
  try {
    const calls = stub(() => ({}));
    emit("goal", { goal: { phase: "running", objective: "跑起来", rounds: [{ title: "一轮", status: "active" }], currentRound: 0 } });
    // 暂停语义：等到当前工具批次、子任务的安全收尾点，不是等整轮结束。
    const pause = [...$(w, "goal-dock").querySelectorAll("button")].find((button) => button.textContent.includes("暂停"));
    assert.match(pause.title, /工具|子任务/);
    pause.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(calls(), [["goal.action", { sessionId: "goal-1", action: "pause" }]]);
    assert.ok(!calls().some(([type]) => type === "cancel" || type === "prompt"));
    emit("goal", { goal: { phase: "paused", objective: "跑起来", rounds: [{ title: "一轮", status: "paused" }] } });
    [...$(w, "goal-dock").querySelectorAll("button")].find((button) => button.textContent.includes("继续")).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(calls().at(-1), ["goal.action", { sessionId: "goal-1", action: "resume" }]);
  } finally { dom.window.close(); }
});

test("调整 Goal：专用对话框改整体目标，不碰普通输入框草稿", async () => {
  const { dom, w, emit, stub } = await page();
  try {
    const calls = stub((type, data) => data.action === "adjust" ? { goal: { phase: "adjusting", objective: "跑起来" } } : {});
    emit("goal", { goal: { phase: "running", objective: "跑起来" } });
    const adjust = () => [...$(w, "goal-dock").querySelectorAll("button")].find((button) => button.textContent.includes("调整 Goal"));
    assert.ok(adjust(), "按钮叫「调整 Goal」，不叫「调整本轮」");
    $(w, "prompt").value = "本轮先别动导出模块";
    adjust().click();
    const dialog = $(w, "goal-adjust"), textarea = $(w, "goal-adjust-text");
    assert.equal(dialog.open, true, "打开原生对话框");
    assert.equal(dialog.getAttribute("aria-labelledby"), "goal-adjust-title", "有可访问名称");
    assert.equal(w.document.activeElement, textarea, "焦点进入专用输入框");
    assert.equal($(w, "prompt").value, "本轮先别动导出模块", "普通输入框草稿不受影响");
    assert.deepEqual(calls(), [], "仅打开对话框不发请求");
    $(w, "goal-adjust-submit").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(calls(), [], "空内容不发请求");
    assert.equal(dialog.open, true, "空内容保持对话框打开");
    assert.equal($(w, "goal-adjust-alert").hidden, false, "给出提示");
    textarea.value = "验收标准要加上体积对比";
    $(w, "goal-adjust-submit").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(calls(), [["goal.action", { sessionId: "goal-1", action: "adjust", text: "验收标准要加上体积对比" }]]);
    assert.equal(dialog.open, false, "提交成功后关闭");
    assert.equal(textarea.value, "", "专用输入框已清空");
    assert.equal($(w, "prompt").value, "本轮先别动导出模块", "普通草稿全程未被动过");
    assert.match($(w, "goal-dock").textContent, /应用调整|调整/);
  } finally { dom.window.close(); }
});

test("动作回执 {goal} 立即落地，随后同名 goal 事件幂等", async () => {
  const { dom, w, emit, stub } = await page();
  try {
    const calls = stub(() => ({ goal: { phase: "ready", objective: "先看计划", constraints: ["只改 public"], acceptance: ["无回归"] } }));
    emit("goal", { goal: { phase: "clarifying", objective: "先看计划" } });
    $(w, "goal-enter").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.match($(w, "goal-dock").textContent, /待确认/);
    assert.deepEqual(labels(w), ["确认计划", "重新澄清", "退出目标模式"]);
    assert.deepEqual(calls().map(([type, data]) => [type, data.action]), [["goal.action", "enter"]], "进入目标的请求已发出");
    [...$(w, "goal-dock").querySelectorAll("button")].find((b) => b.textContent.includes("确认计划")).click();
    assert.equal($(w, "goal-plan").open, true, "打开计划确认卡");
    assert.match($(w, "goal-plan-constraints").textContent, /只改 public/);
    assert.match($(w, "goal-plan-acceptance").textContent, /无回归/);
    assert.equal($(w, "goal-plan-confirm").hidden, false);
    stub(() => ({ goal: { phase: "running", objective: "先看计划" } }));
    $(w, "goal-plan-confirm").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.match($(w, "goal-dock").textContent, /执行中/);
  } finally { dom.window.close(); }
});

test("/goal 交给后端识别：composer 原样提交 prompt，前端不拦截", async () => {
  const { dom, w, stub } = await page();
  try {
    const calls = stub(() => ({}));
    $(w, "prompt").value = "/goal 把导出流程重构完";
    await $(w, "composer").onsubmit({ preventDefault() {}, submitter: null });
    const sent = calls().filter(([type]) => type === "prompt");
    assert.equal(sent.length, 1, "只发一次 prompt，未被拦截改造");
    assert.equal(sent[0][1].text, "/goal 把导出流程重构完");
    await new Promise((resolve) => setTimeout(resolve, 50)); // 等发送后的刷新链收尾，再销毁 document
  } finally { dom.window.close(); }
});

test("消息按轮次分组且可折叠，消息节点只加标记不被复制", async () => {
  const { dom, w, restore, output } = await page();
  try {
    restore({
      messages: messages(["a", "b", "c", "d"]),
      goal: {
        phase: "running", objective: "四步走",
        rounds: [
          { title: "第一步", status: "done", startMessage: 0, endMessage: 1 },
          { title: "第二步", status: "active", startMessage: 2, endMessage: 3 },
        ],
        currentRound: 1, progress: 0.5,
      },
    });
    const heads = [...output.querySelectorAll(".goal-round-head")];
    assert.equal(heads.length, 2);
    assert.deepEqual(heads.map((head) => head.dataset.round), ["0", "1"]);
    assert.match(heads[0].textContent, /01.*第一步.*已完成.*展开/s);
    assert.deepEqual([...output.querySelectorAll("[data-goal-round]")].map((node) => node.dataset.goalRound).sort(), ["0", "0", "1", "1"]);
    assert.equal(output.querySelectorAll(".message").length, 4, "消息节点数量不变");
    assert.equal(output.querySelectorAll(".goal-folded").length, 2, "已完成的轮默认折叠");
    assert.equal(heads[1].dataset.collapsed, "false", "当前轮不折叠");
    heads[0].querySelector(".goal-round-toggle").click();
    assert.equal(output.querySelectorAll(".goal-folded").length, 0, "手动展开覆盖默认折叠");
    assert.equal(heads[0].dataset.collapsed, "false");
    heads[0].querySelector(".goal-round-toggle").click();
    assert.equal(output.querySelectorAll(".goal-folded").length, 2);
  } finally { dom.window.close(); }
});

test("startMessage/endMessage 用 entryId 也能定位轮次", async () => {
  const { dom, w, restore, output } = await page();
  try {
    restore({
      messages: messages(["a", "b", "c", "d"]),
      goal: { phase: "running", objective: "按 entryId", rounds: [{ title: "第一段", status: "done", startMessage: "a", endMessage: "b" }, { title: "第二段", status: "active", startMessage: "c", endMessage: "d" }], currentRound: 1 },
    });
    assert.deepEqual([...output.querySelectorAll(".goal-round-head")].map((head) => head.textContent.match(/第.段|一段|二段/)?.[0]), ["第一段", "第二段"]);
    assert.deepEqual([...output.querySelectorAll("[data-goal-round]")].map((node) => node.dataset.goalRound).sort(), ["0", "0", "1", "1"]);
  } finally { dom.window.close(); }
});

test("首屏折叠已完成轮：app 在 rAF 里重排出的 call-group 摘要不残留可见", async () => {
  const { dom, w, restore, paint, output } = await page();
  try {
    restore({
      messages: [
        { agentId: "main", entryId: "t1", message: { role: "assistant", content: [{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "src/a.js" } }] } },
        { agentId: "main", entryId: "t2", message: { role: "assistant", content: [{ type: "text", text: "本轮回答" }] } },
      ],
      goal: {
        phase: "running", objective: "两轮走",
        rounds: [
          { title: "已完成轮", status: "done", startMessage: "t1", endMessage: "t1" },
          { title: "当前轮", status: "active", startMessage: "t2", endMessage: "t2" },
        ],
        currentRound: 1, progress: 0.5,
      },
    });
    // 触发点：首屏 renderRounds 之后，app.js 的 refreshCallGroups 才在 rAF 里把过程包进 call-group。
    paint();
    await Promise.resolve(); // MutationObserver 在重排落地后的微任务里对齐折叠
    paint();
    const group = output.querySelector(':scope > .call-group');
    assert.ok(group, "过程消息被 app.js 重排进 call-group");
    assert.equal(group.querySelector("[data-goal-round]")?.dataset.goalRound, "0");
    assert.ok(group.classList.contains("goal-folded"), "已完成轮的分组摘要随轮次折叠，不残留可见");
    assert.equal(output.querySelectorAll(':scope > .call-group:not(.goal-folded)').length, 0, "首屏不许有展开的分组残留");
    assert.equal(output.querySelectorAll(".goal-round-head").length, 2, "轮次标记仍在");
  } finally { dom.window.close(); }
});

test("新消息到达后锚点重算，轮次标记跟随增长", async () => {
  const { dom, w, emit, stub } = await page();
  try {
    stub(() => ({}));
    emit("goal", { goal: { phase: "running", objective: "长跑", rounds: [{ title: "本轮", status: "active", startMessage: 0, endMessage: 1 }], currentRound: 0 } });
    emit("agent.message.end", { message: { role: "user", content: "第一句" }, entryId: "e1" });
    emit("agent.message.end", { message: { role: "assistant", content: [{ type: "text", text: "回一" }] }, entryId: "e2" });
    const marked = () => [...$(w, "output").querySelectorAll("[data-goal-round]")];
    assert.equal(marked().length, 2);
    assert.equal($(w, "output").querySelectorAll(".goal-round-head").length, 1);
  } finally { dom.window.close(); }
});

test("断线后目标控制不可点，且不改变普通发送能力", async () => {
  const { dom, w, restore } = await page();
  try {
    restore({ goal: { phase: "running", objective: "跑" }, messages: messages(["a"]) });
    assert.equal($(w, "goal-dock").querySelector("button").disabled, false);
    w.__ws.onclose(); // 服务端断开
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(w.document.getElementById("status").dataset.connected, "false");
    assert.ok([...$(w, "goal-dock").querySelectorAll("button")].every((button) => button.disabled));
    assert.ok($(w, "send").disabled);
  } finally { dom.window.close(); }
});

test("已暂停时展示真实暂停原因（预算/阻塞/重启恢复）", async () => {
  const { dom, w, restore } = await page();
  try {
    const at = Date.UTC(2026, 1, 3, 6, 30);
    restore({
      messages: messages(["a"]),
      goal: { phase: "paused", objective: "重构导出流程", rounds: [{ title: "一轮", status: "paused" }], failure: { reason: "自动执行段数达到上限 12", at } },
    });
    const dock = $(w, "goal-dock");
    assert.match(dock.textContent, /暂停原因：自动执行段数达到上限 12/, "说清为什么停了");
    assert.equal(dock.querySelector(".goal-dock-hint").dataset.alert, "true", "按告警色提示");
    assert.match(dock.querySelector(".goal-dock-hint").title, /2026|2026\/|年/, "悬停能看到暂停时间");
    assert.equal(dock.querySelector(".goal-dock-phase").dataset.tone, "warn");
    assert.deepEqual(labels(w), ["继续", "调整 Goal", "重启 Goal", "退出目标模式"]);
    $(w, "goal-track").querySelector(".goal-plan-open").click();
    assert.equal($(w, "goal-plan").open, true);
    assert.match($(w, "goal-plan-meta").textContent, /暂停原因：自动执行段数达到上限 12/);
    // 没有原因时不编造文案
    restore({ messages: messages(["a"]), goal: { phase: "paused", objective: "重构导出流程", failure: null } });
    assert.doesNotMatch(dock.textContent, /暂停原因/);
    assert.equal(dock.querySelector(".goal-dock-phase").dataset.tone, "muted");
  } finally { dom.window.close(); }
});

test("当前会话被删除时目标控制不可点", async () => {
  const { dom, w, restore, emit } = await page();
  try {
    restore({ goal: { phase: "running", objective: "跑" }, messages: messages(["a"]) });
    assert.equal($(w, "goal-dock").querySelector("button").disabled, false);
    emit("session.deleted", {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok([...$(w, "goal-dock").querySelectorAll("button")].every((button) => button.disabled));
  } finally { dom.window.close(); }
});

test("每个阶段都有退出入口；执行中/验收中先暂停，暂停落地后才发 exit", async () => {
  const { dom, w, restore, emit, stub } = await page();
  try {
    const calls = stub(() => ({}));
    const exit = () => [...$(w, "goal-dock").querySelectorAll("button")].find((button) => button.textContent.includes("退出"));
    // 空闲阶段直接 exit：后端只在没有在飞工作的空闲点接受退出。
    for (const phase of ["clarifying", "ready", "completed"]) {
      restore({ goal: { phase, objective: "整" } });
      assert.ok(exit(), `${phase} 也有退出入口`);
      exit().click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepEqual(calls().at(-1), ["goal.action", { sessionId: "goal-1", action: "exit" }], `${phase} 直接发 exit`);
    }
    // 有在飞工作的阶段：退出入口不可点。
    for (const phase of ["pausing", "adjusting"]) {
      restore({ goal: { phase, objective: "整" } });
      assert.equal(exit().disabled, true, `${phase} 有在飞工作，退出不可点`);
    }
    // 执行中/验收中：先暂停，等 paused 落地后再点一次才退出。
    for (const phase of ["running", "verifying"]) {
      restore({ goal: { phase, objective: "整" } });
      const button = exit();
      assert.equal(button.textContent, "先暂停再退出", `${phase} 用「先暂停再退出」说清顺序`);
      assert.match(button.title, /先暂停再退出/);
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepEqual(calls().at(-1), ["goal.action", { sessionId: "goal-1", action: "pause" }], `${phase} 不在运行中直接 exit`);
      emit("goal", { goal: { phase: "paused", objective: "整" } });
      assert.equal(exit().textContent, "退出目标模式", "暂停落地后按钮变回退出");
      exit().click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepEqual(calls().at(-1), ["goal.action", { sessionId: "goal-1", action: "exit" }]);
    }
  } finally { dom.window.close(); }
});

test("退出回执按 hasOwn 处理：goal:null 清空 UI，缺字段不动，切走会话后回执作废", async () => {
  const { dom, w, restore, stub, output } = await page();
  try {
    let release;
    stub((type, data) => data.action === "exit" ? new Promise((resolve) => { release = resolve; }) : {});
    const exit = () => [...$(w, "goal-dock").querySelectorAll("button")].find((button) => button.textContent.includes("退出"));
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
    restore({
      messages: messages(["a", "b"]),
      goal: { phase: "paused", objective: "整", rounds: [{ title: "一轮", status: "paused", startMessage: 0, endMessage: 1 }] },
    });
    // 回执缺 goal 字段：不动现有目标（不能把 undefined 当成“已退出”）。
    exit().click();
    await settle();
    release({});
    await settle();
    assert.equal($(w, "goal-track").hidden, false, "缺字段的回执不误清目标");
    assert.equal($(w, "goal-dock").hidden, false);
    // 显式 goal:null：清空目标 UI，入口图标回来，轮次标记与折叠一起收走。
    assert.equal(output.querySelectorAll(".goal-round-head").length, 1);
    exit().click();
    await settle();
    release({ goal: null });
    await settle();
    assert.equal($(w, "goal-track").hidden, true);
    assert.equal($(w, "goal-dock").hidden, true);
    assert.equal($(w, "goal-enter").hidden, false);
    assert.equal(output.querySelectorAll(".goal-round-head").length, 0);
    assert.equal(output.querySelectorAll("[data-goal-round]").length, 0);
    // 回执在途时会话切走：整条回执作废，不污染新会话。
    restore({ goal: { phase: "paused", objective: "整" } });
    exit().click();
    await settle();
    restore({ sessionId: "goal-2", goal: { phase: "running", objective: "别人的目标" } });
    release({ goal: null });
    await settle();
    assert.equal($(w, "goal-track").querySelector(".goal-objective").textContent, "别人的目标", "旧的退出回执不落到另一个会话");
    assert.equal($(w, "goal-dock").hidden, false);
  } finally { dom.window.close(); }
});

test("切到没有目标的会话：snapshot.goal=null 清空面板，不继承上一个 Goal，也不自动进入", async () => {
  const { dom, w, restore, stub, output } = await page();
  try {
    const calls = stub(() => ({}));
    restore({
      messages: messages(["a", "b"]),
      goal: {
        phase: "running", objective: "上一个会话的目标", rounds: [{ title: "一轮", status: "active", startMessage: 0, endMessage: 1 }], currentRound: 0,
      },
    });
    assert.equal($(w, "goal-track").hidden, false);
    assert.equal($(w, "goal-dock").hidden, false);
    assert.equal($(w, "goal-enter").hidden, true, "有目标时入口隐藏");
    assert.equal(output.querySelectorAll(".goal-round-head").length, 1);
    // 新会话的 snapshot 顶层 goal 是 null：必须清空，默认停在普通模式。
    restore({ sessionId: "goal-new", title: "新会话", messages: [], goal: null });
    assert.equal($(w, "goal-track").hidden, true, "顶部目标条清空");
    assert.equal($(w, "goal-dock").hidden, true, "底部目标控制清空");
    assert.equal($(w, "goal-enter").hidden, false, "普通模式入口回来");
    assert.equal($(w, "goal-enter").disabled, false, "入口可用，但不自动点");
    assert.equal(output.querySelectorAll(".goal-round-head").length, 0, "上一会话的轮次标记不残留");
    assert.equal(output.querySelectorAll("[data-goal-round]").length, 0);
    assert.equal(w.document.querySelector(".goal-dock").textContent, "", "不残留上一会话的目标文案");
    assert.ok(!calls().some(([type]) => type === "goal.action"), "切换会话不会自动进入目标模式");
  } finally { dom.window.close(); }
});
