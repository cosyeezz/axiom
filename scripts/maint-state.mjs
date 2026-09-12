// 守护进程维护状态：持久化（原子写）+ 真实阶段事件 + 有界脱敏证据日志。
// 状态文件供 daemon 重启后续接：最近一次操作结果（operation/status/error/startedAt）跨重启保留，
// running → interrupted；phases/log 是当前操作的窗口，begin() 时清空隔离。
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const LOG_LIMIT = 16 * 1024, PHASE_LIMIT = 200;

// 有界脱敏：redactions 为 [原文, 替换] 对（长前缀优先），另打码鉴权头；证据够排障，凭证与路径不外泄。
export function sanitize(text, redactions = []) {
  let out = String(text ?? "");
  const pairs = [...redactions].sort((a, b) => String(b[0]).length - String(a[0]).length);
  for (const [secret, replacement] of pairs) if (secret) out = out.split(secret).join(replacement);
  out = out.replace(/(authorization|bearer)\s*[:=]?\s*["']?[^\s"',;]{8,}/gi, "$1 ***");
  return out.length > LOG_LIMIT ? out.slice(-LOG_LIMIT) : out;
}

export async function createMaintState({ file, redactions = [], now = Date.now }) {
  let data = {
    pid: process.pid, instanceId: null, version: null, ready: false,
    operation: null, operationId: null, status: "idle", phase: "boot",
    phases: [], startedAt: null, updatedAt: null, error: null, log: "",
  };
  try {
    const saved = JSON.parse(await readFile(file, "utf8"));
    const running = saved.status === "running";
    // 结果持久：operation/operationId/status/error/startedAt/phases/log 全部保留（读盘即脱敏），
    // 只重置当前 worker 字段，running 改判 interrupted（无保存原因时补固定说明）。
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
  } catch (error) {
    if (error.code !== "ENOENT") console.error(`维护状态文件读取失败，按全新状态处理：${error.message}`);
  }
  let chain = Promise.resolve(), timer = null;
  const persist = () => {
    data.updatedAt = now();
    // 落盘失败必须可见（service.log 可查），绝不静默假装成功；序列化避免乱序覆盖。
    const snapshot = JSON.stringify(data);
    chain = chain
      .then(() => writeFile(`${file}.tmp`, snapshot))
      .then(() => rename(`${file}.tmp`, file))
      .then(() => { delete data.persistenceError; })
      .catch((error) => {
        data.persistenceError = "维护记录未能保存；当前结果仅在内存中，重启后可能丢失";
        console.error(`维护状态落盘失败：${error.message}`);
      });
    return chain;
  };
  // 日志追加频繁：落盘合并到 500ms；阶段/结果变化仍即时落盘。
  const debounced = () => { clearTimeout(timer); timer = setTimeout(() => void persist(), 500); };
  await mkdir(dirname(file), { recursive: true }).catch(() => {});
  await persist();
  return {
    data,
    // 退出/清理前调用：冲掉防抖中的日志追加，避免临时目录先删、落盘后到（ENOENT）。
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
