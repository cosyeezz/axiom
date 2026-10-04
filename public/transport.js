import { CHUNK_PROTOCOL, FRAME_BYTES, createChunkReceiver } from "./transport-framing.js";

// One owner for the native business socket. No command replay, no event reordering.
// 大命令序列化（D4）：估算超阈值的 stringify 移入后台 Worker，主线程只付结构化克隆成本；
// 无 Worker 环境（旧浏览器/测试）自动退化同步路径。发送顺序由 queueTail 链保证，与同步路径一致。
const SERIALIZE_THRESHOLD = 1 << 20;
const SNAPSHOT_COMMANDS = new Set(["session.attach", "session.create", "session.import", "session.duplicate"]);
const WORKER_SOURCE = 'self.onmessage = ({ data }) => {' +
  'const raw = JSON.stringify(data.command);' +
  "self.postMessage({ key: data.key, raw, bytes: new TextEncoder().encode(raw).length });" +
  '};';
function estimateBytes(value, depth = 0) {
  if (typeof value === "string") return value.length;
  if (value == null || typeof value !== "object" || depth > 6) return 8;
  let total = 16;
  for (const item of Array.isArray(value) ? value : Object.values(value)) {
    total += estimateBytes(item, depth + 1);
    if (total > SERIALIZE_THRESHOLD) return total; // 早退：只需判断是否超阈
  }
  return total;
}
export function createTransport({ url, WebSocket: Socket = globalThis.WebSocket,
  initialize = () => {}, reduce = () => {}, onState = () => {},
  report = (entry) => console.warn("[transport]", entry),
  setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now,
  timeout = 120000, maxPending = 256, maxBytes = 32 * 1024 * 1024,
  maxEvents = 10000, maxRetries = 5, Serializer = globalThis.Worker,
  serializeTimeout = 10000, connectTimeout = 15000, restoreTimeout = 120000,
  heartbeatInterval = 25000, heartbeatTimeout = 10000,
  maxNetworkRetries = 8, resumeCooldown = 30000, stableInterval = 60000,
  chunkIdleTimeout = 30000, chunkTotalTimeout = 120000, maxQueuedBytes = 128 * 1024 * 1024 } = {}) {
  let socket, opening, disposed = false, state = "closed", timer, failures = 0, id = 0;
  let generation = 0, epoch, gate = null, queuedBytes = 0, oldest = 0, snapshotRequest;
  let endConnection, handshakeTimer, heartbeatTimer, restoreTimer, healthCheck, protectionFailures = 0;
  let lastResume = -Infinity, openedAt = null, lastReceive = null, lastSend = null, lastResponse = null;
  let receiveSerial = 0, stable = false, frameTimer, frameStarted = null, connectionId = null;
  const receiver = createChunkReceiver();
  // 发送序链（D4）：入队后统一序列化/发送，与同步路径保同等顺序。
  let queueTail = Promise.resolve();
  let serializer, serializerUrl, serialKey = 0, serializerDisabled = false;
  const pendingSerial = new Map();
  function releaseSerializer() {
    if (serializer) {
      serializer.onmessage = serializer.onerror = serializer.onmessageerror = null;
      serializer.terminate(); serializer = undefined;
    }
    if (serializerUrl) { URL.revokeObjectURL(serializerUrl); serializerUrl = undefined; }
  }
  function fallbackSerializer() {
    serializerDisabled = true;
    releaseSerializer();
    diagnostic("serialize_fallback"); // No payloads or browser exception details.
    for (const finish of pendingSerial.values()) finish(null);
  }
  function serializeOffThread(command, entry) {
    if (!serializer) {
      try {
        serializerUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
        const worker = serializer = new Serializer(serializerUrl);
        worker.onmessage = ({ data }) => {
          if (serializer !== worker) return;
          if (typeof data?.raw !== "string" || !Number.isSafeInteger(data.bytes) || data.bytes < 0)
            return fallbackSerializer();
          pendingSerial.get(data.key)?.(data);
        };
        worker.onerror = worker.onmessageerror = () => {
          if (serializer === worker) fallbackSerializer();
        };
      } catch { fallbackSerializer(); return Promise.resolve(null); }
    }
    return new Promise((resolve) => {
      const key = ++serialKey;
      const finish = (data) => {
        if (!pendingSerial.delete(key)) return;
        clearTimer(serialTimer);
        entry.cancelSerialize = null;
        resolve(data);
      };
      const serialTimer = setTimer(fallbackSerializer, serializeTimeout);
      pendingSerial.set(key, finish);
      // Cancellation must release the send chain even when the Worker never replies.
      entry.cancelSerialize = () => { releaseSerializer(); finish(null); };
      try { serializer.postMessage({ key, command }); }
      catch { fallbackSerializer(); }
    });
  }
  async function serializeCommand(full, key, entry) {
    if (Serializer && !serializerDisabled && estimateBytes(full) > SERIALIZE_THRESHOLD) {
      const result = await serializeOffThread(full, entry);
      if (pending.get(key) !== entry) return null;
      if (result) return result;
    }
    // Only serialize again before send: never replay a command whose delivery is unknown.
    try { return { raw: JSON.stringify(full), bytes: null }; }
    catch { throw failure("serialize_failed", "消息序列化失败，尚未发送；请检查输入后重试"); }
  }
  const pending = new Map(), listeners = new Set(), watermarks = new Map();
  const diagnostic = (code, fields = {}) => {
    // Only locally constructed whitelist fields; never payloads, reason text, IDs or credentials.
    const age = value => value == null ? null : Math.max(0, now() - value);
    try { report({ code, at: now(), generation, connectionId, state, failures, protectionFailures,
      pending: pending.size, queued: gate?.length || 0, queuedBytes,
      oldestMs: oldest ? now() - oldest : 0, bufferedAmount: socket?.bufferedAmount || 0,
      receiveAgeMs: age(lastReceive), sendAgeMs: age(lastSend), responseAgeMs: age(lastResponse),
      openMs: age(openedAt), protocol: socket?.protocol === CHUNK_PROTOCOL ? CHUNK_PROTOCOL : "axiom", ...fields }); }
    catch { console.warn("[transport] diagnostic callback failed"); }
  };
  const notify = (listener, message, context) => {
    try { Promise.resolve(listener(message, context)).catch(() => diagnostic("listener_failed")); }
    catch { diagnostic("listener_failed"); }
  };
  const status = (value) => { state = value; notify(onState, value); };
  const failure = (code, message, unknown = false) => Object.assign(new Error(message), { code, unknown });
  const clearGate = () => { gate = null; queuedBytes = 0; oldest = 0; snapshotRequest = undefined; };
  const settle = (key, error, data) => {
    const entry = pending.get(key);
    if (!entry) return;
    pending.delete(key);
    clearTimer(entry.timer);
    entry.cancelSerialize?.();
    entry.signal?.removeEventListener("abort", entry.abort);
    error ? entry.reject(error) : entry.resolve(data);
    if (error && gate && key === snapshotRequest && SNAPSHOT_COMMANDS.has(entry.command)) {
      if (error.code === "response_error") {
        const queued = gate;
        clearGate();
        try { for (const message of queued) deliver(message); }
        catch { recover("merge_failed"); }
      } else if (error.code === "timeout") endConnection?.(failure("snapshot_timeout", "读取会话超时，正在恢复"));
      else if (!["disconnected"].includes(error.code)) recover("snapshot_request_failed");
    }
  };
  const disconnectPending = () => {
    for (const [key, entry] of pending) settle(key, failure("disconnected", entry.sent
      ? "连接断开，请求结果未知；请确认状态后再操作" : "连接断开，消息尚未发送，请重新连接", entry.sent));
  };
  function recover(code, cause) {
    // A failed connection owns at most one recovery transition/budget charge.
    if (disposed || state === "limited" || !endConnection) return;
    diagnostic(code);
    // Bound data/merge failures separately from ordinary network outages.
    const limited = ++protectionFailures > maxRetries;
    status("recovering");
    endConnection?.(cause || failure(code, "消息恢复失败"), { limited });
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
        if (gate.length >= maxEvents || queuedBytes + bytes > maxQueuedBytes) return recover("receive_limit");
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
    // Buffer before sending attach; do not lose events emitted while the snapshot loads.
    if (SNAPSHOT_COMMANDS.has(command.type)) {
      snapshotRequest = key; beginSnapshot();
    }
    return new Promise((resolve, reject) => {
      const abort = () => settle(key, failure("aborted", entry.sent
        ? "已取消本地等待，服务端操作可能仍在执行" : "已取消，消息尚未发送", entry.sent));
      const entry = { resolve, reject, signal, abort, command: command.type, sent: false,
        timer: setTimer(() => settle(key, failure("timeout", entry.sent
          ? "回执超时，请求结果未知；请确认状态后再操作" : "消息准备超时，尚未发送，请重试", entry.sent)), timeoutMs) };
      pending.set(key, entry);
      signal?.addEventListener("abort", abort, { once: true });
      // 序列化与发送进入保序链：大命令的 stringify 在后台 Worker，小命令同步路径不变。
      const sent = queueTail
        .then(() => (pending.get(key) === entry ? serializeCommand({ ...command, id: key }, key, entry) : null))
        .then((serialized) => {
          if (!serialized || pending.get(key) !== entry) return; // 已超时/取消：不再发送。
          if (socket?.readyState !== 1 || ["recovering", "limited"].includes(state) || disposed)
            throw failure("disconnected", "连接已断开，请重新连接");
          // send 前复检缓冲水位：保 send_limit 的确定性失败语义（单消息原子不可分片）。
          const size = serialized.bytes ?? new Blob([serialized.raw]).size;
          if ((socket.bufferedAmount || 0) + size > maxBytes)
            throw failure("send_limit", "发送缓冲超限，请稍后重试");
          entry.sent = true;
          try { socket.send(serialized.raw); lastSend = now(); }
          catch { throw failure("send_failed", "发送失败，请求结果未知", true); }
        });
      queueTail = sent.catch(() => {});
      sent.catch((error) => settle(key, error));
    });
  }
  function clearConnectionTimers() {
    clearTimer(handshakeTimer); clearTimer(heartbeatTimer); clearTimer(restoreTimer); clearTimer(frameTimer);
    handshakeTimer = heartbeatTimer = restoreTimer = frameTimer = undefined;
    frameStarted = null; receiver.clear();
    healthCheck = undefined;
  }
  function restoreProgress() {
    clearTimer(restoreTimer);
    restoreTimer = setTimer(() => endConnection?.(failure("restore_timeout", "恢复长时间无进展，正在重试")), restoreTimeout);
  }
  function scheduleHeartbeat() {
    clearTimer(heartbeatTimer);
    if (!heartbeatInterval || disposed || state !== "open") return;
    heartbeatTimer = setTimer(() => { heartbeatTimer = undefined; void checkHealth(); }, heartbeatInterval);
  }
  function checkHealth() {
    if (disposed || state !== "open") return Promise.resolve();
    if (healthCheck) return healthCheck;
    clearTimer(heartbeatTimer); heartbeatTimer = undefined;
    const current = generation, received = receiveSerial;
    // The negotiated protocol also guarantees the lightweight, authenticated ping command.
    const probe = request({ type: socket?.protocol === CHUNK_PROTOCOL ? "connection.ping" : "service.status" }, { timeoutMs: heartbeatTimeout })
      .then(data => {
        if (current === generation && typeof data?.connectionId === "string" && /^[a-f0-9-]{36}$/.test(data.connectionId))
          connectionId = data.connectionId;
      })
      .catch(error => {
        if (current !== generation || disposed) return;
        // An error response still proves the bidirectional connection is alive.
        // Local backpressure is not evidence of a dead peer: the probe never left this client.
        if (error.code === "timeout" && !error.unknown) return;
        // A FIFO ping may sit behind a partial message; its own idle/total deadline owns liveness.
        if (error.code === "timeout" && (receiveSerial !== received || receiver.pending)) {
          diagnostic("heartbeat_delayed_active"); return;
        }
        if (!["response_error", "pending_limit", "send_limit"].includes(error.code))
          endConnection?.(failure("heartbeat_timeout", "连接无响应，正在恢复"));
      }).finally(() => {
        if (current !== generation || disposed) return;
        healthCheck = undefined; scheduleHeartbeat();
      });
    healthCheck = probe;
    return probe;
  }
  function connect({ retry = false } = {}) {
    if (disposed) return Promise.reject(failure("disposed", "连接已销毁"));
    if (opening) return opening;
    if (socket?.readyState === 1) return Promise.resolve();
    if (!retry) { failures = 0; protectionFailures = 0; lastResume = -Infinity; }
    clearTimer(timer); timer = undefined;
    const current = ++generation;
    openedAt = lastReceive = lastSend = lastResponse = null;
    receiveSerial = 0; stable = false; connectionId = null;
    status("connecting");
    let ws, rejectLifetime;
    const lifetime = new Promise((_, reject) => { rejectLifetime = reject; });
    const isCurrent = () => current === generation && !disposed;
    const end = (error, { normal = false, limited = false } = {}) => {
      if (!isCurrent()) return;
      diagnostic("connection_ended", { cause: ["disconnected", "connect_timeout", "connect_failed", "restore_timeout",
        "heartbeat_timeout", "snapshot_timeout", "chunk_timeout", "disposed", "invalid_message", "receive_limit",
        "merge_failed", "snapshot_failed", "snapshot_request_failed"].includes(error?.code) ? error.code : "restore_failed" });
      ++generation; // Invalidate even when close() never produces an event.
      socket = undefined; opening = undefined; endConnection = undefined;
      clearConnectionTimers();
      clearGate(); disconnectPending();
      rejectLifetime(error);
      try { ws?.close(normal ? 1000 : 4001, "connection ended"); } catch {}
      status(limited ? "limited" : normal ? "closed" : "disconnected");
      if (limited) diagnostic("recovery_limit");
      else if (!normal) scheduleReconnect();
    };
    endConnection = end;
    const run = (async () => {
      ws = socket = new Socket(typeof url === "function" ? url() : url, [CHUNK_PROTOCOL, "axiom"]);
      await new Promise(resolve => {
        handshakeTimer = setTimer(() => end(failure("connect_timeout", "连接超时，正在重试")), connectTimeout);
        ws.onopen = () => {
          if (!isCurrent()) return;
          clearTimer(handshakeTimer); handshakeTimer = undefined; resolve();
        };
        ws.onerror = () => { if (isCurrent()) { diagnostic("socket_error"); end(failure("connect_failed", "连接失败，正在重试")); } };
        ws.onmessage = ({ data }) => {
          if (!isCurrent() || socket !== ws) return;
          try {
            if (ws.protocol === CHUNK_PROTOCOL && (typeof data !== "string" || data.length > FRAME_BYTES || new Blob([data]).size > FRAME_BYTES))
              throw new Error("frame too large");
            if (frameStarted != null && now() - frameStarted >= chunkTotalTimeout) {
              end(failure("chunk_timeout", "消息传输超过总期限")); return;
            }
            const message = receiver.accept(JSON.parse(data), ws.protocol === CHUNK_PROTOCOL);
            if (message?.type === "response" && (typeof message.id !== "string" || typeof message.ok !== "boolean"))
              throw new Error("invalid response");
            lastReceive = now(); receiveSerial++;
            if (state === "open" && !stable && now() - openedAt >= stableInterval) {
              stable = true; failures = protectionFailures = 0; diagnostic("connection_stable");
            }
            if (state === "restoring") restoreProgress();
            clearTimer(frameTimer); frameTimer = undefined;
            if (receiver.pending) {
              frameStarted ??= now();
              frameTimer = setTimer(() => end(failure("chunk_timeout", "消息传输长时间无进展或超过总期限")),
                Math.min(chunkIdleTimeout, Math.max(0, chunkTotalTimeout - (now() - frameStarted))));
            } else frameStarted = null;
            if (!message) return;
            if (message.type === "response") {
              const entry = pending.get(message.id);
              if (!entry) return;
              lastResponse = now();
              if (message.ok && ["service.status", "connection.ping"].includes(entry.command) &&
                  typeof message.data?.connectionId === "string" && /^[a-f0-9-]{36}$/.test(message.data.connectionId)) {
                connectionId = message.data.connectionId; diagnostic("connection_identified");
              }
              if (message.ok && message.id === snapshotRequest && SNAPSHOT_COMMANDS.has(entry.command)) beginSnapshot();
              settle(message.id, message.ok ? null : failure("response_error", message.error), message.data);
            } else receive(message);
          } catch { recover("invalid_message"); }
        };
        ws.onclose = (event = {}) => {
          if (!isCurrent()) return;
          diagnostic("socket_closed", { closeCode: Number.isInteger(event.code) ? event.code : 0, wasClean: event.wasClean === true });
          end(failure("disconnected", "连接断开"), { normal: event.code === 1000, limited: event.code === 1009 });
        };
      });
      if (!isCurrent()) return;
      status("restoring"); restoreProgress();
      await initialize({ isCurrent: () => isCurrent() && socket?.readyState === 1 });
      if (!isCurrent() || !socket) return;
      clearTimer(restoreTimer); restoreTimer = undefined;
      openedAt = now();
      status("open"); diagnostic("connection_open"); scheduleHeartbeat();
    })();
    const attempt = Promise.race([run, lifetime]).catch(error => {
      if (isCurrent()) { diagnostic("restore_failed"); end(error); }
      throw error;
    }).finally(() => { if (opening === attempt) opening = undefined; });
    opening = attempt;
    return attempt;
  }
  function scheduleReconnect() {
    if (disposed || state === "limited" || timer != null) return;
    if (++failures > maxNetworkRetries) {
      status("waiting"); diagnostic("network_retry_limit"); return;
    }
    timer = setTimer(() => {
      timer = undefined;
      void connect({ retry: true }).catch(() => {});
    }, Math.min(1000 * 2 ** (failures - 1), 30000));
  }
  function resume() {
    // Data safety stops and intentional closure cannot be bypassed by wake/online events.
    if (disposed || ["limited", "closed"].includes(state)) return Promise.resolve();
    if (state === "open") return checkHealth();
    if (opening || now() - lastResume < resumeCooldown) return opening?.catch(() => {}) || Promise.resolve();
    lastResume = now();
    if (state === "waiting") failures = 0; // A new visible/network event opens one bounded retry window.
    return connect({ retry: true }).catch(() => {});
  }
  return {
    connect, resume, request, receive, beginSnapshot, commitSnapshot,
    failSnapshot: (cause) => recover("snapshot_failed", cause),
    getConnectionState: () => state,
    getDiagnostics: () => ({ state, pending: pending.size, queued: gate?.length || 0, queuedBytes, failures, protectionFailures, generation,
      protocol: socket?.protocol === CHUNK_PROTOCOL ? CHUNK_PROTOCOL : "axiom" }),
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
      endConnection?.(failure("disposed", "连接已销毁"), { normal: true });
      disposed = true;
      ++generation;
      clearConnectionTimers();
      clearTimer(timer);
      timer = undefined;
      disconnectPending(); clearGate(); watermarks.clear();
      for (const entry of listeners) entry.controller.abort();
      listeners.clear();
      releaseSerializer();
      socket?.close(1000, "disposed"); socket = undefined;
      status("disposed");
    },
  };
}
