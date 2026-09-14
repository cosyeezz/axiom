import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
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

test("事件按条保存；改标题和通知标志不重写历史任务，原始消息不入库", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-persist-"));
  const sessions = new Sessions(factory, undefined, join(root, "storage"));
  try {
    const id = await sessions.create(root);
    const item = sessions.get(id);
    await sessions.persist(item, { task: { id: "child", task: "test", status: "completed", notified: true,
      text: "result".repeat(10000), runtime: { systemPrompt: "system".repeat(10000) } } });
    const task = sessions.store.listTasks(id)[0];
    // 如新增事件/改标题意外走单任务保存，测试立即失败，不靠运行速度碰运气。
    const saveTask = sessions.store.saveTask;
    sessions.store.saveTask = () => assert.fail("没有任务变更，不应更新任务");
    for (let n = 0; n < 50; n++)
      await sessions.persist(item, { event: { type: "retry", record: { id: `r${n}`, agentId: "main", status: "failed", attempt: n } } });
    await sessions.rename(id, "新标题");
    assert.equal(sessions.store.getSession(id).retries.length, 50);
    assert.equal(sessions.store.getSession(id).retries.at(-1).id, "r49");
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
    const record = { id: "r1", agentId: "main", status: "failed" };
    await sessions.persist(item, { event: { type: "retry", record } });
    sessions.database.exec("PRAGMA query_only = ON");
    await assert.rejects(sessions.persist(item, { event: { type: "retry", record: { ...record, status: "waiting" } } }), /readonly/i);
    assert.equal(sessions.store.getSession(id).retries[0].status, "failed");
    sessions.database.exec("PRAGMA query_only = OFF");
    await sessions.persist(item, { event: { type: "retry", record: { ...record, status: "succeeded" } } });
    assert.equal(sessions.store.getSession(id).retries[0].status, "succeeded");
    sessions.database.exec("PRAGMA query_only = ON");
    sessions.saveChange(item, { event: { type: "retry", record: { id: "r2", agentId: "main", status: "waiting" } } });
    await new Promise(setImmediate);
    sessions.database.exec("PRAGMA query_only = OFF");
    await sessions.rename(id, "重试未成功的增量");
    assert.equal(sessions.store.getSession(id).retries[1].id, "r2");
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
      event: { type: "retry", record: { id: "r1", agentId: "main" } },
      task: { id: "t1", task: "做事", status: "running" },
    }), /injected/);
    assert.equal(sessions.store.listTasks(id).length, 0);
    sessions.store.saveEvent = saveEvent;
    await sessions.close();
    assert.equal(sessions.store.getSession(id).retries.length, 1);
    assert.equal(sessions.store.listTasks(id).length, 1);
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

test("会话重试词表保存并在重启后传给主代理和子代理", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-retry-selection-"));
  const seen = [], retry = { retryable: ["custom transient"], nonRetryable: ["custom denied"] };
  const selected = Object.assign(async (_, selection) => { seen.push(selection); return factory(); }, { catalog: factory.catalog });
  let sessions = new Sessions(selected, undefined, join(root, "storage"));
  try {
    const id = await sessions.create(root, { retry });
    assert.deepEqual(seen.at(-1).retry, retry, "首次主代理也必须接收配置");
    assert.deepEqual(sessions.store.getSession(id).selection.retry, retry);
    await sessions.close();
    sessions = new Sessions(selected, undefined, join(root, "storage"));
    await sessions.load();
    const item = await sessions.ensureLoaded(id);
    assert.deepEqual(item.retry, retry);
    assert.deepEqual(seen.at(-1).retry, retry, "恢复后的主代理使用原词表");
    item.notificationsPaused = true;
    const [taskId] = item.tasks.start(["child"]);
    await item.tasks.jobs.get(taskId).done;
    assert.deepEqual(seen.at(-1).retry, retry, "子代理继承同一会话词表");
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});

test("取消正在恢复但最终失败的会话仍成功，不重建SDK或丢记录", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-cancel-load-"));
  let begin, fail;
  const started = new Promise(resolve => { begin = resolve; });
  const failing = Object.assign(async () => { begin(); await new Promise((_, reject) => { fail = reject; }); },
    { catalog: factory.catalog });
  let sessions = new Sessions(factory, undefined, join(root, "storage"));
  try {
    const id = await sessions.create(root);
    await sessions.close();
    sessions = new Sessions(failing, undefined, join(root, "storage"));
    await sessions.load();
    const opening = assert.rejects(sessions.ensureLoaded(id), /SDK unavailable/);
    await started;
    const cancelling = sessions.cancel(id);
    fail(new Error("SDK unavailable"));
    await Promise.all([opening, cancelling]);
    assert.equal(sessions.get(id).loaded, false);
    assert.equal(sessions.store.hasSession(id), true);
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
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

test("确定性坏增量只重试一次即丢弃并上报，不阻塞此后所有落盘", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-persist-poison-"));
  const sessions = new Sessions(factory, undefined, join(root, "storage"));
  try {
    const id = await sessions.create(root);
    const item = sessions.get(id);
    const errors = [];
    item.listeners.add((event) => { if (event.type === "error") errors.push(event.data.message); });
    // 未知会话字段是确定性失败：重试多少次都不可能成功。
    await assert.rejects(sessions.persist(item, { session: { taskBudgetTypo: 1 } }), /未知会话字段/);
    // 关键：坏增量不得永久占住队头，此后的正常写入必须照常落盘。
    await sessions.rename(id, "坏增量之后仍能落盘");
    assert.equal(sessions.store.getSession(id).title, "坏增量之后仍能落盘");
    assert.equal(item.pendingWrites.length, 0, "队列必须清空，不留永久堵塞项");
    assert.ok(errors.some((message) => /未知会话字段/.test(message)), "丢弃必须上报，不能静默吞掉");
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});

test("JSONL 被外部删除后不把 session_file 写回 NULL，历史缺失守卫仍生效", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-persist-file-"));
  const storage = join(root, "storage");
  const file = join(root, "landed.jsonl");
  const landing = async () => ({ ...(await factory()), sessionFile: () => file, historyEntries: () => [] });
  landing.catalog = factory.catalog;
  let sessions = new Sessions(landing, undefined, storage), restored;
  try {
    const id = await sessions.create(root);
    assert.equal(sessions.store.getSession(id).sessionFile ?? null, null, "前提：文件未落盘时不写路径");
    await writeFile(file, "");
    sessions.get(id).emit({ type: "agent.message.end", data: { message: { role: "assistant", content: [] } } });
    await new Promise(setImmediate);
    assert.equal(sessions.store.getSession(id).sessionFile, file, "前提：落盘后路径入库");
    // 外部清理脚本/同步工具删掉历史文件：库里的路径是「历史丢失」的唯一证据，绝不能被抹平成 NULL。
    await rm(file, { force: true });
    assert.equal(existsSync(file), false);
    await sessions.persist(sessions.get(id));
    assert.equal(sessions.store.getSession(id).sessionFile, file, "全量落盘不得把已落盘路径写回 NULL");
    await sessions.close();
    restored = new Sessions(landing, undefined, storage);
    await restored.load();
    await assert.rejects(restored.ensureLoaded(id), /会话历史文件缺失/, "守卫必须仍然拒绝加载，而不是当新会话静默重建");
  } finally { await restored?.close(); await sessions.close(); await rm(root, { recursive: true, force: true }); }
});

test("自报标题与 titleRequested 同一笔落盘，重启不再重复索要标题", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-persist-title-"));
  const sessions = new Sessions(factory, undefined, join(root, "storage"));
  try {
    const id = await sessions.create(root);
    const item = sessions.get(id);
    // 复现 prompt 注入标题请求后模型自报成功的时刻：内存两个字段都变了，落盘只描述 title。
    item.titleRequested = true;
    item.title = "模型自报标题";
    await sessions.persist(item, { title: true });
    const saved = sessions.store.getSession(id);
    assert.equal(saved.title, "模型自报标题");
    assert.equal(saved.titleRequested, true, "标题写库成功后崩溃，重启不该再要一次标题");
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});

test("运行一开始就落库标题与 updatedAt：跑到一半被杀，侧栏不退回「新会话」与旧时间", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-persist-live-"));
  let release;
  // 首轮请求一直挂着：复现「长任务跑到一半整个进程被杀」的时刻，此时全量快照还没轮到。
  const hanging = async () => ({
    config: () => ({ model: "test/one", thinking: "off" }),
    subscribe: () => () => {}, result: () => "ok",
    prompt: () => new Promise((resolve) => { release = resolve; }),
    abort: async () => {}, dispose: async () => {},
  });
  hanging.catalog = () => [{ key: "test/one" }];
  const sessions = new Sessions(hanging, undefined, join(root, "storage"));
  try {
    const id = await sessions.create(root);
    const created = sessions.store.getSession(id);
    assert.equal(created.title, "新会话");
    await new Promise((resolve) => setTimeout(resolve, 2));
    await sessions.prompt(id, "查一下今天的天气");
    await new Promise(setImmediate);
    const saved = sessions.store.getSession(id);
    assert.equal(saved.title, "查一下今天的天气", "首条输入推导的标题必须随运行开始落库，否则崩溃后每个会话都叫「新会话」");
    assert.ok(saved.updatedAt > created.updatedAt,
      `运行开始就要刷新 updatedAt，否则重启后侧栏把正在干活的会话排到最后：${saved.updatedAt} vs ${created.updatedAt}`);
    // titleRequested 反过来不能提前写：模型还没自报标题，重启必须再索要一次。
    assert.equal(saved.titleRequested, false);
  } finally {
    release?.();
    await sessions.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("跨重启读回：会话元数据、任务、事件三类原样恢复，撤回的事件不复活", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-restart-"));
  const storage = join(root, "storage");
  const childFile = join(root, "child.jsonl");
  // 只有 session 头的合法 JSONL：恢复对账会打开它读历史，读出空历史才不干扰重试归一化。
  await writeFile(childFile, `${JSON.stringify({ type: "session", version: 3, id: "child-hist", timestamp: "2026-01-01T00:00:00.000Z", cwd: root })}\n`);
  const child = { id: "child-1", task: "查资料", status: "completed", text: "done", canRetry: false,
    runtime: { systemPrompt: "子代理系统提示", model: "test/one" },
    parentContext: "[Goal 所属子任务] 总体目标：X",
    historySaved: true, persistenceVersion: 1, sessionFile: childFile,
    resultId: "result-1", notified: true, createdAt: 111, updatedAt: 222 };
  let sessions = new Sessions(factory, undefined, storage);
  try {
    const id = await sessions.create(root, { taskBudget: { maxTurns: 30, wrapUpWindow: 3 } });
    const auto = await sessions.create(root);
    const item = sessions.get(id);
    await sessions.rename(id, "手动改的标题");
    item.titleRequested = true;
    await sessions.persist(item, { title: true });
    // 模拟「运行中崩溃」：未结算的运行段留在库里。
    Object.assign(item, { elapsedMs: 4200, runningSince: 999 });
    await sessions.persist(item, { session: { elapsedMs: 4200, runningSince: 999 } });
    await sessions.persist(item, [
      { task: child },
      { event: { type: "retry", record: { id: "r1", agentId: "main", status: "failed", attempt: 2, error: "boom" } } },
      { event: { type: "retry", record: { id: "r2", agentId: "main", status: "failed", attempt: 1 } } },
      { event: { type: "retry", record: { id: "r2", agentId: "child-1", status: "succeeded", attempt: 1 } } },
      { event: { type: "compaction", record: { id: "c1", summary: "摘要", title: "压缩标题" } } },
    ]);
    // 撤回只删 main/r2；同 id 的子代理兄弟必须留下（身份含 agentId）。
    await sessions.persist(item, { deletedEvents: { type: "retry", records: [{ id: "r2", agentId: "main" }] } });
    await sessions.close();

    // 真正的重启：上面 close() 已关掉库文件，这里重新打开同一个文件。
    sessions = new Sessions(factory, undefined, storage);
    sessions.taskBudget = { maxTurns: 5, wrapUpWindow: 1 };
    await sessions.load();
    const restored = sessions.get(id);
    assert.equal(restored.loaded, false, "前提：任务已通知，启动恢复不该提前加载");
    assert.equal(restored.title, "手动改的标题");
    assert.equal(restored.titleManual, true);
    assert.equal(restored.titleRequested, true, "标题已索要过，重启不该再要一次");
    assert.equal(restored.elapsedMs, 4200);
    assert.equal(restored.runningSince, null, "重启即中断：未结算的运行段不补算");
    assert.equal(sessions.get(auto).titleManual, false, "没改过名的会话不能被恢复成手动标题，否则自动命名永久失效");

    const saved = sessions.store.getSession(id);
    // 库里保留崩溃瞬间的起点：它是「上次异常退出时正在运行」的唯一证据，读回内存反而会重复累加。
    assert.equal(saved.runningSince, 999);
    assert.deepEqual(saved.selection.taskBudget, { maxTurns: 30, wrapUpWindow: 3 });
    assert.deepEqual(sessions.store.listTasks(id), [child], "任务大字段（runtime/parentContext）跨重启原样读回");
    assert.deepEqual(saved.retries, [
      { id: "r1", agentId: "main", status: "failed", attempt: 2, error: "boom" },
      { id: "r2", agentId: "child-1", status: "succeeded", attempt: 1 },
    ]);
    assert.deepEqual(saved.compactions, [{ id: "c1", summary: "摘要", title: "压缩标题" }]);

    const opened = await sessions.ensureLoaded(id);
    assert.deepEqual(opened.taskBudget, { maxTurns: 30, wrapUpWindow: 3 }, "全局预算已改成 5 轮，旧会话仍用创建时的预算");
    assert.equal(opened.elapsedMs, 4200);
    assert.deepEqual(opened.retries, saved.retries);
    assert.deepEqual(opened.compactions, saved.compactions);
    assert.deepEqual(opened.tasks.snapshot(), [{ ...child, error: undefined }], "任务快照逐字段还原");
    assert.deepEqual(sessions.store.listTasks(id), [child], "恢复对账重写任务不得丢字段");
    await sessions.close();

    sessions = new Sessions(factory, undefined, storage);
    await sessions.load();
    assert.equal(sessions.store.getSession(id).retries.length, 2, "恢复对账重写事件不得让撤回的记录复活");
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});

test("恢复对账整段单事务：事件写失败时任务归一化一起回滚", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-persist-reconcile-"));
  let sessions = new Sessions(factory, undefined, join(root, "storage"));
  try {
    const id = await sessions.create(root);
    const item = sessions.get(id);
    // 中断态任务（无 sessionFile → 恢复时归一化为 cancelled）+ 一条 retry：恢复对账会同时写两类。
    // notified 置 true 只为让启动恢复不把它当待通知会话提前加载，测试要的是显式 ensureLoaded 那一次对账。
    await sessions.persist(item, [
      { task: { id: "t1", task: "做事", status: "running", notified: true } },
      { event: { type: "retry", record: { id: "r1", agentId: "main", status: "waiting" } } },
    ]);
    await sessions.close();

    sessions = new Sessions(factory, undefined, join(root, "storage"));
    await sessions.load();
    assert.equal(sessions.get(id).loaded, false, "前提：启动恢复没有提前加载这条会话");
    const saveEvent = sessions.store.saveEvent.bind(sessions.store);
    sessions.store.saveEvent = () => { throw new Error("injected reconcile failure"); };
    await assert.rejects(sessions.ensureLoaded(id), /injected reconcile failure/);
    // 逐条独立成事务时，任务已被写成 cancelled 而事件没写 → 留下半截归一化结果。
    const task = sessions.store.listTasks(id).find((entry) => entry.id === "t1");
    assert.equal(task.status, "running", "对账中途失败必须整段回滚，不留半截归一化");
    assert.equal(sessions.store.getSession(id).retries[0].status, "waiting");
    sessions.store.saveEvent = saveEvent;
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});
