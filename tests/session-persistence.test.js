import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Sessions } from "../src/sessions.js";
import { Database } from "../src/database.js";

const factory = async () => ({
  config: () => ({ model: "test/one", thinking: "off" }),
  subscribe: () => () => {},
  prompt: async () => {},
  result: () => "ok",
  abort: async () => {},
  dispose: async () => {},
});
factory.catalog = () => [{ key: "test/one" }];

test("密集保存保持调用顺序且最终数据完整；模型消息不再入库", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-persist-"));
  const sessions = new Sessions(factory, undefined, join(root, "storage"));
  try {
    const id = await sessions.create(root);
    const item = sessions.get(id);
    const writes = [];
    for (let n = 0; n < 50; n++) {
      item.summaries.push({ text: `事实${n}` });
      writes.push(sessions.persist(item));
    }
    await Promise.all(writes);
    const saved = sessions.database.get("sessions", id);
    assert.deepEqual(saved.summaries, item.summaries);
    assert.equal(saved.summaries.at(-1).text, "事实49");
    // 完整模型消息不再持久化：历史权威是 Pi JSONL
    assert.equal("messages" in saved, false);
    // 任务通知等管理数据仍随会话持久化
    assert.deepEqual(saved.tasks, []);
  } finally {
    await sessions.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("保存失败保留旧记录，不写半截数据；恢复后可继续写入", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-persist-fail-"));
  const real = new Database(join(root, "axiom.db"));
  let failing = false;
  const database = {
    get: (ns, k) => real.get(ns, k),
    set: (ns, k, v) => {
      if (failing) throw new Error("模拟磁盘写满");
      real.set(ns, k, v);
    },
    delete: (ns, k) => real.delete(ns, k),
    list: (ns) => real.list(ns),
    close: () => real.close(),
  };
  try {
    const sessions = new Sessions(factory, undefined, join(root, "storage"), database);
    const id = await sessions.create(root);
    const item = sessions.get(id);
    item.summaries.push({ text: "第一版" });
    await sessions.persist(item);
    assert.deepEqual(sessions.database.get("sessions", id).summaries, [{ text: "第一版" }]);

    failing = true;
    item.summaries.push({ text: "失败版" });
    await assert.rejects(sessions.persist(item), /模拟磁盘写满/);
    // 旧记录完好无损
    assert.deepEqual(sessions.database.get("sessions", id).summaries, [{ text: "第一版" }]);

    failing = false;
    await sessions.persist(item);
    assert.deepEqual(sessions.database.get("sessions", id).summaries, [{ text: "第一版" }, { text: "失败版" }]);
    await sessions.close();
  } finally {
    real.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("无库实例（纯内存）persist 为 no-op，注入库时无路径也持久化", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-persist-mem-"));
  try {
    const memory = new Sessions(factory);
    const id = await memory.create(root);
    await memory.persist(memory.get(id));
    assert.equal(memory.database, null);
    await memory.close();

    const database = new Database(join(root, "shared.db"));
    const shared = new Sessions(factory, undefined, undefined, database);
    const sharedId = await shared.create(root);
    await shared.persist(shared.get(sharedId));
    assert.deepEqual(database.list("sessions").map((entry) => entry.key), [sharedId]);
    await shared.close(); // 注入库不由 Sessions 关闭
    // 注入库仍可用（未被误关）
    database.get("sessions", sharedId);
    database.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
