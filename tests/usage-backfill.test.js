import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "../src/database.js";
import { UsageStore } from "../src/usage-store.js";
import { backfillEntries } from "../src/usage-backfill.js";

test("历史回填仅导入切换前用量，复制会话不重复计费", async () => {
  const dir = await mkdtemp(join(tmpdir(), "usage-history-"));
  const db = new Database(join(dir, "axiom.db"));
  try {
    const store = new UsageStore(db);
    const entry = { id: "1234", type: "message", timestamp: new Date(1000).toISOString(), message: { role: "assistant", provider: "p", model: "m", usage: { input: 3, cost: { total: 1 } } } };
    const entries = [entry, { ...entry, id: "new", timestamp: new Date(3000).toISOString() }];
    assert.deepEqual(backfillEntries(store, entries, { enabledAt: 2000, sessionId: "original" }), { imported: 1, deduped: 0, skipped: 1 });
    assert.equal(backfillEntries(store, entries, { enabledAt: 2000, sessionId: "copy" }).deduped, 1);
    assert.equal(store.listRequests().items[0].sessionId, "original");
    assert.equal(store.billingGlobal()[0].costTotal, 1);
    assert.throws(() => backfillEntries(store, entries, { sessionId: "s" }));
  } finally { db.close(); await rm(dir, { recursive: true, force: true }); }
});
