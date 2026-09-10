import { renderMarkdown } from "./markdown.js";
import { createStreamRenderer } from "./stream-renderer.js";
const $ = (id) => document.getElementById(id);
let ws,
  sessionId,
  models = [],
  config,
  runtime,
  activeTask,
  busy = false,
  changing = false,
  connected = false,
  creation;
let allSessions = [],
  follow = true;
const views = new Map();
const compactionDefaults = { enabled: false, tokenThreshold: 100000, percentThreshold: 70, model: null, thinking: "off", keepRecentTokens: 20000 };
const thinkingLevels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
let compactions = [], mainItems = [], sessionCompaction;
let contextFiles = [], contextMode, contextListing = { path: "", entries: [] }, contextLoad = 0, pickingWorkspace = false;
try {
  sessionId = localStorage.getItem("axiom.session") || undefined;
} catch {}
function saveView() {
  if (sessionId)
    views.set(sessionId, {
      draft: $("prompt").value,
      contextFiles: [...contextFiles],
      scroll: $("transcript").scrollTop,
      follow,
    });
}
function resizePrompt() {
  $("prompt").style.height = "auto";
  $("prompt").style.height = Math.min($("prompt").scrollHeight, 240) + "px";
}
let scrollFrame;
function scrollLatest() {
  if (changing || scrollFrame !== undefined || (!follow && !activeTask?.follow)) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = undefined;
    if (changing) return;
    if (follow) $("transcript").scrollTop = $("transcript").scrollHeight;
    if (activeTask?.node.open && activeTask.follow)
      activeTask.output.scrollTop = activeTask.output.scrollHeight;
  });
}
const renderer = createStreamRenderer(renderMarkdown, scrollLatest);
$("transcript").onscroll = () => {
  const el = $("transcript");
  follow = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  $("latest").hidden = follow;
};
$("latest").onclick = () => {
  follow = true;
  $("latest").hidden = true;
  scrollLatest();
};
const mobile = matchMedia("(max-width: 700px)");
function sidebar(open) {
  document.querySelector(".shell").classList.toggle("collapsed", !open);
  $("toggle-sidebar").setAttribute("aria-expanded", String(open));
  $("sidebar-backdrop").hidden = !open || !mobile.matches;
  document.querySelector("main").inert = open && mobile.matches;
  if (open && mobile.matches) $("search").focus();
  else if ($("sidebar").contains(document.activeElement))
    $("toggle-sidebar").focus();
}
$("toggle-sidebar").onclick = () =>
  sidebar($("toggle-sidebar").getAttribute("aria-expanded") !== "true");
$("sidebar-backdrop").onclick = () => sidebar(false);
mobile.onchange = () => sidebar(!mobile.matches);
sidebar(!mobile.matches);
const pending = new Map(),
  live = new Map(),
  tasks = new Map();
function error(e) {
  $("error").textContent = e.message || String(e);
}
function request(type, data = {}) {
  return new Promise((resolve, reject) => {
    if (ws?.readyState !== WebSocket.OPEN)
      return reject(new Error("连接已断开，请重新连接"));
    const id = crypto.randomUUID();
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, type, ...data }));
  });
}
function controls() {
  const unavailable = !connected || changing;
  for (const id of ["provider", "model", "thinking", "subagent-provider", "subagent-model"])
    $(id).disabled = unavailable;
  $("subagent-model").disabled ||= !$("subagent-provider").value;
  $("settings-feedback").textContent = unavailable
    ? (changing ? "正在保存或切换配置…" : "连接断开，暂时无法修改配置")
    : "更改自动保存，模型在下一次请求生效";
  $("create-submit").disabled = unavailable || !creation?.main || creation.loading || (!creation.defaults && creation.needsTrust);
  if (creation?.defaults) for (const fieldset of $("create-agents").children) fieldset.disabled = unavailable;
  $("queue-type").disabled = unavailable;
  for (const input of document.querySelectorAll("#session-compaction input, #session-compaction select"))
    input.disabled = unavailable;
  $("composer-skill").disabled = unavailable || !config?.skills?.length;
  $("composer-skill").value = /^\/skill:([^\s]+)/.exec($("prompt").value)?.[1] || "";
  $("add-context").disabled = unavailable;
  $("open-workspace").disabled = unavailable || pickingWorkspace;
  $("reveal-workspace").disabled = unavailable;
  $("copy-workspace").disabled = !$("workspace-label").textContent;
  renderContextChips();
  for (const id of ["send", "send-steer", "send-followup"])
    $(id).disabled = unavailable || !$("prompt").value.trim();
  $("send-steer").hidden = $("send-followup").hidden = !busy;
  $("stop").disabled = !busy || unavailable;
  $("stop").hidden = !busy;
  $("send").hidden = busy;
  for (const id of ["new", "custom-new"]) $(id).disabled = unavailable;
  for (const button of document.querySelectorAll(".session-actions button")) button.disabled = unavailable;
  $("status").dataset.connected = String(connected);
  $("status").textContent = connected ? (busy ? "Running" : "Idle") : "连接断开";
}
function options(select, entries, selected) {
  select.replaceChildren(
    ...entries.map(
      ([value, text]) => new Option(text, value, false, value === selected),
    ),
  );
}
function fillModels() {
  options(
    $("model"),
    models
      .filter((m) => m.provider === $("provider").value)
      .map((m) => [m.key, m.name || m.id]),
    config?.model,
  );
}
function fillSubagentModels() {
  const provider = $("subagent-provider").value;
  options(
    $("subagent-model"),
    provider
      ? models.filter((m) => m.provider === provider).map((m) => [m.key, m.name || m.id])
      : [["", "跟随主代理模型"]],
    config?.subagentModel || "",
  );
}
function capabilityName(id) {
  const parts = id.split(/[\\/]/).filter(Boolean);
  if (/^skill\.md$/i.test(parts.at(-1))) return parts.at(-2) || id;
  const packageIndex = parts.lastIndexOf("node_modules");
  if (packageIndex >= 0) {
    const name = parts.slice(packageIndex + 1);
    return name.slice(0, name[0]?.startsWith("@") ? 2 : 1).join("/") || id;
  }
  return /^index\.[cm]?[jt]s$/i.test(parts.at(-1)) ? parts.at(-2) || id : parts.at(-1) || id;
}
function runtimeSummary(value = {}) {
  const { usage, context, model, thinking } = value;
  const input = (usage?.input ?? 0) + (usage?.cacheRead ?? 0) + (usage?.cacheWrite ?? 0);
  const count = (n) => Number.isFinite(n) ? n.toLocaleString("en-US") : "—";
  const cache = input > 0 && Number.isFinite(usage?.cacheRead)
    ? `${(usage.cacheRead / input * 100).toFixed(1)}% (${count(usage.cacheRead)} tokens)` : "暂无数据";
  const contextText = context?.contextWindow > 0
    ? `${count(context.tokens)} / ${count(context.contextWindow)} tokens${Number.isFinite(context.percent) ? ` · ${context.percent.toFixed(1)}%` : " · 待更新"}`
    : "暂无数据";
  const split = model?.indexOf("/") ?? -1;
  const identity = split >= 0 ? `${model.slice(0, split)} · ${model.slice(split + 1)}` : model || "模型待加载";
  return [`缓存命中 ${cache}`, `上下文 ${contextText}`, `${identity} · ${thinking || "未知"}`];
}
function renderRuntime(node, value) {
  node.replaceChildren(...runtimeSummary(value).map((text) => {
    const span = document.createElement("span");
    span.textContent = text;
    return span;
  }));
  node.title = "缓存命中：最近一次模型请求的缓存读取 / 输入总量（含缓存读写）；上下文：Pi 当前估算，非累计消耗。";
}
function updateTaskRuntime(task, value) {
  if (!task) return;
  renderRuntime(task.runtime, value);
  task.systemPrompt.textContent = value?.systemPrompt ?? "系统提示词尚未加载";
}
function applyConfig(value) {
  config = value;
  options($("composer-skill"), [["", value.skills?.length ? "选择 Skill（本次发送加载）" : "此会话无可用 Skill"],
    ...(value.skills || []).map((skill) => [skill.name, skill.name])]);
  for (const option of $("composer-skill").options)
    option.title = value.skills?.find((skill) => skill.name === option.value)?.description || "";
  $("queue-type").value = value.queueType || "steer";
  runtime = value.runtime ?? { ...runtime, model: value.model, thinking: value.thinking };
  renderRuntime($("session-runtime"), runtime);
  options(
    $("subagent-provider"),
    [["", "跟随主代理"], ...[...new Set(models.map((m) => m.provider))].map((p) => [p, p])],
    models.find((m) => m.key === value.subagentModel)?.provider || "",
  );
  fillSubagentModels();
  $("provider").value = models.find((m) => m.key === value.model)?.provider;
  fillModels();
  options(
    $("thinking"),
    value.levels.map((v) => [v, v]),
    value.thinking,
  );
}
async function configure(thinking) {
  let failure;
  changing = true;
  controls();
  $("error").textContent = "";
  try {
    const compaction =
      sessionCompaction?.dirty && sessionCompaction.valid() ? sessionCompaction.read() : undefined;
    applyConfig(
      await request("session.configure", {
        sessionId,
        model: $("model").value,
        queueType: $("queue-type").value,
        subagentModel: $("subagent-model").value || null,
        ...(thinking ? { thinking } : {}),
        ...(compaction ? { compaction } : {}),
      }),
    );
    // 旧后端响应可能缺少 compaction，用本地提交值回显；新后端以服务端规范化值为准。
    if (compaction && !config.compaction) config.compaction = compaction;
  } catch (e) {
    error(e);
    failure = e.message || String(e);
    if (config) applyConfig(config);
  } finally {
    changing = false;
    controls();
    if (failure) $("settings-feedback").textContent = `保存失败：${failure}`;
  }
}
$("open-settings").onclick = () => {
  controls();
  $("settings").showModal();
  openCreation(true);
};
$("settings").onclick = (e) => {
  if (e.target !== $("settings")) return;
  const rect = $("settings").getBoundingClientRect();
  if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)
    $("settings").close();
};
function card(title, task) {
  $("output").querySelector(".empty")?.remove();
  const node = document.createElement("article");
  node.className = title === "你" ? "message user" : "message";
  const heading = document.createElement("h3");
  heading.textContent = title;
  heading.hidden = title === "你";
  const thinking = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "思考过程";
  const thought = document.createElement("pre");
  thinking.append(summary, thought);
  thinking.hidden = true;
  const text = document.createElement("div");
  text.className = "markdown";
  const modelInfo = document.createElement("small");
  modelInfo.className = "message-model";
  node.append(heading, thinking, text, modelInfo);
  if (task && !task.trigger.isConnected) $("output").append(task.trigger);
  (task?.output || $("output")).append(node);
  if (!task || task.node.open) scrollLatest();
  const item = {
    task,
    modelInfo,
    node,
    heading,
    thinking,
    thought,
    text,
    buffer: "",
    reasoning: "",
    paintedText: "",
  };
  task?.messages.push(item);
  thinking.ontoggle = () => {
    if (thinking.open) renderer.mark(item);
  };
  return item;
}
function renderMessage(item, message) {
  item.modelInfo.textContent = message.role === "assistant" && message.model
    ? `${message.provider || "未知供应商"} / ${message.model}${message.usage ? ` · 输入 ${message.usage.input} · 输出 ${message.usage.output}` : ""}` : "";
  const content =
    typeof message.content === "string"
      ? [{ type: "text", text: message.content }]
      : message.content || [];
  item.buffer = content
    .filter((c) => c?.type === "text")
    .map((c) => c.text)
    .join("\n");
  item.reasoning = content
    .filter((c) => c?.type === "thinking")
    .map((c) => c.thinking)
    .join("\n");
  if (message.role === "user") {
    item.skillBlocks?.remove();
    const blocks = document.createElement("div");
    item.buffer = item.buffer.replace(/<skill name="([^"]+)" location="([^"]*)">\r?\n([\s\S]*?)\r?\n<\/skill>/g, (_, name, location, body) => {
      const details = document.createElement("details");
      details.className = "skill-invocation";
      const summary = document.createElement("summary");
      summary.textContent = `[skill] ${name}`;
      summary.title = "技能正文已加入本条消息，点击展开";
      const path = document.createElement("small");
      path.textContent = location;
      const content = document.createElement("div");
      details.append(summary, path, content);
      let rendered = false;
      details.ontoggle = () => { if (details.open && !rendered) { renderMarkdown(content, body); rendered = true; } };
      blocks.append(details);
      return "";
    }).trim();
    item.skillBlocks = blocks;
    item.node.prepend(blocks);
  }
  renderer.flush(item);
}
function compactionCard(data) {
  const node = document.createElement("details");
  node.className = "compaction-card";
  const label = document.createElement("summary");
  const badge = document.createElement("span");
  badge.textContent = "上下文已压缩";
  const meta = document.createElement("small");
  const tokens = (value) => (Number.isFinite(value) ? value.toLocaleString("en-US") : "—");
  meta.textContent = `压缩前 ${tokens(data.tokensBefore)} tokens${Number.isFinite(data.estimatedTokensAfter) ? ` · 压缩后约 ${tokens(data.estimatedTokensAfter)} tokens` : ""}`;
  const body = document.createElement("div");
  body.className = "markdown compaction-summary";
  label.append(badge, meta);
  node.append(label, body);
  // renderMarkdown 走 DOMPurify 白名单，摘要里的富文本不会执行。
  renderMarkdown(body, data.summary || "");
  return node;
}
function foldCompaction(data) {
  const ids = new Set(data.compactedMessageIds || []);
  const items = mainItems
    .filter(({ item, entryId }) => entryId && ids.has(entryId) && item.node.isConnected && !item.node.hidden)
    .sort((a, b) => (a.item.node.compareDocumentPosition(b.item.node) & 4 ? -1 : 1));
  if (!items.length) return;
  const anchor = items.at(-1).item.node.nextElementSibling;
  const top = anchor?.getBoundingClientRect().top ?? 0;
  items[0].item.node.before(compactionCard(data));
  for (const { item } of items) item.node.hidden = true;
  // 折叠改变上方高度，按保留消息的位移补偿滚动位置，保持阅读锚点而不强制到底部。
  if (anchor) $("transcript").scrollTop += anchor.getBoundingClientRect().top - top;
}
function compactionEditor(initial, mainModel, commit) {
  initial = { ...compactionDefaults, ...initial };
  const number = (input, max, fractional = false) => {
    const text = input.value.trim();
    if (!text) return null;
    const value = Number(text);
    if (!Number.isFinite(value) || value <= 0 || value > max || (!fractional && !Number.isInteger(value)))
      return NaN;
    return value;
  };
  const node = document.createElement("fieldset");
  node.className = "capability-agent compaction-settings";
  const legend = document.createElement("legend");
  legend.textContent = "自动压缩";
  const toggle = document.createElement("label");
  toggle.className = "compaction-toggle";
  const enabled = Object.assign(document.createElement("input"), { type: "checkbox" });
  enabled.checked = initial.enabled;
  toggle.append(enabled, document.createTextNode("启用自动压缩"));
  const selectors = document.createElement("div");
  selectors.className = "selectors settings-selectors";
  const field = (text, input) => {
    const label = document.createElement("label");
    const span = document.createElement("span");
    span.textContent = text;
    label.append(span, input);
    selectors.append(label);
    return input;
  };
  const token = field("Token 阈值", Object.assign(document.createElement("input"), { type: "number", min: "1", placeholder: "不启用" }));
  token.value = initial.tokenThreshold ?? "";
  const percent = field("百分比阈值", Object.assign(document.createElement("input"), { type: "number", min: "0", max: "100", step: "any", placeholder: "不启用" }));
  percent.value = initial.percentThreshold ?? "";
  const keep = field("保留最近 tokens", Object.assign(document.createElement("input"), { type: "number", min: "1" }));
  keep.value = initial.keepRecentTokens;
  const model = field("压缩模型", document.createElement("select"));
  options(model, [["", "跟随主代理模型"], ...models.map((m) => [m.key, m.name || m.id])], initial.model || "");
  const thinking = field("压缩思考等级", document.createElement("select"));
  const read = () => {
    const kept = number(keep, Number.MAX_SAFE_INTEGER);
    return {
      enabled: enabled.checked,
      tokenThreshold: number(token, Number.MAX_SAFE_INTEGER),
      percentThreshold: number(percent, 100, true),
      model: model.value || null,
      thinking: thinking.value,
      keepRecentTokens: kept == null ? compactionDefaults.keepRecentTokens : kept,
    };
  };
  const error = () => {
    if (Number.isNaN(number(token, Number.MAX_SAFE_INTEGER))) return "Token 阈值需为大于 0 的整数";
    if (Number.isNaN(number(percent, 100, true))) return "百分比阈值需为大于 0 且不超过 100 的数值";
    if (Number.isNaN(number(keep, Number.MAX_SAFE_INTEGER))) return "保留最近 tokens 需为大于 0 的整数";
    const value = read();
    return value.enabled && value.tokenThreshold == null && value.percentThreshold == null
      ? "启用自动压缩时至少设置一个触发阈值" : "";
  };
  const valid = () => !error();
  const fillThinking = () => {
    const levels = models.find((m) => m.key === (model.value || mainModel()))?.levels || thinkingLevels;
    const current = thinking.value || initial.thinking;
    options(thinking, levels.map((v) => [v, v]), levels.includes(current) ? current : "off");
  };
  let dirty = false;
  const change = () => {
    dirty = true;
    commit?.(read(), error());
  };
  model.onchange = () => {
    fillThinking();
    change();
  };
  fillThinking();
  for (const input of [enabled, token, percent, keep, thinking]) input.onchange = change;
  const hint = document.createElement("p");
  hint.className = "compaction-hint";
  hint.textContent = "两个阈值至少填一个（先到先触发，可同时设置）；较早对话折叠为摘要卡片，保留最近内容，压缩固定不使用工具。";
  node.append(legend, toggle, selectors, hint);
  return { node, read, valid, error, fillThinking, get dirty() { return dirty; } };
}
function commitCompaction(value, message) {
  if (message) {
    $("settings-feedback").textContent = message;
    return;
  }
  void configure();
}
function buildSessionCompaction() {
  const node = $("session-compaction");
  node.replaceChildren();
  sessionCompaction = compactionEditor(config.compaction || compactionDefaults, () => $("model").value, commitCompaction);
  node.append(sessionCompaction.node);
}
function renderQueue(queue = {}) {
  const entries = [["Steer", queue.steering || []], ["Follow-up", queue.followUp || []]];
  $("message-queue").replaceChildren(...entries.flatMap(([type, texts]) => texts.map((text) => {
    const row = document.createElement("button");
    row.type = "button";
    row.title = "撤回全部队列到输入框修改（与 Pi 原生一致）";
    row.onclick = () => { void withdrawQueue(); };
    const badge = document.createElement("strong");
    badge.textContent = type;
    const content = document.createElement("span");
    content.textContent = text;
    row.append(badge, content);
    return row;
  })));
  $("message-queue").hidden = !$("message-queue").children.length;
}
function event(message) {
  if (message.sessionId !== sessionId) return;
  const { type, agentId = "main", data } = message;
  if (type === "session.queue" && agentId === "main") renderQueue(data);
  if (type === "agent.message.end" && data.message.role === "user") {
    const item = card("你", tasks.get(agentId));
    renderMessage(item, data.message);
    if (agentId === "main") mainItems.push({ item, entryId: data.entryId });
  }
  if (type === "agent.runtime") {
    if (agentId === "main") {
      runtime = data;
      renderRuntime($("session-runtime"), runtime);
    } else updateTaskRuntime(tasks.get(agentId), data);
  }
  if (type === "session.state") {
    void refreshSessions().catch(error);
    busy = data.status !== "idle";
    controls();
  }
  if (type === "agent.message.start" && data.message.role === "assistant")
    live.set(
      agentId,
      card(
        agentId === "main" ? "AXIOM" : `子 Agent · ${agentId.slice(0, 8)}`,
        tasks.get(agentId),
      ),
    );
  if (type === "agent.delta") {
    const item = live.get(agentId);
    if (!item) return;
    if (data.type === "text_delta") item.buffer += data.delta;
    else if (data.type === "thinking_delta") item.reasoning += data.delta;
    else return;
    renderer.mark(item);
  }
  if (type === "agent.message.end" && data.message.role === "assistant") {
    const item =
      live.get(agentId) ||
      card(agentId === "main" ? "AXIOM" : "子 Agent", tasks.get(agentId));
    renderMessage(item, data.message);
    live.delete(agentId);
    if (agentId === "main") mainItems.push({ item, entryId: data.entryId });
  }
  if (type === "agent.compaction" && agentId === "main" && !compactions.some((c) => c.id === data.id)) {
    compactions.push(data);
    foldCompaction(data);
  }
  if (type === "task.state") {
    if (!tasks.has(message.taskId)) {
      const fragment = $("task-template").content.cloneNode(true);
      const trigger = fragment.querySelector(".task-card");
      const node = fragment.querySelector("dialog");
      const heading = node.querySelector("h2");
      node.id = `task-${message.taskId}`;
      heading.id = `${node.id}-title`;
      node.setAttribute("aria-labelledby", heading.id);
      trigger.setAttribute("aria-controls", node.id);
      const task = {
        node, trigger, heading, messages: [], follow: true,
        title: trigger.querySelector(".task-title"),
        status: trigger.querySelector(".task-status"),
        output: node.querySelector(".task-body"),
        runtime: node.querySelector(".runtime-summary"),
        description: node.querySelector(".task-description"),
        systemPrompt: node.querySelector(".task-system-prompt pre"),
        failure: node.querySelector(".task-error"),
      };
      trigger.onclick = () => {
        activeTask = task;
        node.showModal();
        for (const item of task.messages) renderer.mark(item);
        scrollLatest();
      };
      for (const button of node.querySelectorAll("[data-scroll]")) button.onclick = () => {
        task.follow = button.dataset.scroll === "bottom";
        task.output.scrollTop = task.follow ? task.output.scrollHeight : 0;
      };
      task.output.onscroll = () => {
        const el = task.output;
        task.follow = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      };
      node.onclose = () => { if (!node.open && activeTask === task) activeTask = undefined; };
      node.onclick = (e) => {
        if (e.target !== node) return;
        const rect = node.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)
          node.close();
      };
      $("output").querySelector(".empty")?.remove();
      $("output").append(trigger);
      $("task-overlays").append(node);
      tasks.set(message.taskId, task);
    }
    const item = tasks.get(message.taskId);
    item.trigger.dataset.status = item.node.dataset.status = data.status;
    const status = { starting: "启动中", running: "Running", completed: "已完成", failed: "失败", cancelled: "已取消" }[data.status] || data.status;
    item.status.textContent = status;
    item.heading.textContent = `SUBAGENT · ${status}`;
    item.title.textContent = item.trigger.title = data.task;
    item.description.textContent = data.task;
    item.failure.textContent = data.error || "";
    item.failure.hidden = !data.error;
    updateTaskRuntime(item, data.runtime);
    scrollLatest();
  }
  if (type === "error") error(data.message);
}
function snapshot(state) {
  clearTimeout(escapeTimer);
  escapeTimer = undefined;
  activeTask?.node.close();
  activeTask = undefined;
  $("task-overlays").replaceChildren();
  renderer.clear();
  if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame);
  scrollFrame = undefined;
  sessionId = state.sessionId;
  try {
    localStorage.setItem("axiom.session", sessionId);
  } catch {}
  $("session-title").textContent = state.title || "新会话";
  $("workspace-name").textContent = state.cwd
    .split(/[\\/]/)
    .filter(Boolean)
    .at(-1);
  $("workspace-picker").open = false;
  $("cwd").value = state.cwd;
  $("workspace-label").textContent = state.cwd;
  busy = state.status !== "idle";
  $("output").replaceChildren();
  live.clear();
  tasks.clear();
  compactions = state.compactions || [];
  mainItems = [];
  for (const task of state.tasks) {
    event({ type: "task.state", sessionId, taskId: task.id, data: task });
    tasks.get(task.id).trigger.remove();
  }
  const folded = new Map();
  for (const record of compactions)
    for (const entryId of record.compactedMessageIds || [])
      if (!folded.has(entryId)) folded.set(entryId, record);
  const placed = new Set();
  for (const { agentId, message, entryId } of state.messages)
    if (["assistant", "user"].includes(message.role)) {
      if (agentId === "main" && entryId && folded.has(entryId)) {
        const record = folded.get(entryId);
        if (!placed.has(record.id)) {
          placed.add(record.id);
          $("output").append(compactionCard(record));
        }
        continue;
      }
      const item = card(
        message.role === "user"
          ? "你"
          : agentId === "main"
            ? "AXIOM"
            : "子 Agent",
        tasks.get(agentId),
      );
      renderMessage(item, message);
      if (agentId === "main") mainItems.push({ item, entryId });
    }
  for (const [agentId, message] of Object.entries(state.live))
    if (message.role === "assistant") {
      const item = card(
        agentId === "main" ? "AXIOM" : "子 Agent",
        tasks.get(agentId),
      );
      renderMessage(item, message);
      live.set(agentId, item);
    }
  for (const task of tasks.values())
    if (!task.trigger.isConnected) $("output").append(task.trigger);
  if (!$("output").children.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML =
      '<span class="empty-mark" aria-hidden="true">A</span><p class="eyebrow">你的本地 AI 工作台</p><h2>把想法，变成下一步。</h2><p>描述目标，让 Axiom 协同思考与执行。</p><div class="empty-hints"><span>梳理代码</span><span>排查问题</span><span>实现想法</span></div>';
    $("output").append(empty);
  }
  const view = views.get(sessionId);
  $("prompt").value = view?.draft || "";
  contextFiles = [...(view?.contextFiles || [])];
  contextLoad++;
  $("context-picker").close();
  follow = view?.follow ?? true;
  $("latest").hidden = follow;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = undefined;
    resizePrompt();
    $("transcript").scrollTop = follow
      ? $("transcript").scrollHeight
      : (view?.scroll ?? 0);
  });
  renderQueue(state.queue);
  runtime = state.runtime;
  applyConfig(state.config);
  config.compaction = state.config.compaction || compactionDefaults;
  buildSessionCompaction();
  controls();
}
let reconnectTimer, connecting = false, reconnectDelay = 1000;
$("login").onsubmit = async (e) => {
  e.preventDefault();
  if (connecting || connected) return;
  clearTimeout(reconnectTimer);
  connecting = true;
  connected = false;
  controls();
  $("connect").disabled = true;
  $("status").textContent = "连接中";
  $("error").textContent = "";
  try {
    ws = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
      ["axiom"],
    );
    ws.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.type === "response") {
        const p = pending.get(message.id);
        if (p) {
          pending.delete(message.id);
          message.ok
            ? p.resolve(message.data)
            : p.reject(new Error(message.error));
        }
      } else event(message);
    };
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error("连接失败，请检查服务是否运行"));
      ws.onclose = () => {
        connected = false;
        if (!$("workspace").hidden) saveView();
        reject(new Error("连接断开"));
        for (const p of pending.values()) p.reject(new Error("连接断开"));
        pending.clear();
        if (!connecting) scheduleReconnect();
        $("login").hidden = false;
        $("connect").disabled = false;
        controls();
      };
    });
    models = await request("models.list");
    options(
      $("provider"),
      [...new Set(models.map((m) => m.provider))].map((p) => [p, p]),
    );
    let state;
    if (sessionId) {
      try {
        state = await request("session.attach", { sessionId });
      } catch {
        sessionId = undefined;
      }
    }
    if (!state) {
      const existing = await request("sessions.list");
      state = existing.length
        ? await request("session.attach", { sessionId: existing[0].id })
        : await request("session.create");
    }
    if (!$("workspace").hidden) saveView();
    snapshot(state);
    await refreshSessions();
    $("login").hidden = true;
    $("workspace").hidden = false;
    connected = true;
    reconnectDelay = 1000;
    resizePrompt();
    controls();
  } catch (e) {
    error(e);
    $("login").hidden = false;
    ws?.close();
  } finally {
    connecting = false;
    $("connect").disabled = false;
    controls();
    if (!connected) scheduleReconnect();
  }
};
function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => $("login").requestSubmit(), reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 15000);
}
controls();
$("login").requestSubmit();
$("provider").onchange = () => {
  fillModels();
  void configure();
};
$("model").onchange = () => {
  sessionCompaction?.fillThinking();
  void configure();
};
$("subagent-provider").onchange = () => {
  fillSubagentModels();
  void configure();
};
$("subagent-model").onchange = () => {
  void configure();
};
$("queue-type").onchange = () => { void configure(); };
$("thinking").onchange = () => {
  void configure($("thinking").value);
};
$("composer").onsubmit = async (e) => {
  e.preventDefault();
  const draft = $("prompt").value;
  const files = [...contextFiles];
  const text = [draft.trim(), files.length ? `工作空间引用（按需读取；文件夹不代表已读取全部内容）：\n${files.map((file) => `- ${file.directory ? "文件夹" : "文件"}：${JSON.stringify(file.path)}`).join("\n")}` : ""].filter(Boolean).join("\n\n");
  if (!draft.trim() || changing || !connected) return;
  const wasBusy = busy;
  const queueType = e.submitter?.dataset.queue || config?.queueType || "steer";
  busy = true;
  controls();
  $("error").textContent = "";
  const sendingSession = sessionId;

  follow = true;
  scrollLatest();
  try {
    await request("prompt", { sessionId: sendingSession, text, ...(wasBusy ? { queueType } : {}) });
    if (sessionId === sendingSession && $("prompt").value === draft) {
      $("prompt").value = "";
      contextFiles = contextFiles.filter((file) => !files.includes(file));
      resizePrompt();
      controls();
    }
    const saved = views.get(sendingSession);
    if (saved?.draft === draft) {
      saved.draft = "";
      saved.contextFiles = (saved.contextFiles || []).filter((file) => !files.includes(file));
    }
    void refreshSessions().catch(error);
  } catch (e) {
    if (sessionId === sendingSession) {
      error(e);
      busy = wasBusy;
      controls();
    }
  }
};
$("prompt").onkeydown = (e) => {
  if (e.key !== "Enter" || e.isComposing || e.keyCode === 229) return;
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const input = e.currentTarget;
    input.setRangeText("\n", input.selectionStart, input.selectionEnd, "end");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  } else if (!e.shiftKey && !e.altKey) {
    e.preventDefault();
    $("composer").requestSubmit();
  }
};
let escapeTimer, withdrawing;
async function withdrawQueue() {
  if (withdrawing || !connected || changing) return;
  const target = sessionId;
  withdrawing = true;
  try {
    const queue = await request("queue.withdraw", { sessionId: target });
    const text = [...queue.steering, ...queue.followUp].join("\n\n");
    if (!text) return;
    if (sessionId === target) {
      $("prompt").value = [$("prompt").value, text].filter(Boolean).join("\n\n");
      resizePrompt(); controls(); $("prompt").focus();
    } else {
      const view = views.get(target) || {};
      view.draft = [view.draft, text].filter(Boolean).join("\n\n");
      views.set(target, view);
    }
  } catch (e) { error(e); }
  finally { withdrawing = false; }
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || e.isComposing || document.querySelector("dialog[open]")) return;
  if (
    mobile.matches &&
    $("toggle-sidebar").getAttribute("aria-expanded") === "true"
  ) {
    sidebar(false);
    $("toggle-sidebar").focus();
  } else if (!e.repeat) {
    e.preventDefault();
    if (escapeTimer) {
      clearTimeout(escapeTimer);
      escapeTimer = undefined;
      if (busy) $("stop").click();
    } else {
      escapeTimer = setTimeout(() => { escapeTimer = undefined; void withdrawQueue(); }, 300);
    }
  }
});
$("stop").onclick = async () => {
  const target = sessionId;
  try {
    await withdrawQueue();
    await request("cancel", { sessionId: target });
  } catch (e) {
    error(e);
  }
};
let refreshing;
function refreshSessions() {
  if (refreshing) return refreshing;
  refreshing = updateSessions().finally(() => {
    refreshing = undefined;
  });
  return refreshing;
}
async function updateSessions() {
  allSessions = await request("sessions.list");
  const active = allSessions.find((s) => s.id === sessionId);
  if (active) $("session-title").textContent = active.title;
  const paths = [...new Set(allSessions.map((s) => s.cwd))];
  $("workspaces").replaceChildren(...paths.map((p) => new Option(p, p)));
  renderSessions();
}
async function switchSession(action) {
  if (changing || !connected) return;
  saveView();
  changing = true;
  $("error").textContent = "";
  controls();
  try {
    snapshot(await action());
    if (mobile.matches) sidebar(false);
    await refreshSessions();
  } catch (e) {
    error(e);
  } finally {
    changing = false;
    controls();
  }
}
function renderSessions() {
  const fragment = document.createDocumentFragment();
  const query = $("search").value.trim().toLowerCase();
  let group;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const s of allSessions.filter(
    (s) =>
      s.cwd === $("workspace-label").textContent &&
      s.title.toLowerCase().includes(query),
  )) {
    const name =
      s.updatedAt >= +today
        ? "今天"
        : s.updatedAt >= +today - 86400000
          ? "昨天"
          : "更早";
    if (group !== name) {
      group = name;
      const label = document.createElement("p");
      label.className = "session-group";
      label.textContent = name;
      fragment.append(label);
    }
    const button = document.createElement("button");
    button.className = "session-item";
    button.setAttribute("aria-current", s.id === sessionId ? "page" : "false");
    const title = document.createElement("span");
    title.textContent = s.title;
    button.title = s.title;
    const status = document.createElement("small");
    status.textContent = s.status === "idle" ? "" : "Running";
    button.append(title, status);
    button.onclick = () =>
      switchSession(() => request("session.attach", { sessionId: s.id }));
    const row = document.createElement("div");
    row.className = "session-row";
    const actions = document.createElement("div");
    actions.className = "session-actions";
    for (const [kind, label, path] of [
      ["rename", "重命名", 'M12 5l7 7M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L3 16l-1 6z'],
      ["delete", "删除会话", 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7'],
    ]) {
      const action = document.createElement("button");
      action.type = "button";
      action.className = `session-${kind}`;
      action.title = label;
      action.setAttribute("aria-label", `${label}：${s.title}`);
      action.setAttribute("aria-haspopup", "dialog");
      action.disabled = !connected || changing;
      action.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
      action.onclick = () => openSessionAction(kind, s);
      actions.append(action);
    }
    row.append(button, actions);
    fragment.append(row);
  }
  if (!fragment.childNodes.length) {
    const empty = document.createElement("p");
    empty.className = "session-group";
    empty.textContent = query ? "没有找到匹配的会话" : "还没有会话";
    fragment.append(empty);
  }
  $("sessions").replaceChildren(fragment);
}
$("search").oninput = renderSessions;
let sessionAction;
function openSessionAction(kind, session) {
  if (!connected || changing) return;
  sessionAction = { kind, id: session.id, cwd: session.cwd };
  const deleting = kind === "delete";
  $("session-action-title").textContent = deleting ? "删除会话" : "重命名会话";
  $("session-action-description").textContent = deleting ? `删除「${session.title}」及其本地记录？运行中的任务会停止，此操作不可撤销。` : "为当前会话起一个容易查找的名字。";
  $("session-name").value = session.title;
  $("session-name").disabled = deleting;
  $("session-name").hidden = $("session-name-label").hidden = deleting;
  $("session-action-submit").textContent = deleting ? "删除会话" : "保存名称";
  $("session-action-submit").classList.toggle("danger", deleting);
  $("session-action-error").textContent = "";
  $("session-action").showModal();
  (deleting ? $("session-action-cancel") : $("session-name")).focus();
  if (!deleting) $("session-name").select();
}
$("session-action-cancel").onclick = () => $("session-action").close();
$("session-action-form").onsubmit = async (e) => {
  e.preventDefault();
  const action = sessionAction;
  $("session-action-submit").disabled = true;
  try {
    if (action.kind === "rename") {
      const title = $("session-name").value.trim();
      if (!title) throw new Error("请输入会话名称");
      await request("session.rename", { sessionId: action.id, title });
      await refreshSessions();
    } else {
      await request("session.close", { sessionId: action.id });
      views.delete(action.id);
      const rest = await request("sessions.list");
      if (sessionId === action.id) {
        const next = rest.find((s) => s.cwd === action.cwd);
        await switchSession(() => next ? request("session.attach", { sessionId: next.id }) : request("session.create", { cwd: action.cwd }));
      }
      await refreshSessions();
    }
    $("session-action").close();
  } catch (e) { $("session-action-error").textContent = e.message; }
  finally { $("session-action-submit").disabled = false; }
};
function contextIcon(kind) {
  return document.querySelector(`[data-context="${kind}"] svg`).cloneNode(true);
}
function renderContextChips() {
  const skill = /^\/skill:([^\s]+)/.exec($("prompt").value)?.[1];
  const entries = [...(skill ? [{ name: skill, kind: "skill" }] : []), ...contextFiles.map((file) => ({ ...file, name: file.path, kind: file.directory ? "folder" : "file" }))];
  $("context-chips").replaceChildren(...entries.map((entry) => {
    const chip = document.createElement("button");
    chip.type = "button"; chip.className = "context-chip";
    chip.title = `移除${entry.kind === "skill" ? "待加载 Skill" : "引用"}：${entry.name}`;
    chip.setAttribute("aria-label", chip.title);
    const label = document.createElement("span"); label.textContent = entry.name;
    const close = document.createElement("span"); close.textContent = "×"; close.setAttribute("aria-hidden", "true");
    chip.append(contextIcon(entry.kind), label, close);
    chip.onclick = () => {
      if (entry.kind === "skill") { $("composer-skill").value = ""; $("composer-skill").onchange(); }
      else { contextFiles = contextFiles.filter((file) => file.path !== entry.path); controls(); }
    };
    return chip;
  }));
}
function renderContextResults() {
  const query = $("context-search").value.toLocaleLowerCase();
  const skills = contextMode === "skill";
  const entries = skills ? (config?.skills || []) : contextListing.entries;
  $("context-path").replaceChildren();
  if (!skills) {
    const up = document.createElement("button"); up.type = "button"; up.textContent = "← 上一级";
    up.disabled = !contextListing.path;
    up.onclick = () => { void browseContext(contextListing.path.split("/").slice(0, -1).join("/")); };
    const path = document.createElement("span"); path.textContent = contextListing.path || "工作空间";
    $("context-path").append(up, path);
    if (contextMode === "folder") {
      const add = document.createElement("button"); add.type = "button"; add.textContent = "添加此文件夹";
      add.onclick = () => selectContext({ path: contextListing.path || ".", directory: true });
      $("context-path").append(add);
    }
  }
  const shown = entries.filter((entry) => (contextMode !== "folder" || entry.directory) && `${entry.name} ${entry.description || ""}`.toLocaleLowerCase().includes(query));
  $("context-results").replaceChildren(...shown.map((entry) => {
    const button = document.createElement("button"); button.type = "button";
    const text = document.createElement("span"); text.textContent = entry.name;
    const description = document.createElement("small"); description.textContent = entry.description || (entry.directory ? "打开文件夹 ›" : entry.path);
    text.append(description);
    button.append(contextIcon(skills ? "skill" : entry.directory ? "folder" : "file"), text);
    button.onclick = () => skills ? selectContext(entry) : entry.directory ? void browseContext(entry.path) : selectContext(entry);
    return button;
  }));
  $("context-error").textContent = shown.length ? "" : "没有匹配项";
}
function selectContext(entry) {
  if (!connected || changing) return;
  if (contextMode === "skill") { $("composer-skill").value = entry.name; $("composer-skill").onchange(); }
  else if (!contextFiles.some((file) => file.path === entry.path)) contextFiles.push(entry);
  $("context-picker").close(); controls(); $("prompt").focus();
}
async function browseContext(path) {
  const load = ++contextLoad, target = sessionId;
  $("context-results").replaceChildren(); $("context-path").replaceChildren();
  $("context-error").textContent = "正在读取…";
  try {
    const listing = await request("workspace.browse", { sessionId: target, path });
    if (load !== contextLoad || target !== sessionId || !$("context-picker").open) return;
    contextListing = listing; $("context-search").value = ""; renderContextResults();
  } catch (e) { if (load === contextLoad) $("context-error").textContent = e.message; }
}
for (const button of document.querySelectorAll("[data-context]")) button.onclick = () => {
  $("context-menu").hidePopover?.();
  contextMode = button.dataset.context; contextLoad++;
  $("context-title").textContent = { skill: "添加 Skill", file: "添加工作空间文件", folder: "添加工作空间文件夹" }[contextMode];
  $("context-search").value = ""; $("context-picker").showModal();
  if (contextMode === "skill") renderContextResults(); else void browseContext("");
  $("context-search").focus();
};
$("context-search").oninput = renderContextResults;
$("context-close").onclick = () => $("context-picker").close();
$("composer-skill").onchange = () => {
  const name = $("composer-skill").value;
  const text = $("prompt").value.replace(/^\/skill:[^\s]+(?:\s+|$)/, "");
  $("prompt").value = name ? `/skill:${name} ${text}` : text;
  resizePrompt();
  controls();
  $("prompt").focus();
};
$("prompt").oninput = () => {
  resizePrompt();
  controls();
};
$("open-workspace").onclick = async () => {
  const original = sessionId;
  pickingWorkspace = true; controls();
  try {
    const { path } = await request("workspace.pick");
    if (!path || original !== sessionId) return;
    $("cwd").value = path;
    $("workspace-form").requestSubmit();
  } catch (e) { error(e); }
  finally { pickingWorkspace = false; controls(); }
};
$("copy-workspace").onclick = async () => {
  try {
    await navigator.clipboard.writeText($("workspace-label").textContent);
    $("copy-workspace").title = "已复制";
    $("workspace-feedback").textContent = "工作空间路径已复制";
    setTimeout(() => { $("copy-workspace").title = "复制工作空间路径"; }, 1600);
  } catch (e) { error(new Error(`复制失败：${e.message}`)); }
};
$("reveal-workspace").onclick = async () => {
  try { await request("workspace.reveal", { sessionId }); }
  catch (e) { error(e); }
};
$("new").onclick = () =>
  switchSession(() => request("session.create", { cwd: $("cwd").value }));

let creationLoad = 0;
function createAgentPicker(role, title, catalog, initial) {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "capability-agent";
  const legend = document.createElement("legend");
  legend.textContent = title;
  fieldset.append(legend);
  const selectors = document.createElement("div");
  selectors.className = "selectors settings-selectors";
  const select = (name, labelText) => {
    const label = document.createElement("label");
    const text = document.createElement("span");
    text.textContent = labelText;
    const node = document.createElement("select");
    node.id = `create-${role}-${name}`;
    node.title = labelText;
    label.append(text, node);
    selectors.append(label);
    return node;
  };
  const provider = select("provider", `${title}供应商`);
  const model = select("model", `${title}模型`);
  const key = initial.model;
  options(provider, [["", role === "main" ? "默认主代理模型" : "跟随主代理"],
    ...[...new Set(models.map((m) => m.provider))].map((p) => [p, p])],
    models.find((m) => m.key === key)?.provider || "");
  const fill = () => {
    options(model, provider.value ? models.filter((m) => m.provider === provider.value).map((m) => [m.key, m.name || m.id]) : [["", "使用默认模型"]], key);
    model.disabled = !provider.value;
  };
  provider.onchange = fill;
  fill();
  const thinking = select("thinking", `${title}思考等级`);
  const fillThinking = () => {
    const levels = models.find((m) => m.key === model.value)?.levels || ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
    options(thinking, [["", role === "main" ? "沿用默认思考等级" : "跟随主代理思考等级"], ...levels.map((v) => [v, v])], thinking.value || initial.thinking || "");
  };
  model.onchange = fillThinking;
  provider.onchange = () => { fill(); fillThinking(); };
  fillThinking();
  const mode = select("mode", `${title}能力模式`);
  options(mode, [...(role === "subagent" ? [["inherit", "跟随主代理能力"]] : []), ["all", "全部能力"], ["custom", "自定义能力"]], initial.capabilities === "inherit" ? "inherit" : initial.capabilities == null ? "all" : "custom");
  fieldset.append(selectors);
  const pickers = document.createElement("div");
  pickers.hidden = mode.value !== "custom";
  for (const [kind, labelText] of [["skills", "Skills"], ["mcp", "MCP 服务"], ["plugins", "Extensions 扩展"]]) {
    const entries = [...catalog[kind], ...(initial.capabilities?.[kind] || [])
      .filter((id) => !catalog[kind].some((entry) => entry.id === id))
      .map((id) => ({ id, name: `当前目录不可用 · ${capabilityName(id)}` }))];
    const details = document.createElement("details");
    details.className = "capability-picker";
    const heading = document.createElement("summary");
    const list = document.createElement("div");
    list.className = "capability-options";
    const update = () => heading.textContent = `${labelText} · 已选 ${list.querySelectorAll("input:checked").length} / ${entries.length}`;
    for (const entry of entries) {
      const label = document.createElement("label");
      label.title = entry.description || entry.id;
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = initial.capabilities == null || initial.capabilities === "inherit" || initial.capabilities[kind].includes(entry.id);
      checkbox.value = entry.id;
      checkbox.dataset.kind = kind;
      checkbox.onchange = update;
      label.append(checkbox, document.createTextNode(entry.name));
      list.append(label);
    }
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.textContent = "没有已启用的可用项";
      list.append(empty);
    }
    update();
    details.append(heading, list);
    pickers.append(details);
  }
  mode.onchange = () => { pickers.hidden = mode.value !== "custom"; };
  fieldset.append(pickers);
  $("create-agents").append(fieldset);
  return () => ({
    model: model.value || null,
    thinking: thinking.value || null,
    capabilities: mode.value === "inherit" ? "inherit" : mode.value === "all" ? null : Object.fromEntries(
      ["skills", "mcp", "plugins"].map((kind) => [kind,
        [...pickers.querySelectorAll(`input[data-kind="${kind}"]:checked`)].map((input) => input.value)])),
  });
}
async function loadCreation() {
  const current = creation;
  const load = ++creationLoad;
  current.loading = true;
  $("create-submit").disabled = true;
  $("create-feedback").textContent = "正在读取本机 Pi 能力…";
  try {
    const [catalog, selected] = await Promise.all([
      request("capabilities.list", { cwd: current.cwd, trustProject: !current.defaults && $("create-trust").checked }),
      current.defaults ? request("session.defaults.get") : { model: config?.model, subagentModel: config?.subagentModel },
    ]);
    if (creation !== current || load !== creationLoad) return;
    current.loading = false;
    current.needsTrust = catalog.needsTrust;
    $("create-agents").replaceChildren();
    current.main = createAgentPicker("main", "主代理", catalog, { model: selected.model, thinking: selected.thinking, capabilities: selected.capabilities });
    current.subagent = createAgentPicker("subagent", "子代理", catalog, { model: selected.subagentModel, thinking: selected.subagentThinking, capabilities: selected.subagentCapabilities });
    current.compaction = compactionEditor(
      current.defaults ? selected.compaction || compactionDefaults : config?.compaction || compactionDefaults,
      () => $("create-main-model").value,
    );
    $("create-compaction").replaceChildren(current.compaction.node);
    $("create-main-model").addEventListener("change", current.compaction.fillThinking);
    current.catalog = catalog;
    updateDefaultsPreview();
    $("create-trust-row").hidden = current.defaults || (!catalog.needsTrust && !$("create-trust").checked);
    $("create-submit").disabled = (!current.defaults && catalog.needsTrust) || !connected || changing;
    $("create-feedback").textContent = catalog.needsTrust
      ? (current.defaults ? "此目录包含未信任的配置；默认配置仅使用已信任的能力，不保存目录信任。" : "此目录包含未信任的配置；确认信任后加载完整列表。")
      : catalog.warnings.join("\n");
  } catch (e) {
    if (creation === current && load === creationLoad) $("create-feedback").textContent = `加载失败：${e.message}`;
  }
}
function openCreation(defaults = false) {
  creation = { cwd: $("cwd").value, defaults };
  $("create-title").textContent = defaults ? "默认新会话配置" : "自定义新会话";
  $("create-submit").textContent = defaults ? "保存默认配置" : "创建会话";
  $("create-submit").hidden = defaults;
  $("defaults-preview").textContent = "";
  $("create-defaults-help").hidden = !defaults;
  $("create-workspace").textContent = creation.cwd;
  $("create-trust").checked = false;
  $("create-trust-row").hidden = true;
  $("create-agents").replaceChildren();
  (defaults ? $("defaults-editor") : $("create-session")).append($("create-form"));
  if (!defaults) $("create-session").showModal();
  void loadCreation();
}
$("custom-new").onclick = () => openCreation();
$("create-trust").onchange = () => { void loadCreation(); };
function updateDefaultsPreview() {
  if (!creation?.defaults || !creation.main) return;
  const main = creation.main(), child = creation.subagent();
  const compaction = creation.compaction?.read();
  const compactionLine = compaction
    ? `\n\n自动压缩 · ${compaction.enabled ? ([
        compaction.tokenThreshold ? `${compaction.tokenThreshold.toLocaleString("en-US")} tokens` : null,
        compaction.percentThreshold ? `${compaction.percentThreshold}%` : null,
      ].filter(Boolean).join(" 或 ") || "未设阈值") + " 触发" : "关闭"} · 保留最近 ${(Number.isFinite(compaction.keepRecentTokens) ? compaction.keepRecentTokens : compactionDefaults.keepRecentTokens).toLocaleString("en-US")} tokens · ${models.find((m) => m.key === compaction.model)?.name || compaction.model || "主代理模型"} · ${compaction.thinking}`
    : "";
  $("defaults-preview").textContent = [["主 Agent", main], ["子 Agent", child]].map(([title, agent]) => {
    const key = agent.model || (agent === child ? main.model : null);
    const model = models.find((m) => m.key === key);
    const capabilities = agent.capabilities === "inherit" ? main.capabilities : agent.capabilities;
    return `${title} · ${model?.provider || "默认供应商"} · ${model?.name || key || "默认模型"} · ${agent.thinking || (agent === child ? main.thinking : null) || "默认"}\n` +
      [["skills", "Skills"], ["mcp", "MCP"], ["plugins", "Extensions"]].map(([kind, label]) => `${label}：${(capabilities?.[kind] || creation.catalog[kind].map((entry) => entry.id)).map(capabilityName).join("、") || "无"}`).join("\n");
  }).join("\n\n") + compactionLine;
}
$("create-form").onchange = () => {
  if (!creation?.defaults) return;
  updateDefaultsPreview();
  $("create-form").requestSubmit();
};
$("create-form").onsubmit = async (e) => {
  e.preventDefault();
  if (!creation?.main || $("create-submit").disabled || changing || !connected) return;
  const invalid = creation.compaction?.error?.();
  if (invalid) {
    $("create-feedback").textContent = invalid;
    return;
  }
  const main = creation.main(), child = creation.subagent();
  const data = {
    cwd: creation.cwd,
    model: main.model,
    subagentModel: child.model,
    thinking: main.thinking,
    subagentThinking: child.thinking,
    capabilities: main.capabilities,
    subagentCapabilities: child.capabilities,
    compaction: creation.compaction.read(),
  };
  $("create-submit").disabled = true;
  if (creation.defaults) {
    changing = true;
    controls();
    $("create-feedback").textContent = "正在保存默认配置…";
    try {
      await request("session.defaults.configure", data);
      $("create-feedback").textContent = "已保存到本机 · 新会话使用此配置";
    } catch (e) {
      $("create-feedback").textContent = `保存失败，当前选择未生效：${e.message}。请重新选择以重试。`;
    } finally {
      changing = false;
      controls();
      $("create-submit").disabled = !connected;
    }
    return;
  }
  $("create-feedback").textContent = "正在加载能力并创建会话…";
  await switchSession(async () => {
    try {
      const state = await request("session.create", { ...data, useDefaults: false, trustProject: $("create-trust").checked });
      $("create-session").close();
      return state;
    } catch (e) {
      $("create-feedback").textContent = `创建失败：${e.message}`;
      throw e;
    }
  });
  $("create-submit").disabled = !connected;
};
$("workspace-form").onsubmit = (e) => {
  e.preventDefault();
  void switchSession(async () => {
    await refreshSessions();
    const existing = allSessions.find(
      (s) =>
        s.cwd.replaceAll("\\", "/").toLowerCase() ===
        $("cwd").value.replaceAll("\\", "/").toLowerCase(),
    );
    return existing
      ? request("session.attach", { sessionId: existing.id })
      : request("session.create", { cwd: $("cwd").value });
  });
};
