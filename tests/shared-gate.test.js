import { test } from "node:test";
import assert from "node:assert/strict";
import { remoteService } from "../src/shared-gate.js";

test("远程取消立即返回，迟到令牌归还", async () => {
  let grant; const released = [];
  const client = { request(method, data) {
    if (method === "acquire") return new Promise(resolve => { grant = resolve; });
    if (method === "release") released.push(data.leaseId);
    return Promise.resolve({});
  } };
  const service = remoteService(client, { limits: {} });
  const controller = new AbortController();
  const acquire = service.gate.acquire("p", { signal: controller.signal });
  controller.abort(); await assert.rejects(acquire);
  grant({ leaseId: "late" }); await Promise.resolve();
  assert.deepEqual(released, ["late"]);
});
test("刷新取得owner新限额，非排队RPC使用短超时", async () => {
  const calls = [];
  const service = remoteService({ request(method, data, timeout) { calls.push(timeout); return Promise.resolve({ limits: { p: { rpm: 3 } } }); } }, { limits: {} });
  await service.refresh(); assert.equal(service.gate.limits.p.rpm, 3); assert.equal(calls[0], 1000);
});
