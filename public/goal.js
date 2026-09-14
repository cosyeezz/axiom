// 目标模式（Goal）外壳：顶部进度仪表、底部专用控制、计划确认卡、调整 Goal 专用对话框，
// 以及按轮次折叠现有消息。
// 只消费 snapshot.goal 与 { type: "goal", goal } 事件；消息渲染由 app.js 独占，
// 本模块只给已渲染的节点打分组标记，绝不复制、重建或改写任何消息内容。
//
// 纠正入口分两条，语义不同，不要混：
//   普通输入框发消息 = 纠正当前这一轮（后端按轮次处理）；
//   「调整 Goal」= 打开专用对话框，改整体目标并重新规划，不碰普通输入框草稿。
export function createGoalUI({ root, request, onError, readPrompt, clearPrompt }) {
  const NS = "http://www.w3.org/2000/svg";
  const { track, dock, enter, plan, output } = root;

  const PHASES = {
    clarifying: { label: "目标澄清", tone: "accent", hint: "回答输入框里的问题；模型会据此给出可确认的计划" },
    ready: { label: "待确认", tone: "accent", hint: "确认计划后开始多轮执行" },
    running: { label: "执行中", tone: "accent", hint: "发消息 = 纠正当前这一轮；「调整 Goal」改整体目标与验收，重新规划" },
    pausing: { label: "正在暂停", tone: "muted", hint: "当前工具批次跑完、子任务收尾后立即暂停，不必等整轮结束" },
    paused: { label: "已暂停", tone: "muted", hint: "进度已保存；可以继续，或用「调整 Goal」重新规划整体目标" },
    adjusting: { label: "应用调整", tone: "accent", hint: "正在把调整并入整体目标并重新规划" },
    verifying: { label: "验收中", tone: "accent", hint: "对照验收标准核对本轮结果" },
    completed: { label: "已完成", tone: "success", hint: "全部验收标准已满足" },
  };
  const ROUND_STATES = { done: "已完成", failed: "失败", paused: "已暂停", active: "执行中", pending: "待执行" };
  const DONE = new Set(["completed", "done", "verified", "success", "finished"]);
  const ACTIVE = new Set(["running", "active", "in_progress", "adjusting", "verifying", "pausing", "current"]);

  // 请求出口：宿主可注入全局 request 覆盖（无模块作用域的环境，如单页测试），否则用构造参数。
  const call = (type, data) => {
    const host = typeof globalThis === "object" ? globalThis.request : undefined;
    const send = typeof host === "function" ? host : request;
    return typeof send === "function" ? send(type, data) : Promise.reject(new Error("目标模式缺少 request 通道"));
  };

  let sessionId, goal, anchors = new Map(), connected = true, sending = false;
  const expanded = new Set(); // 用户手动展开过的轮次：优先于默认折叠
  const collapsed = new Set();

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };
  const icon = (paths, className = "goal-icon") => {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", className);
    for (const d of [].concat(paths)) {
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", d);
      svg.append(path);
    }
    return svg;
  };
  const targetIcon = () => icon([
    "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z",
    "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z",
    "M12 11.1a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Z",
  ]);
  const phase = () => PHASES[goal?.phase] || { label: goal?.phase || "目标", tone: "muted", hint: "" };
  // 暂停原因（预算耗尽、被阻塞、服务重启恢复）：snapshot.failure = { reason, at } | null。
  // 没有原因就不编造，只显示阶段本身的说明。
  function failureNote() {
    const entry = goal?.failure;
    const reason = typeof entry?.reason === "string" ? entry.reason.trim() : "";
    if (!reason) return null;
    const at = Number(entry.at) > 0 ? new Date(Number(entry.at)) : null;
    const stamp = at && !Number.isNaN(at.getTime()) ? at.toLocaleString() : "";
    return { text: `暂停原因：${reason}`, title: stamp ? `暂停于 ${stamp}` : "" };
  }
  const roundList = (g = goal) => (Array.isArray(g?.rounds) ? g.rounds.filter((round) => round && typeof round === "object") : []);
  const lines = (value) => {
    if (Array.isArray(value)) return value.map((entry) => typeof entry === "string" ? entry : (entry?.text || entry?.label || "")).filter(Boolean);
    if (typeof value === "string") return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return [];
  };
  function roundState(round) {
    const status = String(round?.status || "").toLowerCase();
    if (DONE.has(status)) return "done";
    if (status === "failed" || status === "error") return "failed";
    if (status === "paused") return "paused";
    if (ACTIVE.has(status)) return "active";
    return "pending";
  }
  function percentOf(g = goal) {
    if (!g) return 0;
    if (g.phase === "completed") return 100;
    const rounds = roundList(g);
    const value = g.progress;
    let ratio;
    if (Number.isFinite(value)) ratio = value > 1 ? value / 100 : value;
    else if (value && typeof value === "object") {
      const done = Number(value.completed ?? value.done ?? value.finished);
      const total = Number(value.total ?? value.count ?? value.rounds);
      if (Number.isFinite(value.percent)) ratio = value.percent / 100;
      else if (Number.isFinite(done) && Number.isFinite(total) && total > 0) ratio = done / total;
      else if (Number.isFinite(value.value)) ratio = value.value > 1 ? value.value / 100 : value.value;
    }
    if (!Number.isFinite(ratio) && rounds.length) ratio = rounds.filter((round) => roundState(round) === "done").length / rounds.length;
    return Math.max(0, Math.min(100, Math.round((ratio || 0) * 100)));
  }
  const busy = () => sending || Boolean(goal?.pendingAction);
  function currentIndex(g = goal) {
    const rounds = roundList(g);
    if (!rounds.length) return -1;
    const active = rounds.findIndex((round) => roundState(round) === "active");
    if (active >= 0) return active;
    const value = g?.currentRound;
    if (Number.isFinite(value) && value >= 0 && value < rounds.length && roundState(rounds[value]) !== "done") return value;
    const pending = rounds.findIndex((round) => roundState(round) === "pending");
    return pending >= 0 ? pending : rounds.length - 1;
  }

  // 仪表：每条外圈刻度是一轮，指针指到整体进度。刻度数量与轮次一一对应，不是装饰。
  function gauge() {
    const rounds = roundList();
    const percent = percentOf();
    const size = 44, center = size / 2;
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.setAttribute("class", "goal-gauge");
    svg.dataset.state = goal.phase || "";
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `目标进度 ${percent}%${rounds.length ? `，共 ${rounds.length} 轮` : ""}`);
    const point = (angle, radius) => [center + radius * Math.cos((angle - 90) * Math.PI / 180), center + radius * Math.sin((angle - 90) * Math.PI / 180)];
    const line = (from, to, className) => {
      const node = document.createElementNS(NS, "line");
      node.setAttribute("x1", from[0]); node.setAttribute("y1", from[1]);
      node.setAttribute("x2", to[0]); node.setAttribute("y2", to[1]);
      node.setAttribute("class", className);
      return node;
    };
    rounds.forEach((round, index) => {
      const angle = (360 / rounds.length) * index;
      svg.append(line(point(angle, 15.4), point(angle, 19.6), `goal-tick goal-tick-${roundState(round)}${index === currentIndex() ? " goal-tick-current" : ""}`));
    });
    const circumference = 2 * Math.PI * 11.5;
    const ring = document.createElementNS(NS, "circle");
    ring.setAttribute("cx", center); ring.setAttribute("cy", center); ring.setAttribute("r", 11.5);
    ring.setAttribute("class", "goal-arc-track");
    svg.append(ring);
    const arc = document.createElementNS(NS, "circle");
    arc.setAttribute("cx", center); arc.setAttribute("cy", center); arc.setAttribute("r", 11.5);
    arc.setAttribute("class", "goal-arc");
    arc.setAttribute("stroke-dasharray", circumference.toFixed(2));
    arc.setAttribute("stroke-dashoffset", (circumference * (1 - percent / 100)).toFixed(2));
    arc.setAttribute("transform", `rotate(-90 ${center} ${center})`);
    svg.append(arc);
    svg.append(line([center, center], point(percent * 3.6, 9.2), "goal-needle"));
    const pivot = document.createElementNS(NS, "circle");
    pivot.setAttribute("cx", center); pivot.setAttribute("cy", center); pivot.setAttribute("r", 1.7);
    pivot.setAttribute("class", "goal-pivot");
    svg.append(pivot);
    return svg;
  }

  // 顶部进度条：有轮次就按轮分格（哪几轮完成一眼可见），否则用单条百分比。
  function progressBar() {
    const wrap = el("div", "goal-bar");
    const rounds = roundList();
    if (rounds.length) {
      rounds.forEach((round, index) => {
        const segment = el("span", "goal-bar-seg");
        segment.dataset.state = roundState(round);
        segment.dataset.current = String(index === currentIndex());
        wrap.append(segment);
      });
    } else {
      const whole = el("span", "goal-bar-seg goal-bar-whole");
      whole.style.setProperty("--goal-fill", `${percentOf()}%`);
      wrap.append(whole);
    }
    wrap.dataset.state = goal.phase || "";
    return wrap;
  }

  function renderTrack() {
    if (!goal) {
      track.hidden = true;
      track.replaceChildren();
      return;
    }
    const percent = percentOf();
    const rounds = roundList();
    const info = phase();
    const text = el("div", "goal-track-text");
    const eyebrow = el("p", "goal-eyebrow");
    const note = failureNote();
    const badge = el("span", "goal-phase", info.label);
    badge.dataset.tone = note ? "warn" : info.tone;
    if (note?.title) badge.title = note.title;
    eyebrow.append(badge);
    if (rounds.length) eyebrow.append(el("span", "goal-round-count", `第 ${currentIndex() + 1} / ${rounds.length} 轮`));
    const objective = el("p", "goal-objective", goal.objective || "目标待澄清");
    objective.title = goal.objective || "目标待澄清";
    text.append(eyebrow, objective);
    const constraints = lines(goal.constraints).length, acceptance = lines(goal.acceptance).length;
    if (constraints || acceptance) text.append(el("p", "goal-facts", `约束 ${constraints} · 验收 ${acceptance}`));
    const side = el("div", "goal-track-side");
    side.append(el("span", "goal-percent", `${percent}%`), progressBar());
    const openPlan = el("button", "secondary goal-plan-open", "计划");
    openPlan.type = "button";
    openPlan.onclick = () => openPlanDialog();
    side.append(openPlan);
    track.replaceChildren(gauge(), text, side);
    track.hidden = false;
  }

  function actionButton(label, action, { primary = false, paths, disabled = false, onClick, title, haspopup } = {}) {
    const button = el("button", primary ? "goal-action goal-action-primary" : "secondary goal-action");
    button.type = "button";
    if (title) button.title = title;
    if (haspopup) button.setAttribute("aria-haspopup", haspopup);
    if (paths) button.append(icon(paths), el("span", "", label));
    else button.textContent = label;
    button.disabled = disabled || !connected || busy();
    button.onclick = onClick || (() => void act(action));
    return button;
  }

  function renderDock() {
    if (!goal) {
      dock.replaceChildren();
      dock.hidden = true;
      if (enter) enter.hidden = false;
      return;
    }
    if (enter) enter.hidden = true;
    const info = phase();
    const rounds = roundList();
    const index = currentIndex();
    const main = el("div", "goal-dock-main");
    main.append(icon(["M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z", "M12 11.1a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Z"], "goal-dock-mark"));
    const note = failureNote();
    const label = el("span", "goal-dock-phase", info.label);
    label.dataset.tone = note ? "warn" : info.tone;
    if (note?.title) label.title = note.title;
    main.append(label);
    if (rounds.length) main.append(el("span", "goal-dock-round", `第 ${index + 1} / ${rounds.length} 轮`));
    if (rounds[index]?.title) main.append(el("span", "goal-dock-title", rounds[index].title));
    const hint = el("p", "goal-dock-hint", [note?.text, info.hint].filter(Boolean).join("；"));
    if (note) {
      hint.dataset.alert = "true";
      if (note.title) hint.title = note.title;
    }
    dock.replaceChildren(main, hint, controlsRow());
    dock.hidden = false;
  }

  function controlsRow() {
    const row = el("div", "goal-dock-actions");
    const adjusting = actionButton("调整 Goal", "adjust", {
      paths: "M4 8h9M17 8h3M4 16h3M11 16h9M15 5.5v5M9 13.5v5",
      title: "修改整体目标与验收标准，提交后重新规划",
      haspopup: "dialog",
      onClick: () => openAdjust(),
    });
    switch (goal.phase) {
      case "clarifying":
        row.append(actionButton("重新开始", "restart", { paths: "M20 11a8 8 0 1 0-1.6 5.3M20 4.5V10h-5.5" }));
        break;
      case "ready":
        row.append(
          el("button", "goal-action goal-action-primary", "确认计划"),
          actionButton("重新澄清", "restart", { paths: "M20 11a8 8 0 1 0-1.6 5.3M20 4.5V10h-5.5" }),
        );
        row.firstElementChild.type = "button";
        row.firstElementChild.onclick = () => openPlanDialog();
        row.firstElementChild.disabled = !connected || busy();
        break;
      case "running":
      case "verifying":
        row.append(
          adjusting,
          actionButton("暂停", "pause", { paths: "M9 5v14M15 5v14", title: "当前工具批次跑完、子任务收尾后暂停，不打断在飞的工作" }),
          actionButton("重启 Goal", "restart", { paths: "M20 11a8 8 0 1 0-1.6 5.3M20 4.5V10h-5.5", title: "按当前目标重新规划，历史轮次留档" }),
        );
        break;
      case "pausing":
        row.append(actionButton("暂停中…", "pause", { disabled: true }));
        break;
      case "paused":
        row.append(
          actionButton("继续", "resume", { primary: true, paths: "M7 5l12 7-12 7Z" }),
          adjusting,
          actionButton("重启 Goal", "restart", { paths: "M20 11a8 8 0 1 0-1.6 5.3M20 4.5V10h-5.5", title: "按当前目标重新规划，历史轮次留档" }),
        );
        break;
      case "adjusting":
        row.append(actionButton("正在应用调整…", "adjust", { disabled: true }));
        break;
      case "completed":
        row.append(
          el("button", "goal-action goal-action-primary", "查看总结"),
          actionButton("重新开始", "restart", { paths: "M20 11a8 8 0 1 0-1.6 5.3M20 4.5V10h-5.5" }),
        );
        row.firstElementChild.type = "button";
        row.firstElementChild.onclick = () => openPlanDialog();
        row.firstElementChild.disabled = !connected;
        break;
      default:
        row.append(adjusting, actionButton("重启 Goal", "restart", { paths: "M20 11a8 8 0 1 0-1.6 5.3M20 4.5V10h-5.5" }));
    }
    return row;
  }

  function fillList(node, values) {
    if (!values.length) {
      node.append(el("li", "goal-plan-empty", "未声明"));
      return;
    }
    for (const value of values) node.append(el("li", "", value));
  }

  function renderPlan() {
    const rounds = roundList();
    plan.querySelector("#goal-plan-title").textContent = goal.objective || "目标待澄清";
    plan.querySelector("#goal-plan-meta").textContent = [`阶段：${phase().label}`, rounds.length ? `计划 ${rounds.length} 轮` : "计划待生成", `进度 ${percentOf()}%`, failureNote()?.text].filter(Boolean).join(" · ");
    const constraints = plan.querySelector("#goal-plan-constraints"), acceptance = plan.querySelector("#goal-plan-acceptance"), list = plan.querySelector("#goal-plan-rounds");
    constraints.replaceChildren(); acceptance.replaceChildren(); list.replaceChildren();
    fillList(constraints, lines(goal.constraints));
    fillList(acceptance, lines(goal.acceptance));
    if (!rounds.length) list.append(el("li", "goal-plan-empty", "模型会在你确认后拆分执行计划。"));
    rounds.forEach((round, index) => {
      const item = el("li", "goal-plan-round");
      item.dataset.state = roundState(round);
      const head = el("div", "goal-plan-round-head");
      head.append(el("span", "goal-plan-round-index", String(index + 1).padStart(2, "0")), el("span", "goal-plan-round-title", round.title || `第 ${index + 1} 轮`));
      item.append(head, el("span", "goal-plan-round-status", ROUND_STATES[roundState(round)]));
      if (round.objective) item.append(el("p", "goal-plan-round-objective", round.objective));
      if (round.acceptance) item.append(el("p", "goal-plan-round-acceptance", `验收：${[].concat(round.acceptance).filter((v) => typeof v === "string").join("；")}`));
      if (round.summary) item.append(el("p", "goal-plan-round-summary", round.summary));
      list.append(item);
    });
    plan.querySelector(".goal-execution")?.remove();
    if (goal.execution) {
      const progress = el("details", "goal-execution");
      progress.append(el("summary", "", "执行进度与交接"));
      for (const [key, label] of Object.entries({ completed: "已完成", remaining: "待办", checks: "检查结果", blockers: "阻塞", next: "下一步", artifacts: "产物位置" })) {
        if (goal.execution[key]) progress.append(el("h3", "", label), el("p", "goal-plan-round-summary", goal.execution[key]));
      }
      list.after(progress);
    }
    const confirm = plan.querySelector("#goal-plan-confirm");
    confirm.hidden = goal.phase !== "ready";
    confirm.disabled = !connected || busy();
    plan.dataset.phase = goal.phase || "";
  }

  function openPlanDialog() {
    if (!goal) return;
    renderPlan();
    if (!plan.open) plan.showModal?.();
  }

  // 成功返回 true（回执已落地）；失败/不可用返回 false，由调用方决定是否保留用户输入。
  async function act(action, text) {
    if (!connected || !sessionId || busy()) return false;
    const target = sessionId;
    sending = true;
    renderDock();
    try {
      // 回执带最新 goal：先按回执落地，随后的 goal 事件同值，重复应用无副作用。
      const result = await call("goal.action", { sessionId: target, action, ...(text ? { text } : {}) });
      if (result?.goal && sessionId === target) { goal = result.goal; render(); }
      return true;
    } catch (e) {
      onError?.(e);
      return false;
    } finally {
      sending = false;
      if (sessionId === target) renderDock();
    }
  }

  // —— 调整 Goal 专用对话框：原生 <dialog>，独立于普通输入框，绝不动它的草稿 ——
  let adjustDialog, adjustText, adjustAlert, adjustSubmit;
  function buildAdjustDialog() {
    if (adjustDialog) return adjustDialog;
    const dialog = el("dialog");
    dialog.id = "goal-adjust";
    dialog.setAttribute("aria-labelledby", "goal-adjust-title");
    dialog.setAttribute("aria-describedby", "goal-adjust-hint");
    const form = el("form", "goal-adjust-form");
    const head = el("div", "goal-adjust-head");
    const titles = el("div");
    titles.append(el("p", "goal-adjust-eyebrow", "调整 Goal"), el("h2", "goal-adjust-title", "修改整体目标"));
    const close = el("button", "secondary goal-adjust-close", "✕");
    close.type = "button";
    close.setAttribute("aria-label", "关闭调整窗口");
    close.onclick = () => dialog.close?.();
    head.append(titles, close);
    const hint = el("p", "goal-adjust-hint", "这里改的是整体 Goal：提交后按新目标重新规划，历史轮次留档。只想纠正当前这一轮，直接在下方输入框发消息即可。");
    hint.id = "goal-adjust-hint";
    const label = el("label", "goal-adjust-label", "调整说明");
    label.htmlFor = "goal-adjust-text";
    const textarea = el("textarea", "goal-adjust-text");
    textarea.id = "goal-adjust-text";
    textarea.rows = 5;
    textarea.placeholder = "例如：验收标准增加体积对比；保留「不改公共 API」约束。";
    const alert = el("p", "goal-adjust-alert");
    alert.id = "goal-adjust-alert";
    alert.setAttribute("role", "alert");
    alert.hidden = true;
    const actions = el("div", "dialog-actions");
    const cancel = el("button", "secondary", "取消");
    cancel.type = "button";
    cancel.onclick = () => dialog.close?.();
    const submit = el("button", "goal-adjust-submit", "提交调整并重新规划");
    submit.id = "goal-adjust-submit";
    submit.type = "submit";
    actions.append(cancel, submit);
    form.append(head, hint, label, textarea, alert, actions);
    dialog.append(form);
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); // 有内容且提交成功才关：失败时保留输入，重试即可。
      const value = textarea.value.trim();
      if (!value) {
        alert.textContent = "请先写下要调整的内容。";
        alert.hidden = false;
        textarea.focus();
        return;
      }
      alert.hidden = true;
      submit.disabled = true;
      try {
        if (await act("adjust", value)) {
          textarea.value = "";
          dialog.close?.();
        } else {
          alert.textContent = connected ? "提交失败，说明已保留，请重试。" : "连接已断开，恢复连接后再提交。";
          alert.hidden = false;
        }
      } finally {
        submit.disabled = false;
      }
    });
    document.body.append(dialog);
    adjustDialog = dialog; adjustText = textarea; adjustAlert = alert; adjustSubmit = submit;
    return dialog;
  }

  function openAdjust() {
    if (!goal) return;
    buildAdjustDialog().showModal?.();
    adjustAlert.hidden = true;
    // 草稿留在 textarea 里：取消后重新打开还能接着改。
    adjustText.focus();
  }

  // —— 消息分轮：只打标记与插入轮次分隔头，节点仍归 app.js 所有 ——
  const topLevel = (node) => {
    let current = node;
    while (current.parentElement && current.parentElement !== output) current = current.parentElement;
    return current.parentElement === output ? current : null;
  };
  const exclusiveRound = (node) => {
    const owners = new Set();
    if (node.hasAttribute?.("data-goal-round")) owners.add(node.getAttribute("data-goal-round"));
    node.querySelectorAll?.("[data-goal-round]").forEach((child) => owners.add(child.getAttribute("data-goal-round")));
    return owners.size === 1 ? [...owners][0] : null;
  };
  function syncCollapsed(rounds) {
    const active = currentIndex();
    rounds.forEach((round, index) => {
      if (expanded.has(index)) collapsed.delete(index);
      else if (index < active) collapsed.add(index);
      else collapsed.delete(index);
    });
    for (const index of [...collapsed]) if (index >= rounds.length) collapsed.delete(index);
  }
  function applyCollapse() {
    for (const head of output.querySelectorAll(".goal-round-head")) {
      const index = Number(head.dataset.round);
      const folded = collapsed.has(index);
      head.dataset.collapsed = String(folded);
      const toggle = head.querySelector(".goal-round-toggle");
      toggle.textContent = folded ? "展开" : "收起";
      toggle.setAttribute("aria-expanded", String(!folded));
    }
    for (const node of output.children) {
      if (node.classList.contains("goal-round-head")) continue;
      const owner = exclusiveRound(node);
      node.classList.toggle("goal-folded", owner !== null && collapsed.has(Number(owner)));
    }
  }
  function roundHead(index, round) {
    const state = roundState(round);
    const head = el("div", "goal-round-head");
    head.dataset.round = String(index);
    head.dataset.state = state;
    head.append(
      el("span", "goal-round-index", String(index + 1).padStart(2, "0")),
      el("span", "goal-round-title", round.title || `第 ${index + 1} 轮`),
      el("span", "goal-round-rule"),
      el("span", "goal-round-status", ROUND_STATES[state]),
    );
    const toggle = el("button", "goal-round-toggle");
    toggle.type = "button";
    toggle.onclick = () => {
      const folded = collapsed.has(index);
      if (folded) { expanded.add(index); collapsed.delete(index); } else { expanded.delete(index); collapsed.add(index); }
      applyCollapse();
    };
    head.append(toggle);
    return head;
  }
  function renderRounds() {
    for (const head of output.querySelectorAll(".goal-round-head")) head.remove();
    for (const node of output.querySelectorAll("[data-goal-round]")) node.removeAttribute("data-goal-round");
    const rounds = roundList();
    if (!rounds.length || !anchors.size) return;
    syncCollapsed(rounds);
    // 锚点键既有消息下标也有 entryId（app.js 两种都登记），同一节点只算一次：
    // 按登记顺序（= 消息顺序）摊平成节点序列，再让两种键都定位到同一位置。
    const order = [], position = new Map();
    for (const [key, node] of anchors) {
      if (!node) continue;
      if (!position.has(node)) { position.set(node, order.length); order.push(node); }
      position.set(key, position.get(node));
    }
    const grouped = [];
    rounds.forEach((round, index) => {
      const from = position.get(round.startMessage);
      if (from === undefined) return;
      const end = position.get(round.endMessage);
      const next = position.get(rounds[index + 1]?.startMessage);
      const stop = end !== undefined ? end + 1 : next !== undefined ? next : order.length;
      const picked = order.slice(from, stop).filter((node) => node.isConnected);
      if (!picked.length) return;
      for (const node of picked) node.dataset.goalRound = String(index);
      grouped.push([index, picked]);
    });
    for (const [index, picked] of grouped) {
      const host = topLevel(picked[0]);
      if (host?.isConnected) host.before(roundHead(index, rounds[index]));
    }
    applyCollapse();
  }

  function render() {
    renderTrack();
    renderDock();
    renderRounds();
    if (plan.open) renderPlan();
  }

  if (enter) {
    enter.onclick = async () => {
      const text = (readPrompt?.() || "").trim();
      if (text) clearPrompt?.(text);
      await act("enter", text || undefined);
    };
  }
  plan?.querySelector("#goal-plan-confirm")?.addEventListener("click", async () => {
    if (await act("confirm")) plan.close?.();
  });
  plan?.querySelector("#goal-plan-close")?.addEventListener("click", () => plan.close?.());

  return {
    show(id, value, anchorMap) {
      if (id !== sessionId) {
        sessionId = id;
        expanded.clear();
        collapsed.clear();
        plan?.close?.();
        adjustDialog?.close?.();
      }
      goal = value && typeof value === "object" && value.phase ? value : undefined;
      if (anchorMap) anchors = anchorMap;
      else if (!goal) anchors = new Map();
      render();
    },
    setConnected(value) {
      if (connected === value) return;
      connected = value;
      if (enter) enter.disabled = !connected;
      if (goal) { renderDock(); if (plan.open) renderPlan(); }
    },
    // 只更新消息锚点（新消息到达 / 渲染顺序变化），不动 goal 状态。
    anchors(map) {
      anchors = map;
      if (goal) renderRounds();
    },
    hide() { this.show(undefined, undefined, new Map()); },
  };
}
