import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recallLastMessage } from "../src/pi.js";
import { Sessions } from "../src/sessions.js";

const user = (content) => ({ type: "message", id: "u1", message: { role: "user", content } });
const assistant = (stopReason = "aborted", content = []) => ({ type: "message", id: "a1", message: { role: "assistant", stopReason, content } });
const thinking = [{ type: "thinking", thinking: "想一半" }];

function fixture(entries, { streaming = false, cancelled = false } = {}) {
  const calls = { aborted: 0, navigated: [], custom: [] };
  const session = {
    isStreaming: streaming,
    abort: async () => { calls.aborted++; session.isStreaming = false; },
    navigateTree: async (id) => { calls.navigated.push(id); return { cancelled, editorText: "" }; },
    sessionManager: {
      getBranch: () => entries,
      appendCustomEntry: (type, data) => calls.custom.push({ type, data }),
    },
  };
  return { session, calls };
}

test("recall pulls the last user input back before any model output", async () => {
  const { session, calls } = fixture([user([{ type: "text", text: "看图 [image1]" }, { type: "image", mimeType: "image/png", data: "AA==" }])]);
  const recalled = await recallLastMessage(session);
  assert.deepEqual(calls.navigated, ["u1"], "leaf falls back to before the recalled message");
  assert.equal(calls.custom[0].type, "axiom_recall", "branch is pinned on disk so a restart keeps it");
  assert.equal(recalled.text, "看图 [image1]");
  assert.deepEqual(recalled.images, [{ type: "image", mimeType: "image/png", data: "AA==" }]);
});

test("recall stops a running turn first and drops its interrupted half-answer", async () => {
  const { session, calls } = fixture([user([{ type: "text", text: "hi" }]), assistant("aborted", thinking)], { streaming: true });
  await recallLastMessage(session);
  assert.equal(calls.aborted, 1);
  assert.deepEqual(calls.navigated, ["u1"], "an aborted half-answer is dropped with the input");
});

test("recall refuses once the model produced an answer, a tool result or a tool call", async () => {
  const answered = fixture([user([{ type: "text", text: "hi" }]), assistant("stop")]);
  await assert.rejects(recallLastMessage(answered.session), /已经产生了模型输出/);
  assert.deepEqual(answered.calls.navigated, []);
  const tools = fixture([user([{ type: "text", text: "hi" }]), { type: "message", id: "t1", message: { role: "toolResult", content: [] } }]);
  await assert.rejects(recallLastMessage(tools.session), /已经产生了模型输出/);
  const calling = fixture([user([{ type: "text", text: "hi" }]), assistant("aborted", [{ type: "toolCall", id: "c1", name: "read" }])]);
  await assert.rejects(recallLastMessage(calling.session), /已经产生了模型输出/, "side effects must keep their record");
});

test("recall without a user message and a cancelled navigation do nothing", async () => {
  const empty = fixture([]);
  assert.equal(await recallLastMessage(empty.session), null);
  assert.equal(empty.calls.custom.length, 0);
  const cancelled = fixture([user([{ type: "text", text: "hi" }])], { cancelled: true });
  assert.equal(await recallLastMessage(cancelled.session), null);
  assert.deepEqual(cancelled.calls.custom, [], "no marker when an extension cancelled the navigation");
});

test("withdraw with recall trims the web history and leaves the queue alone when recall fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-recall-sessions-"));
  const queued = { steering: ["插话"], followUp: [] };
  let recalled = { entryId: "u1", text: "撤回的输入", images: [] };
  const factory = async () => ({
    config: () => ({ model: "test/one", thinking: "off", levels: ["off"] }),
    configure: async () => ({}),
    subscribe: () => () => {},
    prompt: async () => {},
    enqueue: async () => {},
    queue: () => structuredClone(queued),
    withdraw: () => { const old = structuredClone(queued); queued.steering = []; return old; },
    recall: async () => { if (!recalled) throw new Error("本轮已经产生了模型输出，无法撤回输入"); return recalled; },
    abort: async () => {}, result: () => "ok", dispose: async () => {},
  });
  factory.catalog = () => [{ key: "test/one" }];
  const sessions = new Sessions(factory, undefined, join(root, "sessions"));
  const id = await sessions.create(root);
  sessions.get(id).messages = [
    { agentId: "main", entryId: "u0", message: { role: "user", content: "旧输入" } },
    { agentId: "main", entryId: "u1", message: { role: "user", content: "撤回的输入" } },
    { agentId: "main", message: { role: "assistant", stopReason: "aborted", content: [] } },
  ];
  const withdrawn = await sessions.withdraw(id, true);
  assert.deepEqual(withdrawn.recalled, recalled);
  assert.deepEqual(withdrawn.steering, ["插话"], "queue withdrawal still rides along");
  assert.deepEqual(sessions.snapshot(id).messages.map((record) => record.entryId), ["u0"], "recalled input and its interrupted answer leave the transcript");
  recalled = null;
  queued.steering = ["再来一条"];
  await assert.rejects(sessions.withdraw(id, true), /已经产生了模型输出/);
  assert.deepEqual(sessions.get(id).agent.queue(), { steering: ["再来一条"], followUp: [] }, "a refused recall must not eat the queue");
});
