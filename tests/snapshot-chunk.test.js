import test from "node:test";
import assert from "node:assert/strict";
import { bootSessionPage, until, makeRecords } from "./helpers/session-page.js";

// 分片与分页都已删除：snapshot() 对整份历史做同步挂载，
// 但 transport 的「快照闸」语义没变——attach 在飞期间到达的事件先进闸，
// 提交快照时按会话与 seq 水位过滤后补放。这里验证的正是这套真实语义。
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

test("attach 在飞时事件入闸：提交后按到达顺序补放且恰好一次", async (t) => {
  // 10 条历史：挂载开销小，专测闸的顺序与恰好一次。
  const page = bootSessionPage({ records: makeRecords(10), hold: (req) => req.type === "session.attach" });
  t.after(page.close);
  const { app } = page;
  page.open();
  await until(() => page.held() === 1, "attach 在飞");
  // transport.request 对 attach 先 beginSnapshot：还在等回执时到达的事件都已进闸。
  assert.notEqual(app.queue(), null, "attach 在飞期间存在事件闸");
  app.event(messageEvent("闸内甲", 501));
  app.event(messageEvent("闸内乙", 502));
  assert.equal(page.count("闸内甲"), 0, "快照提交前事件只排队，不提前落地");
  page.release();
  await until(() => app.connected(), "首屏完成");
  const marks = page.texts().map((text) => text.match(/闸内[甲乙]/)?.[0]).filter(Boolean);
  assert.deepEqual(marks, ["闸内甲", "闸内乙"], "按到达顺序补放");
  assert.equal(page.count("闸内甲"), 1, "恰好一次");
  assert.equal(page.count("闸内乙"), 1, "恰好一次");
  assert.equal(app.watermark("long"), 502, "补放后水位前进到最后一个 seq");
});

test("快照水位以内的事件按 seq 去重，不重复应用", async (t) => {
  const page = await login(bootSessionPage());
  t.after(page.close);
  const { app } = page;
  app.event(messageEvent("水位下480", 480));
  app.event(messageEvent("水位平500", 500));
  app.event(messageEvent("水位上501", 501));
  assert.equal(page.count("水位下480"), 0, "低于水位的事件不重复应用");
  assert.equal(page.count("水位平500"), 0, "等于水位的事件已包含在快照里，不重复");
  assert.equal(page.count("水位上501"), 1, "高于水位的事件正常应用");
  assert.equal(app.watermark("long"), 501);
});

test("无 seq 事件不参与水位去重；跨会话事件被闸丢弃、session.deleted 仍放行", async (t) => {
  const page = bootSessionPage({ hold: (req) => req.type === "session.attach" });
  t.after(page.close);
  const { app } = page;
  page.open();
  await until(() => page.held() === 1, "attach 在飞");
  app.event(messageEvent("无序号", undefined));
  app.event(messageEvent("别的会话", 501, "other"));
  const before = page.requests.length;
  app.event({ type: "session.deleted", sessionId: "other" });
  page.release();
  await until(() => app.connected(), "首屏完成");
  assert.equal(page.count("无序号"), 1, "无 seq 的同会话事件不被水位吞掉");
  assert.equal(page.count("别的会话"), 0, "提交时丢弃其他会话的事件");
  await until(() => page.requests.slice(before).some((req) => req.type === "sessions.list"), "session.deleted 触发会话列表刷新");
});

test("快照渲染抛错：解阀、水位不前进，随后事件不再归并", async (t) => {
  const page = await login(bootSessionPage());
  t.after(page.close);
  const { app } = page;
  assert.equal(app.watermark("long"), 500);
  const restore = app.failPlacement();
  const failing = page.fullState({ seq: 999 });
  assert.throws(() => app.snapshot(failing), /历史挂载失败/);
  assert.equal(app.watermark("long"), 500, "失败恢复不得把水位从 500 提前抬到 999");
  assert.equal(app.queue(), null, "抛错后事件闸已解除");
  assert.ok(["recovering", "disconnected"].includes(app.transportState()), "失败后停用归并，等待受控恢复");
  app.event(messageEvent("失败后事件", 999));
  assert.equal(page.count("失败后事件"), 0, "恢复中不再应用事件");
  restore();
});

test("历史整份在场时，实时消息照常追加并推进水位", async (t) => {
  const page = await login(bootSessionPage());
  t.after(page.close);
  const { app, $ } = page;
  assert.equal(page.messages(), 240, "attach 一次给全量");
  assert.equal(app.watermark("long"), 500);

  app.event(messageEvent("新消息", 501));
  assert.equal(page.count("新消息"), 1, "实时消息直接追加到末尾");
  assert.equal(app.watermark("long"), 501, "实时事件推进水位");

  $("earliest").click();
  $("latest").click();
  assert.equal(page.count("新消息"), 1, "本地跳转不重建不重绘");
  assert.equal(page.count("历史239"), 1);
  assert.equal(page.messages(), 241);
});
