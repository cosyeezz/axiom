import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { capabilityLoader, discoverCapabilities } from "./capabilities.js";
import { createBackgroundCompaction, entryIdFor, normalizeCompaction } from "./compaction.js";
import { createJiti } from "jiti";
const { getSupportedThinkingLevels } = await createJiti(import.meta.resolve("@earendil-works/pi-coding-agent")).import("@earendil-works/pi-ai/compat");

export function agentRuntime(session) {
  const last = session.messages.findLast((message) => message.role === "assistant");
  return {
    model: `${session.model.provider}/${session.model.id}`,
    thinking: session.thinkingLevel,
    systemPrompt: session.systemPrompt,
    context: session.getContextUsage() ?? null,
    usage: last?.usage ?? null,
  };
}

export async function createPiFactory({ cwd, model: requested }) {
  const modelRuntime = await ModelRuntime.create();
  const available = await modelRuntime.getAvailable();
  const startup = await discoverCapabilities(cwd, { loadAdapter: false });
  const defaultKey = requested || `${startup.settingsManager.getDefaultProvider()}/${startup.settingsManager.getDefaultModel()}`;
  const model = available.find((m) => `${m.provider}/${m.id}` === defaultKey) || (!requested && available[0]);
  if (!model)
    throw new Error(
      "No authenticated model. Configure Pi credentials and AXIOM_MODEL=provider/model.",
    );
  const factory = async (customTools = [], selection = {}) => {
    const workspace = selection.cwd || cwd;
    const selected = selection.model
      ? available.find((m) => `${m.provider}/${m.id}` === selection.model)
      : model;
    if (!selected) throw new Error("Unknown model");
    const validateCompaction = (value, mainModel) => {
      const config = normalizeCompaction(value);
      const target = config.model ? available.find((m) => `${m.provider}/${m.id}` === config.model) : mainModel;
      if (!target) throw new Error("Unknown compaction model");
      if (config.enabled && !getSupportedThinkingLevels(target).includes(config.thinking)) throw new Error("Unsupported compaction thinking level");
      return config;
    };
    const initialCompaction = validateCompaction(selection.compaction, selected);
    const resources = await discoverCapabilities(workspace, { trustProject: selection.trustProject });
    const { settingsManager } = resources;
    const { loader, selected: capabilities } = capabilityLoader(resources, selection.capabilities, customTools);
    await loader.reload();
    const diagnostics = loader.getExtensions().errors;
    if (diagnostics.length) {
      loader.getExtensions().runtime.invalidate();
      throw new Error(`插件加载失败：${diagnostics.map((d) => `${d.path}: ${d.error}`).join("; ")}`);
    }
    const { session } = await createAgentSession({
      cwd: workspace,
      modelRuntime: await ModelRuntime.create(),
      model: selected,
      thinkingLevel: selection.thinking,
      settingsManager,
      resourceLoader: loader,
      customTools,
      sessionManager: selection.sessionFile
        ? SessionManager.open(selection.sessionFile, selection.sessionDir, workspace)
        : selection.sessionDir ? SessionManager.create(workspace, selection.sessionDir) : SessionManager.inMemory(workspace),
    });
    const warnings = [...resources.catalog.warnings];
    if (resources.catalog.needsTrust)
      warnings.push("此目录的 Pi/MCP 配置尚未信任，仅加载全局能力；通过自定义新会话确认信任后可加载目录配置。");
    try {
      await session.bindExtensions({
        mode: "print",
        onError: (event) => warnings.push(`${event.extensionPath}: ${event.error}`),
      });
    } catch (error) {
      try { await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" }); }
      finally { session.dispose(); }
      throw error;
    }
    let lastResult;
    const messageEntries = () => session.sessionManager.getBranch().filter((entry) => entry.type === "message");
    const compactionRecords = () => session.sessionManager.getBranch().filter((entry) => entry.type === "compaction").map((entry) => {
      const branch = session.sessionManager.getBranch(entry.id);
      const cut = branch.findIndex((item) => item.id === entry.firstKeptEntryId);
      return { id: entry.id, summary: entry.summary, firstKeptEntryId: entry.firstKeptEntryId,
        compactedMessageIds: branch.slice(0, Math.max(0, cut)).filter((item) => item.type === "message").map((item) => item.id),
        tokensBefore: entry.tokensBefore };
    });
    const listeners = new Set();
    const emitAxiom = (event) => {
      for (const listener of [...listeners]) {
        try {
          listener(event);
        } catch {}
      }
    };
    const compactionCtrl = createBackgroundCompaction({
      session,
      modelRuntime,
      available,
      config: initialCompaction,
      onEvent: emitAxiom,
    });
    session.subscribe((event) => {
      if (event.type === "turn_end") void compactionCtrl.onTurnEnd();
      if (event.type === "compaction_end" && event.result && !event.aborted) {
        const record = compactionRecords().at(-1);
        if (record) emitAxiom({ type: "agent.compaction", data: record });
      }
      if (event.type === "queue_update")
        emitAxiom({ type: "session.queue", data: { steering: event.steering, followUp: event.followUp } });
      if (event.type === "message_start")
        emitAxiom({ type: "agent.message.start", data: { message: event.message } });
      if (event.type === "message_end") {
        // 订阅回调时 SDK 还没持久化该消息（持久化发生在通知之后），推迟一个微任务反查 entryId；
        // 微任务先于循环的下一事件续体执行，事件顺序不变。
        const message = event.message;
        if (message.role === "assistant") lastResult = message;
        queueMicrotask(() =>
          emitAxiom({ type: "agent.message.end", data: { message, ...entryIdFor(session.sessionManager, message) } }),
        );
      }
      if (event.type === "message_update") {
        const { partial, ...delta } = event.assistantMessageEvent;
        emitAxiom({ type: "agent.delta", data: delta });
      }
      if (event.type.startsWith("tool_execution_")) {
        const { type, ...data } = event;
        emitAxiom({ type: "tool.state", data: { phase: type.slice("tool_execution_".length), ...data } });
      }
      // Lifecycle boundaries only: never resend the prompt or scan history per token.
      if (["message_start", "message_end", "turn_end", "agent_end", "compaction_end"].includes(event.type))
        emitAxiom({ type: "agent.runtime", data: agentRuntime(session) });
    });
    return {
      runtime: () => agentRuntime(session),
      sessionFile: () => session.sessionFile,
      historyEntries: messageEntries,
      compactions: compactionRecords,
      queue: () => ({ steering: [...session.getSteeringMessages()], followUp: [...session.getFollowUpMessages()] }),
      withdraw: () => session.clearQueue(),
      enqueue: (text, type) => type === "steer" ? session.steer(text) : session.followUp(text),
      async configure({ model: key, thinking, compaction }) {
        const selected = available.find((m) => `${m.provider}/${m.id}` === key);
        if (!selected) throw new Error("Unknown model");
        const nextCompaction = validateCompaction(compaction ?? compactionCtrl.getConfig(), selected);
        if (thinking && !getSupportedThinkingLevels(selected).includes(thinking)) throw new Error("Unsupported thinking level");
        const previous = session.model;
        const previousThinking = session.thinkingLevel;
        await session.setModel(selected);
        const levels = session.getAvailableThinkingLevels();
        if (thinking && !levels.includes(thinking)) {
          await session.setModel(previous);
          session.setThinkingLevel(previousThinking);
          throw new Error("Unsupported thinking level");
        }
        if (thinking) session.setThinkingLevel(thinking);
        compactionCtrl.setConfig(nextCompaction);
        return { model: key, thinking: session.thinkingLevel, levels, compaction: compactionCtrl.getConfig() };
      },
      config: () => ({
        model: `${session.model.provider}/${session.model.id}`,
        thinking: session.thinkingLevel,
        levels: session.getAvailableThinkingLevels(),
        capabilities,
        skills: loader.getSkills().skills.map(({ name, description }) => ({ name, description })),
        capabilityMode: selection.capabilities == null ? "all" : "custom",
        warnings: [...warnings],
        activeTools: session.getActiveToolNames(),
        compaction: compactionCtrl.getConfig(),
      }),
      prompt: async (text) => {
        if (await compactionCtrl.maybeApply()) emitAxiom({ type: "agent.runtime", data: agentRuntime(session) });
        lastResult = undefined;
        await session.prompt(text);
      },
      async abort() {
        await Promise.all([compactionCtrl.cancel?.(), session.abort()]);
      },
      async dispose() {
        await compactionCtrl.dispose();
        try {
          await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
        } finally {
          session.dispose();
        }
      },
      result() {
        const last = lastResult;
        if (!last) return "指令已处理，未产生模型回答。";
        if (["error", "aborted", "length"].includes(last.stopReason))
          throw new Error(
            last?.errorMessage || last?.stopReason || "No assistant result",
          );
        return last.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("\n");
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
  };
  factory.cwd = cwd;
  factory.capabilities = async (workspace = cwd, trustProject = false) =>
    (await discoverCapabilities(workspace, { trustProject, loadAdapter: false })).catalog;
  factory.catalog = () =>
    available.map((m) => ({
      provider: m.provider,
      id: m.id,
      name: m.name,
      key: `${m.provider}/${m.id}`,
      levels: getSupportedThinkingLevels(m),
    }));
  return factory;
}
