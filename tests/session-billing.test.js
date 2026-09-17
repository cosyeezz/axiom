import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionBilling, usageRuntime } from "../src/session-billing.js";

const usage = { input: 100, output: 20, cacheRead: 50, cacheWrite: 10,
  cost: { input: .1, output: .2, cacheRead: .01, cacheWrite: .02, total: .33 } };
test("billing includes all branches, compactions and tool usage without attributing summaries to a model", () => {
  const entries = [
    { type: "message", message: { role: "assistant", provider: "p", model: "m", usage } },
    { type: "message", message: { role: "assistant", provider: "p", model: "n", usage } },
    { type: "compaction", usage }, { type: "branch_summary", usage },
    { type: "message", message: { role: "toolResult", usage } },
    { type: "message", message: { role: "user", usage } },
    { type: "compaction" },
  ];
  const bill = sessionBilling(entries);
  assert.equal(bill.records, 5);
  assert.equal(bill.unpriced, 0);
  assert.ok(Math.abs(bill.cost.total - 1.65) < 1e-9);
  assert.equal(bill.groups.length, 4);
  assert.equal(bill.groups.find(g => g.model.includes("摘要")).tokens.input, 200);
});
test("missing prices are marked and zero prices remain valid", () => {
  const bill = sessionBilling([{ type: "message", message: { role: "assistant", usage: { input: 2 } } },
    { type: "compaction", usage: { cost: { total: 0 } } }]);
  assert.equal(bill.unpriced, 1);
  assert.equal(bill.records, 2);
  assert.equal(bill.cost.total, 0);
});
test("runtime retains last reported usage and estimates missing context without a configured window", () => {
  const messages = [{ role: "assistant", content: [{ type: "text", text: "hello world" }], usage },
    { role: "assistant", content: [] }];
  const runtime = usageRuntime(messages);
  assert.equal(runtime.usage, usage);
  assert.equal(runtime.context.estimated, true);
  assert.ok(runtime.context.tokens > 0);
  assert.equal(runtime.context.percent, null);
  const context = { tokens: 500, contextWindow: 1000, percent: 50 };
  assert.equal(usageRuntime(messages, {}, context).context, context);
});
