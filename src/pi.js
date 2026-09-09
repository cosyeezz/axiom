import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

export async function createPiFactory({ cwd, model: requested }) {
  const modelRuntime = await ModelRuntime.create();
  const available = await modelRuntime.getAvailable();
  const model = requested
    ? available.find((m) => `${m.provider}/${m.id}` === requested)
    : available[0];
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
    const settingsManager = SettingsManager.inMemory();
    const loader = new DefaultResourceLoader({
      cwd: workspace,
      agentDir: getAgentDir(),
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      appendSystemPrompt: [
        customTools.length
          ? "Delegate independent work with delegate, then collect results with read_result. Avoid concurrent edits to the same files. Report task failures honestly."
          : "Complete the delegated task. Return concise findings and changes with evidence.",
      ],
    });
    await loader.reload();
    const { session } = await createAgentSession({
      cwd: workspace,
      modelRuntime,
      model: selected,
      thinkingLevel: selection.thinking,
      settingsManager,
      resourceLoader: loader,
      customTools,
      sessionManager: SessionManager.inMemory(workspace),
    });
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
      }),
      prompt: (text) => session.prompt(text),
      abort: () => session.abort(),
      dispose: () => session.dispose(),
      result() {
        const last = session.messages.findLast((m) => m.role === "assistant");
        if (!last || ["error", "aborted", "length"].includes(last.stopReason))
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
  factory.catalog = () =>
    available.map((m) => ({
      provider: m.provider,
      id: m.id,
      name: m.name,
      key: `${m.provider}/${m.id}`,
    }));
  return factory;
}
