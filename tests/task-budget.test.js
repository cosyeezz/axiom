import test from "node:test";
import assert from "node:assert/strict";
import { WRAP_UP_PROMPT, TASK_BUDGET_LIMITS, taskBudgetDefaults, taskBudgetPolicy, budgetSystemPrompt } from "../src/task-budget.js";

test("主代理没有预算：policy 恒为 null，缺省角色同 main", () => {
  assert.equal(taskBudgetPolicy("main"), null);
  assert.equal(taskBudgetPolicy(), null);
  assert.equal(taskBudgetPolicy("main", { maxTurns: 50, wrapUpWindow: 5 }), null);
});

test("子代理默认预算：20 轮、窗口 2、wrapUpAt 18", () => {
  assert.deepEqual(taskBudgetPolicy("subagent"), { maxTurns: 20, wrapUpWindow: 2, wrapUpAt: 18 });
  assert.deepEqual(taskBudgetPolicy("subagent", null), { maxTurns: 20, wrapUpWindow: 2, wrapUpAt: 18 });
  assert.deepEqual(taskBudgetDefaults, { maxTurns: 20, wrapUpWindow: 2 });
});

test("wrapUpAt = maxTurns - wrapUpWindow；持久化配置覆盖生效", () => {
  assert.deepEqual(taskBudgetPolicy("subagent", { maxTurns: 50, wrapUpWindow: 5 }), { maxTurns: 50, wrapUpWindow: 5, wrapUpAt: 45 });
  assert.deepEqual(taskBudgetPolicy("subagent", { maxTurns: 3, wrapUpWindow: 1 }), { maxTurns: 3, wrapUpWindow: 1, wrapUpAt: 2 });
  // 只配一个字段时另一字段回默认
  assert.deepEqual(taskBudgetPolicy("subagent", { maxTurns: 10 }), { maxTurns: 10, wrapUpWindow: 2, wrapUpAt: 8 });
});

test("窗口吃满预算时 wrapUpAt 至少为 1（留 1 轮正常干活）", () => {
  assert.equal(taskBudgetPolicy("subagent", { maxTurns: 3, wrapUpWindow: 10 }).wrapUpAt, 1);
  assert.equal(taskBudgetPolicy("subagent", { maxTurns: 3, wrapUpWindow: 3 }).wrapUpAt, 1);
});

test("边界值合法（3/200 轮、1/10 窗口），越界或非整数直接报错", () => {
  assert.equal(taskBudgetPolicy("subagent", { maxTurns: 3, wrapUpWindow: 1 }).maxTurns, 3);
  assert.equal(taskBudgetPolicy("subagent", { maxTurns: 200, wrapUpWindow: 10 }).maxTurns, 200);
  for (const [budget, label] of [
    [{ maxTurns: 2 }, "轮次下界"], [{ maxTurns: 201 }, "轮次上界"],
    [{ maxTurns: 20.5 }, "非整数轮次"], [{ maxTurns: "20" }, "字符串轮次"],
    [{ wrapUpWindow: 0 }, "窗口下界"], [{ wrapUpWindow: 11 }, "窗口上界"],
    [{ wrapUpWindow: 1.5 }, "非整数窗口"], [{ wrapUpWindow: "2" }, "字符串窗口"],
  ]) assert.throws(() => taskBudgetPolicy("subagent", budget), /须为 \d+-\d+ 的整数/, label);
});

test("收尾提示与预算系统提示词：含轮次数字", () => {
  assert.match(WRAP_UP_PROMPT, /\[轮次预算\]/);
  assert.match(budgetSystemPrompt({ maxTurns: 20 }), /20 轮/);
  assert.match(budgetSystemPrompt({ maxTurns: 7 }), /7 轮/);
  assert.match(budgetSystemPrompt({ maxTurns: 3 }), /\[轮次预算\]|预算将尽/);
});

test("边界常数与协议 zod schema 共用同一组常数", () => {
  assert.deepEqual(TASK_BUDGET_LIMITS, { turns: [3, 200], window: [1, 10] });
});
