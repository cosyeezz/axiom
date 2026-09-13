import { DatabaseSync } from "node:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Axiom 共享 SQLite 存储：namespace + key 两级 KV，值以 JSON 文本存单表。
// 单写者进程 + WAL + busy_timeout；set 是单条 UPSERT 语句，由 SQLite 语句级事务保证原子，
// 进程崩溃只会「整条旧值或整条新值」，绝不出现半截数据。
// namespace 约定（扩展新管理数据时沿用）：sessions=会话管理数据、defaults=默认会话配置、
// presets=具名预设、settings=全局设置（如 memorySummary）、migrated=旧 JSON 迁移标记。
export class Database {
  #db;

  constructor(path) {
    // 父目录不存在则逐级创建（与旧 storagePath/defaultsPath 行为一致）。
    mkdirSync(dirname(path), { recursive: true });
    this.#db = new DatabaseSync(path);
    // busy_timeout 必须先于 journal_mode：切 WAL 需要短暂独占锁，先设兜底才不会撞锁即抛。
    this.#db.exec("PRAGMA busy_timeout = 5000");
    // WAL：崩溃安全且读写不互斥。
    this.#db.exec("PRAGMA journal_mode = WAL");
    // 级联删除（SessionStore 子表 ON DELETE CASCADE）依赖外键约束；SQLite 默认关闭，按连接开启。
    this.#db.exec("PRAGMA foreign_keys = ON");
    this.#db.exec(
      "CREATE TABLE IF NOT EXISTS store (namespace TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (namespace, key))",
    );
    // 基本权限保护：仅属主可读写；Windows 无 POSIX 权限模型，失败忽略。
    try {
      chmodSync(path, 0o600);
    } catch {}
  }

  // 命中返回解析后的 JSON 值，未命中返回 undefined。
  get(namespace, key) {
    const row = this.#db.prepare("SELECT value FROM store WHERE namespace = ? AND key = ?").get(namespace, key);
    return row ? JSON.parse(row.value) : undefined;
  }

  set(namespace, key, value) {
    this.#db
      .prepare(
        "INSERT INTO store (namespace, key, value) VALUES (?, ?, ?) ON CONFLICT(namespace, key) DO UPDATE SET value = excluded.value",
      )
      .run(namespace, key, JSON.stringify(value));
  }

  delete(namespace, key) {
    this.#db.prepare("DELETE FROM store WHERE namespace = ? AND key = ?").run(namespace, key);
  }

  // 该 namespace 下全部条目：[{ key, value }]，按 key 稳定排序。
  // 坏 JSON 逐行隔离：告警并跳过损坏行，好行照常返回；SQL 错误（连接断开等）照常抛出。
  list(namespace) {
    const items = [];
    for (const { key, value } of this.#db.prepare("SELECT key, value FROM store WHERE namespace = ? ORDER BY key").iterate(namespace)) {
      try {
        items.push({ key, value: JSON.parse(value) });
      } catch (error) {
        console.warn(`命名空间 ${namespace} 键 ${key} 的值不是合法 JSON，已跳过：${error.message}`);
      }
    }
    return items;
  }

  // 供 SessionStore 等同库模块复用连接的最小能力：预编译语句与裸 SQL（建表/事务/PRAGMA）。
  prepare(sql) {
    return this.#db.prepare(sql);
  }

  exec(sql) {
    this.#db.exec(sql);
  }

  close() {
    this.#db.close();
  }
}
