// 设置页「服务与更新」面板：重启、检查更新/安装、持久化操作记录与维护通道轮询。
// 协议：
//   service.status → { managed, error?, version?, dev?, importDir?, maintenance?:{url,token}, operation? }
//     operation 为守护实时记录；读取失败带 operationError，不伪造空闲/成功。
//     maintenance 仅本机可取；认证远程在线经此命令读状态，其余 WS 命令在维护期间被拒绝。
//   service.update.check → { available, sha, local, remote }；service.restart 传 { mode } 或 { mode:"update", sha }。
// 维护通道（scripts/maint-server.mjs，均带 Authorization: Bearer，鉴权/源不符一律 404）：
//   GET /status → 守护持久化记录（扁平）
//     { pid, instanceId, version, ready, operation:"quick"|"rebuild"|"update"|null, operationId,
//       status:"idle"|"running"|"succeeded"|"failed"|"interrupted", phase, phases:[{phase,at}],
//       startedAt, updatedAt, error, log }
//   POST /recover JSON{mode:"quick"|"rebuild"} → 202{accepted,mode,operationId}，仅 worker 已退出时接受。
// 轮询在线与断线都进行（否则重启准备阶段不可观测），每次以权威 state 更新重启锁与操作记录；
// 请求接受不等于完成。恢复仅由用户在面板触发，自动重试/限流由守护侧负责。
// 业务端口离线时刷新/新开页面无法加载本页，维护凭证只缓存于 sessionStorage（已打开页面断线重连用）。
const MAINT_URL_RE = /^http:\/\/127\.0\.0\.1:\d+$/;
const POLL_MS = 3000, FETCH_TIMEOUT = 5000, SUBMIT_GRACE = 5000;

export function initServiceSettings({ request, isReady }) {
  const $ = (id) => document.getElementById(id);
  let managed = false, restarting = false, checking = false, update = null;
  let pollTimer, polling = false, lastState = null, recovering = false, submittedAt = 0;
  let pendingOperation = null, submission = 0, pollGeneration = 0;
  let observedOperation = null, supersededNotice = "";
  const hasStart = state => Number.isFinite(state?.startedAt);
  const terminal = state => ["succeeded", "failed", "interrupted"].includes(state?.status);
  const names = { quick: "重启服务", rebuild: "Pi 修复并重启", update: "安装更新", install: "安装更新" };
  const statusNames = { running: "进行中", succeeded: "成功", failed: "失败", interrupted: "已中断" };
  // 阶段名本地化，未知阶段原样展示。
  const phaseNames = { repairing: "Pi 诊断修复", preparing: "准备安装", stopping: "保存并停止", swapping: "切换安装", building: "构建", starting: "启动服务", boot: "启动", ready: "就绪", stop: "停止服务", build: "构建", download: "下载更新", install: "安装更新", start: "启动服务", recover: "恢复服务" };
  const phaseText = (phase) => (phase ? (phaseNames[phase] ?? phase) : "…");

  const repairConfig = () => ({ provider: $("repair-provider")?.value.trim() || "", model: $("repair-model")?.value.trim() || "", thinking: $("repair-thinking")?.value || "medium" });
  for (const key of ["provider", "model", "thinking"]) {
    const field = $(`repair-${key}`);
    if (!field) continue;
    try { const saved = JSON.parse(localStorage.getItem("axiom.service-repair") || "null"); if (saved?.[key]) field.value = saved[key]; } catch {}
    field.onchange = () => { try { localStorage.setItem("axiom.service-repair", JSON.stringify(repairConfig())); } catch {} };
  }

  function sync() {
    const ready = isReady() && managed && !restarting && !checking;
    for (const id of ["restart-quick", "restart-rebuild"]) {
      $(id).disabled = !ready;
    }
    if (!isReady()) $("restart-rebuild").disabled = !readMaintenance() || recovering || !lastState || lastState.unreachable || lastState.ready || lastState.status === "running";
    for (const key of ["provider", "model", "thinking"]) if ($(`repair-${key}`)) $(`repair-${key}`).disabled = restarting || recovering;
    $("update-check").disabled = !ready;
    $("update-install").disabled = !ready;
    const recover = $("service-recover");
    recover.hidden = isReady() || !readMaintenance();
    recover.disabled = recovering || !lastState || lastState.unreachable
      || lastState.ready || lastState.status === "running";
  }

  // 持久化操作记录：结果 + 本次阶段时间线 + 脱敏日志尾部；在线轮询与重连后都覆盖展示。
  function renderOperation(rec) {
    const box = $("service-history");
    if (!rec || (rec.status === "idle" && !rec.persistenceError)) {
      box.textContent = "尚未执行任何操作。操作结果以这里为准。";
      return;
    }
    box.replaceChildren();
    const head = document.createElement("p");
    head.textContent = `${names[rec.operation] || rec.operation || "服务"}：${statusNames[rec.status] || rec.status}${
      rec.status === "running" && rec.phase ? `（${phaseText(rec.phase)}）` : ""}${rec.error ? `：${rec.error}` : ""}`;
    box.append(head);
    if (rec.persistenceError) {
      const warning = document.createElement("p");
      warning.textContent = rec.persistenceError;
      box.append(warning);
    }
    for (const { phase, at } of rec.phases || []) {
      if (rec.startedAt && at < rec.startedAt) continue; // phases 跨操作累积，只展示本次的时间线
      const row = document.createElement("p");
      const time = new Date(at);
      row.textContent = `${Number.isNaN(time.getTime()) ? "" : `${time.toLocaleTimeString()} `}${phaseText(phase)}`;
      box.append(row);
    }
    if (rec.log) {
      const log = document.createElement("p");
      log.textContent = rec.log;
      box.append(log);
    }
  }

  function apply(service) {
    managed = service.managed === true;
    $("service-update-section").hidden = service.dev === true; // DEV 隐藏更新
    $("service-dev").hidden = service.dev !== true;
    const version = service.version ? `v${service.version}` : "";
    $("service-version").hidden = !version;
    $("service-version").textContent = version;
    $("service-feedback").textContent = service.error || (managed
      ? "重启前请停止所有会话任务；页面会自动重连。"
      : "当前为直接启动，请改用 npm start 以启用重启和更新。");
    if (service.operation) applyOperation(service.operation);
    if (service.operationError) $("service-feedback").textContent = service.operationError;
    const previousMaintenance = readMaintenance();
    saveMaintenance(service.maintenance);
    if (JSON.stringify(previousMaintenance) !== JSON.stringify(readMaintenance())) stopPolling();
    if (readMaintenance() || managed) watch();
    else stopPolling();
    sync();
  }

  function applyOperation(state) {
    if (!state || !["idle", "running", "succeeded", "failed", "interrupted"].includes(state.status)) return;
    const previous = observedOperation;
    if (previous?.operationId && state.operationId !== previous.operationId) {
      if (!hasStart(previous) || !hasStart(state) || state.startedAt <= previous.startedAt) return;
    } else if (previous?.operationId && previous.operationId === state.operationId
      && terminal(previous) && !terminal(state)) return;
    if (pendingOperation) {
      const pending = pendingOperation;
      if (pending.awaiting) return; // ACK 前的旧终态不能解除新操作锁。
      if (pending.id) {
        if (state.operationId !== pending.id) {
          if (!state.operationId || !hasStart(pending) || !hasStart(state) || state.startedAt <= pending.startedAt) return;
          supersededNotice = "原请求的最终结果未能确认，记录已被后续操作覆盖；以下为最近操作，不代表原请求成功。";
          pending.id = state.operationId;
          pending.startedAt = state.startedAt;
        } else if (!hasStart(pending) && hasStart(state)) pending.startedAt = state.startedAt;
        if (terminal(state)) pendingOperation = null;
      } else {
        // 未知回执没有操作身份，不能以不同 ID 猜测本次请求已完成。
        const legacyIdle = pending.legacy && state.status === "idle" && Date.now() - submittedAt >= SUBMIT_GRACE;
        if (!legacyIdle) return;
        pendingOperation = null;
      }
    }
    observedOperation = state;
    lastState = state;
    restarting = !!pendingOperation || state.status === "running";
    if (restarting || (state.operation === "update" && state.status === "succeeded")) {
      update = null;
      $("update-result").textContent = "";
      $("update-install").hidden = true;
    }
    renderOperation(state);
    if (supersededNotice) {
      const notice = document.createElement("p");
      notice.textContent = supersededNotice;
      $("service-history").prepend(notice);
    }
  }

  function openDialog(mode) {
    if (restarting || (mode !== "rebuild" && (!isReady() || !managed))) return;
    if (mode === "rebuild" && (!repairConfig().provider || !repairConfig().model)) {
      $("service-feedback").textContent = "请先填写修复代理的供应商和模型 ID。";
      return;
    }
    const dialog = $("restart-dialog");
    dialog.dataset.mode = mode;
    $("restart-title").textContent = names[mode];
    $("restart-description").textContent = mode === "install"
      ? `下载并安装新版本 ${update.remote}（当前 ${update.local}），随后自动重启；所有页面会暂时断开连接。`
      : mode === "quick"
        ? "仅重启服务，不修复依赖。所有页面会暂时断开连接，随后自动重连。"
        : "授权独立 Pi 代理检查并修改当前安装的依赖、构建及启动配置。业务服务会停止，修复报告会沉淀到本机提示词文档；可能产生模型费用，最终以新实例就绪核验为准。";
    $("restart-submit").textContent = `确认${names[mode]}`;
    dialog.showModal();
    $("restart-cancel").focus();
  }

  async function check() {
    if (checking || restarting || !isReady() || !managed) return;
    checking = true;
    sync();
    $("update-result").textContent = "正在检查更新…";
    try {
      update = await request("service.update.check");
      $("update-result").textContent = update.available
        ? `发现新版本 ${update.remote}（当前 ${update.local}）。安装会重新部署并自动重启。`
        : `已是最新版本（${update.local}）。`;
      $("update-install").hidden = !update.available;
    } catch (e) {
      update = null;
      $("update-install").hidden = true;
      $("update-result").textContent = `检查失败：${e.message}`;
    }
    checking = false;
    sync();
  }

  async function submit() {
    const dialog = $("restart-dialog");
    if (!dialog.open) return;
    const mode = dialog.dataset.mode;
    dialog.close();
    if (mode === "rebuild" && !isReady()) {
      recovering = true;
      sync();
      const result = await maintenanceRequest("/recover", { method: "POST", body: { mode: "rebuild", repair: repairConfig() } });
      recovering = false;
      $("service-feedback").textContent = result?.accepted ? "Pi 修复请求已接受，请等待维护记录更新。" : `修复请求失败：${result?.error || "维护端点不可达"}`;
      sync();
      return;
    }
    if (!isReady() || !managed || restarting) return;
    restarting = true;
    submission++;
    pendingOperation = { awaiting: true };
    supersededNotice = "";
    submittedAt = Date.now(); // 旧快照和 ACK 都不能作为本次操作的最终结果
    sync();
    // 不提示成功：接受请求只代表开始执行，真实结果按持久化操作记录展示（轮询或重连后覆盖）。
    $("service-feedback").textContent = `${names[mode]}请求已提交，服务将重启并断开页面连接；请勿重复操作，结果以最近操作为准。`;
    try {
      const result = await request("service.restart", mode === "install" ? { mode: "update", sha: update.sha } : { mode, ...(mode === "rebuild" ? { repair: repairConfig() } : {}) });
      pendingOperation.awaiting = false;
      pendingOperation.id = result?.operationId;
      pendingOperation.startedAt = result?.startedAt;
      pendingOperation.legacy = !result?.operationId && !result?.unconfirmed;
    } catch (e) {
      if (e.unknown) pendingOperation.awaiting = false;
      else { pendingOperation = null; restarting = false; submittedAt = 0; }
      $("service-feedback").textContent = e.message;
    }
    sync();
  }

  // 凭证只缓存会话级；url 必须是 loopback 维护端点精确形态，token 非空，否则视为无凭证。
  function saveMaintenance(value) {
    try {
      sessionStorage.removeItem("axiom.maintenance");
      if (value && MAINT_URL_RE.test(value.url) && typeof value.token === "string" && value.token)
        sessionStorage.setItem("axiom.maintenance", JSON.stringify({ url: value.url, token: value.token }));
    } catch {}
  }
  function readMaintenance() {
    try {
      const saved = JSON.parse(sessionStorage.getItem("axiom.maintenance") || "null");
      if (saved && MAINT_URL_RE.test(saved.url) && typeof saved.token === "string" && saved.token) return saved;
    } catch {}
    return null;
  }

  function maintenanceRequest(path, { method = "GET", body } = {}) {
    const saved = readMaintenance();
    if (!saved || typeof fetch !== "function") return Promise.resolve(null);
    // 超时即 abort（5s，与守护 server.setTimeout 一致）；AbortController 各现代环境原生可用。
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    return fetch(`${saved.url}${path}`, {
      method,
      cache: "no-store",
      signal: controller.signal,
      headers: { authorization: `Bearer ${saved.token}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        return r.ok ? data : { unreachable: true, error: data.error };
      })
      .catch(() => ({ unreachable: true }))
      .finally(() => clearTimeout(timer));
  }

  function describe(state) {
    if (state.unreachable) return "服务维护中：维护端点不可达。请在本机终端运行 npm start 重新启动服务。";
    if (state.ready) return "服务已恢复，等待自动重连。";
    const name = names[state.operation] || "维护操作";
    if (state.status === "running") return `服务维护中：${name}进行中（${phaseText(state.phase)}），等待自动重连。`;
    if (state.status === "succeeded") return `服务维护中：${name}已完成，等待服务恢复。`;
    if (state.status === "failed" || state.status === "interrupted")
      return `服务维护中：${name}${statusNames[state.status]}${state.error ? `：${state.error}` : ""}。请在本机终端运行 npm start 重新启动服务。`;
    return "服务维护中：业务进程未运行，可在服务设置中尝试恢复。";
  }

  // 恢复仅由用户在面板触发；返回的 API 供测试与后续入口复用，仅 worker 已退出时被接受。
  async function recoverWorker() {
    if (recovering) return null;
    recovering = true;
    sync();
    const line = $("maintenance-state");
    line.hidden = false;
    line.textContent = "服务维护中：业务进程未运行，正在请求恢复…";
    const result = await maintenanceRequest("/recover", { method: "POST", body: { mode: "quick" } });
    recovering = false;
    if (pollTimer) {
      line.textContent = result && result.accepted === true
        ? "服务维护中：已请求恢复服务（重启服务），等待启动。"
        : `服务维护中：恢复请求未接受${result?.error ? `：${result.error}` : ""}。请在本机终端运行 npm start 重新启动服务。`;
    }
    sync();
    return result;
  }

  function stopPolling() {
    pollGeneration++;
    clearInterval(pollTimer);
    pollTimer = undefined;
    $("maintenance-state").hidden = true;
  }

  function watch() {
    if (pollTimer || (!readMaintenance() && !managed)) return;
    const line = $("maintenance-state");
    line.hidden = !readMaintenance();
    const poll = async () => {
      if (polling) return; // 上一次请求未返回前不重叠发起
      const local = !!readMaintenance();
      if (!local && !isReady()) {
        line.hidden = !restarting;
        line.textContent = "连接断开，等待自动重连后确认操作结果；无法恢复时请在电脑本机处理。";
        sync();
        return;
      }
      polling = true;
      const atSubmission = submission, generation = pollGeneration;
      try {
        const state = local ? await maintenanceRequest("/status") : (await request("service.status")).operation;
        if (!pollTimer || generation !== pollGeneration || atSubmission !== submission) return;
        if (!state || state.unreachable) {
          if (local) { lastState = state; line.hidden = false; line.textContent = describe(state || { unreachable: true }); }
          else if (restarting) { line.hidden = false; line.textContent = "维护状态暂时无法读取，操作结果尚未确认，请稍后重试。"; }
        } else {
          line.hidden = !local;
          if (local) line.textContent = describe(state);
          applyOperation(state);
        }
        sync();
      } catch {
        if (pollTimer && generation === pollGeneration && atSubmission === submission) {
          line.hidden = false;
          line.textContent = "维护状态暂时无法读取，操作结果尚未确认，请稍后重试。";
        }
      } finally {
        polling = false;
      }
    };
    poll();
    pollTimer = setInterval(poll, POLL_MS);
  }

  for (const mode of ["quick", "rebuild"]) $(`restart-${mode}`).onclick = () => openDialog(mode);
  $("update-check").onclick = () => void check();
  $("update-install").onclick = () => openDialog("install");
  $("restart-cancel").onclick = () => $("restart-dialog").close();
  $("restart-form").onsubmit = (e) => {
    e.preventDefault();
    void submit();
  };
  $("service-recover").onclick = () => void recoverWorker();

  return {
    apply,
    sync,
    watch,
    check,
    stop: stopPolling,
    cancelRestart: () => { if (!pendingOperation && lastState?.status !== "running") restarting = false; sync(); },
    recover: (mode = "quick") => maintenanceRequest("/recover", { method: "POST", body: { mode } }),
    get restarting() { return restarting; },
  };
}
