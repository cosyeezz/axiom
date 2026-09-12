import test from "node:test";
import assert from "node:assert/strict";
import { SUMMARY_DELEGATE, SUMMARY_REMINDER, SUMMARY_SYSTEM_PROMPT, memoryPolicy } from "../src/memory-policy.js";

// 环境变量逐例隔离：undefined 表示删除该键，结束后按快照还原。
function withEnv(env, run) {
  const saved = new Map(Object.entries(env).map(([key]) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { run(); } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("提示词原文一字不改（含工作记忆后缀）", () => {
  assert.equal(SUMMARY_SYSTEM_PROMPT,
    "收到[摘要提醒]时，在回复末尾输出一个极简摘要（<30字）放到<axiom_summary></axiom_summary>中：自上次摘要以来新增的已确认事实、关键结论或阻塞点，不重复旧内容，不写空泛进度。此内容进入工作记忆。");
  assert.equal(SUMMARY_REMINDER, "[摘要提醒] 本次回复请按约定输出增量摘要。");
  assert.equal(SUMMARY_DELEGATE, "调用 delegate 委派任务时也须输出上述摘要，与提醒同时发生时只输出一次。");
});

test("缺省策略：主 3 子 6，maxChars 30，系统提示词原文", () => {
  withEnv({ AXIOM_MAIN_SUMMARY_TURNS: undefined, AXIOM_SUBAGENT_SUMMARY_TURNS: undefined, AXIOM_SUMMARY_MAX_CHARS: undefined }, () => {
    assert.deepEqual(memoryPolicy("main"), { interval: 3, maxChars: 30, systemPrompt: SUMMARY_SYSTEM_PROMPT });
    assert.deepEqual(memoryPolicy("subagent"), { interval: 6, maxChars: 30, systemPrompt: SUMMARY_SYSTEM_PROMPT });
    assert.deepEqual(memoryPolicy(), memoryPolicy("main"));
  });
});

test("环境变量覆盖：每次调用实时解析，边界值生效", () => {
  withEnv({ AXIOM_MAIN_SUMMARY_TURNS: "5", AXIOM_SUBAGENT_SUMMARY_TURNS: "2", AXIOM_SUMMARY_MAX_CHARS: "29" }, () => {
    assert.equal(memoryPolicy("main").interval, 5);
    assert.equal(memoryPolicy("subagent").interval, 2);
    assert.equal(memoryPolicy("main").maxChars, 29); // 严格小于 30 的上界
  });
  for (const limit of [30, 40, 100]) withEnv({ AXIOM_SUMMARY_MAX_CHARS: String(limit) }, () => {
    assert.equal(memoryPolicy().maxChars, limit);
    assert.ok(memoryPolicy().systemPrompt.includes(`<${limit}字`));
  });
  withEnv({ AXIOM_SUMMARY_MAX_CHARS: "2" }, () => assert.equal(memoryPolicy("main").maxChars, 2)); // 下界
});

test("非法环境变量直接报错（建会话即失败，早于任何模型请求）", () => {
  for (const [env, role] of [
    [{ AXIOM_MAIN_SUMMARY_TURNS: "0" }, "main"],
    [{ AXIOM_MAIN_SUMMARY_TURNS: "-1" }, "main"],
    [{ AXIOM_MAIN_SUMMARY_TURNS: "2.5" }, "main"],
    [{ AXIOM_MAIN_SUMMARY_TURNS: "abc" }, "main"],
    [{ AXIOM_SUBAGENT_SUMMARY_TURNS: "0" }, "subagent"],
    [{ AXIOM_SUMMARY_MAX_CHARS: "1" }, "main"],
    [{ AXIOM_SUMMARY_MAX_CHARS: "2.5" }, "main"],
    [{ AXIOM_SUMMARY_MAX_CHARS: "abc" }, "main"],
  ]) {
    withEnv(env, () => assert.throws(() => memoryPolicy(role), Object.keys(env)[0]));
  }
});
