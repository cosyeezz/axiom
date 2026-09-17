// 会话历史分页：稳定身份 + 不透明游标 + 定长窗口。
//
// 目标（长会话）：attach 只给最近一页，更早/更新的页按游标取；每页都是「轻元数据 + 本页消息」，
// 切页不 clone 全量历史。游标锚在稳定 messageId 上（不是下标：下标会被改写/重排打偏），
// 追加消息不改变游标语义；撤回/压缩换了历史内容才会失效——由 revision 判定。
//
// 游标语义：锚点是「边界之后的第一条消息」，前后两页共用它——
//   before: 游标 → 取该锚点之前的 size 条（更旧）；after: 游标 → 从该锚点开始取 size 条（更新）。
//
// 窗口预算按主轴记录（主对话）计：子代理记录不占预算，随其委派锚点整组进出窗口，
// 否则「最近 60 条」可能全是子代理记录，主对话首屏被挤空。调用方传入的数组
// 通常已按锚点重排（读时投影），本模块只负责在任意数组上按主轴预算切窗。
import { randomUUID } from "node:crypto";

// attach 首屏与每次翻页的主记录窗口长度上限。
export const HISTORY_PAGE_DEFAULT = 60;
export const HISTORY_PAGE_MAX = 200;
// 单页总记录上限：子代理记录成组跟随锚点，极端委派风暴下需要兜底，
// 超限从窗口左缘起裁子代理记录（永不裁主记录），并在 meta.truncatedTasks 标记。
// 主记录 ≤ limit ≤ HISTORY_PAGE_MAX(200) < 本值，裁剪必然能收敛。
export const HISTORY_PAGE_RECORDS_MAX = 400;

const CURSOR_VERSION = 2;

// 进程内单调递增：撤回/压缩/重建后 revision 必然变化，游标随之失效。
// 全局计数器（不从 0 起）保证同进程内重新加载会话也拿不到旧 revision。
let revisions = 0;
export const nextRevision = () => ++revisions;

/** 稳定消息身份：优先 JSONL 的 entryId；没有就补一个 uuid 记在记录上（同进程内稳定）。 */
export const messageIdOf = (record) => record.entryId ?? (record.messageId ??= randomUUID());

export function createHistory(sessionId) {
  return { sessionId, revision: nextRevision() };
}

/** 历史内容变了（撤回/重放/压缩重建）：换修订号，游标随之失效。 */
export function touchHistory(history) {
  history.revision = nextRevision();
  return history.revision;
}

const fail = (message) => {
  throw new Error(message);
};

function resolveLimit(limit) {
  if (limit === undefined || limit === null) return HISTORY_PAGE_DEFAULT;
  if (!Number.isSafeInteger(limit) || limit < 1) fail("历史分页数量必须是正整数");
  if (limit > HISTORY_PAGE_MAX) fail(`历史分页数量不能超过 ${HISTORY_PAGE_MAX}`);
  return limit;
}

const encodeCursor = ({ sessionId, epoch, revision, messageId }) =>
  Buffer.from(JSON.stringify({ v: CURSOR_VERSION, s: sessionId, e: epoch ?? null, r: revision, m: messageId })).toString("base64url");

function decodeCursor(text) {
  let value;
  try {
    value = JSON.parse(Buffer.from(String(text), "base64url").toString("utf8"));
  } catch {
    fail("历史游标无效，请重新打开会话");
  }
  const valid =
    value && typeof value === "object" && value.v === CURSOR_VERSION && typeof value.s === "string" &&
    Number.isSafeInteger(value.r) && value.r >= 0 && typeof value.m === "string" && value.m.length > 0;
  if (!valid) fail("历史游标无效，请重新打开会话");
  return value;
}

/** 校验游标归属并解出边界消息 id；任一维不符都显式报错，绝不悄悄回退到别的页。 */
export function bindCursor({ sessionId, epoch, revision }, cursor) {
  const value = decodeCursor(cursor);
  if (value.s !== sessionId) fail("历史游标不属于该会话");
  if ((value.e ?? null) !== (epoch ?? null)) fail("历史游标来自其他服务实例，请重新打开会话");
  if (value.r !== revision) fail("历史已变更（撤回或压缩），请重新打开会话");
  return value.m;
}

/** 记录 → 线上形状（消息体不动，身份显式带出）。 */
export const toPageRecord = (record) => ({
  agentId: record.agentId,
  messageId: messageIdOf(record),
  ...(record.entryId ? { entryId: record.entryId } : {}),
  message: record.message,
});

/**
 * 在全局顺序（主代理与子任务同一条时间线）上切一页，返回本页记录与窗口元信息。
 * attach = edge "last"；更旧 = before 游标；更新 = after 游标；定位 = target(entryId|messageId)。
 * 窗口预算按主轴记录计；全主记录数组上与按记录数取窗逐条等价。
 */
export function pageOf(records, history, { sessionId, epoch, edge, before, after, target, limit } = {}) {
  const size = resolveLimit(limit);
  if (before != null && after != null) fail("before 与 after 不能同时使用");
  if ((before != null || after != null) && target != null) fail("定位 target 时不能再带游标");
  if (edge != null && (before != null || after != null || target != null)) fail("edge 不能与游标或 target 同时使用");
  if (edge != null && !["first", "last"].includes(edge)) fail("历史分页定位无效");

  const total = records.length;
  const cursorOf = (index) => encodeCursor({ sessionId, epoch, revision: history.revision, messageId: messageIdOf(records[index]) });
  // 每次调用重建身份索引：调用方可能传入按需重排产生的新数组（读时投影），
  // 增量索引的「同一数组追加」假设不再成立；翻页是用户驱动的低频请求，O(n) 无碍。
  const ids = new Map(records.map((record, index) => [messageIdOf(record), index]));
  // 锚点必须能在当前历史里找到：找不到说明历史被换过（下标已不可信），报错而不是猜位置。
  const boundaryOf = (cursor) => {
    const index = ids.get(bindCursor({ sessionId, epoch, revision: history.revision }, cursor));
    if (index === undefined) fail("历史游标已失效，请重新打开会话");
    return index;
  };
  // 主轴记录下标表 + 二分求秩：rank = 数组中第 rank 条主记录；lowerBound(i) = i 之前的主记录数。
  const isMain = (record) => (record.agentId ?? "main") === "main";
  const mains = [];
  for (let index = 0; index < total; index++) if (isMain(records[index])) mains.push(index);
  const lowerBound = (index) => {
    let lo = 0, hi = mains.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (mains[mid] < index) lo = mid + 1; else hi = mid; }
    return lo;
  };
  // 窗口边界一律落在主记录上（边界锚点两侧的组保持完整）：
  //   start：预算内最早主记录（延伸到数组头则含头部孤儿子记录）；end：预算外第一条主记录（或数组尾）。
  const startFrom = (rank) => (rank > 0 ? mains[rank] : 0);
  const endAt = (rank) => (rank < mains.length ? mains[rank] : total);
  let start;
  let end;
  if (target != null) {
    const index = ids.get(target);
    if (index === undefined) fail("找不到历史定位消息");
    // 定位到包含目标的主轴段：目标若是子代理记录，从它向前归到所属锚点。
    const anchorRank = Math.max(0, lowerBound(index + 1) - 1);
    start = startFrom(anchorRank);
    end = endAt(anchorRank + size);
  } else if (before != null) {
    // 边界为排他上界：窗口覆盖边界之前的 size 条主记录（含边界前锚点的完整子组）。
    const boundary = Math.max(0, Math.min(total, boundaryOf(before)));
    const rank = lowerBound(boundary);
    start = startFrom(Math.max(0, rank - size));
    end = boundary;
  } else if (after != null) {
    const boundary = Math.min(total, boundaryOf(after));
    // 从边界锚点起取：边界若落在子组中间（外部游标才会发生），向前吸附到下一条主记录。
    const rank = lowerBound(boundary);
    start = rank < mains.length ? mains[rank] : total;
    end = endAt(rank + size);
  } else if (edge === "first") {
    start = 0;
    end = endAt(size);
  } else {
    end = total;
    start = startFrom(Math.max(0, mains.length - size));
  }
  // 单页记录上限：从窗口左缘起裁子代理记录（优先裁更旧的），永不裁主记录。
  // 被裁记录无法通过翻页找回（页间隙），由 meta.truncatedTasks 向前端声明。
  let truncatedTasks;
  let page = records;
  if (end - start > HISTORY_PAGE_RECORDS_MAX) {
    const dropped = new Set();
    for (let index = start; index < end && end - start - dropped.size > HISTORY_PAGE_RECORDS_MAX; index++)
      if (!isMain(records[index])) dropped.add(index);
    page = records.filter((_, index) => index >= start && index < end && !dropped.has(index));
    truncatedTasks = [...new Set([...dropped].map((index) => records[index].agentId))];
  } else {
    page = records.slice(start, end);
  }
  return {
    records: page,
    meta: {
      instanceId: epoch ?? null,
      revision: history.revision,
      total,
      start,
      end,
      limit: size,
      ...(truncatedTasks?.length ? { truncatedTasks } : {}),
      // prev = 更旧（before）；next = 更新（after）。两者锚在同一条边界消息上：
      // 本页首条（start>0）就是上一页的「之后」，本页末尾的下一条（end<total）就是下一页的「之前」。
      // start=total 是「边界之后的空页」退化情形，不再提供更旧方向。
      prevCursor: start > 0 && start < total ? cursorOf(start) : null,
      nextCursor: end < total ? cursorOf(end) : null,
    },
  };
}

// —— Desktop 运行时只读浏览：不持有 SessionManager 实例时的被动快照。——

//（桌面运行时无 SessionManager 实例，按文件路径只读；新增 import 放底部是为了读代码时
// 先看到分页核心。样式无碍，Node ESM 会提升 import。）
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