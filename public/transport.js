// One owner for the native business socket. No command replay, no event reordering.
export function createTransport({ url, WebSocket: Socket = globalThis.WebSocket,
  initialize = () => {}, reduce = () => {}, onState = () => {},
  report = (entry) => console.warn("[transport]", entry),
  setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now,
  timeout = 120000, maxPending = 256, maxBytes = 32 * 1024 * 1024,
  maxEvents = 10000, maxRetries = 5 } = {}) {
  let socket, opening, disposed = false, state = "closed", timer, failures = 0, id = 0;
  let generation = 0, epoch, gate = null, queuedBytes = 0, oldest = 0;
  const pending = new Map(), listeners = new Set(), watermarks = new Map();
  const diagnostic = (code) => {
    // Never include payloads, exception messages, request bodies or credentials.
    try { report({ code, state, pending: pending.size, queued: gate?.length || 0,
      queuedBytes, oldestMs: oldest ? now() - oldest : 0, bufferedAmount: socket?.bufferedAmount || 0 }); }
    catch { console.warn("[transport] diagnostic callback failed"); }
  };
  const notify = (listener, message, context) => {
    try { Promise.resolve(listener(message, context)).catch(() => diagnostic("listener_failed")); }
    catch { diagnostic("listener_failed"); }
  };
  const status = (value) => { state = value; notify(onState, value); };
  const failure = (code, message, unknown = false) => Object.assign(new Error(message), { code, unknown });
  const clearGate = () => { gate = null; queuedBytes = 0; oldest = 0; };
  const settle = (key, error, data) => {
    const entry = pending.get(key);
    if (!entry) return;
    pending.delete(key);
    clearTimer(entry.timer);
    entry.signal?.removeEventListener("abort", entry.abort);
    error ? entry.reject(error) : entry.resolve(data);
    if (error && gate && ["session.attach", "session.create", "session.import"].includes(entry.command)) {
      if (error.code === "response_error") {
        const queued = gate;
        clearGate();
        try { for (const message of queued) deliver(message); }
        catch { recover("merge_failed"); }
      } else if (!["disconnected"].includes(error.code)) recover("snapshot_request_failed");
    }
  };
  const disconnectPending = () => {
    for (const key of pending.keys()) settle(key, failure("disconnected", "连接断开，请求结果未知；请确认状态后再操作", true));
  };
  function recover(code) {
    if (disposed || state === "limited") return;
    diagnostic(code);
    status("recovering");
    // A failed reducer may have partially changed state: never process more events until a snapshot.
    clearGate();
    socket?.close(1011, "recovery required");
  }
  function deliver(message) {
    if (message.seq != null) {
      if (!Number.isSafeInteger(message.seq) || message.seq < 0) throw new Error("invalid sequence");
      if (message.seq <= (watermarks.get(message.sessionId) ?? -1)) return;
    }
    reduce(message); // Synchronous authoritative reducer; failure must not advance the watermark.
    if (message.seq != null) watermarks.set(message.sessionId, message.seq);
    if (message.type === "session.deleted") watermarks.delete(message.sessionId);
    for (const entry of listeners) {
      if (entry.type !== message.type && entry.type !== "*") continue;
      if (entry.filter.sessionId != null && entry.filter.sessionId !== message.sessionId) continue;
      if (entry.filter.agentId != null && entry.filter.agentId !== (message.agentId || "main")) continue;
      notify(entry.listener, message, entry.context);
    }
  }
  function receive(message) {
    if (state === "recovering" || state === "limited" || state === "disconnected" || disposed) return;
    try {
      if (gate && message.sessionId) {
        const bytes = new Blob([JSON.stringify(message)]).size;
        if (gate.length >= maxEvents || queuedBytes + bytes > maxBytes) return recover("receive_limit");
        if (!gate.length) oldest = now();
        queuedBytes += bytes;
        gate.push(message);
      } else deliver(message);
    } catch { recover("merge_failed"); }
  }
  function beginSnapshot() {
    // Keep events already buffered between response and rendering, even when rendering yields.
    if (!gate) { gate = []; queuedBytes = 0; oldest = 0; }
  }
  function commitSnapshot(snapshot) {
    if (snapshot.instanceId != null && snapshot.instanceId !== epoch) {
      epoch = snapshot.instanceId;
      watermarks.clear();
    }
    if (Number.isInteger(snapshot.seq)) watermarks.set(snapshot.sessionId, snapshot.seq);
    // Only the attached conversation owns live state; historical pages must not call this.
    for (const key of watermarks.keys()) if (key !== snapshot.sessionId) watermarks.delete(key);
    const queued = gate || [];
    clearGate();
    try { for (const message of queued) if (!message.sessionId || message.sessionId === snapshot.sessionId || message.type === "session.deleted") deliver(message); }
    catch { recover("merge_failed"); throw failure("merge_failed", "消息恢复失败，请重新连接"); }
  }
  function request(command, { signal, timeoutMs = timeout } = {}) {
    if (signal?.aborted) return Promise.reject(failure("aborted", "已取消本地等待，服务端操作不受影响"));
    if (socket?.readyState !== 1 || disposed || ["recovering", "limited"].includes(state))
      return Promise.reject(failure("disconnected", "连接已断开，请重新连接"));
    if (pending.size >= maxPending) return Promise.reject(failure("pending_limit", "等待中的请求过多"));
    const key = String(++id);
    const raw = JSON.stringify({ ...command, id: key });
    if ((socket.bufferedAmount || 0) + new Blob([raw]).size > maxBytes)
      return Promise.reject(failure("send_limit", "发送缓冲超限，请稍后重试"));
    // Buffer before sending attach; do not lose events emitted while the snapshot loads.
    if (["session.attach", "session.create", "session.import"].includes(command.type)) beginSnapshot();
    return new Promise((resolve, reject) => {
      const abort = () => settle(key, failure("aborted", "已取消本地等待，服务端操作可能仍在执行", true));
      const entry = { resolve, reject, signal, abort, command: command.type,
        timer: setTimer(() => settle(key, failure("timeout", "回执超时，请求结果未知；请确认状态后再操作", true)), timeoutMs) };
      pending.set(key, entry);
      signal?.addEventListener("abort", abort, { once: true });
      try { socket.send(raw); }
      catch { settle(key, failure("send_failed", "发送失败，请求结果未知", true)); }
    });
  }
  function connect({ retry = false } = {}) {
    if (disposed) return Promise.reject(failure("disposed", "连接已销毁"));
    if (opening) {
      if (socket) return opening;
      return opening.catch(() => {}).then(() => connect({ retry }));
    }
    if (socket?.readyState === 1) return Promise.resolve();
    if (!retry) failures = 0;
    clearTimer(timer);
    timer = undefined;
    const current = ++generation;
    status("connecting");
    opening = (async () => {
      const ws = socket = new Socket(typeof url === "function" ? url() : url, ["axiom"]);
      await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = () => { diagnostic("socket_error"); reject(failure("connect_failed", "连接失败，请检查服务是否运行")); };
        ws.onmessage = ({ data }) => {
          if (current !== generation || socket !== ws || disposed) return;
          try {
            const message = JSON.parse(data);
            if (message.type === "response") {
              const entry = pending.get(message.id);
              if (!entry) return;
              if (message.ok && ["session.attach", "session.create", "session.import"].includes(entry.command)) beginSnapshot();
              settle(message.id, message.ok ? null : failure("response_error", message.error), message.data);
            } else receive(message);
          } catch { recover("invalid_message"); }
        };
        ws.onclose = (event = {}) => {
          if (current !== generation) return;
          socket = undefined;
          disconnectPending();
          reject(failure("disconnected", "连接断开"));
          if (disposed) return;
          if (event.code === 1009) { clearGate(); status("limited"); diagnostic("message_limit"); return; }
          const normal = event.code === 1000;
          status(normal ? "closed" : "disconnected");
          clearGate();
          if (!normal) scheduleReconnect();
        };
      });
      if (current !== generation || disposed) return;
      status("restoring");
      await initialize({ isCurrent: () => current === generation && socket?.readyState === 1 && !disposed });
      if (current !== generation || !socket || disposed) return;
      failures = 0;
      status("open");
    })().catch((error) => {
      if (!disposed && state !== "limited") {
        diagnostic("restore_failed");
        socket?.close(1011, "recovery required");
        scheduleReconnect();
      }
      throw error;
    }).finally(() => { opening = undefined; });
    return opening;
  }
  function scheduleReconnect() {
    if (disposed || state === "limited" || timer != null) return;
    if (++failures > maxRetries) { status("limited"); diagnostic("retry_limit"); return; }
    timer = setTimer(() => {
      timer = undefined;
      void connect({ retry: true }).catch(() => {}); // connect reports failures and bounds retries.
    }, Math.min(1000 * 2 ** (failures - 1), 15000));
  }
  return {
    connect, request, receive, beginSnapshot, commitSnapshot,
    failSnapshot: () => recover("snapshot_failed"),
    getConnectionState: () => state,
    getDiagnostics: () => ({ state, pending: pending.size, queued: gate?.length || 0, queuedBytes, failures }),
    getSnapshotQueue: () => gate,
    getWatermark: (sessionId) => watermarks.get(sessionId),
    subscribe(type, filter, listener) {
      const controller = new AbortController();
      const entry = { type, filter, listener, controller, context: { signal: controller.signal,
        isCurrent: () => !controller.signal.aborted,
        commit: (fn) => { if (!controller.signal.aborted) fn(); } } };
      listeners.add(entry);
      return () => { controller.abort(); listeners.delete(entry); };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      ++generation;
      clearTimer(timer);
      timer = undefined;
      disconnectPending(); clearGate(); watermarks.clear();
      for (const entry of listeners) entry.controller.abort();
      listeners.clear();
      socket?.close(1000, "disposed"); socket = undefined;
      status("disposed");
    },
  };
}
