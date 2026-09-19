// 进程内共享调度器。并发按逻辑请求计，RPM 按 fetch 尝试计；两条 FIFO 互不持锁等待。
// 租约与排队都有上限：故障只降低限流精度，不能把模型请求永久卡住。
export function validateLimits(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("限流配置必须是对象");
  const result = {};
  for (const [provider, limits] of Object.entries(value)) {
    if (!provider.trim() || provider.length > 200 || !limits || typeof limits !== "object" || Array.isArray(limits)) throw new Error("供应商限流配置无效");
    const clean = {};
    for (const key of Object.keys(limits)) {
      if (!["rpm", "concurrency"].includes(key)) throw new Error(`未知限流字段：${key}`);
      if (!Number.isSafeInteger(limits[key]) || limits[key] < 0 || limits[key] > 100000) throw new Error("RPM 与并发数必须是 0–100000 的整数（0 表示不限）");
      clean[key] = limits[key];
    }
    result[provider] = clean;
  }
  return result;
}

export class RequestGate {
  #limits = {};
  #states = new Map();
  #now;
  #timer;
  #closed = false;
  #ttl;
  #maxWait;
  #window;
  constructor({ limits = {}, now = Date.now, leaseMs = 120000, maxWaitMs = 120000, windowMs = 60000, tickMs = 100 } = {}) {
    this.#now = now;
    this.#ttl = leaseMs;
    this.#maxWait = maxWaitMs;
    this.#window = windowMs;
    this.configure(limits);
    this.#timer = setInterval(() => this.sweep(), tickMs);
    this.#timer.unref?.();
  }
  configure(limits) { this.#limits = validateLimits(limits); this.sweep(); }
  get limits() { return structuredClone(this.#limits); }
  #state(provider) {
    if (!this.#states.has(provider)) this.#states.set(provider, { leases: new Map(), attempts: [], concurrency: [], rpm: [], cooldownUntil: 0, bypassed: 0 });
    return this.#states.get(provider);
  }
  acquire(provider, { kind = "concurrency", signal } = {}) {
    if (!["concurrency", "rpm"].includes(kind)) return Promise.reject(new Error("未知闸门类型"));
    if (signal?.aborted) return Promise.reject(signal.reason ?? new Error("请求已取消"));
    if (this.#closed || !this.#limits[provider]?.[kind]) return Promise.resolve({ release() {}, waitMs: 0, bypassed: this.#closed });
    const state = this.#state(provider);
    return new Promise((resolve, reject) => {
      const entry = { at: this.#now(), resolve, reject, signal, abort: null };
      entry.abort = () => {
        const index = state[kind].indexOf(entry);
        if (index >= 0) state[kind].splice(index, 1);
        signal?.removeEventListener("abort", entry.abort);
        reject(signal.reason ?? new Error("请求已取消"));
      };
      signal?.addEventListener("abort", entry.abort, { once: true });
      state[kind].push(entry);
      this.sweep();
    });
  }
  sweep() {
    const now = this.#now();
    for (const [provider, state] of this.#states) {
      for (const [key, expires] of state.leases) if (expires <= now) state.leases.delete(key);
      state.attempts = state.attempts.filter(at => at > now - this.#window);
      for (const kind of ["concurrency", "rpm"]) {
        const queue = state[kind];
        while (queue.length) {
          const entry = queue[0];
          const limit = this.#limits[provider]?.[kind] ?? 0;
          const bypassed = this.#closed || now - entry.at >= this.#maxWait;
          const occupied = kind === "concurrency" ? state.leases.size : state.attempts.length;
          if (!bypassed && limit && (occupied >= limit || (kind === "rpm" && state.cooldownUntil > now))) break;
          queue.shift();
          entry.signal?.removeEventListener("abort", entry.abort);
          const token = Symbol();
          if (bypassed) state.bypassed++;
          else if (limit) {
            if (kind === "concurrency") state.leases.set(token, now + this.#ttl);
            else state.attempts.push(now);
          }
          let released = false;
          entry.resolve({ waitMs: Math.max(0, now - entry.at), bypassed, queueDepth: queue.length,
            release: () => { if (released) return; released = true; state.leases.delete(token); this.sweep(); } });
        }
      }
    }
  }
  cooldown(provider, durationMs) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return;
    const state = this.#state(provider);
    state.cooldownUntil = Math.max(state.cooldownUntil, this.#now() + Math.min(durationMs, this.#maxWait));
  }
  snapshot() {
    this.sweep();
    const now = this.#now();
    return [...new Set([...Object.keys(this.#limits), ...this.#states.keys()])].map(provider => {
      const state = this.#state(provider);
      return { provider, ...this.#limits[provider], active: state.leases.size, attempts: state.attempts.length,
        concurrencyQueue: state.concurrency.length, rpmQueue: state.rpm.length,
        oldestWaitMs: Math.max(0, ...[...state.concurrency, ...state.rpm].map(entry => now - entry.at)),
        cooldownMs: Math.max(0, state.cooldownUntil - now), bypassed: state.bypassed };
    });
  }
  close() { this.#closed = true; clearInterval(this.#timer); this.sweep(); }
}

export function retryAfterMs(value, now = Date.now()) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}
