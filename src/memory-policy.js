// 摘要策略与提示词唯一来源：memoryHooks 装配（会话创建、早于任何模型请求）与 pi 记忆扩展共用。
// 环境变量每次 factory 建会话解析一次，非法配置直接报错；缺省回退默认值。
export const SUMMARY_SYSTEM_PROMPT = "收到[摘要提醒]时，在回复末尾输出一个极简摘要（<30字）放到<axiom_summary></axiom_summary>中：自上次摘要以来新增的已确认事实、关键结论或阻塞点，不重复旧内容，不写空泛进度。此内容进入工作记忆。";

// 动态提醒原文：每满 N 个累计 turn 由代码在下一次请求前注入一次，不让模型计数。
export const SUMMARY_REMINDER = "[摘要提醒] 本次回复请按约定输出增量摘要。";

// 仅主代理拼接在系统提示词原文之后：委派回复也按同一约定携带正文摘要标签。
export const SUMMARY_DELEGATE = "调用 delegate 委派任务时也须输出上述摘要，与提醒同时发生时只输出一次。";

const intEnv = (name, min, max, hint) => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`环境变量 ${name} 须为${hint}，当前为 "${raw}"`);
  return value;
};

export function memoryPolicy(role = "main") {
  const subagent = role === "subagent";
  const maxChars = intEnv("AXIOM_SUMMARY_MAX_CHARS", 2, Number.MAX_SAFE_INTEGER, "不小于2的整数") ?? 30;
  return {
    interval: intEnv(subagent ? "AXIOM_SUBAGENT_SUMMARY_TURNS" : "AXIOM_MAIN_SUMMARY_TURNS", 1, Infinity, "正整数") ?? (subagent ? 6 : 3),
    maxChars,
    systemPrompt: SUMMARY_SYSTEM_PROMPT.replace("<30字", `<${maxChars}字`),
  };
}
