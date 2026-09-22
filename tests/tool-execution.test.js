import test from "node:test";
import assert from "node:assert/strict";
import { createToolExecutionPolicy } from "../src/tool-execution.js";

function fixture(options = {}) {
  const hooks = {}, events = [];
  const policy = createToolExecutionPolicy({ ...options, emit: event => events.push(event) });
  policy.extension({ on: (name, handler) => { hooks[name] = handler; } });
  const call = (input, toolName = "bash", toolCallId = "c1") => {
    const event = { input, toolName, toolCallId };
    policy.observe("start", event);
    return hooks.tool_call(event);
  };
  return { policy, hooks, events, call };
}
test("timeout: omitted defaults to 180 seconds; explicit positive value is preserved", () => {
  const f = fixture(); const omitted = {}, explicit = { timeout: 900 };
  assert.equal(f.call(omitted), undefined); assert.equal(omitted.timeout, 180);
  assert.equal(f.events.at(-1).data.timeoutSource, "default");
  assert.equal(f.call(explicit), undefined); assert.equal(explicit.timeout, 900);
  assert.equal(f.events.at(-1).data.timeoutSource, "explicit");
});
test("timeout: main -1 removes native timeout, subagent -1 and invalid values block", () => {
  const main = fixture(), sub = fixture({ subagent: true });
  const input = { timeout: -1 };
  assert.equal(main.call(input), undefined); assert.equal(Object.hasOwn(input, "timeout"), false);
  assert.equal(main.events.at(-1).data.timeoutSource, "unlimited");
  for (const timeout of [-1, 0, -2, NaN, Infinity, "180", null, 3_000_000]) assert.equal(sub.call({ timeout }).block, true);
});
test("timeout: read/write/edit and script-native timeout fields are untouched", () => {
  const f = fixture();
  for (const name of ["read", "write", "edit", "mcpScript"]) {
    const input = {}; assert.equal(f.call(input, name), undefined); assert.deepEqual(input, {});
  }
});
test("summary mode blocks every tool", () => {
  const f = fixture({ summarizing: () => true });
  for (const name of ["bash", "read", "mcp", "delegate"]) assert.equal(f.call({}, name).block, true);
});
test("timeout feedback distinguishes actual default timeout from ordinary errors", () => {
  const f = fixture(); f.call({});
  const event = { toolName: "bash", toolCallId: "c1", isError: true, content: [{ type: "text", text: "partial\nCommand timed out after 180 seconds" }] };
  const result = f.hooks.tool_result(event);
  assert.equal(result.details.execution.timedOut, true);
  assert.match(result.content.at(-1).text, /默认 180 秒/);
  const ordinary = f.hooks.tool_result({ ...event, content: [{ type: "text", text: "timeout happened elsewhere\nCommand exited with code 1" }] });
  assert.equal(ordinary.details.execution.timedOut, false);
  assert.equal(ordinary.content, undefined);
  const end = f.policy.observe("end", event);
  assert.ok(end.endedAt >= end.startedAt); assert.ok(end.elapsedMs >= 0);
  assert.equal(f.policy.active().length, 0);
});
