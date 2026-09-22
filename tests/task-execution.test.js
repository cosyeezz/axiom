import test from "node:test";
import assert from "node:assert/strict";
import { Tasks } from "../src/tasks.js";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) { for (let i = 0; i < 100 && !check(); i++) await delay(2); assert.ok(check()); }
function setup(options = {}, overrides = {}) {
  const events = [], results = [], calls = []; let finish;
  const agent = {
    subscribe: () => () => {}, runtime: () => ({}), sessionFile: () => "retained.jsonl",
    prompt: async text => { calls.push(["prompt", text]); await new Promise(resolve => { finish = resolve; }); },
    result: () => "partial", historyEntries: () => [], resumable: () => true,
    enqueue: async (...args) => { calls.push(["enqueue", ...args]); },
    abort: async () => { calls.push(["abort"]); finish?.(); },
    summarize: async text => { calls.push(["summary", text]); return "summary result"; },
    dispose: async () => { calls.push(["dispose"]); }, ...overrides,
  };
  const tasks = new Tasks(async () => agent, event => events.push(event), async job => results.push(tasks.read(job.id, job.resultId)),
    { workMs: 1000, wrapUpMs: 1000, summaryMs: 20, cleanupMs: 20, ...options });
  const [id] = tasks.start(["work"]); const job = tasks.jobs.get(id);
  return { tasks, job, id, events, results, calls, agent };
}
test("all stop sources use abort, bounded summary and exactly one delivery", async () => {
  for (const source of ["user", "agent", "budget"]) {
    const f = setup(); await until(() => f.calls.some(c => c[0] === "prompt"));
    await Promise.all([f.tasks.cancelTask(f.id, { source, reason: "scope changed" }), f.tasks.cancelTask(f.id)]);
    assert.equal(f.job.status, "cancelled"); assert.equal(f.results.length, 1);
    assert.equal(f.calls.filter(c => c[0] === "summary").length, 1);
    assert.equal(f.job.stop.source, source); assert.match(f.job.text, /summary result/);
    assert.equal(f.job.cleanupStatus, "stopped");
    await f.tasks.cancelTask(f.id); assert.equal(f.results.length, 1);
  }
});
test("queued append waits for final notification and cancellation returns the stopped execution", async () => {
  let finishSummary;
  const f = setup({}, { summarize: () => new Promise(resolve => { finishSummary = resolve; }) });
  await until(() => f.calls.length > 0);
  const cancellation = f.tasks.cancelTask(f.id, { source: "user" });
  await until(() => !!finishSummary);
  await f.tasks.append(f.id, "explicit new question during summary");
  finishSummary("summary");
  assert.equal((await cancellation).status, "cancelled");
  await delay(5);
  assert.equal(f.job.status, "cancelled");
  const oldResult = f.job.resultId;
  f.job.notified = true; f.tasks.resumeQueued(f.job);
  await until(() => f.calls.filter(call => call[0] === "prompt").length === 2);
  assert.equal(f.tasks.read(f.id, oldResult).status, "cancelled");
  await f.tasks.cancelTask(f.id, { mode: "immediate" });
});
test("starting cancellation confirms delayed cleanup; interrupt does not hang on factory", async () => {
  let create; let disposed = false;
  const tasks = new Tasks(() => new Promise(resolve => { create = resolve; }), () => {}, async () => {}, { cleanupMs: 10 });
  const [id] = tasks.start(["work"]); await until(() => !!create);
  await tasks.cancelTask(id);
  assert.equal(tasks.jobs.get(id).cleanupStatus, "unconfirmed");
  create({ abort: async () => {}, dispose: async () => { disposed = true; } });
  await until(() => disposed && tasks.jobs.get(id).cleanupStatus === "stopped");
  const stuck = new Tasks(() => new Promise(() => {}), () => {});
  const [other] = stuck.start(["work"]);
  await stuck.interrupt();
  assert.equal(stuck.jobs.get(other).status, "starting");
  assert.equal(stuck.jobs.get(other).resultId, undefined);
});
test("old unread result remains a pending notification after explicit terminal append", async () => {
  const f = setup(); await until(() => f.calls.length > 0);
  await f.tasks.cancelTask(f.id, { mode: "immediate" });
  const resultId = f.job.resultId;
  await f.tasks.append(f.id, "next scope");
  assert.ok(f.tasks.pendingNotifications().some(result => result.resultId === resultId));
  await f.tasks.cancelTask(f.id, { mode: "immediate" });
});
test("immediate stop delivers a factual report without model summary", async () => {
  const f = setup(); await until(() => f.calls.length > 0);
  await f.tasks.cancelTask(f.id, { mode: "immediate" });
  assert.equal(f.calls.some(c => c[0] === "summary"), false);
  assert.match(f.job.text, /停止不等于回滚/); assert.equal(f.results.length, 1);
});
test("external deadline stops a blocked operation after soft wrap-up", async () => {
  const f = setup({ workMs: 15, wrapUpMs: 15 });
  await f.job.done;
  assert.ok(f.events.some(e => e.data.status === "wrapping"));
  assert.equal(f.job.stop.source, "budget"); assert.equal(f.results.length, 1);
});
test("summary timeout returns system report rather than hanging", async () => {
  const f = setup({}, { summarize: () => new Promise(() => {}) }); await until(() => f.calls.length > 0);
  await f.tasks.cancelTask(f.id); assert.match(f.job.text, /总结超过时限/);
  assert.equal(f.results.length, 1);
});
test("unconfirmed tool cleanup never starts model summary or claims it stopped", async () => {
  const f = setup({}, { abort: () => new Promise(() => {}) }); await until(() => f.calls.length > 0);
  await f.tasks.cancelTask(f.id);
  assert.equal(f.job.cleanupStatus, "unconfirmed"); assert.equal(f.calls.some(c => c[0] === "summary"), false);
  await assert.rejects(f.tasks.append(f.id, "new scope"), /停止未确认/);
});
test("terminal append starts a distinct execution, preserving the previous result credential", async () => {
  const f = setup(); await until(() => f.calls.length > 0);
  await f.tasks.cancelTask(f.id, { mode: "immediate" });
  const { executionId, resultId } = f.job;
  await f.tasks.append(f.id, "only verify the gap");
  assert.notEqual(f.job.executionId, executionId);
  assert.equal(f.tasks.read(f.id, resultId).status, "cancelled");
  await until(() => f.calls.filter(c => c[0] === "prompt").length === 2);
  assert.match(f.calls.filter(c => c[0] === "prompt")[1][1], /only verify the gap/);
  await f.tasks.cancelTask(f.id, { mode: "immediate" }); assert.equal(f.results.length, 2);
});
