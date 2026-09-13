// 子代理轮次预算：memoryHooks 装配（会话创建、早于任何模型请求）与 pi 记忆扩展共用。
// 参数来自会话上的持久化配置（item.taskBudget，SQLite 侧负责读写），缺省回退默认值；
// 非法配置直接报错（建会话即失败，早于任何模型请求）。
// 上限是软的：到点注入收尾指令让子代理自己交付，不 abort——abort 会让 result() 抛错，
// 前面所有轮次的产出一起丢掉（pi.js result() 对 aborted/error/length 直接 throw）。
export const WRAP_UP_PROMPT = "[轮次预算] 本任务的轮次预算即将用尽。停止新的探索，用接下来的回复交付：已确认的事实、未查清的部分、建议的下一步拆分。任务比预期大就直说需要拆分，不要硬做完。";

// 配置边界：协议 zod 校验与本处二次校验共用同一组常数，保证规则验证一致。
export const TASK_BUDGET_LIMITS = { turns: [3, 200], window: [1, 10] };

// 默认预算：子代理 20 轮，最后 2 轮进入收尾窗口（第 18 轮开始注入收尾指令）。
export const taskBudgetDefaults = { maxTurns: 20, wrapUpWindow: 2 };

const within = (value, [min, max], label) => {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`轮次预算${label}须为 ${min}-${max} 的整数，当前为 ${JSON.stringify(value)}`);
  return value;
};

// 主代理没有预算（人在盯，且它是会话本体）；只有子代理返回策略。
export function taskBudgetPolicy(role = "main", budget = null) {
  if (role !== "subagent") return null;
  const maxTurns = budget?.maxTurns === undefined
    ? taskBudgetDefaults.maxTurns
    : within(budget.maxTurns, TASK_BUDGET_LIMITS.turns, "轮次上限");
  const wrapUpWindow = budget?.wrapUpWindow === undefined
    ? taskBudgetDefaults.wrapUpWindow
    : within(budget.wrapUpWindow, TASK_BUDGET_LIMITS.window, "收尾窗口");
  // 窗口不得吃掉整个预算：至少留 1 轮正常干活。
  return { maxTurns, wrapUpWindow, wrapUpAt: Math.max(1, maxTurns - wrapUpWindow) };
}

// 开工前告知预算，子代理才能按预算规划路线（否则会在第 1 轮定一个 50 轮的打法）。
export const budgetSystemPrompt = ({ maxTurns }) =>
  `本任务的轮次预算约 ${maxTurns} 轮。按这个规模规划，不要展开预算外的探索；预算将尽时会收到 [轮次预算] 提示，届时立即交付已有结论。`;
