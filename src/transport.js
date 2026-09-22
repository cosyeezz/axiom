// Direct FIFO sends: no application queue, priorities cannot overtake session events.
export function createSender({ maxBytes = 32 * 1024 * 1024,
  report = (entry) => console.warn("[transport]", entry) } = {}) {
  const stopped = new WeakSet();
  const reportSafe = (code, ws, bytes) => {
    try { report({ code, bytes, bufferedAmount: ws.bufferedAmount || 0 }); }
    catch { console.warn("[transport] diagnostic callback failed"); }
  };
  const stop = (ws, code, bytes) => {
    if (stopped.has(ws)) return;
    stopped.add(ws);
    reportSafe(code, ws, bytes);
    try {
      // Oversize snapshots cannot recover by downloading the same snapshot repeatedly.
      if (code === "message_limit") ws.close(1009, "snapshot exceeds transport limit");
      else ws.terminate();
    } catch { reportSafe("close_failed", ws, bytes); }
  };
  const sendRaw = (ws, raw, bytes) => {
    if (ws.readyState !== 1 || stopped.has(ws)) return false;
    bytes ??= Buffer.byteLength(raw);
    if (bytes > maxBytes) { stop(ws, "message_limit", bytes); return false; }
    if ((ws.bufferedAmount || 0) + bytes > maxBytes) { stop(ws, "buffer_limit", bytes); return false; }
    try {
      ws.send(raw, (error) => { if (error) stop(ws, "send_failed", bytes); });
      return true;
    } catch { stop(ws, "send_failed", bytes); return false; }
  };
  return {
    send: (ws, message) => sendRaw(ws, JSON.stringify(message)),
    broadcast(clients, message, except) {
      const raw = JSON.stringify(message), bytes = Buffer.byteLength(raw);
      for (const client of clients) if (client !== except) sendRaw(client, raw, bytes);
    },
  };
}
