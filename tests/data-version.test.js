import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database, DATA_VERSION } from "../src/database.js";

test("新库标记兼容版本；较新数据拒绝写入且不改文件", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-version-"));
  const path = join(dir, "axiom.db");
  let db;
  try {
    db = new Database(path);
    assert.equal(db.get("meta", "dataVersion"), DATA_VERSION);
    db.set("meta", "dataVersion", DATA_VERSION + 1);
    db.close(); db = undefined;
    const before = await readFile(path);
    assert.throws(() => new Database(path), /高于当前支持/);
    assert.deepEqual(await readFile(path), before);
  } finally {
    db?.close();
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
