import { renderMarkdown } from "./markdown.js";
import { createStreamRenderer } from "./stream-renderer.js";
const $ = (id) => document.getElementById(id);
let ws,
  sessionId,
  models = [],
  config,
  busy = false,
  changing = false;
let allSessions = [],
  follow = true;
const views = new Map();
try {
  sessionId = localStorage.getItem("axiom.session") || undefined;
} catch {}
let scrollFrame;
function scrollLatest() {
  if (!follow || changing || scrollFrame !== undefined) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = undefined;
    if (follow && !changing)
      $("transcript").scrollTop = $("transcript").scrollHeight;
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
  scrollLatest();
};
$("toggle-sidebar").onclick = () => {
  const hidden = document.querySelector(".shell").classList.toggle("collapsed");
  $("toggle-sidebar").setAttribute("aria-expanded", String(!hidden));
};
if (innerWidth < 700) $("toggle-sidebar").click();
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
  for (const id of ["provider", "model", "thinking"])
    $(id).disabled = busy || changing;
  $("send").disabled = busy || changing;
  $("stop").disabled = !busy || changing;
  $("stop").hidden = !busy;
  $("send").hidden = busy;
  for (const id of ["new", "delete", "rename"]) $(id).disabled = changing;
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
function applyConfig(value) {
  config = value;
  $("provider").value = models.find((m) => m.key === value.model)?.provider;
  fillModels();
  options(
    $("thinking"),
    value.levels.map((v) => [
      v,
      {
        off: "思考关闭",
        minimal: "思考 · 最低",
        low: "思考 · 低",
        medium: "思考 · 中",
        high: "思考 · 高",
        xhigh: "思考 · 超高",
        max: "思考 · 最高",
      }[v] || v,
    ]),
    value.thinking,
  );
}
async function configure(thinking) {
  changing = true;
  controls();
  $("error").textContent = "";
  try {
    applyConfig(
      await request("session.configure", {
        sessionId,
        model: $("model").value,
        ...(thinking ? { thinking } : {}),
      }),
    );
  } catch (e) {
    error(e);
    if (config) applyConfig(config);
  } finally {
    changing = false;
    controls();
  }
}
function card(title, parent) {
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
  node.append(heading, thinking, text);
  (parent || $("output")).append(node);
  scrollLatest();
  const item = {
    node,
    heading,
    thinking,
    thought,
    text,
    buffer: "",
    reasoning: "",
    paintedText: "",
  };
  thinking.ontoggle = () => {
    if (thinking.open) renderer.mark(item);
  };
  return item;
}
function renderMessage(item, message) {
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
  renderer.flush(item);
}
function event(message) {
  if (message.sessionId !== sessionId) return;
  const { type, agentId = "main", data } = message;
  if (type === "session.state") {
    void refreshSessions().catch(error);
    busy = data.status !== "idle";
    $("status").textContent = busy ? "正在执行" : "已连接 · 就绪";
    controls();
  }
  if (type === "agent.message.start" && data.message.role === "assistant")
    live.set(
      agentId,
      card(
        agentId === "main" ? "AXIOM" : `子 Agent · ${agentId.slice(0, 8)}`,
        tasks.get(agentId)?.node,
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
      live.get(agentId) || card(agentId === "main" ? "AXIOM" : "子 Agent");
    renderMessage(item, data.message);
    live.delete(agentId);
  }
  if (type === "task.state") {
    if (!tasks.has(message.taskId)) {
      const node = document.createElement("details");
      node.className = "task-card";
      const heading = document.createElement("summary");
      node.append(heading);
      $("output").append(node);
      tasks.set(message.taskId, { node, heading });
    }
    const item = tasks.get(message.taskId);
    item.heading.textContent = `${{ starting: "启动中", running: "运行中", completed: "已完成", failed: "失败", cancelled: "已取消" }[data.status] || data.status} · ${data.task}${data.error ? " · " + data.error : ""}`;
    scrollLatest();
  }
  if (type === "error") error(data.message);
}
function snapshot(state) {
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
  for (const task of state.tasks)
    event({ type: "task.state", sessionId, taskId: task.id, data: task });
  for (const { agentId, message } of state.messages)
    if (["assistant", "user"].includes(message.role))
      renderMessage(
        card(
          message.role === "user"
            ? "你"
            : agentId === "main"
              ? "AXIOM"
              : "子 Agent",
          tasks.get(agentId)?.node,
        ),
        message,
      );
  for (const [agentId, message] of Object.entries(state.live))
    if (message.role === "assistant") {
      const item = card(
        agentId === "main" ? "AXIOM" : "子 Agent",
        tasks.get(agentId)?.node,
      );
      renderMessage(item, message);
      live.set(agentId, item);
    }
  if (!$("output").children.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML =
      "<h2>有什么需要一起完成？</h2><p>从一个任务开始。Axiom 会协同思考与执行。</p>";
    $("output").append(empty);
  }
  const view = views.get(sessionId);
  $("prompt").value = view?.draft || "";
  follow = view?.follow ?? true;
  requestAnimationFrame(() => {
    $("transcript").scrollTop = view?.scroll ?? $("transcript").scrollHeight;
  });
  applyConfig(state.config);
  controls();
}
$("login").onsubmit = async (e) => {
  e.preventDefault();
  $("connect").disabled = true;
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
    });
    ws.onclose = () => {
      for (const p of pending.values()) p.reject(new Error("连接断开"));
      pending.clear();
      $("status").textContent = "连接断开";
      $("login").hidden = false;
      $("workspace").hidden = true;
      $("connect").disabled = false;
    };
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
    snapshot(state);
    await refreshSessions();
    $("login").hidden = true;
    $("workspace").hidden = false;
    $("status").textContent = busy ? "正在执行" : "已连接 · 就绪";
  } catch (e) {
    error(e);
    ws?.close();
  } finally {
    $("connect").disabled = false;
  }
};
$("login").requestSubmit();
$("provider").onchange = () => {
  fillModels();
  void configure();
};
$("model").onchange = () => {
  void configure();
};
$("thinking").onchange = () => {
  void configure($("thinking").value);
};
$("composer").onsubmit = async (e) => {
  e.preventDefault();
  const text = $("prompt").value.trim();
  if (!text || busy || changing) return;
  busy = true;
  controls();
  $("error").textContent = "";
  const sendingSession = sessionId;
  const userCard = card("你");
  renderMarkdown(userCard.text, text);
  follow = true;
  scrollLatest();
  try {
    await request("prompt", { sessionId: sendingSession, text });
    if (sessionId === sendingSession && $("prompt").value === text) {
      $("prompt").value = "";
      $("prompt").style.height = "";
    }
    const saved = views.get(sendingSession);
    if (saved?.draft === text) saved.draft = "";
    await refreshSessions();
  } catch (e) {
    userCard.node.remove();
    if (sessionId === sendingSession) {
      error(e);
      busy = false;
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
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !e.isComposing && busy) {
    e.preventDefault();
    $("stop").click();
  }
});
$("stop").onclick = async () => {
  try {
    await request("cancel", { sessionId });
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
  if (changing) return;
  if (sessionId)
    views.set(sessionId, {
      draft: $("prompt").value,
      scroll: $("transcript").scrollTop,
      follow,
    });
  changing = true;
  controls();
  try {
    snapshot(await action());
    await refreshSessions();
  } catch (e) {
    error(e);
  } finally {
    changing = false;
    controls();
  }
}
function renderSessions() {
  $("sessions").replaceChildren();
  let group;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const s of allSessions.filter(
    (s) =>
      s.cwd === $("cwd").value &&
      s.title.toLowerCase().includes($("search").value.toLowerCase()),
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
      $("sessions").append(label);
    }
    const button = document.createElement("button");
    button.className = "session-item";
    button.setAttribute("aria-current", s.id === sessionId ? "page" : "false");
    const title = document.createElement("span");
    title.textContent = s.title;
    button.title = s.title;
    const status = document.createElement("small");
    status.textContent = s.status === "idle" ? "" : "运行中";
    button.append(title, status);
    button.onclick = () =>
      switchSession(() => request("session.attach", { sessionId: s.id }));
    $("sessions").append(button);
  }
}
$("search").oninput = renderSessions;
$("rename").onclick = async () => {
  const title = prompt("会话名称", $("session-title").textContent);
  if (!title?.trim()) return;
  try {
    const state = await request("session.rename", { sessionId, title });
    $("session-title").textContent = state.title;
    await refreshSessions();
  } catch (e) {
    error(e);
  }
};
$("prompt").oninput = () => {
  $("prompt").style.height = "auto";
  $("prompt").style.height = Math.min($("prompt").scrollHeight, 240) + "px";
};
$("new").onclick = () =>
  switchSession(() => request("session.create", { cwd: $("cwd").value }));
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
$("delete").onclick = () => {
  if (!confirm("删除当前会话并停止其中的任务？")) return;
  void switchSession(async () => {
    await request("session.close", { sessionId });
    const rest = await request("sessions.list");
    const next = rest.find((s) => s.cwd === $("cwd").value);
    return next
      ? request("session.attach", { sessionId: next.id })
      : request("session.create", { cwd: $("cwd").value });
  });
};
