import test from "node:test";
import assert from "node:assert/strict";
import { RequestGate, validateLimits } from "../src/request-gate.js";
import { JSDOM } from "jsdom";
import { createModelLimits } from "../public/model-limits.js";

test("模型与供应商并发原子准入；受限模型不阻塞其他模型", async () => {
  const gate = new RequestGate({ limits: { p: { concurrency: 2, models: { a: { concurrency: 1 } } } } });
  try {
    const a = await gate.acquire("p", { model: "a" });
    let admitted = false;
    const waiting = gate.acquire("p", { model: "a" }).then(lease => { admitted = true; return lease; });
    const b = await gate.acquire("p", { model: "b" });
    assert.equal(admitted, false);
    assert.equal(gate.snapshot()[0].active, 2);
    a.release(); const second = await waiting;
    second.release(); b.release();
    assert.equal(gate.snapshot()[0].active, 0);
  } finally { gate.close(); }
});
test("仅模型限制、热更新、取消与配置校验", async () => {
  const gate = new RequestGate({ limits: { p: { models: { a: { concurrency: 1 } } } } });
  try {
    const a = await gate.acquire("p", { model: "a" });
    const controller = new AbortController();
    const cancelled = gate.acquire("p", { model: "a", signal: controller.signal });
    controller.abort(); await assert.rejects(cancelled);
    const waiting = gate.acquire("p", { model: "a" });
    gate.configure({}); (await waiting).release(); a.release();
    for (const value of [-1, 1.5, "2", 100001]) assert.throws(() => validateLimits({ p: { models: { a: { concurrency: value } } } }));
  } finally { gate.close(); }
});
test("模型页读取并保存双层限额，保留其他供应商配置", async () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  const previous = globalThis.document; globalThis.document = dom.window.document;
  try {
    let limits = { p: { concurrency: 3 }, other: { rpm: 10 } };
    const root = createModelLimits({ providerId: "p", models: [{ id: "a" }], request: async (type, data) => {
      if (type === "usage.get") return { limits: structuredClone(limits) };
      assert.equal(type, "usage.configure"); limits = data.limits; return { limits };
    } });
    document.body.append(root);
    await root.querySelector("button").onclick();
    const fields = root.querySelectorAll("input");
    fields[0].value = "4"; fields[2].value = "2";
    await root.querySelector("form").onsubmit({ preventDefault() {} });
    assert.equal(limits.p.concurrency, 4); assert.equal(limits.p.models.a.concurrency, 2);
    assert.deepEqual(limits.other, { rpm: 10 });
    assert.match(root.textContent, /限额已保存/);
  } finally { globalThis.document = previous; dom.window.close(); }
});
