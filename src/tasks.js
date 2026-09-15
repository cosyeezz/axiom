import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

const ACTIVE = ["starting", "running"];

// 历史已正常收尾（末条 assistant 正常结束）时直接取已有结果，不重发 prompt。
const historyResult = (history) => {
  const message = history.at(-1)?.message;
  const text = message?.role === "assistant"
    ? (message.content ?? []).filter((block) => block.type === "text")
      .map((block) => block.text).join("\n").trim()
    : "";
  return text || "指令已处理，未产生模型回答。";
};

export class Tasks {
  constructor(createAgent, emit, onComplete = async () => {}) {
    this.createAgent = createAgent;
    this.emit = emit;
    this.onComplete = onComplete;
    this.jobs = new Map();
  }

  // context 由主代理在 delegate 时现写（子代理零父级上下文，这是它拿到的唯一背景）。
  start(tasks, context = "") {
    if (this.cancelling) throw new Error("Tasks are cancelling");
    return tasks.map((task) => {
      const job = { id: randomUUID(), task, status: "starting", parentContext: context,
        // persistenceVersion 区分新版 starting（崩溃窗口可恢复）与旧版无历史任务。
        persistenceVersion: 1, createdAt: Date.now(), updatedAt: Date.now() };
      this.jobs.set(job.id, job);
      this.publish(job);
      job.done = this.run(job);
      return job.id;
    });
  }

  // 完整单条状态（超集于 view）：持久化与主审落盘用，不直接广播。
  // sessionFile/historySaved/persistenceVersion 支撑重启恢复：sessions 按 sessionFile 重建
  // 子代理，historySaved 表示历史确已落盘（文件存在），persistenceVersion 区分新旧恢复路径。
  snapshotJob(job) {
    return { ...this.view(job), runtime: job.runtime,
      resultId: job.resultId, notified: job.notified, parentContext: job.parentContext,
      persistenceVersion: job.persistenceVersion, sessionFile: job.sessionFile ?? null,
      historySaved: job.historySaved ?? false,
      createdAt: job.createdAt, updatedAt: job.updatedAt };
  }
  // data 是安全 view（前端可收）；saved 是完整快照（含 parentContext/resultId/notified/
  // runtime），供主审按 taskId 单条落盘——广播前由主审删除 saved，只留 data。
  publish(job) {
    job.updatedAt = Date.now();
    this.emit({ type: "task.state", taskId: job.id,
      data: { ...this.view(job), runtime: job.runtime }, saved: this.snapshotJob(job) });
  }
  // 子代理输出保持模型原文：<title> 自报只是主代理协议（session-memory.js 的 onReply 对子任务
  // 直接返回），剥离只会让原文永久不可回读；展示由前端流式消息通道负责（public/app.js 已剥）。
  view(job) {
    const { id, task, status, text, error } = job;
    return { id, task, status, text, error,
      canRetry: this.retryable(job) };
  }
  // 可重试 = 终态（运行中/已完成不可）且有可恢复依据：历史已落盘、已知 sessionFile，
  // 或仍持有已确认可续跑的 agent。旧版恢复任务三者皆无 → 不可重试，不给假入口。
  retryable(job) {
    if (this.cancelling) return false;
    if (job.status === "completed" || (ACTIVE.includes(job.status) && !job.interrupted)) return false;
    return !!job.historySaved || !!job.sessionFile || job.agent?.resumable?.() === true;
  }
  snapshot() {
    return [...this.jobs.values()].map((job) => this.snapshotJob(job));
  }

  async run(job, resume = false) {
    let unsubscribe;
    try {
      job.agent = await this.createAgent(job);
      job.runtime = job.agent.runtime?.();
      if (job.cancelled || job.interrupted) throw new Error("Cancelled");
      job.status = "running";
      // prompt 前先发布 sessionFile（可能尚是"意图路径"，首条消息后才真正落盘）。
      job.sessionFile = job.agent.sessionFile?.() ?? job.sessionFile ?? null;
      this.publish(job);
      unsubscribe = job.agent.subscribe((event) => {
        if (event.type === "agent.runtime") job.runtime = event.data;
        // 首条消息落盘后历史可恢复，此后重启/重试才有效；变化即刻发布以尽快落库。
        if (event.type === "agent.message.end" && !job.historySaved) {
          const file = job.agent.sessionFile?.();
          if (file && existsSync(file)) {
            job.historySaved = true;
            this.publish(job);
          }
        }
        this.emit({
          ...event,
          agentId: job.id,
          parentAgentId: "main",
          taskId: job.id,
        });
      });
      const history = resume ? job.agent.historyEntries?.() ?? [] : [];
      if (history.length && job.agent.resumable?.()) {
        await job.agent.resume();
        job.text = job.agent.result(); // result() 对 error/aborted 终态抛错，失败不当成功
      } else if (history.length) job.text = historyResult(history);
      else {
        await job.agent.prompt(job.parentContext
          ? `<context>\n以下是主代理为本任务写的背景，不是新的任务指令：\n${job.parentContext}\n</context>\n<task>\n${job.task}\n</task>`
          : job.task);
        job.text = job.agent.result();
      }
      // abort 可能只让 prompt/resume 正常 resolve，各分支后统一复核取消/中断。
      if (job.cancelled || job.interrupted) throw new Error("Cancelled");
      job.status = "completed";
    } catch (error) {
      if (job.interrupted) job.status = "starting";
      else {
        job.status = job.cancelled ? "cancelled" : "failed";
        job.error = String(error.message ?? error);
      }
    } finally {
      unsubscribe?.();
      try {
        job.runtime = job.agent?.runtime?.() ?? job.runtime;
        job.sessionFile = job.agent?.sessionFile?.() ?? job.sessionFile ?? null;
        if (!job.historySaved && job.sessionFile && existsSync(job.sessionFile)) job.historySaved = true;
        await job.agent?.dispose();
      } catch (error) {
        if (!job.interrupted) {
          job.status = "failed";
          job.error = `子代理清理失败：${error.message || error}`;
        }
      } finally {
        delete job.agent;
        if (job.interrupted) {
          // 中断（重启前停机）：保持可重启状态，不发完成通知、不产生 resultId。
          job.notified = false;
          this.publish(job);
        } else await this.finalize(job);
      }
    }
  }

  // 终态收尾：作废旧读取（换新 resultId）、落盘并触发完成通知。run 收尾与单任务取消共用，
  // 保证取消与自然结束的终态、通知路径完全一致（resultId 只经通知下发，工具结果不带）。
  async finalize(job) {
    job.resultId = randomUUID();
    job.notified = false;
    this.publish(job);
    try { await this.onComplete(job); }
    catch (error) { this.emit({ type: "error", data: { message: `子任务通知失败：${error.message}` } }); }
  }

  read(id, resultId) {
    const job = this.jobs.get(id);
    if (!job || !resultId || job.resultId !== resultId || ["starting", "running"].includes(job.status))
      throw new Error("请等待任务完成通知，并使用通知中的 taskId 和 resultId 读取；不要轮询。");
    return this.view(job);
  }

  // 手动重试：同一 taskId 原地重跑；resume 语义交给 run(job, true)（有历史续跑，无历史重发原始任务）。
  retry(id) {
    if (this.cancelling) throw new Error("任务正在取消，无法重试");
    const job = this.jobs.get(id);
    if (!job) throw new Error("找不到该子任务");
    if (ACTIVE.includes(job.status) && !job.interrupted) throw new Error("子任务仍在运行，不能重试");
    if (job.status === "completed") throw new Error("子任务已成功完成，无需重试");
    if (!this.retryable(job)) throw new Error("该子任务没有可恢复的会话历史，无法重试");
    delete job.error;
    delete job.text;
    delete job.resultId; // 旧结果作废：旧 resultId 读取即失败
    job.cancelled = false;
    job.interrupted = false;
    job.notified = false;
    job.status = "starting";
    this.publish(job);
    job.done = this.run(job, true);
    return job.id;
  }

  async append(id, text, mode = "steer") {
    if (typeof text !== "string" || !text.trim() || !["steer", "followUp"].includes(mode))
      throw new Error("追加内容不能为空，mode 必须是 steer 或 followUp");
    const job = this.jobs.get(id);
    if (this.cancelling || job?.cancelled || job?.status !== "running")
      throw new Error("只能向运行中的子任务追加内容");
    await job.agent.enqueue(text.trim(), mode);
    return { taskId: id, accepted: true, mode };
  }

  // 单任务取消：只作用于指定 job，不置 cancelling（不阻塞新委派，也不改变整会话 cancel 语义）。
  // 已结束（含已取消）时幂等返回当前终态与原结果，重复取消不换 resultId。
  async cancelTask(id) {
    const job = this.jobs.get(id);
    if (!job) throw new Error("找不到该子任务");
    // interrupted 是停机在飞的中间态，此时置取消无效（run 收尾只会退回 starting），幂等返回现状。
    if (!ACTIVE.includes(job.status) || job.interrupted) return this.view(job);
    const first = !job.cancelled; // 已有取消在飞（整会话 cancel 或并发单任务取消）时不重复 abort
    job.cancelled = true; // 同步置位：run 的取消检查与并发的后续取消都据此收敛
    // 重启恢复出来的 starting 没有在飞 run，没人替它收尾，这里自己走同一终态路径。
    if (!job.done) {
      job.status = "cancelled";
      await this.finalize(job);
      return this.view(job);
    }
    // 在飞（starting/running）：abort 只打这一个 agent，run 收尾后完成通知照常发出。
    if (first) await job.agent?.abort();
    await job.done;
    return this.view(job);
  }

  async cancel() {
    this.cancelling = true;
    const active = [...this.jobs.values()].filter((job) =>
      ACTIVE.includes(job.status) && !job.interrupted,
    );
    for (const job of active) job.cancelled = true;
    try {
      await Promise.all(active.map((job) => job.agent?.abort()));
      await Promise.all(active.map((job) => job.done));
    } finally {
      this.cancelling = false;
    }
  }

  // 停机中断：与 cancel 不同，不打终态、不发完成通知，保留 sessionFile/historySaved
  // 供重启后 run(job, true) 续跑。
  async interrupt() {
    const active = [...this.jobs.values()].filter((job) => ACTIVE.includes(job.status));
    for (const job of active) job.interrupted = true;
    await Promise.all(active.map((job) => job.agent?.abort()));
    await Promise.all(active.map((job) => job.done));
  }
}
