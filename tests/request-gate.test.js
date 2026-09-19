import { test } from "node:test";
import assert from "node:assert/strict";
import { RequestGate, retryAfterMs, validateLimits } from "../src/request-gate.js";

function fixture(t, limits) {
  let now = 0;
  const gate = new RequestGate({ limits, now: () => now, windowMs: 100, leaseMs: 200, maxWaitMs: 300 });
  t.after(() => gate.close());
  return { gate, advance(ms) { now += ms; gate.sweep(); } };
}
test("并发 FIFO、幂等归还", async t => {
  const { gate } = fixture(t, { p: { concurrency: 1 } });
  const first = await gate.acquire("p");
  const order = [];
  const second = gate.acquire("p").then(lease => { order.push(2); return lease; });
  const third = gate.acquire("p").then(lease => { order.push(3); return lease; });
  assert.equal(gate.snapshot()[0].concurrencyQueue, 2);
  first.release(); first.release();
  const lease = await second;
  assert.deepEqual(order, [2]);
  lease.release(); (await third).release();
  assert.deepEqual(order, [2, 3]);
});
test("RPM 按窗口计数，归还不会退回额度", async t => {
  const { gate, advance } = fixture(t, { p: { rpm: 1 } });
  (await gate.acquire("p", { kind: "rpm" })).release();
  let admitted = false;
  const next = gate.acquire("p", { kind: "rpm" }).then(value => { admitted = true; return value; });
  advance(99); await Promise.resolve(); assert.equal(admitted, false);
  advance(1); assert.equal((await next).waitMs, 100);
});
test("取消移出队列、不消耗额度", async t => {
  const { gate } = fixture(t, { p: { concurrency: 1 } });
  const first = await gate.acquire("p");
  const controller = new AbortController();
  const next = gate.acquire("p", { signal: controller.signal });
  controller.abort(); await assert.rejects(next);
  assert.equal(gate.snapshot()[0].concurrencyQueue, 0);
  first.release();
});
test("租约过期回收，过期令牌归还不影响新请求", async t => {
  const { gate, advance } = fixture(t, { p: { concurrency: 1 } });
  const old = await gate.acquire("p");
  const next = gate.acquire("p"); advance(200);
  const current = await next; old.release();
  assert.equal(gate.snapshot()[0].active, 1); current.release();
});
test("冷却与最大等待：超时 fail-open", async t => {
  const { gate, advance } = fixture(t, { p: { rpm: 1 } });
  gate.cooldown("p", 300);
  const next = gate.acquire("p", { kind: "rpm" });
  advance(300);
  assert.equal((await next).bypassed, true);
});
test("关停释放所有排队者，未配置直接通过", async t => {
  const { gate } = fixture(t, { p: { concurrency: 1 } });
  assert.equal((await gate.acquire("other")).waitMs, 0);
  await gate.acquire("p"); const next = gate.acquire("p");
  gate.close(); assert.equal((await next).bypassed, true);
});
test("热更新关闭限额释放排队请求", async t => {
  const { gate } = fixture(t, { p: { concurrency: 1 } });
  await gate.acquire("p"); const next = gate.acquire("p"); gate.configure({});
  assert.equal((await next).bypassed, false);
});
test("配置与 Retry-After 校验", () => {
  assert.throws(() => validateLimits({ p: { priority: 1 } }));
  assert.throws(() => validateLimits({ p: { rpm: -1 } }));
  assert.deepEqual(validateLimits({ p: { rpm: 0 } }), { p: { rpm: 0 } });
  assert.equal(retryAfterMs("2"), 2000);
  assert.equal(retryAfterMs("Thu, 01 Jan 1970 00:00:05 GMT", 1000), 4000);
  assert.equal(retryAfterMs("invalid"), 0);
});
