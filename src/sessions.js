import { randomUUID } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { Tasks } from "./tasks.js";
import { delegationTools } from "./tools.js";
import { resolveCapabilities } from "./capabilities.js";

export class Sessions {
  constructor(createAgent) {
    this.createAgent = createAgent;
    this.items = new Map();
    this.defaults = {};
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
  rename(id, title) {
    const item = this.get(id);
    item.title = title;
    return { sessionId: id, title };
  }

  async create(workspace = this.createAgent.cwd || process.cwd(), selection = {}) {
    const cwd = await realpath(workspace);
    if (!(await stat(cwd)).isDirectory()) throw new Error("工作空间必须是目录");
    const id = randomUUID();
    const item = {
      id,
      cwd,
      title: "新会话",
      updatedAt: Date.now(),
      seq: 0,
      status: "idle",
      listeners: new Set(),
      messages: [],
      live: {},
      tools: {},
      subagentModel: selection.subagentModel ?? null,
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
      }
      if (event.type === "tool.state")
        item.tools[`${agentId}:${event.data.toolCallId}`] = {
          agentId,
          ...event.data,
        };
      const envelope = { ...event, sessionId: id, seq: ++item.seq };
      for (const listener of item.listeners) listener(envelope);
    };
    item.tasks = new Tasks(
      () =>
        this.createAgent([], {
          ...item.agent.config?.(),
          ...(item.subagentModel ? { model: item.subagentModel } : {}),
          cwd,
          capabilities: item.subagentCapabilities,
          trustProject: item.trustProject,
        }),
      item.emit,
    );
    if (item.subagentModel !== null && !this.createAgent.catalog().some((m) => m.key === item.subagentModel))
      throw new Error("Unknown subagent model");
    if (this.createAgent.capabilities) {
      const catalog = await this.createAgent.capabilities(cwd, item.trustProject);
      resolveCapabilities(item.capabilities, catalog);
      resolveCapabilities(item.subagentCapabilities, catalog);
    }
    item.agent = await this.createAgent(delegationTools(item.tasks), {
      ...this.defaults,
      ...(selection.model ? { model: selection.model } : {}),
      ...(selection.thinking ? { thinking: selection.thinking } : {}),
      capabilities: item.capabilities,
      trustProject: item.trustProject,
      cwd,
    });
    item.unsubscribe = item.agent.subscribe((event) =>
      item.emit({ ...event, agentId: "main", runId: item.runId }),
    );
    this.items.set(id, item);
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
      config: {
        ...item.agent.config?.(), subagentModel: item.subagentModel,
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
    if (item.status !== "idle") throw new Error("Session is busy");
    const { subagentModel = item.subagentModel, model, thinking } = selection;
    if (
      subagentModel !== null &&
      !this.createAgent.catalog().some((m) => m.key === subagentModel)
    )
      throw new Error("Unknown subagent model");
    item.status = "configuring";
    try {
      const previous = item.agent.config?.();
      const config = await item.agent.configure({ model, thinking });
      if (config.model !== previous?.model || config.thinking !== previous?.thinking)
        this.defaults = { model: config.model, thinking: config.thinking };
      item.subagentModel = subagentModel;
      return {
        ...item.agent.config?.(), ...config, subagentModel,
        capabilitySelection: item.capabilities,
        subagentCapabilities: item.subagentCapabilities,
      };
    } finally {
      item.status = "idle";
    }
  }

  prompt(id, text) {
    const item = this.get(id);
    if (item.status !== "idle") throw new Error("Session is busy");
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
  async remove(id) {
    const item = this.get(id);
    await this.cancel(id);
    item.unsubscribe();
    await item.agent.dispose();
    item.listeners.clear();
    this.items.delete(id);
  }
  async close() {
    await Promise.all([...this.items.keys()].map((id) => this.remove(id)));
  }
}
