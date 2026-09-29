// Worker 只读代理守护状态：地址和凭证来自本机启动配置，不接受客户端 URL/路径。
const STATUSES = new Set(["idle", "running", "succeeded", "failed", "interrupted"]);
export const OPERATION_ERROR = "维护状态暂时无法读取，操作结果尚未确认，请稍后重试。";

export async function readServiceOperation(maintenance, { fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  try {
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(maintenance?.url || "") ||
        typeof maintenance.token !== "string" || !maintenance.token) throw new Error();
    const response = await fetchImpl(`${maintenance.url}/status`, {
      method: "GET", cache: "no-store", redirect: "error",
      headers: { authorization: `Bearer ${maintenance.token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error();
    const state = await response.json();
    if (!state || !STATUSES.has(state.status) || typeof state.ready !== "boolean" ||
        ![null, "quick", "rebuild", "update"].includes(state.operation) ||
        !(state.operationId === null || typeof state.operationId === "string") ||
        !Array.isArray(state.phases) || state.phases.some(item =>
          !item || typeof item.phase !== "string" || !Number.isFinite(item.at))) throw new Error();
    // 显式投影，防止未来维护端点附加私有配置时随快照外泄；日志在守护侧已脱敏。
    const record = {
      ready: state.ready, operation: state.operation, operationId: state.operationId,
      status: state.status, phases: state.phases.slice(-200).map(({ phase, at }) => ({ phase, at })),
    };
    for (const key of ["instanceId", "version", "phase", "error", "log", "persistenceError"])
      if (typeof state[key] === "string" || state[key] === null) record[key] = state[key];
    for (const key of ["pid", "startedAt", "updatedAt"])
      if (Number.isFinite(state[key]) || state[key] === null) record[key] = state[key];
    return record;
  } catch {
    // 不透传可能含本机地址、路径或凭证的底层异常，也不伪造 idle/成功快照。
    throw new Error(OPERATION_ERROR);
  }
}
