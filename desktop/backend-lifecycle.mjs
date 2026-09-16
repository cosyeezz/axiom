import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { isAbsolute, join, resolve } from "node:path";

// 桌面只直接管理 worker；禁止回退 PATH Node 或再启动旧 supervisor。
export function createBackendLifecycle({ bundleRoot, bundleVersion, dataRoot, cwd = process.cwd(),
  nodePath, onShutdown = () => {}, spawn = fork, timeout = 60_000, setTimer = setTimeout, clearTimer = clearTimeout }) {
  if (!isAbsolute(bundleRoot) || !isAbsolute(nodePath)) throw new Error("安装目录和随包 Node 必须是绝对路径");
  dataRoot = resolve(cwd, dataRoot);
  let child, startWork, stopWork, ready, state = "stopped";
  let rejectStart, rejectStop, resolveStop, startTimer, stopTimer;
  const failStart = (error) => {
    clearTimer(startTimer);
    state = "failed";
    rejectStart?.(error);
  };
  return {
    getBackendState: () => ({ state, ...(ready || {}) }),
    startBackend() {
      if (child) return ["starting", "ready"].includes(state) ? startWork
        : Promise.reject(new Error("后端尚未确认停止，不能重新启动"));
      ready = undefined;
      state = "starting";
      const token = randomUUID(), instanceId = randomUUID();
      startWork = new Promise((resolveStart, reject) => {
        rejectStart = reject;
        try {
          child = spawn(join(bundleRoot, "app", "src", "main.js"), [], {
            execPath: nodePath, cwd,
            env: { ...process.env, AXIOM_HOME: dataRoot, AXIOM_CWD: cwd,
              AXIOM_INSTANCE_ID: instanceId, AXIOM_START_TOKEN: token,
              AXIOM_BUNDLE_VERSION: bundleVersion, AXIOM_DESKTOP: "1", AXIOM_DEV: "0" },
            stdio: ["ignore", "inherit", "inherit", "ipc"],
          });
          startTimer = setTimer(() => failStart(new Error("后端启动超时；进程未确认退出，禁止再次启动")), timeout);
          child.on("message", (message) => {
            if (message?.type === "service.shutdown") { onShutdown(); return; }
            if (message?.type === "service.restart") {
              child.send({ type: "service.rejected", requestId: message.requestId,
                error: "桌面版不使用 npm 重启或更新；请退出应用后重新启动或安装完整新版本" }, () => {});
              return;
            }
            if (message?.type !== "service.ready" || state !== "starting") return;
            if (message.token !== token || message.instanceId !== instanceId ||
                message.bundleVersion !== bundleVersion || message.pid !== child.pid ||
                message.protocol !== 1 || !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(message.url || "") ||
                Number(message.url.split(":").at(-1)) > 65535) return;
            clearTimer(startTimer);
            ready = { ready: true, instanceId, bundleVersion, url: message.url };
            state = "ready";
            resolveStart(ready);
          });
          child.on("error", failStart);
          child.once("exit", (code) => {
            clearTimer(startTimer);
            clearTimer(stopTimer);
            child = undefined;
            ready = undefined;
            if (state === "starting") reject(new Error("后端在就绪前退出"));
            const clean = state === "stopping" && code === 0;
            state = clean ? "stopped" : "failed";
            if (clean) resolveStop?.({ stopped: true, exitCode: code });
            else rejectStop?.(new Error("后端未确认安全退出"));
            stopWork = undefined;
          });
        } catch (error) { failStart(error); }
      });
      return startWork;
    },
    requestStop({ mode = "wait", reason = "quit" } = {}) {
      if (!["wait", "cancel"].includes(mode) || !["quit", "update", "dev"].includes(reason))
        return Promise.reject(new Error("无效的退出请求"));
      if (stopWork) {
        if (mode === "cancel") child?.send({ type: "service.stop", mode, reason }, (error) => {
          if (error) rejectStop?.(error);
        });
        return stopWork;
      }
      if (!child) return state === "stopped" ? Promise.resolve({ stopped: true, exitCode: 0 })
        : Promise.reject(new Error("后端异常退出，不能视为保存成功"));
      clearTimer(startTimer);
      if (state === "starting") rejectStart(new Error("启动已被退出请求中止"));
      state = "stopping";
      ready = undefined;
      stopWork = new Promise((resolve, reject) => {
        resolveStop = resolve; rejectStop = reject;
        stopTimer = setTimer(() => {
          state = "failed";
          stopWork = undefined;
          reject(new Error("等待安全退出超时；不会强杀或替换安装目录"));
        }, timeout);
        child.send({ type: "service.stop", mode, reason }, (error) => {
          if (!error) return;
          clearTimer(stopTimer); state = "failed"; stopWork = undefined; reject(error);
        });
      });
      return stopWork;
    },
  };
}
