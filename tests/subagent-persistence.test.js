import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { Sessions } from "../src/sessions.js";

function factory() {
  const calls = { prompts: [], resumes: 0 };
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const create = async (_, selection) => {
    if (!selection.sessionDir?.endsWith("-tasks")) return {
      config: () => ({ model: "test/one", thinking: "off" }), subscribe: () => () => {},
      prompt: async () => {}, abort: async () => {}, dispose: async () => {},
    };
    await mkdir(selection.sessionDir, { recursive: true });
    const sm = selection.sessionFile ? SessionManager.open(selection.sessionFile)
      : SessionManager.create(selection.cwd, selection.sessionDir);
    let listener, release;
    const append = (role, text, stopReason = "stop") => {
      const message = { role, content: [{ type: "text", text }], timestamp: Date.now(), stopReason };
      const entryId = sm.appendMessage(message);
      listener?.({ type: "agent.message.end", data: { message, entryId } });
    };
    return {
      sessionFile: () => sm.getSessionFile(),
      historyEntries: () => sm.getBranch().filter(e => e.type === "message"),
      resumable: () => sm.buildSessionContext().messages.at(-1)?.stopReason === "aborted",
      subscribe: fn => { listener = fn; return () => { listener = undefined; }; },
      async prompt(text) {
        calls.prompts.push(text);
        append("user", text);
        if (text === "hold") {
          append("assistant", "部分过程", "aborted");
          const waiting = new Promise(resolve => { release = resolve; });
          started();
          await waiting;
        } else append("assistant", "完成");
      },
      async resume() { calls.resumes++; append("assistant", "续跑完成"); },
      result: () => "结果",
      async abort() { release?.(); }, async dispose() {},
    };
  };
  create.catalog = () => [{ key: "test/one" }];
  return { create, calls, ready };
}

test("真实子 JSONL：停机恢复过程且仅续跑未完成任务，缺失历史不重发，删除清理目录", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-child-"));
  const first = factory();
  let sessions = new Sessions(first.create, undefined, join(root, "storage"));
  try {
    const id = await sessions.create(root), item = sessions.get(id);
    item.notificationsPaused = true;
    const [finished] = item.tasks.start(["done"]);
    await item.tasks.jobs.get(finished).done;
    const token = item.tasks.jobs.get(finished).resultId;
    const [pending] = item.tasks.start(["hold"]);
    await first.ready;
    const file = item.tasks.jobs.get(pending).sessionFile;
    assert.ok(existsSync(file));
    assert.equal(item.tasks.jobs.get(pending).historySaved, true);
    await sessions.close();
    const next = factory();
    sessions = new Sessions(next.create, undefined, join(root, "storage"));
    sessions.store.saveTask(id, { id: "ghost", task: "never", status: "running", sessionFile: join(root, "missing.jsonl"), historySaved: true, notified: false });
    sessions.store.saveTask(id, { id: "new-start", task: "fresh", status: "starting", persistenceVersion: 1, notified: false });
    sessions.store.saveTask(id, { id: "old", task: "old", status: "running", notified: false });
    await sessions.load();
    await sessions.ensureLoaded(id);
    const restored = sessions.get(id);
    restored.notificationsPaused = true;
    await Promise.all([...restored.tasks.jobs.values()].map(j => j.done));
    assert.equal(next.calls.resumes, 1);
    assert.deepEqual(next.calls.prompts, ["fresh"]);
    assert.equal(restored.tasks.jobs.get(pending).sessionFile, file);
    assert.equal(restored.tasks.jobs.get(pending).status, "completed");
    assert.equal(restored.tasks.jobs.get(finished).resultId, token);
    assert.equal(restored.tasks.jobs.get("ghost").status, "failed");
    assert.equal(restored.tasks.jobs.get("old").status, "cancelled");
    assert.ok(restored.messages.some(e => e.agentId === pending && e.entryId && e.message.content[0].text === "部分过程"));
    const messages = SessionManager.open(file).getBranch().filter(e => e.type === "message");
    assert.equal(messages.filter(e => e.message.role === "user").length, 1);
    const dir = join(restored.storageDir, `${id}-tasks`);
    await sessions.remove(id);
    assert.equal(existsSync(dir), false);
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});

test("用户取消不自动恢复；手动重试同 ID、保留旧执行凭证", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-child-retry-"));
  const first = factory();
  let sessions = new Sessions(first.create, undefined, join(root, "storage"));
  try {
    const id = await sessions.create(root), item = sessions.get(id);
    item.notificationsPaused = true;
    const [taskId] = item.tasks.start(["hold"]);
    await first.ready;
    await item.tasks.cancel();
    const oldToken = item.tasks.jobs.get(taskId).resultId;
    await sessions.close();
    const next = factory();
    sessions = new Sessions(next.create, undefined, join(root, "storage"));
    await sessions.load();
    await sessions.ensureLoaded(id);
    const restored = sessions.get(id);
    restored.notificationsPaused = true;
    assert.equal(restored.tasks.jobs.get(taskId).status, "cancelled");
    assert.equal(next.calls.resumes, 0);
    await sessions.retryTask(id, taskId);
    await restored.tasks.jobs.get(taskId).done;
    assert.equal(next.calls.resumes, 1);
    assert.deepEqual(next.calls.prompts, []);
    assert.notEqual(restored.tasks.jobs.get(taskId).resultId, oldToken);
    assert.equal(restored.tasks.read(taskId, oldToken).status, "cancelled");
    assert.equal(restored.tasks.jobs.get(taskId).status, "completed");
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});
