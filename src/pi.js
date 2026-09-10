import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { capabilityLoader, discoverCapabilities } from "./capabilities.js";

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
      sessionManager: SessionManager.inMemory(workspace),
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
    let promptStart = 0;
    return {
      async configure({ model: key, thinking }) {
        const selected = available.find((m) => `${m.provider}/${m.id}` === key);
        if (!selected) throw new Error("Unknown model");
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
        return { model: key, thinking: session.thinkingLevel, levels };
      },
      config: () => ({
        model: `${session.model.provider}/${session.model.id}`,
        thinking: session.thinkingLevel,
        levels: session.getAvailableThinkingLevels(),
        capabilities,
        capabilityMode: selection.capabilities == null ? "all" : "custom",
        warnings: [...warnings],
        activeTools: session.getActiveToolNames(),
      }),
      prompt: async (text) => {
        promptStart = session.messages.length;
        await session.prompt(text);
      },
      abort: () => session.abort(),
      async dispose() {
        try {
          await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
        } finally {
          session.dispose();
        }
      },
      result() {
        const last = session.messages.slice(promptStart).findLast((m) => m.role === "assistant");
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
        return session.subscribe((event) => {
          if (event.type === "message_start" || event.type === "message_end") {
            listener({
              type:
                event.type === "message_start"
                  ? "agent.message.start"
                  : "agent.message.end",
              data: { message: event.message },
            });
          } else if (event.type === "message_update") {
            const { partial, ...delta } = event.assistantMessageEvent;
            listener({ type: "agent.delta", data: delta });
          } else if (event.type.startsWith("tool_execution_")) {
            const { type, ...data } = event;
            listener({
              type: "tool.state",
              data: { phase: type.slice("tool_execution_".length), ...data },
            });
          }
        });
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
    }));
  return factory;
}
