import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Sessions } from "../src/sessions.js";

// 混合时间线的读时投影：子代理记录跟着委派锚点整组就位，主对话顺序不被打乱。
// 主/子记录按「真实会话」的到达顺序构造：委派发生 → 子代理持续产出 → 主对话继续。
// 分页已下线，快照一次下发整段历史，所以这里验证的是投影顺序与一致性，不是窗口预算。

function fakeSource() {
  const factory = async (_, selection = {}) => ({
    config: () => ({ model: "test/one", thinking: "off", levels: ["off"] }),
    configure: async (next) => ({ model: next.model }),
    subscribe: () => () => {},
    prompt: async () => {}, enqueue: async () => {},
    queue: () => ({ steering: [], followUp: [] }), withdraw: () => ({}),
    recall: async () => ({ entryId: "u1" }),
    abort: async () => {}, result: () => "ok", dispose: async () => {},
    sessionFile: () => selection.sessionFile,
    historyEntries: () => [],
    state: { messages: [] },
  });
  factory.catalog = () => [{ key: "test/one" }];
  return factory;
}

const mainRecord = (n, extra = {}) => ({ agentId: "main", entryId: `m${n}`,
  message: { role: n % 2 ? "assistant" : "user", content: `主消息 ${n}`, ...extra } });
const subRecord = (task, n) => ({ agentId: task, entryId: `s-${task}-${n}`,
  message: { role: n % 2 ? "assistant" : "user", content: `子记录 ${n}` } });
const delegateAnchor = (n, taskIds) => ({ agentId: "main", entryId: `m${n}`,
  message: { role: "toolResult", toolName: "delegate", toolCallId: `call-${n}`,
    content: [{ type: "text", text: JSON.stringify({ taskIds }) }] } });

const append = (sessions, id, records) => {
  for (const record of records)
    sessions.get(id).emit({ type: "agent.message.end", agentId: record.agentId, data: { message: record.message, entryId: record.entryId } });
};

const entryIds = (state) => state.messages.map((message) => message.entryId ?? message.messageId);
const mainIds = (state) => state.messages.filter((message) => (message.agentId ?? "main") === "main").map((message) => message.entryId);

async function boot(t, records) {
  const root = await mkdtemp(join(tmpdir(), "axiom-projection-"));
  const sessions = new Sessions(fakeSource(), undefined, join(root, "sessions"));
  t.after(async () => { await sessions.close(); await rm(root, { recursive: true, force: true }); });
  const id = await sessions.create(root);
  append(sessions, id, records);
  return { sessions, id };
}

test("子代理风暴不挤走主对话：主轴完整下发，子记录整组插在委派锚点之后", async t => {
  // 症状复现（分页时代）：主对话在前、550 条子记录持续到达，末页 60 条全是子记录，首屏空白。
  const arrival = [
    ...Array.from({ length: 100 }, (_, n) => n === 95 ? delegateAnchor(95, ["storm"]) : mainRecord(n)),
    ...Array.from({ length: 550 }, (_, n) => subRecord("storm", n)),
  ];
  const { sessions, id } = await boot(t, arrival);
  const state = sessions.snapshot(id, { epoch: "inst", includeSeq: true });
  assert.equal(state.messages.length, 650, "整段历史一次下发，不裁窗口");
  assert.deepEqual(mainIds(state), Array.from({ length: 100 }, (_, n) => `m${n}`), "主轴 100 条一条不少且保序");
  assert.equal(state.messages.at(-1).entryId, "m99", "最后一条主消息仍在末尾");
  // 子记录整组紧跟锚点 m95，不散落也不跑到主轴末尾之后。
  const first = entryIds(state).indexOf("s-storm-0");
  const last = entryIds(state).indexOf("s-storm-549");
  assert.equal(entryIds(state)[first - 1], "m95", "子记录组起点紧跟委派锚点");
  assert.equal(last - first, 549, "子记录组连续");
  assert.equal(entryIds(state)[last + 1], "m96", "组后接回主轴");
});

test("live 到达序与 JSONL 恢复投影等价：整段历史逐条一致", async t => {
  const arrival = [
    ...Array.from({ length: 6 }, (_, n) => n === 5 ? delegateAnchor(5, ["child"]) : mainRecord(n)),
    ...Array.from({ length: 300 }, (_, n) => subRecord("child", n)),
    ...Array.from({ length: 94 }, (_, n) => mainRecord(n + 6)),
  ];
  const { sessions, id } = await boot(t, arrival);
  const live = sessions.snapshot(id, { epoch: "inst", includeSeq: true });
  assert.equal(live.messages.length, 400);
  assert.equal(live.messages.at(-1).entryId, "m99");

  // 只读分支：同样的记录写进主/子 JSONL，恢复路径投影与 live 一致。
  const root = await mkdtemp(join(tmpdir(), "axiom-projection-readonly-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const writeFile = (name, messages) => {
    const file = join(root, `${name}.jsonl`);
    const lines = [{ type: "session", version: 3, id: name, cwd: root },
      ...messages.map((message, n) => ({ type: "message", id: `${name}-${n}`, parentId: n ? `${name}-${n - 1}` : null, message }))];
    writeFileSync(file, lines.map(JSON.stringify).join("\n"));
    return file;
  };
  const file = writeFile("main", arrival.filter((r) => r.agentId === "main").map((r) => r.message));
  const childFile = writeFile("child", arrival.filter((r) => r.agentId === "child").map((r) => r.message));
  const restored = Object.create(Sessions.prototype);
  const item = { loaded: false, cwd: root, title: "历史", seq: 7 };
  restored.get = () => item;
  restored.goalStore = { load: () => null };
  restored.store = { getSession: () => ({ sessionFile: file, cwd: root, selection: { model: "test/model", levels: ["off"] }, tasks: [{ id: "child", task: "子任务", status: "completed", sessionFile: childFile }] }) };
  const readonly = restored.snapshot("s", { epoch: "instance" });
  const normalize = (list) => list.map((m) => m.messageId.replace(/^main-/, "m").replace(/^child-/, "s-child-"));
  assert.deepEqual(normalize(readonly.messages), normalize(live.messages), "两条路径同构");
});

test("孤儿子记录前置头部且投影幂等", async t => {
  const arrival = [
    ...Array.from({ length: 80 }, (_, n) => mainRecord(n)),
    ...Array.from({ length: 40 }, (_, n) => subRecord("orphan", n)), // 无委派锚点
  ];
  const { sessions, id } = await boot(t, arrival);
  const state = sessions.snapshot(id, { epoch: "inst", includeSeq: true });
  assert.equal(state.messages[0].agentId, "orphan", "孤儿前置，不遮蔽主轴尾部");
  assert.equal(state.messages.at(-1).entryId, "m79");
  assert.deepEqual(mainIds(state), Array.from({ length: 80 }, (_, n) => `m${n}`));
  // 幂等：重复投影结果逐条一致。
  const again = sessions.snapshot(id, { epoch: "inst", includeSeq: true });
  assert.deepEqual(entryIds(again), entryIds(state));
});

test("重试位置按投影换算：live 到达序的 messageCount 归一到锚点顺序", async t => {
  const arrival = [
    ...Array.from({ length: 6 }, (_, n) => n === 5 ? delegateAnchor(5, ["child"]) : mainRecord(n)),
    ...Array.from({ length: 100 }, (_, n) => subRecord("child", n)),
    ...Array.from({ length: 44 }, (_, n) => mainRecord(n + 6)),
  ];
  const { sessions, id } = await boot(t, arrival);
  // 到达序长度 107 时记录的重试：之后紧跟 arrival[106] = m6。
  sessions.get(id).retries.push({ agentId: "main", id: "r-live", messageCount: 107, status: "succeeded" });
  const state = sessions.snapshot(id, { epoch: "inst", includeSeq: true });
  // 投影顺序：[m0..m5, s×100, m6..m49]；m6 的投影下标 106，其后槽位 107。
  const retry = state.retries.find((record) => record.id === "r-live");
  assert.equal(retry.messageCount, 107);
  assert.equal(state.messages[retry.messageCount - 1].entryId, "m6", "重试卡锚在 m6 之后");
});
