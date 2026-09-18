import test from "node:test";
import assert from "node:assert/strict";
import { bootSessionPage, until, settle, sessionState, makeRecords } from "./helpers/session-page.js";

// 分页删除后的切换语义：attach 在飞的响应必须按 token/会话/实例作废，
// 过期快照不作画、不夺屏、不推进水位；后台标签页对消息区零 DOM 变更。
const messageEvent = (text, seq, sessionId = "long") => ({
  sessionId, type: "agent.message.end", agentId: "main",
  ...(seq === undefined ? {} : { seq }),
  data: { message: { role: "user", content: text }, entryId: `q-${text}` },
});

async function login(page) {
  page.open();
  await until(() => page.app.connected(), "登录恢复完成");
  return page;
}

// 只扣重取（第二次以后）的 attach，首屏正常完成。
const holdReattach = (req, requests) =>
  req.type === "session.attach" && requests.filter((r) => r.type === "session.attach").length > 1;

test("整份重取在飞时切换会话：旧快照作废，不夺屏也不污染新会话", async (t) => {
  const page = bootSessionPage({ hold: holdReattach });
  t.after(page.close);
  const { app, $ } = page;
  await login(page);
  void app.reattach();
  await until(() => page.held() === 1, "重取在飞");

  await app.snapshot(sessionState("b", { messages: makeRecords(4, "B-MSG"), seq: 6 }));
  assert.equal(app.session(), "b");
  assert.match($("output").textContent, /B-MSG0/);

  page.release();
  await settle();
  await settle();
  assert.equal(app.session(), "b", "迟到的旧会话快照不得夺回会话");
  assert.match($("output").textContent, /B-MSG0/, "B 的消息区必须保住");
  assert.doesNotMatch($("output").textContent, /历史/, "旧会话消息不得落进新会话");
  assert.equal(app.watermark("b"), 6, "水位跟着当前会话 B，不被作废的旧快照改写");
});

test("历史被改写（撤回）：session.history.reset 触发整份重取", async (t) => {
  const page = await login(bootSessionPage());
  t.after(page.close);
  const { app } = page;
  const attaches = () => page.requests.filter((req) => req.type === "session.attach").length;
  const before = attaches();
  // 撤回截断历史：增量事件表达不了「消息消失」，只能整份重取。
  page.records.splice(100);
  app.event({ sessionId: "long", type: "session.history.reset", seq: 501, data: { reason: "recall" } });
  await until(() => attaches() > before, "reset 触发重取");
  await until(() => app.attachFlags().attaching === false, "重取完成");
  assert.equal(page.messages(), 100, "重取后以服务端截断后的历史为准");
  assert.equal(page.count("历史239"), 0, "被截断的消息从页上消失");
});

test("重取在飞时重连换了服务实例：旧响应作废", async (t) => {
  const page = await login(bootSessionPage({ hold: holdReattach }));
  t.after(page.close);
  const { app, $ } = page;
  void app.reattach();
  await until(() => page.held() === 1, "重取在飞");

  const reconnect = { ...sessionState("long", { messages: makeRecords(2, "重连"), seq: 600 }), instanceId: "epoch-2" };
  await app.snapshot(reconnect);
  assert.match($("output").textContent, /重连0/);

  page.release();
  await settle();
  await settle();
  assert.match($("output").textContent, /重连0/, "换实例后到达的旧响应必须作废");
  assert.equal(page.count("历史120"), 0);
  assert.equal(page.messages(), 2);
});

test("重取在飞时输入的草稿不被回包重置", async (t) => {
  const page = await login(bootSessionPage({ hold: holdReattach }));
  t.after(page.close);
  const { app, $ } = page;
  void app.reattach();
  await until(() => page.held() === 1, "重取在飞");
  const draft = "重取在飞时输入的草稿";
  $("prompt").value = draft;
  $("prompt").dispatchEvent(new page.window.Event("input"));

  page.release();
  await until(() => app.attachFlags().attaching === false, "快照落地");
  assert.equal($("prompt").value, draft, "重取回包不得用发起时读到的旧视图覆盖新草稿");
});

test("切走再切回：草稿按视图恢复，不被别的会话反噬", async (t) => {
  const page = bootSessionPage();
  t.after(page.close);
  const { app, $ } = page;
  const draft = "切走前的草稿";
  await app.snapshot(sessionState("a", { seq: 5, messages: makeRecords(3, "A-MSG") }));
  $("prompt").value = draft;
  app.saveView();

  await app.snapshot(sessionState("b", { seq: 6, messages: makeRecords(3, "B-MSG") }));
  assert.equal($("prompt").value, "", "B 会话没有草稿");

  await app.snapshot(sessionState("a", { seq: 5, messages: makeRecords(3, "A-MSG") }));
  assert.equal($("prompt").value, draft, "切回原会话立即恢复草稿");
  assert.match($("output").textContent, /A-MSG0/);
});

test("state.live 恢复的前缀接住后续 delta，内容完整不丢不重", async (t) => {
  const page = bootSessionPage();
  t.after(page.close);
  const { app, $ } = page;
  await app.snapshot(sessionState("a", {
    seq: 7,
    status: "running",
    live: { main: { role: "assistant", content: [
      { type: "text", text: "快照前缀" },
      { type: "thinking", thinking: "已有思考" },
    ] } },
  }));
  assert.match($("output").textContent, /快照前缀/);
  assert.equal(app.live.get("main").raw, "快照前缀", "挂起流入 live 时以快照文本为 delta 基线");

  app.event({ type: "agent.delta", sessionId: "a", agentId: "main", seq: 8, data: { type: "text_delta", delta: "追加后缀" } });
  page.paint();
  assert.equal(app.live.get("main").raw, "快照前缀追加后缀");
  assert.match($("output").textContent, /快照前缀追加后缀/, "delta 接在快照前缀之后，绘制内容不丢不重");
  assert.equal(app.live.get("main").reasoning, "已有思考", "renderMessage 恢复 thinking 块");

  app.event({ type: "agent.delta", sessionId: "a", agentId: "main", seq: 9, data: { type: "thinking_delta", delta: "继续思考" } });
  page.paint();
  assert.equal(app.live.get("main").reasoning, "已有思考继续思考");
});

test("后台标签页对消息区零 DOM 绘制，回前台重取一份完整历史", async (t) => {
  const page = await login(bootSessionPage());
  t.after(page.close);
  const { app } = page;
  const mutations = [];
  const observer = new page.window.MutationObserver((records) => mutations.push(...records));
  observer.observe(page.$("output"), { childList: true, subtree: true, characterData: true });
  page.setHidden(true);
  const before = page.texts();

  app.event(messageEvent("后台事件", 501));
  page.paint();
  assert.equal(app.attachFlags().hiddenDirty, true, "后台收口标记挂起");
  assert.deepEqual(page.texts(), before, "后台消息区内容不变");
  assert.equal(mutations.length, 0, "后台对消息区零 DOM 变更");

  observer.disconnect();
  // 回前台前服务端又追了一条：收口取到的必须是包含它的完整历史。
  page.records.push({ agentId: "main", entryId: "历史-240", message: { role: "user", content: "后台事件" } });
  page.setHidden(false);
  await until(() => !app.attachFlags().hiddenDirty && app.attachFlags().attaching === false, "回前台收口");
  assert.equal(page.messages(), 241, "收口后是服务端当前的整份历史");
  assert.equal(page.count("后台事件"), 1, "后台期间的新消息恰好一条，不重不丢");
});

// withdrawQueue(recall) 在 await request("session.attach") 之后直接 snapshot，没有对 attach 返回时的身份复核：
// 召回 attach 挂起期间用户切走（真实 switchSession 此刻 changing=true 但 sessionId 未变），
// 覆盖 B 已完成和 B 仍等待回包两种顺序，不能只检查 sessionId。
for (const pendingB of [false, true]) test(`召回 attach 挂起中切到 B（B${pendingB ? "仍等待" : "已完成"}）：A 不夺屏且召回文本留在 A 草稿`, async (t) => {
  const page = bootSessionPage();
  t.after(page.close);
  const { app, $ } = page;
  const states = {
    a: sessionState("a", { seq: 5, messages: makeRecords(4, "A-MSG") }),
    // 迟到的 A 快照带独立标记，便于断言它到底有没有重绘消息区。
    lateA: sessionState("a", { seq: 9, messages: makeRecords(4, "A-LATE") }),
    b: sessionState("b", { seq: 6, messages: makeRecords(4, "B-MSG") }),
  };
  let attachAStarted = false, releaseAttachA;
  const pendingAttachA = new Promise((resolve) => { releaseAttachA = resolve; });
  let releaseAttachB;
  const pendingAttachB = new Promise((resolve) => { releaseAttachB = resolve; });
  app.setRequest(async (type, data = {}) => {
    if (type === "sessions.list") return [];
    if (type === "queue.withdraw") return { steering: [], followUp: [], recalled: { entryId: "u1", text: "召回文本" } };
    if (type === "session.attach" && data.sessionId === "a") { attachAStarted = true; return pendingAttachA; }
    if (type === "session.attach" && pendingB) return pendingAttachB;
    if (type === "session.attach") return structuredClone(states[data.sessionId]);
    return {};
  });
  app.setConnected(true);
  await app.snapshot(structuredClone(states.a));
  assert.equal(app.session(), "a");

  // 规则召回：queue.withdraw 返回后走「重取快照」分支，attach 挂起在路上。
  const withdraw = app.withdrawQueue(true);
  await settle();
  assert.equal(attachAStarted, true, "召回路径已发出重取快照的 attach，并处于挂起状态");
  assert.equal(app.session(), "a");

  // 用户此刻切到 B：与真实 switchSession 一致（attach 期间只置 changing，尚未改 sessionId）。
  const switching = app.switchSession(() => app.request("session.attach", { sessionId: "b" }));
  if (!pendingB) {
    await switching;
    assert.equal(app.session(), "b");
    assert.match($("output").textContent, /B-MSG0/);
    assert.equal($("prompt").value, "");
  }

  // A 的 attach 迟到返回：此刻当前会话已是 B（或正在切换），A 的快照必须静默退场。
  releaseAttachA(structuredClone(states.lateA));
  await withdraw;
  await settle();
  assert.doesNotMatch($("output").textContent, /A-LATE/, "即使 B 还未返回，也不得启动过期的 A 快照");
  if (pendingB) {
    releaseAttachB(structuredClone(states.b));
    await switching;
  }
  assert.equal(app.session(), "b", "迟到的 A 快照不得把当前会话夺回 a");
  assert.doesNotMatch($("output").textContent, /A-LATE/, "迟到的 A 快照不得重绘消息区");
  assert.match($("output").textContent, /B-MSG0/, "B 的消息区必须保住");
  assert.equal($("prompt").value, "", "召回文本不得落进 B 的输入框");
  assert.equal(app.views.get("a")?.draft, "召回文本", "召回文本按视图存进 A 草稿，切回 A 时再恢复");
});
