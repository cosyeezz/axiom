import { createHash, randomUUID } from "node:crypto";
import { realpath, stat, readFile, mkdir, writeFile, rename, rm, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { selection as selectionSchema } from "./protocol.js";
import { Tasks } from "./tasks.js";
import { delegationTools } from "./tools.js";
import { resolveCapabilities } from "./capabilities.js";

export class Sessions {
  constructor(createAgent, defaultsPath, storagePath) {
    this.storagePath = storagePath;
    this.defaultsPath = defaultsPath;
    this.savingDefaults = Promise.resolve();
    this.createAgent = createAgent;
    this.items = new Map();
    this.recentConfig = {};
    this.defaultSelection = { queueType: "steer", model: null, subagentModel: null, thinking: null, subagentThinking: null, capabilities: null, subagentCapabilities: null };
  }

  async loadDefaults() {
    if (!this.defaultsPath) return;
    try {
      const saved = selectionSchema.strict().parse(JSON.parse(await readFile(this.defaultsPath, "utf8")));
      Object.assign(this.defaultSelection, saved);
    } catch (error) {
      if (error.code !== "ENOENT") throw new Error(`默认新会话配置读取失败：${error.message}`);
    }
  }
  getDefaults() {
    return structuredClone(this.defaultSelection);
  }
  configureDefaults(workspace, selection) {
    const save = this.savingDefaults.then(() => this.saveDefaults(workspace, selection));
    this.savingDefaults = save.catch(() => {});
    return save;
  }
  async saveDefaults(workspace, selection) {
    const next = this.getDefaults();
    for (const key of Object.keys(next))
      if (selection[key] !== undefined) next[key] = structuredClone(selection[key]);
    await this.validateSelection(workspace, next);
    if (this.defaultsPath) {
      const temporary = `${this.defaultsPath}.${randomUUID()}.tmp`;
      await mkdir(dirname(this.defaultsPath), { recursive: true });
      try {
        await writeFile(temporary, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
        await rename(temporary, this.defaultsPath);
      } finally {
        await rm(temporary, { force: true });
      }
    }
    this.defaultSelection = next;
    return this.getDefaults();
  }
  async validateSelection(workspace = this.createAgent.cwd || process.cwd(), selection) {
    const cwd = await realpath(workspace);
    if (!(await stat(cwd)).isDirectory()) throw new Error("工作空间必须是目录");
    for (const key of ["model", "subagentModel"])
      if (selection[key] != null && !this.createAgent.catalog().some((m) => m.key === selection[key]))
        throw new Error(key === "model" ? "Unknown model" : "Unknown subagent model");
    let catalog;
    if (this.createAgent.capabilities) {
      catalog = await this.createAgent.capabilities(cwd, selection.trustProject === true);
      resolveCapabilities(selection.capabilities, catalog);
      resolveCapabilities(selection.subagentCapabilities === "inherit" ? selection.capabilities : selection.subagentCapabilities, catalog);
    }
    return { cwd, catalog };
  }

  async load() {
    if (!this.storagePath) return;
    await mkdir(this.storagePath, { recursive: true });
    for (const workspace of await readdir(this.storagePath)) {
      for (const file of await readdir(join(this.storagePath, workspace))) {
        if (!file.endsWith(".json")) continue;
        const saved = JSON.parse(await readFile(join(this.storagePath, workspace, file), "utf8"));
        await this.create(saved.cwd, saved.selection, saved);
      }
    }
  }
  persist(item) {
    if (!item.storageDir) return Promise.resolve();
    const data = JSON.stringify({ id: item.id, cwd: item.cwd, title: item.title,
      updatedAt: item.updatedAt, messages: item.messages, tasks: item.tasks.snapshot(),
      sessionFile: item.agent.sessionFile?.(),
      selection: { ...item.agent.config?.(), capabilities: item.capabilities,
        subagentCapabilities: item.subagentCapabilities, subagentModel: item.subagentModel,
        subagentThinking: item.subagentThinking, queueType: item.queueType,
        trustProject: item.trustProject, useDefaults: false } });
    const work = (item.saving || Promise.resolve()).catch(() => {}).then(async () => {
      const file = join(item.storageDir, `${item.id}.json`);
      const temporary = `${file}.tmp`;
      await writeFile(temporary, data, { mode: 0o600 });
      await rename(temporary, file);
    });
    item.saving = work;
    return work;
  }

  list() {
    return [...this.items.values()]
      .map(({ id, title, cwd, status, updatedAt }) => ({
        id,
        title,
        cwd,
        status,
        updatedAt,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async rename(id, title) {
    const item = this.get(id);
    item.title = title;
    item.updatedAt = Date.now();
    await this.persist(item);
    return { sessionId: id, title };
  }

  async create(workspace, selection = {}, saved) {
    selection = structuredClone({ ...(selection.useDefaults === false ? {} : this.defaultSelection), ...selection });
    const { cwd, catalog } = await this.validateSelection(workspace, selection);
    const id = saved?.id || randomUUID();
    const storageDir = this.storagePath && join(this.storagePath, createHash("sha256").update(process.platform === "win32" ? cwd.toLowerCase() : cwd).digest("hex"));
    if (storageDir) await mkdir(storageDir, { recursive: true });
    const item = {
      id,
      cwd,
      storageDir,
      queueType: selection.queueType || "steer",
      title: saved?.title || "新会话",
      updatedAt: saved?.updatedAt || Date.now(),
      seq: 0,
      status: "idle",
      listeners: new Set(),
      messages: saved?.messages || [],
      live: {},
      tools: {},
      subagentModel: selection.subagentModel ?? null,
      subagentThinking: selection.subagentThinking ?? null,
      subagentResolvedCapabilities: catalog ? resolveCapabilities(selection.subagentCapabilities === "inherit" ? selection.capabilities : selection.subagentCapabilities, catalog) : null,
      capabilities: selection.capabilities ?? null,
      subagentCapabilities: selection.subagentCapabilities ?? null,
      trustProject: selection.trustProject === true,
    };
    item.emit = (event) => {
      const agentId = event.agentId ?? "main";
      if (event.type === "agent.message.start")
        item.live[agentId] = structuredClone(event.data.message);
      if (event.type === "agent.delta") {
        const delta = event.data;
        const message = item.live[agentId];
        if (message && Array.isArray(message.content)) {
          const i = delta.contentIndex;
          if (delta.type === "text_start")
            message.content[i] = { type: "text", text: "" };
          if (delta.type === "thinking_start")
            message.content[i] = { type: "thinking", thinking: "" };
          if (delta.type === "text_delta") {
            message.content[i] ??= { type: "text", text: "" };
            message.content[i].text += delta.delta;
          }
          if (delta.type === "thinking_delta") {
            message.content[i] ??= { type: "thinking", thinking: "" };
            message.content[i].thinking += delta.delta;
          }
          if (delta.type === "toolcall_start")
            message.content[i] = {
              type: "toolCall",
              id: delta.id,
              name: delta.toolName,
              argumentsText: "",
            };
          if (delta.type === "toolcall_delta" && message.content[i])
            message.content[i].argumentsText =
              (message.content[i].argumentsText ?? "") + delta.delta;
          if (delta.type === "toolcall_end")
            message.content[i] = delta.toolCall;
        }
      }
      if (event.type === "agent.message.end") {
        item.messages.push({ agentId, message: event.data.message });
        delete item.live[agentId];
        void this.persist(item).catch((error) => item.emit({ type: "error", data: { message: `会话保存失败：${error.message}` } }));
      }
      if (event.type === "tool.state")
        item.tools[`${agentId}:${event.data.toolCallId}`] = {
          agentId,
          ...event.data,
        };
      if (event.type === "task.state")
        void this.persist(item).catch((error) => item.emit({ type: "error", data: { message: `会话保存失败：${error.message}` } }));
      const envelope = { ...event, sessionId: id, seq: ++item.seq };
      for (const listener of item.listeners) listener(envelope);
    };
    item.tasks = new Tasks(
      () =>
        this.createAgent([], {
          ...item.agent.config?.(),
          ...(item.subagentModel ? { model: item.subagentModel } : {}),
          cwd,
          ...(item.subagentThinking ? { thinking: item.subagentThinking } : {}),
          capabilities: item.subagentCapabilities === "inherit" ? item.agent.config?.().capabilities ?? item.capabilities : item.subagentCapabilities,
          trustProject: item.trustProject,
        }),
      item.emit,
    );
    for (const task of saved?.tasks || [])
      item.tasks.jobs.set(task.id, { ...task, status: ["starting", "running"].includes(task.status) ? "cancelled" : task.status });
    item.agent = await this.createAgent(delegationTools(item.tasks), {
      ...this.recentConfig,
      ...(selection.model ? { model: selection.model } : {}),
      ...(selection.thinking ? { thinking: selection.thinking } : {}),
      capabilities: item.capabilities,
      trustProject: item.trustProject,
      cwd,
      sessionDir: storageDir,
      sessionFile: saved?.sessionFile,
    });
    item.unsubscribe = item.agent.subscribe((event) =>
      item.emit({ ...event, agentId: "main", runId: item.runId }),
    );
    this.items.set(id, item);
    await this.persist(item);
    return id;
  }

  get(id) {
    const item = this.items.get(id);
    if (!item) throw new Error("Unknown session");
    return item;
  }
  snapshot(id) {
    const item = this.get(id);
    return structuredClone({
      sessionId: id,
      cwd: item.cwd,
      title: item.title,
      seq: item.seq,
      status: item.status,
      runtime: item.agent.runtime?.(),
      queue: item.agent.queue?.(),
      config: {
        queueType: item.queueType,
        ...item.agent.config?.(), subagentModel: item.subagentModel,
        subagentThinking: item.subagentThinking,
        subagentResolvedCapabilities: item.subagentResolvedCapabilities,
        capabilitySelection: item.capabilities,
        subagentCapabilities: item.subagentCapabilities,
      },
      runId: item.runId,
      messages: item.messages,
      live: item.live,
      tools: item.tools,
      tasks: item.tasks.snapshot(),
    });
  }
  subscribe(id, listener) {
    const item = this.get(id);
    item.listeners.add(listener);
    return () => item.listeners.delete(listener);
  }

  async configure(id, selection) {
    const item = this.get(id);
    if (!["idle", "running"].includes(item.status) || item.configuring) throw new Error("Session is busy");
    const { subagentModel = item.subagentModel, model, thinking } = selection;
    if (
      subagentModel !== null &&
      !this.createAgent.catalog().some((m) => m.key === subagentModel)
    )
      throw new Error("Unknown subagent model");
    item.configuring = true;
    try {
      const previous = item.agent.config?.();
      const config = await item.agent.configure({ model, thinking });
      if (config.model !== previous?.model || config.thinking !== previous?.thinking)
        this.recentConfig = { model: config.model, thinking: config.thinking };
      item.subagentModel = subagentModel;
      item.queueType = selection.queueType || item.queueType;
      await this.persist(item);
      return {
        queueType: item.queueType,
        ...item.agent.config?.(), ...config, subagentModel,
        runtime: item.agent.runtime?.(),
        subagentThinking: item.subagentThinking,
        subagentResolvedCapabilities: item.subagentResolvedCapabilities,
        capabilitySelection: item.capabilities,
        subagentCapabilities: item.subagentCapabilities,
      };
    } finally {
      item.configuring = false;
    }
  }

  async prompt(id, text, queueType) {
    const item = this.get(id);
    if (item.status === "running") {
      await item.agent.enqueue(text, queueType || item.queueType);
      return item.runId;
    }
    if (item.status !== "idle" || item.configuring) throw new Error("Session is busy");
    if (item.title === "新会话") item.title = text.slice(0, 60);
    item.updatedAt = Date.now();
    item.runId = randomUUID();
    item.status = "running";
    item.emit({
      type: "session.state",
      data: { status: item.status, runId: item.runId },
    });
    item.work = (async () => {
      try {
        await item.agent.prompt(text);
        item.agent.result();
      } catch (error) {
        item.emit({
          type: "error",
          data: { message: String(error.message ?? error) },
        });
      } finally {
        await this.persist(item).catch((error) => item.emit({ type: "error", data: { message: `会话保存失败：${error.message}` } }));
        if (item.status !== "cancelling") {
          item.status = "idle";
          item.emit({
            type: "session.state",
            data: { status: "idle", runId: item.runId },
          });
        }
      }
    })();
    return item.runId;
  }

  async cancel(id) {
    const item = this.get(id);
    if (item.cancelling) return item.cancelling;
    item.status = "cancelling";
    item.emit({ type: "session.state", data: { status: "cancelling" } });
    item.cancelling = (async () => {
      try {
        await Promise.all([item.agent.abort(), item.tasks.cancel()]);
        await item.work;
      } finally {
        item.status = "idle";
        item.cancelling = undefined;
        item.emit({ type: "session.state", data: { status: "idle" } });
      }
    })();
    return item.cancelling;
  }
  async remove(id, deleting = true) {
    const item = this.get(id);
    await this.cancel(id);
    item.unsubscribe();
    await item.agent.dispose();
    await this.persist(item);
    if (deleting && item.storageDir) {
      if (item.agent.sessionFile?.()) await rm(item.agent.sessionFile(), { force: true });
      await rm(join(item.storageDir, `${id}.json`), { force: true });
    }
    item.listeners.clear();
    this.items.delete(id);
  }
  async close() {
    await Promise.all([...this.items.keys()].map((id) => this.remove(id, false)));
  }
}
