// 守护进程维护状态：SQLite 持久化（与业务共用 AXIOM_HOME/axiom.db，namespace=maint，key 按安装实例隔离）
// + 真实阶段事件 + 有界脱敏证据日志。数据库为权威：daemon 重启后续接最近一次操作结果
// （operation/status/error/startedAt）跨重启保留，running → interrupted；phases/log 是当前操作的
// 窗口，begin() 时清空隔离。首次启动（库中无本实例条目）幂等导入旧 service-state JSON：
// 只读一次、保留源文件不删不写，随后条目已入库，旧 JSON 永不再读。
import { readFile } from "node:fs/promises";

const NAMESPACE = "maint";
const LOG_LIMIT = 16 * 1024, PHASE_LIMIT = 200;

// 有界脱敏：redactions 为 [原文, 替换] 对（长前缀优先），另打码鉴权头；证据够排障，凭证与路径不外泄。
export function sanitize(text, redactions = []) {
  let out = String(text ?? "");
  const pairs = [...redactions].sort((a, b) => String(b[0]).length - String(a[0]).length);
  for (const [secret, replacement] of pairs) if (secret) out = out.split(secret).join(replacement);
  out = out.replace(/(authorization|bearer)\s*[:=]?\s*["']?[^\s"',;]{8,}/gi, "$1 ***");
  return out.length > LOG_LIMIT ? out.slice(-LOG_LIMIT) : out;
}

// database 由调用方创建并负责生命周期（守护进程所有退出路径先 flush 再 close）。
export async function createMaintState({ database, key, legacyFile, redactions = [], now = Date.now }) {
  let data = {
    pid: process.pid, instanceId: null, version: null, ready: false,
    operation: null, operationId: null, status: "idle", phase: "boot",
    phases: [], startedAt: null, updatedAt: null, error: null, log: "",
  };
  // 恢复统一入口：结果字段全保留（读入即脱敏），只重置当前 worker 字段，
  // running 改判 interrupted（无保存原因时补固定说明），并追加本次 boot 阶段。
  const restore = (saved) => {
    const running = saved.status === "running";
    data = {
      ...data, ...saved,
      pid: process.pid, instanceId: null, version: null, ready: false,
      status: running ? "interrupted" : saved.status ?? "idle",
      error: running
        ? (saved.error ? sanitize(saved.error, redactions) : "守护进程重启时维护操作中断")
        : saved.error ? sanitize(saved.error, redactions) : null,
      log: sanitize(saved.log ?? "", redactions),
      phase: "boot",
      phases: [...saved.phases ?? [], { phase: "boot", at: now() }],
    };
  };
  const stored = database.get(NAMESPACE, key);
  if (stored !== undefined) restore(stored);
  else {
    let saved = null;
    try { saved = JSON.parse(await readFile(legacyFile, "utf8")); }
    catch (error) {
      if (error.code !== "ENOENT") console.error(`维护状态文件读取失败，按全新状态处理：${error.message}`);
    }
    if (saved) restore(saved);
  }
  // SQLite 写入同步且原子（语句级 UPSERT）；启动即落库一次，此后条目存在 = 迁移完成的幂等闸门。
  let timer = null;
  const persist = () => {
    data.updatedAt = now();
    try {
      database.set(NAMESPACE, key, data);
      delete data.persistenceError;
    } catch (error) {
      // 落库失败必须可见（service.log 可查），绝不静默假装成功。
      data.persistenceError = "维护记录未能保存；当前结果仅在内存中，重启后可能丢失";
      console.error(`维护状态落盘失败：${error.message}`);
    }
    return Promise.resolve();
  };
  const debounced = () => { clearTimeout(timer); timer = setTimeout(() => persist(), 500); };
  persist();
  return {
    data,
    // 退出/清理前调用：冲掉防抖中的日志追加，随后由调用方关闭数据库连接再退出进程。
    flush() { clearTimeout(timer); return persist(); },
    phase(name) {
      data.phase = name;
      data.phases.push({ phase: name, at: now() });
      if (data.phases.length > PHASE_LIMIT) data.phases.splice(0, data.phases.length - PHASE_LIMIT);
      return persist();
    },
    begin(operationId, operation) {
      // 新操作与上一次彻底隔离：阶段时间线与证据窗口清空，结果字段覆盖为 running。
      Object.assign(data, {
        operation, operationId, status: "running", startedAt: now(), error: null,
        phases: [], log: "",
      });
      return persist();
    },
    setWorker(instanceId) { Object.assign(data, { instanceId, ready: false, version: null }); },
    workerReady(instanceId, version) {
      if (data.instanceId !== instanceId) return Promise.resolve();
      data.ready = true;
      data.version = typeof version === "string" ? version : null;
      data.phase = "ready";
      data.phases.push({ phase: "ready", at: now() });
      return persist();
    },
    appendLog(text) { data.log = sanitize(data.log + text, redactions); debounced(); },
    succeed() { data.status = "succeeded"; return persist(); },
    fail(error) {
      data.status = "failed";
      data.error = sanitize(String(error?.message ?? error), redactions);
      return persist();
    },
  };
}
