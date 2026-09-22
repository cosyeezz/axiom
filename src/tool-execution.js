import { performance } from "node:perf_hooks";
export const TOOL_TIMEOUT_PROMPT = "命令工具 bash/powershell 未填写 timeout 时系统使用 180 秒。长测试/构建请提前显式设置合理秒数，通常建议不超过 600 秒，确需更长可明确设置。主代理可显式 -1 不设工具超时；子代理禁止不限时及脱离管理的常驻进程。超时不是回滚，重试前核实部分产出与副作用，不要原样反复重试。";

export function createToolExecutionPolicy({ subagent = false, summarizing = () => false, emit = () => {} } = {}) {
  const calls = new Map();
  const snapshot = record => ({ startedAt: record.startedAt, ...(record.endedAt ? { endedAt: record.endedAt } : {}),
    elapsedMs: record.elapsedMs ?? Math.max(0, performance.now() - record.tick),
    timeoutSeconds: record.timeoutSeconds, timeoutSource: record.timeoutSource });
  const observe = (phase, event) => {
    let record = calls.get(event.toolCallId);
    if (phase === "start") {
      record = { toolCallId: event.toolCallId, toolName: event.toolName, startedAt: Date.now(), tick: performance.now() };
      calls.set(event.toolCallId, record);
    }
    if (!record) return {};
    if (phase === "end") { record.endedAt = Date.now(); record.elapsedMs = performance.now() - record.tick; }
    const data = snapshot(record);
    if (phase === "end") calls.delete(event.toolCallId);
    return data;
  };
  const extension = pi => {
    pi.on("tool_call", event => {
      if (summarizing()) return { block: true, reason: "停止后总结禁止工具调用；只基于已有历史输出总结。" };
      if (!["bash", "powershell"].includes(event.toolName)) return;
      const value = event.input.timeout;
      let source = "explicit", effective = value;
      if (value === undefined) { effective = 180; source = "default"; event.input.timeout = effective; }
      else if (value === -1 && !subagent) { effective = null; source = "unlimited"; delete event.input.timeout; }
      else if (!Number.isFinite(value) || value <= 0 || value * 1000 > 2_147_483_647)
        return { block: true, reason: subagent && value === -1 ? "子代理不允许不限时命令，请设置有限正数 timeout（秒），并遵守任务总预算。" : "timeout 必须是工具支持范围内的有限正数（秒）；只有主代理可显式 -1。" };
      const record = calls.get(event.toolCallId);
      if (record) {
        record.timeoutSeconds = effective; record.timeoutSource = source;
        emit({ type: "tool.state", data: { phase: "policy", toolCallId: event.toolCallId, toolName: event.toolName, ...snapshot(record) } });
      }
    });
    pi.on("tool_result", event => {
      const record = calls.get(event.toolCallId);
      if (!record || !["bash", "powershell"].includes(event.toolName)) return;
      const text = (event.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
      // pi 的命令超时错误以固定尾部返回；不把一般退出失败、用户 abort 或输出中出现 timeout 当作超时。
      const timedOut = event.isError && new RegExp(`(?:^|\\n)Command timed out after ${record.timeoutSeconds} seconds\\s*$`).test(text);
      const details = { ...(event.details && typeof event.details === "object" ? event.details : {}), execution: { ...snapshot(record), timedOut } };
      if (!timedOut) return { details };
      const feedback = record.timeoutSource === "default"
        ? "本次未填写 timeout，系统使用默认 180 秒并因达到时限终止。请根据任务预计耗时显式设置 timeout；通常建议不超过 600 秒，长测试确有需要可设置更长。"
        : `本次达到显式设置的 ${record.timeoutSeconds} 秒时限。请评估范围、参数或执行方式，不要原样重试。`;
      return { details, content: [...event.content, { type: "text", text: `[Axiom 工具超时]\n${feedback}\n命令可能已部分执行；重试前检查已有输出与副作用。` }] };
    });
  };
  return { observe, extension, active: () => [...calls.values()].map(record => ({ toolCallId: record.toolCallId, toolName: record.toolName, ...snapshot(record) })) };
}
