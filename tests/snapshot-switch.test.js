import test from "node:test";
import assert from "node:assert/strict";
import { bootHistoryPage, until, settle, sessionState, makeRecords, PAGE_SIZE } from "./helpers/history-page.js";

// 分页替代分片后的切换语义：翻页在飞的响应必须按 token/会话/实例/修订号作废，
// 旧页不作画、不夺屏、不推进水位；后台标签页对消息区零 DOM 变更。
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

test("翻页在飞时切换会话：旧页响应作废，不夺屏也不污染新会话", async (t) => {
  const page = bootHistoryPage({ hold: (req) => req.type === "session.history" });
  t.after(page.close);
  const { app, $ } = page;
  await login(page);
  $("history-before").click();
  await until(() => page.held() === 1, "翻页在飞");

  await app.snapshot(sessionState("b", { messages: makeRecords(4, "B-MSG") }));
  assert.equal(app.session(), "b");
  assert.match($("output").textContent, /B-MSG0/);
  assert.equal($("history-pages").hidden, true, "B 没有分页元数据");

  page.release();
  await settle();
  await settle();
  assert.equal(app.session(), "b", "迟到的旧页响应不得夺回会话");
  assert.equal(app.historyState().sessionId, "b", "旧页响应不得替换当前页状态");
  assert.equal(app.historyState().messages.length, 4);
  assert.match($("output").textContent, /B-MSG0/, "B 的消息区必须保住");
  assert.doesNotMatch($("output").textContent, /历史/, "旧页消息不得落进新会话");
});

test("翻页在飞时历史修订变化：旧响应作废并按新修订重取最新页", async (t) => {
  const page = await login(bootHistoryPage({ hold: (req) => req.type === "session.history" }));
  t.after(page.close);
  const { app, $ } = page;
  const attachBefore = page.requests.filter((req) => req.type === "session.attach").length;
  $("history-before").click();
  await until(() => page.held() === 1, "翻页在飞");

  // 服务端撤回/压缩：历史内容换了修订号，游标失效。
  page.touchHistory();
  app.event({ type: "session.history.changed", sessionId: "long", data: { revision: page.history.revision } });
  await until(() => page.requests.filter((req) => req.type === "session.attach").length > attachBefore, "修订变化后重取最新页");
  await until(() => !app.historyFlags().loading, "重取完成");

  page.release();
  await settle();
  await settle();
  assert.equal(page.pageText(), "181–240 / 240 条", "失效的旧页不得替换修订号更新后的页面");
  assert.equal(page.count("历史120"), 0, "旧页消息不得重绘");
  assert.equal(page.count("历史239"), 1);
});

test("翻页在飞时重连换了服务实例：旧响应作废", async (t) => {
  const page = await login(bootHistoryPage({ hold: (req) => req.type === "session.history" }));
  t.after(page.close);
  const { app, $ } = page;
  $("history-before").click();
  await until(() => page.held() === 1, "翻页在飞");

  const reconnect = { ...sessionState("long", { messages: makeRecords(2, "重连"), seq: 600 }), instanceId: "epoch-2" };
  await app.snapshot(reconnect);
  assert.match($("output").textContent, /重连0/);

  page.release();
  await settle();
  await settle();
  assert.match($("output").textContent, /重连0/, "换实例后到达的旧页响应必须作废");
  assert.equal(page.count("历史120"), 0);
  assert.equal(app.historyState().messages.length, 2);
});

test("翻页在飞时输入的草稿不被回包重置", async (t) => {
  const page = await login(bootHistoryPage({ hold: (req) => req.type === "session.history" }));
  t.after(page.close);
  const { $ } = page;
  $("history-before").click();
  await until(() => page.held() === 1, "翻页在飞");
  const draft = "翻页在飞时输入的草稿";
  $("prompt").value = draft;
  $("prompt").dispatchEvent(new page.window.Event("input"));

  page.release();
  await until(() => page.pageText().startsWith("121–180"), "旧页落地");
  assert.equal($("prompt").value, draft, "翻页回包不得用发起时读到的旧视图覆盖新草稿");
});

test("切走再切回：草稿按视图恢复，不被别的会话反噬", async (t) => {
  const page = bootHistoryPage();
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
  const page = bootHistoryPage();
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

test("后台标签页翻页与实时事件零 DOM 绘制，回前台收口到最新页", async (t) => {
  const page = await login(bootHistoryPage());
  t.after(page.close);
  const { app, $ } = page;
  const mutations = [];
  const observer = new page.window.MutationObserver((records) => mutations.push(...records));
  observer.observe($("output"), { childList: true, subtree: true, characterData: true });
  page.setHidden(true);
  const before = page.texts();

  $("history-before").click();
  await until(() => !app.historyFlags().loading, "后台页响应到达");
  app.event(messageEvent("后台事件", 501));
  page.paint();
  assert.equal(app.historyFlags().hiddenDirty, true, "后台收口标记挂起");
  assert.deepEqual(page.texts(), before, "后台消息区内容不变");
  assert.equal(mutations.length, 0, "后台对消息区零 DOM 变更");

  observer.disconnect();
  page.setHidden(false);
  await until(() => page.pageText().startsWith("181–240"), "回前台收口到最新页");
  assert.equal(app.historyFlags().hiddenDirty, false);
  assert.equal(page.messages(), PAGE_SIZE, "收口后仍是定长一页");
  assert.equal(page.count("历史120"), 0, "后台翻到的旧页从未作画");
  assert.equal(page.count("历史239"), 1);
});

// withdrawQueue(recall) 在 await request("session.attach") 之后直接 snapshot，没有对 attach 返回时的身份复核：
// 召回 attach 挂起期间用户切走（真实 switchSession 此刻 changing=true 但 sessionId 未变），
// 覆盖 B 已完成和 B 仍等待回包两种顺序，不能只检查 sessionId。
for (const pendingB of [false, true]) test(`召回 attach 挂起中切到 B（B${pendingB ? "仍等待" : "已完成"}）：A 不夺屏且召回文本留在 A 草稿`, async (t) => {
  const page = bootHistoryPage();
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
