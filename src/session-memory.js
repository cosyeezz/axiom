import { extractMemoryTags, TITLE_MAX } from "../public/memory-tags.js";
import { splitAnswer } from "../public/answer-tags.js";
import { taskBudgetPolicy } from "./task-budget.js";

const textOf = (message) => (message.content || []).filter((block) => block.type === "text").map((block) => block.text).join("\n");

// 会话记忆钩子：主代理的自报标题（含索要开关 wantsTitle），子代理的轮次预算策略。
// 轮次预算建会话时捕获一次（逐请求不重读，避免中途漂移），同一 policy 对象同时供
// 本文件与 pi 层（hooks.policy）使用，两处规则永远一致。
// save(change) 变更契约（内存照旧同步先改，save 只描述本轮落了什么，供增量落盘）：
//   {title: true}   会话标题有变（无变不调用 save）
export function memoryHooks(item, save, job) {
  return {
    role: job ? "subagent" : "main",
    policy: taskBudgetPolicy(job ? "subagent" : "main", item.taskBudget),
    // 标题索要开关：pi 层 context 钩子逐请求读取，决定是否随请求注入标题指令。
    // 首轮直接委派时模型常漏掉开头的 <title> 行，指令必须覆盖整轮（含工具后续轮）而不是只注首个请求。
    wantsTitle: () => !job && item.titlePending && !item.titleManual,
    onReply({ message }) {
      // 标题只认主代理的成功回复；失败/中断的残文可能带半截标签，不采信。
      if (job || message.role !== "assistant") return;
      if (["error", "aborted", "length"].includes(message.stopReason)) return;
      if (!item.titlePending || item.titleManual) return;
      const raw = textOf(message);
      const split = splitAnswer(raw);
      // 过程说明可能在 <axiom_display> 前；标题应按正式回答的首行提取。
      const { title } = extractMemoryTags(split.found ? split.answer : raw);
      if (!title || [...title].length > TITLE_MAX) return;
      item.title = title;
      // 只有真正拿到自报标题才固化「已定案」；没拿到就让 titleRequested 保持 false，下一条消息接着索要。
      item.titleRequested = true;
      item.titlePending = false;
      item.emit({ type: "session.title", data: { title: item.title } });
      save({ title: true });
    },
  };
}
