import { app, BrowserWindow, dialog, shell } from "electron";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { createBackendLifecycle } from "./backend-lifecycle.mjs";

const root = app.isPackaged ? process.resourcesPath : fileURLToPath(new URL("../.desktop-stage/", import.meta.url));
const dataRoot = resolve(process.env.AXIOM_HOME || join(homedir(), ".axiom"));
app.setPath("userData", join(dataRoot, "desktop"));
let window, backend, quitting = false, asking = false;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { window?.show(); window?.focus(); });
  app.on("before-quit", (event) => {
    if (quitting || !backend) return;
    event.preventDefault();
    void quitSafely();
  });
  void app.whenReady().then(async () => {
  backend = createBackendLifecycle({ bundleRoot: root, bundleVersion: app.getVersion(), dataRoot,
    cwd: resolve(process.env.AXIOM_CWD || homedir()),
    nodePath: join(root, "runtime", process.platform === "win32" ? "node.exe" : "node"),
    onShutdown: () => { void quitSafely(); },
    onCrash: ({ exitCode }) => {
      dialog.showErrorBox("Axiom 后端已退出", `后端异常退出（${exitCode ?? "信号终止"}），当前任务的保存结果未确认。请退出应用后重新打开；不会自动重放任务或安装更新。`);
    } });
  try {
    const ready = await backend.startBackend();
    window = new BrowserWindow({ width: 1440, height: 900, title: "Axiom",
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url) && !url.startsWith(ready.url + "/")) void shell.openExternal(url);
      return { action: "deny" };
    });
    window.webContents.on("will-navigate", (event, url) => {
      if (new URL(url).origin !== ready.url) event.preventDefault();
    });
    window.on("close", (event) => { if (!quitting) { event.preventDefault(); void quitSafely(); } });
    await window.loadURL(ready.url);
    // 仅显式测试模式自动退出；调用方必须使用隔离数据目录。
    if (process.env.AXIOM_DESKTOP_SMOKE === "1") {
      if (!await window.webContents.executeJavaScript('document.readyState === "complete"'))
        throw new Error("窗口尚未加载完成");
      await backend.requestStop({ mode: "cancel" });
      quitting = true;
      app.quit();
    }
  } catch (error) {
    if (process.env.AXIOM_DESKTOP_SMOKE === "1") {
      console.error(error);
      try { await backend.requestStop({ mode: "cancel" }); } catch {}
      quitting = true;
      app.exit(1);
    } else dialog.showErrorBox("Axiom 启动失败", error.message);
    // 不强杀；用户可通过同一退出路径明确取消并等待保存。
    await quitSafely();
  }
  });
}
async function quitSafely() {
  if (asking || quitting) return;
  asking = true;
  try {
    // 只允许已无子进程时关闭桌面；不把失败态或超时当作安全停止。
    if (!backend.getBackendState().processPresent) {
      quitting = true;
      app.quit();
      return;
    }
    const { response } = await dialog.showMessageBox({ type: "question", title: "退出 Axiom",
      message: "退出前必须等待后端保存完成。", detail: "可等待任务完成，或明确取消任务后保存退出。超时不会强杀进程。",
      buttons: ["返回应用", "等待任务并退出", "取消任务并退出"], defaultId: 0, cancelId: 0 });
    if (!response) return;
    await backend.requestStop({ mode: response === 2 ? "cancel" : "wait", reason: "quit" });
    quitting = true;
    app.quit();
  } catch (error) {
    dialog.showErrorBox("尚未安全退出", error.message);
    if (!backend.getBackendState().processPresent) {
      quitting = true;
      app.quit();
    }
  }
  finally { asking = false; }
}
