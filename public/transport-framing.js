// Negotiated server-to-client framing only; commands are never replayed or fragmented.
export const CHUNK_PROTOCOL = "axiom.chunk.v1";
export const CHUNK_TYPE = "transport.chunk";
export const CHUNK_BYTES = 64 * 1024;
export const FRAME_BYTES = 512 * 1024; // Includes JSON escaping of the chunk string.
export const MESSAGE_BYTES = 128 * 1024 * 1024;

export function createChunkReceiver({ maxMessageBytes = MESSAGE_BYTES } = {}) {
  let active = null;
  const invalid = () => { active = null; throw new Error("invalid transport frame"); };
  const bytes = text => new Blob([text]).size;
  return {
    clear() { active = null; },
    get pending() { return Boolean(active); },
    accept(message, negotiated) {
      if (message?.type !== CHUNK_TYPE) {
        if (active || !message || typeof message.type !== "string") return invalid();
        return message;
      }
      if (!negotiated || message.v !== 1 || typeof message.id !== "string" ||
          !/^[1-9]\d{0,15}$/.test(message.id) || !Number.isSafeInteger(message.index) || message.index < 0 ||
          !Number.isSafeInteger(message.totalBytes) || message.totalBytes <= 0 || message.totalBytes > maxMessageBytes ||
          typeof message.final !== "boolean" || typeof message.data !== "string" || !message.data.length ||
          bytes(JSON.stringify(message)) > FRAME_BYTES) return invalid();
      const size = bytes(message.data);
      if (size > CHUNK_BYTES) return invalid();
      if (!active) {
        if (message.index !== 0) return invalid();
        active = { id: message.id, total: message.totalBytes, index: 0, size: 0, parts: [] };
      }
      if (message.id !== active.id || message.totalBytes !== active.total || message.index !== active.index ||
          active.index >= Math.ceil(maxMessageBytes / CHUNK_BYTES) + 1 || active.size + size > active.total)
        return invalid();
      // Non-final chunks must be nearly full. Prevent a huge number of tiny allocations.
      if (!message.final && (size < CHUNK_BYTES - 3 || active.size + size >= active.total)) return invalid();
      active.parts.push(message.data); active.size += size; active.index++;
      if (!message.final) return null;
      if (active.size !== active.total) return invalid();
      const raw = active.parts.join("");
      active = null;
      let result;
      try { result = JSON.parse(raw); } catch { return invalid(); }
      if (!result || typeof result.type !== "string" || result.type === CHUNK_TYPE) return invalid();
      return result;
    },
  };
}
