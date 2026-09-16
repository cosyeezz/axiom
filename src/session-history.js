import { readFileSync } from "node:fs";
import { SessionManager, parseSessionEntries } from "@earendil-works/pi-coding-agent";

// 禁止 SessionManager.open：旧格式迁移或空文件初始化会改写磁盘。
export function readSessionHistory(file, cwd) {
  const entries = parseSessionEntries(readFileSync(file, "utf8"));
  if (!entries.some(entry => entry?.type === "session" && typeof entry.id === "string"))
    throw new Error("会话历史缺少有效头部，已保留原文件");
  const manager = SessionManager.inMemory(cwd, undefined, entries);
  return manager.getBranch().filter(entry => entry.type === "message");
}
