import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { Sessions } from "../src/sessions.js";
import { sessionBilling, combinedBilling } from "../src/session-billing.js";

const usage = { input: 100, output: 20, cacheRead: 50, cacheWrite: 10,
  cost: { input: .1, output: .2, cacheRead: .01, cacheWrite: .02, total: .33 } };
const billed = role => ({ type: "message", message: { role, provider: "p", model: "m", usage } });

test("总账按模型归并、缺账可见、重复计算不累加且不改写源账", () => {
  const main = sessionBilling([billed("assistant"), billed("user"), { type: "compaction", usage }]);
  const child = sessionBilling([billed("assistant"), billed("toolResult"), billed("user")]);
  const tasks = [{ id: "t1", task: "研究", runtime: { billing: child } }, { id: "t2" }];
  const before = structuredClone({ main, tasks });
  const ledger = combinedBilling(main, tasks);
  assert.equal(ledger.records, 4);
  assert.ok(Math.abs(ledger.cost.total - 1.32) < 1e-9);
  assert.equal(ledger.groups.length, 3);
  assert.equal(ledger.groups.find(g => g.model === "p/m").tokens.input, 200);
  assert.equal(ledger.incomplete, true);
  assert.deepEqual(ledger.agents.map(a => a.id), ["main", "t1", "t2"]);
  assert.equal(ledger.agents.at(-1).billing, null);
  assert.deepEqual(combinedBilling(main, tasks), ledger);
  assert.deepEqual({ main, tasks }, before);
  assert.equal(combinedBilling(null).incomplete, true);
});

function factory() {
  const calls = { prompts: [], resumes: 0 };
  const create = async (_, selection) => {
    if (selection.sessionDir) await mkdir(selection.sessionDir, { recursive: true });
    const sm = selection.sessionFile ? SessionManager.open(selection.sessionFile) : SessionManager.create(selection.cwd, selection.sessionDir);
    const modelId = selection.sessionDir?.endsWith("-tasks") ? "one" : "main";
    let listener;
    const append = (role, text) => {
      const message = { role, content: [{ type: "text", text }], timestamp: Date.now(),
        ...(role === "assistant" ? { stopReason: "stop", provider: "test", model: modelId, usage: structuredClone(usage) } : {}) };
      return { message, entryId: sm.appendMessage(message) };
    };
    const runtime = () => ({ model: `test/${modelId}`, billing: sessionBilling(sm.getEntries()) });
    return {
      sessionFile: () => sm.getSessionFile(),
      historyEntries: () => sm.getBranch().filter(e => e.type === "message"), runtime,
      subscribe: fn => { listener = fn; return () => { listener = undefined; }; },
      async prompt(text) {
        calls.prompts.push(text);
        for (const [role, content] of [["user", text], ["assistant", "完成"]]) {
          const entry = append(role, content);
          listener?.({ type: "agent.message.end", data: entry });
        }
        listener?.({ type: "agent.runtime", data: runtime() });
      },
      result: () => "结果", resumable: () => false,
      async resume() { calls.resumes++; }, async abort() {}, async dispose() {},
      config: () => ({ model: "test/one", thinking: "off" }),
    };
  };
  create.catalog = () => [{ key: "test/one" }];
  return { create, calls };
}

test("实时总账包含子任务；冷快照与恢复不漏账；缺失文件保留最后已知账", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-billing-"));
  const first = factory();
  let sessions = new Sessions(first.create, undefined, join(root, "storage"));
  try {
    const id = await sessions.create(root);
    const item = sessions.get(id);
    const events = [];
    sessions.subscribe(id, event => events.push(event));
    await sessions.prompt(id, "汇总"); await item.work;
    item.notificationsPaused = true;
    const [taskId] = item.tasks.start(["整理账单"]);
    await item.tasks.jobs.get(taskId).done;
    await sessions.persist(item, { task: { id: taskId, notified: true } });
    const bills = events.filter(e => e.type === "session.billing");
    assert.ok(bills.length >= 3);
    assert.equal(bills[0].data.records, 1);
    assert.ok(bills.some(e => e.data.agents.some(a => a.id === taskId && !a.billing)));
    assert.ok(bills.every(e => e.sessionId === id));
    for (let i = 1; i < events.length; i++) assert.ok(events[i].seq > events[i - 1].seq);
    const last = bills.at(-1).data;
    assert.equal(last.records, 2);
    assert.ok(Math.abs(last.cost.total - .66) < 1e-9);
    assert.equal(last.incomplete, false);
    assert.deepEqual(last.groups.map(g => g.model).sort(), ["test/main", "test/one"]);
    assert.deepEqual(combinedBilling(item.agent.runtime().billing, [...item.tasks.jobs.values()]), last);
    const taskFile = item.tasks.jobs.get(taskId).sessionFile;
    await sessions.close();
    const next = factory();
    sessions = new Sessions(next.create, undefined, join(root, "storage"));
    await sessions.load();
    // 冷快照：一次全量下发历史，总账不依赖历史条数。
    const cold = sessions.snapshot(id);
    assert.ok(cold.messages.length > 0);
    assert.deepEqual(cold.billing, last);
    await sessions.ensureLoaded(id);
    assert.equal(next.calls.prompts.length, 0);
    assert.equal(next.calls.resumes, 0);
    assert.deepEqual(sessions.snapshot(id).billing, last);
    await sessions.close();
    await rm(taskFile);
    sessions = new Sessions(factory().create, undefined, join(root, "storage"));
    await sessions.load();
    assert.deepEqual(sessions.snapshot(id).billing, last);
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});
