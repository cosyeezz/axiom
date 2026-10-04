import { randomUUID } from "node:crypto";
import { CHUNK_PROTOCOL, CHUNK_TYPE, CHUNK_BYTES, FRAME_BYTES, MESSAGE_BYTES } from "../public/transport-framing.js";

// FIFO is per connection and follows send/broadcast call order, not request completion order.
export function createSender({ maxBytes = 32 * 1024 * 1024, maxMessageBytes = MESSAGE_BYTES,
  maxQueueBytes = 256 * 1024 * 1024, maxQueueMessages = 4096,
  highWaterBytes = 2 * 1024 * 1024, stallTimeout = 30000,
  setTimer = setTimeout, clearTimer = clearTimeout, defer = setImmediate, now = Date.now,
  report = (entry) => console.warn("[transport]", entry) } = {}) {
  const stopped = new WeakSet(), states = new WeakMap();
  const stateFor = ws => {
    let state = states.get(ws);
    if (state) return state;
    state = { connectionId: randomUUID(), queue: [], bytes: 0, sending: false, scheduled: false,
      next: 0, lastProgress: now(), watchdog: null, retry: null };
    states.set(ws, state);
    ws.once?.("close", (code) => {
      diagnostic("socket_closed", ws, { closeCode: Number.isInteger(code) ? code : 0 });
      stopped.add(ws); clear(ws);
    });
    return state;
  };
  const diagnostic = (code, ws, fields = {}) => {
    const state = stateFor(ws);
    try { report({ code, at: now(), connectionId: state.connectionId, protocol: ws.protocol === CHUNK_PROTOCOL ? CHUNK_PROTOCOL : "axiom",
      queued: state.queue.length, queuedBytes: state.bytes, bufferedAmount: ws.bufferedAmount || 0, ...fields }); }
    catch { console.warn("[transport] diagnostic callback failed"); }
  };
  const clear = ws => {
    const state = states.get(ws);
    if (!state) return;
    clearTimer(state.watchdog); clearTimer(state.retry);
    state.watchdog = state.retry = null;
    state.queue.length = 0; state.bytes = 0; state.sending = false;
  };
  const stop = (ws, code, fields = {}) => {
    if (stopped.has(ws)) return;
    stopped.add(ws);
    diagnostic(code, ws, fields); clear(ws);
    try {
      if (code === "message_limit") ws.close(1009, "message exceeds transport limit");
      else ws.terminate();
    } catch { diagnostic("close_failed", ws); }
  };
  const schedule = ws => {
    const state = stateFor(ws);
    if (state.scheduled || stopped.has(ws)) return;
    state.scheduled = true;
    defer(() => { state.scheduled = false; pump(ws); });
  };
  const watch = ws => {
    const state = stateFor(ws);
    if (state.watchdog != null || !state.queue.length || stopped.has(ws)) return;
    state.watchdog = setTimer(() => {
      state.watchdog = null;
      if (now() - state.lastProgress >= stallTimeout) stop(ws, "send_stalled");
      else watch(ws);
    }, Math.max(1, stallTimeout - (now() - state.lastProgress)));
    state.watchdog?.unref?.();
  };
  function pump(ws) {
    const state = stateFor(ws);
    if (stopped.has(ws)) return;
    if (ws.readyState !== 1) { stopped.add(ws); clear(ws); return; }
    if (state.sending || !state.queue.length) return;
    if ((ws.bufferedAmount || 0) > highWaterBytes) {
      if (state.retry == null) {
        state.retry = setTimer(() => { state.retry = null; pump(ws); }, 25);
        state.retry?.unref?.();
      }
      return;
    }
    const entry = state.queue[0];
    let raw = entry.raw, final = true;
    if (entry.bytes > CHUNK_BYTES) {
      entry.buffer ??= Buffer.from(entry.raw);
      let end = Math.min(entry.offset + CHUNK_BYTES, entry.buffer.length);
      if (end < entry.buffer.length) while ((entry.buffer[end] & 0xc0) === 0x80) end--;
      final = end === entry.buffer.length;
      raw = JSON.stringify({ type: CHUNK_TYPE, v: 1, id: entry.id, index: entry.index++,
        totalBytes: entry.bytes, final, data: entry.buffer.toString("utf8", entry.offset, end) });
      entry.offset = end;
    }
    if (Buffer.byteLength(raw) > FRAME_BYTES) { stop(ws, "frame_limit"); return; }
    state.sending = true;
    let called = false;
    try {
      ws.send(raw, error => {
        if (called || stopped.has(ws)) return;
        called = true; state.sending = false;
        if (error) { stop(ws, "send_failed", { bytes: entry.bytes }); return; }
        state.lastProgress = now();
        if (final) { state.queue.shift(); state.bytes -= entry.bytes; }
        if (!state.queue.length) { clearTimer(state.watchdog); state.watchdog = null; }
        else schedule(ws); // Even synchronous test callbacks must not recurse for large payloads.
      });
    } catch { stop(ws, "send_failed", { bytes: entry.bytes }); }
  }
  const sendRaw = (ws, raw, bytes, messageType) => {
    if (ws.readyState !== 1 || stopped.has(ws)) return false;
    const state = stateFor(ws);
    if (ws.protocol !== CHUNK_PROTOCOL) {
      if (bytes > maxBytes) { stop(ws, "message_limit", { bytes, messageType }); return false; }
      if ((ws.bufferedAmount || 0) + bytes > maxBytes) { stop(ws, "buffer_limit", { bytes, messageType }); return false; }
      try {
        ws.send(raw, error => { if (error) stop(ws, "send_failed", { bytes, messageType }); });
        return true;
      } catch { stop(ws, "send_failed", { bytes, messageType }); return false; }
    }
    if (bytes > maxMessageBytes) { stop(ws, "message_limit", { bytes, messageType }); return false; }
    if (state.bytes + bytes > maxQueueBytes || state.queue.length >= maxQueueMessages) {
      stop(ws, "queue_limit", { bytes, messageType }); return false;
    }
    if (!state.queue.length) state.lastProgress = now();
    state.queue.push({ raw, bytes, id: String(++state.next), index: 0, offset: 0 });
    state.bytes += bytes;
    watch(ws); pump(ws);
    return true; // Accepted, not delivered. No command replay or end-to-end ACK is implied.
  };
  const encode = message => {
    const raw = JSON.stringify(message);
    return { raw, bytes: Buffer.byteLength(raw), messageType:
      /^(response|session\.[a-z.]+|agent\.[a-z.]+|task\.[a-z.]+|models\.[a-z.]+)$/.test(message?.type) ? message.type : "other" };
  };
  return {
    register(ws) { const state = stateFor(ws); diagnostic("connection_open", ws); return state.connectionId; },
    send(ws, message) {
      let encoded;
      try { encoded = encode(message); } catch { stop(ws, "serialize_failed"); return false; }
      return sendRaw(ws, encoded.raw, encoded.bytes, encoded.messageType);
    },
    broadcast(clients, message, except) {
      let encoded;
      try { encoded = encode(message); }
      catch { for (const ws of clients) if (ws !== except && ws.readyState === 1) stop(ws, "serialize_failed"); return; }
      for (const ws of clients) if (ws !== except) sendRaw(ws, encoded.raw, encoded.bytes, encoded.messageType);
    },
  };
}
