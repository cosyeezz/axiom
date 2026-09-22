export const EXECUTION_DEFAULTS = Object.freeze({ workMs: 600_000, wrapUpMs: 180_000, summaryMs: 60_000, cleanupMs: 10_000 });
export const ACTIVE_TASK_STATES = ["starting", "running", "wrapping", "stopping", "summarizing"];

export function stopReport(job, detail = "") {
  const stop = job.stop || {};
  return `本次子任务已被停止，以下是部分成果，不代表原任务完成。\n停止来源：${stop.source || "unknown"}\n停止原因：${stop.reason || "未填写"}\n停止模式：${stop.mode || "summary"}\n工具停止状态：${job.cleanupStatus || "unknown"}\n${detail}\n${job.partialText ? `已有输出（未经补充验证）：\n${job.partialText}` : "请从保留的会话历史核实已有产出；没有确认的完整成果。"}\n停止不等于回滚，已发生的文件改动或外部操作可能仍需核实。不要原样重启任务；请利用已有成果，仅针对必要缺口重新评估。`;
}

export function stopSummaryPrompt(job) {
  return `[Axiom 停止后总结]\n本次任务的工作执行已被停止，勿恢复原任务。\n停止来源：${job.stop.source}\n停止原因：${job.stop.reason || "未填写"}\n工具停止状态：${job.cleanupStatus}\n本次执行耗时：${Math.round((Date.now() - job.startedAt) / 1000)} 秒。任务链累计耗时：${Math.round((job.totalElapsedMs || 0) / 1000)} 秒（不含本次）。\n请仅基于已有历史总结，禁止调用任何工具。开头明确告知主代理任务被停止，结果仅为部分成果。列出：已完成工作与证据；未完成及未验证项；已发生改动、潜在副作用；简短耗时归因（事实与推测分开，不确定请说明）；后续如何利用成果、缩小剩余任务范围。不要为总结补充调查，不要求原样重试。`;
}

// Promise.race 的超时不意味着底层操作停止；调用方必须保留并隔离原操作。
export async function bounded(operation, ms) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(operation).then(value => ({ settled: true, value }), error => ({ settled: true, error })),
      new Promise(resolve => { timer = setTimeout(() => resolve({ settled: false }), ms); }),
    ]);
  } finally { clearTimeout(timer); }
}
