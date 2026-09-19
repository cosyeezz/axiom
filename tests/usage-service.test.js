import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "../src/database.js";
import { UsageService } from "../src/usage-service.js";

test("配置持久化、非法配置不覆盖、查询按会话分账", async () => {
  const dir = await mkdtemp(join(tmpdir(), "usage-service-"));
  const db = new Database(join(dir, "axiom.db"));
  let service = new UsageService(db);
  try {
    service.configure({ p: { rpm: 3, concurrency: 2 } });
    assert.throws(() => service.configure({ p: { rpm: -1 } }));
    assert.deepEqual(db.get("usage", "limits"), { p: { rpm: 3, concurrency: 2 } });
    const id = service.store.begin({ sessionId: "s", agentId: "t", provider: "p" });
    service.store.finish(id, { status: "ok", usage: { input: 10, cost: { total: 1 } } });
    assert.equal(service.view({ sessionId: "s" }).billing[0].agentId, "t");
    assert.equal(service.view({ provider: "other" }).billing.length, 0);
    service.close(); service = new UsageService(db);
    assert.equal(service.gate.limits.p.rpm, 3);
  } finally { service.close(); db.close(); await rm(dir, { recursive: true, force: true }); }
});
