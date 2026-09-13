// 两进程并发测试的对手端（唯一 helper）：本文件身兼两角——
//  - 被测试 import：导出 runOpponent()（spawn 子进程 + 行协议屏障）；
//  - 被直接执行（node 本文件 '<json>'）：作为对手进程，停在 "ready"/"go" 屏障后执行一次写操作。
// 协议：stdout 每行一个 JSON；先发 {"ready":true}，收到 stdin "go" 后执行 op，回发
// {"ok":true,value}|{"ok":false,message} 后退出。屏障保证两进程的读-改-写同时起跑。
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { Database } from "../../src/database.js";
import { createPiModelStorage } from "../../src/pi-model-storage.js";
import { createModelsService } from "../../src/model-config.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 对手进程的一次写操作：与被测进程完全对称的真实 API 调用（不走任何测试后门）。
async function perform({ dir, op }) {
  const database = new Database(join(dir, "axiom.db"));
  const storage = createPiModelStorage({ database, home: dir, piDir: join(dir, "pi") });
  const models = createModelsService({ factory: { catalog: () => [] }, storage });
  try {
    if (op === "config") {
      const view = await models.handle({ type: "models.config.get" });
      return models.saveProvider({ providerId: "p", provider: { name: "from-child" }, baseFingerprint: view.fingerprint });
    }
    if (op === "favorites") return models.setFavorite({ kind: "model", key: "child/model", favorite: true });
    if (op === "credentials") {
      return storage.credentials.modify("p", async (current) => {
        await sleep(20); // 拉宽异步窗口：模拟 OAuth 刷新等真实跨事件循环写
        return { type: "api_key", key: "sk-child", prev: current?.key ?? null };
      });
    }
    throw new Error(`未知 op：${op}`);
  } finally {
    database.close();
  }
}

// 父测试侧封装：ready() 等对手就绪并放行；result() 取其写操作结果；exit() 等进程退出。
export function runOpponent(payload) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), JSON.stringify(payload)], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  const pending = [];
  const waiters = [];
  createInterface({ input: child.stdout }).on("line", (line) => {
    const parsed = JSON.parse(line);
    const waiter = waiters.shift();
    if (waiter) waiter(parsed);
    else pending.push(parsed);
  });
  const nextLine = () =>
    pending.length ? Promise.resolve(pending.shift()) : new Promise((resolve) => waiters.push(resolve));
  const exited = new Promise((resolve) => child.on("exit", resolve));
  return {
    async ready() {
      await nextLine(); // {"ready":true}
      child.stdin.write("go\n");
    },
    result: nextLine,
    exit: () => exited,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.stdout.write(`${JSON.stringify({ ready: true })}\n`);
  createInterface({ input: process.stdin }).on("line", (line) => {
    if (line.trim() !== "go") return;
    perform(JSON.parse(process.argv[2]))
      .then((value) => process.stdout.write(`${JSON.stringify({ ok: true, value })}\n`))
      .catch((error) => process.stdout.write(`${JSON.stringify({ ok: false, message: error?.message ?? String(error) })}\n`))
      .finally(() => process.exit(0));
  });
}
