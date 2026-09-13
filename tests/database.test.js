import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "../src/database.js";

test("database CRUD：UPSERT 覆盖、未命中返回 undefined、JSON 往返保持类型", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-db-"));
  const db = new Database(join(dir, "axiom.db"));
  try {
    assert.equal(db.get("ns", "missing"), undefined);
    db.set("ns", "a", { text: "值", nested: { n: 1 }, flag: true });
    assert.deepEqual(db.get("ns", "a"), { text: "值", nested: { n: 1 }, flag: true });
    // 同 key 再写 = 覆盖而非追加第二条
    db.set("ns", "a", { replaced: 2 });
    assert.deepEqual(db.get("ns", "a"), { replaced: 2 });
    // 删除后回到未命中
    db.delete("ns", "a");
    assert.equal(db.get("ns", "a"), undefined);
    db.delete("ns", "a"); // 重复删除安全
    // 数字/数组/null 等类型往返
    db.set("ns", "b", [1, "两", null]);
    assert.deepEqual(db.get("ns", "b"), [1, "两", null]);
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("database namespace 隔离与 list 稳定排序", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-db-"));
  const db = new Database(join(dir, "axiom.db"));
  try {
    db.set("sessions", "b", { id: "b" });
    db.set("sessions", "a", { id: "a" });
    db.set("settings", "b", { other: true });
    assert.deepEqual(db.list("sessions"), [{ key: "a", value: { id: "a" } }, { key: "b", value: { id: "b" } }]);
    assert.deepEqual(db.list("settings"), [{ key: "b", value: { other: true } }]);
    assert.deepEqual(db.list("empty"), []);
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("database 自动创建多级父目录并跨实例持久化", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-db-"));
  const nested = join(dir, "deep", "er", "axiom.db");
  try {
    const db = new Database(nested);
    db.set("defaults", "defaults", { model: "a/b" });
    db.close();
    assert.equal((await stat(nested)).isFile(), true);
    // 重新打开：数据还在（进程重启语义）
    const again = new Database(nested);
    assert.deepEqual(again.get("defaults", "defaults"), { model: "a/b" });
    again.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("database close 后操作抛错而不是静默失败", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-db-"));
  const db = new Database(join(dir, "axiom.db"));
  db.set("ns", "k", 1);
  db.close();
  try {
    assert.throws(() => db.get("ns", "k"));
    assert.throws(() => db.set("ns", "k", 2));
    assert.throws(() => db.list("ns"));
    assert.throws(() => db.prepare("SELECT 1"));
    assert.throws(() => db.exec("SELECT 1"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("database 暴露 prepare/exec；PRAGMA 生效：busy_timeout 先于 journal_mode、外键开、query_only 真实拦截写入", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-db-"));
  const db = new Database(join(dir, "axiom.db"));
  try {
    assert.equal(db.prepare("SELECT value FROM store WHERE namespace = ?").get("none"), undefined);
    assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    assert.equal(db.prepare("PRAGMA busy_timeout").get().timeout, 5000);
    assert.equal(db.prepare("PRAGMA journal_mode").get().journal_mode, "wal");
    // 主审验收手法：query_only 置开后写入必须真实抛错，置回恢复。
    db.exec("PRAGMA query_only = ON");
    assert.throws(() => db.set("ns", "k", 1));
    db.exec("PRAGMA query_only = OFF");
    db.set("ns", "k", 1);
    assert.deepEqual(db.get("ns", "k"), 1);
    // exec 支持多语句（SessionStore 建表/事务用同一入口）。
    db.exec("CREATE TABLE t (x); INSERT INTO t VALUES (1); INSERT INTO t VALUES (2);");
    assert.equal(db.prepare("SELECT count(*) AS n FROM t").get().n, 2);
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
