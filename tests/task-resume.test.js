import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Tasks } from "../src/tasks.js";

// 仿 pi 代理接口：sessionFile/historyEntries/resumable/resume/result/abort/dispose。
function fakeAgent(options = {}) {
  const agent = {
    promptTexts: [], resumed: 0, disposed: 0, history: options.history ?? [],
    listener: undefined,
    subscribe(listener) { agent.listener = listener; return () => { agent.listener = null; }; },
    emitEvent(event) { agent.listener?.(event); },
    sessionFile: () => options.sessionFile ?? null,
    historyEntries: () => agent.history,
    resumable: () => options.resumable ?? false,
    resume: async () => { agent.resumed++; },
    prompt: options.hang
      ? () => new Promise((_, reject) => { agent.fail = () => reject(new Error("aborted")); })
      : async (text) => {
        agent.promptTexts.push(text);
        if (options.sessionFile) writeFileSync(options.sessionFile, "{}"); // 首条消息落盘
        agent.emitEvent({ type: "agent.message.end", message: { role: "assistant", content: [] } });
      },
    result: options.result
      ? options.result
      : () => { throw new Error("result() 不应在恢复完成历史时被调用"); },
    abort: async () => agent.fail?.(),
    dispose: () => { agent.disposed++; },
    enqueue: async () => {},
  };
  return agent;
}

function fixture(agentFor) {
  const events = [], notifications = [], agents = [];
  const tasks = new Tasks((job) => {
    const agent = agentFor(job);
    agents.push(agent);
    return agent;
  }, (event) => events.push(event), async (job) => notifications.push({ taskId: job.id, resultId: job.resultId }));
  return { tasks, events, notifications, agents };
}

const restored = (overrides = {}) => ({
  id: "t1", task: "a", status: "cancelled", error: "服务已重启，子任务已停止",
  parentContext: "", persistenceVersion: 1, sessionFile: null, historySaved: false,
  resultId: "old-result", notified: false, createdAt: 1, updatedAt: 2, ...overrides,
});

test("snapshotJob persists sessionFile/historySaved/persistenceVersion before prompt", async () => {
  const dir = mkdtempSync(join(tmpdir(), "axiom-tasks-"));
  try {
    const file = join(dir, "s.jsonl");
    const { tasks, events } = fixture(() => fakeAgent({ sessionFile: file, result: () => "ok" }));
    const [id] = tasks.start(["a"]);
    await tasks.jobs.get(id).done;
    // prompt 前的首次发布就已带 sessionFile（意图路径，落盘前可恢复重建）。
    const first = events.find((event) => event.type === "task.state" && event.data.status === "running");
    assert.equal(first.saved.sessionFile, file);
    const saved = tasks.snapshotJob(tasks.jobs.get(id));
    assert.equal(saved.persistenceVersion, 1);
    assert.equal(saved.sessionFile, file);
    assert.equal(saved.historySaved, true, "agent.message.end 落盘后 historySaved 置真");
    assert.equal(saved.canRetry, false, "completed 任务不提供重试");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("run(job,true) resumes via agent.resume when history exists and resumable", async () => {
  const history = [
    { message: { role: "user", content: [{ type: "text", text: "task" }] } },
    { message: { role: "assistant", stopReason: "aborted", content: [{ type: "text", text: "半截" }] } },
  ];
  const { tasks, agents } = fixture(() => fakeAgent({ history, resumable: true, result: () => "续跑完成" }));
  tasks.jobs.set("t1", restored({ sessionFile: "s.jsonl", historySaved: true }));
  assert.equal(tasks.retry("t1"), "t1", "retry 保持同一 taskId");
  await tasks.jobs.get("t1").done;
  assert.equal(tasks.jobs.get("t1").status, "completed");
  assert.equal(agents[0].resumed, 1);
  assert.equal(tasks.jobs.get("t1").text, "续跑完成", "resume 后经 result() 取结果");
  assert.throws(() => tasks.read("t1", "old-result"), /不要轮询/, "旧 resultId 已作废");
});

test("history already finished: reuse last assistant text, no resume/prompt/result", async () => {
  const history = [
    { message: { role: "user", content: [{ type: "text", text: "task" }] } },
    { message: { role: "assistant", stopReason: "stop",
      content: [{ type: "text", text: "中断前已完成的答案" }] } },
  ];
  const { tasks, agents } = fixture(() => fakeAgent({ history, resumable: false }));
  tasks.jobs.set("t1", restored({ sessionFile: "s.jsonl", historySaved: true }));
  tasks.retry("t1");
  await tasks.jobs.get("t1").done;
  assert.equal(tasks.jobs.get("t1").status, "completed");
  assert.equal(tasks.jobs.get("t1").text, "中断前已完成的答案");
  assert.equal(agents[0].resumed, 0);
  assert.deepEqual(agents[0].promptTexts, []);
});

test("retry guards active/completed/cancelling and offers no fake retry for old tasks", async () => {
  const { tasks, agents } = fixture(() => fakeAgent({ result: () => "ok" }));
  const [id] = tasks.start(["a"]);
  assert.throws(() => tasks.retry(id), /仍在运行/, "active 不可重试");
  await tasks.jobs.get(id).done;
  assert.throws(() => tasks.retry(id), /已成功完成/, "completed 不可重试");
  // 旧版恢复任务：无 sessionFile/historySaved/persistenceVersion → 不给假重试入口。
  tasks.jobs.set("old", restored({ persistenceVersion: undefined, resultId: "r" }));
  assert.equal(tasks.view(tasks.jobs.get("old")).canRetry, false);
  assert.throws(() => tasks.retry("old"), /没有可恢复的会话历史/);
  assert.equal(agents.length, 1, "拒绝路径不创建代理");
  const pending = tasks.cancel();
  assert.throws(() => tasks.retry(id), /正在取消/, "cancelling 期间不可重试");
  await pending;
});

test("retry clears error/cancel flags, invalidates old result and notifies again", async () => {
  const dir = mkdtempSync(join(tmpdir(), "axiom-tasks-"));
  try {
    let calls = 0;
    const file = join(dir, "s.jsonl");
    const { tasks, notifications } = fixture(() => fakeAgent({
      sessionFile: file,
      result: () => { calls++; if (calls === 1) throw new Error("boom"); return "fixed"; },
    }));
    const [id] = tasks.start(["a"]);
    await tasks.jobs.get(id).done;
    const job = tasks.jobs.get(id);
    assert.equal(job.status, "failed");
    assert.equal(tasks.view(job).canRetry, true, "历史已落盘的失败任务可重试");
    const oldResultId = job.resultId;
    tasks.retry(id);
    assert.equal(job.error, undefined, "error 已清除");
    assert.equal(job.notified, false);
    await job.done;
    assert.equal(job.status, "completed");
    assert.notEqual(job.resultId, oldResultId);
    assert.equal(notifications.length, 2, "重试完成后再次通知");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("interrupt aborts active jobs, keeps restartable state, disables notification", async () => {
  const dir = mkdtempSync(join(tmpdir(), "axiom-tasks-"));
  try {
    const file = join(dir, "s.jsonl");
    writeFileSync(file, "{}"); // 历史已落盘
    const { tasks, events, notifications, agents } = fixture(() => fakeAgent({ sessionFile: file, hang: true }));
    const [id] = tasks.start(["a"]);
    const job = tasks.jobs.get(id);
    await new Promise(setImmediate);
    job.historySaved = true; // 模拟消息已落盘
    await tasks.interrupt();
    assert.equal(job.status, "starting", "中断回到 starting，不等同 cancelled");
    assert.equal(job.resultId, undefined, "不产生 resultId");
    assert.equal(job.notified, false);
    assert.equal(notifications.length, 0, "不发完成通知");
    assert.equal(tasks.view(job).canRetry, true, "已落盘历史可重启续跑");
    const saved = events.filter((event) => event.type === "task.state").at(-1).saved;
    assert.equal(saved.sessionFile, file);
    assert.equal(agents[0].disposed, 1);
    // 重启恢复路径：retry → 有历史 + resumable → resume 续跑。
    const resumed = fakeAgent({ sessionFile: file, history: [
      { message: { role: "assistant", stopReason: "aborted", content: [] } },
    ], resumable: true, result: () => "重启后续跑完成" });
    tasks.createAgent = async () => resumed;
    tasks.retry(id);
    await job.done;
    assert.equal(job.status, "completed");
    assert.equal(job.text, "重启后续跑完成");
    assert.equal(resumed.resumed, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("run(job,true) with no history sends original prompt (new starting crash window)", async () => {
  const { tasks, agents } = fixture(() => fakeAgent({ result: () => "ok" }));
  const job = restored({ status: "starting", resultId: undefined }); // 崩溃窗口：createAgent 未完成
  tasks.jobs.set(job.id, job);
  await tasks.run(job, true);
  assert.equal(job.status, "completed");
  assert.equal(agents[0].promptTexts[0], "a", "无 context 时原始任务直发，不包 wrapper");
});
