import test from "node:test";
import assert from "node:assert/strict";
import { bootHistoryPage, until, makeRecords, PAGE_SIZE } from "./helpers/history-page.js";

// 分片删除后的版本：snapshot() 对一页做同步挂载，事件不再经过分片队列，
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
  // 10 条历史：补放事件不触发 60 条页预算，专测闸的顺序与恰好一次。
  const page = bootHistoryPage({ records: makeRecords(10), hold: (req) => req.type === "session.attach" });
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
  const page = await login(bootHistoryPage());
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
  const page = bootHistoryPage({ hold: (req) => req.type === "session.attach" });
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
  const page = await login(bootHistoryPage());
  t.after(page.close);
  const { app } = page;
  assert.equal(app.watermark("long"), 500);
  const restore = app.failPlacement();
  const failing = { ...app.historyState(), seq: 999 };
  assert.throws(() => app.snapshot(failing), /分片渲染失败/);
  assert.equal(app.watermark("long"), 500, "失败恢复不得把水位从 500 提前抬到 999");
  assert.equal(app.queue(), null, "抛错后事件闸已解除");
  assert.ok(["recovering", "disconnected"].includes(app.transportState()), "失败后停用归并，等待受控恢复");
  app.event(messageEvent("失败后事件", 999));
  assert.equal(page.count("失败后事件"), 0, "恢复中不再应用事件");
  restore();
});

test("前插历史不推进水位，浏览期间实时消息仍追加",  async (t) => {
  const page = await login(bootHistoryPage());
  t.after(page.close);
  const { app, $ } = page;
  $("history-before").click();
  await until(() => app.historyState().history.start === 120, "载入更早消息");
  assert.equal(page.messages(), PAGE_SIZE * 2);
  assert.equal(app.watermark("long"), 500, "页响应不是实时快照，不提交水位");

  // 浏览旧页期间服务端又追加了一条消息，实时事件到达。
  page.records.push({ agentId: "main", entryId: "历史-新消息", message: { role: "user", content: "历史-新消息" } });
  app.event(messageEvent("新消息", 501));
  assert.equal(page.count("新消息"), 1, "浏览历史不阻断实时消息");
  assert.equal(app.watermark("long"), 501, "实时事件本身照常推进水位");

  $("latest").click();
  assert.equal(page.count("新消息"), 1, "回到最新后才绘制新消息");
  assert.equal(page.count("历史239"), 1, "最新页仍是定长窗口");
});
