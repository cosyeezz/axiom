import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Sessions } from "../src/sessions.js";
import { Database } from "../src/database.js";

const factory = async () => ({
  config: () => ({ model: "test/one", thinking: "off" }),
  subscribe: () => () => {}, prompt: async () => {}, result: () => "ok",
  abort: async () => {}, dispose: async () => {},
});
factory.catalog = () => [{ key: "test/one" }];

test("摘要按条保存；改标题和通知标志不重写历史任务，原始消息不入库", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-persist-"));
  const sessions = new Sessions(factory, undefined, join(root, "storage"));
  try {
    const id = await sessions.create(root);
    const item = sessions.get(id);
    await sessions.persist(item, { task: { id: "child", task: "test", status: "completed", notified: true,
      text: "result".repeat(10000), runtime: { systemPrompt: "system".repeat(10000) } } });
    const task = sessions.store.listTasks(id)[0];
    // 如新增摘要/改标题意外走单任务保存，测试立即失败，不靠运行速度碰运气。
    const saveTask = sessions.store.saveTask;
    sessions.store.saveTask = () => assert.fail("没有任务变更，不应更新任务");
    for (let n = 0; n < 50; n++) {
      const summary = { id: `s${n}`, agentId: "main", turn: n, text: `事实${n}`, timestamp: n };
      item.summaries.push(summary);
      await sessions.persist(item, { summary });
    }
    await sessions.rename(id, "新标题");
    assert.equal(sessions.store.listSummaries(id).length, 50);
    assert.equal(sessions.store.listSummaries(id).at(-1).text, "事实49");
    assert.deepEqual(sessions.store.listTasks(id)[0], task);
    sessions.store.saveTask = saveTask;
    await sessions.persist(item, { task: { id: "child", notified: false } });
    assert.deepEqual(sessions.store.listTasks(id)[0], { ...task, notified: false });
    assert.equal("messages" in sessions.store.getSession(id), false);
    assert.equal(sessions.database.get("sessions", id), undefined, "不双写旧KV");
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});

test("真实数据库拒绝写入时旧记录完整，解除错误后能重试", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-persist-fail-"));
  const sessions = new Sessions(factory, undefined, join(root, "storage"));
  try {
    const id = await sessions.create(root);
    const item = sessions.get(id);
    const summary = { id: "s1", agentId: "main", text: "第一版", timestamp: 1 };
    await sessions.persist(item, { summary });
    sessions.database.exec("PRAGMA query_only = ON");
    await assert.rejects(sessions.persist(item, { summary: { ...summary, text: "失败版" } }), /readonly/i);
    assert.equal(sessions.store.listSummaries(id)[0].text, "第一版");
    sessions.database.exec("PRAGMA query_only = OFF");
    await sessions.persist(item, { summary: { ...summary, text: "第二版" } });
    assert.equal(sessions.store.listSummaries(id)[0].text, "第二版");
    sessions.database.exec("PRAGMA query_only = ON");
    sessions.saveChange(item, { summary: { id: "retry-on-next-save", text: "暂时失败也不丢" } });
    await new Promise(setImmediate);
    sessions.database.exec("PRAGMA query_only = OFF");
    await sessions.rename(id, "重试未成功的增量");
    assert.equal(sessions.store.listSummaries(id)[1].text, "暂时失败也不丢");
  } finally {
    sessions.database.exec("PRAGMA query_only = OFF");
    await sessions.close(); await rm(root, { recursive: true, force: true });
  }
});

test("同一变更后半段写失败时全体不落盘，关闭重试整个增量", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-persist-atomic-"));
  const database = new Database(join(root, "shared.db"));
  const sessions = new Sessions(factory, undefined, undefined, database);
  try {
    const id = await sessions.create(root);
    const item = sessions.get(id);
    const saveEvent = sessions.store.saveEvent;
    sessions.store.saveEvent = () => { throw new Error("injected event failure"); };
    await assert.rejects(sessions.persist(item, {
      summary: { id: "summary", agentId: "main", text: "不能只写一半" },
      event: { type: "summary_trigger", record: { id: "trigger", agentId: "main" } },
    }), /injected/);
    assert.equal(sessions.store.listSummaries(id).length, 0);
    sessions.store.saveEvent = saveEvent;
    await sessions.close();
    assert.equal(sessions.store.getSession(id).summaries.length, 1);
    assert.equal(sessions.store.getSession(id).summaryTriggers.length, 1);
  } finally { await sessions.close(); database.close(); await rm(root, { recursive: true, force: true }); }
});

test("无库实例保持纯内存，外部注入库不被Sessions关闭", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-persist-mem-"));
  const database = new Database(join(root, "shared.db"));
  const memory = new Sessions(factory);
  const shared = new Sessions(factory, undefined, undefined, database);
  try {
    const id = await memory.create(root);
    await memory.persist(memory.get(id));
    assert.equal(memory.database, null);
    const sharedId = await shared.create(root);
    assert.equal(shared.store.hasSession(sharedId), true);
    await shared.close();
    assert.equal(shared.store.hasSession(sharedId), true);
    await shared.load();
    assert.equal(shared.get(sharedId).loaded, false, "只注入数据库也能列出元数据，不依赖文件目录");
  } finally { await memory.close(); await shared.close(); database.close(); await rm(root, { recursive: true, force: true }); }
});

test("新会话落库失败释放SDK且不留下幽灵会话", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-create-fail-"));
  let disposed = 0, unsubscribed = 0, brokenHistory = false;
  const failing = async () => ({ ...await factory(),
    historyEntries: () => { if (brokenHistory) throw new Error("history failed"); return []; },
    subscribe: () => () => { unsubscribed++; }, dispose: async () => { disposed++; } });
  failing.catalog = factory.catalog;
  const sessions = new Sessions(failing, undefined, join(root, "storage"));
  try {
    sessions.database.exec("PRAGMA query_only = ON");
    await assert.rejects(sessions.create(root), /readonly/i);
    assert.equal(disposed, 1);
    assert.equal(unsubscribed, 1);
    assert.equal(sessions.list().length, 0);
    assert.equal(sessions.store.listSessions().length, 0);
    sessions.database.exec("PRAGMA query_only = OFF");
    brokenHistory = true;
    await assert.rejects(sessions.create(root), /history failed/);
    assert.equal(disposed, 2, "历史装配失败也释放已创建SDK");
    assert.equal(sessions.list().length, 0);
  } finally {
    sessions.database.exec("PRAGMA query_only = OFF");
    await sessions.close(); await rm(root, { recursive: true, force: true });
  }
});

test("未加载会话改名失败，打开或关闭仍重试未落盘修改", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-lazy-retry-"));
  let sessions = new Sessions(factory, undefined, join(root, "storage"));
  try {
    const opened = await sessions.create(root), closed = await sessions.create(root);
    await sessions.close();
    sessions = new Sessions(factory, undefined, join(root, "storage"));
    await sessions.load();
    sessions.database.exec("PRAGMA query_only = ON");
    await assert.rejects(sessions.rename(opened, "打开前重试"), /readonly/i);
    await assert.rejects(sessions.rename(closed, "关闭前重试"), /readonly/i);
    sessions.database.exec("PRAGMA query_only = OFF");
    await sessions.ensureLoaded(opened);
    assert.equal(sessions.get(opened).title, "打开前重试");
    await sessions.close();
    sessions = new Sessions(factory, undefined, join(root, "storage"));
    await sessions.load();
    assert.equal(sessions.get(closed).title, "关闭前重试");
  } finally {
    sessions.database?.exec("PRAGMA query_only = OFF");
    await sessions.close(); await rm(root, { recursive: true, force: true });
  }
});

test("重启只读元数据；列表改名不建SDK，并发打开只恢复一次", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-lazy-"));
  let created = 0;
  const counted = async (...args) => { created++; await new Promise(setImmediate); return factory(...args); };
  counted.catalog = factory.catalog;
  let sessions = new Sessions(counted, undefined, join(root, "storage"));
  try {
    const id = await sessions.create(root);
    const untouched = await sessions.create(root);
    await sessions.close();
    created = 0;
    sessions = new Sessions(counted, undefined, join(root, "storage"));
    await sessions.load();
    assert.equal(created, 0);
    await sessions.rename(id, "未打开也能改名");
    assert.equal(created, 0);
    assert.equal(sessions.list().find(s => s.id === id).title, "未打开也能改名");
    const [one, two] = await Promise.all([
      sessions.ensureLoaded(id), sessions.ensureLoaded(id), sessions.rename(id, "加载中改名不丢"),
    ]);
    assert.equal(one, two);
    assert.equal(created, 1);
    assert.equal(sessions.snapshot(id).title, "加载中改名不丢");
    assert.equal(sessions.store.getSession(id).title, "加载中改名不丢");
    await sessions.remove(untouched);
    assert.equal(created, 1, "删除未打开会话不创建SDK");
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});
