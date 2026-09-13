import { createRequire } from "node:module";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const nodeOk = (version = process.versions.node) => {
  const [major, minor] = version.split(".").map(Number);
  return major >= 24 || (major === 22 && minor >= 13);
};

// 所有入口共用：先检查版本，再加载 SQLite，避免旧 Node 抢先报未知内置模块。
if (!nodeOk()) throw new Error(`需要 Node.js 22.13+（22.x）或 24+，当前 ${process.versions.node}，请升级后重试`);
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");

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
    // WAL：崩溃安全且读写不互斥；busy_timeout 兜底外部工具（sqlite3 CLI 等）短暂持锁。
    this.#db.exec("PRAGMA journal_mode = WAL");
    this.#db.exec("PRAGMA busy_timeout = 5000");
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
  list(namespace) {
    return this.#db.prepare("SELECT key, value FROM store WHERE namespace = ? ORDER BY key").all(namespace)
      .map(({ key, value }) => ({ key, value: JSON.parse(value) }));
  }

  close() {
    this.#db.close();
  }
}
