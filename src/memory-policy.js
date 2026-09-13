// 摘要策略与提示词唯一来源：memoryHooks 装配（会话创建、早于任何模型请求）与 pi 记忆扩展共用。
// 参数来自会话上的持久化配置（item.memorySummary，SQLite 侧负责读写），缺省回退默认值；
// 非法配置直接报错（建会话即失败，早于任何模型请求）。
export const SUMMARY_SYSTEM_PROMPT = "收到[摘要提醒]时，在回复末尾输出一个极简摘要（<30字）放到<axiom_summary></axiom_summary>中：自上次摘要以来新增的已确认事实、关键结论或阻塞点，不重复旧内容，不写空泛进度。此内容进入工作记忆。";

// 动态提醒原文：每满 N 个累计 turn 由代码在下一次请求前注入一次，不让模型计数。
export const SUMMARY_REMINDER = "[摘要提醒] 本次回复请按约定输出增量摘要。";

// 仅主代理拼接在系统提示词原文之后：委派回复也按同一约定携带正文摘要标签。
export const SUMMARY_DELEGATE = "调用 delegate 委派任务时也须输出上述摘要，与提醒同时发生时只输出一次。";

// 配置边界：协议 zod 校验与本处二次校验共用同一组常数，保证规则验证一致。
export const MEMORY_SUMMARY_LIMITS = { turns: [1, 100], chars: [2, 100] };

// 默认策略：主代理每 3 轮、子代理每 6 轮提醒一次，单条摘要须小于 30 字。
export const memorySummaryDefaults = { mainTurns: 3, subagentTurns: 6, maxChars: 30 };

const within = (value, [min, max], label) => {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`摘要配置${label}须为 ${min}-${max} 的整数，当前为 ${JSON.stringify(value)}`);
  return value;
};

export function memoryPolicy(role = "main", summary = null) {
  const subagent = role === "subagent";
  const key = subagent ? "subagentTurns" : "mainTurns";
  const maxChars = summary?.maxChars === undefined
    ? memorySummaryDefaults.maxChars
    : within(summary.maxChars, MEMORY_SUMMARY_LIMITS.chars, "单条摘要字数上限");
  const interval = summary?.[key] === undefined
    ? memorySummaryDefaults[key]
    : within(summary[key], MEMORY_SUMMARY_LIMITS.turns, subagent ? "子代理提醒轮数" : "主代理提醒轮数");
  return {
    interval,
    maxChars,
    systemPrompt: SUMMARY_SYSTEM_PROMPT.replace("<30字", `<${maxChars}字`),
  };
}
