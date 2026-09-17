import { estimateTokens } from "@earendil-works/pi-coding-agent";

const keys = ["input", "output", "cacheRead", "cacheWrite"];
const zero = () => Object.fromEntries(keys.map(key => [key, 0]));
const number = value => Number.isFinite(value) && value >= 0 ? value : 0;

// 全 entries 口径：分页、压缩及当前分支切换不会抹去已发生的消耗。
// 工具与摘要未记录可靠的模型身份，单独列桶，不能归到当前选中模型。
export function sessionBilling(entries = []) {
  const groups = new Map();
  let records = 0, unpriced = 0;
  for (const entry of entries) {
    const message = entry.type === "message" ? entry.message : null;
    const usage = message?.role === "assistant" || message?.role === "toolResult"
      ? message.usage : ["compaction", "branch_summary"].includes(entry.type) ? entry.usage : null;
    if (!usage) continue;
    const model = message?.role === "assistant"
      ? [message.provider, message.model].filter(Boolean).join("/") || "未记录模型"
      : message?.role === "toolResult" ? "工具用量（独立计费）" : "摘要用量（独立计费）";
    if (!groups.has(model)) groups.set(model, { model, tokens: zero(), cost: { ...zero(), total: 0 } });
    const group = groups.get(model);
    for (const key of keys) {
      group.tokens[key] += number(usage[key]);
      group.cost[key] += number(usage.cost?.[key]);
    }
    group.cost.total += number(usage.cost?.total);
    records++;
    if (!Number.isFinite(usage.cost?.total)) unpriced++;
  }
  const cost = { ...zero(), total: 0 };
  for (const group of groups.values()) for (const key of [...keys, "total"]) cost[key] += group.cost[key];
  return { records, unpriced, cost, groups: [...groups.values()] };
}

export function combinedBilling(main, tasks = []) {
  const agents = [{ id: "main", billing: main ?? null }, ...tasks.map(task => ({ id: task.id, task: task.task, status: task.status, billing: task.runtime?.billing ?? null }))];
  const groups = new Map();
  const cost = { ...zero(), total: 0 };
  let records = 0, unpriced = 0;
  for (const { billing } of agents) {
    if (!billing) continue;
    records += number(billing.records); unpriced += number(billing.unpriced);
    for (const key of [...keys, "total"]) cost[key] += number(billing.cost?.[key]);
    for (const group of billing.groups ?? []) {
      if (!groups.has(group.model)) groups.set(group.model, { model: group.model, tokens: zero(), cost: { ...zero(), total: 0 } });
      const target = groups.get(group.model);
      for (const key of keys) target.tokens[key] += number(group.tokens?.[key]);
      for (const key of [...keys, "total"]) target.cost[key] += number(group.cost?.[key]);
    }
  }
  return { records, unpriced, cost, groups: [...groups.values()], agents, incomplete: agents.some(agent => !agent.billing) };
}

export function usageRuntime(messages = [], model = {}, context) {
  const usage = messages.findLast(message => message.role === "assistant" && message.usage)?.usage ?? null;
  if (!Number.isFinite(context?.tokens)) {
    const tokens = messages.reduce((sum, message) => sum + number(estimateTokens(message)), 0);
    const contextWindow = model.contextWindow ?? context?.contextWindow ?? 0;
    context = { tokens, contextWindow, percent: contextWindow > 0 ? tokens / contextWindow * 100 : null, estimated: true };
  }
  return { usage, context };
}
