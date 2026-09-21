import { createServer } from "node:net";
import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";

// 内核持有的命名管道/抽象 socket 随进程退出释放，不猜 PID、不删除他人的锁文件。
export async function claimDataRoot(root) { return claimOwner(root, "data"); }
export async function claimArchiveOwner(root) { return claimOwner(root, "archive"); }
async function claimOwner(root, namespace) {
  let canonical = await realpath(root);
  if (process.platform === "win32") canonical = canonical.toLowerCase();
  const key = createHash("sha256").update(namespace === "data" ? canonical : `archive:${canonical}`).digest("hex").slice(0, 32);
  const server = createServer((socket) => socket.destroy());
  // Windows 管道与 Linux 抽象 socket 不留陈旧文件；macOS 用 loopback 独占端口，
  // 哈希碰撞只会保守拒绝启动，不会放行双写。
  const address = process.platform === "win32" ? `\\\\.\\pipe\\axiom-data-${key}`
    : process.platform === "linux" ? `\0axiom-data-${key}`
      : { host: "127.0.0.1", port: 20000 + parseInt(key.slice(0, 8), 16) % 40000, exclusive: true };
  await new Promise((resolve, reject) => {
    server.once("error", (error) => reject(new Error(
      error.code === "EADDRINUSE" ? "数据目录已被其他 Axiom 实例占用，请先安全退出旧服务" : "无法确认数据目录独占权", { cause: error })));
    server.listen(address, resolve);
  });
  return () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
