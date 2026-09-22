import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WRAP_UP_PROMPT, TASK_BUDGET_LIMITS, taskBudgetDefaults, taskBudgetPolicy, budgetSystemPrompt } from "../src/task-budget.js";
import { Sessions } from "../src/sessions.js";
import { Database } from "../src/database.js";
import { taskBudget as budgetSchema, command } from "../src/protocol.js";

const factory = async () => ({
  config: () => ({ model: "test/one", thinking: "off" }),
  subscribe: () => () => {}, prompt: async () => {}, result: () => "ok",
  abort: async () => {}, dispose: async () => {}, historyEntries: () => [],
});
factory.catalog = () => [{ key: "test/one" }];

test("主代理没有预算：policy 恒为 null，缺省角色同 main", () => {
  assert.equal(taskBudgetPolicy("main"), null);
  assert.equal(taskBudgetPolicy(), null);
  assert.equal(taskBudgetPolicy("main", { maxTurns: 50, wrapUpWindow: 5 }), null);
});

test("子代理默认预算：20 轮、窗口 2、wrapUpAt 18", () => {
  assert.deepEqual(taskBudgetPolicy("subagent"), { ...taskBudgetDefaults, wrapUpAt: 18 });
  assert.deepEqual(taskBudgetPolicy("subagent", null), { ...taskBudgetDefaults, wrapUpAt: 18 });
  assert.deepEqual(taskBudgetDefaults, { maxTurns: 20, wrapUpWindow: 2, workSeconds: 600, wrapUpSeconds: 180, summarySeconds: 60 });
});

test("wrapUpAt = maxTurns - wrapUpWindow；持久化配置覆盖生效", () => {
  assert.deepEqual(taskBudgetPolicy("subagent", { maxTurns: 50, wrapUpWindow: 5 }), { ...taskBudgetDefaults, maxTurns: 50, wrapUpWindow: 5, wrapUpAt: 45 });
  assert.deepEqual(taskBudgetPolicy("subagent", { maxTurns: 3, wrapUpWindow: 1 }), { ...taskBudgetDefaults, maxTurns: 3, wrapUpWindow: 1, wrapUpAt: 2 });
  // 只配一个字段时另一字段回默认
  assert.deepEqual(taskBudgetPolicy("subagent", { maxTurns: 10 }), { ...taskBudgetDefaults, maxTurns: 10, wrapUpWindow: 2, wrapUpAt: 8 });
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
  assert.deepEqual(TASK_BUDGET_LIMITS, { turns: [3, 200], window: [1, 10], workSeconds: [60, 7200], wrapUpSeconds: [30, 3600], summarySeconds: [10, 600] });
});

test("会话级预算随会话落库：全局值改了，重开旧会话仍用创建时的预算", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-budget-session-"));
  const database = new Database(join(root, "axiom.db"));
  let sessions = new Sessions(factory, undefined, undefined, database);
  try {
    const id = await sessions.create(root, { taskBudget: { maxTurns: 30, wrapUpWindow: 3 } });
    sessions.get(id).emit({ type: "agent.message.end", data: { entryId: "u1", message: { role: "user", content: "seed" } } });
    assert.deepEqual(sessions.get(id).taskBudget, { ...taskBudgetDefaults, maxTurns: 30, wrapUpWindow: 3 });
    // 预算必须进 selection JSON 列；否则重开时无从区分「创建时的预算」与「当前全局值」。
    assert.deepEqual(sessions.store.getSession(id).selection.taskBudget, { ...taskBudgetDefaults, maxTurns: 30, wrapUpWindow: 3 });
    await sessions.close();

    sessions = new Sessions(factory, undefined, undefined, database);
    sessions.configureTaskBudget({ maxTurns: 60, wrapUpWindow: 6 });
    await sessions.load();
    const item = await sessions.ensureLoaded(id);
    assert.deepEqual(item.taskBudget, { ...taskBudgetDefaults, maxTurns: 30, wrapUpWindow: 3 }, "注释承诺「运行中不热更」，重开也不得热更");
    const fresh = await sessions.create(root);
    assert.deepEqual(sessions.get(fresh).taskBudget, { ...taskBudgetDefaults, maxTurns: 60, wrapUpWindow: 6 }, "新会话才跟随新全局值");
  } finally { await sessions.close(); database.close(); await rm(root, { recursive: true, force: true }); }
});

test("time budgets validate seconds, persist into Tasks options and preserve old-client updates", async () => {
  for (const key of ["workSeconds", "wrapUpSeconds", "summarySeconds"]) {
    const [min, max] = TASK_BUDGET_LIMITS[key];
    for (const value of [min - 1, max + 1, 1.5, "60", NaN]) {
      assert.throws(() => taskBudgetPolicy("subagent", { [key]: value }));
      assert.equal(budgetSchema.safeParse({ ...taskBudgetDefaults, [key]: value }).success, false);
    }
  }
  const root = await mkdtemp(join(tmpdir(), "axiom-time-budget-"));
  const database = new Database(join(root, "axiom.db"));
  const sessions = new Sessions(factory, undefined, undefined, database);
  try {
    sessions.configureTaskBudget({ ...taskBudgetDefaults, workSeconds: 120, wrapUpSeconds: 45, summarySeconds: 15 });
    sessions.configureTaskBudget({ maxTurns: 30, wrapUpWindow: 3 });
    assert.equal(sessions.getTaskBudget().workSeconds, 120, "older clients must not reset wall-clock configuration");
    const id = await sessions.create(root);
    assert.deepEqual(sessions.get(id).tasks.options, { workMs: 120000, wrapUpMs: 45000, summaryMs: 15000, cleanupMs: 10000 });
    sessions.get(id).emit({ type: "agent.message.end", data: { entryId: "time-seed", message: { role: "user", content: "seed" } } });
    assert.equal(sessions.store.getSession(id).selection.taskBudget.summarySeconds, 15);
    const parsed = command.parse({ id: "rpc", type: "task.cancel", sessionId: id, taskId: "task" });
    assert.equal(parsed.mode, "summary"); assert.equal(parsed.reason, "");
    assert.equal(command.safeParse({ ...parsed, mode: "unknown" }).success, false);
  } finally { await sessions.close(); database.close(); await rm(root, { recursive: true, force: true }); }
});

test("全局预算读写口径对称：脏键不丢合法值，无库实例报未启用持久化", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-budget-global-"));
  const database = new Database(join(root, "axiom.db"));
  const memory = new Sessions(factory);
  try {
    // 旧版本/未来字段留下的未知键：strict 解析不得连合法值一起丢掉。
    database.set("settings", "taskBudget", { maxTurns: 40, wrapUpWindow: 4, legacyKey: true });
    assert.deepEqual(new Sessions(factory, undefined, undefined, database).getTaskBudget(), { ...taskBudgetDefaults, maxTurns: 40, wrapUpWindow: 4 });
    // 真正非法的值仍回退默认，不阻断启动。
    database.set("settings", "taskBudget", { maxTurns: 1 });
    assert.deepEqual(new Sessions(factory, undefined, undefined, database).getTaskBudget(), taskBudgetDefaults);
    database.set("settings", "taskBudget", "不是对象");
    assert.deepEqual(new Sessions(factory, undefined, undefined, database).getTaskBudget(), taskBudgetDefaults);
    // 读侧有库判断，写侧也必须有：纯内存实例要报可读错误，不能抛 TypeError。
    assert.deepEqual(memory.getTaskBudget(), taskBudgetDefaults);
    assert.throws(() => memory.configureTaskBudget({ maxTurns: 30, wrapUpWindow: 3 }), /未启用/);
  } finally { await memory.close(); database.close(); await rm(root, { recursive: true, force: true }); }
});
