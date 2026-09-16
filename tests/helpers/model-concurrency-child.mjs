// 独立进程在捕获旧权威后停下；父进程完成写入再放行，不靠延时猜测交错。
import { spawn } from "node:child_process";
import { readSync, writeSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { Database } from "../../src/database.js";
import { createPiModelStorage } from "../../src/pi-model-storage.js";
import { createModelsService } from "../../src/model-config.js";

const barrier = () => {
  writeSync(1, '{"ready":true}\n');
  const byte = Buffer.alloc(1);
  // macOS 的子进程管道可能为非阻塞；只重试 EAGAIN，屏障仍由父进程字节放行。
  const deadline = Date.now() + 10_000;
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  for (;;) {
    try {
      if (readSync(0, byte, 0, 1, null) !== 1) throw new Error("并发测试屏障提前关闭");
      return;
    } catch (error) {
      if (error.code !== "EAGAIN" || Date.now() >= deadline) throw error;
      Atomics.wait(sleeper, 0, 0, 10);
    }
  }
};

export function runOpponent(payload) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), JSON.stringify(payload)], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const ready = Promise.withResolvers();
  const finished = Promise.withResolvers();
  // 清理路径可能只等待close，提前登记处理，避免未消费的拒绝成为全局异常。
  ready.promise.catch(() => {});
  finished.promise.catch(() => {});
  let result, failure;
  child.stderr.resume();
  child.stdin.on("error", () => {});
  createInterface({ input: child.stdout }).on("line", line => {
    try {
      const value = JSON.parse(line);
      if (value.ready === true) ready.resolve();
      else result = value;
    } catch { failure = new Error("并发子进程输出无效"); }
  });
  child.on("error", () => { failure = new Error("并发子进程启动失败"); });
  const closed = new Promise(resolve => child.on("close", code => {
    if (failure || code !== 0 || typeof result?.ok !== "boolean") {
      const error = failure ?? new Error(`并发子进程失败：exit ${code}`);
      ready.reject(error);
      finished.reject(error);
    } else {
      ready.reject(new Error("并发子进程未到屏障便退出"));
      finished.resolve(result);
    }
    resolve();
  }));
  return {
    ready: () => ready.promise,
    release: () => child.stdin.end("g"),
    result: () => finished.promise,
    exit: () => closed,
    async close() { if (child.exitCode === null) child.kill(); await closed; },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { dir, op } = JSON.parse(process.argv[2]);
  const database = new Database(join(dir, "axiom.db"));
  try {
    const storage = createPiModelStorage({ database, home: dir, piDir: join(dir, "pi") });
    const models = createModelsService({ factory: { catalog: () => [] }, storage });
    let value;
    if (op === "credentials") {
      value = await storage.credentials.modify("p", async current => {
        barrier();
        return { type: "api_key", key: "sk-child", prev: current?.key ?? null };
      });
    } else {
      const method = op === "config" ? "casConfig" : "casFavorites";
      const original = storage[method];
      storage[method] = (...args) => { barrier(); return original(...args); };
      value = op === "config"
        ? await models.saveProvider({ providerId: "p", provider: { name: "from-child" }, baseFingerprint: (await models.get()).fingerprint })
        : await models.setFavorite({ kind: "model", key: "child/model", favorite: true });
    }
    writeSync(1, `${JSON.stringify({ ok: true, value })}\n`);
  } catch (error) {
    writeSync(1, `${JSON.stringify({ ok: false, message: error.message })}\n`);
  } finally { database.close(); }
}
