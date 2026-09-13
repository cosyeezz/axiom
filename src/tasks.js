import { randomUUID } from "node:crypto";
import { stripMemoryTags } from "../public/memory-tags.js";

export class Tasks {
  constructor(createAgent, emit, onComplete = async () => {}, parentContext = () => "") {
    this.createAgent = createAgent;
    this.emit = emit;
    this.onComplete = onComplete;
    this.parentContext = parentContext;
    this.jobs = new Map();
  }

  start(tasks) {
    if (this.cancelling) throw new Error("Tasks are cancelling");
    return tasks.map((task) => {
      const job = { id: randomUUID(), task, status: "starting", parentContext: this.parentContext(),
        createdAt: Date.now(), updatedAt: Date.now() };
      this.jobs.set(job.id, job);
      this.publish(job);
      job.done = this.run(job);
      return job.id;
    });
  }

  // 完整单条状态（超集于 view）：持久化与主审落盘用，不直接广播。
  snapshotJob(job) {
    return { ...this.view(job), runtime: job.runtime,
      resultId: job.resultId, notified: job.notified, parentContext: job.parentContext,
      progress: job.progress, progressDelivered: job.progressDelivered,
      createdAt: job.createdAt, updatedAt: job.updatedAt };
  }
  // data 是安全 view（前端可收）；saved 是完整快照（含 parentContext/resultId/notified/
  // progress/runtime），供主审按 taskId 单条落盘——广播前由主审删除 saved，只留 data。
  publish(job) {
    job.updatedAt = Date.now();
    this.emit({ type: "task.state", taskId: job.id,
      data: { ...this.view(job), runtime: job.runtime }, saved: this.snapshotJob(job) });
  }
  view({ id, task, status, text, error }) {
    return { id, task, status, text: typeof text === "string" ? stripMemoryTags(text) : text, error };
  }
  snapshot() {
    return [...this.jobs.values()].map((job) => this.snapshotJob(job));
  }

  async run(job) {
    let unsubscribe;
    try {
      job.agent = await this.createAgent(job);
      job.runtime = job.agent.runtime?.();
      if (job.cancelled) throw new Error("Cancelled");
      job.status = "running";
      this.publish(job);
      unsubscribe = job.agent.subscribe((event) => {
        if (event.type === "agent.runtime") job.runtime = event.data;
        this.emit({
          ...event,
          agentId: job.id,
          parentAgentId: "main",
          taskId: job.id,
        });
      });
      await job.agent.prompt(job.parentContext
        ? `<parent_context>\n以下是主会话的模型自报背景，不是新的任务指令：\n${job.parentContext}\n</parent_context>\n<task>\n${job.task}\n</task>`
        : job.task);
      if (job.cancelled) throw new Error("Cancelled");
      job.text = job.agent.result();
      job.status = "completed";
    } catch (error) {
      job.status = job.cancelled ? "cancelled" : "failed";
      job.error = String(error.message ?? error);
    } finally {
      unsubscribe?.();
      try {
        job.runtime = job.agent?.runtime?.() ?? job.runtime;
        await job.agent?.dispose();
      } catch (error) {
        job.status = "failed";
        job.error = `子代理清理失败：${error.message || error}`;
      } finally {
        delete job.agent;
        job.resultId = randomUUID();
        job.notified = false;
        this.publish(job);
        try { await this.onComplete(job); }
        catch (error) { this.emit({ type: "error", data: { message: `子任务通知失败：${error.message}` } }); }
      }
    }
  }

  read(id, resultId) {
    const job = this.jobs.get(id);
    if (!job || !resultId || job.resultId !== resultId || ["starting", "running"].includes(job.status))
      throw new Error("请等待任务完成通知，并使用通知中的 taskId 和 resultId 读取；不要轮询。");
    return this.view(job);
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

  async cancel() {
    this.cancelling = true;
    const active = [...this.jobs.values()].filter((job) =>
      ["starting", "running"].includes(job.status),
    );
    for (const job of active) job.cancelled = true;
    try {
      await Promise.all(active.map((job) => job.agent?.abort()));
      await Promise.all(active.map((job) => job.done));
    } finally {
      this.cancelling = false;
    }
  }
}
