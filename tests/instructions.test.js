import test from "node:test";
import assert from "node:assert/strict";
import { createInstructions } from "../src/instructions.js";
import { instructionTools } from "../src/instruction-tools.js";

const parameters = { type: "object", properties: { n: { type: "integer", minimum: 1 } }, required: ["n"], additionalProperties: false };
const definition = (handler = ({ n }) => n + 1) => ({ name: "test.increment", description: "Increment a number.", parameters: structuredClone(parameters), handler });

test("register/execute: exact names, duplicate rejection, isolated registries, sync and async handlers", async () => {
  const registry = createInstructions();
  registry.register(definition());
  assert.deepEqual(Object.keys(registry).sort(), ["execute", "register"]);
  assert.equal(await registry.execute("test.increment", { n: 1 }), 2);
  assert.throws(() => registry.register(definition()), /already registered/);
  for (const name of ["test", "TEST.increment", " test.increment", "test.increment ", "*"]) {
    await assert.rejects(registry.execute(name, { n: 1 }), /Unknown instruction/);
  }
  await assert.rejects(createInstructions().execute("test.increment", { n: 1 }), /Unknown instruction/);
  registry.register({ ...definition(async ({ n }) => n), name: "test.async" });
  assert.equal(await registry.execute("test.async", { n: 3 }), 3);
});

test("invalid arguments never enter handler and are not coerced", async () => {
  const registry = createInstructions();
  let calls = 0;
  registry.register(definition(() => calls++));
  for (const args of [{}, { n: "1" }, { n: 0 }, { n: 1, extra: true }, null, [], undefined]) {
    await assert.rejects(registry.execute("test.increment", args), /Invalid instruction arguments/);
  }
  assert.equal(calls, 0);
});

test("describe uses a private snapshot and can describe itself; no handler is exposed", async () => {
  const registry = createInstructions();
  const source = definition();
  registry.register(source);
  source.parameters.properties.n.type = "string";
  const description = await registry.execute("axiom.describe", { name: source.name });
  assert.deepEqual(description, { name: source.name, description: source.description, parameters });
  description.parameters.properties.n.type = "string";
  assert.equal(await registry.execute(source.name, { n: 1 }), 2);
  assert.deepEqual((await registry.execute("axiom.describe", { name: source.name })).parameters, parameters);
  assert.equal((await registry.execute("axiom.describe", { name: "axiom.describe" })).name, "axiom.describe");
  await assert.rejects(registry.execute("axiom.describe", { name: "missing" }), /Unknown instruction: missing/);
});

test("tools wrap the same executor, validate envelopes and propagate errors", async () => {
  const registry = createInstructions();
  registry.register(definition());
  const [ask, letTool] = instructionTools(registry);
  const requested = { name: "test.increment" };
  assert.deepEqual(await ask.execute("ask", requested), await letTool.execute("let", { name: "axiom.describe", arguments: requested }));
  assert.equal((await letTool.execute("let", { name: "test.increment", arguments: { n: 4 } })).details, 5);
  await assert.rejects(ask.execute("ask", { ...requested, search: true }), /Invalid tool arguments/);
  await assert.rejects(letTool.execute("let", requested), /Invalid tool arguments/);
  const failure = new Error("business failure");
  registry.register({ ...definition(() => { throw failure; }), name: "test.fail" });
  await assert.rejects(letTool.execute("let", { name: "test.fail", arguments: { n: 1 } }), error => error === failure);
  registry.register({ ...definition(() => undefined), name: "test.void" });
  assert.equal((await letTool.execute("let", { name: "test.void", arguments: { n: 1 } })).content[0].text, "null");
});
