import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import createPurify from "dompurify";
import { createStreamRenderer } from "../public/stream-renderer.js";
import { canResume, dropFailedAssistant } from "../src/retry.js";
import { Sessions } from "../src/sessions.js";

const session = (...messages) => ({ agent: { state: { messages } } });
const assistant = (stopReason) => ({ role: "assistant", content: [{ type: "text", text: "答" }], ...(stopReason ? { stopReason } : {}) });

test("canResume only accepts positive evidence of an abnormal stop", () => {
  assert.equal(canResume(session()), false, "空会话没有可续的东西");
  assert.equal(canResume(session({ role: "user", content: "hi" }, assistant("stop"))), false, "正常收尾不给重试");
  assert.equal(canResume(session(assistant())), false, "缺 stopReason 时宁可漏不可误");
  for (const reason of ["error", "aborted", "length", "toolUse"])
    assert.equal(canResume(session(assistant(reason))), true, `${reason} 可续`);
  // 半截轮次：请求发出后没等到助手消息，或工具结果已回但没接着跑。
  assert.equal(canResume(session({ role: "user", content: "hi" })), true);
  assert.equal(canResume(session(assistant("toolUse"), { role: "toolResult", content: [] })), true);
});

test("dropFailedAssistant removes only a trailing assistant message", () => {
  const failed = session({ role: "user", content: "hi" }, assistant("error"));
  dropFailedAssistant(failed);
  assert.deepEqual(failed.agent.state.messages.map((m) => m.role), ["user"]);
  // 末尾是 user/toolResult 的半截轮次：空操作，continue() 直接接着跑。
  const halfway = session({ role: "user", content: "hi" }, assistant("toolUse"), { role: "toolResult", content: [] });
  dropFailedAssistant(halfway);
  assert.deepEqual(halfway.agent.state.messages.map((m) => m.role), ["user", "assistant", "toolResult"]);
  const empty = session();
  dropFailedAssistant(empty);
  assert.deepEqual(empty.agent.state.messages, []);
});

// 手动重试的服务端骨架：可续判定在启动前同步做完，重试与 prompt 共用 startRun 的广播/收尾。
test("sessions.retry resumes without new input, reuses the run skeleton, and guards unresumable states", async () => {
  let resumable = true, resumes = 0, prompts = 0, finish, thrown;
  const agent = {
    subscribe: () => () => {},
    prompt: async () => { prompts++; return new Promise((r) => { finish = r; }); },
    resumable: () => resumable,
    resume: async () => { resumes++; return new Promise((r) => { finish = r; }); },
    result: () => { if (thrown) throw thrown; },
    abort: async () => finish?.(),
    dispose: async () => {},
  };
  const sessions = new Sessions(async () => agent);
  const id = await sessions.create(process.cwd());
  const item = sessions.get(id);
  const states = [];
  item.emit = (event) => { if (event.type === "session.state") states.push(event.data.status); if (event.type === "error") states.push(`error:${event.data.message}`); };

  const runId = await sessions.retry(id);
  assert.equal(resumes, 1);
  assert.equal(prompts, 0, "重试不重发用户输入");
  assert.equal(item.status, "running");
  assert.equal(item.runId, runId, "回执带 runId，前端靠它把卡片收走");
  finish();
  await item.work;
  assert.deepEqual(states, ["running", "idle"], "收尾复位 idle，不留空转");

  // 忙碌与不可续都在启动前拒绝：状态不动，不产生新的 running → idle。
  states.length = 0;
  resumable = false;
  await assert.rejects(sessions.retry(id), /没有可重试的请求/);
  resumable = true;
  item.status = "running";
  await assert.rejects(sessions.retry(id), /Session is busy/);
  item.status = "idle";
  item.closing = true;
  await assert.rejects(sessions.retry(id), /Session is busy/);
  item.closing = false;
  assert.deepEqual(states, [], "被拒的重试不广播任何状态");
  assert.equal(resumes, 1);

  // 续跑再失败：错误照常经 result() 传播，会话仍回到 idle 且还能再点。
  thrown = new Error("续跑又挂了");
  await sessions.retry(id);
  finish();
  await item.work;
  assert.deepEqual(states, ["running", "error:续跑又挂了", "idle"]);
  await sessions.close();
});

test("session.retry is a strict protocol command dispatched to sessions.retry", async () => {
  const { command } = await import("../src/protocol.js");
  assert.equal(command.safeParse({ id: "1", type: "session.retry", sessionId: "s1" }).success, true);
  assert.equal(command.safeParse({ id: "1", type: "session.retry" }).success, false, "sessionId 必填");
  assert.equal(command.safeParse({ id: "1", type: "session.retry", sessionId: "s1", text: "x" }).success, false, "strict：不吃多余字段");
  const source = await readFile(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(source, /case "session\.retry":\s*\n?\s*data = \{ runId: await sessions\.retry\(request\.sessionId\) \};/);
});

// 前端：真实页面的快照/事件处理器，不连服务端。
async function page() {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const memoryTags = (await readFile(new URL("../public/memory-tags.js", import.meta.url), "utf8")).replace(/^export /gm, "");
  const source = memoryTags + "\n" + (await readFile(new URL("../public/question.js", import.meta.url), "utf8")).replace(/^export /gm, "") + "\n" + (await readFile(new URL("../public/service-settings.js", import.meta.url), "utf8")).replace(/^export /gm, "") + "\n" + (await readFile(new URL("../public/app.js", import.meta.url), "utf8")).replace(/^import .*;\r?\n/gm, "");
  const picker = (await readFile(new URL("../public/file-picker.js", import.meta.url), "utf8")).replace(/^export /gm, "");
  const dom = new JSDOM(html, { url: "http://localhost", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false });
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const frames = new Map();
  let nextFrame = 0;
  w.requestAnimationFrame = (fn) => { frames.set(++nextFrame, fn); return nextFrame; };
  w.cancelAnimationFrame = (id) => frames.delete(id);
  const markdown = (await readFile(new URL("../public/markdown.js", import.meta.url), "utf8"))
    .replace(/^import .*;\r?\n/gm, "").replace("export function", "function");
  w.renderMarkdown = new Function("marked", "DOMPurify", `${markdown}; return renderMarkdown;`)(marked, createPurify(w));
  w.createStreamRenderer = (render, after) => createStreamRenderer(render, after, w.requestAnimationFrame, w.cancelAnimationFrame);
  const sent = [];
  w.WebSocket = class { static OPEN = 1; readyState = 1; send(raw) { sent.push(JSON.parse(raw)); } };
  for (const name of ["model-picker", "model-auth", "model-manager"]) {
    const module = await readFile(new URL(`../public/${name}.js`, import.meta.url), "utf8");
    const exports = [...module.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
    w.eval(`Object.assign(window, (() => { ${module.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "")}\nreturn {${exports.join(",")}}; })());`);
  }
  w.eval(`${picker}\n${source}\nconnected = true; socket = new WebSocket();`);
  const base = { sessionId: "retry", title: "Retry", cwd: "C:/work", status: "idle", config: { model: "test/model", thinking: "off", levels: ["off"], skills: [] }, messages: [], tasks: [], live: {}, tools: {} };
  const restore = (changes = {}) => w.snapshot({ ...base, ...changes });
  const emit = (type, data, agentId = "main") => w.event({ sessionId: base.sessionId, type, data, agentId });
  const paint = () => { const batch = [...frames.values()]; frames.clear(); batch.forEach((fn) => fn()); };
  restore();
  return { dom, w, emit, restore, paint, sent, output: w.document.getElementById("output") };
}

const message = (role, stopReason) => ({ role, content: [{ type: "text", text: "内容" }], ...(stopReason ? { stopReason } : {}) });
const prompt = (output) => output.querySelector(".retry-prompt");

test("retry prompt sits at the end of the stream only when an interrupted main turn can be resumed", async () => {
  const { dom, emit, restore, paint, sent, output } = await page();
  try {
    assert.equal(prompt(output), null, "空会话不显示");

    // Esc 停止（最常见）：aborted 且 attempt=0，没有 retry-card，只有这个入口。
    emit("agent.message.end", { message: message("assistant", "aborted"), entryId: "m1" });
    emit("session.state", { status: "idle", runId: "r1" });
    paint();
    assert.ok(prompt(output), "异常停止后出现");
    assert.equal(output.lastElementChild, prompt(output), "贴在会话流末尾");
    assert.equal(output.querySelector(".retry-card"), null);

    // 点击走 session.retry，不重发输入。
    prompt(output).querySelector("button").click();
    const request = sent.at(-1);
    assert.equal(request.type, "session.retry");
    assert.equal(request.sessionId, "retry");
    assert.equal(Object.keys(request).sort().join(), "id,sessionId,type");

    // 服务端转 running → 卡片收走；再正常收尾 → 不回来。
    emit("session.state", { status: "running", runId: "r2" });
    paint();
    assert.equal(prompt(output), null, "运行中不显示");
    emit("agent.message.end", { message: message("assistant", "stop"), entryId: "m2" });
    emit("session.state", { status: "idle", runId: "r2" });
    paint();
    assert.equal(prompt(output), null, "正常收尾不显示");

    // 子代理的中断不挂主流。
    emit("agent.message.end", { message: message("assistant", "error"), entryId: "c1" }, "child");
    emit("session.state", { status: "idle", runId: "r2" });
    paint();
    assert.equal(prompt(output), null, "子代理不挂主流");

    // 刷新恢复：按末尾 main 消息判定，中断在工具轮（末尾 toolResult）也算可续。
    restore({ messages: [
      { message: message("user"), entryId: "h1", agentId: "main" },
      { message: message("assistant", "error"), entryId: "h2", agentId: "child" },
      { message: { role: "toolResult", content: [] }, entryId: "h3", agentId: "main" },
    ] });
    paint();
    assert.ok(prompt(output), "恢复后仍在末尾");
    assert.equal(output.lastElementChild, prompt(output));
    assert.equal(prompt(output).querySelector("button").disabled, false, "恢复后按钮可点");

    restore({ status: "running", messages: [{ message: message("assistant", "error"), entryId: "h2", agentId: "main" }] });
    paint();
    assert.equal(prompt(output), null, "恢复时仍在跑就不显示");
  } finally { dom.window.close(); }
});
