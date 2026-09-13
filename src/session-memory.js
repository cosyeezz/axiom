import { extractMemoryTags } from "../public/memory-tags.js";
import { taskBudgetPolicy } from "./task-budget.js";

const textOf = (message) => (message.content || []).filter((block) => block.type === "text").map((block) => block.text).join("\n");

// 会话记忆钩子：只剩两件事——主代理的自报标题，子代理的轮次预算策略。
// 轮次预算建会话时捕获一次（逐请求不重读，避免中途漂移），同一 policy 对象同时供
// 本文件与 pi 层（hooks.policy）使用，两处规则永远一致。
// save(change) 变更契约（内存照旧同步先改，save 只描述本轮落了什么，供增量落盘）：
//   {title: true}   会话标题有变（无变不调用 save）
export function memoryHooks(item, save, job) {
  return {
    role: job ? "subagent" : "main",
    policy: taskBudgetPolicy(job ? "subagent" : "main", item.taskBudget),
    onReply({ message }) {
      // 标题只认主代理的首次成功回复；失败/中断的残文可能带半截标签，不采信。
      if (job || message.role !== "assistant") return;
      if (["error", "aborted", "length"].includes(message.stopReason)) return;
      if (!item.titlePending || item.titleManual) return;
      const { title } = extractMemoryTags(textOf(message));
      if (!title || [...title].length > 10) return;
      item.title = title;
      item.titlePending = false;
      item.emit({ type: "session.title", data: { title: item.title } });
      save({ title: true });
    },
  };
}
