import test from "node:test";
import assert from "node:assert/strict";
import { MEMORY_SUMMARY_LIMITS, SUMMARY_DELEGATE, SUMMARY_REMINDER, SUMMARY_SYSTEM_PROMPT, memoryPolicy, memorySummaryDefaults } from "../src/memory-policy.js";

test("提示词原文一字不改（含工作记忆后缀）", () => {
  assert.equal(SUMMARY_SYSTEM_PROMPT,
    "收到[摘要提醒]时，在回复末尾输出一个极简摘要（<30字）放到<axiom_summary></axiom_summary>中：自上次摘要以来新增的已确认事实、关键结论或阻塞点，不重复旧内容，不写空泛进度。此内容进入工作记忆。");
  assert.equal(SUMMARY_REMINDER, "[摘要提醒] 本次回复请按约定输出增量摘要。");
  assert.equal(SUMMARY_DELEGATE, "调用 delegate 委派任务时也须输出上述摘要，与提醒同时发生时只输出一次。");
});

test("缺省策略：主 3 子 6，maxChars 30，系统提示词原文；无配置对象或缺字段同样回默认", () => {
  assert.deepEqual(memoryPolicy("main"), { interval: 3, maxChars: 30, systemPrompt: SUMMARY_SYSTEM_PROMPT });
  assert.deepEqual(memoryPolicy("subagent"), { interval: 6, maxChars: 30, systemPrompt: SUMMARY_SYSTEM_PROMPT });
  assert.deepEqual(memoryPolicy(), memoryPolicy("main"));
  assert.deepEqual(memoryPolicy("main", null), memoryPolicy("main"));
  assert.deepEqual(memoryPolicy("main", {}), memoryPolicy("main"));
  // 配置缺某角色字段时只回退该字段，已配置字段不受另一角色影响
  assert.deepEqual(memoryPolicy("subagent", { mainTurns: 9 }), { interval: 6, maxChars: 30, systemPrompt: SUMMARY_SYSTEM_PROMPT });
  assert.deepEqual(memoryPolicy("main", { subagentTurns: 9 }), { interval: 3, maxChars: 30, systemPrompt: SUMMARY_SYSTEM_PROMPT });
});

test("持久化配置覆盖：轮数与字数按会话配置生效，提示词同步替换", () => {
  const custom = { mainTurns: 5, subagentTurns: 2, maxChars: 29 };
  assert.equal(memoryPolicy("main", custom).interval, 5);
  assert.equal(memoryPolicy("subagent", custom).interval, 2);
  assert.equal(memoryPolicy("main", custom).maxChars, 29); // 严格小于 30 的上界
  for (const limit of [30, 40, 100]) {
    const policy = memoryPolicy("main", { maxChars: limit });
    assert.equal(policy.maxChars, limit);
    assert.ok(policy.systemPrompt.includes(`<${limit}字`));
  }
  assert.equal(memoryPolicy("main", { mainTurns: 1 }).interval, 1);
  assert.equal(memoryPolicy("subagent", { subagentTurns: 100 }).interval, 100);
  assert.ok(memoryPolicy("main", { maxChars: 2 }).systemPrompt.includes("<2字")); // 下界
});

test("非法配置直接报错（建会话即失败，早于任何模型请求），边界与协议一致", () => {
  for (const [summary, role] of [
    [{ mainTurns: 0 }, "main"],
    [{ mainTurns: -1 }, "main"],
    [{ mainTurns: 2.5 }, "main"],
    [{ mainTurns: "3" }, "main"],
    [{ mainTurns: 101 }, "main"],
    [{ subagentTurns: 0 }, "subagent"],
    [{ subagentTurns: 101 }, "subagent"],
    [{ maxChars: 1 }, "main"],
    [{ maxChars: 2.5 }, "main"],
    [{ maxChars: 101 }, "main"],
    [{ maxChars: "30" }, "main"],
  ]) assert.throws(() => memoryPolicy(role, summary), /须为 \d+-\d+ 的整数/);
});

test("默认值与协议边界常数：与 protocol.js 的 zod schema 共用同一组常数", () => {
  assert.deepEqual(memorySummaryDefaults, { mainTurns: 3, subagentTurns: 6, maxChars: 30 });
  assert.deepEqual(MEMORY_SUMMARY_LIMITS, { turns: [1, 100], chars: [2, 100] });
});
