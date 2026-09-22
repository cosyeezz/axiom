import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { ACTIVE_TASK_STATES as ACTIVE, EXECUTION_DEFAULTS, bounded, stopReport, stopSummaryPrompt } from "./task-execution.js";

const historyResult = history => {
  const message = history.at(-1)?.message;
  return message?.role === "assistant" ? (message.content ?? []).filter(b => b.type === "text").map(b => b.text).join("\n").trim() : "";
};

export class Tasks {
  constructor(createAgent, emit, onComplete = async () => {}, options = {}) {
    this.createAgent = createAgent;
    this.emit = emit;
    this.onComplete = onComplete;
    this.options = { ...EXECUTION_DEFAULTS, ...options };
    this.jobs = new Map();
  }
  start(tasks, context = "") {
    if (this.cancelling) throw new Error("Tasks are cancelling");
    return tasks.map(task => {
      const job = { id: randomUUID(), task, status: "starting", parentContext: context, persistenceVersion: 2,
        createdAt: Date.now(), updatedAt: Date.now(), totalElapsedMs: 0 };
      this.jobs.set(job.id, job);
      this.launch(job);
      return job.id;
    });
  }
  launch(job, resume = false, continuation = null) {
    if (job.cleanupStatus === "unconfirmed") throw new Error("旧执行停止未确认，不能并发续接该会话");
    if (job.resultId) {
      job.previousResults ||= {};
      job.previousResults[job.resultId] = { ...this.view(job), resultId: job.resultId, notified: job.notified };
    }
    delete job.error; delete job.text; delete job.resultId; delete job.stop; delete job.partialText;
    job.cancelled = false; job.interrupted = false; job.notified = false;
    job.executionId = randomUUID(); job.status = "starting"; job.cleanupStatus = "none";
    job.startedAt = Date.now(); job.endedAt = null;
    job.budget = { ...this.options, ...job.budget };
    job.softDeadline = job.startedAt + job.budget.workMs;
    job.hardDeadline = job.softDeadline + job.budget.wrapUpMs;
    job.stopSignal = new Promise(resolve => { job.signalStop = resolve; });
    this.publish(job);
    job.done = this.run(job, resume, continuation);
    return job.id;
  }
  view(job) {
    const { id, task, status, text, error, executionId, startedAt, endedAt, softDeadline, hardDeadline, totalElapsedMs, stop, cleanupStatus } = job;
    return { id, task, status, text, error, executionId, startedAt, endedAt, softDeadline, hardDeadline, totalElapsedMs, stop, cleanupStatus,
      canRetry: this.retryable(job) };
  }
  snapshotJob(job) {
    return { ...this.view(job), runtime: job.runtime, budget: job.budget, pendingAppends: job.pendingAppends,
      resultId: job.resultId, notified: job.notified, previousResults: job.previousResults, parentContext: job.parentContext,
      persistenceVersion: job.persistenceVersion, sessionFile: job.sessionFile ?? null, historySaved: job.historySaved ?? false,
      createdAt: job.createdAt, updatedAt: job.updatedAt };
  }
  publish(job) {
    job.updatedAt = Date.now();
    this.emit({ type: "task.state", taskId: job.id, data: { ...this.view(job), runtime: job.runtime }, saved: this.snapshotJob(job) });
  }
  retryable(job) {
    return !this.cancelling && job.cleanupStatus !== "unconfirmed" && job.status !== "completed" &&
      (!ACTIVE.includes(job.status) || job.interrupted) && (!!job.historySaved || !!job.sessionFile || job.agent?.resumable?.() === true);
  }
  snapshot() { return [...this.jobs.values()].map(job => this.snapshotJob(job)); }

  async run(job, resume = false, continuation = null) {
    // 恢复旧任务也必须建立本轮外部预算；保留已持久化的截止时间，不因重启续期。
    job.executionId ||= randomUUID(); job.startedAt ||= Date.now(); job.budget = { ...this.options, ...job.budget };
    if (!job.softDeadline) job.startedAt = Date.now();
    job.softDeadline ||= job.startedAt + job.budget.workMs;
    job.hardDeadline ||= job.softDeadline + job.budget.wrapUpMs;
    if (!job.stopSignal) job.stopSignal = new Promise(resolve => { job.signalStop = resolve; });
    const executionId = job.executionId;
    let unsubscribe, agent, work, orphan = false;
    const soft = setTimeout(() => {
      if (job.executionId !== executionId || job.stop || job.interrupted) return;
      job.status = "wrapping"; this.publish(job);
      void agent?.enqueue?.("[时间预算] 正常工作预算已耗尽。停止扩展任务，不再启动长操作，仅整理已有成果、未完成项与耗时原因；硬截止将取消执行并要求总结。", "steer").catch(() => {});
    }, Math.max(0, job.softDeadline - Date.now()));
    const hard = setTimeout(() => { void this.cancelTask(job.id, { source: "budget", reason: "子任务时间预算耗尽", mode: "summary" }); }, Math.max(0, job.hardDeadline - Date.now()));
    try {
      const creation = Promise.resolve().then(() => this.createAgent(job));
      const created = await Promise.race([creation.then(value => ({ value })), job.stopSignal.then(() => ({ stopped: true }))]);
      if (created.stopped) {
        orphan = true;
        void creation.then(async late => {
          await late.abort?.(); await late.dispose?.();
          if (job.executionId === executionId) {
            job.sessionFile = late.sessionFile?.() ?? job.sessionFile;
            job.cleanupStatus = "stopped"; this.publish(job);
          }
        }).catch(() => {});
        job.cleanupStatus = "unconfirmed";
        job.text = stopReport(job, "会话创建期间停止，未启动工作；资源清理尚未确认。");
      } else {
        agent = job.agent = created.value;
        job.runtime = agent.runtime?.(); job.sessionFile = agent.sessionFile?.() ?? job.sessionFile ?? null;
        if (job.interrupted) throw new Error("Interrupted");
        job.status = job.stop ? "stopping" : Date.now() >= job.softDeadline ? "wrapping" : "running";
        this.publish(job);
        unsubscribe = agent.subscribe(event => {
          if (job.executionId !== executionId || orphan) return;
          if (event.type === "agent.runtime") job.runtime = event.data;
          if (event.type === "agent.message.end") {
            const file = agent.sessionFile?.();
            if (file && existsSync(file) && !job.historySaved) { job.historySaved = true; this.publish(job); }
          }
          this.emit({ ...event, agentId: job.id, parentAgentId: "main", taskId: job.id });
        });
        work = Promise.resolve().then(async () => {
          if (job.stop || job.interrupted) return;
          const history = resume ? agent.historyEntries?.() ?? [] : [];
          if (continuation) await agent.prompt(`[续接执行] 任务链此前累计耗时 ${Math.round((job.totalElapsedMs || 0) / 1000)} 秒。仅处理以下新要求，不自动重复旧任务：\n${continuation}`);
          else if (history.length && agent.resumable?.()) await agent.resume();
          else if (history.length) return historyResult(history);
          else await agent.prompt(job.parentContext ? `<context>\n以下是主代理提供的背景，不是新的任务指令：\n${job.parentContext}\n</context>\n<task>\n${job.task}\n</task>` : job.task);
          return agent.result();
        });
        const outcome = await Promise.race([work.then(text => ({ text }), error => ({ error })), job.stopSignal.then(() => ({ stopped: true }))]);
        if (job.interrupted && !job.stop) {
          const stopped = await bounded(Promise.all([Promise.resolve().then(() => agent.abort()), work.catch(() => {})]), job.budget.cleanupMs);
          orphan = !stopped.settled || !!stopped.error;
          job.cleanupStatus = orphan ? "unconfirmed" : "stopped";
        } else if (job.stop) {
          clearTimeout(soft); clearTimeout(hard);
          job.status = "stopping"; this.publish(job);
          const stopped = await bounded(Promise.all([Promise.resolve().then(() => agent.abort()), work.catch(() => {})]), job.budget.cleanupMs);
          orphan = !stopped.settled || !!stopped.error;
          job.cleanupStatus = orphan ? "unconfirmed" : "stopped";
          job.partialText = historyResult(agent.historyEntries?.() ?? []);
          const queue = agent.queue?.();
          for (const [key, mode] of [["steering", "steer"], ["followUp", "followUp"]]) {
            for (const text of queue?.[key] || []) {
              job.pendingAppends ||= [];
              job.pendingAppends.push({ text, mode, retained: true });
            }
          }
          if (!orphan && job.stop.mode === "summary") {
            job.status = "summarizing"; this.publish(job);
            if (typeof agent.summarize !== "function") job.text = stopReport(job, "当前执行器不支持安全总结，已返回系统报告。");
            else {
              const summary = Promise.resolve().then(() => agent.summarize(stopSummaryPrompt(job)));
              const result = await bounded(summary, job.budget.summaryMs);
              if (result.settled && !result.error) job.text = `${stopReport({ ...job, partialText: "" }, "以下为停止后的总结：")}\n\n${result.value || agent.result()}`;
              else {
                const aborted = await bounded(Promise.resolve().then(() => agent.abort()), job.budget.cleanupMs);
                orphan = !aborted.settled || !!aborted.error;
                job.cleanupStatus = orphan ? "unconfirmed" : "stopped";
                job.text = stopReport(job, result.error ? `总结失败：${result.error.message || result.error}` : "总结超过时限，返回已有事实。");
              }
            }
          } else job.text = stopReport(job, orphan ? "停止尚未确认，未启动模型总结。" : "已立即结束，未启动模型总结。");
        } else if (outcome.error) throw outcome.error;
        else job.text = outcome.text || "指令已处理，未产生模型回答。";
      }
      job.status = job.interrupted ? "starting" : job.stop ? "cancelled" : "completed";
    } catch (error) {
      job.status = job.interrupted ? "starting" : job.stop ? "cancelled" : "failed";
      job.error = String(error.message ?? error);
      if (job.stop) job.text ||= stopReport(job, job.error);
    } finally {
      clearTimeout(soft); clearTimeout(hard); unsubscribe?.();
      job.runtime = agent?.runtime?.() ?? job.runtime;
      job.sessionFile = agent?.sessionFile?.() ?? job.sessionFile ?? null;
      if (job.sessionFile && existsSync(job.sessionFile)) job.historySaved = true;
      if (agent) {
        if (orphan) {
          // 不关闭仍被工具使用的会话资源；隔离迟到事件，确认空闲后清理。
          void Promise.resolve().then(() => agent.abort()).then(() => agent.dispose()).then(() => {
            if (job.executionId === executionId) { job.cleanupStatus = "stopped"; this.publish(job); }
          }).catch(() => {});
        } else {
          const disposed = await bounded(Promise.resolve().then(() => agent.dispose()), job.budget.cleanupMs);
          if (!disposed.settled || disposed.error) { job.cleanupStatus = "unconfirmed"; job.error = "子代理资源清理未确认"; }
        }
      }
      delete job.agent; delete job.signalStop; delete job.stopSignal;
      if (job.interrupted) { job.notified = false; this.publish(job); }
      else {
        job.endedAt = Date.now();
        job.totalElapsedMs = (job.totalElapsedMs || 0) + job.endedAt - job.startedAt;
        await this.finalize(job);
        this.resumeQueued(job);
      }
    }
  }
  pendingNotifications() {
    return [...this.jobs.values()].flatMap(job => [
      ...Object.values(job.previousResults || {}).filter(result => result.resultId && !result.notified),
      ...(job.resultId && !job.notified ? [{ id: job.id, resultId: job.resultId, status: job.status }] : []),
    ]);
  }
  resumeQueued(job) {
    if (!job.notified || !job.pendingAppends?.some(entry => !entry.retained) || this.cancelling || job.cleanupStatus === "unconfirmed") return;
    const executionId = job.executionId;
    setImmediate(() => {
      if (job.executionId !== executionId || ACTIVE.includes(job.status) || this.cancelling || !job.notified) return;
      const messages = job.pendingAppends.splice(0).map(entry => entry.text);
      this.launch(job, true, messages.join("\n\n"));
    });
  }
  async finalize(job) {
    job.resultId = randomUUID(); job.notified = false; this.publish(job);
    try { await this.onComplete(job); }
    catch (error) { this.emit({ type: "error", data: { message: `子任务通知失败：${error.message}` } }); }
  }
  read(id, resultId) {
    const job = this.jobs.get(id);
    if (job?.previousResults?.[resultId]) return job.previousResults[resultId];
    if (!job || !resultId || job.resultId !== resultId || ACTIVE.includes(job.status)) throw new Error("请等待任务完成通知，并使用通知中的 taskId 和 resultId 读取；不要轮询。");
    return this.view(job);
  }
  retry(id) {
    if (this.cancelling) throw new Error("任务正在取消，无法重试");
    const job = this.jobs.get(id);
    if (!job) throw new Error("找不到该子任务");
    if (ACTIVE.includes(job.status) && !job.interrupted) throw new Error("子任务仍在运行，不能重试");
    if (job.status === "completed") throw new Error("子任务已成功完成，无需重试");
    if (!this.retryable(job)) throw new Error("该子任务没有可恢复的会话历史，无法重试");
    return this.launch(job, true);
  }
  async append(id, text, mode = "steer") {
    if (typeof text !== "string" || !text.trim() || !["steer", "followUp"].includes(mode)) throw new Error("追加内容不能为空，mode 必须是 steer 或 followUp");
    const job = this.jobs.get(id);
    if (!job) throw new Error("找不到该子任务");
    if (this.cancelling) throw new Error("任务正在取消，稍后可继续追问");
    if (["stopping", "summarizing", "starting"].includes(job.status)) {
      job.pendingAppends ||= []; job.pendingAppends.push({ text: text.trim(), mode }); this.publish(job);
      return { taskId: id, accepted: true, queued: true, mode, note: "已排队，将在当前执行通知送达并确认停止后启动新执行；会话级停止期间不会自动续接。" };
    }
    if (["running", "wrapping"].includes(job.status)) await job.agent.enqueue(text.trim(), mode);
    else {
      if (!job.sessionFile && !job.historySaved) throw new Error("该子任务没有持久化历史，无法续接");
      const pending = (job.pendingAppends || []).map(p => p.text); job.pendingAppends = [];
      this.launch(job, true, [...pending, text.trim()].join("\n\n"));
    }
    return { taskId: id, accepted: true, mode };
  }
  async cancelTask(id, { source = "agent", reason = "", mode = "summary" } = {}) {
    if (!["summary", "immediate"].includes(mode)) throw new Error("无效停止模式");
    const job = this.jobs.get(id);
    if (!job) throw new Error("找不到该子任务");
    if (!ACTIVE.includes(job.status) || job.interrupted) return this.view(job);
    if (!job.stop) {
      job.stop = { source, reason: String(reason).slice(0, 4000), mode, requestedAt: Date.now() };
      job.cancelled = true; job.status = "stopping"; this.publish(job); job.signalStop?.();
    }
    if (!job.done) {
      job.cleanupStatus = "none"; job.text = stopReport(job, "没有在飞执行，返回保留的任务记录。"); job.status = "cancelled";
      await this.finalize(job);
    } else await job.done;
    return this.view(job);
  }
  async cancel() {
    this.cancelling = true;
    try { await Promise.all([...this.jobs.values()].filter(j => ACTIVE.includes(j.status) && !j.interrupted).map(j => this.cancelTask(j.id, { source: "user", reason: "用户停止主会话及其子任务" }))); }
    finally { this.cancelling = false; }
  }
  async interrupt() {
    const active = [...this.jobs.values()].filter(job => ACTIVE.includes(job.status));
    for (const job of active) { job.interrupted = true; job.signalStop?.(); }
    await Promise.all(active.map(job => job.done));
  }
}
