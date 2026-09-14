import test from "node:test";
import assert from "node:assert/strict";
import { createQuestions } from "../src/questions.js";
import { command } from "../src/protocol.js";
import { Sessions } from "../src/sessions.js";
import { once } from "node:events";
import { WebSocket } from "ws";
import { createServerApp } from "../src/server.js";

test("question.reply WebSocket command returns its matching response and rejects invalid input", async () => {
  const received = [];
  const app = createServerApp({ list: () => [], close: async () => {}, replyQuestion: (...args) => { received.push(args); return { toolCallId: args[1] }; } });
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const ws = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/ws`, ["axiom"]);
  await once(ws, "open");
  try {
    for (const answers of [[["答案"]], [[]]]) {
      const response = once(ws, "message");
      ws.send(JSON.stringify({ id: "reply", type: "question.reply", sessionId: "session", toolCallId: "call", answers }));
      const message = JSON.parse((await response)[0]);
      assert.equal(message.ok, answers[0].length > 0);
    }
    assert.deepEqual(received, [["session", "call", [["答案"]]]]);
  } finally { ws.terminate(); await app.close(); }
});

const params = { questions: [
  { header: "方式", question: "怎么登录？", description: "影响账号维护。", options: [{ label: "邮箱" }, { label: "GitHub", description: "面向开发者。" }] },
  { header: "功能", question: "需要哪些功能？", description: "确定实现范围。", options: [{ label: "记录" }, { label: "自动登录" }], multiple: true },
] };

test("question waits for all answers, validates without consuming, closes once and returns tool output", async () => {
  const events = [];
  const questions = createQuestions((event) => events.push(event));
  let completed = false;
  const result = questions.tool.execute("call", params).then((value) => { completed = true; return value; });
  await Promise.resolve();
  assert.equal(completed, false);
  assert.deepEqual(questions.snapshot(), [{ toolCallId: "call", ...params }]);
  assert.equal(events[0].type, "question.asked");
  assert.throws(() => questions.reply("call", [["邮箱"]]), /全部/);
  assert.throws(() => questions.reply("call", [["邮箱", "GitHub"], ["记录"]]), /单选/);
  assert.throws(() => questions.reply("call", [["邮箱"], ["记录", "记录"]]), /重复/);
  assert.throws(() => questions.reply("call", [[" "], ["记录"]]));
  const answers = [["自建 SSO"], ["记录", "自动登录"]];
  questions.reply("call", answers);
  assert.deepEqual(JSON.parse((await result).content[0].text), { answers });
  assert.deepEqual(questions.snapshot(), []);
  assert.deepEqual(events.map((e) => e.type), ["question.asked", "question.closed"]);
  assert.throws(() => questions.reply("call", answers), /已回答或已取消/);
});

test("question validates model input and aborts pending calls without polling", async () => {
  const questions = createQuestions(() => {});
  await assert.rejects(questions.tool.execute("bad", { questions: [] }));
  await assert.rejects(questions.tool.execute("bad", { questions: [{ ...params.questions[0], options: [{ label: "同名" }, { label: " 同名 " }] }] }));
  const controller = new AbortController();
  const pending = questions.tool.execute("call", params, controller.signal);
  const aborted = assert.rejects(pending, /取消/);
  controller.abort();
  await aborted;
  await assert.rejects(questions.tool.execute("again", params, controller.signal));
  const next = questions.tool.execute("next", params);
  const cancelled = assert.rejects(next, /取消/);
  questions.cancel(); questions.cancel();
  await cancelled;
  assert.deepEqual(questions.snapshot(), []);
  assert.equal(command.safeParse({ id: "r", type: "question.reply", sessionId: "s", toolCallId: "c", answers: [["答案"]] }).success, true);
  assert.equal(command.safeParse({ id: "r", type: "question.reply", sessionId: "s", toolCallId: "c", answers: [[]] }).success, false);
});

test("sessions expose question only to main, isolate replies, snapshot pending calls and cancel on shutdown", async () => {
  const registrations = [];
  const factory = async (tools) => {
    registrations.push(tools);
    return { config: () => ({ model: "test/one", thinking: "off" }), subscribe: () => () => {},
      prompt: async () => {}, abort: async () => {}, dispose: async () => {}, result: () => "done" };
  };
  factory.catalog = () => [{ key: "test/one" }];
  const sessions = new Sessions(factory);
  try {
    const id = await sessions.create(process.cwd());
    const other = await sessions.create(process.cwd());
    const events = [];
    const unsubscribe = sessions.subscribe(id, (event) => events.push(event));
    const tool = registrations[0].find((t) => t.name === "question");
    assert.ok(tool);
    const pending = tool.execute("call", params);
    unsubscribe(); // disconnect is not cancellation
    assert.equal(sessions.snapshot(id).questions.length, 1);
    assert.equal(events[0].sessionId, id);
    assert.throws(() => sessions.replyQuestion(other, "call", [["邮箱"], ["记录"]]), /已回答或已取消/);
    sessions.replyQuestion(id, "call", [["邮箱"], ["记录"]]);
    await pending;
    assert.equal(sessions.snapshot(id).questions.length, 0);
    sessions.get(id).tasks.start(["子任务"], "背景");
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(registrations[2], [], "child gets no question or delegation tools");
    const cancelled = tool.execute("cancel", params);
    const rejected = assert.rejects(cancelled, /取消/);
    await sessions.cancel(id);
    await rejected;
    const shutdown = tool.execute("shutdown", params);
    const stopped = assert.rejects(shutdown, /取消/);
    await sessions.close();
    await stopped;
  } finally { await sessions.close(); }
});
