// 会话历史：一次全量下发（不分页）。
//
// 历史不再按窗口切页：上下文自动压缩已经把长会话折叠成压缩摘要卡，真实滚动范围有限，
// 而游标分页带来的上滚抖动、翻页后新消息丢失等不确定性远大于收益。
// 本模块只保留两件事：消息的稳定身份（前端按身份归位 live 流与折叠状态），
// 以及桌面运行时的只读 JSONL 投影。
import { randomUUID } from "node:crypto";

/** 稳定消息身份：优先 JSONL 的 entryId；没有就补一个 uuid 记在记录上（同进程内稳定）。 */
export const messageIdOf = (record) => record.entryId ?? (record.messageId ??= randomUUID());

/** 记录 → 线上形状（消息体不动，身份显式带出）。 */
export const toWireRecord = (record) => ({
  agentId: record.agentId,
  messageId: messageIdOf(record),
  ...(record.entryId ? { entryId: record.entryId } : {}),
  message: record.message,
});

// —— Desktop 运行时只读浏览：不持有 SessionManager 实例时的被动快照。——

import { readFileSync } from "node:fs";
import { SessionManager, parseSessionEntries } from "@earendil-works/pi-coding-agent";

// 禁止 SessionManager.open：旧格式迁移或空文件初始化会改写磁盘。
export function readSessionManager(file, cwd) {
  const entries = parseSessionEntries(readFileSync(file, "utf8"));
  if (!entries.some(entry => entry?.type === "session" && typeof entry.id === "string"))
    throw new Error("会话历史缺少有效头部，已保留原文件");
  return SessionManager.inMemory(cwd, undefined, entries);
}

export function readSessionHistory(file, cwd) {
  return readSessionManager(file, cwd).getBranch().filter(entry => entry.type === "message");
}
