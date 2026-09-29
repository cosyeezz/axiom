import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { WebSocket } from "ws";
import { command, promptImages, assertPromptImages } from "../src/protocol.js";
import { queueStateOf, withdrawQueue } from "../src/pi.js";
import { Sessions } from "../src/sessions.js";
import { createServerApp } from "../src/server.js";
import { GOAL_PREPARE_PROMPT } from "../src/todo-prompts.js";

const pngBase64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]).toString("base64");
const jpegBase64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString("base64");
const image = (data = pngBase64, mimeType = "image/png") => ({ type: "image", mimeType, data });

const parsePrompt = (extra) =>
  command.parse({ id: "r1", type: "prompt", sessionId: "s1", text: "hi", ...extra });

test("prompt 协议：数量、大小与 base64 受限，纯图片允许", () => {
  assert.doesNotThrow(() => parsePrompt({ text: "", images: [image()] }));
  assert.throws(() => parsePrompt({ text: "hi", images: Array.from({ length: 5 }, () => image()) }), /图片最多 4 张/);
  assert.throws(() => parsePrompt({ text: "hi", images: [image("!!!!", "image/png")] }));
  const fiveMiB = Buffer.alloc(5 * 1024 * 1024 + 1, 0x89).toString("base64");
  assert.throws(() => promptImages.parse([image(fiveMiB)]), /单张图片不能超过 5 MiB/);
});

test("完全空请求在会话层拒绝", async () => {
  const factory = async () => ({ subscribe: () => () => {}, prompt: async () => {}, enqueue: async () => {}, queue: () => ({ steering: [], followUp: [] }), withdraw: () => ({ steering: [], followUp: [] }), abort: async () => {}, result: () => "ok", dispose: async () => {} });
  factory.catalog = () => [];
  const sessions = new Sessions(factory, undefined, undefined);
  const id = await sessions.create(process.cwd());
  await assert.rejects(sessions.prompt(id, "   "), /请求内容不能为空/);
  await assert.rejects(sessions.prompt(id, "", undefined, []), /请求内容不能为空/);
  await sessions.close();
});

test("图片签名校验：内容必须与声明格式一致", () => {
  assert.doesNotThrow(() => assertPromptImages([image(), image(jpegBase64, "image/jpeg")]));
  assert.throws(() => assertPromptImages([image(jpegBase64, "image/png")]), /格式不符/);
  assert.throws(() => assertPromptImages([image(pngBase64, "image/webp")]), /格式不符/);
});

test("不支持图片的模型在回执前拒绝，支持时透传 prompt 与队列", async () => {
  const calls = { prompt: [], enqueue: [] };
  let finish;
  const factory = async (_, selection) => {
    let model = selection.model || "test/text-only";
    return {
      config: () => ({ model, thinking: "off", levels: ["off"] }),
      configure: async (next) => { model = next.model; return { model }; },
      subscribe: () => () => {},
      prompt: (text, options) => {
        calls.prompt.push({ text, options });
        return new Promise((resolve) => { finish = resolve; });
      },
      enqueue: async (text, type, images) => { calls.enqueue.push({ text, type, images }); },
      queue: () => ({ steering: [], followUp: [] }),
      withdraw: () => ({ steering: [], followUp: [] }),
      abort: async () => finish?.(), result: () => "ok", dispose: async () => {},
    };
  };
  factory.catalog = () => [
    { key: "test/text-only", input: ["text"] },
    { key: "test/vision", input: ["text", "image"] },
  ];
  const root = await mkdtemp(join(tmpdir(), "axiom-image-"));
  let sessions;
  try {
    sessions = new Sessions(factory, undefined, join(root, "sessions"));
    const id = await sessions.create(root, { model: "test/text-only" });
    const images = [image()];
    await assert.rejects(sessions.prompt(id, "看图", undefined, images), /不支持图片输入/);
    assert.deepEqual(calls.prompt, [], "拒绝时不得启动运行");
    assert.equal(sessions.get(id).status, "idle");
    await sessions.configure(id, { model: "test/vision" });
    await sessions.prompt(id, "", undefined, images);
    assert.deepEqual(calls.prompt.at(-1), { text: "", options: { images } });
    await assert.rejects(sessions.prompt(id, "x", undefined, [{ type: "image", mimeType: "image/png", data: jpegBase64 }]), /格式不符/);
    await sessions.prompt(id, "插话", "steer", images);
    assert.deepEqual(calls.enqueue.at(-1), { text: "插话", type: "steer", images });
  } finally {
    await sessions?.close();
    await rm(root, { recursive: true, force: true });
  }
});

async function planningFixture(t, model = "test/vision") {
  const calls = [];
  let finish;
  const factory = async () => ({
    config: () => ({ model }), subscribe: () => () => {},
    prompt(text, options) { calls.push({ text, options }); return new Promise((resolve) => { finish = resolve; }); },
    queue: () => ({ steering: [], followUp: [] }), requestSafeStop() {},
    abort: async () => finish?.(), result: () => "", dispose: async () => {},
  });
  factory.catalog = () => [{ key: "test/vision", input: ["text", "image"] }, { key: "test/text-only", input: ["text"] }];
  const sessions = new Sessions(factory);
  t.after(() => sessions.close());
  const id = await sessions.create();
  return { sessions, id, calls, item: sessions.get(id) };
}

for (const direct of [false, true]) for (const text of ["", "看图"]) {
  test(`规划图片透传：${direct ? "/goal 附图" : "先进入规划再附图"}，${text ? "图文" : "纯图"}`, async (t) => {
    const { sessions, id, calls, item } = await planningFixture(t);
    if (!direct) {
      await sessions.prompt(id, "/goal");
      assert.equal(calls.length, 0);
      assert.equal(item.todo.requiresPlan, true);
    }
    const images = [image()];
    await sessions.prompt(id, direct ? `/goal ${text}` : text, undefined, images);
    assert.deepEqual(calls, [{ text: `${GOAL_PREPARE_PROMPT}\n\n${text}`, options: { images } }]);
  });
}

test("/goal 图片先校验：无视觉能力或无效图片不改变Todo也不启动", async (t) => {
  const { sessions, id, calls, item } = await planningFixture(t, "test/text-only");
  const before = item.todo.snapshot();
  await assert.rejects(sessions.prompt(id, "/goal 看图", undefined, [image()]), /不支持图片输入/);
  await assert.rejects(sessions.prompt(id, "/goal", undefined, [image(jpegBase64)]), /格式不符/);
  assert.deepEqual(item.todo.snapshot(), before);
  assert.equal(item.status, "idle");
  assert.deepEqual(calls, []);
});

test("已有未完成Todo的 /goal 附图明确拒绝而非吞图，无图保留原行为", async (t) => {
  const { sessions, id, calls, item } = await planningFixture(t);
  item.todo.questions = { confirmTodo: async () => ({ approved: true }) };
  await item.todo.update({ baseVersion: 0, ops: [{ op: "add", level: 1, id: "a", title: "交付", description: "范围", acceptance: [{ criterionId: "c", text: "核对", check: "review" }] }] });
  await sessions.todoAction(id, "pause");
  const before = item.todo.snapshot(), runId = item.runId;
  for (const text of ["/goal", "/goal 新要求"])
    await assert.rejects(sessions.prompt(id, text, undefined, [image()]), /图片尚未发送/);
  await sessions.prompt(id, "/goal");
  assert.deepEqual(item.todo.snapshot(), before);
  assert.equal(item.runId, runId);
  assert.deepEqual(calls, []);
});

test("队列展示结构：同文本不碰撞，文本与图片按位置平行，纯图片文本为空", () => {
  const a = image(), b = image(jpegBase64, "image/jpeg");
  const queued = (content) => ({ messages: [{ role: "user", content }] });
  // 两条相同文本、不同图片：shadow map 按文本作键会碰撞，真实队列按位置区分
  const steering = queued([{ type: "text", text: "看图" }, a]).messages;
  steering.push({ role: "user", content: [{ type: "text", text: "看图" }, b] });
  const followUp = queued([{ type: "image", mimeType: "image/png", data: pngBase64 }]);
  const state = queueStateOf({ messages: steering }, followUp);
  assert.deepEqual(state.steering, ["看图", "看图"]);
  assert.deepEqual(state.images.steering, [[a], [b]]);
  assert.deepEqual(state.followUp, [""]);
  assert.equal(state.images.followUp[0].length, 1);
  assert.deepEqual(queueStateOf({ messages: [] }, { messages: [] }), { steering: [], followUp: [], images: { steering: [], followUp: [] } });
});

test("撤回保图：clearQueue 同步清空队列并发出 queue_update，快照仍先于清空完成", () => {
  const images = [image()];
  const steering = { messages: [{ role: "user", content: [{ type: "text", text: "看图" }, ...images] }] };
  const followUp = { messages: [] };
  const events = [];
  const session = {
    agent: { steeringQueue: steering, followUpQueue: followUp },
    clearQueue() {
      steering.messages = [];
      followUp.messages = [];
      events.push("queue_update"); // 复刻 SDK 同步事件：旧的 reconcile 在此清空 map，导致事后取不到图
    },
  };
  const withdrawn = withdrawQueue(session);
  assert.deepEqual(events, ["queue_update"]);
  assert.deepEqual(withdrawn.steering, ["看图"]);
  assert.deepEqual(withdrawn.images.steering[0].map(({ type, mimeType }) => ({ type, mimeType })), [{ type: "image", mimeType: "image/png" }]);
  assert.deepEqual(withdrawn.images.followUp, []);
});

test("WS 链路：超过旧 1MiB 的大图可送达，完全空请求被拒", async () => {
  const factory = async () => ({
    subscribe: () => () => {},
    prompt: async () => {},
    enqueue: async () => {},
    queue: () => ({ steering: [], followUp: [] }),
    withdraw: () => ({ steering: [], followUp: [] }),
    abort: async () => {}, result: () => "ok", dispose: async () => {},
  });
  factory.catalog = () => [];
  const sessions = new Sessions(factory, undefined, undefined);
  const app = createServerApp(sessions);
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const ws = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/ws`, ["axiom"]);
  await once(ws, "open");
  const request = (value) =>
    new Promise((resolve) => {
      const listen = (raw) => {
        const msg = JSON.parse(raw);
        if (msg.type === "response" && msg.id === value.id) {
          ws.off("message", listen);
          resolve(msg);
        }
      };
      ws.on("message", listen);
      ws.send(JSON.stringify(value));
    });
  try {
    const created = await request({ id: "c1", type: "session.create", cwd: tmpdir(), useDefaults: false });
    const sessionId = created.data.sessionId;
    const big = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(900 * 1024),
    ]).toString("base64"); // base64 后约 1.2MiB，超过旧 maxPayload
    assert(big.length > 1024 * 1024);
    const ok = await request({ id: "p1", type: "prompt", sessionId, text: "", images: [{ type: "image", mimeType: "image/png", data: big }] });
    assert.equal(ok.ok, true);
    const empty = await request({ id: "p2", type: "prompt", sessionId, text: "   " });
    assert.equal(empty.ok, false);
    assert.match(empty.error, /请求内容不能为空/);
  } finally {
    ws.close();
    await app.close();
  }
});
