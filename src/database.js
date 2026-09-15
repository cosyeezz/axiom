import { createRequire } from "node:module";
import { chmodSync, closeSync, mkdirSync, openSync } from "node:fs";
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
// namespace 约定：sessions 仅保留旧迁移源（动态会话已拆表）、defaults=默认会话配置、
// settings=全局设置（如 taskBudget）、migrated=旧 JSON 迁移标记；工作空间配置独立保存。
export class Database {
  #db;
  #path;

  constructor(path) {
    // 父目录不存在则逐级创建（与旧 storagePath/defaultsPath 行为一致）。
    mkdirSync(dirname(path), { recursive: true });
    // WAL/SHM 继承主库权限：必须先收紧主库，再打开连接创建 sidecar；不修改共享父目录。
    closeSync(openSync(path, "a", 0o600));
    for (const file of [path, `${path}-wal`, `${path}-shm`]) {
      try { chmodSync(file, 0o600); }
      catch (error) { if (process.platform !== "win32" && error.code !== "ENOENT") throw error; }
    }
    this.#db = new DatabaseSync(path);
    this.#path = path;
    // busy_timeout 必须先于 journal_mode：切 WAL 需要短暂独占锁，先设兜底才不会撞锁即抛。
    this.#db.exec("PRAGMA busy_timeout = 5000");
    // WAL：崩溃安全且读写不互斥。
    this.#db.exec("PRAGMA journal_mode = WAL");
    // 级联删除（SessionStore 子表 ON DELETE CASCADE）依赖外键约束；SQLite 默认关闭，按连接开启。
    this.#db.exec("PRAGMA foreign_keys = ON");
    this.#db.exec(
      "CREATE TABLE IF NOT EXISTS store (namespace TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (namespace, key))",
    );
  }

  // 主库文件路径（供迁移前 VACUUM INTO 一致性备份等使用）。
  get path() {
    return this.#path;
  }

  // 命中返回解析后的 JSON 值，未命中返回 undefined。
  // 坏 JSON 抛脱敏错误：只报 namespace/key 位置，不带内容片段或解析器消息（
  // Node 21+ 的 JSON.parse SyntaxError 会携带原文片段，绝不能透传）。
  get(namespace, key) {
    const row = this.#db.prepare("SELECT value FROM store WHERE namespace = ? AND key = ?").get(namespace, key);
    if (!row) return undefined;
    try {
      return JSON.parse(row.value);
    } catch {
      throw new Error(`store：命名空间 ${namespace} 键 ${key} 的值不是合法 JSON，读取中止`);
    }
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
  // 告警只报 namespace/key，不带内容或解析器消息（防原文泄露）。
  list(namespace) {
    const items = [];
    for (const { key, value } of this.#db.prepare("SELECT key, value FROM store WHERE namespace = ? ORDER BY key").iterate(namespace)) {
      try {
        items.push({ key, value: JSON.parse(value) });
      } catch {
        console.warn(`store：命名空间 ${namespace} 键 ${key} 的值不是合法 JSON，已跳过该行`);
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
