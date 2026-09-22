import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Sessions } from "../src/sessions.js";

// 安全点（revert / continueFromPoint / fork）与 Todo 控制的集成回归：
// fixture 沿用 goal-sessions.test.js 的 fake agent + SQLite 临时库模式，
// 并补上 sessions.revert/fork/continueFromPoint 依赖的 SDK 安全点桩
// （revertTo / forkAt / navigationState / historyEntries / compactions / queue）。

function factoryFixture() {
  const mains = [], children = [];
  const factory = async (tools, options = {}) => {
    let finish;
    const agent = {
      calls: [], tools, options, entries: [], reverted: null, forkFile: null,
      checkpoints: [], aborts: 0, resultText: "done", pauseRequested: false,
      activeTools: new Set(tools.map((tool) => tool.name).filter((name) => !(options.inactiveTools ?? []).includes(name))),
      enableTools(names) { for (const name of names) agent.activeTools.add(name); },
      disableTools(names) { for (const name of names) agent.activeTools.delete(name); },
      config: () => ({ model: "test/model" }),
      subscribe(listener) { agent.listener = listener; return () => {}; },
      prompt(text) {
        this.calls.push(text);
        agent.listener?.({ type: "agent.message.end", data: { message: { role: "user", content: text } } });
        return new Promise((resolve) => { finish = resolve; });
      },
      // —— 安全点桩：只截断内存态，验证 Sessions 层的 Todo 接线 ——
      historyEntries: () => agent.entries,
      compactions: () => [],
      queue: () => ({ steering: [], followUp: [] }),
      navigationState: () => agent.reverted,
      revertTo: async (entryId) => {
        agent.reverted = { entryId, draft: null };
        const index = agent.entries.findIndex((entry) => entry.id === entryId);
        agent.entries = index >= 0 ? agent.entries.slice(0, index + 1) : [];
        return agent.reverted;
      },
      continueFromPoint: () => agent.prompt("[continue] 从安全点继续"),
      forkAt: async () => ({ sessionFile: agent.forkFile, draft: null }),
      enqueue() { throw new Error("system notifications must not enter withdrawable queues"); },
      result: () => agent.resultText,
      dispose: async () => {},
      finish: () => finish?.(),
      abort: async () => { agent.aborts += 1; finish?.(); },
      requestPause() { agent.pauseRequested = true; },
      requestSafeStop() { agent.safeStopRequested = true; },
      checkpoint: async (summary) => { agent.checkpoints.push(summary); },
      resumable: () => false,
      canReask: () => false,
    };
    (tools.length ? mains : children).push(agent);
    return agent;
  };
  factory.catalog = () => [{ key: "test/model" }];
  return { factory, mains, children };
}

const tick = () => new Promise(setImmediate);
async function until(check, label = "condition") {
  for (let i = 0; i < 500; i++) { if (check()) return; await new Promise((resolve) => setTimeout(resolve, 2)); }
  assert.fail(`${label} deadline exceeded`);
}

async function ordinary(sessions, id, text = "普通输入") {
  await sessions.prompt(id, text);
  await tick();
  sessions.get(id).agent.finish();
  await sessions.get(id).work;
  await until(() => sessions.get(id).status === "idle", "idle");
}

test("revert 显式暂停 Todo：清单保留，continueFromPoint 不解冻，只有显式 resume 恢复", async () => {
  const { factory, mains } = factoryFixture();
  const sessions = new Sessions(factory);
  try {
    const id = await sessions.create();
    const item = sessions.get(id);
    await ordinary(sessions, id);
    const agent = mains[0];
    item.todo.update({ baseVersion: 0, ops: [{ op: "add", id: "a", title: "事项" }] });
    agent.entries = [
      { id: "u1", type: "message", message: { role: "user", content: "普通输入" } },
      { id: "a1", type: "message", message: { role: "assistant", content: "回复" } },
    ];
    item.messages.push(
      { agentId: "main", message: { role: "user", content: "普通输入" }, entryId: "u1" },
      { agentId: "main", message: { role: "assistant", content: "回复" }, entryId: "a1" },
    );

    const point = await sessions.revert(id, "u1");
    assert.equal(point.entryId, "u1");
    const snapshot = item.todo.snapshot();
    assert.equal(snapshot.mode, "paused", "回退后必须显式暂停 Todo");
    assert.equal(snapshot.reason, "会话已回退，请核对后恢复");
    assert.deepEqual(snapshot.items.map((entry) => entry.id), ["a"], "回退保留 SQLite 清单内容");
    assert.equal(item.notificationsPaused, true, "回退冻结通知投递");
    assert.equal(item.goalExited, true, "回退不得让任务通知自动拉起会话");

    // continueFromPoint 只恢复对话续跑，不是 Todo 的恢复入口。
    await sessions.continueFromPoint(id);
    assert.equal(item.status, "running");
    agent.finish();
    await item.work;
    await until(() => item.status === "idle", "continue idle");
    const after = item.todo.snapshot();
    assert.equal(after.mode, "paused", "continueFromPoint 不得解冻 Todo");
    assert.equal(after.reason, "会话已回退，请核对后恢复");
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(item.todo.snapshot().mode, "paused", "续跑结束后也不得自动推进");
    assert.ok(!agent.calls.some((call) => call.includes("[Axiom Todo 继续执行]")), "continue 不得唤醒 Todo");

    // 对照：显式 resume 才是唯一解冻入口。
    await sessions.todoAction(id, "resume");
    assert.equal(item.todo.snapshot().mode, "enabled");
    await until(() => agent.calls.some((call) => call.includes("[Axiom Todo 继续执行]")), "resume wake");
    agent.finish();
    await item.work;
    await until(() => item.status === "idle", "wake idle");
    await sessions.todoAction(id, "pause");
  } finally { await sessions.close(); }
});

test("fork 新会话不继承 Todo：SQLite 无行、快照为空，源会话清单原样保留", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-todo-fork-"));
  const { factory, mains } = factoryFixture();
  const sessions = new Sessions(factory, undefined, join(root, "storage"));
  try {
    const id = await sessions.create(root);
    const item = sessions.get(id);
    await ordinary(sessions, id);
    item.todo.update({ baseVersion: 0, ops: [{ op: "add", id: "a", title: "源会话事项" }] });
    const agent = mains[0];
    agent.entries = [
      { id: "u1", type: "message", message: { role: "user", content: "普通输入" } },
      { id: "a1", type: "message", message: { role: "assistant", content: "回复" } },
    ];
    const forkFile = join(root, "fork.jsonl");
    await writeFile(forkFile, `${JSON.stringify({ type: "session", version: 3, id: "fork" })}\n`);
    agent.forkFile = forkFile;

    const forked = await sessions.fork(id, "u1");
    assert.notEqual(forked.sessionId, id);
    assert.equal(forked.draft, null);

    const fresh = sessions.get(forked.sessionId).todo.snapshot();
    assert.deepEqual(fresh.items, [], "分叉会话清单必须为空");
    assert.equal(fresh.mode, "completed");
    assert.equal(sessions.todoStore.load(forked.sessionId), null, "分叉会话在 SQLite 不得有 Todo 行");

    const source = item.todo.snapshot();
    assert.deepEqual(source.items.map((entry) => entry.id), ["a"], "分叉不得改动源会话清单");
    assert.equal(source.mode, "enabled");
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});
