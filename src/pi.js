import { wrapUsageStream } from "./usage-stream.js";
import { sessionBilling, usageRuntime } from "./session-billing.js";
import { TITLE_INSTRUCTION } from "./prompts.js";
import { observationPackExtension, createObservationStats, observationRuntime } from "./observation-pack.js";
import {
  createAgentSession,
  estimateTokens,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { capabilityLoader, discoverCapabilities, refreshProjectSkills, MAIN_EXCLUDED_SKILLS } from "./capabilities.js";
import { createBackgroundCompaction, entryIdFor, normalizeCompaction, summarizedEntryIds } from "./compaction.js";
import { resolveCompaction } from "./protocol.js";
import { WRAP_UP_PROMPT, budgetSystemPrompt } from "./task-budget.js";
import { canResume, createAutoRetry, dropFailedAssistant } from "./retry.js";
import { createJiti } from "jiti";
const { AssistantMessageEventStream } = await createJiti(import.meta.resolve("@earendil-works/pi-coding-agent")).import("@earendil-works/pi-ai");
const { getSupportedThinkingLevels } = await createJiti(import.meta.resolve("@earendil-works/pi-coding-agent")).import("@earendil-works/pi-ai/compat");

export function agentRuntime(session, observations = null) {
  return {
    model: `${session.model.provider}/${session.model.id}`,
    thinking: session.thinkingLevel,
    systemPrompt: session.systemPrompt,
    tools: session.agent?.state.tools?.map(({ name, description, parameters }) => ({ name, description, parameters })) ?? null,
    ...usageRuntime(session.messages, session.model, session.getContextUsage()),
    billing: sessionBilling(session.sessionManager?.getEntries() ?? session.messages.map(message => ({ type: "message", message }))),
    ...(observations ? { observationPack: observationRuntime(observations) } : {}),
  };
}

// SDK 的 queue_update/clearQueue/getSteeringMessages 只回传文本，图片仅存于 agent 真实队列
// （agent.steeringQueue/followUpQueue.messages，pi-coding-agent 0.85.1 私有字段但为普通属性，
// 元素包含 user 输入与 custom 内部通知，入队后不会被 clearQueue 之外的路径改写）。
// 展示与撤回直接读真实队列：避免按文本做 shadow 映射的同文本键碰撞，
// 也避免 clearQueue 同步触发 queue_update 先清空 shadow 再取图导致撤回丢图。
export function queueStateOf(steeringQueue, followUpQueue) {
  const read = (queue) =>
    queue.messages.map((message) => {
      // SDK sendCustomMessage 入队的 custom 消息 content 可能是字符串；统一归一成块数组再取文/图。
      const content = typeof message.content === "string" ? [{ type: "text", text: message.content }] : (message.content || []);
      return {
        text: content.filter((block) => block.type === "text").map((block) => block.text).join("\n"),
        images: content.filter((block) => block.type === "image").map((block) => ({ ...block })),
      };
    });
  const steering = read(steeringQueue);
  const followUp = read(followUpQueue);
  return {
    steering: steering.map((entry) => entry.text),
    followUp: followUp.map((entry) => entry.text),
    ...(steeringQueue.messages.some((message) => message.role === "custom") || followUpQueue.messages.some((message) => message.role === "custom") ? {
      internal: {
        steering: steeringQueue.messages.map((message) => message.role === "custom"),
        followUp: followUpQueue.messages.map((message) => message.role === "custom"),
      },
    } : {}),
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

// 只撤回用户输入；custom 通知仍计入运行闸门，但不属于用户可编辑队列。
// clearQueue 同时维护 SDK 文本镜像；同步原样恢复内部消息，不能用空闲时会直接落历史的 sendCustomMessage。
export function withdrawQueue(session) {
  const { steeringQueue, followUpQueue } = session.agent;
  const internalSteering = steeringQueue.messages.filter((message) => message.role === "custom");
  const internalFollowUp = followUpQueue.messages.filter((message) => message.role === "custom");
  const queued = queueStateOf(
    { messages: steeringQueue.messages.filter((message) => message.role !== "custom") },
    { messages: followUpQueue.messages.filter((message) => message.role !== "custom") },
  );
  session.clearQueue();
  for (const message of internalSteering) session.agent.steer(message);
  for (const message of internalFollowUp) session.agent.followUp(message);
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

// 标题指令不进系统提示词、不改用户原文：由 context 钩子按 memory.wantsTitle() 逐请求随背景注入。


// 检查点边界：firstKeptEntryId 指向任何真实条目都会把该条之后的历史继续留在请求上下文里；
// 用一个不可能存在的 id 让 buildContextEntries 保留零条旧消息（请求上下文只剩摘要）。
// JSONL 与 getBranch() 全文照旧保留，只有 agent.state.messages 被替换。
const CHECKPOINT_BOUNDARY = "__axiom_checkpoint__";

// 会话记忆接入：context 钩子在每次 LLM 请求（含同一次 prompt 的工具后续轮）注入临时背景；
// executionContext（goal 模式每请求重算）与标题指令同走这里，均只改请求副本。
// 标题指令在 memory.wantsTitle()（标题未定案且本次运行在索要）为真的每个请求都注入：
// 首轮直接委派时模型常漏掉开头的 <title> 行，只注首个请求会让标题永久丢失；自报成功即停注。
// 子代理累计 turn 到达 wrapUpAt（建会话时由 task-budget 按持久化配置定死，逐请求不重读）后，
// 每次请求前附加一次 [轮次预算] 收尾指令（不额外发请求）。上限是软的、故意反复注入：
// 没有硬停——abort 会让 result() 对 aborted 抛错，前面所有轮次的产出一起丢掉。
// transformContext 仅改请求副本、不落盘，不动原始消息历史；
// 助手 message_end（工具执行前）同步调 onReply 取标题，turn_end 只推进本地轮次计数。
function memoryExtension(state, memory, policy, executionContext) {
  return (pi) => {
    pi.on("context", ({ messages }) => {
      const parts = [];
      const background = executionContext?.();
      if (background) parts.push(background);
      if (policy && state && state.turn >= policy.wrapUpAt) parts.push(WRAP_UP_PROMPT);
      if (memory?.wantsTitle?.()) parts.push(TITLE_INSTRUCTION);
      if (!parts.length) return undefined;
      return { messages: [...messages, {
        role: "custom", customType: "axiom-memory", content: parts.join("\n\n"), display: false, timestamp: Date.now(),
      }] };
    });
    pi.on("message_end", ({ message }) => {
      if (message.role === "assistant") memory?.onReply({ message });
      return undefined;
    });
    pi.on("turn_end", () => {
      if (state) state.turn += 1;
      return undefined;
    });
  };
}

export async function createPiFactory({ cwd, model: requested, modelRuntimeOptions, usage }) {
  // 模型目录可被模型配置页刷新（models.json 写入后）：available 用可变绑定，
  // 旧会话的 configure/压缩模型校验才能看到新目录；已绑定的模型对象本身不热更新（SDK 行为）。
  let modelRuntime = await ModelRuntime.create(modelRuntimeOptions);
  let available = await modelRuntime.getAvailable();
  const startup = await discoverCapabilities(cwd, { loadAdapter: false });
  const defaultKey = requested || `${startup.settingsManager.getDefaultProvider()}/${startup.settingsManager.getDefaultModel()}`;
  const factory = async (customTools = [], selection = {}) => {
    const workspace = selection.cwd || cwd;
    const memory = selection.memory || null;
    // 预算策略建会话时随记忆装配捕获一次（memoryHooks 计算，含配置校验），逐请求不重读，避免中途漂移。
    // 主代理没有预算（policy 为 null）：人在盯，且它是会话本体，不该被截断。
    const policy = memory?.policy ?? null;
    // 轮次只在本次子代理进程内计数：子代理不跨重启续命，重启即取消，无需持久化。
    const memoryState = memory ? { turn: 0 } : null;
    // 启动不依赖模型；每次建会话从最新目录选择，网页首次配置后无需重启。
    const key = selection.model || defaultKey;
    // 恢复历史允许暂未鉴权的已知模型；仍保持原模型，请求时由 SDK 报凭据问题。
    const selected = available.find((m) => `${m.provider}/${m.id}` === key)
      || (selection.sessionFile && modelRuntime.getModels().find((m) => `${m.provider}/${m.id}` === key))
      || (!selection.model && !requested && available[0]);
    if (!selected) throw new Error(available.length
      ? `模型不可用：${key}。请在设置中选择可用模型，或检查 AXIOM_MODEL。`
      : "尚未配置可用模型，请先在「设置 → 模型与供应商」添加供应商、模型和凭据。");
    const validateCompaction = (value, mainModel) => {
      const config = normalizeCompaction(value);
      const target = config.model ? available.find((m) => `${m.provider}/${m.id}` === config.model) : mainModel;
      if (!target) throw new Error("Unknown compaction model");
      return resolveCompaction(config, getSupportedThinkingLevels(target));
    };
    const initialCompaction = validateCompaction(selection.compaction, selected);
    const resources = await discoverCapabilities(workspace, {
      loadAdapter: selection.capabilities == null || Boolean(selection.capabilities.mcp?.length),
    });
    const { settingsManager } = resources;
    // 退避计划由 axiom retry 层负责：禁用 SDK 内建自动重试（默认开启 3 次指数退避）避免双重重试。
    // setRetryEnabled 只关 session 层；provider 层（retry.provider.maxRetries，SDK 客户端默认 2 次）
    // 可能来自用户配置并叠加，这里一并清零（仅本会话内存态，不写盘）。
    settingsManager.setRetryEnabled(false);
    settingsManager.applyOverrides({ retry: { provider: { maxRetries: 0 } } });
    // executionContext 与记忆共用 context 钩子；任一存在即装配（子代理也要注入执行上下文）。
    const executionContext = selection.executionContext;
    // Observation Pack：大工具结果先全文发送 FULL_SENDS 次，之后投影为稳定占位符；
    // 原文归档在 selection.observationsDir，面板统计挂 agentRuntime。
    const observations = selection.observationsDir ? createObservationStats() : null;
    const extraFactories = [];
    if (memoryState || typeof executionContext === "function")
      extraFactories.push(memoryExtension(memoryState, memory, policy, executionContext));
    if (selection.observationsDir)
      extraFactories.push({ name: "axiom-observation-pack", factory: observationPackExtension(selection.observationsDir, observations) });
    const { loader, selected: capabilities } = capabilityLoader(resources, selection.capabilities, customTools,
      extraFactories,
      policy ? budgetSystemPrompt(policy) : null);
    await loader.reload();
    const diagnostics = loader.getExtensions().errors;
    if (diagnostics.length) {
      loader.getExtensions().runtime.invalidate();
      throw new Error(`插件加载失败：${diagnostics.map((d) => `${d.path}: ${d.error}`).join("; ")}`);
    }
    const { session } = await createAgentSession({
      cwd: workspace,
      modelRuntime: await ModelRuntime.create(modelRuntimeOptions),
      model: selected,
      thinkingLevel: selection.thinking,
      settingsManager,
      resourceLoader: loader,
      customTools,
      sessionManager: selection.sessionFile
        ? SessionManager.open(selection.sessionFile, selection.sessionDir, workspace)
        : selection.sessionDir ? SessionManager.create(workspace, selection.sessionDir) : SessionManager.inMemory(workspace),
    });
    if (usage) session.agent.streamFunction = wrapUsageStream(session.agent.streamFunction, {
      service: usage, identity: selection.audit ?? { source: "unattributed" },
      createStream: () => new AssistantMessageEventStream(),
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
    // 工具注册与激活分离：插件/自定义工具全部注册进 SDK（enableTools/disableTools 随时增减激活集），
    // 建会话时只按 inactiveTools 决定初始激活集；系统提示词与请求 schema 只含激活工具。
    const inactiveTools = new Set(selection.inactiveTools ?? []);
    if (inactiveTools.size)
      session.setActiveToolsByName(session.getActiveToolNames().filter((name) => !inactiveTools.has(name)));
    let lastResult, reaskController;
    // 安全暂停：在轮次/工具批次边界（工具全部执行完并落盘后、下一个请求发出前）结束本次运行，
    // 不 abort、不丢已产出；队列中的 steering/follow-up 本轮不消费，留给下次 prompt/外层。
    // 两个来源共用这条路径：goal 外层的安全暂停（requestPause）与用户的安全停止（requestSafeStop）。
    // 都只请求边界即停，没有边界可等时（自动重试退避）由 retry.cancel() 取消等待。
    let paused = false;          // goal 暂停：result()/paused() 据此不把收尾当失败
    let safeStopPending = false; // 用户安全停止：前端据此显示等待提示条与停下提醒点
    const shouldPause = selection.shouldPause;
    const stopping = () => paused || safeStopPending;
    // 钩子所有会话（含子代理）一律安装：安全停止与 goal 无关，非 goal 会话没有 shouldPause，
    // 于是它们在没人请求收工时就恒返回 false；原先只给 goal 外层装是当时只有暂停一个来源。
    session.agent.shouldStopAfterTurn = () => {
      if (stopping()) return true; // 已请求：边界即停，不依赖闭包后续取值
      if (typeof shouldPause !== "function") return false;
      try {
        if (!shouldPause()) return false;
      } catch {
        return false; // 契约：不得抛错打断底层循环；钩子出错按“不暂停”继续
      }
      paused = true;
      return true;
    };
    // SDK 的 AgentSession 在内层循环停下后还会 `while (await _handlePostAgentRun()) await agent.continue()`
    // 继续抽干 steering/follow-up 队列，判断尽头就是 agent.hasQueuedMessages()。
    // shouldStopAfterTurn 只终止内层循环，挡不住这层抽水：收工期间让它报告“无排队消息”，
    // 队列实体与展示原样保留，待下次 prompt 复位标志后恢复正常报告；不 abort、不丢消息。
    // 标志必须闩到下一次运行开始才复位，否则抽水那一次查询已经是 false，照样会被拉起来。
    const agentHasQueued = session.agent.hasQueuedMessages.bind(session.agent);
    session.agent.hasQueuedMessages = () => !stopping() && agentHasQueued();
    const cancelledQuestion = () => {
      let messages = session.agent.state.messages;
      const tail = messages.at(-1);
      if (tail?.role === 'assistant' && ['error', 'aborted'].includes(tail.stopReason) && !tail.content.length) messages = messages.slice(0, -1);
      const result = messages.at(-1);
      if (result?.role !== 'toolResult' || result.toolName !== 'question' || !result.isError ||
          !result.content.some((block) => block.type === 'text' && block.text === '提问已取消')) return;
      const assistant = messages.findLast((message) => message.role === 'assistant');
      const call = assistant?.content.find((block) => block.type === 'toolCall' && block.name === 'question' && block.id === result.toolCallId);
      if (call && customTools.some((tool) => tool.name === 'question')) return { assistant, call };
    };
    const queueState = () => queueStateOf(session.agent.steeringQueue, session.agent.followUpQueue);
    // 历史条目含 custom_message（SDK sendCustomMessage 的持久化形态）：转回 message 结构供 UI/恢复使用，
    // 否则 custom 通知在恢复后的消息历史与锚点下标中丢失。
    const messageEntries = () => session.sessionManager.getBranch()
      .filter((entry) => entry.type === "message" || entry.type === "custom_message")
      .map((entry) => entry.type === "custom_message"
        ? { ...entry, message: { role: "custom", customType: entry.customType, content: entry.content ?? [], display: entry.display, details: entry.details, timestamp: new Date(entry.timestamp).getTime() } }
        : entry);
    const compactionRecords = () => session.sessionManager.getBranch().filter((entry) => entry.type === "compaction").map((entry) => {
      const branch = session.sessionManager.getBranch(entry.id);
      return { id: entry.id, summary: entry.summary, ...(entry.details?.progress ? { progress: entry.details.progress } : {}), firstKeptEntryId: entry.firstKeptEntryId,
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
    const retry = createAutoRetry({
      session,
      emit: emitAxiom,
      patterns: selection.retry,
    });
    // 安全停止：只翻标志，实际停在 SDK 的轮次边界（助手回答与本轮工具都正常跑完之后、
    // 拉取 steer/followUp 队列与发起下一次请求之前）。因此不丢产出、不杀进程、不改 stopReason。
    // 钩子已在上面的安全收工处一并安装；这里只做标记，标志复位统一走 beginRun/abort。
    // 每次运行开始都清一次：被 abort 的运行不会走到轮次边界，残留标志会误停下一次运行的第一轮。
    const beginRun = () => {
      safeStopPending = false;
      paused = false; // 复位 goal 暂停，否则暂停过一次就再也跑不动
      lastResult = undefined;
    };
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
        emitAxiom({ type: "agent.runtime", data: agentRuntime(session, observations) });
    });
    return {
      runtime: () => agentRuntime(session, observations),
      sessionFile: () => session.sessionFile,
      historyEntries: messageEntries,
      compactions: compactionRecords,
      compactionStatus: () => compactionCtrl.getStatus(),
      queue: queueState,
      // 上次 prompt 是否在 shouldPause 的安全点停下（非失败）：外层据此区分“已保存的暂停”与异常。
      paused: () => paused,
      // 检查点：用原生 compaction 条目把请求上下文清空为一条摘要；JSONL 全文与 UI 历史（getBranch）保留，队列不动。
      // 只在完全空闲且无排队消息时允许：排队消息属于清空前的上下文，先清会丢来源。
      async checkpoint(summary) {
        const text = String(summary ?? "").trim();
        if (!text) throw new Error("检查点摘要不能为空");
        if (!session.isIdle || session.isRetrying || reaskController)
          throw new Error("会话尚未空闲，无法写入检查点");
        const queue = queueState();
        if (queue.steering.length || queue.followUp.length)
          throw new Error("队列中还有未处理消息，无法写入检查点");
        const tokensBefore = session.getContextUsage()?.tokens
          ?? session.messages.reduce((sum, message) => sum + estimateTokens(message), 0);
        const id = session.sessionManager.appendCompaction(text, CHECKPOINT_BOUNDARY, tokensBefore, undefined, false);
        session.agent.state.messages = session.sessionManager.buildSessionContext().messages;
        const record = compactionRecords().at(-1);
        if (record) emitAxiom({ type: "agent.compaction", data: { ...record, checkpoint: true } });
        return { id, tokensBefore };
      },
      withdraw: () => withdrawQueue(session),
      recall: () => recallLastMessage(session),
      enqueue: (text, type, images) => (type === "steer" ? session.steer(text, images) : session.followUp(text, images)),
      // 子任务完成通知的主会话注入（running 通道）：SDK custom message 与用户 steer 消息分型标记（customType），
      // deliverAs "steer" 入 agent steering 队列，轮次边界（安全点）由 SDK 抽水循环送达——agent run 不结束直到
      // 队列抽干，prompt promise 覆盖整个消化窗口，会话状态机无需变更。消息被消费后经 message_end 进历史
      // 与持久化；被 clear_queue 误清时由 sessions.js 的 notified 判据补投。
      notifyTask: (text) => session.sendCustomMessage(
        { customType: "task-notification", content: text, display: true },
        { deliverAs: "steer" },
      ),
      async configure({ model: key, thinking, compaction }) {
        const currentKey = `${session.model?.provider}/${session.model?.id}`;
        const selected = available.find((m) => `${m.provider}/${m.id}` === key)
          || (key === currentKey ? session.model : undefined);
        if (!selected) throw new Error("模型当前不可用，请在模型配置页检查凭据或重新选择模型");
        const nextCompaction = validateCompaction(compaction ?? compactionCtrl.getConfig(), selected);
        if (thinking && !getSupportedThinkingLevels(selected).includes(thinking)) throw new Error("Unsupported thinking level");
        const previous = session.model;
        const previousThinking = session.thinkingLevel;
        if (selected !== session.model) await session.setModel(selected);
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
        return refreshProjectSkills(loader, capabilities, fresh.catalog, selection.capabilities == null,
          customTools.length ? MAIN_EXCLUDED_SKILLS : []);
      },
      // 激活已注册工具（如进入 Goal 模式启用 goal_*）：与当前激活集合并，未知名称由 SDK 忽略。
      enableTools: (names) => {
        session.setActiveToolsByName([...new Set([...session.getActiveToolNames(), ...names])]);
        emitAxiom({ type: "agent.runtime", data: agentRuntime(session, observations) });
      },
      // 停用已激活工具（如退出 Goal 模式禁用 goal_*）：与当前激活集求差，未知名称无副作用。
      disableTools: (names) => {
        session.setActiveToolsByName(session.getActiveToolNames().filter((name) => !names.includes(name)));
        emitAxiom({ type: "agent.runtime", data: agentRuntime(session, observations) });
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
      // 安全停止请求：幂等，只在运行中有意义（未运行时的残留标志由下一次 beginRun 清掉）。
      // 没有轮次边界可等的场景也要能停：退避等待期由 retry.cancel() 取消等待（无等待时是 no-op，
      // 在飞请求与正在跑的工具不受影响）。
      requestSafeStop: () => {
        safeStopPending = true;
        retry.cancel();
      },
      safeStopPending: () => safeStopPending,
      prompt: async (text, options) => {
        if (await compactionCtrl.maybeApply()) emitAxiom({ type: "agent.runtime", data: agentRuntime(session, observations) });
        beginRun();
        // 背景与标题指令都由 context 钩子按请求实时取（memory.wantsTitle 读会话实时状态，无需透传选项）。
        try {
          await retry.run(() => session.prompt(text, options?.images ? { images: options.images } : undefined));
        } catch (error) {
          // 暂停/安全停止会把等待中的退避取消，retry.run 以取消收尾并抛错：语义是收工，不是运行失败，
          // 交 result()/paused() 表达。
          if (!stopping()) throw error;
        }
      },
      // 手动重试：不带新输入续跑上一次被中断/失败的运行（删掉末尾失败的 assistant 后 continue()，
      // 不重发用户输入，已完成工具结果留在上下文）；若续跑再失败，仍由同一 retry 层接管自动退避。
      // 不跑 compaction：maybeApply 会重写消息数组，与 continue() 靠末尾接续的前提冲突。
      canReask: () => !!cancelledQuestion(),
      reask: async () => {
        const original = cancelledQuestion();
        if (!original || reaskController) throw new Error('没有可重新提问的问题');
        const controller = reaskController = new AbortController();
        beginRun();
        const call = { ...original.call, id: `question_${crypto.randomUUID()}` };
        const append = (message) => {
          const entryId = session.sessionManager.appendMessage(message);
          session.agent.state.messages = [...session.agent.state.messages, message];
          emitAxiom({ type: 'agent.message.start', data: { message } });
          emitAxiom({ type: 'agent.message.end', data: { message, entryId } });
        };
        try {
          const assistant = { ...original.assistant, content: [call], stopReason: 'toolUse', timestamp: Date.now(),
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
          if (session.agent.state.messages.at(-1)?.role === 'assistant') dropFailedAssistant(session);
          append(assistant);
          emitAxiom({ type: 'tool.state', data: { phase: 'start', toolCallId: call.id, toolName: 'question', args: call.arguments } });
          let result, isError = false;
          try { result = await customTools.find((tool) => tool.name === 'question').execute(call.id, call.arguments, controller.signal); }
          catch (error) { isError = true; result = { content: [{ type: 'text', text: error.message || String(error) }] }; }
          append({ role: 'toolResult', toolCallId: call.id, toolName: 'question', ...result, isError, timestamp: Date.now() });
          emitAxiom({ type: 'tool.state', data: { phase: 'end', toolCallId: call.id, toolName: 'question', result, isError } });
          if (!controller.signal.aborted && !isError) await retry.run(() => session.agent.continue());
        } finally { reaskController = undefined; }
      },
      resumable: () => canResume(session),
      resume: async () => {
        if (!canResume(session)) throw new Error("没有可重试的请求：上一次运行已正常结束");
        beginRun();
        await retry.run(() => {
          dropFailedAssistant(session);
          return session.agent.continue();
        });
      },
      // 用户暂停（goal 的 pause/adjust/restart 等）：只在轮次/工具批次边界生效。
      // 只取消等待中的自动重试退避，不 abort 会话：在飞的请求与正在跑的工具照常完成并落盘，
      // 已入队消息不被消费；随后 shouldStopAfterTurn 在下一个安全边界结束本轮。
      // 置 paused：result() 据此不把“暂停导致的取消/失败”当错误（见 paused()）。
      requestPause() {
        paused = true;
        retry.cancel();
      },
      async abort() {
        safeStopPending = false; // 强制停止后不该留个待停标志误停下一次运行
        reaskController?.abort();
        retry.cancel(); // 先中断等待中的自动重试，避免 abort 后又发起 continue
        await Promise.all([compactionCtrl.cancel?.(), session.abort()]);
      },
      async dispose() {
        reaskController?.abort();
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
        // 用户主动暂停/安全停止而收尾（退避被取消/边界停在 error·aborted·length 消息上）不算失败：
        // 返回已有文本（可能为空），由 paused() 说明；未经收工请求的真实失败照旧抛错并进一步暴露。
        if (!stopping() && ["error", "aborted", "length"].includes(last.stopReason))
          throw new Error(
            last?.errorMessage || last?.stopReason || "No assistant result",
          );
        const text = last.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("\n");
        // 不剥记忆标签：result() 是模型原文出口，落库与父代理 read_result 都要原文；
        // 剥离只属于展示层（public/app.js 渲染前自己剥）。
        return text;
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
    modelRuntime = await ModelRuntime.create(modelRuntimeOptions);
    available = await modelRuntime.getAvailable();
    return factory.catalog();
  };
  factory.authProviders = () => modelRuntime.getProviders().map((provider) => ({
    id: provider.id, name: provider.name || provider.id,
    methods: Object.entries(provider.auth || {}).filter(([, auth]) => typeof auth.login === "function")
      .map(([type, auth]) => ({ type, name: auth.name || type })),
    configured: modelRuntime.hasConfiguredAuth(provider.id),
  }));
  factory.login = (providerId, type, interaction) => modelRuntime.login(providerId, type, interaction);
  factory.logout = (providerId, options) => modelRuntime.logout(providerId, options);
  // 配置页需要未登录模型的定义；只投影可编辑的非凭据字段，绝不返回 headers/apiKey。
  factory.modelCatalog = () => modelRuntime.getModels().map((m) => ({
    provider: m.provider, id: m.id, name: m.name, key: `${m.provider}/${m.id}`,
    levels: getSupportedThinkingLevels(m), input: m.input, api: m.api,
    reasoning: m.reasoning, contextWindow: m.contextWindow, maxTokens: m.maxTokens,
    thinkingLevelMap: m.thinkingLevelMap, cost: m.cost,
  }));
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
