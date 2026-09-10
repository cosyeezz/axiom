import { randomUUID } from "node:crypto";

export class Tasks {
  constructor(createAgent, emit) {
    this.createAgent = createAgent;
    this.emit = emit;
    this.jobs = new Map();
  }

  start(tasks) {
    if (this.cancelling) throw new Error("Tasks are cancelling");
    return tasks.map((task) => {
      const job = { id: randomUUID(), task, status: "starting" };
      this.jobs.set(job.id, job);
      this.publish(job);
      job.done = this.run(job);
      return job.id;
    });
  }

  publish(job) {
    this.emit({ type: "task.state", taskId: job.id, data: this.view(job) });
  }
  view({ id, task, status, text, error }) {
    return { id, task, status, text, error };
  }
  snapshot() {
    return [...this.jobs.values()].map((job) => this.view(job));
  }

  async run(job) {
    let unsubscribe;
    try {
      job.agent = await this.createAgent();
      if (job.cancelled) throw new Error("Cancelled");
      job.status = "running";
      this.publish(job);
      unsubscribe = job.agent.subscribe((event) =>
        this.emit({
          ...event,
          agentId: job.id,
          parentAgentId: "main",
          taskId: job.id,
        }),
      );
      await job.agent.prompt(job.task);
      if (job.cancelled) throw new Error("Cancelled");
      job.text = job.agent.result();
      job.status = "completed";
    } catch (error) {
      job.status = job.cancelled ? "cancelled" : "failed";
      job.error = String(error.message ?? error);
    } finally {
      unsubscribe?.();
      try {
        await job.agent?.dispose();
      } catch (error) {
        job.status = "failed";
        job.error = `子代理清理失败：${error.message || error}`;
      } finally {
        delete job.agent;
        this.publish(job);
      }
    }
  }

  async read(ids, wait = true, signal) {
    const jobs = ids.map((id) => {
      const job = this.jobs.get(id);
      if (!job) throw new Error(`Unknown task: ${id}`);
      return job;
    });
    if (wait) {
      signal?.throwIfAborted();
      let abort;
      try {
        await Promise.race([
          Promise.all(jobs.map((job) => job.done)),
          new Promise((_, reject) => {
            abort = () => reject(signal.reason);
            signal?.addEventListener("abort", abort, { once: true });
          }),
        ]);
      } finally {
        if (abort) signal?.removeEventListener("abort", abort);
      }
    }
    return jobs.map((job) => this.view(job));
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
