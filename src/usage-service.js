import { readSessionManager } from "./session-history.js";
import { backfillEntries } from "./usage-backfill.js";
import { UsageStore } from "./usage-store.js";
import { RequestGate, validateLimits } from "./request-gate.js";

// 只有 worker 持有此对象和数据库连接，客户端不直接写 SQLite。
export class UsageService {
  constructor(database) {
    this.database = database;
    this.store = new UsageStore(database);
    this.enabledAt = database.get("usage", "enabledAt") ?? Date.now();
    database.set("usage", "enabledAt", this.enabledAt);
    let limits = {};
    try { limits = validateLimits(database.get("usage", "limits") ?? {}); }
    catch { console.warn("用量限流配置无效，暂不限流"); }
    this.gate = new RequestGate({ limits });
  }
  configure(limits) {
    const clean = validateLimits(limits);
    this.database.set("usage", "limits", clean);
    this.gate.configure(clean);
    this.store.recordGateEvent({ type: "config_change", detail: clean });
    return { limits: clean };
  }
  view({ sessionId, provider, status, before, beforeId, limit } = {}) {
    const billing = sessionId ? this.store.billingBySession(sessionId) : this.store.billingGlobal();
    return { limits: this.gate.limits, gate: this.gate.snapshot(),
      billing: provider ? billing.filter(row => row.provider === provider) : billing,
      requests: this.store.listRequests({ sessionId, provider, status, before, beforeId, limit }),
      enabledAt: this.enabledAt, auditFailures: this.auditFailures ?? 0,
      events: this.store.recentGateEvents() };
  }
  backfill() {
    const totals = { imported: 0, deduped: 0, skipped: 0, missing: 0 };
    const sessions = this.database.prepare("SELECT id, session_file FROM sessions ORDER BY created_at, id").all();
    for (const session of sessions) {
      const files = [{ sessionFile: session.session_file, agentId: "main" }];
      for (const task of this.database.prepare("SELECT id, record FROM tasks WHERE session_id = ?").all(session.id)) {
        try { files.push({ sessionFile: JSON.parse(task.record).sessionFile, agentId: task.id }); } catch { totals.missing++; }
      }
      for (const file of files) {
        if (!file.sessionFile) { totals.missing++; continue; }
        try {
          const entries = readSessionManager(file.sessionFile)?.getEntries();
          if (!entries) { totals.missing++; continue; }
          const result = backfillEntries(this.store, entries, { enabledAt: this.enabledAt, sessionId: session.id, agentId: file.agentId });
          for (const key of ["imported", "deduped", "skipped"]) totals[key] += result[key];
        } catch { totals.missing++; }
      }
    }
    this.database.set("usage", "lastBackfill", { ...totals, at: Date.now() });
    return totals;
  }
  close() { this.gate.close(); }
}
