import test from "node:test";
import assert from "node:assert/strict";
import { readServiceOperation, OPERATION_ERROR } from "../src/service-operation.js";
import { createMaintState } from "../scripts/maint-state.mjs";
import { startMaintServer } from "../scripts/maint-server.mjs";

const maintenance = { url: "http://127.0.0.1:54321", token: "private-token" };
const state = { ready: true, operation: "quick", operationId: "op-1", status: "failed", phases: [], error: "准备失败", log: "" };

test("operation reader uses fixed authenticated GET, projects fields and never forwards private configuration", async () => {
  const result = await readServiceOperation(maintenance, { fetchImpl: async (url, options) => {
    assert.equal(url, maintenance.url + "/status");
    assert.equal(options.method, "GET");
    assert.equal(options.headers.authorization, "Bearer private-token");
    assert.equal(options.redirect, "error");
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: true, json: async () => ({ ...state, maintenance, token: maintenance.token, sourceDir: "secret", phases: [{ phase: "preparing", at: 1, token: "private" }] }) };
  } });
  assert.equal(result.status, "failed");
  assert.equal(result.error, "准备失败");
  assert.deepEqual(result.phases, [{ phase: "preparing", at: 1 }]);
  assert.doesNotMatch(JSON.stringify(result), /private|sourceDir|54321/);
});

test("operation reader fails closed for bad URL, HTTP/JSON/shape errors and abort; errors reveal no credentials", async () => {
  for (const url of ["http://localhost:54321", "https://127.0.0.1:54321", maintenance.url + "/recover", "http://example.com"]) {
    await assert.rejects(readServiceOperation({ ...maintenance, url }, { fetchImpl: () => assert.fail("must not fetch") }), { message: OPERATION_ERROR });
  }
  for (const fetchImpl of [
    async () => { throw new Error("private-token http://127.0.0.1:54321"); },
    async () => ({ ok: false }),
    async () => ({ ok: true, json: async () => { throw new Error("bad JSON"); } }),
    ...[null, {}, { ...state, status: "unknown" }, { ...state, phases: [null] }].map(value => async () => ({ ok: true, json: async () => value })),
  ]) await assert.rejects(readServiceOperation(maintenance, { fetchImpl }), { message: OPERATION_ERROR });
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(readServiceOperation(maintenance, { timeoutMs: 10, fetchImpl: (url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }) }), { message: OPERATION_ERROR });
  } finally { clearTimeout(keepAlive); }
});

test("operation reader returns live supervisor failure even when persistence fails", async () => {
  let fail = false;
  const database = { get: () => null, set: () => { if (fail) throw new Error("disk full"); } };
  const operation = await createMaintState({ database, key: "test", redactions: [[maintenance.token, "***"]] });
  const server = await startMaintServer({ state: operation, token: maintenance.token, recover: () => assert.fail("read only") });
  try {
    await operation.begin("op-1", "rebuild");
    operation.setWorker("same-worker");
    await operation.workerReady("same-worker", "1.0.0");
    fail = true;
    await operation.fail("准备失败 private-token");
    const result = await readServiceOperation({ ...maintenance, url: server.url });
    assert.equal(result.ready, true);
    assert.equal(result.status, "failed");
    assert.equal(result.operationId, "op-1");
    assert.match(result.persistenceError, /未能保存/);
    assert.doesNotMatch(result.error, /private-token/);
  } finally { await server.close(); }
});
