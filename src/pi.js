import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { capabilityLoader, discoverCapabilities, refreshProjectSkills } from "./capabilities.js";
import { createBackgroundCompaction, entryIdFor, normalizeCompaction, summarizedEntryIds } from "./compaction.js";
import { createAutoRetry } from "./retry.js";
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

// SDK 的 queue_update/clearQueue/getSteeringMessages 只回传文本，图片仅存于 agent 真实队列
// （agent.steeringQueue/followUpQueue.messages，pi-coding-agent 0.85.1 私有字段但为普通属性，
// 元素为 {role:'user',content:[text,...image]}，入队后不会被 clearQueue 之外的路径改写）。
// 展示与撤回直接读真实队列：避免按文本做 shadow 映射的同文本键碰撞，
// 也避免 clearQueue 同步触发 queue_update 先清空 shadow 再取图导致撤回丢图。
export function queueStateOf(steeringQueue, followUpQueue) {
  const read = (queue) =>
    queue.messages.map((message) => ({
      text: message.content.filter((block) => block.type === "text").map((block) => block.text).join("\n"),
      images: message.content.filter((block) => block.type === "image").map((block) => ({ ...block })),
    }));
  const steering = read(steeringQueue);
  const followUp = read(followUpQueue);
  return {
    steering: steering.map((entry) => entry.text),
    followUp: followUp.map((entry) => entry.text),
    images: {
      steering: steering.map((entry) => (entry.images.length ? entry.images : null)),
      followUp: followUp.map((entry) => (entry.images.length ? entry.images : null)),
    },
  };
}

// 该条目算不算“模型已经产出”：被中断（或失败）且没发起工具调用的空回答可以随输入一起丢弃。
function hasModelOutput(entry) {
  if (entry.type !== "message") return false;
  const { role, content = [], stopReason } = entry.message;
  if (role === "toolResult") return true;
  if (role !== "assistant") return false;
  if (content.some((block) => block.type === "toolCall")) return true;
  return !["aborted", "error"].includes(stopReason);
}

// 撤回 = 先快照真实队列再 clearQueue：clearQueue 会同步清空队列并发出 queue_update，事后取不到图。
export function withdrawQueue(session) {
  const queued = queueStateOf(session.agent.steeringQueue, session.agent.followUpQueue);
  session.clearQueue();
  return queued;
}

// 撤回已进入上下文的最后一条输入：只在该条之后没有模型输出（回答/工具调用）时允许。
// 实现只把叶子回退到该条之前（随后补一条不参与上下文的自定义条目让分支落盘），
// 历史前缀逐字节不变：供应商前缀缓存对更早的内容继续命中，只丢弃这一条自身的缓存写入。
// 代价：本条之后的半截输出（含被中断的思考）不再留在上下文里。
export async function recallLastMessage(session) {
  if (session.isStreaming) await session.abort(); // 兜底：中途撤回先停稳，navigateTree 拒绝流式中回退
  const entries = session.sessionManager.getBranch();
  const index = entries.findLastIndex((entry) => entry.type === "message" && entry.message.role === "user");
  if (index < 0) return null;
  // 工具调用/工具结果一旦落盘就不能回退掉：副作用已经发生，孤立的结果还会破坏下一轮请求。
  if (entries.slice(index + 1).some(hasModelOutput))
    throw new Error("本轮已经产生了模型输出，无法撤回输入");
  const { id, message } = entries[index];
  const content = Array.isArray(message.content) ? message.content : [];
  const { cancelled } = await session.navigateTree(id);
  if (cancelled) return null;
  session.sessionManager.appendCustomEntry("axiom_recall", { entryId: id });
  return {
    entryId: id,
    text: typeof message.content === "string"
      ? message.content
      : content.filter((block) => block.type === "text").map((block) => block.text).join("\n"),
    images: content.filter((block) => block.type === "image").map((block) => ({ ...block })),
  };
}

export async function createPiFactory({ cwd, model: requested }) {
  // 模型目录可被模型配置页刷新（models.json 写入后）：available 用可变绑定，
  // 旧会话的 configure/压缩模型校验才能看到新目录；已绑定的模型对象本身不热更新（SDK 行为）。
  let modelRuntime = await ModelRuntime.create();
  let available = await modelRuntime.getAvailable();
  const startup = await discoverCapabilities(cwd, { loadAdapter: false });
  const defaultKey = requested || `${startup.settingsManager.getDefaultProvider()}/${startup.settingsManager.getDefaultModel()}`;
  const factory = async (customTools = [], selection = {}) => {
    const workspace = selection.cwd || cwd;
    // 启动不依赖模型；每次建会话从最新目录选择，网页首次配置后无需重启。
    const key = selection.model || defaultKey;
    const selected = available.find((m) => `${m.provider}/${m.id}` === key)
      || (!selection.model && !requested && available[0]);
    if (!selected) throw new Error(available.length
      ? `模型不可用：${key}。请在设置中选择可用模型，或检查 AXIOM_MODEL。`
      : "尚未配置可用模型，请先在「设置 → 模型与供应商」添加供应商、模型和凭据。");
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
    // 退避计划由 axiom retry 层负责：禁用 SDK 内建自动重试（默认开启 3 次指数退避）避免双重重试。
    // setRetryEnabled 只关 session 层；provider 层（retry.provider.maxRetries，SDK 客户端默认 2 次）
    // 可能来自用户配置并叠加，这里一并清零（仅本会话内存态，不写盘）。
    settingsManager.setRetryEnabled(false);
    settingsManager.applyOverrides({ retry: { provider: { maxRetries: 0 } } });
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
    const queueState = () => queueStateOf(session.agent.steeringQueue, session.agent.followUpQueue);
    const messageEntries = () => session.sessionManager.getBranch().filter((entry) => entry.type === "message");
    const compactionRecords = () => session.sessionManager.getBranch().filter((entry) => entry.type === "compaction").map((entry) => {
      const branch = session.sessionManager.getBranch(entry.id);
      return { id: entry.id, summary: entry.summary, firstKeptEntryId: entry.firstKeptEntryId,
        compactedMessageIds: summarizedEntryIds(branch.filter((item) => item.id !== entry.id), entry.firstKeptEntryId),
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
    const retry = createAutoRetry({ session, emit: emitAxiom });
    session.subscribe((event) => {
      if (event.type === "turn_end") void compactionCtrl.onTurnEnd();
      if (event.type === "compaction_end" && event.result && !event.aborted) {
        const record = compactionRecords().at(-1);
        if (record) emitAxiom({ type: "agent.compaction", data: record });
      }
      // _queueSteer 先发 queue_update 再压入真实队列，推迟到微任务读取才能看到刚入队的消息（与下方 message_end 同理）。
      if (event.type === "queue_update")
        queueMicrotask(() => emitAxiom({ type: "session.queue", data: queueState() }));
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
      compactionStatus: () => compactionCtrl.getStatus(),
      queue: queueState,
      withdraw: () => withdrawQueue(session),
      recall: () => recallLastMessage(session),
      enqueue: (text, type, images) => (type === "steer" ? session.steer(text, images) : session.followUp(text, images)),
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
      async refreshSkills() {
        const fresh = await discoverCapabilities(workspace, { loadAdapter: false });
        return refreshProjectSkills(loader, capabilities, fresh.catalog, selection.capabilities == null);
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
      prompt: async (text, options) => {
        if (await compactionCtrl.maybeApply()) emitAxiom({ type: "agent.runtime", data: agentRuntime(session) });
        lastResult = undefined;
        await retry.run(() => session.prompt(text, options?.images ? { images: options.images } : undefined));
      },
      async abort() {
        retry.cancel(); // 先中断等待中的自动重试，避免 abort 后又发起 continue
        await Promise.all([compactionCtrl.cancel?.(), session.abort()]);
      },
      async dispose() {
        retry.cancel();
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
  factory.refreshModels = async () => {
    modelRuntime = await ModelRuntime.create();
    available = await modelRuntime.getAvailable();
    return factory.catalog();
  };
  factory.catalog = () =>
    available.map((m) => ({
      provider: m.provider,
      id: m.id,
      name: m.name,
      key: `${m.provider}/${m.id}`,
      levels: getSupportedThinkingLevels(m),
      input: m.input,
    }));
  return factory;
}
